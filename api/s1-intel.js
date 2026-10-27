import { comGuarda } from '../lib/qa-guard.js';
import { K_VIGENTE, planoResumoTexto } from '../lib/plano-estrategico.js'; // v3.240
import { salvarHistorico, listarHistorico, obterHistorico } from '../lib/historico-s1.js';
// api/s1-intel.js
// S1 · Inteligência Estratégica Contínua da Atlantyx
// Os agentes analisam a própria empresa — riscos, finanças, mercado, posicionamento
// e replanejam ações continuamente para maximizar lucro e crescimento

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { action, contexto } = req.body;
    // v3.90: histórico do planejamento (todas as telas S1)
    if (action === 'historico_listar') return res.status(200).json({ success: true, itens: await listarHistorico(req.body.tipos || req.body.tipo, req.body.limite) });
    if (action === 'historico_obter') { const h = await obterHistorico(req.body.id); return h ? res.status(200).json({ success: true, item: h }) : res.status(404).json({ success: false, error: 'Versão não encontrada' }); }

    const acoes = {
      diagnostico_completo:    () => diagnosticoCompleto(contexto),
      analise_swot:            () => analiseSwot(contexto),
      analise_riscos:          () => analiseRiscos(contexto),
      analise_financeira:      () => analiseFinanceira(contexto),
      analise_mercado:         () => analiseMercado(contexto),
      planejamento_estrategico: () => planejamentoEstrategico(contexto),
      plano_acao:              () => planoAcao(contexto),
      replanejamento:          () => replanejamento(contexto),
      okr_gerador:             () => okrGerador(contexto),
      cenarios_futuro:         () => cenariosFuturo(contexto),
    };

    if (!acoes[action]) return res.status(400).json({ error: `Ação inválida: ${Object.keys(acoes).join(', ')}` });

    const resultado = await acoes[action]();
    // v3.94: resposta da IA ilegível → erro claro (antes ia {erro} para a tela, que desenhava tudo vazio)
    const corpo = Object.values(resultado || {}).find(v => v && typeof v === 'object');
    if (corpo?.erro === 'JSON inválido') return res.status(502).json({ success: false, error: 'A IA devolveu uma resposta que não deu para ler — clique de novo em gerar.' });
    const historico_id = await salvarHistorico(action, resultado, req.sessao?.login); // v3.90
    return res.status(200).json({ success: true, action, historico_id, fontes_dados: _ultimasFontes, ...resultado });

  } catch (error) {
    console.error('[ERRO s1-intel]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── CONTEXTO DA ATLANTYX — v3.94: DADOS REAIS ────────────────────────────────
// Antes o contexto era fixo no código ("receita 0", "semana 1 de operação", pipeline inventado) e a IA analisava
// uma empresa que não existe. Agora junta, na hora: financeiro (QuickBooks + sistema), painel de vendas, leads.
function ctxAtlantyx(extra = {}) {
  return {
    empresa: 'Atlantyx (antiga Atlanteam Soluções em TI)',
    historia: '17 anos de mercado; fundador e CEO: Fabio Quintanilha; escritórios no Rio de Janeiro e em São Paulo',
    segmento: 'B2B — IA, analytics, BI e engenharia de dados para grandes empresas',
    motores_de_negocio: ['Alocação de profissionais (pessoas)', 'Projetos sob medida (dados, BI, IA)', 'Suíte própria de produtos de IA (Atlantyx OS)'],
    clientes_chave: ['CPFL Energia', 'Enel', 'Grupo Jelta Veículos', 'Caixa Capitalização'],
    icp: { setores: ['Energia e utilities', 'Bancos e seguradoras', 'Indústria', 'Infraestrutura', 'Varejo', 'Automotivo'], porte: 'médias e grandes empresas', decisores: 'donos, sócios, CEO, CFO, COO, CIO, CTO, CDO e diretores/VPs (v3.234: nunca público técnico/operacional nem pessoa física)' },
    diferenciais: ['Quick wins em semanas', 'Integra com os sistemas existentes', 'ROI mensurável', 'Experiência em energia'],
    ...extra,
  };
}
const _comPrazo = (p, ms) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error('tempo esgotado')), ms))]);
async function _sqlS1() { if (!process.env.DATABASE_URL) return null; const { neon } = await import('@neondatabase/serverless'); return neon(process.env.DATABASE_URL); }
async function _finS1(action, params = {}) { // chama o Financeiro no mesmo processo (herda o login — v3.91)
  const mod = await import('./financeiro.js'); let out = null;
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(b) { try { out = JSON.parse(b); } catch (_) { out = { raw: b }; } return this; }, setHeader() {}, end() { return this; } };
  await mod.default({ method: 'POST', body: { action, params }, query: {}, headers: {} }, res);
  if (!out?.success) throw new Error(out?.error || 'falha em ' + action); return out;
}
// v3.290: FATOS VERIFICADOS para o diagnóstico — calculados pelo sistema a partir do Fluxo Detalhado (caixa hoje e
// projeção dia a dia), Metas da Empresa, Agenda de Receitas e funil do HubSpot. O diagnóstico anterior misturava "a pagar
// total" com "a pagar em 30 dias", propostas da tabela local (vazia) com o funil do HubSpot e dava runway e "caixa não
// cobre 30 dias" ao mesmo tempo. Agora a IA recebe estes números prontos e é proibida de recalculá-los.
async function fatosVerificados() {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), mais = d => { const x = new Date(hoje + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100, F = {}, faltou = [];
  const [fx, me, ag, fu, vp, rk] = await Promise.allSettled([
    _comPrazo(_finS1('fluxo_detalhado', { data_inicio: hoje, data_fim: mais(120), dias_passado: 0 }), 45000),
    _comPrazo(_finS1('metas_empresa_status', { ano: parseInt(hoje), com_crm: false }), 40000),
    _comPrazo(_finS1('receitas_agenda', { meses: 13 }), 45000), // v3.292: 12 meses (com 4 a IA via "nada a partir de fevereiro")
    _comPrazo(_finS1('funil_vendas', { tipo: 'mes', ref: hoje.slice(0, 7), pipeline: 'todos' }), 45000),
    _comPrazo(_finS1('vencidos_painel', {}), 45000), // v3.292: recebíveis vencidos fatura a fatura (com "pode já ter sido paga")
    _comPrazo(_finS1('resultado_kpis', { ano: parseInt(hoje) }), 45000)]); // v3.292: apuração de margem em 4 camadas do ano
  if (fx.status === 'fulfilled') { const X = fx.value, L = (X.futuro?.lancamentos || []).filter(l => !l.ja_paga && !l.fora_do_saldo);
    const jan = d => { const ate = mais(d), sel = L.filter(l => String(l.data).slice(0, 10) <= ate), e = sel.filter(l => l.tipo === 'entrada').reduce((a, l) => a + (l.valor || 0), 0), sa = sel.filter(l => l.tipo === 'saida').reduce((a, l) => a + (l.valor || 0), 0);
      const sal = sel.filter(l => l.saldo_acumulado != null), mn = sal.reduce((m, l) => !m || l.saldo_acumulado < m.saldo_acumulado ? l : m, null);
      return { entradas_previstas: r2(e), saidas_previstas: r2(sa), saldo_no_fim: r2((X.saldo_hoje || 0) + e - sa), menor_saldo: mn ? r2(mn.saldo_acumulado) : r2(X.saldo_hoje), data_menor_saldo: mn ? String(mn.data).slice(0, 10) : hoje }; };
    const semanas = []; let saldo = X.saldo_hoje || 0;
    for (let w = 0; w < 13; w++) { const de = mais(w * 7), ate = mais(w * 7 + 6), sel = L.filter(l => { const d = String(l.data).slice(0, 10); return d >= de && d <= ate; });
      const e = sel.filter(l => l.tipo === 'entrada').reduce((a, l) => a + (l.valor || 0), 0), sa = sel.filter(l => l.tipo === 'saida').reduce((a, l) => a + (l.valor || 0), 0); saldo += e - sa;
      semanas.push({ semana: de.split('-').reverse().slice(0, 2).join('/') + '–' + ate.split('-').reverse().slice(0, 2).join('/'), entradas: r2(e), saidas: r2(sa), saldo_fim: r2(saldo),
        maiores: sel.sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 3).map(l => (l.tipo === 'entrada' ? '+ ' : '− ') + String(l.descricao || l.contraparte || '').slice(0, 50) + ' R$ ' + Math.round(l.valor || 0).toLocaleString('pt-BR')) }); }
    const j90 = jan(90), saidaMes = j90.saidas_previstas / 3;
    F.caixa = { saldo_hoje: r2(X.saldo_hoje), proximos_30_dias: jan(30), proximos_60_dias: jan(60), proximos_90_dias: j90,
      recebiveis_vencidos_em_aberto: r2(X.futuro?.vencidos_fora_do_extrato?.receber?.valor), pagaveis_vencidos_em_aberto: r2(X.futuro?.vencidos_fora_do_extrato?.pagar?.valor),
      menor_saldo_30_dias_se_receber_os_vencidos: r2(jan(30).menor_saldo + (Number(X.futuro?.vencidos_fora_do_extrato?.receber?.valor) || 0) - (Number(X.futuro?.vencidos_fora_do_extrato?.pagar?.valor) || 0)),
      saida_media_mensal_prevista: r2(saidaMes), meses_de_caixa_sem_novas_entradas: saidaMes > 0 ? Math.round((X.saldo_hoje || 0) / saidaMes * 10) / 10 : null,
      fluxo_semanal_13_semanas: semanas, fonte: 'Fluxo Detalhado (QuickBooks + despesas programadas + receitas previstas)' }; }
  else faltou.push('fluxo de caixa: ' + (fx.reason?.message || ''));
  if (me.status === 'fulfilled') { const M = me.value.metas || {}, FA = M.faturamento || {}, MG = M.margem || {};
    F.metas_do_ano = { ano: M.ano, meta_faturamento: FA.meta ?? M.meta?.faturamento ?? null, realizado: FA.realizado ?? M.realizado?.faturamento ?? null, pct_atingido: FA.pct_atingido ?? null, esperado_ate_hoje: FA.esperado_ate_hoje ?? null,
      ritmo_pct: FA.ritmo_pct ?? null, projecao_fechamento: FA.projecao_fechamento ?? null, falta: FA.falta ?? null, margem_liquida_real_pct: MG.realizado_pct ?? M.realizado?.margem_pct ?? null, meta_margem_pct: MG.meta_pct ?? M.meta?.margem_pct ?? null,
      lucro_liquido: M.realizado?.lucro_liquido ?? null, regime: 'caixa (DRE do QuickBooks)', fonte: 'Planejamento › Metas da Empresa' }; }
  else faltou.push('metas: ' + (me.reason?.message || ''));
  if (vp.status === 'fulfilled') { const V = vp.value, R = V.receber || [];
    F.recebiveis_vencidos = { total: r2(V.total_receber), qtd: R.length, a_cobrar: V.receber_cobrar || null, conferir_antes_de_cobrar: V.receber_conferir || null, por_faixa_de_atraso_dias: V.aging_receber || null,
      faturas: R.slice(0, 15).map(x => ({ cliente: x.contraparte, fatura: x.doc, vencimento: x.vencimento, dias_vencida: x.dias, valor: r2(x.valor), situacao: x.possivelmente_paga ? 'CONFERIR: pode já ter sido paga (entrada de R$ ' + Math.round(x.possivelmente_paga.valor).toLocaleString('pt-BR') + ' em ' + x.possivelmente_paga.data + ')' : x.retencao_provavel ? 'saldo é imposto retido — baixar no QuickBooks' : 'cobrar' })),
      pagaveis_vencidos: { total: r2(V.total_pagar), qtd: (V.pagar || []).length, ja_pagas_no_extrato_nao_baixadas: (V.ja_pagas || []).length },
      fonte: 'Dashboard › Financeiro › Vencidos em aberto (faturas do QuickBooks; saldo que é só imposto retido já excluído)' }; }
  else faltou.push('recebíveis vencidos: ' + (vp.reason?.message || ''));
  if (rk.status === 'fulfilled') { const A = rk.value.resultado?.ano_res, C = A?.camadas;
    if (C) { const { contas, motores, ...cam } = C; const topo = k => (contas || []).filter(x => x.classe === k).slice(0, 6).map(x => ({ conta: x.conta, valor: r2(x.valor) }));
      F.apuracao_margem_ano = { ...cam, motores: Object.fromEntries(Object.entries(motores || {}).map(([k, m]) => [k, { receita: m.receita, margem_bruta_pct: m.margem_bruta_pct, margem_contribuicao: m.margem_contribuicao, margem_contribuicao_pct: m.margem_contribuicao_pct }])),
        maiores_contas: { custo_direto: topo('direto'), custo_fixo: topo('fixo'), corporativo: topo('corporativo'), retiradas: topo('retirada') }, periodo: rk.value.resultado?.ano,
        regra: 'lucro = resultado operacional (antes das retiradas de sócio); % sobre a receita bruta. Este é o lucro oficial do sistema.' }; } }
  else faltou.push('apuração de margem: ' + (rk.reason?.message || ''));
  if (ag.status === 'fulfilled') { const A = ag.value.agenda || {}; const atr = (A.ativas || []).filter(o => o.status === 'atrasada');
    const dAtr = o => Math.max(0, Math.round((Date.parse(hoje) - Date.parse(o.data_prevista || hoje)) / 864e5));
    F.receitas_com_previsao_vencida = { qtd: atr.length, valor: r2(atr.reduce((a, o) => a + (o.valor || 0), 0)),
      a_faturar_ja: r2(atr.filter(o => o.origem !== 'termo').reduce((a, o) => a + (o.valor || 0), 0)), termos_com_pagamento_atrasado: r2(atr.filter(o => o.origem === 'termo').reduce((a, o) => a + (o.valor || 0), 0)),
      itens: [...atr].sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 15).map(o => ({ tipo: o.origem, cliente: o.cliente, descricao: String(o.descricao || '').slice(0, 70), valor: r2(o.valor), previsto_para: o.data_prevista, dias_de_atraso: dAtr(o) })),
      leitura: 'marco/sustentação com previsão vencida e ainda NÃO faturado = dá para faturar já (é a única antecipação real); termo atrasado = termo em aprovação ou nota emitida com pagamento previsto vencido = destravar aprovação ou cobrar. Ficam FORA do saldo projetado até ganharem nova data.' };
    F.receita_contratada_prevista = { proximos_12_meses: (A.por_mes || []).slice(0, 13).map(x => ({ mes: x.mes, total: r2(x.total), marcos_sem_termo: r2(x.marco), termos_no_faturamento: r2(x.termo), sustentacoes: r2(x.sustentacao), avulsas: r2(x.manual) })), fonte: 'Agenda de Receitas (marcos, termos e sustentações ainda não faturados; sem repetir marco que já está em termo)', observacao: 'A carteira futura JÁ está no fluxo de caixa nas datas programadas: antecipar um marco só muda o mês, não cria receita nova.',
      por_cliente_12_meses: (() => { const g = {}; (A.ativas || []).forEach(o => { const k = o.cliente || 'Sem cliente'; g[k] = (g[k] || 0) + (o.valor || 0); }); const t = Object.values(g).reduce((x, y) => x + y, 0) || 1;
        return Object.entries(g).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([c, v]) => ({ cliente: c, valor: r2(v), pct_da_carteira: Math.round(v / t * 1000) / 10 })); })() }; }
  else faltou.push('agenda de receitas: ' + (ag.reason?.message || ''));
  if (fu.status === 'fulfilled' && !fu.value.indisponivel) { const R = fu.value.resumo || {}; F.funil_hubspot = { o_que_e: 'negócios JÁ ABERTOS no funil do HubSpot (oportunidades em andamento) — NÃO são leads novos a prospectar', negocios_abertos: R.aberto?.qtd ?? null, valor_aberto: R.aberto?.valor ?? null, ponderado: R.aberto?.ponderado ?? null, abertos_sem_valor: R.aberto?.sem_valor ?? null,
      ganho_no_mes: R.ganho?.valor ?? null, taxa_ganho_pct: R.taxa_ganho_pct ?? null, por_etapa: (fu.value.etapas || []).map(e => ({ etapa: e.nome, qtd: e.agora?.qtd, valor: e.agora?.valor })), fonte: 'HubSpot (funil do Dashboard ao vivo)',
      observacao: R.aberto?.qtd && !R.aberto?.valor ? 'há negócios abertos, mas SEM VALOR preenchido no HubSpot — o funil em R$ aparece zerado por falta de cadastro, não por falta de negócios' : null }; }
  else faltou.push('funil HubSpot: ' + (fu.reason?.message || fu.value?.indisponivel || ''));
  return { fatos: F, faltou };
}
async function ctxReal(extra = {}) {
  const fontes = [], faltou = [];
  const [finR, vendR, leadsR] = await Promise.allSettled([
    _comPrazo(_finS1('dashboard_financeiro', {}), 30000),
    _comPrazo((async () => { const sql = await _sqlS1(); if (!sql) return null; const r = await sql`SELECT valor, atualizado_em FROM app_config WHERE chave = 'cache:vendas:painel' LIMIT 1`; if (!r[0]) return null; const v = typeof r[0].valor === 'string' ? JSON.parse(r[0].valor) : r[0].valor; return { v, em: r[0].atualizado_em }; })(), 8000),
    _comPrazo((async () => { const sql = await _sqlS1(); if (!sql) return null;
      const t = await sql`SELECT COUNT(*)::int n, COUNT(*) FILTER (WHERE criado_em > NOW() - INTERVAL '30 days')::int n30 FROM leads WHERE criado_em > NOW() - INTERVAL '90 days' AND COALESCE(status,'') <> 'qa_teste'`;
      const o = await sql`SELECT COALESCE(origem,'?') origem, COUNT(*)::int n FROM leads WHERE criado_em > NOW() - INTERVAL '90 days' AND COALESCE(status,'') <> 'qa_teste' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`;
      return { total_90d: t[0]?.n || 0, total_30d: t[0]?.n30 || 0, por_origem: o }; })(), 8000),
  ]);
  const real = {};
  if (finR.status === 'fulfilled') { const x = finR.value.dashboard || {}; fontes.push('Financeiro (QuickBooks + sistema)');
    real.financeiro = { caixa: x.caixa, saude: { semaforo: x.saude?.semaforo, motivos: x.saude?.motivos, kpis: x.saude?.kpis }, planejado_x_real_mes: x.planejado_real?.totais, fluxo_6_meses: (x.grafico_6m?.meses || []).map(m => ({ mes: m.mes, receita_planejada: m.receita_planejada, receita_real: m.receita_real, despesa_lancada_ou_programada: m.despesa_planejada, saidas_reais_de_caixa: m.despesa_real })),
      fluxo_6_meses_leitura: 'NÃO é orçamento. "despesa_lancada_ou_programada" = só contas a pagar lançadas no QuickBooks + despesas programadas na Agenda; "saidas_reais_de_caixa" = tudo que saiu do banco (inclui impostos, retiradas, cartão, pagamentos avulsos sem conta lançada). Real acima do lançado é falta de lançamento/programação, não estouro de orçamento.',
      orcamento: x.orcamento_por_tipo, conciliacao: x.conciliacao, indicador_social: x.social ? { pct: x.social.pct, meta: x.social.meta, destinado: x.social.destinado } : null }; }
  else faltou.push('financeiro: ' + (finR.reason?.message || ''));
  if (vendR.status === 'fulfilled' && vendR.value) { fontes.push('Painel de Vendas'); const v = vendR.value.v || {};
    const vv = { metas: v.metas, propostas: v.propostas, margens: v.margens ? { geral: v.margens.geral } : undefined, calculo: v.calculo, atualizado_em: vendR.value.em };
    for (const k of ['calculo', 'margens', 'propostas']) if (JSON.stringify(vv).length > 6000) delete vv[k]; // cabe no contexto sem cortar JSON
    vv.observacao = 'propostas = tabela local de propostas do sistema (pode estar vazia; o funil real está no HubSpot); win rate e ticket do cálculo podem ser PADRÃO quando não há histórico — veja calculo.win_fonte/ticket_fonte e diga quando for padrão.';
    real.vendas = vv; }
  else faltou.push('vendas: ' + (vendR.reason?.message || 'sem cálculo salvo'));
  if (leadsR.status === 'fulfilled' && leadsR.value) { fontes.push('Leads (captura)'); real.leads = { ...leadsR.value, observacao: 'só leads capturados pelo próprio sistema (formulários/robôs); não inclui contatos e negócios do HubSpot nem prospecção manual — não use como "geração de leads da empresa".' }; } else faltou.push('leads: ' + (leadsR.reason?.message || ''));
  // v3.240: PLANO ESTRATÉGICO VIGENTE (cadastrado e aprovado pelo fundador) — Plano Estratégico, Plano de Ação 90d e OKRs
  // partem dele. Sem plano aprovado (ou se a leitura falhar) segue como antes, só com os dados reais.
  let planoTxt = null;
  try { const sql = await _sqlS1(); if (sql) { const r = await sql`SELECT value FROM kv_store WHERE key = ${K_VIGENTE} LIMIT 1`; let v = r[0]?.value; if (typeof v === 'string') v = JSON.parse(v);
    if (v?.plano) { planoTxt = planoResumoTexto(v.plano, v); fontes.push('Plano estratégico vigente (v' + v.versao + ')'); } } } catch (_) {}
  _ultimasFontes = { fontes, faltou };
  return { ctx: ctxAtlantyx({ dados_reais: real, data_de_hoje: new Date().toISOString().slice(0, 10), ...(planoTxt ? { plano_estrategico_vigente: planoTxt, instrucao_plano: 'Parta do plano estratégico vigente: detalhe e execute as alavancas, metas e prioridades aprovadas; se os dados reais contradisserem o plano, aponte a diferença e sugira o ajuste em vez de criar outra estratégia do zero.' } : {}), ...extra }), fontes, faltou };
}
let _ultimasFontes = null;
// v3.292: TODA análise do S1 (diagnóstico, riscos, financeira, planejamento, plano de ação, replanejamento, OKRs, cenários)
// recebe os fatos verificados e as mesmas regras de coerência — antes só o Diagnóstico Completo recebia.
async function ctxComFatos(extra) {
  const [ctxR, FV] = await Promise.all([ctxReal(extra), fatosVerificados().catch(e => ({ fatos: {}, faltou: [e.message] }))]);
  const ctx = ctxR.ctx; ctx.fatos_verificados = FV.fatos; if (FV.faltou.length) ctx.fatos_que_faltaram = FV.faltou;
  return { ...ctxR, ctx, fatos: FV };
}
const REGRAS_FATOS = `
REGRAS DE COERÊNCIA (obrigatórias):
- "fatos_verificados" foi calculado pelo sistema e PREVALECE sobre qualquer outro número do contexto. Não recalcule caixa, runway, metas, margem ou funil por conta própria.
- Caixa: use fatos_verificados.caixa (saldo de hoje, entradas/saídas previstas em 30/60/90 dias e menor saldo projetado). Só diga que o caixa "não cobre" um período se o MENOR SALDO projetado desse período for negativo. Nunca compare o caixa com "contas a pagar totais".
- Runway = fatos_verificados.caixa.meses_de_caixa_sem_novas_entradas. Não afirme falta de caixa e runway longo ao mesmo tempo.
- As entradas previstas JÁ incluem faturas em aberto, marcos com entrega programada, termos e sustentações. Receitas com previsão vencida ficam FORA do saldo (fatos_verificados.receitas_com_previsao_vencida). Recebíveis vencidos são entrada provável com atraso: considere menor_saldo_30_dias_se_receber_os_vencidos.
- Cobrança: cite clientes e faturas de fatos_verificados.recebiveis_vencidos. As marcadas "CONFERIR" podem já ter sido pagas — a ação é conferir no extrato e baixar no QuickBooks, não ligar para o cliente. Use "a_cobrar" como alvo de cobrança, não o total.
- Antecipar faturamento: só os itens de receitas_com_previsao_vencida (a_faturar_ja). A carteira futura (receita_contratada_prevista e o Kanban de Marcos) já está no fluxo nas datas programadas; antecipar só muda o mês.
- Lucro e margem: use fatos_verificados.apuracao_margem_ano (4 camadas; lucro = resultado operacional antes das retiradas) e metas_do_ano. Não use orçamento como meta. Para dizer que despesas estão "fora de controle", aponte as contas com valor (apuracao_margem_ano.maiores_contas) e compare com algo concreto (orçamento ou meses anteriores) — sem comparação, diga que é hipótese.
- Funil: use fatos_verificados.funil_hubspot. São negócios JÁ ABERTOS, não leads. Sem valor no HubSpot = falta de cadastro: a ação é qualificar (valor, etapa, próximo passo), não "prospectar". Se o funil tiver etapas com números diferentes em telas diferentes, use o de fatos_verificados.
- dados_reais.leads é só o que o sistema captura sozinho — não é a geração de leads da empresa. Win rate/ticket marcados como padrão não são histórico: diga que são premissa.
- Liquidez/capital de giro do painel: veja a composição (liquidez_composicao) e prefira o menor saldo projetado; não conclua "pressão estrutural" sem menor saldo negativo.
- Empresas-alvo, metas numéricas de ações (R$, nº de reuniões, contatos/dia) e tickets: só cite nomes e números que estejam no contexto; quando for sugestão sua, escreva "(sugestão)" ou "(estimativa)".
- "Despesas acima do orçamento": só afirme comparando com o ORÇAMENTO (dados_reais.financeiro.orcamento). O fluxo_6_meses compara saídas reais com o que foi lançado/programado — não é orçamento (veja fluxo_6_meses_leitura).
- Concentração de clientes: meça em % da receita (12 meses ou carteira contratada), não por um marco isolado; diga o percentual ou que o dado faltou.
- Concorrência e mercado sem dado no contexto: escreva como hipótese de mercado, não como fato.
- Se um fato estiver em fatos_que_faltaram, diga que o dado não estava disponível — não estime.`;
const CONCISO = '\nSeja conciso: no máximo 4 itens por lista, frases curtas, valores em R$. Use os DADOS REAIS do contexto (dados_reais); se faltar um dado, diga que faltou — não invente números.';

