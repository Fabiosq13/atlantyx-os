// public/qa-agent.js — v3.16 · Agente de QA e Agente de Segurança do Atlantyx OS
// Roda DENTRO do sistema (mesmo navegador/sessão), percorre todas as telas e ações e gera um
// relatório de correção pronto para o Claude executar.
//
// MODO SEGURO (sempre ligado na varredura de telas): consultas vão ao servidor de verdade;
// qualquer gravação/envio/publicação/chamada de IA é interceptada ANTES de sair do navegador,
// registrada (ação + dados que seriam enviados) e respondida com "bloqueado pelo QA".
// confirm() é respondido "Cancelar", prompt() "vazio", window.open é ignorado.
// O CRUD REAL (com limpeza) roda no servidor, em cadastros que o sistema consegue apagar.
(function () {
  'use strict';
  const MARCA = 'QA-TESTE';
  const READ_RE = /^(list|listar|get|obter|status|historico|config_get|config_status|feed_config_get|feed_listar|feed_hubspot_pendentes|feed_preview_html|kpis_saude|fluxo_futuro|fluxo_detalhado|dre_mensal|extrato_[a-z_]+|orcamento_consolidado|dashboard_[a-z_]*|painel_[a-z_]+|marcos_kanban|marcos_previsao_contar|projeto_list|projeto_get|projetos_listar|projetos_select|projetos_config_list|termo_get|termo_list|termo_ultimo_rateio|termo_diagnostico|termo_rastrear_notas|termo_nf_email_historico|contrato_list|desp_list|desp_ocorrencias|desp_nao_cadastradas|sim_list|conc_(sugestoes|faturas_vencidas|notas_extrato|razao|recebiveis|despesas_dup)|qb_(status|diagnostico|contas_diagnostico|contas_filtro|razao_conta|saldo_por_conta|saldo_contas|fornecedores_list|conferir_banco|varrer_duplicados|rastrear_duplicados)|remessa_(get|list)|report_(get|list)|brief_(get|listar)|conselho_(list|sessao_get|sessao_list)|reuniao_list|funcionario_list|leads_list|leads_por_campanha|clientes_listar|mapa_listar|cartao_get|funil_campanha|comercial_(cac|semaforo)|agenda_gp|alertas_projetos|pagamentos_disponiveis|telefone_status|autocampanha_diagnostico|fila_status|listar_landing_pages|email_diagnostico|metricas|metricas_posts|auditoria_funil|organograma|painel_mestre|excel|list_[a-z_0-9]+|get_[a-z_0-9]+|listar_execucoes|obter_execucao|atlantyx)$/;
  const BOT_LEITURA = /(^|\s)(↻|⟳)|atualizar|recarregar|carregar(?!\s*(nota|arquivo|pdf|xml|planilha|imagem))|buscar|filtrar|consultar|visualizar|listar|pesquisar|ver\s/i;
  const BOT_ARRISCADO = /excluir|apagar|remover|deletar|enviar|disparar|publicar|lançar|lancar|aprovar|pagar|pago|gerar|analisar|ia\b|claude|whatsapp|e-?mail|importar|upload|desconectar|conectar|limpar|resetar|mover|reabrir|arquivar|confirmar|salvar|gravar|sincronizar|executar|varrer/i;
  const BOT_FORM = /salvar|cadastrar|criar|adicionar|incluir|gravar|registrar|captar|\+\s*nov/i;
  const TOKENS_RUINS = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|R\$\s*NaN|NaN%/;
  const CARREGANDO = /carregando|analisando\.\.\.|varrendo|consultando|aguarde|⏳/i;

  const S = { rodando: false, parar: false, relatorio: null, seg: null, crud: null };
  const _orig = {};
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const api = async (action, body = {}) => { const r = await (_orig.fetch || fetch)('/api/qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch (_) { throw new Error('HTTP ' + r.status + ' — ' + t.substring(0, 120)); } if (!d.success) throw new Error(d.error || 'erro'); return d; };

  // ── Instrumentação ─────────────────────────────────────────────────────
  function classificar(url, init) {
    const u = new URL(url, location.href);
    const metodo = String(init?.method || 'GET').toUpperCase();
    let body = null; try { body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (_) {}
    const action = body?.action || u.searchParams.get('action') || null;
    const mesmo = u.origin === location.origin;
    const rota = u.pathname;
    if (!mesmo) return { leitura: metodo === 'GET', rota: u.host + rota, action, body, metodo };
    if (rota === '/api/qa') return { leitura: true, rota, action, body, metodo, interno: true };
    if (metodo === 'GET') return { leitura: !(u.searchParams.get('cron') || (action && !READ_RE.test(action))), rota, action, body, metodo };
    if (rota === '/api/rfp-monitor') return { leitura: !!body?.somente_cache, rota, action: body?.somente_cache ? 'somente_cache' : 'varredura_pncp', body, metodo };
    if (rota === '/api/db') return { leitura: /^(list_|get$|status$)/.test(action || ''), rota, action, body, metodo };
    return { leitura: !!(action && READ_RE.test(action)), rota, action, body, metodo };
  }
  function instrumentar(ctx) {
    _orig.fetch = window.fetch; _orig.alert = window.alert; _orig.confirm = window.confirm; _orig.prompt = window.prompt; _orig.open = window.open; _orig.cerr = console.error;
    ctx.pendentes = 0;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      const c = classificar(url, init);
      const reg = { tela: ctx.tela, fase: ctx.fase, rota: c.rota, action: c.action, metodo: c.metodo, inicio: Date.now() };
      if (c.interno) return _orig.fetch.apply(this, arguments);
      if (!c.leitura) {
        reg.bloqueado = true; reg.ms = 0; reg.payload = c.body ? JSON.stringify(c.body).substring(0, 800) : null;
        ctx.requisicoes.push(reg);
        return new Response(JSON.stringify({ success: false, qa_bloqueado: true, error: '[QA] gravação bloqueada no modo seguro' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      ctx.pendentes++; (ctx.emVoo = ctx.emVoo || new Set()).add(reg);
      try {
        const r = await _orig.fetch.apply(this, arguments);
        reg.status = r.status; reg.ms = Date.now() - reg.inicio;
        try { const cl = r.clone(); const t = await cl.text(); if (/json/.test(r.headers.get('content-type') || '') || /^\s*[{[]/.test(t)) { const j = JSON.parse(t); if (j && j.success === false) reg.erro = String(j.error || j.message || 'success:false').substring(0, 300); } else if (r.status >= 400) reg.erro = t.substring(0, 200); } catch (_) {}
        ctx.requisicoes.push(reg); return r;
      } catch (e) { reg.status = 0; reg.ms = Date.now() - reg.inicio; reg.erro = 'falha de rede: ' + e.message; ctx.requisicoes.push(reg); throw e; }
      finally { ctx.pendentes--; ctx.emVoo && ctx.emVoo.delete(reg); }
    };
    window.alert = m => { ctx.dialogos.push({ tela: ctx.tela, tipo: 'alert', msg: String(m).substring(0, 300) }); };
    window.confirm = m => { ctx.dialogos.push({ tela: ctx.tela, tipo: 'confirm', msg: String(m).substring(0, 200) }); ctx.confirmou = true; return false; };
    window.prompt = m => { ctx.dialogos.push({ tela: ctx.tela, tipo: 'prompt', msg: String(m).substring(0, 200) }); ctx.confirmou = true; return null; };
    window.open = () => null;
    // v3.17: nenhum clique pode tirar o navegador do sistema durante a varredura
    ctx.onClick = e => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (a && !/^javascript:|^#/.test(a.getAttribute('href') || '')) { e.preventDefault(); e.stopPropagation(); ctx.dialogos.push({ tela: ctx.tela, tipo: 'link', msg: 'navegação bloqueada: ' + a.getAttribute('href').substring(0, 120) }); } };
    document.addEventListener('click', ctx.onClick, true);
    ctx.onUnload = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', ctx.onUnload);
    const doQA = m => /\[QA\]|bloqueada no modo seguro|qa_bloqueado/.test(m);
    console.error = function () { try { const m0 = [...arguments].map(a => a?.message || String(a)).join(' '); if (!doQA(m0)) ctx.erros.push({ tela: ctx.tela, tipo: 'console.error', msg: m0.substring(0, 400) }); } catch (_) {} return _orig.cerr.apply(console, arguments); };
    ctx.onErr = e => doQA(String(e.message || e.error?.message || '')) ? null : ctx.erros.push({ tela: ctx.tela, tipo: 'erro JS', msg: String(e.message || e.error?.message || e).substring(0, 400), onde: e.filename ? (e.filename.split('/').pop() + ':' + e.lineno) : '' });
    ctx.onRej = e => doQA(String(e.reason?.message || e.reason || '')) ? null : ctx.erros.push({ tela: ctx.tela, tipo: 'promessa rejeitada', msg: String(e.reason?.message || e.reason).substring(0, 400) });
    window.addEventListener('error', ctx.onErr); window.addEventListener('unhandledrejection', ctx.onRej);
  }
  function restaurar(ctx) {
    if (_orig.fetch) window.fetch = _orig.fetch; if (_orig.alert) window.alert = _orig.alert; if (_orig.confirm) window.confirm = _orig.confirm;
    if (_orig.prompt) window.prompt = _orig.prompt; if (_orig.open) window.open = _orig.open; if (_orig.cerr) console.error = _orig.cerr;
    window.removeEventListener('error', ctx.onErr); window.removeEventListener('unhandledrejection', ctx.onRej);
    document.removeEventListener('click', ctx.onClick, true); window.removeEventListener('beforeunload', ctx.onUnload);
  }
  async function aguardarRede(ctx, maxMs) {
    const t0 = Date.now(); let quieto = 0;
    // v3.22: só conta o que ESTA tela pediu. Antes, uma consulta lenta de outra tela (ou o
    // auto-refresh de 30s) deixava todas as telas seguintes como "ainda carregando" sem evidência.
    const daTela = () => [...(ctx.emVoo || [])].filter(r => r.tela === ctx.tela).length;
    while (Date.now() - t0 < maxMs) { await sleep(200); if (daTela() === 0) { quieto += 200; if (quieto >= 700) return true; } else quieto = 0; if (S.parar) return false; }
    return false;
  }

  // ── Inventário de telas ────────────────────────────────────────────────
  function inventario() {
    const paginas = [...document.querySelectorAll('.page')].map(p => p.id.replace(/^page-/, '')).filter(id => id && id !== 'qa' && id !== 's3dash'); // s3dash = atalho para s3realizado
    const menu = {}; document.querySelectorAll('.sbi[onclick]').forEach(el => { const m = el.getAttribute('onclick').match(/nav\('([^']+)'/); if (m && !menu[m[1]]) menu[m[1]] = { el, rotulo: el.textContent.replace(/\s+/g, ' ').trim() }; });
    const ganchos = {}; try { const src = String(window.nav); const re = /p===\s*'([^']+)'\s*\)\s*(?:\{[^}]*?)?(?:setTimeout\(\s*(?:\(\)\s*=>\s*\{?\s*(?:try\{)?)?([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\()/g; let m; while ((m = re.exec(src))) { const f = m[2] || m[3]; if (f && !['nav', 'if', 'try'].includes(f)) (ganchos[m[1]] = ganchos[m[1]] || []).push(f); } } catch (_) {}
    return paginas.map(id => ({ id, rotulo: menu[id]?.rotulo || id, el: menu[id]?.el || null, noMenu: !!menu[id], ganchos: [...new Set(ganchos[id] || [])] }));
  }

  // ── Análises da tela ───────────────────────────────────────────────────
  const visivel = el => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const rotuloEl = el => (el.innerText || el.value || el.getAttribute('title') || el.getAttribute('placeholder') || el.id || el.tagName).replace(/\s+/g, ' ').trim().substring(0, 60);
  function lum(c) { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(',').map(x => parseFloat(x)); return { r, g, b, a }; }
  const rel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = c => 0.2126 * rel(c.r) + 0.7152 * rel(c.g) + 0.0722 * rel(c.b);
  function fundo(el) { let e = el; while (e && e !== document.documentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; const c = lum(cs.backgroundColor); if (c && c.a > 0.9) return c; e = e.parentElement; } return lum(getComputedStyle(document.body).backgroundColor); }
  function contraste(page) {
    const baixos = []; let n = 0;
    for (const el of page.querySelectorAll('div,span,td,th,label,a,button,b,strong,p,h1,h2,h3,li')) {
      if (n > 500) break; if (!el.childNodes.length || ![...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim().length > 1)) continue; if (!visivel(el)) continue; n++;
      const cs = getComputedStyle(el); const fg = lum(cs.color), bg = fundo(el); if (!fg || !bg) continue;
      const l1 = L(fg), l2 = L(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const grande = parseFloat(cs.fontSize) >= 18 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
      if (ratio < (grande ? 3 : 4.5) * (fg.a < 1 ? 0.8 : 1) && ratio < 3.2) baixos.push({ texto: el.textContent.trim().substring(0, 40), ratio: +ratio.toFixed(2), cor: cs.color });
    }
    return baixos;
  }
  // v3.19 — POSICIONAMENTO. O QA antigo só media elementos DENTRO da tela, relativo à própria tela;
  // se a tela inteira estava fora do lugar (fora da área de conteúdo, por cima do topo, deslocada),
  // tudo "batia" por dentro e nada era acusado. Agora a tela é medida contra o menu, o topo e a janela.
  function posicoes(win, doc, page, t, sufixo) {
    const out = [], suf = sufixo || '';
    const add = (sev, titulo, evidencia, sugestao) => out.push({ sev, cat: 'posicionamento', titulo: titulo + suf, evidencia: String(evidencia || '').substring(0, 400), sugestao, tela: t.id, rotulo: t.rotulo });
    const cs = e => win.getComputedStyle(e);
    const vis = e => { if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const c = cs(e); return c.visibility !== 'hidden' && c.display !== 'none'; };
    const nome = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '')) + ' "' + (e.innerText || '').replace(/\s+/g, ' ').trim().substring(0, 28) + '"';
    const main = doc.querySelector('.main'), cnt = doc.querySelector('.cnt'), top = doc.querySelector('.topbar');
    const pr = page.getBoundingClientRect();
    if (cnt && !cnt.contains(page)) add('alta', 'Tela fora da área de conteúdo', `page-${t.id} está em <${page.parentElement?.tagName.toLowerCase()}> e não dentro de .cnt`, 'A div da página foi declarada depois de </main> — mover o bloco para dentro de <div class="cnt">.');
    else {
      const mr = main ? main.getBoundingClientRect() : null, tr = top ? top.getBoundingClientRect() : null;
      if (mr && pr.left < mr.left - 2) add('alta', 'Tela deslocada para trás do menu lateral', `tela começa em x=${Math.round(pr.left)}px, conteúdo em x=${Math.round(mr.left)}px`, 'Conferir margin/position da página.');
      if (tr && pr.top < tr.bottom - 2 && win.scrollY < 5) add('alta', 'Tela por cima da barra do topo', `tela começa em y=${Math.round(pr.top)}px, topo termina em y=${Math.round(tr.bottom)}px`, 'Conferir position/margin negativa da página.');
    }
    const dw = doc.documentElement.scrollWidth, ww = win.innerWidth;
    if (dw > ww + 3) add('média', 'A página inteira ganha rolagem horizontal', `conteúdo ${dw}px numa janela de ${ww}px`, 'Algum bloco largo (kanban, matriz, grid com minmax) está esticando o layout — ele deve rolar dentro do próprio contêiner (overflow-x:auto + min-width:0 no pai flex).');
    const rolavel = e => { let x = e.parentElement; while (x && x !== page) { if (/(auto|scroll|hidden)/.test(cs(x).overflowX)) return true; x = x.parentElement; } return false; };
    const est = []; for (const e of page.querySelectorAll('*')) { if (est.length > 5) break; if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.right > pr.right + 4 && !rolavel(e) && (!e.parentElement || e.parentElement.getBoundingClientRect().right <= pr.right + 4)) est.push(nome(e) + ` +${Math.round(r.right - pr.right)}px`); }
    if (est.length) add('média', 'Elementos saindo pela borda direita da tela', est.join(' | '), 'Largura fixa grande demais para a janela — usar minmax/auto-fit ou envolver em overflow-x:auto.');
    const sob = [];
    for (const c of page.querySelectorAll('*')) { if (sob.length > 3) break; const d = cs(c).display; if (!/flex|grid/.test(d) || !vis(c)) continue;
      const f = [...c.children].filter(e => vis(e) && !/absolute|fixed/.test(cs(e).position));
      for (let i = 0; i < f.length && sob.length < 4; i++) for (let j = i + 1; j < f.length; j++) { const a = f[i].getBoundingClientRect(), b = f[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) { sob.push(nome(f[i]) + ' × ' + nome(f[j])); break; } } }
    if (sob.length) add('média', 'Blocos sobrepostos', sob.join(' | '), 'Revisar grid/flex do contêiner (larguras fixas, margens negativas, falta de flex-wrap).');
    const kp = [...page.querySelectorAll('.kpi')].filter(vis).filter(k => k.getBoundingClientRect().width < 115).map(k => nome(k) + ' ' + Math.round(k.getBoundingClientRect().width) + 'px');
    if (kp.length) add('baixa', 'Indicadores espremidos', kp.slice(0, 5).join(' | '), 'Usar grid-template-columns:repeat(auto-fit,minmax(150px,1fr)) nessa grade.');
    return out;
  }
  // Mede as telas em larguras menores dentro de um iframe do próprio sistema (?qa_frame=1 = modo só-leitura)
  async function varrerLarguras(telas, larguras, ctx) {
    const achados = [];
    for (const W of larguras) {
      if (S.parar) break;
      const fr = document.createElement('iframe');
      fr.style.cssText = `position:fixed;left:-${W + 200}px;top:0;width:${W}px;height:768px;border:0;visibility:hidden;`;
      fr.src = location.pathname + '?qa_frame=1';
      document.body.appendChild(fr);
      try {
        await new Promise((ok, erro) => { fr.onload = ok; setTimeout(() => erro(new Error('iframe não carregou')), 20000); });
        await sleep(1500);
        const iw = fr.contentWindow, idoc = fr.contentDocument;
        for (let i = 0; i < telas.length; i++) {
          if (S.parar) break; const t = telas[i];
          progresso(i, telas.length, `${t.rotulo} (largura ${W}px)`);
          try { iw.nav(t.id); } catch (_) { continue; }
          await sleep(650);
          const pg = idoc.getElementById('page-' + t.id);
          if (pg && pg.classList.contains('active')) achados.push(...posicoes(iw, idoc, pg, t, ` (em ${W}px)`));
        }
      } catch (e) { achados.push({ sev: 'info', cat: 'posicionamento', titulo: `Teste em ${W}px não rodou`, evidencia: e.message, sugestao: '', tela: 'qa', rotulo: 'QA' }); }
      finally { fr.remove(); }
    }
    return achados;
  }
  function analisarTela(page, t, ctx) {
    const achados = [];
    const add = (sev, cat, titulo, evidencia, sugestao) => achados.push({ sev, cat, titulo, evidencia: String(evidencia || '').substring(0, 400), sugestao, tela: t.id, rotulo: t.rotulo });
    posicoes(window, document, page, t, '').forEach(x => achados.push(x));
    const txt = page.innerText || '';
    if (txt.replace(/\s+/g, '').length < 30) add('média', 'conteúdo', 'Tela vazia ou sem conteúdo após carregar', `innerText com ${txt.trim().length} caracteres`, 'Verificar se a tela carrega dados ao abrir (gancho no nav) e se mostra estado vazio explicativo.');
    // textos quebrados
    const ruins = []; const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT); let nd;
    while ((nd = walker.nextNode()) && ruins.length < 12) { const s = nd.textContent; if (TOKENS_RUINS.test(s) && nd.parentElement && visivel(nd.parentElement) && !/^(SCRIPT|STYLE|TEXTAREA)$/.test(nd.parentElement.tagName)) ruins.push(s.trim().substring(0, 80)); }
    if (ruins.length) add('média', 'dados', 'Valores quebrados na tela (undefined/NaN/[object Object]/Invalid Date)', ruins.join(' | '), 'Tratar campos ausentes antes de exibir (fallback "—") e corrigir o nome do campo lido da API.');
    const presos = [...page.querySelectorAll('div,span,td')].filter(el => el.children.length === 0 && CARREGANDO.test(el.textContent) && el.textContent.length < 120 && visivel(el)).slice(0, 5);
    if (presos.length) add('média', 'carregamento', 'Indicador de carregamento continua na tela após a espera', presos.map(p => p.textContent.trim().substring(0, 60)).join(' | '), 'A carga não terminou ou falhou sem trocar a mensagem — tratar erro e timeout, mostrando o motivo.');
    // layout
    if (page.scrollWidth > page.clientWidth + 6) add('média', 'layout', 'Tela com rolagem horizontal (conteúdo mais largo que a área)', `largura do conteúdo ${page.scrollWidth}px > área ${page.clientWidth}px`, 'Ajustar grids/tabelas: usar minmax, quebra de linha ou contêiner com overflow-x:auto.');
    const cortados = [];
    for (const panel of page.querySelectorAll('.panel')) { if (!visivel(panel)) continue; const pr = panel.getBoundingClientRect();
      for (const el of panel.querySelectorAll('button,input,select,textarea,table,.kpi')) { if (!visivel(el)) continue; const r = el.getBoundingClientRect();
        if (r.right > pr.right + 4 && !el.closest('.tw,[style*="overflow-x:auto"],[style*="overflow-x: auto"],[style*="overflow:auto"],[style*="overflow-y:auto"]')) { cortados.push(rotuloEl(el)); if (cortados.length > 6) break; } } }
    if (cortados.length) add('média', 'layout', 'Elementos cortados na borda direita do painel', cortados.join(' | '), 'O painel tem overflow:hidden; envolver o conteúdo largo em contêiner com overflow-x:auto ou quebrar a linha.');
    const bts = [...page.querySelectorAll('button,.btn')].filter(visivel).slice(0, 220);
    const sobre = [];
    for (let i = 0; i < bts.length && sobre.length < 5; i++) { const a = bts[i].getBoundingClientRect(); for (let j = i + 1; j < bts.length; j++) { if (bts[i].contains(bts[j]) || bts[j].contains(bts[i])) continue; const b = bts[j].getBoundingClientRect();
      const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)), iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ix * iy > 0.25 * Math.min(a.width * a.height, b.width * b.height)) { sobre.push(rotuloEl(bts[i]) + ' × ' + rotuloEl(bts[j])); break; } } }
    if (sobre.length) add('média', 'layout', 'Botões sobrepostos', sobre.join(' | '), 'Revisar posicionamento (position absolute/negative margins) e flex-wrap do grupo de botões.');
    const trunc = bts.filter(b => b.scrollWidth > b.clientWidth + 3 && getComputedStyle(b).overflow !== 'visible').slice(0, 6).map(rotuloEl);
    if (trunc.length) add('baixa', 'layout', 'Texto de botão cortado', trunc.join(' | '), 'Aumentar largura mínima ou permitir quebra de linha no botão.');
    const miudos = [...page.querySelectorAll('span,div,td,label,button')].filter(el => el.childNodes.length && [...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim()) && visivel(el) && parseFloat(getComputedStyle(el).fontSize) < 8.5).length;
    if (miudos > 5) add('baixa', 'legibilidade', `${miudos} textos com fonte menor que 8,5px`, '', 'Subir para no mínimo 9px (rótulos) e 10–11px (conteúdo).');
    const imgs = [...page.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => i.getAttribute('src').substring(0, 80));
    if (imgs.length) add('média', 'imagens', 'Imagens quebradas', imgs.slice(0, 5).join(' | '), 'Corrigir a URL ou usar imagem permanente (/api/media).');
    const semRot = [...page.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(visivel).filter(i => !i.getAttribute('placeholder') && !i.getAttribute('title') && !(i.id && document.querySelector(`label[for="${i.id}"]`)) && !(i.closest('.fg')?.querySelector('.fl'))).length;
    if (semRot > 2) add('baixa', 'usabilidade', `${semRot} campos sem rótulo nem dica`, '', 'Adicionar label (.fl) ou placeholder explicando o campo.');
    // tabelas (telas de consulta)
    [...page.querySelectorAll('table')].filter(visivel).slice(0, 8).forEach((tb, k) => {
      const linhas = [...tb.querySelectorAll('tbody tr')]; if (!linhas.length) return;
      const textos = linhas.map(r => r.innerText.replace(/\s+/g, ' ').trim()); const dup = textos.length - new Set(textos).size;
      if (dup > 0 && textos.length > 2) add('média', 'dados', `Tabela ${k + 1}: ${dup} linha(s) repetida(s)`, textos.find((x, i) => textos.indexOf(x) !== i)?.substring(0, 160), 'Verificar duplicidade na consulta (JOIN/merge) ou chave de deduplicação.');
      const cols = linhas[0].children.length; for (let c = 0; c < cols; c++) { const vals = linhas.map(r => (r.children[c]?.innerText || '').trim()); if (linhas.length >= 3 && vals.every(v => !v || v === '—' || v === '-')) { const th = tb.querySelectorAll('thead th')[c]?.innerText || ('coluna ' + (c + 1)); add('baixa', 'dados', `Tabela ${k + 1}: coluna "${th.trim()}" sempre vazia`, `${linhas.length} linhas`, 'Conferir o campo lido da API para essa coluna.'); } }
    });
    return achados;
  }

  // ── Ações: botões de consulta e formulários ────────────────────────────
  function valorTeste(el) {
    const t = (el.type || '').toLowerCase();
    if (el.tagName === 'SELECT') return el.options.length > 1 ? el.options[1].value : el.value;
    if (t === 'number') return '123';
    if (t === 'date') return new Date().toISOString().substring(0, 10);
    if (t === 'month') return new Date().toISOString().substring(0, 7);
    if (t === 'email' || /email/i.test(el.id + el.name + el.placeholder)) return 'qa@teste.com.br';
    if (t === 'tel' || /telefone|whats|celular/i.test(el.id + el.placeholder)) return '21999990000';
    if (/valor|preco|preço|r\$/i.test(el.id + el.placeholder)) return '123,45';
    return MARCA + ' ' + (el.id || el.name || 'campo');
  }
  const disparar = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  async function testarBotoes(page, t, ctx, opts) {
    const achados = []; const add = (sev, cat, titulo, evidencia, sugestao) => achados.push({ sev, cat, titulo, evidencia: String(evidencia || '').substring(0, 500), sugestao, tela: t.id, rotulo: t.rotulo });
    const bts = [...page.querySelectorAll('button')].filter(b => visivel(b) && !b.closest('a[href]'));
    // 1. botões de consulta
    if (opts.botoes) {
      const leitura = bts.filter(b => BOT_LEITURA.test(b.innerText) && !BOT_ARRISCADO.test(b.innerText) && !b.disabled).slice(0, 4);
      for (const b of leitura) {
        if (S.parar) break; ctx.fase = 'botão: ' + rotuloEl(b); const antesErr = ctx.erros.length, antesReq = ctx.requisicoes.length;
        try { b.click(); } catch (e) { ctx.erros.push({ tela: t.id, tipo: 'erro JS', msg: 'clique em "' + rotuloEl(b) + '": ' + e.message }); }
        await aguardarRede(ctx, opts.espera);
        if (ctx.erros.length > antesErr) add('alta', 'ação', `Botão "${rotuloEl(b)}" gerou erro`, ctx.erros.slice(antesErr).map(e => e.msg).join(' | '), 'Corrigir o erro na função do onclick deste botão.');
        const falhas = ctx.requisicoes.slice(antesReq).filter(r => r.erro && !r.bloqueado);
        if (falhas.length) add('alta', 'ação', `Botão "${rotuloEl(b)}" chamou a API e recebeu erro`, falhas.map(f => `${f.rota}${f.action ? ' · ' + f.action : ''}: ${f.erro}`).join(' | '), 'Ver a ação no arquivo da API indicado.');
      }
      ctx.fase = 'análise';
    }
    // 2. formulários de inclusão/alteração (modo seguro: a gravação é interceptada)
    if (opts.formularios) {
      const salvar = bts.filter(b => BOT_FORM.test(b.innerText) && !/excluir|apagar|remover/i.test(b.innerText) && !b.disabled).slice(0, 3);
      for (const b of salvar) {
        if (S.parar || !b.isConnected) break;
        const cont = b.closest('[id$="Modal"],.panel,.pb,form') || page;
        const campos = [...cont.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(visivel).slice(0, 25);
        if (!campos.length) continue;
        const orig = campos.map(c => c.value); const rot = rotuloEl(b);
        const tentar = async (fase) => { ctx.fase = fase + ': ' + rot; ctx.confirmou = false; const antes = ctx.requisicoes.length, antesErr = ctx.erros.length, antesDlg = ctx.dialogos.length, html0 = cont.innerHTML.length;
          try { b.click(); } catch (e) { ctx.erros.push({ tela: t.id, tipo: 'erro JS', msg: 'clique em "' + rot + '": ' + e.message }); }
          await aguardarRede(ctx, Math.min(opts.espera, 4000));
          return { reqs: ctx.requisicoes.slice(antes), erros: ctx.erros.slice(antesErr), dlg: ctx.dialogos.slice(antesDlg), mudou: Math.abs(cont.innerHTML.length - html0) > 20, confirmou: ctx.confirmou }; };
        try {
          // a) vazio: deve validar e NÃO enviar
          campos.forEach(c => { if (c.tagName !== 'SELECT') { c.value = ''; disparar(c); } });
          const v = await tentar('formulário vazio');
          const envVazio = v.reqs.filter(r => r.bloqueado);
          if (envVazio.length) add('média', 'validação', `Formulário "${rot}" tenta gravar com campos vazios`, envVazio.map(r => `${r.rota} · ${r.action}: ${r.payload}`).join(' | '), 'Validar campos obrigatórios antes de chamar a API e mostrar qual campo falta.');
          if (v.erros.length) add('alta', 'ação', `Formulário "${rot}" gera erro de JavaScript quando vazio`, v.erros.map(e => e.msg).join(' | '), 'Tratar valores vazios na função de salvar.');
          // b) preenchido: deve montar a chamada com os dados digitados
          if (b.isConnected) {
            campos.forEach(c => { try { c.value = valorTeste(c); disparar(c); } catch (_) {} });
            const p = await tentar('formulário preenchido');
            const env = p.reqs.filter(r => r.bloqueado);
            if (p.erros.length) add('alta', 'ação', `Formulário "${rot}" gera erro de JavaScript ao salvar`, p.erros.map(e => e.msg).join(' | '), 'Corrigir a função de salvar.');
            if (env.length && !env.some(r => (r.payload || '').includes(MARCA) || (r.payload || '').includes('123'))) add('média', 'formulário', `Formulário "${rot}" chama a API sem os dados digitados`, env.map(r => `${r.rota} · ${r.action}: ${r.payload}`).join(' | '), 'Conferir os ids dos campos lidos pela função de salvar.');
            if (!env.length && !p.reqs.length && !p.dlg.length && !p.mudou && !p.confirmou && !p.erros.length) add('baixa', 'formulário', `Botão "${rot}" não teve efeito visível com o formulário preenchido`, `${campos.length} campo(s) preenchidos`, 'Verificar se o botão está ligado à função certa ou se falta mensagem de retorno.');
            if (env.length) ctx.formsOk.push({ tela: t.id, botao: rot, chamadas: env.map(r => `${r.rota} · ${r.action}`).join(', ') });
            const alerta = p.dlg.find(d => /erro|falh|inválid|invalid/i.test(d.msg) && !/bloquead/i.test(d.msg)); if (alerta) add('média', 'formulário', `Formulário "${rot}" mostrou aviso de erro`, alerta.msg, 'Ver a validação/erro exibido.');
          }
        } finally { campos.forEach((c, i) => { try { if (c.isConnected) { c.value = orig[i]; disparar(c); } } catch (_) {} }); }
      }
      ctx.fase = 'análise';
    }
    return achados;
  }
  function fecharModais() {
    document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && +cs.zIndex >= 1000 && cs.display !== 'none' && !/toast|qaFlut/i.test(d.id + d.className)) d.style.display = 'none'; });
    ['ideiaModal', 'nfMailModal', 'fatRastroModal'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  }

  // ── Varredura ──────────────────────────────────────────────────────────
  async function varrer(opts) {
    try { await _varrer(opts); } catch (e) { S.rodando = false; S.erro = 'A varredura parou com erro: ' + e.message; try { window.nav('qa', document.querySelector('.sbi[onclick*="\'qa\'"]')); } catch (_) {} render(); }
  }
  async function _varrer(opts) {
    if (S.rodando) return; S.rodando = true; S.parar = false; S.erro = null; S.avisoSalvar = null;
    const telas = inventario().filter(t => !opts.filtro || t.id.includes(opts.filtro) || t.rotulo.toLowerCase().includes(opts.filtro.toLowerCase()));
    const ctx = { tela: null, fase: '', requisicoes: [], erros: [], dialogos: [], formsOk: [], pendentes: 0 };
    const lsAntes = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); lsAntes[k] = localStorage.getItem(k); } } catch (_) {}
    const temaAntes = document.documentElement.getAttribute('data-theme');
    const inicio = Date.now(); const porTela = []; let achados = [];
    flutuante(true);
    instrumentar(ctx);
    try {
      for (let i = 0; i < telas.length; i++) {
        if (S.parar) break;
        const t = telas[i]; ctx.tela = t.id; ctx.fase = 'abrindo'; progresso(i, telas.length, t.rotulo);
        fecharModais(); const e0 = ctx.erros.length, r0 = ctx.requisicoes.length, t0 = Date.now();
        try { window.nav(t.id, t.el); } catch (e) { ctx.erros.push({ tela: t.id, tipo: 'erro JS', msg: 'nav: ' + e.message }); }
        const terminou = await aguardarRede(ctx, opts.espera);
        const page = document.getElementById('page-' + t.id);
        let a = [];
        if (page && page.classList.contains('active')) {
          ctx.fase = 'análise'; a = analisarTela(page, t, ctx);
          if (opts.contraste) { const baixo = contraste(page); if (baixo.length > 3) a.push({ sev: 'baixa', cat: 'contraste', titulo: `${baixo.length} textos com contraste possivelmente insuficiente (estimativa) (tema ${document.documentElement.getAttribute('data-theme') || 'dark'})`, evidencia: baixo.slice(0, 6).map(b => `"${b.texto}" ${b.ratio}:1 ${b.cor}`).join(' | '), sugestao: 'Usar as variáveis de cor do tema (var(--t1)/var(--t2)) em vez de cores fixas; mínimo 4,5:1.', tela: t.id, rotulo: t.rotulo });
            if (opts.doisTemas) { const outro = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', outro); await sleep(80);
              const b2 = contraste(page); if (b2.length > 3) a.push({ sev: 'baixa', cat: 'contraste', titulo: `${b2.length} textos com contraste possivelmente insuficiente (estimativa) (tema ${outro})`, evidencia: b2.slice(0, 6).map(b => `"${b.texto}" ${b.ratio}:1 ${b.cor}`).join(' | '), sugestao: 'Trocar cor fixa por variável do tema.', tela: t.id, rotulo: t.rotulo });
              document.documentElement.setAttribute('data-theme', temaAntes || 'dark'); } }
          a = a.concat(await testarBotoes(page, t, ctx, opts));
        } else if (document.querySelector('.page.active') && document.querySelector('.page.active').id !== 'page-' + t.id) a.push({ sev: 'info', cat: 'navegação', titulo: 'A tela redireciona para outra ao abrir', evidencia: 'page-' + t.id + ' → ' + document.querySelector('.page.active').id, sugestao: 'Se o redirecionamento é intencional, nada a fazer; senão, conferir o nav.', tela: t.id, rotulo: t.rotulo });
        else a.push({ sev: 'alta', cat: 'navegação', titulo: 'A tela não abriu pelo menu', evidencia: 'nav("' + t.id + '") não ativou page-' + t.id, sugestao: 'Conferir o id da página e o item de menu.', tela: t.id, rotulo: t.rotulo });
        if (!t.noMenu) a.push({ sev: 'info', cat: 'navegação', titulo: 'Tela sem item de menu (inacessível ao usuário)', evidencia: 'page-' + t.id, sugestao: 'Adicionar ao menu ou remover a tela órfã.', tela: t.id, rotulo: t.rotulo });
        const reqs = ctx.requisicoes.slice(r0).filter(r => !r.tela || r.tela === t.id), errs = ctx.erros.slice(e0);
        errs.forEach(e => a.push({ sev: 'alta', cat: 'erro JS', titulo: `${e.tipo} ao abrir/usar a tela`, evidencia: e.msg + (e.onde ? ' @ ' + e.onde : ''), sugestao: 'Corrigir a exceção (ver função da tela).', tela: t.id, rotulo: t.rotulo }));
        reqs.filter(r => !r.bloqueado && (r.status >= 500 || r.status === 0)).forEach(r => a.push({ sev: 'alta', cat: 'API', titulo: `API falhou (HTTP ${r.status})`, evidencia: `${r.rota}${r.action ? ' · ' + r.action : ''} — ${r.erro || ''}`, sugestao: 'Ver logs da função na Vercel e tratar o erro no servidor.', tela: t.id, rotulo: t.rotulo, api: r.rota, action: r.action }));
        reqs.filter(r => !r.bloqueado && r.status < 500 && r.status > 0 && r.erro).forEach(r => a.push({ sev: r.status >= 400 ? 'alta' : 'média', cat: 'API', titulo: 'API respondeu com erro', evidencia: `${r.rota}${r.action ? ' · ' + r.action : ''} (HTTP ${r.status}) — ${r.erro}`, sugestao: 'Corrigir a ação no servidor ou exibir o motivo ao usuário.', tela: t.id, rotulo: t.rotulo, api: r.rota, action: r.action }));
        reqs.filter(r => !r.bloqueado && r.ms > 8000 && !/claude|gerente_|s2-creative|chat|analise|debate/i.test((r.rota || '') + ' ' + (r.action || ''))).forEach(r => a.push({ sev: 'média', cat: 'desempenho', titulo: `API lenta (${(r.ms / 1000).toFixed(1)}s)`, evidencia: `${r.rota}${r.action ? ' · ' + r.action : ''}`, sugestao: 'Cachear, paralelizar ou paginar a consulta.', tela: t.id, rotulo: t.rotulo, api: r.rota, action: r.action }));
        if (!terminou && !S.parar) a.push({ sev: 'média', cat: 'desempenho', titulo: `Tela ainda carregando após ${Math.round(opts.espera / 1000)}s`, evidencia: [...(ctx.emVoo || [])].filter(r => r.tela === t.id).map(r => r.rota + (r.action ? ' · ' + r.action : '') + ' (' + Math.round((Date.now() - r.inicio) / 1000) + 's)').join(' | ') || reqs.filter(r => r.status == null).map(r => r.rota + ' ' + (r.action || '')).join(', '), sugestao: 'Reduzir o tempo de carga inicial.', tela: t.id, rotulo: t.rotulo });
        ctx.dialogos.filter(d => d.tela === t.id && d.tipo === 'alert' && /erro|falh/i.test(d.msg) && !/bloquead/i.test(d.msg)).forEach(d => a.push({ sev: 'média', cat: 'mensagem', titulo: 'Alerta de erro exibido', evidencia: d.msg, sugestao: 'Ver a causa do erro.', tela: t.id, rotulo: t.rotulo }));
        a.forEach(x => { x.ganchos = t.ganchos; });
        achados = achados.concat(a);
        porTela.push({ id: t.id, rotulo: t.rotulo, ms: Date.now() - t0, requisicoes: reqs.length, bloqueadas: reqs.filter(r => r.bloqueado).length, achados: a.filter(x => x.sev !== 'info').length });
        try { sessionStorage.setItem('qa_parcial', JSON.stringify({ em: Date.now(), ultima: t.rotulo, feitas: i + 1, total: telas.length, achados: achados.slice(-400), porTela })); } catch (_) {}
      }
      if (opts.larguras && !S.parar) {
        const larg = [1024, 1366].filter(w => w < window.innerWidth - 40);
        if (larg.length) { ctx.tela = 'larguras'; const al = await varrerLarguras(telas, larg, ctx); achados = achados.concat(al); }
      }
    } finally {
      restaurar(ctx); fecharModais(); flutuante(false);
      try { const agora = []; for (let i = 0; i < localStorage.length; i++) agora.push(localStorage.key(i)); agora.forEach(k => { if (!(k in lsAntes)) localStorage.removeItem(k); }); Object.entries(lsAntes).forEach(([k, v]) => { if (localStorage.getItem(k) !== v) localStorage.setItem(k, v); }); } catch (_) {}
      if (temaAntes) document.documentElement.setAttribute('data-theme', temaAntes);
      S.rodando = false;
      try { window.nav('qa', document.querySelector('.sbi[onclick*="\'qa\'"]')); } catch (_) {}
    }
    try { sessionStorage.removeItem('qa_parcial'); } catch (_) {}
    montarRelatorio(achados, porTela, ctx, opts, inicio);
    try { await api('salvar_execucao', { tipo: 'qa', relatorio: { ...S.relatorio, bloqueadas: S.relatorio.bloqueadas.slice(0, 300), achados: S.relatorio.achados.slice(0, 600) } }); } catch (e) { S.avisoSalvar = 'O relatório não foi salvo no histórico: ' + e.message; }
    render(); QA.historico();
  }
  function montarRelatorio(achados, porTela, ctx, opts, inicio, interrompido) {
    const vistos = new Set(); achados = achados.filter(a => { const k = a.tela + '|' + a.titulo + '|' + a.evidencia; if (vistos.has(k)) return false; vistos.add(k); return true; });
    const ordem = { 'crítica': 0, 'alta': 1, 'média': 2, 'baixa': 3, 'info': 4 };
    achados.sort((a, b) => ordem[a.sev] - ordem[b.sev]);
    achados.forEach((a, i) => { a.id = 'QA-' + String(i + 1).padStart(3, '0'); });
    const resumo = achados.reduce((o, a) => { o[a.sev] = (o[a.sev] || 0) + 1; return o; }, {});
    S.relatorio = { tipo: 'qa', versao: document.getElementById('sidebarBuildId')?.textContent || '', inicio: new Date(inicio).toISOString(), duracao_s: Math.round((Date.now() - inicio) / 1000), interrompido: interrompido || S.parar, opcoes: opts || {},
      telas: porTela, total_telas: porTela.length, achados, resumo, formularios_ligados: ctx?.formsOk || [], bloqueadas: (ctx?.requisicoes || []).filter(r => r.bloqueado).map(r => ({ tela: r.tela, rota: r.rota, action: r.action, fase: r.fase })), crud: S.crud, seguranca: S.seg };
  }

  // ── Relatório para o Claude ────────────────────────────────────────────
  function arquivoApi(rota) { const m = String(rota || '').match(/^\/api\/([\w-]+)/); return m ? `api/${m[1]}.js` : null; }
  function markdown() {
    const R = S.relatorio, SEG = S.seg, C = S.crud;
    const linhas = [];
    linhas.push(`# Relatório de correção — Atlantyx OS (${R?.versao || SEG?.versao || ''})`, '');
    linhas.push(`Gerado pelos agentes de QA e Segurança do próprio sistema em ${new Date().toLocaleString('pt-BR')}.`, '');
    linhas.push('## Contexto do projeto', '- Repositório: `Fabiosq13/atlantyx-os` (branch `main`, deploy automático na Vercel).', '- Frontend: arquivo único `public/index.html` (cada tela é `<div class="page" id="page-<id>">`; a navegação é `nav(id)`; funções de carga ligadas no `nav`).', '- Backend: funções serverless em `api/*.js` (ESM), banco Neon Postgres (driver 0.10: use `sql```` ou `_q(db, texto, params)`), bibliotecas em `lib/`.', '- Ao terminar: validar sintaxe (`node --check` nas APIs e nos blocos `<script>` do index.html) e subir a versão `ATX-vX.YY` em `public/index.html`.', '');
    if (R) {
      linhas.push('## Resultado da varredura de telas (QA)', `- Telas analisadas: ${R.total_telas}${R.interrompido ? ' (interrompida)' : ''} · duração ${R.duracao_s}s · modo seguro (gravações interceptadas: ${R.bloqueadas.length}).`, `- Achados: ${Object.entries(R.resumo).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nenhum'}.`, '');
      const grupos = {}; R.achados.filter(a => a.sev !== 'info').forEach(a => { (grupos[a.sev] = grupos[a.sev] || []).push(a); });
      for (const sev of ['crítica', 'alta', 'média', 'baixa']) { if (!grupos[sev]) continue; linhas.push(`### Severidade ${sev} (${grupos[sev].length})`, '');
        grupos[sev].forEach(a => { linhas.push(`**${a.id} · ${a.titulo}** — tela \`${a.tela}\` (${a.rotulo}) · ${a.cat}`);
          linhas.push(`- Evidência: ${a.evidencia || '—'}`);
          const onde = [`\`page-${a.tela}\` em public/index.html`]; if (a.ganchos?.length) onde.push('funções: ' + a.ganchos.map(f => '`' + f + '`').join(', ')); if (a.api) onde.push(`\`${arquivoApi(a.api)}\`${a.action ? ' ação `' + a.action + '`' : ''}`);
          linhas.push(`- Onde olhar: ${onde.join(' · ')}`); linhas.push(`- Correção esperada: ${a.sugestao || '—'}`, ''); }); }
      const info = R.achados.filter(a => a.sev === 'info'); if (info.length) linhas.push(`### Informativos (${info.length})`, info.map(a => `- ${a.titulo}: \`${a.tela}\``).join('\n'), '');
    }
    if (C) {
      linhas.push('## CRUD real (incluir → consultar → alterar → excluir, com limpeza)', `Marca dos registros: \`${C.marca}\` · ${C.ok ? 'todos os ciclos OK' : 'HÁ FALHAS'}${C.sobras?.length ? ' · SOBRAS NO BANCO: ' + C.sobras.join(', ') : ''}`, '');
      C.resultados.forEach(r => { linhas.push(`- **${r.entidade}**: ${r.ok ? 'OK' : 'FALHOU'} — ${r.passos.map(p => `${p.passo} ${p.ok ? '✓' : '✗ ' + (p.erro || '')}`).join(' · ')}`); }); linhas.push('');
    }
    if (SEG) {
      linhas.push('## Varredura de segurança', `- Base: ${SEG.base} · ${Object.entries(SEG.resumo || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}`, '');
      (SEG.achados || []).forEach((a, i) => { linhas.push(`**SEC-${String(i + 1).padStart(3, '0')} · [${a.severidade}] ${a.titulo}** (${a.categoria})`); if (a.arquivo) linhas.push(`- Arquivo: \`${a.arquivo}\`${a.linha ? ' linha ' + a.linha : ''}`); if (a.evidencia) linhas.push(`- Evidência: ${a.evidencia}`); linhas.push(`- Correção: ${a.correcao}`, ''); });
    }
    linhas.push('## Como executar', '1. Corrigir na ordem: crítica → alta → média → baixa. Segurança crítica primeiro (autenticação e credenciais expostas).', '2. Não alterar o que não está listado; manter o comportamento atual das telas que funcionam.', '3. Para cada item, confirmar a causa no código antes de mudar; se um achado for falso positivo, registrar o motivo no PR.', '4. Validar sintaxe, subir a versão e descrever no PR os IDs corrigidos (QA-xxx / SEC-xxx).', '5. Depois do deploy, rodar de novo os agentes de QA e Segurança no sistema para confirmar.');
    return linhas.join('\n');
  }
  const baixar = (nome, conteudo, tipo) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); };

  // ── Interface ──────────────────────────────────────────────────────────
  function flutuante(on) {
    let f = document.getElementById('qaFlut');
    if (!on) { if (f) f.remove(); return; }
    if (!f) { f = document.createElement('div'); f.id = 'qaFlut'; f.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;background:var(--bg2);border:1px solid var(--blue);border-radius:10px;padding:12px 14px;width:320px;box-shadow:0 10px 30px rgba(0,0,0,.35);font-size:11px;color:var(--t1);';
      f.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">🧪 Agente de QA varrendo o sistema</div><div id="qaFlutTxt" style="color:var(--t2);min-height:30px;"></div><div style="background:var(--bg4);height:6px;border-radius:4px;margin:8px 0;overflow:hidden;"><div id="qaFlutBar" style="height:100%;width:0;background:var(--blue);"></div></div><div style="font-size:9.5px;color:var(--t3);margin-bottom:6px;">Modo seguro: gravações e envios são interceptados.</div><button class="btn btn-g" style="font-size:10px;" onclick="QA.parar()">■ Parar</button>';
      document.body.appendChild(f); }
  }
  function progresso(i, n, rot) { const t = document.getElementById('qaFlutTxt'), b = document.getElementById('qaFlutBar'); if (t) t.textContent = `Tela ${i + 1} de ${n}: ${rot}`; if (b) b.style.width = Math.round((i / n) * 100) + '%'; }

  function painelHtml() {
    return `<div style="background:linear-gradient(135deg,rgba(79,124,255,.14),rgba(0,196,204,.06));border:1px solid var(--bd2);border-radius:10px;padding:14px 18px;margin-bottom:12px;">
      <div style="font-size:15px;font-weight:700;">🧪 Agente de QA · 🛡 Agente de Segurança</div>
      <div style="font-size:10.5px;color:var(--t2);margin-top:3px;line-height:1.6;">O QA entra em todas as telas, clica nos botões de consulta, testa os formulários de inclusão/alteração (vazio e preenchido), analisa os resultados das consultas, o layout e o contraste, e registra erros de JavaScript e de API. <b>Modo seguro</b>: gravações, envios, publicações e chamadas de IA são interceptados antes de sair — nada é alterado. O <b>CRUD real</b> roda no servidor em cadastros que podem ser apagados, com limpeza garantida. O de Segurança procura credenciais expostas, APIs sem autenticação, CORS, cabeçalhos e padrões inseguros no código.</div></div>
      <div class="kg k3" style="margin-bottom:12px;">
        <div class="panel" style="margin:0;"><div class="ph"><div class="pt">Varredura de telas</div></div><div class="pb" style="font-size:11px;">
          <label style="display:block;margin-bottom:5px;"><input type="checkbox" id="qaOptBot" checked/> Clicar nos botões de consulta</label>
          <label style="display:block;margin-bottom:5px;"><input type="checkbox" id="qaOptForm" checked/> Testar formulários (vazio e preenchido, sem gravar)</label>
          <label style="display:block;margin-bottom:5px;"><input type="checkbox" id="qaOptCont" checked/> Verificar contraste</label>
          <label style="display:block;margin-bottom:5px;"><input type="checkbox" id="qaOptTemas"/> Contraste nos dois temas</label>
          <label style="display:block;margin-bottom:8px;"><input type="checkbox" id="qaOptLarg" checked/> Posição das telas também em 1024px e 1366px</label>
          <div style="display:flex;gap:6px;margin-bottom:8px;"><input class="fi" id="qaFiltro" placeholder="só telas com... (vazio = todas)" style="flex:1;"/><select class="fsel" id="qaEspera" style="width:110px;"><option value="5000">espera 5s</option><option value="8000">espera 8s</option><option value="12000" selected>espera 12s</option><option value="20000">espera 20s</option></select></div>
          <button class="btn btn-p" style="width:100%;" onclick="QA.iniciar()">▶ Iniciar varredura de telas</button></div></div>
        <div class="panel" style="margin:0;"><div class="ph"><div class="pt">CRUD real com limpeza</div></div><div class="pb" style="font-size:11px;color:var(--t2);line-height:1.6;">
          Inclui, consulta, altera e exclui registros marcados <b>QA-TESTE</b> em: despesas programadas, contratos, lançamentos simulados, business plan, chave-valor e ideias. Confere que alterar não duplica e que excluir remove. No fim, verifica se sobrou algo no banco.
          <button class="btn btn-gn" style="width:100%;margin-top:8px;" id="qaBtnCrud" onclick="QA.crud()">🧪 Rodar CRUD real</button></div></div>
        <div class="panel" style="margin:0;"><div class="ph"><div class="pt">Agente de Segurança</div></div><div class="pb" style="font-size:11px;color:var(--t2);line-height:1.6;">
          Sondas somente-leitura sem credencial (o que um estranho vê?), cabeçalhos do site, variáveis de ambiente (só presença) e análise estática do código do backend e das páginas. Nenhum dado sensível entra no relatório.
          <button class="btn" style="width:100%;margin-top:8px;border-color:var(--red);color:var(--red);" id="qaBtnSeg" onclick="QA.seguranca()">🛡 Rodar varredura de segurança</button></div></div>
      </div>
      <div id="qaResultado"></div>
      <div class="panel"><div class="ph"><div class="pt">Execuções anteriores</div><button class="btn btn-g" style="font-size:9px;padding:3px 8px;" onclick="QA.historico()">↻</button></div><div class="pb" id="qaHist" style="font-size:11px;color:var(--t3);">—</div></div>`;
  }
  function render() {
    const box = document.getElementById('qaResultado'); if (!box) return;
    const R = S.relatorio, SEG = S.seg, C = S.crud;
    let topo = '';
    if (S.erro) topo += `<div class="panel" style="border-left:4px solid var(--red);"><div class="pb" style="color:var(--red);font-size:11.5px;">⚠ ${esc(S.erro)}</div></div>`;
    if (S.avisoSalvar) topo += `<div class="panel" style="border-left:4px solid var(--gold);"><div class="pb" style="color:var(--gold);font-size:11px;">${esc(S.avisoSalvar)}</div></div>`;
    if (S.parcial && !R) topo += `<div class="panel" style="border-left:4px solid var(--gold);"><div class="pb" style="font-size:11.5px;">A última varredura foi <b>interrompida</b> na tela "${esc(S.parcial.ultima)}" (${S.parcial.feitas} de ${S.parcial.total}). <button class="btn btn-g" style="font-size:10px;margin-left:8px;" onclick="QA.usarParcial()">Ver resultados parciais</button></div></div>`;
    if (!R && !SEG && !C) { box.innerHTML = topo + `<div class="panel"><div class="ph"><div class="pt">📋 Relatório de correção para o Claude</div></div><div class="pb" style="font-size:11px;color:var(--t2);">Rode a varredura de telas, o CRUD real ou a varredura de segurança — o relatório detalhado e o botão <b>✅ Aprovar e enviar para correção automática</b> aparecem aqui. Também é possível abrir uma execução anterior no histórico abaixo.</div></div>`; return; }
    const cor = s => ({ 'crítica': 'var(--red)', 'alta': 'var(--red)', 'média': 'var(--gold)', 'baixa': 'var(--blue)', 'info': 'var(--t3)' }[s] || 'var(--t2)');
    let h = '';
    if (R) {
      const r = R.resumo;
      h += `<div class="kg k5" style="margin-bottom:10px;">${['crítica', 'alta', 'média', 'baixa', 'info'].map(s => `<div class="kpi ${s === 'alta' || s === 'crítica' ? 'or' : s === 'média' ? 'gd' : 'bl'}"><div class="kl">${s}</div><div class="kv">${r[s] || 0}</div></div>`).join('')}</div>
      <div class="panel"><div class="ph"><div class="pt">Achados da varredura — ${R.total_telas} telas em ${R.duracao_s}s${R.interrompido ? ' (interrompida)' : ''}</div>
        <select class="fsel" style="width:150px;" onchange="QA._filtro=this.value;QA.render()"><option value="">todas as severidades</option>${['crítica', 'alta', 'média', 'baixa', 'info'].map(s => `<option ${QA._filtro === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="pb" style="max-height:55vh;overflow-y:auto;">${R.achados.filter(a => !QA._filtro || a.sev === QA._filtro).map(a => `<div style="border-left:3px solid ${cor(a.sev)};background:var(--bg4);border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:11px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;"><b>${a.id}</b><span style="color:${cor(a.sev)};font-weight:700;">${a.sev}</span><span style="color:var(--t2);">${esc(a.cat)}</span><span style="margin-left:auto;color:var(--t2);cursor:pointer;text-decoration:underline;" onclick="nav('${esc(a.tela)}',document.querySelector('.sbi[onclick*=&quot;\\'${esc(a.tela)}\\'&quot;]'))">${esc(a.rotulo)}</span></div>
          <div style="font-weight:600;margin:3px 0;">${esc(a.titulo)}</div>${a.evidencia ? `<div style="color:var(--t2);font-family:var(--M);font-size:10px;word-break:break-word;">${esc(a.evidencia)}</div>` : ''}${a.sugestao ? `<div style="color:var(--blue);font-size:10.5px;margin-top:3px;">→ ${esc(a.sugestao)}</div>` : ''}</div>`).join('') || '<div style="color:var(--t3);">Nenhum achado.</div>'}</div></div>
      ${R.formularios_ligados?.length ? `<details class="panel" style="padding:10px 14px;"><summary style="cursor:pointer;font-size:11px;">✓ ${R.formularios_ligados.length} formulário(s) ligados corretamente à API (gravação interceptada)</summary><div style="font-size:10.5px;color:var(--t2);margin-top:6px;">${R.formularios_ligados.map(f => `${esc(f.tela)} · "${esc(f.botao)}" → ${esc(f.chamadas)}`).join('<br>')}</div></details>` : ''}`;
    }
    if (C) h += `<div class="panel"><div class="ph"><div class="pt">CRUD real — ${C.ok ? '<span style="color:var(--green);">todos os ciclos OK</span>' : '<span style="color:var(--red);">há falhas</span>'}</div><span style="font-size:10px;color:var(--t2);">marca ${esc(C.marca)}${C.sobras?.length ? ' · <b style="color:var(--red);">sobras: ' + esc(C.sobras.join(', ')) + '</b>' : ' · nada sobrou no banco'}</span></div><div class="pb">${C.resultados.map(r => `<div style="font-size:11px;padding:5px 0;border-bottom:1px solid var(--bd);"><b style="color:${r.ok ? 'var(--green)' : 'var(--red)'};">${r.ok ? '✓' : '✗'}</b> <b>${esc(r.entidade)}</b> — ${r.passos.map(p => `<span style="color:${p.ok ? 'var(--t2)' : 'var(--red)'};">${esc(p.passo)} ${p.ok ? '✓' : '✗ ' + esc(p.erro || '')}</span>`).join(' · ')}</div>`).join('')}</div></div>`;
    if (SEG) h += `<div class="panel"><div class="ph"><div class="pt">🛡 Segurança — ${Object.entries(SEG.resumo || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nenhum achado'}</div><span style="font-size:10px;color:var(--t2);">código analisado: ${SEG.cobertura_codigo ? Object.entries(SEG.cobertura_codigo).map(([k, v]) => `${k} ${v}`).join(', ') : '—'}</span></div><div class="pb" style="max-height:50vh;overflow-y:auto;">${(SEG.achados || []).map((a, i) => `<div style="border-left:3px solid ${cor(a.severidade)};background:var(--bg4);border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:11px;">
      <div><b>SEC-${String(i + 1).padStart(3, '0')}</b> <span style="color:${cor(a.severidade)};font-weight:700;">${a.severidade}</span> <span style="color:var(--t2);">${esc(a.categoria)}</span> ${a.arquivo ? `<span style="color:var(--t2);font-family:var(--M);font-size:10px;">${esc(a.arquivo)}${a.linha ? ':' + a.linha : ''}</span>` : ''}</div>
      <div style="font-weight:600;margin:3px 0;">${esc(a.titulo)}</div>${a.evidencia ? `<div style="color:var(--t2);font-family:var(--M);font-size:10px;word-break:break-word;">${esc(a.evidencia)}</div>` : ''}<div style="color:var(--blue);font-size:10.5px;margin-top:3px;">→ ${esc(a.correcao)}</div></div>`).join('')}</div></div>`;
    h += `<div class="panel"><div class="ph"><div class="pt">📋 Relatório de correção para o Claude</div></div><div class="pb">
      <textarea class="fta" id="qaMd" style="min-height:200px;font-family:var(--M);font-size:10.5px;">${esc(markdown())}</textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
        <button class="btn btn-g" onclick="navigator.clipboard.writeText(document.getElementById('qaMd').value);toast('Relatório copiado — cole no chat do Claude','success')">📋 Copiar</button>
        <button class="btn btn-g" onclick="QA.baixarMd()">⬇ Baixar .md</button>
        <button class="btn btn-g" onclick="QA.baixarJson()">⬇ Baixar .json</button>
        <button class="btn btn-p" style="margin-left:auto;" onclick="QA.aprovar()">✅ Aprovar e enviar para correção automática</button></div>
      <div style="font-size:10px;color:var(--t3);margin-top:6px;line-height:1.5;">Aprovar abre uma tarefa no GitHub para o Claude. Ele corrige numa branch e abre um pull request; a nova versão só vai ao ar quando você aprovar (merge) o pull request. Alternativa: copie o relatório e cole no chat do Claude.</div>
      <div id="qaAprovMsg" style="font-size:11px;margin-top:6px;"></div></div></div>`;
    box.innerHTML = topo + h;
  }

  window.QA = {
    _classificar: (u, i) => classificar(u, i),
    _filtro: '',
    abrir() { const p = document.getElementById('qaApp'); if (p && !p.dataset.ok) { p.innerHTML = painelHtml(); p.dataset.ok = '1'; this.historico(true); }
      try { const pc = JSON.parse(sessionStorage.getItem('qa_parcial') || 'null'); if (pc && !S.rodando) S.parcial = pc; } catch (_) {}
      render(); },
    usarParcial() { const pc = S.parcial; if (!pc) return; montarRelatorio(pc.achados || [], pc.porTela || [], null, null, pc.em - 1000, true); S.parcial = null; try { sessionStorage.removeItem('qa_parcial'); } catch (_) {} render(); },
    render,
    iniciar() {
      if (!confirm('Iniciar a varredura de todas as telas?\n\nO sistema vai navegar sozinho por alguns minutos. Gravações, envios e chamadas de IA ficam bloqueados (modo seguro). Não use o sistema durante a varredura.')) return;
      const opts = { botoes: document.getElementById('qaOptBot').checked, formularios: document.getElementById('qaOptForm').checked, contraste: document.getElementById('qaOptCont').checked, doisTemas: document.getElementById('qaOptTemas').checked, larguras: !!document.getElementById('qaOptLarg')?.checked, filtro: document.getElementById('qaFiltro').value.trim(), espera: +document.getElementById('qaEspera').value };
      varrer(opts);
    },
    parar() { S.parar = true; },
    async crud() { const b = document.getElementById('qaBtnCrud'); if (!confirm('Rodar o CRUD real?\n\nVai criar, alterar e excluir registros marcados "QA-TESTE" no banco de produção (com limpeza garantida no final).')) return;
      b.disabled = true; b.textContent = 'Rodando...'; S.erro = null; try { S.crud = (await api('crud_suite')); delete S.crud.success; toast(S.crud.ok ? 'CRUD real: todos os ciclos OK' : 'CRUD real: há falhas', S.crud.ok ? 'success' : 'error'); } catch (e) { S.erro = 'CRUD real não rodou: ' + e.message; toast('Erro: ' + e.message, 'error'); } b.disabled = false; b.textContent = '🧪 Rodar CRUD real'; render(); },
    async seguranca() { const b = document.getElementById('qaBtnSeg'); b.disabled = true; b.textContent = 'Varrendo (até 1 min)...'; S.erro = null;
      try { const d = await api('seguranca'); delete d.success; d.versao = document.getElementById('sidebarBuildId')?.textContent || ''; S.seg = d; try { await api('salvar_execucao', { tipo: 'seguranca', relatorio: d }); } catch (_) {} toast('Varredura de segurança concluída', 'success'); }
      catch (e) { S.erro = 'Varredura de segurança não concluiu: ' + e.message; toast('Erro: ' + e.message, 'error'); } b.disabled = false; b.textContent = '🛡 Rodar varredura de segurança'; render(); this.historico(); },
    async historico(abrirUltima) { const el = document.getElementById('qaHist'); if (!el) return; try { const d = await api('listar_execucoes');
      if (abrirUltima && !S.relatorio && !S.seg && (d.execucoes || []).length) { const u = d.execucoes[0]; this.carregar(u.id, u.tipo); } el.innerHTML = (d.execucoes || []).map(x => `<div style="padding:4px 0;border-bottom:1px solid var(--bd);display:flex;gap:8px;"><span>${x.tipo === 'seguranca' ? '🛡' : '🧪'} ${new Date(x.em).toLocaleString('pt-BR')}</span><span style="color:var(--t2);">${x.resumo ? Object.entries(x.resumo).map(([k, v]) => k + ': ' + v).join(' · ') : ''}</span><a href="#" style="margin-left:auto;color:var(--blue);" onclick="QA.carregar('${x.id}','${x.tipo}');return false;">abrir</a></div>`).join('') || 'Nenhuma execução ainda.'; } catch (e) { el.textContent = 'Histórico indisponível: ' + e.message; } },
    async carregar(id, tipo) { try { const d = await api('obter_execucao', { id }); if (tipo === 'seguranca') S.seg = d.relatorio; else { S.relatorio = d.relatorio; if (d.relatorio?.seguranca) S.seg = d.relatorio.seguranca; if (d.relatorio?.crud) S.crud = d.relatorio.crud; } render(); } catch (e) { toast('Erro: ' + e.message, 'error'); } },
    baixarMd() { baixar('relatorio-correcao-atlantyx-' + new Date().toISOString().substring(0, 16).replace(/[:T]/g, '-') + '.md', document.getElementById('qaMd')?.value || markdown(), 'text/markdown'); },
    baixarJson() { baixar('relatorio-qa-atlantyx.json', JSON.stringify({ qa: S.relatorio, crud: S.crud, seguranca: S.seg }, null, 2), 'application/json'); },
    async aprovar() {
      const md = document.getElementById('qaMd')?.value || markdown(); const msg = document.getElementById('qaAprovMsg');
      if (!confirm('Aprovar este relatório e enviar para correção automática?\n\nSerá aberta uma tarefa no GitHub para o Claude corrigir. A nova versão só vai ao ar quando você aprovar o pull request.')) return;
      msg.innerHTML = '<span style="color:var(--blue);">Abrindo a tarefa no GitHub...</span>';
      try { const tot = S.relatorio ? S.relatorio.achados.filter(a => a.sev !== 'info').length : 0, seg = S.seg ? (S.seg.achados || []).length : 0;
        const d = await api('abrir_correcao', { titulo: `Correções do agente de QA/Segurança — ${tot} QA, ${seg} segurança (${new Date().toLocaleDateString('pt-BR')})`, corpo: md });
        msg.innerHTML = `<span style="color:var(--green);">✓ Tarefa #${d.issue} aberta: <a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:var(--blue);">${esc(d.url)}</a>. O Claude vai abrir um pull request; aprove-o no GitHub para gerar a nova versão.</span>`; }
      catch (e) { msg.innerHTML = '<span style="color:var(--red);">Não foi possível abrir a tarefa: ' + esc(e.message) + '</span><div style="color:var(--t2);margin-top:4px;">Você pode copiar o relatório e colar no chat do Claude.</div>'; }
    },
    _markdown: markdown, _classificar: classificar, _inventario: inventario,
  };
})();
