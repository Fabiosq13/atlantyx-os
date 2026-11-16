// v3.519 — ESTÚDIO DE PRODUTOS E ESTEIRA · fase 1: premissas + cadastro de produtos com cálculo ao vivo.
// Fases seguintes (esteira, simulador, comparação, teste de escala, IA) aparecem como abas bloqueadas.
(function () {
  const $ = id => document.getElementById(id);
  const E = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const R = v => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const N = v => v == null ? '—' : String(v).replace('.', ',');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  async function api(action, p = {}) {
    const r = await fetch('/api/estrategia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...p }) });
    const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status }));
    if (d.success === false || !r.ok) throw new Error(d.error || 'falha'); return d;
  }
  let D = null, ed = null, ee = null, CEN = [], cs = { nome: 'Cenário 1', horizonte: 12, pessoas_disponiveis: '', premissas: {}, linhas: [{}] }, RS = null, aba = 'produtos', tmr = null;
  const COR = { verde: 'var(--green)', amarelo: 'var(--gold)', vermelho: 'var(--red)', cinza: 'var(--t3)' };
  const PUB = { grande: 'Grande', medio: 'Médio', atuais: 'Clientes atuais' };
  const ABAS = [['produtos', 'Produtos', 1], ['esteira', 'Esteira', 1], ['simulador', 'Simulador', 1], ['escala', 'Teste de escala', 0], ['catalogo', 'Catálogo', 0]];

  async function abrir() { await carregar(); }
  async function carregar() {
    const b = $('epApp'); if (b && !D) b.innerHTML = '<div style="padding:30px;color:var(--t3);">Carregando…</div>';
    try { D = await api('sim_obter'); render(); } catch (e) { if (b) b.innerHTML = '<div style="color:var(--red);padding:16px;">Erro: ' + E(e.message) + '</div>'; }
  }
  function render() {
    const b = $('epApp'); if (!b || !D) return;
    let h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' + ABAS.map(([k, t, ok]) => '<button class="btn ' + (aba === k ? 'btn-p' : 'btn-g') + '" style="font-size:11px;' + (ok ? '' : 'opacity:.5;') + '" ' + (ok ? 'onclick="EP.aba(\'' + k + '\')"' : 'disabled title="Próxima fase"') + '>' + t + (ok ? '' : ' · em breve') + '</button>').join('') + '</div>';
    h += premissasHtml();
    h += aba === 'simulador' ? simHtml() : aba === 'esteira' ? (ee ? esteiraEditor() : esteiraLista()) : (ed ? editorHtml() : listaHtml());
    b.innerHTML = h; if (ed && aba === 'produtos') previa(); if (ee && aba === 'esteira') previaE(); if (aba === 'simulador') simular();
  }
  const fld = (k, v, w, ph) => '<input class="fi" id="epp_' + k + '" style="width:' + (w || 80) + 'px;margin:0;font-size:11px;" value="' + E(v ?? '') + '" placeholder="' + (ph || '') + '">';
  function premissasHtml() {
    const P = D.premissas, o = P.origem || {};
    const tag = k => o[k] ? ' <span style="font-size:9px;color:' + (/hip/.test(o[k]) ? 'var(--gold)' : 'var(--green)') + ';">[' + E(o[k]) + ']</span>' : '';
    return '<details style="margin-bottom:12px;background:var(--bg3);border:1px solid var(--bd);border-radius:10px;padding:8px 12px;font-size:11px;"><summary style="cursor:pointer;font-weight:700;">Premissas globais · custo por pessoa-dia ' + R(P.custo_pessoa_dia) + ' · piso ' + N(P.margem_piso_pct) + '% · meta ' + N(P.margem_meta_pct) + '%</summary><div style="line-height:2.2;margin-top:6px;">'
      + 'Custo por pessoa-dia R$ ' + fld('custo_pessoa_dia', P.custo_pessoa_dia) + tag('custo_pessoa_dia') + '<br><span style="color:var(--t3);">Inclui: ' + E(P.custo_pessoa_dia_inclui) + '</span><br>'
      + 'Piso de margem % ' + fld('margem_piso_pct', P.margem_piso_pct, 50) + tag('margem_piso_pct') + ' · Meta % ' + fld('margem_meta_pct', P.margem_meta_pct, 50) + tag('margem_meta_pct') + ' · Impostos % ' + fld('impostos_pct', P.impostos_pct, 50, 'vazio') + ' · Comissão % ' + fld('comissao_pct', P.comissao_pct, 50, 'vazio') + '<br>'
      + 'Prazo de recebimento (dias): grandes ' + fld('dso_grande', P.dso_dias?.grande, 45) + ' médios ' + fld('dso_medio', P.dso_dias?.medio, 45) + tag('dso_dias') + ' · Custo máx. de entrada R$ ' + fld('custo_max_entrada', P.custo_max_entrada, 70) + tag('custo_max_entrada') + '<br>'
      + 'Contrato mínimo projeto sob medida (grandes) R$ ' + fld('contrato_minimo_grandes', P.contrato_minimo_grandes, 80) + tag('contrato_minimo_grandes') + ' · Limite de ocupação % ' + fld('limite_ocupacao_pct', P.limite_ocupacao_pct, 50) + ' · Dias úteis/mês ' + fld('dias_uteis_mes', P.dias_uteis_mes, 45)
      + ' <button class="btn btn-p" style="font-size:11px;" onclick="EP.salvarPrem()">Salvar premissas</button>'
      + (D.premissas_meta ? ' <span style="color:var(--t3);">última alteração: ' + E(D.premissas_meta.autor || '—') + ' · ' + new Date(D.premissas_meta.em).toLocaleDateString('pt-BR') + '</span>' : '') + '</div></details>';
  }
  function listaHtml() {
    const L = D.produtos || [];
    let h = '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;"><button class="btn btn-p" style="font-size:11px;" onclick="EP.novo()">+ Novo produto</button>'
      + (D.sementes_disponiveis ? '<button class="btn btn-g" style="font-size:11px;" onclick="EP.sementes()">Carregar exemplos (hipótese a validar)</button>' : '') + '</div>';
    if (!L.length) return h + '<div style="padding:24px;color:var(--t3);font-size:12px;">Nenhum produto ainda. Crie um ou carregue os exemplos do documento (marcados como hipótese a validar).</div>';
    h += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="color:var(--t3);font-size:10px;text-align:right;"><th style="text-align:left;padding:5px;">Produto</th><th>Público</th><th>Degrau</th><th>Preço</th><th>Esforço (p-d)</th><th>Custo</th><th>Margem</th><th>Preço mín. (piso)</th><th>Limite esforço (piso / meta)</th><th></th></tr>';
    for (const p of L) { const c = p.calculo || {};
      h += '<tr style="border-top:1px solid var(--bd);text-align:right;' + (p.status === 'pausado' ? 'opacity:.5;' : '') + '"><td style="text-align:left;padding:5px;font-weight:600;">' + E(p.nome) + '<div style="font-size:9px;color:var(--t3);font-weight:400;">' + E(p.tipo) + ' · ' + E(p.status) + ' · ' + E(p.origem) + '</div></td><td>' + (PUB[p.publico] || '') + '</td><td>' + E(p.degrau) + '</td><td>' + R(p.preco) + (p.periodicidade === 'mensal' ? '/mês' : '') + '</td><td>' + N(p.pessoa_dias) + '</td><td>' + R(c.custo_unidade) + '</td>'
        + '<td title="' + E(c.motivo) + '"><b style="color:' + COR[c.semaforo || 'cinza'] + ';">● ' + (c.margem_bruta_pct == null ? '—' : N(c.margem_bruta_pct) + '%') + '</b></td><td>' + R(c.preco_minimo_piso) + '</td><td>' + N(c.limite_esforco_piso) + ' / ' + N(c.limite_esforco_meta) + '</td>'
        + '<td style="white-space:nowrap;"><button class="btn btn-g" style="font-size:10px;" onclick="EP.editar(\'' + p.id + '\')">Editar</button> <button class="btn btn-g" style="font-size:10px;" onclick="EP.acao(\'' + p.id + '\',\'duplicar\')">Duplicar</button> <button class="btn btn-g" style="font-size:10px;" onclick="EP.acao(\'' + p.id + '\',\'pausar\')">' + (p.status === 'pausado' ? 'Reativar' : 'Pausar') + '</button></td></tr>'
        + '<tr><td colspan="10" style="font-size:10px;color:var(--t3);padding:0 5px 5px;">' + E(c.motivo) + ' · margem: ' + E(c.tipo_margem) + '</td></tr>'; }
    return h + '</table></div>';
  }
  const sel = (k, v, ops) => '<select class="fi" id="epf_' + k + '" style="width:auto;margin:0;font-size:11px;" onchange="EP.previa()">' + ops.map(([a, b]) => '<option value="' + a + '"' + (v === a ? ' selected' : '') + '>' + b + '</option>').join('') + '</select>';
  const inp = (k, v, w, ph) => '<input class="fi" id="epf_' + k + '" style="width:' + (w || 80) + 'px;margin:0;font-size:11px;" value="' + E(v ?? '') + '" placeholder="' + (ph || '') + '" oninput="EP.previa()">';
  function editorHtml() {
    const p = ed;
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;"><div style="font-size:11px;line-height:2.2;">'
      + '<b style="font-size:13px;">' + (p.id ? 'Editar produto' : 'Novo produto') + '</b><br>Nome ' + inp('nome', p.nome, 240) + '<br>'
      + 'Público ' + sel('publico', p.publico, [['grande', 'Grande'], ['medio', 'Médio'], ['atuais', 'Clientes atuais']]) + ' Degrau ' + sel('degrau', p.degrau, [['A', 'A'], ['B', 'B'], ['C', 'C']]) + ' Tipo ' + sel('tipo', p.tipo, [['entrada', 'Entrada'], ['recorrente', 'Recorrente'], ['projeto', 'Projeto']]) + ' Status ' + sel('status', p.status, [['rascunho', 'Rascunho'], ['em_teste', 'Em teste'], ['ativo', 'Ativo'], ['pausado', 'Pausado']]) + '<br>'
      + 'Preço R$ ' + inp('preco', p.preco) + ' ' + sel('periodicidade', p.periodicidade, [['unico', 'único'], ['mensal', 'mensal']]) + ' Esforço (pessoa-dias por unidade) ' + inp('pessoa_dias', p.pessoa_dias, 60) + '<br>'
      + 'Contrato mínimo (meses) ' + inp('prazo_contrato_meses', p.prazo_contrato_meses, 50) + ' Implantação R$ ' + inp('taxa_implantacao', p.taxa_implantacao, 70) + ' Abatimento R$ ' + inp('abatimento', p.abatimento, 70) + '<br>'
      + 'Custos variáveis por cliente R$: nuvem ' + inp('custo_nuvem', p.custo_nuvem, 55) + ' IA ' + inp('custo_ia', p.custo_ia, 55) + ' ferramentas ' + inp('custo_ferramentas', p.custo_ferramentas, 55) + ' outros ' + inp('custo_outros', p.custo_outros, 55) + '<br>'
      + 'Impostos % ' + inp('impostos_pct', p.impostos_pct, 45, 'premissa') + ' Comissão % ' + inp('comissao_pct', p.comissao_pct, 45, 'premissa') + ' Churn mensal % ' + inp('churn_mensal_pct', p.churn_mensal_pct, 45) + '<br>'
      + 'Investimento: horas de desenvolvimento ' + inp('capex_horas', p.capex_horas, 55) + ' custo fixo mensal R$ ' + inp('opex_mensal', p.opex_mensal, 70) + ' DSO próprio (dias) ' + inp('dso_dias', p.dso_dias, 45) + '<br>'
      + 'Origem do dado ' + inp('origem', p.origem, 220) + '<br>Observação ' + inp('obs', p.obs, 260) + '<br>'
      + '<button class="btn btn-p" style="font-size:11px;" onclick="EP.salvarProd()">Salvar produto</button> <button class="btn btn-g" style="font-size:11px;" onclick="EP.cancelar()">Cancelar</button></div>'
      + '<div id="epPrevia" style="background:var(--bg3);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;font-size:11.5px;line-height:1.8;align-self:start;">Calculando…</div></div>';
  }
  function ler() { const o = {}; document.querySelectorAll('[id^=epf_]').forEach(x => { o[x.id.slice(4)] = x.value; }); if (ed?.id) o.id = ed.id; return o; }
  function previa() { clearTimeout(tmr); tmr = setTimeout(async () => {
    const box = $('epPrevia'); if (!box) return;
    try { const c = (await api('sim_calcular', { produto: ler() })).calculo, P = D.premissas;
      box.innerHTML = '<b>Cálculo ao vivo</b> <span style="color:' + COR[c.semaforo] + ';font-weight:800;">● ' + E(c.semaforo) + '</span><br>' + (c.avisos?.length ? '<span style="color:var(--gold)">' + c.avisos.map(E).join(' · ') + '</span>' : '')
        + 'Custo por unidade: <b>' + R(c.custo_unidade) + '</b> <span style="color:var(--t3);">(pessoa-dias × ' + R(P.custo_pessoa_dia) + ' + custos variáveis)</span><br>'
        + 'Receita líquida: <b>' + R(c.receita_liquida) + '</b> · Margem bruta: <b>' + R(c.margem_bruta) + ' (' + (c.margem_bruta_pct == null ? '—' : N(c.margem_bruta_pct) + '%') + ')</b><br>'
        + 'Preço mínimo p/ piso (' + N(P.margem_piso_pct) + '%): <b>' + R(c.preco_minimo_piso) + '</b> · p/ meta (' + N(P.margem_meta_pct) + '%): <b>' + R(c.preco_minimo_meta) + '</b><br>'
        + 'Limite de esforço: <b>' + N(c.limite_esforco_piso) + '</b> p-d (piso) · <b>' + N(c.limite_esforco_meta) + '</b> p-d (meta). Se o cliente pedir mais, sobe de degrau.<br>'
        + 'Margem de contribuição por pessoa-dia: <b>' + R(c.margem_contribuicao_pd) + '</b><br><span style="color:var(--t2);">' + E(c.motivo) + '</span><br><span style="font-size:10px;color:var(--t3);">Tipo de margem: ' + E(c.tipo_margem) + '</span>'; }
    catch (e) { box.innerHTML = '<span style="color:var(--red)">' + E(e.message) + '</span>'; } }, 250); }
  const nomeP = id => (D.produtos.find(x => x.id === id) || {}).nome || '—';
  function resumoE(c) {
    if (!c) return '';
    return '<div style="font-size:11px;line-height:1.7;">' + (c.avisos?.length ? '<span style="color:var(--gold)">' + c.avisos.map(E).join(' · ') + '</span><br>' : '')
      + 'CAC por cliente que entra: <b>' + R(c.cac_total_por_entrante) + '</b> · vendas por entrante: <b>' + N(c.vendas_por_entrante) + '</b> · CAC por venda: <b>' + R(c.cac_por_venda) + '</b> <span style="color:var(--t3);">(a esteira reduz ' + N(c.reducao_cac_por_venda_pct) + '% frente a vender só o degrau A)</span><br>'
      + 'Margem esperada por entrante: <b>' + R(c.margem_esperada_por_entrante) + '</b> · LTV÷CAC: <b>' + N(c.ltv_cac) + '</b> · payback: <b>' + (c.payback_meses == null ? '—' : N(c.payback_meses) + ' meses') + '</b><br>'
      + (c.por_degrau || []).filter(Boolean).map(d => 'Degrau ' + d.degrau + ' · ' + E(d.nome) + ': chega <b>' + N(d.fracao * 100) + '%</b> · margem ' + R(d.margem_unidade) + (d.meses > 1 ? ' × ' + N(d.meses) + ' meses' : '') + ' = <b>' + R(d.margem_total) + '</b>').join('<br>')
      + '<div style="font-size:10px;color:var(--t3);margin-top:4px;">Como foi calculado: ' + E(c.formula) + '</div></div>';
  }
  function esteiraLista() {
    const L = D.esteiras || [];
    let h = '<div style="margin-bottom:10px;"><button class="btn btn-p" style="font-size:11px;" onclick="EP.novaE()">+ Nova esteira</button></div>';
    if (!L.length) return h + '<div style="padding:24px;color:var(--t3);font-size:12px;">Nenhuma esteira. Cadastre os produtos na aba Produtos e monte o caminho A → B → C de cada público.</div>';
    for (const e of L) { const c = e.calculo || {}; const bloco = (g, ico) => '<div style="flex:1;min-width:150px;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:8px 10px;' + (e.degraus[g] ? '' : 'opacity:.4;') + '"><div style="font-size:10px;color:var(--t3);">Degrau ' + g + '</div><div style="font-weight:700;font-size:12px;">' + E(nomeP(e.degraus[g])) + '</div></div>';
      const seta = k => '<div style="align-self:center;text-align:center;font-size:10px;color:var(--t2);min-width:92px;">→<br>' + N(e.passagens[k].conversao_pct) + '% · ' + N(e.passagens[k].meses) + ' m<br>CAC ' + R(e.passagens[k].cac) + '<div style="color:var(--t3);">' + E(e.passagens[k].gatilho) + '</div></div>';
      h += '<div style="background:var(--bg3);border:1px solid var(--bd);border-radius:12px;padding:12px 14px;margin-bottom:12px;"><div style="display:flex;justify-content:space-between;gap:8px;"><b>' + E(e.nome) + ' <span style="font-weight:400;color:var(--t3);">· ' + (PUB[e.publico] || '') + ' · CAC de entrada ' + R(e.cac_entrada) + '</span></b><span><button class="btn btn-g" style="font-size:10px;" onclick="EP.editarE(\'' + e.id + '\')">Editar</button> <button class="btn btn-g" style="font-size:10px;" onclick="EP.excluirE(\'' + e.id + '\')">Excluir</button></span></div>'
        + '<div style="display:flex;gap:6px;margin:10px 0;flex-wrap:wrap;">' + bloco('A') + seta('AB') + bloco('B') + seta('BC') + bloco('C') + '</div>' + resumoE(c) + '</div>'; }
    return h;
  }
  const selP = (k, v) => '<select class="fi" id="eef_' + k + '" style="width:auto;max-width:220px;margin:0;font-size:11px;" onchange="EP.previaE()"><option value="">— nenhum —</option>' + D.produtos.map(p => '<option value="' + p.id + '"' + (v === p.id ? ' selected' : '') + '>' + E(p.nome) + '</option>').join('') + '</select>';
  const ie = (k, v, w, ph) => '<input class="fi" id="eef_' + k + '" style="width:' + (w || 70) + 'px;margin:0;font-size:11px;" value="' + E(v ?? '') + '" placeholder="' + (ph || '') + '" oninput="EP.previaE()">';
  function esteiraEditor() {
    const e = ee, p = e.passagens || { AB: {}, BC: {} };
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;"><div style="font-size:11px;line-height:2.3;"><b style="font-size:13px;">' + (e.id ? 'Editar esteira' : 'Nova esteira') + '</b><br>Nome ' + ie('nome', e.nome, 220) + ' Público <select class="fi" id="eef_publico" style="width:auto;margin:0;font-size:11px;" onchange="EP.previaE()">' + [['grande', 'Grande'], ['medio', 'Médio'], ['atuais', 'Clientes atuais']].map(([a, b]) => '<option value="' + a + '"' + (e.publico === a ? ' selected' : '') + '>' + b + '</option>').join('') + '</select><br>'
      + 'Degrau A ' + selP('A', e.degraus?.A) + '<br>Degrau B ' + selP('B', e.degraus?.B) + '<br>Degrau C ' + selP('C', e.degraus?.C) + '<br>'
      + 'CAC de entrada (cliente novo) R$ ' + ie('cac_entrada', e.cac_entrada, 80) + '<br>'
      + '<b>A→B</b> conversão % ' + ie('ab_conv', p.AB?.conversao_pct, 45) + ' tempo (meses) ' + ie('ab_meses', p.AB?.meses, 45) + ' CAC R$ ' + ie('ab_cac', p.AB?.cac, 65) + '<br>gatilho ' + ie('ab_gat', p.AB?.gatilho, 260, 'ex.: o relatório do Sprint indica o pacote') + '<br>'
      + '<b>B→C</b> conversão % ' + ie('bc_conv', p.BC?.conversao_pct, 45) + ' tempo (meses) ' + ie('bc_meses', p.BC?.meses, 45) + ' CAC R$ ' + ie('bc_cac', p.BC?.cac, 65) + '<br>gatilho ' + ie('bc_gat', p.BC?.gatilho, 260, 'ex.: o uso passa do limite de esforço') + '<br>'
      + 'Origem dos números ' + ie('origem', e.origem, 200, 'informado pelo fundador / hipótese a validar') + '<br><button class="btn btn-p" style="font-size:11px;" onclick="EP.salvarE()">Salvar esteira</button> <button class="btn btn-g" style="font-size:11px;" onclick="EP.cancelarE()">Cancelar</button></div>'
      + '<div id="epPreviaE" style="background:var(--bg3);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;align-self:start;">Calculando…</div></div>';
  }
  function lerE() { const g = k => $('eef_' + k)?.value ?? ''; return { id: ee?.id, nome: g('nome'), publico: g('publico'), degraus: { A: g('A') || null, B: g('B') || null, C: g('C') || null }, cac_entrada: g('cac_entrada'), origem: g('origem'),
    passagens: { AB: { conversao_pct: g('ab_conv'), meses: g('ab_meses'), cac: g('ab_cac'), gatilho: g('ab_gat') }, BC: { conversao_pct: g('bc_conv'), meses: g('bc_meses'), cac: g('bc_cac'), gatilho: g('bc_gat') } } }; }
  let tE = null;
  function previaE() { clearTimeout(tE); tE = setTimeout(async () => { const box = $('epPreviaE'); if (!box) return; try { const x = lerE(); if (!x.nome) x.nome = 'prévia'; box.innerHTML = '<b>Cálculo ao vivo</b><br>' + resumoE((await api('sim_esteira_previa', x)).calculo); } catch (e) { box.innerHTML = '<span style="color:var(--red)">' + E(e.message) + '</span>'; } }, 250); }
  const PC = v => v == null ? '—' : N(v) + '%';
  function simHtml() {
    const c = cs, ln = i => c.linhas[i] || {}, esteiras = D.esteiras || [];
    const selE = i => '<select class="fi" id="sc_e' + i + '" style="width:auto;max-width:200px;margin:0;font-size:11px;" onchange="EP.sim()"><option value="">— esteira —</option>' + esteiras.map(e => '<option value="' + e.id + '"' + (ln(i).esteira_id === e.id ? ' selected' : '') + '>' + E(e.nome) + '</option>').join('') + '</select>';
    const f = (id, v, w, ph) => '<input class="fi" id="sc_' + id + '" style="width:' + (w || 60) + 'px;margin:0;font-size:11px;" value="' + E(v ?? '') + '" placeholder="' + (ph || '') + '" oninput="EP.sim()">';
    let h = '<div style="font-size:11px;line-height:2.3;background:var(--bg3);border:1px solid var(--bd);border-radius:10px;padding:10px 14px;margin-bottom:12px;">Cenário ' + f('nome', c.nome, 160) + ' Horizonte <select class="fi" id="sc_hor" style="width:auto;margin:0;font-size:11px;" onchange="EP.sim()">' + [6, 12, 24, 36].map(x => '<option' + (+c.horizonte === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select> meses · Pessoas disponíveis ' + f('pes', c.pessoas_disponiveis, 40) + '<br>';
    for (let i = 0; i < 3; i++) h += 'Esteira ' + (i + 1) + ' ' + selE(i) + ' entradas/mês ' + f('n' + i, ln(i).entradas_mes, 40) + ' começa no mês ' + f('i' + i, ln(i).inicio_mes, 35, '0') + '<br>';
    h += 'Ajustes: custo/pessoa-dia R$ ' + f('cpd', c.premissas.custo_pessoa_dia, 65, N(D.premissas.custo_pessoa_dia)) + ' · multiplicador de conversão ' + f('cm', c.premissas.conversao_mult, 40, '1') + ' · de prazo de recebimento ' + f('dm', c.premissas.dso_mult, 40, '1') + ' · de custo ' + f('km', c.premissas.custo_mult, 40, '1')
      + ' <button class="btn btn-p" style="font-size:11px;" onclick="EP.salvarCen()">Salvar cenário</button></div>';
    if (CEN.length) h += '<div style="font-size:11px;margin-bottom:10px;">Salvos: ' + CEN.map(x => '<button class="btn btn-g" style="font-size:10px;" onclick="EP.abrirCen(\'' + x.id + '\')">' + E(x.nome) + ' (' + x.horizonte + 'm)</button><button class="btn btn-g" style="font-size:10px;" onclick="EP.delCen(\'' + x.id + '\')">×</button>').join(' ') + '</div>';
    return h + '<div id="simRes"><div style="color:var(--t3);font-size:12px;padding:12px;">Escolha uma esteira e as entradas por mês para simular.</div></div>';
  }
  function lerCen() { const g = id => $('sc_' + id)?.value ?? ''; const linhas = [0, 1, 2].map(i => ({ esteira_id: g('e' + i) || null, entradas_mes: g('n' + i), inicio_mes: g('i' + i) })).filter(l => l.esteira_id);
    cs = { id: cs.id, nome: g('nome'), horizonte: g('hor'), pessoas_disponiveis: g('pes'), premissas: { custo_pessoa_dia: g('cpd'), conversao_mult: g('cm'), dso_mult: g('dm'), custo_mult: g('km') }, linhas: linhas.length ? linhas : [{}] }; return cs; }
  function grafico(ms) {
    const W = 640, Hh = 150, a = ms.map(x => x.caixa_acumulado), b = ms.map(x => x.margem_acumulada), v = a.concat(b, [0]), mn = Math.min(...v), mx = Math.max(...v), sp = (mx - mn) || 1, X = i => 30 + i * (W - 40) / Math.max(1, ms.length - 1), Y = y => 10 + (mx - y) / sp * (Hh - 20);
    const pl = (arr, cor) => '<polyline fill="none" stroke="' + cor + '" stroke-width="2" points="' + arr.map((y, i) => X(i) + ',' + Y(y)).join(' ') + '"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" style="width:100%;max-width:700px;"><line x1="30" x2="' + W + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="var(--bd)" stroke-dasharray="4"/>' + pl(b, 'var(--blue)') + pl(a, 'var(--gold)') + '<text x="32" y="12" font-size="9" fill="var(--blue)">margem acumulada</text><text x="130" y="12" font-size="9" fill="var(--gold)">caixa acumulado</text><text x="2" y="' + (Y(0) + 3) + '" font-size="8" fill="var(--t3)">0</text></svg>';
  }
  let tS = null;
  function simular() { clearTimeout(tS); tS = setTimeout(async () => { const box = $('simRes'); if (!box) return; const c = lerCen(); if (!c.linhas[0]?.esteira_id) return;
    try { RS = (await api('sim_simular', { cenario: c })).resultado; box.innerHTML = resHtml(RS); } catch (e) { box.innerHTML = '<span style="color:var(--red)">' + E(e.message) + '</span>'; } }, 350); }
  function resHtml(r) {
    const S = r.resumo; let h = r.avisos?.length ? '<div style="color:var(--gold);font-size:11px;margin-bottom:8px;">' + r.avisos.map(E).join('<br>') + '</div>' : ''; if (!S) return h;
    const sem = [['Margem', S.semaforos.margem], ['EBITDA (estimativa)', S.semaforos.ebitda], ['Recorrência (ARR)', S.semaforos.arr], ['Caixa', S.semaforos.caixa]];
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' + sem.map(([t, s]) => '<div style="flex:1;min-width:190px;background:var(--bg3);border:1px solid var(--bd);border-left:4px solid ' + COR[s.cor] + ';border-radius:10px;padding:8px 10px;font-size:11px;"><b>' + t + '</b><div style="color:var(--t2);">' + E(s.motivo) + '</div></div>').join('') + '</div>';
    const k = (t, v) => '<div style="flex:1;min-width:130px;background:var(--bg3);border:1px solid var(--bd);border-radius:10px;padding:7px 10px;"><div style="font-size:9.5px;color:var(--t3);">' + t + '</div><div style="font-size:15px;font-weight:800;">' + v + '</div></div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' + k('Receita', R(S.receita)) + k('Margem bruta', R(S.margem_bruta) + ' · ' + PC(S.margem_bruta_pct)) + k('EBITDA estimado', R(S.ebitda_estimado) + ' · ' + PC(S.ebitda_estimado_pct)) + k('Caixa mínimo', R(S.caixa_minimo) + (S.mes_caixa_minimo ? ' (mês ' + S.mes_caixa_minimo + ')' : '')) + k('Break-even', S.mes_break_even ? 'mês ' + S.mes_break_even : (S.caixa_minimo < 0 ? 'não no período' : 'sem queda')) + k('ROI em ' + S.horizonte + ' meses', PC(S.roi_pct)) + k('Investimento total', R(S.investimento_total)) + '</div>';
    if (S.contratar) h += '<div style="font-size:11px;margin-bottom:8px;color:var(--gold);">⚠ Ocupação passa do limite no mês ' + S.contratar.mes + ' (' + PC(S.contratar.ocupacao_pct) + '). ' + (S.contratar.recorrencia_cobre ? 'A recorrência cobre a contratação.' : 'Não há recorrência que cubra uma contratação: só contratar com contrato recorrente.') + '</div>';
    h += '<div style="font-weight:700;font-size:12px;margin:8px 0 4px;">Margem × caixa</div>' + grafico(r.meses) + (S.meses_descompasso.length ? '<div style="font-size:11px;color:var(--red);">Descompasso: margem acumulada positiva e caixa acumulado negativo nos meses ' + S.meses_descompasso.join(', ') + '.</div>' : '');
    h += '<div style="font-weight:700;font-size:12px;margin:10px 0 4px;">Margem por oferta</div><table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="color:var(--t3);font-size:10px;text-align:right;"><th style="text-align:left;">Oferta</th><th>Receita</th><th>Custo</th><th>Margem</th><th>%</th></tr>' + r.por_oferta.map(o => '<tr style="border-top:1px solid var(--bd);text-align:right;"><td style="text-align:left;">' + E(o.nome) + '</td><td>' + R(o.receita) + '</td><td>' + R(o.custo) + '</td><td>' + R(o.margem) + '</td><td>' + PC(o.margem_pct) + '</td></tr>').join('') + '</table>';
    h += (r.esteiras || []).map(x => '<div style="font-size:11px;margin-top:8px;"><b>' + E(x.esteira) + '</b>: CAC por cliente que entra ' + R(x.calculo.cac_total_por_entrante) + ' · LTV÷CAC ' + N(x.calculo.ltv_cac) + ' · payback ' + (x.calculo.payback_meses == null ? '—' : N(x.calculo.payback_meses) + ' meses') + '</div>').join('');
    h += '<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:11px;font-weight:700;">Mês a mês</summary><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:10.5px;"><tr style="color:var(--t3);text-align:right;"><th>Mês</th><th>Receita</th><th>Custo</th><th>Margem</th><th>CAC</th><th>Recebido</th><th>Fluxo</th><th>Caixa acum.</th><th>Ocupação</th></tr>'
      + r.meses.map(m => '<tr style="border-top:1px solid var(--bd);text-align:right;' + (m.descompasso ? 'background:rgba(231,76,60,.08);' : '') + '"><td>' + m.mes + '</td><td>' + R(m.receita) + '</td><td>' + R(m.custo_direto) + '</td><td>' + R(m.margem_bruta) + '</td><td>' + R(m.cac) + '</td><td>' + R(m.caixa_entrada) + '</td><td>' + R(m.fluxo_caixa) + '</td><td><b>' + R(m.caixa_acumulado) + '</b></td><td>' + PC(m.ocupacao_pct) + '</td></tr>').join('') + '</table></div></details>';
    h += '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:11px;font-weight:700;">Como foi calculado</summary><ul style="font-size:10.5px;color:var(--t2);margin-left:18px;">' + Object.entries(r.formulas).map(([a, b]) => '<li><b>' + E(a) + ':</b> ' + E(b) + '</li>').join('') + '</ul></details>';
    return h;
  }
  const num = id => $(id)?.value ?? '';
  async function salvarPrem() {
    const g = k => num('epp_' + k), premissas = { custo_pessoa_dia: g('custo_pessoa_dia'), margem_piso_pct: g('margem_piso_pct'), margem_meta_pct: g('margem_meta_pct'), impostos_pct: g('impostos_pct'), comissao_pct: g('comissao_pct'), custo_max_entrada: g('custo_max_entrada'), contrato_minimo_grandes: g('contrato_minimo_grandes'), limite_ocupacao_pct: g('limite_ocupacao_pct'), dias_uteis_mes: g('dias_uteis_mes'), dso_dias: { grande: g('dso_grande'), medio: g('dso_medio') } };
    premissas.origem = { ...(D.premissas.origem || {}) }; for (const k of ['custo_pessoa_dia', 'margem_piso_pct', 'margem_meta_pct', 'custo_max_entrada', 'contrato_minimo_grandes', 'limite_ocupacao_pct', 'dias_uteis_mes']) if (String(premissas[k]) !== String(D.premissas[k] ?? '')) premissas.origem[k] = 'informado pelo fundador';
    try { D = await api('sim_premissas_salvar', { premissas }); nota('Premissas salvas'); render(); } catch (e) { nota(e.message, 'error'); } }
  async function salvarProd() { try { D = await api('sim_produto_salvar', ler()); ed = null; nota('Produto salvo'); render(); } catch (e) { nota(e.message, 'error'); } }
  window.EP = { sim: simular, salvarCen: async () => { try { CEN = (await api('sim_cenario_salvar', lerCen())).cenarios; cs.id = CEN.at(-1)?.id; nota('Cenário salvo'); render(); } catch (e) { nota(e.message, 'error'); } },
    abrirCen: id => { cs = JSON.parse(JSON.stringify(CEN.find(x => x.id === id))); render(); }, delCen: async id => { try { CEN = (await api('sim_cenario_excluir', { id })).cenarios; render(); } catch (e) { nota(e.message, 'error'); } },
    previaE, novaE: () => { ee = { publico: 'medio', degraus: {}, passagens: { AB: {}, BC: {} } }; render(); }, editarE: id => { ee = JSON.parse(JSON.stringify(D.esteiras.find(x => x.id === id))); render(); }, cancelarE: () => { ee = null; render(); },
    salvarE: async () => { try { D = await api('sim_esteira_salvar', lerE()); ee = null; nota('Esteira salva'); render(); } catch (e) { nota(e.message, 'error'); } },
    excluirE: async id => { if (!confirm('Excluir esta esteira?')) return; try { D = await api('sim_esteira_excluir', { id }); render(); } catch (e) { nota(e.message, 'error'); } },
    abrir, aba: async k => { aba = k; ed = null; ee = null; if (k === 'simulador') { try { CEN = (await api('sim_cenarios')).cenarios; } catch (_) {} } render(); }, salvarPrem, salvarProd, previa,
    novo: () => { ed = { publico: 'medio', degrau: 'A', tipo: 'entrada', status: 'rascunho', periodicidade: 'unico' }; render(); }, editar: id => { ed = D.produtos.find(x => x.id === id); render(); }, cancelar: () => { ed = null; render(); },
    acao: async (id, acao) => { try { D = await api('sim_produto_acao', { id, acao }); render(); } catch (e) { nota(e.message, 'error'); } },
    sementes: async () => { try { D = await api('sim_sementes'); nota('Exemplos carregados — hipótese a validar'); render(); } catch (e) { nota(e.message, 'error'); } } };
})();
