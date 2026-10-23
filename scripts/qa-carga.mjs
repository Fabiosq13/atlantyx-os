// v3.275 — Robô do TESTE DE CARGA (GitHub Actions, qa-carga.yml).
// Pega o cenário agendado na tela "Agente de QA › Teste de carga", sobe N navegadores de verdade (usuários nas
// TELAS, em modo seguro: gravação, envio e IA bloqueados antes de sair) e N usuários virtuais na RETAGUARDA
// (chamadas de consulta às APIs), mede tempos e erros e devolve o resultado para /api/qa (carga_robo_resultado).
// Secrets: CRON_SECRET, ATX_QA_EMAIL, ATX_QA_SENHA (os mesmos do QA noturno). Variável opcional: ATX_URL.
import { chromium } from 'playwright';
import fs from 'fs';

const URL_ = (process.env.ATX_URL || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
const { ATX_QA_EMAIL, ATX_QA_SENHA, CRON_SECRET } = process.env;
const ID = process.env.CARGA_ID || '';
if (!CRON_SECRET) { console.error('Falta o secret CRON_SECRET no GitHub (o mesmo valor do Vercel).'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const qa = async (action, body = {}) => { const r = await fetch(URL_ + '/api/qa', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CRON_SECRET }, body: JSON.stringify({ action, ...body }) });
  const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(action + ': ' + (d.error || 'HTTP ' + r.status)); return d; };

// ── modo seguro: mesma regra de leitura do agente de QA (public/qa-agent.js) ──
const qaSrc = fs.readFileSync(new URL('../public/qa-agent.js', import.meta.url), 'utf8');
const rx = nome => { const m = qaSrc.match(new RegExp('const ' + nome + ' = (\\/.*\\/[a-z]*);')); if (!m) throw new Error('regra ' + nome + ' não encontrada no qa-agent.js'); const s = m[1]; const i = s.lastIndexOf('/'); return new RegExp(s.substring(1, i), s.substring(i + 1)); };
const READ_RE = rx('READ_RE'), AI_ROTAS = rx('AI_ROTAS');
function ehLeitura(url, metodo, corpo) {
  const u = new URL(url); if (u.origin !== URL_ && !url.startsWith(URL_)) return metodo === 'GET';
  const rota = u.pathname; if (!rota.startsWith('/api/')) return metodo === 'GET';
  if (AI_ROTAS.test(rota)) return false;
  let b = null; try { b = corpo ? JSON.parse(corpo) : null; } catch (_) {}
  const action = b?.action || u.searchParams.get('action') || null;
  if (rota === '/api/qa') return false;
  if (metodo === 'GET') return !(u.searchParams.get('cron') || (action && !READ_RE.test(action)));
  if (rota === '/api/rfp-monitor') return !!b?.somente_cache;
  if (rota === '/api/db') return /^(list_|get$|status$)/.test(action || '');
  return !!(action && READ_RE.test(action));
}

// ── métricas ──
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function agregar(regs, ini, fim, ativosFn) {
  const ms = regs.map(r => r.ms), erros = regs.filter(r => !r.ok).length, dur = Math.max(1, (fim - ini) / 1000);
  const por = {}; regs.forEach(r => { const k = r.id; (por[k] = por[k] || { id: k, ms: [], erros: 0, erro_exemplo: null }); por[k].ms.push(r.ms); if (!r.ok) { por[k].erros++; por[k].erro_exemplo = por[k].erro_exemplo || r.erro; } });
  const status = {}; regs.forEach(r => { status[r.status] = (status[r.status] || 0) + 1; });
  const lt = []; for (let t = ini; t < fim; t += 10000) { const l = regs.filter(r => r.t >= t && r.t < t + 10000); lt.push({ s: Math.round((t - ini) / 1000), n: l.length, erros: l.filter(r => !r.ok).length, p95: pct(l.map(r => r.ms), 0.95), ativos: ativosFn ? ativosFn(t + 5000) : null }); }
  return { total: regs.length, erros, rps: +(regs.length / dur).toFixed(2), p50: pct(ms, 0.5), p95: pct(ms, 0.95), p99: pct(ms, 0.99), max: ms.length ? Math.max(...ms) : 0, status,
    por_chamada: Object.values(por).map(x => ({ id: x.id, n: x.ms.length, erros: x.erros, p50: pct(x.ms, 0.5), p95: pct(x.ms, 0.95), max: Math.max(...x.ms), erro_exemplo: x.erro_exemplo })).sort((a, b) => b.p95 - a.p95), linha_tempo: lt };
}

// ── pega o cenário ──
const { fila } = await qa('carga_robo_pegar', { id: ID });
if (!fila) { console.log('Nenhum teste de carga na fila' + (ID ? ' com id ' + ID : '') + '.'); process.exit(0); }
const C = fila.config; console.log('Teste de carga', fila.id, JSON.stringify({ telas: C.usuarios_front, retaguarda: C.usuarios_back, min: C.duracao_min, externos: C.externos }));
const { apis: CAT_API, telas: CAT_TELAS } = await qa('carga_catalogo');
const INI = Date.now(), FIM = INI + C.duracao_min * 60000;
let cancelado = false;
const personaDe = i => { const tot = Object.values(C.mix).reduce((s, v) => s + v, 0) || 1; let acc = 0; const x = (((i + 1) * 0.618034) % 1) * tot; /* distribuição uniforme e determinística conforme o mix */ for (const [p, v] of Object.entries(C.mix)) { acc += v; if (x < acc) return p; } return 'gestor'; };
const sorteio = itens => { const tot = itens.reduce((s, x) => s + x.peso, 0); let r = Math.random() * tot; for (const x of itens) { r -= x.peso; if (r <= 0) return x; } return itens[itens.length - 1]; };
let proxExterno = 0; const vezExterno = async () => { const agora = Date.now(), minha = Math.max(agora, proxExterno); proxExterno = minha + 3000; if (minha > agora) await sleep(minha - agora); };

// login único: a sessão é compartilhada por todos os usuários simulados (evita 30 logins seguidos)
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const ctx0 = await browser.newContext();
if (ATX_QA_EMAIL && ATX_QA_SENHA) { const r = await ctx0.request.post(URL_ + '/api/auth', { data: { email: ATX_QA_EMAIL, senha: ATX_QA_SENHA } });
  if (!r.ok()) { console.error('Login do QA recusado (HTTP ' + r.status() + ')'); process.exit(1); } }
const estado = await ctx0.storageState(); const cookie = estado.cookies.map(c => c.name + '=' + c.value).join('; ');
await ctx0.close();

// ── RETAGUARDA ──
const regsBack = []; let backAtivos = 0; const backHist = [];
async function usuarioBack(i) {
  const p = personaDe(i); const itens = CAT_API.filter(a => (a.persona === p || a.persona === 'todos') && (C.externos || !a.externo)).map(a => ({ ...a, peso: C.pesos?.[a.id] ?? a.peso })).filter(a => a.peso > 0);
  await sleep(C.usuarios_back > 1 ? (i / C.usuarios_back) * C.rampa_s * 1000 : 0); if (Date.now() >= FIM || !itens.length) return;
  backAtivos++; backHist.push([Date.now(), 1]);
  while (Date.now() < FIM && !cancelado) {
    const a = sorteio(itens); if (a.externo) await vezExterno(); if (Date.now() >= FIM) break;
    const t = Date.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), 60000);
    let reg = { id: a.id, t, ok: false, status: 0, ms: 0, erro: null };
    try { const r = await fetch(URL_ + (a.rota === '/' ? '/' : a.rota), a.metodo === 'GET' ? { headers: { cookie }, signal: ac.signal } : { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ action: a.action, params: {} }), signal: ac.signal });
      const txt = await r.text(); reg.status = r.status; let d = null; try { d = JSON.parse(txt); } catch (_) {}
      reg.ok = r.ok && !(d && d.success === false); if (!reg.ok) reg.erro = (d?.error || txt.substring(0, 120) || 'HTTP ' + r.status).toString().substring(0, 160);
    } catch (e) { reg.erro = e.name === 'AbortError' ? 'sem resposta em 60 s' : e.message; }
    clearTimeout(to); reg.ms = Date.now() - t; regsBack.push(reg);
    await sleep(rnd(C.pensar_s[0], C.pensar_s[1]) * 1000);
  }
  backAtivos--; backHist.push([Date.now(), -1]);
}

