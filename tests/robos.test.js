import test from 'node:test'; import assert from 'node:assert/strict';
import * as R from '../lib/robos.js';
import { casa, ROBOS, custoRun } from '../lib/robos-catalogo.js';
// Memória no lugar do banco; nada sai para a rede.
const novo = () => { globalThis.__ROBOS_MEM = {}; };

test('padrões pedidos: abordagem do To-do e agente de ideias desligados; RFP semanal; notícias só com a TV no ar', async () => {
  novo(); const L = await R.listar(); const g = id => L.robos.find(r => r.id === id);
  assert.equal(g('abordagem_todo').ligado, false); assert.equal(g('agente_ideias').ligado, false);
  assert.equal(g('rfp').ligado, true); assert.equal(g('rfp').extras[0].valor, 7);
  assert.equal(g('noticias').extras[0].valor, true); assert.equal(g('iara').ligado, true); assert.equal(g('pauta').ligado, true);
  assert.equal((await R.liberado('abordagem_todo')).ok, false); assert.equal((await R.liberado('iara')).ok, true);
});

test('RFP: roda uma vez e só volta depois do intervalo; cada sub-rotina tem o seu relógio', async () => {
  novo(); assert.equal((await R.liberado('rfp')).ok, true); await R.marcar('rfp');
  assert.equal((await R.liberado('rfp')).ok, false); assert.equal((await R.liberado('rfp', 'petronect')).ok, true);
  globalThis.__ROBOS_MEM['robos:ultimo:rfp'] = { em: new Date(Date.now() - 8 * 864e5).toISOString() }; assert.equal((await R.liberado('rfp')).ok, true);
});

test('salvar: liga, troca de modelo, extras válidos; recusa troca em robô fixo e valores fora da lista', async () => {
  novo(); await R.salvar({ id: 'abordagem_todo', ligado: true, extras: { max: 3 } }, 'fabio');
  assert.equal((await R.liberado('abordagem_todo')).ok, true); assert.equal(await R.opcao('abordagem_todo', 'max', 2), 3);
  await R.salvar({ id: 'iara', modelo: 'claude-haiku-4-5-20251001' }, 'fabio');
  assert.equal((await R.listar()).robos.find(r => r.id === 'iara').modelo, 'claude-haiku-4-5-20251001');
  await assert.rejects(() => R.salvar({ id: 'followup', modelo: 'claude-sonnet-4-6' }, 'fabio'), /sempre o modelo/);
  await assert.rejects(() => R.salvar({ id: 'rfp', extras: { dias: 2 } }, 'fabio'), /inválido/);
  await assert.rejects(() => R.salvar({ id: 'iara', modelo: 'gpt-x' }, 'fabio'), /Modelo inválido/);
});

test('estimativa: Haiku custa menos que Sonnet; desligado zera o estimado; origens casam com o log', async () => {
  novo(); const r = ROBOS.find(x => x.id === 'iara');
  assert.ok(custoRun('claude-haiku-4-5-20251001', r.tok) < custoRun('claude-sonnet-4-6', r.tok));
  await R.salvar({ id: 'iara', ligado: false }, 'fabio'); const l = (await R.listar()).robos.find(x => x.id === 'iara');
  assert.equal(l.estimado_dia, 0); assert.ok(l.estimado_se_ligado > 0);
  assert.equal(casa('vendas:cron=iara_retorno')?.id, 'iara'); assert.equal(casa('rfp-monitor:acao=petronect')?.id, 'rfp'); assert.equal(casa('estrategia:cron=ajuste_plano')?.id, 'simulacoes'); assert.equal(casa('vendas:chat'), null);
});
