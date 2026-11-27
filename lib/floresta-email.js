// lib/floresta-email.js — aviso INTERNO por e-mail para o vendedor (Ademir): reunião marcada e lead que entrou na ligação.
// É aviso da equipe (não é envio a cliente). Usa o mesmo e-mail do sistema do retorno da IARA (EMAIL_SMTP_USER/EMAIL_SMTP_PASS).
// v3.540: QUEM RECEBE — lead do funil/atributo WX (Patricia) vai para a Patricia; os demais, para o Ademir. O fundador recebe cópia de tudo.
export const VENDEDORES = { padrao: { nome: 'Ademir Souza', email: 'ademir.souza@atlanteam.com.br' }, wx: { nome: 'Patricia Toscano', email: 'pt@wxc.one' } };
export const COPIA_FUNDADOR = 'contato@atlanteam.com.br';
export const COPIA_FUNDADOR_GMAIL = 'atlanteambr@gmail.com';   // v3.611: cópia também no Gmail (reuniões e avisos do vendedor)
const RX_WX = /(^|[^a-z0-9])wx([^a-z0-9]|$)|wxc|patr[ií]cia/i;
// card da Floresta (ou objeto com os mesmos campos): funil do negócio, etapa no HubSpot, abordagem, campanha, origem ou dono com "WX"/"Patricia"
export function ehWX(c = {}) { return RX_WX.test([c.pipeline_nome, c.etapa_hs, c.abordagem, c.campanha, c.origem, c.dono, c.funil].filter(Boolean).join(' | ')); }
export const vendedorDe = c => (ehWX(c) ? VENDEDORES.wx : VENDEDORES.padrao);
// card da Floresta de um contato do HubSpot: negócio em que ele é QUALQUER um dos contatos associados (não só o primeiro) ou o card do próprio contato
export const cardDoContato = (cards, id) => (cards || []).find(k => k.tipo === 'negocio' && (String(k.contato_id) === String(id) || (k.contatos || []).some(q => String(q.id) === String(id)))) || (cards || []).find(k => k.tipo === 'contato' && String(k.hs_id) === String(id)) || null;
export const escE = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// bloco com TODOS os dados do lead para o e-mail
export function blocoLead(c, extra = {}) {
  const l = (r, v) => v ? `<div><b>${r}:</b> ${escE(v)}</div>` : '';
  return `<tr><td style="padding:12px 14px;border-bottom:1px solid #e5e9f0;font-family:Arial,sans-serif;font-size:14px;color:#0b1220">
    <div style="font-size:15px;font-weight:700">${escE(c.nome || 'Lead')}${c.nivel ? ' · N' + c.nivel : ''}</div>
    <div style="color:#5b6670;font-size:13px">${escE([c.cargo, c.empresa].filter(Boolean).join(' · '))}</div>
    ${extra.reuniao ? `<div style="margin-top:6px;font-size:15px;color:#047857"><b>📅 Reunião:</b> ${escE(extra.reuniao)}</div>` : ''}
    <div style="margin-top:6px">${l('Telefone', c.telefone || c.tel) || '<div><b>Telefone:</b> não informado</div>'}${l('E-mail', c.email) || '<div><b>E-mail:</b> não informado</div>'}${l('Setor', c.setor)}${l('Caminho', extra.caminho)}${l('Origem', extra.origem)}</div>
    ${extra.nota ? `<div style="margin-top:6px;white-space:pre-wrap">${escE(String(extra.nota).substring(0, 1500))}</div>` : ''}
    ${c.briefing?.gancho || c.briefing?.setor_linha ? `<div style="margin-top:4px;color:#5b6670"><b>Briefing:</b> ${escE(c.briefing.gancho || c.briefing.setor_linha)}</div>` : ''}
    ${c.resumo_sdr ? `<details style="margin-top:6px"><summary style="cursor:pointer;color:#5b6670">Resumo da IARA</summary><div style="white-space:pre-wrap;font-size:13px">${escE(String(c.resumo_sdr).substring(0, 2500))}</div></details>` : ''}
    ${c.link ? `<div style="margin-top:6px"><a href="${c.link}" style="color:#00708A">Abrir no HubSpot</a></div>` : ''}</td></tr>`;
}
// v3.608: convite de calendário (.ics) da reunião marcada na ligação. data = 'YYYY-MM-DDTHH:MM' (horário de Brasília, sem horário de verão).
export function icsReuniao({ data, titulo, descricao = '', organizador, participantes = [], minutos = 30, uid }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(data || '')); if (!m) return null;
  const ini = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3, +m[5])), fim = new Date(ini.getTime() + minutos * 60000);
  const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), esc = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atlantyx OS//Floresta//PT', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST', 'BEGIN:VEVENT', 'UID:' + (uid || 'atx-' + ini.getTime()) + '@atlantyx-os', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(ini), 'DTEND:' + f(fim),
    'SUMMARY:' + esc(titulo), 'DESCRIPTION:' + esc(descricao), 'STATUS:CONFIRMED', 'SEQUENCE:0', organizador ? 'ORGANIZER;CN=Atlantyx OS:mailto:' + organizador : '',
    ...participantes.map(e => 'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:' + e), 'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Reunião em 30 minutos', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}
