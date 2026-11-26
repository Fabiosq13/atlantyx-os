// v3.637 — Passo 0 da jornada: pesquisa de mercado e concorrência (dados sintéticos)
import test from 'node:test'; import assert from 'node:assert/strict';
import * as PQ from '../lib/estrategia-pesquisa.js';
import * as JN from '../lib/estrategia-jornada.js';

const mk = () => { let P = {}; const set = (sec, d) => { P = PQ.pesquisaAplicar(P, { secao: sec, dados: d }, 'fabio'); };
  set('mercado', Object.fromEntries(PQ.CAMPOS_MERCADO.slice(0, 4).map(([k]) => [k, { texto: 'texto ' + k, fonte: 'Fonte X', data: '2026-11-20' }])));
  set('clientes', [1, 2, 3].map(i => ({ cliente: 'Cliente ' + i, motor: 'projetos', receita_12m: '100.000,50', por_que_compra: 'confiança' })));
  set('concorrentes', Array.from({ length: 8 }, (_, i) => ({ nome: 'Conc ' + i, grupo: ['consultorias', 'fabricas', 'internas', 'ferramentas'][i % 4], fonte: i < 5 ? 'site' : '' })));
  const ids = P.concorrentes.slice(0, 3).map(c => c.id), cel = {};
  for (const [k] of PQ.CRITERIOS) { cel[k] = { atlantyx: { nota: 'igual', evidencia: 'dado do sistema' } }; for (const id of ids) cel[k][id] = { nota: 'pior', evidencia: '' }; }
  set('quadro', { pares: ids, celulas: cel });
  set('potencial', Object.fromEntries(Object.keys(PQ.MOTORES).map(m => [m, { empresas_icp: 200, ticket_medio: '50000', conversao_pct: 5, receita_atual: 100000 }])));
  return P; };

test('normaliza: números em formato brasileiro e ordem das etapas', () => {
  const P = mk(); assert.equal(P.clientes[0].receita_12m, 100000.5);
  const st = PQ.pesquisaStatus(P); assert.equal(st.completo, true); assert.equal(st.feitas, 5);
  assert.match(st.etapas[2].aviso, /sem fonte/); // 3 concorrentes sem fonte = "a confirmar"
});
test('vazio: nada pronto, primeira etapa é a próxima e as demais aguardam', () => {
  const st = PQ.pesquisaStatus({}); assert.equal(st.feitas, 0); assert.equal(st.proxima, 1); assert.deepEqual(st.etapas[2].aguarda, [1, 2]);
});
test('potencial = empresas × ticket × conversão; diferença para o atual', () => {
  const c = PQ.potencialCalc({ empresas_icp: 200, ticket_medio: 50000, conversao_pct: 5, receita_atual: 100000 }); assert.equal(c.potencial, 500000); assert.equal(c.gap, 400000);
  assert.equal(PQ.potencialCalc({ empresas_icp: 200 }).potencial, null);
});
test('importar da IA: sem duplicar nome, marcado origem ia e sem fonte', () => {
  const a = PQ.pesquisaImportarIA({}, [{ nome: 'Alfa', posicionamento: 'x', forcas: ['a'], fraquezas: ['b'] }, { nome: 'alfa' }, { nome: 'Beta' }], 'fabio');
  assert.equal(a.importados, 2); assert.ok(a.P.concorrentes.every(c => c.origem === 'ia' && !c.fonte));
  assert.equal(PQ.pesquisaImportarIA(a.P, [{ nome: 'Alfa' }], 'f').importados, 0);
});
test('seção inválida é recusada; pares limitados a 5 e só concorrentes existentes', () => {
  assert.throws(() => PQ.pesquisaAplicar({}, { secao: 'x', dados: {} }));
  const P = PQ.pesquisaNormalizar({ concorrentes: [{ id: 'a', nome: 'A' }], quadro: { pares: ['a', 'zzz'] } }); assert.deepEqual(P.quadro.pares, ['a']);
});
test('jornada: alerta quando a Reunião 1 avança sem o Passo 0 completo', () => {
  const passo0 = PQ.pesquisaStatus({}); const G = JN.jornadaGerar({ reunioes: { r1: { feito: true } } }, { etapas: [] }, passo0);
  assert.ok(G.reunioes[0].alertas.some(a => /Passo 0/.test(a))); assert.equal(G.passo0.completo, false);
  assert.ok(!JN.jornadaGerar({ reunioes: { r1: { feito: true } } }, { etapas: [] }, PQ.pesquisaStatus(mk())).reunioes[0].alertas.some(a => /Passo 0/.test(a)));
});
test('resumo para o ATLAS marca dado sem fonte como a confirmar', () => {
  const P = mk(), t = PQ.pesquisaResumoTexto(P, PQ.pesquisaStatus(P)); assert.match(t, /a confirmar/); assert.match(t, /Potencial/);
});
