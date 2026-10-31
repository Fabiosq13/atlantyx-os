// lib/estrategia-roteiro.js — v3.341 · TRILHA GUIADA DA ESTRATÉGIA (5 anos: 2027–2031) · trilha T3
// Método por trás do plano: roteiro de 11 perguntas (vazia → rascunho → validada; só o fundador valida), lista do que
// NÃO fazer (a Esteira avisa quando uma demanda parece contrariar um "não"), calendário de revisão (anual no 4º tri,
// orçamento semestral aprovado em dezembro e revisto em junho, check-ins trimestrais) e orçamento semestral.
// Guardado em kv_store (sem DDL): est:roteiro, est:nao_fazer, est:revisao_calendario, est:orcamento_semestral.
// Nada aqui executa ação: só organiza o que o fundador decide.

export const K_ROTEIRO = 'est:roteiro', K_NAO_FAZER = 'est:nao_fazer', K_CALENDARIO = 'est:revisao_calendario', K_ORCAMENTO = 'est:orcamento_semestral';
export const HORIZONTE = { inicio: 2027, fim: 2031 };
export const MOTORES_R = { pessoas: 'Alocação de pessoas', projetos: 'Projetos', produtos: 'Produtos (IA e verticais)' };

export const REGRAS_OURO = [
  'A ordem não pode ser invertida: sócios → a quem servir e o jogo → história e maus hábitos → estratégia → plano → estrutura → cultura → sistema de gestão → incentivos.',
  'Estratégia não é plano. Estratégia é escolher (sim a um caminho, não aos outros); o plano executa a escolha. A lista do que NÃO fazer é parte central da estratégia.',
  'A cultura serve à estratégia, não o contrário.',
  'Estratégia de longo prazo (5 anos); o plano é revisto todo ano; o orçamento a cada 6 meses.',
  'Escolha sem comunicação não funciona: a liderança precisa reproduzir a estratégia para 100% da empresa.',
];

export const BLOCOS = { externo: 'Diagnóstico externo', interno: 'Diagnóstico interno (raio-x)', metas: 'Definição de metas' };
export const PERGUNTAS = [
  { n: 1, bloco: 'externo', titulo: 'Em que mercado atuamos?', guia: 'Geografia, regulação (LGPD, setor elétrico, setor financeiro, licitações/PNCP), competição (dinâmica e nº de competidores), novos entrantes, substitutos, fornecedores (nuvens, provedores de modelos, mercado de talentos) e clientes.' },
  { n: 2, bloco: 'externo', titulo: 'A quem servimos?', guia: 'Perfil da demanda (demográfico/econômico), segmentação (porte, setor, uso: alocação, projeto, produto) e tendências de longo prazo.' },
  { n: 3, bloco: 'externo', titulo: 'Com quem competimos?', guia: 'Perfil dos competidores (alcance, porte), segmentação da oferta, incumbentes e novos entrantes, substitutos e outliers, organização e tendências da oferta.' },
  { n: 4, bloco: 'interno', titulo: 'Como estamos neste mercado?', guia: 'Posicionamento atual versus o peer group e versus cada segmento atendido; posicionamento possível (potencial).' },
  { n: 5, bloco: 'interno', titulo: 'Quais são nossos resultados?', guia: 'Portfólio, nível de serviço, vendas (receita e nº de clientes) e margem, por motor (alocação, projetos, produtos), com os números vivos do financeiro.', dados: true },
  { n: 6, bloco: 'interno', titulo: 'Estamos atingindo nosso potencial?', guia: 'Atual × máximo possível, resultado atual × potencial; para cada motor escolher defender, evoluir ou transformar.', motores: true },
  { n: 7, bloco: 'metas', titulo: 'Qual a ambição dos acionistas?', guia: 'O que cada sócio quer da empresa em 3 a 5 anos, o papel da empresa na vida dele e a fase de vida. (O alinhamento detalhado de sócios chega na próxima entrega.)' },
  { n: 8, bloco: 'metas', titulo: 'O que queremos ser e estar em 5 anos?', guia: 'Inclui o exercício da "notícia de jornal de 2031" sobre a Atlantyx.' },
  { n: 9, bloco: 'metas', titulo: 'Que obstáculos impedem a visão?', guia: 'Classifique cada obstáculo como controlável ou não controlável (ex.: capital externo não é controlável; margem e caixa próprios são). A ação nasce do que se controla.' },
  { n: 10, bloco: 'metas', titulo: 'Que ações removem os obstáculos?', guia: 'Ação, responsável, prazo, recurso necessário, meta e governança; cada ação ligada a um obstáculo.' },
  { n: 11, bloco: 'metas', titulo: 'Que impacto final causaremos e como mediremos?', guia: 'Teoria da mudança (impacto, outputs, outcomes), indicadores e frequência.' },
];
export const ESTADOS = { vazia: 'Vazia', rascunho: 'Rascunho', validada: 'Validada' };
export const ESCOLHAS_MOTOR = { defender: 'Defender', evoluir: 'Evoluir', transformar: 'Transformar' };

