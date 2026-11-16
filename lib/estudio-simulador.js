// v3.521 — Estúdio de Produtos e Esteira, fase 3: simulador de cenário (coortes mensais).
// Cada mês entram N clientes novos na esteira; B e C são vendidos depois do tempo e da conversão de cada passagem.
// Receita única: reconhecida na conclusão; caixa = conclusão + DSO. Receita mensal: todo mês do contrato; caixa = mês + DSO.
// Nada é assumido: o que faltar vira aviso. Horas por pessoa-dia no CAPEX = 8 (hipótese, avisada).
import { calcular, premissasNormalizar, calcularEsteira } from './estudio-produtos.js';
export const K_CENARIOS = 'sim:cenarios';
const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const r2 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
const HORAS_PD = 8;

export function simular(cen, produtos, esteiras, premIn) {
  const P = premissasNormalizar(premIn), av = [], H = Math.max(1, Math.min(60, Math.round(num(cen?.horizonte) || 12)));
  const ov = cen?.premissas || {}, cpd = num(ov.custo_pessoa_dia) ?? P.custo_pessoa_dia, mult = num(ov.conversao_mult) ?? 1, dsoMult = num(ov.dso_mult) ?? 1, cpdMult = num(ov.custo_mult) ?? 1;
  const custoPD = cpd == null ? null : cpd * cpdMult, du = P.dias_uteis_mes || 21;
  if (custoPD == null || custoPD <= 0) return { avisos: ['Informe o custo por pessoa-dia nas premissas'], meses: [], resumo: null, horizonte: H };
  const M = Array.from({ length: H + 1 }, () => ({ receita: 0, receita_rec: 0, custo: 0, cac: 0, opex: 0, capex: 0, cash_in: 0, pd: 0, por_oferta: {} }));
  const dentro = i => i >= 0 && i < H, add = (i, k, v) => { if (dentro(i)) M[i][k] += v; };
  const usados = new Set(), linhas = (cen?.linhas || []).filter(l => l.esteira_id && num(l.entradas_mes) > 0);
  if (!linhas.length) av.push('Informe ao menos uma esteira com entradas por mês');
  const venda = (p, s, n) => { // s = mês da venda (0-based), n = quantidade de clientes
    if (!dentro(s) || n <= 0) return; usados.add(p.id);
    const c = calcular(p, P), preco = num(p.preco), pd = num(p.pessoa_dias) || 0, f = preco && c.receita_liquida != null ? c.receita_liquida / preco : 1;
    const varF = ['nuvem', 'ia', 'ferramentas', 'outros'].reduce((x, k) => x + (num(p['custo_' + k]) || 0), 0);
    const dso = Math.round(((num(p.dso_dias) ?? P.dso_dias?.[p.publico === 'grande' ? 'grande' : 'medio'] ?? 0) * dsoMult) / 30), po = (i, rec, cus) => { if (dentro(i)) { const o = (M[i].por_oferta[p.nome] = M[i].por_oferta[p.nome] || { receita: 0, custo: 0 }); o.receita += rec; o.custo += cus; } };
    if (preco == null) { av.push(p.nome + ': sem preço'); return; }
    const imp = num(p.taxa_implantacao) || 0; if (imp > 0) { add(s, 'receita', imp * f * n); add(s + 0, 'cash_in', imp * f * n); po(s, imp * f * n, 0); }
    if (p.periodicidade === 'mensal') {
      let meses = num(p.prazo_contrato_meses) || (num(p.churn_mensal_pct) ? Math.round(100 / num(p.churn_mensal_pct)) : null); if (!meses) { meses = 1; av.push(p.nome + ': sem prazo de contrato nem churn — contou 1 mês'); }
      for (let k = 0; k < meses; k++) { const i = s + k, cu = (pd * custoPD + varF) * n, re = preco * f * n; add(i, 'receita', re); add(i, 'receita_rec', re); add(i, 'custo', cu); add(i, 'pd', pd * n); add(i + dso, 'cash_in', re); po(i, re, cu); }
    } else {
      const d = Math.max(1, Math.ceil(pd / du)), cuTot = (pd * custoPD + varF) * n, re = preco * f * n;
      for (let k = 0; k < d; k++) { add(s + k, 'custo', cuTot / d); add(s + k, 'pd', pd * n / d); po(s + k, 0, cuTot / d); }
      add(s + d - 1, 'receita', re); add(s + d - 1 + dso, 'cash_in', re); po(s + d - 1, re, 0);
    }
  };
  const detEst = [];
  for (const l of linhas) {
    const e = (esteiras || []).find(x => x.id === l.esteira_id); if (!e) { av.push('Esteira não encontrada'); continue; }
    const pr = g => (produtos || []).find(x => x.id === e.degraus?.[g]), pA = pr('A'), pB = pr('B'), pC = pr('C'); if (!pA) { av.push(e.nome + ': sem produto no degrau A'); continue; }
    const n0 = num(l.entradas_mes), ini = Math.max(0, Math.round(num(l.inicio_mes) || 0)), cAB = Math.min(1, (num(e.passagens?.AB?.conversao_pct) ?? 0) / 100 * mult), cBC = Math.min(1, (num(e.passagens?.BC?.conversao_pct) ?? 0) / 100 * mult);
    const tAB = Math.round(num(e.passagens?.AB?.meses) ?? 0), tBC = Math.round(num(e.passagens?.BC?.meses) ?? 0), kAB = num(e.passagens?.AB?.cac) || 0, kBC = num(e.passagens?.BC?.cac) || 0, k0 = num(e.cac_entrada);
    if (k0 == null) av.push(e.nome + ': sem CAC de entrada'); if (pB && num(e.passagens?.AB?.conversao_pct) == null) av.push(e.nome + ': sem conversão A→B');
    for (let t = ini; t < H; t++) {
      add(t, 'cac', (k0 || 0) * n0); venda(pA, t, n0);
      if (pB && cAB > 0) { const sB = t + tAB; add(sB, 'cac', kAB * n0 * cAB); venda(pB, sB, n0 * cAB);
        if (pC && cBC > 0) { const sC = sB + tBC; add(sC, 'cac', kBC * n0 * cAB * cBC); venda(pC, sC, n0 * cAB * cBC); } }
    }
    detEst.push({ esteira: e.nome, calculo: calcularEsteira(e, produtos, P) });
  }
  let capexT = 0, opexMes = 0; for (const id of usados) { const p = produtos.find(x => x.id === id); capexT += (num(p.capex_horas) || 0) / HORAS_PD * custoPD; opexMes += num(p.opex_mensal) || 0; }
  if (capexT > 0) av.push('CAPEX: horas de desenvolvimento ÷ ' + HORAS_PD + ' h por pessoa-dia × custo por pessoa-dia (hipótese)');
  M[0].capex = capexT; for (let i = 0; i < H; i++) M[i].opex = opexMes;
  const pessoas = num(cen?.pessoas_disponiveis), cap = pessoas ? pessoas * du : null; if (!cap) av.push('Informe as pessoas disponíveis para ver a ocupação da equipe');
  let acum = 0, margAc = 0, min = { v: 0, mes: null }, be = null, neg = false, totRec = 0, totCus = 0, totCac = 0, totOpex = 0, totCash = 0, contratar = null;
  const meses = []; const ofertas = {};
  for (let i = 0; i < H; i++) {
    const m = M[i], margem = m.receita - m.custo, ebitda = margem - m.cac - m.opex, saida = m.custo + m.cac + m.opex + m.capex, fluxo = m.cash_in - saida; acum += fluxo; margAc += margem;
    totRec += m.receita; totCus += m.custo; totCac += m.cac; totOpex += m.opex; totCash += m.cash_in;
    if (acum < min.v) min = { v: acum, mes: i + 1 }; if (acum < 0) neg = true; if (neg && be == null && acum >= 0) be = i + 1;
    const oc = cap ? m.pd / cap * 100 : null, limite = P.limite_ocupacao_pct, cobre = m.receita_rec - (m.receita_rec > 0 ? m.custo * (m.receita_rec / (m.receita || 1)) : 0) >= custoPD * du;
    if (oc != null && limite != null && oc > limite && contratar == null) contratar = { mes: i + 1, ocupacao_pct: r2(oc), recorrencia_cobre: cobre };
    for (const [k, v] of Object.entries(m.por_oferta)) { const o = (ofertas[k] = ofertas[k] || { receita: 0, custo: 0 }); o.receita += v.receita; o.custo += v.custo; }
    meses.push({ mes: i + 1, receita: r2(m.receita), receita_recorrente: r2(m.receita_rec), custo_direto: r2(m.custo), margem_bruta: r2(margem), margem_pct: m.receita > 0 ? r2(margem / m.receita * 100) : null, cac: r2(m.cac), opex: r2(m.opex), capex: r2(m.capex), ebitda_estimado: r2(ebitda), caixa_entrada: r2(m.cash_in), fluxo_caixa: r2(fluxo), caixa_acumulado: r2(acum), margem_acumulada: r2(margAc), pessoa_dias: r2(m.pd), ocupacao_pct: oc == null ? null : r2(oc), descompasso: margAc > 0 && acum < 0 });
  }
  const invest = totCac + totOpex + capexT, ult12 = meses.slice(-12), recAnu = ult12.reduce((s, x) => s + x.receita, 0), arrAnu = (ult12.at(-1)?.receita_recorrente || 0) * 12, totAnu = recAnu * (12 / (ult12.length || 1));
  const margTot = totRec - totCus, margPct = totRec > 0 ? margTot / totRec * 100 : null, ebitda = margTot - totCac - totOpex, ebPct = totRec > 0 ? ebitda / totRec * 100 : null, arrPct = totAnu > 0 ? arrAnu / totAnu * 100 : null;
  const sem = (v, ok, amar) => v == null ? 'cinza' : v >= ok ? 'verde' : v >= amar ? 'amarelo' : 'vermelho';
  const resumo = { horizonte: H, receita: r2(totRec), custo_direto: r2(totCus), margem_bruta: r2(margTot), margem_bruta_pct: margPct == null ? null : r2(margPct), cac_total: r2(totCac), opex_total: r2(totOpex), capex: r2(capexT), ebitda_estimado: r2(ebitda), ebitda_estimado_pct: ebPct == null ? null : r2(ebPct),
    caixa_acumulado_final: r2(acum), caixa_minimo: r2(min.v), mes_caixa_minimo: min.mes, mes_break_even: be, investimento_total: r2(invest), roi_pct: invest > 0 ? r2((margAc - invest) / invest * 100) : null,
    arr_pct_receita: arrPct == null ? null : r2(arrPct), contratar, meses_descompasso: meses.filter(x => x.descompasso).map(x => x.mes),
    semaforos: { margem: { cor: sem(margPct, P.margem_meta_pct, P.margem_piso_pct), motivo: 'Margem bruta consolidada ' + (margPct == null ? 'sem receita' : r2(margPct) + '% (piso ' + P.margem_piso_pct + '%, meta ' + P.margem_meta_pct + '%)') },
      ebitda: { cor: sem(ebPct, P.ebitda_meta_pct, 0), motivo: 'EBITDA estimado ' + (ebPct == null ? '—' : r2(ebPct) + '% (meta ' + P.ebitda_meta_pct + '%, tipo a confirmar com o contador)') },
      arr: { cor: sem(arrPct, P.arr_meta_2027_pct, (P.arr_meta_2027_pct || 0) / 2), motivo: 'Recorrência ' + (arrPct == null ? '—' : r2(arrPct) + '% da receita (meta 2027: ' + P.arr_meta_2027_pct + '%)') },
      caixa: { cor: min.v >= 0 ? 'verde' : be != null ? 'amarelo' : 'vermelho', motivo: min.v >= 0 ? 'Caixa nunca fica negativo no período' : 'Caixa chega a R$ ' + r2(min.v) + ' no mês ' + min.mes + (be != null ? ' e se recupera no mês ' + be : ' e não se recupera no horizonte') } } };
  const por_oferta = Object.entries(ofertas).map(([nome, o]) => ({ nome, receita: r2(o.receita), custo: r2(o.custo), margem: r2(o.receita - o.custo), margem_pct: o.receita > 0 ? r2((o.receita - o.custo) / o.receita * 100) : null }));
  return { horizonte: H, avisos: [...new Set(av)], resumo, meses, por_oferta, esteiras: detEst,
    formulas: { margem: 'receita líquida − custo direto (pessoa-dias × custo por pessoa-dia + custos variáveis)', ebitda: 'margem bruta − CAC − custo fixo mensal (estimativa; tipo a confirmar com o contador)', caixa: 'recebimentos (com DSO; implantação à vista) − custo direto − CAC − custo fixo − investimento inicial', roi: '(margem bruta acumulada − (CAC + custo fixo + investimento inicial)) ÷ (CAC + custo fixo + investimento inicial)', ocupacao: 'pessoa-dias demandados ÷ (pessoas × dias úteis por mês)' } };
}
export async function cenarioSalvar({ kv }, b, usuario) {
  const L = (await kv(K_CENARIOS)) || [], i = b.id ? L.findIndex(x => x.id === b.id) : -1, t = v => String(v ?? '').trim().substring(0, 200);
  const c = { id: i >= 0 ? L[i].id : 'cen_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), nome: t(b.nome), horizonte: num(b.horizonte) || 12, pessoas_disponiveis: num(b.pessoas_disponiveis), premissas: { custo_pessoa_dia: num(b.premissas?.custo_pessoa_dia), conversao_mult: num(b.premissas?.conversao_mult), dso_mult: num(b.premissas?.dso_mult), custo_mult: num(b.premissas?.custo_mult) },
    linhas: (b.linhas || []).slice(0, 8).map(l => ({ esteira_id: l.esteira_id || null, entradas_mes: num(l.entradas_mes), inicio_mes: num(l.inicio_mes) || 0 })), autor: usuario || null, em: new Date().toISOString(), versao: (i >= 0 ? L[i].versao || 0 : 0) + 1 };
  if (!c.nome) throw new Error('Dê um nome ao cenário'); if (i >= 0) L[i] = c; else L.push(c); await kv(K_CENARIOS, L); return { cenarios: L };
}

