import test from 'node:test'; import assert from 'node:assert/strict';
import { calcularNivel, lerPorteInformado } from '../lib/floresta-nivel.js';
import { lerResumoSdr } from '../lib/floresta-resumo.js';
import { decidirContato } from '../lib/floresta-cadencia.js';
import { criarFloresta } from '../lib/floresta.js';
import { criarIaraRetorno } from '../lib/iara-retorno.js';
// Dados sintéticos; HubSpot, banco e Claude são fakes em memória. Nada sai para a rede.

test('nível: faixas, fronteiras e conflito', () => {
  const n = x => calcularNivel(x).nivel;
  assert.equal(n({ funcionarios: 1001 }), 1); assert.equal(n({ funcionarios: 1000 }), 2); assert.equal(n({ funcionarios: 101 }), 2); assert.equal(n({ funcionarios: 100 }), 3); assert.equal(n({ funcionarios: 11 }), 3); assert.equal(n({ funcionarios: 10 }), 0);
  assert.equal(n({ faturamento_mi: 301 }), 1); assert.equal(n({ faturamento_mi: 300 }), 2); assert.equal(n({ faturamento_mi: 50 }), 2); assert.equal(n({ faturamento_mi: 49.9 }), 3); assert.equal(n({ faturamento_mi: 1 }), 3); assert.equal(n({ faturamento_mi: 0.5 }), 0);
  assert.equal(n({}), null);
  assert.equal(n({ funcionarios: 500, faturamento_mi: 20 }), 3, 'sem confirmação vale o menor custo humano');
  assert.equal(n({ funcionarios: 500, faturamento_mi: 20, confirmado: true }), 2, 'confirmado vale o maior porte');
  assert.equal(n({ funcionarios: 5, faturamento_mi: 5 }), 0); assert.equal(n({ funcionarios: 5, faturamento_mi: 5, confirmado: true }), 3);
  assert.deepEqual(lerPorteInformado('somos cerca de 15 pessoas e faturamos R$ 80 milhões'), { funcionarios: 15, faturamento_mi: 80 });
});

test('resumo SDR padrão: válido, rótulos com acento, data BR, texto livre inválido', () => {
  const r = lerResumoSdr('[RESUMO SDR ATLANTYX]\nTemperatura: Quente\nDor: relatórios manuais\nRetorno em: 01/02/2027\nPróximo passo: reunião marcada quinta 10h30\nPorte informado: cerca de 15 pessoas');
  assert.equal(r.valido, true); assert.equal(r.temperatura, 'quente'); assert.equal(r.campos.retorno_em, '2027-02-01'); assert.equal(r.reuniao, true); assert.equal(r.campos.dor, 'relatórios manuais');
  assert.equal(lerResumoSdr('Conversa legal, ele pediu material.').valido, false);
  assert.equal(lerResumoSdr('Temperatura: fervendo').valido, false);
});

test('cadência: exclusão, pausa, janela, 1 toque/dia, máximo por nível, toque 1 sem reunião', () => {
  const seg15 = new Date('2026-11-16T18:00:00Z'), base = { nivel: 2, telefone: '5521988887777', agora: seg15 };
  assert.equal(decidirContato(base).pode, true);
  assert.equal(decidirContato({ ...base, excluido: true }).motivo, 'excluido');
  assert.equal(decidirContato({ ...base, pausa_ate: '2026-11-20' }).motivo, 'pausa_geral');
  assert.equal(decidirContato({ ...base, nivel: null }).motivo, 'sem_nivel');
  assert.equal(decidirContato({ ...base, telefone: '' }).motivo, 'sem_telefone');
  assert.equal(decidirContato({ ...base, agora: new Date('2026-11-22T15:00:00Z') }).motivo, 'fora_da_janela', 'domingo');
  assert.equal(decidirContato({ ...base, toques: [{ em: seg15.toISOString() }] }).motivo, 'ja_tocou_hoje');
  const ant = n => Array.from({ length: n }, (_, i) => ({ em: new Date(seg15.getTime() - (i + 1) * 864e5 * 2).toISOString() }));
  assert.equal(decidirContato({ ...base, nivel: 1, toques: ant(4) }).pode, true); assert.equal(decidirContato({ ...base, nivel: 1, toques: ant(5) }).motivo, 'max_toques');
  assert.equal(decidirContato({ ...base, toques: ant(4) }).motivo, 'max_toques');
  assert.equal(decidirContato({ ...base, pede_reuniao: true }).motivo, 'toque1_pede_reuniao');
});

