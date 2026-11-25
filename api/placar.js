// api/placar.js — v3.572 · PLACAR DE METAS (gestão à vista): META × REALIZADO × PROJEÇÃO, semáforo, tendência e ação obrigatória no vermelho.
// ESTENDE o que já existe: as metas financeiras continuam em atx:metas (Planejamento → Metas da Empresa); aqui só entram metas dos indicadores NOVOS.
// Sem tabela nova: tudo em kv_store (placar:*). Cálculo único em lib/placar-calc.js (TV, Dashboard, e-mail e exportação usam o mesmo).
// Ações: status · catalogo · metas_salvar (só admin) · manual_registrar · acao_salvar · acao_listar · acao_revisar · snapshot (cron) · log_listar
import { comGuarda } from '../lib/qa-guard.js';
import { montarIndicador, resumoPlacar, exigeAcao, validarAcao, paraTv } from '../lib/placar-calc.js';

const CACHE_MS = 5 * 60000;
let _sql = null;
async function getSql() { if (_sql) return _sql; const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); await _sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`; return _sql; }
async function kv(k, v) {
  const sql = await getSql();
  if (v === undefined) { const r = (await sql`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null; try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; } }
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v;
}
const hojeBR = () => new Date(Date.now() - 3 * 3600000).toISOString().substring(0, 10);
const num = v => (v == null || v === '' || isNaN(+v)) ? null : +v;
const dias = (iso, hoje) => iso ? Math.max(0, Math.round((Date.parse(hoje + 'T12:00:00Z') - Date.parse(String(iso).substring(0, 10) + 'T12:00:00Z')) / 86400000)) : null;
const tx = (s, n) => String(s ?? '').replace(/[<>]/g, '').trim().substring(0, n);

// chamada interna às outras APIs (mesma técnica da TV)
async function chamar(mod, body, ms = 45000) {
  const m = await import('./' + mod + '.js'); let out = null;
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(b) { try { out = JSON.parse(b); } catch (_) { out = { raw: b }; } return this; }, setHeader() {}, end() { return this; } };
  let tm; await Promise.race([m.default({ method: 'POST', body, query: {}, headers: {}, url: '/api/' + mod }, res), new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('demorou mais de ' + ms / 1000 + 's')), ms); })]).finally(() => clearTimeout(tm));
  if (!out || out.success === false) throw new Error(out?.error || 'sem resposta'); return out;
}

