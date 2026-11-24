// lib/atlas-itens.js — v3.564 · O que o ATLAS cria por assunto (agente, relatório, análise, tela)
// Nasce PRIVADO ("rascunho") → "em teste" → "publicado no assunto". Tudo no kv_store (chave 'atlas:itens'), sem tabela nova.
// Travas: (1) nunca dado real de cliente em texto/teste/exemplo; (2) registro de quem pediu, o que o ATLAS fez e o que mudou (com desfazer);
// (3) cada assunto tem dono que aprova — o CEO aprova todos. O ATLAS só PROPÕE: nada de código/URL vindo da IA é executado aqui;
// e-mail e cobrança são só rascunho; anúncio pago nasce PAUSADO; "tela" vira pedido na Esteira de Demandas (revisão do fundador).
import crypto from 'crypto';
let _sql = null;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  return _sql;
}
const K = 'atlas:itens', MAX = 500;
export const ASSUNTOS = {
  comercial: 'Comercial', vendas: 'Vendas', marketing: 'Marketing', financeiro: 'Financeiro', projetos: 'Projetos', estrategia: 'Estratégia', integracoes: 'Integrações',
  pessoas: 'Pessoas', juridico: 'Jurídico', dados: 'Dados', produtos: 'Produtos',
  atendimento: 'Atendimento', desenvolvimento: 'Desenvolvimento e QA', email: 'E-mail Intel', dashboards: 'Dashboards'   // v3.578: todas as áreas de atuação do menu do Atlantyx OS
};
export const TIPOS = { agente: 'Agente', relatorio: 'Relatório', analise: 'Análise', tela: 'Tela' };
export const PASTA = { agente: 'Agentes', relatorio: 'Relatórios', analise: 'Análises', tela: 'Telas' };
const ESTADOS = ['rascunho', 'teste', 'publicado', 'descartado'];
const txt = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim().substring(0, n);
const agora = () => new Date().toISOString();
const erro = (m, status = 400) => Object.assign(new Error(m), { status });

async function ler() {
  if (globalThis.__ATLAS_MEM) return globalThis.__ATLAS_MEM.v; // só nos testes
  const s = await db(); if (!s) return [];
  const r = (await s`SELECT value FROM kv_store WHERE key=${K}`)[0]; if (!r) return [];
  try { const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; return Array.isArray(v) ? v : []; } catch (_) { return []; }
}
async function gravar(L) {
  if (globalThis.__ATLAS_MEM) { globalThis.__ATLAS_MEM.v = L.slice(0, MAX); return; }
  const s = await db(); if (!s) throw erro('Banco indisponível', 503);
  await s`INSERT INTO kv_store (key, value, updated_at) VALUES (${K}, ${JSON.stringify(L.slice(0, MAX))}, NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`;
}

