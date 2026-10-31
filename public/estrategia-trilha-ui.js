// v3.341 — ESTRATÉGIA IA · TRILHA GUIADA 2027–2031 · trilha T3 · v3.342: sócios lado a lado, quatro cadeiras e exercício pessoal privado
// Roteiro de 11 perguntas (vazia → rascunho → validada; o ATLAS sugere, só o fundador valida), lista do que NÃO fazer,
// calendário de revisão (anual no 4º tri, orçamento em dezembro/junho, check-ins trimestrais) e orçamento semestral.
// Carregado sob demanda pela aba "🗺 Trilha guiada" de /estrategia-ui.js. Nada é executado sozinho.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const R$ = v => v == null || v === '' ? '—' : 'R$ ' + Math.round(Number(v)).toLocaleString('pt-BR');
  const nBR = v => { if (v == null || String(v).trim() === '') return null; let t = String(v).replace(/r\$|\s|%/gi, ''); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); const n = Number(t); return Number.isFinite(n) ? n : null; };
  const dataBR = d => d ? String(d).substring(0, 10).split('-').reverse().join('/') : '';
  const quando = v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  async function api(action, body = {}) {
    const r = await fetch('/api/estrategia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'A IA demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (!d.success) throw Object.assign(new Error(d.error || 'falha'), { codigo: d.codigo, faltam: d.faltam }); return d;
  }
  let box = null, sub = 'roteiro', D = null, sel = 1, sug = {}, NF = null, CAL = null, ORC = null, regrasAbertas = false;
  const COR = { vazia: 'var(--t3)', rascunho: 'var(--gold)', validada: 'var(--green,#22d3a3)' };
  const chip = (t, c) => `<span style="font-size:9.5px;font-family:var(--M);text-transform:uppercase;padding:1px 6px;border-radius:8px;border:1px solid ${c};color:${c};white-space:nowrap;">${esc(t)}</span>`;

  async function render(el) {
    box = el || box; if (!box) return;
    box.innerHTML = '<div style="padding:30px;text-align:center;color:var(--t3);font-size:11px;">Carregando a trilha guiada…</div>';
    try { D = await api('roteiro_obter'); } catch (e) { box.innerHTML = `<div class="panel"><div class="pb" style="color:var(--red);font-size:12px;">${esc(e.message)}</div></div>`; return; }
    if (!D.status.etapas.find(e => e.n === sel)) sel = D.status.proxima || 1;
    desenhar();
  }
  function desenhar() {
    const S = D.status;
    box.innerHTML = `<div class="panel" style="margin-bottom:10px;"><div class="pb">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><div style="flex:1;min-width:240px;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">🗺 Trilha guiada da estratégia · ${D.horizonte.inicio}–${D.horizonte.fim}</div>
          <div style="font-size:11px;color:var(--t2);margin-top:2px;">Estratégia de 5 anos, plano revisto todo ano, orçamento a cada 6 meses. O ATLAS sugere com os números vivos; <b>só você valida</b>.</div></div>
          <div style="min-width:200px;"><div style="font-size:10.5px;color:var(--t2);margin-bottom:3px;">${S.validadas} de ${S.total} perguntas validadas · ${S.rascunhos} em rascunho</div>
            <div style="height:7px;border-radius:4px;background:var(--bg3);overflow:hidden;"><div style="height:100%;width:${S.pct}%;background:var(--green,#22d3a3);"></div></div></div>
          <button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.regras()">${regrasAbertas ? '▴' : '▾'} Regras de ouro do método</button></div>
        ${regrasAbertas ? `<ol style="margin:10px 0 0;padding-left:20px;font-size:11.5px;line-height:1.6;color:var(--t2);">${D.regras_ouro.map(r => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}
      </div></div>
      <div class="seg" id="esttAbas" style="margin-bottom:10px;">${[['socios', '👥 Sócios e o seu papel'], ['roteiro', '① 11 perguntas'], ['nao', '✖ O que NÃO fazer (' + (D.nao_fazer || []).filter(x => x.ativo).length + ')'], ['calendario', '📅 Calendário de revisão'], ['orcamento', '💰 Orçamento semestral']].map(([k, t]) => `<button class="${k === sub ? 'on' : ''}" onclick="ESTT.sub('${k}')">${t}</button>`).join('')}</div>
      <div id="esttCorpo"></div>`;
    corpo();
  }
  function corpo() { if (sub === 'socios') socios(); else if (sub === 'roteiro') roteiro(); else if (sub === 'nao') naoFazer(); else if (sub === 'calendario') calendario(); else orcamento(); }

  // ── ① roteiro de 11 perguntas ──
  function roteiro() {
    const S = D.status, Q = D.perguntas, E = D.roteiro.etapas;
    const lista = Object.entries(D.blocos).map(([b, t]) => `<div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--t2);margin:8px 0 4px;">${esc(t)}</div>` +
      Q.filter(q => q.bloco === b).map(q => { const st = S.etapas.find(x => x.n === q.n); return `<div onclick="ESTT.etapa(${q.n})" style="cursor:pointer;display:flex;gap:6px;align-items:flex-start;padding:6px;border-radius:6px;margin-bottom:2px;${sel === q.n ? 'background:var(--bg3);' : ''}">
        <span style="width:20px;height:20px;flex-shrink:0;border-radius:50%;border:2px solid ${COR[st.estado]};color:${COR[st.estado]};font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;">${st.estado === 'validada' ? '✓' : q.n}</span>
        <div style="flex:1;min-width:0;"><div style="font-size:11.5px;line-height:1.35;">${esc(q.titulo)}</div><div style="font-size:9.5px;color:${COR[st.estado]};">${esc(D.estados[st.estado])}${st.alertas.length ? ' · <span style="color:var(--gold);">⚠</span>' : ''}${E[q.n].responsavel ? ' · ' + esc(E[q.n].responsavel) : ''}</div></div></div>`; }).join('')).join('');
    const q = Q.find(x => x.n === sel), e = E[sel], st = S.etapas.find(x => x.n === sel);
    const num = D.numeros, mot = D.motores;
    const dadosVivos = q.dados ? `<div style="border:1px solid rgba(0,196,204,.35);background:rgba(0,196,204,.05);border-radius:8px;padding:8px 10px;margin:8px 0;font-size:11px;line-height:1.55;">
        <b>Números vivos</b> <span style="color:var(--t3);">${num ? '(financeiro · lidos ' + esc(quando(num.em)) + ')' : ''}</span><br>${num ? [
          num.ano_atual ? `Ano ${num.ano_atual.ano}: realizado ${R$(num.ano_atual.realizado)}${num.ano_atual.meta ? ' de ' + R$(num.ano_atual.meta) + ' (' + (num.ano_atual.pct ?? '—') + '%)' : ''}${num.ano_atual.projecao_fechamento ? ' · fechamento projetado ' + R$(num.ano_atual.projecao_fechamento) : ''}${num.ano_atual.margem_pct != null ? ' · margem ' + num.ano_atual.margem_pct + '%' : ''}` : '',
          (num.historico || []).map(h => `${h.ano}: ${R$(h.faturamento)}${h.margem_de_lucro_pct != null ? ' · margem ' + h.margem_de_lucro_pct + '%' : ''}`).join(' · '),
          num.motores_12m ? 'Últimos 12 meses por motor: ' + Object.entries(num.motores_12m).map(([k, m]) => `${esc(mot[k] || k)} ${R$(m.receita)} (${m.participacao_pct ?? '—'}% · MC ${m.margem_contribuicao_pct ?? m.margem_bruta_pct ?? '—'}%)`).join(' · ') : '',
          num.pessoas_ativas != null ? `Pessoas ativas: ${num.pessoas_ativas}` : '', num.contratos ? `Contratos ativos: ${num.contratos.ativos} (vencem em 90 dias: ${num.contratos.vencem_90_dias})` : '',
          (num.erros || []).length ? `<span style="color:var(--gold);">⚠ ${esc(num.erros.slice(0, 2).join(' · '))}</span>` : ''].filter(Boolean).join('<br>') : 'Abra o ATLAS ou clique em "↻ Atualizar os números que a IA enxerga" (aba Plano vigente) para carregar os números.'}</div>` : '';
    const motores = q.motores ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:8px 0;">${Object.entries(mot).map(([k, t]) => `<div><label class="fl" for="esttM_${k}">${esc(t)}</label><select class="fsel" id="esttM_${k}"><option value="">escolha…</option>${Object.entries(D.escolhas_motor).map(([v, r]) => `<option value="${v}" ${e.motores?.[k] === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`).join('')}</div>` : '';
    const sg = sug[sel];
    const so = D.socios, banner = so && so.status !== 'alinhado' ? `<div style="border:1px solid var(--gold);background:rgba(250,178,25,.07);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:11.5px;">👥 <b>Sócios: ${esc(so.mensagem)}.</b> As metas (etapas 7 a 11) só se validam com os sócios alinhados. <a href="#" onclick="event.preventDefault();ESTT.sub('socios')">Ir para Sócios e o seu papel →</a></div>` : '';
    $('esttCorpo').innerHTML = banner + `<div style="display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:10px;" class="est-grid">
      <div class="panel"><div class="pb" style="padding:8px;">${lista}</div></div>
      <div class="panel"><div class="pb">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-family:var(--M);font-size:10px;color:var(--t2);">${esc(D.blocos[q.bloco])} · etapa ${q.n} de ${Q.length}</span>${chip(D.estados[e.estado], COR[e.estado])}${e.fora_de_ordem ? chip('começada fora de ordem', 'var(--gold)') : ''}</div>
        <div style="font-family:var(--H);font-size:16px;font-weight:700;margin-top:4px;">${q.n}. ${esc(q.titulo)}</div>
        <div style="font-size:11.5px;color:var(--t2);line-height:1.55;margin-top:3px;">${esc(q.guia)}</div>
        ${st.alertas.map(a => `<div style="margin-top:6px;font-size:11px;color:var(--gold);">⚠ ${esc(a)}</div>`).join('')}
        ${dadosVivos}${motores}
        <label class="fl" for="esttResp" style="margin-top:8px;">Resposta</label>
        <textarea class="fta" id="esttResp" style="min-height:200px;font-size:12.5px;" placeholder="Escreva com suas palavras. Use 🧠 Sugestão do ATLAS para um primeiro rascunho.">${esc(e.resposta)}</textarea>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:6px;">
          <div><label class="fl" for="esttResp2">Responsável</label><input class="fi" id="esttResp2" value="${esc(e.responsavel)}" placeholder="ex.: fundador"></div>
          <div><label class="fl" for="esttData">Data</label><input class="fi" type="date" id="esttData" value="${esc(e.data || '')}"></div></div>
        <div style="font-size:10px;color:var(--t3);margin-top:4px;">${e.atualizado_em ? 'Atualizada ' + esc(quando(e.atualizado_em)) + (e.atualizado_por ? ' por ' + esc(e.atualizado_por) : '') : 'Ainda não salva.'}${e.validado_em ? ' · validada ' + esc(quando(e.validado_em)) + (e.validado_por ? ' por ' + esc(e.validado_por) : '') : ''}</div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-g" onclick="ESTT.salvar(${q.n})">💾 Salvar rascunho</button>
          <button class="btn btn-p" onclick="ESTT.salvar(${q.n},'validada')" ${st.pode_validar ? '' : `disabled title="${esc(st.bloqueio)}"`}>✅ Validar</button>
          ${e.estado === 'validada' ? `<button class="btn btn-g" onclick="ESTT.salvar(${q.n},'rascunho')">↩ Voltar para rascunho</button>` : ''}
          <button class="btn btn-gn" id="esttBtSug" onclick="ESTT.sugerir(${q.n})">🧠 Sugestão do ATLAS</button>
          ${!st.pode_validar ? `<span style="font-size:10.5px;color:var(--t3);">🔒 ${esc(st.bloqueio)}</span>` : ''}${st.trava_socios ? ` <a href="#" style="font-size:10.5px;" onclick="event.preventDefault();ESTT.sub('socios')">alinhar sócios →</a>` : ''}</div>
        ${sg ? `<div style="margin-top:10px;border:1px solid rgba(124,156,255,.4);background:rgba(124,156,255,.06);border-radius:8px;padding:10px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><b style="font-size:12px;">🧠 Sugestão do ATLAS</b><span style="font-size:10px;color:var(--t3);">${esc(sg.aviso || '')}</span></div>
          <div style="font-size:12px;line-height:1.6;white-space:pre-wrap;">${esc(sg.sugestao)}</div>
          <div style="display:flex;gap:6px;margin-top:6px;"><button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.usarSug(${q.n},false)">⤵ Usar como rascunho</button><button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.usarSug(${q.n},true)">＋ Acrescentar ao texto</button><button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.descartarSug(${q.n})">Descartar</button></div></div>` : ''}
        <div style="display:flex;gap:6px;margin-top:12px;justify-content:space-between;">${q.n > 1 ? `<button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.etapa(${q.n - 1})">← ${q.n - 1}</button>` : '<span></span>'}${q.n < Q.length ? `<button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.etapa(${q.n + 1})">${q.n + 1} →</button>` : ''}</div>
      </div></div></div>`;
  }
  const lerMotores = () => D.perguntas.find(x => x.n === sel)?.motores ? Object.fromEntries(Object.keys(D.motores).map(k => [k, $('esttM_' + k)?.value || ''])) : undefined;
  function sujo() { const e = D.roteiro.etapas[sel]; const r = $('esttResp'); return r && (r.value !== e.resposta || ($('esttResp2')?.value || '') !== e.responsavel); }
  function etapa(n) { if (sub === 'roteiro' && sujo() && !confirm('A resposta desta etapa tem mudanças não salvas. Sair sem salvar?')) return; sel = n; roteiro(); }
  async function salvar(n, estado, forcar, forcarSoc) {
    const body = { n, resposta: $('esttResp').value, responsavel: $('esttResp2').value, data: $('esttData').value || null, motores: lerMotores(), estado, forcar: !!forcar, forcar_socios: !!forcarSoc };
    if (estado === 'validada' && !confirm(`Validar a resposta da etapa ${n}?\n\nResposta validada passa a orientar o ATLAS, o NORTE e o comitê.`)) return;
    try { const r = await api('roteiro_salvar', body); D.roteiro = r.roteiro; D.status = r.status; if (r.socios) D.socios = r.socios; nota(estado === 'validada' ? 'Etapa ' + n + ' validada' : 'Rascunho salvo'); desenhar(); }
    catch (e) {
      if (e.codigo === 'ORDEM_INICIAR') { if (confirm(e.message + '\n\nOK = começar esta etapa mesmo assim (fica marcada "fora de ordem").')) return salvar(n, estado, true, forcarSoc); return; }
      if (e.codigo === 'SOCIOS_INICIAR') { if (confirm(e.message + '\n\nOK = começar mesmo assim (a validação continua travada até alinhar os sócios).')) return salvar(n, estado, forcar, true); return; }
      nota(e.message, 'error');
    }
  }
  async function sugerir(n) {
    const b = $('esttBtSug'); if (b) { b.disabled = true; b.textContent = '⏳ ATLAS pensando com os números…'; }
    try { sug[n] = await api('roteiro_sugerir', { n }); } catch (e) { nota(e.message, 'error'); }
    if (sel === n && sub === 'roteiro') { const keep = { r: $('esttResp')?.value, p: $('esttResp2')?.value, d: $('esttData')?.value, m: lerMotores() }; roteiro(); restaurar(keep); }
  }
  function restaurar(k) { if ($('esttResp') && k.r != null) $('esttResp').value = k.r; if ($('esttResp2') && k.p != null) $('esttResp2').value = k.p; if ($('esttData') && k.d != null) $('esttData').value = k.d; if (k.m) Object.entries(k.m).forEach(([x, v]) => { const s = $('esttM_' + x); if (s) s.value = v; }); }
  function usarSug(n, somar) { const t = $('esttResp'); if (!t || !sug[n]) return; t.value = somar && t.value.trim() ? t.value.trim() + '\n\n' + sug[n].sugestao : sug[n].sugestao; t.focus(); nota('Texto no campo — revise e clique em 💾 Salvar rascunho'); }
  function descartarSug(n) { delete sug[n]; const k = { r: $('esttResp')?.value, p: $('esttResp2')?.value, d: $('esttData')?.value, m: lerMotores() }; roteiro(); restaurar(k); }

  // ── ✖ o que NÃO fazer ──
  let nfEdit = null;
  function naoFazer() {
    const L = D.nao_fazer || [], x = nfEdit ? L.find(i => i.id === nfEdit) || {} : {};
    $('esttCorpo').innerHTML = `<div class="panel" style="margin-bottom:10px;"><div class="pb">
        <div style="font-size:11.5px;color:var(--t2);line-height:1.55;">Estratégia é escolher: dizer <b>sim</b> a um caminho e <b>não</b> aos outros. Cada "não" fica registrado com data e motivo. A <b>Esteira de Demandas</b> mostra um aviso quando uma demanda parece contrariar um "não" — o aviso não bloqueia, você decide.</div>
        <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:8px;margin-top:10px;" class="est-grid">
          <div><label class="fl" for="nfTexto">O que a Atlantyx NÃO vai fazer</label><input class="fi" id="nfTexto" value="${esc(x.texto || '')}" placeholder="ex.: Não vender alocação abaixo de 15% de margem"></div>
          <div><label class="fl" for="nfMotor">Motor</label><select class="fsel" id="nfMotor"><option value="geral">Geral</option>${Object.entries(D.motores).map(([k, t]) => `<option value="${k}" ${x.motor === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
          <div><label class="fl" for="nfMotivo">Motivo</label><input class="fi" id="nfMotivo" value="${esc(x.motivo || '')}" placeholder="por que esta renúncia"></div>
          <div><label class="fl" for="nfPalavras">Palavras-chave para o aviso (vírgula)</label><input class="fi" id="nfPalavras" value="${esc((x.palavras || []).join(', '))}" placeholder="ex.: body shop, hora técnica"></div></div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;"><button class="btn btn-p" onclick="ESTT.nfSalvar()">${nfEdit ? '💾 Salvar alteração' : '＋ Registrar "não"'}</button>${nfEdit ? '<button class="btn btn-g" onclick="ESTT.nfEditar(null)">Cancelar</button>' : ''}<button class="btn btn-g" onclick="ESTT.nfImportar()" title="Traz os itens de 'O que NÃO fazer' da síntese do plano vigente (Sala de Estratégia)">⤵ Trazer do plano vigente</button></div></div></div>
      <div class="panel" style="margin-bottom:10px;"><div class="pb">${L.length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;"><tr style="color:var(--t2);text-align:left;"><th style="padding:4px;">Não vamos…</th><th style="padding:4px;">Motivo</th><th style="padding:4px;">Motor</th><th style="padding:4px;">Desde</th><th style="padding:4px;">Ativo</th><th></th></tr>
        ${L.map(i => `<tr style="border-top:1px solid var(--bd);${i.ativo ? '' : 'opacity:.5;'}"><td style="padding:5px 4px;">✖ ${esc(i.texto)}${i.palavras.length ? `<div style="font-size:9.5px;color:var(--t3);">chaves: ${esc(i.palavras.join(', '))}</div>` : ''}${i.origem ? `<div style="font-size:9.5px;color:var(--t3);">${esc(i.origem)}</div>` : ''}</td><td style="padding:5px 4px;color:var(--t2);">${esc(i.motivo || '—')}</td><td style="padding:5px 4px;">${esc(i.motor === 'geral' ? 'Geral' : D.motores[i.motor])}</td><td style="padding:5px 4px;white-space:nowrap;">${dataBR(i.data)}</td>
          <td style="padding:5px 4px;"><input type="checkbox" ${i.ativo ? 'checked' : ''} onchange="ESTT.nfAtivo('${i.id}',this.checked)" aria-label="ativo"></td><td style="padding:5px 4px;white-space:nowrap;"><button class="btn btn-g" style="font-size:10px;" onclick="ESTT.nfEditar('${i.id}')">✎</button> <button class="btn btn-g" style="font-size:10px;" onclick="ESTT.nfRemover('${i.id}')">🗑</button></td></tr>`).join('')}</table></div>`
        : '<div style="font-size:12px;color:var(--t3);">Nenhum "não" registrado ainda.</div>'}</div></div>
      <div class="panel"><div class="pb"><b style="font-size:12.5px;">Testar uma demanda</b><div style="font-size:10.5px;color:var(--t3);">É a mesma checagem que a Esteira faz.</div>
        <textarea class="fta" id="nfTeste" style="min-height:60px;font-size:12px;margin-top:6px;" placeholder="Cole o título e a proposta de uma demanda"></textarea>
        <button class="btn btn-g" style="margin-top:6px;" onclick="ESTT.nfTestar()">🔎 Checar contra os "nãos"</button><div id="nfRes" style="margin-top:6px;font-size:11.5px;"></div></div></div>`;
  }
  async function nfGravar(body, msg) { try { const r = await api('nao_fazer_salvar', body); D.nao_fazer = r.nao_fazer; nfEdit = null; nota(msg); desenhar(); } catch (e) { nota(e.message, 'error'); } }
  function nfSalvar() { const item = { id: nfEdit || undefined, texto: $('nfTexto').value, motivo: $('nfMotivo').value, motor: $('nfMotor').value, palavras: $('nfPalavras').value };
    if (!item.texto.trim()) return nota('Escreva o que a Atlantyx NÃO vai fazer', 'error'); nfGravar({ item }, nfEdit ? 'Alterado' : '"Não" registrado'); }
  function nfEditar(id) { nfEdit = id; naoFazer(); $('nfTexto')?.focus(); }
  function nfAtivo(id, v) { const x = (D.nao_fazer || []).find(i => i.id === id); if (x) nfGravar({ item: { ...x, ativo: v } }, v ? 'Reativado' : 'Desativado'); }
  function nfRemover(id) { if (confirm('Remover este "não" da lista?')) nfGravar({ remover: id }, 'Removido'); }
  async function nfImportar() { try { const r = await api('nao_fazer_importar_plano'); D.nao_fazer = r.nao_fazer; nota(r.importados + ' item(ns) trazido(s) do plano vigente'); desenhar(); } catch (e) { nota(e.message, 'error'); } }
  async function nfTestar() { const t = $('nfTeste').value; if (!t.trim()) return; try { const r = await api('nao_fazer_checar', { texto: t }); $('nfRes').innerHTML = r.conflitos.length ? r.conflitos.map(c => `<div style="color:var(--gold);margin-bottom:3px;">⚠ Parece contrariar: <b>${esc(c.texto)}</b> <span style="color:var(--t3);">(termos: ${esc(c.termos.join(', '))} · ${esc(c.forca)})</span></div>`).join('') : '<span style="color:var(--green,#22d3a3);">✔ Nenhum "não" parece contrariado.</span>'; } catch (e) { nota(e.message, 'error'); } }

  // ── 📅 calendário de revisão ──
  const CORST = { feito: 'var(--green,#22d3a3)', atrasado: 'var(--red)', proximo: 'var(--gold)', futuro: 'var(--t3)' }, TXST = { feito: 'feito', atrasado: 'atrasado', proximo: 'em breve', futuro: 'previsto' };
  const ICO = { revisao_anual: '🧭', orcamento_aprovacao: '💰', orcamento_revisao: '🔁', checkin: '📊' };
  let calAno = null;
  async function calendario() {
    if (!CAL) { $('esttCorpo').innerHTML = '<div style="padding:20px;color:var(--t3);font-size:11px;">Carregando o calendário…</div>'; try { CAL = await api('revisao_calendario'); } catch (e) { $('esttCorpo').innerHTML = `<div style="color:var(--red);font-size:12px;">${esc(e.message)}</div>`; return; } }
    const C = CAL.calendario, anos = [...new Set(C.eventos.map(e => e.data.substring(0, 4)))]; calAno = calAno || (C.proximo?.data || anos[0]).substring(0, 4);
    const ev = C.eventos.filter(e => e.data.startsWith(calAno)), G = C.gatilhos;
    $('esttCorpo').innerHTML = `${C.revisao_antecipada ? `<div style="border:1px solid var(--red);background:rgba(255,80,80,.07);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;">⚠ <b>Revisão antecipada recomendada</b> — há ${G.filter(g => !g.resolvido).length} gatilho(s) em aberto abaixo.</div>` : ''}
      <div class="panel" style="margin-bottom:10px;"><div class="pb" style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;line-height:1.6;">
        <div style="flex:1;min-width:220px;"><b>Próximo marco:</b> ${C.proximo ? `${ICO[C.proximo.tipo]} ${esc(C.proximo.titulo)} · ${dataBR(C.proximo.data)} (${C.proximo.dias === 0 ? 'hoje' : 'em ' + C.proximo.dias + ' dias'})` : '—'}${C.atrasados ? `<br><span style="color:var(--red);">${C.atrasados} marco(s) atrasado(s)</span>` : ''}</div>
        <div style="flex:1;min-width:220px;color:var(--t2);">🧭 Revisão estratégica: ${esc(C.regras.revisao_anual)}<br>💰 Orçamento: ${esc(C.regras.orcamento)}<br>📊 Check-ins: ${esc(C.regras.checkins)}</div></div></div>
      <div class="seg" style="margin-bottom:8px;">${anos.map(a => `<button class="${a === calAno ? 'on' : ''}" onclick="ESTT.calAno('${a}')">${a}</button>`).join('')}</div>
      <div class="panel" style="margin-bottom:10px;"><div class="pb">${ev.map(e => `<div style="border-top:1px solid var(--bd);padding:8px 2px;display:flex;gap:10px;align-items:flex-start;">
          <input type="checkbox" ${e.feito ? 'checked' : ''} onchange="ESTT.calFeito('${e.id}',this.checked)" aria-label="feito" style="margin-top:3px;">
          <div style="flex:1;min-width:0;"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span style="font-family:var(--M);font-size:10.5px;color:var(--t2);">${dataBR(e.data)}</span><b style="font-size:12px;">${ICO[e.tipo]} ${esc(e.titulo)}</b>${chip(TXST[e.status], CORST[e.status])}${e.realizado_em ? `<span style="font-size:10px;color:var(--t3);">feito em ${dataBR(e.realizado_em)}</span>` : ''}</div>
            <div style="font-size:11px;color:var(--t2);margin-top:2px;">${esc(e.descricao)}</div>
            ${e.checklist ? `<div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:5px;">${e.checklist.map(c => `<label style="font-size:11px;display:flex;gap:4px;align-items:center;cursor:pointer;"><input type="checkbox" ${c.ok ? 'checked' : ''} onchange="ESTT.calCheck('${e.id}','${c.chave}',this.checked)">${esc(c.texto)}</label>`).join('')}</div>` : ''}
            <details style="margin-top:4px;"${e.notas ? ' open' : ''}><summary style="font-size:10.5px;color:var(--t3);cursor:pointer;">notas</summary><textarea class="fta" style="min-height:44px;font-size:11.5px;margin-top:4px;" onchange="ESTT.calNotas('${e.id}',this.value)">${esc(e.notas)}</textarea></details></div></div>`).join('')}</div></div>
      <div class="panel"><div class="pb"><b style="font-size:12.5px;">Gatilhos de revisão antecipada</b><div style="font-size:10.5px;color:var(--t3);">Registre quando acontecer: ${Object.values(CAL.gatilhos_tipos).filter(x => x !== 'Outro').join(' · ')}.</div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) auto;gap:6px;margin-top:6px;align-items:end;" class="est-grid">
          <div><label class="fl" for="gtTipo">Tipo</label><select class="fsel" id="gtTipo">${Object.entries(CAL.gatilhos_tipos).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
          <div><label class="fl" for="gtDesc">O que aconteceu</label><input class="fi" id="gtDesc" placeholder="descreva sem dados sensíveis"></div>
          <button class="btn btn-g" onclick="ESTT.gatilho()">＋ Registrar</button></div>
        ${G.length ? G.map(g => `<div style="border-top:1px solid var(--bd);padding:6px 2px;font-size:11.5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><span style="font-family:var(--M);font-size:10.5px;color:var(--t2);">${dataBR(g.data)}</span><b>${esc(CAL.gatilhos_tipos[g.tipo])}</b><span style="flex:1;min-width:160px;">${esc(g.descricao)}</span>${g.resolvido ? `<span style="color:var(--green,#22d3a3);font-size:10.5px;">✔ ${esc(g.decisao || 'resolvido')}</span>` : `<button class="btn btn-g" style="font-size:10px;" onclick="ESTT.gatilhoResolver('${g.id}')">Registrar decisão</button>`}</div>`).join('') : '<div style="font-size:11px;color:var(--t3);margin-top:6px;">Nenhum gatilho registrado.</div>'}</div></div>`;
  }
  async function calSalvar(body, msg) { try { const r = await api('revisao_calendario_salvar', body); CAL.calendario = r.calendario; if (msg) nota(msg); calendario(); } catch (e) { nota(e.message, 'error'); calendario(); } }
  function calFeito(id, v) { calSalvar({ evento_id: id, feito: v }, v ? 'Marco concluído' : 'Marco reaberto'); }
  function calCheck(id, k, v) { calSalvar({ evento_id: id, checklist: { [k]: v } }); }
  function calNotas(id, v) { calSalvar({ evento_id: id, notas: v }, 'Notas salvas'); }
  function gatilho() { const d = $('gtDesc').value.trim(); if (!d) return nota('Descreva o que aconteceu', 'error'); calSalvar({ gatilho: { tipo: $('gtTipo').value, descricao: d } }, 'Gatilho registrado'); }
  function gatilhoResolver(id) { const d = prompt('Qual foi a decisão? (ex.: revisão feita em dd/mm, estratégia mantida)'); if (d == null) return; calSalvar({ gatilho_resolver: { id, decisao: d } }, 'Decisão registrada'); }

  // ── 💰 orçamento semestral ──
  async function orcamento(semestre) {
    $('esttCorpo').innerHTML = '<div style="padding:20px;color:var(--t3);font-size:11px;">Carregando o orçamento e o realizado do financeiro (pode levar alguns segundos)…</div>';
    try { ORC = await api('orcamento_obter', { semestre: semestre || ORC?.semestre }); } catch (e) { $('esttCorpo').innerHTML = `<div style="color:var(--red);font-size:12px;">${esc(e.message)}</div>`; return; }
    orcDesenhar();
  }
  function orcDesenhar(usarSug) {
    const O = ORC, o = usarSug ? O.sugerido : (O.orcamento || O.sugerido || { previsto: { receita: {}, mc_pct: {} }, realizado_manual: {} }), P = o.previsto, Re = O.realizado || {}, M = O.motores;
    const st = O.orcamento?.status || 'sem orçamento', stc = { aprovado: 'var(--green,#22d3a3)', revisado: 'var(--blue)', rascunho: 'var(--gold)' }[st] || 'var(--t3)';
    const atg = (r, p) => r != null && p ? Math.round(r / p * 100) + '%' : '—';
    const inp = (id, v, pct) => `<input class="fi" id="${id}" inputmode="decimal" style="max-width:130px;" value="${v == null ? '' : esc(pct ? String(v).replace('.', ',') : Math.round(v).toLocaleString('pt-BR'))}">`;
    const totP = Object.keys(M).reduce((s, k) => s + (Number(P.receita?.[k]) || 0), 0), totR = Re.receita ? Object.values(Re.receita).reduce((s, v) => s + v, 0) : null;
    $('esttCorpo').innerHTML = `<div class="panel"><div class="pb">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><select class="fsel" id="orcSem" style="width:auto;" onchange="ESTT.orcSem(this.value)">${O.semestres.map(s => `<option value="${s.id}" ${s.id === O.semestre ? 'selected' : ''}>${s.id.replace('-S', ' · ')}º semestre${s.status ? ' · ' + s.status : ''}</option>`).join('')}</select>
        ${chip(st, stc)}${O.orcamento?.aprovado_em ? `<span style="font-size:10.5px;color:var(--t3);">aprovado ${esc(quando(O.orcamento.aprovado_em))}</span>` : ''}${O.orcamento?.revisado_em ? `<span style="font-size:10.5px;color:var(--t3);">revisado ${esc(quando(O.orcamento.revisado_em))}</span>` : ''}
        <span style="flex:1;"></span>${O.sugerido ? `<button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.orcSug()" title="${esc(O.sugerido.origem)}">⤵ Preencher com a projeção</button>` : ''}</div>
      <div style="font-size:11px;color:var(--t2);margin-top:6px;line-height:1.55;">O semestre permite realocar sem mudar a direção de 5 anos. Aprovação em <b>dezembro</b> (1º semestre) e revisão em <b>junho</b> (2º semestre). ${usarSug || !O.orcamento ? `<span style="color:var(--gold);">Valores ${O.orcamento ? 'da projeção' : 'sugeridos pela projeção'} — revise e salve.</span>` : ''}</div>
      <div style="overflow-x:auto;margin-top:8px;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;"><tr style="color:var(--t2);text-align:left;"><th style="padding:4px;">Motor</th><th style="padding:4px;">Receita prevista</th><th style="padding:4px;">MC prevista %</th><th style="padding:4px;">Receita realizada${Re.ate ? ' (até ' + dataBR(Re.ate) + ')' : ''}</th><th style="padding:4px;">MC realizada %</th><th style="padding:4px;">Atingido</th></tr>
        ${Object.entries(M).map(([k, t]) => `<tr style="border-top:1px solid var(--bd);"><td style="padding:5px 4px;">${esc(t)}</td><td style="padding:5px 4px;">${inp('orcR_' + k, P.receita?.[k])}</td><td style="padding:5px 4px;">${inp('orcM_' + k, P.mc_pct?.[k], true)}</td>
          <td style="padding:5px 4px;font-family:var(--M);">${Re.receita ? R$(Re.receita[k]) : '—'}</td><td style="padding:5px 4px;font-family:var(--M);">${Re.mc_pct?.[k] != null ? Re.mc_pct[k] + '%' : '—'}</td><td style="padding:5px 4px;font-family:var(--M);">${Re.receita ? atg(Re.receita[k], P.receita?.[k]) : '—'}</td></tr>`).join('')}
        <tr style="border-top:2px solid var(--bd2);font-weight:700;"><td style="padding:5px 4px;">Total</td><td style="padding:5px 4px;font-family:var(--M);">${R$(totP)}</td><td></td><td style="padding:5px 4px;font-family:var(--M);">${totR != null ? R$(totR) : '—'}</td><td></td><td style="padding:5px 4px;font-family:var(--M);">${totR != null ? atg(totR, totP) : '—'}</td></tr></table></div>
      ${Re.futuro ? '<div style="font-size:10.5px;color:var(--t3);margin-top:4px;">Semestre ainda não começou — o realizado aparece quando ele começar.</div>' : Re.erro ? `<div style="font-size:10.5px;color:var(--gold);margin-top:4px;">⚠ Realizado indisponível agora: ${esc(Re.erro)}</div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:12px;font-size:11.5px;">
        <div><label class="fl" for="orcCaixa">Caixa mínimo previsto (R$)</label>${inp('orcCaixa', P.caixa_minimo)}<div style="color:var(--t3);font-size:10.5px;margin-top:2px;">caixa hoje: ${R$(O.caixa_atual)}</div></div>
        <div><label class="fl" for="orcMkt">Verba de marketing prevista (R$)</label>${inp('orcMkt', P.verba_marketing)}<label class="fl" for="orcMktR" style="margin-top:4px;">realizada</label>${inp('orcMktR', o.realizado_manual?.verba_marketing)}</div>
        <div><label class="fl" for="orcCont">Contratações previstas (pessoas)</label>${inp('orcCont', P.contratacoes)}<label class="fl" for="orcContR" style="margin-top:4px;">realizadas</label>${inp('orcContR', o.realizado_manual?.contratacoes)}</div></div>
      <label class="fl" for="orcNotas" style="margin-top:10px;">Notas (o que realocar e por quê)</label><textarea class="fta" id="orcNotas" style="min-height:60px;font-size:12px;">${esc(o.notas || '')}</textarea>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;"><button class="btn btn-g" onclick="ESTT.orcSalvar()">💾 Salvar</button><button class="btn btn-p" onclick="ESTT.orcSalvar('aprovar')">✅ Aprovar orçamento</button>${O.orcamento && O.orcamento.status !== 'rascunho' ? `<button class="btn btn-g" onclick="ESTT.orcSalvar('revisar')">🔁 Registrar revisão de junho</button>` : ''}</div>
      </div></div>`;
  }
  async function orcSalvar(acao) {
    const M = ORC.motores, g = id => nBR($(id)?.value);
    const orcamento = { previsto: { receita: Object.fromEntries(Object.keys(M).map(k => [k, g('orcR_' + k)])), mc_pct: Object.fromEntries(Object.keys(M).map(k => [k, g('orcM_' + k)])), caixa_minimo: g('orcCaixa'), verba_marketing: g('orcMkt'), contratacoes: g('orcCont') },
      realizado_manual: { verba_marketing: g('orcMktR'), contratacoes: g('orcContR') }, notas: $('orcNotas').value, origem: ORC.orcamento?.origem || ORC.sugerido?.origem || '' };
    if (acao === 'aprovar' && !confirm(`Aprovar o orçamento de ${ORC.semestre.replace('-S', ' · ')}º semestre?`)) return;
    try { const r = await api('orcamento_salvar', { semestre: ORC.semestre, orcamento, acao }); const real = ORC.realizado; ORC = { ...r, realizado: real }; nota(acao === 'aprovar' ? 'Orçamento aprovado' : acao === 'revisar' ? 'Revisão registrada' : 'Orçamento salvo'); orcDesenhar(); } catch (e) { nota(e.message, 'error'); }
  }

  // ── 👥 sócios, quatro cadeiras e exercício pessoal (v3.342) ──
  let SO = null, socEd = null, cadEd = null, pesEd = null;
  async function socios(recarregar) {
    if (!SO || recarregar) { $('esttCorpo').innerHTML = '<div style="padding:20px;color:var(--t3);font-size:11px;">Carregando…</div>';
      try { SO = await api('socios_obter'); socEd = JSON.parse(JSON.stringify(SO.socios.socios)); cadEd = JSON.parse(JSON.stringify(SO.cadeiras)); } catch (e) { $('esttCorpo').innerHTML = `<div style="color:var(--red);font-size:12px;">${esc(e.message)}</div>`; return; } }
    socDesenhar();
  }
  const STC = { alinhado: 'var(--green,#22d3a3)', travada: 'var(--red)', incompleto: 'var(--gold)', sem_socios: 'var(--t3)' };
  function socDesenhar() {
    const st = SO.status, O = SO.opcoes, Cp = SO.campos, sel = (i, k) => `<select class="fsel" style="font-size:11.5px;" onchange="ESTT.socCampo(${i},'${k}',this.value)"><option value="">—</option>${Object.entries(O[k]).map(([v, t]) => `<option value="${v}" ${socEd[i][k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const linha = (rot, cel) => `<tr style="border-top:1px solid var(--bd);"><td style="padding:5px 4px;color:var(--t2);font-size:11px;min-width:150px;">${rot}</td>${socEd.map((s, i) => `<td style="padding:5px 4px;min-width:190px;vertical-align:top;">${cel(i)}</td>`).join('')}</tr>`;
    const div = st.divergencias;
    const C = cadEd, CD = SO.cadeiras_def, P = pesEd || SO.pessoal || {};
    $('esttCorpo').innerHTML = `
      <div style="border:1px solid ${STC[st.status]};border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><b style="color:${STC[st.status]};">${st.status === 'travada' ? '⛔' : st.status === 'alinhado' ? '✔' : '●'} ${esc(st.mensagem)}</b><span style="color:var(--t2);font-size:11px;">A ordem do método começa pelos sócios: o que cada um quer da empresa muda o que a estratégia pode escolher. As metas (etapas 7 a 11) só se validam com os sócios alinhados.</span></div>
      <div class="panel" style="margin-bottom:10px;"><div class="pb">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><b style="font-size:13px;">Sócios lado a lado</b><span style="font-size:10.5px;color:var(--t3);">você registra pelo que cada sócio disse — só você vê esta tela</span><span style="flex:1;"></span>
          <label style="font-size:11px;">Última conversa de sócios <input class="fi" type="date" id="socConv" style="width:auto;display:inline-block;" value="${esc(SO.socios.ultima_conversa || '')}"></label>
          <button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.socAdd()">＋ Sócio</button><button class="btn btn-p" style="font-size:10.5px;" onclick="ESTT.socSalvar()">💾 Salvar sócios</button></div>
        ${socEd.length ? `<div style="overflow-x:auto;margin-top:8px;"><table style="border-collapse:collapse;font-size:11.5px;width:100%;">
          ${linha('Nome', i => `<div style="display:flex;gap:4px;"><input class="fi" value="${esc(socEd[i].nome)}" oninput="ESTT.socCampo(${i},'nome',this.value)" placeholder="nome do sócio"><button class="btn btn-g" style="font-size:10px;" title="remover" onclick="ESTT.socDel(${i})">🗑</button></div>`)}
          ${linha(Cp.quer_3a5, i => `<textarea class="fta" style="min-height:64px;font-size:11.5px;" oninput="ESTT.socCampo(${i},'quer_3a5',this.value)">${esc(socEd[i].quer_3a5)}</textarea>`)}
          ${['papel', 'fase', 'risco', 'dinheiro', 'equipe', 'resultado', 'dedicacao'].map(k => linha(Cp[k], i => sel(i, k) + (k === 'fase' ? `<input class="fi" style="font-size:11px;margin-top:3px;" placeholder="nota (opcional)" value="${esc(socEd[i].fase_nota)}" oninput="ESTT.socCampo(${i},'fase_nota',this.value)">` : ''))).join('')}
          ${linha(Cp.horizonte_anos, i => `<input class="fi" inputmode="numeric" style="max-width:90px;" value="${socEd[i].horizonte_anos ?? ''}" oninput="ESTT.socCampo(${i},'horizonte_anos',this.value)">`)}
        </table></div>` : '<div style="font-size:12px;color:var(--t3);margin-top:8px;">Nenhum sócio cadastrado. Comece por você.</div>'}
        <div style="font-size:10px;color:var(--t3);margin-top:6px;">Divergências são recalculadas ao salvar.</div></div></div>
      <div class="panel" style="margin-bottom:10px;"><div class="pb"><b style="font-size:13px;">Detector de divergência</b>
        ${div.length ? div.map(d => `<div style="border-top:1px solid var(--bd);padding:7px 2px;font-size:11.5px;">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${chip(d.nivel === 'alta' ? 'forte' : 'atenção', d.nivel === 'alta' ? 'var(--red)' : 'var(--gold)')}<b>${esc(d.socios.join(' × '))}</b><span>${esc(d.texto)}</span>${d.resolvida ? chip('acordo registrado', 'var(--green,#22d3a3)') : ''}</div>
          ${d.resolvida ? `<div style="margin-top:3px;color:var(--t2);">🤝 ${esc(d.acordo.texto)} <a href="#" style="font-size:10px;" onclick="event.preventDefault();ESTT.socAcordo('${d.chave}',true)">desfazer</a></div>`
            : d.nivel === 'alta' ? `<div style="display:flex;gap:6px;margin-top:4px;"><input class="fi" id="ac_${d.chave.replace(/[^a-z0-9]/gi, '_')}" placeholder="O que os sócios combinaram para destravar (ex.: reinvestir 70% até 2028, depois rever)"><button class="btn btn-g" style="font-size:10.5px;white-space:nowrap;" onclick="ESTT.socAcordo('${d.chave}')">🤝 Registrar acordo</button></div>` : ''}</div>`).join('')
          : `<div style="font-size:11.5px;color:var(--t3);margin-top:6px;">${socEd.length > 1 ? 'Nenhuma divergência entre os sócios cadastrados.' : 'Com dois ou mais sócios, as respostas são comparadas aqui.'}</div>`}</div></div>
      <div class="panel" style="margin-bottom:10px;"><div class="pb"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><b style="font-size:13px;">As quatro cadeiras do fundador</b><span style="font-size:10.5px;color:var(--t3);">qual você ocupa hoje, qual deveria ocupar em 12 meses e o que delega</span><span style="flex:1;"></span><button class="btn btn-p" style="font-size:10.5px;" onclick="ESTT.cadSalvar()">💾 Salvar cadeiras</button></div>
        ${SO.cadeiras_alertas.map(a => `<div style="font-size:11px;color:var(--gold);margin-top:4px;">⚠ ${esc(a)}</div>`).join('')}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:8px;">${Object.entries(CD).map(([k, c]) => `<div style="border:1px solid ${C.hoje === k || C.deveria_12m === k ? 'var(--blue)' : 'var(--bd)'};border-radius:8px;padding:8px;">
          <b style="font-size:12px;">${esc(c.nome)}</b><div style="font-size:10.5px;color:var(--t2);min-height:30px;">${esc(c.desc)}</div>
          <label style="font-size:11px;display:flex;gap:4px;align-items:center;margin-top:4px;"><input type="radio" name="cadHoje" ${C.hoje === k ? 'checked' : ''} onchange="ESTT.cadCampo('hoje','${k}')"> estou aqui hoje</label>
          <label style="font-size:11px;display:flex;gap:4px;align-items:center;"><input type="radio" name="cadMeta" ${C.deveria_12m === k ? 'checked' : ''} onchange="ESTT.cadCampo('deveria_12m','${k}')"> devo estar em 12 meses</label>
          <div style="display:flex;gap:6px;margin-top:4px;font-size:10.5px;color:var(--t2);align-items:center;">tempo hoje <input class="fi" inputmode="numeric" style="width:52px;" value="${C.tempo_hoje[k] ?? ''}" oninput="ESTT.cadTempo('tempo_hoje','${k}',this.value)">% · meta <input class="fi" inputmode="numeric" style="width:52px;" value="${C.tempo_meta[k] ?? ''}" oninput="ESTT.cadTempo('tempo_meta','${k}',this.value)">%</div></div>`).join('')}</div>
        <div style="margin-top:12px;display:flex;align-items:center;gap:8px;"><b style="font-size:12px;">Tudo o que eu faço e não deveria fazer</b><button class="btn btn-g" style="font-size:10.5px;" onclick="ESTT.cadItem()">＋ Item</button></div>
        ${C.itens.length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:4px;"><tr style="color:var(--t2);text-align:left;"><th style="padding:4px;">Atividade</th><th style="padding:4px;">Cadeira</th><th style="padding:4px;">Delegar para</th><th style="padding:4px;">Prazo</th><th style="padding:4px;">Status</th><th></th></tr>
          ${C.itens.map((x, i) => `<tr style="border-top:1px solid var(--bd);"><td style="padding:4px;"><input class="fi" value="${esc(x.texto)}" oninput="ESTT.cadItemCampo(${i},'texto',this.value)" placeholder="ex.: aprovar cada proposta comercial"></td>
            <td style="padding:4px;"><select class="fsel" onchange="ESTT.cadItemCampo(${i},'cadeira',this.value)">${Object.entries(CD).map(([k, c]) => `<option value="${k}" ${x.cadeira === k ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></td>
            <td style="padding:4px;"><input class="fi" value="${esc(x.para)}" oninput="ESTT.cadItemCampo(${i},'para',this.value)" placeholder="quem assume"></td><td style="padding:4px;"><input class="fi" type="date" value="${esc(x.prazo || '')}" onchange="ESTT.cadItemCampo(${i},'prazo',this.value)"></td>
            <td style="padding:4px;"><select class="fsel" onchange="ESTT.cadItemCampo(${i},'status',this.value)">${[['pendente', 'Pendente'], ['andamento', 'Em andamento'], ['delegado', 'Delegado ✔']].map(([v, t]) => `<option value="${v}" ${x.status === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
            <td style="padding:4px;"><button class="btn btn-g" style="font-size:10px;" onclick="ESTT.cadItemDel(${i})">🗑</button></td></tr>`).join('')}</table></div>` : '<div style="font-size:11px;color:var(--t3);margin-top:4px;">Liste o que ocupa o seu tempo e deveria estar com outra pessoa.</div>'}
        <label class="fl" for="cadObs" style="margin-top:8px;">Observações</label><textarea class="fta" id="cadObs" style="min-height:44px;font-size:11.5px;" oninput="ESTT.cadCampo('observacoes',this.value,true)">${esc(C.observacoes)}</textarea></div></div>
      <div class="panel"><div class="pb"><details ${SO.pessoal || pesEd ? 'open' : ''}><summary style="cursor:pointer;font-size:13px;font-weight:700;">🔒 Exercício pessoal (opcional, privado) — integrado ao NORTE</summary>
        <div style="font-size:11px;color:var(--t2);line-height:1.55;margin-top:6px;">Só é guardado se você clicar em <b>Salvar (privado)</b>, fica ligado ao seu login e nunca aparece para outro usuário. O NORTE só usa se você marcar a opção abaixo. ${SO.pessoal?.salvo_em ? 'Salvo em ' + esc(quando(SO.pessoal.salvo_em)) + '.' : 'Nada salvo.'}</div>
        <label class="fl" for="pesFun" style="margin-top:8px;">O que eu quero ouvir no meu funeral</label><textarea class="fta" id="pesFun" style="min-height:70px;font-size:12px;" oninput="ESTT.pesCampo('ouvir_no_funeral',this.value)">${esc(P.ouvir_no_funeral || '')}</textarea>
        <label class="fl" for="pesHor" style="margin-top:6px;">Horizonte de vida (ex.: quantos anos quero trabalhar com intensidade)</label><input class="fi" id="pesHor" value="${esc(P.horizonte_vida || '')}" oninput="ESTT.pesCampo('horizonte_vida',this.value)">
        <label class="fl" for="pesImp" style="margin-top:6px;">O que importa de verdade para mim nos próximos anos</label><textarea class="fta" id="pesImp" style="min-height:50px;font-size:12px;" oninput="ESTT.pesCampo('o_que_importa',this.value)">${esc(P.o_que_importa || '')}</textarea>
        <label style="font-size:11px;display:flex;gap:5px;align-items:center;margin-top:6px;cursor:pointer;"><input type="checkbox" id="pesNorte" ${P.usar_no_norte ? 'checked' : ''} onchange="ESTT.pesCampo('usar_no_norte',this.checked)"> o NORTE pode usar este exercício nas conversas e no plano de alinhamento</label>
        <div style="display:flex;gap:6px;margin-top:8px;"><button class="btn btn-p" onclick="ESTT.pesSalvar()">💾 Salvar (privado)</button>${SO.pessoal ? '<button class="btn btn-g" style="color:var(--red);" onclick="ESTT.pesApagar()">🗑 Apagar o que foi salvo</button>' : ''}</div></details></div></div>`;
  }
  function socCampo(i, k, v) { socEd[i][k] = v; }
  function socAdd() { socEd.push({ id: 's_' + Date.now().toString(36), nome: '', quer_3a5: '', fase_nota: '', horizonte_anos: null }); socDesenhar(); }
  function socDel(i) { if (!confirm('Remover ' + (socEd[i].nome || 'este sócio') + '? (só vale depois de salvar)')) return; socEd.splice(i, 1); socDesenhar(); }
  async function socSalvar() { try { SO = await api('socios_salvar', { socios: socEd, ultima_conversa: $('socConv')?.value || null }); socEd = JSON.parse(JSON.stringify(SO.socios.socios)); D.socios = SO.status; nota('Sócios salvos — ' + SO.status.mensagem); socDesenhar(); } catch (e) { nota(e.message, 'error'); } }
  async function socAcordo(chave, remover) {
    const texto = remover ? null : $('ac_' + chave.replace(/[^a-z0-9]/gi, '_'))?.value; if (remover && !confirm('Desfazer este acordo? A divergência volta a travar a estratégia.')) return;
    try { SO = await api('socios_acordo', { chave, texto, remover: !!remover }); D.socios = SO.status; nota(remover ? 'Acordo desfeito' : 'Acordo registrado'); socDesenhar(); } catch (e) { nota(e.message, 'error'); }
  }
  function cadCampo(k, v, semRedesenho) { cadEd[k] = v; if (!semRedesenho) socDesenhar(); }
  function cadTempo(k, c, v) { cadEd[k][c] = v === '' ? null : Number(v); }
  function cadItem() { cadEd.itens.push({ id: 'i' + Date.now().toString(36), texto: '', cadeira: 'operador', para: '', prazo: null, status: 'pendente' }); socDesenhar(); }
  function cadItemCampo(i, k, v) { cadEd.itens[i][k] = v; }
  function cadItemDel(i) { cadEd.itens.splice(i, 1); socDesenhar(); }
  async function cadSalvar() { try { SO = await api('cadeiras_salvar', { cadeiras: cadEd }); cadEd = JSON.parse(JSON.stringify(SO.cadeiras)); nota('Cadeiras salvas'); socDesenhar(); } catch (e) { nota(e.message, 'error'); } }
  function pesCampo(k, v) { pesEd = pesEd || { ...(SO.pessoal || {}) }; pesEd[k] = v; }
  async function pesSalvar() { pesEd = pesEd || { ...(SO.pessoal || {}) }; if (!['ouvir_no_funeral', 'horizonte_vida', 'o_que_importa'].some(k => String(pesEd[k] || '').trim())) return nota('Nada para salvar', 'error');
    try { const r = await api('pessoal_salvar', { pessoal: pesEd }); SO.pessoal = r.pessoal; pesEd = null; nota('Salvo — privado, só você vê'); socDesenhar(); } catch (e) { nota(e.message, 'error'); } }
  async function pesApagar() { if (!confirm('Apagar o exercício pessoal salvo? Não dá para desfazer.')) return; try { await api('pessoal_salvar', { apagar: true }); SO.pessoal = null; pesEd = null; nota('Apagado'); socDesenhar(); } catch (e) { nota(e.message, 'error'); } }

  window.ESTT = { render, regras: () => { regrasAbertas = !regrasAbertas; desenhar(); }, sub: k => { if (sub === 'roteiro' && k !== 'roteiro' && sujo() && !confirm('A resposta desta etapa tem mudanças não salvas. Sair sem salvar?')) return; sub = k; desenhar(); },
    etapa, salvar, sugerir, usarSug, descartarSug, nfSalvar, nfEditar, nfAtivo, nfRemover, nfImportar, nfTestar,
    calAno: a => { calAno = a; calendario(); }, calFeito, calCheck, calNotas, gatilho, gatilhoResolver,
    orcSem: s => orcamento(s), orcSug: () => orcDesenhar(true), orcSalvar, socCampo, socAdd, socDel, socSalvar, socAcordo, cadCampo, cadTempo, cadItem, cadItemCampo, cadItemDel, cadSalvar, pesCampo, pesSalvar, pesApagar, _estado: () => ({ D, CAL, ORC, SO }) };
})();
