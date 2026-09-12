// api/pmo.js — v1.62 · S9 · Projetos
// Sala de reunião com os gerentes de projeto + Status Report (criação e visualização).
// Os dados de projeto podem vir de um sistema EXTERNO (outro projeto no Vercel) — o conector
// é configurável em tempo de execução, sem precisar de novo deploy.

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
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
    try { await sql.query(`ALTER TABLE status_reports ADD COLUMN IF NOT EXISTS ${col}`); } catch (e) { console.warn('[PMO] migração:', e.message); }
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

  const hoje = new Date().toISOString().split('T')[0];
  const semanaAtual = semana || semanaDe(hoje);
  const porNome = {};
  ultimos.forEach(r => porNome[r.projeto_nome] = r);

  // Une o que vem do sistema externo com o que só existe em report
  const nomes = new Set([...projetos.map(p => p.nome), ...ultimos.map(u => u.projeto_nome), ...cfg.map(c => c.projeto_nome)]);
  const linhas = [...nomes].map(nome => {
    const p = projetos.find(x => x.nome === nome) || {};
    const r = porNome[nome] || null;
    const c = cfgPorNome[nome] || {};
    const tipo = r?.tipo_projeto || c.tipo_projeto || 'entrega';
    const diasSemReport = r?.data_report ? Math.floor((new Date(hoje) - new Date(r.data_report)) / 86400000) : null;
    const desvio = (r && r.pct_planejado != null) ? Math.round((r.pct_concluido - r.pct_planejado) * 10) / 10 : null;
    return {
      projeto: nome,
      tipo,
      gerente: r?.gerente || p.gerente || c.gerente || null,
      farol: r?.farol || null,
      pct_concluido: r?.pct_concluido ?? (p.pct || null),
      pct_planejado: r?.pct_planejado ?? null,
      desvio_pct: desvio,
      marcos_proximos: r?.marcos_proximos || [],
      riscos: (r?.riscos || []).length,
      bloqueios: (r?.bloqueios || []).length,
      acoes_abertas: (r?.acoes || []).filter(a => !a.concluida).length,
      // sustentação
      chamados_abertos: r?.chamados_abertos ?? null,
      sla_cumprido_pct: r?.sla_cumprido_pct ?? null,
      sla_violacoes: r?.sla_violacoes ?? null,
      // controle de cadência
      ultimo_report: r?.data_report || null,
      dias_sem_report: diasSemReport,
      atualizado_na_semana: r?.data_report ? r.data_report >= semanaAtual : false,
      report_id: r?.id || null,
      resumo: r?.resumo || null,
      horas_previstas: r?.horas_previstas ?? p.horas_previstas ?? null,
      horas_realizadas: r?.horas_realizadas ?? p.horas_realizadas ?? null,
    };
  });

  // Ordem executiva: vermelho > amarelo > sem report > verde
  const peso = l => l.farol === 'vermelho' ? 0 : l.farol === 'amarelo' ? 1 : !l.farol ? 2 : 3;
  linhas.sort((a, b) => peso(a) - peso(b) || (b.bloqueios - a.bloqueios) || a.projeto.localeCompare(b.projeto));

  const pendentes = linhas.filter(l => !l.atualizado_na_semana);
  return {
    painel: linhas, fonte, aviso, semana_ref: semanaAtual,
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
  const hoje = new Date().toISOString().split('T')[0];
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
export default async function handler(req, res) {
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
    reuniao_salvar:    () => reuniaoSalvar(payload),
    reuniao_list:      () => reuniaoList(),
    reuniao_ata:       () => reuniaoAta(payload),
    agente_projetos:   () => agenteProjetos(payload),
    gerente_projeto:   () => gerenteProjetoIA(payload),
    alertas_projetos:  () => alertasProjetos(),
    painel_mestre:     () => painelMestre(payload),
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
    return res.status(500).json({ success: false, error: e.message });
  }
}
