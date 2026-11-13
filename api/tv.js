import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// v3.482: código da versão no canto da TV — lido do index.html publicado (mesma versão ATX-vX.YY do sistema); sem o arquivo, o commit do deploy
let _ver = null;
const versao = () => { if (_ver != null) return _ver; try { const h = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html'), 'utf8'); _ver = (h.match(/ATX-v\d+\.\d+/) || [])[0] || ''; } catch (_) { _ver = ''; }
  if (!_ver && process.env.VERCEL_GIT_COMMIT_SHA) _ver = 'build ' + process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7); return _ver; };
// api/tv.js — v3.150 · GESTÃO À VISTA (TV) · trilha T4
// Página em tela cheia para a TV da empresa, aberta por LINK DIRETO com código (sem login na TV):
//   /tv/<código>  → slides que giram sozinhos: Financeiro (faturamento, lucro, margem, caixa, a receber/pagar, evolução no ano)
//                   e Comercial (meta do mês/ano, propostas, win rate, funil de 30 dias, semáforo do time).
// Só números agregados; nada de extrato, cliente a cliente ou dado pessoal. O código é revogável a qualquer momento.
// Dados: cache de 10 min (um painel aberto o dia todo não sobrecarrega o QuickBooks/HubSpot).
// POST (logado): config · gerar · revogar · salvar { rotacao_s, slides }   GET público: ?t=<código> (página) · ?t=<código>&dados=1 (JSON)

const RX_COD = /^[A-Za-z0-9]{10,40}$/;
const CACHE_MS = 10 * 60000;
let _sql = null;
async function getSql() {
  if (_sql) return _sql; const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL);
  await _sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`; return _sql;
}
async function kv(k, v) {
  const sql = await getSql();
  if (v === undefined) { const r = (await sql`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null; try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; } }
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v;
}
const CFG_PADRAO = { codigo: null, criado_em: null, rotacao_s: 25, slides: ['financeiro', 'comercial', 'qualidade'] };
const SLIDES_OK = ['financeiro', 'comercial', 'marketing', 'qualidade', 'projetos', 'projetos_tarefas', 'metas', 'objetivos', 'riscos'];
// v3.152: o slide Qualidade entra nas TVs já configuradas (uma vez; depois vale o que o usuário salvar)
const config = async () => { const c = { ...CFG_PADRAO, ...((await kv('tv:config')) || {}) }; if (!c.v152) { c.slides = [...new Set([...(c.slides || []), 'qualidade'])]; c.v152 = true; } if (!c.v156) { c.slides = [...new Set([...(c.slides || []), 'projetos'])]; c.v156 = true; } if (!c.v332) { const sl = [...(c.slides || [])]; const i = sl.indexOf('comercial'); sl.splice(i >= 0 ? i + 1 : sl.length, 0, 'marketing'); c.slides = [...new Set(sl)]; c.v332 = true; } /* v3.332: slide de marketing digital */ if (!c.v479) { const sl = [...(c.slides || [])]; const i = sl.indexOf('projetos'); sl.splice(i >= 0 ? i + 1 : sl.length, 0, 'projetos_tarefas'); c.slides = [...new Set(sl)]; c.v479 = true; } /* v3.479: tarefas e rentabilidade por projeto */ if (!c.v482) { c.slides = [...new Set([...(c.slides || []), 'metas', 'objetivos', 'riscos'])]; c.v482 = true; } /* v3.482: metas anuais, objetivos e riscos */ if (c.nomes_projetos === undefined) c.nomes_projetos = true; return c; };
const codigoNovo = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const b = crypto.randomBytes(12); let s = ''; for (const x of b) s += a[x % a.length]; return s; };
const base = () => { const b = process.env.MEDIA_PUBLIC_BASE || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'atlantyx-os.vercel.app'; return (b.startsWith('http') ? b : 'https://' + b).replace(/\/$/, ''); };

// chamada interna às APIs do sistema (mesma credencial da requisição)
async function chamar(mod, body, ms = 30000) {
  const m = await import('./' + mod + '.js'); let out = null;
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(b) { try { out = JSON.parse(b); } catch (_) { out = { raw: b }; } return this; }, setHeader() {}, end() { return this; } };
  let tm; await Promise.race([m.default({ method: 'POST', body, query: {}, headers: {}, url: '/api/' + mod }, res), new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('demorou mais de ' + ms / 1000 + 's')), ms); })]).finally(() => clearTimeout(tm));
  if (!out || out.success === false) throw new Error(out?.error || 'sem resposta'); return out;
}
const num = v => (v == null || isNaN(+v)) ? null : +v;

