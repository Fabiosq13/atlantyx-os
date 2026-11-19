// lib/robos.js — v3.566 · configuração dos robôs que gastam IA: liga/desliga, modelo, extras, custo real × estimado
// Estado no kv_store ('robos:cfg', 'robos:ultimo:<id>'). Quem gasta pergunta antes: `await liberado('rfp', 'petronect')`.
import { ROBOS, PROVEDORES, todosModelos, porId, cfgDe, casa, custoRun } from './robos-catalogo.js';
let _sql = null, _cache = { em: 0, v: {} };
async function db() { if (globalThis.__ROBOS_MEM) return null; if (!process.env.DATABASE_URL) return null; if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); } return _sql; }
const val = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return null; } };
async function kvGet(k) { const m = globalThis.__ROBOS_MEM; if (m) return m[k] ?? null; const s = await db(); if (!s) return null; const r = (await s`SELECT value FROM kv_store WHERE key=${k}`)[0]; return r ? val(r.value) : null; }
async function kvSet(k, v) { const m = globalThis.__ROBOS_MEM; if (m) { m[k] = v; return; } const s = await db(); if (!s) throw new Error('Banco indisponível'); await s`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`; }
export async function cfgLer(forcar) { if (!forcar && Date.now() - _cache.em < 20000) return _cache.v; try { _cache = { em: Date.now(), v: (await kvGet('robos:cfg')) || {} }; } catch (_) { _cache = { em: Date.now(), v: _cache.v || {} }; } return _cache.v; }

// Pode rodar agora? Considera ligado/desligado e, se o robô tem "dias", o intervalo desde a última vez (sub = ex.: 'petronect').
export async function liberado(id, sub = '') {
  const r = porId(id); if (!r) return { ok: true };
  const c = cfgDe(r, await cfgLer());
  if (c.ligado === false) return { ok: false, motivo: 'robô desligado em Robôs e custo de IA' };
  if (c.dias) { const u = await kvGet('robos:ultimo:' + id + (sub ? ':' + sub : '')); if (u?.em && Date.now() - Date.parse(u.em) < (c.dias * 24 - 2) * 3600e3) return { ok: false, motivo: 'roda a cada ' + c.dias + ' dia(s); última em ' + u.em.substring(0, 10) }; }
  return { ok: true, cfg: c };
}
export async function marcar(id, sub = '') { try { await kvSet('robos:ultimo:' + id + (sub ? ':' + sub : ''), { em: new Date().toISOString() }); } catch (_) {} }
export async function opcao(id, k, padrao) { const r = porId(id); const c = r ? cfgDe(r, await cfgLer()) : {}; return c[k] ?? padrao; }

export async function salvar({ id, ligado, modelo, extras }, login) {
  const r = porId(id); if (!r) throw Object.assign(new Error('Robô desconhecido'), { status: 404 });
  const cfg = { ...(await cfgLer(true)) }, a = { ...(cfg[id] || {}) };
  if (typeof ligado === 'boolean') a.ligado = ligado;
  if (modelo !== undefined) { const M = todosModelos(cfg.__modelos), m = M.get(modelo);
    if (!r.troca && modelo !== r.modelo) throw Object.assign(new Error('Este robô usa sempre o modelo ' + M.get(r.modelo).nome), { status: 400 });
    if (modelo && !m) throw Object.assign(new Error('Modelo inválido'), { status: 400 });
    if (modelo && r.soClaude && m.prov !== 'anthropic') throw Object.assign(new Error('Este robô ' + r.soClaude + ': só aceita modelos Claude'), { status: 400 });
    if (modelo && modelo !== r.modelo) a.modelo = modelo; else delete a.modelo; }
  for (const e of r.extras || []) { if (extras && e.k in extras) { const v = extras[e.k]; if (e.tipo === 'bool') a[e.k] = !!v; else { const n = +v; if (!e.op.includes(n)) throw Object.assign(new Error('Valor inválido para ' + e.rot), { status: 400 }); a[e.k] = n; } } }
  a.por = login || ''; a.em = new Date().toISOString(); cfg[id] = a; await kvSet('robos:cfg', cfg); _cache = { em: Date.now(), v: cfg }; return cfgDe(r, cfg);
}

