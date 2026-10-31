// lib/plano-estrategico.js — v3.240 · PLANO ESTRATÉGICO CADASTRADO (versão vigente + rascunho + histórico)
// Antes o "Plano Estratégico" era um texto gerado pela IA a cada clique e nenhuma ferramenta partia dele. Agora o plano
// é um cadastro: metas, visão, prioridades e as ALAVANCAS DE NEGÓCIO (receita, margem, ticket, funil, peso na campanha).
// O fundador ajusta o RASCUNHO, aprova, e ele vira o VIGENTE (as versões anteriores ficam guardadas).
// Quem lê o plano vigente (só ACRESCENTA contexto — sem plano, ou com erro na leitura, cada ferramenta segue como antes):
//   ATLAS / comitê (api/estrategia.js) · Plano Estratégico, Plano de Ação 90d e OKRs (api/s1-intel.js)
//   Business Plan Atlantyx (api/business-plan.js) · autocampanha e campanha patrocinada (api/metricool.js)
// Guardado em kv_store (sem DDL): 'est:plano_estr:vigente', 'est:plano_estr:rascunho', 'est:plano_estr:versoes',
// 'est:plano_estr:ajustes' (sugestões da ATLAS aguardando aprovação).

export const K_VIGENTE = 'est:plano_estr:vigente', K_RASCUNHO = 'est:plano_estr:rascunho', K_VERSOES = 'est:plano_estr:versoes', K_AJUSTES = 'est:plano_estr:ajustes';

export const GRUPOS = { servico: 'Serviço', solucao: 'Solução de negócio', produto: 'Produto', marca: 'Marca e autoridade' };
export const STATUS = { ancora: 'Âncora', ativa: 'Ativa', organico: 'Só orgânico', teste: 'Em teste', pausada: 'Pausada' };

