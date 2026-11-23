// lib/atlas-itens.js — v3.564 · O que o ATLAS cria por assunto (agente, relatório, análise, tela)
// Nasce PRIVADO ("rascunho") → "em teste" → "publicado no assunto". Tudo no kv_store (chave 'atlas:itens'), sem tabela nova.
// Travas: (1) nunca dado real de cliente em texto/teste/exemplo; (2) registro de quem pediu, o que o ATLAS fez e o que mudou (com desfazer);
// (3) cada assunto tem dono que aprova — o CEO aprova todos. O ATLAS só PROPÕE: nada de código/URL vindo da IA é executado aqui;
// e-mail e cobrança são só rascunho; anúncio pago nasce PAUSADO; "tela" vira pedido na Esteira de Demandas (revisão do fundador).
import crypto from 'crypto';
let _sql = null;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  return _sql;
}
const K = 'atlas:itens', MAX = 500;
export const ASSUNTOS = {
  comercial: 'Comercial', marketing: 'Marketing', financeiro: 'Financeiro', projetos: 'Projetos', estrategia: 'Estratégia', integracoes: 'Integrações',
  pessoas: 'Pessoas', juridico: 'Jurídico', dados: 'Dados', produtos: 'Produtos',
  atendimento: 'Atendimento', desenvolvimento: 'Desenvolvimento e QA', email: 'E-mail Intel', dashboards: 'Dashboards'   // v3.578: todas as áreas de atuação do menu do Atlantyx OS
};
export const TIPOS = { agente: 'Agente', relatorio: 'Relatório', analise: 'Análise', tela: 'Tela' };
export const PASTA = { agente: 'Agentes', relatorio: 'Relatórios', analise: 'Análises', tela: 'Telas' };
const ESTADOS = ['rascunho', 'teste', 'publicado', 'descartado'];
const txt = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim().substring(0, n);
const agora = () => new Date().toISOString();
const erro = (m, status = 400) => Object.assign(new Error(m), { status });

async function ler() {
  if (globalThis.__ATLAS_MEM) return globalThis.__ATLAS_MEM.v; // só nos testes
  const s = await db(); if (!s) return [];
  const r = (await s`SELECT value FROM kv_store WHERE key=${K}`)[0]; if (!r) return [];
  try { const v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; return Array.isArray(v) ? v : []; } catch (_) { return []; }
}
async function gravar(L) {
  if (globalThis.__ATLAS_MEM) { globalThis.__ATLAS_MEM.v = L.slice(0, MAX); return; }
  const s = await db(); if (!s) throw erro('Banco indisponível', 503);
  await s`INSERT INTO kv_store (key, value, updated_at) VALUES (${K}, ${JSON.stringify(L.slice(0, MAX))}, NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`;
}

