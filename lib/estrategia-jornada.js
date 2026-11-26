// lib/estrategia-jornada.js — v3.526 · JORNADA DO PLANEJAMENTO 2027 (6 reuniões) dentro da Trilha guiada · trilha T3
// Liga a agenda das reuniões ao sistema: cada reunião aponta a tela do Atlantyx OS, as perguntas do roteiro, as entradas,
// as decisões e as ações, e guarda o registro (feita, data, decisões, checklist, notas). Ordem do método:
// diagnóstico → alavancas → produtos → simulação + Business Plan → metas → conselho. Só organiza; quem decide é o fundador.
// Guardado em kv_store (sem DDL): est:jornada.

export const K_JORNADA = 'est:jornada';
const txt = (v, n) => String(v ?? '').substring(0, n);
const dia = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).substring(0, 10) : null;
const erro = m => Object.assign(new Error(m), { status: 400 });
const hojeBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export const REUNIOES = [
  { n: 1, id: 'r1', titulo: 'Diagnóstico e travas', duracao: '2h', perguntas: [1, 2, 3, 4, 5],
    participantes: 'Fundador e sócios', traz: 'Financeiro (números do QuickBooks) e comercial (funil do HubSpot)',
    telas: ['Trilha guiada (perguntas 1 a 5)', 'Margem × Caixa', 'Sócios e o seu papel'],
    entradas: ['Mercado, clientes e concorrentes', 'Resultados por motor com números vivos do financeiro'],
    decisoes: ['Perguntas 1 a 5 validadas', 'Lista do que NÃO fazer', 'Caixa mínimo', 'Sócios alinhados'],
    acoes: ['Completar dados faltantes do financeiro', 'Convocar sócios'],
    checklist: [['diagnostico', 'Perguntas 1 a 5 validadas'], ['nao_fazer', 'Lista do que NÃO fazer conferida'], ['caixa_minimo', 'Caixa mínimo definido'], ['socios', 'Sócios alinhados']] },
  { n: 2, id: 'r2', titulo: 'Alavancas de receita', duracao: '90 min', perguntas: [6],
    participantes: 'Fundador, sócios e comercial', traz: 'Comercial (linha de base comercial)',
    telas: ['Trilha guiada (pergunta 6)', 'Moat'],
    entradas: ['Diagnóstico validado', 'Potencial atual × máximo por motor', 'Linha de base comercial (HubSpot e financeiro): leads qualificados por canal, conversão por etapa, contratos por cliente e ticket médio por oferta. Toda alavanca atua em oportunidades, conversão, transações por cliente ou ticket médio'],
    decisoes: ['Defender, evoluir ou transformar cada motor', 'No máximo 3 alavancas priorizadas por impacto e esforço'],
    acoes: ['Detalhar cada alavanca com hipótese e métrica'],
    checklist: [['motores', 'Escolha por motor registrada (pergunta 6)'], ['alavancas', 'Alavancas priorizadas']] },
  { n: 3, id: 'r3', titulo: 'Produtos e esteira', duracao: '90 min', perguntas: [],
    participantes: 'Fundador, sócios e tecnologia', traz: 'Tecnologia (capacidade e catálogo)',
    telas: ['Estúdio de Produtos e Esteira (4.4): Produtos, Esteira, Teste de escala, Catálogo'],
    entradas: ['Alavancas priorizadas', 'Custo pessoa-dia (R$ 276,56), piso e meta de margem, contrato mínimo para grandes (R$ 50 mil)', 'Posicionamento (hipótese a validar nesta reunião): camada tecnológica de serviços com IA e analytics; grandes empresas com serviços de inteligência de dados e IA sob medida (hipótese: Atlantyx Intelligence); médias com produto de gestão padronizado (hipótese: Atlantyx OS); pequenas fora do foco. Dê nome e prazo às ofertas além da POC de 6 semanas', 'Dúvida do fundador: comercializar produto ou focar só em RFP e projetos para grandes empresas? Resolver no começo da reunião'],
    decisoes: ['Produtos do catálogo e preço mínimo', 'Esteira A→B→C', 'Limite de produtos (catalogo_max_produtos)', 'Congelar o catálogo'],
    acoes: ['Preencher preços reais nos produtos'],
    checklist: [['catalogo', 'Produtos do catálogo escolhidos'], ['esteira', 'Esteira A→B→C definida'], ['limite', 'Limite de produtos definido'], ['teste_escala', 'Teste de escala feito']] },
  { n: 4, id: 'r4', titulo: 'Simulação, Business Plan e metas', duracao: '2h', perguntas: [7, 8, 11],
    participantes: 'Fundador, sócios e financeiro', traz: 'Financeiro (cenários e teste de estresse)',
    telas: ['Estúdio (Simulador, comparação, sensibilidade)', 'Business Plan (3.4)', 'Trilha guiada (perguntas 7, 8 e 11)', 'Placar → meta em três níveis (piso, meta, desafio) com premissa, evidência, alavanca e revisão'],
    entradas: ['Catálogo e esteira da reunião 3', 'Cenários salvos e dados reais do financeiro'],
    decisoes: ['Cenário-base', 'Business Plan revisado, ajustado e versionado', 'Metas por ano 2027–2031 compatíveis com margem e caixa'],
    acoes: ['Publicar o Business Plan ajustado', 'Registrar as metas na tela de metas da empresa'],
    checklist: [['cenario_base', 'Cenário-base escolhido no Simulador'], ['sensibilidade', 'Sensibilidade testada (custo +10%, prazo ×2, conversão ×0,5)'], ['business_plan', 'Business Plan revisado e ajustado (3.4)'], ['niveis', 'Cada meta com piso, meta e desafio, premissa, evidência, alavanca, indicador, dono e data de revisão'], ['metas', 'Metas 2027–2031 fixadas']] },
  { n: 5, id: 'r5', titulo: 'Obstáculos, ações, campanhas e pessoas', duracao: '90 min', perguntas: [9, 10],
    participantes: 'Fundador, sócios, gerentes de projetos e comercial', traz: 'Marketing e gente (verba e capacidade)',
    telas: ['Trilha guiada (perguntas 9 e 10)', 'Marketing', 'Capacidade e ocupação', 'Placar → Origem da receita nova', 'Jornada → Pessoas e liderança'],
    entradas: ['Metas da reunião 4', 'Limite de ocupação', 'Pipeline do HubSpot'],
    decisoes: ['Plano de ações com dono e prazo', 'Verba de marketing', 'Contratações e orçamento por motor'],
    acoes: ['Detalhar o orçamento do 1º semestre'],
    checklist: [['obstaculos', 'Obstáculos classificados (controláveis ou não)'], ['acoes', 'Ações com dono e prazo'], ['verba', 'Verba de marketing definida'], ['contratacoes', 'Contratações e capacidade definidas'], ['origem', 'Venda ativa e origem da receita nova definidas (quem aborda quem, canal e cadência)'], ['pessoas', 'Pessoas e liderança: estágio de cada área, o que o fundador delega e plano de 90 dias']] },
  { n: 6, id: 'r6', titulo: 'Conselho', duracao: '90 min', perguntas: [],
    participantes: 'Fundador e sócios', traz: 'Quem prepara o resumo exportado da jornada',
    telas: ['Sala do Conselho', 'Resumo exportado da jornada'],
    entradas: ['Diagnóstico, alavancas, catálogo, Business Plan ajustado, metas, ações e orçamento'],
    decisoes: ['Aprovar metas', 'Aprovar orçamento do 1º semestre (aprovação em dezembro)', 'Riscos aceitos', 'Lista do que NÃO fazer'],
    acoes: ['Comunicar a estratégia a 100% da empresa'],
    checklist: [['contra', 'Conselheiro do Contra ouvido'], ['orcamento', 'Orçamento do 1º semestre aprovado'], ['riscos', 'Riscos aceitos registrados'], ['comunicacao', 'Comunicação a 100% da empresa agendada']] },
];