// ── DIAGNÓSTICO COMPLETO ──────────────────────────────────────────────────────
async function diagnosticoCompleto(extra) {
  const ctxR = await ctxComFatos(extra), FV = ctxR.fatos;
  const ctx = ctxR.ctx;

  const system = `Você é o sistema de Inteligência Estratégica da Atlantyx — uma consultoria de estratégia interna de nível McKinsey.
Seu papel: analisar a empresa de forma completa, identificar o que está funcionando, o que está bloqueando crescimento e o que pode ser otimizado para maximizar lucro.
Use frameworks reais: SWOT, PESTEL, Porter, Canvas, BCG, Ansoff.
Seja direto, honesto e acionável. Não suavize problemas reais.
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Faça um DIAGNÓSTICO COMPLETO da empresa:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "saude_geral": "Verde | Amarelo | Vermelho",
  "nota_geral": 0-10,
  "headline": "frase de 1 linha resumindo o momento da empresa",
  "momento": "descrição do estágio atual em 3-4 linhas — onde está, o que está indo bem, o que está travando",
  "swot": {
    "forcas": [{"item":"...","impacto":"Alto|Médio|Baixo","como_aproveitar":"...","evidencias":[EV]}],
    "fraquezas": [{"item":"...","impacto":"Alto|Médio|Baixo","como_mitigar":"...","evidencias":[EV]}],
    "oportunidades": [{"item":"...","janela":"Agora|6m|1ano","acao":"...","evidencias":[EV]}],
    "ameacas": [{"item":"...","probabilidade":"Alta|Média|Baixa","mitigacao":"...","evidencias":[EV]}]
  },
  "gargalos_criticos": [
    {"gargalo":"...","impacto_receita":"R$X/mês perdidos","solucao":"...","prazo":"X semanas","responsavel":"...","evidencias":[EV]}
  ],
  "alavancas_de_crescimento": [
    {"alavanca":"...","potencial_receita":"R$X","esforco":"Alto|Médio|Baixo","prazo":"...","acao_imediata":"...","evidencias":[EV]}
  ],
  "evidencias_gerais": [EV],
  "posicionamento_mercado": "análise do posicionamento atual vs. ideal",
  "vantagem_competitiva_real": "qual é a real vantagem defensável da Atlantyx hoje",
  "maior_risco_agora": "o risco número 1 que pode travar o crescimento nos próximos 90 dias",
  "maior_oportunidade_agora": "a oportunidade número 1 que pode acelerar o crescimento nos próximos 90 dias",
  "proximos_90_dias_criticos": "o que precisa acontecer nos próximos 90 dias para a empresa atingir a meta do ano (fatos_verificados.metas_do_ano)",
  "evidencias_risco": [EV], "evidencias_oportunidade": [EV]
}
EV = {"indicador":"nome do dado","valor":"valor EXATO como está no contexto (R$, %, quantidade)","fonte":"caminho no contexto, ex.: fatos_verificados.caixa.proximos_30_dias.menor_saldo","leitura":"por que esse número sustenta o ponto (1 frase)"}.
Cada item precisa de 1 a 3 evidências tiradas LITERALMENTE de fatos_verificados (preferência) ou dados_reais (ou do plano vigente). Se não houver número que sustente o item, use {"indicador":"sem dado","valor":"—","fonte":"","leitura":"inferência qualitativa"} — nunca invente valores.`;

  const r = await claude(system, user, 5000);
  const diag = parseJSON(r);
  console.log(`[S1-Intel] Diagnóstico: ${diag.nota_geral}/10 — ${diag.saude_geral}`);
  return { diagnostico: diag, dados_usados: { fatos_verificados: FV.fatos, fatos_que_faltaram: FV.faltou, dados_reais: ctx.dados_reais || null, plano_estrategico_vigente: ctx.plano_estrategico_vigente || null, data_de_hoje: ctx.data_de_hoje } }; // v3.289: os valores que pautaram a análise
}