// v3.152: QUALIDADE (farol) — termos de faturamento, dados do QuickBooks e projetos. Mesmas regras das telas de origem:
// termos → lib/termo-regras (pendências críticas do Kanban de Faturamento) · QuickBooks → Higienização de dados ·
// projetos → farol do último status report (Painel Mestre do PMO).
const CHECKS_QB = ['qb_off', 'qb_token', 'conciliacao', 'bills_pagas', 'dup_qb', 'sem_categoria', 'prev_dup'];
const TIPO_TERMO = { incompleto: 'cadastro incompleto', sem_nota: 'sem nota fiscal', sem_data_pagamento: 'sem data de pagamento', pagamento_vencido: 'pagamento vencido', em_atraso: 'parado há 35+ dias' };
function qualidade(T, eT, H, eH, PM, ePM, MA) {
  const out = {};
  { const todos = Object.entries(T?.colunas || {}).flatMap(([st, l]) => (l || []).map(t => ({ ...t, status: t.status || st })));
    const abertos = todos.filter(t => !['pago', 'concluido'].includes(t.status)), errados = abertos.filter(t => (t.pendencias_criticas || []).length);
    const vT = t => num(t.nf_soma) > 0 ? num(t.nf_soma) : (num(t.valor_total_termo) || 0);
    const por = {}, porV = {}; errados.forEach(t => [...new Set((t.pendencias_criticas || []).map(p => p.tipo))].forEach(k => { por[k] = (por[k] || 0) + 1; porV[k] = (porV[k] || 0) + vT(t); }));
    const pe = abertos.length ? errados.length / abertos.length : 0;
    out.termos = { erro: eT, abertos: T ? abertos.length : null, corretos: T ? abertos.length - errados.length : null, errados: T ? errados.length : null,
      motivos: Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ motivo: TIPO_TERMO[k] || k, qtd: n, valor: Math.round(porV[k] || 0) })),
      valor_pendente: T ? Math.round(errados.reduce((a, t) => a + vT(t), 0)) : null, // v3.475: R$ travado nos termos com pendência
      farol: !T ? null : !errados.length ? 'verde' : pe <= 0.2 ? 'amarelo' : 'vermelho' }; }
  { const it = (H?.itens || []).filter(x => CHECKS_QB.includes(x.id) && x.qtd), alta = it.some(x => x.gravidade === 'alta');
    out.qb = { erro: eH || ((H?.erros || []).length ? H.erros.slice(0, 2).join(' · ') : null), checagens: CHECKS_QB.length, corretas: H ? CHECKS_QB.length - it.length : null, com_erro: H ? it.length : null,
      registros_errados: H ? it.reduce((a, x) => a + (+x.qtd || 0), 0) : null, problemas: it.slice(0, 4).map(x => ({ titulo: String(x.titulo || x.id).substring(0, 70), qtd: +x.qtd || 0, gravidade: x.gravidade })),
      farol: !H ? null : alta ? 'vermelho' : it.length ? 'amarelo' : 'verde' }; }
  if (MA?.resumo) { const r = MA.resumo; // v3.156: módulo de projetos (Maestro) — mesma regra de farol de lá
    out.projetos = { erro: null, fonte: MA.fonte, total: r.total, em_dia: r.verde, atencao: r.amarelo, atrasados: r.vermelho, sem_report: r.total - (r.por_report || 0), com_bloqueio: r.vencidos, desatualizados: r.concluem_mes,
      rotulos: ['Passaram da data de conclusão', 'Concluem este mês', 'Farol calculado (sem report da semana)'], farol: r.vermelho ? 'vermelho' : r.amarelo ? 'amarelo' : 'verde' };
  } else { const r = PM?.resumo || null;
    out.projetos = { fonte: PM?.fonte === 'externo' ? 'Sistema externo de projetos' : 'Base local do Atlantyx OS (módulo de projetos não respondeu)', erro: ePM, total: r ? r.total : null, em_dia: r ? r.verde : null, atencao: r ? r.amarelo : null, atrasados: r ? r.vermelho : null, sem_report: r ? (r.sem_report || 0) : null,
      // só contagens — a página da TV é pública (link) e não mostra nome de projeto ou cliente
      com_bloqueio: r ? (r.com_bloqueio || 0) : null, desatualizados: r ? (Array.isArray(r.pendentes_de_atualizacao) ? r.pendentes_de_atualizacao.length : (r.pendentes_de_atualizacao || 0)) : null,
      farol: !r ? null : r.vermelho ? 'vermelho' : (r.amarelo || r.sem_report) ? 'amarelo' : 'verde' }; }
  return out;
}
// v3.280: semáforo de meta pelo RITMO — mesma regra das Metas da Empresa (Dashboard ao vivo):
// verde = bateu a meta ou ritmo ≥ 100% do esperado até hoje · amarelo ≥ 85% · vermelho abaixo
function semMeta(real, meta, frac) {
  if (real == null || !meta) return null; if (real >= meta) return 'verde';
  const esp = meta * (frac == null ? 1 : Math.max(0.01, frac)); const r = real / esp;
  return r >= 1 ? 'verde' : r >= 0.85 ? 'amarelo' : 'vermelho';
}
// v3.280: termos do Kanban de Faturamento — faturados no mês (NF emitida no mês), a faturar e aguardando pagamento
function termosResumo(T, mes) {
  const todos = Object.entries(T?.colunas || {}).flatMap(([st, l]) => (l || []).map(t => ({ ...t, status: t.status || st })));
  const val = t => num(t.nf_soma) > 0 ? num(t.nf_soma) : (num(t.valor_total_termo) || 0), soma = L => Math.round(L.reduce((a, t) => a + val(t), 0) * 100) / 100;
  const fat = todos.filter(t => String(t.data_emissao || '').substring(0, 7) === mes);
  const aFat = todos.filter(t => ['elaboracao', 'aprovacao', 'emissao_nf'].includes(t.status));
  const aPag = todos.filter(t => ['envio_nf', 'pagamento'].includes(t.status));
  return { faturados_mes: { qtd: fat.length, valor: soma(fat) }, a_faturar: { qtd: aFat.length, valor: soma(aFat) }, aguardando_pagamento: { qtd: aPag.length, valor: soma(aPag) } };
}
// v3.479: RENTABILIDADE por projeto (tela Custo por Projeto & Piso da Hora) — margem em R$/mês nos últimos 3 meses fechados
// contra os 3 meses anteriores (tendência ▲/▼). Cálculo pesado (QuickBooks + Maestro): guardado por 6 horas.
async function rentabilidade() {
  const c = await kv('tv:rentab').catch(() => null); if (c && Date.now() - c.em < 6 * 3600e3) return c.v;
  const hoje = new Date(Date.now() - 3 * 3600000), ym = d => d.toISOString().substring(0, 7), menos = n => { const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - n, 15)); return ym(d); };
  const [A, B] = await Promise.all([chamar('financeiro', { action: 'custo_projetos', params: { meses: 3, mes_fim: menos(1) } }, 58000), chamar('financeiro', { action: 'custo_projetos', params: { meses: 3, mes_fim: menos(4) } }, 58000).catch(() => null)]);
  const ant = Object.fromEntries(((B && B.projetos) || []).map(p => [p.projeto, p]));
  const MS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'], rot = (a, b) => MS[+a.slice(5) - 1] + ' a ' + MS[+b.slice(5) - 1] + '/' + b.slice(2, 4);
  const v = { periodo: rot(menos(3), menos(1)), anterior: rot(menos(6), menos(4)), projetos: (A.projetos || []).filter(p => p.receita_mes > 0 || p.custo_direto_mes > 0).map(p => { const b = ant[p.projeto];
    return { projeto: String(p.projeto).substring(0, 60), receita_mes: p.receita_mes, margem_mes: p.margem_mes, margem_pct: p.margem_pct, margem_mes_ant: b ? b.margem_mes : null, variacao: b ? Math.round((p.margem_mes - b.margem_mes) * 100) / 100 : null }; })
    .sort((a, b) => b.margem_mes - a.margem_mes) };
  await kv('tv:rentab', { em: Date.now(), v }).catch(() => {}); return v;
}
// v3.482: ESTRATÉGIA na TV — últimos OKRs (com o status mais recente), análise de riscos e planejamento estratégico gerados no S1
// (s1_historico), última síntese da Sala de Estratégia (est_sessoes). Só leitura; tabela ausente = bloco vazio, sem erro.
const _tx = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().substring(0, n);
const _farTx = v => { const t = String(v || '').toLowerCase(); return /verde|🟢/.test(t) ? 'verde' : /amarel|🟡/.test(t) ? 'amarelo' : /vermelh|🔴/.test(t) ? 'vermelho' : null; };
const _nivel = v => { const t = String(v || '').toLowerCase(); return /alt/.test(t) ? 3 : /m[eé]d/.test(t) ? 2 : /baix/.test(t) ? 1 : 0; };
async function estrategiaTv() {
  const sql = await getSql(), H = {}, out = { erro: null };
  try { const r = await sql`SELECT DISTINCT ON (tipo) tipo, dados, criado_em FROM s1_historico WHERE tipo IN ('okr_gerador','status_okr','analise_riscos','planejamento_estrategico') ORDER BY tipo, criado_em DESC`;
    r.forEach(x => { let d = x.dados; if (typeof d === 'string') try { d = JSON.parse(d); } catch (_) { d = null; } H[x.tipo] = { em: x.criado_em, d: d || {} }; }); } catch (e) { out.erro = 'histórico do planejamento: ' + e.message; }
  let ses = null; try { ses = (await sql`SELECT tema, sintese, status, atualizado_em FROM est_sessoes WHERE sintese IS NOT NULL ORDER BY atualizado_em DESC LIMIT 1`)[0] || null; } catch (_) {}
  let S = ses?.sintese; if (typeof S === 'string') try { S = JSON.parse(S); } catch (_) { S = null; }
  // OBJETIVOS: OKRs gerados + o status (progresso/semáforo) se for mais novo que eles
  const g = H.okr_gerador, st = H.status_okr, G = g ? (g.d.okrs || g.d) : null, ST = st ? (st.d.okr || st.d) : null;
  const usaSt = ST?.objetivos?.length && (!g || new Date(st.em) >= new Date(g.em));
  const objs = (usaSt ? ST.objetivos : (G?.objetivos || [])).slice(0, 5).map((o, i) => { const base = (G?.objetivos || [])[i] || {};
    return { objetivo: _tx(o.objetivo || base.objetivo, 140), progresso: usaSt ? num(o.progresso_geral) : null, farol: usaSt ? _farTx(o.semaforo) : null,
      krs: (o.krs || base.krs || []).slice(0, 4).map(k => ({ kr: _tx(k.kr, 120), meta: _tx(k.meta, 30), atual: _tx(usaSt ? k.atual : k.baseline, 30), unidade: _tx(k.unidade, 12), prazo: _tx(k.prazo, 12),
        progresso: usaSt ? num(k.progresso) : null, farol: usaSt ? _farTx(k.semaforo) : null })) }; });
  out.okr = objs.length ? { trimestre: _tx(G?.trimestre || ST?.trimestre, 20), tema: _tx(G?.tema_do_trimestre, 160), em: g?.em || st?.em, status_em: usaSt ? st.em : null, saude: usaSt ? _farTx(ST.saude_geral) : null, objetivos: objs, nao_fazer: (G?.anti_objetivos || []).slice(0, 3).map(x => _tx(x, 110)) }
    : (S?.objetivos?.length ? { origem: 'sala', tema: _tx(ses.tema, 160), em: ses.atualizado_em, objetivos: S.objetivos.slice(0, 5).map(o => ({ objetivo: _tx(o.objetivo, 140), progresso: null, farol: null, krs: (o.kr || o.krs || []).slice(0, 3).map(k => ({ kr: _tx(typeof k === 'string' ? k : k.kr, 120) })) })), nao_fazer: (S.nao_fazer || []).slice(0, 3).map(x => _tx(x, 110)) } : null);
  const PL = H.planejamento_estrategico?.d?.plano || null;
  out.planejamento = PL ? { em: H.planejamento_estrategico.em, v90: _tx(PL.visao_90_dias, 220), a1: _tx(PL.visao_1_ano, 220), a3: _tx(PL.visao_3_anos, 220), estrategia: _tx(PL.estrategia_competitiva, 160),
    prioridades: (PL.prioridades_estrategicas || []).slice(0, 5).map(p => ({ titulo: _tx(p.prioridade, 90), horizonte: _tx(p.horizonte, 20), impacto: _tx(p.impacto_receita, 30) })) } : null;
  out.sala = S ? { tema: _tx(ses.tema, 140), status: ses.status, em: ses.atualizado_em, decisao: _tx(S.decisao, 260), proximos: (S.proximos_90_dias || []).slice(0, 4).map(x => _tx(typeof x === 'string' ? x : (x.acao || x.titulo), 110)),
    riscos: (S.riscos || []).slice(0, 5).map(r => ({ risco: _tx(r.risco, 140), mitigacao: _tx(r.mitigacao, 140) })) } : null;
  // RISCOS: última análise de riscos (prob × impacto)
  const R = H.analise_riscos?.d?.riscos || null;
  out.riscos = R?.riscos?.length ? { em: H.analise_riscos.em, nivel: _tx(R.nivel_risco_geral, 10), n1: _tx(R.risco_numero_1, 260), contingencia: _tx(R.plano_contingencia_receita, 200),
    matriz: { criticos: (R.matriz_risco?.criticos || []).length, monitorar: (R.matriz_risco?.monitorar || []).length, aceitar: (R.matriz_risco?.aceitar || []).length },
    lista: R.riscos.map(r => ({ categoria: _tx(r.categoria, 20), risco: _tx(r.risco, 150), prob: _tx(r.probabilidade, 8), impacto: _tx(r.impacto, 8), score: _nivel(r.probabilidade) * _nivel(r.impacto),
      valor: _tx(r.impacto_financeiro_estimado, 40), mitigacao: _tx(r.mitigacao, 150), dono: _tx(r.responsavel, 20), prazo: _tx(r.prazo_mitigacao, 14), status: _tx(r.status, 16) })).sort((a, b) => b.score - a.score).slice(0, 8) } : null;
  return out;
}
async function montarDados() {
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().substring(0, 10), mes = hoje.substring(0, 7), ano = parseInt(hoje);
  const [pr, kp, me, fn, tq, hg, pm, ma, cf, mk, ks, oLi, oIg, oFb, rt, fnA, meA, pe, es] = await Promise.allSettled([
    chamar('financeiro', { action: 'painel_resumo', params: { _max_idade: 300 } }), chamar('financeiro', { action: 'resultado_kpis', params: { _max_idade: 300 } }, 45000),
    // v3.280: metas do ano = as mesmas do Dashboard ao vivo (Metas da Empresa) · funil = o mesmo do Dashboard ao vivo (aba Vendas)
    chamar('financeiro', { action: 'metas_empresa_status', params: { ano, com_crm: false } }, 45000),
    chamar('financeiro', { action: 'funil_vendas', params: { tipo: 'mes', ref: mes, pipeline: 'todos' } }, 58000),
    chamar('faturamento', { action: 'termo_list', payload: {} }), chamar('financeiro', { action: 'higienizacao_dados', params: {} }, 60000), chamar('pmo', { action: 'painel_mestre', payload: {} }, 45000), chamar('pmo', { action: 'maestro_painel', payload: {} }, 45000), config(), chamar('metricool', { action: 'patrocinado_listar' }, 40000),
    chamar('financeiro', { action: 'kpis_saude', params: {} }, 45000),
    // v3.479: ORGÂNICO — publicações do mês no Metricool (mesma fonte do Dashboard de Desempenho)
    ...['linkedin', 'instagram', 'facebook'].map(rede => chamar('metricool', { action: 'metricas_posts', payload: { rede, inicio: mes + '-01', fim: hoje } }, 40000)), rentabilidade(),
    // v3.482: metas anuais (funil do ANO, ano anterior para o crescimento, plano estratégico vigente) e estratégia (OKRs, riscos)
    chamar('financeiro', { action: 'funil_vendas', params: { tipo: 'ano', ref: String(ano), pipeline: 'todos' } }, 58000), chamar('financeiro', { action: 'metas_empresa_status', params: { ano: ano - 1, com_crm: false } }, 45000),
    chamar('estrategia', { action: 'plano_estr_obter' }, 30000), estrategiaTv()]); // v3.357: previsto do mês (programado até o fim do mês)
  const v = p => p.status === 'fulfilled' ? p.value : null, erro = p => p.status === 'rejected' ? String(p.reason?.message || p.reason).substring(0, 120) : null;
  const P = v(pr) || {}, K = v(kp)?.resultado || {}, Pm = K.periodo_res || {}, M = K.metas_periodo || {};
  const ME = v(me)?.metas || {}, FA = ME.faturamento || {}, FN = v(fn) || {};
  const MA = v(ma), CF = v(cf) || {}, rank = { vermelho: 0, amarelo: 1, verde: 2 };
  const proj = MA ? { erro: null, fonte: MA.fonte, resumo: MA.resumo, nomes: CF.nomes_projetos !== false,
      lista: MA.projetos.filter(p => p.ativo).sort((a, b) => (rank[a.farol] ?? 3) - (rank[b.farol] ?? 3) || String(a.conclusao || '9').localeCompare(String(b.conclusao || '9')))
        .map((p, i) => ({ tarefas_atraso: p.tarefas_atraso || 0, tarefas_risco: p.tarefas_risco || 0, tarefas_atraso_lista: CF.nomes_projetos !== false ? (p.tarefas_atraso_lista || []) : [], tarefas_risco_lista: CF.nomes_projetos !== false ? (p.tarefas_risco_lista || []) : [], nome_real: String(p.nome), nome: CF.nomes_projetos !== false ? String(p.nome).substring(0, 60) : 'Projeto ' + (i + 1), gerente: CF.nomes_projetos !== false ? String(p.gerente || '').substring(0, 30) : '', conclusao: p.conclusao, pct: p.pct, planejado: p.planejado, desvio: p.desvio, farol: p.farol, dias_atraso: p.dias_atraso, motivo: p.origem === 'status report' ? 'farol do status report' + ((p.motivos || [])[0] ? ' · ' + p.motivos[0] : '') : ((p.motivos || [])[0] || null) })) }
    : (() => { const r = v(pm)?.resumo; return { erro: r ? null : 'Módulo de projetos: ' + (erro(ma) || 'sem resposta'), fonte: 'Base local do Atlantyx OS', resumo: r ? { total: r.total, verde: r.verde, amarelo: r.amarelo, vermelho: r.vermelho } : null, lista: [] }; })();
  const realMes = num(Pm.faturamento), metaMes = num(M.faturamento), frMes = num(M.fracao_decorrida);
  const qual = qualidade(v(tq), erro(tq), v(hg), erro(hg), v(pm), erro(pm), MA);
  if (qual.termos && v(tq)) Object.assign(qual.termos, termosResumo(v(tq), mes));
  // v3.332: MARKETING DIGITAL — campanhas pagas ativas (e encerradas nos últimos 7 dias) com farol de leads meta × realizado
  const mkt = (() => { const L = v(mk)?.campanhas; if (!L) return { erro: erro(mk) || 'sem resposta das campanhas', campanhas: [] };
    const d = x => new Date(String(x) + 'T12:00:00').getTime(), h = d(hoje), sete = h - 7 * 864e5;
    const lista = L.map(c => { const e = String(c.estado_meta || '').toUpperCase(), fim = c.fim ? d(c.fim) : null, ini = c.inicio ? d(c.inicio) : null;
      const acabou = c.encerrada || (fim != null && fim < h), analise = /REVIEW|PROCESS|PENDING/.test(e), ativa = e === 'ACTIVE' && !acabou;
      const st = acabou ? 'encerrada' : ativa ? 'ativa' : analise ? 'em análise' : /DISAPPROVED/.test(e) ? 'reprovada' : 'pausada';
      const tot = ini != null && fim != null ? Math.max(1, (fim - ini) / 864e5 + 1) : 1, dec = ini != null ? Math.max(0, Math.min(tot, (h - ini) / 864e5 + 1)) : tot;
      const frac = acabou || st === 'pausada' ? 1 : dec / tot, meta = num(c.meta_leads), leads = num(c.funil?.leads) || 0, r = c.resultado || {};
      return { nome: String(c.nome || '').substring(0, 60), rede: c.rede === 'linkedin' ? 'LinkedIn' : 'Instagram', status: st, inicio: c.inicio, fim: c.fim, local: c.local ? String(c.local.endereco || '').split(',')[0].substring(0, 30) : null,
        gasto: num(r.gasto) || 0, impressoes: num(r.impressoes) || 0, cliques: num(r.cliques_link) || 0, visitas: num(c.funil?.visitas) || 0, leads, meta, frac,
        esperado: meta ? Math.round(meta * frac * 10) / 10 : null, pct: meta ? Math.round(leads / meta * 100) : null, farol: semMeta(leads, meta, frac), _fim: fim }; })
      .filter(c => c.status === 'ativa' || c.status === 'em análise' || (c._fim != null && c._fim >= sete));
    const rank = { vermelho: 0, amarelo: 1, verde: 2 }, ordSt = { ativa: 0, 'em análise': 1, pausada: 2, reprovada: 2, encerrada: 3 };
    lista.sort((a, b) => (ordSt[a.status] - ordSt[b.status]) || ((rank[a.farol] ?? 3) - (rank[b.farol] ?? 3)) || b.gasto - a.gasto);
    lista.forEach(c => delete c._fim);
    const T = lista.reduce((a, c) => { a.gasto += c.gasto; a.impressoes += c.impressoes; a.cliques += c.cliques; a.leads += c.leads; if (c.meta) { a.meta += c.meta; a.esperado += c.esperado; } return a; }, { gasto: 0, impressoes: 0, cliques: 0, leads: 0, meta: 0, esperado: 0 });
    T.farol = T.meta ? (T.leads >= T.meta ? 'verde' : T.leads / Math.max(0.01, T.esperado) >= 1 ? 'verde' : T.leads / Math.max(0.01, T.esperado) >= 0.85 ? 'amarelo' : 'vermelho') : null;
    return { erro: null, campanhas: lista, total: T, ativas: lista.filter(c => c.status === 'ativa').length }; })();
  const organico = (() => { const R = [['LinkedIn', oLi], ['Instagram', oIg], ['Facebook', oFb]], redes = [], posts = [];
    for (const [nome, p] of R) { const d = v(p); if (!d) { redes.push({ rede: nome, erro: erro(p) }); continue; } const t = d.totais || {};
      const eng = (num(t.curtidas) || 0) + (num(t.comentarios) || 0) + (num(t.compartilhamentos) || 0);
      redes.push({ rede: nome, posts: num(t.posts) ?? (d.posts || []).length, impressoes: num(t.impressoes) || 0, cliques: num(t.cliques) || 0, curtidas: num(t.curtidas) || 0, comentarios: num(t.comentarios) || 0, compartilhamentos: num(t.compartilhamentos) || 0, engajamento: eng, aviso: d.diagnostico?.api_ok === false ? 'sem acesso às métricas' : null });
      (d.posts || []).forEach(x => posts.push({ rede: nome, texto: String(x.texto || '').replace(/\s+/g, ' ').substring(0, 110), data: String(x.data || '').substring(0, 10), impressoes: num(x.impressoes) || 0, cliques: num(x.cliques) || 0, engajamento: (num(x.curtidas) || 0) + (num(x.comentarios) || 0) + (num(x.compartilhamentos) || 0) })); }
    const T = redes.reduce((a, r) => { ['posts', 'impressoes', 'cliques', 'engajamento', 'curtidas', 'comentarios', 'compartilhamentos'].forEach(k => { a[k] += r[k] || 0; }); return a; }, { posts: 0, impressoes: 0, cliques: 0, engajamento: 0, curtidas: 0, comentarios: 0, compartilhamentos: 0 });
    // v3.484: melhores publicações = a melhor de CADA rede primeiro (antes as 4 do LinkedIn ocupavam tudo) e depois as demais
    const nota = x => x.impressoes + x.engajamento * 10, ord = posts.slice().sort((a, b) => nota(b) - nota(a)), top = [];
    ['LinkedIn', 'Instagram', 'Facebook'].forEach(r => { const x = ord.find(y => y.rede === r); if (x) top.push(x); }); ord.forEach(x => { if (top.length < 4 && !top.includes(x)) top.push(x); });
    return { redes, total: T, top: top.sort((a, b) => nota(b) - nota(a)).slice(0, 4), erro: redes.every(r => r.erro) ? redes[0].erro : null }; })();
  mkt.organico = organico;
  const rent = v(rt) ? { ...v(rt), erro: null } : { erro: erro(rt), projetos: [] };
  if (CF.nomes_projetos === false) rent.projetos = (rent.projetos || []).map((p, i) => ({ ...p, projeto: 'Projeto ' + (i + 1) }));
  proj.rentabilidade = rent; (proj.lista || []).forEach(p => { delete p.nome_real; });
  // v3.482: METAS ANUAIS — financeiras (QuickBooks/Metas da Empresa), clientes e vendas (funil do ano no HubSpot), saúde e alavancas do plano
  const metas = (() => { const MA_ = v(meA)?.metas || {}, FY = v(fnA) || {}, KS = v(ks)?.kpis || {}, PE = v(pe) || {}, VIG = PE.vigente?.plano || null, SIM = PE.sim_vigente, REA = PE.realizado;
    const etA = (FY.etapas || []).map(L => ({ nome: L.nome, ganho: !!L.ganho, contatos: !!L.contatos || L.id === 'contatos_hs', real_qtd: L.real?.qtd ?? null, real_valor: L.real?.valor ?? null,
      meta_qtd: L.meta?.qtd ?? null, meta_valor: L.meta?.valor ?? null, meta_qtd_hoje: L.meta?.qtd_ate_hoje ?? null, meta_valor_hoje: L.meta?.valor_ate_hoje ?? null, farol: L.farol && L.farol !== 'sem_meta' ? L.farol : null }));
    const ant = num(MA_.realizado?.faturamento);
    return { ano, erro: [erro(me), erro(fnA)].filter(Boolean).join(' · ') || null,
      fat: FA.meta != null ? { meta: num(FA.meta), real: num(FA.realizado), pct: num(FA.pct_atingido), esperado: num(FA.esperado_ate_hoje), falta: num(FA.falta), projecao: num(FA.projecao_fechamento), projecao_carteira: num(FA.projecao_com_carteira),
        por_mes: num(FA.por_mes_necessario), meses_rest: num(FA.meses_restantes), farol: FA.semaforo && FA.semaforo !== 'cinza' ? FA.semaforo : null } : null,
      margem: ME.margem ? { meta: num(ME.margem.meta_pct), real: num(ME.margem.realizado_pct), dif: num(ME.margem.diferenca_pp), lucro_meta: num(ME.margem.lucro_meta), lucro_real: num(ME.margem.lucro_realizado), farol: ME.margem.semaforo && ME.margem.semaforo !== 'cinza' ? ME.margem.semaforo : null } : null,
      carteira: ME.carteira ? { prevista: num(ME.carteira.prevista), cobre_pct: num(ME.carteira.cobre_pct) } : null, fracao: num(ME.fracao_ano),
      anterior: ant != null ? { ano: ano - 1, faturamento: ant, lucro: num(MA_.realizado?.lucro_liquido), margem: num(MA_.realizado?.margem_pct) } : null,
      saude: v(ks) ? { semaforo: KS.semaforo || null, runway: num(KS.runway_meses), runway_farol: KS.runway_semaforo || null, liquidez: num(KS.liquidez_corrente), caixa: num(KS.saldo_caixa), burn: num(KS.burn_rate_mensal) } : null,
      vendas: FY.etapas ? { ganho: FY.resumo?.ganho || null, meta: num(FY.resumo?.meta), cobertura: num(FY.resumo?.cobertura_pct), taxa: num(FY.resumo?.taxa_ganho_pct), perdidos: FY.resumo?.perdidos || null,
        aberto: FY.resumo?.aberto ? { qtd: FY.resumo.aberto.qtd, valor: FY.resumo.aberto.valor } : null, ticket: num(FY.meta_base?.ticket_medio), leads: FY.leads || null, etapas: etA, decorrido: num(FY.periodo?.decorrido_pct) } : null,
      plano: VIG ? { nome: _tx(VIG.nome, 40), horizonte: _tx(VIG.horizonte, 10), versao: PE.vigente.versao, metas: VIG.metas, total: SIM?.total ? { faturamento: SIM.total.faturamento, contratos: SIM.total.contratos, leads_mes: SIM.total.leads_mes, reunioes_mes: SIM.total.reunioes_mes } : null,
        alavancas: VIG.alavancas.filter(a => a.status !== 'pausada' && (a.receita_meta || a.peso_campanha)).map(a => { const lin = (SIM?.linhas || []).find(l => l.id === a.id) || {}, r = (REA?.alavancas || []).find(x => x.id === a.id) || {};
          return { nome: _tx(a.nome, 60), status: a.status, receita_meta: a.receita_meta, receita_real: a.receita_realizada, contratos: lin.contratos || 0, leads_ano: lin.leads || 0, leads_90d: r.leads_90d ?? null, reunioes_90d: r.reunioes_90d ?? null }; }).slice(0, 9), visao: VIG.visao || null, prioridades: (VIG.prioridades || []).slice(0, 5).map(x => _tx(x, 130)) } : null };
  })();
  const estr = v(es) || { erro: erro(es) };
  return { qual, proj, mkt, metas, estr, gerado_em: new Date().toISOString(), mes_ref: mes,
    // v3.357: cartões no padrão do Dashboard — Real · Previsto · Meta · % atingido · farol (previsto = real + programado até o fim do mês)
    res: (() => { const KS = v(ks)?.kpis || null, cx = K.regime === 'caixa';
      const dF = KS ? num(cx ? KS.contas_receber_mes : KS.receita_prevista_mes) : null, dG = KS ? num(KS.contas_pagar_mes) : null, dR = dF != null && dG != null ? dF - dG : null;
      const pv = (r, d) => r == null || d == null ? null : r + d;
      const fP = pv(num(Pm.faturamento), dF), lP = pv(num(Pm.lucro_liquido), dR);
      return { regime: K.regime || null, frac: frMes, tem_previsto: !!KS,
        fat: { real: num(Pm.faturamento), prev: fP, meta: num(M.faturamento) }, gas: { real: num(Pm.gastos_totais), prev: pv(num(Pm.gastos_totais), dG), meta: num(M.gastos), menor: true },
        eb: { real: num(Pm.ebitda), prev: pv(num(Pm.ebitda), dR), meta: num(M.ebitda) }, luc: { real: num(Pm.lucro_liquido), prev: lP, meta: num(M.lucro) },
        mg: { real: num(Pm.margem_liquida_pct), prev: fP > 0 && lP != null ? Math.round(lP / fP * 1000) / 10 : null, meta: num(M.margem_pct ?? K.meta_margem?.pct), pct: true } }; })(),
    fin: { erro: [erro(pr), erro(kp), erro(me), ...((K.erros || []).slice(0, 2))].filter(Boolean).join(' · ') || null, regime: K.regime || null,
      mes: { faturamento: realMes, meta_faturamento: metaMes, pct: metaMes ? Math.round(realMes / metaMes * 1000) / 10 : null, esperado: metaMes && frMes != null ? Math.round(metaMes * frMes) : null, fracao_decorrida: frMes,
        semaforo: semMeta(realMes, metaMes, frMes), meta_fonte: M.fonte?.faturamento || null,
        lucro: num(Pm.lucro_liquido), margem_pct: num(Pm.margem_liquida_pct), meta_margem_pct: num(K.meta_margem?.pct), semaforo_margem: K.semaforo_margem || null },
      ano: { ano, faturamento: num(FA.realizado ?? ME.realizado?.faturamento), meta_faturamento: num(FA.meta ?? ME.meta?.faturamento), pct: num(FA.pct_atingido), esperado: num(FA.esperado_ate_hoje), falta: num(FA.falta),
        projecao: num(FA.projecao_fechamento), semaforo: FA.semaforo && FA.semaforo !== 'cinza' ? FA.semaforo : null, fracao_decorrida: num(ME.fracao_ano) != null ? num(ME.fracao_ano) / 100 : null,
        lucro: num(ME.realizado?.lucro_liquido), margem_pct: num(ME.realizado?.margem_pct) },
      caixa: num(P.saldoCaixa), receber: num(P.contasReceber?.total ?? P.aReceber), receber_vencido: num(P.contasReceber?.vencido), receber_30d: num(P.contasReceber?.a_vencer_30d), pagar: num(P.contasPagar?.total ?? P.aPagar),
      mensal: (K.mensal || []).map(m => ({ mes: m.mes, faturamento: num(m.faturamento), lucro: num(m.lucro_liquido) })) },
    com: { erro: erro(fn), indisponivel: FN.indisponivel || null,
      funil: FN.etapas ? { rotulo: FN.periodo?.rotulo, decorrido_pct: FN.periodo?.decorrido_pct, pipeline: FN.pipeline?.nome || '', lidos: FN.total_negocios_lidos ?? null, resumo: FN.resumo || {}, leads: FN.leads || null, perdidos: FN.perdidos || null,
        ticket: FN.meta_base?.ticket_medio ?? null, movimentos: FN.resumo?.movimentos || null,
        etapas: FN.etapas.map(L => ({ nome: L.nome, ordem: L.ordem, ganho: !!L.ganho, agora: L.agora, real: L.real, farol: L.farol, conv_real: L.conv_real, conv_meta: L.conv_meta, conv_base: L.conv_base, pct_valor: L.pct_valor, meta: L.meta ? { valor: L.meta.valor, qtd: L.meta.qtd, valor_ate_hoje: L.meta.valor_ate_hoje, fonte: L.meta.fonte } : null, probabilidade: L.probabilidade })) } : null },
  };
}
// v3.152: CONFERIR — abre cada número da TV até a origem (só no sistema, com login; a página da TV continua só com totais)
async function conferir() {
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().substring(0, 10), ini = hoje.substring(0, 8) + '01';
  const [ex, pr, rk, vd] = await Promise.allSettled([
    chamar('financeiro', { action: 'extrato_consolidado', params: { data_inicio: ini, data_fim: hoje, incluir_simulados: false } }, 45000),
    chamar('financeiro', { action: 'painel_resumo', params: { _max_idade: 300 } }), chamar('financeiro', { action: 'resultado_kpis', params: { _max_idade: 300 } }, 45000),
    chamar('financeiro', { action: 'metas_empresa_status', params: { ano: parseInt(hoje), com_crm: false } }, 45000)]);
  const v = p => p.status === 'fulfilled' ? p.value : null, er = p => p.status === 'rejected' ? String(p.reason?.message || p.reason).substring(0, 160) : null;
  const E = v(ex) || {}, P = v(pr) || {}, K = v(rk)?.resultado || {}, ME = v(vd)?.metas || {}, FA = ME.faturamento || {}, tv = await kv('tv:dados');
  const L = (E.lancamentos || []).filter(l => l.origem !== 'simulado' && l.afeta_saldo !== false);
  const top = t => L.filter(l => l.tipo === t).sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 12).map(l => ({ data: l.data, descricao: String(l.descricao || l.contraparte || l.nome || '').substring(0, 90), conta: l.conta || l.conta_nome || '', valor: num(l.valor) }));
  return { conferir: { hoje, periodo: { de: ini, ate: hoje }, na_tv: tv ? { gerado_em: tv.gerado_em, caixa: tv.fin?.caixa, faturamento_mes: tv.fin?.mes?.faturamento, meta_mes_pct: tv.fin?.mes?.pct, meta_ano_pct: tv.fin?.ano?.pct } : null,
    caixa: { erro: er(ex), saldo_abertura: num(E.saldo_inicial), abertura_data: E.saldo_inicial_data || ini, abertura_origem: E.saldo_inicial_origem || null, abertura_obs: E.saldo_inicial_detalhe?.observacao || null,
      conferencia_cadastro: E.saldo_inicial_conferencia || null, entradas: num(E.total_entradas), saidas: num(E.total_saidas), saldo_hoje: num(E.saldo_final), qtd_lancamentos: L.length,
      soma_contas_qb: num(P.saldoCaixaCurrentBalance), maiores_entradas: top('entrada'), maiores_saidas: top('saida') },
    faturamento: { erro: er(rk), regime: K.regime || null, mes: num(K.periodo_res?.faturamento), lucro_mes: num(K.periodo_res?.lucro_liquido), meta_mes: num(K.metas_periodo?.faturamento), meta_fonte: K.metas_periodo?.fonte?.faturamento || null },
    vendas: { erro: er(vd) || er(rk), realizado_mes: num(K.periodo_res?.faturamento), meta_mes: num(K.metas_periodo?.faturamento), pct_mes: K.metas_periodo?.faturamento ? Math.round(num(K.periodo_res?.faturamento) / K.metas_periodo.faturamento * 1000) / 10 : null,
      realizado_ano: num(FA.realizado), meta_ano: num(FA.meta), pct_ano: num(FA.pct_atingido), meta_fonte: ME.meta?.fonte || 'Metas da Empresa ' + parseInt(hoje) },
    receber: { total: num(P.contasReceber?.total), vencido: num(P.contasReceber?.vencido), em_30d: num(P.contasReceber?.a_vencer_30d) }, pagar: { total: num(P.contasPagar?.total), vencido: num(P.contasPagar?.vencido) } } };
}
// v3.474: cada bloco guarda o ÚLTIMO dado bom — se o QuickBooks/HubSpot não responder nesta rodada (limite, demora),
// a TV mostra o último número válido com a hora dele, em vez de cartões vazios com "—"
const BLOCOS_OK = {
  res: d => d.res && [d.res.fat?.real, d.res.gas?.real, d.res.luc?.real].some(v => v != null),
  fin: d => d.fin && (d.fin.caixa != null || d.fin.ano?.faturamento != null || (d.fin.mensal || []).length),
  com: d => !!d.com?.funil, mkt: d => d.mkt && !d.mkt.erro, proj: d => d.proj && !d.proj.erro,
  qual_termos: d => d.qual?.termos?.abertos != null, qual_qb: d => d.qual?.qb?.corretas != null, qual_proj: d => d.qual?.projetos?.total != null,
  metas_vendas: d => !!d.metas?.vendas, estr: d => !!(d.estr && (d.estr.okr || d.estr.riscos || d.estr.planejamento || d.estr.sala)) };
