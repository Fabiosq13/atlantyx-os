// v3.147 — REUNIÕES SEMANAIS (ritos recorrentes com pauta automática) · trilha T3
// Ritos com dia/hora editáveis → convite de calendário por e-mail → pauta montada pelo sistema na véspera →
// sala da reunião (assuntos para batimento: tratado/adiado, decisão, dono, prazo) → ata por IA → pendências voltam na semana seguinte.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  let D = null, sala = null, salvarTm = null;
  async function api(action, body = {}) {
    const r = await fetch('/api/reunioes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status }));
    if (!d.success) throw new Error((d.error || 'falha') + (d.hint ? ' — ' + d.hint : '')); return d;
  }
  const quando = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const br = iso => iso ? iso.split('-').reverse().join('/') : '';
  const DIA_CURTO = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const TIPO = { decisao: ['decisão', 'var(--red)'], risco: ['risco', 'var(--gold)'], acompanhamento: ['acompanhamento', 'var(--blue)'] };
  const ST = { planejada: 'planejada', pauta_enviada: 'pauta enviada', em_andamento: 'em andamento', realizada: 'realizada' };

  function modal(html, largura) {
    let m = $('ritModal'); if (m) m.remove();
    m = document.createElement('div'); m.id = 'ritModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px;';
    m.addEventListener('click', e => { if (e.target === m) fechar(); });
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:12px;width:min(${largura || 860}px,100%);box-shadow:0 20px 60px rgba(0,0,0,.5);">${html}</div>`;
    document.body.appendChild(m); return m;
  }
  function fechar() { $('ritModal')?.remove(); if (sala) { clearTimeout(salvarTm); sala = null; } }
  const cab = (titulo, sub) => `<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--bd);"><div style="flex:1;min-width:0;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">${titulo}</div>${sub ? `<div style="font-size:10.5px;color:var(--t2);margin-top:2px;">${sub}</div>` : ''}</div><button class="btn btn-g" onclick="RITOS.fechar()">✕</button></div>`;

  function abrir() {
    const box = $('ritApp'); if (!box) return;
    box.innerHTML = `<div style="background:linear-gradient(135deg,rgba(0,196,204,.12),rgba(0,196,204,.03));border:1px solid rgba(0,196,204,.3);border-radius:10px;padding:14px 18px;margin-bottom:12px;">
        <div style="font-family:var(--H);font-size:15px;font-weight:700;">📅 Reuniões Semanais</div>
        <div style="font-size:11px;color:var(--t2);margin-top:3px;line-height:1.6;">Cada rito é uma reunião semanal com <b>dia e hora editáveis</b>. O convite vai por e-mail com o <b>convite de calendário</b> (aceitar bloqueia a agenda). Na véspera, às 8h, o sistema <b>monta a pauta com os dados vivos</b> (projetos, ideias, funil e vendas) e manda aos participantes. Na <b>sala da reunião</b> vocês fazem o batimento de cada assunto — tratado ou adiado, decisão, dono e prazo — e a IA escreve a ata. O que ficar pendente volta sozinho na semana seguinte.</div></div>
      <div id="ritAviso"></div><div class="panel" style="margin-bottom:12px;"><div class="pb" id="ritSemana">Carregando…</div></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;"><div style="font-family:var(--M);font-size:10px;text-transform:uppercase;color:var(--t2);">Ritos</div><span style="flex:1;"></span>
        <button class="btn btn-g" style="font-size:10.5px;" onclick="RITOS.editar()">＋ Novo rito</button><button class="btn btn-g" style="font-size:10.5px;" onclick="RITOS.carregar()">↻ Atualizar</button></div>
      <div id="ritLista" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px;"></div>`;
    carregar().then(() => { // link direto: ?tela=s0ritos&reuniao=<id> ou &rito=<id> abre a sala
      try { const q = new URLSearchParams(location.search); if (q.get('tela') === 's0ritos' && !window._ritLinkUsado) { window._ritLinkUsado = true; if (q.get('reuniao')) abrirSala({ id: q.get('reuniao') }); else if (q.get('rito')) abrirSala({ rito_id: q.get('rito') }); } } catch (_) {} });
  }
  async function carregar() {
    try { D = await api('ritos'); render(); } catch (e) { const l = $('ritLista'); if (l) l.innerHTML = `<div style="color:var(--red);font-size:11px;">${esc(e.message)}</div>`; }
  }
  function render() {
    const R = D.ritos || [];
    const av = $('ritAviso'); if (av) av.innerHTML = D.email_ok ? '' : '<div style="background:rgba(255,77,109,.1);border:1px solid rgba(255,77,109,.35);border-radius:8px;padding:8px 12px;font-size:11px;margin-bottom:10px;"><b>E-mail não configurado no Vercel</b> (EMAIL_IMAP_PASS ou RESEND_API_KEY) — os convites e as pautas não saem até configurar.</div>';
    // semana: onde cada rito cai
    const sem = $('ritSemana'); if (sem) sem.innerHTML = `<div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t2);margin-bottom:6px;">Cadência da semana</div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;">${[1, 2, 3, 4, 5].map(d => `<div style="background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:8px;min-height:74px;"><div style="font-size:10.5px;font-weight:700;color:var(--t2);margin-bottom:4px;">${DIA_CURTO[d]}</div>
        ${R.filter(r => +r.dia_semana === d).sort((a, b) => a.hora.localeCompare(b.hora)).map(r => `<div onclick="RITOS.abrirSala({rito_id:'${r.id}'})" title="Abrir a sala da próxima reunião" style="cursor:pointer;font-size:11px;padding:4px 6px;border-radius:5px;margin-bottom:4px;background:${r.ativo ? 'rgba(0,196,204,.13)' : 'var(--bg)'};border:1px solid ${r.ativo ? 'rgba(0,196,204,.4)' : 'var(--bd)'};${r.ativo ? '' : 'opacity:.55;'}"><b>${esc(r.hora)}</b> ${esc(r.nome)}<div style="font-size:9.5px;color:var(--t3);">${r.duracao_min} min${r.ativo ? '' : ' · desligado'}</div></div>`).join('') || '<div style="font-size:10px;color:var(--t3);">—</div>'}</div>`).join('')}</div>`;
    const L = $('ritLista'); if (!L) return;
    L.innerHTML = R.map(r => {
      const conv = r.convite_enviado_em ? `<span style="color:var(--green);">✔ convite enviado ${quando(r.convite_enviado_em)}${r.convite_seq ? ' (atualização ' + r.convite_seq + ')' : ''}</span>` : r.ativo ? '<span style="color:var(--gold);">convite ainda não enviado</span>' : '<span style="color:var(--t3);">desligado</span>';
      return `<div style="background:var(--bg3);border:1px solid ${r.ativo ? 'var(--bd)' : 'var(--bd)'};border-radius:10px;padding:12px;${r.ativo ? '' : 'opacity:.75;'}">
        <div style="display:flex;gap:8px;align-items:flex-start;"><div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;">${esc(r.nome)}</div>
          <div style="font-size:11px;color:var(--t2);margin-top:2px;">toda <b>${esc(r.dia_nome)}</b>, <b>${esc(r.hora)}</b> · ${r.duracao_min} min · próxima <b>${esc(r.proxima_br)}</b></div></div>
          <label style="font-size:10px;display:flex;gap:4px;align-items:center;cursor:pointer;" title="Ligar/desligar o rito"><input type="checkbox" ${r.ativo ? 'checked' : ''} onchange="RITOS.alternar('${r.id}',this.checked)"/> ativo</label></div>
        <div style="font-size:10.5px;color:var(--t2);margin-top:6px;line-height:1.5;">${esc(r.objetivo || '')}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">${(r.fontes || []).map(f => `<span style="font-size:9.5px;padding:1px 6px;border-radius:10px;background:rgba(79,124,255,.13);color:var(--blue);">${esc(D.fontes[f] || f)}</span>`).join('')}</div>
        <div style="font-size:10.5px;margin-top:6px;">👥 ${(r.participantes || []).length} participante(s)${(r.participantes || []).length ? ': ' + esc(r.participantes.slice(0, 4).join(', ')) + (r.participantes.length > 4 ? '…' : '') : ''}<br>📨 ${conv} · ${r.auto_pauta ? 'pauta automática na véspera' : 'pauta só manual'}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">
          <button class="btn btn-gn" style="font-size:10px;" onclick="RITOS.abrirSala({rito_id:'${r.id}'})">🚪 Sala da próxima</button>
          ${r.ativo || (r.convite_para || []).length ? `<button class="btn btn-g" style="font-size:10px;" onclick="RITOS.convite('${r.id}')">📨 ${r.ativo ? (r.convite_enviado_em ? 'Reenviar convite' : 'Enviar convite') : 'Cancelar convite'}</button>` : ''}
          <button class="btn btn-g" style="font-size:10px;" onclick="RITOS.editar('${r.id}')">✎ Editar</button>
          <button class="btn btn-g" style="font-size:10px;" onclick="RITOS.baixarIcs('${r.id}')" title="Arquivo de calendário para importar">⬇ .ics</button></div>
        ${(r.reunioes || []).length ? `<div style="margin-top:8px;border-top:1px solid var(--bd);padding-top:6px;">${r.reunioes.map(u => `<div onclick="RITOS.abrirSala({id:'${u.id}'})" style="cursor:pointer;display:flex;gap:6px;font-size:10.5px;padding:2px 0;"><b>${br(u.data)}</b><span style="color:var(--t2);">${esc(ST[u.status] || u.status)}</span><span style="flex:1;"></span><span style="color:var(--t3);">${u.n_assuntos ? u.tratados + '/' + u.n_assuntos + ' tratados' : 'sem pauta'}${u.tem_ata ? ' · ata' : ''}</span></div>`).join('')}</div>` : ''}
      </div>`; }).join('') || '<div style="font-size:11px;color:var(--t3);">Nenhum rito.</div>';
  }
  // ── edição do rito ──
  function editar(id) {
    const r = id ? D.ritos.find(x => x.id === id) : { nome: '', objetivo: '', dia_semana: 4, hora: '10:00', duracao_min: 45, participantes: [], fontes: [], ativo: true, auto_pauta: true };
    modal(cab(id ? '✎ Editar rito' : '＋ Novo rito', 'Mudou dia, hora ou participantes? Depois de salvar, reenvie o convite para atualizar as agendas.') + `<div style="padding:12px 18px;">
      <div class="fg"><label class="fl">Nome</label><input class="fi" id="ritE_nome" value="${esc(r.nome)}" placeholder="ex.: Projetos da semana"/></div>
      <div class="fg"><label class="fl">Objetivo (vai no convite)</label><textarea class="fta" id="ritE_obj" style="min-height:55px;font-size:12px;">${esc(r.objetivo || '')}</textarea></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;"><div class="fg"><label class="fl">Dia da semana</label><select class="fsel" id="ritE_dia">${[1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}" ${+r.dia_semana === d ? 'selected' : ''}>${esc(D.dias[d])}</option>`).join('')}</select></div>
        <div class="fg"><label class="fl">Hora (Brasília)</label><input class="fi" type="time" id="ritE_hora" value="${esc(r.hora)}"/></div>
        <div class="fg"><label class="fl">Duração (min)</label><input class="fi" type="number" min="15" max="240" step="5" id="ritE_dur" value="${r.duracao_min}"/></div></div>
      <div class="fg"><label class="fl">Participantes (e-mails, separados por vírgula ou linha)</label><textarea class="fta" id="ritE_part" style="min-height:60px;font-size:12px;">${esc((r.participantes || []).join(', '))}</textarea></div>
      <div class="fg"><label class="fl">De onde vem a pauta</label>${Object.entries(D.fontes).map(([k, n]) => `<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin:3px 0;cursor:pointer;"><input type="checkbox" class="ritE_f" value="${k}" ${(r.fontes || []).includes(k) ? 'checked' : ''}/> ${esc(n)}</label>`).join('')}</div>
      <label style="display:flex;gap:6px;align-items:center;font-size:12px;cursor:pointer;"><input type="checkbox" id="ritE_auto" ${r.auto_pauta !== false ? 'checked' : ''}/> Montar e enviar a pauta automaticamente na véspera, às 8h</label>
      <label style="display:flex;gap:6px;align-items:center;font-size:12px;cursor:pointer;margin-top:4px;"><input type="checkbox" id="ritE_ativo" ${r.ativo !== false ? 'checked' : ''}/> Rito ativo</label></div>
      <div style="padding:12px 18px;border-top:1px solid var(--bd);display:flex;gap:8px;"><button class="btn btn-p" onclick="RITOS.salvar('${id || ''}')">💾 Salvar</button>${id ? `<span style="flex:1;"></span><button class="btn btn-g" style="color:var(--red);" onclick="RITOS.excluir('${id}')">🗑 Excluir</button>` : ''}</div>`, 640);
  }
  async function salvar(id) {
    const v = k => $('ritE_' + k)?.value ?? '';
    const r = { id: id || null, nome: v('nome').trim(), objetivo: v('obj'), dia_semana: v('dia'), hora: v('hora'), duracao_min: v('dur'), participantes: v('part'),
      fontes: [...document.querySelectorAll('.ritE_f')].filter(c => c.checked).map(c => c.value), auto_pauta: $('ritE_auto').checked, ativo: $('ritE_ativo').checked };
    if (!r.nome) return nota('Dê um nome ao rito', 'error');
    try { const x = await api('rito_salvar', r); fechar(); await carregar(); nota('Rito salvo');
      if (x.convite_desatualizado && confirm('O convite já enviado ficou desatualizado (dia, hora, participantes ou ativação mudaram).\n\nReenviar agora para atualizar as agendas?')) await convite(x.id, true); }
    catch (e) { nota(e.message, 'error'); }
  }
  async function excluir(id) { if (!confirm('Excluir este rito e o histórico das reuniões dele?')) return; try { await api('rito_excluir', { id }); fechar(); await carregar(); } catch (e) { nota(e.message, 'error'); } }
  async function alternar(id, ativo) {
    const r = D.ritos.find(x => x.id === id); try { const x = await api('rito_salvar', { ...r, ativo }); await carregar();
      if (x.convite_desatualizado && confirm(ativo ? 'Reenviar o convite agora?' : 'O rito foi desligado. Enviar o cancelamento para as agendas dos participantes?')) await convite(id, true); }
    catch (e) { nota(e.message, 'error'); }
  }
  async function convite(id, semPerguntar) {
    const r = D.ritos.find(x => x.id === id); if (!r) return;
    const txt = r.ativo ? `Enviar o convite de "${r.nome}" para ${r.participantes.length} participante(s)?\n\nToda ${r.dia_nome}, ${r.hora} (${r.duracao_min} min), a partir de ${r.proxima_br}. Vai por e-mail com o convite de calendário (recorrente) e o link da sala.` : `Enviar o CANCELAMENTO de "${r.nome}" para quem recebeu o convite?`;
    if (!semPerguntar && !confirm(txt)) return;
    try { const x = await api('convite_enviar', { rito_id: id }); nota((x.cancelado ? 'Cancelamento enviado a ' : 'Convite enviado a ') + x.enviado_para.length + ' participante(s)' + (x.via === 'resend' ? ' (pelo Resend)' : '')); await carregar(); }
    catch (e) { nota(e.message, 'error'); }
  }
  async function baixarIcs(id) {
    try { const x = await api('convite_ics', { rito_id: id }); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([x.ics], { type: 'text/calendar' })); a.download = x.nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    catch (e) { nota(e.message, 'error'); }
  }

  // ── sala da reunião ──
  async function abrirSala(q) {
    modal(cab('🚪 Sala da reunião', 'carregando…') + '<div style="padding:30px;text-align:center;color:var(--t3);font-size:11px;">Carregando…</div>', 980);
    try { sala = await api('reuniao_obter', q); renderSala(); } catch (e) { modal(cab('🚪 Sala da reunião') + `<div style="padding:18px;color:var(--red);font-size:12px;">${esc(e.message)}</div>`); }
  }
  function renderSala() {
    const u = sala.reuniao, r = sala.rito, P = u.pauta || null, A = u.assuntos || [];
    const tot = A.reduce((s, a) => s + (+a.minutos || 0), 0), trat = A.filter(a => a.status === 'tratado').length;
    const corpo = !P ? `<div style="padding:24px 18px;text-align:center;"><div style="font-size:12px;color:var(--t2);margin-bottom:10px;">A pauta desta reunião ainda não foi montada${r.auto_pauta ? ' — ela é gerada sozinha na véspera, às 8h, depois que o convite for enviado' : ''}.</div><button class="btn btn-gn" id="ritBtGerar" onclick="RITOS.gerarPauta()">📝 Montar a pauta agora com os dados do sistema</button></div>`
      : `<div style="padding:10px 18px;">
        ${P.abertura ? `<div style="font-size:12.5px;margin-bottom:8px;">${esc(P.abertura)}</div>` : ''}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:11px;color:var(--t2);margin-bottom:6px;"><b style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;">Assuntos para batimento</b><span>${trat}/${A.length} tratados · ${tot} min previstos</span>${P.herdados ? `<span>· ${P.herdados} vieram da reunião anterior</span>` : ''}<span style="flex:1;"></span><span id="ritSalvo" style="color:var(--t3);"></span></div>
        ${A.map((a, i) => { const t = TIPO[a.tipo] || TIPO.acompanhamento; return `<div style="border:1px solid ${a.status === 'tratado' ? 'rgba(34,211,163,.45)' : a.status === 'adiado' ? 'rgba(245,166,35,.45)' : 'var(--bd)'};border-radius:8px;padding:8px 10px;margin-bottom:6px;background:var(--bg3);">
          <div style="display:flex;gap:8px;align-items:flex-start;"><b style="font-size:12px;color:var(--t3);">${i + 1}.</b><div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:600;">${esc(a.titulo)} <span style="font-size:9.5px;font-weight:400;color:${t[1]};border:1px solid ${t[1]};border-radius:10px;padding:0 6px;">${t[0]}</span> <span style="font-size:10px;font-weight:400;color:var(--t3);">${a.minutos} min${a.responsavel ? ' · ' + esc(a.responsavel) : ''}${a.origem ? ' · ' + esc(a.origem) : ''}</span></div>
            <div style="font-size:11px;color:var(--t2);margin-top:2px;">${esc(a.contexto)}</div></div>
            <div class="seg" style="flex-shrink:0;">${[['pendente', '…'], ['tratado', '✔ tratado'], ['adiado', '↷ adiado']].map(([k, rot]) => `<button class="${a.status === k ? 'on' : ''}" style="font-size:10px;" onclick="RITOS.status('${a.id}','${k}')">${rot}</button>`).join('')}</div></div>
          <div style="display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1.2fr) minmax(0,1fr);gap:6px;margin-top:6px;">
            <input class="fi" style="font-size:11.5px;" placeholder="Decisão / encaminhamento" value="${esc(a.decisao)}" oninput="RITOS.campo('${a.id}','decisao',this.value)"/>
            <input class="fi" style="font-size:11.5px;" placeholder="Dono" value="${esc(a.dono)}" oninput="RITOS.campo('${a.id}','dono',this.value)"/>
            <input class="fi" style="font-size:11.5px;" type="date" title="Prazo" value="${esc(a.prazo)}" onchange="RITOS.campo('${a.id}','prazo',this.value)"/></div></div>`; }).join('')}
        <div style="display:flex;gap:6px;margin:6px 0 10px;"><input class="fi" id="ritNovo" style="font-size:11.5px;" placeholder="Incluir assunto levantado na reunião"/><button class="btn btn-g" style="font-size:10.5px;white-space:nowrap;" onclick="RITOS.incluir()">＋ Incluir</button></div>
        <div class="fg"><label class="fl">Notas da reunião (viram a ata)</label><textarea class="fta" id="ritNotas" style="min-height:70px;font-size:12px;" oninput="RITOS.notas(this.value)">${esc(u.notas || '')}</textarea></div>
        <details style="margin-top:6px;"><summary style="cursor:pointer;font-size:11px;color:var(--blue);">Dados usados na pauta (${(P.secoes || []).length} fonte(s) · ${P.via === 'ia' ? 'organizada pela IA' : 'organizada por regras'} · ${quando(P.gerado_em)})</summary>
          ${(P.secoes || []).map(s => `<div style="margin-top:8px;"><div style="font-size:11.5px;font-weight:700;">${esc(s.titulo)}</div>${s.erro ? `<div style="font-size:11px;color:var(--red);">indisponível: ${esc(s.erro)}</div>` : (s.resumo || []).map(l => `<div style="font-size:11px;color:var(--t2);">• ${esc(l)}</div>`).join('')
            + (s.tabela?.linhas?.length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-top:4px;"><tr>${s.tabela.cab.map(c => `<th style="text-align:left;padding:3px 5px;border-bottom:1px solid var(--bd);color:var(--t2);">${esc(c)}</th>`).join('')}</tr>${s.tabela.linhas.map(l => `<tr>${l.map(c => `<td style="padding:3px 5px;border-bottom:1px solid var(--bd);">${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>` : '')}</div>`).join('')}</details>
        ${u.ata ? `<div style="margin-top:10px;border:1px solid var(--bd);border-radius:8px;padding:10px;background:var(--bg3);"><div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t2);margin-bottom:4px;">Ata${u.ata_enviada_em ? ' · enviada ' + quando(u.ata_enviada_em) : ''}</div><div style="font-size:12px;white-space:pre-wrap;line-height:1.55;">${esc(u.ata)}</div></div>` : ''}
      </div>`;
    const m = modal(cab(`🚪 ${esc(r.nome)} · ${br(u.data)} ${esc(r.hora)}`, `${esc(r.dia_nome)} · ${r.duracao_min} min · ${esc(ST[u.status] || u.status)}${u.pauta_enviada_em ? ' · pauta enviada ' + quando(u.pauta_enviada_em) : ''} · ${(r.participantes || []).length} participante(s)`)
      + `<div style="display:flex;gap:6px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid var(--bd);"><a class="btn btn-gn" style="font-size:10.5px;" href="${esc(r.sala_video)}" target="_blank" rel="noopener" onclick="RITOS.emAndamento()">🎥 Entrar na videochamada</a>
        ${P ? `<button class="btn btn-g" style="font-size:10.5px;" id="ritBtGerar" onclick="RITOS.gerarPauta()">↻ Remontar a pauta</button><button class="btn btn-g" style="font-size:10.5px;" onclick="RITOS.previa()">👁 Ver o e-mail da pauta</button><button class="btn btn-g" style="font-size:10.5px;" onclick="RITOS.enviarPauta()">📨 ${u.pauta_enviada_em ? 'Reenviar' : 'Enviar'} a pauta</button>
        <span style="flex:1;"></span><button class="btn btn-p" style="font-size:10.5px;" id="ritBtAta" onclick="RITOS.gerarAta()">✍ ${u.ata ? 'Refazer a ata' : 'Encerrar e gerar a ata'}</button>${u.ata ? `<button class="btn btn-g" style="font-size:10.5px;" onclick="RITOS.enviarAta()">📨 Enviar a ata</button>` : ''}` : ''}</div>` + corpo, 980);
    return m;
  }
  const _assunto = id => (sala?.reuniao?.assuntos || []).find(a => a.id === id);
  function agendarSalvar() { clearTimeout(salvarTm); const el = $('ritSalvo'); if (el) el.textContent = 'salvando…'; salvarTm = setTimeout(salvarSala, 900); }
  async function salvarSala(extra = {}) {
    if (!sala) return; const u = sala.reuniao;
    try { const x = await api('reuniao_salvar', { id: u.id, assuntos: u.assuntos, notas: u.notas || '', ...extra }); u.assuntos = x.assuntos; const el = $('ritSalvo'); if (el) el.textContent = '✔ salvo ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { const el = $('ritSalvo'); if (el) el.textContent = '⚠ ' + e.message; }
  }
  function status(id, st) { const a = _assunto(id); if (!a) return; a.status = st; clearTimeout(salvarTm); salvarSala().then(renderSala); }
  function campo(id, k, v) { const a = _assunto(id); if (!a) return; a[k] = v; agendarSalvar(); }
  function notasSet(v) { if (sala) { sala.reuniao.notas = v; agendarSalvar(); } }
  async function incluir() { const t = ($('ritNovo')?.value || '').trim(); if (!t) return; await salvarSala({ assuntos: [...sala.reuniao.assuntos, { novo: true, titulo: t }] }); renderSala(); }
  async function emAndamento() { if (sala && ['planejada', 'pauta_enviada'].includes(sala.reuniao.status)) { await salvarSala({ status: 'em_andamento' }); sala.reuniao.status = 'em_andamento'; } }
  async function gerarPauta() {
    const b = $('ritBtGerar'); if (b) { b.disabled = true; b.textContent = '⏳ Lendo projetos, ideias, funil e vendas… (até 1 min)'; }
    try { clearTimeout(salvarTm); if (sala.reuniao.pauta) await salvarSala(); const x = await api('pauta_gerar', { rito_id: sala.rito.id, data: sala.reuniao.data });
      nota(x.n_assuntos + ' assunto(s) na pauta' + (x.erros.length ? ' · fontes indisponíveis: ' + x.erros.length : ''), x.erros.length ? 'error' : 'success');
      sala = await api('reuniao_obter', { id: x.reuniao_id }); renderSala(); await carregar(); }
    catch (e) { nota(e.message, 'error'); if (b) { b.disabled = false; b.textContent = '📝 Tentar de novo'; } }
  }
  async function previa() {
    try { const x = await api('pauta_previa', { id: sala.reuniao.id }); const w = window.open('', '_blank'); if (w) { w.document.write('<!doctype html><meta charset="utf-8"><title>Pauta</title><body style="background:#f4f6fb;padding:20px;">' + x.html + '</body>'); w.document.close(); } }
    catch (e) { nota(e.message, 'error'); }
  }
  async function enviarPauta() {
    if (!confirm('Enviar a pauta por e-mail para os ' + (sala.rito.participantes || []).length + ' participante(s)?')) return;
    try { clearTimeout(salvarTm); await salvarSala(); const x = await api('pauta_enviar', { reuniao_id: sala.reuniao.id }); nota('Pauta enviada a ' + x.enviado_para.length + ' participante(s)'); sala = await api('reuniao_obter', { id: sala.reuniao.id }); renderSala(); await carregar(); }
    catch (e) { nota(e.message, 'error'); }
  }
  async function gerarAta() {
    const pend = (sala.reuniao.assuntos || []).filter(a => a.status === 'pendente').length;
    if (pend && !confirm(pend + ' assunto(s) ainda sem batimento (nem tratado nem adiado). Eles voltam na pauta da próxima semana.\n\nEncerrar e gerar a ata assim mesmo?')) return;
    const b = $('ritBtAta'); if (b) { b.disabled = true; b.textContent = '⏳ Escrevendo a ata…'; }
    try { clearTimeout(salvarTm); await salvarSala(); await api('ata_gerar', { id: sala.reuniao.id }); sala = await api('reuniao_obter', { id: sala.reuniao.id }); renderSala(); await carregar(); nota('Ata pronta — revise e envie'); }
    catch (e) { nota(e.message, 'error'); if (b) b.disabled = false; }
  }
  async function enviarAta() {
    if (!confirm('Enviar a ata por e-mail aos participantes?')) return;
    try { const x = await api('ata_enviar', { id: sala.reuniao.id }); nota('Ata enviada a ' + x.enviado_para.length + ' participante(s)'); sala = await api('reuniao_obter', { id: sala.reuniao.id }); renderSala(); }
    catch (e) { nota(e.message, 'error'); }
  }
  window.RITOS = { abrir, carregar, editar, salvar, excluir, alternar, convite, baixarIcs, abrirSala, fechar, status, campo, notas: notasSet, incluir, emAndamento, gerarPauta, previa, enviarPauta, gerarAta, enviarAta, _estado: () => ({ D, sala }) };
})();