// ── CATÁLOGO (proposta: o CEO aprova/edita). Teto de 9 linhas na TV. visivel_tv padrão = falso; privado nunca vai à TV. ─────────────────
export const CATALOGO = [
  { id: 'receita_ano', nome: 'Receita do ano', grupo: 'Resultado e crescimento', unidade: 'R$', tipo: 'acumulado', sentido: 'maior', fonte: 'auto', periodicidade: 'diária', dono: 'CEO', visivel_tv: true,
    formula: 'Faturamento acumulado no ano (QuickBooks) contra a meta de Metas da Empresa; esperado = meta × fração do ano (ou a curva mês a mês)' },
  { id: 'margem_liquida', nome: 'Margem líquida', grupo: 'Resultado e crescimento', unidade: '%', tipo: 'nivel', sentido: 'maior', fonte: 'auto', periodicidade: 'diária', dono: 'CEO', visivel_tv: true, tolerancia: 3,
    formula: 'Lucro líquido ÷ faturamento acumulado no ano (QuickBooks). Sempre lida junto com a receita' },
  { id: 'margem_ebitda', nome: 'Margem EBITDA', grupo: 'Resultado e crescimento', unidade: '%', tipo: 'nivel', sentido: 'maior', fonte: 'auto', periodicidade: 'diária', dono: 'CEO', visivel_tv: false, tolerancia: 3,
    formula: 'EBITDA ÷ faturamento acumulado no ano (QuickBooks); meta de Metas da Empresa → margem EBITDA' },
  { id: 'recorrente_pct', nome: '% da receita recorrente (ARR)', grupo: 'Resultado e crescimento', unidade: '%', tipo: 'nivel', sentido: 'maior', fonte: 'financeiro', periodicidade: 'mensal', dono: 'CEO', visivel_tv: true, tolerancia: 3, max_idade_dias: 45,
    formula: 'ARR atual + contratos assinados com início futuro ÷ receita. Nunca soma pipeline em aberto. Meta de Metas da Empresa → recorrência' },
  { id: 'caixa_minimo', nome: 'Caixa contra o caixa mínimo', grupo: 'Resultado e crescimento', unidade: 'R$', tipo: 'nivel', sentido: 'maior', fonte: 'auto', periodicidade: 'diária', dono: 'CEO', visivel_tv: false, privado: true, tolerancia: null,
    formula: 'Saldo em caixa hoje contra o caixa mínimo cadastrado em Metas da Empresa (só login; nunca vai à TV)' },
  { id: 'conversao_ganho', nome: 'Conversão proposta → contrato', grupo: 'Comercial', unidade: '%', tipo: 'nivel', sentido: 'maior', fonte: 'auto', periodicidade: 'diária', dono: 'Comercial', visivel_tv: true, tolerancia: 3,
    formula: 'Negócios ganhos ÷ (ganhos + perdidos) no ano (HubSpot). Alavanca: conversão' },
  { id: 'ticket_medio', nome: 'Ticket médio', grupo: 'Comercial', unidade: 'R$', tipo: 'nivel', sentido: 'maior', fonte: 'auto', periodicidade: 'diária', dono: 'Comercial', visivel_tv: true, privado: false,
    formula: 'Valor ganho ÷ negócios ganhos no ano (HubSpot). Alavanca: ticket médio' },
  { id: 'entregas_prazo', nome: 'Projetos em dia', grupo: 'Entrega, caixa e pessoas', unidade: '%', tipo: 'nivel', sentido: 'maior', fonte: 'auto', periodicidade: 'diária', dono: 'PMO', visivel_tv: true, tolerancia: 5,
    formula: 'Projetos com farol verde ÷ total de projetos no Painel Mestre (PMO)' },
  { id: 'dso', nome: 'Prazo médio de recebimento (DSO)', grupo: 'Entrega, caixa e pessoas', unidade: 'dias', tipo: 'nivel', sentido: 'menor', fonte: 'manual', periodicidade: 'mensal', dono: 'Financeiro', visivel_tv: true, max_idade_dias: 45,
    formula: 'Dias entre a emissão da nota e o recebimento (menor é melhor)' },
  { id: 'capacidade', nome: 'Capacidade comprometida', grupo: 'Entrega, caixa e pessoas', unidade: '%', tipo: 'nivel', sentido: 'faixa', fonte: 'manual', periodicidade: 'semanal', dono: 'Operações', visivel_tv: true, tolerancia: 5, max_idade_dias: 10,
    formula: 'Horas alocadas ÷ horas disponíveis do time. Faixa-alvo (hipótese a validar: 80 a 95%)' },
  { id: 'tempo_fundador', nome: 'Tempo do fundador em direção', grupo: 'Liberdade', unidade: '%', tipo: 'nivel', sentido: 'maior', fonte: 'manual', periodicidade: 'semanal', dono: 'CEO', visivel_tv: false, privado: true, tolerancia: 5, max_idade_dias: 10,
    formula: '% do tempo da semana em direção (e não em operação). Registro semanal manual' },
];
const defs = async () => { const o = (await kv('placar:catalogo')) || {}; return CATALOGO.filter(d => !(o[d.id] || {}).arquivado).map(d => ({ ...d, ...(o[d.id] || {}) })); };

