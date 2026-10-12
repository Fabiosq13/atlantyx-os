import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
// api/atv.js — v3.153 ATLANTYX TV + WEBINARS AO VIVO
//
// ATLANTYX TV (canal contínuo, layout estilo Bloomberg)
//   Playlist circular: reações, entrevistas, vídeos de produto (envio próprio, URL, YouTube ou reação já produzida em S2),
//   intercalada com vinheta de 25 s ("a seguir…"), cotações (dólar, euro, bitcoin, Ibovespa, ações) e últimas notícias
//   escritas pela IA a partir de fontes reais (busca na web, com o veículo citado). Barras laterais e de base com mercados,
//   "a seguir", produtos e serviços da Atlantyx e faixa de mensagens.
//   /atv/<código>                 → player (TV do escritório ou navegador)  · ?modo=transmissao → com som (para o YouTube)
//   GET ?t=<código>&dados=1       → JSON do player · &parte=i&m=<mídia> → parte do vídeo (só mídias da playlist)
//
// WEBINARS (LiveKit — sala privada e transmissão simultânea YouTube · LinkedIn · Instagram)
//   O navegador publica câmera/tela numa sala LiveKit (WebRTC). A sala privada assiste pelo link /ao-vivo/<token>;
//   convidados (entrevistas) entram por /convidado/<token>. "Transmitir" liga um Egress do LiveKit que renderiza o
//   layout Atlantyx TV (/atvl/<código>/<webinar>) e manda por RTMP para os destinos escolhidos.
//   A Atlantyx TV também vai para o YouTube 24 h (ou numa janela de horário) por Web Egress da página do player.
//
// Configuração (Vercel → Environment Variables): LIVEKIT_URL (wss://…), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
// Opcional: BRAPI_TOKEN (mais ações na B3). Chaves de transmissão (YouTube/LinkedIn/Instagram) são digitadas na tela e
// guardadas cifradas — nunca voltam para a tela. Nada é transmitido sem o clique do usuário (ou a janela automática que
// ele ligou). Página pública mostra só conteúdo institucional + cotações + notícias: nada financeiro interno.

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const PARTE_MAX = 3400000; // bytes por parte (base64 cabe no limite de 4,5 MB do corpo da Vercel)
const CFG_PADRAO = {
  codigo: null, criado_em: null, nome: 'Atlantyx TV', slogan: 'Dados, IA e tecnologia para decisões melhores',
  youtube_canal: 'https://www.youtube.com/@atlantyx', playlist: [],
  grade: true, grade_inicio: '2026-10-12T09:00:00Z',
  intercalar: { vinheta: true, vinheta_s: 25, mercado_cada: 2, mercado_s: 15, noticias_cada: 3, noticias_s: 20, produto_cada: 2, produto_s: 12 },
  moedas: ['USD-BRL', 'EUR-BRL', 'BTC-BRL'], acoes: ['^BVSP', 'PETR4', 'VALE3', 'ITUB4'],
  temas_noticias: 'inteligência artificial, dados e analytics, energia, mercado financeiro do Brasil e dos EUA, tecnologia para empresas',
  produtos: [
    { nome: 'Atlantyx OS', frase: 'O sistema operacional de IA da empresa: finanças, vendas, projetos e marketing com agentes' },
    { nome: 'Atlantyx Maestro', frase: 'Gestão inteligente de portfólio de projetos com IA' },
    { nome: 'Atlantyx Sentinel', frase: 'Manutenção industrial inteligente para óleo e gás' },
    { nome: 'ConnEX', frase: 'Matchmaking B2B com IA para câmaras de comércio' },
  ],
  servicos: ['Engenharia de dados e analytics', 'Projetos sob medida de IA', 'Alocação de talentos em tecnologia', 'Dashboards e BI para a diretoria'],
  faixa: ['Inscreva-se: youtube.com/@atlantyx', 'Rio de Janeiro · São Paulo', '17 anos transformando dados em decisões'],
};
const DESTINOS = { youtube: { nome: 'YouTube', rtmp: 'rtmp://a.rtmp.youtube.com/live2' }, linkedin: { nome: 'LinkedIn Live', rtmp: '' }, instagram: { nome: 'Instagram Live', rtmp: '' } };

