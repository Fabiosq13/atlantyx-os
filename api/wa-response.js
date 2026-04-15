// api/wa-response.js
// Agente S7-05 (Outreach WhatsApp) + S7-07 (Agendamento de Reuniões)
// Recebe resposta do lead via Z-API → Claude analisa → HubSpot atualiza → agenda reunião

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;

    // Verificar se é uma mensagem recebida (não enviada)
    if (body.type !== 'ReceivedCallback' && body.fromMe) {
      return res.status(200).json({ ignored: true, reason: 'Mensagem enviada pela Atlantyx, não pelo lead' });
    }

    const phone = body.phone || body.from;
    const mensagemRecebida = body.text?.message || body.body || '';

    if (!phone || !mensagemRecebida) {
      return res.status(200).json({ ignored: true, reason: 'Sem dados suficientes' });
    }

    console.log(`[S7-05] Resposta recebida de ${phone}: "${mensagemRecebida.substring(0, 50)}..."`);

    // ── 1. BUSCAR CONTATO NO HUBSPOT pelo telefone ──
    const contato = await buscarContatoPorTelefone(phone);
    if (!contato) {
      console.log(`[HubSpot] Contato não encontrado para ${phone}`);
      return res.status(200).json({ ignored: true, reason: 'Contato não encontrado no HubSpot' });
    }

    // ── 2. CLAUDE — Analisar sentimento e intenção da resposta ──
    const analise = await analisarRespostaClaude(mensagemRecebida, contato);
    console.log(`[S7-05] Análise: ${analise.intencao} | Sentimento: ${analise.sentimento}`);

    // ── 3. ATUALIZAR HUBSPOT conforme análise ──
    await processarIntencao(analise, contato, phone, mensagemRecebida);

    return res.status(200).json({
      success: true,
      phone,
      intencao: analise.intencao,
      sentimento: analise.sentimento,
      acao_tomada: analise.acao,
    });

  } catch (error) {
    console.error('[ERRO wa-response]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── FUNÇÕES ───────────────────────────────────────────────────────────────────

async function buscarContatoPorTelefone(phone) {
  // Normalizar telefone para busca
  let phoneClean = phone.replace(/[^0-9]/g, '');
  if (phoneClean.startsWith('55')) phoneClean = phoneClean.slice(2);

  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      filterGroups: [{
        filters: [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: phoneClean }]
      }],
      properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'jobtitle', 'hs_object_id'],
      limit: 1
    })
  });

  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;

  const c = data.results[0];
  const props = c.properties;

  // Buscar deal associado
  const dealRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${c.id}/associations/deals`, {
    headers: { 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` }
  });
  const dealData = await dealRes.json();
  const dealId = dealData.results?.[0]?.id || null;

  return {
    id: c.id,
    name: `${props.firstname || ''} ${props.lastname || ''}`.trim(),
    email: props.email,
    phone: props.phone,
    company: props.company,
    job_title: props.jobtitle,
    dealId,
  };
}

async function analisarRespostaClaude(mensagem, contato) {
  const systemPrompt = `Você é o Agente de Análise de Resposta da Atlantyx.
Analise a mensagem do lead e retorne um JSON com:
- intencao: "INTERESSE" | "DUVIDA" | "PEDIR_MAIS_INFO" | "AGENDAR_REUNIAO" | "REJEICAO" | "REJEICAO_MOMENTO"
- sentimento: "POSITIVO" | "NEUTRO" | "NEGATIVO"  
- resposta: texto da resposta que o agente deve enviar (max 4 linhas, sem emojis, tom consultivo)
- acao: descrição curta do que foi decidido

Contexto: Atlantyx é empresa de BI/Dados/IA para grandes empresas.
Lead: ${contato.name} | ${contato.company} | ${contato.job_title}

Retorne APENAS o JSON válido, sem markdown.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Mensagem do lead: "${mensagem}"` }],
    }),
  });

  const data = await res.json();
  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    // Fallback se o JSON não for perfeito
    return {
      intencao: 'DUVIDA',
      sentimento: 'NEUTRO',
      resposta: 'Obrigado pelo retorno! Posso explicar melhor como a Atlantyx funciona. Qual o maior desafio com dados que vocês enfrentam hoje?',
      acao: 'Resposta de dúvida — agente enviou qualificação'
    };
  }
}