// 1ª versão = ensaio "Alavancas estratégicas da Atlantyx" (cenário B). Números de referência para o fundador calibrar.
export function planoInicial() {
  const A = (id, nome, grupo, status, o) => ({ id, nome, grupo, status, receita_meta: 0, receita_nova: 0, ticket_anual: 0, margem_pct: 0, recorrente: false,
    taxa_lead_reuniao: 20, taxa_reuniao_proposta: 45, taxa_fechamento: 25, peso_campanha: 0, receita_realizada: null, oferta: '', publico: '', dor: '', prova: '', ...o });
  return {
    nome: 'Plano 2027', horizonte: '2027', origem: 'Ensaio "Alavancas estratégicas da Atlantyx" (22/10/2026) — números de referência a calibrar',
    metas: { faturamento: 6500000, margem_pct: 35, recorrente_pct: 30, crescimento_pct: 25 },
    visao: { d90: 'Trilhas de campanha no ar, diagnóstico pago lançado e o agente comercial de IA com os primeiros clientes pagantes.',
      a1: 'R$ 6,5 mi de faturamento com margem líquida acima de 30% e dois produtos-âncora vendendo todo mês.',
      a5: 'Em 2031, receita recorrente perto de metade do faturamento, puxada pelos produtos de IA, com alocação como motor de caixa e não de crescimento.' },
    prioridades: ['Vender resultado (diagnóstico pago e taxa de sucesso) em vez de horas', 'Escolher e escalar 2 produtos-âncora: agente comercial de IA e Maestro',
      'Crescer dados corporativos na base atual (sustentação com SLA e projetos)', 'Revisar preços: projetos a 35% e alocação a 15% de margem'],
    midia: { cpl_medio: 200, pct_leads_pagos: 50, apollo_ano: 12000 },
    alavancas: [
      A('resultado-diagnostico', 'Diagnóstico ou POC de IA pago', 'solucao', 'ativa', { receita_meta: 350000, receita_nova: 350000, ticket_anual: 35000, margem_pct: 35, taxa_reuniao_proposta: 50, taxa_fechamento: 50, peso_campanha: 15,
        oferta: 'Diagnóstico de ganho em 30 dias', publico: 'CEO, CFO e COO de médias e grandes', dor: 'Dinheiro parado em crédito, vendas e nuvem', prova: 'Projetos de dados e IA em energia e financeiro' }),
      A('resultado-sucesso', 'IA para receita com taxa de sucesso', 'solucao', 'ativa', { receita_meta: 450000, receita_nova: 450000, ticket_anual: 150000, margem_pct: 50, taxa_reuniao_proposta: 50, taxa_fechamento: 30, peso_campanha: 15,
        oferta: 'Ganho medido sobre uma linha de base — paga sobre o resultado', publico: 'CEO e CFO de médias e grandes', dor: 'Receita e crédito que escapam sem ninguém medir', prova: 'Case de recuperação de crédito (anonimizado)' }),
      A('agente-comercial', 'Agente comercial de IA (SDR no WhatsApp e e-mail)', 'produto', 'ancora', { receita_meta: 780000, receita_nova: 780000, ticket_anual: 52000, margem_pct: 60, recorrente: true, taxa_reuniao_proposta: 100, taxa_fechamento: 30, peso_campanha: 25,
        oferta: 'Demonstração de 20 minutos', publico: 'Dono, CEO e diretor comercial de médias', dor: 'Lead que esfria sem resposta', prova: 'Agente rodando na própria Atlantyx' }),
      A('dados-projetos', 'Projetos de dados sob medida', 'servico', 'ativa', { receita_meta: 1800000, receita_nova: 1200000, ticket_anual: 400000, margem_pct: 30, taxa_reuniao_proposta: 40, taxa_fechamento: 25, peso_campanha: 15,
        oferta: 'Avaliação de maturidade de dados', publico: 'CIO, CDO e CFO de energia, financeiro e indústria', dor: 'Decisão com número atrasado', prova: '17 anos e projetos em energia' }),
      A('dados-sustentacao', 'Sustentação de dados e IA com SLA', 'servico', 'ativa', { receita_meta: 1400000, receita_nova: 0, ticket_anual: 600000, margem_pct: 25, taxa_reuniao_proposta: 40, taxa_fechamento: 25, peso_campanha: 10,
        oferta: 'Diagnóstico de sustentação + SLA por severidade', publico: 'CIO e CDO de grandes', dor: 'Carga que quebra de madrugada e ninguém responde', prova: 'Sustentação de Big Data em energia' }),
      A('maestro', 'Maestro — portfólio de projetos com IA', 'produto', 'ancora', { receita_meta: 170000, receita_nova: 170000, ticket_anual: 42500, margem_pct: 60, recorrente: true, taxa_reuniao_proposta: 100, taxa_fechamento: 25, peso_campanha: 10,
        oferta: 'Painel do portfólio em uma semana', publico: 'CIO e diretor de PMO de grandes', dor: 'Portfólio que só mostra o atraso tarde', prova: 'PMO de 8 projetos rodando no Maestro' }),
      A('verticais', 'Verticais e ecossistemas (Connect AI/ConnEX, Sentinel)', 'produto', 'organico', { receita_meta: 50000, receita_nova: 0, ticket_anual: 25000, margem_pct: 55, recorrente: true, taxa_fechamento: 20,
        oferta: 'Piloto com uma câmara ou unidade', publico: 'Presidentes de câmaras de comércio e diretores industriais', dor: 'Conexões de negócio que dependem de evento', prova: 'Piloto com câmara de comércio' }),
      A('alocacao', 'Alocação de especialistas em dados e IA', 'servico', 'organico', { receita_meta: 1500000, receita_nova: 0, ticket_anual: 300000, margem_pct: 12, taxa_fechamento: 30,
        oferta: 'Squad montado em 15 dias', publico: 'CIO e CTO', dor: 'Projeto parado por falta de gente', prova: 'Especialistas alocados em grandes clientes' }),
      A('marca', 'Marca e autoridade', 'marca', 'ativa', { peso_campanha: 10, oferta: 'Webinar e conteúdo', publico: 'Todos os decisores do ICP', dor: '', prova: 'Atlantyx TV, opinião do fundador' }),
    ],
    premissas_abertas: ['Faturamento real de 2026 por linha de receita', 'Margem real por linha (QuickBooks)', 'Preços do rate card', 'Sustentação de 12 meses conta como receita recorrente?', 'Orçamento mensal de mídia', 'Autorização para citar clientes'],
    comentario: '',
  };
}

// v3.294: número já numérico passa direto (antes "187.5" virava 1875); texto pt-BR "1.234,56", "R$ 400.000", "35%" e "1,2 mi" são lidos
const num = (v, d = 0) => { if (typeof v === 'number') return Number.isFinite(v) ? v : d;
  let t = String(v ?? '').trim().toLowerCase().replace(/r\$|\s|%/g, ''); const mult = /(mi|m|milh[oõ]es?)$/.test(t) ? 1e6 : /(mil|k)$/.test(t) ? 1e3 : 1; t = t.replace(/[a-zçõ]+$/, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t) * mult; return Number.isFinite(n) && t !== '' ? n : d; };
export { num as numBR };
const numPct = (v, d = 0) => { const n = typeof v === 'number' ? v : num(v, d); return Math.max(0, Math.min(100, n)); };
const txt = (v, n) => String(v ?? '').substring(0, n);
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 30);

