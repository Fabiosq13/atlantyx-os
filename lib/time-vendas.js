// lib/time-vendas.js — v3.601 · TIME DE VENDAS VIRTUAL: agentes por função que trabalham o funil lendo o Playbook (o Norte).
// REGRA DESTA VERSÃO: NADA É ENVIADO. Cada agente só PREPARA (abordagem, e-mail, convite, briefing, proposta) e coloca na FILA DE APROVAÇÃO.
// Aprovam: Patricia (funil WX), Ademir (funil padrão) e o CEO (tudo). A chave "autorização de envio" por agente existe, é só do CEO e nasce DESLIGADA;
// mesmo ligada, esta versão não tem remetente automático — ela só guarda a decisão e as travas (podeEnviarAuto) para a fase seguinte.
// Armazenamento sem DDL (kv_store): vendas:time:fila · vendas:time:cfg · vendas:time:log
import * as PB from './playbook.js';
import { ehWX, VENDEDORES } from './floresta-email.js';
import { funilDoLogin } from './floresta-acesso.js';

export const K_FILA = 'vendas:time:fila', K_CFG = 'vendas:time:cfg', K_LOG = 'vendas:time:log';
const erro = (m, status = 400) => Object.assign(new Error(m), { status });
const txt = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const bloco = (s, n) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);

// Os agentes. "etapas" = colunas da Floresta de Vendas em que cada um trabalha; "funil" = id usado no Playbook (briefingVendas).
export const AGENTES = [
  { id: 'prospector', nome: 'Prospector', cargo: 'Pesquisador de contas (SDR outbound)', funil: 'prospector', etapas: ['frio', 'frio_qualificado'], canal: 'interno', tipo: 'ficha', exige: [], max: 5,
    missao: 'Para cada contato frio do público-alvo, definir a vertical, o decisor e o melhor ângulo de entrada, e escrever a ficha curta que o SDR vai usar.', formato: 'Ficha: quem é, por que agora (gatilho), ângulo recomendado e o canal certo. Sem texto de venda.' },
  { id: 'iara', nome: 'IARA', cargo: 'SDR de WhatsApp', funil: 'iara', etapas: ['iara'], canal: 'whatsapp', tipo: 'mensagem', exige: ['telefone'], max: 5,
    missao: 'Abrir conversa por WhatsApp com o ângulo da vertical; uma pergunta no fim; sem proposta.', formato: 'Mensagem de WhatsApp de até 3 frases, tom humano, sem assunto.' },
  { id: 'sdr_email', nome: 'SDR de e-mail', cargo: 'SDR de e-mail', funil: 'sdr_email', etapas: ['abordagem_email', 'abordado'], canal: 'email', tipo: 'email', exige: ['email'], max: 5,
    missao: 'Abordar por e-mail quem não tem WhatsApp ou não respondeu; ângulo diferente do toque anterior.', formato: 'Assunto curto (até 7 palavras), específico da empresa. Corpo de 90 a 130 palavras, um único pedido no fim.' },
  { id: 'sdr_voz', nome: 'SDR de voz', cargo: 'SDR de ligação', funil: 'sdr_email', etapas: ['ligacao'], canal: 'voz', tipo: 'roteiro', exige: ['telefone'], max: 4,
    missao: 'Preparar o roteiro da ligação: abertura de 10 segundos, pergunta de descoberta, resposta às duas objeções mais prováveis e como pedir a reunião.', formato: 'Roteiro em tópicos curtos.' },
  { id: 'qualificador', nome: 'Qualificador', cargo: 'SDR de qualificação', funil: 'qualificador', etapas: ['engajado'], canal: 'email', tipo: 'email', exige: ['email'], max: 5,
    missao: 'Quem respondeu ou veio de campanha: confirmar dor, momento, decisor e orçamento com 2 ou 3 perguntas objetivas.', formato: 'E-mail curto de resposta com as perguntas de qualificação.' },
  { id: 'agendador', nome: 'Agendador', cargo: 'Agendador de reuniões', funil: 'agendador', etapas: ['qualificado'], canal: 'email', tipo: 'convite', exige: ['email'], max: 5,
    missao: 'Lead quente que ainda não marcou: convidar para a reunião, propondo janelas da agenda do vendedor e facilitando o aceite.', formato: 'E-mail de convite com 2 janelas de horário e o objetivo da reunião em 1 frase.' },
  { id: 'preparador', nome: 'Preparador de reunião', cargo: 'Pré-vendas', funil: 'preparador', etapas: ['reuniao'], canal: 'interno', tipo: 'briefing', exige: [], max: 4,
    missao: 'Briefing para o vendedor antes da reunião: empresa, decisor, dor provável, ângulo que funcionou, perguntas de descoberta e o que NÃO dizer.', formato: 'Briefing em tópicos, no máximo 12 linhas.' },
  { id: 'proposta', nome: 'Analista de proposta', cargo: 'Pré-vendas / propostas', funil: 'proposta', etapas: ['proposta'], canal: 'email', tipo: 'follow_proposta', exige: ['email'], max: 3,
    missao: 'Para negócio em proposta: e-mail de acompanhamento e a lista de pontos que a proposta precisa cobrir (dor, resultado, escopo, prazo). Preço só do rate card e da política comercial; nunca inventar valor.', formato: 'E-mail de acompanhamento curto + lista "Pontos da proposta".' },
  { id: 'closer', nome: 'Closer', cargo: 'Executivo de contas (fechamento)', funil: 'closer', etapas: ['negociacao'], canal: 'email', tipo: 'email', exige: ['email'], max: 3,
    missao: 'Conduzir a negociação: tratar a objeção mais provável com a resposta do Playbook e propor o próximo passo com data.', formato: 'E-mail curto + "Plano de objeções" em 3 tópicos.' },
  { id: 'cs', nome: 'Sucesso do cliente', cargo: 'Customer Success', funil: 'cs', etapas: ['cliente'], canal: 'email', tipo: 'email', exige: ['email'], max: 3,
    missao: 'Cliente ativo: check-in de valor, abrir expansão e pedir indicação, sem soar como venda.', formato: 'E-mail curto, tom de parceria.' },
  { id: 'remarketing', nome: 'Remarketing', cargo: 'Reativação', funil: 'remarketing', etapas: ['remarketing', 'congelado', 'perdido'], canal: 'email', tipo: 'email', exige: ['email'], max: 5,
    missao: 'Reativar quem esfriou com ângulo e gatilho novos; reconhecer o silêncio sem cobrar.', formato: 'E-mail curto com um motivo novo para voltar a falar.' },
  { id: 'gerente', nome: 'Gerente de vendas', cargo: 'Sales ops', funil: 'closer', etapas: [], canal: 'interno', tipo: 'relatorio', exige: [], max: 0,
    missao: 'Olhar o funil inteiro: onde está parado, quais agentes têm fila, o que está sem aprovação há mais de 2 dias.', formato: 'Resumo numérico (sem IA).' },
];
export const agentePorId = id => AGENTES.find(a => a.id === id) || null;

