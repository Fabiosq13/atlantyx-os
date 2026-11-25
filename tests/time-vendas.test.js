import test from 'node:test'; import assert from 'node:assert/strict';
import * as TV from '../lib/time-vendas.js';
import * as PB from '../lib/playbook.js';
import { planoInicial } from '../lib/plano-estrategico.js';
// v3.601 — time de vendas virtual: fila de aprovação, quem aprova, travas do envio automático. Dados sintéticos.
const kvMem = () => { const m = new Map(); return { get: async k => m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null, set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); }, m }; };
const vig = { plano: planoInicial(), versao: 1, aprovado_em: '2026-11-20' };
const cards = [
  { id: 'c:1', nome: 'Ana Teste', cargo: 'CIO', empresa: 'Energia Sintética SA', setor: 'energia', email: 'ana@exemplo.test', telefone: '21999990000', etapa: 'abordado', decisor: true, dias_na_etapa: 9 },
  { id: 'c:2', nome: 'Bruno Teste', cargo: 'Diretor de TI', empresa: 'Varejo Sintético', setor: 'varejo', email: 'bruno@exemplo.test', etapa: 'qualificado', pipeline_nome: 'WX Funil', dias_na_etapa: 3 },
  { id: 'c:3', nome: 'Carla Teste', cargo: 'Gerente', empresa: 'Sem Canal', etapa: 'abordado' },
  { id: 'n:4', nome: 'Neg Teste', cargo: 'CEO', empresa: 'Indústria Sintética', setor: 'indústria', email: 'neg@exemplo.test', etapa: 'reuniao' },
];
const claudeFalso = async (sys, usr) => JSON.stringify([...usr.matchAll(/card_id: (\S+)/g)].map(m => ({ card_id: m[1], assunto: 'Assunto', corpo: 'Texto pronto sem número inventado.', racional: 'porque sim' })));
const prep = async () => { const kv = kvMem(); await PB.playbookVigente(kv, vig); return kv; };

test('12 agentes, cada um com etapa do Playbook e canal; gerente sem IA', () => {
  assert.equal(TV.AGENTES.length, 12); assert.equal(new Set(TV.AGENTES.map(a => a.id)).size, 12);
  const pb = PB.playbookInicial(vig); for (const a of TV.AGENTES) assert.ok(a.missao && a.formato && a.canal);
  assert.ok(pb.funil.every(f => TV.AGENTES.some(a => a.funil === f.agente)));
});

test('rodar: gera só para quem tem canal, vai para a fila pendente e NADA é enviado', async () => {
  const kv = await prep(), r = await TV.rodar({ kv, cards, claude: claudeFalso, login: 'fabio', admin: true });
  assert.ok(r.novos >= 3); const fila = await TV.lerFila(kv);
  assert.ok(fila.every(i => i.estado === 'pendente' && i.enviado === false && i.copia_contato));
  assert.ok(!fila.some(i => i.card_id === 'c:3'));                         // sem e-mail nem telefone: nenhum agente de canal pega
  assert.equal(fila.find(i => i.card_id === 'c:2').funil, 'wx'); assert.match(fila.find(i => i.card_id === 'c:2').responsavel, /Patricia/);
  assert.equal(fila.find(i => i.card_id === 'c:1').funil, 'padrao'); assert.ok(fila.find(i => i.card_id === 'c:1').vertical);
});

test('não repete o mesmo lead antes do prazo e respeita o limite', async () => {
  const kv = await prep(); await TV.rodar({ kv, cards, claude: claudeFalso, login: 'fabio', admin: true }); const n1 = (await TV.lerFila(kv)).length;
  const r2 = await TV.rodar({ kv, cards, claude: claudeFalso, login: 'fabio', admin: true }); assert.equal(r2.novos, 0); assert.equal((await TV.lerFila(kv)).length, n1);
});

test('quem aprova: Patricia só o WX, Ademir só o padrão, CEO tudo, outros nada', async () => {
  const kv = await prep(); await TV.rodar({ kv, cards, claude: claudeFalso, login: 'fabio', admin: true }); const f = await TV.lerFila(kv), wx = f.find(i => i.funil === 'wx'), pd = f.find(i => i.funil === 'padrao');
  await assert.rejects(TV.decidir({ kv, id: pd.id, decisao: 'aprovar', login: 'patricia', admin: false }), /não aprova/);
  await assert.rejects(TV.decidir({ kv, id: wx.id, decisao: 'aprovar', login: 'ademir', admin: false }), /não aprova/);
  await assert.rejects(TV.decidir({ kv, id: wx.id, decisao: 'aprovar', login: 'estagiario', admin: false }), /não aprova/);
  assert.equal((await TV.decidir({ kv, id: wx.id, decisao: 'aprovar', login: 'patricia', admin: false })).estado, 'aprovado');
  assert.equal((await TV.decidir({ kv, id: pd.id, decisao: 'rejeitar', motivo: 'tom', login: 'ademir', admin: false })).estado, 'rejeitado');
  const e = await TV.estado({ kv, cards, login: 'patricia', admin: false }); assert.ok(e.fila.every(i => i.funil === 'wx'));
});

