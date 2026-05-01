// api/phantom.js — Renomeia results file a cada launch (resolve "Input already processed")

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

  // Nome de arquivo único por execução — reseta o cache de "already processed"
  const uniqueFileName = 'atlantyx_li_' + Date.now();

  try {
    // PASSO 1: Atualizar Settings do Phantom com URL do lead + nome de arquivo único
    console.log('[Phantom] PATCH Settings — URL:', linkedin_url, '| file:', uniqueFileName);
    const patchResp = await fetch('https://api.phantombuster.com/api/v2/agents/' + agentId, {
      method: 'PATCH',
      headers: pbHeaders,
      body: JSON.stringify({
        argument: JSON.stringify({
          spreadsheetUrl:         linkedin_url,
          message:                message,
          sendInvitation:         send_invitation !== false,
          numberOfLinesPerLaunch: 1,
          // Opção 4: nome único = reseta o processamento a cada execução
          outputFileName:         uniqueFileName,
        }),
      }),
    });
    console.log('[Phantom] PATCH status:', patchResp.status);
    const patchData = await patchResp.text();
    console.log('[Phantom] PATCH body:', patchData.substring(0, 200));

    // PASSO 2: Lançar o Phantom
    console.log('[Phantom] Launching agent:', agentId);
    const r = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
      method: 'POST',
      headers: pbHeaders,
      body: JSON.stringify({
        id:     agentId,
        output: 'result-object',
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
    console.log('[Phantom] Success — containerId:', data.containerId || data.id);
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Phantom]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
