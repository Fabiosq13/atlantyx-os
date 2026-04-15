// api/email-intel.js
// Agente de Inteligência de E-mail — lê Gmail, classifica e roteia para os agentes certos
// Conecta com: S1 (estratégico), S2 (marketing/RFPs), S7 (vendas), S9 (projetos), S3 (financeiro)
// Usa Gmail API via OAuth configurado no Google Cloud

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { action = 'scan', limite = 50, filtro = 'todos' } = req.method === 'GET' ? req.query : req.body;

    const acoes = {
      scan:          () => scanEmails(limite, filtro),
      processar_rfp: () => processarRFP(req.body),
      resposta_venda:() => processarRespostaVenda(req.body),
      projeto:       () => processarProjeto(req.body),
      relatorio:     () => gerarRelatorio(req.body),
    };

    if (!acoes[action]) return res.status(400).json({ error: 'Ação inválida' });
    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });

  } catch (error) {
    console.error('[ERRO email-intel]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── SCAN PRINCIPAL — lê e classifica todos os e-mails relevantes ─────────────
async function scanEmails(limite, filtro) {
  // 1. Buscar e-mails via Gmail API
  const emails = await fetchGmailEmails(limite);
  if (!emails.length) return { total: 0, classificados: [], resumo: 'Nenhum e-mail novo encontrado' };

  // Normalizar e-mails encaminhados — extrair o original do corpo
  emails.forEach(email => {
    const corpo = email.corpo || '';
    // Detectar padrões de encaminhamento (PT/EN/ES)
    const patterns = [
      /[-]{3,}.*Mensagem encaminhada.*[-]{3,}/i,
      /[-]{3,}.*Forwarded message.*[-]{3,}/i,
      /[-]{3,}.*Mensaje reenviado.*[-]{3,}/i,
      /De:.*\nEnviado:/i,
      /From:.*\nSent:/i,
      /Encaminhado por:/i,
    ];
    const isForwarded = patterns.some(p => p.test(corpo));
    if (isForwarded) {
      email.is_forwarded = true;
      email.assunto = email.assunto.replace(/^(FW:|Fwd:|RES:|RE:|Enc:)\s*/i, '').trim();
      // Extrair remetente original do corpo encaminhado
      const deMatch = corpo.match(/De:\s*(.+?)\n|From:\s*(.+?)\n/i);
      if (deMatch) email.de_original = deMatch[1] || deMatch[2] || email.de;
      // Usar snippet como resumo do original
      const assuntoMatch = corpo.match(/Assunto:\s*(.+?)\n|Subject:\s*(.+?)\n/i);
      if (assuntoMatch) email.assunto_original = assuntoMatch[1] || assuntoMatch[2];
    }
  });

  console.log(`[Email-Intel] ${emails.length} e-mails para classificar`);

  // 2. Claude classifica todos em lote (uma única chamada — mais eficiente)
  const classificados = await classificarEmailsEmLote(emails);

  // 3. Rotear para os agentes certos
  const acoes = await rotearParaAgentes(classificados);

  // 4. Salvar no HubSpot os e-mails de venda
  const vendasEmails = classificados.filter(e => e.categoria === 'VENDA' || e.categoria === 'RFP');
  for (const email of vendasEmails) {
    await salvarAtividadeHubSpot(email);
  }

  // 5. Notificar o fundador sobre itens urgentes
  const urgentes = classificados.filter(e => e.urgencia === 'ALTA');
  if (urgentes.length > 0) {
    await notificarFundador(urgentes);
  }

  // Resumo por categoria
  const resumo = {};
  classificados.forEach(e => { resumo[e.categoria] = (resumo[e.categoria] || 0) + 1; });

  return {
    total: emails.length,
    urgentes: urgentes.length,
    classificados,
    resumo_categorias: resumo,
    acoes_tomadas: acoes,
  };
}

// ── BUSCAR E-MAILS GMAIL ──────────────────────────────────────────────────────
async function fetchGmailEmails(limite = 50) {
  const token = process.env.GMAIL_ACCESS_TOKEN;

  // Buscar IDs dos e-mails recentes (últimos 7 dias, não lidos ou importantes)
  const query = 'newer_than:7d';
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${limite}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) {
    const err = await listRes.json();
    throw new Error(`Gmail API: ${err.error?.message || 'Erro de autenticação'}`);
  }

  const list = await listRes.json();
  const messageIds = (list.messages || []).map(m => m.id);

  // Buscar detalhes de cada e-mail em paralelo (lotes de 10)
  const emails = [];
  for (let i = 0; i < messageIds.length; i += 10) {
    const batch = messageIds.slice(i, i + 10);
    const details = await Promise.all(batch.map(id => fetchEmailDetail(id, token)));
    emails.push(...details.filter(Boolean));
  }

  return emails;
}

async function fetchEmailDetail(id, token) {
  try {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) return null;
    const msg = await r.json();

    const headers = msg.payload?.headers || [];
    const get = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    // Extrair corpo do e-mail
    let body = '';
    const parts = msg.payload?.parts || [msg.payload];
    for (const part of parts) {
      if (part?.mimeType === 'text/plain' && part?.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        break;
      }
    }
    if (!body && msg.payload?.body?.data) {
      body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
    }

    return {
      id,
      de: get('From'),
      para: get('To'),
      assunto: get('Subject'),
      data: get('Date'),
      corpo: body.substring(0, 2000), // Limitar para análise
      snippet: msg.snippet || '',
      labels: msg.labelIds || [],
      thread_id: msg.threadId,
    };
  } catch (e) {
    console.error(`[Email] Erro ao buscar ${id}:`, e.message);
    return null;
  }
}

