// api/wa-batch-generate.js
// S2-02 + S7-05 — Busca leads do HubSpot (gerados pela prospecção) e gera mensagens em lote
// Retorna lista completa com mensagem principal + follow-up 48h prontos para revisar/enviar

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ── 1. BUSCAR LEADS DO HUBSPOT gerados pela prospecção ──
    const { filtro = 'novos', enviar = false, tom = 'Direto e objetivo' } = req.query;
    console.log(`[S2-02+S7-05] Buscando leads HubSpot, filtro: ${filtro}`);

    const leads = await buscarLeadsHubSpot(filtro);
    if (!leads.length) {
      return res.status(200).json({ success: true, total: 0, mensagens: [], aviso: 'Nenhum lead encontrado. Execute a prospecção primeiro.' });
    }

    console.log(`[S2-02+S7-05] ${leads.length} leads encontrados. Gerando mensagens em lote...`);

    // ── 2. CLAUDE — Gerar TODAS as mensagens em UMA só chamada (mais eficiente) ──
    const mensagens = await gerarMensagensEmLote(leads, tom);

    // ── 3. Se enviar=true, disparar via Z-API imediatamente ──
    let enviados = 0;
    if (enviar === 'true') {
      for (let i = 0; i < mensagens.length; i++) {
        const m = mensagens[i];
        if (m.phone) {
          try {
            await enviarWhatsApp(m.phone, m.mensagem);
            await sleep(30000); // 30s entre envios
            await atualizarHubSpot(m.deal_id, m.contact_id);
            mensagens[i].enviado = true;
            enviados++;
          } catch (e) {
            mensagens[i].enviado = false;
            mensagens[i].erro = e.message;
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      total: leads.length,
      enviados: enviar === 'true' ? enviados : 0,
      pendentes_aprovacao: enviar !== 'true' ? leads.length : 0,
      mensagens,
    });

  } catch (error) {
    console.error('[ERRO wa-batch-generate]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── FUNÇÕES ──────────────────────────────────────────────────────────────────

async function buscarLeadsHubSpot(filtro) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return [];

  // Filtros disponíveis: 'novos' (não abordados), 'todos', 'score_a', 'sem_mensagem'
  const filtros = {
    novos: [
      { propertyName: 'hs_lead_status', operator: 'IN', values: ['NEW', 'OPEN'] },
    ],
    score_a: [
      { propertyName: 'icp_score', operator: 'EQ', value: 'A' },
      { propertyName: 'hs_lead_status', operator: 'IN', values: ['NEW', 'OPEN'] },
    ],
    todos: [],
  };

  const body = {
    filterGroups: filtros[filtro] ? [{ filters: filtros[filtro] }] : [],
    properties: [
      'firstname', 'lastname', 'email', 'phone', 'company',
      'jobtitle', 'icp_score', 'sinal_compra', 'dores_provaveis',
      'lead_source_campaign', 'melhor_angulo', 'canal_recomendado'
    ],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 50,
  };

  const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!r.ok) return [];
  const data = await r.json();

  return (data.results || []).map(c => {
    const p = c.properties;
    return {
      contact_id: c.id,
      name: `${p.firstname || ''} ${p.lastname || ''}`.trim() || 'Decisor',
      email: p.email || '',
      phone: p.phone || '',
      company: p.company || '',
      job_title: p.jobtitle || '',
      score: p.icp_score || 'B',
      sinal_compra: p.sinal_compra || '',
      dores: p.dores_provaveis || '',
      source: p.lead_source_campaign || '',
      melhor_angulo: p.melhor_angulo || '',
      canal: p.canal_recomendado || 'WHATSAPP',
    };
  }).filter(l => l.name !== '' && (l.phone || l.email));
}

async function gerarMensagensEmLote(leads, tom) {
  // Gera todas as mensagens em paralelo (mais rápido que serial)
  const promises = leads.map(lead => gerarParaLead(lead, tom));
  const resultados = await Promise.allSettled(promises);

  return resultados.map((r, i) => {
    const lead = leads[i];
    if (r.status === 'fulfilled') {
      return { ...r.value, contact_id: lead.contact_id, phone: lead.phone, email: lead.email, score: lead.score, canal: lead.canal, enviado: false };
    }
    return { name: lead.name, company: lead.company, contact_id: lead.contact_id, phone: lead.phone, score: lead.score, mensagem: null, followup: null, erro: r.reason?.message, enviado: false };
  });
}

async function gerarParaLead(lead, tom) {
  const system = `Você é o Agente S2-02 + S7-05 da Atlantyx (BI, Dados, IA para grandes empresas).
Atlantyx resolve: decisões com dados atrasados/inconsistentes = perda financeira real.
Entrega Quick Wins em semanas, integra com sistemas existentes, ROI mensurável.
Tom: ${tom}. NUNCA emojis. NUNCA revelar que é IA.`;

  const user = `Gere DOIS textos em JSON para:
Nome: ${lead.name}
Empresa: ${lead.company}
Cargo: ${lead.job_title}
Score ICP: ${lead.score}
Sinal de compra: ${lead.sinal_compra || 'empresa com operação complexa'}
Dores prováveis: ${lead.dores || ''}
Melhor ângulo: ${lead.melhor_angulo || ''}

Retorne APENAS JSON (sem markdown):
{
  "mensagem": "mensagem de 1º contato — max 5 linhas, começa pelo primeiro nome, menciona a empresa, termina com pergunta simples",
  "followup": "follow-up diferente para 48h sem resposta — max 3 linhas, nova abordagem"
}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, system, messages: [{ role: 'user', content: user }] })
  });

  const d = await r.json();
  const text = d.content[0].text.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(text);
    return { name: lead.name, company: lead.company, job_title: lead.job_title, mensagem: parsed.mensagem, followup: parsed.followup };
  } catch {
    // Fallback se JSON não parsear
    return { name: lead.name, company: lead.company, job_title: lead.job_title, mensagem: text.substring(0, 500), followup: `Olá ${lead.name.split(' ')[0]}, queria retomar nossa conversa. Há disponibilidade para uma troca rápida sobre como a ${lead.company} toma decisões com dados hoje?` };
  }
}

async function enviarWhatsApp(phone, message) {
  let p = phone.replace(/[^0-9]/g, '');
  if (!p.startsWith('55')) p = '55' + p;
  await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone: p, message }),
  });
}

async function atualizarHubSpot(dealId, contactId) {
  if (contactId) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({ properties: { hs_lead_status: 'OPEN' } })
    });
  }
  if (dealId) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({ properties: { dealstage: process.env.HUBSPOT_STAGE_ABORDADO } })
    });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
