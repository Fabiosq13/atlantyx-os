// api/phantom.js — PATCH Settings antes do launch com timeout estendido

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).end();

  const { phantom_key, agent_id, linkedin_url, message, send_invitation } = req.body || {};
  const key     = phantom_key || process.env.PHANTOM_API_KEY;
  const agentId = agent_id   || process.env.PHANTOM_AGENT_ID;

  if (!key)          return res.status(400).json({ success: false, error: 'PhantomBuster API Key nao configurada' });
  if (!agentId)      return res.status(400).json({ success: false, error: 'PhantomBuster Agent ID nao configurado' });
  if (!linkedin_url) return res.status(400).json({ success: false, error: 'linkedin_url obrigatorio' });
  if (!message)      return res.status(400).json({ success: false, error: 'message obrigatorio' });

  const pbHeaders = {
    'Content-Type': 'application/json',
    'X-Phantombuster-Key': key,
  };

  try {
    // PATCH: atualizar spreadsheetUrl nas Settings com a URL do lead
    const newSettings = {
      sessionCookie:              process.env.PHANTOM_SESSION || '',
      spreadsheetUrl:             linkedin_url,
      message:                    message,
      sendInvitation:             send_invitation !== false,
      profilesPerLaunch:          1,
      spreadsheetUrlExclusionList: [],
    };

    console.log('[Phantom] PATCH Settings — URL:', linkedin_url);
    const patchR = await fetch('https://api.phantombuster.com/api/v2/agents/' + agentId, {
      method: 'PATCH',
      headers: pbHeaders,
      body: JSON.stringify({ argument: JSON.stringify(newSettings) }),
    });
    const patchText = await patchR.text();
    console.log('[Phantom] PATCH status:', patchR.status, '| body:', patchText.substring(0, 200));

    // Launch
    console.log('[Phantom] Launching...');
    const r = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
      method: 'POST',
      headers: pbHeaders,
      body: JSON.stringify({ id: agentId, output: 'result-object' }),
    });

    const text = await r.text();
    console.log('[Phantom] Launch status:', r.status, '| body:', text.substring(0, 300));

    if (!r.ok) return res.status(r.status).json({ success: false, error: 'PhantomBuster ' + r.status + ': ' + text.substring(0, 300) });

    const data = JSON.parse(text);
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Phantom]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
