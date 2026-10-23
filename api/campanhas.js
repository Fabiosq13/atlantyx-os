import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
import { TIPOS, STATUS_NOME, utmCampanha, utmConteudo, statusDe, validarPlano, metasDoPlano, briefingDoPlano, consolidar, linksAcao, slugRef, chavesAcao } from '../lib/campanha-macro.js';
import { K_VIGENTE, planoSimular } from '../lib/plano-estrategico.js';
// api/campanhas.js — v3.255 · CAMPANHAS DE MARKETING (visão única)
// Campanha = período + objetivo + orçamento + metas + PLANO (o Plano Estratégico vigente ou um plano próprio) e as AÇÕES
// de vários canais. Guardada no kv_store (mkt:campanhas), sem tabela nova. Os números vêm do que o sistema já registra:
// leads (utm_campaign/utm_content), visitas da página de captura, disparos de e-mail/WhatsApp e os negócios no HubSpot.

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const K = 'mkt:campanhas', K_DEALS = 'mkt:cmp_deals';
let _sql = null, _pronto = false;
async function getSql() {
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  if (!_pronto) { await _sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`; _pronto = true; }
  return _sql;
}
async function kv(k, v) {
  const sql = await getSql();
  if (v === undefined) { const r = (await sql`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null; try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; } }
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v;
}
const lista = async () => ((await kv(K)) || {}).lista || [];
const gravar = L => kv(K, { lista: L });
const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const txt = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().substring(0, n);
const txtL = (v, n) => String(v ?? '').trim().substring(0, n);
const num = v => (v === '' || v == null || isNaN(+v)) ? null : Math.max(0, +v);
const data = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
const base = req => { const h = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || ''); const b = process.env.MEDIA_PUBLIC_BASE || process.env.APP_URL || (/^[\w.-]+(:\d+)?$/.test(h) ? (/^localhost|^127\./.test(h) ? 'http://' : 'https://') + h : 'https://atlantyx-os.vercel.app'); return (b.startsWith('http') ? b : 'https://' + b).replace(/\/$/, ''); };

async function vigente() { try { return await kv(K_VIGENTE); } catch (_) { return null; } }

