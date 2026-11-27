// v3.601 — TIME DE VENDAS VIRTUAL · tela em Vendas. Agentes preparam, pessoas aprovam; nada é enviado por aqui.
// Dados: api/vendas time_* (lib/time-vendas.js). Lê o Playbook (Marketing → Playbook 2027) como Norte.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const S = { d: null, aba: 'fila', filtro: 'pendente', ocupado: false };
  const dt = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const CANAL = { whatsapp: 'WhatsApp', email: 'E-mail', voz: 'Ligação', interno: 'Interno' }, TIPO = { ficha: 'Ficha de abordagem', mensagem: 'Mensagem', email: 'E-mail', roteiro: 'Roteiro de ligação', convite: 'Convite de reunião', briefing: 'Briefing da reunião', follow_proposta: 'Acompanhamento da proposta' };
  async function api(action, payload = {}) {
    const r = await fetch('/api/vendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'Demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (d.success === false || !r.ok) throw new Error(d.error || 'falha'); return d;
  }
  // v3.650: abertura em etapas com barra de progresso — a tela aparece assim que a fila chega; o painel do gerente (lê a Floresta) completa em segundo plano
  const ETAPAS = ['Conectando ao servidor', 'Lendo fila de aprovação, agentes e Playbook', 'Desenhando a tela', 'Calculando o painel do gerente (lendo a Floresta de Vendas)'];
  function barra(n, extra) { const box = $('timevApp'); if (!box || S.d) return; const pct = Math.round((n + 1) / ETAPAS.length * 100);
    box.innerHTML = `<div class="tv-vazio" style="max-width:520px;margin:40px auto;text-align:left;"><div style="font-weight:700;margin-bottom:6px;">Abrindo o time de vendas…</div><div style="height:10px;background:rgba(0,0,0,.1);border-radius:6px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:#00708A;transition:width .4s;"></div></div><div style="margin-top:8px;font-size:12px;">Etapa ${n + 1} de ${ETAPAS.length}: ${ETAPAS[n]}${extra || ''}</div></div>`; }
  async function abrir() { const box = $('timevApp'); if (!box) return; let seg = 0, tk = null;
    if (!S.d) { barra(0); tk = setInterval(() => { seg++; if (!S.d) barra(1, ' · ' + seg + 's' + (seg > 15 ? ' — está demorando mais que o normal' : '')); }, 1000); }
    try { S.d = await api('time_estado', { rapido: true }); } catch (e) { clearInterval(tk); box.innerHTML = `<div class="tv-vazio">Não consegui abrir o time: ${esc(e.message)} <button class="btn" onclick="TIMEV.abrir()">Tentar de novo</button></div>`; return; } finally { clearInterval(tk); }
    try { render(); } catch (e) { box.innerHTML = `<div class="tv-vazio">Erro ao desenhar a tela: ${esc(e.message)}</div>`; console.error('[time-vendas]', e); return; }
    api('time_gerente').then(r => { if (S.d && r.gerente) { S.d.gerente = r.gerente; render(); } }).catch(() => {}); }
  const aba = a => { S.aba = a; render(); };
  const filtro = f => { S.filtro = f; render(); };
  async function rodar(agente) { if (S.ocupado) return; S.ocupado = true; render(); try { const r = await api('time_rodar', agente ? { agente } : {}); nota(r.novos ? `${r.novos} item(ns) novo(s) na fila de aprovação` : 'Nada novo para preparar agora', r.novos ? 'success' : 'info'); S.d = Object.assign(await api('time_estado', { rapido: true }), { gerente: (S.d || {}).gerente }); } catch (e) { nota(e.message, 'error'); } S.ocupado = false; render(); }
  async function decidir(id, decisao) {
    const el = $('tvc_' + id), as = $('tva_' + id), corpo = el ? el.value : undefined, assunto = as ? as.value : undefined; let motivo = '';
    if (decisao === 'rejeitar') { motivo = prompt('Por que rejeitar? (ajuda os agentes a melhorar)') || ''; if (!motivo) return; }
    try { await api('time_decidir', { id, decisao, motivo, corpo, assunto }); nota(decisao === 'aprovar' ? 'Aprovado — agora é só enviar e marcar como enviado' : decisao === 'rejeitar' ? 'Rejeitado' : 'Texto salvo'); S.d = Object.assign(await api('time_estado', { rapido: true }), { gerente: (S.d || {}).gerente }); render(); } catch (e) { nota(e.message, 'error'); }
  }
  async function enviado(id) { try { await api('time_enviado', { id }); nota('Marcado como enviado'); S.d = Object.assign(await api('time_estado', { rapido: true }), { gerente: (S.d || {}).gerente }); render(); } catch (e) { nota(e.message, 'error'); } }
  function copiar(id) { const i = S.d.fila.find(x => x.id === id); if (!i) return; const t = (i.assunto ? i.assunto + '\n\n' : '') + i.corpo; try { navigator.clipboard.writeText(t); nota('Texto copiado'); } catch (_) { nota('Não consegui copiar', 'error'); } }
  async function cfg(patch) { try { await api('time_cfg', { patch }); nota('Salvo'); S.d = Object.assign(await api('time_estado', { rapido: true }), { gerente: (S.d || {}).gerente }); render(); } catch (e) { nota(e.message, 'error'); render(); } }
  const auto = (id, on) => { if (on && !confirm('Atenção: esta versão não tem envio automático. Ligar só registra a sua autorização para a fase seguinte, com as travas. Confirmar?')) { render(); return; } cfg({ autoenvio: { [id]: !!on } }); };
  const limite = (k, v) => cfg({ limites: { [k]: Number(v) } });

  function cardItem(i) {
    const ed = i.estado === 'pendente', cor = i.estado === 'aprovado' ? 'tv-ok' : i.estado === 'rejeitado' ? 'tv-no' : '';
    return `<div class="tv-item ${cor}"><div class="tv-ih"><div><b>${esc(i.nome || 'Lead')}</b> <span class="tv-mut">${esc([i.cargo, i.empresa].filter(Boolean).join(' · '))}</span></div>
      <div class="tv-tags"><span class="tv-tag">${esc((S.d.agentes.find(a => a.id === i.agente) || {}).nome || i.agente)}</span><span class="tv-tag">${esc(CANAL[i.canal] || i.canal)}</span><span class="tv-tag">${esc(TIPO[i.tipo] || i.tipo)}</span><span class="tv-tag ${i.funil === 'wx' ? 'wx' : ''}">${i.funil === 'wx' ? 'Funil WX' : 'Funil padrão'} · ${esc(i.responsavel || '')}</span></div></div>
      ${i.assunto || ed ? `<input class="tv-in" id="tva_${i.id}" value="${esc(i.assunto)}" ${ed ? '' : 'disabled'} placeholder="Assunto (se for e-mail)">` : ''}
      <textarea class="tv-ta" id="tvc_${i.id}" rows="${Math.min(12, Math.max(4, Math.ceil((i.corpo || '').length / 80)))}" ${ed ? '' : 'readonly'}>${esc(i.corpo)}</textarea>
      <div class="tv-por">Por que este texto: ${esc(i.racional || '—')} <span class="tv-mut">· ${esc([i.vertical, i.angulo].filter(Boolean).join(' / '))} · Playbook v${i.playbook_versao ?? '—'} · ${dt(i.criado_em)}</span></div>
      <div class="tv-acoes">${ed ? `<button class="tv-bt p" onclick="TIMEV.decidir('${i.id}','aprovar')">Aprovar</button><button class="tv-bt" onclick="TIMEV.decidir('${i.id}','editar')">Salvar edição</button><button class="tv-bt" onclick="TIMEV.decidir('${i.id}','rejeitar')">Rejeitar</button>`
        : i.estado === 'aprovado' ? `<span class="tv-mut">Aprovado por ${esc(i.decidido_por || '')} em ${dt(i.decidido_em)}</span><button class="tv-bt" onclick="TIMEV.copiar('${i.id}')">Copiar texto</button>${i.enviado ? `<span class="tv-tag ok">Enviado por ${esc(i.enviado_por || '')}</span>` : `<button class="tv-bt p" onclick="TIMEV.enviado('${i.id}')">Já enviei</button>`}`
        : `<span class="tv-mut">Rejeitado por ${esc(i.decidido_por || '')}${i.motivo ? ': ' + esc(i.motivo) : ''}</span><button class="tv-bt" onclick="TIMEV.decidir('${i.id}','reabrir')">Reabrir</button>`}</div></div>`;
  }
  function render() {
    const box = $('timevApp'); if (!box || !S.d) return; const d = S.d, g = d.gerente || {}, fila = d.fila || [], cont = e => fila.filter(i => i.estado === e).length;
    const lista = fila.filter(i => S.filtro === 'todos' || (S.filtro === 'aprovado' ? i.estado === 'aprovado' && !i.enviado : S.filtro === 'enviado' ? i.enviado : i.estado === S.filtro));
    const abas = [['fila', 'Fila de aprovação'], ['time', 'O time'], ['funil', 'Funil'], ...(d.eh_ceo ? [['controle', 'Controle do CEO']] : [])];
    let corpo = '';
    if (S.aba === 'fila') corpo = `<div class="tv-filtros">${[['pendente', 'Para aprovar', cont('pendente')], ['aprovado', 'Aprovados, falta enviar', fila.filter(i => i.estado === 'aprovado' && !i.enviado).length], ['enviado', 'Enviados', fila.filter(i => i.enviado).length], ['rejeitado', 'Rejeitados', cont('rejeitado')], ['todos', 'Todos', fila.length]].map(([k, n, c]) => `<button class="tv-f ${S.filtro === k ? 'on' : ''}" onclick="TIMEV.filtro('${k}')">${n} <b>${c}</b></button>`).join('')}</div>` + (lista.length ? lista.map(cardItem).join('') : `<div class="tv-vazio">${fila.length ? 'Nada nesta lista.' : 'A fila está vazia. Clique em “Preparar abordagens agora” para os agentes trabalharem o funil.'}</div>`);
    else if (S.aba === 'time') corpo = `<p class="tv-ex">Cada agente cuida de uma etapa do funil e escreve com a linguagem e os ângulos do Playbook. Todos só preparam; quem aprova é a pessoa responsável pelo funil.</p><div class="tv-grid">${d.agentes.map(a => { const p = (g.por_agente || {})[a.id] || {}; return `<div class="tv-ag"><b>${esc(a.nome)}</b><small>${esc(a.cargo)} · ${esc(CANAL[a.canal])}</small><p>${esc(a.missao)}</p><div class="tv-nums"><span>${p.pendente || 0} p/ aprovar</span><span>${p.aprovado || 0} aprovados</span><span>${p.enviado || 0} enviados</span></div>${a.id === 'gerente' ? '' : `<button class="tv-bt" ${S.ocupado ? 'disabled' : ''} onclick="TIMEV.rodar('${a.id}')">Preparar só este</button>`}</div>`; }).join('')}</div>`;
    else if (S.aba === 'funil') corpo = `<div class="tv-nums g"><span><b>${g.fila_pendente ?? 0}</b> para aprovar</span><span><b>${g.pendentes_ha_mais_de_2_dias ?? 0}</b> parados há mais de 2 dias</span><span><b>${g.taxa_aprovacao_pct == null ? '—' : g.taxa_aprovacao_pct + '%'}</b> aprovação</span></div><h4 class="tv-h4">Leads por etapa</h4><div class="tv-et">${Object.entries(g.cards_por_etapa || {}).map(([k, n]) => `<div><b>${n}</b><small>${esc(k)}</small></div>`).join('') || '<span class="tv-mut">Sem dados do funil.</span>'}</div>`;
    else { const c = d.cfg || {}, L = c.limites || {}; corpo = `<div class="tv-aviso">Envio automático <b>não existe nesta versão</b>. As chaves abaixo guardam a sua autorização e as travas para a fase seguinte. Nascem desligadas e só o CEO mexe.</div>
      <div class="tv-ctl"><label><input type="checkbox" ${c.desligar_tudo ? 'checked' : ''} onchange="TIMEV.cfg({desligar_tudo:this.checked})"> <b>Desligar o time inteiro</b> (chave geral: ninguém prepara nem envia)</label>
      <label><input type="checkbox" ${c.rodar_automatico ? 'checked' : ''} onchange="TIMEV.cfg({rodar_automatico:this.checked})"> <b>Preparar sozinho nos dias úteis, 7h30</b> (continua indo só para a fila)</label></div>
      <h4 class="tv-h4">Autorização de envio por agente</h4><div class="tv-grid">${d.agentes.filter(a => a.id !== 'gerente' && a.id !== 'prospector' && a.id !== 'preparador').map(a => `<label class="tv-sw"><input type="checkbox" ${a.autoenvio ? 'checked' : ''} onchange="TIMEV.auto('${a.id}',this.checked)"> ${esc(a.nome)}</label>`).join('')}</div>
      <h4 class="tv-h4">Limites e travas</h4><div class="tv-lim">${[['por_agente_rodada', 'Itens por agente a cada rodada'], ['total_rodada', 'Itens por rodada (todos)'], ['repetir_apos_dias', 'Dias até abordar o mesmo lead de novo'], ['envio_dia', 'Envios por dia (futuro)'], ['hora_ini', 'Hora inicial de envio'], ['hora_fim', 'Hora final de envio']].map(([k, n]) => `<label>${n}<input type="number" value="${L[k] ?? ''}" onchange="TIMEV.limite('${k}',this.value)"></label>`).join('')}</div>
      <ul class="tv-trv"><li>Só item aprovado por uma pessoa pode sair.</li><li>Nunca para contato sem consentimento ou que pediu para não receber.</li><li>Para a cadência assim que o contato responde.</li><li>Só em horário comercial, dias úteis, com cópia para o vendedor e registro de tudo.</li></ul>`; }
    box.innerHTML = `<div class="tv-top"><div><h1>Time de vendas virtual</h1><p class="tv-tese">${d.playbook ? esc(d.playbook.tese) : 'O Playbook ainda não existe: abra Marketing → Playbook 2027 para o time ter o Norte.'}</p></div>
      <div class="tv-topb"><button class="tv-bt p" ${S.ocupado || !d.playbook ? 'disabled' : ''} onclick="TIMEV.rodar()">${S.ocupado ? 'Preparando… (até 1 minuto)' : 'Preparar abordagens agora'}</button></div></div>
      <div class="tv-aviso">${esc(d.aviso)} Aprovam: Patricia (funil WX), Ademir (funil padrão) e o CEO (todos).</div>
      <div class="tv-abas">${abas.map(([k, n]) => `<button class="tv-aba ${S.aba === k ? 'on' : ''}" onclick="TIMEV.aba('${k}')">${n}${k === 'fila' && cont('pendente') ? ` <span class="tv-bd">${cont('pendente')}</span>` : ''}</button>`).join('')}</div>${corpo}`;
  }
  window.TIMEV = { abrir, aba, filtro, rodar, decidir, enviado, copiar, cfg, auto, limite };
})();