export const CFG_PADRAO = { autoenvio: {}, desligar_tudo: false, rodar_automatico: false, janela_reuniao: 'quartas e quintas, entre 10h30 e 12h', limites: { por_agente_rodada: 5, total_rodada: 30, repetir_apos_dias: 7, envio_dia: 20, hora_ini: 8, hora_fim: 18 } };
export function cfgNormalizar(c = {}) {
  const L = { ...CFG_PADRAO.limites, ...(c.limites || {}) }, n = (v, d, mi, ma) => { v = Number(v); return Number.isFinite(v) ? Math.min(ma, Math.max(mi, Math.round(v))) : d; };
  const auto = {}; for (const a of AGENTES) auto[a.id] = !!(c.autoenvio && c.autoenvio[a.id] === true);
  return { autoenvio: auto, desligar_tudo: c.desligar_tudo === true, rodar_automatico: c.rodar_automatico === true, janela_reuniao: txt(c.janela_reuniao || CFG_PADRAO.janela_reuniao, 120),
    limites: { por_agente_rodada: n(L.por_agente_rodada, 5, 1, 10), total_rodada: n(L.total_rodada, 30, 1, 60), repetir_apos_dias: n(L.repetir_apos_dias, 7, 1, 60), envio_dia: n(L.envio_dia, 20, 1, 100), hora_ini: n(L.hora_ini, 8, 0, 23), hora_fim: n(L.hora_fim, 18, 1, 24) } };
}

