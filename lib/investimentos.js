// lib/investimentos.js — v3.400 · Investimentos e retiradas (tela "Financeiro → Investimentos")
// Responde: QUANDO e QUANTO retirar da empresa (e de que forma), qual carteira para o caixa da empresa
// (curto/médio/longo prazo, Brasil × exterior) e qual carteira para o sócio cumprir as metas pessoais —
// tudo lido do cenário econômico ATUAL (pesquisa na web: Selic, Focus, IPCA, câmbio, CDI, juros nos EUA,
// propostas em debate) e dos números reais da Atlantyx (caixa, fluxo futuro 12 meses, metas, despesas).
// Não substitui assessor/CVM: é análise para decisão do fundador, com as fontes consultadas.
const PARAMS_PADRAO = {
  reserva_meses: 6,            // meses de despesa que ficam SEMPRE em caixa/liquidez diária
  perfil: 'moderado',          // conservador | moderado | arrojado
  horizonte_anos: 5,
  retirada_mensal_desejada: null, // R$ (pró-labore + distribuição) que o sócio gostaria de retirar
  exposicao_exterior_pct: null,   // % desejado em dólar/exterior (null = a IA sugere)
  metas_pessoais: '',          // texto livre: o que o sócio quer comprar/alcançar e quando
  observacoes: '',             // restrições: "não quero cripto", "já tenho imóvel", etc.
};
const K_PARAMS = 'inv:params', K_ULTIMA = 'inv:ultima';

export function paramsNormalizar(p = {}) {
  const o = { ...PARAMS_PADRAO, ...(p || {}) };
  o.reserva_meses = Math.max(1, Math.min(24, +o.reserva_meses || 6)); o.horizonte_anos = Math.max(1, Math.min(30, +o.horizonte_anos || 5));
  o.perfil = ['conservador', 'moderado', 'arrojado'].includes(o.perfil) ? o.perfil : 'moderado';
  o.retirada_mensal_desejada = o.retirada_mensal_desejada ? +o.retirada_mensal_desejada : null;
  o.exposicao_exterior_pct = o.exposicao_exterior_pct != null && o.exposicao_exterior_pct !== '' ? Math.max(0, Math.min(100, +o.exposicao_exterior_pct)) : null;
  o.metas_pessoais = String(o.metas_pessoais || '').substring(0, 2000); o.observacoes = String(o.observacoes || '').substring(0, 1500);
  return o;
}

const json = t => { const s = String(t || '').replace(/```json|```/g, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); try { return JSON.parse(s.substring(a, b + 1)); } catch (_) { return null; } };
const hojeBR = () => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

// ── 1. cenário macro ATUAL, com busca na web (Selic, Focus, IPCA, câmbio, Fed, propostas em debate) ──
async function cenarioMacro(claudeTools) {
  const sys = `Você é economista-chefe de uma gestora brasileira. Hoje é ${hojeBR()}. Use a busca na web (várias buscas) para levantar o cenário ATUAL e as EXPECTATIVAS, sempre citando a fonte e a data de cada número. Nunca invente número: se não achar, diga "não encontrado".
Responda SOMENTE JSON:
{"data_base":"AAAA-MM-DD",
 "brasil":{"selic_pct":0,"selic_proxima_reuniao":"...","cdi_pct":0,"ipca_12m_pct":0,"ipca_expectativa_ano_pct":0,"focus_selic_fim_ano_pct":0,"focus_selic_proximo_ano_pct":0,"cambio_brl_usd":0,"pib_expectativa_pct":0,"fiscal":"2 frases sobre o quadro fiscal/dívida","juro_real_pct":0,"curva_juros":"o que a curva (DI/NTN-B) precifica para 1, 2 e 5 anos"},
 "debates":[{"tema":"ex.: proposta de redução estrutural dos juros (Lara Resende e outros), mudanças de tributação de investimentos, reforma, eleições","o_que_e":"...","probabilidade":"baixa|media|alta","efeito_se_acontecer":"...","fonte":"..."}],
 "exterior":{"fed_funds_pct":0,"treasury_10a_pct":0,"inflacao_eua_pct":0,"sp500_tendencia":"...","dolar_tendencia":"...","risco_global":"..."},
 "leitura":{"curto_prazo_6m":"...","medio_prazo_2a":"...","longo_prazo_5a":"...","o_que_favorece":["classes de ativo favorecidas e por quê"],"o_que_evitar":["..."]},
 "fontes":[{"titulo":"...","url":"https://...","data":"AAAA-MM-DD"}]}`;
  const txt = await claudeTools(sys, 'Levante o cenário econômico atual do Brasil e do exterior para decisões de investimento de uma empresa de tecnologia B2B e de seu sócio. Busque: Selic e próxima reunião do Copom; boletim Focus (Selic, IPCA, câmbio, PIB); IPCA acumulado; CDI; curva de juros; Fed funds e Treasury 10 anos; dólar; debate sobre redução de juros (ex.: André Lara Resende), tributação de investimentos e quadro fiscal. Responda em JSON.', 5000,
    [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }]);
  const j = json(txt); if (!j) throw new Error('A IA não devolveu o cenário macro em JSON — tente de novo');
  j.gerado_em = new Date().toISOString(); return j;
}

