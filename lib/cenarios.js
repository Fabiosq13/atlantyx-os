// lib/cenarios.js — v3.605 Cenários 2027: Gelta, IARA, Maestro, grandes projetos, sustentação e funil isca → IA.
// Espelha a planilha "Cenário Gelta" aprovada pelo Fabio. TODOS os números são HIPÓTESES de trabalho (não são dados de cliente);
// o CEO troca as premissas na tela e o modelo recalcula. Nada aqui lê banco, envia ou gasta IA — só calcula.
export const K_CENARIOS = 'estrategia:cenarios';

const MOD = [   // id, nome, base do grupo, por loja, adoção, dias de equipe/mês, infra e IA por loja
  ['vendas', 'Vendas', 1000, 50, 0.9, 1, 15], ['compras', 'Compras', 600, 30, 0.5, 0.5, 10], ['posvenda', 'Pós-venda', 1000, 50, 0.7, 1, 15],
  ['oficina', 'Oficina', 800, 40, 0.6, 0.8, 12], ['financeiro', 'Financeiro', 700, 30, 0.5, 0.7, 10],
  ['ia_consulta', 'IA de consulta (linguagem natural)', 900, 30, 0.6, 0.5, 30], ['ia_operacao', 'IA de operação 24h', 2500, 70, 0.3, 1.5, 50]];
const LETRAS = ['a', 'b', 'c'];

export const CAMPOS = [];
const add = (id, rot, grupo, fmt, padrao) => CAMPOS.push({ id, rot, grupo, fmt, padrao });   // fmt: n (número), brl (R$), pct (fração)
// v3.618: base recorrente REAL de hoje (ARR): sustentação Xplann + sustentação Big Data + alocações — preenchida pelo CEO (R$ por mês)
[['atual.xplann', 'Sustentação Xplann (R$/mês)'], ['atual.bigdata', 'Sustentação Big Data (R$/mês)'], ['atual.alocacoes', 'Alocações recorrentes (R$/mês)']].forEach(([id, r]) => add(id, r, 'ARR atual (real)', 'brl', 0));
add('comum.custo_dia', 'Custo por pessoa-dia', 'Comum', 'brl', 276.56); add('comum.imposto', 'Imposto sobre a receita', 'Comum', 'pct', 0.25); add('comum.sust_pct', 'Sustentação anual (% do custo do produto)', 'Comum', 'pct', 0.22); add('comum.imposto_sust', 'Imposto sobre a sustentação', 'Comum', 'pct', 0.29);   // v3.619: regra do fundador — sustentação 22% + 29% de imposto
[5, 10, 20].forEach((v, i) => add('comum.n_' + LETRAS[i], 'Clientes/grupos — cenário ' + LETRAS[i].toUpperCase(), 'Comum', 'n', v));
[['gelta.lojas', 'Lojas por grupo (média do alvo)', 'n', 12], ['gelta.meses', 'Meses faturados no 1º ano', 'n', 7], ['gelta.dealernet', 'Gasto mensal do grupo com Dealer Net (hipótese)', 'brl', 20000],
  ['gelta.impl_base', 'Implantação — valor base por grupo', 'brl', 12000], ['gelta.impl_loja', 'Implantação — valor por loja', 'brl', 1200], ['gelta.impl_dias', 'Implantação — dias de equipe por grupo', 'n', 15],
  ['gelta.impl_dias_loja', 'Implantação — dias de equipe por loja', 'n', 1.5], ['gelta.produt_dias', 'Produtização — dias de equipe', 'n', 350], ['gelta.pago', 'Valor TOTAL do projeto Jelta (projeto parcelado mensal — não é recorrente; preencher com o contrato)', 'brl', 0], ['gelta.parcelas', 'Parcelas mensais do projeto Jelta', 'n', 0], ['gelta.lojas_gelta', 'Lojas do grupo Jelta', 'n', 52]]
  .forEach(([id, r, f, p]) => add(id, r, 'Gelta', f, p));
