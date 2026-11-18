// lib/floresta-email.js — aviso INTERNO por e-mail para o vendedor (Ademir): reunião marcada e lead que entrou na ligação.
// É aviso da equipe (não é envio a cliente). Usa o mesmo e-mail do sistema do retorno da IARA (EMAIL_SMTP_USER/EMAIL_SMTP_PASS).
// v3.540: QUEM RECEBE — lead do funil/atributo WX (Patricia) vai para a Patricia; os demais, para o Ademir. O fundador recebe cópia de tudo.
export const VENDEDORES = { padrao: { nome: 'Ademir Souza', email: 'ademir.souza@atlanteam.com.br' }, wx: { nome: 'Patricia Toscano', email: 'pt@wxc.one' } };
export const COPIA_FUNDADOR = 'contato@atlanteam.com.br';
const RX_WX = /(^|[^a-z0-9])wx([^a-z0-9]|$)|wxc|patr[ií]cia/i;
// card da Floresta (ou objeto com os mesmos campos): funil do negócio, etapa no HubSpot, abordagem, campanha, origem ou dono com "WX"/"Patricia"
export function ehWX(c = {}) { return RX_WX.test([c.pipeline_nome, c.etapa_hs, c.abordagem, c.campanha, c.origem, c.dono, c.funil].filter(Boolean).join(' | ')); }
export const vendedorDe = c => (ehWX(c) ? VENDEDORES.wx : VENDEDORES.padrao);
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
export async function enviarAvisoVendedor({ assunto, intro, blocos = [], vendedorEmail = VENDEDORES.padrao.email }) {
  const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER, pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, erro: 'e-mail do sistema não configurado (EMAIL_SMTP_USER/EMAIL_SMTP_PASS)' };
  const nodemailer = (await import('nodemailer')).default; const dom = String(user).split('@')[1] || '';
  const host = process.env.EMAIL_SMTP_HOST || (/gmail\.com$/i.test(dom) ? 'smtp.gmail.com' : (dom ? 'mail.' + dom : 'smtp.gmail.com')), port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
  const para = [...new Set([vendedorEmail, COPIA_FUNDADOR, ...(process.env.IARA_RETORNO_PARA || '').split(',')].map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))].join(', ');
  const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px"><p style="font-size:15px">${intro}</p><table style="border-collapse:collapse;width:100%;border:1px solid #e5e9f0">${blocos.join('')}</table>
    <p style="font-size:13px;color:#5b6670">Floresta de Vendas: <a href="${base}" style="color:#00708A">${base}</a> → Vendas → Floresta. Aviso automático do Atlantyx OS.</p></div>`;
  const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 30000, ...(process.env.EMAIL_SMTP_TLS_RELAXADO === '1' ? { tls: { rejectUnauthorized: false } } : {}) });
  await t.sendMail({ from: `Atlantyx OS <${user}>`, to: para, subject: assunto, html }); return { ok: true, para };
}
