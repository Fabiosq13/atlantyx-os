// api/health.js
// Healthcheck do Atlantyx OS
// - GET  /api/health                              → status básico (público, sem IA)
// - GET  /api/health?full=1                       → status básico + testa Claude API + testa DB
// - GET  /api/health?full=1 (com Bearer CRON)     → chamado pelo cron semanal
//
// Se falhar, retorna 503 — Vercel detecta e envia notificação por email.

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// Metadados do build (injetados no deploy pelo Vercel)
const BUILD = {
  id: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 8) || 'local',
  branch: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
  commit_msg: process.env.VERCEL_GIT_COMMIT_MESSAGE?.substring(0, 80) || '',
  deployed_at: process.env.VERCEL_DEPLOYMENT_ID ? new Date().toISOString() : null,
  region: process.env.VERCEL_REGION || 'local',
  version: '1.4',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isFull = req.query?.full === '1';
  const isCron = (req.headers?.authorization || '') === `Bearer ${process.env.CRON_SECRET}`;

  // Timestamp legível para o buildId visível: ATX-YYYYMMDD-HHMM-<hash>
  const now = new Date();
  const dt = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  const buildId = `ATX-${dt}-${BUILD.id.toUpperCase()}`;

  const checks = {
    server: { status: 'ok', message: 'API respondeu' },
  };

  // Envvars críticas presentes?
  const criticalEnvs = ['DATABASE_URL', 'ANTHROPIC_API_KEY'];
  const missing = criticalEnvs.filter(k => !process.env[k]);
  checks.env = missing.length
    ? { status: 'error', message: `Faltando: ${missing.join(', ')}` }
    : { status: 'ok', message: `${criticalEnvs.length} envvars críticas OK` };

  if (isFull) {
    // Teste 1: Claude API (só é testado se full=1)
    checks.claude_api = await testClaude();
    // Teste 2: Banco de dados
    checks.database = await testDb();
    // Teste 3: modelo em uso
    checks.model = { status: 'ok', message: MODEL, note: 'Usando process.env.CLAUDE_MODEL' };
  }

  // Status agregado — se qualquer check crítico falhou, retorna 503
  const anyError = Object.values(checks).some(c => c.status === 'error');
  const httpStatus = anyError ? 503 : 200;

  return res.status(httpStatus).json({
    status: anyError ? 'unhealthy' : 'healthy',
    build_id: buildId,
    build: BUILD,
    server_time: now.toISOString(),
    triggered_by: isCron ? 'cron' : 'manual',
    checks,
  });
}

async function testClaude() {
  if (!process.env.ANTHROPIC_API_KEY) return { status: 'error', message: 'ANTHROPIC_API_KEY ausente' };
  try {
    const t0 = Date.now();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Responda apenas: ok' }],
      }),
    });
    const ms = Date.now() - t0;
    const d = await r.json();
    if (!r.ok) {
      return {
        status: 'error',
        message: `HTTP ${r.status} — ${d?.error?.message || d?.error?.type || 'erro'}`,
        model_testado: MODEL,
        response_ms: ms,
      };
    }
    const text = d?.content?.[0]?.text || '';
    return {
      status: 'ok',
      message: `Claude respondeu em ${ms}ms`,
      model: MODEL,
      response_snippet: text.substring(0, 50),
    };
  } catch (e) {
    return { status: 'error', message: e.message, model_testado: MODEL };
  }
}

async function testDb() {
  if (!process.env.DATABASE_URL) return { status: 'error', message: 'DATABASE_URL ausente' };
  try {
    // Import dinâmico para não quebrar se @neondatabase não estiver instalado
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const t0 = Date.now();
    const r = await sql`SELECT 1 AS one`;
    const ms = Date.now() - t0;
    return {
      status: r?.[0]?.one === 1 ? 'ok' : 'error',
      message: `Neon respondeu em ${ms}ms`,
      response_ms: ms,
    };
  } catch (e) {
    return { status: 'error', message: e.message.substring(0, 150) };
  }
}
