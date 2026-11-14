// v3.510 — AÇÕES DO SISTEMA · kanban de ações propostas pela IA (análise de marketing e outras).
// Proposta → (aprovar) → Executando → Concluída / Falhou · Rejeitada. Aprovou = o próprio sistema executa (lista fechada de executores).
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const dt = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  async function api(action, payload = {}) {
    const r = await fetch('/api/s1-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'Demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (d.success === false || !r.ok) throw new Error(d.error || 'falha'); return d;
  }
  let L = [], CAT = [], filtro = '', ocupado = new Set();
  const COLS = [['proposta', 'Propostas', 'var(--gold)'], ['aprovada', 'Executando', 'var(--blue)'], ['concluida', 'Concluídas', 'var(--green)'], ['falhou', 'Falharam', 'var(--red)'], ['rejeitada', 'Rejeitadas', 'var(--t3)']];
  const colDe = a => a.status === 'executando' ? 'aprovada' : a.status;
  const ICO = { todo: '📝', oferta: '🎯', posts_rascunho: '📣' };

  async function abrir() { await carregar(); }
  async function carregar() {
    const box = $('acApp'); if (box && !L.length) box.innerHTML = '<div style="padding:40px;text-align:center;color:var(--t3);">Carregando…</div>';
    try { const d = await api('acoes_listar'); L = d.itens || []; CAT = d.catalogo || []; render(); }
    catch (e) { if (box) box.innerHTML = '<div style="color:var(--red);padding:20px;">Erro: ' + esc(e.message) + '</div>'; }
  }
  function detalhe(a) {
    const p = a.params || {};
    if (a.tipo === 'oferta') return '<div style="font-size:10.5px;color:var(--t2);margin-top:4px;">Nova oferta: “' + esc(p.texto) + '”</div>';
    if (a.tipo === 'posts_rascunho') return '<div style="font-size:10.5px;color:var(--t2);margin-top:4px;">' + esc(p.qtd) + ' rascunho(s) · tema: ' + esc(p.tema) + '</div>';
    return '<div style="font-size:10.5px;color:var(--t2);margin-top:4px;">' + (p.responsavel ? '👤 ' + esc(p.responsavel) + ' · ' : '') + (p.data ? '📅 ' + esc(p.data.split('-').reverse().join('/')) : '') + (p.notas ? '<br>' + esc(p.notas) : '') + '</div>';
  }
  function card(a) {
    const ex = CAT.find(c => c.tipo === a.tipo), busy = ocupado.has(a.id) || a.status === 'executando';
    const cor = a.impacto === 'Alto' ? 'var(--red)' : a.impacto === 'Baixo' ? 'var(--t3)' : 'var(--gold)';
    let btn = '';
    if (a.status === 'proposta') btn = '<button class="btn btn-p" style="font-size:10px;padding:3px 9px;" ' + (busy ? 'disabled' : '') + ' onclick="ACOES.decidir(\'' + a.id + '\',\'aprovar\')">' + (ex?.auto ? '✔ Aprovar e executar' : '✔ Aprovar → criar tarefa') + '</button><button class="btn btn-g" style="font-size:10px;padding:3px 9px;" onclick="ACOES.decidir(\'' + a.id + '\',\'rejeitar\')">✕</button>';
    else if (a.status === 'falhou') btn = '<button class="btn btn-p" style="font-size:10px;padding:3px 9px;" onclick="ACOES.decidir(\'' + a.id + '\',\'aprovar\')">↻ Tentar de novo</button><button class="btn btn-g" style="font-size:10px;padding:3px 9px;" onclick="ACOES.decidir(\'' + a.id + '\',\'rejeitar\')">✕</button>';
    else if (a.status === 'rejeitada') btn = '<button class="btn btn-g" style="font-size:10px;padding:3px 9px;" onclick="ACOES.decidir(\'' + a.id + '\',\'reabrir\')">↺ Reabrir</button>';
    const rod = a.status === 'concluida' ? '<div style="font-size:10px;color:var(--green);margin-top:5px;">✔ ' + esc(a.resultado?.resumo || 'Executada') + ' · ' + dt(a.concluida_em) + '</div>'
      : a.status === 'falhou' ? '<div style="font-size:10px;color:var(--red);margin-top:5px;">⚠ ' + esc(a.erro) + '</div>' : a.status === 'executando' ? '<div style="font-size:10px;color:var(--blue);margin-top:5px;">⏳ Executando…</div>' : '';
    return '<div style="background:var(--bg3);border:1px solid var(--bd);border-left:3px solid ' + cor + ';border-radius:8px;padding:9px 10px;margin-bottom:8px;">'
      + '<div style="font-size:11.5px;font-weight:700;line-height:1.35;">' + (ICO[a.tipo] || '•') + ' ' + esc(a.titulo) + '</div>'
      + (a.porque ? '<div style="font-size:10.5px;color:var(--t2);margin-top:3px;line-height:1.4;">' + esc(a.porque) + '</div>' : '') + detalhe(a)
      + '<div style="font-family:var(--M);font-size:8.5px;color:var(--t3);margin-top:5px;">' + esc(ex?.nome || a.tipo) + ' · impacto ' + esc(a.impacto) + ' · ' + esc((a.origem?.fonte || '').replace('analise_', 'análise de ')) + ' ' + dt(a.origem?.em || a.criado_em)
      + (a.origem?.historico_id ? ' · <a href="#" style="color:var(--blue);" onclick="ACOES.verAnalise(' + a.origem.historico_id + ');return false;">ver análise</a>' : '') + '</div>'
      + rod + (btn ? '<div style="display:flex;gap:6px;margin-top:7px;">' + btn + '</div>' : '') + '</div>';
  }
  function render() {
    const box = $('acApp'); if (!box) return; const q = filtro.toLowerCase();
    const V = L.filter(a => !q || (a.titulo + ' ' + a.porque + ' ' + a.tipo).toLowerCase().includes(q));
    const nProp = L.filter(a => a.status === 'proposta').length;
    box.innerHTML = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;"><input id="acBusca" placeholder="Buscar ação…" value="' + esc(filtro) + '" oninput="ACOES.filtrar(this.value)" style="background:var(--bg3);border:1px solid var(--bd);color:var(--t1);border-radius:6px;padding:5px 9px;font-size:11px;min-width:180px;">'
      + '<span style="font-size:10.5px;color:var(--t2);">' + nProp + ' aguardando sua decisão</span><span style="flex:1"></span>'
      + '<button class="btn btn-g" style="font-size:10px;" onclick="ACOES.nova()">+ Ação</button><button class="btn btn-g" style="font-size:10px;" onclick="ACOES.analise()">📣 Gerar da Análise de Marketing</button><button class="btn btn-g" style="font-size:10px;" onclick="ACOES.recarregar()">↻</button></div>'
      + '<div style="font-size:10.5px;color:var(--t3);margin-bottom:10px;line-height:1.5;">Aprovou, o sistema executa: <b>🎯 oferta da campanha</b> (troca o texto da oferta), <b>📣 rascunhos de posts</b> (nada é publicado sem você abrir no Metricool) e <b>📝 tarefas</b> (vão para o To-do). Anúncio pago e envio a leads nunca saem daqui.</div>'
      + '<div style="display:grid;grid-template-columns:repeat(5,minmax(190px,1fr));gap:10px;overflow-x:auto;align-items:start;">'
      + COLS.map(([k, nome, cor]) => { const it = V.filter(a => colDe(a) === k); return '<div style="background:var(--bg4);border:1px solid var(--bd);border-radius:10px;padding:8px;min-height:120px;"><div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:' + cor + ';margin-bottom:8px;font-weight:700;">' + nome + ' · ' + it.length + '</div>' + (it.map(card).join('') || '<div style="font-size:10.5px;color:var(--t3);text-align:center;padding:14px 0;">—</div>') + '</div>'; }).join('') + '</div>';
    const i = $('acBusca'); if (i && filtro) { i.focus(); i.setSelectionRange(filtro.length, filtro.length); }
  }
  async function decidir(id, decisao) {
    if (ocupado.has(id)) return; ocupado.add(id);
    const a = L.find(x => x.id === id); if (a && decisao === 'aprovar') { a.status = 'executando'; render(); }
    try { const d = await api('acoes_decidir', { id, decisao }); const i = L.findIndex(x => x.id === id); if (i >= 0) L[i] = d.item;
      if (decisao === 'aprovar') nota(d.item.status === 'concluida' ? '✔ ' + (d.item.resultado?.resumo || 'Executada') : '⚠ ' + (d.item.erro || 'Falhou'), d.item.status === 'concluida' ? 'success' : 'error'); }
    catch (e) { nota(e.message, 'error'); await carregar(); }
    finally { ocupado.delete(id); render(); }
  }
  function nova() {
    const t = prompt('Nova ação (vira uma proposta de tarefa no kanban). Descreva em uma frase:'); if (!t || !t.trim()) return;
    api('acoes_criar', { tipo: 'todo', titulo: t.trim().substring(0, 140), params: { texto: t.trim() } }).then(d => { L.unshift(d.item); render(); }).catch(e => nota(e.message, 'error'));
  }
  async function analise() {
    nota('Gerando a análise de marketing… (≈ 1 min)', 'info');
    try { const d = await api('analise_marketing', { contexto: {} }); nota((d.acoes_propostas || 0) + ' ação(ões) nova(s) no kanban'); await carregar(); } catch (e) { nota(e.message, 'error'); }
  }
  async function verAnalise(id) {
    try { const d = await api('historico_obter', { id }); const m = document.createElement('div'); m.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(5,6,12,.7);display:flex;align-items:center;justify-content:center;padding:16px;'; m.onclick = e => { if (e.target === m) m.remove(); };
      m.innerHTML = '<div class="panel" style="width:min(820px,100%);max-height:85vh;display:flex;flex-direction:column;"><div class="ph"><div class="pt">📣 Análise de marketing — ' + esc(dt(d.item?.criado_em)) + '</div><button class="btn btn-g" style="font-size:10px;" onclick="this.closest(\'div[style*=fixed]\').remove()">✕</button></div><div class="pb" id="acAnaliseBox" style="overflow:auto;"></div></div>';
      document.body.appendChild(m); renderMarketingPlan((d.item?.dados || {}).marketing, $('acAnaliseBox')); } catch (e) { nota(e.message, 'error'); }
  }
  window.ACOES = { abrir, decidir, nova, analise, verAnalise, recarregar: carregar, filtrar: v => { filtro = v; render(); } };
})();