export async function enviarAvisoVendedor({ assunto, intro, blocos = [], vendedorEmail = VENDEDORES.padrao.email, convite = null }) {
  const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER, pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, erro: 'e-mail do sistema não configurado (EMAIL_SMTP_USER/EMAIL_SMTP_PASS)' };
  const nodemailer = (await import('nodemailer')).default; const dom = String(user).split('@')[1] || '';
  const host = process.env.EMAIL_SMTP_HOST || (/gmail\.com$/i.test(dom) ? 'smtp.gmail.com' : (dom ? 'mail.' + dom : 'smtp.gmail.com')), port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
  // v3.546: lead WX → SÓ a Patricia (e a cópia do fundador); os destinatários extras da variável IARA_RETORNO_PARA valem apenas para os leads do vendedor padrão
  let para = [...new Set([vendedorEmail, COPIA_FUNDADOR, COPIA_FUNDADOR_GMAIL, ...(vendedorEmail === VENDEDORES.padrao.email ? (process.env.IARA_RETORNO_PARA || '').split(',') : [])].map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))].join(', ');
  const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px"><p style="font-size:15px">${intro}</p><table style="border-collapse:collapse;width:100%;border:1px solid #e5e9f0">${blocos.join('')}</table>
    <p style="font-size:13px;color:#5b6670">Floresta de Vendas: <a href="${base}" style="color:#00708A">${base}</a> → Vendas → Floresta. Aviso automático do Atlantyx OS.</p></div>`;
  const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 30000, ...(process.env.EMAIL_SMTP_TLS_RELAXADO === '1' ? { tls: { rejectUnauthorized: false } } : {}) });
  // convite: vai para a equipe; o lead só recebe se FLORESTA_CONVITE_LEAD=1 (regra de envio externo aprovada pelo fundador)
  let icalEvent; if (convite?.data) { const lead = convite.leadEmail && process.env.FLORESTA_CONVITE_LEAD === '1' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(convite.leadEmail) ? [convite.leadEmail.toLowerCase()] : [];
    const ics = icsReuniao({ data: convite.data, titulo: convite.titulo || assunto, descricao: convite.descricao, organizador: user, participantes: [...para.split(', '), ...lead], uid: convite.uid }); if (ics) icalEvent = { method: 'REQUEST', content: ics }; if (lead.length) para += ', ' + lead[0]; }
  await t.sendMail({ from: `Atlantyx OS <${user}>`, to: para, subject: assunto, html, ...(icalEvent ? { icalEvent } : {}) }); return { ok: true, para, convite: !!icalEvent };
}

// v3.652: e-mail de abordagem para o LEAD — sai da caixa do sistema em nome do vendedor, com resposta indo para o vendedor (e cópia oculta para ele)
export async function enviarEmailLead({ para, assunto, corpo, funil }) {
  const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER, pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('e-mail do sistema não configurado (EMAIL_SMTP_USER/EMAIL_SMTP_PASS)');
  const nodemailer = (await import('nodemailer')).default; const dom = String(user).split('@')[1] || '';
  const host = process.env.EMAIL_SMTP_HOST || (/gmail\.com$/i.test(dom) ? 'smtp.gmail.com' : (dom ? 'mail.' + dom : 'smtp.gmail.com')), port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
  const v = funil === 'wx' ? VENDEDORES.wx : VENDEDORES.padrao, e = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 30000 });
  const info = await t.sendMail({ from: `${v.nome} | Atlantyx <${user}>`, to: para, replyTo: v.email, bcc: v.email, subject: assunto, text: corpo, html: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' + e(corpo).replace(/\r?\n/g, '<br>') + '</div>' });
  return { ok: true, de: user, responder_para: v.email, aceitos: info.accepted || [], rejeitados: info.rejected || [] };
}
