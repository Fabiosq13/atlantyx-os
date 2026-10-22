import { comGuarda } from '../lib/qa-guard.js';
import { lerSessao } from '../lib/acesso.js';

// v2.88: compatibilidade com o driver @neondatabase/serverless 0.10.x — nele NÃO existe sql.query();
// SQL montado em texto é executado chamando sql(texto, params). Nas versões ≥1.0 é sql.query(texto, params).
// Antes, toda chamada sql.query() falhava em silêncio: colunas novas nunca eram criadas.
const _q = (db, texto, params) => (typeof db.query === 'function' ? db.query(texto, params) : db(texto, params));
// v3.29 (SEC-012…020): nome de tabela/coluna vindo da configuração — só letras, números e _; sempre entre aspas
const _id = n => { const v = String(n ?? ''); if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(v)) throw new Error('nome de tabela/coluna inválido: ' + v.substring(0, 40)); return '"' + v + '"'; };
// api/pmo.js — v1.62 · S9 · Projetos
// Sala de reunião com os gerentes de projeto + Status Report (criação e visualização).
// Os dados de projeto podem vir de um sistema EXTERNO (outro projeto no Vercel) — o conector
// é configurável em tempo de execução, sem precisar de novo deploy.

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon, types } = await import('@neondatabase/serverless');
  // v3.237: colunas DATE voltam como 'AAAA-MM-DD' (o driver devolvia Date e String(data) virava "Wed Oct 21" — datas e KPIs errados)
  try { types?.setTypeParser?.(1082, v => v); } catch (_) {}
  _sql = neon(process.env.DATABASE_URL);
  await ensureTabelas(_sql);
  return _sql;
}
async function ensureTabelas(sql) {
  await sql`CREATE TABLE IF NOT EXISTS status_reports (
    id TEXT PRIMARY KEY,
    projeto_id TEXT,
    projeto_nome TEXT NOT NULL,
    periodo TEXT,
    data_report DATE DEFAULT CURRENT_DATE,
    gerente TEXT,
    farol TEXT DEFAULT 'verde',
    pct_concluido NUMERIC DEFAULT 0,
    resumo TEXT,
    realizado TEXT,
    proximos_passos TEXT,
    riscos JSONB DEFAULT '[]',
    bloqueios JSONB DEFAULT '[]',
    marcos JSONB DEFAULT '[]',
    horas_previstas NUMERIC, horas_realizadas NUMERIC,
    orcamento_previsto NUMERIC, orcamento_realizado NUMERIC,
    fonte TEXT DEFAULT 'manual',
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sr_projeto ON status_reports(projeto_nome, data_report DESC)`;
  // v1.64: dois templates (entrega x sustentação/SLA) + planejado x realizado
  for (const col of [
    "tipo_projeto TEXT DEFAULT 'entrega'",      // 'entrega' | 'sustentacao'
    'pct_planejado NUMERIC',                     // para comparar com pct_concluido
    'marcos_entregues JSONB DEFAULT \'[]\'',
    'marcos_proximos JSONB DEFAULT \'[]\'',
    'acoes JSONB DEFAULT \'[]\'',               // {acao, responsavel, prazo}
    'chamados_abertos INT', 'chamados_fechados INT',   // sustentação
    'sla_cumprido_pct NUMERIC', 'sla_violacoes INT',
    'semana_ref TEXT',
    // v1.65: campos do layout de apresentação ao cliente (padrão PMO CPFL)
    'spi NUMERIC',                                  // Schedule Performance Index
    'pct_previsto NUMERIC',                         // Previsto x Realizado do cabeçalho
    'atividades_atrasadas JSONB DEFAULT \'[]\'',
    'atividades_andamento JSONB DEFAULT \'[]\'',
    'proximas_atividades JSONB DEFAULT \'[]\'',
    'pontos_atencao JSONB DEFAULT \'[]\'',
    'pendencias JSONB DEFAULT \'[]\'',             // # tarefa responsável datas status obs
    'riscos_projeto JSONB DEFAULT \'[]\'',         // issues descrição ação responsável probabilidade
    'cliente TEXT',
  ]) {
    try { await _q(sql, `ALTER TABLE status_reports ADD COLUMN IF NOT EXISTS ${col}`); } catch (e) { console.warn('[PMO] migração:', e.message); }
  }
  await sql`CREATE TABLE IF NOT EXISTS pmo_projetos_config (
    projeto_nome TEXT PRIMARY KEY,
    tipo_projeto TEXT DEFAULT 'entrega',
    gerente TEXT,
    ativo BOOLEAN DEFAULT true,
    ordem INT DEFAULT 0,
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS pmo_config (
    chave TEXT PRIMARY KEY, valor TEXT, atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  // Demanda dem_muv797nfaolq: registro de auditoria das exportações do status report (quem, quando, projeto)
  await sql`CREATE TABLE IF NOT EXISTS pmo_exportacoes (
    id TEXT PRIMARY KEY,
    acao TEXT NOT NULL,
    formato TEXT,
    projeto TEXT,
    report_id TEXT,
    arquivo TEXT,
    usuario TEXT,
    ts TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS pmo_reunioes (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    data_hora TIMESTAMPTZ DEFAULT NOW(),
    participantes JSONB DEFAULT '[]',
    pauta TEXT,
    transcricao JSONB DEFAULT '[]',
    ata TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
}
function novoId(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
// v2.00: round era usado em 26 lugares sem existir — causava "round is not defined" no raio-X
const round = v => Math.round((parseFloat(v) || 0) * 100) / 100;

// ═══════════════════════════════════════════════════════════════════════════
// CONECTOR COM O SISTEMA EXTERNO DE PROJETOS (outro projeto no Vercel)
// ═══════════════════════════════════════════════════════════════════════════
async function configGet() {
  const sql = await getSql();
  const rows = await sql`SELECT chave, valor FROM pmo_config`;
  const cfg = {};
  rows.forEach(r => cfg[r.chave] = r.valor);
  return {
    url: cfg.api_url || process.env.ATLANTYX_PROJETOS_API_URL || null,
    token: cfg.api_token || process.env.ATLANTYX_PROJETOS_API_TOKEN || null,
    caminho: cfg.api_caminho || '/api/projetos',
    configurado: !!(cfg.api_url || process.env.ATLANTYX_PROJETOS_API_URL),
  };
}
async function configSalvar({ url, token, caminho } = {}) {
  const sql = await getSql();
  const set = async (k, v) => {
    if (v === undefined) return;
    await sql`INSERT INTO pmo_config (chave, valor, atualizado_em) VALUES (${k}, ${v || null}, NOW())
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
  };
  await set('api_url', url ? String(url).replace(/\/$/, '') : null);
  await set('api_token', token);
  await set('api_caminho', caminho);
  return await configGet();
}

// Testa a conexão e DESCOBRE o formato dos dados — evita adivinhar a estrutura
async function conectorTestar({ url, token, caminho } = {}) {
  const cfg = await configGet();
  const base = (url || cfg.url || '').replace(/\/$/, '');
  const path = caminho || cfg.caminho || '/api/projetos';
  const tk = token || cfg.token;
  if (!base) return { erro: 'URL do sistema de projetos não informada.' };

  const alvo = base + (path.startsWith('/') ? path : '/' + path);
  const out = { url_testada: alvo };
  try {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch(alvo, { signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } });
    clearTimeout(tm);
    out.http_status = r.status;
    const texto = await r.text();
    if (!r.ok) { out.erro = `HTTP ${r.status}`; out.resposta = texto.substring(0, 300); return { teste: out }; }
    let dados;
    try { dados = JSON.parse(texto); } catch { out.erro = 'A resposta não é JSON'; out.resposta = texto.substring(0, 300); return { teste: out }; }

    // Descoberta do formato: onde está a lista e quais campos existem
    const lista = Array.isArray(dados) ? dados
      : (dados.projetos || dados.data || dados.items || dados.results || dados.rows || null);
    out.ok = true;
    out.formato = Array.isArray(dados) ? 'array na raiz'
      : (lista ? 'array dentro de um campo do objeto' : 'objeto sem lista identificada');
    out.total_registros = Array.isArray(lista) ? lista.length : null;
    out.campos_encontrados = Array.isArray(lista) && lista[0] ? Object.keys(lista[0]) : Object.keys(dados || {}).slice(0, 30);
    out.amostra = Array.isArray(lista) ? lista.slice(0, 2) : dados;
    return { teste: out };
  } catch (e) {
    out.erro = e.name === 'AbortError' ? 'Tempo esgotado (20s) — a URL respondeu?' : e.message;
    return { teste: out };
  }
}

// Busca os projetos no sistema externo, normalizando os campos mais prováveis
async function projetosExternos() {
  const cfg = await configGet();
  if (!cfg.configurado) return { projetos: [], fonte: 'nao_configurado' };
  const alvo = cfg.url + (cfg.caminho.startsWith('/') ? cfg.caminho : '/' + cfg.caminho);
  try {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(alvo, { signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}) } });
    clearTimeout(tm);
    if (!r.ok) return { projetos: [], fonte: 'externo', erro: `HTTP ${r.status}` };
    const d = await r.json();
    const lista = Array.isArray(d) ? d : (d.projetos || d.data || d.items || d.results || d.rows || []);
    const pega = (o, ...chaves) => { for (const k of chaves) if (o[k] != null && o[k] !== '') return o[k]; return null; };
    return {
      fonte: 'externo',
      projetos: lista.map(p => ({
        id: pega(p, 'id', 'projeto_id', 'codigo', '_id'),
        nome: pega(p, 'nome', 'name', 'projeto', 'titulo', 'title', 'descricao') || '(sem nome)',
        cliente: pega(p, 'cliente', 'client', 'empresa', 'customer'),
        gerente: pega(p, 'gerente', 'gestor', 'manager', 'responsavel', 'owner'),
        status: pega(p, 'status', 'situacao', 'state', 'fase'),
        inicio: pega(p, 'data_inicio', 'inicio', 'start_date', 'startDate'),
        fim: pega(p, 'data_fim', 'fim', 'end_date', 'endDate', 'previsao_termino'),
        pct: num(pega(p, 'percentual', 'pct', 'progresso', 'progress', 'percent_complete')),
        horas_previstas: num(pega(p, 'horas_previstas', 'horas_estimadas', 'estimated_hours')),
        horas_realizadas: num(pega(p, 'horas_realizadas', 'horas_apontadas', 'actual_hours', 'horas')),
        valor: num(pega(p, 'valor', 'valor_total', 'orcamento', 'budget')),
        _bruto: p,
      })),
    };
  } catch (e) { return { projetos: [], fonte: 'externo', erro: e.message }; }
}

// Projetos do próprio Atlantyx (financeiro), usados quando não há sistema externo
async function projetosLocais() {
  try {
    const sql = await getSql();
    const rows = await sql`SELECT id, nome, status, valor_total, atualizado_em FROM projetos_financeiros ORDER BY nome`;
    return { fonte: 'atlantyx', projetos: rows.map(p => ({ id: p.id, nome: p.nome, status: p.status,
      valor: num(p.valor_total), gerente: null, pct: 0 })) };
  } catch (e) { return { fonte: 'atlantyx', projetos: [], erro: e.message }; }
}

async function projetosListar() {
  // v3.215: a fonte oficial dos projetos é o módulo de projetos (Maestro · CRONOGRAMA_DATABASE_URL). Antes as telas S9 só
  // olhavam um endereço de API externo (quase nunca configurado) e caíam nos projetos do financeiro, com 0% e sem gerente.
  if (process.env.CRONOGRAMA_DATABASE_URL) {
    try { const M = await maestroPainel();
      const ps = (M.projetos || []).filter(p => p.ativo);
      if (ps.length) return { fonte: 'maestro', aviso: null, projetos: ps.map(p => ({ id: p.nome, nome: p.nome, cliente: p.cliente || null, gerente: p.gerente || null, status: p.status || null,
        inicio: p.inicio || null, fim: p.conclusao || null, pct: p.pct ?? null, pct_planejado: p.planejado ?? null, farol: p.farol || null, horas_previstas: p.horas_contratadas ?? null, horas_realizadas: p.horas ?? null, _maestro: p })) };
    } catch (e) { console.warn('[pmo] Maestro indisponível:', e.message); }
  }
  const ext = await projetosExternos();
  if (ext.projetos?.length) return { ...ext, aviso: null };
  const loc = await projetosLocais();
  return { ...loc, aviso: ext.erro ? `Sistema externo não respondeu (${ext.erro}); mostrando projetos do próprio Atlantyx.`
    : (ext.fonte === 'nao_configurado' ? 'Sistema externo de projetos ainda não configurado — mostrando projetos do Atlantyx.' : null) };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS REPORT
// ═══════════════════════════════════════════════════════════════════════════
async function reportSalvar(p = {}) {
  if (!p.projeto_nome) throw new Error('projeto_nome obrigatório');
  const sql = await getSql();
  const id = p.id || novoId('sr');
  const farol = ['verde', 'amarelo', 'vermelho'].includes(p.farol) ? p.farol : 'verde';
  const tipo = p.tipo_projeto === 'sustentacao' ? 'sustentacao' : 'entrega';
  const J = v => JSON.stringify(Array.isArray(v) ? v : []);
  const N = v => (v === null || v === undefined || v === '') ? null : num(v);
  await sql`INSERT INTO status_reports (id, projeto_id, projeto_nome, periodo, data_report, gerente, farol,
      pct_concluido, resumo, realizado, proximos_passos, riscos, bloqueios, marcos,
      horas_previstas, horas_realizadas, orcamento_previsto, orcamento_realizado, fonte,
      tipo_projeto, pct_planejado, marcos_entregues, marcos_proximos, acoes,
      chamados_abertos, chamados_fechados, sla_cumprido_pct, sla_violacoes, semana_ref,
      spi, pct_previsto, atividades_atrasadas, atividades_andamento, proximas_atividades,
      pontos_atencao, pendencias, riscos_projeto, cliente, atualizado_em)
    VALUES (${id}, ${p.projeto_id || null}, ${p.projeto_nome}, ${p.periodo || null},
      ${p.data_report || new Date().toISOString().split('T')[0]}, ${p.gerente || null}, ${farol},
      ${num(p.pct_concluido)}, ${p.resumo || null}, ${p.realizado || null}, ${p.proximos_passos || null},
      ${J(p.riscos)}, ${J(p.bloqueios)}, ${J(p.marcos)},
      ${N(p.horas_previstas)}, ${N(p.horas_realizadas)}, ${N(p.orcamento_previsto)}, ${N(p.orcamento_realizado)},
      ${p.fonte || 'manual'},
      ${tipo}, ${N(p.pct_planejado)}, ${J(p.marcos_entregues)}, ${J(p.marcos_proximos)}, ${J(p.acoes)},
      ${p.chamados_abertos != null ? parseInt(p.chamados_abertos) : null},
      ${p.chamados_fechados != null ? parseInt(p.chamados_fechados) : null},
      ${N(p.sla_cumprido_pct)}, ${p.sla_violacoes != null ? parseInt(p.sla_violacoes) : null},
      ${p.semana_ref || null},
      ${N(p.spi)}, ${N(p.pct_previsto)}, ${J(p.atividades_atrasadas)}, ${J(p.atividades_andamento)},
      ${J(p.proximas_atividades)}, ${J(p.pontos_atencao)}, ${J(p.pendencias)}, ${J(p.riscos_projeto)},
      ${p.cliente || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET projeto_nome=EXCLUDED.projeto_nome, periodo=EXCLUDED.periodo,
      data_report=EXCLUDED.data_report, gerente=EXCLUDED.gerente, farol=EXCLUDED.farol,
      pct_concluido=EXCLUDED.pct_concluido, resumo=EXCLUDED.resumo, realizado=EXCLUDED.realizado,
      proximos_passos=EXCLUDED.proximos_passos, riscos=EXCLUDED.riscos, bloqueios=EXCLUDED.bloqueios,
      marcos=EXCLUDED.marcos, horas_previstas=EXCLUDED.horas_previstas, horas_realizadas=EXCLUDED.horas_realizadas,
      orcamento_previsto=EXCLUDED.orcamento_previsto, orcamento_realizado=EXCLUDED.orcamento_realizado,
      tipo_projeto=EXCLUDED.tipo_projeto, pct_planejado=EXCLUDED.pct_planejado,
      marcos_entregues=EXCLUDED.marcos_entregues, marcos_proximos=EXCLUDED.marcos_proximos,
      acoes=EXCLUDED.acoes, chamados_abertos=EXCLUDED.chamados_abertos, chamados_fechados=EXCLUDED.chamados_fechados,
      sla_cumprido_pct=EXCLUDED.sla_cumprido_pct, sla_violacoes=EXCLUDED.sla_violacoes,
      semana_ref=EXCLUDED.semana_ref, spi=EXCLUDED.spi, pct_previsto=EXCLUDED.pct_previsto,
      atividades_atrasadas=EXCLUDED.atividades_atrasadas, atividades_andamento=EXCLUDED.atividades_andamento,
      proximas_atividades=EXCLUDED.proximas_atividades, pontos_atencao=EXCLUDED.pontos_atencao,
      pendencias=EXCLUDED.pendencias, riscos_projeto=EXCLUDED.riscos_projeto, cliente=EXCLUDED.cliente,
      atualizado_em=NOW()`;
  // v1.64: guarda o tipo do projeto para o próximo report já vir com o template certo
  await sql`INSERT INTO pmo_projetos_config (projeto_nome, tipo_projeto, gerente, atualizado_em)
    VALUES (${p.projeto_nome}, ${tipo}, ${p.gerente || null}, NOW())
    ON CONFLICT (projeto_nome) DO UPDATE SET tipo_projeto = EXCLUDED.tipo_projeto,
      gerente = COALESCE(EXCLUDED.gerente, pmo_projetos_config.gerente), atualizado_em = NOW()`;
  return { id };
}

async function reportList({ projeto_nome, limite = 50 } = {}) {
  const sql = await getSql();
  const rows = projeto_nome
    ? await sql`SELECT * FROM status_reports WHERE projeto_nome = ${projeto_nome} ORDER BY data_report DESC, criado_em DESC LIMIT ${limite}`
    : await sql`SELECT * FROM status_reports ORDER BY data_report DESC, criado_em DESC LIMIT ${limite}`;
  const norm = r => ({ ...r, data_report: r.data_report ? String(r.data_report).split('T')[0] : null,
    pct_concluido: num(r.pct_concluido),
    riscos: Array.isArray(r.riscos) ? r.riscos : [], bloqueios: Array.isArray(r.bloqueios) ? r.bloqueios : [],
    marcos: Array.isArray(r.marcos) ? r.marcos : [],
    // v1.65
    atividades_atrasadas: Array.isArray(r.atividades_atrasadas) ? r.atividades_atrasadas : [],
    atividades_andamento: Array.isArray(r.atividades_andamento) ? r.atividades_andamento : [],
    proximas_atividades: Array.isArray(r.proximas_atividades) ? r.proximas_atividades : [],
    pontos_atencao: Array.isArray(r.pontos_atencao) ? r.pontos_atencao : [],
    pendencias: Array.isArray(r.pendencias) ? r.pendencias : [],
    riscos_projeto: Array.isArray(r.riscos_projeto) ? r.riscos_projeto : [],
    marcos_entregues: Array.isArray(r.marcos_entregues) ? r.marcos_entregues : [],
    marcos_proximos: Array.isArray(r.marcos_proximos) ? r.marcos_proximos : [],
    acoes: Array.isArray(r.acoes) ? r.acoes : [] });
  const reports = rows.map(norm);
  // Painel: último report de cada projeto + contagem por farol
  const ultimoPorProjeto = {};
  reports.forEach(r => { if (!ultimoPorProjeto[r.projeto_nome]) ultimoPorProjeto[r.projeto_nome] = r; });
  const ultimos = Object.values(ultimoPorProjeto);
  return { reports, ultimos,
    resumo: { total: reports.length, projetos: ultimos.length,
      verde: ultimos.filter(r => r.farol === 'verde').length,
      amarelo: ultimos.filter(r => r.farol === 'amarelo').length,
      vermelho: ultimos.filter(r => r.farol === 'vermelho').length,
      com_bloqueio: ultimos.filter(r => (r.bloqueios || []).length).length } };
}
async function reportGet({ id }) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const r = await sql`SELECT * FROM status_reports WHERE id = ${id} LIMIT 1`;
  if (!r.length) throw new Error('Status report não encontrado');
  const x = r[0];
  return { report: { ...x, data_report: x.data_report ? String(x.data_report).split('T')[0] : null,
    pct_concluido: num(x.pct_concluido),
    riscos: Array.isArray(x.riscos) ? x.riscos : [], bloqueios: Array.isArray(x.bloqueios) ? x.bloqueios : [],
    marcos: Array.isArray(x.marcos) ? x.marcos : [],
    atividades_atrasadas: Array.isArray(x.atividades_atrasadas) ? x.atividades_atrasadas : [],
    atividades_andamento: Array.isArray(x.atividades_andamento) ? x.atividades_andamento : [],
    proximas_atividades: Array.isArray(x.proximas_atividades) ? x.proximas_atividades : [],
    pontos_atencao: Array.isArray(x.pontos_atencao) ? x.pontos_atencao : [],
    pendencias: Array.isArray(x.pendencias) ? x.pendencias : [],
    riscos_projeto: Array.isArray(x.riscos_projeto) ? x.riscos_projeto : [],
    marcos_entregues: Array.isArray(x.marcos_entregues) ? x.marcos_entregues : [],
    marcos_proximos: Array.isArray(x.marcos_proximos) ? x.marcos_proximos : [],
    acoes: Array.isArray(x.acoes) ? x.acoes : [] } };
}
async function reportExcluir({ id }) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM status_reports WHERE id = ${id}`;
  return { excluido: true };
}

// Demanda dem_muv797nfaolq: auditoria das exportações do status report (PDF / e-mail).
// O usuário vem da sessão (cookie assinado), não do navegador.
async function exportRegistrar(payload = {}, req) {
  let usuario = null;
  try { const s = await lerSessao(req); if (s) usuario = s.nome || s.login; } catch (_) {}
  const t = v => (v == null || v === '') ? null : String(v).substring(0, 300);
  const sql = await getSql();
  const id = novoId('exp');
  await sql`INSERT INTO pmo_exportacoes (id, acao, formato, projeto, report_id, arquivo, usuario)
    VALUES (${id}, ${t(payload.acao) || 'export_status'}, ${t(payload.formato)}, ${t(payload.projeto)}, ${t(payload.report_id)}, ${t(payload.arquivo)}, ${usuario})`;
  const [c] = await sql`SELECT COUNT(*)::int AS n FROM pmo_exportacoes WHERE ts >= NOW() - INTERVAL '7 days'`;
  return { registrado: true, id, usuario: usuario || 'anônimo', ultimos_7_dias: c?.n || 0 };
}
// métrica de sucesso da demanda: exportações por semana
async function exportResumo() {
  const sql = await getSql();
  const semanas = await sql`SELECT to_char(date_trunc('week', ts), 'YYYY-MM-DD') AS semana, COUNT(*)::int AS total
    FROM pmo_exportacoes WHERE ts >= NOW() - INTERVAL '8 weeks' GROUP BY 1 ORDER BY 1 DESC`;
  const ultimas = await sql`SELECT acao, formato, projeto, usuario, ts FROM pmo_exportacoes ORDER BY ts DESC LIMIT 20`;
  return { semanas, ultimas };
}

// Rascunho gerado por IA a partir dos dados do projeto + report anterior
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function claudePmo(system, user, maxTokens = 1600) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 55000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return d.content?.[0]?.text || '';
}
async function reportRascunho({ projeto_nome, projeto_id, notas } = {}) {
  if (!projeto_nome) throw new Error('projeto_nome obrigatório');
  const { projetos } = await projetosListar();
  const proj = projetos.find(p => p.nome === projeto_nome || String(p.id) === String(projeto_id)) || null;
  const { reports } = await reportList({ projeto_nome, limite: 2 });
  const anterior = reports[0] || null;

  const system = `Você prepara RASCUNHOS de status report de projeto para o PMO da Atlantyx.
Devolva SOMENTE um JSON válido, sem markdown e sem texto fora do JSON, com estas chaves:
{"farol":"verde|amarelo|vermelho","pct_concluido":number,"resumo":"...","realizado":"...","proximos_passos":"...","riscos":[{"descricao":"...","impacto":"alto|medio|baixo","mitigacao":"..."}],"bloqueios":[{"descricao":"...","responsavel":"...","desde":"AAAA-MM-DD"}]}

Regras:
- É um RASCUNHO para o gerente revisar — nunca invente fato, número ou entrega.
- Use apenas o que está nos dados fornecidos e nas notas do gerente.
- Se faltar informação para algum campo, deixe string vazia ou lista vazia.
- O farol deve refletir os dados: vermelho se há bloqueio sem solução ou prazo estourado, amarelo se há risco relevante, verde se está no rumo.
- Escreva em português do Brasil, objetivo, sem adjetivos de marketing.`;

  const user = `PROJETO: ${projeto_nome}
${proj ? 'DADOS DO SISTEMA: ' + JSON.stringify({ status: proj.status, gerente: proj.gerente, inicio: proj.inicio, fim: proj.fim, pct: proj.pct, horas_previstas: proj.horas_previstas, horas_realizadas: proj.horas_realizadas, valor: proj.valor }) : 'Sem dados do sistema de projetos.'}
${anterior ? 'STATUS REPORT ANTERIOR (' + anterior.data_report + '): ' + JSON.stringify({ farol: anterior.farol, pct: anterior.pct_concluido, resumo: anterior.resumo, proximos_passos: anterior.proximos_passos, riscos: anterior.riscos, bloqueios: anterior.bloqueios }) : 'Sem report anterior.'}
${notas ? 'NOTAS DO GERENTE: ' + notas : 'Sem notas do gerente.'}`;

  const txt = await claudePmo(system, user, 1600);
  try {
    const limpo = txt.replace(/```json|```/g, '').trim();
    return { rascunho: JSON.parse(limpo), origem_dados: proj ? 'sistema de projetos' : 'apenas notas/histórico' };
  } catch (e) { return { erro: 'A IA não devolveu JSON válido', bruto: txt.substring(0, 600) }; }
}

// ═══════════════════════════════════════════════════════════════════════════
// SALA DE REUNIÃO COM OS GERENTES DE PROJETO
// ═══════════════════════════════════════════════════════════════════════════
async function reuniaoSalvar({ id, titulo, pauta, participantes, transcricao, ata } = {}) {
  const sql = await getSql();
  const rid = id || novoId('reu');
  await sql`INSERT INTO pmo_reunioes (id, titulo, pauta, participantes, transcricao, ata)
    VALUES (${rid}, ${titulo || 'Reunião de projetos'}, ${pauta || null},
      ${JSON.stringify(participantes || [])}, ${JSON.stringify(transcricao || [])}, ${ata || null})
    ON CONFLICT (id) DO UPDATE SET titulo=EXCLUDED.titulo, pauta=EXCLUDED.pauta,
      participantes=EXCLUDED.participantes, transcricao=EXCLUDED.transcricao, ata=EXCLUDED.ata`;
  return { id: rid };
}
async function reuniaoList() {
  const sql = await getSql();
  const rows = await sql`SELECT id, titulo, data_hora, pauta, ata, participantes FROM pmo_reunioes ORDER BY data_hora DESC LIMIT 30`;
  return { reunioes: rows };
}
// Ata da reunião de projetos, com foco em decisões e encaminhamentos
async function reuniaoAta({ transcricao = [], titulo, projetos_discutidos = [] } = {}) {
  if (!transcricao.length) throw new Error('Nada foi transcrito nesta reunião');
  const texto = transcricao.map(t => `${t.autor}: ${t.texto}`).join('\n').substring(0, 12000);
  const system = `Você é o(a) secretário(a) do PMO da Atlantyx. A partir da transcrição da reunião de acompanhamento de projetos, escreva a ATA em português do Brasil:
## Projetos tratados (um bloco por projeto)
Para cada um: situação relatada · decisões · pendências
## Decisões da reunião
## Encaminhamentos (o que, quem, até quando — só se foi dito)
## Riscos e bloqueios levantados
Não invente responsável nem prazo que não foi citado. Se algo ficou em aberto, diga que ficou.`;
  const ata = await claudePmo(system, `REUNIÃO: ${titulo || 'Acompanhamento de projetos'}
${projetos_discutidos.length ? 'PROJETOS NA PAUTA: ' + projetos_discutidos.join(', ') : ''}

TRANSCRIÇÃO:
${texto}`, 1800);
  const r = await reuniaoSalvar({ titulo, transcricao, ata });
  return { ata, reuniao_id: r.id };
}
// ═══ v2.18: AGENDA DO GERENTE DE PROJETOS ═══
// Junta tudo que tem data: marcos (financeiro), reuniões (PMO), reports pendentes, compromissos manuais.
async function agendaGP({ dias = 30 } = {}) {
  const sql = await getSql();
  await sql`CREATE TABLE IF NOT EXISTS pmo_compromissos (
    id TEXT PRIMARY KEY, titulo TEXT NOT NULL, data DATE NOT NULL, hora TEXT,
    projeto TEXT, tipo TEXT DEFAULT 'compromisso', notas TEXT, concluido BOOLEAN DEFAULT false,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // v3.237: dia de Brasília
  const fim = new Date(Date.now() + dias * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const itens = [];

  // 1. Marcos de projeto (financeiro) — com data prevista no horizonte OU atrasados
  try {
    // v3.215: as colunas certas são data_entrega/status_kanban e a tabela projetos_financeiros (antes a consulta falhava
    // calada e nenhum marco aparecia na agenda)
    const marcos = await sql`SELECT m.id, m.descricao, m.data_entrega, m.valor, m.status_kanban, m.projeto_id,
        p.nome AS projeto FROM projetos_marcos m LEFT JOIN projetos_financeiros p ON p.id = m.projeto_id
      WHERE COALESCE(m.status_kanban,'') NOT IN ('concluido','cancelado') AND m.data_pagamento IS NULL
        AND m.data_entrega IS NOT NULL AND m.data_entrega <= ${fim}
      ORDER BY m.data_entrega`;
    marcos.forEach(m => {
      const d = (m.data_entrega instanceof Date ? m.data_entrega.toISOString() : String(m.data_entrega)).substring(0, 10);
      itens.push({ tipo: 'marco', data: d, titulo: m.descricao, projeto: m.projeto, valor: num(m.valor),
        status: m.status_kanban, atrasado: d < hoje, id: m.id, acao: 's3marcoskanban' });
    });
  } catch (e) { console.warn('[agenda] marcos:', e.message); }

  // 2. Reuniões do PMO — v3.148: a coluna é data_hora (antes consultava data_reuniao/projetos_discutidos, que não existem,
  //    e o erro era engolido: nenhuma reunião aparecia na agenda)
  try {
    const reun = await sql`SELECT id, titulo, data_hora, pauta FROM pmo_reunioes
      WHERE data_hora >= ${hoje + 'T00:00:00-03:00'} AND data_hora <= ${fim + 'T23:59:59-03:00'} ORDER BY data_hora`;
    reun.forEach(r => { const dt = new Date(new Date(r.data_hora).getTime() - 3 * 3600000).toISOString();
      itens.push({ tipo: 'reuniao', data: dt.substring(0, 10), hora: dt.substring(11, 16), titulo: r.titulo, notas: r.pauta ? String(r.pauta).substring(0, 160) : null, id: r.id, acao: 's9sala' }); });
  } catch (e) { console.warn('[agenda] reuniões:', e.message); }
  // 2b. v3.148: ritos semanais (S0 · Reuniões Semanais) — cada ocorrência no horizonte entra na agenda
  try {
    const ritos = await sql`SELECT id, nome, dia_semana, hora, duracao_min FROM reu_ritos WHERE ativo`;
    for (const r of ritos) for (let d = hoje; d <= fim; d = new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().substring(0, 10)) {
      const w = new Date(d + 'T12:00:00Z').getUTCDay() || 7; if (w !== +r.dia_semana) continue;
      itens.push({ tipo: 'reuniao', data: d, hora: r.hora, titulo: 'Reunião semanal · ' + r.nome, notas: (r.duracao_min || 60) + ' min · pauta montada pelo sistema na véspera', id: r.id, acao: 's0ritos' });
    }
  } catch (_) { /* módulo de reuniões ainda não usado: tabela inexistente */ }

  // 3. Reports pendentes — projetos do ciclo sem report na semana
  let reportsPendentes = [];
  try {
    // v3.148: as colunas são projeto_nome (antes "projeto", inexistente — os reports pendentes nunca apareciam)
    const cfg = await sql`SELECT projeto_nome AS projeto FROM pmo_projetos_config WHERE ativo IS NOT FALSE`;
    const ult = await sql`SELECT projeto_nome AS projeto, MAX(data_report) AS ultimo FROM status_reports GROUP BY projeto_nome`;
    const mapa = {}; ult.forEach(u => mapa[u.projeto] = u.ultimo);
    const corte = new Date(Date.now() - 7 * 86400000);
    cfg.forEach(c => {
      const u = mapa[c.projeto];
      if (!u || new Date(u) < corte) {
        reportsPendentes.push(c.projeto);
        // próxima sexta = prazo do ciclo
        const d = new Date(); const dow = d.getDay(); d.setDate(d.getDate() + ((5 - dow + 7) % 7 || 7));
        itens.push({ tipo: 'report', data: d.toISOString().split('T')[0], titulo: 'Status report pendente', projeto: c.projeto,
          atrasado: !u || (Date.now() - new Date(u)) > 14 * 86400000, acao: 's9status' });
      }
    });
  } catch (e) { console.warn('[agenda] reports:', e.message); }

  // 4. Compromissos manuais
  try {
    const comp = await sql`SELECT * FROM pmo_compromissos WHERE data >= ${hoje} AND data <= ${fim} AND concluido = false ORDER BY data, hora`;
    comp.forEach(c => itens.push({ tipo: 'compromisso', data: String(c.data).substring(0, 10), hora: c.hora, titulo: c.titulo,
      projeto: c.projeto, notas: c.notas, id: c.id }));
  } catch (_) {}

  itens.sort((a, b) => (a.atrasado ? -1 : 0) - (b.atrasado ? -1 : 0) || a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || ''));
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  return { itens, hoje, ate: fim,
    resumo: { atrasados: itens.filter(i => i.atrasado).length,
      esta_semana: itens.filter(i => i.data >= hoje && i.data <= em7).length,
      marcos_valor: round(itens.filter(i => i.tipo === 'marco').reduce((s, i) => s + (i.valor || 0), 0)),
      reports_pendentes: reportsPendentes.length, projetos_sem_report: reportsPendentes } };
}
async function compromissoSalvar({ id, titulo, data, hora, projeto, notas, concluido } = {}) {
  if (!titulo || !data) throw new Error('título e data obrigatórios');
  const sql = await getSql();
  const cid = id || 'cp_' + Date.now().toString(36);
  await sql`INSERT INTO pmo_compromissos (id, titulo, data, hora, projeto, notas, concluido)
    VALUES (${cid}, ${titulo}, ${data}, ${hora || null}, ${projeto || null}, ${notas || null}, ${!!concluido})
    ON CONFLICT (id) DO UPDATE SET titulo=EXCLUDED.titulo, data=EXCLUDED.data, hora=EXCLUDED.hora,
      projeto=EXCLUDED.projeto, notas=EXCLUDED.notas, concluido=EXCLUDED.concluido`;
  return { id: cid };
}

// ═══ v1.98: CONEXÃO DIRETA COM O BANCO DO MÓDULO DE CRONOGRAMA ═══
// Ler o banco direto é melhor que consumir API: não depende de o outro projeto expor
// endpoints, e dá acesso a qualquer tabela. Basta a connection string em CRONOGRAMA_DATABASE_URL.
let _sqlCrono = null;
async function getSqlCrono() {
  const url = process.env.CRONOGRAMA_DATABASE_URL;
  if (!url) {
    const e = new Error('CRONOGRAMA_DATABASE_URL não configurada.');
    e.dica = 'No Vercel do projeto de cronograma: Storage → o banco → .env.local → copie DATABASE_URL. Cole aqui em Settings → Environment Variables como CRONOGRAMA_DATABASE_URL.';
    throw e;
  }
  if (_sqlCrono) return _sqlCrono;
  const { neon } = await import('@neondatabase/serverless');
  // v3.227: se o banco do fim da URL não existe (ex.: "atlantyx-db"), acha sozinho o banco deste servidor que tem a base do
  // Maestro (tabela atlx_store) e usa ele — o nome escolhido fica gravado em pmo_config (cronodb_banco_auto)
  const trocaBanco = nome => url.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`);
  let salvo = null; try { const r = await (await getSql())`SELECT valor FROM pmo_config WHERE chave = 'cronodb_banco_auto'`; salvo = r[0]?.valor || null; } catch (_) {}
  const tentar = async u => { const s = neon(u); await s`SELECT 1`; return s; };
  try { _sqlCrono = await tentar(url); return _sqlCrono; }
  catch (e) {
    if (!/does not exist/i.test(e.message)) throw e;
    if (salvo) { try { _sqlCrono = await tentar(trocaBanco(salvo)); return _sqlCrono; } catch (_) {} }
    let lista = null; try { lista = await cronoListarBancos(); } catch (_) {}
    for (const b of (lista?.bancos || [])) {
      try { const s = neon(trocaBanco(b.nome)); const t = await s`SELECT to_regclass('public.atlx_store') AS t`; if (!t[0]?.t) continue;
        try { const sq = await getSql(); await sq`INSERT INTO pmo_config (chave, valor, atualizado_em) VALUES ('cronodb_banco_auto', ${b.nome}, NOW()) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`; } catch (_) {}
        console.warn(`[Maestro] banco "${lista.banco_na_url}" da CRONOGRAMA_DATABASE_URL não existe — usando "${b.nome}" (tem a atlx_store)`);
        _sqlCrono = s; return _sqlCrono; } catch (_) {}
    }
    const err = new Error(e.message + (lista?.bancos?.length ? ` — nenhum banco deste servidor tem a base do Maestro (atlx_store). Bancos: ${lista.bancos.map(b => b.nome).join(', ')}` : ''));
    err.dica = 'Confira a CRONOGRAMA_DATABASE_URL no Vercel: ela precisa apontar para o banco do Maestro (atlantyx-vercel-deploy → Storage → .env.local → DATABASE_URL).';
    throw err;
  }
}

// v2.03: quando o banco do nome não existe, conecta num que sabidamente existe e lista os
// nomes reais. Assim você não fica tentando adivinhar entre hífen, underscore e maiúscula.
async function cronoListarBancos() {
  const url = process.env.CRONOGRAMA_DATABASE_URL;
  if (!url) throw new Error('CRONOGRAMA_DATABASE_URL não configurada');
  const { neon } = await import('@neondatabase/serverless');
  const tentativas = [];
  // tenta a URL como está, depois trocando o banco por candidatos que quase sempre existem
  const nomeAtual = (url.match(/\/([^/?]+)(\?|$)/) || [])[1] || '';
  const candidatos = [nomeAtual, 'neondb', 'postgres', 'defaultdb'].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const nome of candidatos) {
    const u = url.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`);
    try {
      const s = neon(u);
      const bancos = await s`SELECT datname, pg_size_pretty(pg_database_size(datname)) AS tamanho
        FROM pg_database WHERE datistemplate = false ORDER BY pg_database_size(datname) DESC`;
      return { conectou_em: nome, bancos: bancos.map(b => ({ nome: b.datname, tamanho: b.tamanho })),
        tentativas, banco_na_url: nomeAtual };
    } catch (e) { tentativas.push({ banco: nome, erro: String(e.message).substring(0, 120) }); }
  }
  const err = new Error('Não consegui conectar em nenhum banco deste servidor.');
  err.tentativas = tentativas;
  throw err;
}

// Descobre o que existe no outro banco — sem isso é chute
async function cronoSchema({ tabela } = {}) {
  let sql;
  try { sql = await getSqlCrono(); }
  catch (e) { throw e; }
  // Teste de conexão antes de qualquer consulta, para dar erro útil
  try { await sql`SELECT 1`; }
  catch (e) {
    if (/does not exist/i.test(e.message)) {
      let lista = null;
      try { lista = await cronoListarBancos(); } catch (_) {}
      const err = new Error(e.message);
      err.dica = lista
        ? `O banco na URL (${lista.banco_na_url}) não existe. Bancos disponíveis neste servidor: ${lista.bancos.map(b => b.nome + ' (' + b.tamanho + ')').join(', ')}. Troque o nome no fim da CRONOGRAMA_DATABASE_URL.`
        : 'Confira o nome do banco no fim da CRONOGRAMA_DATABASE_URL (atenção a hífen vs underscore).';
      err.bancos = lista?.bancos || null;
      throw err;
    }
    throw e;
  }
  if (tabela) {
    const cols = await sql`SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tabela}
      ORDER BY ordinal_position`;
    let amostra = [];
    try { amostra = await _q(sql, `SELECT * FROM ${_id(tabela)} LIMIT 3`); } catch (e) { /* tabela vazia ou sem permissão */ }
    let total = null;
    try { const c = await _q(sql, `SELECT COUNT(*)::int AS n FROM ${_id(tabela)}`); total = c[0]?.n ?? null; } catch (_) {}
    // v1.99: tabelas do tipo "store" (chave-valor com JSON) precisam ser abertas por dentro —
    // as colunas não dizem nada sobre o que está guardado.
    const nomes = cols.map(c => c.column_name.toLowerCase());
    const ehStore = nomes.some(n => ['key','chave','k'].includes(n)) &&
                    nomes.some(n => ['value','valor','v','data','payload','json'].includes(n));
    let chaves = null, exemploValor = null;
    if (ehStore && total) {
      const colChave = cols.find(c => ['key','chave','k'].includes(c.column_name.toLowerCase()))?.column_name;
      const colValor = cols.find(c => ['value','valor','v','data','payload','json'].includes(c.column_name.toLowerCase()))?.column_name;
      try {
        const ks = await _q(sql, `SELECT ${_id(colChave)} AS chave,
          LEFT((${_id(colValor)})::text, 120) AS previa,
          LENGTH((${_id(colValor)})::text) AS tamanho
          FROM ${_id(tabela)} ORDER BY LENGTH((${_id(colValor)})::text) DESC LIMIT 60`);
        chaves = ks.map(k => ({ chave: k.chave, previa: k.previa, tamanho: k.tamanho }));
        if (ks[0]) {
          const v = await _q(sql, `SELECT (${_id(colValor)})::text AS v FROM ${_id(tabela)} WHERE ${_id(colChave)} = $1 LIMIT 1`, [ks[0].chave]);
          exemploValor = String(v[0]?.v || '').substring(0, 1500);
        }
      } catch (e) { chaves = [{ erro: e.message }]; }
      return { tabela, colunas: cols.map(c => ({ nome: c.column_name, tipo: c.data_type })),
        total_registros: total, amostra, tipo: 'chave-valor',
        coluna_chave: colChave, coluna_valor: colValor, chaves, exemplo_valor: exemploValor,
        aviso: 'Esta tabela guarda os dados como chave-valor. O conteúdo real está dentro do campo de valor (JSON), não nas colunas.' };
    }
    return { tabela, colunas: cols.map(c => ({ nome: c.column_name, tipo: c.data_type, aceita_nulo: c.is_nullable === 'YES' })),
      total_registros: total, amostra, tipo: 'relacional' };
  }
  // v1.99: lista também os OUTROS bancos do servidor. Um engano comum é apontar a string
  // para 'neondb' (o padrão) quando os dados estão em outro database — aí tudo parece vazio.
  let outrosBancos = [];
  try {
    const bd = await sql`SELECT datname FROM pg_database
      WHERE datistemplate = false AND datname NOT IN ('postgres') ORDER BY datname`;
    outrosBancos = bd.map(b => b.datname);
  } catch (_) {}
  let bancoAtual = null;
  try { const c = await sql`SELECT current_database() AS db`; bancoAtual = c[0]?.db || null; } catch (_) {}

  const tabelas = await sql`SELECT table_name,
      (SELECT COUNT(*)::int FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema='public') AS n_colunas
    FROM information_schema.tables t
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  // Conta registros de cada uma — ajuda a saber onde estão os dados de verdade
  const comContagem = [];
  for (const t of tabelas) {
    let n = null;
    try { const c = await _q(sql, `SELECT COUNT(*)::int AS n FROM ${_id(t.table_name)}`); n = c[0]?.n ?? null; } catch (_) {}
    comContagem.push({ tabela: t.table_name, colunas: t.n_colunas, registros: n });
  }
  return { tabelas: comContagem.sort((a, b) => (b.registros || 0) - (a.registros || 0)),
    total_tabelas: comContagem.length,
    banco_atual: bancoAtual,
    outros_bancos: outrosBancos.filter(b => b !== bancoAtual),
    aviso_banco: (!comContagem.length || comContagem.every(t => !t.registros)) && outrosBancos.length > 1
      ? `Este banco (${bancoAtual}) está vazio. Há outros no mesmo servidor: ${outrosBancos.filter(b => b !== bancoAtual).join(', ')}. Talvez a connection string precise apontar para outro — troque o nome do banco no fim da URL.`
      : null,
    provaveis: {
      cronograma: comContagem.filter(t => /crono|tarefa|atividad|projeto|etapa|marco|gantt/i.test(t.tabela)).map(t => t.tabela),
      apontamento: comContagem.filter(t => /apont|hora|timesheet|ponto|lancamento/i.test(t.tabela)).map(t => t.tabela),
      pessoas: comContagem.filter(t => /pessoa|colaborador|funcionario|usuario|equipe|membro/i.test(t.tabela)).map(t => t.tabela),
    } };
}

// Consulta livre, somente leitura — para eu mapear os dados com você
// v1.99: lê o conteúdo de uma chave do store
async function cronoLerChave({ tabela, chave, coluna_chave = 'key', coluna_valor = 'value' } = {}) {
  if (!tabela || !chave) throw new Error('tabela e chave obrigatórias');
  const sql = await getSqlCrono();
  const r = await _q(sql, `SELECT (${_id(coluna_valor)})::text AS valor FROM ${_id(tabela)} WHERE ${_id(coluna_chave)} = $1 LIMIT 1`, [chave]);
  const bruto = r[0]?.valor || null;
  if (!bruto) return { chave, encontrado: false };
  let json = null, tipo = 'texto';
  try { json = JSON.parse(bruto); tipo = Array.isArray(json) ? 'array' : 'objeto'; } catch (_) {}
  return { chave, encontrado: true, tipo, tamanho: bruto.length,
    total_itens: Array.isArray(json) ? json.length : null,
    campos: Array.isArray(json) && json[0] && typeof json[0] === 'object' ? Object.keys(json[0])
          : (json && typeof json === 'object' ? Object.keys(json) : null),
    amostra: Array.isArray(json) ? json.slice(0, 3) : json,
    bruto: json ? null : bruto.substring(0, 2000) };
}

async function cronoConsultar({ sql: query, limite = 50 } = {}) {
  if (!query) throw new Error('consulta obrigatória');
  const q = String(query).trim();
  // Trava de segurança: este conector é só de leitura
  if (!/^select\s/i.test(q)) throw new Error('Somente SELECT é permitido neste conector.');
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i.test(q)) {
    throw new Error('Comando de escrita bloqueado — este conector é somente leitura.');
  }
  const sql = await getSqlCrono();
  const comLimite = /\blimit\b/i.test(q) ? q : `${q.replace(/;+$/, '')} LIMIT ${Math.min(parseInt(limite) || 50, 500)}`;
  const linhas = await _q(sql, comLimite);
  return { linhas, total: linhas.length, consulta: comLimite };
}

// Apontamento de horas — mapeamento configurável, porque não sei os nomes das colunas
async function apontamentoHoras({ projeto, data_inicio, data_fim, tabela, col_projeto, col_pessoa, col_data, col_horas } = {}) {
  const sql = await getSqlCrono();
  const cfgSql = await getSql();
  let cfg = {};
  try {
    const rows = await cfgSql`SELECT chave, valor FROM pmo_config WHERE chave LIKE 'apont_%'`;
    rows.forEach(r => cfg[r.chave.replace('apont_', '')] = r.valor);
  } catch (_) {}

  const T = tabela || cfg.tabela;
  if (!T) {
    const e = new Error('Tabela de apontamento não configurada.');
    e.dica = 'Use "🔍 Explorar banco" para ver as tabelas disponíveis e configurar qual é a de apontamento de horas.';
    throw e;
  }
  const cP = col_projeto || cfg.col_projeto || 'projeto';
  const cU = col_pessoa  || cfg.col_pessoa  || 'colaborador';
  const cD = col_data    || cfg.col_data    || 'data';
  const cH = col_horas   || cfg.col_horas   || 'horas';

  // v3.29 (SEC-018): valores vão como parâmetros ($1…), nomes de coluna validados por _id()
  const cond = [], prm = [];
  if (projeto) { prm.push('%' + String(projeto) + '%'); cond.push(`${_id(cP)}::text ILIKE $${prm.length}`); }
  if (data_inicio) { prm.push(String(data_inicio)); cond.push(`${_id(cD)} >= $${prm.length}`); }
  if (data_fim) { prm.push(String(data_fim)); cond.push(`${_id(cD)} <= $${prm.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

  try {
    const linhas = await _q(sql, `SELECT ${_id(cP)} AS projeto, ${_id(cU)} AS pessoa, ${_id(cD)} AS data,
      SUM((${_id(cH)})::numeric) AS horas FROM ${_id(T)} ${where}
      GROUP BY 1,2,3 ORDER BY 3 DESC LIMIT 2000`, prm);

    const porPessoa = {}, porProjeto = {}, porMes = {};
    let total = 0;
    linhas.forEach(l => {
      const h = parseFloat(l.horas || 0); total += h;
      const p = l.pessoa || '(sem nome)', pr = l.projeto || '(sem projeto)';
      const m = String(l.data || '').substring(0, 7);
      porPessoa[p] = round((porPessoa[p] || 0) + h);
      porProjeto[pr] = round((porProjeto[pr] || 0) + h);
      if (m) porMes[m] = round((porMes[m] || 0) + h);
    });
    return {
      total_horas: round(total), registros: linhas.length,
      por_pessoa: Object.entries(porPessoa).map(([nome, horas]) => ({ nome, horas })).sort((a, b) => b.horas - a.horas),
      por_projeto: Object.entries(porProjeto).map(([nome, horas]) => ({ nome, horas })).sort((a, b) => b.horas - a.horas),
      por_mes: Object.entries(porMes).map(([mes, horas]) => ({ mes, horas })).sort((a, b) => a.mes.localeCompare(b.mes)),
      mapeamento: { tabela: T, projeto: cP, pessoa: cU, data: cD, horas: cH },
    };
  } catch (e) {
    const err = new Error(`Erro ao ler ${T}: ${e.message}`);
    err.dica = `Confira os nomes das colunas. Mapeamento usado: projeto=${_id(cP)}, pessoa=${_id(cU)}, data=${_id(cD)}, horas=${_id(cH)}. Use "🔍 Explorar banco" para ver os nomes reais.`;
    throw err;
  }
}

async function apontamentoConfig({ salvar } = {}) {
  const sql = await getSql();
  await sql`CREATE TABLE IF NOT EXISTS pmo_config (chave TEXT PRIMARY KEY, valor TEXT, atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  if (salvar) {
    for (const [k, v] of Object.entries(salvar)) {
      if (v === undefined) continue;
      await sql`INSERT INTO pmo_config (chave, valor, atualizado_em) VALUES (${'apont_' + k}, ${v || null}, NOW())
        ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
    }
  }
  const rows = await sql`SELECT chave, valor FROM pmo_config WHERE chave LIKE 'apont_%'`;
  const c = {}; rows.forEach(r => c[r.chave.replace('apont_', '')] = r.valor);
  return { config: c, conectado: !!process.env.CRONOGRAMA_DATABASE_URL };
}

// ═══ v3.156: FAROL DOS PROJETOS PELO MÓDULO DE PROJETOS (Maestro · atlantyx-vercel-deploy) ═══
// Lê a MESMA base do módulo de projetos (CRONOGRAMA_DATABASE_URL → atlx_store) e aplica a MESMA regra do
// Painel/Dashboard de Projetos de lá: farol do status report da semana (até 7 dias antes da sexta de referência);
// sem report recente, calcula: 🔴 marco vencido há +7 dias, avanço 10pp abaixo do planejado ou horas acima do contratado;
// 🟡 marco vencido, avanço 5pp abaixo, termo parado há +30 dias ou horas acima de 85% do contratado; senão 🟢.
let _maeCache = null;
async function maestroPainel({ forcar } = {}) {
  if (!forcar && _maeCache && Date.now() - _maeCache.em < 5 * 60000) return _maeCache.v;
  const sql = await getSqlCrono();
  let cfg = {}; try { const sqlCfg = await getSql(); (await sqlCfg`SELECT chave, valor FROM pmo_config WHERE chave LIKE 'cronodb_%'`).forEach(r => cfg[r.chave.replace('cronodb_', '')] = r.valor); } catch (_) {}
  const tabela = cfg.chave && cfg.tabela ? cfg.tabela : 'atlx_store', ck = cfg.chave ? (cfg.col_chave || 'key') : 'key', cv = cfg.chave ? (cfg.col_valor || 'value') : 'value';
  const chaves = ['atlx_projetos_cad', 'atlx_wbs_tasks', 'atlx_proj_marcos', 'atlx_proj_financeiro', 'atlx_apontamentos', 'atlx_status_reports'];
  const rows = await _q(sql, `SELECT ${_id(ck)} AS k, (${_id(cv)})::text AS v FROM ${_id(tabela)} WHERE ${_id(ck)} = ANY($1)`, [chaves]);
  const S = {}; rows.forEach(r => { try { S[r.k] = JSON.parse(r.v); } catch (_) {} });
  const cad = Array.isArray(S.atlx_projetos_cad) ? S.atlx_projetos_cad : [], wbs = S.atlx_wbs_tasks && typeof S.atlx_wbs_tasks === 'object' ? S.atlx_wbs_tasks : {};
  const marcos = Array.isArray(S.atlx_proj_marcos?.marcos) ? S.atlx_proj_marcos.marcos : [], fin = Array.isArray(S.atlx_proj_financeiro?.itens) ? S.atlx_proj_financeiro.itens : [];
  const apt = Array.isArray(S.atlx_apontamentos) ? S.atlx_apontamentos : [], srs = Array.isArray(S.atlx_status_reports) ? S.atlx_status_reports : [];
  const hojeD = new Date(Date.now() - 3 * 3600000), hoje = hojeD.toISOString().substring(0, 10);
  const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().substring(0, 10); };
  const sexta = (() => { const x = new Date(hoje + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 2) % 7)); return x.toISOString().substring(0, 10); })();
  const dias = iso => Math.round((Date.parse(hoje + 'T00:00:00Z') - Date.parse(String(iso).substring(0, 10) + 'T00:00:00Z')) / 864e5);
  const horasTarefa = {}; apt.forEach(a => { if (a.tarefaId) horasTarefa[a.tarefaId] = (horasTarefa[a.tarefaId] || 0) + (parseFloat(a.horas) || 0); });
  const pctFolha = t => { if (t.status === 'Concluída' || parseInt(t.pct) >= 100) return 100; if (t.status === 'Cancelada') return null;
    const he = parseFloat(t.horas) || 0, hr = horasTarefa[t.id] || 0; if (hr > 0) return he > 0 ? Math.min(100, Math.round(hr / he * 100)) : Math.max(parseInt(t.pct) || 0, 10); return parseInt(t.pct) || 0; };
  const pctPrev = t => { let ini = String(t.inicio || '').slice(0, 10), fim = String(t.fim || '').slice(0, 10); if (!fim && !ini) return null; if (!fim) fim = ini; if (!ini) ini = fim;
    if (hoje >= fim) return 100; if (hoje < ini) return 0; const d = x => Date.parse(x + 'T12:00:00Z'), tot = (d(fim) - d(ini)) / 864e5 + 1, dec = (d(hoje) - d(ini)) / 864e5 + 1; return Math.max(0, Math.min(100, Math.round(dec / tot * 100))); };
  const avanco = nome => {
    const ts = Array.isArray(wbs[nome]) ? wbs[nome] : [], folhas = ts.filter((t, i) => !(ts[i + 1] && (ts[i + 1].level || 0) > (t.level || 0)));
    if (folhas.length) { let rp = 0, rw = 0, pp = 0, pw = 0; folhas.forEach(t => { let w = parseFloat(t.horas) || 0; if (!(w > 0)) w = 1; const r = pctFolha(t); if (r === null) return; rp += r * w; rw += w; const pv = pctPrev(t); if (pv !== null) { pp += pv * w; pw += w; } });
      return { fonte: 'cronograma', fisico: rw ? Math.round(rp / rw) : 0, planejado: pw ? Math.round(pp / pw) : null, tarefas_atrasadas: folhas.filter(t => t.fim && String(t.fim).slice(0, 10) < hoje && t.status !== 'Concluída' && t.status !== 'Cancelada' && parseInt(t.pct || 0) < 100).length }; }
    const ms = marcos.filter(m => m.proj === nome);
    if (ms.length) { const cf = ms.filter(m => m.fim); return { fonte: 'marcos', fisico: Math.round(ms.reduce((s, m) => s + (m.status === 'Concluído' ? 100 : parseInt(m.pct || 0)), 0) / ms.length),
      planejado: cf.length ? Math.round(cf.filter(m => String(m.fim).slice(0, 10) <= hoje).length / cf.length * 100) : null, tarefas_atrasadas: 0 }; }
    return { fonte: null, fisico: null, planejado: null, tarefas_atrasadas: 0 };
  };
  const nomes = [...new Set([...cad.map(p => p.nome), ...Object.keys(wbs).filter(k => (wbs[k] || []).length), ...marcos.map(m => m.proj), ...fin.map(f => f.proj)].filter(Boolean))].sort();
  const projetos = nomes.map(nome => {
    const c = cad.find(p => p.nome === nome) || {}, ativo = !/conclu|encerr|cancel|suspens/i.test(c.status || '');
    const horas = apt.filter(a => (a.projeto || a.Projeto) === nome).reduce((s, a) => s + (parseFloat(a.horas || a.Horas) || 0), 0), horasC = parseFloat(c.horas) || 0;
    const atras = marcos.filter(m => m.proj === nome && m.status !== 'Concluído' && m.fim && String(m.fim).slice(0, 10) < hoje).map(m => ({ nome: m.nome, dias: dias(m.fim) }));
    const parados = fin.filter(f => f.proj === nome && !/pago|conclu/i.test(f.status || '') && f.data && dias(f.data) > 30).length;
    const av = avanco(nome), r = srs.filter(x => x.projeto === nome).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))[0] || null;
    const desvio = av.fisico != null && av.planejado != null ? Math.round(av.fisico - av.planejado) : (r && r.pct != null && r.pctPlan != null ? Math.round(parseFloat(r.pct) - parseFloat(r.pctPlan)) : null);
    let farol = r && r.data >= addDias(sexta, -7) ? r.farol : null, origem = farol ? 'status report' : 'calculado';
    const mot = [];
    if (atras.length) mot.push(atras.length + ' marco(s) vencido(s)'); if (desvio != null && desvio < -5) mot.push('avanço ' + Math.abs(desvio) + 'pp abaixo do planejado');
    if (horasC && horas > horasC * .85) mot.push('horas em ' + Math.round(horas / horasC * 100) + '% do contratado'); if (parados) mot.push(parados + ' termo(s) parado(s) +30 dias');
    if (!farol) farol = (atras.some(m => m.dias > 7) || (desvio != null && desvio < -10) || (horasC && horas > horasC)) ? 'vermelho' : (atras.length || (desvio != null && desvio < -5) || parados || (horasC && horas > horasC * .85)) ? 'amarelo' : 'verde';
    const ts = Array.isArray(wbs[nome]) ? wbs[nome] : [], fims = [c.fim, ...ts.map(t => t.fim), ...marcos.filter(m => m.proj === nome).map(m => m.fim)].map(x => String(x || '').slice(0, 10)).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    const conclusao = String(c.fim || '').slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? String(c.fim).slice(0, 10) : (fims[fims.length - 1] || null), pctF = av.fisico ?? null;
    const dias_atraso = conclusao && conclusao < hoje && (pctF == null || pctF < 100) ? dias(conclusao) : 0;
    if (dias_atraso) { mot.unshift('passou da data de conclusão há ' + dias_atraso + ' dia(s)'); if (origem === 'calculado') farol = 'vermelho'; }
    return { nome, cliente: c.cliente || '', gerente: c.gerente || c.gp || '', status: c.status || '', ativo, farol, origem, conclusao, inicio: String(c.inicio || '').slice(0, 10) || null, dias_atraso, pct: av.fisico ?? (r?.pct != null ? parseFloat(r.pct) : null), planejado: av.planejado ?? (r?.pctPlan != null ? parseFloat(r.pctPlan) : null), desvio, motivos: mot, ultimo_report: r?.data || null, avanco_fonte: av.fonte };
  });
  const at = projetos.filter(p => p.ativo);
  const fimMes = hoje.substring(0, 8) + '31', comAv = at.filter(p => p.pct != null), comPl = at.filter(p => p.planejado != null);
  const v = { fonte: 'Módulo de projetos (Maestro)', em: new Date().toISOString(), projetos, resumo: { total: at.length, concluem_mes: at.filter(p => p.conclusao && p.conclusao >= hoje && p.conclusao <= fimMes).length,
    vencidos: at.filter(p => p.dias_atraso > 0).length, avanco_medio: comAv.length ? Math.round(comAv.reduce((s, p) => s + p.pct, 0) / comAv.length) : null, planejado_medio: comPl.length ? Math.round(comPl.reduce((s, p) => s + p.planejado, 0) / comPl.length) : null, verde: at.filter(p => p.farol === 'verde').length, amarelo: at.filter(p => p.farol === 'amarelo').length, vermelho: at.filter(p => p.farol === 'vermelho').length, por_report: at.filter(p => p.origem === 'status report').length } };
  _maeCache = { em: Date.now(), v }; return v;
}

// ═══ v3.226: IMPORTAR DO MAESTRO (módulo de projetos) — marcos de faturamento + projetos novos ═══
// Fonte: a mesma base do Maestro (CRONOGRAMA_DATABASE_URL → atlx_store: atlx_projetos_cad e atlx_proj_marcos).
// • Projeto do Maestro que não existe aqui é criado (id proj_dash_<nome>, o mesmo que o Maestro usa ao enviar).
// • Marco com valor (de faturamento) entra/atualiza com id mk_dash_<id do Maestro> — o mesmo do envio do Maestro, então
//   importar de novo atualiza e não duplica. Valor, data e descrição vêm do Maestro; a etapa aqui nunca volta.
// • Marco IGUAL criado aqui à mão (mesmo projeto e mesma descrição, ou mesmo valor com data até 20 dias) é APAGADO —
//   antes, o andamento dele (etapa, NF, pagamento, termo, previsão, histórico) passa para o importado.
// Sempre em 2 passos: sem executar = prévia; com executar = grava.
const _mNorm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const _mNum = v => { if (typeof v === 'number') return v; let t = String(v || '').replace(/[R$\s]/g, ''); if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.'); return parseFloat(t) || 0; };
const _mData = v => { const t = v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };
const _MK_KEY = { 'Aguardando Entrega': 'aguardando_entrega', 'Liberação GP': 'liberacao_gp', 'Aprovado pelo GP': 'aprovado_gp', 'Elaborando Termo': 'elaborando_termo', 'Termo Pronto': 'termo_pronto', 'Concluído': 'concluido' };
const _MK_ORD = ['aguardando_entrega', 'liberacao_gp', 'aprovado_gp', 'elaborando_termo', 'termo_pronto', 'concluido'];
async function maestroImportarMarcos({ executar = false, incluir_sem_valor = false, projeto_id = null } = {}, req) {
  if (executar) { let s = null; try { s = await lerSessao(req); } catch (_) {}
    if (s && !(s.perfil?.admin || (s.perfil?.telas || []).includes('s3marcoskanban'))) { const e = new Error('Seu perfil não pode importar marcos (precisa da tela Kanban de Marcos).'); e.status = 403; throw e; } }
  const crono = await getSqlCrono(), sql = await getSql();
  const rows = await _q(crono, `SELECT key AS k, (value)::text AS v FROM atlx_store WHERE key = ANY($1)`, [['atlx_projetos_cad', 'atlx_proj_marcos']]);
  const S = {}; rows.forEach(r => { try { S[r.k] = JSON.parse(r.v); } catch (_) {} });
  const cad = Array.isArray(S.atlx_projetos_cad) ? S.atlx_projetos_cad : [];
  const mk = Array.isArray(S.atlx_proj_marcos?.marcos) ? S.atlx_proj_marcos.marcos : (Array.isArray(S.atlx_proj_marcos) ? S.atlx_proj_marcos : []);
  const projs = await sql`SELECT id, nome, cliente, valor_total, status FROM projetos_financeiros`;
  const porNome = new Map(projs.map(p => [_mNorm(p.nome), p]));
  const acharProj = nome => { const n = _mNorm(nome); if (!n) return null; if (porNome.has(n)) return porNome.get(n);
    const parc = projs.filter(p => { const x = _mNorm(p.nome); return x && (x.includes(n) || n.includes(x)); }); return parc.length === 1 ? parc[0] : null; };
  const R = { executado: !!executar, projetos_novos: [], marcos_novos: [], marcos_atualizados: [], duplicados_apagados: [], ignorados: [], sem_valor: 0 };
  // 1) projetos do Maestro que não existem aqui
  let nomesMaestro = [...new Set([...cad.map(c => c.nome), ...mk.map(m => m.proj)].filter(Boolean))];
  // v3.229: só um projeto (botão do card) — só os marcos do Maestro que pertencem a ele; nenhum projeto é criado
  let projAlvo = null;
  if (projeto_id) {
    projAlvo = projs.find(p => p.id === projeto_id); if (!projAlvo) throw new Error('Projeto não encontrado aqui.');
    nomesMaestro = nomesMaestro.filter(n => { const a = acharProj(n); return a && a.id === projAlvo.id; });
    if (!nomesMaestro.length) { const e = new Error('O projeto "' + projAlvo.nome + '" não foi encontrado no Maestro (nenhum projeto lá com esse nome).'); e.status = 404; throw e; }
    R.projeto = { id: projAlvo.id, nome: projAlvo.nome, no_maestro: nomesMaestro };
  }
  const mapaProj = new Map();
  for (const nome of nomesMaestro) {
    const ex = acharProj(nome); if (ex) { mapaProj.set(nome, ex.id); continue; }
    const c = cad.find(x => x.nome === nome) || {};
    const id = 'proj_dash_' + _mNorm(nome).replace(/[^a-z0-9]+/g, '_').slice(0, 50);
    const st = /cancel/i.test(c.status || '') ? 'cancelado' : /conclu|encerr/i.test(c.status || '') ? 'concluido' : 'ativo';
    R.projetos_novos.push({ id, nome, cliente: c.cliente || '', gerente: c.gerente || c.gp || '', valor_total: _mNum(c.valor), status: st });
    mapaProj.set(nome, id);
    if (executar) await sql`INSERT INTO projetos_financeiros (id, nome, cliente, gerente_projeto_nome, valor_total, status, descricao)
      VALUES (${id}, ${String(nome).slice(0, 200)}, ${String(c.cliente || '').slice(0, 200) || null}, ${String(c.gerente || c.gp || '').slice(0, 200) || null}, ${_mNum(c.valor)}, ${st}, ${'Importado do Maestro'})
      ON CONFLICT (id) DO NOTHING`;
  }
  // 2) marcos
  const atuais = await sql`SELECT * FROM projetos_marcos`;
  const porId = new Map(atuais.map(m => [m.id, m]));
  const manuais = atuais.filter(m => !String(m.id).startsWith('mk_dash_'));
  const usados = new Set();
  for (const m of mk) {
    if (projAlvo && !nomesMaestro.includes(m.proj)) continue;
    const nome = String(m.nome || '').trim(), valor = _mNum(m.valor ?? m.aceite_valor), data = _mData(m.fim);
    if (!m.id || !nome) { R.ignorados.push({ marco: nome || '(sem nome)', projeto: m.proj || '', motivo: 'sem nome' }); continue; }
    if (!(valor > 0) && !incluir_sem_valor) { R.sem_valor++; continue; }
    if (!data) { R.ignorados.push({ marco: nome, projeto: m.proj || '', motivo: 'sem data' }); continue; }
    const pid = mapaProj.get(m.proj); if (!pid) { R.ignorados.push({ marco: nome, projeto: m.proj || '', motivo: 'sem projeto' }); continue; }
    const id = 'mk_dash_' + String(m.id).replace(/[^\w-]/g, '').slice(0, 60);
    const ex = porId.get(id);
    // marco igual criado aqui (não veio do Maestro)
    // (mesmo nome repetido em meses diferentes — ex.: "Sustentação" — só casa com data até 45 dias)
    const dist = x => Math.abs((Date.parse(_mData(x.data_entrega) || '1900-01-01') - Date.parse(data)) / 864e5);
    const cands = manuais.filter(x => !usados.has(x.id) && x.projeto_id === pid && ((_mNorm(x.descricao) === _mNorm(nome) && dist(x) <= 45) || (Math.abs(_mNum(x.valor) - valor) <= Math.max(1, valor * 0.01) && dist(x) <= 20)));
    const dup = cands.sort((a, b) => (_mNorm(b.descricao) === _mNorm(nome)) - (_mNorm(a.descricao) === _mNorm(nome)) || dist(a) - dist(b))[0] || null;
    let st = _MK_KEY[m.status] || 'aguardando_entrega';
    const base = ex || dup; if (base && _MK_ORD.indexOf(base.status_kanban) > _MK_ORD.indexOf(st)) st = base.status_kanban; // nunca volta de etapa
    const item = { id, projeto: m.proj, descricao: nome, valor, data_entrega: data, etapa: st };
    if (ex) R.marcos_atualizados.push({ ...item, antes: { valor: _mNum(ex.valor), data_entrega: _mData(ex.data_entrega) } }); else R.marcos_novos.push(item);
    if (dup) { usados.add(dup.id); R.duplicados_apagados.push({ id: dup.id, projeto: m.proj, descricao: dup.descricao, valor: _mNum(dup.valor), data_entrega: _mData(dup.data_entrega), etapa: dup.status_kanban, substituido_por: id }); }
    if (!executar) continue;
    const pct = m.pct === '' || m.pct == null ? null : Math.max(0, Math.min(100, parseFloat(m.pct) || 0));
    await sql`INSERT INTO projetos_marcos (id, projeto_id, descricao, data_entrega, percentual, valor, nota_fiscal, data_pagamento, status_kanban, observacoes)
      VALUES (${id}, ${pid}, ${nome.slice(0, 300)}, ${data}, ${pct}, ${valor}, ${dup?.nota_fiscal || (m.nf ? String(m.nf).slice(0, 100) : null)}, ${dup?.data_pagamento || _mData(m.dataPag)}, ${st}, ${'[Importado do Maestro] ' + String(m.obs || '').slice(0, 900)})
      ON CONFLICT (id) DO UPDATE SET projeto_id = EXCLUDED.projeto_id, descricao = EXCLUDED.descricao, data_entrega = EXCLUDED.data_entrega, valor = EXCLUDED.valor,
        percentual = COALESCE(EXCLUDED.percentual, projetos_marcos.percentual), nota_fiscal = COALESCE(projetos_marcos.nota_fiscal, EXCLUDED.nota_fiscal),
        data_pagamento = COALESCE(projetos_marcos.data_pagamento, EXCLUDED.data_pagamento), status_kanban = EXCLUDED.status_kanban, atualizado_em = NOW()`;
    if (dup) {
      // o andamento do marco daqui passa para o importado, depois ele sai
      await sql`UPDATE projetos_marcos n SET arquivo_termo_url = COALESCE(n.arquivo_termo_url, d.arquivo_termo_url), arquivo_termo_nome = COALESCE(n.arquivo_termo_nome, d.arquivo_termo_nome),
          arquivo_termo_base64 = COALESCE(n.arquivo_termo_base64, d.arquivo_termo_base64), gp_liberacao_aviso_em = COALESCE(n.gp_liberacao_aviso_em, d.gp_liberacao_aviso_em),
          gp_aprovado_em = COALESCE(n.gp_aprovado_em, d.gp_aprovado_em), gp_aprovado_por = COALESCE(n.gp_aprovado_por, d.gp_aprovado_por), fin_termo_iniciado_em = COALESCE(n.fin_termo_iniciado_em, d.fin_termo_iniciado_em),
          fin_termo_pronto_em = COALESCE(n.fin_termo_pronto_em, d.fin_termo_pronto_em), termo_enviado_cliente_em = COALESCE(n.termo_enviado_cliente_em, d.termo_enviado_cliente_em),
          fin_nf_emitida_em = COALESCE(n.fin_nf_emitida_em, d.fin_nf_emitida_em), concluido_em = COALESCE(n.concluido_em, d.concluido_em),
          previsao_receb_manual = COALESCE(n.previsao_receb_manual, d.previsao_receb_manual), previsao_qb_estimate_id = COALESCE(n.previsao_qb_estimate_id, d.previsao_qb_estimate_id),
          previsao_qb_doc = COALESCE(n.previsao_qb_doc, d.previsao_qb_doc), previsao_recebimento = COALESCE(n.previsao_recebimento, d.previsao_recebimento)
        FROM projetos_marcos d WHERE n.id = ${id} AND d.id = ${dup.id}`;
      try { await sql`UPDATE projetos_marcos_log SET marco_id = ${id} WHERE marco_id = ${dup.id}`; } catch (_) {}
      try { await sql`INSERT INTO projetos_marcos_log (id, marco_id, tipo, descricao, ator, criado_em) VALUES (${'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)}, ${id}, 'importacao', ${'Substituiu o marco "' + String(dup.descricao).slice(0, 120) + '" (' + dup.id + ') criado aqui — importado do Maestro'}, 'Importação do Maestro', NOW())`; } catch (_) {}
      // ajustes feitos na Agenda de Receitas para o marco apagado passam para o novo
      try { const kv = await sql`SELECT value FROM kv_store WHERE key = 'fin:receitas_ocorrencias'`; let cfg = kv[0]?.value; if (typeof cfg === 'string') cfg = JSON.parse(cfg);
        if (cfg && cfg['mrc_' + dup.id]) { cfg['mrc_' + id] = cfg['mrc_' + id] || cfg['mrc_' + dup.id]; delete cfg['mrc_' + dup.id];
          await sql`UPDATE kv_store SET value = ${JSON.stringify(cfg)}, updated_at = NOW() WHERE key = 'fin:receitas_ocorrencias'`; } } catch (_) {}
      await sql`DELETE FROM projetos_marcos WHERE id = ${dup.id}`;
    }
  }
  R.resumo = { projetos_novos: R.projetos_novos.length, marcos_novos: R.marcos_novos.length, marcos_atualizados: R.marcos_atualizados.length, duplicados_apagados: R.duplicados_apagados.length, ignorados: R.ignorados.length, sem_valor: R.sem_valor };
  return R;
}

// ═══ v1.95: RAIO-X DO PROJETO ═══
// Cruza três dimensões: cronograma físico (módulo externo), performance da equipe
// e retorno financeiro (receitas × despesas ao longo do projeto).
const CRONO_URL_PADRAO = 'https://atlantyx-vercel-deploy.vercel.app';

async function cronogramaConfig({ salvar } = {}) {
  const sql = await getSql();
  await sql`CREATE TABLE IF NOT EXISTS pmo_config (chave TEXT PRIMARY KEY, valor TEXT, atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  if (salvar) {
    for (const [k, v] of Object.entries(salvar)) {
      if (v === undefined) continue;
      await sql`INSERT INTO pmo_config (chave, valor, atualizado_em) VALUES (${'crono_' + k}, ${v || null}, NOW())
        ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
    }
  }
  const rows = await sql`SELECT chave, valor FROM pmo_config WHERE chave LIKE 'crono_%'`;
  const c = {}; rows.forEach(r => c[r.chave.replace('crono_', '')] = r.valor);
  return {
    url: c.url || process.env.CRONOGRAMA_API_URL || CRONO_URL_PADRAO,
    caminho: c.caminho || '/api/projetos',
    token: c.token || process.env.CRONOGRAMA_API_TOKEN || null,
    configurado: true,
  };
}

// Descobre o formato dos dados — não dá para adivinhar a estrutura de outra base
async function cronogramaTestar({ url, caminho, token } = {}) {
  const cfg = await cronogramaConfig();
  const base = (url || cfg.url || '').replace(/\/$/, '');
  const path = caminho || cfg.caminho;
  const tk = token || cfg.token;
  const alvo = base + (path.startsWith('/') ? path : '/' + path);
  const out = { url_testada: alvo };
  try {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(alvo, { signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } });
    clearTimeout(tm);
    out.http_status = r.status;
    const texto = await r.text();
    if (!r.ok) { out.erro = `HTTP ${r.status}`; out.resposta = texto.substring(0, 400); return { teste: out }; }
    let d; try { d = JSON.parse(texto); } catch { out.erro = 'A resposta não é JSON'; out.resposta = texto.substring(0, 400); return { teste: out }; }
    const lista = Array.isArray(d) ? d : (d.projetos || d.data || d.items || d.results || d.rows || d.tarefas || null);
    out.ok = true;
    out.formato = Array.isArray(d) ? 'array na raiz' : (lista ? 'array dentro do objeto' : 'objeto sem lista');
    out.total = Array.isArray(lista) ? lista.length : null;
    out.campos = Array.isArray(lista) && lista[0] ? Object.keys(lista[0]) : Object.keys(d || {}).slice(0, 40);
    out.amostra = Array.isArray(lista) ? lista.slice(0, 3) : d;
    return { teste: out };
  } catch (e) {
    out.erro = e.name === 'AbortError' ? 'Tempo esgotado (25s)' : e.message;
    return { teste: out };
  }
}

// v2.00: o cronograma agora vem do BANCO do outro módulo, não de uma URL.
// Lê tanto tabela relacional quanto store chave-valor (atlx_store), que é o caso da Atlantyx.
async function cronogramaBuscarBanco({ projeto } = {}) {
  const sqlCfg = await getSql();
  let cfg = {};
  try {
    const rows = await sqlCfg`SELECT chave, valor FROM pmo_config WHERE chave LIKE 'cronodb_%'`;
    rows.forEach(r => cfg[r.chave.replace('cronodb_', '')] = r.valor);
  } catch (_) {}
  if (!cfg.tabela) {
    const e = new Error('Fonte do cronograma não configurada.');
    e.dica = 'Use "🔍 Explorar banco", abra a tabela/chave do cronograma e clique em "Usar como cronograma".';
    throw e;
  }
  const sql = await getSqlCrono();
  let lista = [];

  if (cfg.chave) {
    // store chave-valor: o cronograma está dentro de um JSON
    const r = await _q(sql, 
      `SELECT (${_id(cfg.col_valor || 'value')})::text AS v FROM ${_id(cfg.tabela)} WHERE ${_id(cfg.col_chave || 'key')} = $1 LIMIT 1`,
      [cfg.chave]);
    const bruto = r[0]?.v;
    if (!bruto) return { tarefas: [], erro: `Chave "${cfg.chave}" não encontrada em ${cfg.tabela}` };
    let j; try { j = JSON.parse(bruto); } catch (e) { return { tarefas: [], erro: 'O valor da chave não é JSON válido' }; }
    // v3.215: no Maestro o cronograma (atlx_wbs_tasks) é um objeto { "<nome do projeto>": [tarefas] } — marca cada
    // tarefa com o projeto (antes pegava só o primeiro projeto do objeto e mostrava o cronograma errado)
    if (j && !Array.isArray(j) && typeof j === 'object' && Object.values(j).some(v => Array.isArray(v)) && !j.tarefas && !j.cronograma && !j.atividades && !j.items && !j.data)
      lista = Object.entries(j).flatMap(([proj, ts]) => Array.isArray(ts) ? ts.filter((t, i) => !(ts[i + 1] && (ts[i + 1].level || 0) > (t.level || 0))).map(t => ({ projeto: proj, ...t })) : []);
    else lista = Array.isArray(j) ? j : (j.tarefas || j.cronograma || j.atividades || j.items || j.data || []);
    // pode estar aninhado: { projetos: [ { tarefas: [...] } ] }
    if (!Array.isArray(lista) || !lista.length) {
      const cand = Object.values(j || {}).find(v => Array.isArray(v) && v.length);
      if (cand) lista = cand;
    }
  } else {
    lista = await _q(sql, `SELECT * FROM ${_id(cfg.tabela)} LIMIT 5000`);
  }

  const pega = (o, ...ks) => { for (const k of ks) if (o?.[k] != null && o[k] !== '') return o[k]; return null; };
  const M = (campo, ...padrao) => {
    const custom = cfg['col_' + campo];
    return custom ? [custom, ...padrao] : padrao;
  };
  let tarefas = lista.map(t => ({
    projeto:      pega(t, ...M('projeto','projeto','project','nome_projeto','obra','cliente')),
    tarefa:       pega(t, ...M('tarefa','tarefa','atividade','nome','name','descricao','title','titulo')),
    responsavel:  pega(t, ...M('responsavel','responsavel','executante','owner','assignee','equipe','recurso','colaborador')),
    inicio_prev:  pega(t, ...M('inicio','inicio_previsto','data_inicio','inicio','start','baseline_inicio','dt_inicio')),
    fim_prev:     pega(t, ...M('fim','fim_previsto','data_fim','fim','end','baseline_fim','prazo','dt_fim')),
    inicio_real:  pega(t, 'inicio_real','data_inicio_real','real_start'),
    fim_real:     pega(t, 'fim_real','data_fim_real','real_end','concluido_em'),
    pct:          num(pega(t, ...M('pct','percentual','pct','progresso','progress','avanco','percent_complete','conclusao','pct_concluido'))),
    peso:         num(pega(t, ...M('peso','peso','weight','horas','esforco','duracao'))) || 1,
    status:       pega(t, 'status','situacao','state'),
    _bruto: t,
  }));
  if (projeto) {
    const alvo = String(projeto).toLowerCase();
    const filtradas = tarefas.filter(t => String(t.projeto || '').toLowerCase().includes(alvo)
      || alvo.includes(String(t.projeto || '').toLowerCase()));
    // se o filtro zerar mas há tarefas, provavelmente a base não separa por projeto
    if (filtradas.length) tarefas = filtradas;
    else if (tarefas.length) return { tarefas, total: tarefas.length, fonte: cfg.tabela,
      aviso: `Nenhuma tarefa com o projeto "${projeto}" — mostrando todas as ${tarefas.length}. A base pode não ter coluna de projeto.` };
  }
  return { tarefas, total: tarefas.length, fonte: cfg.tabela + (cfg.chave ? ' / ' + cfg.chave : '') };
}

async function cronogramaConfigBanco({ salvar } = {}) {
  const sql = await getSql();
  await sql`CREATE TABLE IF NOT EXISTS pmo_config (chave TEXT PRIMARY KEY, valor TEXT, atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  if (salvar) {
    for (const [k, v] of Object.entries(salvar)) {
      if (v === undefined) continue;
      await sql`INSERT INTO pmo_config (chave, valor, atualizado_em) VALUES (${'cronodb_' + k}, ${v || null}, NOW())
        ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
    }
  }
  const rows = await sql`SELECT chave, valor FROM pmo_config WHERE chave LIKE 'cronodb_%'`;
  const c = {}; rows.forEach(r => c[r.chave.replace('cronodb_', '')] = r.valor);
  return { config: c, banco_conectado: !!process.env.CRONOGRAMA_DATABASE_URL };
}

async function cronogramaBuscar({ projeto } = {}) {
  // v2.00: prioriza o banco; a API antiga fica como reserva
  try {
    const r = await cronogramaBuscarBanco({ projeto });
    if (r.tarefas?.length || !r.erro) return r;
  } catch (e) {
    if (!process.env.CRONOGRAMA_API_URL) return { tarefas: [], erro: e.message, dica: e.dica };
  }
  return await cronogramaBuscarApi({ projeto });
}

async function cronogramaBuscarApi({ projeto } = {}) {
  const cfg = await cronogramaConfig();
  const alvo = cfg.url.replace(/\/$/, '') + (cfg.caminho.startsWith('/') ? cfg.caminho : '/' + cfg.caminho);
  try {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(alvo, { signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}) } });
    clearTimeout(tm);
    if (!r.ok) return { tarefas: [], erro: `HTTP ${r.status}` };
    const d = await r.json();
    const lista = Array.isArray(d) ? d : (d.projetos || d.tarefas || d.data || d.items || d.rows || []);
    const pega = (o, ...ks) => { for (const k of ks) if (o?.[k] != null && o[k] !== '') return o[k]; return null; };
    let tarefas = lista.map(t => ({
      projeto: pega(t, 'projeto', 'project', 'nome_projeto', 'obra'),
      tarefa: pega(t, 'tarefa', 'atividade', 'nome', 'name', 'descricao', 'title'),
      responsavel: pega(t, 'responsavel', 'executante', 'owner', 'assignee', 'equipe'),
      inicio_prev: pega(t, 'inicio_previsto', 'data_inicio', 'inicio', 'start', 'baseline_inicio'),
      fim_prev: pega(t, 'fim_previsto', 'data_fim', 'fim', 'end', 'baseline_fim', 'prazo'),
      inicio_real: pega(t, 'inicio_real', 'data_inicio_real', 'real_start'),
      fim_real: pega(t, 'fim_real', 'data_fim_real', 'real_end', 'concluido_em'),
      pct: num(pega(t, 'percentual', 'pct', 'progresso', 'progress', 'avanco', 'percent_complete')),
      peso: num(pega(t, 'peso', 'weight', 'horas', 'esforco')) || 1,
      status: pega(t, 'status', 'situacao', 'state'),
      _bruto: t,
    }));
    if (projeto) {
      const alvoN = String(projeto).toLowerCase();
      tarefas = tarefas.filter(t => String(t.projeto || '').toLowerCase().includes(alvoN)
        || alvoN.includes(String(t.projeto || '').toLowerCase()));
    }
    return { tarefas, total: tarefas.length, fonte: alvo };
  } catch (e) { return { tarefas: [], erro: e.message }; }
}

