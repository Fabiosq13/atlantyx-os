// lib/proposta-calc.js — v3.24
// Inteligência financeira da proposta: compara FORMATOS comerciais para o mesmo escopo e pontua cada um
// por (1) contribuição às metas da Atlantyx, (2) vendabilidade para o cliente, (3) efeito no caixa e (4) risco.
// Determinístico (sem IA) — a IA só explica e redige; os números saem daqui.

export const PARAMS_PADRAO = {
  impostos_pct: 6,            // % sobre o faturamento (Simples: alíquota efetiva do DAS)
  overhead_pct: 15,           // % sobre o custo direto (gestão, ferramentas, estrutura)
  margem_min_pct: 15,         // margem de contribuição mínima aceitável
  margem_alvo_pct: 30,        // margem de contribuição alvo
  desconto_recorrente_pct: 5, // desconto por compromisso mensal ≥ 12 meses
  contingencia: { baixo: 10, medio: 20, alto: 35 }, // % de reserva de risco no escopo fechado
  prazo_recebimento_dias: 35, // regra da Atlantyx: 35 dias corridos após termo/NF
  meta_recorrente_pct: 30,    // % da receita que deve ser recorrente (ARR)
  setup_pct: 30,              // parte do valor cobrada como setup no formato híbrido
};

export const FORMATOS = {
  tm:      { nome: 'Alocação por hora (T&M)', resumo: 'Cobra as horas efetivamente trabalhadas por perfil, medidas no mês.' },
  fechado: { nome: 'Escopo fechado', resumo: 'Preço fixo pelo escopo, faturado por marcos de entrega.' },
  mensal:  { nome: 'Mensalidade recorrente', resumo: 'Squad/serviço contínuo com valor mensal fixo (receita recorrente).' },
  hibrido: { nome: 'Híbrido: setup + mensalidade', resumo: 'Parte inicial como setup e o restante em mensalidades — entra caixa cedo e cria recorrência.' },
};

// Aderência do formato ao tipo de demanda do cliente (0..1)
const ADERENCIA = {
  escopo_fechado: { tm: .45, fechado: 1, mensal: .35, hibrido: .8 },
  evolucao:       { tm: .7, fechado: .4, mensal: 1, hibrido: .85 },
  sustentacao:    { tm: .5, fechado: .2, mensal: 1, hibrido: .6 },
  alocacao:       { tm: 1, fechado: .3, mensal: .75, hibrido: .5 },
  produto:        { tm: .3, fechado: .5, mensal: .9, hibrido: 1 },
  indefinido:     { tm: .8, fechado: .5, mensal: .6, hibrido: .8 },
};
const RISCO_ATX = { tm: 1, mensal: .85, hibrido: .65, fechado: null }; // fechado depende do risco do escopo

const n = (v, d = 0) => { const x = parseFloat(v); return isFinite(x) ? x : d; };
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const addMes = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().substring(0, 7); };

// Cronograma de faturamento (mês de emissão) → recebimento (+prazo)
function cronograma(formato, valor, meses, inicio, p) {
  const M = Math.max(1, Math.round(meses));
  const fat = [];
  if (formato === 'tm' || formato === 'mensal') for (let i = 0; i < M; i++) fat.push({ mes: addMes(inicio, i), valor: valor / M, desc: formato === 'tm' ? `Medição de horas ${i + 1}/${M}` : `Mensalidade ${i + 1}/${M}` });
  else if (formato === 'fechado') {
    // 20% na assinatura (kickoff) + marcos iguais ao longo do projeto, o último na entrega
    const nMarcos = Math.min(Math.max(2, Math.ceil(M / 2)), 5);
    fat.push({ mes: inicio, valor: valor * .2, desc: 'Assinatura / kickoff (20%)' });
    for (let k = 1; k <= nMarcos; k++) fat.push({ mes: addMes(inicio, Math.max(1, Math.round(k * M / nMarcos)) - 1 + (k === nMarcos ? 0 : 0)), valor: valor * .8 / nMarcos, desc: `Marco ${k}/${nMarcos}${k === nMarcos ? ' — aceite final' : ''}` });
  } else if (formato === 'hibrido') {
    const setup = valor * (p.setup_pct / 100);
    fat.push({ mes: inicio, valor: setup, desc: `Setup (${p.setup_pct}%)` });
    for (let i = 0; i < M; i++) fat.push({ mes: addMes(inicio, i), valor: (valor - setup) / M, desc: `Mensalidade ${i + 1}/${M}` });
  }
  const dias = p.prazo_recebimento_dias;
  return fat.map(f => ({ ...f, valor: r2(f.valor), recebe: addMes(f.mes, Math.round(dias / 30)) }));
}