// ── CLASSIFICAR E-MAILS EM LOTE — Claude analisa todos de uma vez ─────────────
async function classificarEmailsEmLote(emails) {
  const system = `Você é o Agente de Inteligência de E-mail da Atlantyx.
Classifique cada e-mail e extraia informações relevantes para os agentes da empresa.

CATEGORIAS DISPONÍVEIS:
- RFP: e-mail sobre edital, licitação, processo seletivo de fornecedor, solicitação de proposta
- VENDA: resposta de lead, interesse em produto, solicitação de reunião, follow-up comercial
- PROJETO: atualização de projeto em andamento, cliente pedindo status, marcos, prazos
- FINANCEIRO: nota fiscal, pagamento, cobrança, contrato, proposta financeira
- PARCERIA: proposta de parceria, integração, co-venda, indicação
- CONCORRENTE: informação sobre concorrente, benchmark, movimento de mercado
- RECRUTAMENTO: candidaturas, indicações de pessoas para o time
- OPERACIONAL: suporte, bug, manutenção, acesso, onboarding de cliente
- SPAM: irrelevante, marketing, newsletter sem valor
- OUTRO: não se encaixa nas categorias acima mas pode ser relevante

URGÊNCIA:
- ALTA: requer resposta ou ação em até 24h (prazo de RFP, lead quente, cliente com problema)
- MÉDIA: responder em 2-3 dias
- BAIXA: informativo, sem prazo imediato

Retorne APENAS JSON array válido, sem markdown.`;

  const emailsResumo = emails.map((e, i) => ({
    index: i,
    de: e.de,
    assunto: e.assunto,
    snippet: e.snippet || e.corpo?.substring(0, 300),
  }));

  const user = `Classifique estes ${emails.length} e-mails da Atlantyx:
${JSON.stringify(emailsResumo, null, 1)}

Para cada um retorne:
{
  "index": 0,
  "categoria": "RFP|VENDA|PROJETO|FINANCEIRO|PARCERIA|CONCORRENTE|RECRUTAMENTO|OPERACIONAL|SPAM|OUTRO",
  "urgencia": "ALTA|MÉDIA|BAIXA",
  "remetente_empresa": "empresa do remetente se identificável",
  "decisor": "nome do remetente se parece ser decisor C-level",
  "resumo": "2 frases do que o e-mail diz",
  "acao_recomendada": "o que fazer com este e-mail",
  "agente_responsavel": "S1|S2|S7|S3|S9|Fundador",
  "palavras_chave": ["palavra1", "palavra2"],
  "valor_estimado": "R$X se mencionado ou null",
  "prazo": "prazo mencionado se houver ou null"
}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, system, messages: [{ role: 'user', content: user }] })
  });

  const d = await r.json();
  let classificacoes = [];
  try {
    const text = d.content[0].text.replace(/```json|```/g, '').trim();
    classificacoes = JSON.parse(text);
  } catch (e) {
    console.error('[Email] Erro ao parsear classificações:', e.message);
    return emails.map((e, i) => ({ ...e, index: i, categoria: 'OUTRO', urgencia: 'BAIXA', resumo: e.snippet }));
  }

  // Mesclar dados originais com classificações
  return classificacoes.map(c => ({
    ...emails[c.index],
    ...c,
  })).filter(e => e.categoria !== 'SPAM');
}

// ── ROTEAR PARA OS AGENTES ────────────────────────────────────────────────────
async function rotearParaAgentes(emails) {
  const acoes = [];

  for (const email of emails) {
    try {
      switch (email.categoria) {

        case 'RFP':
          // → S2-04 Monitor de RFPs + S7-02 Identificação de RFPs
          await processarRFPEmail(email);
          acoes.push({ email_id: email.id, acao: 'RFP registrado → S2-04 + S7-02', agente: 'S2-04' });
          break;

        case 'VENDA':
          // → S7-05 Outreach + Atualizar HubSpot
          await processarVendaEmail(email);
          acoes.push({ email_id: email.id, acao: 'Lead atualizado no HubSpot → S7-05', agente: 'S7-05' });
          break;

        case 'PROJETO':
          // → S9 Gestão de Projetos
          await processarProjetoEmail(email);
          acoes.push({ email_id: email.id, acao: 'Atualização de projeto registrada → S9', agente: 'S9' });
          break;

        case 'FINANCEIRO':
          // → S3 Financeiro + notificar fundador
          acoes.push({ email_id: email.id, acao: 'E-mail financeiro registrado → S3', agente: 'S3' });
          break;

        case 'PARCERIA':
          // → S1 Estratégico para avaliação
          acoes.push({ email_id: email.id, acao: 'Proposta de parceria → S1 para análise', agente: 'S1' });
          break;

        case 'CONCORRENTE':
          // → S1 Inteligência de Mercado
          acoes.push({ email_id: email.id, acao: 'Intel de concorrente → S1 análise de mercado', agente: 'S1' });
          break;

        default:
          if (email.urgencia === 'ALTA') {
            acoes.push({ email_id: email.id, acao: 'Urgente → notificado ao Fundador', agente: 'Fundador' });
          }
      }
    } catch (e) {
      console.error(`[Email] Erro ao rotear ${email.id}:`, e.message);
    }
  }

  return acoes;
}

// ── PROCESSAR RFP VIA E-MAIL ──────────────────────────────────────────────────
async function processarRFPEmail(email) {
  // Extrair detalhes do RFP com Claude
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Extraia os dados do RFP deste e-mail da Atlantyx:
Assunto: ${email.assunto}
De: ${email.de}
Corpo: ${email.corpo}

Retorne JSON:
{
  "empresa": "nome da empresa",
  "titulo_rfp": "título do edital/RFP",
  "valor_estimado": "R$X ou null",
  "prazo_submissao": "data ou null",
  "escopo": "resumo do que pedem",
  "compatibilidade_atlantyx": 0-100,
  "recomendacao": "Participar | Não participar | Analisar melhor",
  "justificativa": "por que participar ou não"
}` }]
    })
  });
  const d = await r.json();

  let rfp = {};
  try { rfp = JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim()); } catch {}

  // Notificar via WhatsApp
  if (rfp.recomendacao !== 'Não participar') {
    await whatsapp(process.env.FUNDADOR_WHATSAPP,
      `[Email-Intel · RFP Identificado via E-mail]\n\nEmpresa: ${rfp.empresa || email.remetente_empresa}\nRFP: ${rfp.titulo_rfp || email.assunto}\nValor: ${rfp.valor_estimado || 'não informado'}\nPrazo: ${rfp.prazo_submissao || 'verificar'}\nCompatibilidade: ${rfp.compatibilidade_atlantyx || '?'}%\n\nRecomendação: ${rfp.recomendacao}\n${rfp.justificativa || ''}`
    );
  }

  return rfp;
}