export async function modeloSalvar({ prov, modelo, nome, preco }, login) {
  if (!PROVEDORES[prov] || prov === 'anthropic') throw Object.assign(new Error('Provedor inválido'), { status: 400 });
  if (!/^[A-Za-z0-9._:\/-]{1,80}$/.test(String(modelo || ''))) throw Object.assign(new Error('Id do modelo inválido (use o id exato do site do provedor)'), { status: 400 });
  const pi = +preco?.[0], po = +preco?.[1]; if (!(pi >= 0 && po >= 0 && pi < 1000 && po < 1000) || (pi === 0 && po === 0 && !/groq|openrouter/.test(prov))) throw Object.assign(new Error('Informe o preço por 1 milhão de tokens (entrada e saída), em dólares'), { status: 400 });
  const cfg = { ...(await cfgLer(true)) }, L = (cfg.__modelos || []).filter(x => !(x.prov === prov && x.modelo === modelo));
  L.push({ prov, modelo, nome: String(nome || modelo).replace(/[<>]/g, '').slice(0, 60), preco: [pi, po], por: login || '' }); cfg.__modelos = L.slice(-60); await kvSet('robos:cfg', cfg); _cache = { em: Date.now(), v: cfg };
}
export async function modeloRemover({ prov, modelo }) {
  const cfg = { ...(await cfgLer(true)) }; cfg.__modelos = (cfg.__modelos || []).filter(x => !(x.prov === prov && x.modelo === modelo));
  for (const id of Object.keys(cfg)) if (id !== '__modelos' && cfg[id]?.modelo === prov + '::' + modelo) delete cfg[id].modelo; // robôs que usavam voltam ao Claude padrão
  await kvSet('robos:cfg', cfg); _cache = { em: Date.now(), v: cfg };
}
const diaSP = (d = 0) => new Date(Date.now() - 3 * 3600e3 - d * 864e5).toISOString().slice(0, 10);
export async function listar() {
  const cfg = await cfgLer(true); let uso = {};
  try { // custo real: linhas 'ia:uso:DIA|prov|modelo|origem' dos últimos 7 dias
    const s = await db(); const dias = [0, 1, 2, 3, 4, 5, 6].map(diaSP);
    const rows = s ? await s`SELECT key, value FROM kv_store WHERE key LIKE 'ia:uso:%' AND substr(key, 8, 10) = ANY(${dias})` : [];
    for (const row of rows) { const [d, prov, modelo, ...o] = row.key.slice(7).split('|'); const rb = casa(o.join('|')); if (!rb) continue; const v = val(row.value) || {}; const mm = [...todosModelos(cfg.__modelos).values()].find(x => x.modelo === modelo || modelo.startsWith(x.modelo)), p = mm ? mm.preco : (/haiku/i.test(modelo) ? [1, 5] : /sonnet/i.test(modelo) ? [3, 15] : null); const c = p ? ((+v.in || 0) * p[0] + (+v.out || 0) * p[1] + (+v.cw || 0) * p[0] * 1.25 + (+v.cr || 0) * p[0] * 0.1) / 1e6 : 0; const u = uso[rb.id] || (uso[rb.id] = { hoje: 0, sete: 0, chamadas: 0 }); u.sete += c; u.chamadas += +v.n || 0; if (d === diaSP(0)) u.hoje += c; }
  } catch (_) {}
  const avisos = {}; for (const r of ROBOS) { try { const a = await kvGet('robos:aviso:' + r.id); if (a?.em && Date.now() - Date.parse(a.em) < 3 * 864e5) avisos[r.id] = a; } catch (_) {} }
  const linhas = ROBOS.map(r => { const c = cfgDe(r, cfg), modelo = c.modelo || r.modelo, ligado = c.ligado !== false, u = uso[r.id] || { hoje: 0, sete: 0, chamadas: 0 };
    const por = custoRun(modelo, r.tok, r.fixo || 0, cfg.__modelos) * r.exec(c);
    return { id: r.id, nome: r.nome, quando: r.quando, modelo, modelo_padrao: r.modelo, troca: r.troca, so_claude: r.soClaude || null, aviso: avisos[r.id] || null, ligado, extras: (r.extras || []).map(e => ({ ...e, valor: c[e.k] })), custo_hoje: u.hoje, custo_7d_dia: u.sete / 7, chamadas_7d: u.chamadas, estimado_dia: ligado ? por : 0, estimado_se_ligado: por, alterado_por: cfg[r.id]?.por || null, alterado_em: cfg[r.id]?.em || null }; });
  const soma = k => linhas.reduce((t, l) => t + l[k], 0);
  const modelos = [...todosModelos(cfg.__modelos).values()].map(m => ({ k: m.k, prov: m.prov, modelo: m.modelo, nome: m.nome, preco: m.preco, base: !!m.base, extra: !!m.extra }));
  const provedores = Object.entries(PROVEDORES).map(([id, p]) => ({ id, nome: p.nome, env: p.env, chave_ok: !!process.env[p.env] }));
  return { robos: linhas, modelos, provedores, total: { hoje: soma('custo_hoje'), media_7d: soma('custo_7d_dia'), estimado_dia: soma('estimado_dia'), estimado_tudo_ligado: soma('estimado_se_ligado') } };
}