// ── LEITURA DAS FONTES (cada falha deixa só aquele indicador cinza, com a causa) ──────────────────────────────────────────────────────
async function lerFontes(ano, hoje) {
  const [me, ml, rk, ks, fy, pm, fp] = await Promise.allSettled([
    chamar('financeiro', { action: 'metas_empresa_status', params: { ano, com_crm: false } }), chamar('financeiro', { action: 'metas_empresa_ler', params: { ano } }),
    chamar('financeiro', { action: 'resultado_kpis', params: { ano, _max_idade: 300 } }), chamar('financeiro', { action: 'kpis_saude', params: {} }),
    chamar('financeiro', { action: 'funil_vendas', params: { tipo: 'ano', ref: String(ano), pipeline: 'todos' } }, 58000), chamar('pmo', { action: 'painel_mestre', payload: {} }), chamar('financeiro', { action: 'fin_v2', params: { tela: 'produtos' } }, 40000)]);
  const v = p => p.status === 'fulfilled' ? p.value : null, er = p => p.status === 'rejected' ? tx(p.reason?.message || p.reason, 110) : null;
  const ME = v(me)?.metas || {}, FA = ME.faturamento || {}, MG = ME.margem || {}, cad = v(ml)?.todos_anos?.[String(ano)] || v(ml)?.metas || v(ml)?.meta_padrao || {};
  const K = v(rk)?.resultado || {}, P = K.periodo_res || {}, KS = v(ks)?.kpis || {}, FY = v(fy) || {}, R = FY.resumo || {}, PM = v(pm)?.resumo || null;
  const L = {}; // id → leitura { real, meta, curva, faixa, erro, idade_dias, rotulo }
  const fat = num(P.faturamento), curva = Array.isArray(cad.mensal) && cad.mensal.length === 12 ? cad.mensal : null;
  L.receita_ano = { real: num(FA.realizado) ?? fat, meta: num(FA.meta) ?? num(cad.faturamento), curva, idade_dias: 0, erro: er(me) };
  L.margem_liquida = { real: num(MG.realizado_pct), meta: num(MG.meta_pct) ?? num(cad.margem_pct), idade_dias: 0, erro: er(me) };
  L.margem_ebitda = { real: P.ebitda != null && fat > 0 ? Math.round(num(P.ebitda) / fat * 1000) / 10 : null, meta: num(cad.margem_ebitda_pct), idade_dias: 0, erro: er(rk) };
  L.caixa_minimo = { real: num(KS.saldo_caixa), meta: num(cad.caixa_minimo), idade_dias: 0, erro: er(ks) };
  const gan = R.ganho || {}, per = R.perdidos || {}, nG = num(gan.qtd), nP = num(per.qtd);
  L.conversao_ganho = { real: nG != null && nP != null && nG + nP > 0 ? Math.round(nG / (nG + nP) * 1000) / 10 : null, idade_dias: 0, erro: er(fy), rotulo: 'estimado' };
  L.ticket_medio = { real: nG > 0 && num(gan.valor) != null ? Math.round(num(gan.valor) / nG) : null, meta: num(FY.meta_base?.ticket_medio), idade_dias: 0, erro: er(fy) };
  L.entregas_prazo = { real: PM && PM.total > 0 ? Math.round(PM.verde / PM.total * 1000) / 10 : null, idade_dias: 0, erro: er(pm) };
  // v3.618: % recorrente (ARR ÷ receita) agora vem do motor Produtos do QuickBooks (depende de cada cliente estar no motor certo: projeto parcelado = Projetos; sustentação e alocações recorrentes = Produtos/Pessoas)
  { const kr = (v(fp)?.fin_v2?.kpis || []).find(k => k.id === 'recorrencia'); L.recorrente_pct = { real: kr?.valor != null ? num(kr.valor) : null, arr_qb: kr?.extra?.arr != null ? num(kr.extra.arr) : null, receita_12m: kr?.extra?.receita_12m != null ? num(kr.extra.receita_12m) : null, meta: num(cad.recorrencia_pct), idade_dias: 0, erro: er(fp), rotulo: 'QuickBooks · motor Produtos' }; }
  return L;
}