let _sql = null, _pronto = false;
async function getSql() {
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  if (_pronto) return _sql;
  await _sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS atv_midias (id TEXT PRIMARY KEY, titulo TEXT, nome TEXT, content_type TEXT, tamanho BIGINT, partes INT, completo BOOLEAN DEFAULT false, criado_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS atv_partes (midia_id TEXT, i INT, b64 TEXT, PRIMARY KEY (midia_id, i))`;
  await _sql`CREATE TABLE IF NOT EXISTS atv_webinars (id TEXT PRIMARY KEY, titulo TEXT NOT NULL, descricao TEXT, inicio TIMESTAMPTZ, duracao_min INT DEFAULT 60, status TEXT DEFAULT 'agendado',
    room TEXT, sala_token TEXT UNIQUE, convidado_token TEXT UNIQUE, faixa JSONB DEFAULT '{}'::jsonb, destinos JSONB DEFAULT '[]'::jsonb, egress_id TEXT, ao_vivo_desde TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  _pronto = true; return _sql;
}
async function kv(k, v) {
  const sql = await getSql();
  if (v === undefined) { const r = (await sql`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null; try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; } }
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v;
}
const config = async () => { const c = { ...CFG_PADRAO, ...((await kv('atv:config')) || {}) }; c.intercalar = { ...CFG_PADRAO.intercalar, ...(c.intercalar || {}) }; return c; };
const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const tokenNovo = (n = 24) => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; let s = ''; for (const x of crypto.randomBytes(n)) s += a[x % a.length]; return s; };
const base = () => { const b = process.env.MEDIA_PUBLIC_BASE || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'atlantyx-os.vercel.app'; return (b.startsWith('http') ? b : 'https://' + b).replace(/\/$/, ''); };
const escH = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = v => (v == null || v === '' || isNaN(+v)) ? null : +v;

// ── chaves de transmissão cifradas (AES-256-GCM) ──
function _chave() { const b = process.env.QA_CRIPTO_KEY || process.env.ATX_SESSAO_SEGREDO || process.env.CRON_SECRET || '';
  if (!b) throw new Error('Configure ATX_SESSAO_SEGREDO (ou QA_CRIPTO_KEY) no Vercel para guardar as chaves de transmissão.'); return crypto.createHash('sha256').update('atx-atv-destinos:' + b).digest(); }
function cifrar(t) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', _chave(), iv); const e = Buffer.concat([c.update(String(t), 'utf8'), c.final()]); return [iv, c.getAuthTag(), e].map(x => x.toString('base64')).join('.'); }
function decifrar(s) { const [iv, tag, e] = String(s || '').split('.'); const d = crypto.createDecipheriv('aes-256-gcm', _chave(), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([d.update(Buffer.from(e, 'base64')), d.final()]).toString('utf8'); }
async function destinosStatus() { const d = (await kv('atv:destinos')) || {}; return Object.fromEntries(Object.entries(DESTINOS).map(([k, v]) => [k, { nome: v.nome, configurado: !!d[k]?.chave_c, rtmp: d[k]?.rtmp || v.rtmp, em: d[k]?.em || null }])); }
async function urlsDestinos(lista) { const d = (await kv('atv:destinos')) || {}; const out = [];
  for (const k of lista || []) { const x = d[k]; if (!DESTINOS[k]) continue; if (!x?.chave_c || !x.rtmp) throw new Error(`Configure a chave de transmissão do ${DESTINOS[k].nome} em "Destinos"`);
    out.push(x.rtmp.replace(/\/+$/, '') + '/' + decifrar(x.chave_c)); } return out; }

// ── LiveKit (JWT HS256 + Twirp) ──
const lkOk = () => !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function lkToken(identidade, nome, video, horas = 6) {
  if (!lkOk()) throw new Error('Webinar ao vivo ainda não configurado: crie um projeto no LiveKit Cloud e coloque LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET nas variáveis da Vercel.');
  const agora = Math.floor(Date.now() / 1000), h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ iss: process.env.LIVEKIT_API_KEY, sub: identidade, name: nome || identidade, nbf: agora - 10, exp: agora + horas * 3600, video }));
  return `${h}.${p}.${b64u(crypto.createHmac('sha256', process.env.LIVEKIT_API_SECRET).update(h + '.' + p).digest())}`;
}
const lkHttp = () => String(process.env.LIVEKIT_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
async function lkEgress(metodo, corpo) {
  const tk = lkToken('atx-egress', 'egress', { roomRecord: true }, 1);
  const r = await fetch(lkHttp() + '/twirp/livekit.Egress/' + metodo, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('LiveKit ' + metodo + ': ' + (d.msg || d.message || r.status)); return d;
}
const egressAtivo = st => [0, 1, 'EGRESS_STARTING', 'EGRESS_ACTIVE'].includes(st);
async function egressStatus(id) { if (!id || !lkOk()) return null; try { const d = await lkEgress('ListEgress', { egress_id: id }); const it = (d.items || [])[0]; return it ? { status: it.status, ativo: egressAtivo(it.status), erro: it.error || null } : null; } catch (e) { return { erro: e.message }; } }

// ── IA ──
async function claude(system, content, maxTokens = 2500, tools) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }], ...(tools ? { tools } : {}) }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('IA [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
}
function json(t) { const s = String(t || '').replace(/```json|```/g, ''); const i = s.search(/[{[]/); if (i < 0) throw new Error('A IA não devolveu JSON'); const f = s[i] === '{' ? '}' : ']'; return JSON.parse(s.substring(i, s.lastIndexOf(f) + 1)); }

// ── cotações (AwesomeAPI para moedas, brapi para B3) — cache 5 min ──
const NOME_MOEDA = { 'USD-BRL': 'Dólar', 'EUR-BRL': 'Euro', 'BTC-BRL': 'Bitcoin', 'GBP-BRL': 'Libra', 'USD-BRLT': 'Dólar turismo', 'ETH-BRL': 'Ethereum' };
async function mercado(forcar) {
  const c = await kv('atv:mercado'); if (!forcar && c && Date.now() - Date.parse(c.em) < 5 * 60000) return c;
  const cfg = await config(), out = { em: new Date().toISOString(), moedas: [], acoes: [], erros: [] };
  const comTempo = (u, ms = 8000) => { const a = new AbortController(); const t = setTimeout(() => a.abort(), ms); return fetch(u, { signal: a.signal }).finally(() => clearTimeout(t)); };
  await Promise.all([
    (async () => { try { const m = (cfg.moedas || []).filter(x => /^[A-Z]{3,4}-[A-Z]{3,4}$/.test(x)).slice(0, 8); if (!m.length) return;
      const d = await (await comTempo('https://economia.awesomeapi.com.br/json/last/' + m.join(','))).json();
      out.moedas = m.map(k => { const x = d[k.replace('-', '')]; return x ? { par: k, nome: NOME_MOEDA[k] || k, valor: num(x.bid), var_pct: num(x.pctChange) } : null; }).filter(Boolean); } catch (e) { out.erros.push('moedas: ' + e.message); } })(),
    (async () => { try { const a = (cfg.acoes || []).filter(x => /^[\^A-Z0-9.]{3,10}$/.test(x)).slice(0, 10); if (!a.length) return;
      const d = await (await comTempo('https://brapi.dev/api/quote/' + encodeURIComponent(a.join(',')) + (process.env.BRAPI_TOKEN ? '?token=' + encodeURIComponent(process.env.BRAPI_TOKEN) : ''))).json();
      out.acoes = (d.results || []).map(x => ({ simbolo: x.symbol === '^BVSP' ? 'IBOV' : x.symbol, nome: x.symbol === '^BVSP' ? 'Ibovespa' : String(x.shortName || x.symbol).substring(0, 24), valor: num(x.regularMarketPrice), var_pct: num(x.regularMarketChangePercent) }));
      if (!out.acoes.length && d.message) out.erros.push('ações: ' + d.message); } catch (e) { out.erros.push('ações: ' + e.message); } })(),
  ]);
  if (!out.moedas.length && !out.acoes.length && c) return { ...c, aviso: 'cotações do último cálculo' };
  await kv('atv:mercado', out); return out;
}

// ── notícias escritas pela IA a partir de fontes reais (busca na web) — cache 60 min ──
async function noticias(forcar) {
  const c = await kv('atv:noticias'); if (!forcar && c && Date.now() - Date.parse(c.em) < 60 * 60000) return c;
  const cfg = await config(), hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  try {
    const t = await claude(`Você é o editor da ${cfg.nome}, canal corporativo da Atlantyx (empresa brasileira de IA, dados e analytics). Use a busca na web para achar as notícias MAIS RECENTES (últimas 24-48 h, hoje é ${hoje}) e escreva manchetes curtas em português do Brasil.
Regras: só fatos que estão nas fontes — nunca invente número, empresa ou citação; cite o veículo; nada de política partidária, tragédia ou fofoca; tom de canal de negócios (estilo Bloomberg).
Responda SOMENTE JSON: {"itens":[{"titulo":"manchete até 90 caracteres","resumo":"1 frase até 160 caracteres","fonte":"veículo","url":"https://...","tema":"IA|dados|energia|mercado|tecnologia"}]} com 8 a 10 itens.`,
      `Temas: ${cfg.temas_noticias}.`, 3000, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }]);
    const itens = (json(t).itens || []).filter(x => x.titulo && x.fonte).slice(0, 12).map(x => ({ titulo: String(x.titulo).substring(0, 110), resumo: String(x.resumo || '').substring(0, 200), fonte: String(x.fonte).substring(0, 40), url: /^https?:\/\//.test(x.url || '') ? x.url : null, tema: x.tema || null }));
    if (!itens.length) throw new Error('nenhuma notícia encontrada');
    return await kv('atv:noticias', { em: new Date().toISOString(), itens });
  } catch (e) { if (c) return { ...c, aviso: 'notícias da última atualização (' + e.message + ')' }; return { em: new Date().toISOString(), itens: [], erro: e.message }; }
}

// ── chamadas da vinheta ("a seguir…") escritas pela IA ──
async function chamadasGerar() {
  const cfg = await config(), P = cfg.playlist || [], alvo = P.filter(x => x.tipo === 'video' && !x.chamada);
  if (!alvo.length) return { geradas: 0 };
  let res = {};
  try { const t = await claude(`Você escreve as chamadas da vinheta da ${cfg.nome} (canal da Atlantyx). Para cada vídeo, uma chamada de até 130 caracteres, em português, que dê vontade de assistir, sem exagero e sem inventar fatos que o título não diz. Responda SOMENTE JSON {"chamadas":{"<id>":"texto"}}.`,
      JSON.stringify(alvo.map(x => ({ id: x.id, titulo: x.titulo, subtitulo: x.subtitulo || '' }))), 1500); res = json(t).chamadas || {}; }
  catch (_) {}
  cfg.playlist = P.map(x => alvo.find(a => a.id === x.id) ? { ...x, chamada: String(res[x.id] || x.subtitulo || 'Assista agora na ' + cfg.nome).substring(0, 160) } : x);
  await kv('atv:config', cfg); return { geradas: alvo.length, playlist: cfg.playlist };
}

// ── mídias (envio em partes) ──
async function midiaIniciar(b) {
  const sql = await getSql(), tam = parseInt(b.tamanho) || 0, partes = parseInt(b.partes) || 0;
  if (!/^video\//.test(b.content_type || '')) throw new Error('Envie um arquivo de vídeo (mp4, webm ou mov)');
  if (tam <= 0 || partes <= 0 || partes > 600 || Math.ceil(tam / PARTE_MAX) > partes + 1) throw new Error('Tamanho ou número de partes inválido (máximo ~2 GB)');
  const id = novoId('atm'); await sql`INSERT INTO atv_midias (id, titulo, nome, content_type, tamanho, partes) VALUES (${id}, ${String(b.titulo || b.nome || 'Vídeo').substring(0, 160)}, ${String(b.nome || 'video').substring(0, 160)}, ${b.content_type}, ${tam}, ${partes})`;
  return { id, parte_max: PARTE_MAX };
}
async function midiaParte(b) {
  const sql = await getSql(), m = (await sql`SELECT * FROM atv_midias WHERE id=${b.id}`)[0]; if (!m) throw new Error('Envio não encontrado');
  const i = parseInt(b.i); if (!(i >= 0 && i < m.partes)) throw new Error('Parte inválida'); const s = String(b.b64 || ''); if (!s || s.length > PARTE_MAX * 1.4) throw new Error('Parte vazia ou grande demais');
  await sql`INSERT INTO atv_partes (midia_id, i, b64) VALUES (${m.id}, ${i}, ${s}) ON CONFLICT (midia_id, i) DO UPDATE SET b64 = EXCLUDED.b64`; return { ok: true };
}
async function midiaConcluir(b) {
  const sql = await getSql(), m = (await sql`SELECT * FROM atv_midias WHERE id=${b.id}`)[0]; if (!m) throw new Error('Envio não encontrado');
  const n = (await sql`SELECT COUNT(*)::int AS n FROM atv_partes WHERE midia_id=${m.id}`)[0].n; if (n !== m.partes) throw new Error(`Faltam partes (${n} de ${m.partes}) — envie de novo`);
  await sql`UPDATE atv_midias SET completo=true WHERE id=${m.id}`; return { ok: true, midia: { id: m.id, titulo: m.titulo, tamanho: Number(m.tamanho), partes: m.partes } };
}
// reações produzidas em S2 · Reação a Tendências (Reel 9:16 hospedado e/ou vídeo completo enviado ao Podtecno)
async function reacoes() {
  const sql = await getSql();
  try { const r = (await sql`SELECT p.id, p.tema, p.midia_urls, p.roteiro, p.atualizado_em FROM tend_pecas p ORDER BY p.atualizado_em DESC LIMIT 200`)
      .filter(p => (Array.isArray(p.midia_urls) && p.midia_urls.length) || p.roteiro?.video_completo?.envio_id || p.roteiro?.video_proprio).slice(0, 40);
    return r.map(p => ({ peca_id: p.id, titulo: String(p.tema || 'Reação').substring(0, 160), reel_url: (p.midia_urls || [])[0] || p.roteiro?.video_proprio || null, envio_id: p.roteiro?.video_completo?.envio_id || null })); }
  catch (_) { return []; }
}

// ── dados do player (público por código) ──
async function dadosPlayer(cfg) {
  const sql = await getSql(); const P = (cfg.playlist || []).filter(x => x.ativo !== false);
  const ids = P.filter(x => x.fonte === 'upload' && x.midia_id).map(x => x.midia_id), envs = P.filter(x => x.envio_id).map(x => x.envio_id);
  const M = ids.length ? Object.fromEntries((await sql`SELECT id, content_type, partes FROM atv_midias WHERE id = ANY(${ids}) AND completo`).map(m => [m.id, m])) : {};
  let E = {}; try { if (envs.length) E = Object.fromEntries((await sql`SELECT id, content_type, partes FROM tend_envios WHERE id = ANY(${envs}) AND completo`).map(m => [m.id, m])); } catch (_) {}
  const playlist = P.map(x => {
    const it = { id: x.id, tipo: 'video', titulo: x.titulo, subtitulo: x.subtitulo || '', chamada: x.chamada || '', categoria: x.categoria || '', dur: x.duracao_s || null };
    if (x.fonte === 'youtube' && /^[\w-]{11}$/.test(x.youtube_id || '')) return { ...it, youtube_id: x.youtube_id };
    if (x.fonte === 'upload' && M[x.midia_id]) return { ...it, partes: M[x.midia_id].partes, ct: M[x.midia_id].content_type, m: x.midia_id };
    if (x.envio_id && E[x.envio_id]) return { ...it, partes: E[x.envio_id].partes, ct: E[x.envio_id].content_type, e: x.envio_id };
    if (/^https?:\/\//.test(x.url || '')) return { ...it, url: x.url };
    return null;
  }).filter(Boolean);
  const [mk, nt] = await Promise.all([mercado(false).catch(e => ({ erros: [e.message] })), noticias(false).catch(e => ({ itens: [], erro: e.message }))]);
  return { nome: cfg.nome, slogan: cfg.slogan, canal: cfg.youtube_canal, intercalar: cfg.intercalar, grade: cfg.grade !== false, grade_inicio: cfg.grade_inicio, agora: Date.now(), playlist, produtos: cfg.produtos || [], servicos: cfg.servicos || [], faixa: cfg.faixa || [],
    mercado: { em: mk.em, moedas: mk.moedas || [], acoes: mk.acoes || [] }, noticias: (nt.itens || []).map(x => ({ titulo: x.titulo, resumo: x.resumo, fonte: x.fonte })), gerado_em: new Date().toISOString() };
}
async function parteBin(cfg, q, res) {
  const sql = await getSql(), P = cfg.playlist || [], i = parseInt(q.parte) || 0; let r = null;
  if (q.m && P.some(x => x.midia_id === q.m)) r = (await sql`SELECT b64 FROM atv_partes WHERE midia_id=${q.m} AND i=${i}`)[0];
  else if (q.e && P.some(x => x.envio_id === q.e)) { try { r = (await sql`SELECT b64 FROM tend_envio_partes WHERE envio_id=${q.e} AND i=${i}`)[0]; } catch (_) {} }
  if (!r) return res.status(404).end();
  const buf = Buffer.from(r.b64, 'base64'); res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Cache-Control', 'private, max-age=86400'); res.setHeader('Content-Length', String(buf.length)); return res.status(200).send(buf);
}

// ── webinars ──
const WB_STATUS = ['agendado', 'aberto', 'ao_vivo', 'encerrado'];
async function webinars() { const sql = await getSql(); return (await sql`SELECT * FROM atv_webinars ORDER BY COALESCE(inicio, criado_em) DESC LIMIT 60`).map(w => ({ ...w, link_sala: base() + '/ao-vivo/' + w.sala_token, link_convidado: base() + '/convidado/' + w.convidado_token })); }
async function webinarSalvar(b) {
  const sql = await getSql(), t = String(b.titulo || '').trim(); if (t.length < 3) throw new Error('Dê um título ao webinar');
  const ini = b.inicio ? new Date(b.inicio) : null; if (ini && isNaN(ini)) throw new Error('Data e hora inválidas');
  const dur = Math.max(10, Math.min(600, parseInt(b.duracao_min) || 60)), fx = { titulo: String(b.faixa?.titulo || t).substring(0, 90), subtitulo: String(b.faixa?.subtitulo || b.descricao || '').substring(0, 140) };
  if (b.id) { await sql`UPDATE atv_webinars SET titulo=${t.substring(0, 200)}, descricao=${String(b.descricao || '').substring(0, 2000)}, inicio=${ini}, duracao_min=${dur}, faixa=${JSON.stringify(fx)}, atualizado_em=NOW() WHERE id=${b.id}`; return { id: b.id }; }
  const id = novoId('web'); await sql`INSERT INTO atv_webinars (id, titulo, descricao, inicio, duracao_min, room, sala_token, convidado_token, faixa) VALUES (${id}, ${t.substring(0, 200)}, ${String(b.descricao || '').substring(0, 2000)}, ${ini}, ${dur}, ${'atx-' + id}, ${tokenNovo(24)}, ${tokenNovo(24)}, ${JSON.stringify(fx)})`;
  return { id };
}
async function webinarTokenHost(b) {
  const sql = await getSql(), w = (await sql`SELECT * FROM atv_webinars WHERE id=${b.id}`)[0]; if (!w) throw new Error('Webinar não encontrado');
  if (w.status === 'agendado') await sql`UPDATE atv_webinars SET status='aberto', atualizado_em=NOW() WHERE id=${w.id}`;
  const host = lkToken('host-' + crypto.randomBytes(3).toString('hex'), b.nome || 'Fabio Quintanilha · Atlantyx', { room: w.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: true });
  const prev = lkToken('previa-' + crypto.randomBytes(3).toString('hex'), 'prévia', { room: w.room, roomJoin: true, canPublish: false, canSubscribe: true, hidden: true });
  const cfg = await config(); return { url: process.env.LIVEKIT_URL, token: host, room: w.room, previa: cfg.codigo ? `${base()}/atvl/${cfg.codigo}/${w.id}?url=${encodeURIComponent(process.env.LIVEKIT_URL)}&token=${encodeURIComponent(prev)}&previa=1` : null };
}
async function webinarTransmitir(b) {
  const sql = await getSql(), w = (await sql`SELECT * FROM atv_webinars WHERE id=${b.id}`)[0]; if (!w) throw new Error('Webinar não encontrado');
  const cfg = await config(); if (!cfg.codigo) throw new Error('Gere primeiro o link da Atlantyx TV (aba Atlantyx TV) — o layout da transmissão usa esse código');
  const dest = (b.destinos || []).filter(k => DESTINOS[k]); if (!dest.length) throw new Error('Escolha pelo menos um destino (YouTube, LinkedIn ou Instagram) — a sala privada já funciona sem transmitir');
  const st = await egressStatus(w.egress_id); if (st?.ativo) throw new Error('A transmissão já está no ar — pare antes de trocar os destinos');
  const urls = await urlsDestinos(dest);
  const d = await lkEgress('StartRoomCompositeEgress', { room_name: w.room, layout: 'atlantyx', custom_base_url: `${base()}/atvl/${cfg.codigo}/${w.id}`, stream_outputs: [{ protocol: 'RTMP', urls }] });
  await sql`UPDATE atv_webinars SET status='ao_vivo', egress_id=${d.egress_id || d.egressId || null}, destinos=${JSON.stringify(dest)}, ao_vivo_desde=NOW(), atualizado_em=NOW() WHERE id=${w.id}`;
  return { egress_id: d.egress_id || d.egressId || null, destinos: dest };
}
async function webinarParar(b) {
  const sql = await getSql(), w = (await sql`SELECT * FROM atv_webinars WHERE id=${b.id}`)[0]; if (!w) throw new Error('Webinar não encontrado');
  if (w.egress_id) { try { await lkEgress('StopEgress', { egress_id: w.egress_id }); } catch (e) { if (!/not found|ended|complete/i.test(e.message)) throw e; } }
  const fim = !!b.encerrar; await sql`UPDATE atv_webinars SET status=${fim ? 'encerrado' : 'aberto'}, egress_id=NULL, atualizado_em=NOW() WHERE id=${w.id}`; return { ok: true, status: fim ? 'encerrado' : 'aberto' };
}

// ── Atlantyx TV no YouTube (Web Egress da página do player) ──
async function tvTransmitir(b) {
  const cfg = await config(); if (!cfg.codigo) throw new Error('Gere primeiro o link da Atlantyx TV');
  const dest = (b.destinos || ['youtube']).filter(k => DESTINOS[k]); const urls = await urlsDestinos(dest);
  const t = (await kv('atv:transmissao')) || {}; const st = await egressStatus(t.egress_id); if (st?.ativo) return { ja_no_ar: true, egress_id: t.egress_id };
  const d = await lkEgress('StartWebEgress', { url: `${base()}/atv/${cfg.codigo}?modo=transmissao`, stream_outputs: [{ protocol: 'RTMP', urls }] });
  await kv('atv:transmissao', { ...t, egress_id: d.egress_id || d.egressId || null, desde: new Date().toISOString(), destinos: dest }); return { egress_id: d.egress_id || d.egressId || null };
}
async function tvParar() { const t = (await kv('atv:transmissao')) || {}; if (t.egress_id) { try { await lkEgress('StopEgress', { egress_id: t.egress_id }); } catch (_) {} } await kv('atv:transmissao', { ...t, egress_id: null, desde: null }); return { ok: true }; }
function dentroJanela(j) { if (!j?.auto) return null; const a = new Date(Date.now() - 3 * 3600000), d = a.getUTCDay(), hm = a.toISOString().substring(11, 16);
  return (j.dias || [1, 2, 3, 4, 5]).includes(d) && hm >= (j.inicio || '08:00') && hm < (j.fim || '20:00'); }
async function ciclo() { // cron de hora em hora: notícias novas + janela automática da TV no YouTube
  const out = {}; try { out.noticias = (await noticias(true)).itens?.length || 0; } catch (e) { out.noticias_erro = e.message; }
  try { await mercado(true); } catch (_) {}
  const t = (await kv('atv:transmissao')) || {}, dentro = dentroJanela(t.janela);
  if (dentro !== null && lkOk()) { const st = await egressStatus(t.egress_id);
    try { if (dentro && !st?.ativo) out.tv = (await tvTransmitir({ destinos: t.destinos || ['youtube'] })) && 'ligada'; else if (!dentro && st?.ativo) { await tvParar(); out.tv = 'desligada'; } } catch (e) { out.tv_erro = e.message; } }
  return out;
}

// ── v3.154: CANAL DO YOUTUBE (OAuth do Google) — publicar vídeos direto numa playlist do canal ──
// Configuração: Google Cloud → projeto → YouTube Data API v3 ativada → credencial OAuth "Aplicativo da Web" com o URI de
// redirecionamento <base>/atv-youtube-retorno → GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas variáveis da Vercel.
// O fundador clica em "Conectar o canal" e autoriza com a conta do canal — nenhuma senha passa pelo sistema; o token
// de renovação fica cifrado. Envio "retomável" do YouTube em blocos de 24 MB (vários passos, sem estourar o tempo da função).
const YT_ESCOPOS = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';
const YT_BLOCO = 96 * 262144; // 24 MB — múltiplo de 256 KB, exigido pelo envio retomável
const ytOk = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const ytRetorno = () => base() + '/atv-youtube-retorno';
async function ytAuthUrl() {
  if (!ytOk()) throw new Error('Falta configurar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na Vercel (projeto no Google Cloud com a YouTube Data API v3).');
  const state = tokenNovo(32); await kv('atv:yt_state', { state, em: Date.now() });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: ytRetorno(), response_type: 'code', scope: YT_ESCOPOS,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
}
async function ytTokenReq(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Google: ' + (d.error_description || d.error || r.status)); return d;
}
let _ytAcc = null;
async function ytAcesso() {
  if (_ytAcc && _ytAcc.exp > Date.now() + 60000) return _ytAcc.tk;
  const y = await kv('atv:youtube'); if (!y?.refresh_c) throw new Error('Conecte o canal do YouTube primeiro (aba Canal do YouTube)');
  const d = await ytTokenReq({ grant_type: 'refresh_token', refresh_token: decifrar(y.refresh_c) }); _ytAcc = { tk: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 }; return _ytAcc.tk;
}
async function ytApi(caminho, { method = 'GET', body, query } = {}) {
  const tk = await ytAcesso(), u = 'https://www.googleapis.com/youtube/v3/' + caminho + (query ? '?' + new URLSearchParams(query) : '');
  const r = await fetch(u, { method, headers: { Authorization: 'Bearer ' + tk, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('YouTube: ' + (d.error?.message || r.status)); return d;
}
async function ytRetornoPagina(q, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  const fim = (ok, msg) => res.status(ok ? 200 : 400).send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Canal do YouTube · Atlantyx</title></head>
<body style="margin:0;background:#0B1226;color:#EAF0FF;font-family:Montserrat,Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px;box-sizing:border-box">
<div><div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h2>${escH(msg)}</h2><p style="color:#9fb0d8">${ok ? 'Pode fechar esta aba e voltar ao Atlantyx OS.' : 'Volte ao Atlantyx OS e tente conectar de novo.'}</p></div>
<script>try{window.opener&&window.opener.postMessage({atvYoutube:${ok ? 'true' : 'false'}},'*')}catch(e){}${ok ? 'setTimeout(function(){window.close()},2500)' : ''}</script></body></html>`);
  try {
    const st = await kv('atv:yt_state'); if (!st || st.state !== q.state || Date.now() - st.em > 15 * 60000) return fim(false, 'Pedido expirado ou inválido');
    await kv('atv:yt_state', { state: null, em: 0 });
    if (q.error) return fim(false, 'Autorização cancelada no Google');
    const d = await ytTokenReq({ grant_type: 'authorization_code', code: String(q.code || ''), redirect_uri: ytRetorno() });
    if (!d.refresh_token) return fim(false, 'O Google não devolveu a permissão permanente — remova o acesso do app na conta Google e conecte de novo');
    _ytAcc = { tk: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
    let canal = null; try { const c = await ytApi('channels', { query: { part: 'snippet', mine: 'true' } }); const it = (c.items || [])[0]; if (it) canal = { id: it.id, titulo: it.snippet?.title, url: 'https://www.youtube.com/channel/' + it.id }; } catch (_) {}
    await kv('atv:youtube', { refresh_c: cifrar(d.refresh_token), canal, conectado_em: new Date().toISOString() });
    return fim(true, 'Canal ' + (canal?.titulo ? '"' + canal.titulo + '" ' : '') + 'conectado');
  } catch (e) { return fim(false, e.message); }
}
async function ytStatus() { const y = await kv('atv:youtube'); return { configurado: ytOk(), conectado: !!y?.refresh_c, canal: y?.canal || null, conectado_em: y?.conectado_em || null, retorno: ytRetorno() }; }
async function ytPlaylists() { const d = await ytApi('playlists', { query: { part: 'snippet,status,contentDetails', mine: 'true', maxResults: '50' } });
  return (d.items || []).map(p => ({ id: p.id, titulo: p.snippet?.title, privacidade: p.status?.privacyStatus, videos: p.contentDetails?.itemCount })); }
async function ytPlaylistCriar(b) { const t = String(b.titulo || '').trim(); if (t.length < 2) throw new Error('Dê um nome à playlist');
  const p = await ytApi('playlists', { method: 'POST', query: { part: 'snippet,status' }, body: { snippet: { title: t.substring(0, 150), description: String(b.descricao || '').substring(0, 5000) }, status: { privacyStatus: ['public', 'unlisted', 'private'].includes(b.privacidade) ? b.privacidade : 'public' } } });
  return { playlist: { id: p.id, titulo: p.snippet?.title } }; }
async function ytAddPlaylist(playlistId, videoId) { if (!playlistId) return null; return ytApi('playlistItems', { method: 'POST', query: { part: 'snippet' }, body: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } } }); }
async function ytDescricao(b) {
  const cfg = await config(), it = (cfg.playlist || []).find(x => x.id === b.item_id); if (!it) throw new Error('Vídeo não está na playlist');
  try { const t = await claude(`Você escreve título e descrição de vídeo do YouTube para o canal da Atlantyx (empresa brasileira de IA, dados e analytics). Português do Brasil, tom profissional e direto, sem clickbait e sem inventar fatos além do que foi dado. Descrição: 2 parágrafos curtos + 3 a 5 hashtags no fim. Responda SOMENTE JSON {"titulo":"até 90 caracteres","descricao":"...","tags":["..."]}.`,
      JSON.stringify({ titulo: it.titulo, subtitulo: it.subtitulo, chamada: it.chamada, categoria: it.categoria, canal: cfg.nome, slogan: cfg.slogan, produtos: (cfg.produtos || []).map(p => p.nome) }), 1200);
    const j = json(t); return { titulo: String(j.titulo || it.titulo).substring(0, 100), descricao: String(j.descricao || '').substring(0, 4800), tags: (j.tags || []).slice(0, 12).map(s => String(s).substring(0, 30)) }; }
  catch (_) { return { titulo: it.titulo, descricao: [it.subtitulo, it.chamada, cfg.slogan].filter(Boolean).join('\n\n'), tags: ['Atlantyx', 'IA', 'dados'] }; }
}
// fonte do vídeo para o envio: partes no banco (envio próprio ou reação completa) ou URL pública com Range
async function ytFonte(it) {
  const sql = await getSql();
  if (it.fonte === 'upload' && it.midia_id) { const m = (await sql`SELECT tamanho, partes, content_type FROM atv_midias WHERE id=${it.midia_id} AND completo`)[0]; if (!m) throw new Error('Vídeo enviado não encontrado');
    return { tipo: 'partes', tabela: 'atv', id: it.midia_id, tamanho: Number(m.tamanho), ct: m.content_type || 'video/mp4' }; }
  if (it.envio_id) { const m = (await sql`SELECT tamanho, partes, content_type FROM tend_envios WHERE id=${it.envio_id} AND completo`)[0]; if (!m) throw new Error('Vídeo da reação não encontrado');
    return { tipo: 'partes', tabela: 'tend', id: it.envio_id, tamanho: Number(m.tamanho), ct: m.content_type || 'video/mp4' }; }
  if (/^https?:\/\//.test(it.url || '')) { const r = await fetch(it.url, { method: 'HEAD' }); const n = parseInt(r.headers.get('content-length')) || 0; if (!r.ok || !n) throw new Error('Não consegui ler o tamanho do vídeo do link');
    return { tipo: 'url', url: it.url, tamanho: n, ct: (r.headers.get('content-type') || 'video/mp4').split(';')[0] }; }
  throw new Error('Este item não tem arquivo de vídeo para enviar');
}
async function ytLerFaixa(f, ini, fim) { // bytes [ini, fim] (inclusive)
  if (f.tipo === 'url') { const r = await fetch(f.url, { headers: { Range: `bytes=${ini}-${fim}` } }); if (!(r.status === 206 || r.status === 200)) throw new Error('Falha ao ler o vídeo (' + r.status + ')');
    let b = Buffer.from(await r.arrayBuffer()); if (r.status === 200) b = b.subarray(ini, fim + 1); return b; }
  const sql = await getSql(), p0 = Math.floor(ini / PARTE_MAX), p1 = Math.floor(fim / PARTE_MAX), bufs = [];
  for (let i = p0; i <= p1; i++) { const r = f.tabela === 'atv' ? (await sql`SELECT b64 FROM atv_partes WHERE midia_id=${f.id} AND i=${i}`)[0] : (await sql`SELECT b64 FROM tend_envio_partes WHERE envio_id=${f.id} AND i=${i}`)[0];
    if (!r) throw new Error('Parte ' + i + ' do vídeo não encontrada'); bufs.push(Buffer.from(r.b64, 'base64')); }
  const tudo = Buffer.concat(bufs), base0 = p0 * PARTE_MAX; return tudo.subarray(ini - base0, fim - base0 + 1);
}
async function ytPublicarIniciar(b) {
  const cfg = await config(), it = (cfg.playlist || []).find(x => x.id === b.item_id); if (!it) throw new Error('Vídeo não está na playlist');
  const priv = ['public', 'unlisted', 'private'].includes(b.privacidade) ? b.privacidade : 'public';
  let publishAt = null; if (b.agendar) { const d = new Date(b.agendar); if (isNaN(d) || d < Date.now() + 15 * 60000) throw new Error('Agende para pelo menos 15 minutos à frente'); publishAt = d.toISOString(); }
  const job = { id: novoId('ytj'), item_id: it.id, playlist_id: b.playlist_id || null, criado_em: new Date().toISOString() };
  if (it.fonte === 'youtube' && it.youtube_id) { await ytAddPlaylist(job.playlist_id, it.youtube_id); return { pronto: true, video_id: it.youtube_id, so_playlist: true }; }
  const f = await ytFonte(it);
  const meta = { snippet: { title: String(b.titulo || it.titulo).substring(0, 100), description: String(b.descricao || '').substring(0, 4900), tags: Array.isArray(b.tags) ? b.tags.slice(0, 12) : [], categoryId: '28', defaultLanguage: 'pt-BR', defaultAudioLanguage: 'pt-BR' },
    status: { privacyStatus: publishAt ? 'private' : priv, ...(publishAt ? { publishAt } : {}), selfDeclaredMadeForKids: false } };
  const tk = await ytAcesso();
  const r = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST',
    headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(f.tamanho), 'X-Upload-Content-Type': f.ct }, body: JSON.stringify(meta) });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error('YouTube: ' + (d.error?.message || r.status)); }
  const loc = r.headers.get('location'); if (!loc) throw new Error('O YouTube não abriu a sessão de envio');
  Object.assign(job, { fonte: f, sessao: loc, offset: 0, tamanho: f.tamanho, privacidade: publishAt ? 'agendado' : priv, publishAt });
  await kv('atv:ytjob:' + job.id, job); return { job_id: job.id, tamanho: f.tamanho, offset: 0 };
}
async function ytPublicarPasso(b) {
  const job = await kv('atv:ytjob:' + b.job_id); if (!job?.sessao) throw new Error('Envio não encontrado — comece de novo');
  if (job.video_id) return { pronto: true, video_id: job.video_id };
  const tk = await ytAcesso(), ini = job.offset, fim = Math.min(job.tamanho - 1, ini + YT_BLOCO - 1);
  const pedaco = await ytLerFaixa(job.fonte, ini, fim);
  const r = await fetch(job.sessao, { method: 'PUT', headers: { Authorization: 'Bearer ' + tk, 'Content-Length': String(pedaco.length), 'Content-Range': `bytes ${ini}-${fim}/${job.tamanho}` }, body: pedaco });
  if (r.status === 308) { const rg = r.headers.get('range'); job.offset = rg ? parseInt(rg.split('-')[1]) + 1 : fim + 1; await kv('atv:ytjob:' + job.id, job); return { offset: job.offset, tamanho: job.tamanho }; }
  const d = await r.json().catch(() => ({})); if (!(r.status === 200 || r.status === 201) || !d.id) throw new Error('YouTube: ' + (d.error?.message || r.status));
  job.video_id = d.id; job.offset = job.tamanho; await kv('atv:ytjob:' + job.id, job);
  let aviso = null; try { await ytAddPlaylist(job.playlist_id, d.id); } catch (e) { aviso = 'vídeo enviado, mas não entrou na playlist: ' + e.message; }
  const cfg = await config(); cfg.playlist = (cfg.playlist || []).map(x => x.id === job.item_id ? { ...x, yt_video_id: d.id, yt_publicado_em: new Date().toISOString(), yt_privacidade: job.privacidade } : x); await kv('atv:config', cfg);
  return { pronto: true, video_id: d.id, url: 'https://youtu.be/' + d.id, aviso };
}

