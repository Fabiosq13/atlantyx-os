// api/todo.js — v3.344 · TO-DO DA EMPRESA (Dashboard principal)
// Junta num só lugar as tarefas pendentes de quem toca a empresa — GPs, CTO, comercial e o fundador — com responsável e data:
//   • Projetos: pendências e ações do último status report de cada projeto (responsável = o informado ou o GP)
//   • Reuniões semanais: decisões com dono e prazo das reuniões dos últimos 60 dias
//   • Comercial: leads novos sem contato e propostas enviadas sem retorno há mais de 5 dias
//   • Fundador: demandas da Esteira aguardando decisão ou Mixagem
//   • Manuais: tarefas criadas aqui por qualquer pessoa
// Editar (texto, responsável, data, notas) e concluir com um clique. Nas tarefas que vêm de outro módulo a edição fica
// registrada aqui (camada própria) e NÃO altera a origem (o status report do GP, a ata, o lead) — a tela avisa.
// Guardado em kv_store (sem DDL): todo:itens (manuais), todo:overlay (edições e conclusões), todo:equipe (quem é quem).
import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';

let _sql = null;
async function getSql() {
  if (_sql) return _sql; const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL);
  await _sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`; return _sql;
}
async function kv(k, v) {
  const sql = await getSql();
  if (v === undefined) { const r = (await sql`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null; try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; } }
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v;
}
async function chamar(mod, body, ms = 20000) {
  const m = await import('./' + mod + '.js'); let out = null;
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(b) { try { out = JSON.parse(b); } catch (_) { out = { raw: b }; } return this; }, setHeader() {}, end() { return this; } };
  let tm; await Promise.race([m.default({ method: 'POST', body, query: {}, headers: {}, url: '/api/' + mod }, res), new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('demorou mais de ' + ms / 1000 + 's')), ms); })]).finally(() => clearTimeout(tm));
  if (!out || out.success === false) throw new Error(out?.error || 'sem resposta'); return out;
}

export const PAPEIS = { fundador: 'Fundador', cto: 'CTO', gp: 'Gerente de projeto', comercial: 'Comercial', outro: 'Outro' };
const K_ITENS = 'todo:itens', K_OVER = 'todo:overlay', K_EQUIPE = 'todo:equipe';
const txt = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().substring(0, n);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
const hash = s => crypto.createHash('sha1').update(String(s)).digest('hex').substring(0, 12);
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
// data em qualquer formato comum → AAAA-MM-DD (ou null)
export function dataISO(v) {
  if (!v) return null; const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/); if (m) { const y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : hoje().slice(0, 4); return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}
const FEITO = /conclu|finaliz|feito|\bok\b|fechad|resolvid|cancelad|entregue|encerrad/i;

// ── equipe: salva pelo fundador; enquanto não salva, é sugerida pelos usuários do sistema (perfil) e pelos GPs dos projetos ──
async function equipeSugerida(sessao) {
  const E = [];
  const add = (nome, papel, email) => { nome = txt(nome, 80); if (!nome) return; const n = norm(nome); if (E.some(x => norm(x.nome) === n || (email && x.email && x.email.toLowerCase() === String(email).toLowerCase()))) return; E.push({ nome, papel, email: email || '', apelidos: [] }); };
  if (sessao?.nome) add(sessao.nome, 'fundador', sessao.email);
  try { const { carregar } = await import('../lib/acesso.js'); const d = await carregar();
    for (const u of (d.usuarios || []).filter(u => u.ativo !== false)) { const pf = (d.perfis || []).find(p => p.id === u.perfil_id) || {}, pn = norm(pf.nome);
      add(u.nome || u.login, /cto|tecnolog|tecnic/.test(pn) ? 'cto' : /gp|gerent|projet|pmo/.test(pn) ? 'gp' : /comerc|vend|sdr|sales/.test(pn) ? 'comercial' : pf.admin ? 'fundador' : 'outro', u.email); } } catch (_) {}
  try { const sql = await getSql(); const G = await sql`SELECT DISTINCT gerente FROM pmo_projetos_config WHERE gerente IS NOT NULL AND gerente <> ''`; G.forEach(g => add(g.gerente, 'gp')); } catch (_) {}
  return E;
}
async function equipe(sessao) { const e = await kv(K_EQUIPE); return e?.membros?.length ? { membros: e.membros, salva: true } : { membros: await equipeSugerida(sessao), salva: false }; }
// quem é o responsável escrito na tarefa? (nome completo, primeiro nome, e-mail ou apelido)
export function casarMembro(resp, membros) {
  const r = norm(resp); if (!r) return null;
  for (const m of membros) { const cands = [m.nome, m.email, String(m.email || '').split('@')[0], ...(m.apelidos || [])].map(norm).filter(x => x && x.length >= 2);
    if (cands.some(c => r === c || (c.length >= 3 && r.includes(c)) || (r.length >= 3 && c.includes(r)))) return m;
    const pn = norm(m.nome).split(' ')[0]; if (pn.length >= 3 && r.split(/[^a-z]+/).includes(pn)) return m; }
  return null;
}
const porPapel = (membros, papel) => membros.find(m => m.papel === papel) || null;

