// public/disparo-ui.js — v3.26 · Disparo da campanha por WhatsApp e E-mail
// Abre por DISP.abrir({ canal, campanhaId }). Usa o texto que a IA já gerou para o canal
// (copy_por_rede.whatsapp / .email), escolhe o público, manda um teste, dispara e acompanha.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (t, c) => (window.toast ? toast(t, c || 'success') : alert(t));
  const dt = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  async function api(action, body = {}) {
    const r = await fetch('/api/campanha-disparo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status }));
    if (d.success === false) throw new Error(d.error || 'falha'); return d;
  }
  const ocupado = (btn, txt) => { if (!btn) return () => {}; const o = btn.innerHTML; btn.disabled = true; btn.innerHTML = txt; return () => { btn.disabled = false; btn.innerHTML = o; }; };

  const S = { canal: 'whatsapp', camp: null, dest: [], cfg: null, rodando: false };

  // campAtiva/_todasCampanhas são "let" globais do index.html — não ficam em window; lê pelo escopo global
  const glob = n => { try { return (0, eval)(`typeof ${n} !== 'undefined' ? ${n} : null`); } catch (_) { return null; } };
  function campanhas() {
    const l = (glob('_todasCampanhas') || []).slice();
    const a = glob('campAtiva');
    if (a?.id && !l.some(c => c.id === a.id)) l.unshift(a);
    return l.filter(c => c && c.id);
  }
  function textoDaCampanha(c, canal) {
    const cpr = c?.data?.copy_por_rede || {};
    const v = c?.data?.copy?.versoes?.[0] || {};
    const base = [v.headline, v.corpo].filter(Boolean).join('\n\n');
    if (canal === 'email') return { texto: cpr.email?.texto || base, assunto: cpr.email?.assunto || v.headline || c?.nome || '', daIA: !!cpr.email?.texto };
    return { texto: cpr.whatsapp?.texto || (v.corpo ? v.corpo.substring(0, 600) : base), assunto: '', daIA: !!cpr.whatsapp?.texto };
  }
  function linkPadrao() { try { return typeof linkDestinoPadrao === 'function' ? linkDestinoPadrao() : location.origin + '/captura.html'; } catch (_) { return location.origin + '/captura.html'; } }

  function css() {
    if ($('dpCss')) return;
    const st = document.createElement('style'); st.id = 'dpCss';
    st.textContent = `
#dpOv{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px;}
#dpBox{background:var(--bg2);border:1px solid var(--bd2);border-radius:12px;width:min(980px,100%);color:var(--t1);font-family:var(--B);}
.dp-hd{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--bd);flex-wrap:wrap;}
.dp-tab{background:var(--bg3);border:1px solid var(--bd2);color:var(--t2);border-radius:7px;padding:6px 12px;font-size:11.5px;cursor:pointer;font-weight:600;}
.dp-tab.on{background:var(--b2);border-color:var(--blue);color:var(--t1);}
.dp-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px 18px;}
.dp-card{background:var(--bg3);border:1px solid var(--bd);border-radius:9px;padding:12px 14px;min-width:0;}
.dp-t{font-family:var(--M);font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--t2);margin-bottom:8px;display:flex;align-items:center;gap:6px;}
.dp-n{background:var(--blue);color:#fff;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;}
.dp-in{width:100%;background:var(--bg);border:1px solid var(--bd2);border-radius:6px;color:var(--t1);padding:7px 9px;font-size:12px;font-family:inherit;box-sizing:border-box;}
.dp-lista{max-height:240px;overflow:auto;border:1px solid var(--bd);border-radius:6px;margin-top:8px;}
.dp-lista label{display:flex;gap:8px;align-items:center;padding:5px 8px;border-bottom:1px solid var(--bd);font-size:11px;cursor:pointer;}
.dp-lista label:last-child{border-bottom:none;}
.dp-prev{white-space:pre-wrap;font-size:12px;line-height:1.5;background:#0b141a;color:#e9edef;border-radius:8px;padding:10px 12px;max-height:220px;overflow:auto;}
.dp-prev.em{background:#fff;color:#1d2433;}
.dp-kpi{display:inline-block;margin-right:12px;font-size:10.5px;color:var(--t2);}
.dp-kpi b{color:var(--t1);font-size:13px;}
.dp-hist td,.dp-hist th{padding:6px 8px;border-bottom:1px solid var(--bd);font-size:11px;text-align:left;}
.dp-hist th{color:var(--t2);font-weight:600;font-size:10px;}
@media (max-width:760px){.dp-grid{grid-template-columns:1fr;}}`;
    document.head.appendChild(st);
  }

  async function abrir(op = {}) {
    css();
    S.canal = op.canal === 'email' ? 'email' : 'whatsapp';
    const lista = campanhas();
    S.camp = lista.find(c => c.id === op.campanhaId) || (glob('campAtiva')?.id ? glob('campAtiva') : null) || lista[0] || null;
    S.dest = [];
    let ov = $('dpOv'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'dpOv';
    ov.innerHTML = `<div id="dpBox" role="dialog" aria-label="Disparo da campanha">
      <div class="dp-hd">
        <div style="flex:1;min-width:200px;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">Disparar campanha por WhatsApp / E-mail</div>
          <div style="font-size:10.5px;color:var(--t2);">Usa o texto que a IA gerou para o canal · cada pessoa recebe com o próprio nome · links rastreados até a página de captura</div></div>
        <button class="dp-tab" id="dpTabWa" onclick="DISP.canal('whatsapp')">☎ WhatsApp</button>
        <button class="dp-tab" id="dpTabEm" onclick="DISP.canal('email')">✉ E-mail</button>
        <button class="btn btn-g" onclick="DISP.fechar()" title="Fechar" style="font-size:14px;padding:4px 10px;">✕</button>
      </div>
      <div id="dpCfg" style="padding:0 18px;"></div>
      <div class="dp-grid">
        <div class="dp-card">
          <div class="dp-t"><span class="dp-n">1</span> Mensagem</div>
          <label style="font-size:10.5px;color:var(--t2);">Campanha</label>
          <select class="dp-in" id="dpCamp" onchange="DISP.trocarCamp(this.value)" title="Campanha">${lista.map(c => `<option value="${esc(c.id)}" ${S.camp?.id === c.id ? 'selected' : ''}>${esc(c.nome || c.id)}</option>`).join('') || '<option value="">(disparo avulso — sem campanha)</option>'}</select>
          <div id="dpAssWrap" style="margin-top:8px;"><label style="font-size:10.5px;color:var(--t2);">Assunto do e-mail</label><input class="dp-in" id="dpAssunto" maxlength="90" oninput="DISP.prev()" title="Assunto"/></div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;"><label style="font-size:10.5px;color:var(--t2);">Texto</label><span id="dpOrigemTxt" style="font-size:9.5px;color:var(--t3);"></span></div>
          <textarea class="dp-in" id="dpTexto" rows="8" oninput="DISP.prev()" title="Texto da mensagem"></textarea>
          <div style="font-size:9.5px;color:var(--t3);margin-top:4px;line-height:1.5;">Use <code>{primeiro_nome}</code>, <code>{empresa}</code> e <code>{link}</code>. Sem <code>{link}</code>, o link vai no fim.</div>
          <label style="font-size:10.5px;color:var(--t2);margin-top:8px;display:block;">Link de destino</label>
          <input class="dp-in" id="dpLink" oninput="DISP.prev()" title="Link de destino"/>
          <div style="font-size:9.5px;color:var(--t3);margin-top:3px;">Padrão: página de captura (registra o lead e oferece a reunião). Recebe UTM do canal e da campanha.</div>
        </div>
        <div class="dp-card">
          <div class="dp-t">Prévia <span id="dpPrevQuem" style="text-transform:none;letter-spacing:0;color:var(--t3);"></span></div>
          <div id="dpPrev" class="dp-prev"></div>
          <div style="display:flex;gap:6px;margin-top:10px;">
            <input class="dp-in" id="dpTesteDest" placeholder="Seu WhatsApp ou e-mail para teste" style="flex:1;" title="Destino do teste"/>
            <button class="btn btn-g" id="dpBtnTeste" onclick="DISP.teste(this)">Enviar teste</button>
          </div>
        </div>
        <div class="dp-card" style="grid-column:1/-1;">
          <div class="dp-t"><span class="dp-n">2</span> Para quem</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
            <div style="min-width:180px;flex:1;"><label style="font-size:10.5px;color:var(--t2);">Origem</label>
              <select class="dp-in" id="dpFonte" onchange="DISP.fonteMudou()" title="Origem dos contatos">
                <option value="leads">Leads captados (página de captura)</option>
                <option value="out_leads">Base de prospecção (outbound)</option>
                <option value="hubspot">Contatos do HubSpot</option>
                <option value="manual">Colar uma lista</option>
              </select></div>
            <div id="dpFiltroWrap" style="min-width:150px;"><label style="font-size:10.5px;color:var(--t2);">Filtro</label>
              <select class="dp-in" id="dpFiltro" title="Filtro"></select></div>
            <button class="btn btn-or" id="dpBtnBuscar" onclick="DISP.buscar(this)">Buscar contatos</button>
          </div>
          <textarea class="dp-in" id="dpManual" rows="4" style="display:none;margin-top:8px;" placeholder="Uma pessoa por linha: Nome; Empresa; telefone ou e-mail&#10;Ex.: Ana Souza; CPFL; 19 99999-0000" title="Lista"></textarea>
          <div id="dpPub" style="margin-top:8px;font-size:11px;color:var(--t3);">Escolha a origem e clique em Buscar contatos.</div>
        </div>
        <div class="dp-card" style="grid-column:1/-1;">
          <div class="dp-t"><span class="dp-n">3</span> Disparar</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <div><label style="font-size:10.5px;color:var(--t2);">Quando</label>
              <select class="dp-in" id="dpQuando" onchange="document.getElementById('dpAgWrap').style.display=this.value==='agendar'?'block':'none'" title="Quando enviar" style="width:170px;">
                <option value="agora">Agora</option><option value="agendar">Agendar</option></select></div>
            <div id="dpAgWrap" style="display:none;"><label style="font-size:10.5px;color:var(--t2);">Data e hora</label><input class="dp-in" type="datetime-local" id="dpAgenda" title="Data e hora"/></div>
            <div style="flex:1;min-width:200px;font-size:10.5px;color:var(--t2);line-height:1.5;" id="dpResumo"></div>
            <button class="btn btn-gn" id="dpBtnDisparar" onclick="DISP.disparar(this)" style="font-weight:700;">Disparar</button>
          </div>
          <div id="dpProg" style="margin-top:10px;"></div>
        </div>
        <div class="dp-card" style="grid-column:1/-1;">
          <div class="dp-t">Histórico desta campanha <button class="btn btn-g" style="font-size:9.5px;padding:2px 8px;margin-left:auto;" onclick="DISP.historico()">↻</button></div>
          <div id="dpHist" style="font-size:11px;color:var(--t3);">Carregando…</div>
        </div>
      </div>
    </div>`;
    ov.addEventListener('click', e => { if (e.target === ov && !S.rodando) fechar(); });
    document.body.appendChild(ov);
    try { S.cfg = (await api('config')).config; } catch (_) { S.cfg = null; }
    canal(S.canal);
  }
  function fechar() {
    if (S.rodando && !confirm('O disparo continua em segundo plano (a cada 15 min, em horário comercial). Fechar mesmo assim?')) return;
    S.rodando = false; $('dpOv')?.remove();
  }

  function canal(c) {
    S.canal = c === 'email' ? 'email' : 'whatsapp';
    $('dpTabWa').classList.toggle('on', S.canal === 'whatsapp'); $('dpTabEm').classList.toggle('on', S.canal === 'email');
    $('dpAssWrap').style.display = S.canal === 'email' ? 'block' : 'none';
    $('dpTesteDest').placeholder = S.canal === 'email' ? 'Seu e-mail para teste' : 'Seu WhatsApp para teste (DDD + número)';
    const cfg = S.cfg;
    $('dpCfg').innerHTML = cfg && !cfg[S.canal] ? `<div style="margin-top:12px;background:var(--r2);border:1px solid var(--red);border-radius:7px;padding:8px 12px;font-size:11px;line-height:1.5;">
      ${S.canal === 'email' ? '✉ O envio de e-mail não está configurado: cadastre <b>EMAIL_SMTP_USER</b> e <b>EMAIL_SMTP_PASS</b> (e, se precisar, EMAIL_SMTP_HOST/PORT) no Vercel e faça Redeploy.' : '☎ O WhatsApp não está configurado: cadastre <b>ZAPI_INSTANCE</b>, <b>ZAPI_TOKEN</b> e <b>ZAPI_CLIENT_TOKEN</b> no Vercel e faça Redeploy.'}
      Você ainda pode montar a mensagem e o público.</div>` : '';
    carregarTexto();
    S.dest = []; renderPublico(null);
    fonteMudou();
    historico();
  }
  function trocarCamp(id) { S.camp = campanhas().find(c => c.id === id) || null; carregarTexto(); S.dest = []; renderPublico(null); historico(); }
  function carregarTexto() {
    const t = textoDaCampanha(S.camp, S.canal);
    $('dpTexto').value = t.texto || '';
    $('dpAssunto').value = t.assunto || '';
    $('dpLink').value = $('dpLink').value || linkPadrao();
    $('dpOrigemTxt').textContent = !S.camp ? '' : t.daIA ? '✓ texto gerado pela IA para ' + (S.canal === 'email' ? 'e-mail' : 'WhatsApp') : '⚠ sem versão do canal — usando a copy base (edite à vontade)';
    prev();
  }
  function fonteMudou() {
    const f = $('dpFonte').value;
    $('dpManual').style.display = f === 'manual' ? 'block' : 'none';
    const op = f === 'leads' ? [['', 'Todos'], ['novo', 'Novos'], ['contatado', 'Contatados']]
      : f === 'out_leads' ? [['', 'Todos'], ['novo', 'Ainda não abordados'], ['enviado', 'Já abordados'], ['interessado', 'Interessados']]
      : f === 'hubspot' ? [['', 'Todos os estágios'], ['lead', 'Lead'], ['marketingqualifiedlead', 'MQL'], ['salesqualifiedlead', 'SQL'], ['opportunity', 'Oportunidade'], ['customer', 'Cliente']] : [];
    $('dpFiltroWrap').style.display = op.length ? 'block' : 'none';
    $('dpFiltro').innerHTML = op.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }

  // mesma regra do servidor (api/campanha-disparo.js montarTexto) — só para a prévia
  function montar(texto, d, link) {
    const pn = (String(d.nome || '').trim().split(/\s+/)[0] || ''); const PN = pn ? pn[0].toUpperCase() + pn.slice(1).toLowerCase() : '';
    let t = String(texto || '').replace(/\{\{?\s*primeiro_nome\s*\}?\}/gi, PN).replace(/\{\{?\s*nome\s*\}?\}/gi, d.nome || PN).replace(/\{\{?\s*empresa\s*\}?\}/gi, d.empresa || 'sua empresa').trim();
    if (S.canal === 'whatsapp' && PN && !new RegExp('^\\W*(ol[áa]|oi|bom dia|boa tarde|boa noite)?[\\s,!]*' + PN, 'i').test(t)) t = `Olá, ${PN}! ` + t;
    if (link) t = /\{\{?\s*link\s*\}?\}/i.test(t) ? t.replace(/\{\{?\s*link\s*\}?\}/gi, link) : t + '\n\n' + link;
    if (S.canal === 'whatsapp') t += '\n\n_Para não receber mais mensagens, responda SAIR._';
    return t;
  }
  function prev() {
    const d = S.dest.find(x => x.sel) || { nome: 'Ana Souza', empresa: 'Empresa Exemplo' };
    $('dpPrevQuem').textContent = '· como ' + (d.nome || 'contato') + ' vai receber';
    const link = ($('dpLink').value || '').trim() ? location.origin + '/api/campanha-disparo?c=…' : '';
    const t = montar($('dpTexto').value, d, link);
    const box = $('dpPrev'); box.classList.toggle('em', S.canal === 'email');
    box.innerHTML = (S.canal === 'email' ? `<div style="font-weight:700;border-bottom:1px solid #e5e7ef;padding-bottom:6px;margin-bottom:8px;">${esc(montar($('dpAssunto').value, d, '').replace(/\n\n_Para.*$/s, ''))}</div>` : '') + esc(t);
    resumo();
  }

  async function buscar(btn) {
    const fim = ocupado(btn, 'Buscando…');
    try {
      const d = await api('publico', { fonte: $('dpFonte').value, canal: S.canal, status: $('dpFiltro').value, texto: $('dpManual').value, campanha_id: S.camp?.id || '' });
      S.dest = d.destinatarios.map(x => ({ ...x, sel: !x.ja_recebeu }));
      renderPublico(d);
    } catch (e) { $('dpPub').innerHTML = `<span style="color:var(--red);">${esc(e.message)}</span>`; }
    fim();
  }
  function renderPublico(d) {
    if (!d) { $('dpPub').innerHTML = 'Escolha a origem e clique em Buscar contatos.'; resumo(); return; }
    const info = [`<span class="dp-kpi"><b>${S.dest.length}</b> com ${S.canal === 'email' ? 'e-mail' : 'WhatsApp'} válido</span>`,
      d.sem_contato ? `<span class="dp-kpi"><b>${d.sem_contato}</b> sem ${S.canal === 'email' ? 'e-mail' : 'telefone'}</span>` : '',
      d.descadastrados ? `<span class="dp-kpi"><b>${d.descadastrados}</b> pediram para sair</span>` : '',
      d.ja_receberam ? `<span class="dp-kpi"><b>${d.ja_receberam}</b> já receberam esta campanha (desmarcados)</span>` : ''].join('');
    $('dpPub').innerHTML = info + (S.dest.length ? `
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;"><input class="dp-in" placeholder="Filtrar por nome ou empresa" oninput="DISP.filtrar(this.value)" style="max-width:260px;" title="Filtrar"/>
        <button class="btn btn-g" style="font-size:10px;" onclick="DISP.marcar(true)">Marcar todos</button><button class="btn btn-g" style="font-size:10px;" onclick="DISP.marcar(false)">Desmarcar</button></div>
      <div class="dp-lista" id="dpLista">${S.dest.map((x, i) => `<label data-q="${esc((x.nome + ' ' + x.empresa).toLowerCase())}"><input type="checkbox" ${x.sel ? 'checked' : ''} onchange="DISP.sel(${i},this.checked)"/>
        <span style="flex:1;min-width:0;"><b style="color:var(--t1);">${esc(x.nome || '(sem nome)')}</b> <span style="color:var(--t2);">${esc(x.empresa || '')}</span></span>
        <span style="color:var(--t2);font-family:var(--M);font-size:10px;">${esc(x.destino)}</span>${x.ja_recebeu ? '<span style="color:var(--gold);font-size:9.5px;">já recebeu</span>' : ''}</label>`).join('')}</div>` : '<div style="margin-top:6px;">Nenhum contato com ' + (S.canal === 'email' ? 'e-mail' : 'telefone') + ' nessa origem.</div>');
    prev();
  }
  function sel(i, v) { S.dest[i].sel = v; prev(); }
  function marcar(v) { S.dest.forEach((x, i) => { const l = $('dpLista')?.children[i]; if (!l || l.style.display !== 'none') x.sel = v; }); renderPublico({}); }
  function filtrar(q) { q = q.toLowerCase(); [...($('dpLista')?.children || [])].forEach(l => { l.style.display = !q || l.dataset.q.includes(q) ? '' : 'none'; }); }
  function resumo() {
    const n = S.dest.filter(x => x.sel).length;
    const min = S.canal === 'whatsapp' ? Math.ceil(n * 8 / 60) : Math.ceil(n * 1.2 / 60);
    $('dpResumo').innerHTML = n ? `<b style="color:var(--t1);">${n}</b> pessoa(s) · tempo estimado ~${min} min${S.canal === 'whatsapp' ? ' (intervalo de 6–10 s entre mensagens para não bloquear o número)' : ''}.
      Se você fechar esta janela, o restante continua a cada 15 min em horário comercial.` : 'Selecione os contatos no passo 2.';
    const b = $('dpBtnDisparar'); if (b && !S.rodando) b.textContent = n ? `Disparar para ${n}` : 'Disparar';
  }

  async function teste(btn) {
    const dest = $('dpTesteDest').value.trim();
    if (!dest) return nota('Informe seu ' + (S.canal === 'email' ? 'e-mail' : 'WhatsApp') + ' para o teste', 'error');
    const fim = ocupado(btn, 'Enviando…');
    try { const d = await api('teste', { canal: S.canal, destino: dest, texto: $('dpTexto').value, assunto: $('dpAssunto').value, link_destino: $('dpLink').value.trim(), campanha_id: S.camp?.id });
      nota('Teste enviado para ' + d.destino); } catch (e) { nota('Teste falhou: ' + e.message, 'error'); }
    fim();
  }

  async function disparar(btn) {
    const dests = S.dest.filter(x => x.sel);
    if (!$('dpTexto').value.trim()) return nota('Escreva a mensagem', 'error');
    if (S.canal === 'email' && !$('dpAssunto').value.trim()) return nota('Informe o assunto do e-mail', 'error');
    if (!dests.length) return nota('Selecione ao menos um contato', 'error');
    const ag = $('dpQuando').value === 'agendar' ? $('dpAgenda').value : '';
    if ($('dpQuando').value === 'agendar' && !ag) return nota('Escolha data e hora do agendamento', 'error');
    if (!confirm(`${ag ? 'Agendar' : 'Enviar agora'} ${S.canal === 'email' ? 'e-mail' : 'WhatsApp'} para ${dests.length} pessoa(s)${ag ? ' em ' + new Date(ag).toLocaleString('pt-BR') : ''}?\n\nCampanha: ${S.camp?.nome || 'avulsa'}\nNão dá para desfazer o que já foi enviado.`)) return;
    const fim = ocupado(btn, 'Preparando…');
    try {
      const l = await api('criar_lote', { campanha_id: S.camp?.id, campanha_nome: S.camp?.nome, canal: S.canal, texto: $('dpTexto').value, assunto: $('dpAssunto').value,
        link_destino: $('dpLink').value.trim(), base_url: location.origin, agendar_para: ag ? new Date(ag).toISOString() : null,
        destinatarios: dests.map(x => ({ nome: x.nome, empresa: x.empresa, destino: x.destino, origem: x.origem })) });
      fim();
      const avisos = [l.repetidos ? l.repetidos + ' já tinham recebido' : '', l.invalidos ? l.invalidos + ' inválidos/descadastrados' : ''].filter(Boolean).join(' · ');
      if (!l.inseridos) { nota('Nenhum destinatário novo' + (avisos ? ' — ' + avisos : ''), 'error'); return; }
      if (ag) { nota(`Agendado: ${l.inseridos} envio(s)${avisos ? ' · ' + avisos : ''}`); historico(); return; }
      await acompanhar(l.lote_id, l.inseridos, avisos);
    } catch (e) { fim(); nota('Não consegui disparar: ' + e.message, 'error'); }
  }
  async function acompanhar(loteId, total, avisos) {
    S.rodando = true; const btn = $('dpBtnDisparar'); if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    let env = 0, err = 0, rest = total, erroCfg = null;
    const pint = () => { const p = $('dpProg'); if (!p) return; const feitos = total - rest;
      p.innerHTML = `<div style="background:var(--bg4);height:8px;border-radius:5px;overflow:hidden;"><div style="width:${total ? feitos / total * 100 : 100}%;height:100%;background:var(--green);transition:width .4s;"></div></div>
        <div style="font-size:10.5px;color:var(--t2);margin-top:5px;">${feitos}/${total} processados · <b style="color:var(--green);">${env} enviados</b>${err ? ` · <b style="color:var(--red);">${err} com erro</b>` : ''}${avisos ? ' · ' + esc(avisos) : ''}${erroCfg ? `<div style="color:var(--red);margin-top:4px;">${esc(erroCfg)}</div>` : ''}</div>`; };
    pint();
    while (S.rodando && rest > 0) {
      try { const r = await api('processar', { lote_id: loteId, segundos: 50 }); env += r.enviados || 0; err += r.erros || 0; rest = r.restantes ?? 0; }
      catch (e) { erroCfg = e.message; break; }
      pint();
    }
    S.rodando = false; if (btn) { btn.disabled = false; resumo(); }
    if (erroCfg) nota('Disparo parou: ' + erroCfg, 'error'); else if (!rest) nota(`Disparo concluído: ${env} enviado(s)${err ? ', ' + err + ' com erro' : ''}`);
    historico();
  }

  async function historico() {
    const box = $('dpHist'); if (!box) return;
    try {
      const d = await api('status', { campanha_id: S.camp?.id || null });
      const l = d.lotes || [];
      box.innerHTML = !l.length ? 'Nenhum disparo ainda.' : `<div style="overflow-x:auto;"><table class="dp-hist" style="width:100%;border-collapse:collapse;">
        <tr><th>Quando</th><th>Canal</th><th>Status</th><th>Enviados</th><th>Pendentes</th><th>Erros</th><th>${'Abertos'}</th><th>Cliques</th><th></th></tr>
        ${l.map(x => `<tr><td>${dt(x.criado_em)}${x.agendar_para ? '<br><span style="color:var(--gold);font-size:9.5px;">agendado ' + dt(x.agendar_para) + '</span>' : ''}</td>
          <td>${x.canal === 'email' ? '✉ E-mail' : '☎ WhatsApp'}</td><td>${esc(x.status)}</td><td><b>${x.enviados}</b>/${x.total}</td><td>${x.pendentes}</td>
          <td style="color:${x.erros ? 'var(--red)' : 'inherit'};">${x.erros}</td><td>${x.canal === 'email' ? x.abertos : '—'}</td><td><b>${x.clicados}</b></td>
          <td style="white-space:nowrap;">${x.pendentes && x.status === 'ativo' ? `<button class="btn btn-g" style="font-size:9.5px;padding:2px 7px;" onclick="DISP.continuar('${x.id}',${x.total})">Continuar</button> <button class="btn btn-g" style="font-size:9.5px;padding:2px 7px;" onclick="DISP.cancelar('${x.id}')">Cancelar</button>` : ''}
            ${x.erros ? `<button class="btn btn-g" style="font-size:9.5px;padding:2px 7px;" onclick="DISP.retomar('${x.id}',${x.total})">Reenviar erros</button>` : ''}
            <button class="btn btn-g" style="font-size:9.5px;padding:2px 7px;" onclick="DISP.envios('${x.id}')">Ver</button></td></tr>
          <tr id="dpEnv_${x.id}" style="display:none;"><td colspan="9"></td></tr>`).join('')}</table></div>`;
    } catch (e) { box.innerHTML = `<span style="color:var(--red);">${esc(e.message)}</span>`; }
  }
  async function envios(id) {
    const tr = $('dpEnv_' + id); if (!tr) return;
    if (tr.style.display !== 'none') { tr.style.display = 'none'; return; }
    tr.style.display = ''; tr.firstElementChild.innerHTML = 'Carregando…';
    try { const d = await api('envios', { lote_id: id });
      tr.firstElementChild.innerHTML = `<div style="max-height:220px;overflow:auto;">${d.envios.map(e => `<div style="display:flex;gap:8px;font-size:10.5px;padding:3px 0;border-bottom:1px solid var(--bd);">
        <span style="flex:1;">${esc(e.nome || '')} <span style="color:var(--t2);">${esc(e.empresa || '')}</span></span><span style="font-family:var(--M);color:var(--t2);">${esc(e.destino)}</span>
        <span style="width:90px;color:${e.status === 'enviado' ? 'var(--green)' : e.status === 'erro' ? 'var(--red)' : 'var(--t2)'};">${esc(e.status)}${e.clicado_em ? ' · clicou' : e.aberto_em ? ' · abriu' : ''}</span>
        ${e.erro ? `<span style="color:var(--red);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(e.erro)}">${esc(e.erro)}</span>` : ''}</div>`).join('')}</div>`;
    } catch (e) { tr.firstElementChild.innerHTML = esc(e.message); }
  }
  async function cancelar(id) { if (!confirm('Cancelar os envios pendentes deste lote?')) return; try { await api('cancelar', { lote_id: id }); nota('Pendentes cancelados'); } catch (e) { nota(e.message, 'error'); } historico(); }
  async function retomar(id, total) { try { const r = await api('retomar_erros', { lote_id: id }); nota(r.reenfileirados + ' envio(s) voltaram para a fila'); acompanhar(id, r.reenfileirados, ''); } catch (e) { nota(e.message, 'error'); } }
  function continuar(id, total) { acompanhar(id, total, ''); }

  window.DISP = { abrir, fechar, canal, trocarCamp, prev, fonteMudou, buscar, sel, marcar, filtrar, teste, disparar, historico, envios, cancelar, retomar, continuar, _montar: montar, _S: S };
})();
