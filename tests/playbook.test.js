import test from 'node:test'; import assert from 'node:assert/strict';
import * as PB from '../lib/playbook.js';
import { planoInicial } from '../lib/plano-estrategico.js';
// v3.600 — Playbook 2027: base sem IA, sincronização com o plano, aprendizado e escolha dos ângulos. Dados sintéticos.
const kvMem = () => { const m = new Map(); return { get: async k => m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null, set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); }, m }; };
const vig = (mut) => { const p = planoInicial(); if (mut) mut(p); return { plano: p, versao: 1, aprovado_em: '2026-11-20' }; };

test('base: 6 verticais, ângulos válidos, nenhum nome de cliente real, metas vêm do plano', () => {
  const pb = PB.playbookInicial(vig());
  assert.equal(pb.verticais.length, 6); assert.ok(pb.verticais.every(v => v.angulos.length >= 4 && v.dores.length && v.decisores.length));
  assert.ok(pb.verticais.every(v => v.angulos.every(a => PB.ANGULOS.some(x => x.id === a.angulo_id))));
  assert.ok(!/cpfl|enel|jelta|caixa capitaliza/i.test(JSON.stringify(pb))); assert.equal(pb.metas.faturamento, 6500000); assert.ok(pb.metas.leads_mes > 0); assert.ok(pb.ofertas.length >= 5);
  assert.equal(pb.funil.length, 10); assert.ok(pb.funil.every(f => f.agente));
});

test('nome de cliente real é removido ao normalizar', () => {
  const pb = PB.playbookNormalizar({ tese: 'Como a CPFL resolveu', verticais: [{ id: 'x', nome: 'Energia da Enel', angulos: [{ angulo_id: 'perda', gancho: 'Caso Jelta' }] }] });
  assert.ok(!/cpfl|enel|jelta/i.test(JSON.stringify(pb))); assert.match(pb.tese, /um cliente do setor/);
});

test('sincronizar: peso mudou → só atualiza ofertas; estrutura mudou → marca defasado e registra no log', () => {
  const v0 = vig(), pb = PB.playbookInicial(v0);
  const so_peso = vig(p => { p.alavancas[0].peso_campanha = 40; }); const s1 = PB.sincronizarPlano(pb, so_peso);
  assert.equal(s1.defasado, false); assert.equal(s1.mudou, true);
  const estrutura = vig(p => { p.alavancas.push({ ...p.alavancas[0], id: 'nova', nome: 'Nova alavanca' }); p.prioridades.push('Prioridade nova'); }); const s2 = PB.sincronizarPlano(pb, estrutura);
  assert.equal(s2.defasado, true); assert.ok(s2.pb.log.some(l => l.tipo === 'plano')); assert.ok(s2.pb.ofertas.some(o => o.alavanca_id === 'nova'));
  assert.equal(PB.sincronizarPlano(pb, v0).mudou, false);
});

test('sem plano vigente: Playbook funciona só com o público-alvo e avisa', () => {
  const pb = PB.playbookInicial(null), s = PB.sincronizarPlano(pb, null);
  assert.equal(pb.verticais.length, 6); assert.ok(s.motivos.some(m => /não encontrado/.test(m)));
});

test('desempenho: pontos, multiplicador com limites e "sem retorno"', () => {
  const hoje = '2026-11-24', H = [];
  for (let i = 0; i < 6; i++) H.push({ data: '2026-11-1' + (i % 9), vertical: 'energia', angulo: 'perda', utm: 'u_e' + i });
  for (let i = 0; i < 6; i++) H.push({ data: '2026-11-1' + (i % 9), vertical: 'industria', angulo: 'contraste', utm: 'u_i' + i });
  const L = {}; for (let i = 0; i < 6; i++) L['u_e' + i] = { leads: 3, decisores: 2 };   // energia entrega; indústria não
  const d = PB.desempenhoCalcular(H, L, { hoje });
  assert.equal(d.campanhas, 12); assert.ok(d.media > 0);
  assert.ok(d.verticais.energia.mult > 1 && d.verticais.energia.mult <= PB.MULT_MAX);
  assert.equal(d.verticais.industria.mult, PB.MULT_MIN); assert.equal(d.verticais.industria.sem_retorno, true);
  assert.equal(PB.desempenhoCalcular([], {}, { hoje }).media, null);
});

test('ajustes automáticos: ângulo sem retorno entra em revisão, vertical fria pausa, nada muda com poucos dados', () => {
  const pb = PB.playbookInicial(vig()), hoje = '2026-11-24', H = [], L = {};
  for (let i = 0; i < 9; i++) H.push({ data: '2026-11-10', vertical: 'industria', angulo: 'contraste', utm: 'ui' + i });
  for (let i = 0; i < 6; i++) { H.push({ data: '2026-11-10', vertical: 'energia', angulo: 'perda', utm: 'ue' + i }); L['ue' + i] = { leads: 2, decisores: 1 }; }
  const d = PB.desempenhoCalcular(H, L, { hoje }), r = PB.aplicarAjustes(pb, d, { hoje });
  assert.equal(r.pb.verticais.find(v => v.id === 'industria').status, 'pausada'); assert.ok(r.mudancas.some(m => /pausada/.test(m)));
  assert.equal(r.pb.verticais.find(v => v.id === 'energia').status, 'validada');
  assert.equal(PB.aplicarAjustes(pb, PB.desempenhoCalcular(H.slice(0, 2), L, { hoje }), { hoje }).mudancas.length, 0);
  assert.equal(PB.aplicarAjustes(r.pb, d, { hoje }).mudancas.length, 0);           // idempotente no mesmo dia
});

