// api/decisor-map.js
// S7-04 Agente de Mapeamento de Decisores
// Recebe empresa → busca decisores C-level → enriquece no HubSpot → prepara para outreach

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { empresa, setor, hubspot_company_id, iniciar_outreach = false } = req.body;

    if (!empresa) return res.status(400).json({ error: 'Campo empresa é obrigatório' });

    console.log(`[S7-04] Mapeando decisores de: ${empresa}`);

    // ── 1. CLAUDE S7-04 — Identificar decisores C-level ──
    const decisores = await mapearDecisores(empresa, setor);
    console.log(`[S7-04] ${decisores.length} decisores identificados para ${empresa}`);

    // ── 2. Criar/atualizar contatos no HubSpot ──
    const contatosCriados = [];
    for (const d of decisores) {
      try {
        const contactId = await upsertContatoHubSpot(d, empresa, hubspot_company_id);
        contatosCriados.push({ id: contactId, nome: d.nome, cargo: d.cargo, prioridade: d.prioridade });

        // ── 3. Se outreach aprovado, criar deal e marcar para envio ──
        if (iniciar_outreach && d.prioridade === 'PRIMARIO') {
          await criarDealParaDecisore(d, empresa, contactId);
        }
      } catch (e) {
        console.error(`[ERRO] Decisor ${d.nome}:`, e.message);
      }
    }

    return res.status(200).json({
      success: true,
      empresa,
      decisores_mapeados: decisores.length,
      contatos_criados: contatosCriados.length,
      decisores: decisores.map(d => ({
        nome: d.nome,
        cargo: d.cargo,
        prioridade: d.prioridade,
        canal_recomendado: d.canal_recomendado,
        melhor_angulo: d.melhor_angulo,
      })),
    });

  } catch (error) {
    console.error('[ERRO decisor-map]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function mapearDecisores(empresa, setor) {
  const system = `Você é o Agente S7-04 de Mapeamento de Decisores da Atlantyx.
Missão: identificar os executivos C-level que decidem a compra de soluções de BI, Dados e IA.

HIERARQUIA DE DECISORES PARA A ATLANTYX:
- PRIMARIO (fecha o contrato): CIO, CTO, Diretor de TI, Diretor de Transformação Digital
- INFLUENCIADOR (pressiona a compra): CFO, Diretor de Operações, Diretor Comercial  
- USUARIO (usa a solução): Gerente de BI, Head de Dados, Coordenador de TI

CANAIS DE ABORDAGEM:
- WhatsApp: melhor para CIO/CTO com perfil executivo ativo
- LinkedIn DM: melhor para perfis mais acadêmicos/técnicos
- E-mail: melhor como complemento ao WhatsApp

Retorne APENAS JSON array válido.`;

  const user = `Mapeie os decisores de compra de BI/Dados/IA da empresa:
Empresa: ${empresa}
Setor: ${setor || 'não especificado'}

Para cada decisor identificado:
{
  "nome": "Nome completo se conhecido ou 'Decisor de TI da [empresa]'",
  "cargo": "Cargo exato",
  "nivel": "C-LEVEL | DIRETOR | GERENTE",
  "prioridade": "PRIMARIO | INFLUENCIADOR | USUARIO",
  "linkedin_url": "URL LinkedIn se disponível",
  "email_provavel": "padrao@empresa.com.br se deduzível",
  "canal_recomendado": "WHATSAPP | LINKEDIN | EMAIL",
  "melhor_angulo": "qual dor específica ressoará mais com este cargo",
  "melhor_horario": "manhã | tarde | fim de dia",
  "notas": "qualquer info relevante sobre este perfil"
}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  try {
    const text = d.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch { return []; }
}

async function upsertContatoHubSpot(decisor, empresa, companyId) {
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      properties: {
        firstname: decisor.nome.split(' ')[0],
        lastname: decisor.nome.split(' ').slice(1).join(' '),
        jobtitle: decisor.cargo,
        company: empresa,
        email: decisor.email_provavel || '',
        linkedin_url: decisor.linkedin_url || '',
        canal_recomendado: decisor.canal_recomendado || 'WHATSAPP',
        melhor_angulo: decisor.melhor_angulo || '',
        hs_lead_status: 'NEW',
        icp_score: decisor.prioridade === 'PRIMARIO' ? 'A' : 'B',
      }
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message);
  if (companyId) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${d.id}/associations/companies/${companyId}/1`, {
      method: 'PUT', headers: { 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` }
    });
  }
  return d.id;
}

async function criarDealParaDecisore(decisor, empresa, contactId) {
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      properties: {
        dealname: `${empresa} — ${decisor.cargo}`,
        dealstage: process.env.HUBSPOT_STAGE_MAPEADO,
        pipeline: process.env.HUBSPOT_PIPELINE_ID,
        hs_priority: 'high',
      }
    })
  });
  const deal = await r.json();
  if (deal.id) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${deal.id}/associations/contacts/${contactId}/3`, {
      method: 'PUT', headers: { 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` }
    });
  }
}
