// v3.519 — Estúdio de Produtos e Esteira (Parte 4, fase 1): premissas, produtos e cálculo ao vivo.
// Tudo é parâmetro editável. Sementes = exemplo "hipótese a validar". Divisão por zero/premissa vazia nunca quebra: devolve null + aviso.
export const K_PREMISSAS = 'sim:premissas', K_PRODUTOS = 'sim:produtos', K_ESTEIRAS = 'sim:esteiras';
const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/\./g, x => (String(v).includes(',') ? '' : x)).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const r2 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
const pct = v => { const n = num(v); return n == null ? 0 : n / 100; };

export const PREMISSAS_SEMENTE = {
  custo_pessoa_dia: 276.56, custo_pessoa_dia_inclui: 'salário/PJ + encargos + ferramentas e nuvem (informado pelo fundador em 15/11/2026)',
  dias_uteis_mes: 21, horas_fundador_dia: 6, impostos_pct: null, comissao_pct: null,
  margem_piso_pct: 60, margem_meta_pct: 70, ebitda_meta_pct: 30, arr_meta_2027_pct: 30, arr_meta_2031_pct: 60,
  dso_dias: { grande: 30, medio: 30 }, limite_ocupacao_pct: 85, custo_max_entrada: 5000, contrato_minimo_grandes: 50000, catalogo_max_produtos: null,
  origem: { custo_pessoa_dia: 'informado pelo fundador', dso_dias: 'informado pelo fundador (30 dias após a conclusão)', contrato_minimo_grandes: 'informado pelo fundador', margem_piso_pct: 'hipótese a validar', margem_meta_pct: 'hipótese a validar', ebitda_meta_pct: 'hipótese a validar', dias_uteis_mes: 'hipótese a validar', limite_ocupacao_pct: 'hipótese a validar', custo_max_entrada: 'hipótese a validar' } };

export const SEMENTES = [
  { nome: 'Sprint (preço cheio)', publico: 'medio', degrau: 'A', tipo: 'entrada', periodicidade: 'unico', preco: 6900, pessoa_dias: 10 },
  { nome: 'Sprint (lançamento)', publico: 'medio', degrau: 'A', tipo: 'entrada', periodicidade: 'unico', preco: 3000, pessoa_dias: 10 },
  { nome: 'Atlantyx OS Essencial', publico: 'medio', degrau: 'B', tipo: 'recorrente', periodicidade: 'mensal', preco: 4000, pessoa_dias: 4, prazo_contrato_meses: 12 },
  { nome: 'Atlantyx OS Profissional', publico: 'medio', degrau: 'B', tipo: 'recorrente', periodicidade: 'mensal', preco: 8000, pessoa_dias: 8, prazo_contrato_meses: 12 },
  { nome: 'Atlantyx OS Plus', publico: 'medio', degrau: 'C', tipo: 'recorrente', periodicidade: 'mensal', preco: 15000, pessoa_dias: 15, prazo_contrato_meses: 12 },
  { nome: 'Intelligence — Diagnóstico + POC', publico: 'grande', degrau: 'A', tipo: 'projeto', periodicidade: 'unico', preco: 60000, pessoa_dias: 50 },
  { nome: 'Intelligence — Operação contínua', publico: 'grande', degrau: 'C', tipo: 'recorrente', periodicidade: 'mensal', preco: 40000, pessoa_dias: 42, prazo_contrato_meses: 12 } ];

export function premissasNormalizar(p, base = PREMISSAS_SEMENTE) {
  const o = { ...base, ...(p || {}) }, nn = ['custo_pessoa_dia', 'dias_uteis_mes', 'horas_fundador_dia', 'impostos_pct', 'comissao_pct', 'margem_piso_pct', 'margem_meta_pct', 'ebitda_meta_pct', 'arr_meta_2027_pct', 'arr_meta_2031_pct', 'limite_ocupacao_pct', 'custo_max_entrada', 'contrato_minimo_grandes', 'catalogo_max_produtos'];
  for (const k of nn) o[k] = num(o[k]);
  o.dso_dias = { grande: num(o.dso_dias?.grande), medio: num(o.dso_dias?.medio) };
  return o;
}