// ── PROCESSAR RESPOSTA DE VENDA ───────────────────────────────────────────────
async function processarVendaEmail(email) {
  // Analisar sentimento e intenção
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: `Analise este e-mail de potencial cliente da Atlantyx:
Assunto: ${email.assunto}
De: ${email.de}
Corpo: ${email.corpo}

Retorne JSON:
{
  "intencao": "INTERESSE | DUVIDA | REUNIAO | PROPOSTA | REJEICAO | FOLLOW_UP",
  "sentimento": "POSITIVO | NEUTRO | NEGATIVO",
  "nome_contato": "nome se identificável",
  "empresa": "empresa do remetente",
  "cargo_provavel": "cargo estimado pelo e-mail",
  "proxima_acao": "o que fazer agora",
  "rascunho_resposta": "rascunho de resposta em português, profissional, max 5 linhas"
}` }]
    })
  });
  const d = await r.json();
  let analise = {};
  try { analise = JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim()); } catch {}

  // Atualizar HubSpot se tiver token
  if (process.env.HUBSPOT_TOKEN && analise.empresa) {
    await salvarAtividadeHubSpot({ ...email, ...analise });
  }

  // Notificar se interesse ou reunião
  if (['INTERESSE', 'REUNIAO', 'PROPOSTA'].includes(analise.intencao)) {
    await whatsapp(process.env.FUNDADOR_WHATSAPP,
      `[Email-Intel · Lead Respondeu!]\n\n${analise.nome_contato || 'Contato'} (${analise.empresa || email.de})\nIntenção: ${analise.intencao}\nSentimento: ${analise.sentimento}\n\nRascunho de resposta pronto no painel.`
    );
  }

  return analise;
}

