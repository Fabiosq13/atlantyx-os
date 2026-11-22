// lib/placar-calc.js — v3.572 · PLACAR DE METAS: um módulo só de cálculo (funções puras), usado por TV, Dashboard, e-mail e exportação.
// Regras: esperado até hoje · projeção por ritmo · gap · semáforo (maior/menor/faixa) · tendência (4 leituras) · placar geral · rito do vermelho.
// "Sem dado, sem verde": sem meta ou leitura velha = cinza, com a idade do dado.
const r2 = n => Math.round(n * 100) / 100;
const ok = v => v != null && v !== '' && isFinite(Number(v));
const N = v => (ok(v) ? Number(v) : null);

export const ICONE = { verde: '✔', amarelo: '▲', vermelho: '✖', cinza: '○' };
export const TEXTO = { verde: 'No alvo', amarelo: 'Atenção', vermelho: 'Fora da meta', cinza: 'Sem leitura' };

// fração do ano decorrida (0–1), pelos dias; curva = 12 valores mensais da meta (soma = meta anual) → fração da meta acumulada até hoje
export function fracaoAno(hoje) {
  const d = new Date(hoje + 'T12:00:00Z'), ini = Date.UTC(d.getUTCFullYear(), 0, 1), fim = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return Math.min(1, Math.max(0, (d.getTime() - ini) / (fim - ini)));
}
export function esperadoAteHoje(meta, hoje, curva) {
  meta = N(meta); if (meta == null) return null;
  const c = Array.isArray(curva) && curva.length === 12 ? curva.map(Number) : null, tot = c ? c.reduce((a, b) => a + (b || 0), 0) : 0;
  if (c && tot > 0) { const m = Number(hoje.slice(5, 7)) - 1, dm = Number(hoje.slice(8, 10)), nd = new Date(Date.UTC(Number(hoje.slice(0, 4)), m + 1, 0)).getUTCDate();
    const ate = c.slice(0, m).reduce((a, b) => a + (b || 0), 0) + (c[m] || 0) * (dm / nd); return r2(meta * ate / tot); }
  return r2(meta * fracaoAno(hoje));
}
// projeção de fechamento no ritmo atual (só acumulados; nunca soma pipeline em aberto)
export function projecaoRitmo(real, hoje, curva, meta) {
  real = N(real); if (real == null) return null;
  const esp = esperadoAteHoje(meta ?? 1, hoje, curva), tot = meta != null ? Number(meta) : 1;
  if (!(esp > 0) || fracaoAno(hoje) < 0.04) return null; // muito cedo no ano: sem projeção honesta
  return r2(real / (esp / tot));
}

// semáforo. def: { tipo:'acumulado'|'nivel', sentido:'maior'|'menor'|'faixa', tolerancia? }  leit: { real, meta, esperado?, faixa:[min,max]?, idade_dias? }
export function semaforo(def, leit, { maxIdade = 3 } = {}) {
  const real = N(leit.real), meta = N(leit.meta), idade = N(leit.idade_dias);
  const cinza = motivo => ({ cor: 'cinza', icone: ICONE.cinza, texto: motivo || TEXTO.cinza });
  if (real == null) return cinza('Sem leitura');
  if (idade != null && idade > maxIdade) return cinza('Dado de ' + idade + ' dias atrás');
  const s = def.sentido || 'maior', tol = N(def.tolerancia);
  let cor;
  if (s === 'faixa') {
    const f = leit.faixa; if (!Array.isArray(f) || f.length !== 2 || !ok(f[0]) || !ok(f[1])) return cinza('Sem meta');
    const [lo, hi] = f.map(Number), fora = real < lo ? lo - real : real > hi ? real - hi : 0;
    cor = fora === 0 ? 'verde' : fora <= (tol ?? 5) ? 'amarelo' : 'vermelho';
  } else {
    if (meta == null) return cinza('Sem meta');
    if (s === 'menor') cor = real <= meta ? 'verde' : real <= meta * 1.15 ? 'amarelo' : 'vermelho';
    else if (def.tipo === 'acumulado') { const esp = N(leit.esperado) ?? meta; cor = real >= meta || real >= esp ? 'verde' : real >= esp * 0.85 ? 'amarelo' : 'vermelho'; }
    else { const t = tol ?? (def.unidade === '%' ? 3 : meta * 0.05); // nível: pontos percentuais para %, 5% da meta para o resto
      cor = real >= meta ? 'verde' : real >= meta - t ? 'amarelo' : 'vermelho'; }
  }
  return { cor, icone: ICONE[cor], texto: TEXTO[cor] };
}

// tendência: leitura de hoje contra a média das 4 leituras anteriores. estável = variação < 2%
export function tendencia(valores, sentido = 'maior') {
  const v = (valores || []).map(N).filter(x => x != null); if (v.length < 2) return { seta: '→', rotulo: 'sem histórico', variacao_pct: null };
  const hoje = v[v.length - 1], ant = v.slice(Math.max(0, v.length - 5), v.length - 1), med = ant.reduce((a, b) => a + b, 0) / ant.length;
  const var_ = med ? (hoje - med) / Math.abs(med) * 100 : 0;
  if (Math.abs(var_) < 2) return { seta: '→', rotulo: 'estável', variacao_pct: r2(var_) };
  const sobe = var_ > 0, bom = sentido === 'menor' ? !sobe : sobe;
  return { seta: sobe ? '↑' : '↓', rotulo: bom ? 'melhorando' : 'piorando', variacao_pct: r2(var_), bom };
}

