// lib/estrategia-pesquisa.js — v3.637 · PASSO 0 DA JORNADA: pesquisa de mercado e concorrência (Guia do Planejamento 2027) · trilha T3
// Antes da Reunião 1 o fundador reúne o diagnóstico externo em cinco fichas, nesta ordem: mercado → clientes → concorrentes →
// quadro "como estamos" (Atlantyx × pares) → potencial por motor. Regra do guia: todo número de fora leva FONTE e DATA; sem fonte = "a confirmar".
// O sistema não inventa dado de mercado: a análise de IA (1.4) entra só como rascunho marcado "não verificado". Guardado em kv_store (sem DDL): est:pesquisa.

export const K_PESQUISA = 'est:pesquisa';
const txt = (v, n) => String(v ?? '').substring(0, n);
const dia = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).substring(0, 10) : null;
const num = v => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/\s|r\$|%/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const erro = m => Object.assign(new Error(m), { status: 400 });
const id = p => p + '_' + Math.random().toString(36).slice(2, 8);

export const CAMPOS_MERCADO = [
  ['atuamos', 'Onde atuamos (setores e regiões)'], ['regras', 'Regras que pesam (LGPD, setor elétrico, setor financeiro, licitações e PNCP)'],
  ['tamanho', 'Tamanho e ritmo do gasto das grandes empresas com dados e IA'], ['fornecedores', 'Fornecedores críticos (nuvens, provedores de modelos, mercado de talentos)'],
  ['substitutos', 'Substitutos (ferramentas de IA prontas, equipes internas do cliente)'], ['entrantes', 'Novos entrantes'],
];
export const GRUPOS_CONC = { consultorias: 'Consultorias grandes', fabricas: 'Fábricas de software', internas: 'Equipes internas dos clientes', ferramentas: 'Ferramentas prontas de IA' };
export const CRITERIOS = [['preco', 'Preço por pessoa-dia'], ['prazo', 'Prazo de entrega'], ['especializacao', 'Especialização no setor'], ['produto', 'Produto próprio'], ['referencias', 'Referências de clientes'], ['capacidade', 'Capacidade de entrega']];
export const NOTAS = { melhor: 'Melhor', igual: 'Igual', pior: 'Pior' };
export const MOTORES = { pessoas: 'Alocação de pessoas', projetos: 'Projetos', produtos: 'Produtos (IA e verticais)' };
export const MIN = { mercado: 4, clientes: 3, concorrentes: 8, pares: 3 };

const ficha = f => ({ texto: txt(f?.texto, 1500), fonte: txt(f?.fonte, 300), data: dia(f?.data) });
export function pesquisaNormalizar(p = {}) {
  const mercado = Object.fromEntries(CAMPOS_MERCADO.map(([k]) => [k, ficha(p.mercado?.[k])]));
  const clientes = (Array.isArray(p.clientes) ? p.clientes : []).slice(0, 60).map(c => ({ id: txt(c.id, 40) || id('cl'), cliente: txt(c.cliente, 120), porte: txt(c.porte, 40), setor: txt(c.setor, 60), motor: MOTORES[c.motor] ? c.motor : '', receita_12m: num(c.receita_12m),
    por_que_compra: txt(c.por_que_compra, 500), sem_nos: txt(c.sem_nos, 500), falta: txt(c.falta, 500) })).filter(c => c.cliente.trim());
  const concorrentes = (Array.isArray(p.concorrentes) ? p.concorrentes : []).slice(0, 40).map(c => ({ id: txt(c.id, 40) || id('cc'), nome: txt(c.nome, 120), grupo: GRUPOS_CONC[c.grupo] ? c.grupo : '', porte: txt(c.porte, 80), oferta: txt(c.oferta, 300), preco: txt(c.preco, 120),
    forca: txt(c.forca, 300), perdas: txt(c.perdas, 300), fonte: txt(c.fonte, 300), data: dia(c.data), origem: c.origem === 'ia' ? 'ia' : 'manual' })).filter(c => c.nome.trim());
  const ids = new Set(concorrentes.map(c => c.id));
  const pares = (Array.isArray(p.quadro?.pares) ? p.quadro.pares : []).filter(x => ids.has(x)).slice(0, 5);
  const celulas = {}; for (const [k] of CRITERIOS) { celulas[k] = {}; for (const col of ['atlantyx', ...pares]) { const c = p.quadro?.celulas?.[k]?.[col] || {}; celulas[k][col] = { nota: NOTAS[c.nota] ? c.nota : '', evidencia: txt(c.evidencia, 400) }; } }
  const potencial = Object.fromEntries(Object.keys(MOTORES).map(m => { const x = p.potencial?.[m] || {}; return [m, { empresas_icp: num(x.empresas_icp), ticket_medio: num(x.ticket_medio), conversao_pct: num(x.conversao_pct), receita_atual: num(x.receita_atual), fonte: txt(x.fonte, 300), data: dia(x.data), hipotese: txt(x.hipotese, 400) }]; }));
  return { mercado, clientes, concorrentes, quadro: { pares, celulas }, potencial, atualizado_em: p.atualizado_em || null, atualizado_por: p.atualizado_por || null };
}

