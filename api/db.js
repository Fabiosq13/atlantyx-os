import { comGuarda, origemApp } from '../lib/qa-guard.js';
// api/db.js
// Base de Dados Central — Neon Postgres
// Usa @neondatabase/serverless que é instalado automaticamente pelo Vercel

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', origemApp(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // v3.29 (SEC-002/004): chaves de credencial (tokens OAuth do QuickBooks etc.) nunca saem nem entram pelo navegador
  // v3.85: vale também para action/key enviados na query string (ex.: ?action=get&key=qb:tokens) → 403 mesmo logado
  { const b0 = { ...(req.query || {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    if (['get', 'set', 'delete', 'del'].includes(b0.action) && /^qb:|token|secret|senha|password|oauth|credencia|api[_-]?key/i.test(String(b0.key || '')))
    return res.status(403).json({ success: false, error: 'Chave protegida — credenciais não são acessíveis por esta rota.' }); }

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
      // v3.58: campanha excluída não volta — antes outra aba/navegador com cópia local re-gravava a campanha
      // ("re-sincronizada") e o rascunho apagado reaparecia
      if (!camp._restaurar) { const ex = await sql`SELECT 1 FROM kv_store WHERE key = ${'campanha_excluida:' + camp.id} LIMIT 1`;
        if (ex.length) return res.status(200).json({ success: true, id: camp.id, ignorada: 'campanha excluída' }); }
      // v1.43 (report DEV, itens 1 e 2): o canal era gravado como `camp.canal||''` sem validação —
      // campanha podia ser APROVADA e ATIVADA com canal vazio ou com lixo tipo "?".
      const CANAIS_VALIDOS = ['LinkedIn', 'Instagram', 'Facebook', 'Google Ads', 'E-mail', 'WhatsApp', 'Todos os canais', 'Todos', 'LinkedIn + Instagram']; // v3.23: 'Todos' (auto-campanha) e 'LinkedIn + Instagram' eram recusados
      const canalNorm = String(camp.canal || '').trim();
      const canalOk = CANAIS_VALIDOS.find(c => c.toLowerCase() === canalNorm.toLowerCase()) || null;
      const vaiPublicar = ['aprovada', 'ativa', 'publicada'].includes(String(camp.status || '').toLowerCase()) || camp.ativa === true;
      if (vaiPublicar && !canalOk) {
        return res.status(400).json({ success: false,
          error: `Não é possível aprovar/ativar uma campanha sem canal válido (recebido: "${canalNorm || '(vazio)'}").`,
          hint: 'Escolha um destes canais: ' + CANAIS_VALIDOS.join(', ') + '. A campanha pode ficar em rascunho sem canal, mas não pode ser aprovada assim.',
          canais_validos: CANAIS_VALIDOS });
      }
      // Em rascunho, aceita vazio; se veio algo inválido (ex.: "?"), limpa em vez de gravar lixo
      camp.canal = canalOk || (canalNorm && !canalOk ? '' : canalNorm);
      const dataJson = jsonSeguro(camp);
      if (dataJson.length > 6 * 1024 * 1024) return res.status(413).json({ success: false, error: 'campanha muito grande (' + (dataJson.length/1048576).toFixed(1) + ' MB) — remova imagens/base64 do objeto' });
      const okDate = d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : null;
      const dataInicio = okDate(camp.data_inicio);
      const dataFim    = okDate(camp.data_fim);
      const ativa      = !!camp.ativa;
      const redesAtivas = camp.redes_ativas || {};
      await sql`INSERT INTO campanhas (id, nome, canal, status, data, data_inicio, data_fim, ativa, redes_ativas, atualizado_em)
        VALUES (${camp.id}, ${camp.nome||''}, ${camp.canal || ''}, ${camp.status||'rascunho'},
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
      let exc = []; try { exc = await sql`SELECT key FROM kv_store WHERE key LIKE 'campanha_excluida:%' AND updated_at > NOW() - INTERVAL '180 days'`; } catch (_) {}
      return res.status(200).json({ success: true, excluidas: exc.map(x => String(x.key).substring(18)), campanhas: r.map(x => Object.assign({}, x.data || {}, {
        data_inicio: x.data_inicio ? String(x.data_inicio).split('T')[0] : null,
        data_fim: x.data_fim ? String(x.data_fim).split('T')[0] : null,
        ativa: x.ativa,
        redes_ativas: x.redes_ativas || {},
        atualizado_em: x.atualizado_em,
      })) });
    }
    if (action === 'delete_campanha') {
      await sql`DELETE FROM campanhas WHERE id = ${key}`;
      await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${'campanha_excluida:' + key}, ${JSON.stringify({ em: new Date().toISOString() })}, NOW()) ON CONFLICT (key) DO UPDATE SET updated_at = NOW()`;
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
        VALUES (${ideia.id},${ideia.titulo||''},${ideia.stage||ideia.status||'Recebida'},${jsonSeguro(ideia)},NOW())
        ON CONFLICT (id) DO UPDATE SET titulo=EXCLUDED.titulo, status=EXCLUDED.status, data=EXCLUDED.data, atualizado_em=NOW()`;
      return res.status(200).json({ success: true, id: ideia.id });
    }
    // v3.36: excluir ideia (antes não havia como — o card não tinha excluir)
    if (action === 'delete_ideia') {
      const ids = Array.isArray(value?.ids) ? value.ids : [key || value?.id].filter(Boolean);
      if (!ids.length) return res.status(400).json({ success: false, error: 'id obrigatório' });
      let n = 0; for (const id of ids.slice(0, 200)) { const r = await sql`DELETE FROM ideias WHERE id = ${String(id)} RETURNING id`; n += r.length; }
      return res.status(200).json({ success: true, excluidas: n });
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

    // v1.43 (report DEV, item 1/2/6): auditoria e saneamento de campanhas com canal inválido
    if (action === 'auditar_campanhas') {
      const CANAIS_VALIDOS = ['LinkedIn', 'Instagram', 'Facebook', 'Google Ads', 'E-mail', 'WhatsApp', 'Todos os canais', 'Todos', 'LinkedIn + Instagram']; // v3.23: 'Todos' (auto-campanha) e 'LinkedIn + Instagram' eram recusados
      const rows = await sql`SELECT id, nome, canal, status, ativa, data_inicio, data_fim, atualizado_em FROM campanhas ORDER BY atualizado_em DESC`;
      const problemas = [];
      for (const c of rows) {
        const canal = String(c.canal || '').trim();
        const valido = CANAIS_VALIDOS.some(v => v.toLowerCase() === canal.toLowerCase());
        const publicando = ['aprovada','ativa','publicada'].includes(String(c.status||'').toLowerCase()) || c.ativa;
        if (!canal && publicando) problemas.push({ id: c.id, nome: c.nome, canal: '(vazio)', status: c.status, ativa: c.ativa,
          gravidade: 'alta', problema: 'Campanha aprovada/ativa SEM canal definido — não tem onde veicular.' });
        else if (canal && !valido) problemas.push({ id: c.id, nome: c.nome, canal, status: c.status, ativa: c.ativa,
          gravidade: publicando ? 'alta' : 'media', problema: `Canal "${canal}" não é um valor válido.` });
        else if (!canal && !publicando) problemas.push({ id: c.id, nome: c.nome, canal: '(vazio)', status: c.status, ativa: c.ativa,
          gravidade: 'baixa', problema: 'Rascunho sem canal — precisa definir antes de aprovar.' });
      }
      // Correção opcional: manda canal_corrigido junto com id para gravar
      if (value?.corrigir?.id && value?.corrigir?.canal) {
        const novo = CANAIS_VALIDOS.find(v => v.toLowerCase() === String(value.corrigir.canal).trim().toLowerCase());
        if (!novo) return res.status(400).json({ success:false, error:'Canal inválido', canais_validos: CANAIS_VALIDOS });
        await sql`UPDATE campanhas SET canal = ${novo}, atualizado_em = NOW() WHERE id = ${value.corrigir.id}`;
        return res.status(200).json({ success: true, corrigido: { id: value.corrigir.id, canal: novo } });
      }
      return res.status(200).json({ success: true, total_campanhas: rows.length, problemas,
        canais_validos: CANAIS_VALIDOS,
        resumo: { alta: problemas.filter(p=>p.gravidade==='alta').length,
                  media: problemas.filter(p=>p.gravidade==='media').length,
                  baixa: problemas.filter(p=>p.gravidade==='baixa').length } });
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
      // v3.68: o gerente via só nome/status das campanhas e um funil de outra tela (kpis_diarios, quase sempre
      // vazio) — dizia "não tenho acesso". Agora recebe as PUBLICAÇÕES reais (com status e métricas do Metricool),
      // visitas e leads por campanha/rede, a auditoria do funil e a configuração do clique.
      const dias = 30, iniD = new Date(Date.now() - dias * 864e5);
      const ctx = {
        hoje: new Date().toISOString().substring(0, 10),
        campanhas: { total: campRows.length, ativas: campRows.filter(c => c.ativa).length, por_canal: campRows.reduce((a,c) => { a[c.canal||'?'] = (a[c.canal||'?']||0)+1; return a; }, {}), lista: campRows.slice(0,15).map(c => ({ nome: c.nome, canal: c.canal, status: c.status, ativa: c.ativa, inicio: c.data_inicio, fim: c.data_fim })) },
        funil_vendas_14_dias_kpis_diarios: funilTotais,
        leads_ultimos_100: { total: leadRows.length, por_score: leadsPorScore },
      };
      // publicações (o que foi e o que vai ser postado), com métricas
      try {
        const kv = await sql`SELECT value FROM kv_store WHERE key = 'atx:publicacoes' LIMIT 1`;
        let pubs = kv[0]?.value; if (typeof pubs === 'string') pubs = JSON.parse(pubs); pubs = Array.isArray(pubs) ? pubs : [];
        const q = p => new Date(p.agendado_para || p.data); const agora = Date.now();
        const nomeCamp = {}; try { (await sql`SELECT id, nome FROM campanhas`).forEach(c => { nomeCamp[c.id] = c.nome; }); } catch (_) {}
        const passadas = pubs.filter(p => q(p) >= iniD && q(p) <= agora), futuras = pubs.filter(p => q(p) > agora && q(p) < agora + 15 * 864e5);
        const soma = (arr, k) => arr.reduce((s2, p) => s2 + (Number(p.metricas?.[k]) || 0), 0);
        const porRede = {}; passadas.forEach(p => { const r = p.rede || '?'; const o = porRede[r] = porRede[r] || { posts: 0, publicados: 0, com_erro: 0, nao_estao_no_metricool: 0, impressoes: 0, cliques: 0, curtidas: 0, comentarios: 0, compartilhamentos: 0 };
          o.posts++; if (p.status === 'publicado' || /PUBLISHED|SUCCESS/i.test(p.status_mc || '')) o.publicados++; if (p.status === 'erro') o.com_erro++; if (p.nao_encontrado) o.nao_estao_no_metricool++;
          o.impressoes += Number(p.metricas?.imp) || 0; o.cliques += Number(p.metricas?.cli) || 0; o.curtidas += Number(p.metricas?.cur) || 0; o.comentarios += Number(p.metricas?.com) || 0; o.compartilhamentos += Number(p.metricas?.sha) || 0; });
        const porCamp = {}; passadas.forEach(p => { const k = nomeCamp[p.campanhaId] || p.campanhaId || 'sem campanha'; const o = porCamp[k] = porCamp[k] || { posts: 0, impressoes: 0, cliques: 0, leads_registrados: 0 }; o.posts++; o.impressoes += Number(p.metricas?.imp) || 0; o.cliques += Number(p.metricas?.cli) || 0; o.leads_registrados += Number(p.metricas?.leads) || 0; });
        const top = passadas.filter(p => p.metricas).sort((a, b) => ((b.metricas.cli || 0) * 10 + (b.metricas.imp || 0)) - ((a.metricas.cli || 0) * 10 + (a.metricas.imp || 0))).slice(0, 6)
          .map(p => ({ data: q(p).toISOString().substring(0, 16), rede: p.rede, titulo: String(p.titulo || '').substring(0, 70), impressoes: p.metricas.imp || 0, cliques: p.metricas.cli || 0, curtidas: p.metricas.cur || 0, comentarios: p.metricas.com || 0 }));
        const pior = passadas.filter(p => p.status === 'erro').slice(0, 5).map(p => ({ data: q(p).toISOString().substring(0, 16), rede: p.rede, titulo: String(p.titulo || '').substring(0, 60), erro: String(p.erro_mc || '').substring(0, 120) }));
        const agenda = {}; futuras.forEach(p => { const d = q(p).toISOString().substring(0, 10); agenda[d] = agenda[d] || {}; agenda[d][p.rede] = (agenda[d][p.rede] || 0) + 1; });
        ctx.publicacoes_ultimos_30_dias = { total: passadas.length, por_rede: porRede, por_campanha: porCamp, totais: { impressoes: soma(passadas, 'imp'), cliques: soma(passadas, 'cli'), curtidas: soma(passadas, 'cur'), comentarios: soma(passadas, 'com') }, melhores_posts: top, com_erro: pior,
          observacao: 'métricas vêm do Metricool e são casadas por post; impressões/cliques zerados podem significar que a métrica ainda não foi sincronizada (tela Desempenho)' };
        ctx.agenda_proximos_14_dias = { total: futuras.length, por_dia_e_rede: agenda };
      } catch (e) { ctx.publicacoes_erro = e.message; }
      // visitas à página de captura e leads, por origem e por campanha
      try {
        const vis = await sql`SELECT LOWER(COALESCE(origem,'direto')) AS origem, COALESCE(campanha,'') AS campanha, COUNT(*)::int AS n FROM captura_visitas WHERE criado_em >= ${iniD.toISOString()} GROUP BY 1,2 ORDER BY 3 DESC LIMIT 30`;
        ctx.visitas_pagina_captura_30_dias = { total: vis.reduce((s2, v) => s2 + v.n, 0), detalhe: vis };
      } catch (_) { ctx.visitas_pagina_captura_30_dias = 'não medido'; }
      try {
        const ld = await sql`SELECT LOWER(COALESCE(NULLIF(origem,''),'sem origem')) AS origem, COALESCE(campanha,'') AS campanha, COUNT(*)::int AS n, MAX(criado_em) AS ultimo FROM leads WHERE criado_em >= ${iniD.toISOString()} GROUP BY 1,2 ORDER BY 3 DESC LIMIT 30`;
        const ult = await sql`SELECT MAX(criado_em) AS u, COUNT(*)::int AS n FROM leads`;
        ctx.leads_30_dias = { total: ld.reduce((s2, v) => s2 + v.n, 0), por_origem_e_campanha: ld.map(x => ({ origem: x.origem, campanha: x.campanha, n: x.n })), ultimo_lead_historico: ult[0]?.u ? String(ult[0].u).substring(0, 10) : null, total_historico: ult[0]?.n || 0 };
      } catch (_) {}
      try { const fu = await sql`SELECT status, COUNT(*)::int AS n FROM followups GROUP BY 1`; ctx.followups = Object.fromEntries(fu.map(x => [x.status, x.n])); } catch (_) {}
      // auditoria do funil por rede (Metricool: impressões, cliques, gargalo) — cache de 30 min
      try {
        const ck = await sql`SELECT value, updated_at FROM kv_store WHERE key = 'cache:mkt:auditoria' LIMIT 1`;
        let aud = ck[0] && (Date.now() - new Date(ck[0].updated_at).getTime() < 30 * 60000) ? (typeof ck[0].value === 'string' ? JSON.parse(ck[0].value) : ck[0].value) : null;
        if (!aud) {
          const base = (process.env.MEDIA_PUBLIC_BASE || 'https://' + (req.headers.host || 'atlantyx-os.vercel.app')).replace(/\/$/, '');
          const c = new AbortController(); const t = setTimeout(() => c.abort(), 30000);
          const r = await fetch(base + '/api/metricool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'auditoria_funil', payload: { dias } }), signal: c.signal }).finally(() => clearTimeout(t));
          const d = await r.json().catch(() => ({}));
          if (d.success) { aud = { veredito: d.veredito, problemas: (d.problemas || []).slice(0, 8), funil_por_rede: d.funil_por_rede, posts_metricool: d.posts };
            try { await sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('cache:mkt:auditoria', ${JSON.stringify(aud)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; } catch (_) {} }
        }
        if (aud) ctx.auditoria_funil_30_dias = aud;
      } catch (e) { ctx.auditoria_funil_erro = 'não consegui rodar agora: ' + e.message; }
      // configuração vinda da tela (para onde o clique leva, Instagram, etc.)
      if (value?.config) ctx.configuracao_tela = value.config;
      const system = `Você é o GERENTE DE MARKETING IA da Atlantyx — direto, prático, português do Brasil. Você TEM os dados reais do marketing abaixo: campanhas; PUBLICAÇÕES dos últimos 30 dias por rede e por campanha (status no Metricool, impressões, cliques, curtidas, comentários, melhores posts, posts com erro); agenda dos próximos 14 dias; visitas à página de captura e leads por origem/campanha; follow-ups; auditoria do funil por rede (gargalo e ação de cada rede); configuração do clique (para onde o link leva). Use ESSES números para responder — cite-os. Pense no funil post → impressão → clique → visita à página → lead → reunião e aponte onde perde mais. Se um dado está zerado ou ausente, diga exatamente qual e o provável motivo (ex.: métrica não sincronizada, rede sem API), sem dizer que "não tem acesso" ao que está no contexto. Seja concreto e acionável (~250 palavras salvo pedido de detalhe); nunca invente número.\n\nCONTEXTO (JSON):\n${JSON.stringify(ctx).substring(0,24000)}`;
      const msgs = [...historico.slice(-10).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content||'').substring(0,2000) })), { role: 'user', content: String(mensagem).substring(0,3000) }];
      if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ success: false, error: 'ANTHROPIC_API_KEY não configurada' });
      const rr = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' }, body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 1400, system, messages: msgs }) });
      const dd = await rr.json().catch(() => ({}));
      if (!rr.ok) return res.status(400).json({ success: false, error: 'Claude API [' + rr.status + ']: ' + (dd.error?.message || 'erro') });
      // v1.71: se a mensagem for uma ORDEM (ex.: "crie campanha com briefing X"), executa e devolve o link
      let tarefaMkt = null;
      try {
        const hojeM = new Date().toISOString().split('T')[0];
        const sysT = `Decida se a mensagem é uma ORDEM para executar uma operação de marketing.
Hoje é ${hojeM}.

TAREFAS:
- criar_campanha: criar uma campanha a partir de um briefing (params: nome, canal, objetivo, publico, briefing, data_inicio, data_fim)
- listar_campanhas: mostrar as campanhas e o status de cada uma
- analisar_funil: analisar o funil dos últimos dias

Devolva SOMENTE JSON: {"executar":true|false,"tarefa":"id ou null","params":{...}}
- executar=true só quando o usuário PEDE a operação ("crie uma campanha para X", "rode a análise do funil").
- Pergunta de opinião ("o que acha das campanhas?") → executar=false.
- Em criar_campanha: extraia o nome (se não houver, invente um curto e descritivo a partir do briefing), o canal citado (linkedin, email, instagram, google, evento) e o briefing completo que o usuário escreveu.`;
        const rt = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{ 'Content-Type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
          body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 500, system: sysT, messages: [{ role:'user', content: String(mensagem).substring(0,600) }] }) });
        const dt = await rt.json().catch(() => ({}));
        const j = JSON.parse(String(dt.content?.[0]?.text || '{}').replace(/```json|```/g,'').trim());
        if (j.executar && j.tarefa === 'criar_campanha') {
          const p = j.params || {};
          const canaisOk = ['linkedin','email','instagram','facebook','google','evento','whatsapp','outbound'];
          const canal = canaisOk.includes(String(p.canal||'').toLowerCase()) ? String(p.canal).toLowerCase() : 'linkedin';
          const idC = 'camp_' + Date.now().toString(36);
          await sql`INSERT INTO campanhas (id, nome, canal, status, ativa, objetivo, publico_alvo, briefing, data_inicio, data_fim, criado_em, atualizado_em)
            VALUES (${idC}, ${p.nome || 'Campanha ' + hojeM}, ${canal}, 'rascunho', false, ${p.objetivo || null},
              ${p.publico || null}, ${p.briefing || String(mensagem).substring(0,2000)}, ${p.data_inicio || null}, ${p.data_fim || null}, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING`;
          tarefaMkt = { tarefa:'criar_campanha', resumo: `Campanha "${p.nome || 'nova'}" criada no canal ${canal}, em rascunho — revise antes de ativar.`,
            numeros: { canal, status: 'rascunho' }, tela: 's2kanban', filtros: {}, campanha_id: idC };
        } else if (j.executar && j.tarefa === 'listar_campanhas') {
          tarefaMkt = { tarefa:'listar_campanhas', resumo: `${ctx.campanhas.total} campanha(s), ${ctx.campanhas.ativas} ativa(s).`,
            numeros: { total: ctx.campanhas.total, ativas: ctx.campanhas.ativas }, tela: 's2kanban', filtros: {} };
        } else if (j.executar && j.tarefa === 'analisar_funil') {
          const fu = ctx.funil_ultimos_14_dias;
          tarefaMkt = { tarefa:'analisar_funil', resumo: `Funil 14 dias: ${fu.contatos} contatos → ${fu.respostas} respostas → ${fu.reunioes_marcadas} reuniões → ${fu.fechamentos} fechamentos.`,
            numeros: fu, tela: 's2desempenho', filtros: {} };
        }
      } catch (e) { console.warn('[gerente mkt] tarefa:', e.message); }

      return res.status(200).json({ success: true, resposta: dd.content?.[0]?.text || '', tarefa: tarefaMkt,
        contexto_resumo: { campanhas_ativas: ctx.campanhas.ativas, leads: ctx.leads_ultimos_100.total } });
    }

        return res.status(400).json({ error: 'Ação inválida: ' + action });

  } catch (error) {
    console.error('[ERRO db]', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'db');
