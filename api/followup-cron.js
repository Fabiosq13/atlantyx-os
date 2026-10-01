import { comGuarda } from '../lib/qa-guard.js';
// api/followup-cron.js
// Agente S7-05 — Follow-up automático 48h sem resposta
// Chamado pelo Vercel Cron Jobs a cada hora

// Lista em memória dos follow-ups pendentes (em produção usar Vercel KV)
// Para habilitar Vercel KV: vercel.com/docs/storage/vercel-kv
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const pendingFollowUps = new Map();

async function handler(req, res) {
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

    // v3.23: follow-ups gravados pela captura na tabela followups (antes ficavam num Map em memória
    // que nunca era preenchido — nenhum follow-up saía)
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    let devidos = [];
    try { devidos = await sql`SELECT * FROM followups WHERE status = 'pendente' AND send_at <= NOW() ORDER BY send_at ASC LIMIT 20`; } catch (_) { devidos = []; }
    for (const f of devidos) {
      try {
        await enviarFollowUp({ phone: f.phone, name: f.name, company: f.company, job_title: f.job_title, mensagemOriginal: f.mensagem_original });
        await sql`UPDATE followups SET status = 'enviado', enviado_em = NOW() WHERE id = ${f.id}`;
        enviados.push({ phone: f.phone, name: f.name });
      } catch (e) { await sql`UPDATE followups SET status = 'erro', erro = ${String(e.message).substring(0, 300)} WHERE id = ${f.id}`; }
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
      model: MODEL,
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

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'followup-cron');
