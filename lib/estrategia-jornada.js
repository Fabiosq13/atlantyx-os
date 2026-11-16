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
    telas: ['Trilha guiada (perguntas 1 a 5)', 'Margem × Caixa', 'Sócios e o seu papel'],
    entradas: ['Mercado, clientes e concorrentes', 'Resultados por motor com números vivos do financeiro'],
    decisoes: ['Perguntas 1 a 5 validadas', 'Lista do que NÃO fazer', 'Caixa mínimo', 'Sócios alinhados'],
    acoes: ['Completar dados faltantes do financeiro', 'Convocar sócios'],
    checklist: [['diagnostico', 'Perguntas 1 a 5 validadas'], ['nao_fazer', 'Lista do que NÃO fazer conferida'], ['caixa_minimo', 'Caixa mínimo definido'], ['socios', 'Sócios alinhados']] },
  { n: 2, id: 'r2', titulo: 'Alavancas de receita', duracao: '90 min', perguntas: [6],
    telas: ['Trilha guiada (pergunta 6)', 'Moat'],
    entradas: ['Diagnóstico validado', 'Potencial atual × máximo por motor'],
    decisoes: ['Defender, evoluir ou transformar cada motor', 'No máximo 3 alavancas priorizadas por impacto e esforço'],
    acoes: ['Detalhar cada alavanca com hipótese e métrica'],
    checklist: [['motores', 'Escolha por motor registrada (pergunta 6)'], ['alavancas', 'Alavancas priorizadas']] },
  { n: 3, id: 'r3', titulo: 'Produtos e esteira', duracao: '90 min', perguntas: [],
    telas: ['Estúdio de Produtos e Esteira (4.4): Produtos, Esteira, Teste de escala, Catálogo'],
    entradas: ['Alavancas priorizadas', 'Custo pessoa-dia, piso e meta de margem, contrato mínimo para grandes'],
    decisoes: ['Produtos do catálogo e preço mínimo', 'Esteira A→B→C', 'Limite de produtos (catalogo_max_produtos)', 'Congelar o catálogo'],
    acoes: ['Preencher preços reais nos produtos'],
    checklist: [['catalogo', 'Produtos do catálogo escolhidos'], ['esteira', 'Esteira A→B→C definida'], ['limite', 'Limite de produtos definido'], ['teste_escala', 'Teste de escala feito']] },
  { n: 4, id: 'r4', titulo: 'Simulação, Business Plan e metas', duracao: '2h', perguntas: [7, 8, 11],
    telas: ['Estúdio (Simulador, comparação, sensibilidade)', 'Business Plan (3.4)', 'Trilha guiada (perguntas 7, 8 e 11)'],
    entradas: ['Catálogo e esteira da reunião 3', 'Cenários salvos e dados reais do financeiro'],
    decisoes: ['Cenário-base', 'Business Plan revisado, ajustado e versionado', 'Metas por ano 2027–2031 compatíveis com margem e caixa'],
    acoes: ['Publicar o Business Plan ajustado', 'Registrar as metas na tela de metas da empresa'],
    checklist: [['cenario_base', 'Cenário-base escolhido no Simulador'], ['sensibilidade', 'Sensibilidade testada (custo +10%, prazo ×2, conversão ×0,5)'], ['business_plan', 'Business Plan revisado e ajustado (3.4)'], ['metas', 'Metas 2027–2031 fixadas']] },
  { n: 5, id: 'r5', titulo: 'Obstáculos, ações, campanhas e pessoas', duracao: '90 min', perguntas: [9, 10],
    telas: ['Trilha guiada (perguntas 9 e 10)', 'Marketing', 'Capacidade e ocupação'],
    entradas: ['Metas da reunião 4', 'Limite de ocupação', 'Pipeline do HubSpot'],
    decisoes: ['Plano de ações com dono e prazo', 'Verba de marketing', 'Contratações e orçamento por motor'],
    acoes: ['Detalhar o orçamento do 1º semestre'],
    checklist: [['obstaculos', 'Obstáculos classificados (controláveis ou não)'], ['acoes', 'Ações com dono e prazo'], ['verba', 'Verba de marketing definida'], ['contratacoes', 'Contratações e capacidade definidas']] },
  { n: 6, id: 'r6', titulo: 'Conselho', duracao: '90 min', perguntas: [],
    telas: ['Sala do Conselho', 'Resumo exportado da jornada'],
    entradas: ['Diagnóstico, alavancas, catálogo, Business Plan ajustado, metas, ações e orçamento'],
    decisoes: ['Aprovar metas', 'Aprovar orçamento do 1º semestre (aprovação em dezembro)', 'Riscos aceitos', 'Lista do que NÃO fazer'],
    acoes: ['Comunicar a estratégia a 100% da empresa'],
    checklist: [['contra', 'Conselheiro do Contra ouvido'], ['orcamento', 'Orçamento do 1º semestre aprovado'], ['riscos', 'Riscos aceitos registrados'], ['comunicacao', 'Comunicação a 100% da empresa agendada']] },
];

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
  return { reunioes: out, atualizado_em: j?.atualizado_em || null };
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
  return { reunioes: lista, feitas, total: lista.length, proxima: proxima?.n || null, completa: feitas === lista.length, atualizado_em: J.atualizado_em };
}

export function jornadaAplicar(estado, { reuniao, feito, data, notas, checklist, decisao, decisao_remover } = {}, usuario) {
  const J = jornadaNormalizar(estado), r = REUNIOES.find(x => x.id === reuniao || x.n === Number(reuniao));
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
  return { reunioes: J.reunioes, atualizado_em: new Date().toISOString(), atualizado_por: usuario || null };
}

export function jornadaResumoTexto(estado, roteiroStatus) {
  const G = jornadaGerar(estado, roteiroStatus), L = [`Jornada do planejamento 2027: ${G.feitas} de ${G.total} reuniões feitas.`];
  for (const r of G.reunioes) {
    L.push(`${r.n}. ${r.titulo} — ${r.feito ? 'feita em ' + (r.realizada_em || '?') : 'pendente'} (${r.progresso}% do checklist)`);
    for (const d of r.decisoes.slice(0, 5)) L.push(`   decisão: ${d.texto}`);
  }
  return L.join('\n');
}
