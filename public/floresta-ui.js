// v3.440 — VENDAS → 🌳 FLORESTA DE VENDAS · trilha T3
// Todos os contatos (com e sem negócio) e todos os negócios do HubSpot numa jornada só, do contato frio ao cliente.
// Tempo limite por etapa; estourou → a IA decide AVANÇAR / CONGELAR / DESISTIR e propõe a ação; o fundador aprova.
// Arrastar o card entre colunas também move no HubSpot (decisão do próprio fundador). Nada é enviado sozinho.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const dt = s => s ? new Date(s).toLocaleDateString('pt-BR') : '—';
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  async function api(action, payload = {}) {
    const r = await fetch('/api/vendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'Demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (d.success === false || !r.ok) throw new Error(d.error || 'falha'); return d;
  }
  let D = null, vista = 'kanban', filtro = { q: '', tipo: '', atrasados: false, decisores: false, dono: '', abordagem: '' }, painel = 'fila', arrastando = null, carregando = false;
  const SEL = new Set();   // v3.441: cards marcados para a IARA
  const FLUXO = ['frio', 'iara', 'ligacao', 'abordado', 'engajado', 'qualificado', 'reuniao', 'proposta', 'negociacao', 'cliente', 'remarketing', 'congelado', 'perdido'];
  const corTemp = t => t >= 70 ? '#ff5d5d' : t >= 45 ? '#ffaa3c' : t >= 25 ? '#ffd166' : '#5aa9ff';
  const corSla = c => c.sla == null ? 'var(--t3)' : c.atrasado ? 'var(--red)' : c.dias >= c.sla * 0.75 ? 'var(--gold)' : 'var(--green)';

  async function abrir() { if (!D) await carregar(false); else render(); }
  async function carregar(forcar) {
    if (carregando) return; carregando = true; const box = $('flApp'); if (box && !D) box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--t3);font-size:12px;">🌳 Plantando a floresta… lendo contatos e negócios do HubSpot</div>';
    try { D = await api('floresta', { forcar: !!forcar }); render(); } catch (e) { if (box) box.innerHTML = '<div style="color:var(--red);padding:20px;">Erro: ' + esc(e.message) + '</div>'; }
    finally { carregando = false; }
  }
  function filtrados() {
    const q = filtro.q.toLowerCase().trim();
    return (D?.cards || []).filter(c => (!filtro.tipo || c.tipo === filtro.tipo) && (!filtro.atrasados || c.atrasado) && (!filtro.decisores || c.decisor) && (!filtro.dono || c.dono === filtro.dono) && (!filtro.abordagem || (filtro.abordagem === '__sem' ? !c.abordagem : String(c.abordagem || '').split(', ').includes(filtro.abordagem)))
      && (!q || [c.nome, c.empresa, c.cargo, c.contato, c.email, c.etapa_hs].join(' ').toLowerCase().includes(q)));
  }
  function render() {
    const box = $('flApp'); if (!box || !D) return; const S = D.stats || {}, L = filtrados(), fila = D.fila || [];
    const donos = [...new Set((D.cards || []).map(c => c.dono).filter(Boolean))].sort();
    const kpi = (r, v, s, cor) => `<div class="fl-kpi"><div class="fl-kl">${r}</div><div class="fl-kv" style="color:${cor || 'var(--t1)'};">${v}</div>${s ? `<div class="fl-ks">${s}</div>` : ''}</div>`;
    const prev = S.previsao_vendas ?? 0, meta = D.meta_vendas_mes || 4;
    box.innerHTML = `<style>
      .fl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px}
      .fl-kpi{background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:9px 12px}.fl-kl{font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em}.fl-kv{font-family:var(--H);font-size:20px;font-weight:800}.fl-ks{font-size:9.5px;color:var(--t3)}
      .fl-funil{display:flex;gap:4px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px}.fl-fe{flex:1;min-width:92px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:6px 8px;position:relative}
      .fl-fe b{font-family:var(--H);font-size:15px}.fl-fe .cv{position:absolute;right:6px;top:5px;font-size:9px;color:var(--t3)}
      .fl-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
      .fl-wrap{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px;align-items:start}.fl-wrap>div{min-width:0}@media(max-width:1100px){.fl-wrap{grid-template-columns:1fr}}
      .fl-kb{display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;min-height:60vh}
      .fl-col{flex:0 0 196px;width:196px;max-width:196px;min-width:0;background:var(--bg2);border:1px solid var(--bd);border-radius:12px;display:flex;flex-direction:column;max-height:76vh}
      .fl-col.drop{outline:2px dashed var(--pu);outline-offset:-3px}
      .fl-ch{padding:8px 10px;border-bottom:1px solid var(--bd)}.fl-cn{font-size:11.5px;font-weight:700}.fl-cs{font-size:9.5px;color:var(--t3)}
      .fl-cb{padding:6px;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:6px}
      .fl-card{background:var(--bg);border:1px solid var(--bd);border-radius:10px;padding:7px 9px;cursor:grab;position:relative;transition:transform .12s,box-shadow .12s}
      .fl-card:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.25)}
      .fl-card,.fl-card *{min-width:0}.fl-card .tp{position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:3px}
      .fl-ring{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:8.5px;font-weight:700;flex:0 0 30px}
      .fl-ring span{width:23px;height:23px;border-radius:50%;background:var(--bg);display:grid;place-items:center}
      .fl-chip{font-size:8.5px;padding:1px 6px;border-radius:9px;background:var(--bg3);color:var(--t2);white-space:nowrap}
      .fl-side{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;max-height:82vh;overflow-y:auto;position:sticky;top:8px}
      .fl-dec{border:1px solid var(--bd);border-radius:10px;padding:8px 10px;margin:8px;background:var(--bg)}
      .fl-forest{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
      .fl-clareira{background:radial-gradient(ellipse at bottom,rgba(34,211,163,.08),transparent 70%),var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:8px;min-height:180px}
      .fl-mk{display:inline-flex;align-items:center;justify-content:center;width:20px;height:18px;margin:-2px 3px -2px -3px;cursor:pointer;vertical-align:middle;border-radius:4px}.fl-mk:hover{background:rgba(156,109,255,.18)}.fl-mk input{margin:0;width:14px;height:14px;cursor:pointer}
      .fl-card.fl-sel{outline:2px solid var(--pu);outline-offset:-1px}
      .fl-arv.fl-sel{outline:2px solid var(--pu);outline-offset:1px}
      .fl-arv{display:inline-block;margin:2px;border-radius:50%;cursor:pointer;transition:transform .1s}.fl-arv:hover{transform:scale(1.25)}
    </style>
    <div class="fl-kpis">
      ${kpi('Contatos sem negócio', S.contatos_sem_negocio ?? 0)}${kpi('Negócios abertos', S.negocios ?? 0, 'pipeline ' + brl(S.pipeline_valor))}
      ${kpi('Estouraram o tempo', S.atrasados ?? 0, 'na etapa além do limite', (S.atrasados ? 'var(--red)' : 'var(--green)'))}
      ${kpi('Previsão de vendas', prev, 'meta ' + meta + '/mês · ' + (prev >= meta ? 'no ritmo' : 'faltam ' + Math.ceil(meta - prev)), prev >= meta ? 'var(--green)' : 'var(--gold)')}
      ${kpi('Decisões para aprovar', fila.length, 'propostas pela IA', fila.length ? 'var(--pu)' : 'var(--t3)')}
      ${kpi('Gargalo', S.gargalo ? (D.etapas.find(e => e.id === S.gargalo)?.nome || S.gargalo) : '—', 'menor conversão', 'var(--gold)')}
    </div>
    <div class="fl-funil">${FLUXO.slice(0, 10).map(id => { const e = D.etapas.find(x => x.id === id), p = S.por?.[id] || {}, cv = S.conversao?.[id];
      return `<div class="fl-fe" title="${esc(e.dica)}">${cv != null ? `<span class="cv">${cv}%↓</span>` : ''}<div style="font-size:9.5px;color:var(--t3);">${e.icone} ${esc(e.nome)}</div><b>${p.n || 0}</b>${p.atrasados ? ` <span style="font-size:9.5px;color:var(--red);">⏱${p.atrasados}</span>` : ''}${p.mediana_dias != null ? `<div style="font-size:9px;color:var(--t3);">~${p.mediana_dias}d · limite ${e.sla ?? '—'}d</div>` : ''}</div>`; }).join('')}</div>
    <div class="fl-bar">
      <div class="seg" style="margin:0;"><button class="${vista === 'kanban' ? 'on' : ''}" onclick="FLORESTA.vista('kanban')">▦ Kanban</button><button class="${vista === 'floresta' ? 'on' : ''}" onclick="FLORESTA.vista('floresta')">🌳 Floresta</button><button class="${vista === 'lista' ? 'on' : ''}" onclick="FLORESTA.vista('lista')">☰ Lista</button></div>
      <input class="fi" style="width:200px;display:inline-block;" placeholder="Buscar nome, empresa, cargo…" value="${esc(filtro.q)}" oninput="FLORESTA.f('q',this.value)"/>
      <select class="fsel" style="width:auto;display:inline-block;" onchange="FLORESTA.f('tipo',this.value)"><option value="">Contatos + negócios</option><option value="contato" ${filtro.tipo === 'contato' ? 'selected' : ''}>Só contatos sem negócio</option><option value="negocio" ${filtro.tipo === 'negocio' ? 'selected' : ''}>Só negócios</option></select>
      ${(() => { const tags = [...new Set((D.cards || []).flatMap(c => String(c.abordagem || '').split(', ').filter(Boolean)))].sort(); return tags.length || D.props_ia?.abordagem ? `<select class="fsel" style="width:auto;display:inline-block;" onchange="FLORESTA.f('abordagem',this.value)"><option value="">Toda abordagem</option><option value="__sem" ${filtro.abordagem === '__sem' ? 'selected' : ''}>Sem tag de abordagem</option>${tags.map(t => `<option ${filtro.abordagem === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''; })()}
      <select class="fsel" style="width:auto;display:inline-block;" onchange="FLORESTA.f('dono',this.value)"><option value="">Todos os donos</option>${donos.map(d => `<option ${filtro.dono === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <label style="font-size:11px;display:flex;gap:4px;align-items:center;"><input type="checkbox" ${filtro.atrasados ? 'checked' : ''} onchange="FLORESTA.f('atrasados',this.checked)"/> só estourados</label>
      <label style="font-size:11px;display:flex;gap:4px;align-items:center;"><input type="checkbox" ${filtro.decisores ? 'checked' : ''} onchange="FLORESTA.f('decisores',this.checked)"/> só decisores</label>
      <span style="flex:1;"></span>
      <button class="btn" style="font-size:10.5px;color:#22d3a3;border-color:#22d3a3;" onclick="FLORESTA.apollo()">🧲 Gerar leads frios (Apollo)</button>
      <button class="btn" style="font-size:10.5px;" title="Lê agora as conversas novas da IARA no HubSpot: avisa o Ademir por e-mail, move os cards e atualiza telefone/e-mail. Roda sozinho a cada hora." onclick="FLORESTA.iaraRetornos()">🤖 Retornos da IARA</button>
      <button class="btn btn-p" id="flIaBtn" style="font-size:10.5px;" onclick="FLORESTA.ia()">🤖 IA: decidir os estourados</button>
      <button class="btn" style="font-size:10.5px;" onclick="FLORESTA.sla()">⏱ Tempos limite</button>
      <button class="btn" style="font-size:10.5px;" onclick="FLORESTA.carregar(true)">↻ Atualizar</button>
    </div>
    <div id="flSelBar">${selBar()}</div>
    ${(D.avisos || []).map(a => `<div style="font-size:10.5px;color:var(--gold);margin-bottom:6px;">⚠ ${esc(a)}</div>`).join('')}
    <div class="fl-wrap"><div>${vista === 'kanban' ? kanban(L) : vista === 'floresta' ? forest(L) : lista(L)}</div>${lado()}</div>
    <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">Atualizado ${new Date(D.gerado_em).toLocaleString('pt-BR')} · arraste um card para outra coluna para movê-lo no HubSpot · 🧊 congelar = esperar até uma data e voltar à etapa · a IA nunca envia mensagens: você aprova e envia.</div>`;
  }
  function selBar() { // v3.446: barra das ações em lote
    const frios = filtrados().filter(c => c.etapa === 'frio'), naoMarc = frios.filter(c => !SEL.has(c.id)).length;
    const atalho = frios.length && naoMarc ? `<button class="btn" style="font-size:10.5px;" onclick="FLORESTA.marcarCol('frio',true)">☑ Marcar os ${frios.length} frios${filtro.q || filtro.tipo || filtro.dono || filtro.abordagem || filtro.decisores || filtro.atrasados ? ' do filtro' : ''}</button>` : '';
    if (!SEL.size) return atalho ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;font-size:11px;color:var(--t3);">Marque cards (☐ no card, na coluna ou na lista) para colocar no fluxo da IARA, remarketing ou excluir ${atalho}</div>` : '';
    return SEL.size ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:rgba(156,109,255,.1);border:1px solid rgba(156,109,255,.35);border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:11.5px;"><b>${SEL.size} marcado(s)</b>${atalho}<span style="flex:1;"></span><button class="btn btn-p" style="font-size:10.5px;" onclick="FLORESTA.iara()">🤖 Colocar no fluxo da IARA</button><button class="btn" style="font-size:10.5px;color:#0ea5a4;border-color:#0ea5a4;" onclick="FLORESTA.ligar()">📞 Mandar para ligação</button>${[...SEL].some(id => D.cards.find(c => c.id === id)?.no_fluxo_ia) ? `<button class="btn" style="font-size:10.5px;" onclick="FLORESTA.tirarIara()">Tirar da IARA</button>` : ''}<button class="btn" style="font-size:10.5px;color:#ffaa3c;border-color:#ffaa3c;" onclick="FLORESTA.lote('remarketing')">📣 Remarketing</button>${[...SEL].some(id => D.cards.find(c => c.id === id)?.etapa === 'remarketing') ? `<button class="btn" style="font-size:10.5px;" onclick="FLORESTA.lote('tirar_remarketing')">↩ Tirar do remarketing</button>` : ''}<button class="btn" style="font-size:10.5px;color:var(--red);border-color:var(--red);" onclick="FLORESTA.lote('excluir')">🗑 Excluir</button><button class="btn btn-g" style="font-size:10.5px;" onclick="FLORESTA.limpar()">Limpar</button></div>` : '';
  }
  function _redesenhar() { // redesenha sem perder a rolagem das colunas
    const pos = [...document.querySelectorAll('.fl-cb')].map(x => x.scrollTop), wy = window.scrollY, kb = document.querySelector('.fl-kb')?.scrollLeft;
    render(); document.querySelectorAll('.fl-cb').forEach((x, i) => { x.scrollTop = pos[i] || 0; }); const k = document.querySelector('.fl-kb'); if (k && kb != null) k.scrollLeft = kb; window.scrollTo(0, wy);
  }
  function marcar(id, on) { on ? SEL.add(id) : SEL.delete(id);
    const b = document.getElementById('flSelBar'); if (b) b.innerHTML = selBar();
    document.querySelectorAll('.fl-card,.fl-arv').forEach(el => { const m = (el.getAttribute('onclick') || '').match(/ver\('([^']+)'\)/); if (m && m[1] === id) el.classList.toggle('fl-sel', on); });
    document.querySelectorAll('.fl-mk input').forEach(inp => { const m = (inp.getAttribute('onchange') || '').match(/marcar\('([^']+)'/); if (m && m[1] === id) inp.checked = on; }); }
  function cardHtml(c) {
    const pct = c.sla ? Math.min(100, Math.round((c.dias || 0) / c.sla * 100)) : 0, cs = corSla(c);
    return `<div class="fl-card${SEL.has(c.id) ? ' fl-sel' : ''}" draggable="true" ondragstart="FLORESTA.drag('${esc(c.id)}')" onclick="FLORESTA.ver('${esc(c.id)}')" title="${esc(c.etapa_hs || '')}">
      <div class="tp" style="background:${corTemp(c.temperatura)};"></div>
      <div style="display:flex;gap:7px;align-items:flex-start;padding-left:4px;"><div style="flex:1;min-width:0;">
        <div style="font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><label class="fl-mk" draggable="false" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" ondragstart="event.preventDefault();event.stopPropagation()" title="Marcar (IARA, remarketing, excluir)"><input type="checkbox" ${SEL.has(c.id) ? 'checked' : ''} onchange="FLORESTA.marcar('${esc(c.id)}',this.checked)"/></label>${c.tipo === 'negocio' ? '💼 ' : ''}${esc(c.nome)}</div>
        <div style="font-size:9.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc([c.tipo === 'negocio' ? c.contato : c.cargo, c.empresa].filter(Boolean).join(' · ') || '—')}</div></div>
        ${c.sla ? `<div class="fl-ring" style="background:conic-gradient(${cs} ${pct}%,var(--bd) 0);" title="${c.dias} de ${c.sla} dias na etapa"><span style="color:${cs};">${c.dias}d</span></div>` : c.dias != null ? `<span class="fl-chip">${c.dias}d</span>` : ''}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;padding-left:4px;">${c.telefone ? `<span class="fl-chip" style="color:#16a34a;" title="${c.tel_tipo === 'fixo' ? 'Telefone fixo' : 'Celular (WhatsApp)'} no HubSpot: ${esc(c.telefone)}">${c.tel_tipo === 'fixo' ? '☎ fixo' : '📱 celular'}</span>` : ''}${c.morno ? `<span class="fl-chip" style="color:#e07a00;" title="${esc(c.morno)}">🌡 morno</span>` : ''}${c.ligacao && c.etapa === 'ligacao' ? `<span class="fl-chip" style="color:#0ea5a4;" title="${esc(c.ligacao.quem)}">📞 ${c.ligacao.caminho} · ${c.ligacao.tentativas}/${c.ligacao.max}</span>` : ''}${c.atendido_ia ? '<span class="fl-chip" style="color:#25d366;" title="A IARA já mandou WhatsApp">💬 IARA falou</span>' : c.no_fluxo_ia ? '<span class="fl-chip" style="color:var(--pu);" title="Fluxo IA = IA no HubSpot">🤖 no fluxo</span>' : ''}${c.resumo_sdr ? '<span class="fl-chip" title="Tem resumo da conversa — clique para ler">📝 conversa</span>' : ''}${c.abordagem ? `<span class="fl-chip" style="color:#ffaa3c;" title="Abordagem">🏷 ${esc(c.abordagem)}</span>` : ''}${c.valor ? `<span class="fl-chip" style="color:var(--green);">${brl(c.valor)}</span>` : ''}${c.decisor ? '<span class="fl-chip" style="color:var(--pu);">decisor</span>' : ''}${c.atrasado ? `<span class="fl-chip" style="color:var(--red);">+${c.estouro}d além</span>` : ''}${c.congelado ? `<span class="fl-chip" style="color:#5aa9ff;">volta ${dt(c.congelado.ate)}</span>` : ''}${(D.fila || []).some(f => f.card_id === c.id) ? '<span class="fl-chip" style="color:var(--pu);">🤖 decisão</span>' : ''}${c.dono ? `<span class="fl-chip">${esc(c.dono.split(' ')[0])}</span>` : ''}</div></div>`;
  }
  function kanban(L) {
    return `<div class="fl-kb">${FLUXO.map(id => { const e = D.etapas.find(x => x.id === id), C = L.filter(c => c.etapa === id).sort((a, b) => (b.atrasado - a.atrasado) || (b.temperatura - a.temperatura)), v = C.reduce((t, c) => t + (c.valor || 0), 0);
      return `<div class="fl-col" ondragover="event.preventDefault();this.classList.add('drop')" ondragleave="this.classList.remove('drop')" ondrop="this.classList.remove('drop');FLORESTA.soltar('${id}')">
        <div class="fl-ch"><div class="fl-cn">${C.length && !['cliente', 'perdido'].includes(id) ? `<label class="fl-mk" title="Marcar todos desta coluna (${C.length})"><input type="checkbox" ${C.every(c => SEL.has(c.id)) ? 'checked' : ''} onchange="FLORESTA.marcarCol('${id}',this.checked)"/></label>` : ''}${e.icone} ${esc(e.nome)} <span style="color:var(--t3);font-weight:500;">${C.length}</span></div><div class="fl-cs">${id === 'remarketing' && C.length ? `<a href="#" onclick="event.preventDefault();FLORESTA.csvRmk()" style="color:#ffaa3c;">⬇ baixar público (CSV)</a> · ` : ''}${e.sla ? 'limite ' + e.sla + ' dias' : esc(e.dica)}${v ? ' · ' + brl(v) : ''}${C.filter(c => c.atrasado).length ? ` · <span style="color:var(--red);">${C.filter(c => c.atrasado).length} estourados</span>` : ''}</div></div>
        <div class="fl-cb">${C.slice(0, 80).map(cardHtml).join('')}${C.length > 80 ? `<div style="font-size:9.5px;color:var(--t3);text-align:center;">+${C.length - 80} (use a busca)</div>` : ''}</div></div>`; }).join('')}</div>`;
  }
  function forest(L) { // cada etapa é uma clareira; cada árvore um lead/negócio (tamanho = temperatura/valor, cor = tempo na etapa)
    return `<div class="fl-forest">${FLUXO.map(id => { const e = D.etapas.find(x => x.id === id), C = L.filter(c => c.etapa === id);
      return `<div class="fl-clareira" ondragover="event.preventDefault()" ondrop="FLORESTA.soltar('${id}')"><div style="font-size:11px;font-weight:700;">${C.length && !['cliente', 'perdido'].includes(id) ? `<label class="fl-mk" title="Marcar todos desta clareira"><input type="checkbox" ${C.every(c => SEL.has(c.id)) ? 'checked' : ''} onchange="FLORESTA.marcarCol('${id}',this.checked)"/></label>` : ''}${e.icone} ${esc(e.nome)} <span style="color:var(--t3);">${C.length}</span></div><div style="margin-top:6px;line-height:0;">
        ${C.slice(0, 160).map(c => { const s = Math.round(9 + c.temperatura / 9 + (c.valor ? Math.min(10, Math.log10(c.valor) * 1.6) : 0)); return `<span draggable="true" ondragstart="FLORESTA.drag('${esc(c.id)}')" onclick="if(event.ctrlKey||event.metaKey||event.shiftKey){FLORESTA.marcar('${esc(c.id)}',!FLORESTA.sel('${esc(c.id)}'))}else FLORESTA.ver('${esc(c.id)}')" class="fl-arv${SEL.has(c.id) ? ' fl-sel' : ''}" title="${esc(c.nome + (c.empresa ? ' · ' + c.empresa : '') + ' · ' + (c.dias ?? '?') + 'd' + (c.sla ? '/' + c.sla + 'd' : '') + (c.valor ? ' · ' + brl(c.valor) : ''))}" style="width:${s}px;height:${s}px;background:${corSla(c)};opacity:${.45 + c.temperatura / 180};${c.tipo === 'negocio' ? 'border-radius:4px;' : ''}"></span>`; }).join('')}</div></div>`; }).join('')}</div>
      <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">● contato · ■ negócio · Ctrl/Shift + clique marca a árvore · tamanho = temperatura e valor · cor = tempo na etapa (verde dentro do limite, amarelo perto, vermelho estourado)</div>`;
  }
  function lista(L) {
    return `<div style="overflow-x:auto;background:var(--bg2);border:1px solid var(--bd);border-radius:12px;"><table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="color:var(--t3);font-size:9.5px;text-transform:uppercase;text-align:left;"><th style="padding:6px;width:26px;"><label class="fl-mk" title="Marcar todos da lista"><input type="checkbox" ${L.length && L.every(c => SEL.has(c.id)) ? 'checked' : ''} onchange="FLORESTA.marcarTodos(this.checked)"/></label></th><th style="padding:6px;">Nome</th><th>Empresa · cargo</th><th>Etapa</th><th>Dias / limite</th><th>Temp.</th><th style="text-align:right;">Valor</th></tr>
      ${L.sort((a, b) => (b.estouro - a.estouro) || (b.temperatura - a.temperatura)).slice(0, 400).map(c => `<tr style="border-top:1px solid var(--bd);cursor:pointer;" onclick="FLORESTA.ver('${esc(c.id)}')"><td style="padding:5px 6px;"><label class="fl-mk" onclick="event.stopPropagation()"><input type="checkbox" ${SEL.has(c.id) ? 'checked' : ''} onchange="FLORESTA.marcar('${esc(c.id)}',this.checked)"/></label></td><td style="padding:5px 6px;font-weight:600;">${c.no_fluxo_ia ? '<span title="no fluxo da IARA">🤖 </span>' : ''}${c.tipo === 'negocio' ? '💼 ' : ''}${esc(c.nome)}</td><td>${esc([c.empresa, c.cargo].filter(Boolean).join(' · '))}</td><td>${esc(D.etapas.find(e => e.id === c.etapa)?.nome || c.etapa)}</td><td style="color:${corSla(c)};">${c.dias ?? '—'}${c.sla ? ' / ' + c.sla : ''}</td><td><span style="color:${corTemp(c.temperatura)};">●</span> ${c.temperatura}</td><td style="text-align:right;">${c.valor ? brl(c.valor) : ''}</td></tr>`).join('')}</table></div>`;
  }
  function lado() {
    const fila = D.fila || [], I = D.insights;
    const decCor = { avancar: 'var(--green)', congelar: '#5aa9ff', desistir: 'var(--red)' }, decTxt = { avancar: '➜ AVANÇAR', congelar: '🧊 CONGELAR', desistir: '✕ DESISTIR' };
    const etN = id => D.etapas.find(e => e.id === id)?.nome || id;
    const dec = f => `<div class="fl-dec" id="fd_${esc(f.id)}"><div style="display:flex;gap:6px;align-items:center;"><span style="font-size:9.5px;font-weight:800;color:${decCor[f.decisao]};">${decTxt[f.decisao] || f.decisao}</span><span style="font-size:9px;color:var(--t3);">${esc(f.prioridade || '')}${f.confianca ? ' · ' + f.confianca + '%' : ''}</span></div>
      <div style="font-size:11.5px;font-weight:700;margin-top:2px;">${esc(f.nome)}</div><div style="font-size:9.5px;color:var(--t3);">${esc([f.cargo, f.empresa].filter(Boolean).join(' · '))} · ${esc(etN(f.etapa))} há ${f.dias ?? '?'}d (limite ${f.sla ?? '—'})${f.para_etapa ? ' → ' + esc(etN(f.para_etapa)) : ''}</div>
      <div style="font-size:10.5px;margin-top:4px;"><b>${esc(f.titulo)}</b></div><div style="font-size:10px;color:var(--t2);margin-top:2px;">${esc(f.motivo)}</div>
      ${f.decisao === 'congelar' ? `<div style="font-size:10px;margin-top:4px;">Voltar em <input type="date" class="fi" data-k="congelar_ate" value="${esc(f.congelar_ate)}" style="width:auto;display:inline-block;font-size:10px;"/></div>` : ''}
      ${f.mensagem ? `${f.acao === 'email' ? `<input class="fi" data-k="assunto" value="${esc(f.assunto)}" style="margin-top:4px;font-size:10px;" placeholder="Assunto"/>` : ''}<textarea class="fta" data-k="mensagem" rows="4" style="margin-top:4px;font-size:10.5px;">${esc(f.mensagem)}</textarea>` : ''}
      <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;"><button class="btn btn-gn" style="font-size:10px;" onclick="FLORESTA.decidir('${esc(f.id)}','aprovar')">✔ Aprovar</button><button class="btn btn-g" style="font-size:10px;" onclick="FLORESTA.decidir('${esc(f.id)}','rejeitar')">✕ Rejeitar</button>
        ${f.telefone && f.mensagem && f.acao !== 'email' ? `<button class="btn btn-g" style="font-size:10px;color:#25d366;" onclick="FLORESTA.wa('${esc(f.id)}')">WhatsApp</button>` : ''}${f.email && f.mensagem && f.acao === 'email' ? `<button class="btn btn-g" style="font-size:10px;" onclick="FLORESTA.mail('${esc(f.id)}')">E-mail</button>` : ''}</div></div>`;
    const ins = I ? `<div style="padding:10px 12px;font-size:10.5px;line-height:1.55;">${I.alerta ? `<div style="padding:7px 9px;border-radius:8px;background:rgba(255,93,93,.1);border:1px solid rgba(255,93,93,.3);margin-bottom:8px;"><b>⚡ ${esc(I.alerta)}</b></div>` : ''}
      ${I.previsao_mes ? `<div style="margin-bottom:6px;"><b>📈 Previsão:</b> ${esc(I.previsao_mes)}</div>` : ''}${I.gargalo ? `<div style="margin-bottom:6px;"><b>🚧 Gargalo:</b> ${esc(I.gargalo)}</div>` : ''}
      ${(I.insights || []).length ? `<div style="font-weight:700;margin-top:8px;">🔎 Insights</div><ul style="margin:3px 0 0 16px;padding:0;">${I.insights.map(x => `<li style="margin-bottom:3px;">${esc(x)}</li>`).join('')}</ul>` : ''}
      ${(I.ideias || []).length ? `<div style="font-weight:700;margin-top:8px;">💡 Ideias para vender mais</div><ul style="margin:3px 0 0 16px;padding:0;">${I.ideias.map(x => `<li style="margin-bottom:3px;">${esc(x)}</li>`).join('')}</ul>` : ''}
      <div style="font-size:9px;color:var(--t3);margin-top:6px;">análise de ${new Date(I.em).toLocaleString('pt-BR')}</div></div>` : '<div style="padding:16px;font-size:10.5px;color:var(--t3);">Clique em "🤖 IA: decidir os estourados" para a primeira leitura da floresta. Depois a IA roda sozinha nos dias úteis às 8h e deixa as decisões aqui para você aprovar.</div>';
    const hist = (D.decididas || []).slice(0, 15).map(f => `<div style="font-size:10px;padding:5px 12px;border-bottom:1px solid var(--bd);"><span style="color:${f.status === 'aprovada' ? 'var(--green)' : f.status === 'erro' ? 'var(--red)' : 'var(--t3)'};">${esc(f.status)}</span> · <b>${esc(f.nome)}</b> · ${esc(decTxt[f.decisao] || '')}<div style="color:var(--t3);">${esc(f.resultado || '')}</div></div>`).join('');
    return `<div class="fl-side"><div class="seg" style="margin:8px;"><button class="${painel === 'fila' ? 'on' : ''}" onclick="FLORESTA.painel('fila')">🤖 Decisões (${fila.length})</button><button class="${painel === 'ins' ? 'on' : ''}" onclick="FLORESTA.painel('ins')">💡 Insights</button><button class="${painel === 'hist' ? 'on' : ''}" onclick="FLORESTA.painel('hist')">Histórico</button></div>
      ${painel === 'fila' ? (fila.length ? fila.map(dec).join('') : '<div style="padding:16px;font-size:10.5px;color:var(--t3);">Nenhuma decisão pendente. Quando um lead estourar o tempo da etapa, a IA propõe avançar, congelar ou desistir — e aparece aqui.</div>') : painel === 'ins' ? ins : (hist || '<div style="padding:16px;font-size:10.5px;color:var(--t3);">Sem decisões ainda.</div>')}</div>`;
  }
  // ══ v3.463: 📞 Abordagem telefônica — caixa na ficha do card
  const RES = [['reuniao', 'Reunião marcada'], ['interessado', 'Interessado, sem data'], ['agora_nao', 'Agora não (retornar depois)'], ['sem_interesse', 'Sem interesse'], ['nao_atendeu', 'Não atendeu'], ['numero_errado', 'Número errado'], ['nao_ligar', 'Pediu para não ligar']];
  function ligBox(c) {
    if (c.etapa !== 'ligacao' || !c.ligacao) return '';
    const L = c.ligacao, tel = String(c.telefone || '').replace(/[^\d+]/g, ''), rot = Object.fromEntries(RES);
    return `<div style="margin-top:10px;border:1px solid rgba(14,165,164,.45);background:rgba(14,165,164,.07);border-radius:10px;padding:9px 11px;">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><b>📞 Abordagem telefônica</b><span class="fl-chip" title="Caminho do teste A × B">Caminho ${L.caminho} · ${esc(L.quem)}</span><span class="fl-chip">tentativa ${L.tentativas} de ${L.max}</span>${L.auto ? '<span class="fl-chip" title="Entrou sozinho: 3 dias úteis na IARA sem avançar">automático</span>' : ''}</div>
      <div style="margin-top:6px;">Telefone: ${tel ? `<a href="tel:${esc(tel)}" style="color:#0ea5a4;font-weight:700;">${esc(c.telefone)}</a>` : '<span style="color:var(--red);">sem telefone</span>'}${c.link ? ` · <a href="${esc(c.link)}" target="_blank" rel="noopener" style="color:#ff7a59;font-weight:700;">Ligar pelo HubSpot ↗</a>` : ''}</div>
      <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">Roteiro: abertura com o gancho do lead → 3 perguntas (processo hoje, prioridade, quem decide) → 30 min com o Ademir (quarta ou quinta, 10h30–12h).</div>
      ${(L.historico || []).length ? `<div style="font-size:9.5px;color:var(--t3);margin-top:6px;text-transform:uppercase;">Ligações</div>${L.historico.map(t => `<div style="font-size:10px;">${new Date(t.em).toLocaleString('pt-BR').slice(0, 17)} · <b>${esc(rot[t.resultado] || t.resultado)}</b>${t.nota ? ' — ' + esc(t.nota) : ''}</div>`).join('')}` : ''}
      <div style="font-size:9.5px;color:var(--t3);margin-top:8px;text-transform:uppercase;">Registrar resultado da ligação</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px;align-items:center;"><select class="fsel" id="flLigRes" style="width:auto;font-size:10.5px;" onchange="document.getElementById('flLigData').style.display=this.value==='agora_nao'||this.value==='reuniao'?'':'none';document.getElementById('flLigData').type=this.value==='reuniao'?'datetime-local':'date'">${RES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
        <input class="fi" id="flLigData" type="datetime-local" style="width:auto;font-size:10.5px;" title="Data da reunião / data de retorno"/>
        <input class="fi" id="flLigNota" placeholder="O que foi conversado (vai para o HubSpot)" style="flex:1;min-width:180px;font-size:10.5px;"/>
        <button class="btn btn-p" style="font-size:10.5px;" onclick="FLORESTA.ligRes('${esc(c.id)}')">Registrar</button>
        <button class="btn btn-g" style="font-size:10px;" onclick="FLORESTA.desligar('${esc(c.id)}')">Tirar da ligação</button></div></div>`;
  }
  async function ligar(umId) { const ids = umId ? [umId] : [...SEL]; if (!ids.length) return nota('Marque ao menos um card', 'error');
    try { const r = await api('floresta_ligacao', { card_ids: ids, acao: 'entrar' }); const f = (r.resultados || []).filter(x => !x.ok);
      nota(r.ok + ' na abordagem telefônica 📞' + (f.length ? ' · ' + f.length + ' não entraram: ' + f.slice(0, 4).map(x => (x.nome || '') + ' (' + x.motivo + ')').join('; ') : ''), f.length ? 'error' : 'success');
      document.getElementById('flModal')?.remove(); if (!umId) SEL.clear(); await carregar(true); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  async function desligar(id) { if (!confirm('Tirar este lead da abordagem telefônica? Ele volta para a etapa anterior (IARA).')) return;
    try { await api('floresta_ligacao', { card_ids: [id], acao: 'sair' }); document.getElementById('flModal')?.remove(); nota('Fora da ligação'); await carregar(true); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  async function ligRes(id) { const resultado = document.getElementById('flLigRes').value, dtv = document.getElementById('flLigData').value, notaTxt = document.getElementById('flLigNota').value;
    if (resultado === 'nao_ligar' && !confirm('Marcar "não ligar"? O telefone entra no descadastro e o lead vai para Perdido.')) return;
    try { const r = await api('floresta_ligacao_resultado', { card_id: id, resultado, nota: notaTxt, retornar_em: resultado === 'agora_nao' ? String(dtv).slice(0, 10) : null, data_reuniao: resultado === 'reuniao' ? dtv : null });
      document.getElementById('flModal')?.remove(); nota(r.resultado + ' · ' + (r.feito || []).join(' · '), 'success'); await carregar(true); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  function ver(id) {
    const c = (D.cards || []).find(x => x.id === id); if (!c) return; document.getElementById('flModal')?.remove(); const e = D.etapas.find(x => x.id === c.etapa);
    const tel = String(c.telefone || '').replace(/\D/g, ''), wa = tel ? 'https://wa.me/' + (tel.length <= 11 ? '55' + tel : tel) : null;
    const m = document.createElement('div'); m.id = 'flModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'; m.onclick = ev => { if (ev.target === m) m.remove(); };
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;width:min(560px,100%);padding:16px;font-size:11px;">
      <div style="display:flex;gap:8px;align-items:flex-start;"><div style="flex:1;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">${c.tipo === 'negocio' ? '💼 ' : ''}${esc(c.nome)}</div><div style="color:var(--t3);">${esc([c.cargo, c.empresa].filter(Boolean).join(' · '))}</div></div><span style="font-size:22px;font-weight:800;color:${corTemp(c.temperatura)};" title="temperatura">${c.temperatura}°</span></div>
      ${(c.resumo_sdr || c.atendido_ia || c.no_fluxo_ia || D.props_ia?.abordagem) ? `<div style="margin-top:10px;border:1px solid rgba(156,109,255,.35);background:rgba(156,109,255,.07);border-radius:10px;padding:9px 11px;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><b>🤖 IARA</b>${c.no_fluxo_ia ? '<span class="fl-chip" style="color:var(--pu);">no fluxo da IARA</span>' : '<span class="fl-chip">fora do fluxo</span>'}${c.atendido_ia ? '<span class="fl-chip" style="color:#25d366;">💬 já mandou WhatsApp</span>' : ''}</div>
        ${c.resumo_sdr ? `<div style="font-size:9.5px;color:var(--t3);margin-top:6px;text-transform:uppercase;">Resumo da conversa (SDR)</div><div style="white-space:pre-wrap;line-height:1.55;margin-top:2px;max-height:220px;overflow:auto;">${esc(c.resumo_sdr)}</div>` : '<div style="color:var(--t3);margin-top:4px;">Sem resumo de conversa ainda.</div>'}
        ${D.props_ia?.abordagem ? `<div style="font-size:9.5px;color:var(--t3);margin-top:8px;text-transform:uppercase;">Abordagem</div><div id="flAbTags" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;">${(D.props_ia.abordagem_opcoes || []).length ? D.props_ia.abordagem_opcoes.map(o => `<label class="fl-chip" style="cursor:pointer;"><input type="${D.props_ia.abordagem_unica ? 'radio' : 'checkbox'}" name="flAbR" value="${esc(o.v)}" ${String(c.abordagem || '').split(', ').includes(o.l) ? 'checked' : ''} style="margin:0 3px 0 0;vertical-align:-1px;"/>${esc(o.l)}</label>`).join('') : `<input class="fi" id="flAbTxt" value="${esc(c.abordagem || '')}" style="max-width:260px;"/>`}<button class="btn btn-g" style="font-size:9.5px;padding:2px 8px;" onclick="FLORESTA.abordagem('${esc(c.id)}')">Salvar no HubSpot</button></div>` : ''}
      </div>` : ''}
      ${ligBox(c)}
      <div style="margin-top:10px;border:1px solid var(--bd);border-radius:10px;padding:9px 11px;"><div style="display:flex;align-items:center;gap:6px;"><b style="flex:1;">💬 Conversa e histórico (HubSpot)</b><button class="btn btn-g" style="font-size:9.5px;padding:2px 8px;" onclick="FLORESTA.conversa('${esc(c.id)}')">↻</button></div><div id="flConv" style="margin-top:6px;max-height:260px;overflow:auto;color:var(--t3);">Carregando…</div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;">
        <div><span style="color:var(--t3);">Etapa:</span> ${e.icone} ${esc(e.nome)}</div><div><span style="color:var(--t3);">No HubSpot:</span> ${esc(c.etapa_hs || '—')}</div>
        <div><span style="color:var(--t3);">Na etapa há:</span> <b style="color:${corSla(c)};">${c.dias ?? '?'} dias</b>${c.sla ? ' (limite ' + c.sla + ')' : ''}</div><div><span style="color:var(--t3);">Último contato:</span> ${dt(c.ultimo_contato)}</div>
        ${c.valor ? `<div><span style="color:var(--t3);">Valor:</span> ${brl(c.valor)}</div>` : ''}${c.fechamento ? `<div><span style="color:var(--t3);">Fechamento:</span> ${dt(c.fechamento)}</div>` : ''}
        ${c.dono ? `<div><span style="color:var(--t3);">Dono:</span> ${esc(c.dono)}</div>` : ''}${c.origem ? `<div><span style="color:var(--t3);">Origem:</span> ${esc(c.origem)}</div>` : ''}
        ${c.proximo_passo ? `<div style="grid-column:1/-1;"><span style="color:var(--t3);">Próximo passo:</span> ${esc(c.proximo_passo)}</div>` : ''}
        ${c.congelado ? `<div style="grid-column:1/-1;color:#5aa9ff;">🧊 Congelado até ${dt(c.congelado.ate)} — ${esc(c.congelado.motivo || '')}</div>` : ''}
        <div><span style="color:var(--t3);">Telefone:</span> ${c.telefone ? `<b>${esc(c.telefone)}</b> <span style="color:var(--t3);">(${c.tel_tipo === 'fixo' ? 'fixo' : 'celular'})</span>` : '<span style="color:var(--t3);">não cadastrado no HubSpot</span>'}</div>
        <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;"><span style="color:var(--t3);">E-mail:</span> ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span style="color:var(--t3);">não cadastrado</span>'}</div>
        ${(c.contatos || []).length ? `<div style="grid-column:1/-1;"><span style="color:var(--t3);">Contatos:</span> ${c.contatos.map(x => esc(x.nome + (x.cargo ? ' (' + x.cargo + ')' : ''))).join(', ')}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
        ${(c.contato_id || String(c.id).startsWith('c:')) ? (c.no_fluxo_ia ? `<button class="btn" style="font-size:10.5px;" onclick="FLORESTA.tirarIara('${esc(c.id)}')">Tirar do fluxo da IARA</button>` : `<button class="btn btn-p" style="font-size:10.5px;background:#7c4dff;" onclick="FLORESTA.iara('${esc(c.id)}')">🤖 Colocar no fluxo da IARA</button>`) : ''}
        ${c.etapa !== 'ligacao' && c.telefone && !['cliente', 'perdido'].includes(c.etapa) ? `<button class="btn" style="font-size:10.5px;color:#0ea5a4;border-color:#0ea5a4;" onclick="FLORESTA.ligar('${esc(c.id)}')">📞 Mandar para ligação</button>` : ''}
        <button class="btn btn-p" style="font-size:10.5px;" onclick="FLORESTA.iaUm('${esc(c.id)}')">🤖 IA: o que fazer com este?</button>
        <button class="btn" style="font-size:10.5px;" onclick="FLORESTA.congelar('${esc(c.id)}')">🧊 Congelar</button>
        ${c.link ? `<a class="btn" style="font-size:10.5px;text-decoration:none;color:#ff7a59;border-color:#ff7a59;" href="${esc(c.link)}" target="_blank" rel="noopener">HubSpot</a>` : ''}
        ${wa ? `<a class="btn" style="font-size:10.5px;text-decoration:none;color:#25d366;border-color:#25d366;" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${c.email ? `<a class="btn" style="font-size:10.5px;text-decoration:none;" href="mailto:${esc(c.email)}">E-mail</a>` : ''}
        <button class="btn btn-g" style="font-size:10.5px;margin-left:auto;" onclick="document.getElementById('flModal').remove()">Fechar</button></div></div>`;
    document.body.appendChild(m); conversa(c.id);
  }
  async function soltar(para) {
    const id = arrastando; arrastando = null; if (!id) return; const c = D.cards.find(x => x.id === id); if (!c || c.etapa === para) return;
    const e = D.etapas.find(x => x.id === para); let ate = null, motivo = '';
    if (para === 'congelado') { ate = prompt('Congelar até quando? (AAAA-MM-DD)', new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)); if (!ate) return; motivo = prompt('Motivo (opcional):', '') || ''; }
    else if (!confirm(`Mover "${c.nome}" para ${e.nome}?` + (para === 'iara' ? '\n\nO contato entra no fluxo da IARA (fluxo_de_atendimento = IA, atendido_pela_ia = false até a IARA atender, abordagem = Geral se estiver vazia). Não precisa de negócio.' : c.tipo === 'contato' && ['reuniao', 'proposta', 'negociacao'].includes(para) ? '\n\nUm NEGÓCIO será criado no HubSpot para este contato.' : '\n\nA etapa muda também no HubSpot.'))) return;
    try { const r = await api('floresta_mover', { card_id: id, para, congelar_ate: ate, motivo }); nota(r.resultado || 'Movido'); await carregar(true); } catch (e2) { nota('Erro: ' + e2.message, 'error'); }
  }
  async function congelar(id) { arrastando = id; document.getElementById('flModal')?.remove(); await soltar('congelado'); }
  async function ia() { const b = $('flIaBtn'); if (b) { b.disabled = true; b.textContent = '🤖 Lendo a floresta… (até 2 min)'; }
    try { const r = await api('floresta_ia', {}); nota(r.novas ? r.novas + ' decisão(ões) para aprovar' : 'Nenhum estourado novo — veja os insights'); painel = r.novas ? 'fila' : 'ins'; await carregar(false); }
    catch (e) { nota('Erro: ' + e.message, 'error'); } finally { if (b) { b.disabled = false; b.textContent = '🤖 IA: decidir os estourados'; } } }
  async function iaUm(id) { document.getElementById('flModal')?.remove(); nota('A IA está avaliando…', 'info');
    try { const r = await api('floresta_ia', { card_id: id }); painel = 'fila'; await carregar(false); nota(r.novas ? 'Decisão na fila para você aprovar' : 'A IA não propôs nada'); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  async function decidir(id, decisao) {
    const el = $('fd_' + id), extra = {}; el?.querySelectorAll('[data-k]').forEach(i => { extra[i.dataset.k] = i.value; }); const f = (D.fila || []).find(x => x.id === id);
    if (decisao === 'aprovar' && f?.decisao === 'desistir' && !confirm('Desistir de ' + f.nome + '? Ele vai para Perdido no HubSpot.')) return;
    // mensagem aprovada: abre o WhatsApp/e-mail já preenchido (no próprio clique, para o navegador não bloquear) — o envio é seu
    if (decisao === 'aprovar' && f && (extra.mensagem || f.mensagem)) { if (f.acao === 'email' && f.email) mail(id); else if (f.acao === 'mensagem_whatsapp' && f.telefone) wa(id); }
    try { const r = await api('floresta_decidir', { id, decisao, ...extra }); nota(decisao === 'rejeitar' ? 'Rejeitada' : r.ok ? 'Feito: ' + (r.resultado || 'aprovada') : 'Erro: ' + r.resultado, r.ok || decisao === 'rejeitar' ? 'success' : 'error'); await carregar(true); }
    catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  function _msg(id) { const el = $('fd_' + id); const f = D.fila.find(x => x.id === id) || {}; return { f, txt: el?.querySelector('[data-k=mensagem]')?.value || f.mensagem || '', ass: el?.querySelector('[data-k=assunto]')?.value || f.assunto || '' }; }
  function wa(id) { const { f, txt } = _msg(id); const t = String(f.telefone || '').replace(/\D/g, ''); window.open('https://wa.me/' + (t.length <= 11 ? '55' + t : t) + '?text=' + encodeURIComponent(txt), '_blank', 'noopener'); }
  function mail(id) { const { f, txt, ass } = _msg(id); location.href = 'mailto:' + encodeURIComponent(f.email) + '?subject=' + encodeURIComponent(ass) + '&body=' + encodeURIComponent(txt); }
  function sla() {
    document.getElementById('flModal')?.remove(); const m = document.createElement('div'); m.id = 'flModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;width:min(440px,100%);padding:16px;font-size:11px;"><div style="font-family:var(--H);font-weight:700;margin-bottom:8px;">⏱ Tempo limite por etapa (dias)</div>
      ${D.etapas.filter(e => !['cliente', 'congelado', 'perdido'].includes(e.id)).map(e => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="flex:1;">${e.icone} ${esc(e.nome)} <span style="color:var(--t3);font-size:9.5px;">${esc(e.dica)}</span></span><input class="fi" type="number" min="1" max="365" data-e="${e.id}" value="${e.sla ?? ''}" style="width:70px;"/></div>`).join('')}
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;"><span style="flex:1;">🎯 Meta de vendas por mês</span><input class="fi" type="number" min="1" id="flMeta" value="${D.meta_vendas_mes || 4}" style="width:70px;"/></div>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:12px;"><button class="btn btn-g" onclick="document.getElementById('flModal').remove()">Cancelar</button><button class="btn btn-gn" id="flSlaOk">Salvar</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#flSlaOk').onclick = async () => { const s = {}; m.querySelectorAll('[data-e]').forEach(i => { s[i.dataset.e] = i.value; });
      try { await api('floresta_cfg', { sla: s, meta_vendas_mes: m.querySelector('#flMeta').value }); m.remove(); nota('Tempos salvos'); await carregar(true); } catch (e) { nota('Erro: ' + e.message, 'error'); } };
  }
  // ══ v3.441: IARA — revisar e aprovar a 1ª mensagem de cada marcado
  function modal(html, w) { document.getElementById('flModal')?.remove(); const m = document.createElement('div'); m.id = 'flModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;width:min(${w || 760}px,100%);max-height:90vh;overflow:auto;padding:16px;font-size:11px;">${html}</div>`; document.body.appendChild(m); return m; }
  async function iara(umId) { // v3.445: a IARA é um sistema externo — entrar no fluxo dela = "Fluxo IA" = IA no contato do HubSpot
    const ids = umId ? [umId] : [...SEL]; if (!ids.length) return nota('Marque ao menos um card', 'error'); const L = ids.map(id => D.cards.find(c => c.id === id)).filter(Boolean); const semTel = L.filter(c => !c.telefone).length, ja = L.filter(c => c.no_fluxo_ia).length;
    if (!confirm('Colocar ' + L.length + ' no fluxo da IARA?\n\nO campo "' + (D.props_ia?.marca_interno || 'atendido_pela_ia') + '" é marcado no HubSpot e a IARA assume a abordagem pelo WhatsApp.' + (ja ? '\n' + ja + ' já estão no fluxo.' : '') + (semTel ? '\n⚠ ' + semTel + ' sem telefone — a IARA não consegue falar com eles.' : ''))) return;
    document.getElementById('flModal')?.remove(); nota('Marcando "' + (D.props_ia?.marca_interno || 'atendido_pela_ia') + '" no HubSpot…', 'info');
    try { const r = await api('floresta_iara_fluxo', { card_ids: ids, contatos: L.map(c => ({ card_id: c.id, contato_id: c.contato_id || (String(c.id).startsWith('c:') ? String(c.id).slice(2) : null), nome: c.nome })) }); const f = (r.resultados || []).filter(x => !x.ok);
      _aplicarIara((r.resultados || []).filter(x => x.ok).map(x => x.card_id), true);
      nota(r.ok + ' no fluxo da IARA' + (r.campos ? ' — HubSpot: ' + Object.entries(r.campos).map(([k, v]) => k + ' = ' + v).join(', ') : '') + (f.length ? ' · ' + f.length + ' com erro: ' + f.slice(0, 5).map(x => (x.nome || '') + ' (' + x.motivo + ')').join('; ') : ''), f.length ? 'error' : 'success');
      if (!umId) f.length ? (SEL.clear(), f.forEach(x => SEL.add(x.card_id))) : SEL.clear(); _redesenhar(); carregar(true).catch(() => {}); }
    catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  async function tirarIara(umId) { const ids = umId ? [umId] : [...SEL]; if (!ids.length || !confirm('Tirar ' + ids.length + ' do fluxo da IARA (fluxo_de_atendimento = Manual no HubSpot)?')) return;
    document.getElementById('flModal')?.remove(); const L = ids.map(id => D.cards.find(c => c.id === id)).filter(Boolean);
    try { const r = await api('floresta_iara_fluxo', { card_ids: ids, contatos: L.map(c => ({ card_id: c.id, contato_id: c.contato_id || (String(c.id).startsWith('c:') ? String(c.id).slice(2) : null), nome: c.nome })), tirar: true }); _aplicarIara((r.resultados || []).filter(x => x.ok).map(x => x.card_id), false);
      nota(r.ok + ' fora do fluxo da IARA'); if (!umId) SEL.clear(); _redesenhar(); carregar(true).catch(() => {}); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  function _aplicarIara(ids, on) { ids.forEach(id => { const c = D.cards.find(x => x.id === id); if (!c) return; c.no_fluxo_ia = on; c.fluxo_ia = on ? 'IA' : '';
    if (on && ['frio', 'abordado', 'engajado'].includes(c.etapa)) { c.etapa_antes_iara = c.etapa; c.etapa = 'iara'; } else if (!on && c.etapa === 'iara') c.etapa = c.etapa_antes_iara || 'frio'; }); }
  async function abordagem(id) {
    const box = document.getElementById('flAbTags'); const t = box?.querySelector('#flAbTxt'); const valores = t ? [t.value.trim()] : [...box.querySelectorAll('input[type=checkbox]:checked,input[type=radio]:checked')].map(x => x.value);
    try { await api('floresta_abordagem', { card_id: id, valores }); nota('Abordagem salva no HubSpot'); document.getElementById('flModal')?.remove(); await carregar(true); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  // ══ v3.441: gerar leads frios no Apollo (mesma busca da Prospecção, sem crédito) e plantar na floresta
  function apollo() {
    let lista = [], fonte = 'frio', listas = null, listaNome = '';
    const m = modal(`<div style="font-family:var(--H);font-size:15px;font-weight:700;">🧲 Gerar leads frios ou mornos (Apollo) e plantar na floresta</div>
      <div style="color:var(--t2);margin:3px 0 10px;">Mesma busca da tela de Prospecção (ICP C-level, empresas médias e grandes). A busca não consome crédito do Apollo; os escolhidos entram no HubSpot como <b>contato frio</b> e aparecem na coluna ❄️ — dali, marque e mande a IARA abordar.</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;"><button class="btn btn-p" id="flApFFrio" style="font-size:10.5px;">❄️ Frios — busca por filtros</button><button class="btn" id="flApFMorno" style="font-size:10.5px;">🌡 Mornos — lista do Apollo (intenção de compra / visitou o site)</button></div>
      <div id="flApMornoBox" style="display:none;border:1px solid rgba(255,170,60,.45);background:rgba(255,170,60,.07);border-radius:10px;padding:9px 11px;margin-bottom:10px;">
        <div style="display:flex;gap:6px;align-items:end;flex-wrap:wrap;"><div style="flex:1;min-width:240px;"><label style="color:var(--t3);font-size:10px;">Lista salva no Apollo</label><select class="fsel" id="flApListaSel"><option value="">carregando…</option></select></div><button class="btn btn-g" id="flApListasRec" style="font-size:10px;">↻ Recarregar listas</button></div>
        <details style="margin-top:7px;font-size:10.5px;color:var(--t2);"><summary style="cursor:pointer;color:var(--t1);">Como montar a lista de leads mornos no Apollo (a API do Apollo não expõe intenção de compra — a lista é o caminho)</summary>
          <ol style="margin:6px 0 0 16px;padding:0;line-height:1.55;"><li><b>Intenção de compra:</b> Settings → Ideal customer profile → Buying intent → escolha os temas dos nossos serviços e produtos (ex.: Data Warehouse, Data Engineering, Business Intelligence, Power BI, Artificial Intelligence, Generative AI, Machine Learning, Data Analytics, Databricks, Snowflake, Data Governance, IT Outsourcing, IT Staff Augmentation, Sales Automation) → Save.</li>
          <li><b>Visitantes do site:</b> Settings → Ideal customer profile → Website visitors → Add website (atlantyx.io) e instale o script no site. No Brasil o Apollo identifica a empresa, não a pessoa.</li>
          <li>Search → <b>Companies</b> → filtro <b>Buying Intent</b> (High/Medium) e/ou <b>Website Visitors</b> (últimos 30 dias) + Brasil + porte → marque as empresas → <b>Add to list</b> (ex.: "Mornos — intenção dados/IA").</li>
          <li>Volte aqui, escolha a lista e clique em Buscar: o sistema traz os <b>decisores</b> dessas empresas pelos cargos acima, sem gastar crédito. Lista de <b>pessoas</b> também funciona.</li></ol></details></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
        <div><label style="color:var(--t3);font-size:10px;">Cargos (vírgula)</label><input class="fi" id="flApCargo" value="CEO, CFO, CIO, CTO, Diretor de TI, Diretor Financeiro"/></div>
        <div class="flApSoFrio"><label style="color:var(--t3);font-size:10px;">Setor</label><input class="fi" id="flApSetor" placeholder="ex.: energy, banking, retail"/></div>
        <div><label style="color:var(--t3);font-size:10px;">Local</label><input class="fi" id="flApLocal" value="Brazil"/></div>
        <div class="flApSoFrio"><label style="color:var(--t3);font-size:10px;">Palavras-chave</label><input class="fi" id="flApKw" placeholder="ex.: planejamento, anaplan, dados"/></div>
        <div><label style="color:var(--t3);font-size:10px;">Quantidade</label><select class="fsel" id="flApQtd"><option>25</option><option selected>50</option><option>100</option></select></div></div>
      <div style="display:flex;gap:6px;margin-top:8px;"><button class="btn btn-p" id="flApBuscar" style="font-size:10.5px;">🔎 Buscar no Apollo</button><span id="flApInfo" style="font-size:10.5px;color:var(--t3);align-self:center;"></span></div>
      <div id="flApLista" style="margin-top:10px;"></div>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;position:sticky;bottom:0;background:var(--bg2);padding-top:6px;"><button class="btn btn-g" onclick="document.getElementById('flModal').remove()">Fechar</button><button class="btn" id="flApIaSel" style="font-size:10.5px;" title="Marca a coluna IARA de quem está marcado para plantar">🤖 IARA nos marcados</button><button class="btn btn-gn" id="flApImportar" disabled>🌱 Plantar na floresta</button></div>`, 820);
    const v = id => m.querySelector('#' + id).value.trim();
    // v3.470: fonte FRIOS (busca por filtros) ou MORNOS (lista do Apollo montada com Buying Intent / Website Visitors)
    const chave = () => { try { return (typeof getLICredenciais === 'function' ? getLICredenciais().apolloKey : '') || localStorage.getItem('atx:li_apollo_key') || ''; } catch (_) { return ''; } };
    const carregarListas = async () => { const sel = m.querySelector('#flApListaSel'); sel.innerHTML = '<option value="">carregando…</option>';
      try { const k = chave(); const r = await api('floresta_apollo_listas', k ? { api_key: k } : {}); listas = r.listas || []; if (r.aviso) nota(r.aviso, 'info');
        sel.innerHTML = listas.length ? '<option value="">— escolha a lista —</option>' + listas.map(l => `<option value="${esc(l.id)}" data-tipo="${esc(l.tipo)}">${l.tipo === 'accounts' ? '🏢' : '👤'} ${esc(l.nome)}${l.qtd != null ? ' (' + l.qtd + ')' : ''}</option>`).join('') : '<option value="">nenhuma lista no Apollo — monte uma (veja abaixo)</option>'; }
      catch (e) { sel.innerHTML = '<option value="">erro ao ler as listas</option>'; nota('Apollo (listas): ' + e.message, 'error'); } };
    const setFonte = f => { fonte = f; m.querySelector('#flApFFrio').className = 'btn' + (f === 'frio' ? ' btn-p' : ''); m.querySelector('#flApFMorno').className = 'btn' + (f === 'morno' ? ' btn-p' : '');
      m.querySelector('#flApMornoBox').style.display = f === 'morno' ? '' : 'none'; m.querySelectorAll('.flApSoFrio').forEach(x => { x.style.display = f === 'morno' ? 'none' : ''; });
      if (f === 'morno' && listas === null) carregarListas(); };
    m.querySelector('#flApFFrio').onclick = () => setFonte('frio'); m.querySelector('#flApFMorno').onclick = () => setFonte('morno'); m.querySelector('#flApListasRec').onclick = carregarListas;
    m.querySelector('#flApBuscar').onclick = async ev => { const b = ev.target; b.disabled = true; b.textContent = 'Buscando…';
      try { const p = { per_page: Number(v('flApQtd')) || 50, page: 1, cargo_estrito: true, person_titles: v('flApCargo').split(/\s*[,;]\s*/).filter(Boolean), person_locations: v('flApLocal') ? [v('flApLocal')] : undefined, ...(fonte === 'frio' && v('flApSetor') ? { setores: [v('flApSetor')] } : {}), ...(fonte === 'frio' && v('flApKw') ? { q_keywords: v('flApKw') } : {}) };
        if (fonte === 'morno') { const sl = m.querySelector('#flApListaSel'); if (!sl.value) { nota('Escolha a lista do Apollo', 'error'); return; } p.lista_id = sl.value; p.lista_tipo = sl.selectedOptions[0]?.dataset.tipo || 'accounts'; listaNome = (listas || []).find(l => l.id === sl.value)?.nome || ''; }
        try { const k = (typeof getLICredenciais === 'function' ? getLICredenciais().apolloKey : '') || localStorage.getItem('atx:li_apollo_key'); if (k) p.api_key = k; } catch (_) {}
        const r = await api('floresta_apollo', p); lista = r.pessoas || []; if (r.aviso) nota(r.aviso, 'info');
        if (fonte === 'morno') lista.forEach(x => { x.morno = 'lista do Apollo "' + listaNome + '" (intenção de compra / visitou o site)'; });
        m.querySelector('#flApInfo').textContent = (fonte === 'morno' ? '🌡 ' + (r.empresas != null ? r.empresas + ' empresas na lista · ' : '') : '') + lista.length + ' encontrados' + (r.total != null ? ' (de ' + Number(r.total).toLocaleString('pt-BR') + ' no Apollo)' : '') + ' · ' + lista.filter(x => x.ja_na_floresta).length + ' já na floresta';
        m.querySelector('#flApLista').innerHTML = lista.length ? `<table style="width:100%;border-collapse:collapse;font-size:10.5px;"><tr style="color:var(--t3);font-size:9.5px;text-align:left;"><th><input type="checkbox" checked onchange="document.querySelectorAll('.flApOk').forEach(c=>{if(!c.disabled)c.checked=this.checked})"/></th><th title="Já entra com Fluxo IA = IA"><label style="cursor:pointer;white-space:nowrap;"><input type="checkbox" id="flApIaTodos" onchange="document.querySelectorAll('.flApIa').forEach(c=>{if(!c.disabled)c.checked=this.checked})"/> 🤖 IARA</label></th><th>Nome</th><th>Cargo</th><th>Empresa</th><th>Local</th><th>Contato</th></tr>
          ${lista.map((x, i) => `<tr style="border-top:1px solid var(--bd);${x.ja_na_floresta ? 'opacity:.5;' : ''}"><td style="padding:4px;"><input type="checkbox" class="flApOk" data-i="${i}" ${x.ja_na_floresta ? 'disabled' : 'checked'}/></td><td style="padding:4px;"><input type="checkbox" class="flApIa" data-i="${i}" ${x.ja_na_floresta ? "disabled" : ""} title="${x.telefone ? 'Fluxo IA = IA' : 'Sem telefone no Apollo — a IARA pode não conseguir falar'}"/>${x.telefone ? '' : ' <span style="color:var(--gold);font-size:9px;" title="sem telefone">⚠</span>'}</td><td style="padding:4px;font-weight:600;">${x.morno ? '<span title="lead morno" style="color:#e07a00;">🌡</span> ' : ''}${esc(x.nome)}${x.decisor ? ' <span style="color:var(--pu);font-size:9px;">decisor</span>' : ''}</td><td>${esc(x.cargo)}</td><td>${esc(x.empresa)}${x.funcionarios ? ' <span style="color:var(--t3);">(' + x.funcionarios + ')</span>' : ''}</td><td>${esc([x.cidade, x.estado].filter(Boolean).join('/'))}</td><td style="font-size:9.5px;">${x.email ? '✉' : ''} ${x.telefone ? '☎' : ''}${x.ja_na_floresta ? ' já na floresta' : ''}</td></tr>`).join('')}</table>` : '<div style="color:var(--t3);padding:12px;">Nada com esses filtros.</div>';
        m.querySelector('#flApImportar').disabled = !lista.some(x => !x.ja_na_floresta); }
      catch (e) { nota('Apollo: ' + e.message, 'error'); } finally { b.disabled = false; b.textContent = '🔎 Buscar no Apollo'; } };
    m.querySelector('#flApIaSel').onclick = () => { m.querySelectorAll('.flApOk').forEach(c => { const ia = m.querySelector('.flApIa[data-i="' + c.dataset.i + '"]'); if (ia) ia.checked = c.checked && !c.disabled; }); };
    m.querySelector('#flApImportar').onclick = async ev => { const iaSet = new Set([...m.querySelectorAll('.flApIa:checked')].map(c => c.dataset.i));
      const sel = [...m.querySelectorAll('.flApOk:checked')].map(c => lista[+c.dataset.i] ? { ...lista[+c.dataset.i], fluxo_ia: iaSet.has(c.dataset.i) } : null).filter(Boolean); if (!sel.length) return nota('Marque quem plantar', 'error');
      const b = ev.target; b.disabled = true; b.textContent = 'Plantando ' + sel.length + '…';
      try { const r = await api('floresta_importar', { pessoas: sel }); nota(r.criados + (r.mornos ? ' lead(s) plantado(s) · 🌡 ' + r.mornos + ' morno(s)' : ' lead(s) frio(s) plantado(s)') + (r.ja_existiam ? ' · ' + r.ja_existiam + ' já existiam no HubSpot' : '') + (r.iara ? ' · 🤖 ' + r.iara + ' no fluxo da IARA' : '') + (r.iara_erro ? ' · IARA: ' + r.iara_erro : ''), r.iara_erro ? 'error' : 'success');
        m.remove(); filtro.q = ''; await carregar(true); (r.resultados || []).filter(x => x.card_id && !x.no_fluxo_ia).forEach(x => SEL.add(x.card_id)); render();
        if (SEL.size) setTimeout(() => nota(SEL.size + ' plantado(s) fora da IARA ficaram marcados — clique em "🤖 Colocar no fluxo da IARA" se quiser', 'info'), 2500); }
      catch (e) { b.disabled = false; b.textContent = '🌱 Plantar na floresta'; nota('Erro: ' + e.message, 'error'); } };
  }
  // ══ v3.442: ações em lote — remarketing / tirar / excluir (arquiva no HubSpot; restaurável lá por 90 dias)
  async function lote(acao) {
    const ids = [...SEL]; if (!ids.length) return;
    if (acao === 'excluir' && !confirm('Excluir ' + ids.length + ' card(s)? Contatos e negócios são arquivados no HubSpot (dá para restaurar lá por 90 dias).')) return;
    try { const r = await api('floresta_lote', { acao, card_ids: ids }); const falhas = (r.resultados || []).filter(x => !x.ok);
      nota({ remarketing: r.ok + ' no remarketing', tirar_remarketing: r.ok + ' fora do remarketing', excluir: r.ok + ' excluído(s)' }[acao] + (falhas.length ? ' · ' + falhas.length + ' com erro: ' + falhas.map(x => x.nome + ' (' + x.motivo + ')').join('; ') : ''), falhas.length ? 'error' : 'success');
      SEL.clear(); await carregar(true); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  async function csvRmk() {
    try { const r = await api('floresta_remarketing_lista'); const L = r.pessoas || []; if (!L.length) return nota('Remarketing vazio', 'error');
      const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'; const csv = ['nome,empresa,cargo,email,telefone'].concat(L.map(p => [p.nome, p.empresa, p.cargo, p.email, p.telefone].map(q).join(','))).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'remarketing-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
      nota(L.length + ' pessoa(s) — suba no Meta, LinkedIn ou na campanha de e-mail'); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  // v3.495: retorno das conversas da IARA (o mesmo job que roda de hora em hora)
  async function iaraRetornos() { nota('Lendo as conversas novas da IARA no HubSpot…', 'info');
    try { const r = await api('iara_retornos', {}); if (!r.novos) { nota('Nenhuma conversa nova da IARA nas últimas 26 horas'); return; }
      nota(r.novos + ' conversa(s) da IARA tratada(s)' + (r.email?.ok ? ' · e-mail enviado para ' + r.email.para : r.email?.erro ? ' · e-mail NÃO enviado: ' + r.email.erro : '') + ((r.itens || []).some(i => i.erro) ? ' · com avisos (veja o Log)' : ''), r.email?.ok === false ? 'error' : 'success');
      (r.itens || []).forEach(i => { try { addLog(i.erro ? 'warn' : 'ok', '[IARA] ' + i.nome + ' (' + (i.empresa || '') + '): ' + i.desfecho + (i.acao ? ' · ' + i.acao : '') + (i.mudou?.length ? ' · ' + i.mudou.join(', ') : '') + (i.erro ? ' · ' + i.erro : '')); } catch (_) {} });
      await carregar(true); } catch (e) { nota(e.message, 'error'); } }
  // v3.496: conversa do card (resumo da IARA, notas e mensagens registradas no HubSpot)
  async function conversa(id) { const box = $('flConv'); if (!box) return; box.textContent = 'Carregando…';
    try { const r = await api('floresta_conversa', { card_id: id }); const ic = { iara: '🤖', nota: '📝', whats_app: '💬', whatsapp: '💬', sms: '✉️', linkedin_message: '🔗', conversa: '💬', campo: '🗂', email: '📧', chamada: '📞', tarefa: '✅', reuniao: '🤝', aviso_conv: '⚠' };
      const res = (r.contatos || []).filter(k => k.resumo).map(k => `<div style="margin-bottom:8px;"><div style="font-size:9.5px;text-transform:uppercase;color:var(--pu);">Resumo da IARA · ${esc(k.nome)}${k.atendido ? ' · atendido pela IA' : ''}</div><div style="white-space:pre-wrap;line-height:1.5;color:var(--t1);">${esc(k.resumo)}</div></div>`).join('');
      const its = (r.itens || []).map(i => `<div style="border-top:1px solid var(--bd);padding:6px 0;"><div style="font-size:9.5px;color:var(--t3);">${ic[i.tipo] || '💬'} ${esc(i.origem || (i.tipo === 'iara' ? 'Retorno da IARA' : i.tipo === 'nota' ? 'Nota' : i.tipo))} · ${i.quando ? new Date(i.quando).toLocaleString('pt-BR').substring(0, 16) : ''}</div><div style="white-space:pre-wrap;line-height:1.5;color:var(--t1);">${esc(i.texto)}</div></div>`).join('');
      const cont = (r.contatos || []).map(k => esc(k.nome) + (k.telefone ? ' · ' + esc(k.telefone) : '') + (k.email ? ' · ' + esc(k.email) : '') + (k.fluxo ? ' · fluxo ' + esc(k.fluxo) : '')).join('<br>');
      box.innerHTML = (res || its ? res + its : `<div style="color:var(--gold);">${esc(r.aviso || 'Nada registrado no HubSpot ainda.')}</div>`) + (cont ? `<div style="margin-top:6px;font-size:9.5px;color:var(--t3);">Contatos do card: ${cont}</div>` : '');
    } catch (e) { box.textContent = 'Não consegui ler o HubSpot: ' + e.message; } }
  window.FLORESTA = { conversa, iaraRetornos, ligar, desligar, ligRes, tirarIara, abordagem, lote, csvRmk, marcar, sel: id => SEL.has(id), marcarCol: (et, on) => { filtrados().filter(c => c.etapa === et).forEach(c => on ? SEL.add(c.id) : SEL.delete(c.id)); _redesenhar(); }, marcarTodos: on => { filtrados().forEach(c => on ? SEL.add(c.id) : SEL.delete(c.id)); _redesenhar(); }, limpar: () => { SEL.clear(); _redesenhar(); }, iara, apollo,
    abrir, carregar, vista: v => { vista = v; render(); }, f: (k, v) => { filtro[k] = v; render(); if (k === 'q') { const i = document.querySelector('#flApp input.fi'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } },
    painel: p => { painel = p; render(); }, drag: id => { arrastando = id; }, soltar, ver, congelar, ia, iaUm, decidir, wa, mail, sla, _d: () => D };
})();