export function potencialCalc(x) {
  const pot = x.empresas_icp != null && x.ticket_medio != null && x.conversao_pct != null ? x.empresas_icp * x.ticket_medio * x.conversao_pct / 100 : null;
  return { potencial: pot, gap: pot != null && x.receita_atual != null ? pot - x.receita_atual : null };
}

// status das 5 etapas, na ordem do guia; cada etapa só "libera" depois da anterior (aviso, não bloqueio)
export function pesquisaStatus(P0, { mercado_ia = null } = {}) {
  const P = pesquisaNormalizar(P0), avisos = [];
  const mFeitos = CAMPOS_MERCADO.filter(([k]) => P.mercado[k].texto.trim()), mSemFonte = mFeitos.filter(([k]) => !P.mercado[k].fonte.trim() || !P.mercado[k].data);
  const cOk = P.clientes.filter(c => c.motor && c.receita_12m != null), cEnt = P.clientes.filter(c => c.por_que_compra.trim() || c.sem_nos.trim());
  const nGrupos = new Set(P.concorrentes.map(c => c.grupo).filter(Boolean)).size, cSemFonte = P.concorrentes.filter(c => c.origem === 'ia' || !c.fonte.trim());
  const atlOk = CRITERIOS.every(([k]) => P.quadro.celulas[k]?.atlantyx?.nota && P.quadro.celulas[k].atlantyx.evidencia.trim());
  const paresOk = P.quadro.pares.filter(pid => CRITERIOS.filter(([k]) => P.quadro.celulas[k]?.[pid]?.nota).length >= 4);
  const potOk = Object.entries(P.potencial).filter(([, x]) => potencialCalc(x).potencial != null);
  const E = [
    { n: 1, chave: 'mercado', titulo: 'Mercado (pergunta 1)', ok: mFeitos.length >= MIN.mercado, faltas: mFeitos.length >= MIN.mercado ? [] : [`preencher ${MIN.mercado - mFeitos.length} campo(s) a mais da ficha de mercado`], aviso: mSemFonte.length ? `${mSemFonte.length} campo(s) sem fonte ou data: marcados "a confirmar"` : null },
    { n: 2, chave: 'clientes', titulo: 'Clientes (pergunta 2)', ok: cOk.length >= MIN.clientes && cEnt.length >= 3, faltas: [cOk.length < MIN.clientes ? `${MIN.clientes - cOk.length} cliente(s) com motor e receita dos 12 meses` : null, cEnt.length < 3 ? 'ouvir 3 a 5 clientes (por que compram e o que fariam sem nós)' : null].filter(Boolean), aviso: null },
    { n: 3, chave: 'concorrentes', titulo: 'Concorrentes (pergunta 3)', ok: P.concorrentes.length >= MIN.concorrentes && nGrupos >= 3, faltas: [P.concorrentes.length < MIN.concorrentes ? `${MIN.concorrentes - P.concorrentes.length} concorrente(s) a mais (de 8 a 10)` : null, nGrupos < 3 ? 'cobrir pelo menos 3 dos 4 grupos' : null].filter(Boolean), aviso: cSemFonte.length ? `${cSemFonte.length} concorrente(s) sem fonte ou vindo só da IA: "a confirmar"` : null },
    { n: 4, chave: 'quadro', titulo: 'Como estamos (pergunta 4)', ok: atlOk && paresOk.length >= MIN.pares, faltas: [!atlOk ? 'avaliar a Atlantyx nos 6 critérios, cada um com evidência' : null, paresOk.length < MIN.pares ? `${MIN.pares - paresOk.length} par(es) com pelo menos 4 critérios avaliados` : null].filter(Boolean), aviso: null },
    { n: 5, chave: 'potencial', titulo: 'Potencial por motor (perguntas 4 e 6)', ok: potOk.length === 3, faltas: potOk.length === 3 ? [] : [`${3 - potOk.length} motor(es) sem empresas, ticket e conversão`], aviso: null },
  ];
  E.forEach((e, i) => { e.aguarda = E.slice(0, i).filter(x => !x.ok).map(x => x.n); });
  const feitas = E.filter(e => e.ok).length;
  return { etapas: E, feitas, total: E.length, completo: feitas === E.length, proxima: E.find(e => !e.ok)?.n || null, avisos, analise_ia: mercado_ia ? { em: mercado_ia.em, idade_dias: mercado_ia.idade_dias } : null };
}

