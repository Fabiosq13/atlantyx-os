import test from 'node:test'; import assert from 'node:assert/strict';
import { ajustarMargemBruta } from '../lib/margem-caixa.js';
test('margem bruta usa folha total e desconta impostos, com detalhe', () => {
  const serie = [{ mes: '2026-10', receita_faturada: 100000, custo_direto: 0 }];
  const r = ajustarMargemBruta(serie, { '2026-10': 30000 }, { folha_por_mes: { '2026-10': 60000 }, aliquota: 0.16,
    detalhe_por_mes: { '2026-10': { pessoas: [{ nome: 'A', folha: 40000, em_projeto: 30000, interno: 5000, sem_apontamento: 5000, horas_projeto: 100, horas_internas: 10 }, { nome: 'B', folha: 20000, em_projeto: 0, interno: 0, sem_apontamento: 20000 }] } } })[0];
  assert.equal(r.custo_direto, 60000); assert.equal(r.margem_bruta, 24000); assert.equal(r.margem_bruta_pct, 24);
  assert.equal(r.detalhe.sem_apontamento, 25000); assert.equal(r.detalhe.margem_antiga_pct, 70);
});
test('sem folha no mês = dado ausente, nunca 100%', () => {
  const r = ajustarMargemBruta([{ mes: '2026-09', receita_faturada: 50000, custo_direto: 0 }], {}, {})[0];
  assert.equal(r.margem_bruta, null); assert.equal(r.margem_bruta_pct, null);
});