async function montar(ano, { forcar = false } = {}) {
  const hoje = hojeBR(), ck = 'placar:cache:' + ano, c = forcar ? null : await kv(ck).catch(() => null);
  if (c && Date.now() - Date.parse(c.gerado_em) < CACHE_MS) return c;
  const [D, L, M, man, acoes, hist] = await Promise.all([defs(), lerFontes(ano, hoje).catch(e => ({ _erro: tx(e.message, 120) })), kv('placar:metas:' + ano).then(x => x || {}), kv('placar:manuais').then(x => x || {}), kv('placar:acoes').then(x => x || []), kv('placar:hist:' + ano).then(x => x || {})]);
  const inds = D.map(d => {
    const base = L[d.id] || { erro: L._erro || null }, mm = M[d.id] || {}, m = man[d.id];
    let leit = { ...base };
    if (d.fonte === 'manual') { const ult = m?.length ? m[m.length - 1] : null; leit = { ...leit, real: ult ? num(ult.valor) : null, idade_dias: ult ? dias(ult.em, hoje) : null, rotulo: 'manual', historico: (m || []).map(x => num(x.valor)) }; }
    if (mm.meta != null) leit.meta = num(mm.meta); if (mm.faixa) leit.faixa = mm.faixa; if (mm.curva) leit.curva = mm.curva;
    if (d.id === 'capacidade' && !leit.faixa && mm.meta == null) leit.faixa = null; // faixa 80–95 é hipótese: só vale depois de cadastrada pelo CEO
    const h = hist[d.id] || []; if (d.fonte !== 'manual') leit.historico = h.map(x => x.v);
    const ind = montarIndicador({ ...d, tolerancia: mm.tolerancia ?? d.tolerancia, dono: mm.dono || d.dono }, leit, hoje);
    const cores = h.map(x => x.cor).concat(ind.cor); const ra = exigeAcao(cores);
    return { ...ind, exige_acao: ra.exige ? ra.motivo : null, curva: leit.curva || null, periodicidade: d.periodicidade };
  });
  const abertas = acoes.filter(a => a.status === 'aberta').map(a => ({ ...a, indicador_nome: inds.find(i => i.id === a.indicador)?.nome || a.indicador }));
  const pendentes = inds.filter(i => i.exige_acao && !abertas.some(a => a.indicador === i.id)).map(i => ({ id: i.id, nome: i.nome, motivo: i.exige_acao }));
  const out = { ano, hoje, gerado_em: new Date().toISOString(), indicadores: inds, resumo: resumoPlacar(inds), acoes_abertas: abertas, pendentes_acao: pendentes,
    pergunta: 'Qual alavanca explica este vermelho e o que muda esta semana?', formato: 1 };
  try { await kv(ck, out); } catch (_) {}
  return out;
}

async function logar(por, tipo, antes, depois, motivo) {
  const l = (await kv('placar:log')) || []; l.push({ em: new Date().toISOString(), por: por || '—', tipo, antes: antes ?? null, depois: depois ?? null, motivo: tx(motivo, 300) });
  await kv('placar:log', l.slice(-500));
}
const soAdmin = req => { if (!req.sessao?.admin && req.atxCred !== 'processo') throw new Error('Só o CEO (perfil administrador) edita metas e o catálogo do placar.'); };
const quem = req => req.sessao?.login || req.usuario?.login || 'sistema';

// snapshot diário (cron): guarda a leitura do dia (valor + cor) para tendência e para o rito do vermelho
async function snapshot() {
  const ano = parseInt(hojeBR()), p = await montar(ano, { forcar: true }), hoje = hojeBR(), k = 'placar:hist:' + ano, h = (await kv(k)) || {};
  for (const i of p.indicadores) { if (i.real == null) continue; const a = h[i.id] || []; if (a.length && a[a.length - 1].d === hoje) a.pop(); a.push({ d: hoje, v: i.real, cor: i.cor }); h[i.id] = a.slice(-120); }
  await kv(k, h); return { ok: true, indicadores: Object.keys(h).length, hoje };
}

