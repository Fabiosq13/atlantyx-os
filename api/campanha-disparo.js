import { comGuarda } from '../lib/qa-guard.js';
// api/campanha-disparo.js — v3.26
// Disparo das campanhas por WhatsApp (Z-API) e E-mail (SMTP).
// Antes: marcar WhatsApp/E-mail na Nova Campanha só gerava o texto (copy_por_rede) — nada era enviado,
// porque o Metricool só publica em redes sociais. Agora a campanha vira um LOTE de envios numa fila
// (disparo_envios), processado em partes (o navegador chama "processar" em sequência e o cron a cada
// 15 min continua o que ficou — inclusive envios agendados).
//
// POST { action }:
//   publico      { fonte: leads|out_leads|hubspot|manual, canal, dias?, status?, texto? , campanha_id? }
//   criar_lote   { campanha_id, campanha_nome, canal, texto, assunto?, link_destino, base_url, destinatarios[], agendar_para? }
//   processar    { lote_id?, segundos? }      → envia pendentes até o limite de tempo
//   status       { campanha_id? }             → lotes + contagens (enviados, erros, cliques, aberturas)
//   envios       { lote_id }                  → lista de destinatários do lote
//   cancelar     { lote_id }
//   teste        { canal, destino, texto, assunto?, link_destino, base_url }
//   config                                    → quais canais estão configurados
// GET  ?c=<envio>   clique (registra e redireciona ao destino com UTM)
//      ?o=<envio>   abertura de e-mail (pixel 1x1)
//      ?sair=<envio> descadastro (LGPD) — e-mail; no WhatsApp a pessoa responde SAIR (wa-response.js)
//      ?cron=1      processa a fila (Vercel Cron)

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await garantirTabelas(_sql);
  return _sql;
}
export async function garantirTabelas(sql) {
  await sql`CREATE TABLE IF NOT EXISTS disparo_lotes (
    id TEXT PRIMARY KEY, campanha_id TEXT, campanha_nome TEXT, canal TEXT, texto TEXT, assunto TEXT,
    link_destino TEXT, base_url TEXT, total INT DEFAULT 0, status TEXT DEFAULT 'ativo',
    agendar_para TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT NOW(), concluido_em TIMESTAMPTZ)`;
  await sql`CREATE TABLE IF NOT EXISTS disparo_envios (
    id TEXT PRIMARY KEY, lote_id TEXT, campanha_id TEXT, canal TEXT, destino TEXT, nome TEXT, empresa TEXT,
    origem TEXT, status TEXT DEFAULT 'pendente', erro TEXT, enviado_em TIMESTAMPTZ,
    aberto_em TIMESTAMPTZ, clicado_em TIMESTAMPTZ, cliques INT DEFAULT 0, criado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`ALTER TABLE disparo_envios ADD COLUMN IF NOT EXISTS pegou_em TIMESTAMPTZ`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS disparo_envios_unq ON disparo_envios (campanha_id, canal, destino)`;
  await sql`CREATE INDEX IF NOT EXISTS disparo_envios_lote ON disparo_envios (lote_id, status)`;
  await sql`CREATE TABLE IF NOT EXISTS disparo_optout (destino TEXT PRIMARY KEY, canal TEXT, motivo TEXT, criado_em TIMESTAMPTZ DEFAULT NOW())`;
}

// ── normalização ───────────────────────────────────────────────────────────────
export function normTelefone(v) {
  let p = String(v || '').replace(/\D/g, '');
  if (!p) return null;
  if (p.startsWith('00')) p = p.slice(2);
  if (p.length === 10 || p.length === 11) p = '55' + p;        // DDD + número
  if (!/^55\d{10,11}$/.test(p)) return /^\d{11,15}$/.test(p) && !p.startsWith('55') ? p : null; // internacional
  return p;
}
export function normEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/.test(e) ? e : null;
}
const primeiroNome = n => { const p = String(n || '').trim().split(/\s+/)[0] || ''; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; };
const slug = s => String(s || 'campanha').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').substring(0, 60);
const novoId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function linkComUtm(link, canal, campanhaId) {
  if (!link) return '';
  if (/[?&]utm_campaign=/.test(link)) return link;
  return link + (link.includes('?') ? '&' : '?') + 'utm_source=' + canal + '&utm_medium=' + (canal === 'email' ? 'email' : 'mensagem') + '&utm_campaign=' + slug(campanhaId);
}

