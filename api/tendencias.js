import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
// api/tendencias.js — v3.143 · S2 · REAÇÃO A TENDÊNCIAS (3 semanas)
// Técnica: achar os vídeos mais vistos do nicho no mundo, publicar a REAÇÃO da Atlantyx a eles (3 por dia) e,
// em paralelo, carrosséis, reels temáticos e stories sobre o mesmo conteúdo durante 3 semanas.
// Direito autoral: o vídeo original NÃO é baixado nem republicado. Cada reação é um Reel próprio da Atlantyx
// (arte da marca + texto) que comenta o vídeo, dá crédito ao criador e leva o link na legenda.
// Fontes de vídeos: YouTube Data API (se YOUTUBE_API_KEY estiver no Vercel) + pesquisa na web pela IA (sempre).

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
let _sql = null, _pronto = false;
async function getSql() {
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  if (_pronto) return _sql;
  await _sql`CREATE TABLE IF NOT EXISTS tend_campanhas (id TEXT PRIMARY KEY, nome TEXT, nicho TEXT, palavras JSONB DEFAULT '[]'::jsonb, config JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'rascunho', criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS tend_videos (id TEXT PRIMARY KEY, campanha_id TEXT REFERENCES tend_campanhas(id) ON DELETE CASCADE, plataforma TEXT, url TEXT, titulo TEXT,
    criador TEXT, criador_handle TEXT, views BIGINT, publicado_em TEXT, resumo TEXT, idioma TEXT, fonte TEXT, escolhido BOOLEAN DEFAULT false, criado_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS tend_pecas (id TEXT PRIMARY KEY, campanha_id TEXT REFERENCES tend_campanhas(id) ON DELETE CASCADE, video_id TEXT, tipo TEXT, data TEXT, hora TEXT,
    tema TEXT, angulo INT DEFAULT 0, roteiro JSONB, legenda TEXT, midia_urls JSONB DEFAULT '[]'::jsonb, status TEXT DEFAULT 'planejada', metricool_id TEXT, erro TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE INDEX IF NOT EXISTS idx_tend_pecas_camp ON tend_pecas(campanha_id, data, hora)`;
  _pronto = true; return _sql;
}
const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const CFG_PADRAO = { inicio: null, dias: 21, reacoes_dia: 3, horarios: ['08:30', '12:30', '18:30'], carrosseis_semana: 3, carrossel_hora: '11:00', reels_tema_semana: 2, reel_tema_hora: '20:00',
  stories_dia: 1, story_hora: '10:00', redes: ['instagram'], rascunho: false };
const PALAVRAS_PADRAO = ['IA para empresas', 'inteligência artificial nos negócios', 'engenharia de dados', 'business intelligence', 'IA generativa', 'data analytics', 'transformação digital', 'AI agents business'];

