// api/prospeccao.js — v2.60
// FEED DE PROSPECÇÃO (S7): você digita "Maria Silva, maria@empresa.com" ou "João 21 99876-5432 Enel"
// e o sistema: interpreta nome/e-mail/telefone/empresa → cadastra o contato no QuickBooks →
//   se tem e-mail: envia a apresentação em anexo com texto gerado pela IA
//   se tem telefone: registra para envio via WhatsApp (Z-API) com link da apresentação
//
// Actions (POST { action, payload }):
//   feed_interpretar { texto }                  → só interpreta, não grava (preview)
//   feed_incluir { texto|contato, enviar=true } → grava, QuickBooks, e-mail/WhatsApp
//   feed_listar { dias }                        → histórico
//   feed_config_get / feed_config_set { apresentacao_media_id, apresentacao_nome, assunto, assinatura, whatsapp_texto }
//   feed_enviar_whatsapp { id }                 → dispara o WhatsApp de um contato registrado
//   feed_reenviar { id }                        → reenvia e-mail

import { neon } from '@neondatabase/serverless';

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  _sql = neon(process.env.DATABASE_URL);
  await _sql`CREATE TABLE IF NOT EXISTS prospeccao_feed (
    id TEXT PRIMARY KEY, texto_original TEXT, nome TEXT, email TEXT, telefone TEXT, empresa TEXT, cargo TEXT,
    canal TEXT, status TEXT DEFAULT 'novo', qb_customer_id TEXT, qb_erro TEXT,
    email_enviado_em TIMESTAMPTZ, email_erro TEXT, whatsapp_enviado_em TIMESTAMPTZ, whatsapp_erro TEXT,
    mensagem TEXT, criado_em TIMESTAMPTZ DEFAULT NOW())`;
  for (const col of ['contexto TEXT', 'assunto TEXT', 'anexo_media_id TEXT', 'anexo_nome TEXT']) {
    try { await _sql.query(`ALTER TABLE prospeccao_feed ADD COLUMN IF NOT EXISTS ${col}`); } catch (_) {}
  }
  await _sql`CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor JSONB, atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  return _sql;
}
const novoId = () => 'pf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ── 1. Interpretar texto livre ──
export function interpretarContato(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const email = (t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || null;
  // telefone BR: 10-11 dígitos, com ou sem +55, com separadores
  const telM = t.replace(email || '', '').match(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\s?\d{4}[\s.-]?\d{4}/);
  let telefone = telM ? telM[0].replace(/[^\d]/g, '') : null;
  if (telefone) { if (telefone.length === 10 || telefone.length === 11) telefone = '55' + telefone; if (telefone.length < 12) telefone = null; }
  // o que vem DEPOIS do telefone/e-mail sem separador é a empresa ("João 21 99876-5432 Enel")
  let resto = t;
  const marc = telM ? telM[0] : email;
  if (marc) { const k = t.indexOf(marc); const antes = t.substring(0, k).trim(), depois = t.substring(k + marc.length).trim().replace(/^[,;|\-–]\s*/, '');
    resto = antes + (depois ? ' | ' + depois : ''); }
  resto = resto.replace(email || '', ' ').replace(telM ? telM[0] : '', ' ').replace(/[,;|]+/g, ' | ').replace(/\s+/g, ' ').trim();
  // "Nome | Empresa" ou "Nome - Empresa" ou "Nome da Empresa"
  let nome = null, empresa = null, cargo = null;
  const partes = resto.split(/\s*\|\s*|\s+-\s+|\s+da\s+|\s+na\s+|\s+@\s+/).map(x => x.trim()).filter(Boolean);
  if (partes.length) nome = partes[0];
  if (partes.length > 1) empresa = partes[1];
  if (partes.length > 2) cargo = partes[2];
  // cargo em parênteses "Maria (Diretora)"
  const cm = (nome || '').match(/\(([^)]+)\)/); if (cm) { cargo = cargo || cm[1]; nome = nome.replace(cm[0], '').trim(); }
  // se não há empresa mas o e-mail é corporativo, deriva do domínio
  if (!empresa && email && !/gmail|hotmail|outlook|yahoo|icloud|uol|bol|terra/i.test(email)) {
    empresa = email.split('@')[1].split('.')[0]; empresa = empresa.charAt(0).toUpperCase() + empresa.slice(1);
  }
  const canal = email ? 'email' : telefone ? 'whatsapp' : null;
  return { nome: nome || null, email, telefone, empresa: empresa || null, cargo: cargo || null, canal,
    valido: !!(nome && (email || telefone)),
    aviso: !nome ? 'Não identifiquei o nome' : !email && !telefone ? 'Preciso de um e-mail ou telefone' : null };
}

// ── 2. Configuração (apresentação e textos) ──
async function configGet() {
  const sql = await getSql();
  const r = await sql`SELECT valor FROM app_config WHERE chave = 'prospeccao_feed'`;
  return { apresentacao_media_id: null, apresentacao_nome: 'Apresentacao_Atlantyx.pdf', assunto: 'Atlantyx — dados e IA que sua operação usa de verdade',
    assinatura: 'Fabio Quintanilha / CEO – Atlantyx', whatsapp_texto: null, apresentacao_url: null, ...(r[0]?.valor || {}) };
}
async function configSet(payload) {
  const sql = await getSql();
  const atual = await configGet();
  const novo = { ...atual, ...payload };
  await sql`INSERT INTO app_config (chave, valor, atualizado_em) VALUES ('prospeccao_feed', ${JSON.stringify(novo)}, NOW())
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
  return novo;
}
function baseUrl() { return (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, ''); }

