// v3.153 — ATLANTYX TV + WEBINARS AO VIVO (tela do sistema) · trilha T2
// Abas: Atlantyx TV (playlist, intercalação, produtos, cotações, notícias, link) · No YouTube 24h · Webinars (estúdio, sala privada,
// convidados, transmissão simultânea YouTube/LinkedIn/Instagram) · Destinos (chaves de transmissão, guardadas cifradas).
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const LK_CDN = 'https://cdn.jsdelivr.net/npm/livekit-client@2.15.0/dist/livekit-client.umd.js';
  let D = null, aba = 'tv', cfg = null, est = null; // est = estúdio aberto { w, room }
  async function api(action, body = {}) {
    const r = await fetch('/api/atv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status }));
    if (!d.success) throw new Error(d.error || 'falha'); return d;
  }
  const mb = n => (Number(n || 0) / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  const quando = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const card = (titulo, corpo, extra) => `<div class="panel" style="margin-bottom:12px;"><div class="ph"><div class="pt">${titulo}</div>${extra || ''}</div><div class="pb">${corpo}</div></div>`;
  const rel = u => { try { const x = new URL(u); return x.pathname + x.search; } catch (_) { return u; } }; // prévia no mesmo domínio (funciona também em deploy de teste)
  const mmss = s => { s = Math.round(+s || 0); if (!s) return ''; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const seg = v => { const p = String(v || '').trim().split(':').map(Number); if (p.some(isNaN)) return null; return p.reduce((a, x) => a * 60 + x, 0) || null; };
  const medir = src => new Promise(ok => { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; const fim = d => { ok(d); try { v.removeAttribute('src'); v.load(); } catch (_) {} }; v.onloadedmetadata = () => fim(isFinite(v.duration) ? Math.round(v.duration) : null); v.onerror = () => fim(null); setTimeout(() => fim(null), 15000); v.src = src; });
  const lbl = t => `<label class="fl">${t}</label>`;
  const FONTE = { upload: ['enviado', 'var(--gn)'], youtube: ['YouTube', 'var(--red)'], url: ['link', 'var(--blue)'], reacao: ['reação S2', 'var(--pu)'] };

  function abrir(qual) {
    const box = $('atvApp'); if (!box) return; if (qual) aba = qual;
    box.innerHTML = `<div style="background:linear-gradient(135deg,rgba(0,196,204,.14),rgba(0,252,168,.05));border:1px solid rgba(0,196,204,.35);border-radius:10px;padding:14px 18px;margin-bottom:12px;">
      <div style="font-family:var(--H);font-size:15px;font-weight:700;">📡 Atlantyx TV &amp; Webinars ao vivo</div>
      <div style="font-size:11px;color:var(--t2);margin-top:3px;line-height:1.6;">Canal contínuo no layout estilo Bloomberg: <b>playlist circular</b> de reações, entrevistas e vídeos de produto, com <b>vinheta de 25 s</b> entre eles, <b>cotações</b> (dólar, euro, bitcoin, Ibovespa, ações), <b>últimas notícias escritas pela IA</b> e barras com produtos e serviços. Roda na TV do escritório pelo link e vai para o <b>YouTube</b>. Na aba Webinars você faz lives em <b>sala privada</b> ou ao mesmo tempo no <b>YouTube, LinkedIn e Instagram</b>, com o mesmo layout.</div></div>
      <div class="seg" id="atvAbas" style="margin-bottom:10px;">${[['tv', '📺 Atlantyx TV'], ['youtube', '🔴 No YouTube 24h'], ['webinars', '🎙 Webinars ao vivo'], ['canal', '▶ Canal do YouTube'], ['destinos', '🔑 Destinos']].map(([k, r]) => `<button class="${aba === k ? 'on' : ''}" data-a="${k}" onclick="ATV.aba('${k}')">${r}</button>`).join('')}</div>
      <div id="atvCorpo"><div style="padding:30px;text-align:center;color:var(--t3);font-size:11px;">Carregando…</div></div>`;
    carregar();
  }
  async function carregar() { try { D = await api('inicio'); cfg = JSON.parse(JSON.stringify(D.config)); render(); } catch (e) { $('atvCorpo').innerHTML = `<div style="color:var(--red);font-size:12px;padding:12px;">${esc(e.message)}</div>`; } }
  function trocar(k) { if (est && k !== 'webinars') sairEstudio(); aba = k; document.querySelectorAll('#atvAbas button').forEach(b => b.classList.toggle('on', b.dataset.a === k)); render(); }
  function render() { if (!D) return; ({ tv: rTv, youtube: rYoutube, webinars: rWebinars, canal: rCanal, destinos: rDestinos })[aba](); }

  // ═════════ ATLANTYX TV ═════════
  function rTv() {
    const c = cfg, I = c.intercalar || {}, mk = D.mercado || {}, nt = D.noticias || {};
    const link = c.link ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><code style="font-size:14px;padding:7px 10px;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;user-select:all;">${esc(c.link)}</code>
        <button class="btn btn-gn" onclick="navigator.clipboard.writeText('${esc(c.link)}').then(()=>toast('Link copiado','success'))">📋 Copiar</button><a class="btn btn-g" href="${esc(c.link)}" target="_blank" rel="noopener">↗ Abrir em tela cheia</a>
        <button class="btn btn-g" onclick="ATV.link('gerar_link')">🔄 Novo link</button><button class="btn btn-g" style="color:var(--red);" onclick="ATV.link('revogar_link')">⛔ Revogar</button></div>
        <div style="position:relative;width:100%;max-width:880px;aspect-ratio:16/9;border-radius:10px;overflow:hidden;border:1px solid var(--bd);background:#000;margin-top:10px;"><iframe src="${esc(rel(c.link))}" style="position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;" id="atvPrev" title="Prévia da Atlantyx TV"></iframe></div>
        <div style="font-size:10.5px;color:var(--t3);margin-top:5px;">Na TV: abra o link no navegador da TV ou do mini PC e toque na tela uma vez para ligar o som e a tela cheia. As setas trocam de programa.</div>`
      : `<div style="font-size:12px;margin-bottom:8px;">A Atlantyx TV ainda não tem link.</div><button class="btn btn-gn" onclick="ATV.link('gerar_link')">📺 Gerar o link da Atlantyx TV</button>`;
    const P = c.playlist || [];
    const linhas = P.map((it, i) => { const f = FONTE[it.fonte] || FONTE.url; return `<tr style="border-bottom:1px solid var(--bd);${it.ativo === false ? 'opacity:.5;' : ''}">
      <td style="padding:6px 4px;white-space:nowrap;"><button class="btn btn-g" style="padding:1px 6px;font-size:10px;" onclick="ATV.mover(${i},-1)" ${i ? '' : 'disabled'}>▲</button><button class="btn btn-g" style="padding:1px 6px;font-size:10px;" onclick="ATV.mover(${i},1)" ${i < P.length - 1 ? '' : 'disabled'}>▼</button></td>
      <td style="padding:6px 4px;"><input type="checkbox" ${it.ativo !== false ? 'checked' : ''} onchange="ATV.campo(${i},'ativo',this.checked)" title="no ar"></td>
      <td style="padding:6px 4px;min-width:200px;"><input class="fi" style="font-size:11.5px;" value="${esc(it.titulo)}" onchange="ATV.campo(${i},'titulo',this.value)" placeholder="Título"><input class="fi" style="font-size:10.5px;margin-top:3px;" value="${esc(it.subtitulo)}" onchange="ATV.campo(${i},'subtitulo',this.value)" placeholder="Subtítulo (faixa na tela)"></td>
      <td style="padding:6px 4px;min-width:220px;"><textarea class="fta" style="font-size:10.5px;min-height:44px;" onchange="ATV.campo(${i},'chamada',this.value)" placeholder="Chamada da vinheta (a IA escreve)">${esc(it.chamada)}</textarea></td>
      <td style="padding:6px 4px;white-space:nowrap;"><span style="font-size:9.5px;padding:2px 6px;border-radius:8px;border:1px solid ${f[1]};color:${f[1]};">${f[0]}</span>
        <div style="margin-top:4px;"><input class="fi" style="width:64px;font-size:10.5px;padding:3px 5px;" value="${esc(mmss(it.duracao_s))}" placeholder="mm:ss" title="Duração (a grade usa para saber o horário de cada programa)" onchange="ATV.campo(${i},'duracao_s',ATV._seg(this.value))"></div>
        <div style="margin-top:4px;">${it.yt_video_id ? `<a href="https://youtu.be/${esc(it.yt_video_id)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--gn);">✓ no YouTube</a>` : (D.youtube?.conectado ? `<button class="btn btn-g" style="padding:2px 6px;font-size:10px;" onclick="ATV.ytPub(${i})">▶ Publicar</button>` : '')}</div></td>
      <td style="padding:6px 4px;"><button class="btn btn-g" style="padding:2px 7px;font-size:10px;color:var(--red);" onclick="ATV.tirar(${i})">✕</button></td></tr>`; }).join('');
    const reac = (D.reacoes || []).map(r => `<option value="${esc(r.peca_id)}">${esc(r.titulo)}${r.envio_id ? ' · completo' : ''}${r.reel_url ? ' · Reel' : ''}</option>`).join('');
    const num = (k, t, max) => `<div><label class="fl" style="font-size:10px;">${t}</label><input class="fi" type="number" min="0" max="${max}" style="width:80px;" value="${esc(I[k])}" onchange="ATV.inter('${k}',this.value)"></div>`;
    $('atvCorpo').innerHTML = card('Link da Atlantyx TV', link)
      + card(`Playlist circular <span style="font-weight:400;color:var(--t3);font-size:11px;">(${P.length} vídeo${P.length === 1 ? '' : 's'})</span>`,
        (P.length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;">${linhas}</table></div>` : '<div style="font-size:11.5px;color:var(--t3);">Sem vídeos ainda — sem vídeos a TV roda vinheta, cotações, notícias e produtos.</div>')
        + `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center;">
            <label class="btn btn-gn" style="cursor:pointer;">⬆ Enviar vídeo<input type="file" accept="video/*" style="display:none;" onchange="ATV.enviar(this)"></label>
            <button class="btn btn-g" onclick="ATV.addYoutube()">▶ Vídeo do YouTube</button><button class="btn btn-g" onclick="ATV.addUrl()">🔗 Link de vídeo (mp4)</button>
            ${reac ? `<select class="fsel" id="atvReac" style="width:auto;max-width:280px;"><option value="">Importar uma reação (S2)…</option>${reac}</select><button class="btn btn-g" onclick="ATV.addReacao()">+ Importar</button>` : ''}
            <span style="flex:1;"></span><button class="btn btn-g" onclick="ATV.chamadas(this)">✍ IA escreve as chamadas</button><button class="btn btn-p" onclick="ATV.salvar(this)">💾 Salvar e pôr no ar</button></div>
          <div id="atvUp" style="font-size:11px;color:var(--t2);margin-top:6px;"></div>
          <div style="font-size:10.5px;color:var(--t3);margin-top:6px;line-height:1.6;">Vídeos do YouTube tocam na TV do escritório; para a transmissão no YouTube prefira vídeos enviados aqui (o YouTube não deixa retransmitir o próprio player). Só coloque vídeos da Atlantyx ou com autorização.</div>`)
      + card('Intercalação e vinheta', `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;font-size:11.5px;">
          <label style="display:flex;gap:6px;align-items:center;" title="Todo mundo vê o mesmo programa na mesma hora — quem abre no meio entra no meio, como TV"><input type="checkbox" ${c.grade !== false ? 'checked' : ''} onchange="ATV.gradeSet(this.checked)"> <b>Grade pelo relógio</b> (transmissão contínua)</label>
          <label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" ${I.vinheta !== false ? 'checked' : ''} onchange="ATV.inter('vinheta',this.checked)"> Vinheta antes de cada vídeo</label>${num('vinheta_s', 'Vinheta (s)', 120)}
          ${num('mercado_cada', 'Cotações a cada N vídeos', 20)}${num('mercado_s', 'Cotações (s)', 120)}${num('noticias_cada', 'Notícias a cada N', 20)}${num('noticias_s', 'Notícias (s)', 120)}${num('produto_cada', 'Produto a cada N', 20)}${num('produto_s', 'Produto (s)', 120)}</div>
          <div style="font-size:11px;color:var(--t2);margin-top:8px;">${cicloTxt()}</div><div style="font-size:10.5px;color:var(--t3);margin-top:6px;">A vinheta mostra "Atlantyx TV", o slogan e "A seguir" com a chamada do próximo vídeo, com trilha sonora e locução do navegador. 0 desliga a intercalação.</div>`)
      + card('Marca, produtos, serviços e faixa', `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">
          <div>${lbl('Nome do canal')}<input class="fi" id="atvNome" value="${esc(c.nome)}"></div><div>${lbl('Slogan')}<input class="fi" id="atvSlogan" value="${esc(c.slogan)}"></div>
          <div>${lbl('Canal no YouTube')}<input class="fi" id="atvCanal" value="${esc(c.youtube_canal)}"></div></div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:8px;">
          <div>${lbl('Produtos (um por linha: Nome | frase)')}<textarea class="fta" id="atvProd" style="min-height:110px;">${esc((c.produtos || []).map(p => p.nome + ' | ' + p.frase).join('\n'))}</textarea></div>
          <div>${lbl('Serviços (um por linha)')}<textarea class="fta" id="atvServ" style="min-height:110px;">${esc((c.servicos || []).join('\n'))}</textarea></div>
          <div>${lbl('Faixa de mensagens na base (uma por linha)')}<textarea class="fta" id="atvFaixa" style="min-height:110px;">${esc((c.faixa || []).join('\n'))}</textarea></div></div>
          <div style="margin-top:8px;text-align:right;"><button class="btn btn-p" onclick="ATV.salvar(this)">💾 Salvar</button></div>`)
      + card('Cotações', `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
          <div>${lbl('Moedas (AwesomeAPI)')}<input class="fi" id="atvMoedas" value="${esc((c.moedas || []).join(', '))}" placeholder="USD-BRL, EUR-BRL, BTC-BRL"></div>
          <div>${lbl('Índices e ações da B3 (brapi)')}<input class="fi" id="atvAcoes" value="${esc((c.acoes || []).join(', '))}" placeholder="^BVSP, PETR4, VALE3"></div></div>
          <div style="margin-top:8px;font-size:11.5px;">${(mk.moedas || []).concat(mk.acoes || []).map(x => `<span style="display:inline-block;margin:2px 8px 2px 0;"><b>${esc(x.nome || x.simbolo)}</b> ${x.valor == null ? '—' : Number(x.valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} <span style="color:${(x.var_pct || 0) >= 0 ? 'var(--gn)' : 'var(--red)'};">${x.var_pct == null ? '' : (x.var_pct >= 0 ? '▲' : '▼') + Math.abs(x.var_pct).toFixed(2) + '%'}</span></span>`).join('') || '<span style="color:var(--t3);">ainda sem cotações</span>'}
          ${(mk.erros || []).length ? `<div style="color:var(--gold);font-size:10.5px;margin-top:4px;">⚠ ${esc(mk.erros.join(' · '))}</div>` : ''}</div>
          <div style="display:flex;gap:6px;margin-top:8px;align-items:center;"><button class="btn btn-g" onclick="ATV.atualizar('mercado_atualizar',this)">↻ Atualizar cotações</button><span style="font-size:10.5px;color:var(--t3);">Atualiza sozinho a cada 5 min. ${D.brapi_token ? '' : 'Sem BRAPI_TOKEN, a B3 só responde algumas ações (PETR4, VALE3, ITUB4, MGLU3).'}</span><span style="flex:1"></span><button class="btn btn-p" onclick="ATV.salvar(this)">💾 Salvar</button></div>`)
      + card('Últimas notícias (escritas pela IA)', `${lbl('Temas que a IA acompanha')}<textarea class="fta" id="atvTemas" style="min-height:44px;">${esc(c.temas_noticias)}</textarea>
          <div style="margin-top:8px;font-size:11.5px;line-height:1.6;">${(nt.itens || []).map(n => `<div style="padding:4px 0;border-bottom:1px solid var(--bd);"><b>${esc(n.titulo)}</b> <span style="color:var(--t3);">— ${esc(n.fonte)}</span>${n.url ? ` <a href="${esc(n.url)}" target="_blank" rel="noopener" style="font-size:10px;">fonte ↗</a>` : ''}</div>`).join('') || '<span style="color:var(--t3);">ainda sem notícias</span>'}
          ${nt.em ? `<div style="font-size:10px;color:var(--t3);margin-top:4px;">atualizadas em ${quando(nt.em)}${nt.aviso ? ' · ' + esc(nt.aviso) : ''}</div>` : ''}</div>
          <div style="display:flex;gap:6px;margin-top:8px;align-items:center;"><button class="btn btn-g" onclick="ATV.atualizar('noticias_atualizar',this)">↻ Buscar notícias agora</button><span style="font-size:10.5px;color:var(--t3);">A IA busca na web de hora em hora e só escreve o que está nas fontes, citando o veículo.</span><span style="flex:1"></span><button class="btn btn-p" onclick="ATV.salvar(this)">💾 Salvar</button></div>`);
    const f = $('atvPrev'); if (f) { const ajusta = () => { const w = f.parentElement.clientWidth; f.style.transform = `scale(${w / 1920})`; }; ajusta(); new ResizeObserver(ajusta).observe(f.parentElement); }
  }
  function lerCampos() {
    const v = id => $(id)?.value; if (v('atvNome') == null) return;
    cfg.nome = v('atvNome'); cfg.slogan = v('atvSlogan'); cfg.youtube_canal = v('atvCanal'); cfg.temas_noticias = v('atvTemas');
    cfg.produtos = v('atvProd').split('\n').map(l => l.split('|')).filter(x => x[0].trim()).map(x => ({ nome: x[0].trim(), frase: (x.slice(1).join('|') || '').trim() }));
    cfg.servicos = v('atvServ').split('\n').map(s => s.trim()).filter(Boolean); cfg.faixa = v('atvFaixa').split('\n').map(s => s.trim()).filter(Boolean);
    cfg.moedas = v('atvMoedas').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean); cfg.acoes = v('atvAcoes').split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
  }
  async function salvar(b) { lerCampos(); if (b) { b.disabled = true; b.textContent = '⏳ Salvando…'; }
    try { const r = await api('salvar', { config: cfg }); D.config = r.config; cfg = JSON.parse(JSON.stringify(r.config)); nota('Salvo — a TV pega a mudança em até 10 min (ou ao recarregar o link)'); render(); } catch (e) { nota(e.message, 'error'); if (b) { b.disabled = false; b.textContent = '💾 Salvar'; } } }
  function campo(i, k, v) { cfg.playlist[i][k] = v; if (k === 'ativo') render(); }
  function mover(i, d) { lerCampos(); const P = cfg.playlist, j = i + d; [P[i], P[j]] = [P[j], P[i]]; render(); }
  function tirar(i) { lerCampos(); if (!confirm('Tirar "' + cfg.playlist[i].titulo + '" da playlist?')) return; cfg.playlist.splice(i, 1); render(); }
  function inter(k, v) { cfg.intercalar[k] = k === 'vinheta' ? !!v : (parseInt(v) || 0); }
  const novoIt = x => ({ id: 'it_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tipo: 'video', ativo: true, subtitulo: '', chamada: '', ...x });
  function addYoutube() { const u = prompt('Cole o link do vídeo do YouTube (ex.: https://youtu.be/…):'); if (!u) return;
    const m = u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/); if (!m) return nota('Não reconheci o link do YouTube', 'error');
    const t = prompt('Título do vídeo na tela:', '') || 'Vídeo Atlantyx'; const d = seg(prompt('Duração do vídeo (mm:ss) — a grade usa para montar os horários:', '') || '');
    lerCampos(); cfg.playlist.push(novoIt({ fonte: 'youtube', youtube_id: m[1], titulo: t, duracao_s: d })); render(); nota('Adicionado — clique em Salvar e pôr no ar'); }
  async function addUrl() { const u = prompt('Link direto do vídeo (mp4/webm, público):'); if (!u) return; if (!/^https?:\/\//.test(u)) return nota('Link inválido', 'error');
    const t = prompt('Título do vídeo na tela:', '') || 'Vídeo Atlantyx'; const d = await medir(u); lerCampos(); cfg.playlist.push(novoIt({ fonte: 'url', url: u, titulo: t, duracao_s: d })); render(); if (!d) nota('Não consegui medir a duração — preencha em mm:ss', 'warning'); }
  async function addReacao() { const id = $('atvReac')?.value; const r = (D.reacoes || []).find(x => x.peca_id === id); if (!r) return nota('Escolha a reação', 'error'); lerCampos();
    const d = !r.envio_id && r.reel_url ? await medir(r.reel_url) : null;
    cfg.playlist.push(novoIt({ fonte: 'reacao', peca_id: r.peca_id, envio_id: r.envio_id || null, url: r.envio_id ? null : r.reel_url, titulo: r.titulo, categoria: 'Reação', duracao_s: d })); render(); nota('Reação adicionada' + (r.envio_id ? ' (vídeo completo)' : ' (Reel)') + ' — clique em Salvar'); }
  const b64 = blob => new Promise((ok, err) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => err(new Error('não consegui ler o arquivo')); fr.readAsDataURL(blob); });
  async function enviar(inp) {
    const f = inp.files?.[0]; inp.value = ''; if (!f) return; const t = prompt('Título do vídeo na tela:', f.name.replace(/\.[^.]+$/, '')) || f.name; const st = $('atvUp');
    const lu = URL.createObjectURL(f); const dur = await medir(lu); URL.revokeObjectURL(lu);
    try { const PM = 3400000, n = Math.ceil(f.size / PM); const r = await api('midia_iniciar', { nome: f.name, titulo: t, content_type: f.type || 'video/mp4', tamanho: f.size, partes: n });
      for (let i = 0; i < n; i++) { st.textContent = `⏳ Enviando ${f.name}: parte ${i + 1} de ${n} (${mb(Math.min(f.size, (i + 1) * PM))} de ${mb(f.size)})…`;
        const dado = await b64(f.slice(i * PM, (i + 1) * PM)); let ok = false, er = null; for (let k = 0; k < 3 && !ok; k++) { try { await api('midia_parte', { id: r.id, i, b64: dado }); ok = true; } catch (e) { er = e; await new Promise(x => setTimeout(x, 1500)); } } if (!ok) throw er; }
      await api('midia_concluir', { id: r.id }); lerCampos(); cfg.playlist.push(novoIt({ fonte: 'upload', midia_id: r.id, titulo: t, duracao_s: dur })); st.textContent = '✅ ' + f.name + ' enviado (' + mb(f.size) + '). Salvando a playlist…'; await salvar();
    } catch (e) { st.textContent = '⚠ ' + e.message; nota(e.message, 'error'); } }
  async function chamadas(b) { lerCampos(); b.disabled = true; b.textContent = '⏳ Escrevendo…'; try { await api('salvar', { config: cfg }); const r = await api('chamadas_gerar'); if (r.playlist) { cfg.playlist = r.playlist; D.config.playlist = r.playlist; } nota(r.geradas ? r.geradas + ' chamada(s) escritas' : 'Todos os vídeos já têm chamada'); render(); } catch (e) { nota(e.message, 'error'); b.disabled = false; b.textContent = '✍ IA escreve as chamadas'; } }
  async function atualizar(acao, b) { b.disabled = true; const t = b.textContent; b.textContent = '⏳ …'; try { const r = await api(acao); if (r.noticias) D.noticias = r.noticias; if (r.mercado) D.mercado = r.mercado; lerCampos(); render(); } catch (e) { nota(e.message, 'error'); b.disabled = false; b.textContent = t; } }
  async function link(acao) { if (acao === 'revogar_link' && !confirm('Revogar o link? A TV do escritório e a transmissão no YouTube param.')) return; if (acao === 'gerar_link' && cfg.link && !confirm('Gerar novo link? O atual para de funcionar.')) return;
    try { await api(acao); await carregar(); nota(acao === 'gerar_link' ? 'Link pronto' : 'Link revogado'); } catch (e) { nota(e.message, 'error'); } }

  // ═════════ YOUTUBE 24h ═════════
  const avisoLk = () => D.livekit ? '' : `<div style="background:rgba(255,181,71,.1);border:1px solid rgba(255,181,71,.4);border-radius:8px;padding:10px 12px;font-size:11.5px;line-height:1.7;margin-bottom:12px;"><b>⚙ Falta ligar o servidor de transmissão (uma vez só).</b> O navegador não envia vídeo direto para YouTube, LinkedIn ou Instagram — quem faz isso é o <b>LiveKit Cloud</b>.<br>
    1. Crie a conta e um projeto em <b>cloud.livekit.io</b>. 2. Em Settings → Keys, gere uma chave. 3. Na Vercel → Settings → Environment Variables, crie <code>LIVEKIT_URL</code> (wss://…), <code>LIVEKIT_API_KEY</code> e <code>LIVEKIT_API_SECRET</code> e faça Redeploy.<br><span style="color:var(--t3);">O LiveKit cobra por minuto de transmissão (Egress); a sala privada e os testes usam a cota gratuita. Nunca cole essas chaves aqui no chat.</span></div>`;
  function rYoutube() {
    const t = D.transmissao || {}, st = t.status, no = st?.ativo, j = t.janela || { auto: false, inicio: '08:00', fim: '20:00', dias: [1, 2, 3, 4, 5] }, yt = D.destinos?.youtube;
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    $('atvCorpo').innerHTML = avisoLk() + card('Atlantyx TV no YouTube', `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:700;color:${no ? 'var(--red)' : 'var(--t3)'};">${no ? '🔴 NO AR desde ' + quando(t.desde) : '⚪ fora do ar'}</span>
        ${no ? `<button class="btn btn-g" style="color:var(--red);" onclick="ATV.tv('tv_parar',this)">⏹ Parar</button>` : `<button class="btn btn-p" ${D.livekit && yt?.configurado && cfg.link ? '' : 'disabled'} onclick="ATV.tv('tv_transmitir',this)">🔴 Transmitir a Atlantyx TV no YouTube</button>`}
        <a class="btn btn-g" href="${esc(cfg.youtube_canal)}" target="_blank" rel="noopener">↗ Ver o canal</a></div>
        ${st?.erro ? `<div style="color:var(--gold);font-size:11px;margin-top:6px;">⚠ ${esc(st.erro)}</div>` : ''}
        <div style="font-size:11px;color:var(--t2);margin-top:8px;line-height:1.7;">O servidor de transmissão abre a página da Atlantyx TV (com som) e envia para o YouTube exatamente o que aparece na TV do escritório: playlist, vinhetas, cotações, notícias e barras.
        ${!cfg.link ? '<br>⚠ Gere antes o link na aba Atlantyx TV.' : ''}${!yt?.configurado ? '<br>⚠ Cadastre a chave de transmissão do YouTube na aba Destinos.' : ''}</div>`)
      + card('Horário automático', `<label style="display:flex;gap:6px;align-items:center;font-size:12px;"><input type="checkbox" id="jAuto" ${j.auto ? 'checked' : ''}> Ligar e desligar sozinho (verifica de hora em hora)</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-top:8px;font-size:11.5px;"><div>${lbl('Liga às')}<input class="fi" type="time" id="jIni" value="${esc(j.inicio)}" style="width:110px;"></div><div>${lbl('Desliga às')}<input class="fi" type="time" id="jFim" value="${esc(j.fim)}" style="width:110px;"></div>
        <div>${lbl('Dias')}<div style="display:flex;gap:6px;">${dias.map((d, i) => `<label style="display:flex;gap:3px;align-items:center;"><input type="checkbox" class="jDia" value="${i}" ${(j.dias || []).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
        <button class="btn btn-g" onclick="ATV.janela()">💾 Salvar horário</button></div>
        <div style="font-size:10.5px;color:var(--t3);margin-top:6px;">24 h por dia = cerca de 43 mil minutos de transmissão por mês. Horário comercial (seg–sex, 8h–20h) é ~1/3 disso.</div>`);
  }
  async function tv(acao, b) { b.disabled = true; try { await api(acao, { destinos: ['youtube'] }); nota(acao === 'tv_parar' ? 'Transmissão parada' : 'Transmissão iniciada — o YouTube mostra em ~30 s'); await carregar(); } catch (e) { nota(e.message, 'error'); b.disabled = false; } }
  async function janela() { try { await api('tv_janela', { janela: { auto: $('jAuto').checked, inicio: $('jIni').value, fim: $('jFim').value, dias: [...document.querySelectorAll('.jDia:checked')].map(x => +x.value) } }); nota('Horário salvo'); await carregar(); } catch (e) { nota(e.message, 'error'); } }

  // ═════════ WEBINARS ═════════
  const STW = { agendado: ['agendado', 'var(--t3)'], aberto: ['sala aberta', 'var(--blue)'], ao_vivo: ['🔴 ao vivo', 'var(--red)'], encerrado: ['encerrado', 'var(--t3)'] };
  function rWebinars() {
    if (est) return rEstudio();
    const W = D.webinars || [];
    $('atvCorpo').innerHTML = avisoLk() + card('Novo webinar', `<div style="display:grid;grid-template-columns:2fr 1fr 110px;gap:8px;">
        <div>${lbl('Título')}<input class="fi" id="wT" placeholder="Ex.: IA na gestão financeira — ao vivo com convidados"></div><div>${lbl('Data e hora')}<input class="fi" type="datetime-local" id="wI"></div><div>${lbl('Duração (min)')}<input class="fi" type="number" id="wD" value="60"></div></div>
        <div style="margin-top:6px;">${lbl('Descrição (vai na faixa de baixo)')}<input class="fi" id="wS" placeholder="Ex.: Fabio Quintanilha recebe convidados para falar de…"></div>
        <div style="margin-top:8px;text-align:right;"><button class="btn btn-p" onclick="ATV.wCriar(this)">+ Criar webinar</button></div>`)
      + card('Webinars', W.length ? W.map(w => { const s = STW[w.status] || STW.agendado; return `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--bd);">
          <div style="flex:1;min-width:220px;"><div style="font-weight:700;font-size:12.5px;">${esc(w.titulo)}</div><div style="font-size:10.5px;color:var(--t3);">${quando(w.inicio)} · ${w.duracao_min} min · <span style="color:${s[1]};">${s[0]}</span>${(w.destinos || []).length && w.status === 'ao_vivo' ? ' · ' + w.destinos.join(', ') : ''}</div></div>
          ${w.status !== 'encerrado' ? `<button class="btn btn-g" style="font-size:10.5px;" onclick="navigator.clipboard.writeText('${esc(w.link_sala)}').then(()=>toast('Link da sala privada copiado','success'))" title="Para a audiência assistir na sala privada">👥 Link da sala</button>
          <button class="btn btn-g" style="font-size:10.5px;" onclick="navigator.clipboard.writeText('${esc(w.link_convidado)}').then(()=>toast('Link do convidado copiado — mande só para quem vai falar','success'))" title="Para entrevistados entrarem com câmera e microfone">🎙 Link do convidado</button>
          <button class="btn btn-p" style="font-size:10.5px;" onclick="ATV.estudio('${w.id}')">🎬 Abrir estúdio</button>` : `<button class="btn btn-g" style="font-size:10.5px;" onclick="ATV.wReabrir('${w.id}')">↺ Reabrir (links novos)</button>`}
          <button class="btn btn-g" style="font-size:10.5px;color:var(--red);" onclick="ATV.wExcluir('${w.id}')">✕</button></div>`; }).join('') : '<div style="font-size:11.5px;color:var(--t3);">Nenhum webinar ainda.</div>')
      + card('Como funciona', `<div style="font-size:11.5px;line-height:1.75;">1. <b>Crie o webinar</b> e mande o <b>link da sala privada</b> para a audiência (clientes, time, parceiros) — só quem tem o link assiste.<br>
        2. Mande o <b>link do convidado</b> para quem vai ser entrevistado — ele entra com câmera e microfone pelo navegador, sem instalar nada.<br>
        3. No <b>estúdio</b>, você liga câmera, microfone e compartilha a tela; a prévia mostra o programa com o layout Atlantyx TV (faixa com nome, mercados, produtos e notícias).<br>
        4. <b>Transmitir</b>: escolha YouTube, LinkedIn e/ou Instagram e clique em 🔴 — vai para todos ao mesmo tempo, com o layout. Sem transmitir, fica só na sala privada.<br>
        <span style="color:var(--t3);">LinkedIn Live exige que a página da Atlantyx tenha acesso ao LinkedIn Live; a cada live o LinkedIn e o Instagram (Live Producer, conta profissional) dão uma URL e chave novas — cole na aba Destinos antes de transmitir. O YouTube guarda a gravação da live no canal.</span></div>`);
  }
  async function wCriar(b) { const t = $('wT').value.trim(); if (!t) return nota('Dê um título', 'error'); b.disabled = true;
    try { await api('webinar_salvar', { titulo: t, inicio: $('wI').value ? new Date($('wI').value).toISOString() : null, duracao_min: $('wD').value, descricao: $('wS').value, faixa: { titulo: t, subtitulo: $('wS').value } }); nota('Webinar criado'); await carregar(); } catch (e) { nota(e.message, 'error'); b.disabled = false; } }
  async function wExcluir(id) { if (!confirm('Excluir este webinar?')) return; try { await api('webinar_excluir', { id }); await carregar(); } catch (e) { nota(e.message, 'error'); } }
  async function wReabrir(id) { try { await api('webinar_reabrir', { id }); nota('Reaberto com links novos'); await carregar(); } catch (e) { nota(e.message, 'error'); } }

  // ── estúdio ──
  function carregarLk() { return window.LivekitClient ? Promise.resolve() : new Promise((ok, err) => { const s = document.createElement('script'); s.src = LK_CDN; s.onload = ok; s.onerror = () => err(new Error('não carregou o módulo de vídeo')); document.head.appendChild(s); }); }
  async function estudio(id) { const w = (D.webinars || []).find(x => x.id === id); if (!w) return; est = { w, room: null, tk: null }; aba = 'webinars'; rEstudio(); }
  function rEstudio() {
    const w = est.w, ds = D.destinos || {}, fx = w.faixa || {}, no = w.status === 'ao_vivo';
    $('atvCorpo').innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><button class="btn btn-g" onclick="ATV.sairEstudio(true)">← Webinars</button><div style="font-family:var(--H);font-weight:700;font-size:14px;flex:1;">🎬 Estúdio · ${esc(w.titulo)}</div>
        <span id="eSt" style="font-size:12px;font-weight:700;color:${no ? 'var(--red)' : 'var(--t3)'};">${no ? '🔴 AO VIVO' : est.room ? '🟢 na sala' : '⚪ fora da sala'}</span></div>
      <div style="display:grid;grid-template-columns:minmax(260px,1fr) 2fr;gap:12px;">
        <div>${card('Você', `<div style="aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden;position:relative;" id="eCam"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:11px;">câmera desligada</div></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${est.room ? `<button class="btn btn-g" id="eMic" onclick="ATV.eToggle('mic')">🎤 Microfone</button><button class="btn btn-g" id="eCamB" onclick="ATV.eToggle('cam')">📷 Câmera</button><button class="btn btn-g" id="eTela" onclick="ATV.eToggle('tela')">🖥 Compartilhar tela</button><button class="btn btn-g" style="color:var(--red);" onclick="ATV.eSair()">Sair da sala</button>`
              : `<button class="btn btn-p" ${D.livekit ? '' : 'disabled'} onclick="ATV.eEntrar(this)">🎙 Entrar no estúdio (câmera e microfone)</button>`}</div>
            <div id="ePart" style="font-size:10.5px;color:var(--t3);margin-top:8px;"></div>`)}
          ${card('Faixa na tela', `${lbl('Título')}<input class="fi" id="fxT" value="${esc(fx.titulo)}">${lbl('Linha de baixo (convidado, tema…)')}<input class="fi" id="fxS" value="${esc(fx.subtitulo)}"><div style="margin-top:6px;text-align:right;"><button class="btn btn-g" onclick="ATV.eFaixa()">Atualizar faixa</button></div>`)}
          ${card('Links', `<div style="font-size:11px;line-height:1.9;">👥 Sala privada: <a href="${esc(w.link_sala)}" target="_blank" rel="noopener">abrir</a> · <a href="#" onclick="event.preventDefault();navigator.clipboard.writeText('${esc(w.link_sala)}').then(()=>toast('Copiado','success'))">copiar</a><br>🎙 Convidado: <a href="#" onclick="event.preventDefault();navigator.clipboard.writeText('${esc(w.link_convidado)}').then(()=>toast('Copiado — mande só para o entrevistado','success'))">copiar link</a></div>`)}</div>
        <div>${card('Programa (o que a audiência e as redes veem)', `<div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden;" id="ePrevBox">${est.tk?.previa ? `<iframe id="ePrev" src="${esc(rel(est.tk.previa))}" allow="autoplay" style="position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0;"></iframe>` : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:11px;text-align:center;padding:20px;">${cfg.link ? 'Entre no estúdio para ver a prévia do programa.' : 'Gere o link da Atlantyx TV (aba Atlantyx TV) — o layout do programa usa esse link.'}</div>`}</div>`)}
          ${card('Transmitir ao vivo', `<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;">${Object.entries(ds).map(([k, d]) => `<label style="display:flex;gap:6px;align-items:center;${d.configurado ? '' : 'opacity:.5;'}" title="${d.configurado ? '' : 'cadastre a chave na aba Destinos'}"><input type="checkbox" class="eDest" value="${k}" ${d.configurado ? '' : 'disabled'} ${(w.destinos || []).includes(k) ? 'checked' : ''}> ${esc(d.nome)}${d.configurado ? '' : ' (sem chave)'}</label>`).join('')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">${no ? `<button class="btn btn-g" style="color:var(--red);" onclick="ATV.eParar(false,this)">⏹ Parar transmissão (sala continua)</button>` : `<button class="btn btn-p" ${D.livekit && cfg.link ? '' : 'disabled'} onclick="ATV.eTransmitir(this)">🔴 Transmitir agora</button>`}
              <button class="btn btn-g" onclick="ATV.eParar(true,this)">✔ Encerrar o webinar</button></div>
            <div style="font-size:10.5px;color:var(--t3);margin-top:6px;line-height:1.6;">A transmissão leva ~20–40 s para aparecer nas redes. Encerrar fecha a sala privada e os links.</div>`)}</div></div>`;
    const f = $('ePrev'); if (f) { const aj = () => { f.style.transform = `scale(${f.parentElement.clientWidth / 1920})`; }; aj(); new ResizeObserver(aj).observe(f.parentElement); }
    if (est.room) { desenharCam(); participantes(); }
  }
  function desenharCam() { const box = $('eCam'); if (!box || !est?.room) return; const LK = window.LivekitClient, lp = est.room.localParticipant;
    const pub = [...lp.trackPublications.values()].find(p => p.track && p.kind === 'video' && p.source === LK.Track.Source.Camera);
    box.innerHTML = ''; if (pub && !pub.isMuted) { const v = pub.track.attach(); v.muted = true; v.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX(-1)'; box.appendChild(v); } else box.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:11px;">câmera desligada</div>';
    const st = (id, on) => { const b = $(id); if (b) b.style.background = on ? '' : 'rgba(224,18,58,.25)'; }; st('eMic', lp.isMicrophoneEnabled); st('eCamB', lp.isCameraEnabled); const t = $('eTela'); if (t) t.textContent = lp.isScreenShareEnabled ? '🖥 Parar tela' : '🖥 Compartilhar tela'; }
  function participantes() { const el = $('ePart'); if (!el || !est?.room) return; const R = [...est.room.remoteParticipants.values()]; const conv = R.filter(p => /^conv-|^host-/.test(p.identity)), pub = R.filter(p => /^pub-/.test(p.identity));
    el.innerHTML = `Na sala: ${conv.length ? conv.map(p => '🎙 ' + esc(p.name || p.identity)).join(', ') + ' · ' : ''}👥 ${pub.length} na audiência privada`; }
  async function eEntrar(b) { b.disabled = true; b.textContent = '⏳ Entrando…';
    try { await carregarLk(); const tk = await api('webinar_token', { id: est.w.id }); est.tk = tk; const LK = window.LivekitClient;
      const room = new LK.Room({ adaptiveStream: true, dynacast: true }); est.room = room;
      ['localTrackPublished', 'localTrackUnpublished', 'trackMuted', 'trackUnmuted'].forEach(ev => room.on(ev, () => desenharCam()));
      ['participantConnected', 'participantDisconnected'].forEach(ev => room.on(ev, () => participantes()));
      room.on('disconnected', () => { if (est) { est.room = null; rEstudio(); } });
      await room.connect(tk.url, tk.token); await room.localParticipant.enableCameraAndMicrophone();
      if (est.w.status === 'agendado') est.w.status = 'aberto'; rEstudio();
    } catch (e) { nota(e.message, 'error'); if (est) est.room = null; b.disabled = false; b.textContent = '🎙 Entrar no estúdio (câmera e microfone)'; } }
  async function eToggle(k) { const lp = est?.room?.localParticipant; if (!lp) return;
    try { if (k === 'mic') await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled); if (k === 'cam') await lp.setCameraEnabled(!lp.isCameraEnabled); if (k === 'tela') await lp.setScreenShareEnabled(!lp.isScreenShareEnabled, { audio: true }); } catch (e) { nota(e.message, 'error'); } desenharCam(); }
  function eSair() { try { est?.room?.disconnect(); } catch (_) {} if (est) { est.room = null; rEstudio(); } }
  function sairEstudio(rerender) { if (est?.w?.status === 'ao_vivo' && !confirm('A transmissão continua no ar sem a sua câmera. Sair mesmo assim?')) return; try { est?.room?.disconnect(); } catch (_) {} est = null; if (rerender) carregar(); }
  async function eFaixa() { try { await api('webinar_faixa', { id: est.w.id, titulo: $('fxT').value, subtitulo: $('fxS').value }); est.w.faixa = { titulo: $('fxT').value, subtitulo: $('fxS').value }; nota('Faixa atualizada — aparece em até 15 s'); } catch (e) { nota(e.message, 'error'); } }
  async function eTransmitir(b) { const dest = [...document.querySelectorAll('.eDest:checked')].map(x => x.value); if (!dest.length) return nota('Escolha pelo menos um destino', 'error');
    if (!est.room && !confirm('Você ainda não entrou no estúdio — a transmissão vai começar com a tela "aguardando". Continuar?')) return;
    b.disabled = true; b.textContent = '⏳ Ligando…'; try { await api('webinar_transmitir', { id: est.w.id, destinos: dest }); est.w.status = 'ao_vivo'; est.w.destinos = dest; nota('🔴 No ar em ' + dest.join(', ')); rEstudio(); } catch (e) { nota(e.message, 'error'); b.disabled = false; b.textContent = '🔴 Transmitir agora'; } }
  async function eParar(encerrar, b) { if (encerrar && !confirm('Encerrar o webinar? A sala privada fecha e os links deixam de funcionar.')) return; b.disabled = true;
    try { const r = await api('webinar_parar', { id: est.w.id, encerrar }); est.w.status = r.status; if (encerrar) { try { est.room?.disconnect(); } catch (_) {} est = null; nota('Webinar encerrado'); await carregar(); } else { nota('Transmissão parada — a sala privada continua'); rEstudio(); } } catch (e) { nota(e.message, 'error'); b.disabled = false; } }

  function gradeSet(v) { cfg.grade = !!v; }
  function cicloTxt() { const I = cfg.intercalar || {}, V = (cfg.playlist || []).filter(x => x.ativo !== false); let t = 0, sem = 0, nv = 0;
    V.forEach(v => { if (I.vinheta !== false) t += +I.vinheta_s || 25; t += +v.duracao_s || 180; if (!v.duracao_s) sem++; nv++;
      if (I.mercado_cada && nv % I.mercado_cada === 0) t += +I.mercado_s || 15; if (I.noticias_cada && nv % I.noticias_cada === 0) t += +I.noticias_s || 20; if (I.produto_cada && nv % I.produto_cada === 0) t += +I.produto_s || 12; });
    if (!V.length) return 'Sem vídeos: a grade roda vinheta, cotações, notícias e produtos.';
    return `⏱ Uma volta completa da programação dura <b>${mmss(t)}</b>${sem ? ` · <span style="color:var(--gold);">${sem} vídeo(s) sem duração — a grade usa 3:00 para eles; preencha a duração para os horários baterem</span>` : ''}.`; }

  // ═════════ v3.155: MOLDURA ATLANTYX TV gravada no navegador (para o vídeo publicado no YouTube) ═════════
  // Abertura (6 s) → vídeo dentro do layout (topo, lateral com produtos/serviços, faixa de título, letreiro) → encerramento (5 s).
  // Grava em tempo real (canvas + áudio do vídeo) com o MediaRecorder; sem cotações/notícias (ficariam velhas no vídeo).
  async function enviarBlob(blob, nome, titulo, onP) {
    const PM = 3400000, n = Math.ceil(blob.size / PM); const r = await api('midia_iniciar', { nome, titulo, content_type: (blob.type || 'video/webm').split(';')[0], tamanho: blob.size, partes: n });
    for (let i = 0; i < n; i++) { onP && onP(i, n); const dado = await b64(blob.slice(i * PM, (i + 1) * PM)); let ok = false, er = null;
      for (let k = 0; k < 3 && !ok; k++) { try { await api('midia_parte', { id: r.id, i, b64: dado }); ok = true; } catch (e) { er = e; await new Promise(x => setTimeout(x, 1500)); } } if (!ok) throw er; }
    await api('midia_concluir', { id: r.id }); return r.id;
  }
  async function fonteVideo(it) { // URL tocável no navegador para o vídeo original
    if (it.url && !it.envio_id) return it.url;
    const cod = (cfg.link || '').split('/').pop(); if (!cod) throw new Error('Gere o link da Atlantyx TV (aba Atlantyx TV) — a gravação lê o vídeo por ele');
    const q = it.midia_id ? '&m=' + it.midia_id : it.envio_id ? '&e=' + it.envio_id : null; if (!q) throw new Error('Este item não tem vídeo próprio');
    const n = it.midia_id ? (D.midias || []).find(m => m.id === it.midia_id)?.partes : null; const P = [];
    for (let i = 0; n == null || i < n; i++) { const r = await fetch('/api/atv?t=' + encodeURIComponent(cod) + '&parte=' + i + q); if (!r.ok) { if (n == null && i > 0) break; throw new Error('não consegui ler o vídeo (parte ' + (i + 1) + ')'); } P.push(await r.blob()); }
    return URL.createObjectURL(new Blob(P, { type: 'video/mp4' }));
  }
  function quebrar(ctx, txt, x, y, larg, alt, max) { const pal = String(txt || '').split(/\s+/); let l = '', n = 0; for (const p of pal) { const t = l ? l + ' ' + p : p; if (ctx.measureText(t).width > larg && l) { ctx.fillText(l, x, y + n * alt); l = p; if (++n >= max) return; } else l = t; } if (l && n < max) ctx.fillText(l, x, y + n * alt); }
  async function gravarMoldura(it, titulo, subtitulo, cv, onP) {
    const W = 1920, H = 1080, FPS = 30, INTRO = 6, OUTRO = 5, C = '#00C4CC', V2 = '#00FCA8';
    cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const logo = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = '/logo-atlantyx-branco.png'; });
    const src = await fonteVideo(it); const v = document.createElement('video'); v.src = src; v.crossOrigin = 'anonymous'; v.playsInline = true; v.preload = 'auto';
    await new Promise((ok, err) => { v.onloadedmetadata = ok; v.onerror = () => err(new Error('não consegui abrir o vídeo')); setTimeout(() => err(new Error('o vídeo demorou para abrir')), 60000); });
    const dur = v.duration; if (!isFinite(dur) || dur < 1) throw new Error('Duração do vídeo inválida');
    const A = new (window.AudioContext || window.webkitAudioContext)(), dest = A.createMediaStreamDestination();
    try { A.createMediaElementSource(v).connect(dest); } catch (_) {} try { await A.resume(); } catch (_) {}
    const jingle = t => { const g = A.createGain(); g.gain.value = .0001; g.connect(dest); const t0 = A.currentTime + t; g.gain.exponentialRampToValueAtTime(.2, t0 + .3); g.gain.exponentialRampToValueAtTime(.0001, t0 + 4.5);
      [[523.25, 0], [659.25, .35], [783.99, .7], [1046.5, 1.05]].forEach(n => { const o = A.createOscillator(); o.type = 'triangle'; o.frequency.value = n[0]; o.connect(g); o.start(t0 + n[1]); o.stop(t0 + n[1] + 1.4); }); };
    const stream = new MediaStream([...cv.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const tipo = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!tipo) throw new Error('Este navegador não grava vídeo — use o Chrome ou o Edge no computador');
    const rec = new MediaRecorder(stream, { mimeType: tipo, videoBitsPerSecond: 6000000, audioBitsPerSecond: 160000 }), partes = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) partes.push(e.data); };
    const P = cfg.produtos || [], S = cfg.servicos || [], letreiro = [...(cfg.faixa || []), ...P.map(p => p.nome.toUpperCase() + ' — ' + p.frase), ...S.map(s => 'ATLANTYX · ' + s)].join('     •     ');
    ctx.font = '600 34px Montserrat, Arial'; const largLet = ctx.measureText(letreiro + '     •     ').width || 1;
    const total = INTRO + dur + OUTRO; let t0 = 0, fase = 'intro', tocou = false;
    const moldura = (tv) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const gt = ctx.createLinearGradient(0, 0, 0, 84); gt.addColorStop(0, '#0A0F1F'); gt.addColorStop(1, '#000'); ctx.fillStyle = gt; ctx.fillRect(0, 0, W, 84); ctx.fillStyle = C; ctx.fillRect(0, 84, W, 5);
      if (logo) ctx.drawImage(logo, 36, 22, 40 * logo.width / logo.height, 40);
      const lx = logo ? 60 + 40 * logo.width / logo.height : 36; ctx.strokeStyle = '#1E2A52'; ctx.lineWidth = 2; ctx.strokeRect(lx, 18, 250, 50);
      ctx.font = '800 28px Montserrat, Arial'; ctx.fillStyle = '#EAF0FF'; ctx.fillText('ATLANTYX', lx + 16, 53); ctx.fillStyle = C; ctx.fillText('TV', lx + 196, 53);
      ctx.font = '600 26px Montserrat, Arial'; ctx.fillStyle = '#AAB6D8'; quebrar(ctx, titulo, lx + 280, 52, 1000, 30, 1);
      ctx.font = '700 22px Montserrat, Arial'; ctx.fillStyle = '#8E9BC0'; ctx.textAlign = 'right'; ctx.fillText((cfg.youtube_canal || '').replace(/^https?:\/\/(www\.)?/, ''), W - 36, 52); ctx.textAlign = 'left';
      // vídeo
      ctx.fillStyle = '#05070F'; ctx.fillRect(20, 104, 1440, 836); ctx.strokeStyle = '#1E2A52'; ctx.strokeRect(20, 104, 1440, 836);
      if (v.videoWidth) { const r = Math.min(1440 / v.videoWidth, 836 / v.videoHeight), w = v.videoWidth * r, h = v.videoHeight * r; ctx.drawImage(v, 20 + (1440 - w) / 2, 104 + (836 - h) / 2, w, h); }
      if (tv < 10) { const a = Math.min(1, tv / .6, (10 - tv) / .6); ctx.globalAlpha = a; ctx.font = '800 38px Montserrat, Arial'; const tw = Math.min(1200, ctx.measureText(String(titulo).toUpperCase()).width + 48);
        ctx.fillStyle = C; ctx.fillRect(56, 780, tw, 66); ctx.fillStyle = '#000'; quebrar(ctx, String(titulo).toUpperCase(), 80, 826, tw - 40, 40, 1);
        if (subtitulo) { ctx.font = '500 28px Montserrat, Arial'; const sw = Math.min(1200, ctx.measureText(subtitulo).width + 48); ctx.fillStyle = 'rgba(6,10,24,.92)'; ctx.fillRect(56, 846, sw, 52); ctx.fillStyle = V2; ctx.fillRect(56, 846, 8, 52); ctx.fillStyle = '#EAF0FF'; quebrar(ctx, subtitulo, 80, 882, sw - 40, 30, 1); }
        ctx.globalAlpha = 1; }
      // lateral
      ctx.fillStyle = '#070B18'; ctx.fillRect(1480, 104, 420, 836); ctx.strokeStyle = '#1E2A52'; ctx.strokeRect(1480, 104, 420, 836);
      ctx.font = '800 20px Montserrat, Arial'; ctx.fillStyle = C; ctx.fillText('PRODUTOS ATLANTYX', 1504, 146);
      if (P.length) { const p = P[Math.floor(tv / 10) % P.length]; ctx.font = '800 40px Montserrat, Arial'; ctx.fillStyle = '#EAF0FF'; quebrar(ctx, p.nome, 1504, 204, 372, 46, 2);
        ctx.font = '500 26px Montserrat, Arial'; ctx.fillStyle = '#C8D2EE'; quebrar(ctx, p.frase, 1504, 290, 372, 34, 5); }
      ctx.font = '800 20px Montserrat, Arial'; ctx.fillStyle = C; ctx.fillText('SERVIÇOS', 1504, 520);
      ctx.font = '500 24px Montserrat, Arial'; ctx.fillStyle = '#AAB6D8'; S.slice(0, 7).forEach((s, i) => { ctx.fillStyle = C; ctx.fillRect(1504, 552 + i * 52, 8, 8); ctx.fillStyle = '#AAB6D8'; quebrar(ctx, s, 1524, 562 + i * 52, 352, 26, 1); });
      // base
      ctx.fillStyle = '#0A0F1F'; ctx.fillRect(0, 956, W, 62); ctx.fillStyle = C; ctx.fillRect(0, 956, 210, 62); ctx.fillStyle = '#000'; ctx.font = '800 26px Montserrat, Arial'; ctx.fillText('ATLANTYX', 34, 997);
      ctx.fillStyle = '#EAF0FF'; ctx.font = '700 28px Montserrat, Arial'; quebrar(ctx, cfg.slogan || '', 236, 997, 1640, 30, 1);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 1018, W, 62); ctx.save(); ctx.beginPath(); ctx.rect(0, 1018, W, 62); ctx.clip(); ctx.font = '600 34px Montserrat, Arial'; ctx.fillStyle = '#EAF0FF';
      const off = (tv * 110) % largLet; for (let x = -off; x < W; x += largLet) ctx.fillText(letreiro, x, 1061); ctx.restore();
    };
    const cartela = (t, intro) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 1100); g.addColorStop(0, '#00303A'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const yy = ((t * 400) % (H + 200)) - 100; ctx.fillStyle = 'rgba(0,196,204,.6)'; ctx.fillRect(0, yy, W, 3);
      const a = Math.min(1, t / 1.2); ctx.globalAlpha = a; ctx.textAlign = 'center';
      if (logo) { const s = .6 + .4 * Math.min(1, t / 1.5), h = 110 * s, w = h * logo.width / logo.height; ctx.drawImage(logo, (W - w) / 2, 300 - h / 2, w, h); }
      ctx.font = '800 96px Montserrat, Arial'; ctx.fillStyle = '#EAF0FF'; ctx.fillText('ATLANTYX', W / 2 - 70, 470); ctx.fillStyle = C; ctx.fillText('TV', W / 2 + 290, 470);
      ctx.font = '500 34px Montserrat, Arial'; ctx.fillStyle = '#AAB6D8'; ctx.fillText(cfg.slogan || '', W / 2, 530);
      if (intro && t > 1.8) { ctx.globalAlpha = Math.min(1, (t - 1.8) / .8); ctx.fillStyle = C; ctx.fillRect(W / 2 - 130, 600, 260, 52); ctx.fillStyle = '#000'; ctx.font = '800 28px Montserrat, Arial'; ctx.fillText('A SEGUIR', W / 2, 636);
        ctx.fillStyle = '#EAF0FF'; ctx.font = '800 58px Montserrat, Arial'; quebrar(ctx, titulo, W / 2, 730, 1500, 66, 2); }
      if (!intro) { ctx.fillStyle = '#EAF0FF'; ctx.font = '800 54px Montserrat, Arial'; ctx.fillText('Inscreva-se e ative o sininho', W / 2, 660); ctx.font = '600 34px Montserrat, Arial'; ctx.fillStyle = C; ctx.fillText((cfg.youtube_canal || '').replace(/^https?:\/\/(www\.)?/, ''), W / 2, 720); }
      ctx.textAlign = 'left'; ctx.globalAlpha = 1; };
    return new Promise((ok, err) => {
      let tm = null; const fim = () => { clearInterval(tm); try { rec.stop(); } catch (_) {} };
      rec.onstop = () => { try { A.close(); } catch (_) {} if (src.startsWith('blob:')) URL.revokeObjectURL(src); ok(new Blob(partes, { type: tipo.split(';')[0] })); };
      v.onerror = () => { fim(); err(new Error('o vídeo parou de tocar')); };
      rec.start(1000); jingle(0.1); t0 = performance.now();
      tm = setInterval(() => { const t = (performance.now() - t0) / 1000; onP && onP(Math.min(1, t / total), t, total);
        if (t < INTRO) { cartela(t, true); return; }
        if (fase === 'intro') { fase = 'video'; v.play().then(() => { tocou = true; }).catch(e => { fim(); err(new Error('não consegui tocar o vídeo: ' + e.message)); }); }
        if (fase === 'video') { moldura(v.currentTime); if (v.ended || (tocou && v.currentTime >= dur - .05)) { fase = 'outro'; jingle(0); t0 = performance.now() - (INTRO + dur) * 1000; } return; }
        const to = t - INTRO - dur; cartela(to, false); if (to >= OUTRO) fim();
      }, 1000 / FPS);
    });
  }

  // ═════════ CANAL DO YOUTUBE (publicar direto numa playlist) ═════════
  let ytPls = null;
  function rCanal() {
    const y = D.youtube || {};
    const passo = (n, t) => `<div style="display:flex;gap:8px;margin:5px 0;"><b style="color:var(--cyan,#00C4CC);min-width:16px;">${n}</b><div>${t}</div></div>`;
    $('atvCorpo').innerHTML = (!y.configurado ? card('⚙ Ligar o YouTube ao sistema (uma vez só)', `<div style="font-size:11.5px;line-height:1.7;">
        ${passo(1, 'No <b>Google Cloud Console</b> (console.cloud.google.com), crie um projeto "Atlantyx OS".')}
        ${passo(2, 'Em <b>APIs e serviços → Biblioteca</b>, ative a <b>YouTube Data API v3</b>.')}
        ${passo(3, 'Em <b>Tela de consentimento OAuth</b>: tipo Externo, nome "Atlantyx OS", seu e-mail; em Usuários de teste, adicione o e-mail da conta do canal.')}
        ${passo(4, `Em <b>Credenciais → Criar credenciais → ID do cliente OAuth</b> → Aplicativo da Web → URI de redirecionamento autorizado:<br><code style="user-select:all;">${esc(y.retorno || '')}</code>`)}
        ${passo(5, 'Copie o ID e a chave secreta do cliente para a Vercel → Environment Variables: <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> → Redeploy. Nunca cole a chave aqui no chat.')}
        ${passo(6, 'Volte aqui e clique em <b>Conectar o canal</b>.')}</div>`) : '')
      + card('Canal do YouTube', y.conectado ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><span style="font-size:13px;font-weight:700;color:var(--gn);">✓ Conectado${y.canal?.titulo ? ': ' + esc(y.canal.titulo) : ''}</span>
          ${y.canal?.url ? `<a class="btn btn-g" href="${esc(y.canal.url)}" target="_blank" rel="noopener">↗ Abrir o canal</a>` : ''}<span style="font-size:10.5px;color:var(--t3);">desde ${quando(y.conectado_em)}</span><span style="flex:1"></span><button class="btn btn-g" style="color:var(--red);" onclick="ATV.ytSair()">Desconectar</button></div>`
        : `<div style="font-size:12px;margin-bottom:8px;">O canal ainda não está conectado. Você autoriza na própria página do Google — o sistema não vê sua senha.</div><button class="btn btn-p" ${y.configurado ? '' : 'disabled'} onclick="ATV.ytConectar(this)">▶ Conectar o canal do YouTube</button>`)
      + (y.conectado ? card('Playlists do canal', `<div id="ytPls" style="font-size:11.5px;">${ytPls ? ytPls.map(p => `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd);"><b style="flex:1;">${esc(p.titulo)}</b><span style="color:var(--t3);">${p.videos ?? 0} vídeos · ${esc(p.privacidade)}</span><a href="https://www.youtube.com/playlist?list=${esc(p.id)}" target="_blank" rel="noopener">abrir ↗</a></div>`).join('') || '<span style="color:var(--t3);">nenhuma playlist</span>' : 'Carregando…'}</div>
          <div style="display:flex;gap:6px;margin-top:10px;"><input class="fi" id="ytNova" placeholder="Nova playlist (ex.: Atlantyx TV)" style="flex:1;"><select class="fsel" id="ytNovaP" style="width:auto;"><option value="public">pública</option><option value="unlisted">não listada</option><option value="private">privada</option></select><button class="btn btn-g" onclick="ATV.ytCriarPl(this)">+ Criar playlist</button></div>
          <div style="font-size:10.5px;color:var(--t3);margin-top:8px;">Para publicar: aba Atlantyx TV → em cada vídeo da playlist, botão <b>▶ Publicar</b>. O vídeo sobe para o canal e entra direto na playlist escolhida.</div>`) : '');
    if (y.conectado && !ytPls) api('yt_playlists').then(r => { ytPls = r.playlists; if (aba === 'canal') rCanal(); }).catch(e => { const el = $('ytPls'); if (el) el.innerHTML = `<span style="color:var(--red);">${esc(e.message)}</span>`; });
  }
  async function ytConectar(b) { b.disabled = true; try { const r = await api('yt_conectar'); const w = window.open(r.url, 'atvYoutube', 'width=560,height=720');
      const fim = ev => { if (ev.data && ev.data.atvYoutube !== undefined) { window.removeEventListener('message', fim); ytPls = null; carregar().then(() => trocar('canal')); nota(ev.data.atvYoutube ? 'Canal conectado' : 'Não conectou — tente de novo', ev.data.atvYoutube ? 'success' : 'error'); } };
      window.addEventListener('message', fim); if (!w) { location.href = r.url; } setTimeout(() => { b.disabled = false; }, 4000); } catch (e) { nota(e.message, 'error'); b.disabled = false; } }
  async function ytSair() { if (!confirm('Desconectar o canal do YouTube?')) return; try { await api('yt_desconectar'); ytPls = null; await carregar(); trocar('canal'); } catch (e) { nota(e.message, 'error'); } }
  async function ytCriarPl(b) { const t = $('ytNova').value.trim(); if (!t) return nota('Dê um nome', 'error'); b.disabled = true; try { await api('yt_playlist_criar', { titulo: t, privacidade: $('ytNovaP').value }); ytPls = null; nota('Playlist criada'); rCanal(); } catch (e) { nota(e.message, 'error'); b.disabled = false; } }
  function modalYt(html) { let m = $('atvModal'); if (m) m.remove(); m = document.createElement('div'); m.id = 'atvModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px;';
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:12px;width:min(640px,100%);padding:16px 18px;">${html}</div>`; document.body.appendChild(m); return m; }
  async function ytPub(i) {
    lerCampos(); const it = cfg.playlist[i]; if (!it) return; if (JSON.stringify(cfg.playlist) !== JSON.stringify(D.config.playlist)) { try { await salvar(); } catch (_) {} }
    if (!ytPls) { try { ytPls = (await api('yt_playlists')).playlists; } catch (e) { return nota(e.message, 'error'); } }
    const ehYt = it.fonte === 'youtube';
    modalYt(`<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><div style="font-family:var(--H);font-weight:700;font-size:14px;flex:1;">▶ ${ehYt ? 'Adicionar à playlist do YouTube' : 'Publicar no YouTube'}</div><button class="btn btn-g" onclick="document.getElementById('atvModal').remove()">✕</button></div>
      ${ehYt ? '' : `${lbl('Título')}<input class="fi" id="ypT" value="${esc(it.titulo)}" maxlength="100">${lbl('Descrição')}<textarea class="fta" id="ypD" style="min-height:120px;">${esc([it.subtitulo, it.chamada].filter(Boolean).join('\n\n'))}</textarea>
      <div style="display:flex;gap:6px;margin-top:4px;"><button class="btn btn-g" onclick="ATV.ytIA('${esc(it.id)}',this)">✍ IA escreve título e descrição</button><input class="fi" id="ypTags" placeholder="tags separadas por vírgula" style="flex:1;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><div>${lbl('Visibilidade')}<select class="fsel" id="ypP"><option value="public">pública</option><option value="unlisted">não listada</option><option value="private">privada</option></select></div>
      <div>${lbl('Agendar publicação (opcional)')}<input class="fi" type="datetime-local" id="ypA"></div></div>`}
      ${ehYt ? '' : `<label style="display:flex;gap:6px;align-items:flex-start;margin-top:10px;font-size:12px;"><input type="checkbox" id="ypM" checked style="margin-top:2px;"> <span><b>🎬 Com a moldura Atlantyx TV</b> — abertura, faixa com o título, produtos e serviços na lateral, letreiro e encerramento "Inscreva-se". Grava aqui no navegador e leva o tempo do vídeo + 11 s: deixe esta aba aberta e visível.</span></label>
      <canvas id="ypCv" style="display:none;width:100%;aspect-ratio:16/9;margin-top:8px;border-radius:8px;border:1px solid var(--bd);background:#000;"></canvas>`}
      ${lbl('Playlist')}<select class="fsel" id="ypL"><option value="">— nenhuma —</option>${(ytPls || []).map(p => `<option value="${esc(p.id)}" ${/atlantyx tv/i.test(p.titulo) ? 'selected' : ''}>${esc(p.titulo)}</option>`).join('')}</select>
      <div id="ypS" style="font-size:11.5px;color:var(--t2);margin-top:10px;"></div><div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-top:6px;"><i id="ypB" style="display:block;height:100%;width:0;background:#00C4CC;"></i></div>
      <div style="text-align:right;margin-top:12px;"><button class="btn btn-p" id="ypGo" onclick="ATV.ytEnviar('${esc(it.id)}')">${ehYt ? '+ Adicionar à playlist' : '▶ Publicar agora'}</button></div>`);
  }
  async function ytIA(id, b) { b.disabled = true; b.textContent = '⏳ Escrevendo…'; try { const r = await api('yt_descricao', { item_id: id }); $('ypT').value = r.titulo; $('ypD').value = r.descricao; $('ypTags').value = (r.tags || []).join(', '); } catch (e) { nota(e.message, 'error'); } b.disabled = false; b.textContent = '✍ IA escreve título e descrição'; }
  async function ytEnviar(id) {
    const go = $('ypGo'), st = $('ypS'), bar = $('ypB'); go.disabled = true;
    const v = k => $(k) ? $(k).value : '';
    let midiaMoldura = null;
    try { if ($('ypM')?.checked) { const it = cfg.playlist.find(x => x.id === id), cv = $('ypCv'); cv.style.display = 'block';
        st.textContent = '⏳ Preparando a gravação com a moldura…';
        const blob = await gravarMoldura(it, v('ypT') || it.titulo, it.subtitulo || '', cv, (f, t, tot) => { st.textContent = `🎬 Gravando com a moldura: ${mmss(t)} de ${mmss(tot)} — não feche nem esconda esta aba`; bar.style.width = Math.round(f * 100) + '%'; });
        st.textContent = '⏳ Guardando a versão com moldura no sistema…'; bar.style.width = '0%';
        midiaMoldura = await enviarBlob(blob, (it.titulo || 'video') + ' (moldura).' + (blob.type.includes('mp4') ? 'mp4' : 'webm'), (it.titulo || '') + ' · moldura', (i, n) => { st.textContent = `⏳ Guardando a versão com moldura: parte ${i + 1} de ${n} (${mb(blob.size)})…`; bar.style.width = Math.round(i / n * 100) + '%'; }); }
      const r = await api('yt_publicar_iniciar', { item_id: id, midia_id: midiaMoldura, titulo: v('ypT'), descricao: v('ypD'), tags: v('ypTags').split(',').map(s => s.trim()).filter(Boolean), privacidade: v('ypP') || 'public', agendar: v('ypA') ? new Date(v('ypA')).toISOString() : null, playlist_id: v('ypL') || null });
      let fim = r; if (!r.pronto) { let p = { offset: 0, tamanho: r.tamanho }; let erros = 0;
        while (!p.pronto) { st.textContent = `⏳ Enviando para o YouTube: ${mb(p.offset)} de ${mb(p.tamanho)}…`; bar.style.width = Math.round((p.offset / p.tamanho) * 100) + '%';
          try { p = await api('yt_publicar_passo', { job_id: r.job_id }); erros = 0; } catch (e) { if (++erros > 3) throw e; await new Promise(x => setTimeout(x, 2500)); } }
        fim = p; }
      bar.style.width = '100%'; st.innerHTML = `✅ ${fim.so_playlist ? 'Adicionado à playlist' : 'Publicado'}: <a href="https://youtu.be/${esc(fim.video_id)}" target="_blank" rel="noopener">youtu.be/${esc(fim.video_id)}</a>${fim.aviso ? `<br><span style="color:var(--gold);">⚠ ${esc(fim.aviso)}</span>` : ''}<br><span style="color:var(--t3);">O YouTube leva alguns minutos para processar o vídeo.</span>`;
      if (midiaMoldura) { try { await api('midia_excluir', { id: midiaMoldura }); } catch (_) {} }
      ytPls = null; await carregar(); } catch (e) { st.innerHTML = `<span style="color:var(--red);">⚠ ${esc(e.message)}</span>`; go.disabled = false; } }

  // ═════════ DESTINOS ═════════
  const AJUDA = {
    youtube: 'YouTube Studio → Criar → Transmitir ao vivo → Stream. Copie a "Chave de transmissão" (a URL do servidor já vem preenchida). A primeira live do canal pode levar até 24 h para ser liberada pelo YouTube.',
    linkedin: 'Página da Atlantyx no LinkedIn → Evento → Live (via ferramenta externa / "Custom stream"). O LinkedIn mostra a "Stream URL" e a "Stream key" — copie as duas a cada live. Exige que a página tenha acesso ao LinkedIn Live.',
    instagram: 'Instagram no computador (conta profissional) → Criar → Ao vivo → copie a "URL de transmissão" e a "Chave de transmissão". Mudam a cada live — cole aqui pouco antes de começar.',
  };
  function rDestinos() {
    const ds = D.destinos || {};
    $('atvCorpo').innerHTML = `<div style="font-size:11.5px;color:var(--t2);margin-bottom:10px;line-height:1.6;">As chaves ficam <b>cifradas</b> no sistema e nunca voltam para a tela. Para trocar, cole a nova. Nunca mande chave de transmissão ou senha pelo chat.</div>`
      + Object.entries(ds).map(([k, d]) => card(`${esc(d.nome)} ${d.configurado ? '<span style="color:var(--gn);font-size:11px;font-weight:600;">· chave cadastrada ' + quando(d.em) + '</span>' : '<span style="color:var(--t3);font-size:11px;font-weight:400;">· sem chave</span>'}`,
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div>${lbl('URL do servidor (RTMP/RTMPS)')}<input class="fi" id="dR_${k}" value="${esc(d.rtmp)}" placeholder="rtmp://…"></div><div>${lbl('Chave de transmissão')}<input class="fi" type="password" autocomplete="new-password" id="dK_${k}" placeholder="${d.configurado ? '•••••••• (cadastrada — cole outra para trocar)' : 'cole a chave'}"></div></div>
         <div style="font-size:10.5px;color:var(--t3);margin-top:6px;line-height:1.6;">${AJUDA[k] || ''}</div>
         <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">${d.configurado ? `<button class="btn btn-g" style="color:var(--red);" onclick="ATV.dLimpar('${k}')">Apagar chave</button>` : ''}<button class="btn btn-p" onclick="ATV.dSalvar('${k}',this)">💾 Salvar</button></div>`)).join('');
  }
  async function dSalvar(k, b) { b.disabled = true; try { const r = await api('destinos_salvar', { plataforma: k, rtmp: $('dR_' + k).value, chave: $('dK_' + k).value }); D.destinos = r.destinos; nota('Destino salvo'); rDestinos(); } catch (e) { nota(e.message, 'error'); b.disabled = false; } }
  async function dLimpar(k) { if (!confirm('Apagar a chave?')) return; try { const r = await api('destinos_limpar', { plataforma: k }); D.destinos = r.destinos; rDestinos(); } catch (e) { nota(e.message, 'error'); } }

  window.ATV = { abrir, aba: trocar, link, salvar, campo, mover, tirar, inter, addYoutube, addUrl, addReacao, enviar, chamadas, atualizar, tv, janela,
    wCriar, wExcluir, gradeSet, _gravarMoldura: (it, t, s, cv, f) => gravarMoldura(it, t, s, cv, f), ytConectar, ytSair, ytCriarPl, ytPub, ytIA, ytEnviar, _seg: seg, wReabrir, estudio, eEntrar, eToggle, eSair, sairEstudio, eFaixa, eTransmitir, eParar, dSalvar, dLimpar, _estado: () => ({ D, cfg, aba, est }) };
})();
