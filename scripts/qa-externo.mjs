// v3.133 — Robô de QA dos produtos da Atlantyx publicados fora do Atlantyx OS (GitHub Actions, qa-externo.yml).
// Caixa-preta: só URL + usuário + senha de teste (funciona com apps do Lovable ou qualquer app web, sem código-fonte).
// Para cada produto na fila (/api/qa-externo → robo_proximo):
//   1. entra com o usuário de teste e descobre as telas (links, menus, abas, botões de navegação);
//   2. testa cada tela: erros de JavaScript, chamadas de API com erro/lentas/vazias, imagens quebradas, textos
//      "undefined/NaN/null/[object Object]", mensagens técnicas, tempo de carga e layout no celular (390px);
//   3. cadastros: incluir → conferir → alterar → conferir → excluir → conferir, com registros "QA-ATX-<id>";
//   4. lógica de negócio: manda o conteúdo da tela + respostas das APIs para a IA criticar (erro conceitual,
//      falha operacional, dado ausente ou incoerente);
//   5. configuração de segurança do próprio produto (sem ataque): HTTPS, cabeçalhos de proteção, cookies,
//      telas internas exigindo login em sessão anônima, conteúdo misto (http dentro de https);
//   6. v3.134 — robôs da Esteira de Entrega (metodologia Atlantyx, etapa 7):
//      • Robô do Plano: executa os casos do plano de testes aprovado passo a passo (a IA lê a tela e decide a ação),
//        com os casos de "mundo ideal" (caminho feliz) primeiro; devolve aprovado/reprovado/bloqueado por caso;
//      • Robô Macaco: cliques e digitação aleatórios (sem salvar/excluir) procurando quebras de tela;
//      • Robô de Layout de Saída: print do computador e do celular analisado pela IA com visão;
//      • Robô de Governança (LGPD): dados pessoais sem máscara, campos de senha em respostas de API,
//        política de privacidade, cookies de rastreio sem consentimento;
//      • Robô de Integração: reexecuta as APIs que as telas chamaram (status, contrato JSON, tempo) e confere
//        se elas recusam pedidos sem login.
// e devolve tudo em robo_resultado (achados com evidência, print, como reproduzir e prompt de correção).
import { chromium, request as pwRequest } from 'playwright';

