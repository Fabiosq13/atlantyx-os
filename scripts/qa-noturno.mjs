// v3.45 — varredura noturna (GitHub Actions, qa-noturno.yml): abre o Atlantyx OS em produção, entra com o
// usuário de QA, roda o agente de QA em MODO SEGURO (gravações, envios e IA bloqueados) e manda os achados
// para /api/agente-ideias (qa_noturno), que filtra os ERROS, registra o card no Kanban e abre a tarefa
// @claude (correcao-noturna). O PR do Claude passa pela validação e é mesclado pelo auto-merge-noturno.yml.
import { chromium } from 'playwright';

const URL_ = (process.env.ATX_URL || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
const { ATX_QA_EMAIL, ATX_QA_SENHA, CRON_SECRET } = process.env;
if (!CRON_SECRET) { console.error('Falta o secret CRON_SECRET no GitHub (o mesmo valor do Vercel).'); process.exit(1); }

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
if (ATX_QA_EMAIL && ATX_QA_SENHA) {
  const r = await ctx.request.post(URL_ + '/api/auth', { data: { email: ATX_QA_EMAIL, senha: ATX_QA_SENHA } });
  if (!r.ok()) { console.error('Login do QA recusado (HTTP ' + r.status() + '). Confira ATX_QA_EMAIL/ATX_QA_SENHA (login ou e-mail de um usuário criado em Acesso › Usuários).'); process.exit(1); }
}
const pg = await ctx.newPage();
pg.on('dialog', d => d.dismiss().catch(() => {}));
await pg.goto(URL_, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(6000);
if (await pg.locator('#atxLogin').isVisible().catch(() => false)) { console.error('A página pediu login — configure ATX_QA_EMAIL e ATX_QA_SENHA no GitHub.'); process.exit(1); }
await pg.evaluate(() => { nav('qa', document.querySelector('.sbi[onclick*="\'qa\'"]')); try { qaAbrir(); } catch (_) {} });
await pg.waitForFunction(() => window.QA && typeof window.QA.noturno === 'function', null, { timeout: 60000 });
console.log('Varredura em modo seguro iniciada...');
const qa = await pg.evaluate(() => window.QA.noturno({ espera: 10000 }), null).catch(e => ({ erro: e.message, achados: [] }));
console.log(`Telas: ${qa.total_telas} · duração ${qa.duracao_s}s · achados: ${JSON.stringify(qa.resumo || {})}${qa.erro ? ' · erro: ' + qa.erro : ''}`);
await b.close();

const r = await fetch(URL_ + '/api/agente-ideias', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CRON_SECRET },
  body: JSON.stringify({ action: 'qa_noturno', qa }) });
const d = await r.json().catch(() => ({}));
console.log('Esteira:', JSON.stringify(d));
if (!r.ok || !d.success) process.exit(1);
