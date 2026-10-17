// Hook PostToolUse — confere a sintaxe do arquivo recém-editado (o equivalente ao "lint" do manual neste repositório).
// exit 2 devolve o erro ao agente para ele corrigir na hora.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

let entrada = {};
try { entrada = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) { process.exit(0); }
const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
const arq = path.resolve(raiz, entrada.tool_input?.file_path || '');
const rel = path.relative(raiz, arq).split(path.sep).join('/');
if (!fs.existsSync(arq) || rel.startsWith('..')) process.exit(0);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpm-'));
const erros = [];
const checar = (conteudo, ext, nome) => { const f = path.join(tmp, 'x' + erros.length + Math.random().toString(36).slice(2, 6) + ext); fs.writeFileSync(f, conteudo);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { erros.push(nome + ': ' + String(e.stderr || e.message).split('\n').filter(Boolean).slice(0, 4).join(' | ')); } };
const src = fs.readFileSync(arq, 'utf8');
if (/^(api|lib|scripts|\.claude)\/.*\.(m?js)$/.test(rel)) checar(src, '.mjs', rel);
else if (/^public\/.*\.js$/.test(rel)) checar(src, '.cjs', rel);
else if (rel === 'public/index.html') { let n = 0; for (const m of src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) { if (!m[1].trim() || /type="(application\/(ld\+)?json|text\/template)"/i.test(m[0])) continue; checar(m[1], '.cjs', `index.html <script> nº ${++n}`); } }
else if (/\.json$/.test(rel)) { try { JSON.parse(src); } catch (e) { erros.push(rel + ': JSON inválido — ' + e.message); } }
fs.rmSync(tmp, { recursive: true, force: true });
if (erros.length) { process.stderr.write('❌ Sintaxe quebrada depois da edição:\n' + erros.join('\n') + '\nCorrija antes de seguir.\n'); process.exit(2); }
