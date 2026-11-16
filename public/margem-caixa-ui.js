// v3.517 — MARGEM × CAIXA: onde a margem não vira caixa. Só dado do QuickBooks; o que falta aparece em "a confirmar / dado ausente".
(function () {
  const E = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const R = v => v == null || isNaN(v) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const P = v => v == null ? '—' : String(v).replace('.', ',') + '%', Dd = v => v == null ? '—' : String(v).replace('.', ',') + ' d';
  const box = () => document.getElementById('mcCorpo'); let D = null, SIM = {};
  const api = (a, p) => (window.finApi ? finApi(a, p, { timeoutMs: 120000 }) : Promise.reject(new Error('finApi indisponível')));
  const th = (...c) => '<tr style="color:var(--t3);text-align:right;font-size:10px;">' + c.map((x, i) => '<th style="padding:5px;' + (i === 0 ? 'text-align:left;' : '') + '">' + x + '</th>').join('') + '</tr>';
  const td = (...c) => '<tr style="border-top:1px solid var(--bd);text-align:right;">' + c.map((x, i) => '<td style="padding:5px;white-space:nowrap;' + (i === 0 ? 'text-align:left;font-weight:600;' : '') + '">' + x + '</td>').join('') + '</tr>';
  const sec = (t, fonte, corpo) => '<div style="margin:18px 0 8px;"><div style="font-weight:700;font-size:13px;">' + t + '</div><div style="font-size:10px;color:var(--t3);">Fonte: ' + fonte + '</div></div><div style="overflow-x:auto;">' + corpo + '</div>';
  const tab = (h, linhas) => '<table style="width:100%;border-collapse:collapse;font-size:11px;">' + h + linhas.join('') + '</table>';
  const card = (t, v, s, cor) => '<div style="background:var(--bg3);border:1px solid var(--bd);border-left:3px solid ' + (cor || 'var(--blue)') + ';border-radius:10px;padding:9px 12px;min-width:150px;flex:1;"><div style="font-size:10px;color:var(--t3);">' + t + '</div><div style="font-size:19px;font-weight:800;">' + v + '</div><div style="font-size:10px;color:var(--t2);">' + s + '</div></div>';

  async function abrir() { if (D) return render(); await carregar(); }
  async function carregar() {
    const b = box(); if (!b) return; b.innerHTML = '<div style="padding:24px;color:var(--t3);font-size:12px;">Lendo o QuickBooks (DRE por mês em competência e caixa, faturas, pagamentos, contas a pagar e balanço)… leva cerca de 1 minuto.</div>';
    try { D = await api('margem_caixa', { meses: 12 }); render(); } catch (e) { b.innerHTML = '<div style="color:var(--red);padding:16px;">Erro: ' + E(e.message) + ' <button class="btn btn-g" onclick="MC.carregar()">Tentar de novo</button></div>'; }
  }
  function render() {
    const b = box(); if (!b || !D) return; if (D.erro) { b.innerHTML = '<div style="padding:16px;color:var(--red);">' + E(D.erro) + '</div>'; return; }
    const M = D.metas || {}, V = M.veredito || {}, S = D.mensal || [], CG = D.capital_giro || {}, PZ = D.prazos || {}, neg = S.filter(x => x.margem_positiva_caixa_negativo);
    let h = '<div style="background:var(--bg3);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.7;"><b>Resumo (' + E(D.periodo.de) + ' a ' + E(D.periodo.ate) + ')</b><br>'
      + '1. EBITDA dos 12 meses: <b>' + R(M.ebitda_12m) + '</b> (' + P(M.ebitda_pct) + ' da receita de ' + R(M.receita_12m) + ') — meta 30%: <b>' + E(V.ebitda_acima_30) + '</b>.<br>'
      + '2. Caixa operacional: <b>' + R(M.caixa_operacional_12m) + '</b> · conversão de caixa <b>' + P(M.conversion_caixa_12m ?? M.conversao_caixa_12m) + '</b> · meses com margem positiva e caixa negativo: <b>' + neg.length + '</b>' + (neg.length ? ' (' + neg.map(x => x.mes).join(', ') + ')' : '') + '.<br>'
      + '3. Recebíveis: <b>' + R(CG.receber_aberto) + '</b> em aberto (' + R(CG.receber_vencido) + ' vencidos) = ' + (CG.dias_de_receita_em_aberto != null ? CG.dias_de_receita_em_aberto + ' dias de receita' : '—') + ' · prazo médio de recebimento ' + Dd(PZ.receber?.geral?.prazo_medio_receb_dias) + ' · ciclo de caixa ' + Dd(PZ.ciclo_caixa_dias) + '.<br>'
      + '4. Saldo mínimo de caixa: <b>' + (CG.saldo_minimo ? R(CG.saldo_minimo.saldo) + ' em ' + E(CG.saldo_minimo.mes) : 'dado ausente') + '</b>.<br>'
      + '5. Metas: ARR 30% em 2027 → <b>' + E(V.arr_30_em_2027) + '</b> · caixa positivo → <b>' + E(V.caixa_positivo) + '</b>.</div>';
    h += '<div style="font-size:10.5px;color:var(--t3);margin-top:6px;">Tudo vem do QuickBooks. Itens marcados <b style="color:var(--gold)">a confirmar</b> dependem do contador ou de dado que o sistema não tem. Nada aqui é estimado.</div>';
    // 1 mensal
    h += sec('1 · Por mês — faturado, recebido, margem, EBITDA e caixa', 'QuickBooks · DRE em competência (faturado, custos) e em caixa (recebido, pago). EBITDA = receita − custo dos serviços − despesas fixas (sem impostos, retiradas, juros e parcelamentos) · caixa operacional = recebido − pago, sem retiradas <span style="color:var(--gold)">(a confirmar com o contador)</span>',
      tab(th('Mês', 'Faturada', 'Recebida', 'Margem bruta', 'MB %', 'EBITDA', 'EBITDA %', 'Caixa operacional', 'Conversão de caixa', ''), S.map(x => td(x.mes, R(x.receita_faturada), R(x.receita_recebida), R(x.margem_bruta), P(x.margem_bruta_pct), R(x.ebitda), P(x.ebitda_pct), '<b style="color:' + (x.caixa_operacional < 0 ? 'var(--red)' : 'var(--green)') + '">' + R(x.caixa_operacional) + '</b>', P(x.conversao_caixa), x.margem_positiva_caixa_negativo ? '<span style="color:var(--red);font-weight:700;">⚠ margem + / caixa −</span>' : ''))));
    // clientes
    h += sec('2 · Por cliente — faturado, recebido, prazo e atraso', 'QuickBooks · faturas e pagamentos vinculados (últimos 12 meses). Tipo = motor marcado para o cliente (aproximação do tipo de contrato). Margem/EBITDA por cliente: <span style="color:var(--gold)">dado ausente</span> (o QuickBooks não liga custo a cliente)',
      tab(th('Cliente', 'Tipo', 'Faturada', 'Recebida', 'Em aberto', 'Vencido', 'Prazo médio receb.', 'Atraso médio (pago)', 'Atraso médio (aberto)', 'Valor médio aberto'), (D.clientes || []).slice(0, 40).map(x => td(E(x.cliente), E(x.motor || '—'), R(x.faturada), R(x.recebida), R(x.aberto), '<span style="color:' + (x.vencido > 0 ? 'var(--red)' : 'inherit') + '">' + R(x.vencido) + '</span>', Dd(x.prazo_medio_receb_dias), Dd(x.atraso_medio_pago_dias), Dd(x.atraso_medio_aberto_dias), R(x.valor_medio_aberto)))));
    // prazos
    h += sec('3 · Prazos e ciclo de caixa', 'QuickBooks · emissão → pagamento das faturas; data da conta → pagamento dos fornecedores',
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' + card('Prazo médio de recebimento', Dd(PZ.receber?.geral?.prazo_medio_receb_dias), 'atraso médio ' + Dd(PZ.receber?.geral?.atraso_medio_dias)) + card('Prazo médio a fornecedores', Dd(PZ.fornecedores?.prazo_medio_pagto_dias), (PZ.fornecedores?.contas || 0) + ' contas a pagar', 'var(--gold)') + card('Ciclo de caixa', Dd(PZ.ciclo_caixa_dias), 'recebimento − pagamento', 'var(--red)') + card('Prazo a pessoas', 'dado ausente', 'sem data de pagamento por pessoa', 'var(--t3)') + '</div>'
      + tab(th('Tipo de contrato (motor)', 'Prazo médio receb.', 'Atraso médio', 'Base recebida'), (PZ.receber?.por_motor || []).map(x => td(E(x.motor), Dd(x.prazo_medio_receb_dias), Dd(x.atraso_medio_dias), R(x.base_recebida)))));
    // capital de giro
    h += sec('4 · Capital de giro e saldo de caixa', 'QuickBooks · faturas em aberto e balanço mensal (contas bancárias)',
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' + card('Preso em contas a receber', R(CG.receber_aberto), (CG.meses_de_receita_em_aberto ?? '—') + ' mês(es) de receita') + card('Vencido', R(CG.receber_vencido), 'já deveria ser caixa', 'var(--red)') + card('Saldo mínimo (12 meses)', CG.saldo_minimo ? R(CG.saldo_minimo.saldo) : 'dado ausente', CG.saldo_minimo ? 'em ' + E(CG.saldo_minimo.mes) : '', 'var(--gold)') + '</div>'
      + (CG.saldos ? tab(th('Mês', 'Saldo no fim do mês'), CG.saldos.map(x => td(x.mes, R(x.saldo)))) : ''));
    // tributos
    const T = D.tributos || {};
    h += sec('5 · Tributos', 'QuickBooks (contas Taxes / Income Tax Expense) e instrução do Fabio', '<div style="font-size:11.5px;line-height:1.6;">Regime: ' + E(T.regime_informado) + '<br>Imposto pago/lançado em 12 meses: <b>' + R(T.impostos_12m) + '</b> · carga efetiva sobre a receita: <b>' + P(T.carga_efetiva_pct) + '</b><br>2027: ' + E(T.premissa_2027) + '<br><b style="color:var(--gold)">Dúvidas para o contador (a confirmar):</b><ol style="margin:4px 0 0 18px;">' + (T.duvidas_contador || []).map(x => '<li>' + E(x) + '</li>').join('') + '</ol></div>');
    // simulador
    h += sec('6 · Efeito das novas ofertas no caixa (simulador)', 'hipóteses de trabalho que você preenche + custo por pessoa-dia informado; saldo inicial = último saldo do QuickBooks', simHtml());
    // esteira
    const C = D.cac || {};
    h += sec('7 · Esteira de produtos (degraus A, B, C) e CAC', 'degraus definidos aqui (editáveis) · CAC do QuickBooks', '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' + card('CAC de cliente novo', R(C.cac_cliente_novo), R(C.comercial_12m) + ' de marketing/vendas ÷ ' + (C.clientes_novos_12m ?? 0) + ' cliente(s) novo(s)') + card('Custo de vender de novo ao cliente atual', 'a confirmar', 'o QuickBooks não separa', 'var(--gold)') + '</div>'
      + esteiraHtml() + '<div style="font-size:10.5px;color:var(--t3);margin-top:6px;">' + E(C.observacao) + ' Caixa e margem adicionados por degrau: <b style="color:var(--gold)">a confirmar</b> — as faturas não trazem o degrau; ao marcar cada cliente no degrau (motor) o sistema passa a separar.</div>');
    // metas
    h += sec('8 · Metas — o modelo atual chega lá?', 'cálculo acima · ARR = receita de clientes marcados como Produto/subscrição ÷ receita total <span style="color:var(--gold)">(proxy, a confirmar)</span>',
      '<div style="font-size:11.5px;line-height:1.7;">EBITDA &gt; 30%: <b>' + E(V.ebitda_acima_30) + '</b> · ARR 30% em 2027: <b>' + E(V.arr_30_em_2027) + '</b> · ARR 60% em 2031: <b>' + (M.arr_proxy_pct == null ? 'sem dado' : (M.arr_proxy_pct >= 60 ? 'já acima' : 'não, hoje em ' + P(M.arr_proxy_pct))) + '</b> · caixa positivo: <b>' + E(V.caixa_positivo) + '</b><br><b>Três maiores causas (por impacto):</b><ol style="margin:4px 0 0 18px;">' + ((M.tres_maiores_causas || []).map(c => '<li><b>' + E(c.causa) + '</b> — ' + R(c.impacto_ano) + ' · ' + E(c.detalhe) + '</li>').join('') || '<li>nenhuma meta em atraso com os dados disponíveis</li>') + '</ol></div>');
    // decisões e faltas
    h += sec('9 · Três decisões para o Fabio', 'aritmética sobre os dados acima', '<ol style="font-size:12px;line-height:1.7;margin-left:18px;">' + (D.decisoes || []).map(x => '<li><b>' + E(x.decisao) + '</b><br><span style="color:var(--t2);">Impacto no caixa: ' + E(x.impacto_caixa) + '</span></li>').join('') + '</ol>');
    h += sec('Dados que faltam (não foram estimados)', 'verificação desta análise', '<ul style="font-size:11.5px;line-height:1.6;margin-left:18px;">' + (D.faltando || []).map(x => '<li>' + E(x) + '</li>').join('') + (D.avisos || []).map(x => '<li style="color:var(--gold)">Aviso: ' + E(x) + '</li>').join('') + '</ul>');
    b.innerHTML = '<div style="display:flex;gap:8px;margin-bottom:10px;"><button class="btn btn-p" style="font-size:11px;" onclick="MC.carregar()">↻ Recalcular</button></div>' + h;
  }
  const inp = (k, ph, w, v) => '<input class="fi" style="width:' + (w || 90) + 'px;margin:0;font-size:11px;" placeholder="' + ph + '" value="' + E(SIM[k] ?? v ?? '') + '" onchange="MC.s(\'' + k + '\',this.value)">';
  function simHtml() {
    return '<div style="font-size:11px;line-height:2.1;">Custo por pessoa-dia (salário/PJ + encargos + ferramentas) R$ ' + inp('custo_dia', '276,56', 70, '276.56') + ' · saldo inicial R$ ' + inp('saldo', 'último saldo', 100, '') + '<br>'
      + '<b>Sprint de 10 dias</b>: preço R$ ' + inp('sp_preco', 'preço', 80) + ' · pessoas ' + inp('sp_pes', '2', 40, 2) + ' · sprints/mês (capacidade do Julio: 3) ' + inp('sp_qtd', '3', 40, 3) + ' · prazo se pago depois (dias) ' + inp('sp_prazo', '30', 50, 30) + '<br>'
      + '<b>Atlantyx OS</b>: mensalidade R$ ' + inp('os_valor', 'valor', 80) + ' · clientes novos/mês ' + inp('os_novos', '1', 40, 1) + ' · custo/cliente/mês R$ ' + inp('os_custo', '0', 70, 0) + '<br>'
      + '<b>Operação contínua (grandes)</b>: valor mensal R$ ' + inp('oc_valor', 'valor', 80) + ' · pessoas ' + inp('oc_pes', '3', 40, 3) + ' · contratos ' + inp('oc_q', '1', 40, 1) + '<br>'
      + '<b>Diagnóstico + POC / projeto sob medida (mínimo p/ grandes: R$ 50.000)</b>: valor total R$ ' + inp('poc_valor', 'valor', 80, 50000) + ' · parcelas ' + inp('poc_parc', '3', 40, 3) + ' · pessoas ' + inp('poc_pes', '2', 40, 2) + ' · dias de trabalho ' + inp('poc_dias', '30', 40, 30)
      + ' <button class="btn btn-p" style="font-size:11px;" onclick="MC.simular()">▶ Simular</button></div><div id="mcSim" style="margin-top:8px;font-size:11px;color:var(--t3);">Preencha os preços (hipóteses de trabalho) e clique em Simular. Já informados por você: custo R$ 276,56, 3 Sprints/mês, pagamento em 30 dias após a conclusão, projeto sob medida mínimo R$ 50.000. Os demais preços ficam em branco.</div>';
  }
  function esteiraHtml() {
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">' + ((D.esteira?.degraus) || []).map((d, i) => '<div style="background:var(--bg3);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;font-size:11px;line-height:1.5;"><div style="font-size:13px;font-weight:800;">Degrau ' + E(d.id) + ' · ' + E(d.nome) + '</div><div>' + E(d.oferta) + '</div><div style="color:var(--t2);"><b>Objetivo:</b> ' + E(d.objetivo) + '</div><div style="color:var(--t2);"><b>Cobrança:</b> ' + E(d.cobranca) + '</div><div style="color:var(--t2);"><b>Cliente:</b> ' + E(d.tipo_cliente) + ' · CAC ' + (d.fonte_cac === 'novo' ? 'de cliente novo' : 'de venda ao cliente atual') + '</div></div>').join('') + '</div>';
  }
  async function simular() {
    const n = k => Number(String(SIM[k] ?? '').replace(',', '.')) || 0, g = (k, d) => (SIM[k] === undefined || SIM[k] === '' ? d : n(k)), cd = g('custo_dia', 276.56), cen = [];
    const saldo = SIM.saldo !== undefined && SIM.saldo !== '' ? n('saldo') : (D?.capital_giro?.saldos?.slice(-1)[0]?.saldo || 0);
    if (n('sp_preco')) { cen.push({ nome: 'Sprint pago ANTES (à vista)', tipo: 'sprint', preco: n('sp_preco'), pessoas: g('sp_pes', 2), qtd_mes: g('sp_qtd', 3), custo_dia: cd, pagamento: 'antes' }); cen.push({ nome: 'Sprint pago DEPOIS (' + g('sp_prazo', 30) + ' dias)', tipo: 'sprint', preco: n('sp_preco'), pessoas: g('sp_pes', 2), qtd_mes: g('sp_qtd', 3), custo_dia: cd, pagamento: 'depois', prazo_dias: g('sp_prazo', 30) }); }
    if (n('os_valor')) ['inicio', 'fim'].forEach(c => cen.push({ nome: 'Atlantyx OS — mensalidade no ' + (c === 'inicio' ? 'INÍCIO' : 'FIM') + ' do mês', tipo: 'mensalidade', valor: n('os_valor'), clientes_novos_mes: g('os_novos', 1), custo_cliente_mes: n('os_custo'), cobranca: c }));
    if (n('oc_valor')) [30, 60, 90].forEach(p => cen.push({ nome: 'Operação contínua — prazo ' + p + ' dias', tipo: 'continua', valor: n('oc_valor'), pessoas: g('oc_pes', 3), contratos: g('oc_q', 1), custo_dia: cd, prazo_dias: p }));
    const pocV = g('poc_valor', 50000); if (pocV) { cen.push({ nome: 'Diagnóstico + POC — 1 parcela', tipo: 'poc', valor: pocV, parcelas: 1, meses_entre: 1, pessoas: g('poc_pes', 2), dias: g('poc_dias', 30), custo_dia: cd }); cen.push({ nome: 'Diagnóstico + POC — ' + g('poc_parc', 3) + ' parcelas', tipo: 'poc', valor: pocV, parcelas: g('poc_parc', 3), meses_entre: 1, pessoas: g('poc_pes', 2), dias: g('poc_dias', 30), custo_dia: cd }); }
    const o = document.getElementById('mcSim'); if (!cen.length) { o.textContent = 'Informe ao menos um preço.'; return; }
    o.textContent = 'Simulando…'; try { const r = await api('margem_caixa_simular', { cenarios: cen, saldo_inicial: saldo });
      o.innerHTML = tab(th('Cenário', 'Caixa mínimo (acumulado)', 'Mês do mínimo', 'Mês de recuperação'), (r.resultados || []).map(x => td(E(x.nome), '<b style="color:' + (x.caixa_minimo < saldo ? 'var(--red)' : 'inherit') + '">' + R(x.caixa_minimo) + '</b>', x.mes_do_minimo ? 'mês ' + x.mes_do_minimo : '—', x.mes_recuperacao === 0 ? 'não há queda' : x.mes_recuperacao ? 'mês ' + x.mes_recuperacao : 'não recupera em 12 meses'))) + '<div style="font-size:10px;color:var(--t3);margin-top:4px;">Saldo inicial usado: ' + R(saldo) + '. Efeito incremental de cada oferta isolada, 12 meses; mês 1 = próximo mês.</div>'; } catch (e) { o.innerHTML = '<span style="color:var(--red)">' + E(e.message) + '</span>'; }
  }
  window.MC = { abrir, carregar, simular, s: (k, v) => { SIM[k] = v; } };
})();
