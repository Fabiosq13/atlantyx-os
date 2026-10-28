/* Atlantyx OS — v3.255 · CAMPANHAS DE MARKETING (visão única)
 * Campanha = período + objetivo + orçamento + metas + PLANO (Plano Estratégico vigente ou plano próprio) e várias AÇÕES
 * (campanha digital nas redes, anúncio, e-mail, WhatsApp, Atlantyx TV, webinar, evento…). Módulo sob demanda (cmpAbrir). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const R = v => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const N = v => v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const dt = d => d ? String(d).slice(8, 10) + '/' + String(d).slice(5, 7) + '/' + String(d).slice(2, 4) : '—';
  const card = (titulo, corpo, extra) => `<div class="panel" style="margin-bottom:12px;"><div class="ph"><div class="pt">${titulo}</div>${extra || ''}</div><div class="pb">${corpo}</div></div>`;
  const lbl = t => `<label class="fl">${t}</label>`;
  const COR = { planejada: 'var(--blue)', ativa: 'var(--green)', atribuicao: 'var(--gold)', encerrada: 'var(--t3)', fechada: 'var(--pu)' };
  const RITMO = { no_ritmo: ['No ritmo', 'var(--green)'], atencao: ['Atenção ao ritmo', 'var(--gold)'], atrasada: ['Atrasada', 'var(--red)'], nao_comecou: ['Ainda não começou', 'var(--t3)'] };
  let D = null, O = null, det = null, view = 'lista';
  async function api(action, body = {}) {
    const r = await fetch('/api/campanhas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status })); if (!d.success) throw new Error(d.error || 'falha'); return d;
  }
  const opcoes = async () => O || (O = await api('opcoes'));
  const pill = (txt, cor) => `<span style="display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:10px;border:1px solid ${cor};color:${cor};white-space:nowrap;">${esc(txt)}</span>`;
  const barra = (pct, cor) => `<div style="height:7px;background:var(--bg3);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${Math.max(0, Math.min(100, pct || 0))}%;background:${cor};"></div></div>`;
  const planoTxt = p => !p ? '<span style="color:var(--red);">sem plano</span>' : p.tipo === 'estrategico' ? `Plano Estratégico${p.versao ? ' v' + esc(p.versao) : ''}${p.briefing?.linhas ? ' · ' + esc(p.briefing.linhas) : ''}` : 'Plano próprio · ' + esc(p.objetivo || '');

  function abrir() { if (!$('cmpApp')) return; view = 'lista'; carregar(); }
  async function carregar() { const box = $('cmpApp'); if (!box) return; if (!D) box.innerHTML = '<div style="color:var(--t3);font-size:11px;padding:30px;text-align:center;">Carregando as campanhas…</div>';
    try { D = await api('inicio'); if (view === 'detalhe' && det) await abrirCampanha(det.campanha.id, true); else rLista(); } catch (e) { box.innerHTML = `<div style="color:var(--red);font-size:12px;padding:14px;">${esc(e.message)}</div>`; } }

  // ── lista ──
  function rLista() {
    view = 'lista'; const L = D.campanhas || [];
    const topo = `<div class="panel" style="margin-bottom:12px;"><div class="pb" style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
      <div style="flex:1;min-width:260px;"><div style="font-family:var(--H);font-size:16px;font-weight:700;">🎯 Campanhas de Marketing</div>
        <div style="font-size:11px;color:var(--t2);margin-top:3px;line-height:1.6;">Uma campanha reúne várias ações — redes sociais, anúncios, e-mail, WhatsApp, Atlantyx TV, webinar, eventos — <b>ligadas a um plano</b> (o Plano Estratégico ou um plano próprio), com <b>visão única do resultado</b>: investimento, leads, reuniões, propostas, negócios, CAC e retorno.</div></div>
      <button class="btn btn-p" onclick="CMP.editar()">＋ Nova campanha</button></div></div>`;
    const aviso = D.plano_vigente ? '' : `<div style="background:rgba(255,181,71,.1);border:1px solid rgba(255,181,71,.4);border-radius:8px;padding:9px 12px;font-size:11.5px;margin-bottom:12px;">Não há Plano Estratégico aprovado. Você pode criar campanhas com <b>plano próprio</b>, ou aprovar o plano em Planejamento → Plano Estratégico para ligar as campanhas às linhas de negócio.</div>`;
    const cards = L.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;">${L.map(c => { const T = c.totais || {}, st = c.status, m = c.metas || {}, rt = c.ritmo && RITMO[c.ritmo.situacao];
      return `<div class="panel" style="cursor:pointer;margin:0;" onclick="CMP.abrir('${esc(c.id)}')"><div class="pb">
        <div style="display:flex;gap:8px;align-items:flex-start;"><div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:14px;">${esc(c.nome)}</div><div style="font-size:10.5px;color:var(--t3);margin-top:2px;">${dt(c.inicio)} a ${dt(c.fim)} · ${c.n_acoes} aç${c.n_acoes === 1 ? 'ão' : 'ões'} ${c.tipos.map(t => (D.tipos[t] || {}).icone || '').join(' ')}</div></div>${pill(D.status_nome[st] || st, COR[st])}</div>
        <div style="font-size:10.5px;color:var(--t2);margin:6px 0 10px;">${planoTxt(c.plano)}</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:10px;color:var(--t3);">
          <div>Investido<div style="font-size:13px;font-weight:700;color:var(--t1);">${R(T.investimento)}</div>${c.orcamento ? 'de ' + R(c.orcamento) : ''}</div>
          <div>Leads<div style="font-size:13px;font-weight:700;color:var(--t1);">${N(T.leads)}</div>${m.leads ? 'meta ' + N(m.leads) : ''}</div>
          <div>Negócios<div style="font-size:13px;font-weight:700;color:var(--t1);">${N(T.negocios)}</div>${m.negocios ? 'meta ' + N(m.negocios) : ''}</div>
          <div>Receita<div style="font-size:13px;font-weight:700;color:var(--t1);">${R(T.receita)}</div>${T.roi_pct != null ? 'ROI ' + N(T.roi_pct) + '%' : ''}</div></div>
        ${rt ? `<div style="margin-top:9px;">${pill(rt[0], rt[1])} <span style="font-size:10px;color:var(--t3);">${N(c.ritmo.leads_pct)}% da meta de leads em ${N(c.ritmo.tempo_pct)}% do período</span></div>` : ''}</div></div>`; }).join('')}</div>`
      : card('Nenhuma campanha ainda', `<div style="font-size:12px;color:var(--t2);line-height:1.7;">Crie a primeira: dê nome e período, ligue a um plano e depois adicione as ações. As campanhas digitais e os disparos que você já tem podem entrar como ações.</div>`);
    $('cmpApp').innerHTML = topo + aviso + cards;
  }

  // ── detalhe ──
  async function abrirCampanha(id, silencioso) {
    if (!silencioso) $('cmpApp').innerHTML = '<div style="color:var(--t3);font-size:11px;padding:30px;text-align:center;">Somando os resultados…</div>';
    try { det = await api('detalhe', { id }); view = 'detalhe'; rDetalhe(); } catch (e) { nota(e.message, 'error'); rLista(); }
  }
  function rDetalhe() {
    const c = det.campanha, r = det.resultado, T = r.totais, st = r.status, TP = D.tipos, rt = r.ritmo && RITMO[r.ritmo.situacao];
    const cab = `<div class="panel" style="margin-bottom:12px;"><div class="pb">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><button class="btn btn-g" onclick="CMP.voltar()">← Campanhas</button>
        <div style="flex:1;min-width:220px;"><div style="font-family:var(--H);font-size:16px;font-weight:700;">${esc(c.nome)} ${pill(D.status_nome[st] || st, COR[st])}</div>
          <div style="font-size:11px;color:var(--t2);margin-top:3px;">${dt(c.inicio)} a ${dt(c.fim)} · resultados contados até ${c.janela_dias} dias depois do fim · etiqueta <code>${esc(c.utm)}</code>${c.objetivo ? ' · ' + esc(c.objetivo) : ''}</div></div>
        <button class="btn btn-g" onclick="CMP.editar('${esc(c.id)}')">✎ Editar</button><button class="btn btn-p" onclick="CMP.acao()">＋ Ação</button>
        <button class="btn btn-g" onclick="CMP.ajustes()">± Ajustes manuais</button>
        ${c.fechamento ? `<button class="btn btn-g" onclick="CMP.reabrir()">↩ Reabrir</button>` : `<button class="btn btn-g" onclick="CMP.fechar(this)">🏁 Fechar com relatório</button>`}
        <button class="btn btn-g" style="color:var(--red);" onclick="CMP.excluir()">Excluir</button></div></div></div>`;
    const nomeMeta = { leads: 'Leads', reunioes: 'Reuniões', propostas: 'Propostas', negocios: 'Negócios ganhos', receita: 'Receita', investimento: 'Investimento × orçamento' };
    const metas = card('Metas × realizado' + (rt ? ' &nbsp;' + pill(rt[0], rt[1]) : ''), `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px 18px;">${r.metas.map(m => { const din = m.k === 'receita' || m.k === 'investimento', cor = m.k === 'investimento' ? (m.pct > 100 ? 'var(--red)' : 'var(--blue)') : m.pct >= 100 ? 'var(--green)' : 'var(--blue)';
      return `<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span style="color:var(--t2);">${nomeMeta[m.k]}</span><span><b>${din ? R(m.real) : N(m.real)}</b>${m.meta != null ? ' <span style="color:var(--t3);">/ ' + (din ? R(m.meta) : N(m.meta)) + '</span>' : ' <span style="color:var(--t3);">sem meta</span>'}</span></div>${barra(m.pct, cor)}</div>`; }).join('')}</div>
      ${r.ritmo ? `<div style="font-size:10.5px;color:var(--t3);margin-top:10px;">${N(r.ritmo.leads_pct)}% da meta de leads com ${N(r.ritmo.tempo_pct)}% do período decorrido.</div>` : ''}`);
    const kpi = (t, v, s) => `<div style="background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:10px 12px;"><div style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;">${t}</div><div style="font-size:17px;font-weight:700;margin-top:3px;">${v}</div>${s ? `<div style="font-size:10px;color:var(--t3);margin-top:2px;">${s}</div>` : ''}</div>`;
    const kpis = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;">${kpi('Investimento', R(T.investimento), T.investimento_estimado ? 'inclui custo previsto' : '')}${kpi('Custo por lead', R(T.cpl))}${kpi('CAC', R(T.cac), 'investimento ÷ negócios')}${kpi('Retorno (ROI)', T.roi_pct == null ? '—' : N(T.roi_pct) + '%', 'receita − investimento')}${kpi('Lead → reunião', T.conv_lead_reuniao == null ? '—' : N(T.conv_lead_reuniao) + '%')}${kpi('Reunião → proposta', T.conv_reuniao_proposta == null ? '—' : N(T.conv_reuniao_proposta) + '%')}${kpi('Proposta → negócio', T.conv_fechamento == null ? '—' : N(T.conv_fechamento) + '%')}</div>`;
    const etapas = [['Alcance', T.alcance], ['Cliques', T.cliques], ['Leads', T.leads], ['Reuniões', T.reunioes], ['Propostas', T.propostas], ['Negócios', T.negocios]], mx = Math.max(1, ...etapas.map(e => e[1] || 0));
    const funil = card('Funil da campanha', etapas.map(([n, v], i) => `<div style="display:grid;grid-template-columns:90px 1fr 70px;gap:10px;align-items:center;margin-bottom:6px;font-size:11.5px;"><span style="color:var(--t2);">${n}</span><div style="height:16px;border-radius:4px;background:var(--bg3);overflow:hidden;"><div style="height:100%;width:${Math.max(v ? 1.5 : 0, (v || 0) / mx * 100)}%;background:linear-gradient(90deg,#00C2E4,#00FCA8);opacity:${1 - i * .08};"></div></div><b style="text-align:right;">${N(v)}</b></div>`).join('')
      + `<div style="font-size:10.5px;color:var(--t3);margin-top:6px;">Alcance e cliques somam envios, visitas da página de captura e números lançados à mão. Reuniões, propostas e negócios vêm do lead e do negócio no HubSpot${c.ajustes && Object.values(c.ajustes).some(v => v) ? ', mais os ajustes manuais' : ''}.</div>`);
    const rk = r.ranking;
    const linhas = r.acoes.map(a => { const t = TP[a.tipo] || {}, pos = rk.indexOf(a.id), med = pos === 0 ? '🥇' : pos === 1 ? '🥈' : pos === 2 ? '🥉' : '';
      return `<tr style="border-top:1px solid var(--bd);"><td style="padding:7px 4px;">${t.icone || ''}</td><td style="padding:7px 4px;min-width:180px;"><b>${esc(a.nome)}</b> ${med}<div style="font-size:10px;color:var(--t3);">${esc(t.nome || a.tipo)}${a.ref?.nome ? ' · ' + esc(a.ref.nome) : ''}</div></td>
        <td style="padding:7px 4px;text-align:right;white-space:nowrap;">${R(a.custo)}${a.custo_estimado ? '<div style="font-size:9.5px;color:var(--gold);">previsto</div>' : ''}</td><td style="padding:7px 4px;text-align:right;">${N(a.alcance)}</td><td style="padding:7px 4px;text-align:right;">${N(a.cliques)}</td>
        <td style="padding:7px 4px;text-align:right;"><b>${N(a.leads)}</b></td><td style="padding:7px 4px;text-align:right;">${N(a.reunioes)}</td><td style="padding:7px 4px;text-align:right;">${N(a.negocios)}</td><td style="padding:7px 4px;text-align:right;">${R(a.receita)}</td><td style="padding:7px 4px;text-align:right;">${R(a.cpl)}</td>
        <td style="padding:7px 4px;white-space:nowrap;text-align:right;"><button class="btn btn-g" style="padding:3px 7px;font-size:10.5px;" onclick="CMP.links('${esc(a.id)}')">🔗 Links</button> <button class="btn btn-g" style="padding:3px 7px;font-size:10.5px;" onclick="CMP.acao('${esc(a.id)}')">✎</button> <button class="btn btn-g" style="padding:3px 7px;font-size:10.5px;color:var(--red);" onclick="CMP.acaoExcluir('${esc(a.id)}')">✕</button></td></tr>`; }).join('');
    const semAcao = r.sem_acao.leads || r.sem_acao.cliques ? `<tr style="border-top:1px solid var(--bd);color:var(--t2);"><td></td><td style="padding:7px 4px;">Link geral da campanha<div style="font-size:10px;color:var(--t3);">leads com a etiqueta da campanha sem ação definida</div></td><td></td><td></td><td style="padding:7px 4px;text-align:right;">${N(r.sem_acao.cliques)}</td><td style="padding:7px 4px;text-align:right;">${N(r.sem_acao.leads)}</td><td></td><td style="padding:7px 4px;text-align:right;">${N(r.sem_acao.negocios)}</td><td style="padding:7px 4px;text-align:right;">${R(r.sem_acao.receita)}</td><td></td><td></td></tr>` : '';
    const th = t => `<th style="padding:6px 4px;font-size:9.5px;text-transform:uppercase;color:var(--t3);text-align:right;font-weight:600;">${t}</th>`;
    const acoes = card(`Ações da campanha <span style="font-weight:400;color:var(--t3);font-size:11px;">(${r.acoes.length})</span>`, r.acoes.length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;"><thead><tr><th></th><th style="padding:6px 4px;font-size:9.5px;text-transform:uppercase;color:var(--t3);text-align:left;font-weight:600;">Ação</th>${['Custo', 'Alcance', 'Cliques', 'Leads', 'Reuniões', 'Negócios', 'Receita', 'Custo/lead'].map(th).join('')}<th></th></tr></thead><tbody>${linhas}${semAcao}</tbody></table></div>
      <div style="font-size:10.5px;color:var(--t3);margin-top:8px;">🥇🥈🥉 = ações com o lead mais barato. Link geral da campanha: <code style="user-select:all;">${esc(det.link_geral.captura)}</code></div>`
      : `<div style="font-size:12px;color:var(--t2);">Nenhuma ação ainda. <button class="btn btn-p" onclick="CMP.acao()">＋ Adicionar a primeira ação</button></div>`);
    const p = c.plano || {}, B = p.briefing || p;
    const plano = card('Plano da campanha', `<div style="font-size:11.5px;color:var(--t2);margin-bottom:8px;">${planoTxt(p)}</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 16px;font-size:11.5px;line-height:1.5;">
      ${[['Objetivo', p.objetivo], ['Público', B.publico], ['Oferta', B.oferta], ['Dor', B.dor], ['Prova', B.prova], ['Mensagem', p.mensagem]].filter(x => x[1]).map(([k, v]) => `<div><div style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;">${k}</div>${esc(v)}</div>`).join('')}</div>${p.racional ? `<div style="font-size:11.5px;color:var(--t2);margin-top:10px;line-height:1.6;">${esc(p.racional)}</div>` : ''}`);
    const fech = c.fechamento ? card(`🏁 Relatório de fechamento <span style="font-weight:400;color:var(--t3);font-size:11px;">${dt(c.fechamento.em.slice(0, 10))}</span>`, `<div style="font-size:12px;line-height:1.7;">${md(c.fechamento.texto)}</div>`) : '';
    $('cmpApp').innerHTML = cab + fech + metas + kpis + funil + acoes + plano;
  }
  function md(t) { return esc(t).replace(/^### (.*)$/gm, '<div style="font-weight:700;margin-top:8px;">$1</div>').replace(/^## (.*)$/gm, '<div style="font-weight:700;font-size:13px;margin-top:12px;">$1</div>').replace(/^# (.*)$/gm, '<div style="font-weight:700;font-size:14px;margin-top:12px;">$1</div>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^[-*] (.*)$/gm, '<div style="padding-left:12px;">• $1</div>').replace(/\n{2,}/g, '<br>').replace(/\n/g, '<br>'); }

  // ── modal ──
  function modal(titulo, corpo, botoes) { let m = $('cmpModal'); if (m) m.remove(); m = document.createElement('div'); m.id = 'cmpModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding:30px 12px;overflow:auto;';
    m.innerHTML = `<div class="panel" style="width:100%;max-width:760px;margin:0;"><div class="ph"><div class="pt">${titulo}</div><button class="btn btn-g" onclick="CMP.fecharModal()">✕</button></div><div class="pb">${corpo}<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" id="cmpBtns">${botoes}</div></div></div>`;
    m.addEventListener('click', e => { if (e.target === m) m.remove(); }); document.body.appendChild(m); }
  const fecharModal = () => { const m = $('cmpModal'); if (m) m.remove(); };
  const val = id => ($(id) || {}).value || '';

  // campanha (nova ou editar) — o PLANO é obrigatório
  let rasc = null;
  async function editar(id) {
    try { await opcoes(); } catch (e) { return nota(e.message, 'error'); }
    const c = id ? det?.campanha : null; const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), f30 = new Date(Date.now() + 30 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    rasc = { id: c?.id || null, plano: c?.plano ? JSON.parse(JSON.stringify(c.plano)) : { tipo: O.plano ? 'estrategico' : 'proprio', alavancas: [] } };
    const M = c?.metas || {};
    modal(c ? 'Editar campanha' : 'Nova campanha', `
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;"><div>${lbl('Nome')}<input class="fi" id="cN" maxlength="90" value="${esc(c?.nome || '')}" placeholder="Ex.: Lançamento Maestro · fim de ano"></div><div>${lbl('Início')}<input class="fi" type="date" id="cI" value="${esc(c?.inicio || hoje)}"></div><div>${lbl('Fim')}<input class="fi" type="date" id="cF" value="${esc(c?.fim || f30)}"></div></div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-top:6px;"><div>${lbl('Objetivo em uma frase')}<input class="fi" id="cO" maxlength="200" value="${esc(c?.objetivo || '')}" placeholder="Ex.: 20 reuniões com diretores de PMO"></div><div>${lbl('Orçamento (R$)')}<input class="fi" type="number" min="0" id="cB" value="${c?.orcamento ?? ''}"></div><div>${lbl('Contar resultados até (dias após o fim)')}<input class="fi" type="number" min="0" max="180" id="cJ" value="${c?.janela_dias ?? 60}"></div></div>
      <div style="margin-top:14px;font-weight:700;font-size:12.5px;">Plano da campanha <span style="color:var(--red);">*</span></div>
      <div style="display:flex;gap:14px;margin:6px 0 8px;font-size:12px;flex-wrap:wrap;">
        <label style="display:flex;gap:6px;align-items:center;${O.plano ? '' : 'opacity:.5;'}"><input type="radio" name="cPT" value="estrategico" ${rasc.plano.tipo === 'estrategico' ? 'checked' : ''} ${O.plano ? '' : 'disabled'} onchange="CMP._pt(this.value)"> Ligar ao Plano Estratégico vigente ${O.plano ? '(v' + esc(O.plano.versao) + ' · ' + esc(O.plano.nome) + ')' : '(nenhum aprovado)'}</label>
        <label style="display:flex;gap:6px;align-items:center;"><input type="radio" name="cPT" value="proprio" ${rasc.plano.tipo === 'proprio' ? 'checked' : ''} onchange="CMP._pt(this.value)"> Criar um plano próprio agora</label></div>
      <div id="cPlano"></div>
      <div style="margin-top:14px;font-weight:700;font-size:12.5px;">Metas da campanha</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">${[['leads', 'Leads'], ['reunioes', 'Reuniões'], ['propostas', 'Propostas'], ['negocios', 'Negócios'], ['receita', 'Receita (R$)']].map(([k, t]) => `<div>${lbl(t)}<input class="fi" type="number" min="0" id="cM_${k}" value="${M[k] ?? ''}"></div>`).join('')}</div>
      <div id="cMetaInfo" style="font-size:10.5px;color:var(--t3);margin-top:5px;"></div>`,
      `<button class="btn btn-g" onclick="CMP.fecharModal()">Cancelar</button><button class="btn btn-p" onclick="CMP._salvar(this)">💾 Salvar campanha</button>`);
    rPlano();
  }
  function rPlano() {
    const box = $('cPlano'); if (!box) return; const p = rasc.plano;
    if (p.tipo === 'estrategico') {
      const sel = new Set(p.alavancas || []);
      box.innerHTML = `<div style="font-size:11px;color:var(--t2);margin-bottom:6px;">Escolha as linhas de negócio que esta campanha empurra. A oferta, o público, a dor e a prova de cada linha viram o briefing das ações, e as metas saem do funil do plano no período da campanha.</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;">${O.plano.alavancas.map(a => `<label style="display:flex;gap:7px;align-items:flex-start;border:1px solid var(--bd);border-radius:8px;padding:7px 9px;font-size:11.5px;cursor:pointer;" title="${esc([a.oferta, a.publico].filter(Boolean).join(' · '))}"><input type="checkbox" class="cAl" value="${esc(a.id)}" ${sel.has(a.id) ? 'checked' : ''} style="margin-top:2px;" onchange="CMP._al()"><span><b>${esc(a.nome)}</b><div style="font-size:10px;color:var(--t3);">${a.leads ? N(a.leads) + ' leads/ano · ' : ''}${a.contratos ? N(a.contratos) + ' contratos/ano' : ''}${a.peso_campanha ? ' · peso ' + N(a.peso_campanha) : ''}</div></span></label>`).join('')}</div>
        <div style="margin-top:8px;"><button class="btn btn-g" onclick="CMP._metas(this)">📐 Calcular metas pelo plano</button></div><div id="cBrief" style="font-size:11px;color:var(--t2);margin-top:8px;line-height:1.6;"></div>`;
    } else {
      const f = (k, t, ph, area) => `<div>${lbl(t)}${area ? `<textarea class="fta" id="cP_${k}" style="min-height:52px;" placeholder="${esc(ph)}">${esc(p[k] || '')}</textarea>` : `<input class="fi" id="cP_${k}" maxlength="400" placeholder="${esc(ph)}" value="${esc(p[k] || '')}">`}</div>`;
      box.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${f('objetivo', 'Objetivo do plano *', 'O que a campanha precisa conseguir')}${f('publico', 'Público *', 'Cargos e tipo de empresa')}${f('oferta', 'Oferta *', 'O que a pessoa ganha ao responder')}${f('dor', 'Dor', 'O problema que a campanha toca')}${f('prova', 'Prova', 'Por que acreditar na Atlantyx')}${f('mensagem', 'Mensagem central', 'Uma frase')}</div>
        ${f('racional', 'Por que esta campanha, por que agora', 'Racional do plano', true)}
        <div style="margin-top:8px;"><button class="btn btn-g" onclick="CMP._ia(this)">✨ IA sugere o plano</button> <span style="font-size:10.5px;color:var(--t3);">parte do nome, do objetivo e do que você já escreveu</span></div><div id="cIaAc" style="font-size:11px;color:var(--t2);margin-top:8px;"></div>`;
    }
  }
  function lerPlano() { const p = rasc.plano;
    if (p.tipo === 'estrategico') p.alavancas = [...document.querySelectorAll('.cAl:checked')].map(x => x.value);
    else ['objetivo', 'publico', 'oferta', 'dor', 'prova', 'mensagem', 'racional'].forEach(k => { const el = $('cP_' + k); if (el) p[k] = el.value; }); return p; }
  function pt(v) { lerPlano(); rasc.plano = v === 'estrategico' ? { tipo: 'estrategico', alavancas: rasc.plano.alavancas || [] } : { ...rasc.plano, tipo: 'proprio' }; rPlano(); }
  async function metasPlano(b) { const p = lerPlano(); if (!p.alavancas.length) return nota('Escolha pelo menos uma linha', 'error'); b.disabled = true;
    try { const r = await api('metas_sugerir', { alavancas: p.alavancas, inicio: val('cI'), fim: val('cF') }); const m = r.metas;
      ['leads', 'reunioes', 'propostas', 'negocios', 'receita'].forEach(k => { const el = $('cM_' + k); if (el) el.value = m[k]; }); if (!val('cB') && m.investimento) $('cB').value = m.investimento;
      $('cMetaInfo').textContent = `Funil do Plano Estratégico dessas linhas × ${m.dias} dias (${N(m.fator * 100)}% do ano). Orçamento sugerido pela mídia do plano: ${R(m.investimento)}. Ajuste à vontade.`;
      const B = r.briefing; $('cBrief').innerHTML = [['Oferta', B.oferta], ['Público', B.publico], ['Dor', B.dor], ['Prova', B.prova]].filter(x => x[1]).map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join('<br>');
    } catch (e) { nota(e.message, 'error'); } b.disabled = false; }
  async function ia(b) { lerPlano(); b.disabled = true; b.textContent = '⏳ Escrevendo o plano…';
    try { const r = await api('plano_sugerir', { campanha: { nome: val('cN'), objetivo: val('cO'), inicio: val('cI'), fim: val('cF'), orcamento: val('cB'), plano: rasc.plano } });
      rasc.plano = { ...r.plano }; rPlano(); if (r.metas) ['leads', 'reunioes', 'propostas', 'negocios'].forEach(k => { const el = $('cM_' + k); if (el && !el.value && r.metas[k]) el.value = r.metas[k]; });
      const box = $('cIaAc'); if (box && r.acoes_sugeridas?.length) box.innerHTML = '<b>Ações sugeridas</b> (adicione depois de salvar):<br>' + r.acoes_sugeridas.map(a => '• ' + esc((O.tipos[a.tipo] || {}).nome || a.tipo) + ' — ' + esc(a.nome) + (a.por_que ? ' <span style="color:var(--t3);">(' + esc(a.por_que) + ')</span>' : '')).join('<br>');
      nota('Plano sugerido — revise antes de salvar'); } catch (e) { nota(e.message, 'error'); } b.disabled = false; b.textContent = '✨ IA sugere o plano'; }
  async function salvarCamp(b) { const p = lerPlano(); b.disabled = true;
    const campanha = { id: rasc.id, nome: val('cN'), objetivo: val('cO'), inicio: val('cI'), fim: val('cF'), orcamento: val('cB'), janela_dias: val('cJ'), plano: p,
      metas: Object.fromEntries(['leads', 'reunioes', 'propostas', 'negocios', 'receita'].map(k => [k, val('cM_' + k)])) };
    try { const r = await api('salvar', { campanha }); fecharModal(); nota('Campanha salva'); D = await api('inicio'); await abrirCampanha(r.campanha.id); } catch (e) { nota(e.message, 'error'); b.disabled = false; } }

  // ação
  async function acao(id) {
    try { await opcoes(); } catch (e) { return nota(e.message, 'error'); }
    const c = det.campanha, a = id ? c.acoes.find(x => x.id === id) : null, m = a?.manual || {};
    modal(a ? 'Editar ação' : 'Nova ação na campanha', `
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;"><div>${lbl('Tipo')}<select class="fi" id="aT" onchange="CMP._tipo()">${Object.entries(O.tipos).map(([k, t]) => `<option value="${k}" ${a?.tipo === k ? 'selected' : ''}>${t.icone} ${esc(t.nome)}</option>`).join('')}</select></div>
        <div>${lbl('Nome da ação')}<input class="fi" id="aN" maxlength="90" value="${esc(a?.nome || '')}" placeholder="Ex.: Sequência de 3 e-mails para CIOs"></div></div>
      <div id="aRef" style="margin-top:6px;"></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px;"><div>${lbl('Início')}<input class="fi" type="date" id="aI" value="${esc(a?.inicio || '')}"></div><div>${lbl('Fim')}<input class="fi" type="date" id="aF" value="${esc(a?.fim || '')}"></div><div>${lbl('Custo previsto (R$)')}<input class="fi" type="number" min="0" id="aCP" value="${a?.custo_previsto ?? ''}"></div><div>${lbl('Custo real (R$)')}<input class="fi" type="number" min="0" id="aCR" value="${a?.custo_real ?? ''}"></div></div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:6px;"><div>${lbl('Responsável')}<input class="fi" id="aR" maxlength="60" value="${esc(a?.responsavel || '')}"></div><div>${lbl('Observação')}<input class="fi" id="aO" maxlength="600" value="${esc(a?.obs || '')}"></div></div>
      <div style="margin-top:12px;font-weight:700;font-size:12px;">Números lançados à mão <span style="font-weight:400;color:var(--t3);font-size:10.5px;">— para o que o sistema não mede sozinho (audiência da TV, público do evento, resultado do anúncio). Somam aos números automáticos.</span></div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">${[['alcance', 'Alcance'], ['cliques', 'Cliques'], ['leads', 'Leads'], ['reunioes', 'Reuniões'], ['propostas', 'Propostas'], ['negocios', 'Negócios'], ['receita', 'Receita R$']].map(([k, t]) => `<div>${lbl(t)}<input class="fi" type="number" min="0" id="aM_${k}" value="${m[k] ?? ''}"></div>`).join('')}</div>`,
      `<button class="btn btn-g" onclick="CMP.fecharModal()">Cancelar</button><button class="btn btn-p" onclick="CMP._acaoSalvar(this,'${esc(a?.id || '')}')">💾 Salvar ação</button>`);
    tipo(a?.ref?.id);
  }
  function tipo(refId) {
    const t = val('aT'), box = $('aRef'), info = (O.tipos[t] || {}).auto;
    const L = t === 'digital' ? O.digitais.map(x => ({ id: x.id, nome: x.nome + (x.canal ? ' · ' + x.canal : '') })) : t === 'email' || t === 'whatsapp' ? O.disparos.filter(x => !x.canal || x.canal === t || (t === 'email' && /mail/i.test(x.canal)) || (t === 'whatsapp' && /whats|wa/i.test(x.canal))).map(x => ({ id: x.id, nome: (x.nome || x.id) + ' · ' + (x.total || 0) + ' destinatários' }))
      : t === 'webinar' ? O.webinars.map(x => ({ id: x.id, nome: x.nome + (x.inicio ? ' · ' + dt(String(x.inicio).slice(0, 10)) : '') })) : t === 'tv' ? O.tv.map(x => ({ id: x.id, nome: x.nome + ' (' + x.tipo + ')' })) : null;
    const dica = { digital: 'Escolha uma campanha criada em Campanha Digital — os leads com a etiqueta dela contam aqui.', email: 'Escolha o disparo de e-mail — envios, aberturas e cliques contam aqui.', whatsapp: 'Escolha o disparo de WhatsApp — envios e cliques contam aqui.', anuncio: 'Crie o anúncio PAUSADO na tela Ads + SEO e ative quando quiser; aqui você lança custo e resultado. Use o link da ação no anúncio para os leads contarem.', tv: 'Use o link/QR da ação no vídeo ou no plantão; a audiência você lança à mão.', webinar: 'Use o link da ação no convite; a audiência você lança à mão.', evento: 'Use o link/QR da ação no material do evento; o público você lança à mão.', outro: '' }[t] || '';
    box.innerHTML = (L ? `${lbl('Ligar a')}<select class="fi" id="aRefSel" onchange="CMP._ref()"><option value="">— nenhum —</option>${L.map(x => `<option value="${esc(x.id)}" ${refId === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>` : '')
      + `<div style="font-size:10.5px;color:var(--t3);margin-top:4px;">${esc(dica || (info ? info + '.' : ''))}</div>`;
  }
  function ref() { const s = $('aRefSel'); if (s && s.value && !val('aN')) $('aN').value = s.options[s.selectedIndex].text.split(' · ')[0]; }
  async function acaoSalvar(b, id) { b.disabled = true; const s = $('aRefSel');
    const acao = { id: id || null, tipo: val('aT'), nome: val('aN'), inicio: val('aI'), fim: val('aF'), custo_previsto: val('aCP'), custo_real: val('aCR'), responsavel: val('aR'), obs: val('aO'),
      ref: s && s.value ? { kind: val('aT'), id: s.value, nome: s.options[s.selectedIndex].text } : null, manual: Object.fromEntries(['alcance', 'cliques', 'leads', 'reunioes', 'propostas', 'negocios', 'receita'].map(k => [k, val('aM_' + k)])) };
    try { const r = await api('acao_salvar', { campanha_id: det.campanha.id, acao }); fecharModal(); nota('Ação salva'); await abrirCampanha(det.campanha.id, true); if (!id) links(r.acao.id); } catch (e) { nota(e.message, 'error'); b.disabled = false; } }
  function confirmar(texto, fn) { modal('Confirmar', `<div style="font-size:12.5px;">${texto}</div>`, `<button class="btn btn-g" onclick="CMP.fecharModal()">Cancelar</button><button class="btn btn-p" style="background:var(--red);border-color:var(--red);" id="cmpOk">Confirmar</button>`); $('cmpOk').onclick = async () => { fecharModal(); await fn(); }; }
  function acaoExcluir(id) { const a = det.campanha.acoes.find(x => x.id === id); confirmar('Tirar a ação <b>' + esc(a?.nome) + '</b> da campanha? O item ligado (campanha digital, disparo, vídeo) não é apagado.', async () => { try { await api('acao_excluir', { campanha_id: det.campanha.id, id }); await abrirCampanha(det.campanha.id, true); } catch (e) { nota(e.message, 'error'); } }); }
  function links(id) { const a = det.campanha.acoes.find(x => x.id === id), L = det.links[id]; if (!a || !L) return;
    const auto = a.ref?.id && ['digital', 'email', 'whatsapp'].includes(a.tipo);
    const linha = (t, u) => `<div style="margin-top:8px;">${lbl(t)}<div style="display:flex;gap:6px;"><input class="fi" readonly value="${esc(u)}" onclick="this.select()"><button class="btn btn-g" onclick="navigator.clipboard.writeText('${esc(u)}').then(()=>toast('Link copiado','success')).catch(()=>{})">📋</button></div></div>`;
    modal('Links rastreáveis · ' + esc(a.nome), `<div style="font-size:11.5px;color:var(--t2);line-height:1.6;">${auto ? 'Esta ação está ligada a um item que já marca a origem sozinho — os leads dele contam aqui. Use os links abaixo só em material extra desta ação.' : 'Use estes links (ou um QR code deles) no material desta ação. Todo lead que chegar por eles conta nesta ação e na campanha.'}</div>
      ${linha('Formulário de captura (cadastro → reunião)', L.captura)}${linha('Agendar reunião direto', L.reuniao)}`, `<button class="btn btn-p" onclick="CMP.fecharModal()">Pronto</button>`); }
  function ajustes() { const x = det.campanha.ajustes || {};
    modal('Ajustes manuais da campanha', `<div style="font-size:11.5px;color:var(--t2);margin-bottom:8px;">Resultados que não passaram pelo HubSpot ou por uma ação (ex.: negócio fechado numa conversa por indicação da campanha). Somam ao total da campanha.</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">${[['reunioes', 'Reuniões'], ['propostas', 'Propostas'], ['negocios', 'Negócios'], ['receita', 'Receita (R$)']].map(([k, t]) => `<div>${lbl(t)}<input class="fi" type="number" min="0" id="jA_${k}" value="${x[k] ?? ''}"></div>`).join('')}</div>${lbl('Observação')}<input class="fi" id="jA_obs" maxlength="600" value="${esc(x.obs || '')}">`,
      `<button class="btn btn-g" onclick="CMP.fecharModal()">Cancelar</button><button class="btn btn-p" onclick="CMP._ajSalvar(this)">💾 Salvar</button>`); }
  async function ajSalvar(b) { b.disabled = true; try { await api('ajustes', { id: det.campanha.id, ajustes: Object.fromEntries(['reunioes', 'propostas', 'negocios', 'receita', 'obs'].map(k => [k, val('jA_' + k)])) }); fecharModal(); await abrirCampanha(det.campanha.id, true); } catch (e) { nota(e.message, 'error'); b.disabled = false; } }
  async function fechar(b) { b.disabled = true; b.textContent = '⏳ Escrevendo o relatório…'; try { await api('fechar', { id: det.campanha.id }); nota('Relatório de fechamento pronto'); await abrirCampanha(det.campanha.id, true); window.scrollTo(0, 0); } catch (e) { nota(e.message, 'error'); b.disabled = false; b.textContent = '🏁 Fechar com relatório'; } }
  async function reabrir() { try { await api('reabrir', { id: det.campanha.id }); await abrirCampanha(det.campanha.id, true); } catch (e) { nota(e.message, 'error'); } }
  function excluir() { confirmar('Excluir a campanha <b>' + esc(det.campanha.nome) + '</b>? As ações ligadas (campanhas digitais, disparos, vídeos) continuam existindo.', async () => { try { await api('excluir', { id: det.campanha.id }); det = null; D = await api('inicio'); rLista(); nota('Campanha excluída'); } catch (e) { nota(e.message, 'error'); } }); }

  window.CMP = { abrir: id => id ? abrirCampanha(id) : abrir(), voltar: () => { det = null; carregar(); }, editar, acao, acaoExcluir, links, ajustes, fechar, reabrir, excluir, fecharModal,
    _pt: pt, _al: () => lerPlano(), _metas: metasPlano, _ia: ia, _salvar: salvarCamp, _tipo: () => tipo(), _ref: ref, _acaoSalvar: acaoSalvar, _ajSalvar: ajSalvar, _estado: () => ({ D, O, det, view }) };
})();
