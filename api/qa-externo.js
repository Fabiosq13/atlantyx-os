import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
import { fabSql, aplicarResultadosCasos, TIPOS_CASO, planoDoTipo } from '../lib/fabrica-db.js';
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
  // v3.134: confirmação humana (metodologia 9.4: todo defeito é confirmado por um analista antes de ir ao cliente)
  await _sql`ALTER TABLE qa_achados ADD COLUMN IF NOT EXISTS confirmado BOOLEAN DEFAULT false`;
  // v3.135: teste de carga só em produto liberado (ambiente de homologação/desempenho)
  await _sql`ALTER TABLE qa_produtos ADD COLUMN IF NOT EXISTS permitir_carga BOOLEAN DEFAULT false`;
  await _sql`ALTER TABLE qa_execucoes ADD COLUMN IF NOT EXISTS progresso JSONB`;
  await _sql`ALTER TABLE qa_produtos ADD COLUMN IF NOT EXISTS usuarios_simultaneos INT DEFAULT 10`;
  return _sql;
}
const IA_MODEL = process.env.QA_IA_MODEL || 'claude-sonnet-4-6';
const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const SEV = ['critica', 'alta', 'media', 'baixa'];
const TIPOS = { tela: 'Tela (front)', api: 'Retaguarda (API)', crud: 'Incluir/alterar/excluir', logica: 'Lógica de negócio (IA)', dados: 'Dados ausentes/incoerentes', seguranca: 'Configuração de segurança', desempenho: 'Desempenho', responsivo: 'Celular / layout', acesso: 'Login e acesso',
  plano: 'Caso do plano de testes', jornada: 'Jornada de usuário (IA)', integracao: 'Integração / APIs', governanca: 'Governança e LGPD', layout: 'Layout de saída (IA)', macaco: 'Teste do macaco' };
const FECHADOS = ['validado', 'falso_positivo', 'aceito']; // aceito = risco aceito formalmente (médio/baixo)

