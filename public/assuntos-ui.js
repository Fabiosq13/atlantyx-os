// v3.564 — ASSUNTOS · tela do ATLAS por assunto (abas, opções numeradas, "Precisa de você", biblioteca do que o ATLAS criou, barra embaixo)
// Dados reais: só o que o ATLAS criou (api/s1-intel atlas_*). Rascunho (só você) → Em teste → Publicado no assunto. Agente/tela exigem aprovação do dono.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const dt = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  async function api(action, payload = {}) {
    const r = await fetch('/api/s1-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'Demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (d.success === false || !r.ok) throw new Error(d.error || 'falha'); return d;
  }
  const TABS = ['comercial', 'marketing', 'financeiro', 'projetos', 'estrategia', 'integracoes'];
  const ICO = { comercial: '🤝', marketing: '📣', financeiro: '💰', projetos: '🗂️', estrategia: '🧭', integracoes: '🔌', pessoas: '👥', juridico: '⚖️', dados: '🗄️', produtos: '📦' };
  const TICO = { agente: '🤖', relatorio: '📄', analise: '🔎', tela: '🖥️' };
  const EST = { rascunho: ['Rascunho · só você', 'pe'], teste: ['Em teste', 'te'], publicado: ['Publicado', 'ok'] };
  // Opções numeradas (teclas 1–9 e 0): "ir" abre uma tela que já existe; "pedir" pede algo novo ao ATLAS.
  const OPC = {
    marketing: [
      ['Ver', 'Análise de Marketing', 'Leitura dos dados e plano', { ir: 's1marketing' }], ['Ver', 'Campanhas de Marketing', 'Orgânico e pago', { ir: 's2macro' }], ['Ver', 'Kanban de posts', 'Calendário e aprovação', { ir: 's2kanban' }],
      ['Criar', 'Post com imagem', 'O ATLAS escreve, você aprova', { pedir: ['agente', 'Agente que prepara toda semana 3 rascunhos de posts sobre IA para empresas de energia, para eu aprovar'] }], ['Criar', 'Campanha paga', 'Nasce sempre pausada', { ir: 's2campanha' }], ['Criar', 'Página de captura', 'Para webinar ou oferta', { pedir: ['tela', 'Página de captura simples para um webinar, com formulário e confirmação'] }],
      ['Gerar', 'Relatório de custo por lead', 'Por campanha e canal', { pedir: ['relatorio', 'Relatório semanal de Marketing: leads por origem, custo por lead por campanha e reuniões geradas'] }], ['Gerar', 'Resumo para o conselho', 'Leads, reuniões e investimento', { pedir: ['analise', 'Resumo de Marketing para o conselho de segunda: o que funcionou, o que está caro e o que fazer'] }],
      ['Conectar', 'Metricool e Ideogram', 'Agenda, métricas e imagens', { ir: 's2social' }], ['Conectar', 'Ações do sistema', 'Aprovar o que a IA propõe', { ir: 's1acoessis' }]],
    financeiro: [
      ['Ver', 'Realizado QuickBooks', 'O que já aconteceu', { ir: 's3realizado' }], ['Ver', 'Fluxo futuro 12 meses', 'Caixa e competência', { ir: 's3fluxo' }], ['Ver', 'Agenda de despesas', 'Pagamentos do mês', { ir: 's3agenda' }],
      ['Criar', 'Agente de cobrança', 'Só gera rascunho', { pedir: ['agente', 'Agente que lista toda manhã os recebíveis vencidos e prepara rascunhos de cobrança, sem enviar nada'] }], ['Criar', 'Gerente Financeiro IA', 'Pergunte com os números reais', { ir: 's3gerente' }],
      ['Gerar', 'Relatório de caixa da semana', 'Saldo, a pagar e a receber', { pedir: ['relatorio', 'Relatório semanal de caixa: saldo, contas a pagar e a receber dos próximos 15 dias e alertas'] }], ['Gerar', 'Análise de margem', 'Por projeto e por mês', { pedir: ['analise', 'Análise de margem por projeto e onde estamos abaixo da meta de 35%'] }],
      ['Conectar', 'Conciliação bancária', 'Status no QuickBooks', { ir: 's3conciliacao' }], ['Conectar', 'Remessa de pagamentos', 'CNAB', { ir: 's3cnab' }]],
    comercial: [
      ['Ver', 'Floresta de vendas', 'Kanban de leads e negócios', { ir: 's7floresta' }], ['Ver', 'Painel de vendas IA', 'Funil e metas', { ir: 's7painel' }], ['Ver', 'Leads esquecidos', 'Quem parou de ser trabalhado', { ir: 's7esquecidos' }],
      ['Criar', 'Proposta', 'Elaboração com IA', { ir: 's7propostas' }], ['Criar', 'Agente de follow-up', 'Só gera rascunho de e-mail', { pedir: ['agente', 'Agente que identifica leads sem contato há 7 dias e prepara rascunhos de follow-up, sem enviar'] }],
      ['Gerar', 'Relatório do funil', 'Etapas, conversão e ticket', { pedir: ['relatorio', 'Relatório semanal do funil comercial: leads por etapa, conversão, ticket médio e negócios parados'] }], ['Gerar', 'Análise de perdas', 'Por que não fechamos', { pedir: ['analise', 'Análise dos motivos de perda de negócios e o que mudar na abordagem'] }],
      ['Conectar', 'HubSpot', 'Atualizar do CRM', { ir: 's7clientes' }]]
  };
  const GENERICO = a => [
    ['Gerar', 'Relatório de ' + a, 'O ATLAS monta com o que você pedir', { pedir: ['relatorio', 'Relatório semanal de ' + a + ' com os pontos que precisam de atenção'] }],
    ['Gerar', 'Análise de ' + a, 'Situação, riscos e recomendações', { pedir: ['analise', 'Análise da situação atual de ' + a + ' com riscos e recomendações'] }],
    ['Criar', 'Agente de ' + a, 'Roda sozinho, só com ações seguras', { pedir: ['agente', 'Agente que acompanha ' + a + ' toda semana e me avisa o que exige decisão'] }],
    ['Criar', 'Tela nova de ' + a, 'Vai para revisão antes de entrar no menu', { pedir: ['tela', 'Tela com o resumo de ' + a + ' e os itens que precisam de ação'] }]];

  const S = { cat: null, assunto: 'marketing', itens: [], aguardando: 0, atividade: null, sel: 0, tipo: 'analise', ocupado: false };
  const nomeA = k => (S.cat?.assuntos || {})[k] || k;
  const opcoes = () => (OPC[S.assunto] || GENERICO(nomeA(S.assunto))).map((o, i) => ({ g: o[0], t: o[1], s: o[2], a: o[3], n: (i + 1) % 10 }));

  async function abrir() {
    const box = $('asApp'); if (!box) return;
    try { if (!S.cat) S.cat = await api('atlas_catalogo'); await carregar(); } catch (e) { box.innerHTML = '<div style="padding:30px;color:#B42318;">Erro: ' + esc(e.message) + '</div>'; }
  }
  async function carregar() {
    const d = await api('atlas_listar', { assunto: S.assunto }); S.itens = d.itens || []; S.aguardando = d.aguardando || 0; S.atividade = d.atividade; render();
  }
  function trocar(a) { S.assunto = a; S.sel = 0; carregar().catch(e => nota(e.message, 'error')); }

  function render() {
    const box = $('asApp'); if (!box) return;
    const outros = Object.keys(S.cat.assuntos).filter(k => !TABS.includes(k));
    const O = opcoes(), grupos = ['Ver', 'Criar', 'Gerar', 'Conectar'].map(g => [g, O.filter(o => o.g === g)]).filter(x => x[1].length);
    const meus = S.itens.filter(i => i.meu && i.estado !== 'publicado'), aprov = S.itens.filter(i => i.aprovacao === 'pedida' && i.pode_aprovar && i.estado !== 'publicado');
    const pub = S.itens.filter(i => i.estado === 'publicado'), at = S.atividade || {};
    const prec = []; aprov.forEach(i => prec.push([i, 'Pedido de aprovação: ' + i.titulo, 'Quem pediu: ' + esc(i.criado_por) + '. Revise e publique ou devolva.', 'Revisar']));
    meus.filter(i => i.estado === 'rascunho' && !aprov.includes(i)).slice(0, 3).forEach(i => prec.push([i, 'Rascunho seu: ' + i.titulo, 'Só você vê. Teste e publique quando estiver bom.', 'Abrir']));
    box.innerHTML = '<div class="as-tabs">' + TABS.map(k => '<button class="as-tab' + (k === S.assunto ? ' on' : '') + '" onclick="ASSUNTOS.trocar(\'' + k + '\')">' + ICO[k] + ' ' + esc(nomeA(k)) + '</button>').join('')
      + '<select class="as-more" onchange="if(this.value)ASSUNTOS.trocar(this.value)"><option value="">Mais assuntos ▾</option>' + outros.map(k => '<option value="' + k + '"' + (k === S.assunto ? ' selected' : '') + '>' + esc(nomeA(k)) + '</option>').join('') + '</select></div>'
      + '<div class="as-hero"><div class="as-orb"></div><div><h1>' + esc(nomeA(S.assunto)) + ': <b>' + (pub.length ? pub.length + ' publicado(s)' : S.itens.length ? S.itens.length + ' item(ns) ainda não publicado(s)' : 'nada criado ainda') + '</b>' + (S.aguardando ? ' e <mark>' + S.aguardando + ' aguardando sua aprovação</mark>' : '') + '.</h1>'
      + '<div class="as-kp"><div><small>Publicados</small><b>' + pub.length + '</b></div><div><small>Em teste</small><b>' + S.itens.filter(i => i.estado === 'teste').length + '</b></div><div><small>Rascunhos</small><b>' + S.itens.filter(i => i.estado === 'rascunho').length + '</b></div><div><small>Criados hoje</small><b>' + (at.hoje || 0) + '</b></div></div></div></div>'
      + '<div class="as-body"><div class="as-left"><div class="as-groups">' + grupos.map(([g, L]) => '<div class="as-gc"><div class="as-gh">' + ({ Ver: '👁️', Criar: '➕', Gerar: '📄', Conectar: '🔌' }[g]) + ' ' + g + '</div>' + L.map(o => '<div class="as-o' + (O.indexOf(o) === S.sel ? ' sel' : '') + '" onclick="ASSUNTOS.exec(' + O.indexOf(o) + ')"><div class="n">' + o.n + '</div><div>' + esc(o.t) + '<small>' + esc(o.s) + '</small></div></div>').join('') + '</div>').join('') + '</div>'
      + '<div class="as-band"><div class="as-bh">Criado pelo ATLAS em ' + esc(nomeA(S.assunto)) + ' <span class="c">' + S.itens.length + '</span></div>'
      + (S.itens.length ? '<div class="as-mini">' + S.itens.slice(0, 8).map(i => '<div class="m" onclick="ASSUNTOS.ver(\'' + i.id + '\')"><div class="tp">' + TICO[i.tipo] + ' ' + esc(S.cat.tipos[i.tipo]) + ' <span class="as-st ' + EST[i.estado][1] + '">' + EST[i.estado][0] + '</span></div><b>' + esc(i.titulo) + '</b><small>Salvo em ' + esc(nomeA(S.assunto)) + ' › ' + esc(S.cat.pastas[i.tipo]) + ' · ' + dt(i.criado_em) + '</small></div>').join('') + '</div>' : '<div class="as-vazio">Nada ainda. Peça um relatório, uma análise, um agente ou uma tela na barra de baixo — tudo fica salvo aqui.</div>')
      + (at.total ? '<div class="as-act">No assunto: ' + at.total + ' item(ns) no total · ' + at.publicados + ' publicado(s)</div>' : '') + '</div></div>'
      + '<div class="as-right"><div class="as-sec">Precisa de você <span>' + prec.length + '</span></div>'
      + (prec.length ? prec.map(([i, t, p, b]) => '<div class="as-d' + (i.aprovacao === 'pedida' ? ' hot' : '') + '"><b>' + esc(t) + '</b><p>' + p + '</p><button class="as-bt p" onclick="ASSUNTOS.ver(\'' + i.id + '\')">' + b + '</button></div>').join('') : '<div class="as-d"><p style="margin:0">Nada esperando por você neste assunto.</p></div>')
      + '<div class="as-sec">Criar com o ATLAS, sob demanda</div><div class="as-d">' + [['relatorio', 'Relatório avulso', 'Um relatório só desta vez'], ['agente', 'Agente avulso', 'Uma rotina que roda sozinha'], ['analise', 'Análise avulsa', 'Pergunta de negócio com recomendações'], ['tela', 'Tela ou funcionalidade', 'Pedido para a Esteira de Demandas']].map(([t, a, b]) => '<div class="as-av" onclick="ASSUNTOS.avulso(\'' + t + '\')">' + TICO[t] + ' <span><b>' + a + '</b><small>' + b + '</small></span></div>').join('') + '<small class="as-nota">Tudo que o ATLAS criar fica salvo em ' + esc(nomeA(S.assunto)) + '.</small></div></div></div>'
      + '<div class="as-comp"><div class="as-ac" id="asAc"></div><div class="as-sug">' + ['Resumir a semana', 'Criar relatório avulso', 'Criar agente avulso', 'Analisar um tema', 'Criar uma tela nova'].map(t => '<span onclick="ASSUNTOS.sugerir(this.textContent)">✨ ' + t + '</span>').join('') + '</div>'
      + '<div class="as-bar"><span class="as-ctx">✨ Salva em ' + esc(nomeA(S.assunto)) + '</span><select id="asTipo" class="as-tipo">' + Object.entries(S.cat.tipos).map(([k, v]) => '<option value="' + k + '"' + (k === S.tipo ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>'
      + '<input id="asIn" placeholder="Digite um número, um assunto ou peça ao ATLAS…" autocomplete="off" oninput="ASSUNTOS.digitando(this.value)" onkeydown="ASSUNTOS.tecla(event)"/><kbd>⌘K</kbd><button class="as-send" onclick="ASSUNTOS.enviar()">' + (S.ocupado ? 'Criando…' : 'Enviar') + '</button></div></div>';
  }
  function exec(i) {
    const o = opcoes()[i]; if (!o) return; S.sel = i;
    if (o.a.ir) return nav(o.a.ir, document.querySelector(`.sbi[onclick*="'${o.a.ir}'"]`));
    const [t, p] = o.a.pedir; S.tipo = t; render(); const inp = $('asIn'); if (inp) { inp.value = p; inp.focus(); }
  }
  function sugerir(t) {
    const m = { 'Criar relatório avulso': ['relatorio', 'Relatório de ' + nomeA(S.assunto) + ': '], 'Criar agente avulso': ['agente', 'Agente que '], 'Analisar um tema': ['analise', 'Analise '], 'Criar uma tela nova': ['tela', 'Tela que mostre '], 'Resumir a semana': ['analise', 'Resuma a semana de ' + nomeA(S.assunto) + ' com o que exige decisão'] }[t];
    avulso(m[0], m[1]);
  }
  function avulso(tipo, texto) { S.tipo = tipo; const v = $('asIn')?.value; render(); const inp = $('asIn'); if (inp) { inp.value = texto || v || ''; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
  function digitando(v) {
    const ac = $('asAc'); if (!ac) return; const q = v.trim().toLowerCase();
    if (!q || /^\d$/.test(q)) { ac.style.display = 'none'; return; }
    const O = opcoes().map((o, i) => [o, i]).filter(([o]) => (o.t + ' ' + o.s).toLowerCase().includes(q)).slice(0, 4);
    ac.innerHTML = '<div class="h">Sugestões para “' + esc(v) + '”</div>' + O.map(([o, i]) => '<div class="r" onclick="ASSUNTOS.exec(' + i + ')"><b>' + esc(o.t) + '</b><small>' + esc(o.s) + '</small><kbd>' + o.n + '</kbd></div>').join('')
      + '<div class="r" onclick="ASSUNTOS.enviar()"><b>✨ Pedir ao ATLAS: ' + esc(v.substring(0, 60)) + '</b><small>Cria ' + esc(S.cat.tipos[$('asTipo')?.value || S.tipo]).toLowerCase() + ' em rascunho, só você vê</small><kbd>↵</kbd></div>';
    ac.style.display = 'block';
  }
  function tecla(e) {
    if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (/^\d$/.test(v)) { const i = opcoes().findIndex(o => String(o.n) === v); e.target.value = ''; if (i >= 0) return exec(i); } return enviar(); }
    if (e.key === 'Escape') { const ac = $('asAc'); if (ac) ac.style.display = 'none'; }
  }
  async function enviar() {
    const inp = $('asIn'); const p = (inp?.value || '').trim(); if (!p || S.ocupado) return; S.tipo = $('asTipo')?.value || S.tipo;
    S.ocupado = true; render(); nota('O ATLAS está preparando… (até 1 min)', 'info');
    try { const d = await api('atlas_criar', { assunto: S.assunto, tipo: S.tipo, pedido: p }); nota('Pronto: ficou em rascunho, só você vê'); S.ocupado = false; await carregar(); ver(d.item.id); }
    catch (e) { S.ocupado = false; nota(e.message, 'error'); render(); const i2 = $('asIn'); if (i2) i2.value = p; }
  }
  function md(t) { // markdown mínimo e seguro: escapa tudo antes
    return esc(t).replace(/^### (.*)$/gm, '<h4>$1</h4>').replace(/^## (.*)$/gm, '<h3>$1</h3>').replace(/^# (.*)$/gm, '<h2>$1</h2>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/^[-*] (.*)$/gm, '<li>$1</li>').replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
  }
  function ver(id) {
    const i = S.itens.find(x => x.id === id); if (!i) return; $('asModal')?.remove();
    const b = []; const mud = (para, rot, cls) => b.push('<button class="as-bt ' + (cls || '') + '" onclick="ASSUNTOS.mudar(\'' + id + '\',\'' + para + '\')">' + rot + '</button>');
    if (i.estado === 'rascunho' && i.meu) mud('teste', 'Testar (nada sai para fora)', 'p');
    if (i.estado === 'teste' && i.meu && i.aprovacao === 'necessaria') mud('pedir_aprovacao', 'Pedir aprovação do dono do assunto', 'p');
    if (i.estado !== 'publicado' && ((i.aprovacao === 'dispensada' && i.meu && i.estado !== 'rascunho') || (i.aprovacao === 'pedida' && i.pode_aprovar))) mud('publicado', 'Publicar em ' + esc(nomeA(i.assunto)), 'p');
    if (i.estado !== 'rascunho' && (i.meu || i.pode_aprovar)) mud('rascunho', 'Desfazer (voltar a rascunho)');
    if (i.meu || i.pode_aprovar) mud('descartado', 'Descartar');
    const m = document.createElement('div'); m.id = 'asModal'; m.className = 'as-modal'; m.onclick = e => { if (e.target === m) m.remove(); };
    m.innerHTML = '<div class="as-card"><div class="as-ch"><b>' + TICO[i.tipo] + ' ' + esc(i.titulo) + '</b><span class="as-st ' + EST[i.estado][1] + '">' + EST[i.estado][0] + '</span><button class="as-x" onclick="this.closest(\'.as-modal\').remove()">✕</button></div>'
      + (i.aviso ? '<div class="as-aviso">⚠ ' + esc(i.aviso) + '</div>' : '') + '<div class="as-meta">Salvo em ' + esc(nomeA(i.assunto)) + ' › ' + esc(S.cat.pastas[i.tipo]) + ' · pedido por ' + esc(i.criado_por) + ' em ' + dt(i.criado_em) + (i.publicado_por ? ' · publicado por ' + esc(i.publicado_por) : '') + '</div>'
      + (i.aprovacao === 'necessaria' || i.aprovacao === 'pedida' ? '<div class="as-meta">' + (i.tipo === 'agente' ? 'Agente: em teste não envia nada para fora; precisa da aprovação do dono do assunto.' : 'Tela: fica privada até a revisão do dono, depois entra no menu.') + '</div>' : '')
      + '<div class="as-txt">' + md(i.conteudo) + '</div><div class="as-btns">' + b.join('') + '</div>'
      + '<details class="as-log"><summary>Registro (' + (i.log || []).length + ')</summary>' + (i.log || []).map(l => '<div>' + dt(l.em) + ' · <b>' + esc(l.por) + '</b> ' + esc(l.acao) + (l.detalhe ? ' — ' + esc(l.detalhe) : '') + '</div>').join('') + '</details></div>';
    document.body.appendChild(m);
  }
  async function mudar(id, para) {
    let motivo = ''; if (para === 'descartado' && !confirm('Descartar este item?')) return;
    try { await api('atlas_mudar', { id, para, motivo }); nota({ teste: 'Em teste', pedir_aprovacao: 'Aprovação pedida', publicado: 'Publicado', rascunho: 'Voltou a rascunho', descartado: 'Descartado' }[para]); $('asModal')?.remove(); await carregar(); if (para !== 'descartado') ver(id); }
    catch (e) { nota(e.message, 'error'); }
  }
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && $('page-s0assuntos')?.classList.contains('active')) { e.preventDefault(); $('asIn')?.focus(); } });
  window.ASSUNTOS = { abrir, trocar, exec, ver, mudar, sugerir, avulso, digitando, tecla, enviar };
})();
