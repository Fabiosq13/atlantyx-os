// lib/campanha-macro.js — v3.255 · CAMPANHA DE MARKETING (visão única) — funções puras
// Uma CAMPANHA é o nível de cima: período, objetivo, orçamento, metas e um PLANO (o Plano Estratégico vigente ou um
// plano próprio criado na hora). Debaixo dela ficam as AÇÕES de vários canais (campanha digital nas redes, anúncio,
// e-mail, WhatsApp, Atlantyx TV, webinar, evento…). Cada lead que chega com a etiqueta da campanha (utm_campaign) ou
// de uma ação ligada (a campanha digital / o disparo marcam a própria) é contado na ação e na campanha.

export const TIPOS = {
  digital: { nome: 'Campanha digital (redes)', icone: '📣', fonte: 'social', auto: 'Leads, cliques e envios contados sozinhos' },
  anuncio: { nome: 'Anúncio pago (Meta / Google / LinkedIn)', icone: '💰', fonte: 'anuncio', auto: null },
  email: { nome: 'E-mail marketing', icone: '✉️', fonte: 'email', auto: 'Envios, aberturas e cliques contados sozinhos' },
  whatsapp: { nome: 'Disparo WhatsApp', icone: '💬', fonte: 'whatsapp', auto: 'Envios e cliques contados sozinhos' },
  tv: { nome: 'Atlantyx TV / YouTube', icone: '📺', fonte: 'youtube', auto: null },
  webinar: { nome: 'Webinar ao vivo', icone: '🎙', fonte: 'webinar', auto: null },
  evento: { nome: 'Evento ou ação offline', icone: '🤝', fonte: 'evento', auto: null },
  outro: { nome: 'Outra ação', icone: '•', fonte: 'outro', auto: null },
};
export const STATUS_NOME = { planejada: 'Planejada', ativa: 'No ar', atribuicao: 'Contando resultados', encerrada: 'Encerrada', fechada: 'Fechada com relatório' };

const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const num = v => (v === '' || v == null || isNaN(+v)) ? null : +v;
export const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
// mesma regra da tela "Campanha digital" (comUtm) e dos disparos: utm_campaign = id em minúsculas, o resto vira "_"
export const slugRef = id => String(id || 'campanha').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_]+/g, '_').substring(0, 60);

export function utmCampanha(nome, inicio, existentes = []) {
  const ym = String(inicio || '').slice(2, 7).replace('-', '') || 'x';
  const b = ('cm_' + slug(nome).substring(0, 36) + '_' + ym).replace(/_+/g, '_'); let u = b, i = 2;
  while (existentes.includes(u)) u = b + '_' + i++;
  return u;
}
export const utmConteudo = (tipo, nome, existentes = []) => { const b = (slug(tipo) + '_' + slug(nome)).substring(0, 36).replace(/_+$/, '') || 'acao'; let u = b, i = 2; while (existentes.includes(u)) u = b + '_' + i++; return u; };

const dia = d => Date.parse(String(d || '').slice(0, 10) + 'T12:00:00Z');
export function statusDe(c, hoje = new Date().toISOString().slice(0, 10)) {
  if (c.fechamento?.em) return 'fechada';
  const h = dia(hoje), i = dia(c.inicio), f = dia(c.fim), jan = (Number(c.janela_dias) || 60) * 864e5;
  if (i && h < i) return 'planejada';
  if (!f || h <= f) return 'ativa';
  return h <= f + jan ? 'atribuicao' : 'encerrada';
}
export function diasDe(c) { const i = dia(c.inicio), f = dia(c.fim); return i && f && f >= i ? Math.round((f - i) / 864e5) + 1 : 0; }

// plano: { tipo: 'estrategico', versao, plano_nome, alavancas: [ids] } | { tipo: 'proprio', objetivo, publico, oferta, dor, prova, mensagem, racional }
export function validarPlano(p, vigente) {
  if (!p || !p.tipo) return 'Ligue a campanha a um plano: ao Plano Estratégico vigente ou a um plano próprio';
  if (p.tipo === 'estrategico') {
    if (!vigente?.plano) return 'Não há Plano Estratégico aprovado — aprove um em Planejamento → Plano Estratégico, ou crie um plano próprio para esta campanha';
    const ids = new Set((vigente.plano.alavancas || []).map(a => a.id));
    if (!(p.alavancas || []).length) return 'Escolha pelo menos uma linha de negócio do Plano Estratégico';
    if ((p.alavancas || []).some(id => !ids.has(id))) return 'Uma das linhas escolhidas não existe mais no plano vigente — escolha de novo';
    return null;
  }
  if (p.tipo === 'proprio') {
    const falta = [['objetivo', 'o objetivo'], ['publico', 'o público'], ['oferta', 'a oferta']].filter(([k]) => !String(p[k] || '').trim()).map(x => x[1]);
    return falta.length ? 'No plano da campanha, preencha ' + falta.join(', ') : null;
  }
  return 'Tipo de plano inválido';
}

