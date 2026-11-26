// public/central-ui.js — v3.616 · CENTRAL DE PLANEJAMENTO E ESTRATÉGIA (cockpit)
// Uma tela só com os instrumentos do planejamento (placar de metas, cenários 2027, alertas, aprovações) e o painel de comandos com
// atalhos para TODAS as telas de estratégia, que continuam no menu. Só lê dados que já existem (api/placar.js e api/s1-intel.js).
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const COR = { verde: 'var(--green)', amarelo: 'var(--gold)', vermelho: 'var(--red)', cinza: 'var(--t3)' };
  const S = { placar: null, cen: null, erroPlacar: null, erroCen: null, filtro: '', carregando: false };

  // ── telas: { n: nome, i: ícone, d: descrição curta, p: página do nav, aba: aba da Estratégia IA, pos: função após abrir, novo }
  const bp = a => () => { try { bpTab(a); } catch (_) {} };
  const GRUPOS = [
    { id: 'dir', nome: 'Direção', cor: '#9c6dff', itens: [
      { n: 'ATLAS · Estrategista', i: '🧠', d: 'Converse ou fale com o estrategista IA', p: 's0estrategia', aba: 'atlas' },
      { n: 'Sala do Conselho', i: '🏛️', d: 'Todos os agentes IA deliberam uma pauta', p: 's0estrategia', aba: 'conselho' },
      { n: 'Moat · fosso competitivo', i: '🏰', d: 'O que protege a Atlantyx da concorrência', p: 's0estrategia', aba: 'moat' },
      { n: 'Trilha · sócios e 11 perguntas', i: '🗺️', d: 'Roteiro do planejamento com os sócios', p: 's0estrategia', aba: 'trilha' },
      { n: 'Propósito + metas pessoais', i: '🧭', d: 'O Norte do fundador', p: 's1proposito' },
      { n: 'Cenários (clássico)', i: '🔭', d: 'Tela de cenários anterior', p: 's1cenarios' }] },
    { id: 'diag', nome: 'Diagnóstico', cor: '#22d3a3', itens: [
      { n: 'Dados reais (QB + Drive)', i: '📈', d: 'Números reais do QuickBooks e do Drive', p: 's1dados' },
      { n: 'Diagnóstico · SWOT', i: '◆', d: 'Forças, fraquezas, oportunidades e ameaças', p: 's1intel' },
      { n: 'Finanças · alavancas', i: '↑', d: 'Análise financeira com IA', p: 's1financeiro' },
      { n: 'Mercado · concorrência', i: '★', d: 'Mercado e concorrentes', p: 's1mercado' },
      { n: 'Riscos', i: '⚠', d: 'Riscos do negócio', p: 's1riscos' }] },
    { id: 'alav', nome: 'Alavancas e produtos', cor: '#f5b83d', itens: [
      { n: 'Plano Estratégico · alavancas', i: '▶', d: 'Plano cadastrado, simulação e alavancas', p: 's1plano' },
      { n: 'Cenários 2027', i: '📊', d: 'Gelta, IARA, Maestro, grandes projetos, sustentação e funil isca', p: 's1plano', pos: () => { try { peAba('cen'); } catch (_) {} }, novo: true },
      { n: 'Playbook 2027', i: '🧭', d: 'O Norte de marketing e vendas', p: 's2playbook' },
      { n: 'Pipeline de Ideias', i: '💡', d: 'Ideias em andamento', p: 's1pipeline' },
      { n: 'Analisar Ideia', i: '🔬', d: 'IA analisa uma ideia nova', p: 's1analise' },
      { n: 'Business Plan', i: '📘', d: 'Business plan de ideias', p: 's1bp', pos: bp('ideia') },
      { n: 'Estúdio de Produtos e Esteira', i: '🏭', d: 'Produtos e esteira de oferta', p: 's1estudio' }] },
    { id: 'merc', nome: 'Mercado e marketing', cor: '#38bdf8', itens: [
      { n: 'Análise de Marketing', i: '📣', d: 'Leitura de marketing com IA', p: 's1marketing' },
      { n: 'Campanhas de Marketing', i: '🎯', d: 'Campanhas e orçamento de mídia', p: 's2macro' },
      { n: 'Ações do sistema', i: '⚡', d: 'O que o sistema propõe fazer', p: 's1acoessis' },
      { n: 'Monitor de RFPs', i: '📨', d: 'Oportunidades de RFP e pedidos de clientes', p: 's2rfps' },
      { n: 'Floresta de Vendas', i: '🌳', d: 'Funil de leads', p: 's7floresta' },
      { n: 'Time de Vendas Virtual', i: '🤖', d: 'IARA e vendedores virtuais', p: 's7time' }] },
    { id: 'metas', nome: 'Metas e projeção', cor: '#fb7185', itens: [
      { n: 'Visão e Metas', i: '🎯', d: 'OKRs e metas da empresa', p: 's1metas' },
      { n: 'Placar de Metas', i: '🏁', d: 'Meta × realizado × projeção, com semáforo', p: 's1placar' },
      { n: 'Projeção 5 anos', i: '📈', d: 'Projeção por motor de receita', p: 's1projecao' },
      { n: 'Funil · metas por etapa', i: '🎯', d: 'Funil de vendas do dashboard', p: 'dash', pos: () => { try { dashAba('vendas'); } catch (_) {} } },
      { n: 'Orçamento Anual', i: '📊', d: 'Orçamento do ano', p: 's3orcamento' }] },
    { id: 'exec', nome: 'Execução', cor: '#a3e635', itens: [
      { n: 'Plano de Ação 90 dias', i: '▶', d: 'O que fazer nos próximos 90 dias', p: 's1acoes' },
      { n: 'Calendário · ciclo trimestral', i: '📅', d: 'Ritmo de revisão do planejamento', p: 's0estrategia', aba: 'trilha' },
      { n: 'Inbox de Aprovações', i: '⚠', d: 'Decisões esperando o fundador', p: 's1fundador' },
      { n: 'Relatório Executivo', i: '📄', d: 'Resumo para o fundador e conselho', p: 's1relatorio' }] },
    { id: 'fin', nome: 'Finanças', cor: '#2dd4bf', itens: [
      { n: 'Dashboard Financeiro', i: '📈', d: 'KPIs financeiros', p: 's3dashboard' },
      { n: 'Fluxo Futuro 12 meses', i: '≣', d: 'Caixa projetado', p: 's3fluxo' },
      { n: 'Margem × Caixa', i: '📈', d: 'Margem e caixa por projeto', p: 's3margemcaixa' },
      { n: 'Business Plan Atlantyx', i: '📘', d: 'Business plan dinâmico', p: 's1bp', pos: bp('atlantyx') },
      { n: 'Gerente Financeiro IA', i: '🤖', d: 'Pergunte sobre o caixa', p: 's3gerente' }] }
  ];
  const TODAS = GRUPOS.flatMap(g => g.itens.map(t => ({ ...t, g: g.id, cor: g.cor })));

  // ── formatação
  const nf = (n, d = 0) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const R = v => { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '−' : ''; return s + 'R$ ' + (a >= 1e6 ? nf(a / 1e6, 1) + ' mi' : a >= 1e3 ? nf(a / 1e3, 0) + ' mil' : nf(a)); };
  const fv = (v, un) => v == null ? '—' : /R\$/.test(un || '') ? R(v) : /%/.test(un || '') ? nf(v, 1) + '%' : nf(v, Math.abs(v) < 10 && v % 1 ? 1 : 0) + (un && un.length < 8 ? ' ' + un : '');

  async function api(url, corpo) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({ success: false, error: 'Resposta inválida (HTTP ' + r.status + ')' }));
    if (!r.ok || d.success === false) throw new Error(d.error || 'HTTP ' + r.status); return d;
  }

  function css() {
    if ($('ck-css')) return; const s = document.createElement('style'); s.id = 'ck-css';
    s.textContent = `
    #ckApp{max-width:1400px;margin:0 auto;padding:4px 2px 30px;font-size:12px;color:var(--t1)}
    .ck-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px}
    .ck-ti{flex:1;min-width:240px}.ck-ti b{font-size:17px;letter-spacing:.2px}.ck-ti div{color:var(--t3);font-size:11px;margin-top:2px}
    .ck-hud{display:flex;gap:8px;flex-wrap:wrap}
    .ck-hud div{background:var(--bg2);border:1px solid var(--bd);border-radius:9px;padding:6px 11px;min-width:92px;text-align:center}
    .ck-hud b{display:block;font-size:15px;font-variant-numeric:tabular-nums}.ck-hud span{font-size:9.5px;color:var(--t3)}
    .ck-bezel{background:linear-gradient(180deg,var(--bg2),var(--bg));border:1px solid var(--bd);border-radius:14px;padding:12px 14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 6px 22px rgba(0,0,0,.22)}
    .ck-sec{font-size:10px;letter-spacing:.8px;color:var(--t3);text-transform:uppercase;margin:0 0 8px;display:flex;align-items:center;gap:8px}
    .ck-sec i{flex:1;height:1px;background:var(--bd)}
    .ck-inst{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
    .ck-gw{background:var(--bg);border:1px solid var(--bd);border-radius:12px;padding:8px 6px 9px;text-align:center;cursor:pointer;transition:border-color .15s}
    .ck-gw:hover{border-color:var(--pu)}
    .ck-g{width:100%;max-width:150px;height:auto;display:block;margin:0 auto}
    .ck-gv{font:700 12.5px var(--mono,ui-monospace,monospace);fill:var(--t1)}
    .ck-gl{font-weight:700;font-size:11px;margin-top:2px}.ck-gs{font-size:9.5px;color:var(--t3);min-height:13px;padding:0 4px}
    .ck-mid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:12px;margin-top:12px}
    @media(max-width:900px){.ck-mid{grid-template-columns:1fr}}
    .ck-bar{display:grid;grid-template-columns:185px 1fr 72px;gap:8px;align-items:center;margin:6px 0;font-size:11px}
    .ck-bar .tr{height:11px;background:var(--bg3);border-radius:6px;overflow:hidden}.ck-bar .tr i{display:block;height:100%;border-radius:6px}
    .ck-bar b{text-align:right;font-variant-numeric:tabular-nums}
    .ck-cap{font-size:10px;color:var(--t3);margin-top:6px;line-height:1.45}
    .ck-lamp{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:8px;margin:4px 0;background:var(--bg);border:1px solid var(--bd);cursor:pointer}
    .ck-lamp u{flex:0 0 10px;height:10px;border-radius:50%;margin-top:3px;box-shadow:0 0 8px currentColor}
    .ck-lamp:hover{border-color:var(--pu)}
    .ck-act{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
    .ck-btn{background:var(--bg3);border:1px solid var(--bd2,var(--bd));color:var(--t1);border-radius:9px;padding:7px 12px;font-size:11.5px;cursor:pointer}
    .ck-btn:hover{background:var(--pu);color:#fff;border-color:var(--pu)}.ck-btn.p{background:var(--pu);color:#fff;border-color:var(--pu)}
    .ck-cmd{margin-top:14px}
    .ck-find{width:100%;max-width:340px;background:var(--bg);border:1px solid var(--bd);border-radius:9px;padding:7px 10px;color:var(--t1);font-size:12px}
    .ck-grp{margin-top:12px}.ck-gh{font-weight:700;font-size:11.5px;margin-bottom:6px;display:flex;align-items:center;gap:7px}.ck-gh u{width:9px;height:9px;border-radius:3px}
    .ck-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(188px,1fr));gap:8px}
    .ck-tile{background:var(--bg);border:1px solid var(--bd);border-top:3px solid var(--c);border-radius:10px;padding:8px 10px;cursor:pointer;text-align:left;color:var(--t1);transition:transform .12s,border-color .12s}
    .ck-tile:hover{transform:translateY(-2px);border-color:var(--c)}
    .ck-tile b{display:block;font-size:11.5px}.ck-tile span{display:block;font-size:9.8px;color:var(--t3);margin-top:3px;line-height:1.35}
    .ck-tile em{font-style:normal;font-size:8.5px;background:var(--pu);color:#fff;border-radius:7px;padding:1px 6px;margin-left:5px;vertical-align:middle}
    .ck-vazio{color:var(--t3);font-size:11px;padding:10px 4px}
    .ck-tbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
    .ck-dock{position:fixed;bottom:0;z-index:60;background:var(--bg2);border:1px solid var(--bd);border-bottom:0;border-radius:14px 14px 0 0;box-shadow:0 -8px 28px rgba(0,0,0,.38);padding:8px 12px 10px;box-sizing:border-box}
    @media(max-width:900px){.ck-dock{left:0!important;width:100%!important}}
    .ck-msgs{max-height:40vh;overflow-y:auto;padding:4px 2px;background:var(--bg);border:1px solid var(--bd);border-radius:10px}
    .ck-mu{display:flex;justify-content:flex-end;margin:6px 8px}.ck-mu div{max-width:80%;background:var(--pu);color:#fff;border-radius:10px 10px 2px 10px;padding:7px 11px;font-size:12px;line-height:1.5}
    .ck-ma{display:flex;gap:8px;margin:6px 8px}.ck-ma>div{max-width:88%;background:var(--bg3);border:1px solid var(--bd);border-radius:2px 10px 10px 10px;padding:7px 11px;font-size:12px;line-height:1.55}
    .ck-jor{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:8px}
    .ck-mt{background:var(--bg);border:1px solid var(--bd);border-top:3px solid var(--c,var(--bd));border-radius:10px;padding:8px 10px;cursor:pointer;text-align:left;color:var(--t1);position:relative}
    .ck-mt:hover,.ck-mt.on{border-color:var(--pu)}
    .ck-mt b{display:block;font-size:11.5px}.ck-mt span{display:block;font-size:9.8px;color:var(--t3);margin-top:2px}
    .ck-mt .tr{height:5px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-top:6px}.ck-mt .tr i{display:block;height:100%;background:var(--c,var(--pu))}
    .ck-aqui{position:absolute;top:-9px;right:8px;background:var(--pu);color:#fff;font-size:9px;border-radius:7px;padding:1px 7px;box-shadow:0 0 10px var(--pu)}
    .ck-det{margin-top:10px;background:var(--bg);border:1px solid var(--pu);border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;font-size:11px}
    .ck-det h4{margin:0 0 5px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--t3)}
    .ck-det ul{margin:0;padding-left:15px;line-height:1.5}.ck-det li.ok{color:var(--gn,#3fb950)}
    .ck-pre{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;font-size:10.5px}.ck-pre span{background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:3px 8px}
    `;
    document.head.appendChild(s);
  }

  // ── instrumentos
  function gauge({ pct, cor, centro, rotulo, sub, p }) {
    const f = Math.max(0, Math.min(1, pct == null ? 0 : pct)), L = Math.PI * 46, a = f * Math.PI, nx = 60 - 38 * Math.cos(a), ny = 64 - 38 * Math.sin(a);
    let ticks = ''; for (let k = 0; k <= 10; k++) { const t = k / 10 * Math.PI, x1 = 60 - 53 * Math.cos(t), y1 = 64 - 53 * Math.sin(t), x2 = 60 - 57 * Math.cos(t), y2 = 64 - 57 * Math.sin(t); ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--t3)" stroke-width="${k % 5 ? .8 : 1.6}" opacity=".6"/>`; }
    return `<div class="ck-gw" onclick="CENTRAL.irP('${p}')" title="${esc(rotulo)}"><svg class="ck-g" viewBox="0 0 120 80"><path d="M14 64 A46 46 0 0 1 106 64" fill="none" stroke="var(--bg3)" stroke-width="9" stroke-linecap="round"/><path d="M14 64 A46 46 0 0 1 106 64" fill="none" stroke="${cor}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(f * L).toFixed(1)} ${L.toFixed(1)}"/>${ticks}<line x1="60" y1="64" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--t1)" stroke-width="2.4" stroke-linecap="round"/><circle cx="60" cy="64" r="4" fill="var(--t1)"/><text x="60" y="79" text-anchor="middle" class="ck-gv">${esc(centro)}</text></svg><div class="ck-gl">${esc(rotulo)}</div><div class="ck-gs">${esc(sub || '')}</div></div>`;
  }
  // indicador do placar → ponteiro (quanto da meta já está no lugar)
  function pctInd(x) {
    if (x.real == null) return null; if (x.sentido === 'faixa') return x.cor === 'verde' ? 1 : .5;
    const base = x.projecao != null && x.tipo === 'acumulado' ? x.projecao : x.real; if (!x.meta) return null;
    return x.sentido === 'menor' ? (base > 0 ? x.meta / base : 1) : base / x.meta;
  }
  const DESTAQUES = ['receita_ano', 'margem_liquida', 'recorrente_pct', 'caixa_minimo', 'reunioes_mes', 'capacidade'];

  function instrumentos() {
    const out = []; const P = S.placar;
    if (P) {
      const r = P.resumo || {}, tot = r.total || 0, ver = r.verde || 0;
      out.push({ pct: tot ? ver / tot : 0, cor: r.vermelho ? COR.vermelho : r.amarelo ? COR.amarelo : COR.verde, centro: ver + '/' + tot, rotulo: 'Placar de Metas', sub: (r.vermelho || 0) + ' vermelho · ' + (r.amarelo || 0) + ' atenção', p: 's1placar' });
      const inds = P.indicadores || []; const dest = DESTAQUES.map(id => inds.find(x => x.id === id)).filter(Boolean);
      (dest.length ? dest : inds.slice(0, 4)).slice(0, 4).forEach(x => { const p = pctInd(x); out.push({ pct: p == null ? 0 : Math.min(1, p), cor: COR[x.cor] || COR.cinza, centro: fv(x.projecao != null && x.tipo === 'acumulado' ? x.projecao : x.real, x.unidade), rotulo: x.nome, sub: x.meta != null ? 'meta ' + fv(x.meta, x.unidade) : (x.texto || 'sem meta'), p: 's1placar' }); });
    }
    const dec = parseInt(($('s1DecCnt') || {}).textContent, 10); const ide = parseInt(($('s1PipeCnt') || {}).textContent, 10);
    if (!isNaN(dec)) out.push({ pct: dec ? Math.min(1, dec / 10) : 0, cor: dec ? COR.amarelo : COR.verde, centro: String(dec), rotulo: 'Aprovações pendentes', sub: dec ? 'esperando o fundador' : 'nada pendente', p: 's1fundador' });
    if (!isNaN(ide)) out.push({ pct: Math.min(1, ide / 30), cor: 'var(--pu)', centro: String(ide), rotulo: 'Ideias no pipeline', sub: 'em avaliação', p: 's1pipeline' });
    return out;
  }

  function horizonte() {
    const C = S.cen; if (!C) return `<div class="ck-vazio">${esc(S.erroCen || 'Carregando os cenários…')}</div>`;
    const m = k => (C[k]?.cenarios || [])[1] || {}, F = C.frentes || {}, B = i => (F[i] || [])[1] || {};
    const A = C.atual || {}, rq = S.placar && (S.placar.indicadores || []).find(x => x.id === 'recorrente_pct'), qb = rq && rq.arr_qb != null ? rq.arr_qb : null;
    const base = [A.arr ? ['ARR ATUAL (Xplann + Big Data + alocações · informado)', A.arr, '#e6edf3', 'arr'] : ['ARR ATUAL · informe Xplann, Big Data e alocações', 0, '#e6edf3', 'arr']]; if (qb != null) base.push(['Referência QuickBooks · motor Produtos × 12', qb, '#8b949e', 'qb']);
    const linhas = [['Produto p/ concessionárias (hipótese, ' + (m('gelta').clientes || 0) + ' grupos) · recorrente/ano', m('gelta').arr, '#22d3a3', 'gelta'], ['IARA (hipótese, ' + (m('iara').clientes || 0) + ' clientes) · recorrente/ano', m('iara').arr, '#9c6dff', 'iara'], ['Funil isca → IA (hipótese, ' + Math.round(B('funil').servicos || 0) + ' clientes) · recorrente/ano', B('funil').arrIA, '#f5b83d', 'funil_arr']];
    const res = [['Grandes projetos · contribuição', B('gp').contrib, '#fb7185', 'gp'], ['Sustentação · contribuição', B('sust').contrib, '#2dd4bf', 'sust'], ['Funil isca → IA → projeto · contribuição', B('funil').contrib, '#a3e635', 'funil_contrib']];
    const mx = Math.max(1, ...linhas.map(l => l[1] || 0), ...res.map(l => Math.max(0, l[1] || 0)));
    const bar = l => `<div class="ck-bar" style="cursor:pointer" title="Clique para ver o que compõe este número" onclick="CENTRAL.detalhe('${l[3] || ''}')"><span>${esc(l[0])}</span><div class="tr"><i style="width:${Math.max(2, Math.max(0, l[1] || 0) / mx * 100).toFixed(1)}%;background:${l[2]}"></i></div><b>${R(l[1])}</b></div>`;
    const cp = C.comparativo || {};
    return base.map(bar).join('') + '<div class="ck-act" style="margin:6px 0 2px"><button class="ck-btn p" onclick="CENTRAL.arrEditar()">' + (A.arr ? '✎ Editar o ARR atual' : '✎ Informar o ARR atual') + '</button>' + (A.arr ? '' : '<span class="ck-cap" style="align-self:center">Xplann, Big Data e alocações, em R$ por mês</span>') + '</div>' + '<div class="ck-cap" style="margin:8px 0 2px">Hipóteses de novos produtos (não são receita de hoje)</div>' + linhas.map(bar).join('') + '<div style="height:6px"></div>' + res.map(bar).join('') +
      `<div class="ck-cap">Cenário do meio (B) das hipóteses editáveis. O Jelta é projeto parcelado (não entra em recorrência). Entre Gelta e IARA — maior receita recorrente: <b>${esc(cp.maiorArr || '—')}</b> · maior margem: <b>${esc(cp.maiorMargemRR || '—')}</b> · retorno mais rápido: <b>${esc(cp.retornoMaisRapido || '—')}</b>. O Maestro está fora do plano 2027 e não entra nestas contas.</div>`;
  }


  // ── clique numa barra do Horizonte → mostra o que compõe o número (conta e premissas usadas)
  function composicao(id) {
    const C = S.cen; if (!C) return null; const P = C.entradas || {}, g = (C.gelta.cenarios || [])[1] || {}, i = (C.iara.cenarios || [])[1] || {}, F = C.frentes || {}, gp = (F.gp || [])[1] || {}, su = (F.sust || [])[1] || {}, fu = (F.funil || [])[1] || {}, A = C.atual || {};
    const pc = v => nf((v || 0) * 100, 1) + '%', rq = S.placar && (S.placar.indicadores || []).find(x => x.id === 'recorrente_pct');
    const T = {
      arr: { t: 'ARR atual (informado)', f: '(Xplann + Big Data + alocações) × 12', l: [['Sustentação Xplann / mês', R(A.xplann)], ['Sustentação Big Data / mês', R(A.bigdata)], ['Alocações recorrentes / mês', R(A.alocacoes)], ['Total / mês', R(A.mensal)], ['× 12 = ARR atual', R(A.arr)]], n: A.arr ? 'Valores digitados em Cenários 2027 → Premissas → "ARR atual (real)". O Jelta não entra: é projeto parcelado.' : 'Ainda zerado: informe os três valores mensais em Cenários 2027 → Premissas → "ARR atual (real)".', ir: 'Cenários 2027' },
      qb: { t: 'Referência QuickBooks', f: 'receita do motor Produtos no último mês fechado × 12', l: [['ARR (motor Produtos × 12)', R(rq && rq.arr_qb)], ['Receita dos últimos 12 meses', R(rq && rq.receita_12m)], ['ARR ÷ receita', rq && rq.real != null ? nf(rq.real, 1) + '%' : '—']], n: 'Só vale se cada cliente estiver no motor certo em Financeiro → Custo por Projeto & Piso da Hora. É referência, não substitui o ARR informado.', ir: 'p:s3custohora' },
      gelta: { t: 'Produto para concessionárias (hipótese)', f: 'grupos × receita mensal por grupo (ponderada pela adoção) × 12', l: [['Grupos no cenário B', nf(g.clientes)], ['Lojas por grupo', nf(P['gelta.lojas'])], ['Receita mensal por grupo (módulos × adoção)', R(C.gelta.suite.recPond)], ['ARR = grupos × mensal × 12', R(g.arr)], ['Implantação cobrada / grupo', R((P['gelta.impl_base'] || 0) + (P['gelta.impl_loja'] || 0) * (P['gelta.lojas'] || 0))]].concat((C.gelta.modulos || []).map(m => ['• ' + m.nome + ' (adoção ' + pc(m.adocao) + ')', R(m.rec) + '/mês'])), n: 'Hipótese, não é receita de hoje. O Jelta é projeto parcelado e não entra aqui.', ir: 'Cenários 2027' },
      iara: { t: 'IARA (hipótese)', f: 'clientes × (mensalidade + leads × preço por lead) × 12', l: [['Clientes no cenário B', nf(i.clientes)], ['Mensalidade fixa', R(P['iara.mensal'])], ['Contatos/mês × taxa = leads', nf(P['iara.contatos']) + ' × ' + pc(P['iara.taxa']) + ' = ' + nf(C.iara.cliente.leadsMes, 1)], ['Variável (leads × ' + R(P['iara.preco_lead']) + ')', R(C.iara.cliente.variavel)], ['Receita mensal por cliente', R(C.iara.cliente.rec)], ['ARR = clientes × mensal × 12', R(i.arr)]], n: 'Hipótese: a IARA ainda não vende; as taxas precisam ser medidas.', ir: 'Cenários 2027' },
      funil_arr: { t: 'Funil isca → IA · recorrência (hipótese)', f: 'leads × 12 → reunião → diagnóstico → serviço de IA mensal × 12', l: [['Leads por mês (B)', nf(fu.leads)], ['Reuniões/ano (lead→reunião ' + pc(P['funil.c1']) + ')', nf(fu.reunioes, 1)], ['Diagnósticos (' + pc(P['funil.c2']) + ')', nf(fu.diagnosticos, 1)], ['Serviços de IA (' + pc(P['funil.c3']) + ')', nf(fu.servicos, 1)], ['Mensalidade do serviço', R(P['funil.mensal_ia'])], ['ARR = serviços × mensalidade × 12', R(fu.arrIA)]], n: 'As taxas de conversão são hipóteses; trocar pelas reais do Time de Vendas.', ir: 'Playbook 2027' },
      gp: { t: 'Grandes projetos · contribuição', f: 'receita − imposto − custo da equipe', l: [['Projetos × ticket', nf(gp.projetos) + ' × ' + R(gp.ticket)], ['Receita bruta', R(gp.bruta)], ['Imposto (' + pc(P['comum.imposto']) + ')', '−' + R(gp.impostos)], ['Custo da equipe (' + nf(gp.dias) + ' dias × ' + R(P['comum.custo_dia']) + ')', '−' + R(gp.custo)], ['Contribuição', R(gp.contrib)]], n: 'Preço médio por pessoa-dia: ' + R(P['gp.preco_dia']) + '.', ir: 'Cenários 2027' },
      sust: { t: 'Sustentação · contribuição', f: 'valor entregue × 22% − imposto 29% − custo de entrega', l: [['Valor entregue sustentado', R(su.valor)], ['× ' + pc(P['comum.sust_pct']) + ' = receita anual', R(su.rec)], ['Imposto (' + pc(P['comum.imposto_sust']) + ')', '−' + R(su.impostos)], ['Custo de entrega (' + pc(P['sust.custo_pct']) + ')', '−' + R(su.custo)], ['Contribuição', R(su.contrib)]], n: 'Regra do Fabio: sustentação = 22% do custo do produto + 29% de imposto.', ir: 'Cenários 2027' },
      funil_contrib: { t: 'Funil isca → IA → projeto · contribuição', f: 'diagnósticos + serviço de IA + projetos − imposto − marketing − equipe', l: [['Diagnósticos pagos', R(fu.recD)], ['Serviço de IA no ano', R(fu.recS)], ['Projetos grandes originados', R(fu.recP)], ['Receita bruta', R(fu.bruta)], ['Imposto', '−' + R(fu.impostos)], ['Marketing (' + R(P['funil.mkt_lead']) + ' por lead)', '−' + R(fu.mkt)], ['Equipe', '−' + R(fu.equipe)], ['Contribuição', R(fu.contrib)]], n: 'Hipótese: depende do volume de leads e das conversões.', ir: 'Cenários 2027' }
    }; return T[id] || null;
  }
  function detalhe(id) {
    const d = composicao(id); if (!d) return; fechar();
    const m = document.createElement('div'); m.id = 'ckModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
    m.onclick = e => { if (e.target === m) fechar(); };
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd);border-radius:14px;max-width:560px;width:100%;max-height:86vh;overflow:auto;padding:16px 18px"><div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1"><b style="font-size:14px">${esc(d.t)}</b><div class="ck-cap" style="margin-top:3px">Conta: ${esc(d.f)}</div></div><button class="ck-btn" onclick="CENTRAL.fechar()">✕</button></div>
      <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11.5px">${d.l.map(([k, v]) => `<tr style="border-top:1px solid var(--bd)"><td style="padding:5px 4px">${esc(k)}</td><td style="padding:5px 4px;text-align:right;font-variant-numeric:tabular-nums"><b>${esc(v)}</b></td></tr>`).join('')}</table>
      <div class="ck-cap" style="margin-top:10px">${esc(d.n)}</div><div class="ck-act">${id === 'arr' ? '<button class="ck-btn p" onclick="CENTRAL.arrEditar()">✎ Editar valores</button>' : ''}<button class="ck-btn p" onclick="CENTRAL.fechar();${d.ir.startsWith('p:') ? `CENTRAL.irP('${d.ir.slice(2)}')` : `CENTRAL.irN('${d.ir}')`}">Abrir a tela de origem ›</button></div></div>`;
    document.body.appendChild(m);
  }
  function fechar() { const m = $('ckModal'); if (m) m.remove(); }
  // ARR atual digitado aqui mesmo (os 3 valores mensais); preserva as demais premissas já alteradas em Cenários 2027
  function arrEditar() {
    const A = (S.cen && S.cen.atual) || {}; fechar();
    const m = document.createElement('div'); m.id = 'ckModal'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px';
    m.onclick = e => { if (e.target === m) fechar(); };
    const campo = (id, rot, v) => `<label style="display:block;margin-top:10px;font-size:11.5px">${esc(rot)}<input id="${id}" type="number" min="0" step="100" inputmode="decimal" value="${v ? v : ''}" placeholder="0" style="display:block;width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--bg3);color:var(--t1);font-size:13px"></label>`;
    m.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--bd);border-radius:14px;max-width:460px;width:100%;padding:16px 18px"><div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1"><b style="font-size:14px">ARR atual (valores reais por mês)</b><div class="ck-cap" style="margin-top:3px">ARR = (Xplann + Big Data + alocações) × 12. Não inclua o Jelta (projeto parcelado).</div></div><button class="ck-btn" onclick="CENTRAL.fechar()">✕</button></div>`
      + campo('ckArrX', 'Sustentação Xplann (R$/mês)', A.xplann) + campo('ckArrB', 'Sustentação Big Data (R$/mês)', A.bigdata) + campo('ckArrA', 'Alocações recorrentes (R$/mês)', A.alocacoes)
      + `<div id="ckArrTot" class="ck-cap" style="margin-top:10px"></div><div class="ck-act"><button class="ck-btn p" id="ckArrOk" onclick="CENTRAL.arrSalvar()">Salvar</button><button class="ck-btn" onclick="CENTRAL.fechar()">Cancelar</button></div></div>`;
    document.body.appendChild(m);
    const tot = () => { const v = id => Number($(id).value) || 0, mes = v('ckArrX') + v('ckArrB') + v('ckArrA'); $('ckArrTot').textContent = 'Total por mês ' + R(mes) + ' · ARR (× 12) ' + R(mes * 12); };
    ['ckArrX', 'ckArrB', 'ckArrA'].forEach(id => $(id).addEventListener('input', tot)); tot();
  }
  async function arrSalvar() {
    const btn = $('ckArrOk'); if (btn) btn.disabled = true;
    try {
      const raw = S.cenRaw || { valores: {}, alterados: [] }, v = {};
      (raw.alterados || []).forEach(k => { if (raw.valores[k] != null) v[k] = raw.valores[k]; });
      const n = id => Math.max(0, Number($(id).value) || 0);
      v['atual.xplann'] = n('ckArrX'); v['atual.bigdata'] = n('ckArrB'); v['atual.alocacoes'] = n('ckArrA');
      const d = await api('/api/s1-intel', { action: 'cenarios_salvar', valores: v });
      S.cen = d.resultado; S.cenRaw = { valores: d.valores || {}, alterados: d.alterados || [] };
      fechar(); render(); try { toast('ARR atual salvo', 'success'); } catch (_) {}
    } catch (e) { if (btn) btn.disabled = false; try { toast(e.message, 'error'); } catch (_) {} }
  }

  function luzes() {
    const P = S.placar; if (!P) return `<div class="ck-vazio">${esc(S.erroPlacar || 'Carregando o placar…')}</div>`;
    const ls = []; (P.indicadores || []).filter(x => x.cor === 'vermelho' || x.cor === 'amarelo').sort((a, b) => (a.cor === 'vermelho' ? 0 : 1) - (b.cor === 'vermelho' ? 0 : 1)).slice(0, 7)
      .forEach(x => ls.push({ cor: COR[x.cor], t: x.nome, s: (x.texto || '') + (x.meta != null ? ' · real ' + fv(x.real, x.unidade) + ' × meta ' + fv(x.meta, x.unidade) : ''), p: 's1placar' }));
    (P.pendentes_acao || []).slice(0, 3).forEach(x => ls.push({ cor: COR.vermelho, t: 'Falta ação: ' + x.nome, s: x.motivo, p: 's1placar' }));
    (P.acoes_abertas || []).slice(0, 3).forEach(a => ls.push({ cor: 'var(--pu)', t: 'Ação aberta: ' + (a.indicador_nome || a.indicador), s: (a.o_que_muda || '') + (a.dono ? ' · ' + a.dono : '') + (a.prazo ? ' · até ' + String(a.prazo).split('-').reverse().join('/') : ''), p: 's1placar' }));
    if (!ls.length) return '<div class="ck-vazio">🟢 Nenhum indicador em vermelho ou atenção. Sem alertas ativos.</div>';
    return ls.map(l => `<div class="ck-lamp" onclick="CENTRAL.irP('${l.p}')"><u style="color:${l.cor};background:${l.cor}"></u><div><b>${esc(l.t)}</b><div style="color:var(--t3);font-size:10px">${esc(l.s)}</div></div></div>`).join('');
  }

  // ── Jornada do Planejamento 2027 (6 reuniões) · lê est:jornada (só fundador)
  const JCOR = ['#7c6cf0', '#3b9eff', '#2fbf71', '#f0a030', '#e5594f', '#c06cf0'];
  function jornada() {
    const J = S.jor; if (!J) return `<div class="ck-vazio">${esc(S.erroJor || 'Carregando a jornada…')}</div>`;
    if (!J.reunioes || !J.reunioes.length) return '<div class="ck-vazio">Jornada ainda sem reuniões cadastradas.</div>';
    const prox = J.proxima, sel = S.reuniaoAberta || prox || 1;
    const cards = J.reunioes.map((r, i) => { const est = r.feito ? '✅ feita' + (r.realizada_em ? ' em ' + r.realizada_em.split('-').reverse().join('/') : '') : r.n === prox ? '▶ próxima' : r.bloqueada_por.length ? '🔒 aguarda ' + r.bloqueada_por.join(', ') : 'pendente';
      return `<button class="ck-mt${r.n === sel ? ' on' : ''}" style="--c:${JCOR[i]}" onclick="CENTRAL.reuniao(${r.n})">${r.n === prox ? '<div class="ck-aqui">você está aqui</div>' : ''}<b>${r.n}. ${esc(r.titulo)}</b><span>${esc(r.duracao)} · ${est}</span><div class="tr"><i style="width:${r.feito ? 100 : r.progresso}%"></i></div></button>`; }).join('');
    const r = J.reunioes.find(x => x.n === sel) || J.reunioes[0];
    const lista = a => '<ul>' + a.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
    const det = `<div class="ck-det">
      <div><h4>Reunião ${r.n} · ${esc(r.titulo)}</h4>${r.perguntas.length ? `<div style="margin-bottom:6px">Perguntas do roteiro: ${r.perguntas_estado.map(p => `<b title="${esc(p.estado)}">${p.n}${p.estado === 'validada' ? '✅' : p.estado === 'rascunho' ? '✏️' : '⚪'}</b>`).join(' ')}</div>` : ''}<h4>Traga para a mesa</h4>${lista(r.entradas)}</div>
      <div><h4>Passo a passo (telas)</h4>${lista(r.telas)}<h4 style="margin-top:8px">Decisões que saem</h4>${lista(r.decisoes)}</div>
      <div><h4>Checklist · ${r.progresso}%</h4><ul style="list-style:none;padding:0">${r.checklist.map(c => `<li class="${c.ok ? 'ok' : ''}">${c.ok ? '☑' : '☐'} ${esc(c.texto)}</li>`).join('')}</ul>
        ${r.alertas.length ? `<div style="color:var(--gold,#f0a030);margin-top:6px">⚠ ${esc(r.alertas[0])}</div>` : ''}
        <div class="ck-act" style="margin-top:8px"><button class="ck-btn p" onclick="CENTRAL.jornadaAbrir(${r.n})">Abrir esta reunião na Trilha ›</button>${r.n === 3 ? '<button class="ck-btn" onclick="CENTRAL.irN(\'Estúdio de Produtos e Esteira\')">Estúdio ›</button>' : ''}${r.n === 4 ? '<button class="ck-btn" onclick="CENTRAL.irN(\'Cenários 2027\')">Cenários ›</button>' : ''}${r.n === 6 ? '<button class="ck-btn" onclick="CENTRAL.irN(\'Sala do Conselho\')">Conselho ›</button>' : ''}</div></div></div>`;
    const A = S.cen && S.cen.atual, pre = [['Valor e parcelas do Jelta', null], ['ARR atual real (Xplann, Big Data, alocações)', A ? !!A.arr : null], ['Motor de cada cliente (QuickBooks)', null], ['Placar de metas carregado', !!S.placar], ['Sócios convocados', J.reunioes[0].checklist.find(c => c.chave === 'socios')?.ok ?? null]];
    return `<div class="ck-jor">${cards}</div>${det}<div class="ck-cap" style="margin-top:8px">${J.feitas} de ${J.total} reuniões feitas. A ordem não se inverte: cada reunião usa a decisão da anterior.</div><div class="ck-pre"><b style="color:var(--t3)">Antes da Reunião 1:</b>${pre.map(([t, ok]) => `<span>${ok === true ? '☑' : '☐'} ${esc(t)}</span>`).join('')}</div>`;
  }

  // ── 🗼 TORRE DE CONTROLE · ATLAS por chat e voz contínua (reaproveita /api/estrategia chat)
  const T = { msgs: [], conv: null, env: false, modo: false, voz: true, vel: 1.3, rec: null, falando: false, rasc: '', aberto: false, tm: null };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const SUG = ['Por onde começo amanhã?', 'O que está em vermelho agora?', 'Me guie pela próxima reunião da jornada', 'Qual decisão está travando o plano?', 'Resuma onde estamos em 5 frases'];
  const mdT = t => (window.ATX_IA && ATX_IA.md) ? ATX_IA.md(t) : esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[-•] (.+)$/gm, '<div style="padding-left:12px">• $1</div>').replace(/\n/g, '<br>');
  function digest() {
    const o = { tela: 'Central de Planejamento e Estratégia', hoje: new Date().toLocaleDateString('pt-BR') };
    if (S.jor) o.jornada = { feitas: S.jor.feitas, total: S.jor.total, proxima: S.jor.proxima, reunioes: S.jor.reunioes.map(r => ({ n: r.n, titulo: r.titulo, feita: r.feito, progresso: r.progresso, abertos: r.checklist.filter(c => !c.ok).map(c => c.texto), decisoes: r.decisoes.slice(0, 4).map(d => d.texto), alertas: r.alertas })) };
    if (S.placar) o.placar = { resumo: S.placar.resumo, indicadores: (S.placar.indicadores || []).slice(0, 30).map(x => ({ nome: x.nome, real: x.real, meta: x.meta, projecao: x.projecao, cor: x.cor, unidade: x.unidade })), acoes_abertas: S.placar.acoes_abertas, pendentes_acao: S.placar.pendentes_acao };
    if (S.cen) o.cenarios = { arr_atual_real: (S.cen.atual || {}).arr || 0, atual: S.cen.atual, comparativo: S.cen.comparativo, frentes_b: Object.fromEntries(Object.entries(S.cen.frentes || {}).map(([k, v]) => [k, (v || [])[1]])) };
    return JSON.stringify(o).substring(0, 8500);
  }
  function torreCalar() { try { speechSynthesis.cancel(); } catch (_) {} clearInterval(T.poll); clearTimeout(T.ini); T.falando = false; }
  // voz feminina pt-BR: prefere as "Natural/Online" (Edge) e as do Google; evita nomes masculinos
  function torreVoz() {
    const vs = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(v => /pt[-_]BR/i.test(v.lang)); if (!vs.length) return null;
    const fem = /francisca|maria|luciana|camila|vit[oó]ria|fernanda|raquel|helena|google portugu[eê]s|feminin|female|thalita/i, masc = /daniel|antonio|ant[oô]nio|felipe|ricardo|jorge|masculin|male(?!.*fe)/i;
    const pontos = v => (/natural|online/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 3 : 0) + (fem.test(v.name) ? 3 : 0) - (masc.test(v.name) ? 10 : 0);
    return vs.slice().sort((a, b) => pontos(b) - pontos(a))[0];
  }
  if (window.speechSynthesis) { try { speechSynthesis.onvoiceschanged = () => {}; speechSynthesis.getVoices(); } catch (_) {} }
  function torreFalar(texto, fim) {
    if (!window.speechSynthesis || !T.voz) { fim && fim(); return; }
    torreCalar();
    const limpo = String(texto).replace(/[*#_`>|]/g, '').replace(/✅.*$/s, '').replace(/\n+/g, '. ').substring(0, 2400);
    const partes = limpo.match(/[^.!?]+[.!?]*/g) || [limpo]; const blocos = []; let cur = '';
    partes.forEach(x => { if ((cur + x).length > 170) { if (cur) blocos.push(cur); cur = x; } else cur += x; }); if (cur.trim()) blocos.push(cur);
    const vz = torreVoz(); T.falando = true; torreBotoes(); let acabou = false;
    const terminar = () => { if (acabou) return; acabou = true; clearInterval(T.poll); clearTimeout(T.ini); if (!T.falando) return; T.falando = false; torreBotoes(); fim && fim(); };
    blocos.forEach(b => { const u = new SpeechSynthesisUtterance(b); u.lang = 'pt-BR'; u.rate = T.vel; u.pitch = 1.08; if (vz) u.voice = vz; speechSynthesis.speak(u); });
    T.ini = setTimeout(() => { T.poll = setInterval(() => { if (!speechSynthesis.speaking && !speechSynthesis.pending) terminar(); }, 350); }, 900); // não depende de onend (que falha no Chrome)
  }
  function torreParar() { const estava = T.falando; torreCalar(); torreBotoes(); if (estava && T.modo && $('ckTorre')) setTimeout(torreOuvir, 250); }
  function torreOuvir() {
    if (!SR) { try { toast('Este navegador não reconhece voz — use o Chrome ou o Edge', 'error'); } catch (_) {} T.modo = false; torreBotoes(); return; }
    if (T.rec || T.env) return; torreCalar();
    const r = new SR(); r.lang = 'pt-BR'; r.continuous = true; r.interimResults = true; T.rec = r; let final = '', ouviu = false;
    const base = T.rasc ? T.rasc + ' ' : ''; const el = () => $('ckTxt');
    r.onresult = e => { let parc = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '; else parc += e.results[i][0].transcript; }
      T.rasc = (base + final + parc).trim(); ouviu = !!T.rasc; if (el()) el().value = T.rasc; clearTimeout(T.tm);
      if (T.modo && ouviu) T.tm = setTimeout(() => { try { r.stop(); } catch (_) {} }, 1700); }; // 1,7 s de silêncio = terminou de falar (conta também o texto provisório)
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { T.modo = false; try { toast('Libere o microfone no cadeado da barra de endereço', 'error'); } catch (_) {} } };
    r.onend = () => { T.rec = null; clearTimeout(T.tm); torreBotoes(); const txt = (T.rasc || '').trim();
      if (txt) { if (T.modo || ouviu) torreEnviar(); } else if (T.modo && $('ckTorre') && !T.env && !T.falando) setTimeout(torreOuvir, 250); };
    try { r.start(); } catch (_) { T.rec = null; setTimeout(() => { if (T.modo) torreOuvir(); }, 500); } torreBotoes();
  }
  async function torreEnviar(texto) {
    const m = String(texto ?? T.rasc ?? '').trim(); if (!m || T.env) return; const veioDaVoz = T.modo || !!T.rec;
    if (T.rec) { try { T.rec.onend = null; T.rec.stop(); } catch (_) {} T.rec = null; } torreCalar();
    T.rasc = ''; T.env = true; T.aberto = true; T.msgs.push({ r: 'u', t: m }, { r: 'a', t: '', pensando: true }); torreRender();
    try {
      const d = await api('/api/estrategia', { action: 'chat', conversa_id: T.conv, mensagem: m, voz: T.voz && (veioDaVoz || T.modo), persona: 'atlas', titulo_extra: 'Central de Planejamento e Estratégia', contexto_extra: 'Você é a TORRE DE CONTROLE da Central de Planejamento e Estratégia: o fundador conversa com você para ser guiado, tirar dúvidas e decidir. Estado atual da tela (jornada das 6 reuniões, placar de metas, cenários 2027):\n' + digest() });
      T.conv = d.conversa_id; T.msgs.pop(); T.msgs.push({ r: 'a', t: d.resposta }); T.env = false; torreRender();
      if (T.voz && (T.modo || veioDaVoz)) torreFalar(d.resposta, () => { if (T.modo && $('ckTorre')) setTimeout(torreOuvir, 350); });
    } catch (e) { T.msgs.pop(); T.msgs.push({ r: 'a', t: '⚠ ' + e.message }); T.env = false; T.modo = false; torreRender(); }
  }
  function torreBotoes() {
    const pr = $('ckBtParar'); if (pr) pr.style.display = (T.falando || T.env) ? '' : 'none'; const ve = $('ckBtVel'); if (ve) ve.textContent = '⚡ ' + String(T.vel).replace('.', ',') + '×';
    const m = $('ckBtModo'), mic = $('ckBtMic'), vz = $('ckBtVoz'), st = $('ckStatus');
    if (m) { m.className = 'ck-btn' + (T.modo ? ' p' : ''); m.textContent = T.modo ? '⏹ Encerrar conversa contínua' : '🎙 Conversa contínua'; }
    if (mic) { mic.textContent = T.rec ? '⏺ ouvindo…' : '🎤 Falar'; mic.style.background = T.rec ? 'var(--red,#e5594f)' : ''; mic.style.color = T.rec ? '#fff' : ''; }
    if (vz) vz.textContent = T.voz ? '🔊 Voz ligada' : '🔇 Voz desligada';
    if (st) st.innerHTML = T.env ? '⏳ ATLAS está pensando com os números da empresa…' : T.falando ? '🔊 ATLAS falando — <a href="#" onclick="event.preventDefault();CENTRAL.interromper()">interromper e falar</a>' : T.rec ? '🎧 Estou ouvindo — fale, faça uma pausa e eu respondo' : T.modo ? '🎙 Conversa contínua ligada' : '';
  }
  function torreEnc() {
    const b = $('ckTorre'), a = $('ckApp'); if (!b || !a) return; const r = a.getBoundingClientRect(); if (!r.width) return;
    const l = Math.max(0, r.left); b.style.left = l + 'px'; b.style.width = Math.min(r.width, innerWidth - l) + 'px'; a.style.paddingBottom = (b.offsetHeight + 24) + 'px';
  }
  if (!window._ckResize) { window._ckResize = true; window.addEventListener('resize', () => { try { torreEnc(); } catch (_) {} }); }
  function torreRender() {
    const box = $('ckTorre'); if (!box) return; const foco = document.activeElement && document.activeElement.id === 'ckTxt';
    const msgs = T.msgs.length ? T.msgs.map(m => m.r === 'u' ? `<div class="ck-mu"><div>${esc(m.t)}</div></div>` : `<div class="ck-ma"><span>🗼</span><div>${m.pensando ? '<span style="color:var(--t3)">pensando…</span>' : mdT(m.t)}</div></div>`).join('')
      : `<div class="ck-vazio">Chame a torre para guiar, tirar dúvidas ou decidir. Ela enxerga o placar, os cenários, a jornada e os números da empresa.<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${SUG.map((q, i) => `<button class="ck-btn" onclick="CENTRAL.sug(${i})">${esc(q)}</button>`).join('')}</div></div>`;
    box.innerHTML = `<div class="ck-tbar"><b style="font-size:12px">🗼 Torre de controle · ATLAS</b><button class="ck-btn" id="ckBtModo" onclick="CENTRAL.modo()">🎙 Conversa contínua</button><button class="ck-btn" id="ckBtVoz" onclick="CENTRAL.vozToggle()">🔊 Voz ligada</button><button class="ck-btn" id="ckBtVel" onclick="CENTRAL.vel()" title="Velocidade da fala">⚡ 1,3×</button><button class="ck-btn" onclick="CENTRAL.torreNova()">＋ Nova</button><button class="ck-btn p" id="ckBtParar" style="display:none;background:var(--red,#e5594f);border-color:var(--red,#e5594f)" onclick="CENTRAL.parar()">⏹ Parar</button><span id="ckStatus" class="ck-cap" style="margin:0 0 0 4px;flex:1"></span><button class="ck-btn" onclick="CENTRAL.torreAbrir()">${T.aberto ? '▾ recolher conversa' : '▴ abrir conversa'}</button></div>
    ${T.aberto ? `<div id="ckMsgs" class="ck-msgs">${msgs}</div>` : ''}
    <div style="display:flex;gap:6px;margin-top:6px;align-items:flex-end"><textarea id="ckTxt" class="ck-find" style="max-width:none;min-height:40px;height:40px;resize:none" placeholder="Escreva ou fale com a torre… (Enter envia)" oninput="CENTRAL.rasc(this.value)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();CENTRAL.enviar()}">${esc(T.rasc)}</textarea><button class="ck-btn" id="ckBtMic" onclick="CENTRAL.mic()">🎤 Falar</button><button class="ck-btn p" onclick="CENTRAL.enviar()" ${T.env ? 'disabled' : ''}>Enviar ➤</button></div>`;
    const mm = $('ckMsgs'); if (mm) mm.scrollTop = mm.scrollHeight; torreBotoes(); torreEnc(); if (foco && $('ckTxt')) { const t = $('ckTxt'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }

  function comandos() {
    const q = S.filtro.trim().toLowerCase(), norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return GRUPOS.map(g => {
      const its = g.itens.filter(t => !q || norm(t.n + ' ' + t.d + ' ' + g.nome).includes(norm(q)));
      if (!its.length) return '';
      return `<div class="ck-grp"><div class="ck-gh"><u style="background:${g.cor}"></u>${esc(g.nome)}</div><div class="ck-tiles">${its.map(t => `<button class="ck-tile" style="--c:${g.cor}" onclick="CENTRAL.ir(${TODAS.indexOf(TODAS.find(x => x.n === t.n && x.g === g.id))})"><b>${t.i} ${esc(t.n)}${t.novo ? '<em>novo</em>' : ''}</b><span>${esc(t.d)}</span></button>`).join('')}</div></div>`;
    }).join('') || '<div class="ck-vazio">Nenhuma tela encontrada.</div>';
  }

  function render() {
    const app = $('ckApp'); if (!app) return;
    const hoje = new Date(), ano = hoje.getFullYear(), diasAno = Math.ceil((new Date(ano + 1, 0, 1) - hoje) / 864e5);
    const inst = instrumentos();
    app.innerHTML = `
    <div class="ck-top"><div class="ck-ti"><b>🛩️ Central de Planejamento e Estratégia</b><div>Instrumentos ao vivo no alto; todas as telas de estratégia no painel de comandos, embaixo. O menu lateral continua com cada tela individual.</div></div>
      <div class="ck-hud"><div><b>${diasAno}</b><span>dias para ${ano + 1}</span></div><div><b>${hoje.toLocaleDateString('pt-BR')}</b><span>hoje</span></div><div><b>${TODAS.length}</b><span>telas ligadas</span></div></div>
      <button class="ck-btn" onclick="CENTRAL.carregar(true)" title="Atualizar os instrumentos">↻ Atualizar</button></div>
    <div id="ckTorre" class="ck-dock"></div>
    <div class="ck-bezel" style="margin-bottom:12px"><div class="ck-sec">🧭 Jornada do Planejamento 2027 · 6 reuniões<i></i><button class="ck-btn" style="padding:3px 9px;font-size:10px" onclick="CENTRAL.jornadaAbrir()">abrir na Trilha ›</button></div>${jornada()}</div>
    <div class="ck-bezel"><div class="ck-sec">Instrumentos<i></i></div>${inst.length ? `<div class="ck-inst">${inst.map(gauge).join('')}</div>` : `<div class="ck-vazio">${esc(S.erroPlacar || 'Carregando os instrumentos…')}</div>`}</div>
    <div class="ck-mid"><div class="ck-bezel"><div class="ck-sec">Horizonte 2027 · cenários<i></i><button class="ck-btn" style="padding:3px 9px;font-size:10px" onclick="CENTRAL.irN('Cenários 2027')">abrir ›</button></div>${horizonte()}</div>
      <div class="ck-bezel"><div class="ck-sec">Luzes de alerta<i></i></div>${luzes()}</div></div>
    <div class="ck-act"><button class="ck-btn p" onclick="CENTRAL.irN('Sala do Conselho')">🏛️ Convocar o Conselho</button><button class="ck-btn" onclick="CENTRAL.irN('ATLAS · Estrategista')">🧠 Falar com o ATLAS</button><button class="ck-btn" onclick="CENTRAL.irN('Cenários 2027')">📊 Editar premissas dos cenários</button><button class="ck-btn" onclick="CENTRAL.irN('Plano de Ação 90 dias')">▶ Plano de 90 dias</button><button class="ck-btn" onclick="CENTRAL.irN('Relatório Executivo')">📄 Relatório executivo</button></div>
    <div class="ck-bezel ck-cmd"><div class="ck-sec">Painel de comandos<i></i><input class="ck-find" id="ckFind" placeholder="Buscar tela… (ex.: caixa, conselho, metas)" value="${esc(S.filtro)}" oninput="CENTRAL.buscar(this.value)"/></div><div id="ckCmd">${comandos()}</div></div>`;
    torreRender();
  }

  async function carregar(forcar) {
    if (S.carregando) return; S.carregando = true; render();
    const [p, c, j] = await Promise.allSettled([api('/api/placar', { action: 'status', params: { _forcar: !!forcar } }), api('/api/s1-intel', { action: 'cenarios_obter' }), api('/api/estrategia', { action: 'jornada_obter' })]);
    if (j.status === 'fulfilled') { S.jor = j.value.jornada; S.erroJor = null; } else S.erroJor = /403|fundador|permiss/i.test(j.reason.message) ? 'A jornada é visível só para o fundador.' : 'Jornada indisponível: ' + j.reason.message;
    if (p.status === 'fulfilled') { S.placar = p.value.placar; S.erroPlacar = null; } else S.erroPlacar = 'Placar indisponível: ' + p.reason.message;
    if (c.status === 'fulfilled') { S.cen = c.value.resultado; S.cenRaw = { valores: c.value.valores || {}, alterados: c.value.alterados || [] }; S.erroCen = null; } else S.erroCen = /403|CEO|admin/i.test(c.reason.message) ? 'Cenários são do CEO/administrador.' : 'Cenários indisponíveis: ' + c.reason.message;
    S.carregando = false; render();
  }
  function navegar(t) {
    if (!t) return; if (t.aba) window._estAbaInicial = t.aba;
    const el = [...document.querySelectorAll('.sbi')].find(x => { const o = x.getAttribute('onclick') || ''; return o.includes("'" + t.p + "'") && (!t.aba || o.includes("'" + t.aba + "'")); });
    try { nav(t.p, el || null); } catch (e) { console.error('[central]', e); }
    if (t.pos) setTimeout(t.pos, 450);
    try { window.scrollTo({ top: 0 }); } catch (_) {}
  }
  window.CENTRAL = {
    abrir() { css(); render(); carregar(false); },
    carregar,
    ir(i) { navegar(TODAS[i]); },
    irP(p) { navegar(TODAS.find(t => t.p === p && !t.aba && !t.pos) || { p }); },
    irN(nome) { navegar(TODAS.find(t => t.n === nome)); },
    detalhe, fechar, arrEditar, arrSalvar,
    torreAbrir() { T.aberto = !T.aberto; torreRender(); },
    torreNova() { torreCalar(); T.modo = false; T.conv = null; T.msgs = []; T.rasc = ''; torreRender(); },
    modo() { T.modo = !T.modo; if (T.modo) { T.voz = true; T.rasc = ''; torreOuvir(); } else { torreCalar(); if (T.rec) { T.rec.onend = null; try { T.rec.stop(); } catch (_) {} T.rec = null; } } torreBotoes(); },
    mic() { if (T.rec) { try { T.rec.stop(); } catch (_) {} } else torreOuvir(); },
    vozToggle() { T.voz = !T.voz; if (!T.voz) torreCalar(); torreBotoes(); },
    interromper() { torreCalar(); torreOuvir(); },
    parar() { torreParar(); },
    vel() { T.vel = T.vel >= 1.5 ? 1.1 : Math.round((T.vel + 0.2) * 10) / 10; torreBotoes(); },
    rasc(v) { T.rasc = v; },
    enviar() { torreEnviar(); },
    sug(i) { torreEnviar(SUG[i]); },
    reuniao(n) { S.reuniaoAberta = n; render(); },
    jornadaAbrir(n) { navegar({ p: 's0estrategia', aba: 'trilha', pos: () => { try { ESTT.sub('jornada'); } catch (_) {} } }); },
    buscar(v) { S.filtro = v; const c = $('ckCmd'); if (c) c.innerHTML = comandos(); }
  };
})();