// ── coletores ──
async function deProjetos() {
  const sql = await getSql(), out = [];
  const R = await sql`SELECT DISTINCT ON (projeto_nome) id, projeto_nome, gerente, pendencias, acoes, data_report FROM status_reports ORDER BY projeto_nome, data_report DESC, criado_em DESC`;
  for (const r of R) {
    const arr = v => Array.isArray(v) ? v : (() => { try { return JSON.parse(v || '[]'); } catch (_) { return []; } })();
    for (const p of arr(r.pendencias)) { const t = txt(p.tarefa || p.descricao, 300); if (!t || FEITO.test(p.status || '')) continue;
      out.push({ id: 'pmo:' + hash(r.projeto_nome + '|' + norm(t)), origem: 'projetos', texto: t, responsavel: txt(p.responsavel || r.gerente, 80), data: dataISO(p.data_conclusao) || null,
        contexto: `${r.projeto_nome} · pendência do status report de ${String(r.data_report || '').slice(0, 10).split('-').reverse().join('/')}${p.status ? ' · ' + txt(p.status, 40) : ''}${p.observacoes ? ' · ' + txt(p.observacoes, 120) : ''}`, tela: 's9status' }); }
    for (const a of arr(r.acoes)) { const t = txt(a.acao || a.descricao, 300); if (!t || FEITO.test(a.status || '')) continue;
      out.push({ id: 'pmo:' + hash(r.projeto_nome + '|a|' + norm(t)), origem: 'projetos', texto: t, responsavel: txt(a.responsavel || r.gerente, 80), data: dataISO(a.prazo), contexto: `${r.projeto_nome} · ação do status report`, tela: 's9status' }); }
  }
  return out;
}
async function deReunioes() {
  const sql = await getSql(), desde = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), out = [], vistos = new Set();
  const R = await sql`SELECT u.id, u.data, u.assuntos, r.nome FROM reu_reunioes u JOIN reu_ritos r ON r.id = u.rito_id WHERE u.data >= ${desde} ORDER BY u.data DESC LIMIT 60`;
  for (const u of R) for (const a of (Array.isArray(u.assuntos) ? u.assuntos : [])) {
    if (a.status !== 'tratado' || !String(a.dono || '').trim() || !String(a.decisao || a.titulo || '').trim()) continue;
    if (/^a[cç][aã]o:/i.test(a.titulo || '') && /\b(feito|conclu|ok)\b/i.test(a.decisao || '')) continue; // acompanhamento já fechado
    const t = txt(a.decisao || a.titulo, 300), id = 'reu:' + hash(norm(t) + '|' + norm(a.dono)); if (vistos.has(id)) continue; vistos.add(id);
    out.push({ id, origem: 'reunioes', texto: t, responsavel: txt(a.dono, 80), data: dataISO(a.prazo), contexto: `${u.nome} de ${String(u.data).split('-').reverse().join('/')} · ${txt(a.titulo, 120)}`, tela: 's0ritos' });
  }
  return out;
}
async function doComercial(membros) {
  const sql = await getSql(), out = [], com = porPapel(membros, 'comercial') || porPapel(membros, 'fundador'), quem = com?.nome || 'Comercial';
  const ehTeste = x => /\bteste?s?\d*\b|\btest\b/i.test([x.nome, x.empresa, x.cargo].join(' ')) || /@(atlanteam|atlantyx)\./i.test(String(x.email || ''));
  try { const L = await sql`SELECT id, nome, empresa, cargo, email, telefone, campanha, criado_em FROM leads WHERE status = 'novo' AND criado_em >= NOW() - INTERVAL '30 days' ORDER BY criado_em DESC LIMIT 40`;
    for (const l of L.filter(x => !ehTeste(x))) { const d = new Date(l.criado_em); const prazo = new Date(d.getTime() + 864e5).toISOString().slice(0, 10);
      out.push({ id: 'lead:' + l.id, origem: 'comercial', texto: `Responder o lead ${txt(l.nome, 60) || '(sem nome)'}${l.empresa ? ' — ' + txt(l.empresa, 60) : ''}`, responsavel: quem, data: prazo,
        contexto: `Lead novo de ${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${l.campanha ? ' · campanha ' + txt(l.campanha, 40) : ''}${l.telefone ? ' · ' + txt(l.telefone, 20) : ''}${l.email ? ' · ' + txt(l.email, 60) : ''}`, tela: 'dash:mkt' }); } } catch (_) {}
  try { const P = await sql`SELECT id, numero, cliente, titulo, status, enviada_em, valor_total FROM propostas WHERE status IN ('enviada','negociacao') AND COALESCE(enviada_em, atualizado_em) <= NOW() - INTERVAL '5 days' ORDER BY enviada_em NULLS LAST LIMIT 30`;
    for (const p of P) { const env = p.enviada_em ? new Date(p.enviada_em) : null;
      out.push({ id: 'prop:' + p.id, origem: 'comercial', texto: `Follow-up da proposta ${p.numero ? p.numero + ' ' : ''}— ${txt(p.cliente, 60)}${p.titulo ? ' (' + txt(p.titulo, 60) + ')' : ''}`, responsavel: quem, data: hoje(),
        contexto: `${p.status === 'negociacao' ? 'Em negociação' : 'Enviada'}${env ? ' em ' + env.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''}${p.valor_total ? ' · R$ ' + Math.round(+p.valor_total).toLocaleString('pt-BR') : ''}`, tela: 's7propostas' }); } } catch (_) {}
  return out;
}
async function daEsteira(membros) {
  const fu = porPapel(membros, 'fundador')?.nome || 'Fundador', out = [];
  const r = await chamar('agente-ideias', { action: 'listar' }); const D = (r.demandas || []).filter(d => d.squad !== 'qa');
  for (const d of D.filter(d => d.status === 'em_execucao' && d.dados?.pr?.estado === 'open' && !d.dados?.merge_pedido_em).slice(0, 6))
    out.push({ id: 'est:mix:' + d.id, origem: 'esteira', texto: `Mixagem: aprovar e mesclar "${txt(d.titulo, 120)}"`, responsavel: fu, data: null, contexto: `PR #${d.dados?.pr?.numero || '?'} pronto na Esteira de Demandas`, tela: 's0demandas' });
  for (const d of D.filter(d => d.status === 'sugerida').sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0)).slice(0, 6))
    out.push({ id: 'est:sug:' + d.id, origem: 'esteira', texto: `Aprovar ou recusar a demanda "${txt(d.titulo, 120)}"`, responsavel: fu, data: null, contexto: 'Sugerida na Esteira de Demandas', tela: 's0demandas' });
  return out;
}