async function _comUltimoBom(d) {
  let bom = {}; try { bom = (await kv('tv:ultimo_bom')) || {}; } catch (_) {}
  const pega = { res: x => x.res, fin: x => x.fin, com: x => x.com, mkt: x => x.mkt, proj: x => x.proj, qual_termos: x => x.qual?.termos, qual_qb: x => x.qual?.qb, qual_proj: x => x.qual?.projetos, metas_vendas: x => x.metas?.vendas, estr: x => x.estr };
  const poe = { res: (x, v) => { x.res = v; }, fin: (x, v) => { x.fin = { ...v, erro: null }; }, com: (x, v) => { x.com = v; }, mkt: (x, v) => { x.mkt = v; }, proj: (x, v) => { x.proj = v; },
    qual_termos: (x, v) => { x.qual = x.qual || {}; x.qual.termos = v; }, qual_qb: (x, v) => { x.qual = x.qual || {}; x.qual.qb = v; }, qual_proj: (x, v) => { x.qual = x.qual || {}; x.qual.projetos = v; }, metas_vendas: (x, v) => { x.metas = x.metas || {}; x.metas.vendas = v; }, estr: (x, v) => { x.estr = v; } };
  const antigos = []; let mudou = false;
  for (const [b, ok] of Object.entries(BLOCOS_OK)) {
    if (ok(d)) { bom[b] = { v: pega[b](d), em: d.gerado_em, mes: d.mes_ref }; mudou = true; }
    else if (bom[b] && (b !== 'res' || bom[b].mes === d.mes_ref)) { poe[b](d, bom[b].v); antigos.push({ bloco: b, em: bom[b].em }); }
  }
  if (mudou) { try { await kv('tv:ultimo_bom', bom); } catch (_) {} }
  d.antigos = antigos; return d;
}
const FORMATO_TV = 484;
async function dados(forcar) {
  const c = await kv('tv:dados');
  // v3.484: cache feito por uma versão anterior (sem os blocos novos: metas, estratégia) é refeito na hora, não espera os 10 min
  if (!forcar && c && c.formato === FORMATO_TV && Date.now() - Date.parse(c.gerado_em) < CACHE_MS) return c;
  try { const d = await _comUltimoBom(await montarDados()); d.formato = FORMATO_TV; await kv('tv:dados', d); return d; }
  catch (e) { if (c) return { ...c, aviso_cache: 'mostrando os últimos números salvos' }; throw e; }
}

