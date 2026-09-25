
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
// api/vendas-outbound.js — v1.70 · S7 · Vendas Ativo
// Robô de contato com CEOs de grandes empresas: escreve, envia, lê a resposta,
// classifica a intenção e monta o roteiro de visitas agrupado por região.

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await ensureTabelas(_sql);
  return _sql;
}
async function ensureTabelas(sql) {
  await sql`CREATE TABLE IF NOT EXISTS out_leads (
    id TEXT PRIMARY KEY,
    empresa TEXT NOT NULL,
    contato_nome TEXT,
    cargo TEXT,
    email TEXT,
    telefone TEXT,
    cidade TEXT, uf TEXT,
    setor TEXT,
    porte TEXT,
    site TEXT,
    linkedin TEXT,
    origem TEXT DEFAULT 'manual',
    observacoes TEXT,
    -- funil
    status TEXT DEFAULT 'novo',      -- novo|enviado|respondido|interessado|reuniao_marcada|visitado|descartado
    intencao TEXT,                   -- positivo|neutro|negativo|pedir_depois
    enviado_em TIMESTAMPTZ,
    respondido_em TIMESTAMPTZ,
    tentativas INT DEFAULT 0,
    ultimo_assunto TEXT,
    ultima_resposta TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_out_status ON out_leads(status, uf)`;
  await sql`CREATE TABLE IF NOT EXISTS out_mensagens (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES out_leads(id) ON DELETE CASCADE,
    direcao TEXT,                    -- saida|entrada
    assunto TEXT, corpo TEXT,
    enviado_em TIMESTAMPTZ DEFAULT NOW(),
    aprovado_por TEXT
  )`;
  await sql`CREATE TABLE IF NOT EXISTS out_visitas (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES out_leads(id) ON DELETE CASCADE,
    empresa TEXT, contato TEXT, cidade TEXT, uf TEXT,
    data_visita DATE, hora_visita TEXT,
    endereco TEXT, status TEXT DEFAULT 'a_confirmar',   -- a_confirmar|confirmada|realizada|cancelada
    roteiro_id TEXT,
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS out_roteiros (
    id TEXT PRIMARY KEY,
    nome TEXT, regiao TEXT,
    data_inicio DATE, data_fim DATE,
    cidades JSONB DEFAULT '[]',
    status TEXT DEFAULT 'rascunho',
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS out_config (
    chave TEXT PRIMARY KEY, valor TEXT, atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
}
function novoId(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ═══ Agrupamento geográfico para o roteiro ═══
const REGIOES = {
  'Sudeste': ['SP','RJ','MG','ES'], 'Sul': ['PR','SC','RS'],
  'Centro-Oeste': ['DF','GO','MT','MS'], 'Nordeste': ['BA','PE','CE','RN','PB','AL','SE','MA','PI'],
  'Norte': ['AM','PA','RO','RR','AP','TO','AC'],
};
function regiaoDaUf(uf) {
  for (const [r, ufs] of Object.entries(REGIOES)) if (ufs.includes(String(uf || '').toUpperCase())) return r;
  return 'Outras';
}

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function claudeOut(system, user, maxTokens = 1200) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 55000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return d.content?.[0]?.text || '';
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════════════════
async function leadSalvar(p = {}) {
  if (!p.empresa) throw new Error('empresa obrigatória');
  const sql = await getSql();
  const id = p.id || novoId('lead');
  await sql`INSERT INTO out_leads (id, empresa, contato_nome, cargo, email, telefone, cidade, uf, setor, porte, site, linkedin, origem, observacoes, status, atualizado_em)
    VALUES (${id}, ${p.empresa}, ${p.contato_nome || null}, ${p.cargo || 'CEO'}, ${p.email || null}, ${p.telefone || null},
      ${p.cidade || null}, ${(p.uf || '').toUpperCase() || null}, ${p.setor || null}, ${p.porte || 'grande'},
      ${p.site || null}, ${p.linkedin || null}, ${p.origem || 'manual'}, ${p.observacoes || null}, ${p.status || 'novo'}, NOW())
    ON CONFLICT (id) DO UPDATE SET empresa=EXCLUDED.empresa, contato_nome=EXCLUDED.contato_nome, cargo=EXCLUDED.cargo,
      email=EXCLUDED.email, telefone=EXCLUDED.telefone, cidade=EXCLUDED.cidade, uf=EXCLUDED.uf, setor=EXCLUDED.setor,
      porte=EXCLUDED.porte, site=EXCLUDED.site, linkedin=EXCLUDED.linkedin, observacoes=EXCLUDED.observacoes,
      status=EXCLUDED.status, atualizado_em=NOW()`;
  return { id };
}
async function leadsImportar({ leads = [] } = {}) {
  let n = 0, erros = [];
  for (const l of leads) {
    try { await leadSalvar(l); n++; } catch (e) { erros.push(`${l.empresa || '?'}: ${e.message}`); }
  }
  return { importados: n, erros };
}
async function leadsList({ status, uf } = {}) {
  const sql = await getSql();
  let rows;
  if (status && uf) rows = await sql`SELECT * FROM out_leads WHERE status = ${status} AND uf = ${uf.toUpperCase()} ORDER BY empresa`;
  else if (status) rows = await sql`SELECT * FROM out_leads WHERE status = ${status} ORDER BY empresa`;
  else if (uf) rows = await sql`SELECT * FROM out_leads WHERE uf = ${uf.toUpperCase()} ORDER BY empresa`;
  else rows = await sql`SELECT * FROM out_leads ORDER BY atualizado_em DESC LIMIT 500`;
  const porStatus = {};
  rows.forEach(r => porStatus[r.status] = (porStatus[r.status] || 0) + 1);
  const porUf = {};
  rows.forEach(r => { if (r.uf) porUf[r.uf] = (porUf[r.uf] || 0) + 1; });
  return { leads: rows, total: rows.length, por_status: porStatus, por_uf: porUf,
    sem_email: rows.filter(r => !r.email).length };
}
async function leadExcluir({ id }) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM out_leads WHERE id = ${id}`;
  return { excluido: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// REDAÇÃO DO E-MAIL (sempre com revisão humana antes de enviar)
// ═══════════════════════════════════════════════════════════════════════════
async function configGet() {
  const sql = await getSql();
  const rows = await sql`SELECT chave, valor FROM out_config`;
  const c = {}; rows.forEach(r => c[r.chave] = r.valor);
  return {
    remetente_nome: c.remetente_nome || 'Fabio Quintanilha',
    remetente_cargo: c.remetente_cargo || 'CEO · Atlantyx',
    empresa_pitch: c.empresa_pitch || 'A Atlantyx é uma consultoria brasileira de dados e IA, com 17 anos de mercado, que entrega engenharia de dados, analytics e agentes de IA para grandes operações.',
    prova_social: c.prova_social || 'Atendemos CPFL Energia, Enel e Caixa Capitalização.',
    objetivo: c.objetivo || 'uma conversa presencial de 40 minutos',
    assinatura: c.assinatura || null,
  };
}
async function configSalvar(p = {}) {
  const sql = await getSql();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    await sql`INSERT INTO out_config (chave, valor, atualizado_em) VALUES (${k}, ${v || null}, NOW())
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
  }
  return await configGet();
}

async function redigirEmail({ lead_id, tom = 'direto', contexto_extra } = {}) {
  if (!lead_id) throw new Error('lead_id obrigatório');
  const sql = await getSql();
  const r = await sql`SELECT * FROM out_leads WHERE id = ${lead_id} LIMIT 1`;
  if (!r.length) throw new Error('Lead não encontrado');
  const l = r[0];
  const cfg = await configGet();

  const system = `Você escreve e-mails de primeiro contato de CEO para CEO, em português do Brasil.

QUEM ESCREVE: ${cfg.remetente_nome}, ${cfg.remetente_cargo}.
SOBRE A EMPRESA: ${cfg.empresa_pitch}
PROVA SOCIAL: ${cfg.prova_social}
OBJETIVO DO E-MAIL: conseguir ${cfg.objetivo}.

REGRAS (um CEO lê em 10 segundos):
- Máximo 110 palavras no corpo. Sem introdução longa, sem "espero que esteja bem".
- Assunto com no máximo 50 caracteres, específico, sem palavra de propaganda (nada de "oportunidade única", "revolucionar", "parceria estratégica").
- Primeira frase: por que ESTA empresa, não um texto genérico. Use o setor e o contexto informado.
- Uma única prova social, curta.
- Uma pergunta final simples e fácil de responder ("faz sentido conversarmos?"), nunca várias opções de horário no primeiro contato.
- Nada de anexo, link de agenda ou apresentação no primeiro e-mail.
- Tom: ${tom === 'formal' ? 'formal e respeitoso' : tom === 'consultivo' ? 'consultivo, trazendo uma observação do setor' : 'direto e objetivo'}.
- NÃO invente dado sobre a empresa do destinatário, número de mercado, nem diga que já conversaram antes.

Devolva SOMENTE JSON válido, sem markdown:
{"assunto":"...","corpo":"...","por_que_funciona":"uma frase explicando a escolha do ângulo"}`;

  const user = `DESTINATÁRIO: ${l.contato_nome || '(nome não informado)'}, ${l.cargo || 'CEO'} da ${l.empresa}
${l.setor ? 'Setor: ' + l.setor : ''}
${l.cidade ? 'Cidade: ' + l.cidade + (l.uf ? '/' + l.uf : '') : ''}
${l.observacoes ? 'Contexto que eu sei sobre a empresa: ' + l.observacoes : 'Sem contexto adicional — não invente nenhum.'}
${contexto_extra ? 'Observação para este e-mail: ' + contexto_extra : ''}`;

  const txt = await claudeOut(system, user, 900);
  try {
    const d = JSON.parse(txt.replace(/```json|```/g, '').trim());
    return { rascunho: d, lead: { id: l.id, empresa: l.empresa, contato: l.contato_nome, email: l.email } };
  } catch { return { erro: 'A IA não devolveu JSON válido', bruto: txt.substring(0, 500) }; }
}

// Envio — exige aprovação explícita, um a um ou em lote revisado
async function enviarEmail({ lead_id, assunto, corpo, aprovado_por } = {}) {
  if (!lead_id || !assunto || !corpo) throw new Error('lead_id, assunto e corpo obrigatórios');
  const sql = await getSql();
  const r = await sql`SELECT * FROM out_leads WHERE id = ${lead_id} LIMIT 1`;
  if (!r.length) throw new Error('Lead não encontrado');
  const l = r[0];
  if (!l.email) throw new Error(`${l.empresa} está sem e-mail cadastrado`);

  const user = process.env.EMAIL_IMAP_USER || 'atlanteambr@gmail.com';
  const pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS;
  let nodemailer = null;
  try { const m = await import('nodemailer'); nodemailer = m.default || m; } catch (_) {}
  if (!nodemailer || !pass) {
    const err = new Error('Envio indisponível: instale o nodemailer e configure EMAIL_IMAP_PASS.');
    err.dica = 'É o mesmo pacote e senha usados no relatório diário de pagamentos.';
    throw err;
  }
  const cfg = await configGet();
  const transporter = nodemailer.createTransport(_smtpConfig(user, pass));
  const corpoHtml = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1c2333;">
    ${String(corpo).split('\n').filter(Boolean).map(p => `<p style="margin:0 0 12px;">${p.replace(/</g,'&lt;')}</p>`).join('')}
    <p style="margin:18px 0 0;color:#5a6478;font-size:13px;">${cfg.remetente_nome}<br>${cfg.remetente_cargo}</p>
    ${cfg.assinatura ? `<div style="margin-top:8px;color:#8a93a8;font-size:12px;">${cfg.assinatura}</div>` : ''}
  </div>`;
  const info = await transporter.sendMail({
    from: `${cfg.remetente_nome} <${user}>`, to: l.email, subject: assunto, html: corpoHtml,
  });

  await sql`INSERT INTO out_mensagens (id, lead_id, direcao, assunto, corpo, aprovado_por)
    VALUES (${novoId('msg')}, ${lead_id}, 'saida', ${assunto}, ${corpo}, ${aprovado_por || 'usuário'})`;
  await sql`UPDATE out_leads SET status = 'enviado', enviado_em = NOW(), tentativas = tentativas + 1,
    ultimo_assunto = ${assunto}, atualizado_em = NOW() WHERE id = ${lead_id}`;
  console.log(`[Outbound] Enviado para ${l.empresa} <${l.email}>: ${assunto}`);
  return { enviado: true, para: l.email, empresa: l.empresa, id: info.messageId };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEITURA E CLASSIFICAÇÃO DAS RESPOSTAS
// ═══════════════════════════════════════════════════════════════════════════
async function lerRespostas({ dias = 14 } = {}) {
  const user = process.env.EMAIL_IMAP_USER || 'atlanteambr@gmail.com';
  const pass = process.env.EMAIL_IMAP_PASS;
  if (!pass) return { erro: 'EMAIL_IMAP_PASS não configurada' };
  let ImapFlow;
  try { ({ ImapFlow } = await import('imapflow')); } catch { return { erro: 'Pacote imapflow não instalado (npm i imapflow)' }; }

  const sql = await getSql();
  const leads = await sql`SELECT id, empresa, email, contato_nome FROM out_leads WHERE email IS NOT NULL AND status IN ('enviado','respondido','interessado')`;
  if (!leads.length) return { verificados: 0, respostas: [] };
  const porEmail = {};
  leads.forEach(l => porEmail[String(l.email).toLowerCase().trim()] = l);

  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  const achadas = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const desde = new Date(Date.now() - dias * 86400000);
      for await (const msg of client.fetch({ since: desde }, { envelope: true, source: true })) {
        const de = (msg.envelope?.from?.[0]?.address || '').toLowerCase().trim();
        const lead = porEmail[de];
        if (!lead) continue;
        const texto = String(msg.source || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 3000);
        achadas.push({ lead_id: lead.id, empresa: lead.empresa, de,
          assunto: msg.envelope?.subject || '', data: msg.envelope?.date, texto });
      }
    } finally { lock.release(); }
    await client.logout();
  } catch (e) { return { erro: 'IMAP: ' + e.message }; }

  // Classificar a intenção de cada resposta
  const resultados = [];
  for (const a of achadas) {
    let intencao = 'neutro', resumo = '', proxima_acao = '';
    try {
      const system = `Classifique a intenção da resposta a um e-mail de prospecção. Devolva SOMENTE JSON:
{"intencao":"positivo|neutro|negativo|pedir_depois","resumo":"até 20 palavras","disponibilidade":"o que a pessoa disse sobre data/hora, ou vazio","proxima_acao":"o que fazer agora, em uma frase"}

- positivo: aceitou conversar, pediu agenda, demonstrou interesse claro
- pedir_depois: interesse mas sem momento ("me procure em janeiro")
- negativo: recusou, pediu para não contatar, disse que não tem fit
- neutro: resposta automática, encaminhamento, pergunta sem sinal claro
Nunca classifique como positivo uma resposta automática de ausência.`;
      const txt = await claudeOut(system, `Assunto: ${a.assunto}\n\nResposta:\n${a.texto.substring(0, 2000)}`, 400);
      const d = JSON.parse(txt.replace(/```json|```/g, '').trim());
      intencao = d.intencao || 'neutro'; resumo = d.resumo || ''; proxima_acao = d.proxima_acao || '';
      a.disponibilidade = d.disponibilidade || '';
    } catch (_) {}
    const novoStatus = intencao === 'positivo' ? 'interessado' : intencao === 'negativo' ? 'descartado' : 'respondido';
    await sql`UPDATE out_leads SET status = ${novoStatus}, intencao = ${intencao}, respondido_em = NOW(),
      ultima_resposta = ${resumo || a.assunto}, atualizado_em = NOW() WHERE id = ${a.lead_id}`;
    await sql`INSERT INTO out_mensagens (id, lead_id, direcao, assunto, corpo)
      VALUES (${novoId('msg')}, ${a.lead_id}, 'entrada', ${a.assunto}, ${a.texto.substring(0, 2000)})`;
    resultados.push({ empresa: a.empresa, intencao, resumo, disponibilidade: a.disponibilidade, proxima_acao });
  }
  return { verificados: achadas.length, respostas: resultados,
    positivos: resultados.filter(r => r.intencao === 'positivo').length };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENDA DE VISITAS — roteiro por região
// ═══════════════════════════════════════════════════════════════════════════
async function visitaSalvar(p = {}) {
  if (!p.lead_id) throw new Error('lead_id obrigatório');
  const sql = await getSql();
  const l = (await sql`SELECT * FROM out_leads WHERE id = ${p.lead_id} LIMIT 1`)[0];
  if (!l) throw new Error('Lead não encontrado');
  const id = p.id || novoId('vis');
  await sql`INSERT INTO out_visitas (id, lead_id, empresa, contato, cidade, uf, data_visita, hora_visita, endereco, status, roteiro_id, observacoes)
    VALUES (${id}, ${p.lead_id}, ${l.empresa}, ${l.contato_nome || null}, ${p.cidade || l.cidade}, ${(p.uf || l.uf || '').toUpperCase() || null},
      ${p.data_visita || null}, ${p.hora_visita || null}, ${p.endereco || null}, ${p.status || 'a_confirmar'}, ${p.roteiro_id || null}, ${p.observacoes || null})
    ON CONFLICT (id) DO UPDATE SET data_visita=EXCLUDED.data_visita, hora_visita=EXCLUDED.hora_visita,
      endereco=EXCLUDED.endereco, status=EXCLUDED.status, roteiro_id=EXCLUDED.roteiro_id, observacoes=EXCLUDED.observacoes`;
  if (p.data_visita) await sql`UPDATE out_leads SET status = 'reuniao_marcada', atualizado_em = NOW() WHERE id = ${p.lead_id}`;
  return { id };
}
async function visitasList() {
  const sql = await getSql();
  const rows = await sql`SELECT * FROM out_visitas ORDER BY data_visita NULLS LAST, hora_visita`;
  return { visitas: rows.map(v => ({ ...v, data_visita: v.data_visita ? String(v.data_visita).split('T')[0] : null,
    regiao: regiaoDaUf(v.uf) })) };
}

// Monta o roteiro: agrupa os interessados por região/cidade e sugere a sequência
async function montarRoteiro({ data_inicio, dias_por_viagem = 5, incluir_status = ['interessado','reuniao_marcada'] } = {}) {
  const sql = await getSql();
  const leads = await sql`SELECT * FROM out_leads WHERE status = ANY(${incluir_status}) ORDER BY uf, cidade, empresa`;
  if (!leads.length) return { roteiros: [], aviso: 'Nenhum lead com interesse confirmado ainda. O roteiro é montado a partir de quem respondeu positivamente.' };

  // Agrupar por região → cidade
  const porRegiao = {};
  leads.forEach(l => {
    const reg = regiaoDaUf(l.uf);
    const cid = (l.cidade || 'Cidade não informada') + (l.uf ? '/' + l.uf : '');
    porRegiao[reg] = porRegiao[reg] || {};
    (porRegiao[reg][cid] = porRegiao[reg][cid] || []).push({
      lead_id: l.id, empresa: l.empresa, contato: l.contato_nome, cargo: l.cargo,
      email: l.email, telefone: l.telefone, status: l.status, intencao: l.intencao,
      disponibilidade: l.ultima_resposta,
    });
  });

  // Sugerir datas: 3 visitas por dia útil, cidades da mesma região em sequência
  const base = data_inicio ? new Date(data_inicio + 'T12:00:00') : new Date(Date.now() + 7 * 86400000);
  const proximoUtil = (d) => { const x = new Date(d); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1); return x; };
  let cursor = proximoUtil(base);

  const roteiros = Object.entries(porRegiao).map(([regiao, cidades]) => {
    const totalVisitas = Object.values(cidades).reduce((s, v) => s + v.length, 0);
    const inicioRegiao = new Date(cursor);
    const dias = [];
    let visitasNoDia = 0, diaAtual = { data: null, cidade: null, visitas: [] };
    const horarios = ['09:30', '14:00', '16:30'];

    Object.entries(cidades).forEach(([cidade, lista]) => {
      lista.forEach(v => {
        if (visitasNoDia === 0 || diaAtual.cidade !== cidade || visitasNoDia >= 3) {
          if (diaAtual.visitas.length) dias.push(diaAtual);
          if (diaAtual.visitas.length) { cursor.setDate(cursor.getDate() + 1); cursor = proximoUtil(cursor); }
          diaAtual = { data: cursor.toISOString().split('T')[0], cidade, visitas: [] };
          visitasNoDia = 0;
        }
        diaAtual.visitas.push({ ...v, hora_sugerida: horarios[visitasNoDia] || '18:00' });
        visitasNoDia++;
      });
    });
    if (diaAtual.visitas.length) dias.push(diaAtual);
    cursor.setDate(cursor.getDate() + 2); cursor = proximoUtil(cursor); // folga entre regiões

    return {
      regiao, total_visitas: totalVisitas, total_cidades: Object.keys(cidades).length,
      data_inicio: inicioRegiao.toISOString().split('T')[0],
      data_fim: dias.length ? dias[dias.length - 1].data : null,
      cidades: Object.keys(cidades), dias,
    };
  }).sort((a, b) => b.total_visitas - a.total_visitas);

  return { roteiros, total_leads: leads.length,
    resumo: { regioes: roteiros.length, visitas: leads.length,
      cidades: [...new Set(leads.map(l => (l.cidade||'?') + '/' + (l.uf||'?')))].length },
    observacao: 'Sugestão baseada em 3 visitas por dia útil, agrupadas por cidade. Confirme cada horário com o cliente antes de comprar passagem.' };
}

// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ success: false, error: 'JSON inválido' }); }
  const { action, payload = {} } = body;

  const acoes = {
    lead_salvar:     () => leadSalvar(payload),
    leads_importar:  () => leadsImportar(payload),
    leads_list:      () => leadsList(payload),
    lead_excluir:    () => leadExcluir(payload),
    config_get:      () => configGet(),
    config_salvar:   () => configSalvar(payload),
    redigir_email:   () => redigirEmail(payload),
    enviar_email:    () => enviarEmail(payload),
    ler_respostas:   () => lerRespostas(payload),
    visita_salvar:   () => visitaSalvar(payload),
    visitas_list:    () => visitasList(),
    montar_roteiro:  () => montarRoteiro(payload),
    status:          () => ({ ok: true, modulo: 'vendas-outbound' }),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try {
    const r = await acoes[action]();
    return res.status(200).json({ success: true, action, ...r });
  } catch (e) {
    console.error('[ERRO outbound]', action, e.message);
    return res.status(500).json({ success: false, error: e.message, dica: e.dica || null });
  }
}