const txt = (v, n) => String(v ?? '').substring(0, n);
const dia = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).substring(0, 10) : null;
const erro = (m, extra = {}) => Object.assign(new Error(m), { status: 400, ...extra });
export const hojeBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

// ── roteiro ──
export function roteiroNormalizar(r) {
  const E = (r && r.etapas) || {}, etapas = {};
  for (const q of PERGUNTAS) {
    const e = E[q.n] || E[String(q.n)] || {};
    const o = { resposta: txt(e.resposta, 8000), estado: ESTADOS[e.estado] ? e.estado : (String(e.resposta || '').trim() ? 'rascunho' : 'vazia'), responsavel: txt(e.responsavel, 80), data: dia(e.data),
      atualizado_em: e.atualizado_em || null, atualizado_por: e.atualizado_por || null, validado_em: e.validado_em || null, validado_por: e.validado_por || null, fora_de_ordem: !!e.fora_de_ordem };
    if (q.motores) o.motores = Object.fromEntries(Object.keys(MOTORES_R).map(k => [k, ESCOLHAS_MOTOR[e.motores?.[k]] ? e.motores[k] : '']));
    if (o.estado === 'validada' && !o.resposta.trim()) o.estado = 'vazia';
    etapas[q.n] = o;
  }
  return { etapas, atualizado_em: r?.atualizado_em || null };
}

// estado de cada etapa: pode validar? começou fora de ordem? próxima a fazer?
export function roteiroStatus(r) {
  const R = roteiroNormalizar(r), etapas = PERGUNTAS.map(q => {
    const e = R.etapas[q.n], antes = PERGUNTAS.filter(p => p.n < q.n);
    const faltamValidar = antes.filter(p => R.etapas[p.n].estado !== 'validada').map(p => p.n), vaziasAntes = antes.filter(p => R.etapas[p.n].estado === 'vazia').map(p => p.n);
    const alertas = [];
    if (e.estado !== 'vazia' && vaziasAntes.length) alertas.push(`Começada antes das etapas ${vaziasAntes.join(', ')} — a ordem do método não pode ser invertida.`);
    if (e.estado === 'validada' && faltamValidar.length) alertas.push(`Validada, mas as etapas ${faltamValidar.join(', ')} mudaram depois e voltaram a rascunho — reveja esta resposta.`);
    if (q.motores && e.estado !== 'vazia' && Object.values(e.motores || {}).some(v => !v)) alertas.push('Escolha defender, evoluir ou transformar para cada motor.');
    return { n: q.n, bloco: q.bloco, titulo: q.titulo, estado: e.estado, pode_validar: !faltamValidar.length, faltam_validar: faltamValidar, alertas };
  });
  const val = etapas.filter(e => e.estado === 'validada').length, ras = etapas.filter(e => e.estado === 'rascunho').length;
  const proxima = etapas.find(e => e.estado !== 'validada')?.n || null;
  return { etapas, validadas: val, rascunhos: ras, vazias: etapas.length - val - ras, total: etapas.length, proxima, pct: Math.round(val / etapas.length * 100) };
}

