// public/video-post.js — v3.486 · POST EM VÍDEO EM 1ª PESSOA (Marketing → Publicações)
// O fundador grava na hora (câmera + teleprompter com a fala escrita pela IA) ou envia um vídeo pronto. O sistema monta o vídeo
// final 4:5 (720×900): nome e cargo no início e, na parte final, a FAIXA DA OFERTA com QR code para a página de captura da oferta
// da campanha. Hospeda o MP4 (≤ 4,3 MB) e publica/agenda no LinkedIn (empresa + perfil pessoal, se ligado), Facebook e, opcional,
// como Reel no Instagram. Nada é publicado sem o clique em "Publicar".
(function () {
  const W = 720, H = 900, MAX_MB = 4.2, MAX_S = 90;
  const $ = id => document.getElementById(id);
  const E = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  let V = null; // estado

  function fechar() { try { (V?.stream?.getTracks() || []).forEach(t => t.stop()); } catch (_) {} try { cancelAnimationFrame(V?.raf); } catch (_) {} V = null; _fbFechar(); }
  function st(h) { const e = $('vpSt'); if (e) e.innerHTML = h || ''; }
  function mime() { if (typeof _trMime === 'function') return _trMime(false); const L = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']; return L.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || null; }
  function cover(ctx, src, sw, sh) { const r = Math.max(W / sw, H / sh), dw = sw * r, dh = sh * r; ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh); }
  function wrap(ctx, t, maxW) { const w = String(t || '').split(/\s+/), L = []; let c = ''; w.forEach(x => { const s = c ? c + ' ' + x : x; if (ctx.measureText(s).width > maxW && c) { L.push(c); c = x; } else c = s; }); if (c) L.push(c); return L; }

  // camadas por cima do vídeo: nome no início, faixa da oferta + QR no final (entra deslizando)
  function camadas(ctx, t, dur) {
    const R = V.rot || {};
    if (V.logo?.complete && V.logo.naturalWidth) { const h = 26; ctx.globalAlpha = .9; ctx.drawImage(V.logo, 28, 28, V.logo.naturalWidth * h / V.logo.naturalHeight, h); ctx.globalAlpha = 1; }
    if (t < 5) { const a = Math.min(1, t / .5, (5 - t) / .5); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(3,8,12,.72)'; ctx.fillRect(0, H - 170, W * .78, 76); ctx.fillStyle = '#00FCA8'; ctx.fillRect(0, H - 170, 6, 76);
      ctx.fillStyle = '#fff'; ctx.font = '800 28px Montserrat, Arial'; ctx.fillText('Fabio Quintanilha', 26, H - 128); ctx.fillStyle = '#C9E6EA'; ctx.font = '500 20px Montserrat, Arial'; ctx.fillText('CEO e fundador · Atlantyx', 26, H - 102); ctx.globalAlpha = 1; }
    if (R.gancho_tela && t < 4.5) { const a = Math.min(1, (4.5 - t) / .5); ctx.globalAlpha = a; ctx.font = '800 34px Montserrat, Arial'; const ls = wrap(ctx, R.gancho_tela.toUpperCase(), W - 80).slice(0, 3);
      ctx.fillStyle = 'rgba(3,8,12,.6)'; ctx.fillRect(24, 80, W - 48, ls.length * 44 + 30); ls.forEach((l, i) => { ctx.fillStyle = '#fff'; ctx.fillText(l, 40, 122 + i * 44); }); ctx.globalAlpha = 1; }
    const ini = Math.max(dur * 0.6, dur - 15); // a oferta aparece nos últimos 40% (no máximo nos últimos 15 s)
    if (t >= ini) { const k = Math.min(1, (t - ini) / .6), y0 = H - 250 * k;
      const g = ctx.createLinearGradient(0, y0 - 60, 0, H); g.addColorStop(0, 'rgba(3,8,12,0)'); g.addColorStop(.25, 'rgba(3,8,12,.82)'); g.addColorStop(1, 'rgba(3,8,12,.95)'); ctx.fillStyle = g; ctx.fillRect(0, y0 - 60, W, H - y0 + 60);
      ctx.fillStyle = '#00C4CC'; ctx.fillRect(0, y0, W, 3);
      const q = V.qr, tam = 176, qx = W - 28 - tam, qy = y0 + 30;
      if (q) { ctx.fillStyle = '#fff'; ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(qx - 8, qy - 8, tam + 16, tam + 16, 12) : ctx.rect(qx - 8, qy - 8, tam + 16, tam + 16)); ctx.fill();
        const m = tam / (q.n + 2); ctx.fillStyle = '#0b1220'; for (let i = 0; i < q.n; i++) for (let j = 0; j < q.n; j++) if (q.bits[i * q.n + j] === '1') ctx.fillRect(qx + (j + 1) * m, qy + (i + 1) * m, Math.ceil(m), Math.ceil(m)); }
      ctx.fillStyle = '#00FCA8'; ctx.font = '700 16px Montserrat, Arial'; if ('letterSpacing' in ctx) ctx.letterSpacing = '3px'; ctx.fillText('APONTE A CÂMERA DO CELULAR', 28, y0 + 48); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.fillStyle = '#fff'; ctx.font = '800 32px Montserrat, Arial'; const lt = wrap(ctx, R.oferta_titulo || 'Mapa de Oportunidades com IA, grátis', W - tam - 90).slice(0, 3); lt.forEach((l, i) => ctx.fillText(l, 28, y0 + 92 + i * 38));
      ctx.fillStyle = '#C9E6EA'; ctx.font = '500 20px Montserrat, Arial'; wrap(ctx, R.oferta_sub || '', W - tam - 90).slice(0, 2).forEach((l, i) => ctx.fillText(l, 28, y0 + 104 + lt.length * 38 + i * 26)); }
  }

  async function abrir() {
    fechar();
    V = { rot: null, qr: null, bruto: null, durBruto: 0, final: null, url: null, stream: null };
    V.logo = new Image(); V.logo.src = '/logo-atlantyx-branco.png';
    const tema = document.getElementById('cCtx')?.value || '', oferta = document.getElementById('cOferta')?.value || '';
    const ag = new Date(Date.now() + 2 * 3600e3); ag.setMinutes(0, 0, 0); const pad = n => String(n).padStart(2, '0');
    const quando = ag.getFullYear() + '-' + pad(ag.getMonth() + 1) + '-' + pad(ag.getDate()) + 'T' + pad(ag.getHours()) + ':00';
    _fbModal('<div class="qp-mh"><div><div class="fv2-pt">🎥 Post em vídeo — você falando para a câmera</div><div class="fv2-pq">Vídeo em 1ª pessoa é o formato que mais alcança no LinkedIn. A faixa com a oferta e o QR code entra sozinha na parte final.</div></div><button class="btn" onclick="VIDEOPOST.fechar()">✕</button></div>'
      + '<div style="display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:14px;align-items:start;">'
      + '<div><canvas id="vpC" width="' + W + '" height="' + H + '" style="width:100%;border-radius:10px;background:#03080c;display:block;"></canvas><div id="vpSt" class="fv2-pq" style="margin-top:6px;"></div></div>'
      + '<div style="min-width:0;">'
      + '<label class="fl">1. Assunto do vídeo</label><textarea class="fta" id="vpTema" style="min-height:44px;">' + E(tema) + '</textarea>'
      + '<label class="fl">Oferta (faixa final + QR code)</label><input class="fi" id="vpOferta" value="' + E(oferta) + '" placeholder="Vazio = oferta da campanha"/>'
      + '<div class="mc-sug" style="margin:6px 0;"><button class="btn btn-gn" id="vpBtR" onclick="VIDEOPOST.roteiro()">✍ Escrever a fala com IA</button></div>'
      + '<div class="fv2-pq">Teleprompter</div><div id="vpTp" style="height:120px;overflow:auto;background:var(--bg3,#0e1525);border:1px solid var(--bd);border-radius:8px;padding:8px 10px;font-size:15px;line-height:1.5;">Clique em "Escrever a fala com IA" (ou fale do seu jeito).</div>'
      + '<label class="fl" style="margin-top:8px;">2. Gravar ou enviar</label><div class="mc-sug"><button class="btn btn-gn" id="vpBtCam" onclick="VIDEOPOST.camera()">📷 Ligar câmera</button><button class="btn btn-gn" id="vpBtRec" onclick="VIDEOPOST.gravar()" disabled>⏺ Gravar</button>'
      + '<label class="btn btn-g" style="cursor:pointer;">⬆ Enviar vídeo<input type="file" accept="video/*" style="display:none" onchange="VIDEOPOST.arquivo(this)"></label></div>'
      + '<label class="fl" style="margin-top:8px;">3. Publicar</label><textarea class="fta" id="vpLeg" style="min-height:70px;" placeholder="Legenda do post (a IA escreve junto com a fala)"></textarea>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;margin:6px 0;"><label><input type="checkbox" id="vpLi" checked> LinkedIn (+ pessoal, se ligado)</label><label><input type="checkbox" id="vpFb" checked> Facebook</label><label><input type="checkbox" id="vpIg"> Instagram (Reel)</label>'
      + '<input type="datetime-local" class="fi" id="vpQuando" value="' + quando + '" style="width:auto;"></div>'
      + '<div class="mc-sug"><button class="btn btn-or" id="vpBtPub" onclick="VIDEOPOST.publicar()" disabled>🚀 Publicar / agendar</button><button class="btn btn-g" id="vpBtBx" onclick="VIDEOPOST.baixar()" disabled>⬇ Baixar o vídeo</button></div>'
      + '</div></div>', 920);
    desenharVazio();
  }
  function desenharVazio() { const c = $('vpC'); if (!c) return; const x = c.getContext('2d'); x.fillStyle = '#03080c'; x.fillRect(0, 0, W, H); x.fillStyle = '#6E7BA0'; x.font = '600 26px Montserrat, Arial'; x.textAlign = 'center'; x.fillText('Prévia do vídeo (4:5)', W / 2, H / 2); x.textAlign = 'left'; }

  async function roteiro() {
    const b = $('vpBtR'); b.disabled = true; b.textContent = 'Escrevendo…';
    try { const of = $('vpOferta').value.trim(); if (of) await mcApi('oferta_salvar', { texto: of });
      const d = await mcApi('video_roteiro', { tema: $('vpTema').value, oferta: of });
      V.rot = d; $('vpTp').innerHTML = E(d.fala).replace(/\n/g, '<br>'); if (!$('vpLeg').value) $('vpLeg').value = d.legenda || '';
      await carregarQr(d.url_qr); st('✓ Fala pronta. QR code → página da oferta "' + E(d.oferta_titulo) + '".');
    } catch (e) { st('Não escrevi a fala: ' + E(e.message)); }
    b.disabled = false; b.textContent = '✍ Escrever a fala com IA';
  }
  async function carregarQr(url) {
    const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'qr_matriz', payload: { url } }) });
    const d = await r.json(); if (d.success && d.bits) V.qr = { n: d.n, bits: d.bits };
  }
  async function garantirRoteiro() { if (V.rot) return; st('Montando a oferta e o QR code…'); try { const d = await mcApi('lp_url', { rede: 'video' }); V.rot = { oferta_titulo: d.oferta?.titulo || 'Mapa de Oportunidades com IA, grátis', oferta_sub: d.oferta?.sub || 'no seu WhatsApp em 1 dia útil', url_qr: d.url, link_comentario: d.url }; await carregarQr(d.url); } catch (_) {} }

  async function camera() {
    try { V.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } });
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = V.stream; await v.play(); V.cam = v; $('vpBtRec').disabled = false;
      const ctx = $('vpC').getContext('2d'); const loop = () => { if (!V || !V.cam) return; cover(ctx, v, v.videoWidth, v.videoHeight); if (V.gravando) { const t = (Date.now() - V.t0) / 1000; ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.arc(W - 40, 40, 12, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 22px Montserrat, Arial'; ctx.fillText(Math.floor(t) + ' s', W - 100, 48);
          const tp = $('vpTp'); if (tp) tp.scrollTop += 0.6; if (t > MAX_S) gravar(); } V.raf = requestAnimationFrame(loop); }; loop();
      st('Câmera ligada. Olhe para a câmera e leia o teleprompter. Até ' + MAX_S + ' s (ideal: 40–60 s).');
    } catch (e) { st('Sem acesso à câmera/microfone: ' + E(e.message)); }
  }
  function gravar() {
    if (!V.stream) return;
    if (V.gravando) { V.gravando = false; V.rec.stop(); $('vpBtRec').textContent = '⏺ Gravar de novo'; return; }
    const m = (() => { const L = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']; return L.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }); })();
    V.ch = []; V.rec = new MediaRecorder(V.stream, { mimeType: m, videoBitsPerSecond: 3000000 }); V.rec.ondataavailable = e => e.data.size && V.ch.push(e.data);
    V.rec.onstop = () => { V.durBruto = (Date.now() - V.t0) / 1000; V.bruto = new Blob(V.ch, { type: m.split(';')[0] }); montar(); };
    V.t0 = Date.now(); V.gravando = true; V.rec.start(500); $('vpBtRec').textContent = '⏹ Parar'; const tp = $('vpTp'); if (tp) tp.scrollTop = 0;
  }
  function arquivo(inp) { const f = inp.files?.[0]; if (!f) return; V.bruto = f; V.durBruto = 0; montar(); }

  // passa o vídeo bruto pelo canvas (camadas + oferta/QR) e regrava com o áudio em MP4 dentro do limite de tamanho
  async function montar() {
    try {
      await garantirRoteiro();
      const mFinal = mime(); if (!mFinal) throw new Error('este navegador não grava MP4 — use Chrome ou Edge atualizados');
      if (V.cam) { V.cam.pause(); V.cam = null; } (V.stream?.getTracks() || []).forEach(t => t.stop()); V.stream = null; $('vpBtRec').disabled = true;
      const v = document.createElement('video'); v.playsInline = true; v.src = URL.createObjectURL(V.bruto); v.preload = 'auto';
      await new Promise((ok, er) => { v.onloadedmetadata = ok; v.onerror = () => er(new Error('não consegui ler o vídeo')); });
      let dur = isFinite(v.duration) && v.duration > 0 ? v.duration : V.durBruto;
      if (!(dur > 0)) { v.currentTime = 1e9; await new Promise(r => { v.ontimeupdate = () => { v.ontimeupdate = null; r(); }; setTimeout(r, 1500); }); dur = isFinite(v.duration) ? v.duration : V.durBruto || 60; v.currentTime = 0; }
      if (dur > MAX_S + 1) throw new Error('vídeo de ' + Math.round(dur) + ' s — o limite é ' + MAX_S + ' s (o ideal para o LinkedIn é 40–60 s)');
      const ac = new (window.AudioContext || window.webkitAudioContext)(), srcA = ac.createMediaElementSource(v), dest = ac.createMediaStreamDestination(); srcA.connect(dest); try { await ac.resume(); } catch (_) {}
      const c = $('vpC'), ctx = c.getContext('2d'), out = c.captureStream(30);
      const vbps = Math.max(250000, Math.min(1800000, Math.floor((MAX_MB * 8 * 1048576) / dur - 100000)));
      const rec = new MediaRecorder(new MediaStream([...out.getVideoTracks(), ...dest.stream.getAudioTracks()]), { mimeType: mFinal, videoBitsPerSecond: vbps, audioBitsPerSecond: 64000 });
      const ch = []; rec.ondataavailable = e => e.data.size && ch.push(e.data);
      const fim = new Promise(r => { rec.onstop = r; });
      let parar = false; v.onended = () => { parar = true; };
      rec.start(500); await v.play();
      await new Promise(r => { const loop = () => { if (parar || v.currentTime >= dur - 0.05) { r(); return; } cover(ctx, v, v.videoWidth, v.videoHeight); camadas(ctx, v.currentTime, dur);
        st('🎬 Montando o vídeo final: ' + Math.round(v.currentTime) + ' de ' + Math.round(dur) + ' s (toca em tempo real)'); requestAnimationFrame(loop); }; loop(); });
      rec.stop(); await fim; try { ac.close(); } catch (_) {}
      V.final = new Blob(ch, { type: mFinal.split(';')[0] });
      const mb = V.final.size / 1048576;
      if (mb > 4.3) throw new Error('vídeo final com ' + mb.toFixed(1) + ' MB (limite 4,3 MB) — grave um pouco mais curto');
      $('vpBtPub').disabled = false; $('vpBtBx').disabled = false; V.url = null;
      st('✓ Vídeo pronto: ' + Math.round(dur) + ' s · ' + mb.toFixed(1) + ' MB. Confira a legenda e clique em Publicar.');
    } catch (e) { st('❌ ' + E(e.message)); }
  }
  function baixar() { if (!V?.final) return; const a = document.createElement('a'); a.href = URL.createObjectURL(V.final); a.download = 'video-atlantyx.mp4'; a.click(); }

  async function publicar() {
    const b = $('vpBtPub'); if (!V?.final) return; b.disabled = true;
    try {
      const redes = [$('vpLi').checked && 'linkedin', $('vpFb').checked && 'facebook'].filter(Boolean), ig = $('vpIg').checked;
      if (!redes.length && !ig) throw new Error('escolha ao menos uma rede');
      const leg = $('vpLeg').value.trim(); if (!leg) throw new Error('escreva a legenda do post');
      if (!V.url) { st('⬆ Hospedando o vídeo…'); V.url = await _trSubir(V.final, 'video-' + Date.now() + '.mp4', 'reels', 'mp4', 'video/'); }
      const q = $('vpQuando').value, data_hora = q ? q + ':00' : null, link = V.rot?.link_comentario || '';
      const feitos = [];
      if (redes.length) { st('📅 Agendando no ' + redes.join(' e ') + '…'); const d = await mcApi('publicar', { payload: { texto: leg, redes, data_hora, imagem_url: V.url, tipo: 'POST', comentario: link ? 'A página com a oferta → ' + link : undefined } });
        feitos.push(redes.join(' + ') + (d.linkedin_pessoal?.ok ? ' + LinkedIn pessoal' : d.linkedin_pessoal?.erro ? ' (pessoal falhou: ' + d.linkedin_pessoal.erro + ')' : '')); }
      if (ig) { st('📅 Agendando o Reel no Instagram…'); await mcApi('publicar', { payload: { texto: leg.replace(/Ou use o link no primeiro coment[áa]rio\.?/i, '').trim(), redes: ['instagram'], data_hora, imagem_url: V.url, tipo: 'REEL' } }); feitos.push('Instagram (Reel)'); }
      st('✅ Agendado: ' + E(feitos.join(' · ')) + (q ? ' para ' + q.replace('T', ' ') : ''));
      try { toast('Vídeo agendado: ' + feitos.join(' · '), 'success'); } catch (_) {}
    } catch (e) { st('❌ ' + E(e.message)); b.disabled = false; }
  }
  window.VIDEOPOST = { abrir, fechar, roteiro, camera, gravar, arquivo, publicar, baixar };
})();
