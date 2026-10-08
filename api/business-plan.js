import { comGuarda } from '../lib/qa-guard.js';
import { salvarHistorico } from '../lib/historico-s1.js';
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
import { aplicarOperacoes, impactoPorOperacao, checarCoerencia, sensibilidades } from '../lib/bp-ops.js';
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
  // v3.116: contraproposta editada e salva na tela do business plan — os indicadores da contraproposta (narrativa.depois)
  // são recalculados e o card da ideia é atualizado; antes o bloco Contraproposta continuava mostrando os números antigos
  if (tipo === 'contraproposta' && id) {
    try {
      const ind = _ind(res);
      if (narrativa && typeof narrativa === 'object') { narrativa.depois = ind; narrativa.anos_depois = _anosResumo(res); narrativa.editada_em = new Date().toISOString(); }
      if (_temTabela) await sql`UPDATE business_plans SET narrativa = ${JSON.stringify(narrativa)} WHERE id = ${bpId}`;
      if (ideiaId) { const r = await sql`SELECT data FROM ideias WHERE id = ${ideiaId} LIMIT 1`; const d = r[0]?.data; if (d) { const o = typeof d === 'string' ? JSON.parse(d) : d;
        if (o.contraproposta_bp?.id === bpId) { o.contraproposta_bp = { ...o.contraproposta_bp, atualizado_em: new Date().toISOString(), viavel_depois: ind.viavel, vpl_depois: ind.vpl, tir_depois: ind.tir_anual };
          await sql`UPDATE ideias SET data = ${JSON.stringify(o)}, atualizado_em = NOW() WHERE id = ${ideiaId}`; } } }
    } catch (e) { console.warn('[BP] atualizar contraproposta salva:', e.message); }
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
  return { ...reg, salvo_em: new Date().toISOString(), indicadores: _ind(res), resultado: { ...res, cenarios: cenariosBP(premissas) } };
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
- Valores em R$. "preco" é MENSAL para tipo "recorrente", por venda para "unico" (setup, licença, projeto fechado) e o valor do pagamento para "marco" (pagamento único contratual, cobrado UMA vez no mes_inicio — use para marcos de entrega, sinal, bônus de primeiro cliente). Se houver moeda estrangeira, converta para R$ e diga a cotação na justificativa.
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
    social_pct: Number(ov.social_pct ?? 5), // v3.93: indicador social (5% do faturamento)
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

// ── v3.44: CONTRAPROPOSTA com business plan ─────────────────────────────
// Lê o último BP da ideia, entende se é viável e monta um NOVO plano (a contraproposta): se o BP não é
// rentável, a IA muda as alavancas comerciais até ele ficar rentável; se já é, melhora para a Atlantyx sem
// tornar o acordo ruim para a outra parte. O motor determinístico recalcula e confere — até 3 rodadas.
const _ind = r => { const i = r.indicadores || {}; return { tir_anual: i.tir_anual, vpl: i.vpl, payback_meses: i.payback_simples_meses, exposicao_maxima_caixa: i.exposicao_maxima_caixa,
  receita_total: i.receita_total, lucro_liquido_total: i.lucro_liquido_total, ebitda_total: i.ebitda_total, break_even_ebitda_mes: i.break_even_ebitda_mes, viavel: !!i.viavel, taxa_desconto_anual: i.taxa_desconto_anual }; };
const _anosResumo = r => (r.anos || []).map(a => ({ ano: a.ano, receita_bruta: a.receita_bruta, ebitda: a.ebitda, lucro_liquido: a.lucro_liquido, fcl: a.fcl, caixa_final: a.caixa_final, margem_ebitda: a.margem_ebitda == null ? null : Math.round(a.margem_ebitda * 1000) / 10 }));
const _melhor = (a, b) => (b.viavel && !a.viavel) || (b.viavel === a.viavel && (b.vpl || -Infinity) > (a.vpl || -Infinity));

async function _bpBaseDaIdeia({ bp_id, ideia }) {
  const sql = await getSql();
  // v3.94: bp_id apagado/inválido não derruba mais com 500 — cai na busca pela ideia
  if (bp_id) { try { return await obterBP(bp_id); } catch (e) { console.warn('[BP contraproposta] bp_id', bp_id, 'indisponível:', e.message); } }
  const iid = ideia?.id ? String(ideia.id) : null;
  if (iid) {
    try { const r = await sql`SELECT data FROM ideias WHERE id = ${iid} LIMIT 1`; const d = r[0]?.data; const id = (typeof d === 'string' ? JSON.parse(d) : d)?.business_plan?.id; if (id) return obterBP(id); } catch (_) {}
    if (_temTabela) { const r = await sql`SELECT id FROM business_plans WHERE ideia_id = ${iid} AND COALESCE(tipo,'ideia') <> 'contraproposta' ORDER BY atualizado_em DESC LIMIT 1`; if (r[0]) return obterBP(r[0].id); }
  }
  if (ideia?.titulo && _temTabela) { const r = await sql`SELECT id FROM business_plans WHERE lower(titulo) = lower(${String(ideia.titulo)}) AND COALESCE(tipo,'ideia') <> 'contraproposta' ORDER BY atualizado_em DESC LIMIT 1`; if (r[0]) return obterBP(r[0].id); }
  return null;
}

const _erro = (msg, status) => Object.assign(new Error(msg), { status });
// v3.103: o que mudou de VERDADE nas premissas (calculado, não descrito pela IA) — linha a linha, por nome
const _SECOES_LISTA = { receitas: 'Receitas', pessoal: 'Pessoal', despesas_fixas: 'Despesas fixas', custos_variaveis: 'Custos variáveis', investimentos: 'Investimentos' };
const _ESCALARES = { taxa_desconto_anual: 'Taxa de desconto anual (%)', deducoes_pct: 'Impostos sobre a receita (%)', ir_csll_pct: 'IR/CSLL (%)', prazo_recebimento_dias: 'Prazo de recebimento (dias)', social_pct: 'Ações sociais (% do faturamento)' };
const _CUSTOS = new Set(['pessoal', 'despesas_fixas', 'custos_variaveis', 'investimentos', 'marketing']);
function _diffPremissas(a = {}, b = {}) {
  const out = []; const norm = v => String(v || '').trim().toLowerCase();
  const val = v => Array.isArray(v) ? (v.every(x => typeof x === 'number' || !isNaN(+x)) ? v.map(Number) : null) : (typeof v === 'number' || (v !== '' && v != null && !isNaN(+v) && typeof v !== 'boolean')) ? Number(v) : null;
  const igual = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  for (const [sec, rot] of Object.entries(_SECOES_LISTA)) {
    const la = Array.isArray(a[sec]) ? a[sec] : [], lb = Array.isArray(b[sec]) ? b[sec] : [];
    const chave = (x, i) => norm(x?.nome || x?.cargo || x?.descricao) || '#' + i;
    const ma = new Map(la.map((x, i) => [chave(x, i), x])), mb = new Map(lb.map((x, i) => [chave(x, i), x]));
    for (const [k, xb] of mb) {
      const xa = ma.get(k); const nome = xb?.nome || xb?.cargo || xb?.descricao || k;
      if (!xa) { out.push({ secao: sec, rotulo: rot, item: nome, campo: 'linha', de: null, para: 'incluída', tipo: 'incluida' }); continue; }
      for (const campo of new Set([...Object.keys(xa), ...Object.keys(xb)])) {
        if (['nome', 'cargo', 'descricao', 'obs', 'justificativa'].includes(campo)) continue;
        const va = val(xa[campo]), vb = val(xb[campo]);
        if (va == null && vb == null) { if (!igual(xa[campo], xb[campo]) && typeof (xb[campo] ?? xa[campo]) !== 'object') out.push({ secao: sec, rotulo: rot, item: nome, campo, de: xa[campo] ?? null, para: xb[campo] ?? null }); continue; }
        if (!igual(va, vb)) out.push({ secao: sec, rotulo: rot, item: nome, campo, de: va, para: vb });
      }
    }
    for (const [k, xa] of ma) if (!mb.has(k)) out.push({ secao: sec, rotulo: rot, item: xa?.nome || xa?.cargo || k, campo: 'linha', de: 'existia', para: null, tipo: 'removida' });
  }
  const ma = a.marketing || {}, mb = b.marketing || {};
  for (const campo of new Set([...Object.keys(ma), ...Object.keys(mb)])) { const va = val(ma[campo]), vb = val(mb[campo]); if (!igual(va, vb)) out.push({ secao: 'marketing', rotulo: 'Marketing', item: 'Marketing', campo, de: va, para: vb }); }
  for (const [k, rot] of Object.entries(_ESCALARES)) { const va = val(a[k]), vb = val(b[k]); if (!igual(va, vb) && !(va == null && vb == null)) out.push({ secao: k, rotulo: rot, item: rot, campo: k, de: va, para: vb }); }
  return out.slice(0, 60);
}
// só cortes de custo (nada de receita mexido) → o VPL não pode cair; se cair, o cálculo partiu do lugar errado
function _soCortesDeCusto(diff) {
  if (!diff.length) return false;
  return diff.every(d => _CUSTOS.has(d.secao) && (d.tipo === 'removida' || (typeof d.de === 'number' && typeof d.para === 'number' && d.para <= d.de) || (Array.isArray(d.de) && Array.isArray(d.para) && d.para.every((v, i) => v <= (d.de[i] ?? v)))));
}
async function contrapropostaBP({ ideia, bp_id = null, oferta = '', docs_texto = [], instrucoes = '', instrucoes_novas = '', destinatario = 'Parceiro', partir_de_id = null, cambio_eur = null, do_zero = false }) {
  // v3.94: validação de entrada — antes ideia nula / documento malformado viravam HTTP 500 sem explicação
  if (!ideia || typeof ideia !== 'object' || Array.isArray(ideia)) ideia = {};
  if (!ideia.titulo && !bp_id) throw _erro('Abra ou analise uma ideia antes de gerar a contraproposta.', 400);
  destinatario = String(destinatario || 'Parceiro').substring(0, 60);
  docs_texto = (Array.isArray(docs_texto) ? docs_texto : []).filter(d => d && typeof d === 'object').map(d => ({ nome: String(d.nome || 'documento').substring(0, 200), texto: d.texto }));
  if (!process.env.ANTHROPIC_API_KEY) throw _erro('ANTHROPIC_API_KEY não configurada', 503);
  const base = await _bpBaseDaIdeia({ bp_id, ideia });
  if (!base?.premissas) { const e = new Error('Esta ideia ainda não tem business plan — gere o business plan primeiro (a contraproposta parte dele).'); e.status = 409; throw e; }
  const p0 = base.premissas; const i0 = _ind(base.resultado);
  // v3.62: AJUSTE de uma contraproposta já gerada — parte dela (e não do zero), aplicando as orientações do fundador
  let anterior = null;
  if (partir_de_id && !do_zero) { try { const a = await obterBP(partir_de_id); if (a?.premissas) anterior = a; } catch (_) {} }
  // v3.115: "recalcular do zero" = parte do plano ORIGINAL e aplica a lista consolidada de condições como operações
  // (antes um recálculo partindo de uma contraproposta quebrada herdava o erro e devolvia os mesmos números)
  if (do_zero && String(instrucoes_novas || instrucoes || '').trim()) anterior = { id: null, premissas: p0, resultado: base.resultado, narrativa: { estrategia: 'plano original (recálculo do zero)' } };
  // v3.103: no AJUSTE o ponto de partida é a contraproposta anterior (não o plano original) — antes as seções que a IA
  // não devolvia voltavam para o plano ORIGINAL e as alavancas já negociadas se perdiam (ex.: só cortar despesas e o VPL cair)
  const pIni = anterior ? anterior.premissas : p0;
  const iIni = anterior ? _ind(anterior.resultado) : i0;
  const novas = String(instrucoes_novas || '').trim();
  const t0 = Date.now();
  const instr = String(instrucoes || '').trim();
  const cambio = parseFloat(String(cambio_eur || '').replace(',', '.')) || null;
  const objetivo = i0.viavel ? 'MELHORAR' : 'TORNAR_VIAVEL';
  const docs = (Array.isArray(docs_texto) ? docs_texto : []).map(d => `--- ${d.nome} ---\n${String(d.texto || '').substring(0, 15000)}`).join('\n\n').substring(0, 40000);
  const system = `Você é o CFO e o negociador-chefe da Atlantyx (empresa brasileira B2B de dados, BI e IA). Você recebe o BUSINESS PLAN atual de uma oportunidade (premissas que um motor determinístico usa para calcular DRE, fluxo de caixa de 36 meses, TIR, VPL e payback) e monta a CONTRAPROPOSTA: um novo conjunto de premissas que reflete as condições que a Atlantyx vai propor à outra parte.
Objetivo:
- Se o plano atual NÃO é viável (VPL <= 0 ou TIR abaixo da taxa de desconto): mude as alavancas até ficar viável para a Atlantyx, com folga (VPL claramente positivo e payback dentro do horizonte).
- Se o plano atual JÁ é viável: melhore o resultado da Atlantyx (VPL, TIR, payback, menor exposição de caixa) SEM tornar o acordo ruim para a outra parte.
- Sempre busque o melhor para AMBAS as partes: cada pedido da Atlantyx deve vir com uma contrapartida ou um ganho claro para o outro lado. Nada de propostas que a outra parte não aceitaria.
Alavancas típicas (use as que fazem sentido com a oferta e os documentos): % de revenue share; pagamentos de marco (tipo "marco" = pagamento único no mes_inicio) — sinal na assinatura, entrega do MVP, primeiro cliente; mínimo garantido mensal; mensalidade de manutenção/sustentação; antecipar o início da receita; reajuste; dividir custos de nuvem/infra; reduzir escopo/equipe do MVP (pessoal/investimentos); prazo de exclusividade; volume mínimo. NÃO invente volume de clientes otimista só para fechar a conta: mudanças em novos_mes, churn ou clientes precisam de justificativa concreta (ex.: compromisso de volume da outra parte).
ORIENTAÇÕES DO FUNDADOR (quando houver) são CONDIÇÕES OBRIGATÓRIAS, não sugestões: cada uma TEM de aparecer nas premissas (ex.: "na fase de desenvolvimento recebemos só 300 euros/mês referentes a 50% da infra" = uma linha de receita recorrente/fixa com esse valor convertido em R$, só nos meses dessa fase, e nenhuma outra receita da outra parte nesse período além do que o fundador disse). Nunca troque, aumente ou remova uma orientação do fundador para fechar a conta; se com ela o plano não fica viável, ajuste OUTRAS alavancas e, se ainda assim não fechar, diga isso no diagnóstico. Em "alteracoes" inclua uma linha para cada orientação do fundador mostrando como foi aplicada.
Valores em outra moeda (euro, dólar) são convertidos para R$ — use o câmbio informado; sem câmbio informado, use um câmbio conservador e diga qual em "alteracoes".
Em "premissas_alteradas" devolva SÓ as seções que mudam (cada seção que mudar vem COMPLETA, com todas as linhas, inclusive as que ficam iguais); as seções que você não incluir continuam como no plano atual. Seja conciso nos textos (listas com no máximo 6 itens, frases curtas, mensagem com no máximo 1.800 caracteres) — a resposta precisa caber inteira.
Mantenha a mesma estrutura de premissas (mesmos campos), valores em R$, meses = ${p0.meses || 36}. Tipos de receita: "recorrente" (preço mensal × clientes ativos), "unico" (preço × novas vendas/mês), "marco" (preço pago UMA vez no mes_inicio).
Responda SOMENTE com JSON válido:
{
 "diagnostico_base": "por que o plano atual é (ou não) rentável, em 2-4 linhas com números",
 "estrategia": "a lógica da contraproposta em 2-3 linhas",
 "premissas_alteradas": { "receitas": [ ...lista COMPLETA de receitas da contraproposta... ], "pessoal": [ ...só se mudar... ], "investimentos": [ ...só se mudar... ], "despesas_fixas": [ ...só se mudar... ], "custos_variaveis": [ ...só se mudar... ], "marketing": {...só se mudar...}, "taxa_desconto_anual": 0 (só se mudar) },
 "alteracoes": [{"item":"o que muda","de":"valor atual","para":"valor proposto","por_que":"","efeito_atlantyx":"","efeito_contraparte":""}],
 "ganhos_contraparte": ["o que a outra parte ganha com esta contraproposta"],
 "ganhos_atlantyx": ["o que a Atlantyx ganha"],
 "contrapartidas_oferecidas": ["o que a Atlantyx dá em troca"],
 "concessoes_possiveis": ["onde ainda dá para ceder na negociação, com o limite"],
 "limites": ["o que a Atlantyx não aceita (piso)"],
 "clausulas": ["cláusulas a colocar no contrato para proteger o acordo"],
 "riscos": ["risco → mitigação"],
 "proximos_passos": ["passo com prazo"],
 "mensagem_para_enviar": "e-mail/mensagem profissional para ${destinatario.toLowerCase()} apresentando a contraproposta (em nome da Atlantyx, assinado por Fabio Quintanilha / CEO – Atlantyx)",
 "resumo_executivo": "5-7 linhas para o CEO: o que muda e por que é bom para os dois lados (SEM números de VPL/TIR/payback/exposição — o sistema mostra os calculados pelo motor)"
}`;
  const montarUser = (extra) => `IDEIA / OPORTUNIDADE: ${ideia.titulo || base.titulo || ''}
${ideia.desc ? 'Descrição: ' + String(ideia.desc).substring(0, 4000) : ''}
${ideia.analise ? 'Análise da IA: ' + JSON.stringify(ideia.analise).substring(0, 3000) : ''}
Com quem é a negociação: ${destinatario}
${oferta ? 'OFERTA / CONDIÇÕES RECEBIDAS DA OUTRA PARTE:\n' + String(oferta).substring(0, 6000) : '(sem oferta colada — use os documentos e o business plan)'}
${instr ? '══ ORIENTAÇÕES DO FUNDADOR (OBRIGATÓRIAS — aplicar todas nas premissas) ══\n' + instr.substring(0, 3000) + '\n══════' : ''}
${cambio ? 'CÂMBIO A USAR: 1 EUR = R$ ' + cambio.toFixed(2) : ''}
${anterior ? `══ MODO AJUSTE ══
CONTRAPROPOSTA ATUAL (é o PONTO DE PARTIDA — tudo o que está nela continua valendo):
${JSON.stringify(anterior.premissas).substring(0, 15000)}
Indicadores da contraproposta atual (motor): ${JSON.stringify(iIni)}
Resumo: ${String(anterior.narrativa?.estrategia || '').substring(0, 600)}
${novas ? 'AJUSTE PEDIDO AGORA (aplicar SOBRE a contraproposta atual): ' + novas.substring(0, 2000) : ''}
REGRAS DO AJUSTE (OBRIGATÓRIAS):
- NÃO devolva "premissas_alteradas". Devolva "operacoes": a lista de mudanças PONTUAIS que o sistema aplica sobre a contraproposta atual. Tudo o que você não citar fica exatamente como está.
- Formatos: {"op":"alterar","secao":"receitas|pessoal|despesas_fixas|custos_variaveis|investimentos","item":"NOME EXATO da linha (campo nome; em pessoal, o cargo)","campos":{"preco":7700}}
  {"op":"remover","secao":"...","item":"NOME EXATO"} · {"op":"incluir","secao":"...","linha":{...linha completa na mesma estrutura...}} · {"op":"marketing","campos":{"fixo_mensal":0,"pct_receita":0}} · {"op":"escalar","campo":"taxa_desconto_anual","valor":15}
- Use os NOMES EXATOS das linhas que estão na contraproposta atual. Uma operação por mudança pedida; nenhuma operação que o fundador não pediu.
- Valores são o valor FINAL (ex.: "licenças de R$ 2.200 para R$ 1.200" → {"campos":{"valor_mensal":1200}}). Moeda estrangeira: converta para R$.
- Meses (mes_inicio, mes_fim, mes) são SEMPRE contados do mês 1 do plano (nunca "mês X de vendas"). Se o fundador diz "a partir do mês 4", é mes_inicio 4.
- Setup/implantação cobrado de cada cliente novo: a linha de setup (tipo "unico") usa os MESMOS novos_mes e mes_inicio da assinatura — se mudar o ritmo de clientes ou o início das vendas, aplique nas duas linhas.
- Remover algo (ex.: piloto) = {"op":"remover"} só daquela linha; não mexa nas demais.
- Em "alteracoes" descreva cada operação em português (de → para). Não escreva números de VPL, TIR, payback ou exposição nos textos — o sistema mostra os calculados pelo motor.
══════` : ''}
BUSINESS PLAN ATUAL — premissas:
${JSON.stringify(p0).substring(0, 20000)}
Justificativas do plano atual: ${JSON.stringify(base.narrativa?.justificativas || {}).substring(0, 3000)}
INDICADORES ATUAIS (motor): ${JSON.stringify(i0)}
Por ano: ${JSON.stringify(_anosResumo(base.resultado))}
OBJETIVO: ${objetivo === 'TORNAR_VIAVEL' ? 'o plano atual NÃO é viável — torne-o viável' : 'o plano atual é viável — melhore para a Atlantyx mantendo-o bom para a outra parte'}
${docs ? '\nDOCUMENTOS DA NEGOCIAÇÃO:\n' + docs : ''}${extra ? '\n\n' + extra : ''}`;
  // v3.47: a IA devolve só as seções alteradas (antes devolvia as premissas inteiras + a análise e a resposta
  // era cortada no limite de tokens → "A IA não devolveu as premissas"). Se vier cortada, tenta de novo mais curta.
  // v3.94: cada chamada à IA tem prazo (a função tem 300s na Vercel) — estourar vira erro JSON legível (504), não queda da função
  const LIMITE_MS = 270000;
  const chamar = async (extra) => {
    let ultimoErro = null;
    for (let t = 0; t < 2; t++) {
      const resta = LIMITE_MS - (Date.now() - t0);
      if (resta < 20000) throw _erro('A IA demorou demais para montar a contraproposta — tente de novo (se persistir, cole uma oferta mais curta).', 504);
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), resta);
      let r, d;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: MODEL, max_tokens: 16000, system, messages: [{ role: 'user', content: montarUser((extra || '') + (t ? '\n\nATENÇÃO: sua resposta anterior foi cortada por ser longa demais. Devolva o JSON completo e válido, bem mais curto: textos de 1 linha, listas com até 4 itens, mensagem com até 1.000 caracteres.' : '')) }] }) });
        d = await r.json().catch(() => ({}));
      } catch (e) {
        if (e.name === 'AbortError') throw _erro('A IA demorou demais para montar a contraproposta — tente de novo (se persistir, cole uma oferta mais curta).', 504);
        throw _erro('Não consegui falar com a IA: ' + e.message, 502);
      } finally { clearTimeout(tm); }
      if (!r.ok) throw _erro('A IA recusou o pedido: ' + (d?.error?.message || 'HTTP ' + r.status) + (r.status === 400 ? ' — tente com uma oferta/documentos mais curtos.' : ''), 502);
      const txt = (d.content || []).map(c => c.text || '').join('');
      const j = parseJSON(txt);
      if (j && Array.isArray(j.operacoes) && j.operacoes.length) return j; // v3.115: ajuste por operações pontuais
      const alt = j && (j.premissas_alteradas || j.premissas || j.premissas_contraproposta || j.novas_premissas);
      if (j && alt && typeof alt === 'object' && Object.keys(alt).length) { j.premissas_alteradas = alt; return j; }
      ultimoErro = d.stop_reason === 'max_tokens' ? 'a resposta da IA foi cortada por ser longa demais' : (j ? 'a IA não indicou nenhuma alteração nas premissas' : 'a resposta da IA não veio em JSON válido');
      console.warn('[BP contraproposta] tentativa', t + 1, ultimoErro, '| stop:', d.stop_reason, '| início:', txt.substring(0, 200));
    }
    throw _erro('A IA não devolveu uma contraproposta utilizável (' + ultimoErro + '). Tente de novo; se persistir, cole uma oferta mais curta.', 502);
  };
  let melhor = null, extra = '', rodadas = 0;
  for (let k = 0; k < 3; k++) {
    if (k && Date.now() - t0 > 140000) break;
    let j; try { j = await chamar(extra); } catch (e) { if (!melhor) throw e; break; }
    rodadas++;
    // mescla: só as seções devolvidas substituem as do plano atual
    const alt = j.premissas_alteradas || {}; const permitidas = ['receitas', 'pessoal', 'investimentos', 'despesas_fixas', 'custos_variaveis', 'marketing', 'taxa_desconto_anual', 'deducoes_pct', 'ir_csll_pct', 'prazo_recebimento_dias', 'crescimento_perpetuidade_pct'];
    let premissas, ops = null;
    if (anterior && Array.isArray(j.operacoes)) {
      // v3.115: aplica as operações pontuais sobre a contraproposta atual — nada além do que foi pedido muda
      ops = aplicarOperacoes(pIni, j.operacoes);
      premissas = { ...ops.premissas, inicio: p0.inicio, meses: p0.meses || 36, titulo: p0.titulo };
      if (!ops.aplicadas.length) { extra = 'Nenhuma das operações pôde ser aplicada: ' + ops.nao_aplicadas.map(x => x.motivo).join('; ') + '. Use os NOMES EXATOS das linhas da contraproposta atual e devolva o JSON de novo.'; continue; }
    } else premissas = { ...pIni, ...Object.fromEntries(Object.entries(alt).filter(([k, v]) => permitidas.includes(k) && v != null && !(Array.isArray(v) && !v.length))), inicio: p0.inicio, meses: p0.meses || 36, titulo: p0.titulo };
    // v3.94: premissas malformadas da IA não derrubam a rota — pede de novo na próxima rodada
    let res; try { res = calcularBP(premissas); } catch (e) { console.warn('[BP contraproposta] premissas da IA inválidas:', e.message); extra = 'As premissas_alteradas que você devolveu não puderam ser calculadas (' + e.message + '). Devolva o JSON de novo respeitando exatamente a estrutura das premissas do plano atual.'; continue; }
    const ind = _ind(res);
    const cand = { j, premissas, res, ind, ops };
    if (!melhor || _melhor(melhor.ind, ind)) melhor = cand;
    // v3.103: no ajuste, aplica SÓ o que o fundador pediu (uma rodada) — nada de mexer em outras alavancas para "fechar a conta"
    if (anterior) break;
    const ok = objetivo === 'TORNAR_VIAVEL' ? ind.viavel : (ind.viavel && (ind.vpl || 0) > (i0.vpl || 0));
    if (ok) break;
    extra = `RESULTADO DA SUA PROPOSTA ANTERIOR NO MOTOR: ${JSON.stringify(ind)} — ${objetivo === 'TORNAR_VIAVEL' ? 'AINDA NÃO É VIÁVEL' : 'NÃO MELHOROU o VPL da Atlantyx'}. Ajuste as alavancas (com justificativa realista) e devolva o JSON completo de novo.${instr ? ' MANTENHA todas as ORIENTAÇÕES DO FUNDADOR exatamente como pedidas — mexa só nas outras alavancas.' : ''}`;
  }
  if (!melhor) throw _erro('A IA devolveu premissas que o motor financeiro não conseguiu calcular. Tente de novo.', 502);
  const { j, premissas, res, ind, ops } = melhor;
  const diff = _diffPremissas(pIni, premissas);
  // conferência: se só houve corte de custo e o VPL caiu, algo está errado — não entrega número incoerente
  let alerta = null;
  if (_soCortesDeCusto(diff) && (ind.vpl ?? 0) < (iIni.vpl ?? 0) - 1) alerta = 'Conferência do motor: só houve cortes de custo, mas o VPL caiu de ' + Math.round(iIni.vpl) + ' para ' + Math.round(ind.vpl) + '. Recalcule — este resultado não deve ser usado.';
  // v3.115: impacto de CADA operação no VPL (calculado pelo motor, em sequência) + conferências de coerência
  const impacto_operacoes = ops ? impactoPorOperacao(pIni, ops.aplicadas) : null;
  const coerencia = checarCoerencia(premissas);
  if (!alerta && anterior && (iIni.receita_total || 0) > 0 && (ind.receita_total || 0) < iIni.receita_total * 0.6 && !(impacto_operacoes || []).some(x => /remov/.test(x.descricao)))
    alerta = 'Conferência: a receita total caiu de ' + Math.round(iIni.receita_total).toLocaleString('pt-BR') + ' para ' + Math.round(ind.receita_total).toLocaleString('pt-BR') + ' sem nenhuma receita removida — veja abaixo qual operação causou e corrija.';
  const narrativa = { contraproposta: true, base_bp_id: base.id, base_titulo: base.titulo, objetivo, rodadas, destinatario, oferta: String(oferta || '').substring(0, 6000), instrucoes: instr.substring(0, 3000), cambio_eur: cambio, ajuste_de: anterior?.id || null,
    antes: i0, depois: ind, anterior: anterior ? iIni : null, anterior_id: anterior?.id || null, anos_antes: _anosResumo(base.resultado), anos_depois: _anosResumo(res),
    diff_premissas: diff, diff_vs_original: anterior ? _diffPremissas(p0, premissas) : diff, ajuste_aplicado: novas.substring(0, 2000) || null, alerta_consistencia: alerta,
    do_zero: !!do_zero, impacto_operacoes, operacoes_nao_aplicadas: ops ? ops.nao_aplicadas.map(x => ({ item: x.op?.item || x.op?.campo || x.op?.secao || '', motivo: x.motivo })) : null, coerencia,
    diagnostico_base: j.diagnostico_base, estrategia: j.estrategia, alteracoes: j.alteracoes || [], ganhos_contraparte: j.ganhos_contraparte || [], ganhos_atlantyx: j.ganhos_atlantyx || [],
    contrapartidas_oferecidas: j.contrapartidas_oferecidas || [], concessoes_possiveis: j.concessoes_possiveis || [], limites: j.limites || [], clausulas: j.clausulas || [], riscos: j.riscos || [],
    proximos_passos: j.proximos_passos || [], mensagem_para_enviar: j.mensagem_para_enviar || '', resumo_executivo: j.resumo_executivo || '',
    justificativas: base.narrativa?.justificativas || {}, modelo_ia: MODEL, gerado_em: new Date().toISOString() };
  const ideiaRef = { id: ideia.id || base.ideia_id || null, titulo: ideia.titulo || base.titulo };
  const bp = await salvarBP({ tipo: 'contraproposta', titulo: 'Contraproposta — ' + (ideiaRef.titulo || 'ideia'), premissas, narrativa, ideia: ideiaRef, vincularIdeia: false });
  // registra a contraproposta no card da ideia (sem trocar o business plan principal)
  if (ideiaRef.id) { try { const sql = await getSql(); const r = await sql`SELECT data FROM ideias WHERE id = ${String(ideiaRef.id)} LIMIT 1`; const d = r[0]?.data; if (d) { const o = typeof d === 'string' ? JSON.parse(d) : d;
    o.contraproposta_bp = { id: bp.id, base_bp_id: base.id, atualizado_em: new Date().toISOString(), viavel_antes: i0.viavel, viavel_depois: ind.viavel, vpl_antes: i0.vpl, vpl_depois: ind.vpl, tir_antes: i0.tir_anual, tir_depois: ind.tir_anual };
    await sql`UPDATE ideias SET data = ${JSON.stringify(o)}, atualizado_em = NOW() WHERE id = ${String(ideiaRef.id)}`; } } catch (e) { console.warn('[BP] vínculo da contraproposta:', e.message); } }
  return { bp, base: { id: base.id, titulo: base.titulo, indicadores: i0 }, objetivo, rodadas };
}

