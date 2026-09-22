// api/media.js — v1.80
// Hospedagem permanente de imagens. Resolve o problema das URLs efêmeras:
// o Ideogram devolve links com expiração (exp=...&sig=...), e o Metricool tenta baixar a
// imagem só na hora de publicar — dias depois, quando o link já morreu.
// Aqui a imagem é copiada para o banco e servida por uma URL estável do próprio domínio.

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await _sql`CREATE TABLE IF NOT EXISTS media_arquivos (
    id TEXT PRIMARY KEY,
    conteudo TEXT NOT NULL,          -- base64
    content_type TEXT NOT NULL,
    tamanho INT,
    origem TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    acessos INT DEFAULT 0
  )`;
  return _sql;
}
function novoId() { return 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }

// URL pública deste projeto
function baseUrl(req) {
  const env = process.env.MEDIA_PUBLIC_BASE;
  if (env) return env.replace(/\/$/, '');
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
    || req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  return host ? `https://${String(host).replace(/^https?:\/\//, '')}` : '';
}

// Detecta URL que vai expirar — não adianta agendar um post com ela
function ehEfemera(url) {
  const u = String(url || '');
  return /ideogram\.ai\/api\/images\/ephemeral/i.test(u)
      || /[?&]exp=\d+/.test(u)
      || /[?&](X-Amz-Expires|Expires)=/i.test(u)
      || /oaidalleapiprodscus\.blob\.core\.windows\.net/i.test(u)   // DALL·E
      || /replicate\.delivery/i.test(u);
}

async function salvarDeUrl({ url, origem } = {}) {
  if (!url) throw new Error('url obrigatória');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 45000);
  let resp;
  try {
    resp = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    clearTimeout(tm);
    const err = new Error(`Não consegui baixar a imagem: ${e.name === 'AbortError' ? 'tempo esgotado' : e.message}`);
    err.dica = 'Se a URL é do Ideogram, ela expira em poucas horas — gere a imagem de novo e salve imediatamente.';
    throw err;
  }
  clearTimeout(tm);
  if (!resp.ok) {
    const err = new Error(`A origem devolveu HTTP ${resp.status} ao baixar a imagem.`);
    if (resp.status === 403 || resp.status === 404) err.dica = 'O link provavelmente já expirou (URLs do Ideogram duram poucas horas).';
    throw err;
  }
  const ct = (resp.headers.get('content-type') || 'image/png').split(';')[0];
  if (!/^image\//.test(ct) && !/^video\//.test(ct)) {
    throw new Error(`A URL não devolveu imagem nem vídeo (veio "${ct}").`);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  // Limite defensivo: o banco não é um CDN
  if (buf.length > 8 * 1024 * 1024) {
    throw new Error(`Arquivo muito grande (${(buf.length/1048576).toFixed(1)} MB). Limite: 8 MB.`);
  }
  const sql = await getSql();
  const id = novoId();
  await sql`INSERT INTO media_arquivos (id, conteudo, content_type, tamanho, origem)
    VALUES (${id}, ${buf.toString('base64')}, ${ct}, ${buf.length}, ${String(origem || url).substring(0, 300)})`;
  console.log(`[media] guardada ${id} (${ct}, ${(buf.length/1024).toFixed(0)} KB) de ${String(url).substring(0,60)}`);
  return { id, content_type: ct, tamanho: buf.length };
}

// Garante URL permanente: se já for estável, devolve como está
async function garantirPermanente({ url, req, forcar = false } = {}) {
  if (!url) return { url: null, convertida: false };
  const base = baseUrl(req);
  if (String(url).startsWith(base + '/api/media')) return { url, convertida: false, motivo: 'já é permanente' };
  if (!forcar && !ehEfemera(url)) return { url, convertida: false, motivo: 'URL parece estável' };
  const r = await salvarDeUrl({ url, origem: url });
  return { url: `${base}/api/media?id=${r.id}`, convertida: true, id: r.id,
    tamanho: r.tamanho, content_type: r.content_type, original: url };
}

export default async function handler(req, res) {
  // GET /api/media?id=xxx → serve o arquivo
  if (req.method === 'GET') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id obrigatório' });
    try {
      const sql = await getSql();
      const r = await sql`SELECT conteudo, content_type, tamanho FROM media_arquivos WHERE id = ${id} LIMIT 1`;
      if (!r.length) return res.status(404).json({ error: 'Arquivo não encontrado' });
      sql`UPDATE media_arquivos SET acessos = acessos + 1 WHERE id = ${id}`.catch(() => {});
      const buf = Buffer.from(r[0].conteudo, 'base64');
      res.setHeader('Content-Type', r[0].content_type);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).send(buf);
    } catch (e) {
      console.error('[media] erro ao servir:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ success: false, error: 'JSON inválido' }); }
  const { action, payload = {} } = body;

  const acoes = {
    // v2.31: upload direto de imagem gerada no navegador (Story com QR)
    salvar_base64:  async () => {
      const { base64, content_type = 'image/png', origem } = payload;
      if (!base64) throw new Error('base64 obrigatório');
      const limpo = String(base64).replace(/^data:[^;]+;base64,/, '');
      const buf = Buffer.from(limpo, 'base64');
      if (buf.length > 8 * 1024 * 1024) throw new Error('Imagem acima de 8 MB');
      const sql = await getSql();
      const id = novoId();
      await sql`INSERT INTO media_arquivos (id, conteudo, content_type, tamanho, origem)
        VALUES (${id}, ${limpo}, ${content_type}, ${buf.length}, ${String(origem || 'upload').substring(0, 300)})`;
      return { id, content_type, tamanho: buf.length, url: `${baseUrl(req)}/api/media?id=${id}` };
    },
    salvar_de_url:  async () => {
      const r = await salvarDeUrl(payload);
      return { ...r, url: `${baseUrl(req)}/api/media?id=${r.id}` };
    },
    garantir_permanente: () => garantirPermanente({ ...payload, req }),
    eh_efemera:     () => ({ url: payload.url, efemera: ehEfemera(payload.url) }),
    listar:         async () => {
      const sql = await getSql();
      const rows = await sql`SELECT id, content_type, tamanho, origem, criado_em, acessos
        FROM media_arquivos ORDER BY criado_em DESC LIMIT 100`;
      const base = baseUrl(req);
      return { arquivos: rows.map(r => ({ ...r, url: `${base}/api/media?id=${r.id}` })),
        total_kb: Math.round(rows.reduce((s, r) => s + (r.tamanho || 0), 0) / 1024) };
    },
    excluir:        async () => {
      if (!payload.id) throw new Error('id obrigatório');
      const sql = await getSql();
      await sql`DELETE FROM media_arquivos WHERE id = ${payload.id}`;
      return { excluido: true };
    },
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try {
    const r = await acoes[action]();
    return res.status(200).json({ success: true, action, ...r });
  } catch (e) {
    console.error('[ERRO media]', action, e.message);
    return res.status(500).json({ success: false, error: e.message, dica: e.dica || null });
  }
}

export { salvarDeUrl, garantirPermanente, ehEfemera, baseUrl };
