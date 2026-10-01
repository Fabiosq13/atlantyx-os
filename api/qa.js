// api/qa.js — v3.16
// Backend dos agentes de QUALIDADE (QA) e SEGURANÇA do Atlantyx OS.
//
// QA:
//   crud_suite       → ciclo REAL incluir → consultar → alterar → excluir em cadastros que o sistema
//                      consegue apagar depois (marca "QA-TESTE"); limpeza garantida no final
//   salvar_execucao / listar_execucoes / obter_execucao → histórico das varreduras (kv_store)
// SEGURANÇA:
//   seguranca        → varredura DEFENSIVA do próprio sistema:
//                      • sondas somente-leitura nas APIs sem credencial (dados expostos? CORS?)
//                      • cabeçalhos de segurança do site
//                      • variáveis de ambiente (presença, nunca o valor)
//                      • análise estática do código-fonte do backend e das páginas públicas
//                      Nunca devolve dados sensíveis — só contagens e evidências neutras.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const MARCA = 'QA-TESTE';

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  return _sql;
}
async function kvGet(key) { const sql = await getSql(); const r = await sql`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`; const v = r[0]?.value; return typeof v === 'string' ? JSON.parse(v) : v ?? null; }
async function kvSet(key, value) { const sql = await getSql(); await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; }

// Chama o handler de outra API no mesmo processo (sem HTTP)
async function chamar(modulo, body) {
  const mod = await import(`./${modulo}.js`);
  let out = null, status = 200;
  const res = { status(c) { status = c; return this; }, json(o) { out = o; return this; }, send(b) { try { out = JSON.parse(b); } catch (_) { out = { raw: String(b).substring(0, 200) }; } return this; }, setHeader() {}, end() { return this; } };
  await mod.default({ method: 'POST', body, query: {}, headers: {} }, res);
  return { status, ...(out || {}) };
}

// ═══════════════════════ QA: CRUD REAL COM LIMPEZA ═══════════════════════
async function crudSuite() {
  const marca = `${MARCA}-${Date.now().toString(36)}`;
  const resultados = [];
  const teste = async (entidade, passos) => {
    const r = { entidade, passos: [], ok: true };
    const ctx = {};
    const passo = async (nome, fn) => {
      const t0 = Date.now();
      try { const detalhe = await fn(ctx); r.passos.push({ passo: nome, ok: true, ms: Date.now() - t0, detalhe: detalhe || '' }); }
      catch (e) { r.ok = false; r.passos.push({ passo: nome, ok: false, ms: Date.now() - t0, erro: String(e.message || e).substring(0, 300) }); throw e; }
    };
    try { await passos(passo, ctx); }
    catch (_) {}
    finally { if (ctx.limpar) { try { await ctx.limpar(); r.passos.push({ passo: 'limpeza', ok: true }); } catch (e) { r.passos.push({ passo: 'limpeza', ok: false, erro: e.message }); r.ok = false; } } }
    resultados.push(r);
  };
  const exige = (cond, msg) => { if (!cond) throw new Error(msg); };
  const hoje = new Date().toISOString().substring(0, 10);

  await teste('Despesas programadas (financeiro)', async (passo, ctx) => {
    await passo('incluir', async () => { const d = await chamar('financeiro', { action: 'desp_save', params: { descricao: marca, valor: 1.23, recorrencia: 'unica', data_inicio: hoje, categoria: 'QA' } });
      exige(d.success, d.error || 'falhou'); ctx.id = d.id || d.despesa?.id; exige(ctx.id, 'não devolveu o id'); ctx.limpar = () => chamar('financeiro', { action: 'desp_delete', params: { id: ctx.id } }); return 'id ' + ctx.id; });
    await passo('consultar', async () => { const d = await chamar('financeiro', { action: 'desp_list', params: {} }); const x = (d.despesas || []).find(z => z.id === ctx.id); exige(x, 'registro incluído não aparece na lista'); exige(Number(x.valor) === 1.23, 'valor gravado diferente: ' + x.valor); return 'encontrado'; });
    await passo('alterar', async () => { const d = await chamar('financeiro', { action: 'desp_save', params: { id: ctx.id, descricao: marca + '-ALT', valor: 4.56, recorrencia: 'unica', data_inicio: hoje, categoria: 'QA' } }); exige(d.success, d.error || 'falhou');
      const l = await chamar('financeiro', { action: 'desp_list', params: {} }); const x = (l.despesas || []).filter(z => String(z.descricao || '').startsWith(marca)); exige(x.length === 1, `alteração gerou ${x.length} registro(s) — esperado 1 (alterar não pode duplicar)`); exige(Number(x[0].valor) === 4.56, 'valor não foi alterado'); return 'alterado'; });
    await passo('excluir', async () => { const d = await chamar('financeiro', { action: 'desp_delete', params: { id: ctx.id } }); exige(d.success, d.error || 'falhou'); ctx.limpar = null;
      const l = await chamar('financeiro', { action: 'desp_list', params: {} }); exige(!(l.despesas || []).some(z => z.id === ctx.id), 'ainda aparece depois de excluir'); return 'excluído'; });
  });

  await teste('Contratos (financeiro)', async (passo, ctx) => {
    await passo('incluir', async () => { const d = await chamar('financeiro', { action: 'contrato_save', params: { numero_contrato: marca, projeto: 'QA', data_inicio: hoje, prazo_meses: 1 } });
      exige(d.success, d.error || 'falhou'); ctx.id = d.id || d.contrato?.id; exige(ctx.id, 'não devolveu o id'); ctx.limpar = () => chamar('financeiro', { action: 'contrato_delete', params: { id: ctx.id } }); return 'id ' + ctx.id; });
    await passo('consultar', async () => { const d = await chamar('financeiro', { action: 'contrato_list', params: {} }); exige((d.contratos || d.lista || []).some(z => z.id === ctx.id), 'não aparece na lista'); return 'encontrado'; });
    await passo('alterar', async () => { const d = await chamar('financeiro', { action: 'contrato_save', params: { id: ctx.id, numero_contrato: marca, projeto: 'QA-ALT', data_inicio: hoje, prazo_meses: 2 } }); exige(d.success, d.error || 'falhou');
      const l = await chamar('financeiro', { action: 'contrato_list', params: {} }); const x = (l.contratos || l.lista || []).filter(z => z.numero_contrato === marca); exige(x.length === 1, `alteração gerou ${x.length} registro(s)`); exige(x[0].projeto === 'QA-ALT', 'campo não foi alterado'); return 'alterado'; });
    await passo('excluir', async () => { const d = await chamar('financeiro', { action: 'contrato_delete', params: { id: ctx.id } }); exige(d.success, d.error || 'falhou'); ctx.limpar = null; return 'excluído'; });
  });

  await teste('Lançamentos simulados (fluxo de caixa)', async (passo, ctx) => {
    await passo('incluir', async () => { const d = await chamar('financeiro', { action: 'sim_save', params: { data: hoje, descricao: marca, tipo: 'entrada', valor: 1, categoria: 'QA' } });
      exige(d.success, d.error || 'falhou'); ctx.id = d.id || d.simulado?.id; exige(ctx.id, 'não devolveu o id'); ctx.limpar = () => chamar('financeiro', { action: 'sim_delete', params: { id: ctx.id } }); return 'id ' + ctx.id; });
    await passo('consultar', async () => { const d = await chamar('financeiro', { action: 'sim_list', params: { data_inicio: hoje, data_fim: hoje } }); const lst = d.simulados || d.lancamentos || d.lista || []; exige(lst.some(z => z.id === ctx.id), 'não aparece na lista'); return 'encontrado'; });
    await passo('alterar', async () => { const d = await chamar('financeiro', { action: 'sim_save', params: { id: ctx.id, data: hoje, descricao: marca + '-ALT', tipo: 'entrada', valor: 2, categoria: 'QA' } }); exige(d.success, d.error || 'falhou'); return 'alterado'; });
    await passo('excluir', async () => { const d = await chamar('financeiro', { action: 'sim_delete', params: { id: ctx.id } }); exige(d.success, d.error || 'falhou'); ctx.limpar = null;
      const l = await chamar('financeiro', { action: 'sim_list', params: { data_inicio: hoje, data_fim: hoje } }); exige(!(l.simulados || l.lancamentos || l.lista || []).some(z => z.id === ctx.id), 'ainda aparece depois de excluir'); return 'excluído'; });
  });

  await teste('Business Plan', async (passo, ctx) => {
    const prem = { meses: 36, receitas: [{ nome: 'QA', tipo: 'recorrente', preco: 1000, novos_mes: [1, 1, 1] }] };
    await passo('incluir', async () => { const d = await chamar('business-plan', { action: 'salvar', tipo: 'qa', titulo: marca, premissas: prem });
      exige(d.success, d.error || 'falhou'); ctx.id = d.bp?.id; exige(ctx.id, 'não devolveu o id'); ctx.limpar = () => chamar('business-plan', { action: 'excluir', id: ctx.id }); return 'id ' + ctx.id; });
    await passo('consultar', async () => { const d = await chamar('business-plan', { action: 'obter', id: ctx.id }); exige(d.success && d.bp?.resultado?.indicadores, 'não retornou o plano calculado'); return 'VPL ' + Math.round(d.bp.resultado.indicadores.vpl); });
    await passo('alterar', async () => { const d = await chamar('business-plan', { action: 'salvar', id: ctx.id, tipo: 'qa', titulo: marca + '-ALT', premissas: { ...prem, taxa_desconto_anual: 20 } }); exige(d.success && d.bp?.id === ctx.id, 'salvar criou outro registro em vez de alterar'); return 'alterado'; });
    await passo('excluir', async () => { const d = await chamar('business-plan', { action: 'excluir', id: ctx.id }); exige(d.success, d.error || 'falhou'); ctx.limpar = null;
      const o = await chamar('business-plan', { action: 'obter', id: ctx.id }); exige(!o.success, 'ainda existe depois de excluir'); return 'excluído'; });
  });

  await teste('Armazenamento chave-valor (/api/db)', async (passo, ctx) => {
    const key = 'qa:' + marca;
    ctx.limpar = () => chamar('db', { action: 'delete', key });
    await passo('incluir', async () => { const d = await chamar('db', { action: 'set', key, value: { v: 1 } }); exige(d.success, d.error || 'falhou'); });
    await passo('consultar', async () => { const d = await chamar('db', { action: 'get', key }); exige(d.value?.v === 1, 'valor lido diferente'); });
    await passo('alterar', async () => { await chamar('db', { action: 'set', key, value: { v: 2 } }); const d = await chamar('db', { action: 'get', key }); exige(d.value?.v === 2, 'valor não foi alterado'); });
    await passo('excluir', async () => { await chamar('db', { action: 'delete', key }); const d = await chamar('db', { action: 'get', key }); exige(d.value == null, 'ainda existe depois de excluir'); ctx.limpar = null; });
  });

  await teste('Ideias (pipeline S1)', async (passo, ctx) => {
    const id = 'qa_' + marca;
    ctx.limpar = async () => { const sql = await getSql(); await sql`DELETE FROM ideias WHERE id = ${id}`; };
    await passo('incluir', async () => { const d = await chamar('db', { action: 'save_ideia', value: { id, titulo: marca, stage: 'Recebida', desc: 'teste automático' } }); exige(d.success, d.error || 'falhou'); });
    await passo('consultar', async () => { const d = await chamar('db', { action: 'list_ideias' }); exige((d.ideias || []).some(z => z.id === id), 'não aparece no pipeline'); });
    await passo('alterar', async () => { await chamar('db', { action: 'save_ideia', value: { id, titulo: marca, stage: 'Viabilidade' } }); const d = await chamar('db', { action: 'list_ideias' }); const x = (d.ideias || []).filter(z => z.id === id); exige(x.length === 1 && x[0].stage === 'Viabilidade', 'etapa não foi alterada ou duplicou'); });
    await passo('excluir (limpeza direta no banco — a API não tem exclusão de ideia)', async () => { await ctx.limpar(); ctx.limpar = null; });
  });

  // Varredura final: nenhum registro de teste pode sobrar
  const sobras = [];
  try {
    const sql = await getSql();
    const q = async (nome, rows) => { if (rows.length) sobras.push(`${nome}: ${rows.length}`); };
    await q('despesas_programadas', await sql`SELECT id FROM despesas_programadas WHERE descricao LIKE ${MARCA + '%'}`.catch(() => []));
    await q('contratos_financeiros', await sql`SELECT id FROM contratos_financeiros WHERE numero_contrato LIKE ${MARCA + '%'}`.catch(() => []));
    await q('ideias', await sql`SELECT id FROM ideias WHERE titulo LIKE ${MARCA + '%'}`.catch(() => []));
    await q('kv_store', await sql`SELECT key FROM kv_store WHERE key LIKE ${'qa:' + MARCA + '%'}`.catch(() => []));
  } catch (_) {}
  return { marca, resultados, sobras, ok: resultados.every(r => r.ok) && !sobras.length };
}

