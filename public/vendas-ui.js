// public/vendas-ui.js — v3.24 · Área de Vendas: Painel de Vendas IA + Elaboração de Propostas
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const R = v => (v == null || isNaN(v)) ? '—' : 'R$ ' + Math.round(+v).toLocaleString('pt-BR');
  const P = v => (v == null || isNaN(v)) ? '—' : (+v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const N = v => (v == null || isNaN(v)) ? '—' : (+v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const nota = (t, c) => (window.toast ? toast(t, c || 'success') : alert(t));
  // v3.85: ms > 0 → timeout explícito (AbortController) e erro legível em vez de "HTTP 0" / espera sem fim
  async function api(action, payload = {}, ms) {
    const ctrl = ms ? new AbortController() : null; const tm = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    let d;
    try { const r = await fetch('/api/vendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }), signal: ctrl ? ctrl.signal : undefined });
      d = await r.json().catch(e => { if (e.name === 'AbortError') throw e; return { success: false, error: r.status === 504 ? 'O servidor demorou demais para responder (HTTP 504).' : 'O servidor respondeu HTTP ' + r.status + ' sem dados.' }; }); }
    catch (e) { throw new Error(e.name === 'AbortError' ? `O servidor não respondeu em ${Math.round(ms / 1000)}s — tente novamente em instantes.` : 'Sem resposta do servidor (falha de rede ou conexão interrompida). Verifique a internet e tente novamente.'); }
    finally { if (tm) clearTimeout(tm); }
    if (!d.success) throw new Error(d.error || 'falha'); return d;
  }
  const PN_MS = 30000; // nenhum fetch do Painel de Vendas fica pendente além disso
  const ocupado = (btn, txt) => { if (!btn) return () => {}; const o = btn.innerHTML; btn.disabled = true; btn.innerHTML = txt || 'Processando...'; return () => { btn.disabled = false; btn.innerHTML = o; }; };
  const FMT = { tm: 'Alocação por hora (T&M)', fechado: 'Escopo fechado', mensal: 'Mensalidade recorrente', hibrido: 'Híbrido: setup + mensalidade' };
  const TIPOS = { escopo_fechado: 'Projeto com escopo claro', evolucao: 'Evolução contínua / backlog', sustentacao: 'Sustentação / SLA', alocacao: 'Alocação de profissionais', produto: 'Produto / plataforma + serviço', indefinido: 'Ainda indefinido' };
  const STATUS = { rascunho: 'Rascunho', enviada: 'Enviada', negociacao: 'Em negociação', ganha: 'Ganha', perdida: 'Perdida' };
  const corSit = s => /abaixo/.test(s) ? 'var(--red)' : /acima/.test(s) ? 'var(--green)' : /dentro/.test(s) ? 'var(--blue)' : 'var(--t3)';
  const barra = (v, max, cor) => `<div style="background:var(--bg4);height:6px;border-radius:4px;overflow:hidden;"><div style="width:${Math.max(0, Math.min(100, (v || 0) / (max || 1) * 100))}%;height:100%;background:${cor};"></div></div>`;

  // ═══════════════════════════ PAINEL DE VENDAS IA ═══════════════════════════
  let PN = null, PN_SEQ = 0;
  async function painelAbrir() {
    const box = $('vdPainel'); if (!box) return;
    if (!box.dataset.ok) { box.dataset.ok = '1'; box.innerHTML = painelEsqueleto(); }
    await painelCarregar();
  }
  function painelEsqueleto() {
    return `<div class="cp-top"><div style="flex:1;min-width:0;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">Painel de Vendas IA</div>
        <div style="font-size:10.5px;color:var(--t2);">Quanto falta, quantas vendas você precisa, como estão as margens — e o que fazer hoje</div></div>
      <button class="btn btn-g" id="vdBtnAtualizar" onclick="VD.painelCarregar(true)">↻ Atualizar</button>
      <button class="btn btn-p" id="vdBtnCoach" onclick="VD.coach()">🤖 O que fazer hoje</button></div>
      <div id="painel-erro"></div><div id="vdPnStatus"></div><div id="vdCoach"></div><div id="vdPnCorpo">${painelSkeleton()}</div>`;
  }
  // v3.85: skeleton dos KPIs enquanto o painel carrega (antes: texto "Calculando..." sem prazo)
  function painelSkeleton() {
    const b = (w, h) => `<div style="background:var(--bg4);border-radius:4px;height:${h}px;width:${w};margin:6px 0;animation:pulse 1.8s ease-in-out infinite;opacity:.6;"></div>`;
    const k = `<div class="kpi">${b('55%', 9)}${b('70%', 20)}${b('85%', 8)}</div>`;
    return `<div class="panel"><div class="pb">${b('35%', 10)}${b('90%', 8)}${b('75%', 8)}</div></div><div class="kg k4">${k + k + k + k}</div><div class="kg k4">${k + k + k + k}</div>
      <div style="font-size:10.5px;color:var(--t3);text-align:center;padding:6px;">Calculando metas, funil e margens (QuickBooks + HubSpot)...</div><div id="vdRF">${rfHtml()}</div>`;
  }
  function painelErro(msg, forcar) {
    const e = $('painel-erro'); if (!e) return;
    e.innerHTML = msg ? `<div class="panel" style="border-left:4px solid var(--red);"><div class="pb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <span style="color:var(--red);flex:1;min-width:220px;font-size:11.5px;">⚠ ${esc(msg)}</span><button class="btn btn-g" onclick="VD.painelCarregar(${forcar === true})">↻ Tentar novamente</button></div></div>` : '';
  }
  function painelStatus(txt, alerta) { const s = $('vdPnStatus'); if (s) s.innerHTML = txt ? `<div style="font-size:10.5px;color:${alerta ? 'var(--gold)' : 'var(--t2)'};padding:0 2px 8px;">${esc(txt)}</div>` : ''; }
  const idadeTxt = s => { const m = Math.max(1, Math.round((s || 0) / 60)); return m >= 60 ? Math.round(m / 60) + ' h' : m + ' min'; };
  function painelStatusCache(d) {
    const k = d && d._cache; if (!k) return painelStatus(null);
    if (k.aviso) return painelStatus(`${k.aviso} (calculado há ${idadeTxt(k.idade_s)})`, true);
    painelStatus(k.stale ? `Dados calculados há ${idadeTxt(k.idade_s)} — atualizando em segundo plano...` : null);
  }
  // v3.85 (QA 02/10): KPIs com timeout de 30s; erro legível em #painel-erro com "Tentar novamente";
  // o "↻ Atualizar" mantém os dados já exibidos e mostra o erro real em vez de travar
  async function painelCarregar(forcar) {
    const c = $('vdPnCorpo'); if (!c) return;
    const seq = ++PN_SEQ, btn = $('vdBtnAtualizar');
    if (btn) { btn.disabled = true; btn.innerHTML = '↻ Atualizando...'; }
    painelErro(''); if (!PN) c.innerHTML = painelSkeleton();
    rfCarregar(forcar === true); // v3.94: Receita Futura 60 dias carrega em paralelo, independente dos KPIs
    if (forcar === true) painelStatus('Recalculando metas, funil e margens (QuickBooks + HubSpot)...');
    try { const d = await api('painel', forcar === true ? { forcar: true } : {}, PN_MS); if (seq !== PN_SEQ) return;
      c.innerHTML = painelHtml(d); PN = d; painelStatusCache(PN); estrategiaListar();
      // v3.69: veio do cache e está desatualizado → mostra já e recalcula em segundo plano
      if (PN._cache && PN._cache.stale && !PN._cache.aviso && forcar !== true) { const ant = PN;
        api('painel', { forcar: true }, PN_MS).then(n => { if (PN === ant && $('vdPnCorpo')) { $('vdPnCorpo').innerHTML = painelHtml(n); PN = n; painelStatusCache(PN); estrategiaListar(); } })
          .catch(e => { if (PN === ant) painelStatus(`Dados calculados há ${idadeTxt(ant._cache.idade_s)} — não consegui recalcular agora: ${e.message}`, true); }); } }
    catch (e) { if (seq !== PN_SEQ) return; painelStatus(null);
      if (!PN) c.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3);font-size:11px;">Os indicadores aparecem aqui assim que o servidor responder.</div><div id="vdRF">' + rfHtml() + '</div>';
      painelErro((forcar === true ? 'Não consegui atualizar o painel: ' : 'Erro ao montar o painel: ') + e.message + (PN ? ' Mostrando os últimos dados carregados.' : ''), forcar); }
    finally { if (seq === PN_SEQ && btn) { btn.disabled = false; btn.innerHTML = '↻ Atualizar'; } }
  }
  function painelHtml(d) {
    const m = d.metas, k = d.calculo, mg = d.margens, f = k.funil_ano || {};
    const cob = (d.cobrancas || []).map(x => `<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--bd);font-size:11.5px;"><span style="color:${x.nivel === 'alta' ? 'var(--red)' : 'var(--gold)'};font-weight:700;">${x.nivel === 'alta' ? '●' : '○'}</span><span>${esc(x.texto)}</span></div>`).join('');
    const kpi = (cl, t, v, s) => `<div class="kpi ${cl}"><div class="kl">${t}</div><div class="kv">${v}</div><div class="ks">${s || ''}</div></div>`;
    const tipoNome = { entrega: 'Projetos (entrega)', sustentacao: 'Sustentação', alocacao: 'Alocação' };
    const blocoMargem = (nome, x) => !x ? '' : `<div style="background:var(--bg4);border-radius:8px;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;"><b>${nome}</b><span style="color:var(--t2);">${x.projetos} projeto(s) · ${R(x.receita_mensal)}/mês</span></div>
        <div style="font-size:20px;font-weight:700;font-family:var(--M);margin:4px 0;color:${x.margem_bruta_pct == null ? 'var(--t3)' : x.margem_bruta_pct < x.benchmark.min ? 'var(--red)' : 'var(--green)'};">${P(x.margem_bruta_pct)}</div>
        <div style="position:relative;height:8px;background:var(--bg3);border-radius:4px;margin:6px 0;">
          <div style="position:absolute;left:${x.benchmark.min}%;width:${x.benchmark.max - x.benchmark.min}%;height:100%;background:rgba(34,211,163,.25);border-radius:4px;" title="faixa de mercado"></div>
          ${x.margem_bruta_pct != null ? `<div style="position:absolute;left:calc(${Math.max(0, Math.min(100, x.margem_bruta_pct))}% - 2px);width:4px;height:12px;top:-2px;background:var(--t1);border-radius:2px;"></div>` : ''}</div>
        <div style="font-size:9.5px;color:var(--t2);">Mercado: ${x.benchmark.min}–${x.benchmark.max}% · contribuição (com overhead): ${P(x.margem_contribuicao_pct)}</div></div>`;
    return `
    <div class="panel" style="border-left:4px solid var(--red);"><div class="ph"><div class="pt">📌 Cobranças de hoje</div><span style="font-size:10px;color:var(--t2);">o CRM não deixa esquecer</span></div><div class="pb" style="padding-top:4px;">${cob || '<div style="color:var(--green);font-size:11px;">Nada pendente — metas cobertas.</div>'}</div></div>
    <div class="kg k4">
      ${kpi('bl', 'Meta anual', P(m.pct_ano), `${R(m.realizado_ano)} de ${R(m.meta_anual)} · faltam <b>${R(m.gap_ano)}</b>`)}
      ${kpi('gd', 'Meta do mês', P(m.pct_mes), `${R(m.realizado_mes)} de ${R(m.meta_mensal)} · ${m.dias_uteis_mes} dias úteis`)}
      ${kpi('or', 'Vendas a fechar (meta anual)', k.vendas_ano ?? '—', `${N(f.propostas)} propostas · ${N(f.reunioes)} reuniões · ${N(f.leads)} leads`)}
      ${kpi('pu', 'Ritmo por semana', k.ritmo_semanal ? N(k.ritmo_semanal.reunioes_semana) + ' reuniões' : '—', k.ritmo_semanal ? `${N(k.ritmo_semanal.propostas_semana)} propostas · ${N(k.ritmo_semanal.leads_semana)} leads` : '')}
    </div>
    <div class="kg k4">
      ${kpi('bl', 'Cobertura do pipeline', k.cobertura_pipeline != null ? N(k.cobertura_pipeline) + 'x' : '—', `${R(m.pipeline_total)} em ${m.deals_abertos || 0} oportunidades · alvo 3x`)}
      ${kpi('gn', 'Recorrência', P(d.recorrencia.pct_meta_mensal), `${R(d.recorrencia.mensal)}/mês · meta ${d.recorrencia.meta_pct}% da receita`)}
      ${kpi('gd', 'Propostas em aberto', d.propostas.abertas, `${R(d.propostas.valor_aberto)} · ${d.propostas.paradas} parada(s) > 7 dias`)}
      ${kpi('or', 'Ganhas / perdidas', `${d.propostas.ganhas} / ${d.propostas.perdidas}`, `win rate usado: ${P(k.win_rate_pct)}`)}
    </div>
    <div id="vdRF">${rfHtml(m)}</div>
    <details class="panel" style="padding:10px 14px;"><summary style="cursor:pointer;font-size:11.5px;font-weight:600;">Como o sistema calculou "quantas vendas" (premissas editáveis)</summary>
      <div style="font-size:11px;color:var(--t2);line-height:1.8;margin-top:8px;">
        Ticket médio <b>${R(k.ticket_medio)}</b> (${esc(k.ticket_fonte)}) · duração média <b>${N(k.duracao_media_meses)} meses</b> · ciclo de venda <b>${k.ciclo_dias} dias</b> · win rate <b>${P(k.win_rate_pct)}</b> (${esc(k.win_fonte)}).<br>
        Vendas necessárias = o que falta da meta anual ÷ ticket médio = <b>${k.vendas_ano ?? '—'}</b> contratos a assinar. Mas uma venda fechada hoje só começa a faturar depois do ciclo e fatura ao longo da duração: até 31/12 ela gera <b>${R(k.receita_no_ano_por_venda)}</b> (${P(k.fracao_reconhecida_no_ano_pct)} do valor) — para o <i>faturamento</i> do ano fechar só com vendas novas seriam ${k.vendas_ano_por_receita_no_ano ?? '—'}.
        Para o mês: ${k.vendas_mes ? `seriam necessárias ${k.vendas_mes} vendas já faturando — o mês se fecha com o que já está contratado e com antecipações.` : 'meta do mês coberta.'}<br>
        Fontes: receita ${esc(m.fonte?.receita)} · pipeline ${esc(m.fonte?.pipeline)} (peso ${k.premissas.peso_pipeline}% no ponderado).</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;font-size:10.5px;">
        <label>Lead → reunião (%)<br><input class="fi" id="vdTxLR" title="Taxa de conversão de lead em reunião (%)" style="width:110px;" value="${k.premissas.taxa_lead_reuniao}"/></label>
        <label>Reunião → proposta (%)<br><input class="fi" id="vdTxRP" title="Taxa de conversão de reunião em proposta (%)" style="width:110px;" value="${k.premissas.taxa_reuniao_proposta}"/></label>
        <label>Peso do pipeline (%)<br><input class="fi" id="vdTxPP" title="Peso do pipeline na projeção (%)" style="width:110px;" value="${k.premissas.peso_pipeline}"/></label>
        <button class="btn btn-g" onclick="VD.premissasSalvar()">💾 Salvar premissas</button></div></details>
    <div class="panel"><div class="ph"><div class="pt">📈 Margens — projetos, sustentação e geral x mercado</div><span style="font-size:10px;color:var(--t2);">margem bruta = receita líquida − custo da equipe alocada (RH)</span></div><div class="pb">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:12px;">
        ${blocoMargem('Geral', mg.geral)}${Object.entries(mg.por_tipo || {}).map(([t, x]) => blocoMargem(tipoNome[t] || t, x)).join('')}</div>
      <div class="tw"><table style="min-width:760px;"><thead><tr><th>Projeto</th><th>Tipo</th><th style="text-align:right;">Receita/mês</th><th style="text-align:right;">Custo equipe/mês</th><th style="text-align:right;">Margem bruta</th><th>Mercado</th><th>Situação</th></tr></thead><tbody>
        ${(mg.linhas || []).map(l => `<tr><td><b>${esc(l.projeto)}</b><div style="font-size:9.5px;color:var(--t3);">${esc(l.cliente || '')}</div></td><td>${esc(tipoNome[l.tipo] || l.tipo)}</td><td style="text-align:right;font-family:var(--M);">${R(l.receita_mensal)}</td><td style="text-align:right;font-family:var(--M);">${l.custo_mensal ? R(l.custo_mensal) : '<span style="color:var(--gold);font-size:10px;" title="Aloque a equipe deste projeto em RH → Cadastro de Funcionários">sem equipe alocada</span>'}</td>
          <td style="text-align:right;font-family:var(--M);font-weight:700;color:${corSit(l.situacao)};">${l.margem_bruta_pct != null ? P(l.margem_bruta_pct) : '<span style="color:var(--t3);font-weight:400;font-size:10px;">sem custo para calcular</span>'}</td><td style="font-size:10px;color:var(--t2);">${l.benchmark.min}–${l.benchmark.max}%</td><td style="font-size:10.5px;color:${corSit(l.situacao)};">${esc(l.situacao)}</td></tr>`).join('') || '<tr><td colspan="7" style="color:var(--t3);text-align:center;">Sem projetos cadastrados no financeiro.</td></tr>'}</tbody></table></div>
      ${(mg.sem_dados || []).length ? `<div style="font-size:10px;color:var(--gold);margin-top:6px;">Sem margem calculável (aloque a equipe no RH → Cadastro de Funcionários): ${esc(mg.sem_dados.join(', '))}</div>` : ''}
      <div style="font-size:9.5px;color:var(--t3);margin-top:6px;line-height:1.5;">${esc(mg.nota)} Referências: ${esc(mg.geral.benchmark.ref)} · ${Object.values(mg.por_tipo || {}).map(x => esc(x.benchmark.ref)).join(' · ')}. Benchmarks de mercado (estudos de serviços profissionais e serviços gerenciados) — ajustáveis.</div></div></div>
    <div class="panel"><div class="ph"><div class="pt">🧭 Estratégia para bater a meta</div><span style="font-size:10px;color:var(--t2);">período sugerido pela natureza da sua venda (ciclo de ${k.ciclo_dias} dias): <b>${esc(d.periodo_sugerido)}</b></span></div><div class="pb">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
        <select class="fsel" id="vdEstTipo" title="Período da estratégia" style="width:150px;" onchange="VD.estRef()">${['mensal', 'trimestral', 'semestral', 'anual'].map(t => `<option ${t === d.periodo_sugerido ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input class="fi" id="vdEstRef" style="width:140px;" title="Período (ex.: 2026-10, 2026-T4)" aria-label="Período"/>
        <input class="fi" id="vdEstTit" style="flex:1;min-width:200px;" placeholder="Título (ex.: Fechar Q4 com 3 contratos de sustentação)"/>
        <button class="btn btn-g" id="vdBtnEstIA" onclick="VD.estSugerir()">🤖 Rascunho com IA</button>
        <button class="btn btn-p" onclick="VD.estSalvar()">💾 Salvar</button></div>
      <input type="hidden" id="vdEstId"/>
      <textarea class="fta" id="vdEstTexto" style="min-height:220px;font-size:12px;line-height:1.7;" placeholder="Escreva aqui a estratégia do período: metas, contas-alvo, ofertas, cadência, quem faz o quê..."></textarea>
      <div id="vdEstLista" style="margin-top:10px;font-size:11px;"></div></div></div>`;
  }
  // ═══════════════ v3.94: RECEITA FUTURA 60 DIAS (Propostas + A Receber + meta) ═══════════════
  // Propostas: mesma API de s7propostas (prop_listar); "em aberto" = enviada + negociacao (mesmo critério do KPI "Propostas em aberto").
  // Recebíveis: mesmas linhas de s3receber (_recLinhas = lançamentos manuais + faturas QB de painel_resumo), mesmo critério de vencido.
  const RF_DIAS = 60, RF_MS = 15000;
  const RF_ESTAGIOS = { negociacao: { nome: 'Em negociação', prob: 60 }, enviada: { nome: 'Aguardando aprovação', prob: 30 } }; // probabilidade por estágio (premissa temporária)
  let RF = null, RF_SEQ = 0;
  const rfTentar = async fn => { try { return await fn(); } catch (_) { return await fn(); } }; // timeout de 15s + 1 nova tentativa
  async function rfPropostas() {
    const d = await rfTentar(() => api('prop_listar', {}, RF_MS));
    const est = {}; let total = 0, ponderado = 0, qtd = 0;
    (d.propostas || []).forEach(p => { const e = RF_ESTAGIOS[p.status]; if (!e) return; const v = +p.valor_total || 0;
      const g = est[p.status] || (est[p.status] = { nome: e.nome, prob: e.prob, qtd: 0, valor: 0 });
      g.qtd++; g.valor += v; total += v; ponderado += v * e.prob / 100; qtd++; });
    return { total, ponderado, qtd, estagios: est };
  }
  async function rfRecebiveis(forcar) {
    if (typeof _recLinhas !== 'function') throw new Error('módulo A Receber indisponível');
    let erro = '';
    try { if (!receberItems.length) { const s = localStorage.getItem('atx:receber'); const v = s ? JSON.parse(s) : null; if (Array.isArray(v)) receberItems = v; } } catch (_) {}
    if (forcar || !_recQBCarregado) {
      try { const d = await rfTentar(() => finApi('painel_resumo', {}, { timeoutMs: RF_MS }));
        const it = d && d.contasReceber && d.contasReceber.itens;
        if (Array.isArray(it)) { receberQBItems = it; _recQBCarregado = true; _recQBErro = ''; } else if (d && !d.qb_configurado) _recQBCarregado = true; }
      catch (e) { erro = e.message || String(e); }
    }
    const r = { aVencer: 0, qtdAVencer: 0, alerta: 0, qtdAlerta: 0, vencido: 0, qtdVencido: 0, linhas: [], erro };
    _recLinhas().forEach(l => {
      if (l.dias == null) return;
      if (l.status === 'vencido') { r.vencido += l.valor; r.qtdVencido++; r.linhas.push(l); }
      else if (l.dias <= RF_DIAS) { r.aVencer += l.valor; r.qtdAVencer++; if (l.status === 'alerta') { r.alerta += l.valor; r.qtdAlerta++; } r.linhas.push(l); }
    });
    r.linhas.sort((a, b) => a.dias - b.dias);
    return r;
  }
  async function rfCarregar(forcar) {
    const seq = ++RF_SEQ; RF = null; rfRender();
    const [p, r] = await Promise.allSettled([rfPropostas(), rfRecebiveis(forcar === true)]);
    if (seq !== RF_SEQ) return;
    const msg = x => (x && x.message) || 'falha';
    RF = { prop: p.status === 'fulfilled' ? p.value : null, propErro: p.status === 'rejected' ? msg(p.reason) : '',
      rec: r.status === 'fulfilled' ? r.value : null, recErro: r.status === 'rejected' ? msg(r.reason) : r.value.erro };
    rfRender();
  }
  function rfRender() { const el = $('vdRF'); if (el) el.innerHTML = rfHtml(); }
  function rfHtml(metas) {
    const mt = metas || (PN && PN.metas) || {};
    const cab = `<div class="ph"><div class="pt">💰 Receita Futura ${RF_DIAS} dias</div><span style="font-size:10px;color:var(--t2);flex:1;">propostas em aberto + parcelas a receber até ${new Date(Date.now() + RF_DIAS * 864e5).toLocaleDateString('pt-BR')}</span>
      <button class="btn btn-g" style="font-size:9.5px;padding:3px 9px;" onclick="VD.rfIr('s7propostas')">Ver propostas →</button>
      <button class="btn btn-g" style="font-size:9.5px;padding:3px 9px;" onclick="VD.rfIr('s3receber')">Ver recebíveis →</button></div>`;
    const card = (cor, t, v, s) => `<div class="kpi" style="border-left:3px solid ${cor};"><div class="kl">${t}</div><div class="kv" style="color:${cor};">${v}</div><div class="ks">${s || ''}</div></div>`;
    if (!RF) {
      const b = (w, h) => `<div style="background:var(--bg4);border-radius:4px;height:${h}px;width:${w};margin:6px 0;animation:pulse 1.8s ease-in-out infinite;opacity:.6;"></div>`;
      const k = `<div class="kpi">${b('55%', 9)}${b('70%', 20)}${b('85%', 8)}</div>`;
      return `<div class="panel">${cab}<div class="pb"><div class="kg k4" style="margin:0;">${k + k + k + k}</div></div></div>`;
    }
    const pr = RF.prop, rc = RF.rec, erroTxt = t => `<span style="color:var(--red);">${esc(t)}</span>`;
    const cProp = pr ? card('var(--blue)', 'Proposto (ponderado)', R(pr.ponderado), `${pr.qtd} proposta(s) em aberto · total ${R(pr.total)}<br>${Object.values(pr.estagios).map(g => `${esc(g.nome)}: ${g.qtd} · ${R(g.valor)} × ${g.prob}%`).join('<br>') || 'nenhuma enviada ou em negociação'}`)
      : card('var(--t3)', 'Proposto (ponderado)', '—', erroTxt(RF.propErro));
    const cRec = rc ? card(rc.qtdAlerta ? 'var(--gold)' : 'var(--green)', 'Contratado a receber', R(rc.aVencer), `${rc.qtdAVencer} parcela(s) a vencer em ${RF_DIAS} dias<br>${rc.qtdAlerta ? `<span style="color:var(--gold);">● ${rc.qtdAlerta} vence(m) em até 7 dias · ${R(rc.alerta)}</span>` : '<span style="color:var(--green);">● todas no prazo</span>'}`)
      : card('var(--t3)', 'Contratado a receber', '—', erroTxt(RF.recErro));
    const cRisco = rc ? card(rc.qtdVencido ? 'var(--red)' : 'var(--green)', 'Em risco (vencido)', R(rc.vencido), rc.qtdVencido ? `${rc.qtdVencido} parcela(s) vencida(s) ou vencendo hoje` : 'nenhuma parcela vencida')
      : card('var(--t3)', 'Em risco (vencido)', '—', erroTxt(RF.recErro));
    const metaPer = mt.meta_mensal ? mt.meta_mensal * RF_DIAS / 30 : null;
    const proj = (pr ? pr.ponderado : 0) + (rc ? rc.aVencer : 0);
    const pct = metaPer ? proj / metaPer * 100 : null;
    const corPct = pct == null ? 'var(--t3)' : pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--gold)' : 'var(--red)';
    const cMeta = card(corPct, '% da meta coberto', pct == null ? '—' : P(pct),
      metaPer ? `${R(proj)} projetado de ${R(metaPer)} (meta mensal ${R(mt.meta_mensal)} × ${RF_DIAS / 30})${barra(pct, 100, corPct)}` : 'meta mensal ainda não carregada (KPIs acima)');
    const lin = rc && rc.linhas.length ? `<div style="margin-top:10px;font-size:11px;">${rc.linhas.slice(0, 8).map(l => `<div style="display:flex;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid var(--bd);">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><b>${esc(l.cliente)}</b>${l.doc ? ` <span style="color:var(--t3);font-size:10px;">${esc(l.doc)}</span>` : ''}</span>
        <span style="font-family:var(--M);">${R(l.valor)}</span><span style="color:var(--t2);font-size:10.5px;">${esc(_recDataBR(l.vencimento))}</span><span>${_recBadge(l.dias)}</span></div>`).join('')}
      ${rc.linhas.length > 8 ? `<div style="font-size:10px;color:var(--t3);padding-top:5px;">+ ${rc.linhas.length - 8} parcela(s) — veja todas em A Receber</div>` : ''}</div>` : '';
    const aviso = rc && RF.recErro ? `<div style="font-size:10px;color:var(--gold);margin-top:6px;">QuickBooks indisponível agora (${esc(RF.recErro.substring(0, 140))}) — mostrando só os lançamentos manuais.</div>` : '';
    return `<div class="panel">${cab}<div class="pb"><div class="kg k4" style="margin:0;">${cProp + cRec + cRisco + cMeta}</div>${lin}${aviso}
      <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">Ponderação por estágio: ${Object.values(RF_ESTAGIOS).map(e => `${e.nome} ${e.prob}%`).join(' · ')}. Vencido = vence hoje ou já venceu (mesmo critério de A Receber).</div></div></div>`;
  }
  function rfIr(p) {
    if (p === 's7propostas') { const b = $('vdProp'); if (b) b.dataset.aba = 'lista'; } // abre direto na lista, onde estão os mesmos valores
    nav(p, document.querySelector(`.sbi[onclick*="'${p}'"]`));
  }

  function estRef() {
    const t = $('vdEstTipo')?.value, d = new Date(), el = $('vdEstRef'); if (!el) return;
    el.value = t === 'mensal' ? d.toISOString().substring(0, 7) : t === 'trimestral' ? `${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}` : t === 'semestral' ? `${d.getFullYear()}-S${d.getMonth() < 6 ? 1 : 2}` : String(d.getFullYear());
  }
  async function estrategiaListar() {
    estRef();
    try { const d = await api('estrategia_listar', {}, PN_MS); const box = $('vdEstLista'); if (!box) return; window._vdEst = d.estrategias;
      if (d.estrategias[0] && !$('vdEstTexto').value) estAbrir(d.estrategias[0].id);
      box.innerHTML = d.estrategias.length ? '<div style="color:var(--t2);margin-bottom:4px;">Estratégias salvas:</div>' + d.estrategias.map(e => `<span style="display:inline-flex;gap:6px;align-items:center;background:var(--bg4);border-radius:6px;padding:4px 8px;margin:0 6px 6px 0;"><a href="javascript:void(0)" onclick="VD.estAbrir('${e.id}')" style="color:var(--blue);">${esc(e.periodo_tipo)} ${esc(e.periodo_ref || '')} — ${esc((e.titulo || '').substring(0, 40) || 'sem título')}</a><a href="javascript:void(0)" title="Excluir" onclick="VD.estExcluir('${e.id}')" style="color:var(--t3);">✕</a></span>`).join('') : '';
    } catch (_) {}
  }
  function estAbrir(id) { const e = (window._vdEst || []).find(x => x.id === id); if (!e) return; $('vdEstId').value = e.id; $('vdEstTipo').value = e.periodo_tipo; $('vdEstRef').value = e.periodo_ref || ''; $('vdEstTit').value = e.titulo || ''; $('vdEstTexto').value = e.texto || ''; }
  async function estSalvar() {
    const texto = $('vdEstTexto').value.trim(); if (!texto) return nota('Escreva a estratégia antes de salvar', 'error');
    try { const r = await api('estrategia_salvar', { id: $('vdEstId').value || null, periodo_tipo: $('vdEstTipo').value, periodo_ref: $('vdEstRef').value, titulo: $('vdEstTit').value, texto, metas: PN ? { metas: PN.metas, vendas_ano: PN.calculo.vendas_ano } : {} }, PN_MS);
      $('vdEstId').value = r.id; nota('Estratégia salva'); estrategiaListar(); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  async function estExcluir(id) { if (!confirm('Excluir esta estratégia?')) return; try { await api('estrategia_excluir', { id }, PN_MS); } catch (e) { return nota('Erro: ' + e.message, 'error'); } if ($('vdEstId').value === id) { $('vdEstId').value = ''; $('vdEstTexto').value = ''; } estrategiaListar(); }
  async function estSugerir() {
    const fim = ocupado($('vdBtnEstIA'), '🤖 Escrevendo...');
    try { const r = await api('estrategia_sugerir', { periodo_tipo: $('vdEstTipo').value, periodo_ref: $('vdEstRef').value }, PN_MS);
      const t = $('vdEstTexto'); if (t.value.trim() && !confirm('Substituir o texto atual pelo rascunho da IA?')) { fim(); return; } t.value = r.texto; $('vdEstId').value = ''; nota('Rascunho pronto — revise e salve'); }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim();
  }
  // v3.85: a IA roda à parte — não bloqueia nem apaga os KPIs; timeout de 30s com erro legível e "Tentar novamente"
  async function coach() {
    const fim = ocupado($('vdBtnCoach'), '🤖 Analisando...'); const box = $('vdCoach');
    if (box) box.innerHTML = '<div class="panel"><div class="pb" style="font-size:11px;color:var(--blue);">🤖 O diretor comercial IA está lendo metas, funil, propostas e margens e montando o plano do dia (até 30 segundos)...</div></div>';
    try { const r = await api('coach', {}, PN_MS); if (box) box.innerHTML = `<div class="panel" style="border-left:4px solid var(--blue);"><div class="ph"><div class="pt">🤖 Diretor comercial IA</div><button class="btn btn-g" style="font-size:9px;padding:3px 8px;" onclick="document.getElementById('vdCoach').innerHTML=''">✕</button></div><div class="pb" style="white-space:pre-wrap;font-size:12px;line-height:1.7;">${esc(r.resposta)}</div></div>`; }
    catch (e) { if (box) box.innerHTML = `<div class="panel" style="border-left:4px solid var(--red);"><div class="pb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><span style="color:var(--red);flex:1;min-width:220px;font-size:11.5px;">⚠ O que fazer hoje: ${esc(e.message)}</span><button class="btn btn-g" onclick="VD.coach()">↻ Tentar novamente</button></div></div>`; } fim();
  }
  async function premissasSalvar() {
    try { await api('premissas_salvar', { premissas: { taxa_lead_reuniao: +$('vdTxLR').value || 20, taxa_reuniao_proposta: +$('vdTxRP').value || 50, peso_pipeline: +$('vdTxPP').value || 30 } }, PN_MS); nota('Premissas salvas'); painelCarregar(); }
    catch (e) { nota('Erro: ' + e.message, 'error'); }
  }

  // ═══════════════════════════ ELABORAÇÃO DE PROPOSTAS ═══════════════════════════
  let PROP = null, RC = [], CFG = null;
  const novaProp = () => ({ id: null, cliente: '', contato: '', titulo: '', status: 'rascunho', formato: null, dados: { tipo_demanda: 'indefinido', meses: 3, risco: 'medio', perfis: [], escopo: '', inicio: '', orcamento_cliente: '', orcamento_tipo: 'total' }, analise: null, documento: null });
  async function propAbrir() {
    const box = $('vdProp'); if (!box) return;
    if (!box.dataset.ok) { box.dataset.ok = '1'; box.innerHTML = propEsqueleto(); PROP = novaProp(); }
    const ctx = rfpCtxLer();
    if (ctx && PROP && PROP.dados.escopo && !PROP.id && !confirm('Descartar a proposta em edição (não salva) e abrir a da RFP?')) { aba(box.dataset.aba || 'nova'); return; }
    try { const [rc, cfg] = await Promise.all([api('rate_card'), api('prop_config')]); RC = rc.rate_card || []; CFG = cfg; } catch (_) {}
    if (!ctx) return aba(box.dataset.aba || 'nova');
    // Ponte s2rfps → s7propostas: formulário pré-preenchido com o edital e rascunho IA disparado
    PROP = novaProp(); PROP.cliente = ctx.cliente || ''; PROP.titulo = ctx.titulo || '';
    Object.assign(PROP.dados, { escopo: ctx.escopo || '', orcamento_cliente: /\d/.test(ctx.valorRef || '') ? ctx.valorRef : '', orcamento_tipo: 'total', rfp_origem: { rfp_id: ctx.rfp_id, link: ctx.link, fonte: ctx.fonte, prazo: ctx.prazo, rfp_recebida: ctx.rfp_recebida, identificada_em: ctx.identificada_em, proposta_criada_em: new Date().toISOString() } });
    rfpLog(PROP.dados.rfp_origem, null);
    aba('nova'); nota('Proposta pré-preenchida com a RFP — a IA está montando o rascunho');
    rascunhoRFP();
  }
  // ?rfp_ctx=<base64 de JSON UTF-8> (gerado por abrirPropostaRFP em index.html); consumido uma vez e removido da URL
  function rfpCtxLer() {
    let u; try { u = new URL(location.href); } catch (_) { return null; }
    const b64 = u.searchParams.get('rfp_ctx'); if (!b64) return null;
    u.searchParams.delete('rfp_ctx'); if (u.searchParams.get('tela') === 's7propostas') u.searchParams.delete('tela'); try { history.replaceState(null, '', u.toString()); } catch (_) {}
    try { const bin = atob(b64); return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))); }
    catch (e) { nota('Contexto da RFP inválido: ' + e.message, 'error'); return null; }
  }
  // Log de rastreabilidade RFP → proposta (Log do sistema + sessionStorage rfp_id → proposta_id)
  function rfpLog(o, prop) {
    if (!o || !o.rfp_id) return;
    let m = {}; try { m = JSON.parse(sessionStorage.getItem('atx_rfp_propostas') || '{}'); } catch (_) {}
    m[o.rfp_id] = { ...(m[o.rfp_id] || {}), rfp_recebida: o.rfp_recebida || null, identificada_em: o.identificada_em || null, proposta_criada_em: o.proposta_criada_em || null, ...(prop ? { proposta_id: prop.id, proposta_numero: prop.numero, salva_em: new Date().toISOString() } : {}) };
    try { sessionStorage.setItem('atx_rfp_propostas', JSON.stringify(m)); } catch (_) {}
    if (window.addLog) addLog(prop ? 'success' : 'info', '[S7 · Propostas] ' + (prop ? 'Proposta ' + esc(prop.numero || prop.id) + ' salva — originada da RFP ' : 'Rascunho aberto a partir da RFP ') + esc(o.rfp_id) + (o.rfp_recebida ? ' · RFP recebida em ' + esc(o.rfp_recebida) : '') + ' · proposta criada em ' + esc(new Date(o.proposta_criada_em || Date.now()).toLocaleString('pt-BR')));
  }
  // Rascunho IA encadeado: estimar equipe → analisar formatos → redigir; para (com aviso) no primeiro passo que precisar do usuário
  async function rascunhoRFP() {
    if (!(await estimar(true))) return;
    if (!(await analisar())) return;
    await redigir();
  }
  function propEsqueleto() {
    return `<div class="cp-top"><div style="flex:1;min-width:0;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">Elaboração de Propostas</div>
      <div style="font-size:10.5px;color:var(--t2);">Escopo → equipe e horas → melhor formato para as metas e para o cliente → proposta no padrão Atlantyx</div></div>
      <div class="seg" id="vdAbas"><button data-a="nova" onclick="VD.aba('nova')">Nova / editar</button><button data-a="lista" onclick="VD.aba('lista')">Propostas</button><button data-a="aprender" onclick="VD.aba('aprender')">Aprendizado</button><button data-a="rate" onclick="VD.aba('rate')">Rate card e parâmetros</button></div>
      <button class="btn btn-p" onclick="VD.nova()">＋ Nova proposta</button></div><div id="vdPropCorpo"></div>`;
  }
  function aba(a) {
    $('vdProp').dataset.aba = a; document.querySelectorAll('#vdAbas button').forEach(b => b.classList.toggle('on', b.dataset.a === a));
    const c = $('vdPropCorpo'); if (a === 'nova') { c.innerHTML = formHtml(); preencherForm(); } else if (a === 'lista') listar(); else if (a === 'aprender') aprenderAbrir(); else rateAbrir();
  }
  function nova() { if (PROP && PROP.dados.escopo && !PROP.id && !confirm('Descartar a proposta em edição (não salva)?')) return; PROP = novaProp(); aba('nova'); }
  function formHtml() {
    return `<div class="kg k2">
      <div class="panel"><div class="ph"><div class="pt">① Cliente e escopo</div></div><div class="pb">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="fg"><label class="fl">Cliente</label><input class="fi" id="vpCliente" list="vpClientesDL" placeholder="Ex.: CPFL Energia"/><datalist id="vpClientesDL"></datalist></div>
          <div class="fg"><label class="fl">Contato / decisor</label><input class="fi" id="vpContato" placeholder="Nome e cargo"/></div></div>
        <div class="fg"><label class="fl">Título da proposta</label><input class="fi" id="vpTitulo" placeholder="Ex.: Plataforma de dados de geração eólica"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div class="fg"><label class="fl">Natureza da demanda</label><select class="fsel" id="vpTipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="fg"><label class="fl">Prazo (meses)</label><input class="fi" id="vpMeses" type="number" min="1" max="60"/></div>
          <div class="fg"><label class="fl">Início</label><input class="fi" id="vpInicio" type="month"/></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div class="fg"><label class="fl">Risco do escopo</label><select class="fsel" id="vpRisco"><option value="baixo">Baixo — escopo claro</option><option value="medio" selected>Médio</option><option value="alto">Alto — muita incerteza</option></select></div>
          <div class="fg"><label class="fl">Orçamento do cliente (se souber)</label><input class="fi" id="vpOrc" placeholder="R$"/></div>
          <div class="fg"><label class="fl">O orçamento é</label><select class="fsel" id="vpOrcTipo"><option value="total">Total do projeto</option><option value="mensal">Por mês</option></select></div></div>
        <div class="fg"><label class="fl">Escopo / necessidade do cliente</label><textarea class="fta" id="vpEscopo" style="min-height:120px;" placeholder="O que o cliente precisa, entregáveis, sistemas envolvidos, volume, prazos, restrições..."></textarea></div>
        <button class="btn btn-or" id="vpBtnEstimar" onclick="VD.estimar()" style="width:100%;justify-content:center;">🤖 Estimar equipe e horas</button></div></div>
      <div class="panel"><div class="ph"><div class="pt">② Equipe, horas e custo</div><button class="btn btn-g" style="font-size:9.5px;padding:3px 8px;" onclick="VD.addPerfil()">+ perfil</button></div><div class="pb">
        <datalist id="vpPerfisDL">${RC.map(x => `<option value="${esc(x.perfil)}">`).join('')}</datalist>
        <div class="tw"><table style="min-width:520px;"><thead><tr><th>Perfil</th><th style="width:80px;">Horas</th><th style="width:90px;">Custo/h</th><th style="width:90px;">Preço/h</th><th style="width:26px;"></th></tr></thead><tbody id="vpPerfis"></tbody></table></div>
        <div id="vpEstInfo" style="font-size:10.5px;color:var(--t2);margin-top:8px;line-height:1.6;"></div>
        <button class="btn btn-p" id="vpBtnAnalisar" onclick="VD.analisar()" style="width:100%;justify-content:center;margin-top:10px;">◆ Analisar formatos x metas</button></div></div></div>
      <div id="vpAnalise"></div><div id="vpDoc"></div>
      <div class="cp-acoes"><button class="btn btn-gn" onclick="VD.salvar()" style="flex:1;justify-content:center;font-weight:700;">💾 Salvar proposta</button>
        <button class="btn btn-g" onclick="VD.baixarPdf()">⬇ PDF</button><button class="btn btn-g" onclick="VD.baixarWord()">⬇ Word</button>
        <button class="btn btn-g" onclick="VD.mudarStatus(null,'enviada')">📨 Marcar como enviada</button></div>`;
  }
  function preencherForm() {
    const d = PROP.dados; $('vpCliente').value = PROP.cliente || ''; $('vpContato').value = PROP.contato || ''; $('vpTitulo').value = PROP.titulo || '';
    $('vpTipo').value = d.tipo_demanda || 'indefinido'; $('vpMeses').value = d.meses || ''; $('vpInicio').value = d.inicio || ''; $('vpRisco').value = d.risco || 'medio';
    $('vpOrc').value = d.orcamento_cliente || ''; $('vpOrcTipo').value = d.orcamento_tipo || 'total'; $('vpEscopo').value = d.escopo || '';
    renderPerfis(); if (PROP.analise) renderAnalise(); if (PROP.documento) renderDoc();
    if (!$('vpClientesDL').dataset.ok) { $('vpClientesDL').dataset.ok = '1'; fetch('/api/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clientes_listar', payload: {} }) }).then(r => r.json()).then(d => { $('vpClientesDL').innerHTML = (d.clientes || []).map(c => `<option value="${esc(c.empresa)}">`).join(''); }).catch(() => {}); }
  }
  function lerForm() {
    const d = PROP.dados; PROP.cliente = $('vpCliente').value.trim(); PROP.contato = $('vpContato').value.trim(); PROP.titulo = $('vpTitulo').value.trim();
    Object.assign(d, { tipo_demanda: $('vpTipo').value, meses: +$('vpMeses').value || null, inicio: $('vpInicio').value, risco: $('vpRisco').value, orcamento_cliente: $('vpOrc').value, orcamento_tipo: $('vpOrcTipo').value, escopo: $('vpEscopo').value.trim() });
    d.perfis = [...document.querySelectorAll('#vpPerfis tr')].map(tr => { const g = c => tr.querySelector(`[data-c="${c}"]`)?.value; return { perfil: g('perfil'), horas: +g('horas') || 0, custo_hora: +String(g('custo')).replace(',', '.') || null, preco_hora: +String(g('preco')).replace(',', '.') || null, justificativa: tr.dataset.just || '' }; }).filter(x => x.perfil);
  }
  function renderPerfis() {
    const tb = $('vpPerfis'); if (!tb) return;
    tb.innerHTML = (PROP.dados.perfis || []).map((x, i) => `<tr data-just="${esc(x.justificativa || '')}"><td><input class="fi" data-c="perfil" list="vpPerfisDL" value="${esc(x.perfil)}" onchange="VD.perfilRC(this)" title="${esc(x.justificativa || '')}"/></td>
      <td><input class="fi" data-c="horas" type="number" value="${x.horas || ''}"/></td><td><input class="fi" data-c="custo" value="${x.custo_hora ?? ''}" placeholder="RH"/></td><td><input class="fi" data-c="preco" value="${x.preco_hora ?? ''}" placeholder="rate card"/></td>
      <td><a href="javascript:void(0)" onclick="this.closest('tr').remove()" style="color:var(--red);">✕</a></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--t3);text-align:center;font-size:11px;">Estime com a IA ou adicione perfis do rate card.</td></tr>';
  }
  function addPerfil() { lerForm(); PROP.dados.perfis.push({ perfil: '', horas: 0 }); renderPerfis(); }
  function perfilRC(inp) { const c = RC.find(x => x.perfil.toLowerCase() === inp.value.toLowerCase()); if (!c) return; const tr = inp.closest('tr'); const s = (k, v) => { const e = tr.querySelector(`[data-c="${k}"]`); if (e && !e.value && v != null) e.value = v; }; s('custo', c.custo_hora); s('preco', c.preco_alvo); }
  async function estimar(auto) {
    lerForm(); if ((PROP.dados.escopo || '').length < 30) return nota('Descreva o escopo (pelo menos 30 caracteres)', 'error');
    if (!RC.length && !auto && !confirm('O rate card está vazio — a IA vai sugerir perfis sem custo. Continuar? (cadastre em "Rate card e parâmetros")')) return;
    const fim = ocupado($('vpBtnEstimar'), '🤖 Estimando...');
    try { const r = await api('estimar', { escopo: PROP.dados.escopo, tipo_demanda: PROP.dados.tipo_demanda, meses: PROP.dados.meses });
      PROP.dados.perfis = r.perfis; PROP.dados.estimativa = r; if (!PROP.dados.meses && r.meses) PROP.dados.meses = r.meses; if (r.risco) PROP.dados.risco = r.risco;
      preencherForm(); const sem = r.perfis.filter(x => !x.no_rate_card).map(x => x.perfil);
      $('vpEstInfo').innerHTML = `<b>${r.perfis.reduce((a, x) => a + (+x.horas || 0), 0)} horas</b> em ${r.meses || PROP.dados.meses} meses · risco ${esc(r.risco || '')}${sem.length ? `<br><span style="color:var(--gold);">Fora do rate card (informe custo/preço): ${esc(sem.join(', '))}</span>` : ''}${(r.premissas || []).length ? '<br>Premissas: ' + esc(r.premissas.slice(0, 4).join(' · ')) : ''}`;
      fim(); return true;
    } catch (e) { nota('Erro: ' + e.message, 'error'); } fim();
  }
  async function analisar() {
    lerForm(); const d = PROP.dados; if (!d.perfis.length) return nota('Inclua a equipe (perfis e horas)', 'error');
    if (d.perfis.some(x => !(x.custo_hora > 0))) return nota('Falta o custo/hora de algum perfil (rate card ou RH)', 'error');
    const fim = ocupado($('vpBtnAnalisar'), '◆ Analisando...');
    try { PROP.analise = await api('analisar', { cliente: PROP.cliente, perfis: d.perfis, meses: d.meses || 3, inicio: d.inicio || undefined, risco: d.risco, tipo_demanda: d.tipo_demanda, orcamento_cliente: d.orcamento_cliente, orcamento_tipo: d.orcamento_tipo });
      delete PROP.analise.success; delete PROP.analise.action; PROP.formato = PROP.analise.recomendado; renderAnalise(); $('vpAnalise').scrollIntoView({ behavior: 'smooth', block: 'start' }); fim(); return true; }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim();
  }
  function renderAnalise() {
    const a = PROP.analise, m = a.metas, c = a.custos;
    const sc = (t, v) => `<div style="display:grid;grid-template-columns:70px 1fr 26px;gap:6px;align-items:center;font-size:9.5px;color:var(--t2);"><span>${t}</span>${barra(v, 100, v >= 70 ? 'var(--green)' : v >= 45 ? 'var(--gold)' : 'var(--red)')}<b style="color:var(--t1);">${v}</b></div>`;
    $('vpAnalise').innerHTML = `<div class="panel"><div class="ph"><div class="pt">③ Inteligência financeira — qual formato bate a meta e vende</div></div><div class="pb">
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--t2);margin-bottom:10px;background:var(--bg4);border-radius:8px;padding:9px 12px;">
        <span>Meta anual <b style="color:var(--t1);">${R(m.meta_anual)}</b></span><span>Realizado <b style="color:var(--t1);">${R(m.realizado_ano)}</b></span><span>Pipeline ponderado <b style="color:var(--t1);">${R(m.pipeline_ponderado)}</b></span>
        <span>Gap a cobrir <b style="color:var(--red);">${R(m.gap)}</b></span><span>Recorrência ${P(m.recorrente_pct_atual)} da receita (meta ${m.meta_recorrente_pct}%)</span>
        <span>Custo total <b style="color:var(--t1);">${R(c.custo_total)}</b> · preço mínimo ${R(c.preco_minimo)} · alvo ${R(c.preco_alvo)}</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;">
      ${a.formatos.map((f, i) => `<label style="display:block;cursor:pointer;background:var(--bg4);border:2px solid ${PROP.formato === f.formato ? 'var(--blue)' : 'var(--bd)'};border-radius:10px;padding:11px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;"><span style="font-weight:700;font-size:12px;"><input type="radio" name="vpFmt" value="${f.formato}" ${PROP.formato === f.formato ? 'checked' : ''} onchange="VD.escolher('${f.formato}')"/> ${esc(f.nome)}</span>${i === 0 ? '<span style="font-size:9px;background:var(--green);color:#fff;border-radius:4px;padding:2px 6px;">RECOMENDADO</span>' : ''}</div>
        <div style="font-size:22px;font-weight:800;font-family:var(--M);margin:6px 0 2px;">${f.scores.total}<span style="font-size:10px;color:var(--t2);font-weight:400;"> /100</span></div>
        <div style="display:grid;gap:3px;margin-bottom:8px;">${sc('Metas', f.scores.metas)}${sc('Vendável', f.scores.vendavel)}${sc('Caixa', f.scores.caixa)}${sc('Risco', f.scores.risco)}</div>
        <div style="font-size:10.5px;line-height:1.7;">Valor <b>${R(f.valor_total)}</b> · ${R(f.valor_mensal_medio)}/mês<br>Margem <b style="color:${f.margem_pct < (a.params.margem_min_pct) ? 'var(--red)' : 'var(--green)'};">${P(f.margem_pct)}</b> · lucro ${R(f.lucro)}<br>No ano: ${R(f.receita_no_ano)}${f.cobertura_gap_pct != null ? ` (${P(f.cobertura_gap_pct)} do gap)` : ''}<br>Recorrência (ARR): ${f.arr ? R(f.arr) : '—'} · 1º recebimento ${esc(f.primeiro_recebimento || '')}<br>Preço/h efetivo ${R(f.preco_hora_efetivo)}</div>
        ${f.alertas.length ? `<div style="font-size:10px;color:var(--gold);margin-top:6px;">⚠ ${esc(f.alertas.join(' · '))}</div>` : ''}
        <details style="margin-top:6px;font-size:10px;"><summary style="cursor:pointer;color:var(--t2);">cronograma de faturamento</summary>${f.cronograma.map(x => `<div>${esc(x.mes)} · ${esc(x.desc)} · <b>${R(x.valor)}</b> (recebe ${esc(x.recebe)})</div>`).join('')}</details></label>`).join('')}</div>
      ${a.explicacao ? `<div style="margin-top:10px;background:var(--bg4);border-left:3px solid var(--blue);border-radius:6px;padding:10px 12px;font-size:11.5px;line-height:1.7;white-space:pre-wrap;">${esc(a.explicacao)}</div>` : ''}
      <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">Pesos: metas 40% · vendável 35% · caixa 15% · risco 10%. Impostos ${a.params.impostos_pct}% · overhead ${a.params.overhead_pct}% · margem mínima ${a.params.margem_min_pct}% / alvo ${a.params.margem_alvo_pct}% · recebimento em ${a.params.prazo_recebimento_dias} dias. Fonte da conversão por formato: ${esc(a.fontes?.win_rate || '')}.</div>
      <button class="btn btn-or" id="vpBtnRedigir" onclick="VD.redigir()" style="margin-top:10px;width:100%;justify-content:center;">✍ Redigir proposta no formato escolhido (padrão aprendido)</button></div></div>`;
  }
  function escolher(f) { PROP.formato = f; renderAnalise(); }
  async function redigir() {
    lerForm(); if (!PROP.analise) return nota('Analise os formatos antes', 'error');
    const fim = ocupado($('vpBtnRedigir'), '✍ Redigindo (até 1 min)...');
    try { const r = await api('redigir', { proposta: PROP, formato: PROP.formato }); PROP.documento = r.documento; renderDoc(); $('vpDoc').scrollIntoView({ behavior: 'smooth', block: 'start' }); nota('Proposta redigida — revise e salve'); }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim();
  }
  function renderDoc() {
    const d = PROP.documento; if (!d) return;
    $('vpDoc').innerHTML = `<div class="panel"><div class="ph"><div class="pt">④ Documento da proposta</div><span style="font-size:10px;color:var(--t2);">${esc(FMT[d.formato] || '')} · editável</span></div><div class="pb">
      <input class="fi" id="vdDocTit" value="${esc(d.titulo || PROP.titulo)}" style="font-weight:700;font-size:13px;margin-bottom:10px;"/>
      ${(d.secoes || []).map((s, i) => `<div style="margin-bottom:10px;"><input class="fi vdDocSecT" data-i="${i}" value="${esc(s.titulo)}" style="font-weight:600;margin-bottom:4px;"/><textarea class="fta vdDocSecC" data-i="${i}" style="min-height:90px;font-size:11.5px;line-height:1.6;">${esc(s.conteudo)}</textarea></div>`).join('')}
      ${(d.tabela_investimento || []).length ? `<div class="fl" style="margin-top:6px;">Tabela de investimento</div><table><tbody>${d.tabela_investimento.map(t => `<tr><td>${esc(t.item)}</td><td style="text-align:right;font-family:var(--M);">${esc(t.valor)}</td></tr>`).join('')}</tbody></table>` : ''}</div></div>`;
  }
  function lerDoc() {
    const d = PROP.documento; if (!d) return; const t = $('vdDocTit'); if (t) d.titulo = t.value;
    document.querySelectorAll('.vdDocSecT').forEach(e => { d.secoes[+e.dataset.i].titulo = e.value; }); document.querySelectorAll('.vdDocSecC').forEach(e => { d.secoes[+e.dataset.i].conteudo = e.value; });
  }
  async function salvar() {
    lerForm(); lerDoc(); if (!PROP.cliente) return nota('Informe o cliente', 'error');
    try { const r = await api('prop_salvar', PROP); PROP.id = r.id; PROP.numero = r.numero; nota('Proposta ' + r.numero + ' salva'); if (PROP.dados.rfp_origem) rfpLog(PROP.dados.rfp_origem, PROP); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  function docMarkdownParaPdf(txt) { return String(txt || '').split('\n').map(l => l.trim().startsWith('- ') ? { text: '• ' + l.trim().substring(2), margin: [8, 1, 0, 1] } : { text: l.replace(/\*\*/g, ''), margin: [0, 1, 0, 1] }); }
  async function baixarPdf() {
    lerForm(); lerDoc(); const d = PROP.documento; if (!d) return nota('Redija a proposta antes', 'error');
    try { const pdfMake = await window._carregarPdfMake();
      const content = [{ text: 'ATLANTYX', color: '#00708A', bold: true, fontSize: 10, characterSpacing: 2 }, { text: d.titulo || PROP.titulo, fontSize: 18, bold: true, margin: [0, 6, 0, 2] },
        { text: `${PROP.cliente}${PROP.contato ? ' · ' + PROP.contato : ''} · ${PROP.numero || 'rascunho'} · ${new Date().toLocaleDateString('pt-BR')}`, color: '#555', fontSize: 9, margin: [0, 0, 0, 14] }];
      (d.secoes || []).forEach(s => { content.push({ text: s.titulo, fontSize: 12.5, bold: true, color: '#0F2660', margin: [0, 10, 0, 4] }); content.push(...docMarkdownParaPdf(s.conteudo)); });
      if ((d.tabela_investimento || []).length) content.push({ margin: [0, 10, 0, 0], table: { widths: ['*', 'auto'], body: [[{ text: 'Investimento', bold: true }, { text: 'Valor', bold: true }], ...d.tabela_investimento.map(t => [t.item, t.valor])] }, layout: 'lightHorizontalLines' });
      content.push({ text: `Validade da proposta: ${d.validade_dias || 30} dias.`, fontSize: 8.5, color: '#777', margin: [0, 14, 0, 0] });
      pdfMake.createPdf({ content, defaultStyle: { fontSize: 10, lineHeight: 1.25 }, pageMargins: [48, 48, 48, 48], footer: (p, t) => ({ text: `Atlantyx · ${p}/${t}`, alignment: 'right', fontSize: 8, color: '#999', margin: [0, 0, 40, 0] }) }).download(`Proposta_${(PROP.cliente || 'cliente').replace(/\W+/g, '_')}_${PROP.numero || 'rascunho'}.pdf`);
    } catch (e) { nota('PDF: ' + e.message, 'error'); }
  }
  function baixarWord() {
    lerForm(); lerDoc(); const d = PROP.documento; if (!d) return nota('Redija a proposta antes', 'error');
    const md = t => esc(t).split('\n').map(l => l.trim().startsWith('- ') ? `<li>${l.trim().substring(2)}</li>` : `<p>${l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`).join('').replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`);
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial;font-size:11pt}h1{color:#0F2660}h2{color:#00708A;font-size:13pt;margin-top:16pt}td{border-bottom:1px solid #ddd;padding:4px 8px}</style></head><body>
      <div style="color:#00708A;font-weight:bold;letter-spacing:2px;">ATLANTYX</div><h1>${esc(d.titulo || PROP.titulo)}</h1><p style="color:#555">${esc(PROP.cliente)}${PROP.contato ? ' · ' + esc(PROP.contato) : ''} · ${esc(PROP.numero || 'rascunho')} · ${new Date().toLocaleDateString('pt-BR')}</p>
      ${(d.secoes || []).map(s => `<h2>${esc(s.titulo)}</h2>${md(s.conteudo)}`).join('')}
      ${(d.tabela_investimento || []).length ? `<h2>Investimento</h2><table>${d.tabela_investimento.map(t => `<tr><td>${esc(t.item)}</td><td style="text-align:right">${esc(t.valor)}</td></tr>`).join('')}</table>` : ''}<p style="color:#777;font-size:9pt">Validade: ${d.validade_dias || 30} dias.</p></body></html>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' })); a.download = `Proposta_${(PROP.cliente || 'cliente').replace(/\W+/g, '_')}_${PROP.numero || 'rascunho'}.doc`; document.body.appendChild(a); a.click(); a.remove();
  }
  async function mudarStatus(id, status) {
    id = id || PROP?.id; if (!id) return nota('Salve a proposta primeiro', 'error');
    let motivo = null; if (['ganha', 'perdida'].includes(status)) { motivo = prompt(status === 'ganha' ? 'O que fez a proposta ser ganha? (preço, formato, prazo, relacionamento...)' : 'Por que foi perdida? (preço, concorrente, timing, escopo...)'); if (!motivo) return; }
    try { await api('prop_status', { id, status, motivo }); nota('Status: ' + STATUS[status]); if ($('vdProp').dataset.aba === 'lista') listar(); if (status === 'ganha' && confirm('Proposta ganha! Criar o projeto e os marcos de faturamento no financeiro agora?')) converter(id); }
    catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  async function converter(id) { try { const r = await api('prop_converter', { id }); nota(`Projeto criado com ${r.marcos_criados} marco(s) de faturamento`); listar(); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  async function listar() {
    const c = $('vdPropCorpo'); c.innerHTML = '<div style="padding:20px;color:var(--t3);font-size:11px;">Carregando...</div>';
    try { const d = await api('prop_listar');
      c.innerHTML = `<div class="panel"><div class="pb" style="padding:0;"><div class="tw"><table style="min-width:900px;"><thead><tr><th>Nº</th><th>Cliente / título</th><th>Formato</th><th style="text-align:right;">Valor</th><th style="text-align:right;">Margem</th><th>Status</th><th>Atualizada</th><th></th></tr></thead><tbody>
        ${d.propostas.map(p => `<tr><td style="font-family:var(--M);font-size:10px;">${esc(p.numero || '')}</td><td><b>${esc(p.cliente)}</b><div style="font-size:10px;color:var(--t2);">${esc(p.titulo || '')}</div></td><td style="font-size:10.5px;">${esc(FMT[p.formato] || '—')}</td>
          <td style="text-align:right;font-family:var(--M);">${R(p.valor_total)}</td><td style="text-align:right;font-family:var(--M);">${P(p.margem_pct)}</td>
          <td><select class="fsel" style="font-size:10px;width:auto;" onchange="VD.mudarStatus('${p.id}',this.value)">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>${p.motivo_resultado ? `<div style="font-size:9px;color:var(--t3);max-width:180px;">${esc(p.motivo_resultado)}</div>` : ''}</td>
          <td style="font-size:10px;color:var(--t2);">${new Date(p.atualizado_em).toLocaleDateString('pt-BR')}</td>
          <td style="white-space:nowrap;"><button class="btn btn-g" style="font-size:9.5px;padding:3px 8px;" onclick="VD.abrirProp('${p.id}')">Abrir</button>${p.status === 'ganha' && !p.projeto_id ? ` <button class="btn btn-gn" style="font-size:9.5px;padding:3px 8px;" onclick="VD.converter('${p.id}')">→ Projeto</button>` : ''}${p.projeto_id ? ' <span style="font-size:9px;color:var(--green);">✓ projeto</span>' : ''} <a href="javascript:void(0)" onclick="VD.excluir('${p.id}')" style="color:var(--t3);font-size:11px;">✕</a></td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--t3);padding:20px;">Nenhuma proposta ainda — clique em ＋ Nova proposta.</td></tr>'}</tbody></table></div></div></div>`;
    } catch (e) { c.innerHTML = `<div class="panel"><div class="pb" style="color:var(--red);">${esc(e.message)}</div></div>`; }
  }
  async function abrirProp(id) { try { const d = await api('prop_obter', { id }); const p = d.proposta; ['dados', 'analise', 'documento'].forEach(k => { if (typeof p[k] === 'string') p[k] = JSON.parse(p[k]); }); PROP = { ...novaProp(), ...p, dados: { ...novaProp().dados, ...(p.dados || {}) } }; aba('nova'); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  async function excluir(id) { if (!confirm('Excluir esta proposta?')) return; await api('prop_excluir', { id }); listar(); }

  // ── Aprendizado ──
  async function aprenderAbrir() {
    const c = $('vdPropCorpo');
    c.innerHTML = `<div class="kg k2"><div class="panel"><div class="ph"><div class="pt">📚 Ensinar com propostas reais</div></div><div class="pb" style="font-size:11px;color:var(--t2);line-height:1.6;">
        Suba propostas antigas, modelos, o rate card ou documentos de instrução (PDF, Word .docx, Excel .xlsx, .txt/.md). A IA extrai seções, tom, estrutura de preço, rate card, condições, premissas e exclusões. Marque se a proposta foi <b>ganha</b> ou <b>perdida</b> — é isso que ensina qual formato vende.
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;"><input type="file" id="vdArqs" multiple accept=".pdf,.docx,.xlsx,.txt,.md,.csv"/>
          <select class="fsel" id="vdArqRes" style="width:auto;"><option value="desconhecido">resultado desconhecido</option><option value="ganha">ganha</option><option value="perdida">perdida</option></select></div>
        <input class="fi" id="vdArqObs" placeholder="Observação (opcional): ex. 'perdemos por preço para a Accenture'" style="margin-top:8px;"/>
        <button class="btn btn-p" id="vdBtnAprender" onclick="VD.aprender()" style="margin-top:8px;">📥 Aprender com os arquivos</button><div id="vdAprMsg" style="margin-top:6px;"></div></div></div>
      <div class="panel"><div class="ph"><div class="pt">📝 Instruções de elaboração</div><button class="btn btn-g" style="font-size:9.5px;padding:3px 8px;" onclick="VD.salvarInstrucoes()">💾 Salvar</button></div><div class="pb">
        <div style="font-size:10.5px;color:var(--t2);margin-bottom:6px;">Cole aqui as instruções do seu projeto de propostas (regras, tom, estrutura, o que nunca prometer). Têm prioridade sobre o que a IA aprende.</div>
        <textarea class="fta" id="vdInstr" style="min-height:170px;font-size:11px;">${esc(CFG?.instrucoes || '')}</textarea></div></div></div>
      <div class="panel"><div class="ph"><div class="pt">🏛 Padrão Atlantyx de proposta (consolidado)</div><button class="btn btn-g" style="font-size:9.5px;padding:3px 8px;" id="vdBtnPadrao" onclick="VD.regerarPadrao()">↻ Reconsolidar</button></div><div class="pb" id="vdPadrao" style="font-size:11px;">Carregando...</div></div>
      <div class="panel"><div class="ph"><div class="pt">Documentos aprendidos</div></div><div class="pb" id="vdBase" style="padding:0;">Carregando...</div></div>`;
    carregarBase(); carregarPadrao();
  }
  async function carregarPadrao() {
    try { const d = await api('padrao'); const p = d.padrao; const box = $('vdPadrao'); if (!box) return;
      const wr = Object.entries(d.estatistica || {}).map(([f, v]) => `${esc(FMT[f] || f)}: ${v.ganhas} ganha(s) / ${v.perdidas} perdida(s)`).join(' · ');
      box.innerHTML = !p ? (d.precisa_consolidar ? '<span style="color:var(--gold);">Há ' + d.exemplos + ' documento(s) aprendido(s) mas o padrão ainda não foi consolidado — clique em ↻ Reconsolidar (leva ~1 min).</span>' : '<span style="color:var(--t3);">Ainda sem padrão — suba as primeiras propostas.</span>') : `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;line-height:1.6;">
          <div><b>Seções</b><ol style="padding-left:18px;margin:4px 0;">${(p.secoes || []).map(s => `<li>${esc(s.titulo)} <span style="color:var(--t3);">— ${esc(s.objetivo || '')}</span></li>`).join('')}</ol></div>
          <div><b>Tom:</b> ${esc(p.tom || '')}<br><b>Preço:</b> ${esc(p.estrutura_preco || '')}<br><b>O que ganha:</b> ${esc(p.o_que_ganha || '')}<br>${p.o_que_perde ? '<b>O que perde:</b> ' + esc(p.o_que_perde) : ''}</div>
          <div><b>Condições padrão</b><ul style="padding-left:16px;margin:4px 0;">${(p.condicoes_padrao || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul><b>Checklist</b><ul style="padding-left:16px;margin:4px 0;">${(p.checklist || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
        <div style="font-size:10px;color:var(--t2);margin-top:6px;">${d.exemplos} documento(s) · conversão por formato: ${wr || 'sem resultados registrados'} · atualizado ${p.atualizado_em ? new Date(p.atualizado_em).toLocaleString('pt-BR') : ''}</div>`;
    } catch (e) { $('vdPadrao').innerHTML = `<span style="color:var(--red);">${esc(e.message)}</span>`; }
  }
  async function carregarBase() {
    try { const d = await api('base_listar'); const box = $('vdBase'); if (!box) return;
      box.innerHTML = d.base.length ? `<div class="tw"><table style="min-width:760px;"><thead><tr><th>Arquivo</th><th>Tipo</th><th>Cliente</th><th>Formato</th><th style="text-align:right;">Valor</th><th>Aprendido</th><th>Resultado</th><th></th></tr></thead><tbody>${d.base.map(b => { const x = typeof b.extraido === 'string' ? JSON.parse(b.extraido) : (b.extraido || {});
        return `<tr><td style="font-size:10.5px;"><b>${esc(b.arquivo)}</b></td><td style="font-size:10px;">${esc(x.tipo_documento || '')}</td><td>${esc(b.cliente || '')}</td><td style="font-size:10px;">${esc(FMT[b.formato] || b.formato || '')}</td><td style="text-align:right;font-family:var(--M);">${b.valor_total ? R(b.valor_total) : '—'}</td>
          <td style="font-size:10px;color:var(--t2);">${(x.secoes || []).length} seções · ${(x.rate_card || []).length} perfis<br>${esc((x.licoes || '').substring(0, 110))}</td>
          <td><select class="fsel" style="font-size:10px;width:auto;" onchange="VD.baseRes('${b.id}',this.value)">${['desconhecido', 'ganha', 'perdida'].map(v => `<option ${b.resultado === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
          <td><a href="javascript:void(0)" onclick="VD.baseExcluir('${b.id}')" style="color:var(--t3);">✕</a></td></tr>`; }).join('')}</tbody></table></div>` : '<div style="padding:16px;color:var(--t3);font-size:11px;">Nenhum documento aprendido ainda.</div>';
    } catch (e) { $('vdBase').innerHTML = `<div style="padding:12px;color:var(--red);">${esc(e.message)}</div>`; }
  }
  const lerB64 = f => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = err; r.readAsDataURL(f); });
  async function aprender() {
    const fs = [...($('vdArqs').files || [])]; if (!fs.length) return nota('Escolha os arquivos', 'error');
    const fim = ocupado($('vdBtnAprender'), '📥 Aprendendo...'); const msg = $('vdAprMsg'); let ok = 0;
    for (const f of fs) { msg.innerHTML = `<span style="color:var(--blue);">Lendo ${esc(f.name)} (${ok + 1}/${fs.length})...</span>`;
      try { if (f.size > 9 * 1024 * 1024) throw new Error('acima de 9 MB'); await api('aprender', { nome: f.name, base64: await lerB64(f), resultado: $('vdArqRes').value, observacao: $('vdArqObs').value }); ok++; }
      catch (e) { nota(f.name + ': ' + e.message, 'error'); } }
    msg.innerHTML = `<span style="color:var(--green);">${ok} de ${fs.length} documento(s) aprendido(s). Reconsolidando o padrão...</span>`;
    try { await api('padrao_regerar'); } catch (_) {} fim(); carregarBase(); carregarPadrao(); try { RC = (await api('rate_card')).rate_card; } catch (_) {}
  }
  async function salvarInstrucoes() { try { CFG = await api('prop_config_salvar', { instrucoes: $('vdInstr').value }); nota('Instruções salvas — valem para toda proposta'); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  async function regerarPadrao() { const fim = ocupado($('vdBtnPadrao'), '↻ Consolidando...'); try { await api('padrao_regerar'); await carregarPadrao(); } catch (e) { nota('Erro: ' + e.message, 'error'); } fim(); }
  async function baseRes(id, resultado) { await api('base_resultado', { id, resultado }); nota('Resultado registrado'); }
  async function baseExcluir(id) { if (!confirm('Remover este documento do aprendizado?')) return; await api('base_excluir', { id }); carregarBase(); }

  // ── Rate card e parâmetros ──
  async function rateAbrir() {
    const c = $('vdPropCorpo'); const p = CFG?.params || {};
    const campo = (id, rot, v, dica) => `<label style="font-size:10.5px;">${rot}<br><input class="fi" id="${id}" value="${v ?? ''}" style="width:120px;" title="${esc(dica || '')}"/></label>`;
    c.innerHTML = `<div class="panel"><div class="ph"><div class="pt">💲 Rate card</div><div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-g" style="font-size:10px;" onclick="VD.rateLinha()">+ perfil</button>
        <button class="btn btn-g" style="font-size:10px;" id="vdBtnSug" onclick="VD.rateSugerir()" title="Custo/hora real do RH + preços praticados nas propostas aprendidas">🔎 Sugerir (RH + aprendizado)</button>
        <label class="btn btn-g" style="font-size:10px;cursor:pointer;">📥 Importar planilha<input type="file" accept=".xlsx,.csv,.pdf,.txt" style="display:none;" onchange="VD.rateImportar(this)"/></label>
        <button class="btn btn-p" style="font-size:10px;" onclick="VD.rateSalvar()">💾 Salvar rate card</button></div></div>
      <div class="pb" style="padding:0;"><div class="tw"><table style="min-width:820px;"><thead><tr><th>Perfil</th><th>Senioridade</th><th style="width:100px;">Custo/h</th><th style="width:100px;">Piso/h</th><th style="width:100px;">Alvo/h</th><th style="width:100px;">Teto/h</th><th>Fonte</th><th></th></tr></thead><tbody id="vdRC"></tbody></table></div>
      <div style="font-size:10px;color:var(--t3);padding:8px 12px;">Custo/h = custo real da pessoa (RH). Piso = preço que dá a margem mínima; alvo = margem alvo; teto = máximo que o mercado aceita. A análise usa o alvo e alerta acima do teto.</div></div></div>
      <div class="panel"><div class="ph"><div class="pt">⚙ Parâmetros financeiros da proposta</div><button class="btn btn-p" style="font-size:10px;" onclick="VD.paramsSalvar()">💾 Salvar</button></div><div class="pb">
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${campo('vpp_imp', 'Impostos s/ faturamento (%)', p.impostos_pct, 'Origem: ' + (CFG?.imposto_origem || ''))}${campo('vpp_ovh', 'Overhead (%)', p.overhead_pct)}${campo('vpp_mmin', 'Margem mínima (%)', p.margem_min_pct)}${campo('vpp_malvo', 'Margem alvo (%)', p.margem_alvo_pct)}
          ${campo('vpp_desc', 'Desconto recorrente ≥12m (%)', p.desconto_recorrente_pct)}${campo('vpp_cb', 'Contingência risco baixo (%)', p.contingencia?.baixo)}${campo('vpp_cm', 'Contingência médio (%)', p.contingencia?.medio)}${campo('vpp_ca', 'Contingência alto (%)', p.contingencia?.alto)}
          ${campo('vpp_rec', 'Prazo de recebimento (dias)', p.prazo_recebimento_dias)}${campo('vpp_mrec', 'Meta de receita recorrente (%)', p.meta_recorrente_pct)}${campo('vpp_setup', 'Setup no híbrido (%)', p.setup_pct)}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:8px;">Impostos: ${esc(CFG?.imposto_origem || '')}. As metas (anual/mensal) vêm do Dashboard; a receita realizada, do QuickBooks; o pipeline, do HubSpot.</div></div></div>`;
    renderRC();
  }
  function renderRC() { $('vdRC').innerHTML = RC.map((x, i) => `<tr>${['perfil', 'senioridade', 'custo_hora', 'preco_piso', 'preco_alvo', 'preco_teto'].map(k => `<td><input class="fi" data-k="${k}" value="${esc(x[k] ?? '')}"/></td>`).join('')}<td style="font-size:9.5px;color:var(--t3);">${esc(x.fonte || x.custo_fonte || '')}${x.preco_observado ? '<br>praticado: R$ ' + x.preco_observado : ''}</td><td><a href="javascript:void(0)" onclick="this.closest('tr').remove()" style="color:var(--red);">✕</a></td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--t3);padding:14px;">Rate card vazio — importe sua planilha ou clique em Sugerir.</td></tr>'; }
  function lerRC() { return [...document.querySelectorAll('#vdRC tr')].map(tr => { const o = {}; tr.querySelectorAll('[data-k]').forEach(e => o[e.dataset.k] = e.value.trim()); return o; }).filter(x => x.perfil); }
  function rateLinha() { RC = lerRC(); RC.push({ perfil: '', fonte: 'manual' }); renderRC(); }
  async function rateSalvar() { try { RC = (await api('rate_card_salvar', { rate_card: lerRC() })).rate_card; renderRC(); nota('Rate card salvo'); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  async function rateSugerir() { const fim = ocupado($('vdBtnSug'), '🔎 Buscando...'); try { const d = await api('rate_card_sugerir'); RC = d.sugestao; renderRC(); nota(`Sugestão: ${d.fontes.cargos_rh} cargo(s) do RH, ${d.fontes.perfis_observados} perfil(is) de propostas — revise e salve`); } catch (e) { nota('Erro: ' + e.message, 'error'); } fim(); }
  async function rateImportar(inp) { const f = inp.files[0]; if (!f) return; nota('Lendo o rate card...'); try { const d = await api('rate_card_importar', { nome: f.name, base64: await lerB64(f) }); RC = d.rate_card; renderRC(); nota(`${d.importados} perfil(is) importado(s) e salvos`); } catch (e) { nota('Erro: ' + e.message, 'error'); } inp.value = ''; }
  async function paramsSalvar() {
    const g = id => { const v = $(id).value; return v === '' ? undefined : +String(v).replace(',', '.'); };
    const params = { impostos_pct: g('vpp_imp'), overhead_pct: g('vpp_ovh'), margem_min_pct: g('vpp_mmin'), margem_alvo_pct: g('vpp_malvo'), desconto_recorrente_pct: g('vpp_desc'), contingencia: { baixo: g('vpp_cb'), medio: g('vpp_cm'), alto: g('vpp_ca') }, prazo_recebimento_dias: g('vpp_rec'), meta_recorrente_pct: g('vpp_mrec'), setup_pct: g('vpp_setup') };
    if (params.margem_min_pct > params.margem_alvo_pct) return nota('A margem mínima não pode ser maior que a alvo', 'error');
    try { CFG = await api('prop_config_salvar', { params }); nota('Parâmetros salvos'); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }

  window.VD = { painelAbrir, painelCarregar, rfCarregar, rfIr,coach, premissasSalvar, estRef, estAbrir, estSalvar, estExcluir, estSugerir,
    propAbrir, aba, nova, estimar, analisar, escolher, redigir, salvar, baixarPdf, baixarWord, mudarStatus, converter, abrirProp, excluir, addPerfil, perfilRC,
    aprender, salvarInstrucoes, regerarPadrao, baseRes, baseExcluir, rateLinha, rateSalvar, rateSugerir, rateImportar, paramsSalvar };
})();
