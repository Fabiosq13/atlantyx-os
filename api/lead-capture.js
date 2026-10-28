import { comGuarda } from '../lib/qa-guard.js';
import { classificarCargo, ICP_TEXTO } from '../lib/icp.js';

// v2.88: compatibilidade com o driver @neondatabase/serverless 0.10.x — nele NÃO existe sql.query();
// SQL montado em texto é executado chamando sql(texto, params). Nas versões ≥1.0 é sql.query(texto, params).
// Antes, toda chamada sql.query() falhava em silêncio: colunas novas nunca eram criadas.
// v3.13: número real de WhatsApp comercial para a página de captura (antes era um número fictício)
const _whatsComercial = () => String(process.env.WHATSAPP_COMERCIAL || process.env.FUNDADOR_WHATSAPP || '').replace(/\D/g, '') || null;
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
// api/lead-capture.js
// Agente S2-02 + S7-05
// Recebe lead do Meta Ads / LinkedIn → Claude gera mensagem → HubSpot → WhatsApp

const MODEL = process.env.CLAUDE_MODEL_RAPIDO || 'claude-haiku-4-5-20251001'; // v3.191 (custo): mensagem curta de WhatsApp → modelo rápido e barato
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Hub-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // v3.32: LINK CURTO das campanhas — /agenda (cadastro → reunião) e /reuniao (agenda direto).
  // É o que vai escrito no post/arte do Instagram, onde a rede não deixa link clicável: a pessoa digita
  // um endereço curto em vez de ser mandada para a bio. ?c=<campanha> mantém a atribuição.
  if (req.method === 'GET' && req.query?.atalho) {
    const c = String(req.query.c || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').substring(0, 60);
    const fonte = String(req.query.f || 'instagram').toLowerCase().replace(/[^a-z0-9_-]/g, '').substring(0, 30) || 'instagram';
    // v3.78: link curto também no LinkedIn/Facebook (?f=linkedin&p=post2) — antes o link da captura tinha ~250 caracteres
    const conteudo = String(req.query.p || '').replace(/[^a-z0-9_-]/gi, '').substring(0, 40);
    const utm = 'utm_source=' + fonte + '&utm_medium=' + (fonte === 'instagram' ? 'link_curto' : 'social') + (c ? '&utm_campaign=' + c : '') + (conteudo ? '&utm_content=' + conteudo : '');
    const reuniao = (process.env.LINK_REUNIAO || 'https://meetings.hubspot.com/atlantyx?uuid=eca883eb-276d-45cb-bda8-d7d5d2ae9219').trim();
    // v3.243: destino ABSOLUTO e pré-visualização direta para robôs. O LinkedIn (via Metricool) avisava "não foi possível
    // obter a imagem vinculada da mensagem de texto": o link curto respondia 302 para um endereço RELATIVO e o robô de
    // pré-visualização não chegava à página com a imagem (og:image). Agora o robô recebe a própria página de prévia
    // (título, descrição e imagem) com status 200; a pessoa continua sendo levada direto ao destino.
    const _host = String(req.headers?.host || '');
    const base = (process.env.MEDIA_PUBLIC_BASE || process.env.APP_URL || (/^[\w.-]+$/.test(_host) && !/-projects-|^project-/.test(_host) ? 'https://' + _host : 'https://atlantyx-os.vercel.app')).replace(/\/$/, '');
    const destino = req.query.atalho === 'reuniao' ? reuniao + (reuniao.includes('?') ? '&' : '?') + utm : base + '/captura.html?' + utm;
    res.setHeader('Cache-Control', 'no-store');
    const ua = String(req.headers?.['user-agent'] || '');
    if (/bot|crawler|spider|preview|facebookexternalhit|linkedin|whatsapp|telegram|slack|discord|twitter|skype|metricool|embedly|vkshare|pinterest|google-structured|bitly|redditbot|applebot|curl|python|okhttp|http-client|java\//i.test(ua)) {
      const titulo = 'Atlantyx — Tecnologia, dados e produtos para a sua operação', desc = 'Conversa gratuita: um especialista entende o seu cenário e mostra onde a Atlantyx gera resultado na sua operação.';
      const img = base + '/og-atlantyx.jpg', esc = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><meta name="description" content="${esc(desc)}">`
        + `<meta property="og:type" content="website"><meta property="og:site_name" content="Atlantyx"><meta property="og:locale" content="pt_BR"><meta property="og:url" content="${esc(base + '/captura.html')}">`
        + `<meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}"><meta property="og:image:secure_url" content="${esc(img)}">`
        + `<meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="627"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}">`
        + `<link rel="canonical" href="${esc(base + '/captura.html')}"><meta http-equiv="refresh" content="0;url=${esc(destino)}"></head><body><a href="${esc(destino)}">Continuar</a></body></html>`);
    }
    return res.redirect(302, destino);
  }
  if (req.method !== 'POST') return res.status(405).end();

  // v3.184: 2º passo do formulário do site — roda as integrações (alerta, IA, HubSpot, WhatsApp, follow-up) do lead
  // já gravado. Só um processamento por lead (trava no banco), então chamar duas vezes não duplica nada.
  if (req.body && req.body.evento === 'processar') {
    const id = String(req.body.lead_id || '').replace(/[^a-z0-9_]/gi, '').substring(0, 40);
    if (!id) return res.status(400).json({ success: false, error: 'lead_id obrigatório' });
    try { const r = await processarLeadGravado(id); return res.status(200).json({ success: true, ...r }); }
    catch (e) { console.error('[S2] processar lead:', e.message); return res.status(200).json({ success: false, error: e.message }); }
  }

  // v3.13: VISITA à página de captura (sem dados pessoais) — mede o passo clique → página → lead.
  // Antes só o lead era registrado; sem a visita não dá para saber se o clique chega na página.
  if (req.body && req.body.evento === 'visita') {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      await sql`CREATE TABLE IF NOT EXISTS captura_visitas (id BIGSERIAL PRIMARY KEY, criado_em TIMESTAMPTZ DEFAULT NOW(), origem TEXT, meio TEXT, campanha TEXT, conteudo TEXT, pagina TEXT)`;
      const u = req.body.utm || {};
      await sql`INSERT INTO captura_visitas (origem, meio, campanha, conteudo, pagina) VALUES (${String(u.source || 'direto').substring(0, 60)}, ${String(u.medium || '').substring(0, 60)}, ${String(u.campaign || '').substring(0, 120)}, ${String(u.content || '').substring(0, 120)}, ${String(req.body.page || '').substring(0, 300)})`;
    } catch (e) { console.warn('[captura] visita:', e.message); }
    return res.status(200).json({ success: true, whatsapp: _whatsComercial(), pixel: String(process.env.META_PIXEL_ID || '').replace(/\D/g, '') || null }); // v3.190: Pixel do Meta (opcional)
  }

  try {
    const body = req.body;

    // ── 1. NORMALIZAR DADOS DO LEAD (Meta, LinkedIn ou formulário próprio) ──
    // v3.190: ANTI-ROBÔ do formulário do site — campo invisível preenchido ou envio em menos de 3 s = robô.
    // Responde "ok" (o robô não aprende a contornar) mas não grava nem dispara nada.
    // v3.300: origem confiável = usuário logado no sistema, webhook com segredo (LEADS_WEBHOOK_SECRET) ou lead ads da plataforma
    // (Meta leadgen). Qualquer outro envio anônimo passa pelo anti-robô, tem limite por IP e SÓ recebe WhatsApp com consentimento.
    const _segredo = process.env.LEADS_WEBHOOK_SECRET, _hdr = String(req.headers?.['x-lead-secret'] || '');
    const confiavel = !!req.sessao || (!!_segredo && _hdr === _segredo) || !!(body.leadgen_id || body.field_data);
    if (!confiavel) {
      const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim().slice(0, 64);
      try { const { neon } = await import('@neondatabase/serverless'); const sq = neon(process.env.DATABASE_URL); const k = 'rl:lead:' + ip + ':' + new Date().toISOString().slice(0, 13);
        const r = await sq`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, '1'::jsonb, NOW()) ON CONFLICT (key) DO UPDATE SET value = to_jsonb(COALESCE((kv_store.value)::text::int, 0) + 1), updated_at = NOW() RETURNING value`;
        if (Number(r[0]?.value) > 10) return res.status(429).json({ success: false, error: 'Muitos envios — tente mais tarde' }); } catch (_) {}
    }
    if ((body.form_name === 'captura-publica' || !confiavel) && (String(body.website || '').trim() || (Number(body.t_preenchimento_ms) > 0 && Number(body.t_preenchimento_ms) < 3000))) {
      console.warn('[S2] envio descartado (robô):', String(body.email || '').substring(0, 60));
      return res.status(200).json({ success: true, lead_id: null });
    }
    const lead = normalizeLead(body);
    if (!confiavel) lead.exige_consentimento = true; // v3.300: envio anônimo fora do formulário do site também precisa de consentimento para WhatsApp
    lead.title = lead.job_title || null; // v3.234: banco e alerta liam lead.title (sempre vazio) — cargo nunca aparecia
  lead.utm = body.utm || { source: body.source || body.utm_source || null, medium: body.utm_medium || null, campaign: body.campaign_name || body.utm_campaign || null, content: body.utm_content || null };
    lead.campanha = lead.utm.campaign || body.campaign_name || null;
    lead.origem = lead.utm.source || body.source || 'formulario';
    // v3.190: qualidade — e-mail pessoal (gmail, hotmail…) costuma ser pessoa física; o lead entra, marcado
    lead.email_pessoal = /@(gmail|hotmail|outlook|live|yahoo|bol|uol|terra|icloud|msn|ig)\.(com|com\.br)$/i.test(String(lead.email || ''));
    if (lead.email_pessoal) lead.qualidade = 'e-mail pessoal';
    lead.form_name = body.form_name ? String(body.form_name).substring(0, 60) : null;
    if (body.consentimento && typeof body.consentimento === 'object') lead.consentimento = { aceito: !!body.consentimento.aceito, versao: String(body.consentimento.versao || '').substring(0, 20), canais: (body.consentimento.canais || []).slice(0, 6), em: String(body.consentimento.em || '').substring(0, 30) }; // v3.187: registro do aceite (LGPD)
    console.log(`[S2] Lead recebido: ${lead.name} | ${lead.company} | origem ${lead.origem} · ${lead.campanha || 'sem campanha'} | Score: ${lead.score_label}`);

    // ── v2.32 — 1b. GRAVAR NO BANCO PRIMEIRO, SEMPRE. ──
    // Antes o lead só existia no HubSpot, e se QUALQUER etapa abaixo falhasse, o catch engolia
    // tudo e o lead se PERDIA — a pessoa preencheu o formulário e nada ficou. Agora o registro
    // local é a primeira coisa e nunca depende das integrações.
    const etapas = { banco: null, mensagem: null, hubspot: null, whatsapp: null, followup: null, alerta: null };
    let leadId = null;
    try { leadId = await gravarLeadLocal(lead); etapas.banco = 'ok'; }
    catch (e) { etapas.banco = 'falha: ' + e.message; console.error('[S2] gravar lead local:', e.message); }

    // v3.23: MODO TESTE do agente de QA — grava o lead (para conferir banco e atribuição à campanha) mas
    // NÃO dispara e-mail, IA, HubSpot nem WhatsApp. O próprio QA apaga o registro ao final.
    if (body.qa_teste === true) {
      try { if (leadId) { const { neon } = await import('@neondatabase/serverless'); const sq = neon(process.env.DATABASE_URL); await sq`UPDATE leads SET status = 'qa_teste' WHERE id = ${leadId}`; } } catch (_) {}
      ['alerta', 'mensagem', 'hubspot', 'whatsapp', 'followup'].forEach(k => etapas[k] = 'pulado (teste QA)');
      return res.status(200).json({ success: true, qa_teste: true, lead_id: leadId, origem: lead.origem, campanha: lead.campanha, utm: lead.utm, score: lead.score_label, etapas,
        whatsapp: _whatsComercial(), agenda: (process.env.LINK_REUNIAO || 'https://meetings.hubspot.com/atlantyx?uuid=eca883eb-276d-45cb-bda8-d7d5d2ae9219').trim() });
    }

    // v3.184: formulário do SITE — responde assim que o lead está gravado (antes esperava e-mail, IA, HubSpot e
    // WhatsApp: 10–20 s com o botão "Enviando..."). As integrações rodam no 2º passo ({evento:'processar'}), que a
    // própria página dispara, e também aqui logo depois da resposta; a trava no banco garante uma execução só.
    if (body.rapido === true && leadId) {
      // v3.237: não processa mais DEPOIS da resposta — a Vercel congela a função e o lead ficava travado em "processando"
      // (a chamada da página encontrava a trava e desistia). Agora quem processa é o 2º passo da página; se a pessoa fechar
      // a aba antes, a varredura de hora em hora (followup-cron) processa os leads que ficaram para trás.
      return res.status(200).json({ success: true, lead_id: leadId, origem: lead.origem, campanha: lead.campanha, whatsapp: _whatsComercial() });
    }

    // ── 1c. ALERTA IMEDIATO por e-mail — "novo lead da campanha X" ──
    try { await alertarNovoLead(lead); etapas.alerta = 'ok'; } catch (e) { etapas.alerta = 'falha: ' + e.message; }

    // As etapas seguintes são INDEPENDENTES: uma falhar não derruba as outras nem o lead.
    let mensagem = null, contactId = null, dealId = null;
    try { mensagem = await gerarMensagemClaude(lead); etapas.mensagem = 'ok'; }
    catch (e) { etapas.mensagem = 'falha: ' + e.message; }

    // v2.87: upsert robusto (não falha com e-mail já existente nem com propriedade personalizada ausente)
    try { const { enviarContatoHubSpot } = await import('../lib/hubspot-sync.js');
      const hsr = await enviarContatoHubSpot({ nome: lead.name, email: lead.email, telefone: lead.phone, empresa: lead.company, cargo: lead.job_title || lead.title, score: lead.score_label, origem: lead.origem || lead.source },
        { nota: `<b>Lead capturado</b><br>Origem: ${lead.origem || '?'} · campanha: ${lead.campanha || '—'}`, origem: 'Captura · ' + (lead.origem || 'formulário') });
      contactId = hsr.contato_id; dealId = hsr.negocio_id || null; etapas.hubspot = `ok — contato ${hsr.acao}`; }
    catch (e) { etapas.hubspot = 'falha: ' + e.message; }

    const podeA = await _podeWhats(lead, leadId);
    if (podeA.ok && mensagem) {
      try { await enviarWhatsApp(lead.phone, mensagem); etapas.whatsapp = 'ok'; if (dealId) await atualizarDealHubSpot(dealId, 'ABORDADO').catch(() => {}); }
      catch (e) { etapas.whatsapp = 'falha: ' + e.message; }
    } else etapas.whatsapp = !podeA.ok ? 'pulado: ' + podeA.motivo : 'sem mensagem';

    try { if (mensagem && etapas.whatsapp === 'ok') { await agendarFollowUp(lead, dealId, mensagem); etapas.followup = 'ok'; } else etapas.followup = 'sem 1ª mensagem no WhatsApp'; }
    catch (e) { etapas.followup = 'falha: ' + e.message; }

    // registra no lead o que deu certo e o que não
    try { if (leadId) await atualizarLeadLocal(leadId, { hubspot_contact: contactId, hubspot_deal: dealId, etapas }); } catch (_) {}
    const falhas = Object.entries(etapas).filter(([, v]) => String(v).startsWith('falha'));
    if (falhas.length) console.warn('[S2] etapas com falha:', falhas.map(([k, v]) => k + '=' + v).join(' | '));

    return res.status(200).json({
      whatsapp: _whatsComercial(), agenda: (process.env.LINK_REUNIAO || 'https://meetings.hubspot.com/atlantyx?uuid=eca883eb-276d-45cb-bda8-d7d5d2ae9219').trim(),
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

// v3.233: só aborda por WhatsApp quem pode receber — consentimento do formulário do site (LGPD), fora da lista de
// descadastro e sem abordagem automática ao mesmo número nas últimas 24 h (reenvio do formulário não gera 2ª mensagem)
async function _podeWhats(lead, leadId) {
  if (!lead.phone) return { ok: false, motivo: 'sem telefone' };
  // v3.234: abordagem AUTOMÁTICA só para o ICP — A, ou B com cargo de decisor e e-mail corporativo. O resto o time avalia.
  if (lead.score_label === 'C' || lead.icp_cargo === 'fora') return { ok: false, motivo: 'fora do ICP (score ' + (lead.score_label || '?') + ') — avaliação humana' };
  if (lead.score_label !== 'A' && !(lead.score_label === 'B' && lead.icp_cargo === 'decisor' && !lead.email_pessoal)) return { ok: false, motivo: 'score ' + lead.score_label + ' sem cargo de decisor confirmado — avaliação humana' };
  if (lead.form_name === 'captura-publica' || lead.exige_consentimento) {
    const c = lead.consentimento;
    if (!c || !c.aceito || (Array.isArray(c.canais) && c.canais.length && !c.canais.includes('whatsapp'))) return { ok: false, motivo: 'sem consentimento para WhatsApp' };
  }
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const { normTelefone } = await import('./campanha-disparo.js');
    const dest = normTelefone(lead.phone) || String(lead.phone).replace(/\D/g, '');
    try { const o = await sql`SELECT 1 FROM disparo_optout WHERE destino = ${dest} LIMIT 1`; if (o.length) return { ok: false, motivo: 'descadastrado (SAIR)' }; } catch (_) {}
    const fim = dest.slice(-10);
    const rec = await sql`SELECT 1 FROM leads WHERE id <> ${leadId || ''} AND criado_em > NOW() - INTERVAL '24 hours'
      AND right(regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g'), 10) = ${fim} AND etapas->>'whatsapp' = 'ok' LIMIT 1`;
    if (rec.length) return { ok: false, motivo: 'já abordado nas últimas 24 h' };
  } catch (_) {}
  return { ok: true };
}
const _esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// v2.32: registro local do lead — a fonte de verdade da tela e da auditoria
async function gravarLeadLocal(lead) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  // v3.184: caminho rápido — 1 consulta só (antes: CREATE TABLE + ~10 ALTER TABLE a cada lead, antes do INSERT)
  const id0 = 'ld_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { await _inserirLead(sql, id0, lead); return id0; } catch (e) { console.warn('[S2] insert rápido falhou, ajustando a tabela:', e.message); }
  await sql`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, nome TEXT, empresa TEXT, cargo TEXT, setor TEXT, score TEXT, data JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW())`;
  for (const col of ['origem TEXT', 'campanha TEXT', 'utm JSONB', 'email TEXT', 'telefone TEXT', 'hubspot_contact TEXT', 'hubspot_deal TEXT', 'etapas JSONB', 'status TEXT DEFAULT \'novo\'', 'reuniao_marcada_em TIMESTAMPTZ']) {
    try { await _q(sql, `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col}`); } catch (_) {}
  }
  const id = 'ld_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await _inserirLead(sql, id, lead);
  return id;
}
async function _inserirLead(sql, id, lead) {
  await sql`INSERT INTO leads (id, nome, empresa, cargo, setor, score, data, origem, campanha, utm, email, telefone, status)
    VALUES (${id}, ${lead.name}, ${lead.company}, ${lead.title || null}, ${lead.sector || null}, ${lead.score_label || null},
      ${JSON.stringify(lead)}, ${lead.origem || null}, ${lead.campanha || null}, ${JSON.stringify(lead.utm || {})},
      ${lead.email || null}, ${lead.phone || null}, 'novo')`;
}
// v3.184: integrações de um lead já gravado (2º passo do formulário do site). A trava (etapas → 'processando')
// garante uma execução só, mesmo com a página e o servidor chamando ao mesmo tempo.
export async function processarLeadGravado(leadId) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  const got = await sql`UPDATE leads SET etapas = ${JSON.stringify({ processando: new Date().toISOString() })}::jsonb
    WHERE id = ${leadId} AND (etapas IS NULL OR etapas = 'null'::jsonb
      OR (etapas ? 'processando' AND NOT (etapas ? 'whatsapp') AND (etapas->>'processando')::timestamptz < NOW() - INTERVAL '5 minutes')) RETURNING data`; // v3.234: retoma trava esquecida (função cortada no meio)
  if (!got.length) return { lead_id: leadId, ja_processado: true };
  let lead = got[0].data; if (typeof lead === 'string') { try { lead = JSON.parse(lead); } catch (_) { lead = {}; } }
  const etapas = { banco: 'ok', mensagem: null, hubspot: null, whatsapp: null, followup: null, alerta: null };
  let mensagem = null, contactId = null, dealId = null;
  // alerta, IA e HubSpot em paralelo (eram em sequência)
  const [al, msg, hs] = await Promise.allSettled([
    alertarNovoLead(lead),
    gerarMensagemClaude(lead),
    (async () => { const { enviarContatoHubSpot } = await import('../lib/hubspot-sync.js');
      return enviarContatoHubSpot({ nome: lead.name, email: lead.email, telefone: lead.phone, empresa: lead.company, cargo: lead.job_title || lead.title, score: lead.score_label, origem: lead.origem || lead.source },
        { nota: `<b>Lead capturado</b><br>Origem: ${lead.origem || '?'} · campanha: ${lead.campanha || '—'}`, origem: 'Captura · ' + (lead.origem || 'formulário') }); })(),
  ]);
  etapas.alerta = al.status === 'fulfilled' ? 'ok' : 'falha: ' + al.reason?.message;
  if (msg.status === 'fulfilled') { mensagem = msg.value; etapas.mensagem = 'ok'; } else etapas.mensagem = 'falha: ' + msg.reason?.message;
  if (hs.status === 'fulfilled') { contactId = hs.value.contato_id; dealId = hs.value.negocio_id || null; etapas.hubspot = `ok — contato ${hs.value.acao}`; } else etapas.hubspot = 'falha: ' + hs.reason?.message;
  const podeB = await _podeWhats(lead, leadId);
  if (podeB.ok && mensagem) {
    try { await enviarWhatsApp(lead.phone, mensagem); etapas.whatsapp = 'ok'; if (dealId) await atualizarDealHubSpot(dealId, 'ABORDADO').catch(() => {}); }
    catch (e) { etapas.whatsapp = 'falha: ' + e.message; }
  } else etapas.whatsapp = !podeB.ok ? 'pulado: ' + podeB.motivo : 'sem mensagem';
  try { if (mensagem && etapas.whatsapp === 'ok') { await agendarFollowUp(lead, dealId, mensagem); etapas.followup = 'ok'; } else etapas.followup = 'sem 1ª mensagem no WhatsApp'; }
  catch (e) { etapas.followup = 'falha: ' + e.message; }
  try { await atualizarLeadLocal(leadId, { hubspot_contact: contactId, hubspot_deal: dealId, etapas }); } catch (_) {}
  return { lead_id: leadId, etapas, hubspot_contact: contactId, hubspot_deal: dealId };
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
  const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER, pass = (process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) throw new Error('EMAIL_IMAP_USER/EMAIL_SMTP_PASS não configurados');
  // v3.188: destinatários fixos definidos pelo fundador — recebem sempre; LEADS_ALERTA_PARA (Vercel) acrescenta outros
  const para = [...new Set(['atlanteambr@gmail.com', 'contato@atlanteam.com.br', 'ademir.souza@atlanteam.com.br', ...(process.env.LEADS_ALERTA_PARA || '').split(',')]
    .map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))].join(', ');
  const t = nodemailer.createTransport(_smtpConfig(user, pass));
  const u = lead.utm || {};
  await t.sendMail({ from: `Atlantyx OS <${user}>`, to: para,
    subject: `${lead.email_pessoal ? '⚪ Novo lead (e-mail pessoal)' : '🎯 Novo lead'}: ${String(lead.name || '').replace(/[\r\n]/g, ' ')} (${String(lead.company || '').replace(/[\r\n]/g, ' ')}) — via ${lead.origem || '?'}${lead.campanha ? ' · ' + lead.campanha : ''}`,
    html: `<div style="font-family:Arial;max-width:560px;">
      <h2 style="color:#1A3A8F;margin:0 0 6px;">Novo lead capturado</h2>
      <table style="font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">Nome</td><td><b>${_esc(lead.name)}</b></td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">Empresa</td><td>${_esc(lead.company || '—')}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">Cargo</td><td>${_esc(lead.title || '—')}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">E-mail</td><td>${_esc(lead.email || '—')}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">WhatsApp</td><td>${_esc(lead.phone || '—')}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;color:#5a6478;">Score</td><td>${_esc(lead.score_label || '—')}</td></tr>
      </table>
      <div style="margin-top:12px;padding:10px;background:#EAF7F1;border-left:3px solid #1FB287;font-size:13px;">
        <b>Origem:</b> ${_esc(lead.origem || '?')} · <b>Campanha:</b> ${_esc(lead.campanha || 'não identificada')}${u.medium ? ' · ' + _esc(u.medium) : ''}${u.content ? '<br><span style="color:#5a6478;font-size:12px;">post: ' + _esc(u.content) + '</span>' : ''}</div>
      <p style="font-size:12px;color:#8a93a8;margin-top:14px;">Atlantyx OS · alerta automático de captura</p></div>` });
}

