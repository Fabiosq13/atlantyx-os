// api/phantom.js — Atualiza argument completo antes do launch

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).end();

  const { phantom_key, agent_id, linkedin_url, message, send_invitation } = req.body || {};
  const key        = phantom_key || process.env.PHANTOM_API_KEY;
  const agentId    = agent_id   || process.env.PHANTOM_AGENT_ID;
  const sessionCookie = process.env.PHANTOM_SESSION || '';
  const userAgent  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

  if (!key)          return res.status(400).json({ success: false, error: 'PHANTOM_API_KEY nao configurada' });
  if (!agentId)      return res.status(400).json({ success: false, error: 'PHANTOM_AGENT_ID nao configurado' });
  if (!linkedin_url) return res.status(400).json({ success: false, error: 'linkedin_url obrigatorio' });
  if (!message)      return res.status(400).json({ success: false, error: 'message obrigatorio' });

  const pbHeaders = {
    'Content-Type': 'application/json',
    'X-Phantombuster-Key': key,
  };

  // Argument completo igual ao JSON das Settings — sobrescreve tudo
  const fullArgument = {
    sessionCookie:              sessionCookie,
    userAgent:                  userAgent,
    spreadsheetUrl:             linkedin_url,
    spreadsheetUrlExclusionList: [],
    message:                    message,
    sendInvitation:             send_invitation !== false,
    profilesPerLaunch:          1,
  };

  console.log('[Phantom] Updating agent argument — URL:', linkedin_url);

  try {
    // PATCH com argument completo
    const patchR = await fetch('https://api.phantombuster.com/api/v2/agents/' + agentId, {
      method: 'PATCH',
      headers: pbHeaders,
      body: JSON.stringify({ argument: JSON.stringify(fullArgument) }),
    });
    const patchText = await patchR.text();
    console.log('[Phantom] PATCH status:', patchR.status);
    console.log('[Phantom] PATCH response:', patchText.substring(0, 300));

    if (!patchR.ok) {
      console.error('[Phantom] PATCH failed — launching anyway');
    }

    // Launch
    const r = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
      method: 'POST',
      headers: pbHeaders,
      body: JSON.stringify({ id: agentId, output: 'result-object' }),
    });

    const text = await r.text();
    console.log('[Phantom] Launch status:', r.status, '| body:', text.substring(0, 300));

    if (!r.ok) return res.status(r.status).json({
      success: false,
      error: 'PhantomBuster launch ' + r.status + ': ' + text.substring(0, 300)
    });

    const data = JSON.parse(text);
    console.log('[Phantom] Launched — containerId:', data.containerId || data.id);
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Phantom]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