// Análise do cronograma: avanço físico real × planejado
function _analisarCronograma(tarefas) {
  if (!tarefas.length) return null;
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // v3.237: dia de Brasília
  const pesoTotal = tarefas.reduce((s, t) => s + (t.peso || 1), 0) || 1;
  const avancoReal = round(tarefas.reduce((s, t) => s + (t.pct || 0) * (t.peso || 1), 0) / pesoTotal);

  // Planejado: quanto deveria estar pronto hoje, pelas datas previstas
  let planejado = 0;
  tarefas.forEach(t => {
    const ini = t.inicio_prev, fim = t.fim_prev, peso = t.peso || 1;
    if (!ini || !fim) return;
    let p = 0;
    if (hoje >= fim) p = 100;
    else if (hoje > ini) {
      const total = (new Date(fim) - new Date(ini)) || 1;
      p = Math.max(0, Math.min(100, ((new Date(hoje) - new Date(ini)) / total) * 100));
    }
    planejado += p * peso;
  });
  planejado = round(planejado / pesoTotal);

  const atrasadas = tarefas.filter(t => t.fim_prev && t.fim_prev < hoje && (t.pct || 0) < 100);
  const concluidas = tarefas.filter(t => (t.pct || 0) >= 100).length;
  const emAndamento = tarefas.filter(t => (t.pct || 0) > 0 && (t.pct || 0) < 100).length;
  const spi = planejado > 0 ? round(avancoReal / planejado) : null;

  return {
    total_tarefas: tarefas.length, concluidas, em_andamento: emAndamento,
    nao_iniciadas: tarefas.length - concluidas - emAndamento,
    avanco_real: avancoReal, avanco_planejado: planejado,
    desvio: round(avancoReal - planejado),
    spi, situacao: spi == null ? 'sem base' : spi >= 0.95 ? 'no prazo' : spi >= 0.85 ? 'atenção' : 'atrasado',
    atrasadas: atrasadas.slice(0, 15).map(t => ({ tarefa: t.tarefa, responsavel: t.responsavel,
      fim_previsto: t.fim_prev, pct: t.pct,
      dias_atraso: Math.floor((new Date(hoje) - new Date(t.fim_prev)) / 86400000) })),
    qtd_atrasadas: atrasadas.length,
  };
}

