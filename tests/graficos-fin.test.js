import test from 'node:test'; import assert from 'node:assert/strict';
import { montarCaixa, montarOrcamento, mesesDoAno } from '../lib/graficos-fin.js';
// dados sintéticos (nenhum cliente real)
const ext = ano => { let saldo = 100000; const meses = mesesDoAno(ano).map((k, i) => { const er = i < 5 ? 50000 + i * 1000 : 0, sr = i < 5 ? 40000 : 0, ep = i >= 4 ? 60000 : 0, sp = i >= 4 ? 45000 : 0;
  const m = { mes: k, entradas: er + ep, saidas: sr + sp, entradas_realizadas: er, saidas_realizadas: sr, entradas_previstas: ep, saidas_previstas: sp }; m.resultado = m.entradas - m.saidas; m.saldo_inicio = saldo; saldo += m.resultado; m.saldo_fim = saldo; return m; });
  return { meses, saldo_inicial: 100000, saldo_hoje: 150000 }; };
const metas = { faturamento: 1200000, margem_pct: 10, mensal: null, caixa_minimo: 80000 };

test('meta mensal = faturamento do mês × margem; sem sazonalidade usa anual ÷ 12', () => {
  const d = montarCaixa({ ano: 2026, extrato: ext(2026), metas, hoje: '2026-05-18' });
  assert.equal(d.caixa.mensal.meta[0], 10000); assert.equal(d.caixa.mensal.meta.length, 12);
  assert.ok(d.avisos.some(a => /anual ÷ 12/.test(a)));
  const c = montarCaixa({ ano: 2026, extrato: ext(2026), metas: { ...metas, mensal: [200000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000, 100000] }, hoje: '2026-05-18' });
  assert.equal(c.caixa.mensal.meta[0], 20000); assert.equal(c.caixa.mensal.meta[1], 10000);
});
test('real só até o mês corrente; previsto do mês corrente em diante; fechados no resumo', () => {
  const d = montarCaixa({ ano: 2026, extrato: ext(2026), metas, hoje: '2026-05-18' }); const m = d.caixa.mensal;
  assert.equal(d.indice_mes_atual, 4); assert.equal(m.real[3], 53000 - 40000); assert.equal(m.real[4], 54000 - 40000); // mês corrente: só o realizado até hoje
  assert.equal(m.real[5], null); assert.equal(m.previsto[3], null); assert.equal(m.previsto[4], (54000 + 60000) - (40000 + 45000)); assert.equal(m.previsto[5], 15000); assert.equal(d.resumo.meses_fechados, 4);
  assert.equal(d.resumo.resultado_real_fechado, 10000 + 11000 + 12000 + 13000); assert.equal(d.resumo.meta_fechado, 40000);
  assert.equal(d.resumo.desvio_fechado, 6000); assert.equal(d.resumo.situacao, 'acima da meta');
});
test('acumulado: previsto parte do acumulado real dos meses fechados; meta soma corrida', () => {
  const d = montarCaixa({ ano: 2026, extrato: ext(2026), metas, hoje: '2026-05-18' }); const a = d.caixa.acumulado;
  assert.equal(a.real[3], 46000); assert.equal(a.previsto[3], null); assert.equal(a.previsto[4], 46000 + d.caixa.mensal.previsto[4]);
  assert.equal(a.meta[11], 120000); assert.equal(d.resumo.meta_ano, 120000);
  assert.equal(d.resumo.projecao_fim_ano, a.previsto[11]);
});
test('saldo: meta = saldo inicial + meta acumulada; mês corrente usa o saldo de hoje', () => {
  const d = montarCaixa({ ano: 2026, extrato: ext(2026), metas, hoje: '2026-05-18' }); const s = d.caixa.saldo;
  assert.equal(s.meta[0], 110000); assert.equal(s.meta[11], 220000); assert.equal(s.real[4], 150000); assert.equal(s.real[5], null); assert.equal(s.minimo, 80000);
});
test('sem meta cadastrada: linha Meta vazia e aviso; sem extrato: Real vazio e aviso', () => {
  const a = montarCaixa({ ano: 2026, extrato: ext(2026), metas: null, hoje: '2026-05-18' });
  assert.ok(a.caixa.mensal.meta.every(v => v == null)); assert.ok(a.avisos.some(x => /Sem meta de faturamento/.test(x))); assert.equal(a.resumo.desvio_fechado, null);
  const b = montarCaixa({ ano: 2026, extrato: null, metas, hoje: '2026-05-18' });
  assert.ok(b.caixa.mensal.real.every(v => v == null)); assert.ok(b.avisos.some(x => /indisponível/.test(x)));
});
test('ano passado: tudo real, sem previsto; ano futuro: tudo previsto', () => {
  const p = montarCaixa({ ano: 2025, extrato: ext(2025), metas, hoje: '2026-05-18' }); assert.ok(p.caixa.mensal.previsto.every(v => v == null)); assert.equal(p.resumo.meses_fechados, 12);
  const f = montarCaixa({ ano: 2027, extrato: ext(2027), metas, hoje: '2026-05-18' }); assert.ok(f.caixa.mensal.real.every(v => v == null)); assert.equal(f.indice_mes_atual, -1); assert.equal(f.resumo.meses_fechados, 0);
});
test('meta padrão da empresa avisa para cadastrar a aprovada', () => {
  const d = montarCaixa({ ano: 2026, extrato: ext(2026), metas: { ...metas, padrao: true }, hoje: '2026-05-18' }); assert.ok(d.avisos.some(a => /padrão da empresa/.test(a)));
});