// Personaliza o texto: {nome} {primeiro_nome} {empresa} {link}. Se o texto não citar o link, ele vai no fim.
export function montarTexto(texto, dest, linkRastreado, canal) {
  const pn = primeiroNome(dest.nome);
  let t = String(texto || '')
    .replace(/\{\{?\s*primeiro_nome\s*\}?\}/gi, pn || '')
    .replace(/\{\{?\s*nome\s*\}?\}/gi, dest.nome || pn || '')
    .replace(/\{\{?\s*empresa\s*\}?\}/gi, dest.empresa || 'sua empresa')
    .replace(/\[(nome|primeiro nome)\]/gi, pn || '')
    .replace(/\[empresa\]/gi, dest.empresa || 'sua empresa');
  t = t.replace(/^(Ol[áa]|Oi|Bom dia|Boa tarde)\s*,\s*,/i, '$1,').trim();
  // saudação pelo primeiro nome quando o texto não começa por ela
  if (canal === 'whatsapp' && pn && !new RegExp('^\\W*(ol[áa]|oi|bom dia|boa tarde|boa noite)?[\\s,!]*' + pn, 'i').test(t)) t = `Olá, ${pn}! ` + t;
  if (linkRastreado) {
    if (/\{\{?\s*link\s*\}?\}/i.test(t)) t = t.replace(/\{\{?\s*link\s*\}?\}/gi, linkRastreado);
    else t = t + '\n\n' + linkRastreado;
  }
  if (canal === 'whatsapp') t += '\n\n_Para não receber mais mensagens, responda SAIR._';
  return t;
}

export function htmlEmail({ texto, assunto, linkRastreado, linkSair, pixel }) {
  const corpo = String(texto || '').split(/\n{2,}/).map(par => {
    const linha = esc(par).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, u => u === esc(linkRastreado) ? '' : `<a href="${u}" style="color:#1A3A8F;">${u}</a>`);
    return linha.trim() ? `<p style="margin:0 0 14px;">${linha}</p>` : '';
  }).join('');
  const assinatura = process.env.EMAIL_ASSINATURA || 'Fabio Quintanilha<br>CEO – Atlantyx';
  return `<!doctype html><html><body style="margin:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5fa;padding:24px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;">
<tr><td style="background:#1A3A8F;padding:18px 28px;color:#fff;font-size:18px;font-weight:700;letter-spacing:.5px;">ATLANTYX</td></tr>
<tr><td style="padding:28px;color:#1d2433;font-size:15px;line-height:1.6;">${corpo}
${linkRastreado ? `<p style="margin:22px 0;"><a href="${esc(linkRastreado)}" style="background:#4F7CFF;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:700;display:inline-block;">Quero conversar</a></p>` : ''}
<p style="margin:22px 0 0;color:#5a6478;font-size:14px;">${assinatura}</p></td></tr>
<tr><td style="padding:14px 28px;background:#f8f9fc;color:#8a93a6;font-size:11px;line-height:1.5;">Você recebeu este e-mail porque teve contato com a Atlantyx.
${linkSair ? ` <a href="${esc(linkSair)}" style="color:#8a93a6;">Não quero mais receber</a>.` : ''}</td></tr>
</table></td></tr></table>${pixel ? `<img src="${esc(pixel)}" width="1" height="1" alt="" style="display:block;border:0;">` : ''}</body></html>`;
}

// ── canais ─────────────────────────────────────────────────────────────────────
export function configCanais() {
  const smtpUser = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  return {
    whatsapp: !!(process.env.ZAPI_INSTANCE && process.env.ZAPI_TOKEN),
    email: !!(smtpUser && smtpPass),
    hubspot: !!process.env.HUBSPOT_TOKEN,
    remetente: smtpUser || null,
  };
}