// ── 2. análise: retiradas + carteira da empresa + carteira do sócio, com os números reais ──
async function analise(claude, { params, macro, empresa, pessoal }) {
  const sys = `Você é o comitê de investimentos (economista + planejador financeiro CFP + contador tributarista) da Atlantyx, empresa brasileira de dados e IA, do fundador Fabio. Hoje é ${hojeBR()}.
Decida com os NÚMEROS REAIS do contexto e com o CENÁRIO MACRO pesquisado. Nunca invente número; quando faltar dado, diga qual e assuma uma premissa explícita.
Regras da casa:
- Reserva mínima de ${params.reserva_meses} meses de despesas fica SEMPRE em liquidez diária (Tesouro Selic, CDB DI liquidez diária de banco grande, fundo DI taxa zero). Retirada só do que sobra acima da reserva e do menor saldo projetado nos próximos 12 meses.
- Forma de retirada: compare pró-labore (INSS/IR na pessoa física) × distribuição de lucros (isenta na PF enquanto a lei vigente permitir; exige lucro contábil apurado) × JCP (se aplicável ao regime) — diga qual combinação paga menos imposto e é segura; cite o regime da empresa quando souber.
- Perfil do sócio: ${params.perfil}. Horizonte: ${params.horizonte_anos} anos.${params.retirada_mensal_desejada ? ' Retirada mensal desejada: R$ ' + params.retirada_mensal_desejada.toLocaleString('pt-BR') + '.' : ''}${params.exposicao_exterior_pct != null ? ' Exposição ao exterior desejada: ' + params.exposicao_exterior_pct + '%.' : ''}
- Carteira DINÂMICA: para cada classe diga a % e os GATILHOS de mudança conforme a política econômica (ex.: "se o Copom cortar para < X%, migrar parte do pós-fixado para prefixado/IPCA+/bolsa"; "se o dólar cair abaixo de R$ X, aumentar exterior").
- Nomeie instrumentos reais e acessíveis no Brasil (ex.: Tesouro Selic/IPCA+/Prefixado, CDB/LCI/LCA de bancos grandes ou médios com FGC, fundos DI/multimercado/ações conhecidos, ETFs como IVVB11/BOVA11/IMAB11, BDRs, conta internacional/ETFs no exterior como VOO/BND/VT, Treasuries) — sempre dizendo liquidez, risco, tributação e por quê. Para ações e fundos, cite exemplos com a ressalva de que o fundador deve conferir a lâmina atual.
- Diferencie o que é para a EMPRESA (caixa operacional, PJ: IR sobre rendimento, LCI/LCA não valem para PJ, fundos exclusivos não cabem) do que é para o SÓCIO (PF).
- Responda às perguntas diretas do fundador: CDB vale com a expectativa de queda de juros? Aplicar fora vale? Quais fundos e ações? Qual o melhor rendimento para a empresa? Qual a carteira ideal da Atlantyx por prazo?
- Termine com o aviso de que é análise para decisão e não recomendação de investimento regulada (CVM), e que ordens devem ser conferidas com assessor/contador.
Responda SOMENTE JSON:
{"resumo_executivo":"5 a 8 frases com as decisões",
 "diagnostico_caixa":{"caixa_hoje":0,"despesa_mensal":0,"reserva_minima":0,"menor_saldo_12m":0,"mes_menor_saldo":"AAAA-MM","excedente_distribuivel_hoje":0,"excedente_12m":0,"premissas":["..."]},
 "politica_retiradas":{"forma_recomendada":"...","imposto_estimado_pct":0,"regra":"quando e quanto retirar (regra clara)","calendario":[{"mes":"AAAA-MM","valor":0,"forma":"pro_labore|distribuicao|jcp","motivo":"..."}],"nao_retirar_se":["..."]},
 "carteira_empresa":{"objetivo":"...","total_aplicavel":0,"curto_prazo":[{"classe":"...","instrumento":"...","pct":0,"valor":0,"rentabilidade_esperada":"...","liquidez":"...","risco":"baixo|medio|alto","local":"Brasil|Exterior","por_que":"..."}],"medio_prazo":[],"longo_prazo":[],"rentabilidade_esperada_total":"..."},
 "carteira_socio":{"objetivo":"...","curto_prazo":[],"medio_prazo":[],"longo_prazo":[],"aporte_mensal_sugerido":0,"metas_pessoais_atendidas":[{"meta":"...","quando":"...","como":"..."}]},
 "brasil_x_exterior":{"recomendacao":"...","pct_exterior":0,"como_aplicar_fora":"...","riscos":["..."]},
 "respostas_diretas":[{"pergunta":"...","resposta":"..."}],
 "gatilhos":[{"se":"...","entao":"...","prazo":"curto|medio|longo"}],
 "plano_financeiro":{"empresa":{"valor_inicial":0,"aporte_mensal":0,"rentabilidade_liquida_aa_pct":0,"premissa":"como chegou à taxa (mix da carteira, já líquida de IR)"},"socio":{"valor_inicial":0,"aporte_mensal":0,"rentabilidade_liquida_aa_pct":0,"premissa":"..."},"inflacao_aa_pct":0},
 "riscos":["..."],"proximos_passos":["..."],"aviso":"..."}`;
  const user = `PARÂMETROS DO FUNDADOR: ${JSON.stringify(params)}
CENÁRIO MACRO (pesquisado hoje): ${JSON.stringify(macro).substring(0, 9000)}
NÚMEROS DA EMPRESA: ${JSON.stringify(empresa).substring(0, 14000)}
METAS E PROPÓSITO PESSOAL DO SÓCIO: ${JSON.stringify(pessoal).substring(0, 4000)}`;
  const txt = await claude(sys, [{ role: 'user', content: user }], 7000);
  const j = json(txt); if (!j) throw new Error('A IA não devolveu a análise em JSON — tente de novo');
  return j;
}

