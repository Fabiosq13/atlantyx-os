// scripts/bpm-gates.mjs — Gate automático da Mixagem (Método B.P.M.)
// Confere o diff de um PR (ou da branch local) contra a Partitura:
//   escopo     → só arquivos da trilha (partitura/escopos.json); public/index.html é compartilhado (aviso)
//   partitura  → PR de trilha precisa de partitura/trilhas/<ID>/spec.md e plano.md
//   banco      → DDL novo (CREATE/ALTER/DROP TABLE, índice) só na T5 ou com o rótulo "afinacao-aprovada"
//   versão     → ninguém mexe em ATX-vX.YY no PR (o robô de merge sobe a versão)
//   segredos   → chaves/tokens/strings de conexão em linhas adicionadas
//   legado     → cópias antigas na raiz (somente leitura)
// Uso:
//   node scripts/bpm-gates.mjs --local                      (branch atual × origin/main)
//   node scripts/bpm-gates.mjs --pr 123 --raiz <checkout>   (CI / robô de merge; lê corpo, branch e rótulos com o gh)
//   opções: --base <ref> · --trilha T3 --id 2026-10-11-x · --json
// As REGRAS (este script + lib/bpm.js + escopos.json) devem vir da main: o PR não pode afrouxar o próprio gate.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { podeAlterar, contaDDL, checaDDL, RX_SEGREDO, escopos } from '../lib/bpm.js';

