import { comGuarda } from '../lib/qa-guard.js';
// api/followup-cron.js
// Agente S7-05 — Follow-up automático 48h sem resposta
// Chamado pelo Vercel Cron Jobs a cada hora

// Lista em memória dos follow-ups pendentes (em produção usar Vercel KV)
// Para habilitar Vercel KV: vercel.com/docs/storage/vercel-kv
const MODEL = process.env.CLAUDE_MODEL_RAPIDO || 'claude-haiku-4-5-20251001'; // v3.191 (custo): mensagem curta de WhatsApp → modelo rápido e barato
const pendingFollowUps = new Map();

async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) { // v3.237: sem CRON_SECRET, "Bearer undefined" passava
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
    // v3.237: WhatsApp a prospect só em horário comercial (seg–sex, 8h–19h de Brasília) — antes saía de madrugada e no fim de semana
    const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    if (!(sp.getDay() >= 1 && sp.getDay() <= 5 && sp.getHours() >= 8 && sp.getHours() < 19)) return res.status(200).json({ success: true, fora_do_horario: true, followups_enviados: 0 });
    // v3.237: itens presos em "enviando" (função cortada) vão para revisão — nunca reenvio automático
    try { await sql`UPDATE followups SET status = 'erro', erro = 'interrompido durante o envio — confira se a mensagem saiu antes de reenviar' WHERE status = 'enviando' AND COALESCE(enviado_em, send_at) < NOW() - INTERVAL '10 minutes'`; } catch (_) {}
    const t0 = Date.now(); let devidos = [];
    // v3.233: respeita o descadastro (LGPD) — quem respondeu SAIR não recebe o follow-up
    let optout = new Set();
    try { const { normTelefone } = await import('./campanha-disparo.js'); optout = new Set((await sql`SELECT destino FROM disparo_optout`).map(r => r.destino)); optout._norm = normTelefone; } catch (_) {}
    const pulados = [];
    for (let k = 0; k < 8 && Date.now() - t0 < 40000; k++) {
      // reserva atômica de UM item por vez (duas execuções juntas não mandam o mesmo follow-up)
      let f = null; try { f = (await sql`UPDATE followups SET status = 'enviando', enviado_em = NOW() WHERE id = (SELECT id FROM followups WHERE status = 'pendente' AND send_at <= NOW() ORDER BY send_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) AND status = 'pendente' RETURNING *`)[0]; } catch (_) { f = null; }
      if (!f) break; devidos.push(f);
      const dest = optout._norm ? (optout._norm(f.phone) || String(f.phone || '').replace(/\D/g, '')) : String(f.phone || '').replace(/\D/g, '');
      if (optout.has(dest)) { await sql`UPDATE followups SET status = 'descadastrado' WHERE id = ${f.id}`; pulados.push(f.phone); continue; }
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
      descadastrados_pulados: pulados.length,
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
  const followupMsg = String(data?.content?.[0]?.text || '').trim();
  if (!followupMsg) throw new Error('IA não gerou o follow-up: ' + (data?.error?.message || 'resposta vazia'));

  // Enviar via Z-API
  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  if (!instance || !token) throw new Error('Z-API não configurada');
  const rz = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
    body: JSON.stringify({ phone: followup.phone, message: followupMsg }),
  });
  // v3.233: antes marcava 'enviado' mesmo com a instância desconectada
  const jz = await rz.json().catch(() => ({}));
  if (!rz.ok || jz.error || !(jz.zaapId || jz.messageId || jz.id)) throw new Error('Z-API não enviou: ' + (jz.error || jz.message || ('HTTP ' + rz.status)));

  console.log(`[S7-05] Follow-up enviado para ${followup.phone} (${followup.name})`);
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'followup-cron');