for (const [id, nome, base, loja, ad, dias, infra] of MOD) {
  const g = 'Gelta · ' + nome;
  add(`gelta.m.${id}.base`, 'Base do grupo (R$/mês)', g, 'brl', base); add(`gelta.m.${id}.loja`, 'Por loja (R$/mês)', g, 'brl', loja); add(`gelta.m.${id}.adocao`, 'Adoção esperada', g, 'pct', ad);
  add(`gelta.m.${id}.dias`, 'Dias de equipe por mês', g, 'n', dias); add(`gelta.m.${id}.infra`, 'Infra e IA por loja (R$/mês)', g, 'brl', infra);
}
[['iara.contatos', 'Contatos prospectados por mês', 'n', 1500], ['iara.taxa', 'Taxa de qualificação (lead ÷ contato)', 'pct', 0.06], ['iara.preco_lead', 'Preço por lead qualificado', 'brl', 40], ['iara.mensal', 'Mensalidade fixa', 'brl', 4000],
  ['iara.custo_contato', 'Custo de infra e IA por contato', 'brl', 0.6], ['iara.dias_mes', 'Dias de equipe por mês por cliente', 'n', 2], ['iara.setup', 'Setup cobrado', 'brl', 9000], ['iara.dias_setup', 'Dias de equipe no setup', 'n', 12],
  ['iara.meses', 'Meses faturados no 1º ano', 'n', 8], ['iara.invest_dias', 'Investimento adicional de produto (dias)', 'n', 120]].forEach(([id, r, f, p]) => add(id, r, 'IARA', f, p));
[['maestro.projetos', 'Projetos na carteira do cliente', 'n', 25], ['maestro.mensal', 'Mensalidade base', 'brl', 6000], ['maestro.por_projeto', 'Valor por projeto gerenciado (mês)', 'brl', 350], ['maestro.infra_projeto', 'Infra e IA por projeto (mês)', 'brl', 60],
  ['maestro.dias_mes', 'Dias de equipe por mês por cliente', 'n', 3], ['maestro.setup', 'Setup cobrado', 'brl', 20000], ['maestro.dias_setup', 'Dias de equipe no setup', 'n', 30], ['maestro.meses', 'Meses faturados no 1º ano (ciclo longo)', 'n', 4],
  ['maestro.invest_dias', 'Investimento adicional de produto (dias)', 'n', 200]].forEach(([id, r, f, p]) => add(id, r, 'Maestro', f, p));
add('gp.preco_dia', 'Preço médio por pessoa-dia vendida', 'Grandes projetos', 'brl', 1100); add('gp.q4', 'Parte concluída no 4º trimestre (caixa no ano seguinte)', 'Grandes projetos', 'pct', 0.25);
['Conservador', 'Base', 'Agressivo'].forEach((n, i) => { add('gp.projetos_' + LETRAS[i], 'Projetos fechados — ' + n, 'Grandes projetos', 'n', [2, 4, 6][i]); add('gp.ticket_' + LETRAS[i], 'Ticket médio — ' + n, 'Grandes projetos', 'brl', [80000, 120000, 150000][i]); });
add('sust.custo_pct', 'Custo de entrega (% da receita de sustentação)', 'Sustentação', 'pct', 0.35);
['Conservador', 'Base', 'Agressivo'].forEach((n, i) => add('sust.valor_' + LETRAS[i], 'Valor entregue sustentado — ' + n, 'Sustentação', 'brl', [300000, 600000, 1000000][i]));
[['funil.c1', 'Lead → reunião', 'pct', 0.3], ['funil.c2', 'Reunião → diagnóstico pago', 'pct', 0.25], ['funil.c3', 'Diagnóstico → serviço de IA mensal', 'pct', 0.4], ['funil.c4', 'Serviço de IA → projeto grande', 'pct', 0.15],
  ['funil.preco_diag', 'Preço do diagnóstico pago', 'brl', 15000], ['funil.mensal_ia', 'Mensalidade do serviço de IA', 'brl', 8000], ['funil.meses', 'Meses faturados do serviço no ano', 'n', 6], ['funil.ticket', 'Ticket do projeto grande originado', 'brl', 80000],
  ['funil.mkt_lead', 'Custo de marketing por lead', 'brl', 120], ['funil.dias_diag', 'Dias de equipe por diagnóstico', 'n', 10], ['funil.dias_serv', 'Dias de equipe por mês de serviço de IA', 'n', 4]].forEach(([id, r, f, p]) => add(id, r, 'Funil isca → IA → projeto', f, p));
['Hoje', 'Meta', 'Escala'].forEach((n, i) => add('funil.leads_' + LETRAS[i], 'Leads por mês — ' + n, 'Funil isca → IA → projeto', 'n', [3, 15, 40][i]));

const ID = new Map(CAMPOS.map(c => [c.id, c]));
export function valores(sobre = {}) {
  const P = {}; for (const c of CAMPOS) { const x = sobre?.[c.id]; const v = x === null || x === undefined || x === '' ? NaN : Number(x); P[c.id] = Number.isFinite(v) && v >= 0 ? v : c.padrao; }
  return P;
}
const div = (a, b) => b ? a / b : 0;

