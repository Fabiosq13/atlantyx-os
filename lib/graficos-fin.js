// lib/graficos-fin.js — v3.570 · dados dos gráficos de linhas do Financeiro
//   1) Fluxo de caixa: META × REAL (resultado do mês, acumulado no ano e saldo em caixa)
//   2) Orçamento × REAL (receitas, gastos e resultado)
// Funções puras: recebem o que o QuickBooks/Neon já devolveram e montam as séries. Quem busca é api/financeiro.js.
//
// Definição da META de caixa (decidida aqui, ajustável em Planejamento → Metas da Empresa):
//   meta do mês = meta de faturamento do mês × meta de margem líquida  (o caixa que a meta de lucro exige gerar)
//   meta de saldo = saldo inicial do ano + meta acumulada
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const mesesDoAno = ano => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);

// soma corrida; posições nulas ficam nulas e a soma continua do último valor conhecido
function acumular(v, base = 0) { let s = base; return v.map(x => { if (x == null) return null; s += x; return r2(s); }); }

// ── 1. CAIXA: meta × real ─────────────────────────────────────────────────────────────────────────────────────
// v3.571: impostos sobre a receita a partir de jan/2027 — 30% (no lugar dos 16,33% do Lucro Presumido). O extrato do QuickBooks já traz o imposto
// antigo nos pagamentos; a linha LÍQUIDA desconta só a diferença (30% − 16,33%) sobre as entradas de cada mês.
export const IMPOSTO_NOVO = { a_partir: '2027-01', novo_pct: 30, atual_pct: 16.33 };
export function montarCaixa({ ano, extrato, metas, hoje, erros = [], imposto = IMPOSTO_NOVO } = {}) {
  const meses = mesesDoAno(ano), mesAtual = String(hoje).substring(0, 7), idxAtual = meses.indexOf(mesAtual);
  const passado = meses[11] < mesAtual, futuro = meses[0] > mesAtual;             // ano inteiro fechado / ano inteiro por vir
  const lim = passado ? 12 : futuro ? 0 : idxAtual;                                // meses FECHADOS (índices < lim)
  const L = new Map((extrato?.meses || []).map(m => [m.mes, m]));
  const avisos = [...erros];
  if (!extrato) avisos.push('Fluxo de caixa do QuickBooks indisponível: a linha Real fica vazia.');

  // real = fechados + mês corrente realizado até hoje ; previsto = mês corrente e seguintes (realizado + previsto)
  const real = meses.map((k, i) => { const m = L.get(k); if (!m) return null; if (i < lim) return r2((m.entradas_realizadas ?? m.entradas ?? 0) - (m.saidas_realizadas ?? m.saidas ?? 0)); if (!passado && i === idxAtual) return r2((m.entradas_realizadas || 0) - (m.saidas_realizadas || 0)); return null; });
  const prev = meses.map((k, i) => { const m = L.get(k); if (!m || passado) return null; return futuro || i >= idxAtual ? r2(m.resultado ?? ((m.entradas || 0) - (m.saidas || 0))) : null; });

  // meta mensal
  const M = metas && metas.faturamento > 0 ? metas : null;
  let meta = Array(12).fill(null), metaInfo = { definicao: 'meta de faturamento do mês × meta de margem líquida', cadastrada: false, padrao: !!metas?.padrao };
  if (M) {
    const mens = Array.isArray(M.mensal) && M.mensal.length === 12 && M.mensal.reduce((a, b) => a + (Number(b) || 0), 0) > 0 ? M.mensal.map(Number) : null;
    meta = meses.map((_, i) => r2((mens ? mens[i] : M.faturamento / 12) * (Number(M.margem_pct) || 0) / 100));
    metaInfo = { ...metaInfo, cadastrada: !M.padrao, faturamento_ano: r2(M.faturamento), margem_pct: Number(M.margem_pct) || 0, distribuicao: mens ? 'mensal (sazonalidade cadastrada)' : 'igual em todos os meses (anual ÷ 12)', caixa_minimo: M.caixa_minimo ?? null };
    if (M.padrao) avisos.push('Meta de ' + ano + ' calculada pelo padrão da empresa: cadastre a meta aprovada em Planejamento → Metas da Empresa.');
    if (!mens) avisos.push('Meta sem distribuição mês a mês: a linha usa anual ÷ 12 (sem sazonalidade).');
    if (!(Number(M.margem_pct) > 0)) avisos.push('Meta de margem líquida zerada: a meta de caixa do mês fica em zero.');
  } else avisos.push('Sem meta de faturamento cadastrada para ' + ano + ': a linha Meta não aparece. Cadastre em Planejamento → Metas da Empresa.');

  // acumulado no ano
  const aReal = acumular(real), baseProj = lim > 0 ? (aReal[lim - 1] ?? 0) : 0;
  const aPrev = (() => { let s = baseProj; return prev.map((v, i) => { if (v == null) return null; if (i < (passado ? 12 : futuro ? 0 : idxAtual)) return null; s += v; return r2(s); }); })();
  const aMeta = M ? acumular(meta) : Array(12).fill(null);

  // saldo em caixa (fim do mês). Real = meses fechados; no mês corrente, o saldo de hoje; previsto = fim do mês (com o previsto)
  const si = extrato?.saldo_inicial ?? null;
  const saldoReal = meses.map((k, i) => { const m = L.get(k); if (!m) return null; if (i < lim) return r2(m.saldo_fim); if (!passado && i === idxAtual && extrato?.saldo_hoje != null) return r2(extrato.saldo_hoje); return null; });
  const saldoPrev = meses.map((k, i) => { const m = L.get(k); if (!m || passado) return null; return futuro || i >= idxAtual ? r2(m.saldo_fim) : null; });
  const saldoMeta = M && si != null ? aMeta.map(v => v == null ? null : r2(si + v)) : Array(12).fill(null);
  if (si == null && M) avisos.push('Saldo inicial do ano indisponível: a meta de saldo não é calculada.');

  // resumo (compara só meses FECHADOS, para não punir o mês que ainda está correndo)
  const soma = (a, n) => r2(a.slice(0, n).reduce((s, x) => s + (x || 0), 0));
  const fechadoReal = lim > 0 ? soma(real, lim) : null, fechadoMeta = M && lim > 0 ? soma(meta, lim) : null;
  const projAno = passado ? aReal[11] : (aPrev.filter(v => v != null).at(-1) ?? null), metaAno = M ? soma(meta, 12) : null;
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
  const resumo = {
    meses_fechados: lim, resultado_real_fechado: fechadoReal, meta_fechado: fechadoMeta,
    desvio_fechado: fechadoReal != null && fechadoMeta != null ? r2(fechadoReal - fechadoMeta) : null,
    atingido_pct: fechadoReal != null && fechadoMeta ? pct(fechadoReal, fechadoMeta) : null,
    projecao_fim_ano: projAno, meta_ano: metaAno, desvio_projetado: projAno != null && metaAno != null ? r2(projAno - metaAno) : null,
    saldo_hoje: extrato?.saldo_hoje ?? null, caixa_minimo: M?.caixa_minimo ?? null,
    situacao: fechadoReal != null && fechadoMeta != null ? (fechadoReal >= fechadoMeta ? 'acima da meta' : 'abaixo da meta') : null,
  };
  // ── caixa LÍQUIDO dos novos impostos (a partir de imposto.a_partir) ──
  const dif = (imposto.novo_pct - imposto.atual_pct) / 100, ini = meses.findIndex(k => k >= imposto.a_partir);
  const lMensal = Array(12).fill(null), lAcum = Array(12).fill(null), lSaldo = Array(12).fill(null), adj = Array(12).fill(null);
  if (ini >= 0 && extrato) {
    let sa = 0, sj = 0;
    meses.forEach((k, i) => { if (i < ini) return; const m = L.get(k); if (!m) return;
      const bruto = prev[i] ?? real[i]; if (bruto == null) return;
      const imp = r2((m.entradas ?? ((m.entradas_realizadas || 0) + (m.entradas_previstas || 0))) * dif);
      adj[i] = imp; lMensal[i] = r2(bruto - imp); sa += lMensal[i]; lAcum[i] = r2(sa);
      sj += imp; if (ano === Number(imposto.a_partir.slice(0, 4)) && m.saldo_fim != null) lSaldo[i] = r2(m.saldo_fim - sj); });
    avisos.push('Linha "líquido dos novos impostos": a partir de ' + imposto.a_partir.split('-').reverse().join('/') + ' o imposto sobre a receita passa a ' + imposto.novo_pct + '% (antes ' + imposto.atual_pct + '%); a linha desconta do caixa a diferença de ' + r2(dif * 100) + '% sobre as entradas de cada mês.');
  }
  if (ini < 0) avisos.push('A linha líquida dos novos impostos aparece a partir de jan/2027: avance o ano (▶) para ver.');
  const temLiq = lMensal.some(v => v != null);
  const liqAno = temLiq ? r2(lMensal.reduce((x, v) => x + (v || 0), 0)) : null;
  return { ano, mes_atual: mesAtual, indice_mes_atual: passado ? 11 : futuro ? -1 : idxAtual, meses,
    caixa: { mensal: { real, previsto: prev, meta, liquido: lMensal }, acumulado: { real: aReal, previsto: aPrev, meta: aMeta, liquido: lAcum }, saldo: { real: saldoReal, previsto: saldoPrev, meta: saldoMeta, liquido: lSaldo, minimo: M?.caixa_minimo ?? null } },
    imposto: { ...imposto, ativo: temLiq, imposto_adicional_mes: adj, liquido_ano: liqAno, imposto_adicional_ano: temLiq ? r2(adj.reduce((x, v) => x + (v || 0), 0)) : null },
    resumo, meta_info: metaInfo, avisos };
}

