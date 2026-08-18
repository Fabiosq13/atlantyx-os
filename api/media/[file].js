// api/media/[file].js — v1.10.3
// Rota pública de mídia SEM depender de rewrite no vercel.json:
//   https://SEU-APP.vercel.app/api/media/ID.mp4  (ou .jpg/.png)
// Serve o arquivo hospedado no Neon/Blob com extensão no caminho (Metricool/Instagram exigem).
import handler, { config as cfg } from '../media-upload.js';
export const config = cfg;
export default function (req, res) {
  const file = (req.query && req.query.file) || (req.url || '').split('?')[0].split('/').pop();
  req.url = '/api/media-upload?f=' + encodeURIComponent(file || '');
  return handler(req, res);
}
