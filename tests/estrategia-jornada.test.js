import test from 'node:test'; import assert from 'node:assert/strict';
import { REUNIOES, jornadaGerar, jornadaAplicar, jornadaNormalizar } from '../lib/estrategia-jornada.js';
import { calendarioGerar, CHECKLIST_TRIMESTRE, CHECKLIST_REVISAO } from '../lib/estrategia-roteiro.js';
test('seis reuniões na ordem do método, Business Plan na 4', () => {
  assert.deepEqual(REUNIOES.map(r => r.n), [1, 2, 3, 4, 5, 6]);
  assert.ok(REUNIOES[3].checklist.some(([k]) => k === 'business_plan'));
  assert.ok(REUNIOES[3].perguntas.every(n => n >= 7)); assert.ok(REUNIOES[0].perguntas.every(n => n <= 5));
});
test('ordem invertida gera alerta e checklist aberto também', () => {
  let E = jornadaAplicar({}, { reuniao: 'r4', feito: true }, 'f');
  const r4 = jornadaGerar(E, { etapas: [] }).reunioes[3];
  assert.ok(r4.alertas.some(a => a.includes('1, 2, 3'))); assert.ok(r4.alertas.some(a => a.includes('checklist')));
});
test('decisão, checklist, remoção e reunião inválida', () => {
  let E = jornadaAplicar({}, { reuniao: 'r1', decisao: { texto: 'Caixa mínimo 3 meses' }, checklist: { socios: true } }, 'f');
  let r1 = jornadaGerar(E, { etapas: [] }).reunioes[0];
  assert.equal(r1.decisoes.length, 1); assert.equal(r1.progresso, 25);
  E = jornadaAplicar(E, { reuniao: 'r1', decisao_remover: r1.decisoes[0].id }); assert.equal(jornadaNormalizar(E).reunioes.r1.decisoes.length, 0);
  assert.throws(() => jornadaAplicar({}, { reuniao: 'r9' })); assert.throws(() => jornadaAplicar({}, { reuniao: 'r1', decisao: { texto: ' ' } }));
});
test('Business Plan entra no check-in trimestral e na revisão anual', () => {
  assert.ok(CHECKLIST_TRIMESTRE.some(([k]) => k === 'business_plan')); assert.ok(CHECKLIST_REVISAO.some(([k]) => k === 'business_plan'));
  const c = calendarioGerar({}, '2027-01-01').eventos.find(e => e.tipo === 'checkin'); assert.ok(c.checklist.some(x => x.chave === 'business_plan'));
});