async function claude(system, content, maxTokens = 4000, tools) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }], ...(tools ? { tools } : {}) }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('IA [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
}
function json(t) { const s = String(t || '').replace(/```json|```/g, ''); const i = s.search(/[{[]/); if (i < 0) throw new Error('A IA não devolveu JSON'); const f = s[i] === '{' ? '}' : ']'; return JSON.parse(s.substring(i, s.lastIndexOf(f) + 1)); }
const hojeBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const maisDias = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().substring(0, 10); };

// ── campanhas ──
async function campanhas() { const sql = await getSql();
  const C = await sql`SELECT c.*, (SELECT COUNT(*)::int FROM tend_pecas p WHERE p.campanha_id=c.id) AS n_pecas, (SELECT COUNT(*)::int FROM tend_pecas p WHERE p.campanha_id=c.id AND p.status='agendada') AS n_agendadas,
    (SELECT COUNT(*)::int FROM tend_videos v WHERE v.campanha_id=c.id AND v.escolhido) AS n_videos FROM tend_campanhas c ORDER BY c.criado_em DESC`;
  return { campanhas: C, padrao: { config: CFG_PADRAO, palavras: PALAVRAS_PADRAO }, youtube: !!process.env.YOUTUBE_API_KEY };
}
async function campanhaSalvar(b) { const sql = await getSql();
  const cfg = { ...CFG_PADRAO, ...(b.config || {}) }; if (!cfg.inicio) cfg.inicio = maisDias(hojeBR(), 1);
  const palavras = (Array.isArray(b.palavras) ? b.palavras : String(b.palavras || '').split(/[,;\n]/)).map(s => String(s).trim()).filter(Boolean).slice(0, 15);
  if (b.id) { await sql`UPDATE tend_campanhas SET nome=${b.nome || 'Reação a tendências'}, nicho=${b.nicho || null}, palavras=${JSON.stringify(palavras.length ? palavras : PALAVRAS_PADRAO)}, config=${JSON.stringify(cfg)}, atualizado_em=NOW() WHERE id=${b.id}`; return { id: b.id }; }
  const id = novoId('tdc');
  await sql`INSERT INTO tend_campanhas (id, nome, nicho, palavras, config) VALUES (${id}, ${b.nome || 'Reação a tendências'}, ${b.nicho || 'Dados, BI e IA para empresas'}, ${JSON.stringify(palavras.length ? palavras : PALAVRAS_PADRAO)}, ${JSON.stringify(cfg)})`;
  return { id };
}
async function campanhaObter({ id }) { const sql = await getSql();
  const c = (await sql`SELECT * FROM tend_campanhas WHERE id=${id}`)[0]; if (!c) throw new Error('Campanha não encontrada');
  const V = await sql`SELECT * FROM tend_videos WHERE campanha_id=${id} ORDER BY escolhido DESC, views DESC NULLS LAST`;
  const P = await sql`SELECT * FROM tend_pecas WHERE campanha_id=${id} ORDER BY data, hora`;
  return { campanha: c, videos: V.map(v => ({ ...v, views: v.views != null ? Number(v.views) : null })), pecas: P };
}

// ── vídeos em alta no nicho (mundo) ──
async function _youtube(palavras, dias) {
  const key = process.env.YOUTUBE_API_KEY; if (!key) return [];
  const desde = new Date(Date.now() - dias * 864e5).toISOString(); const ids = new Map();
  for (const q of palavras.slice(0, 6)) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=15&publishedAfter=${encodeURIComponent(desde)}&q=${encodeURIComponent(q)}&key=${key}`);
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('YouTube: ' + (d.error?.message || r.status));
    (d.items || []).forEach(it => { if (it.id?.videoId && !ids.has(it.id.videoId)) ids.set(it.id.videoId, it.snippet); });
  }
  if (!ids.size) return [];
  const lista = [...ids.keys()]; const out = [];
  for (let i = 0; i < lista.length; i += 50) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${lista.slice(i, i + 50).join(',')}&key=${key}`); const d = await r.json().catch(() => ({}));
    (d.items || []).forEach(v => out.push({ plataforma: 'YouTube', url: 'https://www.youtube.com/watch?v=' + v.id, titulo: v.snippet?.title, criador: v.snippet?.channelTitle, views: parseInt(v.statistics?.viewCount) || 0,
      publicado_em: (v.snippet?.publishedAt || '').substring(0, 10), resumo: String(v.snippet?.description || '').substring(0, 400), idioma: v.snippet?.defaultAudioLanguage || v.snippet?.defaultLanguage || '', fonte: 'youtube_api' }));
  }
  return out;
}
async function _webIA(palavras, dias, nicho) {
  const txt = await claude(`Você é pesquisador de tendências de conteúdo. Use a busca na web para encontrar os vídeos MAIS VISTOS no mundo (qualquer idioma) sobre o nicho informado, publicados nos últimos ${dias} dias (se houver poucos, amplie para os últimos 12 meses): YouTube, Instagram Reels, TikTok e LinkedIn. Priorize vídeos com muitas visualizações, de criadores reconhecidos, com conteúdo útil para executivos e gestores de empresas.
Não invente: só liste vídeos que você encontrou com URL real; se não souber as visualizações exatas, estime pela fonte e marque "views_estimado": true.
Responda SOMENTE JSON: {"videos":[{"plataforma":"YouTube|Instagram|TikTok|LinkedIn","url":"https://...","titulo":"...","criador":"nome","criador_handle":"@...","views":1234567,"views_estimado":false,"publicado_em":"AAAA-MM-DD","idioma":"en|pt|es...","resumo":"2 frases sobre o que o vídeo diz/mostra"}]}`,
    `NICHO: ${nicho || 'dados, BI, engenharia de dados e IA para empresas'}\nPALAVRAS-CHAVE: ${palavras.join(', ')}\nQuero de 15 a 30 vídeos, ordenados por visualizações.`, 6000,
    [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }]);
  const j = json(txt); return (j.videos || []).filter(v => /^https?:\/\//.test(v.url || '')).map(v => ({ ...v, views: parseInt(v.views) || null, fonte: 'web_ia' + (v.views_estimado ? '_estimado' : '') }));
}
async function buscarVideos({ campanha_id, dias = 90 }) { const sql = await getSql();
  const c = (await sql`SELECT * FROM tend_campanhas WHERE id=${campanha_id}`)[0]; if (!c) throw new Error('Campanha não encontrada');
  const palavras = c.palavras?.length ? c.palavras : PALAVRAS_PADRAO; const erros = [];
  const [yt, web] = await Promise.allSettled([_youtube(palavras, dias), _webIA(palavras, dias, c.nicho)]);
  if (yt.status === 'rejected') erros.push(yt.reason.message); if (web.status === 'rejected') erros.push('Pesquisa na web: ' + web.reason.message);
  const todos = [...(yt.value || []), ...(web.value || [])];
  const ja = new Set((await sql`SELECT url FROM tend_videos WHERE campanha_id=${campanha_id}`).map(v => v.url));
  await sql`DELETE FROM tend_videos WHERE campanha_id=${campanha_id} AND NOT escolhido`;
  let n = 0; const vistos = new Set();
  for (const v of todos.sort((a, b) => (b.views || 0) - (a.views || 0))) {
    const k = String(v.url).replace(/[?&](si|feature|utm_[a-z]+)=[^&]*/g, ''); if (vistos.has(k)) continue; vistos.add(k);
    if (ja.has(v.url) && (await sql`SELECT 1 FROM tend_videos WHERE campanha_id=${campanha_id} AND url=${v.url} AND escolhido`).length) continue;
    await sql`INSERT INTO tend_videos (id, campanha_id, plataforma, url, titulo, criador, criador_handle, views, publicado_em, resumo, idioma, fonte)
      VALUES (${novoId('tdv')}, ${campanha_id}, ${v.plataforma || ''}, ${v.url}, ${String(v.titulo || '').substring(0, 300)}, ${v.criador || ''}, ${v.criador_handle || null}, ${v.views || null}, ${v.publicado_em || null}, ${String(v.resumo || '').substring(0, 600)}, ${v.idioma || null}, ${v.fonte || null})`;
    n++; if (n >= 60) break;
  }
  return { encontrados: n, erros, fontes: { youtube: (yt.value || []).length, web: (web.value || []).length } };
}
async function videoEscolher({ ids = [], escolhido = true }) { const sql = await getSql(); for (const id of ids) await sql`UPDATE tend_videos SET escolhido=${!!escolhido} WHERE id=${id}`; return { ok: true }; }

