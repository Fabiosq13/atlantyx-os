// api/followup-cron.js
// Agente S7-05 — Follow-up automático 48h sem resposta
// Chamado pelo Vercel Cron Jobs a cada hora

// Lista em memória dos follow-ups pendentes (em produção usar Vercel KV)
// Para habilitar Vercel KV: vercel.com/docs/storage/vercel-kv
const pendingFollowUps = new Map();

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const agora = new Date();
    const enviados = [];

    // Em produção com Vercel KV:
    // const { kv } = await import('@vercel/kv');
    // const keys = await kv.keys('followup:*');
    // for (const key of keys) { const data = await kv.get(key); ... }

    // Verificar follow-ups agendados
    for (const [id, followup] of pendingFollowUps.entries()) {
      const sendAt = new Date(followup.sendAt);
      if (agora >= sendAt) {
        await enviarFollowUp(followup);
        pendingFollowUps.delete(id);
        enviados.push({ phone: followup.phone, name: followup.name });
      }
    }

    return res.status(200).json({
      success: true,
      hora: agora.toISOString(),
      followups_enviados: enviados.length,
      enviados
    });

  } catch (error) {
    console.error('[ERRO followup-cron]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function enviarFollowUp(followup) {
  // Agente S7-05 — Claude gera follow-up personalizado diferente da 1ª mensagem
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: `Crie um follow-up de WhatsApp de máximo 3 linhas para ${followup.name} da ${followup.company || 'empresa'}, cargo ${followup.job_title || ''}.

Esta é a 2ª tentativa — a primeira mensagem não recebeu resposta em 48h.
Use uma abordagem diferente da original. Tom direto, sem emojis.
Mencione um caso de resultado rápido ou uma pergunta provocativa sobre dados.

Primeira mensagem enviada: "${(followup.mensagemOriginal || '').substring(0, 100)}..."

Retorne APENAS o texto do follow-up.`
      }]
    })
  });

  const data = await res.json();
  const followupMsg = data.content[0].text;

  // Enviar via Z-API
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
    body: JSON.stringify({ phone: followup.phone, message: followupMsg }),
  });

  console.log(`[S7-05] Follow-up enviado para ${followup.phone} (${followup.name})`);
}
