import test from 'node:test'; import assert from 'node:assert/strict';
import { semaforo, esperadoAteHoje, projecaoRitmo, tendencia, montarIndicador, resumoPlacar, exigeAcao, validarAcao, paraTv, fracaoAno } from '../lib/placar-calc.js';
// dados sintéticos
const acum = { tipo: 'acumulado', sentido: 'maior' }, niv = { tipo: 'nivel', sentido: 'maior', unidade: '%' };

test('esperado: linear sem curva e pela curva mensal quando existe', () => {
  assert.equal(esperadoAteHoje(1200, '2027-07-02'), Math.round(1200 * fracaoAno('2027-07-02') * 100) / 100);
  const curva = [0, 0, 0, 0, 0, 0, 600, 600, 0, 0, 0, 0]; // meta toda no 2º semestre
  assert.equal(esperadoAteHoje(1200, '2027-06-30', curva), 0);
  assert.equal(esperadoAteHoje(1200, '2027-12-31', curva), 1200);
});
test('acumulado maior-é-melhor: verde ≥ esperado, amarelo ≥ 85%, vermelho abaixo (bordas)', () => {
  const L = real => semaforo(acum, { real, meta: 1000, esperado: 500 }).cor;
  assert.equal(L(500), 'verde'); assert.equal(L(425), 'amarelo'); assert.equal(L(424.99), 'vermelho'); assert.equal(L(1000), 'verde');
});
test('nível em %: tolerância de 3 p.p.; fora disso vermelho', () => {
  const L = real => semaforo(niv, { real, meta: 35 }).cor;
  assert.equal(L(35), 'verde'); assert.equal(L(32), 'amarelo'); assert.equal(L(31.9), 'vermelho');
});
test('menor-é-melhor (DSO): verde ≤ meta, amarelo até 15% acima, vermelho acima', () => {
  const d = { tipo: 'nivel', sentido: 'menor' }, L = real => semaforo(d, { real, meta: 40 }).cor;
  assert.equal(L(40), 'verde'); assert.equal(L(46), 'amarelo'); assert.equal(L(46.01), 'vermelho');
});
test('faixa (capacidade 80–95): dentro verde, até 5 pontos fora amarelo, além vermelho', () => {
  const d = { tipo: 'nivel', sentido: 'faixa' }, L = real => semaforo(d, { real, faixa: [80, 95] }).cor;
  assert.equal(L(80), 'verde'); assert.equal(L(95), 'verde'); assert.equal(L(75), 'amarelo'); assert.equal(L(74.9), 'vermelho'); assert.equal(L(101), 'vermelho');
});
test('sem meta ou dado velho = cinza com a idade do dado, nunca verde', () => {
  assert.equal(semaforo(niv, { real: 50 }).cor, 'cinza');
  const v = semaforo(niv, { real: 50, meta: 10, idade_dias: 6 }); assert.equal(v.cor, 'cinza'); assert.match(v.texto, /6 dias/);
  assert.equal(semaforo(niv, { real: null, meta: 10 }).cor, 'cinza');
});
test('projeção por ritmo; muito cedo no ano não projeta', () => {
  const meta = 1200, hoje = '2027-07-02', esp = esperadoAteHoje(meta, hoje);
  assert.equal(projecaoRitmo(esp, hoje, null, meta), meta);
  assert.equal(projecaoRitmo(10, '2027-01-05', null, meta), null);
});
test('tendência: média das 4 leituras anteriores; estável < 2%; menor-é-melhor inverte', () => {
  assert.equal(tendencia([100, 100, 100, 100, 101]).rotulo, 'estável');
  assert.equal(tendencia([100, 100, 100, 100, 120]).rotulo, 'melhorando');
  assert.equal(tendencia([40, 40, 40, 40, 50], 'menor').rotulo, 'piorando');
  assert.equal(tendencia([5]).rotulo, 'sem histórico');
});
test('placar geral: contagem e pior indicador, sem nota média', () => {
  const r = resumoPlacar([{ id: 'a', cor: 'verde' }, { id: 'b', cor: 'amarelo', meta: 10, real: 9 }, { id: 'c', cor: 'vermelho', meta: 10, real: 2 }, { id: 'd', cor: 'cinza' }]);
  assert.deepEqual([r.verde, r.amarelo, r.vermelho, r.cinza, r.pior], [1, 1, 1, 1, 'c']); assert.equal(r.nota, undefined);
});
test('rito do vermelho: 2 vermelhos seguidos exigem ação; ação exige dono e prazo', () => {
  assert.equal(exigeAcao(['verde', 'vermelho', 'vermelho']).exige, true); assert.equal(exigeAcao(['vermelho', 'verde', 'vermelho']).exige, false);
  assert.equal(exigeAcao(['amarelo', 'amarelo', 'amarelo', 'amarelo']).exige, true);
  assert.match(validarAcao({ indicador: 'x', o_que_muda: 'y', dono: '', prazo: '2027-01-10' }), /dono/);
  assert.match(validarAcao({ indicador: 'x', o_que_muda: 'y', dono: 'Ana', prazo: '10/01' }), /prazo/);
  assert.equal(validarAcao({ indicador: 'x', o_que_muda: 'y', dono: 'Ana', prazo: '2027-01-10' }), null);
});
test('PRIVACIDADE da TV: só visivel_tv, nada privado, sem nome de pessoa, cliente, caixa ou valor de contrato', () => {
  const inds = [
    { id: 'receita_ano', nome: 'Receita', visivel_tv: true, cor: 'verde', meta: 6500000, real: 1 },
    { id: 'margem', nome: 'Margem líquida', visivel_tv: true, cor: 'amarelo', tendencia: { seta: '↑' } },
    { id: 'caixa_minimo', nome: 'Caixa contra mínimo', visivel_tv: true, privado: true, cor: 'verde', real: 999999 },
    { id: 'interno', nome: 'Interno', visivel_tv: false, cor: 'vermelho', dono: 'Fulana de Tal' }];
  const t = paraTv({ ano: 2027, indicadores: inds, acoes_abertas: [{ indicador: 'margem', o_que_muda: 'revisar preço', dono: 'Fulana de Tal', prazo: '2027-02-01', cliente: 'ACME' }] });
  const s = JSON.stringify(t);
  assert.equal(t.receita.id, 'receita_ano'); assert.deepEqual(t.linhas.map(l => l.id), ['margem']);
  assert.ok(!/Fulana|ACME|caixa_minimo|999999|interno/.test(s));
  assert.deepEqual(t.resumo, { verde: 1, amarelo: 1, vermelho: 0, cinza: 0 });
});
test('montarIndicador: acumulado calcula esperado, projeção e gap', () => {
  const i = montarIndicador({ id: 'r', nome: 'R', grupo: 'A', unidade: 'R$', tipo: 'acumulado', sentido: 'maior', fonte: 'auto' }, { real: 400, meta: 1200 }, '2027-07-02');
  assert.ok(i.esperado > 500 && i.cor === 'vermelho'); assert.ok(i.projecao < 1200); assert.ok(i.gap < 0);
});
