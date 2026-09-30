// api/business-plan.js — v3.04
// Business Plan completo (DRE, fluxo de caixa 36 meses, TIR, VPL, payback, margens, cenários)
//
//  • POR IDEIA: a IA propõe as PREMISSAS a partir da ideia (título, descrição, análise S1-03,
//    documentos) e o motor determinístico (lib/bp-calc.js) calcula todo o resto. O plano fica
//    salvo e vinculado à ideia (tabela ideias → data.business_plan).
//  • ATLANTYX DINÂMICO: premissas montadas dos dados reais — DRE mensal do QuickBooks
//    (12 meses fechados), carteira contratada do Fluxo Futuro (a receber + marcos + MRR),
//    saldo de caixa atual. Recalcula a cada abertura; ajustes finos ficam em app_config.
//  • EXCEL: planilha com Resumo, Premissas, Receitas, Despesas, DRE, Fluxo de Caixa,
//    Indicadores (fórmulas IRR/NPV vivas) e Realizado (no dinâmico).
//
// POST { action, ... }
//   gerar_ideia { ideia:{id,titulo,desc,origem,cat,analise}, docs_texto?, instrucoes? }
//   recalcular  { premissas }                 → resultado sem salvar
//   salvar      { id?, titulo, premissas, ideia?, narrativa?, tipo? }
//   listar      { tipo? }  · obter { id }  · excluir { id }
//   excel       { id } | { bp }               → { base64, nome }
//   atlantyx    { overrides? }                → plano dinâmico
//   atlantyx_salvar_ajustes { overrides }     · atlantyx_snapshot { overrides? }