// Cálculo de um produto. Margem "completa" só inclui o que foi informado; o tipo de margem diz o que ficou de fora.
export function calcular(prod, prem) {
  const P = premissasNormalizar(prem), avisos = [], preco = num(prod?.preco), pd = num(prod?.pessoa_dias), cpd = P.custo_pessoa_dia;
  const var_fixo = ['nuvem', 'ia', 'ferramentas', 'outros'].reduce((s, k) => s + (num(prod?.['custo_' + k]) || 0), 0);
  const imp = pct(prod?.impostos_pct ?? P.impostos_pct), com = pct(prod?.comissao_pct ?? P.comissao_pct), f = imp + com;
  const fora = []; if (!imp) fora.push('impostos'); if (!com) fora.push('comissão'); if (!(num(prod?.custo_nuvem) || num(prod?.custo_ia))) fora.push('nuvem/IA por cliente');
  const tipo_margem = 'mão de obra direta (pessoa-dia' + (var_fixo ? ' + custos variáveis informados' : '') + ')' + (imp || com ? ' com ' + [imp ? 'impostos' : '', com ? 'comissão' : ''].filter(Boolean).join(' e ') : '') + (fora.length ? ' — fora do cálculo: ' + fora.join(', ') : '');
  if (preco == null || preco <= 0) avisos.push('Informe o preço'); if (pd == null || pd < 0) avisos.push('Informe o esforço em pessoa-dias'); if (cpd == null || cpd <= 0) avisos.push('Informe o custo por pessoa-dia nas premissas');
  const out = { tipo_margem, avisos, custo_unidade: null, receita_liquida: null, margem_bruta: null, margem_bruta_pct: null, margem_contribuicao_pd: null, preco_minimo_piso: null, preco_minimo_meta: null, limite_esforco_piso: null, limite_esforco_meta: null, semaforo: 'cinza', motivo: avisos[0] || '', captacao: false };
  if (avisos.length) return out;
  const recLiq = preco * (1 - f), custo = pd * cpd + var_fixo;
  out.custo_unidade = r2(custo); out.receita_liquida = r2(recLiq);
  out.margem_bruta = r2(recLiq - custo); out.margem_bruta_pct = recLiq > 0 ? r2((recLiq - custo) / recLiq * 100) : null;
  out.margem_contribuicao_pd = pd > 0 ? r2((recLiq - var_fixo) / pd) : null;
  const alvo = m => (m == null || m >= 100 || f >= 1) ? null : r2(custo / ((1 - f) * (1 - m / 100)));
  out.preco_minimo_piso = alvo(P.margem_piso_pct); out.preco_minimo_meta = alvo(P.margem_meta_pct);
  const lim = m => m == null ? null : r2((preco * (1 - f) * (1 - m / 100) - var_fixo) / cpd);
  out.limite_esforco_piso = lim(P.margem_piso_pct); out.limite_esforco_meta = lim(P.margem_meta_pct);
  const m = out.margem_bruta_pct;
  if (m == null) { out.semaforo = 'cinza'; out.motivo = 'Receita líquida zero'; return out; }
  if (P.margem_meta_pct != null && m >= P.margem_meta_pct) { out.semaforo = 'verde'; out.motivo = 'Margem ' + m + '% na meta (' + P.margem_meta_pct + '%)'; }
  else if (P.margem_piso_pct != null && m >= P.margem_piso_pct) { out.semaforo = 'amarelo'; out.motivo = 'Margem ' + m + '% acima do piso (' + P.margem_piso_pct + '%) e abaixo da meta (' + P.margem_meta_pct + '%)'; }
  else { out.semaforo = 'vermelho'; out.motivo = 'Margem ' + m + '% abaixo do piso (' + P.margem_piso_pct + '%)'; }
  if (prod?.tipo === 'entrada' && out.semaforo === 'vermelho') {
    out.captacao = true; const teto = P.custo_max_entrada;
    out.motivo += ' — é custo de captação' + (teto != null ? (custo > teto ? ', ACIMA do teto de R$ ' + teto + ' por cliente' : ', dentro do teto de R$ ' + teto + ' por cliente') : '');
    if (teto != null && custo > teto) out.semaforo = 'vermelho'; else out.semaforo = 'amarelo';
  }
  if (prod?.publico === 'grande' && prod?.tipo === 'projeto' && P.contrato_minimo_grandes != null && preco < P.contrato_minimo_grandes) { out.semaforo = 'vermelho'; out.motivo += ' · abaixo do contrato mínimo de R$ ' + P.contrato_minimo_grandes + ' para grandes'; }
  return out;
}

