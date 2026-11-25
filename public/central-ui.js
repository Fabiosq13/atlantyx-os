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
    .ck-msgs{max-height:340px;overflow-y:auto;padding:4px 2px;background:var(--bg);border:1px solid var(--bd);border-radius:10px}
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
    const A = C.atual || {}, base = [['ARR ATUAL real (sustentação Xplann + Big Data + alocações)', A.arr || 0, '#e6edf3']];
    const linhas = [['Produto p/ concessionárias (hipótese) · recorrente/ano', m('gelta').arr, '#22d3a3'], ['IARA · receita recorrente/ano', m('iara').arr, '#9c6dff'], ['Maestro (fora do plano 2027) · recorrente/ano', m('maestro').arr, '#38bdf8'], ['Funil isca → IA · recorrente/ano', B('funil').arrIA, '#f5b83d']];
    const res = [['Grandes projetos · contribuição', B('gp').contrib, '#fb7185'], ['Sustentação · contribuição', B('sust').contrib, '#2dd4bf'], ['Funil isca → IA → projeto · contribuição', B('funil').contrib, '#a3e635']];
    const mx = Math.max(1, ...linhas.map(l => l[1] || 0), ...res.map(l => Math.max(0, l[1] || 0)));
    const bar = l => `<div class="ck-bar"><span>${esc(l[0])}</span><div class="tr"><i style="width:${Math.max(2, Math.max(0, l[1] || 0) / mx * 100).toFixed(1)}%;background:${l[2]}"></i></div><b>${R(l[1])}</b></div>`;
    const cp = C.comparativo || {};
    return base.map(bar).join('') + (A.arr ? '' : '<div class="ck-cap">Informe os valores mensais reais em Plano Estratégico → Cenários 2027 → Premissas → "ARR atual (real)".</div>') + '<div class="ck-cap" style="margin:8px 0 2px">Hipóteses de novos produtos (não são receita de hoje)</div>' + linhas.map(bar).join('') + '<div style="height:6px"></div>' + res.map(bar).join('') +
      `<div class="ck-cap">Cenário do meio (B) das hipóteses editáveis. O Jelta é projeto parcelado (não entra em recorrência). Maior receita recorrente: <b>${esc(cp.maiorArr || '—')}</b> · maior margem: <b>${esc(cp.maiorMargemRR || '—')}</b> · retorno mais rápido: <b>${esc(cp.retornoMaisRapido || '—')}</b>.</div>`;
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
  const T = { msgs: [], conv: null, env: false, modo: false, voz: true, rec: null, falando: false, rasc: '', aberto: true, tm: null };
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
  function torreCalar() { try { speechSynthesis.cancel(); } catch (_) {} T.falando = false; }
  function torreFalar(texto, fim) {
    if (!window.speechSynthesis || !T.voz) { fim && fim(); return; }
    const limpo = String(texto).replace(/[*#_`>|]/g, '').replace(/✅.*$/s, '').replace(/\n+/g, '. ').substring(0, 2200);
    const partes = limpo.match(/[^.!?]+[.!?]*/g) || [limpo]; const blocos = []; let cur = '';
    partes.forEach(x => { if ((cur + x).length > 180) { if (cur) blocos.push(cur); cur = x; } else cur += x; }); if (cur.trim()) blocos.push(cur);
    const vz = speechSynthesis.getVoices().filter(v => /pt[-_]BR/i.test(v.lang))[0]; T.falando = true; torreBotoes();
    blocos.forEach((b, i) => { const u = new SpeechSynthesisUtterance(b); u.lang = 'pt-BR'; u.rate = 1.06; if (vz) u.voice = vz; if (i === blocos.length - 1) { u.onend = u.onerror = () => { T.falando = false; torreBotoes(); fim && fim(); }; } speechSynthesis.speak(u); });
  }
  function torreOuvir() {
    if (!SR) { try { toast('Este navegador não reconhece voz — use o Chrome ou o Edge', 'error'); } catch (_) {} T.modo = false; return; }
    if (T.rec || T.env) return; torreCalar();
    const r = new SR(); r.lang = 'pt-BR'; r.continuous = true; r.interimResults = true; T.rec = r; let final = '';
    const base = T.rasc ? T.rasc + ' ' : '';
    const el = () => $('ckTxt');
    r.onresult = e => { let parc = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '; else parc += e.results[i][0].transcript; }
      T.rasc = (base + final + parc).trim(); if (el()) el().value = T.rasc; clearTimeout(T.tm);
      if (T.modo && (final.trim())) T.tm = setTimeout(() => { try { r.stop(); } catch (_) {} }, 1600); }; // pausa de 1,6 s = terminou de falar
    r.onerror = e => { if (e.error === 'not-allowed') { T.modo = false; try { toast('Libere o microfone no cadeado da barra de endereço', 'error'); } catch (_) {} } };
    r.onend = () => { T.rec = null; clearTimeout(T.tm); torreBotoes(); const txt = (T.rasc || '').trim();
      if (txt && (T.modo || final.trim())) torreEnviar(); else if (T.modo && $('ckTorre') && !T.env && !T.falando) setTimeout(torreOuvir, 300); };
    try { r.start(); } catch (_) { T.rec = null; } torreBotoes();
  }
  async function torreEnviar(texto) {
    const m = String(texto ?? T.rasc ?? '').trim(); if (!m || T.env) return; const veioDaVoz = T.modo || !!T.rec;
    if (T.rec) { try { T.rec.onend = null; T.rec.stop(); } catch (_) {} T.rec = null; } torreCalar();
    T.rasc = ''; T.env = true; T.msgs.push({ r: 'u', t: m }, { r: 'a', t: '', pensando: true }); torreRender();
    try {
      const d = await api('/api/estrategia', { action: 'chat', conversa_id: T.conv, mensagem: m, voz: T.voz && (veioDaVoz || T.modo), persona: 'atlas', titulo_extra: 'Central de Planejamento e Estratégia', contexto_extra: 'Você é a TORRE DE CONTROLE da Central de Planejamento e Estratégia: o fundador conversa com você para ser guiado, tirar dúvidas e decidir. Estado atual da tela (jornada das 6 reuniões, placar de metas, cenários 2027):\n' + digest() });
      T.conv = d.conversa_id; T.msgs.pop(); T.msgs.push({ r: 'a', t: d.resposta }); T.env = false; torreRender();
      if (T.voz && (T.modo || veioDaVoz)) torreFalar(d.resposta, () => { if (T.modo && $('ckTorre')) setTimeout(torreOuvir, 350); });
    } catch (e) { T.msgs.pop(); T.msgs.push({ r: 'a', t: '⚠ ' + e.message }); T.env = false; T.modo = false; torreRender(); }
  }
  function torreBotoes() {
    const m = $('ckBtModo'), mic = $('ckBtMic'), vz = $('ckBtVoz'), st = $('ckStatus');
    if (m) { m.className = 'ck-btn' + (T.modo ? ' p' : ''); m.textContent = T.modo ? '⏹ Encerrar conversa contínua' : '🎙 Conversa contínua'; }
    if (mic) { mic.textContent = T.rec ? '⏺ ouvindo…' : '🎤 Falar'; mic.style.background = T.rec ? 'var(--red,#e5594f)' : ''; mic.style.color = T.rec ? '#fff' : ''; }
    if (vz) vz.textContent = T.voz ? '🔊 Voz ligada' : '🔇 Voz desligada';
    if (st) st.innerHTML = T.env ? '⏳ ATLAS está pensando com os números da empresa…' : T.falando ? '🔊 ATLAS falando — <a href="#" onclick="event.preventDefault();CENTRAL.interromper()">interromper e falar</a>' : T.rec ? '🎧 Estou ouvindo — fale, faça uma pausa e eu respondo' : T.modo ? '🎙 Conversa contínua ligada' : '';
  }
  function torreRender() {
    const box = $('ckTorre'); if (!box) return;
    const msgs = T.msgs.length ? T.msgs.map(m => m.r === 'u' ? `<div class="ck-mu"><div>${esc(m.t)}</div></div>` : `<div class="ck-ma"><span>🗼</span><div>${m.pensando ? '<span style="color:var(--t3)">pensando…</span>' : mdT(m.t)}</div></div>`).join('')
      : `<div class="ck-vazio">Chame a torre para guiar, tirar dúvidas ou decidir. Ela enxerga o placar, os cenários, a jornada e os números da empresa.<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${SUG.map((q, i) => `<button class="ck-btn" onclick="CENTRAL.sug(${i})">${esc(q)}</button>`).join('')}</div></div>`;
    box.innerHTML = `<div class="ck-sec">🗼 Torre de controle · ATLAS, estrategista-chefe<i></i><button class="ck-btn" style="padding:3px 9px;font-size:10px" onclick="CENTRAL.torreAbrir()">${T.aberto ? '▴ recolher' : '▾ abrir'}</button></div>
    ${T.aberto ? `<div class="ck-tbar"><button class="ck-btn" id="ckBtModo" onclick="CENTRAL.modo()">🎙 Conversa contínua</button><button class="ck-btn" id="ckBtVoz" onclick="CENTRAL.vozToggle()">🔊 Voz ligada</button><button class="ck-btn" onclick="CENTRAL.torreNova()">＋ Nova conversa</button><span id="ckStatus" class="ck-cap" style="margin:0 0 0 6px"></span></div>
    <div id="ckMsgs" class="ck-msgs">${msgs}</div>
    <div style="display:flex;gap:6px;margin-top:8px;align-items:flex-end"><textarea id="ckTxt" class="ck-find" style="max-width:none;min-height:48px;resize:vertical" placeholder="Escreva ou fale com a torre… (Enter envia)" oninput="CENTRAL.rasc(this.value)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();CENTRAL.enviar()}">${esc(T.rasc)}</textarea><div style="display:flex;flex-direction:column;gap:4px"><button class="ck-btn" id="ckBtMic" onclick="CENTRAL.mic()">🎤 Falar</button><button class="ck-btn p" onclick="CENTRAL.enviar()" ${T.env ? 'disabled' : ''}>Enviar ➤</button></div></div>` : ''}`;
    const mm = $('ckMsgs'); if (mm) mm.scrollTop = mm.scrollHeight; torreBotoes();
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
    <div class="ck-bezel" id="ckTorre" style="margin-bottom:12px"></div>
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
    if (c.status === 'fulfilled') { S.cen = c.value.resultado; S.erroCen = null; } else S.erroCen = /403|CEO|admin/i.test(c.reason.message) ? 'Cenários são do CEO/administrador.' : 'Cenários indisponíveis: ' + c.reason.message;
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
    torreAbrir() { T.aberto = !T.aberto; torreRender(); },
    torreNova() { torreCalar(); T.modo = false; T.conv = null; T.msgs = []; T.rasc = ''; torreRender(); },
    modo() { T.modo = !T.modo; if (T.modo) { T.voz = true; torreOuvir(); } else { torreCalar(); if (T.rec) { T.rec.onend = null; try { T.rec.stop(); } catch (_) {} T.rec = null; } } torreBotoes(); },
    mic() { if (T.rec) { try { T.rec.stop(); } catch (_) {} } else torreOuvir(); },
    vozToggle() { T.voz = !T.voz; if (!T.voz) torreCalar(); torreBotoes(); },
    interromper() { torreCalar(); torreOuvir(); },
    rasc(v) { T.rasc = v; },
    enviar() { torreEnviar(); },
    sug(i) { torreEnviar(SUG[i]); },
    reuniao(n) { S.reuniaoAberta = n; render(); },
    jornadaAbrir(n) { navegar({ p: 's0estrategia', aba: 'trilha', pos: () => { try { ESTT.sub('jornada'); } catch (_) {} } }); },
    buscar(v) { S.filtro = v; const c = $('ckCmd'); if (c) c.innerHTML = comandos(); }
  };
})();