// Performance por responsável
function _performanceEquipe(tarefas) {
  const porPessoa = {};
  tarefas.forEach(t => {
    const p = t.responsavel || '(sem responsável)';
    porPessoa[p] = porPessoa[p] || { nome: p, total: 0, concluidas: 0, atrasadas: 0, soma_pct: 0, peso: 0 };
    const r = porPessoa[p];
    r.total++; r.soma_pct += (t.pct || 0) * (t.peso || 1); r.peso += (t.peso || 1);
    if ((t.pct || 0) >= 100) r.concluidas++;
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // v3.237: dia de Brasília
    if (t.fim_prev && t.fim_prev < hoje && (t.pct || 0) < 100) r.atrasadas++;
  });
  return Object.values(porPessoa).map(r => ({
    nome: r.nome, tarefas: r.total, concluidas: r.concluidas, atrasadas: r.atrasadas,
    avanco_medio: round(r.peso ? r.soma_pct / r.peso : 0),
    taxa_conclusao: round(r.total ? (r.concluidas / r.total) * 100 : 0),
    situacao: r.atrasadas === 0 ? 'ok' : r.atrasadas <= 2 ? 'atenção' : 'crítico',
  })).sort((a, b) => b.atrasadas - a.atrasadas || b.tarefas - a.tarefas);
}

