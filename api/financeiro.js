// api/financeiro.js
// ═══════════════════════════════════════════════════════════════════════════
// Módulo Financeiro S3 — endpoint central
//
// Cobre:
//   1. Extensão QuickBooks (lançamentos linha-a-linha, Contas a Pagar,
//      Budget, saldo de contas bancárias)
//   2. CRUD de lançamentos simulados (persistidos em Neon)
//   3. CRUD de lançamentos ocultos (QB transactions a ignorar no painel)
//   4. CRUD de despesas programadas + geração de ocorrências
//   5. Saldos iniciais por data (snapshot)
//   6. Motor de fluxo de caixa futuro (mês a mês, determinístico)
//   7. KPIs de saúde calculados sem IA (EBITDA, margem, runway, burn...)
//   8. Extrato com saldo acumulado (QB + simulados − ocultos)
//
// Padrão: POST /api/financeiro com { action, params }
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Endpoint de CRON (chamado por Vercel Cron diariamente) ──────────
  // GET /api/financeiro?action=marcos_processar_alertas
  // com header Authorization: Bearer ${CRON_SECRET}
  if (req.method === 'GET') {
    const action = req.query?.action;
    // v1.12: OAuth do QuickBooks — callback do Intuit
    if (req.query?.qb_callback) return qbCallback(req, res);
    if (action === 'qb_auth_url') { try { return res.status(200).json({ success: true, ...qbAuthUrl(req) }); } catch (e) { return res.status(400).json({ success: false, error: e.message }); } }
    // v1.24: cron diário do relatório de pagamentos
    if (action === 'relatorio_pagamentos') {
      const authR = req.headers?.authorization || '';
      if (process.env.CRON_SECRET && authR !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'CRON_SECRET inválido' });
      try { const r = await relatorioPagamentosEnviar({}); return res.status(200).json({ success: true, ...r }); }
      catch (e) { console.error('[CRON relatorio_pagamentos]', e.message); return res.status(500).json({ success: false, error: e.message }); }
    }
    if (action !== 'marcos_processar_alertas') {
      return res.status(400).json({ error: 'GET só aceito para marcos_processar_alertas e relatorio_pagamentos' });
    }
    const auth = req.headers?.authorization || '';
    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'CRON_SECRET inválido' });
    }
    try {
      const r = await marcosProcessarAlertas();
      return res.status(200).json({ success: true, ...r });
    } catch (e) {
      console.error('[CRON marcos]', e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { action, params = {} } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action obrigatório' });

    const acoes = {
      // ── QuickBooks estendido ─────────────────────────────────────────────
      qb_lancamentos:        () => qbLancamentos(params),
      qb_contas_pagar:       () => qbContasPagar(params),
      qb_orcamento:          () => qbOrcamento(params),
      qb_saldo_contas:       () => qbSaldoContas(params),
      qb_status:             () => qbStatus(params),
      relatorio_pagamentos:  () => relatorioPagamentosEnviar(params),
      email_diagnostico:     () => emailDiagnostico(params),
      versao:                () => ({ versao_api: VERSAO_API }),
      fluxo_detalhado:       () => fluxoDetalhado(params),
      qb_diagnostico:        () => qbDiagnostico(),
      qb_contas_diagnostico: () => qbContasDiagnostico(),
      qb_contas_filtro:      () => qbContasParaFiltro(),
      qb_excluir_lancamento: () => qbExcluirLancamento(params),
      qb_razao_conta:        () => qbRazaoConta(params),
      qb_rastrear_duplicados: () => qbRastrearDuplicados(params),
      qb_varrer_duplicados:  () => qbVarrerDuplicados(params),
      qb_conferir_banco:     () => qbConferirComBanco(params),
      qb_saldo_por_conta:    () => qbSaldoPorContaNaData(params),
      gerente_financeiro:    () => gerenteFinanceiro(params),
      dashboard_financeiro:  () => dashboardFinanceiro(params),
      qb_auth_url:           () => qbAuthUrl(req),
      qb_desconectar:        async () => { const sql = await getSql(); await sql`DELETE FROM kv_store WHERE key = 'qb:tokens'`; _qbTokCache = null; return { desconectado: true }; },

      // ── Painel consolidado (frontend chama este) ─────────────────────────
      painel_resumo:         () => painelResumo(params),
      extrato_consolidado:   () => extratoConsolidado(params),

      // ── Lançamentos simulados ────────────────────────────────────────────
      sim_save:              () => simSave(params),
      sim_list:              () => simList(params),
      sim_delete:            () => simDelete(params),

      // ── Lançamentos ocultos (QB → painel ignora) ─────────────────────────
      ocultar_qb:            () => ocultarQB(params),
      desocultar_qb:         () => desocultarQB(params),
      list_ocultos:          () => listOcultos(),

      // ── Despesas programadas ─────────────────────────────────────────────
      desp_save:             () => despSave(params),
      desp_list:             () => despList(params),
      desp_delete:           () => despDelete(params),
      desp_ocorrencias:      () => despOcorrencias(params),
      desp_marcar_paga:      () => despMarcarPaga(params),
      desp_lancar_qb:        () => despLancarQb(params),
      qb_fornecedores_list:  () => qbFornecedoresList(),
      desp_gerar_ocorrencias: () => despGerarOcorrencias(params),

      // ── Saldo inicial (snapshots) ────────────────────────────────────────
      saldo_inicial_save:    () => saldoInicialSave(params),
      saldo_inicial_get:     () => saldoInicialGet(params),

      // ── Motor de fluxo futuro mês a mês ──────────────────────────────────
      fluxo_futuro:          () => fluxoFuturo(params),

      // ── KPIs determinísticos de saúde ────────────────────────────────────
      kpis_saude:            () => kpisSaude(params),

      // ── Conciliação bancária ─────────────────────────────────────────────
      conc_sugestoes:        () => conciliacaoSugestoes(params),
      conc_aprovar:          () => conciliacaoAprovar(params),
      conc_rejeitar:         () => conciliacaoRejeitar(params),
      conc_status:           () => conciliacaoStatus(params),

      // ── Orçamento (QB + interno) ─────────────────────────────────────────
      orcamento_consolidado: () => orcamentoConsolidado(params),

      // ── Extrato por dia / mês (agregações) ───────────────────────────────
      extrato_diario:        () => extratoDiario(params),
      extrato_mensal:        () => extratoMensal(params),

      // ── Projetos financeiros e Marcos (kanban) ───────────────────────────
      projeto_save:          () => projetoSave(params),
      projeto_list:          () => projetoList(params),
      projeto_get:           () => projetoGet(params),
      projeto_delete:        () => projetoDelete(params),
      marco_save:            () => marcoSave(params),
      marco_list:            () => marcoList(params),
      marco_get:             () => marcoGet(params),
      marco_delete:          () => marcoDelete(params),
      marco_mover_status:    () => marcoMoverStatus(params),
      marco_upload_termo:    () => marcoUploadTermo(params),
      marco_enviar_termo:    () => marcoEnviarTermo(params),
      marco_log:             () => marcoLog(params),
      marcos_kanban:         () => marcosKanban(params),
      marcos_importar:       () => marcosImportarPlanilha(params),
      contrato_save:         () => contratoSave(params),
      contrato_list:         () => contratoList(params),
      contrato_delete:       () => contratoDelete(params),
      contratos_importar:    () => contratosImportarPlanilha(params),
      // Disparado por cron (vercel.json): envia avisos 10 dias antes e lembretes
      marcos_processar_alertas: () => marcosProcessarAlertas(params),
    };

    if (!acoes[action]) {
      // v1.26.3: erro autoexplicativo — a causa quase sempre é deploy desatualizado
      return res.status(400).json({
        success: false,
        error: `Ação "${action}" não existe na versão do servidor que está no ar (api/financeiro.js ${VERSAO_API}).`,
        hint: 'O arquivo api/financeiro.js no Vercel está desatualizado. Suba a versão mais recente no GitHub e faça Redeploy.',
        versao_api: VERSAO_API,
        disponiveis: Object.keys(acoes),
      });
    }

    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });

  } catch (error) {
    console.error('[ERRO financeiro]', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DB helper (Neon)
// ═══════════════════════════════════════════════════════════════════════════

let _sqlCache = null;
async function getSql() {
  if (_sqlCache) return _sqlCache;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada');
  const { neon } = await import('@neondatabase/serverless');
  _sqlCache = neon(url);
  await ensureTabelas(_sqlCache);
  return _sqlCache;
}

async function ensureTabelas(sql) {
  await sql`CREATE TABLE IF NOT EXISTS lancamentos_simulados (
    id TEXT PRIMARY KEY,
    data DATE NOT NULL,
    descricao TEXT NOT NULL,
    categoria TEXT,
    tipo TEXT NOT NULL,
    valor NUMERIC(14,2) NOT NULL,
    origem TEXT DEFAULT 'simulado',
    tags JSONB,
    excluido BOOLEAN DEFAULT false,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS lancamentos_ocultos (
    qb_txn_id TEXT PRIMARY KEY,
    motivo TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS despesas_programadas (
    id TEXT PRIMARY KEY,
    descricao TEXT NOT NULL,
    categoria TEXT,
    valor NUMERIC(14,2) NOT NULL,
    recorrencia TEXT NOT NULL,
    dia_vencimento INT,
    data_inicio DATE NOT NULL,
    data_fim DATE,
    ativa BOOLEAN DEFAULT true,
    fornecedor TEXT,
    conta_pagamento TEXT,
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS despesas_ocorrencias (
    id TEXT PRIMARY KEY,
    despesa_id TEXT REFERENCES despesas_programadas(id) ON DELETE CASCADE,
    data_prevista DATE NOT NULL,
    valor NUMERIC(14,2) NOT NULL,
    status TEXT DEFAULT 'prevista',
    data_pagamento DATE,
    qb_txn_id TEXT,
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_desp_ocorr_data ON despesas_ocorrencias(data_prevista)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_desp_ocorr_status ON despesas_ocorrencias(status)`;

  await sql`CREATE TABLE IF NOT EXISTS saldos_iniciais (
    data_ref DATE PRIMARY KEY,
    valor NUMERIC(14,2) NOT NULL,
    descricao TEXT,
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;

  // Conciliação: pareamento entre lançamentos reais (QB/sim) e despesas programadas/AR
  await sql`CREATE TABLE IF NOT EXISTS conciliacoes (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    real_id TEXT NOT NULL,
    real_origem TEXT,
    real_data DATE,
    real_valor NUMERIC(14,2),
    real_descricao TEXT,
    referencia_id TEXT,
    referencia_tipo TEXT,
    referencia_data DATE,
    referencia_valor NUMERIC(14,2),
    referencia_descricao TEXT,
    diferenca_valor NUMERIC(14,2),
    diferenca_dias INT,
    score NUMERIC(5,2),
    status TEXT DEFAULT 'sugestao',
    aprovada_em TIMESTAMPTZ,
    rejeitada_em TIMESTAMPTZ,
    motivo_rejeicao TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conc_status ON conciliacoes(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conc_real ON conciliacoes(real_id)`;

  // Projetos financeiros
  await sql`CREATE TABLE IF NOT EXISTS projetos_financeiros (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cliente TEXT,
    cliente_responsavel_nome TEXT,
    cliente_responsavel_email TEXT,
    gerente_projeto_nome TEXT,
    gerente_projeto_email TEXT,
    financeiro_email TEXT,
    descricao TEXT,
    valor_total NUMERIC(14,2) DEFAULT 0,
    moeda TEXT DEFAULT 'BRL',
    status TEXT DEFAULT 'ativo',
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;

  // Marcos do projeto + status do kanban
  await sql`CREATE TABLE IF NOT EXISTS projetos_marcos (
    id TEXT PRIMARY KEY,
    projeto_id TEXT NOT NULL REFERENCES projetos_financeiros(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    data_entrega DATE NOT NULL,
    percentual NUMERIC(5,2),
    valor NUMERIC(14,2) NOT NULL,
    nota_fiscal TEXT,
    data_pagamento DATE,
    arquivo_termo_url TEXT,
    arquivo_termo_nome TEXT,
    arquivo_termo_base64 TEXT,
    status_kanban TEXT NOT NULL DEFAULT 'aguardando_entrega',
    gp_liberacao_aviso_em TIMESTAMPTZ,
    gp_aprovado_em TIMESTAMPTZ,
    gp_aprovado_por TEXT,
    fin_termo_iniciado_em TIMESTAMPTZ,
    fin_termo_pronto_em TIMESTAMPTZ,
    termo_enviado_cliente_em TIMESTAMPTZ,
    cliente_ultimo_lembrete_em TIMESTAMPTZ,
    cliente_lembretes_count INT DEFAULT 0,
    fin_nf_emitida_em TIMESTAMPTZ,
    fin_ultimo_lembrete_em TIMESTAMPTZ,
    fin_lembretes_count INT DEFAULT 0,
    concluido_em TIMESTAMPTZ,
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_marcos_proj ON projetos_marcos(projeto_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_marcos_status ON projetos_marcos(status_kanban)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_marcos_entrega ON projetos_marcos(data_entrega) WHERE status_kanban IN ('aguardando_entrega', 'liberacao_gp')`;

  // v1.19: Contratos (tela nova — alimentada por importação de planilha)
  await sql`CREATE TABLE IF NOT EXISTS contratos_financeiros (
    id TEXT PRIMARY KEY,
    numero_contrato TEXT NOT NULL,
    projeto TEXT,
    projeto_id TEXT REFERENCES projetos_financeiros(id) ON DELETE SET NULL,
    data_inicio DATE,
    data_vencimento DATE,
    prazo_meses INT,
    prazo_texto TEXT,
    observacoes TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contratos_venc ON contratos_financeiros(data_vencimento)`;

  // v1.20: migração — marcos que estavam em etapas eliminadas do Kanban Marcos de
  // Projeto (aguardando_cliente, nf_emitida, aguardando_pagamento) são realocados:
  // aguardando_cliente → termo_pronto (termo já enviado, continua ali);
  // nf_emitida / aguardando_pagamento → concluido (o rastreio de NF/pagamento
  // passou para o Kanban de Faturamento). Idempotente.
  try {
    await sql`UPDATE projetos_marcos SET status_kanban = 'termo_pronto', atualizado_em = NOW() WHERE status_kanban = 'aguardando_cliente'`;
    await sql`UPDATE projetos_marcos SET status_kanban = 'concluido', concluido_em = COALESCE(concluido_em, NOW()), atualizado_em = NOW() WHERE status_kanban IN ('nf_emitida', 'aguardando_pagamento')`;
  } catch (e) { console.warn('[Financeiro] migração kanban marcos:', e.message); }

  // Log de eventos do marco (auditoria + histórico de emails)
  await sql`CREATE TABLE IF NOT EXISTS projetos_marcos_log (
    id TEXT PRIMARY KEY,
    marco_id TEXT NOT NULL REFERENCES projetos_marcos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    de_status TEXT,
    para_status TEXT,
    descricao TEXT,
    ator TEXT,
    email_destino TEXT,
    email_status TEXT,
    payload JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_marcos_log_marco ON projetos_marcos_log(marco_id)`;
}

// ═══════════════════════════════════════════════════════════════════════════
// QuickBooks — token + fetch (reuso do padrão de s1-data.js)
// ═══════════════════════════════════════════════════════════════════════════

// v1.5.6: status leve para a sidebar — checa envvars e valida o token
// ═══ v1.14: GERENTE FINANCEIRO IA (chat livre com contexto real) + DASHBOARD FINANCEIRO ═══
const FIN_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function claudeFin(system, messages, maxTokens = 1400) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 40000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: FIN_MODEL, max_tokens: maxTokens, system, messages }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return d.content?.[0]?.text || '';
}
async function contextoFinanceiro({ mes, ano } = {}) {
  const [resumo, kpis, fluxo, conc, kanban, orc] = await Promise.allSettled([
    painelResumo({ mes, ano }), kpisSaude({}), fluxoFuturo({ meses: 6 }), conciliacaoStatus({}), marcosKanban({}), orcamentoConsolidado({ ano })
  ]);
  const v = p => p.status === 'fulfilled' ? p.value : { erro: p.reason?.message };
  const R = v(resumo), K = v(kpis), F = v(fluxo), C = v(conc), M = v(kanban), O = v(orc);
  return {
    quickbooks: { conectado: !R.erros?.length || (R.saldoCaixa !== undefined && R.saldoCaixa !== 0), erros: (R.erros || []).slice(0, 3) },
    periodo: R.periodo || null,
    caixa: { saldo: R.saldoCaixa ?? null, a_receber: R.aReceber ?? null, a_pagar: R.aPagar ?? null, receita_mes: R.realMes ?? null, receita_ano: R.realAnual ?? null },
    saude: { semaforo: K.semaforo, motivos: K.semaforo_motivos, kpis: Object.fromEntries(Object.entries(K).filter(([k]) => !/semaforo|erro/.test(k)).slice(0, 14)) },
    fluxo_6m: (F.meses || F.linhas || []).slice(0, 6).map(m => ({ mes: m.mes || m.label || m.ref, entradas: m.entradas ?? m.receitas, saidas: m.saidas ?? m.despesas, saldo: m.saldo_final ?? m.saldo })),
    conciliacao: { conciliados: C.conciliados ?? C.aprovados, pendentes: C.pendentes ?? C.com_sugestao, sem_sugestao: C.sem_sugestao, taxa: C.taxa ?? C.taxa_pct },
    marcos: Object.fromEntries(Object.entries(M.colunas || {}).map(([k, c]) => [k, { qtd: c.total_count, valor: c.total_valor }])),
    orcamento: O.total_geral || null,
    ultimos_lancamentos: (R.lancamentos || []).slice(0, 12).map(l => ({ data: l.data, desc: (l.descricao || l.nome || '').substring(0, 50), valor: l.valor, tipo: l.tipo })),
  };
}
async function gerenteFinanceiro({ mensagem, historico = [] } = {}) {
  if (!mensagem) throw new Error('mensagem obrigatória');
  const ctx = await contextoFinanceiro();
  const system = `Você é o GERENTE FINANCEIRO IA da Atlantyx — um CFO experiente, direto e prático, falando em português do Brasil. Você tem acesso aos DADOS FINANCEIROS REAIS abaixo (QuickBooks + sistema). Regras: responda com números do contexto quando existirem; se um dado não estiver disponível, diga claramente e sugira onde obter; explique conceitos financeiros quando pedirem, com exemplos do próprio negócio; sugira ações concretas (o que fazer, quando, quanto); seja conciso (até ~200 palavras salvo pedido de detalhe); nunca invente valores. Ferramentas do sistema que você pode recomendar: Extrato, Saldo Diário/Mensal, Conciliação, Orçamento Anual, Fluxo Futuro 12 meses, Agenda de Despesas, Projetos & Marcos, Kanban Financeiro, KPIs de Saúde, A Receber.

CONTEXTO FINANCEIRO (JSON, valores em moeda da conta):
${JSON.stringify(ctx).substring(0, 9000)}`;
  const msgs = [...historico.slice(-10).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').substring(0, 2000) })), { role: 'user', content: mensagem.substring(0, 3000) }];
  const resposta = await claudeFin(system, msgs, 1400);
  return { resposta, contexto_resumo: { saldo: ctx.caixa.saldo, a_receber: ctx.caixa.a_receber, a_pagar: ctx.caixa.a_pagar, semaforo: ctx.saude.semaforo, qb: ctx.quickbooks.conectado } };
}
async function dashboardFinanceiro({ mes, ano } = {}) {
  const ctx = await contextoFinanceiro({ mes, ano });
  return { dashboard: ctx, gerado_em: new Date().toISOString(), periodo: ctx.periodo || null };
}

// v1.15: diagnóstico do QuickBooks — empresa, realm, contagens e INTERVALO DE DATAS com dados (sandbox costuma ter
// lançamentos em datas antigas → telas com período atual mostram zero)
async function qbDiagnostico() {
  const out = { ok: false, empresa: null, realm: null, sandbox: process.env.QB_SANDBOX === 'true', tokens: null, entidades: {}, contas: [], erros: [] };
  try {
    const t = await qbTokensLer(); out.tokens = t ? { origem: 'banco', atualizado_em: t.atualizado_em, refresh_expira_em: t.refresh_expira_em ? new Date(t.refresh_expira_em).toISOString() : null } : { origem: 'env' };
    const token = await qbToken(); const realm = (t?.realm_id) || process.env.QB_REALM_ID; out.realm = realm;
    try { const ci = await qbFetch(`/companyinfo/${realm}`, token); const c = ci?.CompanyInfo || {}; out.empresa = { nome: c.CompanyName, pais: c.Country, moeda: c.Currency?.value || null, criada_em: c.MetaData?.CreateTime || null }; } catch (e) { out.erros.push('companyinfo: ' + e.message); }
    for (const ent of ['Purchase','Deposit','Invoice','Bill','Payment','JournalEntry','SalesReceipt']) {
      try {
        const cnt = await qbQuery(`select count(*) from ${ent}`, token);
        const first = await qbQuery(`select * from ${ent} orderby TxnDate asc maxresults 1`, token);
        const last = await qbQuery(`select * from ${ent} orderby TxnDate desc maxresults 1`, token);
        const g = r => (r?.QueryResponse?.[ent] || [])[0]?.TxnDate || null;
        out.entidades[ent] = { total: cnt?.QueryResponse?.totalCount ?? null, primeira: g(first), ultima: g(last) };
      } catch (e) { out.entidades[ent] = { erro: e.message.substring(0, 140) }; }
    }
    try { const ac = await qbQuery(`select * from Account where AccountType in ('Bank','Credit Card') maxresults 20`, token); out.contas = (ac?.QueryResponse?.Account || []).map(a => ({ nome: a.Name, tipo: a.AccountType, saldo: a.CurrentBalance, moeda: a.CurrencyRef?.value })); } catch (e) { out.erros.push('accounts: ' + e.message); }
    const datas = Object.values(out.entidades).flatMap(e => [e.primeira, e.ultima]).filter(Boolean).sort();
    out.intervalo_dados = datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null;
    out.ok = true;
  } catch (e) { out.erros.push(e.message); }
  return { diagnostico: out };
}
// ═══════════════════════════════════════════════════════════════════════════
// v1.24: RELATÓRIO DIÁRIO DE PAGAMENTOS POR E-MAIL
// Enviado VIA atlanteambr@gmail.com (SMTP do Gmail, mesma senha de app já usada
// para ler as notas fiscais) para financeiro@atlanteam.com.br e contato@atlanteam.com.br
// ═══════════════════════════════════════════════════════════════════════════
const DEST_RELATORIO = (process.env.RELATORIO_PAGAMENTOS_PARA || 'financeiro@atlanteam.com.br,contato@atlanteam.com.br')
  .split(',').map(s => s.trim()).filter(Boolean);

async function pagamentosDoDiaEPendentes() {
  const sql = await getSql();
  const hoje = new Date().toISOString().split('T')[0];
  const inicioMes = hoje.substring(0, 8) + '01';
  const fimMes = new Date(new Date(hoje).getFullYear(), new Date(hoje).getMonth() + 1, 0).toISOString().split('T')[0];

  // 1. Despesas do Atlantyx com vencimento HOJE
  const doDia = await sql`SELECT o.*, d.descricao AS desp_desc, d.categoria AS desp_cat, d.fornecedor AS desp_forn
    FROM despesas_ocorrencias o LEFT JOIN despesas_programadas d ON d.id = o.despesa_id
    WHERE o.data_prevista = ${hoje} ORDER BY o.valor DESC`;

  // 2. Pendentes do MÊS (não pagas, vencimento dentro do mês corrente) — inclui atrasadas do mês
  const pendentesMes = await sql`SELECT o.*, d.descricao AS desp_desc, d.categoria AS desp_cat, d.fornecedor AS desp_forn
    FROM despesas_ocorrencias o LEFT JOIN despesas_programadas d ON d.id = o.despesa_id
    WHERE o.status != 'paga' AND o.data_prevista >= ${inicioMes} AND o.data_prevista <= ${fimMes}
    ORDER BY o.data_prevista ASC`;

  // 3. Contas a pagar do QuickBooks (Bills em aberto) — mesmo período
  let qbHoje = [], qbMes = [], qbErro = null;
  if (qbConfigurado()) {
    try {
      const token = await qbToken();
      const data = await qbQuery(`select * from Bill where Balance > '0' and DueDate >= '${inicioMes}' and DueDate <= '${fimMes}' maxresults 500`, token);
      const bills = (data?.QueryResponse?.Bill || []).map(b => ({
        descricao: (b.VendorRef?.name || 'Fornecedor') + (b.DocNumber ? ' · ' + b.DocNumber : ''),
        fornecedor: b.VendorRef?.name || '', categoria: 'QuickBooks · Conta a pagar',
        data_prevista: b.DueDate || b.TxnDate, valor: parseFloat(b.Balance ?? b.TotalAmt ?? 0), fonte: 'quickbooks',
      }));
      qbMes = bills;
      qbHoje = bills.filter(b => String(b.data_prevista).split('T')[0] === hoje);
    } catch (e) { qbErro = e.message; }
  }

  const norm = r => ({ descricao: r.desp_desc || r.descricao || 'Despesa', fornecedor: r.desp_forn || r.fornecedor || '',
    categoria: r.desp_cat || r.categoria || '', data: String(r.data_prevista).split('T')[0],
    valor: parseFloat(r.valor) || 0, status: r.status || 'prevista', fonte: r.fonte || 'atlantyx' });

  const listaDia = [...doDia.map(norm), ...qbHoje.map(norm)].sort((a, b) => b.valor - a.valor);
  const listaMes = [...pendentesMes.map(norm), ...qbMes.map(norm)]
    .filter(x => !(x.fonte === 'quickbooks' && x.data === hoje && listaDia.some(d => d.fonte === 'quickbooks' && d.descricao === x.descricao)))
    .sort((a, b) => a.data.localeCompare(b.data));

  const soma = l => Math.round(l.reduce((s, x) => s + x.valor, 0) * 100) / 100;
  const atrasadas = listaMes.filter(x => x.data < hoje);
  return { hoje, inicioMes, fimMes, listaDia, listaMes, atrasadas,
    total_dia: soma(listaDia), total_mes_pendente: soma(listaMes), total_atrasado: soma(atrasadas), qb_erro: qbErro };
}

function _htmlRelatorioPagamentos(d) {
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dataBR = s => String(s || '').split('-').reverse().join('/');
  const linha = (x, destacarAtraso) => `<tr${destacarAtraso && x.data < d.hoje ? ' style="background:#fdeded;"' : ''}>
    <td style="padding:7px 9px;border-bottom:1px solid #e4e8f2;font-family:monospace;white-space:nowrap;">${dataBR(x.data)}${destacarAtraso && x.data < d.hoje ? ' <span style="color:#c0392b;font-weight:bold;">⚠</span>' : ''}</td>
    <td style="padding:7px 9px;border-bottom:1px solid #e4e8f2;">${x.descricao}${x.fornecedor ? '<br><span style="color:#8a93a8;font-size:11px;">' + x.fornecedor + '</span>' : ''}</td>
    <td style="padding:7px 9px;border-bottom:1px solid #e4e8f2;color:#5a6478;font-size:11px;">${x.categoria}${x.fonte === 'quickbooks' ? ' <span style="color:#1FB287;">(QB)</span>' : ''}</td>
    <td style="padding:7px 9px;border-bottom:1px solid #e4e8f2;text-align:right;font-family:monospace;white-space:nowrap;">${brl(x.valor)}</td>
    <td style="padding:7px 9px;border-bottom:1px solid #e4e8f2;font-size:11px;">${x.status === 'paga' ? '✅ paga' : x.status === 'lancada' ? '📤 lançada' : '⏳ prevista'}</td></tr>`;
  const cab = `<tr style="background:#1A3A8F;color:#fff;"><th style="padding:7px 9px;text-align:left;font-size:11px;">VENCIMENTO</th><th style="padding:7px 9px;text-align:left;font-size:11px;">DESCRIÇÃO</th><th style="padding:7px 9px;text-align:left;font-size:11px;">CATEGORIA</th><th style="padding:7px 9px;text-align:right;font-size:11px;">VALOR</th><th style="padding:7px 9px;text-align:left;font-size:11px;">STATUS</th></tr>`;
  // v1.24: <meta charset> é obrigatório — sem ele, acentos chegam corrompidos ("MÊS" vira "MÃŠS") no e-mail
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f4f6fb;"><div style="font-family:Arial,Helvetica,sans-serif;color:#1c2333;max-width:820px;">
  <div style="background:linear-gradient(135deg,#0B1226,#1A3A8F);color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
    <div style="font-size:12px;letter-spacing:2px;color:#8fb0ff;">ATLANTYX OS · FINANCEIRO</div>
    <div style="font-size:21px;font-weight:bold;margin-top:4px;">Pagamentos de ${dataBR(d.hoje)}</div>
  </div>
  <div style="border:1px solid #e4e8f2;border-top:none;padding:18px 22px;border-radius:0 0 10px 10px;">
    <div style="display:block;margin-bottom:18px;">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="padding:10px;background:#EEF3FF;border-radius:8px;width:33%;"><div style="font-size:11px;color:#5a6478;">A PAGAR HOJE</div><div style="font-size:19px;font-weight:bold;color:#1A3A8F;">${brl(d.total_dia)}</div><div style="font-size:11px;color:#8a93a8;">${d.listaDia.length} lançamento(s)</div></td>
        <td style="width:8px;"></td>
        <td style="padding:10px;background:#FFF8E8;border-radius:8px;width:33%;"><div style="font-size:11px;color:#5a6478;">PENDENTE NO MÊS</div><div style="font-size:19px;font-weight:bold;color:#E0A422;">${brl(d.total_mes_pendente)}</div><div style="font-size:11px;color:#8a93a8;">${d.listaMes.length} lançamento(s)</div></td>
        <td style="width:8px;"></td>
        <td style="padding:10px;background:${d.total_atrasado > 0 ? '#FDEDED' : '#EAFBF5'};border-radius:8px;width:33%;"><div style="font-size:11px;color:#5a6478;">EM ATRASO</div><div style="font-size:19px;font-weight:bold;color:${d.total_atrasado > 0 ? '#D64545' : '#1FB287'};">${brl(d.total_atrasado)}</div><div style="font-size:11px;color:#8a93a8;">${d.atrasadas.length} vencida(s)</div></td>
      </tr></table>
    </div>

    <h2 style="font-size:15px;color:#17224a;border-bottom:2px solid #4F7CFF;padding-bottom:5px;">💰 Pagamentos de hoje (${dataBR(d.hoje)})</h2>
    ${d.listaDia.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">${cab}${d.listaDia.map(x => linha(x, false)).join('')}
      <tr style="background:#f7f9fe;font-weight:bold;"><td colspan="3" style="padding:8px 9px;">TOTAL DO DIA</td><td style="padding:8px 9px;text-align:right;font-family:monospace;">${brl(d.total_dia)}</td><td></td></tr></table>`
      : '<p style="color:#5a6478;font-size:13px;padding:10px 0;">Nenhum pagamento com vencimento hoje. 🎉</p>'}

    <h2 style="font-size:15px;color:#17224a;border-bottom:2px solid #E0A422;padding-bottom:5px;margin-top:26px;">📅 Pendentes do mês (até ${dataBR(d.fimMes)})</h2>
    ${d.atrasadas.length ? `<div style="background:#FDEDED;border-left:4px solid #D64545;padding:9px 12px;font-size:13px;margin-bottom:10px;"><b>⚠ ${d.atrasadas.length} pagamento(s) em atraso</b> — total ${brl(d.total_atrasado)} (destacados em vermelho abaixo)</div>` : ''}
    ${d.listaMes.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">${cab}${d.listaMes.map(x => linha(x, true)).join('')}
      <tr style="background:#f7f9fe;font-weight:bold;"><td colspan="3" style="padding:8px 9px;">TOTAL PENDENTE NO MÊS</td><td style="padding:8px 9px;text-align:right;font-family:monospace;">${brl(d.total_mes_pendente)}</td><td></td></tr></table>`
      : '<p style="color:#5a6478;font-size:13px;padding:10px 0;">Nenhum pagamento pendente no mês.</p>'}

    ${d.qb_erro ? `<p style="color:#E0A422;font-size:12px;margin-top:14px;">⚠ Não foi possível consultar o QuickBooks nesta execução (${d.qb_erro}) — a lista pode estar incompleta.</p>` : ''}
    <p style="color:#8a93a8;font-size:11px;margin-top:20px;border-top:1px solid #e4e8f2;padding-top:10px;">
      Enviado automaticamente pelo Atlantyx OS · Inclui despesas programadas do sistema e contas a pagar do QuickBooks (todos os fornecedores).
    </p>
  </div></div></body></html>`;
}

// Envio via SMTP do Gmail (atlanteambr@gmail.com) — reaproveita a senha de app já
// configurada em EMAIL_IMAP_PASS. Cai para o Resend se o nodemailer não estiver instalado.
async function enviarEmailGmail({ para, assunto, html }) {
  const user = process.env.EMAIL_IMAP_USER || 'atlanteambr@gmail.com';
  const pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS;
  const trilha = []; // v1.25.1: registra CADA tentativa, para o erro nunca ser silencioso
  let nodemailer = null;
  try { const m = await import('nodemailer'); nodemailer = m.default || m; trilha.push('nodemailer: instalado'); }
  catch (e) { trilha.push('nodemailer: NÃO instalado (' + e.message.substring(0, 60) + ')'); }
  trilha.push('senha SMTP: ' + (pass ? 'configurada (' + pass.length + ' caracteres)' : 'AUSENTE'));

  if (nodemailer && pass) {
    try {
      const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass }, connectionTimeout: 20000, greetingTimeout: 20000 });
      // verify() falha rápido e com mensagem clara se a credencial estiver errada
      try { await transporter.verify(); trilha.push('SMTP Gmail: autenticação OK'); }
      catch (eV) { trilha.push('SMTP Gmail: autenticação FALHOU — ' + eV.message.substring(0, 120)); throw eV; }
      const info = await transporter.sendMail({ from: `Atlantyx OS Financeiro <${user}>`, to: para.join(', '), subject: assunto, html });
      trilha.push('SMTP Gmail: aceito pelo servidor · destinatários aceitos: ' + JSON.stringify(info.accepted || []) + (info.rejected?.length ? ' · REJEITADOS: ' + JSON.stringify(info.rejected) : ''));
      return { via: 'gmail-smtp', de: user, id: info.messageId, aceitos: info.accepted, rejeitados: info.rejected, resposta_servidor: info.response, trilha };
    } catch (eSmtp) {
      trilha.push('→ caindo para o Resend porque o SMTP falhou');
      const key0 = process.env.RESEND_API_KEY;
      if (!key0) { const err = new Error('Envio pelo Gmail falhou: ' + eSmtp.message); err.trilha = trilha;
        err.hint = /invalid login|username and password|BadCredentials/i.test(eSmtp.message)
          ? 'A senha de app do Gmail parece inválida. Gere uma nova em myaccount.google.com/apppasswords (precisa de verificação em 2 etapas ativada) e cole em EMAIL_IMAP_PASS SEM espaços.'
          : 'Verifique EMAIL_IMAP_USER/EMAIL_IMAP_PASS no Vercel e refaça o Redeploy.';
        throw err; }
    }
  }
  // Reserva: Resend
  const key = process.env.RESEND_API_KEY;
  if (!key) { const err = new Error('Não foi possível enviar: nodemailer ausente ou senha não configurada, e sem RESEND_API_KEY de reserva.'); err.trilha = trilha;
    err.hint = 'Confirme que o package.json tem "nodemailer" nas dependencies (e que o deploy rodou depois disso) e que EMAIL_IMAP_PASS está preenchida no Vercel.'; throw err; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'Atlantyx <noreply@atlantyx.com.br>', to: para, subject: assunto, html }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    // v1.25.1: mostrar o MOTIVO do Resend (antes era só "HTTP 4xx", inútil para diagnosticar)
    trilha.push('Resend: HTTP ' + r.status + ' — ' + (d.message || d.error || JSON.stringify(d).substring(0, 150)));
    const err = new Error('Resend recusou: ' + (d.message || d.name || ('HTTP ' + r.status)));
    err.trilha = trilha;
    if (/domain is not verified|from/i.test(JSON.stringify(d))) err.hint = 'O domínio do remetente (RESEND_FROM) não está verificado no Resend. Verifique o domínio no painel do Resend ou instale o nodemailer para enviar pelo Gmail.';
    throw err;
  }
  trilha.push('Resend: aceito, id ' + d.id);
  return { via: 'resend', de: process.env.RESEND_FROM, id: d.id, trilha, aviso: 'enviado pelo Resend (não pelo Gmail) — instale o nodemailer para sair de atlanteambr@gmail.com' };
}

// v1.25.1: diagnóstico de e-mail — diz exatamente o que está configurado e testa o envio
async function emailDiagnostico({ para } = {}) {
  const out = { nodemailer_instalado: false, senha_configurada: false, usuario: process.env.EMAIL_IMAP_USER || 'atlanteambr@gmail.com',
    resend_configurado: !!process.env.RESEND_API_KEY, resend_from: process.env.RESEND_FROM || null, destinatarios_padrao: DEST_RELATORIO, etapas: [] };
  try { await import('nodemailer'); out.nodemailer_instalado = true; out.etapas.push('✓ Pacote nodemailer instalado'); }
  catch (e) { out.etapas.push('✗ Pacote nodemailer NÃO instalado — adicione "nodemailer" nas dependencies do package.json e faça novo deploy'); }
  const pass = process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS;
  out.senha_configurada = !!pass;
  out.etapas.push(pass ? `✓ Senha de app configurada (${pass.length} caracteres${pass.includes(' ') ? ' — ⚠ contém espaços, remova-os!' : ''})` : '✗ EMAIL_IMAP_PASS não configurada no Vercel');
  if (out.nodemailer_instalado && pass) {
    try {
      const m = await import('nodemailer'); const nm = m.default || m;
      const t = nm.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: out.usuario, pass }, connectionTimeout: 15000 });
      await t.verify(); out.etapas.push('✓ Autenticação no SMTP do Gmail bem-sucedida'); out.smtp_ok = true;
    } catch (e) { out.smtp_ok = false; out.etapas.push('✗ Autenticação no Gmail falhou: ' + e.message.substring(0, 140)); }
  }
  if (para) {
    try {
      const envio = await enviarEmailGmail({ para: [para], assunto: '[Atlantyx] Teste de envio', html: '<p>Teste de envio do Atlantyx OS. Se você recebeu isto, o e-mail está funcionando.</p>' });
      out.teste_envio = { ok: true, ...envio }; out.etapas.push(`✓ E-mail de teste enviado para ${para} via ${envio.via}`);
    } catch (e) { out.teste_envio = { ok: false, erro: e.message, trilha: e.trilha, hint: e.hint }; out.etapas.push('✗ Falha ao enviar teste: ' + e.message); }
  }
  return out;
}

async function relatorioPagamentosEnviar({ apenas_gerar, para } = {}) {
  const d = await pagamentosDoDiaEPendentes();
  const html = _htmlRelatorioPagamentos(d);
  const resumo = { data: d.hoje, total_dia: d.total_dia, qtd_dia: d.listaDia.length,
    total_mes_pendente: d.total_mes_pendente, qtd_mes: d.listaMes.length, total_atrasado: d.total_atrasado, qtd_atrasadas: d.atrasadas.length, qb_erro: d.qb_erro };
  if (apenas_gerar) return { ...resumo, html, enviado: false };
  const destinatarios = (para && para.length) ? para : DEST_RELATORIO;
  const dataBR = d.hoje.split('-').reverse().join('/');
  const assunto = `[Atlantyx] Pagamentos de ${dataBR} — hoje R$ ${d.total_dia.toLocaleString('pt-BR',{minimumFractionDigits:2})} · pendente no mês R$ ${d.total_mes_pendente.toLocaleString('pt-BR',{minimumFractionDigits:2})}${d.total_atrasado > 0 ? ' · ⚠ ' + d.atrasadas.length + ' em atraso' : ''}`;
  const envio = await enviarEmailGmail({ para: destinatarios, assunto, html });
  console.log(`[Financeiro] Relatório diário enviado para ${destinatarios.join(', ')} via ${envio.via}`);
  return { ...resumo, enviado: true, destinatarios, ...envio };
}

// v1.26.3: versão do arquivo — permite detectar deploy desatualizado sem adivinhação
const VERSAO_API = 'v1.26.3';

async function qbStatus() {
  const faltando = [
    !process.env.QB_CLIENT_ID && 'QB_CLIENT_ID',
    !process.env.QB_CLIENT_SECRET && 'QB_CLIENT_SECRET',
    !process.env.QB_REFRESH_TOKEN && 'QB_REFRESH_TOKEN',
    !process.env.QB_REALM_ID && 'QB_REALM_ID',
  ].filter(Boolean);

  if (faltando.length) {
    return { configurado: false, conectado: false, faltando, sandbox: process.env.QB_SANDBOX === 'true' };
  }
  // Testa o refresh do token (chamada leve à Intuit, ~300ms)
  try {
    await qbToken();
    const t = await qbTokensLer();
    return { configurado: true, conectado: true, sandbox: process.env.QB_SANDBOX === 'true', tokens_no_banco: !!t, refresh_expira_em: t?.refresh_expira_em ? new Date(t.refresh_expira_em).toISOString() : null, atualizado_em: t?.atualizado_em || null, realm_id: t?.realm_id || process.env.QB_REALM_ID || null };
  } catch (e) {
    return { configurado: true, conectado: false, erro: e.message, sandbox: process.env.QB_SANDBOX === 'true', pode_reconectar: !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET) };
  }
}

// ═══ v1.12: TOKENS DO QUICKBOOKS PERSISTIDOS NO BANCO ═══
// O Intuit ROTACIONA o refresh_token a cada renovação (devolve um novo e o antigo morre em ~24h).
// Lendo só da env var, o sistema quebrava sempre → "Erro token". Agora: kv_store 'qb:tokens' é a
// fonte da verdade (atualizada a cada refresh); a env QB_REFRESH_TOKEN é só a semente inicial.
// Também: access_token em cache até expirar (evita 1 refresh por chamada) e reconexão por OAuth.
let _qbTokCache = null; // { access_token, expira_em }
async function qbTokensLer() {
  try {
    const sql = await getSql();
    await sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`;
    const rows = await sql`SELECT value FROM kv_store WHERE key = 'qb:tokens' LIMIT 1`;
    if (rows.length && rows[0].value) { const v = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value; if (v && v.refresh_token) return v; }
  } catch (e) { console.warn('[QB] kv tokens:', e.message); }
  return null;
}
async function qbTokensGravar(t) {
  try {
    const sql = await getSql();
    await sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('qb:tokens', ${JSON.stringify(t)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
    return true;
  } catch (e) { console.error('[QB] não gravou tokens no banco:', e.message); return false; }
}
async function qbTrocarTokens(bodyForm) {
  const clientId = process.env.QB_CLIENT_ID, clientSecret = process.env.QB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('QuickBooks não configurado (QB_CLIENT_ID/QB_CLIENT_SECRET)');
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST', headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: bodyForm });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`QB OAuth: ${d.error_description || d.error || ('HTTP ' + r.status)}`);
  return d;
}
async function qbToken() {
  if (_qbTokCache && _qbTokCache.expira_em > Date.now() + 60000) return _qbTokCache.access_token;
  const salvo = await qbTokensLer();
  const refreshToken = salvo?.refresh_token || process.env.QB_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('QuickBooks não conectado — use "Conectar QuickBooks" (ou defina QB_REFRESH_TOKEN)');
  let d;
  try { d = await qbTrocarTokens(`grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`); }
  catch (e) {
    // se o token do banco falhou e há um da env diferente, tenta a semente
    if (salvo?.refresh_token && process.env.QB_REFRESH_TOKEN && process.env.QB_REFRESH_TOKEN !== salvo.refresh_token) {
      d = await qbTrocarTokens(`grant_type=refresh_token&refresh_token=${encodeURIComponent(process.env.QB_REFRESH_TOKEN)}`);
    } else throw new Error(e.message + ' — reconecte em Financeiro → "Conectar QuickBooks"');
  }
  const agora = Date.now();
  const novo = { access_token: d.access_token, refresh_token: d.refresh_token || refreshToken, expira_em: agora + ((d.expires_in || 3600) * 1000), refresh_expira_em: agora + ((d.x_refresh_token_expires_in || 8640000) * 1000), realm_id: salvo?.realm_id || process.env.QB_REALM_ID || null, atualizado_em: new Date(agora).toISOString() };
  await qbTokensGravar(novo);
  _qbTokCache = { access_token: novo.access_token, expira_em: novo.expira_em };
  return novo.access_token;
}
function qbRealmId() { return process.env.QB_REALM_ID; }
// OAuth: URL de autorização (o usuário clica, autoriza no Intuit, volta para /api/financeiro?qb_callback=1)
function qbRedirectUri(req) {
  const env = (process.env.QB_REDIRECT_URI || '').trim(); if (env) return env;
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = process.env.MEDIA_PUBLIC_BASE ? process.env.MEDIA_PUBLIC_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '') : (process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers['x-forwarded-host'] || req.headers.host);
  return `${proto}://${host}/api/financeiro?qb_callback=1`;
}
function qbAuthUrl(req) {
  const clientId = process.env.QB_CLIENT_ID; if (!clientId) throw new Error('QB_CLIENT_ID não configurado');
  const p = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'com.intuit.quickbooks.accounting', redirect_uri: qbRedirectUri(req), state: 'atx' + Date.now() });
  return { url: 'https://appcenter.intuit.com/connect/oauth2?' + p.toString(), redirect_uri: qbRedirectUri(req) };
}
async function qbCallback(req, res) {
  const url = new URL(req.url, 'http://x');
  const code = url.searchParams.get('code'), realmId = url.searchParams.get('realmId'), err = url.searchParams.get('error');
  const volta = (msg, okk) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.status(200).send(`<!doctype html><html><body style="font-family:system-ui;background:#0B1226;color:#fff;padding:40px"><h2>${okk ? '✅ QuickBooks conectado' : '⛔ QuickBooks: falha na conexão'}</h2><p>${msg}</p><p><a style="color:#4F7CFF" href="/">Voltar ao Atlantyx</a></p><script>setTimeout(()=>{ try{ if (window.opener) { window.opener.postMessage({ qb: ${okk ? 'true' : 'false'} }, '*'); window.close(); } }catch(e){} }, 1500);</script></body></html>`); };
  if (err) return volta('Intuit retornou: ' + err, false);
  if (!code) return volta('Callback sem "code".', false);
  try {
    const d = await qbTrocarTokens(`grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(qbRedirectUri(req))}`);
    const agora = Date.now();
    const novo = { access_token: d.access_token, refresh_token: d.refresh_token, expira_em: agora + ((d.expires_in || 3600) * 1000), refresh_expira_em: agora + ((d.x_refresh_token_expires_in || 8640000) * 1000), realm_id: realmId || process.env.QB_REALM_ID || null, atualizado_em: new Date(agora).toISOString(), conectado_em: new Date(agora).toISOString() };
    const gravou = await qbTokensGravar(novo);
    _qbTokCache = { access_token: novo.access_token, expira_em: novo.expira_em };
    return volta(gravou ? 'Tokens salvos no banco. Realm: ' + (novo.realm_id || '(env)') + '. Pode fechar esta janela.' : 'Autorizou, mas não consegui gravar no banco (DATABASE_URL?).', gravou);
  } catch (e) { return volta(e.message, false); }
}

function qbBase() {
  return process.env.QB_SANDBOX === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

const num = v => { const n = parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };

async function qbFetch(endpoint, token) {
  const realmId = (await qbTokensLer())?.realm_id || process.env.QB_REALM_ID;
  if (!realmId) throw new Error('QB_REALM_ID não configurado (ou reconecte pelo botão Conectar QuickBooks)');
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${qbBase()}/v3/company/${realmId}${endpoint}${sep}minorversion=65`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`QB ${endpoint}: ${r.status} — ${JSON.stringify(err).substring(0, 200)}`);
  }
  return r.json();
}

// v1.49: o QuickBooks limita requisições (429 ThrottleExceeded). Sem tratamento, a consulta
// falhava em silêncio e o extrato saía incompleto — com saldo errado.
async function qbEsperar(ms) { return new Promise(r => setTimeout(r, ms)); }
async function qbQuery(sqlQuery, token, _tentativa = 0) {
  try { return await _qbQueryInterno(sqlQuery, token); }
  catch (e) {
    const ehThrottle = /throttle|429/i.test(e.message || '');
    if (ehThrottle && _tentativa < 3) {
      const espera = [1200, 3000, 6000][_tentativa];
      console.warn(`[QB] Throttle (tentativa ${_tentativa + 1}), aguardando ${espera}ms`);
      await qbEsperar(espera);
      return qbQuery(sqlQuery, token, _tentativa + 1);
    }
    throw e;
  }
}
async function _qbQueryInterno(sqlQuery, token) {
  // QuickBooks SQL-like query language
  return qbFetch(`/query?query=${encodeURIComponent(sqlQuery)}`, token);
}

function qbConfigurado() {
  return !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET && (process.env.QB_REFRESH_TOKEN || process.env.QB_REALM_ID || true)); // tokens podem estar no banco
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. QuickBooks estendido
// ═══════════════════════════════════════════════════════════════════════════

// 1.1 Lançamentos linha-a-linha (Purchase, Payment, Deposit, JournalEntry, SalesReceipt)
const fmtNum = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
async function qbLancamentos({ data_inicio, data_fim, limite = 200, conta_id = null } = {}) {
  if (!qbConfigurado()) return { erros: ['QuickBooks não configurado'], lancamentos: [], qb_configurado: false };
  const token = await qbToken();
  const hoje = new Date().toISOString().split('T')[0];
  const ini = data_inicio || new Date(Date.now() - 90 * 86400 * 1000).toISOString().split('T')[0];
  const fim = data_fim || hoje;

  // Query separada por tipo — QB não tem "UNION"
  // v1.36.1 FIX: cada consulta traz UMA entidade — antes o código pegava o primeiro campo
  // presente na resposta com uma cadeia de "||", o que fazia a mesma lista ser processada em
  // rodadas diferentes e gerava LINHAS DUPLICADAS no extrato. Agora cada query lê só a sua entidade.
  // v1.48 FIX: faltavam entidades importantes. Na conciliação bancária do QuickBooks, a maioria
  // dos PIX/pagamentos vira "Pagamento de conta" = BillPayment — que NÃO era consultado aqui.
  // Também faltavam Transfer (transferências entre contas), JournalEntry (lançamentos manuais),
  // CreditCardPayment e VendorCredit/RefundReceipt. Por isso dezenas de lançamentos conciliados
  // não apareciam no extrato do Atlantyx.
  const queries = [
    { tipo: 'despesa',      entidade: 'Purchase',          q: `select * from Purchase where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'pagamento',    entidade: 'Payment',           q: `select * from Payment where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'pagto_conta',  entidade: 'BillPayment',       q: `select * from BillPayment where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'deposito',     entidade: 'Deposit',           q: `select * from Deposit where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'venda',        entidade: 'SalesReceipt',      q: `select * from SalesReceipt where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'transferencia',entidade: 'Transfer',          q: `select * from Transfer where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'lancamento',   entidade: 'JournalEntry',      q: `select * from JournalEntry where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'pagto_cartao', entidade: 'CreditCardPayment', q: `select * from CreditCardPayment where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'reembolso',    entidade: 'RefundReceipt',     q: `select * from RefundReceipt where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
    { tipo: 'invoice',      entidade: 'Invoice',           q: `select * from Invoice where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults ${limite}` },
  ];

  const lancamentos = []; const erros = [];
  let incompletoPorThrottle = false; // v1.49
  const vistos = new Set(); // trava extra contra duplicidade (mesmo id não entra duas vezes)
  for (const [idx, { tipo, entidade, q }] of queries.entries()) {
    try {
      if (idx > 0) await qbEsperar(120); // v1.49: evita estourar o limite do QuickBooks
      const data = await qbQuery(q, token);
      const items = data?.QueryResponse?.[entidade] || [];
      for (const item of items) {
        const chave = `${entidade}:${item.Id}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        // v1.41 FIX (2ª dupla contagem): no QuickBooks, receber um Payment e depois DEPOSITAR
        // esse pagamento gera DOIS registros — o Payment e o Deposit que o contém. Contar os
        // dois duplica a entrada (era o caso do CPFL R$ 43.280,98 repetido em 27/08).
        // Regra: um Deposit só entra pelo valor das linhas SEM vínculo (LinkedTxn) com Payment,
        // porque as vinculadas já foram contadas no próprio Payment.
        let valorItem = parseFloat(item.TotalAmt || 0);
        let obsDedup = null;
        // v1.48: JournalEntry não traz TotalAmt — soma as linhas de débito
        if (tipo === 'lancamento' && !valorItem && Array.isArray(item.Line)) {
          valorItem = item.Line.filter(l => l.JournalEntryLineDetail?.PostingType === 'Debit')
            .reduce((s, l) => s + (parseFloat(l.Amount) || 0), 0);
        }
        if (tipo === 'transferencia' && !valorItem) valorItem = parseFloat(item.Amount || 0);
        if (tipo === 'deposito' && Array.isArray(item.Line)) {
          const linhasVinculadas = item.Line.filter(l => (l.LinkedTxn || []).some(lt => /payment/i.test(lt.TxnType || '')));
          if (linhasVinculadas.length) {
            const valorVinculado = linhasVinculadas.reduce((s, l) => s + (parseFloat(l.Amount) || 0), 0);
            valorItem = Math.round((valorItem - valorVinculado) * 100) / 100;
            obsDedup = `Depósito de ${fmtNum(valorVinculado)} já contado como recebimento (Payment) — não somado de novo.`;
            if (valorItem <= 0) continue; // o depósito era só o agrupamento de pagamentos já contados
          }
        }
        // v1.38 FIX (dupla contagem de receita): 'invoice' é a EMISSÃO da nota (competência) e
        // 'pagamento'/'deposito' é o dinheiro ENTRANDO (caixa). Contar os dois como entrada no
        // extrato dobrava a receita da mesma venda. Como este extrato é de CAIXA, a Invoice entra
        // como referência (valor 0 no saldo) e só o recebimento movimenta o saldo.
        // v1.48: classificação dos novos tipos.
        // BillPayment/CreditCardPayment/reembolso = SAÍDA · Transfer não muda o caixa total
        // (sai de uma conta e entra em outra) · JournalEntry depende das linhas.
        const entrada = ['pagamento', 'deposito', 'venda'].includes(tipo);
        const soReferencia = tipo === 'invoice' || tipo === 'transferencia';
        lancamentos.push({
          id: `qb_${tipo}_${item.Id}`,
          qb_txn_id: `${tipo}:${item.Id}`,
          data: item.TxnDate || item.MetaData?.CreateTime?.split('T')[0],
          // v1.48: BillPayment usa VendorRef; Transfer usa as contas de origem/destino
          descricao: item.PrivateNote
                  || item.VendorRef?.name
                  || item.EntityRef?.name
                  || item.CustomerRef?.name
                  || (tipo === 'transferencia' && item.FromAccountRef?.name
                      ? `Transferência: ${item.FromAccountRef.name} → ${item.ToAccountRef?.name || '?'}` : null)
                  || item.PaymentMethodRef?.name
                  || `${tipo} #${item.DocNumber || item.Id}`,
          categoria: item.AccountRef?.name
                  || (tipo === 'pagto_conta' ? 'Pagamento de conta' : null)
                  || (tipo === 'transferencia' ? 'Transferência entre contas' : null)
                  || (tipo === 'lancamento' ? 'Lançamento manual' : null)
                  || tipo,
          conta: item.AccountRef?.name || item.DepositToAccountRef?.name
                  || item.APAccountRef?.name || item.BankAccountRef?.name
                  || item.CheckPayment?.BankAccountRef?.name || item.FromAccountRef?.name || '',
          // v1.53: id da conta, para o filtro por conta bancária
          conta_id: item.AccountRef?.value || item.DepositToAccountRef?.value
                  || item.BankAccountRef?.value || item.CheckPayment?.BankAccountRef?.value
                  || item.FromAccountRef?.value || null,
          tipo: soReferencia ? 'referencia' : (entrada ? 'entrada' : 'saida'),
          valor: valorItem,
          valor_documento: parseFloat(item.TotalAmt || 0),
          nota_dedup: obsDedup,
          // v1.38: nota emitida não movimenta caixa — fica visível na lista, mas não soma no saldo
          afeta_saldo: !soReferencia,
          origem: 'quickbooks',
          qb_tipo: tipo,
          memo: item.PrivateNote || '',
        });
      }
    } catch (e) {
      console.log(`[QB] ${tipo}: ${e.message}`); erros.push(tipo + ': ' + e.message);
      // v1.49: throttle compromete os números — precisa ser sinalizado, não engolido
      if (/throttle|429/i.test(e.message || '')) incompletoPorThrottle = true;
    }
  }

  // Filtrar ocultos
  const sql = await getSql().catch(() => null);
  let ocultos = new Set();
  if (sql) {
    try {
      const rows = await sql`SELECT qb_txn_id FROM lancamentos_ocultos`;
      ocultos = new Set(rows.map(r => r.qb_txn_id));
    } catch {}
  }
  let filtrados = lancamentos.filter(l => !ocultos.has(l.qb_txn_id));
  // v1.53: filtro por conta bancária — permite bater a tela com o extrato de UM banco
  if (conta_id) {
    filtrados = filtrados.filter(l => String(l.conta_id || '') === String(conta_id));
  }

  filtrados.sort((a, b) => (a.data < b.data ? -1 : 1));
  return { erros,
    lancamentos: filtrados,
    total: filtrados.length,
    ocultos_count: lancamentos.length - filtrados.length,
    periodo: { data_inicio: ini, data_fim: fim },
    qb_configurado: true,
    // v1.49: avisa que os números NÃO são confiáveis nesta carga
    dados_incompletos: incompletoPorThrottle,
    aviso_incompleto: incompletoPorThrottle
      ? 'O QuickBooks limitou as consultas (ThrottleExceeded) e parte dos lançamentos não foi carregada. Os saldos desta tela estão INCOMPLETOS. Aguarde 1 minuto e clique em Atualizar.'
      : null,
  };
}

