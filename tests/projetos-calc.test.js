// Testes do farol calculado e dos alertas do Tático — dados 100% sintéticos (nenhum cliente ou pessoa real).
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularFarol, diasUteis, divergencia, alertasCarga, reaisEmRisco, resumoPortfolio } from '../lib/projetos-calc.js';
import { _paraTela } from '../api/projetos-tatico.js';

const base = { pct_real: 50, pct_plan: 50, prometida: '2026-11-02', previsao: '2026-11-02', dias_sem_status: 2, hoje: '2026-11-20' };
const F = o => calcularFarol({ ...base, ...o });

test('dias úteis: pula sábado e domingo, sinal pela ordem', () => {
  assert.equal(diasUteis('2026-11-02', '2026-11-09'), 5);   // seg → seg seguinte
  assert.equal(diasUteis('2026-11-06', '2026-11-09'), 1);   // sex → seg
  assert.equal(diasUteis('2026-11-09', '2026-11-02'), -5);
  assert.equal(diasUteis('2026-11-02', '2026-11-02'), 0);
  assert.equal(diasUteis('x', '2026-11-02'), null);
});
test('farol: relação nas bordas (100 verde · 99,5 amarelo · 85 amarelo · 84,9 vermelho)', () => {
  assert.equal(F({ pct_real: 50, pct_plan: 50 }).cor, 'verde');
  assert.equal(F({ pct_real: 60, pct_plan: 50 }).cor, 'verde');
  assert.equal(F({ pct_real: 49.75, pct_plan: 50 }).cor, 'amarelo');   // 99,5%
  assert.equal(F({ pct_real: 42.5, pct_plan: 50 }).cor, 'amarelo');    // exatamente 85%
  assert.equal(F({ pct_real: 42.4, pct_plan: 50 }).cor, 'vermelho');   // 84,8%
});
test('farol: previsão em dias úteis (5 = amarelo, 6 = vermelho, fim de semana não conta)', () => {
  assert.equal(F({ previsao: '2026-11-03' }).cor, 'amarelo');
  assert.equal(F({ previsao: '2026-11-09' }).cor, 'amarelo');          // 5 dias úteis depois
  assert.equal(F({ previsao: '2026-11-10' }).cor, 'vermelho');         // 6 dias úteis depois
  assert.equal(F({ prometida: '2026-11-06', previsao: '2026-11-07' }).atraso_uteis, 0); // sex → sáb
  assert.equal(F({ prometida: '2026-11-06', previsao: '2026-11-07' }).cor, 'verde');
  assert.equal(F({ previsao: '2026-10-30' }).cor, 'verde');            // antes da prometida
});
test('farol: marco vencido sem aceite é vermelho mesmo com relação boa', () => {
  const r = F({ pct_real: 80, pct_plan: 50, marco_vencido_sem_aceite: 'Entrega 1' });
  assert.equal(r.cor, 'vermelho'); assert.match(r.motivos.join(' '), /marco vencido sem aceite/);
});
test('farol: sem status há mais de 7 dias é cinza (7 ainda vale; 8 não; nunca = cinza) e vence o marco vencido', () => {
  assert.equal(F({ dias_sem_status: 7 }).cor, 'verde');
  assert.equal(F({ dias_sem_status: 8 }).cor, 'cinza');
  assert.equal(F({ dias_sem_status: null }).cor, 'cinza');
  assert.equal(F({ dias_sem_status: 9, marco_vencido_sem_aceite: true, pct_real: 1 }).cor, 'cinza');
});
test('farol: sem avanço = cinza; planejado zero não penaliza; previsão ausente é ignorada', () => {
  assert.equal(F({ pct_real: null }).cor, 'cinza');
  assert.equal(F({ pct_real: 0, pct_plan: 0 }).cor, 'verde');
  assert.equal(F({ pct_plan: null }).cor, 'verde');
  assert.equal(F({ previsao: null }).cor, 'verde');
});
test('divergência informado × calculado; cinza calculado não diverge', () => {
  assert.ok(divergencia('verde', 'vermelho')); assert.equal(divergencia('verde', 'verde'), null);
  assert.equal(divergencia('verde', 'cinza'), null); assert.equal(divergencia(null, 'verde'), null);
});
test('alertas de carga: gerente > 4 projetos e pessoa > 2 frentes (limites vêm de proj:regras)', () => {
  const L = ['P1', 'P2', 'P3', 'P4', 'P5'].map(p => ({ projeto: p, gerente: 'Gerente A' })).concat([{ projeto: 'P6', gerente: 'Gerente B' }]);
  const A = alertasCarga(L, { 'Pessoa X': ['P1', 'P2', 'P3'], 'Pessoa Y': ['P1', 'P1', 'P2'], 'Pessoa Z': ['P1'] });
  assert.deepEqual(A.gerentes.map(g => g.gerente), ['Gerente A']); assert.deepEqual(A.pessoas.map(p => p.pessoa), ['Pessoa X']);
  assert.equal(alertasCarga(L, {}, { limite_projetos_gerente: 5 }).gerentes.length, 0);
});
test('R$ em risco: vencidos + próximos 30 dias só em amarelo/vermelho; concluído não entra', () => {
  const M = [{ nome: 'a', fim: '2026-11-10', valor: 1000, feito: false }, { nome: 'b', fim: '2026-11-30', valor: 500, feito: false }, { nome: 'c', fim: '2026-11-05', valor: 700, feito: true }, { nome: 'd', fim: '2027-02-01', valor: 900, feito: false }];
  assert.equal(reaisEmRisco(M, 'verde', '2026-11-20').total, 1000);
  assert.equal(reaisEmRisco(M, 'vermelho', '2026-11-20').total, 1500);
});
test('resumo do topo soma por cor, atraso, risco, ações vencidas e críticos', () => {
  const R = resumoPortfolio([{ farol_calculado: { cor: 'verde' }, dias_atraso: 0 }, { farol_calculado: { cor: 'vermelho' }, dias_atraso: 4, reais_risco: 100, acoes_vencidas: 2, problemas_criticos: 1 }, {}]);
  assert.deepEqual([R.verde, R.vermelho, R.cinza, R.dias_atraso, R.reais_risco, R.acoes_vencidas, R.problemas_criticos], [1, 1, 1, 4, 100, 2, 1]);
});
test('privacidade: fora do perfil gestor não sai nome de pessoa (nem ranking)', () => {
  const P = { gerado_em: '2026-11-20T00:00:00Z', hoje: '2026-11-20', fonte: 'x', fontes: {}, regras: {}, resumo: {}, linhas: [{ projeto: 'P1', _pessoas: ['Pessoa X'], pessoas_alocadas: 1 }],
    alertas: { gerentes: [], pessoas: [{ pessoa: 'Pessoa X', frentes: 3, limite: 2, projetos: ['P1'] }] } };
  const aberto = JSON.stringify(_paraTela(P, false)), gestor = JSON.stringify(_paraTela(P, true));
  assert.ok(!aberto.includes('Pessoa X')); assert.ok(gestor.includes('Pessoa X'));
  assert.equal(_paraTela(P, false).alertas.pessoas_total, 1);
});