// ── 3. QuickBooks: cadastrar o contato como Customer ──
async function qbCadastrar(c) {
  const r = await fetch(baseUrl() + '/api/financeiro', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'qb_cliente_criar', params: { nome: c.empresa ? `${c.empresa} — ${c.nome}` : c.nome, contato: c.nome, email: c.email, telefone: c.telefone,
      notas: 'Prospecção · Atlantyx OS' + (c.contexto ? ' · onde nos conhecemos: ' + c.contexto : '') + (c.cargo ? ' · cargo: ' + c.cargo : '') } }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(d.error || 'HTTP ' + r.status);
  return d.id || d.cliente?.id || null;
}

// ── 4. Texto do e-mail / WhatsApp com IA ──
async function gerarTexto(c, cfg, canal) {
  const key = process.env.ANTHROPIC_API_KEY;
  const fallback = canal === 'email'
    ? `Olá ${c.nome},\n\n${c.contexto ? 'Foi um prazer o contato em ' + c.contexto + '. ' : ''}Sou o Fabio Quintanilha, CEO da Atlantyx. Há 17 anos ajudamos empresas como CPFL, Enel e Caixa a transformar dados em decisão — com engenharia de dados, analytics e IA aplicada à operação.\n\nSegue em anexo uma apresentação curta. Se fizer sentido para ${c.empresa || 'a sua empresa'}, proponho uma conversa de 30 minutos para entender o seu cenário.\n\n${cfg.assinatura}`
    : `Olá ${c.nome}, aqui é o Fabio Quintanilha, da Atlantyx. Trabalhamos com dados e IA para grandes operações (CPFL, Enel, Caixa). Posso te mandar uma apresentação curta? Se preferir, aqui está o link: ${cfg.apresentacao_url || baseUrl() + '/captura.html?utm_source=whatsapp&utm_medium=prospeccao'}`;
  if (!key) return fallback;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, system: canal === 'email'
        ? `Escreva um e-mail de apresentação da Atlantyx (17 anos, dados/analytics/IA para grandes empresas; clientes CPFL, Enel, Caixa, Jelta) para um contato novo. Tom de CEO falando com um par: direto, sem jargão de marketing, sem "revolucionar". 90 a 130 palavras. Mencione que a apresentação vai em anexo. Feche pedindo uma conversa de 30 min. Assine como "${cfg.assinatura}". Devolva só o corpo do e-mail, sem assunto.`
        : `Escreva uma mensagem de WhatsApp de primeiro contato da Atlantyx (dados e IA para grandes empresas). Máximo 60 palavras, tom pessoal, sem emoji além de 1, terminando com a oferta de enviar a apresentação. Assine como Fabio. Devolva só a mensagem.`,
        messages: [{ role: 'user', content: `Contato: ${c.nome}${c.cargo ? ', ' + c.cargo : ''}${c.empresa ? ', empresa ' + c.empresa : ''}.`
          + (c.contexto ? `\nOnde nos conhecemos / contexto do contato: ${c.contexto}. ABRA o e-mail retomando esse contexto de forma natural e específica (ex.: "Foi ótimo conversar com você no ..."), sem soar genérico.` : '\nPrimeiro contato frio — não finja que já se conheceram.') }] }) });
    const d = await r.json();
    const txt = d?.content?.find(x => x.type === 'text')?.text?.trim();
    return txt || fallback;
  } catch (_) { return fallback; }
}