// ── ambiente falso para a Floresta
function montar({ contatos, cfgInicial }) {
  const kvm = {}; if (cfgInicial) kvm['vendas:floresta:cfg'] = cfgInicial; const patches = [];
  const sql = async (strs, ...v) => { const q = strs.join('?');
    if (/FROM disparo_optout/i.test(q)) return [];
    if (/SELECT value/i.test(q)) return kvm[v[0]] !== undefined ? [{ value: kvm[v[0]] }] : [];
    if (/INSERT INTO kv_store/i.test(q)) { kvm[v[0]] = JSON.parse(v[1]); return []; } return []; };
  const props = [{ name: 'fluxo_de_atendimento', label: 'Fluxo de atendimento', type: 'enumeration', fieldType: 'select', options: [{ value: 'IA', label: 'IA' }, { value: 'Manual', label: 'Manual' }] },
    { name: 'atendido_pela_ia', label: 'Atendido pela IA', type: 'bool', fieldType: 'booleancheckbox', options: [] }, { name: 'resumo_sdr_atlantyx', label: 'Resumo SDR Atlantyx', type: 'string', fieldType: 'textarea' }];
  const hs = async (path, method, body) => {
    if (/pipelines\/deals/.test(path)) return { results: [] }; if (/owners/.test(path)) return { results: [] }; if (/deals\/search/.test(path)) return { results: [] };
    if (/properties\/contacts/.test(path)) return { results: props }; if (/account-info/.test(path)) return { portalId: 1 };
    if (/contacts\/search/.test(path)) return { results: contatos.map(c => ({ id: c.id, properties: { firstname: c.nome, lastname: 'Teste', company: 'Empresa ' + c.id, jobtitle: 'Diretor', mobilephone: c.tel === undefined ? '21988887777' : c.tel, createdate: c.criado || '2026-10-01T00:00:00Z', lastmodifieddate: '2026-11-10T00:00:00Z', lifecyclestage: c.lc || 'lead', ...(c.extra || {}) } })) };
    if (/batch\/update/.test(path)) { patches.push(body); return {}; } if (/batch\/read/.test(path)) return { results: [] }; if (/associations/.test(path)) return { results: [] };
    if (method === 'PATCH') { patches.push({ path, body }); return {}; } return {};
  };
  const F = criarFloresta({ hs, getSql: async () => sql, claude: async () => '{}', todoCriar: async () => {}, todoListar: async () => [], todoConcluir: async () => {}, avisarVendedor: async m => { (globalThis.__emails = globalThis.__emails || []).push(m); return { ok: true, para: 'teste' }; }, normTelefone: x => { const d = String(x || '').replace(/\D/g, ''); return d ? (d.length <= 11 ? '55' + d : d) : null; } });
  return { F, kvm, patches };
}
const ligar = async (F, ativo = true) => F.cfgSalvar({ fq_ativo: ativo });
const preparar = async (F, id, nivel, brief = true) => { await F.nivelSalvar({ card_id: 'c:' + id, nivel }); if (brief) await F.briefingSalvar({ card_id: 'c:' + id, gancho: 'Anunciou expansão', fonte: 'https://exemplo.com/n', setor_linha: 'Energia' }); };

