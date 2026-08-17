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

async function getBlob() {
  try {
    const mod = await import('@vercel/blob');
    return mod;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, 'http://x');
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  // ── status ──
  if (req.method === 'GET' && url.searchParams.get('status')) {
    const blob = await getBlob();
    return res.status(200).json({ success: true, blob_configurado: !!(token && blob), pacote_instalado: !!blob, token_presente: !!token });
  }

  // ── proxy de imagem (CORS) ──
  if (req.method === 'GET' && url.searchParams.get('proxy')) {
    const target = url.searchParams.get('proxy');
    if (!/^https?:\/\//i.test(target)) return res.status(400).json({ success: false, error: 'url inválida' });
    try {
      const r = await fetch(target, { headers: { 'User-Agent': 'AtlantyxOS/1.9' } });
      if (!r.ok) return res.status(r.status).json({ success: false, error: 'origem respondeu ' + r.status });
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
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
    error: 'Hospedagem de mídia não configurada',
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
      if (!token || !blob) return semBlob();
      try {
        const r = await fetch(body.url, { headers: { 'User-Agent': 'AtlantyxOS/1.9' } });
        if (!r.ok) throw new Error('origem respondeu ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        const ct = r.headers.get('content-type') || 'image/png';
        const ext = ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : ct.includes('mp4') ? 'mp4' : 'png';
        const name = 'atlantyx/' + (body.pasta || 'img') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
        const out = await blob.put(name, buf, { access: 'public', contentType: ct, token, addRandomSuffix: false });
        return res.status(200).json({ success: true, url: out.url, bytes: buf.length, contentType: ct });
      } catch (e) {
        return res.status(500).json({ success: false, error: 'rehost: ' + e.message });
      }
    }
    return res.status(400).json({ success: false, error: 'action desconhecida' });
  }

  // ── upload binário (vídeo/imagem) ──
  if (!token || !blob) return semBlob();
  try {
    const buf = await readRaw(req);
    if (!buf.length) return res.status(400).json({ success: false, error: 'corpo vazio' });
    if (buf.length > 4.3 * 1024 * 1024) return res.status(413).json({ success: false, error: 'Arquivo acima de ~4,3 MB (limite da função). Reduza a duração/qualidade do vídeo ou envie manualmente ao Metricool.' });
    const nomeIn = url.searchParams.get('name') || req.headers['x-file-name'] || ('media-' + Date.now());
    const safe = String(nomeIn).replace(/[^a-zA-Z0-9._-]/g, '_');
    const name = 'atlantyx/' + (url.searchParams.get('pasta') || 'reels') + '/' + Date.now() + '-' + safe;
    const out = await blob.put(name, buf, { access: 'public', contentType: ctype || 'application/octet-stream', token, addRandomSuffix: false });
    console.log('[media-upload] ok', name, buf.length, 'bytes');
    return res.status(200).json({ success: true, url: out.url, bytes: buf.length });
  } catch (e) {
    console.error('[media-upload] erro', e.message);
    return res.status(500).json({ success: false, error: 'upload: ' + e.message });
  }
}
