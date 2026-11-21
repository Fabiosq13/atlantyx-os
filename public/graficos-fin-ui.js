// v3.570 — GRÁFICOS DO FINANCEIRO: fluxo de caixa meta × real e orçamento × real (linhas, sem biblioteca externa)
// Dados: api/financeiro.js grafico_caixa_meta e grafico_orcamento_real · contas em lib/graficos-fin.js
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const nf = (n, d = 0) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const R = v => v == null ? '—' : (v < 0 ? '-' : '') + 'R$ ' + nf(Math.abs(v));
  const RC = v => { if (v == null) return '—'; const a = Math.abs(v), s = v < 0 ? '-' : ''; return a >= 1e6 ? s + 'R$ ' + nf(a / 1e6, a >= 1e7 ? 0 : 1) + ' mi' : a >= 1e4 ? s + 'R$ ' + nf(a / 1e3) + ' mil' : s + 'R$ ' + nf(a); };
  const COR = { liq: 'var(--purple, #b48cff)', real: 'var(--green)', meta: 'var(--gold)', orcado: 'var(--blue)', minimo: 'var(--red)' };
  const S = { ano: new Date().getFullYear(), caixa: null, orc: null, vCaixa: 'mensal', vOrc: 'receitas', modoOrc: 'mensal', erro: {}, CH: {} };

  async function chamar(action, p) { return await finApi(action, p, { timeoutMs: 60000 }); }
  function abrir(forcar) {
    const b = $('gfApp'); if (!b) return;
    b.innerHTML = moldura(); S.caixa = S.orc = null; S.erro = {};
    const p = { ano: S.ano, ...(forcar ? { _forcar: true } : {}) };
    chamar('grafico_caixa_meta', p).then(d => { S.caixa = d; }).catch(e => { S.erro.caixa = e.message; }).finally(() => pinta('caixa'));
    chamar('grafico_orcamento_real', p).then(d => { S.orc = d; }).catch(e => { S.erro.orc = e.message; }).finally(() => pinta('orc'));
  }
  const moldura = () => '<div id="gfCaixa" class="gf-card"><div class="gf-load">Carregando o fluxo de caixa…</div></div><div id="gfOrc" class="gf-card"><div class="gf-load">Carregando o orçamento…</div></div>';

  // ── gráfico de linhas ────────────────────────────────────────────────────────────────────────────────────
  // series: [{ nome, v:[12], cor, tracejado, ancora:[12]?, fino }]  refs: [{ valor, rotulo, cor }]
  function linhas(id, meses, series, refs, idxAtual) {
    const W = 760, H = 300, mL = 66, mR = 18, mT = 14, mB = 30, iw = W - mL - mR, ih = H - mT - mB, n = meses.length;
    const todos = series.flatMap(s => s.v).concat((refs || []).map(r => r.valor)).filter(v => v != null);
    if (!todos.length) return '<div class="gf-vazio">Sem dados para este gráfico no ano.</div>';
    let lo = Math.min(0, ...todos), hi = Math.max(0, ...todos); if (hi === lo) hi = lo + 1;
    const passo = (() => { const bruto = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / mag; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag; })();
    lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo;
    const X = i => mL + (n === 1 ? iw / 2 : i * iw / (n - 1)), Y = v => mT + (hi - v) / (hi - lo) * ih;
    let g = '', t = '';
    for (let v = lo; v <= hi + passo / 2; v += passo) { const y = Y(v); g += '<line x1="' + mL + '" x2="' + (W - mR) + '" y1="' + y + '" y2="' + y + '" stroke="' + (Math.abs(v) < passo / 1000 ? 'var(--bd2)' : 'var(--bd)') + '"/><text x="' + (mL - 8) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="10" fill="var(--t2)">' + esc(RC(v)) + '</text>'; }
    meses.forEach((m, i) => { t += '<text x="' + X(i) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="10.5" fill="' + (i === idxAtual ? 'var(--t1)' : 'var(--t2)') + '" font-weight="' + (i === idxAtual ? 700 : 400) + '">' + MES[parseInt(m.substring(5, 7)) - 1] + '</text>'; });
    const hoje = idxAtual >= 0 ? '<line x1="' + X(idxAtual) + '" x2="' + X(idxAtual) + '" y1="' + mT + '" y2="' + (mT + ih) + '" stroke="var(--bd2)" stroke-dasharray="2 4"/>' : '';
    const refsSvg = (refs || []).map(r => '<line x1="' + mL + '" x2="' + (W - mR) + '" y1="' + Y(r.valor) + '" y2="' + Y(r.valor) + '" stroke="' + r.cor + '" stroke-dasharray="6 4" stroke-width="1.2" opacity=".8"/><text x="' + (W - mR - 2) + '" y="' + (Y(r.valor) - 4) + '" text-anchor="end" font-size="10" fill="' + r.cor + '">' + esc(r.rotulo) + '</text>').join('');
    const linhaSvg = s => {
      const pts = []; s.v.forEach((v, i) => { if (v != null) pts.push([i, v]); });
      if (s.ancora) { const j = s.v.findIndex(v => v != null); if (j > 0 && s.ancora[j - 1] != null) pts.unshift([j - 1, s.ancora[j - 1]]); }
      if (!pts.length) return '';
      const trechos = []; let cur = []; pts.forEach((p, k) => { if (k && p[0] !== pts[k - 1][0] + 1) { trechos.push(cur); cur = []; } cur.push(p); }); trechos.push(cur);
      const d = trechos.map(tr => tr.map((p, k) => (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('')).join('');
      const bolas = s.v.map((v, i) => v == null ? '' : '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="' + (s.tracejado ? 3 : 3.4) + '" fill="' + (s.tracejado ? 'var(--bg2)' : s.cor) + '" stroke="' + s.cor + '" stroke-width="1.6"/>').join('');
      return '<path d="' + d + '" fill="none" stroke="' + s.cor + '" stroke-width="' + (s.fino ? 1.8 : 2.4) + '" stroke-linejoin="round" stroke-linecap="round"' + (s.tracejado ? ' stroke-dasharray="6 5"' : '') + '/>' + bolas;
    };
    S.CH[id] = { meses, series, n, mL, iw, W, idxAtual };
    return '<div class="gf-w" id="' + id + '"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Gráfico de linhas" onmousemove="GRAFFIN.hover(\'' + id + '\',event)" onmouseleave="GRAFFIN.sai(\'' + id + '\')" ontouchstart="GRAFFIN.hover(\'' + id + '\',event)">'
      + g + hoje + refsSvg + series.map(linhaSvg).join('') + t + '<line id="' + id + '-g" x1="0" x2="0" y1="' + mT + '" y2="' + (mT + ih) + '" stroke="var(--t2)" stroke-width="1" opacity="0" pointer-events="none"/></svg><div class="gf-tip" id="' + id + '-t"></div></div>';
  }
  function hover(id, ev) {
    const c = S.CH[id], w = $(id); if (!c || !w) return; const svg = w.querySelector('svg'), r = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX);
    const px = (cx - r.left) / r.width * c.W; let i = Math.round((px - c.mL) / (c.iw / (c.n - 1 || 1))); i = Math.max(0, Math.min(c.n - 1, i));
    const x = c.mL + i * c.iw / (c.n - 1 || 1), gl = $(id + '-g'); if (gl) { gl.setAttribute('x1', x); gl.setAttribute('x2', x); gl.setAttribute('opacity', '.55'); }
    const linhasT = c.series.map(s => s.v[i] == null ? '' : '<div><i style="background:' + s.cor + '"></i>' + esc(s.nome) + ' <b>' + esc(R(s.v[i])) + '</b></div>').join('');
    const tip = $(id + '-t'); tip.innerHTML = '<div class="gf-th">' + MES[parseInt(c.meses[i].substring(5, 7)) - 1] + '/' + c.meses[i].substring(0, 4) + '</div>' + (linhasT || '<div style="color:var(--t3)">sem valores</div>'); tip.style.display = 'block';
    const frac = x / c.W; tip.style.left = frac > .62 ? 'auto' : (frac * 100 + 2) + '%'; tip.style.right = frac > .62 ? (100 - frac * 100 + 2) + '%' : 'auto';
  }
  function sai(id) { const g = $(id + '-g'), t = $(id + '-t'); if (g) g.setAttribute('opacity', '0'); if (t) t.style.display = 'none'; }

  // ── blocos ──────────────────────────────────────────────────────────────────────────────────────────────
  const chip = (tit, val, sub, cor) => '<div class="gf-k"><div class="gf-kt">' + tit + '</div><div class="gf-kv"' + (cor ? ' style="color:' + cor + '"' : '') + '>' + val + '</div><div class="gf-ks">' + sub + '</div></div>';
  const abas = (atual, lista, fn) => '<div class="gf-abas">' + lista.map(([k, t]) => '<button class="' + (k === atual ? 'on' : '') + '" onclick="GRAFFIN.' + fn + '(\'' + k + '\')">' + t + '</button>').join('') + '</div>';
  const legenda = ls => '<div class="gf-leg">' + ls.map(l => '<span><i style="background:' + (l.tr ? 'transparent' : l.cor) + ';border:2px ' + (l.tr ? 'dashed ' : 'solid ') + l.cor + '"></i>' + esc(l.nome) + '</span>').join('') + '</div>';
  const avisos = a => (a || []).length ? '<ul class="gf-av">' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
  const erroBox = (m, tipo) => '<div class="gf-err">Não foi possível carregar: ' + esc(m) + ' <button onclick="GRAFFIN.recarregar()">Tentar de novo</button></div>';
  function tabela(meses, cols) {
    return '<details class="gf-det"><summary>Ver os valores mês a mês</summary><div style="overflow-x:auto"><table><thead><tr><th></th>' + meses.map(m => '<th>' + MES[parseInt(m.substring(5, 7)) - 1] + '</th>').join('') + '</tr></thead><tbody>'
      + cols.map(c => '<tr><td style="text-align:left;white-space:nowrap">' + esc(c.nome) + '</td>' + c.v.map(v => '<td>' + (v == null ? '—' : nf(v)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></details>';
  }
  const cDes = (v, bomPositivo = true) => v == null || v === 0 ? 'var(--t2)' : ((v > 0) === bomPositivo ? 'var(--green)' : 'var(--red)');

  function pinta(qual) { if (qual === 'caixa') pintaCaixa(); else pintaOrc(); }

  function pintaCaixa() {
    const box = $('gfCaixa'); if (!box) return;
    const cab = '<div class="gf-h"><div><b>Fluxo de caixa: meta × real</b><div class="gf-sub">Quanto o caixa gerou contra o que a meta de lucro da empresa exige gerar</div></div></div>';
    if (S.erro.caixa || !S.caixa) { box.innerHTML = cab + erroBox(S.erro.caixa || 'sem resposta'); return; }
    const d = S.caixa, c = d.caixa[S.vCaixa], rs = d.resumo, mi = d.meta_info, i0 = d.indice_mes_atual;
    const ser = [{ nome: 'Real', v: c.real, cor: COR.real }, { nome: 'Previsto', v: c.previsto, cor: COR.real, tracejado: true, ancora: c.real }, { nome: 'Meta', v: c.meta, cor: COR.meta, fino: true }, { nome: 'Líquido dos novos impostos', v: c.liquido, cor: COR.liq }].filter(s => s.v.some(x => x != null));
    const refs = S.vCaixa === 'saldo' && c.minimo != null ? [{ valor: c.minimo, rotulo: 'Caixa mínimo ' + RC(c.minimo), cor: COR.minimo }] : [];
    const tit = { mensal: 'Resultado de caixa do mês (entradas − saídas)', acumulado: 'Resultado de caixa acumulado no ano', saldo: 'Saldo em caixa no fim do mês' }[S.vCaixa];
    const k = [
      chip('Real nos meses fechados', RC(rs.resultado_real_fechado), rs.meses_fechados ? 'meta ' + RC(rs.meta_fechado) + (rs.atingido_pct != null ? ' · ' + rs.atingido_pct + '% da meta' : '') : 'nenhum mês fechado ainda', cDes(rs.desvio_fechado)),
      chip('Desvio contra a meta', rs.desvio_fechado == null ? '—' : (rs.desvio_fechado > 0 ? '+' : '') + RC(rs.desvio_fechado), rs.situacao || 'sem meta cadastrada', cDes(rs.desvio_fechado)),
      chip('Projeção do ano', RC(rs.projecao_fim_ano), 'meta do ano ' + RC(rs.meta_ano) + (rs.desvio_projetado != null ? ' · ' + (rs.desvio_projetado >= 0 ? '+' : '') + RC(rs.desvio_projetado) : ''), cDes(rs.desvio_projetado)),
      (d.imposto && d.imposto.ativo ? chip('Caixa líquido do ano (imposto ' + d.imposto.novo_pct + '%)', RC(d.imposto.liquido_ano), 'novo imposto custa ' + RC(d.imposto.imposto_adicional_ano) + ' a mais no ano', 'var(--purple, #b48cff)') : '') +
      chip('Saldo hoje', RC(rs.saldo_hoje), rs.caixa_minimo != null ? 'mínimo ' + RC(rs.caixa_minimo) : 'caixa mínimo não cadastrado', rs.saldo_hoje != null && rs.caixa_minimo != null && rs.saldo_hoje < rs.caixa_minimo ? 'var(--red)' : null)].join('');
    box.innerHTML = cab + '<div class="gf-ks-row">' + k + '</div>'
      + '<div class="gf-bar">' + abas(S.vCaixa, [['mensal', 'Resultado do mês'], ['acumulado', 'Acumulado no ano'], ['saldo', 'Saldo em caixa']], 'vistaCaixa') + legenda([{ nome: 'Real', cor: COR.real }, { nome: 'Previsto (realizado + a vencer)', cor: COR.real, tr: true }, { nome: 'Meta', cor: COR.meta }].concat(d.imposto && d.imposto.ativo ? [{ nome: 'Líquido (imposto ' + d.imposto.novo_pct + '%)', cor: COR.liq }] : []))
      + '</div><div class="gf-tt">' + tit + '</div>' + linhas('gfc', d.meses, ser, refs, i0)
      + '<div class="gf-nota">Meta do mês = meta de faturamento do mês × meta de margem líquida'
      + (mi.faturamento_ano ? ' (' + RC(mi.faturamento_ano) + ' × ' + mi.margem_pct + '%, ' + esc(mi.distribuicao) + ')' : '') + '. O mês corrente mostra o realizado até hoje; a linha tracejada é o mês inteiro com o que ainda vai entrar e sair.</div>'
      + tabela(d.meses, [{ nome: 'Real', v: c.real }, { nome: 'Previsto', v: c.previsto }, { nome: 'Meta', v: c.meta }].concat(d.imposto && d.imposto.ativo ? [{ nome: 'Líquido dos novos impostos', v: c.liquido }] : [])) + avisos(d.avisos);
  }

  function pintaOrc() {
    const box = $('gfOrc'); if (!box) return;
    const cab = '<div class="gf-h"><div><b>Orçamento × real</b><div class="gf-sub">Orçado no QuickBooks contra o que realmente entrou e saiu (regime de caixa)</div></div></div>';
    if (S.erro.orc || !S.orc) { box.innerHTML = cab + erroBox(S.erro.orc || 'sem resposta'); return; }
    const d = S.orc; if (!d.series) { box.innerHTML = cab + '<div class="gf-vazio">Orçado × realizado indisponível.</div>' + avisos(d.avisos); return; }
    const s = d.series[S.vOrc], acum = S.modoOrc === 'acumulado', o = acum ? s.acumulado.orcado : s.orcado, r = acum ? s.acumulado.real : s.real, rs = d.resumo, gastos = S.vOrc === 'gastos';
    const ser = [{ nome: 'Orçado', v: o, cor: COR.orcado, fino: true }, { nome: 'Real', v: r, cor: COR.real }];
    const nomeG = { receitas: 'Receitas', gastos: 'Gastos (custos e despesas)', resultado: 'Resultado líquido' }[S.vOrc];
    const kp = (t, x, bomPos) => x ? chip(t, RC(x.real), 'orçado ' + RC(x.orcado) + (x.desvio_pct != null ? ' · ' + (x.desvio_pct > 0 ? '+' : '') + nf(x.desvio_pct, 1).replace(/\.0$/, '') + '%' : ''), cDes(x.desvio, bomPos)) : '';
    box.innerHTML = cab + (rs ? '<div class="gf-ks-row">' + kp('Receitas até ' + MES[parseInt(rs.ate_mes.substring(5, 7)) - 1], rs.receitas, true) + kp('Gastos até ' + MES[parseInt(rs.ate_mes.substring(5, 7)) - 1], rs.gastos, false) + kp('Resultado até ' + MES[parseInt(rs.ate_mes.substring(5, 7)) - 1], rs.resultado, true) + '</div>' : '')
      + '<div class="gf-bar">' + abas(S.vOrc, [['receitas', 'Receitas'], ['gastos', 'Gastos'], ['resultado', 'Resultado']], 'vistaOrc') + abas(S.modoOrc, [['mensal', 'Mês a mês'], ['acumulado', 'Acumulado']], 'modoOrc') + legenda([{ nome: 'Orçado', cor: COR.orcado }, { nome: 'Real', cor: COR.real }]) + '</div>'
      + '<div class="gf-tt">' + nomeG + (acum ? ', acumulado no ano' : ', por mês') + (gastos ? ' (real acima do orçado = gastou mais do que o previsto)' : '') + '</div>' + linhas('gfo', d.meses, ser, [], d.indice_mes_atual)
      + tabela(d.meses, [{ nome: 'Orçado', v: o }, { nome: 'Real', v: r }]) + avisos(d.avisos);
  }

  function mudaAno(delta) { S.ano += delta; const t = $('gfAno'); if (t) t.textContent = S.ano; abrir(); }
  window.GRAFFIN = {
    abrir: () => { const a = $('gfAno'); if (a) a.textContent = S.ano; abrir(); }, recarregar: () => abrir(true), ano: mudaAno, hover, sai,
    vistaCaixa: k => { S.vCaixa = k; pintaCaixa(); }, vistaOrc: k => { S.vOrc = k; pintaOrc(); }, modoOrc: k => { S.modoOrc = k; pintaOrc(); },
  };
})();