import ExcelJS from 'exceljs';
import { calcularBP, cenariosBP, mesesLabels } from '../lib/bp-calc.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// ── Banco ────────────────────────────────────────────────────────────────
let _sql = null, _temTabela = null;
async function getSql() {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  try {
    await _sql`CREATE TABLE IF NOT EXISTS business_plans (
      id TEXT PRIMARY KEY, tipo TEXT, titulo TEXT, ideia_id TEXT,
      premissas JSONB, narrativa JSONB, ideia JSONB, resumo JSONB,
      criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
    _temTabela = true;
  } catch (e) { console.warn('[BP] sem permissão para criar tabela — usando kv_store:', e.message); _temTabela = false; }
  try { await _sql`CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor JSONB, atualizado_em TIMESTAMPTZ DEFAULT NOW())`; } catch (_) {}
  return _sql;
}

function resumoDe(res) {
  const i = res.indicadores, u = res.anos[res.anos.length - 1] || {};
  return { tir_anual: i.tir_anual, vpl: i.vpl, payback_simples_meses: i.payback_simples_meses, exposicao_maxima_caixa: i.exposicao_maxima_caixa,
    receita_total: i.receita_total, receita_ultimo_ano: u.receita_bruta, margem_ebitda_ultimo_ano: u.margem_ebitda, viavel: i.viavel };
}

async function salvarBP({ id, tipo = 'ideia', titulo, premissas, narrativa = {}, ideia = null }) {
  const sql = await getSql();
  const bpId = id || ('bp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const res = calcularBP(premissas);
  const resumo = resumoDe(res);
  const ideiaId = ideia?.id ? String(ideia.id) : null;
  const reg = { id: bpId, tipo, titulo: titulo || ideia?.titulo || 'Business Plan', ideia_id: ideiaId, premissas, narrativa, ideia, resumo };
  if (_temTabela) {
    await sql`INSERT INTO business_plans (id, tipo, titulo, ideia_id, premissas, narrativa, ideia, resumo, atualizado_em)
      VALUES (${bpId}, ${tipo}, ${reg.titulo}, ${ideiaId}, ${JSON.stringify(premissas)}, ${JSON.stringify(narrativa)}, ${JSON.stringify(ideia)}, ${JSON.stringify(resumo)}, NOW())
      ON CONFLICT (id) DO UPDATE SET titulo = EXCLUDED.titulo, premissas = EXCLUDED.premissas, narrativa = EXCLUDED.narrativa,
        ideia = COALESCE(EXCLUDED.ideia, business_plans.ideia), resumo = EXCLUDED.resumo, atualizado_em = NOW()`;
  } else {
    await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${'bp:' + bpId}, ${JSON.stringify({ ...reg, atualizado_em: new Date().toISOString() })}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
  }
  // "Assina" a ideia: grava o vínculo do plano dentro do cadastro da ideia (pipeline S1)
  if (tipo === 'ideia' && ideia?.titulo) {
    try {
      const idIdeia = ideiaId || ('ideia_' + Date.now());
      const atual = await sql`SELECT data FROM ideias WHERE id = ${idIdeia} LIMIT 1`.catch(() => []);
      const base = atual[0]?.data || { id: idIdeia, titulo: ideia.titulo, desc: ideia.desc || '', origem: ideia.origem || '', categoria: ideia.cat || '', stage: 'Viabilidade' };
      base.business_plan = { id: bpId, atualizado_em: new Date().toISOString(), ...resumo };
      if (ideia.analise && !base.analise) base.analise = { score: ideia.analise.score, recomendacao: ideia.analise.recomendacao, resumo: ideia.analise.resumo_executivo };
      await sql`INSERT INTO ideias (id, titulo, status, data, atualizado_em) VALUES (${idIdeia}, ${base.titulo || ideia.titulo}, ${base.stage || 'Viabilidade'}, ${JSON.stringify(base)}, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, atualizado_em = NOW()`;
      reg.ideia_id = idIdeia;
      if (!ideiaId) {
        const ideiaNova = { ...(ideia || {}), id: idIdeia };
        if (_temTabela) await sql`UPDATE business_plans SET ideia_id = ${idIdeia}, ideia = ${JSON.stringify(ideiaNova)} WHERE id = ${bpId}`;
        reg.ideia = ideiaNova;
      }
    } catch (e) { console.warn('[BP] vínculo com a ideia falhou:', e.message); }
  }
  return { ...reg, resultado: { ...res, cenarios: cenariosBP(premissas) } };
}

async function obterBP(id) {
  const sql = await getSql();
  let reg = null;
  if (_temTabela) { const r = await sql`SELECT * FROM business_plans WHERE id = ${id} LIMIT 1`; reg = r[0] || null; }
  if (!reg) { const r = await sql`SELECT value FROM kv_store WHERE key = ${'bp:' + id} LIMIT 1`.catch(() => []); reg = r[0]?.value ? (typeof r[0].value === 'string' ? JSON.parse(r[0].value) : r[0].value) : null; }
  if (!reg) throw new Error('Business plan não encontrado');
  return { ...reg, resultado: { ...calcularBP(reg.premissas), cenarios: cenariosBP(reg.premissas) } };
}

async function listarBP({ tipo } = {}) {
  const sql = await getSql();
  let lista = [];
  if (_temTabela) {
    lista = tipo ? await sql`SELECT id, tipo, titulo, ideia_id, resumo, criado_em, atualizado_em FROM business_plans WHERE tipo = ${tipo} ORDER BY atualizado_em DESC LIMIT 200`
                 : await sql`SELECT id, tipo, titulo, ideia_id, resumo, criado_em, atualizado_em FROM business_plans ORDER BY atualizado_em DESC LIMIT 200`;
  }
  const kv = await sql`SELECT value FROM kv_store WHERE key LIKE 'bp:%' ORDER BY updated_at DESC LIMIT 200`.catch(() => []);
  for (const k of kv) { const v = typeof k.value === 'string' ? JSON.parse(k.value) : k.value; if (v && (!tipo || v.tipo === tipo) && !lista.some(x => x.id === v.id)) lista.push({ id: v.id, tipo: v.tipo, titulo: v.titulo, ideia_id: v.ideia_id, resumo: v.resumo, atualizado_em: v.atualizado_em }); }
  return lista;
}

async function excluirBP(id) {
  const sql = await getSql();
  if (_temTabela) await sql`DELETE FROM business_plans WHERE id = ${id}`;
  await sql`DELETE FROM kv_store WHERE key = ${'bp:' + id}`.catch(() => {});
  return { excluido: id };
}

// ── IA: premissas a partir da ideia ─────────────────────────────────────
function parseJSON(text) {
  const t = String(text || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.substring(i, j + 1)); } catch (_) {} }
  return null;
}

async function gerarPremissasIA({ ideia, docs_texto, instrucoes }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const a = ideia.analise || {};
  const docs = (Array.isArray(docs_texto) ? docs_texto : []).map(d => `--- ${d.nome} ---\n${String(d.texto || '').substring(0, 12000)}`).join('\n\n').substring(0, 30000);
  const system = `Você é o CFO e analista de novos negócios da Atlantyx — empresa brasileira B2B de BI, Engenharia de Dados e IA que atende grandes empresas (energia, varejo, indústria), com time enxuto e parte da equipe como PJ.
Sua tarefa: montar as PREMISSAS de um business plan de 36 meses para a ideia. Um motor determinístico vai calcular DRE, fluxo de caixa, TIR, VPL e payback a partir das suas premissas — então os números precisam ser concretos, realistas para o mercado brasileiro e conservadores.
Responda SOMENTE com um JSON válido, sem texto antes ou depois, neste formato:
{
 "resumo_executivo": "4-6 linhas: o negócio, para quem, como ganha dinheiro, por que agora",
 "modelo_negocio": "como a receita é gerada (assinatura, setup, projeto, success fee...)",
 "premissas": {
  "meses": 36, "taxa_desconto_anual": 15, "deducoes_pct": 16.33, "ir_csll_pct": 0, "prazo_recebimento_dias": 30, "crescimento_perpetuidade_pct": 3,
  "receitas": [ {"nome":"...", "tipo":"recorrente", "preco": 0, "clientes_iniciais": 0, "novos_mes": [0,0,0], "churn_mensal_pct": 0, "reajuste_anual_pct": 5, "mes_inicio": 1} ],
  "custos_variaveis": [ {"nome":"...", "pct_receita": 0} ],
  "pessoal": [ {"cargo":"...", "qtd": 1, "salario": 0, "encargos_pct": 0, "mes_inicio": 1, "reajuste_anual_pct": 5} ],
  "despesas_fixas": [ {"nome":"...", "valor_mensal": 0, "mes_inicio": 1, "reajuste_anual_pct": 5} ],
  "marketing": {"pct_receita": 0, "fixo_mensal": 0},
  "investimentos": [ {"descricao":"...", "valor": 0, "mes": 1, "depreciacao_meses": 60} ]
 },
 "justificativas": {"receitas":"de onde vêm preço e volume", "custos":"...", "investimentos":"...", "tributos":"regime e alíquotas"},
 "riscos": ["..."],
 "marcos": ["Mês 1-3: ...", "..."],
 "kpis_acompanhamento": ["..."]
}
Regras:
- Valores em R$. "preco" é MENSAL para tipo "recorrente" e por venda para "unico" (setup, licença, projeto fechado).
- "novos_mes" = novos clientes POR MÊS em cada ano [ano1, ano2, ano3] (pode ser fracionado, ex.: 0.5 = um a cada 2 meses). "mes_inicio" = mês em que começa a vender (depois do desenvolvimento).
- Tributos: Lucro Presumido serviços → deducoes_pct ≈ 16.33 (PIS 0,65 + COFINS 3 + ISS 5 + IRPJ 4,8 + CSLL 2,88) e ir_csll_pct 0. Se fizer mais sentido Lucro Real → deducoes_pct ≈ 14.25 e ir_csll_pct 34.
- Pessoal PJ: encargos_pct 0; CLT: encargos_pct ≈ 70. Inclua o custo do time que vai construir e operar (dev, dados, CS, vendas), mesmo que parcial.
- Inclua custos de nuvem/APIs de IA/licenças como custo variável ou despesa fixa; comissão de vendas como custo variável.
- Investimentos: desenvolvimento do MVP/produto, equipamentos, etc. (mês 1..36).
- Se os documentos trouxerem números (preço, volume, custo, sócios, contrato), USE-OS e diga na justificativa.
- Seja conservador: B2B enterprise tem ciclo de venda longo.`;
  const user = `IDEIA: ${ideia.titulo}
Categoria: ${ideia.cat || '-'} · Origem: ${ideia.origem || '-'}
Descrição: ${ideia.desc || '-'}
${a.score != null ? `Análise S1-03: score ${a.score}/10 · ${a.recomendacao || ''} — ${a.resumo_executivo || ''}\nMercado: ${a.mercado || ''}\nViabilidade financeira: ${a.viabilidade_financeira || ''}\nPrazo: ${a.prazo_desenvolvimento || ''}` : ''}
${instrucoes ? `\nORIENTAÇÕES DO FUNDADOR: ${instrucoes}` : ''}
${docs ? `\nDOCUMENTOS DE APOIO:\n${docs}` : ''}`;
  const body = { model: MODEL, max_tokens: 7000, system, messages: [{ role: 'user', content: user }] };
  let ultimoErro = null;
  for (let t = 0; t < 2; t++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { ultimoErro = new Error('IA: ' + (d?.error?.message || r.status)); continue; }
    const j = parseJSON((d.content || []).map(c => c.text || '').join(''));
    if (j?.premissas?.receitas?.length) return j;
    ultimoErro = new Error('A IA não devolveu premissas válidas');
  }
  throw ultimoErro;
}

// ── Atlantyx dinâmico: dados reais ──────────────────────────────────────
async function finCall(action, params = {}) {
  const mod = await import('./financeiro.js');
  let out = null;
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; },
    send(b) { try { out = JSON.parse(b); } catch (_) { out = { raw: b }; } return this; }, setHeader() {}, end() { return this; } };
  await mod.default({ method: 'POST', body: { action, params }, query: {}, headers: {} }, res);
  if (!out?.success) throw new Error(out?.error || ('falha em ' + action));
  return out;
}

const RX = {
  imposto: /impost|tribut|\biss\b|\bpis\b|cofins|simples nacional|\bdas\b|irpj|csll|darf/i,
  pessoal: /sal[aá]ri|folha|pr[oó][ -]?labore|encargo|inss|fgts|f[eé]rias|13[ºo°]|d[eé]cimo|benef[ií]c|vale[ -]|plano de sa[uú]de|pessoal|rescis|consultor|prestador|\bpj\b|terceir|freela/i,
  marketing: /marketing|publicidad|propaganda|an[uú]nci|\bads\b|linkedin|metricool|evento|patroc|m[ií]dia/i,
};

async function lerAjustes() {
  try { const sql = await getSql(); const r = await sql`SELECT valor FROM app_config WHERE chave = 'bp_atlantyx_ajustes' LIMIT 1`; return r[0]?.valor || {}; } catch (_) { return {}; }
}

async function planoAtlantyx({ overrides } = {}) {
  const salvos = await lerAjustes();
  const ov = { ...salvos, ...(overrides || {}) };
  const avisos = [];
  const [dreR, fluxoR] = await Promise.allSettled([finCall('dre_mensal', { meses: 12 }), finCall('fluxo_futuro', { meses: 12 })]);
  const dre = dreR.status === 'fulfilled' ? dreR.value : null;
  const fluxo = fluxoR.status === 'fulfilled' ? fluxoR.value : null;
  if (!dre?.disponivel) avisos.push('DRE do QuickBooks indisponível' + (dreR.reason ? ': ' + dreR.reason.message : (dre?.motivo ? ': ' + dre.motivo : '')) + ' — custos e receita base usam valores padrão.');
  if (!fluxo) avisos.push('Fluxo Futuro indisponível' + (fluxoR.reason ? ': ' + fluxoR.reason.message : '') + ' — carteira contratada zerada.');

  const N = 36, inicio = mesAtual(), labels = mesesLabels(inicio, N);
  const hm = dre?.meses || [];
  const G = dre?.grupos || {};
  const serieG = g => hm.map(m => Number(G[g]?.[m] || 0));
  const recHist = serieG('Income');
  const recTotHist = recHist.reduce((s, v) => s + v, 0);
  const nH = Math.max(1, hm.length);
  const media = (arr, k) => { const a = arr.slice(-k); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; };
  const rec6 = media(recHist, 6), rec12 = media(recHist, 12);
  const prev6 = recHist.length >= 12 ? recHist.slice(0, 6).reduce((s, v) => s + v, 0) : 0;
  const last6 = recHist.slice(-6).reduce((s, v) => s + v, 0);
  const gHist = prev6 > 0 ? Math.pow(last6 / prev6, 2) - 1 : null;
  const gDef = gHist == null ? 20 : Math.max(0, Math.min(50, Math.round(gHist * 100)));

  // Classificação das contas da DRE
  const inflacao = Number(ov.inflacao_pct ?? 5);
  let impostos = 0, cogs = 0;
  const pes = [], mkt = [], ger = [];
  for (const c of (dre?.contas || [])) {
    if (!['Expenses', 'COGS', 'OtherExpenses'].includes(c.grupo)) continue;
    const tot = Object.values(c.valores || {}).reduce((s, v) => s + Number(v || 0), 0);
    if (Math.abs(tot) < 1) continue;
    if (RX.imposto.test(c.nome)) { impostos += tot; continue; }
    if (c.grupo === 'COGS') { cogs += tot; continue; }
    const item = { nome: c.nome, valor_mensal: r2(tot / nH), total_12m: r2(tot) };
    if (RX.pessoal.test(c.nome)) pes.push(item); else if (RX.marketing.test(c.nome)) mkt.push(item); else ger.push(item);
  }
  const agrupar = (lista, limite, nomeResto, grupo) => {
    const ord = lista.filter(x => x.valor_mensal > 0).sort((a, b) => b.valor_mensal - a.valor_mensal);
    const top = ord.slice(0, limite), resto = ord.slice(limite);
    const out = top.map(x => ({ nome: x.nome, valor_mensal: x.valor_mensal, reajuste_anual_pct: inflacao, grupo }));
    const vr = resto.reduce((s, x) => s + x.valor_mensal, 0);
    if (vr > 0) out.push({ nome: nomeResto + ` (${resto.length} contas)`, valor_mensal: r2(vr), reajuste_anual_pct: inflacao, grupo });
    return out;
  };
  const despesas = [...agrupar(pes, 8, 'Outros gastos com pessoal', 'pessoal'), ...agrupar(mkt, 4, 'Outros gastos de marketing', 'marketing'), ...agrupar(ger, 12, 'Outras despesas', 'geral')];
  for (const d of (Array.isArray(ov.despesas_extras) ? ov.despesas_extras : [])) despesas.push({ ...d, grupo: d.grupo || 'geral' });

  const dedCalc = recTotHist > 0 && impostos > 0 ? Math.min(30, impostos / recTotHist * 100) : null;
  if (dedCalc == null) avisos.push('Nenhuma conta de impostos identificada na DRE — deduções estimadas em 16,33% (Lucro Presumido).');
  const cvCalc = recTotHist > 0 ? Math.max(0, cogs / recTotHist * 100) : 0;

  // Receita: carteira contratada (sistema) + receita nova para atingir a meta de crescimento
  const L = fluxo?.linhas || {}, FM = fluxo?.meses || [];
  const contratada = labels.map(m => FM.includes(m) ? ['+ A Receber QB', '+ Receita Prevista (marcos)', '+ Receita Recorrente (MRR)'].reduce((s, k) => s + Number(L[k]?.[m] || 0), 0) : 0);
  const cresc = Array.isArray(ov.crescimento_pct) ? ov.crescimento_pct.map(Number) : [gDef, gDef, gDef];
  const base = Number(ov.receita_base_mensal || 0) || rec6 || rec12;
  if (!base) avisos.push('Sem histórico de receita — informe a "receita base mensal" nos ajustes.');
  let alvo = base;
  const metas = labels.map((_, m) => { const g = Number(cresc[Math.min(Math.floor(m / 12), cresc.length - 1)] || 0) / 100; alvo *= Math.pow(1 + g, 1 / 12); return alvo; });
  const aConquistar = metas.map((v, m) => r2(Math.max(0, v - contratada[m])));

  const premissas = {
    titulo: 'Business Plan Atlantyx (dinâmico)', inicio, meses: N,
    taxa_desconto_anual: Number(ov.taxa_desconto_anual ?? 15),
    deducoes_pct: r2(Number(ov.deducoes_pct ?? dedCalc ?? 16.33)),
    ir_csll_pct: Number(ov.ir_csll_pct ?? 0),
    prazo_recebimento_dias: Number(ov.prazo_recebimento_dias ?? 0),
    crescimento_perpetuidade_pct: Number(ov.crescimento_perpetuidade_pct ?? 3),
    saldo_inicial: r2(Number(ov.saldo_inicial ?? fluxo?.saldo_inicial_atual ?? 0)),
    receitas: [
      { nome: 'Carteira contratada (a receber + marcos + MRR)', tipo: 'serie', valores: contratada.map(r2) },
      { nome: 'Receita nova a conquistar (meta de crescimento)', tipo: 'serie', valores: aConquistar },
      ...(Array.isArray(ov.receitas_extras) ? ov.receitas_extras : []),
    ],
    custos_variaveis: [{ nome: 'Custo dos serviços (histórico QB)', pct_receita: r2(Number(ov.custo_variavel_pct ?? cvCalc)) }],
    pessoal: Array.isArray(ov.contratacoes) ? ov.contratacoes : [],
    despesas_fixas: despesas,
    marketing: { pct_receita: Number(ov.marketing_pct_receita ?? 0), fixo_mensal: 0 },
    investimentos: Array.isArray(ov.investimentos) ? ov.investimentos : [],
  };
  const resultado = { ...calcularBP(premissas), cenarios: cenariosBP(premissas) };
  const histDespesas = hm.map((m, k) => r2(Number(G.Expenses?.[m] || 0) + Number(G.OtherExpenses?.[m] || 0)));
  return {
    tipo: 'atlantyx', titulo: 'Business Plan Atlantyx (dinâmico)', premissas, resultado,
    atualizado_em: new Date().toISOString(), ajustes: ov, avisos,
    diagnostico: {
      receita_media_6m: r2(rec6), receita_media_12m: r2(rec12), receita_12m: r2(recTotHist),
      crescimento_historico_anual: gHist, crescimento_usado_pct: cresc,
      deducoes_calculadas_pct: dedCalc == null ? null : r2(dedCalc), custo_variavel_calculado_pct: r2(cvCalc),
      carteira_contratada_12m: r2(contratada.reduce((s, v) => s + v, 0)),
      despesas_programadas_12m: r2(Object.values(L['− Despesas Programadas'] || {}).reduce((s, v) => s + Number(v || 0), 0)),
      despesa_media_mensal_hist: r2(histDespesas.reduce((s, v) => s + v, 0) / nH),
      saldo_caixa_atual: fluxo?.saldo_inicial_atual ?? null,
      contas_classificadas: { pessoal: pes.length, marketing: mkt.length, gerais: ger.length },
    },
    historico: { meses: hm, receita: recHist.map(r2), custos: serieG('COGS').map(r2), despesas: histDespesas, lucro: serieG('NetIncome').map(r2), periodo: dre?.periodo || null },
  };
}

// ── Excel ────────────────────────────────────────────────────────────────
function colL(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
const FMT = '#,##0.00;[Red]-#,##0.00', PCT = '0.0%';
const AZUL = 'FF1A3A8F', CINZA = 'FFF2F4F8';

async function gerarExcel(bp) {
  const res = bp.resultado || calcularBP(bp.premissas);
  const p = res.premissas, N = res.meses.length, nA = res.anos.length;
  const nar = bp.narrativa || {};
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Atlantyx OS'; wb.created = new Date();
  const C0 = 2, colM = m => C0 + m, colA = a => C0 + N + 1 + a, colT = C0 + N + 1 + nA;
  const rng = (row, a) => `${colL(colM(a * 12))}${row}:${colL(colM(Math.min(N, a * 12 + 12) - 1))}${row}`;
  const rngAll = row => `${colL(colM(0))}${row}:${colL(colM(N - 1))}${row}`;
  const cab = (ws, titulo, sub) => {
    ws.getCell('A1').value = titulo; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: AZUL } };
    ws.getCell('A2').value = sub || ''; ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  };
  const headerMeses = (ws, row) => {
    const r = ws.getRow(row);
    r.getCell(1).value = 'R$';
    res.meses.forEach((m, k) => { r.getCell(colM(k)).value = m; });
    res.anos.forEach((a, k) => { r.getCell(colA(k)).value = 'Ano ' + a.ano; });
    r.getCell(colT).value = 'Total';
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; c.alignment = { horizontal: 'center' }; });
    ws.getColumn(1).width = 44;
    for (let c = 2; c <= colT; c++) ws.getColumn(c).width = 14;
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: row }];
  };
  // linha com valores mensais (ou fórmulas) + anuais e total por SUM
  const linha = (ws, row, rotulo, mensal, { formula, negrito, pct, estoque, fundo } = {}) => {
    const r = ws.getRow(row);
    r.getCell(1).value = rotulo;
    for (let m = 0; m < N; m++) {
      const cell = r.getCell(colM(m));
      const f = formula ? formula(m, colL(colM(m))) : null;
      cell.value = f ? { formula: f, result: mensal ? mensal[m] : undefined } : (mensal ? mensal[m] : null);
      cell.numFmt = pct ? PCT : FMT;
    }
    for (let a = 0; a < nA; a++) {
      const cell = r.getCell(colA(a));
      const ultimo = Math.min(N, a * 12 + 12) - 1;
      if (pct) cell.value = pct(colL(colA(a)));
      else cell.value = { formula: estoque ? `${colL(colM(ultimo))}${row}` : `SUM(${rng(row, a)})` };
      cell.numFmt = pct ? PCT : FMT;
    }
    const t = r.getCell(colT);
    t.value = pct ? pct(colL(colT)) : { formula: estoque ? `${colL(colM(N - 1))}${row}` : `SUM(${rngAll(row)})` };
    t.numFmt = pct ? PCT : FMT;
    if (negrito) r.font = { bold: true };
    if (fundo) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } }; });
    return row;
  };

  // ── Resumo (preenchido no fim, mas criado primeiro para ser a 1ª aba)
  const wsR = wb.addWorksheet('Resumo');
  const wsP = wb.addWorksheet('Premissas');
  const wsRec = wb.addWorksheet('Receitas');
  const wsD = wb.addWorksheet('Despesas');
  const wsDRE = wb.addWorksheet('DRE');
  const wsF = wb.addWorksheet('Fluxo de Caixa');
  const wsI = wb.addWorksheet('Indicadores');

  // ── Premissas
  cab(wsP, 'Premissas do Business Plan', 'Altere os parâmetros globais em azul: DRE, Fluxo e Indicadores recalculam. Linhas de receita/custos detalhadas estão abaixo.');
  wsP.getColumn(1).width = 46; wsP.getColumn(2).width = 18; [3, 4, 5, 6, 7, 8].forEach(c => { wsP.getColumn(c).width = 16; });
  const glob = [
    ['Início do plano', p.inicio || res.meses[0], null],
    ['Horizonte (meses)', N, '0'],
    ['Taxa de desconto (TMA) anual', p.taxa_desconto_anual / 100, PCT],
    ['Deduções sobre a receita (impostos)', p.deducoes_pct / 100, PCT],
    ['IR/CSLL sobre o lucro (Lucro Real)', p.ir_csll_pct / 100, PCT],
    ['Prazo médio de recebimento (dias)', p.prazo_recebimento_dias, '0'],
    ['Crescimento na perpetuidade', p.crescimento_perpetuidade_pct / 100, PCT],
    ['Saldo de caixa inicial', p.saldo_inicial || 0, FMT],
  ];
  const REF = {};
  glob.forEach(([k, v, f], i) => {
    const row = 4 + i; wsP.getCell(`A${row}`).value = k; const c = wsP.getCell(`B${row}`); c.value = v; if (f) c.numFmt = f;
    c.font = { color: { argb: 'FF1F4FFF' }, bold: true };
  });
  REF.taxa = "Premissas!$B$6"; REF.ded = "Premissas!$B$7"; REF.saldo = "Premissas!$B$11";
  let pr = 14;
  const tabela = (titulo, cols, linhas) => {
    wsP.getCell(`A${pr}`).value = titulo; wsP.getCell(`A${pr}`).font = { bold: true, color: { argb: AZUL } }; pr++;
    const h = wsP.getRow(pr); cols.forEach((c, i) => { h.getCell(i + 1).value = c[0]; }); h.font = { bold: true }; h.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } }; }); pr++;
    if (!linhas.length) { wsP.getCell(`A${pr}`).value = '(nenhum)'; pr++; }
    linhas.forEach(l => { const r = wsP.getRow(pr); cols.forEach((c, i) => { const v = c[1](l); r.getCell(i + 1).value = v; if (typeof v === 'number') r.getCell(i + 1).numFmt = (typeof c[2] === 'function' ? c[2](l) : c[2]) || FMT; }); pr++; });
    pr++;
  };
  const somaSerie = l => (l.valores || []).reduce((s, v) => s + Number(v || 0), 0);
  tabela('RECEITAS', [['Linha', l => l.nome], ['Tipo', l => l.tipo || 'recorrente'], ['Preço (R$)', l => l.tipo === 'serie' ? null : Number(l.preco || 0)], ['Novos/mês ano 1', l => Array.isArray(l.novos_mes) ? Number(l.novos_mes[0] || 0) : null, '0.0'],
    ['Novos/mês ano 2', l => Array.isArray(l.novos_mes) ? Number(l.novos_mes[1] ?? l.novos_mes[0] ?? 0) : null, '0.0'], ['Novos/mês ano 3', l => Array.isArray(l.novos_mes) ? Number(l.novos_mes[2] ?? l.novos_mes[1] ?? 0) : null, '0.0'],
    ['Churn mensal', l => l.tipo === 'serie' ? null : Number(l.churn_mensal_pct || 0) / 100, PCT], ['Início (mês) / Total série', l => l.tipo === 'serie' ? somaSerie(l) : Number(l.mes_inicio || 1), '#,##0']], p.receitas);
  tabela('CUSTOS VARIÁVEIS', [['Custo', l => l.nome], ['% da receita bruta', l => Number(l.pct_receita || 0) / 100, PCT]], p.custos_variaveis);
  tabela('PESSOAL', [['Cargo', l => l.cargo], ['Qtd', l => Number(l.qtd || 1), '0.0'], ['Salário/valor mensal', l => Number(l.salario || 0)], ['Encargos', l => Number(l.encargos_pct || 0) / 100, PCT], ['Mês início', l => Number(l.mes_inicio || 1), '0'], ['Reajuste anual', l => Number(l.reajuste_anual_pct || 0) / 100, PCT]], p.pessoal);
  tabela('DESPESAS FIXAS', [['Despesa', l => l.nome], ['Grupo', l => l.grupo || 'geral'], ['Valor mensal', l => l.tipo === 'serie' ? null : Number(l.valor_mensal || 0)], ['Mês início', l => Number(l.mes_inicio || 1), '0'], ['Reajuste anual', l => Number(l.reajuste_anual_pct || 0) / 100, PCT]], p.despesas_fixas);
  tabela('MARKETING E VENDAS', [['Parâmetro', l => l.k], ['Valor', l => l.v, l => l.f]], [{ k: '% da receita', v: Number(p.marketing?.pct_receita || 0) / 100, f: PCT }, { k: 'Fixo mensal (R$)', v: Number(p.marketing?.fixo_mensal || 0) }].map(x => ({ ...x })));
  tabela('INVESTIMENTOS', [['Descrição', l => l.descricao], ['Valor', l => Number(l.valor || 0)], ['Mês', l => Number(l.mes || 1), '0'], ['Depreciação (meses)', l => Number(l.depreciacao_meses || 0), '0']], p.investimentos);
  if (nar.justificativas) {
    wsP.getCell(`A${pr}`).value = 'JUSTIFICATIVAS DAS PREMISSAS'; wsP.getCell(`A${pr}`).font = { bold: true, color: { argb: AZUL } }; pr++;
    for (const [k, v] of Object.entries(nar.justificativas)) { wsP.getCell(`A${pr}`).value = k; wsP.getCell(`B${pr}`).value = String(v || ''); wsP.mergeCells(`B${pr}:H${pr}`); wsP.getCell(`B${pr}`).alignment = { wrapText: true, vertical: 'top' }; wsP.getRow(pr).height = 45; pr++; }
  }

  // ── Receitas
  cab(wsRec, 'Receitas', 'Receita bruta por linha de negócio · clientes ativos (recorrente)');
  headerMeses(wsRec, 4);
  let rr = 5; const recRows = [];
  for (const l of res.linhas.receitas) { recRows.push(linha(wsRec, rr++, l.nome, l.valores)); }
  const recTot = linha(wsRec, rr++, 'RECEITA BRUTA TOTAL', res.mensal.receita_bruta, { formula: (m, c) => recRows.length ? `SUM(${c}${recRows[0]}:${c}${recRows[recRows.length - 1]})` : '0', negrito: true, fundo: true });
  rr++;
  if (res.linhas.clientes.length) {
    wsRec.getCell(`A${rr++}`).value = 'CLIENTES ATIVOS (fim do mês)';
    for (const l of res.linhas.clientes) {
      const r = wsRec.getRow(rr++); r.getCell(1).value = l.nome;
      l.clientes.forEach((v, m) => { r.getCell(colM(m)).value = v; r.getCell(colM(m)).numFmt = '0.0'; });
    }
    const r = wsRec.getRow(rr++); r.getCell(1).value = 'MRR (receita recorrente mensal)';
    res.mensal.mrr.forEach((v, m) => { r.getCell(colM(m)).value = v; r.getCell(colM(m)).numFmt = FMT; });
  }

  // ── Despesas
  cab(wsD, 'Custos e Despesas', 'Valores negativos = saída');
  headerMeses(wsD, 4);
  let dr = 5; const SUB = {};
  const secao = (chave, titulo, linhas) => {
    wsD.getCell(`A${dr}`).value = titulo; wsD.getCell(`A${dr}`).font = { bold: true, color: { argb: AZUL } }; dr++;
    const rows = linhas.map(l => linha(wsD, dr++, '   ' + l.nome, l.valores));
    SUB[chave] = linha(wsD, dr++, 'Subtotal ' + titulo.toLowerCase(), res.mensal[chave], { formula: (m, c) => rows.length ? `SUM(${c}${rows[0]}:${c}${rows[rows.length - 1]})` : '0', negrito: true, fundo: true });
    dr++;
  };
  secao('custos_variaveis', 'CUSTOS VARIÁVEIS', res.linhas.custos_variaveis);
  secao('pessoal', 'PESSOAL', res.linhas.pessoal);
  secao('marketing', 'MARKETING E VENDAS', res.linhas.marketing);
  secao('despesas_fixas', 'DESPESAS GERAIS E ADMINISTRATIVAS', res.linhas.despesas_fixas);

  // ── DRE
  cab(wsDRE, 'DRE — Demonstração do Resultado', `${res.meses[0]} a ${res.meses[N - 1]} · mensal e anual`);
  headerMeses(wsDRE, 4);
  const M = res.mensal; const D = {};
  let r = 5;
  const ref = (sheet, row) => (m, c) => `'${sheet}'!${c}${row}`;
  D.rb = linha(wsDRE, r++, 'RECEITA BRUTA', M.receita_bruta, { formula: ref('Receitas', recTot), negrito: true });
  D.ded = linha(wsDRE, r++, '(-) Deduções / impostos sobre a receita', M.deducoes, { formula: (m, c) => `-${c}${D.rb}*${REF.ded}` });
  D.rl = linha(wsDRE, r++, '= RECEITA LÍQUIDA', M.receita_liquida, { formula: (m, c) => `${c}${D.rb}+${c}${D.ded}`, negrito: true, fundo: true });
  D.cv = linha(wsDRE, r++, '(-) Custos variáveis', M.custos_variaveis, { formula: ref('Despesas', SUB.custos_variaveis) });
  D.lb = linha(wsDRE, r++, '= LUCRO BRUTO', M.lucro_bruto, { formula: (m, c) => `${c}${D.rl}+${c}${D.cv}`, negrito: true, fundo: true });
  D.pes = linha(wsDRE, r++, '(-) Pessoal', M.pessoal, { formula: ref('Despesas', SUB.pessoal) });
  D.mkt = linha(wsDRE, r++, '(-) Marketing e vendas', M.marketing, { formula: ref('Despesas', SUB.marketing) });
  D.ger = linha(wsDRE, r++, '(-) Despesas gerais e administrativas', M.despesas_fixas, { formula: ref('Despesas', SUB.despesas_fixas) });
  D.ebitda = linha(wsDRE, r++, '= EBITDA', M.ebitda, { formula: (m, c) => `${c}${D.lb}+${c}${D.pes}+${c}${D.mkt}+${c}${D.ger}`, negrito: true, fundo: true });
  D.dep = linha(wsDRE, r++, '(-) Depreciação / amortização', M.depreciacao);
  D.ebit = linha(wsDRE, r++, '= EBIT (resultado operacional)', M.ebit, { formula: (m, c) => `${c}${D.ebitda}+${c}${D.dep}`, negrito: true });
  D.ir = linha(wsDRE, r++, '(-) IR/CSLL (com compensação de prejuízo 30%)', M.ir_csll);
  D.ll = linha(wsDRE, r++, '= LUCRO LÍQUIDO', M.lucro_liquido, { formula: (m, c) => `${c}${D.ebit}+${c}${D.ir}`, negrito: true, fundo: true });
  r++;
  const pctF = (num, den) => c => ({ formula: `IFERROR(${c}${num}/${c}${den},0)` });
  const pctRow = (rot, numR, denR) => { const row = r++; const rw = wsDRE.getRow(row); rw.getCell(1).value = rot;
    for (let m = 0; m < N; m++) { const c = colL(colM(m)); rw.getCell(colM(m)).value = { formula: `IFERROR(${c}${numR}/${c}${denR},0)` }; rw.getCell(colM(m)).numFmt = PCT; }
    for (let a = 0; a <= nA; a++) { const col = a < nA ? colA(a) : colT; rw.getCell(col).value = pctF(numR, denR)(colL(col)); rw.getCell(col).numFmt = PCT; }
    rw.font = { italic: true }; return row; };
  D.mb = pctRow('Margem bruta', D.lb, D.rb);
  D.me = pctRow('Margem EBITDA', D.ebitda, D.rb);
  D.ml = pctRow('Margem líquida', D.ll, D.rb);

  // ── Fluxo de Caixa
  cab(wsF, 'Fluxo de Caixa Projetado', 'Método indireto · 36 meses');
  headerMeses(wsF, 4);
  const F = {}; r = 5;
  F.ll = linha(wsF, r++, 'Lucro líquido', M.lucro_liquido, { formula: ref('DRE', D.ll) });
  F.dep = linha(wsF, r++, '(+) Depreciação (não é saída de caixa)', M.depreciacao.map(v => -v), { formula: (m, c) => `-'DRE'!${c}${D.dep}` });
  F.giro = linha(wsF, r++, '(-) Variação do capital de giro (recebíveis)', M.var_capital_giro);
  F.fco = linha(wsF, r++, '= FLUXO DE CAIXA OPERACIONAL', M.fco, { formula: (m, c) => `${c}${F.ll}+${c}${F.dep}+${c}${F.giro}`, negrito: true, fundo: true });
  F.inv = linha(wsF, r++, '(-) Investimentos (CAPEX)', M.investimentos);
  F.fcl = linha(wsF, r++, '= FLUXO DE CAIXA LIVRE', M.fcl, { formula: (m, c) => `${c}${F.fco}+${c}${F.inv}`, negrito: true, fundo: true });
  F.ac = linha(wsF, r++, 'Fluxo livre acumulado', M.fcl_acumulado, { formula: (m, c) => m === 0 ? `${c}${F.fcl}` : `${colL(colM(m - 1))}${r - 1}+${c}${F.fcl}`, estoque: true });
  F.cx = linha(wsF, r++, 'SALDO DE CAIXA (com saldo inicial)', M.caixa, { formula: (m, c) => `${REF.saldo}+${c}${F.ac}`, estoque: true, negrito: true });
  F.desc = linha(wsF, r++, 'Fluxo livre descontado (TMA)', M.fcl_descontado, { formula: (m, c) => `${c}${F.fcl}/(1+Indicadores!$B$6)^${m}` });

  // ── Indicadores
  const I = res.indicadores;
  cab(wsI, 'Indicadores de Viabilidade', 'TIR e VPL são fórmulas vivas sobre o fluxo de caixa livre');
  wsI.getColumn(1).width = 46; wsI.getColumn(2).width = 20; wsI.getColumn(3).width = 60;
  const fclRange = `'Fluxo de Caixa'!${colL(colM(0))}${F.fcl}:${colL(colM(N - 1))}${F.fcl}`;
  const fclRange2 = `'Fluxo de Caixa'!${colL(colM(1))}${F.fcl}:${colL(colM(N - 1))}${F.fcl}`;
  const fcl0 = `'Fluxo de Caixa'!${colL(colM(0))}${F.fcl}`;
  const ind = [
    ['Taxa de desconto (TMA) anual', { formula: REF.taxa, result: I.taxa_desconto_anual }, PCT, 'Custo de oportunidade do capital'],
    ['Taxa de desconto mensal', { formula: '(1+B5)^(1/12)-1', result: I.taxa_desconto_mensal }, '0.000%', ''],
    ['TIR mensal', I.tir_mensal == null ? 'n/a' : { formula: `IRR(${fclRange})`, result: I.tir_mensal }, '0.00%', I.tir_mensal == null ? 'Sem troca de sinal no fluxo (não há investimento a recuperar ou nunca se paga)' : ''],
    ['TIR anual', I.tir_anual == null ? 'n/a' : { formula: '(1+B7)^12-1', result: I.tir_anual }, '0.0%', 'Viável quando TIR > TMA'],
    ['VPL (valor presente líquido) — 36 meses', { formula: `${fcl0}+NPV(B6,${fclRange2})`, result: I.vpl }, FMT, 'Viável quando VPL > 0'],
    ['Valor terminal (perpetuidade, Gordon)', I.valor_terminal ?? 'n/a', FMT, 'FCL do último ano × (1+g)/(TMA−g)'],
    ['VPL com perpetuidade (valuation DCF)', I.vpl_com_perpetuidade ?? 'n/a', FMT, ''],
    ['Payback simples (meses)', I.payback_simples_meses ?? 'não se paga no horizonte', '0', ''],
    ['Payback descontado (meses)', I.payback_descontado_meses ?? 'não se paga no horizonte', '0', ''],
    ['Exposição máxima de caixa (capital necessário)', I.exposicao_maxima_caixa, FMT, 'Maior necessidade acumulada de caixa'],
    ['Menor saldo de caixa', I.menor_saldo_caixa, FMT, 'Mês: ' + (I.mes_menor_saldo || '')],
    ['Investimento total (CAPEX)', I.investimento_total, FMT, ''],
    ['ROI do período (FCL total / exposição)', I.roi_periodo ?? 'n/a', '0.0%', ''],
    ['Índice de lucratividade', I.indice_lucratividade ?? 'n/a', '0.00', '(VPL + exposição) / exposição'],
    ['Break-even EBITDA (mês)', I.break_even_ebitda_mes ? `${I.break_even_ebitda_mes} (${I.break_even_ebitda_label})` : 'não atinge', null, 'Primeiro mês com EBITDA positivo sustentado'],
    ['Ponto de equilíbrio — receita mensal (ano final)', I.ponto_equilibrio_receita_mensal ?? 'n/a', FMT, 'Custos fixos mensais / margem de contribuição'],
    ['Receita total no período', { formula: `'DRE'!${colL(colT)}${D.rb}`, result: I.receita_total }, FMT, ''],
    ['EBITDA total no período', { formula: `'DRE'!${colL(colT)}${D.ebitda}`, result: I.ebitda_total }, FMT, ''],
    ['Lucro líquido total no período', { formula: `'DRE'!${colL(colT)}${D.ll}`, result: I.lucro_liquido_total }, FMT, ''],
    ['CAC (custo de aquisição por cliente)', I.cac ?? 'n/a', FMT, 'Marketing e vendas / novos clientes'],
    ['LTV (valor do cliente no tempo)', I.ltv ?? 'n/a', FMT, 'Ticket × margem bruta / churn'],
    ['LTV / CAC', I.ltv_cac ?? 'n/a', '0.0"x"', 'Saudável acima de 3x'],
    ['Clientes ativos no fim', I.clientes_final, '0', ''],
    ['MRR no fim do período', I.mrr_final, FMT, ''],
    ['Conclusão', I.viavel ? 'VIÁVEL (VPL > 0 e TIR > TMA)' : 'NÃO VIÁVEL nas premissas atuais', null, ''],
  ];
  ind.forEach(([k, v, f, obs], i) => {
    const row = 5 + i; wsI.getCell(`A${row}`).value = k; const c = wsI.getCell(`B${row}`); c.value = v; if (f && typeof v !== 'string') c.numFmt = f;
    wsI.getCell(`C${row}`).value = obs; wsI.getCell(`C${row}`).font = { size: 9, color: { argb: 'FF666666' } };
  });
  wsI.getCell(`B${5 + ind.length - 1}`).font = { bold: true, color: { argb: I.viavel ? 'FF0A8F4A' : 'FFC62828' } };
  let ir2 = 5 + ind.length + 2;
  wsI.getCell(`A${ir2}`).value = 'MARGENS POR ANO'; wsI.getCell(`A${ir2}`).font = { bold: true, color: { argb: AZUL } }; ir2++;
  res.anos.forEach((a, k) => {
    const c = colL(colA(k));
    wsI.getCell(`A${ir2}`).value = `Ano ${a.ano} — bruta / EBITDA / líquida`;
    [[D.mb, a.margem_bruta], [D.me, a.margem_ebitda], [D.ml, a.margem_liquida]].forEach(([row, v], j) => {
      const cell = wsI.getRow(ir2).getCell(2 + j); cell.value = { formula: `'DRE'!${c}${row}`, result: v || 0 }; cell.numFmt = PCT; });
    ir2++;
  });
  if (res.cenarios) {
    ir2++; wsI.getCell(`A${ir2}`).value = 'CENÁRIOS'; wsI.getCell(`A${ir2}`).font = { bold: true, color: { argb: AZUL } }; ir2++;
    const h = wsI.getRow(ir2++); ['Cenário', 'TIR anual', 'VPL', 'Payback (meses)', 'Exposição máx.', 'Receita total'].forEach((t, j) => { h.getCell(1 + j).value = t; }); h.font = { bold: true };
    for (const [nome, c] of Object.entries(res.cenarios)) {
      const rw = wsI.getRow(ir2++);
      rw.getCell(1).value = nome + ` (vol ×${c.fatores.fatorVolume}, preço ×${c.fatores.fatorPreco}, custo ×${c.fatores.fatorCusto})`;
      rw.getCell(2).value = c.tir_anual == null ? 'n/a' : c.tir_anual; rw.getCell(2).numFmt = PCT;
      rw.getCell(3).value = c.vpl; rw.getCell(3).numFmt = FMT;
      rw.getCell(4).value = c.payback_simples_meses ?? '—';
      rw.getCell(5).value = c.exposicao_maxima_caixa; rw.getCell(5).numFmt = FMT;
      rw.getCell(6).value = c.receita_total; rw.getCell(6).numFmt = FMT;
    }
  }

  // ── Realizado (dinâmico)
  if (bp.historico?.meses?.length) {
    const wsH = wb.addWorksheet('Realizado 12m');
    cab(wsH, 'Realizado — QuickBooks (DRE dos últimos meses fechados)', bp.historico.periodo ? `${bp.historico.periodo.inicio} a ${bp.historico.periodo.fim}` : '');
    const H = bp.historico; const hr = wsH.getRow(4); hr.getCell(1).value = 'R$';
    H.meses.forEach((m, k) => { hr.getCell(2 + k).value = m; }); hr.getCell(2 + H.meses.length).value = 'Total'; hr.font = { bold: true };
    wsH.getColumn(1).width = 30; for (let c = 2; c <= 2 + H.meses.length; c++) wsH.getColumn(c).width = 14;
    [['Receita', H.receita], ['Custos (COGS)', H.custos], ['Despesas', H.despesas], ['Lucro líquido', H.lucro]].forEach(([k, arr], i) => {
      const rw = wsH.getRow(5 + i); rw.getCell(1).value = k;
      arr.forEach((v, j) => { rw.getCell(2 + j).value = v; rw.getCell(2 + j).numFmt = FMT; });
      rw.getCell(2 + arr.length).value = { formula: `SUM(B${5 + i}:${colL(1 + arr.length)}${5 + i})` }; rw.getCell(2 + arr.length).numFmt = FMT;
    });
  }

  // ── Resumo
  cab(wsR, bp.titulo || 'Business Plan', `Atlantyx OS · gerado em ${new Date().toLocaleDateString('pt-BR')} · horizonte ${N} meses a partir de ${res.meses[0]}`);
  wsR.getColumn(1).width = 40; for (let c = 2; c <= 6; c++) wsR.getColumn(c).width = 18;
  let rs = 4;
  const bloco = (titulo, texto) => { if (!texto) return; wsR.getCell(`A${rs}`).value = titulo; wsR.getCell(`A${rs}`).font = { bold: true, color: { argb: AZUL } }; rs++;
    wsR.getCell(`A${rs}`).value = String(texto); wsR.mergeCells(`A${rs}:F${rs}`); wsR.getCell(`A${rs}`).alignment = { wrapText: true, vertical: 'top' };
    wsR.getRow(rs).height = Math.min(300, 15 * Math.ceil(String(texto).length / 110) + 6); rs += 2; };
  if (bp.ideia?.desc) bloco('A IDEIA', bp.ideia.desc);
  bloco('RESUMO EXECUTIVO', nar.resumo_executivo);
  bloco('MODELO DE NEGÓCIO', nar.modelo_negocio);
  wsR.getCell(`A${rs}`).value = 'INDICADORES-CHAVE'; wsR.getCell(`A${rs}`).font = { bold: true, color: { argb: AZUL } }; rs++;
  [['TIR anual', 'Indicadores!B8', PCT], ['VPL (TMA ' + p.taxa_desconto_anual + '% a.a.)', 'Indicadores!B9', FMT], ['Payback simples (meses)', 'Indicadores!B12', '0'],
   ['Exposição máxima de caixa', 'Indicadores!B14', FMT], ['Break-even EBITDA', 'Indicadores!B19', null], ['Conclusão', `Indicadores!B${5 + ind.length - 1}`, null]].forEach(([k, f, fmt]) => {
    wsR.getCell(`A${rs}`).value = k; const c = wsR.getCell(`B${rs}`); c.value = { formula: f }; if (fmt) c.numFmt = fmt; c.font = { bold: true }; rs++; });
  rs++;
  wsR.getCell(`A${rs}`).value = 'DRE E CAIXA POR ANO'; wsR.getCell(`A${rs}`).font = { bold: true, color: { argb: AZUL } }; rs++;
  const hR = wsR.getRow(rs++); hR.getCell(1).value = 'R$'; res.anos.forEach((a, k) => { hR.getCell(2 + k).value = 'Ano ' + a.ano; }); hR.getCell(2 + nA).value = 'Total'; hR.font = { bold: true };
  [['Receita bruta', 'DRE', D.rb], ['Receita líquida', 'DRE', D.rl], ['Lucro bruto', 'DRE', D.lb], ['EBITDA', 'DRE', D.ebitda], ['Lucro líquido', 'DRE', D.ll],
   ['Fluxo de caixa livre', 'Fluxo de Caixa', F.fcl], ['Saldo de caixa (fim)', 'Fluxo de Caixa', F.cx], ['Margem EBITDA', 'DRE', D.me], ['Margem líquida', 'DRE', D.ml]].forEach(([k, sh, row]) => {
    const rw = wsR.getRow(rs++); rw.getCell(1).value = k;
    for (let a = 0; a <= nA; a++) { const col = a < nA ? colA(a) : colT; const c = rw.getCell(2 + a); c.value = { formula: `'${sh}'!${colL(col)}${row}` }; c.numFmt = /Margem/.test(k) ? PCT : FMT; }
  });
  rs++;
  if (Array.isArray(nar.riscos) && nar.riscos.length) bloco('RISCOS', nar.riscos.map(x => '• ' + x).join('\n'));
  if (Array.isArray(nar.marcos) && nar.marcos.length) bloco('MARCOS', nar.marcos.map(x => '• ' + x).join('\n'));
  if (Array.isArray(nar.kpis_acompanhamento) && nar.kpis_acompanhamento.length) bloco('KPIs DE ACOMPANHAMENTO', nar.kpis_acompanhamento.map(x => '• ' + x).join('\n'));
  if (Array.isArray(bp.avisos) && bp.avisos.length) bloco('OBSERVAÇÕES SOBRE OS DADOS', bp.avisos.map(x => '• ' + x).join('\n'));
  wb.calcProperties = { fullCalcOnLoad: true };
  const buf = await wb.xlsx.writeBuffer();
  const nome = 'BusinessPlan_' + String(bp.titulo || 'plano').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').substring(0, 50) + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  return { base64: Buffer.from(buf).toString('base64'), nome };
}

// ── Handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Use POST' });
  const b = req.body || {};
  try {
    const acoes = {
      gerar_ideia: async () => {
        const ideia = b.ideia || {};
        if (!ideia.titulo) throw new Error('Informe a ideia (título e descrição)');
        const ia = await gerarPremissasIA({ ideia, docs_texto: b.docs_texto, instrucoes: b.instrucoes });
        const premissas = { ...ia.premissas, inicio: b.inicio || mesAtual(), meses: 36, titulo: ideia.titulo };
        const narrativa = { resumo_executivo: ia.resumo_executivo, modelo_negocio: ia.modelo_negocio, justificativas: ia.justificativas, riscos: ia.riscos, marcos: ia.marcos, kpis_acompanhamento: ia.kpis_acompanhamento, modelo_ia: MODEL };
        const ideiaSalva = { id: ideia.id || null, titulo: ideia.titulo, desc: ideia.desc, origem: ideia.origem, cat: ideia.cat, analise: ideia.analise ? { score: ideia.analise.score, recomendacao: ideia.analise.recomendacao, resumo_executivo: ideia.analise.resumo_executivo } : null };
        return { bp: await salvarBP({ id: b.id, tipo: 'ideia', titulo: ideia.titulo, premissas, narrativa, ideia: ideiaSalva }) };
      },
      recalcular: async () => ({ resultado: { ...calcularBP(b.premissas || {}), cenarios: cenariosBP(b.premissas || {}) } }),
      salvar: async () => ({ bp: await salvarBP({ id: b.id, tipo: b.tipo || 'ideia', titulo: b.titulo, premissas: b.premissas, narrativa: b.narrativa || {}, ideia: b.ideia || null }) }),
      listar: async () => ({ lista: await listarBP({ tipo: b.tipo }) }),
      obter: async () => ({ bp: await obterBP(b.id) }),
      excluir: async () => excluirBP(b.id),
      excel: async () => {
        let bp = b.bp;
        if (b.id) bp = await obterBP(b.id);
        else if (b.atlantyx) bp = await planoAtlantyx({ overrides: b.overrides });
        if (!bp?.premissas) throw new Error('Nada para exportar');
        if (!bp.resultado) bp.resultado = { ...calcularBP(bp.premissas), cenarios: cenariosBP(bp.premissas) };
        return await gerarExcel(bp);
      },
      atlantyx: async () => ({ bp: await planoAtlantyx({ overrides: b.overrides }) }),
      atlantyx_salvar_ajustes: async () => {
        const sql = await getSql();
        await sql`INSERT INTO app_config (chave, valor, atualizado_em) VALUES ('bp_atlantyx_ajustes', ${JSON.stringify(b.overrides || {})}, NOW())
          ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
        return { bp: await planoAtlantyx({}) };
      },
      atlantyx_snapshot: async () => {
        const bp = await planoAtlantyx({ overrides: b.overrides });
        const salvo = await salvarBP({ tipo: 'atlantyx', titulo: 'Atlantyx — fotografia ' + new Date().toLocaleDateString('pt-BR'), premissas: bp.premissas, narrativa: { diagnostico: bp.diagnostico, avisos: bp.avisos } });
        return { snapshot: { id: salvo.id, titulo: salvo.titulo } };
      },
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida: ' + b.action, disponiveis: Object.keys(acoes) });
    const out = await acoes[b.action]();
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    console.error('[business-plan]', b.action, e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}

export { gerarExcel, planoAtlantyx };