// ── Excel: lib/bp-excel.js (modelo vivo com fórmulas + importação) ─────────

// ── Handler ──────────────────────────────────────────────────────────────
// ═══ v3.92: ANÁLISE E CONVERSA COM A IA sobre o Business Plan ═══
// O plano dinâmico da Atlantyx é recalculado na hora (QuickBooks + carteira + caixa) antes de a IA ler —
// ela sempre enxerga os números do momento. Planos salvos são lidos do banco.
async function _bpParaIA({ id, overrides } = {}) {
  const bp = id ? await obterBP(id) : await planoAtlantyx({ overrides });
  if (!bp?.resultado) throw new Error('Plano sem resultado calculado');
  const R = bp.resultado, I = R.indicadores || {};
  const anos = (R.anos || []).map(a => ({ ano: a.ano, periodo: a.periodo, receita_bruta: r2(a.receita_bruta), receita_liquida: r2(a.receita_liquida), ebitda: r2(a.ebitda), lucro_liquido: r2(a.lucro_liquido), margem_bruta: a.margem_bruta, margem_ebitda: a.margem_ebitda, margem_liquida: a.margem_liquida, pessoal: r2(a.pessoal), marketing: r2(a.marketing), despesas_fixas: r2(a.despesas_fixas), fcl: r2(a.fcl), caixa_final: r2(a.caixa_final) }));
  const cen = R.cenarios ? Object.fromEntries(Object.entries(R.cenarios).map(([k, c]) => [k, { tir_anual: c.tir_anual, vpl: r2(c.vpl), payback_meses: c.payback_simples_meses, exposicao: r2(c.exposicao_maxima_caixa) }])) : null;
  const ctx = { titulo: bp.titulo, tipo: bp.tipo, atualizado_em: bp.atualizado_em, indicadores: I, anos, cenarios: cen,
    premissas_resumo: { inicio: bp.premissas?.inicio, meses: bp.premissas?.meses, crescimento: bp.premissas?.crescimento || bp.ajustes, deducoes_pct: bp.premissas?.deducoes_pct, taxa_desconto: bp.premissas?.taxa_desconto_anual,
      receitas: (bp.premissas?.receitas || []).slice(0, 12).map(x => ({ nome: x.nome, tipo: x.tipo, valor: x.valor || x.preco, volume: x.volume })), despesas_fixas: (bp.premissas?.despesas_fixas || []).slice(0, 25).map(x => ({ nome: x.nome, valor: x.valor_mensal || x.valor })) },
    diagnostico_dados_reais: bp.diagnostico || null, avisos: bp.avisos || [], historico_12m: bp.historico || null, narrativa: bp.narrativa ? { resumo_executivo: bp.narrativa.resumo_executivo, riscos: bp.narrativa.riscos } : null };
  return { bp, ctx, chave: id || 'atlantyx' };
}
async function _iaBP(system, messages, maxTokens = 3500) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 110000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }) });
    const d = await r.json(); if (!r.ok) throw new Error('IA: ' + (d.error?.message || r.status));
    return (d.content || []).map(c => c.text || '').join('');
  } catch (e) { if (e.name === 'AbortError') throw new Error('A IA demorou demais — tente de novo'); throw e; } finally { clearTimeout(t); }
}
const SYS_BP = `Você é o CFO e estrategista da Atlantyx (B2B de dados, IA e engenharia de dados no Brasil; fundador e CEO: Fabio Quintanilha).
Analise o business plan com os NÚMEROS do contexto (JSON). Seja direto, quantitativo e honesto — aponte o que não fecha. Português do Brasil.
Valores em R$. Não invente dados que não estão no contexto; quando faltar dado (ex.: QuickBooks indisponível), diga qual e o impacto na análise.`;
async function analiseBP({ id, overrides } = {}, usuario) {
  const { ctx, chave } = await _bpParaIA({ id, overrides });
  const txt = await _iaBP(SYS_BP + `
Devolva SOMENTE JSON:
{"titulo":"…","nota_geral":0-10,"veredito":"viável|viável com ressalvas|inviável hoje","resumo_executivo":"5-8 linhas",
"leitura_dos_numeros":[{"indicador":"…","valor":"…","leitura":"…"}],
"pontos_fortes":["…"],"riscos":[{"risco":"…","impacto":"alto|médio|baixo","mitigacao":"…"}],
"premissas_frageis":[{"premissa":"…","por_que":"…","teste_sugerido":"…"}],
"alavancas":[{"alavanca":"…","efeito_estimado":"…"}],
"recomendacoes":[{"acao":"…","prazo":"…","responsavel":"…"}],
"cenario_minimo_para_viabilidade":"…","perguntas_para_o_fundador":["…"],"qualidade_dos_dados":"…"}`,
    [{ role: 'user', content: 'CONTEXTO DO BUSINESS PLAN:\n' + JSON.stringify(ctx).substring(0, 60000) }], 4000);
  const analise = parseJSON(txt) || { resumo_executivo: txt };
  analise.gerado_em = new Date().toISOString(); analise.plano = ctx.titulo; analise.base_atualizada_em = ctx.atualizado_em;
  await salvarHistorico('bp_analise', { analise, chave }, usuario);
  try { const sql = await getSql(); await sql`INSERT INTO app_config (chave, valor, atualizado_em) VALUES (${'bp_analise:' + chave}, ${JSON.stringify(analise)}, NOW()) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`; } catch (_) {}
  return { analise };
}
async function chatBP({ id, overrides, mensagem, historico = [] } = {}) {
  if (!String(mensagem || '').trim()) throw new Error('Escreva a pergunta');
  const { ctx, chave } = await _bpParaIA({ id, overrides });
  let ultimaAnalise = null; try { const sql = await getSql(); const r = await sql`SELECT valor FROM app_config WHERE chave = ${'bp_analise:' + chave} LIMIT 1`; ultimaAnalise = r[0]?.valor || null; } catch (_) {}
  const msgs = [...(historico || []).slice(-16).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content || '').substring(0, 4000) })), { role: 'user', content: String(mensagem).substring(0, 4000) }];
  const resposta = await _iaBP(SYS_BP + `
Você está CONVERSANDO com o fundador sobre este plano. Responda em até 250 palavras (a menos que ele peça detalhe), cite os números,
e quando ele propuser uma mudança ("e se crescermos 30%?"), estime o efeito com base nos números e diga qual ajuste fazer na tela (campo de premissa).
CONTEXTO ATUAL DO PLANO (recalculado agora): ${JSON.stringify(ctx).substring(0, 50000)}
${ultimaAnalise ? 'ÚLTIMA ANÁLISE GERADA: ' + JSON.stringify(ultimaAnalise).substring(0, 8000) : ''}`, msgs, 1800);
  const conversa = [...msgs, { role: 'assistant', content: resposta }].slice(-40);
  try { const sql = await getSql(); await sql`INSERT INTO app_config (chave, valor, atualizado_em) VALUES (${'bp_chat:' + chave}, ${JSON.stringify(conversa)}, NOW()) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`; } catch (_) {}
  return { resposta, conversa };
}
async function bpIaEstado({ id } = {}) {
  const chave = id || 'atlantyx'; const out = { analise: null, conversa: [] };
  try { const sql = await getSql(); const r = await sql`SELECT chave, valor FROM app_config WHERE chave IN (${'bp_analise:' + chave}, ${'bp_chat:' + chave})`;
    r.forEach(x => { const v = typeof x.valor === 'string' ? JSON.parse(x.valor) : x.valor; if (x.chave.startsWith('bp_analise:')) out.analise = v; else out.conversa = Array.isArray(v) ? v : []; }); } catch (_) {}
  return out;
}

async function handler(req, res) {
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
      contraproposta: async () => contrapropostaBP(b), // v3.44
      sensibilidade: async () => { const bp = await obterBP(b.id); if (!bp?.premissas) throw new Error('plano não encontrado'); return { sensibilidade: sensibilidades(bp.premissas) }; }, // v3.115
      analise: async () => analiseBP({ id: b.id || null, overrides: b.overrides }, req.sessao?.login), // v3.92
      chat: async () => chatBP({ id: b.id || null, overrides: b.overrides, mensagem: b.mensagem, historico: b.historico }),
      ia_estado: async () => bpIaEstado({ id: b.id || null }),
      chat_limpar: async () => { const sql = await getSql(); await sql`DELETE FROM app_config WHERE chave = ${'bp_chat:' + (b.id || 'atlantyx')}`; return { ok: true }; },
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
    return res.status(e.status || 500).json({ success: false, error: e.message });
  }
}

export { gerarExcel, planoAtlantyx };

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'business-plan');
