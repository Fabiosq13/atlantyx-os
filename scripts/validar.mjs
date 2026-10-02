// v3.45 — validação usada antes do merge automático das correções noturnas (e útil em qualquer PR):
//   1) node --check em api/*.js, lib/*.js e public/*.js
//   2) node --check em cada bloco <script> inline de public/index.html
//   3) abre public/index.html num Chromium (APIs simuladas) e falha se houver erro de JavaScript na carga
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ATX_RAIZ: pasta do código a validar (o workflow roda o validador da main contra a branch do PR)
const raiz = process.env.ATX_RAIZ ? path.resolve(process.env.ATX_RAIZ) : path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const falhas = [];
const checar = (f, nome) => { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { falhas.push(`${nome || path.basename(f)}: ${String(e.stderr || e.message).split('\n').slice(0, 4).join(' ')}`); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atx-'));
// api/ e lib/ são módulos ES: checa uma cópia .mjs (fora do projeto o Node às vezes "adivinha" o tipo e deixa erro passar)
for (const dir of ['api', 'lib']) {
  const d = path.join(raiz, dir); if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) if (/\.(m?js)$/.test(f)) { const c = path.join(tmp, dir + '__' + f.replace(/\.m?js$/, '.mjs')); fs.copyFileSync(path.join(d, f), c); checar(c, path.join(dir, f)); }
}
// public/*.js são scripts do navegador (clássicos)
for (const f of fs.readdirSync(path.join(raiz, 'public'))) if (/\.js$/.test(f)) { const c = path.join(tmp, 'public__' + f.replace(/\.js$/, '.cjs')); fs.copyFileSync(path.join(raiz, 'public', f), c); checar(c, 'public/' + f); }
const html = fs.readFileSync(path.join(raiz, 'public', 'index.html'), 'utf8');
let n = 0; const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi; let m;
while ((m = re.exec(html))) { if (!m[1].trim() || /type="(application\/(ld\+)?json|text\/template)"/i.test(m[0])) continue; const f = path.join(tmp, `bloco${++n}.cjs`); fs.writeFileSync(f, m[1]); checar(f, `public/index.html <script> nº ${n}`); }
console.log(`sintaxe: ${n} blocos <script> + arquivos JS verificados`);

if (!process.argv.includes('--sem-navegador')) {
  const { chromium } = await import('playwright');
  const b = await chromium.launch(); const pg = await b.newPage(); const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') && !u.includes('/api/')) return r.continue(); if (!u.startsWith('file:')) return r.abort();
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
  await pg.goto('file://' + path.join(raiz, 'public', 'index.html')); await pg.waitForTimeout(3000);
  await b.close();
  erros.forEach(e => falhas.push('erro de JavaScript ao carregar a página: ' + e));
  console.log('carga da página: ' + (erros.length ? erros.length + ' erro(s)' : 'ok'));
}
if (falhas.length) { console.error('VALIDAÇÃO FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1); }
console.log('VALIDAÇÃO OK');