// ── 5. E-mail com anexo ──
async function enviarEmail(c, cfg, corpo, over = {}) {
  cfg = { ...cfg, ...(over.assunto ? { assunto: over.assunto } : {}), ...(over.anexo_media_id !== undefined ? { apresentacao_media_id: over.anexo_media_id, apresentacao_nome: over.anexo_nome || cfg.apresentacao_nome } : {}) };
  const nodemailer = (await import('nodemailer')).default;
  const user = process.env.EMAIL_IMAP_USER, pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS;
  if (!user || !pass) throw new Error('EMAIL_IMAP_USER/EMAIL_SMTP_PASS não configurados');
  const anexos = [];
  if (cfg.apresentacao_media_id) {
    const sql = await getSql();
    const m = (await sql`SELECT conteudo, content_type FROM media_arquivos WHERE id = ${cfg.apresentacao_media_id}`)[0];
    if (m) anexos.push({ filename: cfg.apresentacao_nome || 'Apresentacao_Atlantyx.pdf', content: Buffer.from(m.conteudo, 'base64'), contentType: m.content_type || 'application/pdf' });
  }
  const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  await t.sendMail({ from: `Fabio Quintanilha — Atlantyx <${user}>`, to: c.email, subject: cfg.assunto, text: corpo,
    html: `<div style="font-family:Arial;font-size:14px;line-height:1.6;max-width:600px;">${corpo.replace(/\n/g, '<br>')}</div>`, attachments: anexos });
  return { anexos: anexos.length };
}

// ── 6. WhatsApp via Z-API ──
async function enviarWhatsApp(telefone, mensagem) {
  const instance = process.env.ZAPI_INSTANCE, token = process.env.ZAPI_TOKEN, clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instance || !token) throw new Error('ZAPI_INSTANCE/ZAPI_TOKEN não configurados');
  const r = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(clientToken ? { 'Client-Token': clientToken } : {}) },
    body: JSON.stringify({ phone: telefone, message: mensagem }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.error || 'HTTP ' + r.status);
  return d;
}