const grupo = (o, r) => ({ meses: Object.fromEntries(mesesDoAno(2026).map((m, i) => [m, { orcado: o[i], real: r[i] }])) });
const dre = { grupos: { receitas: grupo(Array(12).fill(100000), [90000, 110000, 100000, 95000, 98000, ...Array(7).fill(0)]), custos: grupo(Array(12).fill(20000), [22000, 20000, 19000, 21000, 20000, ...Array(7).fill(0)]), despesas: grupo(Array(12).fill(50000), [48000, 52000, 50000, 49000, 51000, ...Array(7).fill(0)]) },
  resultados: { resultado_liquido: grupo(Array(12).fill(30000), [20000, 38000, 31000, 25000, 27000, ...Array(7).fill(0)]) }, avisos: ['Mês corrente (05/2026): realizado até hoje + orçado dos 13 dia(s) restantes.'] };
test('orçamento × real: real só até o mês corrente; gastos = custos + despesas; acumulado e resumo', () => {
  const d = montarOrcamento({ ano: 2026, dre, hoje: '2026-05-18' });
  assert.equal(d.series.gastos.orcado[0], 70000); assert.equal(d.series.gastos.real[0], 70000); assert.equal(d.series.receitas.real[5], null);
  assert.equal(d.series.receitas.acumulado.real[4], 90000 + 110000 + 100000 + 95000 + 98000);
  assert.equal(d.resumo.ate_mes, '2026-05'); assert.equal(d.resumo.receitas.orcado, 500000); assert.equal(d.resumo.receitas.desvio, -7000);
  assert.equal(d.resumo.leitura.receitas, 'abaixo do orçado'); assert.equal(d.resumo.gastos.real, 70000 + 72000 + 69000 + 70000 + 71000); assert.equal(d.resumo.gastos.desvio, 352000 - 350000); assert.equal(d.resumo.leitura.gastos, 'acima do orçado');
});
test('orçamento: sem orçado avisa; sem DRE devolve aviso e nenhuma série', () => {
  const z = { ...dre, grupos: { receitas: grupo(Array(12).fill(0), Array(12).fill(5)), custos: grupo(Array(12).fill(0), Array(12).fill(1)), despesas: grupo(Array(12).fill(0), Array(12).fill(1)) } };
  assert.ok(montarOrcamento({ ano: 2026, dre: z, hoje: '2026-05-18' }).avisos.some(a => /Sem orçamento cadastrado/.test(a)));
  const n = montarOrcamento({ ano: 2026, dre: null, hoje: '2026-05-18' }); assert.equal(n.series, null); assert.ok(n.avisos.length);
});

test('impostos novos: 2027 desconta 25% − 16,33% sobre as entradas; 2026 não tem linha líquida', () => {
  const r27 = montarCaixa({ ano: 2027, extrato: ext(2027), metas, hoje: '2026-11-21' });
  const m = ext(2027).meses[0], imp = Math.round(m.entradas * 0.0867 * 100) / 100;
  assert.equal(r27.imposto.ativo, true);
  assert.equal(r27.caixa.mensal.liquido[0], Math.round((m.resultado - imp) * 100) / 100);
  assert.equal(r27.caixa.acumulado.liquido[1], Math.round((r27.caixa.mensal.liquido[0] + r27.caixa.mensal.liquido[1]) * 100) / 100);
  assert.ok(r27.caixa.saldo.liquido[11] < ext(2027).meses[11].saldo_fim);
  const r26 = montarCaixa({ ano: 2026, extrato: ext(2026), metas, hoje: '2026-11-21' });
  assert.equal(r26.imposto.ativo, false);
  assert.ok(r26.caixa.mensal.liquido.every(v => v == null));
  assert.ok(r26.avisos.some(a => /jan\/2027/.test(a)));
});
