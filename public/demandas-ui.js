// v3.45 — ESTEIRA DE DEMANDAS IA (Kanban de aprovação)
// Agente de Produto sugere → fundador aprova/recusa → aprovada vira tarefa @claude no GitHub → PR → merge do fundador.
// Única parte autônoma: 🌙 correções de ERROS encontrados pelo QA de madrugada (validadas e mescladas sozinhas).
// v3.145 — MÉTODO B.P.M.: Partitura (trilha + critérios de aceite para aprovar) · Mixagem (checklist humano antes do merge)
//          · Batida (painel das trilhas, bloqueios, paralelismo, métricas e fases da implantação). Ver partitura/README.md.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  let D = { demandas: [], config: {}, ultimo_ciclo: null, ultima_noite: null, github: true }, filtro = 'todas';

  async function api(action, body = {}) {
    const r = await fetch('/api/agente-ideias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'O agente demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (!d.success) { const e = new Error(d.error || 'falha'); e.codigo = d.codigo || null; throw e; } return d;
  }
  const COLS = [
    ['sugerida', '💡 Sugeridas — aguardando você', 'var(--gold)'],
    ['aprovada', '✅ Aprovadas', 'var(--green)'],
    ['em_execucao', '⚙ Em implementação', 'var(--blue)'],
    ['implementada', '🚀 Implementadas / corrigidas', 'var(--green)'],
    ['recusada', '✕ Recusadas e arquivadas', 'var(--t3)'],
  ];
  const quando = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const ha = v => { const m = Math.round((Date.now() - Date.parse(v)) / 60000); return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') : 'há ' + Math.floor(m / 1440) + ' dia(s)'; };
  // v3.85: andamento da implementação — o que o Claude está fazendo e quando terminou
  function andamento(d) {
    const x = d.dados || {}, c = x.claude, pr = x.pr, qa = d.squad === 'qa';
    const FUNDO = { 'var(--green)': 'rgba(34,211,163,.13)', 'var(--blue)': 'rgba(79,124,255,.13)', 'var(--gold)': 'rgba(245,166,35,.13)', 'var(--red)': 'rgba(255,77,109,.13)' };
    const chip = (cor, txt, url) => `<div style="font-size:9.5px;margin-top:4px;padding:3px 6px;border-radius:4px;background:${FUNDO[cor] || 'rgba(255,255,255,.05)'};color:${cor};line-height:1.4;">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:inherit;">${txt}</a>` : txt}</div>`;
    if (d.status === 'implementada') return chip('var(--green)', '🚀 No ar' + (x.implementada_em ? ' desde ' + quando(x.implementada_em) : ''), pr?.url);
    if (d.status !== 'em_execucao') return '';
    if (pr && pr.estado === 'closed' && !pr.merged) return chip('var(--red)', `✕ PR #${pr.numero} fechado sem merge — reabra ou mova a demanda`, pr.url);
    if (pr && c?.estado === 'erro') return chip('var(--red)', `❌ Claude parou com ERRO às ${quando(c.atualizado)} — o PR #${pr.numero} tem trabalho INCOMPLETO: não faça o merge sem revisar`, pr.url);
    const rot = pr?.rotulos || [];
    if (pr && rot.includes('precisa-revisao')) return chip('var(--red)', `❌ A validação do PR #${pr.numero} falhou — não foi mesclado. Veja o motivo no PR`, pr.url);
    if (pr && rot.includes('conflito')) return chip('var(--gold)', `🔧 PR #${pr.numero} em conflito com a main — o Claude está atualizando a branch; o merge é tentado de novo sozinho`, pr.url);
    if (pr && (rot.includes('aprovado-merge') || x.merge_pedido_em)) return chip('var(--blue)', `🔄 Mesclando o PR #${pr.numero}${x.merge_pedido_em ? ' (aprovado às ' + quando(x.merge_pedido_em) + ')' : ''} — atualiza com a main, valida e publica (alguns minutos)`, pr.url);
    if (pr) return chip('var(--gold)', `📬 Claude terminou${c?.atualizado ? ' às ' + quando(c.atualizado) : ''}${c?.duracao ? ' (' + c.duracao + ')' : ''} — PR #${pr.numero} ${qa ? 'em validação automática' : 'aguarda o SEU merge'}`, pr.url);
    if (x.reenviado_em && (!c || Date.parse(x.reenviado_em) > Date.parse(c.atualizado))) return chip('var(--blue)', `🔁 Reenviado ao Claude às ${quando(x.reenviado_em)} — aguardando ele começar`, d.issue_url);
    if (!c) { const velho = x.issue_criada_em && Date.now() - Date.parse(x.issue_criada_em) > 15 * 60000;
      return velho ? chip('var(--red)', `⚠ O Claude não começou (tarefa aberta ${ha(x.issue_criada_em)}) — o GitHub pode não ter iniciado o robô. Use "Reenviar ao Claude"`, d.issue_url) : chip('var(--t3)', '⏳ Na fila do GitHub — o Claude ainda não começou', d.issue_url); }
    if (c.estado === 'trabalhando') { const parado = Date.now() - Date.parse(c.atualizado) > 70 * 60000;
      return parado ? chip('var(--red)', `⚠ Sem sinal do Claude ${ha(c.atualizado)} — abra a tarefa`, c.url) : chip('var(--blue)', `⚙ Claude trabalhando desde ${quando(c.inicio)} · última atualização ${ha(c.atualizado)}`, c.url); }
    if (c.estado === 'erro') return chip('var(--red)', `❌ Claude parou com erro às ${quando(c.atualizado)} — abra a tarefa`, c.url);
    return chip('var(--gold)', `✅ Claude terminou às ${quando(c.atualizado)}${c.duracao ? ' (' + c.duracao + ')' : ''} — ${x.branch && !qa ? 'trabalho pronto na branch; aprove o merge (o PR é aberto na hora)' : 'abrindo o PR (até alguns minutos)'}`, c.url);
  }
  // v3.98: o que dá para fazer AGORA com a tarefa — os mesmos botões no card e no detalhe
  function acoesTarefa(d) {
    if (d.status !== 'em_execucao') return [];
    const x = d.dados || {}, c = x.claude, pr = x.pr, qa = d.squad === 'qa', rot = pr?.rotulos || [], A = [];
    const aberto = pr && pr.estado === 'open';
    const pedido = aberto && (rot.includes('aprovado-merge') || x.merge_pedido_em);
    const travado = pedido && x.merge_pedido_em && Date.now() - Date.parse(x.merge_pedido_em) > 40 * 60000;
    const semSinal = !pr && (c?.estado === 'erro' || (c?.estado === 'trabalhando' && Date.now() - Date.parse(c.atualizado) > 70 * 60000)
      || (!c && x.issue_criada_em && Date.now() - Date.parse(x.issue_criada_em) > 15 * 60000)) && !(x.reenviado_em && Date.now() - Date.parse(x.reenviado_em) < 20 * 60000);
    if (!qa && aberto && !pedido && !rot.includes('precisa-revisao') && !rot.includes('conflito')) A.push(['mesclar', '✅ Aprovar e mesclar', 'btn-gn']);
    if (!qa && !aberto && x.branch && c?.estado === 'concluiu') A.push(['mesclar', '✅ Aprovar e mesclar', 'btn-gn']);
    if (aberto && (rot.includes('precisa-revisao') || rot.includes('conflito'))) { A.push(['corrigir', '🛠 Pedir correção ao Claude', 'btn-p']); A.push(['refazer_merge', '🔁 Mesclar de novo', 'btn-g']); }
    else if (travado) A.push(['refazer_merge', '🔁 Mesclar de novo', 'btn-g']);
    if (semSinal) A.push(['reenviar', '🔁 Reenviar ao Claude', 'btn-p']);
    if (aberto && c?.estado === 'erro' && !rot.includes('precisa-revisao')) A.push(['reenviar', '🔁 Pedir ao Claude para terminar', 'btn-p']);
    A.push(['cancelar', '✕ Cancelar', 'btn-g']);
    return A;
  }
  const botoesTarefa = (d, mini) => acoesTarefa(d).map(([op, rot, cls]) => `<button class="btn ${cls}" style="font-size:${mini ? '9.5px;padding:3px 7px' : '11px'};${op === 'cancelar' ? 'color:var(--red);' : ''}" onclick="event.stopPropagation();DEM.tarefa('${d.id}','${op}')">${rot}</button>`).join('');
  const estrelas = n => '★'.repeat(Math.max(0, Math.min(5, +n || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, +n || 0)));
  // "o que mudou": versão anterior (guardada pela API na 1ª edição pendente) × texto atual — mesmo retrato de api/agente-ideias.js
  const CAMPOS_DIFF = [['titulo', 'Título'], ['problema', 'Problema'], ['proposta', 'Proposta'], ['criterios_aceite', 'Critérios de aceite'], ['como_implementar', 'Como implementar'], ['metrica_sucesso', 'Métrica de sucesso'], ['esforco', 'Esforço'], ['risco', 'Risco'], ['impacto', 'Impacto']];
  const retrato = d => { const x = d.dados || {}; return { titulo: d.titulo || '', problema: x.problema || '', proposta: x.proposta || '', criterios_aceite: (x.criterios_aceite || []).join('\n'),
    como_implementar: x.como_implementar || '', metrica_sucesso: x.metrica_sucesso || '', esforco: x.esforco || '', risco: x.risco || '', impacto: String(d.prioridade ?? '') }; };
  const camposAlterados = d => { const a = d.dados?.versao_anterior; if (!a) return []; const b = retrato(d); return CAMPOS_DIFF.filter(([k]) => String(a[k] ?? '') !== b[k]); };
  // diff linha a linha (maior subsequência comum): [{ t: '=' | '-' | '+', a, b }]
  function diffTexto(antes, depois) {
    const linhas = v => { const s = String(v ?? ''); return s ? s.split('\n') : []; };
    const A = linhas(antes).slice(0, 400), B = linhas(depois).slice(0, 400), n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) out.push({ t: '=', a: A[i++], b: B[j++] }); else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', a: A[i++] }); else out.push({ t: '+', b: B[j++] }); }
    while (i < n) out.push({ t: '-', a: A[i++] }); while (j < m) out.push({ t: '+', b: B[j++] });
    return out;
  }
  // duas colunas (anterior | novo): removidas e incluídas do mesmo trecho ficam lado a lado
  function tabelaDiff(ops) {
    const rows = []; let k = 0;
    while (k < ops.length) {
      if (ops[k].t === '=') { rows.push([ops[k].a, ops[k].b, false]); k++; continue; }
      const rem = [], add = []; while (k < ops.length && ops[k].t !== '=') (ops[k].t === '-' ? rem : add).push(ops[k++]);
      for (let z = 0; z < Math.max(rem.length, add.length); z++) rows.push([rem[z]?.a, add[z]?.b, true]);
    }
    const td = (v, fundo) => `<td style="vertical-align:top;width:50%;padding:2px 6px;white-space:pre-wrap;word-break:break-word;border-top:1px solid var(--bd);${v != null && fundo ? 'background:' + fundo + ';color:#222;' : ''}">${v != null ? esc(v) || '&nbsp;' : ''}</td>`;
    return `<table style="width:100%;border-collapse:collapse;font-size:11.5px;line-height:1.5;table-layout:fixed;"><tr style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);text-align:left;"><th style="padding:2px 6px;">Anterior</th><th style="padding:2px 6px;">Novo</th></tr>
      ${rows.map(([a, b, mud]) => `<tr>${td(a, mud && '#fee')}${td(b, mud && '#efe')}</tr>`).join('')}</table>`;
  }
  function blocoDiff(d) {
    const campos = camposAlterados(d); if (!campos.length) return '';
    const a = d.dados.versao_anterior, b = retrato(d);
    return `<div style="margin-bottom:10px;"><button class="btn btn-g" style="font-size:10.5px;color:var(--gold);" onclick="const p=this.nextElementSibling;p.hidden=!p.hidden;this.textContent=p.hidden?'Ver o que mudou ▾':'Ocultar o que mudou ▴'">Ver o que mudou ▾</button>
      <div hidden style="margin-top:8px;background:var(--bg2);border:1px solid var(--bd);border-radius:6px;padding:8px 10px;">
        <div style="font-size:10.5px;color:var(--t2);margin-bottom:4px;">⚠ Alterada${d.dados.versao_alterada_em ? ' em ' + quando(d.dados.versao_alterada_em) : ''} — comparação com a versão ${d.dados.versao_aprovada ? 'aprovada' : 'original'}: <span style="background:#fee;color:#222;padding:0 4px;border-radius:2px;">removido</span> <span style="background:#efe;color:#222;padding:0 4px;border-radius:2px;">incluído</span></div>
        ${campos.map(([k, rot]) => `<div style="margin-top:8px;"><div style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);margin-bottom:2px;">${rot}</div>${tabelaDiff(diffTexto(a[k], b[k]))}</div>`).join('')}</div></div>`;
  }

  function abrir() {
    const box = $('demApp'); if (!box) return;
    box.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(79,124,255,.12),rgba(79,124,255,.03));border:1px solid rgba(79,124,255,.25);border-radius:10px;padding:14px 18px;margin-bottom:12px;">
        <div style="font-family:var(--H);font-size:15px;font-weight:700;">🧠 Esteira de Demandas IA</div>
        <div style="font-size:11px;color:var(--t2);margin-top:3px;line-height:1.6;">O <b>Agente de Produto</b> pensa o Atlantyx OS em ciclos agendados e sugere melhorias. <b>Nada é feito sem a sua aprovação</b>: aprovada, a demanda vira uma tarefa para o Claude no GitHub, que abre um pull request — e só vai para o ar quando você faz o merge.<br>
        Única exceção: <b>🌙 erros encontrados pelo agente de QA de madrugada</b> são corrigidos sozinhos (só se passarem na validação) e ficam listados aqui.</div>
      </div>
      <div class="panel" style="margin-bottom:12px;"><div class="pb" id="demBatida">Carregando a Batida…</div></div>
      <div class="panel" style="margin-bottom:12px;"><div class="pb" id="demCfg">Carregando...</div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
        <div class="seg" id="demFiltro">${[['todas', 'Todas'], ['produto', '💡 Agente de Produto'], ['fabrica', '🏭 Construção de produtos'], ['qa', '🌙 Correções da madrugada'], ['fundador', '✍ Minhas']].map(([k, r]) => `<button data-f="${k}" class="${k === filtro ? 'on' : ''}" onclick="DEM.filtrar('${k}')">${r}</button>`).join('')}</div>
        <span style="flex:1;"></span>
        <button class="btn btn-g" style="font-size:10.5px;" onclick="DEM.nova()">＋ Nova demanda</button>
        <button class="btn btn-g" style="font-size:10.5px;" onclick="DEM.carregar(true)">↻ Atualizar</button>
        <button class="btn btn-p" style="font-size:10.5px;" id="demBtnPensar" onclick="DEM.pensar()">🧠 Pensar agora</button>
      </div>
      <div id="demKanban" style="display:grid;grid-template-columns:repeat(5,minmax(200px,1fr));gap:10px;overflow-x:auto;"></div>`;
    carregar();
  }

  async function carregar(manual) {
    try { D = await api('listar', manual ? { sync: true } : {}); render(); if (manual) nota('Esteira atualizada com o GitHub');
      // v3.85: com tarefa em implementação e a tela aberta, confere de novo a cada 1 min
      clearTimeout(window._demAuto); if ((D.demandas || []).some(d => d.status === 'em_execucao')) window._demAuto = setTimeout(() => { if (document.getElementById('page-s0demandas')?.classList.contains('active')) carregar(); }, 60000); }
    catch (e) { const k = $('demKanban'); if (k) k.innerHTML = `<div style="color:var(--red);font-size:11px;padding:12px;">${esc(e.message)}</div>`; }
  }
  function render() {
    const c = D.config || {}, uc = D.ultimo_ciclo, un = D.ultima_noite;
    const cfg = $('demCfg');
    if (cfg) cfg.innerHTML = `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;font-size:11px;">
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" id="demAtivo" ${c.ativo ? 'checked' : ''}/> <b>Agente de Produto ligado</b></label>
        <div><label class="fl">Pensa a cada</label><select class="fsel" id="demFreq" style="width:auto;">${[[6, '6 horas'], [12, '12 horas'], [24, '1 dia'], [48, '2 dias'], [168, '1 semana']].map(([v, r]) => `<option value="${v}" ${+c.frequencia_horas === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div><label class="fl">Ideias por ciclo</label><select class="fsel" id="demMax" style="width:auto;">${[1, 2, 3, 4, 5, 6].map(v => `<option ${+c.max_por_ciclo === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div style="flex:1;min-width:220px;"><label class="fl">Foco (opcional)</label><input class="fi" id="demFoco" value="${esc(c.foco || '')}" placeholder="ex.: vendas e propostas · reduzir trabalho manual no financeiro"/></div>
        <button class="btn btn-gn" style="font-size:10.5px;" onclick="DEM.salvarCfg()">💾 Salvar</button></div>
      <div style="font-size:10.5px;color:var(--t2);margin-top:8px;line-height:1.7;">
        💡 Último ciclo do agente: ${uc ? quando(uc.em) + (uc.pulado ? ' · pulado: ' + esc(uc.pulado) : ' · ' + (uc.criadas ?? 0) + ' sugestão(ões)') : 'ainda não rodou'} · o agente pausa sozinho se houver 12 sugestões esperando sua decisão.<br>
        🌙 Última madrugada: ${un ? quando(un.em) + ' · ' + (un.telas || 0) + ' telas · ' + esc(un.resultado || '') + (un.issue ? ' (tarefa #' + un.issue + ')' : '') : 'ainda não rodou — configure o GitHub (veja abaixo)'}
        ${D.github ? '' : '<br><b style="color:var(--red);">GITHUB_TOKEN não configurado no Vercel</b> — sem ele as demandas aprovadas não viram tarefa para o Claude.'}
        <div style="margin-top:4px;"><button class="btn btn-g" style="font-size:10px;" onclick="DEM.testarGithub()">🔑 Testar conexão com o GitHub</button> <span id="demGhTeste" style="font-size:10.5px;"></span></div>
        <details style="margin-top:4px;"><summary style="cursor:pointer;color:var(--blue);">Configuração única (GitHub)</summary>
          <div style="padding:6px 0 0 12px;">1) App do Claude instalado no repositório e secret <b>ANTHROPIC_API_KEY</b> no GitHub Actions · 2) No Vercel: <b>GITHUB_TOKEN</b> (fine-grained, Issues: Read and write) e <b>CRON_SECRET</b> ·
          3) No GitHub Actions: secrets <b>CRON_SECRET</b> (mesmo valor do Vercel), <b>ATX_QA_EMAIL</b> e <b>ATX_QA_SENHA</b> (login e senha de um usuário criado em Acesso › Usuários × Perfil) · 4) Criar os rótulos <b>demanda-aprovada</b>, <b>correcao-noturna</b> e <b>precisa-revisao</b> (ou deixar que sejam criados na primeira tarefa).</div></details></div>`;
    const lista = (D.demandas || []).filter(d => filtro === 'todas' || (filtro === 'fundador' ? d.dados?.origem === 'fundador' : d.squad === filtro));
    const k = $('demKanban'); if (!k) return;
    k.innerHTML = COLS.map(([st, rot, cor]) => {
      const itens = lista.filter(d => st === 'recusada' ? ['recusada', 'arquivada'].includes(d.status) : d.status === st);
      return `<div style="background:var(--bg4);border-radius:8px;padding:8px;min-height:160px;">
        <div style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:${cor};margin-bottom:8px;display:flex;justify-content:space-between;">${rot}<span style="background:var(--bg);border-radius:3px;padding:1px 5px;">${itens.length}</span></div>
        ${itens.map(card).join('') || '<div style="font-size:10px;color:var(--t3);text-align:center;padding:14px 0;">—</div>'}</div>`;
    }).join('');
    const n = (D.demandas || []).filter(d => d.status === 'sugerida').length; const b = $('demCnt'); if (b) b.textContent = n || '';
    renderBatida();
  }
  // ── v3.145 · 🥁 BATIDA — trilhas ativas, bloqueios, paralelismo, métricas e fases da implantação ──
  const NAIPE_COR = { T1: '#4f7cff', T2: '#f5a623', T3: '#22d3a3', T4: '#b98cff', T5: '#ff7aa8', T6: '#00c4cc' };
  const infoT = t => D.bpm?.trilhas?.[t] || (/^P-/.test(t || '') ? { nome: 'Produto ' + t.slice(2), naipe: 'Fábrica', escopo: 'sistema separado em produtos/' + t.slice(2) + '/' } : null);
  const chipTrilha = (t, mini) => { const T = infoT(t); return t ? `<span title="${esc(T ? T.naipe + ' · ' + T.escopo : '')}" style="font-size:${mini ? '8.5px' : '10px'};font-family:var(--M);padding:1px 5px;border-radius:3px;background:${NAIPE_COR[t] || '#888'}26;color:${NAIPE_COR[t] || 'var(--t2)'};white-space:nowrap;">${esc(t)}${T && !mini ? ' ' + esc(T.nome) : ''}</span>` : `<span style="font-size:8.5px;font-family:var(--M);padding:1px 5px;border-radius:3px;background:rgba(255,77,109,.15);color:var(--red);">sem trilha</span>`; };
  function bloqueioDe(d) {
    const x = d.dados || {}, c = x.claude, pr = x.pr, rot = pr?.rotulos || [];
    if (pr && rot.includes('precisa-revisao')) return 'Mixagem devolveu o PR #' + pr.numero + ' (gate automático/validação)';
    if (pr && rot.includes('conflito')) return 'PR #' + pr.numero + ' em conflito com a main';
    if (c?.estado === 'erro') return 'Claude parou com erro';
    if (c?.estado === 'trabalhando' && Date.now() - Date.parse(c.atualizado) > 70 * 60000) return 'sem sinal do Claude ' + ha(c.atualizado);
    if (!c && !pr && x.issue_criada_em && Date.now() - Date.parse(x.issue_criada_em) > 15 * 60000) return 'Claude não começou';
    if (pr && pr.estado === 'open' && !rot.includes('aprovado-merge') && !x.merge_pedido_em && d.squad !== 'qa') return 'aguarda a SUA Mixagem (PR #' + pr.numero + ')';
    return null;
  }
  function renderBatida() {
    const el = $('demBatida'), B = D.bpm; if (!el) return;
    if (!B || B.erro) { el.innerHTML = `<div style="font-size:11px;color:var(--red);">Método B.P.M.: ${esc(B?.erro || 'sem dados da Partitura')}</div>`; return; }
    const dem = (D.demandas || []).filter(d => d.squad !== 'qa');
    const ativas = [...new Set(dem.filter(d => d.status === 'em_execucao').map(d => d.dados?.bpm?.trilha).filter(Boolean))];
    const lim = B.limite, dia = 864e5, desde = Date.now() - 60 * dia;
    const lead = d => { const a = Date.parse(d.dados?.bpm?.spec_aprovada_em || d.dados?.versao_aprovada_em || d.decidido_em), b = Date.parse(d.dados?.implementada_em); return a && b && b > a ? (b - a) / dia : null; };
    const prodT = [...new Set(dem.map(d => d.dados?.bpm?.trilha).filter(t => /^P-/.test(t || '')))];
    const linhas = [...Object.entries(B.trilhas), ...prodT.map(t => [t, infoT(t)])].map(([t, T]) => {
      const L = dem.filter(d => d.dados?.bpm?.trilha === t);
      const exe = L.filter(d => d.status === 'em_execucao'), fila = L.filter(d => ['sugerida', 'aprovada'].includes(d.status));
      const feitas = L.filter(d => d.status === 'implementada' && Date.parse(d.dados?.implementada_em || d.atualizado_em) > desde);
      const lt = feitas.map(lead).filter(v => v != null), ltm = lt.length ? lt.reduce((a, b) => a + b, 0) / lt.length : null;
      const comMix = L.filter(d => d.dados?.mixagem || d.dados?.bpm?.devolucoes), dev = comMix.filter(d => (d.dados?.bpm?.devolucoes || 0) > 0).length;
      const bl = exe.map(d => [d, bloqueioDe(d)]).filter(([, b]) => b);
      return `<tr style="border-top:1px solid var(--bd);"><td style="padding:5px 6px;white-space:nowrap;">${chipTrilha(t)}<div style="font-size:9px;color:var(--t3);margin-top:2px;">${esc(T.naipe)}</div></td>
        <td style="padding:5px 6px;text-align:center;"><b style="color:${exe.length ? 'var(--blue)' : 'var(--t3)'};">${exe.length}</b></td><td style="padding:5px 6px;text-align:center;color:var(--t2);">${fila.length}</td>
        <td style="padding:5px 6px;font-size:10.5px;">${bl.length ? bl.map(([d, b]) => `<div style="color:${/SUA Mixagem/.test(b) ? 'var(--gold)' : 'var(--red)'};cursor:pointer;" onclick="DEM.detalhe('${d.id}')">• ${esc(b)} <span style="color:var(--t3);">— ${esc(d.titulo).substring(0, 50)}</span></div>`).join('') : '<span style="color:var(--t3);">—</span>'}</td>
        <td style="padding:5px 6px;text-align:center;">${ltm != null ? ltm.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' d' : '—'}<div style="font-size:9px;color:var(--t3);">${feitas.length} entregue(s)</div></td>
        <td style="padding:5px 6px;text-align:center;color:${comMix.length && dev / comMix.length > 0.3 ? 'var(--red)' : 'var(--t2)'};">${comMix.length ? Math.round(dev / comMix.length * 100) + '%' : '—'}</td></tr>`; }).join('');
    const F = B.fases[B.fase] || {}, imp = B.implantacao?.[B.fase] || [];
    el.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
        <div style="font-family:var(--H);font-size:13.5px;font-weight:700;">🥁 Batida · Método B.P.M.</div>
        <span style="font-size:10.5px;color:var(--t2);">Partitura → Trilha → Mixagem · <a href="https://github.com/Fabiosq13/atlantyx-os/blob/main/partitura/README.md" target="_blank" rel="noopener" style="color:var(--blue);">como funciona</a></span><span style="flex:1;"></span>
        <label style="font-size:10.5px;color:var(--t2);">Fase <select class="fsel" style="width:auto;font-size:11px;" onchange="DEM.bpmSalvar({fase:this.value})">${Object.entries(B.fases).map(([k, f]) => `<option value="${k}" ${k === B.fase ? 'selected' : ''}>${k} · ${esc(f.nome)} (sem. ${esc(f.semanas)})</option>`).join('')}</select></label>
        <span style="font-size:11px;padding:3px 8px;border-radius:5px;background:${ativas.length > lim ? 'rgba(255,77,109,.15);color:var(--red)' : ativas.length === lim ? 'rgba(245,166,35,.15);color:var(--gold)' : 'rgba(34,211,163,.12);color:var(--green)'};" title="Limite recomendado de trilhas em paralelo nesta fase — acima disso o gargalo vira a Mixagem humana">Trilhas ativas <b>${ativas.length}</b> / ${lim}${ativas.length ? ' · ' + ativas.join(' ') : ''}</span></div>
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;min-width:620px;"><tr style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);text-align:left;"><th style="padding:3px 6px;">Trilha</th><th style="padding:3px 6px;text-align:center;">Em execução</th><th style="padding:3px 6px;text-align:center;">Na fila</th><th style="padding:3px 6px;">Bloqueios · decisão humana</th><th style="padding:3px 6px;text-align:center;" title="aprovação da spec → merge (últimos 60 dias)">Lead time</th><th style="padding:3px 6px;text-align:center;" title="PRs devolvidos pela Mixagem (alerta acima de 30%)">Devolvidos</th></tr>${linhas}</table></div>
      <details style="margin-top:8px;"><summary style="cursor:pointer;font-size:11px;color:var(--blue);">Implantação · ${esc(B.fase)} ${esc(F.nome || '')} — ${imp.filter(i => i.feito).length}/${imp.length} itens (o gate da fase não se pula)</summary>
        <div style="padding:6px 0 0 4px;">${imp.map(i => `<label style="display:flex;gap:6px;align-items:flex-start;font-size:11px;margin:3px 0;cursor:pointer;${/^GATE/.test(i.txt) ? 'font-weight:700;' : ''}"><input type="checkbox" ${i.feito ? 'checked' : ''} onchange="DEM.bpmSalvar({checks:{'${B.fase}:${i.k}':this.checked}})"/> ${esc(i.txt)}</label>`).join('')}</div></details>`;
  }
  async function bpmSalvar(mud) {
    const atual = D.config?.bpm || {};
    try { const r = await api('config_salvar', { config: { bpm: { fase: mud.fase || D.bpm?.fase || atual.fase, limite: mud.limite || null, checks: mud.checks || {} } } }); D.config = r.config; D.bpm = r.bpm; render(); nota('Batida atualizada'); }
    catch (e) { nota(e.message, 'error'); }
  }
  function card(d) {
    const x = d.dados || {}; const qa = d.squad === 'qa';
    const n = qa ? (x.achados_qa || []).length + (x.achados_seguranca || []).length : 0;
    return `<div onclick="DEM.detalhe('${d.id}')" style="background:var(--bg3);border:1px solid ${d.status === 'sugerida' ? 'rgba(245,166,35,.45)' : 'var(--bd)'};border-radius:6px;padding:8px;margin-bottom:6px;cursor:pointer;">
      <div style="display:flex;gap:4px;align-items:center;margin-bottom:3px;"><span style="font-size:8.5px;font-family:var(--M);padding:1px 5px;border-radius:3px;background:${qa ? 'rgba(156,109,255,.18);color:#b9a0ff' : x.origem === 'fundador' ? 'rgba(34,211,163,.15);color:var(--green)' : 'rgba(79,124,255,.15);color:var(--blue)'};">${qa ? '🌙 QA madrugada' : x.origem === 'fundador' ? '✍ Fundador' : x.origem === 'fabrica' ? '🏭 ' + esc(x.fabrica?.nome || 'Fábrica') : '💡 Produto'}</span>
        ${camposAlterados(d).length ? '<span style="font-size:8.5px;font-family:var(--M);padding:1px 5px;border-radius:3px;background:rgba(245,166,35,.18);color:var(--gold);" title="Há uma versão alterada aguardando sua aprovação — abra para ver o que mudou">⚠ alterado</span>' : ''}
        ${qa ? '' : chipTrilha(x.bpm?.trilha, true)}${x.area ? `<span style="font-size:8.5px;color:var(--t3);">${esc(x.area)}</span>` : ''}<span style="flex:1;"></span><span style="font-size:8.5px;color:var(--t3);">${quando(d.criado_em)}</span></div>
      <div style="font-size:11px;font-weight:600;line-height:1.35;">${esc(d.titulo)}</div>
      <div style="font-size:9.5px;color:var(--t2);margin-top:3px;">${qa ? n + ' erro(s)' : `<span style="color:var(--gold);" title="impacto">${estrelas(x.impacto || d.prioridade)}</span> · esforço ${esc(x.esforco || '?')} · risco ${esc(x.risco || '?')}`}</div>
      ${d.issue_numero ? `<div style="font-size:9.5px;margin-top:3px;"><a href="${esc(d.issue_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--blue);">tarefa #${d.issue_numero}</a>${x.pr ? ` · <a href="${esc(x.pr.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--blue);">PR #${x.pr.numero}${x.pr.merged ? ' ✓ no ar' : ''}</a>` : ''}</div>` : ''}
      ${andamento(d)}
      ${d.status === 'em_execucao' ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">${botoesTarefa(d, true)}</div>` : ''}
      ${x.aviso ? `<div style="font-size:9.5px;color:var(--red);margin-top:3px;">${esc(x.aviso).substring(0, 140)}</div>` : ''}
    </div>`;
  }
  function filtrar(f) { filtro = f; document.querySelectorAll('#demFiltro button').forEach(b => b.classList.toggle('on', b.dataset.f === f)); render(); }

  // ── detalhe / decisão ──
  function modal(html) {
    let m = $('demModal'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'demModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:30px 12px;';
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:12px;width:min(860px,100%);box-shadow:0 20px 60px rgba(0,0,0,.5);">${html}</div>`;
    document.body.appendChild(m); return m;
  }
  const bloco = (t, v) => v ? `<div style="margin-top:10px;"><div style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);margin-bottom:3px;">${t}</div><div style="font-size:12px;line-height:1.6;white-space:pre-wrap;">${esc(v)}</div></div>` : '';
  const lista = (t, arr) => (arr || []).length ? `<div style="margin-top:10px;"><div style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);margin-bottom:3px;">${t}</div>${arr.map(a => `<div style="font-size:12px;">• ${esc(a)}</div>`).join('')}</div>` : '';
  function detalhe(id) {
    const d = (D.demandas || []).find(x => x.id === id); if (!d) return; const x = d.dados || {}; const qa = d.squad === 'qa';
    const acao = d.status === 'sugerida' ? `
        <div style="font-size:10.5px;color:var(--t2);margin-bottom:4px;">Observação para o desenvolvedor (opcional ao aprovar) · motivo (obrigatório ao recusar — o agente aprende com ele)</div>
        <textarea class="fta" id="demObs" style="min-height:55px;font-size:12px;" placeholder="ex.: faça só para o módulo financeiro · ou: não faz sentido agora porque..."></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"><button class="btn btn-gn" onclick="DEM.decidir('${d.id}','aprovar')">✅ Aprovar e enviar para implementação</button>
        <button class="btn btn-g" style="color:var(--red);" onclick="DEM.decidir('${d.id}','recusar')">✕ Recusar</button><button class="btn btn-g" onclick="DEM.editar('${d.id}')">✎ Editar</button>
        <span style="flex:1;"></span><button class="btn btn-g" style="color:var(--red);" onclick="DEM.excluir('${d.id}')">🗑 Excluir</button></div>`
      : d.status === 'aprovada' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-gn" onclick="DEM.decidir('${d.id}','enviar')">⚙ Enviar para implementação (GitHub)</button><button class="btn btn-g" onclick="DEM.editar('${d.id}')">✎ Editar</button><button class="btn btn-g" onclick="DEM.mover('${d.id}','arquivada')">Arquivar</button></div>`
      : d.status === 'em_execucao' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;">${d.issue_url ? `<a class="btn btn-g" href="${esc(d.issue_url)}" target="_blank" rel="noopener">Abrir tarefa #${d.issue_numero}</a>` : ''}${x.pr ? `<a class="btn btn-g" href="${esc(x.pr.url)}" target="_blank" rel="noopener">${qa ? 'Ver' : 'Revisar'} o PR #${x.pr.numero} no GitHub</a>` : x.branch ? `<a class="btn btn-g" href="https://github.com/${esc((d.issue_url || '').split('/').slice(3, 5).join('/'))}/compare/main...${esc(x.branch)}" target="_blank" rel="noopener">Ver as mudanças da branch</a>` : '<span style="color:var(--t2);">O Claude está trabalhando — o PR aparece aqui quando estiver pronto.</span>'}${botoesTarefa(d)}<span style="flex:1;"></span><button class="btn btn-g" onclick="DEM.mover('${d.id}','implementada')">Marcar como implementada</button></div>
        <div style="margin-top:6px;">${andamento(d)}</div>`
      : `<div style="display:flex;gap:8px;flex-wrap:wrap;">${d.issue_url ? `<a class="btn btn-g" href="${esc(d.issue_url)}" target="_blank" rel="noopener">Tarefa #${d.issue_numero}</a>` : ''}${x.pr ? `<a class="btn btn-g" href="${esc(x.pr.url)}" target="_blank" rel="noopener">PR #${x.pr.numero}</a>` : ''}${['recusada', 'arquivada'].includes(d.status) ? `<button class="btn btn-g" onclick="DEM.mover('${d.id}','sugerida')">↩ Voltar para sugeridas</button>` : ''}<span style="flex:1;"></span><button class="btn btn-g" style="color:var(--red);" onclick="DEM.excluir('${d.id}')">🗑 Excluir</button></div>`;
    const achados = qa ? `${(x.achados_qa || []).length ? '<div style="margin-top:10px;font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);">Erros nas telas</div>' + x.achados_qa.map(a => `<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--bd);"><b>[${esc(a.sev)}] ${esc(a.titulo)}</b> — ${esc(a.rotulo || a.tela || '')}<div style="color:var(--t2);font-size:10.5px;">${esc(a.evidencia || '')}</div></div>`).join('') : ''}
        ${(x.achados_seguranca || []).length ? '<div style="margin-top:10px;font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);">Segurança</div>' + x.achados_seguranca.map(a => `<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--bd);"><b>[${esc(a.severidade)}] ${esc(a.titulo)}</b> — ${esc(a.arquivo || '')}${a.linha ? ':' + a.linha : ''}<div style="color:var(--t2);font-size:10.5px;">${esc(a.evidencia || '')}</div></div>`).join('') : ''}` : '';
    modal(`<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--bd);"><div style="flex:1;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">${esc(d.titulo)}</div>
        <div style="font-size:10.5px;color:var(--t2);">${qa ? '🌙 Correção autônoma da madrugada' : x.origem === 'fundador' ? '✍ Demanda criada por você' : '💡 Sugerida pelo Agente de Produto'} · ${quando(d.criado_em)} · status: <b>${esc(d.status.replace('_', ' '))}</b>${d.decisao_obs ? ' · obs.: ' + esc(d.decisao_obs) : ''}</div></div>
        <button class="btn btn-g" onclick="document.getElementById('demModal').remove()">✕</button></div>
      <div style="padding:6px 18px 14px;">
        ${qa ? '' : `<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--t2);margin-top:6px;"><span>Impacto <b style="color:var(--gold);">${estrelas(x.impacto || d.prioridade)}</b></span><span>Esforço <b>${esc(x.esforco || '?')}</b></span><span>Risco <b>${esc(x.risco || '?')}</b></span><span>Área <b>${esc(x.area || '-')}</b></span>${(x.telas_afetadas || []).length ? `<span>Telas: <b>${esc(x.telas_afetadas.join(', '))}</b></span>` : ''}</div>`}
        ${qa ? '' : blocoPartitura(d)}
        ${bloco('Problema', x.problema)}${bloco('Proposta', x.proposta)}${lista('Critérios de aceite', x.criterios_aceite)}${bloco('Como implementar (orientação técnica)', x.como_implementar)}${bloco('Métrica de sucesso', x.metrica_sucesso)}${achados}
      </div><div style="padding:12px 18px;border-top:1px solid var(--bd);background:var(--bg3);border-radius:0 0 12px 12px;">${blocoDiff(d)}${acao}</div>`);
  }
  // v3.145 · B.P.M.: a Partitura da demanda — trilha (dona dos arquivos), ID e escopo; o que falta para aprovar
  function blocoPartitura(d) {
    const x = d.dados || {}, b = x.bpm || {}, B = D.bpm || {}, T = B.trilhas?.[b.trilha];
    const crit = (x.criterios_aceite || []).filter(c => String(c).trim()).length;
    const editavel = ['sugerida', 'aprovada'].includes(d.status);
    const faltas = [!crit && 'critérios de aceite', !T && 'trilha'].filter(Boolean);
    return `<div style="margin-top:10px;border:1px solid ${faltas.length && editavel ? 'rgba(255,77,109,.4)' : 'var(--bd)'};border-radius:8px;padding:8px 10px;background:var(--bg3);">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px;"><b style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t2);">🎼 Partitura</b>
        ${editavel ? `<select class="fsel" style="width:auto;font-size:11px;" onchange="DEM.trilha('${d.id}',this.value)"><option value="">— escolha a trilha —</option>${Object.entries(B.trilhas || {}).map(([k, t]) => `<option value="${k}" ${k === b.trilha ? 'selected' : ''}>${k} · ${esc(t.nome)} (${esc(t.naipe)})</option>`).join('')}</select>${b.trilha_origem === 'sugerida' ? '<span style="font-size:10px;color:var(--t3);">sugerida pelos arquivos citados — confira</span>' : ''}` : chipTrilha(b.trilha)}
        ${b.id ? `<span style="font-size:10px;color:var(--t2);">ID <code>${esc(b.id)}</code></span>` : ''}${b.spec_aprovada_em ? `<span style="font-size:10px;color:var(--green);">spec aprovada ${quando(b.spec_aprovada_em)}</span>` : ''}
        ${x.mixagem ? `<span style="font-size:10px;color:${x.mixagem.pendentes?.length ? 'var(--gold)' : 'var(--green)'};">🎚 Mixagem ${x.mixagem.pendentes?.length ? 'com ressalva' : 'completa'} · ${quando(x.mixagem.em)}</span>` : ''}${b.devolucoes ? `<span style="font-size:10px;color:var(--red);">devolvido ${b.devolucoes}× pela Mixagem</span>` : ''}</div>
      ${T ? `<div style="font-size:10.5px;color:var(--t2);margin-top:4px;line-height:1.5;">${esc(T.escopo)}. <b>Pode alterar:</b> ${T.pode_alterar.slice(0, 14).map(f => '<code>' + esc(f) + '</code>').join(' ')}${T.pode_alterar.length > 14 ? ' …' : ''} + seção da tela em <code>public/index.html</code>. Banco, contratos e arquivos de outras trilhas viram <i>interseção</i>.</div>` : ''}
      ${faltas.length && editavel ? `<div style="font-size:10.5px;color:var(--red);margin-top:4px;">Para aprovar falta: <b>${faltas.join(' e ')}</b>${!crit ? ' — use ✎ Editar' : ''}.</div>` : ''}</div>`;
  }
  async function trilha(id, t) { if (!t) return; try { await api('editar', { id, campos: { trilha: t } }); await carregar(); detalhe(id); nota('Trilha ' + t + ' definida'); } catch (e) { nota(e.message, 'error'); } }
  async function decidir(id, decisao, forcar) {
    const obs = $('demObs')?.value?.trim() || '';
    if (decisao === 'recusar' && !obs) return nota('Escreva o motivo da recusa — o agente usa para não repetir', 'error');
    if (decisao === 'aprovar' && !forcar && !confirm('Aprovar esta demanda (e a Partitura dela)?\n\nEla vira uma tarefa para o Claude no GitHub, na trilha escolhida. Ele cria a spec e o plano, implementa só nos arquivos da trilha e abre um pull request — que só vai para o ar depois da SUA Mixagem.')) return;
    try { const r = await api('decidir', { id, decisao, obs, forcar_paralelismo: !!forcar }); $('demModal')?.remove();
      if (r.aviso && /GitHub|token/i.test(r.aviso)) { await carregar(); return erroGithub(new Error('A demanda ficou APROVADA, mas não virou tarefa para o Claude: ' + r.aviso + '\n\nDepois de resolver, use "⚙ Enviar para implementação" no card.')); }
      nota(decisao === 'recusar' ? 'Demanda recusada — o agente vai levar o motivo em conta' : r.issue ? 'Aprovada — tarefa #' + r.issue + ' aberta para o Claude' : (r.aviso || 'Aprovada'), r.aviso ? 'error' : 'success'); await carregar(); }
    catch (e) {
      if (e.codigo === 'limite' && confirm(e.message + '\n\nAbrir mais uma trilha assim mesmo?')) return decidir(id, decisao, true);
      if (e.codigo === 'partitura') return alert(e.message);
      nota(e.message, 'error'); }
  }
  // v3.88: aprova o PR pela Esteira — o robô do GitHub atualiza com a main (resolvendo o conflito de versão), valida, mescla e publica
  // v3.145 · B.P.M. — 🎚 MIXAGEM: gate humano antes do merge (o automático roda no robô: gates B.P.M. + validação)
  const MIX = ['Todos os critérios de aceite da spec estão atendidos e demonstrados', 'O diff só toca arquivos do escopo da trilha (ou há interseção aprovada)',
    'Contratos alterados foram aprovados na Afinação e versionados', 'Mudança de banco revisada pelo Afinador, aditiva e reversível (ou não há)',
    'Nenhum segredo, token ou dado de cliente no código ou nos logs', 'Integrações externas: nenhuma chamada nova envia dados sem aprovação (Gmail de agentes = rascunho)',
    'Validação/testes cobrem o caminho feliz e pelo menos um erro', 'Consigo explicar cada trecho do código', 'plano.md e trilhas.md atualizados', 'Vou testar em produção logo após o merge'];
  function mesclar(id) {
    const d = (D.demandas || []).find(x => x.id === id); if (!d) return; const x = d.dados || {}, b = x.bpm || {}, pr = x.pr;
    const repo = (d.issue_url || '').split('/').slice(3, 5).join('/');
    const links = [pr?.url && `<a class="btn btn-g" style="font-size:10.5px;" href="${esc(pr.url)}/files" target="_blank" rel="noopener">Ver o diff do PR #${pr.numero}</a>`,
      pr?.url && `<a class="btn btn-g" style="font-size:10.5px;" href="${esc(pr.url)}/checks" target="_blank" rel="noopener">Gates automáticos (CI)</a>`,
      repo && b.id && x.branch && `<a class="btn btn-g" style="font-size:10.5px;" href="https://github.com/${esc(repo)}/tree/${esc(x.branch)}/partitura/trilhas/${esc(b.id)}" target="_blank" rel="noopener">Spec · plano · mixagem.md</a>`].filter(Boolean).join('');
    modal(`<div style="padding:14px 18px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px;"><div style="flex:1;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">🎚 Mixagem — ${esc(d.titulo)}</div>
        <div style="font-size:10.5px;color:var(--t2);margin-top:2px;">${chipTrilha(b.trilha)} ${b.id ? '· ID <code>' + esc(b.id) + '</code>' : ''} · gate humano (Engenheiro de Mixagem). Depois do seu OK o robô roda os gates automáticos (escopo, banco, versão, segredos, sintaxe e carga da página) e só publica se passarem.</div></div>
        <button class="btn btn-g" onclick="document.getElementById('demModal').remove()">✕</button></div>
      <div style="padding:10px 18px;">
        ${x.claude?.estado === 'erro' ? '<div style="font-size:11.5px;color:var(--red);margin-bottom:8px;">⚠ O Claude parou com ERRO nesta tarefa — o PR pode estar incompleto.</div>' : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${links}</div>
        ${(x.criterios_aceite || []).length ? `<div style="font-size:10.5px;color:var(--t2);margin-bottom:6px;"><b>Critérios de aceite da spec:</b>${x.criterios_aceite.map(c => '<div>• ' + esc(c) + '</div>').join('')}</div>` : ''}
        <div id="demMix">${MIX.map((t, i) => `<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:5px 0;cursor:pointer;"><input type="checkbox" data-i="${i}" onchange="DEM._mixAtualizar()"/> ${esc(t)}</label>`).join('')}</div>
        <div style="margin-top:8px;font-size:10.5px;color:var(--t2);">Ressalva (obrigatória se algum item ficar desmarcado — fica registrada no PR)</div>
        <textarea class="fta" id="demMixRes" style="min-height:48px;font-size:12px;" oninput="DEM._mixAtualizar()" placeholder="ex.: plano.md será atualizado na próxima trilha; testado só no preview"></textarea></div>
      <div style="padding:12px 18px;border-top:1px solid var(--bd);display:flex;gap:8px;align-items:center;background:var(--bg3);border-radius:0 0 12px 12px;">
        <button class="btn btn-gn" id="demMixOk" disabled onclick="DEM._mixConfirmar('${d.id}')">✅ Mesclar e publicar</button><span id="demMixInfo" style="font-size:10.5px;color:var(--t2);"></span></div>`);
    _mixAtualizar();
  }
  function _mixAtualizar() {
    const cks = [...document.querySelectorAll('#demMix input')], abertos = cks.filter(c => !c.checked).length, res = ($('demMixRes')?.value || '').trim();
    const ok = !abertos || res.length >= 15; const b = $('demMixOk'); if (b) b.disabled = !ok;
    const i = $('demMixInfo'); if (i) i.textContent = !abertos ? 'Checklist completo' : ok ? abertos + ' item(ns) em aberto — vai com ressalva' : abertos + ' item(ns) em aberto — marque ou escreva a ressalva';
  }
  async function _mixConfirmar(id) {
    const d = (D.demandas || []).find(x => x.id === id); const x = d?.dados || {};
    const itens = [...document.querySelectorAll('#demMix input')].map(c => ({ txt: MIX[+c.dataset.i], ok: c.checked }));
    const ressalva = ($('demMixRes')?.value || '').trim(), mesmo = x.claude?.estado === 'erro';
    try { const r = await api('mesclar', { id, mesmo_assim: mesmo, mixagem: { itens, ressalva } }); $('demModal')?.remove(); nota(r.via === 'comando' ? 'Aprovado — pedido enviado ao robô do GitHub (abre o PR, valida e publica em alguns minutos)' : 'Aprovado — o merge começa em instantes (acompanhe no card)'); await carregar(); }
    catch (e) { erroGithub(e); }
  }
  async function mover(id, status) { try { await api('mover', { id, status }); $('demModal')?.remove(); await carregar(); } catch (e) { nota(e.message, 'error'); } }
  async function excluir(id) { if (!confirm('Excluir esta demanda da esteira?')) return; try { await api('excluir', { id }); $('demModal')?.remove(); await carregar(); } catch (e) { nota(e.message, 'error'); } }
  function editar(id) {
    const d = (D.demandas || []).find(x => x.id === id); if (!d) return; const x = d.dados || {};
    const campo = (k, rot, v, alto) => `<div class="fg"><label class="fl">${rot}</label>${alto ? `<textarea class="fta" id="demE_${k}" style="min-height:${alto}px;font-size:12px;">${esc(v || '')}</textarea>` : `<input class="fi" id="demE_${k}" value="${esc(v || '')}"/>`}</div>`;
    modal(`<div style="padding:14px 18px;border-bottom:1px solid var(--bd);font-family:var(--H);font-size:14px;font-weight:700;">✎ Editar demanda</div><div style="padding:12px 18px;">
      ${campo('titulo', 'Título', d.titulo)}${campo('problema', 'Problema', x.problema, 70)}${campo('proposta', 'Proposta', x.proposta, 100)}${campo('criterios', 'Critérios de aceite (um por linha)', (x.criterios_aceite || []).join('\n'), 70)}${campo('como', 'Como implementar', x.como_implementar, 90)}
      <div class="fg"><label class="fl">Trilha (dona dos arquivos — Método B.P.M.)</label><select class="fsel" id="demE_trilha"><option value="">— escolha —</option>${Object.entries(D.bpm?.trilhas || {}).map(([k, t]) => `<option value="${k}" ${k === x.bpm?.trilha ? 'selected' : ''}>${k} · ${esc(t.nome)} — ${esc(t.escopo)}</option>`).join('')}</select></div>
      <div style="display:flex;gap:10px;"><div class="fg"><label class="fl">Impacto (1-5)</label><input class="fi" id="demE_imp" type="number" min="1" max="5" value="${esc(x.impacto || d.prioridade || 3)}"/></div><div class="fg"><label class="fl">Esforço</label><select class="fsel" id="demE_esf">${['P', 'M', 'G'].map(o => `<option ${o === x.esforco ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div></div>
      <div style="padding:12px 18px;border-top:1px solid var(--bd);display:flex;gap:8px;"><button class="btn btn-p" onclick="DEM.salvarEdicao('${id}')">💾 Salvar</button><button class="btn btn-g" onclick="DEM.detalhe('${id}')">Cancelar</button></div>`);
  }
  async function salvarEdicao(id) {
    const v = k => $('demE_' + k)?.value ?? '';
    try { await api('editar', { id, campos: { titulo: v('titulo'), problema: v('problema'), proposta: v('proposta'), como_implementar: v('como'), criterios_aceite: v('criterios').split('\n').map(s => s.trim()).filter(Boolean), prioridade: v('imp'), esforco: v('esf'), ...(v('trilha') ? { trilha: v('trilha') } : {}) } });
      nota('Demanda atualizada'); await carregar(); detalhe(id); } catch (e) { nota(e.message, 'error'); }
  }
  function nova() {
    modal(`<div style="padding:14px 18px;border-bottom:1px solid var(--bd);font-family:var(--H);font-size:14px;font-weight:700;">＋ Nova demanda</div><div style="padding:12px 18px;">
      <div class="fg"><label class="fl">Título</label><input class="fi" id="demN_t" placeholder="o que você quer no sistema"/></div>
      <div class="fg"><label class="fl">Proposta / detalhes</label><textarea class="fta" id="demN_p" style="min-height:110px;font-size:12px;" placeholder="descreva a ideia; ela entra como sugerida e você aprova quando quiser"></textarea></div>
      <div class="fg"><label class="fl">Problema que resolve (opcional)</label><textarea class="fta" id="demN_pr" style="min-height:55px;font-size:12px;"></textarea></div></div>
      <div style="padding:12px 18px;border-top:1px solid var(--bd);display:flex;gap:8px;"><button class="btn btn-p" onclick="DEM.salvarNova()">Adicionar à esteira</button><button class="btn btn-g" onclick="document.getElementById('demModal').remove()">Cancelar</button></div>`);
  }
  async function salvarNova() {
    const t = $('demN_t')?.value.trim(), p = $('demN_p')?.value.trim(); if (!t || !p) return nota('Informe título e proposta', 'error');
    try { await api('nova', { dados: { titulo: t, proposta: p, problema: $('demN_pr')?.value.trim() || '', impacto: 3, esforco: 'M', risco: 'baixo' } }); $('demModal')?.remove(); nota('Demanda adicionada em Sugeridas'); await carregar(); } catch (e) { nota(e.message, 'error'); }
  }
  async function pensar() {
    const b = $('demBtnPensar'); if (b) { b.disabled = true; b.textContent = '🧠 Pensando... (1-2 min)'; }
    try { const r = await api('gerar', { squad: 'produto', foco: $('demFoco')?.value || '' }); nota(r.criadas ? r.criadas + ' nova(s) sugestão(ões) na esteira' : 'Nenhuma ideia nova desta vez (o agente evitou repetir)'); await carregar(); }
    catch (e) { nota(e.message, 'error'); }
    if (b) { b.disabled = false; b.textContent = '🧠 Pensar agora'; }
  }
  async function salvarCfg() {
    try { const r = await api('config_salvar', { config: { ativo: $('demAtivo')?.checked, frequencia_horas: $('demFreq')?.value, max_por_ciclo: $('demMax')?.value, foco: $('demFoco')?.value || '' } }); D.config = r.config; render(); nota('Configuração do agente salva'); }
    catch (e) { nota(e.message, 'error'); }
  }
  // v3.98: ações da tarefa direto do card
  async function tarefa(id, op) {
    if (op === 'mesclar') return mesclar(id);
    const d = (D.demandas || []).find(x => x.id === id); if (!d) return; const x = d.dados || {};
    const T = { reenviar: 'Reenviar a tarefa #' + d.issue_numero + ' para o Claude?\n\nEle recebe um novo pedido na tarefa e recomeça (ou continua na branch, se já houver trabalho).',
      corrigir: 'Pedir ao Claude para corrigir o PR #' + (x.pr?.numero || '') + ' (' + ((x.pr?.rotulos || []).includes('conflito') ? 'conflito com a main' : 'validação que falhou') + ')?\n\nQuando ele terminar, clique em "Mesclar de novo".',
      refazer_merge: 'Pedir o merge do PR #' + (x.pr?.numero || '') + ' de novo?\n\nO robô atualiza com a main, valida e só publica se passar.',
      cancelar: 'Cancelar esta tarefa?\n\nA tarefa' + (x.pr?.estado === 'open' ? ' e o PR #' + x.pr.numero : '') + ' são fechados no GitHub sem publicar nada, e a demanda vai para Arquivadas (dá para voltar para Sugeridas depois).' };
    if (!T[op] || !confirm(T[op])) return;
    let obs = '';
    if (op === 'reenviar' || op === 'corrigir') obs = prompt('Alguma orientação extra para o Claude? (opcional)', '') || '';
    if (op === 'cancelar') obs = prompt('Motivo (opcional)', '') || '';
    try { const r = await api('tarefa', { id, op, obs }); $('demModal')?.remove(); nota(r.msg || 'Feito'); await carregar(); }
    catch (e) { erroGithub(e); }
  }
  // v3.99: erro do GitHub → mostra a mensagem completa e já roda o teste do token
  function erroGithub(e) {
    const m = String(e.message || e);
    if (/GitHub|token/i.test(m)) { alert(m + '\n\nVou testar agora o que o token do GitHub consegue fazer (resultado no topo da Esteira).'); testarGithub(); }
    else nota(m, 'error');
  }
  async function testarGithub() {
    const el = $('demGhTeste'); if (el) el.innerHTML = '<span style="color:var(--blue);">testando…</span>';
    try { const r = await api('github_teste'); const N = { ler_repositorio: 'ler o repositório', tarefas_escrever: 'tarefas (issues)', pull_requests_escrever: 'pull requests' };
      const falhas = Object.entries(r.teste).filter(([, v]) => v.ok === false);
      const txt = Object.entries(r.teste).map(([k, v]) => (v.ok ? '✅ ' : v.ok === false ? '❌ ' : '— ') + N[k] + (v.ok === false ? ' (' + esc(v.erro) + ')' : '')).join(' · ');
      if (el) el.innerHTML = txt + (falhas.length ? '<br><b style="color:var(--gold);">Como resolver:</b> em github.com → Settings → Developer settings → Fine-grained tokens, edite o token do Atlantyx OS (repositório ' + esc(r.repo) + ') e marque <b>Issues: Read and write</b>' + (r.teste.pull_requests_escrever?.ok === false ? ', <b>Pull requests: Read and write</b> e <b>Contents: Read</b>' : '') + '. Se o erro for 401, gere um token novo e troque o <b>GITHUB_TOKEN</b> no Vercel (e faça Redeploy). Enquanto isso, o merge funciona pelo robô do GitHub desde que "tarefas" esteja ✅.' : ''); }
    catch (e) { if (el) el.innerHTML = '<span style="color:var(--red);">' + esc(e.message) + '</span>'; }
  }
  window.DEM = { trilha, bpmSalvar, _mixAtualizar, _mixConfirmar, abrir, tarefa, testarGithub, carregar, filtrar, detalhe, decidir, mesclar, mover, excluir, editar, salvarEdicao, nova, salvarNova, pensar, salvarCfg, _render: render, _estado: () => D };
})();