function normalizeLead(body) {
  const lead = {
    name:      body.name || body.full_name || body.nome || body.field_data?.find(f => f.name === 'full_name')?.values?.[0] || 'Não informado',
    email:     body.email || body.email_address || body.field_data?.find(f => f.name === 'email')?.values?.[0] || '',
    phone:     body.phone || body.whatsapp || body.telefone || body.field_data?.find(f => f.name === 'phone_number')?.values?.[0] || '',
    company:   body.company || body.company_name || body.empresa || body.field_data?.find(f => f.name === 'company_name')?.values?.[0] || '',
    job_title: body.job_title || body.cargo || body.title || body.field_data?.find(f => f.name === 'job_title')?.values?.[0] || '',
    porte:     String(body.porte || body.field_data?.find(f => f.name === 'company_size')?.values?.[0] || '').substring(0, 30) || null, // v3.234
    source:    body.source || body.ad_name || body.campaign_name || body.form_name || 'Campanha Digital',
    // v3.60: a oferta que trouxe o lead (diagnóstico gratuito) vai junto do desafio — aparece no nome do negócio no HubSpot
    interesse: ([body.oferta === 'diagnostico_gratuito' ? 'Diagnóstico gratuito' : '', String(body.interesse || body.desafio || '')].filter(Boolean).join(' · ')).substring(0, 200) || null, // v3.32: desafio escolhido na página de captura
    timestamp: new Date().toISOString(),
  };
  // v3.300: tudo vira texto com tamanho limitado (telefone numérico derrubava o lead; campos sem limite)
  for (const k of ['name', 'email', 'phone', 'company', 'job_title', 'source']) lead[k] = String(lead[k] ?? '').trim().slice(0, k === 'phone' ? 30 : 160);
  if (lead.email && !/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/i.test(lead.email)) { lead.email_invalido = lead.email.slice(0, 80); lead.email = ''; }
  if (!lead.name) lead.name = 'Não informado';

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
    // v3.234: ICP C-level (lib/icp.js) — antes Gerente/Coordenador/Head valiam +40 e /CIO/ sem limite de palavra casava
    // "Negócios"/"Comércio" (um "Analista de Negócios" virava decisor)
    lead.icp_cargo = classificarCargo(lead.job_title);
    if (lead.icp_cargo === 'decisor') { score += 40; criterios.push('cargo decisor — dono/C-level/diretor (+40)'); }
    else if (lead.icp_cargo === 'head' || lead.icp_cargo === 'gerencia') { score += 15; criterios.push(`cargo "${lead.job_title}" é gestão, mas não C-level (+15)`); }
    else criterios.push(`cargo "${lead.job_title}" fora do ICP (técnico/operacional)`);
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
  // v3.234: travas do ICP — cargo técnico/operacional ou empresa pequena = C; gestão sem C-level ou e-mail pessoal ≤ B
  const pequena = ['ate_50', '51_200'].includes(lead.porte);
  if (lead.icp_cargo === 'fora' || pequena) { lead.score_label = 'C'; criterios.push(pequena ? 'empresa pequena (até 200 funcionários) — fora do ICP' : 'cargo fora do ICP → C'); }
  else if (lead.score_label === 'A' && (lead.icp_cargo !== 'decisor' || /@(gmail|hotmail|yahoo|outlook|live|bol|uol|terra|icloud)\./i.test(lead.email || ''))) lead.score_label = 'B';
  lead.no_icp = lead.icp_cargo === 'decisor' && !pequena;
  lead.score_confiavel = pontosPossiveis >= 80; // sem cargo, a classificação é pouco confiável
  if (!lead.score_confiavel) lead.score_aviso = 'Score pouco confiável: o formulário não capturou cargo (e/ou telefone). Adicione esses campos para o scoring funcionar de verdade.';

  // Formatar telefone para WhatsApp
  if (lead.phone) {
    let phone = lead.phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    if (phone.length <= 11) phone = '55' + phone; // v3.234: DDD 55 (RS) sem o código do país ficava sem o 55
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
        dealname: `${lead.company || lead.name} — ${lead.source}${lead.interesse ? " · " + lead.interesse : ""}`,
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

  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error || !(j.zaapId || j.messageId || j.id)) throw new Error(`Z-API WhatsApp: ${j.error || j.message || 'HTTP ' + res.status}`);
  return j;
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
  // v3.23: o agendamento chamava /api/followup-schedule, que NÃO existe — nenhum follow-up era agendado.
  // Agora grava na tabela followups; o cron /api/followup-cron (a cada hora) envia os vencidos.
  if (!lead.phone) return;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS followups (id TEXT PRIMARY KEY, phone TEXT, name TEXT, company TEXT, job_title TEXT, deal_id TEXT,
    mensagem_original TEXT, send_at TIMESTAMPTZ, status TEXT DEFAULT 'pendente', enviado_em TIMESTAMPTZ, erro TEXT, criado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`INSERT INTO followups (id, phone, name, company, job_title, deal_id, mensagem_original, send_at)
    VALUES (${'fu_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)}, ${lead.phone}, ${lead.name || null}, ${lead.company || null},
      ${lead.job_title || lead.title || null}, ${dealId || null}, ${String(mensagemOriginal || '').substring(0, 2000)}, ${new Date(Date.now() + 48 * 3600 * 1000).toISOString()})`;
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
// v3.237: varredura — leads gravados que não foram processados (aba fechada antes do 2º passo, função cortada)
export async function processarLeadsPendentes({ limite = 5 } = {}) {
  const { neon } = await import('@neondatabase/serverless'); const sql = neon(process.env.DATABASE_URL);
  const L = await sql`SELECT id FROM leads WHERE criado_em > NOW() - INTERVAL '2 days' AND criado_em < NOW() - INTERVAL '3 minutes'
    AND COALESCE(status, 'novo') <> 'qa_teste' AND (etapas IS NULL OR etapas = 'null'::jsonb
      OR (etapas ? 'processando' AND NOT (etapas ? 'whatsapp') AND (etapas->>'processando')::timestamptz < NOW() - INTERVAL '5 minutes'))
    ORDER BY criado_em LIMIT ${limite}`.catch(() => []);
  const out = [];
  for (const r of L) { try { out.push(await processarLeadGravado(r.id)); } catch (e) { out.push({ lead_id: r.id, erro: e.message }); } }
  return { processados: out.length, itens: out };
}
export default comGuarda(handler, 'lead-capture');
