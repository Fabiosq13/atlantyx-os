#!/usr/bin/env node
// scripts/produto-ci.mjs — v3.238 · CI DOS PRODUTOS da Esteira de Entrega (produtos/<pasta>/<componente>/)
// Recebe a lista de arquivos alterados (argumentos ou --base <ref>) e, para cada COMPONENTE afetado (pasta com
// package.json, requirements.txt ou app.json), roda instalação, testes e build conforme o tipo:
//   • Node (web, retaguarda, API, cargas, integrações, IA): npm ci|install → npm test (se houver) → npm run build (se houver)
//   • Aplicativo Expo (app.json com "expo"): além do acima, npx tsc --noEmit (se houver tsconfig) e npx expo export
//   • Python (cargas): pip install -r requirements.txt → pytest (se houver testes)
// Sai com código 1 se algum componente falhar e escreve o resumo em Markdown (para comentar no PR).
// Uso: node scripts/produto-ci.mjs --base origin/main   ·   node scripts/produto-ci.mjs produtos/x/web/src/a.ts ...
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let arquivos = [];
const iBase = args.indexOf('--base');
if (iBase >= 0) {
  const base = args[iBase + 1] || 'origin/main';
  try { arquivos = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch (_) { arquivos = execSync(`git diff --name-only ${base}`, { encoding: 'utf8' }).split('\n').filter(Boolean); }
} else arquivos = args.filter(a => !a.startsWith('--'));
const resumoArq = args.includes('--resumo') ? args[args.indexOf('--resumo') + 1] : null;

// componente = pasta mais próxima (dentro de produtos/<pasta>/) que tenha manifesto
const MANIFESTOS = ['package.json', 'requirements.txt', 'pyproject.toml'];
function componenteDe(f) {
  if (!f.startsWith('produtos/')) return null;
  let d = path.dirname(f); const raizProduto = f.split('/').slice(0, 2).join('/');
  while (d && d.startsWith(raizProduto)) {
    if (MANIFESTOS.some(m => fs.existsSync(path.join(d, m)))) return d;
    if (d === raizProduto) break; d = path.dirname(d);
  }
  return null;
}
const comps = [...new Set(arquivos.map(componenteDe).filter(Boolean))].filter(d => !d.includes('node_modules') && !d.includes('/partitura'));
const linhas = ['## CI dos produtos', ''];
if (!comps.length) { linhas.push('Nenhum componente de produto alterado (sem package.json/requirements.txt nas pastas mexidas).'); fim(0); }

function rodar(cmd, cwd, tempoMin = 10) {
  const t0 = Date.now(); const r = spawnSync('bash', ['-lc', cmd], { cwd, encoding: 'utf8', timeout: tempoMin * 60000, env: { ...process.env, CI: 'true' } });
  const saida = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(-40).join('\n');
  return { ok: r.status === 0, cmd, s: Math.round((Date.now() - t0) / 1000), saida };
}
let falhou = 0;
for (const dir of comps) {
  const passos = [];
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const sc = pkg.scripts || {};
    passos.push(fs.existsSync(path.join(dir, 'package-lock.json')) ? 'npm ci --no-audit --no-fund' : 'npm install --no-audit --no-fund');
    if (sc.test && !/no test specified/.test(sc.test)) passos.push('npm test --silent');
    else passos.push('echo "⚠ sem script de teste (\\"test\\") — a fundação deve criar um" && false');
    if (sc['test:dados']) passos.push('npm run test:dados --silent');
    if (sc.build) passos.push('npm run build --silent');
    let app = null; try { app = JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf8')); } catch (_) {}
    if (app?.expo || pkg.dependencies?.expo) {
      if (fs.existsSync(path.join(dir, 'tsconfig.json'))) passos.push('npx tsc --noEmit');
      passos.push('npx expo export --output-dir .ci-export >/dev/null && echo "expo export ok"');
    }
  } else {
    passos.push('python3 -m pip install -q -r requirements.txt');
    if (fs.existsSync(path.join(dir, 'tests')) || fs.readdirSync(dir).some(f => /^test_.*\.py$/.test(f))) passos.push('python3 -m pytest -q');
    else passos.push('echo "⚠ sem testes (pytest)" && false');
  }
  linhas.push(`### \`${dir}\``);
  let ok = true;
  for (const p of passos) { const r = rodar(p, dir); linhas.push(`- ${r.ok ? '✅' : '❌'} \`${p}\` (${r.s}s)`); if (!r.ok) { ok = false; linhas.push('', '```', r.saida, '```'); break; } }
  if (!ok) falhou++;
  linhas.push('');
}
linhas.push(falhou ? `**${falhou} componente(s) com falha.**` : `**Todos os ${comps.length} componente(s) passaram.**`);
fim(falhou ? 1 : 0);

function fim(codigo) {
  const md = linhas.join('\n');
  console.log(md);
  if (resumoArq) fs.writeFileSync(resumoArq, md);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch (_) {} }
  process.exit(codigo);
}
