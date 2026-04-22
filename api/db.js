// api/db.js
// Base de Dados Central — Neon Postgres via HTTP (sem dependências externas)
// Usa a Neon HTTP API diretamente — funciona no Vercel sem instalar pacotes

const NEON_HEADERS = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.DATABASE_URL?.match(/:[^:@]+@/)?.[0]?.slice(1,-1) || ''}`,
  'Neon-Connection-String': process.env.DATABASE_URL || '',
});

// Query via Neon serverless HTTP endpoint
async function query(sql, params = []) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL não configurada no Vercel');

  // Parse connection string para extrair host
  // postgres://user:pass@host/db?sslmode=require
  const match = dbUrl.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^\/]+)\/([^?]+)/);
  if (!match) throw new Error('DATABASE_URL inválida');

  const [, user, password, host, database] = match;

  // Neon HTTP API endpoint
  const endpoint = `https://${host}/sql`;

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(user + ':' + password).toString('base64')}`,
      'Neon-Connection-String': dbUrl,
    },
    body: JSON.stringify({ query: sql, params }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Neon HTTP ${r.status}: ${err.substring(0,200)}`);
  }

  const data = await r.json();
  return data.rows || [];
}

// ── INICIALIZAÇÃO DAS TABELAS ─────────────────────────────────────────────────
let tablesCreated = false;
async function ensureTables() {
  if (tablesCreated) return;
  await query(`CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS campanhas (
    id TEXT PRIMARY KEY,
    nome TEXT,
    canal TEXT,
    status TEXT DEFAULT 'rascunho',
    data JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS kpis_diarios (
    data DATE PRIMARY KEY,
    contatos INT DEFAULT 0,
    respostas INT DEFAULT 0,
    reunioes_marcadas INT DEFAULT 0,
    reunioes_feitas INT DEFAULT 0,
    propostas INT DEFAULT 0,
    fechamentos INT DEFAULT 0,
    obs TEXT,
    salvo_em TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    nome TEXT, empresa TEXT, cargo TEXT, setor TEXT, score TEXT,
    data JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS ideias (
    id TEXT PRIMARY KEY,
    titulo TEXT, status TEXT DEFAULT 'Recebida',
    data JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`);
  tablesCreated = true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureTables();
    const { action, key, value } = req.body || {};

    // ── STATUS ────────────────────────────────────────────────────────────────
    if (action === 'status' || req.method === 'GET') {
      const rows = await query('SELECT NOW() as ts');
      return res.status(200).json({ success: true, db: 'Neon Postgres', ts: rows[0]?.ts });
    }

    // ── KV GENÉRICO ───────────────────────────────────────────────────────────
    if (action === 'get') {
      const rows = await query('SELECT value FROM kv_store WHERE key = $1', [key]);
      return res.status(200).json({ success: true, key, value: rows[0]?.value ?? null });
    }

    if (action === 'set') {
      await query(
        `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
      return res.status(200).json({ success: true, key });
    }

    if (action === 'delete' || action === 'del') {
      await query('DELETE FROM kv_store WHERE key = $1', [key]);
      return res.status(200).json({ success: true });
    }

    // ── CAMPANHAS ─────────────────────────────────────────────────────────────
    if (action === 'save_campanha') {
      const camp = value;
      if (!camp?.id) return res.status(400).json({ error: 'id obrigatório' });
      await query(
        `INSERT INTO campanhas (id, nome, canal, status, data, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (id) DO UPDATE SET nome=$2, canal=$3, status=$4, data=$5, atualizado_em=NOW()`,
        [camp.id, camp.nome||'', camp.canal||'', camp.status||'rascunho', JSON.stringify(camp)]
      );
      return res.status(200).json({ success: true, id: camp.id });
    }

    if (action === 'list_campanhas') {
      const rows = await query('SELECT data FROM campanhas ORDER BY atualizado_em DESC');
      return res.status(200).json({ success: true, campanhas: rows.map(r => r.data) });
    }

    if (action === 'delete_campanha') {
      await query('DELETE FROM campanhas WHERE id = $1', [key]);
      return res.status(200).json({ success: true });
    }

    // ── KPIs ──────────────────────────────────────────────────────────────────
    if (action === 'save_kpi') {
      const k = value;
      if (!k?.data) return res.status(400).json({ error: 'data obrigatória' });
      await query(
        `INSERT INTO kpis_diarios (data,contatos,respostas,reunioes_marcadas,reunioes_feitas,propostas,fechamentos,obs,salvo_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (data) DO UPDATE SET contatos=$2,respostas=$3,reunioes_marcadas=$4,reunioes_feitas=$5,propostas=$6,fechamentos=$7,obs=$8,salvo_em=NOW()`,
        [k.data, k.contatos||0, k.respostas||0, k.reunioesMarcadas||0, k.reunioesFeitas||0, k.propostas||0, k.fechamentos||0, k.obs||'']
      );
      return res.status(200).json({ success: true });
    }

    if (action === 'list_kpis') {
      const rows = await query('SELECT * FROM kpis_diarios ORDER BY data DESC LIMIT 90');
      const registros = rows.map(r => ({
        data: typeof r.data === 'string' ? r.data : r.data?.toISOString?.()?.split('T')[0] || r.data,
        contatos: r.contatos, respostas: r.respostas,
        reunioesMarcadas: r.reunioes_marcadas, reunioesFeitas: r.reunioes_feitas,
        propostas: r.propostas, fechamentos: r.fechamentos, obs: r.obs,
      }));
      return res.status(200).json({ success: true, registros });
    }

    // ── LEADS ─────────────────────────────────────────────────────────────────
    if (action === 'save_lead') {
      const lead = value;
      if (!lead.id) lead.id = 'lead_' + Date.now();
      await query(
        `INSERT INTO leads (id,nome,empresa,cargo,setor,score,data)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET nome=$2,empresa=$3,score=$6,data=$7`,
        [lead.id, lead.decisor_nome||lead.nome||'', lead.empresa||'', lead.decisor_cargo||lead.cargo||'', lead.setor||'', lead.score||'B', JSON.stringify(lead)]
      );
      return res.status(200).json({ success: true, id: lead.id });
    }

    if (action === 'list_leads') {
      const rows = await query('SELECT data FROM leads ORDER BY criado_em DESC LIMIT 500');
      return res.status(200).json({ success: true, leads: rows.map(r => r.data) });
    }

    // ── IDEIAS ────────────────────────────────────────────────────────────────
    if (action === 'save_ideia') {
      const ideia = value;
      if (!ideia.id) ideia.id = 'ideia_' + Date.now();
      await query(
        `INSERT INTO ideias (id,titulo,status,data,atualizado_em)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (id) DO UPDATE SET titulo=$2,status=$3,data=$4,atualizado_em=NOW()`,
        [ideia.id, ideia.titulo||'', ideia.stage||ideia.status||'Recebida', JSON.stringify(ideia)]
      );
      return res.status(200).json({ success: true, id: ideia.id });
    }

    if (action === 'list_ideias') {
      const rows = await query('SELECT data FROM ideias ORDER BY atualizado_em DESC');
      return res.status(200).json({ success: true, ideias: rows.map(r => r.data) });
    }

    return res.status(400).json({ error: 'Ação inválida: ' + action });

  } catch (error) {
    console.error('[ERRO db]', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