// ── criptografia da senha do produto ──
function _chave() {
  const base = process.env.QA_CRIPTO_KEY || process.env.ATX_SESSAO_SEGREDO || process.env.CRON_SECRET || '';
  if (!base) throw new Error('Configure QA_CRIPTO_KEY (ou ATX_SESSAO_SEGREDO) no Vercel para guardar senhas de produtos.');
  return crypto.createHash('sha256').update('atx-qa-externo:' + base).digest();
}
function cifrar(txt) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', _chave(), iv); const e = Buffer.concat([c.update(String(txt), 'utf8'), c.final()]); return [iv.toString('base64'), c.getAuthTag().toString('base64'), e.toString('base64')].join('.'); }
function decifrar(s) { if (!s) return null; const [iv, tag, e] = String(s).split('.'); const d = crypto.createDecipheriv('aes-256-gcm', _chave(), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([d.update(Buffer.from(e, 'base64')), d.final()]).toString('utf8'); }

function _ehRobo(req) { const a = String(req.headers?.authorization || ''); return !!process.env.CRON_SECRET && a.length === ('Bearer ' + process.env.CRON_SECRET).length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from('Bearer ' + process.env.CRON_SECRET)); }
// devolve só se a senha existe e se pode ser lida (nunca a senha)
const _senhaOk = c => { if (!c) return false; try { return decifrar(c) != null; } catch (_) { return false; } };
const _semSenha = p => { const { senha_cripto, ...r } = p; return { ...r, tem_senha: !!senha_cripto, senha_legivel: _senhaOk(senha_cripto) }; };

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
  const C = await sql`SELECT produto_id, status, severidade, COUNT(*)::int AS n FROM qa_achados WHERE status NOT IN ('validado','falso_positivo','aceito') GROUP BY produto_id, status, severidade`;
  let CP = []; try { const f = await fabSql(); CP = await f`SELECT p.qa_produto_id AS produto_id, c.status, COUNT(*)::int AS n FROM fab_casos c JOIN fab_projetos p ON p.id=c.projeto_id WHERE p.qa_produto_id IS NOT NULL AND c.automatizavel GROUP BY p.qa_produto_id, c.status`; } catch (_) {}
  const produtos = P.map(p => { const ult = E.find(e => e.produto_id === p.id) || null; const cont = {}, sev = {};
    C.filter(c => c.produto_id === p.id).forEach(c => { cont[c.status] = (cont[c.status] || 0) + c.n; if (c.status === 'aberto') sev[c.severidade] = (sev[c.severidade] || 0) + c.n; });
    const casos = {}; CP.filter(c => c.produto_id === p.id).forEach(c => { casos[c.status] = c.n; });
    let coluna = colunaProduto(p, ult, cont);
    // com plano de testes ligado: só aprova com todos os casos automatizáveis aprovados
    if (coluna === 'aprovado' && (casos.falhou || casos.bloqueado || casos.nao_executado)) coluna = casos.falhou ? 'com_erros' : 'retestar';
    return { ..._semSenha(p), ultima: ult, contagem: cont, severidades: sev, casos, coluna }; });
  return { produtos, colunas: [['na_fila', 'Na fila'], ['testando', 'Testando'], ['com_erros', 'Com erros'], ['em_correcao', 'Em correção'], ['retestar', 'Retestar'], ['aprovado', 'Aprovado (100%)']], tipos: TIPOS };
}
async function produtoSalvar(b) {
  const sql = await getSql();
  if (!b.nome || !b.url) throw new Error('Informe nome e URL do produto');
  let u; try { u = new URL(b.url); } catch (_) { throw new Error('URL inválida'); } if (!/^https?:$/.test(u.protocol)) throw new Error('URL precisa começar com https://');
  const senha = b.senha ? cifrar(b.senha) : null;
  if (b.id) {
    await sql`UPDATE qa_produtos SET nome=${b.nome}, url=${b.url}, url_login=${b.url_login || null}, usuario=${b.usuario || null}, plataforma=${b.plataforma || null}, repo_github=${b.repo_github || null},
      contexto=${b.contexto || null}, ativo=${b.ativo !== false}, rodar_noturno=false, permitir_gravacao=${b.permitir_gravacao !== false}, max_telas=${parseInt(b.max_telas) || 60},
      permitir_carga=${!!b.permitir_carga}, usuarios_simultaneos=${Math.min(200, parseInt(b.usuarios_simultaneos) || 10)},
      senha_cripto=COALESCE(${senha}, senha_cripto), atualizado_em=NOW() WHERE id=${b.id}`;
    return { id: b.id };
  }
  const id = novoId('qap');
  await sql`INSERT INTO qa_produtos (id, nome, url, url_login, usuario, senha_cripto, plataforma, repo_github, contexto, ativo, rodar_noturno, permitir_gravacao, max_telas)
    VALUES (${id}, ${b.nome}, ${b.url}, ${b.url_login || null}, ${b.usuario || null}, ${senha}, ${b.plataforma || null}, ${b.repo_github || null}, ${b.contexto || null}, ${b.ativo !== false}, false, ${b.permitir_gravacao !== false}, ${parseInt(b.max_telas) || 60})`;
  if (b.permitir_carga) await sql`UPDATE qa_produtos SET permitir_carga=true, usuarios_simultaneos=${Math.min(200, parseInt(b.usuarios_simultaneos) || 10)} WHERE id=${id}`;
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
// v3.277: QA de Produtos roda SÓ SOB DEMANDA ("Testar agora" ou robôs da Esteira) — a passada noturna gastava crédito de IA
// testando produto que não mudou. A ação continua existindo para o workflow antigo não quebrar, mas não enfileira nada.
async function roboEnfileirarNoturno() { return { enfileirados: 0, pulado: 'teste noturno desligado: o QA de Produtos roda só sob demanda' }; }
async function roboProximo() {
  const sql = await getSql();
  // execução presa há mais de 2h volta a erro
  await sql`UPDATE qa_execucoes SET status='erro', erro='tempo esgotado (robô não terminou em 2h)', terminado_em=NOW() WHERE status='rodando' AND iniciado_em < NOW() - INTERVAL '2 hours'`;
  // v3.277: execuções da passada noturna que ainda estavam na fila não rodam mais
  await sql`UPDATE qa_execucoes SET status='erro', erro='cancelada: teste noturno desligado (só sob demanda)', terminado_em=NOW() WHERE status='fila' AND origem='noturno'`;
  const e = (await sql`UPDATE qa_execucoes SET status='rodando', iniciado_em=NOW() WHERE id = (SELECT id FROM qa_execucoes WHERE status='fila' ORDER BY pedido_em LIMIT 1) RETURNING *`)[0];
  if (!e) return { execucao: null };
  const p = (await sql`SELECT * FROM qa_produtos WHERE id=${e.produto_id}`)[0];
  let senha = null, senha_status = p.senha_cripto ? 'ok' : 'ausente'; try { senha = decifrar(p.senha_cripto); } catch (_) { senha = null; if (p.senha_cripto) senha_status = 'ilegivel'; }
  const conhecidos = await sql`SELECT assinatura, titulo, status, tela FROM qa_achados WHERE produto_id=${p.id} AND status NOT IN ('validado','falso_positivo','aceito')`;
  // v3.134: casos do plano de testes (aprovado pelo especialista de qualidade) dos projetos ligados a este produto
  let casos = [], planos_rascunho = 0;
  try { const f = await fabSql();
    // cada caso só roda se o plano da sua família (funcional, integração, segurança, desempenho, layout) estiver aprovado
    const projs = await f`SELECT id FROM fab_projetos WHERE qa_produto_id=${p.id}`; const ids = projs.map(x => x.id);
    const aprov = ids.length ? await f`SELECT projeto_id, tipo, status FROM fab_documentos WHERE projeto_id = ANY(${ids}) AND tipo LIKE 'plano_testes%'` : [];
    const okPlano = c => aprov.some(d => d.projeto_id === c.projeto_id && d.tipo === planoDoTipo(c.tipo) && d.status === 'aprovado');
    const todos = ids.length ? await f`SELECT id, projeto_id, codigo, titulo, tipo, requisito_ref, item_codigo, prioridade, pre_condicao, passos, dados, esperado FROM fab_casos WHERE automatizavel AND projeto_id = ANY(${ids}) ORDER BY codigo` : [];
    planos_rascunho = aprov.filter(d => d.status !== 'aprovado').length;
    casos = todos.filter(okPlano).filter(c => !['unitario', 'volumetria', 'resiliencia'].includes(c.tipo))
      .sort((a, b) => (TIPOS_CASO[a.tipo]?.ordem || 99) - (TIPOS_CASO[b.tipo]?.ordem || 99) || ['alta', 'media', 'baixa'].indexOf(a.prioridade) - ['alta', 'media', 'baixa'].indexOf(b.prioridade));
  } catch (err) { console.error('[qa-externo] casos', err.message); }
  return { execucao: { id: e.id, origem: e.origem }, produto: { id: p.id, nome: p.nome, url: p.url, url_login: p.url_login, usuario: p.usuario, senha, plataforma: p.plataforma, contexto: p.contexto,
    permitir_gravacao: p.permitir_gravacao, max_telas: p.max_telas || 60, permitir_carga: !!p.permitir_carga, usuarios_simultaneos: p.usuarios_simultaneos || 10, senha_status }, conhecidos, casos, planos_rascunho };
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
  let casosR = null;
  if (Array.isArray(b.casos_resultados) && b.casos_resultados.length) { try { casosR = await aplicarResultadosCasos(await fabSql(), e.id, b.casos_resultados); } catch (err) { console.error('[qa-externo] casos_resultados', err.message); } }
  const completa = Number(b.cobertura_pct) >= 100 && !b.erro;
  // v3.230: só valida achado de camada que RODOU por inteiro nesta execução — antes, se a IA falhava (ou não dava tempo),
  // os achados de layout, lógica, dados, macaco e jornadas "sumiam" como se tivessem sido corrigidos
  const R = (b.resumo && b.resumo.robos) || {}, ok = k => !R[k] || !R[k].status || R[k].status === 'executado';
  const CAMADA = { logica: ['logica_ia'], dados: ['logica_ia', 'exploratorio'], layout: ['layout'], jornada: ['jornadas'], macaco: ['macaco'], plano: ['plano'], governanca: ['governanca'], integracao: ['integracao'],
    seguranca: ['seguranca'], desempenho: ['exploratorio'], tela: ['exploratorio'], api: ['exploratorio'], responsivo: ['exploratorio'], crud: ['exploratorio'], acesso: ['exploratorio'] };
  const camadaOk = tipo => (CAMADA[tipo] || ['exploratorio']).every(ok);
  const naoRodaram = Object.entries(R).filter(([, v]) => v && v.status && v.status !== 'executado').map(([k, v]) => ({ camada: k, status: v.status, motivo: v.motivo || '' }));
  let validados = 0;
  if (completa) { const pend = await sql`SELECT id, assinatura, tipo FROM qa_achados WHERE produto_id=${pid} AND status IN ('aberto','corrigido','em_correcao')`;
    for (const x of pend) if (!vistos.has(x.assinatura) && camadaOk(x.tipo)) { await sql`UPDATE qa_achados SET status='validado', nota='não reproduzido no reteste completo de ' || ${new Date().toLocaleDateString('pt-BR')}, atualizado_em=NOW() WHERE id=${x.id}`; validados++; } }
  await sql`UPDATE qa_execucoes SET status=${b.erro ? 'erro' : 'concluida'}, terminado_em=NOW(), telas_descobertas=${parseInt(b.telas_descobertas) || 0}, telas_testadas=${parseInt(b.telas_testadas) || 0},
    cobertura_pct=${Number(b.cobertura_pct) || 0}, resumo=${JSON.stringify({ ...(b.resumo || {}), achados: achados.length, validados, casos: casosR, camadas_incompletas: naoRodaram })}, erro=${b.erro || null} WHERE id=${e.id}`;
  return { gravados: achados.length, validados, casos: casosR, camadas_incompletas: naoRodaram };
}
// v3.230: a IA não sabe a data de hoje (achava que era 2024/2025 e marcava "data no futuro" em 2026) — vai em todo prompt
const _hojeQA = () => { const d = new Date(); return { iso: d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), br: d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) }; };
const _dataCtx = () => { const h = _hojeQA(); return `DATA DE HOJE: ${h.br} (${h.iso}, horário de Brasília). Use esta data como referência: datas até hoje são passado/presente; só é "futuro" o que vem depois de ${h.br}. Não considere datas de ${h.iso.slice(0, 4)} como futuras por estarem depois do que você conhece.`; };
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
  const user = `${_dataCtx()}\n\nPRODUTO: ${produto?.nome || ''}\nCONTEXTO DO NEGÓCIO (informado pela Atlantyx): ${String(produto?.contexto || 'não informado').substring(0, 3000)}\n\nTELA: ${tela?.titulo || ''} (${tela?.url || ''})\n\n${String(tela?.conteudo || '').substring(0, 14000)}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: IA_MODEL, max_tokens: 2500, system: sistema, messages: [{ role: 'user', content: user }] }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) return { achados: [], aviso: 'IA: ' + (d.error?.message || r.status) };
  const t = d.content?.[0]?.text || ''; const m = t.match(/\{[\s\S]*\}/);
  try { const j = JSON.parse(m ? m[0] : t); return { achados: (j.achados || []).slice(0, 12), uso: d.usage || null }; } catch (_) { return { achados: [], uso: d.usage || null }; }
}
async function achadosListar({ produto_id, status }) {
  const sql = await getSql();
  const L = status ? await sql`SELECT id, produto_id, execucao_id, tipo, severidade, titulo, descricao, tela, url, evidencia, como_reproduzir, prompt_correcao, status, confirmado, ocorrencias, issue_url, nota, criado_em, atualizado_em, (print IS NOT NULL) AS tem_print FROM qa_achados WHERE produto_id=${produto_id} AND status=${status} ORDER BY atualizado_em DESC`
    : await sql`SELECT id, produto_id, execucao_id, tipo, severidade, titulo, descricao, tela, url, evidencia, como_reproduzir, prompt_correcao, status, confirmado, ocorrencias, issue_url, nota, criado_em, atualizado_em, (print IS NOT NULL) AS tem_print FROM qa_achados WHERE produto_id=${produto_id} ORDER BY CASE status WHEN 'aberto' THEN 0 WHEN 'em_correcao' THEN 1 WHEN 'corrigido' THEN 2 ELSE 3 END, CASE severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, atualizado_em DESC LIMIT 500`;
  const ex = await sql`SELECT * FROM qa_execucoes WHERE produto_id=${produto_id} ORDER BY pedido_em DESC LIMIT 15`;
  return { achados: L, execucoes: ex, tipos: TIPOS };
}
async function achadoStatus({ id, ids, status, nota }) {
  const ok = ['aberto', 'em_correcao', 'corrigido', 'falso_positivo', 'aceito']; if (!ok.includes(status)) throw new Error('status inválido');
  const sql = await getSql(); const lista = ids && ids.length ? ids : [id];
  for (const x of lista) await sql`UPDATE qa_achados SET status=${status}, nota=COALESCE(${nota || null}, nota), atualizado_em=NOW() WHERE id=${x}`;
  return { atualizados: lista.length };
}
async function achadoConfirmar({ id, ids, confirmado = true }) {
  const sql = await getSql(); const lista = ids && ids.length ? ids : [id];
  for (const x of lista) await sql`UPDATE qa_achados SET confirmado=${!!confirmado}, atualizado_em=NOW() WHERE id=${x}`;
  return { atualizados: lista.length };
}
async function _ia(system, content, max = 1500, uso = null) { // v3.276: uso = { } recebe os tokens da chamada
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('ANTHROPIC_API_KEY ausente');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: IA_MODEL, max_tokens: max, system, messages: [{ role: 'user', content }] }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('IA: ' + (d.error?.message || r.status));
  if (uso && d.usage) Object.assign(uso, d.usage);
  const t = (d.content || []).map(c => c.text || '').join(''); const m = t.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : t);
}
// v3.134 · Robô do Plano: decide o PRÓXIMO PASSO de um caso de teste a partir do estado da tela
async function roboPasso({ caso, estado, historico = [] }) {
  const sistema = `Você é o executor automático de casos de teste da Atlantyx. Recebe UM caso de teste (passos e resultado esperado), o ESTADO ATUAL da tela (URL, título, texto visível, botões/links clicáveis e campos) e o histórico de ações já feitas. Decida UMA próxima ação para avançar o caso, ou conclua com o veredito.
