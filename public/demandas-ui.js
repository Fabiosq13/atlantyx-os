// v3.45 — ESTEIRA DE DEMANDAS IA (Kanban de aprovação)
// Agente de Produto sugere → fundador aprova/recusa → aprovada vira tarefa @claude no GitHub → PR → merge do fundador.
// Única parte autônoma: 🌙 correções de ERROS encontrados pelo QA de madrugada (validadas e mescladas sozinhas).
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  let D = { demandas: [], config: {}, ultimo_ciclo: null, ultima_noite: null, github: true }, filtro = 'todas';

  async function api(action, body = {}) {
    const r = await fetch('/api/agente-ideias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'O agente demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (!d.success) throw new Error(d.error || 'falha'); return d;
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
    if (pr) return chip('var(--gold)', `📬 Claude terminou${c?.atualizado ? ' às ' + quando(c.atualizado) : ''}${c?.duracao ? ' (' + c.duracao + ')' : ''} — PR #${pr.numero} ${qa ? 'em validação automática' : 'aguarda o SEU merge'}`, pr.url);
    if (!c) return chip('var(--t3)', '⏳ Na fila do GitHub — o Claude ainda não começou', d.issue_url);
    if (c.estado === 'trabalhando') { const parado = Date.now() - Date.parse(c.atualizado) > 70 * 60000;
      return parado ? chip('var(--red)', `⚠ Sem sinal do Claude ${ha(c.atualizado)} — abra a tarefa`, c.url) : chip('var(--blue)', `⚙ Claude trabalhando desde ${quando(c.inicio)} · última atualização ${ha(c.atualizado)}`, c.url); }
    if (c.estado === 'erro') return chip('var(--red)', `❌ Claude parou com erro às ${quando(c.atualizado)} — abra a tarefa`, c.url);
    return chip('var(--gold)', `✅ Claude terminou às ${quando(c.atualizado)}${c.duracao ? ' (' + c.duracao + ')' : ''} — abrindo o PR (até alguns minutos)`, c.url);
  }
  const estrelas = n => '★'.repeat(Math.max(0, Math.min(5, +n || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, +n || 0)));

  function abrir() {
    const box = $('demApp'); if (!box) return;
    box.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(79,124,255,.12),rgba(79,124,255,.03));border:1px solid rgba(79,124,255,.25);border-radius:10px;padding:14px 18px;margin-bottom:12px;">
        <div style="font-family:var(--H);font-size:15px;font-weight:700;">🧠 Esteira de Demandas IA</div>
        <div style="font-size:11px;color:var(--t2);margin-top:3px;line-height:1.6;">O <b>Agente de Produto</b> pensa o Atlantyx OS em ciclos agendados e sugere melhorias. <b>Nada é feito sem a sua aprovação</b>: aprovada, a demanda vira uma tarefa para o Claude no GitHub, que abre um pull request — e só vai para o ar quando você faz o merge.<br>
        Única exceção: <b>🌙 erros encontrados pelo agente de QA de madrugada</b> são corrigidos sozinhos (só se passarem na validação) e ficam listados aqui.</div>
      </div>
      <div class="panel" style="margin-bottom:12px;"><div class="pb" id="demCfg">Carregando...</div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
        <div class="seg" id="demFiltro">${[['todas', 'Todas'], ['produto', '💡 Agente de Produto'], ['qa', '🌙 Correções da madrugada'], ['fundador', '✍ Minhas']].map(([k, r]) => `<button data-f="${k}" class="${k === filtro ? 'on' : ''}" onclick="DEM.filtrar('${k}')">${r}</button>`).join('')}</div>
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
  }
  function card(d) {
    const x = d.dados || {}; const qa = d.squad === 'qa';
    const n = qa ? (x.achados_qa || []).length + (x.achados_seguranca || []).length : 0;
    return `<div onclick="DEM.detalhe('${d.id}')" style="background:var(--bg3);border:1px solid ${d.status === 'sugerida' ? 'rgba(245,166,35,.45)' : 'var(--bd)'};border-radius:6px;padding:8px;margin-bottom:6px;cursor:pointer;">
      <div style="display:flex;gap:4px;align-items:center;margin-bottom:3px;"><span style="font-size:8.5px;font-family:var(--M);padding:1px 5px;border-radius:3px;background:${qa ? 'rgba(156,109,255,.18);color:#b9a0ff' : x.origem === 'fundador' ? 'rgba(34,211,163,.15);color:var(--green)' : 'rgba(79,124,255,.15);color:var(--blue)'};">${qa ? '🌙 QA madrugada' : x.origem === 'fundador' ? '✍ Fundador' : '💡 Produto'}</span>
        ${x.area ? `<span style="font-size:8.5px;color:var(--t3);">${esc(x.area)}</span>` : ''}<span style="flex:1;"></span><span style="font-size:8.5px;color:var(--t3);">${quando(d.criado_em)}</span></div>
      <div style="font-size:11px;font-weight:600;line-height:1.35;">${esc(d.titulo)}</div>
      <div style="font-size:9.5px;color:var(--t2);margin-top:3px;">${qa ? n + ' erro(s)' : `<span style="color:var(--gold);" title="impacto">${estrelas(x.impacto || d.prioridade)}</span> · esforço ${esc(x.esforco || '?')} · risco ${esc(x.risco || '?')}`}</div>
      ${d.issue_numero ? `<div style="font-size:9.5px;margin-top:3px;"><a href="${esc(d.issue_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--blue);">tarefa #${d.issue_numero}</a>${x.pr ? ` · <a href="${esc(x.pr.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--blue);">PR #${x.pr.numero}${x.pr.merged ? ' ✓ no ar' : ''}</a>` : ''}</div>` : ''}
      ${andamento(d)}
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
      : d.status === 'em_execucao' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;">${d.issue_url ? `<a class="btn btn-g" href="${esc(d.issue_url)}" target="_blank" rel="noopener">Abrir tarefa #${d.issue_numero}</a>` : ''}${x.pr ? `<a class="btn btn-p" href="${esc(x.pr.url)}" target="_blank" rel="noopener">${qa ? 'Ver' : 'Revisar e aprovar'} o PR #${x.pr.numero}</a>` : '<span style="color:var(--t2);">O Claude está trabalhando — o PR aparece aqui quando estiver pronto.</span>'}<span style="flex:1;"></span><button class="btn btn-g" onclick="DEM.mover('${d.id}','implementada')">Marcar como implementada</button></div>`
      : `<div style="display:flex;gap:8px;flex-wrap:wrap;">${d.issue_url ? `<a class="btn btn-g" href="${esc(d.issue_url)}" target="_blank" rel="noopener">Tarefa #${d.issue_numero}</a>` : ''}${x.pr ? `<a class="btn btn-g" href="${esc(x.pr.url)}" target="_blank" rel="noopener">PR #${x.pr.numero}</a>` : ''}${['recusada', 'arquivada'].includes(d.status) ? `<button class="btn btn-g" onclick="DEM.mover('${d.id}','sugerida')">↩ Voltar para sugeridas</button>` : ''}<span style="flex:1;"></span><button class="btn btn-g" style="color:var(--red);" onclick="DEM.excluir('${d.id}')">🗑 Excluir</button></div>`;
    const achados = qa ? `${(x.achados_qa || []).length ? '<div style="margin-top:10px;font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);">Erros nas telas</div>' + x.achados_qa.map(a => `<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--bd);"><b>[${esc(a.sev)}] ${esc(a.titulo)}</b> — ${esc(a.rotulo || a.tela || '')}<div style="color:var(--t2);font-size:10.5px;">${esc(a.evidencia || '')}</div></div>`).join('') : ''}
        ${(x.achados_seguranca || []).length ? '<div style="margin-top:10px;font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);">Segurança</div>' + x.achados_seguranca.map(a => `<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--bd);"><b>[${esc(a.severidade)}] ${esc(a.titulo)}</b> — ${esc(a.arquivo || '')}${a.linha ? ':' + a.linha : ''}<div style="color:var(--t2);font-size:10.5px;">${esc(a.evidencia || '')}</div></div>`).join('') : ''}` : '';
    modal(`<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--bd);"><div style="flex:1;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">${esc(d.titulo)}</div>
        <div style="font-size:10.5px;color:var(--t2);">${qa ? '🌙 Correção autônoma da madrugada' : x.origem === 'fundador' ? '✍ Demanda criada por você' : '💡 Sugerida pelo Agente de Produto'} · ${quando(d.criado_em)} · status: <b>${esc(d.status.replace('_', ' '))}</b>${d.decisao_obs ? ' · obs.: ' + esc(d.decisao_obs) : ''}</div></div>
        <button class="btn btn-g" onclick="document.getElementById('demModal').remove()">✕</button></div>
      <div style="padding:6px 18px 14px;">
        ${qa ? '' : `<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--t2);margin-top:6px;"><span>Impacto <b style="color:var(--gold);">${estrelas(x.impacto || d.prioridade)}</b></span><span>Esforço <b>${esc(x.esforco || '?')}</b></span><span>Risco <b>${esc(x.risco || '?')}</b></span><span>Área <b>${esc(x.area || '-')}</b></span>${(x.telas_afetadas || []).length ? `<span>Telas: <b>${esc(x.telas_afetadas.join(', '))}</b></span>` : ''}</div>`}
        ${bloco('Problema', x.problema)}${bloco('Proposta', x.proposta)}${lista('Critérios de aceite', x.criterios_aceite)}${bloco('Como implementar (orientação técnica)', x.como_implementar)}${bloco('Métrica de sucesso', x.metrica_sucesso)}${achados}
      </div><div style="padding:12px 18px;border-top:1px solid var(--bd);background:var(--bg3);border-radius:0 0 12px 12px;">${acao}</div>`);
  }
  async function decidir(id, decisao) {
    const obs = $('demObs')?.value?.trim() || '';
    if (decisao === 'recusar' && !obs) return nota('Escreva o motivo da recusa — o agente usa para não repetir', 'error');
    if (decisao === 'aprovar' && !confirm('Aprovar esta demanda?\n\nEla vira uma tarefa para o Claude no GitHub. Ele implementa numa branch e abre um pull request — que só vai para o ar quando VOCÊ fizer o merge.')) return;
    try { const r = await api('decidir', { id, decisao, obs }); $('demModal')?.remove();
      nota(decisao === 'recusar' ? 'Demanda recusada — o agente vai levar o motivo em conta' : r.issue ? 'Aprovada — tarefa #' + r.issue + ' aberta para o Claude' : (r.aviso || 'Aprovada'), r.aviso ? 'error' : 'success'); await carregar(); }
    catch (e) { nota(e.message, 'error'); }
  }
  async function mover(id, status) { try { await api('mover', { id, status }); $('demModal')?.remove(); await carregar(); } catch (e) { nota(e.message, 'error'); } }
  async function excluir(id) { if (!confirm('Excluir esta demanda da esteira?')) return; try { await api('excluir', { id }); $('demModal')?.remove(); await carregar(); } catch (e) { nota(e.message, 'error'); } }
  function editar(id) {
    const d = (D.demandas || []).find(x => x.id === id); if (!d) return; const x = d.dados || {};
    const campo = (k, rot, v, alto) => `<div class="fg"><label class="fl">${rot}</label>${alto ? `<textarea class="fta" id="demE_${k}" style="min-height:${alto}px;font-size:12px;">${esc(v || '')}</textarea>` : `<input class="fi" id="demE_${k}" value="${esc(v || '')}"/>`}</div>`;
    modal(`<div style="padding:14px 18px;border-bottom:1px solid var(--bd);font-family:var(--H);font-size:14px;font-weight:700;">✎ Editar demanda</div><div style="padding:12px 18px;">
      ${campo('titulo', 'Título', d.titulo)}${campo('problema', 'Problema', x.problema, 70)}${campo('proposta', 'Proposta', x.proposta, 100)}${campo('criterios', 'Critérios de aceite (um por linha)', (x.criterios_aceite || []).join('\n'), 70)}${campo('como', 'Como implementar', x.como_implementar, 90)}
      <div style="display:flex;gap:10px;"><div class="fg"><label class="fl">Impacto (1-5)</label><input class="fi" id="demE_imp" type="number" min="1" max="5" value="${esc(x.impacto || d.prioridade || 3)}"/></div><div class="fg"><label class="fl">Esforço</label><select class="fsel" id="demE_esf">${['P', 'M', 'G'].map(o => `<option ${o === x.esforco ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div></div>
      <div style="padding:12px 18px;border-top:1px solid var(--bd);display:flex;gap:8px;"><button class="btn btn-p" onclick="DEM.salvarEdicao('${id}')">💾 Salvar</button><button class="btn btn-g" onclick="DEM.detalhe('${id}')">Cancelar</button></div>`);
  }
  async function salvarEdicao(id) {
    const v = k => $('demE_' + k)?.value ?? '';
    try { await api('editar', { id, campos: { titulo: v('titulo'), problema: v('problema'), proposta: v('proposta'), como_implementar: v('como'), criterios_aceite: v('criterios').split('\n').map(s => s.trim()).filter(Boolean), prioridade: v('imp'), esforco: v('esf') } });
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
  window.DEM = { abrir, carregar, filtrar, detalhe, decidir, mover, excluir, editar, salvarEdicao, nova, salvarNova, pensar, salvarCfg, _render: render, _estado: () => D };
})();
