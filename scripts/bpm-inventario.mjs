// scripts/bpm-inventario.mjs — gera o inventário dos contratos a partir do código real (Método B.P.M.)
//   node scripts/bpm-inventario.mjs          → reescreve partitura/contratos/{api,banco,eventos}.md (seções automáticas)
//   node scripts/bpm-inventario.mjs --checar → só confere se o inventário está em dia (exit 1 se mudou) — usado no CI
// É heurístico (lê o código, não executa): o Afinador revisa e completa as seções manuais.
// Cada arquivo tem uma parte manual (acima de <!-- inventario:inicio -->) que este script NUNCA altera.
import fs from 'fs';
import path from 'path';
import { escopos, donaDe } from '../lib/bpm.js';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rel = f => path.relative(RAIZ, f).split(path.sep).join('/');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const E = escopos();
const apis = fs.readdirSync(path.join(RAIZ, 'api')).filter(f => f.endsWith('.js') && !/-v\d+\.\d+/.test(f)).map(f => 'api/' + f);
const libs = fs.readdirSync(path.join(RAIZ, 'lib')).filter(f => f.endsWith('.js')).map(f => 'lib/' + f);
const nomeT = t => t ? `${t} ${E.trilhas[t]?.nome || ''}`.trim() : '— (Maestro)';