// Decisões em aberto que travam o plano (Guia 2027) — levar todas à Reunião 1
export const DECISOES_ABERTAS = [
  'Qual produto comercializar, ou o foco é só RFP e projetos para grandes empresas?',
  'Qual é a meta de faturamento de 2027 (definida na Reunião 4, pelo método do guia; não antes)?',
  'Qual é a meta comercial mensal (a definir na Reunião 4)?',
  'Meta de vendas fechadas: contratos novos por mês, ou meta de faturamento do mês?',
  'Filial nos EUA: entra ou fica fora de 2027 a 2031?',
  'Licenciar o Atlantyx OS para outros clientes, com ambientes separados: avaliar ou descartar?',
  'Manutenção evolutiva e corretiva: dentro da subscrição, por hora ou pacote de horas?',
  'Instância separada da CPFL (Vercel e Neon próprios): decidir ou adiar.',
];
export const ESTAGIOS_PESSOA = ['iniciante', 'em_desenvolvimento', 'autonoma'];
// Pessoas e liderança (Reunião 5): estágio de cada área/pessoa-chave, o que o fundador delega e deixa de fazer, plano de 90 dias
export function pessoasNormalizar(l) {
  return (Array.isArray(l) ? l : []).slice(0, 40).map(p => ({
    id: txt(p.id, 40) || 'p_' + Math.random().toString(36).slice(2, 8), area: txt(p.area, 80), pessoa: txt(p.pessoa, 80),
    estagio: ESTAGIOS_PESSOA.includes(p.estagio) ? p.estagio : 'iniciante', delega: txt(p.delega, 300), deixa_de_fazer: txt(p.deixa_de_fazer, 300),
    plano90: txt(p.plano90, 600), prazo: dia(p.prazo),
  })).filter(p => p.area.trim() || p.pessoa.trim());
}

