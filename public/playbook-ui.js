// v3.600 — PLAYBOOK 2027 · tela dentro de Marketing. O Playbook é o Norte: nasce do Plano Estratégico, guia o agente de marketing e o time de vendas
// e se ajusta sozinho com o que dá certo. Dados: api/s1-intel playbook_* (lib/playbook.js, lib/playbook-svc.js).
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const S = { d: null, sel: null, ocupado: false, aba: 'verticais' };
  const R = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
  const dt = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const ST_V = { hipotese: ['Hipótese', 'pb-st-h'], validada: ['Validada', 'pb-st-v'], pausada: ['Pausada', 'pb-st-p'] }, ST_A = { ativo: ['ativo', 'pb-st-v'], em_revisao: ['em revisão', 'pb-st-h'], pausado: ['pausado', 'pb-st-p'] };
  async function api(action, payload = {}) {
    const r = await fetch('/api/s1-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'Demorou demais — tente de novo' : 'HTTP ' + r.status }));
    if (d.success === false || !r.ok) throw new Error(d.error || 'falha'); return d;
  }
  async function abrir() { const box = $('pbApp'); if (!box) return; if (!S.d) box.innerHTML = '<div class="pb-vazio">Lendo o Playbook…</div>'; try { S.d = await api('playbook_obter', { dias: 3 }); if (!S.sel || !S.d.playbook.verticais.some(v => v.id === S.sel)) S.sel = S.d.playbook.verticais[0]?.id || null; render(); } catch (e) { box.innerHTML = '<div class="pb-vazio">Não consegui abrir o Playbook: ' + esc(e.message) + '</div>'; } }
  const perf = (d, id) => d.desempenho?.verticais?.[id] || { n: 0, leads: 0, decisores: 0, mult: 1 };
  const chip = (t, c) => `<span class="pb-chip ${c || ''}">${esc(t)}</span>`;
  function render() {
    const box = $('pbApp'); if (!box || !S.d) return; const d = S.d, pb = d.playbook, m = pb.metas || {}, sit = d.situacao, dp = d.desempenho, pesos = Object.fromEntries(d.pesos.map(p => [p.id, p]));
    const aprend = dp.media === null ? `Aprendizado começando: ${dp.campanhas} campanha(s) registrada(s); a partir de ${dp.minimo} ele passa a mexer nos pesos.` : `Aprendendo com ${dp.campanhas} campanhas: média de ${dp.media} ponto(s) por campanha.`;
    box.innerHTML = `<div class="pb-top"><div><h1>${esc(pb.nome)}</h1><p class="pb-tese">${esc(pb.tese)}</p></div>
      <div class="pb-acoes"><button class="pb-bt p" ${S.ocupado ? 'disabled' : ''} onclick="PLAYBOOK.gerar()">${S.ocupado ? 'Gerando… (até 2 min)' : 'Regenerar com IA'}</button><button class="pb-bt" onclick="PLAYBOOK.copiar()">Copiar texto</button></div></div>
      <div class="pb-faixa">${chip('Versão ' + pb.versao + ' · ' + pb.origem, '')}${sit.sem_plano ? chip('Sem plano estratégico vigente', 'amb') : sit.defasado ? chip('O plano mudou: texto defasado, regenere', 'amb') : chip('Sincronizado com ' + (sit.plano_nome || 'o plano') + (sit.plano_versao ? ' v' + sit.plano_versao : ''), 'ok')}<span class="pb-apr">${esc(aprend)}</span></div>
      ${sit.motivos.length ? `<div class="pb-aviso">${sit.motivos.map(esc).join(' ')}</div>` : ''}
      <div class="pb-metas">${[['Faturamento', R(m.faturamento)], ['Margem líquida', (m.margem_pct ?? '—') + '%'], ['Recorrente', (m.recorrente_pct ?? '—') + '%'], ['Leads por mês', m.leads_mes ?? '—'], ['Reuniões por mês', m.reunioes_mes ?? '—']].map(([a, b]) => `<div><b>${esc(b)}</b><small>${a}</small></div>`).join('')}</div>
      <div class="pb-abas">${[['verticais', 'Verticais'], ['proximas', 'Próximas campanhas'], ['funil', 'Funil e responsáveis'], ['regras', 'Regras e registro'], ['angulos', 'Biblioteca de ângulos'], ['versoes', 'Versões']].map(([k, n]) => `<button class="pb-aba${S.aba === k ? ' on' : ''}" onclick="PLAYBOOK.aba('${k}')">${n}</button>`).join('')}</div>
      <div class="pb-corpo">${S.aba === 'verticais' ? verticais(d, pb, pesos) : S.aba === 'proximas' ? proximas(d) : S.aba === 'funil' ? funil(pb) : S.aba === 'regras' ? regras(pb) : S.aba === 'angulos' ? angulos(d) : versoes(d)}</div>
      <div class="pb-pedir"><b>Pedir um ajuste ao ATLAS</b><p>Escreva o que mudou ou o que você quer testar (ex.: "dar mais peso a energia", "incluir a vertical saúde"). O Playbook é reescrito mantendo o que já foi aprendido.</p><textarea id="pbOri" rows="2" placeholder="Orientação para o Playbook…"></textarea><button class="pb-bt p" ${S.ocupado ? 'disabled' : ''} onclick="PLAYBOOK.gerar(true)">Reescrever com esta orientação</button></div>`;
  }
  function verticais(d, pb, pesos) {
    const v = pb.verticais.find(x => x.id === S.sel) || pb.verticais[0];
    return `<div class="pb-grid">${pb.verticais.map(x => { const p = perf(d, x.id), w = pesos[x.id] || { pct: 0 }, s = ST_V[x.status] || ST_V.hipotese;
      return `<button class="pb-card${x.id === S.sel ? ' on' : ''}${x.status === 'pausada' ? ' off' : ''}" onclick="PLAYBOOK.sel('${x.id}')"><div class="pb-ch"><b>${esc(x.nome)}</b>${chip(s[0], s[1])}</div><small>${esc(x.porte)}</small>
        <div class="pb-barra"><i style="width:${Math.min(100, w.pct * 2.2)}%"></i></div><div class="pb-lin"><span>${w.pct}% das campanhas</span><span>${p.n} camp. · ${p.leads} lead(s) · ${p.decisores} decisor(es)</span></div>${p.mult !== 1 ? `<div class="pb-mult">aprendizado ${p.mult}×${p.sem_retorno ? ' · sem retorno' : ''}</div>` : ''}${x.pendente_ia ? '<div class="pb-mult">detalhe da IA pendente</div>' : ''}</button>`; }).join('')}</div>
      ${v ? detalhe(d, v) : ''}`;
  }
  function detalhe(d, v) {
    const L = (t, a) => a && a.length ? `<div class="pb-bl"><h4>${t}</h4><ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
    return `<div class="pb-det"><div class="pb-dh"><h3>${esc(v.nome)}</h3><div class="pb-dacoes">${['hipotese', 'validada', 'pausada'].filter(s => s !== v.status).map(s => `<button class="pb-bt" onclick="PLAYBOOK.ajustar('vertical_status','${v.id}',null,'${s}')">${s === 'pausada' ? 'Pausar' : s === 'validada' ? 'Marcar validada' : 'Voltar a hipótese'}</button>`).join('')}</div></div>
      <p class="pb-por">${esc(v.por_que_agora)}</p><div class="pb-cols">${L('Quem decide', v.decisores)}${L('Dores', v.dores)}${L('Gatilhos', v.gatilhos)}${L('Evitar', v.evitar)}</div>
      <div class="pb-bl"><h4>Linguagem</h4><p>${esc(v.linguagem)}</p></div>
      <h4 class="pb-h4">Ângulos de comportamento nesta vertical</h4><div class="pb-angs">${v.angulos.map(a => { const da = d.desempenho?.angulos?.[v.id + '|' + a.angulo_id], s = ST_A[a.status] || ST_A.ativo;
        return `<div class="pb-ang${a.status === 'pausado' ? ' off' : ''}"><div class="pb-ah"><b>${esc(a.nome)}</b>${chip(s[0], s[1])}${da ? `<span class="pb-pf">${da.n} camp. · ${da.leads} lead(s) · ${da.mult}×</span>` : '<span class="pb-pf">ainda sem campanha</span>'}</div><p class="pb-g">${esc(a.gancho)}</p>${a.mensagem ? `<p>${esc(a.mensagem)}</p>` : ''}<small>${esc(a.hipotese)}</small>
          <div class="pb-aa">${a.status === 'pausado' ? `<button class="pb-lk" onclick="PLAYBOOK.ajustar('angulo_status','${v.id}','${a.id}','ativo')">Retomar</button>` : `<button class="pb-lk" onclick="PLAYBOOK.ajustar('angulo_status','${v.id}','${a.id}','pausado')">Pausar</button>`}${a.status === 'em_revisao' ? `<button class="pb-lk" onclick="PLAYBOOK.ajustar('angulo_status','${v.id}','${a.id}','ativo')">Devolver o peso</button>` : ''}</div></div>`; }).join('')}</div>
      ${v.objecoes.length ? `<h4 class="pb-h4">Objeções e respostas</h4>${v.objecoes.map(o => `<div class="pb-obj"><b>“${esc(o.objecao)}”</b><span>${esc(o.resposta)}</span></div>`).join('')}` : ''}</div>`;
  }
  const proximas = d => `<p class="pb-ex">Estes são os ângulos que o agente deve usar nos próximos dias (a escolha segue os pesos do plano e o aprendizado; cerca de 1 em 3 é teste).</p>${d.proximos.map(x => `<div class="pb-dia"><b>${x.data.split('-').reverse().join('/')}</b>${x.escolhas.map(e => `<div class="pb-pick"><span>${esc(e.vertical_nome)}</span><span>${esc(e.angulo_nome)}</span><small>${esc(e.motivo)}</small></div>`).join('') || '<small>Nenhuma vertical ativa.</small>'}</div>`).join('')}
    ${d.historico.length ? `<h4 class="pb-h4">Últimas campanhas registradas</h4>${d.historico.slice(0, 12).map(h => `<div class="pb-his"><span>${esc(String(h.data).split('-').reverse().join('/'))} ${esc(h.hora || '')}</span><span>${esc(h.vertical)} × ${esc(h.angulo)}${h.exploracao ? ' (teste)' : ''}</span></div>`).join('')}` : ''}`;
  const funil = pb => `<p class="pb-ex">Cada etapa da Floresta de Vendas tem um responsável virtual. Todos leem este Playbook antes de agir; nada sai sem a aprovação definida para o envio.</p>${pb.funil.map(f => `<div class="pb-fn"><div><b>${esc(f.nome)}</b><small>agente: ${esc(f.agente)}</small></div><div><p>${esc(f.objetivo)}</p><small>Saída: ${esc(f.saida)}</small></div></div>`).join('')}<h4 class="pb-h4">Canais</h4>${pb.canais.map(c => `<div class="pb-fn"><div><b>${esc(c.nome)}</b><small>${c.esforco}% do esforço</small></div><div><p>${esc(c.papel)}</p></div></div>`).join('')}
    <h4 class="pb-h4">Ofertas do plano (de onde vêm os pesos)</h4>${(pb.ofertas || []).map(o => `<div class="pb-fn"><div><b>${esc(o.nome)}</b><small>${o.peso_plano_pct}% da campanha</small></div><div><p>${esc(o.oferta)}</p><small>${esc(o.publico)}</small></div></div>`).join('') || '<small>Sem plano vigente.</small>'}`;
  const regras = pb => `<p class="pb-ex">As regras marcadas como automáticas se aplicam sozinhas a cada rodada diária e ficam registradas. Você pode desfazer qualquer uma.</p>${pb.regras.map(r => `<div class="pb-rg">${r.auto ? chip('automática', 'ok') : chip('alerta', 'amb')}<p>Se ${esc(r.se)}: ${esc(r.entao)}.</p></div>`).join('')}
    <h4 class="pb-h4">Registro de ajustes</h4>${(pb.log || []).slice().reverse().map(l => `<div class="pb-his"><span>${esc(dt(l.em))}</span><span>${esc(l.texto)}</span></div>`).join('') || '<small>Nenhum ajuste ainda.</small>'}
    <div class="pb-aa"><button class="pb-lk" onclick="PLAYBOOK.zerar()">Zerar o aprendizado</button></div>`;
  const angulos = d => `<p class="pb-ex">Os ângulos são as lentes de comportamento de compra B2B que o Playbook combina com cada vertical.</p>${d.angulos.map(a => `<div class="pb-fn"><div><b>${esc(a.nome)}</b></div><div><p>${esc(a.principio)}</p><small>${esc(a.formato)}</small></div></div>`).join('')}`;
  const versoes = d => d.versoes.length ? d.versoes.map(v => `<div class="pb-his"><span>Versão ${v.versao} · ${esc(dt(v.em))}</span><span>${esc(v.resumo)}</span><button class="pb-lk" onclick="PLAYBOOK.restaurar(${v.versao})">Voltar a esta</button></div>`).join('') : '<p class="pb-ex">Ainda não há versões anteriores.</p>';

  async function exec(fn, ok) { if (S.ocupado) return; S.ocupado = true; render(); try { const r = await fn(); S.d = { ...S.d, ...r }; if (ok) nota(ok); } catch (e) { nota(e.message, 'error'); } S.ocupado = false; render(); }
  window.PLAYBOOK = {
    abrir, aba: k => { S.aba = k; render(); }, sel: id => { S.sel = id; render(); },
    gerar: comOri => { const ori = comOri ? ($('pbOri')?.value || '').trim() : ''; if (comOri && ori.length < 8) return nota('Escreva a orientação (pelo menos uma frase)', 'error'); exec(() => api('playbook_gerar', { orientacao: ori }), 'Playbook reescrito'); },
    ajustar: (op, vertical, angulo, valor) => exec(() => api('playbook_ajustar', { op, vertical, angulo, valor }), 'Ajustado'),
    zerar: () => { if (confirm('Apagar o histórico de campanhas que alimenta o aprendizado? Os pesos voltam ao que o plano define.')) exec(() => api('playbook_ajustar', { op: 'zerar_aprendizado' }), 'Aprendizado zerado'); },
    restaurar: n => { if (confirm('Voltar o Playbook à versão ' + n + '? A versão atual fica guardada.')) exec(() => api('playbook_restaurar', { versao: n }), 'Versão restaurada'); },
    copiar: async () => { try { const r = await api('playbook_exportar'); await navigator.clipboard.writeText(r.markdown); nota('Playbook copiado'); } catch (e) { nota(e.message, 'error'); } },
  };
})();
