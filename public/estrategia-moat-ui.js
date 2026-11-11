// v3.439 — ESTRATÉGIA → 🏰 MOAT (fosso competitivo) · trilha T3
// Avalia o negócio Atlantyx e cada ideia do Pipeline de Ideias com as lentes do moat (Buffett), 7 Powers (Helmer),
// teste da cópia, flywheel (Collins), erosão e métricas — e "tuna" em rodadas até a nota chegar ao moat (≥ 8).
// O resumo do moat entra nas premissas de todas as IAs de estratégia (ATLAS, Sala, plano). Nada é executado sozinho.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  async function api(action, body = {}) {
    const r = await fetch('/api/estrategia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'A IA demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (!d.success) throw new Error(d.error || 'falha'); return d;
  }
  let D = null, alvo = 'atlantyx', rodadaVer = null, ocupado = false, el = null;
  const META = () => D?.meta || 8;
  const corNota = n => n >= 8 ? 'var(--green)' : n >= 5 ? 'var(--gold)' : 'var(--red)';
  const regDe = a => a === 'atlantyx' ? D?.moat?.atlantyx : D?.moat?.ideias?.[a.replace(/^ideia:/, '')];

  async function render(box) {
    el = box || el || $('estCorpo'); if (!el) return;
    if (!D) { el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--t3);font-size:11px;">Carregando o moat…</div>';
      try { D = await api('moat_obter'); } catch (e) { el.innerHTML = '<div style="color:var(--red);padding:20px;">Erro: ' + esc(e.message) + '</div>'; return; } }
    const M = D.moat || {}, ideiasComAnalise = Object.keys(M.ideias || {});
    const lista = [['atlantyx', '🏢 Atlantyx (negócio)', M.atlantyx?.rodadas?.slice(-1)[0]]].concat((D.ideias || []).map(i => ['ideia:' + i.id, '💡 ' + i.titulo, M.ideias?.[i.id]?.rodadas?.slice(-1)[0]]));
    const item = ([k, t, r]) => `<div onclick="ESTM.alvo('${esc(k)}')" style="cursor:pointer;padding:7px 8px;border-radius:7px;margin-bottom:3px;border:1px solid ${k === alvo ? 'var(--pu)' : 'transparent'};background:${k === alvo ? 'rgba(156,109,255,.08)' : 'transparent'};">
      <div style="font-size:11.5px;font-weight:600;">${esc(t)}</div><div style="font-size:9.5px;color:var(--t3);">${r ? `<b style="color:${corNota(r.nota)};">${r.nota}</b> → <b style="color:${corNota(r.nota_apos_tunagem)};">${r.nota_apos_tunagem}</b>/10 · rodada ${r.rodada}` : 'sem análise'}</div></div>`;
    el.innerHTML = `<div style="background:linear-gradient(135deg,rgba(156,109,255,.12),rgba(79,124,255,.04));border:1px solid rgba(156,109,255,.25);border-radius:10px;padding:12px 16px;margin-bottom:12px;">
        <div style="font-family:var(--H);font-size:14px;font-weight:700;">🏰 Moat — o fosso que protege o lucro da Atlantyx</div>
        <div style="font-size:10.5px;color:var(--t2);line-height:1.6;margin-top:3px;"><b>Moat</b> (Warren Buffett) é a vantagem competitiva <b>sustentável</b>: o que impede um concorrente com dinheiro de tirar seus clientes por anos. A IA avalia a Atlantyx e cada ideia com os <b>7 Powers</b> (escala, efeito de rede, contraposicionamento, custo de troca, marca, recurso exclusivo, processo), o <b>teste da cópia</b>, o <b>flywheel</b> (ciclo que se auto-reforça), o que pode <b>secar o fosso</b> e as <b>métricas</b> que provam o fosso — e propõe <b>tunagens</b>. Cada rodada parte da anterior e da sua orientação, até a nota chegar a <b>${META()}/10</b>. A tese aprovada passa a guiar o ATLAS, a Sala de Estratégia e o plano.</div>
        ${M.tese_aprovada?.texto ? `<div style="margin-top:8px;font-size:11px;padding:7px 10px;border-radius:7px;background:rgba(34,211,163,.1);border:1px solid rgba(34,211,163,.3);"><b>✔ Tese de moat aprovada:</b> ${esc(M.tese_aprovada.texto)} <span style="color:var(--t3);font-size:9.5px;">· ${new Date(M.tese_aprovada.em).toLocaleDateString('pt-BR')}</span> <a href="#" style="font-size:9.5px;" onclick="event.preventDefault();ESTM.tese(null)">remover</a></div>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:minmax(210px,260px) 1fr;gap:12px;align-items:start;" class="estm-grid">
        <div class="panel"><div class="ph"><div class="pt">Avaliar</div><span style="font-size:9.5px;color:var(--t3);">${ideiasComAnalise.length} ideia(s) analisada(s)</span></div><div class="pb" style="padding:6px;max-height:70vh;overflow:auto;">${lista.map(item).join('')}${(D.ideias || []).length ? '' : '<div style="font-size:10px;color:var(--t3);padding:6px;">Pipeline de Ideias vazio.</div>'}</div></div>
        <div class="panel"><div class="pb" id="estmDet"></div></div>
      </div><style>@media(max-width:760px){.estm-grid{grid-template-columns:1fr!important;}}</style>`;
    detalhe();
  }

  function detalhe() {
    const box = $('estmDet'); if (!box) return; const reg = regDe(alvo), R = reg?.rodadas || [];
    const r = rodadaVer != null ? R.find(x => x.rodada === rodadaVer) || R[R.length - 1] : R[R.length - 1];
    const titulo = alvo === 'atlantyx' ? 'Atlantyx — o negócio' : (D.ideias || []).find(i => 'ideia:' + i.id === alvo)?.titulo || reg?.titulo || 'Ideia';
    const form = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin:8px 0 12px;">
        <div style="flex:1;min-width:220px;"><label style="font-size:10px;color:var(--t3);">${R.length ? 'Orientação para a próxima rodada de tunagem (opcional)' : 'Orientação (opcional)'}</label><textarea class="fta" id="estmOri" rows="2" placeholder="${R.length ? 'Ex.: e se o Maestro virar o padrão de PMO das distribuidoras? E se cobrarmos por dado integrado em vez de licença?' : 'Ex.: considere que queremos vender o Maestro por assinatura a partir de 2027'}"></textarea></div>
        <button class="btn btn-p" id="estmBtn" style="font-size:10.5px;" onclick="ESTM.analisar()">${R.length ? '🔧 Tunar mais uma rodada' : '◆ Analisar o moat'} (1–2 min)</button></div>`;
    if (!r) { box.innerHTML = `<div style="font-family:var(--H);font-size:14px;font-weight:700;">${esc(titulo)}</div>` + form + '<div style="color:var(--t3);font-size:11px;padding:20px;text-align:center;">Ainda sem análise. Clique em "Analisar o moat".</div>'; return; }
    const sec = (t, h, cor) => `<div style="background:var(--bg2);border:1px solid var(--bd);${cor ? 'border-left:3px solid ' + cor + ';' : ''}border-radius:8px;padding:9px 11px;"><div style="font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;font-weight:700;margin-bottom:4px;">${t}</div><div style="font-size:11px;line-height:1.55;">${h}</div></div>`;
    const ul = a => '<ul style="margin:0 0 0 16px;padding:0;">' + (a || []).map(x => '<li style="margin-bottom:3px;">' + esc(x) + '</li>').join('') + '</ul>';
    const barra = f => `<span style="display:inline-block;width:70px;height:7px;border-radius:4px;background:var(--bd);vertical-align:middle;"><span style="display:block;height:100%;width:${f * 20}%;border-radius:4px;background:${f >= 4 ? 'var(--green)' : f >= 2 ? 'var(--gold)' : 'var(--red)'};"></span></span> <b>${f}/5</b>`;
    const hist = R.length > 1 ? `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;font-size:10px;color:var(--t3);margin:4px 0 8px;">Rodadas: ${R.map(x => `<button class="btn ${x.rodada === r.rodada ? 'btn-p' : 'btn-g'}" style="font-size:9.5px;padding:2px 7px;" title="${esc(x.orientacao || 'sem orientação')}" onclick="ESTM.rodada(${x.rodada})">${x.rodada}: ${x.nota}→${x.nota_apos_tunagem}</button>`).join('')}</div>` : '';
    const chegou = r.nota_apos_tunagem >= META();
    box.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;"><div style="flex:1;min-width:200px;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">${esc(titulo)}</div><div style="font-size:10px;color:var(--t3);">rodada ${r.rodada} · ${new Date(r.em).toLocaleString('pt-BR')}${r.orientacao ? ' · orientação: ' + esc(r.orientacao) : ''}</div></div>
        <div style="text-align:center;"><div style="font-size:9.5px;color:var(--t3);">HOJE</div><div style="font-family:var(--H);font-size:24px;font-weight:800;color:${corNota(r.nota)};">${r.nota}</div></div><div style="font-size:18px;color:var(--t3);">→</div>
        <div style="text-align:center;"><div style="font-size:9.5px;color:var(--t3);">APÓS TUNAGEM</div><div style="font-family:var(--H);font-size:24px;font-weight:800;color:${corNota(r.nota_apos_tunagem)};">${r.nota_apos_tunagem}</div></div>
        <div style="font-size:10.5px;padding:6px 10px;border-radius:7px;background:${chegou ? 'rgba(34,211,163,.12)' : 'rgba(255,170,60,.12)'};color:${chegou ? 'var(--green)' : 'var(--gold)'};font-weight:700;">${chegou ? '🏰 chegou no moat' : '🔧 continue tunando (meta ' + META() + ')'}</div></div>
      ${hist}${form}
      <div style="display:grid;gap:8px;grid-template-columns:1fr 1fr;margin-bottom:8px;" class="estm-g2">${sec('Veredito', esc(r.veredito), corNota(r.nota))}${sec('Tese do moat', esc(r.tese_moat) + `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-gn" style="font-size:9.5px;padding:2px 8px;" onclick="ESTM.tese(${r.rodada})">✔ Aprovar como tese da Atlantyx</button><button class="btn btn-g" style="font-size:9.5px;padding:2px 8px;" onclick="ESTM.conselho(${r.rodada})">🏛 Levar à Sala do Conselho</button></div>`, 'var(--pu)')}</div>
      ${sec('Teste da cópia — um concorrente com dinheiro levaria…', `<b>${esc(r.teste_copia?.tempo || '—')}</b> e <b>${esc(r.teste_copia?.custo || '—')}</b>${r.teste_copia?.quem ? ' · quem: ' + esc(r.teste_copia.quem) : ''}<div style="color:var(--t2);margin-top:3px;">${esc(r.teste_copia?.explicacao || '')}</div>`, 'var(--blue)')}
      <div style="margin-top:8px;">${sec('7 Powers — os poderes do fosso', `<table style="width:100%;border-collapse:collapse;font-size:10.5px;"><tr style="color:var(--t3);text-align:left;font-size:9.5px;"><th style="padding:3px;">Poder</th><th>Força</th><th>Benefício · barreira</th><th>Evidência</th><th>Como aumentar</th></tr>${(r.poderes || []).map(p => `<tr style="border-top:1px solid var(--bd);vertical-align:top;"><td style="padding:5px 3px;font-weight:600;white-space:nowrap;">${esc(p.poder)}</td><td style="white-space:nowrap;padding:5px 3px;">${barra(p.forca)}</td><td style="padding:5px 3px;">${esc(p.beneficio || '')}<div style="color:var(--t3);">${esc(p.barreira || '')}</div></td><td style="padding:5px 3px;color:var(--t2);">${esc(p.evidencia || '')}</td><td style="padding:5px 3px;">${esc(p.como_aumentar || '')}</td></tr>`).join('')}</table>`)}</div>
      <div style="margin-top:8px;">${sec('🔧 Tunagem — o que mudar para aprofundar o fosso', `<table style="width:100%;border-collapse:collapse;font-size:10.5px;"><tr style="color:var(--t3);text-align:left;font-size:9.5px;"><th style="padding:3px;"><input type="checkbox" onchange="document.querySelectorAll('.estmTun').forEach(c=>c.checked=this.checked)"/></th><th>Mudança</th><th>Poder</th><th>+nota</th><th>Esforço</th><th>Prazo</th><th>Primeiro passo</th></tr>${(r.tunagem || []).map((t, i) => `<tr style="border-top:1px solid var(--bd);vertical-align:top;"><td style="padding:5px 3px;"><input type="checkbox" class="estmTun" data-i="${i}"/></td><td style="padding:5px 3px;font-weight:600;">${esc(t.mudanca)}</td><td style="padding:5px 3px;">${esc(t.poder_reforcado || '')}</td><td style="padding:5px 3px;color:var(--green);">+${esc(t.ganho_nota ?? '')}</td><td style="padding:5px 3px;">${esc(t.esforco || '')}</td><td style="padding:5px 3px;">${esc(t.prazo || '')}</td><td style="padding:5px 3px;color:var(--t2);">${esc(t.primeiro_passo || '')}</td></tr>`).join('')}</table>
        <div style="margin-top:6px;"><button class="btn btn-gn" style="font-size:10px;" onclick="ESTM.tarefas(${r.rodada})">✅ Criar tarefas no To-do (marcadas)</button></div>`, 'var(--green)')}</div>
      <div style="display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:8px;">
        ${sec('🔄 Flywheel — o ciclo que aprofunda o fosso', '<ol style="margin:0 0 0 16px;padding:0;">' + (r.flywheel || []).map(x => '<li style="margin-bottom:3px;">' + esc(x) + '</li>').join('') + '</ol>', 'var(--cyan,#00C4CC)')}
        ${sec('⚠ O que pode secar o fosso', (r.ameacas || []).map(a => `<div style="margin-bottom:5px;"><b>${esc(a.ameaca)}</b> <span style="font-size:9.5px;color:${a.probabilidade === 'alta' ? 'var(--red)' : 'var(--t3)'};">(${esc(a.probabilidade || '')})</span><div style="color:var(--t2);">→ ${esc(a.mitigacao || '')}</div></div>`).join(''), 'var(--red)')}
        ${sec('📏 Métricas que provam o fosso', (r.metricas || []).map(m => `<div style="margin-bottom:5px;"><b>${esc(m.metrica)}</b> · meta ${esc(m.meta || '—')}<div style="color:var(--t2);">${esc(m.como_medir || '')}</div></div>`).join(''), 'var(--blue)')}
        ${sec('🚫 Não fazer (enfraquece o fosso)', ul(r.nao_fazer), 'var(--gold)')}
      </div>
      <div style="display:grid;gap:8px;grid-template-columns:1fr 1fr;margin-top:8px;" class="estm-g2">${sec('Como fica depois da tunagem', esc(r.versao_tunada))}${sec('Pergunta ao fundador', esc(r.pergunta_ao_fundador), 'var(--pu)')}</div>
      <style>@media(max-width:760px){.estm-g2{grid-template-columns:1fr!important;}}</style>`;
  }

  async function analisar() {
    if (ocupado) return; ocupado = true; const b = $('estmBtn'), ori = ($('estmOri')?.value || '').trim();
    if (b) { b.disabled = true; b.textContent = 'A IA está analisando o fosso… (1–2 min)'; }
    try { const body = alvo === 'atlantyx' ? { alvo: 'atlantyx' } : { alvo: 'ideia', ideia_id: alvo.replace(/^ideia:/, '') }; if (ori) body.orientacao = ori;
      const r = await api('moat_analisar', body); D = await api('moat_obter'); rodadaVer = null; render();
      nota(r.chegou ? '🏰 Chegou no moat (nota ' + r.analise.nota_apos_tunagem + ')' : 'Rodada ' + r.rodadas + ' pronta — nota ' + r.analise.nota + ' → ' + r.analise.nota_apos_tunagem); }
    catch (e) { nota('Erro: ' + e.message, 'error'); if (b) { b.disabled = false; b.textContent = 'Tentar de novo'; } }
    finally { ocupado = false; }
  }
  const rod = n => { const R = regDe(alvo)?.rodadas || []; return R.find(x => x.rodada === n) || R[R.length - 1]; };
  async function tese(n) {
    let texto = null; if (n != null) { const r = rod(n); texto = prompt('Tese de moat da Atlantyx (ajuste se quiser). Ela passa a guiar o ATLAS, a Sala de Estratégia e o plano:', r?.tese_moat || ''); if (!texto) return; }
    else if (!confirm('Remover a tese de moat aprovada?')) return;
    try { await api('moat_tese_salvar', { tese: texto }); D = await api('moat_obter'); render(); nota(texto ? 'Tese aprovada' : 'Tese removida'); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  function tarefas(n) {
    const r = rod(n), sel = [...document.querySelectorAll('.estmTun:checked')].map(c => r.tunagem[+c.dataset.i]).filter(Boolean);
    if (!sel.length) return nota('Marque as tunagens', 'error'); if (!window.ATX_TODO) return nota('To-do indisponível', 'error');
    ATX_TODO.revisar(sel.map(t => ({ texto: t.primeiro_passo ? t.primeiro_passo + ' (moat: ' + t.mudanca + ')' : t.mudanca, responsavel: 'Fabio' })), 'Estratégia · Moat', 'tunagem do fosso competitivo');
  }
  function conselho(n) {
    const r = rod(n); const titulo = alvo === 'atlantyx' ? 'a Atlantyx' : 'a ideia "' + ((D.ideias || []).find(i => 'ideia:' + i.id === alvo)?.titulo || '') + '"';
    const msg = `Pauta: o MOAT de ${titulo}. Nota hoje ${r.nota}/10, após tunagem ${r.nota_apos_tunagem}/10. Tese proposta: ${r.tese_moat} Tunagens: ${(r.tunagem || []).map(t => t.mudanca).join('; ')}. Debatam se essa é a tese certa, qual tunagem fazer primeiro e o que o Conselheiro do Contra vê de frágil.`;
    try { EST.aba('conselho'); setTimeout(() => { const t = document.querySelector('#estCorpo textarea'); if (t) { t.value = msg; t.focus(); } nota('Pauta colada na Sala do Conselho — revise e envie'); }, 400); } catch (_) {}
  }
  window.ESTM = { render, alvo: k => { alvo = k; rodadaVer = null; render(); }, rodada: n => { rodadaVer = n; detalhe(); }, analisar, tese, tarefas, conselho, recarregar: async () => { D = null; await render(); } };
})();
