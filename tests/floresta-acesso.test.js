import test from 'node:test'; import assert from 'node:assert/strict';
import { funilDoLogin, cardNoFunil, idsDoPayload } from '../lib/floresta-acesso.js';
test('Ademir só padrão, Patricia só WX, demais livres', () => {
  assert.equal(funilDoLogin('ademir'), 'padrao'); assert.equal(funilDoLogin('Patricia'), 'wx'); assert.equal(funilDoLogin('fabio'), null); assert.equal(funilDoLogin(''), null);
  assert.equal(funilDoLogin('fabio', { fabio: 'wx' }), 'wx');
});
test('cardNoFunil separa WX do padrão', () => {
  const wx = { nome: 'x', empresa: 'WXC', dono: 'Patrícia' }, pad = { nome: 'y', empresa: 'Acme', dono: 'Ademir' };
  assert.equal(cardNoFunil(wx, 'wx'), true); assert.equal(cardNoFunil(wx, 'padrao'), false);
  assert.equal(cardNoFunil(pad, 'padrao'), true); assert.equal(cardNoFunil(pad, 'wx'), false); assert.equal(cardNoFunil(wx, null), true);
});
test('idsDoPayload junta ids', () => assert.deepEqual(idsDoPayload({ card_id: 'a', ids: ['b', 'c'] }), ['a', 'b', 'c']));
