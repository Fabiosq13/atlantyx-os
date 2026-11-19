import test from 'node:test'; import assert from 'node:assert/strict';
import * as AT from '../lib/atlas-itens.js';
// Memória no lugar do banco e IA falsa: nada sai para a rede. Dados sintéticos.
const ia = async () => '# Relatório de teste\n\nTexto com exemplo sintético.';
const novo = () => { globalThis.__ATLAS_MEM = { v: [] }; };

test('relatório: nasce rascunho privado, só o autor vê, publica sozinho depois do teste', async () => {
  novo();
  const it = await AT.criar({ assunto: 'marketing', tipo: 'relatorio', pedido: 'Relatório semanal de leads por origem' }, 'ana', ia);
  assert.equal(it.estado, 'rascunho'); assert.equal(it.aprovacao, 'dispensada');
  assert.equal((await AT.listar({ assunto: 'marketing' }, 'bia', false)).itens.length, 0);
  assert.equal((await AT.listar({ assunto: 'marketing' }, 'ana', false)).itens.length, 1);
  assert.equal((await AT.listar({ assunto: 'marketing' }, 'ceo', true)).itens.length, 1);
  await AT.mudar({ id: it.id, para: 'teste' }, 'ana', false);
  const pub = await AT.mudar({ id: it.id, para: 'publicado' }, 'ana', false);
  assert.equal(pub.estado, 'publicado');
  assert.equal((await AT.listar({ assunto: 'marketing' }, 'bia', false)).itens.length, 1); // agora visível a todos do assunto
  assert.ok(pub.log.some(l => l.acao === 'publicou'));
});

test('agente: precisa de aprovação do dono; o autor comum não publica; desfazer volta a rascunho', async () => {
  novo();
  const it = await AT.criar({ assunto: 'financeiro', tipo: 'agente', pedido: 'Agente de cobrança que só gera rascunhos' }, 'ana', ia);
  assert.equal(it.aprovacao, 'necessaria');
  await assert.rejects(() => AT.mudar({ id: it.id, para: 'publicado' }, 'ana', false), /aprovação|Aguarde|dono/);
  await AT.mudar({ id: it.id, para: 'teste' }, 'ana', false);
  await AT.mudar({ id: it.id, para: 'pedir_aprovacao' }, 'ana', false);
  await assert.rejects(() => AT.mudar({ id: it.id, para: 'publicado' }, 'ana', false), /aprovação do dono/);
  const ok = await AT.mudar({ id: it.id, para: 'publicado' }, 'ceo', true);
  assert.equal(ok.estado, 'publicado'); assert.equal(ok.aprovacao, 'aprovada');
  const volta = await AT.mudar({ id: it.id, para: 'rascunho', motivo: 'ajustar' }, 'ceo', true);
  assert.equal(volta.estado, 'rascunho'); assert.equal(volta.aprovacao, 'necessaria');
});

test('dono configurado aprova; cliente real no texto trava a publicação; pedido curto é recusado', async () => {
  novo(); process.env.ATLAS_DONOS = 'marketing:dani';
  assert.equal(AT.podeAprovar('marketing', 'dani', false), true); assert.equal(AT.podeAprovar('financeiro', 'dani', false), false);
  const it = await AT.criar({ assunto: 'marketing', tipo: 'analise', pedido: 'Análise do case de energia' }, 'ana', async () => 'Resultado na CPFL foi ótimo.');
  assert.match(it.aviso, /cliente real/);
  await AT.mudar({ id: it.id, para: 'teste' }, 'ana', false);
  await assert.rejects(() => AT.mudar({ id: it.id, para: 'publicado' }, 'ana', false), /aviso/);
  await assert.rejects(() => AT.criar({ assunto: 'marketing', tipo: 'analise', pedido: 'oi' }, 'ana', ia), /pelo menos uma frase/);
  await assert.rejects(() => AT.criar({ assunto: 'x', tipo: 'analise', pedido: 'pedido válido aqui' }, 'ana', ia), /Assunto inválido/);
  delete process.env.ATLAS_DONOS;
});
