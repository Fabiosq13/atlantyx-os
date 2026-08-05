// api/phantom.js — PhantomBuster LinkedIn Sender
// Hardened: valida URL, checa status do PATCH, fallback de header, polling opcional

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      config: {
        key_set: !!process.env.PHANTOM_API_KEY,
        agent_set: !!process.env.PHANTOM_AGENT_ID,
        session_set: !!process.env.PHANTOM_SESSION,
      }
    });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const { phantom_key, agent_id, linkedin_url, message, send_invitation, action } = req.body || {};
  const key     = phantom_key || process.env.PHANTOM_API_KEY;
  const agentId = agent_id   || process.env.PHANTOM_AGENT_ID;

  // ── Action especial: checar status de um container já lançado ─────────────
  if (action === 'check_status') {
    const { container_id } = req.body || {};
    if (!key || !container_id) {
      return res.status(400).json({ success: false, error: 'phantom_key e container_id obrigatórios' });
    }
    try {
      const r = await fetch(`https://api.phantombuster.com/api/v2/containers/fetch?id=${container_id}`, {
        headers: { 'X-Phantombuster-Key-1': key, 'Accept': 'application/json' },
      });
      const data = await r.json().catch(() => ({}));
      return res.status(r.ok ? 200 : r.status).json({
        success: r.ok,
        container_id,
        status: data.status || data.lastEndStatus || 'unknown',
        exit_code: data.exitCode,
        ended_at: data.endedAt,
        raw: data,
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // ── Validações obrigatórias ───────────────────────────────────────────────
  if (!key)          return res.status(400).json({ success: false, error: 'PHANTOM_API_KEY não configurada (Vercel env vars)' });
  if (!agentId)      return res.status(400).json({ success: false, error: 'PHANTOM_AGENT_ID não configurado' });
  if (!linkedin_url) return res.status(400).json({ success: false, error: 'linkedin_url obrigatório' });
  if (!message)      return res.status(400).json({ success: false, error: 'message obrigatório' });

  // ── Validação de formato de URL LinkedIn ──────────────────────────────────
  // Aceita: linkedin.com/in/slug, www.linkedin.com/in/slug, https://...
  const liUrlPattern = /^(https?:\/\/)?(www\.)?linkedin\.com\/(in|pub)\/[\w\-%]+\/?(\?.*)?$/i;
  let normalizedUrl = linkedin_url.trim();
  if (!normalizedUrl.startsWith('http')) normalizedUrl = 'https://' + normalizedUrl;
  if (!liUrlPattern.test(linkedin_url.replace(/^https?:\/\//, ''))) {
    return res.status(400).json({
      success: false,
      error: 'URL não parece ser um perfil LinkedIn válido (esperado /in/slug): ' + linkedin_url
    });
  }

  // ── Validação tamanho da mensagem (LinkedIn limita ~300 chars no convite) ─
  const isInvite = send_invitation !== false;
  const maxLen = isInvite ? 300 : 8000;
  if (message.length > maxLen) {
    return res.status(400).json({
      success: false,
      error: `Mensagem com ${message.length} chars excede limite do LinkedIn (${maxLen} para ${isInvite ? 'convite' : 'DM'})`
    });
  }

  // PhantomBuster aceita 2 formatos de header — tentar X-Phantombuster-Key-1 primeiro
  // (mais novo, recomendado pela própria PB)
  const pbHeaders = {
    'Content-Type': 'application/json',
    'X-Phantombuster-Key-1': key,
    'Accept': 'application/json',
  };

  try {
    // ── PATCH: atualizar settings do agente ─────────────────────────────────
    const newSettings = {
      sessionCookie:              process.env.PHANTOM_SESSION || '',
      spreadsheetUrl:             normalizedUrl,
      message:                    message,
      sendInvitation:             isInvite,
      profilesPerLaunch:          1,
      spreadsheetUrlExclusionList: [],
    };

    console.log('[Phantom] PATCH Settings — URL:', normalizedUrl, '| msg:', message.length, 'chars | invite:', isInvite);
    const patchR = await fetch('https://api.phantombuster.com/api/v2/agents/' + agentId, {
      method: 'PATCH',
      headers: pbHeaders,
      body: JSON.stringify({ argument: JSON.stringify(newSettings) }),
    });
    const patchText = await patchR.text();
    console.log('[Phantom] PATCH status:', patchR.status, '| body:', patchText.substring(0, 200));

    // FIX CRÍTICO: se o PATCH falhou, abortar o launch — antes ele era ignorado!
    if (!patchR.ok) {
      return res.status(patchR.status).json({
        success: false,
        step: 'patch',
        error: `Falha ao configurar agente PhantomBuster (${patchR.status}): ${patchText.substring(0, 300)}`,
        hint: patchR.status === 401 ? 'Verifique PHANTOM_API_KEY' :
              patchR.status === 404 ? 'Verifique PHANTOM_AGENT_ID — agente não existe' :
              undefined,
      });
    }

    // Pequena pausa entre PATCH e Launch (algumas vezes a PB precisa propagar)
    await new Promise(r => setTimeout(r, 500));

    // ── Launch ──────────────────────────────────────────────────────────────
    console.log('[Phantom] Launching agent', agentId);
    const r = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
      method: 'POST',
      headers: pbHeaders,
      body: JSON.stringify({ id: agentId, output: 'result-object' }),
    });

    const text = await r.text();
    console.log('[Phantom] Launch status:', r.status, '| body:', text.substring(0, 300));

    if (!r.ok) {
      return res.status(r.status).json({
        success: false,
        step: 'launch',
        error: `PhantomBuster Launch ${r.status}: ${text.substring(0, 300)}`,
        hint: r.status === 429 ? 'Rate limit do PhantomBuster — aguarde 1min' : undefined,
      });
    }

    let data = {};
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return res.status(200).json({
      success: true,
      containerId: data.containerId || data.container_id || data.id || null,
      step: 'launch',
      linkedin_url: normalizedUrl,
      msg_length: message.length,
      is_invite: isInvite,
      ...data
    });

  } catch (e) {
    console.error('[Phantom]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