// ── TELAS ──
const regsTela = [], regsApiFront = [], errosJs = {}; let frontAtivos = 0; const frontHist = []; let externoTelas = 0;
async function usuarioFront(i) {
  const p = personaDe(i + 7);
  let telas = CAT_TELAS.filter(t => (C.externos || !t.externo));
  const escolhidas = telas.filter(t => C.telas?.includes(t.id));
  telas = (escolhidas.length ? escolhidas : telas).filter(t => t.persona === p); if (!telas.length) telas = (escolhidas.length ? escolhidas : CAT_TELAS.filter(t => C.externos || !t.externo));
  await sleep(C.usuarios_front > 1 ? (i / C.usuarios_front) * C.rampa_s * 1000 : 0); if (Date.now() >= FIM) return;
  const ctx = await browser.newContext({ storageState: estado, viewport: { width: 1366, height: 850 } });
  await ctx.addInitScript(() => { window.open = () => null; window.confirm = () => false; window.prompt = () => null; window.alert = () => {}; });
  const pg = await ctx.newPage(); let pend = 0, ultimaAtiv = Date.now(), telaAtual = 'carregar o sistema', errosTela = [];
  await pg.route('**/*', async route => { const rq = route.request(); try {
      if (!ehLeitura(rq.url(), rq.method(), rq.postData())) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, bloqueado_carga: true, error: 'bloqueado pelo teste de carga (modo seguro)' }) });
    } catch (_) {} return route.continue().catch(() => {}); });
  const ehApi = u => u.startsWith(URL_ + '/api/');
  pg.on('request', rq => { if (ehApi(rq.url())) { pend++; ultimaAtiv = Date.now(); rq._t = Date.now(); } });
  const fimReq = async (rq, falhou) => { if (!ehApi(rq.url())) return; pend = Math.max(0, pend - 1); ultimaAtiv = Date.now();
    let body = null; try { body = JSON.parse(rq.postData() || 'null'); } catch (_) {}
    const u = new URL(rq.url()); const id = u.pathname.replace('/api/', '') + ':' + (body?.action || u.searchParams.get('action') || rq.method());
    const res = falhou ? null : await rq.response().catch(() => null); let ok = !!res && res.status() < 400, erro = falhou ? (rq.failure()?.errorText || 'falhou') : null;
    if (res && res.status() === 200 && /json/.test(res.headers()['content-type'] || '')) { try { const d = await res.json(); if (d && d.success === false && !d.bloqueado_carga) { ok = false; erro = String(d.error || 'success:false').substring(0, 160); } if (d?.bloqueado_carga) return; } catch (_) {} }
    if (res && !ok && !erro) erro = 'HTTP ' + res.status();
    const reg = { id, t: rq._t || Date.now(), ms: Date.now() - (rq._t || Date.now()), ok, status: res ? res.status() : 0, erro, tela: telaAtual }; regsApiFront.push(reg); if (!ok) errosTela.push(id + ': ' + erro); };
  pg.on('requestfinished', rq => fimReq(rq, false)); pg.on('requestfailed', rq => fimReq(rq, true));
  pg.on('pageerror', e => { const k = String(e.message).substring(0, 160); (errosJs[k] = errosJs[k] || { msg: k, n: 0, telas: new Set() }).n++; errosJs[k].telas.add(telaAtual); errosTela.push('JS: ' + k); });
  pg.on('dialog', d => d.dismiss().catch(() => {}));
  const esperarCalma = async (lim = 45000) => { const t0 = Date.now(); await sleep(400);
    while (Date.now() - t0 < lim) { const carregando = await pg.evaluate(() => { const a = document.querySelector('.page.active'); return !!a && /carregando|consultando|aguarde|⏳/i.test((a.innerText || '').substring(0, 4000)); }).catch(() => false);
      if (pend === 0 && Date.now() - ultimaAtiv > 900 && !carregando) return { ms: Math.max(0, ultimaAtiv - t0), timeout: false };
      // sem chamadas há 5 s mas algum "carregando…" ficou na tela (ex.: painel opcional): o tempo real é o da última resposta
      if (pend === 0 && Date.now() - ultimaAtiv > 5000) return { ms: Math.max(0, ultimaAtiv - t0), timeout: false, aviso: 'texto "carregando" continuou na tela' };
      await sleep(250); }
    return { ms: lim, timeout: true }; };
  frontAtivos++; frontHist.push([Date.now(), 1]);
  try {
    const t0 = Date.now(); errosTela = [];
    await pg.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await pg.waitForFunction(() => typeof window.nav === 'function', null, { timeout: 90000 });
    const c = await esperarCalma(60000); regsTela.push({ id: 'carregar o sistema', t: t0, ms: Date.now() - t0, ok: !c.timeout && !errosTela.length, erros: errosTela.slice(0, 3), timeout: c.timeout });
    let ant = null;
    while (Date.now() < FIM && !cancelado) {
      const opc = telas.filter(t => t.id !== ant); const tela = opc[Math.floor(Math.random() * opc.length)] || telas[0]; ant = tela.id;
      if (tela.externo) { while (externoTelas >= 2 && Date.now() < FIM) await sleep(500); externoTelas++; }
      telaAtual = tela.nome; errosTela = []; const t1 = Date.now();
      try { await pg.evaluate(id => nav(id, document.querySelector(`.sbi[onclick*="'${id}'"]`)), tela.id); const r = await esperarCalma();
        regsTela.push({ id: tela.nome, t: t1, ms: r.ms, ok: !r.timeout && !errosTela.length, erros: errosTela.slice(0, 3), timeout: r.timeout }); }
      catch (e) { regsTela.push({ id: tela.nome, t: t1, ms: Date.now() - t1, ok: false, erros: [e.message.substring(0, 160)] }); }
      finally { if (tela.externo) externoTelas--; }
      await sleep(rnd(C.pensar_s[0], C.pensar_s[1]) * 1000);
    }
  } catch (e) { regsTela.push({ id: 'carregar o sistema', t: Date.now(), ms: 0, ok: false, erros: [e.message.substring(0, 160)] }); }
  frontAtivos--; frontHist.push([Date.now(), -1]); await ctx.close().catch(() => {});
}

