import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
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
const SLIDES_OK = ['financeiro', 'comercial', 'qualidade', 'projetos'];
// v3.152: o slide Qualidade entra nas TVs já configuradas (uma vez; depois vale o que o usuário salvar)
const config = async () => { const c = { ...CFG_PADRAO, ...((await kv('tv:config')) || {}) }; if (!c.v152) { c.slides = [...new Set([...(c.slides || []), 'qualidade'])]; c.v152 = true; } if (!c.v156) { c.slides = [...new Set([...(c.slides || []), 'projetos'])]; c.v156 = true; } if (c.nomes_projetos === undefined) c.nomes_projetos = true; return c; };
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
    const por = {}; errados.forEach(t => [...new Set((t.pendencias_criticas || []).map(p => p.tipo))].forEach(k => { por[k] = (por[k] || 0) + 1; }));
    const pe = abertos.length ? errados.length / abertos.length : 0;
    out.termos = { erro: eT, abertos: T ? abertos.length : null, corretos: T ? abertos.length - errados.length : null, errados: T ? errados.length : null,
      motivos: Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ motivo: TIPO_TERMO[k] || k, qtd: n })),
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
      com_bloqueio: r ? (r.com_bloqueio || 0) : null, desatualizados: r ? (r.pendentes_de_atualizacao || 0) : null,
      farol: !r ? null : r.vermelho ? 'vermelho' : (r.amarelo || r.sem_report) ? 'amarelo' : 'verde' }; }
  return out;
}
async function montarDados() {
  const [pr, kp, vd, fu, se, tq, hg, pm, ma, cf] = await Promise.allSettled([
    chamar('financeiro', { action: 'painel_resumo', params: {} }), chamar('financeiro', { action: 'resultado_kpis', params: {} }, 45000),
    chamar('vendas', { action: 'painel', payload: {} }, 45000), chamar('crm', { action: 'funil_campanha', payload: { dias: 30 } }), chamar('crm', { action: 'comercial_semaforo', payload: {} }),
    chamar('faturamento', { action: 'termo_list', payload: {} }), chamar('financeiro', { action: 'higienizacao_dados', params: {} }, 60000), chamar('pmo', { action: 'painel_mestre', payload: {} }, 45000), chamar('pmo', { action: 'maestro_painel', payload: {} }, 45000), config()]);
  const v = p => p.status === 'fulfilled' ? p.value : null, erro = p => p.status === 'rejected' ? String(p.reason?.message || p.reason).substring(0, 120) : null;
  const P = v(pr) || {}, K = v(kp)?.resultado || {}, Pm = K.periodo_res || {}, A = K.ano_res || {}, M = K.metas_periodo || {};
  const V = v(vd) || {}, VM = V.metas || {}, VC = V.calculo || {}, VP = V.propostas || {}, F = v(fu) || {}, S = v(se) || {};
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().substring(0, 10);
  const MA = v(ma), CF = v(cf) || {}, rank = { vermelho: 0, amarelo: 1, verde: 2 };
  const proj = MA ? { erro: null, fonte: MA.fonte, resumo: MA.resumo, nomes: CF.nomes_projetos !== false,
      lista: MA.projetos.filter(p => p.ativo).sort((a, b) => (rank[a.farol] ?? 3) - (rank[b.farol] ?? 3) || String(a.conclusao || '9').localeCompare(String(b.conclusao || '9')))
        .map((p, i) => ({ nome: CF.nomes_projetos !== false ? String(p.nome).substring(0, 60) : 'Projeto ' + (i + 1), gerente: CF.nomes_projetos !== false ? String(p.gerente || '').substring(0, 30) : '', conclusao: p.conclusao, pct: p.pct, planejado: p.planejado, desvio: p.desvio, farol: p.farol, dias_atraso: p.dias_atraso, motivo: p.origem === 'status report' ? 'farol do status report' + ((p.motivos || [])[0] ? ' · ' + p.motivos[0] : '') : ((p.motivos || [])[0] || null) })) }
    : { erro: 'Módulo de projetos: ' + (erro(ma) || 'sem resposta'), lista: [], resumo: null };
  return { qual: qualidade(v(tq), erro(tq), v(hg), erro(hg), v(pm), erro(pm), MA), proj,
    gerado_em: new Date().toISOString(), mes_ref: hoje.substring(0, 7),
    fin: { erro: [erro(pr), erro(kp)].filter(Boolean).join(' · ') || null,
      mes: { faturamento: num(Pm.faturamento), meta_faturamento: num(M.faturamento), lucro: num(Pm.lucro_liquido), margem_pct: num(Pm.margem_liquida_pct), meta_margem_pct: num(K.meta_margem?.pct), semaforo: K.semaforo_margem || null,
        ebitda: num(Pm.ebitda), fracao_decorrida: num(M.fracao_decorrida), ultimo_fechado: K.ultimo_mes_fechado ? { mes: K.ultimo_mes_fechado.mes, faturamento: num(K.ultimo_mes_fechado.faturamento), margem_pct: num(K.ultimo_mes_fechado.margem_liquida_pct) } : null },
      ano: { faturamento: num(A.faturamento), lucro: num(A.lucro_liquido), margem_pct: num(A.margem_liquida_pct) },
      caixa: num(P.saldoCaixa), receber: num(P.contasReceber?.total ?? P.aReceber), receber_vencido: num(P.contasReceber?.vencido), receber_30d: num(P.contasReceber?.a_vencer_30d), pagar: num(P.contasPagar?.total ?? P.aPagar),
      mensal: (K.mensal || []).map(m => ({ mes: m.mes, faturamento: num(m.faturamento), lucro: num(m.lucro_liquido) })) },
    com: { erro: [erro(vd), erro(fu), erro(se)].filter(Boolean).join(' · ') || null, aviso: V._cache?.stale ? 'números de vendas do último cálculo salvo' : null,
      meta_mes_pct: num(VM.pct_mes), meta_ano_pct: num(VM.pct_ano), realizado_mes: num(VM.realizado_mes), meta_mes: num(VM.meta_mensal), realizado_ano: num(VM.realizado_ano), meta_ano: num(VM.meta_anual), gap_mes: num(VM.gap_mes), gap_ano: num(VM.gap_ano), dias_uteis_mes: num(VM.dias_uteis_mes),
      propostas: { abertas: num(VP.abertas), valor_aberto: num(VP.valor_aberto), ganhas: num(VP.ganhas), perdidas: num(VP.perdidas), paradas: num(VP.paradas) },
      win_rate_pct: num(VC.win_rate_pct), ciclo_dias: num(VC.ciclo_dias), cobertura: VC.cobertura_pipeline ?? null,
      funil: { leads: num(F.total_leads), reunioes: num(F.total_reunioes), campanhas: (F.campanhas || []).slice(0, 5).map(c => ({ nome: String(c.campanha || '').substring(0, 40), leads: c.leads, reunioes: c.reunioes })) },
      semaforo: (S.cards || []).slice(0, 8).map(c => ({ nome: String(c.nome || c.papel || c.id || '').substring(0, 40), farol: c.farol || null, contatos_pct: num(c.pct_contatos), reunioes_pct: num(c.pct_reunioes) })) },
  };
}
// v3.152: CONFERIR — abre cada número da TV até a origem (só no sistema, com login; a página da TV continua só com totais)
async function conferir() {
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().substring(0, 10), ini = hoje.substring(0, 8) + '01';
  const [ex, pr, rk, vd] = await Promise.allSettled([
    chamar('financeiro', { action: 'extrato_consolidado', params: { data_inicio: ini, data_fim: hoje, incluir_simulados: false } }, 45000),
    chamar('financeiro', { action: 'painel_resumo', params: {} }), chamar('financeiro', { action: 'resultado_kpis', params: {} }, 45000),
    chamar('vendas', { action: 'painel', payload: {} }, 45000)]);
  const v = p => p.status === 'fulfilled' ? p.value : null, er = p => p.status === 'rejected' ? String(p.reason?.message || p.reason).substring(0, 160) : null;
  const E = v(ex) || {}, P = v(pr) || {}, K = v(rk)?.resultado || {}, VM = v(vd)?.metas || {}, tv = await kv('tv:dados');
  const L = (E.lancamentos || []).filter(l => l.origem !== 'simulado' && l.afeta_saldo !== false);
  const top = t => L.filter(l => l.tipo === t).sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 12).map(l => ({ data: l.data, descricao: String(l.descricao || l.contraparte || l.nome || '').substring(0, 90), conta: l.conta || l.conta_nome || '', valor: num(l.valor) }));
  return { conferir: { hoje, periodo: { de: ini, ate: hoje }, na_tv: tv ? { gerado_em: tv.gerado_em, caixa: tv.fin?.caixa, faturamento_mes: tv.fin?.mes?.faturamento, meta_mes_pct: tv.com?.meta_mes_pct, meta_ano_pct: tv.com?.meta_ano_pct } : null,
    caixa: { erro: er(ex), saldo_abertura: num(E.saldo_inicial), abertura_data: E.saldo_inicial_data || ini, abertura_origem: E.saldo_inicial_origem || null, abertura_obs: E.saldo_inicial_detalhe?.observacao || null,
      conferencia_cadastro: E.saldo_inicial_conferencia || null, entradas: num(E.total_entradas), saidas: num(E.total_saidas), saldo_hoje: num(E.saldo_final), qtd_lancamentos: L.length,
      soma_contas_qb: num(P.saldoCaixaCurrentBalance), maiores_entradas: top('entrada'), maiores_saidas: top('saida') },
    faturamento: { erro: er(rk), regime: K.regime || null, mes: num(K.periodo_res?.faturamento), lucro_mes: num(K.periodo_res?.lucro_liquido), meta_mes: num(K.metas_periodo?.faturamento), meta_fonte: K.metas_periodo?.fonte?.faturamento || null },
    vendas: { erro: er(vd), realizado_mes: num(VM.realizado_mes), meta_mes: num(VM.meta_mensal), pct_mes: num(VM.pct_mes), realizado_ano: num(VM.realizado_ano), meta_ano: num(VM.meta_anual), pct_ano: num(VM.pct_ano), meta_fonte: VM.meta_fonte || null },
    receber: { total: num(P.contasReceber?.total), vencido: num(P.contasReceber?.vencido), em_30d: num(P.contasReceber?.a_vencer_30d) }, pagar: { total: num(P.contasPagar?.total), vencido: num(P.contasPagar?.vencido) } } };
}
async function dados(forcar) {
  const c = await kv('tv:dados');
  if (!forcar && c && Date.now() - Date.parse(c.gerado_em) < CACHE_MS) return c;
  try { const d = await montarDados(); await kv('tv:dados', d); return d; }
  catch (e) { if (c) return { ...c, aviso_cache: 'mostrando os últimos números salvos' }; throw e; }
}

