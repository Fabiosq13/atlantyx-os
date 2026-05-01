// api/phantom.js — PhantomBuster LinkedIn Message Sender
// reprocessSameUrl: true — evita "Input already processed"

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'phantom-proxy' });
  if (req.method !== 'POST') return res.status(405).end();

  const { phantom_key, agent_id, linkedin_url, message, send_invitation } = req.body || {};

  const key     = phantom_key || process.env.PHANTOM_API_KEY;
  const agentId = agent_id   || process.env.PHANTOM_AGENT_ID;

  if (!key)          return res.status(400).json({ success: false, error: 'PhantomBuster API Key não configurada' });
  if (!agentId)      return res.status(400).json({ success: false, error: 'PhantomBuster Agent ID não configurado' });
  if (!linkedin_url) return res.status(400).json({ success: false, error: 'linkedin_url obrigatório' });
  if (!message)      return res.status(400).json({ success: false, error: 'message obrigatório' });

  console.log('[Phantom] Launching agent:', agentId);
  console.log('[Phantom] LinkedIn URL:', linkedin_url);
  console.log('[Phantom] Message length:', message?.length);

  try {
    const argument = {
      spreadsheetUrl:   linkedin_url,
      message:          message,
      sendInvitation:   send_invitation !== false,
      // CHAVE: forçar reprocessamento mesmo se URL já foi processada
      reprocessSameUrl: true,
      numberOfLinesPerLaunch: 1,
    };

    const body = {
      id:       agentId,
      output:   'result-object',
      argument: JSON.stringify(argument),
    };

    console.log('[Phantom] POST argument:', JSON.stringify(argument));

    const r = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
      method: 'POST',
      headers: {
        'Content-Type':        'application/json',
        'X-Phantombuster-Key': key,
      },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    console.log('[Phantom] Response status:', r.status);
    console.log('[Phantom] Response body:', text.substring(0, 500));

    if (!r.ok) {
      return res.status(r.status).json({
        success: false,
        error: 'PhantomBuster ' + r.status + ': ' + text.substring(0, 300)
      });
    }

    const data = JSON.parse(text);
    console.log('[Phantom] Launch success — containerId:', data.containerId || data.id);
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Phantom]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