const BASE = (process.env.ATX_URL || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
const SEG = process.env.CRON_SECRET;
if (!SEG) { console.error('Falta o secret CRON_SECRET no GitHub (o mesmo valor do Vercel).'); process.exit(1); }
const MAX_IA = parseInt(process.env.QA_MAX_IA || '40'), ORC_MIN = parseInt(process.env.QA_MINUTOS_PRODUTO || '45');
const MAX_CASOS = parseInt(process.env.QA_MAX_CASOS || '40'), MAX_PASSOS = parseInt(process.env.QA_MAX_PASSOS || '12'), MAX_LAYOUT = parseInt(process.env.QA_MAX_LAYOUT || '10');
const MACACO_TELAS = parseInt(process.env.QA_MACACO_TELAS || '4'), MACACO_ACOES = parseInt(process.env.QA_MACACO_ACOES || '20');
const api = async (action, body = {}) => {
  const r = await fetch(BASE + '/api/qa-externo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SEG }, body: JSON.stringify({ action, ...body }) });
  const d = await r.json().catch(() => ({})); if (!r.ok || !d.success) throw new Error(action + ': ' + (d.error || r.status)); return d;
};
const espera = ms => new Promise(r => setTimeout(r, ms));
// andamento para a tela (no máximo 1 envio a cada 4 s, sem travar o robô)
let _execAtual = null, _ultProg = 0, _progEstado = {};
// cada linha do console também vai para o log da execução (últimas 150 linhas)
const _logOrig = console.log.bind(console);
console.log = (...a) => { _logOrig(...a); if (_execAtual) { const l = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '  ' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ').replace(/\s+$/, ''); _progEstado.log = [...(_progEstado.log || []), l].slice(-150); progresso({}); } };
const progresso = (p, forcar) => { _progEstado = { ..._progEstado, ...p, pct: Math.max(_progEstado.pct || 0, p.pct || 0) }; if (!_execAtual || (!forcar && Date.now() - _ultProg < 4000)) return; _ultProg = Date.now(); api('robo_progresso', { execucao_id: _execAtual, progresso: _progEstado }).catch(() => {}); };
// nunca clicar: sair da conta, excluir a própria conta, pagamentos, envios em massa
const RX_PERIGO = /\b(sair|logout|log ?out|sign ?out|desconectar|excluir (minha )?conta|apagar (minha )?conta|delete account|encerrar conta|cancelar assinatura|pagar|checkout|comprar|disparar|enviar para todos)\b/i;
const RX_LIXO = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|R\$\s*NaN|(^|\s)null(\s|$)/;
const RX_TECNICO = /(TypeError|ReferenceError|SyntaxError|Cannot read propert|is not a function|stack trace|at \w+ \(.*:\d+:\d+\)|ECONNREFUSED|ERR_|Internal Server Error|SQLSTATE|duplicate key|violates|PGRST\d+|supabase|JWT expired|Failed to fetch)/i;
const RX_NOVO = /^\s*(\+\s*)?(novo|nova|adicionar|incluir|criar|cadastrar|add|new|create)\b/i;
const RX_SALVAR = /^\s*(salvar|gravar|confirmar|criar|adicionar|cadastrar|save|submit|ok|concluir|enviar)\b/i;
const RX_EDITAR = /^\s*(editar|alterar|edit|✎|✏)/i;
const RX_EXCLUIR = /^\s*(excluir|apagar|remover|deletar|delete|remove|🗑)/i;
// o macaco também evita ações com efeito fora da tela
const RX_MACACO_EVITA = /\b(aprovar|reprovar|finalizar|publicar|importar|sincronizar|gerar|executar|processar|enviar|salvar|gravar|confirmar|excluir|apagar|remover|deletar|baixar|download|exportar|imprimir)\b/i;
const DADOS_MACACO = ['', '   ', 'á'.repeat(260), '😀🚀✅ teste', '-999999', '0', '99999999999999999', '31/02/2026', '  espaços  nas pontas  ', 'Ç€®™ºª§', '1e309', '12,345.67'];

const browser = await chromium.launch();
if (process.env.QA_NOTURNO === '1') { try { console.log('Fila noturna:', JSON.stringify(await api('robo_enfileirar_noturno'))); } catch (e) { console.log('Fila noturna:', e.message); } }
for (let n = 0; n < 10; n++) {
  let job; try { job = await api('robo_proximo'); } catch (e) { console.error(e.message); break; }
  if (!job.execucao) { console.log('Fila vazia.'); break; }
  const P = job.produto; console.log(`\n=== ${P.nome} (${P.url}) · execução ${job.execucao.id}`);
  let R;
  if (job.planos_rascunho) console.log(`  (${job.planos_rascunho} plano(s) de testes em rascunho — os casos só rodam depois de aprovados na Esteira de Entrega)`);
  _execAtual = job.execucao.id; _progEstado = { inicio: new Date().toISOString(), pct: 1, etapa: 'Abrindo o produto', achados: 0 }; progresso({}, true);
  try { R = await testarProduto(P, job.execucao.id, job.casos || []); }
  catch (e) { console.error('Falha geral:', e.message); R = { erro: e.message, telas_descobertas: 0, telas_testadas: 0, cobertura_pct: 0, achados: [{ tipo: 'acesso', severidade: 'critica', titulo: 'O robô não conseguiu testar o produto', descricao: e.message, tela: P.url, url: P.url, chave: 'falha-geral', print: e.print || null }] }; }
  _progEstado = { ..._progEstado, etapa: 'Gravando o resultado', pct: 99 }; await api('robo_progresso', { execucao_id: job.execucao.id, progresso: _progEstado }).catch(() => {});
  try { const r = await api('robo_resultado', { execucao_id: job.execucao.id, ...R }); console.log('Resultado gravado:', JSON.stringify(r)); } catch (e) { console.error('Não gravou o resultado:', e.message); }
  // resumo no painel da execução do GitHub (sem dados sensíveis)
  { const cont = {}; (R.achados || []).forEach(x => { cont[x.severidade] = (cont[x.severidade] || 0) + 1; });
    const msg = `${P.nome}: ${R.erro ? 'FALHOU — ' + String(R.erro).replace(/\s+/g, ' ').substring(0, 300) + ' — ' : ''}${R.telas_testadas || 0}/${R.telas_descobertas || 0} telas · ${(R.achados || []).length} achado(s) ${JSON.stringify(cont)} · ${(R.achados || []).slice(0, 6).map(x => '[' + x.severidade + '] ' + String(x.titulo).substring(0, 80)).join(' | ')}`.replace(/[\r\n]+/g, ' ');
    _logOrig(`::${R.erro ? 'warning' : 'notice'} title=QA ${P.nome.replace(/[:,]/g, ' ')}::${msg}`); }
}
await browser.close();

async function testarProduto(P, execId, casos = []) {
  const t0 = Date.now(), fimEm = t0 + ORC_MIN * 60000, marca = 'QA-ATX-' + execId.slice(-6);
  const A = []; const add = a => { A.push(a); progresso({ achados: A.length }); };
  const origem = new URL(P.url).origin;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: false });
  const pg = await ctx.newPage();
  let consoleErros = [], chamadas = [];
  pg.on('console', m => { if (m.type() === 'error') consoleErros.push(m.text().substring(0, 300)); });
  pg.on('pageerror', e => consoleErros.push('JS: ' + String(e.message).substring(0, 300)));
  pg.on('dialog', d => (pg._aceitarDialogo ? d.accept() : d.dismiss()).catch(() => {}));
  const inicioReq = new Map(), apisVistas = new Map(), segredosApi = new Set();
  const robos = {}, casosRes = [], layoutFila = [], govTexto = new Map();
  pg.on('request', r => { if (['xhr', 'fetch'].includes(r.resourceType())) inicioReq.set(r, Date.now()); });
  pg.on('requestfinished', async r => { if (!inicioReq.has(r)) return; const ms = Date.now() - inicioReq.get(r); inicioReq.delete(r);
    const resp = await r.response().catch(() => null); let corpo = '';
    try { const ct = resp?.headers()['content-type'] || ''; if (/json|text/.test(ct)) corpo = (await resp.text()).substring(0, 1500); } catch (_) {}
    const ch = { metodo: r.method(), url: r.url(), status: resp?.status() || 0, ms, corpo }; chamadas.push(ch);
    if (r.method() === 'GET' && ch.status === 200 && /^\s*[\[{]/.test(corpo) && apisVistas.size < 30) { const k = new URL(r.url()).pathname; if (!apisVistas.has(k)) apisVistas.set(k, { url: r.url(), headers: await r.allHeaders().catch(() => r.headers()), corpo, ms }); }
    // governança: resposta de API trazendo campo de senha/segredo
    if (/"(password|senha|password_hash|senha_hash|hash_senha|secret|client_secret|service_role)"\s*:\s*"[^"]{4,}/i.test(corpo)) segredosApi.add(r.method() + ' ' + new URL(r.url()).pathname); });
  // chamada abortada porque a página navegou/recarregou não é erro da API
  pg.on('requestfailed', r => { if (inicioReq.has(r)) { inicioReq.delete(r); if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(r.failure()?.errorText || '')) return; chamadas.push({ metodo: r.method(), url: r.url(), status: 0, ms: 0, erro: r.failure()?.errorText || 'falhou' }); } });

  // ── 0. segurança de configuração da página inicial (sem login) ──
  const resp0 = await pg.goto(P.url_login || P.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await espera(2500);
  if (!P.url.startsWith('https://')) add({ tipo: 'seguranca', severidade: 'critica', titulo: 'Produto publicado sem HTTPS', descricao: 'A URL do produto usa http://. Senhas e dados trafegam sem criptografia.', tela: 'Início', url: P.url, chave: 'sem-https' });
  const H = resp0 ? resp0.headers() : {};
  const faltam = [['strict-transport-security', 'HSTS (força HTTPS)'], ['x-content-type-options', 'X-Content-Type-Options'], ['referrer-policy', 'Referrer-Policy']].filter(([h]) => !H[h]);
  if (!H['content-security-policy'] && !H['x-frame-options']) faltam.push(['x-frame-options', 'proteção contra exibição dentro de outro site (X-Frame-Options ou CSP frame-ancestors)']);
  if (faltam.length) add({ tipo: 'seguranca', severidade: 'baixa', titulo: 'Cabeçalhos de proteção ausentes', descricao: 'Faltam: ' + faltam.map(f => f[1]).join(', ') + '.', tela: 'Início', url: P.url, chave: 'cabecalhos', evidencia: 'Resposta de ' + (P.url_login || P.url),
    prompt_correcao: 'Configure no servidor/hospedagem do app os cabeçalhos HTTP de segurança: ' + faltam.map(f => f[0]).join(', ') + '. Em apps Lovable/Vercel isso é feito no arquivo de configuração de headers (vercel.json ou equivalente).' });

  // ── 1. login ──
  progresso({ etapa: 'Entrando com o usuário de teste', pct: 3 }, true);
  await login(pg, P, add);
  if (Date.now() > fimEm) throw new Error('tempo esgotado no login');
  const cookies = await ctx.cookies();
  const sessao = cookies.filter(c => /sess|auth|token|sb-|jwt|sid/i.test(c.name));
  const fracos = sessao.filter(c => !c.secure || !c.httpOnly || !c.sameSite || c.sameSite === 'None');
  if (fracos.length) add({ tipo: 'seguranca', severidade: 'media', titulo: 'Cookie de sessão sem proteções', descricao: fracos.map(c => `${c.name}: ${[!c.secure && 'sem Secure', !c.httpOnly && 'sem HttpOnly', (!c.sameSite || c.sameSite === 'None') && 'SameSite ausente/None'].filter(Boolean).join(', ')}`).join(' · '), tela: 'Login', url: pg.url(), chave: 'cookies',
    prompt_correcao: 'Ajuste os cookies de sessão para Secure, HttpOnly e SameSite=Lax (ou Strict).' });

  const urlInicial = pg.url();
  const printPg = async () => { try { return 'data:image/jpeg;base64,' + (await pg.screenshot({ type: 'jpeg', quality: 45, fullPage: false })).toString('base64'); } catch (_) { return null; } };
  // ── 1b. Robô do Plano de Testes (mundo ideal primeiro) ──
  if (casos.length) {
    const limiteT = t0 + ORC_MIN * 60000 * 0.5;
    for (const C of casos.filter(c => !['carga', 'estresse'].includes(c.tipo)).slice(0, MAX_CASOS)) {
      if (Date.now() > limiteT) { console.log('  (tempo do plano esgotado — restantes ficam para a próxima execução)'); break; }
      consoleErros = []; chamadas = [];
      progresso({ etapa: `Robô do Plano — ${C.codigo} ${C.titulo}`.substring(0, 140), pct: 5 + Math.round(casosRes.length / Math.max(1, Math.min(MAX_CASOS, casos.length)) * 30), casos: casosRes.length + '/' + Math.min(MAX_CASOS, casos.length) }, true);
      const r = await executarCaso(pg, C, P, origem, urlInicial).catch(e => ({ veredito: 'bloqueado', motivo: 'erro do robô: ' + e.message, hist: [] }));
      const js = consoleErros.filter(t => /^JS:/.test(t)); const api5 = chamadas.filter(c => c.status >= 500 || c.status === 0);
      if (r.veredito === 'passou' && (js.length || api5.length)) { r.veredito = 'falhou'; r.motivo += ` — mas a tela teve ${js.length ? 'erro de JavaScript (' + js[0].substring(0, 120) + ')' : 'API com erro ' + api5[0].status + ' em ' + new URL(api5[0].url).pathname}`; }
      console.log(`  · ${C.codigo} ${r.veredito.toUpperCase()} — ${String(r.motivo).substring(0, 110)}`);
      casosRes.push({ id: C.id, tipo: C.tipo, status: r.veredito, evidencia: `${r.motivo}\nPassos executados: ${r.hist.join(' → ')}`.substring(0, 3800) });
      if (r.veredito === 'falhou') add({ tipo: 'plano', severidade: C.prioridade === 'alta' ? 'alta' : C.prioridade === 'baixa' ? 'baixa' : 'media', titulo: `Caso ${C.codigo} reprovado: ${C.titulo}`.substring(0, 280),
        descricao: `Requisito: ${C.requisito_ref || '—'}${C.item_codigo ? ' · item ' + C.item_codigo : ''}\nEsperado: ${C.esperado || '—'}\nObservado: ${r.motivo}`, evidencia: r.hist.join(' → ').substring(0, 3000), tela: C.titulo, url: pg.url(), chave: 'ct:' + C.codigo, print: await printPg(),
        como_reproduzir: (C.passos || []).map((x, i) => (i + 1) + '. ' + x).join('\n'),
        prompt_correcao: `O caso de teste "${C.titulo}" (${C.requisito_ref || 'sem requisito'}) falhou. Passos: ${(C.passos || []).join('; ')}. Resultado esperado: ${C.esperado || '—'}. O que aconteceu: ${r.motivo}. Corrija o sistema para que o resultado esperado aconteça, sem alterar as demais regras.` });
    }
    const cont = (L) => ({ casos: L.length, passou: L.filter(x => x.status === 'passou').length, falhou: L.filter(x => x.status === 'falhou').length, bloqueado: L.filter(x => x.status === 'bloqueado').length });
    const tx = k => `${k.casos} caso(s): ${k.passou} aprovado(s), ${k.falhou} reprovado(s), ${k.bloqueado} bloqueado(s)`;
    const a = cont(casosRes), mi = cont(casosRes.filter(x => x.tipo === 'mundo_ideal'));
    robos.plano = { ...a, texto: tx(a) }; if (mi.casos) robos.mundo_ideal = { ...mi, texto: tx(mi) };
    await pg.goto(urlInicial, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await espera(1500);
    if (await temCampoSenha(pg)) await login(pg, P, add).catch(() => {});
  }

  // ── 2. descoberta e teste das telas ──
  const visitadas = new Map(); // chave → { titulo, url }
  const fila = [{ url: urlInicial, via: null, caminho: 'tela inicial após login' }];
  const chaveTela = async () => { const u = new URL(pg.url()); const h = await pg.evaluate(() => (document.querySelector('h1,h2,[role=heading]')?.innerText || document.title || '').trim().substring(0, 80)).catch(() => ''); return u.pathname + u.hash + '|' + h; };
  let iaUsadas = 0, crudFeitos = 0;
  const telasInfo = [];
  while (fila.length && visitadas.size < (P.max_telas || 60) && Date.now() < fimEm) {
    const item = fila.shift();
    consoleErros = []; chamadas = [];
    const ini = Date.now();
    try {
      if (item.via) { await pg.goto(item.base, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await espera(1500); await clicarPorTexto(pg, item.via); }
      else await pg.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await pg.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {}); await espera(1200);
    } catch (e) { add({ tipo: 'tela', severidade: 'alta', titulo: 'Tela não abre', descricao: e.message.substring(0, 300), tela: item.caminho, url: item.url || item.base, chave: 'nao-abre:' + (item.via || item.url) }); continue; }
    const ms = Date.now() - ini;
    const k = await chaveTela(); if (visitadas.has(k)) continue;
    const titulo = await pg.evaluate(() => (document.querySelector('h1,h2,[role=heading]')?.innerText || document.title || location.pathname).trim().substring(0, 80)).catch(() => pg.url());
    visitadas.set(k, { titulo, url: pg.url() }); const nomeTela = titulo || pg.url();
    console.log(`  · ${nomeTela} (${ms} ms)`);
    progresso({ etapa: `Testando a tela "${nomeTela}"`.substring(0, 140), pct: Math.min(75, 35 + Math.round(visitadas.size / Math.max(visitadas.size + fila.length, 1) * 40)), telas: visitadas.size + ' de ' + (visitadas.size + fila.length) }, true);
    // se a sessão caiu (voltou ao login), reentra
    if (await temCampoSenha(pg)) { await login(pg, P, add).catch(() => {}); continue; }
    const print = async () => { try { return 'data:image/jpeg;base64,' + (await pg.screenshot({ type: 'jpeg', quality: 45, fullPage: false })).toString('base64'); } catch (_) { return null; } };
    const comoChegar = item.via ? `Entrar com o usuário de teste → clicar em "${item.via}"` : `Entrar com o usuário de teste → abrir ${pg.url()}`;
    // 2a. erros de JavaScript
    const js = [...new Set(consoleErros)].filter(t => !/favicon|ResizeObserver|Download the React DevTools|third-party cookie/i.test(t));
    if (js.length) add({ tipo: 'tela', severidade: js.some(t => /^JS:/.test(t)) ? 'alta' : 'media', titulo: `Erros de JavaScript na tela "${nomeTela}"`, descricao: js.slice(0, 6).join('\n'), tela: nomeTela, url: pg.url(), chave: 'js:' + js[0].substring(0, 80), print: await print(), como_reproduzir: comoChegar + ' e abrir o console do navegador',
      prompt_correcao: `Na tela "${nomeTela}" aparecem estes erros no console do navegador: ${js.slice(0, 3).join(' | ')}. Corrija a causa (variáveis indefinidas, chamadas a dados ainda não carregados) sem mudar o comportamento esperado da tela.` });
    // 2b. retaguarda (APIs chamadas pela tela)
    const ruins = chamadas.filter(c => c.status >= 500 || c.status === 0 || (c.status >= 400 && ![401, 403].includes(c.status)));
    for (const c of ruins.slice(0, 8)) add({ tipo: 'api', severidade: c.status >= 500 || c.status === 0 ? 'alta' : 'media', titulo: `API com erro ${c.status || c.erro} em "${nomeTela}"`, descricao: `${c.metodo} ${c.url.replace(/\?.*/, '')}\nResposta: ${String(c.corpo || c.erro || '').substring(0, 600)}`, tela: nomeTela, url: pg.url(), chave: 'api:' + c.metodo + new URL(c.url).pathname + ':' + c.status, como_reproduzir: comoChegar,
      prompt_correcao: `A tela "${nomeTela}" chama ${c.metodo} ${new URL(c.url).pathname} e recebe ${c.status || c.erro}. Resposta: ${String(c.corpo || '').substring(0, 300)}. Corrija a consulta/regra no backend (ou a permissão de acesso à tabela) para que a tela carregue os dados.` });
    const lentas = chamadas.filter(c => c.ms > 4000);
    if (lentas.length) add({ tipo: 'desempenho', severidade: 'media', titulo: `Chamadas lentas em "${nomeTela}"`, descricao: lentas.slice(0, 5).map(c => `${c.metodo} ${new URL(c.url).pathname}: ${(c.ms / 1000).toFixed(1)} s`).join('\n'), tela: nomeTela, url: pg.url(), chave: 'lenta:' + new URL(lentas[0].url).pathname });
    if (ms > 8000) add({ tipo: 'desempenho', severidade: 'media', titulo: `Tela "${nomeTela}" demora ${(ms / 1000).toFixed(1)} s para carregar`, descricao: 'Tempo até a tela ficar pronta (rede ociosa).', tela: nomeTela, url: pg.url(), chave: 'carga' });
    // 2c. conteúdo: lixo técnico, mensagens de erro técnicas, imagens quebradas
    const info = await pg.evaluate(() => { const txt = document.body?.innerText || ''; const imgs = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map(i => i.src).slice(0, 5);
      const tabelas = [...document.querySelectorAll('table')].slice(0, 4).map(t => [...t.querySelectorAll('tr')].slice(0, 12).map(r => [...r.children].map(c => c.innerText.trim().substring(0, 40)).join(' | ')).join('\n'));
      const forms = [...document.querySelectorAll('input,select,textarea')].filter(e => e.offsetParent).slice(0, 30).map(e => (e.labels?.[0]?.innerText || e.placeholder || e.name || e.type || '').trim()).filter(Boolean);
      return { txt: txt.substring(0, 12000), imgs, tabelas, forms, misto: [...document.querySelectorAll('img[src^="http:"],script[src^="http:"],iframe[src^="http:"]')].length }; }).catch(() => ({ txt: '', imgs: [], tabelas: [], forms: [], misto: 0 }));
    const lixo = info.txt.split('\n').filter(l => RX_LIXO.test(l)).slice(0, 5);
    if (lixo.length) add({ tipo: 'dados', severidade: 'alta', titulo: `Valores inválidos exibidos em "${nomeTela}"`, descricao: lixo.join('\n'), evidencia: lixo.join('\n'), tela: nomeTela, url: pg.url(), chave: 'lixo:' + lixo[0].substring(0, 60), print: await print(), como_reproduzir: comoChegar,
      prompt_correcao: `Na tela "${nomeTela}" aparecem valores como ${lixo.slice(0, 2).map(l => '"' + l.trim().substring(0, 60) + '"').join(', ')}. Trate dados ausentes (mostrar "—" ou estado vazio) e corrija a origem do valor indefinido.` });
    const tec = info.txt.split('\n').filter(l => RX_TECNICO.test(l)).slice(0, 3);
    if (tec.length) add({ tipo: 'tela', severidade: 'alta', titulo: `Mensagem de erro técnica para o usuário em "${nomeTela}"`, descricao: tec.join('\n'), evidencia: tec.join('\n'), tela: nomeTela, url: pg.url(), chave: 'tec:' + tec[0].substring(0, 60), print: await print(),
      prompt_correcao: `A tela "${nomeTela}" mostra ao usuário a mensagem técnica "${tec[0].substring(0, 120)}". Mostre uma mensagem amigável e registre o detalhe técnico só no log; corrija a causa do erro.` });
    if (info.imgs.length) add({ tipo: 'tela', severidade: 'baixa', titulo: `Imagens quebradas em "${nomeTela}"`, descricao: info.imgs.join('\n'), tela: nomeTela, url: pg.url(), chave: 'img' });
    // governança (LGPD): dado pessoal completo na tela
    const cpfs = (info.txt.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || []).filter(x => x !== '529.982.247-25');
    const cartoes = (info.txt.match(/\b(?:\d[ -]?){15,16}\b/g) || []).map(x => x.replace(/\D/g, '')).filter(luhn);
    if (cpfs.length) govTexto.set('cpf:' + nomeTela, { tipo: 'governanca', severidade: 'media', titulo: `CPF completo exibido sem máscara em "${nomeTela}"`, descricao: `${cpfs.length} CPF(s) exibidos por inteiro (ex.: ***.${cpfs[0].substring(4, 11)}-**). Pela LGPD, mostre só o necessário (mascarado) para quem não precisa do dado completo.`, tela: nomeTela, url: pg.url(), chave: 'gov-cpf',
      prompt_correcao: `Na tela "${nomeTela}", exiba o CPF mascarado (ex.: ***.456.789-**) e mostre o número completo só para perfis autorizados, com registro de acesso.` });
    if (cartoes.length) govTexto.set('cartao:' + nomeTela, { tipo: 'governanca', severidade: 'alta', titulo: `Número de cartão completo exibido em "${nomeTela}"`, descricao: 'Número que passa na validação de cartão aparece por inteiro na tela.', tela: nomeTela, url: pg.url(), chave: 'gov-cartao',
      prompt_correcao: `Na tela "${nomeTela}", nunca exiba o número completo do cartão: mostre só os 4 últimos dígitos.` });
    if (info.misto) add({ tipo: 'seguranca', severidade: 'media', titulo: `Conteúdo http dentro de página https em "${nomeTela}"`, descricao: info.misto + ' recurso(s) carregado(s) por http://', tela: nomeTela, url: pg.url(), chave: 'misto' });
    // 2d. celular
    const printDesk = layoutFila.length < MAX_LAYOUT ? await print() : null;
    await pg.setViewportSize({ width: 390, height: 844 }); await espera(700);
    if (printDesk) layoutFila.push({ titulo: nomeTela, url: pg.url(), imagens: [printDesk, await print()].filter(Boolean) });
    const larg = await pg.evaluate(() => document.documentElement.scrollWidth).catch(() => 390);
    if (larg > 400) add({ tipo: 'responsivo', severidade: 'baixa', titulo: `Tela "${nomeTela}" com rolagem lateral no celular`, descricao: `Largura do conteúdo ${larg}px num celular de 390px.`, tela: nomeTela, url: pg.url(), chave: 'mobile', print: await print(),
      prompt_correcao: `A tela "${nomeTela}" estoura a largura no celular (${larg}px em 390px). Torne o layout responsivo: tabelas com rolagem própria, grades que quebram em uma coluna, sem larguras fixas.` });
    await pg.setViewportSize({ width: 1440, height: 900 }); await espera(400);
    // 2e. lógica de negócio (IA)
    if (iaUsadas < MAX_IA && info.txt.trim().length > 80) { iaUsadas++;
      const apis = chamadas.filter(c => c.status && c.status < 400 && c.corpo).slice(0, 6).map(c => `${c.metodo} ${new URL(c.url).pathname} → ${c.status}: ${c.corpo.substring(0, 700)}`).join('\n');
      const conteudo = `TEXTO DA TELA:\n${info.txt.substring(0, 7000)}\n\nTABELAS:\n${info.tabelas.join('\n---\n').substring(0, 3000)}\n\nCAMPOS DE FORMULÁRIO: ${info.forms.join(', ')}\n\nRESPOSTAS DAS APIs DESTA TELA:\n${apis.substring(0, 3500)}`;
      try { const r = await api('robo_criticar', { produto: { nome: P.nome, contexto: P.contexto }, tela: { titulo: nomeTela, url: pg.url(), conteudo } });
        let pr = null; for (const a of r.achados || []) { pr = pr || await print(); add({ ...a, tipo: a.tipo === 'dados' ? 'dados' : 'logica', tela: nomeTela, url: pg.url(), chave: 'ia:' + String(a.titulo).substring(0, 70), print: pr, como_reproduzir: comoChegar }); } }
      catch (e) { console.log('    IA:', e.message); } }
    // 2f. cadastros (incluir → alterar → excluir)
    if (P.permitir_gravacao && crudFeitos < 12 && Date.now() < fimEm - 120000) {
      const botoes = await textosClicaveis(pg); const novo = botoes.find(t => RX_NOVO.test(t));
      if (novo) { crudFeitos++; await testarCrud(pg, P, nomeTela, novo, marca + '-' + crudFeitos, add, comoChegar, print).catch(e => add({ tipo: 'crud', severidade: 'media', titulo: `Ciclo de cadastro interrompido em "${nomeTela}"`, descricao: e.message.substring(0, 400), tela: nomeTela, url: pg.url(), chave: 'crud-int' })); }
    }
    telasInfo.push({ titulo: nomeTela, url: pg.url(), ms, apis: chamadas.length });
    // 2g. descobre novas telas a partir desta
    const base = pg.url();
    const links = await pg.evaluate(o => [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith(o) && !/\.(pdf|zip|png|jpe?g|csv|xlsx?)$/i.test(h)), origem).catch(() => []);
    for (const l of [...new Set(links)]) { const u = new URL(l); if (![...visitadas.values()].some(v => v.url.split('#')[0] === l.split('#')[0]) && !fila.some(f => f.url === l)) fila.push({ url: l, caminho: 'link ' + u.pathname }); }
    const nav = (await textosClicaveis(pg, true)).filter(t => !RX_PERIGO.test(t) && !RX_NOVO.test(t) && !RX_EXCLUIR.test(t) && !RX_EDITAR.test(t) && !RX_SALVAR.test(t));
    for (const t of nav.slice(0, 25)) if (!fila.some(f => f.via === t)) fila.push({ via: t, base, caminho: 'menu "' + t + '"' });
  }
  const descobertas = visitadas.size + fila.length, testadas = visitadas.size;
  robos.exploratorio = { telas: testadas, ciclos_cadastro: crudFeitos, analises_ia: iaUsadas, texto: `${testadas} de ${descobertas} telas · ${crudFeitos} ciclo(s) incluir/alterar/excluir · ${iaUsadas} tela(s) criticadas pela IA` };
  // ── 2h. Robô Macaco ──
  progresso({ etapa: 'Robô Macaco — uso fora do roteiro', pct: 78 }, true);
  let macAcoes = 0, macProb = 0;
  for (const v of [...visitadas.values()].slice(0, MACACO_TELAS)) {
    if (Date.now() > fimEm - 90000) break;
    await pg.goto(v.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); await pg.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await espera(800);
    if (await temCampoSenha(pg)) { await login(pg, P, add).catch(() => {}); continue; }
    consoleErros = []; chamadas = []; const passos = [];
    for (let k = 0; k < MACACO_ACOES; k++) {
      macAcoes++;
      const campos = pg.locator('input:visible:not([type=hidden]):not([type=file]):not([type=password]):not([type=checkbox]):not([type=radio]), textarea:visible');
      const nCampos = await campos.count().catch(() => 0);
      try {
        if (nCampos && Math.random() < 0.45) { const i = Math.floor(Math.random() * nCampos), v2 = DADOS_MACACO[Math.floor(Math.random() * DADOS_MACACO.length)];
          await campos.nth(i).fill(v2, { timeout: 3000 }); passos.push(`digitar "${v2.substring(0, 20)}${v2.length > 20 ? '…' : ''}" no campo ${i + 1}`); }
        else { const alvos = (await textosClicaveis(pg)).filter(t => !RX_PERIGO.test(t) && !RX_MACACO_EVITA.test(t) && !RX_SALVAR.test(t) && !RX_EXCLUIR.test(t));
          if (!alvos.length) break; const t = alvos[Math.floor(Math.random() * alvos.length)];
          await clicarPorTexto(pg, t).catch(() => {}); passos.push(`clicar "${t}"`);
          if (new URL(pg.url()).origin !== origem) { await pg.goBack().catch(() => {}); passos.push('voltar (saiu do site)'); } }
      } catch (_) {}
      await espera(250);
      const branco = await pg.evaluate(() => (document.body?.innerText || '').trim().length).catch(() => 0) < 15;
      const js = consoleErros.filter(t => /^JS:/.test(t)); const a5 = chamadas.filter(c => c.status >= 500);
      if (js.length || a5.length || branco) { macProb++;
        add({ tipo: 'macaco', severidade: js.length || branco ? 'alta' : 'media', titulo: `Uso fora do roteiro quebra a tela "${v.titulo}"${branco ? ' (tela em branco)' : ''}`,
          descricao: (js.length ? 'Erro de JavaScript: ' + js[0] : a5.length ? `API ${a5[0].metodo} ${new URL(a5[0].url).pathname} devolveu ${a5[0].status}` : 'A tela ficou em branco depois da sequência de ações.') + '\nÚltimas ações: ' + passos.slice(-8).join(' → '),
          tela: v.titulo, url: pg.url(), chave: 'macaco:' + (js[0] || (a5[0] ? new URL(a5[0].url).pathname : 'branco')).substring(0, 70), print: await printPg(), como_reproduzir: 'Abrir ' + v.url + ' e repetir: ' + passos.slice(-8).join(' → '),
          prompt_correcao: `Na tela "${v.titulo}", a sequência ${passos.slice(-6).join(' → ')} causa ${js.length ? 'o erro "' + js[0].substring(0, 140) + '"' : a5.length ? 'erro ' + a5[0].status + ' na API' : 'tela em branco'}. Valide as entradas (tamanho, formato, números e datas inválidos), trate o erro sem quebrar a tela e mostre mensagem amigável.` });
        break; }
    }
  }
  robos.macaco = { telas: Math.min(MACACO_TELAS, visitadas.size), acoes: macAcoes, problemas: macProb, texto: `${macAcoes} ação(ões) aleatória(s) em ${Math.min(MACACO_TELAS, visitadas.size)} tela(s) · ${macProb} quebra(s)` };
  // ── 2i. Robô de Layout de Saída (IA com visão) ──
  progresso({ etapa: 'Robô de Layout — IA analisando os prints', pct: 83 }, true);
  let layAch = 0;
  for (const L of layoutFila) { if (Date.now() > fimEm - 45000) break;
    try { const r = await api('robo_layout', { produto: { nome: P.nome }, tela: { titulo: L.titulo, url: L.url }, imagens: L.imagens });
      for (const a of r.achados || []) { layAch++; add({ tipo: 'layout', severidade: ['alta', 'media', 'baixa'].includes(a.severidade) ? a.severidade : 'baixa', titulo: `${a.titulo} — "${L.titulo}"${a.dispositivo === 'celular' ? ' (celular)' : ''}`.substring(0, 280), descricao: a.descricao, tela: L.titulo, url: L.url, chave: 'layout:' + String(a.titulo).substring(0, 60), print: a.dispositivo === 'celular' ? L.imagens[1] : L.imagens[0], prompt_correcao: a.prompt_correcao }); } }
    catch (e) { console.log('    layout:', e.message); } }
  robos.layout = { telas: layoutFila.length, achados: layAch, texto: `${layoutFila.length} tela(s) analisadas no computador e no celular · ${layAch} problema(s) de layout` };
  // ── 2j. Robô de Governança (LGPD) ──
  progresso({ etapa: 'Robô de Governança (LGPD)', pct: 88 }, true);
  let govN = 0; for (const a of govTexto.values()) { add(a); govN++; }
  if (segredosApi.size) { govN++; add({ tipo: 'governanca', severidade: 'critica', titulo: 'API devolve campo de senha ou segredo', descricao: 'Respostas com campo de senha/hash/segredo preenchido:\n' + [...segredosApi].slice(0, 8).join('\n'), tela: 'Retaguarda (APIs)', url: P.url, chave: 'gov-segredo',
    prompt_correcao: 'Remova das respostas das APIs (e das consultas às tabelas) qualquer campo de senha, hash de senha ou segredo. Selecione só as colunas que a tela usa.' }); }
  try { const pv = await browser.newContext(); const pp = await pv.newPage(); await pp.goto(P.url_login || P.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); await espera(2500);
    const t = await pp.evaluate(() => (document.body?.innerText || '') + ' ' + [...document.querySelectorAll('a')].map(a => a.innerText + ' ' + a.href).join(' ')).catch(() => '');
    if (!/pol[ií]tica de privacidade|privacidade|privacy|lgpd|termos de uso|terms/i.test(t)) { govN++; add({ tipo: 'governanca', severidade: 'baixa', titulo: 'Sem link para a política de privacidade / termos de uso', descricao: 'A tela de entrada não mostra link para a política de privacidade (LGPD) nem para os termos de uso.', tela: 'Login', url: P.url_login || P.url, chave: 'gov-privacidade',
      prompt_correcao: 'Inclua no rodapé da tela de login e do app links para "Política de privacidade" e "Termos de uso" (LGPD).' }); }
    const rastreio = (await pv.cookies()).filter(c => /^(_ga|_gid|_fbp|_hj|_clck|_clsk|ajs_)/.test(c.name));
    if (rastreio.length && !/cookie/i.test(t)) { govN++; add({ tipo: 'governanca', severidade: 'media', titulo: 'Cookies de rastreio sem aviso de consentimento', descricao: 'Gravados ao abrir a página, sem banner de cookies: ' + rastreio.map(c => c.name).join(', '), tela: 'Login', url: P.url, chave: 'gov-cookies',
      prompt_correcao: 'Só carregue ferramentas de análise/marketing (Google Analytics, pixel etc.) depois do consentimento do usuário, com um banner de cookies (aceitar/recusar).' }); }
    await pv.close(); } catch (_) {}
  robos.governanca = { achados: govN, texto: `dados pessoais nas telas, segredos nas APIs, política de privacidade e cookies · ${govN} achado(s)` };
  // ── 2k. Robô de Integração (APIs que as telas chamaram) ──
  progresso({ etapa: 'Robô de Integração — reexecutando as APIs', pct: 91 }, true);
  let intN = 0, intRe = 0; const anon = await pwRequest.newContext({ ignoreHTTPSErrors: false }).catch(() => null);
  for (const [cam, A2] of [...apisVistas.entries()].slice(0, 20)) { if (Date.now() > fimEm - 30000) break;
    const hdr = Object.fromEntries(Object.entries(A2.headers || {}).filter(([k]) => !/^(host|content-length|connection|accept-encoding)$/i.test(k)));
    try { intRe++; const t1 = Date.now(); const r = await ctx.request.get(A2.url, { headers: hdr, timeout: 20000 }); const ms = Date.now() - t1; const txt = await r.text();
      // contrato: mesmo formato (lista × objeto) e campos em comum (os dados podem ter mudado entre as chamadas)
      let ok = true; try { const a = JSON.parse(A2.corpo), b = JSON.parse(txt); if (Array.isArray(a) !== Array.isArray(b)) ok = false; else { const ka = Object.keys(Array.isArray(a) ? a[0] || {} : a), kb = Object.keys(Array.isArray(b) ? b[0] || {} : b); if (ka.length && kb.length && !ka.some(k => kb.includes(k))) ok = false; } } catch (_) { ok = A2.corpo.length >= 1500 || /^\s*[\[{]/.test(txt); }
      if (r.status() !== 200 || !ok) { intN++; add({ tipo: 'integracao', severidade: r.status() >= 500 ? 'alta' : 'media', titulo: `API instável: ${cam}`, descricao: `Mesma chamada repetida: ${r.status() !== 200 ? 'status ' + r.status() + ' (antes 200)' : 'formato da resposta mudou (campos diferentes)'}.`, tela: 'Retaguarda (APIs)', url: A2.url.replace(/\?.*/, ''), chave: 'int:' + cam,
        prompt_correcao: `A API GET ${cam} responde de forma diferente quando chamada de novo (${r.status()}). Garanta respostas idempotentes e com contrato estável.` }); }
      else if (ms > 4000) { intN++; add({ tipo: 'integracao', severidade: 'baixa', titulo: `API lenta: ${cam}`, descricao: `Respondeu em ${(ms / 1000).toFixed(1)} s.`, tela: 'Retaguarda (APIs)', url: A2.url.replace(/\?.*/, ''), chave: 'int-lenta:' + cam }); }
      // sem login: mantém só cabeçalhos públicos (ex.: apikey pública), tira sessão e token do usuário
      const temSessao = Object.keys(A2.headers || {}).some(k => /^(authorization|cookie)$/i.test(k));
      if (anon && temSessao) { const pub = Object.fromEntries(Object.entries(hdr).filter(([k]) => !/^(authorization|cookie|x-csrf-token)$/i.test(k)));
        const ra = await anon.get(A2.url, { headers: pub, timeout: 20000 }).catch(() => null);
        if (ra && ra.status() === 200) { let dados = false; try { const j = JSON.parse(await ra.text()); dados = Array.isArray(j) ? j.length > 0 : Object.values(j).some(v => Array.isArray(v) ? v.length > 0 : false); } catch (_) {}
          if (dados) { intN++; add({ tipo: 'seguranca', severidade: 'critica', titulo: `API devolve dados sem login: ${cam}`, descricao: 'A mesma consulta feita sem a sessão do usuário (sem token/cookie) retornou registros.', tela: 'Retaguarda (APIs)', url: A2.url.replace(/\?.*/, ''), chave: 'int-anon:' + cam,
            prompt_correcao: `A API ${cam} devolve dados para quem não está logado. Exija sessão válida e ative as regras de acesso por usuário (ex.: Row Level Security no Supabase) para essa tabela/rota.` }); } } }
    } catch (e) { intN++; add({ tipo: 'integracao', severidade: 'media', titulo: `API não responde ao ser repetida: ${cam}`, descricao: e.message.substring(0, 300), tela: 'Retaguarda (APIs)', url: A2.url.replace(/\?.*/, ''), chave: 'int-falha:' + cam }); } }
  if (anon) await anon.dispose().catch(() => {});
  // ── 2l. Robô de Carga e Estresse (só em produto liberado para carga — ambiente de homologação/desempenho) ──
  const casosCarga = casos.filter(c => ['carga', 'estresse'].includes(c.tipo));
  if (P.permitir_carga && apisVistas.size && Date.now() < fimEm - 120000) {
    const alvos = [...apisVistas.values()].slice(0, 5), nom = Math.max(1, P.usuarios_simultaneos || 10);
    const degraus = [...new Set([Math.ceil(nom / 4), Math.ceil(nom / 2), nom, nom * 2, nom * 4].map(x => Math.min(200, x)))];
    const DUR = parseInt(process.env.QA_CARGA_SEGUNDOS || '15') * 1000, med = [];
    let ruptura = null;
    for (const u of degraus) {
      const lat = []; let err = 0, k = 0; const fim = Date.now() + DUR;
      await Promise.all(Array.from({ length: u }, async () => { while (Date.now() < fim) { const A2 = alvos[k++ % alvos.length]; const h = Object.fromEntries(Object.entries(A2.headers || {}).filter(([x]) => !/^(host|content-length|connection|accept-encoding)$/i.test(x)));
        const t1 = Date.now(); try { const r = await ctx.request.get(A2.url, { headers: h, timeout: 20000 }); if (r.status() >= 400) err++; await r.body().catch(() => {}); } catch (_) { err++; } lat.push(Date.now() - t1); } }));
      lat.sort((a, b) => a - b); const p95 = lat[Math.floor(lat.length * 0.95)] || 0, erroPct = lat.length ? Math.round(err / lat.length * 1000) / 10 : 100;
      med.push({ usuarios: u, req: lat.length, rps: Math.round(lat.length / (DUR / 1000) * 10) / 10, p50: lat[Math.floor(lat.length / 2)] || 0, p95, erro_pct: erroPct });
      console.log(`  · carga ${u} usuários: ${lat.length} req · p95 ${p95} ms · erro ${erroPct}%`);
      if (!ruptura && (erroPct >= 5 || p95 > 5000)) { ruptura = u; break; }
    }
    const nomM = med.find(m => m.usuarios === nom) || med[med.length - 1];
    const okNom = nomM && nomM.p95 <= 3000 && nomM.erro_pct < 1;
    const tab = med.map(m => `${m.usuarios} usuários: ${m.req} req (${m.rps}/s) · p50 ${m.p50} ms · p95 ${m.p95} ms · erro ${m.erro_pct}%`).join('\n');
    if (!okNom) add({ tipo: 'desempenho', severidade: 'alta', titulo: `Não suporta a carga nominal de ${nom} usuários simultâneos`, descricao: `Meta: p95 até 3 s e erro abaixo de 1%.\n${tab}`, tela: 'Retaguarda (APIs)', url: P.url, chave: 'carga-nominal',
      prompt_correcao: `Com ${nom} usuários simultâneos as APIs ${alvos.map(a => new URL(a.url).pathname).join(', ')} ficam lentas ou com erro (${nomM ? 'p95 ' + nomM.p95 + ' ms, erro ' + nomM.erro_pct + '%' : 'sem medição'}). Otimize consultas (índices, paginação, cache) e a capacidade do backend.` });
    for (const C of casosCarga) casosRes.push({ id: C.id, tipo: C.tipo, status: C.tipo === 'carga' ? (okNom ? 'passou' : 'falhou') : (ruptura && ruptura <= nom ? 'falhou' : 'passou'),
      evidencia: `Robô de Carga — APIs: ${alvos.map(a => new URL(a.url).pathname).join(', ')}\n${tab}\n${ruptura ? 'Ponto de ruptura: ' + ruptura + ' usuários simultâneos' : 'Sem ruptura até ' + degraus[degraus.length - 1] + ' usuários'}` });
    robos.carga = { degraus: med, nominal: nom, ruptura, texto: `${med.length} degrau(s) até ${med[med.length - 1]?.usuarios} usuários · nominal ${nom}: ${nomM ? 'p95 ' + nomM.p95 + ' ms, erro ' + nomM.erro_pct + '%' : '—'} · ${ruptura ? 'ruptura em ' + ruptura + ' usuários' : 'sem ruptura'}` };
  } else robos.carga = { texto: P.permitir_carga ? 'nenhuma API capturada para medir' : 'desligado — libere "teste de carga" no cadastro do produto (use ambiente de homologação)' };
  robos.integracao = { apis: apisVistas.size, reexecutadas: intRe, achados: intN, texto: `${intRe} API(s) reexecutadas (status, contrato, tempo e acesso sem login) · ${intN} achado(s)` };
  // ── 3. segurança: telas internas exigem login? (sessão anônima, só leitura) ──
  progresso({ etapa: 'Robô de Segurança — acesso sem login', pct: 96 }, true);
  try { const anon = await browser.newContext(); const pa = await anon.newPage(); let abertas = [];
    for (const v of [...visitadas.values()].slice(0, 12)) { const u = v.url; if (u.split('#')[0] === (P.url_login || P.url).split('#')[0]) continue;
      await pa.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); await espera(2500);
      const pedeLogin = await temCampoSenha(pa) || /login|entrar|sign[- ]?in|auth/i.test(new URL(pa.url()).pathname);
      const vis = await pa.evaluate(() => ({ n: (document.body?.innerText || '').trim().length, h: (document.querySelector('h1,h2,[role=heading]')?.innerText || document.title || '').trim().substring(0, 80) })).catch(() => ({ n: 0, h: '' }));
      // a mesma tela (mesmo título) ou uma tela com conteúdo, aberta sem sessão e sem pedir login = acesso indevido
      if (!pedeLogin && (vis.h && vis.h === v.titulo || vis.n > 150)) abertas.push(v.titulo + ' (' + u + ')'); }
    await anon.close();
    if (abertas.length) add({ tipo: 'seguranca', severidade: 'critica', titulo: 'Telas internas abrem sem login', descricao: 'Abertas numa sessão anônima, sem pedir login:\n' + abertas.join('\n'), tela: 'Controle de acesso', url: P.url, chave: 'sem-login',
      prompt_correcao: 'Proteja todas as rotas internas do app: sem sessão válida, redirecione para a tela de login e não carregue dados (verifique também as regras de acesso das tabelas no backend).' });
  } catch (_) {}
  await ctx.close();
  const nTipo = t => A.filter(a => a.tipo === t).length;
  robos.seguranca = { achados: nTipo('seguranca'), texto: `HTTPS, cabeçalhos, cookies de sessão, telas e APIs sem login · ${nTipo('seguranca')} achado(s)` };
  robos.desempenho = { achados: nTipo('desempenho'), texto: `tempo de carga das telas e das APIs · ${nTipo('desempenho')} achado(s)` };
  // remove achados repetidos da mesma execução
  const uniq = new Map(); for (const a of A) { const k = a.tipo + '|' + (a.chave || a.titulo) + '|' + (a.tela || ''); if (!uniq.has(k)) uniq.set(k, a); }
  const achados = [...uniq.values()];
  const cobertura = descobertas ? Math.round(testadas / descobertas * 1000) / 10 : 0;
  console.log(`  ${testadas}/${descobertas} telas · ${achados.length} achado(s) · ${crudFeitos} ciclo(s) de cadastro · ${iaUsadas} análise(s) de IA · ${Math.round((Date.now() - t0) / 1000)} s`);
  return { telas_descobertas: descobertas, telas_testadas: testadas, cobertura_pct: cobertura, achados, casos_resultados: casosRes,
    resumo: { duracao_s: Math.round((Date.now() - t0) / 1000), ciclos_cadastro: crudFeitos, analises_ia: iaUsadas, telas: telasInfo.slice(0, 80), pendentes: fila.slice(0, 30).map(f => f.caminho), robos } };
}

function luhn(n) { if (n.length < 15 || n.length > 16 || /^(\d)\1+$/.test(n)) return false; let s = 0; for (let i = 0; i < n.length; i++) { let d = +n[n.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; } return s % 10 === 0; }
// estado da tela para a IA decidir o próximo passo do caso
async function lerEstado(pg) {
  const base = await pg.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const campos = [...document.querySelectorAll('input,select,textarea')].filter(e => vis(e) && !['hidden', 'password'].includes(e.type)).slice(0, 40).map(e => {
      const rot = (e.labels?.[0]?.innerText || e.getAttribute('aria-label') || e.placeholder || e.name || e.id || '').trim().replace(/\s+/g, ' ').substring(0, 50);
      return rot + ' [' + (e.tagName === 'SELECT' ? 'lista: ' + [...e.options].slice(0, 8).map(o => o.text.trim()).join('/') : e.type || e.tagName.toLowerCase()) + (e.value ? ' = "' + String(e.value).substring(0, 30) + '"' : '') + ']'; });
    const alertas = [...document.querySelectorAll('[role=alert],[role=status],.toast,[class*=toast],[aria-invalid=true],.error,.text-destructive')].filter(vis).map(e => e.innerText.trim()).filter(Boolean).slice(0, 6);
    return { url: location.href, titulo: (document.querySelector('h1,h2,[role=heading]')?.innerText || document.title || '').trim().substring(0, 100), texto: (document.body?.innerText || '').substring(0, 6000), campos, alertas };
  }).catch(() => ({ url: pg.url(), titulo: '', texto: '', campos: [], alertas: [] }));
  return { ...base, clicaveis: await textosClicaveis(pg) };
}
async function campoPorRotulo(pg, alvo) {
  const nome = String(alvo || '').replace(/\s*\[.*$/, '').trim();
  for (const loc of [pg.getByLabel(nome, { exact: false }), pg.getByPlaceholder(nome, { exact: false }), pg.locator(`[name="${nome.replace(/"/g, '')}"], #${nome.replace(/[^\w-]/g, '') || 'x-nada'}`), pg.getByRole('textbox', { name: nome })]) {
    const l = loc.first(); if (await l.count().catch(() => 0) && await l.isVisible().catch(() => false)) return l; }
  throw new Error('campo "' + nome + '" não encontrado');
}
async function executarCaso(pg, C, P, origem, urlInicial) {
  await pg.goto(urlInicial, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {}); await pg.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await espera(1000);
  const hist = []; const repet = new Map();
  for (let k = 0; k < MAX_PASSOS; k++) {
    const estado = await lerEstado(pg);
    let d; try { d = await api('robo_passo', { caso: C, estado, historico: hist }); } catch (e) { return { veredito: 'bloqueado', motivo: 'IA indisponível: ' + e.message, hist }; }
    if (d.acao === 'concluir') return { veredito: ['passou', 'falhou', 'bloqueado'].includes(d.veredito) ? d.veredito : 'bloqueado', motivo: d.motivo || '', hist };
    const ch = d.acao + '|' + d.alvo + '|' + (d.valor || ''); repet.set(ch, (repet.get(ch) || 0) + 1);
    if (repet.get(ch) > 2) return { veredito: 'falhou', motivo: `o fluxo não avança: a ação "${d.acao} ${d.alvo}" foi repetida sem efeito`, hist };
    try {
      if (d.acao === 'clicar') { if (RX_PERIGO.test(d.alvo)) { hist.push(`(recusado: "${d.alvo}" é ação proibida para o robô)`); continue; } await clicarPorTexto(pg, d.alvo); hist.push(`clicar "${d.alvo}"`); }
      else if (d.acao === 'preencher') { const l = await campoPorRotulo(pg, d.alvo); await l.fill(String(d.valor ?? ''), { timeout: 5000 }); hist.push(`preencher "${d.alvo}" com "${String(d.valor ?? '').substring(0, 40)}"`); }
      else if (d.acao === 'selecionar') { const l = await campoPorRotulo(pg, d.alvo); await l.selectOption({ label: String(d.valor) }).catch(() => l.selectOption(String(d.valor))); hist.push(`selecionar "${d.valor}" em "${d.alvo}"`); }
      else if (d.acao === 'navegar') { const u = new URL(d.alvo, pg.url()); if (u.origin !== origem) { hist.push('(recusado: outro site)'); continue; } await pg.goto(u.href, { waitUntil: 'domcontentloaded', timeout: 30000 }); hist.push('abrir ' + u.pathname + u.hash); }
      else { await espera(2500); hist.push('aguardar'); }
    } catch (e) { hist.push(`não conseguiu ${d.acao} "${d.alvo}": ${String(e.message).split('\n')[0].substring(0, 100)}`); }
    await pg.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await espera(600);
  }
  return { veredito: 'bloqueado', motivo: `limite de ${MAX_PASSOS} passos atingido sem concluir o caso`, hist };
}

async function temCampoSenha(pg) { return pg.locator('input[type=password]:visible').count().then(n => n > 0).catch(() => false); }
async function login(pg, P, add) {
  await pg.goto(P.url_login || P.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); await espera(2500);
  if (!(await temCampoSenha(pg))) {
    // talvez exista um botão "Entrar" que abre o formulário
    const t = (await textosClicaveis(pg)).find(x => /^(entrar|login|acessar|sign in|log in)$/i.test(x.trim()));
    if (t) { await clicarPorTexto(pg, t); await espera(2000); }
  }
  if (!(await temCampoSenha(pg))) { if (P.usuario) add({ tipo: 'acesso', severidade: 'media', titulo: 'Tela de login não encontrada', descricao: 'O robô não achou um campo de senha na URL informada; seguiu sem login.', tela: 'Login', url: pg.url(), chave: 'sem-form-login' }); return; }
  if (!P.usuario) throw new Error('O produto pede login, mas o usuário de teste não está cadastrado.');
  if (!P.senha) throw new Error(P.senha_status === 'ilegivel' ? 'A senha de teste está guardada, mas não pôde ser lida (a chave de criptografia mudou) — digite a senha de novo no cadastro do produto.' : 'O produto pede login, mas a senha de teste não está cadastrada.');
  const campos = await pg.evaluate(() => [...document.querySelectorAll('input,button,[role=button]')].filter(e => e.offsetParent).map(e => e.tagName === 'INPUT' ? `input[${e.type}${e.name ? ' name=' + e.name : ''}${e.placeholder ? ' "' + e.placeholder + '"' : ''}]` : `botão "${(e.innerText || e.getAttribute('aria-label') || '').trim().substring(0, 30)}"${e.type ? ' (' + e.type + ')' : ''}`).slice(0, 20).join(', ')).catch(() => '');
  const user = pg.locator('input[type=email]:visible, input[name*=email i]:visible, input[autocomplete*=email i]:visible, input[name*=user i]:visible, input[name*=login i]:visible, input[placeholder*=mail i]:visible, input[type=text]:visible').first();
  // digita como um usuário (alguns apps só habilitam o botão com eventos de teclado)
  await user.click().catch(() => {}); await user.fill(''); await user.pressSequentially(P.usuario, { delay: 25 });
  const ps = pg.locator('input[type=password]:visible').first(); await ps.click().catch(() => {}); await ps.fill(''); await ps.pressSequentially(P.senha, { delay: 25 });
  const preenchido = await pg.evaluate(() => { const e = document.querySelector('input[type=email],input[name*=email i],input[type=text]'), p = document.querySelector('input[type=password]'); return { email: e ? (e.value || '').replace(/^(.).*(@.*)$/, '$1…$2') : '?', senha_chars: p ? (p.value || '').length : 0 }; }).catch(() => ({}));
  // v3.138: escolhe o botão de entrar EXATO (não "Entrar com Face ID", "Esqueci minha senha", "Criar conta"…)
  const exato = pg.locator('button:visible, [role=button]:visible, input[type=submit]:visible').filter({ hasText: /^\s*(entrar|login|log in|acessar|sign in|continuar|enviar)\s*$/i }).first();
  const submit = pg.locator('form button[type=submit]:visible, form input[type=submit]:visible').filter({ hasNotText: /face id|digital|biometria|google|microsoft|apple|esqueci|criar|cadastr/i }).first();
  // respostas de autenticação durante o login (só status e mensagem de erro — nunca tokens)
  const respAuth = []; const ouvir = async r => { try { const u = r.url(); if (!/auth|login|token|session|signin|sign_in/i.test(u) || r.request().method() === 'GET' && r.status() < 400) return; const st = r.status(); let msg = '';
    if (st >= 400) { const t = await r.text().catch(() => ''); const m = t.match(/"(?:error_description|msg|message|error)"\s*:\s*"([^"]{1,160})"/); msg = m ? m[1] : t.substring(0, 120); }
    respAuth.push(`${r.request().method()} ${new URL(u).pathname} → ${st}${msg ? ' "' + msg + '"' : ''}`); } catch (_) {} };
  pg.on('response', ouvir);
  let clicado = 'Enter';
  if (await exato.count()) { clicado = 'botão "' + (await exato.innerText().catch(() => '')).trim() + '"'; await exato.click().catch(() => {}); } else if (await submit.count()) { clicado = 'botão submit "' + (await submit.innerText().catch(() => '')).trim() + '"'; await submit.click().catch(() => {}); } else await pg.locator('input[type=password]:visible').first().press('Enter');
  // espera até 20 s o campo de senha sumir (login com Supabase/redirecionamento pode demorar)
  for (let i = 0; i < 20 && await temCampoSenha(pg); i++) await espera(1000);
  await pg.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await espera(1500);
  pg.off('response', ouvir);
  if (await temCampoSenha(pg)) {
    const alerta = await pg.evaluate(() => [...document.querySelectorAll('[role=alert],[role=status],.toast,[class*=toast],[class*=error],[class*=destructive],[aria-live]')].map(e => e.innerText.trim()).filter(Boolean).join(' | ').substring(0, 300)).catch(() => '');
    const e = new Error('Login não concluído com o usuário de teste' + (alerta ? ' — mensagem do sistema: "' + alerta + '"' : ' — nenhuma mensagem de erro na tela') + `. Diagnóstico: preenchido e-mail ${preenchido.email} e senha com ${preenchido.senha_chars} caractere(s); clicou ${clicado}; respostas do servidor: ${respAuth.slice(0, 5).join(' ; ') || 'nenhuma chamada de login detectada'}; endereço depois: ${pg.url()}; elementos da tela: ${campos}.`);
    try { e.print = 'data:image/jpeg;base64,' + (await pg.screenshot({ type: 'jpeg', quality: 50 })).toString('base64'); } catch (_) {}
    throw e; }
}
async function textosClicaveis(pg, soNavegacao = false) {
  return pg.evaluate(sn => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const sel = sn ? 'nav a, nav button, aside a, aside button, [role=tab], [role=menuitem], header a, .sidebar a, .sidebar button, [class*=menu] a, [class*=menu] button, [class*=nav] a' : 'button, a, [role=button], [role=tab], [role=menuitem]';
    return [...new Set([...document.querySelectorAll(sel)].filter(vis).map(e => (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ')).filter(t => t && t.length <= 40))]; }, soNavegacao).catch(() => []);
}
async function clicarPorTexto(pg, t) {
  const loc = pg.locator(`button:visible, a:visible, [role=button]:visible, [role=tab]:visible, [role=menuitem]:visible`).filter({ hasText: t }).first();
  if (await loc.count()) { await loc.click({ timeout: 8000 }); } else { const l2 = pg.getByLabel(t).first(); if (await l2.count()) await l2.click({ timeout: 8000 }); else throw new Error('elemento "' + t + '" não encontrado'); }
  await pg.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await espera(1000);
}
// preenche o formulário visível com dados de teste coerentes com o tipo de cada campo
async function preencher(pg, marca, alterar = false) {
  const campos = pg.locator('form input:visible, form textarea:visible, form select:visible, [role=dialog] input:visible, [role=dialog] textarea:visible, [role=dialog] select:visible');
  const n = Math.min(await campos.count(), 25); let preenchidos = 0, primeiroTexto = null;
  for (let i = 0; i < n; i++) { const c = campos.nth(i);
    const tipo = (await c.getAttribute('type').catch(() => '') || '').toLowerCase(), tag = await c.evaluate(e => e.tagName.toLowerCase()).catch(() => 'input');
    const nome = ((await c.getAttribute('name').catch(() => '')) || (await c.getAttribute('placeholder').catch(() => '')) || '').toLowerCase();
    if (['hidden', 'file', 'submit', 'button', 'password', 'checkbox', 'radio'].includes(tipo)) continue;
    if (alterar && primeiroTexto !== null) break;
    try {
      if (tag === 'select') { const ops = await c.locator('option').evaluateAll(o => o.map(x => x.value).filter(v => v)); if (ops.length) await c.selectOption(ops[Math.min(1, ops.length - 1)]); }
      else if (tipo === 'email' || /e-?mail/.test(nome)) await c.fill('qa+' + marca.toLowerCase() + '@atlantyx.com.br');
      else if (tipo === 'number' || /valor|pre[cç]o|quant|qtd|n[uú]mero/.test(nome)) await c.fill('123');
      else if (tipo === 'date') await c.fill(new Date(Date.now() + 7 * 864e5).toISOString().substring(0, 10));
      else if (tipo === 'tel' || /telefone|celular|whats/.test(nome)) await c.fill('21999990000');
      else if (/cnpj/.test(nome)) await c.fill('11222333000181');
      else if (/cpf/.test(nome)) await c.fill('52998224725');
      else { const v = (alterar ? marca + '-ALTERADO' : marca) + (tag === 'textarea' ? ' — registro de teste do robô de QA' : ''); await c.fill(v); if (primeiroTexto === null) primeiroTexto = v; }
      preenchidos++;
    } catch (_) {}
  }
  return { preenchidos, primeiroTexto };
}
async function testarCrud(pg, P, nomeTela, botaoNovo, marca, add, comoChegar, print) {
  const urlTela = pg.url(); const passos = [];
  const falha = async (etapa, desc, sev = 'alta') => add({ tipo: 'crud', severidade: sev, titulo: `Cadastro em "${nomeTela}": falha ao ${etapa}`, descricao: desc + '\n\nPassos: ' + passos.join(' → '), tela: nomeTela, url: urlTela, chave: 'crud:' + etapa, print: await print(), como_reproduzir: comoChegar + ' → ' + passos.join(' → '),
    prompt_correcao: `Na tela "${nomeTela}", ao ${etapa} um registro (${passos.join(' → ')}), ${desc} Corrija para que o registro seja ${etapa === 'incluir' ? 'gravado e apareça na lista' : etapa === 'alterar' ? 'atualizado e a lista mostre o novo valor' : 'removido e desapareça da lista'}, com mensagem de confirmação.` });
  // INCLUIR
  await clicarPorTexto(pg, botaoNovo); passos.push(`clicar "${botaoNovo}"`);
  const p1 = await preencher(pg, marca); if (!p1.preenchidos || !p1.primeiroTexto) { passos.push('formulário sem campos de texto'); return; }
  passos.push(`preencher ${p1.preenchidos} campo(s) com "${marca}"`);
  const salvar = (await textosClicaveis(pg)).find(t => RX_SALVAR.test(t)); if (!salvar) return falha('incluir', 'não há botão de salvar visível no formulário.', 'media');
  const errosAntes = (await pg.evaluate(() => document.body.innerText)).length;
  await clicarPorTexto(pg, salvar); passos.push(`clicar "${salvar}"`); await espera(2000);
  const validacao = await pg.evaluate(() => [...document.querySelectorAll('[aria-invalid=true], .error, .text-destructive, [role=alert]')].map(e => e.innerText.trim()).filter(Boolean).slice(0, 4)).catch(() => []);
  await pg.goto(urlTela, { waitUntil: 'domcontentloaded' }).catch(() => {}); await pg.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await espera(1500);
  const achouIncl = await pg.getByText(p1.primeiroTexto, { exact: false }).count().catch(() => 0);
  if (!achouIncl) return falha('incluir', `o registro "${p1.primeiroTexto}" não aparece na lista depois de salvar e recarregar a tela.${validacao.length ? ' Mensagens no formulário: ' + validacao.join(' | ') : ''}`);
  passos.push('registro aparece na lista ✓');
  // ALTERAR
  const linha = pg.locator('tr, li, [role=row], .card, [class*=card], [class*=item]').filter({ hasText: p1.primeiroTexto }).first();
  const editar = linha.locator('button, a, [role=button]').filter({ hasText: RX_EDITAR }).first();
  if (await editar.count()) { await editar.click().catch(() => {}); } else { await linha.click().catch(() => {}); }
  await espera(1500); passos.push('abrir para editar');
  const p2 = await preencher(pg, marca, true);
  const salvar2 = (await textosClicaveis(pg)).find(t => RX_SALVAR.test(t));
  if (p2.primeiroTexto && salvar2) { await clicarPorTexto(pg, salvar2); passos.push(`alterar para "${p2.primeiroTexto}" e salvar`); await espera(1800);
    await pg.goto(urlTela, { waitUntil: 'domcontentloaded' }).catch(() => {}); await pg.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await espera(1500);
    if (!(await pg.getByText(p2.primeiroTexto, { exact: false }).count().catch(() => 0))) await falha('alterar', `a alteração para "${p2.primeiroTexto}" não aparece depois de salvar e recarregar.`);
    else passos.push('alteração aparece ✓'); }
  else passos.push('edição não encontrada (sem botão Editar ou formulário)');
  // EXCLUIR (com confirmação aceita só aqui)
  const alvoTxt = p2.primeiroTexto && (await pg.getByText(p2.primeiroTexto, { exact: false }).count().catch(() => 0)) ? p2.primeiroTexto : p1.primeiroTexto;
  const linha2 = pg.locator('tr, li, [role=row], .card, [class*=card], [class*=item]').filter({ hasText: alvoTxt }).first();
  let excl = linha2.locator('button, a, [role=button]').filter({ hasText: RX_EXCLUIR }).first();
  if (!(await excl.count())) { await linha2.click().catch(() => {}); await espera(1200); excl = pg.locator('button:visible, [role=button]:visible').filter({ hasText: RX_EXCLUIR }).first(); }
  if (!(await excl.count())) return falha('excluir', 'não há opção de excluir para o registro de teste (ele ficou gravado com a marca ' + marca + ').', 'media');
  // v3.134: aceita só a confirmação DESTA exclusão — a nativa (confirm) durante o clique, ou o botão dentro do modal
  // de confirmação. Antes procurava "Excluir" na página inteira e podia clicar no botão de OUTRO registro da lista.
  pg._aceitarDialogo = true; await excl.click().catch(() => {}); await espera(1200); pg._aceitarDialogo = false;
  const modal = pg.locator('[role=alertdialog]:visible, [role=dialog]:visible, .modal:visible, [class*=modal]:visible, [class*=dialog]:visible').last();
  if (await modal.count().catch(() => 0)) { const b = modal.locator('button:visible, [role=button]:visible').filter({ hasText: /^\s*(sim|confirmar|excluir|apagar|remover|delete|yes|ok)\s*$/i }).first();
    if (await b.count().catch(() => 0)) { await b.click().catch(() => {}); await espera(1200); } }
  passos.push('excluir e confirmar'); await espera(1500);
  await pg.goto(urlTela, { waitUntil: 'domcontentloaded' }).catch(() => {}); await pg.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await espera(1500);
  if (await pg.getByText(alvoTxt, { exact: false }).count().catch(() => 0)) return falha('excluir', `o registro "${alvoTxt}" continua na lista depois de excluir e recarregar.`);
  passos.push('registro removido ✓'); console.log('    cadastro OK: ' + passos.join(' → '));
}
