// public/cenarios-ui.js — v3.605 aba "Cenários 2027" do Planejamento Estratégico (Jelta, IARA, Maestro, grandes projetos, sustentação, funil isca → IA)
// Só mostra e recalcula (lib/cenarios.js). Os números são hipóteses; o CEO edita as premissas aqui.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const R = v => v == null ? '—' : 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const P = v => v == null ? '—' : Math.round(v * 100) + '%';
  const N1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('pt-BR');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const S = { d: null, ocupado: false };
  async function api(action, corpo) {
    const r = await fetch('/api/s1-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(corpo || {}) }) });
    const d = await r.json().catch(() => ({ success: false, error: 'Resposta inválida (HTTP ' + r.status + ')' }));
    if (!r.ok || d.success === false) throw new Error(d.error || 'HTTP ' + r.status); return d;
  }
  function css() {
    if ($('cen-css')) return; const s = document.createElement('style'); s.id = 'cen-css';
    s.textContent = '.cen-av{background:var(--bg3);border:1px solid var(--bd);border-left:3px solid var(--amber,#d9a400);border-radius:8px;padding:9px 12px;font-size:11px;color:var(--t2);margin-bottom:10px;line-height:1.5}' +
      '.cen-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.cen-lid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px}' +
      '.cen-lid div{background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:8px 10px}.cen-lid span{font-size:10px;color:var(--t2);display:block}.cen-lid b{font-size:15px}' +
      '.cen-t{width:100%;border-collapse:collapse;font-size:11px;margin:6px 0 10px}.cen-t th{font-size:10px;color:var(--t2);text-align:left;padding:5px 6px;white-space:nowrap;border-bottom:1px solid var(--bd)}' +
      '.cen-t td{padding:5px 6px;border-top:1px solid var(--bd);vertical-align:top}.cen-t td.v,.cen-t th.v{text-align:right;white-space:nowrap}.cen-t tr.tot td{font-weight:700}' +
      '.cen-d{border:1px solid var(--bd);border-radius:8px;margin-bottom:8px;background:var(--bg2,transparent)}.cen-d>summary{cursor:pointer;padding:9px 12px;font-weight:700;font-size:12.5px}.cen-d>div{padding:2px 12px 10px;overflow-x:auto}' +
      '.cen-d h4{font-size:11px;margin:10px 0 2px;color:var(--t2)}.cen-d ul{margin:4px 0 0 16px;padding:0;font-size:11px;line-height:1.55;color:var(--t2)}' +
      '.cen-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}.cen-g label{font-size:10.5px;color:var(--t2);display:flex;flex-direction:column;gap:2px}.cen-g input{padding:4px 6px;font-size:12px;width:100%;box-sizing:border-box}';
    document.head.appendChild(s);
  }
  const tab = (cab, linhas, vcols) => '<table class="cen-t"><thead><tr>' + cab.map((c, i) => `<th class="${i && (vcols === undefined || i >= vcols) ? 'v' : ''}">${esc(c)}</th>`).join('') + '</tr></thead><tbody>' + linhas.map(l => `<tr class="${l.tot ? 'tot' : ''}">` + l.c.map((c, i) => `<td class="${i && (vcols === undefined || i >= vcols) ? 'v' : ''}">${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
  const lista = a => '<ul>' + a.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
  const det = (t, corpo, aberto) => `<details class="cen-d"${aberto ? ' open' : ''}><summary>${t}</summary><div>${corpo}</div></details>`;

  function cenTab(cs, clientesRot) {
    const cab = ['Indicador'].concat(cs.map(c => c.clientes + ' ' + clientesRot));
    const L = (nome, f, tot) => ({ c: [nome].concat(cs.map(f)), tot });
    return tab(cab, [L('ARR (receita recorrente anual)', c => R(c.arr)), L('Receita bruta do 1º ano', c => R(c.bruta)), L('Margem de contribuição do 1º ano', c => R(c.contrib) + ' · ' + P(c.margem1)), L('Investimento no produto', c => R(c.invest)),
      L('Resultado do 1º ano após o investimento', c => R(c.resultado1), true), L('Resultado anual em run-rate', c => R(c.runrate)), L('Margem em run-rate', c => P(c.margemRR)), L('Meses para pagar o investimento', c => N1(c.payback))]);
  }
  function comparativo(r) {
    const c = r.comparativo, prods = [['Jelta', r.gelta.cenarios], ['IARA', r.iara.cenarios], ['Maestro', r.maestro.cenarios]];
    const lid = `<div class="cen-lid"><div><span>Maior ARR (cenário B)</span><b>${esc(c.maiorArr)}</b></div><div><span>Maior resultado no 1º ano</span><b>${esc(c.maiorResultado1)}</b></div><div><span>Maior margem em run-rate</span><b>${esc(c.maiorMargemRR)}</b></div><div><span>Retorno mais rápido do investimento</span><b>${esc(c.retornoMaisRapido || '—')}</b></div></div>`;
    const bloco = (tit, f) => `<h4>${tit}</h4>` + tab(['Produto'].concat(r.clientes.map(n => n + ' clientes')), prods.map(p => ({ c: [p[0]].concat(p[1].map(f)) })));
    const qual = tab(['Produto', 'Esforço de venda', 'Risco principal', 'Dependência'], [
      { c: ['Jelta', 'Médio: já existe cliente-âncora e dor clara', 'Extração de dados do Dealer Net', 'Dealer Net (API ou contrato)'] },
      { c: ['IARA', 'Alto: ainda não vendeu; precisa de prova de resultado', 'Taxa de qualificação e reputação do domínio', 'WhatsApp, e-mail e enriquecimento'] },
      { c: ['Maestro', 'Alto: venda a PMO de grande empresa, ciclo longo', 'Ciclo de venda e custo de IA por projeto', 'Cliente-âncora a definir'] }], 99);
    return lid + `<div class="cen-av">${esc(r.leitura.aviso)}</div>` + bloco('ARR em run-rate', x => R(x.arr)) + bloco('Resultado do 1º ano após o investimento', x => R(x.resultado1)) + bloco('Resultado anual em run-rate', x => R(x.runrate)) + bloco('Margem em run-rate (% da receita bruta)', x => P(x.margemRR)) + bloco('Meses para pagar o investimento', x => N1(x.payback)) + '<h4>Esforço, risco e dependência</h4>' + qual;
  }
  function gelta(r) {
    const g = r.gelta, s = g.suite;
    const mods = tab(['Módulo', 'Receita/mês do grupo', 'Líquido após imposto', 'Custo de entrega/mês', 'Margem', 'Adoção esperada'], g.modulos.map(m => ({ c: [esc(m.nome), R(m.rec), R(m.liq), R(m.custo), P(m.margem), P(m.adocao)] })).concat([{ tot: true, c: ['Suíte completa', R(s.rec), R(s.liq), R(s.custo), P(s.margem), '—'] }, { tot: true, c: ['Grupo típico (ponderado pela adoção)', R(s.recPond), R(s.liqPond), R(s.custoPond), P(s.margemPond), '—'] }]));
    const cam = tab(['Caminho de venda', 'Receita/mês', '% do gasto com Dealer Net', 'Margem', 'Como usar (hipótese)'], g.caminhos.map(c => ({ c: [esc(c.nome), R(c.rec), P(c.pctDealerNet), P(c.margem), esc(c.uso)] })), 1);
    const sa = g.sanidade;
    return mods + '<h4>Cenários por número de grupos</h4>' + cenTab(g.cenarios, 'grupos') + '<h4>Caminhos de venda frente ao Dealer Net</h4>' + cam +
      `<h4>Teste de sanidade com o Jelta (${sa.lojas} lojas)</h4><p style="font-size:11px;color:var(--t2);margin:2px 0">${sa.pago > 0 ? `O projeto do Jelta soma ${R(sa.pago)}${sa.parcelas > 0 ? ' em ' + N1(sa.parcelas) + ' parcelas mensais de ' + R(sa.parcela) : ''} (${R(sa.porLoja)} por loja) — é receita de PROJETO, não recorrente. ` : 'Informe nas premissas o valor total e as parcelas do projeto Jelta (parcelado mensal) para comparar. '}A suíte completa em subscrição para ${sa.lojas} lojas seria ${R(sa.mensal)} por mês (${R(sa.anual)} por ano)${sa.pago > 0 ? ': equivale ao valor do projeto em ' + N1(sa.mesesParaIgualar) + ' meses' : ''}.</p>` + '<h4>Leitura</h4>' + lista(r.leitura.gelta);
  }
  function produto(r, k, rot, linhas) {
    return tab(['Economia de um cliente (por mês)', 'Valor'], linhas.map(l => ({ c: [l[0], l[1]] }))) + '<h4>Cenários por número de clientes</h4>' + cenTab(r[k].cenarios, 'clientes') + '<h4>Leitura</h4>' + lista(r.leitura[k]);
  }
  function frentes(r) {
    const f = r.frentes, rot = ['Conservador', 'Base', 'Agressivo'], rotF = ['Hoje', 'Meta', 'Escala'];
    const gp = tab(['Grandes projetos'].concat(rot), [['Projetos fechados', x => N1(x.projetos)], ['Ticket médio', x => R(x.ticket)], ['Receita bruta', x => R(x.bruta)], ['Custo de equipe', x => R(x.custo)], ['Margem de contribuição', x => R(x.contrib) + ' · ' + P(x.margem)], ['Caixa que só entra no ano seguinte', x => R(x.caixaProximoAno)]].map(l => ({ c: [l[0]].concat(f.gp.map(l[1])) })));
    const su = tab(['Sustentação'].concat(rot), [['Valor entregue sustentado', x => R(x.valor)], ['Receita de sustentação', x => R(x.rec)], ['Custo de entrega', x => R(x.custo)], ['Margem de contribuição', x => R(x.contrib) + ' · ' + P(x.margem)]].map(l => ({ c: [l[0]].concat(f.sust.map(l[1])) })));
    const fu = tab(['Produto isca → serviço de IA → projeto grande'].concat(rotF), [['Leads por mês', x => N1(x.leads)], ['Reuniões no ano', x => N1(x.reunioes)], ['Diagnósticos pagos', x => N1(x.diagnosticos)], ['Serviços de IA contratados', x => N1(x.servicos)], ['Projetos grandes originados', x => N1(x.projetos)],
      ['Receita bruta total', x => R(x.bruta)], ['Margem de contribuição', x => R(x.contrib) + ' · ' + P(x.margem)], ['ARR dos serviços de IA', x => R(x.arrIA)], ['Marketing por cliente de IA', x => R(x.mktPorCliente)]].map(l => ({ c: [l[0]].concat(f.funil.map(l[1])) })));
    return gp + su + fu + '<h4>Leitura</h4>' + lista(r.leitura.frentes);
  }
  function editor(d) {
    const grupos = []; d.campos.forEach(c => { let g = grupos.find(x => x.n === c.grupo); if (!g) grupos.push(g = { n: c.grupo, c: [] }); g.c.push(c); });
    const campo = c => { const v = d.valores[c.id], mostra = c.fmt === 'pct' ? Math.round(v * 1000) / 10 : v; return `<label>${esc(c.rot)}${c.fmt === 'pct' ? ' (%)' : c.fmt === 'brl' ? ' (R$)' : ''}<input type="number" step="any" min="0" data-cen="${esc(c.id)}" data-fmt="${c.fmt}" value="${mostra}"></label>`; };
    return `<p style="font-size:11px;color:var(--t2);margin:6px 0">Troque os números e clique em Salvar e recalcular. Só o CEO/administrador salva. "Restaurar padrão" volta às hipóteses originais.</p>` +
      grupos.map(g => det(esc(g.n), `<div class="cen-g">${g.c.map(campo).join('')}</div>`, false)).join('') +
      '<div class="cen-bar"><button class="btn btn-p" onclick="CENARIOS.salvar()">Salvar e recalcular</button><button class="btn" onclick="CENARIOS.restaurar()">Restaurar padrão</button></div>';
  }
  function render() {
    const box = $('peTabCen'); if (!box || !S.d) return; const d = S.d, r = d.resultado, ed = d.alterados.length;
    box.innerHTML = '<div class="cen-av"><b>Hipóteses de trabalho, não dados de clientes.</b> Preços, adoção e conversões vêm da conversa com o Fabio e precisam ser validados com o Jelta e com 2 a 3 grupos-alvo. ' +
      (ed ? `Há ${ed} premissa(s) alterada(s) em relação ao padrão${d.por ? ' por ' + esc(d.por) : ''}.` : 'Nenhuma premissa alterada ainda.') + '</div>' +
      '<div class="cen-bar"><button class="btn btn-p" onclick="window._estAbaInicial=\'conselho\';nav(\'s0estrategia\')">🏛️ Debater com o Conselho</button><button class="btn" onclick="CENARIOS.abrir()">↻ Recalcular</button></div>' +
      det('Comparativo dos três produtos', comparativo(r), true) +
      det('Jelta — cockpit para concessionárias (módulos por setor)', gelta(r), false) +
      det('IARA — agente comercial de IA', produto(r, 'iara', 'IARA', [['Receita fixa', R(r.iara.cliente.fixa)], ['Receita variável (leads qualificados)', R(r.iara.cliente.variavel)], ['Receita total por mês', R(r.iara.cliente.rec)], ['Custo de infra e IA', R(r.iara.cliente.infra)], ['Custo de equipe', R(r.iara.cliente.equipe)], ['Margem por cliente', R(r.iara.cliente.margemRS) + ' · ' + P(r.iara.cliente.margem)], ['Custo por lead qualificado', R(r.iara.cliente.custoPorLead)], ['Margem se a qualificação cair pela metade', P(r.iara.cliente.margemMetade)]]), false) +
      det('Maestro — gestão de portfólio de projetos com IA', produto(r, 'maestro', 'Maestro', [['Receita total por mês', R(r.maestro.cliente.rec)], ['Custo de infra e IA', R(r.maestro.cliente.infra)], ['Custo de equipe', R(r.maestro.cliente.equipe)], ['Margem por cliente', R(r.maestro.cliente.margemRS) + ' · ' + P(r.maestro.cliente.margem)], ['Margem se o consumo de IA dobrar', P(r.maestro.cliente.margemIADobra)]]), false) +
      det('Grandes projetos, sustentação e produto isca com serviços de IA', frentes(r), false) +
      det('Editar premissas', editor(d), false);
  }
  async function abrir() {
    const box = $('peTabCen'); if (!box) return; css();
    try { S.d = await api('cenarios_obter'); render(); }
    catch (e) { box.innerHTML = '<div style="color:var(--red);font-size:11px;padding:14px;">Não carreguei os cenários: ' + esc(e.message) + '</div>'; }
  }
  async function salvar() {
    if (S.ocupado) return; S.ocupado = true;
    try {
      const valores = {}; document.querySelectorAll('#peTabCen input[data-cen]').forEach(i => { const x = Number(i.value); if (i.value !== '' && Number.isFinite(x)) valores[i.dataset.cen] = i.dataset.fmt === 'pct' ? x / 100 : x; });
      S.d = await api('cenarios_salvar', { valores }); render(); nota('Premissas salvas e cenários recalculados');
    } catch (e) { nota(e.message, 'error'); } finally { S.ocupado = false; }
  }
  async function restaurar() {
    if (S.ocupado || !confirm('Voltar todas as premissas para o padrão?')) return; S.ocupado = true;
    try { S.d = await api('cenarios_restaurar'); render(); nota('Premissas restauradas'); } catch (e) { nota(e.message, 'error'); } finally { S.ocupado = false; }
  }
  window.CENARIOS = { abrir, salvar, restaurar };
})();