// ── ANÁLISE DE RISCOS ─────────────────────────────────────────────────────────
async function analiseRiscos(extra) {
  const ctx = (await ctxComFatos(extra)).ctx; // v3.292: + fatos verificados

  const system = `Você é o Agente de Gestão de Riscos da Atlantyx.
Mapeie TODOS os riscos reais — internos, externos, financeiros, operacionais, de mercado, jurídicos e de pessoas.
Para cada risco: quantifique o impacto, defina a probabilidade e proponha uma ação de mitigação concreta.
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Analise os riscos completos da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "nivel_risco_geral": "Alto | Médio | Baixo",
  "riscos": [
    {
      "categoria": "Financeiro | Operacional | Mercado | Pessoas | Jurídico | Tecnológico | Reputacional",
      "risco": "descrição clara do risco",
      "probabilidade": "Alta | Média | Baixa",
      "impacto": "Alto | Médio | Baixo",
      "impacto_financeiro_estimado": "R$X ou X% da receita",
      "gatilho": "o que faria este risco se materializar",
      "mitigacao": "ação concreta para reduzir probabilidade ou impacto",
      "responsavel": "Fundador | Dev | Marketing | Closer | Agente IA",
      "prazo_mitigacao": "imediato | 2 semanas | 1 mês | 3 meses",
      "status": "Não mitigado | Em mitigação | Mitigado"
    }
  ],
  "matriz_risco": {
    "criticos": ["riscos de alta probabilidade E alto impacto"],
    "monitorar": ["riscos de média probabilidade ou médio impacto"],
    "aceitar": ["riscos de baixa probabilidade E baixo impacto"]
  },
  "risco_numero_1": "qual risco merece ação imediata esta semana e por quê",
  "plano_contingencia_receita": "o que fazer se não atingir 50% da meta em 45 dias"
}`;

  const r = await claude(system, user, 3000);
  const riscos = parseJSON(r);
  console.log(`[S1-Intel] Riscos mapeados: ${riscos.riscos?.length || 0} | Nível: ${riscos.nivel_risco_geral}`);
  return { riscos };
}