// monta um indicador completo (def do catálogo + leitura do dia)
export function montarIndicador(def, leit, hoje) {
  const l = { ...leit };
  if (def.tipo === 'acumulado' && l.meta != null && l.esperado == null) l.esperado = esperadoAteHoje(l.meta, hoje, l.curva);
  const sem = semaforo(def, l, { maxIdade: def.max_idade_dias ?? 3 });
  const proj = def.tipo === 'acumulado' && def.sentido !== 'menor' ? (l.projecao ?? projecaoRitmo(l.real, hoje, l.curva, l.meta)) : null;
  const gap = def.sentido === 'faixa' ? null : def.tipo === 'acumulado' ? (proj != null && N(l.meta) != null ? r2(proj - l.meta) : null) : (N(l.real) != null && N(l.meta) != null ? r2(l.real - l.meta) : null);
  return { id: def.id, nome: def.nome, grupo: def.grupo, unidade: def.unidade, sentido: def.sentido, tipo: def.tipo, fonte: def.fonte, dono: def.dono || null, formula: def.formula || null,
    visivel_tv: !!def.visivel_tv, privado: !!def.privado, rotulo: l.rotulo || (def.fonte === 'manual' ? 'manual' : null), idade_dias: N(l.idade_dias), erro: l.erro || null,
    meta: N(l.meta), faixa: l.faixa || null, real: N(l.real), esperado: N(l.esperado), projecao: proj, gap, tolerancia: N(def.tolerancia),
    ...sem, tendencia: tendencia(l.historico, def.sentido) };
}

// placar geral: contagem e pior indicador. Sem nota média.
export function resumoPlacar(inds) {
  const c = { verde: 0, amarelo: 0, vermelho: 0, cinza: 0 }; inds.forEach(i => { c[i.cor] = (c[i.cor] || 0) + 1; });
  const ordem = { vermelho: 0, amarelo: 1 };
  const risco = i => { const m = Math.abs(i.meta || 0); return m && i.real != null ? Math.abs((i.projecao ?? i.real) - i.meta) / m : 0; };
  const piores = inds.filter(i => ordem[i.cor] != null).sort((a, b) => ordem[a.cor] - ordem[b.cor] || risco(b) - risco(a));
  return { ...c, total: inds.length, pior: piores[0]?.id || null, piores: piores.slice(0, 3).map(i => i.id) };
}

// rito do vermelho: vermelho em 2 leituras seguidas, ou amarelo em queda por 4 → exige ação registrada
export function exigeAcao(cores) {
  const c = (cores || []).slice(-4);
  if (c.length >= 2 && c[c.length - 1] === 'vermelho' && c[c.length - 2] === 'vermelho') return { exige: true, motivo: 'vermelho por 2 leituras seguidas' };
  if (c.length === 4 && c.every(x => x === 'amarelo' || x === 'vermelho') && c.every((x, i) => i === 0 || x !== 'verde') && c.some(x => x === 'amarelo') && !c.every(x => x === 'vermelho')) return { exige: true, motivo: 'amarelo/vermelho por 4 leituras' };
  return { exige: false, motivo: null };
}
export function validarAcao(a) {
  const e = []; if (!String(a?.indicador || '').trim()) e.push('indicador'); if (!String(a?.o_que_muda || '').trim()) e.push('o que muda');
  if (!String(a?.dono || '').trim()) e.push('dono'); if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a?.prazo || ''))) e.push('prazo (AAAA-MM-DD)');
  return e.length ? 'Preencha: ' + e.join(', ') + '. Ação sem dono ou prazo não é salva.' : null;
}

// filtro da TV pública: só agregados, só indicadores marcados visivel_tv, sem nada privado. Nunca nome de cliente/projeto/pessoa, caixa ou margem por oferta.
export function paraTv(placar, { maxLinhas = 9 } = {}) {
  const pub = (placar?.indicadores || []).filter(i => i.visivel_tv && !i.privado);
  const lim = i => ({ id: i.id, nome: i.nome, grupo: i.grupo, unidade: i.unidade, meta: i.meta, faixa: i.faixa, real: i.real, esperado: i.esperado, projecao: i.projecao, gap: i.gap,
    cor: i.cor, icone: i.icone, texto: i.texto, tendencia: i.tendencia?.seta, rotulo: i.rotulo, idade_dias: i.idade_dias });
  const rec = pub.find(i => i.id === 'receita_ano'), resto = pub.filter(i => i.id !== 'receita_ano');
  return { ano: placar?.ano, gerado_em: placar?.gerado_em, receita: rec ? lim(rec) : null, linhas: resto.slice(0, maxLinhas).map(lim),
    resumo: (() => { const c = { verde: 0, amarelo: 0, vermelho: 0, cinza: 0 }; pub.forEach(i => { c[i.cor]++; }); return c; })(), acoes: (placar?.acoes_abertas || []).slice(0, 3).map(a => ({ indicador: a.indicador_nome || a.indicador, o_que_muda: String(a.o_que_muda || '').slice(0, 90), prazo: a.prazo })) };
}
