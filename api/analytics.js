import { comGuarda } from '../lib/qa-guard.js';
// api/analytics.js
// S2-09 Agente de Analytics + Dashboard de métricas consolidadas S2 e S7
// Retorna KPIs em tempo real do HubSpot para o painel

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const { tipo = 'dashboard' } = req.query;

    if (tipo === 'pipeline') return await getPipelineData(req, res);
    if (tipo === 'kpis') return await getKPIs(req, res);
    if (tipo === 'analise') return await getAnaliseClaude(req, res);

    // Default: dashboard completo
    const [pipeline, kpis] = await Promise.all([
      fetchPipelineHubSpot(),
      fetchKPIsHubSpot(),
    ]);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      pipeline,
      kpis,
    });

  } catch (error) {
    console.error('[ERRO analytics]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function getPipelineData(req, res) {
  const data = await fetchPipelineHubSpot();
  return res.status(200).json({ success: true, pipeline: data });
}

async function getKPIs(req, res) {
  const data = await fetchKPIsHubSpot();
  return res.status(200).json({ success: true, kpis: data });
}

async function getAnaliseClaude(req, res) {
  const [pipeline, kpis] = await Promise.all([
    fetchPipelineHubSpot(),
    fetchKPIsHubSpot(),
  ]);

  // S2-09: Claude analisa os dados e gera insights acionáveis
  const analise = await analisarMetricasClaude(pipeline, kpis);
  return res.status(200).json({ success: true, analise, pipeline, kpis });
}

// v3.215: etapas reais do HubSpot (rótulo, ordem, fechada/ganha) — antes agrupava pelo id da etapa e a tela procurava
// rótulos fixos em português ("Mapeado", "Proposta"…) que nunca batiam: tudo aparecia zerado.
async function _hsEtapas(token) {
  const r = await _fetchHS('https://api.hubapi.com/crm/v3/pipelines/deals', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const d = await r.json(); const out = [];
  for (const p of d.results || []) (p.stages || []).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)).forEach((e, i) => out.push({ id: String(e.id), nome: e.label, pipeline: String(p.id), ordem: i,
    fechada: e.metadata?.isClosed === 'true' || e.metadata?.isClosed === true, ganha: (e.metadata?.isClosed === 'true' || e.metadata?.isClosed === true) && Number(e.metadata?.probability) >= 1, prob: e.metadata?.probability != null ? Number(e.metadata.probability) : null }));
  return out;
}
async function _hsBuscarTodos(token, objeto, corpo, maxPag = 20) {
  const out = []; let after, total = null;
  for (let i = 0; i < maxPag; i++) {
    const r = await _fetchHS(`https://api.hubapi.com/crm/v3/objects/${objeto}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...corpo, limit: 100, ...(after ? { after } : {}) }) });
    if (!r.ok) { if (!i) throw new Error('HubSpot ' + r.status); break; }
    const d = await r.json(); if (total == null) total = d.total ?? null; out.push(...(d.results || [])); after = d.paging?.next?.after; if (!after) break;
  }
  return { itens: out, total: total ?? out.length };
}
async function fetchPipelineHubSpot() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return { etapas: {}, lista_etapas: [], total_valor: 0, total_deals: 0, erro: 'HUBSPOT_TOKEN não configurado' };
  const todas = await _hsEtapas(token).catch(() => []);
  const pid = process.env.HUBSPOT_PIPELINE_ID || (todas[0]?.pipeline || null);
  const etapasPip = todas.filter(e => !pid || e.pipeline === pid);
  // só negócios ABERTOS (antes somava ganhos e perdidos como se fossem pipeline)
  const abertas = etapasPip.filter(e => !e.fechada).map(e => e.id);
  const filtros = [...(pid ? [{ propertyName: 'pipeline', operator: 'EQ', value: pid }] : []), ...(abertas.length ? [{ propertyName: 'dealstage', operator: 'IN', values: abertas }] : [{ propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' }])];
  const { itens: deals } = await _hsBuscarTodos(token, 'deals', { filterGroups: [{ filters: filtros }], properties: ['dealname', 'dealstage', 'amount', 'hs_priority', 'createdate', 'closedate'] });
  const nomeEt = Object.fromEntries(etapasPip.map(e => [e.id, e]));
  const etapas = {}; let total_valor = 0;
  for (const deal of deals) {
    const e = nomeEt[deal.properties.dealstage]; const chave = e ? e.nome : deal.properties.dealstage;
    if (!etapas[chave]) etapas[chave] = { id: deal.properties.dealstage, ordem: e ? e.ordem : 99, count: 0, valor: 0, deals: [] };
    const valor = parseFloat(deal.properties.amount || 0);
    etapas[chave].count++; etapas[chave].valor += valor; total_valor += valor;
    etapas[chave].deals.push({ id: deal.id, nome: deal.properties.dealname, valor, prioridade: deal.properties.hs_priority, fechamento: deal.properties.closedate || null });
  }
  // todas as etapas abertas aparecem, mesmo vazias, na ordem do HubSpot
  for (const e of etapasPip.filter(x => !x.fechada)) if (!etapas[e.nome]) etapas[e.nome] = { id: e.id, ordem: e.ordem, count: 0, valor: 0, deals: [] };
  const lista_etapas = Object.entries(etapas).map(([nome, v]) => ({ nome, ...v, deals: undefined })).sort((a, b) => a.ordem - b.ordem);
  return { etapas, lista_etapas, total_valor, total_deals: deals.length, pipeline_id: pid };
}

async function fetchKPIsHubSpot() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return {};
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [ct, dl, et] = await Promise.all([
    _hsBuscarTodos(token, 'contacts', { filterGroups: [{ filters: [{ propertyName: 'createdate', operator: 'GTE', value: trintaDiasAtras }] }], properties: ['hs_lead_status', 'icp_score', 'createdate'] }, 10).catch(() => ({ itens: [], total: 0 })),
    _hsBuscarTodos(token, 'deals', { filterGroups: [{ filters: [{ propertyName: 'createdate', operator: 'GTE', value: trintaDiasAtras }] }], properties: ['dealstage', 'amount', 'hs_priority'] }, 10).catch(() => ({ itens: [], total: 0 })),
    _hsEtapas(token).catch(() => []),
  ]);
  const contatos = ct.itens, deals = dl.itens;
  const scoreA = contatos.filter(c => c.properties.icp_score === 'A').length;
  const scoreB = contatos.filter(c => c.properties.icp_score === 'B').length;
  // reunião/proposta: pela variável (se existir) ou pelo NOME da etapa no HubSpot (antes ficava 0 sem a variável)
  const idsPor = (env, rx) => env ? [env] : et.filter(e => rx.test(e.nome || '')).map(e => e.id);
  const idsReu = idsPor(process.env.HUBSPOT_STAGE_REUNIAO, /reuni|meeting|agend|apresenta|appointment/i), idsProp = idsPor(process.env.HUBSPOT_STAGE_PROPOSTA, /proposta|proposal|or[cç]amento|negocia/i);
  const reunioes = deals.filter(d => idsReu.includes(d.properties.dealstage)).length;
  const propostas = deals.filter(d => idsProp.includes(d.properties.dealstage)).length;
  let pipe = null; try { pipe = await fetchPipelineHubSpot(); } catch (_) {}
  return {
    leads_30_dias: ct.total ?? contatos.length,
    score_a: scoreA, score_b: scoreB,
    taxa_qualificacao: contatos.length > 0 ? Math.round((scoreA / contatos.length) * 100) : 0,
    deals_30_dias: dl.total ?? deals.length,
    reunioes_agendadas: reunioes, propostas_enviadas: propostas,
    // pipeline = valor dos negócios ABERTOS (antes: só os criados nos últimos 30 dias)
    pipeline_valor: pipe ? pipe.total_valor : deals.reduce((s, d) => s + parseFloat(d.properties.amount || 0), 0),
    pipeline_negocios: pipe ? pipe.total_deals : null,
    valor_criado_30_dias: deals.reduce((s, d) => s + parseFloat(d.properties.amount || 0), 0),
  };
}

async function analisarMetricasClaude(pipeline, kpis) {
  // S2-09: Claude gera análise acionável dos dados
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Você é o Agente S2-09 Analytics da Atlantyx. Analise estes dados do pipeline e gere 3 insights acionáveis e 2 alertas.

KPIs: ${JSON.stringify(kpis)}
Pipeline: Total de deals: ${pipeline.total_deals} | Valor total: R$${pipeline.total_valor?.toLocaleString('pt-BR')}

Retorne JSON:
{
  "insights": ["insight 1 acionável", "insight 2", "insight 3"],
  "alertas": ["alerta urgente 1", "alerta 2"],
  "recomendacao_principal": "uma ação principal para esta semana",
  "tendencia": "POSITIVA | NEUTRA | NEGATIVA",
  "meta_progresso": "como está o pipeline aberto em relação ao ritmo de vendas necessário"
}`
      }]
    })
  });
  const d = await r.json();
  try {
    const text = d.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch {
    return { insights: [], alertas: [], recomendacao_principal: 'Continue o outreach ativo', tendencia: 'NEUTRA' };
  }
}

