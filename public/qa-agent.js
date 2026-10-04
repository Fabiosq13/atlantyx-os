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
  const READ_RE = /^(list|listar|get|obter|status|historico|config_get|config_status|feed_config_get|feed_listar|feed_hubspot_pendentes|feed_preview_html|kpis_saude|fluxo_futuro|fluxo_detalhado|dre_mensal|extrato_[a-z_]+|orcamento_consolidado|dashboard_[a-z_]*|painel_[a-z_]+|marcos_kanban|marcos_previsao_contar|projeto_list|projeto_get|projetos_listar|projetos_select|projetos_config_list|termo_get|termo_list|termo_ultimo_rateio|termo_diagnostico|termo_rastrear_notas|termo_nf_email_historico|contrato_list|desp_list|desp_ocorrencias|desp_nao_cadastradas|sim_list|conc_(sugestoes|faturas_vencidas|notas_extrato|razao|recebiveis|despesas_dup)|qb_(status|diagnostico|contas_diagnostico|contas_filtro|razao_conta|saldo_por_conta|saldo_contas|fornecedores_list|conferir_banco|varrer_duplicados|rastrear_duplicados)|remessa_(get|list)|report_(get|list)|brief_(get|listar)|conselho_(list|sessao_get|sessao_list)|reuniao_list|funcionario_list|leads_list|leads_por_campanha|clientes_listar|mapa_listar|cartao_get|funil_campanha|comercial_(cac|semaforo)|agenda_gp|alertas_projetos|pagamentos_disponiveis|telefone_status|autocampanha_diagnostico|fila_status|listar_landing_pages|email_diagnostico|metricas|metricas_posts|auditoria_funil|organograma|painel_mestre|excel|list_[a-z_0-9]+|get_[a-z_0-9]+|listar_execucoes|obter_execucao|atlantyx|painel|margens|premissas|prop_config|prop_listar|prop_obter|rate_card|rate_card_sugerir|padrao|base_listar|estrategia_listar)$/;
  const BOT_LEITURA = /(^|\s)(↻|⟳)|atualizar|recarregar|carregar(?!\s*(nota|arquivo|pdf|xml|planilha|imagem))|buscar|filtrar|consultar|visualizar|listar|pesquisar|ver\s/i;
  const BOT_ARRISCADO = /excluir|apagar|remover|deletar|enviar|disparar|publicar|lançar|lancar|aprovar|pagar|pago|gerar|analisar|ia\b|claude|whatsapp|e-?mail|importar|upload|desconectar|conectar|limpar|resetar|mover|reabrir|arquivar|confirmar|salvar|gravar|sincronizar|executar|varrer/i;
  const BOT_FORM = /salvar|cadastrar|criar|adicionar|incluir|gravar|registrar|captar|\+\s*nov/i;
  const TOKENS_RUINS = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|R\$\s*NaN|NaN%/;
  const CARREGANDO = /carregando|analisando\.\.\.|varrendo|consultando|aguarde|⏳/i;
  // v3.28 execução real — o que NÃO é clicado em registros reais (só nos criados pelo QA)
  const BOT_DESTRUTIVO = /excluir|apagar|remover|deletar|🗑|limpar|resetar|zerar|desconectar|revogar|esquecer/i;
  const BOT_ALTERA_REAL = /aprovar|recusar|rejeitar|^ok$|^x$|pagar|pago|baixar pagamento|mover|arquivar|reabrir|confirmar|lan[çc]ar|conciliar|marcar|ativar|desativar|publicar|agendar|sincronizar|importar|restaurar|substituir|trocar|definir como|tornar padr[ãa]o|enviar (para|ao) (kanban|banco)|aprova/i;
  const BOT_FECHAR = /^(✕|×|x|fechar|cancelar|voltar|ok, entendi|entendi)$/i;
  const AI_ROTAS = /\/api\/(claude|s2-creative|image-gen|s1-intel|s1-strategy|decisor-map|email-intel|dev-pipeline|wa-batch-generate|prospect-scan)/;

  const S = { rodando: false, parar: false, relatorio: null, seg: null, crud: null, mkt: null };
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
  // v3.43: o computador dormiu / a aba congelou no meio do teste? (relatório trazia "API lenta 24.000s" e
  // "Failed to fetch" que eram só a máquina em repouso). Um relógio a cada 2s detecta saltos > 90s.
  S.pausas = S.pausas || [];
  // v3.84: aba em SEGUNDO PLANO também conta. O Chrome passa a acordar os timers só 1x por minuto numa aba
  // escondida — o relatório da madrugada saiu com centenas de "levou 180s"/"não terminou" que eram só isso.
  // Enquanto a aba está escondida a varredura PAUSA (_esperarVisivel) e os tempos desse trecho são descartados.
  function _suspenso(ini, fim) { return (S.pausas || []).some(([a, b]) => a < fim && b > ini) || (S._ocultoIni != null && S._ocultoIni < fim) || (fim - ini > 30 * 60000); }
  function _relogio(ligar) {
    clearInterval(S._hb); if (S._vis) { document.removeEventListener('visibilitychange', S._vis); S._vis = null; } S._ocultoIni = null;
    if (!ligar) return;
    S.pausas = []; S.ocultoMs = 0; let ult = Date.now();
    S._hb = setInterval(() => { const n = Date.now(); if (n - ult > 90000) S.pausas.push([ult, n]); ult = n; }, 2000);
    S._ocultoIni = document.hidden ? Date.now() : null;
    S._vis = () => { if (document.hidden) { if (S._ocultoIni == null) S._ocultoIni = Date.now(); } else if (S._ocultoIni != null) { const n = Date.now(); S.pausas.push([S._ocultoIni, n]); S.ocultoMs += n - S._ocultoIni; S._ocultoIni = null; } };
    document.addEventListener('visibilitychange', S._vis);
  }
  async function _esperarVisivel() { while (document.hidden && !S.parar) await sleep(1000); }
  function instrumentar(ctx) {
    _orig.fetch = window.fetch; _orig.alert = window.alert; _orig.confirm = window.confirm; _orig.prompt = window.prompt; _orig.open = window.open; _orig.cerr = console.error;
    ctx.pendentes = 0;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input.url;
      const c = classificar(url, init);
      const reg = { tela: ctx.tela, fase: ctx.fase, rota: c.rota, action: c.action, metodo: c.metodo, inicio: Date.now() };
      if (c.interno) return _orig.fetch.apply(this, arguments);
      // v3.28 EXECUÇÃO REAL: toda chamada ao próprio sistema vai de verdade, com o cabeçalho que liga a
      // guarda do servidor (lib/qa-guard.js): WhatsApp/e-mail só para os contatos de teste; QuickBooks,
      // HubSpot, Metricool e outros serviços externos que gravam ficam simulados.
      const mesmoSite = (() => { try { return new URL(url, location.href).origin === location.origin; } catch (_) { return false; } })();
      if (ctx.real && mesmoSite && !(ctx.semIA && AI_ROTAS.test(c.rota || '') && !c.leitura)) {
        const h = new Headers((init && init.headers) || (typeof input !== 'string' && input.headers) || {});
        h.set('x-qa-real', '1'); if (ctx.fone) h.set('x-qa-fone', ctx.fone); if (ctx.email) h.set('x-qa-email', ctx.email);
        const ini2 = Object.assign({}, init || {}, { headers: h });
        const alvo = typeof input === 'string' ? input : new Request(input, ini2);
        reg.real = !c.leitura; reg.payload = c.body ? JSON.stringify(c.body).substring(0, 400) : null;
        ctx.pendentes++; (ctx.emVoo = ctx.emVoo || new Set()).add(reg);
        try {
          const r = await _orig.fetch.call(window, alvo, typeof input === 'string' ? ini2 : undefined);
          reg.status = r.status; reg.ms = Date.now() - reg.inicio; reg.suspenso = _suspenso(reg.inicio, Date.now());
          try { const sim = r.headers.get('x-qa-simulado'); if (sim) reg.simulado = JSON.parse(decodeURIComponent(sim)); } catch (_) {}
          try { const cl = r.clone(); const t = await cl.text(); if (/json/.test(r.headers.get('content-type') || '') || /^\s*[{[]/.test(t)) { const j = JSON.parse(t); if (j && (j.success === false || r.status >= 400)) reg.erro = String(j.error || j.message || (j.success === false ? 'success:false' : 'HTTP ' + r.status)).substring(0, 300) + (j.hint || j.dica ? ' — ' + String(j.hint || j.dica).substring(0, 160) : ''); } else if (r.status >= 400) reg.erro = t.substring(0, 200); } catch (_) {}
          ctx.requisicoes.push(reg); return r;
        } catch (e) { reg.status = 0; reg.ms = Date.now() - reg.inicio; reg.suspenso = _suspenso(reg.inicio, Date.now()); reg.erro = 'falha de rede: ' + e.message; ctx.requisicoes.push(reg); throw e; }
        finally { ctx.pendentes--; ctx.emVoo && ctx.emVoo.delete(reg); }
      }
      if (!c.leitura) {
        reg.bloqueado = true; reg.ms = 0; reg.payload = c.body ? JSON.stringify(c.body).substring(0, 800) : null;
        ctx.requisicoes.push(reg);
        return new Response(JSON.stringify({ success: false, qa_bloqueado: true, error: '[QA] gravação bloqueada no modo seguro' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      ctx.pendentes++; (ctx.emVoo = ctx.emVoo || new Set()).add(reg);
      try {
        const r = await _orig.fetch.apply(this, arguments);
        reg.status = r.status; reg.ms = Date.now() - reg.inicio; reg.suspenso = _suspenso(reg.inicio, Date.now());
        try { const cl = r.clone(); const t = await cl.text(); if (/json/.test(r.headers.get('content-type') || '') || /^\s*[{[]/.test(t)) { const j = JSON.parse(t); if (j && (j.success === false || r.status >= 400)) reg.erro = String(j.error || j.message || (j.success === false ? 'success:false' : 'HTTP ' + r.status)).substring(0, 300) + (j.hint || j.dica ? ' — ' + String(j.hint || j.dica).substring(0, 160) : ''); } else if (r.status >= 400) reg.erro = t.substring(0, 200); } catch (_) {}
        ctx.requisicoes.push(reg); return r;
      } catch (e) { reg.status = 0; reg.ms = Date.now() - reg.inicio; reg.suspenso = _suspenso(reg.inicio, Date.now()); reg.erro = 'falha de rede: ' + e.message; ctx.requisicoes.push(reg); throw e; }
      finally { ctx.pendentes--; ctx.emVoo && ctx.emVoo.delete(reg); }
    };
    window.alert = m => { ctx.dialogos.push({ tela: ctx.tela, tipo: 'alert', msg: String(m).substring(0, 300) }); };
    // execução real: confirma (a ação roda de verdade) e responde prompts com dados de teste
    window.confirm = m => { ctx.dialogos.push({ tela: ctx.tela, tipo: 'confirm', msg: String(m).substring(0, 200) }); ctx.confirmou = true; return !!ctx.real; };
    window.prompt = (m, def) => { ctx.dialogos.push({ tela: ctx.tela, tipo: 'prompt', msg: String(m).substring(0, 200) }); ctx.confirmou = true;
      if (!ctx.real) return null; const t = String(m || '');
      if (/e-?mail/i.test(t)) return ctx.email || 'qa@teste.com.br'; if (/whats|telefone|celular|fone/i.test(t)) return ctx.fone || '21999990000';
      if (/valor|quant|n[uú]mero|dias|meses|%/i.test(t)) return '1'; if (/https?:|link|url/i.test(t)) return def || location.origin + '/captura.html';
      return def && String(def).trim() ? def : MARCA + ' resposta'; };
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
      // v3.84: célula com campo (input/select) vale pelo VALOR do campo — antes a tabela editável da Política
      // Comercial e do Business Plan saía como "coluna sempre vazia" e "linhas repetidas" (só o texto do ✕ igual)
      const txtCel = el => { if (!el) return ''; let t = el.innerText || ''; el.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(f => { t += ' ' + (f.tagName === 'SELECT' ? (f.selectedOptions[0]?.text || '') : (f.type === 'checkbox' ? (f.checked ? '☑' : '☐') : f.value)); }); return t.replace(/\s+/g, ' ').trim(); };
      // linhas que o próprio sistema já marca como repetidas (ex.: lançamento duplicado no QuickBooks) são aviso de dado, não falha da tela
      const textos = linhas.filter(r => !/repetid|duplicad/i.test(r.innerText)).map(txtCel); const dup = textos.length - new Set(textos).size;
      if (dup > 0 && textos.length > 2) add('média', 'dados', `Tabela ${k + 1}: ${dup} linha(s) repetida(s)`, textos.find((x, i) => textos.indexOf(x) !== i)?.substring(0, 160), 'Verificar duplicidade na consulta (JOIN/merge) ou chave de deduplicação.');
      const cols = linhas[0].children.length; for (let c = 0; c < cols; c++) { const vals = linhas.map(r => txtCel(r.children[c])); if (linhas.length >= 3 && vals.every(v => !v || v === '—' || v === '-')) { const th = tb.querySelectorAll('thead th')[c]?.innerText || ('coluna ' + (c + 1)); add('baixa', 'dados', `Tabela ${k + 1}: coluna "${th.trim()}" sempre vazia`, `${linhas.length} linhas`, 'Conferir o campo lido da API para essa coluna.'); } }
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
    // v3.69: só campo de ENDEREÇO de e-mail (antes "emailAssunto" recebia um e-mail e o achado dizia que os dados não foram enviados)
    if (t === 'email' || /@/.test(el.placeholder || '') || /(^|[^a-z])e-?mail$/i.test(el.id || '') || /^e-?mail$/i.test(el.name || '')) return 'qa@teste.com.br';
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
      // v3.69: fora do teste de formulário: botão que só abre o seletor de arquivos (.click()) e botão de aba
      const salvar = bts.filter(b => BOT_FORM.test(b.innerText) && !/excluir|apagar|remover/i.test(b.innerText) && !b.disabled && !/\.click\(\)|mostrarAba|Aba\(|Tab\(/.test(b.getAttribute('onclick') || '')).slice(0, 3);
      for (const b of salvar) {
        if (S.parar || !b.isConnected) break;
        const cont = b.closest('[id$="Modal"],.panel,.pb,form') || page;
        const campos = [...cont.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(visivel).slice(0, 25);
        if (!campos.length) continue;
        const orig = campos.map(c => c.value); const rot = rotuloEl(b);
        const tentar = async (fase) => { ctx.fase = fase + ': ' + rot; ctx.confirmou = false; const antes = ctx.requisicoes.length, antesErr = ctx.erros.length, antesDlg = ctx.dialogos.length, html0 = cont.innerHTML.length;
          const tEl = document.getElementById('toastEl'); const toast0 = tEl ? tEl.textContent : ''; if (tEl) tEl.textContent = ''; // v3.69: mensagem (toast) também é efeito visível
          try { b.click(); } catch (e) { ctx.erros.push({ tela: t.id, tipo: 'erro JS', msg: 'clique em "' + rot + '": ' + e.message }); }
          await aguardarRede(ctx, Math.min(opts.espera, 4000));
          const tNovo = tEl && tEl.textContent.trim() ? tEl.textContent.trim() : ''; if (tEl && !tNovo) tEl.textContent = toast0;
          return { reqs: ctx.requisicoes.slice(antes), erros: ctx.erros.slice(antesErr), dlg: ctx.dialogos.slice(antesDlg), mudou: Math.abs(cont.innerHTML.length - html0) > 20 || !!tNovo || !!document.querySelector('input[type=file]:focus'), confirmou: ctx.confirmou, toast: tNovo }; };
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
            if (env.length && !env.some(r => (r.payload || '').includes(MARCA) || (r.payload || '').includes('123') || (r.payload || '').includes('qa@teste.com.br'))) add('média', 'formulário', `Formulário "${rot}" chama a API sem os dados digitados`, env.map(r => `${r.rota} · ${r.action}: ${r.payload}`).join(' | '), 'Conferir os ids dos campos lidos pela função de salvar.');
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
  // ── v3.28 EXECUÇÃO REAL de todas as ações da tela ─────────────────────
  const overlays = () => [...document.querySelectorAll('body > div, body > section')].filter(d => { const cs = getComputedStyle(d); return cs.position === 'fixed' && +cs.zIndex >= 1000 && cs.display !== 'none' && !/toast|qaFlut/i.test(d.id + ' ' + d.className) && d.getBoundingClientRect().height > 60; });
  const doQA = el => { let e = el; for (let i = 0; i < 6 && e && e !== document.body; i++, e = e.parentElement) { const t = e.innerText || ''; if (t.length < 900 && t.includes(MARCA)) return true; } return false; };
  const assinatura = b => (rotuloEl(b) + '|' + String(b.getAttribute('onclick') || '').replace(/'[^']*'|"[^"]*"|\d+/g, '#')).substring(0, 180);
  const clicaveis = root => [...root.querySelectorAll('button, [role=button], a[onclick], a[href^="javascript:"], .btn')].filter(b => visivel(b) && !b.disabled && !b.closest('#qaFlut') && !b.closest('.sb') && b.tagName !== 'SELECT');
  function valorReal(el, ctx) {
    const t = (el.type || '').toLowerCase(), k = (el.id + ' ' + (el.name || '') + ' ' + (el.placeholder || '')).toLowerCase();
    if (t === 'email' || /e-?mail/.test(k)) return ctx.email || 'qa@teste.com.br';
    if (t === 'tel' || /telefone|whats|celular|fone/.test(k)) return ctx.fone || '21999990000';
    if (t === 'url' || /link|url|site/.test(k)) return location.origin + '/captura.html';
    if (t === 'datetime-local') return new Date(Date.now() + 864e5).toISOString().substring(0, 16);
    return valorTeste(el);
  }
  async function executarAcoes(root, t, ctx, opts, nivel = 0) {
    const achados = [], reg = ctx.acoes = ctx.acoes || [];
    const add = (sev, cat, titulo, evidencia, sugestao) => achados.push({ sev, cat, titulo, evidencia: String(evidencia || '').substring(0, 500), sugestao, tela: t.id, rotulo: t.rotulo });
    const feitos = ctx._feitos = ctx._feitos || new Set();
    const max = nivel ? 15 : (opts.maxAcoes || 40); let n = 0;
    while (n < max && !S.parar) {
      await _esperarVisivel(); if (S.parar) break;
      const b = clicaveis(root).find(x => !feitos.has(t.id + '#' + assinatura(x)));
      if (!b) break;
      const sig = t.id + '#' + assinatura(b); feitos.add(sig); n++;
      const rot = rotuloEl(b) || '(sem rótulo)'; const proprio = doQA(b);
      const linha = { tela: t.id, rotulo: t.rotulo, acao: rot, nivel, inicio: Date.now() };
      if (!proprio && BOT_DESTRUTIVO.test(rot + ' ' + (b.title || ''))) { reg.push({ ...linha, resultado: 'pulado', detalhe: 'apagaria um registro real (só é executado nos registros criados pelo QA)' }); continue; }
      if (!proprio && BOT_ALTERA_REAL.test(rot.trim())) { reg.push({ ...linha, resultado: 'pulado', detalhe: 'mudaria o estado de um registro real (aprovar/pagar/publicar/mover…) — só nos registros do QA' }); continue; }
      // formulário: preenche só se estiver vazio (formulário de inclusão); se já tem dados, salva como está
      const cont = b.closest('[id$="Modal"],.panel,.pb,form,.dp-card,#dpBox') || root;
      if (BOT_FORM.test(rot) && cont !== root) {
        const campos = [...cont.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),textarea')].filter(visivel).slice(0, 25);
        const preenchido = campos.some(c => String(c.value || '').trim() && c.type !== 'date' && c.type !== 'month' && c.type !== 'number');
        if (!preenchido) campos.forEach(c => { try { c.value = valorReal(c, ctx); disparar(c); } catch (_) {} });
        [...cont.querySelectorAll('select')].filter(visivel).forEach(sl => { if (!sl.value && sl.options.length > 1) { sl.value = sl.options[1].value; disparar(sl); } });
      }
      const r0 = ctx.requisicoes.length, e0 = ctx.erros.length, d0 = ctx.dialogos.length;
      const toastEl = document.getElementById('toastEl'); const toast0 = toastEl ? toastEl.textContent : '';
      const html0 = (root.innerHTML || '').length, ov0 = new Set(overlays()), pag0 = document.querySelector('.page.active')?.id;
      ctx.fase = 'ação: ' + rot; progressoAcao(t, rot, n);
      let mutacoes = 0; const mo = new MutationObserver(l => { mutacoes += l.length; }); try { mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'open', 'hidden', 'disabled', 'value'] }); } catch (_) {}
      try { b.click(); } catch (e) { ctx.erros.push({ tela: t.id, tipo: 'erro JS', msg: 'clique em "' + rot + '": ' + e.message }); }
      await sleep(250);
      const terminou = await aguardarRede(ctx, opts.esperaAcao || 60000);
      await sleep(400);
      const reqs = ctx.requisicoes.slice(r0), errs = ctx.erros.slice(e0), dlg = ctx.dialogos.slice(d0);
      const toastNovo = toastEl && toastEl.textContent !== toast0 && getComputedStyle(toastEl).opacity !== '0' ? toastEl.textContent.trim() : '';
      const simulados = reqs.flatMap(x => x.simulado || []);
      const falhas = reqs.filter(x => x.erro && !x.bloqueado);
      const ms = Date.now() - linha.inicio;
      if (_suspenso(linha.inicio, Date.now())) { reg.push({ ...linha, resultado: 'interrompido', detalhe: 'o computador entrou em repouso (ou a aba congelou) durante a ação — resultado descartado', ms });
        try { mo.disconnect(); } catch (_) {} if (nivel === 0) fecharModais(); continue; }
      const chamadas = reqs.map(x => `${x.rota}${x.action ? '·' + x.action : ''} ${x.bloqueado ? 'bloqueada' : (x.status ?? '…')}${x.erro ? ' ✕' : ''}`).slice(0, 8).join(', ');
      const pagina = document.querySelector('.page.active')?.id;
      const novos = overlays().filter(o => !ov0.has(o));
      try { mo.disconnect(); } catch (_) {}
      const mudou = mutacoes > 0 || Math.abs((root.innerHTML || '').length - html0) > 20 || novos.length || pagina !== pag0;
      const avisoErro = (dlg.find(d => d.tipo === 'alert' && /erro|falh|inválid|invalid|não (foi|consegu)/i.test(d.msg))?.msg) || (/erro|falh|inválid|não (foi|consegu)|configure|não configurad/i.test(toastNovo) ? toastNovo : '');
      let resultado = 'ok', detalhe = toastNovo || (dlg[0]?.msg || '');
      if (errs.length) { resultado = 'erro'; detalhe = errs.map(e => e.msg).join(' | ');
        add('alta', 'ação real', `"${rot}" gerou erro de JavaScript`, detalhe + (chamadas ? ' · chamadas: ' + chamadas : ''), 'Corrigir a função do onclick deste botão.'); }
      else if (falhas.length) { resultado = simulados.length ? 'depende de externo' : 'erro'; detalhe = falhas.map(f => `${f.rota}${f.action ? ' · ' + f.action : ''}: ${f.erro}`).join(' | ');
        add(simulados.length ? 'info' : 'alta', 'ação real', simulados.length ? `"${rot}" falhou depois de uma chamada externa simulada pelo QA` : `"${rot}" executou e a API respondeu erro`, detalhe, simulados.length ? 'Conferir manualmente com o serviço externo real (no QA ele é simulado).' : 'Corrigir a ação no servidor (arquivo da API indicado) ou a validação antes de chamar.'); }
      else if (avisoErro) { resultado = 'aviso de erro'; detalhe = avisoErro; add('média', 'ação real', `"${rot}" mostrou mensagem de erro`, avisoErro, 'Ver a causa da mensagem (configuração ausente, validação ou falha).'); }
      else if (!terminou) { resultado = 'sem resposta'; detalhe = `ainda aguardando após ${Math.round((opts.esperaAcao || 60000) / 1000)}s: ` + [...(ctx.emVoo || [])].map(x => x.rota + (x.action ? '·' + x.action : '')).join(', ');
        add('média', 'ação real', `"${rot}" não terminou no tempo de espera`, detalhe, 'Reduzir o tempo da ação ou mostrar progresso/processar em segundo plano.'); }
      else if (!reqs.length && !dlg.length && !mudou && !toastNovo && !BOT_FECHAR.test(rot.trim())) { resultado = 'sem efeito'; add('baixa', 'ação real', `"${rot}" não teve efeito visível`, 'nenhuma chamada, mensagem ou mudança na tela', 'Conferir se o botão está ligado à função certa ou se falta retorno ao usuário.'); }
      else if (simulados.length) { resultado = 'ok (externo simulado)'; detalhe = simulados.map(x => x.tipo + (x.destino ? ' ' + x.destino : '')).join(' · '); }
      const tok = (root.innerText || '').match(TOKENS_RUINS); if (tok && resultado.startsWith('ok')) { resultado = 'dados ruins'; add('média', 'ação real', `Depois de "${rot}" a tela mostra "${tok[0]}"`, (root.innerText || '').substring(Math.max(0, tok.index - 60), tok.index + 60), 'Tratar valores vazios/nulos na renderização.'); }
      if (ms > 30000 && !reqs.some(x => AI_ROTAS.test(x.rota || ''))) add('média', 'desempenho', `"${rot}" levou ${Math.round(ms / 1000)}s`, chamadas, 'Otimizar a ação ou mostrar progresso.');
      reg.push({ ...linha, resultado, detalhe: String(detalhe || '').substring(0, 300), ms, chamadas, gravou: reqs.filter(x => x.real).length });
      // modal aberto pela ação: executa as ações de dentro (1 nível) e fecha
      if (novos.length && nivel === 0) { for (const o of novos) { if (S.parar) break; achados.push(...await executarAcoes(o, t, ctx, opts, 1)); } }
      if (nivel === 0) fecharModais();
      if (document.querySelector('.page.active')?.id !== 'page-' + t.id && nivel === 0) { try { window.nav(t.id, t.el); } catch (_) {} await aguardarRede(ctx, 8000); }
    }
    if (n >= max && nivel === 0) reg.push({ tela: t.id, rotulo: t.rotulo, acao: '…', resultado: 'pulado', detalhe: `limite de ${max} ações por tela atingido` });
    return achados;
  }
  function progressoAcao(t, rot, n) { const x = document.getElementById('qaFlutTxt'); if (x) x.textContent = `${t.rotulo} · ação ${n}: ${rot}`; }

  function fecharModais() {
    document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && +cs.zIndex >= 1000 && cs.display !== 'none' && !/toast|qaFlut/i.test(d.id + d.className)) d.style.display = 'none'; });
    ['ideiaModal', 'nfMailModal', 'fatRastroModal'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
  }

  // ── Varredura ──────────────────────────────────────────────────────────
  async function varrer(opts) {
    try { await _varrer(opts); } catch (e) { S.rodando = false; S.erro = 'A varredura parou com erro: ' + e.message; try { window.nav('qa', document.querySelector('.sbi[onclick*="\'qa\'"]')); } catch (_) {} render(); }
  }
  // v3.82: a varredura testa o código carregado NESTA aba. Se a aba foi aberta antes do último deploy,
  // o relatório sai de uma versão velha (ex.: relatório "v3.68" com tudo já corrigido) — confere antes.
  async function versaoPublicada() {
    try { const r = await fetch('/?_v=' + Date.now(), { cache: 'no-store' }); const m = (await r.text()).match(/__ATX_BUILD_ID__\s*=\s*'([^']+)'/); return m ? m[1] : null; } catch (_) { return null; }
  }
  async function _varrer(opts) {
    if (S.rodando) return;
    const aqui = window.__ATX_BUILD_ID__ || document.getElementById('sidebarBuildId')?.textContent || '';
    const pub = await versaoPublicada();
    if (pub && aqui && pub !== aqui) {
      if (!opts.semConfirmar && confirm('Esta aba está com a versão ' + aqui + ', mas o sistema publicado já está na ' + pub + '.\n\nA varredura testaria o código antigo e acusaria problemas já corrigidos.\n\nOK = recarregar a página agora (depois rode a varredura de novo)\nCancelar = varrer assim mesmo')) { location.reload(); return; }
      S.versaoDesatualizada = { aba: aqui, publicada: pub };
    } else S.versaoDesatualizada = null;
    S.rodando = true; S.parar = false; S.erro = null; S.avisoSalvar = null;
    const telas = inventario().filter(t => !opts.filtro || t.id.includes(opts.filtro) || t.rotulo.toLowerCase().includes(opts.filtro.toLowerCase()));
    const ctx = { tela: null, fase: '', requisicoes: [], erros: [], dialogos: [], formsOk: [], pendentes: 0, real: !!opts.real, fone: opts.fone || '', email: opts.email || '', semIA: opts.real && opts.ia === false, acoes: [] };
    if (opts.real) { try { S.realRun = await api('real_inicio'); } catch (e) { S.rodando = false; S.erro = 'Não consegui preparar a execução real: ' + e.message; render(); return; } }
    const lsAntes = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); lsAntes[k] = localStorage.getItem(k); } } catch (_) {}
    const temaAntes = document.documentElement.getAttribute('data-theme');
    const inicio = Date.now(); const porTela = []; let achados = [];
    _relogio(true);
    flutuante(true);
    if (opts.real) { const fm = document.getElementById('qaFlutModo'); if (fm) fm.innerHTML = '<b style="color:var(--gold);">EXECUÇÃO REAL</b>: as ações rodam de verdade; envios só para os contatos de teste; QuickBooks/HubSpot/Metricool simulados.'; }
    instrumentar(ctx);
    try {
      for (let i = 0; i < telas.length; i++) {
        await _esperarVisivel(); if (S.parar) break;
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
          a = a.concat(opts.real ? await executarAcoes(page, t, ctx, opts) : await testarBotoes(page, t, ctx, opts));
        } else if (document.querySelector('.page.active') && document.querySelector('.page.active').id !== 'page-' + t.id) a.push({ sev: 'info', cat: 'navegação', titulo: 'A tela redireciona para outra ao abrir', evidencia: 'page-' + t.id + ' → ' + document.querySelector('.page.active').id, sugestao: 'Se o redirecionamento é intencional, nada a fazer; senão, conferir o nav.', tela: t.id, rotulo: t.rotulo });
        else a.push({ sev: 'alta', cat: 'navegação', titulo: 'A tela não abriu pelo menu', evidencia: 'nav("' + t.id + '") não ativou page-' + t.id, sugestao: 'Conferir o id da página e o item de menu.', tela: t.id, rotulo: t.rotulo });
        if (!t.noMenu) a.push({ sev: 'info', cat: 'navegação', titulo: 'Tela sem item de menu (inacessível ao usuário)', evidencia: 'page-' + t.id, sugestao: 'Adicionar ao menu ou remover a tela órfã.', tela: t.id, rotulo: t.rotulo });
        const reqsTodas = ctx.requisicoes.slice(r0).filter(r => !r.tela || r.tela === t.id), errs = ctx.erros.slice(e0);
        const reqs = reqsTodas.filter(r => !r.suspenso);
        if (reqsTodas.length > reqs.length) a.push({ sev: 'info', cat: 'execução', titulo: 'Computador em repouso durante o teste desta tela', evidencia: `${reqsTodas.length - reqs.length} chamada(s) descartada(s) (falha de rede/lentidão causadas pela pausa, não pelo sistema)`, sugestao: 'Rodar de novo com o computador ligado (desative o repouso durante a varredura).', tela: t.id, rotulo: t.rotulo });
        errs.forEach(e => a.push({ sev: 'alta', cat: 'erro JS', titulo: `${e.tipo} ao abrir/usar a tela`, evidencia: e.msg + (e.onde ? ' @ ' + e.onde : ''), sugestao: 'Corrigir a exceção (ver função da tela).', tela: t.id, rotulo: t.rotulo }));
        reqs.filter(r => !r.bloqueado && (r.status >= 500 || r.status === 0)).forEach(r => a.push({ sev: 'alta', cat: 'API', titulo: `API falhou (HTTP ${r.status})`, evidencia: `${r.rota}${r.action ? ' · ' + r.action : ''} — ${r.erro || ''}`, sugestao: 'Ver logs da função na Vercel e tratar o erro no servidor.', tela: t.id, rotulo: t.rotulo, api: r.rota, action: r.action }));
        reqs.filter(r => !r.bloqueado && r.status < 500 && r.status > 0 && r.erro).forEach(r => a.push({ sev: r.status >= 400 ? 'alta' : 'média', cat: 'API', titulo: 'API respondeu com erro', evidencia: `${r.rota}${r.action ? ' · ' + r.action : ''} (HTTP ${r.status}) — ${r.erro}`, sugestao: 'Corrigir a ação no servidor ou exibir o motivo ao usuário.', tela: t.id, rotulo: t.rotulo, api: r.rota, action: r.action }));
        reqs.filter(r => !r.bloqueado && !r.suspenso && r.ms > 8000 && !/claude|gerente_|s2-creative|chat|analise|debate/i.test((r.rota || '') + ' ' + (r.action || ''))).forEach(r => a.push({ sev: 'média', cat: 'desempenho', titulo: `API lenta (${(r.ms / 1000).toFixed(1)}s)`, evidencia: `${r.rota}${r.action ? ' · ' + r.action : ''}`, sugestao: 'Cachear, paralelizar ou paginar a consulta.', tela: t.id, rotulo: t.rotulo, api: r.rota, action: r.action }));
        if (!terminou && !S.parar && !_suspenso(t0, Date.now())) a.push({ sev: 'média', cat: 'desempenho', titulo: `Tela ainda carregando após ${Math.round(opts.espera / 1000)}s`, evidencia: [...(ctx.emVoo || [])].filter(r => r.tela === t.id).map(r => r.rota + (r.action ? ' · ' + r.action : '') + ' (' + Math.round((Date.now() - r.inicio) / 1000) + 's)').join(' | ') || reqs.filter(r => r.status == null).map(r => r.rota + ' ' + (r.action || '')).join(', '), sugestao: 'Reduzir o tempo de carga inicial.', tela: t.id, rotulo: t.rotulo });
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
    if (opts.real) { const fx = document.getElementById('qaResultado'); if (fx) fx.innerHTML = '<div class="panel"><div class="pb" style="color:var(--blue);">🧹 Limpando os dados de teste e restaurando configurações…</div></div>';
      try { S.realLimpeza = await api('real_limpar', { run_id: S.realRun?.run_id }); } catch (e) { S.realLimpeza = { erro: e.message }; } }
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
    _relogio(false);
    S.relatorio = { tipo: 'qa', versao: document.getElementById('sidebarBuildId')?.textContent || '', versao_desatualizada: S.versaoDesatualizada || null, inicio: new Date(inicio).toISOString(), duracao_s: Math.round((Date.now() - inicio) / 1000), repouso_s: Math.round((S.pausas || []).reduce((t, [x, y]) => t + (y - x), 0) / 1000), segundo_plano_s: Math.round((S.ocultoMs || 0) / 1000), interrompido: interrompido || S.parar, opcoes: opts || {},
      telas: porTela, total_telas: porTela.length, achados, resumo, formularios_ligados: ctx?.formsOk || [], acoes: (ctx?.acoes || []).slice(0, 2500), real: !!opts?.real, limpeza: opts?.real ? S.realLimpeza : null, run_id: opts?.real ? S.realRun?.run_id : null, bloqueadas: (ctx?.requisicoes || []).filter(r => r.bloqueado).map(r => ({ tela: r.tela, rota: r.rota, action: r.action, fase: r.fase })), crud: S.crud, seguranca: S.seg };
  }

  // ── Relatório para o Claude ────────────────────────────────────────────
  function arquivoApi(rota) { const m = String(rota || '').match(/^\/api\/([\w-]+)/); return m ? `api/${m[1]}.js` : null; }
  function markdown() {
    const R = S.relatorio, SEG = S.seg, C = S.crud;
    const linhas = [];
    linhas.push(`# Relatório de correção — Atlantyx OS (${R?.versao || SEG?.versao || document.getElementById('sidebarBuildId')?.textContent || ''})`, '');
    if (R?.segundo_plano_s > 60) linhas.push(`> ℹ A aba do sistema ficou ${Math.round(R.segundo_plano_s / 60)} min em segundo plano durante a varredura. Nesse tempo ela ficou pausada e os tempos medidos foram descartados (o navegador desacelera abas escondidas).`, '');
    if (R?.versao_desatualizada) linhas.push(`> ⚠ ATENÇÃO: esta varredura rodou numa aba com a versão ${R.versao_desatualizada.aba}, mas o sistema publicado já estava na ${R.versao_desatualizada.publicada}. Vários achados podem já estar corrigidos — recarregue a página e rode de novo antes de corrigir.`, '');
    linhas.push(`Gerado pelos agentes de QA e Segurança do próprio sistema em ${new Date().toLocaleString('pt-BR')}.`, '');
    linhas.push('## Contexto do projeto', '- Repositório: `Fabiosq13/atlantyx-os` (branch `main`, deploy automático na Vercel).', '- Frontend: arquivo único `public/index.html` (cada tela é `<div class="page" id="page-<id>">`; a navegação é `nav(id)`; funções de carga ligadas no `nav`).', '- Backend: funções serverless em `api/*.js` (ESM), banco Neon Postgres (driver 0.10: use `sql```` ou `_q(db, texto, params)`), bibliotecas em `lib/`.', '- Ao terminar: validar sintaxe (`node --check` nas APIs e nos blocos `<script>` do index.html) e subir a versão `ATX-vX.YY` em `public/index.html`.', '');
    if (R) {
      linhas.push('## Resultado da varredura de telas (QA)', `- Telas analisadas: ${R.total_telas}${R.interrompido ? ' (interrompida)' : ''} · duração ${R.duracao_s}s${R.repouso_s ? ` (dos quais ${R.repouso_s}s com o computador em repouso — chamadas desse período descartadas)` : ''} · ${R.real ? 'EXECUÇÃO REAL (ações executadas de verdade; envios só para os contatos de teste)' : 'modo seguro (gravações interceptadas: ' + R.bloqueadas.length + ')'}.`, `- Achados: ${Object.entries(R.resumo).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nenhum'}.`, '');
      const grupos = {}; R.achados.filter(a => a.sev !== 'info').forEach(a => { (grupos[a.sev] = grupos[a.sev] || []).push(a); });
      for (const sev of ['crítica', 'alta', 'média', 'baixa']) { if (!grupos[sev]) continue; linhas.push(`### Severidade ${sev} (${grupos[sev].length})`, '');
        grupos[sev].forEach(a => { linhas.push(`**${a.id} · ${a.titulo}** — tela \`${a.tela}\` (${a.rotulo}) · ${a.cat}`);
          linhas.push(`- Evidência: ${a.evidencia || '—'}`);
          const onde = [`\`page-${a.tela}\` em public/index.html`]; if (a.ganchos?.length) onde.push('funções: ' + a.ganchos.map(f => '`' + f + '`').join(', ')); if (a.api) onde.push(`\`${arquivoApi(a.api)}\`${a.action ? ' ação `' + a.action + '`' : ''}`);
          linhas.push(`- Onde olhar: ${onde.join(' · ')}`); linhas.push(`- Correção esperada: ${a.sugestao || '—'}`, ''); }); }
      const info = R.achados.filter(a => a.sev === 'info'); if (info.length) linhas.push(`### Informativos (${info.length})`, info.map(a => `- ${a.titulo}: \`${a.tela}\``).join('\n'), '');
    }
    if (R && R.real) {
      const A = R.acoes || []; const cont = A.reduce((o, a) => { o[a.resultado] = (o[a.resultado] || 0) + 1; return o; }, {});
      linhas.push('## Execução real de todas as ações', `- ${A.length} ações · ${Object.entries(cont).map(([k, v]) => k + ': ' + v).join(' · ')}.`, '- WhatsApp/e-mail foram só para os contatos de teste; QuickBooks, HubSpot, Metricool e outros serviços externos que gravam foram simulados pela guarda do servidor (lib/qa-guard.js).', '');
      const ruins = A.filter(a => !/^ok|pulado/.test(a.resultado));
      if (ruins.length) { linhas.push('| Tela | Ação | Resultado | Detalhe |', '|---|---|---|---|'); ruins.slice(0, 200).forEach(a => linhas.push(`| ${a.tela} | ${String(a.acao).replace(/\|/g, '/')} | ${a.resultado} | ${String(a.detalhe || '').replace(/\|/g, '/').substring(0, 160)} |`)); linhas.push(''); }
      const L = R.limpeza; if (L) linhas.push('### Limpeza', L.erro ? `- ERRO na limpeza: ${L.erro}` : `- Linhas de teste apagadas: ${Object.entries(L.apagadas || {}).map(([k, v]) => k + ' ' + v).join(', ') || 'nenhuma'}`, L.kv ? `- Configurações restauradas: ${(L.kv.restauradas || []).length} · listas limpas: ${(L.kv.limpas || []).length} · removidas: ${(L.kv.removidas || []).length}` : '', L.criadas_na_janela ? `- Criados durante o teste (sem marca, conferir): ${Object.entries(L.criadas_na_janela).map(([k, v]) => k + ' ' + v).join(', ') || 'nenhum'}` : '', '');
    }
    const MK = S.mkt;
    if (MK) {
      linhas.push('## Marketing ponta a ponta (geração → publicação → link → captura → exclusão)', `- Executado em ${MK.em ? new Date(MK.em).toLocaleString('pt-BR') : '—'} · campanha de teste \`${MK.ctx?.campanha_id || '—'}\` · post Metricool \`${MK.ctx?.metricool_id || 'não publicado'}\`.`, '');
      MK.passos.forEach(p => linhas.push(`- ${p.ok === false ? '✗' : '✓'} **${p.passo}**${p.ms ? ' (' + Math.round(p.ms / 1000) + 's)' : ''}${p.resumo ? ' — ' + p.resumo : ''}`)); linhas.push('');
      (MK.achados || []).forEach((a, i) => { linhas.push(`**MKT-${String(i + 1).padStart(3, '0')} · [${a.sev}] ${a.titulo}**`); if (a.evidencia) linhas.push(`- Evidência: ${a.evidencia}`); if (a.onde) linhas.push(`- Onde olhar: ${a.onde}`); if (a.sugestao) linhas.push(`- Correção esperada: ${a.sugestao}`); linhas.push(''); });
      if (MK.leads) { const L = MK.leads, F = L.funil || {};
        linhas.push('## Por que as campanhas não geram leads', `- Últimos 30 dias: ${F.publicacoes_30d ?? '—'} publicações · ${F.impressoes ?? '—'} impressões · ${F.cliques ?? '—'} cliques · ${F.visitas_30d ?? '—'} visitas na captura · ${F.leads_30d ?? '—'} leads.`, `- Destino dos links: ${Object.entries(F.por_destino || {}).map(([k, v]) => k + ' ' + v).join(' · ') || '—'} · sem UTM: ${F.sem_utm ?? '—'}.`, '');
        (L.causas || []).forEach((c, i) => linhas.push(`${i + 1}. **${c.causa}** — ${c.evidencia}. Ação: ${c.acao}`)); linhas.push('');
        if (L.parecer) linhas.push('### Parecer', L.parecer, ''); }
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
      f.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">🧪 Agente de QA varrendo o sistema</div><div id="qaFlutTxt" style="color:var(--t2);min-height:30px;"></div><div style="background:var(--bg4);height:6px;border-radius:4px;margin:8px 0;overflow:hidden;"><div id="qaFlutBar" style="height:100%;width:0;background:var(--blue);"></div></div><div style="font-size:9.5px;color:var(--t3);margin-bottom:6px;" id="qaFlutModo">Modo seguro: gravações e envios são interceptados.</div><button class="btn btn-g" style="font-size:10px;" onclick="QA.parar()">■ Parar</button>';
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
      <div class="panel" style="border:1px solid var(--gold);"><div class="ph"><div class="pt">⚡ Execução real de todas as ações</div><span style="font-size:10px;color:var(--t2);">clica em tudo · espera · avalia a resposta · limpa no fim</span></div><div class="pb" style="font-size:11px;color:var(--t2);line-height:1.6;">
        O QA entra em cada tela e <b>executa de verdade</b> cada botão (gerar, salvar, enviar, abrir janelas e as ações de dentro delas), <b>espera a resposta</b> e avalia: erro de API, erro de JavaScript, mensagem de erro, ação sem efeito, demora, dados ruins na tela. Formulários vazios são preenchidos com dados marcados <b>QA-TESTE</b>; formulários já preenchidos são salvos como estão.
        <b>Proteções:</b> WhatsApp e e-mail vão <b>só para os contatos de teste abaixo</b>; QuickBooks, HubSpot, Metricool e outros serviços externos que gravam são <b>simulados no servidor</b>; excluir, aprovar, pagar, publicar e mover só rodam nos registros criados pelo QA. No fim, os dados de teste são apagados e as configurações restauradas.
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:8px;">
          <div><label class="fl">WhatsApp de teste</label><input class="fi" id="qaRealFone" placeholder="21 99999-0000" title="Recebe as mensagens de WhatsApp disparadas durante o teste"/></div>
          <div><label class="fl">E-mail de teste</label><input class="fi" id="qaRealEmail" placeholder="voce@atlanteam.com.br" title="Recebe os e-mails disparados durante o teste"/></div>
          <div><label class="fl">Espera por ação</label><select class="fsel" id="qaRealEspera" title="Tempo máximo esperando a resposta de cada ação"><option value="30000">30 s</option><option value="60000" selected>60 s</option><option value="120000">120 s (IA/vídeo)</option></select></div>
          <div><label class="fl">Ações por tela</label><select class="fsel" id="qaRealMax" title="Limite de botões executados por tela"><option value="15">15</option><option value="40" selected>40</option><option value="80">80</option></select></div>
          <div><label class="fl">Só telas com…</label><input class="fi" id="qaRealFiltro" placeholder="vazio = todas" title="Filtro pelo nome/id da tela"/></div>
        </div>
        <label style="display:block;margin-top:8px;"><input type="checkbox" id="qaRealIA" checked/> Incluir ações de IA (gera textos, imagens e vídeos de verdade — consome créditos de Claude/Ideogram)</label>
        <button class="btn btn-or" style="width:100%;margin-top:8px;" id="qaBtnReal" onclick="QA.real()">⚡ Executar todas as ações de verdade</button></div></div>
      <div class="panel"><div class="ph"><div class="pt">📣 Marketing ponta a ponta</div><span style="font-size:10px;color:var(--t2);">gera · publica · confere · apaga · analisa leads</span></div><div class="pb" style="font-size:11px;color:var(--t2);line-height:1.6;">
        Gera uma campanha de teste (copy por rede, imagem, Stories e roteiro de Reel), testa o link e a página de captura (visita e lead em modo teste, sem e-mail/HubSpot/WhatsApp), <b>publica de verdade</b> um post marcado <b>[TESTE ATLANTYX]</b> pelo Metricool, confere o resultado nas redes e o link publicado, <b>apaga o post</b> e no fim analisa por que as campanhas não estão gerando leads. Usa IA (cerca de 8 chamadas) e 1 imagem.
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:8px;">
          <span>Publicar o teste em:</span>
          <label><input type="checkbox" class="qaMktRede" value="linkedin" checked/> LinkedIn</label>
          <label><input type="checkbox" class="qaMktRede" value="facebook" checked/> Facebook</label>
          <label><input type="checkbox" class="qaMktRede" value="instagram"/> Instagram</label>
          <label title="Só gera e testa links/captura; não publica nada"><input type="checkbox" id="qaMktSemPublicar"/> não publicar</label>
          <button class="btn btn-or" style="margin-left:auto;" id="qaBtnMkt" onclick="QA.marketing()">▶ Rodar teste de marketing</button>
          <button class="btn btn-g" id="qaBtnLeads" onclick="QA.analiseLeads()">🔎 Só a análise de leads</button></div>
        <div id="qaMktPassos" style="margin-top:8px;"></div></div></div>
      <div id="qaResultado"></div>
      <div class="panel"><div class="ph"><div class="pt">Execuções anteriores</div><button class="btn btn-g" style="font-size:9px;padding:3px 8px;" onclick="QA.historico()">↻</button></div><div class="pb" id="qaHist" style="font-size:11px;color:var(--t3);">—</div></div>`;
  }
  function render() {
    const box = document.getElementById('qaResultado'); if (!box) return;
    const R = S.relatorio, SEG = S.seg, C = S.crud;
    let topo = '';
    if (S.relatorio?.versao_desatualizada) topo += `<div class="panel" style="border-left:4px solid var(--gold);"><div class="pb" style="color:var(--gold);font-size:11.5px;">⚠ Esta varredura rodou com a versão ${esc(S.relatorio.versao_desatualizada.aba)} carregada nesta aba, mas o sistema publicado está na ${esc(S.relatorio.versao_desatualizada.publicada)}. Recarregue a página (Ctrl+Shift+R) e rode de novo — vários achados podem já estar corrigidos.</div></div>`;
    if (S.erro) topo += `<div class="panel" style="border-left:4px solid var(--red);"><div class="pb" style="color:var(--red);font-size:11.5px;">⚠ ${esc(S.erro)}</div></div>`;
    if (S.avisoSalvar) topo += `<div class="panel" style="border-left:4px solid var(--gold);"><div class="pb" style="color:var(--gold);font-size:11px;">${esc(S.avisoSalvar)}</div></div>`;
    if (S.parcial && !R) topo += `<div class="panel" style="border-left:4px solid var(--gold);"><div class="pb" style="font-size:11.5px;">A última varredura foi <b>interrompida</b> na tela "${esc(S.parcial.ultima)}" (${S.parcial.feitas} de ${S.parcial.total}). <button class="btn btn-g" style="font-size:10px;margin-left:8px;" onclick="QA.usarParcial()">Ver resultados parciais</button></div></div>`;
    const MK = S.mkt;
    if (!R && !SEG && !C && !MK) { box.innerHTML = topo + `<div class="panel"><div class="ph"><div class="pt">📋 Relatório de correção para o Claude</div></div><div class="pb" style="font-size:11px;color:var(--t2);">Rode a varredura de telas, o CRUD real ou a varredura de segurança — o relatório detalhado e o botão <b>✅ Aprovar e enviar para correção automática</b> aparecem aqui. Também é possível abrir uma execução anterior no histórico abaixo.</div></div>`; return; }
    const cor = s => ({ 'crítica': 'var(--red)', 'alta': 'var(--red)', 'média': 'var(--gold)', 'baixa': 'var(--blue)', 'info': 'var(--t3)' }[s] || 'var(--t2)');
    let h = '';
    if (R) {
      const r = R.resumo;
      h += `<div class="kg k5" style="margin-bottom:10px;">${['crítica', 'alta', 'média', 'baixa', 'info'].map(s => `<div class="kpi ${s === 'alta' || s === 'crítica' ? 'or' : s === 'média' ? 'gd' : 'bl'}"><div class="kl">${s}</div><div class="kv">${r[s] || 0}</div></div>`).join('')}</div>
      <div class="panel"><div class="ph"><div class="pt">Achados da varredura — ${R.total_telas} telas em ${R.duracao_s}s${R.repouso_s ? ' (' + R.repouso_s + 's em repouso)' : ''}${R.interrompido ? ' (interrompida)' : ''}</div>
        <select class="fsel" style="width:150px;" onchange="QA._filtro=this.value;QA.render()"><option value="">todas as severidades</option>${['crítica', 'alta', 'média', 'baixa', 'info'].map(s => `<option ${QA._filtro === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="pb" style="max-height:55vh;overflow-y:auto;">${R.achados.filter(a => !QA._filtro || a.sev === QA._filtro).map(a => `<div style="border-left:3px solid ${cor(a.sev)};background:var(--bg4);border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:11px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;"><b>${a.id}</b><span style="color:${cor(a.sev)};font-weight:700;">${a.sev}</span><span style="color:var(--t2);">${esc(a.cat)}</span><span style="margin-left:auto;color:var(--t2);cursor:pointer;text-decoration:underline;" onclick="nav('${esc(a.tela)}',document.querySelector('.sbi[onclick*=&quot;\\'${esc(a.tela)}\\'&quot;]'))">${esc(a.rotulo)}</span></div>
          <div style="font-weight:600;margin:3px 0;">${esc(a.titulo)}</div>${a.evidencia ? `<div style="color:var(--t2);font-family:var(--M);font-size:10px;word-break:break-word;">${esc(a.evidencia)}</div>` : ''}${a.sugestao ? `<div style="color:var(--blue);font-size:10.5px;margin-top:3px;">→ ${esc(a.sugestao)}</div>` : ''}</div>`).join('') || '<div style="color:var(--t3);">Nenhum achado.</div>'}</div></div>
      ${R.real ? acoesHtml(R) : ''}
      ${R.formularios_ligados?.length ? `<details class="panel" style="padding:10px 14px;"><summary style="cursor:pointer;font-size:11px;">✓ ${R.formularios_ligados.length} formulário(s) ligados corretamente à API (gravação interceptada)</summary><div style="font-size:10.5px;color:var(--t2);margin-top:6px;">${R.formularios_ligados.map(f => `${esc(f.tela)} · "${esc(f.botao)}" → ${esc(f.chamadas)}`).join('<br>')}</div></details>` : ''}`;
    }
    if (MK) h += mktHtml(MK, cor);
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

  function acoesHtml(R) {
    const A = R.acoes || []; const cont = A.reduce((o, a) => { o[a.resultado] = (o[a.resultado] || 0) + 1; return o; }, {});
    const corR = r => /^ok/.test(r) ? 'var(--green)' : r === 'pulado' ? 'var(--t3)' : /externo|sem efeito|dados/.test(r) ? 'var(--gold)' : 'var(--red)';
    const porTela = {}; A.forEach(a => { (porTela[a.tela] = porTela[a.tela] || []).push(a); });
    const L = R.limpeza || {};
    const janela = Object.entries(L.criadas_na_janela || {});
    return `<div class="panel"><div class="ph"><div class="pt">⚡ Execução real — ${A.length} ações</div><span style="font-size:10.5px;">${Object.entries(cont).map(([k, v]) => `<span style="color:${corR(k)};margin-left:8px;">${esc(k)}: <b>${v}</b></span>`).join('')}</span></div><div class="pb">
      <div style="max-height:45vh;overflow:auto;">${Object.entries(porTela).map(([tela, l]) => `<details style="border-bottom:1px solid var(--bd);padding:4px 0;" ${l.some(a => !/^ok|pulado/.test(a.resultado)) ? 'open' : ''}><summary style="cursor:pointer;font-size:11px;"><b>${esc(l[0].rotulo || tela)}</b> <span style="color:var(--t2);">· ${l.length} ações · ${l.filter(a => /^ok/.test(a.resultado)).length} ok${l.some(a => !/^ok|pulado/.test(a.resultado)) ? ` · <b style="color:var(--red);">${l.filter(a => !/^ok|pulado/.test(a.resultado)).length} com problema</b>` : ''}</span></summary>
        ${l.map(a => `<div style="display:flex;gap:8px;font-size:10.5px;padding:2px 0 2px ${a.nivel ? 18 : 6}px;"><span style="width:120px;color:${corR(a.resultado)};font-weight:600;">${esc(a.resultado)}</span><span style="width:200px;">${a.nivel ? '↳ ' : ''}${esc(a.acao)}</span><span style="flex:1;color:var(--t2);word-break:break-word;">${esc(a.detalhe || a.chamadas || '')}${a.ms ? ` <span style="color:var(--t3);">(${(a.ms / 1000).toFixed(1)}s)</span>` : ''}</span></div>`).join('')}</details>`).join('') || 'Nenhuma ação executada.'}</div>
      <div style="margin-top:10px;font-size:11px;background:var(--bg4);border-radius:6px;padding:8px 10px;line-height:1.6;"><b>🧹 Limpeza</b> — ${L.erro ? `<span style="color:var(--red);">falhou: ${esc(L.erro)}</span>` : `linhas de teste apagadas: ${Object.entries(L.apagadas || {}).map(([k, v]) => esc(k) + ' ' + esc(v)).join(', ') || 'nenhuma'} · configurações restauradas: ${(L.kv?.restauradas || []).length} · listas limpas: ${(L.kv?.limpas || []).length}`}
        ${janela.length ? `<div style="margin-top:4px;">Criados durante o teste <b>sem a marca</b> (ex.: Auto-campanha, relatórios gerados) — confira e, se forem só do teste, apague:<br>${janela.map(([k, v]) => `<label style="margin-right:12px;"><input type="checkbox" class="qaJanela" value="${esc(k)}"/> ${esc(k)} (${v})</label>`).join('')}
          <button class="btn btn-g" style="font-size:10px;margin-left:6px;" onclick="QA.apagarJanela()">Apagar os marcados</button><span id="qaJanelaMsg" style="margin-left:8px;"></span></div>` : ''}</div>
    </div></div>`;
  }
  // ── Marketing ponta a ponta ─────────────────────────────────────────────
  function mktHtml(MK, cor) {
    const F = MK.leads?.funil || {};
    return `<div class="panel"><div class="ph"><div class="pt">📣 Marketing ponta a ponta ${MK.rodando ? '<span style="color:var(--gold);">em andamento…</span>' : ''}</div><span style="font-size:10px;color:var(--t2);">${MK.ctx?.campanha_id ? 'campanha ' + esc(MK.ctx.campanha_id) : ''}${MK.ctx?.metricool_id ? ' · post ' + esc(MK.ctx.metricool_id) : ''}</span></div><div class="pb">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px;margin-bottom:10px;">${MK.passos.map(p => `<div style="background:var(--bg4);border-radius:6px;padding:7px 9px;font-size:10.5px;border-left:3px solid ${p.ok === false ? 'var(--red)' : p.ok ? 'var(--green)' : 'var(--gold)'};"><b>${p.ok === false ? '✗' : p.ok ? '✓' : '…'} ${esc(p.passo)}</b>${p.ms ? ' <span style="color:var(--t3);">' + Math.round(p.ms / 1000) + 's</span>' : ''}<div style="color:var(--t2);margin-top:2px;word-break:break-word;">${esc(p.resumo || '')}</div></div>`).join('')}</div>
      ${(MK.ctx?.urls_publicas || []).length ? `<div style="font-size:11px;margin-bottom:8px;">Post publicado: ${MK.ctx.urls_publicas.map(u => `<a href="${esc(u.url)}" target="_blank" rel="noopener" style="color:var(--blue);">${esc(u.rede)} ↗</a>`).join(' · ')}</div>` : ''}
      ${(MK.achados || []).map((a, i) => `<div style="border-left:3px solid ${cor(a.sev)};background:var(--bg4);border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:11px;"><b>MKT-${String(i + 1).padStart(3, '0')}</b> <span style="color:${cor(a.sev)};font-weight:700;">${a.sev}</span> <span style="color:var(--t2);">${esc(a.onde || '')}</span><div style="font-weight:600;margin:3px 0;">${esc(a.titulo)}</div>${a.evidencia ? `<div style="color:var(--t2);font-family:var(--M);font-size:10px;word-break:break-word;">${esc(a.evidencia)}</div>` : ''}${a.sugestao ? `<div style="color:var(--blue);font-size:10.5px;margin-top:3px;">→ ${esc(a.sugestao)}</div>` : ''}</div>`).join('')}
      ${MK.leads ? `<div style="margin-top:10px;font-weight:700;font-size:12px;">🔎 Por que as campanhas não geram leads (30 dias)</div>
        <div class="kg k5" style="margin:8px 0;">${[['Publicações', F.publicacoes_30d], ['Impressões', F.impressoes], ['Cliques', F.cliques], ['Visitas na captura', F.visitas_30d], ['Leads', F.leads_30d]].map(([k, v]) => `<div class="kpi bl"><div class="kl">${k}</div><div class="kv">${v ?? 'n/d'}</div></div>`).join('')}</div>
        <div style="font-size:10.5px;color:var(--t2);margin-bottom:6px;">Destino dos links publicados: ${Object.entries(F.por_destino || {}).map(([k, v]) => `${esc(k)} <b>${v}</b>`).join(' · ') || '—'} · sem UTM: <b>${F.sem_utm ?? '—'}</b></div>
        <ol style="font-size:11px;line-height:1.6;padding-left:18px;margin:0;">${(MK.leads.causas || []).map(c => `<li><b>${esc(c.causa)}</b> — <span style="color:var(--t2);">${esc(c.evidencia)}</span><br><span style="color:var(--blue);">→ ${esc(c.acao)}</span></li>`).join('')}</ol>
        ${MK.leads.parecer ? `<div style="margin-top:8px;background:var(--bg4);border-radius:6px;padding:9px 11px;font-size:11px;white-space:pre-wrap;line-height:1.6;">${esc(MK.leads.parecer)}</div>` : ''}` : ''}
    </div></div>`;
  }
  const _resumoPasso = r => {
    const p = r.passo;
    if (p === 'preflight') return `Metricool ${r.metricool?.configurado ? 'ok' : 'NÃO configurado'} · redes: ${(r.metricool?.redes || []).join(', ') || 'nenhuma'} · captura HTTP ${r.captura?.status}`;
    if (p === 'campanha') return r.fase1?.ok ? 'narrativa + copy gerados' : 'falhou';
    if (p === 'campanha_redes') return r.fase2?.ok ? `copy por rede: ${(r.amostra?.redes || []).join(', ')} · gravada no banco: ${r.persistencia?.ok ? 'sim' : 'NÃO'}` : 'falhou';
    if (p === 'imagem') return r.gerador?.url ? `${r.gerador.provedor} · permanente: ${r.gerador.permanente ? 'sim' : 'NÃO'}` : 'falhou';
    if (p === 'stories') return `${r.pack?.n || 0} stories · arte: ${r.arte?.url ? 'ok' : 'não'}`;
    if (p === 'reel') return `${r.pack?.slides || 0} slides · legenda ${r.pack?.legenda ? 'ok' : 'não'}`;
    if (p === 'link') return `formulário ${r.pagina?.tem_formulario ? 'ok' : 'NÃO'} · visita ${r.visita?.gravada ? 'gravada' : 'NÃO'} · lead ${r.lead?.gravado ? 'gravado (' + r.lead.origem + ' / ' + r.lead.campanha + ')' : 'NÃO'}`;
    if (p === 'publicar') return r.publicacao?.metricool_id ? `enviado ao Metricool (${(r.publicacao.redes || []).join(', ')})` : 'não publicado';
    if (p === 'verificar') return r.post ? `status ${r.post.status} · ${(r.post.providers || []).map(x => x.rede + ': ' + (x.status || '?')).join(' · ')}${r.link_destino ? ' · link → ' + (r.link_destino.final || '').substring(0, 60) : ''}` : `aguardando (${r.minutos_desde_publicacao} min)`;
    if (p === 'apagar') return r.exclusao ? (r.exclusao.ok ? 'post apagado' : 'NÃO apagou') : 'nada a apagar';
    if (p === 'limpar') return r.campanha_removida ? 'campanha de teste removida' : '—';
    if (p === 'analise_leads') return `${(r.causas || []).length} causa(s) identificadas`;
    return '';
  };
  async function rodarMarketing(soAnalise) {
    if (S.rodando) return; S.rodando = true; S.erro = null;
    const semPub = !!document.getElementById('qaMktSemPublicar')?.checked;
    const redes = [...document.querySelectorAll('.qaMktRede:checked')].map(x => x.value);
    let blog = null; try { blog = localStorage.getItem('atx:metricool_blog_id'); } catch (_) {}
    const MK = S.mkt = { em: Date.now(), rodando: true, passos: [], achados: [], ctx: { blog_id: blog || null, redes_teste: redes }, leads: null };
    const plano = soAnalise ? ['analise_leads'] : ['preflight', 'campanha', 'campanha_redes', 'imagem', 'stories', 'reel', 'link', ...(semPub ? [] : ['publicar', 'verificar', 'apagar']), 'limpar', 'analise_leads'];
    const mostrar = () => { const box = document.getElementById('qaMktPassos'); if (box) box.innerHTML = `<div style="font-size:10.5px;color:var(--t2);">${MK.passos.map(p => `${p.ok === false ? '✗' : p.ok ? '✓' : '…'} ${esc(p.passo)}`).join(' → ')}</div>`; render(); };
    try {
      for (const passo of plano) {
        if (passo === 'verificar' && !MK.ctx.metricool_id) continue;
        if (passo === 'apagar' && !MK.ctx.metricool_id) continue;
        const reg = { passo, ok: null }; MK.passos.push(reg); mostrar();
        let r = null; const t0 = Date.now();
        for (let tent = 0; tent < 20; tent++) {
          r = await api('mkt_passo', { passo, ctx: MK.ctx });
          MK.ctx = r.ctx || MK.ctx;
          if (passo !== 'verificar' || r.pronto) break;
          reg.resumo = _resumoPasso(r); mostrar();
          await sleep(30000);   // espera a rede publicar (até ~10 min)
        }
        reg.ms = Date.now() - t0; reg.ok = r.ok !== false && !(r.achados || []).some(a => a.sev === 'crítica'); reg.resumo = _resumoPasso(r);
        (r.achados || []).forEach(a => MK.achados.push({ ...a, passo }));
        if (passo === 'analise_leads') MK.leads = { funil: r.funil, causas: r.causas, parecer: r.parecer, auditoria: r.auditoria };
        mostrar();
        if (r.ok === false && ['preflight', 'campanha'].includes(passo) && !soAnalise) { if (passo === 'campanha') continue; }
      }
    } catch (e) { S.erro = 'Teste de marketing parou: ' + e.message; MK.passos.push({ passo: 'erro', ok: false, resumo: e.message });
      // garantia: se publicou e parou no meio, tenta apagar o post de teste
      if (MK.ctx.metricool_id && !MK.passos.some(p => p.passo === 'apagar')) { try { const r = await api('mkt_passo', { passo: 'apagar', ctx: MK.ctx }); MK.passos.push({ passo: 'apagar', ok: !!r.exclusao?.ok, resumo: _resumoPasso(r) }); } catch (_) {} }
    }
    const ordem = { 'crítica': 0, 'alta': 1, 'média': 2, 'baixa': 3, 'info': 4 }; MK.achados.sort((a, b) => ordem[a.sev] - ordem[b.sev]);
    MK.rodando = false; S.rodando = false; mostrar();
    try { await api('salvar_execucao', { tipo: 'marketing', relatorio: { resumo: MK.achados.reduce((o, a) => { o[a.sev] = (o[a.sev] || 0) + 1; return o; }, {}), marketing: MK } }); QA.historico(); } catch (_) {}
    toast(MK.achados.length ? `Marketing: ${MK.achados.length} achado(s)` : 'Marketing: tudo OK', MK.achados.some(a => a.sev === 'crítica' || a.sev === 'alta') ? 'error' : 'success');
  }

  window.QA = {
    _classificar: (u, i) => classificar(u, i),
    _filtro: '',
    abrir() { const p = document.getElementById('qaApp'); if (p && !p.dataset.ok) { p.innerHTML = painelHtml(); p.dataset.ok = '1'; this.historico(true);
        try { const c = JSON.parse(localStorage.getItem('qa:real_contatos') || '{}'); if (c.fone) document.getElementById('qaRealFone').value = c.fone; if (c.email) document.getElementById('qaRealEmail').value = c.email; } catch (_) {} }
      try { const pc = JSON.parse(sessionStorage.getItem('qa_parcial') || 'null'); if (pc && !S.rodando) S.parcial = pc; } catch (_) {}
      render(); },
    usarParcial() { const pc = S.parcial; if (!pc) return; montarRelatorio(pc.achados || [], pc.porTela || [], null, null, pc.em - 1000, true); S.parcial = null; try { sessionStorage.removeItem('qa_parcial'); } catch (_) {} render(); },
    render,
    iniciar() {
      if (!confirm('Iniciar a varredura de todas as telas?\n\nO sistema vai navegar sozinho por alguns minutos. Gravações, envios e chamadas de IA ficam bloqueados (modo seguro). Não use o sistema durante a varredura.')) return;
      const opts = { botoes: document.getElementById('qaOptBot').checked, formularios: document.getElementById('qaOptForm').checked, contraste: document.getElementById('qaOptCont').checked, doisTemas: document.getElementById('qaOptTemas').checked, larguras: !!document.getElementById('qaOptLarg')?.checked, filtro: document.getElementById('qaFiltro').value.trim(), espera: +document.getElementById('qaEspera').value };
      varrer(opts);
    },
    real() {
      const fone = document.getElementById('qaRealFone').value.trim(), email = document.getElementById('qaRealEmail').value.trim();
      if (fone && fone.replace(/\D/g, '').length < 10) { toast('WhatsApp de teste inválido (DDD + número)', 'error'); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { toast('E-mail de teste inválido', 'error'); return; }
      try { localStorage.setItem('qa:real_contatos', JSON.stringify({ fone, email })); } catch (_) {}
      const ia = document.getElementById('qaRealIA').checked;
      if (!confirm('Executar TODAS as ações de verdade?\n\n• Cada botão de cada tela será executado e avaliado (pode levar de 30 min a algumas horas).\n• WhatsApp e e-mail: ' + (fone || email ? 'só para ' + [fone, email].filter(Boolean).join(' e ') : 'SIMULADOS (sem contatos de teste)') + '.\n• QuickBooks, HubSpot, Metricool: simulados.\n• Excluir/aprovar/pagar/publicar: só nos registros criados pelo teste.\n' + (ia ? '• IA ligada: consome créditos de Claude e Ideogram.\n' : '') + '• No fim, os dados de teste são apagados.\n\nNão use o sistema enquanto roda.')) return;
      varrer({ real: true, fone, email, ia, espera: 12000, esperaAcao: +document.getElementById('qaRealEspera').value, maxAcoes: +document.getElementById('qaRealMax').value, filtro: document.getElementById('qaRealFiltro').value.trim(), contraste: false, larguras: false });
    },
    async apagarJanela() { const tabs = [...document.querySelectorAll('.qaJanela:checked')].map(x => x.value); const m = document.getElementById('qaJanelaMsg');
      if (!tabs.length) return; if (!confirm('Apagar o que foi criado durante o teste em: ' + tabs.join(', ') + '?\n\nSó registros com data de criação dentro da janela do teste.')) return;
      try { const d = await api('real_apagar_janela', { run_id: S.relatorio?.run_id, tabelas: tabs }); m.innerHTML = '<span style="color:var(--green);">apagados: ' + esc(Object.entries(d.apagadas).map(([k, v]) => k + ' ' + v).join(', ')) + '</span>'; } catch (e) { m.innerHTML = '<span style="color:var(--red);">' + esc(e.message) + '</span>'; } },
    parar() { S.parar = true; },
    // v3.45: varredura noturna sem pessoa (GitHub Actions, 03h): modo seguro — gravações, envios e IA bloqueados
    async noturno(o = {}) {
      if (S.rodando) throw new Error('já existe uma varredura em andamento');
      await varrer({ botoes: true, formularios: true, contraste: false, doisTemas: false, larguras: false, filtro: '', espera: 10000, semConfirmar: true, ...o });
      const R = S.relatorio || {};
      return { versao: R.versao, duracao_s: R.duracao_s, repouso_s: R.repouso_s, total_telas: R.total_telas, resumo: R.resumo, interrompido: !!R.interrompido, erro: S.erro || null,
        achados: (R.achados || []).map(a => ({ id: a.id, sev: a.sev, cat: a.cat, titulo: a.titulo, evidencia: a.evidencia, sugestao: a.sugestao, tela: a.tela, rotulo: a.rotulo, ganchos: a.ganchos })) };
    },
    marketing() {
      const sem = !!document.getElementById('qaMktSemPublicar')?.checked;
      const redes = [...document.querySelectorAll('.qaMktRede:checked')].map(x => x.value);
      if (!sem && !redes.length) { toast('Marque ao menos uma rede (ou "não publicar")', 'error'); return; }
      if (!confirm(sem ? 'Rodar o teste de marketing SEM publicar?\n\nGera campanha, imagem, Stories e Reel de teste (usa IA), testa link e captura em modo teste e analisa os leads.'
        : `Rodar o teste de marketing COMPLETO?\n\nVai PUBLICAR DE VERDADE um post marcado [TESTE ATLANTYX] em: ${redes.join(', ')} — e apagá-lo logo depois de conferir.\nLeva de 5 a 15 minutos. Usa IA (~8 chamadas) e 1 imagem.`)) return;
      document.getElementById('qaBtnMkt').disabled = true; rodarMarketing(false).finally(() => { const b = document.getElementById('qaBtnMkt'); if (b) b.disabled = false; });
    },
    analiseLeads() { const b = document.getElementById('qaBtnLeads'); if (b) b.disabled = true; rodarMarketing(true).finally(() => { if (b) b.disabled = false; }); },
    async crud() { const b = document.getElementById('qaBtnCrud'); if (!confirm('Rodar o CRUD real?\n\nVai criar, alterar e excluir registros marcados "QA-TESTE" no banco de produção (com limpeza garantida no final).')) return;
      b.disabled = true; b.textContent = 'Rodando...'; S.erro = null; try { S.crud = (await api('crud_suite')); delete S.crud.success; toast(S.crud.ok ? 'CRUD real: todos os ciclos OK' : 'CRUD real: há falhas', S.crud.ok ? 'success' : 'error'); } catch (e) { S.erro = 'CRUD real não rodou: ' + e.message; toast('Erro: ' + e.message, 'error'); } b.disabled = false; b.textContent = '🧪 Rodar CRUD real'; render(); },
    async seguranca() { const b = document.getElementById('qaBtnSeg'); b.disabled = true; b.textContent = 'Varrendo (até 1 min)...'; S.erro = null;
      try { const d = await api('seguranca'); delete d.success; d.versao = document.getElementById('sidebarBuildId')?.textContent || ''; S.seg = d; try { await api('salvar_execucao', { tipo: 'seguranca', relatorio: d }); } catch (_) {} toast('Varredura de segurança concluída', 'success'); }
      catch (e) { S.erro = 'Varredura de segurança não concluiu: ' + e.message; toast('Erro: ' + e.message, 'error'); } b.disabled = false; b.textContent = '🛡 Rodar varredura de segurança'; render(); this.historico(); },
    async historico(abrirUltima) { const el = document.getElementById('qaHist'); if (!el) return; try { const d = await api('listar_execucoes');
      if (abrirUltima && !S.relatorio && !S.seg && (d.execucoes || []).length) { const u = d.execucoes[0]; this.carregar(u.id, u.tipo); } el.innerHTML = (d.execucoes || []).map(x => `<div style="padding:4px 0;border-bottom:1px solid var(--bd);display:flex;gap:8px;"><span>${x.tipo === 'seguranca' ? '🛡' : '🧪'} ${new Date(x.em).toLocaleString('pt-BR')}</span><span style="color:var(--t2);">${x.resumo ? Object.entries(x.resumo).map(([k, v]) => k + ': ' + v).join(' · ') : ''}</span><a href="#" style="margin-left:auto;color:var(--blue);" onclick="QA.carregar('${x.id}','${x.tipo}');return false;">abrir</a></div>`).join('') || 'Nenhuma execução ainda.'; } catch (e) { el.textContent = 'Histórico indisponível: ' + e.message; } },
    async carregar(id, tipo) { try { const d = await api('obter_execucao', { id }); if (tipo === 'seguranca') S.seg = d.relatorio; else if (tipo === 'marketing') S.mkt = d.relatorio?.marketing || null; else { S.relatorio = d.relatorio; if (d.relatorio?.seguranca) S.seg = d.relatorio.seguranca; if (d.relatorio?.crud) S.crud = d.relatorio.crud; } render(); } catch (e) { toast('Erro: ' + e.message, 'error'); } },
    baixarMd() { baixar('relatorio-correcao-atlantyx-' + new Date().toISOString().substring(0, 16).replace(/[:T]/g, '-') + '.md', document.getElementById('qaMd')?.value || markdown(), 'text/markdown'); },
    baixarJson() { baixar('relatorio-qa-atlantyx.json', JSON.stringify({ qa: S.relatorio, crud: S.crud, seguranca: S.seg, marketing: S.mkt }, null, 2), 'application/json'); },
    async aprovar() {
      const md = document.getElementById('qaMd')?.value || markdown(); const msg = document.getElementById('qaAprovMsg');
      if (!confirm('Aprovar este relatório e enviar para correção automática?\n\nSerá aberta uma tarefa no GitHub para o Claude corrigir. A nova versão só vai ao ar quando você aprovar o pull request.')) return;
      msg.innerHTML = '<span style="color:var(--blue);">Abrindo a tarefa no GitHub...</span>';
      try { const tot = S.relatorio ? S.relatorio.achados.filter(a => a.sev !== 'info').length : 0, seg = S.seg ? (S.seg.achados || []).length : 0;
        const d = await api('abrir_correcao', { titulo: `Correções do agente de QA/Segurança — ${tot} QA, ${seg} segurança (${new Date().toLocaleDateString('pt-BR')})`, corpo: md });
        msg.innerHTML = `<span style="color:var(--green);">✓ Tarefa #${d.issue} aberta: <a href="${esc(d.url)}" target="_blank" rel="noopener" style="color:var(--blue);">${esc(d.url)}</a>. O Claude vai abrir um pull request; aprove-o no GitHub para gerar a nova versão.</span>`; }
      catch (e) { msg.innerHTML = '<span style="color:var(--red);">Não foi possível abrir a tarefa: ' + esc(e.message) + '</span><div style="color:var(--t2);margin-top:4px;">Você pode copiar o relatório e colar no chat do Claude.</div>'; }
    },
    _markdown: markdown, _classificar: classificar, _inventario: inventario, _rodando: () => !!S.rodando,
  };
})();