// ── coleta dos números (uma vez para todas as campanhas pedidas) ──
async function tabela(sql, q) { try { return await q(sql); } catch (_) { return []; } }
async function dealsHubSpot(ids) {
  const token = process.env.HUBSPOT_TOKEN; ids = [...new Set(ids.filter(Boolean).map(String))]; if (!token || !ids.length) return {};
  const cache = (await kv(K_DEALS)) || {}; if (cache.em && Date.now() - cache.em < 10 * 60000 && ids.every(i => cache.d?.[i])) return cache.d;
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const etapas = {}; try { const p = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', { headers: H }).then(r => r.json());
    for (const pl of p.results || []) { const S = (pl.stages || []).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)); const iProp = S.findIndex(s => /propost/i.test(s.label));
      S.forEach((s, i) => { const fech = String(s.metadata?.isClosed) === 'true', ganha = fech && Number(s.metadata?.probability) >= 1; etapas[s.id] = { nome: s.label, ganha, perdida: fech && !ganha, proposta: ganha || (!fech && iProp >= 0 && i >= iProp) }; }); } } catch (_) {}
  const out = { ...(cache.d || {}) };
  for (let i = 0; i < ids.length; i += 100) {
    try { const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', { method: 'POST', headers: H, body: JSON.stringify({ properties: ['dealstage', 'amount', 'dealname'], inputs: ids.slice(i, i + 100).map(id => ({ id })) }) });
      const d = await r.json(); for (const x of d.results || []) { const e = etapas[x.properties?.dealstage] || {}; out[x.id] = { etapa: e.nome || x.properties?.dealstage || '', ganho: !!e.ganha, proposta: !!e.proposta, valor: Number(x.properties?.amount) || 0 }; } } catch (_) {}
  }
  await kv(K_DEALS, { em: Date.now(), d: out }); return out;
}
async function coletar(C) {
  const sql = await getSql(), utms = [...new Set(C.flatMap(c => [c.utm, ...(c.acoes || []).flatMap(chavesAcao)]).filter(Boolean))];
  const refsDisp = [...new Set(C.flatMap(c => (c.acoes || []).filter(a => ['email', 'whatsapp', 'digital'].includes(a.tipo) && a.ref?.id).map(a => String(a.ref.id))))];
  if (!utms.length) return { leads: [], visitas: [], disparos: {} };
  const L = await tabela(sql, s => s`SELECT id, campanha, utm, status, reuniao_marcada_em, hubspot_deal, criado_em FROM leads WHERE campanha = ANY(${utms}) AND COALESCE(status,'') <> 'qa_teste' ORDER BY criado_em DESC LIMIT 5000`);
  const V = await tabela(sql, s => s`SELECT campanha, conteudo, COUNT(*)::int AS n FROM captura_visitas WHERE campanha = ANY(${utms}) GROUP BY campanha, conteudo`);
  const Dp = refsDisp.length ? await tabela(sql, s => s`SELECT campanha_id, COUNT(*) FILTER (WHERE status='enviado' OR enviado_em IS NOT NULL)::int AS enviados, COUNT(aberto_em)::int AS aberturas, COUNT(clicado_em)::int AS cliques FROM disparo_envios WHERE campanha_id = ANY(${refsDisp}) GROUP BY campanha_id`) : [];
  const deals = await dealsHubSpot(L.map(l => l.hubspot_deal)).catch(() => ({}));
  const leads = L.map(l => { let u = l.utm; try { if (typeof u === 'string') u = JSON.parse(u); } catch (_) { u = {}; } const d = l.hubspot_deal ? deals[String(l.hubspot_deal)] : null;
    return { id: l.id, campanha: l.campanha, conteudo: (u || {}).content || null, criado_em: l.criado_em, reuniao: !!(l.reuniao_marcada_em || l.status === 'reuniao_marcada' || d), proposta: !!d?.proposta, ganho: !!d?.ganho, valor: d?.ganho ? d.valor : 0 }; });
  return { leads, visitas: V, disparos: Object.fromEntries(Dp.map(d => [d.campanha_id, { enviados: d.enviados, aberturas: d.aberturas, cliques: d.cliques }])) };
}

// ── opções para ligar ações e plano ──
async function opcoes() {
  const sql = await getSql(), vig = await vigente();
  const digitais = await tabela(sql, s => s`SELECT id, nome, canal, status, data_inicio, data_fim FROM campanhas ORDER BY atualizado_em DESC NULLS LAST LIMIT 80`);
  const disparos = await tabela(sql, s => s`SELECT campanha_id AS id, MAX(campanha_nome) AS nome, canal, SUM(total)::int AS total, MAX(criado_em) AS em FROM disparo_lotes GROUP BY campanha_id, canal ORDER BY MAX(criado_em) DESC LIMIT 80`);
  const webinars = await tabela(sql, s => s`SELECT id, titulo AS nome, inicio, status FROM atv_webinars ORDER BY inicio DESC NULLS LAST LIMIT 40`);
  const atv = (await kv('atv:config')) || {}, pl = (await kv('atv:plantao_hist')) || [];
  const tv = [...(atv.playlist || []).map(x => ({ id: x.id, nome: x.titulo, tipo: 'vídeo' })), ...pl.map(p => ({ id: p.id, nome: 'Plantão · ' + p.titulo, tipo: 'plantão' }))].slice(0, 120);
  const P = vig?.plano; const sim = P ? planoSimular(P) : null;
  return { tipos: TIPOS, status_nome: STATUS_NOME, digitais, disparos, webinars, tv,
    plano: P ? { versao: vig.versao, nome: P.nome, horizonte: P.horizonte, aprovado_em: vig.aprovado_em, midia: P.midia,
      alavancas: P.alavancas.filter(a => a.status !== 'pausada').map(a => ({ id: a.id, nome: a.nome, grupo: a.grupo, status: a.status, oferta: a.oferta, publico: a.publico, dor: a.dor, prova: a.prova, peso_campanha: a.peso_campanha, ...(sim.linhas.find(l => l.id === a.id) || {}), receita_nova: a.receita_nova })) } : null };
}

