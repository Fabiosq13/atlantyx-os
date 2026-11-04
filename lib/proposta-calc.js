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
  // v3.365 · Máquina de POC e Propostas
  impostos_por_ano: {},       // { '2026': 16.33, '2027': 24 } — cada nota usa a alíquota do ano em que é emitida
  inflacao_anual_pct: 4.34,   // IPCA projetado (Focus) — corrige o custo ao longo do prazo
  dissidio_extra_pct: 1,      // reajuste salarial acima da inflação (dissídio/mercado)
  margem_poc_pct: 10,         // margem da POC (menor: é porta de entrada)
  poc_credito_dias: 60,       // valor da POC vira crédito no contrato se fechar em até N dias
  // v3.376 · regras para quem já é cliente da Atlantyx
  poc_semanas_padrao: 6,      // duração padrão da POC
  poc_cliente_pct: 0,         // % do preço da POC cobrado de quem já é cliente (0 = POC sem custo)
  desconto_cliente_pct: 5,    // desconto especial adicional no projeto para cliente que fecha no prazo abaixo
  desconto_cliente_dias: 60,  // prazo (dias) para o desconto de cliente valer
  // v3.379 · dados da empresa no modelo oficial de proposta (capa, rodapé, carta e assinaturas)
  empresa_razao: 'Atlanteam Soluções em TI', empresa_cnpj: '10.886.193/0001-83', empresa_email: 'contato@atlanteam.com.br',
  assinante_nome: 'Fábio Soares Quintanilha', assinante_cargo: 'CEO & Sócio-Diretor', assinante_email: '', dados_bancarios: '',
  tolerancia_concorrente_pct: 10, // acima disso do concorrente, sugere desconto
  premio_qualidade_pct: 5,    // aceitamos ficar até X% acima do concorrente (marca/entrega)
  creditos_cbs_pct: 0,        // a partir de 2027: créditos de CBS sobre compras (nuvem, software, equipamentos, PJ), em pontos % da receita
};

export const FORMATOS = {
  tm:      { nome: 'Alocação por hora (T&M)', resumo: 'Cobra as horas efetivamente trabalhadas por perfil, medidas no mês.' },
  fechado: { nome: 'Escopo fechado', resumo: 'Preço fixo pelo escopo, faturado por marcos de entrega.' },
  mensal:  { nome: 'Mensalidade recorrente', resumo: 'Squad/serviço contínuo com valor mensal fixo (receita recorrente).' },
  hibrido: { nome: 'Híbrido: setup + mensalidade', resumo: 'Parte inicial como setup e o restante em mensalidades — entra caixa cedo e cria recorrência.' },
  poc:     { nome: 'POC paga (crédito no contrato)', resumo: 'Prova de conceito com período e critérios de sucesso; 50% no início e 50% no relatório final; o valor vira crédito se o contrato fechar no prazo.' },
};