// ── ANÁLISE FINANCEIRA ────────────────────────────────────────────────────────
async function analiseFinanceira(extra) {
  const ctx = (await ctxComFatos(extra)).ctx; // v3.292: + fatos verificados

  const system = `Você é o CFO-Agente da Atlantyx — modelo financeiro real para maximizar lucro e sustentabilidade.
Pense como um CFO experiente de startup B2B SaaS/serviços.
Modele os números com realismo: sem otimismo injustificado.
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Análise financeira completa da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "diagnostico_financeiro": {
    "situacao_atual": "descrição da saúde financeira atual",
    "runway_estimado": "quantos meses o caixa aguenta sem receita",
    "ponto_de_equilibrio": "quantos contratos/mês para cobrir custos",
    "unit_economics": {
      "cac_estimado": "R$X",
      "ltv_estimado": "R$X",
      "ltv_cac_ratio": "Xx",
      "payback_period": "X meses",
      "margem_contribuicao_servico": "X%"
    }
  },
  "projecao_receita": {
    "premissas": {"contratos_mes1": 0, "contratos_mes2": 0, "contratos_mes3": 0, "ticket_medio": "R$X", "churn_mensal": "X%"},
    "mes1": {"receita": "R$X", "clientes_acumulados": 0, "atingimento_meta": "X%"},
    "mes2": {"receita": "R$X", "clientes_acumulados": 0, "atingimento_meta": "X%"},
    "mes3": {"receita": "R$X", "clientes_acumulados": 0, "atingimento_meta": "X%"},
    "arr_projetado": "R$X"
  },
  "cenarios": {
    "pessimista": {"descricao":"...","receita_90d":"R$X","probabilidade":"X%","gatilho":"..."},
    "realista":   {"descricao":"...","receita_90d":"R$X","probabilidade":"X%","gatilho":"..."},
    "otimista":   {"descricao":"...","receita_90d":"R$X","probabilidade":"X%","gatilho":"..."}
  },
  "alavancas_financeiras": [
    {"alavanca":"...","impacto_receita":"R$X/mês","custo_implementacao":"R$X","roi":"X meses","prioridade":"Alta|Média|Baixa"}
  ],
  "decisoes_financeiras_urgentes": [
    {"decisao":"...","prazo":"...","impacto":"...","responsavel":"Fundador"}
  ],
  "maximizacao_lucro": {
    "estrategia_pricing": "como precificar para maximizar margem",
    "mix_produto_ideal": "qual combinação de produtos maximiza margem e velocidade de fechamento",
    "canal_mais_rentavel": "qual canal de aquisição tem melhor ROI agora",
    "cortes_custos_possiveis": ["custo 1 para cortar", "custo 2"],
    "investimentos_prioritarios": ["onde investir para máximo retorno"]
  }
}`;

  const r = await claude(system, user, 3000);
  const financeiro = parseJSON(r);
  console.log(`[S1-Intel] Análise financeira concluída — ARR projetado: ${financeiro.projecao_receita?.arr_projetado}`);
  return { financeiro };
}