// v3.22: cache de 5 min das consultas ao HubSpot (a tela de agentes levava ~18s a cada abertura)
// v3.43: o cache em memória se perde a cada instância nova da Vercel (o Dashboard ainda levava 17s) —
// agora também fica no banco (kv_store) por 5 min, e um resultado de até 1h é devolvido na hora
// enquanto a atualização roda em segundo plano.
const _memoHS = new Map();
let _sqlA = null;
async function _sql() { if (_sqlA) return _sqlA; if (!process.env.DATABASE_URL) return null; const { neon } = await import('@neondatabase/serverless'); _sqlA = neon(process.env.DATABASE_URL); return _sqlA; }
async function _cacheLer(nome) { try { const sql = await _sql(); if (!sql) return null; const r = await sql`SELECT value, updated_at FROM kv_store WHERE key = ${'cache:analytics:' + nome} LIMIT 1`; if (!r[0]) return null;
  const v = typeof r[0].value === 'string' ? JSON.parse(r[0].value) : r[0].value; return { v, em: new Date(r[0].updated_at).getTime() }; } catch (_) { return null; } }
async function _cacheGravar(nome, v) { try { const sql = await _sql(); if (!sql) return; await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${'cache:analytics:' + nome}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; } catch (_) {} }
function _memo(nome, fn, ms = 300000) {
  return async (...a) => {
    const c = _memoHS.get(nome); if (c && Date.now() - c.em < ms) return c.p;
    const buscar = () => { const p = fn(...a).then(v => { if (v && (v.total_deals || v.leads_30_dias)) _cacheGravar(nome, v); return v; }); _memoHS.set(nome, { em: Date.now(), p }); p.catch(() => _memoHS.delete(nome)); return p; };
    const db = await _cacheLer(nome);
    if (db && Date.now() - db.em < ms) { const p = Promise.resolve(db.v); _memoHS.set(nome, { em: db.em, p }); return p; }
    if (db && Date.now() - db.em < 3600000) { buscar().catch(() => {}); return db.v; } // devolve o recente e atualiza em segundo plano
    return buscar();
  };
}
// limite de 12s por chamada ao HubSpot (antes podia ficar pendurada até o fim da função)
const _fetchHS = (url, opt) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 12000); return fetch(url, { ...opt, signal: c.signal }).finally(() => clearTimeout(t)); };
fetchPipelineHubSpot = _memo('pipeline', fetchPipelineHubSpot);
fetchKPIsHubSpot = _memo('kpis', fetchKPIsHubSpot);

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'analytics');
