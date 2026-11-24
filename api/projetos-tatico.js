// api/projetos-tatico.js — Jornada de Alta Performance em Projetos (Tático) · Fase A: Visão do Portfólio.
// Fonte dos projetos, marcos, horas e alocação: banco do MAESTRO (mesma leitura de api/pmo.js · maestroPainel/maestroStore, só leitura).
// Sem tabela nova: regras e registros do Tático ficam em kv_store (proj:regras, proj:problemas, proj:acoes, proj:log).
// Falha de uma fonte não derruba a tela: o campo fica cinza (null) com a causa em `lacunas` e em `fontes`.
// Ações: portfolio ({forcar})
import { comGuarda } from '../lib/qa-guard.js';
import { calcularFarol, divergencia, alertasCarga, reaisEmRisco, resumoPortfolio, diasCorridos, REGRAS_PADRAO } from '../lib/projetos-calc.js';

const CACHE_MS = 5 * 60000; // 5 min (pedido: 5 a 10)
let _cache = null, _sql = null;
async function getSql() { if (_sql) return _sql; const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); await _sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`; return _sql; }
async function kv(k) {
  const sql = await getSql(); const r = (await sql`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null;
  try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; }
}
const hojeBR = () => new Date(Date.now() - 3 * 3600000).toISOString().substring(0, 10);
const iso = v => { const s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const num = v => (v == null || v === '' || isNaN(+v)) ? null : +v;
const feito = m => /conclu|entreg|finaliz|aprovad|pago|faturad|encerr|cancel/i.test(String(m?.status || '')) || parseInt(m?.pct || 0) >= 100 || !!m?.aceite; // mesma regra do Maestro (+ aceite)
// "perfil gestor": admin (CEO) ou perfil com gestor/diretor no nome. Só ele vê nome de pessoa e margem.
const ehGestor = req => !!(req.sessao?.admin || req.atxCred === 'processo' || /gestor|diretor|ceo/i.test(String(req.sessao?.perfil || req.sessao?.perfil_id || '')));

async function lerFontes() {
  const fontes = {}, D = { painel: null, S: {}, regras: { ...REGRAS_PADRAO }, problemas: [], acoes: [] };
  try { const pmo = await import('./pmo.js'); D.painel = await pmo.maestroPainel(); fontes.maestro_painel = { ok: true }; } catch (e) { fontes.maestro_painel = { ok: false, erro: String(e.message || e).slice(0, 160) }; }
  try { const pmo = await import('./pmo.js'); D.S = await pmo.maestroStore(['atlx_projetos_cad', 'atlx_proj_marcos', 'atlx_apontamentos']); fontes.maestro_dados = { ok: true }; } catch (e) { fontes.maestro_dados = { ok: false, erro: String(e.message || e).slice(0, 160) }; }
  try { D.regras = { ...REGRAS_PADRAO, ...((await kv('proj:regras')) || {}) }; fontes.regras = { ok: true }; } catch (e) { fontes.regras = { ok: false, erro: 'usando regras padrão: ' + String(e.message || e).slice(0, 100) }; }
  try { const p = await kv('proj:problemas'), a = await kv('proj:acoes'); D.problemas = Array.isArray(p) ? p : []; D.acoes = Array.isArray(a) ? a : []; fontes.problemas_acoes = { ok: true }; } catch (e) { fontes.problemas_acoes = { ok: false, erro: String(e.message || e).slice(0, 160) }; }
  return { D, fontes };
}

async function montar() {
  const hoje = hojeBR(), { D, fontes } = await lerFontes(), R = D.regras;
  const cad = Array.isArray(D.S.atlx_projetos_cad) ? D.S.atlx_projetos_cad : [], marcosAll = Array.isArray(D.S.atlx_proj_marcos?.marcos) ? D.S.atlx_proj_marcos.marcos : [];
  const apt = Array.isArray(D.S.atlx_apontamentos) ? D.S.atlx_apontamentos : [];
  const projetos = (D.painel?.projetos || []).filter(p => p.ativo);
  const limite30 = new Date(Date.parse(hoje + 'T12:00:00Z') - 30 * 864e5).toISOString().substring(0, 10);
  // alocação: pessoas que apontaram horas nos últimos 30 dias, por projeto ativo
  const nomesAtivos = new Set(projetos.map(p => p.nome)), porProj = {}, porPessoa = {};
  apt.forEach(a => { const proj = a.projeto || a.Projeto, pessoa = String(a.analista || a.Analista || a.pessoa || a.colaborador || '').trim(), d = iso(a.data || a.Data);
    if (!proj || !pessoa || !d || d < limite30 || !nomesAtivos.has(proj)) return; (porProj[proj] = porProj[proj] || new Set()).add(pessoa); (porPessoa[pessoa] = porPessoa[pessoa] || []).push(proj); });
  const linhas = projetos.map(p => {
    const lac = {}, c = cad.find(x => x.nome === p.nome) || {};
    const ms = marcosAll.filter(m => m.proj === p.nome).map(m => ({ nome: m.nome, fim: iso(m.fim), valor: num(m.valor), feito: feito(m) })).sort((a, b) => String(a.fim).localeCompare(String(b.fim)));
    if (!fontes.maestro_dados.ok) lac.marcos = lac.horas = lac.pessoas = lac.reais_risco = fontes.maestro_dados.erro;
    const vencidos = ms.filter(m => !m.feito && m.fim && m.fim < hoje), proximo = ms.find(m => !m.feito && m.fim && m.fim >= hoje) || null;
    const previsao = p.previsao_fim || p.conclusao || null, prometida = p.conclusao || null;
    const fc = calcularFarol({ pct_real: p.pct, pct_plan: p.planejado, prometida, previsao, dias_sem_status: p.sr_dias, hoje,
      marco_vencido_sem_aceite: vencidos.length && fontes.maestro_dados.ok ? vencidos.slice(0, 2).map(m => m.nome).join('; ') : false }, R);
    const atrasoCorr = prometida && previsao ? diasCorridos(prometida, previsao) : null;
    const hr = fontes.maestro_dados.ok ? apt.filter(a => (a.projeto || a.Projeto) === p.nome).reduce((s, a) => s + (parseFloat(a.horas ?? a.Horas) || 0), 0) : null;
    const risco = fontes.maestro_dados.ok ? reaisEmRisco(ms, fc.cor, hoje) : { total: null, marcos: [] };
    const abertos = D.problemas.filter(x => x.projeto === p.nome && !['resolvido', 'aceito'].includes(x.status)), vencAc = D.acoes.filter(x => x.projeto === p.nome && !['feita', 'cancelada'].includes(x.status) && iso(x.prazo) && iso(x.prazo) < hoje);
    return { projeto: p.nome, cliente: p.cliente || '', gerente: p.gerente || '', tipo: c.tipo || c.categoria || '', prometida, previsao,
      dias_atraso: Math.max(p.dias_atraso || 0, atrasoCorr > 0 ? atrasoCorr : 0), pct_real: p.pct, pct_plan: p.planejado,
      farol_informado: p.farol_sr || null, farol_calculado: fc, divergencia: divergencia(p.farol_sr, fc.cor), sr_dias: p.sr_dias, sr_data: p.sr_data,
      horas_previstas: num(c.horas), horas_realizadas: hr == null ? null : Math.round(hr * 100) / 100, proximo_marco: proximo ? { nome: proximo.nome, fim: proximo.fim } : null,
      reais_risco: risco.total, marcos_risco: risco.marcos.slice(0, 5), problemas_abertos: abertos.length, problemas_criticos: abertos.filter(x => x.urgencia === 'crítica' || x.urgencia === 'critica').length,
      acoes_vencidas: vencAc.length, pessoas_alocadas: fontes.maestro_dados.ok ? (porProj[p.nome]?.size || 0) : null, _pessoas: [...(porProj[p.nome] || [])], lacunas: lac, ativo: true };
  });
  const alertas = alertasCarga(linhas, porPessoa, R);
  return { gerado_em: new Date().toISOString(), hoje, fonte: 'Maestro (banco de projetos)', fontes, regras: R, resumo: resumoPortfolio(linhas), linhas, alertas, _alocacao: porPessoa };
}

// o que vai para a tela: só o gestor vê nomes de pessoas; os demais veem contagens (sem ranking de pessoas em nenhum caso)
function paraTela(P, gestor) {
  const L = P.linhas.map(l => { const { _pessoas, ...r } = l; return gestor ? { ...r, pessoas: _pessoas } : r; });
  const al = { gerentes: P.alertas.gerentes, pessoas: gestor ? P.alertas.pessoas.map(x => ({ pessoa: x.pessoa, frentes: x.frentes, limite: x.limite, projetos: x.projetos })) : [], pessoas_total: P.alertas.pessoas.length };
  return { gerado_em: P.gerado_em, hoje: P.hoje, fonte: P.fonte, fontes: P.fontes, regras: P.regras, resumo: P.resumo, linhas: L, alertas: al, gestor };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });
  let body = {}; try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch { return res.status(400).json({ success: false, error: 'JSON inválido' }); }
  const { action, params = {} } = body;
  const acoes = {
    portfolio: async () => {
      if (params.forcar || !_cache || Date.now() - _cache.em > CACHE_MS) _cache = { em: Date.now(), v: await montar() };
      return { portfolio: paraTela(_cache.v, ehGestor(req)), cache_seg: Math.round((Date.now() - _cache.em) / 1000) };
    },
  };
  try {
    if (!acoes[action]) return res.status(400).json({ success: false, error: 'ação desconhecida: ' + action });
    return res.status(200).json({ success: true, ...(await acoes[action]()) });
  } catch (e) { return res.status(e.status || 500).json({ success: false, error: String(e.message || e).slice(0, 300), dica: e.dica }); }
}
export default comGuarda(handler, 'projetos-tatico');
export { montar as _montar, paraTela as _paraTela };