async function raioXProjeto({ projeto, projeto_id } = {}) {
  if (!projeto) throw new Error('Informe o nome do projeto');
  const sql = await getSql();
  const out = { projeto, gerado_em: new Date().toISOString() };

  // 1. CRONOGRAMA FÍSICO (módulo externo)
  const cr = await cronogramaBuscar({ projeto });
  out.cronograma = cr.erro ? { erro: cr.erro, aviso: 'Não consegui ler o cronograma. Configure a fonte em ⚙ Cronograma.' }
    : (_analisarCronograma(cr.tarefas) || { aviso: 'Nenhuma tarefa encontrada para este projeto na base de cronograma.' });
  out.equipe = cr.tarefas?.length ? _performanceEquipe(cr.tarefas) : [];

  // 2. FINANCEIRO — receitas e despesas do projeto ao longo do tempo
  const fin = { receitas: [], despesas: [], erro: null };
  try {
    // Receitas: termos de faturamento do projeto
    const termos = await sql`SELECT numero_termo, periodo_medicao, valor_total_termo, status,
        criado_em, aprovado_em FROM termos_faturamento
      WHERE projeto ILIKE ${'%' + projeto + '%'} ORDER BY criado_em`;
    fin.receitas = termos.map(t => ({
      referencia: t.numero_termo || t.periodo_medicao,
      data: String(t.aprovado_em || t.criado_em || '').substring(0, 10),
      valor: num(t.valor_total_termo), status: t.status,
      recebido: ['pagamento', 'concluido'].includes(t.status),
    }));
  } catch (e) { fin.erro = e.message; }
  try {
    const desp = await sql`SELECT descricao, valor, data_prevista, pago, categoria
      FROM despesas_programadas WHERE projeto ILIKE ${'%' + projeto + '%'} ORDER BY data_prevista`;
    fin.despesas = desp.map(d => ({ descricao: d.descricao, data: String(d.data_prevista || '').substring(0, 10),
      valor: num(d.valor), pago: !!d.pago, categoria: d.categoria }));
  } catch (_) { /* a tabela pode não ter a coluna projeto */ }

  const receitaTotal = round(fin.receitas.reduce((s, r) => s + r.valor, 0));
  const receitaRecebida = round(fin.receitas.filter(r => r.recebido).reduce((s, r) => s + r.valor, 0));
  const despesaTotal = round(fin.despesas.reduce((s, d) => s + d.valor, 0));
  const despesaPaga = round(fin.despesas.filter(d => d.pago).reduce((s, d) => s + d.valor, 0));
  const lucro = round(receitaTotal - despesaTotal);
  const margem = receitaTotal > 0 ? round((lucro / receitaTotal) * 100) : null;

  // Linha do tempo mês a mês
  const porMes = {};
  fin.receitas.forEach(r => { if (!r.data) return; const m = r.data.substring(0, 7);
    porMes[m] = porMes[m] || { mes: m, receita: 0, despesa: 0 }; porMes[m].receita = round(porMes[m].receita + r.valor); });
  fin.despesas.forEach(d => { if (!d.data) return; const m = d.data.substring(0, 7);
    porMes[m] = porMes[m] || { mes: m, receita: 0, despesa: 0 }; porMes[m].despesa = round(porMes[m].despesa + d.valor); });
  let acum = 0;
  const linhaTempo = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => { const res = round(m.receita - m.despesa); acum = round(acum + res);
      return { ...m, resultado: res, acumulado: acum }; });

  out.financeiro = {
    receita_total: receitaTotal, receita_recebida: receitaRecebida, receita_a_receber: round(receitaTotal - receitaRecebida),
    despesa_total: despesaTotal, despesa_paga: despesaPaga,
    lucro, margem_pct: margem,
    linha_tempo: linhaTempo,
    qtd_termos: fin.receitas.length, qtd_despesas: fin.despesas.length,
    erro: fin.erro,
  };

  // 3. RAIO-X: cruzamento físico × financeiro
  const avanco = out.cronograma?.avanco_real;
  const pctReceita = receitaTotal > 0 ? round((receitaRecebida / receitaTotal) * 100) : null;
  const alertas = [];
  if (avanco != null && pctReceita != null && avanco - pctReceita > 15) {
    alertas.push({ g: 'alta', txt: `Obra ${avanco}% executada mas só ${pctReceita}% recebido — há entrega feita sem faturamento correspondente.` });
  }
  if (avanco != null && despesaTotal > 0 && receitaTotal > 0) {
    const consumo = round((despesaTotal / receitaTotal) * 100);
    if (consumo > avanco + 15) alertas.push({ g: 'alta', txt: `${consumo}% do orçamento consumido para ${avanco}% de avanço — risco de estouro.` });
  }
  if (margem != null && margem < 10) alertas.push({ g: margem < 0 ? 'alta' : 'media', txt: `Margem de ${margem}%${margem < 0 ? ' — o projeto está dando prejuízo' : ' — abaixo do saudável'}.` });
  if (out.cronograma?.qtd_atrasadas > 0) alertas.push({ g: out.cronograma.qtd_atrasadas > 5 ? 'alta' : 'media', txt: `${out.cronograma.qtd_atrasadas} tarefa(s) com prazo vencido.` });
  const semResp = out.equipe.find(e => e.nome === '(sem responsável)');
  if (semResp) alertas.push({ g: 'media', txt: `${semResp.tarefas} tarefa(s) sem responsável definido.` });

  out.raio_x = {
    avanco_fisico: avanco, pct_receita_recebida: pctReceita,
    consumo_orcamento_pct: receitaTotal > 0 ? round((despesaTotal / receitaTotal) * 100) : null,
    lucro, margem_pct: margem, alertas,
    veredito: alertas.some(a => a.g === 'alta') ? 'requer ação' : alertas.length ? 'atenção' : 'saudável',
  };
  return out;
}

