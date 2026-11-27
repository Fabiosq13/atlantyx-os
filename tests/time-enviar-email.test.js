import test from 'node:test'; import assert from 'node:assert/strict';
import * as TV from '../lib/time-vendas.js';
const mk = itens => { const m = new Map([[TV.K_FILA, itens]]); return { get: async k => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; };
const item = o => ({ id: 'tv_1', agente: 'sdr_email', card_id: 'c:1', canal: 'email', funil: 'padrao', assunto: 'Assunto teste', corpo: 'Olá, texto de teste.', estado: 'aprovado', enviado: false, ...o });
const card = { id: 'c:1', email: 'lead@exemplo.com.br' };
test('envia só item aprovado e marca como enviado pelo sistema', async () => {
  const kv = mk([item()]); let chamado = null;
  const r = await TV.enviarEmailItem({ kv, id: 'tv_1', card, enviar: async x => { chamado = x; return { ok: true }; }, login: 'ceo', admin: true });
  assert.equal(chamado.para, 'lead@exemplo.com.br'); assert.equal(r.item.enviado, true); assert.equal(r.item.enviado_via, 'sistema');
  await assert.rejects(TV.enviarEmailItem({ kv, id: 'tv_1', card, enviar: async () => ({}), login: 'ceo', admin: true }), /já foi enviado/);
});
test('barra pendente, sem e-mail, excluído e limite diário', async () => {
  const env = async () => { throw new Error('não devia enviar'); };
  await assert.rejects(TV.enviarEmailItem({ kv: mk([item({ estado: 'pendente' })]), id: 'tv_1', card, enviar: env, admin: true }), /Aprove/);
  await assert.rejects(TV.enviarEmailItem({ kv: mk([item()]), id: 'tv_1', card: { id: 'c:1', email: '' }, enviar: env, admin: true }), /e-mail válido/);
  await assert.rejects(TV.enviarEmailItem({ kv: mk([item()]), id: 'tv_1', card: { ...card, excluido: true }, enviar: env, admin: true }), /não ser contatado/);
  const hoje = new Date().toISOString(), cheios = Array.from({ length: 20 }, (_, i) => item({ id: 'x' + i, enviado: true, enviado_via: 'sistema', enviado_em: hoje }));
  await assert.rejects(TV.enviarEmailItem({ kv: mk([...cheios, item()]), id: 'tv_1', card, enviar: env, admin: true }), /Limite/);
});
test('e-mail nunca sai com oferta de WhatsApp e sempre tem o convite de 15 minutos', () => {
  const sujo = 'Maria, tudo bem?\n\nSou Ademir, da Atlantyx.\n\nEmpresas de logística têm lidado com um problema parecido. Monto um mapa curto com o caminho entre os dois e te mando no WhatsApp, sem reunião.\n\nAtenciosamente\n\nAdemir Souza';
  const limpo = TV.limparEmail(sujo, 'quartas e quintas, entre 10h30 e 12h');
  assert.ok(!/whats/i.test(limpo)); assert.ok(/15 minutos/.test(limpo)); assert.ok(/quarta ou na quinta/.test(limpo)); assert.ok(/Atenciosamente\n\nAdemir Souza$/.test(limpo));
  const ok = 'João, tudo bem?\n\nSe fizer sentido, são 15 minutos, sem compromisso.\n\nAtenciosamente';
  const r2 = TV.limparEmail(ok, 'quartas e quintas, entre 10h30 e 12h'); assert.ok(/quarta ou na quinta, entre 10h30 e 12h\?/.test(r2)); assert.ok(/Atenciosamente$/.test(r2));
  const completo = ok.replace('sem compromisso.', 'sem compromisso. Fica melhor para você na quarta ou na quinta, entre 10h30 e 12h?'); assert.equal(TV.limparEmail(completo, 'x'), completo);
});
