// lib/playbook-svc.js — v3.600 · serviço do Playbook: banco, plano vigente, aprendizado por lead e ações da tela
// Quem usa: api/s1-intel.js (ações playbook_*) e api/metricool.js (ciclo diário de marketing). A lógica pura está em lib/playbook.js.
import * as PB from './playbook.js';
import { K_VIGENTE, planoResumoTexto } from './plano-estrategico.js';
import { classificarCargo } from './icp.js';

let _sql = null;
async function db() { if (!process.env.DATABASE_URL) return null; if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); } return _sql; }
const erro = (m, status = 400) => Object.assign(new Error(m), { status });
// kv em cima do kv_store (sem DDL). Em testes, globalThis.__PB_KV substitui o banco.
export function kvPadrao() {
  if (globalThis.__PB_KV) return globalThis.__PB_KV;
  return {
    async get(k) { const s = await db(); if (!s) return null; const r = (await s`SELECT value FROM kv_store WHERE key = ${k} LIMIT 1`)[0]; if (!r) return null; return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; },
    async set(k, v) { const s = await db(); if (!s) throw erro('Banco indisponível', 503); await s`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; },
  };
}
export async function lerVigente(kv = kvPadrao()) { try { const v = await kv.get(K_VIGENTE); return v && v.plano ? v : null; } catch (_) { return null; } }

// leads que chegaram por cada campanha (utm_campaign) nos últimos dias: { utm: { leads, decisores } }
export async function leadsPorUtm(dias = 120) {
  if (globalThis.__PB_LEADS) return globalThis.__PB_LEADS;
  const s = await db(); if (!s) return {}; let rows = [];
  try { rows = await s`SELECT COALESCE(data->'utm'->>'campaign', data->>'campanha') AS u, cargo FROM leads WHERE criado_em >= NOW() - (${dias} || ' days')::interval AND COALESCE(data->>'status', '') <> 'qa_teste'`; } catch (_) { try { rows = await s`SELECT COALESCE(data->'utm'->>'campaign', data->>'campanha') AS u, cargo FROM leads WHERE criado_em >= NOW() - (${dias} || ' days')::interval`; } catch (_2) { return {}; } }
  const m = {}; for (const r of rows) { if (!r.u) continue; const x = m[r.u] = m[r.u] || { leads: 0, decisores: 0 }; x.leads++; if (classificarCargo(r.cargo) === 'decisor') x.decisores++; }
  return m;
}

// Tudo que o ciclo de marketing (e a tela) precisam de uma vez: Playbook sincronizado, aprendizado aplicado e ângulos da rodada
export async function contextoPlaybook({ chave, n = 3, kv = kvPadrao(), salvarAjustes = true } = {}) {
  const vig = await lerVigente(kv), { pb: pb0, defasado, motivos, criou } = await PB.playbookVigente(kv, vig);
  const H = await PB.lerHistorico(kv), L = await leadsPorUtm(pb0.config.janela_dias + 30);
  const desemp = PB.desempenhoCalcular(H, L, { janelaDias: pb0.config.janela_dias, minimo: pb0.config.min_campanhas });
  const { pb, mudancas } = PB.aplicarAjustes(pb0, desemp); if (mudancas.length && salvarAjustes) await kv.set(PB.K_PB, pb).catch(() => {});
  const corte = new Date(Date.now() - pb.config.repetir_apos_dias * 864e5).toISOString().slice(0, 10), recentes = H.filter(h => String(h.data || '') >= corte).map(h => h.vertical + '|' + h.angulo);
  const sels = n > 0 ? PB.escolherAngulos(pb, vig?.plano || null, desemp, { n, chave: chave || new Date().toISOString().slice(0, 10), recentes }) : [];
  return { vig, pb, defasado, motivos, criou, desemp, mudancas, sels, recentes, texto: PB.briefingPlaybook(pb, sels) };
}

const resumoDesemp = (pb, d) => !d || d.media === null ? 'Ainda há poucas campanhas para concluir algo (mínimo ' + (d?.minimo ?? 3) + ').' :
  `${d.campanhas} campanhas nos últimos ${pb.config.janela_dias} dias, média ${d.media} ponto(s) por campanha (lead = 0,5; lead decisor = 2).\n` + pb.verticais.map(v => { const x = d.verticais[v.id]; return x ? `- ${v.nome}: ${x.n} campanhas, ${x.leads} lead(s), ${x.decisores} decisor(es), peso ${x.mult}×${x.sem_retorno ? ' (sem retorno)' : ''}` : null; }).filter(Boolean).join('\n');

// Estado completo para a tela
export async function estado({ dias = 3, kv = kvPadrao() } = {}) {
  const c = await contextoPlaybook({ n: 0, kv, salvarAjustes: true }), pesos = PB.pesosVerticais(c.pb, c.vig?.plano || null, c.desemp), tot = pesos.reduce((s, p) => s + p.peso, 0) || 1;
  const proximos = []; for (let i = 0; i < dias; i++) { const d = new Date(Date.now() + (i + 1) * 864e5).toISOString().slice(0, 10); proximos.push({ data: d, escolhas: PB.escolherAngulos(c.pb, c.vig?.plano || null, c.desemp, { n: 3, chave: d, recentes: c.recentes }) }); }
  const versoes = ((await kv.get(PB.K_PB_VERSOES).catch(() => null)) || []).map(v => ({ versao: v.versao, em: v.em, por: v.por, resumo: v.resumo })).reverse();
  return { playbook: c.pb, situacao: { defasado: c.defasado, motivos: c.motivos, plano_nome: c.vig ? c.pb.plano_ref?.nome : null, plano_versao: c.vig?.versao ?? null, plano_aprovado_em: c.vig?.aprovado_em ?? null, sem_plano: !c.vig },
    pesos: pesos.map(p => ({ ...p, pct: Math.round(p.peso / tot * 1000) / 10 })), desempenho: c.desemp, proximos, versoes, historico: (await PB.lerHistorico(kv)).slice(-30).reverse(), angulos: PB.ANGULOS };
}

export async function gerar({ orientacao = '' } = {}, login, claude, kv = kvPadrao()) {
  if (typeof claude !== 'function') throw erro('IA indisponível', 503);
  const c = await contextoPlaybook({ n: 0, kv, salvarAjustes: false }), vig = c.vig;
  const [prem, amplo, moat] = await Promise.all([kv.get('est:premissas').catch(() => null), kv.get('est:contexto_amplo').catch(() => null), kv.get('est:moat').catch(() => null)]);
  const contexto = [prem?.texto ? 'PREMISSAS: ' + prem.texto : '', moat?.tese || moat?.resumo ? 'TESE DE MOAT: ' + String(moat.tese || moat.resumo).slice(0, 1500) : '', amplo ? 'CONTEXTO: ' + JSON.stringify(amplo).slice(0, 5000) : ''].filter(Boolean).join('\n');
  const { pb, pendentes } = await PB.gerarPlaybook({ claude, vig, atual: c.pb, contexto, desempTexto: resumoDesemp(c.pb, c.desemp), orientacao: String(orientacao || '').slice(0, 800), planoTexto: vig ? planoResumoTexto(vig.plano, vig) : '' });
  await PB.salvarPlaybook(kv, pb, login, 'regenerado pela IA'); return { pb, pendentes };
}

// ajustes manuais do fundador (ou do dono de marketing)
export async function ajustar({ op, vertical, angulo, valor }, login, kv = kvPadrao()) {
  const pb = await PB.lerPlaybook(kv); if (!pb) throw erro('Playbook ainda não existe', 404); const v = pb.verticais.find(x => x.id === vertical), a = v?.angulos.find(x => x.id === angulo);
  const reg = t => { pb.log = [...(pb.log || []), { em: new Date().toISOString(), tipo: 'manual', texto: `${t} (por ${login || '—'})` }].slice(-60); };
  if (op === 'vertical_status') { if (!v || !['hipotese', 'validada', 'pausada'].includes(valor)) throw erro('Vertical ou status inválido'); v.status = valor; reg(`Vertical "${v.nome}" → ${valor}`); }
  else if (op === 'angulo_status') { if (!a || !['ativo', 'em_revisao', 'pausado'].includes(valor)) throw erro('Ângulo ou status inválido'); a.status = valor; reg(`Ângulo "${a.nome}" em "${v.nome}" → ${valor}`); }
  else if (op === 'vertical_peso') { const n = Number(valor); if (!v || !(n >= 0 && n <= 100)) throw erro('Peso inválido (0 a 100)'); v.peso = n; reg(`Peso-base da vertical "${v.nome}" → ${n}`); }
  else if (op === 'tese') { pb.tese = String(valor || '').slice(0, 900); if (pb.tese.length < 20) throw erro('Escreva a tese (pelo menos uma frase)'); reg('Tese editada'); }
  else if (op === 'exploracao') { const n = Number(valor); if (!(n >= 0 && n <= 1)) throw erro('Exploração entre 0 e 1'); pb.config.exploracao = n; reg(`Exploração → ${Math.round(n * 100)}%`); }
  else if (op === 'zerar_aprendizado') { await kv.set(PB.K_PB_HIST, []); reg('Aprendizado zerado: o histórico de campanhas foi apagado'); }
  else throw erro('Ajuste desconhecido');
  await PB.salvarPlaybook(kv, { ...pb, versao: pb.versao }, login, ''); return estado({ kv });
}
export async function restaurar({ versao }, login, kv = kvPadrao()) {
  const vs = (await kv.get(PB.K_PB_VERSOES).catch(() => null)) || [], alvo = vs.find(x => Number(x.versao) === Number(versao)); if (!alvo) throw erro('Versão não encontrada', 404);
  const atual = await PB.lerPlaybook(kv), novo = PB.playbookNormalizar({ ...alvo.playbook, versao: (atual?.versao || 0) + 1, log: [...(alvo.playbook.log || []), { em: new Date().toISOString(), tipo: 'manual', texto: `Voltou ao texto da versão ${alvo.versao} (por ${login || '—'})` }] });
  await PB.salvarPlaybook(kv, novo, login, `voltou à versão ${alvo.versao}`); return estado({ kv });
}
export const exportarMarkdown = async (kv = kvPadrao()) => { const pb = await PB.lerPlaybook(kv); if (!pb) throw erro('Playbook ainda não existe', 404); return PB.playbookMarkdown(pb); };
