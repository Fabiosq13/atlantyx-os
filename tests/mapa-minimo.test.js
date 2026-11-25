import test from 'node:test'; import assert from 'node:assert/strict';
import { mapaMinimo, setorDoLead } from '../lib/mapa-minimo.js';
// v3.602 — plano de exceção do Mapa de Oportunidades: setor e porte, sem número inventado. Dados sintéticos.
test('setor reconhecido pelo texto do lead e porte entra na frase', () => {
  assert.equal(setorDoLead('Distribuição de energia elétrica'), 'energia'); assert.equal(setorDoLead('Seguradora'), 'financeiro'); assert.equal(setorDoLead('Indústria de alimentos'), 'industria'); assert.equal(setorDoLead(''), 'geral');
  const m = mapaMinimo({ name: 'Ana Souza', company: 'Energia Sintética SA', setor: 'Energia', porte: '501_1000' });
  assert.equal(m.minimo, true); assert.match(m.texto, /Olá Ana/); assert.match(m.texto, /energia e utilities/); assert.match(m.texto, /grande porte/); assert.match(m.texto, /\*1\. /); assert.match(m.texto, /\*3\. /); assert.match(m.texto, /hipóteses/);
});
test('sem setor nem porte: mapa geral, sem afirmar nada sobre a empresa e sem número', () => {
  const m = mapaMinimo({ name: '', company: 'Empresa Exemplo' });
  assert.match(m.texto, /Empresa Exemplo/); assert.ok(!/Como Empresa Exemplo atua/.test(m.texto)); assert.equal(m.oportunidades.length, 3);
  assert.ok(!/\d+\s?%|\bR\$/.test(m.texto));
});
test('usa o setor da análise parcial quando o lead não informou', () => { assert.match(mapaMinimo({ company: 'X' }, { setor: 'Varejo' }).texto, /varejo de grande porte/); });
