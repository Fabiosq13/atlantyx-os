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
  let D = null, ed = null, aba = 'produtos', tmr = null;
  const COR = { verde: 'var(--green)', amarelo: 'var(--gold)', vermelho: 'var(--red)', cinza: 'var(--t3)' };
  const PUB = { grande: 'Grande', medio: 'Médio', atuais: 'Clientes atuais' };
  const ABAS = [['produtos', 'Produtos', 1], ['esteira', 'Esteira', 0], ['simulador', 'Simulador', 0], ['escala', 'Teste de escala', 0], ['catalogo', 'Catálogo', 0]];

  async function abrir() { await carregar(); }
  async function carregar() {
    const b = $('epApp'); if (b && !D) b.innerHTML = '<div style="padding:30px;color:var(--t3);">Carregando…</div>';
    try { D = await api('sim_obter'); render(); } catch (e) { if (b) b.innerHTML = '<div style="color:var(--red);padding:16px;">Erro: ' + E(e.message) + '</div>'; }
  }
  function render() {
    const b = $('epApp'); if (!b || !D) return;
    let h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' + ABAS.map(([k, t, ok]) => '<button class="btn ' + (aba === k ? 'btn-p' : 'btn-g') + '" style="font-size:11px;' + (ok ? '' : 'opacity:.5;') + '" ' + (ok ? 'onclick="EP.aba(\'' + k + '\')"' : 'disabled title="Próxima fase"') + '>' + t + (ok ? '' : ' · em breve') + '</button>').join('') + '</div>';
    h += premissasHtml();
    h += ed ? editorHtml() : listaHtml();
    b.innerHTML = h; if (ed) previa();
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
  const num = id => $(id)?.value ?? '';
  async function salvarPrem() {
    const g = k => num('epp_' + k), premissas = { custo_pessoa_dia: g('custo_pessoa_dia'), margem_piso_pct: g('margem_piso_pct'), margem_meta_pct: g('margem_meta_pct'), impostos_pct: g('impostos_pct'), comissao_pct: g('comissao_pct'), custo_max_entrada: g('custo_max_entrada'), contrato_minimo_grandes: g('contrato_minimo_grandes'), limite_ocupacao_pct: g('limite_ocupacao_pct'), dias_uteis_mes: g('dias_uteis_mes'), dso_dias: { grande: g('dso_grande'), medio: g('dso_medio') } };
    premissas.origem = { ...(D.premissas.origem || {}) }; for (const k of ['custo_pessoa_dia', 'margem_piso_pct', 'margem_meta_pct', 'custo_max_entrada', 'contrato_minimo_grandes', 'limite_ocupacao_pct', 'dias_uteis_mes']) if (String(premissas[k]) !== String(D.premissas[k] ?? '')) premissas.origem[k] = 'informado pelo fundador';
    try { D = await api('sim_premissas_salvar', { premissas }); nota('Premissas salvas'); render(); } catch (e) { nota(e.message, 'error'); } }
  async function salvarProd() { try { D = await api('sim_produto_salvar', ler()); ed = null; nota('Produto salvo'); render(); } catch (e) { nota(e.message, 'error'); } }
  window.EP = { abrir, aba: k => { aba = k; render(); }, salvarPrem, salvarProd, previa,
    novo: () => { ed = { publico: 'medio', degrau: 'A', tipo: 'entrada', status: 'rascunho', periodicidade: 'unico' }; render(); }, editar: id => { ed = D.produtos.find(x => x.id === id); render(); }, cancelar: () => { ed = null; render(); },
    acao: async (id, acao) => { try { D = await api('sim_produto_acao', { id, acao }); render(); } catch (e) { nota(e.message, 'error'); } },
    sementes: async () => { try { D = await api('sim_sementes'); nota('Exemplos carregados — hipótese a validar'); render(); } catch (e) { nota(e.message, 'error'); } } };
})();