// ── ANÁLISE DE MERCADO ────────────────────────────────────────────────────────
async function analiseMercado(extra) {
  const ctx = (await ctxComFatos(extra)).ctx; // v3.292: + fatos verificados

  const system = `Você é o Agente de Inteligência de Mercado da Atlantyx.
Analise o mercado externo com profundidade: concorrência, tendências, PESTEL, forças de Porter.
Identifique onde estão as maiores oportunidades e ameaças de mercado.
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Análise completa do mercado para a Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "panorama_mercado": {
    "tam_brasil": "R$X bilhões",
    "sam_atlantyx": "R$X bilhões (mercado endereçável real)",
    "som_90d": "R$X (fatia realista em 90 dias)",
    "crescimento_anual": "X%",
    "maturidade": "Emergente | Crescendo | Maduro | Saturado"
  },
  "pestel": {
    "politico": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "economico": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "social": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "tecnologico": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "ambiental": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "legal": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["LGPD", "..."]}
  },
  "forças_porter": {
    "rivalidade_concorrentes": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "poder_compradores": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "poder_fornecedores": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "ameaca_novos_entrantes": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "ameaca_substitutos": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "atratividade_geral": "Alta|Média|Baixa"
  },
  "concorrentes": [
    {
      "nome": "...",
      "posicionamento": "...",
      "forcas": ["..."],
      "fraquezas": ["..."],
      "como_vencer": "estratégia específica para ganhar contra este player"
    }
  ],
  "tendencias_favoraveis": [
    {"tendencia": "...", "impacto_atlantyx": "...", "como_aproveitar": "...","janela": "Agora|6m|1ano"}
  ],
  "oportunidades_nao_exploradas": [
    {"oportunidade": "...", "potencial": "R$X", "barreira_entrada": "Alta|Média|Baixa", "acao": "..."}
  ],
  "segmento_mais_quente_agora": "qual setor do ICP tem maior urgência de compra neste momento e por quê"
}`;

  const r = await claude(system, user, 3000);
  const mercado = parseJSON(r);
  console.log(`[S1-Intel] Análise de mercado: ${mercado.panorama_mercado?.maturidade} — TAM ${mercado.panorama_mercado?.tam_brasil}`);
  return { mercado };
}

