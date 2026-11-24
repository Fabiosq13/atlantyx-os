// v3.591: item = conversa em fluxo (ajustar, testar e implantar pelo chat) · v3.564 — ASSUNTOS · tela do ATLAS por assunto (abas, opções numeradas, "Precisa de você", biblioteca do que o ATLAS criou, barra embaixo)
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
  const TABS = ['comercial', 'vendas', 'marketing', 'financeiro', 'projetos', 'estrategia', 'pessoas', 'juridico', 'dados', 'produtos', 'atendimento', 'desenvolvimento', 'email', 'dashboards', 'integracoes'];   // v3.578: todas as áreas de atuação do menu
  const ICO = { comercial: '🤝', marketing: '📣', financeiro: '💰', projetos: '🗂️', estrategia: '🧭', integracoes: '🔌', pessoas: '👥', juridico: '⚖️', dados: '🗄️', produtos: '📦' };
  Object.assign(ICO, { atendimento: '🎧', desenvolvimento: '🛠️', email: '📬', dashboards: '📊' });
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
  // v3.578: cada área abre as telas que já existem dela (tecla = número) e mantém os pedidos ao ATLAS
  const TELAS = {
    vendas: [['Floresta de Vendas', 's7floresta'], ['Painel de Vendas IA', 's7painel'], ['Elaboração de Propostas', 's7propostas'], ['Pipeline HubSpot', 's7pipe'], ['Leads esquecidos', 's7esquecidos'], ['Metas + KPIs', 's7kpi'], ['Feed de Prospecção', 's7feed'], ['Clientes do CRM', 's7clientes'], ['Reuniões + Briefings', 's7meet'], ['Outreach em lote', 's7outreach']],
    projetos: [['Status Report', 's9status'], ['Painel Mestre', 's9painel'], ['Raio-X do projeto', 's9raiox'], ['Agenda do GP', 's9agenda']],
    estrategia: [['Plano estratégico', 's1plano'], ['Visão e Metas', 's1metas'], ['Placar de Metas', 's1placar'], ['OKRs', 's1okr'], ['Business Plan', 's1bp']],
    pessoas: [['Departamento Pessoal', 's8rh'], ['Cadastro de funcionários', 's8funcionarios'], ['Organograma', 's8organograma'], ['Papéis e responsabilidades', 's8papeis']],
    juridico: [['Jurídico e Compliance', 's5juridico'], ['Análise de contratos', 's5contratos']],
    dados: [['Engenharia de Dados', 's12hub'], ['Novo projeto de dados', 's12novo'], ['Modelagem DW', 's12modelagem']],
    atendimento: [['Atendimento omnichannel', 's10atend'], ['Inside Sales + SDR', 's11sales']],
    desenvolvimento: [['Desenvolvimento, QA e versões', 's6dev'], ['Esteira de entrega', 's6fabrica'], ['QA de produtos', 's6qaprod'], ['Linha de produção', 's6pipeline']],
    email: [['Caixa de entrada', 'email'], ['RFPs', 'emailrfp'], ['Respostas de vendas', 'emailvendas'], ['Projetos', 'emailprojetos']],
    dashboards: [['Dashboard Studio', 's13hub'], ['Novo dashboard', 's13novo'], ['Mockup interativo', 's13mockup'], ['Dashboard financeiro', 's1dash']],
    integracoes: [['Ações do sistema', 's1acoessis'], ['Metricool e Ideogram', 's2social'], ['HubSpot (clientes)', 's7clientes']]
  };
  const GENERICO = a => [
    ['Gerar', 'Relatório de ' + a, 'O ATLAS monta com o que você pedir', { pedir: ['relatorio', 'Relatório semanal de ' + a + ' com os pontos que precisam de atenção'] }],
    ['Gerar', 'Análise de ' + a, 'Situação, riscos e recomendações', { pedir: ['analise', 'Análise da situação atual de ' + a + ' com riscos e recomendações'] }],
    ['Criar', 'Agente de ' + a, 'Roda sozinho, só com ações seguras', { pedir: ['agente', 'Agente que acompanha ' + a + ' toda semana e me avisa o que exige decisão'] }],
    ['Criar', 'Tela nova de ' + a, 'Vai para revisão antes de entrar no menu', { pedir: ['tela', 'Tela com o resumo de ' + a + ' e os itens que precisam de ação'] }]];

  const S = { cat: null, assunto: 'marketing', itens: [], aguardando: 0, atividade: null, sel: 0, tipo: 'analise', ocupado: false };
  const nomeA = k => (S.cat?.assuntos || {})[k] || k;
  const opcoes = () => (OPC[S.assunto] || (TELAS[S.assunto] || []).map(t => ['Ver', t[0], 'Abre a tela', { ir: t[1] }]).concat(GENERICO(nomeA(S.assunto))).slice(0, 10)).map((o, i) => ({ g: o[0], t: o[1], s: o[2], a: o[3], n: (i + 1) % 10 }));

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
    const outros = Object.keys(S.cat.assuntos).filter(k => !TABS.includes(k));   // (assuntos criados depois e ainda sem aba)
    const O = opcoes(), grupos = ['Ver', 'Criar', 'Gerar', 'Conectar'].map(g => [g, O.filter(o => o.g === g)]).filter(x => x[1].length);
    const meus = S.itens.filter(i => i.meu && i.estado !== 'publicado'), aprov = S.itens.filter(i => i.aprovacao === 'pedida' && i.pode_aprovar && i.estado !== 'publicado');
    const pub = S.itens.filter(i => i.estado === 'publicado'), at = S.atividade || {};
    const prec = []; aprov.forEach(i => prec.push([i, 'Pedido de aprovação: ' + i.titulo, 'Quem pediu: ' + esc(i.criado_por) + '. Revise e publique ou devolva.', 'Revisar']));
    meus.filter(i => i.estado === 'rascunho' && !aprov.includes(i)).slice(0, 3).forEach(i => prec.push([i, 'Rascunho seu: ' + i.titulo, 'Só você vê. Teste e publique quando estiver bom.', 'Abrir']));
    box.innerHTML = '<div class="as-tabs">' + TABS.filter(k => S.cat.assuntos[k]).map(k => '<button class="as-tab' + (k === S.assunto ? ' on' : '') + '" onclick="ASSUNTOS.trocar(\'' + k + '\')">' + (ICO[k] || '📁') + ' ' + esc(nomeA(k)) + '</button>').join('')
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
    S.ocupado = true; render();
    try { const d = await api('atlas_iniciar', { assunto: S.assunto, tipo: S.tipo, pedido: p }); S.ocupado = false; await carregar(); await ver(d.item.id, p); }
    catch (e) { S.ocupado = false; nota(e.message, 'error'); render(); const i2 = $('asIn'); if (i2) i2.value = p; }
  }
  function md(t) { // markdown mínimo e seguro: escapa tudo antes (títulos, negrito, listas, tabelas)
    const linhas = esc(t).split('\n'), out = []; let tab = null, lista = false;
    const fechaLista = () => { if (lista) { out.push('</ul>'); lista = false; } };
    const fechaTab = () => { if (tab) { out.push('<table class="as-tb">' + tab.map((r, i) => '<tr>' + r.map(c => (i === 0 ? '<th>' : '<td>') + c + (i === 0 ? '</th>' : '</td>')).join('') + '</tr>').join('') + '</table>'); tab = null; } };
    const inl = x => x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    for (const l of linhas) {
      if (/^\s*\|.*\|\s*$/.test(l)) { fechaLista(); if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue; (tab = tab || []).push(l.trim().replace(/^\||\|$/g, '').split('|').map(c => inl(c.trim()))); continue; }
      fechaTab();
      let m;
      if ((m = l.match(/^(#{1,3}) (.*)$/))) { fechaLista(); out.push('<h' + (m[1].length + 1) + '>' + inl(m[2]) + '</h' + (m[1].length + 1) + '>'); }
      else if ((m = l.match(/^\s*(?:[-*]|\d+\.) (.*)$/))) { if (!lista) { out.push('<ul>'); lista = true; } out.push('<li>' + inl(m[1]) + '</li>'); }
      else if (!l.trim()) { fechaLista(); out.push('<div class="sp"></div>'); }
      else { fechaLista(); out.push('<p>' + inl(l) + '</p>'); }
    }
    fechaLista(); fechaTab(); return out.join('');
  }
  // ── Conversa com o item (estilo chat) ─────────────────────────────────────────────────────────────────────────────
  const W = { id: null, item: null, vendo: null, ocupado: false, parcial: '', aba: 'chat' };
  const sep = t => { const i = t.indexOf('<documento>'); if (i < 0) return { chat: t.trim(), doc: null, aberto: false }; const f = t.indexOf('</documento>', i);
    return { chat: (t.slice(0, i) + (f < 0 ? '' : t.slice(f + 12))).trim(), doc: t.slice(i + 11, f < 0 ? undefined : f).replace(/^\s*\n/, ''), aberto: f < 0 }; };
  const SUG = it => it.conteudo ? ['Deixe mais curto', 'Acrescente o que ele NUNCA faz'].concat(it.tipo === 'agente' || it.tipo === 'relatorio' ? ['Agende toda segunda às 7h'] : []) : [];
  async function ver(id, primeira) {
    $('asModal')?.remove(); W.id = id; W.vendo = null; W.parcial = ''; W.aba = 'chat';
    try { W.item = (await api('atlas_obter', { id })).item; } catch (e) { return nota(e.message, 'error'); }
    const m = document.createElement('div'); m.id = 'asModal'; m.className = 'as-modal'; document.body.appendChild(m); desenhar();
    if (primeira && !W.item.conteudo && !(W.item.conversa || []).length) enviarMsg(primeira);
  }
  function bolha(c) {
    if (c.papel === 'user') return '<div class="as-m u"><div class="b">' + esc(c.texto).replace(/\n/g, '<br>') + '</div></div>';
    return '<div class="as-m a"><div class="av">✨</div><div class="b' + (c.teste || c.execucao ? ' tst' : '') + '">' + (c.teste ? '<div class="tt">🧪 Resultado do teste — simulação, nada saiu para fora</div>' : '') + (c.execucao ? '<div class="tt">▶ Execução valendo — nada saiu para fora, só relatório e rascunhos</div>' : '') + md(c.texto) + (c.versao ? '<div class="vv">Texto atualizado → versão ' + c.versao + '</div>' : '') + '</div></div>';
  }
  function desenhar(manter) {
    const m = $('asModal'), i = W.item; if (!m || !i) return;
    const vend = W.vendo, doc = W.ocupado && W.parcialDoc != null ? W.parcialDoc : (vend ? vend.conteudo : i.conteudo), vs = i.versoes || [], ult = vs.length ? vs[vs.length - 1].n : 0;
    const feed = (i.conversa || []).map(bolha).join('') + (W.ocupado ? '<div class="as-m a"><div class="av">✨</div><div class="b" id="asLive">' + (W.parcial ? md(W.parcial) : '<span class="as-dots"><i></i><i></i><i></i></span>') + '</div></div>' : '');
    const ac = (i.acoes || []).map(a => '<button class="as-bt' + (a.forte ? ' p' : '') + '" ' + (W.ocupado ? 'disabled ' : '') + 'onclick="ASSUNTOS.chip(\'' + a.id + '\')">' + esc(a.rotulo) + '</button>').join('');
    const sug = SUG(i).map(t => '<span onclick="ASSUNTOS.msgRapida(this.textContent)">' + esc(t) + '</span>').join('');
    const antes = manter ? m.querySelector('.as-feed')?.scrollTop : null, ta = manter ? m.querySelector('#asMsg')?.value : '';
    m.innerHTML = '<div class="as-w ' + (W.aba === 'doc' ? 'ver-doc' : 'ver-chat') + '"><div class="as-wh"><b>' + TICO[i.tipo] + ' ' + esc(i.titulo) + '</b><span class="as-st ' + EST[i.estado][1] + '">' + EST[i.estado][0] + '</span>'
      + '<button class="as-x" title="Fechar" onclick="ASSUNTOS.fechar()">✕</button></div>'
      + '<div class="as-wtabs"><button class="' + (W.aba === 'chat' ? 'on' : '') + '" onclick="ASSUNTOS.aba(\'chat\')">💬 Conversa</button><button class="' + (W.aba === 'doc' ? 'on' : '') + '" onclick="ASSUNTOS.aba(\'doc\')">📄 ' + esc(S.cat.tipos[i.tipo]) + '</button></div>'
      + '<div class="as-wb"><div class="as-wd"><div class="as-wdh"><span>' + esc(S.cat.tipos[i.tipo]) + ' · ' + esc(nomeA(i.assunto)) + '</span>'
      + (vs.length > 1 ? '<select onchange="ASSUNTOS.versao(this.value)">' + vs.slice().reverse().map(v => '<option value="' + v.n + '"' + ((vend ? vend.n : ult) === v.n ? ' selected' : '') + '>Versão ' + v.n + (v.n === ult ? ' (atual)' : '') + ' · ' + dt(v.em) + '</option>').join('') + '</select>' : '')
      + (vend && vend.n !== ult ? '<button class="as-bt" onclick="ASSUNTOS.restaurar(' + vend.n + ')">Voltar a esta versão</button>' : '') + '</div>'
      + (i.aviso ? '<div class="as-aviso">⚠ ' + esc(i.aviso) + '</div>' : '') + (i.ajuste_tipo ? '<div class="as-meta">' + esc(i.ajuste_tipo) + '</div>' : '')
      + agendaBox(i) + '<div class="as-txt as-doc" id="asDoc">' + (doc ? md(doc) : '<div class="as-vazio">O texto aparece aqui enquanto o ATLAS escreve. Peça ajustes na conversa ao lado.</div>') + '</div>'
      + '<div class="as-meta">Pedido por ' + esc(i.criado_por) + ' em ' + dt(i.criado_em) + (i.publicado_por ? ' · implantado por ' + esc(i.publicado_por) : '') + '</div>'
      + execBox(i) + '<details class="as-log"><summary>Registro (' + (i.log || []).length + ')</summary>' + (i.log || []).map(l => '<div>' + dt(l.em) + ' · <b>' + esc(l.por) + '</b> ' + esc(l.acao) + (l.detalhe ? ' — ' + esc(l.detalhe) : '') + '</div>').join('') + '</details>'
      + ((i.meu || i.pode_aprovar) && i.estado !== 'descartado' ? '<button class="as-bt as-desc" onclick="ASSUNTOS.descartar()">Descartar</button>' : '') + '</div>'
      + '<div class="as-wc"><div class="as-feed" id="asFeed">' + (feed || '<div class="as-vazio">Conte o que você quer. Eu escrevo, você ajusta, testa e implanta aqui mesmo.</div>') + '</div>'
      + '<div class="as-chips">' + ac + '</div>' + (sug ? '<div class="as-sug2">' + sug + '</div>' : '')
      + '<div class="as-in"><textarea id="asMsg" rows="1" placeholder="Peça um ajuste, tire uma dúvida, escreva “testa” ou “implantar”…" onkeydown="ASSUNTOS.teclaMsg(event)" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,140)+\'px\'"></textarea>'
      + '<button class="as-send" ' + (W.ocupado ? 'disabled' : '') + ' onclick="ASSUNTOS.enviarMsg()">' + (W.ocupado ? '…' : 'Enviar') + '</button></div></div></div></div>';
    const f = $('asFeed'); if (f) f.scrollTop = antes != null && !W.ocupado ? antes : f.scrollHeight; const t = $('asMsg'); if (t) { if (ta) t.value = ta; if (!W.ocupado && window.innerWidth > 700) t.focus(); }
  }
  const DIASN = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const txtAg = a => !a || !a.freq ? '' : (a.freq === 'diaria' ? 'Todo dia' : a.freq === 'semanal' ? 'Toda ' + DIASN[a.dia] : 'Todo dia ' + a.dia + ' do mês') + ' às ' + String(a.hora).padStart(2, '0') + ':00' + (a.ativa === false ? ' · pausada' : '');
  function agendaBox(i) {
    if (i.tipo !== 'agente' && i.tipo !== 'relatorio') return ''; const a = i.agenda || {}, pode = i.meu || i.pode_aprovar;
    const opt = (v, r, sel) => '<option value="' + v + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + r + '</option>', fr = a.freq || 'semanal';
    const diaSel = fr === 'semanal' ? '<select id="agDia">' + DIASN.map((d, k) => opt(k, d, a.dia ?? 1)).join('') + '</select>' : fr === 'mensal' ? '<select id="agDia">' + Array.from({ length: 28 }, (_, k) => opt(k + 1, 'dia ' + (k + 1), a.dia ?? 1)).join('') + '</select>' : '';
    const prox = i.estado === 'publicado' ? '' : ' · só roda depois de implantado';
    return '<div class="as-ag"><div class="as-agh"><b>⏰ Agenda</b><span>' + (a.freq ? esc(txtAg(a)) + prox : 'Não agendado') + '</span>' + (a.freq && pode ? '<button class="as-bt" onclick="ASSUNTOS.agendaAtiva(' + (a.ativa === false ? 'true' : 'false') + ')">' + (a.ativa === false ? 'Retomar' : 'Pausar') + '</button>' : '') + '</div>'
      + (pode ? '<div class="as-agf"><select id="agFreq" onchange="ASSUNTOS.agendaFreq()">' + opt('diaria', 'Todo dia', fr) + opt('semanal', 'Toda semana', fr) + opt('mensal', 'Todo mês', fr) + '</select>' + diaSel + '<select id="agHora">' + Array.from({ length: 24 }, (_, h) => opt(h, String(h).padStart(2, '0') + ':00', a.hora ?? 7)).join('') + '</select><button class="as-bt p" onclick="ASSUNTOS.agendaSalvar()">' + (a.freq ? 'Atualizar' : 'Agendar') + '</button></div>'
        + (i.assunto === 'marketing' ? '<label class="as-agc"><input type="checkbox" id="agAuto"' + (i.autocampanha ? ' checked' : '') + ' onchange="ASSUNTOS.agendaAuto(this.checked)"> Ciclo completo de marketing, todo dia: lê os resultados, aprende, ajusta as campanhas, pesquisa a concorrência (1x por semana), realinha o ICP, cadastra a campanha, agenda 7 dias de posts e cria o anúncio da semana dentro do teto</label>' + (i.autocampanha ? '<label class="as-agc"><input type="checkbox" id="agAds"' + (i.ativar_anuncio ? ' checked' : '') + (i.pode_aprovar ? '' : ' disabled') + ' onchange="ASSUNTOS.agendaAds(this.checked)"> Pode ATIVAR o anúncio pago sozinho (sempre dentro do teto mensal; só o CEO liga). Desligado, ele cria o anúncio pausado.</label>' : '') : '') + '<div class="as-meta">Horário de Brasília. Você recebe um e-mail com o resumo a cada execução. Posts são agendados no Metricool (dá para cancelar lá); anúncio pago nasce pausado, salvo se você autorizar ativar.</div>' : '') + '</div>';
  }
  function execBox(i) {
    const E = i.execucoes || []; if (!E.length) return '';
    return '<details class="as-log as-ex"><summary>Execuções (' + E.length + ')</summary>' + E.map(x => '<details><summary>' + dt(x.em) + ' · ' + ({ teste: '🧪 teste', manual: '▶ valendo', agenda: '⏰ agenda' }[x.modo] || x.modo) + ' · ' + esc(x.por) + (x.erro ? ' · <span style="color:#B42318">falhou</span>' : '') + '</summary><div class="as-txt" style="font-size:12px">' + (x.erro ? esc(x.erro) : md(x.saida || '')) + (x.autocampanha ? '<div class="as-meta">Autocampanha: ' + esc(x.autocampanha.erro ? 'erro — ' + x.autocampanha.erro : x.autocampanha.pulado ? 'já tinha rodado hoje' : (x.autocampanha.enfileirados ?? 0) + ' post(s) na fila' + (x.autocampanha.anuncio ? ' · anúncio ' + ({ ACTIVE: 'ativo', PAUSED: 'pausado', kit: 'em kit' }[x.autocampanha.anuncio.estado] || '') : '')) + '</div>' : '') + '</div></details>').join('') + '</details>';
  }
  function agendaFreq() { const f = $('agFreq')?.value; W.item.agenda = { ...(W.item.agenda || {}), freq: f, dia: f === 'diaria' ? null : 1, hora: Number($('agHora')?.value || 7) }; desenhar(true); }
  async function agendaSalvar() {
    const freq = $('agFreq')?.value, dia = $('agDia')?.value, hora = $('agHora')?.value;
    try { W.item = (await api('atlas_agendar', { id: W.id, freq, dia, hora, ativa: true })).item; nota('Agendado: ' + txtAg(W.item.agenda)); desenhar(true); carregar().catch(() => {}); } catch (e) { nota(e.message, 'error'); }
  }
  async function agendaAtiva(v) { try { W.item = (await api('atlas_agendar', { id: W.id, ativa: v })).item; nota(v ? 'Agenda retomada' : 'Agenda pausada'); desenhar(true); } catch (e) { nota(e.message, 'error'); } }
  async function agendaAds(v) { try { W.item = (await api('atlas_agendar', { id: W.id, ativar_anuncio: v })).item; nota(v ? 'O agente pode ativar anúncio dentro do teto' : 'O agente só cria o anúncio pausado'); desenhar(true); } catch (e) { nota(e.message, 'error'); desenhar(true); } }
  async function agendaAuto(v) { try { W.item = (await api('atlas_agendar', { id: W.id, autocampanha: v })).item; nota(v ? 'Ciclo diário de marketing ligado (agenda diária às 07:00)' : 'Ciclo diário de marketing desligado'); desenhar(true); } catch (e) { nota(e.message, 'error'); desenhar(true); } }
  function teclaMsg(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMsg(); } }
  function msgRapida(t) { enviarMsg(t); }
  function chip(id) { if (id === 'testar') return enviarMsg('Rodar teste agora', 'testar'); if (id === 'executar') { if (!confirm('Rodar o agente valendo agora? Ele só gera relatório e rascunhos; nada é enviado nem publicado fora.')) return; return enviarMsg('Rodar agora (valendo)', 'executar'); } return acao(id); }
  async function enviarMsg(texto, acaoId) {
    if (W.ocupado) return; const ta = $('asMsg'); const msg = String(texto || ta?.value || '').trim(); if (!msg) return; if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    const i = W.item; i.conversa = (i.conversa || []).concat({ papel: 'user', texto: msg, em: new Date().toISOString() }); W.ocupado = true; W.parcial = ''; W.parcialDoc = null; W.vendo = null; desenhar();
    let acum = '', fimItem = null, erro = null;
    try {
      const r = await fetch('/api/s1-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'atlas_conversar', id: W.id, mensagem: msg, acao: acaoId || undefined }) });
      if (!r.ok || !/event-stream/.test(r.headers.get('content-type') || '')) { const d = await r.json().catch(() => ({})); throw new Error(d.error || (r.status === 504 ? 'Demorou demais — tente de novo' : 'HTTP ' + r.status)); }
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let k;
        while ((k = buf.indexOf('\n\n')) >= 0) { const bloco = buf.slice(0, k).trim(); buf = buf.slice(k + 2); if (!bloco.startsWith('data:')) continue; let ev; try { ev = JSON.parse(bloco.slice(5)); } catch (_) { continue; }
          if (ev.tipo === 'texto') { acum += ev.d; const p = sep(acum); W.parcial = p.chat; W.parcialDoc = p.doc; vivo(p); }
          else if (ev.tipo === 'fim') fimItem = ev.item; else if (ev.tipo === 'erro') erro = ev.erro; }
      }
    } catch (e) { erro = e.message; }
    W.ocupado = false; W.parcial = ''; W.parcialDoc = null;
    if (fimItem) W.item = fimItem; else { try { W.item = (await api('atlas_obter', { id: W.id })).item; } catch (_) {} }
    if (erro) { nota(erro, 'error'); const it = W.item; if (it && it.conversa) it.conversa = it.conversa.concat({ papel: 'atlas', texto: 'Não consegui responder: ' + erro + ' Tente de novo.', em: new Date().toISOString() }); }
    if ($('asModal')) desenhar(); carregar().catch(() => {});
  }
  function vivo(p) { // atualiza só os pedaços que mudam (sem redesenhar o modal inteiro a cada trecho)
    const l = $('asLive'), d = $('asDoc'), f = $('asFeed'), perto = f && f.scrollHeight - f.scrollTop - f.clientHeight < 80;
    if (l) l.innerHTML = p.chat ? md(p.chat) : (p.doc != null ? '<span class="as-dots"><i></i><i></i><i></i></span> escrevendo o texto…' : '<span class="as-dots"><i></i><i></i><i></i></span>');
    if (d && p.doc != null) { d.innerHTML = md(p.doc) + (p.aberto ? '<span class="as-cur"></span>' : ''); if (W.aba === 'doc') d.scrollTop = d.scrollHeight; }
    if (f && perto) f.scrollTop = f.scrollHeight;
  }
  async function acao(para) {
    if (W.ocupado) return;
    try { await api('atlas_mudar', { id: W.id, para, motivo: '' }); W.item = (await api('atlas_obter', { id: W.id })).item;
      const t = { teste: 'Marcado como em teste.', pedir_aprovacao: 'Pedi a aprovação ao dono do assunto.', publicado: 'Implantado em ' + nomeA(W.item.assunto) + '.', rascunho: 'Voltou a rascunho.' }[para] || 'Feito.';
      W.item.conversa = (W.item.conversa || []).concat({ papel: 'atlas', texto: '✅ ' + t, em: new Date().toISOString() }); nota(t); desenhar(); carregar().catch(() => {}); }
    catch (e) { nota(e.message, 'error'); }
  }
  async function descartar() { if (!confirm('Descartar este item?')) return; try { await api('atlas_mudar', { id: W.id, para: 'descartado', motivo: '' }); nota('Descartado'); fechar(); await carregar(); } catch (e) { nota(e.message, 'error'); } }
  async function versao(n) { try { const d = await api('atlas_versao', { id: W.id, n }); const vs = W.item.versoes || [], ult = vs.length ? vs[vs.length - 1].n : 0; W.vendo = Number(n) === ult ? null : d.versao; desenhar(true); } catch (e) { nota(e.message, 'error'); } }
  async function restaurar(n) { try { W.item = (await api('atlas_restaurar', { id: W.id, n })).item; W.vendo = null; nota('Texto voltou à versão ' + n); desenhar(); carregar().catch(() => {}); } catch (e) { nota(e.message, 'error'); } }
  function aba(a) { W.aba = a; desenhar(true); }
  function fechar() { $('asModal')?.remove(); }
  async function mudar(id, para) { W.id = id; return acao(para); }
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && $('page-s0assuntos')?.classList.contains('active')) { e.preventDefault(); $('asIn')?.focus(); } });
  window.ASSUNTOS = { abrir, trocar, exec, ver, mudar, sugerir, avulso, digitando, tecla, enviar, enviarMsg, agendaSalvar, agendaAtiva, agendaAuto, agendaAds, agendaFreq, msgRapida, teclaMsg, chip, aba, fechar, descartar, versao, restaurar };
})();
