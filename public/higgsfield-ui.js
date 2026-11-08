// public/higgsfield-ui.js — v3.413 · Estúdio Higgsfield (vídeo e imagem por IA) — tela do Marketing
(() => {
  const E = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = id => document.getElementById(id);
  let S = { st: null, jobs: [], poll: null };
  async function api(action, body = {}) { const r = await fetch('/api/higgsfield', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) }); const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status })); if (!d.success) throw new Error(d.error || 'falha'); return d; }
  const nota = (m, t) => { try { toast(m, t || 'info'); } catch (_) { alert(m); } };
  const FORMATOS = { '16:9': '16:9 · YouTube / TV / LinkedIn', '9:16': '9:16 · Reels / Stories', '1:1': '1:1 · Feed', '4:5': '4:5 · Feed vertical' };
  const USO_FMT = { webinar: '16:9', retargeting: '1:1', vinheta: '16:9', produto: '16:9', corte: '9:16', post: '1:1' };

  async function abrir() {
    const el = $('hfApp'); if (!el) return;
    try { S.st = await api('status'); S.jobs = (await api('listar')).jobs || []; } catch (e) { el.innerHTML = '<div style="color:var(--red);padding:20px;">' + E(e.message) + '</div>'; return; }
    render(); vigiar();
  }
  function render() {
    const el = $('hfApp'), st = S.st, c = st.cfg || {};
    el.innerHTML = `<div style="background:linear-gradient(135deg,rgba(0,196,204,.12),rgba(0,112,138,.05));border:1px solid rgba(0,196,204,.3);border-radius:10px;padding:14px 18px;margin-bottom:12px;">
        <div style="font-family:var(--H);font-size:15px;font-weight:700;">🎬 Estúdio Higgsfield — vídeo e imagem por IA</div>
        <div style="font-size:11px;color:var(--t2);line-height:1.6;margin-top:3px;">Gere a divulgação dos webinars, criativos de retargeting, vinhetas da Atlantyx TV e vídeos do produto. A IA escreve o prompt com a identidade Atlantyx; nada de pessoas reais, clientes ou depoimentos. Os arquivos da Higgsfield expiram em ~7 dias — use <b>Guardar</b> no que for aprovado.</div>
        ${st.configurado ? '<div style="font-size:10.5px;color:var(--green);margin-top:6px;">● Conectado à Higgsfield</div>' : '<div style="font-size:11px;color:var(--gold);margin-top:6px;line-height:1.6;">⚠ Não conectado: em <b>console.higgsfield.ai</b> crie uma chave de API e cadastre <code>HF_API_KEY_ID</code> e <code>HF_API_KEY_SECRET</code> na Vercel (Settings → Environment Variables) e faça um novo deploy.</div>'}
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:12px;" class="hf-grid">
        <div class="panel"><div class="ph"><div class="pt">Nova geração</div></div><div class="pb" style="display:grid;gap:8px;font-size:11px;">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
            <div><label style="color:var(--t3);">Uso</label><select class="fsel" id="hfUso" onchange="HF.usoMudou()">${Object.entries(st.usos || {}).map(([k, v]) => `<option value="${k}">${E(v)}</option>`).join('')}</select></div>
            <div><label style="color:var(--t3);">Tipo</label><select class="fsel" id="hfTipo"><option value="video">Vídeo</option><option value="imagem">Imagem</option></select></div>
            <div><label style="color:var(--t3);">Formato</label><select class="fsel" id="hfFmt">${Object.entries(FORMATOS).map(([k, v]) => `<option value="${k}">${E(v)}</option>`).join('')}</select></div>
          </div>
          <div><label style="color:var(--t3);">Briefing (o que precisa comunicar)</label><textarea class="fta" id="hfBrief" rows="2" placeholder="Ex.: webinar de 26/11 'Onde a IA corta custo em 90 dias' — tom executivo, sala de diretoria, painéis de dados"></textarea></div>
          <div style="display:flex;gap:6px;"><button class="btn btn-g" style="font-size:10.5px;" id="hfBtnPr" onclick="HF.sugerir()">✨ Escrever prompt com IA</button><span id="hfLeg" style="font-size:10.5px;color:var(--t2);align-self:center;"></span></div>
          <div><label style="color:var(--t3);">Prompt (inglês funciona melhor)</label><textarea class="fta" id="hfPrompt" rows="4" placeholder="Prompt da geração"></textarea></div>
          <div><label style="color:var(--t3);">Imagem de referência (opcional, link https — para animar uma imagem)</label><input class="fi" id="hfImg" placeholder="https://…"/></div>
          <div style="display:flex;gap:8px;align-items:center;"><button class="btn btn-gn" id="hfBtnGerar" onclick="HF.gerar()" ${st.configurado ? '' : 'disabled'}>🎬 Gerar</button><span style="font-size:10px;color:var(--t3);">Consome créditos da sua conta Higgsfield.</span></div>
        </div></div>
        <div class="panel"><div class="ph"><div class="pt">Configurar modelos</div></div><div class="pb" style="display:grid;gap:8px;font-size:11px;">
          <div><label style="color:var(--t3);">Modelo de imagem (caminho na API)</label><input class="fi" id="hfMi" value="${E(c.modelo_imagem)}"/></div>
          <div><label style="color:var(--t3);">Modelo de vídeo (copie da página do modelo na Higgsfield — Kling, Seedance, DoP, Wan…)</label><input class="fi" id="hfMv" value="${E(c.modelo_video)}" placeholder="ex.: caminho/do/modelo/de-video"/></div>
          <div><label style="color:var(--t3);">Campos extras do vídeo (JSON — ex.: duração)</label><input class="fi" id="hfEx" value="${E(JSON.stringify(c.extras_video || {}))}"/></div>
          <button class="btn btn-g" style="font-size:10.5px;justify-self:start;" onclick="HF.salvarCfg()">Salvar configuração</button>
          <div style="font-size:10px;color:var(--t3);line-height:1.6;">Cada modelo da Higgsfield é um endereço; a página do modelo mostra o caminho e os campos que ele aceita (duração, resolução, imagem inicial). Trocar de modelo é só trocar o caminho aqui.</div>
        </div></div>
      </div>
      <div class="panel" style="margin-top:12px;"><div class="ph"><div class="pt">Galeria</div><button class="btn btn-g" style="margin-left:auto;font-size:10px;" onclick="HF.abrir()">↻ Atualizar</button></div><div class="pb" id="hfGal">${galeria()}</div></div>
      <style>@media(max-width:900px){.hf-grid{grid-template-columns:1fr!important;}}</style>`;
    usoMudou();
  }
  function galeria() {
    if (!S.jobs.length) return '<div style="color:var(--t3);font-size:11px;padding:16px;text-align:center;">Nenhuma geração ainda.</div>';
    const cor = { completed: 'var(--green)', failed: 'var(--red)', nsfw: 'var(--red)', canceled: 'var(--t3)' };
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;">' + S.jobs.map(j => {
      const u = j.guardado_url || j.urls?.[0]; const vid = j.tipo === 'video' || /\.mp4|\.webm|\.mov/i.test(u || '');
      const prev = u ? (vid ? `<video src="${E(u)}" controls muted playsinline style="width:100%;border-radius:8px;background:#000;max-height:180px;"></video>` : `<img src="${E(u)}" style="width:100%;border-radius:8px;max-height:180px;object-fit:cover;">`)
        : `<div style="height:120px;border-radius:8px;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--t3);">${['failed', 'nsfw', 'canceled'].includes(j.status) ? 'sem resultado' : '⏳ gerando…'}</div>`;
      return `<div style="border:1px solid var(--bd);border-radius:10px;padding:8px;background:var(--bg2);">${prev}
        <div style="font-size:11px;font-weight:700;margin-top:6px;">${E(j.titulo)}</div>
        <div style="font-size:9.5px;color:${cor[j.status] || 'var(--gold)'};">${E(j.status)}${j.formato ? ' · ' + E(j.formato) : ''} · ${E(j.tipo)}${j.guardado_url ? ' · guardado' : j.expira_em ? ' · expira ' + new Date(j.expira_em).toLocaleDateString('pt-BR') : ''}</div>
        ${j.erro ? `<div style="font-size:9.5px;color:var(--red);">${E(j.erro)}</div>` : ''}
        <div style="font-size:9.5px;color:var(--t3);margin-top:3px;max-height:38px;overflow:hidden;" title="${E(j.prompt)}">${E(j.prompt)}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
          ${u ? `<button class="btn btn-g" style="font-size:9.5px;padding:2px 7px;" onclick="HF.copiar('${E(j.id)}')">Copiar link</button><a class="btn btn-g" style="font-size:9.5px;padding:2px 7px;" href="${E(u)}" target="_blank" download>Baixar</a>` : `<button class="btn btn-g" style="font-size:9.5px;padding:2px 7px;" onclick="HF.consultar('${E(j.id)}')">Consultar</button>`}
          ${u && !j.guardado_url ? `<button class="btn btn-gn" style="font-size:9.5px;padding:2px 7px;" onclick="HF.guardar('${E(j.id)}')" title="Re-hospeda no Atlantyx para não expirar">Guardar</button>` : ''}
          ${u ? `<button class="btn btn-g" style="font-size:9.5px;padding:2px 7px;" onclick="HF.usar('${E(j.id)}')">Usar em…</button>` : ''}
          <button class="btn btn-g" style="font-size:9.5px;padding:2px 7px;margin-left:auto;" onclick="HF.excluir('${E(j.id)}')">✕</button></div></div>`; }).join('') + '</div>';
  }
  function usoMudou() { const u = $('hfUso')?.value, f = $('hfFmt'), t = $('hfTipo'); if (f && USO_FMT[u]) f.value = USO_FMT[u]; if (t) t.value = u === 'post' ? 'imagem' : 'video'; }
  async function sugerir() {
    const b = $('hfBtnPr'); b.disabled = true; b.textContent = 'Escrevendo…';
    try { const d = await api('prompt_sugerir', { uso: $('hfUso').value, briefing: $('hfBrief').value, tipo: $('hfTipo').value, formato: $('hfFmt').value }); $('hfPrompt').value = d.prompt || ''; $('hfLeg').textContent = d.legenda_sugerida ? 'Legenda: ' + d.legenda_sugerida : ''; }
    catch (e) { nota(e.message, 'error'); }
    b.disabled = false; b.textContent = '✨ Escrever prompt com IA';
  }
  async function gerar() {
    const b = $('hfBtnGerar'); b.disabled = true; b.textContent = 'Enviando…';
    try { const usoSel = $('hfUso'); const d = await api('gerar', { tipo: $('hfTipo').value, prompt: $('hfPrompt').value, formato: $('hfFmt').value, uso: usoSel.value, titulo: usoSel.options[usoSel.selectedIndex].text + ($('hfBrief').value ? ' — ' + $('hfBrief').value.substring(0, 50) : ''), image_url: $('hfImg').value.trim() || undefined });
      S.jobs.unshift(d.job); $('hfGal').innerHTML = galeria(); nota('Enviado à Higgsfield — o resultado aparece na galeria', 'success'); vigiar(); }
    catch (e) { nota(e.message, 'error'); }
    b.disabled = false; b.textContent = '🎬 Gerar';
  }
  async function consultar(id, silencioso) { try { const d = await api('consultar', { id }); const i = S.jobs.findIndex(x => x.id === id); if (i >= 0) S.jobs[i] = d.job; if ($('hfGal')) $('hfGal').innerHTML = galeria(); } catch (e) { if (!silencioso) nota(e.message, 'error'); } }
  function vigiar() { clearInterval(S.poll); S.poll = setInterval(async () => { if (!$('hfGal') || !document.getElementById('page-s2higgsfield')?.classList.contains('active')) { clearInterval(S.poll); return; }
    const pend = S.jobs.filter(j => ['queued', 'in_progress'].includes(j.status)).slice(0, 4); if (!pend.length) { clearInterval(S.poll); return; } for (const j of pend) await consultar(j.id, true); }, 8000); }
  async function salvarCfg() { let ex; try { ex = JSON.parse($('hfEx').value || '{}'); } catch (_) { return nota('Campos extras: JSON inválido', 'error'); }
    try { const d = await api('cfg_salvar', { modelo_imagem: $('hfMi').value.trim(), modelo_video: $('hfMv').value.trim(), extras_video: ex }); S.st.cfg = d.cfg; nota('Configuração salva', 'success'); } catch (e) { nota(e.message, 'error'); } }
  const urlDe = id => { const j = S.jobs.find(x => x.id === id); return j && (j.guardado_url || j.urls?.[0]); };
  function copiar(id) { const u = urlDe(id); if (!u) return; try { navigator.clipboard.writeText(u); nota('Link copiado', 'success'); } catch (_) { prompt('Copie o link:', u); } }
  async function guardar(id) { const u = urlDe(id); if (!u) return; nota('Guardando no Atlantyx…');
    try { const r = await fetch('/api/media-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rehost', url: u, pasta: 'higgsfield' }) }); const d = await r.json(); if (!d.success) throw new Error(d.error || 'falha');
      await api('marcar', { id, guardado_url: d.url }); const j = S.jobs.find(x => x.id === id); if (j) j.guardado_url = d.url; $('hfGal').innerHTML = galeria(); nota('Guardado — não expira mais', 'success'); }
    catch (e) { nota('Não guardou: ' + e.message + ' — use "Baixar" e suba no Studio Criativo', 'error'); } }
  function usar(id) { const u = urlDe(id); if (!u) return; try { navigator.clipboard.writeText(u); } catch (_) {}
    alert('Link copiado. Onde usar:\n\n• Atlantyx TV & Webinars → Playlist → adicionar por URL (vinheta, corte, vídeo do produto)\n• Autocampanha / Campanha Digital → mídia do post ou do anúncio (cole o link)\n• LinkedIn do fundador (Metricool) → mídia do post de divulgação do webinar\n• Proposta → anexo/apresentação do produto'); }
  async function excluir(id) { if (!confirm('Tirar esta geração da galeria?')) return; try { await api('marcar', { id, excluir: true }); S.jobs = S.jobs.filter(x => x.id !== id); $('hfGal').innerHTML = galeria(); } catch (e) { nota(e.message, 'error'); } }
  window.HF = { abrir, sugerir, gerar, consultar, salvarCfg, copiar, guardar, usar, excluir, usoMudou };
})();
