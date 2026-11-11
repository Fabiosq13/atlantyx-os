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
  let D = null, vista = 'kanban', filtro = { q: '', tipo: '', atrasados: false, decisores: false, dono: '' }, painel = 'fila', arrastando = null, carregando = false;
  const FLUXO = ['frio', 'abordado', 'engajado', 'qualificado', 'reuniao', 'proposta', 'negociacao', 'cliente', 'congelado', 'perdido'];
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
    return (D?.cards || []).filter(c => (!filtro.tipo || c.tipo === filtro.tipo) && (!filtro.atrasados || c.atrasado) && (!filtro.decisores || c.decisor) && (!filtro.dono || c.dono === filtro.dono)
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
      .fl-col{flex:0 0 232px;background:var(--bg2);border:1px solid var(--bd);border-radius:12px;display:flex;flex-direction:column;max-height:76vh}
      .fl-col.drop{outline:2px dashed var(--pu);outline-offset:-3px}
      .fl-ch{padding:8px 10px;border-bottom:1px solid var(--bd)}.fl-cn{font-size:11.5px;font-weight:700}.fl-cs{font-size:9.5px;color:var(--t3)}
      .fl-cb{padding:6px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
      .fl-card{background:var(--bg);border:1px solid var(--bd);border-radius:10px;padding:7px 9px;cursor:grab;position:relative;transition:transform .12s,box-shadow .12s}
      .fl-card:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.25)}
      .fl-card .tp{position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:3px}
      .fl-ring{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:8.5px;font-weight:700;flex:0 0 30px}
      .fl-ring span{width:23px;height:23px;border-radius:50%;background:var(--bg);display:grid;place-items:center}
      .fl-chip{font-size:8.5px;padding:1px 6px;border-radius:9px;background:var(--bg3);color:var(--t2);white-space:nowrap}
      .fl-side{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;max-height:82vh;overflow-y:auto;position:sticky;top:8px}
      .fl-dec{border:1px solid var(--bd);border-radius:10px;padding:8px 10px;margin:8px;background:var(--bg)}
      .fl-forest{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
      .fl-clareira{background:radial-gradient(ellipse at bottom,rgba(34,211,163,.08),transparent 70%),var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:8px;min-height:180px}
      .fl-arv{display:inline-block;margin:2px;border-radius:50%;cursor:pointer;transition:transform .1s}.fl-arv:hover{transform:scale(1.25)}
    </style>
    <div class="fl-kpis">
      ${kpi('Contatos sem negócio', S.contatos_sem_negocio ?? 0)}${kpi('Negócios abertos', S.negocios ?? 0, 'pipeline ' + brl(S.pipeline_valor))}
      ${kpi('Estouraram o tempo', S.atrasados ?? 0, 'na etapa além do limite', (S.atrasados ? 'var(--red)' : 'var(--green)'))}
      ${kpi('Previsão de vendas', prev, 'meta ' + meta + '/mês · ' + (prev >= meta ? 'no ritmo' : 'faltam ' + Math.ceil(meta - prev)), prev >= meta ? 'var(--green)' : 'var(--gold)')}
      ${kpi('Decisões para aprovar', fila.length, 'propostas pela IA', fila.length ? 'var(--pu)' : 'var(--t3)')}
      ${kpi('Gargalo', S.gargalo ? (D.etapas.find(e => e.id === S.gargalo)?.nome || S.gargalo) : '—', 'menor conversão', 'var(--gold)')}
    </div>
    <div class="fl-funil">${FLUXO.slice(0, 8).map(id => { const e = D.etapas.find(x => x.id === id), p = S.por?.[id] || {}, cv = S.conversao?.[id];
      return `<div class="fl-fe" title="${esc(e.dica)}">${cv != null ? `<span class="cv">${cv}%↓</span>` : ''}<div style="font-size:9.5px;color:var(--t3);">${e.icone} ${esc(e.nome)}</div><b>${p.n || 0}</b>${p.atrasados ? ` <span style="font-size:9.5px;color:var(--red);">⏱${p.atrasados}</span>` : ''}${p.mediana_dias != null ? `<div style="font-size:9px;color:var(--t3);">~${p.mediana_dias}d · limite ${e.sla ?? '—'}d</div>` : ''}</div>`; }).join('')}</div>
    <div class="fl-bar">
      <div class="seg" style="margin:0;"><button class="${vista === 'kanban' ? 'on' : ''}" onclick="FLORESTA.vista('kanban')">▦ Kanban</button><button class="${vista === 'floresta' ? 'on' : ''}" onclick="FLORESTA.vista('floresta')">🌳 Floresta</button><button class="${vista === 'lista' ? 'on' : ''}" onclick="FLORESTA.vista('lista')">☰ Lista</button></div>
      <input class="fi" style="width:200px;display:inline-block;" placeholder="Buscar nome, empresa, cargo…" value="${esc(filtro.q)}" oninput="FLORESTA.f('q',this.value)"/>
      <select class="fsel" style="width:auto;display:inline-block;" onchange="FLORESTA.f('tipo',this.value)"><option value="">Contatos + negócios</option><option value="contato" ${filtro.tipo === 'contato' ? 'selected' : ''}>Só contatos sem negócio</option><option value="negocio" ${filtro.tipo === 'negocio' ? 'selected' : ''}>Só negócios</option></select>
      <select class="fsel" style="width:auto;display:inline-block;" onchange="FLORESTA.f('dono',this.value)"><option value="">Todos os donos</option>${donos.map(d => `<option ${filtro.dono === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
      <label style="font-size:11px;display:flex;gap:4px;align-items:center;"><input type="checkbox" ${filtro.atrasados ? 'checked' : ''} onchange="FLORESTA.f('atrasados',this.checked)"/> só estourados</label>
      <label style="font-size:11px;display:flex;gap:4px;align-items:center;"><input type="checkbox" ${filtro.decisores ? 'checked' : ''} onchange="FLORESTA.f('decisores',this.checked)"/> só decisores</label>
      <span style="flex:1;"></span>
      <button class="btn btn-p" id="flIaBtn" style="font-size:10.5px;" onclick="FLORESTA.ia()">🤖 IA: decidir os estourados</button>
      <button class="btn" style="font-size:10.5px;" onclick="FLORESTA.sla()">⏱ Tempos limite</button>
      <button class="btn" style="font-size:10.5px;" onclick="FLORESTA.carregar(true)">↻ Atualizar</button>
    </div>
    ${(D.avisos || []).map(a => `<div style="font-size:10.5px;color:var(--gold);margin-bottom:6px;">⚠ ${esc(a)}</div>`).join('')}
    <div class="fl-wrap"><div>${vista === 'kanban' ? kanban(L) : vista === 'floresta' ? forest(L) : lista(L)}</div>${lado()}</div>
    <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">Atualizado ${new Date(D.gerado_em).toLocaleString('pt-BR')} · arraste um card para outra coluna para movê-lo no HubSpot · 🧊 congelar = esperar até uma data e voltar à etapa · a IA nunca envia mensagens: você aprova e envia.</div>`;
  }
  function cardHtml(c) {
    const pct = c.sla ? Math.min(100, Math.round((c.dias || 0) / c.sla * 100)) : 0, cs = corSla(c);
    return `<div class="fl-card" draggable="true" ondragstart="FLORESTA.drag('${esc(c.id)}')" onclick="FLORESTA.ver('${esc(c.id)}')" title="${esc(c.etapa_hs || '')}">
      <div class="tp" style="background:${corTemp(c.temperatura)};"></div>
      <div style="display:flex;gap:7px;align-items:flex-start;padding-left:4px;"><div style="flex:1;min-width:0;">
        <div style="font-size:11.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.tipo === 'negocio' ? '💼 ' : ''}${esc(c.nome)}</div>
        <div style="font-size:9.5px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc([c.tipo === 'negocio' ? c.contato : c.cargo, c.empresa].filter(Boolean).join(' · ') || '—')}</div></div>
        ${c.sla ? `<div class="fl-ring" style="background:conic-gradient(${cs} ${pct}%,var(--bd) 0);" title="${c.dias} de ${c.sla} dias na etapa"><span style="color:${cs};">${c.dias}d</span></div>` : c.dias != null ? `<span class="fl-chip">${c.dias}d</span>` : ''}</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;padding-left:4px;">${c.valor ? `<span class="fl-chip" style="color:var(--green);">${brl(c.valor)}</span>` : ''}${c.decisor ? '<span class="fl-chip" style="color:var(--pu);">decisor</span>' : ''}${c.atrasado ? `<span class="fl-chip" style="color:var(--red);">+${c.estouro}d além</span>` : ''}${c.congelado ? `<span class="fl-chip" style="color:#5aa9ff;">volta ${dt(c.congelado.ate)}</span>` : ''}${(D.fila || []).some(f => f.card_id === c.id) ? '<span class="fl-chip" style="color:var(--pu);">🤖 decisão</span>' : ''}${c.dono ? `<span class="fl-chip">${esc(c.dono.split(' ')[0])}</span>` : ''}</div></div>`;
  }
  function kanban(L) {
    return `<div class="fl-kb">${FLUXO.map(id => { const e = D.etapas.find(x => x.id === id), C = L.filter(c => c.etapa === id).sort((a, b) => (b.atrasado - a.atrasado) || (b.temperatura - a.temperatura)), v = C.reduce((t, c) => t + (c.valor || 0), 0);
      return `<div class="fl-col" ondragover="event.preventDefault();this.classList.add('drop')" ondragleave="this.classList.remove('drop')" ondrop="this.classList.remove('drop');FLORESTA.soltar('${id}')">
        <div class="fl-ch"><div class="fl-cn">${e.icone} ${esc(e.nome)} <span style="color:var(--t3);font-weight:500;">${C.length}</span></div><div class="fl-cs">${e.sla ? 'limite ' + e.sla + ' dias' : esc(e.dica)}${v ? ' · ' + brl(v) : ''}${C.filter(c => c.atrasado).length ? ` · <span style="color:var(--red);">${C.filter(c => c.atrasado).length} estourados</span>` : ''}</div></div>
        <div class="fl-cb">${C.slice(0, 80).map(cardHtml).join('')}${C.length > 80 ? `<div style="font-size:9.5px;color:var(--t3);text-align:center;">+${C.length - 80} (use a busca)</div>` : ''}</div></div>`; }).join('')}</div>`;
  }
  function forest(L) { // cada etapa é uma clareira; cada árvore um lead/negócio (tamanho = temperatura/valor, cor = tempo na etapa)
    return `<div class="fl-forest">${FLUXO.map(id => { const e = D.etapas.find(x => x.id === id), C = L.filter(c => c.etapa === id);
      return `<div class="fl-clareira" ondragover="event.preventDefault()" ondrop="FLORESTA.soltar('${id}')"><div style="font-size:11px;font-weight:700;">${e.icone} ${esc(e.nome)} <span style="color:var(--t3);">${C.length}</span></div><div style="margin-top:6px;line-height:0;">
        ${C.slice(0, 160).map(c => { const s = Math.round(9 + c.temperatura / 9 + (c.valor ? Math.min(10, Math.log10(c.valor) * 1.6) : 0)); return `<span class="fl-arv" draggable="true" ondragstart="FLORESTA.drag('${esc(c.id)}')" onclick="FLORESTA.ver('${esc(c.id)}')" title="${esc(c.nome + (c.empresa ? ' · ' + c.empresa : '') + ' · ' + (c.dias ?? '?') + 'd' + (c.sla ? '/' + c.sla + 'd' : '') + (c.valor ? ' · ' + brl(c.valor) : ''))}" style="width:${s}px;height:${s}px;background:${corSla(c)};opacity:${.45 + c.temperatura / 180};${c.tipo === 'negocio' ? 'border-radius:4px;' : ''}"></span>`; }).join('')}</div></div>`; }).join('')}</div>
      <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">● contato · ■ negócio · tamanho = temperatura e valor · cor = tempo na etapa (verde dentro do limite, amarelo perto, vermelho estourado)</div>`;
  }
  function lista(L) {
    return `<div style="overflow-x:auto;background:var(--bg2);border:1px solid var(--bd);border-radius:12px;"><table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="color:var(--t3);font-size:9.5px;text-transform:uppercase;text-align:left;"><th style="padding:6px;">Nome</th><th>Empresa · cargo</th><th>Etapa</th><th>Dias / limite</th><th>Temp.</th><th style="text-align:right;">Valor</th></tr>
      ${L.sort((a, b) => (b.estouro - a.estouro) || (b.temperatura - a.temperatura)).slice(0, 400).map(c => `<tr style="border-top:1px solid var(--bd);cursor:pointer;" onclick="FLORESTA.ver('${esc(c.id)}')"><td style="padding:5px 6px;font-weight:600;">${c.tipo === 'negocio' ? '💼 ' : ''}${esc(c.nome)}</td><td>${esc([c.empresa, c.cargo].filter(Boolean).join(' · '))}</td><td>${esc(D.etapas.find(e => e.id === c.etapa)?.nome || c.etapa)}</td><td style="color:${corSla(c)};">${c.dias ?? '—'}${c.sla ? ' / ' + c.sla : ''}</td><td><span style="color:${corTemp(c.temperatura)};">●</span> ${c.temperatura}</td><td style="text-align:right;">${c.valor ? brl(c.valor) : ''}</td></tr>`).join('')}</table></div>`;
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
  function ver(id) {
    const c = (D.cards || []).find(x => x.id === id); if (!c) return; document.getElementById('flModal')?.remove(); const e = D.etapas.find(x => x.id === c.etapa);
    const tel = String(c.telefone || '').replace(/\D/g, ''), wa = tel ? 'https://wa.me/' + (tel.length <= 11 ? '55' + tel : tel) : null;
    const m = document.createElement('div'); m.id = 'flModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;'; m.onclick = ev => { if (ev.target === m) m.remove(); };
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;width:min(560px,100%);padding:16px;font-size:11px;">
      <div style="display:flex;gap:8px;align-items:flex-start;"><div style="flex:1;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">${c.tipo === 'negocio' ? '💼 ' : ''}${esc(c.nome)}</div><div style="color:var(--t3);">${esc([c.cargo, c.empresa].filter(Boolean).join(' · '))}</div></div><span style="font-size:22px;font-weight:800;color:${corTemp(c.temperatura)};" title="temperatura">${c.temperatura}°</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;">
        <div><span style="color:var(--t3);">Etapa:</span> ${e.icone} ${esc(e.nome)}</div><div><span style="color:var(--t3);">No HubSpot:</span> ${esc(c.etapa_hs || '—')}</div>
        <div><span style="color:var(--t3);">Na etapa há:</span> <b style="color:${corSla(c)};">${c.dias ?? '?'} dias</b>${c.sla ? ' (limite ' + c.sla + ')' : ''}</div><div><span style="color:var(--t3);">Último contato:</span> ${dt(c.ultimo_contato)}</div>
        ${c.valor ? `<div><span style="color:var(--t3);">Valor:</span> ${brl(c.valor)}</div>` : ''}${c.fechamento ? `<div><span style="color:var(--t3);">Fechamento:</span> ${dt(c.fechamento)}</div>` : ''}
        ${c.dono ? `<div><span style="color:var(--t3);">Dono:</span> ${esc(c.dono)}</div>` : ''}${c.origem ? `<div><span style="color:var(--t3);">Origem:</span> ${esc(c.origem)}</div>` : ''}
        ${c.proximo_passo ? `<div style="grid-column:1/-1;"><span style="color:var(--t3);">Próximo passo:</span> ${esc(c.proximo_passo)}</div>` : ''}
        ${c.congelado ? `<div style="grid-column:1/-1;color:#5aa9ff;">🧊 Congelado até ${dt(c.congelado.ate)} — ${esc(c.congelado.motivo || '')}</div>` : ''}
        ${(c.contatos || []).length ? `<div style="grid-column:1/-1;"><span style="color:var(--t3);">Contatos:</span> ${c.contatos.map(x => esc(x.nome + (x.cargo ? ' (' + x.cargo + ')' : ''))).join(', ')}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-p" style="font-size:10.5px;" onclick="FLORESTA.iaUm('${esc(c.id)}')">🤖 IA: o que fazer com este?</button>
        <button class="btn" style="font-size:10.5px;" onclick="FLORESTA.congelar('${esc(c.id)}')">🧊 Congelar</button>
        ${c.link ? `<a class="btn" style="font-size:10.5px;text-decoration:none;color:#ff7a59;border-color:#ff7a59;" href="${esc(c.link)}" target="_blank" rel="noopener">HubSpot</a>` : ''}
        ${wa ? `<a class="btn" style="font-size:10.5px;text-decoration:none;color:#25d366;border-color:#25d366;" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${c.email ? `<a class="btn" style="font-size:10.5px;text-decoration:none;" href="mailto:${esc(c.email)}">E-mail</a>` : ''}
        <button class="btn btn-g" style="font-size:10.5px;margin-left:auto;" onclick="document.getElementById('flModal').remove()">Fechar</button></div></div>`;
    document.body.appendChild(m);
  }
  async function soltar(para) {
    const id = arrastando; arrastando = null; if (!id) return; const c = D.cards.find(x => x.id === id); if (!c || c.etapa === para) return;
    const e = D.etapas.find(x => x.id === para); let ate = null, motivo = '';
    if (para === 'congelado') { ate = prompt('Congelar até quando? (AAAA-MM-DD)', new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)); if (!ate) return; motivo = prompt('Motivo (opcional):', '') || ''; }
    else if (!confirm(`Mover "${c.nome}" para ${e.nome}?` + (c.tipo === 'contato' && ['reuniao', 'proposta', 'negociacao'].includes(para) ? '\n\nUm NEGÓCIO será criado no HubSpot para este contato.' : '\n\nA etapa muda também no HubSpot.'))) return;
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
  window.FLORESTA = { abrir, carregar, vista: v => { vista = v; render(); }, f: (k, v) => { filtro[k] = v; render(); if (k === 'q') { const i = document.querySelector('#flApp input.fi'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } },
    painel: p => { painel = p; render(); }, drag: id => { arrastando = id; }, soltar, ver, congelar, ia, iaUm, decidir, wa, mail, sla, _d: () => D };
})();
