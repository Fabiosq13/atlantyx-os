// api/lead-capture.js
// Agente S2-02 + S7-05
// Recebe lead do Meta Ads / LinkedIn → Claude gera mensagem → HubSpot → WhatsApp

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Hub-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;

    // ── 1. NORMALIZAR DADOS DO LEAD (Meta, LinkedIn ou formulário próprio) ──
    const lead = normalizeLead(body);
    console.log(`[S2] Lead recebido: ${lead.name} | ${lead.company} | Score: ${lead.score_label}`);

    // ── 2. CLAUDE — Agente S2-02 Mapeamento + S7-05 Outreach WhatsApp ──
    const mensagem = await gerarMensagemClaude(lead);
    console.log(`[S7-05] Mensagem gerada para ${lead.name}`);

    // ── 3. HUBSPOT — Criar contato + deal no pipeline ──
    const { contactId, dealId } = await criarNoHubSpot(lead);
    console.log(`[HubSpot] Contato ${contactId} + Deal ${dealId} criados`);

    // ── 4. Z-API — Enviar WhatsApp ──
    if (lead.phone) {
      await enviarWhatsApp(lead.phone, mensagem);
      console.log(`[S7-05] WhatsApp enviado para ${lead.phone}`);
      await atualizarDealHubSpot(dealId, 'ABORDADO');
    }

    // ── 5. AGENDAR FOLLOW-UP 48H ──
    await agendarFollowUp(lead, dealId, mensagem);

    return res.status(200).json({
      success: true,
      lead: lead.name,
      company: lead.company,
      score: lead.score_label,
      hubspot_contact: contactId,
      hubspot_deal: dealId,
      whatsapp_sent: !!lead.phone,
      followup_scheduled: true
    });

  } catch (error) {
    console.error('[ERRO lead-capture]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── FUNÇÕES ───────────────────────────────────────────────────────────────────

function normalizeLead(body) {
  const lead = {
    name:      body.name || body.full_name || body.nome || body.field_data?.find(f => f.name === 'full_name')?.values?.[0] || 'Não informado',
    email:     body.email || body.email_address || body.field_data?.find(f => f.name === 'email')?.values?.[0] || '',
    phone:     body.phone || body.whatsapp || body.telefone || body.field_data?.find(f => f.name === 'phone_number')?.values?.[0] || '',
    company:   body.company || body.company_name || body.empresa || body.field_data?.find(f => f.name === 'company_name')?.values?.[0] || '',
    job_title: body.job_title || body.cargo || body.title || body.field_data?.find(f => f.name === 'job_title')?.values?.[0] || '',
    source:    body.source || body.ad_name || body.campaign_name || body.form_name || 'Campanha Digital',
    timestamp: new Date().toISOString(),
  };

  // Score ICP Atlantyx
  let score = 0;
  if (lead.company) score += 20;
  if (/CIO|CTO|CFO|CEO|Diretor|Director|VP|Head|Gerente/i.test(lead.job_title)) score += 40;
  if (lead.phone) score += 20;
  if (lead.email && !/@gmail|@hotmail|@yahoo|@outlook/.test(lead.email)) score += 20;
  lead.score = score;
  lead.score_label = score >= 60 ? 'A' : score >= 40 ? 'B' : 'C';

  // Formatar telefone para WhatsApp
  if (lead.phone) {
    let phone = lead.phone.replace(/[^0-9]/g, '');
    if (!phone.startsWith('55')) phone = '55' + phone;
    lead.phone = phone;
  }

  return lead;
}

async function gerarMensagemClaude(lead) {
  // Agente S2-02 Mapeamento + S7-05 Outreach WhatsApp
  const systemPrompt = `Você é o Agente de WhatsApp da Atlantyx — empresa especializada em BI, Dados e IA para grandes empresas.

MISSÃO: Criar UMA mensagem de WhatsApp de primeiro contato que soa 100% humana e personalizada.

ATLANTYX RESOLVE: empresas tomam decisões com dados atrasados ou inconsistentes, gerando perda financeira real. Transformamos dados em inteligência acionável sem trocar toda a estrutura — Quick Wins em semanas, ROI mensurável.

REGRAS:
- Máximo 5 linhas
- Começar pelo primeiro nome da pessoa
- Mencionar a empresa pelo nome
- Tom profissional e direto para o cargo informado
- Terminar com UMA pergunta simples que abre conversa
- NUNCA usar emojis
- NUNCA mencionar que é IA ou sistema automatizado
- NUNCA começar com "Olá, meu nome é..."`;

  const userPrompt = `Crie a mensagem de primeiro contato:
Nome: ${lead.name}
Empresa: ${lead.company || 'a empresa'}
Cargo: ${lead.job_title || 'Gestor'}
Veio de: ${lead.source}
Score ICP: ${lead.score_label}

Retorne APENAS a mensagem, sem aspas ou explicações.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Claude API: ${data.error?.message}`);
  return data.content[0].text;
}

async function criarNoHubSpot(lead) {
  const token = process.env.HUBSPOT_TOKEN;
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  // Criar contato
  const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      properties: {
        firstname: lead.name.split(' ')[0],
        lastname: lead.name.split(' ').slice(1).join(' ') || '',
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        jobtitle: lead.job_title,
        hs_lead_status: 'NEW',
        icp_score: lead.score_label,
        lead_source_campaign: lead.source,
      }
    })
  });
  const contact = await contactRes.json();
  if (!contactRes.ok) throw new Error(`HubSpot contato: ${JSON.stringify(contact)}`);
  const contactId = contact.id;

  // Criar deal
  const dealRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      properties: {
        dealname: `${lead.company || lead.name} — ${lead.source}`,
        dealstage: process.env.HUBSPOT_STAGE_MAPEADO,
        pipeline: process.env.HUBSPOT_PIPELINE_ID,
        hs_priority: lead.score_label === 'A' ? 'high' : 'medium',
        amount: '',
      }
    })
  });
  const deal = await dealRes.json();
  if (!dealRes.ok) throw new Error(`HubSpot deal: ${JSON.stringify(deal)}`);
  const dealId = deal.id;

  // Associar contato ao deal
  await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/3`, {
    method: 'PUT', headers
  });

  return { contactId, dealId };
}

async function enviarWhatsApp(phone, message) {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  const res = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
    body: JSON.stringify({ phone, message }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Z-API WhatsApp: ${JSON.stringify(err)}`);
  }
  return res.json();
}