// Aderência do formato ao tipo de demanda do cliente (0..1)
const ADERENCIA = {
  escopo_fechado: { tm: .45, fechado: 1, mensal: .35, hibrido: .8, poc: .85 },
  evolucao:       { tm: .7, fechado: .4, mensal: 1, hibrido: .85, poc: .6 },
  sustentacao:    { tm: .5, fechado: .2, mensal: 1, hibrido: .6, poc: .3 },
  alocacao:       { tm: 1, fechado: .3, mensal: .75, hibrido: .5, poc: .3 },
  produto:        { tm: .3, fechado: .5, mensal: .9, hibrido: 1, poc: 1 },
  indefinido:     { tm: .8, fechado: .5, mensal: .6, hibrido: .8, poc: .9 },
};
const RISCO_ATX = { tm: 1, mensal: .85, hibrido: .65, fechado: null, poc: .9 }; // POC: prazo curto e escopo mínimo // fechado depende do risco do escopo

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
  } else if (formato === 'poc') {
    fat.push({ mes: inicio, valor: valor * .5, desc: 'Início da POC (50%)' });
    fat.push({ mes: addMes(inicio, M - 1), valor: valor * .5, desc: 'Relatório final e decisão go/no-go (50%)' });
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
  // v3.365: imposto do ANO de cada nota (2027 = CBS) e média ponderada no período para formar o preço
  const impAno = ym => { const a = String(ym).substring(0, 4), v = (p.impostos_por_ano || {})[a]; const bruto = v != null && isFinite(+v) ? +v : p.impostos_pct; return Math.max(0, bruto - (+a >= 2027 ? n(p.creditos_cbs_pct) : 0)) / 100; };
  const tipoDoc = ['poc', 'piloto'].includes(entrada.tipo_documento) ? entrada.tipo_documento : 'proposta';
  const mesesLista = Array.from({ length: Math.max(1, Math.round(meses)) }, (_, i) => addMes(inicio, i));
  const imp = mesesLista.reduce((a, m) => a + impAno(m), 0) / mesesLista.length, mAlvo = (tipoDoc === 'poc' ? p.margem_poc_pct : p.margem_alvo_pct) / 100, mMin = (tipoDoc === 'poc' ? Math.min(p.margem_poc_pct, p.margem_min_pct) : p.margem_min_pct) / 100;
  if (imp + mAlvo >= .95) throw new Error('Impostos + margem alvo acima de 95% — revise os parâmetros');

  const horas = perfis.reduce((a, x) => a + x.horas, 0);
  const custoDireto = perfis.reduce((a, x) => a + x.horas * x.custo_hora, 0);
  if (!(custoDireto > 0)) throw new Error('Custo zerado: informe o custo/hora dos perfis (rate card ou RH)');
  // v3.365: inflação + dissídio sobre o custo, no ponto médio do prazo (o custo de quem trabalha no mês 10 já foi reajustado)
  const inflFator = Math.pow(1 + (n(p.inflacao_anual_pct) + n(p.dissidio_extra_pct)) / 100, (meses / 2) / 12);
  const custoTotal = custoDireto * inflFator * (1 + p.overhead_pct / 100);
  const precoCostPlus = custoTotal / (1 - imp - mAlvo);          // preço que entrega exatamente a margem alvo
  const tmValor = perfis.reduce((a, x) => a + x.horas * (x.preco_hora || x.custo_hora * (1 + p.overhead_pct / 100) / (1 - imp - mAlvo)), 0);
  const cont = (p.contingencia[risco] || 0) / 100;

  const valores = tipoDoc === 'poc' ? { poc: precoCostPlus } : {
    tm: tmValor * inflFator,
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

  const conc = n(entrada.preco_concorrente) || null, descontos = entrada.descontos || {};
  const out = Object.keys(valores).map(f => {
    // piso = preço que ainda entrega a margem mínima (com a mesma reserva de risco do formato); desconto nunca passa dele
    const reserva = f === 'fechado' ? 1 + cont : f === 'hibrido' ? 1 + cont / 2 : 1;
    const piso = custoTotal * reserva / (1 - imp - mMin), valorCheio = valores[f];
    const dAplic = Math.max(0, Math.min(n(descontos[f]) / 100, valorCheio > piso ? (valorCheio - piso) / valorCheio : 0));
    // v3.376: cliente da Atlantyx → POC com % reduzido (0 = cortesia, custo vira investimento comercial)
    const pocCortesia = f === 'poc' && !!entrada.ja_cliente;
    const valor = pocCortesia ? r2(valorCheio * n(p.poc_cliente_pct) / 100) : r2(valorCheio * (1 - dAplic));
    // competitividade × concorrente
    let comp = null;
    if (conc) { const lim = conc * (1 + p.tolerancia_concorrente_pct / 100), alvoComp = conc * (1 + p.premio_qualidade_pct / 100), novo = Math.max(piso, Math.min(valorCheio, alvoComp));
      const sug = valorCheio > lim ? (valorCheio - novo) / valorCheio * 100 : 0;
      comp = { concorrente: r2(conc), diferenca_pct: r2((valor / conc - 1) * 100), acima_da_tolerancia: valor > lim, desconto_sugerido_pct: r2(sug), preco_sugerido: r2(valorCheio * (1 - sug / 100)),
        ainda_acima_pct: r2((Math.max(piso, alvoComp) / conc - 1) * 100), piso: r2(piso), spread: r2(valorCheio - piso), limitado_pelo_piso: alvoComp < piso }; }
    const crono = cronograma(f, valor, meses, inicio, p);
    const liquido = crono.reduce((a, c) => a + c.valor * (1 - impAno(c.mes)), 0); // v3.365: imposto do ano de cada nota
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
    if (pocCortesia) alertas.push(valor > 0 ? `POC para cliente com ${n(p.poc_cliente_pct)}% do preço — margem reduzida é investimento comercial` : `POC sem custo para cliente — custo de R$ ${Math.round(custoTotal).toLocaleString('pt-BR')} é investimento comercial da Atlantyx`);
    else if (margem < mMin) { alertas.push(`Margem ${(margem * 100).toFixed(1)}% abaixo do mínimo (${p.margem_min_pct}%)`); total *= .5; }
    if (orc && sOrc < .5) alertas.push(`Acima do orçamento do cliente (${orcTipo})`);
    if (f === 'fechado' && risco === 'alto') alertas.push('Escopo de risco alto em preço fixo — exigir premissas e controle de mudanças');
    if (f === 'mensal' && meses < 6) alertas.push('Prazo curto para mensalidade — pouco aderente a recorrência');
    if (tetoMed && precoHoraEf > tetoMed) alertas.push(`Preço/hora efetivo R$ ${precoHoraEf.toFixed(0)} acima do teto do rate card (R$ ${tetoMed.toFixed(0)})`);
    if (comp && comp.acima_da_tolerancia && !dAplic) alertas.push(`${comp.diferenca_pct.toFixed(0)}% acima do concorrente — desconto sugerido ${comp.desconto_sugerido_pct.toFixed(1)}%${comp.limitado_pelo_piso ? ' (limitado pela margem mínima)' : ''}`);
    if (comp && comp.limitado_pelo_piso) alertas.push(`Mesmo no piso fica ${comp.ainda_acima_pct.toFixed(0)}% acima do concorrente — reduza escopo, faseie ou ofereça POC`);
    return { formato: f, nome: FORMATOS[f].nome, resumo: FORMATOS[f].resumo, valor_total: valor, valor_sem_desconto: r2(valorCheio), poc_cortesia: pocCortesia, custo_investimento_comercial: pocCortesia ? r2(Math.max(0, custoTotal - liquido)) : 0,
      condicao_cliente: entrada.ja_cliente && f !== 'poc' && n(p.desconto_cliente_pct) > 0 ? { desconto_pct: n(p.desconto_cliente_pct), dias: n(p.desconto_cliente_dias, 60), valor_com_desconto: r2(Math.max(piso, valor * (1 - n(p.desconto_cliente_pct) / 100))), limitado_pelo_piso: valor * (1 - n(p.desconto_cliente_pct) / 100) < piso } : null, desconto_aplicado_pct: r2(dAplic * 100), preco_piso: r2(piso), competitividade: comp, valor_mensal_medio: r2(mensalMedio), recorrente_mensal: r2(recorrenteMensal), arr: r2(arr),
      lucro: r2(lucro), margem_pct: r2(margem * 100), preco_hora_efetivo: r2(precoHoraEf), receita_no_ano: r2(noAno), caixa_no_ano: r2(caixaNoAno), cobertura_gap_pct: gap ? r2(noAno / gap * 100) : null,
      pior_caixa: r2(pior), primeiro_recebimento: primeiroRec, cronograma: crono,
      scores: { metas: Math.round(metas), vendavel: Math.round(vend), caixa: Math.round(caixa), risco: Math.round(riscoS), total: Math.round(total) }, alertas };
  }).sort((a, b) => b.scores.total - a.scores.total);

  return {
    entrada: { meses, inicio, risco, tipo_demanda: tipo, tipo_documento: tipoDoc, orcamento_cliente: orc, orcamento_tipo: orcTipo, horas: r2(horas), preco_concorrente: conc, ja_cliente: !!entrada.ja_cliente },
    custos: { custo_direto: r2(custoDireto), custo_total: r2(custoTotal), inflacao_aplicada_pct: r2((inflFator - 1) * 100), impostos_efetivo_pct: r2(imp * 100),
      impostos_por_mes: [...new Set(mesesLista.map(m => m.substring(0, 4)))].map(a => ({ ano: a, pct: r2(impAno(a + '-01') * 100) })), preco_minimo: r2(custoTotal / (1 - imp - mMin)), preco_alvo: r2(precoCostPlus) },
    metas: { meta_anual: metaAnual, realizado_ano: realizado, pipeline_ponderado: pipePond, gap: r2(gap), recorrente_atual_mensal: recAtualMensal, recorrente_pct_atual: r2(recPctAtual), meta_recorrente_pct: p.meta_recorrente_pct, necessidade_recorrencia: r2(necessidadeRec) },
    params: p, formatos: out, recomendado: out[0].formato,
  };
}
