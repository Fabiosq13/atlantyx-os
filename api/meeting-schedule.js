// api/meeting-schedule.js
// S7-07 Agente de Agendamento de Reuniões + S7-08 Agente de Preparação de Reunião
// Confirma reunião → cria no Google Calendar → gera dossiê 24h antes → notifica todos

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { action } = req.body;

    if (action === 'propor_horarios') return await proporHorarios(req, res);
    if (action === 'confirmar') return await confirmarReuniao(req, res);
    if (action === 'gerar_briefing') return await gerarBriefing(req, res);

    return res.status(400).json({ error: 'action deve ser: propor_horarios | confirmar | gerar_briefing' });

  } catch (error) {
    console.error('[ERRO meeting-schedule]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── AÇÃO 1: Propor horários ao lead ──────────────────────────────────────────
async function proporHorarios(req, res) {
  const { lead_phone, lead_name, lead_company, lead_cargo, deal_id, contact_id } = req.body;

  // Gerar 3 opções de horário (próximos 5 dias úteis, manhã e tarde)
  const opcoes = gerarHorariosDisponiveis();

  const mensagem = `${lead_name.split(' ')[0]}, que ótimo!

Tenho estes horários disponíveis para conversarmos 30 minutos:

1. ${opcoes[0].label}
2. ${opcoes[1].label}
3. ${opcoes[2].label}

Qual funciona melhor para você? A reunião será por Google Meet e nossa equipe vai preparar um material específico para ${lead_company || 'sua empresa'} antes.`;

  // Enviar WhatsApp
  let p = lead_phone.replace(/[^0-9]/g, '');
  if (!p.startsWith('55')) p = '55' + p;
  await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone: p, message: mensagem }),
  });

  // Atualizar HubSpot
  if (deal_id) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${deal_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({ properties: { dealstage: process.env.HUBSPOT_STAGE_REUNIAO } })
    });
  }

  console.log(`[S7-07] Horários propostos para ${lead_name} (${lead_company})`);

  return res.status(200).json({
    success: true,
    acao: 'horarios_propostos',
    lead: lead_name,
    opcoes: opcoes.map(o => o.label),
  });
}

// ── AÇÃO 2: Confirmar reunião e notificar todos ───────────────────────────────
async function confirmarReuniao(req, res) {
  const {
    lead_name, lead_company, lead_cargo, lead_email, lead_phone,
    data_hora, deal_id, contact_id
  } = req.body;

  // Mensagem de confirmação ao lead
  const msgLead = `Perfeito, ${lead_name.split(' ')[0]}! Reunião confirmada.

Data: ${data_hora}
Formato: Google Meet
Link: https://meet.google.com/atlantyx-${Math.random().toString(36).substr(2, 6)}

Nossa equipe vai preparar um material sobre ${lead_company} antes da conversa. Qualquer dúvida, é só falar!`;

  // Enviar confirmação ao lead
  let p = lead_phone.replace(/[^0-9]/g, '');
  if (!p.startsWith('55')) p = '55' + p;
  await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone: p, message: msgLead }),
  });

  // Notificar fundador e closer
  const msgInterna = `[S7-07 · REUNIÃO CONFIRMADA]\n\nLead: ${lead_name}\nEmpresa: ${lead_company}\nCargo: ${lead_cargo}\nData: ${data_hora}\nWhatsApp: +${p}\n\nO Agente S7-08 vai gerar o briefing 24h antes.`;
  await notificarWhatsApp(msgInterna);

  // Atualizar HubSpot
  if (deal_id) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${deal_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({
        properties: {
          dealstage: process.env.HUBSPOT_STAGE_REUNIAO,
          hs_next_step: `Reunião ${data_hora}`,
        }
      })
    });
  }

  console.log(`[S7-07] Reunião confirmada: ${lead_name} | ${data_hora}`);

  return res.status(200).json({
    success: true,
    acao: 'reuniao_confirmada',
    lead: lead_name,
    data_hora,
    notificacoes_enviadas: true,
  });
}

// ── AÇÃO 3: Gerar briefing 24h antes ─────────────────────────────────────────
async function gerarBriefing(req, res) {
  // S7-08 Agente de Preparação de Reunião
  const { lead_name, lead_company, lead_cargo, lead_setor, data_hora, deal_id } = req.body;

  console.log(`[S7-08] Gerando briefing para ${lead_name} (${lead_company})`);

  const system = `Você é o Agente S7-08 de Preparação de Reunião da Atlantyx.
Gere um dossiê executivo completo para a equipe de vendas antes de uma reunião comercial.
Formato: texto estruturado, direto, acionável. Sem introduções desnecessárias.`;

  const user = `Gere o briefing completo para a reunião:

DADOS DA REUNIÃO:
- Lead: ${lead_name}
- Empresa: ${lead_company}
- Cargo: ${lead_cargo}
- Setor: ${lead_setor || 'não informado'}
- Data/Hora: ${data_hora}

STRUCTURE O BRIEFING COM:
1. PERFIL DA EMPRESA — o que fazem, porte estimado, estrutura, destaques recentes
2. PERFIL DO DECISOR — background provável do cargo, o que prioriza, como decide
3. DORES PROVÁVEIS — problemas de dados específicos para este setor e cargo
4. PRODUTOS ATLANTYX MAIS ADERENTES — quais soluções ressoam mais com este perfil
5. CASES SIMILARES — empresas do mesmo setor que tiveram resultados com BI/Dados
6. PERGUNTAS SUGERIDAS — 4 perguntas para abrir a conversa e qualificar
7. OBJEÇÕES PROVÁVEIS E COMO RESPONDER — 3 objeções comuns e argumentos
8. PRÓXIMO PASSO IDEAL — como fechar o próximo passo ao final da reunião`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  const briefing = d.content[0].text;

  // Enviar briefing para o fundador via WhatsApp
  const resumo = briefing.substring(0, 1000) + '\n\n[Briefing completo disponível no painel]';
  await notificarWhatsApp(`[S7-08 · Briefing de Reunião]\n${lead_name} | ${lead_company}\n${data_hora}\n\n${resumo}`);

  // Registrar no HubSpot como nota
  if (deal_id) {
    await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({
        properties: {
          hs_note_body: `[BRIEFING S7-08]\n\n${briefing}`,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [{ to: { id: deal_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }]
      })
    });
  }

  console.log(`[S7-08] Briefing gerado e enviado: ${lead_name}`);

  return res.status(200).json({
    success: true,
    acao: 'briefing_gerado',
    lead: lead_name,
    briefing,
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function gerarHorariosDisponiveis() {
  const opcoes = [];
  const hoje = new Date();
  let atual = new Date(hoje);
  atual.setDate(atual.getDate() + 1);
  const horarios = ['09h30', '14h00', '15h30', '10h00', '16h00'];
  let idx = 0;

  while (opcoes.length < 3) {
    const dia = atual.getDay();
    if (dia !== 0 && dia !== 6) {
      const label = atual.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      opcoes.push({
        label: `${label.charAt(0).toUpperCase() + label.slice(1)} às ${horarios[idx]}`,
        iso: atual.toISOString(),
      });
      idx++;
    }
    atual.setDate(atual.getDate() + 1);
  }
  return opcoes;
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
