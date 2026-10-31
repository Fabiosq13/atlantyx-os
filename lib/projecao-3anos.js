// lib/projecao-3anos.js — v3.286 · PROJEÇÃO DE 5 ANOS (Planejamento; até v3.340 eram 3 anos — o nome do arquivo ficou)
// Determinístico: a IA (ATLAS) só sugere premissas e comenta; os números saem daqui.
// Base = ano em curso (realizado + projeção de fechamento) aberto pelos 3 motores de negócio da Atlantyx
// (pessoas/alocação, projetos, produtos). Para cada ano: receita por motor = receita do ano anterior × (1 + crescimento),
// margem de contribuição por motor, despesas fixas (estrutura) crescendo pelo seu %, resultado = MC − fixas,
// receita recorrente, quadro de pessoas necessário e caixa acumulado. Três cenários: pessimista, base e otimista.

export const MOTORES = { pessoas: 'Alocação de pessoas', projetos: 'Projetos', produtos: 'Produtos (Atlantyx OS e verticais)' };
const r0 = v => Math.round(Number(v) || 0);
const r1 = v => Math.round((Number(v) || 0) * 10) / 10;
const num = (v, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };

// premissas padrão (o usuário ou o ATLAS ajustam)
export function premissasPadrao(base = {}) {
  const anoBase = parseInt(base.ano) || new Date().getFullYear();
  const mix = base.mix_pct || { pessoas: 50, projetos: 40, produtos: 10 };
  const mc = base.mc_pct || { pessoas: 25, projetos: 40, produtos: 70 };
  // v3.341: horizonte de 5 anos (2027–2031) — 2027 é o primeiro degrau; crescimento dos produtos desacelera depois do 3º ano
  const anos = [1, 2, 3, 4, 5].map(k => ({ ano: anoBase + k,
    crescimento_pct: { pessoas: k <= 3 ? 15 : 12, projetos: k <= 3 ? 20 : 15, produtos: k === 1 ? 80 : k <= 3 ? 60 : 40 },
    mc_pct: { ...mc }, despesas_fixas_cresc_pct: 10, recorrencia_pct: Math.min(60, num(base.recorrencia_pct, 20) + 10 * k) }));
  return { ano_base: anoBase, receita_base: r0(base.receita), mix_pct: { ...mix }, despesas_fixas_base: base.despesas_fixas != null ? r0(base.despesas_fixas) : null,
    caixa_inicial: r0(base.caixa), conversao_caixa_pct: 85, receita_por_pessoa_mes: base.receita_por_pessoa_mes ? r0(base.receita_por_pessoa_mes) : null,
    pessoas_base: base.pessoas != null ? parseInt(base.pessoas) : null, pessoas_estrutura: base.pessoas_estrutura != null ? parseInt(base.pessoas_estrutura) : 3,
    cenarios: { pessimista: { fator_crescimento: 0.5, delta_mc_pp: -3 }, otimista: { fator_crescimento: 1.4, delta_mc_pp: 2 } }, anos };
}

export function normalizar(p = {}, base = {}) {
  const d = premissasPadrao(base), o = { ...d, ...p };
  o.mix_pct = { ...d.mix_pct, ...(p.mix_pct || {}) };
  const sm = Object.keys(MOTORES).reduce((s, k) => s + Math.max(0, num(o.mix_pct[k])), 0) || 1;
  for (const k of Object.keys(MOTORES)) o.mix_pct[k] = r1(Math.max(0, num(o.mix_pct[k])) / sm * 100);
  o.cenarios = { pessimista: { ...d.cenarios.pessimista, ...(p.cenarios?.pessimista || {}) }, otimista: { ...d.cenarios.otimista, ...(p.cenarios?.otimista || {}) } };
  o.anos = d.anos.map((a, i) => { const x = (p.anos || [])[i] || {}; return { ano: a.ano, crescimento_pct: { ...a.crescimento_pct, ...(x.crescimento_pct || {}) }, mc_pct: { ...a.mc_pct, ...(x.mc_pct || {}) },
    despesas_fixas_cresc_pct: num(x.despesas_fixas_cresc_pct, a.despesas_fixas_cresc_pct), recorrencia_pct: Math.max(0, Math.min(100, num(x.recorrencia_pct, a.recorrencia_pct))) }; });
  for (const k of ['receita_base', 'despesas_fixas_base', 'caixa_inicial', 'conversao_caixa_pct', 'receita_por_pessoa_mes', 'pessoas_base', 'pessoas_estrutura'])
    if (o[k] != null && o[k] !== '') o[k] = num(o[k]); else if (k !== 'despesas_fixas_base' && k !== 'receita_por_pessoa_mes' && k !== 'pessoas_base') o[k] = d[k];
  return o;
}

