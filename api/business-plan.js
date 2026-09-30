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

import { calcularBP, cenariosBP, mesesLabels } from '../lib/bp-calc.js';
import { gerarExcel, lerPremissasExcel } from '../lib/bp-excel.js';

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

async function salvarBP({ id, tipo = 'ideia', titulo, premissas, narrativa = {}, ideia = null, vincularIdeia = true }) {
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
  if (tipo === 'ideia' && ideia?.titulo && vincularIdeia) {
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

// ── Excel: lib/bp-excel.js (modelo vivo com fórmulas + importação) ─────────

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
      // v3.07: salvar (mesmo id) ou salvar como cópia (novo id); planos dinâmicos salvos viram editáveis
      salvar: async () => {
        if (!b.premissas) throw new Error('Nada para salvar');
        const copia = !!b.copia;
        const titulo = copia ? (b.titulo || 'Business Plan') + ' (cópia)' : b.titulo;
        return { bp: await salvarBP({ id: copia ? null : b.id, tipo: b.tipo || 'ideia', titulo, premissas: b.premissas, narrativa: b.narrativa || {}, ideia: copia ? (b.ideia ? { ...b.ideia, _copia: true } : null) : (b.ideia || null), vincularIdeia: !copia }) };
      },
      // v3.07: importa as premissas de um Excel baixado e editado — recalcula e grava no mesmo plano
      importar_excel: async () => {
        if (!b.base64) throw new Error('Envie o arquivo .xlsx');
        let atual = null;
        if (b.id) { try { atual = await obterBP(b.id); } catch (_) {} }
        const premissas = await lerPremissasExcel(b.base64, atual?.premissas || b.premissas || {});
        if (!b.salvar) return { premissas, resultado: { ...calcularBP(premissas), cenarios: cenariosBP(premissas) } };
        const bp = await salvarBP({ id: atual?.id || null, tipo: atual?.tipo || b.tipo || 'ideia', titulo: atual?.titulo || b.titulo || 'Business Plan (importado)', premissas,
          narrativa: { ...(atual?.narrativa || b.narrativa || {}), importado_excel_em: new Date().toISOString() }, ideia: atual?.ideia || b.ideia || null });
        return { bp };
      },
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