// Cenário recorrente comum a Gelta, IARA e Maestro. recMes/custoMes = receita e custo de entrega por cliente por mês.
function cenario({ n, recMes, custoMes, meses, setup, setupDias, investDias, cd, imp }) {
  const arr = n * recMes * 12, recRec = n * recMes * meses, bruta = recRec + n * setup, impostos = bruta * imp;
  const custoRec = n * custoMes * meses, custoSetup = n * setupDias * cd, contrib = bruta - impostos - custoRec - custoSetup, invest = investDias * cd;
  const rr = arr * (1 - imp) - n * custoMes * 12;
  return { clientes: n, arr, recRec, recSetup: n * setup, bruta, impostos, custoRec, custoSetup, contrib, margem1: div(contrib, bruta), invest, resultado1: contrib - invest, runrate: rr, margemRR: div(rr, arr), payback: rr > 0 ? invest / (rr / 12) : null };
}

export function calcular(sobre = {}) {
  const P = valores(sobre), cd = P['comum.custo_dia'], imp = P['comum.imposto'], N = LETRAS.map(l => P['comum.n_' + l]);
  // — Gelta —
  const L = P['gelta.lojas'];
  const modulos = MOD.map(([id, nome]) => {
    const g = k => P[`gelta.m.${id}.${k}`], rec = g('base') + g('loja') * L, liq = rec * (1 - imp), custo = g('dias') * cd + g('infra') * L;
    return { id, nome, adocao: g('adocao'), rec, liq, custo, margem: div(liq - custo, liq) };
  });
  const soma = f => modulos.reduce((a, m) => a + f(m), 0);
  const suite = { rec: soma(m => m.rec), liq: soma(m => m.liq), custo: soma(m => m.custo), recPond: soma(m => m.rec * m.adocao), liqPond: soma(m => m.liq * m.adocao), custoPond: soma(m => m.custo * m.adocao) };
  suite.margem = div(suite.liq - suite.custo, suite.liq); suite.margemPond = div(suite.liqPond - suite.custoPond, suite.liqPond);
  const M = Object.fromEntries(modulos.map(m => [m.id, m])), dn = P['gelta.dealernet'];
  const caminho = (nome, ids, uso) => { const rec = ids.reduce((a, i) => a + M[i].rec, 0), liq = ids.reduce((a, i) => a + M[i].liq, 0), custo = ids.reduce((a, i) => a + M[i].custo, 0); return { nome, rec, pctDealerNet: div(rec, dn), margem: div(liq - custo, liq), uso }; };
  const caminhos = [
    caminho('Entrada só Pós-venda', ['posvenda'], 'Porta de entrada com retorno mais fácil de provar (peças, retorno de oficina, agenda)'),
    caminho('Entrada só Vendas', ['vendas'], 'Dor de funil e estoque de veículos; decisor é a diretoria comercial'),
    caminho('Vendas + Pós-venda', ['vendas', 'posvenda'], 'Pacote de entrada sugerido: dois setores diluem o custo de implantação'),
    caminho('Suíte operacional (5 setores, sem IA)', ['vendas', 'compras', 'posvenda', 'oficina', 'financeiro'], 'Expansão em 6 a 12 meses; vira a âncora recorrente'),
    caminho('Suíte completa com as 2 IAs', MOD.map(m => m[0]), 'Vender as IAs como adicional: custo de IA e sustentação pressionam a margem')];
  const mensalCheia = MOD.reduce((a, [id]) => a + P[`gelta.m.${id}.base`] + P[`gelta.m.${id}.loja`] * P['gelta.lojas_gelta'], 0);
  const gelta = { modulos, suite, caminhos,
    cenarios: N.map(n => cenario({ n, recMes: suite.recPond, custoMes: suite.custoPond, meses: P['gelta.meses'], setup: P['gelta.impl_base'] + P['gelta.impl_loja'] * L, setupDias: P['gelta.impl_dias'] + P['gelta.impl_dias_loja'] * L, investDias: P['gelta.produt_dias'], cd, imp })),
    sanidade: { pago: P['gelta.pago'], parcelas: P['gelta.parcelas'], parcela: div(P['gelta.pago'], P['gelta.parcelas']), lojas: P['gelta.lojas_gelta'], porLoja: div(P['gelta.pago'], P['gelta.lojas_gelta']), mensal: mensalCheia, anual: mensalCheia * 12, mesesParaIgualar: div(P['gelta.pago'], mensalCheia) } };
  // — IARA —
  const leadsMes = P['iara.contatos'] * P['iara.taxa'], variavel = leadsMes * P['iara.preco_lead'], recI = P['iara.mensal'] + variavel, liqI = recI * (1 - imp);
  const infraI = P['iara.contatos'] * P['iara.custo_contato'], eqI = P['iara.dias_mes'] * cd, recMetade = P['iara.mensal'] + variavel / 2;
  const iara = { cliente: { fixa: P['iara.mensal'], variavel, rec: recI, liq: liqI, infra: infraI, equipe: eqI, margemRS: liqI - infraI - eqI, margem: div(liqI - infraI - eqI, liqI), leadsMes, custoPorLead: div(infraI + eqI, leadsMes), margemMetade: div(recMetade * (1 - imp) - infraI - eqI, recMetade * (1 - imp)) },
    cenarios: N.map(n => cenario({ n, recMes: recI, custoMes: infraI + eqI, meses: P['iara.meses'], setup: P['iara.setup'], setupDias: P['iara.dias_setup'], investDias: P['iara.invest_dias'], cd, imp })) };
  // — Maestro —
  const recM = P['maestro.mensal'] + P['maestro.por_projeto'] * P['maestro.projetos'], liqM = recM * (1 - imp), infraM = P['maestro.infra_projeto'] * P['maestro.projetos'], eqM = P['maestro.dias_mes'] * cd;
  const maestro = { cliente: { rec: recM, liq: liqM, infra: infraM, equipe: eqM, margemRS: liqM - infraM - eqM, margem: div(liqM - infraM - eqM, liqM), margemIADobra: div(liqM - 2 * infraM - eqM, liqM) },
    cenarios: N.map(n => cenario({ n, recMes: recM, custoMes: infraM + eqM, meses: P['maestro.meses'], setup: P['maestro.setup'], setupDias: P['maestro.dias_setup'], investDias: P['maestro.invest_dias'], cd, imp })) };
  // — Grandes projetos, sustentação e funil —
  const gp = LETRAS.map(l => { const bruta = P['gp.projetos_' + l] * P['gp.ticket_' + l], impostos = bruta * imp, dias = div(bruta, P['gp.preco_dia']), custo = dias * cd, contrib = bruta - impostos - custo; return { projetos: P['gp.projetos_' + l], ticket: P['gp.ticket_' + l], bruta, impostos, dias, custo, contrib, margem: div(contrib, bruta), caixaProximoAno: bruta * P['gp.q4'] }; });
  const sust = LETRAS.map(l => { const valor = P['sust.valor_' + l], rec = valor * P['comum.sust_pct'], impostos = rec * P['comum.imposto_sust'], custo = rec * P['sust.custo_pct'], contrib = rec - impostos - custo; return { valor, rec, impostos, custo, contrib, margem: div(contrib, rec) }; });
  const funil = LETRAS.map(l => {
    const leads = P['funil.leads_' + l], reun = leads * 12 * P['funil.c1'], diag = reun * P['funil.c2'], serv = diag * P['funil.c3'], proj = serv * P['funil.c4'];
    const recD = diag * P['funil.preco_diag'], recS = serv * P['funil.mensal_ia'] * P['funil.meses'], recP = proj * P['funil.ticket'], bruta = recD + recS + recP, impostos = bruta * imp;
    const mkt = leads * 12 * P['funil.mkt_lead'], equipe = (diag * P['funil.dias_diag'] + serv * P['funil.dias_serv'] * P['funil.meses'] + div(proj * P['funil.ticket'], P['gp.preco_dia'])) * cd, contrib = bruta - impostos - mkt - equipe;
    return { leads, reunioes: reun, diagnosticos: diag, servicos: serv, projetos: proj, recD, recS, recP, bruta, impostos, mkt, equipe, contrib, margem: div(contrib, bruta), arrIA: serv * P['funil.mensal_ia'] * 12, mktPorCliente: div(mkt, serv) };
  });
  // — Comparativo (cenário do meio = B) —
  const prods = [['Gelta', gelta.cenarios], ['IARA', iara.cenarios]];   // v3.622: Maestro fica fora do plano 2027 — não disputa o comparativo
  const lider = f => prods.reduce((m, p) => (m === null || f(p[1][1]) > f(m[1][1]) ? p : m), null)[0];
  const rapido = prods.filter(p => p[1][1].payback != null).reduce((m, p) => (m === null || p[1][1].payback < m[1][1].payback ? p : m), null);
  const comparativo = { maiorArr: lider(c => c.arr), maiorResultado1: lider(c => c.resultado1), maiorMargemRR: lider(c => c.margemRR), retornoMaisRapido: rapido ? rapido[0] : null };
  const atualMensal = P['atual.xplann'] + P['atual.bigdata'] + P['atual.alocacoes'], atual = { xplann: P['atual.xplann'], bigdata: P['atual.bigdata'], alocacoes: P['atual.alocacoes'], mensal: atualMensal, arr: atualMensal * 12 };
  return { entradas: P, clientes: N, atual, gelta, iara, maestro, frentes: { gp, sust, funil }, comparativo, leitura: LEITURA };
}