function rodar(P, fator = 1, deltaMc = 0) {
  const mix = P.mix_pct, R0 = num(P.receita_base);
  let rec = Object.fromEntries(Object.keys(MOTORES).map(k => [k, R0 * mix[k] / 100]));
  // despesas fixas do ano base: informada, ou MC do ano base − resultado (margem de 10% quando não há dado)
  const mc0 = Object.keys(MOTORES).reduce((s, k) => s + rec[k] * num(P.anos[0].mc_pct[k]) / 100, 0);
  let fixas = P.despesas_fixas_base != null ? num(P.despesas_fixas_base) : Math.max(0, mc0 - R0 * 0.10);
  let caixa = num(P.caixa_inicial);
  const linhas = [];
  for (const a of P.anos) {
    rec = Object.fromEntries(Object.keys(MOTORES).map(k => [k, rec[k] * (1 + num(a.crescimento_pct[k]) * fator / 100)]));
    const total = Object.values(rec).reduce((s, v) => s + v, 0);
    // v3.312: imposto do ano (ex.: 2027 = 25%) acima da alíquota efetiva da base reduz a margem de contribuição na mesma proporção da receita
    const aliqA = P._aliq_ano?.[String(a.ano)], dImp = aliqA != null && P._aliq_base != null ? num(aliqA) - num(P._aliq_base) : 0;
    const mcM = Object.fromEntries(Object.keys(MOTORES).map(k => [k, rec[k] * Math.max(0, Math.min(100, num(a.mc_pct[k]) + deltaMc - dImp)) / 100]));
    const mc = Object.values(mcM).reduce((s, v) => s + v, 0);
    fixas = fixas * (1 + num(a.despesas_fixas_cresc_pct) / 100);
    const resultado = mc - fixas;
    caixa += resultado * num(P.conversao_caixa_pct, 85) / 100;
    const rpp = num(P.receita_por_pessoa_mes);
    const pessoasAloc = rpp > 0 ? Math.ceil(rec.pessoas / 12 / rpp) : null;
    linhas.push({ ano: a.ano, receita: r0(total), por_motor: Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, r0(v)])), mc: r0(mc), mc_por_motor: Object.fromEntries(Object.entries(mcM).map(([k, v]) => [k, r0(v)])),
      mc_pct: total ? r1(mc / total * 100) : null, despesas_fixas: r0(fixas), resultado: r0(resultado), margem_pct: total ? r1(resultado / total * 100) : null,
      recorrente: r0(total * num(a.recorrencia_pct) / 100), recorrencia_pct: num(a.recorrencia_pct), pessoas_alocadas: pessoasAloc, imposto_ano_pct: aliqA ?? null, imposto_ajuste_pp: dImp ? r1(-dImp) : 0,
      pessoas_total: pessoasAloc != null ? pessoasAloc + num(P.pessoas_estrutura) : null, caixa_acumulado: r0(caixa) });
  }
  return linhas;
}

export function projetar(premissas = {}, base = {}) {
  const P = normalizar(premissas, base); P._aliq_ano = base.aliquota_ano || null; P._aliq_base = base.aliquota_base_pct ?? null; // v3.312
  const C = { pessimista: rodar(P, num(P.cenarios.pessimista.fator_crescimento, 0.5), num(P.cenarios.pessimista.delta_mc_pp, -3)), base: rodar(P), otimista: rodar(P, num(P.cenarios.otimista.fator_crescimento, 1.4), num(P.cenarios.otimista.delta_mc_pp, 2)) };
  const B = C.base, R0 = num(P.receita_base), fim = B[B.length - 1];
  const cagr = R0 > 0 && fim?.receita > 0 ? r1((Math.pow(fim.receita / R0, 1 / B.length) - 1) * 100) : null;
  const alertas = [];
  B.forEach(l => { if (l.resultado < 0) alertas.push(`${l.ano}: resultado negativo (${l.margem_pct}%) — estrutura cresce mais rápido que a margem`); if (l.caixa_acumulado < 0) alertas.push(`${l.ano}: caixa acumulado negativo — precisa de capital ou de prazo de recebimento menor`); });
  if (B.length && B[B.length - 1].mc_pct < 30) alertas.push('Margem de contribuição abaixo de 30% no último ano — o mix ainda depende muito de alocação');
  return { premissas: P, cenarios: C, resumo: { receita_base: r0(R0), receita_final: fim?.receita ?? null, cagr_pct: cagr, resultado_final: fim?.resultado ?? null, margem_final_pct: fim?.margem_pct ?? null, recorrente_final: fim?.recorrente ?? null }, alertas };
}

export function resumoTexto(proj) { // compacto, para o prompt do ATLAS
  if (!proj?.cenarios?.base) return 'Projeção de 5 anos ainda não montada.';
  const b = proj.cenarios.base.map(l => `${l.ano}: receita ${l.receita} (pessoas ${l.por_motor.pessoas}, projetos ${l.por_motor.projetos}, produtos ${l.por_motor.produtos}), MC ${l.mc_pct}%, fixas ${l.despesas_fixas}, resultado ${l.resultado} (${l.margem_pct}%), recorrente ${l.recorrente}, pessoas ${l.pessoas_total ?? '—'}, caixa ${l.caixa_acumulado}`).join('\n');
  const pe = proj.cenarios.pessimista.at(-1), ot = proj.cenarios.otimista.at(-1);
  return `PROJEÇÃO ${proj.cenarios.base.length} ANOS (cenário base; ano-base ${proj.premissas.ano_base}, receita-base ${proj.resumo.receita_base}, CAGR ${proj.resumo.cagr_pct}%):\n${b}\nÚltimo ano — pessimista: receita ${pe?.receita}, resultado ${pe?.resultado} · otimista: receita ${ot?.receita}, resultado ${ot?.resultado}.${proj.alertas?.length ? '\nAlertas: ' + proj.alertas.join(' · ') : ''}`;
}