// Dono que aprova agente/tela: ATLAS_DONOS="marketing:ana,financeiro:bia". O CEO (perfil administrador) aprova todos.
export function podeAprovar(assunto, login, admin) {
  if (admin) return true;
  const m = String(process.env.ATLAS_DONOS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return m.includes(`${assunto}:${String(login || '').toLowerCase()}`);
}
const ve = (it, login, admin) => admin || it.estado === 'publicado' || it.criado_por === login;

export async function listar({ assunto } = {}, login = '', admin = false) {
  const L = (await ler()).filter(it => ve(it, login, admin) && it.estado !== 'descartado' && (!assunto || it.assunto === assunto));
  const aguardando = L.filter(it => it.aprovacao === 'pedida' && podeAprovar(it.assunto, login, admin)).length;
  return { itens: L.map(it => ({ ...it, pode_aprovar: podeAprovar(it.assunto, login, admin), meu: it.criado_por === login })), aguardando };
}

const REGRAS = `REGRAS INVIOLÁVEIS: (1) nunca use nome, dado ou valor real de cliente (CPFL, Enel, Caixa, Jelta etc.): use exemplos sintéticos; (2) e-mail e cobrança só como RASCUNHO, nunca enviados; (3) anúncio pago sempre PAUSADO; (4) nenhuma ação social real (curtir, seguir, comprar); (5) não invente número: se faltar dado, diga qual dado falta. Português do Brasil, direto, sem enrolação.`;
const PROMPT = {
  relatorio: a => `Você é o ATLAS, assistente da Atlantyx. Escreva um RELATÓRIO em Markdown sobre o assunto "${a}", conforme o pedido. Estrutura: título, resumo de 3 linhas, seções curtas, tabela quando ajudar, e "Dados que faltam" no fim. ${REGRAS}`,
  analise: a => `Você é o ATLAS, assistente da Atlantyx. Faça uma ANÁLISE em Markdown sobre o assunto "${a}", conforme o pedido: situação, o que os dados sugerem, riscos, 3 recomendações com dono e prazo, e "Dados que faltam". ${REGRAS}`,
  agente: a => `Você é o ATLAS, assistente da Atlantyx. Desenhe a ESPECIFICAÇÃO de um AGENTE para o assunto "${a}", conforme o pedido, em Markdown: objetivo, quando roda (gatilho), que dados lê, o que produz, o que NUNCA faz, como testar sem enviar nada externo, e quem aprova. O agente só pode usar ações da lista fechada do sistema (criar tarefa, rascunho de post, rascunho de e-mail/cobrança, relatório). ${REGRAS}`,
  tela: a => `Você é o ATLAS, assistente da Atlantyx. Escreva o PEDIDO DE TELA/FUNCIONALIDADE para o assunto "${a}", conforme o pedido, em Markdown: problema, quem usa, o que a tela mostra e permite, dados de onde vêm, critérios de aceite (3 a 6) e o que fica fora. É uma especificação para a Esteira de Demandas — não escreva código. ${REGRAS}`
};
const PROIBIDO = /\b(cpfl|enel|caixa econ[oô]mica|jelta)\b/i;

// v3.585: DADOS REAIS NO PEDIDO. Antes o ATLAS recebia só o nome da área e o pedido, então respondia "sem acesso a dados". Agora cada pedido leva um
// resumo AGREGADO do sistema (placar, Kanban/publicações/fila de marketing, portfólio de projetos): sem nome de cliente e sem indicador privado.
async function kvLer(k) { try { const s = await db(); if (!s) return null; const r = (await s`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null; return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; } }
const AREAS_PLACAR = new Set(['estrategia', 'financeiro', 'comercial', 'vendas', 'projetos', 'pessoas', 'dashboards']);
const AREAS_MKT = new Set(['marketing', 'comercial', 'vendas', 'atendimento']);
const fmtN = v => v == null ? 'sem leitura' : (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('pt-BR') : String(Math.round(v * 100) / 100));
async function blocoPlacar() {
  const ano = new Date(Date.now() - 3 * 3600000).getFullYear(), c = await kvLer('placar:cache:' + ano);
  if (!c?.indicadores) return 'PLACAR DE METAS: ainda não há leitura gravada (abra Planejamento → Placar de Metas para gerar).';
  const L = c.indicadores.filter(i => !i.privado).map(i => `- ${i.nome}: ${fmtN(i.real)}${i.unidade === '%' ? '%' : ''} (meta ${i.meta == null ? 'não definida' : fmtN(i.meta)}; situação ${i.texto || i.cor})`);
  return `PLACAR DE METAS (gerado em ${String(c.gerado_em || '').substring(0, 10)}):\n${L.join('\n')}`;
}
async function blocoMarketing() {
  const out = [], ate = Date.now() - 30 * 864e5;
  const pecas = await kvLer('atx:kanban:pecas'), pubs = await kvLer('atx:publicacoes');
  if (Array.isArray(pecas)) { const c = {}; pecas.forEach(p => { c[p.status || 'sem status'] = (c[p.status || 'sem status'] || 0) + 1; }); out.push(`KANBAN DE MARKETING: ${pecas.length} peça(s) — ` + (Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ') || 'vazio')); }
  else out.push('KANBAN DE MARKETING: sem leitura.');
  if (Array.isArray(pubs)) { const r = {}; pubs.filter(p => Date.parse(p.agendado_para || p.data) >= ate).forEach(p => { r[p.rede || '?'] = (r[p.rede || '?'] || 0) + 1; }); out.push('PUBLICAÇÕES nos últimos 30 dias por rede: ' + (Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhuma registrada')); }
  try { const s = await db(); if (s) { const f = await s`SELECT status, COUNT(*)::int AS n FROM autocampanha_fila WHERE criado_em >= NOW() - INTERVAL '7 days' GROUP BY status`; out.push('FILA DA AUTOCAMPANHA (7 dias): ' + (f.map(x => `${x.n} ${x.status}`).join(', ') || 'vazia')); } } catch (_) {}
  // v3.587: os 5 dados que o agente de marketing dizia não ter
  try { const T = { TOKEN: process.env.METRICOOL_USER_TOKEN, USERID: process.env.METRICOOL_USER_ID, BLOGID: process.env.METRICOOL_BLOG_ID };
    if (!T.TOKEN) out.push('DESEMPENHO POR REDE: Metricool não configurado neste ambiente.');
    else { const { _postsMetricasRede } = await import('../api/metricool.js'), fim = new Date().toISOString().substring(0, 10), ini = new Date(Date.now() - 30 * 864e5).toISOString().substring(0, 10), L = [];
      for (const rede of ['linkedin', 'instagram', 'facebook']) { try { const m = await _postsMetricasRede(rede, ini, fim, T), t = m.totais || {}, inter = (t.curtidas || 0) + (t.comentarios || 0) + (t.compartilhamentos || 0);
          L.push(m.api_ok === false ? `- ${rede}: Metricool sem métricas (${String((m.tentativas || [])[0]?.erro || 'sem acesso à API de analytics').slice(0, 80)})`
            : `- ${rede}: ${t.posts || 0} post(s), ${fmtN(t.impressoes)} impressões, ${fmtN(t.cliques)} cliques, ${fmtN(inter)} interações` + (t.impressoes > 0 ? `; taxa de engajamento ${Math.round(inter / t.impressoes * 1000) / 10}%, CTR ${Math.round((t.cliques || 0) / t.impressoes * 1000) / 10}%` : '; sem impressões para calcular taxas')); } catch (e) { L.push(`- ${rede}: indisponível (${String(e.message).slice(0, 60)})`); } }
      out.push(`DESEMPENHO POR REDE (Metricool, ${ini} a ${fim}):\n` + L.join('\n')); } } catch (e) { out.push('DESEMPENHO POR REDE: indisponível (' + String(e.message).slice(0, 80) + ').'); }
  try { const s = await db(); if (s) {
      const porC = await s`SELECT COALESCE(NULLIF(campanha,''),'(sem campanha)') AS c, COUNT(*)::int AS leads, COUNT(reuniao_marcada_em)::int AS reunioes FROM leads WHERE criado_em >= NOW() - INTERVAL '90 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
      const tot = porC.reduce((a, x) => ({ l: a.l + x.leads, r: a.r + x.reunioes }), { l: 0, r: 0 });
      out.push(`LEADS POR CAMPANHA (captura do site, 90 dias): ${tot.l} lead(s), ${tot.r} com reunião marcada (conversão lead→reunião ${tot.l ? Math.round(tot.r / tot.l * 1000) / 10 + '%' : 'sem leads'}).` + (porC.length ? '\n' + porC.map(x => `- ${x.c}: ${x.leads} lead(s), ${x.reunioes} reunião(ões)`).join('\n') : ''));
      out.push('CUSTO POR LEAD / ROI: não calculável — o sistema não registra gasto por campanha. Informe o gasto (ou o orçamento) para calcular.'); } } catch (_) { out.push('LEADS POR CAMPANHA: sem leitura agora.'); }
  try { const c = await kvLer('placar:cache:' + new Date(Date.now() - 3 * 3600000).getFullYear()), i = c?.indicadores?.find(x => x.id === 'conversao_ganho');
    if (i) out.push(`CONVERSÃO PROPOSTA → CONTRATO (HubSpot, estimada): ${i.real == null ? 'sem leitura' : i.real + '%'}.`); } catch (_) {}
  try { const o = await orcamentoPago();
    out.push(`ORÇAMENTO MENSAL MÁXIMO PARA MÍDIA PAGA: R$ ${fmtN(o.mensal)} (definido pelo fundador em ${o.definido_em}). Nunca proponha gasto acima disso somando todas as campanhas pagas do mês; todo anúncio nasce PAUSADO e só o fundador ativa.`); } catch (_) {}
  try { const s = await db(); if (s && Array.isArray(pecas)) { // histórico semanal do Kanban: 1 foto por semana (segunda), guardada a cada leitura
      const d = new Date(Date.now() - 3 * 3600000), seg = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().substring(0, 10), c = {}; pecas.forEach(p => { c[p.status || 'sem status'] = (c[p.status || 'sem status'] || 0) + 1; });
      const H = (await kvLer('mkt:kanban_hist')) || {}; H[seg] = { total: pecas.length, por_status: c }; const ks = Object.keys(H).sort().slice(-12), N = {}; ks.forEach(k => { N[k] = H[k]; });
      await s`INSERT INTO kv_store (key, value, updated_at) VALUES ('mkt:kanban_hist', ${JSON.stringify(N)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
      out.push('HISTÓRICO SEMANAL DO KANBAN (foto por semana, começou a ser guardado em ' + ks[0] + '): ' + ks.map(k => `${k}: ${N[k].total} peça(s) [${Object.entries(N[k].por_status).map(([a, b]) => b + ' ' + a).join(', ')}]`).join(' | ')); } } catch (_) {}
  try { const { ICP_TEXTO } = await import('./icp.js'); out.push('PÚBLICO-ALVO (ICP) VIGENTE: ' + String(ICP_TEXTO).replace(/\s+/g, ' ').substring(0, 700)); } catch (_) {}
  return out.join('\n');
}
async function blocoProjetos() {
  try { const m = await import('../api/projetos-tatico.js'); const P = await m._montar(), r = P.resumo;
    const f = Object.entries(P.fontes || {}).filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.erro}`);
    if (!r.total) return 'PORTFÓLIO DE PROJETOS (Maestro): sem projetos lidos' + (f.length ? ' — fonte com problema: ' + f.join('; ') : '') + '.';
    return `PORTFÓLIO DE PROJETOS (Maestro): ${r.total} ativos — ${r.verde} verdes, ${r.amarelo} amarelos, ${r.vermelho} vermelhos, ${r.cinza} sem status; ${r.dias_atraso} dias de atraso somados; R$ ${fmtN(r.reais_risco)} em risco; ${P.alertas.gerentes.length} gerente(s) acima do limite de projetos.` + (f.length ? ' Fonte com problema: ' + f.join('; ') : ''); } catch (e) { return 'PORTFÓLIO DE PROJETOS: indisponível (' + String(e.message).slice(0, 100) + ').'; }
}
// v3.588: teto mensal de mídia paga — decisão do fundador (24/11/2026: R$ 2.000). kv 'mkt:orcamento_pago' sobrescreve; sem ele vale o padrão.
const ORCAMENTO_PADRAO = { mensal: 2000, definido_em: '24/11/2026' };
export async function orcamentoPago() { const o = await kvLer('mkt:orcamento_pago'); return o && Number(o.mensal) > 0 ? { mensal: Number(o.mensal), definido_em: o.definido_em || '—' } : ORCAMENTO_PADRAO; }
export async function salvarOrcamentoPago({ mensal }, login) {
  const v = Number(mensal); if (!(v > 0) || v > 1e6) throw erro('Informe um valor mensal em reais, maior que zero');
  const s = await db(); if (!s) throw erro('Banco indisponível', 503); const o = { mensal: Math.round(v * 100) / 100, definido_em: agora().substring(0, 10).split('-').reverse().join('/'), por: login || '' };
  await s`INSERT INTO kv_store (key, value, updated_at) VALUES ('mkt:orcamento_pago', ${JSON.stringify(o)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return o;
}
export async function contextoDados(assunto) {
  const blocos = [];
  const jobs = [];
  if (AREAS_PLACAR.has(assunto)) jobs.push(blocoPlacar());
  if (AREAS_MKT.has(assunto)) jobs.push(blocoMarketing());
  if (assunto === 'projetos') jobs.push(blocoProjetos());
  const R = await Promise.race([Promise.allSettled(jobs), new Promise(r => setTimeout(() => r(null), 9000))]);
  (R || []).forEach(x => { if (x.status === 'fulfilled' && x.value) blocos.push(x.value); });
  const hoje = agora().substring(0, 10);
  if (!blocos.length) return `DADOS DO SISTEMA em ${hoje}: esta área ainda não tem fonte de dados ligada ao ATLAS (ou a leitura falhou agora). Diga isso em uma linha e liste os dados que o usuário precisa informar; não invente números.`;
  return `DADOS REAIS DO SISTEMA em ${hoje} (agregados, sem nome de cliente; use ESTES números e cite a fonte. O que não estiver aqui é dado faltante):\n\n` + blocos.join('\n\n');
}
// "criar um agente…" escrito com a aba em Análise/Relatório: o pedido manda — vira AGENTE (e o item registra o ajuste)
export function tipoPeloPedido(tipo, pedido) {
  if ((tipo === 'analise' || tipo === 'relatorio') && /\b(cri(ar|e)|mont(ar|e)|constru(ir|a)|desenh(ar|e)|fa[cç]a|fazer|quero|preciso de)\b[^.\n]{0,25}\bagente\b/i.test(pedido)) return 'agente';
  return tipo;
}

export async function criar({ assunto, tipo, pedido, titulo }, login, ia) {
  if (!ASSUNTOS[assunto]) throw erro('Assunto inválido'); if (!TIPOS[tipo]) throw erro('Tipo inválido');
  const p = txt(pedido, 1200); if (p.length < 8) throw erro('Descreva o que você quer em pelo menos uma frase');
  if (typeof ia !== 'function') throw erro('IA indisponível', 503);
  const tipoPedido = tipo; tipo = tipoPeloPedido(tipo, p); // v3.585
  const dados = await contextoDados(assunto).catch(() => '');
  const saida = String(await ia(PROMPT[tipo](ASSUNTOS[assunto]), (dados ? dados + '\n\n' : '') + 'PEDIDO DO USUÁRIO:\n' + p, 3500) || '').trim();
  if (!saida) throw erro('O ATLAS não devolveu conteúdo — tente de novo', 502);
  const aviso = PROIBIDO.test(saida) ? 'O texto cita nome de cliente real: revise e troque por exemplo sintético antes de publicar.' : '';
  const it = { id: crypto.randomBytes(6).toString('hex'), assunto, tipo, titulo: txt(titulo || p, 90), pedido: p, conteudo: saida.substring(0, 20000), estado: 'rascunho',
    criado_por: login || '', criado_em: agora(), ajuste_tipo: tipo !== tipoPedido ? `Você pediu ${TIPOS[tipoPedido]}, mas o texto pede um agente: gerei como ${TIPOS[tipo]}.` : '', com_dados: !/ainda não tem fonte de dados/.test(dados || ''), aprovacao: (tipo === 'agente' || tipo === 'tela') ? 'necessaria' : 'dispensada', aviso,
    log: [{ em: agora(), por: login || '', acao: 'pediu', detalhe: p.substring(0, 140) }, { em: agora(), por: 'ATLAS', acao: 'gerou', detalhe: `${TIPOS[tipo]} em rascunho, só você vê` }] };
  const L = await ler(); L.unshift(it); await gravar(L); return it;
}

export async function mudar({ id, para, motivo }, login, admin) {
  const L = await ler(); const it = L.find(x => x.id === id); if (!it || !ve(it, login, admin)) throw erro('Item não encontrado', 404);
  const dono = it.criado_por === login || admin, ap = podeAprovar(it.assunto, login, admin);
  const reg = (acao, detalhe) => it.log.push({ em: agora(), por: login || '', acao, detalhe: txt(detalhe || '', 140) });
  if (para === 'teste') { if (!dono) throw erro('Só quem criou testa', 403); if (it.estado !== 'rascunho') throw erro('Só rascunho vai para teste'); it.estado = 'teste'; reg('testar', 'roda com dados de quem criou; não envia nada para fora'); }
  else if (para === 'pedir_aprovacao') { if (!dono) throw erro('Só quem criou pede', 403); if (it.estado !== 'teste') throw erro('Teste antes de pedir aprovação'); it.aprovacao = 'pedida'; reg('pediu aprovação', `dono do assunto ${ASSUNTOS[it.assunto]}`); }
  else if (para === 'publicado') {
    if (it.estado === 'publicado') throw erro('Já está publicado');
    if (it.aprovacao === 'dispensada') { if (!dono) throw erro('Só quem criou publica', 403); }
    else { if (!ap) throw erro('Precisa da aprovação do dono do assunto', 403); if (it.aprovacao !== 'pedida' && it.criado_por !== login && !admin) throw erro('Aguarde o pedido de aprovação', 409); }
    if (it.aviso && !admin) throw erro('Resolva o aviso (nome de cliente real) antes de publicar', 409);
    it.estado = 'publicado'; it.publicado_por = login || ''; it.publicado_em = agora(); it.aprovacao = it.aprovacao === 'dispensada' ? 'dispensada' : 'aprovada'; reg('publicou', `visível a quem tem acesso a ${ASSUNTOS[it.assunto]}`);
  }
  else if (para === 'rascunho') { if (!dono && !ap) throw erro('Sem permissão', 403); const antes = it.estado; it.estado = 'rascunho'; it.aprovacao = (it.tipo === 'agente' || it.tipo === 'tela') ? 'necessaria' : 'dispensada'; delete it.publicado_por; delete it.publicado_em; reg('desfez', `voltou de ${antes} para rascunho${motivo ? ': ' + motivo : ''}`); }
  else if (para === 'descartado') { if (!dono && !ap) throw erro('Sem permissão', 403); it.estado = 'descartado'; reg('descartou', motivo); }
  else throw erro('Mudança inválida');
  await gravar(L); return { ...it, pode_aprovar: ap, meu: it.criado_por === login };
}

// ══ v3.591: CONVERSA CONTÍNUA COM O ATLAS (estilo chat) ══════════════════════════════════════════════════════════════════
// Cada item tem uma conversa (it.conversa) e versões do documento (it.versoes). O usuário pede ajustes em linguagem natural; o ATLAS responde
// em fluxo (streaming) e, quando muda o documento, devolve a versão COMPLETA entre <documento>…</documento>. "Testar" roda o item de verdade
// (simulação com os dados do sistema, nada sai para fora) e "implantar" vira botão de confirmação — as travas de aprovação continuam as mesmas.
export const MAX_CONVERSA = 60;
export function separarResposta(t) { // texto do chat × documento (tolera tag ainda aberta durante o streaming)
  const s = String(t || ''), i = s.indexOf('<documento>');
  if (i < 0) return { chat: s.trim(), doc: null, aberto: false };
  const f = s.indexOf('</documento>', i), corpo = s.slice(i + 11, f < 0 ? undefined : f);
  return { chat: (s.slice(0, i) + (f < 0 ? '' : s.slice(f + 12))).replace(/\n{2,}/g, '\n').trim(), doc: corpo.replace(/^\s*\n/, '').trim(), aberto: f < 0 };
}
export function intencao(msg) { // o que a pessoa quer fazer com o item, pela frase (só frases curtas: pedido longo é ajuste do texto)
  const m = String(msg || '').toLowerCase().trim(), curta = m.length <= 60;
  if (/^(rod(a|ar|e)|execut(a|ar|e))\s+(ele\s+|ela\s+|o agente\s+)?(agora|valendo|de verdade|pra valer)\b/.test(m)) return 'executar';
  if (/^(rod(a|ar|e)|execut(a|ar|e)|fa[cç]a|faz|simul(a|ar|e))\s+(um\s+)?(o\s+)?(teste|simula[cç][aã]o)\b|^test(a|ar|e)(\s+(agora|isso|ele|ela|o agente))?[.!?]*$|^teste[.!?]*$|^(rod(a|ar|e)|execut(a|ar|e))\s+(ele|ela|isso)[.!?]*$/.test(m)) return 'testar';
  if (m.length <= 120 && /^(n[aã]o\s+)?(desagend|cancel(a|ar|e)\s+(a\s+)?agenda|tire\s+(da\s+)?agenda|pare\s+de\s+rodar|para\s+de\s+rodar)/.test(m)) return 'desagendar';
  if (m.length <= 120 && lerAgenda(m) && (/\b(agend|program)\w*/.test(m) || /^(rod(a|ar|e)|execut(a|ar|e))\s+(toda|todo|todos|todas|diariamente|semanalmente|mensalmente)/.test(m))) return 'agendar';
  if (!curta) return null;
  if (/^(descart(a|ar|e)|apag(a|ar|ue)|exclu(i|ir|a))\b/.test(m)) return 'descartado';
  if (/^(volt(a|ar|e)|desfaz(er)?)\b.*\brascunho\b/.test(m)) return 'rascunho';
  if (/^(pode\s+)?(implant(a|ar|e)|public(a|ar|ue)|colo(car|que|ca) no ar|p[oô]r no ar|aprov(a|ar|o|ado))\b/.test(m)) return 'publicar';
  return null;
}
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
// "toda segunda às 7h", "todo dia 8h", "todo dia 5 às 9h" → { freq, dia, hora } (hora de Brasília)
export function lerAgenda(msg) {
  const m = String(msg || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const h = m.match(/(?:as\s+)?\b(\d{1,2})\s*(?:h\b|hs\b|horas?\b|:\s*\d{2}|\s*da\s+(manha|tarde|noite))/) || m.match(/\bas\s+(\d{1,2})\b/);
  let hora = h ? parseInt(h[1], 10) : null; if (hora != null && h[2] && /tarde|noite/.test(h[2]) && hora < 12) hora += 12; if (hora == null || hora > 23) hora = null;
  const semana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'].findIndex(d => new RegExp('\\b' + d).test(m));
  let freq = null, dia = null;
  if (semana >= 0) { freq = 'semanal'; dia = semana; }
  else if (/\b(todo\s+mes|mensal(mente)?)\b|\btodo\s+dia\s+\d{1,2}\b|\bdia\s+\d{1,2}\s+de\s+cada\s+mes/.test(m)) { freq = 'mensal'; const d = m.match(/\bdia\s+(\d{1,2})\b/); dia = d ? Math.min(28, Math.max(1, parseInt(d[1], 10))) : 1; }
  else if (/\b(todo\s+dia|todos\s+os\s+dias|diari(o|amente)|toda\s+manha)\b/.test(m)) freq = 'diaria';
  else if (/\bsemanal(mente)?\b|\btoda\s+semana\b/.test(m)) { freq = 'semanal'; dia = 1; }
  if (!freq) return null; if (hora == null) hora = 7;
  return { freq, dia: freq === 'diaria' ? null : dia, hora };
}
export const textoAgenda = a => !a || !a.freq ? 'sem agenda' : (a.freq === 'diaria' ? 'todo dia' : a.freq === 'semanal' ? 'toda ' + DIAS[a.dia] + (a.dia >= 1 && a.dia <= 5 ? '-feira' : '') : 'todo dia ' + a.dia + ' do mês') + ' às ' + String(a.hora).padStart(2, '0') + ':00' + (a.ativa === false ? ' (pausada)' : '');
export function partesBR(d = new Date()) { // data, dia da semana, hora e dia do mês em Brasília
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(d), g = t => f.find(x => x.type === t).value;
  return { data: `${g('year')}-${g('month')}-${g('day')}`, hora: parseInt(g('hour'), 10), dia: parseInt(g('day'), 10), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')) };
}
export function vencido(it, agora = new Date()) { // este item publicado deve rodar agora? (pega atrasos do mesmo dia; nunca duas vezes no dia)
  const a = it.agenda, b = partesBR(agora); if (!a || a.ativa === false || !a.freq || it.estado !== 'publicado' || a.ultimo === b.data) return false;
  if (a.freq === 'semanal' && a.dia !== b.dow) return false; if (a.freq === 'mensal' && a.dia !== b.dia) return false;
  return b.hora >= a.hora;
}
export function acoesPossiveis(it, login, admin) { // botões que cabem agora (mesmas regras de mudar())
  const dono = it.criado_por === login || admin, ap = podeAprovar(it.assunto, login, admin), out = [];
  if (!it.conteudo) return out;
  if (it.estado !== 'descartado') out.push({ id: 'testar', rotulo: it.tipo === 'agente' ? 'Rodar teste agora' : 'Rodar de novo (teste)' });
  if (it.estado === 'publicado' && (dono || ap) && (it.tipo === 'agente' || it.tipo === 'relatorio')) out.push({ id: 'executar', rotulo: 'Rodar agora (valendo)', forte: true });
  if (it.estado === 'rascunho' && dono) out.push({ id: 'teste', rotulo: 'Marcar como em teste' });
  if (it.estado === 'teste' && dono && it.aprovacao === 'necessaria') out.push({ id: 'pedir_aprovacao', rotulo: 'Pedir aprovação do dono' });
  if (it.estado !== 'publicado' && ((it.aprovacao === 'dispensada' && dono && it.estado !== 'rascunho') || (it.aprovacao === 'pedida' && ap))) out.push({ id: 'publicado', rotulo: 'Implantar (publicar)', forte: true });
  if (it.estado !== 'rascunho' && (dono || ap)) out.push({ id: 'rascunho', rotulo: 'Voltar a rascunho' });
  return out;
}
const SISTEMA_CHAT = (a, tipo) => `Você é o ATLAS, assistente da Atlantyx, conversando com o usuário sobre um(a) ${TIPOS[tipo].toUpperCase()} do assunto "${a}". Converse como num chat: respostas curtas e diretas, em português do Brasil, sem repetir o que já foi dito.
COMO RESPONDER: (1) Se o usuário pedir para criar, mudar, acrescentar ou corrigir o conteúdo, devolva o documento COMPLETO atualizado entre <documento> e </documento> (Markdown) e, FORA das tags, 1 a 3 linhas dizendo o que mudou. (2) Se for só pergunta ou dúvida, responda sem <documento>. (3) Se faltar uma informação que muda o resultado, faça UMA pergunta objetiva em vez de inventar. (4) Nunca escreva o documento fora das tags.
IMPLANTAR E RODAR: este chat implanta, testa, agenda e roda o item de verdade (o usuário só escreve "implantar", "testa", "roda agora" ou "agenda toda segunda às 7h"). NUNCA diga que não consegue implantar, ativar ou rodar, que só pode documentar, nem mande procurar o time técnico: se o usuário pedir isso, responda em 1 linha dizendo a palavra exata a escrever.
${PROMPT[tipo](a).replace(/^Você é o ATLAS, assistente da Atlantyx\.\s*/, 'FORMATO DO DOCUMENTO: ')}`;
const SISTEMA_TESTE = (a, tipo) => `Você é o ATLAS, assistente da Atlantyx. Faça agora um TESTE de execução do(a) ${TIPOS[tipo]} abaixo, no assunto "${a}", como se estivesse rodando de verdade, mas em MODO SIMULAÇÃO: nada é enviado, publicado, criado ou pago. Use os DADOS REAIS DO SISTEMA fornecidos (não invente números). Responda em Markdown curto com: **O que rodou** (passos), **Resultado** (o que seria produzido, com os números reais), **O que NÃO foi enviado** (confirmando que foi só simulação), **Falhas ou dados faltando**, **Ajustes que eu sugiro** (até 3). ${REGRAS}`;

export async function iniciar({ assunto, tipo, pedido, titulo }, login) { // cria o item vazio já com o pedido; o texto vem pela conversa
  if (!ASSUNTOS[assunto]) throw erro('Assunto inválido'); if (!TIPOS[tipo]) throw erro('Tipo inválido');
  const p = txt(pedido, 1200); if (p.length < 8) throw erro('Descreva o que você quer em pelo menos uma frase');
  const tipoPedido = tipo; tipo = tipoPeloPedido(tipo, p);
  const it = { id: crypto.randomBytes(6).toString('hex'), assunto, tipo, titulo: txt(titulo || p, 90), pedido: p, conteudo: '', estado: 'rascunho', criado_por: login || '', criado_em: agora(), com_dados: false, aviso: '',
    ajuste_tipo: tipo !== tipoPedido ? `Você pediu ${TIPOS[tipoPedido]}, mas o texto pede um agente: abri como ${TIPOS[tipo]}.` : '', aprovacao: (tipo === 'agente' || tipo === 'tela') ? 'necessaria' : 'dispensada',
    conversa: [], versoes: [], execucoes: [], log: [{ em: agora(), por: login || '', acao: 'pediu', detalhe: p.substring(0, 140) }] };
  const L = await ler(); L.unshift(it); await gravar(L); return it;
}
// v3.595: agente de marketing diário já pronto (um clique). Idempotente: se já existe um ativo, devolve o mesmo. Texto fixo, sem chamar IA.
export const TEXTO_AGENTE_MARKETING = `# Agente de marketing diário

**Objetivo:** vender. Roda todo dia às 07:00 (Brasília) o ciclo completo de marketing da Atlantyx.

**O que faz a cada rodada**
1. Analisa os resultados do que já foi publicado (45 dias) e aprende: o que gerou visita, formulário e lead de verdade.
2. Analisa TODAS as campanhas já agendadas (próximos 60 dias) e corrige sozinho o que achar de errado (duplicado, sem imagem, horário em conflito, texto fraco).
3. Pesquisa a concorrência uma vez por semana e alinha tudo ao ICP da Atlantyx.
4. Gera exatamente 3 campanhas por dia, em horários que não conflitam com as demais, e as cadastra e agenda.
5. Anúncio pago: sempre dentro do teto mensal (R$ 2.000) e criado PAUSADO, salvo autorização expressa do CEO.
6. Confere de hora em hora se cada campanha foi publicada com sucesso e avisa por e-mail se deu erro.

**Limites:** não envia nada a clientes, não compra, não curte nem segue; dados de clientes reais nunca entram nos textos.`;
export async function criarAgenteMarketing(login, admin) {
  const L = await ler(); const ja = L.find(x => x.assunto === 'marketing' && x.tipo === 'agente' && x.autocampanha && x.estado !== 'descartado' && (admin || x.criado_por === login || x.estado === 'publicado'));
  if (ja) return { ...(await obter({ id: ja.id }, login, admin)), ja_existia: true };
  const it = { id: crypto.randomBytes(6).toString('hex'), assunto: 'marketing', tipo: 'agente', titulo: 'Agente de marketing diário', pedido: 'Agente de marketing diário completo (3 campanhas por dia, análise, concorrência e ICP).', conteudo: '', estado: 'rascunho',
    criado_por: login || '', criado_em: agora(), com_dados: false, aviso: '', ajuste_tipo: '', aprovacao: 'necessaria', conversa: [], versoes: [], execucoes: [], autocampanha: true,
    agenda: { freq: 'diaria', dia: null, hora: 7, ativa: true, ultimo: null }, log: [{ em: agora(), por: login || '', acao: 'pediu', detalhe: 'agente de marketing pronto (botão)' }] };
  novaVersao(it, TEXTO_AGENTE_MARKETING, login, 'texto pronto do agente de marketing diário');
  if (admin) { it.estado = 'teste'; it.aprovacao = 'pedida'; it.log.push({ em: agora(), por: login || '', acao: 'testar', detalhe: 'pronto para implantar' }); }
  L.unshift(it); await gravar(L); return { ...(await obter({ id: it.id }, login, admin)), ja_existia: false };
}
export async function obter({ id }, login, admin) {
  const it = (await ler()).find(x => x.id === id); if (!it || !ve(it, login, admin)) throw erro('Item não encontrado', 404);
  return { ...it, conversa: it.conversa || [], versoes: (it.versoes || []).map(v => ({ n: v.n, em: v.em, por: v.por, resumo: v.resumo })), pode_aprovar: podeAprovar(it.assunto, login, admin), meu: it.criado_por === login, acoes: acoesPossiveis(it, login, admin) };
}
export async function versao({ id, n }, login, admin) { const it = (await ler()).find(x => x.id === id); if (!it || !ve(it, login, admin)) throw erro('Item não encontrado', 404); const v = (it.versoes || []).find(x => x.n === Number(n)); if (!v) throw erro('Versão não encontrada', 404); return v; }
export async function restaurar({ id, n }, login, admin) { // volta o documento a uma versão anterior (vira uma versão nova, nada se perde)
  const L = await ler(), it = L.find(x => x.id === id); if (!it || !ve(it, login, admin)) throw erro('Item não encontrado', 404);
  if (!(it.criado_por === login || podeAprovar(it.assunto, login, admin))) throw erro('Sem permissão', 403);
  const v = (it.versoes || []).find(x => x.n === Number(n)); if (!v) throw erro('Versão não encontrada', 404);
  novaVersao(it, v.conteudo, login, `voltou ao texto da versão ${v.n}`); await gravar(L); return obter({ id }, login, admin);
}
function novaVersao(it, conteudo, por, resumo) {
  it.versoes = it.versoes || []; const n = (it.versoes[it.versoes.length - 1]?.n || 0) + 1;
  it.versoes.push({ n, em: agora(), por, resumo: txt(resumo, 140), conteudo: String(conteudo).substring(0, 20000) }); if (it.versoes.length > 15) it.versoes.shift();
  it.conteudo = String(conteudo).substring(0, 20000); it.aviso = PROIBIDO.test(it.conteudo) ? 'O texto cita nome de cliente real: revise e troque por exemplo sintético antes de publicar.' : '';
  if (it.estado === 'publicado' || it.estado === 'teste') { const antes = it.estado; it.estado = 'rascunho'; it.aprovacao = (it.tipo === 'agente' || it.tipo === 'tela') ? 'necessaria' : 'dispensada'; delete it.publicado_por; delete it.publicado_em; it.log.push({ em: agora(), por: 'ATLAS', acao: 'voltou a rascunho', detalhe: `o texto mudou (era ${antes}); teste de novo antes de implantar` }); }
  it.log.push({ em: agora(), por: por || '', acao: 'ajustou', detalhe: txt(resumo, 140) });
  return n;
}
// ══ v3.592: AGENTE DE VERDADE — rodar agora, agendar e rodar sozinho ═════════════════════════════════════════════════════
// Publicado = pode rodar valendo. A execução produz RELATÓRIO + RASCUNHOS/tarefas (texto guardado no item); nada é enviado, publicado, pago ou criado fora.
// Em marketing, o agente pode (opção ligada pelo dono) acionar a Autocampanha — que só cria RASCUNHOS. Agenda roda por cron de hora em hora (Brasília).
const SISTEMA_EXEC = (a, tipo) => `Você é o ATLAS, assistente da Atlantyx, EXECUTANDO agora, de verdade, o(a) ${TIPOS[tipo]} abaixo no assunto "${a}". Cumpra o objetivo descrito usando os DADOS REAIS DO SISTEMA (não invente números; o que faltar vá em "Dados que faltaram"). Entregue em Markdown: **Resumo** (3 linhas), **Resultado** (com os números reais), **Rascunhos e tarefas geradas** (textos prontos para o usuário aprovar: posts, e-mails, cobranças, tarefas), **Dados que faltaram**. Você só PRODUZ texto: nada é enviado, publicado, pago ou criado fora daqui. ${REGRAS}`;
const AVISO_PARA = () => process.env.ATLAS_AVISO_PARA || process.env.AUTOCAMPANHA_AVISO_PARA || 'contato@atlanteam.com.br';
async function avisarPorEmail(it, ex) {
  if (ex.autocampanha && !ex.erro) return; // o ciclo de marketing já manda o próprio resumo por e-mail
  try {
    const { enviarEmailGmail } = await import('../api/financeiro.js'); const e = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await enviarEmailGmail({ para: AVISO_PARA(), assunto: `${ex.erro ? 'Falhou' : 'Rodou'}: ${it.titulo.substring(0, 70)}`, html: `<p><b>${e(it.titulo)}</b> (${e(ASSUNTOS[it.assunto])}) ${ex.erro ? 'falhou: ' + e(ex.erro) : 'rodou ' + (ex.modo === 'agenda' ? 'pela agenda' : 'agora') + '. Nada foi enviado nem publicado fora do sistema.'}</p>${ex.saida ? '<pre style="white-space:pre-wrap;font-family:inherit">' + e(ex.saida.substring(0, 3500)) + '</pre>' : ''}${ex.autocampanha ? '<p>Autocampanha: ' + e(JSON.stringify(ex.autocampanha).substring(0, 300)) + '</p>' : ''}<p>Veja tudo em Atlantyx OS → Assuntos → ${e(ASSUNTOS[it.assunto])}.</p><p>Fabio Quintanilha / CEO – Atlantyx</p>` });
  } catch (_) { /* aviso é cortesia: falha não derruba a execução */ }
}
// executa o item e devolve o registro da execução (não grava: quem chama grava)
async function executar(it, { modo, por, ia, onDelta, manual }) {
  if (it.autocampanha && it.assunto === 'marketing') { // v3.593: agente de marketing = ciclo diário completo (analisa, aprende, ajusta, cadastra, agenda 7 dias, anúncio dentro do teto)
    const r = await (await import('../api/metricool.js')).campanhaCompleta({ forcar: !!manual, onPasso: onDelta, ativarAnuncio: !!it.ativar_anuncio });
    const saida = r.pulado ? `Hoje o ciclo já rodou${r.enfileirados != null ? ' (' + r.enfileirados + ' posts na fila)' : ''}. Use "Rodar agora" para forçar uma nova rodada.` : String(r.relatorio || '').trim();
    if (!saida) throw erro('O ciclo de marketing não devolveu resultado', 502);
    return { em: agora(), por, modo, saida: saida.substring(0, 8000), aviso: '', erro: r.erro || undefined, autocampanha: { enfileirados: r.posts?.enfileirados ?? r.enfileirados ?? 0, lote: r.posts?.lote || r.lote || null, campanha_id: r.campanha_id || null, anuncio: r.anuncio || null, pulado: r.pulado || undefined } };
  }
  const dados = await contextoDados(it.assunto).catch(() => '');
  const saida = String(await ia(SISTEMA_EXEC(ASSUNTOS[it.assunto], it.tipo), [{ role: 'user', content: (dados ? dados + '\n\n' : '') + `${TIPOS[it.tipo].toUpperCase()} A EXECUTAR:\n${it.conteudo}` }], 3500, onDelta) || '').trim();
  if (!saida) throw erro('O agente não devolveu resultado — tente de novo', 502);
  const ex = { em: agora(), por, modo, saida: saida.substring(0, 8000), aviso: PROIBIDO.test(saida) ? 'cita nome de cliente real' : '' };
  if (it.autocampanha && it.assunto === 'marketing') { try { ex.autocampanha = await (await import('../api/metricool.js')).autoCampanhaSegunda({ forcar: !!manual }); } catch (e) { ex.autocampanha = { erro: String(e.message || e).slice(0, 160) }; } }
  return ex;
}
function guardarExecucao(it, ex) { it.execucoes = [ex, ...(it.execucoes || [])].slice(0, 10); it.log.push({ em: agora(), por: ex.por, acao: ex.erro ? 'execução falhou' : 'executou', detalhe: ex.erro || (ex.modo === 'agenda' ? 'pela agenda; nada saiu para fora' : 'valendo; nada saiu para fora') }); }

export async function agendar({ id, freq, dia, hora, ativa, autocampanha, ativar_anuncio, texto }, login, admin) {
  const L = await ler(), it = L.find(x => x.id === id); if (!it || !ve(it, login, admin)) throw erro('Item não encontrado', 404);
  if (!(it.criado_por === login || podeAprovar(it.assunto, login, admin))) throw erro('Sem permissão', 403);
  if (it.tipo !== 'agente' && it.tipo !== 'relatorio') throw erro('Só agente ou relatório tem agenda');
  const lido = texto ? lerAgenda(texto) : null; if (texto && !lido) throw erro('Não entendi o horário. Exemplo: toda segunda às 7h');
  const a = lido || { freq, dia: freq === 'diaria' ? null : Number(dia), hora: Number(hora) };
  if (freq !== undefined || lido) { if (!['diaria', 'semanal', 'mensal'].includes(a.freq)) throw erro('Frequência inválida'); if (!(a.hora >= 0 && a.hora <= 23)) throw erro('Hora inválida'); if (a.freq === 'semanal' && !(a.dia >= 0 && a.dia <= 6)) throw erro('Dia da semana inválido'); if (a.freq === 'mensal' && !(a.dia >= 1 && a.dia <= 28)) throw erro('Dia do mês inválido (1 a 28)');
    it.agenda = { ...a, ativa: ativa !== false, ultimo: it.agenda?.ultimo || null }; it.log.push({ em: agora(), por: login || '', acao: 'agendou', detalhe: textoAgenda(it.agenda) }); }
  else if (ativa !== undefined && it.agenda) { it.agenda.ativa = !!ativa; it.log.push({ em: agora(), por: login || '', acao: ativa ? 'retomou a agenda' : 'pausou a agenda', detalhe: textoAgenda(it.agenda) }); }
  if (autocampanha !== undefined) { if (it.assunto !== 'marketing') throw erro('O ciclo de marketing é só do assunto Marketing'); it.autocampanha = !!autocampanha;
    if (autocampanha && !it.agenda) it.agenda = { freq: 'diaria', dia: null, hora: 7, ativa: true, ultimo: null };
    it.log.push({ em: agora(), por: login || '', acao: autocampanha ? 'ligou o ciclo diário de marketing' : 'desligou o ciclo diário de marketing', detalhe: autocampanha ? 'analisa resultados, aprende, ajusta, agenda 7 dias; anúncio pago dentro do teto' : '' }); }
  if (ativar_anuncio !== undefined) { if (it.assunto !== 'marketing') throw erro('Só no assunto Marketing'); if (!admin) throw erro('Só o CEO autoriza o agente a ativar anúncio pago', 403); it.ativar_anuncio = !!ativar_anuncio; it.log.push({ em: agora(), por: login || '', acao: ativar_anuncio ? 'autorizou ativar anúncio sozinho' : 'tirou a autorização de ativar anúncio', detalhe: 'sempre dentro do teto mensal' }); }
  await gravar(L); return obter({ id }, login, admin);
}
// o ciclo de marketing avisa aqui o status de publicação (sucesso/erro) das campanhas do dia: vira uma linha em "Execuções" do agente
export async function registrarStatusMarketing(texto) {
  const L = await ler(); let n = 0;
  for (const it of L) if (it.assunto === 'marketing' && it.autocampanha && it.estado === 'publicado') { it.execucoes = [{ em: agora(), por: 'agenda', modo: 'status', saida: String(texto).substring(0, 4000) }, ...(it.execucoes || [])].slice(0, 10); n++; }
  if (n) await gravar(L); return n;
}
// Cron (hora em hora): roda cada agente publicado e vencido. Marca o dia ANTES de rodar (nunca duas vezes) e relê o banco antes de gravar.
export async function rodarAgendados(ia, { agora: ag = new Date(), limiteMs = 200000, max = 4 } = {}) {
  const t0 = Date.now(), feitos = [];
  const devidos = (await ler()).filter(it => vencido(it, ag)).map(it => it.id);
  for (const id of devidos.slice(0, max)) {
    if (Date.now() - t0 > limiteMs) break;
    let L = await ler(), it = L.find(x => x.id === id); if (!it || !vencido(it, ag)) continue;
    it.agenda.ultimo = partesBR(ag).data; await gravar(L);
    let ex; try { ex = await executar(it, { modo: 'agenda', por: 'agenda', ia, manual: false }); } catch (e) { ex = { em: agora(), por: 'agenda', modo: 'agenda', saida: '', erro: String(e.message || e).slice(0, 200) }; }
    L = await ler(); it = L.find(x => x.id === id); if (!it) continue; guardarExecucao(it, ex); await gravar(L); await avisarPorEmail(it, ex);
    feitos.push({ id, titulo: it.titulo, ok: !ex.erro });
  }
  return { devidos: devidos.length, feitos };
}

// Uma rodada de conversa. `ia(sistema, mensagens, maxTokens, onDelta)` devolve o texto completo e chama onDelta(pedaço) enquanto escreve.
export async function conversar({ id, mensagem, acao }, login, admin, ia, emitir = () => {}) {
  const L = await ler(), it = L.find(x => x.id === id); if (!it || !ve(it, login, admin)) throw erro('Item não encontrado', 404);
  if (!(it.criado_por === login || podeAprovar(it.assunto, login, admin))) throw erro('Só quem criou (ou o dono do assunto) conversa com o item', 403);
  if (typeof ia !== 'function') throw erro('IA indisponível', 503);
  it.conversa = it.conversa || []; it.execucoes = it.execucoes || [];
  const msg = txt(mensagem || (acao === 'testar' ? 'Rodar teste agora' : acao === 'executar' ? 'Rodar agora (valendo)' : ''), 1500); if (msg.length < 2) throw erro('Escreva uma mensagem');
  const resp = (texto, extra = {}) => { it.conversa.push({ papel: 'atlas', texto, em: agora(), ...extra }); it.conversa = it.conversa.slice(-MAX_CONVERSA); };
  it.conversa.push({ papel: 'user', texto: msg, em: agora(), por: login || '' });
  const quer = acao || (it.conteudo ? intencao(msg) : null);
  // 0) agenda e execução valendo pelo chat
  if (quer === 'agendar' || quer === 'desagendar') {
    let t;
    if (it.tipo !== 'agente' && it.tipo !== 'relatorio') t = 'Só agente ou relatório tem agenda.';
    else if (quer === 'desagendar') { if (it.agenda) { it.agenda.ativa = false; it.log.push({ em: agora(), por: login || '', acao: 'pausou a agenda', detalhe: textoAgenda(it.agenda) }); t = 'Agenda pausada. Posso retomar quando quiser.'; } else t = 'Este item não tem agenda.'; }
    else { const a = lerAgenda(msg); it.agenda = { ...a, ativa: true, ultimo: it.agenda?.ultimo || null }; it.log.push({ em: agora(), por: login || '', acao: 'agendou', detalhe: textoAgenda(it.agenda) });
      t = `Agendado: ${textoAgenda(it.agenda)} (horário de Brasília). ` + (it.estado === 'publicado' ? 'Já vale a partir da próxima data.' : 'Só começa a rodar depois de implantado: teste, peça aprovação e implante.') + (it.assunto === 'marketing' ? ' Para ele fazer o ciclo completo de marketing (analisar, aprender, ajustar e agendar 7 dias), ligue a opção na caixa de Agenda.' : ''); }
    resp(t); await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it;
  }
  // v3.596: quem pode aprovar (CEO/dono do assunto) e pede "implantar" → o ATLAS faz tudo: teste → aprovação → publicado (e, no agente de marketing, já roda o 1º ciclo)
  let implantouAgora = false;
  if (quer === 'publicar' && it.estado !== 'publicado' && it.estado !== 'descartado' && podeAprovar(it.assunto, login, admin) && !(it.aviso && !admin)) {
    if (!it.conteudo) { resp('Ainda não há texto para implantar. Descreva o que você quer e eu escrevo primeiro.'); await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it; }
    if (it.estado === 'rascunho') { it.estado = 'teste'; it.log.push({ em: agora(), por: login || '', acao: 'testar', detalhe: 'passou para teste ao implantar' }); }
    it.aprovacao = 'aprovada'; it.estado = 'publicado'; it.publicado_por = login || ''; it.publicado_em = agora();
    it.log.push({ em: agora(), por: login || '', acao: 'publicou', detalhe: `implantado pelo chat; visível a quem tem acesso a ${ASSUNTOS[it.assunto]}` });
    implantouAgora = true;
    if (it.autocampanha && it.assunto === 'marketing' && it.tipo === 'agente') {
      if (!it.agenda) it.agenda = { freq: 'diaria', dia: null, hora: 7, ativa: true, ultimo: null };
      resp(`Implantado. O agente já está no ar e roda ${textoAgenda(it.agenda)} (Brasília). Vou rodar agora a primeira rodada valendo.`);
      await gravar(L);
      return conversar({ id, mensagem: 'Rodar agora (valendo)', acao: 'executar' }, login, admin, ia, emitir);
    }
    resp(`Implantado em ${ASSUNTOS[it.assunto]}.` + ((it.tipo === 'agente' || it.tipo === 'relatorio') ? ' Diga "roda agora" para uma execução valendo ou "agenda toda segunda às 7h".' : ''));
    await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it;
  }
  if (quer === 'executar') {
    if (it.estado !== 'publicado') { resp('Para rodar valendo o item precisa estar implantado. Rode um teste agora ou implante primeiro.'); await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it; }
    if (it.tipo !== 'agente' && it.tipo !== 'relatorio') { resp('Só agente ou relatório roda valendo.'); await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it; }
    let ex; try { ex = await executar(it, { modo: 'manual', por: login || '', ia: (sys, m, mx) => ia(sys, m, mx, d => emitir({ tipo: 'texto', d })), manual: true }); } catch (e) { ex = { em: agora(), por: login || '', modo: 'manual', saida: '', erro: String(e.message || e).slice(0, 200) }; }
    guardarExecucao(it, ex); resp(ex.erro ? 'A execução falhou: ' + ex.erro : ex.saida, { execucao: true });
    await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it; }
  // 1) implantar / voltar / descartar: não gasta IA — mostra o botão certo (a confirmação é um clique; as travas de aprovação são as de sempre)
  if (quer && quer !== 'testar') {
    const possiveis = acoesPossiveis(it, login, admin), alvo = quer === 'publicar' ? possiveis.find(a => a.id === 'publicado') || possiveis.find(a => a.id === 'pedir_aprovacao') || possiveis.find(a => a.id === 'teste') : possiveis.find(a => a.id === quer);
    let t;
    if (quer === 'descartado') t = 'Para descartar use o botão abaixo do item. Prefere só voltar a rascunho?';
    else if (alvo?.id === 'publicado') t = `Pronto para implantar em ${ASSUNTOS[it.assunto]}. ${it.tipo === 'agente' ? 'Lembrando: o agente só gera relatório e rascunhos, nada sai para fora sozinho.' : ''} Confirma?`;
    else if (alvo?.id === 'pedir_aprovacao') t = 'Este item precisa da aprovação do dono do assunto. Posso pedir agora.';
    else if (alvo?.id === 'teste') t = it.execucoes.length ? 'Marco como em teste e, depois, peço aprovação ou implanto.' : 'Antes de implantar, rode um teste: nada sai para fora. Quer que eu rode agora?';
    else if (it.estado === 'publicado') t = 'Já está implantado em ' + ASSUNTOS[it.assunto] + '.';
    else t = 'Ainda não dá para fazer isso: ' + (it.aviso || 'falta um passo anterior (teste ou aprovação)') + '.';
    resp(t); await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it;
  }
  const dados = await contextoDados(it.assunto).catch(() => ''); it.com_dados = !/ainda não tem fonte de dados/.test(dados || '');
  // 2) rodar teste: simulação com dados reais, sem enviar nada
  if (quer === 'testar') {
    if (!it.conteudo) { resp('Ainda não há texto para testar. Descreva o que você quer e eu escrevo primeiro.'); await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it; }
    const out = String(await ia(SISTEMA_TESTE(ASSUNTOS[it.assunto], it.tipo), [{ role: 'user', content: (dados ? dados + '\n\n' : '') + `${TIPOS[it.tipo].toUpperCase()} A TESTAR:\n${it.conteudo}\n\nPEDIDO DO USUÁRIO: ${msg}` }], 2500, d => emitir({ tipo: 'texto', d })) || '').trim();
    if (!out) throw erro('O teste não devolveu resultado — tente de novo', 502);
    it.execucoes.unshift({ em: agora(), por: login || '', modo: 'teste', saida: out.substring(0, 8000) }); it.execucoes = it.execucoes.slice(0, 10);
    if (it.estado === 'rascunho' && (it.criado_por === login || admin)) { it.estado = 'teste'; it.log.push({ em: agora(), por: login || '', acao: 'testar', detalhe: 'rodou teste pelo chat; nada saiu para fora' }); } else it.log.push({ em: agora(), por: login || '', acao: 'testou', detalhe: 'simulação pelo chat' });
    resp(out, { teste: true }); await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it;
  }
  // 3) conversa normal (ou primeira geração): histórico + documento atual + dados reais
  const hist = it.conversa.slice(0, -1).slice(-14).map(c => ({ role: c.papel === 'user' ? 'user' : 'assistant', content: String(c.teste ? '[resultado de um teste anterior, omitido]' : c.texto).substring(0, 3000) }));
  const contexto = (dados ? dados + '\n\n' : '') + (it.conteudo ? `DOCUMENTO ATUAL (versão ${(it.versoes || []).slice(-1)[0]?.n || 1}):\n${it.conteudo}\n\n` : `AINDA NÃO HÁ DOCUMENTO. Pedido original: ${it.pedido}\n\n`);
  const msgs = [...hist, { role: 'user', content: contexto + 'MENSAGEM DO USUÁRIO: ' + msg }]; while (msgs.length > 1 && msgs[0].role !== 'user') msgs.shift();
  const bruto = String(await ia(SISTEMA_CHAT(ASSUNTOS[it.assunto], it.tipo), msgs, 3800, d => emitir({ tipo: 'texto', d })) || '').trim();
  if (!bruto) throw erro('O ATLAS não devolveu conteúdo — tente de novo', 502);
  const { chat, doc } = separarResposta(bruto); let n = null;
  if (doc && doc.length > 20) n = novaVersao(it, doc, 'ATLAS', chat || msg);
  resp(chat || (n ? `Atualizei o texto (versão ${n}).` : bruto), n ? { versao: n } : {}); await gravar(L); emitir({ tipo: 'fim', item: await obter({ id }, login, admin) }); return it;
}

// Tela/funcionalidade aprovada vira pedido na Esteira de Demandas (o fundador ainda revisa o PR). Devolve o texto da demanda; quem chama cria.
export async function resumoAtividade(assunto) {
  const L = (await ler()).filter(i => i.assunto === assunto && i.estado !== 'descartado'); const hoje = agora().substring(0, 10);
  const h = L.filter(i => (i.criado_em || '').startsWith(hoje));
  return { total: L.length, publicados: L.filter(i => i.estado === 'publicado').length, hoje: h.length };
}
