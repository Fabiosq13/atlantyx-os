// api/analytics.js
// S2-09 Agente de Analytics + Dashboard de métricas consolidadas S2 e S7
// Retorna KPIs em tempo real do HubSpot para o painel

export default async function handler(req, res) {
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

async function fetchPipelineHubSpot() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return { etapas: [], total_valor: 0, total_deals: 0 };

  const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: process.env.HUBSPOT_PIPELINE_ID || '' }] }],
      properties: ['dealname', 'dealstage', 'amount', 'hs_priority', 'createdate', 'closedate'],
      limit: 100,
    })
  });

  if (!r.ok) return { etapas: [], total_valor: 0, total_deals: 0 };
  const d = await r.json();
  const deals = d.results || [];

  // Agrupar por etapa
  const etapas = {};
  let total_valor = 0;

  for (const deal of deals) {
    const etapa = deal.properties.dealstage;
    if (!etapas[etapa]) etapas[etapa] = { count: 0, valor: 0, deals: [] };
    etapas[etapa].count++;
    const valor = parseFloat(deal.properties.amount || 0);
    etapas[etapa].valor += valor;
    total_valor += valor;
    etapas[etapa].deals.push({
      id: deal.id,
      nome: deal.properties.dealname,
      valor,
      prioridade: deal.properties.hs_priority,
    });
  }

  return { etapas, total_valor, total_deals: deals.length };
}

async function fetchKPIsHubSpot() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return {};

  // Buscar contatos criados nos últimos 30 dias
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [contatosRes, dealsRes] = await Promise.all([
    fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'createdate', operator: 'GTE', value: trintaDiasAtras }] }],
        properties: ['hs_lead_status', 'icp_score', 'createdate'],
        limit: 200,
      })
    }),
    fetch('https://api.hubapi.com/crm/v3/objects/deals/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'createdate', operator: 'GTE', value: trintaDiasAtras }] }],
        properties: ['dealstage', 'amount', 'hs_priority'],
        limit: 200,
      })
    }),
  ]);

  const contatos = contatosRes.ok ? (await contatosRes.json()).results || [] : [];
  const deals = dealsRes.ok ? (await dealsRes.json()).results || [] : [];

  const scoreA = contatos.filter(c => c.properties.icp_score === 'A').length;
  const scoreB = contatos.filter(c => c.properties.icp_score === 'B').length;
  const reunioes = deals.filter(d => d.properties.dealstage === process.env.HUBSPOT_STAGE_REUNIAO).length;
  const propostas = deals.filter(d => d.properties.dealstage === process.env.HUBSPOT_STAGE_PROPOSTA).length;

  return {
    leads_30_dias: contatos.length,
    score_a: scoreA,
    score_b: scoreB,
    taxa_qualificacao: contatos.length > 0 ? Math.round((scoreA / contatos.length) * 100) : 0,
    deals_30_dias: deals.length,
    reunioes_agendadas: reunioes,
    propostas_enviadas: propostas,
    pipeline_valor: deals.reduce((s, d) => s + parseFloat(d.properties.amount || 0), 0),
  };
}

async function analisarMetricasClaude(pipeline, kpis) {
  // S2-09: Claude gera análise acionável dos dados
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
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
  "meta_progresso": "como está o progresso em relação à meta de R$5M"
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