// 1.2 Contas a Pagar
async function qbContasPagar() {
  if (!qbConfigurado()) return { contas_pagar: [], qb_configurado: false };
  const token = await qbToken();
  const data = await qbFetch(`/reports/AgedPayables?date_macro=Today`, token);
  return { contas_pagar: extrairLinhasRelatorio(data), qb_configurado: true };
}

// 1.3 Orçamento (Budget) — interligar ao painel
async function qbOrcamento({ ano } = {}) {
  if (!qbConfigurado()) return { orcamento: null, qb_configurado: false };
  const token = await qbToken();
  // Lista budgets
  const lista = await qbQuery(`select * from Budget`, token);
  const budgets = lista?.QueryResponse?.Budget || [];
  if (budgets.length === 0) return { orcamento: null, motivo: 'nenhum budget cadastrado no QB' };

  // Pegar o budget mais recente ou do ano pedido
  let escolhido = budgets[0];
  if (ano) {
    const c = budgets.find(b => (b.StartDate || '').startsWith(String(ano)));
    if (c) escolhido = c;
  }

  // Para cada BudgetDetail extrair categoria, mês e valor
  const detalhes = (escolhido.BudgetDetail || []).map(d => ({
    categoria: d.AccountRef?.name || 'Geral',
    classe: d.ClassRef?.name || null,
    cliente: d.CustomerRef?.name || null,
    mes: d.BudgetDate || null,
    valor: parseFloat(d.Amount || 0),
  }));

  // Agregar por categoria × mês
  const matriz = {};
  for (const d of detalhes) {
    const mes = (d.mes || '').substring(0, 7);
    if (!matriz[d.categoria]) matriz[d.categoria] = {};
    matriz[d.categoria][mes] = (matriz[d.categoria][mes] || 0) + d.valor;
  }

  return {
    orcamento: {
      id: escolhido.Id,
      nome: escolhido.Name,
      ano: (escolhido.StartDate || '').substring(0, 4),
      tipo: escolhido.BudgetType,
      matriz,
      total: detalhes.reduce((s, d) => s + d.valor, 0),
    },
    qb_configurado: true,
  };
}

