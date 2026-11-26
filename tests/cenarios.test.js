import test from 'node:test'; import assert from 'node:assert/strict';
import { calcular, valores, estado, salvar, K_CENARIOS, CAMPOS } from '../lib/cenarios.js';
// v3.605 — Cenários 2027. Os números esperados batem com a planilha aprovada (hipóteses; dados sintéticos).
const perto = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const kvMem = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };

test('Jelta: suíte, ARR e resultado batem com a planilha', () => {
  const r = calcular({ 'comum.imposto': 0.25, 'comum.imposto_sust': 0.29 }); const g = r.gelta; // planilha original: imposto 25% e 29% (o padrão de 2027 agora é 30%, Guia 2027)
  perto(g.suite.recPond, 6096); perto(g.suite.custoPond, 1839, 0.01); perto(g.suite.margemPond, 0.5978, 0.001);
  perto(g.cenarios[1].arr, 731520); perto(g.cenarios[1].runrate, 327959.9, 0.1); perto(g.cenarios[1].resultado1, 201249.1, 0.1); perto(g.cenarios[0].payback, 7.08, 0.01);
  perto(g.sanidade.mensal, 23100); assert.equal(g.sanidade.mesesParaIgualar, 0);   // v3.618: valor do projeto Jelta não informado (antes havia um número hipotético)
});
test('IARA, Maestro e frentes batem com a planilha', () => {
  const r = calcular({ 'comum.imposto': 0.25, 'comum.imposto_sust': 0.29 });
  perto(r.iara.cenarios[1].arr, 912000); perto(r.iara.cenarios[1].resultado1, 340876, 0.1); perto(r.iara.cliente.margemMetade, 0.666, 0.01);
  perto(r.maestro.cenarios[1].arr, 1770000); perto(r.maestro.cenarios[1].runrate, 1047938.4, 0.1);
  perto(r.frentes.gp[1].contrib, 239319.27, 0.01); perto(r.frentes.sust[1].contrib, 47520); perto(r.frentes.funil[1].contrib, 283805.33, 0.01);
  assert.equal(r.comparativo.maiorArr, 'IARA'); // Maestro fora do plano 2027
});
test('premissas: valor inválido volta ao padrão; salvar valida e só guarda o que mudou', async () => {
  assert.equal(valores({ 'gelta.lojas': 'x' })['gelta.lojas'], 12); assert.equal(valores({ 'gelta.lojas': -3 })['gelta.lojas'], 12);
  const kv = kvMem(); const e = await salvar(kv, { 'gelta.lojas': 20, 'comum.imposto': 0.3, 'campo.que.nao.existe': 9 }, 'fabio');
  assert.deepEqual(e.alterados, ['gelta.lojas']); assert.equal(e.valores['gelta.lojas'], 20); assert.equal((await kv.get(K_CENARIOS)).por, 'fabio');
  await assert.rejects(() => salvar(kv, { 'comum.imposto': 2 }, 'fabio'), /inválido/);
  const e2 = await estado(kv); assert.equal(e2.campos.length, CAMPOS.length); assert.ok(e2.resultado.gelta.cenarios[0].arr > 0);
  const sem = await salvar(kv, {}, 'fabio'); assert.deepEqual(sem.alterados, []);
});