Ações: "clicar" (alvo = texto exato de um item da lista de clicáveis), "preencher" (alvo = rótulo/placeholder/nome exato de um campo da lista; valor = texto), "selecionar" (alvo = campo; valor = opção), "navegar" (alvo = URL do mesmo site), "aguardar", "concluir".
Ao concluir: veredito "passou" se o resultado esperado está visível/comprovado na tela; "falhou" se a tela mostra resultado diferente do esperado, erro, ou o fluxo não permite cumprir o passo; "bloqueado" se falta pré-condição/dado/acesso fora do controle do teste (ex.: tela inexistente para este usuário).
Regras: use só alvos que existem no estado; dados de teste fictícios; nunca clique em sair/logout, excluir conta, pagar, comprar ou disparar envios em massa; não repita a mesma ação mais de 2 vezes; se o caso já cumpriu todos os passos, conclua.
Responda SOMENTE JSON: {"acao":"clicar|preencher|selecionar|navegar|aguardar|concluir","alvo":"","valor":"","passo_do_caso":1,"veredito":"passou|falhou|bloqueado|","motivo":"frase curta explicando (no concluir: o que foi observado vs esperado)"}`;
  const user = `${_dataCtx()}\n\nCASO ${caso?.codigo || ''} — ${caso?.titulo || ''}\nTipo: ${caso?.tipo || ''}\nPré-condição: ${caso?.pre_condicao || '—'}\nDados: ${caso?.dados || '—'}\nPassos:\n${(caso?.passos || []).map((p, i) => (i + 1) + '. ' + p).join('\n')}\nResultado esperado: ${caso?.esperado || '—'}\n\nHISTÓRICO:\n${historico.slice(-14).map((h, i) => (i + 1) + '. ' + h).join('\n') || '(nenhuma ação ainda)'}\n\nESTADO ATUAL:\nURL: ${estado?.url || ''}\nTítulo: ${estado?.titulo || ''}\nClicáveis: ${(estado?.clicaveis || []).slice(0, 80).join(' | ')}\nCampos: ${(estado?.campos || []).slice(0, 40).join(' | ')}\nMensagens/erros: ${(estado?.alertas || []).join(' | ') || '—'}\nTexto visível:\n${String(estado?.texto || '').substring(0, 6000)}`;
  const uso = {}; try { return { ...(await _ia(sistema, user, 600, uso)), uso }; } catch (e) { return { acao: 'concluir', veredito: 'bloqueado', motivo: 'IA indisponível: ' + e.message }; }
}
// v3.138 · Robô Usuário IA: monta jornadas como uma pessoa usaria o produto, a partir das telas descobertas
async function roboJornadas({ produto, telas = [], permitir_gravacao, quantidade = 8 }) {
  const sistema = `Você é um testador sênior que usa o sistema como uma PESSOA REAL usaria. Recebe as telas descobertas de um sistema da Atlantyx (título, endereço e trecho do conteúdo) e o contexto do negócio. Monte JORNADAS de teste que façam sentido para o negócio — tarefas completas que um usuário tentaria fazer — e verifique a lógica: o sistema faz o que promete? os números fecham? mensagens claras? estados vazios? dados incoerentes?
