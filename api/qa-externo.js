import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
// api/qa-externo.js — v3.133 · QA DE PRODUTOS ATLANTYX (caixa-preta)
// Robô de testes para os produtos da Atlantyx publicados fora deste sistema (Lovable, Vercel, etc.), sem acesso ao
// código-fonte: só URL + usuário + senha de teste. O robô (GitHub Actions + navegador, scripts/qa-externo.mjs) entra,
// descobre as telas, testa a tela e a retaguarda (chamadas de API), faz o ciclo incluir → alterar → excluir,
// verifica a configuração de segurança do próprio produto e manda o texto de cada tela para a IA criticar a lógica
// (erro conceitual, falha operacional, dados ausentes ou incoerentes). Tudo vira ACHADO num Kanban de QA.
//
// Kanban do produto: na_fila → testando → com_erros → em_correcao → retestar → aprovado.
// Só vai para APROVADO quando a última execução cobriu 100% das telas descobertas e não há achado aberto,
// em correção ou aguardando reteste. Achado reaparece no reteste → volta a "aberto" e o produto sai de aprovado.
// Como os produtos podem não ter código acessível (ex.: Lovable), cada achado traz um PROMPT DE CORREÇÃO pronto
// para colar na ferramenta onde o produto é construído; se houver repositório GitHub, pode virar tarefa lá.
//
// Segurança dos dados: a senha do produto é guardada CRIPTOGRAFADA (AES-256-GCM) e nunca volta para a tela;
// só o robô (Authorization: Bearer CRON_SECRET) recebe a credencial, no momento de rodar.

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await _sql`CREATE TABLE IF NOT EXISTS qa_produtos (
    id TEXT PRIMARY KEY, nome TEXT NOT NULL, url TEXT NOT NULL, url_login TEXT, usuario TEXT, senha_cripto TEXT,
    plataforma TEXT, repo_github TEXT, contexto TEXT, ativo BOOLEAN DEFAULT true, rodar_noturno BOOLEAN DEFAULT true,
    permitir_gravacao BOOLEAN DEFAULT true, max_telas INT DEFAULT 60, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS qa_execucoes (
    id TEXT PRIMARY KEY, produto_id TEXT REFERENCES qa_produtos(id) ON DELETE CASCADE, status TEXT DEFAULT 'fila', origem TEXT,
    pedido_em TIMESTAMPTZ DEFAULT NOW(), iniciado_em TIMESTAMPTZ, terminado_em TIMESTAMPTZ, telas_descobertas INT, telas_testadas INT,
    cobertura_pct NUMERIC, resumo JSONB, erro TEXT)`;
  await _sql`CREATE TABLE IF NOT EXISTS qa_achados (
    id TEXT PRIMARY KEY, produto_id TEXT REFERENCES qa_produtos(id) ON DELETE CASCADE, execucao_id TEXT, assinatura TEXT,
    tipo TEXT, severidade TEXT, titulo TEXT, descricao TEXT, tela TEXT, url TEXT, evidencia TEXT, print TEXT, como_reproduzir TEXT,
    prompt_correcao TEXT, status TEXT DEFAULT 'aberto', ocorrencias INT DEFAULT 1, issue_url TEXT, nota TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(), visto_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE INDEX IF NOT EXISTS idx_qa_achados_prod ON qa_achados(produto_id, status)`;
  await _sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_qa_achados_assin ON qa_achados(produto_id, assinatura)`;
  return _sql;
}
const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const SEV = ['critica', 'alta', 'media', 'baixa'];
const TIPOS = { tela: 'Tela (front)', api: 'Retaguarda (API)', crud: 'Incluir/alterar/excluir', logica: 'Lógica de negócio (IA)', dados: 'Dados ausentes/incoerentes', seguranca: 'Configuração de segurança', desempenho: 'Desempenho', responsivo: 'Celular / layout', acesso: 'Login e acesso' };

// ── criptografia da senha do produto ──
function _chave() {
  const base = process.env.QA_CRIPTO_KEY || process.env.ATX_SESSAO_SEGREDO || process.env.CRON_SECRET || '';
  if (!base) throw new Error('Configure QA_CRIPTO_KEY (ou ATX_SESSAO_SEGREDO) no Vercel para guardar senhas de produtos.');
  return crypto.createHash('sha256').update('atx-qa-externo:' + base).digest();
}
function cifrar(txt) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', _chave(), iv); const e = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]); return [iv.toString('base64'), c.getAuthTag().toString('base64'), e.toString('base64')].join('.'); }
function decifrar(s) { if (!s) return null; const [iv, tag, e] = String(s).split('.'); const d = crypto.createDecipheriv('aes-256-gcm', _chave(), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([d.update(Buffer.from(e, 'base64')), d.final()]).toString('utf8'); }

function _ehRobo(req) { const a = String(req.headers?.authorization || ''); return !!process.env.CRON_SECRET && a.length === ('Bearer ' + process.env.CRON_SECRET).length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from('Bearer ' + process.env.CRON_SECRET)); }
const _semSenha = p => { const { senha_cripto, ...r } = p; return { ...r, tem_senha: !!senha_cripto }; };

// ── coluna do Kanban do produto ──
function colunaProduto(p, ult, cont) {
  if (ult && ult.status === 'fila') return 'na_fila';
  if (ult && ult.status === 'rodando') return 'testando';
  if (!ult) return 'na_fila';
  if (ult.status === 'erro') return 'com_erros';
  const ab = cont.aberto || 0, ec = cont.em_correcao || 0, rt = cont.corrigido || 0;
  if (ab) return 'com_erros';
  if (ec) return 'em_correcao';
  if (rt) return 'retestar';
  return Number(ult.cobertura_pct) >= 100 ? 'aprovado' : 'retestar';
}
async function kanban() {
  const sql = await getSql();
  const P = await sql`SELECT * FROM qa_produtos ORDER BY nome`;
  const E = await sql`SELECT DISTINCT ON (produto_id) * FROM qa_execucoes ORDER BY produto_id, pedido_em DESC`;
  const C = await sql`SELECT produto_id, status, severidade, COUNT(*)::int AS n FROM qa_achados WHERE status NOT IN ('validado','falso_positivo') GROUP BY produto_id, status, severidade`;
  const produtos = P.map(p => { const ult = E.find(e => e.produto_id === p.id) || null; const cont = {}, sev = {};
    C.filter(c => c.produto_id === p.id).forEach(c => { cont[c.status] = (cont[c.status] || 0) + c.n; if (c.status === 'aberto') sev[c.severidade] = (sev[c.severidade] || 0) + c.n; });
    return { ..._semSenha(p), ultima: ult, contagem: cont, severidades: sev, coluna: colunaProduto(p, ult, cont) }; });
  return { produtos, colunas: [['na_fila', 'Na fila'], ['testando', 'Testando'], ['com_erros', 'Com erros'], ['em_correcao', 'Em correção'], ['retestar', 'Retestar'], ['aprovado', 'Aprovado (100%)']], tipos: TIPOS };
}
async function produtoSalvar(b) {
  const sql = await getSql();
  if (!b.nome || !b.url) throw new Error('Informe nome e URL do produto');
  let u; try { u = new URL(b.url); } catch (_) { throw new Error('URL inválida'); } if (!/^https?:$/.test(u.protocol)) throw new Error('URL precisa começar com https://');
  const senha = b.senha ? cifrar(b.senha) : null;
  if (b.id) {
    await sql`UPDATE qa_produtos SET nome=${b.nome}, url=${b.url}, url_login=${b.url_login || null}, usuario=${b.usuario || null}, plataforma=${b.plataforma || null}, repo_github=${b.repo_github || null},
      contexto=${b.contexto || null}, ativo=${b.ativo !== false}, rodar_noturno=${b.rodar_noturno !== false}, permitir_gravacao=${b.permitir_gravacao !== false}, max_telas=${parseInt(b.max_telas) || 60},
      senha_cripto=COALESCE(${senha}, senha_cripto), atualizado_em=NOW() WHERE id=${b.id}`;
    return { id: b.id };
  }
  const id = novoId('qap');
  await sql`INSERT INTO qa_produtos (id, nome, url, url_login, usuario, senha_cripto, plataforma, repo_github, contexto, ativo, rodar_noturno, permitir_gravacao, max_telas)
    VALUES (${id}, ${b.nome}, ${b.url}, ${b.url_login || null}, ${b.usuario || null}, ${senha}, ${b.plataforma || null}, ${b.repo_github || null}, ${b.contexto || null}, ${b.ativo !== false}, ${b.rodar_noturno !== false}, ${b.permitir_gravacao !== false}, ${parseInt(b.max_telas) || 60})`;
  return { id };
}
async function _dispararRobo() {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os';
  if (!token) return { disparado: false, motivo: 'sem GITHUB_TOKEN — o robô pega a fila na próxima passagem (a cada 30 min)' };
  try { const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/qa-externo.yml/dispatches`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'atlantyx-os-qa' }, body: JSON.stringify({ ref: 'main' }) });
    return r.status === 204 ? { disparado: true } : { disparado: false, motivo: 'GitHub ' + r.status + ' — o robô pega a fila na próxima passagem (a cada 30 min)' }; }
  catch (e) { return { disparado: false, motivo: e.message }; }
}
async function executar({ produto_id, origem = 'manual' }) {
  const sql = await getSql();
  const p = (await sql`SELECT id, senha_cripto, usuario FROM qa_produtos WHERE id=${produto_id}`)[0]; if (!p) throw new Error('Produto não encontrado');
  const ja = await sql`SELECT id FROM qa_execucoes WHERE produto_id=${produto_id} AND status IN ('fila','rodando')`; if (ja.length) return { execucao_id: ja[0].id, ja_na_fila: true, ...(await _dispararRobo()) };
  const id = novoId('qae'); await sql`INSERT INTO qa_execucoes (id, produto_id, status, origem) VALUES (${id}, ${produto_id}, 'fila', ${origem})`;
  return { execucao_id: id, ...(await _dispararRobo()) };
}
// ── robô (Bearer CRON_SECRET) ──
async function roboEnfileirarNoturno() {
  const sql = await getSql();
  const P = await sql`SELECT id FROM qa_produtos WHERE ativo AND rodar_noturno`;
  let n = 0; for (const p of P) { const ja = await sql`SELECT 1 FROM qa_execucoes WHERE produto_id=${p.id} AND status IN ('fila','rodando')`; if (!ja.length) { await sql`INSERT INTO qa_execucoes (id, produto_id, status, origem) VALUES (${novoId('qae')}, ${p.id}, 'fila', 'noturno')`; n++; } }
  return { enfileirados: n };
}
async function roboProximo() {
  const sql = await getSql();
  // execução presa há mais de 2h volta a erro
  await sql`UPDATE qa_execucoes SET status='erro', erro='tempo esgotado (robô não terminou em 2h)', terminado_em=NOW() WHERE status='rodando' AND iniciado_em < NOW() - INTERVAL '2 hours'`;
  const e = (await sql`UPDATE qa_execucoes SET status='rodando', iniciado_em=NOW() WHERE id = (SELECT id FROM qa_execucoes WHERE status='fila' ORDER BY pedido_em LIMIT 1) RETURNING *`)[0];
  if (!e) return { execucao: null };
  const p = (await sql`SELECT * FROM qa_produtos WHERE id=${e.produto_id}`)[0];
  let senha = null; try { senha = decifrar(p.senha_cripto); } catch (_) { senha = null; }
  const conhecidos = await sql`SELECT assinatura, titulo, status, tela FROM qa_achados WHERE produto_id=${p.id} AND status NOT IN ('validado','falso_positivo')`;
  return { execucao: { id: e.id, origem: e.origem }, produto: { id: p.id, nome: p.nome, url: p.url, url_login: p.url_login, usuario: p.usuario, senha, plataforma: p.plataforma, contexto: p.contexto,
    permitir_gravacao: p.permitir_gravacao, max_telas: p.max_telas || 60 }, conhecidos };
}
async function roboResultado(b) {
  const sql = await getSql();
  const e = (await sql`SELECT * FROM qa_execucoes WHERE id=${b.execucao_id}`)[0]; if (!e) throw new Error('execução não encontrada');
  const pid = e.produto_id, achados = Array.isArray(b.achados) ? b.achados.slice(0, 400) : [];
  const vistos = new Set();
  for (const a of achados) {
    const sev = SEV.includes(a.severidade) ? a.severidade : 'media', tipo = TIPOS[a.tipo] ? a.tipo : 'tela';
    const assin = crypto.createHash('sha1').update([pid, tipo, a.chave || a.titulo, a.tela || ''].join('|')).digest('hex');
    vistos.add(assin);
    const ex = (await sql`SELECT id, status FROM qa_achados WHERE produto_id=${pid} AND assinatura=${assin}`)[0];
    if (ex) {
      // falso positivo continua ignorado; validado/corrigido que reaparece → volta a aberto (reincidência)
      const novo = ex.status === 'falso_positivo' ? 'falso_positivo' : ex.status === 'em_correcao' ? 'em_correcao' : 'aberto';
      await sql`UPDATE qa_achados SET status=${novo}, execucao_id=${e.id}, ocorrencias=ocorrencias+1, descricao=${String(a.descricao || '').substring(0, 4000)}, evidencia=${String(a.evidencia || '').substring(0, 4000)},
        print=COALESCE(${a.print ? String(a.print).substring(0, 180000) : null}, print), url=${a.url || null}, prompt_correcao=COALESCE(${a.prompt_correcao || null}, prompt_correcao),
        nota=${ex.status === 'validado' || ex.status === 'corrigido' ? 'reapareceu no reteste de ' + new Date().toLocaleDateString('pt-BR') : null}, visto_em=NOW(), atualizado_em=NOW() WHERE id=${ex.id}`;
    } else {
      await sql`INSERT INTO qa_achados (id, produto_id, execucao_id, assinatura, tipo, severidade, titulo, descricao, tela, url, evidencia, print, como_reproduzir, prompt_correcao)
        VALUES (${novoId('qaa')}, ${pid}, ${e.id}, ${assin}, ${tipo}, ${sev}, ${String(a.titulo || 'Achado').substring(0, 300)}, ${String(a.descricao || '').substring(0, 4000)}, ${a.tela || null}, ${a.url || null},
          ${String(a.evidencia || '').substring(0, 4000)}, ${a.print ? String(a.print).substring(0, 180000) : null}, ${String(a.como_reproduzir || '').substring(0, 2000)}, ${a.prompt_correcao || null})`;
    }
  }
  // reteste: o que estava "corrigido" (ou aberto) e NÃO apareceu numa execução completa → validado
  const completa = Number(b.cobertura_pct) >= 100 && !b.erro;
  let validados = 0;
  if (completa) { const pend = await sql`SELECT id, assinatura FROM qa_achados WHERE produto_id=${pid} AND status IN ('aberto','corrigido','em_correcao')`;
    for (const x of pend) if (!vistos.has(x.assinatura)) { await sql`UPDATE qa_achados SET status='validado', nota='não reproduzido no reteste completo de ' || ${new Date().toLocaleDateString('pt-BR')}, atualizado_em=NOW() WHERE id=${x.id}`; validados++; } }
  await sql`UPDATE qa_execucoes SET status=${b.erro ? 'erro' : 'concluida'}, terminado_em=NOW(), telas_descobertas=${parseInt(b.telas_descobertas) || 0}, telas_testadas=${parseInt(b.telas_testadas) || 0},
    cobertura_pct=${Number(b.cobertura_pct) || 0}, resumo=${JSON.stringify({ ...(b.resumo || {}), achados: achados.length, validados })}, erro=${b.erro || null} WHERE id=${e.id}`;
  return { gravados: achados.length, validados };
}
// IA: crítica da lógica de uma tela (chamada pelo robô) — devolve achados de lógica/dados
async function roboCriticar({ produto, tela }) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return { achados: [], aviso: 'ANTHROPIC_API_KEY ausente' };
  const sistema = `Você é um analista de QA sênior e especialista em regras de negócio. Recebe o CONTEÚDO de uma tela de um sistema da Atlantyx (texto visível, tabelas, formulários e as respostas das APIs que a tela chamou) e aponta APENAS problemas reais e verificáveis no que foi mostrado:
- erro conceitual (regra de negócio errada, rótulo que contradiz o valor, cálculo que não fecha, status incoerente com datas/valores);
- falha operacional (fluxo que não permite concluir a tarefa, botão sem efeito descrito, mensagem de erro técnica para o usuário);
- dados ausentes que deveriam existir (tabela/indicador vazio onde a API trouxe dados, campos obrigatórios vazios, "undefined", "NaN", "null", "[object Object]", datas inválidas);
- dados incoerentes (totais que não batem com a soma, percentuais acima de 100% sem sentido, datas no futuro/passado impossíveis, valores negativos indevidos, duplicidades).
Não invente; se não houver problema, devolva lista vazia. Para cada achado gere também um "prompt_correcao" em português, pronto para colar numa ferramenta de construção de apps (ex.: Lovable), descrevendo a tela, o problema e o comportamento esperado.
Responda SOMENTE JSON: {"achados":[{"tipo":"logica|dados","severidade":"critica|alta|media|baixa","titulo":"...","descricao":"...","evidencia":"trecho exato da tela","prompt_correcao":"..."}]}`;
  const user = `PRODUTO: ${produto?.nome || ''}\nCONTEXTO DO NEGÓCIO (informado pela Atlantyx): ${String(produto?.contexto || 'não informado').substring(0, 3000)}\n\nTELA: ${tela?.titulo || ''} (${tela?.url || ''})\n\n${String(tela?.conteudo || '').substring(0, 14000)}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.QA_IA_MODEL || 'claude-sonnet-4-5', max_tokens: 2500, system: sistema, messages: [{ role: 'user', content: user }] }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) return { achados: [], aviso: 'IA: ' + (d.error?.message || r.status) };
  const t = d.content?.[0]?.text || ''; const m = t.match(/\{[\s\S]*\}/);
  try { const j = JSON.parse(m ? m[0] : t); return { achados: (j.achados || []).slice(0, 12) }; } catch (_) { return { achados: [] }; }
}
async function achadosListar({ produto_id, status }) {
  const sql = await getSql();
  const L = status ? await sql`SELECT id, produto_id, execucao_id, tipo, severidade, titulo, descricao, tela, url, evidencia, como_reproduzir, prompt_correcao, status, ocorrencias, issue_url, nota, criado_em, atualizado_em, (print IS NOT NULL) AS tem_print FROM qa_achados WHERE produto_id=${produto_id} AND status=${status} ORDER BY atualizado_em DESC`
    : await sql`SELECT id, produto_id, execucao_id, tipo, severidade, titulo, descricao, tela, url, evidencia, como_reproduzir, prompt_correcao, status, ocorrencias, issue_url, nota, criado_em, atualizado_em, (print IS NOT NULL) AS tem_print FROM qa_achados WHERE produto_id=${produto_id} ORDER BY CASE status WHEN 'aberto' THEN 0 WHEN 'em_correcao' THEN 1 WHEN 'corrigido' THEN 2 ELSE 3 END, CASE severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, atualizado_em DESC LIMIT 500`;
  const ex = await sql`SELECT * FROM qa_execucoes WHERE produto_id=${produto_id} ORDER BY pedido_em DESC LIMIT 15`;
  return { achados: L, execucoes: ex, tipos: TIPOS };
}
async function achadoStatus({ id, ids, status, nota }) {
  const ok = ['aberto', 'em_correcao', 'corrigido', 'falso_positivo']; if (!ok.includes(status)) throw new Error('status inválido');
  const sql = await getSql(); const lista = ids && ids.length ? ids : [id];
  for (const x of lista) await sql`UPDATE qa_achados SET status=${status}, nota=COALESCE(${nota || null}, nota), atualizado_em=NOW() WHERE id=${x}`;
  return { atualizados: lista.length };
}
async function achadoTarefa({ id }) {
  const sql = await getSql(); const a = (await sql`SELECT a.*, p.nome AS produto, p.repo_github FROM qa_achados a JOIN qa_produtos p ON p.id=a.produto_id WHERE a.id=${id}`)[0];
  if (!a) throw new Error('Achado não encontrado'); if (!a.repo_github) throw new Error('Este produto não tem repositório GitHub cadastrado — use o prompt de correção na ferramenta do produto (ex.: Lovable).');
  const token = process.env.GITHUB_TOKEN; if (!token) throw new Error('GITHUB_TOKEN não configurado');
  const corpo = `**Produto:** ${a.produto}\n**Tela:** ${a.tela || '—'} (${a.url || '—'})\n**Tipo:** ${TIPOS[a.tipo] || a.tipo} · **Severidade:** ${a.severidade}\n\n${a.descricao || ''}\n\n**Evidência:**\n\n${a.evidencia || '—'}\n\n**Como reproduzir:** ${a.como_reproduzir || '—'}\n\n**Correção esperada:**\n${a.prompt_correcao || '—'}\n\n_Aberto pelo QA de Produtos do Atlantyx OS._`;
  const r = await fetch(`https://api.github.com/repos/${a.repo_github}/issues`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'atlantyx-os-qa' },
    body: JSON.stringify({ title: '[QA] ' + String(a.titulo).substring(0, 180), body: corpo, labels: ['qa'] }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('GitHub recusou (' + r.status + '): ' + (d.message || ''));
  await sql`UPDATE qa_achados SET issue_url=${d.html_url}, status='em_correcao', atualizado_em=NOW() WHERE id=${id}`;
  return { url: d.html_url };
}