// ── PLANEJAMENTO ESTRATÉGICO ──────────────────────────────────────────────────
async function planejamentoEstrategico(extra) {
  const ctx = (await ctxComFatos(extra)).ctx; // v3.292: + fatos verificados

  const system = `Você é o Diretor de Estratégia da Atlantyx — nível McKinsey/Bain.
Crie um planejamento estratégico real, acionável e com foco em maximização de lucro.
Pense em 3 horizontes: 90 dias (execução), 1 ano (crescimento), 3 anos (escala).
Cada ação deve ter: o QUÊ fazer, POR QUÊ, COMO, QUANDO e QUEM.
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Crie o Planejamento Estratégico completo da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "visao_90_dias": "onde a Atlantyx deve estar em 90 dias",
  "visao_1_ano": "onde deve estar em 1 ano",
  "visao_3_anos": "onde deve estar em 3 anos",
  "estrategia_competitiva": "qual é a estratégia competitiva central: diferenciação | custo | nicho | plataforma",
  "modelo_crescimento": "como a empresa vai crescer: produto | canal | mercado | modelo",
  "prioridades_estrategicas": [
    {
      "prioridade": "nome da prioridade estratégica",
      "descricao": "por que é prioridade agora",
      "horizonte": "90 dias | 1 ano | 3 anos",
      "impacto_receita": "R$X",
      "esforco": "Alto | Médio | Baixo",
      "dependencias": ["..."]
    }
  ],
  "iniciativas_estrategicas": [
    {
      "iniciativa": "nome da iniciativa",
      "objetivo": "resultado esperado",
      "acoes": [
        {"acao": "...", "responsavel": "...", "prazo": "DD/MM/AAAA", "kpi_sucesso": "...", "recursos": "..."}
      ],
      "meta_resultado": "R$X ou % de crescimento",
      "prazo_conclusao": "DD/MM/AAAA",
      "status": "Não iniciada | Em andamento | Concluída"
    }
  ],
  "modelo_de_receita_ideal": "como estruturar a receita para máxima previsibilidade e margem",
  "go_to_market_90d": {
    "foco_setor": "qual setor priorizar nos 90 dias e por quê",
    "mensagem_central": "qual mensagem ressoa mais agora",
    "canal_primario": "qual canal de aquisição focar",
    "meta_semana_1": "...",
    "meta_semana_4": "...",
    "meta_dia_90": "..."
  }
}`;

  const r = await claude(system, user, 4000);
  const plano = parseJSON(r);
  console.log(`[S1-Intel] Planejamento estratégico gerado — ${plano.prioridades_estrategicas?.length || 0} prioridades`);
  return { plano };
}