Inclua: caminhos felizes das tarefas principais; erros comuns de usuário (campo vazio, formato errado, valor no limite, voltar no meio do fluxo); regras de negócio inferidas das telas.
${permitir_gravacao ? 'Pode incluir cadastros de teste com nomes começando por "QA-ATX".' : 'NÃO inclua jornadas que gravem, alterem ou excluam dados — só navegação, filtros, buscas e conferências.'}
Nunca: pagar, comprar, fazer pedido real, curtir, seguir, convidar, enviar mensagem a pessoas reais, sair da conta, excluir conta.
Passos em linguagem de usuário com nomes de telas/botões/campos como aparecem. Resultado esperado verificável na tela.
Responda SOMENTE JSON: {"jornadas":[{"titulo":"...","tipo":"mundo_ideal|limite|logica","passos":["Abrir /rota","Clicar em \"...\"","Preencher \"Campo\" com \"...\""],"esperado":"...","por_que":"risco ao negócio"}]}`;
  const user = `${_dataCtx()}\n\nPRODUTO: ${produto?.nome || ''}\nCONTEXTO DO NEGÓCIO: ${String(produto?.contexto || 'não informado').substring(0, 3000)}\nQUANTIDADE: até ${Math.min(15, quantidade)} jornadas\n\nTELAS:\n${telas.slice(0, 40).map(t => `- ${t.titulo} (${t.url}): ${String(t.trecho || '').replace(/\s+/g, ' ').substring(0, 500)}`).join('\n')}`;
  const uso = {}; try { const j = await _ia(sistema, user, 5000, uso); return { jornadas: (j.jornadas || []).slice(0, 15), uso }; } catch (e) { return { jornadas: [], aviso: e.message }; }
}
// v3.134 · Robô de Layout de Saída: IA com visão analisa a tela no computador e no celular
async function roboLayout({ produto, tela, imagens = [] }) {
  const sistema = `Você é especialista em UX/UI e revisa o LAYOUT DE SAÍDA de telas de um sistema da Atlantyx (prints do computador e do celular). Aponte só problemas VISÍVEIS e concretos: texto cortado ou sobreposto, elementos desalinhados ou fora da tela, tabelas ilegíveis, números truncados, contraste insuficiente, botões escondidos, estados vazios sem mensagem, gráficos sem legenda/rótulo, inconsistência de fontes/cores, hierarquia confusa, formatação errada de moeda/data/percentual (padrão brasileiro: R$ 1.234,56; 31/12/2026). Não invente; tela boa → lista vazia.