// grava uma etapa. Regras: validar exige as anteriores validadas (bloqueia); começar sem as anteriores exige confirmar (forcar)
export function roteiroAplicar(r, { n, resposta, responsavel, data, motores, estado, forcar } = {}, usuario) {
  const R = roteiroNormalizar(r), q = PERGUNTAS.find(p => p.n === Number(n)); if (!q) throw erro('Etapa inválida');
  const e = { ...R.etapas[q.n] }, antes = PERGUNTAS.filter(p => p.n < q.n), agora = new Date().toISOString();
  const texto = resposta !== undefined ? txt(resposta, 8000) : e.resposta, mudouTexto = texto.trim() !== e.resposta.trim();
  const novoEstado = ESTADOS[estado] ? estado : (texto.trim() ? (e.estado === 'validada' && !mudouTexto ? 'validada' : 'rascunho') : 'vazia');
  if (novoEstado === 'validada') {
    const falta = antes.filter(p => R.etapas[p.n].estado !== 'validada').map(p => p.n);
    if (falta.length) throw erro(`Valide antes as etapas ${falta.join(', ')} — a ordem do método não pode ser invertida.`, { codigo: 'ORDEM_VALIDAR', faltam: falta });
    if (texto.trim().length < 20) throw erro('Escreva a resposta antes de validar (pelo menos uma frase completa).');
    if (q.motores) { const m = { ...(e.motores || {}), ...(motores || {}) }; if (Object.keys(MOTORES_R).some(k => !ESCOLHAS_MOTOR[m[k]])) throw erro('Escolha defender, evoluir ou transformar para os três motores antes de validar.'); }
  }
  const vazias = antes.filter(p => R.etapas[p.n].estado === 'vazia').map(p => p.n);
  if (novoEstado !== 'vazia' && e.estado === 'vazia' && vazias.length && !forcar)
    throw erro(`As etapas ${vazias.join(', ')} ainda estão vazias. O método pede a ordem — quer começar esta mesmo assim?`, { codigo: 'ORDEM_INICIAR', faltam: vazias });
  e.resposta = texto; e.estado = novoEstado;
  if (responsavel !== undefined) e.responsavel = txt(responsavel, 80);
  if (data !== undefined) e.data = dia(data);
  if (q.motores && motores) e.motores = Object.fromEntries(Object.keys(MOTORES_R).map(k => [k, ESCOLHAS_MOTOR[motores[k]] ? motores[k] : (e.motores?.[k] || '')]));
  if (e.estado === 'vazia') e.fora_de_ordem = false; else if (vazias.length && forcar) e.fora_de_ordem = true;
  e.atualizado_em = agora; e.atualizado_por = usuario || null;
  if (novoEstado === 'validada' && R.etapas[q.n].estado !== 'validada') { e.validado_em = agora; e.validado_por = usuario || null; }
  if (novoEstado !== 'validada') { e.validado_em = null; e.validado_por = null; }
  if (!e.data && novoEstado !== 'vazia') e.data = hojeBR();
  R.etapas[q.n] = e; R.atualizado_em = agora;
  return R;
}

export function roteiroResumoTexto(r) {
  const R = roteiroNormalizar(r), V = PERGUNTAS.filter(q => R.etapas[q.n].estado === 'validada');
  if (!V.length) return '';
  return ['ROTEIRO ESTRATÉGICO 2027–2031 — respostas VALIDADAS pelo fundador (parta delas):', ...V.map(q => { const e = R.etapas[q.n];
    return `${q.n}. ${q.titulo} ${e.resposta.replace(/\s+/g, ' ').substring(0, 600)}${e.motores ? ' [motores: ' + Object.entries(e.motores).map(([k, v]) => k + '=' + (v || '?')).join(', ') + ']' : ''}`; })].join('\n');
}

// ── o que NÃO fazer ──
const STOP = new Set('para pela pelo pelos pelas como mais menos sobre entre quando onde que qual quais nosso nossa nossos nossas esse essa este esta isso isto aquele aquela fazer feito ainda nunca sempre muito pouco cada todo toda todos todas outro outra outros outras seus suas dele dela eles elas uma umas uns algum alguma nenhum nenhuma tambem porque assim apenas pode podem deve devem sera serao seja sejam ter tem temos tenho com sem nao sim por dos das nos nas aos sua seu lhe ser estar vamos vai voce vocês voces atlantyx empresa cliente clientes'.split(' '));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = s => [...new Set(norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.replace(/(oes|aes|ais|eis|res|s)$/, '')))];