async function atualizarDealHubSpot(dealId, etapa) {
  const stages = {
    'MAPEADO':    process.env.HUBSPOT_STAGE_MAPEADO,
    'ABORDADO':   process.env.HUBSPOT_STAGE_ABORDADO,
    'RESPONDEU':  process.env.HUBSPOT_STAGE_RESPONDEU,
    'REUNIAO':    process.env.HUBSPOT_STAGE_REUNIAO,
    'PROPOSTA':   process.env.HUBSPOT_STAGE_PROPOSTA,
    'PERDIDO':    process.env.HUBSPOT_STAGE_PERDIDO,
  };

  await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({ properties: { dealstage: stages[etapa] || stages['ABORDADO'] } })
  });
}

async function agendarFollowUp(lead, dealId, mensagemOriginal) {
  // Armazena no Vercel KV ou Edge Config para o cron buscar
  // Por simplicidade, usamos a própria API do Vercel Edge Config
  // O cron /api/followup-cron vai buscar esses registros
  try {
    await fetch(`${process.env.VERCEL_URL || 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/followup-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY },
      body: JSON.stringify({
        phone: lead.phone,
        name: lead.name,
        company: lead.company,
        job_title: lead.job_title,
        dealId,
        mensagemOriginal,
        sendAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
    });
  } catch(e) {
    console.log('[Follow-up] Agendamento via KV não disponível ainda:', e.message);
  }
}