async function processarIntencao(analise, contato, phone, mensagemRecebida) {
  const { intencao, resposta } = analise;

  // Mapa de ações por intenção
  const acoes = {
    'INTERESSE': async () => {
      await atualizarFunil(contato.dealId, 'RESPONDEU');
      // Agente S7-07: propor horários de reunião
      const msgReuniao = await gerarPropostaReuniao(contato);
      await enviarWhatsApp(phone, msgReuniao);
      await registrarAtividade(contato.id, `Lead demonstrou interesse. Agente S7-07 propôs reunião. Resposta: "${mensagemRecebida.substring(0,100)}"`);
    },

    'AGENDAR_REUNIAO': async () => {
      await atualizarFunil(contato.dealId, 'REUNIAO');
      const msgConfirmacao = await gerarConfirmacaoReuniao(contato);
      await enviarWhatsApp(phone, msgConfirmacao);
      await registrarAtividade(contato.id, `Lead pediu para agendar reunião. Agente S7-07 enviou confirmação.`);
      // Notificar o fundador
      await notificarFundador(contato, phone);
    },

    'DUVIDA': async () => {
      await enviarWhatsApp(phone, resposta);
      await registrarAtividade(contato.id, `Lead com dúvida. Agente respondeu: "${resposta.substring(0,80)}"`);
    },

    'PEDIR_MAIS_INFO': async () => {
      const msgInfo = await gerarPitchConsultivo(contato);
      await enviarWhatsApp(phone, msgInfo);
      await registrarAtividade(contato.id, `Lead pediu mais informações. Agente enviou pitch consultivo.`);
    },

    'REJEICAO': async () => {
      await atualizarFunil(contato.dealId, 'PERDIDO');
      await registrarAtividade(contato.id, `Lead rejeitou. Motivo: "${mensagemRecebida.substring(0,100)}". Deal movido para Perdido.`);
    },

    'REJEICAO_MOMENTO': async () => {
      await enviarWhatsApp(phone, `Entendido, sem problema! Posso entrar em contato novamente em 60 dias para ver se o momento mudou?`);
      await registrarAtividade(contato.id, `Lead: não é o momento. Follow-up agendado para 60 dias.`);
    },
  };

  const acao = acoes[intencao] || acoes['DUVIDA'];
  await acao();
}

async function gerarPropostaReuniao(contato) {
  // Agente S7-07 — Agendamento de Reuniões
  // Gerar 3 opções de horário para os próximos 3 dias úteis
  const hoje = new Date();
  const opcoes = [];
  let diasAdicionados = 0;
  let diaAtual = new Date(hoje);
  diaAtual.setDate(diaAtual.getDate() + 1);

  while (opcoes.length < 3) {
    const diaSemana = diaAtual.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) { // Pular fins de semana
      const dia = diaAtual.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
      const hora = opcoes.length === 0 ? '10h00' : opcoes.length === 1 ? '14h30' : '16h00';
      opcoes.push(`${dia} às ${hora}`);
    }
    diaAtual.setDate(diaAtual.getDate() + 1);
  }

  return `${contato.name.split(' ')[0]}, fico feliz com o interesse!

Tenho estes horários disponíveis para uma conversa de 30 minutos:

1. ${opcoes[0]}
2. ${opcoes[1]}
3. ${opcoes[2]}

Qual funciona melhor para você? A reunião será por Google Meet.`;
}

async function gerarConfirmacaoReuniao(contato) {
  return `Perfeito, ${contato.name.split(' ')[0]}! Vou confirmar o horário e te envio o link do Google Meet em seguida.

Nossa equipe vai preparar um material específico para ${contato.company || 'sua empresa'} antes da conversa.

Alguma preferência de horário nos próximos dias?`;
}

async function gerarPitchConsultivo(contato) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Crie um pitch consultivo de 4 linhas para ${contato.name} (${contato.job_title}) da ${contato.company}. O lead pediu mais informações sobre a Atlantyx. Explique o problema que resolvemos (dados inconsistentes = decisões ruins = perda financeira) e proponha uma conversa de 30 minutos. Sem emojis. Só o texto.`
      }]
    })
  });
  const data = await res.json();
  return data.content[0].text;
}

async function atualizarFunil(dealId, etapa) {
  if (!dealId) return;
  const stages = {
    'RESPONDEU': process.env.HUBSPOT_STAGE_RESPONDEU,
    'REUNIAO':   process.env.HUBSPOT_STAGE_REUNIAO,
    'PERDIDO':   process.env.HUBSPOT_STAGE_PERDIDO,
  };
  await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({ properties: { dealstage: stages[etapa] } })
  });
  console.log(`[HubSpot] Deal ${dealId} movido para ${etapa}`);
}

async function registrarAtividade(contactId, nota) {
  await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      properties: {
        hs_note_body: `[Agente Atlantyx OS] ${nota}`,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 10 }]
      }]
    })
  });
}

async function enviarWhatsApp(phone, message) {
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
    body: JSON.stringify({ phone, message }),
  });
}

async function notificarFundador(contato, phone) {
  const fundadorPhone = process.env.FUNDADOR_WHATSAPP;
  if (!fundadorPhone) return;
  const msg = `🔔 REUNIÃO SENDO AGENDADA

Lead: ${contato.name}
Empresa: ${contato.company}
Cargo: ${contato.job_title}
WhatsApp: +${phone}

O agente S7-07 já enviou as opções de horário. Acompanhe no HubSpot.`;
  await enviarWhatsApp(fundadorPhone, msg);
}