export function naoFazerNormalizar(lista) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).slice(0, 60).map(x => {
    let id = String(x.id || '').replace(/[^a-z0-9_-]/gi, '').substring(0, 24) || ('nf_' + Math.random().toString(36).slice(2, 9)); while (vistos.has(id)) id += 'x'; vistos.add(id);
    return { id, texto: txt(x.texto, 300).trim(), motivo: txt(x.motivo, 600), motor: MOTORES_R[x.motor] ? x.motor : 'geral', data: dia(x.data) || hojeBR(),
      palavras: (Array.isArray(x.palavras) ? x.palavras : String(x.palavras || '').split(',')).map(p => txt(p, 40).trim()).filter(Boolean).slice(0, 12),
      origem: txt(x.origem, 120), ativo: x.ativo !== false, criado_por: x.criado_por || null, criado_em: x.criado_em || null };
  }).filter(x => x.texto);
}

// "parece contrariar": termo-chave do "não" (palavras informadas) aparece na demanda, ou 2+ palavras do texto do "não" aparecem
export function naoFazerChecar(lista, texto) {
  const T = new Set(tokens(texto)), alvo = norm(texto); if (!T.size) return [];
  return naoFazerNormalizar(lista).filter(x => x.ativo).map(x => {
    const chaves = x.palavras.filter(p => p.length >= 3 && alvo.includes(norm(p)));
    const comuns = tokens(x.texto).filter(w => T.has(w));
    return chaves.length || comuns.length >= 2 ? { id: x.id, texto: x.texto, motivo: x.motivo, motor: x.motor, termos: [...new Set([...chaves, ...comuns])].slice(0, 6), forca: chaves.length ? 'alta' : comuns.length >= 3 ? 'media' : 'baixa' } : null;
  }).filter(Boolean).sort((a, b) => ({ alta: 0, media: 1, baixa: 2 })[a.forca] - ({ alta: 0, media: 1, baixa: 2 })[b.forca]).slice(0, 5);
}
export function naoFazerResumoTexto(lista) {
  const L = naoFazerNormalizar(lista).filter(x => x.ativo); if (!L.length) return '';
  return ['O QUE A ATLANTYX DECIDIU NÃO FAZER (renúncias do fundador — não proponha nada que contrarie sem apontar o conflito):', ...L.map(x => `- ${x.texto}${x.motivo ? ' (motivo: ' + x.motivo.substring(0, 160) + ')' : ''}${x.motor !== 'geral' ? ' [' + x.motor + ']' : ''}`)].join('\n');
}

// ── calendário de revisão ──
export const CHECKLIST_REVISAO = [
  ['mercado', 'Concorrência e mercado revistos'], ['socios', 'Conversa de sócios feita'], ['historia', 'História e maus hábitos revistos'],
  ['comunicacao', 'Estratégia comunicada para 100% da empresa'], ['orcamento', 'Orçamento do ano seguinte montado'],
];
export const GATILHOS = { mercado: 'Mudança grande de mercado ou tecnologia', cliente: 'Ganho ou perda de cliente-âncora', socio: 'Entrada ou saída de sócio', aquisicao: 'Aquisição de concorrente relevante', outro: 'Outro' };