// ── PLANO DE AÇÃO COMPLETO ────────────────────────────────────────────────────
async function planoAcao(extra) {
  const ctx = (await ctxComFatos(extra)).ctx; // v3.292: + fatos verificados

  const system = `Você é o COO-Agente da Atlantyx — responsável por transformar estratégia em ação.
Crie um plano de ação COMPLETO, semana a semana, para os próximos 90 dias.
Cada ação deve ser específica o suficiente para ser executada sem dúvida.
Priorize pelo impacto na receita. Respeite a capacidade do time (pequeno).
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Crie o Plano de Ação completo dos próximos 90 dias da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "objetivo_geral": "o que este plano busca atingir",
  "premissas": ["premissa 1 do plano", "premissa 2"],
  "semanas": [
    {
      "semana": 1,
      "periodo": "14/04 – 18/04/2026",
      "foco": "tema central desta semana",
      "meta_receita": "R$X",
      "acoes": [
        {
          "id": "S1.1",
          "acao": "descrição específica e executável",
          "responsavel": "Fundador | Dev | Marketing | Closer | Agente S2 | Agente S7",
          "dia": "Segunda | Terça | Quarta | Quinta | Sexta",
          "duracao": "X min | X h",
          "kpi": "como medir se foi feito",
          "impacto": "o que esta ação move",
          "dependencias": ["id da ação que precisa ser feita antes"],
          "prioridade": "Crítica | Alta | Média"
        }
      ],
      "entregaveis": ["o que deve estar pronto ao fim da semana"],
      "alertas": ["o que pode travar esta semana"]
    }
  ],
  "marcos_90_dias": [
    {"dia": 7, "marco": "...", "kpi": "..."},
    {"dia": 30, "marco": "...", "kpi": "..."},
    {"dia": 60, "marco": "...", "kpi": "..."},
    {"dia": 90, "marco": "...", "kpi": "..."}
  ],
  "kpis_monitoramento": [
    {"kpi": "...", "meta": "...", "frequencia": "Diário | Semanal | Mensal", "responsavel": "..."}
  ]
}`;

  const r = await claude(system, user, 4000);
  const planoAcoes = parseJSON(r);
  console.log(`[S1-Intel] Plano de ação: ${planoAcoes.semanas?.length || 0} semanas planejadas`);
  return { plano_acao: planoAcoes };
}

// ── REPLANEJAMENTO CONTÍNUO ───────────────────────────────────────────────────
async function replanejamento(extra) {
  const ctx = (await ctxComFatos(extra)).ctx; // v3.292: + fatos verificados

  const system = `Você é o sistema de Replanejamento Contínuo da Atlantyx.
Com base nos dados atuais vs. o que foi planejado, identifique desvios e replaneie.
Seja direto sobre o que não está funcionando. Ajuste o plano com base na realidade.
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Faça o REPLANEJAMENTO com base na situação atual:
${JSON.stringify(ctx, null, 2)}

Avalie o planejado × realizado SÓ com o que está no contexto: metas_do_ano, apuracao_margem_ano, caixa, recebiveis_vencidos,
receitas_com_previsao_vencida, receita_contratada_prevista e funil_hubspot (fatos_verificados) e o plano_estrategico_vigente, se houver.
Métricas de prospecção (respostas, reuniões, contatos/dia) que não estiverem no contexto: diga que o dado não está no sistema — não invente.

Retorne:
{
  "semaforo_geral": "Verde | Amarelo | Vermelho",
  "desvios_criticos": [
    {"metrica": "...", "planejado": "...", "realizado": "...", "desvio": "X%", "causa": "...", "acao_corretiva": "...", "prazo": "..."}
  ],
  "o_que_nao_esta_funcionando": [
    {"item": "...", "evidencia": "...", "hipotese_causa": "...", "experimento_sugerido": "..."}
  ],
  "o_que_esta_funcionando": ["..."],
  "ajustes_estrategicos": [
    {
      "ajuste": "descrição do ajuste no plano",
      "motivo": "por que ajustar",
      "impacto_esperado": "...",
      "implementar_em": "esta semana | próxima semana | este mês"
    }
  ],
  "novo_foco_semana": "qual deve ser o foco da próxima semana dado o contexto atual",
  "acoes_de_emergencia": [
    {"acao": "...", "responsavel": "...", "prazo": "48h | esta semana", "resultado_esperado": "..."}
  ],
  "previsao_revisada": {
    "receita_30d": "R$X",
    "receita_60d": "R$X",
    "receita_90d": "R$X",
    "probabilidade_meta": "X%"
  }
}`;

  const r = await claude(system, user, 3000);
  const replano = parseJSON(r);
  console.log(`[S1-Intel] Replanejamento: ${replano.semaforo_geral} — ${replano.ajustes_estrategicos?.length || 0} ajustes`);

  // Notificar se status crítico
  if (replano.semaforo_geral === 'Vermelho') {
    await whatsapp(process.env.FUNDADOR_WHATSAPP,
      `[S1 · ALERTA ESTRATÉGICO 🔴]\n\nReplanejamento identificou situação crítica.\n\nPrincipal desvio: ${replano.desvios_criticos?.[0]?.acao_corretiva || ''}\n\nAção de emergência: ${replano.acoes_de_emergencia?.[0]?.acao || ''}\n\nAcesse o painel S1 para o plano completo.`
    );
  }

  return { replanejamento: replano };
}

