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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const b = req.body || {};
  try {
    const base = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'atlantyx-os.vercel.app'}`;
    const acoes = {
      crud_suite: () => crudSuite(),
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
