// public/kpi-detalhe-ui.js — v3.639 · clique no KPI (Central e Placar) abre "o que compõe este número": contas e lançamentos de origem.
(function () {
  const $ = id => document.getElementById(id), esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const brl = v => v == null || isNaN(v) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const br = d => String(d || '').substring(0, 10).split('-').reverse().join('/');
  async function post(url, action, params) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(url === '/api/pmo' ? { action, payload: params || {} } : { action, params: params || {} }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || 'Erro ' + r.status); return j;
  }
  const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().substring(0, 10);
  const css = () => { if ($('kd-css')) return; const s = document.createElement('style'); s.id = 'kd-css'; s.textContent = '.kd-t{width:100%;border-collapse:collapse;font-size:11.5px}.kd-t td,.kd-t th{padding:5px 6px;border-top:1px solid var(--bd);text-align:left;vertical-align:top}.kd-t th{color:var(--t3);font-size:10px;font-weight:600}.kd-t .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.kd-c{cursor:pointer}.kd-c:hover{background:var(--bg3)}.kd-s{color:var(--t3);font-size:10.5px;margin:6px 0}.kd-l td{background:var(--bg);font-size:10.5px}'; document.head.appendChild(s); };
  const fechar = () => { const m = $('kdModal'); if (m) m.remove(); };
  function modal(titulo, sub) {
    css(); fechar(); const m = document.createElement('div'); m.id = 'kdModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:12px';
    m.onclick = e => { if (e.target === m) fechar(); };
    m.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--bd);border-radius:14px;max-width:880px;width:100%;max-height:90vh;overflow:auto;padding:16px 18px"><div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1"><b style="font-size:14px">' + esc(titulo) + '</b><div class="kd-s">' + esc(sub || '') + '</div></div><button class="btn btn-g" onclick="KPID.fechar()">✕</button></div><div id="kdCorpo"><div class="kd-s">Carregando…</div></div></div>';
    document.body.appendChild(m); return $('kdCorpo');
  }
  const tabela = (cab, linhas) => (linhas=linhas.filter(Boolean)).length ? '<table class="kd-t"><tr>' + cab.map(c => '<th' + (c[1] ? ' class="n"' : '') + '>' + esc(c[0]) + '</th>').join('') + '</tr>' + linhas.join('') + '</table>' : '<div class="kd-s">Nada para listar neste período.</div>';
  const lancLinhas = L => L.map(l => '<tr><td>' + br(l.data) + '</td><td>' + esc(l.tipo) + (l.doc ? ' ' + esc(l.doc) : '') + '</td><td>' + esc(l.nome) + (l.memo ? '<div class="kd-s" style="margin:0">' + esc(l.memo) + '</div>' : '') + '</td><td class="n">' + brl(l.valor) + '</td><td>' + (l.qb_url ? '<a href="' + esc(l.qb_url) + '" target="_blank" rel="noopener">QB</a>' : '') + '</td></tr>').join('');
  // ── DRE (receita, margens): contas → lançamentos
  let ARV = null, PER = null;
  function achatar(n, p, nivel, apenas, out) {
    (n || []).forEach((x, i) => { const k = p + (p ? '.' : '') + i; if (nivel === 0 && apenas && x.grupo !== apenas) return; out.push({ x, k, nivel });
      if (x.filhos?.length) achatar(x.filhos, k, nivel + 1, null, out); });
    return out;
  }
  function arvoreHtml(apenas) {
    const L = achatar(ARV.arvore, '', 0, apenas, []);
    return '<div class="kd-s">Período ' + br(ARV.de) + ' a ' + br(ARV.ate) + ' · regime de caixa · clique numa conta para ver os lançamentos</div>' + tabela([['Conta'], ['Valor', 1]], L.map(({ x, k, nivel }) => {
      const pode = x.conta_id && x.tipo !== 'grupo'; return '<tr class="' + (pode ? 'kd-c' : '') + '" ' + (pode ? 'onclick="KPID.conta(\'' + esc(x.conta_id) + '\',\'' + k + '\')"' : '') + '><td style="padding-left:' + (6 + nivel * 14) + 'px;' + (x.filhos?.length ? 'font-weight:600' : '') + '">' + esc(x.nome) + (pode ? ' ›' : '') + '</td><td class="n">' + brl(x.total) + '</td></tr><tr id="kdl-' + k + '" style="display:none" class="kd-l"><td colspan="2"></td></tr>'; }));
  }
  async function conta(id, k) {
    const tr = $('kdl-' + k); if (!tr) return; if (tr.style.display !== 'none') { tr.style.display = 'none'; return; } tr.style.display = ''; const td = tr.firstChild; td.innerHTML = 'Carregando lançamentos…';
    try { const d = await post('/api/financeiro', 'dre_conta_lancamentos', { conta_id: id, data_inicio: PER.ini, data_fim: PER.fim, metodo: 'Cash' });
      td.innerHTML = (d.aviso ? '<div class="kd-s">' + esc(d.aviso) + '</div>' : '') + '<div class="kd-s"><b>' + esc(d.conta || '') + '</b> · ' + d.qtd + ' lançamento(s) · total ' + brl(d.total) + (d.qtd > 500 ? ' (mostrando os 500 maiores)' : '') + '</div>' + tabela([['Data'], ['Tipo'], ['Nome / memo'], ['Valor', 1], ['']], [lancLinhas(d.lancamentos || [])]);
    } catch (e) { td.innerHTML = '<span style="color:var(--red)">' + esc(e.message) + '</span>'; }
  }
  async function dre(corpo, apenas) {
    PER = { ini: hoje().substring(0, 4) + '-01-01', fim: hoje() }; const j = await post('/api/financeiro', 'dre_arvore', { data_inicio: PER.ini, data_fim: PER.fim, metodo: 'Cash' });
    ARV = j.dre; if (!ARV) throw new Error(j.erro || 'QuickBooks sem resposta'); corpo.innerHTML = arvoreHtml(apenas);
  }
  async function caixa(corpo, ind) {
    const j = await post('/api/financeiro', 'caixa_detalhe', {}), D = j.caixa_detalhe || {}, t = D.totais || {};
    const lin = (L, venc) => L.slice(0, 150).map(x => '<tr><td>' + br(x.data || x.vencimento) + '</td><td>' + esc(x.cliente || x.fornecedor || x.descricao || x.nome || '') + (x.doc ? ' · ' + esc(x.doc) : '') + '</td><td class="n">' + (x.dias != null ? (x.dias < 0 ? Math.abs(x.dias) + ' d vencido' : x.dias + ' d') : '') + '</td><td class="n">' + brl(x.saldo ?? x.valor) + '</td></tr>').join('');
    corpo.innerHTML = '<div class="kd-s">Saldo de caixa hoje: <b>' + brl(D.saldo_hoje) + '</b> · a receber ' + brl(t.receber) + ' (vencido ' + brl(t.receber_vencido) + ') · a pagar ' + brl(t.pagar) + ' (vencido ' + brl(t.pagar_vencido) + ')</div>'
      + '<b style="font-size:12px">A receber</b>' + tabela([['Data'], ['Cliente / fatura'], ['Prazo', 1], ['Valor', 1]], [lin(D.receber || [])]) + '<b style="font-size:12px;display:block;margin-top:10px">A pagar</b>' + tabela([['Data'], ['Fornecedor / descrição'], ['Prazo', 1], ['Valor', 1]], [lin(D.pagar || [])]);
  }
  async function arr(corpo) {
    const A = await post('/api/financeiro', 'arr_sistema', {}), o = A.por_origem_2026 || {};
    corpo.innerHTML = '<div class="kd-s">ARR de ' + esc((A.janela || {}).de) + ' a ' + esc((A.janela || {}).ate) + ': <b>' + brl(A.arr_2026) + '</b> · sustentações ' + brl(o.sustentacao) + ' · recorrentes ' + brl(o.recorrente) + ' · QuickBooks ' + brl(o.quickbooks) + '</div>' + tabela([['Cliente'], ['Projeto / item'], ['Origem'], ['Valor em 12 meses', 1]], (A.itens_2026 || []).map(x => '<tr><td>' + esc(x.cliente) + '</td><td>' + esc(x.nome) + '</td><td>' + esc(x.origem) + '</td><td class="n">' + brl(x.valor) + '</td></tr>'))
      + ((A.vigencia_assumida || []).length ? '<div class="kd-s">Sem datas de contrato (tratadas como vigentes): ' + A.vigencia_assumida.map(x => esc(x.nome)).join(', ') + '</div>' : '') + ((A.sem_dados || []).length ? '<div class="kd-s" style="color:var(--red)">Sem valor mensal (fora do ARR): ' + A.sem_dados.map(x => esc(x.nome)).join(', ') + '</div>' : '');
  }
  async function projetos(corpo) {
    const j = await post('/api/pmo', 'painel_mestre', {}), L = j.projetos || j.linhas || j.itens || [];
    corpo.innerHTML = '<div class="kd-s">' + esc(JSON.stringify(j.resumo || {})) + '</div>' + tabela([['Projeto'], ['Farol'], ['Observação']], L.map(p => '<tr><td>' + esc(p.projeto || p.nome) + '</td><td>' + esc(p.farol || p.cor || '') + '</td><td>' + esc(p.motivo || (p.motivos || []).join('; ') || '') + '</td></tr>'));
  }
  async function abrir(id, nome, formula) {
    const corpo = modal(nome || id, formula ? 'Conta: ' + formula : '');
    try {
      if (id === 'receita_ano') await dre(corpo, 'Income');
      else if (id === 'margem_liquida' || id === 'margem_ebitda') await dre(corpo, null);
      else if (id === 'caixa_minimo' || id === 'dso') await caixa(corpo, id);
      else if (id === 'recorrente_pct') await arr(corpo);
      else if (id === 'entregas_prazo') await projetos(corpo);
      else corpo.innerHTML = '<div class="kd-s">Este indicador não nasce de lançamentos: ' + esc(formula || 'é registrado manualmente ou vem do funil de vendas') + '. Para ver os negócios, abra o Funil de vendas / CRM.</div>';
    } catch (e) { corpo.innerHTML = '<div class="kd-s" style="color:var(--red)">Não consegui carregar: ' + esc(e.message) + '</div>'; }
  }
  window.KPID = { abrir, fechar, conta };
})();
