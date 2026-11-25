import test from 'node:test'; import assert from 'node:assert/strict';
import { criarVoz, dentroDoHorario, tokenWebhook } from '../lib/floresta-voz.js';
// Fakes em memória; dados sintéticos. Nenhuma chamada real à Retell.
process.env.RETELL_API_KEY = 'chave-teste'; process.env.RETELL_AGENT_ID = 'agent_teste'; process.env.RETELL_FROM_NUMBER = '+5521999990000';
const seg15h = () => new Date('2026-11-16T18:00:00Z'); // segunda 15h em Brasília
function montar({ cards, optout = [] }) {
  const kvm = {}; const chamadas = []; const resultados = [];
  const sql = async (strs, ...v) => { const q = strs.join('?');
    if (/FROM disparo_optout/i.test(q)) return optout.map(d => ({ destino: d }));
    if (/SELECT value/i.test(q)) return kvm[v[0]] !== undefined ? [{ value: kvm[v[0]] }] : [];
    if (/INSERT INTO kv_store/i.test(q)) { kvm[v[0]] = JSON.parse(v[1]); return []; } return []; };
  const floresta = { carregar: async () => ({ cards }), ligacaoResultado: async (a, por) => { resultados.push({ ...a, por }); return { feito: ['ok'] }; } };
  const fetchFn = async (url, o) => { chamadas.push({ url, corpo: JSON.parse(o.body) }); return { ok: true, text: async () => JSON.stringify({ call_id: 'call_' + chamadas.length }) }; };
  return { V: criarVoz({ floresta, getSql: async () => sql, normTelefone: x => { const d = String(x || '').replace(/\D/g, ''); return d ? (d.length <= 11 ? '55' + d : d) : null; }, fetchFn, agora: seg15h }), chamadas, resultados };
}
const card = (id, caminho, extra = {}) => ({ id, nome: 'Ana Teste', contato: 'Ana Teste', empresa: 'Empresa Teste', cargo: 'Diretora', telefone: '21988887777', etapa: 'ligacao', ligacao: { caminho, tentativas: 0, max: 3 }, ...extra });

