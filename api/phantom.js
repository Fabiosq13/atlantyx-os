// api/phantom.js
// Etapa 1 (step=1): "LinkedIn - Connect and send follow-up messages" → agent_id vem do frontend (liPhantomConnectAgentId)
// Etapas 2/3/4   : "LinkedIn Message Sender"                        → PHANTOM_AGENT_ID (já existe no Vercel)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).end();

  const { phantom_key, agent_id, connect_agent_id, linkedin_url, message, followup_message, step } = req.body || {};

  const key       = phantom_key || process.env.PHANTOM_API_KEY;
  const isStep1   = !step || step === 1;

  // Etapa 1 → usa connect_agent_id (novo agente de conexão)
  // Etapas 2/3/4 → usa PHANTOM_AGENT_ID existente (Message Sender)
  const agentId   = isStep1
    ? (connect_agent_id || process.env.PHANTOM_CONNECT_AGENT_ID)
    : (agent_id         || process.env.PHANTOM_AGENT_ID);

  if (!key)          return res.status(400).json({ success: false, error: 'PhantomBuster API Key nao configurada' });
  if (!agentId)      return res.status(400).json({ success: false, error: isStep1 ? 'Agent ID de Conexao nao configurado' : 'PHANTOM_AGENT_ID nao configurado' });
  if (!linkedin_url) return res.status(400).json({ success: false, error: 'linkedin_url obrigatorio' });
  if (!message)      return res.status(400).json({ success: false, error: 'message obrigatorio' });

  const pbHeaders = {
    'Content-Type': 'application/json',
    'X-Phantombuster-Key': key,
  };

  // ── ETAPA 1: "LinkedIn - Connect and send follow-up messages" ────────────────
  const settingsConexao = {
    sessionCookie:                    process.env.PHANTOM_SESSION || '',
    spreadsheetUrl:                   linkedin_url,
    message:                          message,                 // Nota do convite (máx 150 chars)
    followUpMessage:                  followup_message || '',  // Msg automática após aceitar
    followUpDelay:                    3,                       // Dias para enviar follow-up
    sendInMail:                       false,
    inMailSubject:                    '',
    numberOfAddsPerLaunch:            1,
    delayBetweenRequests:             5,
    onlySecondDegree:                 false,
    disqualifyInMailIfPremiumMissing: true,
    spreadsheetUrlExclusionList:      [],
  };

  // ── ETAPAS 2/3/4: "LinkedIn Message Sender" (PHANTOM_AGENT_ID existente) ────
  const settingsMensagem = {
    sessionCookie:               process.env.PHANTOM_SESSION || '',
    spreadsheetUrl:              linkedin_url,
    columnName:                  'linkedinUrl',
    message:                     message,
    sendInMail:                  false,
    inMailSubject:               '',
    numberOfAddsPerLaunch:       1,
    delayBetweenRequests:        5,
    spreadsheetUrlExclusionList: [],
  };

  const newSettings = isStep1 ? settingsConexao : settingsMensagem;

  console.log('[Phantom] Step:', step || 1, '| Servico:', isStep1 ? 'Connect+FollowUp' : 'MessageSender', '| Agent:', agentId);

  try {
    const patchR = await fetch('https://api.phantombuster.com/api/v2/agents/' + agentId, {
      method: 'PATCH',
      headers: pbHeaders,
      body: JSON.stringify({ argument: JSON.stringify(newSettings) }),
    });
    const patchText = await patchR.text();
    console.log('[Phantom] PATCH status:', patchR.status, '| body:', patchText.substring(0, 200));

    if (!patchR.ok) {
      return res.status(patchR.status).json({ success: false, error: 'PATCH falhou: ' + patchText.substring(0, 300) });
    }

    const r = await fetch('https://api.phantombuster.com/api/v2/agents/launch', {
      method: 'POST',
      headers: pbHeaders,
      body: JSON.stringify({ id: agentId, output: 'result-object' }),
    });

    const text = await r.text();
    console.log('[Phantom] Launch status:', r.status, '| body:', text.substring(0, 300));

    if (!r.ok) return res.status(r.status).json({ success: false, error: 'PhantomBuster ' + r.status + ': ' + text.substring(0, 300) });

    const data = JSON.parse(text);
    return res.status(200).json({ success: true, step: step || 1, ...data });

  } catch (e) {
    console.error('[Phantom]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
