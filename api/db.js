// api/db.js
// Base de Dados Central — Neon Postgres
// Tabelas: kv_store (genérico), campanhas, kpis, leads, ideias
// DATABASE_URL é injetada automaticamente pelo Vercel via conexão Neon

import { neon } from '@neondatabase/serverless';

function getDB() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada — conecte o Neon ao projeto no Vercel');
  return neon(url);
}

// ── INICIALIZAÇÃO DAS TABELAS (roda na primeira chamada) ──────────────────────
async function ensureTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS campanhas (
      id TEXT PRIMARY KEY,
      nome TEXT,
      canal TEXT,
      status TEXT DEFAULT 'rascunho',
      data JSONB,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS kpis_diarios (
      data DATE PRIMARY KEY,
      contatos INT DEFAULT 0,
      respostas INT DEFAULT 0,
      reunioes_marcadas INT DEFAULT 0,
      reunioes_feitas INT DEFAULT 0,
      propostas INT DEFAULT 0,
      fechamentos INT DEFAULT 0,
      obs TEXT,
      salvo_em TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      nome TEXT,
      empresa TEXT,
      cargo TEXT,
      setor TEXT,
      score TEXT,
      data JSONB,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS ideias (
      id TEXT PRIMARY KEY,
      titulo TEXT,
      status TEXT DEFAULT 'Recebida',
      data JSONB,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sql = getDB();
    await ensureTables(sql);

    const { action, key, value } = req.body || {};

    // ── KV GENÉRICO ───────────────────────────────────────────────────────────
    if (action === 'get') {
      const rows = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
      return res.status(200).json({ success: true, key, value: rows[0]?.value ?? null });
    }

    if (action === 'set') {
      await sql`
        INSERT INTO kv_store (key, value, updated_at)
        VALUES (${key}, ${JSON.stringify(value)}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
      return res.status(200).json({ success: true, key });
    }

    if (action === 'delete' || action === 'del') {
      await sql`DELETE FROM kv_store WHERE key = ${key}`;
      return res.status(200).json({ success: true, key });
    }

    // ── CAMPANHAS ─────────────────────────────────────────────────────────────
    if (action === 'save_campanha') {
      const camp = value;
      if (!camp?.id) return res.status(400).json({ error: 'id obrigatório' });
      await sql`
        INSERT INTO campanhas (id, nome, canal, status, data, atualizado_em)
        VALUES (${camp.id}, ${camp.nome||''}, ${camp.canal||''}, ${camp.status||'rascunho'}, ${JSON.stringify(camp)}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome, canal = EXCLUDED.canal,
          status = EXCLUDED.status, data = EXCLUDED.data, atualizado_em = NOW()`;
      return res.status(200).json({ success: true, id: camp.id });
    }

    if (action === 'list_campanhas') {
      const rows = await sql`SELECT data FROM campanhas ORDER BY atualizado_em DESC`;
      return res.status(200).json({ success: true, campanhas: rows.map(r => r.data) });
    }

    if (action === 'delete_campanha') {
      await sql`DELETE FROM campanhas WHERE id = ${key}`;
      return res.status(200).json({ success: true });
    }

    // ── KPIs DIÁRIOS ──────────────────────────────────────────────────────────
    if (action === 'save_kpi') {
      const k = value;
      if (!k?.data) return res.status(400).json({ error: 'data obrigatória' });
      await sql`
        INSERT INTO kpis_diarios (data, contatos, respostas, reunioes_marcadas, reunioes_feitas, propostas, fechamentos, obs, salvo_em)
        VALUES (${k.data}, ${k.contatos||0}, ${k.respostas||0}, ${k.reunioesMarcadas||0}, ${k.reunioesFeitas||0}, ${k.propostas||0}, ${k.fechamentos||0}, ${k.obs||''}, NOW())
        ON CONFLICT (data) DO UPDATE SET
          contatos = EXCLUDED.contatos, respostas = EXCLUDED.respostas,
          reunioes_marcadas = EXCLUDED.reunioes_marcadas, reunioes_feitas = EXCLUDED.reunioes_feitas,
          propostas = EXCLUDED.propostas, fechamentos = EXCLUDED.fechamentos,
          obs = EXCLUDED.obs, salvo_em = NOW()`;
      return res.status(200).json({ success: true });
    }

    if (action === 'list_kpis') {
      const rows = await sql`SELECT * FROM kpis_diarios ORDER BY data DESC LIMIT 90`;
      const registros = rows.map(r => ({
        data:               r.data.toISOString?.().split('T')[0] || r.data,
        contatos:           r.contatos,
        respostas:          r.respostas,
        reunioesMarcadas:   r.reunioes_marcadas,
        reunioesFeitas:     r.reunioes_feitas,
        propostas:          r.propostas,
        fechamentos:        r.fechamentos,
        obs:                r.obs,
        salvo_em:           r.salvo_em,
      }));
      return res.status(200).json({ success: true, registros });
    }

    // ── LEADS ─────────────────────────────────────────────────────────────────
    if (action === 'save_lead') {
      const lead = value;
      if (!lead?.id) lead.id = 'lead_' + Date.now();
      await sql`
        INSERT INTO leads (id, nome, empresa, cargo, setor, score, data)
        VALUES (${lead.id}, ${lead.decisor_nome||lead.nome||''}, ${lead.empresa||lead.nome_empresa||''}, ${lead.decisor_cargo||lead.cargo||''}, ${lead.setor||''}, ${lead.score||'B'}, ${JSON.stringify(lead)})
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome, empresa = EXCLUDED.empresa,
          score = EXCLUDED.score, data = EXCLUDED.data`;
      return res.status(200).json({ success: true, id: lead.id });
    }

    if (action === 'list_leads') {
      const rows = await sql`SELECT data FROM leads ORDER BY criado_em DESC LIMIT 500`;
      return res.status(200).json({ success: true, leads: rows.map(r => r.data) });
    }

    // ── IDEIAS ────────────────────────────────────────────────────────────────
    if (action === 'save_ideia') {
      const ideia = value;
      if (!ideia?.id) ideia.id = 'ideia_' + Date.now();
      await sql`
        INSERT INTO ideias (id, titulo, status, data, atualizado_em)
        VALUES (${ideia.id}, ${ideia.titulo||''}, ${ideia.stage||ideia.status||'Recebida'}, ${JSON.stringify(ideia)}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          titulo = EXCLUDED.titulo, status = EXCLUDED.status,
          data = EXCLUDED.data, atualizado_em = NOW()`;
      return res.status(200).json({ success: true, id: ideia.id });
    }

    if (action === 'list_ideias') {
      const rows = await sql`SELECT data FROM ideias ORDER BY atualizado_em DESC`;
      return res.status(200).json({ success: true, ideias: rows.map(r => r.data) });
    }

    // ── STATUS / HEALTH CHECK ─────────────────────────────────────────────────
    if (action === 'status' || req.method === 'GET') {
      const test = await sql`SELECT NOW() as ts`;
      return res.status(200).json({ success: true, db: 'Neon Postgres', ts: test[0].ts });
    }

    return res.status(400).json({ error: 'Ação inválida: ' + action });

  } catch (error) {
    console.error('[ERRO db]', error.message);
    // Se for erro de DATABASE_URL
    if (error.message.includes('DATABASE_URL')) {
      return res.status(503).json({ error: error.message, dica: 'Verifique a conexão Neon no Vercel Storage' });
    }
    return res.status(500).json({ error: error.message });
  }
}