// ── plano de 3 semanas ──
async function planoGerar({ campanha_id, substituir = true }) { const sql = await getSql();
  const c = (await sql`SELECT * FROM tend_campanhas WHERE id=${campanha_id}`)[0]; if (!c) throw new Error('Campanha não encontrada');
  const cfg = { ...CFG_PADRAO, ...(c.config || {}) };
  const V = await sql`SELECT id, titulo FROM tend_videos WHERE campanha_id=${campanha_id} AND escolhido ORDER BY views DESC NULLS LAST`;
  if (!V.length) throw new Error('Escolha os vídeos que a Atlantyx vai reagir (passo ②) antes de gerar o plano.');
  if (substituir) await sql`DELETE FROM tend_pecas WHERE campanha_id=${campanha_id} AND status IN ('planejada','roteiro','erro')`;
  const ja = new Set((await sql`SELECT data || ' ' || hora || ' ' || tipo AS k FROM tend_pecas WHERE campanha_id=${campanha_id}`).map(x => x.k));
  const ins = async (tipo, data, hora, extra = {}) => { if (ja.has(data + ' ' + hora + ' ' + tipo)) return 0;
    await sql`INSERT INTO tend_pecas (id, campanha_id, video_id, tipo, data, hora, tema, angulo) VALUES (${novoId('tdp')}, ${campanha_id}, ${extra.video_id || null}, ${tipo}, ${data}, ${hora}, ${extra.tema || null}, ${extra.angulo || 0})`; return 1; };
  let n = 0, k = 0; const dias = Math.max(1, Math.min(42, parseInt(cfg.dias) || 21));
  for (let d = 0; d < dias; d++) {
    const data = maisDias(cfg.inicio, d), dow = new Date(data + 'T12:00:00Z').getUTCDay(), semana = Math.floor(d / 7);
    for (let r = 0; r < (parseInt(cfg.reacoes_dia) || 0); r++) { const v = V[k % V.length]; n += await ins('reacao', data, cfg.horarios[r % cfg.horarios.length] || '12:00', { video_id: v.id, angulo: Math.floor(k / V.length) }); k++; }
    for (let s = 0; s < (parseInt(cfg.stories_dia) || 0); s++) n += await ins('story', data, cfg.story_hora || '10:00', { tema: 'semana ' + (semana + 1) });
    const carrDias = [[], [3], [1, 4], [1, 3, 5], [1, 2, 4, 5], [1, 2, 3, 4, 5]][Math.min(5, parseInt(cfg.carrosseis_semana) || 0)];
    if (carrDias.includes(dow)) n += await ins('carrossel', data, cfg.carrossel_hora || '11:00', { tema: 'semana ' + (semana + 1) });
    const reelDias = [[], [4], [2, 5], [2, 4, 6], [1, 3, 5, 6]][Math.min(4, parseInt(cfg.reels_tema_semana) || 0)];
    if (reelDias.includes(dow)) n += await ins('reel_tema', data, cfg.reel_tema_hora || '20:00', { tema: 'semana ' + (semana + 1) });
  }
  await sql`UPDATE tend_campanhas SET status='planejada', atualizado_em=NOW() WHERE id=${campanha_id}`;
  return { pecas_criadas: n };
}