// ── 3. plano financeiro: projeção determinística (juros compostos) do que a carteira rende — "lucro previsto" ──
export function projetar({ valor_inicial = 0, aporte_mensal = 0, taxa_aa_pct = 0, anos = 5, inflacao_aa_pct = 0 }) {
  const im = Math.pow(1 + (+taxa_aa_pct || 0) / 100, 1 / 12) - 1; let saldo = +valor_inicial || 0, aportado = saldo; const linhas = [];
  for (let a = 1; a <= Math.max(1, Math.min(30, +anos || 5)); a++) {
    let rendAno = 0; for (let m = 0; m < 12; m++) { const r = saldo * im; rendAno += r; saldo += r + (+aporte_mensal || 0); aportado += +aporte_mensal || 0; }
    const real = inflacao_aa_pct ? saldo / Math.pow(1 + inflacao_aa_pct / 100, a) : null;
    linhas.push({ ano: a, aportado: Math.round(aportado), rendimento_ano: Math.round(rendAno), lucro_acumulado: Math.round(saldo - aportado), saldo: Math.round(saldo), saldo_real: real != null ? Math.round(real) : null });
  }
  const u = linhas[linhas.length - 1] || {};
  return { taxa_aa_pct: +taxa_aa_pct || 0, aporte_mensal: +aporte_mensal || 0, valor_inicial: +valor_inicial || 0, anos: linhas.length, lucro_previsto_total: u.lucro_acumulado || 0, saldo_final: u.saldo || 0, total_aportado: u.aportado || 0, renda_mensal_no_fim: Math.round((u.saldo || 0) * im), linhas };
}
export function planoFinanceiro(pf, anos, macro) {
  const P = pf && typeof pf === 'object' ? pf : {}; const infl = +P.inflacao_aa_pct || +macro?.brasil?.ipca_expectativa_ano_pct || 0;
  const mk = (x) => x && (x.valor_inicial || x.aporte_mensal) ? { ...projetar({ valor_inicial: x.valor_inicial, aporte_mensal: x.aporte_mensal, taxa_aa_pct: x.rentabilidade_liquida_aa_pct, anos, inflacao_aa_pct: infl }), premissa: x.premissa || '' } : null;
  return { inflacao_aa_pct: infl, horizonte_anos: anos, empresa: mk(P.empresa), socio: mk(P.socio) };
}

