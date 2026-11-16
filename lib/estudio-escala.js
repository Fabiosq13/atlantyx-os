// v3.523 — Estúdio de Produtos e Esteira, fase 5: teste de escala (7 perguntas) e catálogo versionado.
// A IA/sistema só sugere; a decisão é do fundador. Catálogo congelado: produto novo ou alteração de produto ativo exige proposta aprovada.
import { calcular, premissasNormalizar, K_PREMISSAS, K_PRODUTOS, K_ESTEIRAS } from './estudio-produtos.js';
export const K_PROPOSTAS = 'sim:propostas', K_CATALOGO = 'sim:catalogo_versoes';
const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const PERGUNTAS = [
  { id: 'q1', t: 'Quantos clientes do perfil ideal repetem essa demanda? (Pedido isolado ou de 3 clientes não aprova.)' },
  { id: 'q2', t: 'A margem fica no piso depois de todos os custos do degrau?' },
  { id: 'q3', t: 'Exige equipe, CAPEX ou OPEX novos? Qual o custo e quando se paga? (Dinheiro caro: se derruba a margem abaixo do piso, recusar ou encaminhar.)' },
  { id: 'q4', t: 'Cabe na capacidade atual sem passar do limite de ocupação?' },
  { id: 'q5', t: 'Está ligada a uma esteira (qual degrau, qual gatilho, qual efeito no CAC)?' },
  { id: 'q6', t: 'Tem dono e um critério de sucesso e de parada?' },
  { id: 'q7', t: 'O catálogo já está no limite de produtos definido para 2027? Se sim, qual produto sai ou pausa?' } ];
const OK = new Set(['sim', 'nao', 'parcial']);

