// lib/mapa-minimo.js — v3.602 · MAPA DE OPORTUNIDADES MÍNIMO: plano de exceção quando a pesquisa da empresa não devolve oportunidades.
// Monta 3 hipóteses a partir do SETOR e do PORTE da empresa. Não afirma nada sobre a empresa em si, não traz número nem caso: tudo soa como hipótese.
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const BIB = {
  energia: { nome: 'energia e utilities', ops: [
    { solucao: 'Painel único de operação e ativos', dor: 'Dados de campo, manutenção e financeiro costumam ficar em sistemas separados, e a diretoria decide com atraso.', como_ajuda: 'Integra as fontes e entrega indicadores diários de desempenho e custo por ativo.' },
    { solucao: 'Previsão de falhas e priorização de manutenção com IA', dor: 'Manutenção reativa custa mais e interrompe o serviço.', como_ajuda: 'Usa o histórico de ocorrências para apontar onde agir primeiro.' },
    { solucao: 'Atendimento e cobrança com agentes de IA', dor: 'Grande volume de contatos de clientes consome o time e gera retrabalho.', como_ajuda: 'Agentes tratam os pedidos repetitivos e passam ao time só o que precisa de pessoa.' }] },
  financeiro: { nome: 'bancos e seguradoras', ops: [
    { solucao: 'Base de dados confiável para indicadores de negócio', dor: 'Cada área calcula o seu número e a reunião gasta tempo discutindo qual está certo.', como_ajuda: 'Modelo de dados único e painéis de gestão com uma só versão dos números.' },
    { solucao: 'IA para análise de documentos e contratos', dor: 'A leitura manual de documentos é lenta e sujeita a erro.', como_ajuda: 'Extrai e confere as informações-chave e sinaliza o que exige revisão humana.' },
    { solucao: 'Agentes de IA no atendimento e na retenção de clientes', dor: 'Pedidos repetitivos ocupam o time comercial e o de atendimento.', como_ajuda: 'Automatiza as respostas de rotina e avisa o time quando o cliente tem risco de saída.' }] },
  industria: { nome: 'indústria', ops: [
    { solucao: 'Visibilidade integrada de produção, estoque e financeiro', dor: 'Dados de fábrica, compras e finanças ficam isolados e as perdas passam sem ser vistas.', como_ajuda: 'Painel que cruza as áreas e mostra onde está o desperdício.' },
    { solucao: 'Previsão de demanda e de compras com IA', dor: 'Estoque parado de um lado e falta de insumo do outro.', como_ajuda: 'Usa o histórico para recomendar volumes e prazos de compra.' },
    { solucao: 'Automação de processos administrativos', dor: 'Digitação e conferência manual entre sistemas consomem horas do time.', como_ajuda: 'Robôs e agentes de IA fazem a conferência e deixam à pessoa só as exceções.' }] },
  infra: { nome: 'infraestrutura', ops: [
    { solucao: 'Controle integrado de projetos, custos e prazos', dor: 'Obras e contratos longos perdem a margem quando custo e cronograma são vistos tarde.', como_ajuda: 'Painel de projetos com alerta antecipado de desvio de prazo e de custo.' },
    { solucao: 'Gestão de contratos e medições com IA', dor: 'Muita leitura e conferência manual de contratos e medições.', como_ajuda: 'Extrai cláusulas e marcos e confere com o que foi executado.' },
    { solucao: 'Dados de campo em tempo quase real para a diretoria', dor: 'A informação chega da obra com dias de atraso.', como_ajuda: 'Integra os registros de campo a um painel de decisão.' }] },
  varejo: { nome: 'varejo de grande porte', ops: [
    { solucao: 'Previsão de demanda e de ruptura por loja e por produto', dor: 'Falta de produto na prateleira e excesso de estoque no mesmo mês.', como_ajuda: 'Modelo de previsão que recomenda reposição e sinaliza risco de ruptura.' },
    { solucao: 'Agente de IA comercial no WhatsApp', dor: 'Muita demanda de clientes e vendedores sem tempo para responder tudo.', como_ajuda: 'Atende, qualifica e passa ao vendedor quem está pronto para comprar.' },
    { solucao: 'Painel de margem por produto, canal e loja', dor: 'Vende-se muito sem saber onde está o lucro.', como_ajuda: 'Cruza vendas, custo e desconto e mostra a margem real.' }] },
  servicos: { nome: 'serviços de grande porte', ops: [
    { solucao: 'Rentabilidade por cliente e por projeto em um painel', dor: 'O resultado por contrato só aparece no fechamento do mês.', como_ajuda: 'Integra horas, custos e faturamento para ver a margem durante a execução.' },
    { solucao: 'Automação de rotinas administrativas e financeiras', dor: 'Faturamento, conciliação e relatórios tomam tempo de gente cara.', como_ajuda: 'Agentes de IA preparam e conferem, e a pessoa só aprova.' },
    { solucao: 'IA para propostas e acompanhamento comercial', dor: 'Propostas demoram e o follow-up se perde.', como_ajuda: 'Gera o rascunho da proposta e lembra o time dos próximos passos.' }] },
  geral: { nome: null, ops: [
    { solucao: 'Painel único de gestão com os números da diretoria', dor: 'Dados espalhados em áreas e planilhas, e cada setor com a sua versão do número.', como_ajuda: 'Integra as fontes e entrega uma só visão de resultado, custo e prazo.' },
    { solucao: 'Automação de rotinas repetitivas com IA', dor: 'Tarefas manuais entre sistemas consomem horas do time e geram retrabalho.', como_ajuda: 'Agentes de IA fazem a rotina e deixam à pessoa só as exceções e as decisões.' },
    { solucao: 'IA aplicada ao atendimento e às vendas', dor: 'Muitos contatos e pouco tempo para responder com qualidade.', como_ajuda: 'Respostas de rotina automáticas, com passagem para a pessoa quando importa.' }] },
};
const CHAVES = [['energia', /energ|utilit|eletric|gas|saneamento|agua/], ['financeiro', /banc|segur|financ|credito|previd|invest/], ['industria', /industri|manufat|fabric|metal|quimic|aliment|automovel|veic/], ['infra', /infra|constru|engenharia|obra|logistic|transporte|portu|rodovi|ferrovi/], ['varejo', /varejo|loja|supermerc|atacad|consumo|e-?commerce/], ['servicos', /servico|consultoria|tecnologia|saude|educa|telecom/]];
export function setorDoLead(texto) { const t = norm(texto); for (const [k, re] of CHAVES) if (re.test(t)) return k; return 'geral'; }
const PORTE = { ate_50: 'uma empresa menor', '51_200': 'uma empresa de porte médio', '201_500': 'uma empresa de médio porte', '501_1000': 'uma empresa de grande porte', '1001_mais': 'uma empresa de grande porte' };
// lead: { name, company, setor, porte } · a: análise parcial opcional ({ setor, empresa })
export function mapaMinimo(lead = {}, a = null) {
  const chave = setorDoLead([a?.setor, lead.setor, lead.industry].filter(Boolean).join(' ')), B = BIB[chave], pn = String(lead.name || '').trim().split(/\s+/)[0] || '', emp = (a?.empresa || lead.company || 'sua empresa').trim();
  const porte = PORTE[String(lead.porte || '').replace(/[^0-9a-z_]/gi, '')] || null;
  const contexto = B.nome ? `Como ${emp} atua em ${B.nome}${porte ? ' e é ' + porte : ''}, estas são as 3 frentes onde empresas assim costumam ganhar mais com dados e IA.` : `Estas são as 3 frentes onde empresas${porte ? ' como a sua (' + porte.replace('uma empresa ', '') + ')' : ' como a sua'} costumam ganhar mais com dados e IA.`;
  const texto = `Olá${pn ? ' ' + pn : ''}, aqui é da Atlantyx. Segue o seu *Mapa de Oportunidades com IA* para ${emp}:\n\n${contexto} São hipóteses de partida: validamos com você o que faz sentido para o seu caso.\n\n`
    + B.ops.map((o, i) => `*${i + 1}. ${o.solucao}*\nPonto de atenção: ${o.dor}\nComo ajuda: ${o.como_ajuda}`).join('\n\n')
    + `\n\nSe uma delas fizer sentido, mostro em 20 minutos como começar pela de maior retorno. Quer que eu reserve um horário?`;
  return { texto, empresa: emp, setor: B.nome, resumo: 'Mapa mínimo por setor e porte (a pesquisa da empresa não trouxe oportunidades).', fontes: [], minimo: true, oportunidades: B.ops };
}
