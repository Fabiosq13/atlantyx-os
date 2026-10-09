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
// e devolve tudo em robo_resultado (achados com evidência, print, como reproduzir e prompt de correção).
import { chromium } from 'playwright';

const BASE = (process.env.ATX_URL || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
const SEG = process.env.CRON_SECRET;
if (!SEG) { console.error('Falta o secret CRON_SECRET no GitHub (o mesmo valor do Vercel).'); process.exit(1); }
const MAX_IA = parseInt(process.env.QA_MAX_IA || '40'), ORC_MIN = parseInt(process.env.QA_MINUTOS_PRODUTO || '45');
const api = async (action, body = {}) => {
  const r = await fetch(BASE + '/api/qa-externo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SEG }, body: JSON.stringify({ action, ...body }) });
  const d = await r.json().catch(() => ({})); if (!r.ok || !d.success) throw new Error(action + ': ' + (d.error || r.status)); return d;
};
const espera = ms => new Promise(r => setTimeout(r, ms));
// nunca clicar: sair da conta, excluir a própria conta, pagamentos, envios em massa
const RX_PERIGO = /\b(sair|logout|log ?out|sign ?out|desconectar|excluir (minha )?conta|apagar (minha )?conta|delete account|encerrar conta|cancelar assinatura|pagar|checkout|comprar|disparar|enviar para todos)\b/i;
const RX_LIXO = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|R\$\s*NaN|(^|\s)null(\s|$)/;
const RX_TECNICO = /(TypeError|ReferenceError|SyntaxError|Cannot read propert|is not a function|stack trace|at \w+ \(.*:\d+:\d+\)|ECONNREFUSED|ERR_|Internal Server Error|SQLSTATE|duplicate key|violates|PGRST\d+|supabase|JWT expired|Failed to fetch)/i;
const RX_NOVO = /^\s*(\+\s*)?(novo|nova|adicionar|incluir|criar|cadastrar|add|new|create)\b/i;
const RX_SALVAR = /^\s*(salvar|gravar|confirmar|criar|adicionar|cadastrar|save|submit|ok|concluir|enviar)\b/i;
const RX_EDITAR = /^\s*(editar|alterar|edit|✎|✏)/i;
const RX_EXCLUIR = /^\s*(excluir|apagar|remover|deletar|delete|remove|🗑)/i;

const browser = await chromium.launch();
if (process.env.QA_NOTURNO === '1') { try { console.log('Fila noturna:', JSON.stringify(await api('robo_enfileirar_noturno'))); } catch (e) { console.log('Fila noturna:', e.message); } }
for (let n = 0; n < 10; n++) {
  let job; try { job = await api('robo_proximo'); } catch (e) { console.error(e.message); break; }
  if (!job.execucao) { console.log('Fila vazia.'); break; }
  const P = job.produto; console.log(`\n=== ${P.nome} (${P.url}) · execução ${job.execucao.id}`);
  let R;
  try { R = await testarProduto(P, job.execucao.id); }
  catch (e) { console.error('Falha geral:', e.message); R = { erro: e.message, telas_descobertas: 0, telas_testadas: 0, cobertura_pct: 0, achados: [{ tipo: 'acesso', severidade: 'critica', titulo: 'O robô não conseguiu testar o produto', descricao: e.message, tela: P.url, url: P.url, chave: 'falha-geral' }] }; }
  try { const r = await api('robo_resultado', { execucao_id: job.execucao.id, ...R }); console.log('Resultado gravado:', JSON.stringify(r)); } catch (e) { console.error('Não gravou o resultado:', e.message); }
}
await browser.close();

async function testarProduto(P, execId) {
  const t0 = Date.now(), fimEm = t0 + ORC_MIN * 60000, marca = 'QA-ATX-' + execId.slice(-6);
  const A = []; const add = a => { A.push(a); };
  const origem = new URL(P.url).origin;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: false });
  const pg = await ctx.newPage();
  let consoleErros = [], chamadas = [];
  pg.on('console', m => { if (m.type() === 'error') consoleErros.push(m.text().substring(0, 300)); });
  pg.on('pageerror', e => consoleErros.push('JS: ' + String(e.message).substring(0, 300)));
  pg.on('dialog', d => (pg._aceitarDialogo ? d.accept() : d.dismiss()).catch(() => {}));
  const inicioReq = new Map();
  pg.on('request', r => { if (['xhr', 'fetch'].includes(r.resourceType())) inicioReq.set(r, Date.now()); });
  pg.on('requestfinished', async r => { if (!inicioReq.has(r)) return; const ms = Date.now() - inicioReq.get(r); inicioReq.delete(r);
    const resp = await r.response().catch(() => null); let corpo = '';
    try { const ct = resp?.headers()['content-type'] || ''; if (/json|text/.test(ct)) corpo = (await resp.text()).substring(0, 1500); } catch (_) {}
    chamadas.push({ metodo: r.method(), url: r.url(), status: resp?.status() || 0, ms, corpo }); });
  pg.on('requestfailed', r => { if (inicioReq.has(r)) { inicioReq.delete(r); chamadas.push({ metodo: r.method(), url: r.url(), status: 0, ms: 0, erro: r.failure()?.errorText || 'falhou' }); } });

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
  await login(pg, P, add);
  if (Date.now() > fimEm) throw new Error('tempo esgotado no login');
  const cookies = await ctx.cookies();
  const sessao = cookies.filter(c => /sess|auth|token|sb-|jwt|sid/i.test(c.name));
  const fracos = sessao.filter(c => !c.secure || !c.httpOnly || !c.sameSite || c.sameSite === 'None');
  if (fracos.length) add({ tipo: 'seguranca', severidade: 'media', titulo: 'Cookie de sessão sem proteções', descricao: fracos.map(c => `${c.name}: ${[!c.secure && 'sem Secure', !c.httpOnly && 'sem HttpOnly', (!c.sameSite || c.sameSite === 'None') && 'SameSite ausente/None'].filter(Boolean).join(', ')}`).join(' · '), tela: 'Login', url: pg.url(), chave: 'cookies',
    prompt_correcao: 'Ajuste os cookies de sessão para Secure, HttpOnly e SameSite=Lax (ou Strict).' });

  // ── 2. descoberta e teste das telas ──
  const visitadas = new Map(); // chave → { titulo, url }
  const fila = [{ url: pg.url(), via: null, caminho: 'tela inicial após login' }];
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
    if (info.misto) add({ tipo: 'seguranca', severidade: 'media', titulo: `Conteúdo http dentro de página https em "${nomeTela}"`, descricao: info.misto + ' recurso(s) carregado(s) por http://', tela: nomeTela, url: pg.url(), chave: 'misto' });
    // 2d. celular
    await pg.setViewportSize({ width: 390, height: 844 }); await espera(700);
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
  // ── 3. segurança: telas internas exigem login? (sessão anônima, só leitura) ──
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
  // remove achados repetidos da mesma execução
  const uniq = new Map(); for (const a of A) { const k = a.tipo + '|' + (a.chave || a.titulo) + '|' + (a.tela || ''); if (!uniq.has(k)) uniq.set(k, a); }
  const achados = [...uniq.values()];
  const cobertura = descobertas ? Math.round(testadas / descobertas * 1000) / 10 : 0;
  console.log(`  ${testadas}/${descobertas} telas · ${achados.length} achado(s) · ${crudFeitos} ciclo(s) de cadastro · ${iaUsadas} análise(s) de IA · ${Math.round((Date.now() - t0) / 1000)} s`);
  return { telas_descobertas: descobertas, telas_testadas: testadas, cobertura_pct: cobertura, achados,
    resumo: { duracao_s: Math.round((Date.now() - t0) / 1000), ciclos_cadastro: crudFeitos, analises_ia: iaUsadas, telas: telasInfo.slice(0, 80), pendentes: fila.slice(0, 30).map(f => f.caminho) } };
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
  if (!P.usuario || !P.senha) throw new Error('O produto pede login, mas usuário/senha de teste não estão cadastrados (ou a senha não pôde ser lida — cadastre de novo).');
  const user = pg.locator('input[type=email]:visible, input[name*=user i]:visible, input[name*=login i]:visible, input[name*=email i]:visible, input[type=text]:visible').first();
  await user.fill(P.usuario); await pg.locator('input[type=password]:visible').first().fill(P.senha);
  const botao = pg.locator('button[type=submit]:visible, button:visible:has-text("Entrar"), button:visible:has-text("Login"), button:visible:has-text("Acessar"), button:visible:has-text("Sign in")').first();
  if (await botao.count()) await botao.click().catch(() => {}); else await pg.keyboard.press('Enter');
  await pg.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await espera(3000);
  if (await temCampoSenha(pg)) { const msg = await pg.evaluate(() => document.body.innerText.substring(0, 300)).catch(() => '');
    throw new Error('Login recusado com o usuário de teste. Tela: ' + msg.replace(/\s+/g, ' ').substring(0, 200)); }
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
  pg._aceitarDialogo = true; await excl.click().catch(() => {}); await espera(1200);
  const conf = (await textosClicaveis(pg)).find(t => /^(sim|confirmar|excluir|apagar|remover|delete|yes|ok)$/i.test(t.trim())); if (conf) { await clicarPorTexto(pg, conf).catch(() => {}); }
  pg._aceitarDialogo = false; passos.push('excluir e confirmar'); await espera(1500);
  await pg.goto(urlTela, { waitUntil: 'domcontentloaded' }).catch(() => {}); await pg.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await espera(1500);
  if (await pg.getByText(alvoTxt, { exact: false }).count().catch(() => 0)) return falha('excluir', `o registro "${alvoTxt}" continua na lista depois de excluir e recarregar.`);
  passos.push('registro removido ✓'); console.log('    cadastro OK: ' + passos.join(' → '));
}