export const LEITURA = {
  gelta: ['Melhor jeito de vender: entrar por um setor (Pós-venda ou Vendas), provar retorno em 60 a 90 dias e expandir módulo a módulo; implantação cobrada à parte por loja.',
    'Melhor custo-benefício para o grupo: mensalidade base + por loja mantém o preço proporcional ao porte e como fração do gasto com Dealer Net. Falta confirmar o gasto real e o período do valor de R$ 2 mil a R$ 180 mil.',
    'Melhor margem para a Atlantyx: módulos de painel têm margem alta e pouca infra. As IAs entram como adicional, porque token e sustentação derrubam a margem se forem incluídas no preço base.',
    'Maior risco: depender da extração de dados do Dealer Net (API ou contrato). Validar com o Jelta e a Dealer Net antes de vender o segundo grupo. Atenção: o contrato atual do Jelta é PROJETO parcelado mensal (receita de projeto, não recorrente); a recorrência só existe no cenário de subscrição para novos grupos.',
    'Variável que mais pesa e ainda não temos: quantos grupos alcançáveis existem. A Fenabrave cita 8.401 concessionárias filiadas (dado da conversa, a confirmar); em grupos de ~12 lojas o universo de grupos é bem menor.'],
  iara: ['A IARA não vende hoje: o problema parece ser prova de resultado, não preço. Cobrar parte por lead qualificado divide o risco com o cliente e baixa a barreira de compra.',
    'O que precisa ser verdade: a taxa de qualificação é pelo menos a da premissa e o resultado é reunião marcada, não só resposta. Medir na própria Atlantyx antes de vender; 9 leads em 90 dias é base pequena.',
    'Risco: reputação do domínio e custo de disparo. Envio externo só com regra aprovada, como no Time de Vendas Virtual.'],
  maestro: ['Fora do plano 2027: o plano revisado não define o Maestro como produto de 2027; este cenário é exploratório. Margem alta no papel, mas o risco é comercial e de custo: ciclo de venda longo em grandes empresas (pagamento 30 dias após a conclusão) e consumo de IA por projeto.',
    'A linha "consumo de IA dobra" mostra a folga: se a margem cair demais, cobrar o consumo à parte ou limitar por franquia.',
    'Uso natural: provar dentro de um cliente existente de projetos antes de vender o Maestro avulso.'],
  frentes: ['O produto isca (Mapa de Oportunidades) só vale se o funil encadeado fechar: o gargalo de hoje é volume de leads (cerca de 3 por mês), não a conversão assumida.',
    'O serviço de IA mensal é a ponte: gera recorrência e abre projeto grande no mesmo cliente, com custo de aquisição menor que o de um cliente novo.',
    'As taxas de conversão são hipóteses. Trocar pelas reais quando o Time de Vendas Virtual e o Playbook acumularem dados.'],
  aviso: 'Margem alta no papel não é probabilidade de fechar. A tabela compara economia por cliente; o esforço e o risco de venda de cada produto pesam no debate.'
};

// ——— serviço ———
export async function estado(kv) {
  const salvo = kv ? await kv.get(K_CENARIOS).catch(() => null) : null, v = valores(salvo?.valores || {});
  return { campos: CAMPOS.map(c => ({ id: c.id, rot: c.rot, grupo: c.grupo, fmt: c.fmt, padrao: c.padrao })), valores: v, alterados: Object.keys(salvo?.valores || {}).filter(k => ID.has(k)), resultado: calcular(v), por: salvo?.por || null, em: salvo?.em || null };
}
export async function salvar(kv, entrada, login) {
  const novo = {}; for (const [k, x] of Object.entries(entrada || {})) { if (!ID.has(k)) continue; const v = Number(x); if (!Number.isFinite(v) || v < 0 || (ID.get(k).fmt === 'pct' && v > 1)) throw Object.assign(new Error(`Valor inválido em "${ID.get(k).rot}"`), { status: 400 }); if (v !== ID.get(k).padrao) novo[k] = v; }
  await kv.set(K_CENARIOS, { valores: novo, por: login, em: new Date().toISOString() });
  return estado(kv);
}
