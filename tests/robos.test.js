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

import { podeTraduzir, montar, paraAnthropic, chamar } from '../lib/llm-ponte.js';
import { todosModelos } from '../lib/robos-catalogo.js';

test('ponte: traduz texto puro e recusa ferramentas, imagem e pré-preenchimento (volta ao Claude)', () => {
  const b = { model: 'x', max_tokens: 500, system: 'Seja breve', messages: [{ role: 'user', content: 'Oi' }] };
  assert.equal(podeTraduzir(b), null);
  assert.match(podeTraduzir({ ...b, tools: [{ type: 'web_search_20250305' }] }), /ferramentas/);
  assert.match(podeTraduzir({ ...b, messages: [...b.messages, { role: 'assistant', content: '{' }] }), /pré-preenchimento/);
  assert.match(podeTraduzir({ ...b, messages: [{ role: 'user', content: [{ type: 'image', source: {} }] }] }), /imagem/);
  const m = montar(b, 'openai', 'gpt-5'); assert.equal(m.corpo.messages[0].role, 'system'); assert.equal(m.corpo.max_completion_tokens, 500);
  assert.equal(montar(b, 'deepseek', 'deepseek-chat').corpo.max_tokens, 500);
});

test('ponte: resposta volta no formato da Anthropic com tokens; sem chave ou erro do provedor lança erro', async () => {
  const fake = async () => ({ ok: true, status: 200, json: async () => ({ id: 'z', choices: [{ message: { content: 'Olá' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 3 } }) });
  const b = { max_tokens: 100, messages: [{ role: 'user', content: 'Oi' }] };
  delete process.env.OPENAI_API_KEY; await assert.rejects(() => chamar(b, 'openai::gpt-5', fake), /OPENAI_API_KEY/);
  process.env.OPENAI_API_KEY = 'teste';
  const r = await chamar(b, 'openai::gpt-5', fake); assert.equal(r.resposta.content[0].text, 'Olá'); assert.equal(r.uso.in, 12); assert.equal(r.uso.out, 3);
  await assert.rejects(() => chamar(b, 'openai::gpt-5', async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'limite' } }) })), /limite/);
  assert.equal(paraAnthropic({ choices: [{ message: { content: 'x' }, finish_reason: 'length' }] }, 'm').stop_reason, 'max_tokens');
  delete process.env.OPENAI_API_KEY;
});

test('modelos de outros provedores: escolher por robô, cadastrar com preço, remover volta ao Claude; busca na web é só Claude', async () => {
  novo();
  await R.salvar({ id: 'iara', modelo: 'google::gemini-2.5-flash' }, 'fabio');
  let l = await R.listar(); assert.equal(l.robos.find(r => r.id === 'iara').modelo, 'google::gemini-2.5-flash'); assert.ok(l.provedores.find(p => p.id === 'openrouter'));
  await assert.rejects(() => R.salvar({ id: 'noticias', modelo: 'openai::gpt-5' }, 'fabio'), /só aceita modelos Claude/);
  await assert.rejects(() => R.modeloSalvar({ prov: 'openai', modelo: 'gpt novo!', preco: [1, 2] }), /Id do modelo/);
  await assert.rejects(() => R.modeloSalvar({ prov: 'openai', modelo: 'gpt-x', preco: [0, 0] }), /preço/);
  await R.modeloSalvar({ prov: 'openrouter', modelo: 'meta-llama/llama-3.3-70b-instruct', nome: 'Llama 3.3 70B', preco: [0.1, 0.3] }, 'fabio');
  await R.salvar({ id: 'pauta', modelo: 'openrouter::meta-llama/llama-3.3-70b-instruct' }, 'fabio');
  const barato = (await R.listar()).robos.find(r => r.id === 'pauta').estimado_dia, base = (await R.listar()).robos.find(r => r.id === 'followup').estimado_dia;
  assert.ok(barato < 0.01 && base > 0);
  await R.modeloRemover({ prov: 'openrouter', modelo: 'meta-llama/llama-3.3-70b-instruct' });
  l = await R.listar(); assert.equal(l.robos.find(r => r.id === 'pauta').modelo, 'claude-sonnet-4-6');
  assert.ok(todosModelos().get('claude-sonnet-4-6'));
});