// O sistema preenche o que consegue pelos dados e marca a origem; o fundador pode sobrescrever.
export function preencher(prop, produtos, esteiras, prem, catalogoAtivos) {
  const P = premissasNormalizar(prem), R = { ...(prop.respostas || {}) }, auto = (id, resposta, texto) => { if (!R[id] || R[id].origem === 'sistema' || !R[id].resposta) R[id] = { resposta, texto, origem: 'sistema' }; };
  const n = num(prop.n_clientes_repetem), p = (produtos || []).find(x => x.id === prop.produto_id);
  if (n != null) auto('q1', n > 3 || prop.contrato_paga_equipe ? 'sim' : 'nao', n + ' cliente(s) do perfil repetem' + (prop.contrato_paga_equipe ? '; contrato paga a equipe com margem' : n <= 3 ? ' — 3 ou menos não aprova, salvo contrato que pague a equipe' : ''));
  if (p) { const c = calcular(p, P); auto('q2', c.semaforo === 'verde' || c.semaforo === 'amarelo' ? (c.semaforo === 'verde' ? 'sim' : 'parcial') : (c.semaforo === 'vermelho' ? 'nao' : null) || 'parcial', c.motivo + ' · ' + c.tipo_margem);
    const inv = (num(p.capex_horas) || 0) + (num(p.opex_mensal) || 0); auto('q3', inv > 0 ? (c.semaforo === 'vermelho' ? 'nao' : 'parcial') : 'sim', inv > 0 ? 'Há investimento: ' + (p.capex_horas || 0) + ' h de desenvolvimento e R$ ' + (p.opex_mensal || 0) + '/mês de custo fixo' + (c.semaforo === 'vermelho' ? ' — dinheiro caro (margem abaixo do piso)' : '') : 'Sem CAPEX/OPEX informado');
    const st = (esteiras || []).find(e => Object.values(e.degraus || {}).includes(p.id)); auto('q5', st ? 'sim' : 'nao', st ? 'Está na esteira "' + st.nome + '"' : 'Não está em nenhuma esteira'); }
  const max = num(P.catalogo_max_produtos); if (max != null) auto('q7', catalogoAtivos >= max ? 'nao' : 'sim', catalogoAtivos + ' produto(s) ativo(s) de ' + max + ' permitidos');
  const pontos = PERGUNTAS.reduce((s, q) => s + (R[q.id]?.resposta === 'sim' ? 1 : R[q.id]?.resposta === 'parcial' ? 0.5 : 0), 0), resp = PERGUNTAS.filter(q => OK.has(R[q.id]?.resposta)).length;
  const nao = id => R[id]?.resposta === 'nao';
  let sug = 'ajustar', porque = 'Faltam respostas ou há pontos parciais';
  if (resp < PERGUNTAS.length) porque = 'Responda as ' + (PERGUNTAS.length - resp) + ' pergunta(s) que faltam para uma sugestão firme';
  if (nao('q1') && nao('q2')) { sug = 'recusar'; porque = 'Pouca repetição e margem abaixo do piso'; }
  else if (nao('q3') || (nao('q2') && R.q2?.origem)) { sug = prop.parceiro_possivel ? 'parceiro' : 'recusar'; porque = 'Dinheiro caro: derruba a margem abaixo do piso' + (prop.parceiro_possivel ? ' — encaminhar a parceiro (regra validada por contador e jurídico)' : ''); }
  else if (resp === PERGUNTAS.length && pontos >= 6) { sug = 'aprovar'; porque = 'Passa nas 7 perguntas'; }
  return { respostas: R, pontuacao: pontos, respondidas: resp, sugestao: sug, sugestao_motivo: porque };
}
const ativos = L => (L || []).filter(x => x.status === 'ativo' || x.status === 'em_teste').length;
export async function propostasListar({ kv }) {
  const [L, pr, es, pm] = await Promise.all([kv(K_PROPOSTAS), kv(K_PRODUTOS), kv(K_ESTEIRAS), kv(K_PREMISSAS)]), A = ativos(pr);
  return { perguntas: PERGUNTAS, propostas: (L || []).map(x => ({ ...x, analise: preencher(x, pr || [], es || [], pm?.premissas, A) })) };
}
export async function propostaSalvar({ kv }, b, usuario) {
  const L = (await kv(K_PROPOSTAS)) || [], i = b.id ? L.findIndex(x => x.id === b.id) : -1, t = (v, m = 200) => String(v ?? '').trim().substring(0, m);
  if (i >= 0 && L[i].decisao) throw new Error('Proposta já decidida — crie outra');
  const resp = {}; for (const q of PERGUNTAS) { const r = b.respostas?.[q.id]; if (r && OK.has(r.resposta)) resp[q.id] = { resposta: r.resposta, texto: t(r.texto, 400), origem: r.origem === 'sistema' && !r.editado ? 'sistema' : 'fundador' }; }
  const x = { id: i >= 0 ? L[i].id : 'prp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), titulo: t(b.titulo), descricao: t(b.descricao, 800), produto_id: b.produto_id || null, n_clientes_repetem: num(b.n_clientes_repetem), contrato_paga_equipe: !!b.contrato_paga_equipe, parceiro_possivel: !!b.parceiro_possivel, dono: t(b.dono), criterio_sucesso: t(b.criterio_sucesso, 400), criterio_parada: t(b.criterio_parada, 400), respostas: resp, decisao: null, autor: usuario || null, em: new Date().toISOString(), historico: i >= 0 ? L[i].historico || [] : [] };
  if (!x.titulo) throw new Error('Dê um título à proposta'); if (x.dono && x.criterio_sucesso && x.criterio_parada && !x.respostas.q6) x.respostas.q6 = { resposta: 'sim', texto: 'Dono ' + x.dono + ' com critérios de sucesso e de parada', origem: 'sistema' };
  x.historico.push({ em: x.em, por: usuario || null, evento: i >= 0 ? 'editada' : 'criada' }); if (i >= 0) L[i] = x; else L.push(x); await kv(K_PROPOSTAS, L); return propostasListar({ kv });
}
export async function propostaDecidir({ kv }, b, usuario) {
  const L = (await kv(K_PROPOSTAS)) || [], x = L.find(y => y.id === b.id); if (!x) throw new Error('Proposta não encontrada');
  if (!['aprovar', 'ajustar', 'recusar', 'parceiro'].includes(b.decisao)) throw new Error('Decisão inválida');
  if (x.decisao) throw new Error('Proposta já decidida'); const em = new Date().toISOString();
  x.decisao = b.decisao; x.decidido_por = usuario || null; x.decidido_em = em; x.decisao_motivo = String(b.motivo ?? '').substring(0, 400); x.historico.push({ em, por: usuario || null, evento: 'decisão: ' + b.decisao + (x.decisao_motivo ? ' — ' + x.decisao_motivo : '') });
  await kv(K_PROPOSTAS, L); return propostasListar({ kv });
}
// ── catálogo ──
export async function catalogoObter({ kv }) {
  const [V, pr, es] = await Promise.all([kv(K_CATALOGO), kv(K_PRODUTOS), kv(K_ESTEIRAS)]), L = V || [], vig = L.filter(x => x.tipo !== 'descongelado').at(-1);
  const congelado = !!L.length && L.at(-1).tipo === 'congelado';
  const emTrabalho = (pr || []).filter(x => x.status !== 'pausado');
  return { congelado, versao_vigente: vig ? { versao: vig.versao, em: vig.em, aprovador: vig.aprovador, produtos: vig.produtos.length, esteiras: vig.esteiras.length } : null, versoes: L.map(x => ({ versao: x.versao, tipo: x.tipo, em: x.em, aprovador: x.aprovador, produtos: x.produtos?.map(p => ({ nome: p.nome, preco: p.preco, degrau: p.degrau, publico: p.publico })) || [], esteiras: x.esteiras?.map(e => e.nome) || [], motivo: x.motivo || '' })),
    atuais: emTrabalho.map(p => ({ id: p.id, nome: p.nome, status: p.status, degrau: p.degrau })), pausados: (pr || []).filter(x => x.status === 'pausado').map(p => p.nome) };
}
export async function catalogoCongelar({ kv }, b, usuario) {
  const [V, pr, es] = await Promise.all([kv(K_CATALOGO), kv(K_PRODUTOS), kv(K_ESTEIRAS)]), L = V || [];
  const prods = (pr || []).filter(x => x.status === 'ativo' || x.status === 'em_teste'); if (!prods.length) throw new Error('Marque ao menos um produto como Ativo ou Em teste antes de congelar');
  L.push({ versao: L.filter(x => x.tipo === 'congelado').length + 1, tipo: 'congelado', em: new Date().toISOString(), aprovador: usuario || null, motivo: String(b.motivo ?? '').substring(0, 300), produtos: prods, esteiras: es || [] }); await kv(K_CATALOGO, L); return catalogoObter({ kv });
}
export async function catalogoDescongelar({ kv }, b, usuario) {
  const L = (await kv(K_CATALOGO)) || []; if (!L.length || L.at(-1).tipo !== 'congelado') throw new Error('O catálogo não está congelado');
  L.push({ versao: L.at(-1).versao, tipo: 'descongelado', em: new Date().toISOString(), aprovador: usuario || null, motivo: String(b.motivo ?? '').substring(0, 300) || 'descongelado pelo fundador', produtos: [], esteiras: [] }); await kv(K_CATALOGO, L); return catalogoObter({ kv });
}
// Com o catálogo congelado, produto novo ou alteração de produto ativo exige proposta aprovada (consumida uma vez).
export async function exigirProposta({ kv }, b, produtoAtual) {
  const cat = await catalogoObter({ kv }); if (!cat.congelado) return;
  const novo = !produtoAtual, ativo = produtoAtual && (produtoAtual.status === 'ativo' || produtoAtual.status === 'em_teste'); if (!novo && !ativo) return;
  const L = (await kv(K_PROPOSTAS)) || [], x = L.find(y => y.id === b.proposta_id && y.decisao === 'aprovar' && !y.usada_em);
  if (!x) throw new Error('Catálogo congelado: ' + (novo ? 'produto novo' : 'alterar produto ativo') + ' exige uma proposta aprovada no Teste de escala (informe a proposta ou descongele)');
  x.usada_em = new Date().toISOString(); x.historico.push({ em: x.usada_em, por: null, evento: 'usada para ' + (novo ? 'criar' : 'alterar') + ' produto' }); await kv(K_PROPOSTAS, L);
}