test('enviado só depois de aprovado; edição guarda quem editou', async () => {
  const kv = await prep(); await TV.rodar({ kv, cards, claude: claudeFalso, login: 'fabio', admin: true }); const it = (await TV.lerFila(kv))[0];
  await assert.rejects(TV.marcarEnviado({ kv, id: it.id, login: 'fabio', admin: true }), /aprovado/);
  await TV.decidir({ kv, id: it.id, decisao: 'aprovar', corpo: 'Texto ajustado.', login: 'fabio', admin: true });
  const x = await TV.marcarEnviado({ kv, id: it.id, login: 'fabio', admin: true }); assert.equal(x.enviado, true); assert.equal(x.corpo, 'Texto ajustado.'); assert.equal(x.editado_por, 'fabio');
});

test('autorização de envio: nasce desligada, só o CEO muda, e as travas barram', async () => {
  const kv = kvMem(); const c0 = await TV.lerCfg(kv); assert.ok(Object.values(c0.autoenvio).every(v => v === false)); assert.equal(c0.desligar_tudo, false);
  await assert.rejects(TV.salvarCfg({ kv, patch: { autoenvio: { iara: true } }, login: 'patricia', admin: false }), /CEO/);
  const c1 = await TV.salvarCfg({ kv, patch: { autoenvio: { sdr_email: true } }, login: 'fabio', admin: true }); assert.equal(c1.autoenvio.sdr_email, true); assert.equal(c1.autoenvio.iara, false);
  const it = { estado: 'aprovado', copia_contato: true }, seg = new Date('2026-11-25T14:00:00Z');   // quarta 11h em Brasília
  assert.equal(TV.podeEnviarAuto({ cfg: c1, agente: 'sdr_email', item: it, agora: seg }).ok, true);
  assert.ok(TV.podeEnviarAuto({ cfg: c1, agente: 'iara', item: it, agora: seg }).motivos.some(m => /autorização/.test(m)));
  assert.ok(TV.podeEnviarAuto({ cfg: c1, agente: 'sdr_email', item: { ...it, estado: 'pendente' }, agora: seg }).motivos.some(m => /aprovado/.test(m)));
  assert.ok(TV.podeEnviarAuto({ cfg: c1, agente: 'sdr_email', item: it, agora: new Date('2026-11-28T14:00:00Z') }).motivos.some(m => /horário/.test(m)));
  assert.ok(TV.podeEnviarAuto({ cfg: c1, agente: 'sdr_email', item: it, agora: seg, contato: { respondeu: true } }).motivos.some(m => /respondeu/.test(m)));
  assert.ok(TV.podeEnviarAuto({ cfg: c1, agente: 'sdr_email', item: it, agora: seg, enviadosHoje: 99 }).motivos.some(m => /limite/.test(m)));
  assert.ok(TV.podeEnviarAuto({ cfg: { ...c1, desligar_tudo: true }, agente: 'sdr_email', item: it, agora: seg }).motivos.some(m => /chave geral/.test(m)));
});

test('sem Playbook ou com chave geral desligada o time não roda; falha de um agente não derruba os outros', async () => {
  await assert.rejects(TV.rodar({ kv: kvMem(), cards, claude: claudeFalso, login: 'fabio', admin: true }), /Playbook/);
  const kv = await prep(); await TV.salvarCfg({ kv, patch: { desligar_tudo: true }, login: 'fabio', admin: true }); await assert.rejects(TV.rodar({ kv, cards, claude: claudeFalso, login: 'fabio', admin: true }), /desligada/);
  await TV.salvarCfg({ kv, patch: { desligar_tudo: false }, login: 'fabio', admin: true });
  let n = 0; const r = await TV.rodar({ kv, cards, claude: async (s, u) => { if (++n === 1) throw new Error('A IA demorou demais'); return claudeFalso(s, u); }, login: 'fabio', admin: true });
  assert.ok(r.resumo.some(x => x.erro) && r.novos > 0);
});

test('prompt: Playbook como norte, regras de não inventar e sem nome de cliente real', async () => {
  const pb = PB.playbookInicial(vig), a = TV.agentePorId('sdr_email'), { SYS, USR } = TV.montarPrompt(a, pb, [{ card: { ...cards[0], empresa: 'CPFL Sintética' }, vertical: pb.verticais[0], angulo: pb.verticais[0].angulos[0], vendedor: 'Ademir' }], TV.cfgNormalizar());
  assert.match(SYS, /O NORTE DAS VENDAS/); assert.match(SYS, /Nunca invente/); assert.ok(!/cpfl/i.test(USR));
  const g = TV.relatorioGerente(cards, []); assert.equal(g.fila_pendente, 0); assert.equal(g.cards_por_etapa.abordado, 2);
});