// metas sugeridas a partir das linhas do Plano Estratégico: o funil do ano de cada linha (planoSimular) × dias da campanha / 365
export function metasDoPlano(sim, plano, ids, inicio, fim) {
  const dias = diasDe({ inicio, fim }); if (!dias || !sim) return null;
  const f = dias / 365, L = (sim.linhas || []).filter(l => (ids || []).includes(l.id)), A = (plano?.alavancas || []).filter(a => (ids || []).includes(a.id));
  const soma = k => L.reduce((s, l) => s + (Number(l[k]) || 0), 0), up = x => Math.ceil(x * f - 1e-9);
  const receitaNova = A.reduce((s, a) => s + (Number(a.receita_nova) || 0), 0);
  const leads = up(soma('leads')), M = plano?.midia || {};
  const investimento = Math.round(leads * (Number(M.pct_leads_pagos) || 0) / 100 * (Number(M.cpl_medio) || 0));
  return { leads, reunioes: up(soma('reunioes')), propostas: up(soma('propostas')), negocios: up(soma('contratos')), receita: Math.round(receitaNova * f), investimento, fator: r2(f), dias };
}

// briefing herdado das linhas do plano (vai para as ações e para a IA)
export function briefingDoPlano(plano, ids) {
  const A = (plano?.alavancas || []).filter(a => (ids || []).includes(a.id));
  const j = k => [...new Set(A.map(a => String(a[k] || '').trim()).filter(Boolean))].join(' · ');
  return { linhas: A.map(a => a.nome).join(' · '), oferta: j('oferta'), publico: j('publico'), dor: j('dor'), prova: j('prova') };
}