// ── Quem aprova ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const funilDoCard = c => (ehWX(c) ? 'wx' : 'padrao');
export const responsavel = funil => (funil === 'wx' ? VENDEDORES.wx.nome : VENDEDORES.padrao.nome);
// admin (CEO) aprova tudo; Patricia só o WX; Ademir só o padrão; os demais não aprovam
export function podeDecidir(item, login, admin, mapaFunil = {}) { if (admin) return true; const f = funilDoLogin(login, mapaFunil); return !!f && f === item.funil; }
export const funilVisivel = (login, admin, mapaFunil = {}) => (admin ? null : (funilDoLogin(login, mapaFunil) || 'nenhum'));

// ── Travas do envio automático (só avaliação; esta versão não envia) ─────────────────────────────────────────────────
// Devolve { ok, motivos[] }. Qualquer trava barra. Usada quando o CEO liberar o envio numa fase futura.
export function podeEnviarAuto({ cfg, agente, item, agora = new Date(), enviadosHoje = 0, contato = {} }) {
  const c = cfgNormalizar(cfg), m = [];
  if (c.desligar_tudo) m.push('chave geral desligada');
  if (!c.autoenvio[agente]) m.push('autorização de envio desligada para este agente');
  if (!item || item.estado !== 'aprovado') m.push('item não aprovado por uma pessoa');
  if (contato.sem_consentimento || contato.nao_perturbe) m.push('contato sem consentimento ou pediu para não receber');
  if (contato.respondeu) m.push('o contato já respondeu (parar a cadência)');
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(agora)), dow = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).format(agora);
  if (['Sat', 'Sun'].includes(dow) || h < c.limites.hora_ini || h >= c.limites.hora_fim) m.push('fora do horário comercial');
  if (enviadosHoje >= c.limites.envio_dia) m.push('limite diário de envios atingido');
  if (!item?.copia_contato) m.push('sem cópia para a caixa do vendedor');
  return { ok: m.length === 0, motivos: m };
}