// ── PROCESSAR ATUALIZAÇÃO DE PROJETO ─────────────────────────────────────────
async function processarProjetoEmail(email) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: `Extraia dados de atualização de projeto deste e-mail:
Assunto: ${email.assunto}
Corpo: ${email.corpo}

Retorne JSON:
{
  "projeto": "nome do projeto",
  "cliente": "empresa cliente",
  "tipo_atualizacao": "Status | Prazo | Entregável | Problema | Aprovação | Reunião",
  "status": "No prazo | Atrasado | Em risco | Concluído | Bloqueado",
  "acao_necessaria": "o que a Atlantyx precisa fazer",
  "prazo": "prazo mencionado ou null",
  "urgente": true/false
}` }]
    })
  });
  const d = await r.json();
  let proj = {};
  try { proj = JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim()); } catch {}

  if (proj.urgente || proj.status === 'Bloqueado') {
    await whatsapp(process.env.FUNDADOR_WHATSAPP,
      `[Email-Intel · Projeto Requer Atenção]\n\n${proj.projeto || 'Projeto'} — ${proj.cliente || ''}\nStatus: ${proj.status}\nAção: ${proj.acao_necessaria}`
    );
  }

  return proj;
}

// ── GERAR RASCUNHO DE RESPOSTA ────────────────────────────────────────────────
async function processarRespostaVenda({ email_id, email_original, contexto }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: 'Você é o Agente de E-mail da Atlantyx. Escreva respostas profissionais, diretas e consultivas. A Atlantyx resolve: decisões com dados atrasados = perda financeira. Quick Wins em semanas, ROI mensurável.',
      messages: [{ role: 'user', content: `Escreva UMA resposta de e-mail profissional para:
E-mail original: ${JSON.stringify(email_original)}
Contexto adicional: ${contexto || ''}

Retorne JSON:
{
  "assunto": "Re: assunto original",
  "corpo": "corpo completo do e-mail — tom consultivo, direto, max 8 linhas, propõe próximo passo claro"
}` }]
    })
  });
  const d = await r.json();
  let rascunho = {};
  try { rascunho = JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim()); } catch {
    rascunho = { assunto: 'Re: ' + email_original?.assunto, corpo: d.content[0].text };
  }
  return { rascunho };
}

// ── RELATÓRIO DE E-MAILS ──────────────────────────────────────────────────────
async function gerarRelatorio({ periodo = '7 dias', emails_classificados }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `Gere um relatório estratégico dos e-mails da Atlantyx dos últimos ${periodo}:
${JSON.stringify(emails_classificados || [])}

Retorne JSON:
{
  "headline": "resumo do período em uma frase",
  "total_emails": 0,
  "por_categoria": {"RFP": 0, "VENDA": 0, "PROJETO": 0},
  "oportunidades_identificadas": [{"email": "...", "potencial": "R$X", "acao": "..."}],
  "riscos_identificados": ["risco 1", "risco 2"],
  "acoes_prioritarias": [{"acao": "...", "prazo": "...", "responsavel": "..."}],
  "insights_estrategicos": ["insight 1", "insight 2"]
}` }]
    })
  });
  const d = await r.json();
  let rel = {};
  try { rel = JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim()); } catch {}
  return { relatorio: rel };
}

// ── SALVAR NO HUBSPOT ─────────────────────────────────────────────────────────
async function salvarAtividadeHubSpot(email) {
  if (!process.env.HUBSPOT_TOKEN) return;
  try {
    await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({
        properties: {
          hs_note_body: `[Email-Intel · ${email.categoria}]\n\nDe: ${email.de}\nAssunto: ${email.assunto}\n\nResumo: ${email.resumo || email.snippet}\n\nAção: ${email.acao_recomendada || ''}`,
          hs_timestamp: new Date().toISOString(),
        }
      })
    });
  } catch (e) { console.log('[HubSpot] Erro nota:', e.message); }
}

// ── NOTIFICAR FUNDADOR ────────────────────────────────────────────────────────
async function notificarFundador(urgentes) {
  const msg = `[Email-Intel · ${urgentes.length} E-mail(s) URGENTE(S)]\n\n` +
    urgentes.slice(0, 5).map((e, i) =>
      `${i + 1}. [${e.categoria}] ${e.assunto}\nDe: ${e.de}\n${e.resumo || e.snippet}\n`
    ).join('\n') +
    '\nAcesse o painel Email-Intel para detalhes e rascunhos de resposta.';

  await whatsapp(process.env.FUNDADOR_WHATSAPP, msg);
}

async function whatsapp(phone, message) {
  if (!phone || !process.env.ZAPI_INSTANCE) return;
  try {
    await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone, message }),
    });
  } catch (e) { console.log('[WA]', e.message); }
}
