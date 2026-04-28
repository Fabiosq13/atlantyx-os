// api/phantom.js
// Proxy para PhantomBuster API — resolve CORS do browser

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { phantom_key, agent_id, linkedin_url, message, send_invitation } = req.body || {};

  const key = phantom_key || process.env.PHANTOM_API_KEY;
  const agentId = agent_id || process.env.PHANTOM_AGENT_ID;

  if (!key)     return res.status(400).json({ success: false, error: 'PhantomBuster API Key não configurada' });
  if (!agentId) return res.status(400).json({ success: false, error: 'PhantomBuster Agent ID não configurado' });
  if (!linkedin_url) return res.status(400).json({ success: false, error: 'linkedin_url obrigatório' });

  try {
    const r = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Phantombuster-Key': key,
      },
      body: JSON.stringify({
        id: agentId,
        output: 'result-object',
        argument: JSON.stringify({
          spreadsheetUrl: linkedin_url,
          message: message || '',
          sendInvitation: send_invitation !== false,
          waitDuration: 10,
        }),
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ success: false, error: 'PhantomBuster ' + r.status + ': ' + errText.substring(0, 200) });
    }

    const data = await r.json();
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Phantom proxy]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