// ── roteiros com IA ──
const SYS_REACAO = `Você é o estrategista de conteúdo da Atlantyx (17 anos de dados, BI, engenharia de dados e IA para grandes empresas brasileiras — CPFL, Enel, Caixa). Escreve REAÇÕES da Atlantyx a vídeos em alta no mundo, em português do Brasil, tom de especialista que opina com respeito: concorda, discorda ou completa, sempre trazendo para a realidade das empresas brasileiras e terminando com uma provocação que gere comentários.
Regras: não copie falas do vídeo além de uma citação curta entre aspas; dê crédito ao criador; não prometa resultados; nada de clickbait enganoso.
Formato do Reel (texto na tela, 1 frase curta por slide, máx. 12 palavras): slide 1 = gancho com o número de visualizações ou a afirmação polêmica do vídeo; slide 2 = o que o vídeo diz; slides 3-4 = a reação/opinião da Atlantyx com um ponto prático; slide 5 = provocação/pergunta + "comenta aqui".`;
async function roteirosGerar({ campanha_id, ids, limite = 8 }) { const sql = await getSql();
  const c = (await sql`SELECT * FROM tend_campanhas WHERE id=${campanha_id}`)[0]; if (!c) throw new Error('Campanha não encontrada');
  let P = ids?.length ? await sql`SELECT * FROM tend_pecas WHERE id = ANY(${ids})` : await sql`SELECT * FROM tend_pecas WHERE campanha_id=${campanha_id} AND status='planejada' ORDER BY data, hora LIMIT ${Math.min(12, limite)}`;
  if (!P.length) return { gerados: 0, restantes: 0 };
  const V = await sql`SELECT * FROM tend_videos WHERE campanha_id=${campanha_id} AND escolhido ORDER BY views DESC NULLS LAST`;
  const fmtV = v => v ? `"${v.titulo}" — ${v.criador}${v.criador_handle ? ' (' + v.criador_handle + ')' : ''} · ${v.plataforma} · ${v.views ? Number(v.views).toLocaleString('pt-BR') + ' visualizações' : 'visualizações não informadas'} · ${v.url}\nResumo: ${v.resumo || '—'}` : '';
  const pedidos = P.map(p => { const v = V.find(x => x.id === p.video_id);
    return { id: p.id, tipo: p.tipo, data: p.data, angulo: p.angulo, video: v ? fmtV(v) : null }; });
  const temas = V.slice(0, 12).map((v, i) => `${i + 1}. ${fmtV(v)}`).join('\n');
  const txt = await claude(SYS_REACAO + `
Tipos de peça:
- "reacao": Reel de reação a UM vídeo (5 slides como acima). "angulo" > 0 = já reagimos a esse vídeo antes: use OUTRO ângulo (outro ponto do vídeo, uma objeção, um caso prático, um erro comum).
- "reel_tema": Reel temático (5 slides) conectando 2 ou 3 vídeos da semana numa lição única da Atlantyx.
- "carrossel": 6 a 8 slides com "titulo" (máx. 8 palavras) e "apoio" (máx. 22 palavras) — síntese do que os vídeos em alta estão dizendo + a visão da Atlantyx + checklist prático; último slide com chamada.
- "story": 1 tela com "texto" (máx. 18 palavras) — pergunta/enquete ou bastidor sobre o tema do dia.
Legenda (exceto story): 3 a 6 linhas, com gancho, a visão da Atlantyx, pergunta para comentários; para reações, inclua no fim "🎥 Vídeo original: <criador> — <url>" (crédito obrigatório); 5 a 8 hashtags relevantes (mistura de português e inglês).
Responda SOMENTE JSON: {"pecas":[{"id":"...","slides":[{"texto_tela":"..."}] ou [{"titulo":"...","apoio":"..."}],"texto":"(só story)","legenda":"...","tema":"frase curta"}]}`,
    `CAMPANHA: ${c.nome} · NICHO: ${c.nicho || ''}\nVÍDEOS EM ALTA ESCOLHIDOS (para reel_tema, carrossel e story usarem como base):\n${temas}\n\nPEÇAS A ESCREVER:\n${pedidos.map(p => `- id=${p.id} tipo=${p.tipo} data=${p.data} angulo=${p.angulo}${p.video ? '\n  VÍDEO: ' + p.video.replace(/\n/g, '\n  ') : ''}`).join('\n')}`, 9000);
  const j = json(txt); let n = 0;
  for (const x of j.pecas || []) { const p = P.find(y => y.id === x.id); if (!p) continue;
    const roteiro = { slides: x.slides || [], texto: x.texto || null };
    await sql`UPDATE tend_pecas SET roteiro=${JSON.stringify(roteiro)}, legenda=${x.legenda || null}, tema=COALESCE(${x.tema || null}, tema), status='roteiro', erro=NULL, atualizado_em=NOW() WHERE id=${p.id}`; n++; }
  const rest = (await sql`SELECT COUNT(*)::int AS n FROM tend_pecas WHERE campanha_id=${campanha_id} AND status='planejada'`)[0].n;
  return { gerados: n, restantes: rest };
}
async function pecaSalvar(b) { const sql = await getSql();
  await sql`UPDATE tend_pecas SET roteiro=COALESCE(${b.roteiro ? JSON.stringify(b.roteiro) : null}, roteiro), legenda=COALESCE(${b.legenda ?? null}, legenda), midia_urls=COALESCE(${b.midia_urls ? JSON.stringify(b.midia_urls) : null}, midia_urls),
    status=COALESCE(${b.status || null}, status), metricool_id=COALESCE(${b.metricool_id || null}, metricool_id), erro=${b.erro || null}, data=COALESCE(${b.data || null}, data), hora=COALESCE(${b.hora || null}, hora), atualizado_em=NOW() WHERE id=${b.id}`;
  return { ok: true };
}