// ── consolidação ──
// coleta = { leads: [{ id, campanha, conteudo, criado_em, reuniao, proposta, ganho, valor }], visitas: [{ campanha, conteudo, n }],
//            disparos: { <campanha_id>: { enviados, aberturas, cliques } } }
export function chavesAcao(a) { return a.ref?.id && ['digital', 'email', 'whatsapp', 'anuncio'].includes(a.tipo) ? [slugRef(a.ref.id)] : []; }
export function consolidar(c, coleta = {}, hoje) {
  const A = c.acoes || [], ini = dia(c.inicio) || 0, fimAtr = (dia(c.fim) || Date.now()) + (Number(c.janela_dias) || 60) * 864e5 + 864e5;
  const porChave = {}; A.forEach(a => chavesAcao(a).forEach(k => { porChave[k] = a.id; }));
  const porConteudo = {}; A.forEach(a => { if (a.utm_content) porConteudo[a.utm_content] = a.id; });
  const zero = () => ({ alcance: 0, cliques: 0, leads: 0, reunioes: 0, propostas: 0, negocios: 0, receita: 0 });
  const M = Object.fromEntries(A.map(a => [a.id, zero()])); M._geral = zero();
  const daAcao = (camp, cont) => camp === c.utm ? (porConteudo[cont] || '_geral') : porChave[camp] || null;
  const leadsVistos = new Set();
  for (const l of coleta.leads || []) {
    const t = Date.parse(l.criado_em || '') || 0; if (t && (t < ini || t > fimAtr)) continue;
    const id = daAcao(l.campanha, l.conteudo); if (!id || leadsVistos.has(l.id)) continue; leadsVistos.add(l.id);
    const m = M[id]; m.leads++; if (l.reuniao || l.proposta || l.ganho) m.reunioes++; if (l.proposta || l.ganho) m.propostas++; if (l.ganho) { m.negocios++; m.receita += Number(l.valor) || 0; }
  }
  for (const v of coleta.visitas || []) { const id = daAcao(v.campanha, v.conteudo); if (id) M[id].cliques += Number(v.n) || 0; }
  const linhas = A.map(a => {
    const m = M[a.id], d = (a.ref?.id && coleta.disparos?.[a.ref.id]) || null, man = a.manual || {};
    const custo = num(a.custo_real) ?? num(a.custo_previsto) ?? 0;
    const L = { id: a.id, tipo: a.tipo, nome: a.nome, ref: a.ref || null, utm_content: a.utm_content, custo, custo_previsto: num(a.custo_previsto), custo_real: num(a.custo_real), custo_estimado: num(a.custo_real) == null && num(a.custo_previsto) != null,
      alcance: m.alcance + (Number(man.alcance) || 0) + (d ? d.enviados : 0), cliques: m.cliques + (Number(man.cliques) || 0) + (d ? d.cliques : 0), aberturas: d ? d.aberturas : null,
      leads: m.leads + (Number(man.leads) || 0), reunioes: m.reunioes + (Number(man.reunioes) || 0), propostas: m.propostas + (Number(man.propostas) || 0), negocios: m.negocios + (Number(man.negocios) || 0), receita: r2(m.receita + (Number(man.receita) || 0)) };
    L.cpl = L.leads && L.custo ? r2(L.custo / L.leads) : null; return L;
  });
  const g = M._geral, aj = c.ajustes || {};
  const tot = k => linhas.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  const T = { investimento: r2(tot('custo')), alcance: tot('alcance'), cliques: tot('cliques') + g.cliques, leads: tot('leads') + g.leads, reunioes: tot('reunioes') + g.reunioes + (Number(aj.reunioes) || 0),
    propostas: tot('propostas') + g.propostas + (Number(aj.propostas) || 0), negocios: tot('negocios') + g.negocios + (Number(aj.negocios) || 0), receita: r2(tot('receita') + g.receita + (Number(aj.receita) || 0)) };
  T.investimento_estimado = linhas.some(l => l.custo_estimado);
  T.cpl = T.leads && T.investimento ? r2(T.investimento / T.leads) : null;
  T.cac = T.negocios && T.investimento ? r2(T.investimento / T.negocios) : null;
  T.roi_pct = T.investimento ? r2((T.receita - T.investimento) / T.investimento * 100) : null;
  T.conv_lead_reuniao = T.leads ? r2(T.reunioes / T.leads * 100) : null; T.conv_reuniao_proposta = T.reunioes ? r2(T.propostas / T.reunioes * 100) : null; T.conv_fechamento = T.propostas ? r2(T.negocios / T.propostas * 100) : null;
  const mt = c.metas || {}, orc = num(c.orcamento);
  const metas = ['leads', 'reunioes', 'propostas', 'negocios', 'receita'].map(k => ({ k, meta: num(mt[k]), real: T[k], pct: num(mt[k]) ? r2(T[k] / mt[k] * 100) : null }));
  metas.push({ k: 'investimento', meta: orc, real: T.investimento, pct: orc ? r2(T.investimento / orc * 100) : null });
  // ritmo: % da meta de leads × % do período decorrido
  const h = dia(hoje || new Date().toISOString().slice(0, 10)), i = dia(c.inicio), f = dia(c.fim);
  const tempo = i && f && f >= i ? Math.max(0, Math.min(1, (h - i + 864e5) / (f - i + 864e5))) : null;
  const ml = num(mt.leads); const ritmo = tempo != null && ml ? { tempo_pct: r2(tempo * 100), leads_pct: r2(T.leads / ml * 100), situacao: tempo === 0 ? 'nao_comecou' : T.leads / ml >= tempo * 0.9 ? 'no_ritmo' : T.leads / ml >= tempo * 0.6 ? 'atencao' : 'atrasada' } : null;
  const ranking = linhas.filter(l => l.leads > 0).sort((a, b) => (a.cpl ?? 0) - (b.cpl ?? 0) || b.leads - a.leads).map(l => l.id);
  return { status: statusDe(c, hoje), totais: T, metas, ritmo, acoes: linhas, sem_acao: { leads: g.leads, cliques: g.cliques, negocios: g.negocios, receita: r2(g.receita) }, ranking };
}

// links rastreáveis de uma ação (formulário de captura e agenda de reunião), herdando a etiqueta da campanha
export function linksAcao(base, c, a) {
  const f = (TIPOS[a.tipo] || TIPOS.outro).fonte, q = '?f=' + encodeURIComponent(f) + '&p=' + encodeURIComponent(a.utm_content || '');
  const b = String(base || '').replace(/\/$/, '');
  return { captura: b + '/agenda/' + c.utm + q, reuniao: b + '/reuniao/' + c.utm + q };
}
