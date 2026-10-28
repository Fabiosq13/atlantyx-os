// v3.151 — ESTRATÉGIA IA (ATLAS) · PROPÓSITO E METAS (NORTE) · SALA DE ESTRATÉGIA · trilha T3
// Chat e voz (reconhecimento de fala pt-BR + leitura em voz alta), comitê de IAs com rodadas, síntese em plano,
// aprovação como plano vigente e envio das iniciativas para a Esteira de Demandas, Pipeline de Ideias ou reunião semanal.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  let D = null, aba = 'atlas', conv = { atlas: null, norte: null }, msgs = { atlas: [], norte: [] }, sala = null, vozLigada = false, modoConversa = false, ouvindo = null, enviando = false;
  async function api(action, body = {}) {
    const r = await fetch('/api/estrategia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'A IA demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (!d.success) throw new Error(d.error || 'falha'); return d;
  }
  const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^### (.+)$/gm, '<div style="font-weight:700;margin-top:6px;">$1</div>').replace(/^## (.+)$/gm, '<div style="font-weight:700;font-size:13px;margin-top:8px;">$1</div>')
    .replace(/^[-•] (.+)$/gm, '<div style="padding-left:12px;">• $1</div>').replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:12px;">$1. $2</div>').replace(/\n/g, '<br>').replace(/(<\/div>)<br>/g, '$1');
  const AG = k => D?.agentes?.[k] || { nome: k, cor: '#888', papel: '' };
  const quando = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // ── voz ──
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function falar(texto, agente, aoTerminar) {
    if (!window.speechSynthesis) { aoTerminar && aoTerminar(); return; }
    const limpo = String(texto).replace(/[*#_`>|]/g, '').replace(/\n+/g, '. ').substring(0, 1800);
    const u = new SpeechSynthesisUtterance(limpo); u.lang = 'pt-BR';
    const vozes = speechSynthesis.getVoices().filter(v => /pt[-_]BR/i.test(v.lang)); if (vozes.length) u.voice = vozes[Math.abs(String(agente || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % vozes.length];
    const v = AG(agente).voz || {}; u.pitch = v.pitch || 1; u.rate = v.rate || 1.02;
    u.onend = () => aoTerminar && aoTerminar(); u.onerror = () => aoTerminar && aoTerminar(); speechSynthesis.speak(u);
  }
  function calar() { try { speechSynthesis.cancel(); } catch (_) {} }
  function ouvir(alvoId, aoFinal) {
    if (!SR) { nota('Este navegador não reconhece voz — use o Chrome ou o Edge', 'error'); return; }
    if (ouvindo) { ouvindo.stop(); return; }
    calar(); const r = new SR(); r.lang = 'pt-BR'; r.interimResults = true; r.continuous = false; ouvindo = r; let final = '';
    const el = $(alvoId), base = el ? el.value : ''; marcaMic(true);
    r.onresult = e => { let parc = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) final += e.results[i][0].transcript; else parc += e.results[i][0].transcript; } if (el) el.value = (base ? base + ' ' : '') + final + parc; };
    r.onerror = e => { if (e.error === 'not-allowed') nota('Libere o microfone no cadeado da barra de endereço', 'error'); };
    r.onend = () => { ouvindo = null; marcaMic(false); if (final.trim() && aoFinal) aoFinal(); else if (modoConversa && !final.trim()) modoConversa = false, render(); };
    r.start();
  }
  function marcaMic(on) { document.querySelectorAll('.estMic').forEach(b => { b.style.background = on ? 'var(--red)' : ''; b.style.color = on ? '#fff' : ''; b.textContent = on ? '⏺ ouvindo…' : '🎤 Falar'; }); }

  // ── layout ──
  function abrir(qual) {
    const box = $('estApp'); if (!box) return; if (qual) aba = qual;
    box.innerHTML = `<div style="background:linear-gradient(135deg,rgba(0,196,204,.12),rgba(124,156,255,.06));border:1px solid rgba(0,196,204,.3);border-radius:10px;padding:14px 18px;margin-bottom:12px;">
        <div style="font-family:var(--H);font-size:15px;font-weight:700;">🧠 Estratégia IA</div>
        <div style="font-size:11px;color:var(--t2);margin-top:3px;line-height:1.6;"><b>ATLAS</b> é o estrategista-chefe: conversa com você por <b>chat ou voz</b> com os números vivos da empresa. <b>NORTE</b> é o mentor de propósito e metas: alinha as suas metas pessoais ao seu propósito e ao da Atlantyx. Na <b>Sala de Estratégia</b>, o ATLAS conduz um comitê de IAs (CFO, CRO, CTO, COO, Advogado do Diabo, Voz do Cliente e NORTE) e fecha num plano que você aprova e transforma em demandas, ideias ou pauta de reunião.</div></div>
      <div class="seg" id="estAbas" style="margin-bottom:10px;">${[['atlas', '🧠 ATLAS · Estratégia'], ['norte', '🧭 NORTE · Propósito e metas'], ['sala', '🏛 Sala de Estratégia'], ['plano', '📜 Plano vigente e premissas']].map(([k, r]) => `<button data-a="${k}" class="${k === aba ? 'on' : ''}" onclick="EST.aba('${k}')">${r}</button>`).join('')}</div>
      <div id="estCorpo"><div style="padding:30px;text-align:center;color:var(--t3);font-size:11px;">Carregando…</div></div>`;
    carregar();
  }
  async function carregar() { try { D = await api('inicio'); render(); } catch (e) { $('estCorpo').innerHTML = `<div style="color:var(--red);font-size:12px;padding:12px;">${esc(e.message)}</div>`; } }
  function trocar(k) { aba = k; document.querySelectorAll('#estAbas button').forEach(b => b.classList.toggle('on', b.dataset.a === k)); calar(); render(); }
  function render() { if (!D) return; if (aba === 'atlas' || aba === 'norte') renderChat(aba); else if (aba === 'sala') renderSalas(); else renderPlano(); }

  // ── chat (ATLAS / NORTE) ──
  function renderChat(p) {
    const A = AG(p), L = (D.conversas || []).filter(c => (p === 'norte') === String(c.titulo || '').startsWith('🧭')), M = msgs[p];
    const sug = p === 'atlas' ? ['Qual deve ser o nosso produto-âncora nos próximos 18 meses?', 'Onde estamos perdendo margem e o que fazer?', 'Como chegar a 30% de receita recorrente até 2027?', 'O que os números desta semana dizem sobre o ano?']
      : ['Me ajude a transformar meu propósito em 3 metas para este ano', 'Minhas metas pessoais e as da empresa estão competindo?', 'Monte uma revisão semanal de 15 minutos para mim', 'O que eu deveria parar de fazer para viver meu propósito?'];
    $('estCorpo').innerHTML = `<div style="display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:10px;" class="est-grid">
      <div class="panel"><div class="pb" style="padding:8px;"><button class="btn btn-g" style="width:100%;font-size:10.5px;margin-bottom:6px;" onclick="EST.nova('${p}')">＋ Nova conversa</button>
        ${L.map(c => `<div onclick="EST.abrirConversa('${c.id}','${p}')" style="cursor:pointer;font-size:11px;padding:6px;border-radius:6px;margin-bottom:2px;${conv[p] === c.id ? 'background:var(--bg3);' : ''}"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(String(c.titulo).replace(/^🧭 /, ''))}</div><div style="font-size:9.5px;color:var(--t3);">${quando(c.atualizado_em)}</div></div>`).join('') || '<div style="font-size:10.5px;color:var(--t3);padding:6px;">Nenhuma conversa ainda.</div>'}
        ${p === 'norte' ? `<div style="border-top:1px solid var(--bd);margin-top:8px;padding-top:8px;font-size:10.5px;line-height:1.5;color:var(--t2);">O NORTE lê o que você preencheu em <a href="#" onclick="event.preventDefault();nav('s1proposito',document.querySelector('.sbi[onclick*=s1proposito]'))">S1 · Propósito e Metas Pessoais</a>.<button class="btn btn-gn" style="width:100%;font-size:10.5px;margin-top:6px;" id="estBtNorte" onclick="EST.nortePlano()">🧭 Gerar plano de alinhamento</button><button class="btn btn-g" style="width:100%;font-size:10.5px;margin-top:5px;" onclick="EST.norteVer()">📄 Ver o último plano</button></div>` : ''}
      </div></div>
      <div class="panel" style="display:flex;flex-direction:column;min-height:520px;"><div class="pb" style="display:flex;flex-direction:column;flex:1;min-height:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="width:10px;height:10px;border-radius:50%;background:${A.cor};"></span><b style="font-size:13px;">${esc(A.nome)}</b><span style="font-size:11px;color:var(--t2);">${esc(A.papel)}</span><span style="flex:1;"></span>
          <label style="font-size:10.5px;display:flex;gap:4px;align-items:center;cursor:pointer;"><input type="checkbox" ${vozLigada ? 'checked' : ''} onchange="EST.voz(this.checked)"/> 🔊 responder em voz</label>
          <button class="btn ${modoConversa ? 'btn-p' : 'btn-g'}" style="font-size:10px;" onclick="EST.conversaVoz('${p}')" title="Mãos livres: você fala, ele responde em voz e volta a ouvir">${modoConversa ? '⏹ Encerrar conversa por voz' : '🎙 Conversa por voz'}</button></div>
        <div id="estMsgs" style="flex:1;overflow-y:auto;min-height:300px;max-height:56vh;padding:4px 2px;">${M.length ? M.map(m => bolha(m, p)).join('') : `<div style="color:var(--t3);font-size:11.5px;padding:10px 0;">Pergunte qualquer coisa. Sugestões:</div>${sug.map(s => `<button class="btn btn-g" style="font-size:11px;margin:0 6px 6px 0;text-align:left;" onclick="EST.enviar('${p}',${esc(JSON.stringify(s))})">${esc(s)}</button>`).join('')}`}</div>
        ${p === 'norte' && D.norte_plano ? '' : ''}
        <div style="display:flex;gap:6px;margin-top:8px;align-items:flex-end;"><textarea class="fta" id="estTxt" style="min-height:52px;font-size:12.5px;flex:1;" placeholder="Escreva ou clique em 🎤 e fale…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();EST.enviar('${p}')}"></textarea>
          <div style="display:flex;flex-direction:column;gap:4px;"><button class="btn btn-g estMic" style="font-size:10.5px;" onclick="EST.ouvir('${p}')">🎤 Falar</button><button class="btn btn-gn" style="font-size:10.5px;" id="estBtEnv" onclick="EST.enviar('${p}')">Enviar ➤</button></div></div>
      </div></div></div>`;
    rolar();
  }
  const bolha = (m, p) => m.role === 'user' ? `<div style="display:flex;justify-content:flex-end;margin:6px 0;"><div style="max-width:78%;background:rgba(79,124,255,.15);border:1px solid rgba(79,124,255,.3);border-radius:10px 10px 2px 10px;padding:7px 10px;font-size:12.5px;">${m.voz ? '🎤 ' : ''}${esc(m.content)}</div></div>`
    : `<div style="display:flex;gap:8px;margin:8px 0;"><span style="width:26px;height:26px;flex-shrink:0;border-radius:50%;background:${AG(p).cor};color:#0B1226;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;">${esc(AG(p).nome.substring(0, 2))}</span><div style="max-width:85%;background:var(--bg3);border:1px solid var(--bd);border-radius:2px 10px 10px 10px;padding:8px 11px;font-size:12.5px;line-height:1.6;">${m.pensando ? '<span style="color:var(--t3);">pensando com os números da empresa…</span>' : md(m.content)}${!m.pensando && window.speechSynthesis ? `<div style="margin-top:4px;"><a href="#" style="font-size:10px;color:var(--t3);" onclick="event.preventDefault();EST.ler(this)" data-t="${esc(m.content)}" data-a="${p}">🔊 ouvir</a></div>` : ''}</div></div>`;
  function rolar() { const b = $('estMsgs'); if (b) b.scrollTop = b.scrollHeight; }
  async function enviar(p, texto) {
    const el = $('estTxt'); const m = String(texto ?? el?.value ?? '').trim(); if (!m || enviando) return;
    enviando = true; if (el) el.value = ''; const veioDaVoz = !!ouvindo || modoConversa || window._estUltimaVoz; window._estUltimaVoz = false;
    msgs[p].push({ role: 'user', content: m, voz: veioDaVoz }, { role: 'assistant', content: '', pensando: true }); renderChat(p); const bt = $('estBtEnv'); if (bt) bt.disabled = true;
    try { const r = await api('chat', { conversa_id: conv[p], mensagem: m, voz: vozLigada || modoConversa, persona: p });
      conv[p] = r.conversa_id; msgs[p].pop(); msgs[p].push({ role: 'assistant', content: r.resposta }); renderChat(p);
      if (!D.conversas.some(c => c.id === r.conversa_id)) D.conversas.unshift({ id: r.conversa_id, titulo: (p === 'norte' ? '🧭 ' : '') + m.substring(0, 80), atualizado_em: new Date().toISOString() });
      if (vozLigada || modoConversa) falar(r.resposta, p, () => { if (modoConversa && aba === p) setTimeout(() => { window._estUltimaVoz = true; ouvir('estTxt', () => enviar(p)); }, 350); });
    } catch (e) { msgs[p].pop(); msgs[p].push({ role: 'assistant', content: '⚠ ' + e.message }); renderChat(p); modoConversa = false; }
    enviando = false;
  }
  function ouvirChat(p) { window._estUltimaVoz = true; ouvir('estTxt', () => enviar(p)); }
  function conversaVoz(p) { modoConversa = !modoConversa; if (modoConversa) { vozLigada = true; renderChat(p); ouvirChat(p); } else { calar(); if (ouvindo) ouvindo.stop(); renderChat(p); } }
  async function abrirConversa(id, p) { try { const r = await api('conversa', { id }); conv[p] = id; msgs[p] = (r.conversa?.mensagens || []).map(m => ({ role: m.role, content: m.content, voz: m.voz })); renderChat(p); } catch (e) { nota(e.message, 'error'); } }
  function nova(p) { conv[p] = null; msgs[p] = []; renderChat(p); }
  async function nortePlano() {
    const b = $('estBtNorte'); if (b) { b.disabled = true; b.textContent = '⏳ Montando o plano…'; }
    try { const r = await api('norte_plano'); mostrarNorte(r.plano); } catch (e) { nota(e.message, 'error'); } if (b) { b.disabled = false; b.textContent = '🧭 Gerar plano de alinhamento'; }
  }
  async function norteVer() {
    try { const r = await api('norte_obter'); if (!r.plano) return nota(r.tem_proposito ? 'Ainda não há plano — clique em "Gerar plano de alinhamento".' : 'Preencha primeiro S1 · Propósito e Metas Pessoais.', 'warn'); mostrarNorte(r.plano); } catch (e) { nota(e.message, 'error'); }
  }
  function mostrarNorte(P) {
    const sec = (t, h) => h ? `<div style="margin-top:12px;"><div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t2);margin-bottom:4px;">${t}</div>${h}</div>` : '';
    modal(`<div style="padding:14px 18px;border-bottom:1px solid var(--bd);display:flex;gap:10px;align-items:center;"><div style="flex:1;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">🧭 Plano de alinhamento · propósito × metas</div><div style="font-size:10.5px;color:var(--t2);">NORTE · ${quando(P.gerado_em)}</div></div><button class="btn btn-g" onclick="EST.fechar()">✕</button></div>
      <div style="padding:6px 18px 16px;font-size:12.5px;line-height:1.6;"><div style="font-size:15px;font-weight:700;margin-top:10px;color:var(--gold);">“${esc(P.proposito_em_uma_frase)}”</div><div style="margin-top:6px;">${esc(P.como_a_atlantyx_serve_ao_proposito || '')}</div>
      ${sec('Metas pessoais', (P.metas_pessoais || []).map(m => `<div style="padding:5px 0;border-bottom:1px solid var(--bd);"><b>${esc(m.meta)}</b> <span style="font-size:10px;color:var(--t3);">${esc(m.area || '')}</span><div style="font-size:11px;color:var(--t2);">${esc(m.liga_ao_proposito || '')}</div></div>`).join(''))}
      ${sec('Metas da empresa que importam para você', (P.metas_empresa_que_importam || []).map(m => `<div>• <b>${esc(m.meta)}</b> — ${esc(m.por_que_importa_pra_voce || '')}</div>`).join(''))}
      ${sec('Tensões e trocas', (P.tensoes || []).map(t => `<div>⚖ <b>${esc(t.entre)}</b> — ${esc(t.troca_sugerida)}</div>`).join(''))}
      ${sec('Rituais', (P.rituais || []).map(r => `<div>🔁 ${esc(r.ritual)} <span style="color:var(--t3);">(${esc(r.frequencia)})</span></div>`).join(''))}
      ${sec('Próximos 30 dias', (P.proximos_30_dias || []).map(x => `<div>☐ ${esc(x)}</div>`).join(''))}
      ${sec('Perguntas em aberto', (P.perguntas_em_aberto || []).map(x => `<div>? ${esc(x)}</div>`).join(''))}
      <div style="margin-top:12px;"><button class="btn btn-gn" onclick="EST.fechar();EST.aba('norte');EST.enviar('norte','Vamos conversar sobre o meu plano de alinhamento. Comece pelas perguntas em aberto.')">💬 Conversar sobre o plano</button></div></div>`);
  }

  // ── Sala de Estratégia ──
  function renderSalas() {
    const S = D.sessoes || [];
    $('estCorpo').innerHTML = `<div style="display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:10px;" class="est-grid">
      <div class="panel"><div class="pb" style="padding:8px;"><button class="btn btn-gn" style="width:100%;font-size:10.5px;margin-bottom:6px;" onclick="EST.salaNova()">＋ Nova sessão de estratégia</button>
        ${S.map(s => `<div onclick="EST.salaAbrir('${s.id}')" style="cursor:pointer;font-size:11px;padding:6px;border-radius:6px;margin-bottom:2px;${sala?.id === s.id ? 'background:var(--bg3);' : ''}"><div>${esc(s.tema)}</div><div style="font-size:9.5px;color:var(--t3);">${esc({ aberta: 'em debate', sintetizada: 'plano pronto', aprovada: '✔ plano vigente' }[s.status] || s.status)} · ${quando(s.atualizado_em)}</div></div>`).join('') || '<div style="font-size:10.5px;color:var(--t3);padding:6px;">Nenhuma sessão ainda.</div>'}</div></div>
      <div class="panel"><div class="pb" id="estSala">${sala ? '' : salaFormHtml()}</div></div></div>`;
    if (sala) renderSala();
  }
  function salaFormHtml() {
    const ag = Object.entries(D.agentes).filter(([k]) => k !== 'atlas');
    return `<div style="font-size:13px;font-weight:700;margin-bottom:8px;">Nova sessão — o ATLAS conduz, o comitê debate, você decide</div>
      <div class="fg"><label class="fl">Tema estratégico</label><input class="fi" id="estTema" placeholder="ex.: Qual produto vira o nosso âncora em 18 meses?"/></div>
      <div class="fg"><label class="fl">O que precisa sair desta sessão (opcional)</label><input class="fi" id="estObj" placeholder="ex.: decidir 1 produto, metas de ARR por trimestre e o que deixar de fazer"/></div>
      <div class="fg"><label class="fl">Comitê</label>${ag.map(([k, a]) => `<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;margin:4px 0;cursor:pointer;"><input type="checkbox" class="estAg" value="${k}" ${D.comite_padrao.includes(k) ? 'checked' : ''}/><span><b style="color:${a.cor};">${esc(a.nome)}</b> · ${esc(a.papel)}<br><span style="font-size:10.5px;color:var(--t2);">${esc(a.foco)}</span></span></label>`).join('')}</div>
      <button class="btn btn-gn" id="estBtAbrir" onclick="EST.salaCriar()">🏛 Abrir a sala e rodar a 1ª rodada</button>`;
  }
  async function salaCriar() {
    const tema = $('estTema').value.trim(); if (!tema) return nota('Escreva o tema', 'error');
    const b = $('estBtAbrir'); b.disabled = true; b.textContent = '⏳ O comitê está analisando os números… (até 1 min)';
    try { const r = await api('sala_abrir', { tema, objetivo: $('estObj').value, agentes: [...document.querySelectorAll('.estAg')].filter(c => c.checked).map(c => c.value) });
      await api('sala_rodada', { sessao_id: r.sessao_id }); D = await api('inicio'); await salaAbrir(r.sessao_id); }
    catch (e) { nota(e.message, 'error'); b.disabled = false; b.textContent = '🏛 Abrir a sala e rodar a 1ª rodada'; }
  }
  async function salaAbrir(id) { try { sala = (await api('sala_obter', { id })).sessao; renderSalas(); } catch (e) { nota(e.message, 'error'); } }
  function renderSala() {
    const s = sala, F = s.falas || [], rodadas = [...new Set(F.map(f => f.rodada))], Y = s.sintese;
    $('estSala').innerHTML = `<div style="display:flex;gap:8px;align-items:flex-start;"><div style="flex:1;"><div style="font-size:14px;font-weight:700;">${esc(s.tema)}</div>${s.objetivo ? `<div style="font-size:11px;color:var(--t2);">${esc(s.objetivo)}</div>` : ''}
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${['atlas', ...(s.agentes || [])].map(a => `<span style="font-size:9.5px;padding:1px 6px;border-radius:10px;border:1px solid ${AG(a).cor};color:${AG(a).cor};">${esc(AG(a).nome)}</span>`).join('')}</div></div>
        <button class="btn btn-g" style="font-size:10px;" onclick="EST.ouvirRodada()">🔊 Ouvir a última rodada</button><button class="btn btn-g" style="font-size:10px;color:var(--red);" onclick="EST.salaExcluir()">🗑</button></div>
      <div style="margin-top:8px;max-height:52vh;overflow-y:auto;" id="estFalas">${rodadas.map(r => `<div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t3);margin:10px 0 4px;">Rodada ${r}</div>` + F.filter(f => f.rodada === r).map(f => {
        const a = f.autor === 'fundador' ? { nome: 'Você', cor: 'var(--blue)', papel: 'fundador' } : AG(f.autor);
        return `<div style="border-left:3px solid ${a.cor};background:var(--bg3);border-radius:0 8px 8px 0;padding:7px 10px;margin-bottom:6px;"><div style="font-size:10.5px;font-weight:700;color:${a.cor};">${esc(a.nome)} <span style="font-weight:400;color:var(--t3);">${esc(a.papel || '')}</span></div><div style="font-size:12px;line-height:1.6;margin-top:2px;">${md(f.texto)}</div></div>`; }).join('')).join('')}</div>
      <div style="display:flex;gap:6px;margin-top:8px;align-items:flex-end;"><textarea class="fta" id="estInterv" style="min-height:46px;font-size:12px;flex:1;" placeholder="Intervenha: uma pergunta, uma premissa nova, uma restrição… (opcional)"></textarea>
        <div style="display:flex;flex-direction:column;gap:4px;"><button class="btn btn-g estMic" style="font-size:10.5px;" onclick="EST.ouvirSala()">🎤 Falar</button><button class="btn btn-p" style="font-size:10.5px;" id="estBtRod" onclick="EST.rodada()">▶ Próxima rodada</button></div></div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;"><button class="btn btn-gn" id="estBtSin" onclick="EST.sintese()">🧩 ${Y ? 'Refazer a síntese' : 'Fechar: sintetizar o plano'}</button>${Y && s.status !== 'aprovada' ? `<button class="btn btn-p" onclick="EST.aprovar()">✅ Aprovar como plano vigente</button>` : ''}${s.status === 'aprovada' ? '<span style="font-size:11px;color:var(--green);align-self:center;">✔ Este é o plano vigente</span>' : ''}</div>
      ${Y ? sinteseHtml(s) : ''}`;
    const f = $('estFalas'); if (f) f.scrollTop = f.scrollHeight;
  }
  function sinteseHtml(s) {
    const Y = s.sintese, feitos = Object.fromEntries((s.acoes || []).filter(a => !a.erro && !a.sintese_anterior).map(a => [a.indice, a]));
    const sec = (t, h) => h ? `<div style="margin-top:10px;"><div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t2);margin-bottom:3px;">${t}</div>${h}</div>` : '';
    return `<div style="margin-top:12px;border:1px solid rgba(0,196,204,.4);border-radius:10px;padding:12px;background:rgba(0,196,204,.05);font-size:12.5px;line-height:1.6;">
      <div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t2);">Decisão</div><div style="font-size:14px;font-weight:700;">${esc(Y.decisao)}</div><div style="margin-top:4px;color:var(--t2);">${esc(Y.racional || '')}</div>
      ${sec('Objetivos e resultados-chave', (Y.objetivos || []).map(o => `<div style="margin-bottom:4px;"><b>${esc(o.objetivo)}</b>${(o.kr || []).map(k => `<div style="padding-left:12px;">• ${esc(k)}</div>`).join('')}</div>`).join(''))}
      ${sec('Iniciativas — escolha para onde vai cada uma', `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;"><tr style="color:var(--t2);text-align:left;"><th style="padding:3px;">Iniciativa</th><th style="padding:3px;">Dono</th><th style="padding:3px;">Prazo</th><th style="padding:3px;">Impacto</th><th style="padding:3px;">Enviar para</th></tr>${(Y.iniciativas || []).map((x, i) => `<tr style="border-top:1px solid var(--bd);"><td style="padding:4px 3px;">${esc(x.titulo)}</td><td style="padding:4px 3px;">${esc(x.dono || '')}</td><td style="padding:4px 3px;">${esc(x.prazo || '')}</td><td style="padding:4px 3px;">${esc(x.impacto || '')}</td>
        <td style="padding:4px 3px;">${feitos[i] ? `<span style="color:var(--green);">✔ ${esc({ demanda: 'Esteira de Demandas', ideia: 'Pipeline de Ideias', pauta: 'pauta ' + (feitos[i].data || '') }[feitos[i].destino])}</span>` : `<select class="fsel estDest" data-i="${i}" style="width:auto;font-size:11px;"><option value="">—</option>${[['demanda', 'Esteira de Demandas'], ['ideia', 'Pipeline de Ideias'], ['pauta', 'Pauta da reunião semanal']].map(([k, r]) => `<option value="${k}" ${x.destino_sugerido === k ? 'selected' : ''}>${r}</option>`).join('')}</select>`}</td></tr>`).join('')}</table></div>
        <div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap;"><select class="fsel" id="estRito" style="width:auto;font-size:11px;"><option value="">reunião semanal…</option></select><button class="btn btn-gn" style="font-size:10.5px;" onclick="EST.acoes()">📤 Enviar as selecionadas</button><span style="font-size:10.5px;color:var(--t3);">Nada é criado sem este clique.</span></div>`)}
      ${sec('Riscos', (Y.riscos || []).map(r => typeof r === 'string' ? `<div>⚠ ${esc(r)}</div>` : `<div>⚠ <b>${esc(r.risco)}</b>${r.mitigacao ? ' — ' + esc(r.mitigacao) : ''}</div>`).join(''))}
      ${sec('O que NÃO fazer', (Y.nao_fazer || []).map(x => `<div>✖ ${esc(x)}</div>`).join(''))}
      ${sec('Próximos 90 dias', (Y.proximos_90_dias || []).map(x => `<div>☐ ${esc(x)}</div>`).join(''))}
      ${sec('Onde o comitê divergiu', (Y.divergencias || []).map(x => `<div>↔ ${esc(x)}</div>`).join(''))}
      ${Y.pergunta_ao_fundador ? sec('A decisão que é só sua', `<div style="font-weight:700;color:var(--gold);">${esc(Y.pergunta_ao_fundador)}</div>`) : ''}</div>`;
  }
  async function carregarRitos() { const sel = $('estRito'); if (!sel || sel.dataset.ok) return; sel.dataset.ok = 1; try { const r = await api('ritos'); sel.innerHTML = '<option value="">reunião semanal…</option>' + r.ritos.map(x => `<option value="${x.id}">${esc(x.nome)} · ${esc(x.proxima_br)}</option>`).join(''); } catch (_) {} }
  async function rodada() {
    const b = $('estBtRod'); b.disabled = true; b.textContent = '⏳ debatendo…';
    try { await api('sala_rodada', { sessao_id: sala.id, intervencao: $('estInterv').value }); await salaAbrir(sala.id); if (vozLigada) ouvirRodada(); } catch (e) { nota(e.message, 'error'); b.disabled = false; b.textContent = '▶ Próxima rodada'; }
  }
  function ouvirRodada() { const F = sala?.falas || []; const ult = F.filter(f => f.rodada === Math.max(...F.map(x => x.rodada)) && f.autor !== 'fundador'); calar(); let i = 0; const prox = () => { if (i < ult.length) { const f = ult[i++]; falar(AG(f.autor).nome + '. ' + f.texto, f.autor, prox); } }; prox(); }
  function ouvirSala() { ouvir('estInterv', null); }
  async function sintese() { const b = $('estBtSin'); b.disabled = true; b.textContent = '⏳ ATLAS fechando o plano…'; try { await api('sala_sintese', { sessao_id: sala.id }); await salaAbrir(sala.id); carregarRitos(); } catch (e) { nota(e.message, 'error'); b.disabled = false; b.textContent = '🧩 Tentar de novo'; } }
  async function aprovar() { if (!confirm('Aprovar este plano como o PLANO VIGENTE da Atlantyx?\n\nO ATLAS e o NORTE passam a usá-lo como referência em todas as conversas.')) return; try { await api('sala_aprovar', { sessao_id: sala.id }); D = await api('inicio'); await salaAbrir(sala.id); nota('Plano vigente atualizado'); } catch (e) { nota(e.message, 'error'); } }
  async function acoes() {
    const itens = [...document.querySelectorAll('.estDest')].filter(s => s.value).map(s => ({ indice: +s.dataset.i, destino: s.value }));
    if (!itens.length) return nota('Escolha o destino de pelo menos uma iniciativa', 'error');
    const rito_id = $('estRito')?.value || null; if (itens.some(x => x.destino === 'pauta') && !rito_id) return nota('Escolha a reunião semanal para as iniciativas que vão para a pauta', 'error');
    if (!confirm(`Enviar ${itens.length} iniciativa(s)?\n\nDemandas entram como SUGERIDAS na Esteira (você ainda aprova); ideias entram como Recebidas no Pipeline; pautas entram na próxima reunião escolhida.`)) return;
    const bt = document.activeElement && document.activeElement.tagName === 'BUTTON' ? document.activeElement : null; if (bt) { if (bt.disabled) return; bt.disabled = true; } // v3.298: sem clique duplo
    try { const r = await api('sala_acoes', { sessao_id: sala.id, itens, rito_id }); const ok = r.feitos.filter(f => !f.erro).length, er = r.feitos.filter(f => f.erro); nota(ok + ' enviada(s)' + (er.length ? ' · ' + er.length + ' com erro: ' + er[0].erro : ''), er.length ? 'error' : 'success'); await salaAbrir(sala.id); }
    catch (e) { nota(e.message, 'error'); } finally { if (bt) bt.disabled = false; }
  }
  function salaNova() { sala = null; renderSalas(); }
  async function salaExcluir() { if (!confirm('Excluir esta sessão?')) return; try { await api('sala_excluir', { id: sala.id }); sala = null; D = await api('inicio'); renderSalas(); } catch (e) { nota(e.message, 'error'); } }

  // ── plano vigente e premissas ──
  function renderPlano() {
    const P = D.plano;
    $('estCorpo').innerHTML = `<div class="panel" style="margin-bottom:10px;"><div class="pb">${P ? `<div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t2);">Plano vigente · aprovado ${quando(P.aprovado_em)} · ${esc(P.tema)}</div>` + sinteseHtml({ sintese: P.sintese, acoes: [] }).replace(/<select[\s\S]*?<\/select>/g, '').replace(/<div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap;">[\s\S]*?Nada é criado sem este clique.<\/span><\/div>/, '')
        : '<div style="font-size:12px;color:var(--t2);">Ainda não há plano vigente. Abra uma sessão na <b>Sala de Estratégia</b>, sintetize e aprove.</div>'}</div></div>
      <div class="panel"><div class="pb"><div style="display:flex;align-items:center;gap:8px;"><b style="font-size:13px;">Premissas estratégicas</b><span style="font-size:10.5px;color:var(--t3);">${D.premissas_padrao ? 'texto inicial — revise e salve' : 'editadas por você'} · o ATLAS, o NORTE e o comitê partem daqui</span></div>
        <textarea class="fta" id="estPrem" style="min-height:200px;font-size:12.5px;margin-top:6px;">${esc(D.premissas)}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px;"><button class="btn btn-gn" onclick="EST.salvarPrem()">💾 Salvar premissas</button><button class="btn btn-g" onclick="EST.atualizarCtx(this)">↻ Atualizar os números que a IA enxerga</button></div></div></div>`;
  }
  async function salvarPrem() { try { await api('premissas_salvar', { texto: $('estPrem').value }); D = await api('inicio'); nota('Premissas salvas'); renderPlano(); } catch (e) { nota(e.message, 'error'); } }
  async function atualizarCtx(b) { b.disabled = true; b.textContent = '⏳ lendo financeiro, vendas, projetos, ideias…'; try { const r = await api('contexto', { forcar: true }); nota('Números atualizados (' + quando(r.contexto.em) + ')'); } catch (e) { nota(e.message, 'error'); } b.disabled = false; b.textContent = '↻ Atualizar os números que a IA enxerga'; }

  function modal(html) { let m = $('estModal'); if (m) m.remove(); m = document.createElement('div'); m.id = 'estModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px;'; m.addEventListener('click', e => { if (e.target === m) m.remove(); }); m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:12px;width:min(760px,100%);">${html}</div>`; document.body.appendChild(m); }
  function ler(a) { calar(); falar(a.dataset.t, a.dataset.a); }
  if (!document.getElementById('estCss')) { const st = document.createElement('style'); st.id = 'estCss'; st.textContent = '@media(max-width:820px){.est-grid{grid-template-columns:1fr!important;}}'; document.head.appendChild(st); }
  window.EST = { abrir, norteVer, aba: trocar, enviar, ouvir: ouvirChat, conversaVoz, voz: v => { vozLigada = v; if (!v) calar(); }, abrirConversa, nova, nortePlano, salaNova, salaCriar, salaAbrir, rodada, ouvirRodada, ouvirSala, sintese, aprovar, acoes, salaExcluir, salvarPrem, atualizarCtx, ler, fechar: () => $('estModal')?.remove(), _estado: () => ({ D, sala, msgs }) };
  // carrega a lista de reuniões quando a síntese aparece
  new MutationObserver(() => carregarRitos()).observe(document.body, { childList: true, subtree: true });
})();
