// v3.572 — PLACAR DE METAS (Dashboard, com login): todos os indicadores por grupo, com meta × realizado × projeção, semáforo (cor + ícone + texto),
// tendência, fonte, dono, fórmula, ações obrigatórias no vermelho, registro manual e edição de meta (só CEO; toda alteração grava placar:log).
// Dados: api/placar.js · cálculo único em lib/placar-calc.js (o mesmo da TV).
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nf = (n, d = 0) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const COR = { verde: 'var(--green)', amarelo: 'var(--gold)', vermelho: 'var(--red)', cinza: 'var(--t3)' };
  const S = { ano: new Date().getFullYear(), P: null, erro: null, acoes: [], aberto: null, log: null };
  const fm = (i, v) => v == null ? '—' : i.unidade === 'R$' ? (Math.abs(v) >= 1e6 ? 'R$ ' + nf(v / 1e6, 2) + ' mi' : Math.abs(v) >= 1e4 ? 'R$ ' + nf(v / 1e3) + ' mil' : 'R$ ' + nf(v)) : i.unidade === '%' ? nf(v, 1) + '%' : i.unidade === 'dias' ? nf(v) + ' dias' : nf(v, 1);
  const meta = i => i.faixa ? 'faixa ' + i.faixa[0] + '–' + i.faixa[1] + '%' : i.meta == null ? 'sem meta' : 'meta ' + fm(i, i.meta);
  async function api(action, params) {
    const r = await fetch('/api/placar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, params: { ano: S.ano, ...(params || {}) } }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || ('Erro ' + r.status)); return j;
  }
  async function abrir(forcar) {
    const b = $('plApp'); if (!b) return; if ($('plAno')) $('plAno').textContent = S.ano;
    b.innerHTML = '<div class="pl-load">Carregando o placar…</div>';
    try { const [a, c] = await Promise.all([api('status', { _forcar: !!forcar }), api('acao_listar')]); S.P = a.placar; S.acoes = c.acoes || []; S.erro = null; } catch (e) { S.erro = e.message; }
    pinta();
  }
  function chip(i) { return '<span class="pl-st" style="color:' + COR[i.cor] + ';border-color:' + COR[i.cor] + '">' + esc(i.icone) + ' ' + esc(i.cor === 'cinza' && i.idade_dias > 0 ? 'dado de ' + i.idade_dias + ' dias' : i.texto) + '</span>'; }
  function barra(i) {
    if (i.tipo !== 'acumulado' || i.meta == null || !(i.meta > 0)) return '';
    const p = Math.max(0, Math.min(100, (i.real || 0) / i.meta * 100)), m = i.esperado != null ? Math.min(100, i.esperado / i.meta * 100) : null;
    return '<div class="pl-bar"><div style="width:' + p + '%;background:' + COR[i.cor] + '"></div>' + (m != null ? '<u style="left:' + m + '%" title="esperado até hoje"></u>' : '') + '</div>';
  }
  function cartao(i) {
    const t = i.tendencia || {}, ab = S.aberto === i.id;
    const acoesI = S.acoes.filter(a => a.indicador === i.id && a.status === 'aberta');
    return '<div class="pl-i' + (i.exige_acao ? ' pl-alerta' : '') + '"><div class="pl-ih"><div><b>' + esc(i.nome) + '</b>' + (i.rotulo ? ' <span class="pl-tag">' + esc(i.rotulo) + '</span>' : '') + (i.visivel_tv ? ' <span class="pl-tag">TV</span>' : '') + (i.privado ? ' <span class="pl-tag">só login</span>' : '') + '</div>' + chip(i) + '</div>'
      + '<div class="pl-v"><span class="pl-big">' + fm(i, i.real) + '</span><span class="pl-seta" title="' + esc(t.rotulo || '') + '">' + esc(t.seta || '') + ' ' + esc(t.rotulo || '') + '</span></div>' + barra(i)
      + '<div class="pl-sub">' + esc(meta(i)) + (i.esperado != null ? ' · esperado até hoje ' + fm(i, i.esperado) : '') + (i.projecao != null ? ' · projeção ' + fm(i, i.projecao) : '') + (i.gap != null ? ' · gap ' + (i.gap >= 0 ? '+' : '') + (i.unidade === '%' ? nf(i.gap, 1) + ' p.p.' : fm(i, i.gap)) : '') + '</div>'
      + (i.erro ? '<div class="pl-erro">Fonte com problema: ' + esc(i.erro) + '</div>' : '')
      + (i.exige_acao ? '<div class="pl-pede">⚠ ' + esc(i.exige_acao) + ' — registre uma ação. ' + esc(S.P.pergunta) + '</div>' : '')
      + acoesI.map(a => '<div class="pl-ac">▸ ' + esc(a.o_que_muda) + ' · <b>' + esc(a.dono) + '</b> · até ' + esc(String(a.prazo).split('-').reverse().join('/')) + ' <button onclick="PLACAR.revisar(\'' + a.id + '\')">Revisar</button></div>').join('')
      + '<div class="pl-bt"><button onclick="PLACAR.abre(\'' + i.id + '\')">' + (ab ? 'Fechar' : 'Detalhe e ações') + '</button></div>'
      + (ab ? detalhe(i) : '') + '</div>';
  }
  function detalhe(i) {
    const d = i.fonte === 'manual', fin = ['receita_ano', 'margem_liquida', 'margem_ebitda', 'caixa_minimo', 'recorrente_pct'].includes(i.id);
    return '<div class="pl-det"><div><b>Fórmula:</b> ' + esc(i.formula || '—') + '</div><div><b>Fonte:</b> ' + (d ? 'registro manual (' + esc(i.periodicidade) + ')' : 'automática') + ' · <b>Dono:</b> ' + esc(i.dono || '—') + ' · <b>Leitura:</b> ' + (i.idade_dias == null ? 'sem leitura' : i.idade_dias === 0 ? 'de hoje' : 'há ' + i.idade_dias + ' dia(s)') + '</div>'
      + (d ? '<div class="pl-f"><input id="plv-' + i.id + '" type="number" step="any" placeholder="valor (' + esc(i.unidade) + ')"><button onclick="PLACAR.manual(\'' + i.id + '\')">Registrar leitura</button></div>' : '')
      + (fin ? '<div class="pl-sub">Meta financeira: edite em Planejamento → Visão e Metas / Metas da Empresa (fonte única).</div>'
        : '<div class="pl-f"><input id="plm-' + i.id + '" type="number" step="any" placeholder="' + (i.sentido === 'faixa' ? 'mín' : 'meta') + '" value="' + (i.faixa ? i.faixa[0] : i.meta ?? '') + '">' + (i.sentido === 'faixa' ? '<input id="plM-' + i.id + '" type="number" step="any" placeholder="máx" value="' + (i.faixa ? i.faixa[1] : '') + '">' : '') + '<input id="plt-' + i.id + '" type="number" step="any" placeholder="tolerância" value="' + (i.tolerancia ?? '') + '"><input id="plx-' + i.id + '" placeholder="motivo (obrigatório)"><button onclick="PLACAR.salvaMeta(\'' + i.id + '\')">Salvar meta (CEO)</button></div>')
      + '<div class="pl-f"><b>Nova ação:</b><input id="pla-' + i.id + '" placeholder="o que muda (qual alavanca?)"><input id="pld-' + i.id + '" placeholder="dono"><input id="plp-' + i.id + '" type="date"><button onclick="PLACAR.acao(\'' + i.id + '\')">Salvar ação</button></div></div>';
  }
  function pinta() {
    const b = $('plApp'); if (!b) return;
    if (S.erro || !S.P) { b.innerHTML = '<div class="pl-erro" style="padding:18px">Não foi possível carregar o placar: ' + esc(S.erro || 'sem resposta') + ' <button onclick="PLACAR.abrir(true)">Tentar de novo</button></div>'; return; }
    const P = S.P, R = P.resumo, grupos = [...new Set(P.indicadores.map(i => i.grupo))];
    const piores = (R.piores || []).map(id => P.indicadores.find(i => i.id === id)).filter(Boolean);
    let h = '<div class="pl-top"><div class="pl-cnt">' + ['verde', 'amarelo', 'vermelho', 'cinza'].map(c => '<div class="pl-c" style="border-color:' + COR[c] + '"><b style="color:' + COR[c] + '">' + R[c] + '</b><span>' + { verde: '✔ no alvo', amarelo: '▲ atenção', vermelho: '✖ fora da meta', cinza: '○ sem leitura' }[c] + '</span></div>').join('') + '</div>'
      + '<div class="pl-pior">' + (piores.length ? '<b>Maiores desvios:</b> ' + piores.map(i => esc(i.nome) + ' (' + esc(i.texto.toLowerCase()) + ')').join(' · ') : 'Nenhum indicador em atenção.') + '</div></div>';
    if (P.pendentes_acao.length) h += '<div class="pl-pede" style="margin:10px 0">Ação obrigatória pendente: ' + P.pendentes_acao.map(x => '<b>' + esc(x.nome) + '</b> (' + esc(x.motivo) + ')').join(' · ') + '. ' + esc(P.pergunta) + '</div>';
    h += grupos.map(g => '<div class="pl-g">' + esc(g) + '</div><div class="pl-grade">' + P.indicadores.filter(i => i.grupo === g).map(cartao).join('') + '</div>').join('');
    h += '<div class="pl-nota">Receita e margem andam juntas: o número principal pode esconder vermelhos. Sem meta ou com dado velho o indicador fica cinza (nunca verde). Metas são decisão do CEO — a IA sugere, nunca aprova. Gerado em ' + new Date(P.gerado_em).toLocaleString('pt-BR') + '. <button onclick="PLACAR.verLog()">Histórico de alterações</button></div>';
    if (S.log) h += '<div class="pl-det">' + (S.log.length ? S.log.map(l => '<div>' + esc(new Date(l.em).toLocaleString('pt-BR')) + ' · ' + esc(l.por) + ' · ' + esc(l.tipo) + ' · ' + esc(l.motivo) + '</div>').join('') : 'Nenhuma alteração registrada.') + '</div>';
    b.innerHTML = h;
  }
  const ler = id => ($(id) || {}).value;
  async function fazer(fn, ok) { try { await fn(); if (ok) alert(ok); await abrir(true); } catch (e) { alert(e.message); } }
  window.PLACAR = {
    abrir, recarregar: () => abrir(true), ano: d => { S.ano += d; abrir(); }, abre: id => { S.aberto = S.aberto === id ? null : id; pinta(); },
    manual: id => fazer(() => api('manual_registrar', { id, valor: ler('plv-' + id) })),
    salvaMeta: id => fazer(() => { const i = S.P.indicadores.find(x => x.id === id), p = { id, motivo: ler('plx-' + id), tolerancia: ler('plt-' + id) };
      if (i.sentido === 'faixa') p.faixa = [ler('plm-' + id), ler('plM-' + id)]; else p.meta = ler('plm-' + id); return api('metas_salvar', p); }),
    acao: id => fazer(() => api('acao_salvar', { indicador: id, o_que_muda: ler('pla-' + id), dono: ler('pld-' + id), prazo: ler('plp-' + id) })),
    revisar: id => { const s = prompt('Revisão da ação: fechada, mantida ou replanejada?', 'mantida'); if (!s) return; const p = { id, status: s.trim().toLowerCase() };
      if (p.status === 'replanejada') { p.prazo = prompt('Novo prazo (AAAA-MM-DD):'); p.dono = prompt('Dono (deixe vazio para manter):') || ''; } fazer(() => api('acao_revisar', p)); },
    verLog: async () => { try { S.log = S.log ? null : (await api('log_listar')).log; } catch (e) { alert(e.message); } pinta(); },
  };
})();