// ── Escolha dos leads e do ângulo ────────────────────────────────────────────────────────────────────────────────────
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function verticalDoCard(pb, c) {
  const alvo = norm([c.setor, c.empresa, c.nome_setor].filter(Boolean).join(' ')), vs = pb.verticais.filter(v => v.status !== 'pausada'); let melhor = null, pts = 0;
  for (const v of vs) { const ws = norm(v.nome + ' ' + v.id).split(/[^a-z0-9]+/).filter(w => w.length > 3); const s = ws.filter(w => alvo.includes(w)).length; if (s > pts) { pts = s; melhor = v; } }
  return melhor || vs.slice().sort((a, b) => (b.peso || 0) - (a.peso || 0))[0] || null;
}
export function anguloDoCard(v, c, itensDoCard = []) {
  const usados = new Set(itensDoCard.map(i => i.angulo)), ativos = (v?.angulos || []).filter(a => a.status === 'ativo'), livres = ativos.filter(a => !usados.has(a.angulo_id));
  const lista = livres.length ? livres : ativos; if (!lista.length) return null;
  let h = 0; for (const ch of String(c.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return lista[h % lista.length];
}
const temCanal = (c, exige) => exige.every(x => (x === 'telefone' ? !!(c.telefone || c.tel) : x === 'email' ? !!c.email : true));

export function candidatos(agente, cards, fila, cfg, { funil = null, agora = Date.now(), ids = null } = {}) {
  const corte = agora - cfg.limites.repetir_apos_dias * 864e5;
  const ocupado = new Set(fila.filter(i => i.agente === agente.id && (['pendente', 'aprovado'].includes(i.estado) || (!ids && Date.parse(i.criado_em) >= corte))).map(i => i.card_id));   // v3.655: pedido explícito (ids) pode refazer um rejeitado sem esperar os 7 dias
  return cards.filter(c => agente.etapas.includes(c.etapa) && !ocupado.has(String(c.id)) && temCanal(c, agente.exige) && !c.excluido && (!funil || funilDoCard(c) === funil) && (!ids || ids.has(String(c.id))))
    .sort((a, b) => (b.decisor ? 1 : 0) - (a.decisor ? 1 : 0) || (b.dias_na_etapa || 0) - (a.dias_na_etapa || 0)).slice(0, Math.min(agente.max, cfg.limites.por_agente_rodada));
}

// ── Geração com IA ───────────────────────────────────────────────────────────────────────────────────────────────────
function jsonDe(t) { const s = String(t || '').replace(/```json|```/g, ''), i = s.indexOf('['), j = s.lastIndexOf(']'); if (i < 0 || j < i) throw new Error('A IA não devolveu a lista'); return JSON.parse(s.slice(i, j + 1)); }
const limpaNome = s => String(s || '').replace(/\b(cpfl|enel|jelta|caixa capitaliza[cç][aã]o)\b/gi, 'um cliente do setor');
export function montarPrompt(agente, pb, lote, cfg) {
  const SYS = `Você é ${agente.nome} (${agente.cargo}) do time de vendas virtual da Atlantyx, empresa brasileira de IA, dados e engenharia de dados que vende resultado para diretoria e TI de empresas médias e grandes. Português do Brasil, frases curtas, tom de colega experiente, sem jargão e sem exagero.
MISSÃO: ${agente.missao}
FORMATO: ${agente.formato}
REGRAS: tudo que você escrever será REVISADO por uma pessoa antes de qualquer envio. Nunca invente número, estatística, caso, cliente, preço, prazo ou compromisso; nunca cite clientes reais por nome (use "um cliente do setor"); só afirme o que está nos dados do lead e no Playbook; sem promessa de resultado; sem pressão. Uma única chamada para ação por texto. Se faltar dado para escrever bem, diga isso em "racional" e escreva o mais simples possível.
Janela de reunião do vendedor: ${cfg.janela_reuniao}.
${PB.briefingVendas(pb, agente.funil)}${agente.canal === 'email' ? `
E-MAIL SOB MEDIDA (v3.655) — o leitor é diretor, VP ou dono de empresa. Regras do texto:
1. Abra com "Olá, <primeiro nome>," (só o primeiro nome, grafia correta). Nunca "Prezado(a)", nunca "Espero que esteja bem".
2. A primeira frase fala DA EMPRESA DELE: use um fato concreto da "Pesquisa da empresa" (o que a empresa faz, um movimento recente, o momento do setor). Só use fato que esteja na pesquisa ou nos dados do lead; se a pesquisa vier vazia, fale do desafio típico do setor e do cargo, sem fingir que pesquisou.
3. Ligue esse contexto a UMA oferta da Atlantyx que faça sentido para essa empresa e esse cargo (escolha a mais aderente do Playbook: IA aplicada, análise de dados, engenharia de dados, produto ou serviço). Diga o que muda no negócio dele (decisão, custo, prazo, risco), não a tecnologia.
4. Tom de par para par: direto, sóbrio, sem adjetivo de venda, sem jargão, sem inglês desnecessário, sem bajulação. Frases curtas.
5. Um único pedido no fim: 30 minutos com o vendedor, com duas opções de janela. Assine com o nome do vendedor e "Atlantyx".
6. No "racional", diga qual fato da pesquisa você usou e por que essa oferta.` : ''}`;
  const USR = `Leads (${lote.length}). Para CADA um devolva um item. Responda SOMENTE um JSON: [{"card_id":"","assunto":"(vazio se não for e-mail/convite)","corpo":"o texto pronto","racional":"1 frase: por que este ângulo para este lead"}]\n\n` + lote.map(x => `card_id: ${x.card.id}\nNome: ${x.card.nome || '—'} · Cargo: ${x.card.cargo || '—'} · Empresa: ${limpaNome(x.card.empresa) || '—'} · Setor: ${x.card.setor || '—'}\nEtapa: ${x.card.etapa} · dias na etapa: ${x.card.dias_na_etapa ?? '—'}\nVertical: ${x.vertical?.nome || '—'} · Ângulo: ${x.angulo?.nome || '—'} — gancho: ${txt(x.angulo?.gancho, 200)} · mensagem-base: ${txt(x.angulo?.mensagem, 260)} · pedido: ${txt(x.angulo?.cta, 120)}\nHistórico de toques: ${txt(x.card.ultimo_contato || x.card.historico || 'sem registro', 200)}\nPesquisa da empresa (web): ${x.pesquisa ? txt(x.pesquisa, 900) : 'sem pesquisa disponível'}\nPrimeiro nome: ${String(x.card.nome || '').trim().split(/\s+/)[0] || '—'}\nAssinatura: ${x.vendedor}`).join('\n---\n');
  return { SYS, USR };
}

export async function gerarAgente(agente, { cards, pb, fila, cfg, claude, funil = null, agora = Date.now(), ids = null, pesquisar = null }) {
  if (agente.id === 'gerente') return { itens: [], pulados: 0 };
  const alvo = candidatos(agente, cards, fila, cfg, { funil, agora, ids }); if (!alvo.length) return { itens: [], pulados: 0 };
  const lote = alvo.map(card => { const v = verticalDoCard(pb, card), ant = fila.filter(i => i.card_id === String(card.id)); return { card, vertical: v, angulo: anguloDoCard(v, card, ant), vendedor: responsavel(funilDoCard(card)) }; });
  // v3.655: e-mail de abordagem — pesquisa cada empresa na web (domínio + nome) antes de escrever; falha de pesquisa não trava a geração
  if (agente.id === 'sdr_email' && typeof pesquisar === 'function') await Promise.all(lote.map(async x => { try { x.pesquisa = await pesquisar(x.card); } catch (_) { x.pesquisa = null; } }));
  const { SYS, USR } = montarPrompt(agente, pb, lote, cfg), saida = jsonDe(await claude(SYS, USR, 3500)), itens = [];
  for (const x of lote) {
    const r = saida.find(s => String(s.card_id) === String(x.card.id)); if (!r || !bloco(r.corpo, 4000)) continue;
    itens.push({ id: 'tv_' + agora.toString(36) + Math.random().toString(36).slice(2, 7), agente: agente.id, card_id: String(x.card.id), nome: txt(x.card.nome, 80), empresa: txt(x.card.empresa, 80), cargo: txt(x.card.cargo, 80), etapa: x.card.etapa,
      funil: funilDoCard(x.card), responsavel: x.vendedor, canal: agente.canal, tipo: agente.tipo, vertical: x.vertical?.id || null, angulo: x.angulo?.angulo_id || null, assunto: txt(r.assunto, 140), corpo: bloco(r.corpo, 4000), racional: txt(r.racional, 300), pesquisa: x.pesquisa ? txt(x.pesquisa, 900) : null,
      estado: 'pendente', criado_em: new Date(agora).toISOString(), playbook_versao: pb.versao, enviado: false, copia_contato: true });
  }
  return { itens, pulados: alvo.length - itens.length };
}

// ── Relatório do gerente (sem IA) ────────────────────────────────────────────────────────────────────────────────────
export function relatorioGerente(cards, fila, { agora = Date.now(), funil = null } = {}) {
  const cs = funil ? cards.filter(c => funilDoCard(c) === funil) : cards, f = funil ? fila.filter(i => i.funil === funil) : fila;
  const porEtapa = {}; for (const c of cs) porEtapa[c.etapa] = (porEtapa[c.etapa] || 0) + 1;
  const pend = f.filter(i => i.estado === 'pendente'), velhos = pend.filter(i => agora - Date.parse(i.criado_em) > 2 * 864e5);
  const por = {}; for (const a of AGENTES) { const l = f.filter(i => i.agente === a.id); por[a.id] = { pendente: l.filter(i => i.estado === 'pendente').length, aprovado: l.filter(i => i.estado === 'aprovado').length, rejeitado: l.filter(i => i.estado === 'rejeitado').length, enviado: l.filter(i => i.enviado).length }; }
  const dec = f.filter(i => ['aprovado', 'rejeitado'].includes(i.estado)), taxa = dec.length ? Math.round(dec.filter(i => i.estado === 'aprovado').length / dec.length * 100) : null;
  return { cards_por_etapa: porEtapa, fila_pendente: pend.length, pendentes_ha_mais_de_2_dias: velhos.length, taxa_aprovacao_pct: taxa, por_agente: por };
}

// ── Armazenamento e ações ────────────────────────────────────────────────────────────────────────────────────────────
const ler = async (kv, k, d) => { try { const v = await kv.get(k); return v ?? d; } catch (_) { return d; } };
export const lerCfg = async kv => cfgNormalizar(await ler(kv, K_CFG, {}));
export const lerFila = async kv => { const f = await ler(kv, K_FILA, []); return Array.isArray(f) ? f : []; };
async function log(kv, e) { const l = await ler(kv, K_LOG, []); await kv.set(K_LOG, [...(Array.isArray(l) ? l : []), { em: new Date().toISOString(), ...e }].slice(-300)); }

export async function estado({ kv, cards = [], login, admin, mapaFunil = {} }) {
  const funil = funilVisivel(login, admin, mapaFunil), cfg = await lerCfg(kv); let fila = await lerFila(kv);
  if (funil === 'nenhum') fila = []; else if (funil) fila = fila.filter(i => i.funil === funil);
  const pb = await PB.lerPlaybook(kv);
  return { agentes: AGENTES.map(a => ({ id: a.id, nome: a.nome, cargo: a.cargo, etapas: a.etapas, canal: a.canal, tipo: a.tipo, missao: a.missao, autoenvio: !!cfg.autoenvio[a.id] })), cfg: admin ? cfg : { ...cfg, limites: undefined }, eh_ceo: !!admin,
    fila: fila.slice().sort((a, b) => (a.estado === 'pendente' ? 0 : 1) - (b.estado === 'pendente' ? 0 : 1) || Date.parse(b.criado_em) - Date.parse(a.criado_em)).slice(0, 150),
    gerente: relatorioGerente(cards, await lerFila(kv), { funil: funil === 'nenhum' ? 'nenhum' : funil }), playbook: pb ? { versao: pb.versao, tese: pb.tese, defasado: !!pb.defasado } : null, envio_automatico_disponivel: false,
    aviso: 'Nenhum agente envia nada nesta versão: tudo vai para a fila e só sai depois de uma pessoa aprovar e enviar.' };
}

export async function rodar({ kv, cards, claude, pesquisar = null, agente = null, card_ids = null, login, admin, mapaFunil = {}, agora = Date.now() }) {
  const ids = Array.isArray(card_ids) && card_ids.length ? new Set(card_ids.map(String)) : null;   // v3.646: gera só para os cards pedidos (coluna Abordagem por e-mail)
  if (typeof claude !== 'function') throw erro('IA indisponível', 503);
  const funil = funilVisivel(login, admin, mapaFunil); if (funil === 'nenhum') throw erro('Seu acesso não inclui um funil de vendas', 403);
  const cfg = await lerCfg(kv); if (cfg.desligar_tudo) throw erro('A chave geral do time está desligada (CEO)', 409);
  const pb = await PB.lerPlaybook(kv); if (!pb) throw erro('O Playbook ainda não existe. Abra Marketing → Playbook 2027 primeiro.', 409);
  const lista = agente ? [agentePorId(agente)].filter(Boolean) : AGENTES; if (!lista.length) throw erro('Agente desconhecido');
  let fila = await lerFila(kv), novos = [], resumo = [], total = 0;
  // as etapas de cada agente não se cruzam, então rodam em paralelo (cabe no tempo da função)
  const res = await Promise.allSettled(lista.map(a => gerarAgente(a, { cards, pb, fila, cfg, claude, funil, agora, ids, pesquisar })));
  res.forEach((r, i) => { const a = lista[i];
    if (r.status === 'rejected') { resumo.push({ agente: a.id, itens: 0, erro: String(r.reason?.message || r.reason).slice(0, 160) }); return; }
    const it = r.value.itens.slice(0, Math.max(0, cfg.limites.total_rodada - total)); novos.push(...it); total += it.length; resumo.push({ agente: a.id, itens: it.length, sem_texto: r.value.pulados }); });
  if (novos.length) { fila = [...fila, ...novos].slice(-600); await kv.set(K_FILA, fila); }
  await log(kv, { tipo: 'rodada', por: login || 'rotina', novos: novos.length, resumo });
  return { novos: novos.length, resumo };
}

export async function decidir({ kv, id, decisao, motivo, assunto, corpo, login, admin, mapaFunil = {} }) {
  const fila = await lerFila(kv), it = fila.find(x => x.id === id); if (!it) throw erro('Item não encontrado', 404);
  if (!podeDecidir(it, login, admin, mapaFunil)) throw erro(`Este item é do funil ${it.funil === 'wx' ? 'WX (Patricia)' : 'padrão (Ademir)'}; você não aprova nele`, 403);
  if (it.estado !== 'pendente' && decisao !== 'reabrir') throw erro('Este item já foi decidido');
  if (decisao === 'editar') { if (!bloco(corpo, 4000)) throw erro('Texto vazio'); it.corpo = bloco(corpo, 4000); if (assunto != null) it.assunto = txt(assunto, 140); it.editado_por = login; }
  else if (decisao === 'aprovar') { if (corpo != null && bloco(corpo, 4000) && bloco(corpo, 4000) !== it.corpo) { it.corpo = bloco(corpo, 4000); it.editado_por = login; } if (assunto != null) it.assunto = txt(assunto, 140); it.estado = 'aprovado'; it.decidido_por = login; it.decidido_em = new Date().toISOString(); }
  else if (decisao === 'rejeitar') { it.estado = 'rejeitado'; it.motivo = txt(motivo, 200); it.decidido_por = login; it.decidido_em = new Date().toISOString(); }
  else if (decisao === 'reabrir') { it.estado = 'pendente'; it.decidido_por = null; it.decidido_em = null; it.enviado = false; }
  else throw erro('Decisão inválida');
  await kv.set(K_FILA, fila); await log(kv, { tipo: decisao, por: login, id, agente: it.agente }); return it;
}
// A pessoa envia por fora (e-mail/WhatsApp/telefone) e marca aqui, para o funil saber que o toque aconteceu
export async function marcarEnviado({ kv, id, login, admin, mapaFunil = {} }) {
  const fila = await lerFila(kv), it = fila.find(x => x.id === id); if (!it) throw erro('Item não encontrado', 404);
  if (!podeDecidir(it, login, admin, mapaFunil)) throw erro('Sem acesso a este funil', 403); if (it.estado !== 'aprovado') throw erro('Só item aprovado pode ser marcado como enviado');
  it.enviado = true; it.enviado_por = login; it.enviado_em = new Date().toISOString(); await kv.set(K_FILA, fila); await log(kv, { tipo: 'enviado_manual', por: login, id }); return it;
}
// Só o CEO mexe na autorização de envio, nos limites e na chave geral
export async function salvarCfg({ kv, patch = {}, login, admin }) {
  if (!admin) throw erro('Só o CEO altera a autorização de envio e os limites', 403);
  const atual = await lerCfg(kv), prox = cfgNormalizar({ ...atual, ...patch, autoenvio: { ...atual.autoenvio, ...(patch.autoenvio || {}) }, limites: { ...atual.limites, ...(patch.limites || {}) } });
  await kv.set(K_CFG, prox); await log(kv, { tipo: 'cfg', por: login, patch: JSON.stringify(patch).slice(0, 300) }); return prox;
}

// v3.652: ENVIO DIRETO de e-mail — só com clique de uma pessoa, um por vez, e só de item APROVADO (regra aprovada pelo fundador em 27/11/2026).
// "enviar" é injetado (SMTP do sistema); aqui ficam as travas: aprovado, não enviado, e-mail válido, lead não excluído, limite diário.
export async function enviarEmailItem({ kv, id, card, enviar, login, admin, mapaFunil = {}, agora = Date.now() }) {
  const fila = await lerFila(kv), it = fila.find(x => x.id === id); if (!it) throw erro('Item não encontrado', 404);
  if (!podeDecidir(it, login, admin, mapaFunil)) throw erro('Sem acesso a este funil', 403);
  if (it.canal !== 'email') throw erro('Este item não é um e-mail');
  if (it.estado !== 'aprovado') throw erro('Aprove o texto antes de enviar');
  if (it.enviado) throw erro('Este e-mail já foi enviado');
  const para = String(card?.email || '').trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) throw erro('O lead não tem e-mail válido no HubSpot');
  if (card?.excluido) throw erro('Este lead pediu para não ser contatado');
  if (!bloco(it.corpo, 4000) || !txt(it.assunto, 140)) throw erro('E-mail sem assunto ou sem texto');
  const cfg = await lerCfg(kv), hoje = new Date(agora).toISOString().slice(0, 10), nHoje = fila.filter(x => x.enviado_via === 'sistema' && String(x.enviado_em || '').slice(0, 10) === hoje).length;
  if (nHoje >= cfg.limites.envio_dia) throw erro('Limite de ' + cfg.limites.envio_dia + ' envios por dia atingido', 429);
  if (typeof enviar !== 'function') throw erro('Envio de e-mail indisponível', 503);
  const r = await enviar({ para, assunto: it.assunto, corpo: it.corpo, funil: it.funil });
  it.enviado = true; it.enviado_por = login; it.enviado_em = new Date(agora).toISOString(); it.enviado_via = 'sistema'; it.enviado_para = para;
  await kv.set(K_FILA, fila); await log(kv, { tipo: 'enviado_sistema', por: login, id, para }); return { item: it, envio: r, enviados_hoje: nHoje + 1, limite_dia: cfg.limites.envio_dia };
}