async function enviarWhatsApp(phone, message) {
  if (!process.env.ZAPI_INSTANCE || !process.env.ZAPI_TOKEN) throw new Error('WhatsApp não configurado (ZAPI_INSTANCE / ZAPI_TOKEN no Vercel)');
  const r = await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ZAPI_CLIENT_TOKEN ? { 'Client-Token': process.env.ZAPI_CLIENT_TOKEN } : {}) },
    body: JSON.stringify({ phone, message }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error('Z-API ' + r.status + ': ' + t.substring(0, 160));
  try { const d = JSON.parse(t); if (d.error) throw new Error('Z-API: ' + (d.message || d.error)); } catch (e) { if (/^Z-API/.test(e.message)) throw e; }
}

let _transp = null;
async function transporte() {
  if (_transp) return _transp;
  const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('E-mail de envio não configurado (EMAIL_SMTP_USER / EMAIL_SMTP_PASS no Vercel)');
  const dom = String(user).split('@')[1] || '';
  const host = process.env.EMAIL_SMTP_HOST || (/gmail\.com$/i.test(dom) ? 'smtp.gmail.com' : (dom ? 'mail.' + dom : 'smtp.gmail.com'));
  const port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
  const nodemailer = (await import('nodemailer')).default;
  _transp = { user, t: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 20000,
    ...(process.env.EMAIL_SMTP_TLS_RELAXADO === '1' ? { tls: { rejectUnauthorized: false } } : {}) }) };
  return _transp;
}
async function enviarEmail({ para, assunto, texto, html, linkSair }) {
  const { user, t } = await transporte();
  const nome = process.env.EMAIL_REMETENTE_NOME || 'Fabio Quintanilha · Atlantyx';
  await t.sendMail({ from: `"${nome}" <${user}>`, to: para, subject: assunto, text: texto, html,
    ...(linkSair ? { headers: { 'List-Unsubscribe': `<${linkSair}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) });
}

// ── público (de onde vêm os destinatários) ────────────────────────────────────
async function publico({ fonte = 'leads', canal = 'whatsapp', dias = 365, status = '', texto = '', campanha_id = '' }) {
  const sql = await getSql();
  let lista = [];
  if (fonte === 'leads') {
    try {
      const desde = new Date(Date.now() - (parseInt(dias) || 365) * 864e5).toISOString();
      const r = await sql`SELECT nome, empresa, email, telefone, status FROM leads WHERE criado_em >= ${desde} ORDER BY criado_em DESC LIMIT 2000`;
      lista = r.filter(x => !status || x.status === status).map(x => ({ nome: x.nome, empresa: x.empresa, email: x.email, telefone: x.telefone, origem: 'Leads captados' }));
    } catch (_) { lista = []; }
  } else if (fonte === 'out_leads') {
    try {
      const r = await sql`SELECT contato_nome, empresa, email, telefone, status FROM out_leads ORDER BY empresa LIMIT 3000`;
      lista = r.filter(x => !status || x.status === status).map(x => ({ nome: x.contato_nome, empresa: x.empresa, email: x.email, telefone: x.telefone, origem: 'Base outbound' }));
    } catch (_) { lista = []; }
  } else if (fonte === 'hubspot') {
    if (!process.env.HUBSPOT_TOKEN) throw new Error('HUBSPOT_TOKEN não configurado');
    const props = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', 'lifecyclestage'];
    const filtros = canal === 'email' ? [{ propertyName: 'email', operator: 'HAS_PROPERTY' }] : null;
    const grupos = canal === 'email' ? [{ filters: filtros }] : [{ filters: [{ propertyName: 'mobilephone', operator: 'HAS_PROPERTY' }] }, { filters: [{ propertyName: 'phone', operator: 'HAS_PROPERTY' }] }];
    if (status) grupos.forEach(g => g.filters.push({ propertyName: 'lifecyclestage', operator: 'EQ', value: status }));
    let after; const res = [];
    for (let pag = 0; pag < 5; pag++) {
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', { method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.HUBSPOT_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterGroups: grupos, properties: props, limit: 100, ...(after ? { after } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('HubSpot: ' + (d.message || r.status));
      res.push(...(d.results || [])); after = d.paging?.next?.after; if (!after) break;
    }
    lista = res.map(c => { const p = c.properties || {}; return { nome: [p.firstname, p.lastname].filter(Boolean).join(' '), empresa: p.company, email: p.email, telefone: p.mobilephone || p.phone, origem: 'HubSpot', hubspot_id: c.id }; });
  } else if (fonte === 'manual') {
    // uma pessoa por linha: nome; empresa; telefone ou e-mail (separador ; , ou tab)
    lista = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const partes = l.split(/[;\t]|,(?=\s*[^\s])/).map(s => s.trim());
      const email = partes.find(p => normEmail(p)); const tel = partes.find(p => !normEmail(p) && /\d{8,}/.test(p.replace(/\D/g, '')));
      const resto = partes.filter(p => p !== email && p !== tel);
      return { nome: resto[0] || '', empresa: resto[1] || '', email, telefone: tel, origem: 'Lista colada' };
    });
  }
  // normaliza, remove inválidos, duplicados, descadastrados e quem já recebeu ESTA campanha
  const vistos = new Set(); const out = []; let sem_contato = 0;
  const optout = new Set((await sql`SELECT destino FROM disparo_optout`).map(r => r.destino));
  const jaRecebeu = campanha_id ? new Set((await sql`SELECT destino FROM disparo_envios WHERE campanha_id = ${campanha_id} AND canal = ${canal} AND status IN ('enviado','pendente')`).map(r => r.destino)) : new Set();
  let descadastrados = 0, ja = 0;
  for (const p of lista) {
    const destino = canal === 'email' ? normEmail(p.email) : normTelefone(p.telefone);
    if (!destino) { sem_contato++; continue; }
    if (vistos.has(destino)) continue; vistos.add(destino);
    if (optout.has(destino)) { descadastrados++; continue; }
    out.push({ ...p, destino, ja_recebeu: jaRecebeu.has(destino) });
    if (jaRecebeu.has(destino)) ja++;
  }
  return { success: true, fonte, canal, total_bruto: lista.length, sem_contato, descadastrados, ja_receberam: ja, destinatarios: out };
}

// ── lote ───────────────────────────────────────────────────────────────────────
async function criarLote(b) {
  const sql = await getSql();
  const canal = b.canal === 'email' ? 'email' : 'whatsapp';
  if (!String(b.texto || '').trim()) throw new Error('Texto da mensagem vazio');
  if (canal === 'email' && !String(b.assunto || '').trim()) throw new Error('Informe o assunto do e-mail');
  const cfg = configCanais();
  if (!cfg[canal]) throw new Error(canal === 'email' ? 'E-mail de envio não configurado (EMAIL_SMTP_USER / EMAIL_SMTP_PASS no Vercel)' : 'WhatsApp não configurado (ZAPI_INSTANCE / ZAPI_TOKEN no Vercel)');
  const dests = (b.destinatarios || []).slice(0, 2000);
  if (!dests.length) throw new Error('Nenhum destinatário selecionado');
  const campanha_id = String(b.campanha_id || 'avulsa_' + Date.now().toString(36));
  const id = novoId('lt_');
  const agendar = b.agendar_para ? new Date(b.agendar_para) : null;
  await sql`INSERT INTO disparo_lotes (id, campanha_id, campanha_nome, canal, texto, assunto, link_destino, base_url, total, agendar_para)
    VALUES (${id}, ${campanha_id}, ${b.campanha_nome || campanha_id}, ${canal}, ${b.texto}, ${b.assunto || null}, ${b.link_destino || null},
      ${String(b.base_url || '').replace(/\/$/, '') || null}, 0, ${agendar && !isNaN(agendar) ? agendar.toISOString() : null})`;
  const optout = new Set((await sql`SELECT destino FROM disparo_optout`).map(r => r.destino));
  let inseridos = 0, repetidos = 0, invalidos = 0;
  for (const d of dests) {
    const destino = canal === 'email' ? normEmail(d.destino || d.email) : normTelefone(d.destino || d.telefone);
    if (!destino || optout.has(destino)) { invalidos++; continue; }
    const r = await sql`INSERT INTO disparo_envios (id, lote_id, campanha_id, canal, destino, nome, empresa, origem)
      VALUES (${novoId('ev_')}, ${id}, ${campanha_id}, ${canal}, ${destino}, ${d.nome || null}, ${d.empresa || null}, ${d.origem || null})
      ON CONFLICT (campanha_id, canal, destino) DO NOTHING RETURNING id`;
    if (r.length) inseridos++; else repetidos++;
  }
  if (!inseridos) await sql`DELETE FROM disparo_lotes WHERE id = ${id}`; // nada novo a enviar — não polui o histórico
  else await sql`UPDATE disparo_lotes SET total = ${inseridos} WHERE id = ${id}`;
  return { success: true, lote_id: inseridos ? id : null, campanha_id, inseridos, repetidos, invalidos, agendado: !!agendar };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
function horarioComercial(d = new Date()) {
  const sp = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dia = sp.getDay(), h = sp.getHours();
  return dia >= 1 && dia <= 5 && h >= 8 && h < 19;
}

// Envia pendentes até o orçamento de tempo. WhatsApp com intervalo aleatório (evita bloqueio do número).
async function processar({ lote_id = null, segundos = 50, cron = false }) {
  const sql = await getSql();
  const ini = Date.now(); const lim = Math.min(Math.max(10, parseInt(segundos) || 50), 100) * 1000;
  if (cron && !horarioComercial()) return { success: true, ignorado: 'fora do horário comercial (seg–sex 8h–19h)' };
  const lotes = lote_id
    ? await sql`SELECT * FROM disparo_lotes WHERE id = ${lote_id}`
    : await sql`SELECT * FROM disparo_lotes WHERE status = 'ativo' AND (agendar_para IS NULL OR agendar_para <= NOW()) ORDER BY criado_em LIMIT 5`;
  const intervaloWa = parseInt(process.env.DISPARO_INTERVALO_WA || '6', 10);
  let enviados = 0, erros = 0;
  for (const lote of lotes) {
    if (lote.status !== 'ativo') continue;
    if (lote.agendar_para && new Date(lote.agendar_para) > new Date() && !lote_id) continue;
    const optout = new Set((await sql`SELECT destino FROM disparo_optout`).map(r => r.destino));
    while (Date.now() - ini < lim - (lote.canal === 'whatsapp' ? (intervaloWa + 8) * 1000 : 8000)) {
      const [ev] = await sql`UPDATE disparo_envios SET status = 'enviando', pegou_em = NOW() WHERE id = (
        SELECT id FROM disparo_envios WHERE lote_id = ${lote.id} AND status = 'pendente' ORDER BY criado_em LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`;
      if (!ev) break;
      if (optout.has(ev.destino)) { await sql`UPDATE disparo_envios SET status = 'descadastrado' WHERE id = ${ev.id}`; continue; }
      const base = lote.base_url || process.env.MEDIA_PUBLIC_BASE || '';
      const linkRastreado = lote.link_destino && base ? `${base}/api/campanha-disparo?c=${ev.id}` : linkComUtm(lote.link_destino, lote.canal, lote.campanha_id);
      try {
        const texto = montarTexto(lote.texto, ev, linkRastreado, lote.canal);
        if (lote.canal === 'email') {
          const linkSair = base ? `${base}/api/campanha-disparo?sair=${ev.id}` : null;
          const assunto = montarTexto(lote.assunto || '', ev, '', 'email').trim();
          await enviarEmail({ para: ev.destino, assunto, texto: texto + (linkSair ? `\n\nNão quer mais receber? ${linkSair}` : ''),
            html: htmlEmail({ texto, assunto, linkRastreado, linkSair, pixel: base ? `${base}/api/campanha-disparo?o=${ev.id}` : null }), linkSair });
        } else {
          await enviarWhatsApp(ev.destino, texto);
        }
        await sql`UPDATE disparo_envios SET status = 'enviado', enviado_em = NOW(), erro = NULL WHERE id = ${ev.id}`;
        enviados++;
      } catch (e) {
        await sql`UPDATE disparo_envios SET status = 'erro', erro = ${String(e.message).substring(0, 300)} WHERE id = ${ev.id}`;
        erros++;
        if (/não configurado|Invalid login|EAUTH|\b401\b|\b403\b/i.test(e.message)) { // erro de configuração: devolve à fila e para
          await sql`UPDATE disparo_envios SET status = 'pendente', erro = NULL WHERE id = ${ev.id}`;
          return { success: false, error: e.message, enviados, erros: erros - 1 };
        }
      }
      if (lote.canal === 'whatsapp') await sleep((intervaloWa + Math.random() * 4) * 1000); else await sleep(700);
    }
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM disparo_envios WHERE lote_id = ${lote.id} AND status IN ('pendente','enviando')`;
    if (!n) await sql`UPDATE disparo_lotes SET status = 'concluido', concluido_em = NOW() WHERE id = ${lote.id}`;
  }
  // envios presos em "enviando" há mais de 5 min (função caiu no meio) voltam para a fila
  await sql`UPDATE disparo_envios SET status = 'pendente' WHERE status = 'enviando' AND pegou_em < NOW() - INTERVAL '5 minutes'`;
  const restantes = lote_id ? (await sql`SELECT COUNT(*)::int AS n FROM disparo_envios WHERE lote_id = ${lote_id} AND status IN ('pendente','enviando')`)[0].n : null;
  return { success: true, enviados, erros, restantes };
}

async function status({ campanha_id = null }) {
  const sql = await getSql();
  const lotes = campanha_id
    ? await sql`SELECT * FROM disparo_lotes WHERE campanha_id = ${campanha_id} ORDER BY criado_em DESC LIMIT 50`
    : await sql`SELECT * FROM disparo_lotes ORDER BY criado_em DESC LIMIT 50`;
  if (!lotes.length) return { success: true, lotes: [] };
  const ids = lotes.map(l => l.id);
  const cont = await sql`SELECT lote_id, status, COUNT(*)::int AS n, COUNT(aberto_em)::int AS abertos, COUNT(clicado_em)::int AS clicados
    FROM disparo_envios WHERE lote_id = ANY(${ids}) GROUP BY lote_id, status`;
  return { success: true, lotes: lotes.map(l => {
    const c = cont.filter(x => x.lote_id === l.id); const por = Object.fromEntries(c.map(x => [x.status, x.n]));
    return { id: l.id, campanha_id: l.campanha_id, campanha_nome: l.campanha_nome, canal: l.canal, assunto: l.assunto, status: l.status,
      agendar_para: l.agendar_para, criado_em: l.criado_em, concluido_em: l.concluido_em, total: l.total,
      enviados: por.enviado || 0, pendentes: (por.pendente || 0) + (por.enviando || 0), erros: por.erro || 0, cancelados: por.cancelado || 0,
      descadastrados: por.descadastrado || 0, abertos: c.reduce((s, x) => s + x.abertos, 0), clicados: c.reduce((s, x) => s + x.clicados, 0) };
  }) };
}

// ── handler ────────────────────────────────────────────────────────────────────
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = req.query || {};
  try {
    if (req.method === 'GET') {
      if (q.c) { // clique
        const sql = await getSql();
        const [ev] = await sql`UPDATE disparo_envios SET clicado_em = COALESCE(clicado_em, NOW()), cliques = cliques + 1 WHERE id = ${String(q.c)} RETURNING lote_id, canal, campanha_id`;
        let destino = '/captura.html';
        if (ev) { const [l] = await sql`SELECT link_destino FROM disparo_lotes WHERE id = ${ev.lote_id}`; destino = linkComUtm(l?.link_destino || '/captura.html', ev.canal, ev.campanha_id); }
        res.setHeader('Cache-Control', 'no-store');
        return res.redirect(302, destino);
      }
      if (q.o) { // abertura
        try { const sql = await getSql(); await sql`UPDATE disparo_envios SET aberto_em = COALESCE(aberto_em, NOW()) WHERE id = ${String(q.o)}`; } catch (_) {}
        res.setHeader('Content-Type', 'image/gif'); res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
      }
      if (q.sair) { // descadastro
        const sql = await getSql();
        const [ev] = await sql`SELECT destino, canal FROM disparo_envios WHERE id = ${String(q.sair)}`;
        if (ev) {
          await sql`INSERT INTO disparo_optout (destino, canal, motivo) VALUES (${ev.destino}, ${ev.canal}, 'link de descadastro') ON CONFLICT (destino) DO NOTHING`;
          await sql`UPDATE disparo_envios SET status = 'descadastrado' WHERE destino = ${ev.destino} AND status = 'pendente'`;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descadastro</title><body style="font-family:Arial,sans-serif;background:#f3f5fa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div style="background:#fff;padding:32px;border-radius:10px;max-width:420px;text-align:center;"><h2 style="color:#1A3A8F;margin-top:0;">Pronto</h2><p style="color:#333;">${ev ? 'Você não vai mais receber nossas mensagens neste endereço.' : 'Link inválido ou já utilizado.'}</p><p style="color:#8a93a6;font-size:12px;">Atlantyx</p></div></body>`);
      }
      if (q.cron) {
        const auth = req.headers.authorization || '';
        if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Não autorizado' });
        return res.status(200).json(await processar({ cron: true, segundos: 50 }));
      }
      return res.status(200).json({ success: true, config: configCanais() });
    }
    if (req.method !== 'POST') return res.status(405).end();
    const b = req.body || {};
    switch (b.action) {
      case 'config': return res.status(200).json({ success: true, config: configCanais() });
      case 'publico': return res.status(200).json(await publico(b));
      case 'criar_lote': return res.status(200).json(await criarLote(b));
      case 'processar': return res.status(200).json(await processar(b));
      case 'status': return res.status(200).json(await status(b));
      case 'envios': {
        const sql = await getSql();
        const r = await sql`SELECT id, destino, nome, empresa, origem, status, erro, enviado_em, aberto_em, clicado_em, cliques FROM disparo_envios WHERE lote_id = ${b.lote_id} ORDER BY criado_em LIMIT 2000`;
        return res.status(200).json({ success: true, envios: r });
      }
      case 'cancelar': {
        const sql = await getSql();
        await sql`UPDATE disparo_envios SET status = 'cancelado' WHERE lote_id = ${b.lote_id} AND status = 'pendente'`;
        await sql`UPDATE disparo_lotes SET status = 'cancelado', concluido_em = NOW() WHERE id = ${b.lote_id}`;
        return res.status(200).json({ success: true });
      }
      case 'retomar_erros': {
        const sql = await getSql();
        const r = await sql`UPDATE disparo_envios SET status = 'pendente', erro = NULL WHERE lote_id = ${b.lote_id} AND status = 'erro' RETURNING id`;
        await sql`UPDATE disparo_lotes SET status = 'ativo', concluido_em = NULL WHERE id = ${b.lote_id}`;
        return res.status(200).json({ success: true, reenfileirados: r.length });
      }
      case 'teste': {
        const canal = b.canal === 'email' ? 'email' : 'whatsapp';
        const destino = canal === 'email' ? normEmail(b.destino) : normTelefone(b.destino);
        if (!destino) throw new Error(canal === 'email' ? 'E-mail de teste inválido' : 'Telefone de teste inválido (use DDD + número)');
        const link = linkComUtm(b.link_destino, canal, b.campanha_id || 'teste');
        const dest = { nome: b.nome || 'Fabio', empresa: b.empresa || 'Atlantyx' };
        const texto = montarTexto(b.texto, dest, link, canal);
        if (canal === 'email') await enviarEmail({ para: destino, assunto: '[TESTE] ' + montarTexto(b.assunto || '', dest, '', 'email'), texto, html: htmlEmail({ texto, linkRastreado: link }) });
        else await enviarWhatsApp(destino, '[TESTE] ' + texto);
        return res.status(200).json({ success: true, destino });
      }
      case 'optout_listar': {
        const sql = await getSql();
        return res.status(200).json({ success: true, optout: await sql`SELECT * FROM disparo_optout ORDER BY criado_em DESC LIMIT 500` });
      }
      default: return res.status(400).json({ error: 'action inválida' });
    }
  } catch (e) {
    console.error('[campanha-disparo]', e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'campanha-disparo');
