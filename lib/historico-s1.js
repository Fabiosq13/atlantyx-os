// lib/historico-s1.js — v3.90 · Histórico do planejamento estratégico (S1)
// Cada análise gerada pela IA nas telas de planejamento (diagnóstico, plano estratégico, plano de ação 90d,
// cenários, riscos, mercado, financeiro, OKRs, relatório executivo…) é guardada aqui, com data e autor,
// para poder ser reaberta depois na própria tela (botão "🕘 Histórico").
let _sql = null, _ok = false;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  if (!_ok) {
    await _sql`CREATE TABLE IF NOT EXISTS s1_historico (id BIGSERIAL PRIMARY KEY, tipo TEXT NOT NULL, resumo TEXT, dados JSONB, criado_por TEXT, criado_em TIMESTAMPTZ DEFAULT NOW())`;
    await _sql`CREATE INDEX IF NOT EXISTS s1_historico_tipo ON s1_historico (tipo, criado_em DESC)`;
    _ok = true;
  }
  return _sql;
}
const MAX_POR_TIPO = 60;
// tipos consultados a cada abertura de tela: uma versão a cada 12h (as outras atualizam a última)
const AGRUPA_12H = new Set(['status_okr']);

function resumoDe(tipo, r) {
  const o = r && typeof r === 'object' ? (Object.values(r).find(v => v && typeof v === 'object') || r) : {};
  const t = o.headline || o.titulo || o.resumo_executivo || o.visao || o.nivel_risco_geral || o.saude_geral || o.momento || o.periodo || '';
  return String(t || '').replace(/\s+/g, ' ').substring(0, 180);
}

export async function salvarHistorico(tipo, resultado, usuario) {
  try {
    const sql = await db(); if (!sql || !resultado) return null;
    const dados = JSON.stringify(resultado), resumo = resumoDe(tipo, resultado);
    if (AGRUPA_12H.has(tipo)) {
      const [u] = await sql`SELECT id FROM s1_historico WHERE tipo = ${tipo} AND criado_em > NOW() - INTERVAL '12 hours' ORDER BY criado_em DESC LIMIT 1`;
      if (u) { await sql`UPDATE s1_historico SET dados = ${dados}, resumo = ${resumo}, criado_em = NOW() WHERE id = ${u.id}`; return u.id; }
    }
    const [n] = await sql`INSERT INTO s1_historico (tipo, resumo, dados, criado_por) VALUES (${tipo}, ${resumo}, ${dados}, ${usuario || null}) RETURNING id`;
    await sql`DELETE FROM s1_historico WHERE tipo = ${tipo} AND id NOT IN (SELECT id FROM s1_historico WHERE tipo = ${tipo} ORDER BY criado_em DESC LIMIT ${MAX_POR_TIPO})`;
    return n?.id || null;
  } catch (e) { console.warn('[historico-s1] não gravou:', e.message); return null; }
}

export async function listarHistorico(tipos, limite = 30) {
  const sql = await db(); if (!sql) return [];
  const lista = (Array.isArray(tipos) ? tipos : [tipos]).filter(Boolean).map(String);
  return sql`SELECT id, tipo, resumo, criado_por, criado_em FROM s1_historico WHERE tipo = ANY(${lista}) ORDER BY criado_em DESC LIMIT ${Math.min(+limite || 30, 100)}`;
}

export async function obterHistorico(id) {
  const sql = await db(); if (!sql) return null;
  const [r] = await sql`SELECT id, tipo, resumo, dados, criado_por, criado_em FROM s1_historico WHERE id = ${id} LIMIT 1`;
  if (r && typeof r.dados === 'string') { try { r.dados = JSON.parse(r.dados); } catch (_) {} }
  return r || null;
}
