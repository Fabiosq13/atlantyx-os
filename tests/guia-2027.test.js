// v3.636 — ajustes do Guia do Planejamento 2027: imposto 30%, pessoas e liderança, alerta de metas precoces
import test from 'node:test'; import assert from 'node:assert/strict';
import { valores } from '../lib/cenarios.js';
import * as JN from '../lib/estrategia-jornada.js';
import * as RT from '../lib/estrategia-roteiro.js';
import { CATALOGO } from '../api/placar.js';

test('imposto 2027: 30% na receita e 30% na sustentação', () => { const P = valores({}); assert.equal(P['comum.imposto'], 0.30); assert.equal(P['comum.imposto_sust'], 0.30); assert.equal(P['comum.custo_dia'], 276.56); });
test('pessoas e liderança: registra, edita e remove', () => {
  let e = JN.jornadaAplicar({}, { pessoa: { area: 'Dados', pessoa: 'Fulano', estagio: 'autonoma', plano90: 'Assumir comitê' } }, 'fabio'); assert.equal(e.pessoas.length, 1);
  const id = e.pessoas[0].id; e = JN.jornadaAplicar(e, { pessoa: { id, area: 'Dados', pessoa: 'Fulano', estagio: 'em_desenvolvimento' } }, 'fabio'); assert.equal(e.pessoas.length, 1); assert.equal(e.pessoas[0].estagio, 'em_desenvolvimento');
  assert.throws(() => JN.jornadaAplicar({}, { pessoa: { area: '', pessoa: '' } }, 'fabio'));
  e = JN.jornadaAplicar(e, { pessoa_remover: id }, 'fabio'); assert.equal(e.pessoas.length, 0);
});
test('jornada traz participantes, decisões em aberto e checklist de origem e pessoas', () => {
  const G = JN.jornadaGerar({}, { etapas: [] }); assert.ok(G.decisoes_abertas.length >= 8); assert.ok(G.reunioes.every(r => r.participantes && r.traz));
  const r5 = G.reunioes.find(r => r.n === 5); assert.ok(r5.checklist.some(c => c.chave === 'origem') && r5.checklist.some(c => c.chave === 'pessoas'));
  assert.ok(G.reunioes.find(r => r.n === 4).checklist.some(c => c.chave === 'niveis'));
});
test('alerta: pergunta de metas aberta antes das reuniões 1 a 3', () => {
  const R = RT.roteiroNormalizar({}); R.etapas[7].estado = 'rascunho';
  const st = RT.roteiroStatus(R, { reunioesFeitas: [1] }), q7 = st.etapas.find(e => e.n === 7);
  assert.ok(q7.alertas.some(a => /chute/.test(a)));
  const ok = RT.roteiroStatus(R, { reunioesFeitas: [1, 2, 3] }).etapas.find(e => e.n === 7); assert.ok(!ok.alertas.some(a => /chute/.test(a)));
});
test('placar: cinco origens da receita nova, manuais e fora da TV', () => {
  const o = CATALOGO.filter(c => c.id.startsWith('rec_origem_')); assert.equal(o.length, 5); assert.ok(o.every(c => c.fonte === 'manual' && !c.visivel_tv));
});
