import { comGuarda } from '../lib/qa-guard.js';
import { ICP_TEXTO, RE_CONTEUDO_FORA_ICP } from '../lib/icp.js';
import crypto from 'node:crypto';
// api/tendencias.js — v3.143 · S2 · REAÇÃO A TENDÊNCIAS (3 semanas)
// Técnica: achar os vídeos mais vistos do nicho no mundo, publicar a REAÇÃO da Atlantyx a eles (3 por dia) e,
// em paralelo, carrosséis, reels temáticos e stories sobre o mesmo conteúdo durante 3 semanas.
// Direito autoral: o vídeo original NÃO é baixado nem republicado. Cada reação é um Reel próprio da Atlantyx
// (arte da marca + texto) que comenta o vídeo, dá crédito ao criador e leva o link na legenda.
// v3.144: o Fabio pode GRAVAR a própria reação (câmera + teleprompter) ou enviar um vídeo pronto; o vídeo completo vai ao produtor do Podtecno.
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
  // v3.144: vídeo COMPLETO da reação (sem corte/moldura) para o produtor do Podtecno — guardado em partes de ~2,4 MB
  // (limite de 4,5 MB por requisição na Vercel) e baixado por uma página que junta as partes no navegador. Expira em 30 dias.
  await _sql`CREATE TABLE IF NOT EXISTS tend_envios (id TEXT PRIMARY KEY, token TEXT UNIQUE, peca_id TEXT, nome TEXT, content_type TEXT, tamanho BIGINT, partes INT, completo BOOLEAN DEFAULT false,
    enviado_para TEXT, enviado_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS tend_envio_partes (envio_id TEXT, i INT, b64 TEXT, PRIMARY KEY (envio_id, i))`;
  _pronto = true; return _sql;
}
const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const CFG_PADRAO = { podtecno_email: '', podtecno_auto: true, inicio: null, dias: 21, reacoes_dia: 3, horarios: ['08:30', '12:30', '18:30'], carrosseis_semana: 3, carrossel_hora: '11:00', reels_tema_semana: 2, reel_tema_hora: '20:00',
  stories_dia: 1, story_hora: '10:00', redes: ['instagram'], rascunho: false };