// deps: { claude(system, messages, max), claudeTools(system, content, max, tools), kv, chamar, contexto, contextoAmplo, propositoPessoal, salvarHistorico }
export async function investimentosAnalisar(deps, body = {}, usuario) {
  const params = paramsNormalizar({ ...((await deps.kv(K_PARAMS)) || {}), ...(body.params || {}) });
  await deps.kv(K_PARAMS, params);
  const T = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('demorou')), ms))]);
  // números reais em paralelo com a pesquisa macro
  const [macroR, vivoR, amploR, fluxoR, kpiR, pessoalR] = await Promise.allSettled([
    cenarioMacro(deps.claudeTools),
    T(deps.contexto(false), 60000), T(deps.contextoAmplo(false), 90000),
    T(deps.chamar('financeiro', { action: 'fluxo_futuro', params: { meses: 12 } }), 60000),
    T(deps.chamar('financeiro', { action: 'kpis_saude', params: {} }), 45000),
    deps.propositoPessoal(usuario),
  ]);
  const v = r => r.status === 'fulfilled' ? r.value : null, er = r => r.status === 'rejected' ? String(r.reason?.message || r.reason).substring(0, 120) : null;
  if (macroR.status === 'rejected') throw new Error('Cenário macro: ' + er(macroR));
  const macro = v(macroR), vivo = v(vivoR), amplo = v(amploR), fluxo = v(fluxoR), kpi = v(kpiR);
  const avisos = [['Contexto ao vivo', er(vivoR)], ['Histórico/metas', er(amploR)], ['Fluxo futuro', er(fluxoR)], ['KPIs', er(kpiR)]].filter(x => x[1]).map(x => x[0] + ': ' + x[1]);
  const fin = vivo?.financeiro || {};
  const empresa = {
    caixa: fin.caixa ?? null, a_receber: fin.receber ?? null, a_receber_vencido: fin.receber_vencido ?? null, a_pagar: fin.pagar ?? null, regime: fin.regime || amplo?.regime || null,
    ano: fin.ano || null, mes: fin.mes || null,
    fluxo_futuro_12m: fluxo ? { saldo_inicial: fluxo.saldo_inicial_atual, menor_saldo: fluxo.menor_saldo_projetado, mes_menor_saldo: fluxo.mes_menor_saldo, alertas: (fluxo.alertas || []).slice(0, 6),
      meses: fluxo.meses || [],
      por_mes: Object.fromEntries(Object.entries(fluxo.linhas || {}).filter(([k]) => /Total Entradas|Total Sa|Saldo Final|Resultado do M/i.test(k)).map(([k, m]) => [k, (fluxo.meses || []).map(x => m?.[x] ?? null)])) } : null,
    kpis_saude: kpi?.kpis || kpi || null,
    historico_resultados: amplo?.historico || null, metas: amplo?.metas || null, carteira_contratada: amplo?.carteira || null, motores: amplo?.motores || null, despesas: amplo?.despesas || null,
    avisos_dados: avisos,
  };
  const pessoal = v(pessoalR) || {};
  const a = await analise(deps.claude, { params, macro, empresa, pessoal });
  a.plano_financeiro = planoFinanceiro(a.plano_financeiro, params.horizonte_anos, macro);
  const out = { em: new Date().toISOString(), por: usuario || null, params, macro, analise: a, dados: empresa, avisos };
  await deps.kv(K_ULTIMA, out);
  let historico_id = null; try { historico_id = await deps.salvarHistorico('investimentos', { investimentos: { headline: a.resumo_executivo, ...out } }, usuario); } catch (_) {}
  return { ...out, historico_id };
}

export async function investimentosObter(deps) {
  return { params: paramsNormalizar((await deps.kv(K_PARAMS)) || {}), ultima: (await deps.kv(K_ULTIMA)) || null, padrao: PARAMS_PADRAO };
}
export async function investimentosParamsSalvar(deps, body = {}) { const p = paramsNormalizar(body.params || {}); await deps.kv(K_PARAMS, p); return { params: p }; }