// ── 7. Incluir (o fluxo completo) ──
async function feedIncluir({ texto, contato, enviar = true, contexto } = {}) {
  const c = contato && contato.nome ? contato : interpretarContato(texto);
  if (contexto) c.contexto = String(contexto).trim();
  if (!c.valido && !(c.nome && (c.email || c.telefone))) throw new Error(c.aviso || 'Contato incompleto');
  const sql = await getSql();
  const cfg = await configGet();
  const id = novoId();
  const canal = c.email ? 'email' : 'whatsapp';
  await sql`INSERT INTO prospeccao_feed (id, texto_original, nome, email, telefone, empresa, cargo, canal, status)
    VALUES (${id}, ${texto || null}, ${c.nome}, ${c.email || null}, ${c.telefone || null}, ${c.empresa || null}, ${c.cargo || null}, ${canal}, 'novo')`;
  const etapas = {};
  // QuickBooks
  try { const qbId = await qbCadastrar(c); await sql`UPDATE prospeccao_feed SET qb_customer_id = ${qbId} WHERE id = ${id}`; etapas.quickbooks = qbId ? 'ok' : 'sem id'; }
  catch (e) { etapas.quickbooks = 'falha: ' + e.message; await sql`UPDATE prospeccao_feed SET qb_erro = ${e.message} WHERE id = ${id}`; }
  // Mensagem
  const mensagem = await gerarTexto(c, cfg, canal);
  const assunto = c.contexto ? `${c.nome.split(' ')[0]}, retomando nossa conversa — Atlantyx` : cfg.assunto;
  await sql`UPDATE prospeccao_feed SET mensagem = ${mensagem} WHERE id = ${id}`;
  try { await sql`UPDATE prospeccao_feed SET contexto = ${c.contexto || null}, assunto = ${assunto} WHERE id = ${id}`; } catch (_) {}
  if (enviar) {
    if (canal === 'email') {
      try { const r = await enviarEmail(c, cfg, mensagem); etapas.email = r.anexos ? 'ok, com anexo' : 'ok, SEM anexo (configure a apresentação)';
        await sql`UPDATE prospeccao_feed SET email_enviado_em = NOW(), status = 'email_enviado' WHERE id = ${id}`; }
      catch (e) { etapas.email = 'falha: ' + e.message; await sql`UPDATE prospeccao_feed SET email_erro = ${e.message}, status = 'email_falhou' WHERE id = ${id}`; }
    } else {
      // WhatsApp: fica REGISTRADO para envio; dispara na hora só se Z-API estiver configurada
      if (process.env.ZAPI_INSTANCE && process.env.ZAPI_TOKEN) {
        try { await enviarWhatsApp(c.telefone, mensagem); etapas.whatsapp = 'enviado';
          await sql`UPDATE prospeccao_feed SET whatsapp_enviado_em = NOW(), status = 'whatsapp_enviado' WHERE id = ${id}`; }
        catch (e) { etapas.whatsapp = 'falha: ' + e.message; await sql`UPDATE prospeccao_feed SET whatsapp_erro = ${e.message}, status = 'whatsapp_pendente' WHERE id = ${id}`; }
      } else { etapas.whatsapp = 'registrado para envio (Z-API não configurada — use o botão 📲 para abrir no WhatsApp)'; await sql`UPDATE prospeccao_feed SET status = 'whatsapp_pendente' WHERE id = ${id}`; }
    }
  } else { await sql`UPDATE prospeccao_feed SET status = 'registrado' WHERE id = ${id}`; }
  return { id, contato: c, canal, mensagem, assunto, etapas,
    anexo_padrao: cfg.apresentacao_media_id ? { media_id: cfg.apresentacao_media_id, nome: cfg.apresentacao_nome } : null,
    whatsapp_link: c.telefone ? `https://wa.me/${c.telefone}?text=${encodeURIComponent(mensagem)}` : null };
}
async function feedListar({ dias = 30 } = {}) {
  const sql = await getSql();
  const rows = await sql`SELECT * FROM prospeccao_feed WHERE criado_em >= NOW() - (${dias} || ' days')::interval ORDER BY criado_em DESC LIMIT 300`;
  return { itens: rows.map(r => ({ ...r, whatsapp_link: r.telefone ? `https://wa.me/${r.telefone}?text=${encodeURIComponent(r.mensagem || '')}` : null })), total: rows.length };
}
async function feedEnviarWhatsApp({ id } = {}) {
  const sql = await getSql();
  const r = (await sql`SELECT * FROM prospeccao_feed WHERE id = ${id}`)[0]; if (!r) throw new Error('Registro não encontrado');
  await enviarWhatsApp(r.telefone, r.mensagem);
  await sql`UPDATE prospeccao_feed SET whatsapp_enviado_em = NOW(), whatsapp_erro = NULL, status = 'whatsapp_enviado' WHERE id = ${id}`;
  return { ok: true };
}
// v2.79: disparo a partir do editor — com o assunto, corpo e anexo que o usuário revisou na tela
async function feedDisparar({ id, assunto, corpo, anexo_media_id, anexo_nome, para } = {}) {
  const sql = await getSql();
  const r = (await sql`SELECT * FROM prospeccao_feed WHERE id = ${id}`)[0]; if (!r) throw new Error('Registro não encontrado');
  const destino = (para || r.email || '').trim(); if (!destino) throw new Error('Sem e-mail de destino');
  const cfg = await configGet();
  const txt = corpo || r.mensagem;
  const res = await enviarEmail({ ...r, email: destino }, cfg, txt, { assunto: assunto || r.assunto || cfg.assunto, anexo_media_id: anexo_media_id === '' ? null : (anexo_media_id ?? cfg.apresentacao_media_id), anexo_nome });
  await sql`UPDATE prospeccao_feed SET mensagem = ${txt}, email = ${destino}, email_enviado_em = NOW(), email_erro = NULL, status = 'email_enviado' WHERE id = ${id}`;
  try { await sql`UPDATE prospeccao_feed SET assunto = ${assunto || r.assunto || null}, anexo_media_id = ${anexo_media_id || null}, anexo_nome = ${anexo_nome || null} WHERE id = ${id}`; } catch (_) {}
  return { ok: true, anexos: res.anexos, para: destino };
}
async function feedReenviar({ id } = {}) {
  const sql = await getSql();
  const r = (await sql`SELECT * FROM prospeccao_feed WHERE id = ${id}`)[0]; if (!r) throw new Error('Registro não encontrado');
  const cfg = await configGet();
  const res = await enviarEmail(r, cfg, r.mensagem);
  await sql`UPDATE prospeccao_feed SET email_enviado_em = NOW(), email_erro = NULL, status = 'email_enviado' WHERE id = ${id}`;
  return { ok: true, anexos: res.anexos };
}