const esc0 = t => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function pagina(cfg, cod) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Atlantyx · Gestão à vista</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#070B18;color:#EAF0FF;font-family:Montserrat,Calibri,Arial,sans-serif;overflow:hidden;cursor:none}
/* v3.332: palco FIXO 1920×1080 escalado para caber inteiro em qualquer TV/monitor (antes vh/vw: em telas fora de 16:9 cortava) */
#app{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform:translate(-50%,-50%) scale(var(--s,1));transform-origin:center;display:flex;flex-direction:column;padding:24px 50px;overflow:hidden}
.top{display:flex;align-items:center;gap:26.9px;height:75.6px}.logo{font-weight:800;letter-spacing:6.7px;font-size:25.9px;display:flex;align-items:center}.logo img{height:47.5px;width:auto;display:block}.logo b{color:#00C4CC}
.tit{font-size:30.2px;font-weight:700}.esp{flex:1}.rel{font-size:45.4px;font-weight:700;font-variant-numeric:tabular-nums}.dt{font-size:19.4px;color:#8E9BC0;text-align:right}
.palco{flex:1;position:relative;margin-top:15.1px}.slide{position:absolute;inset:0;display:none;flex-direction:column;gap:19.4px}.slide.on{display:flex;animation:ent .6s ease}
@keyframes ent{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:none}}
.grade{display:grid;gap:17.3px 23px}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.k{background:#0F1630;border:1px solid #1E2A52;border-radius:17.3px;padding:21.6px 26.9px;min-width:0}.k .l{font-size:20.5px;color:#8E9BC0;font-weight:600;text-transform:uppercase;letter-spacing:1.5px}
.k .v{font-size:58.3px;font-weight:800;margin-top:6.5px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.k .s{font-size:20.5px;color:#AAB6D8;margin-top:5.4px}
.k.big .v{font-size:75.6px}.k.md .v{font-size:47.5px}.ok{color:#2EE6A6}.at{color:#FFB547}.cr{color:#FF5C7A}.az{color:#00C4CC}
.bar{height:14px;background:#1E2A52;border-radius:10.8px;margin-top:13px;position:relative;overflow:hidden}.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:10.8px;background:#00C4CC}.bar u{position:absolute;top:-4.3px;bottom:-4.3px;width:4.8px;background:#EAF0FF;opacity:.8}
.painel{background:#0F1630;border:1px solid #1E2A52;border-radius:17.3px;padding:19.4px 26.9px;min-height:0;display:flex;flex-direction:column}.painel h3{font-size:21.6px;color:#8E9BC0;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;margin-bottom:10.8px}
.baixo{flex:1;display:grid;grid-template-columns:1.7fr 1fr;gap:23px;min-height:0}
.lin{display:flex;align-items:center;gap:19.2px;font-size:24.8px;padding:8.6px 0;border-bottom:1px solid #1A2447}.lin:last-child{border:0}.lin .n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lin .q{font-weight:700;font-variant-numeric:tabular-nums}
.bola{width:19.4px;height:19.4px;border-radius:50%;flex-shrink:0}
.luz{display:flex;flex-direction:column;gap:7.6px;background:#070B18;border:1px solid #1E2A52;border-radius:21.6px;padding:9.7px 11.5px}.luz span{width:38.9px;height:38.9px;border-radius:50%;display:block}
.q{gap:15.1px}.qn{display:grid;grid-template-columns:1fr 1fr;gap:19.2px}.qn .v{font-size:86.4px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.05}.qn .s{font-size:20.5px;color:#AAB6D8}
.pe{height:43.2px;display:flex;align-items:center;gap:19.2px;font-size:17.3px;color:#6E7BA0}.dots{display:flex;gap:11.5px}.dots span{width:13px;height:13px;border-radius:50%;background:#26335F}.dots span.on{background:#00C4CC}
.prog{position:fixed;left:0;bottom:0;height:4.9px;background:#00C4CC;width:0}
.erro{font-size:19.4px;color:#FFB547}
/* v3.357: cartões no padrão do Dashboard — Real · Previsto · Meta · % atingido · farol */
.cr3{background:#0F1630;border:1px solid #1E2A52;border-top:5px solid var(--c);border-radius:17.3px;padding:17px 22px;min-width:0;display:flex;flex-direction:column;gap:6px}
.cr3 .t{display:flex;align-items:center;gap:10px;font-size:17px;color:#8E9BC0;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;white-space:nowrap;overflow:hidden}
.cr3 .t i{width:22px;height:22px;border-radius:50%;background:var(--c);box-shadow:0 0 16px var(--c);flex:0 0 22px}
.cr3 .st{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:17px;font-weight:700;color:var(--c);white-space:nowrap}.cr3 .st b{font-size:27px}
.cr3 .pill{padding:3px 11px;border-radius:20px;border:1px solid var(--c);font-size:15px;text-transform:uppercase;letter-spacing:.8px}
.cr3 .ln{display:flex;justify-content:space-between;align-items:baseline;gap:12px;border-top:1px solid #1E2A52;padding:5px 0}
.cr3 .ln small{font-size:14px;color:#6E7BA0;text-transform:uppercase;letter-spacing:.8px;flex:0 0 auto}
.cr3 .ln b{font-size:31px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cr3 .ln.re b{color:var(--c)}.cr3 .ln.ac{background:#121C3C;border-radius:10px;padding:5px 10px;margin:0 -10px;flex-direction:column;align-items:stretch;gap:0}.cr3 .ln.ac b{text-align:right;white-space:normal;font-size:30px}
.cr3 .bar{margin-top:6px}
svg text{font-family:Montserrat,Calibri,Arial,sans-serif}
</style></head><body><div id="app">
<div class="top"><div class="logo"><img src="/logo-atlantyx-branco.png" alt="Atlantyx" onerror="this.parentNode.innerHTML='ATLANT<b>Y</b>X'"></div><div class="tit" id="tit">Gestão à vista</div><div class="esp"></div><div><div class="rel" id="rel">--:--</div><div class="dt" id="dt"></div></div></div>
<div class="palco" id="palco"><div class="slide on"><div style="margin:auto;font-size:32.4px;color:#8E9BC0;">Carregando os números…</div></div></div>
<div class="pe"><div class="dots" id="dots"></div><div class="esp"></div><div id="atu"></div><div style="font-size:13px;color:#3A4670;margin-left:6px">${esc0(versao())}</div></div></div><div class="prog" id="prog"></div><div id="pz" style="display:none;position:fixed;top:18px;left:50%;transform:translateX(-50%);background:rgba(255,181,71,.15);border:1px solid #FFB547;color:#FFB547;border-radius:30px;padding:8px 26px;font:700 18px Montserrat,Arial,sans-serif;letter-spacing:1px;z-index:9">⏸ PAUSADO · clique para continuar</div>
<script>
var COD=${JSON.stringify(cod)},ROT=${Math.max(8, Math.min(180, +cfg.rotacao_s || 25))},SLIDES=${JSON.stringify((cfg.slides || []).filter(s => SLIDES_OK.indexOf(s) >= 0))};
var D=null,idx=0,timer=null,t0=0;
function $(i){return document.getElementById(i)}
function nz(v){return v===null||v===undefined||isNaN(v)}
function brl(v){if(nz(v))return '—';var a=Math.abs(v),s=v<0?'−':'';if(a>=1e6)return s+'R$ '+(a/1e6).toFixed(a>=1e7?1:2).replace('.',',')+' mi';if(a>=1e3)return s+'R$ '+Math.round(a/1e3).toLocaleString('pt-BR')+' mil';return s+'R$ '+Math.round(a).toLocaleString('pt-BR')}
function pct(v){return nz(v)?'—':(Math.round(v*10)/10).toLocaleString('pt-BR')+'%'}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function cor(f){return f==='verde'?'#2EE6A6':f==='amarelo'?'#FFB547':f==='vermelho'?'#FF5C7A':'#6E7BA0'}
function barra(p,marca){p=nz(p)?0:Math.max(0,Math.min(100,p));return '<div class="bar"><i style="width:'+p+'%;background:'+(p>=100?'#2EE6A6':'#00C4CC')+'"></i>'+(nz(marca)?'':'<u style="left:'+Math.max(0,Math.min(100,marca))+'%"></u>')+'</div>'}
function k(l,v,s,cls,extra){return '<div class="k '+(cls||'')+'"><div class="l">'+l+'</div><div class="v">'+v+'</div>'+(s?'<div class="s">'+s+'</div>':'')+(extra||'')+'</div>'}
var MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function grafico(m){ if(!m||!m.length)return '<div class="erro">Sem a série mensal do QuickBooks agora.</div>';
  /* v3.476: barras posicionadas por % da ALTURA REAL do painel (antes altura fixa em px estourava o painel e cobria o título) */
  var mx=1;m.forEach(function(x){mx=Math.max(mx,x.faturamento||0,Math.abs(x.lucro||0))});
  var col=m.map(function(x){var mi=parseInt(String(x.mes).substring(5,7),10)-1,f=x.faturamento||0,l=x.lucro||0,hf=Math.max(0.6,f/mx*80),hl=Math.max(0.6,Math.abs(l)/mx*80);
    return '<div style="flex:1;display:flex;flex-direction:column;min-width:0;min-height:0">'
     +'<div style="flex:1;position:relative;min-height:0">'
     +'<div style="position:absolute;left:6%;width:50%;bottom:calc('+hf+'% + 4px);text-align:center;font-size:16px;color:#AAB6D8;white-space:nowrap">'+brl(f).replace('R$ ','')+'</div>'
     +'<div style="position:absolute;left:6%;width:50%;bottom:0;height:'+hf+'%;background:#00C4CC;border-radius:6px 6px 0 0"></div>'
     +'<div style="position:absolute;left:62%;width:30%;bottom:0;height:'+hl+'%;background:'+(l>=0?'#2EE6A6':'#FF5C7A')+';border-radius:6px 6px 0 0" title="'+brl(l)+'"></div></div>'
     +'<div style="font-size:18px;color:#8E9BC0;border-top:1px solid #26335F;text-align:center;padding-top:4px">'+(MES[mi]||x.mes)+'</div></div>'}).join('');
  return '<div style="flex:1;min-height:0;display:flex;gap:10px;margin-top:4px">'+col+'</div><div style="font-size:18.4px;color:#8E9BC0;margin-top:6.5px;"><span style="color:#00C4CC">■</span> faturamento (valor em cima) &nbsp; <span style="color:#2EE6A6">■</span> lucro líquido (vermelho = prejuízo)</div>'}
function brlI(v){return nz(v)?'—':(v<0?'−':'')+'R$ '+Math.round(Math.abs(v)).toLocaleString('pt-BR')}var brlI0=brlI;
function luz(f){return '<div class="luz">'+['vermelho','amarelo','verde'].map(function(c){return '<span style="background:'+(f===c?cor(c):'#1A2447')+';'+(f===c?'box-shadow:0 0 25.9px '+cor(c):'')+'"></span>'}).join('')+'</div>'}
function clsF(f){return f==='verde'?'ok':f==='amarelo'?'at':f==='vermelho'?'cr':''}
function metaBox(tit,X,rotEsp){var f=X.semaforo,pc=X.pct,brlI=function(v){return nz(v)?'—':Math.abs(v)>=1e6?brl(v):brlI0(v)};
  return '<div class="painel" style="flex-direction:row;gap:30.7px;align-items:center;padding:21.6px 30.7px">'+luz(f)
   +'<div style="flex:1;min-width:0"><h3 style="margin-bottom:6.5px">'+tit+'</h3>'
   +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:19.2px;align-items:end">'
   +'<div><div class="s" style="font-size:20.5px;color:#8E9BC0">META</div><div style="font-size:49.7px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap">'+brlI(X.meta_faturamento)+'</div></div>'
   +'<div><div class="s" style="font-size:20.5px;color:#8E9BC0">REALIZADO</div><div style="font-size:49.7px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap" class="'+clsF(f)+'">'+brlI(X.faturamento)+'</div></div>'
   +'<div style="text-align:right"><div class="s" style="font-size:20.5px;color:#8E9BC0">ATINGIDO</div><div style="font-size:69.1px;font-weight:800;line-height:1" class="'+clsF(f)+'">'+pct(pc)+'</div></div></div>'
   +barra(pc,nz(X.fracao_decorrida)?null:X.fracao_decorrida*100)
   +'<div style="font-size:20.5px;color:#AAB6D8;margin-top:8.6px">'+(nz(X.esperado)?'':'esperado até hoje '+brlI(X.esperado)+' ('+rotEsp+') · ')+(X.meta_faturamento?(nz(X.faturamento)?'<span class="at">sem realizado do QuickBooks agora</span>':X.faturamento>=X.meta_faturamento?'<span class="ok">meta batida</span>':'falta '+brlI(X.meta_faturamento-X.faturamento)):'<span class="at">meta não cadastrada (Planejamento → Metas da Empresa)</span>')+(nz(X.projecao)?'':' · no ritmo atual fecha em '+brlI(X.projecao))+'</div></div></div>'}

// v3.357: cartão objetivo (mesmo do Dashboard): farol + % atingido, Real, Previsto, Meta e linhas extras com a MESMA fonte
function farolDe(o){if(o.luz)return o.luz==='sem_meta'?null:o.luz;if(nz(o.meta)||(!o.pct&&!o.meta))return null;var base=!nz(o.prev)?o.prev:o.real;if(nz(base))return null;var esp=!nz(o.prev)?1:(nz(o.frac)?1:o.frac);
  if(o.pct){var d=base-o.meta;return d>=0?'verde':d>=-5?'amarelo':'vermelho'}if(o.menor){var r=base/o.meta;return r<=1?'verde':r<=1.1?'amarelo':'vermelho'}var q=base/(o.meta*esp||1);return base<0?'vermelho':q>=1?'verde':q>=0.85?'amarelo':'vermelho'}
function cartao(o){var f=o.fmt||(o.pct?pct:brl),fr=farolDe(o),c=cor(fr),tx=fr==='verde'?'no rumo':fr==='amarelo'?'atenção':fr==='vermelho'?'fora da meta':'sem meta';
  var at=o.ating!==undefined?o.ating:(!nz(o.meta)&&o.meta&&!nz(o.real)?o.real/o.meta*100:null);
  var ln=function(r,v,cl){return '<div class="ln '+(cl||'')+'"><small>'+r+'</small><b>'+v+'</b></div>'};
  /* v3.477: % negativo (lucro/EBITDA abaixo de zero contra meta positiva) não tem leitura — vira "negativo"; "atingido" → "da meta" (vale para gastos também) */
  var neg=!o.pct&&!nz(o.real)&&o.real<0&&o.meta>0,atT=neg?'negativo':nz(at)?'—':pct(at);
  return '<div class="cr3" style="--c:'+c+'"><div class="t"><i></i>'+esc(o.rot)+'</div><div class="st"><span class="pill">'+tx+'</span><span><b>'+atT+'</b></span></div>'
   +ln('Real',o.realTxt||f(o.real),'re')+(o.semPrev?'':ln('Previsto',f(o.prev)))+ln('Meta',o.metaTxt||(nz(o.meta)?'—':f(o.meta)))
   +(o.linhas||[]).map(function(x){return ln(x[0],x[1],'ac')}).join('')
   +(!nz(at)&&!neg?'<div class="bar"><i style="width:'+Math.max(0,Math.min(100,at))+'%;background:'+(fr?c:'#00C4CC')+'"></i></div>':'')+'</div>'}
function nI(v){return nz(v)?'—':Number(v).toLocaleString('pt-BR')}
function sFin(){var F=D.fin||{},M=F.mes||{},A=F.ano||{};var MESN=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];var mi=parseInt(String(D.mes_ref||'').substring(5,7),10)-1;
  var mc=clsF(M.semaforo_margem);
  var Rs=D.res||F.res||{},fr0=Rs.frac,MESC=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'], /* v3.474: os cartões liam D.fin.res, mas o resultado do mês vem em D.res — por isso ficavam todos em "—" */mn=(MESC[mi]||'mês');
  var h='<div class="grade" style="grid-template-columns:repeat(5,minmax(0,1fr))">'
   +cartao({rot:'Faturamento · '+mn,real:Rs.fat&&Rs.fat.real,prev:Rs.fat&&Rs.fat.prev,meta:Rs.fat&&Rs.fat.meta,frac:fr0})
   +cartao({rot:'Gastos · '+mn,real:Rs.gas&&Rs.gas.real,prev:Rs.gas&&Rs.gas.prev,meta:Rs.gas&&Rs.gas.meta,menor:true})
   +cartao({rot:'EBITDA · '+mn,real:Rs.eb&&Rs.eb.real,prev:Rs.eb&&Rs.eb.prev,meta:Rs.eb&&Rs.eb.meta,frac:fr0})
   +cartao({rot:'Lucro · '+mn,real:Rs.luc&&Rs.luc.real,prev:Rs.luc&&Rs.luc.prev,meta:Rs.luc&&Rs.luc.meta,frac:fr0})
   +cartao({rot:'Margem · '+mn,real:Rs.mg&&Rs.mg.real,prev:Rs.mg&&Rs.mg.prev,meta:Rs.mg&&Rs.mg.meta,pct:true})+'</div>'
   +'<div class="grade g4">'+(function(){var f=A.semaforo,pa=A.meta_faturamento&&!nz(A.faturamento)?A.faturamento/A.meta_faturamento*100:null; /* v3.474: compacto para sobrar altura ao gráfico */
      return '<div class="k" style="display:flex;gap:18px;align-items:center">'+luz(f)+'<div style="flex:1;min-width:0"><div class="l">Faturamento de '+(A.ano||'')+'</div><div class="v '+clsF(f)+'" style="font-size:47px">'+brl(A.faturamento)+'</div><div class="s">'+(nz(pa)?'meta não cadastrada':pct(pa)+' de '+brl(A.meta_faturamento))+(nz(A.projecao)?'':' · fecha em '+brl(A.projecao))+'</div>'+(nz(pa)?'':barra(pa,nz(A.fracao_decorrida)?null:A.fracao_decorrida*100))+'</div></div>'})()
   +k('Caixa hoje',brl(F.caixa),'saldo bancário (QuickBooks)','md')
   +k('A receber',brl(F.receber),'<span class="'+(F.receber_vencido>0?'cr':'ok')+'">vencido '+brl(F.receber_vencido)+'</span>'+(nz(F.receber_30d)?'':' · 30 dias '+brl(F.receber_30d)),'md')
   +k('A pagar',brl(F.pagar),'contas em aberto no QuickBooks','md')+'</div>'
   +'<div class="painel" style="flex:1;min-height:0"><h3>Evolução no ano</h3>'+grafico(F.mensal)+'</div>'
   +'<div style="font-size:16px;color:#6E7BA0">QuickBooks'+(F.regime?' ('+esc(F.regime)+')':'')+' · Previsto = real + programado até o fim do mês (contas a pagar e '+(F.res&&F.res.regime==='caixa'?'faturas a receber':'termos a faturar')+') · farol: previsto contra a meta (ano: ritmo)</div>'
   +(F.erro?'<div class="erro">⚠ '+esc(F.erro)+'</div>':'');
  var vaz=Rs.fat&&nz(Rs.fat.real)&&nz(Rs.gas&&Rs.gas.real)&&nz(Rs.luc&&Rs.luc.real);
  if(vaz)h='<div style="padding:14px 20px;border-radius:12px;background:#2A1F12;border:1px solid #5C4320;color:#FFB547;font-size:21px">⚠ O QuickBooks não devolveu o resultado de '+esc(mn)+' agora'+(F.erro?' ('+esc(String(F.erro).substring(0,140))+')':'')+'. A tela tenta de novo em 10 minutos.</div>'+h;
  return h}
// v3.280: o MESMO funil do Dashboard ao vivo (aba Vendas): pipeline aberto agora, em R$, todos os pipelines, mês atual
function sCom(){var C=D.com||{},Fu=C.funil;
  if(!Fu)return '<div class="erro" style="margin:auto;font-size:28.1px">'+esc(C.indisponivel||C.erro||'Funil indisponível (HubSpot).')+'</div>';
  var R=Fu.resumo||{},A=R.aberto||{},E=Fu.etapas||[],L=Fu.leads;
  var pm=R.pct_meta,cm=nz(pm)?'':pm>=100?'ok':pm>=80?'at':'cr',cob=R.cobertura_pct,cc=nz(cob)?'':cob>=100?'ok':cob>=60?'at':'cr';
  // v3.357: cartões de vendas no padrão do Dashboard (Real · Meta · % atingido · farol · Acumulado = tudo parado na etapa, de qualquer mês)
  var acha=function(re){var ach=[];for(var i=0;i<E.length;i++){var nm=String(E[i].nome||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(re.test(nm))ach.push(E[i])}for(var j=0;j<ach.length;j++)if(ach[j].meta&&(ach[j].meta.qtd||ach[j].meta.valor))return ach[j];return ach[0]||null}; /* v3.478: prefere a etapa que tem meta (havia 2 etapas de lead) */
  var ac=function(e,v){return !e||!e.agora?'—':nI(e.agora.qtd)+(v?' · '+brl(e.agora.valor):'')};
  var et=function(rot,e){if(!e)return cartao({rot:rot,real:null,fmt:nI,semPrev:true});var mq=e.meta&&e.meta.qtd?Math.ceil(e.meta.qtd):null;return cartao({rot:rot,real:e.real&&e.real.qtd,fmt:nI,meta:mq||null,semPrev:true,luz:e.farol,ating:mq?e.real.qtd/mq*100:null,linhas:[['Conversão',(nz(e.conv_real)?'—':pct(e.conv_real))+(e.conv_meta?' / meta '+pct(e.conv_meta):'')],['Acumulado',ac(e)]]})};
  var Lp=acha(/propost/),Ng=acha(/negocia/),Gn=null;for(var gi=0;gi<E.length;gi++)if(E[gi].ganho)Gn=E[gi];
  var h='<div class="grade" style="grid-template-columns:repeat(5,minmax(0,1fr))">'
   +et('Leads do mês',acha(/lead|prospec/))+et('Reuniões do mês',acha(/reuni|qualif/))
   +(function(){if(!Lp)return cartao({rot:'Propostas do mês',real:null,semPrev:true});var mq=Lp.meta&&Lp.meta.qtd?Math.ceil(Lp.meta.qtd):null,mv=Lp.meta&&Lp.meta.valor,at=mq?Lp.real.qtd/mq*100:mv?Lp.real.valor/mv*100:null;
     return cartao({rot:'Propostas do mês',real:Lp.real&&Lp.real.qtd,realTxt:nI(Lp.real&&Lp.real.qtd)+' · '+brl(Lp.real&&Lp.real.valor),meta:mv||mq||null,metaTxt:mv&&mq?nI(mq)+' · '+brl(mv):mq?nI(mq):mv?brl(mv):null,semPrev:true,luz:Lp.farol,ating:at,linhas:[['Conversão',(nz(Lp.conv_real)?'—':pct(Lp.conv_real))+(Lp.conv_meta?' / meta '+pct(Lp.conv_meta):'')],['Acumulado',ac(Lp,true)]]})})()
   +cartao({rot:'Pipeline aberto',real:A.valor,meta:R.pipeline_necessario||null,semPrev:true,luz:R.pipeline_necessario?(A.valor>=R.pipeline_necessario?'verde':A.valor>=R.pipeline_necessario*0.8?'amarelo':'vermelho'):null,linhas:[['Ponderado',brl(A.ponderado)]]})
   +cartao({rot:'Vendas fechadas',real:R.ganho&&R.ganho.valor,meta:R.meta,semPrev:true,luz:Gn&&Gn.farol,ating:nz(R.pct_meta)?null:R.pct_meta,linhas:[['Acum. negociação',ac(Ng,true)]]})+'</div>';
  var grad=[['#1f5fbf','#3d8bf0'],['#2569cc','#4a98f2'],['#2b7bd6','#4fb0ef'],['#1f9fb0','#3cc6c9'],['#18a57f','#36c99a'],['#14916b','#2fb989'],['#0f7d5b','#28a679']];
  var topo=E.length?(E[0].agora&&E[0].agora.valor)||0:0,n=E.length;
  var FG={verde:['#0f8a52','#2fcf86'],amarelo:['#b7791f','#f6b84b'],vermelho:['#b4233c','#ef5a6f']};
  var linhas=E.map(function(e,i){var g=FG[e.farol]||['#3b4a6b','#5d6f96'],ag=e.agora||{},val=ag.valor||0; /* v3.357: cor da faixa = farol */
    var larg=function(x){return 100-62*x/Math.max(1,n)},a=(100-larg(i))/2,bq=(100-larg(i+1))/2;
    var pc=e.pct_valor,f=nz(pc)?null:pc>=100?'verde':pc>=80?'amarelo':'vermelho';
    var sub=e.ganho?((ag.qtd||0)+' ganho(s) no período'):((ag.qtd||0)+' negócio(s)'+(ag.sem_valor?' · '+ag.sem_valor+' sem valor':''));
    if(!e.ganho&&Fu.movimentos&&Fu.movimentos.por_coluna)sub=(ag.qtd||0)+' neg.'+(ag.sem_valor?' · '+ag.sem_valor+' s/ valor':'');
    var MVc=Fu.movimentos&&Fu.movimentos.por_coluna&&Fu.movimentos.por_coluna[e.ordem]; /* v3.479: chegaram na etapa na semana avançando (▲) ou recuando (▼) */
    if(MVc&&!e.ganho&&(MVc.semana.entrou_avancando||MVc.semana.entrou_recuando))sub='<span style="color:#2EE6A6">▲'+MVc.semana.entrou_avancando+'</span> <span style="color:#FF5C7A">▼'+MVc.semana.entrou_recuando+'</span> 7d · '+sub;
    var gV=e.ganho&&R.meta;var fr=e.farol&&e.farol!=='sem_meta'?e.farol:null,mqI=e.meta&&e.meta.qtd?Math.ceil(e.meta.qtd):null,mt=mqI||(e.meta&&e.meta.valor),rl=e.meta&&e.meta.qtd?(e.real&&e.real.qtd):(e.real&&e.real.valor),atg=mt&&!nz(rl)?rl/mt*100:null,fm=e.meta&&e.meta.qtd?nI:brl;if(gV&&!nz(R.pct_meta))atg=R.pct_meta;
    /* v3.474: coluna da direita compacta (antes 3 linhas que se sobrepunham) — status e % numa linha, real × meta e conversão na outra */
    var dir='<div style="display:flex;justify-content:space-between;gap:12px;font-weight:700;color:'+cor(fr)+';white-space:nowrap"><span><span class="bola" style="display:inline-block;vertical-align:middle;margin-right:9px;background:'+cor(fr)+'"></span>'+(fr==='verde'?'no rumo':fr==='amarelo'?'atenção':fr==='vermelho'?'fora da meta':'sem meta')+'</span><span>'+(nz(atg)?'—':pct(atg))+'</span></div>'
      +(!gV&&!mqI?'<div style="font-size:18px;color:#6E7BA0;margin-top:3px">sem meta para esta etapa</div>':gV?'<div style="font-size:18px;color:#AAB6D8;margin-top:3px;white-space:nowrap">vendido <b style="color:#EAF0FF">'+brl(R.ganho&&R.ganho.valor)+'</b> de <b style="color:#EAF0FF">'+brl(R.meta)+'</b> · '+nI(e.real&&e.real.qtd)+' venda(s)</div>':'<div style="font-size:18px;color:#AAB6D8;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">real <b style="color:#EAF0FF">'+nI(e.real&&e.real.qtd)+'</b> de <b style="color:#EAF0FF">'+(mqI?nI(mqI):'—')+'</b>'+(i>0?' · conv. <b style="color:#EAF0FF">'+(nz(e.conv_real)?'—':pct(e.conv_real))+'</b>'+(e.conv_meta?' / '+pct(e.conv_meta):''):'')+'</div>');
    var dirAntigo=e.meta&&e.meta.valor!=null&&(e.ganho||e.meta.fonte==='cadastrada')?'<span class="bola" style="display:inline-block;vertical-align:middle;margin-right:9.6px;background:'+cor(f)+'"></span>meta '+brl(Fu.decorrido_pct<100?e.meta.valor_ate_hoje:e.meta.valor)+(Fu.decorrido_pct<100?' até hoje':'')+' · <b class="'+clsF(f)+'">'+(nz(pc)?'—':pc+'%')+'</b>'
      :(!e.ganho&&ag.ponderado?'<span style="color:#8E9BC0">ponderado <b style="color:#AAB6D8">'+brl(ag.ponderado)+'</b>'+(e.probabilidade!=null?' · '+Math.round(e.probabilidade*100)+'% de chance':'')+'</span>':'');
    /* v3.478: com 6+ etapas as faixas ficavam baixas e o texto (2 linhas) vazava para a faixa de baixo — agora número e valor numa linha só, e a faixa ocupa a altura toda da linha */
    return '<div style="display:grid;grid-template-columns:345.6px 1fr 422.4px;gap:23px;align-items:stretch;flex:1 1 0;min-height:0;overflow:hidden">'
     +'<div style="display:flex;flex-direction:column;justify-content:center;min-width:0"><div style="font-size:23px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.15">'+esc(e.nome)+(e.ganho?' ✓':'')+'</div><div style="font-size:16.5px;color:#8E9BC0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+sub+'</div></div>'
     +'<div style="height:100%;max-height:86.4px;clip-path:polygon('+a+'% 0,'+(100-a)+'% 0,'+(100-bq)+'% 100%,'+bq+'% 100%);background:linear-gradient(180deg,'+g[1]+','+g[0]+');display:flex;flex-direction:column;align-items:center;justify-content:center">'
     +'<div style="white-space:nowrap;line-height:1"><b style="font-size:32px;font-weight:800">'+nI(e.ganho?(e.real&&e.real.qtd):ag.qtd)+'</b> <span style="font-size:18px;font-weight:600;opacity:.92">'+(e.ganho?'ganhos':'abertos')+' · '+brl(val)+'</span></div></div>'
     +'<div style="font-size:20px;display:flex;flex-direction:column;justify-content:center;min-width:0">'+dir+'</div></div>'}).join('');
  var MV=Fu.movimentos,mvB=function(rot,m){return !m?'':'<div style="display:flex;align-items:center;gap:16px;padding:6px 16px;border-radius:12px;background:#121C3C;white-space:nowrap"><span style="font-size:17px;color:#8E9BC0;text-transform:uppercase;letter-spacing:1px;font-weight:700">'+rot+'</span>'
     +'<span style="font-size:21px;color:#2EE6A6;font-weight:800">▲ '+m.positivos+'</span><span style="font-size:16px;color:#AAB6D8">avançaram'+(m.ganhos?' ('+m.ganhos+' ganho'+(m.ganhos>1?'s':'')+')':'')+'</span>'
     +'<span style="font-size:21px;color:#FF5C7A;font-weight:800">▼ '+m.negativos+'</span><span style="font-size:16px;color:#AAB6D8">recuaram'+(m.perdidos?' ('+m.perdidos+' perdido'+(m.perdidos>1?'s':'')+')':'')+'</span></div>'};
  h+='<div class="painel" style="flex:1;min-height:0"><h3 style="margin-bottom:6px">Pipeline hoje — todos os negócios abertos (de qualquer mês) · ganhos e metas de '+esc(Fu.rotulo||'')+'</h3>'
     +(MV&&!MV.erro?'<div style="display:flex;gap:14px;margin-bottom:8px"><span style="font-size:17px;color:#8E9BC0;align-self:center;font-weight:700">MOVIMENTO NO FUNIL</span>'+mvB('Últimos 7 dias',MV.semana)+mvB('No mês',MV.mes)+'</div>':'')+'<div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:6px">'+(linhas||'<div class="erro">Nenhuma etapa no pipeline.</div>')+'</div>'
   +'<div style="display:flex;gap:38.4px;font-size:18.4px;color:#8E9BC0;margin-top:8.6px">'+(Fu.perdidos?'<span>Perdidos em '+esc(Fu.rotulo||'')+': <b>'+Fu.perdidos.qtd+'</b> ('+brl(Fu.perdidos.valor)+')</span>':'')+(Fu.ticket?'<span>Ticket médio: <b>'+brl(Fu.ticket)+'</b></span>':'')+(Fu.lidos!=null?'<span>'+Fu.lidos+' negócio(s) lidos do HubSpot</span>':'')+'</div></div>'
   +(C.erro?'<div class="erro">⚠ '+esc(C.erro)+'</div>':'');
  return h}
function sQual(){var Q=D.qual||{},T=Q.termos||{},B=Q.qb||{},P=Q.projetos||{},Fu=(D.com||{}).funil;
  /* v3.475: cada cartão responde UMA pergunta com UM número grande (o que precisa de ação), a lista diz o quê e quanto em R$ ou unidades —
     sai a soma "registros com erro" (somava meses + lançamentos + contas, unidades diferentes) e o cartão de projetos (já tem slide próprio);
     entra a qualidade do CRM (negócios sem valor distorcem o pipeline da tela de Vendas) */
  function n(v){return v==null||v===''?'—':v}
  function li(c,txt,q,sub){return '<div class="lin" style="padding:11px 0;font-size:22px"><span class="bola" style="background:'+c+'"></span><div class="n" style="white-space:normal;line-height:1.25">'+esc(txt)+(sub?'<div style="font-size:17px;color:#8E9BC0">'+sub+'</div>':'')+'</div><div class="q" style="font-size:28px">'+q+'</div></div>'}
  function card(t,pergunta,f,num,rot,sub,lst,ok,er,acao){var c=f==='verde'?'ok':f==='amarelo'?'at':f==='vermelho'?'cr':'',st=f==='verde'?'em dia':f==='amarelo'?'atenção':f==='vermelho'?'crítico':'sem dado';
    return '<div class="painel" style="min-height:0;border-top:5px solid '+cor(f)+'"><div style="display:flex;align-items:flex-start;gap:16px"><div style="flex:1;min-width:0"><h3 style="margin:0 0 4px">'+t+'</h3><div style="font-size:18px;color:#6E7BA0">'+pergunta+'</div></div>'
      +'<div style="flex:0 0 auto;display:flex;align-items:center;gap:9px;padding:6px 14px;border-radius:30px;background:#0A1022;border:1px solid '+cor(f)+';color:'+cor(f)+';font-weight:800;font-size:19px;text-transform:uppercase;letter-spacing:1px"><span class="bola" style="width:16px;height:16px;background:'+cor(f)+';box-shadow:0 0 12px '+cor(f)+'"></span>'+st+'</div></div>'
      +'<div style="display:flex;align-items:baseline;gap:16px;margin:14px 0 4px"><div class="'+c+'" style="font-size:96px;font-weight:800;line-height:1">'+n(num)+'</div><div style="font-size:24px;font-weight:700">'+rot+'</div></div>'
      +'<div style="font-size:20px;color:#AAB6D8;min-height:26px">'+(sub||'')+'</div>'
      +'<div style="flex:1;min-height:0;overflow:hidden;margin-top:10px;border-top:1px solid #1E2A52">'+(lst||(ok?'<div class="ok" style="font-size:24px;margin-top:16px">✓ '+ok+'</div>':''))+'</div>'+(er?'<div class="erro">⚠ '+esc(er)+'</div>':'')
      +(acao&&f&&f!=='verde'?'<div style="margin-top:10px;padding:11px 15px;border-radius:12px;background:#121C3C;font-size:19px;color:#EAF0FF"><b style="color:#00C4CC">O que fazer:</b> '+acao+'</div>':'')+'</div>'}
  // 1) termos de faturamento: quantos travados e quanto dinheiro está parado neles
  var termos=card('Termos de faturamento','Algum termo travado impedindo faturar ou receber?',T.farol,T.errados,T.errados===1?'termo com pendência':'termos com pendência',
    T.abertos==null?'':(T.valor_pendente?'<b class="'+clsF(T.farol)+'">'+brl(T.valor_pendente)+'</b> parados · ':'')+n(T.corretos)+' de '+n(T.abertos)+' em aberto estão corretos',
    (T.motivos||[]).map(function(m){return li(cor(T.farol),m.motivo,m.qtd,m.valor?brl(m.valor):'')}).join(''),T.errados===0?'Todos os '+n(T.abertos)+' termos em aberto estão corretos':'',T.erro,'Kanban de Faturamento → destravar os termos com pendência');
  // 2) QuickBooks: quantos tipos de problema (cada um na sua unidade)
  var qb=card('Contabilidade no QuickBooks','O fechamento do mês vai sair certo?',B.farol,B.com_erro,B.com_erro===1?'problema a corrigir':'problemas a corrigir',
    B.checagens?(B.corretas+' de '+B.checagens+' verificações em dia'):'',
    (B.problemas||[]).map(function(p){return li(cor(p.gravidade==='alta'?'vermelho':'amarelo'),p.titulo,p.qtd)}).join(''),B.com_erro===0?'Conciliação, categorias, duplicidades e contas pagas em dia':'',B.erro,'Financeiro → Higienização de dados, começando pelos itens em vermelho');
  // 3) CRM (HubSpot): negócios abertos sem valor — o pipeline da tela de Vendas fica subestimado
  var E=(Fu&&Fu.etapas)||[],ab=E.filter(function(e){return !e.ganho}),sv=0,tot=0;ab.forEach(function(e){var a=e.agora||{};sv+=a.sem_valor||0;tot+=a.qtd||0});
  var fc=!Fu?null:!tot?'verde':sv/tot<=0.1?'verde':sv/tot<=0.3?'amarelo':'vermelho';
  var crm=card('Cadastro no HubSpot','O pipeline da tela de Vendas é confiável?',fc,Fu?sv:null,sv===1?'negócio aberto sem valor':'negócios abertos sem valor',
    Fu?(tot?Math.round(sv/tot*100)+'% dos '+tot+' negócios abertos · sem valor não entram no pipeline':'nenhum negócio aberto'):'',
    ab.filter(function(e){return (e.agora||{}).sem_valor}).map(function(e){return li(cor(fc),e.nome,e.agora.sem_valor,'de '+e.agora.qtd+' na etapa')}).join(''),Fu&&tot?'Todos os negócios abertos têm valor':'',Fu?null:'Funil do HubSpot indisponível agora','preencher o valor estimado dos negócios no HubSpot (ou na Floresta de Vendas)');
  var fx=function(r,x,c,d){return '<div class="k" style="padding:14px 24px;display:flex;align-items:center;gap:20px"><div style="flex:1;min-width:0"><div class="l">'+r+'</div><div class="s" style="margin-top:2px">'+d+'</div></div><div style="text-align:right"><div class="v" style="font-size:42px;margin:0;'+(c?'color:'+c:'')+'">'+(x?brl(x.valor):'—')+'</div><div class="s">'+(x?x.qtd+' termo(s)':'')+'</div></div></div>'};
  return '<div class="grade" style="grid-template-columns:repeat(3,minmax(0,1fr));flex:1;min-height:0">'+termos+qb+crm+'</div>'
   +'<div class="grade g3">'+fx('Faturado no mês',T.faturados_mes,'#2EE6A6','NF emitida neste mês')+fx('A faturar',T.a_faturar,null,'termos em elaboração, aprovação ou emissão')+fx('Aguardando pagamento',T.aguardando_pagamento,'#FFB547','NF enviada, cliente ainda não pagou')+'</div>'}
function sProj(){var J=D.proj||{},R=J.resumo||{},L=J.lista||[];
  var dt=function(s){return s?s.split('-').reverse().join('/'):'—'};
  var av=nz(R.avanco_medio)?'—':R.avanco_medio+'%';
  var pd=R.total?Math.round((R.verde||0)/R.total*100):null,fp=nz(pd)?null:pd>=80?'verde':pd>=60?'amarelo':'vermelho';
  var bo=function(c){return '<span class="bola" style="display:inline-block;vertical-align:middle;width:38.9px;height:38.9px;margin-right:15.4px;background:'+cor(c)+';box-shadow:0 0 17.3px '+cor(c)+'"></span>'};
  // v3.332: 4 blocos (antes 6) — o farol junta % em dia e as contagens verde/amarelo/vermelho num cartão só
  var cnt=function(c,v,r){return '<div style="text-align:center">'+bo(c)+'<span class="'+clsF(c)+'" style="font-size:52px;font-weight:800;vertical-align:middle">'+(nz(v)?'—':v)+'</span><div class="s">'+r+'</div></div>'};
  var h='<div class="grade" style="grid-template-columns:1fr 2fr 1fr">'+k('Projetos ativos',nz(R.total)?'—':R.total,J.fonte||'','big')
   +'<div class="k big" style="display:flex;gap:26px;align-items:center">'+luz(fp)+'<div style="min-width:0;width:190px"><div class="l">% em dia</div><div class="v '+clsF(fp)+'" style="font-size:64.8px">'+(nz(pd)?'—':pd+'%')+'</div><div class="s">verde ≥ 80%</div></div>'
   +'<div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px">'+cnt('verde',R.verde,'em dia')+cnt('amarelo',R.amarelo,'atenção')+cnt('vermelho',R.vermelho,R.vencidos?(R.vencidos===1?'1 passou':R.vencidos+' passaram')+' da data':'atrasados')+'</div></div>'
   +k('Avanço médio',av,(nz(R.planejado_medio)?'':'planejado '+R.planejado_medio+'%')+(R.concluem_mes?' · '+R.concluem_mes+' concluem no mês':''),'big',nz(R.avanco_medio)?'':barra(R.avanco_medio,nz(R.planejado_medio)?null:R.planejado_medio))+'</div>';
  var max=7, mostra=L.slice(0,max); // v3.332: cabe na tela (os mais críticos primeiro)
  h+='<div class="painel" style="flex:1;min-height:0"><h3>Projetos · data de conclusão e farol</h3>'
   +'<div class="lin" style="font-size:17.3px;color:#6E7BA0;border-bottom:1px solid #26335F"><span class="bola" style="background:transparent"></span><div class="n">PROJETO</div><div style="width:249.6px">GERENTE</div><div style="width:172.8px;text-align:right">CONCLUSÃO</div><div style="width:268.8px;text-align:center">AVANÇO (REAL × PLAN.)</div><div style="width:153.6px;text-align:right">DESVIO</div></div>'
   +(mostra.map(function(p){var cor2=cor(p.farol);var d=nz(p.desvio)?'—':(p.desvio>0?'+':'')+p.desvio+'pp';
     return '<div class="lin"><span class="bola" style="width:25.9px;height:25.9px;background:'+cor2+';box-shadow:0 0 13px '+cor2+'"></span><div class="n">'+esc(p.nome)+(p.motivo&&(p.farol!=='verde'||/status report/.test(p.motivo))?' <span style="font-size:17.3px;color:#8E9BC0;font-weight:500">· '+esc(p.motivo)+'</span>':'')+'</div>'
      +'<div style="width:249.6px;font-size:20.5px;color:#AAB6D8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.gerente||'')+'</div>'
      +'<div style="width:172.8px;text-align:right" class="q '+(p.dias_atraso>0?'cr':'')+'">'+dt(p.conclusao)+(p.dias_atraso>0?'<div style="font-size:16.2px">'+p.dias_atraso+' dias atrás</div>':'')+'</div>'
      +'<div style="width:268.8px;padding:0 19.2px">'+(nz(p.pct)?'<div style="text-align:center;color:#6E7BA0">—</div>':'<div style="display:flex;justify-content:space-between;font-size:18.4px"><b>'+p.pct+'%</b><span style="color:#8E9BC0">'+(nz(p.planejado)?'':p.planejado+'%')+'</span></div>'+barra(p.pct,nz(p.planejado)?null:p.planejado))+'</div>'
      +'<div style="width:153.6px;text-align:right" class="q '+(nz(p.desvio)?'':p.desvio<-10?'cr':p.desvio<-5?'at':'ok')+'">'+d+'</div></div>'}).join('')||'<div class="erro">'+esc(J.erro||'Sem projetos ativos no módulo de projetos.')+'</div>')
   +(L.length>max?'<div style="font-size:18.4px;color:#8E9BC0;margin-top:6.5px">+ '+(L.length-max)+' projeto(s) — os mais críticos aparecem primeiro</div>':'')+'</div>';
  return h}
// v3.332: MARKETING DIGITAL — resultado de cada campanha e farol de leads (meta × realizado, pelo ritmo da campanha)
function sMkt(){var M=D.mkt||{},L=M.campanhas||[],T=M.total||{},O=M.organico||{},OT=O.total||{},RD=O.redes||[];
  /* v3.479: ORGÂNICO do mês (Metricool: publicações, impressões, cliques, engajamento por rede e as melhores publicações) + PAGO resumido ao lado */
  var n=function(v){return nz(v)?'—':Math.round(v).toLocaleString('pt-BR')},tx=function(a,b){return b?pct(a/b*100):'—'};
  var MESN=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],mn=MESN[parseInt(String(D.mes_ref||'').substring(5,7),10)-1]||'mês';
  var h='<div class="grade g4">'+k('Publicações orgânicas',n(OT.posts),'em '+mn+' · LinkedIn, Instagram e Facebook','md')
   +k('Impressões',n(OT.impressoes),'vezes que as publicações apareceram','md')
   +k('Engajamento',n(OT.engajamento),'taxa '+tx(OT.engajamento,OT.impressoes)+' · '+n(OT.curtidas)+' curtidas · '+n(OT.comentarios)+' coment. · '+n(OT.compartilhamentos)+' compart.','md')
   +k('Cliques',n(OT.cliques),'CTR '+tx(OT.cliques,OT.impressoes)+' (cliques ÷ impressões)','md')+'</div>';
  // orgânico por rede
  var cab='<div class="lin" style="font-size:16px;color:#6E7BA0;border-bottom:1px solid #26335F"><div class="n">REDE</div><div style="width:90px;text-align:right">POSTS</div><div style="width:150px;text-align:right">IMPRESSÕES</div><div style="width:150px;text-align:right">ENGAJAMENTO</div><div style="width:110px;text-align:right">TAXA</div><div style="width:110px;text-align:right">CLIQUES</div></div>';
  var lin=RD.map(function(r){return r.erro?'<div class="lin"><div class="n">'+esc(r.rede)+'</div><div style="font-size:18px;color:#FFB547">sem resposta do Metricool</div></div>'
     :'<div class="lin" style="padding:11px 0"><div class="n" style="font-weight:700">'+esc(r.rede)+(r.aviso?' <span style="font-size:15px;color:#FFB547">· '+esc(r.aviso)+'</span>':'')+'</div><div style="width:90px;text-align:right" class="q">'+n(r.posts)+'</div><div style="width:150px;text-align:right" class="q">'+n(r.impressoes)+'</div><div style="width:150px;text-align:right" class="q">'+n(r.engajamento)+'</div><div style="width:110px;text-align:right" class="q az">'+tx(r.engajamento,r.impressoes)+'</div><div style="width:110px;text-align:right" class="q">'+n(r.cliques)+'</div></div>'}).join('');
  var top=(O.top||[]).map(function(p,i){return '<div style="display:flex;gap:14px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #1A2447"><div style="font-size:26px;font-weight:800;color:#00C4CC;width:28px">'+(i+1)+'</div><div style="flex:1;min-width:0"><div style="font-size:19px;line-height:1.3;max-height:50px;overflow:hidden">'+esc(p.texto||'(sem texto)')+'</div><div style="font-size:16px;color:#8E9BC0;margin-top:2px">'+esc(p.rede)+(p.data?' · '+p.data.split('-').reverse().slice(0,2).join('/'):'')+' · '+n(p.impressoes)+' impressões · '+n(p.engajamento)+' interações'+(p.cliques?' · '+n(p.cliques)+' cliques':'')+'</div></div></div>'}).join('');
  var esq='<div class="painel" style="min-height:0"><h3>Orgânico por rede · '+esc(mn)+'</h3>'+(RD.length?cab+lin:'<div class="erro">'+esc(O.erro||'Sem dados do Metricool agora.')+'</div>')
   +'<h3 style="margin-top:16px">Melhores publicações do mês</h3><div style="flex:1;min-height:0;overflow:hidden">'+(top||'<div style="font-size:19px;color:#8E9BC0">Nenhuma publicação com métricas neste mês ainda.</div>')+'</div></div>';
  // pago (resumo)
  var ls=L.slice(0,4).map(function(c){var co=cor(c.farol);return '<div class="lin" style="padding:9px 0;font-size:20px"><span class="bola" style="background:'+co+'"></span><div class="n"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(c.nome)+'</div><div style="font-size:15px;color:#8E9BC0">'+esc(c.rede)+' · '+esc(c.status)+' · '+brl(c.gasto)+'</div></div><div class="q">'+n(c.leads)+(c.meta?'<span style="font-size:15px;color:#8E9BC0">/'+n(c.meta)+'</span>':'')+' <span style="font-size:15px;color:#8E9BC0">leads</span></div></div>'}).join('');
  var mini=function(r,v){return '<div style="flex:1;min-width:0"><div style="font-size:15px;color:#8E9BC0;text-transform:uppercase;letter-spacing:1px">'+r+'</div><div style="font-size:30px;font-weight:800;white-space:nowrap">'+v+'</div></div>'};
  var dir='<div class="painel" style="min-height:0"><h3>Anúncios pagos</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;margin-bottom:8px">'+mini('Investido',brl(T.gasto))+mini('Cliques',n(T.cliques))+mini('Leads',n(T.leads)+(T.meta?' <span style="font-size:18px;color:#8E9BC0">/ '+n(T.meta)+'</span>':''))+mini('Custo por lead',T.leads?brlI(T.gasto/T.leads):'—')+'</div>'
   +(!M.ativas?'<div style="margin:6px 0;padding:10px 14px;border-radius:10px;background:#121C3C;font-size:18px;color:#FFB547">Nenhuma campanha paga ativa agora.</div>':'')
   +'<div style="flex:1;min-height:0;overflow:hidden">'+ls+'</div>'+(M.erro?'<div class="erro">⚠ '+esc(M.erro)+'</div>':'')+'</div>';
  h+='<div style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:23px">'+esq+dir+'</div>'
   +'<div style="font-size:16px;color:#6E7BA0">Orgânico: Metricool, publicações de '+esc(mn)+' até hoje · taxa de engajamento = curtidas + comentários + compartilhamentos ÷ impressões · pago: Meta/LinkedIn Ads</div>';
  return h}
function sProjT(){var J=D.proj||{},L=(J.lista||[]).slice(),R=J.rentabilidade||{},RP=R.projetos||[];
  /* v3.479: TAREFAS em atraso (vermelho) e com tendência de atraso (amarelo) por projeto + RENTABILIDADE por projeto em R$/mês com tendência */
  var n=function(v){return nz(v)?'—':Number(v).toLocaleString('pt-BR')},dt=function(s){return s?s.split('-').reverse().slice(0,2).join('/'):''};
  var pv=L.filter(function(p){return p.farol==='vermelho'||p.dias_atraso>0}),ta=0,tr=0,pa=0;L.forEach(function(p){ta+=p.tarefas_atraso||0;tr+=p.tarefas_risco||0;if(p.tarefas_atraso)pa++});
  var mT=0,mA=0,temA=false;RP.forEach(function(p){mT+=p.margem_mes||0;if(!nz(p.margem_mes_ant)){mA+=p.margem_mes_ant;temA=true}});var dv=temA?mT-mA:null;
  var seta=function(v){return nz(v)||Math.abs(v)<1?'<span style="color:#8E9BC0">● estável</span>':v>0?'<span class="ok">▲ '+brl(v)+'</span>':'<span class="cr">▼ '+brl(Math.abs(v))+'</span>'};
  var h='<div class="grade g4">'+k('Tarefas em atraso','<span class="'+(ta?'cr':'ok')+'">'+n(ta)+'</span>',pa?'em '+pa+' projeto(s) · data de fim já passou':'nenhuma tarefa vencida','md')
   +k('Tendência de atraso','<span class="'+(tr?'at':'ok')+'">'+n(tr)+'</span>','vencem em até 14 dias e estão atrás do previsto','md')
   +k('Rentabilidade dos projetos','<span class="'+(mT>=0?'ok':'cr')+'">'+brl(mT)+'</span>','por mês · '+(R.periodo?esc(R.periodo):'últimos 3 meses'),'md')
   +k('Tendência da rentabilidade',seta(dv),temA?'contra '+brl(mA)+'/mês em '+esc(R.anterior||'o trimestre anterior'):'sem o trimestre anterior para comparar','md')+'</div>';
  // tarefas por projeto
  L.sort(function(a,b){return (b.tarefas_atraso||0)-(a.tarefas_atraso||0)||(b.tarefas_risco||0)-(a.tarefas_risco||0)});
  var comT=L.filter(function(p){return p.tarefas_atraso||p.tarefas_risco});
  var bdg=function(v,c){return '<span style="display:inline-block;min-width:46px;text-align:center;padding:2px 10px;border-radius:14px;font-weight:800;font-size:21px;background:'+(v?c:'#1A2447')+';color:'+(v?'#0A1022':'#6E7BA0')+'">'+v+'</span>'};
  var lt=comT.slice(0,6).map(function(p){var it=(p.tarefas_atraso_lista||[]).slice(0,2).map(function(t){return '<div style="font-size:16px;color:#FF9AAE;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">● '+esc(t.nome)+(t.resp?' · '+esc(t.resp):'')+' · '+t.dias+'d de atraso</div>'}).join('')
       +(p.tarefas_atraso_lista&&p.tarefas_atraso_lista.length?'':(p.tarefas_risco_lista||[]).slice(0,2).map(function(t){return '<div style="font-size:16px;color:#FFD08A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">● '+esc(t.nome)+(t.resp?' · '+esc(t.resp):'')+' · vence '+dt(t.fim)+' · '+t.pct+'% feito</div>'}).join(''));
     return '<div style="display:flex;gap:14px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #1A2447"><div style="flex:1;min-width:0"><div style="font-size:22px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.nome)+'</div>'+it+'</div>'+bdg(p.tarefas_atraso||0,'#FF5C7A')+bdg(p.tarefas_risco||0,'#FFB547')+'</div>'}).join('');
  var esq='<div class="painel" style="min-height:0"><div style="display:flex;align-items:center;gap:14px"><h3 style="flex:1;margin:0">Tarefas por projeto</h3><span style="font-size:15px;color:#FF5C7A;font-weight:700">■ ATRASO</span><span style="font-size:15px;color:#FFB547;font-weight:700">■ TENDÊNCIA</span></div>'
   +'<div style="flex:1;min-height:0;overflow:hidden;margin-top:6px">'+(lt||(L.length?'<div class="ok" style="font-size:24px;margin-top:14px">✓ Nenhuma tarefa atrasada ou em risco nos '+L.length+' projetos ativos.</div>'+(pv.length?'<div style="font-size:20px;color:#FFB547;margin-top:14px;line-height:1.35">Mas '+pv.length+' projeto(s) estão com farol vermelho ou prazo vencido (slide Projetos) — o atraso deles vem do avanço abaixo do previsto, de marcos vencidos ou do status report do GP, não de tarefas vencidas no cronograma:</div>'+pv.slice(0,5).map(function(p){return '<div style="font-size:19px;padding:6px 0;border-bottom:1px solid #1A2447;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="cr">●</span> '+esc(p.nome)+' <span style="color:#8E9BC0">· '+esc(p.dias_atraso>0?'passou da data há '+p.dias_atraso+' dias':(p.motivo||'farol vermelho'))+'</span></div>'}).join(''):''):'<div class="erro">'+esc(J.erro||'Sem projetos ativos no Maestro.')+'</div>'))+'</div>'
   +(comT.length>6?'<div style="font-size:17px;color:#8E9BC0">+ '+(comT.length-6)+' projeto(s) com tarefas pendentes</div>':'')+'</div>';
  // rentabilidade por projeto
  var mx=1;RP.forEach(function(p){mx=Math.max(mx,Math.abs(p.margem_mes||0))});
  var lr=RP.slice(0,8).map(function(p){var m=p.margem_mes||0,w=Math.round(Math.abs(m)/mx*100);
     return '<div style="padding:8px 0;border-bottom:1px solid #1A2447"><div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline"><span style="font-size:20px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">'+esc(p.projeto)+'</span><span style="white-space:nowrap"><b class="'+(m>=0?'ok':'cr')+'" style="font-size:24px">'+brl(m)+'</b><span style="font-size:16px;color:#8E9BC0"> /mês'+(nz(p.margem_pct)?'':' · '+pct(p.margem_pct))+'</span></span></div>'
       +'<div style="display:flex;gap:12px;align-items:center;margin-top:5px"><div style="flex:1;height:9px;background:#1A2447;border-radius:6px;overflow:hidden"><i style="display:block;height:100%;width:'+w+'%;background:'+(m>=0?'#2EE6A6':'#FF5C7A')+'"></i></div><span style="font-size:17px;white-space:nowrap;width:150px;text-align:right">'+seta(p.variacao)+'</span></div></div>'}).join('');
  var dir='<div class="painel" style="min-height:0"><h3>Rentabilidade por projeto (margem R$/mês)</h3><div style="flex:1;min-height:0;overflow:hidden">'+(lr||'<div class="erro">'+esc(R.erro||'Sem dados de rentabilidade (Custo por Projeto).')+'</div>')+'</div></div>';
  h+='<div style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:23px">'+esq+dir+'</div>'
   +'<div style="font-size:16px;color:#6E7BA0">Tarefas: cronograma do Maestro (atraso = fim já passou e não concluída · tendência = vence em até 14 dias e está 15pp+ atrás do previsto ou não começou) · rentabilidade: tela Custo por Projeto (receita − impostos − folha apontada − custo fixo rateado), média mensal de '+esc(R.periodo||'3 meses')+' × '+esc(R.anterior||'trimestre anterior')+'</div>';
  return h}
/* v3.482: METAS ANUAIS · OBJETIVOS · RISCOS */
function fq(q,a,b){return nz(q)?null:q>=(a||1)?'verde':q>=(b||0.85)?'amarelo':'vermelho'}
function dtc(s){if(!s)return '';var d=String(s).substring(0,10).split('-');return d.length===3?d[2]+'/'+d[1]+'/'+d[0]:''}
function mt(o){var c=cor(o.f),tx=o.f==='verde'?'no rumo':o.f==='amarelo'?'atenção':o.f==='vermelho'?'fora da meta':(o.semTx||'sem meta');
  return '<div class="cr3" style="--c:'+c+';gap:3px;padding:14px 22px"><div class="t"><i></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">'+esc(o.rot)+'</span><span style="color:'+c+';padding:2px 10px;border-radius:20px;border:1px solid '+c+';font-size:13px;letter-spacing:.6px">'+tx+'</span></div>'
   +'<div style="font-size:42px;font-weight:800;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;color:'+(o.f?c:'#EAF0FF')+'">'+o.real+'</div>'
   +'<div style="font-size:18px;color:#AAB6D8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(o.meta||'')+'</div>'
   +(nz(o.p)?'':'<div class="bar" style="margin-top:6px"><i style="width:'+Math.max(0,Math.min(100,o.p))+'%;background:'+(o.f?c:'#00C4CC')+'"></i>'+(nz(o.marca)?'':'<u style="left:'+Math.max(0,Math.min(100,o.marca))+'%"></u>')+'</div>')
   +'<div style="font-size:16px;color:#8E9BC0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(o.sub||'')+'</div></div>'}
function sMetas(){if(!D.metas)return '<div style="margin:auto;font-size:30px;color:#8E9BC0">Atualizando as metas do ano… aparece na próxima carga da TV.</div>';var M=D.metas,F=M.fat,G=M.margem,A=M.anterior,V=M.vendas,S=M.saude||{},P=M.plano,fr=nz(M.fracao)?null:M.fracao;
  var n=function(v){return nz(v)?'—':Number(v).toLocaleString('pt-BR')};
  var T=[];
  // financeiras
  T.push(F?{rot:'Faturamento '+M.ano,real:brl(F.real),meta:'meta '+brl(F.meta)+' · '+pct(F.pct)+' atingido',p:F.pct,marca:fr,f:F.farol,
    sub:(nz(F.esperado)?'':'esperado até hoje '+brl(F.esperado))+(nz(F.projecao)?'':' · no ritmo fecha em '+brl(F.projecao))}:{rot:'Faturamento '+M.ano,real:'—',meta:'meta não cadastrada',sub:'Planejamento → Metas da Empresa'});
  T.push(G?{rot:'Margem líquida',real:pct(G.real),meta:'meta '+pct(G.meta)+(nz(G.dif)?'':' · '+(G.dif>=0?'+':'')+String(G.dif).replace('.',',')+' pp'),f:G.farol,p:nz(G.real)||!G.meta?null:G.real/G.meta*100,sub:'lucro líquido ÷ faturamento no ano (QuickBooks)'}:{rot:'Margem líquida',real:'—',meta:'meta não cadastrada'});
  var lq=G&&!nz(G.lucro_meta)&&!nz(G.lucro_real)?G.lucro_real/(G.lucro_meta*(fr!=null?fr/100:1)||1):null;
  T.push({rot:'Lucro líquido '+M.ano,real:brl(G?G.lucro_real:null),meta:G&&G.lucro_meta?'meta '+brl(G.lucro_meta)+' no ano':'sem meta de lucro',f:G&&G.lucro_real<0?'vermelho':fq(lq),p:G&&G.lucro_meta&&!nz(G.lucro_real)?G.lucro_real/G.lucro_meta*100:null,marca:fr,
    sub:G&&G.lucro_meta&&fr!=null?'esperado até hoje '+brl(G.lucro_meta*fr/100):''});
  var gM=A&&A.faturamento>0&&F&&F.meta?(F.meta/A.faturamento-1)*100:null,base=F?(nz(F.projecao)?F.real:F.projecao):null,gP=A&&A.faturamento>0&&!nz(base)?(base/A.faturamento-1)*100:null;
  T.push({rot:'Crescimento × '+(A?A.ano:'ano anterior'),real:nz(gP)?'—':(gP>=0?'+':'')+pct(gP),meta:nz(gM)?(A?M.ano-1+': '+brl(A.faturamento):'sem o ano anterior no QuickBooks'):'meta implícita '+(gM>=0?'+':'')+pct(gM)+' ('+brl(F.meta)+' × '+brl(A.faturamento)+')',
    f:nz(gP)||nz(gM)?null:fq(base/F.meta),semTx:'sem base',sub:F&&!nz(F.projecao)?'projeção do ano no ritmo atual × faturamento de '+(A?A.ano:''):'faturamento até hoje × ano anterior'});
  // clientes e vendas
  var E=(V&&V.etapas)||[],eg=E.filter(function(e){return e.ganho})[0]||{},el=E.filter(function(e){return e.contatos})[0]||null,dec=V&&!nz(V.decorrido)?V.decorrido:fr;
  var gq=V&&V.ganho?V.ganho.qtd:null,gv=V&&V.ganho?V.ganho.valor:null,mq=eg.meta_qtd,mv=!nz(eg.meta_valor)?eg.meta_valor:(V?V.meta:null);
  T.push({rot:'Novos contratos (ganhos)',real:n(gq),meta:mq?'meta '+n(Math.ceil(mq))+' no ano'+(nz(eg.meta_qtd_hoje)?'':' · '+n(Math.round(eg.meta_qtd_hoje))+' até hoje'):'sem meta de quantidade no funil',f:mq?(eg.farol||fq(gq/Math.max(0.1,eg.meta_qtd_hoje||mq))):null,p:mq?gq/mq*100:null,marca:dec,
    sub:'negócios ganhos no HubSpot em '+M.ano+(V&&V.ticket?' · ticket médio '+brl(V.ticket):'')});
  T.push({rot:'Receita de vendas ganhas',real:brl(gv),meta:mv?'meta '+brl(mv)+' · '+pct(gv/mv*100):'sem meta',f:mv?fq(gv/Math.max(1,(eg.meta_valor_hoje||mv*(dec!=null?dec/100:1)))):null,p:mv?gv/mv*100:null,marca:dec,
    sub:'valor dos negócios ganhos no ano'+(V&&V.perdidos&&V.perdidos.qtd?' · '+n(V.perdidos.qtd)+' perdidos ('+brl(V.perdidos.valor)+')':'')});
  T.push(el?{rot:'Leads no ano',real:n(el.real_qtd),meta:el.meta_qtd?'meta '+n(Math.ceil(el.meta_qtd))+' · '+pct(el.real_qtd/el.meta_qtd*100):'sem meta de leads no funil',f:el.farol,p:el.meta_qtd?el.real_qtd/el.meta_qtd*100:null,marca:dec,
    sub:'contatos criados no HubSpot'+(V.leads&&V.leads.total?' · '+n(V.leads.total)+' pelo site/campanhas ('+n(V.leads.reunioes)+' reuniões)':'')}:{rot:'Leads no ano',real:V&&V.leads?n(V.leads.total):'—',meta:'leads captados pelo sistema',sub:V&&V.leads?n(V.leads.reunioes)+' reuniões marcadas':''});
  var cb=V?V.cobertura:null;
  T.push({rot:'Cobertura do pipeline',real:nz(cb)?'—':pct(cb),meta:V&&V.aberto?n(V.aberto.qtd)+' negócios abertos · '+brl(V.aberto.valor):'',f:nz(cb)?null:cb>=100?'verde':cb>=70?'amarelo':'vermelho',p:cb,semTx:'sem dado',
    sub:'pipeline ponderado ÷ o que falta da meta'+(V&&!nz(V.taxa)?' · taxa de ganho '+V.taxa+'%':'')});
  var fs=T.map(function(t){return t.f}),cv=fs.filter(function(f){return f==='verde'}).length,ca=fs.filter(function(f){return f==='amarelo'}).length,cr=fs.filter(function(f){return f==='vermelho'}).length;
  var placar='<div style="display:flex;align-items:center;gap:26px;background:#0F1630;border:1px solid #1E2A52;border-radius:17px;padding:12px 26px">'
   +'<div style="font-size:22px;font-weight:800;flex:1">Metas de '+M.ano+' <span style="font-size:18px;color:#8E9BC0;font-weight:600">· '+(fr!=null?pct(fr)+' do ano decorrido':'')+'</span></div>'
   +[['verde',cv,'no rumo'],['amarelo',ca,'atenção'],['vermelho',cr,'fora da meta']].map(function(x){return '<div style="display:flex;align-items:center;gap:10px"><span class="bola" style="width:30px;height:30px;background:'+cor(x[0])+';box-shadow:0 0 14px '+cor(x[0])+'"></span><b style="font-size:34px">'+x[1]+'</b><span style="font-size:17px;color:#8E9BC0">'+x[2]+'</span></div>'}).join('')+'</div>';
  var sec=function(t){return '<div style="font-size:17px;color:#6E7BA0;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:-8px">'+t+'</div>'};
  var h=placar+sec('Financeiras')+'<div class="grade g4">'+T.slice(0,4).map(mt).join('')+'</div>'+sec('Clientes e vendas')+'<div class="grade g4">'+T.slice(4).map(mt).join('')+'</div>';
  // indicadores-chave
  var li=function(f,r,v,s){return '<div class="lin" style="padding:5px 0;font-size:20px"><span class="bola" style="background:'+cor(f)+'"></span><div class="n">'+r+(s?'<div style="font-size:15px;color:#8E9BC0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+s+'</div>':'')+'</div><div class="q" style="font-size:24px">'+v+'</div></div>'};
  var C=M.carteira,rw=S.runway;
  var ind='<div class="painel" style="min-height:0"><h3>Indicadores-chave</h3><div style="flex:1;min-height:0;overflow:hidden">'
   +(C?li(nz(C.cobre_pct)?null:C.cobre_pct>=100?'verde':C.cobre_pct>=70?'amarelo':'vermelho','Carteira prevista até dez',brl(C.prevista),nz(C.cobre_pct)?'marcos, sustentações e faturas a receber':'cobre '+pct(C.cobre_pct)+' do que falta da meta'):'')
   +(F&&!nz(F.projecao_carteira)?li(F.meta?fq(F.projecao_carteira/F.meta,1,0.9):null,'Fechamento com a carteira',brl(F.projecao_carteira),'realizado + carteira prevista × meta '+brl(F.meta)):'')
   +(F&&!nz(F.por_mes)&&F.falta>0?li(null,'Preciso faturar por mês',brl(F.por_mes),'para bater a meta nos '+F.meses_rest+' meses restantes'):'')
   +li(S.runway_farol||null,'Runway de caixa',nz(rw)?'—':rw>=999?'sem queima':String(rw).replace('.',',')+' meses','caixa '+brl(S.caixa)+(nz(S.liquidez)?'':' · liquidez '+String(S.liquidez).replace('.',',')))
   +'</div></div>';
  // alavancas do plano
  var al=P?(P.alavancas||[]).filter(function(a){return a.receita_meta}).slice(0,6).map(function(a){var rit=a.leads_ano?a.leads_ano/4:null,q=rit&&!nz(a.leads_90d)?a.leads_90d/rit:null,f=nz(q)?null:q>=1?'verde':q>=0.5?'amarelo':'vermelho';
     return '<div class="lin" style="padding:7px 0;font-size:19px"><span class="bola" style="background:'+cor(f)+'"></span><div class="n">'+esc(a.nome)+'<div style="font-size:15px;color:#8E9BC0">meta '+brl(a.receita_meta)+' · '+n(a.contratos)+' contrato(s)'+(nz(a.receita_real)?'':' · realizado '+brl(a.receita_real))+'</div></div><div class="q" style="font-size:22px;text-align:right">'+n(a.leads_90d)+'<span style="font-size:15px;color:#8E9BC0"> / '+(rit?n(Math.ceil(rit)):'—')+' leads</span></div></div>'}).join(''):'';
  var pl='<div class="painel" style="min-height:0"><h3>'+(P?esc(P.nome)+' · alavancas — leads em 90 dias × ritmo necessário':'Plano estratégico')+'</h3><div style="flex:1;min-height:0;overflow:hidden">'+(al||'<div class="erro">Nenhum plano estratégico aprovado (Estratégia → Plano estratégico).</div>')+'</div></div>';
  h+='<div style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:23px">'+ind+pl+'</div>'
   +'<div style="font-size:15px;color:#6E7BA0">Financeiras: QuickBooks + Metas da Empresa ('+(D.fin&&D.fin.regime?'regime '+esc(D.fin.regime):'')+') · clientes e vendas: funil de '+M.ano+' no HubSpot com as metas do funil · farol: realizado × esperado até hoje (verde ≥ 100%, amarelo ≥ 85%) · alavancas: verde = leads de 90 dias no ritmo do plano, amarelo ≥ metade'+(M.erro?' · ⚠ '+esc(M.erro):'')+'</div>';
  return h}
function sObj(){var X=D.estr||{},O=X.okr,Sa=X.sala,PL=X.planejamento,P=(D.metas||{}).plano,Vi=P&&P.visao;
  var br=function(p,f){return '<div style="flex:1;height:12px;background:#1A2447;border-radius:7px;overflow:hidden"><i style="display:block;height:100%;width:'+Math.max(0,Math.min(100,p||0))+'%;background:'+(f?cor(f):'#00C4CC')+'"></i></div>'};
  var top='<div style="display:flex;align-items:center;gap:24px;background:#0F1630;border:1px solid #1E2A52;border-radius:17px;padding:16px 26px">'+(O&&O.saude?luz(O.saude):'')
   +'<div style="flex:1;min-width:0"><div style="font-size:16px;color:#8E9BC0;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">'+(O&&O.trimestre?'Foco de '+esc(O.trimestre):'Foco estratégico')+(O&&O.em?' <span style="color:#00C4CC">· OKRs gerados em '+dtc(O.em)+(O.status_em?' · status medido em '+dtc(O.status_em):'')+'</span>':'')+'</div>'
   +'<div style="font-size:28px;font-weight:700;line-height:1.25;margin-top:4px;max-height:72px;overflow:hidden">'+esc((O&&O.tema)||(Sa&&Sa.decisao)||(PL&&PL.estrategia)||'Gere os OKRs em Planejamento → OKRs para aparecerem aqui.')+'</div></div></div>';
  var ob=O?(O.objetivos||[]).map(function(o,i){var f=o.farol;
     return '<div style="padding:12px 0;border-bottom:1px solid #1A2447"><div style="display:flex;align-items:center;gap:16px"><div style="width:44px;height:44px;border-radius:50%;background:'+(f?cor(f):'#1E2A52')+';color:#0A1022;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex:0 0 44px">O'+(i+1)+'</div>'
       +'<div style="flex:1;min-width:0;font-size:23px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(o.objetivo)+'</div>'+(nz(o.progresso)?'<span style="font-size:16px;color:#8E9BC0;white-space:nowrap">não medido</span>':'<b style="font-size:28px;color:'+cor(f)+'">'+o.progresso+'%</b>')+'</div>'
       +(nz(o.progresso)?'':'<div style="display:flex;margin:8px 0 2px 60px">'+br(o.progresso,f)+'</div>')
       +(o.krs||[]).slice(0,3).map(function(k){return '<div style="display:flex;gap:10px;align-items:center;margin:5px 0 0 60px;font-size:17px"><span class="bola" style="width:13px;height:13px;background:'+cor(k.farol)+'"></span><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#C8D2EE">'+esc(k.kr)+'</span>'
         +(k.meta?'<span style="white-space:nowrap;color:#8E9BC0">'+(k.atual?esc(k.atual)+' → ':'')+'<b style="color:#EAF0FF">'+esc(k.meta)+'</b>'+(nz(k.progresso)?'':' · '+k.progresso+'%')+'</span>':'')+'</div>'}).join('')+'</div>'}).join(''):'';
  var esq='<div class="painel" style="min-height:0"><h3>Objetivos e resultados-chave'+(O&&O.status_em?' · status de '+dtc(O.status_em):O&&O.em?' · gerados em '+dtc(O.em):'')+'</h3><div style="flex:1;min-height:0;overflow:hidden">'+(ob||'<div class="erro">Sem OKRs gerados ainda (Planejamento → OKRs → Gerar OKRs com IA).</div>')+'</div>'
   +(O&&!O.status_em&&O.objetivos&&O.objetivos.length?'<div style="font-size:16px;color:#FFB547">Progresso não medido — rode "Status dos OKRs" no Planejamento para acender o farol de cada objetivo.</div>':'')+'</div>';
  var vis=function(r,t){return t?'<div style="padding:8px 0;border-bottom:1px solid #1A2447"><div style="font-size:15px;color:#00C4CC;font-weight:800;letter-spacing:1.5px">'+r+'</div><div style="font-size:18px;line-height:1.3;max-height:48px;overflow:hidden">'+esc(t)+'</div></div>':''};
  var pr=(P&&P.prioridades&&P.prioridades.length?P.prioridades:(PL?(PL.prioridades||[]).map(function(x){return x.titulo}):[])).slice(0,4);
  var nf=(O&&O.nao_fazer)||[];
  var dir='<div class="painel" style="min-height:0"><h3>Visão'+(P?' · '+esc(P.nome):'')+'</h3>'
   +(Vi?vis('90 DIAS',Vi.d90)+vis('1 ANO',Vi.a1)+vis('5 ANOS',Vi.a5):PL?vis('90 DIAS',PL.v90)+vis('1 ANO',PL.a1)+vis('3 ANOS',PL.a3):'<div class="erro">Sem plano estratégico aprovado.</div>')
   +'<h3 style="margin-top:14px">Prioridades</h3><div style="flex:1;min-height:0;overflow:hidden">'+pr.map(function(x,i){return '<div style="display:flex;gap:10px;font-size:18px;padding:4px 0"><b style="color:#00C4CC">'+(i+1)+'</b><span style="min-width:0;max-height:46px;overflow:hidden">'+esc(x)+'</span></div>'}).join('')
   +(nf.length?'<div style="font-size:15px;color:#FF9AAE;font-weight:800;letter-spacing:1.5px;margin-top:10px">NÃO VAMOS FAZER</div>'+nf.slice(0,2).map(function(x){return '<div style="font-size:17px;color:#C8D2EE;padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">✕ '+esc(x)+'</div>'}).join(''):'')+'</div></div>';
  return top+'<div style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:23px">'+esq+dir+'</div>'
   +'<div style="font-size:15px;color:#6E7BA0">OKRs: Planejamento → OKRs (último gerado'+(O&&O.status_em?' e último status medido':'')+') · visão e prioridades: plano estratégico aprovado'+(Sa?' · última sessão da Sala de Estratégia: '+esc(Sa.tema)+' ('+dtc(Sa.em)+')':'')+(X.erro?' · ⚠ '+esc(X.erro):'')+'</div>'}
function sRis(){var X=D.estr||{},R=X.riscos,Sa=X.sala,M=D.metas||{},Fi=D.fin||{},Q=D.qual||{},J=D.proj||{},Ra=J.resumo||{};
  var nv=R?String(R.nivel).toLowerCase():'',fn=/alt/.test(nv)?'vermelho':/m[eé]d/.test(nv)?'amarelo':/baix/.test(nv)?'verde':null;
  var fs=function(sc){return sc>=6?'vermelho':sc>=3?'amarelo':'verde'};
  var box=function(n,r,c){return '<div style="text-align:center;padding:0 14px"><div style="font-size:44px;font-weight:800;color:'+c+';line-height:1">'+n+'</div><div style="font-size:15px;color:#8E9BC0;text-transform:uppercase;letter-spacing:1px">'+r+'</div></div>'};
  var top='<div style="display:flex;align-items:center;gap:24px;background:#0F1630;border:1px solid #1E2A52;border-radius:17px;padding:14px 26px">'+luz(fn)
   +'<div style="width:230px"><div style="font-size:16px;color:#8E9BC0;letter-spacing:1.5px;text-transform:uppercase;font-weight:700">Risco geral</div><div style="font-size:42px;font-weight:800;color:'+cor(fn)+'">'+esc(R?R.nivel:'—')+'</div><div style="font-size:16px;color:#00C4CC;font-weight:700;margin-top:2px">'+(R&&R.em?'análise de '+dtc(R.em):Sa?'Sala de Estratégia '+dtc(Sa.em):'sem análise gerada')+'</div></div>'
   +(R?box(R.matriz.criticos,'críticos','#FF5C7A')+box(R.matriz.monitorar,'monitorar','#FFB547')+box(R.matriz.aceitar,'aceitar','#2EE6A6'):'')
   +'<div style="flex:1;min-width:0;border-left:1px solid #1E2A52;padding-left:24px"><div style="font-size:15px;color:#FF9AAE;letter-spacing:1.5px;font-weight:800">RISCO Nº 1 · AGIR ESTA SEMANA</div><div style="font-size:20px;line-height:1.3;max-height:78px;overflow:hidden;margin-top:3px">'+esc(R?R.n1:'Gere a análise de riscos em Planejamento → Riscos.')+'</div></div></div>';
  var L=R?R.lista:((Sa&&Sa.riscos)||[]).map(function(r){return {risco:r.risco,mitigacao:r.mitigacao,score:null}});
  var cards=L.slice(0,6).map(function(r){var f=nz(r.score)?null:fs(r.score),c=cor(f);
    return '<div style="background:#0B1228;border:1px solid #1E2A52;border-left:6px solid '+c+';border-radius:12px;padding:10px 16px;min-width:0;display:flex;flex-direction:column;gap:3px;overflow:hidden">'
     +'<div style="display:flex;gap:10px;align-items:center;font-size:14px;color:#8E9BC0;text-transform:uppercase;letter-spacing:1px;font-weight:700;white-space:nowrap"><span style="color:'+c+'">'+esc(r.categoria||'Risco')+'</span>'+(r.prob?'<span>· prob. '+esc(r.prob)+' · impacto '+esc(r.impacto)+'</span>':'')+'<span style="flex:1"></span>'+'</div>'
     +'<div style="font-size:19px;font-weight:700;line-height:1.25;max-height:48px;overflow:hidden">'+esc(r.risco)+'</div>'
     +'<div style="font-size:16px;color:#AAB6D8;line-height:1.25;max-height:40px;overflow:hidden"><b style="color:#2EE6A6">Mitigação:</b> '+esc(r.mitigacao)+'</div>'
     +(r.dono||r.prazo||r.status||r.valor?'<div style="font-size:14px;color:#8E9BC0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(r.valor&&r.valor!=='—'?'<b style="color:#EAF0FF">impacto '+esc(r.valor)+'</b> · ':'')+[r.dono,r.prazo,r.status].filter(Boolean).map(esc).join(' · ')+'</div>':'')+'</div>'}).join('');
  var esq='<div class="painel" style="min-height:0"><h3>Riscos mapeados'+(R&&R.em?' · análise de '+dtc(R.em):Sa?' · Sala de Estratégia '+dtc(Sa.em):'')+'</h3>'
   +(cards?'<div style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:minmax(0,1fr);gap:12px">'+cards+'</div>':'<div class="erro">Nenhuma análise de riscos gerada ainda.</div>')+'</div>';
  // sinais ao vivo
  var ta=0;(J.lista||[]).forEach(function(p){ta+=p.tarefas_atraso||0});
  var cx=Fi.caixa,pg=Fi.pagar,rv=Fi.receber_vencido,rc=Fi.receber,cb=M.vendas?M.vendas.cobertura:null,sd=M.saude||{};
  var S=[
    ['Caixa × contas a pagar',nz(cx)||nz(pg)?null:pg<=0?'verde':fq(cx/pg,1,0.7),nz(cx)?'—':brl(cx),nz(pg)?'':'a pagar '+brl(pg)],
    ['Recebíveis vencidos',nz(rv)?null:rv<=0?'verde':rc&&rv/rc<=0.1?'amarelo':'vermelho',brl(rv),nz(rc)?'':'de '+brl(rc)+' a receber'],
    ['Runway de caixa',sd.runway_farol||null,nz(sd.runway)?'—':sd.runway>=999?'sem queima':String(sd.runway).replace('.',',')+' m','meses de gasto cobertos pelo caixa'],
    ['Faturamento do ano no ritmo',M.fat?M.fat.farol:null,M.fat?pct(M.fat.pct):'—',M.fat&&!nz(M.fat.projecao)?'fecha em '+brl(M.fat.projecao)+' × meta '+brl(M.fat.meta):''],
    ['Cobertura do pipeline',nz(cb)?null:cb>=100?'verde':cb>=70?'amarelo':'vermelho',nz(cb)?'—':pct(cb),'ponderado ÷ o que falta da meta'],
    ['Projetos no vermelho',nz(Ra.vermelho)?null:Ra.vermelho===0?'verde':Ra.vermelho<=2?'amarelo':'vermelho',nz(Ra.vermelho)?'—':Ra.vermelho+' de '+Ra.total,ta?ta+' tarefa(s) em atraso':'nenhuma tarefa vencida'],
    ['Termos de faturamento',(Q.termos||{}).farol||null,nz((Q.termos||{}).errados)?'—':Q.termos.errados,(Q.termos||{}).valor_pendente?brl(Q.termos.valor_pendente)+' parados':'com pendência'],
    ['Contabilidade (QuickBooks)',(Q.qb||{}).farol||null,nz((Q.qb||{}).com_erro)?'—':Q.qb.com_erro,'problema(s) a corrigir no fechamento']];
  var sl=S.map(function(x){return '<div class="lin" style="padding:7px 0;font-size:19px"><span class="bola" style="background:'+cor(x[1])+';box-shadow:0 0 10px '+cor(x[1])+'"></span><div class="n">'+x[0]+'<div style="font-size:14px;color:#8E9BC0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+x[3]+'</div></div><div class="q" style="font-size:23px">'+x[2]+'</div></div>'}).join('');
  var dir='<div class="painel" style="min-height:0"><h3>Sinais de risco nos números · ao vivo</h3><div style="flex:1;min-height:0;overflow:hidden">'+sl+'</div>'
   +(R&&R.contingencia?'<div style="font-size:15px;color:#FFB547;line-height:1.3;max-height:40px;overflow:hidden;margin-top:6px"><b>Contingência:</b> '+esc(R.contingencia)+'</div>':'')+'</div>';
  return top+'<div style="flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:23px">'+esq+dir+'</div>'
   +'<div style="font-size:15px;color:#6E7BA0">Riscos: última análise do Planejamento Estratégico (cor = probabilidade × impacto) · sinais: QuickBooks, HubSpot, Maestro e Faturamento atualizados a cada carga da TV</div>'}
var TIT={financeiro:'Financeiro',comercial:'Vendas · funil',marketing:'Marketing',qualidade:'Qualidade',projetos:'Projetos',projetos_tarefas:'Projetos · tarefas e rentabilidade',metas:'Metas anuais',objetivos:'Objetivos estratégicos',riscos:'Riscos'},REN={financeiro:sFin,comercial:sCom,marketing:sMkt,qualidade:sQual,projetos:sProj,projetos_tarefas:sProjT,metas:sMetas,objetivos:sObj,riscos:sRis};
function render(){var p=$('palco');p.innerHTML=SLIDES.map(function(s,i){return '<div class="slide'+(i===idx?' on':'')+'">'+REN[s]()+'</div>'}).join('');
  $('dots').innerHTML=SLIDES.map(function(s,i){return '<span class="'+(i===idx?'on':'')+'"></span>'}).join('');$('tit').textContent='Gestão à vista · '+TIT[SLIDES[idx]];
  var g=new Date(D.gerado_em),NB={res:'resultado do mês',fin:'financeiro',com:'vendas',mkt:'marketing',proj:'projetos',qual_termos:'termos',qual_qb:'QuickBooks',qual_proj:'projetos'};
  var an=(D.antigos||[]).map(function(a){return NB[a.bloco]+' de '+new Date(a.em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})});
  $('atu').innerHTML='números de '+g.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+(an.length?' · <span style="color:#FFB547">último dado válido: '+esc(an.join(', '))+'</span>':'')+(D.aviso_cache?' · '+esc(D.aviso_cache):'')+' · atualiza a cada 10 min'}
function ir(n){if(!D||!SLIDES.length)return;idx=(n+SLIDES.length)%SLIDES.length;var sl=document.querySelectorAll('.slide');for(var i=0;i<sl.length;i++)sl[i].className='slide'+(i===idx?' on':'');
  var d=document.querySelectorAll('#dots span');for(var j=0;j<d.length;j++)d[j].className=j===idx?'on':'';$('tit').textContent='Gestão à vista · '+TIT[SLIDES[idx]];t0=Date.now()}
function carregar(){var x=new XMLHttpRequest();x.open('GET','/api/tv?t='+encodeURIComponent(COD)+'&dados=1&_='+Date.now());x.onload=function(){try{var r=JSON.parse(x.responseText);if(!r.success)throw new Error(r.error||'erro');D=r.dados;render()}catch(e){if(!D)$('palco').innerHTML='<div class="slide on"><div style="margin:auto;font-size:28.1px;color:#FFB547;text-align:center;">'+esc(e.message||'Sem conexão')+'<br><span style="font-size:21.6px;color:#8E9BC0">nova tentativa em 1 minuto</span></div></div>';setTimeout(carregar,60000)}};x.onerror=function(){setTimeout(carregar,60000)};x.send()}
function relogio(){var a=new Date();$('rel').textContent=a.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});$('dt').textContent=a.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',timeZone:'America/Sao_Paulo'});
  if(PAUSA)return;if(D&&SLIDES.length>1){var f=(Date.now()-t0)/(ROT*1000);$('prog').style.width=Math.min(100,f*100)+'%';if(f>=1)ir(idx+1)}}
document.addEventListener('keydown',function(e){if(e.keyCode===39||e.keyCode===40)ir(idx+1);if(e.keyCode===37||e.keyCode===38)ir(idx-1);if(e.keyCode===13&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen()});
/* v3.485: clique PAUSA a troca de slides; outro clique continua (a 1ª vez também entra em tela cheia) · espaço faz o mesmo */
var PAUSA=false;function pausar(){PAUSA=!PAUSA;$('pz').style.display=PAUSA?'block':'none';if(!PAUSA)t0=Date.now()}
document.addEventListener('click',function(){if(document.documentElement.requestFullscreen&&!document.fullscreenElement)document.documentElement.requestFullscreen();pausar()});
document.addEventListener('keydown',function(e){if(e.keyCode===32){e.preventDefault();pausar()}});
function ajusta(){document.documentElement.style.setProperty('--s',Math.min(innerWidth/1920,innerHeight/1080))}window.addEventListener('resize',ajusta);ajusta();
t0=Date.now();carregar();setInterval(carregar,10*60000);setInterval(relogio,500);relogio();setTimeout(function(){location.reload()},6*3600000);
</script></body></html>`;
}
const paginaErro = msg => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atlantyx · TV</title><meta name="robots" content="noindex"></head><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#070B18;color:#EAF0FF;font-family:Montserrat,Arial,sans-serif;text-align:center;"><div><div style="font-size:5vh;font-weight:800;letter-spacing:.4vw;">ATLANTYX</div><div style="font-size:2.6vh;margin-top:2vh;color:#8E9BC0;">${msg}</div></div></body></html>`;

async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url || '/', 'http://x').searchParams);
  try {
    if (req.method === 'GET') {
      const cod = String(q.t || ''), cfg = await config();
      const valido = RX_COD.test(cod) && cfg.codigo && crypto.timingSafeEqual(Buffer.from(cod.padEnd(40)), Buffer.from(String(cfg.codigo).padEnd(40)));
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('Referrer-Policy', 'no-referrer');
      if (q.dados) { if (!valido) return res.status(404).json({ success: false, error: 'Link da TV inválido ou revogado' }); return res.status(200).json({ success: true, dados: await dados(false) }); }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!valido) return res.status(404).send(paginaErro('Este link da TV foi revogado ou não existe.<br>Gere um novo em Dashboard › Gestão à vista (TV).'));
      return res.status(200).send(pagina(cfg, cod));
    }
    const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const acoes = {
      config: async () => { const c = await config(); return { config: { ...c, link: c.codigo ? base() + '/tv/' + c.codigo : null } }; },
      gerar: async () => { const c = await config(); const n = { ...c, codigo: codigoNovo(), criado_em: new Date().toISOString() }; await kv('tv:config', n); return { config: { ...n, link: base() + '/tv/' + n.codigo } }; },
      revogar: async () => { const c = await config(); await kv('tv:config', { ...c, codigo: null, criado_em: null }); return { ok: true }; },
      salvar: async () => { const c = await config(); const n = { ...c, v152: true, v156: true, v332: true, v479: true, v482: true, nomes_projetos: b.nomes_projetos === undefined ? c.nomes_projetos : !!b.nomes_projetos, rotacao_s: Math.max(8, Math.min(180, parseInt(b.rotacao_s) || c.rotacao_s)), slides: (b.slides || c.slides).filter(s => SLIDES_OK.includes(s)) };
        if (!Array.isArray(n.slides) || !n.slides.length) throw new Error('Escolha pelo menos um slide'); await kv('tv:config', n);
        /* v3.237: esconder nomes vale na hora (cache de 10 min) */ if (n.nomes_projetos !== c.nomes_projetos) { try { await kv('tv:dados', null); } catch (_) {} } return { config: { ...n, link: n.codigo ? base() + '/tv/' + n.codigo : null } }; },
      atualizar_dados: async () => ({ dados: await dados(true) }),
      conferir: () => conferir(),
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) { console.error('[tv]', e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'tv');
export { dados as dadosGestao, qualidade as _qualidade, pagina as _paginaTv };