export function planoNormalizar(p) {
  const P = p && typeof p === 'object' ? p : {}; const vistos = new Set();
  const alav = (Array.isArray(P.alavancas) ? P.alavancas : []).slice(0, 20).map(a => {
    let id = slug(a.id || a.nome) || 'alavanca'; while (vistos.has(id)) id += '-2'; vistos.add(id);
    const n = x => typeof x === 'number' ? x : num(x);
    return { id, nome: txt(a.nome, 90) || id, grupo: GRUPOS[a.grupo] ? a.grupo : 'servico', status: STATUS[a.status] ? a.status : 'ativa',
      receita_meta: Math.max(0, n(a.receita_meta)), receita_nova: Math.max(0, n(a.receita_nova)), ticket_anual: Math.max(0, n(a.ticket_anual)), margem_pct: numPct(a.margem_pct),
      recorrente: !!a.recorrente, taxa_lead_reuniao: numPct(a.taxa_lead_reuniao, 20) || 20, taxa_reuniao_proposta: numPct(a.taxa_reuniao_proposta, 45) || 45, taxa_fechamento: numPct(a.taxa_fechamento, 25) || 25,
      peso_campanha: Math.max(0, Math.min(100, n(a.peso_campanha))), receita_realizada: a.receita_realizada === null || a.receita_realizada === '' || a.receita_realizada === undefined ? null : Math.max(0, n(a.receita_realizada)),
      oferta: txt(a.oferta, 160), publico: txt(a.publico, 200), dor: txt(a.dor, 200), prova: txt(a.prova, 200) };
  });
  const M = P.metas || {}, V = P.visao || {}, D = P.midia || {};
  return { nome: txt(P.nome, 80) || 'Plano estratégico', horizonte: txt(P.horizonte, 20), origem: txt(P.origem, 300),
    metas: { faturamento: Math.max(0, num(M.faturamento)), margem_pct: numPct(M.margem_pct), recorrente_pct: numPct(M.recorrente_pct), crescimento_pct: numPct(M.crescimento_pct) },
    visao: { d90: txt(V.d90, 600), a1: txt(V.a1, 600), a5: txt(V.a5 || V.a3, 600) }, // v3.341: horizonte de 5 anos (2031) — o texto antigo de 3 anos migra para cá
    prioridades: (Array.isArray(P.prioridades) ? P.prioridades : []).map(x => txt(x, 240)).filter(Boolean).slice(0, 10),
    midia: { cpl_medio: Math.max(0, num(D.cpl_medio, 200)), pct_leads_pagos: numPct(D.pct_leads_pagos ?? 50), apollo_ano: Math.max(0, num(D.apollo_ano)) },
    alavancas: alav, premissas_abertas: (Array.isArray(P.premissas_abertas) ? P.premissas_abertas : []).map(x => txt(x, 200)).filter(Boolean).slice(0, 12), comentario: txt(P.comentario, 1500) };
}

// Simulação: faturamento, lucro, recorrente e o funil que cada alavanca pede (o mesmo cálculo do ensaio)
export function planoSimular(p) {
  const P = planoNormalizar(p); const r2 = x => Math.round(x * 100) / 100;
  const linhas = P.alavancas.map(a => {
    const contratos = a.ticket_anual > 0 ? Math.ceil(a.receita_nova / a.ticket_anual - 1e-9) : 0;
    const propostas = contratos ? Math.ceil(contratos / (a.taxa_fechamento / 100) - 1e-9) : 0;
    const reunioes = propostas ? Math.ceil(propostas / (a.taxa_reuniao_proposta / 100) - 1e-9) : 0;
    const leads = reunioes ? Math.ceil(reunioes / (a.taxa_lead_reuniao / 100) - 1e-9) : 0;
    return { id: a.id, nome: a.nome, receita: a.receita_meta, lucro: r2(a.receita_meta * a.margem_pct / 100), contratos, propostas, reunioes, leads, recorrente: a.recorrente ? a.receita_meta : 0 };
  });
  const soma = k => linhas.reduce((s, l) => s + (l[k] || 0), 0);
  const fat = soma('receita'), lucro = r2(soma('lucro')), rec = soma('recorrente'), leads = soma('leads');
  const leadsPagos = Math.round(leads * P.midia.pct_leads_pagos / 100), midiaAno = Math.round(leadsPagos * P.midia.cpl_medio + P.midia.apollo_ano);
  const ganhos = soma('contratos'), nova = P.alavancas.reduce((s, a) => s + a.receita_nova, 0);
  const pesoTot = P.alavancas.filter(a => a.status !== 'pausada').reduce((s, a) => s + a.peso_campanha, 0);
  return { linhas, total: { faturamento: fat, lucro, margem_pct: fat ? r2(lucro / fat * 100) : 0, recorrente: rec, recorrente_pct: fat ? r2(rec / fat * 100) : 0, receita_nova: nova,
      contratos: ganhos, reunioes: soma('reunioes'), leads, leads_mes: Math.round(leads / 12), reunioes_mes: Math.round(soma('reunioes') / 12), midia_ano: midiaAno, midia_mes: Math.round(midiaAno / 12),
      midia_por_cliente: ganhos ? Math.round(midiaAno / ganhos) : null, midia_pct_receita_nova: nova ? r2(midiaAno / nova * 100) : null },
    metas: P.metas, gap: { faturamento: P.metas.faturamento ? fat - P.metas.faturamento : null, margem_pp: P.metas.margem_pct ? r2((fat ? lucro / fat * 100 : 0) - P.metas.margem_pct) : null,
      recorrente_pp: P.metas.recorrente_pct ? r2((fat ? rec / fat * 100 : 0) - P.metas.recorrente_pct) : null },
    pesos: P.alavancas.filter(a => a.status !== 'pausada' && a.peso_campanha > 0).map(a => ({ id: a.id, nome: a.nome, pct: pesoTot ? r2(a.peso_campanha / pesoTot * 100) : 0 })) };
}