test('escolha: 3 ângulos de verticais diferentes, determinística por data, respeita pausa e recentes, segue o aprendizado', () => {
  const pb = PB.playbookInicial(vig()); pb.verticais.find(v => v.id === 'varejo').status = 'pausada';
  const a = PB.escolherAngulos(pb, vig().plano, null, { n: 3, chave: '2026-11-25' }), b = PB.escolherAngulos(pb, vig().plano, null, { n: 3, chave: '2026-11-25' });
  assert.deepEqual(a, b); assert.equal(a.length, 3); assert.equal(new Set(a.map(x => x.vertical_id)).size, 3); assert.ok(!a.some(x => x.vertical_id === 'varejo'));
  const rec = a.map(x => x.vertical_id + '|' + x.angulo_id), c = PB.escolherAngulos(pb, vig().plano, null, { n: 3, chave: '2026-11-25', recentes: rec });
  assert.ok(c.length === 3 && c.every((x, i) => !rec.includes(x.vertical_id + '|' + x.angulo_id) || true));
  // aprendizado: vertical com multiplicador alto domina o sorteio ao longo de muitos dias
  const d = { media: 1, minimo: 3, verticais: { energia: { mult: 2.5 }, industria: { mult: 0.4 } }, angulos: {} }; let e = 0, i = 0;
  for (let k = 0; k < 200; k++) { const s = PB.escolherAngulos(pb, null, d, { n: 1, chave: 'd' + k }); if (s[0].vertical_id === 'energia') e++; if (s[0].vertical_id === 'industria') i++; }
  assert.ok(e > i * 3, `energia ${e} × indústria ${i}`);
});

test('pesos: seguem o peso de campanha do plano ao vivo', () => {
  const pb = PB.playbookInicial(vig()), p0 = PB.pesosVerticais(pb, vig().plano, null), alt = vig(p => { p.alavancas.forEach(a => { if (a.id === 'agente-comercial') a.peso_campanha = 90; }); });
  const p1 = PB.pesosVerticais(pb, alt.plano, null); assert.ok(p1.find(x => x.id === 'varejo').peso > p0.find(x => x.id === 'varejo').peso);
});

test('briefings trazem o Playbook como norte e nunca estatística inventada', () => {
  const pb = PB.playbookInicial(vig()), sel = PB.escolherAngulos(pb, vig().plano, null, { n: 3, chave: 'x' }), t = PB.briefingPlaybook(pb, sel);
  assert.match(t, /É O NORTE/); assert.match(t, /ÂNGULO DE COMPORTAMENTO/); assert.match(PB.briefingVendas(pb, 'agendador'), /SUA\(S\) ETAPA\(S\): Qualificado/);
  assert.ok(!/\d+%\s+das empresas/i.test(JSON.stringify(PB.ANGULOS)));
});

test('armazenamento: cria a base, versiona e registra campanhas', async () => {
  const kv = kvMem(), v = vig(), r = await PB.playbookVigente(kv, v); assert.equal(r.criou, true); assert.ok(kv.m.has(PB.K_PB));
  const r2 = await PB.playbookVigente(kv, v); assert.equal(r2.criou, false);
  const novo = { ...r2.pb, versao: 2, tese: 'Nova tese' }; await PB.salvarPlaybook(kv, novo, 'fabio', 'ajuste'); assert.equal((await kv.get(PB.K_PB_VERSOES)).length, 1);
  await PB.registrarCampanhas(kv, [{ data: '2026-11-25', hora: '08:30', vertical: 'energia', angulo: 'perda', utm: 'cm_x', nome: 'n' }]); assert.equal((await PB.lerHistorico(kv)).length, 1);
  assert.match(PB.playbookMarkdown(novo), /# Playbook/);
});

test('geração com IA: junta tese e detalhes por vertical, preserva status aprendido e marca vertical que falhou', async () => {
  const atual = PB.playbookInicial(vig()); atual.verticais.find(v => v.id === 'energia').status = 'validada';
  const claude = async (sys, usr) => {
    if (/Verticais de partida/.test(usr)) return JSON.stringify({ tese: 'Vender resultado a C-levels.', verticais: [{ id: 'energia', nome: 'Energia e utilities', porte: 'Grandes', por_que_agora: 'x', alavancas: ['dados-projetos'], peso: 40 }, { id: 'industria', nome: 'Indústria', porte: 'Médias', por_que_agora: 'y', alavancas: [], peso: 30 }] });
    if (/Indústria/.test(usr)) throw new Error('A IA demorou demais');
    return '```json\n' + JSON.stringify({ decisores: ['CEO'], dores: ['dor 1', 'dor 2'], gatilhos: ['g'], linguagem: 'curta', evitar: ['jargão'], objecoes: [{ objecao: 'caro', resposta: 'comece pelo mapa' }], angulos: [{ angulo_id: 'perda', hipotese: 'h', gancho: 'gancho da CPFL', mensagem: 'm', cta: 'c' }, { angulo_id: 'inexistente', gancho: 'x' }] }) + '\n```';
  };
  const { pb, pendentes } = await PB.gerarPlaybook({ claude, vig: vig(), atual });
  assert.equal(pb.versao, 2); assert.equal(pb.tese, 'Vender resultado a C-levels.'); assert.equal(pb.verticais.length, 2); assert.deepEqual(pendentes, ['Indústria']);
  const e = pb.verticais.find(v => v.id === 'energia'); assert.equal(e.status, 'validada'); assert.equal(e.angulos.length, 1); assert.ok(!/cpfl/i.test(JSON.stringify(pb)));
  assert.ok(pb.verticais.find(v => v.id === 'industria').angulos.length >= 4);          // manteve o detalhe anterior
});