async function handler(req, res) {
  try {
    const q = req.query || {}; const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const action = b.action || q.action || (q.cron ? 'snapshot' : ''), p = b.params || b.payload || b, ano = parseInt(p.ano) || parseInt(hojeBR());
    const A = {
      status: async () => ({ placar: await montar(ano, { forcar: !!p._forcar }) }),
      tv: async () => ({ tv: paraTv(await montar(ano)) }),
      catalogo: async () => ({ catalogo: await defs(), metas: (await kv('placar:metas:' + ano)) || {}, manuais: (await kv('placar:manuais')) || {} }),
      catalogo_salvar: async () => { soAdmin(req); const id = tx(p.id, 40), d = CATALOGO.find(x => x.id === id); if (!d) throw new Error('indicador desconhecido'); if (!tx(p.motivo, 300)) throw new Error('Informe o motivo da alteração.');
        const o = (await kv('placar:catalogo')) || {}, antes = o[id] || {}, novo = { ...antes };
        for (const k of ['visivel_tv', 'arquivado']) if (p[k] !== undefined) novo[k] = !!p[k]; if (p.dono !== undefined) novo.dono = tx(p.dono, 60);
        if (d.privado && novo.visivel_tv) throw new Error('Indicador privado nunca vai à TV.');
        if (novo.visivel_tv) { const vis = (await defs()).filter(x => x.visivel_tv && x.id !== id && x.id !== 'receita_ano').length; if (vis >= 9 && id !== 'receita_ano') throw new Error('A TV comporta no máximo 9 linhas.'); }
        o[id] = novo; await kv('placar:catalogo', o); await logar(quem(req), 'catalogo', antes, novo, p.motivo); await kv('placar:cache:' + ano, null); return { ok: true }; },
      metas_salvar: async () => { soAdmin(req); const id = tx(p.id, 40); if (!CATALOGO.some(x => x.id === id)) throw new Error('indicador desconhecido'); if (!tx(p.motivo, 300)) throw new Error('Informe o motivo da alteração de meta.');
        if (['receita_ano', 'margem_liquida', 'margem_ebitda', 'caixa_minimo'].includes(id) || (id === 'recorrente_pct')) throw new Error('Esta meta é financeira: edite em Planejamento → Metas da Empresa (fonte única).');
        const k = 'placar:metas:' + ano, M = (await kv(k)) || {}, antes = M[id] || null, n = { ...(antes || {}) };
        if (p.meta !== undefined) n.meta = p.meta === '' ? null : num(p.meta); if (p.tolerancia !== undefined) n.tolerancia = p.tolerancia === '' ? null : num(p.tolerancia); if (p.dono !== undefined) n.dono = tx(p.dono, 60);
        if (p.faixa !== undefined) n.faixa = Array.isArray(p.faixa) && p.faixa.length === 2 && p.faixa.every(x => num(x) != null) ? p.faixa.map(Number) : null;
        M[id] = n; await kv(k, M); await logar(quem(req), 'meta:' + ano + ':' + id, antes, n, p.motivo); await kv('placar:cache:' + ano, null); return { ok: true, meta: n }; },
      manual_registrar: async () => { const id = tx(p.id, 40), d = CATALOGO.find(x => x.id === id); if (!d || d.fonte !== 'manual') throw new Error('Este indicador não é manual.'); const v = num(p.valor); if (v == null) throw new Error('Informe o valor.');
        const m = (await kv('placar:manuais')) || {}, a = m[id] || []; a.push({ valor: v, em: hojeBR(), por: quem(req), nota: tx(p.nota, 160) }); m[id] = a.slice(-60); await kv('placar:manuais', m); await kv('placar:cache:' + ano, null); return { ok: true }; },
      acao_salvar: async () => { const e = validarAcao(p); if (e) throw new Error(e); const L = (await kv('placar:acoes')) || [];
        const a = { id: 'a' + Date.now().toString(36), indicador: tx(p.indicador, 40), o_que_muda: tx(p.o_que_muda, 300), alavanca: tx(p.alavanca, 80), dono: tx(p.dono, 60), prazo: p.prazo, status: 'aberta', criado_em: new Date().toISOString(), por: quem(req) };
        L.push(a); await kv('placar:acoes', L.slice(-300)); await kv('placar:cache:' + ano, null); return { ok: true, acao: a }; },
      acao_listar: async () => ({ acoes: (await kv('placar:acoes')) || [] }),
      acao_revisar: async () => { const st = ['fechada', 'mantida', 'replanejada']; if (!st.includes(p.status)) throw new Error('Status: ' + st.join(', ')); const L = (await kv('placar:acoes')) || [], a = L.find(x => x.id === p.id); if (!a) throw new Error('ação não encontrada');
        if (p.status === 'replanejada') { const e = validarAcao({ ...a, prazo: p.prazo, dono: p.dono || a.dono }); if (e) throw new Error(e); a.prazo = p.prazo; a.dono = tx(p.dono || a.dono, 60); a.status = 'aberta'; a.replanejada = (a.replanejada || 0) + 1; } else a.status = p.status === 'mantida' ? 'aberta' : 'fechada';
        a.revisada_em = new Date().toISOString(); a.revisao = p.status; await kv('placar:acoes', L); await kv('placar:cache:' + ano, null); return { ok: true, acao: a }; },
      log_listar: async () => ({ log: ((await kv('placar:log')) || []).slice(-100).reverse() }),
      snapshot: () => snapshot(),
    };
    if (!A[action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await A[action]()) });
  } catch (e) { console.error('[placar]', e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'placar');
export { montar as placarMontar, snapshot as placarSnapshot };