// v1.64: PAINEL MESTRE — uma linha por projeto, visão executiva de todos de uma vez.
// Junta o cadastro de projetos (sistema externo) com o último status report de cada um,
// e sinaliza quem não atualizou no ciclo da semana.
function semanaDe(data) {
  const d = new Date((data || new Date().toISOString().split('T')[0]) + 'T12:00:00');
  const dia = d.getDay();                       // 0=dom
  const sexta = new Date(d); sexta.setDate(d.getDate() - ((dia + 2) % 7)); // sexta anterior/atual
  return sexta.toISOString().split('T')[0];
}
async function painelMestre({ semana } = {}) {
  const sql = await getSql();
  const { projetos, fonte, aviso } = await projetosListar();
  const { ultimos } = await reportList({ limite: 300 });
  let cfg = [];
  try { cfg = await sql`SELECT * FROM pmo_projetos_config WHERE ativo = true`; } catch (_) {}
  const cfgPorNome = {};
  cfg.forEach(c => cfgPorNome[c.projeto_nome] = c);

  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // v3.237: dia de Brasília
  const semanaAtual = semana || semanaDe(hoje);
  const porNome = {};
  ultimos.forEach(r => porNome[r.projeto_nome] = r);
  // v3.22: sem status report, as colunas Gerente/Avanço/Desvio/Próximo marco ficavam vazias. Usamos o
  // cadastro financeiro do projeto (gerente) e os marcos (avanço = % dos marcos concluídos; planejado =
  // % dos marcos com entrega até hoje; próximo marco = o próximo não concluído).
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const fin = {};
  try {
    const pf = await sql`SELECT id, nome, gerente_projeto_nome FROM projetos_financeiros`;
    const mk = await sql`SELECT projeto_id, descricao, data_entrega, percentual, valor, status_kanban FROM projetos_marcos ORDER BY data_entrega ASC`;
    pf.forEach(p => {
      const ms = mk.filter(m => m.projeto_id === p.id).map(m => ({ ...m, data: String(m.data_entrega).substring(0, 10), conc: m.status_kanban === 'concluido' || ['termo_pronto'].includes(m.status_kanban) }));
      const peso = m => num(m.percentual) || 0;
      const totPeso = ms.reduce((a, m) => a + peso(m), 0);
      const pctDe = lista => ms.length ? Math.round((totPeso > 0 ? lista.reduce((a, m) => a + peso(m), 0) / totPeso : lista.length / ms.length) * 1000) / 10 : null;
      const prox = ms.find(m => !m.conc);
      fin[norm(p.nome)] = { gerente: p.gerente_projeto_nome || null, pct_real: pctDe(ms.filter(m => m.conc)), pct_plan: pctDe(ms.filter(m => m.data <= hoje)),
        proximo: prox ? { descricao: prox.descricao, data: prox.data, valor: num(prox.valor) } : null, marcos: ms.length };
    });
  } catch (_) {}

  // Une o que vem do sistema externo com o que só existe em report
  // v3.215: farol, avanço, planejado, gerente e último report vêm do Maestro (mesma regra do painel de lá);
  // um status report local mais recente continua valendo por cima (com riscos, bloqueios e ações)
  const mae = {}; try { if (process.env.CRONOGRAMA_DATABASE_URL) (await maestroPainel()).projetos.forEach(p => { mae[norm(p.nome)] = p; }); } catch (_) {}
  const usarMae = Object.keys(mae).length > 0;
  const nomes = new Set([...projetos.map(p => p.nome), ...ultimos.map(u => u.projeto_nome), ...(usarMae ? [] : cfg.map(c => c.projeto_nome))].filter(n => !usarMae || !mae[norm(n)] || mae[norm(n)].ativo));
  const linhas = [...nomes].map(nome => {
    const p = projetos.find(x => x.nome === nome) || {};
    const r = porNome[nome] || null;
    const c = cfgPorNome[nome] || {};
    const tipo = r?.tipo_projeto || c.tipo_projeto || 'entrega';
    const diasSemReport = r?.data_report ? Math.floor((new Date(hoje) - new Date(r.data_report)) / 86400000) : null;
    const f = fin[norm(nome)] || {}; const M = mae[norm(nome)] || null;
    const ultRep = [r?.data_report, M?.ultimo_report].filter(Boolean).map(x => String(x).substring(0, 10)).sort().pop() || null;
    const localMaisNovo = r?.data_report && (!M?.ultimo_report || String(r.data_report).substring(0, 10) >= String(M.ultimo_report).substring(0, 10));
    const pctReal = (localMaisNovo ? num(r?.pct_concluido) : null) ?? M?.pct ?? r?.pct_concluido ?? (p.pct || (f.pct_real ?? null));
    const pctPlan = (localMaisNovo ? num(r?.pct_planejado) : null) ?? M?.planejado ?? (r?.pct_planejado != null ? num(r.pct_planejado) : null) ?? f.pct_plan ?? null;
    const desvio = (pctReal != null && pctPlan != null) ? Math.round((pctReal - pctPlan) * 10) / 10 : null;
    const proxRep = r?.marcos_proximos || [];
    return {
      projeto: nome,
      tipo,
      gerente: r?.gerente || M?.gerente || p.gerente || c.gerente || f.gerente || null,
      farol: (localMaisNovo ? r?.farol : null) || M?.farol || r?.farol || null,
      farol_origem: localMaisNovo && r?.farol ? 'status report (Atlantyx OS)' : M?.farol ? (M.origem === 'status report' ? 'status report (Maestro)' : 'calculado pelo Maestro') : null,
      motivos: M?.motivos || [], conclusao: M?.conclusao || null, dias_atraso: M?.dias_atraso || 0, cliente: M?.cliente || p.cliente || null,
      pct_concluido: pctReal,
      pct_planejado: pctPlan,
      desvio_pct: desvio,
      avanco_fonte: localMaisNovo && r?.pct_concluido != null ? 'status_report' : M?.pct != null ? 'maestro_' + (M.avanco_fonte || 'calculo') : r?.pct_concluido != null ? 'status_report' : (f.pct_real != null ? 'marcos' : null),
      marcos_proximos: proxRep.length ? proxRep : (f.proximo ? [{ descricao: f.proximo.descricao + ' (' + f.proximo.data.split('-').reverse().join('/') + ')', data: f.proximo.data }] : []),
      tem_report: !!r,
      riscos: (r?.riscos || []).length,
      bloqueios: (r?.bloqueios || []).length,
      acoes_abertas: (r?.acoes || []).filter(a => !a.concluida).length,
      // sustentação
      chamados_abertos: r?.chamados_abertos ?? null,
      sla_cumprido_pct: r?.sla_cumprido_pct ?? null,
      sla_violacoes: r?.sla_violacoes ?? null,
      // controle de cadência
      ultimo_report: ultRep,
      dias_sem_report: ultRep ? Math.floor((new Date(hoje) - new Date(ultRep)) / 86400000) : diasSemReport,
      atualizado_na_semana: ultRep ? ultRep >= semanaAtual : false,
      report_id: r?.id || null,
      resumo: r?.resumo || (M?.motivos?.length ? M.motivos.join(' · ') : null),
      horas_previstas: r?.horas_previstas ?? p.horas_previstas ?? null,
      horas_realizadas: r?.horas_realizadas ?? p.horas_realizadas ?? null,
    };
  });

  // Ordem executiva: vermelho > amarelo > sem report > verde
  const peso = l => l.farol === 'vermelho' ? 0 : l.farol === 'amarelo' ? 1 : !l.farol ? 2 : 3;
  linhas.sort((a, b) => peso(a) - peso(b) || (b.bloqueios - a.bloqueios) || a.projeto.localeCompare(b.projeto));

  const pendentes = linhas.filter(l => !l.atualizado_na_semana);
  return {
    painel: linhas, fonte: usarMae ? 'maestro' : fonte, aviso, semana_ref: semanaAtual,
    resumo: {
      total: linhas.length,
      verde: linhas.filter(l => l.farol === 'verde').length,
      amarelo: linhas.filter(l => l.farol === 'amarelo').length,
      vermelho: linhas.filter(l => l.farol === 'vermelho').length,
      sem_report: linhas.filter(l => !l.farol).length,
      atualizados_na_semana: linhas.length - pendentes.length,
      pendentes_de_atualizacao: pendentes.map(p => p.projeto),
      com_bloqueio: linhas.filter(l => l.bloqueios > 0).length,
      // O que precisa de reunião: amarelos e vermelhos (verdes só leitura)
      para_discutir: linhas.filter(l => l.farol === 'amarelo' || l.farol === 'vermelho' || !l.farol).map(l => l.projeto),
    },
  };
}