// ── 2. ORÇAMENTO × REAL ───────────────────────────────────────────────────────────────────────────────────────
// dre = saída de orcamentoDre({ inicio: ano-01, meses: 12 }): grupos.{receitas,custos,despesas}.meses[mês].{orcado,real} e resultados
export function montarOrcamento({ ano, dre, hoje, erros = [] } = {}) {
  const meses = mesesDoAno(ano), mesAtual = String(hoje).substring(0, 7), avisos = [...erros];
  if (!dre) return { ano, mes_atual: mesAtual, meses, series: null, resumo: null, avisos: [...avisos, 'Orçado × realizado indisponível no momento.'] };
  const G = dre.grupos || {}, R = dre.resultados || {};
  const ler = (fn, k, m) => { try { return Number(fn(m)?.[k]) || 0; } catch (_) { return 0; } };
  const por = (get) => ({ orcado: meses.map(m => r2(ler(get, 'orcado', m))), real: meses.map(m => m <= mesAtual ? r2(ler(get, 'real', m)) : null) });
  const gm = g => m => G[g]?.meses?.[m];
  const series = {
    receitas: por(gm('receitas')),
    gastos: por(m => { const a = G.custos?.meses?.[m] || {}, b = G.despesas?.meses?.[m] || {}; return { orcado: (a.orcado || 0) + (b.orcado || 0), real: (a.real || 0) + (b.real || 0) }; }),
    resultado: por(m => R.resultado_liquido?.meses?.[m]),
  };
  for (const k of Object.keys(series)) series[k].acumulado = { orcado: acumular(series[k].orcado), real: acumular(series[k].real) };
  const temOrc = series.receitas.orcado.some(v => v) || series.gastos.orcado.some(v => v);
  if (!temOrc) avisos.push('Sem orçamento cadastrado no QuickBooks para ' + ano + ': a linha Orçado fica zerada. Cadastre em Financeiro → Orçamento Anual.');
  if (meses.includes(mesAtual)) avisos.push('Mês corrente = realizado até hoje + orçado dos dias que faltam (mesma regra da tela Orçamento Anual).');
  (dre.avisos || []).filter(a => /QuickBooks|Budget|orçamento|Realizado/i.test(a) && !/^Mês corrente|^Receita dos meses/.test(a)).forEach(a => avisos.push(a));
  // resumo até o mês atual (acumulado)
  const ate = meses.filter(m => m <= mesAtual).length, soma = a => r2(a.slice(0, ate).reduce((s, x) => s + (x || 0), 0));
  const linha = k => { const o = soma(series[k].orcado), r = soma(series[k].real); return { orcado: o, real: r, desvio: r2(r - o), desvio_pct: o ? Math.round((r - o) / Math.abs(o) * 1000) / 10 : null }; };
  const resumo = ate > 0 ? { ate_mes: meses[ate - 1], receitas: linha('receitas'), gastos: linha('gastos'), resultado: linha('resultado') } : null;
  if (resumo) { resumo.leitura = { receitas: resumo.receitas.desvio >= 0 ? 'acima do orçado' : 'abaixo do orçado', gastos: resumo.gastos.desvio <= 0 ? 'dentro do orçado' : 'acima do orçado', resultado: resumo.resultado.desvio >= 0 ? 'acima do orçado' : 'abaixo do orçado' }; }
  return { ano, mes_atual: mesAtual, indice_mes_atual: meses.indexOf(mesAtual), meses, series, resumo, avisos };
}