// ── progresso a cada 15 s (e cancelamento pela tela) ──
const prog = setInterval(async () => { try { const ult = regsBack.filter(r => r.t > Date.now() - 15000);
  const d = await qa('carga_robo_progresso', { id: fila.id, progresso: { decorrido_s: Math.round((Date.now() - INI) / 1000), total_s: C.duracao_min * 60, front_ativos: frontAtivos, back_ativos: backAtivos,
    req_back: regsBack.length, erros_back: regsBack.filter(r => !r.ok).length, p95_back_15s: pct(ult.map(r => r.ms), 0.95), telas_abertas: regsTela.length, telas_erro: regsTela.filter(r => !r.ok).length } });
  if (d.cancelar) { cancelado = true; console.log('Cancelado pela tela.'); } } catch (e) { console.log('progresso:', e.message); } }, 15000);

await Promise.all([...[...Array(C.usuarios_back)].map((_, i) => usuarioBack(i)), ...[...Array(C.usuarios_front)].map((_, i) => usuarioFront(i))]);
clearInterval(prog); await browser.close();
const FIMR = Date.now();
const ativosEm = hist => t => hist.filter(h => h[0] <= t).reduce((s, h) => s + h[1], 0);
const resultado = { onde: 'robo', inicio: new Date(INI).toISOString(), duracao_s: Math.round((FIMR - INI) / 1000), cancelado,
  back: C.usuarios_back ? { usuarios: C.usuarios_back, ...agregar(regsBack, INI, FIMR, ativosEm(backHist)) } : null,
  front: C.usuarios_front ? (() => { const a = agregar(regsTela.map(r => ({ ...r, erro: (r.erros || [])[0] || (r.timeout ? 'não terminou de carregar em 45 s' : null) })), INI, FIMR, ativosEm(frontHist));
    return { usuarios: C.usuarios_front, telas_abertas: a.total, telas_com_erro: a.erros, p50: a.p50, p95: a.p95, max: a.max, por_tela: a.por_chamada, linha_tempo: a.linha_tempo,
      api: agregar(regsApiFront, INI, FIMR), erros_js: Object.values(errosJs).sort((x, y) => y.n - x.n).slice(0, 20).map(e => ({ msg: e.msg, n: e.n, telas: [...e.telas].slice(0, 5) })) }; })() : null };
console.log('Resumo:', JSON.stringify({ back: resultado.back && { total: resultado.back.total, erros: resultado.back.erros, p95: resultado.back.p95 }, front: resultado.front && { telas: resultado.front.telas_abertas, erros: resultado.front.telas_com_erro, p95: resultado.front.p95 } }));
const d = await qa('carga_robo_resultado', { id: fila.id, resultado });
console.log('Veredito:', JSON.stringify(d.veredito));