// ── campanha ──
function limparPlano(p) {
  if (!p) return null;
  if (p.tipo === 'estrategico') return { tipo: 'estrategico', alavancas: (Array.isArray(p.alavancas) ? p.alavancas : []).map(x => txt(x, 60)).slice(0, 12) };
  if (p.tipo === 'proprio') return { tipo: 'proprio', ...Object.fromEntries(['objetivo', 'publico', 'oferta', 'dor', 'prova', 'mensagem', 'racional'].map(k => [k, txtL(p[k], k === 'racional' ? 2000 : 400)])) };
  return null;
}
async function salvar(b, usuario) {
  const L = await lista(), x = b.campanha || {}, vig = await vigente();
  const nome = txt(x.nome, 90); if (!nome) throw new Error('Dê um nome à campanha');
  const inicio = data(x.inicio), fim = data(x.fim); if (!inicio || !fim) throw new Error('Informe o início e o fim da campanha'); if (fim < inicio) throw new Error('O fim vem antes do início');
  const plano = limparPlano(x.plano); const erro = validarPlano(plano, vig); if (erro) throw new Error(erro);
  if (plano.tipo === 'estrategico') { plano.versao = vig.versao; plano.plano_nome = vig.plano.nome; plano.briefing = briefingDoPlano(vig.plano, plano.alavancas); }
  const atual = x.id ? L.find(c => c.id === x.id) : null; if (x.id && !atual) throw new Error('Campanha não encontrada');
  const M = x.metas || {};
  const c = { ...(atual || { id: novoId('cmp'), acoes: [], criado_em: new Date().toISOString(), criado_por: usuario || null }),
    nome, objetivo: txt(x.objetivo, 200), inicio, fim, janela_dias: Math.max(0, Math.min(180, parseInt(x.janela_dias) || 60)), orcamento: num(x.orcamento), plano,
    metas: Object.fromEntries(['leads', 'reunioes', 'propostas', 'negocios', 'receita'].map(k => [k, num(M[k])])), atualizado_em: new Date().toISOString() };
  if (!c.utm) c.utm = utmCampanha(nome, inicio, L.map(z => z.utm));
  await gravar(atual ? L.map(z => z.id === c.id ? c : z) : [c, ...L]); return { campanha: c };
}
async function acaoSalvar(b) {
  const L = await lista(), c = L.find(z => z.id === b.campanha_id); if (!c) throw new Error('Campanha não encontrada');
  const x = b.acao || {}; if (!TIPOS[x.tipo]) throw new Error('Escolha o tipo da ação');
  const nome = txt(x.nome, 90); if (!nome) throw new Error('Dê um nome à ação');
  const atual = x.id ? c.acoes.find(a => a.id === x.id) : null; if (x.id && !atual) throw new Error('Ação não encontrada');
  const ref = x.ref?.id ? { kind: txt(x.ref.kind, 20) || x.tipo, id: txt(x.ref.id, 80), nome: txt(x.ref.nome, 120) } : null;
  if (ref && c.acoes.some(a => a.id !== x.id && a.ref?.id === ref.id && a.tipo === x.tipo)) throw new Error('Esse item já está ligado a outra ação desta campanha');
  if (ref && L.some(z => z.id !== c.id && (z.acoes || []).some(a => a.ref?.id === ref.id && a.tipo === x.tipo))) throw new Error('Esse item já pertence a outra campanha — cada ação conta em uma campanha só');
  const m = x.manual || {};
  const a = { ...(atual || { id: novoId('ac'), criado_em: new Date().toISOString(), utm_content: utmConteudo(x.tipo, nome, c.acoes.map(z => z.utm_content)) }),
    tipo: x.tipo, nome, ref, inicio: data(x.inicio), fim: data(x.fim), responsavel: txt(x.responsavel, 60), obs: txtL(x.obs, 600),
    custo_previsto: num(x.custo_previsto), custo_real: num(x.custo_real),
    manual: Object.fromEntries(['alcance', 'cliques', 'leads', 'reunioes', 'propostas', 'negocios', 'receita'].map(k => [k, num(m[k])])) };
  c.acoes = atual ? c.acoes.map(z => z.id === a.id ? a : z) : [...c.acoes, a]; c.atualizado_em = new Date().toISOString();
  await gravar(L); return { campanha: c, acao: a };
}
async function detalhe(b, req) {
  const L = await lista(), c = L.find(z => z.id === b.id); if (!c) throw new Error('Campanha não encontrada');
  const r = consolidar(c, await coletar([c])), B = base(req);
  return { campanha: c, resultado: r, links: Object.fromEntries((c.acoes || []).map(a => [a.id, linksAcao(B, c, a)])), link_geral: { captura: B + '/agenda/' + c.utm + '?f=geral', reuniao: B + '/reuniao/' + c.utm + '?f=geral' } };
}
async function inicio() {
  const L = await lista(), col = await coletar(L), vig = await vigente();
  return { campanhas: L.map(c => { const r = consolidar(c, col); return { id: c.id, nome: c.nome, objetivo: c.objetivo, inicio: c.inicio, fim: c.fim, utm: c.utm, plano: c.plano, orcamento: c.orcamento, metas: c.metas, n_acoes: (c.acoes || []).length, tipos: [...new Set((c.acoes || []).map(a => a.tipo))], status: r.status, totais: r.totais, ritmo: r.ritmo, fechada_em: c.fechamento?.em || null }; }),
    plano_vigente: vig?.plano ? { versao: vig.versao, nome: vig.plano.nome } : null, status_nome: STATUS_NOME, tipos: TIPOS };
}