export function calendarioGerar(estado = {}, hoje = hojeBR()) {
  const S = estado?.eventos || {}, ev = [], add = (id, tipo, data, titulo, desc) => ev.push({ id, tipo, data, titulo, descricao: desc });
  for (let y = HORIZONTE.inicio - 1; y <= HORIZONTE.fim; y++) {
    if (y >= HORIZONTE.inicio) {
      add(`checkin-${y}-1`, 'checkin', `${y}-01-20`, `Check-in trimestral · fechamento do 4º tri de ${y - 1}`, 'Indicadores do trimestre contra as metas; ajustes táticos sem mudar a direção de 5 anos.');
      add(`checkin-${y}-2`, 'checkin', `${y}-04-20`, `Check-in trimestral · 1º tri de ${y}`, 'Indicadores do trimestre contra as metas.');
      add(`orcamento-revisao-${y}`, 'orcamento_revisao', `${y}-06-15`, `Revisão do orçamento · 2º semestre de ${y}`, 'Realizado × previsto do 1º semestre, caixa e margem por motor, verba de marketing e contratações; realocar sem mudar a direção.');
      add(`checkin-${y}-3`, 'checkin', `${y}-07-20`, `Check-in trimestral · 2º tri de ${y}`, 'Indicadores do trimestre contra as metas.');
      add(`checkin-${y}-4`, 'checkin', `${y}-10-20`, `Check-in trimestral · 3º tri de ${y}`, 'Indicadores do trimestre contra as metas; prepara a revisão anual.');
    }
    if (y < HORIZONTE.fim) {
      add(`revisao-${y}`, 'revisao_anual', `${y}-11-15`, `Revisão estratégica anual · plano de ${y + 1}`, 'Revisão do 4º trimestre: confere a estratégia de 5 anos e refaz o plano do ano seguinte.');
      add(`orcamento-aprovacao-${y}`, 'orcamento_aprovacao', `${y}-12-10`, `Aprovação do orçamento · 1º semestre de ${y + 1}`, 'Orçamento do semestre (e a visão do ano) aprovado pelo fundador.');
    } else add(`revisao-${y}`, 'revisao_anual', `${y}-11-15`, `Revisão do ciclo ${HORIZONTE.inicio}–${HORIZONTE.fim} e novo horizonte de 5 anos`, 'Fecha o ciclo e escolhe a estratégia dos próximos 5 anos.');
  }
  ev.sort((a, b) => a.data.localeCompare(b.data));
  const d = s => Date.parse(s + 'T12:00:00Z'), H = d(hoje);
  for (const e of ev) {
    const st = S[e.id] || {}; e.feito = !!st.feito; e.realizado_em = dia(st.realizado_em); e.notas = txt(st.notas, 1500);
    if (e.tipo === 'revisao_anual') e.checklist = CHECKLIST_REVISAO.map(([k, t]) => ({ chave: k, texto: t, ok: !!st.checklist?.[k] }));
    const dias = Math.round((d(e.data) - H) / 864e5);
    e.status = e.feito ? 'feito' : dias < 0 ? 'atrasado' : dias <= 45 ? 'proximo' : 'futuro'; e.dias = dias;
  }
  const gat = (Array.isArray(estado?.gatilhos) ? estado.gatilhos : []).map(g => ({ id: g.id, tipo: GATILHOS[g.tipo] ? g.tipo : 'outro', descricao: txt(g.descricao, 600), data: dia(g.data) || null, resolvido: !!g.resolvido, decisao: txt(g.decisao, 600), por: g.por || null }));
  const abertos = gat.filter(g => !g.resolvido);
  const atrasados = ev.filter(e => e.status === 'atrasado' && d(e.data) >= d(`${HORIZONTE.inicio - 1}-01-01`));
  return { eventos: ev, gatilhos: gat, revisao_antecipada: abertos.length > 0, proximo: ev.find(e => !e.feito && e.dias >= 0) || null, atrasados: atrasados.length,
    regras: { revisao_anual: '4º trimestre (alvo: 15/11)', orcamento: 'aprovação em dezembro, revisão em junho', checkins: 'trimestrais (dia 20 do mês seguinte ao trimestre)' } };
}