test('com Frio qualificado DESLIGADO a Floresta se comporta como antes (nada vira frio_qualificado)', async () => {
  const { F } = montar({ contatos: [{ id: '1', nome: 'Ana' }] }); await preparar(F, '1', 2);
  const D = await F.carregar({ forcar: true }); const c = D.cards.find(x => x.id === 'c:1');
  assert.equal(c.etapa, 'frio'); assert.equal(c.nivel, 2); assert.equal(D.cfg_fq.fq_ativo, false);
  assert.equal((await F.liberarDia({ simular: true })).liberados.length, 0, 'fila vazia: nada a liberar');
});

test('Frio qualificado ligado: entra só com nível + briefing por nível + telefone; N3 só precisa da linha de setor', async () => {
  const { F } = montar({ contatos: [{ id: '1', nome: 'Ana' }, { id: '2', nome: 'Bia' }, { id: '3', nome: 'Caio', tel: '' }, { id: '4', nome: 'Duda' }, { id: '5', nome: 'Edu' }] });
  await ligar(F); await preparar(F, '1', 2); await preparar(F, '2', 1, false); await preparar(F, '3', 1); await preparar(F, '5', 0);
  await F.nivelSalvar({ card_id: 'c:4', nivel: 3 }); await F.briefingSalvar({ card_id: 'c:4', setor_linha: 'Varejo' });
  const D = await F.carregar({ forcar: true }); const e = id => D.cards.find(x => x.id === 'c:' + id);
  assert.equal(e('1').etapa, 'frio_qualificado'); assert.equal(e('4').etapa, 'frio_qualificado', 'N3 só com linha de setor');
  assert.equal(e('2').etapa, 'frio'); assert.match(e('2').bloqueio_fq, /gancho/); assert.equal(e('3').etapa, 'frio'); assert.match(e('3').bloqueio_fq, /telefone/);
  assert.equal(e('5').etapa, 'frio', 'fora do perfil não entra'); assert.equal(D.cards.find(x => x.id === 'c:1').desde.slice(0, 4), String(new Date().getFullYear()), 'a espera conta a partir da entrada na fila');
  await assert.rejects(() => F.briefingSalvar({ card_id: 'c:1', gancho: 'x', fonte: 'sem-link' }), /link/);
  await assert.rejects(() => F.mover({ card_id: 'c:1', para: 'frio' }), /Tirar da fila/, 'arrastar de volta para frio é bloqueado: use Tirar da fila');
});

test('liberação diária: N1 → N2 → N3, mais antigo primeiro, respeita limite, exclusão e é idempotente no dia', async () => {
  const { F, patches } = montar({ contatos: [{ id: '1', nome: 'N3velho', criado: '2026-01-01T00:00:00Z' }, { id: '2', nome: 'N2' }, { id: '3', nome: 'N1' }, { id: '4', nome: 'Excl' }] });
  await ligar(F); await F.cfgSalvar({ liberacao_limite_dia: { whatsapp: 2 } });
  await preparar(F, '1', 3); await preparar(F, '2', 2); await preparar(F, '3', 1); await preparar(F, '4', 1); await F.exclusaoSalvar({ card_id: 'c:4', motivo: 'teste' });
  const sim = await F.liberarDia({ simular: true }); assert.equal(sim.liberados.length, 2, 'respeita o limite do dia'); assert.ok(!sim.liberados.some(x => x.card_id === 'c:4'), 'excluído não sai');
  const tq = sim.liberados.map(x => x.temperatura); assert.ok(tq[0] >= tq[1], 'os mais quentes primeiro'); assert.equal(patches.length, 0, 'simular não grava');
  const r = await F.liberarDia({ forcar: true }); assert.equal(r.liberados.length, 2);
  const corpo = patches.find(p => p.inputs); assert.ok(corpo.inputs.every(i => i.properties.fluxo_de_atendimento === 'IA'), 'marca Fluxo = IA no HubSpot (o mesmo mecanismo da IARA de hoje)');
  assert.equal((await F.liberarDia({})).ja_rodou, true);
  const q = await F.qualificacaoLer({ card_id: r.liberados[0].card_id }); assert.equal(q.toques.length, 1); assert.equal(q.toques[0].canal, 'whatsapp');
});