function pagina(cfg, cod) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Atlantyx · Gestão à vista</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%;background:#070B18;color:#EAF0FF;font-family:Montserrat,Calibri,Arial,sans-serif;overflow:hidden;cursor:none}
#app{position:fixed;inset:0;display:flex;flex-direction:column;padding:2.2vh 2.6vw}
.top{display:flex;align-items:center;gap:1.4vw;height:7vh}.logo{font-weight:800;letter-spacing:.35vw;font-size:2.4vh;display:flex;align-items:center}.logo img{height:4.4vh;width:auto;display:block}.logo b{color:#00C4CC}
.tit{font-size:2.8vh;font-weight:700}.esp{flex:1}.rel{font-size:4.2vh;font-weight:700;font-variant-numeric:tabular-nums}.dt{font-size:1.8vh;color:#8E9BC0;text-align:right}
.palco{flex:1;position:relative;margin-top:1.4vh}.slide{position:absolute;inset:0;display:none;flex-direction:column;gap:1.8vh}.slide.on{display:flex;animation:ent .6s ease}
@keyframes ent{from{opacity:0;transform:translateY(1.2vh)}to{opacity:1;transform:none}}
.grade{display:grid;gap:1.6vh 1.2vw}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.k{background:#0F1630;border:1px solid #1E2A52;border-radius:1.6vh;padding:2vh 1.4vw;min-width:0}.k .l{font-size:1.9vh;color:#8E9BC0;font-weight:600;text-transform:uppercase;letter-spacing:.08vw}
.k .v{font-size:5.4vh;font-weight:800;margin-top:.6vh;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.k .s{font-size:1.9vh;color:#AAB6D8;margin-top:.5vh}
.k.big .v{font-size:7vh}.ok{color:#2EE6A6}.at{color:#FFB547}.cr{color:#FF5C7A}.az{color:#00C4CC}
.bar{height:1.3vh;background:#1E2A52;border-radius:1vh;margin-top:1.2vh;position:relative;overflow:hidden}.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:1vh;background:#00C4CC}.bar u{position:absolute;top:-.4vh;bottom:-.4vh;width:.25vw;background:#EAF0FF;opacity:.8}
.painel{background:#0F1630;border:1px solid #1E2A52;border-radius:1.6vh;padding:1.8vh 1.4vw;min-height:0;display:flex;flex-direction:column}.painel h3{font-size:2vh;color:#8E9BC0;text-transform:uppercase;letter-spacing:.08vw;font-weight:600;margin-bottom:1vh}
.baixo{flex:1;display:grid;grid-template-columns:1.7fr 1fr;gap:1.2vw;min-height:0}
.lin{display:flex;align-items:center;gap:1vw;font-size:2.3vh;padding:.8vh 0;border-bottom:1px solid #1A2447}.lin:last-child{border:0}.lin .n{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lin .q{font-weight:700;font-variant-numeric:tabular-nums}
.bola{width:1.8vh;height:1.8vh;border-radius:50%;flex-shrink:0}
.luz{display:flex;flex-direction:column;gap:.7vh;background:#070B18;border:1px solid #1E2A52;border-radius:2vh;padding:.9vh .6vw}.luz span{width:3.6vh;height:3.6vh;border-radius:50%;display:block}
.q{gap:1.4vh}.qn{display:grid;grid-template-columns:1fr 1fr;gap:1vw}.qn .v{font-size:8vh;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.05}.qn .s{font-size:1.9vh;color:#AAB6D8}
.pe{height:4vh;display:flex;align-items:center;gap:1vw;font-size:1.6vh;color:#6E7BA0}.dots{display:flex;gap:.6vw}.dots span{width:1.2vh;height:1.2vh;border-radius:50%;background:#26335F}.dots span.on{background:#00C4CC}
.prog{position:fixed;left:0;bottom:0;height:.45vh;background:#00C4CC;width:0}
.erro{font-size:1.8vh;color:#FFB547}
svg text{font-family:Montserrat,Calibri,Arial,sans-serif}
</style></head><body><div id="app">
<div class="top"><div class="logo"><img src="/logo-atlantyx-branco.png" alt="Atlantyx" onerror="this.parentNode.innerHTML='ATLANT<b>Y</b>X'"></div><div class="tit" id="tit">Gestão à vista</div><div class="esp"></div><div><div class="rel" id="rel">--:--</div><div class="dt" id="dt"></div></div></div>
<div class="palco" id="palco"><div class="slide on"><div style="margin:auto;font-size:3vh;color:#8E9BC0;">Carregando os números…</div></div></div>
<div class="pe"><div class="dots" id="dots"></div><div class="esp"></div><div id="atu"></div></div></div><div class="prog" id="prog"></div>
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
  var W=1000,H=330,pl=70,pb=40,pt=20,mx=1;m.forEach(function(x){mx=Math.max(mx,x.faturamento||0,Math.abs(x.lucro||0))});
  var bw=(W-pl-10)/12,y=function(v){return pt+(H-pt-pb)*(1-v/mx)},y0=y(0),s='';
  for(var g=0;g<=4;g++){var v=mx*g/4,yy=y(v);s+='<line x1="'+pl+'" x2="'+W+'" y1="'+yy+'" y2="'+yy+'" stroke="#1E2A52"/><text x="'+(pl-10)+'" y="'+(yy+6)+'" text-anchor="end" font-size="17" fill="#6E7BA0">'+brl(v).replace('R$ ','')+'</text>'}
  m.forEach(function(x,i){var mi=parseInt(String(x.mes).substring(5,7),10)-1,cx=pl+i*bw;var f=x.faturamento||0,l=x.lucro||0;
    s+='<rect x="'+(cx+bw*.14)+'" y="'+y(f)+'" width="'+(bw*.4)+'" height="'+Math.max(0,y0-y(f))+'" rx="4" fill="#00C4CC"/>';
    s+='<rect x="'+(cx+bw*.56)+'" y="'+(l>=0?y(l):y0)+'" width="'+(bw*.3)+'" height="'+Math.abs(y0-y(Math.abs(l)))+'" rx="4" fill="'+(l>=0?'#2EE6A6':'#FF5C7A')+'"/>';
    s+='<text x="'+(cx+bw/2)+'" y="'+(H-12)+'" text-anchor="middle" font-size="18" fill="#8E9BC0">'+(MES[mi]||x.mes)+'</text>'});
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;flex:1;min-height:0" preserveAspectRatio="none">'+s+'</svg><div style="font-size:1.7vh;color:#8E9BC0;margin-top:.6vh;"><span style="color:#00C4CC">■</span> faturamento &nbsp; <span style="color:#2EE6A6">■</span> lucro líquido (vermelho = prejuízo)</div>'}
function sFin(){var F=D.fin||{},M=F.mes||{},A=F.ano||{};
  var pm=(!nz(M.faturamento)&&M.meta_faturamento)?M.faturamento/M.meta_faturamento*100:null,mc=nz(M.margem_pct)?'':(M.semaforo==='verde'?'ok':M.semaforo==='amarelo'?'at':M.semaforo==='vermelho'?'cr':'');
  var h='<div class="grade g4">'+k('Faturamento do mês',brl(M.faturamento),M.meta_faturamento?'meta '+brl(M.meta_faturamento)+' · '+pct(pm):(M.ultimo_fechado?'mês anterior: '+brl(M.ultimo_fechado.faturamento):''),'big',M.meta_faturamento?barra(pm,nz(M.fracao_decorrida)?null:M.fracao_decorrida*100):'')
   +k('Lucro do mês','<span class="'+mc+'">'+brl(M.lucro)+'</span>','margem '+pct(M.margem_pct)+(nz(M.meta_margem_pct)?'':' · meta '+pct(M.meta_margem_pct)),'big')
   +k('Faturamento no ano',brl(A.faturamento),'lucro '+brl(A.lucro)+' · margem '+pct(A.margem_pct),'big')
   +k('Caixa hoje',brl(F.caixa),'saldo bancário (extrato do QuickBooks)','big')+'</div>'
   +'<div class="baixo"><div class="painel"><h3>Evolução no ano</h3>'+grafico(F.mensal)+'</div><div class="grade" style="grid-template-rows:repeat(3,1fr);">'
   +k('A receber',brl(F.receber),(nz(F.receber_30d)?'':'próximos 30 dias: '+brl(F.receber_30d)))
   +k('Recebíveis vencidos','<span class="'+(F.receber_vencido>0?'cr':'ok')+'">'+brl(F.receber_vencido)+'</span>',F.receber_vencido>0?'cobrar esta semana':'nada vencido')
   +k('A pagar',brl(F.pagar),'contas em aberto no QuickBooks')+'</div></div>'+(F.erro?'<div class="erro">⚠ '+esc(F.erro)+'</div>':'');
  return h}
function sCom(){var C=D.com||{},P=C.propostas||{},Fu=C.funil||{},S=C.semaforo||[];
  var mmc=nz(C.meta_mes_pct)?'':C.meta_mes_pct>=100?'ok':C.meta_mes_pct>=70?'at':'cr';
  var h='<div class="grade g4">'+k('Meta do mês · faturado','<span class="'+mmc+'">'+pct(C.meta_mes_pct)+'</span>',(nz(C.realizado_mes)?'':brl(C.realizado_mes)+' de '+brl(C.meta_mes))+(nz(C.gap_mes)?'':' · falta '+brl(C.gap_mes))+(nz(C.dias_uteis_mes)?'':' · '+C.dias_uteis_mes+' dias úteis'),'big',barra(C.meta_mes_pct))
   +k('Meta do ano · faturado',pct(C.meta_ano_pct),(nz(C.realizado_ano)?'':brl(C.realizado_ano)+' de '+brl(C.meta_ano))+(nz(C.gap_ano)?'':' · falta '+brl(C.gap_ano)),'big',barra(C.meta_ano_pct))
   +k('Propostas em aberto',(nz(P.abertas)?'—':P.abertas)+' <span style="font-size:3.4vh;color:#AAB6D8">· '+brl(P.valor_aberto)+'</span>',(P.paradas?'<span class="at">'+P.paradas+' parada(s)</span> · ':'')+(nz(P.ganhas)?'':P.ganhas+' ganhas · '+P.perdidas+' perdidas'),'big')
   +k('Win rate',pct(C.win_rate_pct),'ciclo médio '+(nz(C.ciclo_dias)?'—':C.ciclo_dias+' dias')+(C.cobertura!=null?' · cobertura '+esc(C.cobertura):''),'big')+'</div>'
   +'<div class="baixo"><div class="painel"><h3>Funil — últimos 30 dias</h3><div style="display:flex;gap:2vw;align-items:flex-end;margin-bottom:1.6vh;"><div><div style="font-size:7vh;font-weight:800">'+(nz(Fu.leads)?'—':Fu.leads)+'</div><div class="s" style="font-size:2vh;color:#8E9BC0">leads</div></div><div style="font-size:5vh;color:#26335F;padding-bottom:2vh">→</div><div><div style="font-size:7vh;font-weight:800;color:#00C4CC">'+(nz(Fu.reunioes)?'—':Fu.reunioes)+'</div><div style="font-size:2vh;color:#8E9BC0">reuniões marcadas</div></div><div style="font-size:3vh;color:#AAB6D8;padding-bottom:2vh">'+(Fu.leads?pct(Fu.reunioes/Fu.leads*100)+' de conversão':'')+'</div></div>'
   +((Fu.campanhas||[]).map(function(c){return '<div class="lin"><div class="n">'+esc(c.nome)+'</div><div class="q">'+c.leads+' → '+c.reunioes+'</div></div>'}).join('')||'<div class="erro">Sem leads no período.</div>')+'</div>'
   +'<div class="painel"><h3>Ritmo do time comercial</h3>'+(S.map(function(c){return '<div class="lin"><span class="bola" style="background:'+cor(c.farol)+'"></span><div class="n">'+esc(c.nome)+'</div><div class="q" style="font-size:1.9vh;color:#AAB6D8">'+(nz(c.contatos_pct)?'':'contatos '+pct(c.contatos_pct))+(nz(c.reunioes_pct)?'':' · reuniões '+pct(c.reunioes_pct))+'</div></div>'}).join('')||'<div class="erro">Configure a política comercial em S1.</div>')+'</div></div>'
   +(C.erro||C.aviso?'<div class="erro">⚠ '+esc(C.erro||C.aviso)+'</div>':'');
  return h}
function sQual(){var Q=D.qual||{},T=Q.termos||{},B=Q.qb||{},P=Q.projetos||{};
  function luz(f){return '<div class="luz">'+['vermelho','amarelo','verde'].map(function(c){return '<span style="background:'+(f===c?cor(c):'#1A2447')+';'+(f===c?'box-shadow:0 0 2.4vh '+cor(c):'')+'"></span>'}).join('')+'</div>'}
  function n(v){return v==null||v===''?'—':v}
  function card(t,f,a,al,b,bl,lst,er){return '<div class="painel q"><div style="display:flex;align-items:center;gap:1.4vw"><h3 style="flex:1;margin:0">'+t+'</h3>'+luz(f)+'</div>'
    +'<div class="qn"><div><div class="v ok">'+n(a)+'</div><div class="s">'+al+'</div></div><div><div class="v '+(b>0?(f==='vermelho'?'cr':'at'):'ok')+'">'+n(b)+'</div><div class="s">'+bl+'</div></div></div>'
    +'<div style="flex:1;min-height:0;overflow:hidden">'+lst+'</div>'+(er?'<div class="erro">⚠ '+esc(er)+'</div>':'')+'</div>'}
  function li(c,txt,q){return '<div class="lin"><span class="bola" style="background:'+c+'"></span><div class="n">'+esc(txt)+'</div><div class="q">'+q+'</div></div>'}
  return '<div class="grade g3" style="flex:1;min-height:0">'
   +card('Termos de faturamento',T.farol,T.corretos,'termos corretos',T.errados,'termos com erro',(T.motivos||[]).map(function(m){return li(cor(T.farol),m.motivo,m.qtd)}).join('')||(T.errados===0?'<div class="s ok" style="font-size:2.2vh;margin-top:1vh">Todos os '+n(T.abertos)+' termos em aberto estão corretos.</div>':''),T.erro)
   +card('Dados no QuickBooks',B.farol,B.corretas==null?null:B.corretas+'/'+B.checagens,'verificações corretas',B.registros_errados,'registros com erro',(B.problemas||[]).map(function(p){return li(cor(p.gravidade==='alta'?'vermelho':'amarelo'),p.titulo,p.qtd)}).join('')||(B.com_erro===0?'<div class="s ok" style="font-size:2.2vh;margin-top:1vh">Conciliação, categorias, duplicidades e contas pagas: tudo certo.</div>':''),B.erro)
   +card('Projetos',P.farol,P.em_dia,'em dia',nz(P.atrasados)?null:P.atrasados,'atrasados',(nz(P.total)?'':li(cor('vermelho'),'Atrasados (farol vermelho)',P.atrasados)+li(cor('amarelo'),'Em atenção (farol amarelo)',P.atencao)+(P.rotulos?li(cor('vermelho'),P.rotulos[0],P.com_bloqueio)+li('#6E7BA0',P.rotulos[1],P.desatualizados)+li('#6E7BA0',P.rotulos[2],P.sem_report):li('#6E7BA0','Sem status report',P.sem_report)+li('#6E7BA0','Com bloqueio',P.com_bloqueio)+li('#6E7BA0','Report desatualizado na semana',P.desatualizados))+(P.fonte?'<div style="font-size:1.5vh;color:#6E7BA0;margin-top:.8vh">fonte: '+esc(P.fonte)+'</div>':'')),P.erro)
   +'</div>'}
function sProj(){var J=D.proj||{},R=J.resumo||{},L=J.lista||[];
  var dt=function(s){return s?s.split('-').reverse().join('/'):'—'};
  var av=nz(R.avanco_medio)?'—':R.avanco_medio+'%';
  var h='<div class="grade" style="grid-template-columns:repeat(5,1fr)">'+k('Projetos ativos',nz(R.total)?'—':R.total,J.fonte||'','big')
   +k('Em dia','<span class="ok">'+(nz(R.verde)?'—':R.verde)+'</span>','farol verde','big')
   +k('Atenção','<span class="at">'+(nz(R.amarelo)?'—':R.amarelo)+'</span>','farol amarelo','big')
   +k('Atrasados','<span class="cr">'+(nz(R.vermelho)?'—':R.vermelho)+'</span>',(R.vencidos?(R.vencidos===1?'1 passou':R.vencidos+' passaram')+' da data de conclusão':'nenhum vencido'),'big')
   +k('Avanço médio',av,(nz(R.planejado_medio)?'':'planejado '+R.planejado_medio+'%')+(R.concluem_mes?' · '+R.concluem_mes+' concluem no mês':''),'big',nz(R.avanco_medio)?'':barra(R.avanco_medio,nz(R.planejado_medio)?null:R.planejado_medio))+'</div>';
  var max=11, mostra=L.slice(0,max);
  h+='<div class="painel" style="flex:1;min-height:0"><h3>Projetos · data de conclusão e farol</h3>'
   +'<div class="lin" style="font-size:1.6vh;color:#6E7BA0;border-bottom:1px solid #26335F"><span class="bola" style="background:transparent"></span><div class="n">PROJETO</div><div style="width:13vw">GERENTE</div><div style="width:9vw;text-align:right">CONCLUSÃO</div><div style="width:14vw;text-align:center">AVANÇO (REAL × PLAN.)</div><div style="width:8vw;text-align:right">DESVIO</div></div>'
   +(mostra.map(function(p){var cor2=cor(p.farol);var d=nz(p.desvio)?'—':(p.desvio>0?'+':'')+p.desvio+'pp';
     return '<div class="lin"><span class="bola" style="width:2.4vh;height:2.4vh;background:'+cor2+';box-shadow:0 0 1.2vh '+cor2+'"></span><div class="n">'+esc(p.nome)+(p.motivo&&(p.farol!=='verde'||/status report/.test(p.motivo))?' <span style="font-size:1.6vh;color:#8E9BC0;font-weight:500">· '+esc(p.motivo)+'</span>':'')+'</div>'
      +'<div style="width:13vw;font-size:1.9vh;color:#AAB6D8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.gerente||'')+'</div>'
      +'<div style="width:9vw;text-align:right" class="q '+(p.dias_atraso>0?'cr':'')+'">'+dt(p.conclusao)+(p.dias_atraso>0?'<div style="font-size:1.5vh">'+p.dias_atraso+' dias atrás</div>':'')+'</div>'
      +'<div style="width:14vw;padding:0 1vw">'+(nz(p.pct)?'<div style="text-align:center;color:#6E7BA0">—</div>':'<div style="display:flex;justify-content:space-between;font-size:1.7vh"><b>'+p.pct+'%</b><span style="color:#8E9BC0">'+(nz(p.planejado)?'':p.planejado+'%')+'</span></div>'+barra(p.pct,nz(p.planejado)?null:p.planejado))+'</div>'
      +'<div style="width:8vw;text-align:right" class="q '+(nz(p.desvio)?'':p.desvio<-10?'cr':p.desvio<-5?'at':'ok')+'">'+d+'</div></div>'}).join('')||'<div class="erro">'+esc(J.erro||'Sem projetos ativos no módulo de projetos.')+'</div>')
   +(L.length>max?'<div style="font-size:1.7vh;color:#8E9BC0;margin-top:.6vh">+ '+(L.length-max)+' projeto(s) — os mais críticos aparecem primeiro</div>':'')+'</div>';
  return h}
var TIT={financeiro:'Financeiro',comercial:'Comercial',qualidade:'Qualidade',projetos:'Projetos'},REN={financeiro:sFin,comercial:sCom,qualidade:sQual,projetos:sProj};
function render(){var p=$('palco');p.innerHTML=SLIDES.map(function(s,i){return '<div class="slide'+(i===idx?' on':'')+'">'+REN[s]()+'</div>'}).join('');
  $('dots').innerHTML=SLIDES.map(function(s,i){return '<span class="'+(i===idx?'on':'')+'"></span>'}).join('');$('tit').textContent='Gestão à vista · '+TIT[SLIDES[idx]];
  var g=new Date(D.gerado_em);$('atu').textContent='números de '+g.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+(D.aviso_cache?' · '+D.aviso_cache:'')+' · atualiza a cada 10 min'}
function ir(n){if(!D||!SLIDES.length)return;idx=(n+SLIDES.length)%SLIDES.length;var sl=document.querySelectorAll('.slide');for(var i=0;i<sl.length;i++)sl[i].className='slide'+(i===idx?' on':'');
  var d=document.querySelectorAll('#dots span');for(var j=0;j<d.length;j++)d[j].className=j===idx?'on':'';$('tit').textContent='Gestão à vista · '+TIT[SLIDES[idx]];t0=Date.now()}
function carregar(){var x=new XMLHttpRequest();x.open('GET','/api/tv?t='+encodeURIComponent(COD)+'&dados=1&_='+Date.now());x.onload=function(){try{var r=JSON.parse(x.responseText);if(!r.success)throw new Error(r.error||'erro');D=r.dados;render()}catch(e){if(!D)$('palco').innerHTML='<div class="slide on"><div style="margin:auto;font-size:2.6vh;color:#FFB547;text-align:center;">'+esc(e.message||'Sem conexão')+'<br><span style="font-size:2vh;color:#8E9BC0">nova tentativa em 1 minuto</span></div></div>';setTimeout(carregar,60000)}};x.onerror=function(){setTimeout(carregar,60000)};x.send()}
function relogio(){var a=new Date();$('rel').textContent=a.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});$('dt').textContent=a.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',timeZone:'America/Sao_Paulo'});
  if(D&&SLIDES.length>1){var f=(Date.now()-t0)/(ROT*1000);$('prog').style.width=Math.min(100,f*100)+'%';if(f>=1)ir(idx+1)}}
document.addEventListener('keydown',function(e){if(e.keyCode===39||e.keyCode===40)ir(idx+1);if(e.keyCode===37||e.keyCode===38)ir(idx-1);if(e.keyCode===13&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen()});
document.addEventListener('click',function(){if(document.documentElement.requestFullscreen&&!document.fullscreenElement)document.documentElement.requestFullscreen()});
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
      salvar: async () => { const c = await config(); const n = { ...c, v152: true, v156: true, nomes_projetos: b.nomes_projetos === undefined ? c.nomes_projetos : !!b.nomes_projetos, rotacao_s: Math.max(8, Math.min(180, parseInt(b.rotacao_s) || c.rotacao_s)), slides: (b.slides || c.slides).filter(s => SLIDES_OK.includes(s)) };
        if (!n.slides.length) throw new Error('Escolha pelo menos um slide'); await kv('tv:config', n); return { config: { ...n, link: n.codigo ? base() + '/tv/' + n.codigo : null } }; },
      atualizar_dados: async () => ({ dados: await dados(true) }),
      conferir: () => conferir(),
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) { console.error('[tv]', e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'tv');
export { dados as dadosGestao, qualidade as _qualidade };