test('janela legal: seg–sex 9–21h, sáb 10–14h, nunca domingo', () => {
  assert.equal(dentroDoHorario(new Date('2026-11-16T18:00:00Z')), true);   // seg 15h
  assert.equal(dentroDoHorario(new Date('2026-11-17T01:30:00Z')), false);  // seg 22h30
  assert.equal(dentroDoHorario(new Date('2026-11-21T14:00:00Z')), true);   // sáb 11h
  assert.equal(dentroDoHorario(new Date('2026-11-21T19:00:00Z')), false);  // sáb 16h
  assert.equal(dentroDoHorario(new Date('2026-11-22T15:00:00Z')), false);  // domingo
});
test('liga só caminho B (um por vez), manda variáveis e o card_id, e bloqueia A e descadastrados', async () => {
  const { V, chamadas } = montar({ cards: [card('c:1', 'B'), card('c:2', 'A'), card('c:3', 'B', { telefone: '21977776666' })], optout: ['5521977776666'] });
  const r = await V.ligar({ card_ids: ['c:1'] }, 'fabio');
  assert.equal(r.ok, 1); assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].corpo.to_number, '+5521988887777'); assert.equal(chamadas[0].corpo.override_agent_id, 'agent_teste');
  assert.equal(chamadas[0].corpo.metadata.card_id, 'c:1'); assert.equal(chamadas[0].corpo.retell_llm_dynamic_variables.primeiro_nome, 'Ana');
  assert.match((await V.ligar({ card_ids: ['c:2'] })).resultados[0].motivo, /caminho A/); assert.match((await V.ligar({ card_ids: ['c:3'] })).resultados[0].motivo, /descadastro/);
  const de = await V.ligar({ card_ids: ['c:1'] }); assert.match(de.resultados[0].motivo, /andamento|hoje/, 'não liga duas vezes seguidas');
});
test('v3.607: ligação em massa desabilitada (vários cards numa chamada são recusados, nada é discado)', async () => {
  const { V, chamadas } = montar({ cards: [card('c:1', 'B'), card('c:2', 'B')] });
  await assert.rejects(() => V.ligar({ card_ids: ['c:1', 'c:2'] }, 'fabio'), /massa.*desabilitada/i); assert.equal(chamadas.length, 0);
});
test('v3.607: ligação avulsa do card (ícone) funciona para lead fora da etapa de ligação, 1 por clique', async () => {
  const { V, chamadas } = montar({ cards: [card('c:5', 'B', { etapa: 'engajado', ligacao: null })] });
  assert.match((await V.ligar({ card_ids: ['c:5'] })).resultados[0].motivo, /abordagem telefônica/, 'sem o ícone, só quem está na ligação');
  const r = await V.ligar({ card_ids: ['c:5'], avulso: true }, 'fabio'); assert.equal(r.ok, 1); assert.equal(chamadas.length, 1); assert.equal(chamadas[0].corpo.metadata.card_id, 'c:5');
});
test('webhook: resultado vira ligacaoResultado uma única vez; não atendeu sem análise também', async () => {
  const { V, resultados } = montar({ cards: [card('c:1', 'B'), card('c:9', 'B')] });
  await V.ligar({ card_ids: ['c:1'] });
  const ev = { event: 'call_analyzed', call: { call_id: 'call_1', transcript: 'IARA: oi', call_analysis: { call_summary: 'Quer conversar', custom_analysis_data: { resultado: 'reuniao', data_reuniao: '2026-11-18T10:30' } } } };
  assert.equal((await V.webhook(ev)).tratado, true); assert.equal((await V.webhook(ev)).tratado, false);
  assert.equal(resultados.length, 1); assert.equal(resultados[0].resultado, 'reuniao'); assert.equal(resultados[0].card_id, 'c:1'); assert.equal(resultados[0].por, 'IARA voz');
  await V.ligar({ card_ids: ['c:9'] });
  const nao = await V.webhook({ event: 'call_ended', call: { call_id: 'call_2', disconnection_reason: 'dial_no_answer' } });
  assert.equal(nao.resultado, 'nao_atendeu');
});
test('webhook sem resultado claro vai para revisão e ligação de teste não mexe no funil', async () => {
  const { V, resultados } = montar({ cards: [card('c:1', 'B')] });
  await V.ligar({ card_ids: ['c:1'] });
  const r = await V.webhook({ event: 'call_analyzed', call: { call_id: 'call_1', call_analysis: { call_summary: 'confuso', custom_analysis_data: { resultado: 'talvez' } } } });
  assert.equal(r.tratado, false); assert.equal(resultados.length, 0); assert.equal((await V.status()).revisar.length, 1);
  assert.equal((await V.webhook({ event: 'call_analyzed', call: { call_id: 'x', metadata: { teste: '1' } } })).tratado, false);
});
test('token do webhook depende da chave e a configuração mostra o que falta', () => {
  assert.equal(tokenWebhook().length, 24); const { V } = montar({ cards: [] });
  const c = V.config('https://exemplo.test'); assert.equal(c.ok, true); assert.match(c.webhook_url, /webhook=retell&k=/);
});

test('limite mensal de 120 minutos: o webhook soma a duração uma vez por ligação e bloqueia novas ligações ao atingir', async () => {
  const { V, chamadas } = montar({ cards: [card('c:1', 'B'), card('c:2', 'B', { telefone: '21966665555' })] });
  await V.ligar({ card_ids: ['c:1'] }, 'fabio'); assert.equal(chamadas.length, 1);
  const ev = (id, ms) => ({ event: 'call_ended', call: { call_id: id, duration_ms: ms, disconnection_reason: 'dial_no_answer', metadata: { teste: '1' } } });
  await V.webhook(ev('x1', 60 * 60000)); await V.webhook(ev('x1', 60 * 60000)); // repetido: conta uma vez
  assert.equal((await V.status()).minutos_mes, 60); assert.equal((await V.status()).max_min_mes, 120);
  await V.webhook(ev('x2', 60 * 60000)); assert.equal((await V.status()).minutos_mes, 120);
  await assert.rejects(() => V.ligar({ card_ids: ['c:2'] }, 'fabio'), /120 minutos por mês/); await assert.rejects(() => V.teste({ telefone: '21999998888' }), /120 minutos por mês/);
  assert.equal(chamadas.length, 1, 'nenhuma ligação nova saiu');
});
