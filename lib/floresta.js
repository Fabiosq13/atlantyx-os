// lib/floresta.js — v3.440 · FLORESTA DE VENDAS · trilha T3 (Vendas)
//
// Visão de floresta da venda: TODOS os contatos (com e sem negócio) e TODOS os negócios do HubSpot numa jornada única,
// do contato frio ao cliente, com etapas lógicas além do funil do HubSpot:
//   frio → abordado → engajado → qualificado → reuniao → proposta → negociacao → cliente   (+ congelado, perdido)
// Cada etapa tem um TEMPO LIMITE (SLA, dias). Estourou → a IA avisa e recomenda UMA decisão: AVANÇAR (com a ação que leva ao
// próximo passo), CONGELAR (etapa de espera com data para voltar) ou DESISTIR. A IA só PROPÕE: a fila de aprovação é do
// fundador. Aprovado → o sistema executa o que é interno (etapa no HubSpot, negócio, To-do, congelar) e deixa as mensagens
// prontas (WhatsApp/e-mail abrem preenchidos; nada é enviado sozinho — regra da casa).
// kv: vendas:floresta:cfg (SLA), :fila (decisões), :congelados, :insights, :cache.

export const ETAPAS = [
  { id: 'frio', nome: 'Contato frio', icone: '❄️', sla: 21, dica: 'na base, nunca abordado' },
  { id: 'iara', nome: 'Atendimento IARA (SDR)', icone: '🤖', sla: 10, dica: 'Fluxo IA = IA no HubSpot: a IARA aborda e conversa no WhatsApp' },   // v3.441
  { id: 'abordado', nome: 'Abordado', icone: '📨', sla: 7, dica: 'recebeu contato, ainda sem resposta' },
  { id: 'engajado', nome: 'Lead engajado', icone: '🔥', sla: 7, dica: 'respondeu, baixou material, veio de campanha' },
  { id: 'qualificado', nome: 'Qualificado', icone: '🎯', sla: 5, dica: 'tem dor, verba e decisor — falta reunião' },
  { id: 'reuniao', nome: 'Reunião / diagnóstico', icone: '🤝', sla: 10, dica: 'negócio aberto, descoberta' },
  { id: 'proposta', nome: 'Proposta', icone: '📄', sla: 14, dica: 'proposta enviada' },
  { id: 'negociacao', nome: 'Negociação', icone: '⚖️', sla: 21, dica: 'preço, jurídico, contrato' },
  { id: 'cliente', nome: 'Cliente', icone: '🏆', sla: null, dica: 'ganho' },
  { id: 'remarketing', nome: 'Remarketing', icone: '📣', sla: null, dica: 'público de remarketing (anúncios, e-mail, conteúdo) até reaquecer' },   // v3.442
  { id: 'congelado', nome: 'Congelado (espera)', icone: '🧊', sla: null, dica: 'decidido esperar — volta na data marcada' },
  { id: 'perdido', nome: 'Perdido / desistido', icone: '🍂', sla: null, dica: 'perdido ou desistido' },
];
const ORD = Object.fromEntries(ETAPAS.map((e, i) => [e.id, i]));
const K = { rmk: 'vendas:floresta:remarketing', iara: 'vendas:floresta:iara', cfg: 'vendas:floresta:cfg', fila: 'vendas:floresta:fila', cong: 'vendas:floresta:congelados', ins: 'vendas:floresta:insights', cache: 'vendas:floresta:cache' };
const DECISOR = /\b(ceo|cfo|cio|cto|coo|cdo|cmo|diretor|diretora|director|head|presidente|vp|vice|s[oó]cio|owner|founder|fundador|superintendente|chief|gerente geral)\b/i;
const dia = 86400000, hojeISO = () => new Date().toISOString().slice(0, 10);
const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function criarFloresta({ hs, getSql, claude, todoCriar, normTelefone, apolloBuscar }) {
  async function kv(k, v) { const sql = await getSql();
    if (v === undefined) { const r = await sql`SELECT value FROM kv_store WHERE key = ${k} LIMIT 1`; const x = r[0]?.value; return typeof x === 'string' ? JSON.parse(x) : (x ?? null); }
    await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v; }
  async function cfg() { const c = (await kv(K.cfg)) || {}; return { sla: { ...Object.fromEntries(ETAPAS.map(e => [e.id, e.sla])), ...(c.sla || {}) }, meta_vendas_mes: c.meta_vendas_mes || 4 }; }

  // ── etapa do negócio pela etapa do pipeline (rótulo primeiro, probabilidade depois)
  function etapaDeal(st) {
    if (!st) return 'reuniao'; const l = nrm(st.label);
    if (st.closed) return st.prob >= 1 || /ganh|won|fechad.*ganh/.test(l) ? 'cliente' : 'perdido';
    if (/negoci|contrat|juridic|assinatura|compras/.test(l)) return 'negociacao';
    if (/propost|orcament|cotac/.test(l)) return 'proposta';
    if (/reuni|diagnost|discovery|apresenta|demo|poc|levantamento/.test(l)) return 'reuniao';
    if (/qualif|lead|contato|prospec/.test(l)) return 'qualificado';
    const p = st.prob; return p == null ? 'reuniao' : p >= 0.7 ? 'negociacao' : p >= 0.4 ? 'proposta' : p >= 0.15 ? 'reuniao' : 'qualificado';
  }
  // ── etapa do contato sem negócio (ciclo de vida + status do lead + sinais de contato)
  function etapaContato(p) {
    const lc = String(p.lifecyclestage || ''), ls = String(p.hs_lead_status || '').toUpperCase();
    if (lc === 'customer') return 'cliente';
    if (/UNQUALIFIED/.test(ls)) return 'perdido';
    if (lc === 'salesqualifiedlead' || lc === 'opportunity') return 'qualificado';
    if (lc === 'marketingqualifiedlead' || /CONNECTED|IN_PROGRESS|OPEN_DEAL/.test(ls)) return 'engajado';
    if (p.notes_last_contacted || /ATTEMPTED/.test(ls) || Number(p.num_contacted_notes || 0) > 0) return 'abordado';
    if (p.hs_analytics_source && /PAID|SOCIAL|ORGANIC|EMAIL_MARKETING|REFERRALS|DIRECT/.test(p.hs_analytics_source) && lc === 'lead') return 'engajado';
    return 'frio';
  }
  function desdeContato(p, e) {
    const d = { frio: p.createdate, abordado: p.notes_last_contacted || p.notes_last_updated, engajado: p.hs_lifecyclestage_marketingqualifiedlead_date || p.notes_last_updated || p.hs_lifecyclestage_lead_date,
      qualificado: p.hs_lifecyclestage_salesqualifiedlead_date || p.hs_lifecyclestage_opportunity_date, cliente: p.hs_lifecyclestage_customer_date, perdido: p.lastmodifieddate }[e];
    return d || p.createdate || null;
  }
  const dias = d => d ? Math.max(0, Math.floor((Date.now() - Date.parse(d)) / dia)) : null;
  function temperatura(c) { // 0–100: etapa, decisor, valor, contato recente, atraso
    let t = { remarketing: 12, frio: 10, iara: 22, abordado: 20, engajado: 40, qualificado: 55, reuniao: 65, proposta: 75, negociacao: 85, cliente: 100, congelado: 15, perdido: 0 }[c.etapa] ?? 10;
    if (c.decisor) t += 8; if (c.valor > 0) t += Math.min(10, Math.log10(c.valor) * 2);
    const u = dias(c.ultimo_contato); if (u != null) t += u <= 7 ? 8 : u <= 30 ? 3 : -6; if (c.atrasado) t -= 10;
    return Math.max(0, Math.min(100, Math.round(t)));
  }

  // v3.445: campos da IARA no HubSpot (contatos) — achados pelo RÓTULO, porque o nome interno é do portal:
  // "Fluxo IA" (= IA → lead no atendimento da IARA), "Atendido pela IA" (IARA já mandou WhatsApp), "Resumo SDR Atlantyx"
  // (resumo da conversa) e "Abordagem" (tag com a forma de abordagem, preenchida pelo usuário).
  async function propsIA(forcar) {
    const k = 'vendas:floresta:props_ia'; const c = !forcar && await kv(k); if (c && c.v === 3 && Date.now() - Date.parse(c.em) < 24 * 3600000) return c;
    const L = (await hs('/crm/v3/properties/contacts')).results || []; const n = x => nrm(x).replace(/[^a-z0-9]+/g, ' ').trim();
    const ach = re => L.find(p => re.test(n(p.label)) || re.test(n(p.name).replace(/_/g, ' ')));
    const f = L.find(p => p.name === 'fluxo_de_atendimento') || ach(/^fluxo (da )?ia$/) || ach(/fluxo ia/) || ach(/fluxo de atendimento/), /* v3.458: nomes internos fluxo_de_atendimento e abordagem */ a = ach(/^atendid[oa] (pela|pelo|por) (a )?ia$/) || ach(/atendid[oa].*\bia\b/), r = ach(/resumo.*sdr/), ab = L.find(p => p.name === 'abordagem') || ach(/^abordagem$/) || ach(/^(forma de |tag de )?abordagem/);
    // v3.458: o campo que MARCA o lead para a IARA é "atendido_pela_ia" (nome interno, informado pelo fundador)
    const mc = L.find(p => p.name === 'atendido_pela_ia') || a;
    const out = { v: 3, abordagem_campo: ab?.fieldType || null, em: new Date().toISOString(), marca: mc?.name || null, marca_tipo: mc?.type || null, marca_campo: mc?.fieldType || null, marca_opcoes: (mc?.options || []).map(o => ({ v: o.value, l: o.label })), marca_rotulo: mc?.label || null,
      fluxo: f?.name || null, fluxo_tipo: f?.type || null, fluxo_opcoes: (f?.options || []).map(o => ({ v: o.value, l: o.label })), atendido: a?.name || null, atendido_tipo: a?.type || null,
      resumo: r?.name || null, abordagem: ab?.name || null, abordagem_tipo: ab?.type || null, abordagem_opcoes: (ab?.options || []).filter(o => !o.hidden).map(o => ({ v: o.value, l: o.label })),
      rotulos: { fluxo: f?.label || null, atendido: a?.label || null, resumo: r?.label || null, abordagem: ab?.label || null } };
    await kv(k, out); return out;
  }
  const _sim = v => /^(true|sim|yes|1|s)$/i.test(String(v ?? '').trim());
  const _marcado = (v, P) => { const t = String(v ?? '').trim(); if (!t) return false; if (/^(false|nao|não|no|0)$/i.test(t)) return false; const o = (P.marca_opcoes || []).find(x => x.v === t); return o ? !/^(n[aã]o|no|false)$/i.test(String(o.l).trim()) : true; };
  const _ehIA = (v, P) => { const t = String(v ?? '').trim(); if (!t) return false; if (/^ia$/i.test(t)) return true; const o = (P.fluxo_opcoes || []).find(x => x.v === t); return !!o && /^ia$/i.test(String(o.l).trim()); };
  async function carregar({ forcar } = {}) {
    if (!forcar) { const c = await kv(K.cache); if (c && Date.now() - Date.parse(c.gerado_em) < 10 * 60000) return await _comFila(c); }
    const C = await cfg(), avisos = [];
    // pipelines e etapas (inclui fechadas)
    const pipes = (await hs('/crm/v3/pipelines/deals')).results || []; const stage = {};
    pipes.forEach(p => (p.stages || []).forEach(s => { stage[s.id] = { id: s.id, label: s.label, pipeline: p.id, pipeline_nome: p.label, ordem: s.displayOrder, closed: s.metadata?.isClosed === 'true', prob: s.metadata?.probability != null ? Number(s.metadata.probability) : null }; }));
    let owners = {}; try { ((await hs('/crm/v3/owners?limit=200')).results || []).forEach(o => { owners[o.id] = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email; }); } catch (_) {}
    // negócios (mais recentes primeiro; fechados só dos últimos 120 dias)
    const dprops = ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'createdate', 'hubspot_owner_id', 'hs_lastmodifieddate', 'notes_last_contacted', 'hs_next_step', ...Object.keys(stage).slice(0, 60).map(id => 'hs_date_entered_' + id)];
    const deals = []; let after;
    do { const d = await hs('/crm/v3/objects/deals/search', 'POST', { filterGroups: [{ filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(Date.now() - 365 * dia) }] }], sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }], properties: dprops, limit: 100, ...(after ? { after } : {}) });
      deals.push(...(d.results || [])); after = d.paging?.next?.after; } while (after && deals.length < 400);
    // contatos dos negócios
    const contDe = {}; for (let i = 0; i < deals.length; i += 100) { try { const r = await hs('/crm/v4/associations/deals/contacts/batch/read', 'POST', { inputs: deals.slice(i, i + 100).map(d => ({ id: d.id })) });
      (r.results || []).forEach(x => { contDe[String(x.from?.id)] = (x.to || []).map(t => String(t.toObjectId)); }); } catch (e) { avisos.push('Associações negócio×contato: ' + e.message); break; } }
    // contatos (mais recentes primeiro)
    const cprops = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', 'jobtitle', 'lifecyclestage', 'hs_lead_status', 'notes_last_contacted', 'notes_last_updated', 'num_contacted_notes', 'hs_analytics_source', 'createdate', 'lastmodifieddate', 'hubspot_owner_id', 'num_associated_deals',
      'hs_lifecyclestage_lead_date', 'hs_lifecyclestage_marketingqualifiedlead_date', 'hs_lifecyclestage_salesqualifiedlead_date', 'hs_lifecyclestage_opportunity_date', 'hs_lifecyclestage_customer_date'];
    let PI = {}; try { PI = await propsIA(forcar); [PI.marca, PI.fluxo, PI.atendido, PI.resumo, PI.abordagem].filter(Boolean).forEach(x => { if (!cprops.includes(x)) cprops.push(x); }); } catch (e) { avisos.push('Campos da IARA no HubSpot: ' + e.message); }
    const _lbl = (v, ops) => { const o = (ops || []).find(x => x.v === v); return o ? o.l : v; };
    const iaDe = p => ({ fluxo_ia: PI.fluxo ? p[PI.fluxo] || '' : '', no_fluxo_ia: (PI.marca ? _marcado(p[PI.marca], PI) : false) || (PI.fluxo ? _ehIA(p[PI.fluxo], PI) : false), marca_ia: PI.marca ? p[PI.marca] || '' : '', atendido_ia: PI.atendido && PI.atendido !== PI.marca ? _sim(p[PI.atendido]) : false, resumo_sdr: PI.resumo ? p[PI.resumo] || '' : '', abordagem: PI.abordagem ? String(p[PI.abordagem] || '').split(';').filter(Boolean).map(v => _lbl(v, PI.abordagem_opcoes)).join(', ') : '' });
    const contatos = {}; after = undefined;
    do { const d = await hs('/crm/v3/objects/contacts/search', 'POST', { sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }], properties: cprops, limit: 100, ...(after ? { after } : {}) });
      (d.results || []).forEach(c => { contatos[c.id] = c; }); after = d.paging?.next?.after; } while (after && Object.keys(contatos).length < 600);
    const faltam = [...new Set(Object.values(contDe).flat())].filter(id => !contatos[id]);
    for (let i = 0; i < faltam.length; i += 100) { try { const r = await hs('/crm/v3/objects/contacts/batch/read', 'POST', { properties: cprops, inputs: faltam.slice(i, i + 100).map(id => ({ id })) }); (r.results || []).forEach(c => { contatos[c.id] = c; }); } catch (_) {} }
    const portal = await hs('/account-info/v3/details').then(d => d.portalId).catch(() => null);
    const cong = (await kv(K.cong)) || {}; const hoje = hojeISO(); const cards = []; const comNegocio = new Set();
    for (const d of deals) { const p = d.properties || {}; const st = stage[p.dealstage]; let e = etapaDeal(st);
      if ((e === 'cliente' || e === 'perdido') && dias(p.closedate || p.hs_lastmodifieddate) > 120) continue;
      const cids = contDe[d.id] || []; cids.forEach(id => comNegocio.add(id)); const c0 = contatos[cids[0]]?.properties || {};
      const desde = p['hs_date_entered_' + p.dealstage] || p.hs_lastmodifieddate || p.createdate;
      cards.push({ id: 'n:' + d.id, tipo: 'negocio', hs_id: d.id, nome: p.dealname || '(negócio)', empresa: c0.company || '', contato: [c0.firstname, c0.lastname].filter(Boolean).join(' '), cargo: c0.jobtitle || '', email: c0.email || '', telefone: c0.mobilephone || c0.phone || '',
        contatos: cids.slice(0, 5).map(id => { const q = contatos[id]?.properties || {}; return { id, nome: [q.firstname, q.lastname].filter(Boolean).join(' ') || q.email || id, cargo: q.jobtitle || '' }; }),
        etapa: e, etapa_hs: st ? st.pipeline_nome + ' · ' + st.label : p.dealstage, pipeline: p.pipeline, valor: Number(p.amount) || 0, dono: owners[p.hubspot_owner_id] || '', desde, ultimo_contato: p.notes_last_contacted || null, proximo_passo: p.hs_next_step || '', fechamento: p.closedate || null,
        link: portal ? `https://app.hubspot.com/contacts/${portal}/record/0-3/${d.id}` : null, decisor: DECISOR.test(c0.jobtitle || ''), contato_id: cids[0] || null, ...iaDe(c0) }); }
    for (const [id, c] of Object.entries(contatos)) { if (comNegocio.has(id) || Number(c.properties?.num_associated_deals || 0) > 0) continue; const p = c.properties || {}; const e = etapaContato(p);
      if ((e === 'cliente' || e === 'perdido') && dias(p.lastmodifieddate) > 120) continue;
      cards.push({ id: 'c:' + id, tipo: 'contato', hs_id: id, nome: [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email || '(contato)', empresa: p.company || '', cargo: p.jobtitle || '', email: p.email || '', telefone: p.mobilephone || p.phone || '',
        etapa: e, etapa_hs: [p.lifecyclestage, p.hs_lead_status].filter(Boolean).join(' · '), valor: 0, dono: owners[p.hubspot_owner_id] || '', desde: desdeContato(p, e), ultimo_contato: p.notes_last_contacted || null, origem: p.hs_analytics_source || '',
        link: portal ? `https://app.hubspot.com/contacts/${portal}/record/0-1/${id}` : null, decisor: DECISOR.test(p.jobtitle || ''), contato_id: id, ...iaDe(p) }); }
    // congelados: decisão do fundador vale até a data de volta
    for (const c of cards) { const z = cong[c.id]; if (z && z.ate >= hoje && c.etapa !== 'cliente') { c.etapa_real = c.etapa; c.etapa = 'congelado'; c.congelado = z; c.desde = z.em; } }
    // v3.442: remarketing — decisão do fundador vale até ele mover o card para outra etapa
    const RM = (await kv(K.rmk)) || {};
    for (const c of cards) { const z = RM[c.id]; if (z && c.etapa !== 'cliente' && c.etapa !== 'congelado') { c.etapa_real = c.etapa; c.etapa = 'remarketing'; c.desde = z.em; c.remarketing = z; } }
    // v3.441: quem a IARA abordou fica na etapa "Abordagem IARA" até o HubSpot mostrar avanço (engajado em diante)
    const IA = (await kv(K.iara)) || {};
    // v3.445: campo "Fluxo IA" = IA no HubSpot → o lead está no atendimento da IARA (até avançar para qualificado em diante)
    for (const c of cards) if (c.no_fluxo_ia && ['frio', 'abordado', 'engajado'].includes(c.etapa)) { c.etapa_real = c.etapa; c.etapa = 'iara'; if (!IA[c.id]?.enviado_em) c.desde = c.ultimo_contato || c.desde; }
    for (const c of cards) { const z = IA[c.id]; if (z?.enviado_em && ['frio', 'abordado', 'iara'].includes(c.etapa)) { if (c.etapa === 'iara') { c.desde = z.enviado_em; c.iara = { enviado_em: z.enviado_em, mensagem: z.mensagem }; continue; } c.etapa_real = c.etapa; c.etapa = 'iara'; c.desde = z.enviado_em; c.iara = { enviado_em: z.enviado_em, mensagem: z.mensagem }; } else if (z?.enviado_em) c.iara = { enviado_em: z.enviado_em }; }
    for (const c of cards) { c.dias = dias(c.desde); c.sla = C.sla[c.etapa] ?? null; c.atrasado = c.sla != null && c.dias != null && c.dias > c.sla; c.estouro = c.atrasado ? c.dias - c.sla : 0; c.temperatura = temperatura(c); }
    const out = { props_ia: PI.rotulos ? { ...PI.rotulos, marca: PI.marca_rotulo || PI.marca, marca_interno: PI.marca, abordagem_opcoes: PI.abordagem_opcoes || [], abordagem_unica: ['radio', 'select', 'booleancheckbox'].includes(PI.abordagem_campo), tem_fluxo: !!(PI.marca || PI.fluxo) } : null, gerado_em: new Date().toISOString(), etapas: ETAPAS.map(e => ({ ...e, sla: C.sla[e.id] ?? null })), cards, meta_vendas_mes: C.meta_vendas_mes, avisos, portal };
    await kv(K.cache, out); return await _comFila(out);
  }
  function estatisticas(cards) {
    const por = Object.fromEntries(ETAPAS.map(e => [e.id, { n: 0, valor: 0, atrasados: 0, dias: [] }]));
    cards.forEach(c => { const p = por[c.etapa]; if (!p) return; p.n++; p.valor += c.valor || 0; if (c.atrasado) p.atrasados++; if (c.dias != null) p.dias.push(c.dias); });
    const fluxo = ['frio', 'iara', 'abordado', 'engajado', 'qualificado', 'reuniao', 'proposta', 'negociacao', 'cliente'];
    const acum = fluxo.map((e, i) => fluxo.slice(i).reduce((t, k) => t + por[k].n, 0));
    const conversao = fluxo.map((e, i) => i === 0 ? null : (acum[i - 1] ? Math.round(acum[i] / acum[i - 1] * 100) : null));
    const mediana = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const previsao = Math.round((por.negociacao.n * 0.5 + por.proposta.n * 0.25 + por.reuniao.n * 0.1) * 10) / 10;
    const gargalo = fluxo.slice(1, 7).map((e, i) => ({ e, c: conversao[i + 1] })).filter(x => x.c != null).sort((a, b) => a.c - b.c)[0]?.e || null;
    return { por: Object.fromEntries(Object.entries(por).map(([k, v]) => [k, { n: v.n, valor: Math.round(v.valor), atrasados: v.atrasados, mediana_dias: mediana(v.dias) }])), conversao: Object.fromEntries(fluxo.map((e, i) => [e, conversao[i]])),
      atrasados: cards.filter(c => c.atrasado).length, contatos_sem_negocio: cards.filter(c => c.tipo === 'contato').length, negocios: cards.filter(c => c.tipo === 'negocio' && !['cliente', 'perdido'].includes(c.etapa)).length,
      pipeline_valor: Math.round(cards.filter(c => c.tipo === 'negocio' && ['reuniao', 'proposta', 'negociacao'].includes(c.etapa)).reduce((t, c) => t + c.valor, 0)), previsao_vendas: previsao, gargalo };
  }
  async function _comFila(out) { const fila = (await kv(K.fila)) || []; const ins = await kv(K.ins); return { ...out, stats: estatisticas(out.cards), fila: fila.filter(f => f.status === 'pendente'), decididas: fila.filter(f => f.status !== 'pendente').slice(0, 30), insights: ins }; }

  // ── IA: lê os que estouraram o tempo (e os mais quentes), decide AVANÇAR / CONGELAR / DESISTIR e propõe a ação
  async function analisarIA({ card_id, limite = 25 } = {}) {
    const F = await carregar({}); const st = F.stats;
    let alvo = card_id ? F.cards.filter(c => c.id === card_id) : F.cards.filter(c => c.atrasado && !['cliente', 'perdido', 'congelado'].includes(c.etapa)).sort((a, b) => (b.temperatura + b.estouro) - (a.temperatura + a.estouro)).slice(0, limite);
    const voltando = (F.cards || []).filter(c => c.etapa === 'congelado' && c.congelado?.ate && c.congelado.ate <= hojeISO()).slice(0, 5); if (!card_id) alvo = alvo.concat(voltando);
    const fila = (await kv(K.fila)) || []; const jaPend = new Set(fila.filter(f => f.status === 'pendente').map(f => f.card_id)); alvo = alvo.filter(c => card_id || !jaPend.has(c.id));
    const sys = `Você é o Diretor Comercial IA da Atlantyx (B2B: dados, IA e planejamento — Anaplan, Maestro, Atlantyx OS — para empresas médias e grandes; ciclo de venda consultivo, decisor C-level). Português do Brasil.
Para cada lead/negócio que ESTOUROU o tempo limite da etapa, decida UMA de três: "avancar" (com a ação concreta que leva ao próximo passo), "congelar" (etapa de espera, com data para voltar — use quando o timing é ruim mas o fit é bom) ou "desistir" (sem fit, sem resposta após várias tentativas, ou custo de insistir > valor). Seja duro: tempo do fundador é o recurso mais escasso.
Ações possíveis para "avancar": "abordar_iara" (coloca o lead no fluxo da IARA, a SDR de IA da Atlantyx no WhatsApp — ela aborda e conduz a conversa; use para contato frio/abordado COM telefone que ainda não está no fluxo; respeite a tag "abordagem" escolhida pelo fundador e o resumo da conversa, se houver), "mensagem_whatsapp", "email", "ligacao", "reuniao" (propor horários), "criar_negocio" (contato qualificado sem negócio), "mover_etapa", "tarefa". Mensagens: curtas, humanas, sem bajulação, 1 pergunta fácil no fim; nunca cite clientes nem invente fatos.
Depois traga a visão da floresta: insights do funil, gargalo, previsão de vendas do mês vs meta, e ideias inovadoras e práticas para vender mais com o que a Atlantyx já tem (webinars, Atlantyx TV, SDR IARA no WhatsApp, campanhas, indicações).
Responda SOMENTE JSON: {"decisoes":[{"card_id":"…","decisao":"avancar|congelar|desistir","acao":"mensagem_whatsapp|email|ligacao|reuniao|criar_negocio|mover_etapa|tarefa|congelar|desistir","para_etapa":"id da etapa ou vazio","congelar_ate":"AAAA-MM-DD ou vazio","titulo":"o que fazer em 1 linha","mensagem":"texto pronto (whatsapp/email) ou vazio","assunto":"assunto do e-mail ou vazio","motivo":"por que (1-2 frases, com os sinais do card)","prioridade":"alta|media|baixa","confianca":0-100}],
"insights":["…"],"gargalo":"etapa e por quê","previsao_mes":"quantas vendas neste mês e o que falta para a meta","ideias":["ideia inovadora e acionável"],"alerta":"o que o fundador precisa saber hoje (1 frase)"}`;
    const user = JSON.stringify({ hoje: hojeISO(), meta_vendas_mes: F.meta_vendas_mes, etapas: F.etapas.map(e => ({ id: e.id, nome: e.nome, sla_dias: e.sla })), stats: st,
      estourados: alvo.map(c => ({ card_id: c.id, tipo: c.tipo, nome: c.nome, empresa: c.empresa, cargo: c.cargo, decisor: c.decisor, etapa: c.etapa, etapa_hubspot: c.etapa_hs, dias_na_etapa: c.dias, sla: c.sla, valor: c.valor, ultimo_contato: c.ultimo_contato, origem: c.origem || '', proximo_passo: c.proximo_passo || '', temperatura: c.temperatura, congelado: c.congelado || null, no_fluxo_iara: !!c.no_fluxo_ia, iara_ja_mandou_whatsapp: !!c.atendido_ia, abordagem_tag: c.abordagem || '', resumo_conversa_iara: String(c.resumo_sdr || '').slice(0, 400) })) });
    const t = await claude(sys, [{ type: 'text', text: user }], 6000, 110000);
    const s = String(t || '').replace(/```json|```/g, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); let j; try { j = JSON.parse(s.substring(a, b + 1)); } catch (_) { throw new Error('A IA não devolveu JSON válido — tente de novo'); }
    const porId = Object.fromEntries(F.cards.map(c => [c.id, c])); const agora = new Date().toISOString(); let novas = 0;
    for (const d of (j.decisoes || [])) { const c = porId[d.card_id]; if (!c) continue;
      fila.unshift({ id: 'fd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), card_id: c.id, tipo_card: c.tipo, hs_id: c.hs_id, nome: c.nome, empresa: c.empresa, cargo: c.cargo, email: c.email, telefone: c.telefone, etapa: c.etapa, dias: c.dias, sla: c.sla, valor: c.valor, pipeline: c.pipeline,
        decisao: ['avancar', 'congelar', 'desistir'].includes(d.decisao) ? d.decisao : 'avancar', acao: String(d.acao || ''), para_etapa: ORD[d.para_etapa] != null ? d.para_etapa : '', congelar_ate: /^\d{4}-\d{2}-\d{2}$/.test(d.congelar_ate || '') ? d.congelar_ate : '',
        titulo: String(d.titulo || '').substring(0, 200), mensagem: String(d.mensagem || '').substring(0, 2000), assunto: String(d.assunto || '').substring(0, 200), motivo: String(d.motivo || '').substring(0, 600), prioridade: d.prioridade || 'media', confianca: Number(d.confianca) || null, status: 'pendente', criado_em: agora }); novas++; }
    await kv(K.fila, fila.slice(0, 400));
    const ins = { em: agora, insights: (j.insights || []).slice(0, 8), gargalo: j.gargalo || '', previsao_mes: j.previsao_mes || '', ideias: (j.ideias || []).slice(0, 8), alerta: j.alerta || '' };
    if (!card_id) await kv(K.ins, ins); return { novas, analisados: alvo.length, insights: card_id ? null : ins };
  }

  // ── executor (só depois da aprovação do fundador, ou quando ele mesmo arrasta o card)
  async function _moverHubspot(c, para) {
    if (c.tipo_card === 'negocio' || String(c.card_id || c.id).startsWith('n:')) {
      const pipes = (await hs('/crm/v3/pipelines/deals')).results || []; const p = pipes.find(x => String(x.id) === String(c.pipeline)) || pipes[0];
      const sts = (p?.stages || []).sort((a, b) => a.displayOrder - b.displayOrder).map(s => ({ id: s.id, closed: s.metadata?.isClosed === 'true', prob: s.metadata?.probability != null ? Number(s.metadata.probability) : null, label: s.label }));
      const alvo = sts.find(s => etapaDeal(s) === para) || (para === 'perdido' ? sts.find(s => s.closed && !(s.prob >= 1)) : para === 'cliente' ? sts.find(s => s.closed && s.prob >= 1) : null);
      if (!alvo) throw new Error('Não há etapa no pipeline "' + (p?.label || '') + '" que corresponda a ' + para);
      await hs('/crm/v3/objects/deals/' + c.hs_id, 'PATCH', { properties: { dealstage: alvo.id } }); return 'negócio movido para "' + alvo.label + '" no HubSpot';
    }
    const props = { abordado: { hs_lead_status: 'ATTEMPTED_TO_CONTACT' }, engajado: { hs_lead_status: 'CONNECTED', lifecyclestage: 'marketingqualifiedlead' }, qualificado: { hs_lead_status: 'IN_PROGRESS', lifecyclestage: 'salesqualifiedlead' }, perdido: { hs_lead_status: 'UNQUALIFIED' }, cliente: { lifecyclestage: 'customer' } }[para];
    if (!props) throw new Error('Para levar um contato a "' + para + '" crie um negócio para ele');
    try { await hs('/crm/v3/objects/contacts/' + c.hs_id, 'PATCH', { properties: props }); }
    catch (e) { if (props.lifecyclestage && /lifecycle|backward/i.test(e.message)) { const { lifecyclestage, ...resto } = props; await hs('/crm/v3/objects/contacts/' + c.hs_id, 'PATCH', { properties: resto }); } else throw e; }
    return 'contato atualizado no HubSpot (' + Object.values(props).join(', ') + ')';
  }
  async function _criarNegocio(c) {
    const pipes = (await hs('/crm/v3/pipelines/deals')).results || []; const p = pipes[0]; const sts = (p?.stages || []).sort((a, b) => a.displayOrder - b.displayOrder);
    const st = sts.find(s => s.metadata?.isClosed !== 'true' && ['reuniao', 'qualificado'].includes(etapaDeal({ label: s.label, prob: s.metadata?.probability != null ? Number(s.metadata.probability) : null }))) || sts[0];
    const d = await hs('/crm/v3/objects/deals', 'POST', { properties: { dealname: (c.empresa || c.nome) + ' — oportunidade', pipeline: p.id, dealstage: st.id },
      associations: [{ to: { id: c.hs_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }] });
    return 'negócio criado no HubSpot (' + (p.label || '') + ' · ' + (st.label || '') + ') — id ' + d.id;
  }
  async function _congelar(card_id, ate, motivo, usuario) { const z = (await kv(K.cong)) || {}; z[card_id] = { ate, motivo: motivo || '', em: new Date().toISOString(), por: usuario || null }; await kv(K.cong, z); }
  async function decidir({ id, decisao, mensagem, assunto, congelar_ate, para_etapa }, usuario) {
    const fila = (await kv(K.fila)) || []; const f = fila.find(x => x.id === id); if (!f) throw new Error('Decisão não encontrada'); if (f.status !== 'pendente') throw new Error('Já decidida');
    f.decidido_em = new Date().toISOString(); f.decidido_por = usuario || null;
    if (decisao === 'rejeitar') { f.status = 'rejeitada'; await kv(K.fila, fila); await kv(K.cache, null); return { ok: true, status: f.status }; }
    if (mensagem != null) f.mensagem = String(mensagem).substring(0, 2000); if (assunto != null) f.assunto = String(assunto).substring(0, 200);
    if (congelar_ate) f.congelar_ate = congelar_ate; if (para_etapa) f.para_etapa = para_etapa;
    const feito = [];
    try {
      if (f.decisao === 'congelar' || f.acao === 'congelar') { const ate = f.congelar_ate || new Date(Date.now() + 30 * dia).toISOString().slice(0, 10); await _congelar(f.card_id, ate, f.motivo, usuario); feito.push('congelado até ' + ate.split('-').reverse().join('/')); }
      else if (f.decisao === 'desistir' || f.acao === 'desistir') feito.push(await _moverHubspot(f, 'perdido'));
      else {
        if (f.acao === 'abordar_iara') { const r = await iaraFluxo({ card_ids: [f.card_id] }); const x = r.resultados[0]; if (!x?.ok) throw new Error('IARA: ' + (x?.motivo || 'não marcado')); feito.push('colocado no fluxo da IARA (Fluxo IA = IA no HubSpot)'); }
        if (f.acao === 'criar_negocio') feito.push(await _criarNegocio(f));
        if (f.para_etapa && f.acao !== 'criar_negocio') feito.push(await _moverHubspot(f, f.para_etapa));
        if (['mensagem_whatsapp', 'email', 'ligacao', 'reuniao', 'tarefa'].includes(f.acao)) {
          const verbo = { mensagem_whatsapp: 'Enviar WhatsApp para', email: 'Enviar e-mail para', ligacao: 'Ligar para', reuniao: 'Marcar reunião com', tarefa: '' }[f.acao];
          try { await todoCriar([{ texto: (verbo ? verbo + ' ' : '') + f.nome + (f.empresa ? ' (' + f.empresa + ')' : '') + ' — ' + f.titulo, responsavel: 'Fabio', data: hojeISO(), notas: [f.assunto ? 'Assunto: ' + f.assunto : '', f.mensagem, f.telefone ? 'Tel: ' + f.telefone : '', f.email ? 'E-mail: ' + f.email : ''].filter(Boolean).join('\n') }], 'Floresta de Vendas'); feito.push('tarefa criada no To-do'); }
          catch (e) { feito.push('To-do: ' + e.message); }
        }
      }
      f.status = 'aprovada'; f.resultado = feito.join(' · ');
    } catch (e) { f.status = 'erro'; f.resultado = e.message; }
    await kv(K.fila, fila); await kv(K.cache, null); return { ok: f.status === 'aprovada', status: f.status, resultado: f.resultado, decisao: f };
  }
  async function mover({ card_id, para, congelar_ate, motivo }, usuario) { // arrastar o card = decisão do próprio fundador
    const F = await carregar({}); const c = F.cards.find(x => x.id === card_id); if (!c) throw new Error('Card não encontrado — atualize a tela');
    let r; const RM = (await kv(K.rmk)) || {};
    if (para === 'remarketing') { RM[card_id] = { em: new Date().toISOString(), por: usuario || null, etapa_anterior: c.etapa_real || c.etapa }; await kv(K.rmk, RM); await kv(K.cache, null); return { ok: true, resultado: 'no remarketing' }; }
    if (RM[card_id]) { delete RM[card_id]; await kv(K.rmk, RM); }
    if (para === 'congelado') { const ate = congelar_ate || new Date(Date.now() + 30 * dia).toISOString().slice(0, 10); await _congelar(card_id, ate, motivo, usuario); r = 'congelado até ' + ate; }
    else { const z = (await kv(K.cong)) || {}; if (z[card_id]) { delete z[card_id]; await kv(K.cong, z); }
      r = para === (c.etapa_real || c.etapa) ? 'descongelado' : (c.tipo === 'contato' && ['reuniao', 'proposta', 'negociacao'].includes(para)) ? await _criarNegocio({ ...c, tipo_card: 'contato' }) : await _moverHubspot({ ...c, tipo_card: c.tipo }, para); }
    await kv(K.cache, null); return { ok: true, resultado: r };
  }
  async function cfgSalvar({ sla, meta_vendas_mes }) { const c = (await kv(K.cfg)) || {}; if (sla) c.sla = Object.fromEntries(Object.entries(sla).filter(([k, v]) => ORD[k] != null).map(([k, v]) => [k, v === '' || v == null ? null : Math.max(1, Math.min(365, Number(v) || 1))]));
    if (meta_vendas_mes) c.meta_vendas_mes = Math.max(1, Number(meta_vendas_mes) || 4); await kv(K.cfg, c); await kv(K.cache, null); return { cfg: await cfg() }; }
  // ══ v3.441: IARA (SDR de IA no WhatsApp) — o fundador seleciona contatos/negócios, revisa as 1ªs mensagens e aprova o envio.
  // Envio pelo WhatsApp da Atlantyx (Z-API), respeitando descadastro (LGPD) e sem repetir quem a IARA abordou nos últimos 7 dias.
  // As respostas chegam no webhook do WhatsApp (SDR que conversa, qualifica e marca reunião); o card fica em "Abordagem IARA".
  async function _optout() { try { const sql = await getSql(); return new Set((await sql`SELECT destino FROM disparo_optout`).map(r => r.destino)); } catch (_) { return new Set(); } }
  async function iaraPreparar({ card_ids = [] } = {}) {
    const F = await carregar({}); const porId = Object.fromEntries(F.cards.map(c => [c.id, c])); const IA = (await kv(K.iara)) || {}; const opt = await _optout();
    const L = card_ids.slice(0, 30).map(id => porId[id]).filter(Boolean).map(c => { const tel = normTelefone ? normTelefone(c.telefone) : String(c.telefone || '').replace(/\D/g, '');
      const rec = IA[c.id]?.enviado_em && (Date.now() - Date.parse(IA[c.id].enviado_em)) < 7 * dia;
      const motivo = !tel ? 'sem telefone no HubSpot' : opt.has(tel) ? 'pediu para sair (descadastro)' : rec ? 'a IARA já abordou nos últimos 7 dias' : ['cliente', 'perdido'].includes(c.etapa) ? 'já é ' + c.etapa : null;
      return { card_id: c.id, nome: c.nome, contato: c.contato || c.nome, empresa: c.empresa, cargo: c.cargo, etapa: c.etapa, telefone: tel, pode: !motivo, motivo }; });
    const ok = L.filter(x => x.pode);
    if (ok.length) {
      const sys = `Você é a IARA, SDR de IA da Atlantyx (17 anos em dados, IA e planejamento para empresas médias e grandes — Anaplan, Maestro, Atlantyx OS). Escreva a PRIMEIRA mensagem de WhatsApp para cada contato.
Regras: português do Brasil; até 45 palavras; tom humano, curioso e direto; apresente-se como IARA, da Atlantyx, em meia frase; 1 gancho ligado ao cargo/empresa (sem inventar fatos nem citar clientes); termine com UMA pergunta fácil (sim/não ou "faz sentido conversarmos?"); última linha: "Se preferir não receber, responda SAIR." Sem emojis em excesso (no máximo 1).
Responda SOMENTE JSON: {"mensagens":[{"card_id":"…","mensagem":"…"}]}`;
      const t = await claude(sys, [{ type: 'text', text: JSON.stringify(ok.map(x => ({ card_id: x.card_id, primeiro_nome: String(x.contato || '').split(' ')[0], cargo: x.cargo, empresa: x.empresa, etapa: x.etapa }))) }], 4000, 90000);
      const s = String(t || '').replace(/```json|```/g, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); let j = {}; try { j = JSON.parse(s.substring(a, b + 1)); } catch (_) {}
      const M = Object.fromEntries((j.mensagens || []).map(m => [m.card_id, m.mensagem])); ok.forEach(x => { x.mensagem = String(M[x.card_id] || '').substring(0, 1000); });
    }
    return { itens: L, prontos: ok.length };
  }
  async function _zapi(phone, message) {
    if (!process.env.ZAPI_INSTANCE || !process.env.ZAPI_TOKEN) throw new Error('WhatsApp não configurado (ZAPI_INSTANCE / ZAPI_TOKEN)');
    const r = await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ZAPI_CLIENT_TOKEN ? { 'Client-Token': process.env.ZAPI_CLIENT_TOKEN } : {}) }, body: JSON.stringify({ phone, message }) });
    const t = await r.text(); if (!r.ok) throw new Error('Z-API ' + r.status + ': ' + t.substring(0, 140)); try { const d = JSON.parse(t); if (d.error) throw new Error('Z-API: ' + (d.message || d.error)); } catch (e) { if (/^Z-API/.test(e.message)) throw e; }
  }
  async function iaraEnviar({ itens = [] } = {}, usuario) {
    const F = await carregar({}); const porId = Object.fromEntries(F.cards.map(c => [c.id, c])); const IA = (await kv(K.iara)) || {}; const opt = await _optout(); const out = [];
    for (const it of itens.slice(0, 30)) { const c = porId[it.card_id]; const msg = String(it.mensagem || '').trim();
      if (!c) { out.push({ card_id: it.card_id, ok: false, motivo: 'card não encontrado' }); continue; }
      const tel = normTelefone ? normTelefone(c.telefone) : String(c.telefone || '').replace(/\D/g, '');
      const rec = IA[c.id]?.enviado_em && (Date.now() - Date.parse(IA[c.id].enviado_em)) < 7 * dia;
      const motivo = !tel ? 'sem telefone' : opt.has(tel) ? 'descadastrado' : rec ? 'já abordado nos últimos 7 dias' : msg.length < 10 ? 'mensagem vazia' : null;
      if (motivo) { out.push({ card_id: c.id, nome: c.nome, ok: false, motivo }); continue; }
      try { await _zapi(tel, msg); IA[c.id] = { enviado_em: new Date().toISOString(), mensagem: msg, telefone: tel, por: usuario || null, hs_id: c.hs_id, tipo: c.tipo };
        const cid = c.tipo === 'contato' ? c.hs_id : c.contatos?.[0]?.id;
        if (cid) { try { await hs('/crm/v3/objects/contacts/' + cid, 'PATCH', { properties: { hs_lead_status: 'ATTEMPTED_TO_CONTACT' } }); } catch (_) {}
          try { await hs('/crm/v3/objects/notes', 'POST', { properties: { hs_timestamp: new Date().toISOString(), hs_note_body: 'IARA (SDR IA) — 1ª mensagem no WhatsApp:\n' + msg }, associations: [{ to: { id: cid }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] }); } catch (_) {} }
        out.push({ card_id: c.id, nome: c.nome, ok: true }); await new Promise(r => setTimeout(r, 1200)); }
      catch (e) { out.push({ card_id: c.id, nome: c.nome, ok: false, motivo: e.message }); }
    }
    await kv(K.iara, IA); await kv(K.cache, null); return { resultados: out, enviados: out.filter(x => x.ok).length };
  }
  // ══ v3.441: GERAR LEADS FRIOS (Apollo) direto da floresta — busca (sem crédito) e cria no HubSpot como contato frio
  async function apolloBuscarFl(params = {}) {
    if (!apolloBuscar) throw new Error('Apollo indisponível'); const d = await apolloBuscar(params);
    const F = await kv(K.cache); const ja = new Set((F?.cards || []).map(c => nrm(c.nome + '|' + c.empresa)));
    const pessoas = (d.people || []).map(p => { const o = p.organization || {}; const nome = [p.first_name, p.last_name || p.last_name_obfuscated].filter(Boolean).join(' ') || p.name || '';
      return { apollo_id: p.id, nome, primeiro_nome: p.first_name || '', sobrenome: p.last_name || '', cargo: p.title || '', empresa: o.name || p.organization_name || '', setor: o.industry || '', funcionarios: o.estimated_num_employees || null,
        cidade: p.city || '', estado: p.state || '', linkedin_url: p.linkedin_url || null, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email || '') && !/not_unlocked/.test(p.email) ? p.email : null,
        telefone: p.phone_numbers?.[0]?.sanitized_number || null, decisor: DECISOR.test(p.title || ''), ja_na_floresta: ja.has(nrm(nome + '|' + (o.name || p.organization_name || ''))) }; });
    return { pessoas, total: d._stats?.total_apollo ?? d.pagination?.total_entries ?? null };
  }
  async function importar({ pessoas = [] } = {}) {
    const out = [];
    for (const p of pessoas.slice(0, 100)) {
      try { let id = null;
        if (p.email) { const r = await hs('/crm/v3/objects/contacts/search', 'POST', { filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: String(p.email).toLowerCase() }] }], limit: 1 }); id = r.results?.[0]?.id || null; }
        if (!id && p.primeiro_nome && p.empresa) { const r = await hs('/crm/v3/objects/contacts/search', 'POST', { filterGroups: [{ filters: [{ propertyName: 'firstname', operator: 'EQ', value: p.primeiro_nome }, { propertyName: 'company', operator: 'EQ', value: p.empresa }] }], limit: 1 }); id = r.results?.[0]?.id || null; }
        if (id) { out.push({ nome: p.nome, ok: true, ja_existia: true, id, card_id: 'c:' + id, fluxo_ia: !!p.fluxo_ia }); continue; }
        const props = { firstname: p.primeiro_nome || String(p.nome || '').split(' ')[0], lastname: p.sobrenome || String(p.nome || '').split(' ').slice(1).join(' '), jobtitle: p.cargo, company: p.empresa, email: p.email ? String(p.email).toLowerCase() : '', phone: p.telefone || '', city: p.cidade, state: p.estado, lifecyclestage: 'lead', hs_lead_status: 'NEW' };
        Object.keys(props).forEach(k => { if (!props[k]) delete props[k]; });
        const c = await hs('/crm/v3/objects/contacts', 'POST', { properties: props });
        try { await hs('/crm/v3/objects/notes', 'POST', { properties: { hs_timestamp: new Date().toISOString(), hs_note_body: 'Lead frio gerado no Apollo pela Floresta de Vendas' + (p.linkedin_url ? '\nLinkedIn: ' + p.linkedin_url : '') + (p.setor ? '\nSetor: ' + p.setor : '') }, associations: [{ to: { id: c.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] }); } catch (_) {}
        out.push({ nome: p.nome, ok: true, id: c.id, card_id: 'c:' + c.id, fluxo_ia: !!p.fluxo_ia }); }
      catch (e) { out.push({ nome: p.nome, ok: false, motivo: e.message }); }
    }
    // v3.446: os marcados com "IARA" já entram com Fluxo IA = IA (novos e os que já existiam no HubSpot)
    let iara = 0, iara_erro = null; const paraIA = out.filter(x => x.ok && x.fluxo_ia && x.id);
    if (paraIA.length) { try { const { val } = await _valorIA(); const { okIds, erros } = await _gravarFluxo(paraIA.map(x => x.id), val);
      paraIA.forEach(x => { x.no_fluxo_ia = okIds.has(String(x.id)); if (!x.no_fluxo_ia) x.motivo_iara = erros[String(x.id)]; }); iara = okIds.size; } catch (e) { iara_erro = e.message; } }
    await kv(K.cache, null); return { resultados: out, criados: out.filter(x => x.ok && !x.ja_existia).length, ja_existiam: out.filter(x => x.ja_existia).length, iara, iara_erro };
  }
  // ══ v3.445: colocar no fluxo da IARA = gravar "Fluxo IA" = IA no contato do HubSpot (a IARA, sistema externo, assume dali)
  // v3.446: valor da opção "IA" do campo Fluxo IA (se o campo é lista, usa a opção cujo rótulo/valor é IA)
  // v3.459: atendido_pela_ia = true quando o usuário manda o lead para a IARA e false quando tira (pedido do fundador)
  async function _valorIA() {
    let P = await propsIA(); if (!P.marca) P = await propsIA(true);
    if (!P.marca) throw new Error('Não achei o campo "atendido_pela_ia" nos contatos do HubSpot');
    const ops = P.marca_opcoes || [], op = re => ops.find(x => re.test(String(x.v).trim()) || re.test(String(x.l).trim()));
    const t = ops.length ? (op(/^(true|sim|yes)$/i)?.v ?? 'true') : 'true', f = ops.length ? (op(/^(false|n[aã]o|no)$/i)?.v ?? 'false') : 'false';
    return { P, campo: P.marca, val: t, val_nao: f };
  }
  // grava o campo em lote (100 por chamada); devolve { okIds:Set, erros:{id:motivo} }
  async function _gravarFluxo(contatoIds, val) {
    const { campo } = await _valorIA(); const okIds = new Set(), erros = {}; const ids = [...new Set(contatoIds.map(String).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 100) { const parte = ids.slice(i, i + 100);
      try { await hs('/crm/v3/objects/contacts/batch/update', 'POST', { inputs: parte.map(id => ({ id, properties: { [campo]: val } })) }); parte.forEach(id => okIds.add(id)); }
      catch (e) { for (const id of parte) { try { await hs('/crm/v3/objects/contacts/' + id, 'PATCH', { properties: { [campo]: val } }); okIds.add(id); } catch (e2) { erros[id] = e2.message; } } } }
    return { okIds, erros };
  }
  // ══ v3.445/3.446: colocar no fluxo da IARA = gravar "Fluxo IA" = IA no contato do HubSpot (a IARA, sistema externo, assume dali)
  // contatos: [{card_id, contato_id, nome}] vindos da tela (evita recarregar a floresta inteira); sem eles, usa o cache.
  async function iaraFluxo({ card_ids = [], contatos = [], tirar } = {}) {
    const { val: vIA, val_nao: vNao } = await _valorIA(); const val = tirar ? vNao : vIA;
    let L = (Array.isArray(contatos) ? contatos : []).filter(x => x && x.card_id).slice(0, 500);
    const faltam = card_ids.filter(id => !L.some(x => x.card_id === id && x.contato_id));
    if (faltam.length) { const F = await carregar({}); const porId = Object.fromEntries(F.cards.map(c => [c.id, c]));
      L = L.filter(x => x.contato_id).concat(faltam.map(id => ({ card_id: id, contato_id: porId[id]?.contato_id || (String(id).startsWith('c:') ? String(id).slice(2) : null), nome: porId[id]?.nome, telefone: porId[id]?.telefone }))); }
    const { okIds, erros } = await _gravarFluxo(L.map(x => x.contato_id), val);
    const out = L.map(x => !x.contato_id ? { card_id: x.card_id, nome: x.nome, ok: false, motivo: 'sem contato no HubSpot' }
      : okIds.has(String(x.contato_id)) ? { card_id: x.card_id, nome: x.nome, ok: true } : { card_id: x.card_id, nome: x.nome, ok: false, motivo: erros[String(x.contato_id)] || 'erro' });
    await kv(K.cache, null); return { resultados: out, ok: out.filter(x => x.ok).length, valor: val };
  }
  // tag "Abordagem" do contato (o usuário escolhe na floresta e grava no HubSpot)
  async function abordagemSalvar({ card_id, valores = [] } = {}) {
    const P = await propsIA(); if (!P.abordagem) throw new Error('Não achei o campo "Abordagem" nos contatos do HubSpot');
    const F = await carregar({}); const c = F.cards.find(x => x.id === card_id); if (!c?.contato_id) throw new Error('Card sem contato no HubSpot');
    const L0 = (Array.isArray(valores) ? valores : [valores]).filter(Boolean);
    // v3.461: "abordagem" é botão de opção (uma só: Geral, FQ…) — escolha única grava um valor; checkbox múltiplo junta com ";"
    const v = ['radio', 'select', 'booleancheckbox'].includes(P.abordagem_campo) ? (L0[0] || '') : L0.join(P.abordagem_tipo === 'enumeration' ? ';' : ', ');
    await hs('/crm/v3/objects/contacts/' + c.contato_id, 'PATCH', { properties: { [P.abordagem]: v } }); await kv(K.cache, null); return { ok: true };
  }
  // ══ v3.442: ações em lote nos cards marcados — remarketing, tirar do remarketing, excluir
  // Excluir = arquivar no HubSpot (contato ou negócio). O HubSpot guarda os arquivados por 90 dias (dá para restaurar lá).
  async function lote({ acao, card_ids = [] } = {}, usuario) {
    const F = await carregar({}); const porId = Object.fromEntries(F.cards.map(c => [c.id, c])); const ids = card_ids.slice(0, 200).filter(id => porId[id]); const out = [];
    if (acao === 'remarketing' || acao === 'tirar_remarketing') {
      const RM = (await kv(K.rmk)) || {}, CG = (await kv(K.cong)) || {}; const em = new Date().toISOString();
      for (const id of ids) { if (acao === 'remarketing') { RM[id] = { em, por: usuario || null, etapa_anterior: porId[id].etapa_real || porId[id].etapa }; delete CG[id]; } else delete RM[id]; out.push({ card_id: id, ok: true }); }
      await kv(K.rmk, RM); await kv(K.cong, CG);
    } else if (acao === 'excluir') {
      const RM = (await kv(K.rmk)) || {}, CG = (await kv(K.cong)) || {}, IA = (await kv(K.iara)) || {};
      for (const id of ids) { const c = porId[id];
        try { await hs('/crm/v3/objects/' + (c.tipo === 'negocio' ? 'deals' : 'contacts') + '/' + c.hs_id, 'DELETE'); delete RM[id]; delete CG[id]; delete IA[id]; out.push({ card_id: id, nome: c.nome, ok: true }); }
        catch (e) { out.push({ card_id: id, nome: c.nome, ok: false, motivo: e.message }); } }
      await kv(K.rmk, RM); await kv(K.cong, CG); await kv(K.iara, IA);
    } else throw new Error('ação inválida');
    await kv(K.cache, null); return { resultados: out, ok: out.filter(x => x.ok).length };
  }
  // lista do público de remarketing (para subir no Meta/LinkedIn/e-mail)
  async function remarketingLista() { const F = await carregar({}); return { pessoas: F.cards.filter(c => c.etapa === 'remarketing').map(c => ({ nome: c.contato || c.nome, empresa: c.empresa, cargo: c.cargo, email: c.email, telefone: c.telefone, tipo: c.tipo, desde: c.desde })) }; }
  return { iaraFluxo, abordagemSalvar, propsIA, lote, remarketingLista, carregar, analisarIA, decidir, mover, cfgSalvar, iaraPreparar, iaraEnviar, apolloBuscar: apolloBuscarFl, importar };
}