// ── v2.61: CARTÃO DE VISITAS DIGITAL ──
const CARTAO_PADRAO = { nome: 'Fabio Quintanilha', cargo: 'CEO', empresa: 'Atlantyx', tagline: 'Dados, analytics e IA para grandes empresas',
  email: '', telefone: '', whatsapp: '', linkedin: '', site: 'https://atlantyx.com.br',
  endereco_rj: 'AQUA · Av. Oscar Niemeyer, 2000 — Rio de Janeiro', endereco_sp: 'Regus · Av. Brigadeiro Faria Lima, 3729 — São Paulo',
  foto_media_id: null, cor: '#1A3A8F', clientes: 'CPFL Energia · Enel · Caixa · Jelta' };
async function cartaoGet() {
  const sql = await getSql();
  const r = await sql`SELECT valor FROM app_config WHERE chave = 'cartao_visita'`;
  return { ...CARTAO_PADRAO, ...(r[0]?.valor || {}) };
}
async function cartaoSet(payload) {
  const sql = await getSql();
  const novo = { ...(await cartaoGet()), ...payload };
  await sql`INSERT INTO app_config (chave, valor, atualizado_em) VALUES ('cartao_visita', ${JSON.stringify(novo)}, NOW())
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
  return novo;
}
// vCard para "salvar contato" no celular
function vcard(c) {
  const tel = String(c.telefone || c.whatsapp || '').replace(/[^0-9+]/g, '');
  return ['BEGIN:VCARD', 'VERSION:3.0', `N:${(c.nome||'').split(' ').slice(1).join(' ')};${(c.nome||'').split(' ')[0]};;;`, `FN:${c.nome||''}`,
    `ORG:${c.empresa||''}`, `TITLE:${c.cargo||''}`, tel ? `TEL;TYPE=CELL:${tel.startsWith('+') ? tel : '+' + tel}` : '', c.email ? `EMAIL:${c.email}` : '',
    c.site ? `URL:${c.site}` : '', c.linkedin ? `URL:${c.linkedin}` : '', c.endereco_rj ? `ADR;TYPE=WORK:;;${c.endereco_rj};;;;` : '', 'END:VCARD'].filter(Boolean).join('\r\n');
}

export default async function handler(req, res) {
  // GET /api/prospeccao?cartao=1  → JSON público do cartão (para a página cartao.html)
  // GET /api/prospeccao?vcard=1   → arquivo .vcf
  if (req.method === 'GET' && (req.query?.cartao || req.query?.vcard)) {
    try {
      const c = await cartaoGet();
      if (req.query.vcard) { res.setHeader('Content-Type', 'text/vcard; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${(c.nome||'contato').replace(/\s+/g,'_')}.vcf"`); return res.status(200).send(vcard(c)); }
      const pub = { ...c }; delete pub.foto_media_id; pub.foto_url = c.foto_media_id ? baseUrl() + '/api/media?id=' + c.foto_media_id : null;
      res.setHeader('Cache-Control', 'no-store');   // v2.62: sem cache — o cartão mostrava dados antigos por 5 min após salvar
      return res.status(200).json({ success: true, cartao: pub });
    } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });
  const { action, payload = {} } = req.body || {};
  const acoes = {
    feed_interpretar: () => interpretarContato(payload.texto),
    feed_incluir: () => feedIncluir(payload),
    feed_listar: () => feedListar(payload),
    feed_config_get: () => configGet(),
    feed_config_set: () => configSet(payload),
    feed_enviar_whatsapp: () => feedEnviarWhatsApp(payload),
    feed_reenviar: () => feedReenviar(payload),
    feed_disparar: () => feedDisparar(payload),
    cartao_get: () => cartaoGet(),
    cartao_set: () => cartaoSet(payload),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida: ' + Object.keys(acoes).join(', ') });
  try { const r = await acoes[action](); return res.status(200).json({ success: true, ...r }); }
  catch (e) { console.error('[prospeccao]', action, e.message); return res.status(500).json({ success: false, error: e.message }); }
}