async function handler(req, res) {
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  try {
    const robo = _ehRobo(req);
    const soRobo = f => async () => { if (!robo) { const e = new Error('Só o robô de QA (CRON_SECRET) pode chamar esta ação'); e.code = 403; throw e; } return f(); };
    const acoes = {
      kanban: () => kanban(),
      produto_salvar: () => produtoSalvar(b),
      produto_obter: async () => { const sql = await getSql(); const p = (await sql`SELECT * FROM qa_produtos WHERE id=${b.id}`)[0]; if (!p) throw new Error('não encontrado'); return { produto: _semSenha(p) }; },
      produto_excluir: async () => { const sql = await getSql(); await sql`DELETE FROM qa_produtos WHERE id=${b.id}`; return { ok: true }; },
      executar: () => executar({ produto_id: b.produto_id }),
      achados: () => achadosListar(b),
      achado_status: () => achadoStatus(b),
      achado_tarefa: () => achadoTarefa(b),
      achado_print: async () => { const sql = await getSql(); return { print: (await sql`SELECT print FROM qa_achados WHERE id=${b.id}`)[0]?.print || null }; },
      robo_tem_fila: soRobo(async () => { const sql = await getSql(); return { fila: (await sql`SELECT COUNT(*)::int AS n FROM qa_execucoes WHERE status='fila'`)[0].n }; }),
      robo_enfileirar_noturno: soRobo(() => roboEnfileirarNoturno()),
      robo_proximo: soRobo(() => roboProximo()),
      robo_resultado: soRobo(() => roboResultado(b)),
      robo_criticar: soRobo(() => roboCriticar(b)),
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) {
    console.error('[qa-externo]', b.action, e.message);
    return res.status(e.code === 403 ? 403 : 500).json({ success: false, error: e.message });
  }
}
export default comGuarda(handler, 'qa-externo');
