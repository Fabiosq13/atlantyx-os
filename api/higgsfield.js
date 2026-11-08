import { comGuarda } from '../lib/qa-guard.js';
import { neon } from '@neondatabase/serverless';
// api/higgsfield.js — v3.413 · ESTÚDIO HIGGSFIELD (vídeo e imagem por IA para marketing, webinars e Atlantyx TV)
//
// API: https://api.higgsfield.ai/<caminho-do-modelo>  · Authorization: Key <HF_API_KEY_ID>:<HF_API_KEY_SECRET>
// O envio volta na hora com request_id + status_url; o resultado sai consultando status_url
// (queued → in_progress → completed | failed | nsfw | canceled). Imagem: images[].url · vídeo: video.url.
// Os arquivos da Higgsfield expiram (≥ 7 dias): a tela oferece "Guardar" (re-hospeda em /api/media-upload).
//
// Configuração (Vercel → Environment Variables): HF_API_KEY_ID e HF_API_KEY_SECRET (criados em console.higgsfield.ai).
// Segredo nunca volta para a tela nem vai para log. Modelos: o de imagem tem padrão; o de vídeo é o caminho copiado da
// página do modelo na Higgsfield (Kling, Seedance, DoP, Wan…) e fica salvo em kv hf:cfg.
// Regras da casa nos prompts: identidade Atlantyx; nada de pessoa real, cliente, depoimento ou logo de terceiros.

const BASE = 'https://api.higgsfield.ai';
const K_CFG = 'hf:cfg', K_JOBS = 'hf:jobs';
const PADRAO = { modelo_imagem: 'higgsfield-ai/soul/v2/standard', modelo_video: '', extras_video: { duration: 5 } };
const USOS = {
  webinar: 'Divulgação do webinar (LinkedIn e retargeting)', retargeting: 'Criativo de anúncio de retargeting', vinheta: 'Vinheta / abertura da Atlantyx TV',
  produto: 'Vídeo do produto (Maestro / Atlantyx OS)', corte: 'Corte de webinar para redes', post: 'Imagem de post orgânico',
};
let _sql = null; const getSql = () => (_sql = _sql || neon(process.env.DATABASE_URL));
async function kv(k, v) { const sql = getSql();
  if (v === undefined) { const r = await sql`SELECT value FROM kv_store WHERE key = ${k} LIMIT 1`; const x = r[0]?.value; return typeof x === 'string' ? JSON.parse(x) : (x ?? null); }
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v; }
const configurado = () => !!(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET);
const auth = () => ({ Authorization: `Key ${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}`, 'Content-Type': 'application/json', Accept: 'application/json' });
const caminhoOk = p => /^[a-z0-9][a-z0-9._\-/]{2,120}$/i.test(String(p || '')) && !String(p).includes('..');
async function hf(url, op = {}) {
  const r = await fetch(url, { ...op, headers: auth(), signal: AbortSignal.timeout(30000) }); const t = await r.text(); let d = null; try { d = JSON.parse(t); } catch (_) {}
  if (!r.ok) throw new Error('Higgsfield [' + r.status + ']: ' + String(d?.detail || d?.error || d?.message || t || '').substring(0, 220)); return d || {};
}
async function cfg() { return { ...PADRAO, ...((await kv(K_CFG)) || {}) }; }

async function status() { const c = await cfg(); return { configurado: configurado(), cfg: c, usos: USOS }; }
async function cfgSalvar({ modelo_imagem, modelo_video, extras_video }) {
  const c = await cfg();
  if (modelo_imagem != null) { if (!caminhoOk(modelo_imagem)) throw new Error('Caminho do modelo de imagem inválido'); c.modelo_imagem = String(modelo_imagem).replace(/^\/+/, ''); }
  if (modelo_video != null) { if (modelo_video && !caminhoOk(modelo_video)) throw new Error('Caminho do modelo de vídeo inválido'); c.modelo_video = String(modelo_video || '').replace(/^\/+/, ''); }
  if (extras_video != null) { if (typeof extras_video !== 'object' || Array.isArray(extras_video)) throw new Error('Campos extras precisam ser um objeto JSON'); c.extras_video = extras_video; }
  await kv(K_CFG, c); return { cfg: c };
}

