import { comGuarda } from '../lib/qa-guard.js';
import { carregar, limparCache, authAtiva, primeiroAcesso, lerSessao, conferirLogin, criarSessao, cookieSessao, hashSenha, senhaForte, sql as sqlAcesso, novoId } from '../lib/acesso.js';
// api/auth.js — v3.81 · Login, usuários, perfis e telas do Atlantyx OS
// GET                          → { ativa, logado, primeiro_acesso, usuario: { login, nome, admin, perfil, telas } }
// POST login {login, senha}    → cookie de sessão (HttpOnly, 30 dias)
// POST sair
// POST primeiro_acesso {login, nome, email, senha}  → só quando NÃO existe nenhum usuário: cria o perfil
//                                                    Administrador e o usuário master
// POST trocar_senha {senha_atual, senha_nova}       → usuário logado
// Administração (só perfil admin): usuarios_listar · usuario_salvar · usuario_excluir · perfis_listar ·
//   perfil_salvar · perfil_excluir · telas_listar · telas_sincronizar · telas_salvar

const tentativas = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pub = u => ({ id: u.id, login: u.login, nome: u.nome, email: u.email, perfil_id: u.perfil_id, ativo: u.ativo, trocar_senha: u.trocar_senha, ultimo_login: u.ultimo_login, criado_em: u.criado_em });

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const ativa = await authAtiva();
  if (req.method === 'GET') {
    const s = await lerSessao(req);
    return res.status(200).json({ success: true, ativa, logado: !ativa || !!s, primeiro_acesso: await primeiroAcesso(),
      usuario: s ? { login: s.login, nome: s.nome, email: s.email, admin: s.admin, perfil: s.perfil?.nome || null, telas: s.telas, trocar_senha: !!s.trocar_senha, legado: !!s.legado } : null });
  }
  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {}; const acao = b.action || ((b.email || b.login) && b.senha ? 'login' : '');

  if (acao === 'sair') { res.setHeader('Set-Cookie', cookieSessao('', req)); return res.status(200).json({ success: true }); }

  if (acao === 'login') {
    if (!ativa) return res.status(200).json({ success: false, error: 'Ainda não há usuários — crie o administrador no primeiro acesso.', primeiro_acesso: await primeiroAcesso() });
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const t = tentativas.get(ip);
    if (t && t.n >= 8 && t.ate > Date.now()) return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' });
    const u = await conferirLogin(b.login || b.email, b.senha);
    if (!u) { const n = (t && t.ate > Date.now() ? t.n : 0) + 1; tentativas.set(ip, { n, ate: Date.now() + 15 * 60000 }); await sleep(600); return res.status(401).json({ success: false, error: 'Login ou senha incorretos.' }); }
    tentativas.delete(ip);
    const d = await carregar();
    if (u.id) { try { const s = await sqlAcesso(); await s`UPDATE atx_usuarios SET ultimo_login = NOW() WHERE id = ${u.id}`; } catch (_) {} }
    res.setHeader('Set-Cookie', cookieSessao(criarSessao(d.segredo, u), req));
    return res.status(200).json({ success: true, usuario: u.login, trocar_senha: !!u.trocar_senha });
  }

  if (acao === 'primeiro_acesso') {
    if (!(await primeiroAcesso())) return res.status(403).json({ success: false, error: 'O administrador já foi criado. Entre com login e senha.' });
    const login = String(b.login || '').trim().toLowerCase();
    if (!/^[a-z0-9._@-]{3,60}$/.test(login)) return res.status(400).json({ success: false, error: 'Login inválido (3 a 60 letras, números, ponto, hífen ou @).' });
    const fraca = senhaForte(b.senha); if (fraca) return res.status(400).json({ success: false, error: fraca });
    const s = await sqlAcesso();
    const ja = await s`SELECT COUNT(*)::int AS n FROM atx_usuarios`; if (ja[0].n > 0) return res.status(403).json({ success: false, error: 'O administrador já foi criado.' });
    const perfilId = 'perfil_admin';
    await s`INSERT INTO atx_perfis (id, nome, descricao, admin, telas) VALUES (${perfilId}, 'Administrador', 'Acesso total, inclusive usuários, perfis e telas', true, '["*"]'::jsonb) ON CONFLICT (id) DO NOTHING`;
    const id = novoId('usr'), hash = hashSenha(b.senha);
    await s`INSERT INTO atx_usuarios (id, login, nome, email, senha_hash, perfil_id, ativo) VALUES (${id}, ${login}, ${String(b.nome || 'Administrador').substring(0, 120)}, ${b.email ? String(b.email).trim().toLowerCase() : null}, ${hash}, ${perfilId}, true)`;
    limparCache(); const d = await carregar(true);
    res.setHeader('Set-Cookie', cookieSessao(criarSessao(d.segredo, { login, senha_hash: hash }), req));
    return res.status(200).json({ success: true, usuario: login });
  }

  // daqui em diante: usuário logado
  const s = await lerSessao(req);
  if (!s) return res.status(401).json({ success: false, exige_login: true, error: 'Faça login.' });

  if (acao === 'trocar_senha') {
    if (s.legado) return res.status(400).json({ success: false, error: 'Este usuário vem da variável ATX_USUARIOS do Vercel — crie o usuário em Usuários para poder trocar a senha aqui.' });
    const sq = await sqlAcesso(); const u = (await sq`SELECT * FROM atx_usuarios WHERE login = ${s.login} LIMIT 1`)[0];
    if (!u || !(await conferirLogin(s.login, b.senha_atual))) return res.status(400).json({ success: false, error: 'Senha atual incorreta.' });
    const fraca = senhaForte(b.senha_nova); if (fraca) return res.status(400).json({ success: false, error: fraca });
    const hash = hashSenha(b.senha_nova);
    await sq`UPDATE atx_usuarios SET senha_hash = ${hash}, trocar_senha = false, atualizado_em = NOW() WHERE id = ${u.id}`;
    limparCache(); const d = await carregar(true);
    res.setHeader('Set-Cookie', cookieSessao(criarSessao(d.segredo, { login: u.login, senha_hash: hash }), req));
    return res.status(200).json({ success: true });
  }

  if (!s.admin) return res.status(403).json({ success: false, error: 'Só o perfil Administrador pode gerenciar usuários, perfis e telas.' });
  const sq = await sqlAcesso();
  const fim = (dados) => { limparCache(); return res.status(200).json({ success: true, ...dados }); };

  switch (acao) {
    case 'usuarios_listar': { const d = await carregar(true); return res.status(200).json({ success: true, usuarios: d.usuarios.map(pub).sort((a, c) => a.login.localeCompare(c.login)), perfis: d.perfis }); }
    case 'usuario_salvar': {
      const u = b.usuario || {}; const login = String(u.login || '').trim().toLowerCase();
      if (!/^[a-z0-9._@-]{3,60}$/.test(login)) return res.status(400).json({ success: false, error: 'Login inválido (3 a 60 letras, números, ponto, hífen ou @).' });
      if (u.perfil_id) { const p = await sq`SELECT 1 FROM atx_perfis WHERE id = ${u.perfil_id}`; if (!p.length) return res.status(400).json({ success: false, error: 'Perfil não encontrado.' }); }
      const dup = await sq`SELECT id FROM atx_usuarios WHERE login = ${login} AND id <> ${u.id || ''}`; if (dup.length) return res.status(400).json({ success: false, error: 'Já existe um usuário com este login.' });
      if (u.id) {
        const atual = (await sq`SELECT * FROM atx_usuarios WHERE id = ${u.id}`)[0]; if (!atual) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
        // não deixa o sistema sem administrador ativo
        if (atual.login === s.login && (u.ativo === false || (u.perfil_id && u.perfil_id !== atual.perfil_id))) {
          const outros = await sq`SELECT COUNT(*)::int AS n FROM atx_usuarios u JOIN atx_perfis p ON p.id = u.perfil_id WHERE p.admin = true AND u.ativo = true AND u.id <> ${u.id}`;
          if (!outros[0].n) return res.status(400).json({ success: false, error: 'Você é o único administrador ativo — não pode se desativar nem mudar o próprio perfil.' });
        }
        let hash = atual.senha_hash; if (u.senha) { const f = senhaForte(u.senha); if (f) return res.status(400).json({ success: false, error: f }); hash = hashSenha(u.senha); }
        await sq`UPDATE atx_usuarios SET login = ${login}, nome = ${u.nome || null}, email = ${u.email ? String(u.email).trim().toLowerCase() : null}, perfil_id = ${u.perfil_id || null}, ativo = ${u.ativo !== false}, senha_hash = ${hash}, trocar_senha = ${u.senha ? !!u.trocar_senha : atual.trocar_senha}, atualizado_em = NOW() WHERE id = ${u.id}`;
        return fim({ id: u.id });
      }
      if (!u.senha) return res.status(400).json({ success: false, error: 'Informe a senha inicial.' });
      const f = senhaForte(u.senha); if (f) return res.status(400).json({ success: false, error: f });
      const id = novoId('usr');
      await sq`INSERT INTO atx_usuarios (id, login, nome, email, senha_hash, perfil_id, ativo, trocar_senha) VALUES (${id}, ${login}, ${u.nome || null}, ${u.email ? String(u.email).trim().toLowerCase() : null}, ${hashSenha(u.senha)}, ${u.perfil_id || null}, ${u.ativo !== false}, ${u.trocar_senha !== false})`;
      return fim({ id });
    }
    case 'usuario_excluir': {
      const atual = (await sq`SELECT * FROM atx_usuarios WHERE id = ${b.id}`)[0]; if (!atual) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
      if (atual.login === s.login) return res.status(400).json({ success: false, error: 'Você não pode excluir o próprio usuário.' });
      await sq`DELETE FROM atx_usuarios WHERE id = ${b.id}`; return fim({});
    }
    case 'perfis_listar': { const d = await carregar(true); const n = {}; d.usuarios.forEach(u => { n[u.perfil_id] = (n[u.perfil_id] || 0) + 1; }); return res.status(200).json({ success: true, perfis: d.perfis.map(p => ({ ...p, usuarios: n[p.id] || 0 })) }); }
    case 'perfil_salvar': {
      const p = b.perfil || {}; const nome = String(p.nome || '').trim(); if (nome.length < 2) return res.status(400).json({ success: false, error: 'Dê um nome ao perfil.' });
      const telas = p.admin ? ['*'] : (Array.isArray(p.telas) ? p.telas.map(String).filter(t => /^[a-z0-9_-]{1,40}$/i.test(t)) : []);
      if (p.id) {
        if (p.id === 'perfil_admin' && !p.admin) return res.status(400).json({ success: false, error: 'O perfil Administrador precisa continuar com acesso total.' });
        await sq`UPDATE atx_perfis SET nome = ${nome}, descricao = ${p.descricao || null}, admin = ${!!p.admin}, telas = ${JSON.stringify(telas)}::jsonb, atualizado_em = NOW() WHERE id = ${p.id}`;
        return fim({ id: p.id });
      }
      const id = novoId('perfil');
      await sq`INSERT INTO atx_perfis (id, nome, descricao, admin, telas) VALUES (${id}, ${nome}, ${p.descricao || null}, ${!!p.admin}, ${JSON.stringify(telas)}::jsonb)`;
      return fim({ id });
    }
    case 'perfil_excluir': {
      if (b.id === 'perfil_admin') return res.status(400).json({ success: false, error: 'O perfil Administrador não pode ser excluído.' });
      const em = await sq`SELECT COUNT(*)::int AS n FROM atx_usuarios WHERE perfil_id = ${b.id}`; if (em[0].n) return res.status(400).json({ success: false, error: `Há ${em[0].n} usuário(s) com este perfil — troque o perfil deles antes.` });
      await sq`DELETE FROM atx_perfis WHERE id = ${b.id}`; return fim({});
    }
    case 'telas_listar': { const t = await sq`SELECT * FROM atx_telas ORDER BY ordem, grupo, nome`; return res.status(200).json({ success: true, telas: t }); }
    case 'telas_sincronizar': {
      // o navegador manda as telas do menu atual; novas entram, as existentes têm grupo/ordem atualizados (nome editado é mantido)
      const lista = (Array.isArray(b.telas) ? b.telas : []).filter(t => t && /^[a-z0-9_-]{1,40}$/i.test(String(t.id))).slice(0, 400);
      for (const [i, t] of lista.entries()) {
        await sq`INSERT INTO atx_telas (id, nome, grupo, ordem, ativa) VALUES (${t.id}, ${String(t.nome || t.id).substring(0, 120)}, ${String(t.grupo || '').substring(0, 80)}, ${i}, true)
          ON CONFLICT (id) DO UPDATE SET grupo = EXCLUDED.grupo, ordem = EXCLUDED.ordem, atualizado_em = NOW()`;
      }
      const t = await sq`SELECT * FROM atx_telas ORDER BY ordem, grupo, nome`; return res.status(200).json({ success: true, telas: t, sincronizadas: lista.length });
    }
    case 'telas_salvar': {
      for (const t of (Array.isArray(b.telas) ? b.telas : []).slice(0, 400)) { if (!/^[a-z0-9_-]{1,40}$/i.test(String(t.id))) continue;
        await sq`UPDATE atx_telas SET nome = ${String(t.nome || t.id).substring(0, 120)}, ativa = ${t.ativa !== false}, atualizado_em = NOW() WHERE id = ${t.id}`; }
      return fim({});
    }
    default: return res.status(400).json({ success: false, error: 'ação inválida' });
  }
}

export default comGuarda(handler, 'auth');
