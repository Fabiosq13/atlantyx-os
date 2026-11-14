// lib/acoes-sistema.js — v3.510 · KANBAN DE AÇÕES DO SISTEMA
// A análise de marketing (e outras) PROPÕE ações; o fundador aprova no kanban e o próprio sistema executa.
// Só executa o que está na lista fechada EXECUTORES (nada de código/URL vindo da IA). Anúncio pago nunca é criado aqui;
// posts entram só como RASCUNHO; texto de oferta e tarefas do To-do são as demais ações. Sem aprovação, nada acontece.
import crypto from 'crypto';
let _sql = null;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  return _sql;
}
const K = 'acoes:itens', MAX = 300;
async function ler() { const s = await db(); if (!s) return []; const r = (await s`SELECT value FROM kv_store WHERE key=${K}`)[0]; if (!r) return []; try { const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; return Array.isArray(v) ? v : []; } catch (_) { return []; } }
async function gravar(L) { const s = await db(); if (!s) throw new Error('Banco indisponível'); await s`INSERT INTO kv_store (key, value, updated_at) VALUES (${K}, ${JSON.stringify(L.slice(0, MAX))}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; }
const txt = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, n);
const dataISO = v => { const s = String(v || '').substring(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const maisDias = n => new Date(Date.now() + n * 864e5).toISOString().substring(0, 10);

// chama outra API no mesmo processo (herda a credencial da requisição já autenticada)
async function chamar(arquivo, action, body) {
  const m = await import(arquivo); let out = null;
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(o) { try { out = JSON.parse(o); } catch (_) { out = { raw: o }; } return this; }, setHeader() {}, end() { return this; } };
  await m.default({ method: 'POST', body: { action, ...body }, query: {}, headers: {}, url: arquivo }, res);
  if (!out || out.success === false || out.error) throw new Error(txt(out?.error || out?.message || 'sem resposta', 200));
  return out;
}

export const EXECUTORES = {
  todo: {
    nome: 'Tarefa no To-do', auto: false,
    ajuda: 'Cria a tarefa no To-do (execução humana).',
    normalizar: (p, a) => ({ texto: txt(p.texto || a.titulo, 300), responsavel: txt(p.responsavel, 80), data: dataISO(p.data) || (a.prazo_dias ? maisDias(Math.min(+a.prazo_dias || 7, 180)) : ''), notas: txt(p.notas || a.porque, 600) }),
    valido: p => !!p.texto,
    executar: async (p, ctx) => { const r = await chamar('../api/todo.js', 'criar_lote', { itens: [{ texto: p.texto, responsavel: p.responsavel, data: p.data, notas: p.notas }], origem_ia: 'Ações do sistema', contexto: ctx.titulo }); return { criadas: (r.criadas || []).length, duplicada: !(r.criadas || []).length, resumo: (r.criadas || []).length ? 'Tarefa criada no To-do' : 'Já existia tarefa igual aberta no To-do' }; },
  },
  oferta: {
    nome: 'Oferta da campanha', auto: true,
    ajuda: 'Troca o texto da oferta usada nas artes, posts e página de captura.',
    normalizar: p => ({ texto: txt(p.texto, 400) }),
    valido: p => p.texto.length >= 15,
    executar: async p => { const r = await chamar('../api/metricool.js', 'oferta_salvar', { texto: p.texto }); return { resumo: 'Oferta atualizada: ' + txt(r.titulo || p.texto, 90) }; },
  },
  posts_rascunho: {
    nome: 'Rascunhos de posts', auto: true,
    ajuda: 'Gera posts nos horários vagos da agenda do Metricool como RASCUNHO (nada é publicado sem você abrir e aprovar).',
    normalizar: p => ({ tema: txt(p.tema, 300), qtd: Math.max(1, Math.min(5, parseInt(p.qtd) || 3)), dias: Math.max(3, Math.min(30, parseInt(p.dias) || 14)) }),
    valido: p => p.tema.length >= 5,
    executar: async p => {
      const pl = await chamar('../api/metricool.js', 'autocampanha_planejar', { dias: p.dias });
      const vagos = (pl.plano?.vagos || []).slice(0, p.qtd);
      if (!vagos.length) return { resumo: 'Agenda já completa nos próximos ' + p.dias + ' dias — nenhum rascunho criado' };
      const r = await chamar('../api/metricool.js', 'fila_enfileirar', { slots: vagos, tema: p.tema, apenas_rascunho: true });
      return { resumo: (r.enfileirados ?? r.criados ?? vagos.length) + ' rascunho(s) na fila do Metricool' };
    },
  },
};

export function normalizarAcao(a, origem = {}) {
  const tipo = EXECUTORES[a?.tipo] ? a.tipo : 'todo'; // tipo desconhecido vira tarefa humana: nunca executa nada fora da lista
  const E = EXECUTORES[tipo], p = E.normalizar(a?.params && typeof a.params === 'object' ? a.params : {}, a || {});
  const titulo = txt(a?.titulo || p.texto || p.tema, 140); if (!titulo || !E.valido(p)) return null;
  return { id: 'ac_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'), tipo, titulo, porque: txt(a?.porque, 400), impacto: ['Alto', 'Médio', 'Baixo'].includes(a?.impacto) ? a.impacto : 'Médio',
    params: p, status: 'proposta', origem: { fonte: txt(origem.fonte, 40), historico_id: origem.historico_id || null, em: new Date().toISOString() }, criado_por: txt(origem.por, 60), criado_em: new Date().toISOString(), log: [] };
}

export async function propor(lista, origem) {
  const novas = (Array.isArray(lista) ? lista : []).slice(0, 20).map(a => normalizarAcao(a, origem)).filter(Boolean);
  if (!novas.length) return { criadas: [] };
  const L = await ler(), chaves = new Set(L.filter(x => x.status === 'proposta' || x.status === 'aprovada').map(x => x.tipo + '|' + x.titulo.toLowerCase()));
  const ok = novas.filter(a => !chaves.has(a.tipo + '|' + a.titulo.toLowerCase()));
  await gravar([...ok, ...L]); return { criadas: ok, repetidas: novas.length - ok.length };
}

export async function listar() { return (await ler()).map(a => ({ ...a, executor: EXECUTORES[a.tipo]?.nome || a.tipo })); }

const nota = (a, t, por) => { (a.log = a.log || []).push({ em: new Date().toISOString(), por: por || '', t }); a.log = a.log.slice(-12); };

export async function decidir({ id, decisao, params }, por) {
  const L = await ler(), a = L.find(x => x.id === id); if (!a) throw Object.assign(new Error('Ação não encontrada'), { status: 404 });
  const E = EXECUTORES[a.tipo];
  if (decisao === 'rejeitar') { a.status = 'rejeitada'; nota(a, 'Rejeitada', por); }
  else if (decisao === 'reabrir') { a.status = 'proposta'; a.erro = ''; nota(a, 'Voltou para proposta', por); }
  else if (decisao === 'editar') { const p = E.normalizar({ ...a.params, ...(params || {}) }, a); if (!E.valido(p)) throw Object.assign(new Error('Parâmetros inválidos'), { status: 400 }); a.params = p; nota(a, 'Editada', por); }
  else if (decisao === 'aprovar' || decisao === 'executar') {
    if (a.status === 'executando') throw Object.assign(new Error('Já está executando'), { status: 409 });
    if (decisao === 'aprovar' && a.status !== 'proposta' && a.status !== 'falhou') throw Object.assign(new Error('Só dá para aprovar proposta ou refazer uma que falhou'), { status: 409 });
    a.status = 'executando'; a.aprovada_por = por; a.aprovada_em = new Date().toISOString(); a.erro = ''; nota(a, 'Aprovada', por); await gravar(L);
    try { a.resultado = await E.executar(a.params, a); a.status = 'concluida'; a.concluida_em = new Date().toISOString(); nota(a, 'Executada: ' + (a.resultado?.resumo || 'ok'), 'sistema'); }
    catch (e) { a.status = 'falhou'; a.erro = txt(e.message, 300); nota(a, 'Falhou: ' + a.erro, 'sistema'); }
  } else throw Object.assign(new Error('Decisão inválida'), { status: 400 });
  await gravar(L); return { ...a, executor: E?.nome || a.tipo };
}
export async function criarManual(b, por) { const a = normalizarAcao(b, { fonte: 'manual', por }); if (!a) throw Object.assign(new Error('Ação inválida'), { status: 400 }); const L = await ler(); await gravar([a, ...L]); return a; }
export const catalogo = () => Object.entries(EXECUTORES).map(([tipo, e]) => ({ tipo, nome: e.nome, ajuda: e.ajuda, auto: e.auto }));