// ═══════════════════════ SEGURANÇA ═══════════════════════
function lerArquivos(dir, filtro, max = 400) {
  const out = [];
  const walk = d => { let itens = []; try { itens = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const it of itens) { if (out.length >= max) return; const p = path.join(d, it.name);
      if (it.isDirectory()) { if (!/node_modules|\.git|fonts|modelos|media$/.test(it.name)) walk(p); }
      else if (filtro.test(it.name)) { try { const st = fs.statSync(p); if (st.size < 6e6) out.push({ arquivo: path.relative(RAIZ, p), texto: fs.readFileSync(p, 'utf8') }); } catch (_) {} } } };
  walk(dir); return out;
}
function linhaDe(texto, idx) { return texto.substring(0, idx).split('\n').length; }

function analiseEstatica() {
  const achados = [];
  const add = (sev, cat, titulo, arquivo, linha, evidencia, correcao) => achados.push({ severidade: sev, categoria: cat, titulo, arquivo, linha, evidencia: String(evidencia || '').substring(0, 200), correcao });
  const apis = lerArquivos(path.join(RAIZ, 'api'), /\.js$/);
  const libs = lerArquivos(path.join(RAIZ, 'lib'), /\.js$/);
  const pubs = lerArquivos(path.join(RAIZ, 'public'), /\.(html|js)$/);
  const cobertura = { api: apis.length, lib: libs.length, public: pubs.length };
  const segredos = [
    [/sk-ant-[A-Za-z0-9_-]{20,}/, 'Chave da Anthropic'], [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, 'Token do GitHub'], [/AKIA[0-9A-Z]{16}/, 'Chave AWS'],
    [/xox[bpa]-[A-Za-z0-9-]{20,}/, 'Token do Slack'], [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'Chave privada'], [/(?:senha|password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{6,}['"]/i, 'Senha escrita no código'],
    [/postgres(?:ql)?:\/\/[^:\s'"]+:[^@\s'"]+@/, 'String de conexão com senha'], [/AIza[0-9A-Za-z_-]{35}/, 'Chave Google API'],
  ];
  for (const f of [...apis, ...libs, ...pubs]) {
    for (const [re, nome] of segredos) { const m = f.texto.match(re); if (m && !/process\.env|placeholder|exemplo|xxxx/i.test(f.texto.substring(Math.max(0, m.index - 40), m.index + 60)))
      add('crítica', 'segredo exposto', `${nome} escrito no código`, f.arquivo, linhaDe(f.texto, m.index), m[0].substring(0, 8) + '…(ocultado)', 'Remover o valor do código, rotacionar a credencial (considerar vazada) e ler de variável de ambiente do Vercel.'); }
  }
  // Autenticação: handlers de API sem nenhuma verificação de credencial
  const publicosEsperados = /lead-capture|qb-oauth|media\.js$|health|captura|cartao|portal-cadastro|cron/;
  const semAuth = [];
  for (const f of apis) {
    if (!/export default async function handler/.test(f.texto)) continue;
    const temAuth = /req\.headers\.(authorization|\[?['"]x-)|verificarAcesso|exigirAuth|APP_ACCESS|x-atx-key/i.test(f.texto);
    const soCron = /CRON_SECRET/.test(f.texto);
    if (!temAuth && !publicosEsperados.test(f.arquivo)) semAuth.push(f.arquivo);
    else if (soCron && !/verificarAcesso|APP_ACCESS|x-atx-key/i.test(f.texto) && !publicosEsperados.test(f.arquivo)) semAuth.push(f.arquivo + ' (só o cron é protegido)');
  }
  if (semAuth.length) add('crítica', 'autenticação', `${semAuth.length} APIs aceitam chamadas sem nenhuma credencial`, 'api/*.js', null, semAuth.slice(0, 40).join(', '),
    'Criar lib/auth.js com verificação de uma chave/sessão (ex.: cabeçalho X-Atx-Key comparado a APP_ACCESS_TOKEN, ou login com sessão assinada) e exigir em todos os handlers, exceto os públicos por natureza (lead-capture, captura.html, cartão digital, callback OAuth do QuickBooks, crons com CRON_SECRET). Na tela, pedir a chave/login uma vez e enviar em todas as chamadas.');
  // CORS aberto
  const cors = apis.filter(f => /Access-Control-Allow-Origin['"],\s*['"]\*['"]/.test(f.texto)).map(f => f.arquivo);
  if (cors.length) add('alta', 'CORS', `${cors.length} APIs liberam CORS para qualquer site (*)`, 'api/*.js', null, cors.slice(0, 30).join(', '),
    'Restringir Access-Control-Allow-Origin ao domínio do sistema (ex.: https://atlantyx-os.vercel.app) nas APIs internas; manter * só nas públicas (captura de lead).');
  // KV genérico: leitura/escrita de qualquer chave
  const db = apis.find(f => /api[\\/]db\.js$/.test(f.arquivo));
  if (db && /action === 'get'/.test(db.texto) && !/key\.startsWith|chavesPermitidas|PERMITIDAS/.test(db.texto))
    add('crítica', 'exposição de dados', 'Ação "get" do /api/db lê QUALQUER chave do kv_store — inclusive tokens OAuth (qb:tokens)', db.arquivo, linhaDe(db.texto, db.texto.indexOf("action === 'get'")), "action === 'get' → SELECT value FROM kv_store WHERE key = ${key}",
      'Criar lista de chaves permitidas para leitura/escrita pela tela (prefixos de dados de UI) e bloquear chaves de credenciais (qb:*, *token*, *secret*). Nunca devolver tokens ao navegador.');
  // SQL montado com texto (possível injeção)
  for (const f of [...apis, ...libs]) {
    const re = /_q\([^,]+,\s*`[^`]*\$\{(?![^}]*\bcol\b)[^}]+\}[^`]*`/g; let m;
    while ((m = re.exec(f.texto))) add('média', 'injeção de SQL', 'SQL montado por interpolação de texto em _q()', f.arquivo, linhaDe(f.texto, m.index), m[0].substring(0, 140), 'Usar parâmetros ($1, $2…) ou o template sql`` do Neon em vez de interpolar valores no texto do SQL; se for nome de coluna, validar contra uma lista fixa.');
  }
  // eval / new Function
  for (const f of [...apis, ...libs, ...pubs]) { const re = /\beval\s*\(|new Function\s*\(/g; let m; while ((m = re.exec(f.texto))) add('alta', 'execução dinâmica', 'Uso de eval/new Function', f.arquivo, linhaDe(f.texto, m.index), f.texto.substring(m.index, m.index + 80), 'Remover eval/new Function; usar JSON.parse ou funções explícitas.'); }
  // Proxy aberto para a IA (custo)
  const claude = apis.find(f => /api[\\/]claude\.js$/.test(f.arquivo));
  if (claude && !/verificarAcesso|APP_ACCESS|x-atx-key|authorization/i.test(claude.texto)) add('alta', 'abuso de custo', '/api/claude repassa pedidos à Anthropic sem autenticação — qualquer pessoa pode usar a chave da empresa', claude.arquivo, null, 'handler sem verificação de credencial', 'Exigir autenticação e limitar tamanho/quantidade de pedidos (rate limit por IP/sessão).');
  // Upload aberto
  const up = apis.find(f => /media-upload\.js$/.test(f.arquivo));
  if (up && !/verificarAcesso|APP_ACCESS|x-atx-key/i.test(up.texto)) add('alta', 'upload aberto', 'Upload de arquivos sem autenticação — o domínio pode ser usado para hospedar arquivos de terceiros', up.arquivo, null, 'POST /api/media-upload aceita qualquer arquivo', 'Exigir autenticação; restringir tipos (imagem/PDF/XML) e tamanho; validar content-type pelo conteúdo.');
  // Frontend: innerHTML com dados sem escape (contagem) e links sem noopener
  const idx = pubs.find(f => /index\.html$/.test(f.arquivo));
  if (idx) {
    const inner = (idx.texto.match(/\.innerHTML\s*=\s*[^;]*\$\{/g) || []).length;
    const esc = (idx.texto.match(/replace\(\/<\/g/g) || []).length;
    if (inner > 50) add('média', 'XSS', `${inner} atribuições de innerHTML com dados interpolados; poucas passam por escape (${esc} usos de escape)`, idx.arquivo, null, 'innerHTML = `...${dado}...`',
      'Criar função única de escape (esc) e aplicá-la a todo dado vindo de API/usuário/IA antes de interpolar em HTML; priorizar textos de terceiros (leads, e-mails lidos, respostas da IA, RFPs, feed).');
    const blank = (idx.texto.match(/target="_blank"(?![^>]*noopener)/g) || []).length;
    if (blank) add('baixa', 'tabnabbing', `${blank} links target="_blank" sem rel="noopener"`, idx.arquivo, null, 'target="_blank"', 'Adicionar rel="noopener noreferrer" a todos os links que abrem em nova aba.');
    const ls = idx.texto.match(/localStorage\.setItem\([^)]*(token|senha|password|secret)/i);
    if (ls) add('alta', 'armazenamento', 'Credencial salva no localStorage', idx.arquivo, linhaDe(idx.texto, ls.index), ls[0], 'Não guardar credenciais no navegador.');
  }
  // Logs com segredos
  for (const f of apis) { const re = /console\.(log|error|warn)\([^)]*(process\.env\.[A-Z_]*(KEY|TOKEN|PASS|SECRET)[A-Z_]*)/g; let m;
    while ((m = re.exec(f.texto))) add('alta', 'vazamento em log', 'Valor de segredo escrito no log', f.arquivo, linhaDe(f.texto, m.index), m[0].substring(0, 120), 'Nunca registrar o valor de variáveis secretas; registrar só se estão presentes.'); }
  return { achados, cobertura };
}

async function sondasRuntime(base) {
  const achados = [], sondas = [];
  const add = (sev, cat, titulo, evidencia, correcao, alvo) => achados.push({ severidade: sev, categoria: cat, titulo, evidencia, correcao, arquivo: alvo || null });
  const probe = async (nome, url, init = {}) => {
    const t0 = Date.now();
    try { const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 12000);
      const r = await fetch(url, { ...init, signal: ac.signal }); clearTimeout(tm);
      const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (_) {}
      const s = { nome, url: url.replace(base, ''), status: r.status, ms: Date.now() - t0, cors: r.headers.get('access-control-allow-origin'), headers: Object.fromEntries(['content-security-policy', 'x-frame-options', 'strict-transport-security', 'x-content-type-options', 'referrer-policy', 'permissions-policy'].map(h => [h, r.headers.get(h)])), json: j };
      sondas.push({ nome, status: s.status, ms: s.ms, cors: s.cors }); return s;
    } catch (e) { sondas.push({ nome, erro: e.message }); return null; }
  };
  const post = (b) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  // Sondas SOMENTE LEITURA, sem credencial — o que um estranho na internet consegue ver?
  const expostos = [];
  const avaliar = async (nome, url, init, contar) => { const s = await probe(nome, url, init); if (s && s.status === 200 && s.json && s.json.success !== false) { const n = contar(s.json); if (n > 0) expostos.push(`${nome}: ${n} registro(s)`); } return s; };
  await avaliar('Leads (/api/db list_leads)', base + '/api/db', post({ action: 'list_leads' }), j => (j.leads || []).length);
  await avaliar('Ideias (/api/db list_ideias)', base + '/api/db', post({ action: 'list_ideias' }), j => (j.ideias || []).length);
  await avaliar('Contratos (/api/financeiro contrato_list)', base + '/api/financeiro', post({ action: 'contrato_list', params: {} }), j => (j.contratos || j.lista || []).length);
  await avaliar('Termos de faturamento (/api/faturamento termo_list)', base + '/api/faturamento', post({ action: 'termo_list', payload: {} }), j => (j.termos || j.lista || []).length);
  await avaliar('Leads do CRM (/api/crm leads_list)', base + '/api/crm', post({ action: 'leads_list', params: {} }), j => (j.leads || j.lista || []).length);
  await avaliar('Funcionários (/api/rh funcionario_list)', base + '/api/rh', post({ action: 'funcionario_list', params: {} }), j => (j.funcionarios || j.lista || []).length);
  if (expostos.length) add('crítica', 'exposição de dados', 'Dados internos acessíveis por qualquer pessoa na internet, sem login', expostos.join(' · '),
    'Implementar autenticação em todas as APIs internas (ver achado de autenticação). Depois, repetir esta varredura: estas sondas devem responder 401.', 'api/*.js');
  const tok = await probe('Chave qb:tokens via /api/db get', base + '/api/db', post({ action: 'get', key: 'qb:tokens' }));
  if (tok && tok.status === 200 && tok.json?.value) add('crítica', 'credencial exposta', 'Tokens OAuth do QuickBooks podem ser lidos por qualquer pessoa via /api/db (action get, key qb:tokens)', 'A sonda recebeu um valor não vazio (conteúdo omitido deste relatório)',
    'Bloquear imediatamente chaves de credencial no /api/db (lista de chaves permitidas) e, após corrigir, revogar/renovar a conexão do QuickBooks (os tokens podem ter sido lidos).', 'api/db.js');
  // Cabeçalhos de segurança do site
  const home = await probe('Página inicial', base + '/');
  if (home) {
    const falta = Object.entries(home.headers).filter(([, v]) => !v).map(([k]) => k);
    if (falta.length) add('média', 'cabeçalhos', 'Cabeçalhos de segurança ausentes no site', falta.join(', '),
      'Adicionar em vercel.json → "headers": Content-Security-Policy (fontes/scripts permitidos: self, fonts.googleapis.com, fonts.gstatic.com, cdnjs.cloudflare.com, cdn.jsdelivr.net), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy mínimo. HSTS a Vercel já aplica no domínio .vercel.app.', 'vercel.json');
  }
  const dbCors = sondas.find(s => s.nome.startsWith('Leads (/api/db') && s.cors === '*');
  if (dbCors) add('alta', 'CORS', 'APIs de dados respondem com Access-Control-Allow-Origin: * — qualquer site pode ler os dados a partir do navegador de um usuário', 'CORS * em /api/db', 'Restringir a origem ao domínio do sistema.', 'api/db.js');
  const schema = await probe('Diagnóstico de schema (/api/financeiro?manutencao=schema)', base + '/api/financeiro?manutencao=schema');
  if (schema && schema.status === 200) add('média', 'exposição de estrutura', 'Rota de manutenção expõe a estrutura do banco sem autenticação', '/api/financeiro?manutencao=schema → 200', 'Proteger rotas de manutenção/diagnóstico com autenticação de administrador.', 'api/financeiro.js');
  const up = await probe('Upload (/api/media-upload?status=1)', base + '/api/media-upload?status=1');
  // Variáveis de ambiente (só presença)
  const env = k => !!process.env[k];
  if (!env('CRON_SECRET')) add('alta', 'configuração', 'CRON_SECRET não configurado — rotas de cron podem ser disparadas por qualquer pessoa', 'CRON_SECRET ausente', 'Criar CRON_SECRET no Vercel e exigir Authorization: Bearer ${CRON_SECRET} em todas as rotas de cron.');
  if (!env('APP_ACCESS_TOKEN')) add('info', 'configuração', 'Não há chave de acesso da aplicação (APP_ACCESS_TOKEN)', 'variável ausente', 'Definir APP_ACCESS_TOKEN ao implementar a autenticação das APIs.');
  if (process.env.DATABASE_URL && !/sslmode=require/.test(process.env.DATABASE_URL)) add('baixa', 'configuração', 'DATABASE_URL sem sslmode=require explícito', 'conexão Neon', 'Incluir ?sslmode=require na string de conexão.');
  return { achados, sondas };
}

async function seguranca(base) {
  const t0 = Date.now();
  const est = analiseEstatica();
  const run = await sondasRuntime(base);
  const ordem = { 'crítica': 0, 'alta': 1, 'média': 2, 'baixa': 3, 'info': 4 };
  const achados = [...run.achados, ...est.achados].sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
  const resumo = achados.reduce((o, a) => { o[a.severidade] = (o[a.severidade] || 0) + 1; return o; }, {});
  return { base, executado_em: new Date().toISOString(), duracao_ms: Date.now() - t0, resumo, achados, sondas: run.sondas, cobertura_codigo: est.cobertura };
}

// ═══════════════════════ QA DE MARKETING — PONTA A PONTA (v3.23) ═══════════════════════
// Executado em PASSOS (cada chamada < 120s), orquestrado pelo navegador (qa-agent.js):
//   preflight → campanha → imagem → stories → reel → link → publicar → verificar (repetido) → apagar → limpar → analise_leads
// Tudo que é criado leva a marca QA-TESTE e é removido no fim. O post de teste é publicado de verdade
// (com o texto "[TESTE ATLANTYX]") e apagado em seguida pelo Metricool.
async function _api(base, rota, body, ms = 110000) {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), ms); const t0 = Date.now();
  try {
    const r = await fetch(base + rota, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const txt = await r.text(); let d = {}; try { d = JSON.parse(txt); } catch (_) { d = { raw: txt.substring(0, 300) }; }
    return { http: r.status, ms: Date.now() - t0, ...d };
  } catch (e) { return { http: 0, ms: Date.now() - t0, success: false, error: e.name === 'AbortError' ? 'tempo esgotado' : e.message }; }
  finally { clearTimeout(tm); }
}
async function _head(url) {
  try { const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 15000);
    let r = await fetch(url, { method: 'HEAD', signal: ctrl.signal }); if (r.status === 405) r = await fetch(url, { signal: ctrl.signal, headers: { Range: 'bytes=0-1024' } });
    clearTimeout(tm); return { ok: r.ok, status: r.status, tipo: r.headers.get('content-type') || '', tamanho: parseInt(r.headers.get('content-length') || '0') };
  } catch (e) { return { ok: false, status: 0, erro: e.message }; }
}
async function _seguirLink(url, max = 6) {
  const cadeia = []; let atual = url;
  for (let i = 0; i < max; i++) {
    try { const r = await fetch(atual, { redirect: 'manual' }); cadeia.push({ url: atual.substring(0, 200), status: r.status });
      const loc = r.headers.get('location'); if (r.status >= 300 && r.status < 400 && loc) { atual = new URL(loc, atual).toString(); continue; }
      return { final: atual, status: r.status, cadeia, html: r.status === 200 ? (await r.text()).substring(0, 20000) : '' };
    } catch (e) { cadeia.push({ url: atual.substring(0, 200), erro: e.message }); return { final: atual, status: 0, cadeia }; }
  }
  return { final: atual, status: 0, cadeia, erro: 'redirecionamentos demais' };
}
const _slug = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').substring(0, 60);

async function mktPasso(base, passo, c = {}) {
  const A = []; const add = (sev, titulo, evidencia, sugestao, onde) => A.push({ sev, cat: 'marketing', titulo, evidencia: String(evidencia || '').substring(0, 600), sugestao: sugestao || '', onde: onde || '' });
  const ctx = { ...c };
  const cont = { passo, ok: true };
  const bid = x => ({ ...x, ...(ctx.blog_id ? { blog_id: ctx.blog_id } : {}) }); // marca do Metricool escolhida na tela
  if (passo === 'preflight') {
    const st = await _api(base, '/api/metricool', { action: 'status', payload: bid({}) });
    ctx.redes_conectadas = (st.redes_conectadas || []).map(r => String(r.rede || r.network || r).toLowerCase());
    cont.metricool = { configurado: !!st.configurado, marca: st.marca || null, redes: ctx.redes_conectadas };
    if (!st.configurado) add('alta', 'Metricool não configurado', st.error || JSON.stringify(st).substring(0, 200), 'Configurar METRICOOL_TOKEN/USER_ID/BLOG_ID no Vercel.', 'api/metricool.js');
    else if (!ctx.redes_conectadas.length) add('alta', 'Nenhuma rede conectada no Metricool', 'status sem redes', 'Conectar LinkedIn/Instagram/Facebook na marca do Metricool usada pelo sistema.', 'Metricool');
    const cap = await _seguirLink(base + '/captura.html?utm_source=qa&utm_campaign=qa_preflight');
    cont.captura = { status: cap.status, tem_formulario: /enviar\(\)/.test(cap.html || '') };
    if (cap.status !== 200 || !cont.captura.tem_formulario) add('crítica', 'Página de captura indisponível', `HTTP ${cap.status}`, 'Sem a captura.html no ar nenhum clique vira lead.', 'public/captura.html');
    cont.env = { anthropic: !!process.env.ANTHROPIC_API_KEY, gerador_imagem: !!(process.env.IDEOGRAM_API_KEY || process.env.OPENAI_API_KEY), hubspot: !!process.env.HUBSPOT_TOKEN,
      whatsapp_comercial: !!(process.env.WHATSAPP_COMERCIAL || process.env.FUNDADOR_WHATSAPP), link_reuniao_servidor: !!process.env.LINK_REUNIAO, media_public_base: !!process.env.MEDIA_PUBLIC_BASE };
    if (!cont.env.whatsapp_comercial) add('média', 'Página de captura sem WhatsApp comercial', 'WHATSAPP_COMERCIAL não definido', 'Definir WHATSAPP_COMERCIAL no Vercel — o lead ganha um atalho para falar na hora.', 'Vercel env');
    if (!cont.env.hubspot) add('média', 'HubSpot não configurado', 'HUBSPOT_TOKEN ausente', 'Leads ficam só no Atlantyx, sem CRM/negócio.', 'Vercel env');
    ctx.marca = 'QA-TESTE-' + Date.now().toString(36);
    ctx.campanha_id = 'camp_qa_' + Date.now().toString(36);
  }
  else if (passo === 'campanha') {
    const pl = { campanha: ctx.marca + ' · Dados em tempo real para energia', objetivo: 'Gerar leads qualificados (reuniões)', canal: 'LinkedIn', publico: 'CIO/CTO — Energia',
      contexto: 'Teste automático do agente de QA. Oferta: diagnóstico gratuito de 30 min sobre dados operacionais atrasados em empresas de energia.' };
    const f1 = await _api(base, '/api/s2-creative', { action: 'campanha_fase1', payload: pl });
    cont.fase1 = { http: f1.http, ms: f1.ms, ok: !!(f1.narrativa && f1.copy) };
    if (!cont.fase1.ok) { add('alta', 'Geração da campanha (fase 1: narrativa + copy) falhou', f1.error || JSON.stringify(f1).substring(0, 300), 'Ver api/s2-creative.js campanhaFase1 e ANTHROPIC_API_KEY.', 'api/s2-creative.js'); cont.ok = false; }
    else { ctx.narrativa = f1.narrativa; ctx.copy = f1.copy; ctx.pl = pl; }
  }
  else if (passo === 'campanha_redes') {
    // fase 2 separada: cada passo cabe no limite de tempo da função
    const pl = ctx.pl || {}; const f1 = { narrativa: ctx.narrativa, copy: ctx.copy };
    if (!f1.copy) { cont.ok = false; return { ...cont, achados: A, ctx }; }
    {
      const f2 = await _api(base, '/api/s2-creative', { action: 'campanha_fase2', payload: { campanha: pl.campanha, canal: pl.canal, narrativa: f1.narrativa, copy: f1.copy, redes: ['linkedin', 'instagram', 'facebook'] } });
      cont.fase2 = { http: f2.http, ms: f2.ms, ok: !!(f2.copy_por_rede || f2.post) };
      if (!cont.fase2.ok) add('alta', 'Geração da campanha (fase 2: design + copy por rede) falhou', f2.error || JSON.stringify(f2).substring(0, 300), '', 'api/s2-creative.js campanhaFase2');
      const v0 = f1.copy?.versoes?.[0] || {};
      const textoBase = (v0.headline ? v0.headline + '\n\n' : '') + (v0.corpo || '');
      ctx.narrativa = f1.narrativa; ctx.copy = f1.copy; ctx.copy_por_rede = f2.copy_por_rede || {}; ctx.texto_post = textoBase.substring(0, 1200);
      cont.amostra = { headline: v0.headline || null, corpo: (v0.corpo || '').substring(0, 300), cta: v0.cta || f1.narrativa?.call_to_action || null, redes: Object.keys(f2.copy_por_rede || {}) };
      if (!v0.cta && !/agend|convers|diagn|fale|clique|link|saiba/i.test(textoBase)) add('média', 'Copy sem chamada para ação', textoBase.substring(0, 160), 'Toda peça de geração de leads precisa de CTA explícito (ex.: "Agende um diagnóstico de 30 min").', 'api/s2-creative.js copywriter');
      for (const [rede, lim] of [['linkedin', 3000], ['instagram', 2200], ['facebook', 63206]]) {
        const t = typeof ctx.copy_por_rede[rede] === 'string' ? ctx.copy_por_rede[rede] : (ctx.copy_por_rede[rede]?.texto || ctx.copy_por_rede[rede]?.copy || '');
        if (t && t.length > lim) add('média', `Copy de ${rede} acima do limite da rede`, `${t.length} caracteres (limite ${lim})`, 'Cortar no gerador por rede.', 'api/s2-creative.js');
      }
      // grava a campanha de teste (testa a persistência) — removida no passo limpar
      const sv = await _api(base, '/api/db', { action: 'save_campanha', value: { id: ctx.campanha_id, nome: pl.campanha, obj: pl.objetivo, canal: 'LinkedIn', pub: pl.publico, ctx: pl.contexto, status: 'rascunho', ativa: false,
        redes_ativas: { linkedin: true }, data: { narrativa: f1.narrativa, copy: f1.copy, copy_por_rede: ctx.copy_por_rede }, imagens: [], criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() } });
      cont.persistencia = { http: sv.http, ok: sv.http === 200 && sv.success !== false };
      if (!cont.persistencia.ok) add('alta', 'Campanha gerada não foi gravada no banco', sv.error || sv.raw || sv.http, '', 'api/db.js save_campanha');
    }
  }
  else if (passo === 'imagem') {
    const ig = await _api(base, '/api/image-gen', { prompt: 'Executive dashboard of real-time energy grid data, dark navy and electric blue, clean corporate style, no text', formato: 'ASPECT_1_1', estilo: 'DESIGN', quantidade: 1 }, 100000);
    const im = (ig.imagens || [])[0];
    cont.gerador = { http: ig.http, ms: ig.ms, provedor: ig.provedor || 'ideogram', permanente: !!im?.permanente, url: im?.url || null };
    if (!im?.url) { add('alta', 'Geração de imagem falhou', ig.error || ig.dica || JSON.stringify(ig).substring(0, 300), 'Conferir IDEOGRAM_API_KEY/crédito ou OPENAI_API_KEY (reserva).', 'api/image-gen.js'); cont.ok = false; }
    else {
      ctx.imagem_url = im.url;
      if (!im.permanente) add('média', 'Imagem gerada não ficou permanente', im.url.substring(0, 120), 'A cópia para /api/media falhou — a imagem vai expirar.', 'api/image-gen.js _persistir');
      const h = await _head(im.url); cont.imagem_publica = h;
      if (!h.ok || !/image/.test(h.tipo)) add('alta', 'Imagem não acessível publicamente (o Metricool não conseguiria baixar)', `HTTP ${h.status} ${h.tipo}`, '', 'api/media.js');
    }
  }
  else if (passo === 'stories') {
    const sp = await _api(base, '/api/s2-creative', { action: 'story_pack', payload: { narrativa: ctx.narrativa || {}, copy: ctx.copy || {}, link: base + '/captura.html', canal: 'Instagram' } });
    cont.pack = { http: sp.http, ms: sp.ms, n: (sp.stories || []).length };
    if ((sp.stories || []).length < 3) add('alta', 'Pacote de Stories não foi gerado', sp.error || JSON.stringify(sp).substring(0, 200), '', 'api/s2-creative.js story_pack');
    else {
      const longos = sp.stories.filter(x => String(x.texto_tela || '').split(/\s+/).length > 22);
      if (longos.length) add('baixa', 'Story com texto longo demais para a tela', longos.map(x => x.texto_tela).join(' | ').substring(0, 200), 'Limite de 18 palavras por story.', 'api/s2-creative.js story_pack');
      if (!sp.stories.some(x => x.cta_sticker || /link|toque|clique|arraste/i.test(x.texto_tela || ''))) add('média', 'Stories sem chamada para o link', 'nenhum story pede o toque no link', 'O último story precisa do sticker de link com CTA.', 'api/s2-creative.js story_pack');
      if (ctx.imagem_url) {
        const s0 = sp.stories[0];
        const cp = await _api(base, '/api/media', { action: 'story_compor', payload: { url: ctx.imagem_url, titulo: s0.texto_tela || 'Teste', apoio: sp.stories[1]?.texto_tela || '', chamada: 'Toque no link', link: base + '/captura.html' } });
        cont.arte = { http: cp.http, ms: cp.ms, url: cp.url || null };
        if (!cp.url) add('alta', 'Composição da arte do Story falhou', cp.error || JSON.stringify(cp).substring(0, 200), '', 'api/media.js story_compor');
        else { const h = await _head(cp.url); cont.arte.publica = h; ctx.story_url = cp.url; if (!h.ok) add('alta', 'Arte do Story não acessível publicamente', `HTTP ${h.status}`, '', 'api/media.js'); }
      }
    }
  }
  else if (passo === 'reel') {
    const rp = await _api(base, '/api/s2-creative', { action: 'reel_pack', payload: { narrativa: ctx.narrativa || {}, copy: ctx.copy || {}, canal: 'Instagram', n_slides: 5 } });
    cont.pack = { http: rp.http, ms: rp.ms, slides: (rp.slides || []).length, legenda: !!rp.legenda, hashtags: (rp.hashtags || []).length };
    if ((rp.slides || []).length < 3) add('alta', 'Roteiro do Reel não foi gerado', rp.error || JSON.stringify(rp).substring(0, 200), '', 'api/s2-creative.js reel_pack');
    else {
      if (!rp.legenda) add('média', 'Reel sem legenda', '', '', 'api/s2-creative.js reel_pack');
      if (rp.slides.some(x => String(x.texto_tela || '').split(/\s+/).length > 14)) add('baixa', 'Slide de Reel com texto longo', '', 'Máx. 12 palavras por slide.', 'api/s2-creative.js reel_pack');
      cont.observacao = 'O vídeo MP4 do Reel é montado no navegador (tela Nova Campanha → Reels); este teste valida o roteiro e a hospedagem de mídia. A publicação de Reel exige o MP4 hospedado.';
    }
  }
  else if (passo === 'link') {
    const camp = _slug(ctx.campanha_id || 'qa');
    const reuniao = 'https://meetings.hubspot.com/atlantyx';
    ctx.link = `${base}/captura.html?r=${encodeURIComponent(reuniao)}&utm_source=linkedin&utm_medium=social&utm_campaign=${camp}&utm_content=qa`;
    const sl = await _seguirLink(ctx.link);
    cont.pagina = { status: sl.status, tem_formulario: /enviar\(\)/.test(sl.html || ''), le_utm: /utm_campaign/.test(sl.html || '') };
    if (!cont.pagina.tem_formulario) add('crítica', 'O link da campanha não abre o formulário de captura', `HTTP ${sl.status}`, '', 'public/captura.html');
    const sql = await getSql();
    // visita
    const vi = await _api(base, '/api/lead-capture', { evento: 'visita', utm: { source: 'linkedin', medium: 'social', campaign: camp, content: 'qa' }, page: '/captura.html' });
    let vis = []; try { vis = await sql`SELECT id FROM captura_visitas WHERE campanha = ${camp}`; } catch (_) {}
    cont.visita = { http: vi.http, gravada: vis.length > 0 };
    if (!vis.length) add('alta', 'Visita à página de captura não é registrada', `HTTP ${vi.http}`, 'Sem registrar a visita não dá para medir clique → página → lead.', 'api/lead-capture.js evento visita');
    try { await sql`DELETE FROM captura_visitas WHERE campanha = ${camp}`; } catch (_) {}
    // lead (modo teste: sem e-mail, IA, HubSpot, WhatsApp)
    const ld = await _api(base, '/api/lead-capture', { qa_teste: true, name: 'Lead ' + ctx.marca, company: 'Atlantyx QA', title: 'CIO', email: 'qa+' + camp + '@atlantyx.local', source: 'linkedin', campaign_name: camp,
      utm: { source: 'linkedin', medium: 'social', campaign: camp, content: 'qa' }, form_name: 'qa-marketing' });
    let lr = []; try { lr = await sql`SELECT id, origem, campanha FROM leads WHERE campanha = ${camp}`; } catch (_) {}
    cont.lead = { http: ld.http, modo_teste: !!ld.qa_teste, gravado: lr.length > 0, origem: lr[0]?.origem || null, campanha: lr[0]?.campanha || null, etapas: ld.etapas || null };
    if (!lr.length) add('crítica', 'Lead enviado pela página de captura não foi gravado', JSON.stringify(ld).substring(0, 300), '', 'api/lead-capture.js gravarLeadLocal');
    else if (lr[0].campanha !== camp || lr[0].origem !== 'linkedin') add('alta', 'Lead gravado sem a campanha/origem correta', JSON.stringify(lr[0]), 'A atribuição por UTM está quebrada.', 'api/lead-capture.js');
    try { await sql`DELETE FROM leads WHERE campanha = ${camp}`; } catch (_) {}
  }
  else if (passo === 'publicar') {
    const redes = (c.redes_teste && c.redes_teste.length ? c.redes_teste : (ctx.redes_conectadas || []).filter(r => ['linkedin', 'facebook', 'instagram'].includes(r)));
    if (!redes.length) { add('alta', 'Sem rede para publicar o teste', 'nenhuma rede conectada', '', 'Metricool'); cont.ok = false; }
    else {
      const texto = `[TESTE ATLANTYX — verificação automática do sistema, será removido em instantes]\n\n${(ctx.texto_post || 'Post de teste').substring(0, 500)}\n\n👉 ${ctx.link || base + '/captura.html'}`;
      const pb = await _api(base, '/api/metricool', { action: 'publicar', payload: bid({ texto, redes, imagem_url: ctx.imagem_url || null, encurtar_link: true }) }, 90000);
      cont.publicacao = { http: pb.http, ms: pb.ms, metricool_id: pb.metricool_id || null, agendado_para: pb.agendado_para || null, redes };
      if (!pb.metricool_id) { add('alta', 'Publicação no Metricool falhou', pb.error || JSON.stringify(pb).substring(0, 400), pb.hint || pb.dica || '', 'api/metricool.js publicar'); cont.ok = false; }
      ctx.metricool_id = pb.metricool_id || null; ctx.redes_publicadas = redes; ctx.publicado_em = Date.now();
    }
  }
  else if (passo === 'verificar') {
    const hoje = new Date(); const ini = new Date(hoje.getTime() - 864e5).toISOString().substring(0, 10), fim = new Date(hoje.getTime() + 864e5).toISOString().substring(0, 10);
    const ls = await _api(base, '/api/metricool', { action: 'listar_posts', payload: bid({ inicio: ini, fim, detalhe: true }) });
    const post = (ls.posts || []).find(p => String(p.id) === String(ctx.metricool_id));
    cont.post = post ? { status: post.status, providers: post.providers || [] } : null;
    const esperaMin = Math.round((Date.now() - (ctx.publicado_em || Date.now())) / 60000);
    cont.minutos_desde_publicacao = esperaMin;
    if (!post) { cont.pronto = esperaMin >= 8; if (cont.pronto) add('alta', 'Post de teste não aparece no Metricool', 'id ' + ctx.metricool_id, '', 'api/metricool.js'); }
    else {
      const erros = (post.providers || []).filter(p => /error|fail/i.test(String(p.status || '') + ' ' + String(p.erro || '')));
      const publicados = (post.providers || []).filter(p => /publish/i.test(String(p.status || '')) || p.url);
      cont.pronto = post.status === 'publicado' || publicados.length === (post.providers || []).length || erros.length > 0 || esperaMin >= 8;
      if (erros.length) add('alta', 'Rede recusou o post de teste', erros.map(e => `${e.rede}: ${e.erro || e.status}`).join(' | '), 'Ver a mensagem da rede no Metricool (permissão, mídia, tamanho do texto).', 'Metricool / api/metricool.js');
      if (cont.pronto && !publicados.length && !erros.length) add('média', 'Post de teste não foi publicado no prazo', `status ${post.status} após ${esperaMin} min`, 'Conferir a fila do Metricool e o fuso de publicação.', 'api/metricool.js publicar');
      ctx.urls_publicas = publicados.map(p => ({ rede: p.rede, url: p.url })).filter(x => x.url);
      cont.urls_publicas = ctx.urls_publicas;
      // link dentro do post (encurtado pelo Metricool) → tem de chegar na captura com a UTM
      const m = String(post.texto_completo || '').match(/https?:\/\/\S+/g) || [];
      const linkNoPost = m.find(u => !/linkedin\.com|facebook\.com|instagram\.com/.test(u)) || null;
      cont.link_no_post = linkNoPost;
      if (linkNoPost) { const sl = await _seguirLink(linkNoPost.replace(/[).,]+$/, ''));
        cont.link_destino = { final: sl.final, status: sl.status, saltos: sl.cadeia.length };
        if (!/captura\.html/.test(sl.final) || !/utm_campaign=/.test(sl.final)) add('alta', 'O link publicado não chega à página de captura com a UTM', `${linkNoPost} → ${sl.final}`, 'O encurtador perdeu a UTM ou o destino está errado.', 'api/metricool.js shortener');
      }
      for (const u of (ctx.urls_publicas || [])) { const h = await _seguirLink(u.url, 3); u.http = h.status; }
    }
  }
  else if (passo === 'apagar') {
    if (ctx.metricool_id) {
      const ex = await _api(base, '/api/metricool', { action: 'excluir', payload: bid({ metricool_id: ctx.metricool_id }) });
      cont.exclusao = { http: ex.http, ok: !!ex.excluido };
      if (!ex.excluido) add('alta', 'Não consegui apagar o post de teste pelo Metricool', ex.error || JSON.stringify(ex).substring(0, 200), 'Apague manualmente nas redes: ' + (ctx.urls_publicas || []).map(u => u.url).join(' '), 'api/metricool.js excluir');
      cont.aviso = (ctx.urls_publicas || []).length ? 'Se o post já tinha saído na rede, confira se ele sumiu também lá: ' + ctx.urls_publicas.map(u => `${u.rede}: ${u.url}`).join(' · ') : null;
    }
  }
  else if (passo === 'limpar') {
    if (ctx.campanha_id) { const d = await _api(base, '/api/db', { action: 'delete_campanha', key: ctx.campanha_id }); cont.campanha_removida = d.http === 200; }
  }
  else if (passo === 'analise_leads') {
    Object.assign(cont, await analiseLeads(base, add));
  }
  return { ...cont, achados: A, ctx };
}

// Por que as campanhas não geram leads — junta os números de cada etapa do funil e aponta o gargalo
async function analiseLeads(base, add) {
  const sql = await getSql();
  const out = { funil: {}, causas: [] };
  const q = async (f, d = []) => { try { return await f(); } catch (_) { return d; } };
  const aud = await _api(base, '/api/metricool', { action: 'auditoria_funil', payload: {} }, 100000);
  out.auditoria = { veredito: aud.veredito || null, problemas: aud.problemas || [], funil_por_rede: aud.funil_por_rede || null, erro: aud.error || null };
  const vis = await q(() => sql`SELECT origem, COUNT(*)::int n FROM captura_visitas WHERE criado_em > NOW() - INTERVAL '30 days' GROUP BY origem`);
  const lds = await q(() => sql`SELECT COALESCE(origem,'?') origem, COALESCE(campanha,'?') campanha, COUNT(*)::int n FROM leads WHERE criado_em > NOW() - INTERVAL '30 days' AND COALESCE(status,'') <> 'qa_teste' GROUP BY 1,2 ORDER BY 3 DESC`);
  const pubsKv = await q(async () => { const r = await sql`SELECT value FROM kv_store WHERE key = 'atx:publicacoes' LIMIT 1`; const v = r[0]?.value; return typeof v === 'string' ? JSON.parse(v) : (v || []); });
  const pubs30 = (Array.isArray(pubsKv) ? pubsKv : []).filter(p => Date.parse(p.agendado_para || p.criado_em || 0) > Date.now() - 30 * 864e5);
  const destino = l => !l ? 'sem link' : /captura\.html/.test(l) ? 'captura' : /meetings\.hubspot|calendly/.test(l) ? 'agenda direta' : 'outro';
  const porDestino = pubs30.reduce((o, p) => { const k = destino(p.link_destino); o[k] = (o[k] || 0) + 1; return o; }, {});
  const semUtm = pubs30.filter(p => p.link_destino && !/utm_campaign=/.test(p.link_destino)).length;
  const fu = await q(() => sql`SELECT status, COUNT(*)::int n FROM followups GROUP BY status`);
  out.funil = { publicacoes_30d: pubs30.length, por_destino: porDestino, sem_utm: semUtm,
    visitas_30d: vis.reduce((a, r) => a + r.n, 0), visitas_por_origem: vis, leads_30d: lds.reduce((a, r) => a + r.n, 0), leads_por_campanha: lds.slice(0, 15), followups: fu };
  const C = (peso, causa, evidencia, acao) => out.causas.push({ peso, causa, evidencia, acao });
  if (!pubs30.length) C(10, 'Quase nada publicado com link nos últimos 30 dias', '0 publicações registradas em atx:publicacoes', 'Publicar com frequência (3–5/semana) sempre com link rastreado.');
  if ((porDestino['agenda direta'] || 0) > 0) C(9, 'Posts levavam direto ao HubSpot Meetings, sem passar pela captura', `${porDestino['agenda direta']} de ${pubs30.length} publicações`, 'Corrigido na v3.23: o destino padrão agora é a página de captura com UTM (que depois oferece a agenda). Quem não agendava sumia sem virar lead.');
  if ((porDestino['sem link'] || 0) > 0) C(8, 'Publicações sem link de destino', `${porDestino['sem link']} publicação(ões)`, 'Sem link não há como converter — toda peça precisa de link rastreado (LinkedIn: no 1º comentário).');
  if (semUtm) C(7, 'Links sem UTM de campanha', `${semUtm} publicação(ões)`, 'Sem UTM o lead chega como "direto" e a campanha fica sem crédito.');
  const fpr = aud.funil_por_rede || {};
  const imp = Object.values(fpr).reduce((a, r) => a + (r.impressoes || 0), 0), cli = Object.values(fpr).reduce((a, r) => a + (r.cliques || 0), 0);
  out.funil.impressoes = imp; out.funil.cliques = cli;
  if (imp === 0) C(9, 'Sem impressões medidas', 'Metricool não devolveu impressões das redes', 'Reconectar LinkedIn/Instagram no Metricool com permissão de estatísticas (perfil Business/Creator e página da empresa).');
  else if (cli / imp < 0.004) C(6, 'Taxa de clique muito baixa', `${cli} cliques / ${imp} impressões (${(cli / imp * 100).toFixed(2)}%)`, 'Ganchos mais fortes, CTA explícito e oferta concreta (diagnóstico 30 min, estudo de caso).');
  if (cli > 0 && out.funil.visitas_30d === 0) C(9, 'Há cliques, mas nenhuma visita registrada na captura', `${cli} cliques, 0 visitas`, 'Os cliques estão indo para outro destino (agenda/site) — corrigido o destino padrão na v3.23.');
  if (out.funil.visitas_30d > 0 && out.funil.leads_30d === 0) C(8, 'Visitas sem conversão em lead', `${out.funil.visitas_30d} visitas, 0 leads`, 'Revisar a oferta da página (título por campanha via ?t=), reduzir campos, prova social.');
  if (!(process.env.WHATSAPP_COMERCIAL || process.env.FUNDADOR_WHATSAPP)) C(4, 'Captura sem atalho de WhatsApp', 'WHATSAPP_COMERCIAL não configurado', 'Configurar no Vercel.');
  C(5, 'LinkedIn: link no 1º comentário não era enviado', 'publicar() ignorava o comentário (corrigido na v3.23: firstCommentText)', 'Posts de LinkedIn com link no corpo perdem alcance; com o comentário fixo o link volta a aparecer.');
  C(5, 'Horário de publicação deslocado +3h', 'a hora ia em UTC rotulada como São Paulo (corrigido na v3.23)', 'Posts saíam fora do horário de pico escolhido.');
  C(4, 'Follow-up de 48h nunca era agendado', 'chamava /api/followup-schedule, inexistente (corrigido na v3.23)', 'Leads sem resposta não recebiam a 2ª abordagem.');
  out.causas.sort((a, b) => b.peso - a.peso);
  out.causas.slice(0, 6).forEach(c => add(c.peso >= 8 ? 'alta' : 'média', 'Leads: ' + c.causa, c.evidencia, c.acao, 'funil de marketing'));
  // parecer em linguagem natural (opcional, curto)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 700, system: 'Você é analista de growth B2B. Responda em português do Brasil, direto, em no máximo 8 linhas: diagnóstico do funil e as 3 ações de maior impacto, em ordem.',
          messages: [{ role: 'user', content: 'Dados do funil (30 dias) da Atlantyx (B2B, dados e IA para energia e indústria):\n' + JSON.stringify({ funil: out.funil, auditoria: out.auditoria.problemas, causas: out.causas.map(c => c.causa + ' — ' + c.evidencia) }).substring(0, 6000) }] }) });
      const d = await r.json(); out.parecer = d.content?.[0]?.text || null;
    } catch (_) {}
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const b = req.body || {};
  try {
    const base = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'atlantyx-os.vercel.app'}`;
    const acoes = {
      crud_suite: () => crudSuite(),
      mkt_passo: () => mktPasso(base, b.passo, b.ctx || {}),
      seguranca: () => seguranca(base),
      salvar_execucao: async () => {
        const id = (b.tipo || 'qa') + '_' + Date.now().toString(36);
        await kvSet('qa:exec:' + id, b.relatorio || {});
        const hist = (await kvGet('qa:historico').catch(() => null)) || [];
        hist.unshift({ id, tipo: b.tipo || 'qa', em: new Date().toISOString(), resumo: b.relatorio?.resumo || null });
        await kvSet('qa:historico', hist.slice(0, 30));
        return { id };
      },
      listar_execucoes: async () => ({ execucoes: (await kvGet('qa:historico').catch(() => null)) || [] }),
      obter_execucao: async () => ({ relatorio: await kvGet('qa:exec:' + b.id) }),
      // Aprovação do relatório → abre uma issue no GitHub mencionando @claude; a automação
      // (.github/workflows/claude-correcao.yml) corrige e abre um pull request para revisão.
      abrir_correcao: async () => {
        const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os';
        if (!token) throw new Error('GITHUB_TOKEN não configurado no Vercel. Crie um token fine-grained no GitHub (repositório ' + repo + ', permissão Issues: Read and write) e cadastre como GITHUB_TOKEN; depois faça Redeploy.');
        if (!b.corpo || String(b.corpo).length < 50) throw new Error('Relatório vazio');
        const corpo = '@claude corrija os problemas deste relatório, em ordem de severidade, e abra um pull request para revisão. Não altere o que não estiver relacionado; rode as verificações de sintaxe; suba a versão (ATX-v) em public/index.html.\n\n' + String(b.corpo).substring(0, 60000);
        const r = await fetch(`https://api.github.com/repos/${repo}/issues`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'atlantyx-os-qa' },
          body: JSON.stringify({ title: String(b.titulo || 'Correções do agente de QA').substring(0, 200), body: corpo, labels: ['correcao-automatica'] }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error('GitHub recusou (' + r.status + '): ' + (d.message || '') + (r.status === 403 || r.status === 404 ? ' — confira se o token tem acesso ao repositório e permissão de Issues.' : ''));
        return { issue: d.number, url: d.html_url };
      },
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida', disponiveis: Object.keys(acoes) });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) {
    console.error('[qa]', b.action, e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}

export { analiseEstatica };
