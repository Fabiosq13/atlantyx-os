import test from 'node:test'; import assert from 'node:assert/strict';
import handler, { siteLimpo } from '../api/lead-capture.js';
// v3.603 — página de captura: e-mail e site obrigatórios, domínio limpo, sem confundir com a armadilha anti-robô. Dados sintéticos.
const res = () => { const r = { code: 200, corpo: null, status(c) { r.code = c; return r; }, json(b) { r.corpo = b; return r; }, end() { return r; }, setHeader() {} }; return r; };
const pedido = body => ({ method: 'POST', headers: {}, body, query: {}, socket: {} });
const base = { name: 'Ana Teste', company: 'Empresa Exemplo', phone: '21999990000', job_title: 'CIO', form_name: 'captura-publica', oferta: 'mapa_ia', t_preenchimento_ms: 20000, website: '', consentimento: { aceito: true, canais: ['whatsapp'] } };

test('siteLimpo: tira protocolo, www, caminho e porta; rejeita o que não é domínio', () => {
  assert.equal(siteLimpo('https://www.Empresa-Exemplo.com.br/pagina?x=1'), 'empresa-exemplo.com.br'); assert.equal(siteLimpo('empresa.com.br:8080/x'), 'empresa.com.br');
  assert.equal(siteLimpo('www.exemplo.com'), 'exemplo.com'); assert.equal(siteLimpo('não sei'), ''); assert.equal(siteLimpo('semponto'), ''); assert.equal(siteLimpo(''), '');
});
test('formulário público sem e-mail é recusado com mensagem clara (antes entrava só com WhatsApp)', async () => {
  const r = res(); await handler(pedido({ ...base, site: 'empresa.com.br' }), r); assert.equal(r.code, 400); assert.match(r.corpo.error, /e-mail/i);
});
test('e-mail inválido é recusado; sem site é recusado', async () => {
  let r = res(); await handler(pedido({ ...base, email: 'isso-nao-e-email', site: 'empresa.com.br' }), r); assert.equal(r.code, 400); assert.match(r.corpo.error, /Confira o e-mail/);
  r = res(); await handler(pedido({ ...base, email: 'ana@empresa.com.br' }), r); assert.equal(r.code, 400); assert.match(r.corpo.error, /site/i);
});
test('site preenchido no campo certo não é tratado como robô (campo "website" é a armadilha)', async () => {
  const r = res(); await handler(pedido({ ...base, email: 'ana@empresa.com.br', site: 'empresa.com.br' }), r);
  assert.ok(r.code !== 400, JSON.stringify(r.corpo));   // passou das validações (pode falhar depois por falta de banco no teste)
});
