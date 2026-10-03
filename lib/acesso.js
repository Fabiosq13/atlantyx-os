// lib/acesso.js — v3.81 · Usuários, perfis e telas do Atlantyx OS (login próprio, no banco)
// • atx_usuarios: login, nome, e-mail, senha (scrypt com sal), perfil, ativo
// • atx_perfis: nome, admin (acesso total), telas permitidas (ids das telas do menu)
// • atx_telas: catálogo das telas (sincronizado a partir do menu do sistema)
// • segredo da sessão: ATX_SESSAO_SEGREDO no Vercel ou, se não existir, um aleatório guardado no banco
// Nenhuma senha fica no código: o primeiro administrador é criado na tela de "primeiro acesso".
import crypto from 'crypto';

let _sql = null;
const _val = v => { if (typeof v !== 'string') return v == null ? '' : String(v); try { const x = JSON.parse(v); return typeof x === 'string' ? x : v; } catch (_) { return v; } };
async function db() {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) return null;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

let _tabelasOk = false;
async function tabelas(sql) {
  if (_tabelasOk) return;
  await sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS atx_perfis (id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, admin BOOLEAN DEFAULT false, telas JSONB DEFAULT '[]'::jsonb, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS atx_usuarios (id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, nome TEXT, email TEXT, senha_hash TEXT NOT NULL, perfil_id TEXT, ativo BOOLEAN DEFAULT true, trocar_senha BOOLEAN DEFAULT false, ultimo_login TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS atx_telas (id TEXT PRIMARY KEY, nome TEXT, grupo TEXT, ordem INT DEFAULT 0, ativa BOOLEAN DEFAULT true, atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  _tabelasOk = true;
}

// ── senha ──────────────────────────────────────────────────────────────────
export function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('base64url');
  const h = crypto.scryptSync(String(senha), sal, 64).toString('base64url');
  return `scrypt$${sal}$${h}`;
}
function confere(senha, hash) {
  const [alg, sal, h] = String(hash || '').split('$');
  if (alg !== 'scrypt' || !sal || !h) return false;
  const x = crypto.scryptSync(String(senha || ''), sal, 64);
  const y = Buffer.from(h, 'base64url');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export function senhaForte(s) {
  s = String(s || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) return 'A senha precisa ter letras e números.';
  return null;
}

// ── cache (as APIs consultam a cada requisição; o banco é lido no máximo a cada 60s por instância) ──
let _cache = { em: 0, dados: null }, _promessa = null;
export function limparCache() { _cache = { em: 0, dados: null }; }
export async function carregar(forcar) {
  if (!forcar && _cache.dados && Date.now() - _cache.em < 60000) return _cache.dados;
  if (_promessa) return _promessa;
  _promessa = (async () => {
    const vazio = { usuarios: [], perfis: [], segredo: process.env.ATX_SESSAO_SEGREDO || '', db: false };
    try {
      const sql = await db(); if (!sql) return vazio;
      await tabelas(sql);
      let seg = process.env.ATX_SESSAO_SEGREDO || '';
      if (!seg) {
        const r = await sql`SELECT value FROM kv_store WHERE key = 'atx:sessao_segredo' LIMIT 1`;
        seg = r[0] ? _val(r[0].value) : '';
        if (!seg) {
          const novo = crypto.randomBytes(32).toString('base64url');
          await sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('atx:sessao_segredo', ${JSON.stringify(novo)}, NOW()) ON CONFLICT (key) DO NOTHING`;
          const r2 = await sql`SELECT value FROM kv_store WHERE key = 'atx:sessao_segredo' LIMIT 1`;
          seg = r2[0] ? _val(r2[0].value) : novo;
        }
      }
      const usuarios = await sql`SELECT id, login, nome, email, senha_hash, perfil_id, ativo, trocar_senha, ultimo_login, criado_em FROM atx_usuarios`;
      const perfis = await sql`SELECT id, nome, descricao, admin, telas FROM atx_perfis ORDER BY nome`;
      perfis.forEach(p => { if (typeof p.telas === 'string') { try { p.telas = JSON.parse(p.telas); } catch (_) { p.telas = []; } } if (!Array.isArray(p.telas)) p.telas = []; });
      return { usuarios, perfis, segredo: String(seg), db: true };
    } catch (e) { return { ...vazio, erro: e.message }; }
  })().then(d => { _cache = { em: Date.now(), dados: d }; _promessa = null; return d; }, e => { _promessa = null; throw e; });
  return _promessa;
}
export function segredoAtual() { return process.env.ATX_SESSAO_SEGREDO || _cache.dados?.segredo || ''; }

// usuários antigos no ATX_USUARIOS (e-mail:senha) continuam valendo, como administradores
function usuariosEnv() {
  return String(process.env.ATX_USUARIOS || '').split(/[;\n]/).map(x => x.trim()).filter(Boolean)
    .map(x => { const i = x.indexOf(':'); return i > 0 ? { email: x.slice(0, i).trim().toLowerCase(), senha: x.slice(i + 1) } : null; }).filter(Boolean);
}
export async function authAtiva() {
  const d = await carregar();
  return !!(d.segredo && (d.usuarios.some(u => u.ativo) || usuariosEnv().length));
}
export async function primeiroAcesso() { const d = await carregar(); return d.db && !d.usuarios.length && !usuariosEnv().length; }

// ── sessão (cookie assinado; invalida quando a senha muda ou o usuário é desativado) ──
const b64u = b => Buffer.from(b).toString('base64url');
const hmac = (seg, t) => crypto.createHmac('sha256', seg).update(t).digest('base64url');
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const DIAS = 30;
const marcaSenha = h => crypto.createHash('sha256').update(String(h || '')).digest('base64url').substring(0, 10);
export function criarSessao(seg, u) {
  const p = b64u(JSON.stringify({ u: u.login, s: marcaSenha(u.senha_hash || u.senha || ''), x: Date.now() + DIAS * 864e5 }));
  return p + '.' + hmac(seg, 's:' + p);
}
export function cookieSessao(token, req) {
  const seguro = !/^localhost|^127\./.test(String(req?.headers?.host || ''));
  return `atx_sessao=${token || ''}; Path=/; HttpOnly; SameSite=Lax;${seguro ? ' Secure;' : ''} Max-Age=${token ? DIAS * 86400 : 0}`;
}
export async function lerSessao(req) {
  const c = String(req?.headers?.cookie || '').split(/;\s*/).find(x => x.startsWith('atx_sessao='));
  if (!c) return null;
  const d = await carregar(); if (!d.segredo) return null;
  const [p, sig] = c.slice(11).split('.'); if (!p || !sig || !igual(sig, hmac(d.segredo, 's:' + p))) return null;
  let s; try { s = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch (_) { return null; }
  if (!s || s.x < Date.now()) return null;
  const login = s.u || s.e; // s.e = sessões antigas (ATX_USUARIOS)
  const u = d.usuarios.find(x => x.login === login);
  if (u) {
    if (!u.ativo || s.s !== marcaSenha(u.senha_hash)) return null;
    const pf = d.perfis.find(x => x.id === u.perfil_id) || null;
    return { login: u.login, nome: u.nome || u.login, email: u.email || null, id: u.id, perfil: pf ? { id: pf.id, nome: pf.nome, admin: !!pf.admin, telas: pf.telas } : null, admin: !!pf?.admin, telas: pf?.admin ? ['*'] : (pf?.telas || []), trocar_senha: !!u.trocar_senha, expira: s.x };
  }
  const ue = usuariosEnv().find(x => x.email === login);
  if (ue) return { login: ue.email, nome: ue.email.split('@')[0], email: ue.email, perfil: { nome: 'Administrador (variável do Vercel)', admin: true }, admin: true, telas: ['*'], expira: s.x, legado: true };
  return null;
}
export async function conferirLogin(login, senha) {
  const d = await carregar(true);
  const l = String(login || '').trim().toLowerCase();
  const u = d.usuarios.find(x => x.ativo && (x.login.toLowerCase() === l || String(x.email || '').toLowerCase() === l));
  if (u) { if (confere(senha, u.senha_hash)) return u; return null; }
  const ue = usuariosEnv().find(x => x.email === l);
  if (ue) { const a = crypto.createHash('sha256').update(String(senha || '')).digest(), b = crypto.createHash('sha256').update(ue.senha).digest(); if (crypto.timingSafeEqual(a, b)) return { login: ue.email, senha: ue.senha }; }
  confere(senha, 'scrypt$x$' + 'A'.repeat(86)); // tempo parecido mesmo sem usuário
  return null;
}

// ── administração ──────────────────────────────────────────────────────────
export async function sql() { const s = await db(); if (!s) throw new Error('Banco (DATABASE_URL) não configurado'); await tabelas(s); return s; }
export const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