// Dono que aprova agente/tela: ATLAS_DONOS="marketing:ana,financeiro:bia". O CEO (perfil administrador) aprova todos.
export function podeAprovar(assunto, login, admin) {
  if (admin) return true;
  const m = String(process.env.ATLAS_DONOS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return m.includes(`${assunto}:${String(login || '').toLowerCase()}`);
}
const ve = (it, login, admin) => admin || it.estado === 'publicado' || it.criado_por === login;

export async function listar({ assunto } = {}, login = '', admin = false) {
  const L = (await ler()).filter(it => ve(it, login, admin) && it.estado !== 'descartado' && (!assunto || it.assunto === assunto));
  const aguardando = L.filter(it => it.aprovacao === 'pedida' && podeAprovar(it.assunto, login, admin)).length;
  return { itens: L.map(it => ({ ...it, pode_aprovar: podeAprovar(it.assunto, login, admin), meu: it.criado_por === login })), aguardando };
}

const REGRAS = `REGRAS INVIOLÁVEIS: (1) nunca use nome, dado ou valor real de cliente (CPFL, Enel, Caixa, Jelta etc.): use exemplos sintéticos; (2) e-mail e cobrança só como RASCUNHO, nunca enviados; (3) anúncio pago sempre PAUSADO; (4) nenhuma ação social real (curtir, seguir, comprar); (5) não invente número: se faltar dado, diga qual dado falta. Português do Brasil, direto, sem enrolação.`;
const PROMPT = {
  relatorio: a => `Você é o ATLAS, assistente da Atlantyx. Escreva um RELATÓRIO em Markdown sobre o assunto "${a}", conforme o pedido. Estrutura: título, resumo de 3 linhas, seções curtas, tabela quando ajudar, e "Dados que faltam" no fim. ${REGRAS}`,
  analise: a => `Você é o ATLAS, assistente da Atlantyx. Faça uma ANÁLISE em Markdown sobre o assunto "${a}", conforme o pedido: situação, o que os dados sugerem, riscos, 3 recomendações com dono e prazo, e "Dados que faltam". ${REGRAS}`,
  agente: a => `Você é o ATLAS, assistente da Atlantyx. Desenhe a ESPECIFICAÇÃO de um AGENTE para o assunto "${a}", conforme o pedido, em Markdown: objetivo, quando roda (gatilho), que dados lê, o que produz, o que NUNCA faz, como testar sem enviar nada externo, e quem aprova. O agente só pode usar ações da lista fechada do sistema (criar tarefa, rascunho de post, rascunho de e-mail/cobrança, relatório). ${REGRAS}`,
  tela: a => `Você é o ATLAS, assistente da Atlantyx. Escreva o PEDIDO DE TELA/FUNCIONALIDADE para o assunto "${a}", conforme o pedido, em Markdown: problema, quem usa, o que a tela mostra e permite, dados de onde vêm, critérios de aceite (3 a 6) e o que fica fora. É uma especificação para a Esteira de Demandas — não escreva código. ${REGRAS}`
};
const PROIBIDO = /\b(cpfl|enel|caixa econ[oô]mica|jelta)\b/i;

export async function criar({ assunto, tipo, pedido, titulo }, login, ia) {
  if (!ASSUNTOS[assunto]) throw erro('Assunto inválido'); if (!TIPOS[tipo]) throw erro('Tipo inválido');
  const p = txt(pedido, 1200); if (p.length < 8) throw erro('Descreva o que você quer em pelo menos uma frase');
  if (typeof ia !== 'function') throw erro('IA indisponível', 503);
  const saida = String(await ia(PROMPT[tipo](ASSUNTOS[assunto]), 'PEDIDO DO USUÁRIO:\n' + p, 3500) || '').trim();
  if (!saida) throw erro('O ATLAS não devolveu conteúdo — tente de novo', 502);
  const aviso = PROIBIDO.test(saida) ? 'O texto cita nome de cliente real: revise e troque por exemplo sintético antes de publicar.' : '';
  const it = { id: crypto.randomBytes(6).toString('hex'), assunto, tipo, titulo: txt(titulo || p, 90), pedido: p, conteudo: saida.substring(0, 20000), estado: 'rascunho',
    criado_por: login || '', criado_em: agora(), aprovacao: (tipo === 'agente' || tipo === 'tela') ? 'necessaria' : 'dispensada', aviso,
    log: [{ em: agora(), por: login || '', acao: 'pediu', detalhe: p.substring(0, 140) }, { em: agora(), por: 'ATLAS', acao: 'gerou', detalhe: `${TIPOS[tipo]} em rascunho, só você vê` }] };
  const L = await ler(); L.unshift(it); await gravar(L); return it;
}

export async function mudar({ id, para, motivo }, login, admin) {
  const L = await ler(); const it = L.find(x => x.id === id); if (!it || !ve(it, login, admin)) throw erro('Item não encontrado', 404);
  const dono = it.criado_por === login || admin, ap = podeAprovar(it.assunto, login, admin);
  const reg = (acao, detalhe) => it.log.push({ em: agora(), por: login || '', acao, detalhe: txt(detalhe || '', 140) });
  if (para === 'teste') { if (!dono) throw erro('Só quem criou testa', 403); if (it.estado !== 'rascunho') throw erro('Só rascunho vai para teste'); it.estado = 'teste'; reg('testar', 'roda com dados de quem criou; não envia nada para fora'); }
  else if (para === 'pedir_aprovacao') { if (!dono) throw erro('Só quem criou pede', 403); if (it.estado !== 'teste') throw erro('Teste antes de pedir aprovação'); it.aprovacao = 'pedida'; reg('pediu aprovação', `dono do assunto ${ASSUNTOS[it.assunto]}`); }
  else if (para === 'publicado') {
    if (it.estado === 'publicado') throw erro('Já está publicado');
    if (it.aprovacao === 'dispensada') { if (!dono) throw erro('Só quem criou publica', 403); }
    else { if (!ap) throw erro('Precisa da aprovação do dono do assunto', 403); if (it.aprovacao !== 'pedida' && it.criado_por !== login && !admin) throw erro('Aguarde o pedido de aprovação', 409); }
    if (it.aviso && !admin) throw erro('Resolva o aviso (nome de cliente real) antes de publicar', 409);
    it.estado = 'publicado'; it.publicado_por = login || ''; it.publicado_em = agora(); it.aprovacao = it.aprovacao === 'dispensada' ? 'dispensada' : 'aprovada'; reg('publicou', `visível a quem tem acesso a ${ASSUNTOS[it.assunto]}`);
  }
  else if (para === 'rascunho') { if (!dono && !ap) throw erro('Sem permissão', 403); const antes = it.estado; it.estado = 'rascunho'; it.aprovacao = (it.tipo === 'agente' || it.tipo === 'tela') ? 'necessaria' : 'dispensada'; delete it.publicado_por; delete it.publicado_em; reg('desfez', `voltou de ${antes} para rascunho${motivo ? ': ' + motivo : ''}`); }
  else if (para === 'descartado') { if (!dono && !ap) throw erro('Sem permissão', 403); it.estado = 'descartado'; reg('descartou', motivo); }
  else throw erro('Mudança inválida');
  await gravar(L); return { ...it, pode_aprovar: ap, meu: it.criado_por === login };
}

// Tela/funcionalidade aprovada vira pedido na Esteira de Demandas (o fundador ainda revisa o PR). Devolve o texto da demanda; quem chama cria.
export async function resumoAtividade(assunto) {
  const L = (await ler()).filter(i => i.assunto === assunto && i.estado !== 'descartado'); const hoje = agora().substring(0, 10);
  const h = L.filter(i => (i.criado_em || '').startsWith(hoje));
  return { total: L.length, publicados: L.filter(i => i.estado === 'publicado').length, hoje: h.length };
}
