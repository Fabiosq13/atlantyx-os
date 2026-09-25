
// v2.81: servidor SMTP configurável — Gmail, HostGator (cPanel) ou outro.
//   EMAIL_SMTP_HOST  (padrão: smtp.gmail.com se o usuário for @gmail; senão mail.<domínio do e-mail>)
//   EMAIL_SMTP_PORT  (padrão 465 = SSL; 587 = STARTTLS)
//   EMAIL_SMTP_TLS_RELAXADO=1  → aceita certificado que não bate com o host (comum em hospedagem compartilhada)
function _smtpConfig(user, pass) {
  const dom = String(user || '').split('@')[1] || '';
  const host = process.env.EMAIL_SMTP_HOST || (/gmail\.com$/i.test(dom) ? 'smtp.gmail.com' : (dom ? 'mail.' + dom : 'smtp.gmail.com'));
  const port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
  return { host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 30000,
    ...(process.env.EMAIL_SMTP_TLS_RELAXADO === '1' ? { tls: { rejectUnauthorized: false } } : {}) };
}
// api/lead-capture.js
// Agente S2-02 + S7-05
// Recebe lead do Meta Ads / LinkedIn → Claude gera mensagem → HubSpot → WhatsApp

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
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
    lead.utm = body.utm || { source: body.source || body.utm_source || null, medium: body.utm_medium || null, campaign: body.campaign_name || body.utm_campaign || null, content: body.utm_content || null };
    lead.campanha = lead.utm.campaign || body.campaign_name || null;
    lead.origem = lead.utm.source || body.source || 'formulario';
    console.log(`[S2] Lead recebido: ${lead.name} | ${lead.company} | origem ${lead.origem} · ${lead.campanha || 'sem campanha'} | Score: ${lead.score_label}`);

    // ── v2.32 — 1b. GRAVAR NO BANCO PRIMEIRO, SEMPRE. ──
    // Antes o lead só existia no HubSpot, e se QUALQUER etapa abaixo falhasse, o catch engolia
    // tudo e o lead se PERDIA — a pessoa preencheu o formulário e nada ficou. Agora o registro
    // local é a primeira coisa e nunca depende das integrações.
    const etapas = { banco: null, mensagem: null, hubspot: null, whatsapp: null, followup: null, alerta: null };
    let leadId = null;
    try { leadId = await gravarLeadLocal(lead); etapas.banco = 'ok'; }
    catch (e) { etapas.banco = 'falha: ' + e.message; console.error('[S2] gravar lead local:', e.message); }

    // ── 1c. ALERTA IMEDIATO por e-mail — "novo lead da campanha X" ──
    try { await alertarNovoLead(lead); etapas.alerta = 'ok'; } catch (e) { etapas.alerta = 'falha: ' + e.message; }

    // As etapas seguintes são INDEPENDENTES: uma falhar não derruba as outras nem o lead.
    let mensagem = null, contactId = null, dealId = null;
    try { mensagem = await gerarMensagemClaude(lead); etapas.mensagem = 'ok'; }
    catch (e) { etapas.mensagem = 'falha: ' + e.message; }

    try { ({ contactId, dealId } = await criarNoHubSpot(lead)); etapas.hubspot = contactId ? 'ok' : 'sem retorno'; }
    catch (e) { etapas.hubspot = 'falha: ' + e.message; }

    if (lead.phone && mensagem) {
      try { await enviarWhatsApp(lead.phone, mensagem); etapas.whatsapp = 'ok'; if (dealId) await atualizarDealHubSpot(dealId, 'ABORDADO').catch(() => {}); }
      catch (e) { etapas.whatsapp = 'falha: ' + e.message; }
    } else etapas.whatsapp = lead.phone ? 'sem mensagem' : 'sem telefone';

    try { if (mensagem) { await agendarFollowUp(lead, dealId, mensagem); etapas.followup = 'ok'; } else etapas.followup = 'sem mensagem'; }
    catch (e) { etapas.followup = 'falha: ' + e.message; }

    // registra no lead o que deu certo e o que não
    try { if (leadId) await atualizarLeadLocal(leadId, { hubspot_contact: contactId, hubspot_deal: dealId, etapas }); } catch (_) {}
    const falhas = Object.entries(etapas).filter(([, v]) => String(v).startsWith('falha'));
    if (falhas.length) console.warn('[S2] etapas com falha:', falhas.map(([k, v]) => k + '=' + v).join(' | '));

    return res.status(200).json({
      success: true,
      lead: lead.name, company: lead.company, score: lead.score_label,
      origem: lead.origem, campanha: lead.campanha,
      lead_id: leadId, hubspot_contact: contactId, hubspot_deal: dealId,
      whatsapp_sent: etapas.whatsapp === 'ok', followup_scheduled: etapas.followup === 'ok',
      etapas,
    });

  } catch (error) {
    console.error('[ERRO lead-capture]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── FUNÇÕES ───────────────────────────────────────────────────────────────────

// v2.32: registro local do lead — a fonte de verdade da tela e da auditoria
async function gravarLeadLocal(lead) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, nome TEXT, empresa TEXT, cargo TEXT, setor TEXT, score TEXT, data JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW())`;
  for (const col of ['origem TEXT', 'campanha TEXT', 'utm JSONB', 'email TEXT', 'telefone TEXT', 'hubspot_contact TEXT', 'hubspot_deal TEXT', 'etapas JSONB', 'status TEXT DEFAULT \'novo\'', 'reuniao_marcada_em TIMESTAMPTZ']) {
    try { await sql.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col}`); } catch (_) {}
  }
  const id = 'ld_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await sql`INSERT INTO leads (id, nome, empresa, cargo, setor, score, data, origem, campanha, utm, email, telefone, status)
    VALUES (${id}, ${lead.name}, ${lead.company}, ${lead.title || null}, ${lead.sector || null}, ${lead.score_label || null},
      ${JSON.stringify(lead)}, ${lead.origem || null}, ${lead.campanha || null}, ${JSON.stringify(lead.utm || {})},
      ${lead.email || null}, ${lead.phone || null}, 'novo')`;
  return id;
}
async function atualizarLeadLocal(id, campos) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  await sql`UPDATE leads SET hubspot_contact = ${campos.hubspot_contact || null}, hubspot_deal = ${campos.hubspot_deal || null},
    etapas = ${JSON.stringify(campos.etapas || {})} WHERE id = ${id}`;
}
// v2.32: alerta por e-mail a cada lead, dizendo de qual campanha veio
async function alertarNovoLead(lead) {
  const nodemailer = (await import('nodemailer')).default;
  const user = process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER, pass = (process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) throw new Error('EMAIL_IMAP_USER/EMAIL_SMTP_PASS não configurados');
  const para = process.env.LEADS_ALERTA_PARA || process.env.RELATORIO_PAGAMENTOS_PARA || user;
  const t = nodemailer.createTransport(_smtpConfig(user, pass));
  const u = lead.utm || {};
  await t.sendMail({ from: `Atlantyx OS <${user}>`, to: para,
    subject: `🎯 Novo lead: ${lead.name} (${lead.company}) — via ${lead.origem || '?'}${lead.campanha ? ' · ' + lead.campanha : ''}`,
    html: `<div style="font-family:Arial;max-width:560px;">
      <h2 style="color:#1A3A8F;margin:0 0 6px;">Novo lead capturado</h2>
      <table style="font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">Nome</td><td><b>${lead.name}</b></td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">Empresa</td><td>${lead.company || '—'}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">Cargo</td><td>${lead.title || '—'}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">E-mail</td><td>${lead.email || '—'}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">WhatsApp</td><td>${lead.phone || '—'}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">Score</td><td>${lead.score_label || '—'}</td></tr>
      </table>
      <div style="margin-top:12px;padding:10px;background:#EAF7F1;border-left:3px solid #1FB287;font-size:13px;">
        <b>Origem:</b> ${lead.origem || '?'} · <b>Campanha:</b> ${lead.campanha || 'não identificada'}${u.medium ? ' · ' + u.medium : ''}${u.content ? '<br><span style="color:#5a6478;font-size:12px;">post: ' + u.content + '</span>' : ''}</div>
      <p style="font-size:12px;color:#8a93a8;margin-top:14px;">Atlantyx OS · alerta automático de captura</p></div>` });
}

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
  // v1.43 (report DEV, item 4): "todos os leads com score C" NÃO é bug de algoritmo nem cron
  // parado — o scoring roda na captura e está correto. A causa é que os campos que dão pontos
  // (cargo e telefone) chegam VAZIOS do formulário: sem eles, o teto é 40 pontos = sempre C.
  // Agora o score é proporcional ao que foi possível avaliar, e registramos o que faltou.
  const criterios = [];
  let score = 0, pontosPossiveis = 0;
  pontosPossiveis += 20; if (lead.company) { score += 20; criterios.push('empresa informada (+20)'); } else criterios.push('empresa ausente');
  const temCargo = lead.job_title != null && String(lead.job_title).trim() !== '';
  if (temCargo) { pontosPossiveis += 40;
    if (/CIO|CTO|CFO|CEO|Diretor|Director|VP|Head|Gerente|Coordenador|Superintendente|S[oó]cio|Owner|Founder|Presidente/i.test(lead.job_title)) { score += 40; criterios.push('cargo decisor (+40)'); }
    else criterios.push(`cargo "${lead.job_title}" não é de decisão`);
  } else criterios.push('⚠ CARGO NÃO CAPTURADO — critério de maior peso (40 pts) não pôde ser avaliado');
  const temTelefone = lead.phone != null && String(lead.phone).trim() !== '';
  if (temTelefone) { pontosPossiveis += 20; score += 20; criterios.push('telefone informado (+20)'); }
  else criterios.push('⚠ telefone não capturado (20 pts não avaliados)');
  pontosPossiveis += 20;
  if (lead.email && !/@gmail|@hotmail|@yahoo|@outlook|@bol|@uol|@terra/i.test(lead.email)) { score += 20; criterios.push('e-mail corporativo (+20)'); }
  else criterios.push('e-mail pessoal ou ausente');

  lead.score = score;
  lead.score_criterios = criterios;
  lead.score_pontos_possiveis = pontosPossiveis;
  // Score proporcional ao que foi avaliado: assim um lead com dados incompletos não é
  // automaticamente rebaixado para C por falta de informação que nunca foi pedida.
  const pct = pontosPossiveis > 0 ? (score / pontosPossiveis) * 100 : 0;
  lead.score_pct = Math.round(pct);
  lead.score_label = pct >= 70 ? 'A' : pct >= 45 ? 'B' : 'C';
  lead.score_confiavel = pontosPossiveis >= 80; // sem cargo, a classificação é pouco confiável
  if (!lead.score_confiavel) lead.score_aviso = 'Score pouco confiável: o formulário não capturou cargo (e/ou telefone). Adicione esses campos para o scoring funcionar de verdade.';

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
      model: MODEL,
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
