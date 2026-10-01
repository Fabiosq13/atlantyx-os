import { comGuarda } from '../lib/qa-guard.js';
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

// v3.14: ORÇAMENTO DE TEMPO. O PNCP é lento; somando consultas + IA + conferência a função
// passava do limite da Vercel e a tela recebia "sem resposta". Agora tudo respeita um prazo total
// e, se algo não couber, a resposta sai com o que já foi obtido (nunca inventado).
let _prazo = 0;
const restante = () => _prazo - Date.now();
async function lerCache() { try { const { neon } = await import('@neondatabase/serverless'); const sql = neon(process.env.DATABASE_URL); const r = await sql`SELECT value, updated_at FROM kv_store WHERE key = 'rfp:ultima_varredura' LIMIT 1`; if (!r[0]) return null; const v = typeof r[0].value === 'string' ? JSON.parse(r[0].value) : r[0].value; return { ...v, cache_em: r[0].updated_at }; } catch (_) { return null; } }
async function gravarCache(v) { try { const { neon } = await import('@neondatabase/serverless'); const sql = neon(process.env.DATABASE_URL); await sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('rfp:ultima_varredura', ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; } catch (_) {} }

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.method === 'POST' ? (req.body || {}) : {};
    // v3.25: envia a lista de editais por e-mail (a da tela ou a última varredura guardada)
    if (body.acao === 'enviar_email') return res.status(200).json({ success: true, ...(await enviarListaEmail(body)) });
    // v3.14: a tela pode pedir só a última varredura guardada (abre instantâneo)
    if (body.somente_cache) { const c = await lerCache(); return res.status(200).json(c ? { success: true, do_cache: true, ...c } : { success: true, do_cache: true, rfps: [], aviso: 'Ainda não há varredura guardada — clique em "Varrer RFPs Agora".' }); }
    _prazo = Date.now() + 48000;
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
      if (falhou) { const c = await lerCache(); if (c?.rfps?.length) return res.status(200).json({ ...c, success: true, do_cache: true, fontes,
        aviso: 'O PNCP não respondeu agora (' + [fontes.busca_pncp.erro, fontes.api_consulta_pncp.erro].filter(Boolean).join(' · ') + '). Mostrando a última varredura bem-sucedida, de ' + new Date(c.cache_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '.' }); }
      return res.status(200).json({
        success: true, rfps: [], fontes, total_encontrado: 0, total_relevante: 0,
        data_consulta: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        aviso: falhou
          ? 'O PNCP não respondeu agora (' + [fontes.busca_pncp.erro, fontes.api_consulta_pncp.erro].filter(Boolean).join(' · ') + '). Nenhum edital é inventado — tente novamente em alguns minutos.'
          : 'Nenhum edital com propostas em aberto no PNCP para as palavras-chave de BI/Dados/IA neste momento.',
      });
    }

    // 2. Pré-seleção por aderência de palavras-chave e prazo
    const pre = todos.map(e => ({ ...e, _score: scoreKeywords(e, keywords) })).sort((a, b) => b._score - a._score || (a.prazo || '').localeCompare(b.prazo || '')).slice(0, 18);

    // 3. IA avalia (sem criar dados)
    let avaliados = restante() > 14000 ? await avaliarComClaude(pre, body.setor).catch(e => { console.warn('[S2-04] avaliação IA:', e.message); return null; }) : null;
    if (!avaliados) avaliados = pre.map(e => ({ ...e, compatibilidade: Math.min(90, 40 + e._score * 10), urgencia: urgenciaPorPrazo(e.prazo), justificativa: 'Selecionado por palavra-chave (análise por IA indisponível no momento).', acoes_sugeridas: [] }));
    let relevantes = avaliados.filter(e => e.compatibilidade >= 40).sort((a, b) => b.compatibilidade - a.compatibilidade).slice(0, 12);
    if (!relevantes.length) relevantes = avaliados.slice(0, 3);

    // 4. Conferência na API oficial (existência + link do portal de origem)
    if (restante() > 5000) await Promise.all(relevantes.map(conferirNaApiOficial));

    const rfps = relevantes.map(formatarSaida);

    // 5. WhatsApp só para editais reais e aderentes (cron)
    if (isCron && process.env.ZAPI_INSTANCE) for (const r of rfps.filter(r => r.compatibilidade >= 75).slice(0, 3)) await notificarWhatsApp(r);

    const saida = {
      success: true,
      fonte: 'PNCP — Portal Nacional de Contratações Públicas (dados reais)',
      data_consulta: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      fontes, total_encontrado: todos.length, total_relevante: rfps.length, rfps,
    };
    if (rfps.length) await gravarCache(saida);
    return res.status(200).json(saida);
  } catch (error) {
    console.error('[ERRO rfp-monitor]', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ── utilidades ────────────────────────────────────────────────────────────
const inicioDoDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
async function getJSON(url, ms = 9000) {
  const lim = Math.max(1500, Math.min(ms, (_prazo ? restante() - 1000 : ms)));
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), lim);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Atlantyx-OS/1.0 (monitor de editais)' }, signal: ac.signal });
    if (r.status === 204) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { if (e.name === 'AbortError') throw new Error('PNCP não respondeu em ' + Math.round(lim / 1000) + 's'); throw e; }
  finally { clearTimeout(t); }
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
  await Promise.all(keywords.slice(0, 6).map(async kw => {
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
  const modalidades = [6, 4, 2, 10]; // pregão/concorrência eletr., diálogo competitivo, manifestação de interesse, presenciais, pré-qualificação, credenciamento
  const alvo = keywords.map(norm);
  const out = []; let erros = 0, ultimoErro = null;
  await Promise.all(modalidades.flatMap(mod => [1, 2].map(async pagina => {
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
  if (!out.length && erros >= 4) throw new Error('API de consulta: ' + ultimoErro);
  return out;
}

// ── Conferência do edital na API oficial ──────────────────────────────────
async function conferirNaApiOficial(e) {
  if (!e.cnpj || !e.ano || !e.seq) { e.verificado = false; return; }
  try {
    const c = await getJSON(`${PNCP}/api/consulta/v1/orgaos/${e.cnpj}/compras/${e.ano}/${Number(e.seq)}`, 5000);
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
  const itens = lista.map((e, i) => ({ index: i, orgao: e.orgao, uf: e.uf, modalidade: e.modalidade, valor_estimado: e.valor, prazo_propostas: e.prazo, objeto: String(e.objeto).substring(0, 400) }));
  const acIA = new AbortController(); const tIA = setTimeout(() => acIA.abort(), Math.max(5000, restante() - 7000));
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: acIA.signal, headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2500,
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
  const d = await r.json(); clearTimeout(tIA);
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


// ═══ v3.25: lista de RFPs por e-mail ═══
async function enviarListaEmail({ para, assunto, mensagem, rfps } = {}) {
  const dest = String(para || '').split(/[;,\s]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (!dest.length) throw new Error('Informe ao menos um e-mail válido');
  let lista = Array.isArray(rfps) && rfps.length ? rfps : ((await lerCache())?.rfps || []);
  if (!lista.length) throw new Error('Nenhum edital para enviar — rode a varredura primeiro');
  lista = lista.slice(0, 60);
  const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('E-mail de envio não configurado (EMAIL_SMTP_USER / EMAIL_SMTP_PASS no Vercel)');
  const dom = String(user).split('@')[1] || '';
  const host = process.env.EMAIL_SMTP_HOST || (/gmail\.com$/i.test(dom) ? 'smtp.gmail.com' : (dom ? 'mail.' + dom : 'smtp.gmail.com'));
  const port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
  const nodemailer = (await import('nodemailer')).default;
  const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 20000, ...(process.env.EMAIL_SMTP_TLS_RELAXADO === '1' ? { tls: { rejectUnauthorized: false } } : {}) });
  const e = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const linhas = lista.map((r, i) => `<tr style="border-bottom:1px solid #e5e7ef;">
    <td style="padding:8px 6px;vertical-align:top;color:#5a6478;">${i + 1}</td>
    <td style="padding:8px 6px;vertical-align:top;"><a href="${e(r.link_acesso || r.link_pncp)}" style="color:#1A3A8F;font-weight:700;text-decoration:none;">${e(r.nome_edital || r.titulo)}</a><br>
      <span style="color:#333;">${e(r.empresa)}${r.uf ? ' · ' + e(r.municipio ? r.municipio + '/' : '') + e(r.uf) : ''}</span><br>
      <span style="color:#5a6478;font-size:12px;">${e(String(r.descricao || r.titulo || '').substring(0, 220))}</span></td>
    <td style="padding:8px 6px;vertical-align:top;white-space:nowrap;">${e(r.valor || '—')}</td>
    <td style="padding:8px 6px;vertical-align:top;white-space:nowrap;color:#A16207;font-weight:700;">${e(r.prazo_submissao || r.prazo || '—')}</td>
    <td style="padding:8px 6px;vertical-align:top;white-space:nowrap;">${r.compatibilidade != null ? e(r.compatibilidade) + '%' : '—'}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:900px;">
    <div style="color:#00708A;font-weight:700;letter-spacing:2px;font-size:12px;">ATLANTYX · MONITOR DE RFPs</div>
    <h2 style="color:#0F2660;margin:6px 0 4px;">${e(assunto || 'Editais abertos — ' + hoje)}</h2>
    ${mensagem ? `<p style="font-size:14px;color:#333;">${e(mensagem).replace(/\n/g, '<br>')}</p>` : ''}
    <p style="font-size:12px;color:#5a6478;">${lista.length} edital(is) do PNCP, ordenados por aderência. Clique no nome para abrir o edital.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;"><thead><tr style="background:#F4F5F7;text-align:left;">
      <th style="padding:8px 6px;">#</th><th style="padding:8px 6px;">Edital / órgão</th><th style="padding:8px 6px;">Valor estimado</th><th style="padding:8px 6px;">Propostas até</th><th style="padding:8px 6px;">Aderência</th></tr></thead>
      <tbody>${linhas}</tbody></table>
    <p style="font-size:11px;color:#8a93a8;margin-top:14px;">Fonte: Portal Nacional de Contratações Públicas (PNCP) · enviado pelo Atlantyx OS em ${hoje}.</p></div>`;
  const info = await t.sendMail({ from: `Atlantyx OS <${user}>`, to: dest.join(', '), subject: assunto || `Editais abertos (${lista.length}) — ${hoje}`, html });
  return { enviado: true, para: dest, total: lista.length, id: info.messageId, aceitos: info.accepted };
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler);
