import test from 'node:test';
import assert from 'node:assert/strict';
import { tipoPeloPedido, contextoDados, criar } from '../lib/atlas-itens.js';

test('"criar um agente" na aba Análise/Relatório vira Agente; outros pedidos ficam como estão', () => {
  assert.equal(tipoPeloPedido('analise', 'Quero criar um agente de marketing de ponta a ponta'), 'agente');
  assert.equal(tipoPeloPedido('relatorio', 'monte um agente que avisa leads parados'), 'agente');
  assert.equal(tipoPeloPedido('analise', 'Analise o desempenho dos posts da semana'), 'analise');
  assert.equal(tipoPeloPedido('analise', 'Relatório do agente de cobrança do mês passado'), 'analise');
  assert.equal(tipoPeloPedido('tela', 'criar um agente'), 'tela');
});
test('contexto: área sem fonte avisa e não inventa; marketing leva cabeçalho de dados reais mesmo sem banco', async () => {
  assert.match(await contextoDados('juridico'), /não tem fonte de dados/);
  const m = await contextoDados('marketing');
  assert.match(m, /DADOS REAIS DO SISTEMA/); assert.match(m, /KANBAN DE MARKETING/);
});
test('criar: o pedido ao modelo leva os dados do sistema e o tipo ajustado', async () => {
  globalThis.__ATLAS_MEM = { v: [] }; let recebido = null;
  const it = await criar({ assunto: 'marketing', tipo: 'analise', pedido: 'Quero criar um agente de marketing completo' }, 'fabio', async (sys, usr) => { recebido = { sys, usr }; return '# Agente sintético'; });
  assert.equal(it.tipo, 'agente'); assert.match(it.ajuste_tipo, /gerei como/i);
  assert.match(recebido.usr, /DADOS REAIS DO SISTEMA/); assert.match(recebido.sys, /ESPECIFICAÇÃO de um AGENTE/);
  delete globalThis.__ATLAS_MEM;
});
test('orçamento de mídia paga: padrão R$ 2.000/mês e entra no contexto de marketing', async () => {
  const { orcamentoPago } = await import('../lib/atlas-itens.js');
  assert.equal((await orcamentoPago()).mensal, 2000);
  assert.match(await contextoDados('marketing'), /ORÇAMENTO MENSAL MÁXIMO PARA MÍDIA PAGA: R\$ 2\.000/);
});
