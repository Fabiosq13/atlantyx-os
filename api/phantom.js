// api/phantom.js — Limpa output antes de lançar (resolve "Input already processed")

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

  if (!key)          return res.status(400).json({ success: false, error: 'PhantomBuster API Key não configurada' });
  if (!agentId)      return res.status(400).json({ success: false, error: 'PhantomBuster Agent ID não configurado' });
  if (!linkedin_url) return res.status(400).json({ success: false, error: 'linkedin_url obrigatório' });
  if (!message)      return res.status(400).json({ success: false, error: 'message obrigatório' });

  const pbHeaders = {
    'Content-Type': 'application/json',
    'X-Phantombuster-Key': key,
  };

  try {
    // PASSO 1: Deletar output anterior do agent (resolve "Input already processed")
    try {
      const delR = await fetch(`https://api.phantombuster.com/api/v2/agents/${agentId}/output`, {
        method: 'DELETE',
        headers: pbHeaders,
      });
      console.log('[Phantom] Output deleted — status:', delR.status);
    } catch(e) {
      console.log('[Phantom] Delete output failed (continuing):', e.message);
    }

    // PASSO 2: Lançar o agent com a URL do lead
    const argument = {
      spreadsheetUrl:         linkedin_url,
      message:                message,
      sendInvitation:         send_invitation !== false,
      numberOfLinesPerLaunch: 1,
    };

    console.log('[Phantom] Launching — URL:', linkedin_url, '| msg:', message?.substring(0,50));

    const r = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
      method: 'POST',
      headers: pbHeaders,
      body: JSON.stringify({
        id:       agentId,
        output:   'result-object',
        argument: JSON.stringify(argument),
      }),
    });

    const text = await r.text();
    console.log('[Phantom] Launch status:', r.status, '| body:', text.substring(0, 300));

    if (!r.ok) {
      return res.status(r.status).json({
        success: false,
        error: 'PhantomBuster ' + r.status + ': ' + text.substring(0, 300)
      });
    }

    const data = JSON.parse(text);
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Phantom]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