export function jornadaNormalizar(j = {}) {
  const out = {};
  for (const r of REUNIOES) {
    const s = j?.reunioes?.[r.id] || {};
    out[r.id] = {
      feito: !!s.feito, data: dia(s.data), realizada_em: dia(s.realizada_em), notas: txt(s.notas, 1500),
      checklist: Object.fromEntries(r.checklist.map(([k]) => [k, !!s.checklist?.[k]])),
      decisoes: (Array.isArray(s.decisoes) ? s.decisoes : []).slice(0, 40).map(d => ({ id: txt(d.id, 40), texto: txt(d.texto, 600), por: txt(d.por, 80) || null, em: txt(d.em, 40) || null })).filter(d => d.texto.trim()),
    };
  }
  return { reunioes: out, pessoas: pessoasNormalizar(j?.pessoas), atualizado_em: j?.atualizado_em || null };
}

// roteiroStatus: saída de roteiroStatus() (etapas com estado). Devolve a jornada com progresso e alertas de ordem.
export function jornadaGerar(estado, roteiroStatus) {
  const J = jornadaNormalizar(estado), et = Object.fromEntries((roteiroStatus?.etapas || []).map(e => [e.n, e]));
  const lista = REUNIOES.map((r, i) => {
    const s = J.reunioes[r.id], ant = REUNIOES.slice(0, i).filter(x => !J.reunioes[x.id].feito).map(x => x.n);
    const perg = r.perguntas.map(n => ({ n, estado: et[n]?.estado || 'vazia' })), checkOk = r.checklist.filter(([k]) => s.checklist[k]).length;
    const alertas = [];
    if (s.feito && ant.length) alertas.push(`Marcada como feita, mas as reuniões ${ant.join(', ')} ainda não foram feitas — a ordem do método não pode ser invertida.`);
    if (s.feito && checkOk < r.checklist.length) alertas.push(`${r.checklist.length - checkOk} item(ns) do checklist ainda abertos.`);
    if (s.feito && perg.some(p => p.estado !== 'validada')) alertas.push(`Perguntas ${perg.filter(p => p.estado !== 'validada').map(p => p.n).join(', ')} do roteiro ainda não validadas.`);
    if (!s.feito && r.n >= 4 && perg.some(p => p.estado !== 'vazia') && ant.length) alertas.push('Metas começaram antes de diagnóstico, alavancas e produtos — o método pede metas depois da simulação.');
    return { ...r, ...s, perguntas_estado: perg, checklist: r.checklist.map(([k, t]) => ({ chave: k, texto: t, ok: !!s.checklist[k] })), progresso: r.checklist.length ? Math.round(100 * checkOk / r.checklist.length) : 0, alertas, bloqueada_por: ant };
  });
  const feitas = lista.filter(r => r.feito).length, proxima = lista.find(r => !r.feito) || null;
  return { reunioes: lista, pessoas: J.pessoas, estagios: ESTAGIOS_PESSOA, decisoes_abertas: DECISOES_ABERTAS, feitas, total: lista.length, proxima: proxima?.n || null, completa: feitas === lista.length, atualizado_em: J.atualizado_em };
}