// v1.64: cadastro dos projetos do ciclo (os 8) com o tipo de template de cada um
async function projetosConfigSalvar({ projetos = [] } = {}) {
  const sql = await getSql();
  let n = 0;
  for (const p of projetos) {
    if (!p.nome) continue;
    await sql`INSERT INTO pmo_projetos_config (projeto_nome, tipo_projeto, gerente, ativo, ordem, atualizado_em)
      VALUES (${p.nome}, ${p.tipo === 'sustentacao' ? 'sustentacao' : 'entrega'}, ${p.gerente || null},
        ${p.ativo !== false}, ${parseInt(p.ordem) || 0}, NOW())
      ON CONFLICT (projeto_nome) DO UPDATE SET tipo_projeto = EXCLUDED.tipo_projeto,
        gerente = EXCLUDED.gerente, ativo = EXCLUDED.ativo, ordem = EXCLUDED.ordem, atualizado_em = NOW()`;
    n++;
  }
  return { salvos: n };
}
async function projetosConfigList() {
  const sql = await getSql();
  const rows = await sql`SELECT * FROM pmo_projetos_config ORDER BY ordem, projeto_nome`;
  return { config: rows };
}

// v1.63: GERENTE DE PROJETO IA — participa da reunião como um gerente de verdade:
// cobra prazo, aponta risco que ninguém mencionou, questiona percentual sem entrega.
// Diferente do "assistente" (que só consulta), este OPINA e provoca.
async function gerenteProjetoIA({ pergunta, historico = [], modo = 'responder' } = {}) {
  const { projetos, fonte, aviso } = await projetosListar();
  const { ultimos, resumo } = await reportList({ limite: 100 });

  const dados = {
    projetos: projetos.map(p => ({ nome: p.nome, gerente: p.gerente, status: p.status, pct: p.pct,
      horas_previstas: p.horas_previstas, horas_realizadas: p.horas_realizadas, fim: p.fim })),
    status_reports: ultimos.map(u => ({ projeto: u.projeto_nome, farol: u.farol, pct: u.pct_concluido,
      data: u.data_report, gerente: u.gerente, riscos: u.riscos, bloqueios: u.bloqueios,
      horas_prev: u.horas_previstas, horas_real: u.horas_realizadas })),
    resumo_farois: resumo,
  };

  const system = `Você é ORION, Gerente de Projetos IA da Atlantyx, participando de uma reunião de acompanhamento com os gerentes humanos e o CIO.

Seu papel NÃO é resumir dados — é agir como um gerente de projetos experiente:
- Cobre o que está atrasado, mas sem acusar: pergunte o que está travando
- Aponte riscos que ninguém mencionou (ex.: horas consumidas acima do avanço, projeto sem report há muito tempo, bloqueio que se repete entre reports)
- Questione número que não fecha: percentual que subiu sem entrega, farol verde com bloqueio aberto, prazo mantido sem plano
- Sugira encaminhamento concreto quando fizer sentido (quem faz o quê)

REGRAS:
- Máximo 100 palavras. É fala de reunião, não relatório. Texto corrido, sem markdown.
- Baseie-se APENAS nos dados abaixo. Se faltar informação, pergunte ao gerente responsável pelo nome.
- NUNCA invente prazo, percentual, entrega ou responsável.
- Se estiver tudo bem no que você vê, diga isso em uma frase — não invente problema.
${modo === 'analise_inicial' ? '- Esta é a ABERTURA da reunião: aponte em ordem de prioridade o que merece atenção hoje, começando pelo mais crítico.' : ''}

DADOS (fonte: ${fonte}${aviso ? ' — ' + aviso : ''}):
${JSON.stringify(dados).substring(0, 4000)}`;

  const msgs = [
    ...historico.slice(-8).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').substring(0, 600) })),
    { role: 'user', content: pergunta || 'Abra a reunião: o que merece atenção hoje nos projetos?' },
  ];
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 50000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, system, messages: msgs }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return { resposta: d.content?.[0]?.text || '', agente: 'ORION · Gerente de Projetos IA', fonte_dados: fonte, aviso };
}