// 1.4 Saldo das contas bancárias
// v1.40: diagnóstico do saldo de abertura — lista TODAS as contas (Bank e Credit Card),
// mostra o que compõe o saldo e aponta classificações suspeitas.
// v1.44: rastreia lançamentos repetidos — diz se a duplicidade está NO QUICKBOOKS
// (dois registros de verdade) ou se é o Atlantyx contando duas vezes o mesmo registro.
// v1.45: varredura de duplicidade — analisa um período inteiro e lista os suspeitos,
// separando o que é duplicidade REAL na base contábil do que é vínculo normal
// (pagamento + depósito, nota + recebimento) que o sistema já sabe tratar.
// v1.47: conferência com o banco — detecta lançamentos que existem no extrato bancário mas
// ainda NÃO foram aceitos no QuickBooks (ficam na fila "Para revisão" e não aparecem na API).
async function qbConferirComBanco({ data_inicio, data_fim } = {}) {
  if (!qbConfigurado()) return { erro: 'QuickBooks não configurado' };
  const token = await qbToken();
  const hoje = new Date().toISOString().split('T')[0];
  const ini = data_inicio || `${hoje.substring(0, 8)}01`;
  const fim = data_fim || hoje;
  const out = { periodo: { de: ini, ate: fim } };

  // 1. Saldo atual das contas bancárias (o QuickBooks só conta o que foi ACEITO)
  let saldoContas = 0, contas = [];
  try { const sc = await qbSaldoContas(); saldoContas = sc.saldo_total; contas = sc.contas || []; } catch (e) { out.erro_contas = e.message; }
  out.saldo_quickbooks = round(saldoContas);

  // 2. Movimento registrado no período (o que a API devolve)
  let movimento = 0, qtd = 0;
  try {
    const r = await qbLancamentos({ data_inicio: ini, data_fim: fim, limite: 1000 });
    const l = r.lancamentos || [];
    qtd = l.length;
    movimento = l.reduce((s, x) => x.tipo === 'entrada' ? s + x.valor : x.tipo === 'saida' ? s - x.valor : s, 0);
  } catch (e) { out.erro_lancamentos = e.message; }
  out.lancamentos_no_periodo = qtd;
  out.movimento_registrado = round(movimento);

  // 3. Diagnóstico do que costuma faltar
  out.orientacao = {
    causa_mais_comum: 'Transações importadas do banco que ainda estão em "Para revisão" no QuickBooks.',
    explicacao: 'Enquanto uma transação está na fila de revisão (mesmo aparecendo como "Correspondido"), ela NÃO existe como lançamento contábil — a API do QuickBooks não a devolve, e ela não entra no saldo nem no extrato do Atlantyx.',
    como_resolver: [
      'No QuickBooks: menu Transações → Transações bancárias (Banking)',
      'Aba "Para revisão" — veja quantas estão pendentes',
      'Revise a categoria de cada uma e clique em Confirmar/Adicionar',
      'Depois disso, clique em Atualizar no Atlantyx: elas passam a aparecer',
    ],
    observacao: 'O saldo mostrado pelo próprio QuickBooks também ignora as transações não aceitas — por isso ele pode divergir do saldo real do banco.',
  };
  out.contas = contas.map(c => ({ nome: c.nome, saldo: round(c.saldo), tipo: c.tipo }));
  return { conferencia: out };
}

async function qbVarrerDuplicados({ data_inicio, data_fim, tolerancia_dias = 3 } = {}) {
  if (!qbConfigurado()) return { erro: 'QuickBooks não configurado' };
  const token = await qbToken();
  const hoje = new Date().toISOString().split('T')[0];
  const ini = data_inicio || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
  const fim = data_fim || hoje;

  const entidades = ['Payment', 'Deposit', 'Purchase', 'Bill', 'Invoice', 'SalesReceipt'];
  const todos = [];
  const errosConsulta = [];
  for (const ent of entidades) {
    try {
      const d = await qbQuery(`select * from ${ent} where TxnDate >= '${ini}' and TxnDate <= '${fim}' maxresults 1000`, token);
      (d?.QueryResponse?.[ent] || []).forEach(it => {
        const vinculos = [];
        (it.Line || []).forEach(l => (l.LinkedTxn || []).forEach(lt => vinculos.push(`${lt.TxnType}#${lt.TxnId}`)));
        todos.push({ entidade: ent, id: it.Id, doc: it.DocNumber || null,
          data: (it.TxnDate || '').substring(0, 10),
          valor: Math.round(parseFloat(it.TotalAmt || 0) * 100) / 100,
          contraparte: it.CustomerRef?.name || it.VendorRef?.name || it.EntityRef?.name || '',
          vinculos, criado_em: it.MetaData?.CreateTime || null,
          memo: (it.PrivateNote || it.CustomerMemo?.value || '').substring(0, 80) });
      });
    } catch (e) { errosConsulta.push(`${ent}: ${e.message}`); }
  }

  // Agrupa por valor + contraparte; datas próximas (dentro da tolerância) contam como o mesmo evento
  const grupos = {};
  todos.forEach(t => {
    if (!t.valor) return;
    const chave = `${t.valor.toFixed(2)}|${normEmpresaFin(t.contraparte)}`;
    (grupos[chave] = grupos[chave] || []).push(t);
  });

  const suspeitos = [];
  for (const [chave, itens] of Object.entries(grupos)) {
    if (itens.length < 2) continue;
    itens.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    // Só agrupa os que estão dentro da janela de dias
    const dif = (a, b) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
    const bloco = [itens[0]];
    for (let i = 1; i < itens.length; i++) {
      if (dif(itens[i].data, bloco[0].data) <= tolerancia_dias) bloco.push(itens[i]);
    }
    if (bloco.length < 2) continue;

    // Classificação: mesma entidade = duplicidade real; entidades ligadas = vínculo normal
    const idsNoBloco = bloco.map(b => `${b.entidade}#${b.id}`);
    const temVinculoEntreSi = bloco.some(b => (b.vinculos || []).some(v => idsNoBloco.includes(v)));
    const porEntidade = {};
    bloco.forEach(b => { porEntidade[b.entidade] = (porEntidade[b.entidade] || 0) + 1; });
    const mesmaEntidadeRepetida = Object.entries(porEntidade).filter(([, n]) => n > 1);

    let classificacao, gravidade, explicacao;
    if (mesmaEntidadeRepetida.length) {
      classificacao = 'duplicidade_real'; gravidade = 'alta';
      explicacao = `${mesmaEntidadeRepetida.map(([e, n]) => n + ' registros de ' + e).join(' e ')} com o mesmo valor e contraparte. Provável lançamento repetido na contabilidade.`;
    } else if (temVinculoEntreSi) {
      classificacao = 'vinculado'; gravidade = 'ok';
      explicacao = 'Registros de tipos diferentes e vinculados entre si (ex.: pagamento e o depósito dele). O sistema já trata — não conta em dobro.';
    } else {
      classificacao = 'suspeito_sem_vinculo'; gravidade = 'media';
      explicacao = 'Tipos diferentes, mesmo valor e contraparte, SEM vínculo declarado. Pode ser o mesmo dinheiro registrado duas vezes (ex.: depósito criado à mão em vez de casado com o recebimento).';
    }
    suspeitos.push({ valor: bloco[0].valor, contraparte: bloco[0].contraparte || '(sem nome)',
      classificacao, gravidade, explicacao, registros: bloco,
      impacto_no_caixa: gravidade === 'alta' ? Math.round(bloco[0].valor * (bloco.length - 1) * 100) / 100 : 0 });
  }

  suspeitos.sort((a, b) => (b.gravidade === 'alta') - (a.gravidade === 'alta') || b.valor - a.valor);
  const resumo = {
    periodo: { de: ini, ate: fim },
    registros_analisados: todos.length,
    duplicidade_real: suspeitos.filter(s => s.classificacao === 'duplicidade_real').length,
    suspeitos_sem_vinculo: suspeitos.filter(s => s.classificacao === 'suspeito_sem_vinculo').length,
    vinculados_ok: suspeitos.filter(s => s.classificacao === 'vinculado').length,
    impacto_total: Math.round(suspeitos.reduce((s, x) => s + x.impacto_no_caixa, 0) * 100) / 100,
  };
  return { varredura: { resumo, suspeitos, erros_consulta: errosConsulta } };
}
function normEmpresaFin(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').substring(0, 20);
}

async function qbRastrearDuplicados({ data, valor, cliente } = {}) {
  if (!qbConfigurado()) return { erro: 'QuickBooks não configurado' };
  const token = await qbToken();
  const dia = (data || new Date().toISOString().split('T')[0]).substring(0, 10);
  const alvoValor = valor != null ? parseFloat(valor) : null;
  const out = { data: dia, valor_procurado: alvoValor, cliente_procurado: cliente || null, achados: [], conclusao: null };

  const entidades = ['Payment', 'Deposit', 'Invoice', 'SalesReceipt'];
  for (const ent of entidades) {
    try {
      const d = await qbQuery(`select * from ${ent} where TxnDate = '${dia}' maxresults 200`, token);
      const itens = d?.QueryResponse?.[ent] || [];
      for (const it of itens) {
        const total = parseFloat(it.TotalAmt || 0);
        const nomeCli = it.CustomerRef?.name || it.DepositToAccountRef?.name || '';
        if (alvoValor != null && Math.abs(total - alvoValor) > 0.01) continue;
        if (cliente && !String(nomeCli).toLowerCase().includes(String(cliente).toLowerCase())) continue;
        const vinculos = [];
        (it.Line || []).forEach(l => (l.LinkedTxn || []).forEach(lt => vinculos.push(`${lt.TxnType}#${lt.TxnId}`)));
        out.achados.push({ entidade: ent, id: it.Id, doc: it.DocNumber || null, data: it.TxnDate,
          valor: Math.round(total * 100) / 100, cliente: nomeCli,
          vinculado_a: vinculos, criado_em: it.MetaData?.CreateTime || null,
          conta: it.DepositToAccountRef?.name || it.APAccountRef?.name || null,
          memo: (it.PrivateNote || it.CustomerMemo?.value || '').substring(0, 120) });
      }
    } catch (e) { out.achados.push({ entidade: ent, erro: e.message }); }
  }

  // Conclusão automática
  const reais = out.achados.filter(a => !a.erro);
  const mesmaEntidade = {};
  reais.forEach(a => { mesmaEntidade[a.entidade] = (mesmaEntidade[a.entidade] || 0) + 1; });
  const duplicadosNoQb = Object.entries(mesmaEntidade).filter(([, n]) => n > 1);
  if (duplicadosNoQb.length) {
    out.conclusao = { origem: 'quickbooks',
      texto: `Existem ${duplicadosNoQb.map(([e, n]) => n + ' registros de ' + e).join(' e ')} com o mesmo valor e data NO PRÓPRIO QUICKBOOKS. A duplicidade está na base contábil, não no Atlantyx.`,
      acao: 'Abra esses registros no QuickBooks e exclua/estorne o lançamento repetido. Os IDs estão listados acima.' };
  } else if (reais.length > 1) {
    const temVinculo = reais.some(a => (a.vinculado_a || []).length);
    out.conclusao = { origem: temVinculo ? 'relacionados' : 'distintos',
      texto: temVinculo
        ? 'Os registros encontrados são de tipos diferentes e estão VINCULADOS entre si (ex.: um pagamento e o depósito dele). O Atlantyx já deduplica esse caso a partir da v1.41.'
        : `Foram encontrados ${reais.length} registros de tipos diferentes com o mesmo valor, SEM vínculo entre si. Podem ser transações realmente distintas que coincidem em valor — confira os memos e contas acima.`,
      acao: temVinculo ? 'Se ainda aparecer duplicado na tela, o deploy da v1.41 pode não estar ativo.' : 'Confira no QuickBooks se são mesmo duas entradas diferentes.' };
  } else if (reais.length === 1) {
    out.conclusao = { origem: 'unico', texto: 'Só existe UM registro com esse valor e data no QuickBooks. Se a tela mostra duas linhas, o problema é do Atlantyx (contagem em duplicidade).',
      acao: 'Me envie este resultado — com um único registro na origem, o defeito é de leitura e eu corrijo.' };
  } else {
    out.conclusao = { origem: 'nenhum', texto: 'Nenhum registro encontrado com esse valor nesta data no QuickBooks.',
      acao: 'Confira a data e o valor. Lembre que o QuickBooks pode registrar em data diferente da exibida.' };
  }
  return { rastreamento: out };
}

// v1.52: compara o saldo do Atlantyx com o saldo POR CONTA do QuickBooks numa data,
// para achar de onde vem uma diferença constante (conta a mais/a menos na soma).
// v1.53: lista as contas bancárias para o seletor da tela
// v1.54: EXCLUIR um lançamento diretamente no QuickBooks.
// Ação destrutiva e irreversível na contabilidade — por isso exige confirmação explícita
// (confirmar: true) e devolve o registro completo antes de apagar, para conferência.
const ENTIDADE_POR_TIPO = {
  despesa: 'Purchase', pagamento: 'Payment', pagto_conta: 'BillPayment', deposito: 'Deposit',
  venda: 'SalesReceipt', transferencia: 'Transfer', lancamento: 'JournalEntry',
  pagto_cartao: 'CreditCardPayment', reembolso: 'RefundReceipt', invoice: 'Invoice',
};
async function qbExcluirLancamento({ qb_txn_id, confirmar = false } = {}) {
  if (!qb_txn_id) throw new Error('qb_txn_id obrigatório');
  if (!qbConfigurado()) throw new Error('QuickBooks não configurado');
  const [tipo, id] = String(qb_txn_id).split(':');
  const entidade = ENTIDADE_POR_TIPO[tipo];
  if (!entidade || !id) throw new Error(`Identificador inválido: ${qb_txn_id}`);

  const token = await qbToken();
  const realm = qbRealmId();
  const sandbox = process.env.QB_SANDBOX === 'true';
  const base = sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';

  // 1. Buscar o registro (precisamos do SyncToken e queremos mostrar o que será apagado)
  const r = await qbQuery(`select * from ${entidade} where Id = '${id}'`, token);
  const item = (r?.QueryResponse?.[entidade] || [])[0];
  if (!item) throw new Error(`Lançamento ${entidade} #${id} não encontrado no QuickBooks (já foi excluído?).`);

  const resumo = {
    entidade, id: item.Id, doc: item.DocNumber || null, data: item.TxnDate,
    valor: round(parseFloat(item.TotalAmt || 0)),
    contraparte: item.VendorRef?.name || item.CustomerRef?.name || item.EntityRef?.name || '',
    conta: item.AccountRef?.name || item.DepositToAccountRef?.name || item.BankAccountRef?.name || '',
    memo: (item.PrivateNote || '').substring(0, 200),
    vinculos: [], criado_em: item.MetaData?.CreateTime || null,
  };
  (item.Line || []).forEach(l => (l.LinkedTxn || []).forEach(lt => resumo.vinculos.push(`${lt.TxnType}#${lt.TxnId}`)));

  // 2. Sem confirmação, devolve a prévia — a tela mostra e pede o "sim"
  if (!confirmar) {
    return { previa: true, sera_excluido: resumo,
      aviso: resumo.vinculos.length
        ? `⚠ Este lançamento está VINCULADO a: ${resumo.vinculos.join(', ')}. Excluí-lo pode deixar a fatura/conta ligada em aberto novamente.`
        : 'Nenhum vínculo com outros lançamentos.',
      irreversivel: 'A exclusão é feita direto na sua contabilidade e NÃO pode ser desfeita pelo Atlantyx.' };
  }

  // 3. Exclusão
  const resp = await fetch(`${base}/v3/company/${realm}/${entidade.toLowerCase()}?operation=delete&minorversion=65`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ Id: item.Id, SyncToken: item.SyncToken }),
  });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = d.Fault?.Error?.[0]?.Message || d.Fault?.Error?.[0]?.Detail || JSON.stringify(d).substring(0, 200);
    throw new Error(`QuickBooks recusou a exclusão: ${msg}`);
  }
  console.log(`[Financeiro] EXCLUÍDO no QuickBooks: ${entidade}#${id} · ${resumo.valor} · ${resumo.contraparte}`);
  return { excluido: true, registro: resumo, resposta_qb: d[entidade]?.status || 'Deleted' };
}