test('rota por nível: N1 → Ademir (A), N2/N3 → IARA voz (B); desligado mantém a regra antiga', async () => {
  const { F } = montar({ contatos: [{ id: '1', nome: 'Um' }, { id: '2', nome: 'Dois' }] });
  await F.nivelSalvar({ card_id: 'c:1', nivel: 1 }); await F.nivelSalvar({ card_id: 'c:2', nivel: 2 });
  await ligar(F); const r = await F.ligacao({ card_ids: ['c:1', 'c:2'] }, 'teste'); assert.deepEqual(r.resultados.map(x => x.caminho), ['A', 'B']);
});

test('qualificado parado: alerta sempre; mover só ligado e com limite; 1ª vez liga, 2ª vez remarketing', async () => {
  const velho = new Date(Date.now() - 20 * 864e5).toISOString();
  const { F } = montar({ contatos: [{ id: '1', nome: 'Pa', lc: 'salesqualifiedlead', extra: { hs_lifecyclestage_salesqualifiedlead_date: velho } }, { id: '2', nome: 'Pb', lc: 'salesqualifiedlead', extra: { hs_lifecyclestage_salesqualifiedlead_date: velho } }] });
  await F.nivelSalvar({ card_id: 'c:1', nivel: 1 }); await F.nivelSalvar({ card_id: 'c:2', nivel: 2 });
  const a = await F.moverParados({}); assert.equal(a.alertados.length, 2); assert.equal(a.movidos.length, 0, 'desligado: só alerta');
  await F.cfgSalvar({ parado_mover_ativo: true, parado_limite_dia: { 1: 1, 2: 0, 3: 1 } });
  const b = await F.moverParados({}); assert.deepEqual(b.movidos.map(x => x.card_id), ['c:1'], 'N2 sem limite definido não move'); assert.match(b.movidos[0].para, /A \(Ademir\)/);
  const D = await F.carregar({ forcar: true }); assert.equal(D.cards.find(x => x.id === 'c:1').etapa, 'ligacao', 'o parado aparece na abordagem do nível');
});

test('retorno da IARA: resumo padrão decide pela temperatura sem IA; fora do formato segue a IA e marca a_confirmar', async () => {
  let chamadasIA = 0; const moves = [], temps = []; const kvm = {};
  const sql = async (strs, ...v) => { const q = strs.join('?'); if (/SELECT value/i.test(q)) return kvm[v[0]] !== undefined ? [{ value: kvm[v[0]] }] : []; if (/INSERT INTO kv_store/i.test(q)) { kvm[v[0]] = JSON.parse(v[1]); } return []; };
  const lista = [{ id: '1', properties: { firstname: 'Ana', lastname: 'T', email: 'a@t.com', atendido_pela_ia: 'true', resumo_sdr: 'Temperatura: quente\nPróximo passo: reunião marcada quinta\nPorte informado: cerca de 15 pessoas', lastmodifieddate: new Date().toISOString() } },
    { id: '2', properties: { firstname: 'Bia', lastname: 'T', email: 'b@t.com', atendido_pela_ia: 'true', resumo_sdr: 'A Bia respondeu que tem interesse e pediu um material com bastante detalhe do serviço.', lastmodifieddate: new Date().toISOString() } }];
  const hs = async path => /contacts\/search/.test(path) ? { results: lista } : {};
  const floresta = { propsIA: async () => ({ resumo: 'resumo_sdr' }), carregar: async () => ({ cards: [{ id: 'c:1', tipo: 'contato', hs_id: '1', contato_id: '1', etapa: 'iara' }, { id: 'c:2', tipo: 'contato', hs_id: '2', contato_id: '2', etapa: 'iara' }] }),
    mover: async a => { moves.push(a); return { resultado: 'ok' }; }, registrarTemp: async (id, d) => { temps.push([id, d.temperatura]); }, recalcularPorte: async () => ({}) };
  const R = criarIaraRetorno({ hs, getSql: async () => sql, claude: async () => { chamadasIA++; return JSON.stringify({ desfecho: 'pediu_material', urgencia: 'media', resumo_curto: 'x', proximo_passo: 'y', dados_novos: {} }); }, floresta, todoCriar: async () => {} });
  await R.processar({ simular: false }).catch(() => {});
  assert.equal(chamadasIA, 1, 'só o resumo fora do formato chama a IA'); assert.deepEqual(moves.map(m => [m.card_id, m.para]), [['c:1', 'reuniao'], ['c:2', 'engajado']]);
  assert.deepEqual(temps, [['c:1', 'quente']]); assert.equal(kvm['vendas:iara:retornos']['1'].padrao, true); assert.equal(kvm['vendas:iara:retornos']['2'].a_confirmar, true);
});

