// api/db.js
// Base de Dados Central — Neon Postgres
// Usa @neondatabase/serverless que é instalado automaticamente pelo Vercel

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    return res.status(503).json({ success: false, error: 'DATABASE_URL não configurada', dica: 'Verifique a conexão Neon no Vercel Storage' });
  }

  // Importar neon dinamicamente (instalado pelo Vercel via package.json)
  let sql;
  try {
    const { neon } = await import('@neondatabase/serverless');
    sql = neon(DATABASE_URL);
  } catch(e) {
    return res.status(503).json({ success: false, error: 'Driver Neon não disponível: ' + e.message, dica: 'Verifique o package.json do projeto' });
  }

  try {
    // Criar tabelas se não existirem
    await sql`CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS campanhas (
      id TEXT PRIMARY KEY,
      nome TEXT, canal TEXT, status TEXT DEFAULT 'rascunho',
      data JSONB,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )`;
    // Migração: adiciona colunas novas se não existirem (idempotente)
    await sql`ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS data_inicio DATE`;
    await sql`ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS data_fim DATE`;
    await sql`ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS ativa BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS redes_ativas JSONB DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS historico_status JSONB DEFAULT '[]'::jsonb`;
    await sql`CREATE INDEX IF NOT EXISTS idx_camp_periodo ON campanhas(data_inicio, data_fim) WHERE ativa = true`;
    await sql`CREATE TABLE IF NOT EXISTS kpis_diarios (
      data DATE PRIMARY KEY,
      contatos INT DEFAULT 0, respostas INT DEFAULT 0,
      reunioes_marcadas INT DEFAULT 0, reunioes_feitas INT DEFAULT 0,
      propostas INT DEFAULT 0, fechamentos INT DEFAULT 0,
      obs TEXT, salvo_em TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      nome TEXT, empresa TEXT, cargo TEXT, setor TEXT, score TEXT,
      data JSONB, criado_em TIMESTAMPTZ DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS ideias (
      id TEXT PRIMARY KEY,
      titulo TEXT, status TEXT DEFAULT 'Recebida',
      data JSONB,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`CREATE TABLE IF NOT EXISTS squad_registros (
    id TEXT PRIMARY KEY,
    squad TEXT NOT NULL,
    tipo TEXT,
    titulo TEXT,
    cliente TEXT,
    data JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS s13_projetos (
    id TEXT PRIMARY KEY,
    cliente TEXT,
    nome TEXT,
    tecnologia TEXT,
    banco TEXT,
    status TEXT DEFAULT 'rascunho',
    data JSONB,
    salvo_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;

    const { action, key, value } = req.body || {};

    // STATUS
    // v1.9.8: JSONB rejeita \u0000 e surrogates soltos (emoji partido) → saneia qualquer JSON antes de gravar
    const jsonSeguro = (obj) => {
      let s = JSON.stringify(obj);
      if (typeof s.toWellFormed === 'function') s = s.toWellFormed();
      else s = s.replace(/[\ud800-\udbff](?![\udc00-\udfff])/g, '\ufffd').replace(/(^|[^\ud800-\udbff])[\udc00-\udfff]/g, '$1\ufffd');
      return s.replace(/\\u0000/g, '').replace(/\u0000/g, '');
    };
    if (action === 'status' || req.method === 'GET') {
      const r = await sql`SELECT NOW() as ts`;
      return res.status(200).json({ success: true, db: 'Neon Postgres', ts: r[0].ts });
    }

    // KV GENÉRICO
    if (action === 'get') {
      const r = await sql`SELECT value FROM kv_store WHERE key = ${key}`;
      return res.status(200).json({ success: true, key, value: r[0]?.value ?? null });
    }
    if (action === 'set') {
      // v1.9.8: saneia o valor (kanban etc.)
      await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${jsonSeguro(value)}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
      return res.status(200).json({ success: true, key });
    }
    if (action === 'delete' || action === 'del') {
      await sql`DELETE FROM kv_store WHERE key = ${key}`;
      return res.status(200).json({ success: true });
    }

    // CAMPANHAS
    if (action === 'save_campanha') {
      const camp = value;
      if (!camp?.id) return res.status(400).json({ error: 'id obrigatório' });
      const dataJson = jsonSeguro(camp);
      if (dataJson.length > 6 * 1024 * 1024) return res.status(413).json({ success: false, error: 'campanha muito grande (' + (dataJson.length/1048576).toFixed(1) + ' MB) — remova imagens/base64 do objeto' });
      const okDate = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : null;
      const dataInicio = okDate(camp.data_inicio);
      const dataFim    = okDate(camp.data_fim);
      const ativa      = !!camp.ativa;
      const redesAtivas = camp.redes_ativas || {};
      await sql`INSERT INTO campanhas (id, nome, canal, status, data, data_inicio, data_fim, ativa, redes_ativas, atualizado_em)
        VALUES (${camp.id}, ${camp.nome||''}, ${camp.canal||''}, ${camp.status||'rascunho'},
                ${dataJson}::jsonb, ${dataInicio || null}, ${dataFim || null}, ${ativa},
                ${jsonSeguro(redesAtivas)}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, canal=EXCLUDED.canal,
          status=EXCLUDED.status, data=EXCLUDED.data,
          data_inicio=EXCLUDED.data_inicio, data_fim=EXCLUDED.data_fim,
          ativa=EXCLUDED.ativa, redes_ativas=EXCLUDED.redes_ativas,
          atualizado_em=NOW()`;
      return res.status(200).json({ success: true, id: camp.id });
    }
    if (action === 'list_campanhas') {
      const r = await sql`SELECT data, data_inicio, data_fim, ativa, redes_ativas, atualizado_em
        FROM campanhas ORDER BY atualizado_em DESC`;
      return res.status(200).json({ success: true, campanhas: r.map(x => Object.assign({}, x.data || {}, {
        data_inicio: x.data_inicio ? String(x.data_inicio).split('T')[0] : null,
        data_fim: x.data_fim ? String(x.data_fim).split('T')[0] : null,
        ativa: x.ativa,
        redes_ativas: x.redes_ativas || {},
        atualizado_em: x.atualizado_em,
      })) });
    }
    if (action === 'delete_campanha') {
      await sql`DELETE FROM campanhas WHERE id = ${key}`;
      return res.status(200).json({ success: true });
    }
    // Liga/desliga campanha mantendo histórico
    if (action === 'toggle_campanha') {
      if (!key) return res.status(400).json({ error: 'id (key) obrigatório' });
      const novoAtiva = !!(value?.ativa);
      const motivo = value?.motivo || (novoAtiva ? 'ativada' : 'pausada');
      const ts = new Date().toISOString();
      await sql`UPDATE campanhas
        SET ativa = ${novoAtiva},
            status = ${novoAtiva ? 'ativa' : 'pausada'},
            historico_status = COALESCE(historico_status, '[]'::jsonb) ||
              ${JSON.stringify([{ data: ts, ativa: novoAtiva, motivo }])}::jsonb,
            atualizado_em = NOW()
        WHERE id = ${key}`;
      return res.status(200).json({ success: true, id: key, ativa: novoAtiva });
    }
    // Atualiza apenas período de uma campanha (sem reprocessar tudo)
    if (action === 'update_periodo_campanha') {
      if (!key) return res.status(400).json({ error: 'id (key) obrigatório' });
      const di = value?.data_inicio || null;
      const df = value?.data_fim    || null;
      await sql`UPDATE campanhas SET data_inicio=${di}, data_fim=${df}, atualizado_em=NOW() WHERE id=${key}`;
      return res.status(200).json({ success: true, id: key, data_inicio: di, data_fim: df });
    }
    // Atualiza apenas redes ativas
    if (action === 'update_redes_campanha') {
      if (!key) return res.status(400).json({ error: 'id (key) obrigatório' });
      const redes = value?.redes_ativas || {};
      await sql`UPDATE campanhas SET redes_ativas=${JSON.stringify(redes)}::jsonb, atualizado_em=NOW() WHERE id=${key}`;
      return res.status(200).json({ success: true, id: key, redes_ativas: redes });
    }
    // Listar campanhas que estão ativas em uma data (para calendário)
    if (action === 'list_campanhas_calendario') {
      const di = value?.data_inicio || new Date().toISOString().split('T')[0];
      const df = value?.data_fim    || new Date(Date.now() + 90*86400*1000).toISOString().split('T')[0];
      const r = await sql`SELECT id, nome, canal, status, data_inicio, data_fim, ativa, redes_ativas, data
        FROM campanhas
        WHERE (data_inicio IS NULL OR data_inicio <= ${df})
          AND (data_fim IS NULL OR data_fim >= ${di})
        ORDER BY data_inicio ASC NULLS LAST`;
      return res.status(200).json({ success: true, campanhas: r.map(x => ({
        id: x.id, nome: x.nome, canal: x.canal, status: x.status,
        data_inicio: x.data_inicio ? String(x.data_inicio).split('T')[0] : null,
        data_fim: x.data_fim ? String(x.data_fim).split('T')[0] : null,
        ativa: x.ativa,
        redes_ativas: x.redes_ativas || {},
        meta: x.data || {},
      })) });
    }

    // KPIs
    if (action === 'save_kpi') {
      const k = value;
      if (!k?.data) return res.status(400).json({ error: 'data obrigatória' });
      await sql`INSERT INTO kpis_diarios (data,contatos,respostas,reunioes_marcadas,reunioes_feitas,propostas,fechamentos,obs,salvo_em)
        VALUES (${k.data},${k.contatos||0},${k.respostas||0},${k.reunioesMarcadas||0},${k.reunioesFeitas||0},${k.propostas||0},${k.fechamentos||0},${k.obs||''},NOW())
        ON CONFLICT (data) DO UPDATE SET contatos=EXCLUDED.contatos, respostas=EXCLUDED.respostas,
          reunioes_marcadas=EXCLUDED.reunioes_marcadas, reunioes_feitas=EXCLUDED.reunioes_feitas,
          propostas=EXCLUDED.propostas, fechamentos=EXCLUDED.fechamentos, obs=EXCLUDED.obs, salvo_em=NOW()`;
      return res.status(200).json({ success: true });
    }
    if (action === 'list_kpis') {
      const r = await sql`SELECT * FROM kpis_diarios ORDER BY data DESC LIMIT 90`;
      return res.status(200).json({ success: true, registros: r.map(x => ({
        data: String(x.data).split('T')[0],
        contatos: x.contatos, respostas: x.respostas,
        reunioesMarcadas: x.reunioes_marcadas, reunioesFeitas: x.reunioes_feitas,
        propostas: x.propostas, fechamentos: x.fechamentos, obs: x.obs,
      }))});
    }

    // LEADS
    if (action === 'save_lead') {
      const lead = value;
      if (!lead.id) lead.id = 'lead_' + Date.now();
      await sql`INSERT INTO leads (id,nome,empresa,cargo,setor,score,data)
        VALUES (${lead.id},${lead.decisor_nome||lead.nome||''},${lead.empresa||''},${lead.decisor_cargo||lead.cargo||''},${lead.setor||''},${lead.score||'B'},${JSON.stringify(lead)})
        ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, empresa=EXCLUDED.empresa, score=EXCLUDED.score, data=EXCLUDED.data`;
      return res.status(200).json({ success: true, id: lead.id });
    }
    if (action === 'list_leads') {
      const r = await sql`SELECT data FROM leads ORDER BY criado_em DESC LIMIT 500`;
      return res.status(200).json({ success: true, leads: r.map(x => x.data) });
    }

    // IDEIAS
    if (action === 'save_ideia') {
      const ideia = value;
      if (!ideia.id) ideia.id = 'ideia_' + Date.now();
      await sql`INSERT INTO ideias (id,titulo,status,data,atualizado_em)
        VALUES (${ideia.id},${ideia.titulo||''},${ideia.stage||ideia.status||'Recebida'},${JSON.stringify(ideia)},NOW())
        ON CONFLICT (id) DO UPDATE SET titulo=EXCLUDED.titulo, status=EXCLUDED.status, data=EXCLUDED.data, atualizado_em=NOW()`;
      return res.status(200).json({ success: true, id: ideia.id });
    }
    if (action === 'list_ideias') {
      const r = await sql`SELECT data FROM ideias ORDER BY atualizado_em DESC`;
      return res.status(200).json({ success: true, ideias: r.map(x => x.data) });
    }

    // ── S13 DASHBOARD PROJETOS ──────────────────────────────────────────────────
    if (action === 'save_s13projeto') {
      const proj = value;
      if (!proj?.id) return res.status(400).json({ error: 'id obrigatório' });
      await sql`INSERT INTO s13_projetos (id, cliente, nome, tecnologia, banco, status, data, salvo_em, atualizado_em)
        VALUES (${proj.id}, ${proj.cliente||''}, ${proj.nome||''}, ${proj.tecnologia||''}, ${proj.banco||''}, ${proj.status||'rascunho'}, ${JSON.stringify(proj)}, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET cliente=EXCLUDED.cliente, nome=EXCLUDED.nome, tecnologia=EXCLUDED.tecnologia,
          banco=EXCLUDED.banco, status=EXCLUDED.status, data=EXCLUDED.data, atualizado_em=NOW()`;
      return res.status(200).json({ success: true, id: proj.id });
    }
    if (action === 'list_s13projetos') {
      const rows = await sql`SELECT data FROM s13_projetos ORDER BY atualizado_em DESC`;
      return res.status(200).json({ success: true, projetos: rows.map(r => r.data) });
    }
    if (action === 'get_s13projeto') {
      const rows = await sql`SELECT data FROM s13_projetos WHERE id = ${key}`;
      return res.status(200).json({ success: true, value: rows[0]?.data ?? null });
    }
    if (action === 'delete_s13projeto') {
      await sql`DELETE FROM s13_projetos WHERE id = ${key}`;
      return res.status(200).json({ success: true });
    }

        // ── SQUAD REGISTROS GENÉRICOS (S4-S12) ──────────────────────────────────
    if (action === 'save_squad_registro') {
      const reg = value;
      if (!reg.id) reg.id = 'reg_' + Date.now();
      await sql`INSERT INTO squad_registros (id, squad, tipo, titulo, cliente, data, atualizado_em)
        VALUES (${reg.id}, ${reg.squad||'geral'}, ${reg.tipo||''}, ${reg.titulo||''}, ${reg.cliente||''}, ${JSON.stringify(reg)}, NOW())
        ON CONFLICT (id) DO UPDATE SET tipo=EXCLUDED.tipo, titulo=EXCLUDED.titulo,
          cliente=EXCLUDED.cliente, data=EXCLUDED.data, atualizado_em=NOW()`;
      return res.status(200).json({ success: true, id: reg.id });
    }
    if (action === 'list_squad_registros') {
      const rows = await sql`SELECT data FROM squad_registros WHERE squad = ${key} ORDER BY atualizado_em DESC LIMIT 100`;
      return res.status(200).json({ success: true, registros: rows.map(r => r.data) });
    }
    if (action === 'delete_squad_registro') {
      await sql`DELETE FROM squad_registros WHERE id = ${key}`;
      return res.status(200).json({ success: true });
    }

    // ═══ v1.21: GERENTE DE MARKETING IA (chat com contexto real: campanhas, funil, leads) ═══
    if (action === 'gerente_marketing') {
      const { mensagem, historico = [] } = value || {};
      if (!mensagem) return res.status(400).json({ success: false, error: 'mensagem obrigatória' });
      const [campRows, kpiRows, leadRows] = await Promise.all([
        sql`SELECT nome, canal, status, ativa, data_inicio, data_fim FROM campanhas ORDER BY atualizado_em DESC LIMIT 20`,
        sql`SELECT * FROM kpis_diarios ORDER BY data DESC LIMIT 14`,
        sql`SELECT score, empresa, criado_em FROM leads ORDER BY criado_em DESC LIMIT 100`,
      ]);
      const funilTotais = kpiRows.reduce((s, k) => ({ contatos: s.contatos + (k.contatos||0), respostas: s.respostas + (k.respostas||0), reunioes_marcadas: s.reunioes_marcadas + (k.reunioes_marcadas||0), reunioes_feitas: s.reunioes_feitas + (k.reunioes_feitas||0), propostas: s.propostas + (k.propostas||0), fechamentos: s.fechamentos + (k.fechamentos||0) }), { contatos:0, respostas:0, reunioes_marcadas:0, reunioes_feitas:0, propostas:0, fechamentos:0 });
      const leadsPorScore = {}; leadRows.forEach(l => { leadsPorScore[l.score || 'sem score'] = (leadsPorScore[l.score || 'sem score'] || 0) + 1; });
      const ctx = {
        campanhas: { total: campRows.length, ativas: campRows.filter(c => c.ativa).length, por_canal: campRows.reduce((a,c) => { a[c.canal||'?'] = (a[c.canal||'?']||0)+1; return a; }, {}), lista: campRows.slice(0,10).map(c => ({ nome: c.nome, canal: c.canal, status: c.status, ativa: c.ativa })) },
        funil_ultimos_14_dias: funilTotais,
        leads_ultimos_100: { total: leadRows.length, por_score: leadsPorScore },
      };
      const system = `Você é o GERENTE DE MARKETING IA da Atlantyx — direto, prático, português do Brasil. Dados REAIS abaixo (campanhas, funil de vendas dos últimos 14 dias, leads recentes). Responda com os dados quando existirem; se faltar dado, diga; ajude a pensar em estratégia (quais campanhas priorizar, gargalos do funil, qualidade dos leads); seja conciso (~200 palavras salvo pedido de detalhe); nunca invente número.\n\nCONTEXTO (JSON):\n${JSON.stringify(ctx).substring(0,8000)}`;
      const msgs = [...historico.slice(-10).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content||'').substring(0,2000) })), { role: 'user', content: String(mensagem).substring(0,3000) }];
      if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ success: false, error: 'ANTHROPIC_API_KEY não configurada' });
      const rr = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' }, body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 1400, system, messages: msgs }) });
      const dd = await rr.json().catch(() => ({}));
      if (!rr.ok) return res.status(400).json({ success: false, error: 'Claude API [' + rr.status + ']: ' + (dd.error?.message || 'erro') });
      return res.status(200).json({ success: true, resposta: dd.content?.[0]?.text || '', contexto_resumo: { campanhas_ativas: ctx.campanhas.ativas, leads: ctx.leads_ultimos_100.total } });
    }

        return res.status(400).json({ error: 'Ação inválida: ' + action });

  } catch (error) {
    console.error('[ERRO db]', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
