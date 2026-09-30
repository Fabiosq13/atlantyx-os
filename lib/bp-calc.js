// lib/bp-calc.js — v3.04
// Motor DETERMINÍSTICO do Business Plan. Recebe premissas (geradas pela IA para uma ideia,
// ou montadas a partir dos dados reais da Atlantyx) e devolve DRE, fluxo de caixa mensal
// (36 meses), consolidação anual e indicadores: TIR, VPL, payback simples/descontado,
// exposição máxima de caixa, ROI, margens, break-even, CAC, LTV.
// A IA só propõe PREMISSAS; todo número do plano sai daqui — auditável e reproduzível.

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const num = (v, d = 0) => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : d; };
const soma = a => a.reduce((s, v) => s + (Number(v) || 0), 0);

export function mesesLabels(inicio, n) {
  const [a, m] = String(inicio || '').split('-').map(Number);
  const base = (a && m) ? new Date(a, m - 1, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// TIR por bisseção sobre o VPL (fluxos mensais, t = 0..n-1). Exige troca de sinal.
export function tir(fluxos) {
  const f = fluxos.map(Number);
  if (!f.some(v => v < 0) || !f.some(v => v > 0)) return null;
  const vpl = r => f.reduce((s, v, t) => s + v / Math.pow(1 + r, t), 0);
  let lo = -0.99, hi = 1, vlo = vpl(lo), vhi = vpl(hi);
  let k = 0;
  while (vlo * vhi > 0 && k < 30) { hi *= 2; vhi = vpl(hi); k++; }
  if (vlo * vhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, vm = vpl(mid);
    if (Math.abs(vm) < 1e-7) return mid;
    if (vlo * vm < 0) { hi = mid; vhi = vm; } else { lo = mid; vlo = vm; }
  }
  return (lo + hi) / 2;
}

export function vpl(taxaMensal, fluxos) {
  return fluxos.reduce((s, v, t) => s + Number(v) / Math.pow(1 + taxaMensal, t), 0);
}

function normalizar(p = {}) {
  const N = Math.max(12, Math.min(60, Math.round(num(p.meses, 36))));
  return {
    ...p,
    meses: N,
    inicio: p.inicio,
    taxa_desconto_anual: num(p.taxa_desconto_anual, 15),
    deducoes_pct: num(p.deducoes_pct, 16.33),
    ir_csll_pct: num(p.ir_csll_pct, 0),
    prazo_recebimento_dias: num(p.prazo_recebimento_dias, 30),
    saldo_inicial: num(p.saldo_inicial, 0),
    crescimento_perpetuidade_pct: num(p.crescimento_perpetuidade_pct, 3),
    receitas: Array.isArray(p.receitas) ? p.receitas : [],
    custos_variaveis: Array.isArray(p.custos_variaveis) ? p.custos_variaveis : [],
    pessoal: Array.isArray(p.pessoal) ? p.pessoal : [],
    despesas_fixas: Array.isArray(p.despesas_fixas) ? p.despesas_fixas : [],
    marketing: p.marketing || {},
    investimentos: Array.isArray(p.investimentos) ? p.investimentos : [],
  };
}

// Valor anual indexado ao ano do mês (0-based): arr[ano] ou último disponível
const porAno = (v, ano) => Array.isArray(v) ? num(v[Math.min(ano, v.length - 1)], 0) : num(v, 0);

export function calcularBP(premissas, { fatorVolume = 1, fatorPreco = 1, fatorCusto = 1 } = {}) {
  const p = normalizar(premissas);
  const N = p.meses;
  const Z = () => new Array(N).fill(0);
  const labels = mesesLabels(p.inicio, N);

  // ── RECEITAS ────────────────────────────────────────────────────────────
  const recLinhas = [], cliLinhas = [];
  const novosTot = Z(), clientesTot = Z(), mrr = Z();
  for (const r of p.receitas) {
    const tipo = String(r.tipo || 'recorrente').toLowerCase();
    const valores = Z(), clientes = Z(), novos = Z();
    if (tipo === 'serie') {
      for (let m = 0; m < N; m++) valores[m] = num((r.valores || [])[m], 0) * fatorVolume;
    } else {
      const inicioM = Math.max(1, Math.round(num(r.mes_inicio, 1)));
      const churn = num(r.churn_mensal_pct, 0) / 100;
      const reaj = num(r.reajuste_anual_pct, 0) / 100;
      const preco = num(r.preco, 0) * fatorPreco;
      let ativos = num(r.clientes_iniciais, 0);
      for (let m = 0; m < N; m++) {
        const ano = Math.floor(m / 12);
        const precoM = preco * Math.pow(1 + reaj, ano);
        const n = (m + 1 >= inicioM) ? porAno(r.novos_mes, ano) * fatorVolume : 0;
        novos[m] = n;
        if (tipo === 'recorrente') {
          ativos = ativos * (1 - churn) + n;
          clientes[m] = ativos;
          valores[m] = ativos * precoM;
          mrr[m] += valores[m];
        } else { // 'unico' / 'projeto' / 'setup' — receita no mês da venda
          valores[m] = n * precoM;
        }
        novosTot[m] += (tipo === 'recorrente' || r.conta_como_cliente) ? n : 0;
      }
      for (let m = 0; m < N; m++) clientesTot[m] += clientes[m];
    }
    recLinhas.push({ nome: r.nome || 'Receita', tipo, valores: valores.map(r2) });
    if (tipo === 'recorrente') cliLinhas.push({ nome: r.nome || 'Receita', clientes: clientes.map(v => Math.round(v * 10) / 10), novos });
  }
  const receitaBruta = Z();
  recLinhas.forEach(l => l.valores.forEach((v, m) => { receitaBruta[m] += v; }));
  const deducoes = receitaBruta.map(v => -v * p.deducoes_pct / 100);
  const receitaLiquida = receitaBruta.map((v, m) => v + deducoes[m]);

  // ── CUSTOS VARIÁVEIS (% da receita bruta) ──────────────────────────────
  const cvLinhas = p.custos_variaveis.map(c => ({
    nome: c.nome || 'Custo variável',
    pct: num(c.pct_receita, 0),
    valores: receitaBruta.map(v => r2(-v * num(c.pct_receita, 0) / 100 * fatorCusto)),
  }));
  const custosVar = Z(); cvLinhas.forEach(l => l.valores.forEach((v, m) => { custosVar[m] += v; }));
  const lucroBruto = receitaLiquida.map((v, m) => v + custosVar[m]);

  // ── PESSOAL ────────────────────────────────────────────────────────────
  const pesLinhas = p.pessoal.map(x => {
    const ini = Math.max(1, Math.round(num(x.mes_inicio, 1)));
    const fim = x.mes_fim ? Math.round(num(x.mes_fim, N)) : N;
    const enc = num(x.encargos_pct, 0) / 100;
    const reaj = num(x.reajuste_anual_pct, 0) / 100;
    const custo = num(x.qtd, 1) * num(x.salario, 0) * (1 + enc);
    return { nome: `${x.cargo || 'Cargo'}${num(x.qtd, 1) !== 1 ? ' (' + num(x.qtd, 1) + ')' : ''}`,
      valores: labels.map((_, m) => (m + 1 >= ini && m + 1 <= fim) ? r2(-custo * Math.pow(1 + reaj, Math.floor(m / 12)) * fatorCusto) : 0) };
  });

  // ── DESPESAS FIXAS (grupo: pessoal | marketing | geral) ────────────────
  const fixLinhas = p.despesas_fixas.map(d => {
    const grupo = ['pessoal', 'marketing'].includes(d.grupo) ? d.grupo : 'geral';
    let valores;
    if (String(d.tipo || '').toLowerCase() === 'serie') valores = labels.map((_, m) => r2(-Math.abs(num((d.valores || [])[m], 0)) * fatorCusto));
    else {
      const ini = Math.max(1, Math.round(num(d.mes_inicio, 1)));
      const reaj = num(d.reajuste_anual_pct, 0) / 100;
      valores = labels.map((_, m) => m + 1 >= ini ? r2(-Math.abs(num(d.valor_mensal, 0)) * Math.pow(1 + reaj, Math.floor(m / 12)) * fatorCusto) : 0);
    }
    return { nome: d.nome || 'Despesa', grupo, valores };
  });
  fixLinhas.filter(l => l.grupo === 'pessoal').forEach(l => pesLinhas.push(l));
  const pessoal = Z(); pesLinhas.forEach(l => l.valores.forEach((v, m) => { pessoal[m] += v; }));

  // ── MARKETING E VENDAS ─────────────────────────────────────────────────
  const mk = p.marketing || {};
  const mkLinhas = [];
  if (num(mk.pct_receita, 0) || num(mk.fixo_mensal, 0)) {
    mkLinhas.push({ nome: 'Marketing e vendas', valores: receitaBruta.map((v, m) =>
      r2(-(v * num(mk.pct_receita, 0) / 100 + num(mk.fixo_mensal, 0) * Math.pow(1 + num(mk.reajuste_anual_pct, 0) / 100, Math.floor(m / 12))) * fatorCusto)) });
  }
  fixLinhas.filter(l => l.grupo === 'marketing').forEach(l => mkLinhas.push(l));
  const marketing = Z(); mkLinhas.forEach(l => l.valores.forEach((v, m) => { marketing[m] += v; }));

  const gerLinhas = fixLinhas.filter(l => l.grupo === 'geral');
  const despFixas = Z(); gerLinhas.forEach(l => l.valores.forEach((v, m) => { despFixas[m] += v; }));

  const ebitda = lucroBruto.map((v, m) => v + pessoal[m] + marketing[m] + despFixas[m]);

  // ── INVESTIMENTOS / DEPRECIAÇÃO ────────────────────────────────────────
  const capex = Z(), deprec = Z();
  for (const inv of p.investimentos) {
    const m0 = Math.min(N, Math.max(1, Math.round(num(inv.mes, 1)))) - 1;
    const v = Math.abs(num(inv.valor, 0));
    capex[m0] -= v;
    const dm = Math.round(num(inv.depreciacao_meses, 0));
    if (dm > 0) for (let m = m0; m < Math.min(N, m0 + dm); m++) deprec[m] -= v / dm;
  }
  const ebit = ebitda.map((v, m) => v + deprec[m]);

  // IR/CSLL (Lucro Real) com compensação de prejuízo limitada a 30% do lucro do período
  const ir = Z(); let prejuizo = 0;
  const aliqIR = p.ir_csll_pct / 100;
  for (let m = 0; m < N; m++) {
    if (aliqIR <= 0) break;
    if (ebit[m] <= 0) { prejuizo += -ebit[m]; continue; }
    const comp = Math.min(prejuizo, ebit[m] * 0.3);
    prejuizo -= comp;
    ir[m] = -(ebit[m] - comp) * aliqIR;
  }
  const lucroLiquido = ebit.map((v, m) => v + ir[m]);

  // ── FLUXO DE CAIXA ─────────────────────────────────────────────────────
  const prazo = p.prazo_recebimento_dias / 30;
  const varGiro = receitaBruta.map((v, m) => -(v - (m ? receitaBruta[m - 1] : 0)) * prazo);
  const fco = lucroLiquido.map((v, m) => v - deprec[m] + varGiro[m]);
  const fcl = fco.map((v, m) => v + capex[m]);
  const fclAcum = []; let ac = 0; fcl.forEach(v => { ac += v; fclAcum.push(ac); });
  const caixa = fclAcum.map(v => v + p.saldo_inicial);
  const taxaM = Math.pow(1 + p.taxa_desconto_anual / 100, 1 / 12) - 1;
  const fclDesc = fcl.map((v, t) => v / Math.pow(1 + taxaM, t));
  const fclDescAcum = []; ac = 0; fclDesc.forEach(v => { ac += v; fclDescAcum.push(ac); });

  // ── INDICADORES ────────────────────────────────────────────────────────
  const tirM = tir(fcl);
  const tirA = tirM == null ? null : Math.pow(1 + tirM, 12) - 1;
  const vplV = vpl(taxaM, fcl);
  const nAnos = Math.ceil(N / 12);
  const anoIdx = a => [a * 12, Math.min(N, a * 12 + 12)];
  const somaAno = (arr, a) => { const [i, j] = anoIdx(a); return soma(arr.slice(i, j)); };
  const g = p.crescimento_perpetuidade_pct / 100, i = p.taxa_desconto_anual / 100;
  const fclUltAno = somaAno(fcl, nAnos - 1);
  let valorTerminal = null, vplPerp = null;
  if (fclUltAno > 0 && i > g) {
    valorTerminal = fclUltAno * (1 + g) / (i - g);
    vplPerp = vplV + valorTerminal / Math.pow(1 + taxaM, N - 1);
  }
  const paybackDe = arr => {
    if (!arr.some(v => v < 0)) return 0;
    let ultimoNeg = -1; arr.forEach((v, k) => { if (v < 0) ultimoNeg = k; });
    return ultimoNeg + 1 < N ? ultimoNeg + 2 : null; // mês (1-based) em que o acumulado volta a ≥ 0 de vez
  };
  const exposicao = Math.max(0, -Math.min(0, ...fclAcum));
  const menorCaixa = Math.min(...caixa);
  const investTotal = -soma(capex);
  const primeiroEbitdaPos = ebitda.findIndex((v, k) => v > 0 && ebitda.slice(k).every(x => x > 0));
  const novosSoma = soma(novosTot);
  const cac = novosSoma > 0 ? -soma(marketing) / novosSoma : null;
  const recRec = p.receitas.filter(r => String(r.tipo || 'recorrente').toLowerCase() === 'recorrente');
  const churnMed = recRec.length ? recRec.reduce((s, r) => s + num(r.churn_mensal_pct, 0), 0) / recRec.length / 100 : 0;
  const ticketMed = recRec.length ? recRec.reduce((s, r) => s + num(r.preco, 0) * fatorPreco, 0) / recRec.length : null;
  const mgBrutaTot = soma(receitaBruta) ? soma(lucroBruto) / soma(receitaBruta) : 0;
  const ltv = (ticketMed && churnMed > 0) ? ticketMed * mgBrutaTot / churnMed : null;

  const anos = [];
  for (let a = 0; a < nAnos; a++) {
    const rb = somaAno(receitaBruta, a);
    const [ia, ja] = anoIdx(a);
    anos.push({
      ano: a + 1, periodo: `${labels[ia]} a ${labels[ja - 1]}`,
      receita_bruta: r2(rb), deducoes: r2(somaAno(deducoes, a)), receita_liquida: r2(somaAno(receitaLiquida, a)),
      custos_variaveis: r2(somaAno(custosVar, a)), lucro_bruto: r2(somaAno(lucroBruto, a)),
      pessoal: r2(somaAno(pessoal, a)), marketing: r2(somaAno(marketing, a)), despesas_fixas: r2(somaAno(despFixas, a)),
      ebitda: r2(somaAno(ebitda, a)), depreciacao: r2(somaAno(deprec, a)), ebit: r2(somaAno(ebit, a)),
      ir_csll: r2(somaAno(ir, a)), lucro_liquido: r2(somaAno(lucroLiquido, a)),
      var_capital_giro: r2(somaAno(varGiro, a)), fco: r2(somaAno(fco, a)), investimentos: r2(somaAno(capex, a)),
      fcl: r2(somaAno(fcl, a)), caixa_final: r2(caixa[ja - 1]),
      margem_bruta: rb ? somaAno(lucroBruto, a) / rb : null,
      margem_ebitda: rb ? somaAno(ebitda, a) / rb : null,
      margem_liquida: rb ? somaAno(lucroLiquido, a) / rb : null,
      clientes_fim: Math.round(clientesTot[ja - 1] || 0), mrr_fim: r2(mrr[ja - 1] || 0),
    });
  }
  anos.forEach((a, k) => { a.crescimento_receita = k && anos[k - 1].receita_bruta ? a.receita_bruta / anos[k - 1].receita_bruta - 1 : null; });
  const ult = anos[anos.length - 1] || {};
  const custoFixoMensalUlt = -(ult.pessoal + ult.marketing + ult.despesas_fixas) / 12;
  const mcPct = ult.receita_bruta ? (ult.lucro_bruto) / ult.receita_bruta : 0;

  const indicadores = {
    tir_mensal: tirM, tir_anual: tirA,
    taxa_desconto_anual: p.taxa_desconto_anual / 100, taxa_desconto_mensal: taxaM,
    vpl: r2(vplV), valor_terminal: valorTerminal == null ? null : r2(valorTerminal), vpl_com_perpetuidade: vplPerp == null ? null : r2(vplPerp),
    payback_simples_meses: paybackDe(fclAcum), payback_descontado_meses: paybackDe(fclDescAcum),
    exposicao_maxima_caixa: r2(exposicao), menor_saldo_caixa: r2(menorCaixa), mes_menor_saldo: labels[caixa.indexOf(menorCaixa)],
    investimento_total: r2(investTotal),
    roi_periodo: exposicao > 0 ? soma(fcl) / exposicao : null,
    indice_lucratividade: exposicao > 0 ? (vplV + exposicao) / exposicao : null,
    break_even_ebitda_mes: primeiroEbitdaPos >= 0 ? primeiroEbitdaPos + 1 : null,
    break_even_ebitda_label: primeiroEbitdaPos >= 0 ? labels[primeiroEbitdaPos] : null,
    ponto_equilibrio_receita_mensal: mcPct > 0 ? r2(custoFixoMensalUlt / mcPct) : null,
    receita_total: r2(soma(receitaBruta)), lucro_liquido_total: r2(soma(lucroLiquido)), fcl_total: r2(soma(fcl)),
    ebitda_total: r2(soma(ebitda)),
    cac: cac == null ? null : r2(cac), ltv: ltv == null ? null : r2(ltv), ltv_cac: (cac && ltv) ? ltv / cac : null,
    ticket_medio_recorrente: ticketMed == null ? null : r2(ticketMed), churn_medio_mensal: churnMed,
    clientes_final: Math.round(clientesTot[N - 1] || 0), mrr_final: r2(mrr[N - 1] || 0),
    viavel: (vplV > 0) && (tirA == null || tirA > p.taxa_desconto_anual / 100),
  };

  return {
    premissas: p, meses: labels, anos, indicadores,
    mensal: {
      receita_bruta: receitaBruta.map(r2), deducoes: deducoes.map(r2), receita_liquida: receitaLiquida.map(r2),
      custos_variaveis: custosVar.map(r2), lucro_bruto: lucroBruto.map(r2), pessoal: pessoal.map(r2),
      marketing: marketing.map(r2), despesas_fixas: despFixas.map(r2), ebitda: ebitda.map(r2),
      depreciacao: deprec.map(r2), ebit: ebit.map(r2), ir_csll: ir.map(r2), lucro_liquido: lucroLiquido.map(r2),
      var_capital_giro: varGiro.map(r2), fco: fco.map(r2), investimentos: capex.map(r2), fcl: fcl.map(r2),
      fcl_acumulado: fclAcum.map(r2), caixa: caixa.map(r2), fcl_descontado: fclDesc.map(r2),
      clientes: clientesTot.map(v => Math.round(v * 10) / 10), novos_clientes: novosTot, mrr: mrr.map(r2),
    },
    linhas: { receitas: recLinhas, clientes: cliLinhas, custos_variaveis: cvLinhas, pessoal: pesLinhas, marketing: mkLinhas, despesas_fixas: gerLinhas },
  };
}

// Cenários: pessimista / base / otimista variando volume, preço e custos
export function cenariosBP(premissas) {
  const def = {
    pessimista: { fatorVolume: 0.7, fatorPreco: 0.9, fatorCusto: 1.1 },
    base: { fatorVolume: 1, fatorPreco: 1, fatorCusto: 1 },
    otimista: { fatorVolume: 1.3, fatorPreco: 1.05, fatorCusto: 0.95 },
  };
  const out = {};
  for (const [k, f] of Object.entries(def)) {
    const r = calcularBP(premissas, f);
    out[k] = { fatores: f, tir_anual: r.indicadores.tir_anual, vpl: r.indicadores.vpl, payback_simples_meses: r.indicadores.payback_simples_meses,
      exposicao_maxima_caixa: r.indicadores.exposicao_maxima_caixa, receita_total: r.indicadores.receita_total,
      lucro_liquido_total: r.indicadores.lucro_liquido_total, receita_ultimo_ano: r.anos[r.anos.length - 1]?.receita_bruta };
  }
  return out;
}