export function calcularFormatos(entrada = {}) {
  const p = { ...PARAMS_PADRAO, ...(entrada.params || {}), contingencia: { ...PARAMS_PADRAO.contingencia, ...((entrada.params || {}).contingencia || {}) } };
  const perfis = (entrada.perfis || []).map(x => ({ perfil: x.perfil || 'Perfil', horas: n(x.horas), custo_hora: n(x.custo_hora), preco_hora: n(x.preco_hora) || null, preco_teto: n(x.preco_teto) || null, preco_piso: n(x.preco_piso) || null })).filter(x => x.horas > 0);
  if (!perfis.length) throw new Error('Informe ao menos um perfil com horas');
  const meses = Math.max(1, n(entrada.meses, 3));
  const hoje = new Date();
  const inicio = /^\d{4}-\d{2}$/.test(entrada.inicio || '') ? entrada.inicio : addMes(hoje.toISOString().substring(0, 7), 1); // padrão: mês que vem
  const risco = ['baixo', 'medio', 'alto'].includes(entrada.risco) ? entrada.risco : 'medio';
  const tipo = ADERENCIA[entrada.tipo_demanda] ? entrada.tipo_demanda : 'indefinido';
  const imp = p.impostos_pct / 100, mAlvo = p.margem_alvo_pct / 100, mMin = p.margem_min_pct / 100;
  if (imp + mAlvo >= .95) throw new Error('Impostos + margem alvo acima de 95% — revise os parâmetros');

  const horas = perfis.reduce((a, x) => a + x.horas, 0);
  const custoDireto = perfis.reduce((a, x) => a + x.horas * x.custo_hora, 0);
  if (!(custoDireto > 0)) throw new Error('Custo zerado: informe o custo/hora dos perfis (rate card ou RH)');
  const custoTotal = custoDireto * (1 + p.overhead_pct / 100);
  const precoCostPlus = custoTotal / (1 - imp - mAlvo);          // preço que entrega exatamente a margem alvo
  const tmValor = perfis.reduce((a, x) => a + x.horas * (x.preco_hora || x.custo_hora * (1 + p.overhead_pct / 100) / (1 - imp - mAlvo)), 0);
  const cont = (p.contingencia[risco] || 0) / 100;

  const valores = {
    tm: tmValor,
    fechado: precoCostPlus * (1 + cont),
    mensal: precoCostPlus * (meses >= 12 ? 1 - p.desconto_recorrente_pct / 100 : 1),
    hibrido: precoCostPlus * (1 + cont / 2),
  };

  // Metas
  const M = entrada.metas || {};
  const anoAtual = String(hoje.getFullYear());
  const metaAnual = n(M.anual), realizado = n(M.realizado_ano), pipePond = n(M.pipeline_ponderado);
  const gap = Math.max(0, metaAnual - realizado - pipePond);
  const recAtualMensal = n(M.recorrente_atual_mensal), receitaMensalRef = n(M.receita_mensal_ref) || (metaAnual ? metaAnual / 12 : 0);
  const recPctAtual = receitaMensalRef ? recAtualMensal / receitaMensalRef * 100 : 0;
  const necessidadeRec = clamp((p.meta_recorrente_pct - recPctAtual) / Math.max(1, p.meta_recorrente_pct), .25, 1); // quão longe está da meta de recorrência
  const orc = n(entrada.orcamento_cliente) || null, orcTipo = entrada.orcamento_tipo === 'mensal' ? 'mensal' : 'total';
  const win = (entrada.historico && entrada.historico.win_rate) || {};

  const out = Object.keys(FORMATOS).map(f => {
    const valor = r2(valores[f]);
    const crono = cronograma(f, valor, meses, inicio, p);
    const liquido = valor * (1 - imp);
    const lucro = liquido - custoTotal;
    const margem = valor ? lucro / valor : 0;
    const noAno = crono.filter(c => c.mes.startsWith(anoAtual)).reduce((a, c) => a + c.valor, 0);
    const caixaNoAno = crono.filter(c => c.recebe.startsWith(anoAtual)).reduce((a, c) => a + c.valor, 0);
    const mensalMedio = valor / meses;
    const recorrenteMensal = f === 'mensal' ? mensalMedio : f === 'hibrido' ? (valor * (1 - p.setup_pct / 100)) / meses : 0;
    const arr = recorrenteMensal * 12;
    // caixa: custo mensal sai todo mês; recebimentos entram com atraso → menor saldo acumulado
    const custoMes = custoTotal / meses; let acum = 0, pior = 0;
    for (let i = 0; i < meses + 3; i++) { const mm = addMes(inicio, i); if (i < meses) acum -= custoMes; acum += crono.filter(c => c.recebe === mm).reduce((a, c) => a + c.valor * (1 - imp), 0); pior = Math.min(pior, acum); }
    const primeiroRec = crono.length ? crono[0].recebe : null;
    const precoHoraEf = valor / horas;
    const tetoMed = perfis.filter(x => x.preco_teto).length ? perfis.reduce((a, x) => a + (x.preco_teto || 0) * x.horas, 0) / perfis.filter(x => x.preco_teto).reduce((a, x) => a + x.horas, 0) : null;

    // ── Scores ──
    const sAno = gap > 0 ? clamp(noAno / gap * 4) : clamp(noAno / Math.max(1, valor)); // ajuda a fechar o gap do ano (proposta média cobre ~25% do gap)
    const sRec = arr > 0 ? 1 : 0;
    const sMargem = margem >= mAlvo - .005 ? 1 : margem >= mMin ? .55 : 0;
    const metas = 100 * (.4 * sAno + .3 * sRec * necessidadeRec + .3 * sMargem) / (.4 + .3 * necessidadeRec + .3);
    let sOrc = .7; const parcela = f === 'fechado' ? valor * .2 : f === 'hibrido' ? Math.max(valor * p.setup_pct / 100, recorrenteMensal) : mensalMedio;
    if (orc) sOrc = orcTipo === 'total' ? (valor <= orc ? 1 : clamp(1 - (valor - orc) / orc * 2)) : (parcela <= orc ? 1 : clamp(1 - (parcela - orc) / orc * 2));
    const sPrecoHora = tetoMed ? (precoHoraEf <= tetoMed ? 1 : clamp(1 - (precoHoraEf - tetoMed) / tetoMed * 3)) : .8;
    const sWin = win[f] != null ? clamp(n(win[f])) : null;
    const vend = 100 * (sWin != null ? (.4 * ADERENCIA[tipo][f] + .3 * sOrc + .15 * sPrecoHora + .15 * sWin) : (.45 * ADERENCIA[tipo][f] + .35 * sOrc + .2 * sPrecoHora));
    const sCaixa = clamp(1 + pior / Math.max(1, custoTotal)); // 1 = nunca fica negativo; 0 = financia o projeto inteiro
    const caixa = 100 * sCaixa;
    const sRisco = f === 'fechado' ? ({ baixo: .8, medio: .5, alto: .2 }[risco]) : RISCO_ATX[f];
    const riscoS = 100 * sRisco;
    let total = .4 * metas + .35 * vend + .15 * caixa + .1 * riscoS;
    const alertas = [];
    if (margem < mMin) { alertas.push(`Margem ${(margem * 100).toFixed(1)}% abaixo do mínimo (${p.margem_min_pct}%)`); total *= .5; }
    if (orc && sOrc < .5) alertas.push(`Acima do orçamento do cliente (${orcTipo})`);
    if (f === 'fechado' && risco === 'alto') alertas.push('Escopo de risco alto em preço fixo — exigir premissas e controle de mudanças');
    if (f === 'mensal' && meses < 6) alertas.push('Prazo curto para mensalidade — pouco aderente a recorrência');
    if (tetoMed && precoHoraEf > tetoMed) alertas.push(`Preço/hora efetivo R$ ${precoHoraEf.toFixed(0)} acima do teto do rate card (R$ ${tetoMed.toFixed(0)})`);
    return { formato: f, nome: FORMATOS[f].nome, resumo: FORMATOS[f].resumo, valor_total: valor, valor_mensal_medio: r2(mensalMedio), recorrente_mensal: r2(recorrenteMensal), arr: r2(arr),
      lucro: r2(lucro), margem_pct: r2(margem * 100), preco_hora_efetivo: r2(precoHoraEf), receita_no_ano: r2(noAno), caixa_no_ano: r2(caixaNoAno), cobertura_gap_pct: gap ? r2(noAno / gap * 100) : null,
      pior_caixa: r2(pior), primeiro_recebimento: primeiroRec, cronograma: crono,
      scores: { metas: Math.round(metas), vendavel: Math.round(vend), caixa: Math.round(caixa), risco: Math.round(riscoS), total: Math.round(total) }, alertas };
  }).sort((a, b) => b.scores.total - a.scores.total);

  return {
    entrada: { meses, inicio, risco, tipo_demanda: tipo, orcamento_cliente: orc, orcamento_tipo: orcTipo, horas: r2(horas) },
    custos: { custo_direto: r2(custoDireto), custo_total: r2(custoTotal), preco_minimo: r2(custoTotal / (1 - imp - mMin)), preco_alvo: r2(precoCostPlus) },
    metas: { meta_anual: metaAnual, realizado_ano: realizado, pipeline_ponderado: pipePond, gap: r2(gap), recorrente_atual_mensal: recAtualMensal, recorrente_pct_atual: r2(recPctAtual), meta_recorrente_pct: p.meta_recorrente_pct, necessidade_recorrencia: r2(necessidadeRec) },
    params: p, formatos: out, recomendado: out[0].formato,
  };
}