test('arrastar lead frio para Frio qualificado efetua a qualificação (mesmo com a chave desligada); pendências bloqueiam a liberação', async () => {
  const { F } = montar({ contatos: [{ id: '1', nome: 'Ana', extra: { email: 'ana@empresa-teste.com.br', industry: 'Energia' } }, { id: '2', nome: 'Bia' }] });
  const r = await F.mover({ card_id: 'c:1', para: 'frio_qualificado' }, 'fabio');
  assert.match(r.resultado, /qualificado/); assert.match(r.resultado, /nível NÃO calculado/, 'sem Apollo e sem porte: vira pendência');
  const D = await F.carregar({ forcar: true }); const c = D.cards.find(x => x.id === 'c:1');
  assert.equal(c.etapa, 'frio_qualificado'); assert.ok(c.pendencias_fq.length >= 1); assert.equal(c.briefing.setor_linha, 'Setor: Energia');
  await F.nivelSalvar({ card_id: 'c:1', nivel: 3 }); await ligar(F);
  const D2 = await F.carregar({ forcar: true }); assert.equal(D2.cards.find(x => x.id === 'c:1').pendencias_fq.length, 0, 'N3 com linha de setor e telefone: sem pendências');
  assert.equal((await F.liberarDia({ simular: true })).liberados.length, 1);
  await F.exclusaoSalvar({ card_id: 'c:1', motivo: 'teste' }); assert.equal((await F.carregar({ forcar: true })).cards.find(x => x.id === 'c:1').etapa, 'frio', 'tirar da fila volta ao frio');
  await assert.rejects(() => F.mover({ card_id: 'c:9', para: 'frio_qualificado' }), /não encontrado/);
});

test('entrar na ligação manda e-mail ao vendedor com telefone e e-mail do lead, uma vez só; reunião na ligação manda e-mail com data e hora', async () => {
  globalThis.__emails = []; const { F } = montar({ contatos: [{ id: '1', nome: 'Ana', extra: { email: 'ana@empresa-teste.com.br' } }] });
  const r = await F.ligacao({ card_ids: ['c:1'] }, 'teste'); assert.equal(r.aviso.avisados, 1);
  const e = globalThis.__emails[0]; assert.match(e.assunto, /abordagem telefônica/); assert.match(e.blocos[0], /ana@empresa-teste\.com\.br/); assert.match(e.blocos[0], /Telefone/);
  assert.equal((await F.avisarLigacao()).avisados, 0, 'não repete o aviso');
  await F.ligacaoResultado({ card_id: 'c:1', resultado: 'reuniao', nota: 'aceitou', data_reuniao: '2026-11-25T10:30' }, 'teste');
  const m = globalThis.__emails.find(x => /Reunião marcada/.test(x.assunto)); assert.ok(m); assert.match(m.blocos[0], /2026-11-25 às 10:30/); assert.match(m.blocos[0], /ana@empresa-teste/);
});