export function jornadaAplicar(estado, { reuniao, feito, data, notas, checklist, decisao, decisao_remover, pessoa, pessoa_remover } = {}, usuario) {
  const J = jornadaNormalizar(estado);
  if (pessoa || pessoa_remover) { // v3.636: pessoas e liderança (sem reunião)
    if (pessoa) { if (!String(pessoa.area || '').trim() && !String(pessoa.pessoa || '').trim()) throw erro('Informe a área ou a pessoa'); const n = pessoasNormalizar([pessoa])[0], i = pessoa.id ? J.pessoas.findIndex(x => x.id === pessoa.id) : -1; if (i >= 0) J.pessoas[i] = { ...n, id: J.pessoas[i].id }; else J.pessoas.push(n); }
    if (pessoa_remover) J.pessoas = J.pessoas.filter(x => x.id !== pessoa_remover);
    return { reunioes: J.reunioes, pessoas: J.pessoas, atualizado_em: new Date().toISOString(), atualizado_por: usuario || null };
  }
  const r = REUNIOES.find(x => x.id === reuniao || x.n === Number(reuniao));
  if (!r) throw erro('Reunião inválida');
  const s = J.reunioes[r.id];
  if (feito !== undefined) { s.feito = !!feito; s.realizada_em = feito ? (dia(data) || hojeBR()) : null; }
  if (data !== undefined && feito === undefined) s.data = dia(data);
  if (notas !== undefined) s.notas = txt(notas, 1500);
  if (checklist && typeof checklist === 'object') for (const [k] of r.checklist) if (checklist[k] !== undefined) s.checklist[k] = !!checklist[k];
  if (decisao) {
    if (!String(decisao.texto || '').trim()) throw erro('Escreva a decisão');
    s.decisoes.unshift({ id: 'd_' + Date.now().toString(36), texto: txt(decisao.texto, 600), por: usuario || null, em: new Date().toISOString() });
    s.decisoes = s.decisoes.slice(0, 40);
  }
  if (decisao_remover) s.decisoes = s.decisoes.filter(d => d.id !== decisao_remover);
  return { reunioes: J.reunioes, pessoas: J.pessoas, atualizado_em: new Date().toISOString(), atualizado_por: usuario || null };
}

export function jornadaResumoTexto(estado, roteiroStatus) {
  const G = jornadaGerar(estado, roteiroStatus), L = [`Jornada do planejamento 2027: ${G.feitas} de ${G.total} reuniões feitas.`];
  for (const r of G.reunioes) {
    L.push(`${r.n}. ${r.titulo} — ${r.feito ? 'feita em ' + (r.realizada_em || '?') : 'pendente'} (${r.progresso}% do checklist)`);
    for (const d of r.decisoes.slice(0, 5)) L.push(`   decisão: ${d.texto}`);
  }
  return L.join('\n');
}
