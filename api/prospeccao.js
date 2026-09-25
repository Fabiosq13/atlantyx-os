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
import { enviarContatoHubSpot, registrarAtividade, testarHubSpot } from '../lib/hubspot-sync.js';

// v2.88: compatibilidade com o driver @neondatabase/serverless 0.10.x — nele NÃO existe sql.query();
// SQL montado em texto é executado chamando sql(texto, params). Nas versões ≥1.0 é sql.query(texto, params).
// Antes, toda chamada sql.query() falhava em silêncio: colunas novas nunca eram criadas.
const _q = (db, texto, params) => (typeof db.query === 'function' ? db.query(texto, params) : db(texto, params));

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

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  _sql = neon(process.env.DATABASE_URL);
  await _sql`CREATE TABLE IF NOT EXISTS prospeccao_feed (
    id TEXT PRIMARY KEY, texto_original TEXT, nome TEXT, email TEXT, telefone TEXT, empresa TEXT, cargo TEXT,
    canal TEXT, status TEXT DEFAULT 'novo', qb_customer_id TEXT, qb_erro TEXT,
    email_enviado_em TIMESTAMPTZ, email_erro TEXT, whatsapp_enviado_em TIMESTAMPTZ, whatsapp_erro TEXT,
    mensagem TEXT, criado_em TIMESTAMPTZ DEFAULT NOW())`;
  for (const col of ['contexto TEXT', 'assunto TEXT', 'anexo_media_id TEXT', 'anexo_nome TEXT', 'analise TEXT', 'hubspot_contato_id TEXT', 'hubspot_negocio_id TEXT', 'hubspot_erro TEXT']) {
    try { await _q(_sql, `ALTER TABLE prospeccao_feed ADD COLUMN IF NOT EXISTS ${col}`); } catch (_) {}
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
  return { apresentacao_media_id: null, apresentacao_nome: 'Apresentacao_Atlantyx.pdf', assunto: 'Atlantyx | Apresentação institucional — dados, analytics e IA',
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

// ── v2.82: ANÁLISE DA EMPRESA — pesquisa na web, dores prováveis e onde a Atlantyx ajuda ──
const PORTFOLIO_ATLANTYX = `Soluções da Atlantyx (17 anos, B2B):
- Engenharia de dados e Data Warehouse/Lakehouse (Azure, Databricks, Snowflake): integração de sistemas legados, pipelines, modelagem.
- Sustentação 24x7 de plataformas de dados e cargas (SLA por severidade, monitoramento, correção de pipelines).
- BI e analytics (Power BI): painéis executivos, indicadores operacionais, self-service governado.
- IA aplicada à operação: agentes de IA, automação de processos com LLM, classificação de documentos, atendimento, previsão.
- Governança e qualidade de dados: catálogo, linhagem, reconciliação entre sistemas, dado confiável para decisão.
- Alocação de especialistas (dados, IA, desenvolvimento) sob demanda.
- Atlantyx OS: plataforma de agentes de IA para finanças, projetos, vendas e marketing.
Casos reais: CPFL Energia (sustentação Big Data, data warehouse de parques eólicos, cadastro/tarifação), Enel, Caixa Capitalização, Grupo Jelta Veículos.`;
async function analisarEmpresa(c) {
  const key = process.env.ANTHROPIC_API_KEY;
  const dominio = c.email && !/gmail|hotmail|outlook|yahoo|icloud|uol|bol|terra|live\./i.test(c.email) ? c.email.split('@')[1] : null;
  const alvo = c.empresa || (dominio ? dominio.split('.')[0] : null);
  if (!key || !alvo) return null;
  const system = `Você é analista de pré-vendas da Atlantyx. Pesquise a empresa-alvo na web (site oficial, notícias recentes, setor, porte, movimentos como expansão, M&A, regulação, transformação digital) e identifique DORES PROVÁVEIS ligadas a dados, operação, tecnologia e eficiência.
Depois cruze com o portfólio abaixo e aponte onde a Atlantyx ajuda de forma CONCRETA.
${PORTFOLIO_ATLANTYX}
REGRAS: não invente fatos — o que não achou, não afirme; dores são hipóteses e devem soar como tal ("é comum que…", "empresas nesse momento costumam…"). Seja específico ao setor.
Responda SOMENTE com JSON:
{"empresa":"nome oficial","setor":"...","resumo":"2 frases sobre a empresa e o momento dela","sinais":["fato recente verificável 1","..."],
 "dores":["dor provável 1","dor 2","dor 3"],
 "oportunidades":[{"dor":"...","solucao":"solução Atlantyx","como_ajuda":"1 frase concreta","caso":"caso Atlantyx parecido, se houver"}],
 "gancho":"1 frase para abrir a conversa conectando o momento da empresa a uma dor","fontes":["url1","url2"]}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1400, system,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: `Empresa-alvo: ${alvo}${dominio ? ' (site provável: ' + dominio + ')' : ''}. Contato: ${c.nome}${c.cargo ? ', ' + c.cargo : ''}.${c.contexto ? ' Contexto do contato: ' + c.contexto + '.' : ''}` }] }) });
    const d = await r.json();
    if (!r.ok) { console.warn('[analise] API:', d?.error?.message); return null; }
    const texto = (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
    const m = texto.match(/\{[\s\S]*\}/); if (!m) return null;
    const a = JSON.parse(m[0]);
    return a && (a.dores?.length || a.oportunidades?.length) ? a : null;
  } catch (e) { console.warn('[analise]', e.message); return null; }
}

// ── 4. Texto do e-mail / WhatsApp com IA ──
async function gerarTexto(c, cfg, canal, analise = null) {
  const key = process.env.ANTHROPIC_API_KEY;
  const fallback = canal === 'email'
    ? `Prezado(a) ${c.nome},\n\n${c.contexto ? 'Foi um prazer conhecê-lo(a) por ocasião de ' + c.contexto + '. ' : ''}Meu nome é Fabio Quintanilha, CEO da Atlantyx. Há 17 anos apoiamos organizações como CPFL Energia, Enel e Caixa Capitalização na transformação de dados em decisões, por meio de engenharia de dados, analytics e inteligência artificial aplicada à operação.\n\nEncaminho em anexo uma breve apresentação institucional. Caso o tema seja pertinente para ${c.empresa || 'sua organização'}, coloco-me à disposição para uma conversa de 30 minutos, em data e horário de sua conveniência, para compreender melhor o cenário atual.\n\nAtenciosamente,\n${cfg.assinatura}`
    : `Olá ${c.nome}, aqui é o Fabio Quintanilha, da Atlantyx. Trabalhamos com dados e IA para grandes operações (CPFL, Enel, Caixa). Posso te mandar uma apresentação curta? Se preferir, aqui está o link: ${cfg.apresentacao_url || baseUrl() + '/captura.html?utm_source=whatsapp&utm_medium=prospeccao'}`;
  if (!key) return fallback;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 900, system: canal === 'email'
        ? `Escreva um e-mail de apresentação da Atlantyx (17 anos, dados/analytics/IA para grandes empresas; clientes CPFL, Enel, Caixa, Jelta) para um contato novo.
TOM FORMAL E CORPORATIVO (padrão de comunicação executiva no Brasil):
- Saudação: "Prezado(a) Sr(a). [Sobrenome]," — use "Prezado Sr." ou "Prezada Sra." quando o gênero for claro pelo nome; na dúvida, "Prezado(a)". Se só houver primeiro nome, use "Prezado(a) [Nome],".
- Tratamento em terceira pessoa ("o senhor" / "a senhora" / "V.Sa.") ou impessoal — nunca "você".
- Frases completas e cordiais, vocabulário corporativo, sem gírias, sem exclamações, sem emoji, sem jargão de marketing ("revolucionar", "game changer").
- Retomada do contexto com formalidade: "Foi um prazer conhecê-lo(a) durante o [evento]…" ou "Em continuidade ao nosso contato no…".
- Fechamento: "Coloco-me à disposição para uma breve conversa de 30 minutos, em data e horário de sua conveniência." seguido de "Atenciosamente," e a assinatura.
ESTRUTURA: (1) abertura pelo contexto do contato, se houver; (2) UM parágrafo mostrando que você olhou a empresa dele — o momento/setor e 2 ou 3 frentes CONCRETAS onde a Atlantyx pode ajudar, ligadas às dores prováveis (use a análise fornecida; trate dores como hipóteses, nunca afirme problemas internos como fato); cite um caso Atlantyx parecido se couber; (3) mencione que a apresentação vai em anexo; (4) feche pedindo 30 min para entender o cenário.
140 a 200 palavras, em 4 a 5 parágrafos curtos SEPARADOS POR LINHA EM BRANCO. As frentes da Atlantyx em lista de 2-3 itens, cada item numa linha começando com "- " (pode destacar o nome da frente com **negrito**). Termine com "Atenciosamente," e, na linha seguinte, a assinatura "${cfg.assinatura}". Devolva só o corpo do e-mail, sem assunto.`
        : `Escreva uma mensagem de WhatsApp de primeiro contato da Atlantyx (dados e IA para grandes empresas). Máximo 60 palavras, tom pessoal, sem emoji além de 1, terminando com a oferta de enviar a apresentação. Assine como Fabio. Devolva só a mensagem.`,
        messages: [{ role: 'user', content: `Contato: ${c.nome}${c.cargo ? ', ' + c.cargo : ''}${c.empresa ? ', empresa ' + c.empresa : ''}.`
          + (c.contexto ? `\nOnde nos conhecemos / contexto do contato: ${c.contexto}. ABRA o e-mail retomando esse contexto de forma formal e específica (ex.: "Foi um prazer conhecê-lo durante o ..."), sem soar genérico.` : '\nPrimeiro contato frio — não finja que já se conheceram.')
          + (analise ? `\n\nANÁLISE DA EMPRESA (base para o parágrafo de "onde podemos ajudar"):\n${JSON.stringify({ setor: analise.setor, resumo: analise.resumo, sinais: analise.sinais, dores: analise.dores, oportunidades: analise.oportunidades, gancho: analise.gancho })}` : '\n(Sem análise da empresa — fale das frentes da Atlantyx de forma adequada ao setor provável, sem inventar fatos sobre a empresa.)') }] }) });
    const d = await r.json();
    const txt = d?.content?.find(x => x.type === 'text')?.text?.trim();
    return txt || fallback;
  } catch (_) { return fallback; }
}

// ── v2.84: E-MAIL EM HTML CORPORATIVO ──
// Converte o texto (editável na tela) num e-mail bem estruturado: parágrafos com espaçamento, tipografia
// definida, listas formatadas e assinatura profissional com os dados do cartão digital.
// Layout em tabela e estilos inline — é o que Outlook e Gmail renderizam de forma consistente.
function _escHtml(t) { return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
export function emailHtml(corpo, cartao = {}, assinaturaTexto = '') {
  const FONTE = "'Segoe UI', Calibri, Arial, Helvetica, sans-serif";
  let linhas = String(corpo || '').replace(/\r/g, '').split('\n');
  // remove a assinatura em texto do fim (a assinatura rica entra no lugar)
  const nomeAss = String(cartao.nome || (assinaturaTexto.split('/')[0] || '')).trim().toLowerCase();
  while (linhas.length && (!linhas[linhas.length - 1].trim() || (nomeAss && linhas[linhas.length - 1].trim().toLowerCase().startsWith(nomeAss.split(' ')[0])) || /^(ceo|atlantyx|fabio quintanilha)/i.test(linhas[linhas.length - 1].trim()))) linhas.pop();
  let despedida = '';
  if (linhas.length && /^(atenciosamente|cordialmente|respeitosamente|abraços|att\.?)[,.]?$/i.test(linhas[linhas.length - 1].trim())) despedida = linhas.pop().trim();
  // agrupa em blocos: parágrafos e listas
  const blocos = []; let par = [], lista = [];
  const fechaPar = () => { if (par.length) { blocos.push({ t: 'p', v: par.join(' ') }); par = []; } };
  const fechaLista = () => { if (lista.length) { blocos.push({ t: 'ul', v: lista }); lista = []; } };
  for (const l of linhas) {
    const x = l.trim();
    if (!x) { fechaPar(); fechaLista(); continue; }
    const mItem = x.match(/^(?:[-•*·▪]|\d+[.)])\s+(.*)$/);
    if (mItem) { fechaPar(); lista.push(mItem[1]); continue; }
    fechaLista(); par.push(x);
  }
  fechaPar(); fechaLista();
  const inline = t => _escHtml(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const P = 'margin:0 0 16px 0;font-family:' + FONTE + ';font-size:15px;line-height:1.65;color:#1f2937;';
  const corpoHtml = blocos.map((b, i) => {
    if (b.t === 'ul') return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">${b.v.map(it => `<tr><td valign="top" style="padding:0 10px 8px 4px;font-family:${FONTE};font-size:15px;line-height:1.6;color:#1A3A8F;font-weight:700;">•</td><td style="padding:0 0 8px 0;font-family:${FONTE};font-size:15px;line-height:1.6;color:#1f2937;">${inline(it)}</td></tr>`).join('')}</table>`;
    const saud = i === 0 && /^(prezad|caro|cara|senhor|senhora|ol[áa])/i.test(b.v);
    return `<p style="${P}${saud ? 'margin-bottom:18px;' : ''}">${inline(b.v)}</p>`;
  }).join('');
  const c = cartao || {};
  const tel = String(c.telefone || c.whatsapp || '').replace(/[^0-9]/g, '');
  const telFmt = tel ? (tel.length >= 12 ? `+${tel.slice(0, 2)} (${tel.slice(2, 4)}) ${tel.slice(4, tel.length - 4)}-${tel.slice(-4)}` : tel) : '';
  const assinatura = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;border-top:1px solid #e5e7eb;padding-top:14px;width:100%;max-width:520px;">
      <tr>${c.foto_url ? `<td valign="top" style="padding:14px 14px 0 0;width:64px;"><img src="${_escHtml(c.foto_url)}" width="60" height="60" alt="" style="border-radius:50%;display:block;border:0;"></td>` : ''}
        <td valign="top" style="padding-top:14px;font-family:${FONTE};">
          <div style="font-size:15px;font-weight:700;color:#0F2660;">${_escHtml(c.nome || assinaturaTexto.split('/')[0] || 'Fabio Quintanilha')}</div>
          <div style="font-size:13px;color:#4b5563;margin-top:2px;">${_escHtml([c.cargo || 'CEO', c.empresa || 'Atlantyx'].join(' · '))}</div>
          <div style="height:3px;width:44px;background:#E0A422;margin:9px 0 9px 0;font-size:0;line-height:0;">&nbsp;</div>
          <div style="font-size:12.5px;line-height:1.7;color:#4b5563;">
            ${telFmt ? `${_escHtml(telFmt)}<br>` : ''}${c.email ? `<a href="mailto:${_escHtml(c.email)}" style="color:#1A3A8F;text-decoration:none;">${_escHtml(c.email)}</a><br>` : ''}${c.site ? `<a href="${_escHtml(c.site)}" style="color:#1A3A8F;text-decoration:none;">${_escHtml(String(c.site).replace(/^https?:\/\//, ''))}</a>` : ''}
            ${c.endereco_rj ? `<br><span style="color:#9ca3af;font-size:11.5px;">${_escHtml(c.endereco_rj)}</span>` : ''}
          </div>
        </td></tr></table>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;"><tr><td style="padding:24px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;"><tr><td>
      ${corpoHtml}
      ${despedida ? `<p style="${P}margin-bottom:4px;">${_escHtml(despedida)}</p>` : ''}
      ${assinatura}
    </td></tr></table>
  </td></tr></table>
</body></html>`;
}
async function _cartaoParaAssinatura() {
  try { const c = await cartaoGet(); const base = baseUrl(); return { ...c, foto_url: c.foto_media_id ? `${base}/api/media?id=${c.foto_media_id}` : null }; } catch (_) { return {}; }
}

// ── 5. E-mail com anexo ──
// v2.80: credenciais de SMTP — aceita os nomes alternativos mais comuns e diz EXATAMENTE o que falta
export function credSmtp() {
  const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER || '';   // v2.81: EMAIL_SMTP_USER separa envio da leitura
  const pass = (process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const presentes = ['EMAIL_SMTP_USER','EMAIL_SMTP_HOST','EMAIL_SMTP_PORT','EMAIL_IMAP_USER','EMAIL_USER','SMTP_USER','GMAIL_USER','EMAIL_SMTP_PASS','EMAIL_IMAP_PASS','EMAIL_PASS','SMTP_PASS','GMAIL_APP_PASSWORD'].filter(k => !!process.env[k]);
  return { user, pass, presentes, ok: !!(user && pass),
    falta: [!user ? 'EMAIL_SMTP_USER (o e-mail que envia, ex.: contato@atlanteam.com.br)' : null, !pass ? 'EMAIL_SMTP_PASS (senha de app do Gmail, 16 letras, sem espaços)' : null].filter(Boolean) };
}
async function testarSmtp() {
  const cr = credSmtp();
  const out = { variaveis_presentes: cr.presentes, usuario: cr.user ? cr.user.replace(/(.{3}).*(@.*)/, '$1…$2') : null, senha_tamanho: cr.pass ? cr.pass.length : 0, ok: false };
  if (!cr.ok) { out.erro = 'Faltam no Vercel: ' + cr.falta.join(' e '); out.como = COMO_SMTP; return out; }
  const cfgS = _smtpConfig(cr.user, cr.pass);
  out.servidor = `${cfgS.host}:${cfgS.port}${cfgS.tls ? ' (TLS relaxado)' : ''}`;
  const gmail = /gmail/i.test(cfgS.host);
  if (gmail && cr.pass.length !== 16) out.aviso = `A senha tem ${cr.pass.length} caracteres — senha de app do Gmail tem 16. Pode ser a senha normal da conta, que o Gmail recusa.`;
  try {
    const nodemailer = (await import('nodemailer')).default;
    const t = nodemailer.createTransport(cfgS);
    await t.verify(); out.ok = true; out.mensagem = `Conexão SMTP OK com ${cfgS.host} — o envio vai funcionar.`;
  } catch (e) {
    out.erro = e.message;
    if (/altnames|certificate|self.signed|CERT_/i.test(e.message)) out.como = 'O certificado do servidor não corresponde a "' + cfgS.host + '" (comum em hospedagem compartilhada). Opção 1: em EMAIL_SMTP_HOST use o nome do servidor da HostGator (cPanel → Contas de E-mail → Conectar dispositivos → "Servidor de saída", algo como br123.hostgator.com.br). Opção 2: crie EMAIL_SMTP_TLS_RELAXADO = 1.';
    else if (/Invalid login|Username and Password|535|authentication/i.test(e.message)) out.como = gmail ? 'O Gmail recusou usuário/senha. Use uma SENHA DE APP: ' + COMO_SMTP : 'O servidor recusou usuário/senha. Confira EMAIL_IMAP_USER (o e-mail completo) e EMAIL_SMTP_PASS (a senha da caixa de e-mail no cPanel).';
    else if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout/i.test(e.message)) out.como = `Não conectou em ${cfgS.host}:${cfgS.port}. Confira EMAIL_SMTP_HOST (cPanel → Contas de E-mail → Conectar dispositivos) e tente EMAIL_SMTP_PORT = 587 se a 465 estiver bloqueada.`;
    else out.como = COMO_SMTP;
  }
  return out;
}
const COMO_SMTP = 'HOSTGATOR: no Vercel crie EMAIL_IMAP_USER = o e-mail completo, EMAIL_SMTP_PASS = a senha da caixa, EMAIL_SMTP_HOST = mail.seudominio.com.br (ou o servidor indicado no cPanel), EMAIL_SMTP_PORT = 465, marque Production e faça Redeploy. GMAIL: 1) No Gmail que vai enviar, ative a verificação em 2 etapas (myaccount.google.com/security). 2) Gere uma senha de app em myaccount.google.com/apppasswords (nome: "Atlantyx OS"). 3) No Vercel → Settings → Environment Variables, crie EMAIL_IMAP_USER = o e-mail e EMAIL_SMTP_PASS = a senha de 16 letras sem espaços, marcando o ambiente PRODUCTION. 4) Deployments → ⋯ → Redeploy (variável nova só vale após redeploy).';

async function enviarEmail(c, cfg, corpo, over = {}) {
  cfg = { ...cfg, ...(over.assunto ? { assunto: over.assunto } : {}), ...(over.anexo_media_id !== undefined ? { apresentacao_media_id: over.anexo_media_id, apresentacao_nome: over.anexo_nome || cfg.apresentacao_nome } : {}) };
  const nodemailer = (await import('nodemailer')).default;
  const cr = credSmtp();
  if (!cr.ok) { const e = new Error('Envio de e-mail não configurado — faltam no Vercel: ' + cr.falta.join(' e ')); e.dica = COMO_SMTP; throw e; }
  const user = cr.user, pass = cr.pass;
  const anexos = [];
  if (cfg.apresentacao_media_id) {
    const sql = await getSql();
    const m = (await sql`SELECT conteudo, content_type FROM media_arquivos WHERE id = ${cfg.apresentacao_media_id}`)[0];
    if (m) anexos.push({ filename: cfg.apresentacao_nome || 'Apresentacao_Atlantyx.pdf', content: Buffer.from(m.conteudo, 'base64'), contentType: m.content_type || 'application/pdf' });
  }
  const t = nodemailer.createTransport(_smtpConfig(user, pass));
  const cartao = await _cartaoParaAssinatura();
  await t.sendMail({ from: `${cartao.nome || 'Fabio Quintanilha'} — ${cartao.empresa || 'Atlantyx'} <${user}>`, to: c.email, subject: cfg.assunto, text: corpo,
    html: emailHtml(corpo, cartao, cfg.assinatura || ''), attachments: anexos });
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
  // v2.82: analisa a empresa (pesquisa na web) antes de escrever o e-mail
  let analise = null;
  if (canal === 'email') { analise = await analisarEmpresa(c); etapas.analise = analise ? `ok — ${analise.dores?.length || 0} dor(es), ${analise.oportunidades?.length || 0} oportunidade(s)` : 'sem dados suficientes (e-mail pessoal ou empresa não encontrada)'; }
  try { if (analise) await sql`UPDATE prospeccao_feed SET analise = ${JSON.stringify(analise)} WHERE id = ${id}`; } catch (_) {}
  const mensagem = await gerarTexto(c, cfg, canal, analise);
  // v2.87: HubSpot — contato (upsert), empresa, nota com contexto + análise, e negócio no pipeline
  try {
    const nota = [`<b>Prospecção — Atlantyx OS</b>`, c.contexto ? `📍 Onde nos conhecemos: ${c.contexto}` : null,
      analise ? `🔎 ${analise.empresa || c.empresa || ''} · ${analise.setor || ''}<br>${analise.resumo || ''}` : null,
      analise?.dores?.length ? `Dores prováveis: ${analise.dores.join('; ')}` : null,
      analise?.oportunidades?.length ? `Onde ajudamos: ${analise.oportunidades.map(o => o.solucao).join('; ')}` : null].filter(Boolean).join('<br><br>');
    const hsr = await enviarContatoHubSpot({ ...c, origem: 'Feed de Prospecção' + (c.contexto ? ' · ' + c.contexto : '') }, { nota, origem: 'Prospecção' });
    await sql`UPDATE prospeccao_feed SET hubspot_contato_id = ${hsr.contato_id}, hubspot_negocio_id = ${hsr.negocio_id || null}, hubspot_erro = NULL WHERE id = ${id}`;
    etapas.hubspot = `ok — contato ${hsr.acao}${hsr.negocio_id ? ' + negócio no pipeline' : ''}${hsr.aviso_empresa || hsr.aviso_negocio ? ' (avisos: ' + [hsr.aviso_empresa, hsr.aviso_negocio].filter(Boolean).join('; ').substring(0, 120) + ')' : ''}`;
  } catch (e) { etapas.hubspot = 'falha: ' + e.message; try { await sql`UPDATE prospeccao_feed SET hubspot_erro = ${e.message} WHERE id = ${id}`; } catch (_) {} }
  const assunto = c.contexto ? `Atlantyx | Continuidade do nosso contato — ${c.empresa || c.nome}` : (cfg.assunto || `Atlantyx | Apresentação institucional — ${c.empresa || c.nome}`);
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
  return { id, contato: c, canal, mensagem, assunto, etapas, analise,
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
async function feedHubspot({ id } = {}) {
  const sql = await getSql();
  const r = (await sql`SELECT * FROM prospeccao_feed WHERE id = ${id}`)[0]; if (!r) throw new Error('Registro não encontrado');
  let analise = null; try { analise = r.analise ? JSON.parse(r.analise) : null; } catch (_) {}
  const nota = [`<b>Prospecção — Atlantyx OS</b>`, r.contexto ? `📍 Onde nos conhecemos: ${r.contexto}` : null, analise?.resumo || null].filter(Boolean).join('<br><br>');
  const hsr = await enviarContatoHubSpot({ nome: r.nome, email: r.email, telefone: r.telefone, empresa: r.empresa, cargo: r.cargo, contexto: r.contexto, origem: 'Feed de Prospecção' }, { nota, origem: 'Prospecção' });
  await sql`UPDATE prospeccao_feed SET hubspot_contato_id = ${hsr.contato_id}, hubspot_negocio_id = ${hsr.negocio_id || null}, hubspot_erro = NULL WHERE id = ${id}`;
  return hsr;
}
async function feedHubspotPendentes() {
  const sql = await getSql();
  const rows = await sql`SELECT id FROM prospeccao_feed WHERE hubspot_contato_id IS NULL ORDER BY criado_em DESC LIMIT 25`;
  let ok = 0; const erros = [];
  for (const x of rows) { try { await feedHubspot({ id: x.id }); ok++; } catch (e) { erros.push(e.message); if (/HUBSPOT_TOKEN|401|403/.test(e.message)) break; } }
  return { enviados: ok, pendentes: rows.length, erros: [...new Set(erros)].slice(0, 3) };
}
async function feedPreviewHtml({ corpo } = {}) {
  const cfg = await configGet();
  return { html: emailHtml(corpo || '', await _cartaoParaAssinatura(), cfg.assinatura || '') };
}
async function feedReescrever({ id, refazer_analise = false } = {}) {
  const sql = await getSql();
  const r = (await sql`SELECT * FROM prospeccao_feed WHERE id = ${id}`)[0]; if (!r) throw new Error('Registro não encontrado');
  const c = { nome: r.nome, email: r.email, empresa: r.empresa, cargo: r.cargo, contexto: r.contexto };
  let analise = null; try { analise = r.analise ? JSON.parse(r.analise) : null; } catch (_) {}
  if (refazer_analise || !analise) { analise = await analisarEmpresa(c); if (analise) await sql`UPDATE prospeccao_feed SET analise = ${JSON.stringify(analise)} WHERE id = ${id}`; }
  const mensagem = await gerarTexto(c, await configGet(), 'email', analise);
  await sql`UPDATE prospeccao_feed SET mensagem = ${mensagem} WHERE id = ${id}`;
  return { id, mensagem, analise };
}
async function feedDisparar({ id, assunto, corpo, anexo_media_id, anexo_nome, para } = {}) {
  const sql = await getSql();
  const r = (await sql`SELECT * FROM prospeccao_feed WHERE id = ${id}`)[0]; if (!r) throw new Error('Registro não encontrado');
  const destino = (para || r.email || '').trim(); if (!destino) throw new Error('Sem e-mail de destino');
  const cfg = await configGet();
  const txt = corpo || r.mensagem;
  const res = await enviarEmail({ ...r, email: destino }, cfg, txt, { assunto: assunto || r.assunto || cfg.assunto, anexo_media_id: anexo_media_id === '' ? null : (anexo_media_id ?? cfg.apresentacao_media_id), anexo_nome });
  await sql`UPDATE prospeccao_feed SET mensagem = ${txt}, email = ${destino}, email_enviado_em = NOW(), email_erro = NULL, status = 'email_enviado' WHERE id = ${id}`;
  if (r.hubspot_contato_id) await registrarAtividade(r.hubspot_contato_id, `<b>E-mail de apresentação enviado</b> (${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})<br>Assunto: ${assunto || r.assunto || ''}<br>${res.anexos ? 'Com apresentação em anexo' : 'Sem anexo'}<br><br>${String(txt).replace(/\n/g, '<br>')}`);
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
  // v2.80: GET /api/prospeccao?teste_email=1 → testa o SMTP e diz o que falta (não mostra a senha)
  if (req.method === 'GET' && req.query?.teste_email) {
    const r = await testarSmtp(); res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.status(200).send(JSON.stringify(r, null, 2));
  }
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
    feed_reescrever: () => feedReescrever(payload),
    feed_preview_html: () => feedPreviewHtml(payload),
    feed_hubspot: () => feedHubspot(payload),
    feed_hubspot_pendentes: () => feedHubspotPendentes(),
    testar_hubspot: () => testarHubSpot(),
    testar_email: () => testarSmtp(),
    cartao_get: () => cartaoGet(),
    cartao_set: () => cartaoSet(payload),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida: ' + Object.keys(acoes).join(', ') });
  try { const r = await acoes[action](); return res.status(200).json({ success: true, ...r }); }
  catch (e) { console.error('[prospeccao]', action, e.message); return res.status(500).json({ success: false, error: e.message, dica: e.dica || null }); }
}