// v3.234: ICP C-level — palavras de NEGÓCIO/diretoria (antes "engenharia de dados" e "data analytics" traziam tutorial e vídeo de carreira)
const PALAVRAS_PADRAO = ['IA para empresas', 'inteligência artificial nos negócios', 'AI strategy for CEOs', 'IA na diretoria', 'transformação digital resultados', 'AI agents business', 'CFO inteligência artificial', 'data-driven leadership'];

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
    (d.items || []).filter(v => !RE_CONTEUDO_FORA_ICP.test((v.snippet?.title || '') + ' ' + String(v.snippet?.description || '').substring(0, 200))).forEach(v => out.push({ // v3.234: sem tutorial/curso/vaga/carreira plataforma: 'YouTube', url: 'https://www.youtube.com/watch?v=' + v.id, titulo: v.snippet?.title, criador: v.snippet?.channelTitle, views: parseInt(v.statistics?.viewCount) || 0,
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
const SYS_REACAO = `${ICP_TEXTO}
Você é o estrategista de conteúdo da Atlantyx (17 anos de dados, BI, engenharia de dados e IA para grandes empresas brasileiras — CPFL, Enel, Caixa). Escreve REAÇÕES da Atlantyx a vídeos em alta no mundo, em português do Brasil, tom de especialista que opina com respeito: concorda, discorda ou completa, sempre trazendo para a realidade das empresas brasileiras e terminando com uma provocação que gere comentários.
Regras: não copie falas do vídeo além de uma citação curta entre aspas; dê crédito ao criador; não prometa resultados; nada de clickbait enganoso.
Formato do Reel (texto na tela, 1 frase curta por slide, máx. 12 palavras): slide 1 = gancho com o número de visualizações ou a afirmação polêmica do vídeo; slide 2 = o que o vídeo diz; slides 3-4 = a reação/opinião da Atlantyx com um ponto prático; slide 5 = pergunta para quem decide (impacto no resultado da empresa) + convite para conversar com a Atlantyx — sem pedir comentário/curtida.`;
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
- "reacao" e "reel_tema" também levam "fala": o texto que o apresentador (Fabio, CEO da Atlantyx) lê no teleprompter ao gravar a reação — 35 a 50 segundos (90 a 120 palavras), primeira pessoa, natural, cita o criador, termina com a pergunta para comentários.
- "reacao": Reel de reação a UM vídeo (5 slides como acima). "angulo" > 0 = já reagimos a esse vídeo antes: use OUTRO ângulo (outro ponto do vídeo, uma objeção, um caso prático, um erro comum).
- "reel_tema": Reel temático (5 slides) conectando 2 ou 3 vídeos da semana numa lição única da Atlantyx.
- "carrossel": 6 a 8 slides com "titulo" (máx. 8 palavras) e "apoio" (máx. 22 palavras) — síntese do que os vídeos em alta estão dizendo + a visão da Atlantyx + checklist prático; último slide com chamada.
- "story": 1 tela com "texto" (máx. 18 palavras) — pergunta/enquete ou bastidor sobre o tema do dia.
Legenda (exceto story): 3 a 6 linhas, com gancho, a visão da Atlantyx, pergunta para comentários; para reações, inclua no fim "🎥 Vídeo original: <criador> — <url>" (crédito obrigatório); 5 a 8 hashtags relevantes (mistura de português e inglês).
Responda SOMENTE JSON: {"pecas":[{"id":"...","slides":[{"texto_tela":"..."}] ou [{"titulo":"...","apoio":"..."}],"texto":"(só story)","fala":"(só reacao e reel_tema)","legenda":"...","tema":"frase curta"}]}`,
    `CAMPANHA: ${c.nome} · NICHO: ${c.nicho || ''}\nVÍDEOS EM ALTA ESCOLHIDOS (para reel_tema, carrossel e story usarem como base):\n${temas}\n\nPEÇAS A ESCREVER:\n${pedidos.map(p => `- id=${p.id} tipo=${p.tipo} data=${p.data} angulo=${p.angulo}${p.video ? '\n  VÍDEO: ' + p.video.replace(/\n/g, '\n  ') : ''}`).join('\n')}`, 9000);
  const j = json(txt); let n = 0;
  for (const x of j.pecas || []) { const p = P.find(y => y.id === x.id); if (!p) continue;
    const roteiro = { slides: x.slides || [], texto: x.texto || null, fala: x.fala || null };
    await sql`UPDATE tend_pecas SET roteiro=${JSON.stringify(roteiro)}, legenda=${x.legenda || null}, tema=COALESCE(${x.tema || null}, tema), status='roteiro', erro=NULL, atualizado_em=NOW() WHERE id=${p.id}`; n++; }
  const rest = (await sql`SELECT COUNT(*)::int AS n FROM tend_pecas WHERE campanha_id=${campanha_id} AND status='planejada'`)[0].n;
  return { gerados: n, restantes: rest };
}
async function pecaSalvar(b) { const sql = await getSql();
  await sql`UPDATE tend_pecas SET roteiro=COALESCE(${b.roteiro ? JSON.stringify(b.roteiro) : null}, roteiro), legenda=COALESCE(${b.legenda ?? null}, legenda), midia_urls=COALESCE(${b.midia_urls ? JSON.stringify(b.midia_urls) : null}, midia_urls),
    status=COALESCE(${b.status || null}, status), metricool_id=COALESCE(${b.metricool_id || null}, metricool_id), erro=${b.erro || null}, data=COALESCE(${b.data || null}, data), hora=COALESCE(${b.hora || null}, hora), atualizado_em=NOW() WHERE id=${b.id}`;
  return { ok: true };
}

// ── v3.144: vídeo completo para o produtor do Podtecno ──
const MAX_COMPLETO = 200 * 1048576, MAX_PARTE_B64 = 3.4e6;
const baseUrl = req => { const b = process.env.MEDIA_PUBLIC_BASE || process.env.VERCEL_PROJECT_PRODUCTION_URL || req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost:3000';
  return (b.startsWith('http') ? b : (/^localhost|^127\./.test(b) ? 'http://' : 'https://') + b).replace(/\/$/, ''); };
const escH = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function envioIniciar(b) { const sql = await getSql();
  const tam = +b.tamanho || 0, partes = +b.partes || 0; if (!tam || !partes || partes > 120) throw new Error('arquivo inválido');
  if (tam > MAX_COMPLETO) throw new Error('vídeo completo acima de 200 MB — grave em partes menores ou envie pelo Drive');
  // limpeza: partes com mais de 30 dias e uploads abandonados (não concluídos em 1 dia)
  await sql`DELETE FROM tend_envio_partes WHERE envio_id IN (SELECT id FROM tend_envios WHERE criado_em < NOW() - INTERVAL '30 days' OR (NOT completo AND criado_em < NOW() - INTERVAL '1 day'))`;
  const id = novoId('tde'), token = crypto.randomBytes(16).toString('hex');
  await sql`INSERT INTO tend_envios (id, token, peca_id, nome, content_type, tamanho, partes) VALUES (${id}, ${token}, ${b.peca_id}, ${String(b.nome || 'reacao.mp4').replace(/[^\w.\-]/g, '_')}, ${/^video\/(mp4|webm|quicktime)/.test(b.content_type || '') ? b.content_type.split(';')[0] : 'video/mp4'}, ${tam}, ${partes})`;
  return { envio_id: id };
}
async function envioParte(b) { const sql = await getSql();
  const e = (await sql`SELECT partes, completo FROM tend_envios WHERE id=${b.envio_id}`)[0]; if (!e) throw new Error('envio não encontrado');
  const i = parseInt(b.i); if (!(i >= 0 && i < e.partes) || e.completo) throw new Error('parte fora do envio');
  if (typeof b.b64 !== 'string' || b.b64.length > MAX_PARTE_B64 || !/^[A-Za-z0-9+/=]+$/.test(b.b64)) throw new Error('parte inválida');
  await sql`INSERT INTO tend_envio_partes (envio_id, i, b64) VALUES (${b.envio_id}, ${i}, ${b.b64}) ON CONFLICT (envio_id, i) DO UPDATE SET b64=EXCLUDED.b64`;
  return { ok: true };
}
async function envioConcluir(b, req) { const sql = await getSql();
  const e = (await sql`SELECT * FROM tend_envios WHERE id=${b.envio_id}`)[0]; if (!e) throw new Error('envio não encontrado');
  const n = (await sql`SELECT COUNT(*)::int AS n FROM tend_envio_partes WHERE envio_id=${e.id}`)[0].n;
  if (n !== e.partes) throw new Error('faltam ' + (e.partes - n) + ' parte(s) — envie de novo');
  await sql`UPDATE tend_envios SET completo=true WHERE id=${e.id}`;
  const link = baseUrl(req) + '/api/tendencias?baixar=' + e.token;
  await sql`UPDATE tend_pecas SET roteiro = COALESCE(roteiro, '{}'::jsonb) || ${JSON.stringify({ video_completo: { envio_id: e.id, link, tamanho: Number(e.tamanho), em: new Date().toISOString() } })}::jsonb, atualizado_em=NOW() WHERE id=${e.peca_id}`;
  return { link };
}
async function produtorEnviar(b, req) { const sql = await getSql();
  const p = (await sql`SELECT * FROM tend_pecas WHERE id=${b.peca_id}`)[0]; if (!p) throw new Error('peça não encontrada');
  const vc = p.roteiro?.video_completo; if (!vc?.link) throw new Error('esta peça ainda não tem o vídeo completo — grave ou envie o vídeo primeiro');
  const c = (await sql`SELECT * FROM tend_campanhas WHERE id=${p.campanha_id}`)[0], v = p.video_id ? (await sql`SELECT * FROM tend_videos WHERE id=${p.video_id}`)[0] : null;
  const para = String(b.para || c?.config?.podtecno_email || '').split(/[,;\s]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (!para.length) throw new Error('informe o e-mail do produtor do Podtecno em ⚙ Campanha');
  const mb = (Number(vc.tamanho || 0) / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const dataBR = p.data ? p.data.split('-').reverse().join('/') : '';
  const titulo = p.tema || v?.titulo || 'reação';
  const html = `<div style="font-family:Montserrat,Calibri,Arial,sans-serif;color:#0B1226;max-width:640px;">
<div style="background:#0B1226;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;"><b style="letter-spacing:1px;">ATLANTYX</b> · <span style="color:#00C4CC;">🎥 Reação para o Podtecno</span></div>
<div style="border:1px solid #e4e8f2;border-top:0;padding:18px 20px;border-radius:0 0 8px 8px;">
<p>Olá! Segue o <b>vídeo completo</b> da reação gravada pelo Fabio, sem corte e sem moldura, para usar no Podtecno.</p>
<p style="margin:18px 0;"><a href="${escH(vc.link)}" style="background:#1A3A8F;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700;">⬇ Baixar o vídeo completo (${mb} MB)</a></p>
<p style="font-size:12px;color:#5b6478;">O link fica disponível por 30 dias.</p>
<table style="font-size:13px;border-collapse:collapse;width:100%;">
<tr><td style="padding:5px 0;color:#5b6478;width:150px;">Tema</td><td><b>${escH(titulo)}</b></td></tr>
${v ? `<tr><td style="padding:5px 0;color:#5b6478;">Reage a</td><td><a href="${escH(v.url)}">${escH(v.titulo)}</a> — ${escH(v.criador || '')} ${escH(v.criador_handle || '')} (${escH(v.plataforma || '')})</td></tr>` : ''}
${(p.midia_urls || [])[0] || p.roteiro?.video_proprio ? `<tr><td style="padding:5px 0;color:#5b6478;">Versão Reel</td><td><a href="${escH((p.midia_urls || [])[0] || p.roteiro.video_proprio)}">vídeo 9:16 com a moldura Atlantyx</a>${dataBR ? ' · Instagram em ' + dataBR + ' ' + escH(p.hora || '') : ''}</td></tr>` : ''}
</table>
${p.roteiro?.fala ? `<h3 style="font-size:14px;margin:18px 0 6px;">Roteiro falado</h3><p style="font-size:13px;white-space:pre-wrap;background:#f5f7fb;padding:10px 12px;border-radius:6px;">${escH(p.roteiro.fala)}</p>` : ''}
${p.legenda ? `<h3 style="font-size:14px;margin:18px 0 6px;">Legenda usada no Instagram</h3><p style="font-size:13px;white-space:pre-wrap;">${escH(p.legenda)}</p>` : ''}
<p style="font-size:12px;color:#5b6478;border-top:1px solid #e4e8f2;padding-top:10px;margin-top:18px;">⚖ O vídeo original não está incluído. Se for mostrar trechos dele no Podtecno, use poucos segundos, com crédito ao criador e o link — ou apenas cite e mostre o link.</p>
</div></div>`;
  const { enviarEmailGmail } = await import('./financeiro.js');
  const r = await enviarEmailGmail({ para, assunto: '🎥 Podtecno · Reação Atlantyx: ' + titulo.substring(0, 80) + ' (vídeo completo)', html, remetente: 'Atlantyx · Podtecno' });
  await sql`UPDATE tend_envios SET enviado_para=${para.join(', ')}, enviado_em=NOW() WHERE id=${vc.envio_id}`;
  await sql`UPDATE tend_pecas SET roteiro = roteiro || ${JSON.stringify({ video_completo: { ...vc, enviado_para: para.join(', '), enviado_em: new Date().toISOString() } })}::jsonb WHERE id=${p.id}`;
  return { para, via: r?.via || null };
}
// página pública (por token) que baixa as partes e junta o arquivo no navegador do produtor
async function paginaBaixar(req, res) { const sql = await getSql(); const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const tok = String(q.baixar || ''); const e = /^[a-f0-9]{32}$/.test(tok) ? (await sql`SELECT * FROM tend_envios WHERE token=${tok} AND completo`)[0] : null;
  const vivo = e && (Date.now() - new Date(e.criado_em).getTime()) < 30 * 864e5;
  if (q.parte != null) { if (!vivo) return res.status(404).end();
    const r = (await sql`SELECT b64 FROM tend_envio_partes WHERE envio_id=${e.id} AND i=${parseInt(q.parte) || 0}`)[0]; if (!r) return res.status(404).end();
    const buf = Buffer.from(r.b64, 'base64'); res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Cache-Control', 'private, max-age=3600'); res.setHeader('Content-Length', String(buf.length)); return res.status(200).send(buf); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('Referrer-Policy', 'no-referrer');
  const p = vivo ? (await sql`SELECT tema, roteiro FROM tend_pecas WHERE id=${e.peca_id}`)[0] : null;
  const mb = vivo ? (Number(e.tamanho) / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '';
  return res.status(vivo ? 200 : 404).send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vídeo da reação · Atlantyx</title>
<style>body{margin:0;font-family:Montserrat,Calibri,Arial,sans-serif;background:#0B1226;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
.c{background:#121b36;border:1px solid #23305a;border-radius:14px;padding:26px;max-width:520px;width:100%}h1{font-size:18px;margin:0 0 6px}.s{color:#9fb0d8;font-size:13px}
button{background:#00C4CC;color:#0B1226;border:0;border-radius:8px;padding:12px 18px;font-weight:800;font-size:15px;cursor:pointer;margin-top:18px;width:100%}button:disabled{opacity:.6}
.b{height:8px;background:#23305a;border-radius:4px;margin-top:14px;overflow:hidden}.b i{display:block;height:100%;width:0;background:#00C4CC}video{width:100%;margin-top:14px;border-radius:8px;display:none}</style></head><body><div class="c">
<div class="s" style="letter-spacing:2px;font-weight:700;">ATLANTYX · PODTECNO</div>
${vivo ? `<h1>🎥 ${escH(p?.tema || 'Reação')}</h1><div class="s">${escH(e.nome)} · ${mb} MB · vídeo completo, sem corte</div>
<button id="b" onclick="baixar()">⬇ Baixar o vídeo completo</button><div class="b"><i id="i"></i></div><div class="s" id="m" style="margin-top:8px;"></div><video id="v" controls playsinline></video>
<script>const N=${e.partes},T=${JSON.stringify(e.content_type)},NOME=${JSON.stringify(e.nome)};
async function baixar(){const b=document.getElementById('b');b.disabled=true;const P=[];try{for(let i=0;i<N;i++){document.getElementById('m').textContent='Baixando parte '+(i+1)+' de '+N+'…';
let r;for(let t=0;t<3;t++){r=await fetch(location.pathname+'?baixar=${tok}&parte='+i);if(r.ok)break;await new Promise(x=>setTimeout(x,1500));}if(!r.ok)throw new Error('parte '+(i+1)+' indisponível');
P.push(await r.blob());document.getElementById('i').style.width=Math.round((i+1)/N*100)+'%';}
const f=new Blob(P,{type:T}),u=URL.createObjectURL(f),a=document.createElement('a');a.href=u;a.download=NOME;document.body.appendChild(a);a.click();
const v=document.getElementById('v');v.src=u;v.style.display='block';document.getElementById('m').textContent='✅ Pronto — o arquivo foi salvo em Downloads.';b.textContent='⬇ Baixar de novo';b.disabled=false;}
catch(x){document.getElementById('m').textContent='Erro: '+x.message+'. Tente de novo.';b.disabled=false;}}</script>`
  : `<h1>Link expirado ou inválido</h1><div class="s">Peça um novo link para quem enviou.</div>`}</div></body></html>`);
}

async function handler(req, res) {
  if (req.method === 'GET' && (req.query?.baixar || /[?&]baixar=/.test(String(req.url || '')))) return paginaBaixar(req, res);
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  try {
    const acoes = {
      campanhas: () => campanhas(), campanha_salvar: () => campanhaSalvar(b), campanha_obter: () => campanhaObter(b),
      campanha_excluir: async () => { const sql = await getSql(); await sql`DELETE FROM tend_campanhas WHERE id=${b.id}`; return { ok: true }; },
      buscar_videos: () => buscarVideos(b), video_escolher: () => videoEscolher(b),
      video_adicionar: async () => { const sql = await getSql(); if (!/^https?:\/\//.test(b.url || '')) throw new Error('Informe a URL do vídeo');
        await sql`INSERT INTO tend_videos (id, campanha_id, plataforma, url, titulo, criador, views, resumo, fonte, escolhido) VALUES (${novoId('tdv')}, ${b.campanha_id}, ${b.plataforma || ''}, ${b.url}, ${b.titulo || b.url}, ${b.criador || ''}, ${parseInt(b.views) || null}, ${b.resumo || null}, 'manual', true)`; return { ok: true }; },
      plano_gerar: () => planoGerar(b), roteiros_gerar: () => roteirosGerar(b), peca_salvar: () => pecaSalvar(b),
      envio_iniciar: () => envioIniciar(b), envio_parte: () => envioParte(b), envio_concluir: () => envioConcluir(b, req), produtor_enviar: () => produtorEnviar(b, req),
      peca_excluir: async () => { const sql = await getSql(); await sql`DELETE FROM tend_pecas WHERE id=${b.id}`; return { ok: true }; },
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) { console.error('[tendencias]', b.action, e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'tendencias');
