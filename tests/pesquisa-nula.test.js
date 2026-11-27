import test from 'node:test'; import assert from 'node:assert/strict';
import * as PQ from '../lib/estrategia-pesquisa.js';
test('pesquisa ainda não salva (null) não quebra a Jornada', () => {
  const st = PQ.pesquisaStatus(null, { mercado_ia: null });
  assert.ok(st && Array.isArray(st.etapas));
  assert.ok(PQ.pesquisaResumoTexto(null, st).includes('PESQUISA'));
  assert.ok(PQ.pesquisaNormalizar(null).mercado);
});