// v1.55: razão (General Ledger) de uma conta numa data — dá o saldo REAL do razão,
// que é diferente do CurrentBalance e do saldo do banco.
async function qbRazaoConta({ conta_id, data_inicio, data_fim } = {}) {
  if (!qbConfigurado()) return { erro: 'QuickBooks não configurado' };
  const token = await qbToken();
  const hoje = new Date().toISOString().split('T')[0];
  const ini = data_inicio || `${hoje.substring(0, 8)}01`;
  const fim = data_fim || hoje;
  const out = { periodo: { de: ini, ate: fim }, conta_id: conta_id || null };

  // Nome e saldos da conta
  try {
    const d = await qbQuery(`select * from Account where AccountType = 'Bank' maxresults 100`, token);
    const contas = (d?.QueryResponse?.Account || []).filter(a => a.Active !== false);
    const alvo = conta_id ? contas.find(c => String(c.Id) === String(conta_id)) : null;
    out.conta_nome = alvo?.Name || (conta_id ? 'conta ' + conta_id : 'todas as contas');
    out.saldo_contabil_hoje = alvo ? round(parseFloat(alvo.CurrentBalance || 0)) : round(contas.reduce((s, c) => s + parseFloat(c.CurrentBalance || 0), 0));
  } catch (e) { out.erro_conta = e.message; }

  // Razão do período
  try {
    const params = `start_date=${ini}&end_date=${fim}&accounting_method=Accrual&columns=tx_date,txn_type,doc_num,name,memo,split_acc,subt_nat_amount,rbal_nat_amount`
      + (conta_id ? `&account=${conta_id}` : '');
    const rep = await qbFetch(`/reports/GeneralLedger?${params}`, token);

    // v1.55.1 FIX: o QuickBooks devolve os valores no formato AMERICANO ("4198.24"), com ponto
    // como separador DECIMAL. Meu código removia todos os pontos achando que eram separador de
    // milhar — "4198.24" virava 419824, e o total explodia para quatrilhões.
    const numQB = (v) => {
      if (v == null || v === '') return null;
      const s = String(v).trim();
      // formato americano: ponto decimal, vírgula opcional como milhar
      const limpo = s.replace(/[^\d.,-]/g, '').replace(/,/g, '');
      const n = parseFloat(limpo);
      return isNaN(n) ? null : Math.round(n * 100) / 100;
    };
    // v1.55.1: as colunas vêm na ordem pedida em `columns` — mapeamos pelo cabeçalho quando possível
    const nomesCol = (rep?.Columns?.Column || []).map(c => (c.ColType || c.ColTitle || '').toLowerCase());
    const idxDe = (...chaves) => {
      for (const k of chaves) { const i = nomesCol.findIndex(n => n.includes(k)); if (i >= 0) return i; }
      return -1;
    };
    const iData = idxDe('tx_date', 'date') >= 0 ? idxDe('tx_date', 'date') : 0;
    const iTipo = idxDe('txn_type', 'type');
    const iDoc = idxDe('doc_num');
    const iNome = idxDe('name');
    const iMemo = idxDe('memo');
    const iSplit = idxDe('split');
    const iValor = idxDe('subt_nat_amount', 'amount');
    const iSaldo = idxDe('rbal_nat_amount', 'balance');

    const linhas = [];
    let saldoInicialRazao = null, saldoFinalRazao = null;
    (function percorrer(node) {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(percorrer);
      if (node.Rows?.Row) percorrer(node.Rows.Row);
      if (node.Header?.ColData) {
        const t = node.Header.ColData.map(c => c.value).join(' ').toLowerCase();
        if (/beginning balance|saldo inicial/.test(t)) {
          const v = node.Header.ColData.map(c => numQB(c.value)).filter(n => n != null);
          if (v.length) saldoInicialRazao = v[v.length - 1];
        }
      }
      if (node.Summary?.ColData) {
        const v = node.Summary.ColData.map(c => numQB(c.value)).filter(n => n != null);
        if (v.length) saldoFinalRazao = v[v.length - 1];
      }
      if (node.ColData && !node.Rows) {
        const c = node.ColData.map(x => x.value);
        const dataStr = String(c[iData] ?? '');
        if (dataStr && /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(dataStr)) {
          const valor = numQB(iValor >= 0 ? c[iValor] : c[c.length - 2]);
          const saldo = numQB(iSaldo >= 0 ? c[iSaldo] : c[c.length - 1]);
          linhas.push({ data: dataStr.substring(0, 10),
            tipo: (iTipo >= 0 ? c[iTipo] : c[1]) || '', doc: (iDoc >= 0 ? c[iDoc] : '') || '',
            nome: (iNome >= 0 ? c[iNome] : c[3]) || '', memo: (iMemo >= 0 ? c[iMemo] : '') || '',
            contrapartida: (iSplit >= 0 ? c[iSplit] : '') || '',
            valor, saldo });
        }
      }
    })(rep?.Rows?.Row || rep?.Rows);
    out.linhas = linhas;
    out.colunas_recebidas = nomesCol;
    // v1.56: DIAGNÓSTICO — devolve a estrutura bruta do relatório para mapear o formato real.
    // Parei de adivinhar o layout: com a amostra abaixo dá para ver exatamente onde estão
    // os valores e ajustar o parsing com base em dado real, não em suposição.
    try {
      out.debug_estrutura = {
        colunas_completas: (rep?.Columns?.Column || []).map(c => ({ titulo: c.ColTitle, tipo: c.ColType, meta: c.MetaData })),
        primeiras_linhas_brutas: JSON.parse(JSON.stringify(rep?.Rows?.Row || [])).slice(0, 3),
        tem_header: !!rep?.Header, tem_summary: !!(rep?.Rows?.Row || []).some(r => r.Summary),
      };
    } catch (e) { out.debug_estrutura = { erro: e.message }; }
    out.total_linhas = linhas.length;
    out.saldo_inicial_razao = saldoInicialRazao != null ? round(saldoInicialRazao) : (linhas.length && linhas[0].saldo != null && linhas[0].valor != null ? round(linhas[0].saldo - linhas[0].valor) : null);
    out.saldo_final_razao = saldoFinalRazao != null ? round(saldoFinalRazao) : (linhas.length ? linhas[linhas.length - 1].saldo : null);
    out.movimento_periodo = round(linhas.reduce((s, l) => s + (l.valor || 0), 0));
    // v1.55.1: se o saldo inicial não veio no cabeçalho, deduz da 1ª linha (saldo − valor)
    if (out.saldo_inicial_razao == null && linhas.length && linhas[0].saldo != null && linhas[0].valor != null) {
      out.saldo_inicial_razao = round(linhas[0].saldo - linhas[0].valor);
    }
  } catch (e) { out.erro_razao = e.message; }

  // v1.56: FONTE ALTERNATIVA — o saldo da conta numa data pelo Balanço Patrimonial.
  // Mais confiável que o razão para responder "qual era o saldo em 01/08", porque é um número
  // único por conta, sem depender de interpretar linhas de relatório.
  if (conta_id) {
    try {
      const diaAnterior = new Date(new Date(ini + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0];
      const bs = await qbFetch(`/reports/BalanceSheet?date=${diaAnterior}&accounting_method=Accrual&minorversion=65`, token);
      const achar = (node, alvo) => {
        let achado = null;
        (function p(n) {
          if (!n || achado) return;
          if (Array.isArray(n)) return n.forEach(p);
          const cols = n.ColData || n.Header?.ColData || n.Summary?.ColData;
          if (cols && cols.length >= 2) {
            const nome = String(cols[0].value || '').toLowerCase().trim();
            if (nome && alvo && nome.includes(alvo)) {
              const v = parseFloat(String(cols[cols.length - 1].value || '').replace(/,/g, ''));
              if (!isNaN(v)) achado = Math.round(v * 100) / 100;
            }
          }
          if (n.Rows?.Row) p(n.Rows.Row);
        })(node);
        return achado;
      };
      const nomeAlvo = String(out.conta_nome || '').toLowerCase().trim();
      const saldoBS = achar(bs?.Rows?.Row || bs?.Rows, nomeAlvo);
      if (saldoBS != null) {
        out.saldo_na_data_balanco = saldoBS;
        out.saldo_na_data_fonte = `Balanço Patrimonial em ${diaAnterior} (fechamento do dia anterior ao período)`;
      }
    } catch (e) { out.erro_balanco = e.message; }
  }

  out.explicacao = {
    saldo_contabil: 'CurrentBalance da conta na API — o que o Atlantyx usa como saldo de hoje.',
    saldo_razao: 'Saldo apurado pelo relatório de razão no período pedido.',
    saldo_banco: 'O QuickBooks também exibe o "saldo do banco" na tela de contas. Ele NÃO vem pela API. Se ele for diferente do contábil, a diferença é o que ainda não foi conciliado (transações que o banco já processou e o QuickBooks ainda não lançou).',
  };
  return { razao: out };
}

async function qbContasParaFiltro() {
  if (!qbConfigurado()) return { contas: [], qb_configurado: false };
  try {
    const token = await qbToken();
    const d = await qbQuery(`select * from Account where AccountType = 'Bank' maxresults 100`, token);
    const contas = (d?.QueryResponse?.Account || []).filter(a => a.Active !== false)
      .map(a => ({ id: a.Id, nome: a.Name, subtipo: a.AccountSubType || '', saldo: round(parseFloat(a.CurrentBalance || 0)) }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    return { contas, qb_configurado: true, saldo_total: round(contas.reduce((s, c) => s + c.saldo, 0)) };
  } catch (e) { return { contas: [], erro: e.message }; }
}

async function qbSaldoPorContaNaData({ data } = {}) {
  if (!qbConfigurado()) return { erro: 'QuickBooks não configurado' };
  const token = await qbToken();
  const alvo = (data || new Date().toISOString().split('T')[0]).substring(0, 10);
  const out = { data: alvo, contas: [], saldo_total_hoje: 0, observacoes: [] };
  try {
    // Saldo ATUAL de cada conta
    const d = await qbQuery(`select * from Account where AccountType = 'Bank' maxresults 100`, token);
    const contas = (d?.QueryResponse?.Account || []).filter(a => a.Active !== false);
    // Relatório de balancete NA DATA pedida — dá o saldo histórico por conta
    let saldosNaData = {};
    try {
      const bs = await qbFetch(`/reports/BalanceSheet?date=${alvo}&accounting_method=Cash`, token);
      const linhas = extrairLinhasRelatorio(bs);
      linhas.forEach(l => { if (l.nome) saldosNaData[String(l.nome).toLowerCase().trim()] = l.valor; });
    } catch (e) { out.observacoes.push('Balancete na data indisponível: ' + e.message); }

    for (const a of contas) {
      const nome = a.Name;
      const saldoNaData = saldosNaData[String(nome).toLowerCase().trim()];
      out.contas.push({ id: a.Id, nome, subtipo: a.AccountSubType || '',
        saldo_hoje: round(parseFloat(a.CurrentBalance || 0)),
        saldo_na_data: saldoNaData != null ? round(saldoNaData) : null });
      out.saldo_total_hoje += parseFloat(a.CurrentBalance || 0);
    }
    out.saldo_total_hoje = round(out.saldo_total_hoje);
    out.saldo_total_na_data = out.contas.every(c => c.saldo_na_data != null)
      ? round(out.contas.reduce((s, c) => s + c.saldo_na_data, 0)) : null;

    if (out.contas.length > 1) {
      out.observacoes.push(`O fluxo do Atlantyx soma TODAS as ${out.contas.length} contas do tipo Bank. Se você está comparando com o Plano de Contas de UMA conta só, a diferença é o saldo das outras.`);
    }
    const negativas = out.contas.filter(c => c.saldo_hoje < 0);
    if (negativas.length) out.observacoes.push(`${negativas.length} conta(s) com saldo negativo: ${negativas.map(c => c.nome + ' (' + c.saldo_hoje.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) + ')').join(', ')}.`);
  } catch (e) { out.erro = e.message; }
  return { saldo_por_conta: out };
}

async function qbContasDiagnostico() {
  if (!qbConfigurado()) return { erro: 'QuickBooks não configurado' };
  const token = await qbToken();
  const out = { contas_bank: [], contas_cartao: [], outras_relevantes: [], suspeitas: [], saldo_bank_total: 0 };
  try {
    const d = await qbQuery(`select * from Account where AccountType in ('Bank','Credit Card','Other Current Asset','Other Current Liability') maxresults 200`, token);
    const contas = (d?.QueryResponse?.Account || []).filter(a => a.Active !== false);
    for (const a of contas) {
      const item = { id: a.Id, nome: a.Name, tipo: a.AccountType, subtipo: a.AccountSubType || '',
        saldo: round(parseFloat(a.CurrentBalance || 0)), moeda: a.CurrencyRef?.value || 'BRL',
        numero: a.AcctNum || '', descricao: a.Description || '' };
      if (a.AccountType === 'Bank') { out.contas_bank.push(item); out.saldo_bank_total += item.saldo; }
      else if (a.AccountType === 'Credit Card') out.contas_cartao.push(item);
      else if (item.saldo !== 0) out.outras_relevantes.push(item);

      // Heurísticas de classificação suspeita
      const nomeLower = (a.Name + ' ' + (a.Description || '')).toLowerCase();
      const pareceCartao = /cart[aã]o|credit|visa|master|amex|elo\b/.test(nomeLower);
      if (a.AccountType === 'Bank' && pareceCartao) {
        out.suspeitas.push({ conta: a.Name, saldo: item.saldo, tipo_atual: 'Bank',
          problema: 'O nome sugere CARTÃO DE CRÉDITO, mas está classificada como conta bancária (Bank).',
          efeito: 'A dívida do cartão é somada como se fosse saldo negativo em caixa, derrubando o saldo de partida do fluxo.',
          acao: 'No QuickBooks: Plano de Contas → editar esta conta → mudar o tipo para "Cartão de crédito" (Credit Card).' });
      }
      if (a.AccountType === 'Bank' && item.saldo < 0 && !pareceCartao) {
        out.suspeitas.push({ conta: a.Name, saldo: item.saldo, tipo_atual: 'Bank',
          problema: 'Conta bancária com saldo negativo.',
          efeito: 'Entra integralmente como caixa negativo no ponto de partida da projeção.',
          acao: 'Confirme se é cheque especial de verdade. Se a conta foi importada, verifique se o saldo de abertura (opening balance) foi lançado — sem ele, só as saídas entram e o saldo fica negativo artificialmente.' });
      }
    }
    out.saldo_bank_total = round(out.saldo_bank_total);
    out.saldo_cartoes_total = round(out.contas_cartao.reduce((s, c) => s + c.saldo, 0));
    // Como ficaria se as suspeitas de cartão fossem reclassificadas
    const somaSuspeitasCartao = out.suspeitas.filter(s => /CART[AÃ]O/i.test(s.problema)).reduce((s, x) => s + x.saldo, 0);
    if (somaSuspeitasCartao !== 0) out.saldo_bank_se_corrigido = round(out.saldo_bank_total - somaSuspeitasCartao);
  } catch (e) { out.erro = e.message; }
  return { diagnostico_contas: out };
}

async function qbSaldoContas() {
  if (!qbConfigurado()) return { contas: [], saldo_total: 0, qb_configurado: false };
  const token = await qbToken();
  const data = await qbQuery(`select * from Account where AccountType = 'Bank'`, token);
  const accounts = data?.QueryResponse?.Account || [];
  const contas = accounts.map(a => ({
    id: a.Id,
    nome: a.Name,
    numero: a.AcctNum || '',
    tipo: a.AccountSubType || a.AccountType,
    saldo: parseFloat(a.CurrentBalance || 0),
    moeda: a.CurrencyRef?.value || 'BRL',
    ativa: a.Active !== false,
  })).filter(c => c.ativa);
  return {
    contas,
    saldo_total: contas.reduce((s, c) => s + c.saldo, 0),
    qb_configurado: true,
  };
}

function extrairLinhasRelatorio(data) {
  const linhas = [];
  const rows = data?.Rows?.Row || [];
  function processRow(row, nivel = 0) {
    if (row.type === 'Section') {
      const header = row.Header?.ColData?.[0]?.value;
      if (header) linhas.push({ tipo: 'secao', label: header, nivel, valor: null });
      (row.Rows?.Row || []).forEach(r => processRow(r, nivel + 1));
      const summary = row.Summary?.ColData;
      if (summary) {
        const label = summary[0]?.value;
        const valor = parseFloat(summary[summary.length - 1]?.value || 0);
        if (label) linhas.push({ tipo: 'total', label, nivel, valor });
      }
    } else if (row.type === 'Data') {
      const cols = row.ColData || [];
      const label = cols[0]?.value;
      const valor = parseFloat(cols[cols.length - 1]?.value || 0);
      if (label) linhas.push({ tipo: 'linha', label, nivel, valor });
    }
  }
  rows.forEach(r => processRow(r));
  return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Painel resumo — único endpoint que o frontend chama no Sync
// ═══════════════════════════════════════════════════════════════════════════

async function painelResumo({ mes, ano } = {}) {
  const resp = {
    qb_configurado: qbConfigurado(),
    timestamp: new Date().toISOString(),
    realAnual: 0,
    realMes: 0,
    aReceber: 0,
    aPagar: 0,
    projetado: 0,
    saldoCaixa: 0,
    lancamentos: [],
    contasReceber: { total: 0, vencido: 0, a_vencer_30d: 0 },
    contasPagar: { total: 0 },
    erros: [],
  };

  if (!qbConfigurado()) {
    resp.erros.push('QuickBooks não configurado — preencha QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REFRESH_TOKEN, QB_REALM_ID no Vercel');
    return resp;
  }

  const token = await qbToken();

  // Em paralelo: DRE do ano, DRE do mês, AR, AP, saldos, lançamentos recentes
  // v1.36: período selecionável. Sem filtro = mês/ano corrente (comportamento antigo).
  // Com mês/ano escolhidos, o "mês" vira o mês inteiro selecionado e o "ano" vai até o fim dele.
  const hoje = new Date();
  const anoSel = ano ? parseInt(ano) : hoje.getFullYear();
  const mesSel = mes ? parseInt(mes) : (ano ? null : hoje.getMonth() + 1);
  const ehPeriodoAtual = anoSel === hoje.getFullYear() && (!mesSel || mesSel === hoje.getMonth() + 1);
  const inicioMes = mesSel ? `${anoSel}-${String(mesSel).padStart(2, '0')}-01` : `${anoSel}-01-01`;
  const fimMes = mesSel
    ? (ehPeriodoAtual ? hoje.toISOString().split('T')[0] : new Date(anoSel, mesSel, 0).toISOString().split('T')[0])
    : (anoSel === hoje.getFullYear() ? hoje.toISOString().split('T')[0] : `${anoSel}-12-31`);
  const inicioAno = `${anoSel}-01-01`;
  const hojeStr = fimMes; // fim do período selecionado
  resp.periodo = { ano: anoSel, mes: mesSel, de: inicioMes, ate: fimMes, atual: ehPeriodoAtual };

  const [pAno, pMes, ar, ap, contas, lanc] = await Promise.allSettled([
    qbFetch(`/reports/ProfitAndLoss?start_date=${inicioAno}&end_date=${hojeStr}`, token),
    qbFetch(`/reports/ProfitAndLoss?start_date=${inicioMes}&end_date=${fimMes}`, token),
    qbFetch(`/reports/AgedReceivables?date_macro=Today`, token),
    qbFetch(`/reports/AgedPayables?date_macro=Today`, token),
    qbQuery(`select * from Account where AccountType = 'Bank'`, token),
    qbLancamentos({ data_inicio: inicioMes, data_fim: fimMes, limite: 50 }),
  ]);

  if (pAno.status === 'fulfilled') {
    const linhas = extrairLinhasRelatorio(pAno.value);
    const totalReceita = linhas.find(l => l.tipo === 'total' && /receita|income|revenue|total income/i.test(l.label))?.valor || 0;
    resp.realAnual = totalReceita;
  } else { resp.erros.push(`DRE ano: ${pAno.reason?.message}`); }

  if (pMes.status === 'fulfilled') {
    const linhas = extrairLinhasRelatorio(pMes.value);
    resp.realMes = linhas.find(l => l.tipo === 'total' && /receita|income|revenue|total income/i.test(l.label))?.valor || 0;
  } else { resp.erros.push(`DRE mês: ${pMes.reason?.message}`); }

  if (ar.status === 'fulfilled') {
    const linhas = extrairLinhasRelatorio(ar.value);
    const total = linhas.find(l => l.tipo === 'total' && /total/i.test(l.label))?.valor || 0;
    resp.aReceber = total;
    resp.contasReceber.total = total;
  }

  if (ap.status === 'fulfilled') {
    const linhas = extrairLinhasRelatorio(ap.value);
    const total = linhas.find(l => l.tipo === 'total' && /total/i.test(l.label))?.valor || 0;
    resp.aPagar = total;
    resp.contasPagar.total = total;
  }

  if (contas.status === 'fulfilled') {
    const accs = contas.value?.QueryResponse?.Account || [];
    resp.saldoCaixa = accs.filter(a => a.Active !== false).reduce((s, a) => s + parseFloat(a.CurrentBalance || 0), 0);
  }

  if (lanc.status === 'fulfilled') {
    resp.lancamentos = lanc.value.lancamentos.slice(0, 20);
  }

  return resp;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Extrato consolidado (QB + simulados − ocultos) com saldo acumulado
// ═══════════════════════════════════════════════════════════════════════════

async function extratoConsolidado({ data_inicio, data_fim, incluir_simulados = true, conta_id = null } = {}) {
  const hoje = new Date().toISOString().split('T')[0];
  const ini = data_inicio || new Date(Date.now() - 90 * 86400 * 1000).toISOString().split('T')[0];
  const fim = data_fim || hoje;

  // 1. Lançamentos QB (já filtrados de ocultos)
  let qbLanc = [], qbErro = null;
  try {
    const r = await qbLancamentos({ data_inicio: ini, data_fim: fim, limite: 500 });
    qbLanc = r.lancamentos || [];
    if (r.erros?.length) qbErro = r.erros.join(' | ');
  } catch (e) {
    console.log('[Extrato] QB indisponível:', e.message); qbErro = e.message;
  }

  // 2. Simulados
  let simulados = [];
  if (incluir_simulados) {
    try {
      const sql = await getSql();
      const rows = await sql`SELECT * FROM lancamentos_simulados
        WHERE excluido = false AND data >= ${ini} AND data <= ${fim}
        ORDER BY data ASC`;
      simulados = rows.map(r => ({
        id: r.id,
        data: String(r.data).split('T')[0],
        descricao: r.descricao,
        categoria: r.categoria,
        tipo: r.tipo,
        valor: parseFloat(r.valor),
        origem: 'simulado',
      }));
    } catch (e) {
      console.log('[Extrato] simulados:', e.message);
    }
  }

  // 3. Saldo inicial mais próximo (anterior a data_inicio)
  // v1.46 FIX: o saldo inicial vinha SÓ de um cadastro manual (saldos_iniciais). Se não houvesse
  // registro, ficava ZERO — e o extrato de um mês começava do nada, ignorando todo o histórico
  // anterior. Era o motivo de o saldo não acumular ao filtrar um período.
  // Agora: pega o saldo cadastrado mais próximo ANTES do período e soma tudo que aconteceu
  // entre essa data e o início do período. Sem cadastro nenhum, reconstrói desde o começo.
  let saldoInicial = 0;
  let saldoInicialData = null;
  let saldoInicialOrigem = 'zero';
  let saldoInicialDetalhe = null;
  try {
    const sql = await getSql();
    const rows = await sql`SELECT * FROM saldos_iniciais WHERE data_ref <= ${ini} ORDER BY data_ref DESC LIMIT 1`;
    let baseValor = 0, baseData = null;
    if (rows[0]) {
      baseValor = parseFloat(rows[0].valor);
      baseData = String(rows[0].data_ref).split('T')[0];
      saldoInicialOrigem = 'saldo_cadastrado';
    }
    // v1.46.1 CORREÇÃO DA CORREÇÃO: reconstruir o saldo somando todo o histórico de lançamentos
    // estava ERRADO por dois motivos:
    //   (a) o QuickBooks já mantém o saldo real de cada conta bancária (CurrentBalance) — refazer
    //       essa conta manualmente acumula qualquer duplicidade existente na base;
    //   (b) a soma de "entradas - saídas" do extrato não equivale a saldo bancário (transferências
    //       entre contas, saldos de abertura das próprias contas, etc.).
    // A fonte correta é o QuickBooks. Só recuamos no tempo quando o período pedido é PASSADO,
    // e aí subtraímos do saldo atual o que aconteceu depois — que é uma conta bem menor e verificável.
    const ateAnterior = new Date(new Date(ini + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0];
    const hojeStr2 = new Date().toISOString().split('T')[0];

    let saldoHoje = null;
    try {
      const sc = await qbSaldoContas();
      if (sc?.qb_configurado) {
        // v1.53: com filtro de conta, usa o saldo APENAS dessa conta
        saldoHoje = conta_id
          ? (sc.contas || []).filter(c => String(c.id) === String(conta_id)).reduce((s, c) => s + c.saldo, 0)
          : sc.saldo_total;
      }
    } catch (_) {}

    if (saldoHoje != null) {
      // Saldo no início do período = saldo de hoje − movimento entre o início do período e hoje
      // v1.51 FIX: este movimento PRECISA ser idêntico ao que o extrato vai somar depois.
      // Antes havia 3 diferenças que faziam a conta não fechar:
      //   (a) período: aqui ia até HOJE, mas o extrato vai até o fim do filtro;
      //   (b) lançamentos ocultados pelo usuário eram descontados aqui mas não lá (ou vice-versa);
      //   (c) simulados entravam no extrato e não entravam aqui.
      // Agora reaproveitamos a MESMA lista que o extrato usa.
      const movDepois = await (async () => {
        try {
          const r = await qbLancamentos({ data_inicio: ini, data_fim: hojeStr2, limite: 1000, conta_id });
          // Mesma lista já vem sem os ocultos (qbLancamentos filtra internamente)
          return (r.lancamentos || []).reduce((s, l) => l.tipo === 'entrada' ? s + l.valor : l.tipo === 'saida' ? s - l.valor : s, 0);
        } catch { return 0; }
      })();
      // Simulados também entram no extrato — precisam entrar aqui para a conta fechar
      let movSimuladoAte = 0;
      if (incluir_simulados) {
        try {
          const simAte = await simList({ data_inicio: ini, data_fim: hojeStr2 });
          movSimuladoAte = (simAte.lancamentos || []).reduce((s, l) => s + (l.tipo === 'entrada' ? l.valor : -l.valor), 0);
        } catch (_) {}
      }
      saldoInicial = round(saldoHoje - movDepois - movSimuladoAte);
      saldoInicialData = ini;
      saldoInicialOrigem = 'quickbooks_retroagido';
      saldoInicialDetalhe = { saldo_hoje: round(saldoHoje), movimento_no_periodo_ate_hoje: round(movDepois + movSimuladoAte),
        movimento_qb: round(movDepois), movimento_simulado: round(movSimuladoAte),
        observacao: 'Saldo de hoje das contas bancárias do QuickBooks, retroagido até o início do período.' };
    } else if (baseData) {
      // Sem QuickBooks: usa o saldo cadastrado manualmente mais próximo (sem reconstruir histórico)
      saldoInicial = round(baseValor);
      saldoInicialData = baseData;
      saldoInicialOrigem = 'saldo_cadastrado';
      saldoInicialDetalhe = { saldo_base: round(baseValor), base_data: baseData,
        observacao: baseData !== ini ? `Saldo cadastrado em ${baseData}; o movimento entre essa data e ${ini} não está somado (cadastre um saldo mais próximo para maior precisão).` : null };
    } else {
      saldoInicial = 0; saldoInicialOrigem = 'zero';
      saldoInicialDetalhe = { observacao: 'Nenhum saldo bancário disponível: QuickBooks não conectado e nenhum saldo inicial cadastrado. A coluna de saldo mostra apenas a variação no período.' };
    }
  } catch (e) { console.warn('[extrato] saldo inicial:', e.message); }

  // 4. Combinar e ordenar por data
  const todos = [...qbLanc, ...simulados].sort((a, b) => {
    if (a.data === b.data) return a.origem === 'quickbooks' ? -1 : 1;
    return a.data < b.data ? -1 : 1;
  });

  // 5. Recalcular saldo acumulado
  // v1.38: linhas de 'referencia' (nota fiscal emitida) NÃO movimentam o saldo de caixa —
  // aparecem na lista para você ver a emissão, mas o saldo só muda quando o dinheiro entra.
  let saldo = saldoInicial;
  const comSaldo = todos.map(l => {
    if (l.tipo === 'entrada') saldo += l.valor;
    else if (l.tipo === 'saida') saldo -= l.valor;
    return { ...l, saldo_acumulado: Math.round(saldo * 100) / 100 };
  });

  // 6. Resumo
  const entradas = todos.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0);
  const saidas = todos.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0);
  const notasEmitidas = todos.filter(l => l.tipo === 'referencia').reduce((s, l) => s + l.valor, 0);

  return {
    saldo_inicial: saldoInicial,
    saldo_inicial_data: saldoInicialData,
    saldo_inicial_origem: saldoInicialOrigem,     // v1.46
    saldo_inicial_detalhe: saldoInicialDetalhe,   // v1.46: base + movimento anterior
    saldo_final: saldo,
    total_entradas: entradas,
    total_saidas: saidas,
    resultado: entradas - saidas,
    total_notas_emitidas: Math.round(notasEmitidas * 100) / 100, // v1.38: competência, não caixa
    lancamentos: comSaldo,
    contagem: {
      qb: qbLanc.length,
      simulados: simulados.length,
      total: todos.length,
    },
    periodo: { data_inicio: ini, data_fim: fim },
    qb_erro: qbErro,
    qb_lancamentos: qbLanc.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.16: FLUXO DE CAIXA DETALHADO — extrato até hoje + futuro lançamento a
// lançamento (QB: Invoice/RecurringTransaction em aberto + Bill em aberto)
// compondo o saldo projetado, sem limite de meses fixo (até onde o QB tiver dado)
// ═══════════════════════════════════════════════════════════════════════════
async function qbFuturosDetalhado({ data_inicio, data_fim } = {}) {
  // Recebíveis (Invoice em aberto) e Pagáveis (Bill em aberto) do QuickBooks,
  // um lançamento por documento — não agregado por mês.
  const out = { recebiveis: [], pagaveis: [], erro: null };
  if (!qbConfigurado()) { out.erro = 'QuickBooks não configurado'; return out; }
  try {
    const token = await qbToken();
    const limIni = data_inicio ? `and DueDate >= '${data_inicio}'` : '';
    const limFim = data_fim ? `and DueDate <= '${data_fim}'` : '';
    const [inv, bill] = await Promise.all([
      qbQuery(`select * from Invoice where Balance > '0' ${limIni} ${limFim} orderby DueDate asc maxresults 1000`, token).catch(e => ({ _erro: e.message })),
      qbQuery(`select * from Bill where Balance > '0' ${limIni} ${limFim} orderby DueDate asc maxresults 1000`, token).catch(e => ({ _erro: e.message })),
    ]);
    if (inv?._erro) out.erro = (out.erro ? out.erro + ' | ' : '') + 'Invoice: ' + inv._erro;
    else out.recebiveis = (inv?.QueryResponse?.Invoice || []).map(i => ({
      id: 'inv_' + i.Id, data: i.DueDate || i.TxnDate, descricao: (i.CustomerRef?.name || 'Cliente') + (i.DocNumber ? ' · Fat. ' + i.DocNumber : ''),
      categoria: 'A Receber (Invoice)', valor: parseFloat(i.Balance || 0), valor_total: parseFloat(i.TotalAmt || 0), tipo: 'entrada', origem: 'quickbooks_futuro', vencida: i.DueDate ? new Date(i.DueDate) < new Date(new Date().toISOString().split('T')[0]) : false,
    }));
    if (bill?._erro) out.erro = (out.erro ? out.erro + ' | ' : '') + 'Bill: ' + bill._erro;
    else out.pagaveis = (bill?.QueryResponse?.Bill || []).map(b => ({
      id: 'bill_' + b.Id, data: b.DueDate || b.TxnDate, descricao: (b.VendorRef?.name || 'Fornecedor') + (b.DocNumber ? ' · ' + b.DocNumber : ''),
      categoria: 'A Pagar (Bill)', valor: parseFloat(b.Balance || 0), valor_total: parseFloat(b.TotalAmt || 0), tipo: 'saida', origem: 'quickbooks_futuro', vencida: b.DueDate ? new Date(b.DueDate) < new Date(new Date().toISOString().split('T')[0]) : false,
    }));
  } catch (e) { out.erro = e.message; }
  return out;
}

async function fluxoDetalhado({ data_inicio, data_fim, dias_passado = 60, incluir_simulados = true, conta_id = null } = {}) {
  const hoje = new Date().toISOString().split('T')[0];
  // v1.16.1: filtro de período explícito. Se data_inicio/data_fim vierem, o "hoje" divisório
  // passado/futuro só se aplica dentro desse período — passado é [ini, min(hoje,fim)],
  // futuro é [max(hoje+1,ini), fim] (fim vazio = sem limite, como antes).
  const ini = data_inicio || new Date(Date.now() - dias_passado * 86400 * 1000).toISOString().split('T')[0];
  const fim = data_fim || null;
  const fimPassado = fim && fim < hoje ? fim : hoje;
  const iniFuturo = ini > hoje ? ini : hoje;

  // 1. Passado até hoje (ou até "fim", se o período pedido for todo no passado): extrato consolidado
  const extrato = await extratoConsolidado({ data_inicio: ini, data_fim: fimPassado, incluir_simulados, conta_id });

  // 2. Futuro: recebíveis/pagáveis reais do QB, respeitando o fim do período (se houver)
  const fut = (fim && fim < hoje) ? { recebiveis: [], pagaveis: [], erro: null } : await qbFuturosDetalhado({ data_inicio: iniFuturo, data_fim: fim });

  // 3. Despesas programadas do Atlantyx com ocorrência futura (não vinculadas a Bill do QB, para não duplicar)
  let despFuturas = [];
  try {
    const sql = await getSql();
    const rows = fim
      ? await sql`SELECT o.*, d.descricao AS despesa_desc, d.categoria AS despesa_cat
          FROM despesas_ocorrencias o LEFT JOIN despesas_programadas d ON d.id = o.despesa_id
          WHERE o.data_prevista > ${hoje} AND o.data_prevista <= ${fim} AND o.status != 'paga' ORDER BY o.data_prevista ASC`
      : await sql`SELECT o.*, d.descricao AS despesa_desc, d.categoria AS despesa_cat
          FROM despesas_ocorrencias o LEFT JOIN despesas_programadas d ON d.id = o.despesa_id
          WHERE o.data_prevista > ${hoje} AND o.status != 'paga' ORDER BY o.data_prevista ASC`;
    despFuturas = rows.map(r => ({ id: 'desp_' + r.id, data: String(r.data_prevista).split('T')[0], descricao: r.despesa_desc || 'Despesa programada', categoria: r.despesa_cat || 'Despesa', valor: parseFloat(r.valor), tipo: 'saida', origem: 'atlantyx_futuro' }));
  } catch (e) { console.warn('[FluxoDetalhado] despesas futuras:', e.message); }

  // 4. Simulados futuros (lançamentos manuais com data > hoje)
  let simFuturos = [];
  try {
    const sql = await getSql();
    const rows = fim
      ? await sql`SELECT * FROM lancamentos_simulados WHERE excluido = false AND data > ${hoje} AND data <= ${fim} ORDER BY data ASC`
      : await sql`SELECT * FROM lancamentos_simulados WHERE excluido = false AND data > ${hoje} ORDER BY data ASC`;
    simFuturos = rows.map(r => ({ id: 'sim_' + r.id, data: String(r.data).split('T')[0], descricao: r.descricao, categoria: r.categoria, valor: parseFloat(r.valor), tipo: r.tipo, origem: 'simulado_futuro' }));
  } catch (e) { console.warn('[FluxoDetalhado] simulados futuros:', e.message); }

  // 5. Montar linha do tempo futura ordenada, calculando saldo em cascata a partir do saldo de hoje
  const futTodos = [...fut.recebiveis, ...fut.pagaveis, ...despFuturas, ...simFuturos]
    .filter(l => l.data && l.data > hoje)
    .sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  let saldoCorrente = extrato.saldo_final || 0;
  const futuroComSaldo = futTodos.map(l => {
    if (l.tipo === 'entrada') saldoCorrente += l.valor;
    else if (l.tipo === 'saida') saldoCorrente -= l.valor;
    return { ...l, saldo_acumulado: Math.round(saldoCorrente * 100) / 100 };
  });

  const menorSaldo = futuroComSaldo.length ? futuroComSaldo.reduce((min, l) => l.saldo_acumulado < min.saldo_acumulado ? l : min, futuroComSaldo[0]) : null;
  const ultimaData = futuroComSaldo.length ? futuroComSaldo[futuroComSaldo.length - 1].data : hoje;

  // v1.50: o saldo REAL das contas no QuickBooks, para conferência contra o calculado.
  // Sem isso, "Saldo de hoje" era um número derivado (saldo inicial + movimento do período)
  // que herdava qualquer erro do caminho — mas parecia o saldo do banco.
  let saldoRealBanco = null, contasBanco = [];
  try {
    const sc = await qbSaldoContas();
    if (sc?.qb_configurado) {
      contasBanco = sc.contas || [];
      // v1.53: com conta filtrada, compara só com o saldo dela
      saldoRealBanco = conta_id
        ? round(contasBanco.filter(c => String(c.id) === String(conta_id)).reduce((s, c) => s + c.saldo, 0))
        : round(sc.saldo_total);
      if (conta_id) contasBanco = contasBanco.filter(c => String(c.id) === String(conta_id));
    }
  } catch (_) {}
  const saldoCalculado = extrato.saldo_final || 0;
  const divergencia = saldoRealBanco != null ? round(saldoCalculado - saldoRealBanco) : null;

  return {
    hoje,
    periodo: { data_inicio: ini, data_fim: fim },
    // v1.50: conferência explícita
    saldo_real_banco: saldoRealBanco,
    contas_banco: contasBanco.map(c => ({ nome: c.nome, saldo: round(c.saldo) })),
    divergencia_calculado_vs_real: divergencia,
    divergencia_relevante: divergencia != null && Math.abs(divergencia) > 1,
    passado: { saldo_inicial: extrato.saldo_inicial, saldo_inicial_data: extrato.saldo_inicial_data, saldo_inicial_detalhe: extrato.saldo_inicial_detalhe, lancamentos: extrato.lancamentos, total_entradas: extrato.total_entradas, total_saidas: extrato.total_saidas, qb_erro: extrato.qb_erro },
    saldo_hoje: extrato.saldo_final || 0,
    futuro: { lancamentos: futuroComSaldo, total_recebiveis: fut.recebiveis.reduce((s, l) => s + l.valor, 0), total_pagaveis: fut.pagaveis.reduce((s, l) => s + l.valor, 0), qtd_qb: fut.recebiveis.length + fut.pagaveis.length, qtd_atlantyx: despFuturas.length + simFuturos.length, qb_erro: fut.erro, ate: ultimaData },
    saldo_projetado_final: futuroComSaldo.length ? futuroComSaldo[futuroComSaldo.length - 1].saldo_acumulado : (extrato.saldo_final || 0),
    menor_saldo_projetado: menorSaldo ? { valor: menorSaldo.saldo_acumulado, data: menorSaldo.data, descricao: menorSaldo.descricao } : null,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. CRUD lançamentos simulados
// ═══════════════════════════════════════════════════════════════════════════

async function simSave({ id, data, descricao, categoria, tipo, valor, tags } = {}) {
  if (!data || !descricao || !tipo || valor == null) {
    throw new Error('data, descricao, tipo e valor obrigatórios');
  }
  if (!['entrada', 'saida'].includes(tipo)) throw new Error('tipo deve ser entrada ou saida');
  const sql = await getSql();
  const sid = id || `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`INSERT INTO lancamentos_simulados (id, data, descricao, categoria, tipo, valor, tags, atualizado_em)
    VALUES (${sid}, ${data}, ${descricao}, ${categoria || null}, ${tipo}, ${valor},
            ${tags ? JSON.stringify(tags) : null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data, descricao = EXCLUDED.descricao, categoria = EXCLUDED.categoria,
      tipo = EXCLUDED.tipo, valor = EXCLUDED.valor, tags = EXCLUDED.tags, atualizado_em = NOW()`;
  return { id: sid };
}

async function simList({ data_inicio, data_fim } = {}) {
  const sql = await getSql();
  const rows = data_inicio && data_fim
    ? await sql`SELECT * FROM lancamentos_simulados WHERE excluido = false AND data >= ${data_inicio} AND data <= ${data_fim} ORDER BY data ASC`
    : await sql`SELECT * FROM lancamentos_simulados WHERE excluido = false ORDER BY data ASC`;
  return {
    simulados: rows.map(r => ({
      id: r.id,
      data: String(r.data).split('T')[0],
      descricao: r.descricao,
      categoria: r.categoria,
      tipo: r.tipo,
      valor: parseFloat(r.valor),
      tags: r.tags,
    })),
  };
}

async function simDelete({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`UPDATE lancamentos_simulados SET excluido = true, atualizado_em = NOW() WHERE id = ${id}`;
  return { id, excluido: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Lançamentos ocultos (QB transactions ignoradas no painel)
// ═══════════════════════════════════════════════════════════════════════════

async function ocultarQB({ qb_txn_id, motivo } = {}) {
  if (!qb_txn_id) throw new Error('qb_txn_id obrigatório');
  const sql = await getSql();
  await sql`INSERT INTO lancamentos_ocultos (qb_txn_id, motivo)
    VALUES (${qb_txn_id}, ${motivo || null})
    ON CONFLICT (qb_txn_id) DO UPDATE SET motivo = EXCLUDED.motivo`;
  return { qb_txn_id, ocultado: true };
}

async function desocultarQB({ qb_txn_id } = {}) {
  if (!qb_txn_id) throw new Error('qb_txn_id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM lancamentos_ocultos WHERE qb_txn_id = ${qb_txn_id}`;
  return { qb_txn_id, ocultado: false };
}

async function listOcultos() {
  const sql = await getSql();
  const rows = await sql`SELECT * FROM lancamentos_ocultos ORDER BY criado_em DESC`;
  return { ocultos: rows };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. CRUD despesas programadas + ocorrências
// ═══════════════════════════════════════════════════════════════════════════

async function despSave(p = {}) {
  if (!p.descricao || p.valor == null || !p.recorrencia || !p.data_inicio) {
    throw new Error('descricao, valor, recorrencia e data_inicio obrigatórios');
  }
  if (!['unica', 'mensal', 'trimestral', 'anual'].includes(p.recorrencia)) {
    throw new Error('recorrencia deve ser unica|mensal|trimestral|anual');
  }
  const sql = await getSql();
  const id = p.id || `desp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`INSERT INTO despesas_programadas
    (id, descricao, categoria, valor, recorrencia, dia_vencimento, data_inicio, data_fim,
     ativa, fornecedor, conta_pagamento, observacoes, atualizado_em)
    VALUES (${id}, ${p.descricao}, ${p.categoria || null}, ${p.valor}, ${p.recorrencia},
            ${p.dia_vencimento || null}, ${p.data_inicio}, ${p.data_fim || null},
            ${p.ativa !== false}, ${p.fornecedor || null}, ${p.conta_pagamento || null},
            ${p.observacoes || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      descricao = EXCLUDED.descricao, categoria = EXCLUDED.categoria, valor = EXCLUDED.valor,
      recorrencia = EXCLUDED.recorrencia, dia_vencimento = EXCLUDED.dia_vencimento,
      data_inicio = EXCLUDED.data_inicio, data_fim = EXCLUDED.data_fim,
      ativa = EXCLUDED.ativa, fornecedor = EXCLUDED.fornecedor,
      conta_pagamento = EXCLUDED.conta_pagamento, observacoes = EXCLUDED.observacoes,
      atualizado_em = NOW()`;

  // Regenerar ocorrências futuras
  await regerarOcorrencias(sql, id);
  return { id };
}

async function despList({ ativa } = {}) {
  const sql = await getSql();
  const rows = ativa === undefined
    ? await sql`SELECT * FROM despesas_programadas ORDER BY data_inicio DESC`
    : await sql`SELECT * FROM despesas_programadas WHERE ativa = ${!!ativa} ORDER BY data_inicio DESC`;
  return {
    despesas: rows.map(r => ({
      ...r,
      valor: parseFloat(r.valor),
      data_inicio: String(r.data_inicio).split('T')[0],
      data_fim: r.data_fim ? String(r.data_fim).split('T')[0] : null,
    })),
  };
}

async function despDelete({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM despesas_programadas WHERE id = ${id}`;
  // cascade limpa as ocorrências
  return { id, deletada: true };
}

async function despOcorrencias({ data_inicio, data_fim, status, incluir_qb = true } = {}) {
  const sql = await getSql();
  const ini = data_inicio || new Date().toISOString().split('T')[0];
  const fim = data_fim || new Date(Date.now() + 365 * 86400 * 1000).toISOString().split('T')[0];
  // v1.15: contas a pagar do QuickBooks (Bills) no período entram na agenda como ocorrências fonte 'quickbooks'
  let qbBills = [], qbErro = null;
  if (incluir_qb && qbConfigurado()) {
    try {
      const token = await qbToken();
      const iniQ = data_inicio || new Date(Date.now() - 90 * 86400 * 1000).toISOString().split('T')[0]; // inclui vencidas recentes
      const data = await qbQuery(`select * from Bill where DueDate >= '${iniQ}' and DueDate <= '${fim}' maxresults 500`, token);
      qbBills = (data?.QueryResponse?.Bill || []).map(b => ({ id: 'qb_' + b.Id, despesa_id: null, descricao: (b.VendorRef?.name || 'Fornecedor') + (b.DocNumber ? ' · ' + b.DocNumber : ''), categoria: 'QuickBooks · Conta a pagar', data_prevista: b.DueDate || b.TxnDate, valor: parseFloat(b.Balance ?? b.TotalAmt ?? 0), valor_total: parseFloat(b.TotalAmt || 0), status: parseFloat(b.Balance ?? 0) > 0 ? 'prevista' : 'paga', data_pagamento: null, fonte: 'quickbooks', moeda: b.CurrencyRef?.value || null }));
    } catch (e) { qbErro = e.message; console.warn('[Agenda] Bills QB:', e.message); }
  }
  const rows = status
    ? await sql`SELECT o.*, d.descricao AS despesa_desc, d.categoria AS despesa_cat
                FROM despesas_ocorrencias o
                LEFT JOIN despesas_programadas d ON d.id = o.despesa_id
                WHERE o.data_prevista >= ${ini} AND o.data_prevista <= ${fim} AND o.status = ${status}
                ORDER BY o.data_prevista ASC`
    : await sql`SELECT o.*, d.descricao AS despesa_desc, d.categoria AS despesa_cat
                FROM despesas_ocorrencias o
                LEFT JOIN despesas_programadas d ON d.id = o.despesa_id
                WHERE o.data_prevista >= ${ini} AND o.data_prevista <= ${fim}
                ORDER BY o.data_prevista ASC`;
  const locais = rows.map(r => ({
      id: r.id,
      despesa_id: r.despesa_id,
      descricao: r.despesa_desc,
      categoria: r.despesa_cat,
      data_prevista: String(r.data_prevista).split('T')[0],
      valor: parseFloat(r.valor),
      status: r.status,
      data_pagamento: r.data_pagamento ? String(r.data_pagamento).split('T')[0] : null,
      fonte: 'atlantyx',
    }));
  const filtQb = status ? qbBills.filter(b => b.status === status) : qbBills;
  return { ocorrencias: locais.concat(filtQb).sort((a, b) => String(a.data_prevista).localeCompare(String(b.data_prevista))), qb_bills: qbBills.length, qb_erro: qbErro };
}

async function despMarcarPaga({ id, data_pagamento, qb_txn_id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`UPDATE despesas_ocorrencias
    SET status = 'paga', data_pagamento = ${data_pagamento || new Date().toISOString().split('T')[0]},
        qb_txn_id = ${qb_txn_id || null}
    WHERE id = ${id}`;
  return { id, paga: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.20.6: LANÇAR DESPESA NO QUICKBOOKS (Contas a Pagar / Bill)
// Atenção com despesas PROGRAMADAS (recorrentes): cada OCORRÊNCIA tem sua
// própria linha e seu próprio qb_txn_id — lançar a ocorrência de agosto não
// afeta a de setembro, e relançar a mesma ocorrência não duplica (idempotente).
// ═══════════════════════════════════════════════════════════════════════════
// v1.20.8: listar fornecedores do QuickBooks (p/ combo no cadastro de despesas)
async function qbFornecedoresList() {
  if (!qbConfigurado()) return { fornecedores: [], erro: 'QuickBooks não conectado' };
  try {
    const token = await qbToken();
    const data = await qbQuery(`select * from Vendor where Active = true orderby DisplayName maxresults 1000`, token);
    const fornecedores = (data?.QueryResponse?.Vendor || []).map(v => ({ id: v.Id, nome: v.DisplayName }));
    return { fornecedores };
  } catch (e) { return { fornecedores: [], erro: e.message }; }
}
async function qbBuscarFornecedor(nome, token, realm, sandbox) {
  if (!nome) return null;
  const alvo = String(nome).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  if (!alvo) return null;
  const data = await qbQuery(`select * from Vendor where Active = true maxresults 1000`, token);
  const fornecedores = data?.QueryResponse?.Vendor || [];
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  let achou = fornecedores.find(v => norm(v.DisplayName) === alvo);
  if (!achou) achou = fornecedores.find(v => { const n = norm(v.DisplayName); return n && (n.includes(alvo) || alvo.includes(n)); });
  return achou ? { id: achou.Id, nome: achou.DisplayName } : null;
}
async function qbContaDespesaPadrao(token, realm, sandbox, categoria) {
  const sql = await getSql();
  const chave = 'qb:conta_despesa_padrao';
  try { const cache = await sql`SELECT value FROM kv_store WHERE key = ${chave} LIMIT 1`; if (cache.length && cache[0].value) { const v = typeof cache[0].value === 'string' ? JSON.parse(cache[0].value) : cache[0].value; if (v?.id) return v; } } catch (_) {}
  const nomeEnv = process.env.QB_DEFAULT_EXPENSE_ACCOUNT_NAME;
  let conta = null;
  if (categoria) { const data = await qbQuery(`select * from Account where AccountType = 'Expense' and Name like '%${String(categoria).replace(/'/g, "\'")}%' maxresults 1`, token); conta = (data?.QueryResponse?.Account || [])[0]; }
  if (!conta && nomeEnv) { const data = await qbQuery(`select * from Account where Name = '${nomeEnv.replace(/'/g, "\'")}' maxresults 1`, token); conta = (data?.QueryResponse?.Account || [])[0]; }
  if (!conta) { const data = await qbQuery(`select * from Account where AccountType = 'Expense' maxresults 1`, token); conta = (data?.QueryResponse?.Account || [])[0]; }
  if (!conta) throw new Error('Nenhuma conta de despesa encontrada no QuickBooks. Cadastre uma conta (ex.: "Despesas Operacionais") ou defina QB_DEFAULT_EXPENSE_ACCOUNT_NAME.');
  const out = { id: conta.Id, nome: conta.Name };
  if (!categoria) { try { await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${chave}, ${JSON.stringify(out)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; } catch (_) {} }
  return out;
}
async function qbCriarBill({ vendorId, accountId, valor, descricao, dataVencimento }, token, realm, sandbox) {
  const base = sandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com';
  const body = {
    VendorRef: { value: String(vendorId) },
    TxnDate: new Date().toISOString().substring(0, 10),
    ...(dataVencimento ? { DueDate: dataVencimento } : {}),
    PrivateNote: descricao,
    Line: [{ Amount: parseFloat(valor), DetailType: 'AccountBasedExpenseLineDetail', Description: descricao, AccountBasedExpenseLineDetail: { AccountRef: { value: String(accountId) } } }],
  };
  const r = await fetch(`${base}/v3/company/${realm}/bill?minorversion=65`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('QB Bill [' + r.status + ']: ' + (d.Fault?.Error?.[0]?.Message || JSON.stringify(d).substring(0, 200)));
  return d.Bill;
}
async function despLancarQb({ ocorrencia_id } = {}) {
  if (!ocorrencia_id) throw new Error('ocorrencia_id obrigatório');
  const sql = await getSql();
  const rows = await sql`SELECT o.*, d.descricao AS desp_desc, d.categoria AS desp_cat, d.fornecedor AS desp_fornecedor
    FROM despesas_ocorrencias o LEFT JOIN despesas_programadas d ON d.id = o.despesa_id WHERE o.id = ${ocorrencia_id} LIMIT 1`;
  if (!rows.length) throw new Error('Ocorrência não encontrada');
  const o = rows[0];
  // v1.20.6: idempotente — se essa OCORRÊNCIA específica já tem qb_txn_id, não lança de novo
  // (cada mês de uma despesa recorrente é uma ocorrência própria, então isso nunca bloqueia o próximo mês)
  if (o.qb_txn_id) return { ja_lancado: true, qb_txn_id: o.qb_txn_id };
  if (!o.desp_fornecedor) throw new Error('Esta despesa não tem "Fornecedor" cadastrado — edite a despesa programada e informe o fornecedor (precisa bater com o nome no QuickBooks) antes de lançar.');
  const token = await qbToken();
  const realm = qbRealmId();
  const sandbox = process.env.QB_SANDBOX === 'true';
  const fornecedor = await qbBuscarFornecedor(o.desp_fornecedor, token, realm, sandbox);
  if (!fornecedor) throw new Error(`Fornecedor "${o.desp_fornecedor}" não encontrado no QuickBooks — cadastre-o lá primeiro e tente de novo.`);
  const conta = await qbContaDespesaPadrao(token, realm, sandbox, o.desp_cat);
  const descricao = `${o.desp_desc || 'Despesa'} — ${String(o.data_prevista).split('T')[0]}${o.desp_cat ? ' · ' + o.desp_cat : ''}`;
  const bill = await qbCriarBill({ vendorId: fornecedor.id, accountId: conta.id, valor: o.valor, descricao, dataVencimento: String(o.data_prevista).split('T')[0] }, token, realm, sandbox);
  await sql`UPDATE despesas_ocorrencias SET qb_txn_id = ${bill.Id}, status = CASE WHEN status = 'prevista' THEN 'lancada' ELSE status END WHERE id = ${ocorrencia_id}`;
  console.log(`[Financeiro] Despesa lançada no QB: ocorrencia=${ocorrencia_id} fornecedor=${fornecedor.nome} valor=${o.valor} bill=${bill.Id}`);
  return { lancado: true, qb_bill_id: bill.Id, fornecedor: fornecedor.nome, valor: parseFloat(o.valor) };
}

async function despGerarOcorrencias({ meses = 12 } = {}) {
  const sql = await getSql();
  const desp = await sql`SELECT * FROM despesas_programadas WHERE ativa = true`;
  let geradas = 0;
  for (const d of desp) {
    geradas += await regerarOcorrencias(sql, d.id, meses);
  }
  return { despesas: desp.length, ocorrencias_geradas: geradas };
}

// Helper: regerar ocorrências futuras (não-pagas) de uma despesa
async function regerarOcorrencias(sql, despesaId, meses = 12) {
  const r = await sql`SELECT * FROM despesas_programadas WHERE id = ${despesaId}`;
  const d = r[0];
  if (!d || !d.ativa) return 0;

  // Apaga ocorrências futuras ainda previstas
  const hoje = new Date().toISOString().split('T')[0];
  // v1.21.1 FIX: apagar também as 'lancada' (não pagas) — antes só 'prevista' era removida,
  // então editar uma despesa recorrente deixava ocorrências antigas duplicadas no calendário.
  // As 'paga' são preservadas (histórico real não se mexe).
  await sql`DELETE FROM despesas_ocorrencias
    WHERE despesa_id = ${despesaId} AND status IN ('prevista', 'lancada') AND data_prevista >= ${hoje}`;

  const datas = gerarDatasRecorrencia(d, meses);
  let count = 0;
  for (const data of datas) {
    const ocoId = `oco_${despesaId}_${data}`;
    await sql`INSERT INTO despesas_ocorrencias (id, despesa_id, data_prevista, valor, status)
      VALUES (${ocoId}, ${despesaId}, ${data}, ${d.valor}, 'prevista')
      ON CONFLICT (id) DO NOTHING`;
    count++;
  }
  return count;
}

function gerarDatasRecorrencia(d, meses) {
  const datas = [];
  const inicio = new Date(d.data_inicio);
  const fim = d.data_fim ? new Date(d.data_fim) : null;
  const limite = new Date();
  limite.setMonth(limite.getMonth() + meses);
  const fimEfetivo = fim && fim < limite ? fim : limite;

  if (d.recorrencia === 'unica') {
    if (inicio <= fimEfetivo) datas.push(inicio.toISOString().split('T')[0]);
    return datas;
  }

  const incrementoMeses = { mensal: 1, trimestral: 3, anual: 12 }[d.recorrencia] || 1;
  const cursor = new Date(inicio);
  while (cursor <= fimEfetivo) {
    const dia = d.dia_vencimento || inicio.getDate();
    const data = new Date(cursor.getFullYear(), cursor.getMonth(), dia);
    if (data >= inicio && data <= fimEfetivo) {
      datas.push(data.toISOString().split('T')[0]);
    }
    cursor.setMonth(cursor.getMonth() + incrementoMeses);
  }
  return datas;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Saldos iniciais (snapshot)
// ═══════════════════════════════════════════════════════════════════════════

async function saldoInicialSave({ data_ref, valor, descricao } = {}) {
  if (!data_ref || valor == null) throw new Error('data_ref e valor obrigatórios');
  const sql = await getSql();
  await sql`INSERT INTO saldos_iniciais (data_ref, valor, descricao, atualizado_em)
    VALUES (${data_ref}, ${valor}, ${descricao || null}, NOW())
    ON CONFLICT (data_ref) DO UPDATE SET valor = EXCLUDED.valor,
      descricao = EXCLUDED.descricao, atualizado_em = NOW()`;
  return { data_ref, valor };
}

async function saldoInicialGet({ data_ref } = {}) {
  const sql = await getSql();
  if (data_ref) {
    const rows = await sql`SELECT * FROM saldos_iniciais WHERE data_ref <= ${data_ref}
      ORDER BY data_ref DESC LIMIT 1`;
    if (!rows[0]) return { saldo: 0, data_ref: null };
    return {
      saldo: parseFloat(rows[0].valor),
      data_ref: String(rows[0].data_ref).split('T')[0],
      descricao: rows[0].descricao,
    };
  }
  const rows = await sql`SELECT * FROM saldos_iniciais ORDER BY data_ref DESC LIMIT 50`;
  return { historico: rows.map(r => ({ ...r, valor: parseFloat(r.valor), data_ref: String(r.data_ref).split('T')[0] })) };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Motor de fluxo de caixa futuro mês a mês
// ═══════════════════════════════════════════════════════════════════════════

async function fluxoFuturo({ meses = 12, overrides = {} } = {}) {
  const sql = await getSql();
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  // 1. Lista de meses no horizonte
  const listaMeses = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    listaMeses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // 2. Saldo inicial = saldo atual de caixa (QB ou saldo inicial mais recente)
  // v1.39: guarda a COMPOSIÇÃO do saldo — conta a conta — para a tela poder explicar
  // de onde vem o número (principalmente quando ele é negativo).
  let saldoAtual = 0;
  let origemSaldo = { fonte: 'nenhuma', contas: [], negativas: [], observacao: null };
  if (qbConfigurado()) {
    try {
      const { saldo_total, contas } = await qbSaldoContas();
      saldoAtual = saldo_total;
      origemSaldo = {
        fonte: 'quickbooks',
        contas: (contas || []).map(c => ({ nome: c.nome, tipo: c.tipo, saldo: round(c.saldo) })),
        negativas: (contas || []).filter(c => c.saldo < 0).map(c => ({ nome: c.nome, tipo: c.tipo, saldo: round(c.saldo) })),
        observacao: null,
      };
      if (origemSaldo.negativas.length) {
        origemSaldo.observacao = `${origemSaldo.negativas.length} conta(s) com saldo negativo no QuickBooks puxam o total para baixo. Conta corrente negativa = cheque especial usado; se for cartão de crédito classificado como "Bank", o saldo devedor entra como negativo.`;
      }
    } catch (e) { origemSaldo.observacao = 'Falha ao ler contas do QuickBooks: ' + e.message; }
  }
  if (saldoAtual === 0) {
    try {
      const { saldo, data_ref } = await saldoInicialGet({ data_ref: hoje.toISOString().split('T')[0] });
      saldoAtual = saldo;
      origemSaldo = { fonte: 'saldo_inicial_manual', contas: [], negativas: [],
        observacao: `Saldo informado manualmente em Saldos Iniciais${data_ref ? ' (referência: ' + data_ref + ')' : ''} — o QuickBooks não retornou saldo bancário.` };
    } catch {}
  }

  // 3. Despesas programadas (ocorrências previstas no horizonte)
  let ocorrencias = [];
  try {
    const fimHorizonte = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 0).toISOString().split('T')[0];
    // v1.37 FIX: as despesas começavam em HOJE, mas as entradas do mês corrente vinham do mês
    // inteiro — mistura que fazia o primeiro mês parecer muito melhor do que é. Agora ambos
    // partem do dia 1 do mês corrente; o que já foi pago tem status 'paga' e é excluído abaixo.
    const inicioMesCorrente = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    const r = await despOcorrencias({ data_inicio: inicioMesCorrente, data_fim: fimHorizonte });
    // v1.21.1 FIX: incluir 'lancada' — despesa lançada no QuickBooks continua a PAGAR, então
    // precisa entrar na projeção de saídas. Antes só 'prevista' entrava e o fluxo futuro ficava
    // otimista demais (mostrava saldo maior do que a realidade).
    ocorrencias = r.ocorrencias.filter(o => o.status === 'prevista' || o.status === 'lancada');
  } catch {}

  // 4. A Receber QB (alimenta entradas dos próximos meses)
  // v1.37 FIX: três problemas corrigidos aqui —
  //  (a) faturas VENCIDAS caíam em meses fora do horizonte e sumiam do fluxo sem aviso;
  //  (b) fatura vencida no mês corrente era contada como se fosse entrar ainda este mês;
  //  (c) faturas com vencimento além dos 12 meses inflavam buckets inexistentes.
  // Agora: vencidas viram uma linha própria (o dinheiro está atrasado, não é projeção),
  // e o que passa do horizonte é somado no último mês, com aviso.
  let aReceberPorMes = {};
  let aReceberVencido = 0, aReceberForaHorizonte = 0;
  const ultimoMes = listaMeses[listaMeses.length - 1];
  if (qbConfigurado()) {
    try {
      const token = await qbToken();
      const data = await qbQuery(`select * from Invoice where Balance > '0' maxresults 1000`, token);
      const invoices = data?.QueryResponse?.Invoice || [];
      for (const inv of invoices) {
        const venc = inv.DueDate || inv.TxnDate;
        const mes = (venc || '').substring(0, 7);
        const valor = parseFloat(inv.Balance || 0);
        if (!mes || !valor) continue;
        if (mes < mesAtual) { aReceberVencido += valor; continue; }      // já venceu: atrasado, não é projeção
        if (mes > ultimoMes) { aReceberForaHorizonte += valor; continue; } // além do horizonte
        aReceberPorMes[mes] = (aReceberPorMes[mes] || 0) + valor;
      }
    } catch {}
  }

  // 4b. v1.38: realizado do mês corrente (extrato de caixa do dia 1 até hoje)
  // Necessário porque a projeção do mês atual precisa somar o que JÁ aconteceu com o que falta.
  let realizadoMesCorrente = { entradas: 0, saidas: 0 };
  try {
    const ini = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    const ext = await extratoConsolidado({ data_inicio: ini, data_fim: hoje.toISOString().split('T')[0], incluir_simulados: false });
    realizadoMesCorrente = { entradas: ext.total_entradas || 0, saidas: ext.total_saidas || 0 };
  } catch (e) { console.warn('[fluxoFuturo] realizado do mês:', e.message); }

  // 5. Simulados futuros
  let simulados = [];
  try {
    const fimHor = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 0).toISOString().split('T')[0];
    const r = await simList({ data_inicio: hoje.toISOString().split('T')[0], data_fim: fimHor });
    simulados = r.simulados;
  } catch {}

  // 6. Construir matriz
  const linhas = {
    'Saldo Inicial': {},
    '+ A Receber QB': {},
    '+ Receita Recorrente (MRR)': {},
    '+ Outras Entradas Simuladas': {},
    '= Total Entradas': {},
    '− Despesas Programadas': {},
    '− Outras Saídas Simuladas': {},
    '= Total Saídas': {},
    '= Resultado do Mês': {},
    '= Saldo Final': {},
  };

  let saldoCorrente = saldoAtual;
  for (const mes of listaMeses) {
    // Override prioritário
    const ovM = overrides[mes] || {};

    // v1.38: no MÊS CORRENTE, entradas = já realizado no mês + o que ainda está a receber.
    // Antes só entrava o "a receber", ignorando tudo que já foi recebido no mês — o que fazia
    // o mês atual parecer muito pior do que é.
    const realizadoMes = (mes === mesAtual) ? (realizadoMesCorrente.entradas || 0) : 0;
    const aReceberM = ovM['+ A Receber QB'] ?? ((aReceberPorMes[mes] || 0) + realizadoMes);
    const mrrM = ovM['+ Receita Recorrente (MRR)'] ?? (overrides._mrr || 0);

    const entradasSim = simulados.filter(s => s.data.startsWith(mes) && s.tipo === 'entrada')
      .reduce((s, x) => s + x.valor, 0);
    const outrasEntradas = ovM['+ Outras Entradas Simuladas'] ?? entradasSim;

    // v1.38: no mês corrente, saídas = despesas já pagas no mês + programadas não pagas.
    // 'ocorrencias' já traz só as NÃO pagas (prevista/lancada) do dia 1 em diante.
    const despM = ocorrencias.filter(o => o.data_prevista.startsWith(mes))
      .reduce((s, x) => s + x.valor, 0);
    const pagoNoMes = (mes === mesAtual) ? (realizadoMesCorrente.saidas || 0) : 0;
    const despesasMes = ovM['− Despesas Programadas'] ?? (despM + pagoNoMes);

    const saidasSim = simulados.filter(s => s.data.startsWith(mes) && s.tipo === 'saida')
      .reduce((s, x) => s + x.valor, 0);
    const outrasSaidas = ovM['− Outras Saídas Simuladas'] ?? saidasSim;

    const totEnt = aReceberM + mrrM + outrasEntradas;
    const totSai = despesasMes + outrasSaidas;
    const resultado = totEnt - totSai;
    const saldoFinal = saldoCorrente + resultado;

    linhas['Saldo Inicial'][mes] = round(saldoCorrente);
    linhas['+ A Receber QB'][mes] = round(aReceberM);
    linhas['+ Receita Recorrente (MRR)'][mes] = round(mrrM);
    linhas['+ Outras Entradas Simuladas'][mes] = round(outrasEntradas);
    linhas['= Total Entradas'][mes] = round(totEnt);
    linhas['− Despesas Programadas'][mes] = round(despesasMes);
    linhas['− Outras Saídas Simuladas'][mes] = round(outrasSaidas);
    linhas['= Total Saídas'][mes] = round(totSai);
    linhas['= Resultado do Mês'][mes] = round(resultado);
    linhas['= Saldo Final'][mes] = round(saldoFinal);

    saldoCorrente = saldoFinal;
  }

  // 7. Alertas
  const alertas = [];
  // v1.37: avisos sobre o que NÃO entrou na projeção (antes sumia silenciosamente)
  if (saldoAtual < 0) alertas.push({ tipo: 'critico',
    mensagem: `O saldo de PARTIDA já é negativo (${saldoAtual.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}) — toda a projeção parte daí.` +
      (origemSaldo.negativas?.length ? ` Contas negativas no QuickBooks: ${origemSaldo.negativas.map(c => c.nome + ' (' + c.saldo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) + ')').join(', ')}.` : '') });
  if (aReceberVencido > 0) alertas.push({ tipo: 'vencido',
    mensagem: `R$ ${aReceberVencido.toLocaleString('pt-BR',{minimumFractionDigits:2})} em faturas JÁ VENCIDAS não entram na projeção (o vencimento passou). Cobre esses recebíveis ou renegocie a data no QuickBooks.` });
  if (aReceberForaHorizonte > 0) alertas.push({ tipo: 'fora_horizonte',
    mensagem: `R$ ${aReceberForaHorizonte.toLocaleString('pt-BR',{minimumFractionDigits:2})} a receber com vencimento além dos ${meses} meses — fora deste horizonte.` });
  const saldosFinais = listaMeses.map(m => linhas['= Saldo Final'][m]);
  const menorSaldo = Math.min(...saldosFinais);
  const indiceMenor = saldosFinais.indexOf(menorSaldo);
  if (menorSaldo < 0) {
    alertas.push({
      tipo: 'critico',
      mensagem: `Saldo negativo previsto em ${listaMeses[indiceMenor]} (R$ ${menorSaldo.toLocaleString('pt-BR')})`,
    });
  } else if (menorSaldo < saldoAtual * 0.3) {
    alertas.push({
      tipo: 'atenção',
      mensagem: `Saldo cairá para ${(menorSaldo / saldoAtual * 100).toFixed(0)}% do atual em ${listaMeses[indiceMenor]}`,
    });
  }

  return {
    meses: listaMeses,
    linhas,
    saldo_inicial_atual: round(saldoAtual),
    menor_saldo_projetado: round(menorSaldo),
    mes_menor_saldo: listaMeses[indiceMenor],
    alertas,
    fontes: {
      saldo_quickbooks: qbConfigurado(),
      ocorrencias_count: ocorrencias.length,
      simulados_count: simulados.length,
      // v1.37: transparência sobre o que ficou de fora da projeção
      a_receber_vencido: round(aReceberVencido),
      a_receber_fora_horizonte: round(aReceberForaHorizonte),
      a_receber_no_horizonte: round(Object.values(aReceberPorMes).reduce((s, v) => s + v, 0)),
      realizado_mes_corrente: { entradas: round(realizadoMesCorrente.entradas), saidas: round(realizadoMesCorrente.saidas) },
      origem_saldo_inicial: origemSaldo, // v1.39: de onde vem o saldo de partida
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. KPIs determinísticos de saúde
// ═══════════════════════════════════════════════════════════════════════════

async function kpisSaude({ overrides = {} } = {}) {
  const kpis = {
    saldo_caixa: 0,
    roi_pct: null,
    patrimonio_liquido: null,
    receita_mes: 0,
    receita_ano: 0,
    despesa_mes: 0,
    despesa_ano: 0,
    margem_liquida_pct: null,
    ebitda_mes: null,
    ebitda_margem_pct: null,
    burn_rate_mensal: null,
    runway_meses: null,
    runway_dias: null,
    liquidez_corrente: null,
    contas_receber: 0,
    contas_pagar: 0,
    working_capital: null,
    cobertura_despesas_fixas: null,
    semaforo: 'cinza',
    semaforo_motivos: [],
    fonte: qbConfigurado() ? 'QuickBooks + Neon' : 'Neon (QB não configurado)',
    timestamp: new Date().toISOString(),
  };

  if (qbConfigurado()) {
    try {
      const token = await qbToken();
      const hoje = new Date();
      const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
      const inicioAno = `${hoje.getFullYear()}-01-01`;
      const hojeStr = hoje.toISOString().split('T')[0];

      const [contas, dreM, dreA, ar, ap, bs] = await Promise.allSettled([
        qbQuery(`select * from Account where AccountType = 'Bank'`, token),
        qbFetch(`/reports/ProfitAndLoss?start_date=${inicioMes}&end_date=${hojeStr}`, token),
        qbFetch(`/reports/ProfitAndLoss?start_date=${inicioAno}&end_date=${hojeStr}`, token),
        qbFetch(`/reports/AgedReceivables?date_macro=Today`, token),
        qbFetch(`/reports/AgedPayables?date_macro=Today`, token),
        qbFetch(`/reports/BalanceSheet?date_macro=Today`, token), // v1.20.7: p/ ROI real (patrimônio líquido)
      ]);

      if (contas.status === 'fulfilled') {
        kpis.saldo_caixa = (contas.value?.QueryResponse?.Account || [])
          .filter(a => a.Active !== false)
          .reduce((s, a) => s + parseFloat(a.CurrentBalance || 0), 0);
      }

      if (dreM.status === 'fulfilled') {
        const l = extrairLinhasRelatorio(dreM.value);
        kpis.receita_mes = somaPorPadrao(l, /receita|income|revenue|total income/i);
        kpis.despesa_mes = somaPorPadrao(l, /despesa|expense|total expense/i);
        const lucro = kpis.receita_mes - kpis.despesa_mes;
        if (kpis.receita_mes > 0) {
          kpis.margem_liquida_pct = round((lucro / kpis.receita_mes) * 100);
        }
        kpis.ebitda_mes = round(lucro); // simplificação — assume sem deprec/juros separados
        if (kpis.receita_mes > 0) kpis.ebitda_margem_pct = round((lucro / kpis.receita_mes) * 100);
      }

      if (dreA.status === 'fulfilled') {
        const l = extrairLinhasRelatorio(dreA.value);
        kpis.receita_ano = somaPorPadrao(l, /receita|income|revenue|total income/i);
        kpis.despesa_ano = somaPorPadrao(l, /despesa|expense|total expense/i);
      }

      if (ar.status === 'fulfilled') {
        const l = extrairLinhasRelatorio(ar.value);
        kpis.contas_receber = l.find(x => x.tipo === 'total')?.valor || 0;
      }

      if (ap.status === 'fulfilled') {
        const l = extrairLinhasRelatorio(ap.value);
        kpis.contas_pagar = l.find(x => x.tipo === 'total')?.valor || 0;
      }

      // v1.20.7 FIX: "ROI Total" era igual à Margem Líquida (bug de exibição — a mesma variável
      // era usada nos dois cartões). Agora calcula um ROI de verdade: lucro do mês / patrimônio
      // líquido (do Balanço Patrimonial), que é uma métrica genuinamente diferente da margem.
      if (bs.status === 'fulfilled') {
        const l = extrairLinhasRelatorio(bs.value);
        kpis.patrimonio_liquido = somaPorPadrao(l, /total equity|patrim[oô]nio l[ií]quido|total patrim[oô]nio/i) || null;
        if (kpis.patrimonio_liquido && kpis.patrimonio_liquido !== 0 && kpis.ebitda_mes != null) {
          kpis.roi_pct = round((kpis.ebitda_mes / kpis.patrimonio_liquido) * 100);
        }
      }
    } catch (e) {
      console.log('[KPIs QB] erro:', e.message);
    }
  }

  // Override (caso usuário queira simular)
  Object.assign(kpis, overrides);

  // Burn rate: média de despesa dos últimos 3 meses se disponível, ou despesa_mes
  kpis.burn_rate_mensal = kpis.despesa_mes;

  // Runway
  // v1.20.7 FIX: com caixa negativo o runway ficava "—" (indefinido) sem explicação — agora
  // mostra 0 explicitamente (não há fôlego de caixa nenhum) em vez de sumir da tela.
  if (kpis.saldo_caixa <= 0 && kpis.burn_rate_mensal != null) {
    kpis.runway_meses = 0; kpis.runway_dias = 0;
  } else if (kpis.burn_rate_mensal > 0 && kpis.saldo_caixa > 0) {
    // Burn líquido = despesa - receita (se ainda perde dinheiro)
    const burnLiquido = Math.max(0, kpis.despesa_mes - kpis.receita_mes);
    if (burnLiquido > 0) {
      kpis.runway_meses = round(kpis.saldo_caixa / burnLiquido);
      kpis.runway_dias = Math.round(kpis.runway_meses * 30);
    } else {
      kpis.runway_meses = 999;
      kpis.runway_dias = 999 * 30;
    }
  }

  // Liquidez corrente (simplificada: saldo + AR vs AP)
  if (kpis.contas_pagar > 0) {
    kpis.liquidez_corrente = round((kpis.saldo_caixa + kpis.contas_receber) / kpis.contas_pagar, 2);
  }

  // Working capital
  kpis.working_capital = round(kpis.saldo_caixa + kpis.contas_receber - kpis.contas_pagar);

  // Cobertura de despesas fixas — usa ocorrências previstas no mês atual
  try {
    const sql = await getSql();
    const hoje = new Date();
    const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];
    // v1.20.7 FIX: contar 'prevista' E 'lancada' (só excluir as já pagas) — antes só somava
    // 'prevista', então despesas já lançadas no QuickBooks (status vira 'lancada') sumiam
    // deste cálculo mesmo continuando por pagar, subestimando a cobertura de despesas fixas.
    const r = await sql`SELECT COALESCE(SUM(valor), 0) AS total FROM despesas_ocorrencias
      WHERE status != 'paga' AND data_prevista >= ${inicio} AND data_prevista <= ${fim}`;
    const despFixas = parseFloat(r[0]?.total || 0);
    if (despFixas > 0) {
      kpis.cobertura_despesas_fixas = round(kpis.saldo_caixa / despFixas, 1);
    }
  } catch {}

  // Semáforo de saúde
  const motivos = [];
  let score = 0;
  if (kpis.runway_meses !== null) {
    if (kpis.runway_meses >= 12) { score += 2; motivos.push('Runway > 12 meses ✓'); }
    else if (kpis.runway_meses >= 6) { score += 1; motivos.push(`Runway de ${kpis.runway_meses} meses (ok)`); }
    else motivos.push(`Runway curto: ${kpis.runway_meses} meses ⚠`);
  }
  if (kpis.margem_liquida_pct !== null) {
    if (kpis.margem_liquida_pct >= 15) { score += 2; motivos.push(`Margem ${kpis.margem_liquida_pct}% ✓`); }
    else if (kpis.margem_liquida_pct >= 0) { score += 1; motivos.push(`Margem ${kpis.margem_liquida_pct}%`); }
    else motivos.push(`Margem negativa ${kpis.margem_liquida_pct}% ⚠`);
  }
  if (kpis.liquidez_corrente !== null) {
    if (kpis.liquidez_corrente >= 1.5) { score += 2; motivos.push(`Liquidez ${kpis.liquidez_corrente} ✓`); }
    else if (kpis.liquidez_corrente >= 1) { score += 1; motivos.push(`Liquidez ${kpis.liquidez_corrente}`); }
    else motivos.push(`Liquidez baixa ${kpis.liquidez_corrente} ⚠`);
  }

  if (score >= 5) kpis.semaforo = 'verde';
  else if (score >= 3) kpis.semaforo = 'amarelo';
  else if (score > 0) kpis.semaforo = 'vermelho';
  kpis.semaforo_motivos = motivos;

  return { kpis };
}

function somaPorPadrao(linhas, padrao) {
  // Procura primeiro o total que casa o padrão; se não, soma das linhas
  const total = linhas.find(l => l.tipo === 'total' && padrao.test(l.label));
  if (total) return total.valor;
  return linhas.filter(l => l.tipo === 'linha' && padrao.test(l.label))
    .reduce((s, l) => s + l.valor, 0);
}

function round(n, casas = 2) {
  const mult = Math.pow(10, casas);
  return Math.round(n * mult) / mult;
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. CONCILIAÇÃO BANCÁRIA
// ═══════════════════════════════════════════════════════════════════════════
//
// Estratégia: para cada lançamento REAL (QB ou simulado) no período, procurar
// uma referência compatível em (a) despesas programadas pendentes, (b) AR do QB.
// Score baseado em valor (peso 0.6) + data (peso 0.3) + descrição similar (0.1).
// Lançamentos já aprovados não voltam à lista. Status: sugestao | aprovada | rejeitada.

async function conciliacaoSugestoes({ data_inicio, data_fim, score_min = 0.55 } = {}) {
  const sql = await getSql();
  const hoje = new Date().toISOString().split('T')[0];
  const ini = data_inicio || new Date(Date.now() - 60 * 86400 * 1000).toISOString().split('T')[0];
  const fim = data_fim || hoje;

  // 1. Buscar lançamentos REAIS (QB + simulados − ocultos) no período
  const ext = await extratoConsolidado({ data_inicio: ini, data_fim: fim });
  const reais = ext.lancamentos || [];

  // 2. Já tem conciliação aprovada/rejeitada para algum deles?
  let realIds = reais.map(r => r.id);
  const jaProcessados = realIds.length
    ? await sql`SELECT real_id, status FROM conciliacoes WHERE real_id = ANY(${realIds})`
    : [];
  const mapaProcessados = new Map(jaProcessados.map(c => [c.real_id, c.status]));

  // 3. Buscar referências candidatas: despesas programadas pendentes + AR QB
  const ocorPrev = await sql`SELECT o.*, d.descricao AS desc_d, d.categoria AS cat_d, d.fornecedor
    FROM despesas_ocorrencias o
    LEFT JOIN despesas_programadas d ON d.id = o.despesa_id
    -- v1.20.9 FIX: 'atrasada' nunca é gravado em lugar nenhum (morto); faltava 'lancada'
    -- (desde v1.20.6, despesa lançada no QB vira 'lancada' e sumia do pool de conciliação)
    WHERE o.status IN ('prevista', 'lancada')
      AND o.data_prevista BETWEEN ${new Date(new Date(ini).getTime() - 30*86400*1000).toISOString().split('T')[0]} AND ${new Date(new Date(fim).getTime() + 30*86400*1000).toISOString().split('T')[0]}`;

  const arQB = [];
  if (qbConfigurado()) {
    try {
      const token = await qbToken();
      const data = await qbQuery(`select * from Invoice where Balance > '0'`, token);
      const invs = data?.QueryResponse?.Invoice || [];
      for (const inv of invs) {
        arQB.push({
          id: 'inv_' + inv.Id,
          tipo: 'invoice',
          data: inv.DueDate || inv.TxnDate,
          valor: parseFloat(inv.Balance || 0),
          descricao: (inv.CustomerRef?.name || 'Invoice ') + ' #' + (inv.DocNumber || inv.Id),
        });
      }
    } catch {}
  }

  // 4. Para cada REAL não-processado, gerar sugestões
  const sugestoes = [];
  for (const r of reais) {
    if (mapaProcessados.has(r.id)) continue;

    const candidatos = [];

    // Despesas saídas → match com ocorPrev (saídas)
    if (r.tipo === 'saida') {
      for (const o of ocorPrev) {
        const oV = parseFloat(o.valor);
        const score = calcScore(r.valor, oV, r.data, String(o.data_prevista).split('T')[0],
                                r.descricao, (o.desc_d || '') + ' ' + (o.fornecedor || ''));
        if (score >= score_min) {
          candidatos.push({
            ref_id: o.id,
            ref_tipo: 'despesa_ocorrencia',
            ref_data: String(o.data_prevista).split('T')[0],
            ref_valor: oV,
            ref_descricao: o.desc_d + (o.fornecedor ? ` (${o.fornecedor})` : ''),
            score,
          });
        }
      }
    }
    // Entradas → match com AR QB
    if (r.tipo === 'entrada') {
      for (const ar of arQB) {
        const score = calcScore(r.valor, ar.valor, r.data, ar.data, r.descricao, ar.descricao);
        if (score >= score_min) {
          candidatos.push({
            ref_id: ar.id,
            ref_tipo: 'invoice_qb',
            ref_data: ar.data,
            ref_valor: ar.valor,
            ref_descricao: ar.descricao,
            score,
          });
        }
      }
    }

    candidatos.sort((a, b) => b.score - a.score);
    if (candidatos.length) {
      const best = candidatos[0];
      sugestoes.push({
        real_id: r.id,
        real_data: r.data,
        real_descricao: r.descricao,
        real_valor: r.valor,
        real_origem: r.origem,
        real_categoria: r.categoria,
        real_tipo: r.tipo,
        sugestao: best,
        outras_opcoes: candidatos.slice(1, 4),
      });
    } else {
      sugestoes.push({
        real_id: r.id,
        real_data: r.data,
        real_descricao: r.descricao,
        real_valor: r.valor,
        real_origem: r.origem,
        real_categoria: r.categoria,
        real_tipo: r.tipo,
        sugestao: null,
        outras_opcoes: [],
      });
    }
  }

  // 5. Stats
  const totalReais = reais.length;
  const jaConciliados = jaProcessados.filter(c => c.status === 'aprovada').length;
  const comSugestao = sugestoes.filter(s => s.sugestao).length;
  const semSugestao = sugestoes.filter(s => !s.sugestao).length;
  const taxaConciliacao = totalReais > 0
    ? Math.round((jaConciliados / totalReais) * 100)
    : 0;

  return {
    periodo: { data_inicio: ini, data_fim: fim },
    total_reais: totalReais,
    fontes: { qb: reais.filter(r => (r.origem||r.fonte||'').toString().toLowerCase().includes('q')).length, simulados: reais.filter(r => (r.origem||r.fonte||'').toString().toLowerCase().includes('sim')).length, qb_erro: ext.qb_erro || null },
    ja_conciliados: jaConciliados,
    sugestoes_pendentes: comSugestao,
    sem_sugestao: semSugestao,
    taxa_conciliacao_pct: taxaConciliacao,
    sugestoes,
  };
}

function calcScore(realValor, refValor, realData, refData, realDesc, refDesc) {
  // valor: até 5% diferença = 1, depois cai linearmente
  const difPct = Math.abs(realValor - refValor) / Math.max(Math.abs(realValor), Math.abs(refValor), 0.01);
  const scoreValor = difPct <= 0.05 ? 1 : difPct <= 0.20 ? 0.5 : difPct <= 0.50 ? 0.2 : 0;

  // data: até 3 dias = 1, até 7 = 0.7, até 15 = 0.3, depois 0
  const dDias = Math.abs((new Date(realData) - new Date(refData)) / 86400000);
  const scoreData = dDias <= 3 ? 1 : dDias <= 7 ? 0.7 : dDias <= 15 ? 0.3 : 0;

  // descrição: similaridade simples (palavras em comum)
  const tokens = s => String(s || '').toLowerCase()
    .replace(/[^\wàáâãéèêíìîóòôõúùûç ]/gi, '')
    .split(/\s+/).filter(w => w.length > 3);
  const a = new Set(tokens(realDesc));
  const b = new Set(tokens(refDesc));
  const inter = [...a].filter(x => b.has(x)).length;
  const scoreDesc = a.size > 0 && b.size > 0 ? inter / Math.max(a.size, b.size) : 0;

  return Math.round((scoreValor * 0.6 + scoreData * 0.3 + scoreDesc * 0.1) * 100) / 100;
}

async function conciliacaoAprovar({ real_id, ref_id, ref_tipo, sugestao } = {}) {
  if (!real_id) throw new Error('real_id obrigatório');
  const sql = await getSql();
  const id = 'conc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const s = sugestao || {};
  await sql`INSERT INTO conciliacoes
    (id, tipo, real_id, real_origem, real_data, real_valor, real_descricao,
     referencia_id, referencia_tipo, referencia_data, referencia_valor, referencia_descricao,
     diferenca_valor, score, status, aprovada_em)
    VALUES (${id}, 'manual', ${real_id}, ${s.real_origem || null},
            ${s.real_data || null}, ${s.real_valor || null}, ${s.real_descricao || null},
            ${ref_id || s.ref_id || null}, ${ref_tipo || s.ref_tipo || null},
            ${s.ref_data || null}, ${s.ref_valor || null}, ${s.ref_descricao || null},
            ${(s.real_valor || 0) - (s.ref_valor || 0)}, ${s.score || null},
            'aprovada', NOW())
    ON CONFLICT (id) DO NOTHING`;

  // Se for despesa programada, marca como paga automaticamente
  if ((ref_tipo || s.ref_tipo) === 'despesa_ocorrencia' && (ref_id || s.ref_id)) {
    await sql`UPDATE despesas_ocorrencias
      SET status='paga', data_pagamento=${s.real_data || new Date().toISOString().split('T')[0]},
          qb_txn_id=${real_id}
      WHERE id=${ref_id || s.ref_id}`;
  }
  return { id, status: 'aprovada' };
}

async function conciliacaoRejeitar({ real_id, motivo } = {}) {
  if (!real_id) throw new Error('real_id obrigatório');
  const sql = await getSql();
  const id = 'conc_rej_' + Date.now();
  await sql`INSERT INTO conciliacoes (id, tipo, real_id, status, rejeitada_em, motivo_rejeicao)
    VALUES (${id}, 'rejeicao', ${real_id}, 'rejeitada', NOW(), ${motivo || null})`;
  return { id, status: 'rejeitada' };
}

async function conciliacaoStatus({ data_inicio, data_fim } = {}) {
  const sql = await getSql();
  const ini = data_inicio || new Date(Date.now() - 60*86400*1000).toISOString().split('T')[0];
  const fim = data_fim || new Date().toISOString().split('T')[0];
  const rows = await sql`SELECT status, COUNT(*) as cnt, COALESCE(SUM(real_valor), 0) as total
    FROM conciliacoes
    WHERE criado_em >= ${ini}::date AND criado_em <= ${fim}::date + interval '1 day'
    GROUP BY status`;
  const out = { aprovadas: 0, rejeitadas: 0, total_aprovado: 0, total_rejeitado: 0 };
  for (const r of rows) {
    if (r.status === 'aprovada') {
      out.aprovadas = parseInt(r.cnt);
      out.total_aprovado = parseFloat(r.total);
    }
    if (r.status === 'rejeitada') {
      out.rejeitadas = parseInt(r.cnt);
      out.total_rejeitado = parseFloat(r.total);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. ORÇAMENTO CONSOLIDADO (QB Budget + Realizado QB + Despesas Programadas)
// ═══════════════════════════════════════════════════════════════════════════

// v1.38: interpreta o título de coluna do relatório do QuickBooks em várias línguas/formatos.
// Ex.: "2026-08", "Aug 2026", "Ago 2026", "Aug 1-31, 2026", "Agosto 2026"
function _mesDaColunaQB(titulo, anoRef, indiceColuna) {
  const t = String(titulo || '').trim();
  if (!t) return null;
  const iso = t.match(/(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const meses = { jan:1, feb:2, fev:2, mar:3, apr:4, abr:4, may:5, mai:5, jun:6, jul:7, aug:8, ago:8,
                  sep:9, set:9, oct:10, out:10, nov:11, dec:12, dez:12 };
  const norm = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [abrev, num] of Object.entries(meses)) {
    if (norm.startsWith(abrev)) {
      const anoM = t.match(/(\d{4})/);
      const ano = anoM ? anoM[1] : anoRef;
      return `${ano}-${String(num).padStart(2, '0')}`;
    }
  }
  // Último recurso: se as colunas vierem em ordem (jan..dez), usa a posição
  if (indiceColuna >= 1 && indiceColuna <= 12) return `${anoRef}-${String(indiceColuna).padStart(2, '0')}`;
  return null;
}

async function orcamentoConsolidado({ ano } = {}) {
  const anoRef = ano || new Date().getFullYear();
  const inicioAno = `${anoRef}-01-01`;
  const fimAno = `${anoRef}-12-31`;
  const hoje = new Date().toISOString().split('T')[0];

  // 1. Buscar Budget do QB
  let budget = { matriz: {}, nome: 'Sem budget cadastrado' };
  if (qbConfigurado()) {
    try {
      const r = await qbOrcamento({ ano: anoRef });
      if (r.orcamento) budget = r.orcamento;
    } catch (e) { console.log('[Orçamento]', e.message); }
  }

  // 2. Realizado QB por categoria × mês (DRE mensais)
  const realizado = {};
  if (qbConfigurado()) {
    try {
      const token = await qbToken();
      // Buscar DRE do ano todo, agrupado por mês
      const data = await qbFetch(`/reports/ProfitAndLoss?start_date=${inicioAno}&end_date=${anoRef === new Date().getFullYear() ? hoje : fimAno}&summarize_column_by=Month`, token);
      const rows = data?.Rows?.Row || [];
      const colNames = (data?.Columns?.Column || []).map(c => c.ColTitle || c.MetaData?.[0]?.Value || '');

      function walk(row, parent = '') {
        if (row.type === 'Section') {
          const header = row.Header?.ColData?.[0]?.value || parent;
          (row.Rows?.Row || []).forEach(r => walk(r, header));
        } else if (row.type === 'Data') {
          const cols = row.ColData || [];
          const cat = cols[0]?.value;
          if (!cat) return;
          if (!realizado[cat]) realizado[cat] = {};
          for (let i = 1; i < cols.length - 1; i++) {
            // v1.38 FIX: o QuickBooks devolve o título da coluna como "Aug 2026", "Ago 2026" ou
            // "Aug 1-31, 2026" — o código só aceitava "AAAA-MM", então NENHUM mês era reconhecido
            // e o realizado do orçamento ficava zerado/furado. Agora entende os três formatos.
            const mesCol = colNames[i] || '';
            const mesKey = _mesDaColunaQB(mesCol, anoRef, i);
            if (mesKey) {
              const v = parseFloat(String(cols[i].value || '0').replace(/[^\d.-]/g, '')) || 0;
              realizado[cat][mesKey] = (realizado[cat][mesKey] || 0) + v;
            }
          }
        }
      }
      rows.forEach(r => walk(r));
    } catch (e) { console.log('[Orçamento Realizado]', e.message); }
  }

  // 3. Categorias combinadas (orçado + realizado)
  const todasCategorias = new Set([
    ...Object.keys(budget.matriz || {}),
    ...Object.keys(realizado),
  ]);

  // 4. Lista de meses do ano
  const meses = [];
  for (let i = 1; i <= 12; i++) {
    meses.push(`${anoRef}-${String(i).padStart(2, '0')}`);
  }

  // 5. Construir matriz consolidada
  const matriz = [];
  for (const cat of todasCategorias) {
    const linha = { categoria: cat, total_orcado: 0, total_realizado: 0, meses: {} };
    for (const mes of meses) {
      const orcado = (budget.matriz?.[cat]?.[mes]) || 0;
      const real = realizado[cat]?.[mes] || 0;
      const diff = real - orcado;
      const utilPct = orcado > 0 ? Math.round((real / orcado) * 100) : null;
      linha.meses[mes] = {
        orcado: round(orcado),
        realizado: round(real),
        diferenca: round(diff),
        utilizacao_pct: utilPct,
      };
      linha.total_orcado += orcado;
      linha.total_realizado += real;
    }
    linha.total_orcado = round(linha.total_orcado);
    linha.total_realizado = round(linha.total_realizado);
    linha.total_diferenca = round(linha.total_realizado - linha.total_orcado);
    linha.total_util_pct = linha.total_orcado > 0
      ? Math.round((linha.total_realizado / linha.total_orcado) * 100)
      : null;
    matriz.push(linha);
  }

  // 6. Totais gerais
  const totaisMes = {};
  for (const mes of meses) {
    let orcMes = 0, realMes = 0;
    for (const l of matriz) {
      orcMes += l.meses[mes].orcado;
      realMes += l.meses[mes].realizado;
    }
    totaisMes[mes] = {
      orcado: round(orcMes),
      realizado: round(realMes),
      diferenca: round(realMes - orcMes),
      utilizacao_pct: orcMes > 0 ? Math.round((realMes / orcMes) * 100) : null,
    };
  }

  const totalGeral = matriz.reduce((acc, l) => ({
    orcado: acc.orcado + l.total_orcado,
    realizado: acc.realizado + l.total_realizado,
  }), { orcado: 0, realizado: 0 });
  totalGeral.diferenca = round(totalGeral.realizado - totalGeral.orcado);
  totalGeral.utilizacao_pct = totalGeral.orcado > 0
    ? Math.round((totalGeral.realizado / totalGeral.orcado) * 100)
    : null;

  return {
    ano: anoRef,
    budget_nome: budget.nome || 'Sem orçamento',
    qb_configurado: qbConfigurado(),
    meses,
    categorias: matriz.sort((a, b) => Math.abs(b.total_orcado) - Math.abs(a.total_orcado)),
    totais_mes: totaisMes,
    total_geral: {
      orcado: round(totalGeral.orcado),
      realizado: round(totalGeral.realizado),
      diferenca: round(totalGeral.diferenca),
      utilizacao_pct: totalGeral.utilizacao_pct,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. EXTRATO AGREGADO DIÁRIO / MENSAL
// ═══════════════════════════════════════════════════════════════════════════

async function extratoDiario({ data_inicio, data_fim } = {}) {
  const hoje = new Date().toISOString().split('T')[0];
  const ini = data_inicio || new Date(Date.now() - 30 * 86400 * 1000).toISOString().split('T')[0];
  const fim = data_fim || hoje;

  const ext = await extratoConsolidado({ data_inicio: ini, data_fim: fim });

  // Agregar por dia
  const porDia = {};
  let saldoCorrente = ext.saldo_inicial || 0;
  // Construir lista de dias do período
  const dt0 = new Date(ini + 'T00:00:00');
  const dt1 = new Date(fim + 'T00:00:00');
  for (let d = new Date(dt0); d <= dt1; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    porDia[key] = {
      data: key,
      entradas: 0,
      saidas: 0,
      resultado: 0,
      lancamentos_count: 0,
      saldo_inicio: saldoCorrente,
      saldo_fim: saldoCorrente,
    };
  }

  // Agregar
  for (const l of ext.lancamentos) {
    const dia = porDia[l.data];
    if (!dia) continue;
    if (l.tipo === 'entrada') dia.entradas += l.valor;
    else dia.saidas += l.valor;
    dia.lancamentos_count++;
  }

  // Recalcular saldos em cascata
  saldoCorrente = ext.saldo_inicial || 0;
  for (const k of Object.keys(porDia).sort()) {
    porDia[k].saldo_inicio = round(saldoCorrente);
    porDia[k].resultado = round(porDia[k].entradas - porDia[k].saidas);
    saldoCorrente += porDia[k].resultado;
    porDia[k].saldo_fim = round(saldoCorrente);
    porDia[k].entradas = round(porDia[k].entradas);
    porDia[k].saidas = round(porDia[k].saidas);
  }

  const dias = Object.values(porDia);
  const totalEntradas = dias.reduce((s, d) => s + d.entradas, 0);
  const totalSaidas = dias.reduce((s, d) => s + d.saidas, 0);

  return {
    periodo: { data_inicio: ini, data_fim: fim },
    saldo_inicial: ext.saldo_inicial,
    saldo_final: round(saldoCorrente),
    total_entradas: round(totalEntradas),
    total_saidas: round(totalSaidas),
    dias,
  };
}

async function extratoMensal({ ano } = {}) {
  const anoRef = ano || new Date().getFullYear();
  const inicio = `${anoRef}-01-01`;
  const fim = `${anoRef}-12-31`;

  const ext = await extratoConsolidado({ data_inicio: inicio, data_fim: fim });

  // Agregar por mês
  const porMes = {};
  for (let m = 1; m <= 12; m++) {
    const key = `${anoRef}-${String(m).padStart(2, '0')}`;
    porMes[key] = {
      mes: key,
      entradas: 0,
      saidas: 0,
      resultado: 0,
      lancamentos_count: 0,
      saldo_inicio: 0,
      saldo_fim: 0,
    };
  }
  for (const l of ext.lancamentos) {
    const mesKey = String(l.data).substring(0, 7);
    const m = porMes[mesKey];
    if (!m) continue;
    if (l.tipo === 'entrada') m.entradas += l.valor;
    else m.saidas += l.valor;
    m.lancamentos_count++;
  }

  // Recalcular saldos em cascata
  let saldoCorrente = ext.saldo_inicial || 0;
  for (const k of Object.keys(porMes).sort()) {
    porMes[k].saldo_inicio = round(saldoCorrente);
    porMes[k].resultado = round(porMes[k].entradas - porMes[k].saidas);
    saldoCorrente += porMes[k].resultado;
    porMes[k].saldo_fim = round(saldoCorrente);
    porMes[k].entradas = round(porMes[k].entradas);
    porMes[k].saidas = round(porMes[k].saidas);
  }

  const meses = Object.values(porMes);
  return {
    ano: anoRef,
    saldo_inicial: ext.saldo_inicial,
    saldo_final: round(saldoCorrente),
    total_entradas: round(meses.reduce((s, m) => s + m.entradas, 0)),
    total_saidas: round(meses.reduce((s, m) => s + m.saidas, 0)),
    meses,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. PROJETOS FINANCEIROS + MARCOS + KANBAN
// ═══════════════════════════════════════════════════════════════════════════

// v1.20: "Kanban Marcos de Projeto" — etapas até o Termo Pronto/Enviado.
// As etapas Aguardando Cliente, NF Emitida e Aguardando Pagamento foram
// eliminadas daqui: o rastreio de nota fiscal e pagamento passou a ser
// feito no Kanban de Faturamento (S1 · Financeiro → Kanban de Faturamento).
const KANBAN_COLUNAS = [
  'aguardando_entrega',     // marco cadastrado, prazo no futuro
  'liberacao_gp',           // 10 dias antes do prazo → aguarda GP aprovar
  'aprovado_gp',            // GP aprovou → notifica financeiro
  'elaborando_termo',       // financeiro confirmou que está fazendo o termo
  'termo_pronto',           // termo carregado, enviado pro cliente
  'concluido'
];
// etapas antigas (mantidas só para migrar dados históricos, não usadas mais)
const KANBAN_COLUNAS_LEGADO = ['aguardando_cliente', 'nf_emitida', 'aguardando_pagamento'];

const KANBAN_LABEL = {
  aguardando_entrega:    { label: 'Aguardando Entrega',   cor: '#7a7c9e' },
  liberacao_gp:          { label: 'Liberação do GP',      cor: '#f5a623' },
  aprovado_gp:           { label: 'Aprovado pelo GP',     cor: '#22d3a3' },
  elaborando_termo:      { label: 'Elaborando Termo',     cor: '#4f7cff' },
  termo_pronto:          { label: 'Termo Pronto/Enviado', cor: '#9c6dff' },
  aguardando_cliente:    { label: 'Aguardando Cliente',   cor: '#f59e0b' },
  nf_emitida:            { label: 'NF Emitida',           cor: '#06b6d4' },
  aguardando_pagamento:  { label: 'Aguardando Pagamento', cor: '#3b82f6' },
  concluido:             { label: 'Concluído',            cor: '#22d3a3' },
};

// ─── CRUD Projeto ─────────────────────────────────────────────────────────
async function projetoSave(p = {}) {
  if (!p.nome) throw new Error('nome obrigatório');
  const sql = await getSql();
  const id = p.id || `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`INSERT INTO projetos_financeiros
    (id, nome, cliente, cliente_responsavel_nome, cliente_responsavel_email,
     gerente_projeto_nome, gerente_projeto_email, financeiro_email,
     descricao, valor_total, moeda, status, atualizado_em)
    VALUES (${id}, ${p.nome}, ${p.cliente || null},
            ${p.cliente_responsavel_nome || null}, ${p.cliente_responsavel_email || null},
            ${p.gerente_projeto_nome || null}, ${p.gerente_projeto_email || null},
            ${p.financeiro_email || null}, ${p.descricao || null},
            ${p.valor_total || 0}, ${p.moeda || 'BRL'}, ${p.status || 'ativo'}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      nome=EXCLUDED.nome, cliente=EXCLUDED.cliente,
      cliente_responsavel_nome=EXCLUDED.cliente_responsavel_nome,
      cliente_responsavel_email=EXCLUDED.cliente_responsavel_email,
      gerente_projeto_nome=EXCLUDED.gerente_projeto_nome,
      gerente_projeto_email=EXCLUDED.gerente_projeto_email,
      financeiro_email=EXCLUDED.financeiro_email,
      descricao=EXCLUDED.descricao, valor_total=EXCLUDED.valor_total,
      moeda=EXCLUDED.moeda, status=EXCLUDED.status, atualizado_em=NOW()`;
  return { id };
}

async function projetoList({ status } = {}) {
  const sql = await getSql();
  const rows = status
    ? await sql`SELECT * FROM projetos_financeiros WHERE status = ${status} ORDER BY criado_em DESC`
    : await sql`SELECT * FROM projetos_financeiros ORDER BY criado_em DESC`;
  // Agregado de marcos por projeto
  const ids = rows.map(r => r.id);
  let agregados = {};
  if (ids.length) {
    const agg = await sql`SELECT projeto_id,
      COUNT(*) as total_marcos,
      COALESCE(SUM(valor), 0) as total_valor,
      COUNT(*) FILTER (WHERE status_kanban = 'concluido') as concluidos,
      COALESCE(SUM(valor) FILTER (WHERE status_kanban = 'concluido'), 0) as valor_concluido
      FROM projetos_marcos WHERE projeto_id = ANY(${ids}) GROUP BY projeto_id`;
    for (const a of agg) {
      agregados[a.projeto_id] = {
        total_marcos: parseInt(a.total_marcos),
        total_valor: parseFloat(a.total_valor),
        concluidos: parseInt(a.concluidos),
        valor_concluido: parseFloat(a.valor_concluido),
      };
    }
  }
  return {
    projetos: rows.map(r => ({
      ...r,
      valor_total: parseFloat(r.valor_total || 0),
      agregados: agregados[r.id] || { total_marcos: 0, total_valor: 0, concluidos: 0, valor_concluido: 0 },
    })),
  };
}

async function projetoGet({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const r = await sql`SELECT * FROM projetos_financeiros WHERE id = ${id}`;
  if (!r[0]) return { projeto: null };
  const marcos = await marcoList({ projeto_id: id });
  return { projeto: { ...r[0], valor_total: parseFloat(r[0].valor_total || 0) }, marcos: marcos.marcos };
}

async function projetoDelete({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM projetos_financeiros WHERE id = ${id}`;
  return { id, deletado: true };
}

// ─── CRUD Contrato ────────────────────────────────────────────────────────
async function contratoSave(p = {}) {
  if (!p.numero_contrato) throw new Error('numero_contrato obrigatório');
  const sql = await getSql();
  const id = p.id || `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`INSERT INTO contratos_financeiros
    (id, numero_contrato, projeto, projeto_id, data_inicio, data_vencimento, prazo_meses, prazo_texto, observacoes, atualizado_em)
    VALUES (${id}, ${p.numero_contrato}, ${p.projeto || null}, ${p.projeto_id || null},
            ${p.data_inicio || null}, ${p.data_vencimento || null}, ${p.prazo_meses || null}, ${p.prazo_texto || null},
            ${p.observacoes || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      numero_contrato=EXCLUDED.numero_contrato, projeto=EXCLUDED.projeto, projeto_id=EXCLUDED.projeto_id,
      data_inicio=EXCLUDED.data_inicio, data_vencimento=EXCLUDED.data_vencimento,
      prazo_meses=EXCLUDED.prazo_meses, prazo_texto=EXCLUDED.prazo_texto,
      observacoes=EXCLUDED.observacoes, atualizado_em=NOW()`;
  return { id };
}
function _contratoStatus(dataVenc) {
  if (!dataVenc) return 'sem_data';
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(dataVenc);
  const dias = Math.round((venc - hoje) / 86400000);
  if (dias < 0) return 'vencido';
  if (dias <= 60) return 'vencendo';
  return 'vigente';
}
async function contratoList({ status } = {}) {
  const sql = await getSql();
  const rows = await sql`SELECT * FROM contratos_financeiros ORDER BY data_vencimento ASC NULLS LAST`;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  let lista = rows.map(r => {
    const st = _contratoStatus(r.data_vencimento);
    const dias = r.data_vencimento ? Math.round((new Date(r.data_vencimento) - hoje) / 86400000) : null;
    // v1.20.6: FIX — faltava normalizar as datas p/ 'YYYY-MM-DD' antes de mandar ao frontend.
    // O driver pode devolver com timestamp ("...T00:00:00.000Z"); sem isso, o front (que faz
    // data.split('-').reverse().join('/')) quebrava o formato de exibição.
    return { ...r,
      data_inicio: r.data_inicio ? String(r.data_inicio).split('T')[0] : null,
      data_vencimento: r.data_vencimento ? String(r.data_vencimento).split('T')[0] : null,
      status_calc: st, dias_restantes: dias };
  });
  if (status) lista = lista.filter(c => c.status_calc === status);
  const resumo = { total: rows.length, vigente: 0, vencendo: 0, vencido: 0, sem_data: 0 };
  rows.forEach(r => { resumo[_contratoStatus(r.data_vencimento)]++; });
  return { contratos: lista, resumo };
}
async function contratoDelete({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM contratos_financeiros WHERE id = ${id}`;
  return { id, deletado: true };
}

// ─── IMPORTAÇÃO EM LOTE (v1.19) — planilha de Projetos, Marcos e Contratos ──
// O frontend lê o .xlsx no navegador (SheetJS) e manda as linhas já estruturadas;
// aqui só validamos, achamos/criamos o projeto por nome, e gravamos em lote.
async function marcosImportarPlanilha({ linhas = [] } = {}) {
  if (!linhas.length) throw new Error('Nenhuma linha para importar');
  const sql = await getSql();
  const projetosCache = {};
  const resultado = { marcos_criados: 0, projetos_criados: [], erros: [] };
  for (const l of linhas) {
    try {
      if (!l.projeto || !l.marco) { resultado.erros.push({ linha: l, erro: 'projeto ou marco vazio' }); continue; }
      const nomeProj = String(l.projeto).trim();
      let projId = projetosCache[nomeProj.toLowerCase()];
      if (!projId) {
        const achado = await sql`SELECT id FROM projetos_financeiros WHERE LOWER(nome) = ${nomeProj.toLowerCase()} LIMIT 1`;
        if (achado.length) projId = achado[0].id;
        else {
          projId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          await sql`INSERT INTO projetos_financeiros (id, nome, gerente_projeto_nome, status, atualizado_em)
            VALUES (${projId}, ${nomeProj}, ${l.gp_responsavel || null}, 'ativo', NOW())`;
          resultado.projetos_criados.push(nomeProj);
        }
        projetosCache[nomeProj.toLowerCase()] = projId;
      }
      const marcoId = `mar_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const dataEntrega = l.data_solicitacao || l.data_pagamento || new Date().toISOString().substring(0, 10);
      const semDataOriginal = !l.data_solicitacao;
      const statusKanban = /pago/i.test(l.status || '') ? 'concluido' : (l.status ? 'aguardando_pagamento' : 'aguardando_entrega');
      const obs = [l.observacoes, semDataOriginal ? 'Data de entrega não informada na planilha original — ajuste se necessário.' : null, l.gp_responsavel ? 'GP: ' + l.gp_responsavel : null].filter(Boolean).join(' · ');
      await sql`INSERT INTO projetos_marcos (id, projeto_id, descricao, data_entrega, valor, status_kanban, data_pagamento, observacoes, atualizado_em)
        VALUES (${marcoId}, ${projId}, ${String(l.marco).trim()}, ${dataEntrega}, ${num(l.valor)}, ${statusKanban}, ${l.data_pagamento || null}, ${obs || null}, NOW())`;
      resultado.marcos_criados++;
    } catch (e) { resultado.erros.push({ linha: l, erro: e.message }); }
  }
  console.log(`[Financeiro] Importação de marcos: ${resultado.marcos_criados} criados, ${resultado.projetos_criados.length} projeto(s) novo(s), ${resultado.erros.length} erro(s)`);
  return resultado;
}

async function contratosImportarPlanilha({ linhas = [] } = {}) {
  if (!linhas.length) throw new Error('Nenhuma linha para importar');
  const sql = await getSql();
  const resultado = { contratos_criados: 0, erros: [] };
  for (const l of linhas) {
    try {
      if (!l.numero_contrato) { resultado.erros.push({ linha: l, erro: 'número do contrato vazio' }); continue; }
      let projId = null;
      if (l.projeto) { const achado = await sql`SELECT id FROM projetos_financeiros WHERE LOWER(nome) = ${String(l.projeto).trim().toLowerCase()} LIMIT 1`; if (achado.length) projId = achado[0].id; }
      const id = `ctr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await sql`INSERT INTO contratos_financeiros (id, numero_contrato, projeto, projeto_id, data_inicio, data_vencimento, prazo_meses, prazo_texto, atualizado_em)
        VALUES (${id}, ${String(l.numero_contrato).trim()}, ${l.projeto || null}, ${projId}, ${l.data_inicio || null}, ${l.data_vencimento || null}, ${l.prazo_meses || null}, ${l.prazo_texto || null}, NOW())`;
      resultado.contratos_criados++;
    } catch (e) { resultado.erros.push({ linha: l, erro: e.message }); }
  }
  console.log(`[Financeiro] Importação de contratos: ${resultado.contratos_criados} criados, ${resultado.erros.length} erro(s)`);
  return resultado;
}

// ─── CRUD Marco ───────────────────────────────────────────────────────────
async function marcoSave(p = {}) {
  if (!p.projeto_id) throw new Error('projeto_id obrigatório');
  if (!p.descricao) throw new Error('descricao obrigatória');
  if (!p.data_entrega) throw new Error('data_entrega obrigatória');
  if (p.valor == null) throw new Error('valor obrigatório');

  const sql = await getSql();
  const id = p.id || `mar_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const isNovo = !p.id;
  await sql`INSERT INTO projetos_marcos
    (id, projeto_id, descricao, data_entrega, percentual, valor,
     nota_fiscal, data_pagamento, status_kanban, observacoes, atualizado_em)
    VALUES (${id}, ${p.projeto_id}, ${p.descricao}, ${p.data_entrega},
            ${p.percentual || null}, ${p.valor}, ${p.nota_fiscal || null},
            ${p.data_pagamento || null}, ${p.status_kanban || 'aguardando_entrega'},
            ${p.observacoes || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      descricao=EXCLUDED.descricao, data_entrega=EXCLUDED.data_entrega,
      percentual=EXCLUDED.percentual, valor=EXCLUDED.valor,
      nota_fiscal=EXCLUDED.nota_fiscal, data_pagamento=EXCLUDED.data_pagamento,
      observacoes=EXCLUDED.observacoes, atualizado_em=NOW()`;
  if (isNovo) await logMarco(sql, id, 'criado', null, p.status_kanban || 'aguardando_entrega', `Marco criado: ${p.descricao}`, p.ator);
  // v1.20.6: verificação de gravação — relê a linha e confere se a data realmente persistiu.
  // Se não bateu, isso vira um ERRO VISÍVEL na hora (em vez de sumir silenciosamente).
  const conf = await sql`SELECT data_entrega, data_pagamento FROM projetos_marcos WHERE id = ${id}`;
  const gravouEntrega = conf[0] && conf[0].data_entrega ? String(conf[0].data_entrega).split('T')[0] : null;
  if (gravouEntrega !== p.data_entrega) {
    throw new Error(`A data de entrega não foi gravada corretamente (enviado: ${p.data_entrega}, no banco: ${gravouEntrega || 'vazio'}). Tente salvar novamente; se persistir, avise o suporte.`);
  }
  return { id, data_entrega_confirmada: gravouEntrega, data_pagamento_confirmada: conf[0]?.data_pagamento ? String(conf[0].data_pagamento).split('T')[0] : null };
}

async function marcoList({ projeto_id, status_kanban } = {}) {
  const sql = await getSql();
  let rows;
  if (projeto_id && status_kanban) {
    rows = await sql`SELECT m.*, p.nome AS projeto_nome, p.cliente AS projeto_cliente,
                            p.gerente_projeto_nome, p.gerente_projeto_email,
                            p.cliente_responsavel_nome, p.cliente_responsavel_email,
                            p.financeiro_email
      FROM projetos_marcos m
      JOIN projetos_financeiros p ON p.id = m.projeto_id
      WHERE m.projeto_id = ${projeto_id} AND m.status_kanban = ${status_kanban}
      ORDER BY m.data_entrega ASC`;
  } else if (projeto_id) {
    rows = await sql`SELECT m.*, p.nome AS projeto_nome, p.cliente AS projeto_cliente,
                            p.gerente_projeto_nome, p.gerente_projeto_email,
                            p.cliente_responsavel_nome, p.cliente_responsavel_email,
                            p.financeiro_email
      FROM projetos_marcos m
      JOIN projetos_financeiros p ON p.id = m.projeto_id
      WHERE m.projeto_id = ${projeto_id} ORDER BY m.data_entrega ASC`;
  } else {
    rows = await sql`SELECT m.*, p.nome AS projeto_nome, p.cliente AS projeto_cliente,
                            p.gerente_projeto_nome, p.gerente_projeto_email,
                            p.cliente_responsavel_nome, p.cliente_responsavel_email,
                            p.financeiro_email
      FROM projetos_marcos m
      JOIN projetos_financeiros p ON p.id = m.projeto_id
      ORDER BY m.data_entrega ASC`;
  }
  return {
    marcos: rows.map(r => ({
      ...r,
      valor: parseFloat(r.valor),
      percentual: r.percentual ? parseFloat(r.percentual) : null,
      data_entrega: r.data_entrega ? String(r.data_entrega).split('T')[0] : null,
      data_pagamento: r.data_pagamento ? String(r.data_pagamento).split('T')[0] : null,
      arquivo_termo_base64: undefined, // remover do payload (pode ser grande)
      tem_termo: !!r.arquivo_termo_base64 || !!r.arquivo_termo_url,
    })),
  };
}

async function marcoGet({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const r = await sql`SELECT m.*, p.nome AS projeto_nome, p.cliente AS projeto_cliente,
                              p.gerente_projeto_nome, p.gerente_projeto_email,
                              p.cliente_responsavel_nome, p.cliente_responsavel_email,
                              p.financeiro_email
    FROM projetos_marcos m JOIN projetos_financeiros p ON p.id = m.projeto_id
    WHERE m.id = ${id}`;
  if (!r[0]) return { marco: null };
  const logs = await sql`SELECT * FROM projetos_marcos_log WHERE marco_id = ${id} ORDER BY criado_em DESC LIMIT 100`;
  return {
    marco: {
      ...r[0],
      valor: parseFloat(r[0].valor),
      percentual: r[0].percentual ? parseFloat(r[0].percentual) : null,
      data_entrega: r[0].data_entrega ? String(r[0].data_entrega).split('T')[0] : null,
      data_pagamento: r[0].data_pagamento ? String(r[0].data_pagamento).split('T')[0] : null,
      tem_termo: !!r[0].arquivo_termo_base64 || !!r[0].arquivo_termo_url,
    },
    logs,
  };
}

async function marcoDelete({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM projetos_marcos WHERE id = ${id}`;
  return { id, deletado: true };
}

// ─── Movimentar status do kanban ──────────────────────────────────────────
async function marcoMoverStatus({ id, novo_status, ator, observacao } = {}) {
  if (!id || !novo_status) throw new Error('id e novo_status obrigatórios');
  if (!KANBAN_COLUNAS.includes(novo_status)) {
    throw new Error(`status inválido. Permitidos: ${KANBAN_COLUNAS.join(', ')}`);
  }

  const sql = await getSql();
  const r = await sql`SELECT * FROM projetos_marcos WHERE id = ${id}`;
  if (!r[0]) throw new Error('marco não encontrado');
  const marco = r[0];
  const statusAnt = marco.status_kanban;
  if (statusAnt === novo_status) return { id, status_kanban: novo_status, mudou: false };

  // Carimbos de tempo por etapa
  const sets = { status_kanban: novo_status, atualizado_em: new Date() };
  if (novo_status === 'aprovado_gp')          { sets.gp_aprovado_em = new Date(); sets.gp_aprovado_por = ator || null; }
  if (novo_status === 'elaborando_termo')     { sets.fin_termo_iniciado_em = new Date(); }
  if (novo_status === 'termo_pronto')         { sets.fin_termo_pronto_em = new Date(); }
  if (novo_status === 'concluido')            { sets.concluido_em = new Date(); }

  // Update dinâmico
  if (novo_status === 'aprovado_gp') {
    await sql`UPDATE projetos_marcos
      SET status_kanban=${novo_status}, gp_aprovado_em=NOW(), gp_aprovado_por=${ator || null}, atualizado_em=NOW()
      WHERE id=${id}`;
    // NOTIFICA FINANCEIRO
    await emailEnviar({
      sql,
      marco_id: id,
      to: marco.financeiro_email || (await getFinanceiroEmail(sql, marco.projeto_id)),
      tipo: 'notifica_financeiro_apos_gp',
      assunto: `[Atlantyx] Marco aprovado pelo GP — ${marco.descricao}`,
      corpo: emailTplFinanceiroAposGP(marco, ator),
    });
  } else if (novo_status === 'termo_pronto') {
    await sql`UPDATE projetos_marcos
      SET status_kanban=${novo_status}, fin_termo_pronto_em=NOW(), atualizado_em=NOW()
      WHERE id=${id}`;
  } else if (novo_status === 'concluido') {
    await sql`UPDATE projetos_marcos
      SET status_kanban=${novo_status}, concluido_em=NOW(), atualizado_em=NOW()
      WHERE id=${id}`;
  } else if (novo_status === 'elaborando_termo') {
    await sql`UPDATE projetos_marcos
      SET status_kanban=${novo_status}, fin_termo_iniciado_em=NOW(), atualizado_em=NOW()
      WHERE id=${id}`;
  } else {
    await sql`UPDATE projetos_marcos
      SET status_kanban=${novo_status}, atualizado_em=NOW()
      WHERE id=${id}`;
  }

  await logMarco(sql, id, 'status_mudou', statusAnt, novo_status, observacao || `movido de ${statusAnt} para ${novo_status}`, ator);
  return { id, status_kanban: novo_status, mudou: true };
}

async function getFinanceiroEmail(sql, projeto_id) {
  const r = await sql`SELECT financeiro_email FROM projetos_financeiros WHERE id = ${projeto_id}`;
  return r[0]?.financeiro_email || process.env.FINANCEIRO_EMAIL || null;
}

// ─── Upload do Termo ──────────────────────────────────────────────────────
async function marcoUploadTermo({ id, nome_arquivo, base64, mime } = {}) {
  if (!id) throw new Error('id obrigatório');
  if (!base64) throw new Error('base64 obrigatório');
  if (base64.length > 10 * 1024 * 1024) throw new Error('arquivo > 10MB');

  const sql = await getSql();
  await sql`UPDATE projetos_marcos
    SET arquivo_termo_base64=${base64}, arquivo_termo_nome=${nome_arquivo || 'termo.pdf'},
        atualizado_em=NOW()
    WHERE id=${id}`;
  await logMarco(sql, id, 'termo_upload', null, null, `Termo carregado: ${nome_arquivo}`, null);
  return { id, upload_ok: true };
}

// ─── Enviar termo para cliente (e mover para aguardando_cliente) ─────────
async function marcoEnviarTermo({ id, mensagem_extra } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const r = await sql`SELECT m.*, p.nome AS projeto_nome, p.cliente_responsavel_nome,
                              p.cliente_responsavel_email, p.financeiro_email
    FROM projetos_marcos m JOIN projetos_financeiros p ON p.id = m.projeto_id
    WHERE m.id = ${id}`;
  if (!r[0]) throw new Error('marco não encontrado');
  const marco = r[0];

  if (!marco.cliente_responsavel_email) {
    throw new Error('Projeto sem email do responsável do cliente cadastrado');
  }
  if (!marco.arquivo_termo_base64) {
    throw new Error('Faça upload do termo antes de enviar');
  }

  await emailEnviar({
    sql,
    marco_id: id,
    to: marco.cliente_responsavel_email,
    cc: marco.financeiro_email,
    tipo: 'termo_para_cliente',
    assunto: `[Atlantyx] Termo para sua aprovação — ${marco.projeto_nome} — ${marco.descricao}`,
    corpo: emailTplTermoCliente(marco, mensagem_extra),
    anexo_base64: marco.arquivo_termo_base64,
    anexo_nome: marco.arquivo_termo_nome || 'termo.pdf',
  });

  await sql`UPDATE projetos_marcos
    SET status_kanban='aguardando_cliente', termo_enviado_cliente_em=NOW(), atualizado_em=NOW()
    WHERE id=${id}`;

  await logMarco(sql, id, 'termo_enviado', 'termo_pronto', 'aguardando_cliente',
                 `Termo enviado para ${marco.cliente_responsavel_email}`, 'sistema');
  return { id, enviado: true, para: marco.cliente_responsavel_email };
}

// ─── Logs do marco ────────────────────────────────────────────────────────
async function marcoLog({ marco_id } = {}) {
  if (!marco_id) throw new Error('marco_id obrigatório');
  const sql = await getSql();
  const rows = await sql`SELECT * FROM projetos_marcos_log
    WHERE marco_id = ${marco_id} ORDER BY criado_em DESC LIMIT 200`;
  return { logs: rows };
}

async function logMarco(sql, marco_id, tipo, de, para, descricao, ator, email_destino, email_status, payload) {
  const id = `mlog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await sql`INSERT INTO projetos_marcos_log
    (id, marco_id, tipo, de_status, para_status, descricao, ator, email_destino, email_status, payload)
    VALUES (${id}, ${marco_id}, ${tipo}, ${de || null}, ${para || null},
            ${descricao || null}, ${ator || null}, ${email_destino || null},
            ${email_status || null}, ${payload ? JSON.stringify(payload) : null})`;
}

// ─── Kanban: agregação por coluna ─────────────────────────────────────────
async function marcosKanban({ projeto_id } = {}) {
  const sql = await getSql();
  const rows = projeto_id
    ? await sql`SELECT m.*, p.nome AS projeto_nome, p.cliente AS projeto_cliente,
                       p.gerente_projeto_nome, p.gerente_projeto_email,
                       p.cliente_responsavel_nome, p.cliente_responsavel_email,
                       p.financeiro_email
        FROM projetos_marcos m JOIN projetos_financeiros p ON p.id = m.projeto_id
        WHERE m.projeto_id = ${projeto_id}
        ORDER BY m.data_entrega ASC`
    : await sql`SELECT m.*, p.nome AS projeto_nome, p.cliente AS projeto_cliente,
                       p.gerente_projeto_nome, p.gerente_projeto_email,
                       p.cliente_responsavel_nome, p.cliente_responsavel_email,
                       p.financeiro_email
        FROM projetos_marcos m JOIN projetos_financeiros p ON p.id = m.projeto_id
        ORDER BY m.data_entrega ASC`;

  const colunas = {};
  for (const c of KANBAN_COLUNAS) {
    colunas[c] = { label: KANBAN_LABEL[c].label, cor: KANBAN_LABEL[c].cor, marcos: [] };
  }
  for (const r of rows) {
    const m = {
      ...r,
      valor: parseFloat(r.valor),
      percentual: r.percentual ? parseFloat(r.percentual) : null,
      data_entrega: r.data_entrega ? String(r.data_entrega).split('T')[0] : null,
      data_pagamento: r.data_pagamento ? String(r.data_pagamento).split('T')[0] : null,
      tem_termo: !!r.arquivo_termo_base64,
    };
    delete m.arquivo_termo_base64;
    if (colunas[r.status_kanban]) colunas[r.status_kanban].marcos.push(m);
  }

  // Totalizadores por coluna
  for (const c of Object.keys(colunas)) {
    colunas[c].total_count = colunas[c].marcos.length;
    colunas[c].total_valor = round(colunas[c].marcos.reduce((s, m) => s + m.valor, 0));
  }

  return { colunas, ordem: KANBAN_COLUNAS };
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. ALERTAS POR EMAIL (CRON)
// ═══════════════════════════════════════════════════════════════════════════
//
// Disparado por GET /api/financeiro?action=marcos_processar_alertas com
// Authorization: Bearer ${CRON_SECRET}
// Ou via Vercel Cron (vercel.json):
//   { "crons": [{ "path": "/api/financeiro?action=marcos_processar_alertas", "schedule": "0 9 * * *" }] }

async function marcosProcessarAlertas() {
  const sql = await getSql();
  const hoje = new Date();
  const hojeStr = hoje.toISOString().split('T')[0];
  const stats = { gp_avisos: 0, cliente_lembretes: 0, fin_lembretes: 0, erros: [] };

  // ── A. AVISO 10 DIAS ANTES PARA GP ────────────────────────────────────
  // Pega marcos em 'aguardando_entrega' com entrega em ≤ 10 dias e sem aviso enviado
  const limite10dias = new Date(hoje.getTime() + 10 * 86400 * 1000).toISOString().split('T')[0];
  const paraGP = await sql`SELECT m.*, p.nome AS projeto_nome, p.cliente,
                                  p.gerente_projeto_nome, p.gerente_projeto_email,
                                  p.financeiro_email
    FROM projetos_marcos m JOIN projetos_financeiros p ON p.id = m.projeto_id
    WHERE m.status_kanban = 'aguardando_entrega'
      AND m.data_entrega <= ${limite10dias}::date
      AND m.gp_liberacao_aviso_em IS NULL`;

  for (const marco of paraGP) {
    try {
      if (!marco.gerente_projeto_email) {
        stats.erros.push(`Marco ${marco.id}: sem email do GP`);
        continue;
      }
      const diasParaEntrega = Math.ceil((new Date(marco.data_entrega) - hoje) / 86400000);
      await emailEnviar({
        sql,
        marco_id: marco.id,
        to: marco.gerente_projeto_email,
        cc: marco.financeiro_email,
        tipo: 'aviso_gp_10dias',
        assunto: `[Atlantyx] Marco em ${diasParaEntrega} dias — sua liberação é necessária — ${marco.descricao}`,
        corpo: emailTplGP10dias(marco, diasParaEntrega),
      });
      // Move para 'liberacao_gp' e marca o carimbo
      await sql`UPDATE projetos_marcos
        SET status_kanban='liberacao_gp', gp_liberacao_aviso_em=NOW(), atualizado_em=NOW()
        WHERE id=${marco.id}`;
      await logMarco(sql, marco.id, 'aviso_enviado', 'aguardando_entrega', 'liberacao_gp',
                     `Aviso 10 dias enviado para GP (${marco.gerente_projeto_email})`,
                     'cron', marco.gerente_projeto_email);
      stats.gp_avisos++;
    } catch (e) { stats.erros.push(`Marco ${marco.id} GP: ${e.message}`); }
  }

  // ── B. LEMBRETE A CADA 3 DIAS PRO CLIENTE (status: aguardando_cliente) ──
  const limite3dias = new Date(hoje.getTime() - 3 * 86400 * 1000).toISOString();
  const paraCliente = await sql`SELECT m.*, p.nome AS projeto_nome,
                                       p.cliente_responsavel_nome, p.cliente_responsavel_email,
                                       p.financeiro_email
    FROM projetos_marcos m JOIN projetos_financeiros p ON p.id = m.projeto_id
    WHERE m.status_kanban = 'aguardando_cliente'
      AND (m.cliente_ultimo_lembrete_em IS NULL OR m.cliente_ultimo_lembrete_em < ${limite3dias}::timestamptz)`;

  for (const marco of paraCliente) {
    try {
      if (!marco.cliente_responsavel_email) {
        stats.erros.push(`Marco ${marco.id}: sem email do cliente`);
        continue;
      }
      const tentativa = (marco.cliente_lembretes_count || 0) + 1;
      await emailEnviar({
        sql,
        marco_id: marco.id,
        to: marco.cliente_responsavel_email,
        cc: marco.financeiro_email,
        tipo: 'lembrete_cliente',
        assunto: `[Atlantyx] Lembrete: termo aguardando sua aprovação — ${marco.projeto_nome}`,
        corpo: emailTplLembreteCliente(marco, tentativa),
      });
      await sql`UPDATE projetos_marcos
        SET cliente_ultimo_lembrete_em=NOW(), cliente_lembretes_count=${tentativa}, atualizado_em=NOW()
        WHERE id=${marco.id}`;
      await logMarco(sql, marco.id, 'lembrete_cliente', null, null,
                     `Lembrete #${tentativa} enviado ao cliente`, 'cron', marco.cliente_responsavel_email);
      stats.cliente_lembretes++;
    } catch (e) { stats.erros.push(`Marco ${marco.id} cliente: ${e.message}`); }
  }

  // ── C. LEMBRETE A CADA 3 DIAS PRO FINANCEIRO (nf_emitida → aguardando_pagamento) ──
  const paraFin = await sql`SELECT m.*, p.nome AS projeto_nome,
                                   p.gerente_projeto_email, p.financeiro_email
    FROM projetos_marcos m JOIN projetos_financeiros p ON p.id = m.projeto_id
    WHERE m.status_kanban IN ('nf_emitida', 'aguardando_pagamento')
      AND (m.fin_ultimo_lembrete_em IS NULL OR m.fin_ultimo_lembrete_em < ${limite3dias}::timestamptz)`;

  for (const marco of paraFin) {
    try {
      const finEmail = marco.financeiro_email || process.env.FINANCEIRO_EMAIL;
      if (!finEmail) { stats.erros.push(`Marco ${marco.id}: sem email do financeiro`); continue; }
      const tentativa = (marco.fin_lembretes_count || 0) + 1;
      await emailEnviar({
        sql,
        marco_id: marco.id,
        to: finEmail,
        tipo: 'lembrete_financeiro',
        assunto: `[Atlantyx] Lembrete: confirmar pagamento — ${marco.projeto_nome} — ${marco.descricao}`,
        corpo: emailTplLembreteFinanceiro(marco, tentativa),
      });
      // Se ainda está em nf_emitida, move pra aguardando_pagamento
      if (marco.status_kanban === 'nf_emitida') {
        await sql`UPDATE projetos_marcos
          SET status_kanban='aguardando_pagamento',
              fin_ultimo_lembrete_em=NOW(), fin_lembretes_count=${tentativa}, atualizado_em=NOW()
          WHERE id=${marco.id}`;
        await logMarco(sql, marco.id, 'lembrete_financeiro', 'nf_emitida', 'aguardando_pagamento',
                       `Lembrete financeiro #${tentativa} + mudança automática de status`, 'cron', finEmail);
      } else {
        await sql`UPDATE projetos_marcos
          SET fin_ultimo_lembrete_em=NOW(), fin_lembretes_count=${tentativa}, atualizado_em=NOW()
          WHERE id=${marco.id}`;
        await logMarco(sql, marco.id, 'lembrete_financeiro', null, null,
                       `Lembrete financeiro #${tentativa}`, 'cron', finEmail);
      }
      stats.fin_lembretes++;
    } catch (e) { stats.erros.push(`Marco ${marco.id} financeiro: ${e.message}`); }
  }

  return {
    executado_em: new Date().toISOString(),
    ...stats,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. ENVIO DE EMAILS (via Gmail API se configurado, senão Resend, senão webhook custom)
// ═══════════════════════════════════════════════════════════════════════════

async function emailEnviar({ sql, marco_id, to, cc, tipo, assunto, corpo, anexo_base64, anexo_nome }) {
  let status = 'tentando';
  let providerUsed = 'nenhum';

  try {
    if (process.env.RESEND_API_KEY) {
      providerUsed = 'resend';
      const body = {
        from: process.env.RESEND_FROM || 'Atlantyx <noreply@atlantyx.com.br>',
        to: [to],
        subject: assunto,
        html: corpo,
      };
      if (cc) body.cc = [cc];
      if (anexo_base64) body.attachments = [{ filename: anexo_nome || 'arquivo.pdf', content: anexo_base64 }];

      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (r.ok) status = 'enviado'; else status = `erro_${r.status}: ${(data.message || '').substring(0, 100)}`;
    } else if (process.env.GMAIL_TOKEN || process.env.GOOGLE_REFRESH_TOKEN) {
      providerUsed = 'gmail';
      // Fallback: tenta postar pro endpoint gmail interno se existir
      const r = await fetch((process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') + '/api/gmail-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, cc, subject: assunto, html: corpo, anexo_base64, anexo_nome }),
      });
      status = r.ok ? 'enviado' : `erro_${r.status}`;
    } else if (process.env.EMAIL_WEBHOOK_URL) {
      providerUsed = 'webhook';
      const r = await fetch(process.env.EMAIL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, cc, subject: assunto, html: corpo, anexo_base64, anexo_nome }),
      });
      status = r.ok ? 'enviado' : `erro_${r.status}`;
    } else {
      status = 'sem_provider';
      console.log(`[email NOT SENT — sem RESEND_API_KEY/GMAIL_TOKEN/EMAIL_WEBHOOK_URL] to=${to}, assunto=${assunto}`);
    }
  } catch (e) {
    status = 'erro: ' + e.message.substring(0, 100);
  }

  await logMarco(sql, marco_id, 'email', null, null,
                 `[${providerUsed}] ${tipo} para ${to}: ${status}`,
                 'sistema', to, status, { tipo, cc, has_anexo: !!anexo_base64 });
  return { status, providerUsed };
}

// ═══════════════════════════════════════════════════════════════════════════
// 16. TEMPLATES DE EMAIL
// ═══════════════════════════════════════════════════════════════════════════

function emailTplGP10dias(m, dias) {
  const valor = parseFloat(m.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;color:#333;">
    <h2 style="color:#1a3a8f;">Olá ${m.gerente_projeto_nome || 'Gerente'},</h2>
    <p>Faltam <strong>${dias} dia${dias === 1 ? '' : 's'}</strong> para a entrega do marco abaixo. Por favor revise e libere para o próximo passo:</p>
    <table style="border:1px solid #ddd;border-collapse:collapse;width:100%;margin:14px 0;">
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Projeto</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.projeto_nome}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Cliente</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.cliente || '-'}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Marco</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.descricao}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Data de entrega</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.data_entrega}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Valor</strong></td><td style="padding:8px;border:1px solid #ddd;">R$ ${valor}</td></tr>
      ${m.percentual ? `<tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Percentual</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.percentual}%</td></tr>` : ''}
    </table>
    <p>Acesse o Atlantyx OS para liberar este marco no Kanban Financeiro.</p>
    <p style="color:#666;font-size:12px;">Este é um aviso automático do Atlantyx OS.</p>
  </div>`;
}

function emailTplFinanceiroAposGP(m, ator) {
  const valor = parseFloat(m.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;color:#333;">
    <h2 style="color:#22d3a3;">Marco aprovado pelo Gerente de Projeto</h2>
    <p>O marco abaixo foi liberado por <strong>${ator || 'GP'}</strong>. Por favor, prepare o termo de aceite:</p>
    <table style="border:1px solid #ddd;border-collapse:collapse;width:100%;margin:14px 0;">
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Projeto</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.projeto_nome}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Cliente</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.cliente || '-'}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Marco</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.descricao}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Valor</strong></td><td style="padding:8px;border:1px solid #ddd;">R$ ${valor}</td></tr>
    </table>
    <p><strong>Próximos passos no Kanban Financeiro:</strong></p>
    <ol>
      <li>Mover para <em>Elaborando Termo</em></li>
      <li>Subir o arquivo do termo no marco</li>
      <li>Enviar para o cliente (sistema envia automaticamente)</li>
    </ol>
    <p style="color:#666;font-size:12px;">Atlantyx OS</p>
  </div>`;
}

function emailTplTermoCliente(m, mensagem) {
  const valor = parseFloat(m.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;color:#333;">
    <h2 style="color:#1a3a8f;">Termo para sua aprovação</h2>
    <p>Olá ${m.cliente_responsavel_nome || ''},</p>
    <p>Segue em anexo o <strong>termo de aceite</strong> referente ao marco abaixo do projeto <strong>${m.projeto_nome}</strong>:</p>
    <table style="border:1px solid #ddd;border-collapse:collapse;width:100%;margin:14px 0;">
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Marco</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.descricao}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Valor</strong></td><td style="padding:8px;border:1px solid #ddd;">R$ ${valor}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Data prevista</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.data_entrega}</td></tr>
    </table>
    ${mensagem ? `<p>${mensagem}</p>` : ''}
    <p>Por favor, revise e nos retorne a aprovação para emitirmos a nota fiscal.</p>
    <p>Qualquer dúvida, estamos à disposição.</p>
    <p>Atenciosamente,<br/><strong>Atlantyx</strong></p>
  </div>`;
}

function emailTplLembreteCliente(m, tentativa) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;color:#333;">
    <h2 style="color:#f59e0b;">Lembrete: termo aguardando sua aprovação</h2>
    <p>Olá ${m.cliente_responsavel_nome || ''},</p>
    <p>Este é o <strong>lembrete nº ${tentativa}</strong> sobre o termo do marco <strong>${m.descricao}</strong> do projeto <strong>${m.projeto_nome}</strong>, enviado em ${m.termo_enviado_cliente_em ? new Date(m.termo_enviado_cliente_em).toLocaleDateString('pt-BR') : '-'}.</p>
    <p>Aguardamos seu retorno para prosseguir com a emissão da nota fiscal.</p>
    <p>Se já aprovou, por favor desconsidere este email.</p>
    <p>Atenciosamente,<br/><strong>Atlantyx</strong></p>
  </div>`;
}

function emailTplLembreteFinanceiro(m, tentativa) {
  const valor = parseFloat(m.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ehNF = m.status_kanban === 'nf_emitida';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;color:#333;">
    <h2 style="color:#3b82f6;">Lembrete financeiro #${tentativa}</h2>
    <p>O marco abaixo está em <strong>${ehNF ? 'NF Emitida' : 'Aguardando Pagamento'}</strong>. Atualize o Kanban quando o pagamento for confirmado e marque como <em>Concluído</em>:</p>
    <table style="border:1px solid #ddd;border-collapse:collapse;width:100%;margin:14px 0;">
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Projeto</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.projeto_nome}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Marco</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.descricao}</td></tr>
      <tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>Valor</strong></td><td style="padding:8px;border:1px solid #ddd;">R$ ${valor}</td></tr>
      ${m.nota_fiscal ? `<tr><td style="background:#f5f5f5;padding:8px;border:1px solid #ddd;"><strong>NF</strong></td><td style="padding:8px;border:1px solid #ddd;">${m.nota_fiscal}</td></tr>` : ''}
    </table>
    <p style="color:#666;font-size:12px;">Atlantyx OS — lembrete automático a cada 3 dias até a conclusão.</p>
  </div>`;
}