const arg = (k, def = null) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : def; };
const raiz = path.resolve(arg('raiz') || process.env.ATX_RAIZ || process.cwd());
const base = arg('base') || 'origin/main';
const git = (...a) => execFileSync('git', a, { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const gh = (...a) => { try { return execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return null; } };
const E = escopos();

// ── contexto: PR, trilha, ID, rótulos ──
let corpo = process.env.BPM_PR_CORPO || '', branch = process.env.BPM_BRANCH || '', rotulos = (process.env.BPM_ROTULOS || '').split(',').filter(Boolean);
const pr = arg('pr'); const repo = process.env.REPO || process.env.GITHUB_REPOSITORY || '';
if (pr && pr !== true) { const j = gh('pr', 'view', String(pr), ...(repo ? ['-R', repo] : []), '--json', 'body,headRefName,labels');
  if (j) { const d = JSON.parse(j); corpo = d.body || corpo; branch = d.headRefName || branch; rotulos = (d.labels || []).map(l => l.name); } }
if (!branch) { try { branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim(); } catch (_) {} }
const lerLinha = (txt, chave) => (String(txt || '').match(new RegExp('^\\s*\\**' + chave + '\\**\\s*:\\s*\\**\\s*`?([\\w.-]+)', 'mi')) || [])[1] || null;
let trilha = arg('trilha') || lerLinha(corpo, 'BPM-Trilha'), id = arg('id') || lerLinha(corpo, 'BPM-ID'), origemTrilha = trilha ? 'PR' : null;
const nIssue = (branch.match(/^claude\/issue-(\d+)-/) || [])[1];
if ((!trilha || !id) && nIssue) { const j = gh('issue', 'view', nIssue, ...(repo ? ['-R', repo] : []), '--json', 'body,labels');
  if (j) { const d = JSON.parse(j); trilha = trilha || lerLinha(d.body, 'BPM-Trilha'); id = id || lerLinha(d.body, 'BPM-ID'); origemTrilha = origemTrilha || (trilha ? 'tarefa #' + nIssue : null); rotulos.push(...(d.labels || []).map(l => l.name)); } }
if (!trilha) { trilha = process.env.BPM_TRILHA || null; try { if (!trilha) { const [t, i] = fs.readFileSync(path.join(raiz, '.bpm-trilha'), 'utf8').split(/\r?\n/); trilha = t?.trim() || null; id = id || i?.trim() || null; } } catch (_) {} if (trilha) origemTrilha = origemTrilha || 'local'; }
trilha = trilha ? String(trilha).toUpperCase() : null;
const noturna = rotulos.includes('correcao-noturna') || /^\[Correção noturna\]/.test(corpo);

// ── diff ──
let arquivos = [], diff = '';
try { arquivos = git('diff', '--name-only', '--diff-filter=ACMRD', `${base}...HEAD`).split('\n').filter(Boolean); diff = git('diff', '-U0', '--no-color', `${base}...HEAD`); }
catch (e) { console.error('não consegui calcular o diff contra ' + base + ': ' + String(e.message).split('\n')[0]); process.exit(2); }
const porArquivo = {}; let atual = null;
for (const l of diff.split('\n')) {
  if (l.startsWith('+++ ')) { const f = l.slice(4).replace(/^b\//, ''); if (f !== '/dev/null') { atual = f; porArquivo[f] ||= { add: [], del: [] }; } continue; }
  if (l.startsWith('--- ')) { const f = l.slice(4).replace(/^a\//, ''); if (f !== '/dev/null') { atual = f; porArquivo[f] ||= { add: [], del: [] }; } continue; }
  if (!atual) continue;
  if (l.startsWith('+') && !l.startsWith('+++')) porArquivo[atual].add.push(l.slice(1));
  else if (l.startsWith('-') && !l.startsWith('---')) porArquivo[atual].del.push(l.slice(1));
}

const res = { trilha, id, origem_trilha: origemTrilha, branch, arquivos: arquivos.length, noturna, gates: [] };
const gate = (nome, status, itens = []) => res.gates.push({ nome, status, itens });

// escopo
if (trilha) {
  if (!E.trilhas[trilha]) gate('escopo', 'erro', [`trilha "${trilha}" não existe em partitura/escopos.json`]);
  else { const fora = [], comp = [];
    for (const f of arquivos) { const r = podeAlterar(trilha, f, { id }); if (!r.ok) fora.push(r.motivo); else if (r.compartilhado) comp.push(f + ' (compartilhado: o revisor confere se só a seção da tela da trilha mudou)'); }
    gate('escopo', fora.length ? 'erro' : comp.length ? 'aviso' : 'ok', [...fora, ...comp]); }
} else gate('escopo', noturna ? 'ok' : 'aviso', [noturna ? 'correção noturna (fora das trilhas — validada e mesclada pelo robô)' : 'PR sem trilha B.P.M. (sem linha "BPM-Trilha:" no PR nem na tarefa) — só o Maestro trabalha fora de trilha']);

// partitura
if (trilha && id) {
  const tem = f => fs.existsSync(path.join(raiz, 'partitura', 'trilhas', id, f));
  const falta = ['spec.md', 'plano.md'].filter(f => !tem(f));
  gate('partitura', falta.length ? 'erro' : tem('mixagem.md') ? 'ok' : 'aviso', [...falta.map(f => `falta partitura/trilhas/${id}/${f}`), ...(!falta.length && !tem('mixagem.md') ? [`mixagem.md ainda não preenchido (rode /bpm-mixagem)`] : [])]);
} else if (trilha) gate('partitura', 'aviso', ['PR de trilha sem "BPM-ID:" — não dá para conferir spec.md/plano.md']);

// banco
const ddl = Object.entries(porArquivo).filter(([f, x]) => /\.(m?js)$/.test(f || '') && checaDDL(f) && contaDDL(x.add.join('\n')) > contaDDL(x.del.join('\n'))).map(([f]) => f);
if (ddl.length) gate('banco', trilha === 'T5' || rotulos.includes('afinacao-aprovada') ? 'aviso' : 'erro', ddl.map(f => `${f}: mudança de schema (CREATE/ALTER/DROP TABLE ou índice)` + (trilha === 'T5' ? ' — T5: confira a proposta em partitura/contratos/banco.md' : ' — só a T5 Dados aplica, depois da aprovação do Afinador (ou rótulo "afinacao-aprovada")')));
else gate('banco', 'ok');

// versão
const rxV = /ATX-v\d+\.\d+|ATLANTYX v\d+\.\d+/;
const vers = Object.entries(porArquivo).filter(([, x]) => x.add.some(l => rxV.test(l)) || x.del.some(l => rxV.test(l))).map(([f]) => f);
gate('versão', vers.length && !rotulos.includes('versao-permitida') ? 'erro' : 'ok', vers.map(f => `${f}: o PR altera a versão ATX-vX.YY — remova; o robô de merge sobe a versão ao mesclar`));

// segredos
const seg = []; for (const [f, x] of Object.entries(porArquivo)) x.add.forEach(l => { if (RX_SEGREDO.test(l)) seg.push(`${f}: possível segredo em linha adicionada ("${l.trim().substring(0, 24)}…")`); });
gate('segredos', seg.length ? 'erro' : 'ok', seg);

// legado
const leg = arquivos.filter(f => (E.legado_somente_leitura || []).includes(f));
gate('legado', leg.length ? 'aviso' : 'ok', leg.map(f => `${f} é cópia legada na raiz — o código vivo está em api/`));

const erros = res.gates.filter(g => g.status === 'erro').length;
res.resultado = erros ? 'reprovado' : 'aprovado';
if (arg('json')) { console.log(JSON.stringify(res, null, 2)); process.exit(erros ? 1 : 0); }
const ICO = { ok: '✅', aviso: '⚠️', erro: '❌' };
const md = [`### Gates B.P.M. — ${erros ? '❌ reprovado' : '✅ aprovado'}`,
  `Trilha: **${trilha ? trilha + ' ' + (E.trilhas[trilha]?.nome || '') : '—'}**${id ? ' · ID `' + id + '`' : ''}${origemTrilha ? ' (de: ' + origemTrilha + ')' : ''} · branch \`${branch}\` · ${arquivos.length} arquivo(s)`, '',
  '| Gate | Resultado | Detalhe |', '|---|---|---|',
  ...res.gates.map(g => `| ${g.nome} | ${ICO[g.status]} ${g.status} | ${g.itens.slice(0, 8).join('<br>').replace(/\|/g, '/') || '—'}${g.itens.length > 8 ? '<br>… +' + (g.itens.length - 8) : ''} |`)].join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch (_) {}
if (process.env.GITHUB_ACTIONS) res.gates.filter(g => g.status === 'erro').forEach(g => g.itens.forEach(i => console.log(`::error title=B.P.M. · ${g.nome}::${i}`)));
process.exit(erros ? 1 : 0);