export function produtoNormalizar(b, antigo, usuario) {
  const t = v => String(v ?? '').trim().substring(0, 200), n = num;
  const p = { id: antigo?.id || b.id, nome: t(b.nome), publico: ['grande', 'medio', 'atuais'].includes(b.publico) ? b.publico : 'medio', degrau: ['A', 'B', 'C'].includes(b.degrau) ? b.degrau : 'A',
    tipo: ['entrada', 'recorrente', 'projeto'].includes(b.tipo) ? b.tipo : 'projeto', status: ['rascunho', 'em_teste', 'ativo', 'pausado'].includes(b.status) ? b.status : (antigo?.status || 'rascunho'),
    periodicidade: b.periodicidade === 'mensal' ? 'mensal' : 'unico', preco: n(b.preco), pessoa_dias: n(b.pessoa_dias), prazo_contrato_meses: n(b.prazo_contrato_meses), taxa_implantacao: n(b.taxa_implantacao),
    abatimento: n(b.abatimento), custo_nuvem: n(b.custo_nuvem), custo_ia: n(b.custo_ia), custo_ferramentas: n(b.custo_ferramentas), custo_outros: n(b.custo_outros),
    impostos_pct: n(b.impostos_pct), comissao_pct: n(b.comissao_pct), capex_horas: n(b.capex_horas), opex_mensal: n(b.opex_mensal), churn_mensal_pct: n(b.churn_mensal_pct), dso_dias: n(b.dso_dias),
    origem: t(b.origem) || antigo?.origem || 'informado pelo fundador', obs: String(b.obs ?? '').substring(0, 600) };
  if (!p.nome) throw new Error('Dê um nome ao produto');
  p.versao = (antigo?.versao || 0) + 1; p.autor = usuario || null; p.em = new Date().toISOString(); return p;
}