async function handler(req, res) {
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  try {
    const acoes = {
      campanhas: () => campanhas(), campanha_salvar: () => campanhaSalvar(b), campanha_obter: () => campanhaObter(b),
      campanha_excluir: async () => { const sql = await getSql(); await sql`DELETE FROM tend_campanhas WHERE id=${b.id}`; return { ok: true }; },
      buscar_videos: () => buscarVideos(b), video_escolher: () => videoEscolher(b),
      video_adicionar: async () => { const sql = await getSql(); if (!/^https?:\/\//.test(b.url || '')) throw new Error('Informe a URL do vídeo');
        await sql`INSERT INTO tend_videos (id, campanha_id, plataforma, url, titulo, criador, views, resumo, fonte, escolhido) VALUES (${novoId('tdv')}, ${b.campanha_id}, ${b.plataforma || ''}, ${b.url}, ${b.titulo || b.url}, ${b.criador || ''}, ${parseInt(b.views) || null}, ${b.resumo || null}, 'manual', true)`; return { ok: true }; },
      plano_gerar: () => planoGerar(b), roteiros_gerar: () => roteirosGerar(b), peca_salvar: () => pecaSalvar(b),
      peca_excluir: async () => { const sql = await getSql(); await sql`DELETE FROM tend_pecas WHERE id=${b.id}`; return { ok: true }; },
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) { console.error('[tendencias]', b.action, e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'tendencias');