// prompt pronto a partir do uso + briefing (Claude), com a identidade visual e as regras da casa
async function promptSugerir({ uso, briefing, tipo = 'video', formato = '16:9' }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const sys = `Você é diretor de arte da Atlantyx (dados e IA para empresas B2B; público: diretores e donos de empresas médias e grandes). Escreva UM prompt em inglês para gerar ${tipo === 'video' ? 'um vídeo curto (5–10 s) com movimento de câmera cinematográfico' : 'uma imagem'} no Higgsfield, formato ${formato}.
Identidade: paleta azul petróleo #00708A, ciano #00C4CC e azul-noite #0F172A; estética corporativa premium, tecnologia limpa, luz suave, sem excesso de efeitos; espaço livre para texto/logo.
Proibido: pessoas reais ou reconhecíveis, logotipos ou marcas de terceiros, texto escrito na imagem (a legenda entra depois), depoimentos, nomes de clientes.
Responda SOMENTE JSON: {"prompt":"...","legenda_sugerida":"texto curto em português para sobrepor ou postar","por_que":"1 frase"}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 700, system: sys, messages: [{ role: 'user', content: 'Uso: ' + (USOS[uso] || uso || 'marketing') + '\nBriefing: ' + String(briefing || '').substring(0, 1500) }] }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('IA [' + r.status + ']: ' + (d.error?.message || 'erro'));
  const t = (d.content || []).map(c => c.text || '').join(''); const a = t.indexOf('{'), b = t.lastIndexOf('}'); try { return JSON.parse(t.substring(a, b + 1)); } catch (_) { return { prompt: t.trim() }; }
}

async function gerar({ tipo = 'imagem', prompt, image_url, formato, uso, titulo, extras, _usuario }) {
  if (!configurado()) throw new Error('Higgsfield não configurado: crie a chave em console.higgsfield.ai e cadastre HF_API_KEY_ID e HF_API_KEY_SECRET na Vercel');
  const p = String(prompt || '').trim(); if (p.length < 8) throw new Error('Escreva o prompt (ou use "Escrever com IA")');
  const c = await cfg(); const modelo = tipo === 'video' ? c.modelo_video : c.modelo_imagem;
  if (!modelo) throw new Error('Defina o modelo de vídeo: copie o caminho do modelo na página dele na Higgsfield (ex.: Kling, Seedance ou DoP) e salve em Configurar');
  const entrada = { prompt: p.substring(0, 2000), ...(tipo === 'video' ? (c.extras_video || {}) : {}), ...(extras && typeof extras === 'object' ? extras : {}) };
  if (formato) entrada.aspect_ratio = String(formato);
  if (image_url) { if (!/^https:\/\//i.test(image_url)) throw new Error('A imagem de referência precisa ser um link https público'); entrada.image_url = image_url; }
  const d = await hf(BASE + '/' + modelo, { method: 'POST', body: JSON.stringify(entrada) });
  if (!d.request_id) throw new Error('A Higgsfield não devolveu request_id');
  const job = { id: d.request_id, status: d.status || 'queued', status_url: d.status_url || BASE + '/requests/' + d.request_id + '/status', tipo, modelo, prompt: p, formato: formato || null, uso: uso || null,
    titulo: String(titulo || '').substring(0, 120) || (USOS[uso] || 'Geração'), image_url: image_url || null, criado_em: new Date().toISOString(), por: _usuario || null, urls: [] };
  const L = (await kv(K_JOBS)) || []; L.unshift(job); await kv(K_JOBS, L.slice(0, 200)); return { job };
}
function _urls(d) { const u = []; (d.images || []).forEach(i => i?.url && u.push(i.url)); if (d.video?.url) u.push(d.video.url); (d.videos || []).forEach(v => v?.url && u.push(v.url)); return u; }
async function consultar({ id }) {
  const L = (await kv(K_JOBS)) || []; const j = L.find(x => x.id === id); if (!j) throw new Error('Geração não encontrada');
  if (['completed', 'failed', 'nsfw', 'canceled'].includes(j.status) && (j.status !== 'completed' || j.urls.length)) return { job: j };
  if (!String(j.status_url).startsWith(BASE + '/')) throw new Error('status_url inesperada');
  const d = await hf(j.status_url); j.status = d.status || j.status; j.urls = _urls(d); j.expira_em = d.expires_at || j.expira_em || null;
  if (d.error) j.erro = String(typeof d.error === 'string' ? d.error : d.error.message || JSON.stringify(d.error)).substring(0, 300);
  j.atualizado_em = new Date().toISOString(); await kv(K_JOBS, L); return { job: j };
}
async function listar() { return { jobs: (await kv(K_JOBS)) || [], configurado: configurado() }; }
async function marcar({ id, guardado_url, excluir }) {
  let L = (await kv(K_JOBS)) || []; if (excluir) L = L.filter(x => x.id !== id); else { const j = L.find(x => x.id === id); if (!j) throw new Error('Geração não encontrada'); if (guardado_url) { if (!/^https:\/\//.test(guardado_url)) throw new Error('URL inválida'); j.guardado_url = guardado_url; } }
  await kv(K_JOBS, L); return { ok: true };
}

async function handler(req, res) {
  try {
    const b = req.method === 'POST' ? (req.body || {}) : (req.query || {}); const usuario = req.sessao?.login || null;
    const A = { status, cfg_salvar: () => cfgSalvar(b), prompt_sugerir: () => promptSugerir(b), gerar: () => gerar({ ...b, _usuario: usuario }), consultar: () => consultar(b), listar, marcar: () => marcar(b) };
    const f = A[b.action]; if (!f) return res.status(400).json({ success: false, error: 'ação inválida' });
    return res.status(200).json({ success: true, ...(await f()) });
  } catch (e) { return res.status(500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'higgsfield');