// trilhas da campanha (alavancas com peso, não pausadas)
export function trilhasCampanha(p) { const P = planoNormalizar(p); return P.alavancas.filter(a => a.status !== 'pausada' && a.peso_campanha > 0); }
// escolha estável por chave (data+hora): ao longo de muitos posts a distribuição segue os pesos
export function escolherTrilha(p, chave) {
  const T = trilhasCampanha(p); if (!T.length) return null;
  let h = 2166136261; for (const c of String(chave || '')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const tot = T.reduce((s, a) => s + a.peso_campanha, 0); let x = (h % 10000) / 10000 * tot;
  for (const a of T) { if ((x -= a.peso_campanha) < 0) return a; } return T[T.length - 1];
}
export const briefingTrilha = a => a ? `TRILHA DO PLANO ESTRATÉGICO: "${a.nome}". Fale com: ${a.publico || 'decisores do ICP'}. Dor que o post ataca: ${a.dor || '—'}. Oferta (o que o leitor ganha): ${a.oferta || 'conversa com especialista'}. Prova que pode citar (sem inventar números nem nomes de clientes): ${a.prova || '—'}.` : '';

// resumo curto para os prompts das IAs
export function planoResumoTexto(p, extra = {}) {
  if (!p) return '';
  const P = planoNormalizar(p), S = planoSimular(P), R = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  return [`PLANO ESTRATÉGICO VIGENTE (${P.nome}${extra.versao ? ', versão ' + extra.versao : ''}${extra.aprovado_em ? ', aprovado em ' + String(extra.aprovado_em).substring(0, 10) : ''}) — parta dele:`,
    `Metas: faturamento ${R(P.metas.faturamento)} · margem líquida ${P.metas.margem_pct}% · receita recorrente ${P.metas.recorrente_pct}% · crescimento ${P.metas.crescimento_pct}% a.a.`,
    P.visao.a1 ? `Visão 1 ano: ${P.visao.a1}` : '', P.visao.a5 ? `Visão 5 anos (2031): ${P.visao.a5}` : '', P.prioridades.length ? 'Prioridades: ' + P.prioridades.join('; ') : '',
    'Alavancas (status · receita meta · margem · peso na campanha · oferta):',
    ...P.alavancas.map(a => `- ${a.nome} [${STATUS[a.status]}] · ${R(a.receita_meta)} · ${a.margem_pct}% · peso ${a.peso_campanha}% · ${a.oferta}`),
    `Simulação do plano: faturamento ${R(S.total.faturamento)}, margem ${S.total.margem_pct}%, recorrente ${S.total.recorrente_pct}%, ${S.total.reunioes_mes} reuniões e ${S.total.leads_mes} leads por mês, mídia ${R(S.total.midia_mes)}/mês.`]
    .filter(Boolean).join('\n');
}

// leitura segura do vigente por qualquer módulo: kvGet(chave) → valor | null. Nunca lança.
export async function lerPlanoVigente(kvGet) {
  try { const v = await kvGet(K_VIGENTE); return v && v.plano ? v : null; } catch (_) { return null; }
}
