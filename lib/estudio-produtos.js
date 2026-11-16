// v3.519 — Estúdio de Produtos e Esteira (Parte 4, fase 1): premissas, produtos e cálculo ao vivo.
// Tudo é parâmetro editável. Sementes = exemplo "hipótese a validar". Divisão por zero/premissa vazia nunca quebra: devolve null + aviso.
export const K_PREMISSAS = 'sim:premissas', K_PRODUTOS = 'sim:produtos';
const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/\./g, x => (String(v).includes(',') ? '' : x)).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const r2 = v => v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
const pct = v => { const n = num(v); return n == null ? 0 : n / 100; };

export const PREMISSAS_SEMENTE = {
  custo_pessoa_dia: 276.56, custo_pessoa_dia_inclui: 'salário/PJ + encargos + ferramentas e nuvem (informado pelo fundador em 15/11/2026)',
  dias_uteis_mes: 21, horas_fundador_dia: 6, impostos_pct: null, comissao_pct: null,
  margem_piso_pct: 60, margem_meta_pct: 70, ebitda_meta_pct: 30, arr_meta_2027_pct: 30, arr_meta_2031_pct: 60,
  dso_dias: { grande: 30, medio: 30 }, limite_ocupacao_pct: 85, custo_max_entrada: 5000, contrato_minimo_grandes: 50000,
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
  const o = { ...base, ...(p || {}) }, nn = ['custo_pessoa_dia', 'dias_uteis_mes', 'horas_fundador_dia', 'impostos_pct', 'comissao_pct', 'margem_piso_pct', 'margem_meta_pct', 'ebitda_meta_pct', 'arr_meta_2027_pct', 'arr_meta_2031_pct', 'limite_ocupacao_pct', 'custo_max_entrada', 'contrato_minimo_grandes'];
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
  const [pm, pr] = await Promise.all([kv(K_PREMISSAS), kv(K_PRODUTOS)]), prem = premissasNormalizar(pm?.premissas), L = Array.isArray(pr) ? pr : [];
  return { premissas: prem, premissas_meta: pm ? { autor: pm.autor, em: pm.em, versao: pm.versao } : null, sementes_disponiveis: SEMENTES.length, produtos: L.map(p => ({ ...p, calculo: calcular(p, prem) })) };
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
