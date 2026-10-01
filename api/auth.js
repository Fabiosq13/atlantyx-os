import { comGuarda, authAtiva, conferirSenha, criarSessao, cookieSessao, lerSessao } from '../lib/qa-guard.js';
// api/auth.js — v3.29 · Login do Atlantyx OS (SEC-001/003)
// Usuários: variável ATX_USUARIOS no Vercel ("email:senha;email2:senha2"); assinatura: ATX_SESSAO_SEGREDO.
// GET            → { ativa, logado, usuario }
// POST login     { email, senha } → cookie de sessão (HttpOnly, 30 dias)
// POST sair      → apaga o cookie

const tentativas = new Map(); // ip → { n, ate } (melhor esforço: por instância)
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const ativa = authAtiva();
  if (req.method === 'GET') {
    const s = lerSessao(req);
    return res.status(200).json({ success: true, ativa, logado: !ativa || !!s, usuario: s?.email || null });
  }
  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {};
  if (b.action === 'sair') { res.setHeader('Set-Cookie', cookieSessao('', req)); return res.status(200).json({ success: true }); }
  if (b.action !== 'login') return res.status(400).json({ success: false, error: 'ação inválida' });
  if (!ativa) return res.status(200).json({ success: true, ativa: false, aviso: 'Login desligado: cadastre ATX_USUARIOS e ATX_SESSAO_SEGREDO no Vercel.' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const t = tentativas.get(ip);
  if (t && t.n >= 8 && t.ate > Date.now()) return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' });
  const email = conferirSenha(b.email, b.senha);
  if (!email) {
    const n = (t && t.ate > Date.now() ? t.n : 0) + 1; tentativas.set(ip, { n, ate: Date.now() + 15 * 60000 });
    await sleep(600);
    return res.status(401).json({ success: false, error: 'E-mail ou senha incorretos.' });
  }
  tentativas.delete(ip);
  res.setHeader('Set-Cookie', cookieSessao(criarSessao(email), req));
  return res.status(200).json({ success: true, usuario: email });
}

export default comGuarda(handler, 'auth');