// Fase 4: sensibilidade (custo por pessoa-dia +10%, prazo de recebimento ×2, conversão ×0,5) e comparação de até 3 cenários.
const KP = r => r.resumo ? { margem_bruta_pct: r.resumo.margem_bruta_pct, ebitda_estimado_pct: r.resumo.ebitda_estimado_pct, caixa_minimo: r.resumo.caixa_minimo, mes_caixa_minimo: r.resumo.mes_caixa_minimo, mes_break_even: r.resumo.mes_break_even, roi_pct: r.resumo.roi_pct, receita: r.resumo.receita, caixa_acumulado_final: r.resumo.caixa_acumulado_final, arr_pct_receita: r.resumo.arr_pct_receita } : null;
export function sensibilidade(cen, produtos, esteiras, prem) {
  const base = simular(cen, produtos, esteiras, prem), mk = (nome, ov) => ({ nome, ...ov, kpi: KP(simular({ ...cen, premissas: { ...(cen.premissas || {}), ...ov.premissas } }, produtos, esteiras, prem)) });
  const b = KP(base), v = [mk('Custo por pessoa-dia +10%', { premissas: { custo_mult: (num(cen?.premissas?.custo_mult) || 1) * 1.1 } }), mk('Prazo de recebimento ×2', { premissas: { dso_mult: (num(cen?.premissas?.dso_mult) || 1) * 2 } }), mk('Conversão entre degraus pela metade', { premissas: { conversao_mult: (num(cen?.premissas?.conversao_mult) || 1) * 0.5 } })];
  const d = (a, c) => a == null || c == null ? null : r2(a - c);
  return { base: b, avisos: base.avisos, variacoes: v.map(x => ({ nome: x.nome, kpi: x.kpi, delta: x.kpi && b ? { margem_bruta_pct: d(x.kpi.margem_bruta_pct, b.margem_bruta_pct), caixa_minimo: d(x.kpi.caixa_minimo, b.caixa_minimo), caixa_acumulado_final: d(x.kpi.caixa_acumulado_final, b.caixa_acumulado_final), roi_pct: d(x.kpi.roi_pct, b.roi_pct) } : null })) };
}
export function comparar(cens, produtos, esteiras, prem) {
  return (cens || []).slice(0, 3).map(c => { const r = simular(c, produtos, esteiras, prem); return { id: c.id, nome: c.nome, horizonte: c.horizonte, kpi: KP(r), semaforos: r.resumo?.semaforos || null, avisos: r.avisos, meses: r.meses.map(m => ({ mes: m.mes, caixa_acumulado: m.caixa_acumulado, margem_acumulada: m.margem_acumulada })) }; });
}
