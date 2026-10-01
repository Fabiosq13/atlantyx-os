import { comGuarda } from '../lib/qa-guard.js';
// api/media-upload.js — v1.9
// Mídia própria do Atlantyx: hospeda vídeos (Reels) e imagens em URL pública permanente.
//
// Requisitos (uma vez só):
//   1. No repo:  npm i @vercel/blob   (e commitar package.json / lock)
//   2. Vercel → Storage → Create → Blob → conectar ao projeto
//      (isso cria a env BLOB_READ_WRITE_TOKEN automaticamente) → Redeploy
//
// Sem isso: o proxy de imagens continua funcionando (necessário para montar o
// vídeo no navegador), e o upload retorna 501 com instruções. Nada mais quebra.
//
// Rotas:
//   GET  ?status=1                → { blob_configurado }
//   GET  ?proxy=<url>             → repassa a imagem com CORS (canvas sem "taint")
//   POST ?name=arquivo.mp4  (body binário, Content-Type do arquivo) → { url }
//   POST JSON { action:'rehost', url }  → baixa a URL (ex: Ideogram efêmera) e
//                                          hospeda permanente → { url }

export const config = { api: { bodyParser: false } };

const CORS = res => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-File-Name');
};

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

// ── v1.9.6: armazenamento próprio no Neon (funciona SEM Vercel Blob) ──
async function getNeon() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
  if (!url) return null;
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    await sql`CREATE TABLE IF NOT EXISTS media_store (
      id TEXT PRIMARY KEY, nome TEXT, content_type TEXT, bytes_b64 TEXT, tamanho INT,
      pasta TEXT, criado_em TIMESTAMPTZ DEFAULT NOW())`;
    return sql;
  } catch (e) { console.error('[media-upload] neon indisponível:', e.message); return null; }
}
function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function extDe(ct, nome) {
  const c = (ct || '').toLowerCase();
  if (c.includes('mp4')) return 'mp4'; if (c.includes('quicktime')) return 'mov'; if (c.includes('webm')) return 'webm';
  if (c.includes('jpeg') || c.includes('jpg')) return 'jpg'; if (c.includes('png')) return 'png'; if (c.includes('webp')) return 'webp'; if (c.includes('gif')) return 'gif';
  const mm = String(nome || '').match(/\.([a-z0-9]{2,4})$/i); return mm ? mm[1].toLowerCase() : 'bin';
}
// v1.10: URL pública COM extensão no caminho (/media/ID.mp4) — Metricool/Instagram validam tipo pela extensão;
// sem ela o Reel era lido como "imagem" e a Story ficava "Sem imagem"
// v1.10.5: base PÚBLICA. As URLs de deployment do Vercel (project-xxxx-team.vercel.app) ficam atrás do
// "Deployment Protection" — abrem no SEU navegador (logado no Vercel) mas o Metricool/Instagram recebem
// uma tela de login → "Sem imagem"/spinner. Usar o domínio de PRODUÇÃO (VERCEL_PROJECT_PRODUCTION_URL)
// ou MEDIA_PUBLIC_BASE definido por você.
function basePublica(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const envBase = (process.env.MEDIA_PUBLIC_BASE || '').trim().replace(/\/$/, '');
  if (envBase) return envBase.startsWith('http') ? envBase : 'https://' + envBase;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return `${proto}://${host}`;
}
function urlPublica(req, id, ext) {
  return `${basePublica(req)}/media/${id}.${ext || 'bin'}`; // rota via rewrite do vercel.json (a que está no ar)
}
async function salvarNeon(req, sql, buf, ct, nome, pasta) {
  const id = novoId();
  await sql`INSERT INTO media_store (id, nome, content_type, bytes_b64, tamanho, pasta)
            VALUES (${id}, ${nome}, ${ct}, ${buf.toString('base64')}, ${buf.length}, ${pasta || 'geral'})`;
  return { url: urlPublica(req, id, extDe(ct, nome)), id };
}