export function calendarioAplicar(estado = {}, { evento_id, feito, realizado_em, notas, checklist, gatilho, gatilho_resolver } = {}, usuario) {
  const E = { eventos: { ...(estado?.eventos || {}) }, gatilhos: [...(Array.isArray(estado?.gatilhos) ? estado.gatilhos : [])] };
  if (evento_id) {
    if (!calendarioGerar({}).eventos.some(e => e.id === evento_id)) throw erro('Evento do calendário inválido');
    const s = { ...(E.eventos[evento_id] || {}) };
    if (feito !== undefined) { s.feito = !!feito; s.realizado_em = feito ? (dia(realizado_em) || hojeBR()) : null; }
    if (notas !== undefined) s.notas = txt(notas, 1500);
    if (checklist && typeof checklist === 'object') s.checklist = { ...(s.checklist || {}), ...Object.fromEntries(CHECKLIST_REVISAO.map(([k]) => [k, checklist[k] === undefined ? !!s.checklist?.[k] : !!checklist[k]])) };
    s.por = usuario || null; s.em = new Date().toISOString(); E.eventos[evento_id] = s;
  }
  if (gatilho) {
    if (!String(gatilho.descricao || '').trim()) throw erro('Descreva o que aconteceu');
    E.gatilhos.unshift({ id: 'g_' + Date.now().toString(36), tipo: GATILHOS[gatilho.tipo] ? gatilho.tipo : 'outro', descricao: txt(gatilho.descricao, 600), data: dia(gatilho.data) || hojeBR(), resolvido: false, por: usuario || null });
    E.gatilhos = E.gatilhos.slice(0, 40);
  }
  if (gatilho_resolver?.id) E.gatilhos = E.gatilhos.map(g => g.id === gatilho_resolver.id ? { ...g, resolvido: true, decisao: txt(gatilho_resolver.decisao, 600), resolvido_em: hojeBR() } : g);
  return E;
}

// ── orçamento semestral ──
export const semestres = () => { const L = []; for (let y = HORIZONTE.inicio; y <= HORIZONTE.fim; y++) L.push(`${y}-S1`, `${y}-S2`); return L; };
export const semestreDatas = s => { const [y, h] = String(s).split('-'); return h === 'S1' ? { ini: `${y}-01-01`, fim: `${y}-06-30` } : { ini: `${y}-07-01`, fim: `${y}-12-31` }; };
export const semestreAtual = (hoje = hojeBR()) => { const y = Math.max(HORIZONTE.inicio, Math.min(HORIZONTE.fim, parseInt(hoje))); if (parseInt(hoje) < HORIZONTE.inicio) return `${HORIZONTE.inicio}-S1`; return `${y}-${+hoje.substring(5, 7) <= 6 ? 'S1' : 'S2'}`; };
const n0 = v => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? Math.round(x) : null; };
const pct = v => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? Math.max(-100, Math.min(100, Math.round(x * 10) / 10)) : null; };

export function orcamentoNormalizar(o = {}) {
  const P = o.previsto || {}, M = o.realizado_manual || {};
  return { previsto: { receita: Object.fromEntries(Object.keys(MOTORES_R).map(k => [k, n0(P.receita?.[k])])), mc_pct: Object.fromEntries(Object.keys(MOTORES_R).map(k => [k, pct(P.mc_pct?.[k])])),
      caixa_minimo: n0(P.caixa_minimo), verba_marketing: n0(P.verba_marketing), contratacoes: n0(P.contratacoes) },
    realizado_manual: { verba_marketing: n0(M.verba_marketing), contratacoes: n0(M.contratacoes), caixa: n0(M.caixa) },
    status: ['rascunho', 'aprovado', 'revisado'].includes(o.status) ? o.status : 'rascunho', notas: txt(o.notas, 2000),
    aprovado_em: o.aprovado_em || null, aprovado_por: o.aprovado_por || null, revisado_em: o.revisado_em || null, revisado_por: o.revisado_por || null, atualizado_em: o.atualizado_em || null, origem: txt(o.origem, 200) };
}

// sugestão a partir da projeção salva (metade da receita do ano por motor; MC do ano). Só sugestão: o fundador edita e aprova.
export function orcamentoSugerido(proj, semestre) {
  const y = parseInt(semestre), base = proj?.cenarios?.base || [], l = base.find(x => x.ano === y), prem = (proj?.premissas?.anos || []).find(a => a.ano === y);
  if (!l) return null;
  return orcamentoNormalizar({ previsto: { receita: Object.fromEntries(Object.keys(MOTORES_R).map(k => [k, (l.por_motor?.[k] || 0) / 2])), mc_pct: prem?.mc_pct || {}, caixa_minimo: null, verba_marketing: null, contratacoes: null },
    origem: `Projeção 5 anos (cenário base, ${y} ÷ 2)` });
}
