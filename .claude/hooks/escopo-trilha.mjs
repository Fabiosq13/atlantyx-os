// Hook PreToolUse (Edit/Write/MultiEdit) — Método B.P.M.: bloqueia (exit 2) o que a trilha não pode fazer.
//   • editar arquivo fora do escopo da trilha (partitura/escopos.json)
//   • criar/alterar tabela, coluna ou índice (DDL) fora da T5 Dados
//   • mudar a versão ATX-vX.YY (só o robô de merge sobe a versão)
// Trilha: variável BPM_TRILHA, ou arquivo .bpm-trilha na raiz ("T3" na 1ª linha, ID na 2ª). Sem trilha = Maestro → libera.
import fs from 'fs';
import path from 'path';
import { podeAlterar, contaDDL, checaDDL, versoes, normalizar } from '../../lib/bpm.js';

let entrada = {};
try { entrada = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) { process.exit(0); }
const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
let trilha = (process.env.BPM_TRILHA || '').trim().toUpperCase(), id = (process.env.BPM_ID || '').trim();
if (!trilha) { try { const [t, i] = fs.readFileSync(path.join(raiz, '.bpm-trilha'), 'utf8').split(/\r?\n/); trilha = (t || '').trim().toUpperCase(); id = id || (i || '').trim(); } catch (_) {} }
if (!trilha) process.exit(0);

const ti = entrada.tool_input || {};
const arquivo = ti.file_path || ti.notebook_path || ti.path || '';
if (!arquivo) process.exit(0);
const bloquear = msg => { process.stderr.write(`⛔ B.P.M. · trilha ${trilha}${id ? ' (' + id + ')' : ''}: ${msg}\n`); process.exit(2); };

const r = podeAlterar(trilha, arquivo, { id: id || null, raiz });
if (!r.ok) bloquear(r.motivo);

// texto antes × depois desta edição
const abs = path.resolve(raiz, arquivo);
let antes = '', depois = '';
if (entrada.tool_name === 'Write') { try { antes = fs.readFileSync(abs, 'utf8'); } catch (_) {} depois = ti.content || ''; }
else if (Array.isArray(ti.edits)) { antes = ti.edits.map(e => e.old_string || '').join('\n'); depois = ti.edits.map(e => e.new_string || '').join('\n'); }
else { antes = ti.old_string || ''; depois = ti.new_string || ''; }

if (trilha !== 'T5' && checaDDL(normalizar(arquivo, raiz)) && contaDDL(depois) > contaDDL(antes))
  bloquear('mudança de schema (CREATE/ALTER/DROP TABLE ou índice) é exclusiva da T5 Dados. Registre a necessidade em "Interseções" do plano.md e peça ao subagent afinador uma proposta em partitura/contratos/banco.md.');
if (versoes(depois) && versoes(depois) !== versoes(antes) && !process.env.BPM_PERMITE_VERSAO)
  bloquear('não altere a versão ATX-vX.YY / ATLANTYX vX.YY — o robô de merge sobe a versão ao mesclar.');
if (r.compartilhado) process.stderr.write(`ℹ B.P.M.: ${arquivo} é compartilhado — ${r.compartilhado}\n`);
process.exit(0);