export const ORIGENS = { manual: 'Criada aqui', projetos: 'Projetos (status report)', reunioes: 'Reuniões semanais', comercial: 'Comercial (leads e propostas)', esteira: 'Esteira de Demandas' };
async function listar(sessao, { incluir_concluidas = true } = {}) {
  const EQ = await equipe(sessao), M = EQ.membros, erros = {};
  const tempo = (p, ms = 22000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('demorou')), ms))]);
  const fontes = { projetos: deProjetos(), reunioes: deReunioes(), comercial: doComercial(M), esteira: daEsteira(M) };
  const col = []; await Promise.all(Object.entries(fontes).map(async ([k, p]) => { try { col.push(...await tempo(p)); } catch (e) { erros[k] = String(e.message || e).substring(0, 160); } }));
  const [man, ov] = await Promise.all([kv(K_ITENS), kv(K_OVER)]); const O = ov || {};
  const itens = [...col.map(x => { const o = O[x.id] || {}; return { ...x, original: { texto: x.texto, responsavel: x.responsavel, data: x.data }, texto: o.texto ?? x.texto, responsavel: o.responsavel ?? x.responsavel, data: o.data !== undefined ? o.data : x.data,
      notas: o.notas || '', concluido: !!o.concluido, concluido_em: o.concluido_em || null, concluido_por: o.concluido_por || null, oculto: !!o.oculto, editado: ['texto', 'responsavel', 'data'].some(k => o[k] !== undefined) }; }),
    ...(man || []).map(x => ({ ...x, origem: 'manual', tela: null }))].filter(x => !x.oculto && (incluir_concluidas || !x.concluido));
  const H = hoje();
  for (const x of itens) { const m = casarMembro(x.responsavel, M); x.papel = m?.papel || (x.responsavel ? 'outro' : null); x.membro = m?.nome || null; x.atrasada = !x.concluido && !!x.data && x.data < H; x.hoje = !x.concluido && x.data === H; }
  itens.sort((a, b) => (a.concluido - b.concluido) || ((a.data || '9999') < (b.data || '9999') ? -1 : (a.data || '9999') > (b.data || '9999') ? 1 : 0));
  const ab = itens.filter(x => !x.concluido);
  const resumo = { abertas: ab.length, atrasadas: ab.filter(x => x.atrasada).length, hoje: ab.filter(x => x.hoje).length, por_papel: Object.fromEntries(Object.keys(PAPEIS).map(p => [p, ab.filter(x => x.papel === p).length])),
    sem_responsavel: ab.filter(x => !x.responsavel).length };
  return { itens, resumo, equipe: M, equipe_salva: EQ.salva, papeis: PAPEIS, origens: ORIGENS, erros, em: new Date().toISOString() };
}
async function salvar({ id, texto, responsavel, data, notas, concluido }, usuario) {
  if (!id) throw Object.assign(new Error('id obrigatório'), { status: 400 });
  const agora = new Date().toISOString(), patch = {};
  if (texto !== undefined) { if (!String(texto).trim()) throw Object.assign(new Error('A tarefa não pode ficar sem texto'), { status: 400 }); patch.texto = txt(texto, 300); }
  if (responsavel !== undefined) patch.responsavel = txt(responsavel, 80);
  if (data !== undefined) patch.data = data ? dataISO(data) : null;
  if (notas !== undefined) patch.notas = String(notas || '').substring(0, 1500);
  if (concluido !== undefined) Object.assign(patch, { concluido: !!concluido, concluido_em: concluido ? agora : null, concluido_por: concluido ? (usuario || null) : null });
  if (String(id).startsWith('m_')) {
    const L = (await kv(K_ITENS)) || [], x = L.find(i => i.id === id); if (!x) throw Object.assign(new Error('Tarefa não encontrada'), { status: 404 });
    Object.assign(x, patch, { atualizado_em: agora, atualizado_por: usuario || null }); await kv(K_ITENS, L); return { ok: true, item: x };
  }
  const O = (await kv(K_OVER)) || {}; O[id] = { ...(O[id] || {}), ...patch, em: agora, por: usuario || null };
  // limpeza: conclusões com mais de 120 dias saem da camada
  const lim = Date.now() - 120 * 864e5; for (const [k, v] of Object.entries(O)) if (v.concluido && Date.parse(v.concluido_em || v.em) < lim) delete O[k];
  await kv(K_OVER, O); return { ok: true };
}
async function criar({ texto, responsavel, data, notas }, usuario) {
  if (!String(texto || '').trim()) throw Object.assign(new Error('Escreva a tarefa'), { status: 400 });
  const L = (await kv(K_ITENS)) || [];
  const x = { id: 'm_' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), texto: txt(texto, 300), responsavel: txt(responsavel, 80), data: dataISO(data), notas: String(notas || '').substring(0, 1500),
    concluido: false, criado_em: new Date().toISOString(), criado_por: usuario || null, contexto: 'Criada no To-do' + (usuario ? ' por ' + usuario : '') };
  L.unshift(x); await kv(K_ITENS, L.slice(0, 500)); return { ok: true, item: x };
}
async function excluir({ id }, usuario) {
  if (String(id).startsWith('m_')) { const L = (await kv(K_ITENS)) || []; await kv(K_ITENS, L.filter(i => i.id !== id)); return { ok: true }; }
  const O = (await kv(K_OVER)) || {}; O[id] = { ...(O[id] || {}), oculto: true, em: new Date().toISOString(), por: usuario || null }; await kv(K_OVER, O); return { ok: true, oculto: true };
}
async function equipeSalvar({ membros }, sessao) {
  if (sessao && !sessao.admin && !sessao.perfil?.admin) throw Object.assign(new Error('Só o administrador define a equipe do To-do'), { status: 403 });
  const L = (Array.isArray(membros) ? membros : []).map(m => ({ nome: txt(m.nome, 80), papel: PAPEIS[m.papel] ? m.papel : 'outro', email: txt(m.email, 120),
    apelidos: (Array.isArray(m.apelidos) ? m.apelidos : String(m.apelidos || '').split(',')).map(a => txt(a, 40)).filter(Boolean).slice(0, 6) })).filter(m => m.nome).slice(0, 40);
  await kv(K_EQUIPE, { membros: L, em: new Date().toISOString(), por: sessao?.login || null }); return { ok: true, equipe: L };
}

async function handler(req, res) {
  try {
    const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {}, usuario = req.sessao?.login || req.usuario || null;
    const A = { listar: () => listar(req.sessao, b), salvar: () => salvar(b, usuario), criar: () => criar(b, usuario), excluir: () => excluir(b, usuario), equipe_salvar: () => equipeSalvar(b, req.sessao) };
    if (!A[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await A[b.action]()) });
  } catch (e) { console.error('[todo]', e.message); return res.status(e.status || 500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'todo');
