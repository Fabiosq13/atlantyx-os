// Jornada de Alta Performance em Projetos (Tático) — Fase A · Visão do Portfólio.
// Dados: api/projetos-tatico.js (banco do Maestro) · farol: lib/projetos-calc.js. Sem ranking de pessoas; nomes só no perfil gestor.
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nf = (n, d = 0) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const COR = { verde: 'var(--green)', amarelo: 'var(--gold)', vermelho: 'var(--red)', cinza: 'var(--t3)' };
  const ICO = { verde: '●', amarelo: '▲', vermelho: '✖', cinza: '○' };
  const data = d => d ? String(d).split('-').reverse().join('/') : '—';
  const brl = v => v == null ? '—' : 'R$ ' + nf(v);
  const S = { P: null, erro: null, filtro: 'todos' };
  async function api(action, params) {
    const r = await fetch('/api/projetos-tatico', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, params: params || {} }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.success === false) throw new Error(j.error || ('Erro ' + r.status)); return j;
  }
  async function abrir(forcar) {
    const b = $('ptApp'); if (!b) return; b.innerHTML = '<div class="pt-load">Carregando o portfólio…</div>';
    try { S.P = (await api('portfolio', { forcar: !!forcar })).portfolio; S.erro = null; } catch (e) { S.erro = e.message; }
    pinta();
  }
  const sel = (cor, txt) => '<span class="pt-f" style="color:' + COR[cor] + ';border-color:' + COR[cor] + '">' + ICO[cor] + ' ' + esc(txt || cor) + '</span>';
  function linha(l) {
    const fc = l.farol_calculado || { cor: 'cinza', motivos: [] }, inf = l.farol_informado;
    const lac = Object.entries(l.lacunas || {}).map(([k, v]) => k + ': ' + v).join(' · ');
    const hr = l.horas_previstas != null || l.horas_realizadas != null ? nf(l.horas_realizadas, 0) + ' / ' + (l.horas_previstas != null ? nf(l.horas_previstas, 0) : '—') : '—';
    const idade = l.sr_dias == null ? 'sem status' : l.sr_dias === 0 ? 'hoje' : l.sr_dias + ' d';
    return '<tr><td><b>' + esc(l.projeto) + '</b><div class="pt-sub">' + esc(l.cliente) + '</div></td><td>' + esc(l.gerente || '—') + '</td><td>' + esc(l.tipo || '—') + '</td>'
      + '<td>' + data(l.prometida) + '</td><td>' + data(l.previsao) + '</td><td style="color:' + (l.dias_atraso > 0 ? 'var(--red)' : 'inherit') + '">' + (l.dias_atraso || 0) + '</td>'
      + '<td>' + (l.pct_real != null ? nf(l.pct_real) + '%' : '—') + ' × ' + (l.pct_plan != null ? nf(l.pct_plan) + '%' : '—') + '</td>'
      + '<td>' + (inf ? sel(inf, inf) : '<span class="pt-sub">—</span>') + '</td><td title="' + esc((fc.motivos || []).join(' · ')) + '">' + sel(fc.cor, fc.cor) + (l.divergencia ? '<div class="pt-div" title="' + esc(l.divergencia.texto) + '">⚠ diverge</div>' : '') + '</td>'
      + '<td>' + hr + '</td><td>' + (l.proximo_marco ? esc(l.proximo_marco.nome) + '<div class="pt-sub">' + data(l.proximo_marco.fim) + '</div>' : '—') + '</td>'
      + '<td>' + brl(l.reais_risco) + '</td><td>' + (l.problemas_abertos ?? 0) + '</td><td style="color:' + (l.acoes_vencidas > 0 ? 'var(--red)' : 'inherit') + '">' + (l.acoes_vencidas ?? 0) + '</td>'
      + '<td>' + idade + '</td><td title="' + esc((l.pessoas || []).join(', ')) + '">' + (l.pessoas_alocadas ?? '—') + '</td></tr>'
      + (lac || (fc.motivos || []).length ? '<tr class="pt-mot"><td colspan="16">' + esc((fc.motivos || []).join(' · ')) + (lac ? ' <span class="pt-erro">Fonte com problema → ' + esc(lac) + '</span>' : '') + '</td></tr>' : '');
  }
  function pinta() {
    const b = $('ptApp'); if (!b) return;
    if (S.erro || !S.P) { b.innerHTML = '<div class="pt-erro" style="padding:18px">Não foi possível carregar o portfólio: ' + esc(S.erro || 'sem resposta') + ' <button onclick="PORTFOLIO.abrir(true)">Tentar de novo</button></div>'; return; }
    const P = S.P, R = P.resumo, F = Object.entries(P.fontes || {}).filter(([, v]) => !v.ok);
    let L = P.linhas; if (S.filtro !== 'todos') L = L.filter(l => (l.farol_calculado?.cor || 'cinza') === S.filtro);
    let h = '<div class="pt-top">' + ['verde', 'amarelo', 'vermelho', 'cinza'].map(c => '<div class="pt-c" style="border-color:' + COR[c] + '"><b style="color:' + COR[c] + '">' + R[c] + '</b><span>' + { verde: '● no prazo', amarelo: '▲ atenção', vermelho: '✖ crítico', cinza: '○ sem status' }[c] + '</span></div>').join('')
      + '<div class="pt-c"><b>' + R.dias_atraso + '</b><span>dias de atraso (soma)</span></div><div class="pt-c"><b>' + brl(R.reais_risco) + '</b><span>em risco</span></div><div class="pt-c"><b>' + R.acoes_vencidas + '</b><span>ações vencidas</span></div><div class="pt-c"><b>' + R.problemas_criticos + '</b><span>problemas críticos</span></div></div>';
    if (F.length) h += '<div class="pt-erro" style="margin:8px 0">Fontes com problema: ' + F.map(([k, v]) => '<b>' + esc(k) + '</b> (' + esc(v.erro) + ')').join(' · ') + '. Os campos afetados ficam cinza.</div>';
    const A = P.alertas || {}, al = [];
    (A.gerentes || []).forEach(g => al.push('Gerente <b>' + esc(g.gerente) + '</b> com ' + g.projetos + ' projetos (limite ' + g.limite + ')'));
    if (P.gestor) (A.pessoas || []).forEach(x => al.push('<b>' + esc(x.pessoa) + '</b> em ' + x.frentes + ' frentes (limite ' + x.limite + ')'));
    else if (A.pessoas_total) al.push(A.pessoas_total + ' pessoa(s) acima do limite de frentes — nomes só no perfil gestor');
    const dv = P.linhas.filter(l => l.divergencia).length; if (dv) al.push(dv + ' projeto(s) com farol informado diferente do calculado');
    if (al.length) h += '<div class="pt-al">' + al.map(x => '<div>⚠ ' + x + '</div>').join('') + '</div>';
    h += '<div class="pt-bar">' + ['todos', 'vermelho', 'amarelo', 'verde', 'cinza'].map(f => '<button class="' + (S.filtro === f ? 'on' : '') + '" onclick="PORTFOLIO.filtro(\'' + f + '\')">' + f + '</button>').join('') + '<button onclick="PORTFOLIO.abrir(true)">↻ Atualizar</button></div>';
    h += '<div class="pt-w"><table class="pt-t"><thead><tr><th>Projeto</th><th>Gerente</th><th>Tipo</th><th>Prometida</th><th>Previsão</th><th>Dias atraso</th><th>% real × plan.</th><th>Farol informado</th><th>Farol calculado</th><th>Horas real / prev.</th><th>Próximo marco</th><th>R$ em risco</th><th>Problemas</th><th>Ações venc.</th><th>Último status</th><th>Pessoas</th></tr></thead><tbody>'
      + (L.length ? L.map(linha).join('') : '<tr><td colspan="16" style="padding:18px;text-align:center;color:var(--t3)">Nenhum projeto neste filtro.</td></tr>') + '</tbody></table></div>';
    h += '<div class="pt-nota">Fonte: ' + esc(P.fonte) + '. Farol: relação % real ÷ % planejado (verde ≥ 100%, amarelo 85–99%, vermelho &lt; 85%), previsão até 5 dias úteis depois da prometida = amarelo, mais que isso = vermelho; marco vencido sem aceite = vermelho; sem status há mais de ' + esc(P.regras.dias_sem_status_cinza) + ' dias = cinza (sem dado, sem verde). Gerado em ' + new Date(P.gerado_em).toLocaleString('pt-BR') + '.</div>';
    b.innerHTML = h;
  }
  window.PORTFOLIO = { abrir, filtro: f => { S.filtro = f; pinta(); } };
})();