// ── IA ──
async function claude(system, content, max = 1800) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: MODEL, max_tokens: max, system, messages: [{ role: 'user', content }] }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('IA [' + r.status + ']: ' + (d.error?.message || 'erro')); return (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
}
const jsonDe = t => { const s = String(t || '').replace(/```json|```/g, ''); const i = s.indexOf('{'); if (i < 0) throw new Error('A IA não devolveu o plano'); return JSON.parse(s.substring(i, s.lastIndexOf('}') + 1)); };
async function planoSugerir(b) {
  const x = b.campanha || {}; if (!txt(x.nome, 90) && !txt(x.objetivo, 200)) throw new Error('Escreva o nome ou o objetivo da campanha para a IA partir dele');
  const vig = await vigente();
  const t = await claude('Você é o estrategista de marketing B2B da Atlantyx (dados, IA e tecnologia para médias e grandes empresas; venda consultiva, ciclo longo). Escreva o PLANO de UMA campanha de marketing em português do Brasil, prático e específico. Não invente números de clientes nem cases com nomes reais. Responda só JSON: {"objetivo":"","publico":"cargos e tipo de empresa","oferta":"o que a pessoa ganha ao responder","dor":"","prova":"","mensagem":"mensagem central em 1 frase","racional":"por que esta campanha e por que agora, 3-5 frases","acoes":[{"tipo":"digital|anuncio|email|whatsapp|tv|webinar|evento","nome":"","por_que":""}],"metas":{"leads":0,"reunioes":0,"propostas":0,"negocios":0}}',
    JSON.stringify({ campanha: { nome: x.nome, objetivo: x.objetivo, inicio: x.inicio, fim: x.fim, orcamento: x.orcamento }, ideia_do_fundador: x.plano || null, prioridades_do_plano_estrategico: vig?.plano?.prioridades || null }).substring(0, 8000), 1500);
  const p = jsonDe(t); return { plano: { tipo: 'proprio', ...Object.fromEntries(['objetivo', 'publico', 'oferta', 'dor', 'prova', 'mensagem', 'racional'].map(k => [k, txtL(p[k], 1200)])) }, acoes_sugeridas: (p.acoes || []).filter(a => TIPOS[a.tipo]).slice(0, 8), metas: p.metas || null };
}
async function fechar(b, req, usuario) {
  const L = await lista(), c = L.find(z => z.id === b.id); if (!c) throw new Error('Campanha não encontrada');
  const d = await detalhe(b, req), r = d.resultado;
  const t = await claude('Você escreve o RELATÓRIO DE FECHAMENTO de uma campanha de marketing B2B da Atlantyx para o fundador. Português do Brasil, markdown curto (títulos ##, listas). Seções: Resultado em uma frase; Metas × realizado; Funil e conversões; Investimento, CPL, CAC e retorno; Ranking das ações (o que trouxe lead mais barato e o que não trouxe nada); O que repetir, o que cortar e o que testar na próxima; Lembrete de que negócios B2B ainda podem fechar na janela de atribuição. Use SÓ os números recebidos; quando um número for estimado (custo previsto em vez de real) ou estiver zerado por falta de dado, diga isso.',
    JSON.stringify({ campanha: { nome: c.nome, objetivo: c.objetivo, inicio: c.inicio, fim: c.fim, janela_dias: c.janela_dias, orcamento: c.orcamento, metas: c.metas, plano: c.plano }, resultado: { totais: r.totais, metas: r.metas, ritmo: r.ritmo, acoes: r.acoes.map(a => ({ tipo: a.tipo, nome: a.nome, custo: a.custo, custo_estimado: a.custo_estimado, alcance: a.alcance, cliques: a.cliques, leads: a.leads, reunioes: a.reunioes, propostas: a.propostas, negocios: a.negocios, receita: a.receita, cpl: a.cpl })), sem_acao: r.sem_acao } }).substring(0, 20000), 2200);
  c.fechamento = { em: new Date().toISOString(), por: usuario || null, texto: t, totais: r.totais, metas: r.metas }; await gravar(L);
  return { campanha: c };
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });
    const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {}, usuario = req.usuario || null;
    const acoes = {
      inicio: () => inicio(), opcoes: () => opcoes(), detalhe: () => detalhe(b, req),
      salvar: () => salvar(b, usuario),
      excluir: async () => { const L = await lista(); const c = L.find(z => z.id === b.id); if (!c) throw new Error('Campanha não encontrada'); await gravar(L.filter(z => z.id !== b.id)); return { ok: true }; },
      acao_salvar: () => acaoSalvar(b),
      acao_excluir: async () => { const L = await lista(), c = L.find(z => z.id === b.campanha_id); if (!c) throw new Error('Campanha não encontrada'); c.acoes = (c.acoes || []).filter(a => a.id !== b.id); await gravar(L); return { campanha: c }; },
      ajustes: async () => { const L = await lista(), c = L.find(z => z.id === b.id); if (!c) throw new Error('Campanha não encontrada'); const x = b.ajustes || {};
        c.ajustes = { ...Object.fromEntries(['reunioes', 'propostas', 'negocios', 'receita'].map(k => [k, num(x[k])])), obs: txtL(x.obs, 600) }; await gravar(L); return { campanha: c }; },
      metas_sugerir: async () => { const vig = await vigente(); if (!vig?.plano) throw new Error('Não há Plano Estratégico aprovado'); const ids = (b.alavancas || []).map(String);
        const m = metasDoPlano(planoSimular(vig.plano), vig.plano, ids, data(b.inicio), data(b.fim)); if (!m) throw new Error('Informe início e fim para calcular as metas'); return { metas: m, briefing: briefingDoPlano(vig.plano, ids) }; },
      plano_sugerir: () => planoSugerir(b),
      fechar: () => fechar(b, req, usuario),
      reabrir: async () => { const L = await lista(), c = L.find(z => z.id === b.id); if (!c) throw new Error('Campanha não encontrada'); delete c.fechamento; await gravar(L); return { campanha: c }; },
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) { console.error('[campanhas]', e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'campanhas');
export { slugRef as _slugRef, statusDe as _statusDe };
