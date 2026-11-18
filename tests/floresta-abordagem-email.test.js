import test from 'node:test'; import assert from 'node:assert/strict';
import { ambiente } from './_hubspot-falso.mjs';
test('sem telefone + com e-mail vai para Abordagem por e-mail; com telefone fica; sai ao mover de novo', async () => {
  const a = ambiente({}); const sem = a.contato('1', { phone: '', mobilephone: '', email: 'x@empresa.com' }); const com = a.contato('2', { phone: '21999990000', email: 'y@empresa.com' });
  const sim = await a.F.semTelefoneParaEmail({ simular: true }); assert.ok(sim.total >= 1);
  await a.F.semTelefoneParaEmail({ simular: false }, 'fabio');
  const D = await a.F.carregar({ forcar: true }); const g = id => D.cards.find(x => x.id === id);
  assert.equal(g(sem).etapa, 'abordagem_email'); assert.notEqual(g(com).etapa, 'abordagem_email');
  await a.F.mover({ card_id: sem, para: 'abordado' }, 'fabio'); assert.equal((await a.F.carregar({ forcar: true })).cards.find(x => x.id === sem).etapa, 'abordado');
});
