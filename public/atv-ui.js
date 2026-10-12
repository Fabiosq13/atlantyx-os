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
  const lbl = t => `<label class="fl">${t}</label>`;
  const FONTE = { upload: ['enviado', 'var(--gn)'], youtube: ['YouTube', 'var(--red)'], url: ['link', 'var(--blue)'], reacao: ['reação S2', 'var(--pu)'] };

  function abrir(qual) {
    const box = $('atvApp'); if (!box) return; if (qual) aba = qual;
    box.innerHTML = `<div style="background:linear-gradient(135deg,rgba(0,196,204,.14),rgba(0,252,168,.05));border:1px solid rgba(0,196,204,.35);border-radius:10px;padding:14px 18px;margin-bottom:12px;">
      <div style="font-family:var(--H);font-size:15px;font-weight:700;">📡 Atlantyx TV &amp; Webinars ao vivo</div>
      <div style="font-size:11px;color:var(--t2);margin-top:3px;line-height:1.6;">Canal contínuo no layout estilo Bloomberg: <b>playlist circular</b> de reações, entrevistas e vídeos de produto, com <b>vinheta de 25 s</b> entre eles, <b>cotações</b> (dólar, euro, bitcoin, Ibovespa, ações), <b>últimas notícias escritas pela IA</b> e barras com produtos e serviços. Roda na TV do escritório pelo link e vai para o <b>YouTube</b>. Na aba Webinars você faz lives em <b>sala privada</b> ou ao mesmo tempo no <b>YouTube, LinkedIn e Instagram</b>, com o mesmo layout.</div></div>
      <div class="seg" id="atvAbas" style="margin-bottom:10px;">${[['tv', '📺 Atlantyx TV'], ['youtube', '🔴 No YouTube 24h'], ['webinars', '🎙 Webinars ao vivo'], ['destinos', '🔑 Destinos']].map(([k, r]) => `<button class="${aba === k ? 'on' : ''}" data-a="${k}" onclick="ATV.aba('${k}')">${r}</button>`).join('')}</div>
      <div id="atvCorpo"><div style="padding:30px;text-align:center;color:var(--t3);font-size:11px;">Carregando…</div></div>`;
    carregar();
  }
  async function carregar() { try { D = await api('inicio'); cfg = JSON.parse(JSON.stringify(D.config)); render(); } catch (e) { $('atvCorpo').innerHTML = `<div style="color:var(--red);font-size:12px;padding:12px;">${esc(e.message)}</div>`; } }
  function trocar(k) { if (est && k !== 'webinars') sairEstudio(); aba = k; document.querySelectorAll('#atvAbas button').forEach(b => b.classList.toggle('on', b.dataset.a === k)); render(); }
  function render() { if (!D) return; ({ tv: rTv, youtube: rYoutube, webinars: rWebinars, destinos: rDestinos })[aba](); }

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
      <td style="padding:6px 4px;"><span style="font-size:9.5px;padding:2px 6px;border-radius:8px;border:1px solid ${f[1]};color:${f[1]};white-space:nowrap;">${f[0]}</span></td>
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
          <label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" ${I.vinheta !== false ? 'checked' : ''} onchange="ATV.inter('vinheta',this.checked)"> Vinheta antes de cada vídeo</label>${num('vinheta_s', 'Vinheta (s)', 120)}
          ${num('mercado_cada', 'Cotações a cada N vídeos', 20)}${num('mercado_s', 'Cotações (s)', 120)}${num('noticias_cada', 'Notícias a cada N', 20)}${num('noticias_s', 'Notícias (s)', 120)}${num('produto_cada', 'Produto a cada N', 20)}${num('produto_s', 'Produto (s)', 120)}</div>
          <div style="font-size:10.5px;color:var(--t3);margin-top:6px;">A vinheta mostra "Atlantyx TV", o slogan e "A seguir" com a chamada do próximo vídeo, com trilha sonora e locução do navegador. 0 desliga a intercalação.</div>`)
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
    const t = prompt('Título do vídeo na tela:', '') || 'Vídeo Atlantyx'; lerCampos(); cfg.playlist.push(novoIt({ fonte: 'youtube', youtube_id: m[1], titulo: t })); render(); nota('Adicionado — clique em Salvar e pôr no ar'); }
  function addUrl() { const u = prompt('Link direto do vídeo (mp4/webm, público):'); if (!u) return; if (!/^https?:\/\//.test(u)) return nota('Link inválido', 'error');
    const t = prompt('Título do vídeo na tela:', '') || 'Vídeo Atlantyx'; lerCampos(); cfg.playlist.push(novoIt({ fonte: 'url', url: u, titulo: t })); render(); }
  function addReacao() { const id = $('atvReac')?.value; const r = (D.reacoes || []).find(x => x.peca_id === id); if (!r) return nota('Escolha a reação', 'error'); lerCampos();
    cfg.playlist.push(novoIt({ fonte: 'reacao', peca_id: r.peca_id, envio_id: r.envio_id || null, url: r.envio_id ? null : r.reel_url, titulo: r.titulo, categoria: 'Reação' })); render(); nota('Reação adicionada' + (r.envio_id ? ' (vídeo completo)' : ' (Reel)') + ' — clique em Salvar'); }
  const b64 = blob => new Promise((ok, err) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => err(new Error('não consegui ler o arquivo')); fr.readAsDataURL(blob); });
  async function enviar(inp) {
    const f = inp.files?.[0]; inp.value = ''; if (!f) return; const t = prompt('Título do vídeo na tela:', f.name.replace(/\.[^.]+$/, '')) || f.name; const st = $('atvUp');
    try { const PM = 3400000, n = Math.ceil(f.size / PM); const r = await api('midia_iniciar', { nome: f.name, titulo: t, content_type: f.type || 'video/mp4', tamanho: f.size, partes: n });
      for (let i = 0; i < n; i++) { st.textContent = `⏳ Enviando ${f.name}: parte ${i + 1} de ${n} (${mb(Math.min(f.size, (i + 1) * PM))} de ${mb(f.size)})…`;
        const dado = await b64(f.slice(i * PM, (i + 1) * PM)); let ok = false, er = null; for (let k = 0; k < 3 && !ok; k++) { try { await api('midia_parte', { id: r.id, i, b64: dado }); ok = true; } catch (e) { er = e; await new Promise(x => setTimeout(x, 1500)); } } if (!ok) throw er; }
      await api('midia_concluir', { id: r.id }); lerCampos(); cfg.playlist.push(novoIt({ fonte: 'upload', midia_id: r.id, titulo: t })); st.textContent = '✅ ' + f.name + ' enviado (' + mb(f.size) + '). Salvando a playlist…'; await salvar();
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
    wCriar, wExcluir, wReabrir, estudio, eEntrar, eToggle, eSair, sairEstudio, eFaixa, eTransmitir, eParar, dSalvar, dLimpar, _estado: () => ({ D, cfg, aba, est }) };
})();