Responda SOMENTE JSON: {"achados":[{"severidade":"alta|media|baixa","titulo":"...","descricao":"onde e o quê","dispositivo":"computador|celular","prompt_correcao":"instrução pronta para a ferramenta do app (ex.: Lovable) corrigir"}]}`;
  const content = [...imagens.slice(0, 2).map(src => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(src).replace(/^data:image\/\w+;base64,/, '') } })),
    { type: 'text', text: `${_dataCtx()}\n\nPRODUTO: ${produto?.nome || ''}\nTELA: ${tela?.titulo || ''} (${tela?.url || ''})\nImagem 1 = computador (1440px); imagem 2 = celular (390px).` }];
  const uso = {}; try { const j = await _ia(sistema, content, 1800, uso); return { achados: (j.achados || []).slice(0, 8), uso }; } catch (e) { return { achados: [], aviso: e.message }; }
}
// v3.139: relatório geral de erros em Word, com o prompt de correção de cada achado para colar no Lovable
// v3.230: quais camadas rodaram na última execução — sem isso não dava para saber se um tipo de achado sumiu
// porque foi corrigido ou porque a camada não rodou (ex.: IA indisponível)
const _CAMADAS_NOME = { exploratorio: 'Exploração das telas (erros, APIs, dados, celular)', logica_ia: 'Lógica de negócio e dados (IA)', plano: 'Plano de testes', jornadas: 'Jornadas do usuário (IA)', macaco: 'Teste do macaco',
  layout: 'Layout de saída (IA com visão)', governanca: 'Governança (LGPD)', integracao: 'Integração (APIs)', seguranca: 'Segurança', desempenho: 'Desempenho', carga: 'Carga e estresse' };
const _CAMADAS_ST = { executado: '✅ executada', parcial: '⚠ parcial', falhou: '❌ falhou', nao_executado: '⏸ não executada' };
function _camadasMd(E) {
  let res = E?.resumo; if (typeof res === 'string') { try { res = JSON.parse(res); } catch (_) { res = null; } }
  const R = res?.robos; if (!R) return [];
  const L = Object.entries(_CAMADAS_NOME).filter(([k]) => R[k]).map(([k, n]) => `| ${n} | ${_CAMADAS_ST[R[k].status] || (k === 'carga' ? '—' : '✅ executada')} | ${String(R[k].motivo || R[k].texto || '').replace(/\|/g, '/').replace(/\s+/g, ' ').substring(0, 220)} |`);
  const inc = Object.entries(R).filter(([k, v]) => k !== 'carga' && v?.status && v.status !== 'executado');
  return ['### Camadas da última execução', '', '| Camada | Situação | Detalhe |', '|---|---|---|', ...L, '',
    inc.length ? `> ⚠ **${inc.length} camada(s) não rodaram por inteiro** (${inc.map(([k]) => _CAMADAS_NOME[k] || k).join(', ')}). Achados desses tipos que não aparecem aqui NÃO foram dados como corrigidos — reexecute antes de considerar o produto limpo.` : '> Todas as camadas rodaram por inteiro nesta execução.', ''];
}
async function relatorioWord({ produto_id, incluir_fechados }) {
  const sql = await getSql(); const P = (await sql`SELECT * FROM qa_produtos WHERE id=${produto_id}`)[0]; if (!P) throw new Error('Produto não encontrado');
  const A = (await sql`SELECT tipo, severidade, titulo, descricao, tela, url, evidencia, como_reproduzir, prompt_correcao, status, ocorrencias, criado_em FROM qa_achados WHERE produto_id=${produto_id} ORDER BY CASE severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, tipo, criado_em`)
    .filter(a => incluir_fechados || ['aberto', 'em_correcao', 'corrigido'].includes(a.status));
  const E = (await sql`SELECT * FROM qa_execucoes WHERE produto_id=${produto_id} AND status IN ('concluida','erro') ORDER BY terminado_em DESC LIMIT 1`)[0];
  const mdc = v => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' }, ST = { aberto: 'Aberto', em_correcao: 'Em correção', corrigido: 'Corrigido — retestar', validado: 'Validado', falso_positivo: 'Falso positivo', aceito: 'Risco aceito' };
  const cont = s2 => A.filter(a => a.severidade === s2).length;
  const porTipo = Object.entries(A.reduce((m, a) => { m[a.tipo] = (m[a.tipo] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const L = ['# Relatório de Erros e Correções', '', `Produto **${P.nome}** (${P.url})${P.plataforma ? ' · ' + P.plataforma : ''} · emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).substring(0, 16)}.`, '',
    '## 1. Resumo', '', '| Indicador | Valor |', '|---|---|', `| Achados ${incluir_fechados ? 'no total' : 'pendentes'} | ${A.length} |`, `| Críticos / altos / médios / baixos | ${cont('critica')} / ${cont('alta')} / ${cont('media')} / ${cont('baixa')} |`,
    ...(E ? [`| Última execução | ${new Date(E.terminado_em || E.pedido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).substring(0, 16)} · ${E.telas_testadas ?? 0} de ${E.telas_descobertas ?? 0} telas (${Number(E.cobertura_pct || 0)}%) |`] : []), '',
    '| Tipo | Achados |', '|---|---|', ...porTipo.map(([t, n]) => `| ${TIPOS[t] || t} | ${n} |`), '',
    ..._camadasMd(E),
    '## 2. Como usar este relatório no Lovable', '', '- Corrija na ordem: críticos, depois altos, médios e baixos.', '- Para cada achado, copie o bloco **Prompt para o Lovable** e cole no chat do projeto no Lovable — um achado por vez, conferindo o resultado.', '- Depois de corrigir, marque o achado como **Corrigido — retestar** no Atlantyx OS (QA de Produtos) e rode o teste de novo: o robô valida ou reabre cada correção.', '- Achados de **segurança** e **dados** pedem atenção também no Supabase (regras de acesso/RLS, chaves e políticas).', '',
    '## 3. Lista de achados', '', '| # | Severidade | Tipo | Achado | Tela | Situação |', '|---|---|---|---|---|---|',
    ...A.map((a, i) => `| ${i + 1} | ${SEV[a.severidade] || a.severidade} | ${TIPOS[a.tipo] || a.tipo} | ${mdc(a.titulo)} | ${mdc(a.tela) || '—'} | ${ST[a.status] || a.status}${a.ocorrencias > 1 ? ' (visto ' + a.ocorrencias + 'x)' : ''} |`), '', '<!-- quebra -->', '', '## 4. Detalhe e correção de cada achado', ''];
  A.forEach((a, i) => {
    L.push(`### ${i + 1}. [${SEV[a.severidade]}] ${mdc(a.titulo)}`, '', `| Campo | Detalhe |`, `|---|---|`, `| Tipo | ${TIPOS[a.tipo] || a.tipo} |`, `| Tela | ${mdc(a.tela) || '—'} |`, `| Endereço | ${mdc(a.url) || '—'} |`, `| Situação | ${ST[a.status] || a.status} |`, '',
      '**O que está errado:**', '', ...String(a.descricao || '—').split('\n').map(x => x.trim()).filter(Boolean).map(x => '> ' + x), '');
    if (a.evidencia && a.evidencia !== a.descricao) L.push('**Evidência:** ' + mdc(a.evidencia).substring(0, 1200), '');
    if (a.como_reproduzir) L.push('**Como reproduzir:**', '', ...String(a.como_reproduzir).split('\n').map(x => x.trim()).filter(Boolean).map(x => /^\d+\./.test(x) ? x : '- ' + x), '');
    L.push('**Prompt para o Lovable:**', '', '> ' + mdc(a.prompt_correcao || `Na tela "${a.tela || ''}" foi encontrado: ${a.titulo}. ${a.descricao || ''} Corrija mantendo o restante do comportamento.`), '');
  });
  L.push('<!-- quebra -->', '', '## 5. Prompt consolidado (correções críticas e altas)', '', 'Use quando quiser pedir ao Lovable várias correções de uma vez (recomendado no máximo 5 por pedido):', '');
  A.filter(a => ['critica', 'alta'].includes(a.severidade)).forEach((a, i) => L.push(`${i + 1}. ${mdc(a.prompt_correcao || a.titulo)}`));
  const { gerarDocx } = await import('../lib/docx-md.js');
  const buf = await gerarDocx(L.join('\n').replace(/^#\s+.*\n/, ''), { titulo: 'Relatório de Erros e Correções', subtitulo: P.nome, projeto: P.nome, cliente: 'Atlantyx', autor: 'QA de Produtos — Atlantyx OS (robôs + IA)', sumario: false });
  return { nome: `Relatorio_Erros_${P.nome}_${new Date().toISOString().substring(0, 10)}.docx`.replace(/[^\wÀ-ú.\- ]+/g, '_'), base64: Buffer.from(buf).toString('base64'), achados: A.length };
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

// ═══════════════════════════════════════════════════════════════════════════
// v3.203 · ANÁLISE ESTÁTICA DE CÓDIGO (upload avulso ou repositório GitHub)
// O código NUNCA é executado (não há ambiente, e não rodamos no ambiente do cliente): a IA lê e aponta erros.
// O código também NÃO é guardado — passa em lotes pela análise; só os apontamentos ficam salvos (kv_store).
// Segredos encontrados (chaves, senhas, tokens) viram apontamento CRÍTICO e são MASCARADOS antes de ir para a IA.
// Acesso: tela própria 's6qacodigo' — dá para liberar só esta ação a um perfil (Acesso → Perfis).
// ═══════════════════════════════════════════════════════════════════════════
const COD_TELA = 's6qacodigo';
const COD_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|vue|svelte|py|java|kt|kts|scala|cs|vb|fs|go|rb|php|rs|swift|m|mm|c|cc|cpp|h|hpp|sql|pks|pkb|prc|fnc|sh|bash|ps1|bat|html?|css|scss|sass|less|ya?ml|json|xml|tf|hcl|gradle|properties|ini|toml|r|dart|lua|pl|groovy|abap|cbl|cob|ipynb)$/i;
const COD_NOME = /(^|\/)(dockerfile|makefile|jenkinsfile|procfile|\.env\.example)$/i;
const COD_IGNORA = /(^|\/)(node_modules|\.git|dist|build|out|target|bin|obj|vendor|coverage|\.next|\.nuxt|\.svelte-kit|__pycache__|\.venv|venv|env|\.idea|\.vscode|\.terraform)\//i;
const COD_IGNORA_ARQ = /(\.min\.(js|css)|\.map|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|poetry\.lock|\.lock|\.snap|\.d\.ts)$/i;
const COD_ENV = /(^|\/)\.env(\.[a-z0-9_-]+)?$/i; // .env versionado (exceto .env.example)
const COD_MAX_ARQ = 150000, COD_MAX_TOTAL = 400, COD_LOTE_CHARS = 45000;
const COD_SEGREDOS = [
  ['Chave privada', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g],
  ['Chave de acesso AWS', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Token do GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['Chave do Google', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['Token do Slack', /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g],
  ['Chave Stripe', /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/g],
  ['Chave Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ['Chave OpenAI', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  ['Senha em string de conexão', /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp|mssql|sqlserver):\/\/[^:\s'"\/]+:[^@\s'"]{3,}@/gi],
  ['Senha/segredo fixo no código', /\b(?:password|passwd|pwd|senha|secret|client_secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/gi],
];
function _podeCodigo(req) { const s = req?.sessao; if (!s) return true; const t = s.telas || []; return !!s.admin || t.includes('*') || t.includes(COD_TELA); }
const _mascara = v => { const x = String(v); return x.length <= 8 ? '••••' : x.slice(0, 4) + '••••' + x.slice(-2); };
function codFiltrar(lista) {
  const analisar = [], ignorados = { pasta: 0, tipo: 0, grande: 0, excesso: 0 }, envs = [];
  for (const a of lista) {
    const path = String(a.path || '').replace(/^\.?\//, ''); if (!path) continue;
    if (COD_IGNORA.test('/' + path)) { ignorados.pasta++; continue; }
    if (COD_ENV.test(path) && !/\.example$|\.sample$|\.template$/i.test(path)) { envs.push(path); continue; }
    if (COD_IGNORA_ARQ.test(path) || !(COD_EXT.test(path) || COD_NOME.test(path))) { ignorados.tipo++; continue; }
    if ((a.size || 0) > COD_MAX_ARQ) { ignorados.grande++; continue; }
    analisar.push({ path, size: a.size || 0 });
  }
  // prioriza código de aplicação sobre configuração quando passa do limite
  const peso = p => /\.(json|ya?ml|xml|toml|ini|properties|html?|css|scss|less|sass)$/i.test(p) ? 1 : 0;
  analisar.sort((x, y) => peso(x.path) - peso(y.path) || x.path.localeCompare(y.path));
  if (analisar.length > COD_MAX_TOTAL) { ignorados.excesso = analisar.length - COD_MAX_TOTAL; analisar.length = COD_MAX_TOTAL; }
  analisar.sort((x, y) => x.path.localeCompare(y.path));
  return { analisar, ignorados, envs };
}
function codSegredos(path, txt) {
  const achados = []; let limpo = String(txt);
  for (const [nome, re] of COD_SEGREDOS) {
    limpo = limpo.replace(re, (m, ...rest) => {
      const off = rest.at(-2); const linha = String(txt).slice(0, typeof off === 'number' ? off : 0).split('\n').length;
      achados.push({ arquivo: path, linha, severidade: 'critica', categoria: 'seguranca', titulo: 'Segredo exposto no código: ' + nome,
        descricao: 'Há um segredo escrito no código-fonte. Quem tem acesso ao repositório (ou ao histórico do Git) pode usá-lo.',
        evidencia: _mascara(m), correcao: 'Revogue/troque este segredo agora, remova-o do código (e do histórico do Git) e leia de uma variável de ambiente ou cofre de segredos.', confianca: 'alta', origem: 'regra' });
      return '[SEGREDO_MASCARADO]';
    });
  }
  return { achados, limpo };
}
const _numera = t => String(t).split('\n').map((l, i) => String(i + 1).padStart(4, ' ') + '| ' + l).join('\n');
async function codIA(arquivos, ctx) {
  const sistema = `Você é um revisor sênior de código fazendo ANÁLISE ESTÁTICA: o código NÃO é executado. Leia os arquivos e aponte DEFEITOS REAIS: bugs e erros de lógica, exceções não tratadas, falhas de segurança (injeção de SQL/comando, XSS, autenticação/autorização ausente, dados sensíveis expostos, criptografia fraca, CORS aberto, desserialização insegura), condições de corrida, vazamento de recursos, problemas de desempenho graves (consulta em laço, N+1, carga sem limite), tratamento de dados incorreto (datas, moeda, nulos, fuso), código morto que esconde erro e violações graves de boas práticas que causam defeito.
Regras: só aponte o que você consegue mostrar no código recebido; NÃO invente arquivos, funções ou linhas; use a numeração de linha mostrada ("  12| ..."); ignore estilo e formatação puros; se depender de algo que não está no lote, diga isso na descrição e use confiança "baixa"; [SEGREDO_MASCARADO] já foi tratado — não aponte de novo; no máximo 25 apontamentos, os mais graves primeiro; textos em português do Brasil, curtos e diretos.
Responda SOMENTE com JSON: {"achados":[{"arquivo":"caminho exato","linha":12,"severidade":"critica|alta|media|baixa","categoria":"bug|seguranca|desempenho|logica|dados|manutencao|boas_praticas","titulo":"até 90 caracteres","descricao":"o problema e o impacto, até 400 caracteres","evidencia":"trecho curto do código","correcao":"como corrigir, com código curto se ajudar","confianca":"alta|media|baixa"}]}`;
  const corpo = (ctx.contexto ? 'CONTEXTO DO SISTEMA (dado pelo usuário): ' + String(ctx.contexto).slice(0, 1500) + '\n' : '')
    + (ctx.foco ? 'FOCO DA ANÁLISE: ' + String(ctx.foco).slice(0, 300) + '\n' : '')
    + (ctx.estrutura?.length ? 'ESTRUTURA DO PROJETO (só caminhos, para contexto):\n' + ctx.estrutura.slice(0, 250).join('\n') + '\n' : '')
    + '\nARQUIVOS DESTE LOTE:\n' + arquivos.map(a => '=== ' + a.path + ' ===\n' + _numera(a.conteudo)).join('\n\n');
  const r = await _ia(sistema, corpo, 6000);
  const validos = new Set(arquivos.map(a => a.path));
  return (Array.isArray(r?.achados) ? r.achados : []).filter(a => a && a.titulo).slice(0, 25).map(a => ({
    arquivo: validos.has(a.arquivo) ? a.arquivo : (arquivos.find(x => String(a.arquivo || '').endsWith(x.path) || x.path.endsWith(String(a.arquivo || '')))?.path || String(a.arquivo || '').slice(0, 300)),
    linha: Number.isFinite(Number(a.linha)) ? Number(a.linha) : null, severidade: SEV.includes(a.severidade) ? a.severidade : 'media',
    categoria: String(a.categoria || 'bug').slice(0, 30), titulo: String(a.titulo).slice(0, 140), descricao: String(a.descricao || '').slice(0, 900),
    evidencia: String(a.evidencia || '').slice(0, 600), correcao: String(a.correcao || '').slice(0, 1500), confianca: ['alta', 'media', 'baixa'].includes(a.confianca) ? a.confianca : 'media', origem: 'ia' }));
}
// ── GitHub (somente leitura) ──
function _ghRepo(url) { const m = String(url || '').trim().match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/tree\/([^\s#?]+))?\/?$/i) || String(url || '').trim().match(/^([\w.-]+)\/([\w.-]+)$/); if (!m) throw new Error('Informe o repositório como https://github.com/dono/repo ou dono/repo'); return { dono: m[1], repo: m[2], ramo: m[3] || null }; }
async function _gh(caminho, token, raw) {
  const r = await fetch('https://api.github.com' + caminho, { headers: { Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'User-Agent': 'atlantyx-qa-codigo', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(r.status === 404 ? 'Repositório ou arquivo não encontrado (se for privado, informe um token de leitura)' : r.status === 403 && /rate limit/i.test(d.message || '') ? 'Limite de consultas do GitHub atingido — informe um token de leitura e tente de novo' : 'GitHub ' + r.status + ': ' + (d.message || '')); }
  return raw ? r.text() : r.json();
}
const _codKey = id => 'qa:codigo:' + id;
async function _kvLer(sql, k) { const r = await sql`SELECT value FROM kv_store WHERE key = ${k}`; if (!r[0]) return null; return typeof r[0].value === 'string' ? JSON.parse(r[0].value) : r[0].value; }
async function _kvGravar(sql, k, v) { await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; }
async function _codIndice(sql, item, remover) {
  const lista = (await _kvLer(sql, 'qa:codigo:indice')) || [];
  const nova = lista.filter(x => x.id !== (item?.id || remover)); if (item) nova.unshift(item);
  await _kvGravar(sql, 'qa:codigo:indice', nova.slice(0, 200));
}
const _codResumo = a => ({ id: a.id, nome: a.nome, origem: a.origem, repo: a.repo || null, ramo: a.ramo || null, status: a.status, criado_em: a.criado_em, criado_por: a.criado_por || null,
  arquivos_total: a.arquivos_total, arquivos_analisados: a.arquivos_analisados, contagem: ['critica', 'alta', 'media', 'baixa'].reduce((o, k) => (o[k] = (a.achados || []).filter(x => x.severidade === k && !['falso_positivo', 'corrigido'].includes(x.status)).length, o), {}) });
// 1) preparar: lista os arquivos (upload: o navegador manda a lista; repo: lê a árvore no GitHub) e cria a análise
async function codigoPreparar(b, req) {
  const sql = await getSql(); const id = novoId('cod'); const agora = new Date().toISOString();
  let lista, meta = {};
  if (b.origem === 'repo') {
    const { dono, repo, ramo } = _ghRepo(b.repo); const token = String(b.token || '').trim() || null;
    const info = await _gh(`/repos/${dono}/${repo}`, token); const ref = String(b.ramo || ramo || info.default_branch || 'main');
    const arv = await _gh(`/repos/${dono}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, token);
    lista = (arv.tree || []).filter(x => x.type === 'blob').map(x => ({ path: x.path, size: x.size }));
    meta = { repo: `${dono}/${repo}`, ramo: ref, commit: arv.sha, truncado: !!arv.truncated, privado: !!info.private };
  } else lista = (Array.isArray(b.arquivos) ? b.arquivos : []).map(x => ({ path: x.path, size: x.size }));
  if (!lista.length) throw new Error('Nenhum arquivo recebido');
  const f = codFiltrar(lista);
  const achados = f.envs.map(p => ({ arquivo: p, linha: null, severidade: 'critica', categoria: 'seguranca', titulo: 'Arquivo .env versionado/enviado', descricao: 'Arquivos .env costumam guardar senhas e chaves. O conteúdo NÃO foi lido nem enviado para a IA.', evidencia: p, correcao: 'Tire o arquivo do repositório (e do histórico), adicione ao .gitignore, troque os segredos que estavam nele e mantenha só um .env.example sem valores.', confianca: 'alta', origem: 'regra' }));
  const an = { id, nome: String(b.nome || meta.repo || 'Análise avulsa').slice(0, 120), origem: b.origem === 'repo' ? 'repo' : 'upload', ...meta, contexto: String(b.contexto || '').slice(0, 1500), foco: String(b.foco || '').slice(0, 300),
    status: 'analisando', criado_em: agora, criado_por: req?.usuario || null, arquivos_total: f.analisar.length, arquivos_analisados: 0, ignorados: f.ignorados,
    pendentes: f.analisar.map(x => x.path), estrutura: lista.map(x => x.path).filter(p => !COD_IGNORA.test('/' + p)).slice(0, 400), lotes: 0, erros: [],
    achados: achados.map((a, i) => ({ ...a, id: 'a' + i, status: 'aberto' })) };
  await _kvGravar(sql, _codKey(id), an); await _codIndice(sql, _codResumo(an));
  return { analise: { ...an, pendentes: undefined }, arquivos: f.analisar.map(x => x.path), ignorados: f.ignorados };
}
// 2) lote: analisa o próximo lote. Upload → o navegador manda o conteúdo; repo → o servidor baixa do GitHub
async function codigoLote(b) {
  const sql = await getSql(); const an = await _kvLer(sql, _codKey(b.id)); if (!an) throw new Error('Análise não encontrada');
  if (an.status !== 'analisando') return { analise: _codResumo(an), fim: true };
  let arquivos = [];
  if (an.origem === 'repo') {
    const token = String(b.token || '').trim() || null; const [dono, repo] = an.repo.split('/'); let soma = 0;
    while (an.pendentes.length && soma < COD_LOTE_CHARS && arquivos.length < 25) {
      const path = an.pendentes.shift();
      try { const enc = path.split('/').map(encodeURIComponent).join('/'), ref = encodeURIComponent(an.commit || an.ramo);
        // sem token (repositório público): raw.githubusercontent.com não consome o limite de 60 chamadas/hora da API
        const txt = token ? await _gh(`/repos/${dono}/${repo}/contents/${enc}?ref=${ref}`, token, true)
          : await fetch(`https://raw.githubusercontent.com/${dono}/${repo}/${ref}/${enc}`, { headers: { 'User-Agent': 'atlantyx-qa-codigo' } }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
        if (/\u0000/.test(txt.slice(0, 2000))) continue; arquivos.push({ path, conteudo: txt }); soma += txt.length; }
      catch (e) { an.erros.push(path + ': ' + e.message); }
    }
  } else {
    const rec = (Array.isArray(b.arquivos) ? b.arquivos : []).filter(x => an.pendentes.includes(x.path));
    for (const x of rec) { an.pendentes = an.pendentes.filter(p => p !== x.path); if (!/\u0000/.test(String(x.conteudo || '').slice(0, 2000))) arquivos.push({ path: x.path, conteudo: String(x.conteudo || '').slice(0, COD_MAX_ARQ) }); }
  }
  const novos = [];
  for (const a of arquivos) { const s = codSegredos(a.path, a.conteudo); a.conteudo = s.limpo; novos.push(...s.achados); }
  if (arquivos.length) {
    try { novos.push(...await codIA(arquivos, { contexto: an.contexto, foco: an.foco, estrutura: an.estrutura })); }
    catch (e) { an.erros.push('lote ' + (an.lotes + 1) + ': ' + e.message); }
  }
  const base = an.achados.length; an.achados.push(...novos.map((a, i) => ({ ...a, id: 'a' + (base + i), status: 'aberto' })));
  an.arquivos_analisados += arquivos.length; an.lotes++;
  if (!an.pendentes.length) an.status = 'concluida';
  await _kvGravar(sql, _codKey(an.id), an); await _codIndice(sql, _codResumo(an));
  return { analise: _codResumo(an), novos: novos.length, pendentes: an.pendentes.length, fim: !an.pendentes.length, erros: an.erros.slice(-3) };
}
async function codigoObter({ id }) { const sql = await getSql(); const an = await _kvLer(sql, _codKey(id)); if (!an) throw new Error('Análise não encontrada'); const { pendentes, estrutura, ...resto } = an; return { analise: { ...resto, pendentes: (pendentes || []).length } }; }
async function codigoStatus({ id, achado_id, status, nota }) {
  if (!['aberto', 'confirmado', 'corrigido', 'falso_positivo'].includes(status)) throw new Error('status inválido');
  const sql = await getSql(); const an = await _kvLer(sql, _codKey(id)); if (!an) throw new Error('Análise não encontrada');
  const a = an.achados.find(x => x.id === achado_id); if (!a) throw new Error('Apontamento não encontrado');
  a.status = status; if (nota != null) a.nota = String(nota).slice(0, 500);
  await _kvGravar(sql, _codKey(id), an); await _codIndice(sql, _codResumo(an)); return { ok: true };
}

async function handler(req, res) {
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  try {
    const robo = _ehRobo(req);
    const soRobo = f => async () => { if (!robo) { const e = new Error('Só o robô de QA (CRON_SECRET) pode chamar esta ação'); e.code = 403; throw e; } return f(); };
    // v3.203: análise de código só para quem tem a tela 'QA · Análise de Código' no perfil (ou admin)
    if (String(b.action || '').startsWith('codigo_') && !_podeCodigo(req)) { const e = new Error('Seu perfil não tem acesso à Análise de Código'); e.code = 403; throw e; }
    const acoes = {
      codigo_listar: async () => { const sql = await getSql(); return { analises: (await _kvLer(sql, 'qa:codigo:indice')) || [] }; },
      codigo_preparar: () => codigoPreparar(b, req),
      codigo_lote: () => codigoLote(b),
      codigo_obter: () => codigoObter(b),
      codigo_status: () => codigoStatus(b),
      codigo_excluir: async () => { const sql = await getSql(); await sql`DELETE FROM kv_store WHERE key = ${_codKey(b.id)}`; await _codIndice(sql, null, b.id); return { ok: true }; },
      kanban: () => kanban(),
      produto_salvar: () => produtoSalvar(b),
      produto_obter: async () => { const sql = await getSql(); const p = (await sql`SELECT * FROM qa_produtos WHERE id=${b.id}`)[0]; if (!p) throw new Error('não encontrado'); return { produto: _semSenha(p) }; },
      produto_excluir: async () => { const sql = await getSql(); await sql`DELETE FROM qa_produtos WHERE id=${b.id}`; return { ok: true }; },
      executar: () => executar({ produto_id: b.produto_id }),
      achados: () => achadosListar(b),
      achado_status: () => achadoStatus(b),
      achado_tarefa: () => achadoTarefa(b),
      achado_confirmar: () => achadoConfirmar(b),
      relatorio_word: () => relatorioWord(b),
      achado_print: async () => { const sql = await getSql(); return { print: (await sql`SELECT print FROM qa_achados WHERE id=${b.id}`)[0]?.print || null }; },
      robo_tem_fila: soRobo(async () => { const sql = await getSql(); return { fila: (await sql`SELECT COUNT(*)::int AS n FROM qa_execucoes WHERE status='fila'`)[0].n }; }),
      robo_enfileirar_noturno: soRobo(() => roboEnfileirarNoturno()),
      robo_proximo: soRobo(() => roboProximo()),
      robo_resultado: soRobo(() => roboResultado(b)),
      robo_criticar: soRobo(() => roboCriticar(b)),
      robo_passo: soRobo(() => roboPasso(b)),
      // v3.136: andamento da execução (etapa, %, telas, achados) para a tela acompanhar ao vivo
      robo_progresso: soRobo(async () => { const sql = await getSql(); await sql`UPDATE qa_execucoes SET progresso=${JSON.stringify({ ...(b.progresso || {}), em: new Date().toISOString() })} WHERE id=${b.execucao_id} AND status='rodando'`; return { ok: true }; }),
      robo_layout: soRobo(() => roboLayout(b)),
      robo_jornadas: soRobo(() => roboJornadas(b)),
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) {
    console.error('[qa-externo]', b.action, e.message);
    return res.status(e.code === 403 ? 403 : 500).json({ success: false, error: e.message });
  }
}
export { executar as executarQa };
export default comGuarda(handler, 'qa-externo');