// ── GERADOR DE OKRs INTELIGENTE ───────────────────────────────────────────────
async function okrGerador(extra) {
  const ctx = (await ctxComFatos(extra)).ctx; // v3.292: + fatos verificados

  const system = `Você é o Agente de OKR da Atlantyx — especialista em definir objetivos ambiciosos e mensuráveis.
Gere OKRs reais para a Atlantyx com base na situação atual.
Cada KR deve ser específico, mensurável, com prazo e responsável definido.
Os OKRs devem ser ambiciosos mas atingíveis — stretch goals de 70% de confiança.
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Gere os OKRs completos para a Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "trimestre": "${_trimestreAtual()}",
  "tema_do_trimestre": "frase que resume o foco estratégico",
  "objetivos": [
    {
      "id": "O1",
      "objetivo": "declaração do objetivo — qualitativo, inspirador, claro",
      "por_que_importa": "conexão com a estratégia da empresa",
      "peso": "X% do foco do time",
      "krs": [
        {
          "id": "O1.KR1",
          "kr": "declaração mensurável do resultado-chave",
          "baseline": "valor atual",
          "meta": "valor a atingir",
          "unidade": "R$ | contratos | leads | % | NPS",
          "prazo": "DD/MM/AAAA",
          "responsavel": "Fundador | Dev | Marketing | Closer | Agente IA",
          "frequencia_checkin": "Diário | Semanal | Quinzenal",
          "como_medir": "fonte de dados para medir",
          "acoes_chave": [
            {"acao": "...", "responsavel": "...", "prazo": "DD/MM/AAAA", "impacto_kr": "direto | indireto"}
          ],
          "semaforo": "🔴 Não iniciado",
          "progresso_atual": 0
        }
      ]
    }
  ],
  "anti_objetivos": ["o que deliberadamente NÃO vamos fazer neste trimestre"],
  "dependencias_criticas": ["o que precisa acontecer fora do time para os OKRs serem possíveis"],
  "cadencia_revisao": "como e quando revisar os OKRs — semanal, quinzenal, mensal"
}`;

  const r = await claude(system, user, 4000);
  const okrs = parseJSON(r);
  console.log(`[S1-Intel] OKRs gerados: ${okrs.objetivos?.length || 0} objetivos`);
  return { okrs };
}

// ── CENÁRIOS DE FUTURO ────────────────────────────────────────────────────────
async function cenariosFuturo(extra) {
  const ctx = (await ctxComFatos(extra)).ctx; // v3.292: + fatos verificados

  const system = `Você é o Agente de Cenários Estratégicos da Atlantyx.
Projete 3 futuros possíveis para a empresa — pessimista, realista e otimista.
Para cada cenário: o que precisaria acontecer, onde a empresa estaria e o que fazer hoje para se preparar.
Retorne APENAS JSON válido.` + CONCISO + REGRAS_FATOS;

  const user = `Projete os cenários de futuro da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "horizonte": "12 meses (Abr 2026 – Mar 2027)",
  "cenarios": {
    "pessimista": {
      "nome": "nome do cenário",
      "probabilidade": "X%",
      "descricao": "como este futuro se materializa",
      "gatilhos": ["o que faria isso acontecer"],
      "empresa_em_12_meses": {
        "receita_anual": "R$X",
        "clientes": 0,
        "time": "X pessoas",
        "posicao_mercado": "...",
        "principais_problemas": ["..."]
      },
      "como_evitar": ["ação preventiva 1", "ação preventiva 2"],
      "plano_b": "o que fazer se este cenário se materializar"
    },
    "realista": {
      "nome": "...",
      "probabilidade": "X%",
      "descricao": "...",
      "gatilhos": ["..."],
      "empresa_em_12_meses": {
        "receita_anual": "R$X",
        "clientes": 0,
        "time": "X pessoas",
        "posicao_mercado": "...",
        "marcos_chave": ["..."]
      },
      "acelerador": "o que poderia levar do realista ao otimista"
    },
    "otimista": {
      "nome": "...",
      "probabilidade": "X%",
      "descricao": "...",
      "gatilhos": ["o que faria isso acontecer — eventos específicos"],
      "empresa_em_12_meses": {
        "receita_anual": "R$X",
        "clientes": 0,
        "time": "X pessoas",
        "posicao_mercado": "...",
        "proximos_passos": ["expansão 1", "produto 2", "mercado 3"]
      },
      "como_chegar_aqui": ["ação 1 para tornar este cenário mais provável"]
    }
  },
  "sinais_de_alerta": ["sinal que indica que estamos indo para o pessimista"],
  "sinais_positivos": ["sinal que indica que estamos indo para o otimista"],
  "decisao_critica_hoje": "a decisão mais importante que o fundador deve tomar AGORA para maximizar probabilidade do cenário otimista"
}`;

  const r = await claude(system, user, 3500);
  const cenarios = parseJSON(r);
  console.log(`[S1-Intel] Cenários: ${Object.keys(cenarios.cenarios || {}).length} projetados`);
  return { cenarios };
}

// ── ANÁLISE SWOT ──────────────────────────────────────────────────────────────
async function analiseSwot(extra) {
  const { diagnostico } = await diagnosticoCompleto(extra);
  return { swot: diagnostico?.swot, diagnostico };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
async function claude(system, user, maxTokens = 2000) {
  // v3.94: mais espaço (as respostas eram cortadas em 3.000 tokens → JSON inválido → tela vazia) e prazo explícito
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 150000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: Math.max(maxTokens, 6000), system, messages: [{ role: 'user', content: user }] }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Erro Claude API');
    return (d.content || []).map(c => c.text || '').join('');
  } catch (e) { if (e.name === 'AbortError') throw new Error('A IA não respondeu em 150s — tente de novo'); throw e; } finally { clearTimeout(t); }
}

// v3.94: JSON cortado no meio é consertado (fecha strings/listas/objetos abertos) em vez de virar {erro}
function _consertarJSON(t) {
  let s = t, i0 = s.indexOf('{'); if (i0 < 0) return null; s = s.slice(i0);
  for (let corte = 0; corte < 400 && s.length > 2; corte++) {
    const pilha = []; let str = false, esc = false;
    for (const ch of s) { if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
      if (ch === '"') str = true; else if (ch === '{' || ch === '[') pilha.push(ch); else if (ch === '}' || ch === ']') pilha.pop(); }
    let x = s + (str ? '"' : ''); x = x.replace(/[,:\s]+$/, '').replace(/,\s*"[^"]*"\s*$/, '');
    x += pilha.reverse().map(c => c === '{' ? '}' : ']').join('');
    try { return JSON.parse(x); } catch (_) {}
    s = s.replace(/[,{[]?[^,{[\]}]*$/, ''); // recua até o último elemento completo
  }
  return null;
}
function parseJSON(text) {
  const t = String(text || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const match = t.match(/\{[\s\S]*\}/); if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
  const c = _consertarJSON(t); if (c) { c._incompleto = true; return c; }
  return { erro: 'JSON inválido', raw: t.substring(0, 300) };
}

async function whatsapp(phone, message) {
  if (!phone || !process.env.ZAPI_INSTANCE) return;
  try {
    await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone, message }),
    });
  } catch (e) { console.log('[WA]', e.message); }
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
// v3.293: trimestre corrente (antes fixo "Q2 2026") e o contexto com fatos para os agentes do S1-Strategy
function _trimestreAtual() { const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })), q = Math.floor(h.getMonth() / 3);
  return 'Q' + (q + 1) + ' ' + h.getFullYear() + ' (' + ['Jan-Mar', 'Abr-Jun', 'Jul-Set', 'Out-Dez'][q] + ')'; }
export { ctxComFatos, REGRAS_FATOS, _trimestreAtual };
export default comGuarda(handler, 's1-intel');
