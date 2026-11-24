// lib/projetos-calc.js — Jornada de Alta Performance em Projetos (Tático): funções puras, sem banco e sem rede.
// Dados de entrada vêm do Maestro (api/projetos-tatico.js). Regra "sem dado, sem verde": sem status há mais de 7 dias = cinza.
const ok = v => v != null && v !== '' && isFinite(Number(v));
const N = v => (ok(v) ? Number(v) : null);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const iso = v => { const s = String(v || '').slice(0, 10); return ISO.test(s) ? s : null; };

export const REGRAS_PADRAO = { limite_projetos_gerente: 4, limite_frentes_execucao: 2, dias_sem_status_cinza: 7, relacao_verde: 1, relacao_amarelo: 0.85, dias_uteis_tolerancia: 5, aditivo_fundador_acima: 15000 };
export const ICONE = { verde: '●', amarelo: '▲', vermelho: '✖', cinza: '○' };

// dias úteis (seg–sex) entre duas datas ISO: positivo se b é depois de a. Feriados não entram (mesma limitação da aba Equipe).
export function diasUteis(a, b) {
  a = iso(a); b = iso(b); if (!a || !b) return null; if (a === b) return 0;
  const sinal = b > a ? 1 : -1; let [ini, fim] = sinal > 0 ? [a, b] : [b, a], n = 0;
  for (let t = Date.parse(ini + 'T12:00:00Z') + 864e5, f = Date.parse(fim + 'T12:00:00Z'); t <= f; t += 864e5) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n * sinal;
}
export const diasCorridos = (a, b) => (iso(a) && iso(b) ? Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5) : null);

// Farol calculado. Entrada: { pct_real, pct_plan, prometida, previsao, marco_vencido_sem_aceite, dias_sem_status, hoje }
//  relação = % real ÷ % planejado.
//  cinza    : sem status há mais de 7 dias (ou nunca) — vence qualquer outra regra
//  vermelho : relação < 85% · previsão mais de 5 dias úteis depois da prometida · marco vencido sem aceite
//  amarelo  : relação de 85% a 99% · previsão de 1 a 5 dias úteis depois
//  verde    : relação ≥ 100% e previsão dentro da data prometida
// Sem % real = cinza ("sem avanço"). Planejado 0 ou ausente = nada previsto até hoje: a relação não penaliza (100%).
export function calcularFarol(e, regras = REGRAS_PADRAO) {
  const R = { ...REGRAS_PADRAO, ...(regras || {}) }, motivos = [];
  const sem = e.dias_sem_status;
  if (sem == null || sem > R.dias_sem_status_cinza) return { cor: 'cinza', icone: ICONE.cinza, relacao: null, atraso_uteis: null, motivos: [sem == null ? 'sem status report' : 'sem status há ' + sem + ' dias (limite ' + R.dias_sem_status_cinza + ')'] };
  const real = N(e.pct_real), plan = N(e.pct_plan);
  if (real == null) return { cor: 'cinza', icone: ICONE.cinza, relacao: null, atraso_uteis: null, motivos: ['sem avanço do cronograma'] };
  const relacao = plan != null && plan > 0 ? real / plan : 1;
  const atraso = e.prometida && e.previsao ? diasUteis(e.prometida, e.previsao) : null; // > 0 = previsão depois da prometida
  let cor = 'verde';
  if (relacao < R.relacao_amarelo) { cor = 'vermelho'; motivos.push('relação real ÷ planejado ' + Math.round(relacao * 100) + '% (< ' + R.relacao_amarelo * 100 + '%)'); }
  else if (relacao < R.relacao_verde) { cor = 'amarelo'; motivos.push('relação real ÷ planejado ' + Math.round(relacao * 100) + '%'); }
  if (atraso != null && atraso > R.dias_uteis_tolerancia) { cor = 'vermelho'; motivos.push('previsão ' + atraso + ' dias úteis depois da data prometida'); }
  else if (atraso != null && atraso > 0) { if (cor === 'verde') cor = 'amarelo'; motivos.push('previsão ' + atraso + ' dia(s) útil(eis) depois da data prometida'); }
  if (e.marco_vencido_sem_aceite) { cor = 'vermelho'; motivos.push('marco vencido sem aceite' + (typeof e.marco_vencido_sem_aceite === 'string' ? ': ' + e.marco_vencido_sem_aceite : '')); }
  return { cor, icone: ICONE[cor], relacao: Math.round(relacao * 1000) / 1000, atraso_uteis: atraso, motivos };
}

// informado (status report) × calculado: divergir = alerta. Cinza calculado por falta de dado não gera divergência.
export function divergencia(informado, calculado) {
  const i = String(informado || '').toLowerCase(), c = String(calculado || '').toLowerCase();
  if (!i || !c || c === 'cinza') return null;
  return i === c ? null : { informado: i, calculado: c, texto: 'GP informou ' + i + ' e o cálculo dá ' + c };
}

// gerente com mais de N projetos ativos · pessoa com mais de N frentes (projetos) em execução. Só nomes agregados na tela do gestor.
export function alertasCarga(linhas, alocacao, regras = REGRAS_PADRAO) {
  const R = { ...REGRAS_PADRAO, ...(regras || {}) }, g = {}, out = { gerentes: [], pessoas: [] };
  (linhas || []).filter(l => l.ativo !== false).forEach(l => { const k = String(l.gerente || '').trim(); if (k) (g[k] = g[k] || []).push(l.projeto); });
  Object.entries(g).forEach(([nome, ps]) => { if (ps.length > R.limite_projetos_gerente) out.gerentes.push({ gerente: nome, projetos: ps.length, limite: R.limite_projetos_gerente, lista: ps }); });
  Object.entries(alocacao || {}).forEach(([pessoa, ps]) => { const u = [...new Set(ps)]; if (u.length > R.limite_frentes_execucao) out.pessoas.push({ pessoa, frentes: u.length, limite: R.limite_frentes_execucao, projetos: u }); });
  out.gerentes.sort((a, b) => b.projetos - a.projetos); out.pessoas.sort((a, b) => b.frentes - a.frentes);
  return out;
}

// R$ em risco: marcos com valor, não aceitos, já vencidos — mais os que vencem em até 30 dias em projeto amarelo/vermelho.
export function reaisEmRisco(marcos, cor, hoje) {
  let tot = 0; const lista = [];
  (marcos || []).forEach(m => { const v = N(m.valor), fim = iso(m.fim); if (!(v > 0) || !fim || m.feito) return;
    const venc = fim < hoje, prox = (cor === 'amarelo' || cor === 'vermelho') && fim >= hoje && diasCorridos(hoje, fim) <= 30;
    if (venc || prox) { tot += v; lista.push({ nome: m.nome, fim, valor: v, vencido: venc }); } });
  return { total: Math.round(tot * 100) / 100, marcos: lista };
}

export function resumoPortfolio(linhas) {
  const c = { verde: 0, amarelo: 0, vermelho: 0, cinza: 0 }; let atraso = 0, risco = 0, vencidas = 0, criticos = 0;
  (linhas || []).forEach(l => { c[l.farol_calculado?.cor || 'cinza']++; atraso += Math.max(0, N(l.dias_atraso) || 0); risco += N(l.reais_risco) || 0; vencidas += N(l.acoes_vencidas) || 0; criticos += N(l.problemas_criticos) || 0; });
  return { ...c, total: (linhas || []).length, dias_atraso: atraso, reais_risco: Math.round(risco * 100) / 100, acoes_vencidas: vencidas, problemas_criticos: criticos };
}
