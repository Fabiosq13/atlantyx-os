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
  const FMT = { tm: 'Alocação por hora (T&M)', fechado: 'Escopo fechado', mensal: 'Mensalidade recorrente', hibrido: 'Híbrido: setup + mensalidade', poc: 'POC paga (crédito no contrato)' };
  const TIPODOC = { proposta: 'Proposta completa', poc: 'POC — prova de conceito', piloto: 'Piloto (uso real, escopo reduzido)' };
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
      <a href="#funil-propostas" class="btn btn-g" onclick="event.preventDefault();VD.funilIr()" title="Taxa de conversão, valor em aberto e tempo até fechamento das propostas">📊 Funil de propostas →</a>
      <button class="btn btn-g" id="vdBtnAtualizar" onclick="VD.painelCarregar(true)">↻ Atualizar</button>
      <button class="btn btn-p" id="vdBtnCoach" onclick="VD.coach()">🤖 O que fazer hoje</button>
      <button class="btn btn-or" onclick="VD.vozAbrir()" title="Grave a oportunidade falando — a IA organiza e cria empresa, contato e negócio no HubSpot">🎙 Nova oportunidade por voz</button></div>
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
  const novaProp = () => ({ id: null, cliente: '', contato: '', titulo: '', status: 'rascunho', formato: null, dados: { tipo_demanda: 'indefinido', meses: 3, risco: 'medio', perfis: [], escopo: '', inicio: '', orcamento_cliente: '', orcamento_tipo: 'total', tipo_documento: 'proposta', poc: { semanas: 6, credito_dias: 60, criterios: '' }, preco_concorrente: '', descontos: {} }, analise: null, documento: null });
  async function propAbrir() {
    const box = $('vdProp'); if (!box) return;
    if (!box.dataset.ok) { box.dataset.ok = '1'; box.innerHTML = propEsqueleto(); PROP = novaProp(); }
    const ctx = rfpCtxLer();
    if (ctx && PROP && PROP.dados.escopo && !PROP.id && !confirm('Descartar a proposta em edição (não salva) e abrir a da RFP?')) { aba(box.dataset.aba || 'nova'); return; }
    funilCarregar();
    if (!ctx) propPrefillRfp(box);
    try { const [rc, cfg] = await Promise.all([api('rate_card'), api('prop_config')]); RC = rc.rate_card || []; CFG = cfg; } catch (_) {}
    if (!ctx) return aba(box.dataset.aba || 'nova');
    // Ponte s2rfps → s7propostas: formulário pré-preenchido com o edital e rascunho IA disparado
    PROP = novaProp(); PROP.cliente = ctx.cliente || ''; PROP.titulo = ctx.titulo || '';
    Object.assign(PROP.dados, { escopo: ctx.escopo || '', orcamento_cliente: /\d/.test(ctx.valorRef || '') ? ctx.valorRef : '', orcamento_tipo: 'total', rfp_origem: { rfp_id: ctx.rfp_id, link: ctx.link, fonte: ctx.fonte, prazo: ctx.prazo, rfp_recebida: ctx.rfp_recebida, identificada_em: ctx.identificada_em, proposta_criada_em: new Date().toISOString() } });
    rfpLog(PROP.dados.rfp_origem, null);
    await aba('nova'); nota('Proposta pré-preenchida com a RFP — a IA está montando o rascunho');
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

  // ═══════════════ FUNIL DE PROPOSTAS (conversão, valor em aberto, tempo até fechar) ═══════════════
  // Só leitura local: mesma lista de prop_listar. Entrada no funil = enviada_em (ou criado_em se nunca foi marcada como enviada).
  // Período filtra as propostas que entraram no funil nos últimos N dias.
  let FUNIL = null, FUNIL_DIAS = 90, FUNIL_SEQ = 0, FUNIL_ROLAR = false;
  const FUNIL_ETAPAS = [['rascunho', 'Rascunho', 'var(--t3)'], ['enviada', 'Enviada', 'var(--blue)'], ['negociacao', 'Em negociação', 'var(--gold)'], ['ganha', 'Fechada (ganha)', 'var(--green)'], ['perdida', 'Perdida', 'var(--red)']];
  function calcularFunilPropostas(lista, dias) {
    const corte = Date.now() - dias * 864e5, t = v => v ? new Date(v).getTime() : NaN;
    const etapas = {}; FUNIL_ETAPAS.forEach(([k]) => { etapas[k] = { qtd: 0, valor: 0 }; });
    let ativas = 0, aberto = 0, qtdAberto = 0, enviadas = 0, ganhas = 0; const ciclos = [];
    (lista || []).forEach(p => {
      const entrada = t(p.enviada_em) || t(p.criado_em); if (!(entrada >= corte)) return;
      const e = etapas[p.status]; if (!e) return; const v = +p.valor_total || 0;
      e.qtd++; e.valor += v;
      if (['rascunho', 'enviada', 'negociacao'].includes(p.status)) ativas++;
      if (['enviada', 'negociacao'].includes(p.status)) { aberto += v; qtdAberto++; }
      if (p.status !== 'rascunho') enviadas++;
      if (p.status === 'ganha') { ganhas++; const f = t(p.fechada_em); if (f >= entrada) ciclos.push((f - entrada) / 864e5); }
    });
    return { dias, etapas, ativas, aberto, qtdAberto, enviadas, ganhas, conversao: enviadas ? ganhas / enviadas * 100 : null,
      tempo_medio: ciclos.length ? ciclos.reduce((a, x) => a + x, 0) / ciclos.length : null, qtdCiclos: ciclos.length };
  }
  async function funilCarregar() {
    const seq = ++FUNIL_SEQ; funilRender();
    try { const d = await api('prop_listar', {}, PN_MS); if (seq !== FUNIL_SEQ) return; FUNIL = { lista: d.propostas || [] }; }
    catch (e) { if (seq !== FUNIL_SEQ) return; FUNIL = { erro: e.message }; }
    funilRender();
  }
  function funilPeriodo(d) { FUNIL_DIAS = +d || 90; funilRender(); }
  function funilRender() {
    const el = $('funil-propostas'); if (!el) return;
    const per = `<div class="seg">${[30, 60, 90].map(d => `<button class="${d === FUNIL_DIAS ? 'on' : ''}" onclick="VD.funilPeriodo(${d})">${d}d</button>`).join('')}</div>`;
    const cab = `<div class="ph"><div class="pt">📊 Funil de Propostas</div><span style="font-size:10px;color:var(--t2);flex:1;">propostas que entraram no funil nos últimos ${FUNIL_DIAS} dias</span>${per}</div>`;
    const card = (cor, t, v, s) => `<div class="kpi" style="border-left:3px solid ${cor};"><div class="kl">${t}</div><div class="kv" style="color:${cor};">${v}</div><div class="ks">${s || ''}</div></div>`;
    let corpo;
    if (!FUNIL) corpo = '<div style="font-size:11px;color:var(--t3);padding:8px 0;">Calculando o funil...</div>';
    else if (FUNIL.erro) corpo = `<div style="display:flex;gap:10px;align-items:center;"><span style="color:var(--red);font-size:11px;flex:1;">⚠ ${esc(FUNIL.erro)}</span><button class="btn btn-g" onclick="VD.funilCarregar()">↻ Tentar novamente</button></div>`;
    else {
      const f = calcularFunilPropostas(FUNIL.lista, FUNIL_DIAS), tot = FUNIL_ETAPAS.reduce((a, [k]) => a + f.etapas[k].qtd, 0);
      const cConv = f.conversao == null ? 'var(--t3)' : f.conversao >= 30 ? 'var(--green)' : f.conversao >= 15 ? 'var(--gold)' : 'var(--red)';
      const dist = FUNIL_ETAPAS.map(([k, n, c]) => { const e = f.etapas[k]; return `<div style="font-size:10.5px;"><div style="display:flex;justify-content:space-between;gap:6px;"><span style="color:${c};font-weight:600;">${n}</span><b>${e.qtd}</b></div>${barra(e.qtd, tot, c)}<div style="color:var(--t3);font-size:9.5px;margin-top:2px;">${R(e.valor)}</div></div>`; }).join('');
      corpo = `<div class="kg k5" style="margin:0;">
          ${card('var(--blue)', 'Propostas ativas', f.ativas, `rascunho ${f.etapas.rascunho.qtd} · enviada ${f.etapas.enviada.qtd} · negociação ${f.etapas.negociacao.qtd}`)}
          ${card('var(--gold)', 'Valor em aberto', R(f.aberto), `${f.qtdAberto} proposta(s) enviada(s) ou em negociação`)}
          ${card(cConv, 'Taxa de conversão', f.conversao == null ? '—' : P(f.conversao), `${f.ganhas} fechada(s) ÷ ${f.enviadas} enviada(s)`)}
          ${card('var(--pu)', 'Tempo médio até fechar', f.tempo_medio == null ? '—' : N(f.tempo_medio) + ' dias', f.qtdCiclos ? `do envio à assinatura · ${f.qtdCiclos} proposta(s) ganha(s)` : 'sem propostas ganhas no período')}
          <div class="kpi"><div class="kl">Distribuição por etapa</div><div style="display:grid;gap:5px;margin-top:4px;">${dist}</div></div></div>
        <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">Conversão = fechadas (ganhas) ÷ enviadas (enviada, em negociação, ganha ou perdida) no período. Valor em aberto = soma das propostas enviadas ou em negociação. Dados das propostas salvas — sem consulta externa.</div>`;
    }
    el.innerHTML = `<div class="panel">${cab}<div class="pb">${corpo}</div></div>`;
    if (FUNIL && FUNIL_ROLAR) { FUNIL_ROLAR = false; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function funilIr() {
    FUNIL_ROLAR = true; nav('s7propostas', document.querySelector(`.sbi[onclick*="'s7propostas'"]`));
  }
  // Demanda #21: botão "→ Gerar Proposta" do Monitor RFPs deixa os dados em localStorage('proposta_prefill')
  function propPrefillRfp(box) {
    let pre = null; try { pre = JSON.parse(localStorage.getItem('proposta_prefill') || 'null'); localStorage.removeItem('proposta_prefill'); } catch (_) {}
    if (!pre || typeof pre !== 'object' || !(pre.titulo || pre.cliente || pre.escopo)) return;
    if ($('vpCliente')) { try { lerForm(); } catch (_) {} }
    if (PROP && !PROP.id && (PROP.dados.escopo || PROP.titulo || PROP.cliente) && !confirm('Substituir a proposta em edição (não salva) pelos dados da RFP?')) return;
    PROP = novaProp();
    PROP.cliente = String(pre.cliente || '').substring(0, 200); PROP.titulo = String(pre.titulo || '').substring(0, 200); PROP.dados.escopo = String(pre.escopo || '').substring(0, 5000);
    PROP.dados.origem = 'rfp'; PROP.dados.rfp_chave = String(pre.chave || '').substring(0, 300); if (/^\d{4}-\d{2}-\d{2}$/.test(String(pre.prazo || ''))) PROP.dados.prazo_rfp = pre.prazo;
    box.dataset.aba = 'nova'; nota('Proposta pré-preenchida com os dados da RFP');
  }
  function propEsqueleto() {
    return `<div class="cp-top"><div style="flex:1;min-width:0;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">Elaboração de Propostas</div>
      <div style="font-size:10.5px;color:var(--t2);">Escopo → equipe e horas → melhor formato para as metas e para o cliente → proposta no padrão Atlantyx</div></div>
      <div class="seg" id="vdAbas"><button data-a="nova" onclick="VD.aba('nova')">Nova / editar</button><button data-a="lista" onclick="VD.aba('lista')">Propostas</button><button data-a="aprender" onclick="VD.aba('aprender')">Aprendizado</button><button data-a="rate" onclick="VD.aba('rate')">Rate card e parâmetros</button></div>
      <button class="btn btn-p" onclick="VD.nova()">＋ Nova proposta</button></div><div id="funil-propostas"></div><div id="vdPropCorpo"></div>`;
  }
  // v3.372: sair do Rate card salva sozinho o que foi editado; entrar em Nova/editar relê o rate card do servidor
  let _rcSalvo = null;
  async function aba(a) {
    const de = $('vdProp').dataset.aba;
    if (de === 'rate' && a !== 'rate' && $('vdRC')) { try { const atual = lerRC().filter(x => String(x.perfil || '').trim()); const j = JSON.stringify(atual);
      if (atual.length && j !== _rcSalvo) { RC = (await api('rate_card_salvar', { rate_card: atual })).rate_card; _rcSalvo = JSON.stringify(RC); nota('Rate card salvo automaticamente (' + RC.length + ' perfis)'); } } catch (e) { nota('Não salvei o rate card: ' + e.message, 'error'); } }
    if (a === 'nova') { try { RC = (await api('rate_card', {}, 15000)).rate_card || RC; } catch (_) {} }
    $('vdProp').dataset.aba = a; document.querySelectorAll('#vdAbas button').forEach(b => b.classList.toggle('on', b.dataset.a === a));
    const c = $('vdPropCorpo'); if (a === 'nova') { c.innerHTML = formHtml(); preencherForm(); } else if (a === 'lista') listar(); else if (a === 'aprender') aprenderAbrir(); else rateAbrir();
  }
  function nova() { if (PROP && PROP.dados.escopo && !PROP.id && !confirm('Descartar a proposta em edição (não salva)?')) return; PROP = novaProp(); aba('nova'); }
  function formHtml() {
    return `<div id="vpRfpInfo"></div><div id="vpStatus"></div><div class="kg k2">
      <div class="panel"><div class="ph"><div class="pt">① Cliente e escopo</div></div><div class="pb">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="fg"><label class="fl">Cliente</label><input class="fi" id="vpCliente" list="vpClientesDL" placeholder="Ex.: CPFL Energia" onchange="VD.clienteChecar()"/><datalist id="vpClientesDL"></datalist></div>
          <div class="fg"><label class="fl">Contato / decisor</label><input class="fi" id="vpContato" placeholder="Nome e cargo"/></div></div>
        <div class="fg"><label class="fl">Título da proposta</label><input class="fi" id="vpTitulo" placeholder="Ex.: Plataforma de dados de geração eólica"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="fg"><label class="fl">Tipo de documento</label><select class="fsel" id="vpTipoDoc" onchange="VD.tipoDocMudou()">${Object.entries(TIPODOC).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="fg"><label class="fl" title="Preço total estimado do concorrente para o mesmo escopo — a máquina sugere desconto se ficarmos muito acima">Preço do concorrente (R$ total, se souber)</label><input class="fi" id="vpConc" placeholder="R$"/></div></div>
        <label style="display:flex;gap:6px;align-items:center;font-size:11px;margin:-2px 0 8px;cursor:pointer;" title="Cliente que a Atlantyx já atende ou atendeu"><input type="checkbox" id="vpJaCli" onchange="PROP.dados.ja_cliente_manual=true;VD.tipoDocMudou()"/> <b>Já é cliente da Atlantyx</b> <span id="vpJaCliInfo" style="color:var(--t3);"></span></label>
        <div id="vpPocBox" style="display:none;background:var(--bg4);border:1px solid var(--bd);border-radius:8px;padding:8px 10px;margin-bottom:8px;">
          <div style="font-size:10.5px;font-weight:700;margin-bottom:6px;">🧪 POC profissional — período fechado, critérios de sucesso e crédito no contrato</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div class="fg"><label class="fl" title="Mercado: 2–6 semanas para produto; 4–8 para dados/IA">Duração (semanas)</label><input class="fi" id="vpPocSem" type="number" min="1" max="16"/></div>
            <div class="fg"><label class="fl" title="O valor pago na POC vira desconto no contrato se assinado nesse prazo">Crédito no contrato se fechar em (dias)</label><input class="fi" id="vpPocCred" type="number" min="0" max="365"/></div></div>
          <div class="fg"><label class="fl">Critérios de sucesso (mensuráveis)</label><textarea class="fta" id="vpPocCrit" style="min-height:50px;" placeholder="Ex.: reduzir de 3 dias para 4 horas o fechamento do indicador X; acurácia ≥ 85% na amostra de N registros; 5 usuários-chave usando por 2 semanas"></textarea></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div class="fg"><label class="fl">Natureza da demanda</label><select class="fsel" id="vpTipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="fg"><label class="fl">Prazo (meses)</label><input class="fi" id="vpMeses" type="number" min="1" max="60"/></div>
          <div class="fg"><label class="fl">Início</label><input class="fi" id="vpInicio" type="month"/></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div class="fg"><label class="fl">Risco do escopo</label><select class="fsel" id="vpRisco"><option value="baixo">Baixo — escopo claro</option><option value="medio" selected>Médio</option><option value="alto">Alto — muita incerteza</option></select></div>
          <div class="fg"><label class="fl">Orçamento do cliente (se souber)</label><input class="fi" id="vpOrc" placeholder="R$"/></div>
          <div class="fg"><label class="fl">O orçamento é</label><select class="fsel" id="vpOrcTipo"><option value="total">Total do projeto</option><option value="mensal">Por mês</option></select></div></div>
        <div class="fg"><label class="fl">Briefing do projeto / solução</label><textarea class="fta" id="vpBriefing" style="min-height:80px;" placeholder="Conte com suas palavras: quem é o cliente, qual a dor, o que ele quer resolver, sistemas e dados envolvidos, prazo, quem decide... A IA transforma isso no escopo completo abaixo."></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:4px;"><button class="btn btn-p" style="font-size:10.5px;" id="vpBtnBrief" onclick="VD.escopoBriefing()" title="A IA escreve o escopo completo a partir do briefing e preenche a caixa de escopo (editável)">✨ Gerar escopo pelo briefing (IA)</button></div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
          <label class="btn btn-g" style="font-size:10px;cursor:pointer;" title="PDF, Word, Excel ou texto — o escopo vem para o campo abaixo, editável">📎 Subir documento de escopo<input type="file" accept=".pdf,.docx,.xlsx,.txt,.md,.csv" style="display:none;" onchange="VD.escopoUpload(this)"/></label>
          <select class="fsel" id="vpProd" style="width:auto;font-size:10.5px;"><option value="">📦 Escopo de um produto…</option></select>
          <button class="btn btn-g" style="font-size:10px;" id="vpBtnProd" onclick="VD.escopoProduto()" title="A IA adapta o escopo padrão do produto ao cliente (e à POC, se for o caso)">Gerar escopo do produto</button>
          <button class="btn btn-g" style="font-size:10px;" id="vpBtnCompl" onclick="VD.complSugerir()" title="A IA sugere o que costuma faltar: governança, testes, treinamento, operação assistida, sustentação...">✨ Sugerir escopo complementar</button>
          <span style="font-size:9.5px;color:var(--t3);">Edite o escopo à vontade antes de estimar e gerar a proposta.</span></div>
        <div class="fg"><label class="fl">Escopo / necessidade do cliente</label><textarea class="fta" id="vpEscopo" style="min-height:160px;" placeholder="O que o cliente precisa, entregáveis, sistemas envolvidos, volume, prazos, restrições... (ou suba um documento / escolha um produto acima)"></textarea></div>
        <div id="vpCompl"></div>
        <button class="btn btn-or" id="vpBtnEstimar" onclick="VD.estimar()" style="width:100%;justify-content:center;">🤖 Estimar equipe e horas</button></div></div>
      <div class="panel"><div class="ph"><div class="pt">② Equipe, horas e custo</div><div style="display:flex;gap:4px;"><button class="btn btn-g" style="font-size:9.5px;padding:3px 8px;" onclick="VD.equipeManual()" title="Traz todos os perfis do rate card com custo e preço; você preenche as horas">⬇ Perfis do rate card (${RC.length})</button><button class="btn btn-g" style="font-size:9.5px;padding:3px 8px;" onclick="VD.addPerfil()">+ perfil</button></div></div><div class="pb">
        <datalist id="vpPerfisDL">${RC.map(x => `<option value="${esc(x.perfil)}">`).join('')}</datalist>
        <div class="tw"><table style="min-width:520px;"><thead><tr><th>Perfil</th><th style="width:80px;">Horas</th><th style="width:90px;">Custo/h</th><th style="width:90px;">Preço/h</th><th style="width:26px;"></th></tr></thead><tbody id="vpPerfis"></tbody></table></div>
        <div id="vpEstInfo" style="font-size:10.5px;color:var(--t2);margin-top:8px;line-height:1.6;"></div>
        <button class="btn btn-p" id="vpBtnAnalisar" onclick="VD.analisar()" style="width:100%;justify-content:center;margin-top:10px;">◆ Analisar formatos x metas</button></div></div></div>
      <div id="vpAnalise"></div><div id="vpCrono"></div><div id="vpDoc"></div><div id="vpChat"></div>
      <div class="cp-acoes"><button class="btn btn-gn" onclick="VD.salvar()" style="flex:1;justify-content:center;font-weight:700;">💾 Salvar proposta</button>
        <button class="btn btn-g" onclick="VD.baixarPdf()">⬇ PDF</button><button class="btn btn-or" id="vpBtnPpt" onclick="VD.gerarApresentacao()" title="Apresentação da solução para o cliente (PowerPoint) com escopo, complementares, cronograma e investimento">📊 Apresentação (PPTX)</button><button class="btn btn-g" onclick="VD.baixarWord()">⬇ Word</button>
        <button class="btn btn-g" onclick="VD.mudarStatus(null,'enviada')">📨 Marcar como enviada</button></div>`;
  }
  function preencherForm() {
    const d = PROP.dados; $('vpCliente').value = PROP.cliente || ''; $('vpContato').value = PROP.contato || ''; $('vpTitulo').value = PROP.titulo || '';
    $('vpTipo').value = d.tipo_demanda || 'indefinido'; $('vpMeses').value = d.meses || ''; $('vpInicio').value = d.inicio || ''; $('vpRisco').value = d.risco || 'medio';
    $('vpOrc').value = d.orcamento_cliente || ''; $('vpOrcTipo').value = d.orcamento_tipo || 'total'; $('vpEscopo').value = d.escopo || ''; $('vpBriefing').value = d.briefing || '';
    const pc = d.poc || {}; if ($('vpJaCli')) $('vpJaCli').checked = !!d.ja_cliente; $('vpTipoDoc').value = d.tipo_documento || 'proposta'; $('vpConc').value = d.preco_concorrente || ''; $('vpPocSem').value = pc.semanas || CFG?.params?.poc_semanas_padrao || 6; $('vpPocCred').value = pc.credito_dias ?? 60; $('vpPocCrit').value = pc.criterios || ''; tipoDocMudou(true);
    $('vpProd').innerHTML = '<option value="">📦 Escopo de um produto…</option>' + ((CFG && CFG.escopos) || []).map(x => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('') + (((CFG && CFG.escopos) || []).length ? '' : '<option value="" disabled>(cadastre em Rate card e parâmetros → Catálogo)</option>');
    $('vpRfpInfo').innerHTML = d.origem === 'rfp' ? `<div style="background:var(--bg4);border-left:3px solid var(--gold);border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11px;">📌 Proposta originada do Monitor RFPs${d.prazo_rfp ? ` · envio da proposta até <b style="color:var(--gold);">${esc(d.prazo_rfp.split('-').reverse().join('/'))}</b>` : ''}</div>` : '';
    renderPerfis(); complRender(); statusRender(); chatRender(); cronoRender(); if (PROP.analise) renderAnalise(); if (PROP.documento) renderDoc();
    if (!$('vpClientesDL').dataset.ok) { $('vpClientesDL').dataset.ok = '1'; fetch('/api/crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clientes_listar', payload: {} }) }).then(r => r.json()).then(d => { $('vpClientesDL').innerHTML = (d.clientes || []).map(c => `<option value="${esc(c.empresa)}">`).join(''); }).catch(() => {}); }
  }
  function lerForm() {
    const d = PROP.dados; PROP.cliente = $('vpCliente').value.trim(); PROP.contato = $('vpContato').value.trim(); PROP.titulo = $('vpTitulo').value.trim();
    Object.assign(d, { ja_cliente: !!$('vpJaCli')?.checked, tipo_documento: $('vpTipoDoc').value, preco_concorrente: $('vpConc').value, poc: { semanas: +$('vpPocSem').value || 6, credito_dias: +$('vpPocCred').value || 0, criterios: $('vpPocCrit').value.trim() }, tipo_demanda: $('vpTipo').value, meses: +$('vpMeses').value || null, inicio: $('vpInicio').value, risco: $('vpRisco').value, orcamento_cliente: $('vpOrc').value, orcamento_tipo: $('vpOrcTipo').value, briefing: $('vpBriefing').value.trim(), escopo: $('vpEscopo').value.trim() });
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
  // v3.367 · o que a tela precisa para funcionar: IA ligada, rate card e propostas de referência
  let _st = null;
  async function statusRender(forcar) {
    const b = $('vpStatus'); if (!b) return;
    if (!_st || forcar) { _st = { ia: null, padrao: null };
      const [ia, pd] = await Promise.all([fetch('/api/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ia_estado' }) }).then(r => r.json()).catch(() => null), api('padrao', {}, 20000).catch(() => null)]);
      _st.ia = ia && ia.success ? !!ia.ligada : null; _st.padrao = pd;
      if (_st.ia) { const t = await fetch('/api/health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ia_teste' }) }).then(r => r.json()).catch(() => null); _st.teste = t && t.success ? t : null; } }
    if (!$('vpStatus')) return;
    const pd = _st.padrao || {}, nEx = pd.exemplos || 0, secoes = (pd.padrao?.secoes || []).map(x => x.titulo || x).filter(Boolean);
    const item = (ok, txt, acao) => `<div style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;"><span style="font-size:12px;">${ok === true ? '🟢' : ok === false ? '🔴' : '🟡'}</span><div style="flex:1;">${txt}</div>${acao || ''}</div>`;
    const bt = (t, js) => `<button class="btn btn-g" style="font-size:9.5px;padding:3px 8px;white-space:nowrap;" onclick="${js}">${t}</button>`;
    const linhas = [
      _st.ia && _st.teste && !_st.teste.ok ? item(false, '<b>IA ligada, mas sem funcionar</b> — ' + esc(_st.teste.msg) + ' Enquanto isso não funcionam: escopo pelo briefing, escopo complementar, 🤖 estimar, redigir e apresentação.', bt('Testar de novo', 'VD.statusRender(true)')) :
      item(_st.ia, _st.ia === false ? '<b>IA desligada</b> — não funcionam: gerar escopo pelo briefing, escopo complementar, 🤖 estimar equipe, importar rate card por planilha, redigir proposta e apresentação. A análise de formatos funciona sem IA (só sai sem o comentário).' : _st.ia ? (_st.teste?.ok ? esc(_st.teste.msg) : 'IA ligada') : 'Não consegui ler o estado da IA', _st.ia === false && typeof window.iaChave === 'function' ? bt('Ligar IA', 'iaChave()') : ''),
      item(RC.length ? true : false, RC.length ? `Rate card com <b>${RC.length}</b> perfil(is)` : '<b>Rate card vazio</b> — sem custo/hora dos perfis a análise de formatos não calcula. Cadastre os perfis (custo e preço por hora).', RC.length ? '' : bt('Abrir rate card', "VD.aba('rate')")),
      item(nEx ? true : null, nEx ? `Padrão de proposta aprendido de <b>${nEx}</b> documento(s)${secoes.length ? ' · capítulos: ' + esc(secoes.slice(0, 8).join(' → ')) + (secoes.length > 8 ? '…' : '') : ' · ainda não consolidado (Reconsolidar no Aprendizado)'}` : '<b>Nenhuma proposta de referência</b> — os capítulos seguem o modelo padrão. Suba as suas propostas na aba 📚 Aprendizado.', bt(nEx ? 'Ver referências' : 'Subir propostas', "VD.aba('aprender')")),
      item(true, '<span style="color:var(--t3);">Visual dos arquivos (PDF, Word, PPTX): padrão Atlantyx fixo — fonte Montserrat, logos Atlantyx, petróleo e ciano.</span>')];
    const refUp = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--bg4);border:1px dashed var(--cyan, #00C4CC);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:10.5px;">
      <b>📚 Propostas de referência</b><span style="color:var(--t2);flex:1;min-width:200px;">${nEx ? nEx + ' documento(s) já ensinam capítulos, ordem, tom e preço' : 'Suba propostas anteriores (várias de uma vez) — a IA aprende capítulos, ordem, tom e como o preço é apresentado'}</span>
      <select class="fsel" id="vpRefRes" style="width:auto;font-size:10px;"><option value="desconhecido">resultado ?</option><option value="ganha">ganhas</option><option value="perdida">perdidas</option></select>
      <label class="btn btn-p" style="font-size:10px;cursor:pointer;" id="vpRefBtn">📎 Anexar propostas (PDF, Word, Excel)<input type="file" multiple accept=".pdf,.docx,.xlsx,.txt,.md" style="display:none;" onchange="VD.refUpload(this)"/></label></div>`;
    b.innerHTML = refUp + `<details ${_st.ia === false || (_st.teste && !_st.teste.ok) || !RC.length ? 'open' : ''} style="background:var(--bg4);border:1px solid var(--bd);border-radius:8px;padding:6px 12px;margin-bottom:10px;font-size:10.5px;line-height:1.5;"><summary style="cursor:pointer;font-weight:700;">Pronto para gerar? ${_st.ia === false ? '· <span style="color:var(--red);">IA desligada</span>' : _st.teste && !_st.teste.ok ? '· <span style="color:var(--red);">IA sem funcionar</span>' : ''}${!RC.length ? ' · <span style="color:var(--red);">rate card vazio</span>' : ''}</summary>${linhas.join('')}</details>`;
  }
  async function refUpload(inp) {
    const fs = [...(inp.files || [])]; if (!fs.length) return; const lb = $('vpRefBtn'), txt = lb ? lb.firstChild : null;
    const r = await _aprenderArquivos(fs, $('vpRefRes')?.value || 'desconhecido', '', t => { if (txt) txt.textContent = t + ' '; });
    inp.value = ''; await statusRender(true); const b = $('vpStatus'); if (b) b.insertAdjacentHTML('afterbegin', `<div style="background:var(--bg4);border-radius:8px;padding:8px 12px;margin-bottom:8px;">${_resHtml(r, fs.length)}</div>`);
  }
  const _ehIA = m => /IA desligada|ia_desligada|ANTHROPIC_API_KEY|Claude API \[(401|403|429|529|400)\]|credit|invalid x-api-key/i.test(String(m || ''));
  function equipeManual() {
    if (!RC.length) { nota('Rate card vazio — cadastre os perfis primeiro', 'error'); aba('rate'); return; }
    lerForm(); const ja = new Set((PROP.dados.perfis || []).map(x => String(x.perfil).toLowerCase()));
    RC.forEach(c => { if (!ja.has(c.perfil.toLowerCase())) PROP.dados.perfis.push({ perfil: c.perfil, horas: 0, custo_hora: c.custo_hora ?? null, preco_hora: c.preco_alvo ?? null }); });
    renderPerfis(); $('vpEstInfo').innerHTML = '<span style="color:var(--gold);">Equipe montada a partir do rate card — preencha as horas de cada perfil (apague com ✕ quem não entra) e clique em Analisar.</span>';
  }
  async function estimar(auto) {
    lerForm(); if ((PROP.dados.escopo || '').length < 30) return nota('Descreva o escopo (pelo menos 30 caracteres)', 'error');
    if (!RC.length && !auto && !confirm('O rate card está vazio — a IA vai sugerir perfis sem custo. Continuar? (cadastre em "Rate card e parâmetros")')) return;
    const fim = ocupado($('vpBtnEstimar'), '🤖 Estimando...');
    try { const _poc = PROP.dados.tipo_documento === 'poc'; const r = await api('estimar', { escopo: PROP.dados.escopo, tipo_demanda: PROP.dados.tipo_demanda, tipo_documento: PROP.dados.tipo_documento, meses: _poc ? Math.round((PROP.dados.poc?.semanas || 6) / 4.33 * 100) / 100 : PROP.dados.meses, semanas: _poc ? PROP.dados.poc?.semanas : undefined }, 90000);
      PROP.dados.perfis = r.perfis; PROP.dados.estimativa = r; if (!PROP.dados.meses && r.meses) PROP.dados.meses = r.meses; if (r.risco) PROP.dados.risco = r.risco;
      preencherForm(); const sem = r.perfis.filter(x => !x.no_rate_card).map(x => x.perfil);
      $('vpEstInfo').innerHTML = `<b>${r.perfis.reduce((a, x) => a + (+x.horas || 0), 0)} horas</b> em ${r.meses || PROP.dados.meses} meses · risco ${esc(r.risco || '')}${sem.length ? `<br><span style="color:var(--gold);">Fora do rate card (informe custo/preço): ${esc(sem.join(', '))}</span>` : ''}${(r.premissas || []).length ? '<br>Premissas: ' + esc(r.premissas.slice(0, 4).join(' · ')) : ''}`;
      fim(); return true;
    } catch (e) { nota('Erro: ' + e.message, 'error');
      if (_ehIA(e.message) && $('vpEstInfo')) $('vpEstInfo').innerHTML = `<div style="color:var(--red);margin-bottom:4px;">A estimativa automática precisa da IA, que está desligada ou sem chave válida.</div><button class="btn btn-g" style="font-size:10px;" onclick="VD.equipeManual()">Montar equipe pelo rate card (sem IA)</button>${typeof window.iaChave === 'function' ? ' <button class="btn btn-g" style="font-size:10px;" onclick="iaChave()">Ligar IA</button>' : ''}`; }
    fim();
  }
  async function analisar() {
    lerForm(); const d = PROP.dados; if (!d.perfis.length) { nota('Inclua a equipe (perfis e horas): use 🤖 Estimar ou + perfil', 'error'); return; }
    const semCusto = d.perfis.filter(x => !(x.custo_hora > 0)).map(x => x.perfil), semHora = d.perfis.filter(x => !(x.horas > 0)).map(x => x.perfil);
    if (semCusto.length) { nota('Falta o custo/hora de: ' + semCusto.join(', ') + ' — preencha na linha ou cadastre no Rate card', 'error'); return; }
    if (semHora.length === d.perfis.length) { nota('Preencha as horas de pelo menos um perfil', 'error'); return; }
    if (PROP.cliente && !d.ja_cliente && !d.ja_cliente_manual) { await clienteChecar(); lerForm(); }
    const fim = ocupado($('vpBtnAnalisar'), '◆ Analisando...');
    const _conc = +String(d.preco_concorrente || '').replace(/[^\d,]/g, '').replace(',', '.') || null; const _meses = d.tipo_documento === 'poc' ? Math.max(.25, Math.round((d.poc.semanas || 6) / 4.33 * 100) / 100) : (d.meses || 3);
    try { PROP.analise = await api('analisar', { ja_cliente: !!d.ja_cliente, cliente: PROP.cliente, perfis: d.perfis, meses: _meses, tipo_documento: d.tipo_documento, preco_concorrente: _conc, descontos: d.descontos || {}, inicio: d.inicio || undefined, risco: d.risco, tipo_demanda: d.tipo_demanda, orcamento_cliente: d.orcamento_cliente, orcamento_tipo: d.orcamento_tipo }, 90000);
      delete PROP.analise.success; delete PROP.analise.action; PROP.formato = PROP.analise.recomendado; renderAnalise(); cronoRender(); $('vpAnalise').scrollIntoView({ behavior: 'smooth', block: 'start' }); fim(); return true; }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim();
  }
  function renderAnalise() {
    const a = PROP.analise, m = a.metas, c = a.custos;
    const sc = (t, v) => `<div style="display:grid;grid-template-columns:70px 1fr 26px;gap:6px;align-items:center;font-size:9.5px;color:var(--t2);"><span>${t}</span>${barra(v, 100, v >= 70 ? 'var(--green)' : v >= 45 ? 'var(--gold)' : 'var(--red)')}<b style="color:var(--t1);">${v}</b></div>`;
    $('vpAnalise').innerHTML = `<div class="panel"><div class="ph"><div class="pt">③ Inteligência financeira — qual formato bate a meta e vende</div></div><div class="pb">
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--t2);margin-bottom:10px;background:var(--bg4);border-radius:8px;padding:9px 12px;">
        <span>Meta anual <b style="color:var(--t1);">${R(m.meta_anual)}</b></span><span>Realizado <b style="color:var(--t1);">${R(m.realizado_ano)}</b></span><span>Pipeline ponderado <b style="color:var(--t1);">${R(m.pipeline_ponderado)}</b></span>
        <span>Gap a cobrir <b style="color:var(--red);">${R(m.gap)}</b></span><span>Recorrência ${P(m.recorrente_pct_atual)} da receita (meta ${m.meta_recorrente_pct}%)</span>
        <span>Custo total <b style="color:var(--t1);">${R(c.custo_total)}</b> · preço mínimo ${R(c.preco_minimo)} · alvo ${R(c.preco_alvo)}</span>
        <span title="${esc(CFG?.impostos_fonte || '')}">Impostos ${(c.impostos_por_mes || []).map(x => x.ano + ': ' + P(x.pct)).join(' · ') || P(c.impostos_efetivo_pct)} (média ${P(c.impostos_efetivo_pct)})</span>
        <span>Inflação + dissídio no custo: ${P(c.inflacao_aplicada_pct)}</span>${a.entrada?.tipo_documento === 'poc' ? '<span style="color:var(--gold);">🧪 POC: margem reduzida (porta de entrada)</span>' : ''}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;">
      ${a.formatos.map((f, i) => `<label style="display:block;cursor:pointer;background:var(--bg4);border:2px solid ${PROP.formato === f.formato ? 'var(--blue)' : 'var(--bd)'};border-radius:10px;padding:11px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;"><span style="font-weight:700;font-size:12px;"><input type="radio" name="vpFmt" value="${f.formato}" ${PROP.formato === f.formato ? 'checked' : ''} onchange="VD.escolher('${f.formato}')"/> ${esc(f.nome)}</span>${i === 0 ? '<span style="font-size:9px;background:var(--green);color:#fff;border-radius:4px;padding:2px 6px;">RECOMENDADO</span>' : ''}</div>
        <div style="font-size:22px;font-weight:800;font-family:var(--M);margin:6px 0 2px;">${f.scores.total}<span style="font-size:10px;color:var(--t2);font-weight:400;"> /100</span></div>
        <div style="display:grid;gap:3px;margin-bottom:8px;">${sc('Metas', f.scores.metas)}${sc('Vendável', f.scores.vendavel)}${sc('Caixa', f.scores.caixa)}${sc('Risco', f.scores.risco)}</div>
        <div style="font-size:10.5px;line-height:1.7;">Valor <b>${R(f.valor_total)}</b> · ${R(f.valor_mensal_medio)}/mês<br>Margem <b style="color:${f.margem_pct < (a.params.margem_min_pct) ? 'var(--red)' : 'var(--green)'};">${P(f.margem_pct)}</b> · lucro ${R(f.lucro)}<br>No ano: ${R(f.receita_no_ano)}${f.cobertura_gap_pct != null ? ` (${P(f.cobertura_gap_pct)} do gap)` : ''}<br>Recorrência (ARR): ${f.arr ? R(f.arr) : '—'} · 1º recebimento ${esc(f.primeiro_recebimento || '')}<br>Preço/h efetivo ${R(f.preco_hora_efetivo)}</div>
        ${f.alertas.length ? `<div style="font-size:10px;color:var(--gold);margin-top:6px;">⚠ ${esc(f.alertas.join(' · '))}</div>` : ''}
        ${f.poc_cortesia ? `<div style="font-size:10px;color:var(--blue);margin-top:5px;">🤝 ${f.valor_total > 0 ? 'POC com preço de cliente' : 'POC sem custo (cliente)'} · investimento comercial ${R(f.custo_investimento_comercial)}</div>` : f.formato === 'poc' ? `<div style="font-size:10px;color:var(--t2);margin-top:5px;">Crédito no contrato se fechar em ${PROP.dados.poc?.credito_dias || 60} dias</div>` : ''}
        ${f.condicao_cliente ? `<div style="font-size:10px;color:var(--green);margin-top:5px;">🤝 Cliente: ${f.condicao_cliente.desconto_pct}% se fechar em ${f.condicao_cliente.dias} dias → <b>${R(f.condicao_cliente.valor_com_desconto)}</b>${f.condicao_cliente.limitado_pelo_piso ? ' (limitado ao piso)' : ''}</div>` : ''}
        ${compHtml(f)}
        <details style="margin-top:6px;font-size:10px;"><summary style="cursor:pointer;color:var(--t2);">cronograma de faturamento</summary>${f.cronograma.map(x => `<div>${esc(x.mes)} · ${esc(x.desc)} · <b>${R(x.valor)}</b> (recebe ${esc(x.recebe)})</div>`).join('')}</details></label>`).join('')}</div>
      ${a.explicacao ? `<div style="margin-top:10px;background:var(--bg4);border-left:3px solid var(--blue);border-radius:6px;padding:10px 12px;font-size:11.5px;line-height:1.7;">${_mdLeve(a.explicacao)}</div>` : ''}
      <div style="font-size:9.5px;color:var(--t3);margin-top:6px;">Pesos: metas 40% · vendável 35% · caixa 15% · risco 10%. Impostos (média do período) ${a.custos?.impostos_efetivo_pct ?? a.params.impostos_pct}% · overhead ${a.params.overhead_pct}% · margem mínima ${a.params.margem_min_pct}% / alvo ${a.params.margem_alvo_pct}% · recebimento em ${a.params.prazo_recebimento_dias} dias. Fonte da conversão por formato: ${esc(a.fontes?.win_rate || '')}.</div>
      <button class="btn btn-or" id="vpBtnRedigir" onclick="VD.redigir()" style="margin-top:10px;width:100%;justify-content:center;">✍ Redigir proposta no formato escolhido (padrão aprendido)</button></div></div>`;
  }
  const _mdLeve = t => esc(String(t || '')).split('\n').map(l => { const h = l.match(/^\s*#{1,6}\s*(.+)$/); if (h) return `<div style="font-weight:700;margin:6px 0 2px;">${h[1]}</div>`; if (/^\s*-{3,}\s*$/.test(l)) return '<hr style="border:0;border-top:1px solid var(--bd);margin:6px 0;">';
    return l.replace(/^\s*[-•]\s+/, '• ').replace(/^\s*(\d+)\.\s+/, '$1. ') || '<div style="height:4px;"></div>'; }).map(l => /^<(div|hr)/.test(l) ? l : l + '<br>').join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*\*/g, '');
  async function clienteChecar() {
    const d = PROP?.dados; const nome = $('vpCliente')?.value.trim(); if (!d || !nome || d.ja_cliente_manual) return;
    try { const r = await api('cliente_checar', { cliente: nome }, 15000); if (r.ja_cliente && !$('vpJaCli').checked) { $('vpJaCli').checked = true; tipoDocMudou(); const i = $('vpJaCliInfo'); if (i) i.textContent += ' · detectado (' + (r.onde || [])[0] + ')'; nota('Cliente da Atlantyx detectado — regras de cliente aplicadas'); } } catch (_) {}
  }
  function escolher(f) { PROP.formato = f; renderAnalise(); cronoRender(); }
  async function redigir() {
    lerForm(); if (!PROP.analise) return nota('Analise os formatos antes', 'error');
    const fim = ocupado($('vpBtnRedigir'), '✍ Redigindo (até 1 min)...');
    let ok = false;
    try { const r = await api('redigir', { proposta: PROP, formato: PROP.formato }, 115000); PROP.documento = r.documento; renderDoc(); $('vpDoc').scrollIntoView({ behavior: 'smooth', block: 'start' }); nota('Proposta redigida — revise e salve'); ok = true; }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim(); return ok;
  }
  // v3.374: PDF/Word sem texto redigido → oferece fazer a análise (se faltar) e a redação na hora
  async function _garantirDoc() {
    if (PROP.documento) return true;
    if (!confirm('O PDF e o Word saem do texto da proposta (passo ④), que ainda não foi redigido.\n\nQuer que eu ' + (PROP.analise ? '' : 'analise os formatos de preço e ') + 'redija a proposta agora com a IA? (leva até 1 minuto)')) return false;
    if (!PROP.analise && !(await analisar())) return false;
    return await redigir();
  }
  function renderDoc() {
    const d = PROP.documento; if (!d) return;
    $('vpDoc').innerHTML = `<div class="panel"><div class="ph"><div class="pt">④ Documento da proposta</div><span style="font-size:10px;color:var(--t2);">${esc(FMT[d.formato] || '')} · editável</span></div><div class="pb">
      <input class="fi" id="vdDocTit" value="${esc(d.titulo || PROP.titulo)}" style="font-weight:700;font-size:13px;margin-bottom:10px;"/>
      ${(d.secoes || []).map((s, i) => `<div style="margin-bottom:10px;"><input class="fi vdDocSecT" data-i="${i}" value="${esc(s.titulo)}" style="font-weight:600;margin-bottom:4px;"/><textarea class="fta vdDocSecC" data-i="${i}" style="min-height:90px;font-size:11.5px;line-height:1.6;">${esc(s.conteudo)}</textarea></div>`).join('')}
      <div class="fl" style="margin-top:6px;">Matriz de responsabilidades (RACI) <span style="font-weight:400;color:var(--t3);">R executa · A aprova · C consultado · I informado</span></div>
      <div class="tw"><table style="min-width:520px;"><thead><tr><th>Atividade</th><th style="width:90px;">Atlantyx</th><th style="width:90px;">Cliente</th><th style="width:24px;"></th></tr></thead><tbody id="vdMR">${(d.matriz_responsabilidades || []).map((m, i) => `<tr><td><input class="fi" data-k="atividade" value="${esc(m.atividade)}"/></td>${['atlantyx', 'cliente'].map(k => `<td><select class="fsel" data-k="${k}" style="font-size:10.5px;">${['R', 'A', 'C', 'I', '—'].map(v => `<option${String(m[k] || '—').toUpperCase().startsWith(v) ? ' selected' : ''}>${v}</option>`).join('')}</select></td>`).join('')}<td><a href="javascript:void(0)" onclick="this.closest('tr').remove()" style="color:var(--red);">✕</a></td></tr>`).join('')}</tbody></table></div>
      <button class="btn btn-g" style="font-size:10px;margin:4px 0 8px;" onclick="VD.mrAdd()">+ linha</button>
      ${(d.tabela_investimento || []).length ? `<div class="fl" style="margin-top:6px;">Tabela de investimento</div><table><tbody>${d.tabela_investimento.map(t => `<tr><td>${esc(t.item)}</td><td style="text-align:right;font-family:var(--M);">${esc(t.valor)}</td></tr>`).join('')}</tbody></table>` : ''}</div></div>`;
  }
  function lerDoc() {
    const d = PROP.documento; if (!d) return; const t = $('vdDocTit'); if (t) d.titulo = t.value;
    document.querySelectorAll('.vdDocSecT').forEach(e => { d.secoes[+e.dataset.i].titulo = e.value; });
    if ($('vdMR')) d.matriz_responsabilidades = [...document.querySelectorAll('#vdMR tr')].map(tr => { const o = {}; tr.querySelectorAll('[data-k]').forEach(e => o[e.dataset.k] = e.value); return o; }).filter(x => x.atividade); document.querySelectorAll('.vdDocSecC').forEach(e => { d.secoes[+e.dataset.i].conteudo = e.value; });
  }
  async function salvar() {
    lerForm(); lerDoc(); if (!PROP.cliente) return nota('Informe o cliente', 'error');
    try { const r = await api('prop_salvar', PROP); PROP.id = r.id; PROP.numero = r.numero; nota('Proposta ' + r.numero + ' salva'); if (PROP.dados.rfp_origem) rfpLog(PROP.dados.rfp_origem, PROP); } catch (e) { nota('Erro: ' + e.message, 'error'); }
    try { const r = await api('prop_salvar', PROP); PROP.id = r.id; PROP.numero = r.numero; nota('Proposta ' + r.numero + ' salva'); funilCarregar(); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }
  function docMarkdownParaPdf(txt) { return String(txt || '').split('\n').map(l => l.trim().startsWith('- ') ? { text: '• ' + l.trim().substring(2), margin: [8, 1, 0, 1] } : { text: l.replace(/\*\*/g, ''), margin: [0, 1, 0, 1] }); }

  // ═══ v3.365 · MÁQUINA DE POC E PROPOSTAS ═══
  function tipoDocMudou(soVisual) {
    const t = $('vpTipoDoc')?.value || 'proposta', b = $('vpPocBox'); if (b) b.style.display = t === 'poc' ? '' : 'none';
    const P = CFG?.params || {}, cli = !!$('vpJaCli')?.checked, inf = $('vpJaCliInfo'), dc = P.desconto_cliente_pct ?? 5, dd = P.desconto_cliente_dias ?? 60, pp = P.poc_cliente_pct ?? 0;
    if (inf) inf.textContent = !cli ? '' : t === 'poc' ? `→ POC ${pp > 0 ? 'com ' + pp + '% do preço' : 'sem custo'} + ${dc}% de desconto no projeto se fechar em ${dd} dias` : `→ ${dc}% de desconto especial se fechar em ${dd} dias`;
    const cr = $('vpPocCred'); if (cr) cr.disabled = cli && t === 'poc' && !(pp > 0);
    const m = $('vpMeses'); if (m) { m.disabled = t === 'poc'; m.title = t === 'poc' ? 'Na POC o prazo vem da duração em semanas' : ''; }
    if (!soVisual && PROP) { lerForm(); PROP.analise = null; PROP.documento = null; const a = $('vpAnalise'); if (a) a.innerHTML = ''; const d = $('vpDoc'); if (d) d.innerHTML = ''; }
  }
  function compHtml(f) {
    const c = f.competitividade, d = f.desconto_aplicado_pct;
    if (!c && !d) return '';
    let h = '<div style="margin-top:7px;padding:6px 8px;border-radius:6px;background:var(--bg3,#0b1020);font-size:10px;line-height:1.6;">';
    if (c) h += `🆚 Concorrente ${R(c.concorrente)} · nós ${R(f.valor_total)} (<b style="color:${c.diferenca_pct > 10 ? 'var(--red)' : c.diferenca_pct > 0 ? 'var(--gold)' : 'var(--green)'};">${c.diferenca_pct > 0 ? '+' : ''}${P(c.diferenca_pct)}</b>) · piso ${R(c.piso)} · spread ${R(c.spread)}`;
    if (d) h += `<br>✔ Desconto aplicado <b>${P(d)}</b> (de ${R(f.valor_sem_desconto)}) <a href="javascript:void(0)" onclick="event.preventDefault();VD.aplicarDesconto('${f.formato}',0)" style="color:var(--blue);">remover</a>`;
    else if (c && c.desconto_sugerido_pct > 0) h += `<br>💡 Sugestão: <b>${P(c.desconto_sugerido_pct)}</b> → ${R(c.preco_sugerido)}${c.limitado_pelo_piso ? ' <span style="color:var(--gold);">(no piso da margem mínima; ainda ' + P(c.ainda_acima_pct) + ' acima)</span>' : ''} <a href="javascript:void(0)" onclick="event.preventDefault();VD.aplicarDesconto('${f.formato}',${c.desconto_sugerido_pct})" style="color:var(--blue);font-weight:700;">aplicar</a>`;
    return h + '</div>';
  }
  async function aplicarDesconto(fmt, pct) { lerForm(); PROP.dados.descontos = { ...(PROP.dados.descontos || {}), [fmt]: +pct || 0 }; if (!(+pct)) delete PROP.dados.descontos[fmt]; PROP.formato = fmt; await analisar(); }
  async function escopoUpload(inp) {
    const f = inp.files[0]; if (!f) return; if (f.size > 9 * 1024 * 1024) return nota('Arquivo acima de 9 MB', 'error');
    nota('Lendo o escopo do documento...', 'info');
    try { const d = await api('escopo_extrair', { nome: f.name, base64: await lerB64(f) }, 90000); const e = $('vpEscopo');
      e.value = (e.value.trim() ? e.value.trim() + '\n\n' : '') + d.escopo; nota('Escopo carregado (' + d.origem + ') — revise e edite antes de estimar'); }
    catch (e) { nota('Não consegui ler: ' + e.message, 'error'); } inp.value = '';
  }
  async function escopoBriefing(auto) {
    lerForm(); if ((PROP.dados.briefing || '').length < 20) { nota('Escreva o briefing do projeto primeiro', 'error'); return false; }
    if (!auto && PROP.dados.escopo && !confirm('Substituir o escopo atual pelo escopo gerado do briefing?')) return false;
    const fim = ocupado($('vpBtnBrief'), '✨ Escrevendo o escopo...'); let ok = false;
    try { const d = await api('escopo_briefing', { briefing: PROP.dados.briefing, cliente: PROP.cliente, tipo_demanda: PROP.dados.tipo_demanda, tipo_documento: PROP.dados.tipo_documento, meses: PROP.dados.meses, poc: PROP.dados.poc }, 90000);
      $('vpEscopo').value = d.escopo; lerForm(); ok = true; cronoRender(); nota('Escopo gerado pelo briefing — revise, edite e depois estime a equipe'); }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim(); return ok;
  }
  async function escopoProduto() {
    const id = $('vpProd').value; if (!id) return nota('Escolha um produto do catálogo', 'error'); lerForm();
    const fim = ocupado($('vpBtnProd'), 'Gerando...');
    try { const d = await api('escopo_gerar', { produto_id: id, cliente: PROP.cliente, necessidade: PROP.dados.escopo, tipo_documento: PROP.dados.tipo_documento }, 90000);
      if (PROP.dados.escopo && !confirm('Substituir o escopo atual pelo escopo gerado do produto ' + d.produto + '? (Cancelar = acrescentar no fim)')) $('vpEscopo').value = PROP.dados.escopo + '\n\n' + d.escopo; else $('vpEscopo').value = d.escopo;
      if (!PROP.titulo) $('vpTitulo').value = d.produto; nota('Escopo do produto gerado — edite à vontade antes de estimar'); }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim();
  }
  // catálogo de escopos de produto (aba Rate card e parâmetros)
  let ESC = [];
  function escRender() { const b = $('vdEscLista'); if (!b) return;
    b.innerHTML = ESC.map((x, i) => `<div style="border:1px solid var(--bd);border-radius:8px;padding:8px 10px;margin-bottom:8px;" data-i="${i}"><div style="display:flex;gap:6px;"><input class="fi" data-k="nome" value="${esc(x.nome)}" placeholder="Produto (ex.: Maestro)" style="font-weight:700;"/><a href="javascript:void(0)" onclick="VD.escRemover(${i})" style="color:var(--red);align-self:center;">✕</a></div>
      <input class="fi" data-k="resumo" value="${esc(x.resumo || '')}" placeholder="Resumo em uma linha" style="margin-top:4px;"/><textarea class="fta" data-k="escopo" style="min-height:110px;margin-top:4px;font-size:11px;" placeholder="Escopo padrão: objetivo, módulos, entregáveis, dentro/fora do escopo, premissas, SLA...">${esc(x.escopo || '')}</textarea></div>`).join('') || '<div style="font-size:11px;color:var(--t3);">Nenhum produto ainda. Cadastre o escopo padrão de cada produto (Maestro, Atlantyx OS…).</div>'; }
  function escLer() { return [...document.querySelectorAll('#vdEscLista [data-i]')].map(el => { const o = { id: ESC[+el.dataset.i]?.id }; el.querySelectorAll('[data-k]').forEach(e => o[e.dataset.k] = e.value); return o; }); }
  function escNovo() { ESC = escLer(); ESC.push({ nome: '', resumo: '', escopo: '' }); escRender(); }
  function escRemover(i) { ESC = escLer(); ESC.splice(i, 1); escRender(); }
  async function escSalvar() { try { const d = await api('escopos_salvar', { lista: escLer() }); ESC = d.escopos; if (CFG) CFG.escopos = ESC; escRender(); nota('Catálogo de escopos salvo'); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  // logo e fonte da marca nos documentos
  async function _logoDataUrl() { try { const b = await (await fetch('/logo-atlantyx-escuro.png')).blob(); return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); } catch (_) { return null; } }

  // ═══ v3.377 · CRONOGRAMA FÍSICO-FINANCEIRO (roadmap Atlantyx: 12 etapas com gates; POC em semanas) ═══
  const ROADMAP = [ // [nome, gate, início %, fim %, entrega]
    ['Entendimento do negócio', 'G1', 0, 8, 'Documento de Visão'], ['Planejamento', 'G2', 5, 12, 'Plano de projeto e cronograma'], ['Especificação detalhada', 'G3', 10, 25, 'ERF e ERT aprovadas'],
    ['Arquitetura, infraestrutura e segurança', 'G4', 15, 28, 'Arquitetura e plano de segurança/LGPD'], ['Protótipo', 'G5', 22, 35, 'Protótipo validado'], ['Construção', 'G6', 30, 70, 'Versão candidata'],
    ['Qualidade e testes', 'G7', 45, 78, 'Relatório de qualidade'], ['Segurança e desempenho', 'G8', 65, 80, 'Relatório de segurança e desempenho'], ['Homologação', 'G9', 75, 87, 'Termo de homologação'],
    ['Treinamento', 'G10', 82, 92, 'Usuários e operação treinados'], ['Implantação e operação assistida', 'G11', 88, 100, 'Solução estável em produção'], ['Passagem de conhecimento', 'G12', 94, 100, 'Aceite final']];
  const ROADMAP_POC = [['Kickoff e critérios de sucesso', '', 0, 12, 'Critérios assinados'], ['Acesso a dados e ambiente', '', 8, 30, 'Dados e ambiente liberados'], ['Construção do protótipo', '', 25, 75, 'Protótipo funcionando'],
    ['Treinamento dos usuários-chave', '', 65, 80, 'Usuários-chave treinados'], ['Uso assistido e validação', '', 70, 95, 'Medição dos critérios'], ['Relatório final e decisão go/no-go', '', 90, 100, 'Relatório e decisão'],
    ['Suporte do Analista de IA (dúvidas)', '', 0, 100, 'Suporte contínuo aos usuários']];
  const MARCOS_PADRAO = { fechado: [['Assinatura / kickoff', 'G1', 20], ['Especificação aprovada', 'G3', 20], ['Versão candidata entregue', 'G6', 25], ['Homologação', 'G9', 20], ['Implantação e aceite', 'G11', 15]],
    hibrido: [['Setup — assinatura', 'G1', 30], ['Homologação', 'G9', 40], ['Implantação e aceite', 'G11', 30]], poc: [['Início da POC', 'Kickoff e critérios de sucesso', 50], ['Relatório final e go/no-go', 'Relatório final e decisão go/no-go', 50]],
    padrao: [['Assinatura', 'G1', 30], ['Homologação', 'G9', 40], ['Aceite final', 'G12', 30]] };
  function _cronoBase() {
    const d = PROP.dados, poc = d.tipo_documento === 'poc'; const sem = poc ? (+d.poc?.semanas || 6) : Math.round((+d.meses || PROP.analise?.entrada?.meses || 3) * 4.33);
    const unidade = poc || sem <= 16 ? 'semanas' : 'meses', N = unidade === 'semanas' ? Math.max(1, sem) : Math.max(1, Math.round(+d.meses || PROP.analise?.entrada?.meses || 3));
    const fases = (poc ? ROADMAP_POC : ROADMAP).map(([nome, gate, a, b, entrega]) => { const ini = Math.min(N, Math.floor(a / 100 * N) + 1); return { nome, gate, ini, fim: Math.max(ini, Math.min(N, Math.ceil(b / 100 * N))), entrega, incluir: true }; });
    const fmt = poc ? 'poc' : (PROP.formato || PROP.analise?.recomendado || 'fechado');
    const marcos = (MARCOS_PADRAO[fmt] || MARCOS_PADRAO.padrao).map(([nome, ref, pct]) => { const f = fases.find(x => x.gate === ref || x.nome === ref); return { nome, ref, pct, quando: f ? f.fim : N }; });
    if (poc) marcos[0].quando = 1;
    return { unidade, total: N, fases, marcos, pagamento: poc || fmt === 'fechado' ? 'marcos' : 'formato', aba: 'fisico', gerado_em: new Date().toISOString() };
  }
  function cronoGerar() { if (PROP.dados.crono && !confirm('Refazer o cronograma pelo roadmap Atlantyx? Os ajustes manuais serão perdidos.')) return; lerForm(); PROP.dados.crono = _cronoBase(); cronoRender(); }
  const _fAtual = () => (PROP.analise?.formatos || []).find(x => x.formato === PROP.formato) || PROP.analise?.formatos?.[0] || null;
  function cronoRender() {
    const b = $('vpCrono'); if (!b || !PROP) return; const d = PROP.dados;
    if (!(d.escopo || '').trim() && !d.crono) { b.innerHTML = ''; return; }
    if (!d.crono) d.crono = _cronoBase(); const K = d.crono, f = _fAtual(), cortesia = !!(f?.poc_cortesia && !(f.valor_total > 0)) || (d.tipo_documento === 'poc' && d.ja_cliente && !((CFG?.params?.poc_cliente_pct ?? 0) > 0));
    const U = K.unidade === 'semanas' ? 'S' : 'M', N = K.total, F = K.fases.filter(x => x.incluir !== false);
    const soma = K.marcos.reduce((a, m) => a + (+m.pct || 0), 0), ok100 = Math.abs(soma - 100) < 0.01;
    const aba = cortesia ? 'fisico' : (K.aba || 'fisico');
    const tab = (k, t) => `<button class="btn ${aba === k ? 'btn-p' : 'btn-g'}" style="font-size:10px;padding:4px 10px;" onclick="VD.cronoAba('${k}')">${t}</button>`;
    // Gantt
    const col = `grid-template-columns:220px repeat(${N},minmax(${N > 26 ? 14 : 22}px,1fr))`;
    const gantt = `<div style="overflow:auto;border:1px solid var(--bd);border-radius:8px;"><div style="display:grid;${col};font-size:9.5px;min-width:${220 + N * (N > 26 ? 14 : 22)}px;">
      <div style="padding:5px 8px;font-weight:700;background:var(--bg4);position:sticky;left:0;">Etapa</div>${Array.from({ length: N }, (_, i) => `<div style="text-align:center;padding:5px 0;background:var(--bg4);font-weight:700;color:var(--t2);">${U}${i + 1}</div>`).join('')}
      ${F.map((x, k) => `<div style="padding:5px 8px;border-top:1px solid var(--bd);position:sticky;left:0;background:var(--bg2, var(--bg));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(x.entrega || '')}">${x.gate ? `<b style="color:var(--t3);">${esc(x.gate)}</b> ` : ''}${esc(x.nome)}</div>` + Array.from({ length: N }, (_, i) => { const on = i + 1 >= x.ini && i + 1 <= x.fim; const mk = !cortesia && K.marcos.some(m => +m.quando === i + 1 && (m.ref === x.gate || m.ref === x.nome));
        return `<div style="border-top:1px solid var(--bd);padding:4px 1px;"><div style="height:14px;border-radius:3px;background:${on ? (/Treinamento/i.test(x.nome) ? 'var(--gold)' : k % 2 ? '#00708A' : '#00C4CC') : 'transparent'};position:relative;">${mk ? '<span style="position:absolute;right:-3px;top:-3px;color:#00A86B;font-size:12px;" title="marco de pagamento">◆</span>' : ''}</div></div>`; }).join('')).join('')}</div></div>`;
    const fis = `<div class="tw" style="margin-top:8px;"><table style="min-width:640px;"><thead><tr><th style="width:26px;"></th><th>Etapa</th><th style="width:60px;">Gate</th><th style="width:70px;">Início (${U})</th><th style="width:70px;">Fim (${U})</th><th>Entrega</th><th style="width:24px;"></th></tr></thead><tbody>
      ${K.fases.map((x, i) => `<tr style="${x.incluir === false ? 'opacity:.45;' : ''}"><td><input type="checkbox" ${x.incluir !== false ? 'checked' : ''} onchange="VD.cronoSet('f',${i},'incluir',this.checked)" title="Incluir no cronograma"/></td>
        <td><input class="fi" value="${esc(x.nome)}" onchange="VD.cronoSet('f',${i},'nome',this.value)"/></td><td><input class="fi" value="${esc(x.gate || '')}" onchange="VD.cronoSet('f',${i},'gate',this.value)"/></td>
        <td><input class="fi" type="number" min="1" max="${N}" value="${x.ini}" onchange="VD.cronoSet('f',${i},'ini',this.value)"/></td><td><input class="fi" type="number" min="1" max="${N}" value="${x.fim}" onchange="VD.cronoSet('f',${i},'fim',this.value)"/></td>
        <td><input class="fi" value="${esc(x.entrega || '')}" onchange="VD.cronoSet('f',${i},'entrega',this.value)"/></td><td><a href="javascript:void(0)" onclick="VD.cronoDel('f',${i})" style="color:var(--red);">✕</a></td></tr>`).join('')}</tbody></table></div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center;"><button class="btn btn-g" style="font-size:10px;" onclick="VD.cronoAdd('f')">+ etapa</button>
        <span style="font-size:10px;color:var(--t2);">Duração total: <input class="fi" type="number" min="1" max="104" value="${N}" style="width:60px;display:inline-block;" onchange="VD.cronoTotal(this.value)"/> ${K.unidade}</span></div>`;
    // financeiro
    const vt = f ? f.valor_total : null, R0 = v => vt == null ? '—' : R(v);
    const fin = cortesia ? '' : `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0;font-size:10.5px;">
        <label style="display:flex;gap:4px;align-items:center;cursor:pointer;"><input type="radio" name="vpPag" ${K.pagamento === 'marcos' ? 'checked' : ''} onchange="VD.cronoPag('marcos')"/> <b>Pago por marcos</b> (percentuais somam 100%)</label>
        <label style="display:flex;gap:4px;align-items:center;cursor:pointer;"><input type="radio" name="vpPag" ${K.pagamento !== 'marcos' ? 'checked' : ''} onchange="VD.cronoPag('formato')"/> Conforme o formato comercial${f ? ' (' + esc(f.nome) + ')' : ''}</label>
        <span style="margin-left:auto;">Valor da proposta: <b>${vt == null ? 'analise os formatos' : R(vt)}</b></span></div>
      ${K.pagamento === 'marcos' ? `<div class="tw"><table style="min-width:640px;"><thead><tr><th>Marco de pagamento</th><th style="width:170px;">Vinculado à etapa/gate</th><th style="width:80px;">Quando (${U})</th><th style="width:70px;">%</th><th style="width:110px;text-align:right;">Valor</th><th style="width:24px;"></th></tr></thead><tbody>
        ${K.marcos.map((m, i) => `<tr><td><input class="fi" value="${esc(m.nome)}" onchange="VD.cronoSet('m',${i},'nome',this.value)"/></td>
          <td><select class="fsel" style="font-size:10px;" onchange="VD.cronoSet('m',${i},'ref',this.value)"><option value="">—</option>${F.map(x => { const v = x.gate || x.nome; return `<option value="${esc(v)}"${m.ref === v ? ' selected' : ''}>${esc((x.gate ? x.gate + ' · ' : '') + x.nome)}</option>`; }).join('')}</select></td>
          <td><input class="fi" type="number" min="1" max="${N}" value="${m.quando}" onchange="VD.cronoSet('m',${i},'quando',this.value)"/></td><td><input class="fi" type="number" min="0" max="100" step="0.5" value="${m.pct}" onchange="VD.cronoSet('m',${i},'pct',this.value)"/></td>
          <td style="text-align:right;font-family:var(--M);">${R0((vt || 0) * (+m.pct || 0) / 100)}</td><td><a href="javascript:void(0)" onclick="VD.cronoDel('m',${i})" style="color:var(--red);">✕</a></td></tr>`).join('')}
        <tr style="font-weight:700;"><td colspan="3" style="text-align:right;">Total</td><td style="color:${ok100 ? 'var(--green)' : 'var(--red)'};">${String(Math.round(soma * 100) / 100).replace('.', ',')}%</td><td style="text-align:right;font-family:var(--M);">${R0((vt || 0) * soma / 100)}</td><td></td></tr></tbody></table></div>
        <div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap;"><button class="btn btn-g" style="font-size:10px;" onclick="VD.cronoAdd('m')">+ marco</button>${!ok100 ? `<span style="font-size:10.5px;color:var(--red);font-weight:700;">⚠ Os marcos somam ${String(Math.round(soma * 100) / 100).replace('.', ',')}% — precisam somar 100%.</span><button class="btn btn-g" style="font-size:10px;" onclick="VD.cronoNormalizar()">Ajustar para 100%</button>` : '<span style="font-size:10px;color:var(--green);">✓ 100% do valor distribuído nos marcos</span>'}</div>`
      : `<div class="tw"><table><thead><tr><th>Parcela</th><th>Mês</th><th style="text-align:right;">Valor</th><th>Recebe</th></tr></thead><tbody>${(f?.cronograma || []).map(c => `<tr><td>${esc(c.desc)}</td><td>${esc(c.mes)}</td><td style="text-align:right;font-family:var(--M);">${R(c.valor)}</td><td>${esc(c.recebe || '')}</td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--t3);text-align:center;">Analise os formatos para ver as parcelas</td></tr>'}</tbody></table></div>`}`;
    b.innerHTML = `<div class="panel"><div class="ph"><div class="pt">📅 Cronograma físico-financeiro</div><span style="font-size:10px;color:var(--t2);">roadmap Atlantyx${d.tipo_documento === 'poc' ? ' · POC em semanas' : ' · 12 etapas com gates'}${cortesia ? ' · POC de cliente: só cronograma físico' : ''}</span>
      <div style="margin-left:auto;display:flex;gap:4px;">${tab('fisico', 'Físico')}${cortesia ? '' : tab('financeiro', 'Financeiro')}<button class="btn btn-g" style="font-size:10px;padding:4px 10px;" onclick="VD.cronoGerar()" title="Refaz pelo roadmap Atlantyx e pela duração atual">↻ Refazer</button></div></div><div class="pb">
      ${aba === 'fisico' ? gantt + fis : fin}</div></div>`;
  }
  function mrAdd() { lerDoc(); (PROP.documento.matriz_responsabilidades = PROP.documento.matriz_responsabilidades || []).push({ atividade: '', atlantyx: 'R', cliente: 'C' }); renderDoc(); }
  function cronoAba(a) { PROP.dados.crono.aba = a; cronoRender(); }
  function cronoSet(t, i, k, v) { const K = PROP.dados.crono, L = t === 'f' ? K.fases : K.marcos, x = L[i]; if (!x) return;
    x[k] = ['ini', 'fim', 'quando'].includes(k) ? Math.max(1, Math.min(K.total, Math.round(+v || 1))) : k === 'pct' ? Math.max(0, +String(v).replace(',', '.') || 0) : v;
    if (t === 'f' && x.fim < x.ini) x[k === 'ini' ? 'fim' : 'ini'] = x[k];
    if (t === 'm' && k === 'ref') { const f = K.fases.find(y => (y.gate || y.nome) === v); if (f) x.quando = f.fim; }
    cronoRender(); }
  function cronoDel(t, i) { const K = PROP.dados.crono; (t === 'f' ? K.fases : K.marcos).splice(i, 1); cronoRender(); }
  function cronoAdd(t) { const K = PROP.dados.crono; if (t === 'f') K.fases.push({ nome: 'Nova etapa', gate: '', ini: 1, fim: K.total, entrega: '', incluir: true }); else K.marcos.push({ nome: 'Novo marco', ref: '', quando: K.total, pct: Math.max(0, 100 - K.marcos.reduce((a, m) => a + (+m.pct || 0), 0)) }); cronoRender(); }
  function cronoPag(p) { PROP.dados.crono.pagamento = p; cronoRender(); }
  function cronoTotal(v) { const K = PROP.dados.crono, n0 = K.total, n1 = Math.max(1, Math.min(104, Math.round(+v || n0))); if (n1 === n0) return; const esc2 = x => Math.max(1, Math.min(n1, Math.round(x * n1 / n0)));
    K.fases.forEach(x => { x.ini = Math.max(1, esc2(x.ini - 1) + 1 > n1 ? n1 : Math.floor((x.ini - 1) * n1 / n0) + 1); x.fim = Math.max(x.ini, esc2(x.fim)); }); K.marcos.forEach(m => m.quando = esc2(m.quando)); K.total = n1; cronoRender(); }
  function cronoNormalizar() { const K = PROP.dados.crono, s0 = K.marcos.reduce((a, m) => a + (+m.pct || 0), 0); if (!s0) return; K.marcos.forEach(m => m.pct = Math.round((+m.pct || 0) / s0 * 1000) / 10); const dif = Math.round((100 - K.marcos.reduce((a, m) => a + m.pct, 0)) * 10) / 10; if (K.marcos.length) K.marcos[K.marcos.length - 1].pct = Math.round((K.marcos[K.marcos.length - 1].pct + dif) * 10) / 10; cronoRender(); }
  // ═══ v3.375 · COPILOTO DA PROPOSTA (chat com IA, ajustes aplicáveis) ═══
  const _md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').map(l => /^\s*[-•]\s/.test(l) ? '• ' + l.replace(/^\s*[-•]\s/, '') : l).join('<br>');
  function chatRender() {
    const b = $('vpChat'); if (!b || !PROP) return; const M = PROP.dados.chat || [];
    const sug = ['Como chego a 10% abaixo sem perder a margem mínima?', 'Qual formato fecha mais rápido com este cliente?', 'O concorrente cobra menos — o que faço?', 'Revise o texto do investimento para ficar mais persuasivo'];
    b.innerHTML = `<div class="panel"><div class="ph"><div class="pt">💬 Copiloto da proposta</div><span style="font-size:10px;color:var(--t2);">discuta valores, escopo e texto — os ajustes viram botões para aplicar</span>${M.length ? '<button class="btn btn-g" style="font-size:9.5px;padding:3px 8px;margin-left:auto;" onclick="VD.chatLimpar()">Limpar conversa</button>' : ''}</div><div class="pb">
      <div id="vpChatLog" style="max-height:420px;overflow:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:8px;">${M.length ? M.map((m, i) => m.papel === 'usuario'
        ? `<div style="align-self:flex-end;max-width:85%;background:var(--blue, #00708A);color:#fff;border-radius:10px 10px 2px 10px;padding:8px 11px;font-size:11.5px;line-height:1.5;">${_md(m.texto)}</div>`
        : `<div style="align-self:flex-start;max-width:92%;background:var(--bg4);border:1px solid var(--bd);border-radius:10px 10px 10px 2px;padding:8px 11px;font-size:11.5px;line-height:1.6;">${_md(m.texto)}${(m.acoes || []).length ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;">${m.acoes.map((a, k) => a.feito ? `<span style="font-size:10px;color:var(--green);">✓ ${esc(a.rotulo || a.tipo)}</span>` : `<button class="btn btn-p" style="font-size:10px;padding:4px 9px;" onclick="VD.chatAplicar(${i},${k})">⚡ ${esc(a.rotulo || a.tipo)}</button>`).join('')}</div>` : ''}</div>`).join('')
        : `<div style="font-size:10.5px;color:var(--t3);">Pergunte sobre preço, desconto, margem, formato, escopo ou o texto. Exemplos:</div><div style="display:flex;flex-wrap:wrap;gap:5px;">${sug.map(t => `<button class="btn btn-g" style="font-size:10px;padding:4px 9px;" onclick="VD.chatEnviar(${esc(JSON.stringify(t))})">${esc(t)}</button>`).join('')}</div>`}</div>
      <div style="display:flex;gap:6px;align-items:flex-end;"><textarea class="fta" id="vpChatIn" style="min-height:44px;flex:1;" placeholder="Ex.: o cliente tem R$ 400 mil de orçamento — como ajusto sem cair abaixo da margem mínima?" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();VD.chatEnviar();}"></textarea>
        <button class="btn btn-or" id="vpChatBtn" onclick="VD.chatEnviar()">Enviar</button></div></div></div>`;
    const lg = $('vpChatLog'); if (lg) lg.scrollTop = lg.scrollHeight;
  }
  async function chatEnviar(txt) {
    const inp = $('vpChatIn'); const t = String(txt || inp?.value || '').trim(); if (!t) return;
    lerForm(); lerDoc(); PROP.dados.chat = PROP.dados.chat || []; PROP.dados.chat.push({ papel: 'usuario', texto: t, em: new Date().toISOString() }); chatRender();
    const fim = ocupado($('vpChatBtn'), 'Pensando...');
    try { const r = await api('prop_chat', { proposta: PROP, mensagens: PROP.dados.chat.map(m => ({ papel: m.papel, texto: m.texto })) }, 100000);
      PROP.dados.chat.push({ papel: 'ia', texto: r.resposta, acoes: r.acoes || [], em: new Date().toISOString() }); }
    catch (e) { PROP.dados.chat.push({ papel: 'ia', texto: '⚠ ' + e.message, acoes: [] }); }
    PROP.dados.chat = PROP.dados.chat.slice(-40); fim(); chatRender();
  }
  function chatLimpar() { if (!confirm('Apagar a conversa desta proposta?')) return; PROP.dados.chat = []; chatRender(); }
  async function chatAplicar(i, k) {
    const m = PROP.dados.chat?.[i], a = m?.acoes?.[k]; if (!a) return; lerForm(); lerDoc(); const d = PROP.dados; const acha = n => (d.perfis || []).find(x => String(x.perfil).toLowerCase() === String(n || '').toLowerCase());
    let reanalisar = false;
    if (a.tipo === 'desconto') { d.descontos = { ...(d.descontos || {}), [a.formato]: +a.pct || 0 }; PROP.formato = a.formato; reanalisar = true; }
    else if (a.tipo === 'horas') { const p = acha(a.perfil); if (!p) return nota('Perfil não encontrado: ' + a.perfil, 'error'); p.horas = +a.horas || 0; reanalisar = true; }
    else if (a.tipo === 'preco_hora') { const p = acha(a.perfil); if (!p) return nota('Perfil não encontrado: ' + a.perfil, 'error'); p.preco_hora = +a.valor || null; reanalisar = true; }
    else if (a.tipo === 'remover_perfil') { d.perfis = d.perfis.filter(x => x !== acha(a.perfil)); reanalisar = true; }
    else if (a.tipo === 'adicionar_perfil') { const c = RC.find(x => x.perfil.toLowerCase() === String(a.perfil).toLowerCase()) || {}; d.perfis.push({ perfil: c.perfil || a.perfil, horas: +a.horas || 0, custo_hora: c.custo_hora ?? null, preco_hora: c.preco_alvo ?? null }); reanalisar = true; }
    else if (a.tipo === 'meses') { d.meses = +a.valor || d.meses; reanalisar = true; }
    else if (a.tipo === 'risco') { d.risco = a.valor; reanalisar = true; }
    else if (a.tipo === 'formato') { PROP.formato = a.formato; if (PROP.analise) renderAnalise(); }
    else if (a.tipo === 'escopo_adicionar') { d.escopo = (d.escopo ? d.escopo + '\n\n' : '') + a.texto; }
    else if (a.tipo === 'secao') { if (!PROP.documento) return nota('Redija a proposta antes de mudar o texto', 'error'); const S = PROP.documento.secoes; const s0 = S.find(x => x.titulo.toLowerCase() === String(a.titulo).toLowerCase()); if (s0) s0.conteudo = a.conteudo; else S.push({ titulo: a.titulo, conteudo: a.conteudo }); }
    else return nota('Ajuste não reconhecido', 'error');
    a.feito = true; const docAntes = PROP.documento; preencherForm();
    if (reanalisar && PROP.analise) { await analisar(); if (docAntes) nota('Preço recalculado — clique em ✍ Redigir de novo para o documento refletir o novo valor', 'info'); }
    else nota('Ajuste aplicado — salve a proposta');
    chatRender();
  }
  // ═══ v3.366 · ESCOPO COMPLEMENTAR (IA) ═══
  const COMPL_DEC = { incluir: 'Incluir no escopo', opcional: 'Opcional (à parte)', ignorar: 'Não usar' };
  async function complSugerir() {
    lerForm(); if ((PROP.dados.escopo || '').length < 30) return nota('Escreva ou carregue o escopo antes', 'error');
    const fim = ocupado($('vpBtnCompl'), '✨ Pensando...');
    try { const d = await api('escopo_complementar', { escopo: PROP.dados.escopo, cliente: PROP.cliente, tipo_demanda: PROP.dados.tipo_demanda, tipo_documento: PROP.dados.tipo_documento, estimativa: PROP.dados.estimativa }, 90000);
      PROP.dados.complementar = d.itens.map(x => ({ ...x, decisao: x.tipo === 'essencial' ? 'incluir' : x.tipo === 'recomendado' ? 'opcional' : 'ignorar' })); complRender(); nota('Escopo complementar sugerido — escolha o que entra e aplique'); }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim();
  }
  function complRender() {
    const b = $('vpCompl'); if (!b) return; const L = PROP?.dados?.complementar || []; if (!L.length) { b.innerHTML = ''; return; }
    const cor = { essencial: 'var(--red)', recomendado: 'var(--gold)', opcional: 'var(--t3)' };
    b.innerHTML = `<div style="background:var(--bg4);border:1px solid var(--bd);border-radius:8px;padding:8px 10px;margin-bottom:8px;"><div style="font-size:10.5px;font-weight:700;margin-bottom:6px;">✨ Escopo complementar sugerido</div>`
      + L.map((x, i) => `<div style="display:grid;grid-template-columns:1fr 150px;gap:8px;align-items:start;padding:5px 0;border-top:1px solid var(--bd);font-size:10.5px;line-height:1.45;"><div><b>${esc(x.titulo)}</b> <span style="font-size:9px;font-weight:700;color:${cor[x.tipo]};text-transform:uppercase;">${esc(x.tipo)}</span>${x.horas_estimadas ? ` <span style="color:var(--t3);">~${x.horas_estimadas}h</span>` : ''}<br>${esc(x.descricao)}<br><span style="color:var(--t3);">${esc(x.por_que)}</span></div>
        <select class="fsel" style="font-size:10px;" onchange="VD.complDecidir(${i},this.value)">${Object.entries(COMPL_DEC).map(([k, v]) => `<option value="${k}"${x.decisao === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>`).join('')
      + `<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px;"><button class="btn btn-g" style="font-size:10px;" onclick="VD.complLimpar()">Descartar</button><button class="btn btn-p" style="font-size:10px;" onclick="VD.complAplicar()">Aplicar ao escopo</button></div></div>`;
  }
  function complDecidir(i, v) { const x = PROP.dados.complementar?.[i]; if (x) x.decisao = v; }
  function complLimpar() { PROP.dados.complementar = []; complRender(); }
  function complAplicar() {
    lerForm(); const L = PROP.dados.complementar || [], inc = L.filter(x => x.decisao === 'incluir'), op = L.filter(x => x.decisao === 'opcional');
    let t = String(PROP.dados.escopo || '').replace(/\n*## Escopo complementar[\s\S]*?(?=\n## (?!Escopo complementar|Opcionais)|$)/, '').replace(/\n*## Opcionais \(orçar à parte\)[\s\S]*?(?=\n## |$)/, '').trim();
    if (inc.length) t += '\n\n## Escopo complementar\n' + inc.map(x => '- ' + x.titulo + ': ' + x.descricao).join('\n');
    if (op.length) t += '\n\n## Opcionais (orçar à parte)\n' + op.map(x => '- ' + x.titulo + ': ' + x.descricao).join('\n');
    $('vpEscopo').value = t; lerForm(); nota('Escopo atualizado' + (inc.length ? ' — estime a equipe de novo para incluir o complementar no preço' : ''));
  }
  // ═══ v3.366 · APRESENTAÇÃO DA SOLUÇÃO (PPTX) ═══
  let _pptProm = null;
  function _carregarPptx() {
    if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS); if (_pptProm) return _pptProm;
    const script = src => new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('não carregou ' + src)); document.head.appendChild(s); });
    _pptProm = (async () => { for (const u of ['https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js', 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js']) { try { await script(u); if (window.PptxGenJS) return window.PptxGenJS; } catch (_) {} } _pptProm = null; throw new Error('biblioteca de PowerPoint indisponível'); })();
    return _pptProm;
  }
  async function _imgData(url) { try { const b = await (await fetch(url)).blob(); return await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); } catch (_) { return null; } }
  function _pptFundos() {
    const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080; const g = cv.getContext('2d');
    let sem = 7; const rnd = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
    const glow = (x, y, r, cor, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${cor},${a})`); gr.addColorStop(1, `rgba(${cor},0)`); g.fillStyle = gr; g.fillRect(0, 0, 1920, 1080); };
    const rede = (x0, x1, y0, y1, n, cor, a) => { const pts = Array.from({ length: n }, () => [x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0)]);
      g.lineWidth = 1; pts.forEach((p, i) => pts.slice(i + 1).forEach(q => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < 190) { g.strokeStyle = `rgba(${cor},${a * (1 - d / 190)})`; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); } }));
      pts.forEach(p => { g.fillStyle = `rgba(${cor},${a * 1.6})`; g.beginPath(); g.arc(p[0], p[1], 2.2 + rnd() * 2, 0, 7); g.fill(); }); };
    const escuro = (fx) => { const lg = g.createLinearGradient(0, 0, 1920, 1080); lg.addColorStop(0, '#0B1220'); lg.addColorStop(0.6, '#0D1E2E'); lg.addColorStop(1, '#0A2E3A'); g.fillStyle = lg; g.fillRect(0, 0, 1920, 1080);
      glow(1650, 180, 820, '0,196,204', 0.30); glow(250, 1050, 700, '0,112,138', 0.35); glow(1500, 900, 420, '0,252,168', 0.08); fx && fx();
      g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1; for (let x = 0; x < 1920; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1080); g.stroke(); } for (let y = 0; y < 1080; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(1920, y); g.stroke(); } };
    const out = {};
    escuro(() => rede(1080, 1900, 60, 1020, 70, '0,196,204', 0.55)); out.capa = cv.toDataURL('image/png');
    sem = 11; escuro(() => rede(40, 820, 600, 1060, 40, '0,196,204', 0.35)); out.secao = cv.toDataURL('image/png');
    const lg = g.createLinearGradient(0, 0, 1920, 1080); lg.addColorStop(0, '#FFFFFF'); lg.addColorStop(1, '#EEF6F9'); g.fillStyle = lg; g.fillRect(0, 0, 1920, 1080);
    glow(1920, 0, 760, '0,196,204', 0.16); glow(0, 1080, 520, '0,112,138', 0.07); sem = 23; rede(1500, 1910, 10, 330, 26, '0,112,138', 0.28);
    g.fillStyle = '#00C4CC'; g.fillRect(0, 1062, 1920, 18); g.fillStyle = '#00708A'; g.fillRect(0, 1062, 520, 18); out.conteudo = cv.toDataURL('image/png');
    return out;
  }
  async function gerarApresentacao() {
    lerForm(); lerDoc(); if (!PROP.cliente) return nota('Informe o cliente', 'error');
    if ((PROP.dados.escopo || '').length < 30) { if ((PROP.dados.briefing || '').length >= 20) { if (!(await escopoBriefing(true))) return; } else return nota('Escreva o briefing ou o escopo antes', 'error'); }
    if (!PROP.analise && !confirm('Ainda não há análise de preço — a apresentação sai sem o slide de investimento. Continuar?')) return;
    const fim = ocupado($('vpBtnPpt'), '📊 Montando (até 1 min)...');
    try {
      const [{ apresentacao: A }, Pptx, logoEsc, logoBr] = await Promise.all([api('apresentacao_gerar', { proposta: PROP }, 100000), _carregarPptx(), _imgData('/logo-atlantyx-escuro.png'), _imgData('/logo-atlantyx-branco.png')]);
      PROP.dados.apresentacao = A;
      // v3.377: cronograma físico-financeiro da tela (roadmap Atlantyx) manda sobre o sugerido pela IA
      if (!PROP.dados.crono) PROP.dados.crono = _cronoBase();
      const K = PROP.dados.crono, fSel = _fAtual(), cortesiaP = !!(fSel?.poc_cortesia && !(fSel.valor_total > 0));
      if (K?.fases?.length) { A.cronograma = K.fases.filter(x => x.incluir !== false).map(x => ({ fase: x.nome, mes_inicio: x.ini, mes_fim: x.fim, entregas: x.entrega })); A.meses = K.total; A.unidade = K.unidade;
        A.marcos = !cortesiaP && K.pagamento === 'marcos' ? K.marcos.map(m => ({ mes: m.quando, nome: m.nome + ' · ' + String(m.pct).replace('.', ',') + '%' })) : (K.fases.filter(x => x.gate && x.incluir !== false && ['G1', 'G6', 'G9', 'G11'].includes(x.gate)).map(x => ({ mes: x.fim, nome: x.gate + ' ' + x.nome.split(' ')[0] }))); }
      if (A.investimento && !cortesiaP && K?.pagamento === 'marcos' && K.marcos?.length) A.investimento.cronograma = K.marcos.map(m => ({ desc: m.nome + ' — ' + String(m.pct).replace('.', ',') + '%', mes: (K.unidade === 'semanas' ? 'Semana ' : 'Mês ') + m.quando, valor: (A.investimento.valor_total || 0) * (+m.pct || 0) / 100 }));
      const MRx = (PROP.documento?.matriz_responsabilidades?.length ? PROP.documento.matriz_responsabilidades : A.responsabilidades) || [];
      const pptx = new Pptx(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'Atlantyx'; pptx.company = 'Atlantyx'; pptx.title = A.titulo || PROP.titulo;
      const F = 'Montserrat', ESCURO = '0B1220', TXT = '1F2937', PETROLEO = '00708A', CIANO = '00C4CC', VERDE = '00FCA8', CINZA = '6B7280', CLARO = 'F3F8FA';
      const BG = _pptFundos(); // fundos desenhados em canvas (gradiente + rede de pontos), embutidos como imagem
      const W = 13.333, H = 7.5;
      const KICK = { contexto: 'CONTEXTO', desafio: 'O DESAFIO', solucao: 'A SOLUÇÃO', como_funciona: 'COMO FUNCIONA', escopo: 'ESCOPO', complementar: 'ESCOPO COMPLEMENTAR', resultados: 'RESULTADOS ESPERADOS', equipe: 'EQUIPE', riscos: 'RISCOS E MITIGAÇÃO', proximos_passos: 'PRÓXIMOS PASSOS', cronograma: 'CRONOGRAMA', investimento: 'INVESTIMENTO', responsabilidades: 'RESPONSABILIDADES' };
      pptx.defineSlideMaster({ title: 'ATX', background: { data: BG.conteudo }, objects: [
        ...(logoEsc ? [{ image: { data: logoEsc, x: W - 2.35, y: 0.38, w: 1.75, h: 0.343 } }] : []),
        { text: { text: 'atlantyx.io', options: { x: 0.6, y: 6.98, w: 4, h: 0.3, fontFace: F, fontSize: 9, color: CINZA } } }],
        slideNumber: { x: W - 1.1, y: 6.98, w: 0.6, h: 0.3, fontFace: F, fontSize: 9, color: CINZA, align: 'right' } });
      const cab = (sl, tipo, t) => { sl.addText(KICK[tipo] || String(tipo || '').toUpperCase(), { x: 0.6, y: 0.42, w: 8, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: PETROLEO, charSpacing: 3 });
        sl.addText(t || '', { x: 0.6, y: 0.72, w: W - 3.4, h: 0.85, fontFace: F, fontSize: 26, bold: true, color: ESCURO, fit: 'shrink', valign: 'top' });
        sl.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.6, w: 0.9, h: 0.06, fill: { color: CIANO }, line: { type: 'none' } }); };
      // layouts
      const lCards = (sl, pts, cor) => { const n = pts.length, cols = n <= 3 ? n : n === 4 ? 2 : 3, rows = Math.ceil(n / cols), gx = 0.3, gy = 0.3, x0 = 0.6, w = (W - 1.2 - gx * (cols - 1)) / cols, h = Math.min(rows === 1 ? 3.0 : 2.3, (4.7 - gy * (rows - 1)) / rows), y0 = 2.0 + Math.max(0, (4.7 - rows * h - gy * (rows - 1)) / 2);
        pts.forEach((t, k) => { const x = x0 + (k % cols) * (w + gx), y = y0 + Math.floor(k / cols) * (h + gy);
          sl.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: 'DCE7EC', width: 0.75 }, shadow: { type: 'outer', color: '0B1220', opacity: 0.08, blur: 8, offset: 2, angle: 90 } });
          sl.addShape(pptx.ShapeType.rect, { x, y: y + 0.18, w: 0.07, h: h - 0.36, fill: { color: cor || (k % 2 ? PETROLEO : CIANO) }, line: { type: 'none' } });
          sl.addText(String(k + 1).padStart(2, '0'), { x: x + 0.3, y: y + 0.18, w: 1, h: 0.45, fontFace: F, fontSize: 18, bold: true, color: cor || CIANO });
          sl.addText(t, { x: x + 0.3, y: y + 0.62, w: w - 0.55, h: h - 0.8, fontFace: F, fontSize: n > 4 ? 15 : n === 4 ? 17 : 19, color: TXT, valign: 'top', fit: 'shrink' }); }); };
      const lFluxo = (sl, pts) => { const n = pts.length, gx = 0.12, w = (W - 1.2 - gx * (n - 1)) / n, y = 2.8, h = 1.25;
        pts.forEach((t, k) => { const x = 0.6 + k * (w + gx);
          sl.addShape(k === 0 ? pptx.ShapeType.homePlate : pptx.ShapeType.chevron, { x, y, w, h, fill: { color: k % 2 ? PETROLEO : '0E8FA3' }, line: { type: 'none' } });
          sl.addText('ETAPA ' + (k + 1), { x: x + 0.35, y, w: w - 0.6, h, fontFace: F, fontSize: 13, bold: true, color: 'FFFFFF', valign: 'middle', align: 'center' });
          sl.addText(t, { x, y: y + h + 0.25, w, h: 2.6, fontFace: F, fontSize: n > 4 ? 15 : 17, color: TXT, valign: 'top', align: 'center', fit: 'shrink' }); }); };
      const lCheck = (sl, pts) => { const cols = pts.length > 4 ? 2 : 1, rows = Math.ceil(pts.length / cols), w = (W - 1.2 - 0.4 * (cols - 1)) / cols, h = Math.min(1.05, 4.6 / rows);
        pts.forEach((t, k) => { const x = 0.6 + Math.floor(k / rows) * (w + 0.4), y = 2.0 + (k % rows) * h;
          sl.addShape(pptx.ShapeType.ellipse, { x, y: y + 0.1, w: 0.42, h: 0.42, fill: { color: VERDE }, line: { type: 'none' } });
          sl.addText('✓', { x, y: y + 0.1, w: 0.42, h: 0.42, fontFace: F, fontSize: 14, bold: true, color: ESCURO, align: 'center', valign: 'middle' });
          sl.addText(t, { x: x + 0.6, y, w: w - 0.7, h: h - 0.05, fontFace: F, fontSize: cols > 1 ? 16 : 19, color: TXT, valign: 'middle', fit: 'shrink' }); }); };
      const lRiscos = (sl, pts) => lCards(sl, pts, 'E0A100');
      const addConteudo = x => { const pts = (x.pontos || []).map(t => String(t).replace(/\.$/, '')).filter(Boolean).slice(0, 6); if (!pts.length) return;
        const sl = pptx.addSlide({ masterName: 'ATX' }); cab(sl, x.tipo, x.titulo);
        if ((x.tipo === 'como_funciona' || x.tipo === 'solucao') && pts.length >= 3 && pts.length <= 5) lFluxo(sl, pts);
        else if (['escopo', 'complementar', 'proximos_passos', 'equipe'].includes(x.tipo)) lCheck(sl, pts);
        else if (x.tipo === 'riscos') lRiscos(sl, pts); else lCards(sl, pts); };
      // capa
      const capa = pptx.addSlide(); capa.background = { data: BG.capa };
      if (logoBr) capa.addImage({ data: logoBr, x: 0.8, y: 0.7, w: 2.4, h: 0.47 });
      capa.addText('APRESENTAÇÃO DA SOLUÇÃO', { x: 0.8, y: 2.3, w: 8, h: 0.35, fontFace: F, fontSize: 12, bold: true, color: VERDE, charSpacing: 4 });
      capa.addText(A.titulo || PROP.titulo || 'Apresentação da solução', { x: 0.8, y: 2.7, w: 8.6, h: 1.7, fontFace: F, fontSize: 38, bold: true, color: 'FFFFFF', valign: 'top', fit: 'shrink' });
      capa.addText(A.subtitulo || '', { x: 0.8, y: 4.45, w: 8.6, h: 0.8, fontFace: F, fontSize: 17, color: CIANO, valign: 'top', fit: 'shrink' });
      capa.addShape(pptx.ShapeType.rect, { x: 0.8, y: 5.75, w: 0.06, h: 0.75, fill: { color: VERDE }, line: { type: 'none' } });
      capa.addText([{ text: 'Preparado para ' + PROP.cliente, options: { bold: true, color: 'FFFFFF', breakLine: true } }, { text: (PROP.contato ? PROP.contato + ' · ' : '') + new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), options: { color: 'B8C4D4' } }], { x: 1.0, y: 5.72, w: 8, h: 0.8, fontFace: F, fontSize: 13 });
      // agenda
      const conteudo = (A.slides || []).filter(x => x.tipo !== 'investimento' && x.tipo !== 'cronograma');
      const proximos = conteudo.filter(x => x.tipo === 'proximos_passos'), corpo = conteudo.filter(x => x.tipo !== 'proximos_passos');
      const C = (A.cronograma || []).filter(x => x && x.fase).slice(0, 14), I = A.investimento;
      const agenda = [...corpo.map(x => x.titulo), ...(C.length ? ['Cronograma'] : []), ...(MRx.length ? ['Responsabilidades'] : []), ...(I ? ['Investimento'] : []), ...proximos.map(x => x.titulo)].filter(Boolean);
      if (agenda.length >= 4) { const sl = pptx.addSlide(); sl.background = { data: BG.secao };
        sl.addText('AGENDA', { x: 0.8, y: 0.8, w: 5, h: 0.4, fontFace: F, fontSize: 12, bold: true, color: VERDE, charSpacing: 4 });
        sl.addText('O que vamos apresentar', { x: 0.8, y: 1.2, w: 5, h: 1.4, fontFace: F, fontSize: 30, bold: true, color: 'FFFFFF', valign: 'top' });
        const n = Math.min(agenda.length, 12), col = n > 6 ? 2 : 1, rows = Math.ceil(n / col);
        agenda.slice(0, 12).forEach((t, k) => { const x = 6.2 + Math.floor(k / rows) * 3.5, y = 1.0 + (k % rows) * Math.min(0.85, 5.4 / rows);
          sl.addText(String(k + 1).padStart(2, '0'), { x, y, w: 0.7, h: 0.5, fontFace: F, fontSize: 18, bold: true, color: CIANO });
          sl.addText(t, { x: x + 0.7, y, w: col > 1 ? 2.7 : 5.8, h: 0.5, fontFace: F, fontSize: 14, color: 'FFFFFF', valign: 'middle', fit: 'shrink' }); }); }
      corpo.forEach(addConteudo);
      // cronograma (Gantt) — fases à esquerda com as entregas, barras por mês, marcos numa faixa própria
      if (C.length) { const sl = pptx.addSlide({ masterName: 'ATX' }); cab(sl, 'cronograma', 'Cronograma do projeto');
        const ints = C.map(x => { let a = Math.round(+x.mes_inicio || 1), b = Math.round(+x.mes_fim || a); a = Math.max(1, a); b = Math.max(a, b); return { ...x, a, b }; });
        const M = Math.max(1, Math.min(24, Math.max(Math.round(+A.meses || 0), ...ints.map(x => x.b))));
        ints.forEach(x => { x.a = Math.min(x.a, M); x.b = Math.min(Math.max(x.b, x.a), M); });
        const mk = (A.marcos || []).filter(m => m && m.nome).slice(0, 8).sort((a, b) => (+a.mes || 0) - (+b.mes || 0)), xL = 0.6, wL = 3.5, x0 = xL + wL + 0.15, wT = W - 0.6 - x0, cw = wT / M, yH = 1.95, hH = 0.42;
        const yRows = yH + hH + 0.1, alt = 6.75 - yRows - (mk.length ? 0.95 : 0), rh = Math.min(0.62, alt / ints.length);
        const mesNome = i => { if (A.unidade === 'semanas') return 'S' + (i + 1); if (!/^\d{4}-\d{2}$/.test(A.inicio || '')) return 'M' + (i + 1); const [y, m] = A.inicio.split('-').map(Number); const d = new Date(y, m - 1 + i, 1); return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + (M <= 12 ? '/' + String(d.getFullYear()).slice(2) : ''); };
        sl.addShape(pptx.ShapeType.roundRect, { x: x0, y: yH, w: wT, h: hH, rectRadius: 0.06, fill: { color: ESCURO }, line: { type: 'none' } });
        for (let i = 0; i < M; i++) { sl.addText(mesNome(i), { x: x0 + i * cw, y: yH, w: cw, h: hH, fontFace: F, fontSize: M > 16 ? 7 : M > 10 ? 8 : 10, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
          if (i % 2 === 1) sl.addShape(pptx.ShapeType.rect, { x: x0 + i * cw, y: yRows, w: cw, h: rh * ints.length, fill: { color: 'EEF5F8' }, line: { type: 'none' } }); }
        ints.forEach((x, k) => { const y = yRows + k * rh;
          sl.addShape(pptx.ShapeType.line, { x: xL, y: y + rh, w: W - 0.6 - xL, h: 0, line: { color: 'E3EAEE', width: 0.5 } });
          sl.addText([{ text: String(x.fase).substring(0, 40), options: { bold: true, color: ESCURO, fontSize: rh < 0.45 ? 10 : 11.5, breakLine: !!x.entregas } }, ...(x.entregas ? [{ text: String(x.entregas).substring(0, 60), options: { color: CINZA, fontSize: rh < 0.45 ? 8 : 9 } }] : [])],
            { x: xL, y, w: wL, h: rh, fontFace: F, valign: 'middle', fit: 'shrink', margin: 2 });
          const bx = x0 + (x.a - 1) * cw + 0.04, bw = (x.b - x.a + 1) * cw - 0.08, bh = Math.max(0.2, rh * 0.52);
          sl.addShape(pptx.ShapeType.roundRect, { x: bx, y: y + (rh - bh) / 2, w: bw, h: bh, rectRadius: Math.min(0.1, bh / 2), fill: { color: /treinamento/i.test(x.fase) ? 'E0A100' : k % 2 ? PETROLEO : CIANO }, line: { type: 'none' } });
          if (bw > 0.9) sl.addText((x.b - x.a + 1) + (A.unidade === 'semanas' ? (x.b - x.a ? ' semanas' : ' semana') : (x.b - x.a ? ' meses' : ' mês')), { x: bx, y: y + (rh - bh) / 2, w: bw, h: bh, fontFace: F, fontSize: 8.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' }); });
        if (mk.length) { const ym = yRows + ints.length * rh + 0.15;
          sl.addText('Marcos', { x: xL, y: ym, w: wL, h: 0.4, fontFace: F, fontSize: 11, bold: true, color: PETROLEO, valign: 'middle' });
          sl.addShape(pptx.ShapeType.line, { x: x0, y: ym + 0.2, w: wT, h: 0, line: { color: 'B8C9D1', width: 1, dashType: 'dash' } });
          mk.forEach((m, k) => { const i = Math.min(M, Math.max(1, Math.round(+m.mes || 1))), cx = x0 + (i - 0.5) * cw;
            sl.addShape(pptx.ShapeType.diamond, { x: cx - 0.13, y: ym + 0.07, w: 0.26, h: 0.26, fill: { color: VERDE }, line: { color: ESCURO, width: 0.75 } });
            sl.addText(String(m.nome).substring(0, 28), { x: Math.max(x0 - 0.3, Math.min(W - 0.6 - 1.8, cx - 0.9)), y: ym + (k % 2 ? 0.58 : 0.3), w: 1.8, h: 0.3, fontFace: F, fontSize: 8, color: TXT, align: 'center', valign: 'top', fit: 'shrink' }); }); } }
      // matriz de responsabilidades (RACI)
      if (MRx.length) { const sl = pptx.addSlide({ masterName: 'ATX' }); cab(sl, 'responsabilidades', 'Matriz de responsabilidades');
        const corL = { R: PETROLEO, A: ESCURO, C: CIANO, I: 'B8C4D4' }, L = MRx.slice(0, 14), rh = Math.min(0.36, 4.3 / (L.length + 1));
        const cel = v => { const k = String(v || '—').trim().toUpperCase().charAt(0); return { text: corL[k] ? k : '—', options: { align: 'center', bold: true, color: corL[k] && k !== 'I' ? 'FFFFFF' : ESCURO, fill: { color: corL[k] || 'FFFFFF' } } }; };
        sl.addTable([[{ text: 'Atividade', options: { bold: true, color: 'FFFFFF', fill: { color: ESCURO } } }, { text: 'Atlantyx', options: { bold: true, color: 'FFFFFF', fill: { color: ESCURO }, align: 'center' } }, { text: PROP.cliente || 'Cliente', options: { bold: true, color: 'FFFFFF', fill: { color: ESCURO }, align: 'center' } }],
          ...L.map((m, k) => [{ text: m.atividade || '', options: { fill: { color: k % 2 ? 'FFFFFF' : CLARO } } }, cel(m.atlantyx), cel(m.cliente)])],
          { x: 0.6, y: 1.95, w: 12.13, colW: [8.53, 1.8, 1.8], fontFace: F, fontSize: L.length > 10 ? 10 : 12, color: TXT, border: { type: 'solid', color: 'FFFFFF', pt: 1.5 }, rowH: rh, valign: 'middle' });
        sl.addText([['R', 'executa'], ['A', 'aprova'], ['C', 'é consultado'], ['I', 'é informado']].map(([k, t], i) => ({ text: k + ' ' + t + (i < 3 ? '     ' : ''), options: { color: TXT } })), { x: 0.6, y: 6.55, w: 12, h: 0.3, fontFace: F, fontSize: 9.5 }); }
      // investimento
      if (I) { const sl = pptx.addSlide({ masterName: 'ATX' }); cab(sl, 'investimento', 'Investimento');
        const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        sl.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 2.0, w: 4.4, h: 4.5, rectRadius: 0.15, fill: { color: ESCURO }, line: { type: 'none' } });
        sl.addText('INVESTIMENTO TOTAL', { x: 0.9, y: 2.3, w: 3.8, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: VERDE, charSpacing: 3 });
        const semCusto = I.poc_cortesia && !(I.valor_total > 0);
        sl.addText(semCusto ? 'Sem custo' : brl(I.valor_total), { x: 0.9, y: 2.65, w: 3.9, h: 0.9, fontFace: F, fontSize: 32, bold: true, color: 'FFFFFF', fit: 'shrink' });
        sl.addText([{ text: semCusto ? 'POC · condição de cliente Atlantyx' : (I.formato || ''), options: { bold: true, color: CIANO, breakLine: true } }, ...(I.mensal && !semCusto ? [{ text: brl(I.mensal) + ' por mês, em média', options: { color: 'C9D3E0', breakLine: true } }] : []), ...(I.desconto_pct ? [{ text: 'Condição especial de ' + String(I.desconto_pct).replace('.', ',') + '%', options: { color: VERDE, breakLine: true } }] : []),
          ...(I.credito_dias ? [{ text: 'Valor abatido do projeto se fechar em ' + I.credito_dias + ' dias', options: { color: VERDE, breakLine: true } }] : []), ...(I.condicao_cliente ? [{ text: I.condicao_cliente.desconto_pct + '% adicional se fechar em ' + I.condicao_cliente.dias + ' dias: ' + brl(I.condicao_cliente.valor_com_desconto), options: { color: VERDE } }] : []),
          ...(semCusto && PROP.dados.ja_cliente ? [{ text: (CFG?.params?.desconto_cliente_pct ?? 5) + '% de desconto no projeto se fechar em ' + (CFG?.params?.desconto_cliente_dias ?? 60) + ' dias', options: { color: VERDE } }] : [])],
          { x: 0.9, y: 3.7, w: 3.8, h: 1.4, fontFace: F, fontSize: 13, valign: 'top', paraSpaceAfter: 6 });
        sl.addText('Tributos inclusos conforme a legislação vigente na emissão de cada nota fiscal.', { x: 0.9, y: 5.6, w: 3.8, h: 0.7, fontFace: F, fontSize: 9, color: '8A99AD', valign: 'bottom' });
        const fmtMes = m => /^\d{4}-\d{2}$/.test(m || '') ? new Date(+m.slice(0, 4), +m.slice(5) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('. de ', '/').replace('.', '') : (m || '');
        const linhas = (I.cronograma || []).slice(0, 12), hd = o => ({ bold: true, color: 'FFFFFF', fill: { color: PETROLEO }, ...o });
        sl.addText('Cronograma de faturamento', { x: 5.4, y: 2.0, w: 7.3, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: ESCURO });
        if (linhas.length && !semCusto) sl.addTable([[{ text: 'Parcela', options: hd() }, { text: 'Quando', options: hd() }, { text: 'Valor', options: hd({ align: 'right' }) }], ...linhas.map((c, k) => [{ text: c.desc || '', options: { fill: { color: k % 2 ? 'FFFFFF' : CLARO } } }, { text: fmtMes(c.mes), options: { fill: { color: k % 2 ? 'FFFFFF' : CLARO } } }, { text: brl(c.valor), options: { align: 'right', bold: true, fill: { color: k % 2 ? 'FFFFFF' : CLARO } } }])],
          { x: 5.4, y: 2.5, w: 7.33, colW: [3.9, 1.6, 1.83], fontFace: F, fontSize: linhas.length > 8 ? 9 : 11, color: TXT, border: { type: 'solid', color: 'E3EAEE', pt: 0.5 }, rowH: Math.min(0.36, 3.9 / (linhas.length + 1)), valign: 'middle' }); }
      proximos.forEach(addConteudo);
      // encerramento
      const fimS = pptx.addSlide(); fimS.background = { data: BG.capa };
      if (logoBr) fimS.addImage({ data: logoBr, x: (W - 3.4) / 2, y: 2.4, w: 3.4, h: 0.667 });
      fimS.addText('Obrigado', { x: 0, y: 3.45, w: W, h: 0.8, fontFace: F, fontSize: 32, bold: true, color: 'FFFFFF', align: 'center' });
      fimS.addText('Dados, BI e Inteligência Artificial para decisões melhores · atlantyx.io', { x: 0, y: 4.25, w: W, h: 0.5, fontFace: F, fontSize: 13, color: CIANO, align: 'center' });
      await pptx.writeFile({ fileName: `Apresentacao_${(PROP.cliente || 'cliente').replace(/[^\w]+/g, '_')}_${PROP.numero || 'rascunho'}.pptx` });
      nota('Apresentação gerada — salve a proposta para guardar o conteúdo');
    } catch (e) { nota('Apresentação: ' + e.message, 'error'); } fim();
  }
  async function baixarPdf() {
    lerForm(); lerDoc(); if (!PROP.documento && !(await _garantirDoc())) return; const d = PROP.documento;
    try { const pdfMake = await window._carregarPdfMake(); const logo = await _logoDataUrl();
      // v3.365: Montserrat (fonte da marca) servida pelo próprio sistema; se falhar, cai na fonte padrão
      const base = location.origin + '/fonts/montserrat-latin-';
      const fontes = { Montserrat: { normal: base + '400-normal.woff', bold: base + '700-normal.woff', italics: base + '400-normal.woff', bolditalics: base + '700-normal.woff' }, Roboto: (pdfMake.fonts || {}).Roboto || { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } };
      const tipo = { poc: 'PROVA DE CONCEITO (POC)', piloto: 'PROPOSTA DE PILOTO' }[PROP.dados.tipo_documento] || 'PROPOSTA COMERCIAL';
      const content = [
        { columns: [logo ? { image: logo, width: 150 } : { text: 'ATLANTYX.', bold: true, fontSize: 16 }, { text: tipo, alignment: 'right', color: '#00708A', bold: true, fontSize: 9, characterSpacing: 1.5, margin: [0, 8, 0, 0] }] },
        { canvas: [{ type: 'rect', x: 0, y: 8, w: 499, h: 3, color: '#00C4CC' }] },
        { text: d.titulo || PROP.titulo, fontSize: 20, bold: true, color: '#0F172A', margin: [0, 16, 0, 4] },
        { text: `${PROP.cliente}${PROP.contato ? ' · ' + PROP.contato : ''} · ${PROP.numero || 'rascunho'} · ${new Date().toLocaleDateString('pt-BR')}`, color: '#555', fontSize: 9, margin: [0, 0, 0, 16] }];
      (d.secoes || []).forEach((s, i) => { content.push({ text: (i + 1) + '. ' + s.titulo, fontSize: 13, bold: true, color: '#00708A', margin: [0, 12, 0, 5] }); content.push(...docMarkdownParaPdf(s.conteudo)); });
      const MR = d.matriz_responsabilidades || [];
      if (MR.length) content.push({ text: 'Matriz de responsabilidades', fontSize: 13, bold: true, color: '#00708A', margin: [0, 12, 0, 5] }, { table: { headerRows: 1, widths: ['*', 70, 70], body: [[{ text: 'Atividade', bold: true, color: '#fff', fillColor: '#00708A' }, { text: 'Atlantyx', bold: true, color: '#fff', fillColor: '#00708A', alignment: 'center' }, { text: 'Cliente', bold: true, color: '#fff', fillColor: '#00708A', alignment: 'center' }], ...MR.map(m => [m.atividade, { text: m.atlantyx || '—', alignment: 'center', bold: true }, { text: m.cliente || '—', alignment: 'center', bold: true }])] }, layout: 'lightHorizontalLines' }, { text: 'R = executa · A = aprova · C = consultado · I = informado', fontSize: 8, color: '#6B7280', margin: [0, 3, 0, 0] });
      if ((d.tabela_investimento || []).length) content.push({ margin: [0, 12, 0, 0], table: { headerRows: 1, widths: ['*', 'auto'], body: [[{ text: 'Investimento', bold: true, color: '#fff', fillColor: '#0F172A' }, { text: 'Valor', bold: true, color: '#fff', fillColor: '#0F172A' }], ...d.tabela_investimento.map(t => [t.item, { text: t.valor, alignment: 'right' }])] }, layout: 'lightHorizontalLines' });
      content.push({ text: `Validade da proposta: ${d.validade_dias || 30} dias. Valores com tributos inclusos conforme a legislação vigente na data de emissão de cada nota fiscal.`, fontSize: 8.5, color: '#777', margin: [0, 14, 0, 0] });
      const def = f => ({ content, defaultStyle: { font: f, fontSize: 10, lineHeight: 1.3, color: '#1f2937' }, pageMargins: [48, 48, 48, 56],
        footer: (p, t) => ({ columns: [{ text: 'Atlantyx · atlantyx.io', fontSize: 8, color: '#999', margin: [48, 0, 0, 0] }, { text: `${p}/${t}`, alignment: 'right', fontSize: 8, color: '#999', margin: [0, 0, 48, 0] }] }) });
      const nome = `${PROP.dados.tipo_documento === 'poc' ? 'POC' : 'Proposta'}_${(PROP.cliente || 'cliente').replace(/[^\w]+/g, '_')}_${PROP.numero || 'rascunho'}.pdf`;
      try { await new Promise((ok, err) => { try { pdfMake.createPdf(def('Montserrat'), null, fontes).getBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; a.click(); ok(); }); } catch (e) { err(e); } setTimeout(() => err(new Error('tempo')), 15000); }); }
      catch (_) { pdfMake.createPdf(def('Roboto')).download(nome); }
    } catch (e) { nota('PDF: ' + e.message, 'error'); }
  }
  async function baixarWord() {
    lerForm(); lerDoc(); if (!PROP.documento && !(await _garantirDoc())) return; const d = PROP.documento;
    const md = t => esc(t).split('\n').map(l => l.trim().startsWith('- ') ? `<li>${l.trim().substring(2)}</li>` : `<p>${l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`).join('').replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`);
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:Montserrat,Calibri,Arial;font-size:10.5pt;color:#1f2937}h1{color:#0F172A}h2{color:#00708A;font-size:13pt;margin-top:16pt}td{border-bottom:1px solid #ddd;padding:4px 8px}</style></head><body>
      <img src="${location.origin}/logo-atlantyx-escuro.png" width="180" alt="Atlantyx"/><div style="border-top:3px solid #00C4CC;margin:6px 0 10px;"></div><h1>${esc(d.titulo || PROP.titulo)}</h1><p style="color:#555">${esc(PROP.cliente)}${PROP.contato ? ' · ' + esc(PROP.contato) : ''} · ${esc(PROP.numero || 'rascunho')} · ${new Date().toLocaleDateString('pt-BR')}</p>
      ${(d.secoes || []).map(s => `<h2>${esc(s.titulo)}</h2>${md(s.conteudo)}`).join('')}
      ${(d.matriz_responsabilidades || []).length ? `<h2>Matriz de responsabilidades</h2><table><tr><th style="background:#00708A;color:#fff;text-align:left">Atividade</th><th style="background:#00708A;color:#fff">Atlantyx</th><th style="background:#00708A;color:#fff">Cliente</th></tr>${d.matriz_responsabilidades.map(m => `<tr><td>${esc(m.atividade)}</td><td style="text-align:center"><b>${esc(m.atlantyx || '—')}</b></td><td style="text-align:center"><b>${esc(m.cliente || '—')}</b></td></tr>`).join('')}</table><p style="color:#777;font-size:8pt">R = executa · A = aprova · C = consultado · I = informado</p>` : ''}
      ${(d.tabela_investimento || []).length ? `<h2>Investimento</h2><table>${d.tabela_investimento.map(t => `<tr><td>${esc(t.item)}</td><td style="text-align:right">${esc(t.valor)}</td></tr>`).join('')}</table>` : ''}<p style="color:#777;font-size:9pt">Validade: ${d.validade_dias || 30} dias.</p></body></html>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' })); a.download = `Proposta_${(PROP.cliente || 'cliente').replace(/\W+/g, '_')}_${PROP.numero || 'rascunho'}.doc`; document.body.appendChild(a); a.click(); a.remove();
  }
  async function mudarStatus(id, status) {
    id = id || PROP?.id; if (!id) return nota('Salve a proposta primeiro', 'error');
    let motivo = null; if (['ganha', 'perdida'].includes(status)) { motivo = prompt(status === 'ganha' ? 'O que fez a proposta ser ganha? (preço, formato, prazo, relacionamento...)' : 'Por que foi perdida? (preço, concorrente, timing, escopo...)'); if (!motivo) return; }
    try { await api('prop_status', { id, status, motivo }); nota('Status: ' + STATUS[status]); funilCarregar(); if ($('vdProp').dataset.aba === 'lista') listar(); if (status === 'ganha' && confirm('Proposta ganha! Criar o projeto e os marcos de faturamento no financeiro agora?')) converter(id); }
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
  async function excluir(id) { if (!confirm('Excluir esta proposta?')) return; await api('prop_excluir', { id }); listar(); funilCarregar(); }

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
    carregarBase(); carregarPadrao(); _upMostrar();
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
  // v3.371 · a Vercel recusa envios acima de ~4,5 MB (base64 de ~3,3 MB). Arquivos grandes: o texto é extraído no navegador
  // (PDF com pdf.js, Word/Excel abrindo o ZIP) e só o texto vai para o servidor — capítulos, tom e preço continuam aprendíveis.
  const _LIM = 3 * 1024 * 1024;
  const _scr = {}; const _carregar = (u, g) => window[g] ? Promise.resolve(window[g]) : (_scr[u] = _scr[u] || new Promise((ok, err) => { const s = document.createElement('script'); s.src = u; s.onload = () => window[g] ? ok(window[g]) : err(new Error('biblioteca não carregou')); s.onerror = () => { delete _scr[u]; err(new Error('sem acesso a ' + new URL(u).host)); }; document.head.appendChild(s); }));
  async function _textoNoNavegador(f) {
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === 'pdf') { const lib = await _carregar('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
      lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; const out = [];
      for (let i = 1; i <= Math.min(doc.numPages, 80); i++) { const pg = await doc.getPage(i); const tc = await pg.getTextContent(); let y = null, l = '';
        tc.items.forEach(it => { const yy = Math.round(it.transform[5]); if (y !== null && Math.abs(yy - y) > 3) { out.push(l); l = ''; } l += it.str + (it.hasEOL ? '' : ''); y = yy; }); out.push(l, `--- fim da página ${i} ---`); }
      return out.join('\n').replace(/\n{3,}/g, '\n\n'); }
    if (ext === 'docx' || ext === 'xlsx') { const JSZip = await _carregar('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip'); const z = await JSZip.loadAsync(await f.arrayBuffer());
      const xml2t = x => x.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<\/(si|row)>/g, '\n').replace(/<\/c>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      if (ext === 'docx') { const x = await z.file('word/document.xml')?.async('string'); if (!x) throw new Error('Word sem conteúdo de texto'); return xml2t(x); }
      const ss = await z.file('xl/sharedStrings.xml')?.async('string'); return xml2t(ss || ''); }
    throw new Error('arquivo acima de 3 MB — salve como PDF ou Word menor');
  }
  async function _payloadArquivo(f) {
    if (f.size <= _LIM) return { nome: f.name, base64: await lerB64(f), via: 'arquivo' };
    const t = (await _textoNoNavegador(f)).trim(); if (t.length < 200) throw new Error('arquivo grande e sem texto legível (PDF escaneado?) — envie uma versão menor ou em Word');
    const b64 = btoa(unescape(encodeURIComponent(t.substring(0, 200000))));
    return { nome: f.name + '.txt', base64: b64, via: `texto extraído no navegador (${Math.round(f.size / 1048576)} MB)` };
  }
  let _UP = null; // estado do envio em andamento/último resultado — sobrevive à troca de aba
  const _upMostrar = () => { const m = $('vdAprMsg'); if (m && _UP) m.innerHTML = _UP.html; };
  async function _aprenderArquivos(fs, resultado, observacao, progresso0) {
    if (_UP && _UP.rodando) { nota('Já tem um envio em andamento — aguarde terminar', 'error'); return { res: [], ok: 0, cons: '' }; }
    _UP = { rodando: true, html: '' }; const progresso = t => { _UP.html = `<span style="color:var(--blue);">⏳ ${esc(t)} (pode trocar de aba, o envio continua)</span>`; _upMostrar(); try { progresso0(t); } catch (_) {} };
    const res = [];
    for (const [k, f] of fs.entries()) { progresso(`Lendo ${f.name} (${k + 1}/${fs.length})...`);
      try { if (f.size > 40 * 1024 * 1024) throw new Error('acima de 40 MB'); const p = await _payloadArquivo(f);
        await api('aprender', { nome: p.nome, base64: p.base64, resultado, observacao }, 115000); res.push({ nome: f.name, ok: true, via: p.via }); }
      catch (e) { res.push({ nome: f.name, ok: false, erro: e.message }); } }
    const ok = res.filter(x => x.ok).length; let cons = '';
    if (ok) { progresso(`${ok} de ${fs.length} aprendido(s). Consolidando o padrão (até 1 min)...`); try { await api('padrao_regerar', {}, 115000); cons = 'Padrão consolidado.'; } catch (e) { cons = 'Aprendi, mas não consolidei o padrão: ' + e.message; } }
    const out = { res, ok, cons }; _UP = { rodando: false, html: _resHtml(out, fs.length) }; _upMostrar(); if (ok) { carregarBase(); carregarPadrao(); } _st = null;
    return out;
  }
  const _resHtml = (r, total) => `<div style="font-size:10.5px;line-height:1.6;"><b style="color:${r.ok ? 'var(--green)' : 'var(--red)'};">${r.ok} de ${total} documento(s) aprendido(s).</b> ${esc(r.cons)}`
    + r.res.map(x => `<div>${x.ok ? '✅' : '❌'} ${esc(x.nome)}${x.ok ? (x.via !== 'arquivo' ? ` <span style="color:var(--t3);">— ${esc(x.via)}</span>` : '') : ` — <span style="color:var(--red);">${esc(x.erro)}</span>`}</div>`).join('') + '</div>';
  async function aprender() {
    const fs = [...($('vdArqs').files || [])]; if (!fs.length) return nota('Escolha os arquivos', 'error');
    const fim = ocupado($('vdBtnAprender'), '📥 Aprendendo...'); const msg = $('vdAprMsg');
    const r = await _aprenderArquivos(fs, $('vdArqRes').value, $('vdArqObs').value, () => {});
    fim(); if (r.ok) { if ($('vdArqs')) $('vdArqs').value = ''; try { RC = (await api('rate_card')).rate_card; } catch (_) {} }
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
        <div style="font-size:11px;font-weight:700;margin:12px 0 6px;">Impostos por ano de emissão da nota · inflação · POC · concorrência</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${campo('vpp_i26', 'Impostos 2026 (%)', (p.impostos_por_ano || {})['2026'], 'Lucro Presumido: PIS 0,65 + Cofins 3 + ISS 5 + IRPJ 4,8 + CSLL 2,88')}${campo('vpp_i27', 'Impostos 2027 (%)', (p.impostos_por_ano || {})['2027'], 'CBS+IBS 11,3% (TCU, a confirmar pelo Senado até 15/12) + ISS 5 + IRPJ 4,8 + CSLL 2,88')}${campo('vpp_cred', 'Créditos de CBS a partir de 2027 (pontos %)', p.creditos_cbs_pct, 'CBS paga em nuvem, software, equipamentos, aluguel e PJ abate a devida — estime com o contador')}
          ${campo('vpp_infl', 'Inflação projetada (IPCA %/ano)', p.inflacao_anual_pct, 'Focus: IPCA 2027 4,34%')}${campo('vpp_diss', 'Dissídio acima da inflação (%)', p.dissidio_extra_pct)}
          ${campo('vpp_mpoc', 'Margem da POC (%)', p.margem_poc_pct, 'POC é porta de entrada: margem menor')}${campo('vpp_cpoc', 'Crédito da POC no contrato (dias)', p.poc_credito_dias)}${campo('vpp_psem', 'POC: semanas padrão', p.poc_semanas_padrao)}${campo('vpp_pcli', 'POC para cliente: % do preço (0 = sem custo)', p.poc_cliente_pct)}${campo('vpp_dcli', 'Desconto especial de cliente (%)', p.desconto_cliente_pct)}${campo('vpp_dcd', '… se fechar em (dias)', p.desconto_cliente_dias)}
          ${campo('vpp_tol', 'Tolerância acima do concorrente (%)', p.tolerancia_concorrente_pct, 'Acima disso, sugere desconto')}${campo('vpp_prem', 'Prêmio aceito sobre o concorrente (%)', p.premio_qualidade_pct, 'Desconto sugerido leva o preço até concorrente + este prêmio, nunca abaixo do piso')}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:6px;line-height:1.5;">${esc(CFG?.impostos_fonte || '')}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:8px;">Impostos: ${esc(CFG?.imposto_origem || '')}. As metas (anual/mensal) vêm do Dashboard; a receita realizada, do QuickBooks; o pipeline, do HubSpot.</div></div></div>
      <div class="panel"><div class="ph"><div class="pt">📦 Catálogo de escopos de produto</div><div style="display:flex;gap:6px;"><button class="btn btn-g" style="font-size:10px;" onclick="VD.escNovo()">+ produto</button><button class="btn btn-p" style="font-size:10px;" onclick="VD.escSalvar()">💾 Salvar catálogo</button></div></div>
        <div class="pb"><div style="font-size:10px;color:var(--t3);margin-bottom:8px;">O escopo padrão de cada produto. Na proposta, "Escopo de um produto" adapta este texto ao cliente (e à POC) e você edita antes de gerar.</div><div id="vdEscLista"></div></div></div>`;
    renderRC(); try { _rcSalvo = JSON.stringify(lerRC().filter(x => String(x.perfil || '').trim())); } catch (_) {} ESC = (CFG && CFG.escopos) || []; escRender();
  }
  function renderRC() { $('vdRC').innerHTML = RC.map((x, i) => `<tr>${['perfil', 'senioridade', 'custo_hora', 'preco_piso', 'preco_alvo', 'preco_teto'].map(k => `<td><input class="fi" data-k="${k}" value="${esc(x[k] ?? '')}"/></td>`).join('')}<td style="font-size:9.5px;color:var(--t3);">${esc(x.fonte || x.custo_fonte || '')}${x.preco_observado ? '<br>praticado: R$ ' + x.preco_observado : ''}</td><td><a href="javascript:void(0)" onclick="this.closest('tr').remove()" style="color:var(--red);">✕</a></td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--t3);padding:14px;">Rate card vazio — importe sua planilha ou clique em Sugerir.</td></tr>'; }
  function lerRC() { return [...document.querySelectorAll('#vdRC tr')].map(tr => { const o = {}; tr.querySelectorAll('[data-k]').forEach(e => o[e.dataset.k] = e.value.trim()); return o; }).filter(x => x.perfil); }
  function rateLinha() { RC = lerRC(); RC.push({ perfil: '', fonte: 'manual' }); renderRC(); }
  async function rateSalvar() { try { RC = (await api('rate_card_salvar', { rate_card: lerRC() })).rate_card; _rcSalvo = JSON.stringify(RC); renderRC(); nota('Rate card salvo'); } catch (e) { nota('Erro: ' + e.message, 'error'); } }
  async function rateSugerir() { const fim = ocupado($('vdBtnSug'), '🔎 Buscando...'); try { const d = await api('rate_card_sugerir'); RC = d.sugestao; renderRC(); if (d.fontes.mercado_ia) nota(`${d.fontes.mercado_ia} perfil(is) com custo de mercado estimado pela IA (o RH não tem custo/hora e não há propostas aprendidas) — revise os valores e clique em 💾 Salvar rate card`); else if (!d.fontes.cargos_rh && !d.fontes.perfis_observados) nota('Nada para sugerir: o RH não tem custo/hora por cargo, nenhuma proposta com rate card foi aprendida e a IA não respondeu' + (d.fontes.aviso ? ' (' + d.fontes.aviso + ')' : '') + '. Cadastre os perfis com + perfil ou importe uma planilha.', 'error'); else nota(`Sugestão: ${d.fontes.cargos_rh} cargo(s) do RH, ${d.fontes.perfis_observados} perfil(is) de propostas — revise e salve`); } catch (e) { nota('Erro: ' + e.message, 'error'); } fim(); }
  async function rateImportar(inp) { const f = inp.files[0]; if (!f) return; nota('Lendo o rate card...'); try { const d = await api('rate_card_importar', { nome: f.name, base64: await lerB64(f) }); RC = d.rate_card; renderRC(); nota(`${d.importados} perfil(is) importado(s) e salvos`); } catch (e) { nota('Erro: ' + e.message, 'error'); } inp.value = ''; }
  async function paramsSalvar() {
    const g = id => { const v = $(id).value; return v === '' ? undefined : +String(v).replace(',', '.'); };
    const params = { impostos_pct: g('vpp_imp'), overhead_pct: g('vpp_ovh'), margem_min_pct: g('vpp_mmin'), margem_alvo_pct: g('vpp_malvo'), desconto_recorrente_pct: g('vpp_desc'), contingencia: { baixo: g('vpp_cb'), medio: g('vpp_cm'), alto: g('vpp_ca') }, prazo_recebimento_dias: g('vpp_rec'), meta_recorrente_pct: g('vpp_mrec'), setup_pct: g('vpp_setup') };
    Object.assign(params, { impostos_por_ano: { '2026': g('vpp_i26'), '2027': g('vpp_i27') }, creditos_cbs_pct: g('vpp_cred'), inflacao_anual_pct: g('vpp_infl'), dissidio_extra_pct: g('vpp_diss'), margem_poc_pct: g('vpp_mpoc'), poc_credito_dias: g('vpp_cpoc'), poc_semanas_padrao: g('vpp_psem'), poc_cliente_pct: g('vpp_pcli'), desconto_cliente_pct: g('vpp_dcli'), desconto_cliente_dias: g('vpp_dcd'), tolerancia_concorrente_pct: g('vpp_tol'), premio_qualidade_pct: g('vpp_prem') }); // v3.365
    Object.keys(params.impostos_por_ano).forEach(k => params.impostos_por_ano[k] == null && delete params.impostos_por_ano[k]);
    if (params.margem_min_pct > params.margem_alvo_pct) return nota('A margem mínima não pode ser maior que a alvo', 'error');
    try { CFG = await api('prop_config_salvar', { params }); nota('Parâmetros salvos'); } catch (e) { nota('Erro: ' + e.message, 'error'); }
  }


  // ═══════════════════ v3.282 · NOVA OPORTUNIDADE POR VOZ → HUBSPOT ═══════════════════
  const VZ = { rec: null, ouvindo: false, base: '', plp: null, ext: null };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function vozFechar() { const tx = ($('vzTexto')?.value || '').trim(), criado = $('vzBtnCriar')?.style.display === 'none';
    if (tx && !criado && !confirm('Fechar sem criar a oportunidade? O texto gravado será perdido.')) return; vozParar(); $('vdVozModal')?.remove(); }
  async function vozAbrir() {
    $('vdVozModal')?.remove(); VZ.ext = null;
    const m = document.createElement('div'); m.id = 'vdVozModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto;';
    // v3.284: clicar fora NÃO fecha (perdia o que foi gravado); fecha só no ✕
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:12px;width:min(820px,100%);">
      <div style="padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;gap:10px;align-items:center;"><div style="flex:1;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">🎙 Nova oportunidade por voz</div>
        <div style="font-size:10.5px;color:var(--t2);">Fale como contaria a um colega: empresa, quem é o contato (cargo, e-mail, telefone), o que precisam, valor e quando fecha. A IA organiza e você confere antes de ir para o HubSpot.</div></div>
        <button class="btn btn-g" onclick="VD.vozFechar()">✕</button></div>
      <div style="padding:14px 16px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
          <button class="btn btn-p" id="vzBtnRec" onclick="VD.vozGravar()" ${SR ? '' : 'disabled'}>🎙 Gravar</button>
          <span id="vzStatus" style="font-size:11px;color:var(--t2);">${SR ? 'Clique em Gravar e fale. Pode parar e continuar.' : 'Este navegador não transcreve voz — use o Chrome/Edge, ou o microfone do teclado do celular para ditar no campo abaixo.'}</span></div>
        <textarea class="fta" id="vzTexto" style="min-height:120px;" placeholder="Ex.: Conversei hoje com a Maria Souza, diretora de TI da Empresa Exemplo, e-mail maria@exemplo.com.br, telefone 21 99999-0000. Eles querem um painel de indicadores de manutenção integrado ao SAP, orçamento em torno de 180 mil, querem fechar até dezembro. Próximo passo: reunião técnica na semana que vem."></textarea>
        <button class="btn btn-or" id="vzBtnIA" onclick="VD.vozExtrair()" style="width:100%;justify-content:center;margin-top:8px;">🤖 Organizar com IA</button>
        <div id="vzForm" style="margin-top:12px;"></div></div></div>`;
    document.body.appendChild(m);
    if (!VZ.plp) api('oport_voz_inicio', {}, 30000).then(d => { VZ.plp = d; if (!d.hubspot) $('vzStatus').innerHTML = '<span style="color:var(--red);">HubSpot não configurado (HUBSPOT_TOKEN no Vercel) — dá para organizar, mas não para gravar no CRM.</span>'; }).catch(() => {});
  }
  // v3.283: no Chrome do Android o reconhecimento contínuo devolve cada trecho ACUMULADO ("falei", "falei com", "falei com a"…)
  // e o texto saía repetido. Agora: no Android, uma frase por vez (continuous=false, reinicia sozinho); em qualquer aparelho,
  // um trecho que repete o anterior SUBSTITUI em vez de somar. Erro "network" (serviço de voz do Google) tenta de novo 3x.
  const ANDROID = /android/i.test(navigator.userAgent);
  const juntar = (a, b) => { a = (a || '').trim(); b = (b || '').trim(); if (!a) return b; if (!b) return a; const la = a.toLowerCase(), lb = b.toLowerCase();
    if (lb.startsWith(la)) return b; if (la.endsWith(lb) || (lb.length > 12 && la.includes(lb))) return a;
    for (let k = Math.min(la.length, lb.length); k > 8; k--) if (la.endsWith(lb.substring(0, k))) return a + b.substring(k); return a + ' ' + b; };
  function vozGravar() {
    if (VZ.ouvindo) return vozParar();
    VZ.base = $('vzTexto').value.trim(); VZ.sessao = ''; VZ.falhas = 0; VZ.ouvindo = true;
    const iniciar = () => {
      const rec = new SR(); rec.lang = 'pt-BR'; rec.continuous = !ANDROID; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = ev => { let tmp = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) { const t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) { VZ.sessao = juntar(VZ.sessao, t); tmp = ''; } else tmp = t; }
        VZ.falhas = 0; $('vzTexto').value = juntar(VZ.base, juntar(VZ.sessao, tmp)); };
      rec.onerror = e => { if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'network' && ++VZ.falhas <= 3) { $('vzStatus').innerHTML = '<span style="color:var(--gold);">Conexão com o reconhecimento de voz oscilou — tentando de novo…</span>'; return; }
        VZ.ouvindo = false; $('vzStatus').innerHTML = '<span style="color:var(--red);">Microfone: ' + esc(e.error === 'not-allowed' ? 'permissão negada — libere o microfone no navegador' : e.error === 'network' ? 'sem conexão com o serviço de voz — use o microfone do teclado para ditar no campo' : e.error) + '</span>'; vozParar(true); };
      rec.onend = () => { if (!VZ.ouvindo) return; VZ.base = $('vzTexto').value.trim(); VZ.sessao = ''; setTimeout(() => { if (VZ.ouvindo) try { iniciar(); } catch (_) { vozParar(); } }, VZ.falhas ? 800 : 150); };
      try { rec.start(); VZ.rec = rec; } catch (e) { VZ.ouvindo = false; nota('Não consegui abrir o microfone: ' + e.message, 'error'); vozParar(true); }
    };
    iniciar(); if (!VZ.ouvindo) return;
    $('vzBtnRec').innerHTML = '⏹ Parar'; $('vzBtnRec').classList.add('btn-or'); $('vzStatus').innerHTML = '<span style="color:var(--red);">● Gravando… fale normalmente</span>';
  }
  function vozParar(manterAviso) { VZ.ouvindo = false; try { VZ.rec?.stop(); } catch (_) {} VZ.rec = null; const b = $('vzBtnRec'); if (b) { b.innerHTML = '🎙 Gravar'; b.classList.remove('btn-or'); } const s = $('vzStatus'); if (s && SR && !manterAviso) s.textContent = 'Gravação parada — revise o texto e clique em Organizar com IA.'; }
  async function vozExtrair() {
    vozParar(); const texto = $('vzTexto').value.trim(); if (texto.length < 15) return nota('Fale ou escreva um pouco mais sobre a oportunidade', 'error');
    const fim = ocupado($('vzBtnIA'), '🤖 Organizando…');
    try { const d = await api('oport_voz_extrair', { texto }, 70000); if (!VZ.plp) { try { VZ.plp = await api('oport_voz_inicio', {}, 30000); } catch (_) {} } VZ.ext = d; vozForm(); }
    catch (e) { nota('Erro: ' + e.message, 'error'); } fim();
  }
  function vozForm() {
    const d = VZ.ext, X = d.extraido || {}, E = X.empresa || {}, C = X.contato || {}, N = X.negocio || {}, ex = d.existentes || {}, pls = VZ.plp?.pipelines || [];
    const inp = (id, rot, v, t) => `<div class="fg" style="margin:0;"><label class="fl">${rot}</label><input class="fi" id="${id}" ${t ? 'type="' + t + '"' : ''} value="${esc(v ?? '')}"/></div>`;
    const opEmp = ex.empresas?.length ? `<div style="font-size:10.5px;margin:4px 0 6px;">${ex.empresas.map((c, i) => `<label style="display:block;"><input type="radio" name="vzEmp" value="${esc(c.id)}" ${i === 0 && c.exato ? 'checked' : ''}/> usar a que já existe: <b>${esc(c.nome)}</b>${c.dominio ? ' · ' + esc(c.dominio) : ''}</label>`).join('')}<label style="display:block;"><input type="radio" name="vzEmp" value="" ${ex.empresas[0]?.exato ? '' : 'checked'}/> criar empresa nova</label></div>` : '';
    const opCon = ex.contatos?.length ? `<div style="font-size:10.5px;margin:4px 0 6px;">${ex.contatos.map((c, i) => `<label style="display:block;"><input type="radio" name="vzCon" value="${esc(c.id)}" ${i === 0 ? 'checked' : ''}/> usar o que já existe: <b>${esc(c.nome || c.email)}</b>${c.email ? ' · ' + esc(c.email) : ''}${c.empresa ? ' · ' + esc(c.empresa) : ''}</label>`).join('')}<label style="display:block;"><input type="radio" name="vzCon" value=""/> criar contato novo</label></div>` : '';
    const plOpts = pls.map(p => `<option value="${esc(p.id)}" ${p.id === d.pipeline ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
    $('vzForm').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
      <div class="panel" style="margin:0;"><div class="ph"><div class="pt">🏢 Empresa</div></div><div class="pb" style="display:grid;gap:6px;">${opEmp}${inp('vzEN', 'Nome', E.nome)}${inp('vzED', 'Site / domínio', E.dominio)}${inp('vzEC', 'Cidade', E.cidade)}</div></div>
      <div class="panel" style="margin:0;"><div class="ph"><div class="pt">👤 Contato</div></div><div class="pb" style="display:grid;gap:6px;">${opCon}${inp('vzCN', 'Nome', C.nome)}${inp('vzCC', 'Cargo', C.cargo)}${inp('vzCE', 'E-mail', C.email)}${inp('vzCT', 'Telefone', C.telefone)}</div></div></div>
      <div class="panel" style="margin:12px 0 0;"><div class="ph"><div class="pt">💼 Negócio</div></div><div class="pb" style="display:grid;gap:6px;">
        ${inp('vzNT', 'Título', N.titulo)}<div class="fg" style="margin:0;"><label class="fl">Descrição</label><textarea class="fta" id="vzND" style="min-height:60px;">${esc(N.descricao || '')}</textarea></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">${inp('vzNV', 'Valor (R$)', N.valor || '')}${inp('vzNF', 'Previsão de fechamento', N.data_fechamento || '', 'date')}
          <div class="fg" style="margin:0;"><label class="fl">Funil (pipeline)</label><select class="fsel" id="vzPl" onchange="VD.vozEtapas()">${plOpts || '<option value="">HubSpot indisponível</option>'}</select></div>
          <div class="fg" style="margin:0;"><label class="fl">Etapa</label><select class="fsel" id="vzEt"></select></div></div>
        ${(X.proximos_passos || []).length ? `<div style="font-size:11px;"><b>Próximos passos</b> (vão como nota no negócio):<br>${X.proximos_passos.map(x => '• ' + esc(x)).join('<br>')}</div>` : ''}
        ${(X.faltando || []).length ? `<div style="font-size:10.5px;color:var(--gold);">⚠ Não foi dito: ${esc(X.faltando.join(' · '))} — complete acima se souber.</div>` : ''}</div></div>
      <button class="btn btn-gn" id="vzBtnCriar" onclick="VD.vozCriar()" style="width:100%;justify-content:center;margin-top:12px;font-weight:700;" ${pls.length ? '' : 'disabled'}>✅ Criar no HubSpot</button><div id="vzRes" style="margin-top:8px;font-size:11.5px;"></div>`;
    vozEtapas(d.etapa);
  }
  function vozEtapas(sel) { const p = (VZ.plp?.pipelines || []).find(x => x.id === $('vzPl')?.value); const s = $('vzEt'); if (!s) return;
    s.innerHTML = (p?.etapas || []).map(e => `<option value="${esc(e.id)}" ${e.id === sel ? 'selected' : ''}>${esc(e.nome)}${e.probabilidade != null ? ' (' + Math.round(e.probabilidade * 100) + '%)' : ''}</option>`).join(''); }
  async function vozCriar() {
    const v = id => ($(id)?.value || '').trim(), radio = n => document.querySelector(`input[name="${n}"]:checked`)?.value || null;
    const valor = Number(v('vzNV').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;
    const corpo = { empresa_id: radio('vzEmp'), contato_id: radio('vzCon'), empresa: { nome: v('vzEN'), dominio: v('vzED'), cidade: v('vzEC') }, contato: { nome: v('vzCN'), cargo: v('vzCC'), email: v('vzCE'), telefone: v('vzCT') },
      negocio: { titulo: v('vzNT'), descricao: v('vzND'), valor, data_fechamento: v('vzNF') }, pipeline: v('vzPl'), etapa: v('vzEt'), proximos_passos: VZ.ext?.extraido?.proximos_passos || [], texto: v('vzTexto') };
    if (!corpo.empresa_id && !corpo.empresa.nome) return nota('Informe a empresa', 'error');
    if (!corpo.negocio.titulo) return nota('Informe o título do negócio', 'error');
    const fim = ocupado($('vzBtnCriar'), '⏳ Criando no HubSpot…');
    try { const r = await api('oport_voz_criar', corpo, 60000);
      $('vzRes').innerHTML = `<div style="background:rgba(34,211,163,.1);border:1px solid var(--green);border-radius:8px;padding:10px 12px;line-height:1.7;">✅ Negócio criado no HubSpot${r.link ? ` — <a href="${esc(r.link)}" target="_blank" rel="noopener" style="color:var(--blue);">abrir no HubSpot ↗</a>` : ''}<br>
        Empresa ${r.empresa?.criada ? '<b>criada</b>' : 'reaproveitada'} · contato ${r.contato ? (r.contato.criado ? '<b>criado</b>' : 'reaproveitado') : 'não informado'} · relato salvo como nota${(r.avisos || []).length ? '<br><span style="color:var(--gold);">⚠ ' + esc(r.avisos.join(' · ')) + '</span>' : ''}</div>`;
      $('vzBtnCriar').style.display = 'none'; nota('Oportunidade criada no HubSpot');
      try { window._fn && (window._fn.dados = null); } catch (_) {}
    } catch (e) { nota('Erro: ' + e.message, 'error'); $('vzRes').innerHTML = '<span style="color:var(--red);">' + esc(e.message) + '</span>'; } fim();
  }

  window.VD = { painelAbrir, painelCarregar, rfCarregar, rfIr, funilIr, funilPeriodo, funilCarregar, coach, premissasSalvar, estRef, estAbrir, estSalvar, estExcluir, estSugerir,
    propAbrir, aba, nova, estimar, analisar, escolher, redigir, salvar, baixarPdf, baixarWord, mudarStatus, converter, abrirProp, excluir, addPerfil, perfilRC,
    aprender, salvarInstrucoes, regerarPadrao, vozAbrir, vozFechar, vozGravar, vozExtrair, vozEtapas, vozCriar, baseRes, baseExcluir, rateLinha, rateSalvar, rateSugerir, rateImportar, paramsSalvar, tipoDocMudou, aplicarDesconto, escopoUpload, escopoProduto, escNovo, escRemover, escSalvar, complSugerir, complDecidir, complLimpar, complAplicar, gerarApresentacao, escopoBriefing, equipeManual, statusRender, refUpload, chatEnviar, chatAplicar, chatLimpar, cronoGerar, cronoAba, cronoSet, cronoDel, cronoAdd, cronoPag, cronoTotal, cronoNormalizar, mrAdd, clienteChecar };
})();
