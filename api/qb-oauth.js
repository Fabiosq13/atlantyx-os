// ═══════════════════════════════════════════════════════════════════════════
// ATLANTYX OS — QuickBooks OAuth
//
// Serve para obter, UMA VEZ, os dois valores que nao existem em painel nenhum:
//   QB_REFRESH_TOKEN  e  QB_REALM_ID
//
// COMO USAR:
//   1. No developer.intuit.com, no seu app, em "Keys & OAuth", cadastre este
//      Redirect URI (troque pelo seu dominio real):
//        https://SEU-DOMINIO.vercel.app/api/qb-oauth
//   2. Garanta que QB_CLIENT_ID e QB_CLIENT_SECRET estao na Vercel.
//   3. Abra no navegador:
//        https://SEU-DOMINIO.vercel.app/api/qb-oauth?start=1
//   4. Faca login, escolha a empresa, clique em Autorizar.
//   5. A tela mostra o QB_REFRESH_TOKEN e o QB_REALM_ID. Copie os dois para a
//      Vercel (Settings -> Environment Variables) e faca redeploy.
// ═══════════════════════════════════════════════════════════════════════════

const AUTH_URL  = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPE     = 'com.intuit.quickbooks.accounting';

function redirectUri(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/api/qb-oauth`;
}

function page(title, corpo) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{background:#07080f;color:#eceefa;font:14px/1.6 system-ui,sans-serif;padding:32px;max-width:820px;margin:0 auto;}
h1{font-size:19px;margin:0 0 18px;}
.box{background:#0c0d18;border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:16px;margin:14px 0;}
.lbl{font:11px monospace;letter-spacing:1px;color:#7a7c9e;text-transform:uppercase;margin-bottom:6px;}
.val{font:13px monospace;word-break:break-all;background:#151628;border-radius:6px;padding:11px;color:#22d3a3;}
.warn{border-color:rgba(245,166,35,.35);background:rgba(245,166,35,.07);color:#f5a623;}
.err{border-color:rgba(255,91,91,.35);background:rgba(255,91,91,.07);color:#ff5b5b;}
a.btn{display:inline-block;background:#4f7cff;color:#fff;text-decoration:none;padding:11px 20px;border-radius:7px;font-weight:600;}
code{background:#151628;padding:2px 6px;border-radius:4px;font-size:12px;}
ol{padding-left:22px;} li{margin:7px 0;}
</style></head><body>${corpo}</body></html>`;
}

export default async function handler(req, res) {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const uri = redirectUri(req);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!clientId || !clientSecret) {
    return res.status(500).send(page('Faltam credenciais', `
      <h1>Atlantyx OS · QuickBooks OAuth</h1>
      <div class="box err">Faltam <code>QB_CLIENT_ID</code> e/ou <code>QB_CLIENT_SECRET</code>
      nas variaveis de ambiente da Vercel. Cadastre as duas, faca redeploy e volte aqui.</div>`));
  }

  const { code, realmId, error, start } = req.query;

  // ── Erro devolvido pela Intuit ──────────────────────────────────────────
  if (error) {
    return res.status(400).send(page('Erro na autorizacao', `
      <h1>Autorizacao recusada</h1>
      <div class="box err">A Intuit devolveu: <code>${String(error).slice(0, 200)}</code></div>
      <div class="box warn">A causa mais comum e o Redirect URI nao cadastrado.
      Em developer.intuit.com &rarr; seu app &rarr; Keys &amp; OAuth &rarr; Redirect URIs,
      o valor abaixo precisa estar cadastrado <em>exatamente</em> assim:
      <div class="val">${uri}</div></div>
      <a class="btn" href="/api/qb-oauth?start=1">Tentar de novo</a>`));
  }

  // ── Passo 1: manda o usuario para a Intuit ──────────────────────────────
  if (start || (!code && !realmId)) {
    const state = Math.random().toString(36).slice(2, 14);
    const url = `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}`
      + `&scope=${encodeURIComponent(SCOPE)}`
      + `&redirect_uri=${encodeURIComponent(uri)}`
      + `&response_type=code&state=${state}`;

    if (start) return res.writeHead(302, { Location: url }).end();

    return res.status(200).send(page('Conectar QuickBooks', `
      <h1>Atlantyx OS · Conectar QuickBooks</h1>
      <div class="box">Antes de clicar, confirme que este Redirect URI esta cadastrado no seu app
      em developer.intuit.com (Keys &amp; OAuth &rarr; Redirect URIs):
      <div class="val">${uri}</div></div>
      <a class="btn" href="${url}">Autorizar no QuickBooks</a>`));
  }

  // ── Passo 2: troca o code pelos tokens ──────────────────────────────────
  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}`
          + `&redirect_uri=${encodeURIComponent(uri)}`,
    });
    const d = await r.json();

    if (!r.ok || !d.refresh_token) {
      throw new Error(d.error_description || d.error || 'resposta sem refresh_token');
    }

    return res.status(200).send(page('Pronto', `
      <h1>Pronto — copie os dois valores</h1>
      <div class="box"><div class="lbl">QB_REFRESH_TOKEN</div>
        <div class="val">${d.refresh_token}</div></div>
      <div class="box"><div class="lbl">QB_REALM_ID</div>
        <div class="val">${realmId || '(nao veio no retorno — pegue em Configuracoes > Informacoes da empresa no QuickBooks)'}</div></div>
      <div class="box warn"><strong>Agora:</strong>
      <ol>
        <li>Vercel &rarr; Settings &rarr; Environment Variables &rarr; Production</li>
        <li>Cadastre <code>QB_REFRESH_TOKEN</code> e <code>QB_REALM_ID</code> com os valores acima</li>
        <li>Redeploy (variavel nova nao vale para deploy existente)</li>
      </ol>
      Este refresh token vence em 100 dias sem uso. Se der <code>invalid_grant</code>,
      volte em <code>/api/qb-oauth?start=1</code> e repita.</div>`));

  } catch (e) {
    return res.status(500).send(page('Falhou a troca', `
      <h1>Falhou ao trocar o code pelos tokens</h1>
      <div class="box err">${String(e.message).slice(0, 300)}</div>
      <div class="box warn">Confira se o Client Secret na Vercel e o atual (se voce rotacionou,
      o antigo nao serve) e se o Redirect URI cadastrado e exatamente:
      <div class="val">${uri}</div></div>
      <a class="btn" href="/api/qb-oauth?start=1">Tentar de novo</a>`));
  }
}
