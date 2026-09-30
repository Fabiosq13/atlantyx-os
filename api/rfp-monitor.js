// api/rfp-monitor.js — v3.11
// S2-01 + S2-04 — Monitor de RFPs/editais REAIS
//
// IMPORTANTE (v3.11): até a v3.10, quando a consulta ao PNCP não trazia resultados, o agente
// pedia à IA para "gerar licitações realistas e plausíveis" — os editais mostrados (órgão, valor,
// prazo, decisor) eram INVENTADOS. Isso foi removido. Agora:
//   • só entram editais que existem no PNCP (Portal Nacional de Contratações Públicas);
//   • cada edital traz a ORIGEM (fonte, nº de controle PNCP, órgão/CNPJ) e os LINKS:
//     página do edital no PNCP e o portal de origem onde a proposta é enviada;
//   • a IA apenas AVALIA a aderência dos editais reais — não cria nem altera órgão, valor, prazo ou link;
//   • se nada for encontrado, a resposta diz isso (com o motivo), em vez de preencher a lista.
//
// Fontes:
//   1) Busca do portal PNCP (a mesma da tela pncp.gov.br/app/editais) — permite palavra-chave
//   2) API oficial de consulta: /api/consulta/v1/contratacoes/proposta (propostas em aberto),
//      filtrada por palavra-chave no objeto da contratação
//   Cada edital selecionado é conferido na API oficial (/v1/orgaos/{cnpj}/compras/{ano}/{seq}).

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const PNCP = 'https://pncp.gov.br';
const KEYWORDS_PADRAO = ['business intelligence', 'inteligência artificial', 'ciência de dados', 'engenharia de dados', 'data warehouse', 'analytics', 'painéis gerenciais', 'integração de dados', 'plataforma de dados', 'big data', 'power bi', 'machine learning'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.method === 'POST' ? (req.body || {}) : {};
    const isCron = !!(process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`);
    const keywords = (Array.isArray(body.palavras_chave) && body.palavras_chave.length ? body.palavras_chave : KEYWORDS_PADRAO).map(String);

    // 1. Buscar editais reais (duas fontes em paralelo)
    const [busca, consulta] = await Promise.allSettled([buscarPNCPSearch(keywords), buscarPNCPConsulta(keywords)]);
    const fontes = {
      busca_pncp: busca.status === 'fulfilled' ? { ok: true, encontrados: busca.value.length } : { ok: false, erro: busca.reason?.message },
      api_consulta_pncp: consulta.status === 'fulfilled' ? { ok: true, encontrados: consulta.value.length } : { ok: false, erro: consulta.reason?.message },
    };
    const todos = dedupe([...(busca.value || []), ...(consulta.value || [])]).filter(e => !e.prazo || new Date(e.prazo) >= inicioDoDia());

    if (!todos.length) {
      const falhou = !fontes.busca_pncp.ok && !fontes.api_consulta_pncp.ok;
      return res.status(200).json({
        success: true, rfps: [], fontes, total_encontrado: 0, total_relevante: 0,
        data_consulta: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        aviso: falhou
          ? 'O PNCP não respondeu agora (' + [fontes.busca_pncp.erro, fontes.api_consulta_pncp.erro].filter(Boolean).join(' · ') + '). Nenhum edital é inventado — tente novamente em alguns minutos.'
          : 'Nenhum edital com propostas em aberto no PNCP para as palavras-chave de BI/Dados/IA neste momento.',
      });
    }

    // 2. Pré-seleção por aderência de palavras-chave e prazo
    const pre = todos.map(e => ({ ...e, _score: scoreKeywords(e, keywords) })).sort((a, b) => b._score - a._score || (a.prazo || '').localeCompare(b.prazo || '')).slice(0, 25);

    // 3. IA avalia (sem criar dados)
    let avaliados = await avaliarComClaude(pre, body.setor).catch(e => { console.warn('[S2-04] avaliação IA:', e.message); return null; });
    if (!avaliados) avaliados = pre.map(e => ({ ...e, compatibilidade: Math.min(90, 40 + e._score * 10), urgencia: urgenciaPorPrazo(e.prazo), justificativa: 'Selecionado por palavra-chave (análise por IA indisponível no momento).', acoes_sugeridas: [] }));
    let relevantes = avaliados.filter(e => e.compatibilidade >= 40).sort((a, b) => b.compatibilidade - a.compatibilidade).slice(0, 12);
    if (!relevantes.length) relevantes = avaliados.slice(0, 3);

    // 4. Conferência na API oficial (existência + link do portal de origem)
    await Promise.all(relevantes.map(conferirNaApiOficial));

    const rfps = relevantes.map(formatarSaida);

    // 5. WhatsApp só para editais reais e aderentes (cron)
    if (isCron && process.env.ZAPI_INSTANCE) for (const r of rfps.filter(r => r.compatibilidade >= 75).slice(0, 3)) await notificarWhatsApp(r);

    return res.status(200).json({
      success: true,
      fonte: 'PNCP — Portal Nacional de Contratações Públicas (dados reais)',
      data_consulta: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      fontes, total_encontrado: todos.length, total_relevante: rfps.length, rfps,
    });
  } catch (error) {
    console.error('[ERRO rfp-monitor]', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── utilidades ────────────────────────────────────────────────────────────
const inicioDoDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
async function getJSON(url, ms = 12000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Atlantyx-OS/1.0 (monitor de editais)' }, signal: ac.signal });
    if (r.status === 204) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
// "00394445000166-1-000123/2025" → { cnpj, ano, seq }
function partesControle(num) {
  const m = String(num || '').match(/^(\d{14})-\d+-0*(\d+)\/(\d{4})$/);
  return m ? { cnpj: m[1], seq: m[2], ano: m[3] } : null;
}
const linkPNCP = (cnpj, ano, seq) => (cnpj && ano && seq) ? `${PNCP}/app/editais/${cnpj}/${ano}/${Number(seq)}` : null;
function dedupe(lista) {
  const m = new Map();
  for (const e of lista) { const k = e.numero_pncp || `${e.cnpj}/${e.ano}/${e.seq}`; if (!m.has(k)) m.set(k, e); else m.set(k, { ...e, ...m.get(k), link_origem: m.get(k).link_origem || e.link_origem }); }
  return [...m.values()];
}
function scoreKeywords(e, kws) {
  const t = norm(e.objeto + ' ' + (e.info || ''));
  return kws.reduce((s, k) => s + (t.includes(norm(k)) ? 1 : 0), 0) + (/\b(bi|dados|dashboard|analitic|inteligencia artificial|ia)\b/.test(t) ? 0.5 : 0);
}
function urgenciaPorPrazo(p) { if (!p) return 'Media'; const d = (new Date(p) - Date.now()) / 86400000; return d <= 7 ? 'Alta' : d <= 20 ? 'Media' : 'Baixa'; }

// ── Fonte 1: busca do portal PNCP (palavra-chave) ─────────────────────────
async function buscarPNCPSearch(keywords) {
  const out = []; let erros = 0, ultimoErro = null;
  await Promise.all(keywords.slice(0, 8).map(async kw => {
    try {
      const url = `${PNCP}/api/search/?q=${encodeURIComponent(kw)}&tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=20&status=recebendo_proposta`;
      const d = await getJSON(url);
      for (const it of (d?.items || [])) {
        const pc = partesControle(it.numero_controle_pncp);
        const u = String(it.item_url || '').match(/\/compras\/(\d{14})\/(\d{4})\/(\d+)/);
        const cnpj = it.orgao_cnpj || pc?.cnpj || u?.[1], ano = String(it.ano || pc?.ano || u?.[2] || ''), seq = String(it.numero_sequencial || pc?.seq || u?.[3] || '');
        out.push({ fonte: 'PNCP — busca de editais', numero_pncp: it.numero_controle_pncp || null, cnpj, ano, seq,
          orgao: it.orgao_nome || it.unidade_nome || '', unidade: it.unidade_nome || '', uf: it.uf || '', municipio: it.municipio_nome || '',
          objeto: it.description || it.title || '', titulo_original: it.title || '', modalidade: it.modalidade_licitacao_nome || '',
          valor: it.valor_global ?? null, prazo: it.data_fim_vigencia || null, publicado_em: it.data_publicacao_pncp || null,
          link_pncp: linkPNCP(cnpj, ano, seq), link_origem: null, keyword: kw });
      }
    } catch (e) { erros++; ultimoErro = e.message; }
  }));
  if (!out.length && erros) throw new Error('busca PNCP: ' + ultimoErro);
  return out;
}

// ── Fonte 2: API oficial de consulta (propostas em aberto) + filtro local ─
async function buscarPNCPConsulta(keywords) {
  const dataFinal = ymd(new Date(Date.now() + 120 * 86400000));
  const modalidades = [6, 4, 2, 10, 5, 7, 11, 12]; // pregão/concorrência eletr., diálogo competitivo, manifestação de interesse, presenciais, pré-qualificação, credenciamento
  const alvo = keywords.map(norm);
  const out = []; let erros = 0, ultimoErro = null;
  await Promise.all(modalidades.flatMap(mod => [1, 2, 3].map(async pagina => {
    if (pagina > 1 && ![6, 4].includes(mod)) return;
    try {
      const d = await getJSON(`${PNCP}/api/consulta/v1/contratacoes/proposta?dataFinal=${dataFinal}&codigoModalidadeContratacao=${mod}&pagina=${pagina}&tamanhoPagina=50`);
      for (const c of (d?.data || [])) {
        const texto = norm((c.objetoCompra || '') + ' ' + (c.informacaoComplementar || ''));
        const kw = alvo.find(k => texto.includes(k)); if (!kw) continue;
        const cnpj = c.orgaoEntidade?.cnpj, ano = String(c.anoCompra || ''), seq = String(c.sequencialCompra || '');
        out.push({ fonte: 'PNCP — API de consulta oficial', numero_pncp: c.numeroControlePNCP || null, cnpj, ano, seq,
          orgao: c.orgaoEntidade?.razaoSocial || '', unidade: c.unidadeOrgao?.nomeUnidade || '', uf: c.unidadeOrgao?.ufSigla || '', municipio: c.unidadeOrgao?.municipioNome || '',
          objeto: c.objetoCompra || '', info: c.informacaoComplementar || '', modalidade: c.modalidadeNome || '', numero_compra: c.numeroCompra || '', processo: c.processo || '',
          valor: c.valorTotalEstimado ?? null, prazo: c.dataEncerramentoProposta || null, abertura: c.dataAberturaProposta || null, publicado_em: c.dataPublicacaoPncp || null,
          link_pncp: linkPNCP(cnpj, ano, seq), link_origem: c.linkSistemaOrigem || null, keyword: kw });
      }
    } catch (e) { erros++; ultimoErro = e.message; }
  })));
  if (!out.length && erros >= 8) throw new Error('API de consulta: ' + ultimoErro);
  return out;
}

// ── Conferência do edital na API oficial ──────────────────────────────────
async function conferirNaApiOficial(e) {
  if (!e.cnpj || !e.ano || !e.seq) { e.verificado = false; return; }
  try {
    const c = await getJSON(`${PNCP}/api/consulta/v1/orgaos/${e.cnpj}/compras/${e.ano}/${Number(e.seq)}`, 8000);
    if (!c) { e.verificado = false; return; }
    e.verificado = true;
    e.link_origem = e.link_origem || c.linkSistemaOrigem || null;
    e.numero_pncp = e.numero_pncp || c.numeroControlePNCP || null;
    if (e.valor == null && c.valorTotalEstimado != null) e.valor = c.valorTotalEstimado;
    if (c.dataEncerramentoProposta) e.prazo = c.dataEncerramentoProposta;
    if (!e.modalidade && c.modalidadeNome) e.modalidade = c.modalidadeNome;
    if (!e.orgao && c.orgaoEntidade?.razaoSocial) e.orgao = c.orgaoEntidade.razaoSocial;
    e.numero_compra = e.numero_compra || c.numeroCompra || ''; e.processo = e.processo || c.processo || '';
    e.situacao = c.situacaoCompraNome || '';
  } catch (_) { e.verificado = null; }
}

// ── IA: só avalia aderência (não cria dados) ──────────────────────────────
async function avaliarComClaude(lista, setor) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const itens = lista.map((e, i) => ({ index: i, orgao: e.orgao, uf: e.uf, modalidade: e.modalidade, valor_estimado: e.valor, prazo_propostas: e.prazo, objeto: String(e.objeto).substring(0, 700) }));
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000,
      system: `Você é o Agente S2-04 da Atlantyx (BI, Engenharia de Dados, Analytics, IA, Dashboards, Integração de Sistemas; ticket mínimo R$200 mil; clientes de grande porte).
Você recebe editais REAIS do PNCP. Sua tarefa é SOMENTE avaliar a aderência de cada um à Atlantyx.
Regras: não invente nem altere órgão, valor, prazo, número ou link — esses dados vêm da fonte oficial. Não crie editais novos. Use apenas os índices recebidos.
Responda APENAS com um array JSON.`,
      messages: [{ role: 'user', content: `Setor foco: ${setor || 'todos'}
Editais (reais, do PNCP):
${JSON.stringify(itens)}

Para CADA edital, devolva:
{"index": n, "compatibilidade": 0-100, "urgencia": "Alta|Media|Baixa", "titulo": "objeto resumido em uma linha (fiel ao texto)", "justificativa": "por que é ou não aderente, citando o objeto", "decisor_provavel": "cargo que normalmente conduz este tipo de contratação", "acoes_sugeridas": ["ação 1", "ação 2"]}` }],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Erro Claude');
  const text = (d.content || []).map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
  let arr; try { arr = JSON.parse(text); } catch (_) { const m = text.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : null; }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const a of arr) {
    const e = lista[Number(a.index)]; if (!e) continue; // índice inexistente → descartado (nada é criado)
    out.push({ ...e, compatibilidade: Math.max(0, Math.min(100, Number(a.compatibilidade) || 0)), urgencia: ['Alta', 'Media', 'Baixa'].includes(a.urgencia) ? a.urgencia : urgenciaPorPrazo(e.prazo),
      titulo_ia: String(a.titulo || '').substring(0, 200), justificativa: String(a.justificativa || ''), decisor_provavel: String(a.decisor_provavel || ''), acoes_sugeridas: Array.isArray(a.acoes_sugeridas) ? a.acoes_sugeridas.map(String).slice(0, 4) : [] });
  }
  return out.length ? out : null;
}

// v3.12: nome oficial do edital (como aparece no PNCP/portal) e link de acesso sempre presente
function nomeEdital(e) {
  const t = String(e.titulo_original || '').trim();
  if (t && /\d/.test(t)) return t; // ex.: "Pregão Eletrônico nº 90007/2026" vindo do portal
  const num = e.numero_compra ? ' nº ' + e.numero_compra : (e.seq && e.ano ? ' nº ' + Number(e.seq) + '/' + e.ano : '');
  return ((e.modalidade || 'Edital') + num + (e.orgao ? ' — ' + e.orgao : '')).trim();
}
function linkAcesso(e) {
  return e.link_pncp || e.link_origem || (e.numero_pncp ? `${PNCP}/app/editais?q=${encodeURIComponent(e.numero_pncp)}` : `${PNCP}/app/editais?q=${encodeURIComponent(String(e.objeto || '').substring(0, 80))}&status=recebendo_proposta`);
}
function formatarSaida(e) {
  const brl = v => v == null || isNaN(Number(v)) ? 'Não informado no edital' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const data = v => { if (!v) return 'Não informado'; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  return {
    empresa: e.orgao || 'Órgão não informado', orgao_cnpj: e.cnpj || '', unidade: e.unidade || '', uf: e.uf || '', municipio: e.municipio || '',
    titulo: e.titulo_ia || String(e.titulo_original || e.objeto).substring(0, 160), descricao: String(e.objeto || '').substring(0, 600),
    valor: brl(e.valor), valor_num: e.valor ?? null, prazo_submissao: data(e.prazo), prazo_iso: e.prazo || null, abertura: e.abertura ? data(e.abertura) : null,
    modalidade: e.modalidade || '', numero_compra: e.numero_compra || '', processo: e.processo || '', situacao: e.situacao || '',
    compatibilidade: e.compatibilidade, urgencia: e.urgencia, justificativa: e.justificativa, decisor_provavel: e.decisor_provavel, acoes_sugeridas: e.acoes_sugeridas || [],
    // ORIGEM
    nome_edital: nomeEdital(e), link_acesso: linkAcesso(e),
    fonte: e.fonte, portal: 'PNCP', numero_pncp: e.numero_pncp || '', link_pncp: e.link_pncp || linkAcesso(e), link_origem: e.link_origem || null,
    verificado: e.verificado === true, palavra_chave: e.keyword || '', publicado_em: e.publicado_em ? data(e.publicado_em) : null,
  };
}

async function notificarWhatsApp(rfp) {
  if (!process.env.FUNDADOR_WHATSAPP || !process.env.ZAPI_INSTANCE) return;
  const msg = `[S2-04 · Edital real — PNCP]\n\n${rfp.nome_edital}\n${rfp.empresa} (${rfp.uf})\n${rfp.titulo}\n\nValor estimado: ${rfp.valor}\nPropostas até: ${rfp.prazo_submissao}\nAderência: ${rfp.compatibilidade}%\nNº PNCP: ${rfp.numero_pncp}\n\n${rfp.justificativa}\n\nAcesso ao edital: ${rfp.link_acesso}${rfp.link_origem ? '\nEnvio da proposta: ' + rfp.link_origem : ''}`;
  try {
    await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone: process.env.FUNDADOR_WHATSAPP, message: msg }),
    });
  } catch (e) { console.log('[WA]', e.message); }
}

export { partesControle, linkPNCP, formatarSaida };
