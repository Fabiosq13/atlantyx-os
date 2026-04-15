// api/outreach-batch.js
// S7-05 Agente de Outreach via WhatsApp — Envio em Lote
// Recebe lista de leads aprovados → Claude gera mensagem individual → Z-API envia → HubSpot atualiza

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { leads, tom = 'Direto e objetivo', delay_segundos = 30 } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Campo leads[] é obrigatório' });
    }

    console.log(`[S7-05] Iniciando outreach em lote: ${leads.length} leads`);

    const resultados = [];
    let enviados = 0;
    let erros = 0;

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      try {
        if (!lead.phone) {
          resultados.push({ nome: lead.name, status: 'SEM_TELEFONE' });
          continue;
        }

        // Delay entre envios para parecer natural e evitar bloqueio
        if (i > 0) await sleep(delay_segundos * 1000);

        // ── Claude gera mensagem única para este decisor ──
        const mensagem = await gerarMensagemPersonalizada(lead, tom);

        // ── Enviar via Z-API ──
        await enviarWhatsApp(lead.phone, mensagem);

        // ── Atualizar HubSpot ──
        if (lead.deal_id) await moverDealHubSpot(lead.deal_id, 'ABORDADO');
        if (lead.contact_id) await registrarAtividade(lead.contact_id, `[S7-05] Outreach WhatsApp enviado. Tom: ${tom}`);

        resultados.push({ nome: lead.name, empresa: lead.company, status: 'ENVIADO', phone: lead.phone });
        enviados++;
        console.log(`[S7-05] ${i + 1}/${leads.length} — Enviado: ${lead.name} (${lead.company})`);

      } catch (e) {
        console.error(`[ERRO] ${lead.name}:`, e.message);
        resultados.push({ nome: lead.name, status: 'ERRO', erro: e.message });
        erros++;
      }
    }

    // Notificar fundador com resumo
    await notificarWhatsApp(
      `[S7-05 · Outreach Concluído]\n\nTotal: ${leads.length}\nEnviados: ${enviados}\nErros: ${erros}\n\nAcompanhe as respostas no painel.`
    );

    return res.status(200).json({
      success: true,
      total: leads.length,
      enviados,
      erros,
      resultados,
    });

  } catch (error) {
    console.error('[ERRO outreach-batch]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function gerarMensagemPersonalizada(lead, tom) {
  const system = `Você é o Agente de Outreach S7-05 da Atlantyx.
Crie mensagens de WhatsApp que soam 100% humanas, nunca genéricas.
A Atlantyx resolve: dados desconectados → decisões ruins → perda financeira.
Entrega Quick Wins em semanas. Integra com sistemas existentes. ROI mensurável.
NUNCA use emojis. NUNCA mencione IA ou automação. Tom: ${tom}.`;

  const user = `Crie UMA mensagem WhatsApp de primeiro contato:
Nome: ${lead.name}
Empresa: ${lead.company || 'a empresa'}
Cargo: ${lead.job_title || 'Gestor'}
Setor: ${lead.setor || ''}
Sinal de compra: ${lead.sinal_compra || 'empresa com operação complexa'}
Dores prováveis: ${lead.dores || ''}

Regras:
- Máximo 5 linhas
- Começar pelo primeiro nome
- Mencionar a empresa e algo específico do contexto
- Terminar com pergunta simples
- Retornar APENAS a mensagem`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  return d.content[0].text;
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

async function moverDealHubSpot(dealId, etapa) {
  const stages = { 'ABORDADO': process.env.HUBSPOT_STAGE_ABORDADO };
  await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({ properties: { dealstage: stages[etapa] } })
  });
}

async function registrarAtividade(contactId, nota) {
  await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      properties: { hs_note_body: nota, hs_timestamp: new Date().toISOString() },
      associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 10 }] }]
    })
  });
}

async function notificarWhatsApp(message) {
  const phone = process.env.FUNDADOR_WHATSAPP;
  if (!phone) return;
  await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone, message }),
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
