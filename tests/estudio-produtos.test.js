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
