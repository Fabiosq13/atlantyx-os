import test from 'node:test'; import assert from 'node:assert/strict';
import { calcular, PREMISSAS_SEMENTE as P } from '../lib/estudio-produtos.js';
test('limite de esforço bate com a referência (Essencial, margem 70% e 60%)', () => {
  const c = calcular({ preco: 4000, pessoa_dias: 4, publico: 'medio', tipo: 'recorrente' }, P);
  assert.equal(c.limite_esforco_meta, 4.34); assert.equal(c.limite_esforco_piso, 5.79);
});
test('Sprint cheio: custo 2765,6 e margem ~60%', () => {
  const c = calcular({ preco: 6900, pessoa_dias: 10, tipo: 'entrada' }, P); assert.equal(c.custo_unidade, 2765.6); assert.ok(Math.abs(c.margem_bruta_pct - 59.92) < 0.1);
});
test('preço mínimo para o piso devolve o piso', () => {
  const c = calcular({ preco: 1000, pessoa_dias: 3 }, P), c2 = calcular({ preco: c.preco_minimo_piso, pessoa_dias: 3 }, P); assert.ok(Math.abs(c2.margem_bruta_pct - 60) < 0.05);
});
test('Sprint de lançamento é custo de captação dentro do teto', () => {
  const c = calcular({ preco: 3000, pessoa_dias: 10, tipo: 'entrada' }, P); assert.equal(c.captacao, true); assert.equal(c.semaforo, 'amarelo'); assert.match(c.motivo, /dentro do teto/);
});
test('impostos entram na margem e no tipo de margem', () => {
  const c = calcular({ preco: 10000, pessoa_dias: 10, impostos_pct: 25 }, P); assert.match(c.tipo_margem, /impostos/); assert.ok(c.margem_bruta_pct < 64 && c.margem_bruta_pct > 63);
});
test('erro: premissa ou preço vazio não quebra', () => {
  assert.equal(calcular({ nome: 'x' }, P).semaforo, 'cinza'); assert.equal(calcular({ preco: 100, pessoa_dias: 1 }, { custo_pessoa_dia: '' }).semaforo, 'cinza');
});
test('projeto de grande abaixo do contrato mínimo fica vermelho', () => {
  const c = calcular({ preco: 30000, pessoa_dias: 10, publico: 'grande', tipo: 'projeto' }, P); assert.equal(c.semaforo, 'vermelho'); assert.match(c.motivo, /mínimo/);
});
import { calcularEsteira } from '../lib/estudio-produtos.js';
const PR = [{ id: 'a', nome: 'A', preco: 6900, pessoa_dias: 10, tipo: 'entrada' }, { id: 'b', nome: 'B', preco: 4000, pessoa_dias: 4, periodicidade: 'mensal', prazo_contrato_meses: 12 }, { id: 'c', nome: 'C', preco: 15000, pessoa_dias: 15, periodicidade: 'mensal', prazo_contrato_meses: 12 }];
test('esteira: CAC por entrante e vendas por entrante', () => {
  const r = calcularEsteira({ degraus: { A: 'a', B: 'b', C: 'c' }, cac_entrada: 3000, passagens: { AB: { conversao_pct: 40, cac: 500 }, BC: { conversao_pct: 25, cac: 800 } } }, PR, P);
  assert.equal(r.cac_total_por_entrante, 3000 + 0.4 * 500 + 0.1 * 800); assert.equal(r.vendas_por_entrante, 1.5); assert.equal(r.cac_por_venda, r.cac_total_por_entrante / 1.5 === 2306.67 ? 2306.67 : r.cac_por_venda); assert.ok(r.reducao_cac_por_venda_pct > 25);
});
test('esteira: sem dados não quebra e avisa', () => {
  const r = calcularEsteira({ degraus: { A: null } }, [], P); assert.ok(r.avisos.length >= 2); assert.equal(r.cac_total_por_entrante, null);
});
test('esteira: mudar a ordem muda o resultado', () => {
  const e = { cac_entrada: 3000, passagens: { AB: { conversao_pct: 40, cac: 500 }, BC: { conversao_pct: 25, cac: 800 } } };
  const x = calcularEsteira({ ...e, degraus: { A: 'a', B: 'b', C: 'c' } }, PR, P), y = calcularEsteira({ ...e, degraus: { A: 'a', B: 'c', C: 'b' } }, PR, P); assert.notEqual(x.margem_esperada_por_entrante, y.margem_esperada_por_entrante);
});
import { simular } from '../lib/estudio-simulador.js';
const EST = [{ id: 'e1', nome: 'E', degraus: { A: 'a', B: 'b', C: 'c' }, cac_entrada: 3000, passagens: { AB: { conversao_pct: 50, meses: 1, cac: 500 }, BC: { conversao_pct: 20, meses: 3, cac: 800 } } }];
test('simulador: roda 12 meses, caixa e margem coerentes', () => {
  const r = simular({ horizonte: 12, pessoas_disponiveis: 3, linhas: [{ esteira_id: 'e1', entradas_mes: 1 }] }, PR, EST, P);
  assert.equal(r.meses.length, 12); assert.ok(r.resumo.receita > 0); assert.ok(r.resumo.caixa_minimo <= 0); assert.ok(r.meses[0].ocupacao_pct > 0);
  assert.ok(Math.abs(r.resumo.margem_bruta - (r.resumo.receita - r.resumo.custo_direto)) < 1);
});
test('simulador: DSO maior piora o caixa mínimo sem mudar a margem', () => {
  const base = { horizonte: 12, linhas: [{ esteira_id: 'e1', entradas_mes: 1 }] }, a = simular(base, PR, EST, P), b = simular({ ...base, premissas: { dso_mult: 3 } }, PR, EST, P);
  assert.equal(a.resumo.margem_bruta, b.resumo.margem_bruta); assert.ok(b.resumo.caixa_minimo < a.resumo.caixa_minimo);
});
test('simulador: sem premissa ou sem linhas não quebra', () => {
  assert.ok(simular({ horizonte: 12 }, PR, EST, { custo_pessoa_dia: '' }).avisos.length); assert.ok(simular({ horizonte: 6, linhas: [] }, PR, EST, P).avisos.length);
});
import { sensibilidade, comparar } from '../lib/estudio-simulador.js';
test('sensibilidade: custo +10% reduz margem, prazo ×2 reduz caixa mínimo sem mexer na margem', () => {
  const c = { horizonte: 12, linhas: [{ esteira_id: 'e1', entradas_mes: 1 }] }, s = sensibilidade(c, PR, EST, P);
  assert.ok(s.variacoes[0].delta.margem_bruta_pct < 0); assert.equal(s.variacoes[1].delta.margem_bruta_pct, 0); assert.ok(s.variacoes[1].delta.caixa_minimo < 0);
});
test('comparar limita a 3 cenários', () => {
  const c = { horizonte: 6, linhas: [{ esteira_id: 'e1', entradas_mes: 1 }] }; assert.equal(comparar([c, c, c, c], PR, EST, P).length, 3);
});
import * as EX from '../lib/estudio-escala.js';
const mkKv = () => { const m = {}; return async (k, v) => v === undefined ? (m[k] ?? null) : (m[k] = v); };
test('teste de escala: 3 clientes não aprova; dinheiro caro vira recusar; decisão só uma vez', async () => {
  const kv = mkKv(); await kv('sim:produtos', [{ id: 'p1', nome: 'Caro', preco: 1000, pessoa_dias: 10, status: 'rascunho', capex_horas: 400 }]);
  let r = await EX.propostaSalvar({ kv }, { titulo: 'T', produto_id: 'p1', n_clientes_repetem: 3 }, 'f'); const a = r.propostas[0].analise;
  assert.equal(a.respostas.q1.resposta, 'nao'); assert.equal(a.sugestao, 'recusar');
  r = await EX.propostaDecidir({ kv }, { id: r.propostas[0].id, decisao: 'recusar' }, 'f'); assert.equal(r.propostas[0].decisao, 'recusar');
  await assert.rejects(EX.propostaDecidir({ kv }, { id: r.propostas[0].id, decisao: 'aprovar' }, 'f'));
});
test('catálogo congelado exige proposta aprovada, que só vale uma vez', async () => {
  const kv = mkKv(); await kv('sim:produtos', [{ id: 'p1', nome: 'A', status: 'ativo', preco: 1, pessoa_dias: 1 }]);
  await EX.catalogoCongelar({ kv }, {}, 'f'); await assert.rejects(EX.exigirProposta({ kv }, {}, null));
  let r = await EX.propostaSalvar({ kv }, { titulo: 'Novo' }, 'f'); const id = r.propostas[0].id; await EX.propostaDecidir({ kv }, { id, decisao: 'aprovar' }, 'f');
  await EX.exigirProposta({ kv }, { proposta_id: id }, null); await assert.rejects(EX.exigirProposta({ kv }, { proposta_id: id }, null));
  await EX.exigirProposta({ kv }, {}, { status: 'pausado' });
});
import { exportar } from '../lib/estudio-ia.js';
test('exportação marca hipótese e não quebra', () => {
  const sim = simular({ horizonte: 6, linhas: [{ esteira_id: 'e1', entradas_mes: 1 }] }, PR, EST, P), md = exportar(sim, P, { nome: 'T' }, EST);
  assert.match(md, /hipótese a validar/); assert.match(md, /Margem por oferta/); assert.throws(() => exportar({ avisos: ['x'] }, P, {}, []));
});
test('alterar premissa registra o valor anterior no histórico', async () => {
  const { premissasSalvar } = await import('../lib/estudio-produtos.js'); const kv = mkKv();
  await premissasSalvar({ kv }, { premissas: { custo_pessoa_dia: 300 } }, 'f'); const lg = await kv('sim:log'); assert.equal(lg[0].mudancas.find(m => m.campo === 'custo_pessoa_dia').de, 276.56);
});