export function pesquisaAplicar(atual, { secao, dados, chave_toggle } = {}, usuario) {
  const P = pesquisaNormalizar(atual);
  if (!['mercado', 'clientes', 'concorrentes', 'quadro', 'potencial'].includes(secao)) throw erro('Seção inválida');
  const novo = { ...P, [secao]: dados };
  // o quadro e os pares dependem da lista de concorrentes: normaliza na ordem certa
  const N = pesquisaNormalizar(novo);
  return { ...N, atualizado_em: new Date().toISOString(), atualizado_por: usuario || null };
}

// concorrentes do rascunho da IA (1.4) → lista, sem duplicar nome; entram marcados origem 'ia' (sem fonte = a confirmar)
export function pesquisaImportarIA(atual, concIA, usuario) {
  const P = pesquisaNormalizar(atual), tem = new Set(P.concorrentes.map(c => c.nome.trim().toLowerCase())), novos = [];
  for (const c of Array.isArray(concIA) ? concIA : []) {
    const nome = txt(c?.nome, 120).trim(); if (!nome || tem.has(nome.toLowerCase())) continue; tem.add(nome.toLowerCase());
    novos.push({ nome, grupo: '', porte: '', oferta: txt(c.posicionamento, 300), preco: '', forca: txt([].concat(c.forcas || []).join('; '), 300), perdas: txt(c.fraquezas ? 'Fraquezas (IA): ' + [].concat(c.fraquezas).join('; ') : '', 300), fonte: '', data: null, origem: 'ia' });
  }
  const N = pesquisaNormalizar({ ...P, concorrentes: [...P.concorrentes, ...novos] });
  return { P: { ...N, atualizado_em: new Date().toISOString(), atualizado_por: usuario || null }, importados: novos.length };
}

export function pesquisaResumoTexto(P0, st) {
  const P = pesquisaNormalizar(P0), L = [`PESQUISA DE MERCADO E CONCORRÊNCIA (passo 0) — ${st.feitas} de ${st.total} etapas prontas. Dado externo sem fonte = "a confirmar".`];
  for (const [k, r] of CAMPOS_MERCADO) if (P.mercado[k].texto) L.push(`Mercado · ${r}: ${P.mercado[k].texto.substring(0, 300)} (${P.mercado[k].fonte ? 'fonte: ' + P.mercado[k].fonte : 'a confirmar'})`);
  if (P.clientes.length) L.push('Clientes: ' + P.clientes.slice(0, 10).map(c => `${MOTORES[c.motor] || '?'} ${c.receita_12m != null ? 'R$ ' + Math.round(c.receita_12m) : ''}${c.por_que_compra ? ' — compra por: ' + c.por_que_compra.substring(0, 100) : ''}`).join(' | '));
  if (P.concorrentes.length) L.push('Concorrentes: ' + P.concorrentes.slice(0, 12).map(c => `${c.nome} (${GRUPOS_CONC[c.grupo] || 'sem grupo'}${c.fonte ? '' : ', a confirmar'}): ${c.forca.substring(0, 80)}`).join(' | '));
  for (const [m, x] of Object.entries(P.potencial)) { const c = potencialCalc(x); if (c.potencial != null) L.push(`Potencial ${MOTORES[m]}: R$ ${Math.round(c.potencial)}/ano${c.gap != null ? `, diferença para o atual R$ ${Math.round(c.gap)}` : ''}`); }
  return L.join('\n');
}