async function getBlob() {
  try {
    const mod = await import('@vercel/blob');
    return mod;
  } catch (e) {
    return null;
  }
}

async function handler(req, res) {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, 'http://x');
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // ── status ──
  if (req.method === 'GET' && url.searchParams.get('status')) {
    const blob = await getBlob();
    const sqlS = await getNeon();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return res.status(200).json({ success: true, blob_configurado: !!(token && blob), neon_configurado: !!sqlS, hospedagem: (token && blob) ? 'vercel-blob' : (sqlS ? 'neon' : 'nenhuma'), pacote_instalado: !!blob, token_presente: !!token,
      base_publica: basePublica(req), host_atual: host, producao_env: process.env.VERCEL_PROJECT_PRODUCTION_URL || null, media_public_base_env: process.env.MEDIA_PUBLIC_BASE || null,
      host_parece_deployment: /-[a-z0-9]{6,}-[a-z0-9-]+\.vercel\.app$/i.test(host || '') });
  }
  // ── v1.10.5: checagem SERVER-SIDE de uma URL pública (sem cookies — o que o Metricool/Instagram veem) ──
  if (req.method === 'GET' && url.searchParams.get('check')) {
    const alvo = url.searchParams.get('check');
    if (!/^https?:\/\//i.test(alvo)) return res.status(400).json({ success: false, error: 'url inválida' });
    try {
      const r = await fetch(alvo, { method: 'GET', redirect: 'manual', headers: { 'Range': 'bytes=0-1', 'User-Agent': 'Mozilla/5.0 (compatible; MetricoolBot-check; AtlantyxOS)' } });
      const ct = r.headers.get('content-type') || '';
      const loc = r.headers.get('location') || '';
      const authWall = r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400 && /vercel\.com|sso|login|_vercel/i.test(loc));
      return res.status(200).json({ success: true, status: r.status, content_type: ct, location: loc, auth_wall: authWall, ok: (r.status === 200 || r.status === 206) && !ct.includes('text/html') });
    } catch (e) { return res.status(200).json({ success: true, status: 0, content_type: '', ok: false, erro: e.message }); }
  }

  // ── servir mídia hospedada no Neon (URL pública p/ Metricool/Instagram) ──
  const fParam = url.searchParams.get('f'); // /media/ID.ext → ?f=ID.ext
  const mid = url.searchParams.get('m') || (fParam ? fParam.split('.')[0] : null);
  if ((req.method === 'GET' || req.method === 'HEAD') && mid) {
    const sql = await getNeon();
    if (!sql) return res.status(500).json({ success: false, error: 'DATABASE_URL ausente' });
    try {
      const rows = await sql`SELECT content_type, bytes_b64, nome FROM media_store WHERE id = ${mid} LIMIT 1`;
      if (!rows.length) return res.status(404).json({ success: false, error: 'mídia não encontrada' });
      const buf = Buffer.from(rows[0].bytes_b64, 'base64');
      const ct = rows[0].content_type || 'application/octet-stream';
      const nome = (rows[0].nome || ('media.' + extDe(ct))).replace(/[^\w.\-]/g, '_');
      res.setHeader('Content-Type', ct);
      res.setHeader('Content-Disposition', 'inline; filename="' + nome + '"');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Accept-Ranges', 'bytes');
      // v1.10: Range (players/validadores de vídeo pedem trechos) + HEAD (checagem de tamanho/tipo)
      const range = req.headers['range'];
      if (range && /^bytes=\d*-\d*$/.test(range)) {
        let [s0, e0] = range.replace('bytes=', '').split('-');
        let start = s0 ? parseInt(s0) : 0, end = e0 ? parseInt(e0) : buf.length - 1;
        if (isNaN(start) || start >= buf.length) { res.setHeader('Content-Range', 'bytes */' + buf.length); return res.status(416).end(); }
        end = Math.min(end, buf.length - 1);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${buf.length}`);
        res.setHeader('Content-Length', String(end - start + 1));
        if (req.method === 'HEAD') return res.status(206).end();
        return res.status(206).send(buf.subarray(start, end + 1));
      }
      res.setHeader('Content-Length', String(buf.length));
      if (req.method === 'HEAD') return res.status(200).end();
      return res.status(200).send(buf);
    } catch (e) { return res.status(500).json({ success: false, error: 'media: ' + e.message }); }
  }

  // ── proxy de imagem (CORS) ──
  if (req.method === 'GET' && url.searchParams.get('proxy')) {
    const target = url.searchParams.get('proxy');
    if (!/^https?:\/\//i.test(target)) return res.status(400).json({ success: false, error: 'url inválida' });
    // v3.29: o proxy é público (o canvas do Reel carrega imagens sem cookie), então só repassa IMAGEM/VÍDEO,
    // de endereço público, até 10 MB — não serve para ler endereços internos nem hospedar outros arquivos
    let alvo; try { alvo = new URL(target); } catch (_) { return res.status(400).json({ success: false, error: 'url inválida' }); }
    if (/^(localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|metadata)/i.test(alvo.hostname) || /\.internal$|\.local$/i.test(alvo.hostname)) return res.status(400).json({ success: false, error: 'endereço não permitido' });
    try {
      const r = await fetch(target, { headers: { 'User-Agent': 'AtlantyxOS/1.9' }, redirect: 'follow' });
      if (!r.ok) return res.status(r.status).json({ success: false, error: 'origem respondeu ' + r.status });
      if (+(r.headers.get('content-length') || 0) > 10 * 1048576) return res.status(413).json({ success: false, error: 'arquivo grande demais' });
      const buf = Buffer.from(await r.arrayBuffer());
      const tipo = tipoReal(buf);
      if (!tipo || !/^(image|video)\//.test(tipo) || buf.length > 10 * 1048576) return res.status(415).json({ success: false, error: 'o proxy só repassa imagens e vídeos' });
      res.setHeader('Content-Type', tipo);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(buf);
    } catch (e) {
      return res.status(502).json({ success: false, error: 'proxy: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });

  const blob = await getBlob();
  const semBlob = () => res.status(501).json({
    success: false,
    error: 'Hospedagem de mídia indisponível (nem Vercel Blob nem DATABASE_URL/Neon)',
    hint: 'No repo: npm i @vercel/blob (commitar package.json). No Vercel: Storage → Create → Blob → conectar ao projeto (cria BLOB_READ_WRITE_TOKEN) → Redeploy.',
    pacote_instalado: !!blob, token_presente: !!token,
  });

  const ctype = (req.headers['content-type'] || '').toLowerCase();

  // ── rehost (JSON) ──
  if (ctype.includes('application/json')) {
    let body = {};
    try { body = JSON.parse((await readRaw(req)).toString('utf8') || '{}'); } catch (_) {}
    if (body.action === 'rehost') {
      if (!body.url || !/^https?:\/\//i.test(body.url)) return res.status(400).json({ success: false, error: 'url obrigatória' });
      try {
        const r = await fetch(body.url, { headers: { 'User-Agent': 'AtlantyxOS/1.9' } });
        if (!r.ok) throw new Error('origem respondeu ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (!tipoReal(buf)) throw new Error('o conteúdo não é imagem/vídeo/PDF');
        const ct = tipoReal(buf) || r.headers.get('content-type') || 'image/png';
        const ext = ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : ct.includes('mp4') ? 'mp4' : 'png';
        if (token && blob) {
          const name = 'atlantyx/' + (body.pasta || 'img') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
          const out = await blob.put(name, buf, { access: 'public', contentType: ct, token, addRandomSuffix: false });
          return res.status(200).json({ success: true, url: out.url, bytes: buf.length, contentType: ct, hospedagem: 'vercel-blob' });
        }
        const sql = await getNeon(); if (!sql) return semBlob();
        if (buf.length > 4.3 * 1024 * 1024) return res.status(413).json({ success: false, error: 'Arquivo acima de ~4,3 MB' });
        const out = await salvarNeon(req, sql, buf, ct, 'rehost.' + ext, body.pasta || 'img');
        return res.status(200).json({ success: true, url: out.url, bytes: buf.length, contentType: ct, hospedagem: 'neon' });
      } catch (e) {
        return res.status(500).json({ success: false, error: 'rehost: ' + e.message });
      }
    }
    return res.status(400).json({ success: false, error: 'action desconhecida' });
  }

  // ── upload binário (vídeo/imagem): Vercel Blob se configurado, senão Neon (já existente) ──
  try {
    const buf = await readRaw(req);
    if (!buf.length) return res.status(400).json({ success: false, error: 'corpo vazio' });
    if (buf.length > 4.3 * 1024 * 1024) return res.status(413).json({ success: false, error: 'Arquivo acima de ~4,3 MB (limite da função). Reduza a duração/qualidade do vídeo ou envie manualmente ao Metricool.' });
    // v3.29 (SEC-009): só imagem, vídeo, PDF e XML — conferido pelo CONTEÚDO, não pelo nome (evita hospedar HTML/JS no domínio)
    if (!tipoReal(buf)) return res.status(415).json({ success: false, error: 'Tipo de arquivo não permitido (aceitos: JPG, PNG, WEBP, GIF, MP4, WEBM, MOV, PDF, XML).' });
    const nomeIn = url.searchParams.get('name') || req.headers['x-file-name'] || ('media-' + Date.now());
    const safe = String(nomeIn).replace(/[^a-zA-Z0-9._-]/g, '_');
    const pasta = url.searchParams.get('pasta') || 'reels';
    if (token && blob) {
      const name = 'atlantyx/' + pasta + '/' + Date.now() + '-' + safe;
      const out = await blob.put(name, buf, { access: 'public', contentType: ctype || 'application/octet-stream', token, addRandomSuffix: false });
      console.log('[media-upload] blob ok', name, buf.length, 'bytes');
      return res.status(200).json({ success: true, url: out.url, bytes: buf.length, hospedagem: 'vercel-blob' });
    }
    const sql = await getNeon();
    if (!sql) return semBlob();
    const out = await salvarNeon(req, sql, buf, ctype || 'application/octet-stream', safe, pasta);
    console.log('[media-upload] neon ok', out.id, buf.length, 'bytes');
    return res.status(200).json({ success: true, url: out.url, bytes: buf.length, hospedagem: 'neon' });
  } catch (e) {
    console.error('[media-upload] erro', e.message);
    return res.status(500).json({ success: false, error: 'upload: ' + e.message });
  }
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'media-upload');

// v3.29: tipo real do arquivo pelos primeiros bytes
function tipoReal(buf) {
  if (!buf || buf.length < 12) return null;
  const h = buf.subarray(0, 12), s4 = h.toString('latin1', 0, 4), s8 = h.toString('latin1', 4, 8);
  if (h[0] === 0xFF && h[1] === 0xD8) return 'image/jpeg';
  if (h[0] === 0x89 && s4.slice(1) === 'PNG') return 'image/png';
  if (s4 === 'RIFF' && h.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (s4 === 'GIF8') return 'image/gif';
  if (s8 === 'ftyp') return /qt/.test(h.toString('latin1', 8, 12)) ? 'video/quicktime' : 'video/mp4';
  if (h[0] === 0x1A && h[1] === 0x45 && h[2] === 0xDF && h[3] === 0xA3) return 'video/webm';
  if (s4 === '%PDF') return 'application/pdf';
  if (/^\s*<\?xml/.test(buf.toString('utf8', 0, 64))) return 'application/xml';
  return null;
}
