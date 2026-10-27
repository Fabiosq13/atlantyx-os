// public/projecao-ui.js — v3.286 · PLANEJAMENTO › PROJEÇÃO 3 ANOS
// Premissas por motor de negócio (alocação, projetos, produtos) → DRE projetada dos próximos 3 anos em 3 cenários.
// Os números saem de lib/projecao-3anos.js no servidor; o ATLAS sugere premissas com os dados reais da empresa.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const R = v => v == null || isNaN(v) ? '—' : (v < 0 ? '−' : '') + 'R$ ' + Math.round(Math.abs(v)).toLocaleString('pt-BR');
  const Rk = v => { if (v == null || isNaN(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e6 ? s + 'R$ ' + (a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : s + 'R$ ' + Math.round(a / 1e3).toLocaleString('pt-BR') + ' mil'; };
  const P = v => v == null || isNaN(v) ? '—' : (+v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const nota = (t, c) => (window.toast ? toast(t, c || 'success') : alert(t));
  const MOT = { pessoas: 'Alocação de pessoas', projetos: 'Projetos', produtos: 'Produtos' };
  const COR = { pessimista: 'var(--red)', base: 'var(--blue)', otimista: 'var(--green,#22d3a3)' };
  const S = { d: null, prem: null, proj: null, cen: 'base', ia: null, t: null, sujo: false };
  async function api(action, body = {}, ms = 90000) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms);
    try { const r = await fetch('/api/estrategia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }), signal: ac.signal });
      const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status })); if (!d.success) throw new Error(d.error || 'falha'); return d; }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'O servidor demorou demais — tente de novo' : e.message); } finally { clearTimeout(tm); }
  }
  const ocupado = (b, t) => { if (!b) return () => {}; const o = b.innerHTML; b.disabled = true; b.innerHTML = t; return () => { b.disabled = false; b.innerHTML = o; }; };

  async function abrir(forcar) {
    const box = $('pjApp'); if (!box) return;
    if (!S.d || forcar) box.innerHTML = '<div class="panel"><div class="pb" style="color:var(--t3);font-size:12px;text-align:center;padding:30px;">⏳ Lendo o histórico, a carteira, os motores de negócio e as pessoas (QuickBooks, HubSpot e cadastros)…</div></div>';
    try { const d = await api('projecao_obter', { forcar: !!forcar }); S.d = d; S.prem = JSON.parse(JSON.stringify(d.premissas)); S.proj = d.projecao; S.ia = d.ia; S.sujo = false; render(); }
    catch (e) { box.innerHTML = '<div class="panel"><div class="pb" style="color:var(--red);font-size:12px;">Não consegui montar a projeção: ' + esc(e.message) + ' <button class="btn btn-g" onclick="PJ.abrir(true)">Tentar de novo</button></div></div>'; }
  }
  function render() {
    const d = S.d, B = d.base || {}, pr = S.prem, pj = S.proj, Rs = pj.resumo || {};
    const anos = pr.anos.map(a => a.ano), metas = B.metas_por_ano || {};
    const inp = (path, v, w = 62, title = '') => `<input class="fi" data-p="${path}" value="${v ?? ''}" title="${esc(title)}" style="width:${w}px;padding:4px 6px;font-size:11px;text-align:right;" oninput="PJ.mudou(this)"/>`;
    const lin = (rot, cel) => `<tr><td style="padding:4px 6px;font-size:11px;white-space:nowrap;">${rot}</td>${cel}</tr>`;
    const C = pj.cenarios[S.cen];
    const h = `<div class="cp-top" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
        <div style="flex:1;min-width:220px;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">📈 Projeção 3 anos</div>
          <div style="font-size:10.5px;color:var(--t2);">Ano-base ${pr.ano_base} (${esc(B.fonte?.receita || '')}) → ${anos.join(', ')} · por motor de negócio · três cenários${d.salvo_em ? ' · salva em ' + new Date(d.salvo_em).toLocaleString('pt-BR').substring(0, 16) : ' · ainda não salva'}</div></div>
        <button class="btn btn-g" onclick="PJ.abrir(true)" title="Relê QuickBooks, HubSpot e cadastros">↻ Dados</button>
        <button class="btn btn-g" onclick="nav('s1bp', document.querySelector('.sbi[onclick*=&quot;s1bp&quot;]'))" title="Abrir o Business Plan (detalhamento financeiro por ideia e da Atlantyx)">📊 Business Plan</button>
        <button class="btn btn-or" id="pjBtnIA" onclick="PJ.ia()">🤖 ATLAS sugere premissas</button>
        <button class="btn btn-p" id="pjBtnSalvar" onclick="PJ.salvar()">💾 Salvar${S.sujo ? ' *' : ''}</button>
        <button class="btn btn-gn" onclick="PJ.metas()" title="Grava o cenário base como metas de faturamento e margem dos 3 anos (Metas da Empresa)">🎯 Usar como metas</button></div>
      ${(B.erros || []).length ? `<div style="font-size:10.5px;color:var(--gold);margin-bottom:8px;">⚠ Dados parciais: ${esc(B.erros.join(' · '))}</div>` : ''}
      <div class="kg k5" style="margin-bottom:10px;">
        ${[['Receita-base ' + pr.ano_base, Rk(Rs.receita_base), 'realizado + fechamento previsto'], ['Receita ' + anos[2], Rk(Rs.receita_final), 'cenário base'], ['Crescimento ao ano (CAGR)', P(Rs.cagr_pct), 'cenário base'],
          ['Resultado ' + anos[2], Rk(Rs.resultado_final), 'margem ' + P(Rs.margem_final_pct)], ['Recorrente ' + anos[2], Rk(Rs.recorrente_final), 'receita recorrente no ano']].map(([k, v, s]) => `<div class="kpi bl"><div class="kl">${k}</div><div class="kv" style="font-size:19px;">${v}</div><div class="ks" style="font-size:10px;color:var(--t2);">${s}</div></div>`).join('')}</div>
      ${(pj.alertas || []).length ? `<div style="background:rgba(245,185,75,.08);border:1px solid rgba(245,185,75,.35);border-radius:8px;padding:8px 12px;font-size:11px;color:var(--gold);margin-bottom:10px;">⚠ ${pj.alertas.map(esc).join('<br>⚠ ')}</div>` : ''}
      <div class="panel"><div class="ph"><div class="pt">Resultado projetado</div><div class="seg" id="pjCen">${['pessimista', 'base', 'otimista'].map(c => `<button class="${S.cen === c ? 'on' : ''}" onclick="PJ.cenario('${c}')">${c}</button>`).join('')}</div></div><div class="pb">
        ${grafico(pj, anos, metas, B)}
        <div class="tw" style="margin-top:10px;"><table style="width:100%;min-width:640px;font-size:11px;"><thead><tr><th style="text-align:left;">${esc(S.cen)}</th>${(B.historico || []).slice(-2).map(x => `<th style="text-align:right;color:var(--t3);">${x.ano} real</th>`).join('')}<th style="text-align:right;color:var(--t3);">${pr.ano_base} base</th>${anos.map(a => `<th style="text-align:right;">${a}</th>`).join('')}</tr></thead><tbody>
          ${linhaTab('Receita total', l => '<b>' + R(l.receita) + '</b>', C, B, x => R(x.faturamento), R(pr.receita_base))}
          ${Object.keys(MOT).map(k => linhaTab('&nbsp;&nbsp;' + MOT[k], l => R(l.por_motor[k]), C, B, () => '', R(pr.receita_base * pr.mix_pct[k] / 100))).join('')}
          ${linhaTab('Margem de contribuição', l => R(l.mc) + ' <span style="color:var(--t3);">' + P(l.mc_pct) + '</span>', C, B, () => '', '')}
          ${linhaTab('Despesas fixas (estrutura)', l => R(l.despesas_fixas), C, B, () => '', R(pr.despesas_fixas_base))}
          ${linhaTab('Resultado', l => `<b style="color:${l.resultado < 0 ? 'var(--red)' : 'var(--green,#22d3a3)'};">${R(l.resultado)}</b> <span style="color:var(--t3);">${P(l.margem_pct)}</span>`, C, B, x => R(x.lucro) + ' <span style="color:var(--t3);">' + P(x.margem_pct) + '</span>', '')}
          ${linhaTab('Receita recorrente', l => R(l.recorrente) + ' <span style="color:var(--t3);">' + P(l.recorrencia_pct) + '</span>', C, B, () => '', '')}
          ${linhaTab('Pessoas (alocadas + estrutura)', l => l.pessoas_total ?? '—', C, B, () => '', B.pessoas ?? '—')}
          ${linhaTab('Caixa acumulado', l => `<span style="color:${l.caixa_acumulado < 0 ? 'var(--red)' : 'inherit'};">${R(l.caixa_acumulado)}</span>`, C, B, () => '', R(pr.caixa_inicial))}
          ${linhaTab('Meta cadastrada', l => metas[l.ano]?.faturamento && !metas[l.ano].padrao ? R(metas[l.ano].faturamento) : '<span style="color:var(--t3);">—</span>', C, B, () => '', metas[pr.ano_base]?.faturamento ? R(metas[pr.ano_base].faturamento) : '—')}
        </tbody></table></div></div></div>
      ${S.ia ? `<div class="panel" style="border-left:3px solid var(--or,#f97316);"><div class="ph"><div class="pt">🤖 Leitura do ATLAS</div></div><div class="pb" style="font-size:11.5px;line-height:1.7;white-space:pre-wrap;">${esc(S.ia.comentario || '')}${(S.ia.alavancas || []).length ? '\n\nAlavancas:\n• ' + S.ia.alavancas.map(esc).join('\n• ') : ''}</div></div>` : ''}
      <div class="panel"><div class="ph"><div class="pt">Premissas</div><span style="font-size:10px;color:var(--t2);">edite — o resultado recalcula na hora</span></div><div class="pb">
        <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;margin-bottom:10px;align-items:flex-end;">
          <label>Receita-base ${pr.ano_base}<br>${inp('receita_base', pr.receita_base, 110)}</label>
          <label>Despesas fixas/ano<br>${inp('despesas_fixas_base', pr.despesas_fixas_base ?? '', 110, 'Estrutura que não varia com a receita: administrativo, comercial, sistemas, sede')}</label>
          <label>Caixa inicial<br>${inp('caixa_inicial', pr.caixa_inicial, 100)}</label>
          <label>Conversão em caixa %<br>${inp('conversao_caixa_pct', pr.conversao_caixa_pct)}</label>
          <label>Receita/pessoa/mês<br>${inp('receita_por_pessoa_mes', pr.receita_por_pessoa_mes ?? '', 90, 'Receita mensal média de cada profissional alocado — define o quadro necessário')}</label>
          <label>Pessoas de estrutura<br>${inp('pessoas_estrutura', pr.pessoas_estrutura)}</label>
          <span>Mix de receita %: ${Object.keys(MOT).map(k => `${MOT[k].split(' ')[0]} ${inp('mix_pct.' + k, pr.mix_pct[k], 52)}`).join(' ')}</span></div>
        <div class="tw"><table style="min-width:560px;"><thead><tr><th style="text-align:left;font-size:10.5px;">Premissa</th>${anos.map(a => `<th style="font-size:10.5px;">${a}</th>`).join('')}</tr></thead><tbody>
          ${Object.keys(MOT).map(k => lin('Crescimento · ' + MOT[k] + ' (%)', pr.anos.map((a, i) => `<td style="text-align:center;">${inp(`anos.${i}.crescimento_pct.${k}`, a.crescimento_pct[k])}</td>`).join(''))).join('')}
          ${Object.keys(MOT).map(k => lin('Margem de contribuição · ' + MOT[k] + ' (%)', pr.anos.map((a, i) => `<td style="text-align:center;">${inp(`anos.${i}.mc_pct.${k}`, a.mc_pct[k])}</td>`).join(''))).join('')}
          ${lin('Crescimento das despesas fixas (%)', pr.anos.map((a, i) => `<td style="text-align:center;">${inp(`anos.${i}.despesas_fixas_cresc_pct`, a.despesas_fixas_cresc_pct)}</td>`).join(''))}
          ${lin('Receita recorrente (% da receita)', pr.anos.map((a, i) => `<td style="text-align:center;">${inp(`anos.${i}.recorrencia_pct`, a.recorrencia_pct)}</td>`).join(''))}
        </tbody></table></div>
        <div style="font-size:11px;margin-top:8px;">Cenários: pessimista = crescimento × ${inp('cenarios.pessimista.fator_crescimento', pr.cenarios.pessimista.fator_crescimento, 46)} e margem ${inp('cenarios.pessimista.delta_mc_pp', pr.cenarios.pessimista.delta_mc_pp, 46)} p.p. · otimista = crescimento × ${inp('cenarios.otimista.fator_crescimento', pr.cenarios.otimista.fator_crescimento, 46)} e margem ${inp('cenarios.otimista.delta_mc_pp', pr.cenarios.otimista.delta_mc_pp, 46)} p.p.</div>
        <div style="font-size:10px;color:var(--t3);margin-top:8px;line-height:1.6;">Base: ${esc(B.fonte?.mix || '')}; margem de contribuição por motor = receita − custo direto (QuickBooks, últimos 12 meses); despesas fixas = margem de contribuição − resultado do ano-base (margem líquida ${P(B.fonte?.margem_liquida_pct)}). Resultado = margem de contribuição − despesas fixas. Pessoas = receita de alocação ÷ receita por pessoa + estrutura.</div>
      </div></div>`;
    $('pjApp').innerHTML = h;
  }
  function linhaTab(rot, f, C, B, fh, base) {
    const hist = (B.historico || []).slice(-2);
    return `<tr><td style="padding:4px 6px;">${rot}</td>${hist.map(x => `<td style="text-align:right;padding:4px 6px;color:var(--t3);">${fh(x)}</td>`).join('')}<td style="text-align:right;padding:4px 6px;color:var(--t3);">${base}</td>${C.map(l => `<td style="text-align:right;padding:4px 6px;">${f(l)}</td>`).join('')}</tr>`;
  }
  function grafico(pj, anos, metas, B) {
    const hist = (B.historico || []).slice(-2).map(x => ({ ano: x.ano, v: x.faturamento })), base = { ano: S.prem.ano_base, v: S.prem.receita_base };
    const max = Math.max(1, ...hist.map(x => x.v || 0), base.v || 0, ...['pessimista', 'base', 'otimista'].flatMap(c => pj.cenarios[c].map(l => l.receita)), ...anos.map(a => metas[a]?.faturamento || 0));
    const W = 760, H = 220, pl = 10, pb = 26, col = (W - pl) / (hist.length + 1 + anos.length), y = v => 10 + (H - pb - 10) * (1 - v / max);
    let s = '';
    [...hist.map(x => ({ ...x, real: true })), { ...base, real: true, base: true }].forEach((x, i) => { const cx = pl + i * col; s += `<rect x="${cx + col * .3}" y="${y(x.v || 0)}" width="${col * .4}" height="${Math.max(0, H - pb - y(x.v || 0))}" rx="3" fill="var(--t3)" opacity="${x.base ? .8 : .5}"><title>${x.ano}: ${R(x.v)}</title></rect><text x="${cx + col / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--t2)">${x.ano}</text>`; });
    anos.forEach((a, j) => { const cx = pl + (hist.length + 1 + j) * col, bw = col * .22;
      ['pessimista', 'base', 'otimista'].forEach((c, k) => { const v = pj.cenarios[c][j].receita; s += `<rect x="${cx + col * .14 + k * bw * 1.05}" y="${y(v)}" width="${bw}" height="${Math.max(0, H - pb - y(v))}" rx="3" fill="${COR[c]}" opacity="${c === S.cen ? 1 : .45}"><title>${a} ${c}: ${R(v)}</title></rect>`; });
      const mt = metas[a]?.faturamento && !metas[a].padrao ? metas[a].faturamento : null; if (mt) s += `<line x1="${cx + col * .08}" x2="${cx + col * .92}" y1="${y(mt)}" y2="${y(mt)}" stroke="var(--gold)" stroke-width="2" stroke-dasharray="5 3"><title>Meta ${a}: ${R(mt)}</title></line>`;
      s += `<text x="${cx + col / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--t1)" font-weight="700">${a}</text>`; });
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-height:240px;">${s}</svg><div style="font-size:10px;color:var(--t2);display:flex;gap:14px;flex-wrap:wrap;"><span><b style="color:var(--t3);">■</b> realizado / ano-base</span><span><b style="color:var(--red);">■</b> pessimista</span><span><b style="color:var(--blue);">■</b> base</span><span><b style="color:var(--green,#22d3a3);">■</b> otimista</span><span><b style="color:var(--gold);">- -</b> meta cadastrada</span></div>`;
  }
  function setPath(o, path, v) { const ks = path.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]]; x[ks[ks.length - 1]] = v; }
  function mudou(el) {
    const t0 = String(el.value).trim(); const raw = /,/.test(t0) ? t0.replace(/\./g, '').replace(',', '.') : /^-?\d{1,3}(\.\d{3})+$/.test(t0) ? t0.replace(/\./g, '') : t0; // 1.234.567 · 12,5 · 0.5
    const v = raw === '' ? null : Number(raw); if (raw !== '' && !isFinite(v)) return;
    setPath(S.prem, el.dataset.p, v); S.sujo = true; clearTimeout(S.t);
    S.t = setTimeout(async () => { try { const d = await api('projecao_calcular', { premissas: S.prem }, 40000); S.proj = d.projecao; const foco = document.activeElement?.dataset?.p, pos = document.activeElement?.selectionStart; render();
      if (foco) { const e = document.querySelector(`[data-p="${foco}"]`); if (e) { e.focus(); try { e.setSelectionRange(pos, pos); } catch (_) {} } } } catch (e) { nota('Não recalculou: ' + e.message, 'error'); } }, 500);
  }
  function cenario(c) { S.cen = c; render(); }
  async function salvar() { const fim = ocupado($('pjBtnSalvar'), '💾 Salvando…'); try { const d = await api('projecao_salvar', { premissas: S.prem, ia: S.ia }); S.proj = d.projecao; S.sujo = false; S.d.salvo_em = new Date().toISOString(); render(); nota('Projeção salva — o ATLAS passa a usá-la nas conversas'); } catch (e) { nota('Erro: ' + e.message, 'error'); } fim(); }
  async function ia() {
    const pedido = prompt('O que o ATLAS deve considerar? (opcional)\nEx.: "quero dobrar a receita recorrente até 2029", "cenário conservador sem novas contratações"', '');
    if (pedido === null) return; const fim = ocupado($('pjBtnIA'), '🤖 ATLAS analisando (até 1 min)…');
    try { const d = await api('projecao_ia', { premissas: S.prem, pedido }, 120000); S.prem = d.premissas; S.proj = d.projecao; S.ia = { comentario: d.comentario, alavancas: d.alavancas, em: new Date().toISOString(), pedido }; S.sujo = true; render(); nota('Premissas sugeridas — revise e salve'); }
    catch (e) { nota('ATLAS: ' + e.message, 'error'); } fim();
  }
  async function metas() {
    if (S.sujo) return nota('Salve a projeção antes de usar como metas', 'error');
    const L = S.proj.cenarios.base; if (!confirm('Gravar o cenário BASE como metas da empresa?\n\n' + L.map(l => `${l.ano}: faturamento ${R(l.receita)} · margem ${P(l.margem_pct)}`).join('\n') + '\n\nAs metas desses anos em Metas da Empresa serão substituídas.')) return;
    try { const d = await api('projecao_para_metas', { anos: L.map(l => l.ano) }); nota('Metas gravadas: ' + d.feitos.map(f => f.ano).join(', ')); abrir(); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  window.PJ = { abrir, mudou, cenario, salvar, ia, metas };
})();