// v1.63: alertas automáticos — o que o gerente IA detecta sozinho, sem ser perguntado
async function alertasProjetos() {
  const { projetos } = await projetosListar();
  const { ultimos } = await reportList({ limite: 100 });
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // v3.237: dia de Brasília
  const alertas = [];
  const diasDesde = (d) => d ? Math.floor((new Date(hoje) - new Date(d)) / 86400000) : null;

  ultimos.forEach(r => {
    // Farol verde com bloqueio aberto é incoerente
    if (r.farol === 'verde' && (r.bloqueios || []).length) {
      alertas.push({ projeto: r.projeto_nome, gravidade: 'alta',
        texto: `Farol verde com ${r.bloqueios.length} bloqueio(s) em aberto — o farol reflete a realidade?` });
    }
    // Report antigo
    const dias = diasDesde(r.data_report);
    if (dias != null && dias > 14) {
      alertas.push({ projeto: r.projeto_nome, gravidade: dias > 30 ? 'alta' : 'media',
        texto: `Sem status report há ${dias} dias (último em ${String(r.data_report).split('-').reverse().join('/')}).` });
    }
    // Horas consumidas acima do avanço
    if (r.horas_previstas > 0 && r.horas_realizadas > 0 && r.pct_concluido > 0) {
      const pctHoras = (r.horas_realizadas / r.horas_previstas) * 100;
      if (pctHoras - r.pct_concluido > 15) {
        alertas.push({ projeto: r.projeto_nome, gravidade: 'alta',
          texto: `${Math.round(pctHoras)}% das horas consumidas para ${r.pct_concluido}% de avanço — risco de estouro.` });
      }
    }
  });
  // Projetos sem nenhum report
  const comReport = new Set(ultimos.map(u => u.projeto_nome));
  projetos.filter(p => p.status !== 'concluido' && !comReport.has(p.nome)).forEach(p => {
    alertas.push({ projeto: p.nome, gravidade: 'media', texto: 'Nenhum status report registrado até agora.' });
  });

  alertas.sort((a, b) => (b.gravidade === 'alta') - (a.gravidade === 'alta'));
  return { alertas, total: alertas.length, criticos: alertas.filter(a => a.gravidade === 'alta').length };
}