// ── páginas públicas (shells; o render fica em /atv-player.js) ──
const LK_CDN = 'https://cdn.jsdelivr.net/npm/livekit-client@2.15.0/dist/livekit-client.umd.js';
function shell(titulo, cfgJs, comLk) {
  const v = encodeURIComponent(process.env.VERCEL_GIT_COMMIT_SHA || Date.now());
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escH(titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>html,body{margin:0;height:100%;background:#000;color:#EAF0FF;font-family:Montserrat,Calibri,Arial,sans-serif;overflow:hidden}</style></head><body><div id="atv"></div>
<script>window.ATV_CFG=${JSON.stringify(cfgJs).replace(/</g, '\\u003c')};</script>${comLk ? `<script src="${LK_CDN}"></script>` : ''}<script src="/atv-player.js?v=${v}"></script></body></html>`;
}
const paginaErro = m => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlantyx TV</title></head><body style="margin:0;background:#000;color:#EAF0FF;font-family:Montserrat,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:20px;box-sizing:border-box"><div><div style="font-weight:800;letter-spacing:6px;font-size:22px">ATLANTYX <span style="color:#00C4CC">TV</span></div><p style="color:#8E9BC0">${m}</p></div></body></html>`;

async function publico(req, res, q) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('Referrer-Policy', 'no-referrer');
  const html = (s, h) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.status(s).send(h); };
  // sala privada (público do webinar) e convidado (entrevista)
  if (q.sala || q.convidado) {
    const tok = String(q.sala || q.convidado), sql = await getSql(); if (!/^[A-Za-z0-9]{20,40}$/.test(tok)) return html(404, paginaErro('Link inválido.'));
    const w = (q.sala ? await sql`SELECT * FROM atv_webinars WHERE sala_token=${tok}` : await sql`SELECT * FROM atv_webinars WHERE convidado_token=${tok}`)[0];
    if (!w || w.status === 'encerrado') return html(404, paginaErro(w ? 'Este webinar já foi encerrado. Obrigado pela audiência!' : 'Link inválido ou expirado.'));
    const cfg = await config();
    if (q.tk) { // token LiveKit (ao entrar)
      if (!lkOk()) return res.status(503).json({ success: false, error: 'Transmissão ainda não configurada pela Atlantyx' });
      const nome = String(q.nome || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().substring(0, 50) || (q.sala ? 'Participante' : 'Convidado');
      const id = (q.sala ? 'pub-' : 'conv-') + crypto.randomBytes(4).toString('hex');
      const token = lkToken(id, nome, q.sala ? { room: w.room, roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: true } : { room: w.room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true }, 6);
      return res.status(200).json({ success: true, url: process.env.LIVEKIT_URL, token });
    }
    if (q.dados) { const d = await dadosPlayer(cfg); return res.status(200).json({ success: true, dados: { ...d, playlist: [], webinar: { titulo: w.titulo, descricao: w.descricao, faixa: w.faixa, status: w.status, inicio: w.inicio } } }); }
    return html(200, shell(w.titulo + ' · Atlantyx TV', { modo: q.sala ? 'sala' : 'convidado', tok, webinar: { titulo: w.titulo, inicio: w.inicio, status: w.status } }, true));
  }
  const cfg = await config(), cod = String(q.t || ''), valido = !!cfg.codigo && cod.length === cfg.codigo.length && crypto.timingSafeEqual(Buffer.from(cod), Buffer.from(cfg.codigo));
  if (!valido) return q.dados || q.parte != null ? res.status(404).json({ success: false, error: 'Link da Atlantyx TV inválido ou revogado' }) : html(404, paginaErro('Este link da Atlantyx TV foi revogado ou não existe.'));
  if (q.parte != null) return parteBin(cfg, q, res);
  if (q.layout) { // template do Egress do webinar (e prévia no estúdio): conecta na sala com ?url=&token=
    const sql = await getSql(), w = (await sql`SELECT id, titulo, faixa, status FROM atv_webinars WHERE id=${String(q.layout)}`)[0]; if (!w) return html(404, paginaErro('Webinar não encontrado.'));
    if (q.dados) { const d = await dadosPlayer(cfg); return res.status(200).json({ success: true, dados: { ...d, playlist: [], webinar: { titulo: w.titulo, faixa: w.faixa, status: w.status } } }); }
    return html(200, shell('Atlantyx TV · ao vivo', { modo: 'layout', cod, webinar_id: w.id, lk_url: q.url || null, lk_token: q.token || null, previa: !!q.previa }, true));
  }
  if (q.dados) return res.status(200).json({ success: true, dados: await dadosPlayer(cfg) });
  return html(200, shell(cfg.nome, { modo: 'tv', cod, transmissao: q.modo === 'transmissao' }, false));
}

async function handler(req, res) {
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (req.method === 'GET' && q.cron) return res.status(200).json({ success: true, ...(await ciclo()) });
    if (req.method === 'GET' && q.yt_cb) return ytRetornoPagina(q, res);
    if (req.method === 'GET') return publico(req, res, q);
    const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const acoes = {
      inicio: async () => { const cfg = await config(), sql = await getSql();
        const midias = (await sql`SELECT id, titulo, nome, tamanho, partes, completo, criado_em FROM atv_midias ORDER BY criado_em DESC LIMIT 80`).map(m => ({ ...m, tamanho: Number(m.tamanho) }));
        const t = (await kv('atv:transmissao')) || {};
        return { config: { ...cfg, link: cfg.codigo ? base() + '/atv/' + cfg.codigo : null }, midias, reacoes: await reacoes(), livekit: lkOk(), destinos: await destinosStatus(),
          youtube: await ytStatus(), webinars: await webinars(), transmissao: { ...t, status: await egressStatus(t.egress_id) }, mercado: await kv('atv:mercado'), noticias: await kv('atv:noticias'), brapi_token: !!process.env.BRAPI_TOKEN }; },
      gerar_link: async () => { const c = await config(); c.codigo = tokenNovo(14); c.criado_em = new Date().toISOString(); await kv('atv:config', c); return { link: base() + '/atv/' + c.codigo }; },
      revogar_link: async () => { const c = await config(); c.codigo = null; c.criado_em = null; await kv('atv:config', c); try { await tvParar(); } catch (_) {} return { ok: true }; },
      salvar: async () => { const c = await config(), x = b.config || {};
        const P = Array.isArray(x.playlist) ? x.playlist.slice(0, 200).map(i => ({ id: i.id || novoId('it'), tipo: 'video', fonte: ['upload', 'youtube', 'url', 'reacao'].includes(i.fonte) ? i.fonte : 'url',
          titulo: String(i.titulo || 'Sem título').substring(0, 120), subtitulo: String(i.subtitulo || '').substring(0, 160), chamada: String(i.chamada || '').substring(0, 160), categoria: String(i.categoria || '').substring(0, 40),
          midia_id: i.midia_id || null, youtube_id: i.youtube_id || null, duracao_s: Math.max(0, Math.min(6 * 3600, Math.round(Number(i.duracao_s) || 0))) || null, yt_video_id: i.yt_video_id || null, yt_publicado_em: i.yt_publicado_em || null, yt_privacidade: i.yt_privacidade || null, url: /^https?:\/\//.test(i.url || '') ? i.url : null, envio_id: i.envio_id || null, peca_id: i.peca_id || null, ativo: i.ativo !== false })) : c.playlist;
        const lst = (v, n, m) => Array.isArray(v) ? v.map(s => String(s).trim()).filter(Boolean).slice(0, n).map(s => s.substring(0, m)) : null;
        const n = { ...c, playlist: P, nome: String(x.nome || c.nome).substring(0, 40), slogan: String(x.slogan ?? c.slogan).substring(0, 90), youtube_canal: String(x.youtube_canal ?? c.youtube_canal).substring(0, 200),
          temas_noticias: String(x.temas_noticias ?? c.temas_noticias).substring(0, 400), moedas: lst(x.moedas, 8, 10) || c.moedas, acoes: lst(x.acoes, 10, 10)?.map(s => s.toUpperCase()) || c.acoes,
          servicos: lst(x.servicos, 12, 80) || c.servicos, faixa: lst(x.faixa, 12, 120) || c.faixa,
          produtos: Array.isArray(x.produtos) ? x.produtos.filter(p => p?.nome).slice(0, 12).map(p => ({ nome: String(p.nome).substring(0, 40), frase: String(p.frase || '').substring(0, 140) })) : c.produtos,
          grade: x.grade === undefined ? c.grade !== false : !!x.grade,
          intercalar: Object.fromEntries(Object.entries({ ...c.intercalar, ...(x.intercalar || {}) }).map(([k, v]) => [k, k === 'vinheta' ? v !== false : Math.max(0, Math.min(k.endsWith('_s') ? 120 : 20, parseInt(v) || 0))])) };
        if (n.intercalar.vinheta_s < 8) n.intercalar.vinheta_s = 25;
        await kv('atv:config', n); if (JSON.stringify(n.moedas) !== JSON.stringify(c.moedas) || JSON.stringify(n.acoes) !== JSON.stringify(c.acoes)) { try { await mercado(true); } catch (_) {} }
        return { config: { ...n, link: n.codigo ? base() + '/atv/' + n.codigo : null } }; },
      chamadas_gerar: () => chamadasGerar(),
      noticias_atualizar: async () => ({ noticias: await noticias(true) }), mercado_atualizar: async () => ({ mercado: await mercado(true) }),
      midia_iniciar: () => midiaIniciar(b), midia_parte: () => midiaParte(b), midia_concluir: () => midiaConcluir(b),
      midia_excluir: async () => { const sql = await getSql(); const c = await config(); if ((c.playlist || []).some(x => x.midia_id === b.id)) throw new Error('Tire o vídeo da playlist antes de excluir');
        await sql`DELETE FROM atv_partes WHERE midia_id=${b.id}`; await sql`DELETE FROM atv_midias WHERE id=${b.id}`; return { ok: true }; },
      destinos_salvar: async () => { const k = b.plataforma; if (!DESTINOS[k]) throw new Error('Destino inválido'); const d = (await kv('atv:destinos')) || {};
        const rtmp = String(b.rtmp || d[k]?.rtmp || DESTINOS[k].rtmp || '').trim(); if (!/^rtmps?:\/\/[^\s]+$/i.test(rtmp)) throw new Error('Informe a URL do servidor (começa com rtmp:// ou rtmps://)');
        const chave = String(b.chave || '').trim(); if (!chave && !d[k]?.chave_c) throw new Error('Cole a chave de transmissão');
        d[k] = { rtmp, chave_c: chave ? cifrar(chave) : d[k].chave_c, em: new Date().toISOString() }; await kv('atv:destinos', d); return { destinos: await destinosStatus() }; },
      destinos_limpar: async () => { const d = (await kv('atv:destinos')) || {}; delete d[b.plataforma]; await kv('atv:destinos', d); return { destinos: await destinosStatus() }; },
      webinar_salvar: () => webinarSalvar(b), webinar_listar: async () => ({ webinars: await webinars() }),
      webinar_excluir: async () => { const sql = await getSql(); const w = (await sql`SELECT egress_id FROM atv_webinars WHERE id=${b.id}`)[0]; if (w?.egress_id) throw new Error('Pare a transmissão antes de excluir');
        await sql`DELETE FROM atv_webinars WHERE id=${b.id}`; return { ok: true }; },
      webinar_status: async () => { const sql = await getSql(); const w = (await sql`SELECT * FROM atv_webinars WHERE id=${b.id}`)[0]; if (!w) throw new Error('Webinar não encontrado'); return { webinar: w, egress: await egressStatus(w.egress_id) }; },
      webinar_faixa: async () => { const sql = await getSql(); await sql`UPDATE atv_webinars SET faixa=${JSON.stringify({ titulo: String(b.titulo || '').substring(0, 90), subtitulo: String(b.subtitulo || '').substring(0, 140) })}, atualizado_em=NOW() WHERE id=${b.id}`; return { ok: true }; },
      webinar_token: () => webinarTokenHost(b), webinar_transmitir: () => webinarTransmitir(b), webinar_parar: () => webinarParar(b),
      webinar_reabrir: async () => { const sql = await getSql(); await sql`UPDATE atv_webinars SET status='aberto', sala_token=${tokenNovo(24)}, convidado_token=${tokenNovo(24)}, atualizado_em=NOW() WHERE id=${b.id}`; return { ok: true }; },
      tv_transmitir: () => tvTransmitir(b), tv_parar: () => tvParar(),
      tv_janela: async () => { const t = (await kv('atv:transmissao')) || {}; const j = b.janela || {}; const hm = s => /^\d\d:\d\d$/.test(s || '') ? s : null;
        t.janela = { auto: !!j.auto, inicio: hm(j.inicio) || '08:00', fim: hm(j.fim) || '20:00', dias: (Array.isArray(j.dias) ? j.dias : [1, 2, 3, 4, 5]).map(Number).filter(d => d >= 0 && d <= 6) }; t.destinos = (b.destinos || t.destinos || ['youtube']).filter(k => DESTINOS[k]);
        await kv('atv:transmissao', t); return { transmissao: t }; },
      ciclo: () => ciclo(),
      yt_status: () => ytStatus(), yt_conectar: async () => ({ url: await ytAuthUrl() }), yt_desconectar: async () => { await kv('atv:youtube', {}); _ytAcc = null; return { ok: true }; },
      yt_playlists: async () => ({ playlists: await ytPlaylists() }), yt_playlist_criar: () => ytPlaylistCriar(b), yt_descricao: () => ytDescricao(b),
      yt_publicar_iniciar: () => ytPublicarIniciar(b), yt_publicar_passo: () => ytPublicarPasso(b),
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) { console.error('[atv]', e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'atv');
export { dentroJanela as _dentroJanela, lkToken as _lkToken };