export async function obter({ kv }) {
  const [pm, pr, es] = await Promise.all([kv(K_PREMISSAS), kv(K_PRODUTOS), kv(K_ESTEIRAS)]), prem = premissasNormalizar(pm?.premissas), L = Array.isArray(pr) ? pr : [];
  return { esteiras: (Array.isArray(es) ? es : []).map(e => ({ ...e, calculo: calcularEsteira(e, L, prem) })), premissas: prem, premissas_meta: pm ? { autor: pm.autor, em: pm.em, versao: pm.versao } : null, sementes_disponiveis: SEMENTES.length, produtos: L.map(p => ({ ...p, calculo: calcular(p, prem) })) };
}
export async function premissasSalvar({ kv }, b, usuario) {
  const ant = await kv(K_PREMISSAS), prem = premissasNormalizar({ ...(ant?.premissas || {}), ...(b.premissas || {}) });
  if (prem.custo_pessoa_dia == null || prem.custo_pessoa_dia <= 0) throw new Error('Informe o custo por pessoa-dia');
  await kv(K_PREMISSAS, { premissas: prem, autor: usuario || null, em: new Date().toISOString(), versao: (ant?.versao || 0) + 1 }); return obter({ kv });
}
export async function produtoSalvar({ kv }, b, usuario) {
  const L = (await kv(K_PRODUTOS)) || [], i = b.id ? L.findIndex(x => x.id === b.id) : -1, p = produtoNormalizar(b, i >= 0 ? L[i] : null, usuario);
  if (i >= 0) L[i] = p; else { p.id = 'prd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); L.push(p); }
  await kv(K_PRODUTOS, L); return obter({ kv });
}
export async function produtoAcao({ kv }, b, usuario) {
  const L = (await kv(K_PRODUTOS)) || [], i = L.findIndex(x => x.id === b.id); if (i < 0) throw new Error('Produto não encontrado');
  if (b.acao === 'duplicar') L.push({ ...L[i], id: 'prd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome: L[i].nome + ' (cópia)', status: 'rascunho', versao: 1, autor: usuario || null, em: new Date().toISOString() });
  else if (b.acao === 'pausar') L[i] = { ...L[i], status: L[i].status === 'pausado' ? 'rascunho' : 'pausado', versao: (L[i].versao || 0) + 1, autor: usuario || null, em: new Date().toISOString() };
  else if (b.acao === 'excluir') L.splice(i, 1); else throw new Error('Ação inválida');
  await kv(K_PRODUTOS, L); return obter({ kv });
}
export async function carregarSementes({ kv }, usuario) {
  const L = (await kv(K_PRODUTOS)) || [], nomes = new Set(L.map(x => x.nome));
  for (const x of SEMENTES) if (!nomes.has(x.nome)) { const p = produtoNormalizar({ ...x, origem: 'semente de exemplo — hipótese a validar' }, null, usuario); p.id = 'prd_' + Math.random().toString(36).slice(2, 10); L.push(p); }
  await kv(K_PRODUTOS, L); return obter({ kv });
}
export async function previa({ kv }, b) { const pm = await kv(K_PREMISSAS); return { calculo: calcular(b.produto || {}, premissasNormalizar({ ...(pm?.premissas || {}), ...(b.premissas || {}) })) }; }

// ── Fase 2: esteira A→B→C ──
// Por entrante: custo de aquisição = CAC de entrada + conv(A→B)×CAC(A→B) + conv(A→B)×conv(B→C)×CAC(B→C).
// Margem esperada = Σ fração que chega ao degrau × margem bruta do degrau (recorrente × meses do contrato, ou 1/churn). Nada é assumido: sem prazo/churn, o degrau recorrente conta 1 mês e avisa.
export function calcularEsteira(e, produtos, prem) {
  const P = premissasNormalizar(prem), av = [], pc = k => { const n = num(k); return n == null ? null : n / 100; };
  const ids = ['A', 'B', 'C'].map(g => e?.degraus?.[g] || null), prods = ids.map(id => (produtos || []).find(x => x.id === id) || null);
  const cAB = pc(e?.passagens?.AB?.conversao_pct), cBC = pc(e?.passagens?.BC?.conversao_pct), kAB = num(e?.passagens?.AB?.cac) || 0, kBC = num(e?.passagens?.BC?.cac) || 0, cac0 = num(e?.cac_entrada);
  if (!prods[0]) av.push('Escolha o produto do degrau A');
  if (prods[1] && cAB == null) av.push('Informe a conversão A→B'); if (prods[2] && !prods[1]) av.push('Degrau C sem degrau B'); if (prods[2] && cBC == null) av.push('Informe a conversão B→C'); if (cac0 == null) av.push('Informe o CAC de entrada (cliente novo)');
  const frac = [1, prods[1] && cAB != null ? cAB : 0, prods[2] && cAB != null && cBC != null ? cAB * cBC : 0];
  const por_degrau = prods.map((p, i) => { if (!p) return null; const c = calcular(p, P); let meses = 1, nota = '';
    if (p.periodicidade === 'mensal') { meses = num(p.prazo_contrato_meses) || (num(p.churn_mensal_pct) ? 100 / num(p.churn_mensal_pct) : null); if (!meses) { meses = 1; nota = 'sem prazo de contrato nem churn: contou 1 mês'; } }
    const mb = c.margem_bruta, receita = c.receita_liquida; return { degrau: 'ABC'[i], id: p.id, nome: p.nome, fracao: r2(frac[i]), margem_unidade: mb, meses, margem_total: mb == null ? null : r2(mb * meses), receita_total: receita == null ? null : r2(receita * meses), nota, semaforo: c.semaforo }; });
  const ok = !av.length || (prods[0] && cac0 != null);
  let cac_total = null, margem_esp = null, receita_esp = null, vendas = null, cac_venda = null, ltv_cac = null, payback = null, efeito = null;
  if (ok) {
    cac_total = r2(cac0 + frac[1] * kAB + frac[2] * kBC); vendas = r2(frac[0] + frac[1] + frac[2]); cac_venda = vendas > 0 ? r2(cac_total / vendas) : null;
    margem_esp = r2(por_degrau.reduce((s, d, i) => s + (d && d.margem_total != null ? frac[i] * d.margem_total : 0), 0)); receita_esp = r2(por_degrau.reduce((s, d, i) => s + (d && d.receita_total != null ? frac[i] * d.receita_total : 0), 0));
    ltv_cac = cac_total > 0 ? r2(margem_esp / cac_total) : null;
    const p0 = por_degrau[0], mensal = por_degrau.reduce((s, d, i) => s + (d && prods[i].periodicidade === 'mensal' && d.margem_unidade != null ? frac[i] * d.margem_unidade : 0), 0), unico = p0 && prods[0].periodicidade !== 'mensal' ? (p0.margem_unidade || 0) : 0;
    payback = mensal > 0 ? (cac_total - unico <= 0 ? 0 : r2((cac_total - unico) / mensal)) : (unico >= cac_total ? 0 : null);
    efeito = vendas > 1 && cac0 > 0 ? r2((1 - cac_venda / cac0) * 100) : 0; // quanto a esteira reduz o CAC por venda frente a só vender o degrau A
  }
  const aviso_dados = [...av]; if (por_degrau.some(d => d?.nota)) aviso_dados.push(...por_degrau.filter(d => d?.nota).map(d => 'Degrau ' + d.degrau + ': ' + d.nota));
  return { avisos: aviso_dados, por_degrau, cac_total_por_entrante: cac_total, vendas_por_entrante: vendas, cac_por_venda: cac_venda, margem_esperada_por_entrante: margem_esp, receita_esperada_por_entrante: receita_esp, ltv_cac, payback_meses: payback, reducao_cac_por_venda_pct: efeito,
    formula: 'CAC por entrante = CAC de entrada + conv(A→B)×CAC(A→B) + conv(A→B)×conv(B→C)×CAC(B→C); margem esperada = Σ fração que chega ao degrau × margem bruta do degrau (recorrente: × meses do contrato ou 1÷churn); LTV÷CAC = margem esperada ÷ CAC por entrante; payback = (CAC − margem do degrau único) ÷ margem mensal esperada.' };
}
export function esteiraNormalizar(b, antigo, usuario) {
  const t = v => String(v ?? '').trim().substring(0, 200), ps = k => ({ conversao_pct: num(b.passagens?.[k]?.conversao_pct), meses: num(b.passagens?.[k]?.meses), cac: num(b.passagens?.[k]?.cac), gatilho: t(b.passagens?.[k]?.gatilho) });
  const e = { id: antigo?.id || b.id, nome: t(b.nome), publico: ['grande', 'medio', 'atuais'].includes(b.publico) ? b.publico : 'medio', degraus: { A: b.degraus?.A || null, B: b.degraus?.B || null, C: b.degraus?.C || null }, cac_entrada: num(b.cac_entrada), passagens: { AB: ps('AB'), BC: ps('BC') }, origem: t(b.origem) || 'informado pelo fundador' };
  if (!e.nome) throw new Error('Dê um nome à esteira'); e.versao = (antigo?.versao || 0) + 1; e.autor = usuario || null; e.em = new Date().toISOString(); return e;
}
export async function esteiraSalvar({ kv }, b, usuario) {
  const L = (await kv(K_ESTEIRAS)) || [], i = b.id ? L.findIndex(x => x.id === b.id) : -1, e = esteiraNormalizar(b, i >= 0 ? L[i] : null, usuario);
  if (i >= 0) L[i] = e; else { e.id = 'est_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); L.push(e); }
  await kv(K_ESTEIRAS, L); return obter({ kv });
}
export async function esteiraExcluir({ kv }, b) { const L = ((await kv(K_ESTEIRAS)) || []).filter(x => x.id !== b.id); await kv(K_ESTEIRAS, L); return obter({ kv }); }
export async function esteiraPrevia({ kv }, b) { const [pm, pr] = await Promise.all([kv(K_PREMISSAS), kv(K_PRODUTOS)]); return { calculo: calcularEsteira(esteiraNormalizar(b, null, null), pr || [], premissasNormalizar(pm?.premissas)) }; }