// Agente de apoio na reunião: responde sobre os projetos com os dados reais
async function agenteProjetos({ pergunta, historico = [] } = {}) {
  if (!pergunta) throw new Error('pergunta obrigatória');
  const { projetos, fonte, aviso } = await projetosListar();
  const { ultimos, resumo } = await reportList({ limite: 100 });
  const system = `Você é o(a) assistente do PMO da Atlantyx, participando de uma reunião com os gerentes de projeto.
Responda com base APENAS nos dados abaixo. Se um dado não estiver aqui, diga que não tem e sugira quem pode informar.
Seja direto e curto (máximo 120 palavras). Nunca invente prazo, percentual ou responsável.
${aviso ? 'ATENÇÃO SOBRE A FONTE: ' + aviso : ''}

PROJETOS (fonte: ${fonte}): ${JSON.stringify(projetos).substring(0, 3000)}
ÚLTIMOS STATUS REPORTS: ${JSON.stringify(ultimos.map(u => ({ projeto: u.projeto_nome, farol: u.farol, pct: u.pct_concluido, data: u.data_report, bloqueios: u.bloqueios, riscos: u.riscos }))).substring(0, 3000)}
RESUMO DOS FARÓIS: ${JSON.stringify(resumo)}`;
  const msgs = [...historico.slice(-6).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').substring(0, 500) })),
    { role: 'user', content: pergunta }];
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 50000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system, messages: msgs }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return { resposta: d.content?.[0]?.text || '', fonte_dados: fonte, aviso };
}

// ═══════════════════════════════════════════════════════════════════════════
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ success: false, error: 'JSON inválido' }); }
  const { action, payload = {} } = body;

  const acoes = {
    config_get:        () => configGet(),
    config_salvar:     () => configSalvar(payload),
    conector_testar:   () => conectorTestar(payload),
    projetos_listar:   () => projetosListar(),
    report_salvar:     () => reportSalvar(payload),
    report_list:       () => reportList(payload),
    report_get:        () => reportGet(payload),
    report_excluir:    () => reportExcluir(payload),
    report_rascunho:   () => reportRascunho(payload),
    export_registrar:  () => exportRegistrar(payload, req),
    export_resumo:     () => exportResumo(),
    reuniao_salvar:    () => reuniaoSalvar(payload),
    reuniao_list:      () => reuniaoList(),
    reuniao_ata:       () => reuniaoAta(payload),
    agente_projetos:   () => agenteProjetos(payload),
    gerente_projeto:   () => gerenteProjetoIA(payload),
    alertas_projetos:  () => alertasProjetos(),
    painel_mestre:     () => painelMestre(payload),
    maestro_painel:    () => maestroPainel(payload),
    maestro_importar_marcos: () => maestroImportarMarcos(payload, req), // v3.226
    raio_x_projeto:    () => raioXProjeto(payload),
    agenda_gp:         () => agendaGP(payload),
    compromisso_salvar:() => compromissoSalvar(payload),
    crono_config:      () => cronogramaConfig(payload),
    crono_schema:      () => cronoSchema(payload),
    crono_consultar:   () => cronoConsultar(payload),
    crono_ler_chave:   () => cronoLerChave(payload),
    crono_cfg_banco:   () => cronogramaConfigBanco(payload),
    crono_bancos:      () => cronoListarBancos(),
    apont_horas:       () => apontamentoHoras(payload),
    apont_config:      () => apontamentoConfig(payload),
    crono_testar:      () => cronogramaTestar(payload),
    crono_buscar:      () => cronogramaBuscar(payload),
    projetos_config_salvar: () => projetosConfigSalvar(payload),
    projetos_config_list:   () => projetosConfigList(),
    status:            () => ({ ok: true, modulo: 'pmo' }),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try {
    const r = await acoes[action]();
    return res.status(200).json({ success: true, action, ...r });
  } catch (e) {
    console.error('[ERRO pmo]', action, e.message);
    // v3.84: dado faltando/inválido é erro de quem chamou (400), não falha do servidor (500)
    return res.status(e.status || (/obrigat|inválid|informe/i.test(e.message) ? 400 : 500)).json({ success: false, error: e.message, dica: e.dica });
  }
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'pmo');
