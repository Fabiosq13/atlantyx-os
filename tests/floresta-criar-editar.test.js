import test from 'node:test'; import assert from 'node:assert/strict';
import { ambiente } from './_hubspot-falso.mjs';
test('criar lead/negócio e editar pela Floresta', async () => {
  const a = ambiente({}); a.contato('1', { email: 'a@x.com' });
  const dup = await a.F.criar({ tipo: 'lead', nome: 'Fulano', email: 'a@x.com' }, 'fabio'); assert.equal(dup.existe, true);
  const novo = await a.F.criar({ tipo: 'lead', nome: 'Beltrano Silva', email: 'b@y.com', telefone: '21999990000', empresa: 'Y SA', origem: 'Evento' }, 'fabio'); assert.equal(novo.existe, false); assert.ok(novo.contato_id);
  await assert.rejects(() => a.F.criar({ tipo: 'lead', nome: 'X', email: 'invalido' }, 'f'), /E-mail inválido/);
  const neg = await a.F.criar({ tipo: 'negocio', nome_negocio: 'Projeto Y', valor: '15.000', fechamento: '2026-12-31', etapa: 'proposta', contato_id: novo.contato_id }, 'fabio'); assert.ok(neg.negocio_id);
  const D = await a.F.carregar({ forcar: true }); const n = D.cards.find(x => x.id === 'n:' + neg.negocio_id); assert.ok(n, 'negócio aparece'); assert.equal(n.etapa, 'proposta'); assert.equal(n.valor, 15000);
  const r = await a.F.editar({ card_id: n.id, nome_negocio: 'Projeto Y v2', valor: '20000', telefone: '21988887777' }, 'fabio'); assert.match(r.resultado, /negócio \+ contato/);
  const D2 = await a.F.carregar({ forcar: true }); const n2 = D2.cards.find(x => x.id === n.id); assert.equal(n2.nome, 'Projeto Y v2'); assert.equal(n2.valor, 20000);
});