// ── API: ações por arquivo ──
function acoes(src) {
  const s = new Set();
  for (const m of src.matchAll(/(?:\baction|\bacao|\bop)\s*={2,3}\s*'([\w-]+)'/g)) s.add(m[1]);
  for (const m of src.matchAll(/case '([\w-]+)':/g)) s.add(m[1]);
  // objetos de despacho: "acoes = {" / "const A = {" seguidos de "nome: (async) (" ou "nome: () =>"
  for (const bloco of src.matchAll(/(?:acoes|ACOES|handlers|rotas|actions)\s*=\s*\{([\s\S]*?)\n\s{0,4}\};/g))
    for (const m of bloco[1].matchAll(/^\s{4,8}([a-z_][\w]*)\s*:\s*(?:async\s*)?(?:\(|[a-z_]\w*\s*=>)/gm)) s.add(m[1]);
  return [...s].filter(x => x.length > 1).sort();
}
function descricao(src) {
  const linhas = src.split('\n').slice(0, 12).filter(l => /^\s*\/\//.test(l)).map(l => l.replace(/^\s*\/\/\s?/, '').trim()).filter(Boolean);
  return (linhas.find(l => !/^api\//.test(l) || l.length > 30) || linhas[0] || '').replace(/^api\/[\w.-]+\s*[—-]\s*/, '').substring(0, 180);
}
const metodosGet = src => /req\.method\s*===?\s*'GET'/.test(src);
const crons = (() => { try { return JSON.parse(ler('vercel.json')).crons || []; } catch (_) { return []; } })();

let api = `| Rota | Trilha dona | O que faz | Ações (POST { action }) | GET |\n|---|---|---|---|---|\n`;
for (const f of apis) { const src = ler(f), a = acoes(src);
  api += `| \`/${f.replace(/\.js$/, '')}\` | ${nomeT(donaDe(f))} | ${descricao(src).replace(/\|/g, '/') || '—'} | ${a.length ? a.map(x => '`' + x + '`').join(' ') : '—'} | ${metodosGet(src) ? 'sim' : '—'} |\n`; }

// ── Banco: tabelas, dona e leitoras ──
const tabelas = {};
const fontes = [...apis, ...libs];
for (const f of fontes) { const src = ler(f);
  for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][\w]*)/gi)) { const t = m[1].toLowerCase(); if (t.startsWith('_atx_teste')) continue; (tabelas[t] ||= { criam: new Set(), colunas: new Set(), leem: new Set(), escrevem: new Set() }).criam.add(f); }
  for (const m of src.matchAll(/ALTER TABLE\s+([a-z_][\w]*)\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([a-z_]\w*)/gi)) { const t = m[1].toLowerCase(); if (t.startsWith('_atx_teste') || /^if$/i.test(m[2])) continue; (tabelas[t] ||= { criam: new Set(), colunas: new Set(), leem: new Set(), escrevem: new Set() }).colunas.add(m[2] + ' (' + f.replace(/^api\//, '') + ')'); }
}
for (const f of fontes) { const src = ler(f);
  for (const t of Object.keys(tabelas)) {
    if (new RegExp(`(?:FROM|JOIN)\\s+${t}\\b`, 'i').test(src)) tabelas[t].leem.add(f);
    if (new RegExp(`(?:INSERT INTO|UPDATE|DELETE FROM)\\s+${t}\\b`, 'i').test(src)) tabelas[t].escrevem.add(f);
  } }
const curto = s => [...s].map(f => f.replace(/^(api|lib)\//, '').replace(/\.js$/, '')).sort().join(', ');
let banco = `| Tabela | Trilha dona (escreve) | Criada em | Escrevem | Leem | Colunas adicionadas depois |\n|---|---|---|---|---|---|\n`;
for (const [t, x] of Object.entries(tabelas).sort()) {
  const donas = [...new Set([...x.criam].map(f => donaDe(f)).filter(Boolean))];
  const compart = donas.length > 1 || x.escrevem.size > x.criam.size;
  banco += `| \`${t}\` | ${donas.map(nomeT).join(' + ') || '—'}${compart ? ' ⚠' : ''} | ${curto(x.criam)} | ${curto(x.escrevem) || '—'} | ${curto(x.leem) || '—'} | ${[...x.colunas].slice(0, 8).join(', ') || '—'} |\n`; }
banco += `\n⚠ = tabela criada ou escrita por mais de um arquivo: ponto de interseção — qualquer mudança passa pela Afinação.\n`;

// ── Eventos: crons, workflows e chamadas entre APIs ──
let ev = `### Agendamentos (Vercel cron · horário UTC)\n\n| Quando (cron) | Chama | Trilha |\n|---|---|---|\n`;
for (const c of crons) { const f = 'api/' + c.path.replace(/^\/api\//, '').split('?')[0] + '.js'; ev += `| \`${c.schedule}\` | \`${c.path}\` | ${nomeT(donaDe(f))} |\n`; }
ev += `\n### Workflows do GitHub Actions\n\n| Arquivo | Dispara em | Nome |\n|---|---|---|\n`;
for (const w of fs.readdirSync(path.join(RAIZ, '.github', 'workflows')).filter(f => /\.ya?ml$/.test(f)).sort()) {
  const src = ler('.github/workflows/' + w); const on = (src.match(/^on:\s*\n((?:\s+.+\n)+?)(?=\S)/m) || [])[1] || '';
  const gat = [...on.matchAll(/^\s{2}([a-z_]+):/gm)].map(m => m[1]).join(', ');
  ev += `| \`${w}\` | ${gat || '—'} | ${(src.match(/^name:\s*(.+)$/m) || [])[1] || '—'} |\n`; }
ev += `\n### Chamadas entre módulos (import direto)\n\n| De | Importa | Trilha de origem → destino |\n|---|---|---|\n`;
for (const f of apis) { const src = ler(f);
  for (const m of src.matchAll(/import\s*\(\s*'\.\/([\w.-]+)'\s*\)|from\s+'\.\/([\w.-]+)'/g)) { const alvo = 'api/' + (m[1] || m[2]); const a = donaDe(f), b = donaDe(alvo);
    ev += `| \`${f}\` | \`${alvo}\` | ${a || '—'} → ${b || '—'}${a !== b ? ' (interseção)' : ''} |\n`; } }

const MARCA = '<!-- inventario:inicio -->';
function escrever(arq, titulo, corpoManual, auto) {
  const p = path.join(RAIZ, 'partitura', 'contratos', arq);
  const atual = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const manual = atual.includes(MARCA) ? atual.split(MARCA)[0] : `# ${titulo}\n\n${corpoManual}\n\n`;
  const novo = manual + MARCA + `\n## Inventário automático\n\n_Gerado por \`node scripts/bpm-inventario.mjs\` a partir do código. Não edite abaixo desta linha — edite o código ou a parte manual acima._\n\n` + auto;
  return { p, atual, novo };
}
const arquivos = [
  escrever('api.md', 'Contrato de API — Atlantyx OS', `Todas as rotas são funções serverless da Vercel em \`api/*.js\`, protegidas por \`comGuarda(handler, nome)\` (lib/qa-guard.js): sessão do usuário, \`Authorization: Bearer CRON_SECRET\` (robôs e crons) ou rota pública declarada em \`PUBLICAS\`.
Convenção: \`POST /api/<modulo>\` com corpo \`{ action, ...campos }\` → \`{ success: true, ... }\` ou \`{ success: false, error }\` (HTTP 4xx/5xx).

## Regras do contrato
- Nova ação = nova linha na tabela abaixo (o inventário pega sozinho) + descrição do payload aqui em cima se outra trilha for consumir.
- Mudar o formato de resposta de uma ação que outra trilha consome **quebra contrato**: nova ação (ou campo novo opcional) + aviso na Batida. Nunca renomeie nem remova campo usado por outra trilha no mesmo PR.
- Rota pública nova (sem login) é mudança de contrato da T1 e passa pela Afinação.

## Contratos detalhados (manuais)

### POST /api/tendencias · envio_iniciar / envio_parte / envio_concluir / produtor_enviar
Dono: T3 · Versão: 1 · Consumidores: public/index.html (S2 · Reação a Tendências)
Request: envio_iniciar { peca_id, nome, tamanho, partes, content_type } → { envio_id } · envio_parte { envio_id, i, b64 (≤3,4 MB) } → { ok } · envio_concluir { envio_id } → { link } · produtor_enviar { peca_id, para? } → { para[], via }
Erros: 500 "envio não encontrado" | "faltam N parte(s)" | "vídeo completo acima de 200 MB"
GET público: /api/tendencias?baixar=<token>[&parte=i] (expira em 30 dias)`, api),
  escrever('banco.md', 'Contrato de Banco — Atlantyx OS (Neon Postgres)', `O schema vive dentro das próprias APIs: cada módulo cria suas tabelas com \`CREATE TABLE IF NOT EXISTS\` / \`ALTER TABLE … ADD COLUMN IF NOT EXISTS\` na primeira chamada (função getSql/garantirTabelas). Não há ORM nem pasta de migrações.
**Dono único do schema: T5 Dados, sob o Afinador.** Nenhuma outra trilha cria tabela, coluna ou índice — o hook do Claude Code e o CI (gate "banco") bloqueiam.

## Fluxo de mudança no banco
1. A trilha que precisa do dado descreve a necessidade no seu plano.md, seção **Interseções**.
2. O subagent **afinador** propõe o DDL aqui (seção "Propostas") marcando tabela dona e leitoras.
3. O Afinador humano aprova na Afinação semanal (ou Batida extraordinária).
4. A **T5** aplica o DDL no getSql() do módulo dono, em PR próprio, antes do PR da trilha consumidora.
5. A trilha consumidora só usa a coluna depois do merge.

## Regras de migração
- Sempre aditiva e idempotente: \`IF NOT EXISTS\`, coluna nova com DEFAULT ou NULL.
- Nunca apagar/renomear coluna no mesmo PR em que ela deixa de ser usada; DROP só em PR próprio, depois de uma versão sem uso.
- Dados de clientes reais nunca em seeds, fixtures ou testes — usar dados sintéticos.
- Tokens OAuth (Google, QuickBooks, HubSpot) e senhas ficam criptografados e nunca voltam para o front.
- \`kv_store\` (chave/valor) é compartilhada: cada trilha usa prefixo próprio na chave (ex.: \`agente:ideias:\`, \`qa:\`, \`higienizacao_\`).

## Propostas em análise (afinador)
_(nenhuma)_`, banco),
  escrever('eventos.md', 'Eventos entre módulos — Atlantyx OS', `Como os módulos e os squads de agentes (S1, S2, S7…) conversam: crons da Vercel, workflows do GitHub, chamadas diretas entre APIs e chaves compartilhadas no kv_store.

## Regras
- Cron novo ou horário alterado = mudança de contrato da trilha dona + linha no vercel.json (T1).
- Chamada direta de uma API a outra (import) cria dependência entre trilhas: registre aqui e no plano.md das duas.
- Robôs (GitHub Actions) chamam as APIs com \`Authorization: Bearer CRON_SECRET\`; nada de segredo em código.
- Envio externo (e-mail, WhatsApp, posts) só com aprovação humana ou regra explícita já aprovada (ex.: e-mail financeiro das 8h). Gmail de agentes = rascunho.`, ev),
];
// CODEOWNERS espelha escopos.json (dono_humano de cada trilha)
{ let o = '# Método B.P.M. — dono humano de cada trilha. GERADO de partitura/escopos.json por node scripts/bpm-inventario.mjs (não edite à mão).\n# Troque "dono_humano" no escopos.json quando o papel for delegado e rode o script de novo.\n# A aprovação do dono só vira obrigatória quando a branch protection da main exigir "review from Code Owners".\n\n# Padrão: Maestro\n*  @Fabiosq13\n';
  for (const [k, t] of Object.entries(E.trilhas)) {
    if (k === 'T5') { o += `\n# T5 ${t.nome} (${t.naipe}) — contratos e schema\n/api/db.js  ${t.dono_humano}\n/partitura/contratos/  ${t.dono_humano}\n`; continue; }
    o += `\n# ${k} ${t.nome} (${t.naipe})\n` + t.pode_alterar.map(p => '/' + p.replace(/\/\*\*$/, '/') + '  ' + t.dono_humano).join('\n') + '\n'; }
  o += '\n# Partitura-mestre — Maestro\n/CLAUDE.md  @Fabiosq13\n/partitura/escopos.json  @Fabiosq13\n/partitura/trilhas.md  @Fabiosq13\n';
  const p = path.join(RAIZ, '.github', 'CODEOWNERS'); arquivos.push({ p, atual: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '', novo: o }); }
const checar = process.argv.includes('--checar');
let mudou = 0;
for (const { p, atual, novo } of arquivos) {
  if (atual === novo) continue; mudou++;
  if (checar) console.log('desatualizado: ' + rel(p)); else { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, novo); console.log('escrito: ' + rel(p)); }
}
console.log(`${apis.length} APIs · ${Object.keys(tabelas).length} tabelas · ${crons.length} crons` + (checar ? (mudou ? ` · ${mudou} contrato(s) desatualizado(s) — rode node scripts/bpm-inventario.mjs` : ' · inventário em dia') : ''));
if (checar && mudou) process.exit(1);
