import { comGuarda } from '../lib/qa-guard.js';
// api/agente-ideias.js — v3.45 ESTEIRA DE DEMANDAS IA (Fase 1: Agente de Produto)
//
// Um "PM virtual" pensa o Atlantyx OS em ciclos agendados (e no botão "Pensar agora"): lê as telas do
// sistema, o que foi entregue recentemente (commits), o último relatório do agente de QA/Segurança, o
// pipeline de ideias e as decisões anteriores do fundador — e sugere demandas de implementação.
//
// REGRA DE OURO: nada passa sozinho. Toda demanda entra como "sugerida" no Kanban e só anda com o clique
// do fundador. Aprovada → abre uma tarefa no GitHub com "@claude" (workflow claude-correcao.yml), o Claude
// implementa numa branch e abre um PULL REQUEST — que também só vai para o ar quando o fundador faz o merge.
//
// POST { action }:
//   listar · gerar { squad } · decidir { id, decisao: 'aprovar'|'recusar', obs } · editar { id, campos }
//   mover { id, status } (só para 'implementada'|'arquivada'|'sugerida') · excluir { id } · nova { dados }
//   sincronizar (estado das tarefas no GitHub) · config · config_salvar { ... }
// GET ?cron=1 — ciclo agendado (respeita a configuração: ligado/desligado, frequência, máximo por ciclo)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const STATUS = ['sugerida', 'aprovada', 'em_execucao', 'implementada', 'recusada', 'arquivada'];
const CFG_PADRAO = { ativo: true, frequencia_horas: 24, max_por_ciclo: 3, squads: { produto: true }, foco: '' };

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await _sql`CREATE TABLE IF NOT EXISTS agente_demandas (
    id TEXT PRIMARY KEY, squad TEXT, tipo TEXT, titulo TEXT, status TEXT DEFAULT 'sugerida', prioridade INT DEFAULT 3,
    dados JSONB, decisao_obs TEXT, decidido_em TIMESTAMPTZ, issue_numero INT, issue_url TEXT, ciclo TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  return _sql;
}
const parse = v => { if (v == null) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return null; } } return v; };
async function kvGet(key) { const sql = await getSql(); try { const r = await sql`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`; return parse(r[0]?.value); } catch (_) { return null; } }
async function kvSet(key, value) { const sql = await getSql(); await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; }
async function config() { return { ...CFG_PADRAO, ...((await kvGet('agente:ideias:config')) || {}) }; }
const novoId = () => 'dem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const linha = r => ({ ...r, dados: parse(r.dados) || {} });

function parseJSON(text) {
  const t = String(text || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const i = t.indexOf('['), j = t.lastIndexOf(']'), a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.substring(a, b + 1)); } catch (_) {} }
  if (i >= 0 && j > i) { try { return JSON.parse(t.substring(i, j + 1)); } catch (_) {} }
  return null;
}
async function claude(system, user, maxTokens = 7000) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('IA: ' + (d?.error?.message || r.status));
  return (d.content || []).map(c => c.text || '').join('');
}

// ── contexto do Agente de Produto ─────────────────────────────────────────
function telasDoSistema() {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const out = []; let grupo = '';
    const re = /<div class="sg-divisor">([^<]+)<\/div>|<span class="sg-lbl">([^<]+)<\/span>|<div class="sbi[^"]*" onclick="nav\('([\w-]+)'[^>]*>([\s\S]*?)<\/div>/g; let m;
    while ((m = re.exec(html))) {
      if (m[1]) grupo = m[1].trim(); else if (m[2]) out.push('## ' + grupo + ' › ' + m[2].trim());
      else if (m[3]) out.push(`- ${m[4].replace(/<[^>]+>/g, ' ').replace(/&#\d+;|&\w+;/g, '').replace(/\s+/g, ' ').trim()} (tela ${m[3]})`);
    }
    const versao = (html.match(/ATX-v(\d+\.\d+)/) || [])[1];
    return { versao, telas: out.join('\n').substring(0, 9000) };
  } catch (e) { return { versao: null, telas: '(não consegui ler a lista de telas: ' + e.message + ')' }; }
}
async function commitsRecentes() {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os';
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=40`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'atlantyx-os-agente', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
    if (!r.ok) return [];
    return (await r.json()).map(c => String(c.commit?.message || '').split('\n')[0].substring(0, 180));
  } catch (_) { return []; }
}
async function ultimoQA() {
  const hist = (await kvGet('qa:historico')) || [];
  const out = [];
  for (const h of hist.slice(0, 4)) {
    const rel = await kvGet('qa:exec:' + h.id);
    const ach = (rel?.achados || []).filter(a => a.sev !== 'info').slice(0, 15).map(a => `[${a.sev}] ${a.titulo} — ${a.rotulo || a.tela || ''}`);
    if (ach.length) out.push({ em: h.em, tipo: h.tipo, achados: ach });
    if (out.length >= 2) break;
  }
  return out;
}
async function pipelineIdeias() {
  const sql = await getSql();
  try { const r = await sql`SELECT data FROM ideias ORDER BY atualizado_em DESC LIMIT 40`;
    return r.map(x => parse(x.data) || {}).filter(x => x.titulo).map(x => `${String(x.titulo).replace(/<[^>]+>/g, ' ').substring(0, 120)} [${x.stage || 'Recebida'}]`); } catch (_) { return []; }
}
async function historicoDemandas() {
  const sql = await getSql();
  const r = await sql`SELECT titulo, status, decisao_obs, squad FROM agente_demandas ORDER BY criado_em DESC LIMIT 120`;
  return r;
}

const SYS_PRODUTO = `Você é o GERENTE DE PRODUTO (PM) virtual do Atlantyx OS — o sistema operacional de gestão da Atlantyx (empresa brasileira B2B de dados, BI, engenharia de dados e IA; 17 anos; clientes como CPFL Energia, Enel, Caixa Capitalização, Grupo Jelta). O fundador e CEO (Fabio Quintanilha) usa o sistema todos os dias para finanças (QuickBooks), PMO, vendas/propostas, marketing (Metricool, HubSpot, WhatsApp) e ideias de novos negócios.
Sua função: pensar o produto e sugerir DEMANDAS DE IMPLEMENTAÇÃO concretas, que um desenvolvedor (o Claude, via GitHub) consiga implementar. Cada demanda vai para um Kanban e só é feita se o fundador aprovar.
Bons tipos de demanda: corrigir o que o QA apontou e ainda dói; automatizar trabalho manual recorrente do fundador; ligar telas/dados que hoje estão soltos; melhorar o que gera receita (vendas, propostas, leads, cobrança); reduzir risco (segurança, dados, falhas de integração); simplificar telas confusas.
Regras:
- Seja específico ao Atlantyx OS: cite as telas reais (ids da lista) e o que muda nelas. Nada genérico do tipo "melhorar a UX".
- Uma demanda = uma entrega que cabe num pull request (no máximo alguns dias de trabalho).
- NÃO repita demandas já sugeridas, aprovadas, implementadas ou recusadas (lista abaixo). Aprenda com os MOTIVOS das recusas.
- Não proponha o que os commits recentes mostram que já foi feito.
- Priorize pelo impacto para o negócio do fundador. Prefira poucas demandas boas a muitas médias.
Responda SOMENTE com um array JSON:
[{"titulo":"curto e claro","problema":"o que dói hoje, com evidência (tela, achado do QA, dado)","proposta":"o que construir, em 3-6 linhas","telas_afetadas":["ids"],"como_implementar":"orientação técnica para o desenvolvedor: arquivos (public/index.html, api/*.js, lib/*.js), APIs, tabelas, cuidados","criterios_aceite":["como saber que ficou pronto"],"impacto":1-5,"esforco":"P|M|G","risco":"baixo|medio|alto","area":"financeiro|vendas|marketing|pmo|ideias|juridico|rh|plataforma|seguranca","metrica_sucesso":"como medir o ganho"}]`;

async function gerarProduto({ max = 3, foco = '' } = {}) {
  const [t, commits, qa, ideias, hist] = await Promise.all([telasDoSistema(), commitsRecentes(), ultimoQA(), pipelineIdeias(), historicoDemandas()]);
  const fmtHist = hist.map(h => `- [${h.status}] ${h.titulo}${h.status === 'recusada' && h.decisao_obs ? ' — motivo da recusa: ' + h.decisao_obs : ''}`).join('\n');
  const user = `VERSÃO ATUAL: ATX-v${t.versao || '?'}
${foco ? 'FOCO PEDIDO PELO FUNDADOR NESTE CICLO: ' + foco + '\n' : ''}
TELAS DO SISTEMA (menu):
${t.telas}

O QUE FOI ENTREGUE RECENTEMENTE (commits, mais novos primeiro):
${commits.length ? commits.map(c => '- ' + c).join('\n') : '(indisponível)'}

ÚLTIMOS RELATÓRIOS DO AGENTE DE QA/SEGURANÇA:
${qa.length ? qa.map(q => `${q.em} (${q.tipo}):\n${q.achados.map(a => '  ' + a).join('\n')}`).join('\n') : '(nenhum relatório salvo)'}

PIPELINE DE IDEIAS DE NEGÓCIO (contexto do que o fundador está pensando):
${ideias.length ? ideias.map(i => '- ' + i).join('\n') : '(vazio)'}

DEMANDAS JÁ EXISTENTES NA ESTEIRA (não repetir; respeite as recusas):
${fmtHist || '(nenhuma ainda)'}

Sugira até ${max} demandas novas, da mais importante para a menos importante.`;
  const arr = parseJSON(await claude(SYS_PRODUTO, user, 8000));
  const lista = Array.isArray(arr) ? arr : (Array.isArray(arr?.demandas) ? arr.demandas : []);
  return lista.filter(d => d && d.titulo && d.proposta).slice(0, max);
}

const _chave = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
async function gerar({ squad = 'produto', foco = '', origem = 'manual' } = {}) {
  const cfg = await config(); const sql = await getSql();
  if (squad !== 'produto') throw new Error('Nesta fase só o Agente de Produto está ativo (marketing e vendas vêm na Fase 2).');
  const novas = await gerarProduto({ max: Math.min(6, Math.max(1, +cfg.max_por_ciclo || 3)), foco: foco || cfg.foco || '' });
  const existentes = new Set((await sql`SELECT titulo FROM agente_demandas`).map(r => _chave(r.titulo)));
  const ciclo = new Date().toISOString(); const criadas = [];
  for (const d of novas) {
    if (existentes.has(_chave(d.titulo))) continue; existentes.add(_chave(d.titulo));
    const id = novoId(); const pri = Math.max(1, Math.min(5, parseInt(d.impacto) || 3));
    await sql`INSERT INTO agente_demandas (id, squad, tipo, titulo, status, prioridade, dados, ciclo) VALUES (${id}, 'produto', 'implementacao', ${String(d.titulo).substring(0, 200)}, 'sugerida', ${pri}, ${JSON.stringify({ ...d, origem })}, ${ciclo})`;
    criadas.push(id);
  }
  await kvSet('agente:ideias:ultimo_ciclo', { em: ciclo, squad, origem, criadas: criadas.length });
  return { criadas: criadas.length, ids: criadas, ciclo };
}

// ── aprovação → tarefa no GitHub (o Claude implementa e abre um PR para o fundador aprovar) ──
function corpoIssue(r) {
  const d = r.dados || {};
  const lista = a => (Array.isArray(a) && a.length ? a.map(x => '- ' + x).join('\n') : '-');
  return `@claude implemente esta demanda APROVADA pelo fundador na Esteira de Demandas do Atlantyx OS e abra um pull request para revisão.
Regras: não altere o que não estiver relacionado; mantenha o comportamento das telas que funcionam; valide a sintaxe (node --check nas APIs e nos blocos <script> de public/index.html); NÃO altere a versão ATX-vX.YY / ATLANTYX vX.YY (o merge pela Esteira sobe a versão — mudar aqui gera conflito entre PRs); descreva no PR o que mudou e como testar. Nada vai para produção sem o merge do fundador.

## ${r.titulo}
**Área:** ${d.area || '-'} · **Impacto:** ${d.impacto || '-'}/5 · **Esforço:** ${d.esforco || '-'} · **Risco:** ${d.risco || '-'}
**Telas afetadas:** ${(d.telas_afetadas || []).join(', ') || '-'}

### Problema
${d.problema || '-'}

### Proposta
${d.proposta || '-'}

### Como implementar (orientação)
${d.como_implementar || '-'}

### Critérios de aceite
${lista(d.criterios_aceite)}

### Métrica de sucesso
${d.metrica_sucesso || '-'}
${r.decisao_obs ? '\n### Observação do fundador ao aprovar\n' + r.decisao_obs + '\n' : ''}
---
Demanda ${r.id} · gerada pelo Agente de Produto do Atlantyx OS`;
}
async function abrirIssue(r) {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os';
  if (!token) return { erro: 'GITHUB_TOKEN não configurado no Vercel — a demanda ficou aprovada; configure o token (Issues: Read and write) e use "Enviar para implementação".' };
  const resp = await fetch(`https://api.github.com/repos/${repo}/issues`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'atlantyx-os-agente' },
    body: JSON.stringify({ title: '[Demanda aprovada] ' + String(r.titulo).substring(0, 180), body: corpoIssue(r), labels: ['demanda-aprovada'] }) });
  const d = await resp.json().catch(() => ({}));
  if (!resp.ok) return { erro: 'GitHub recusou (' + resp.status + '): ' + (d.message || '') };
  return { numero: d.number, url: d.html_url };
}

async function decidir({ id, decisao, obs = '' } = {}, usuario) {
  const sql = await getSql();
  const [r0] = await sql`SELECT * FROM agente_demandas WHERE id = ${id}`; if (!r0) throw new Error('Demanda não encontrada');
  const r = linha(r0);
  if (decisao === 'recusar') {
    await sql`UPDATE agente_demandas SET status = 'recusada', decisao_obs = ${String(obs || '').substring(0, 1000)}, decidido_em = NOW(), atualizado_em = NOW() WHERE id = ${id}`;
    return { status: 'recusada' };
  }
  if (decisao !== 'aprovar' && decisao !== 'enviar') throw new Error('Decisão inválida');
  if (decisao === 'aprovar' && r.status !== 'sugerida') throw new Error('Só demandas sugeridas podem ser aprovadas');
  if (decisao === 'enviar' && r.status !== 'aprovada') throw new Error('Só demandas aprovadas podem ser enviadas para implementação');
  const obsFinal = decisao === 'aprovar' ? String(obs || '').substring(0, 1000) : r.decisao_obs;
  await sql`UPDATE agente_demandas SET status = 'aprovada', decisao_obs = ${obsFinal}, decidido_em = COALESCE(decidido_em, NOW()), atualizado_em = NOW(),
    dados = ${JSON.stringify({ ...r.dados, aprovado_por: usuario || 'fundador' })} WHERE id = ${id}`;
  if (r.tipo !== 'implementacao') return { status: 'aprovada' };
  const iss = await abrirIssue({ ...r, decisao_obs: obsFinal });
  if (iss.erro) return { status: 'aprovada', aviso: iss.erro };
  await sql`UPDATE agente_demandas SET status = 'em_execucao', issue_numero = ${iss.numero}, issue_url = ${iss.url}, atualizado_em = NOW() WHERE id = ${id}`;
  return { status: 'em_execucao', issue: iss.numero, url: iss.url };
}

// estado das tarefas no GitHub: PR aberto / tarefa fechada → atualiza o card
async function sincronizar() {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os';
  const sql = await getSql();
  const rows = await sql`SELECT id, issue_numero, dados FROM agente_demandas WHERE status = 'em_execucao' AND issue_numero IS NOT NULL LIMIT 30`;
  if (!rows.length || !token) return { verificadas: 0 };
  const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'atlantyx-os-agente' };
  let mudou = 0;
  // v3.98: PRs do repositório (uma chamada) — liga o PR à tarefa pela branch claude/issue-N-* (a busca por número no texto confundia tarefas)
  let prs = [];
  try { const l = await (await fetch(`https://api.github.com/repos/${repo}/pulls?state=all&per_page=100&sort=created&direction=desc`, { headers: H })).json(); if (Array.isArray(l)) prs = l; } catch (_) {}
  const prDe = p => ({ numero: p.number, url: p.html_url, estado: p.state, merged: !!(p.merged_at || p.pull_request?.merged_at), criado_em: p.created_at, merged_em: p.merged_at || p.pull_request?.merged_at || null, fechado_em: p.closed_at || null, rotulos: (p.labels || []).map(l => l.name), branch: p.head?.ref || null });
  for (const r of rows) {
    try {
      const iss = await (await fetch(`https://api.github.com/repos/${repo}/issues/${r.issue_numero}`, { headers: H })).json();
      // PR que menciona a tarefa (aberto pelo Claude)
      let pr = null;
      const daTarefa = prs.filter(p => String(p.head?.ref || '').startsWith(`claude/issue-${r.issue_numero}-`));
      const pp = daTarefa.find(p => p.state === 'open') || daTarefa.find(p => p.merged_at) || daTarefa[0];
      if (pp) pr = prDe(pp);
      else try { const s = await (await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr "#${r.issue_numero}" in:body`)}`, { headers: H })).json();
        const p = (s.items || []).find(p => new RegExp('#' + r.issue_numero + '\\b').test(p.body || '')); if (p) pr = prDe(p); } catch (_) {}
      // v3.85: andamento do Claude, lido do comentário que ele mantém atualizado na tarefa
      let claude = null;
      try { const cs = await (await fetch(`https://api.github.com/repos/${repo}/issues/${r.issue_numero}/comments?per_page=100`, { headers: H })).json();
        const c = (Array.isArray(cs) ? cs : []).filter(x => /claude/i.test(x.user?.login || '')).pop();
        if (c) { const t = String(c.body || ''); const girando = /user-attachments\/assets\/5ac382c7/.test(t);
          const estado = girando ? 'trabalhando' : /encountered an error|encontrou um erro|falhou/i.test(t) ? 'erro' : 'concluiu';
          claude = { estado, inicio: c.created_at, atualizado: c.updated_at, duracao: (t.match(/task in ((?:\d+h )?(?:\d+m )?\d+s)/) || [])[1] || null, url: c.html_url,
            branch: (t.match(/\/tree\/(claude\/issue-\d+-[\w.-]+)/) || [])[1] || null }; } } catch (_) {}
      const ant = parse(r.dados) || {};
      const d = { ...ant, pr, claude, issue_estado: iss.state, issue_criada_em: iss.created_at || ant.issue_criada_em || null, branch: pr?.branch || claude?.branch || ant.branch || null };
      // v3.88: o robô de merge achou conflito de verdade → pede ao Claude (com o token do fundador, para disparar o GitHub Actions)
      if (pr && pr.estado === 'open' && (pr.rotulos || []).includes('conflito') && (!ant.conflito_pedido_em || Date.now() - Date.parse(ant.conflito_pedido_em) > 3 * 3600000)) {
        try { await fetch(`https://api.github.com/repos/${repo}/issues/${pr.numero}/comments`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: '@claude esta branch está em conflito com a main. Faça `git merge origin/main` NESTA branch, resolva os conflitos mantendo as duas mudanças (a da main e a deste PR), NÃO altere a versão ATX-vX.YY, valide (node --check nas APIs e nos <script> de public/index.html) e faça push nesta mesma branch. Não abra outro PR.' }) });
          d.conflito_pedido_em = new Date().toISOString(); } catch (_) {}
      }
      const implementada = iss.state === 'closed' && iss.state_reason !== 'not_planned' || (pr && pr.merged);
      if (implementada) d.implementada_em = pr?.merged_em || iss.closed_at || new Date().toISOString();
      // v3.87: tarefa fechada SEM implementar (PR fechado sem merge / "not planned") → arquivada, não fica parada em implementação
      const descartada = !implementada && iss.state === 'closed' && (iss.state_reason === 'not_planned' || (pr && pr.estado === 'closed' && !pr.merged));
      if (descartada) d.arquivada_em = iss.closed_at || new Date().toISOString();
      await sql`UPDATE agente_demandas SET dados = ${JSON.stringify(d)}, status = ${implementada ? 'implementada' : descartada ? 'arquivada' : 'em_execucao'}, atualizado_em = NOW() WHERE id = ${r.id}`;
      if (implementada) mudou++;
    } catch (_) {}
  }
  return { verificadas: rows.length, implementadas: mudou };
}

// ── v3.45: CORREÇÕES DA MADRUGADA — a ÚNICA parte autônoma ──────────────
// O GitHub Actions (qa-noturno.yml, 03h) roda o agente de QA em modo seguro e manda os achados para cá.
// Aqui juntamos a varredura de segurança, filtramos só ERROS (nada de melhoria/funcionalidade), registramos
// um card no Kanban e abrimos a tarefa "@claude" com o rótulo correcao-noturna. O PR do Claude é validado
// (sintaxe + carga da página) e mesclado sozinho pelo auto-merge-noturno.yml. Tudo fica listado no Kanban.
const CAT_ERRO = /erro JS|API|navega|^ação|mensagem|formul/i;
const chaveAchado = a => _chave([a.sev || a.severidade, a.cat || a.categoria, a.titulo, a.tela || a.arquivo].join(' '));
async function qaNoturno(req, { qa = {} } = {}) {
  const sql = await getSql();
  const base = (process.env.MEDIA_PUBLIC_BASE || ('https://' + (req.headers['x-forwarded-host'] || req.headers.host))).replace(/\/$/, '');
  let seg = null;
  try { const r = await fetch(base + '/api/qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seguranca' }) }); seg = await r.json(); } catch (e) { seg = { erro: e.message }; }
  const qaErros = (qa.achados || []).filter(a => ['crítica', 'alta', 'média'].includes(a.sev) && CAT_ERRO.test(a.cat || '') && !/sem efeito visível|contraste|repouso/i.test(a.titulo || ''));
  const segErros = (seg?.achados || []).filter(a => ['crítica', 'alta'].includes(a.severidade));
  // não repete o que já está sendo corrigido
  const abertos = (await sql`SELECT dados FROM agente_demandas WHERE squad = 'qa' AND status = 'em_execucao'`).map(r => parse(r.dados) || {});
  const jaAbertas = new Set(abertos.flatMap(d => d.chaves || []));
  const novosQa = qaErros.filter(a => !jaAbertas.has(chaveAchado(a))), novosSeg = segErros.filter(a => !jaAbertas.has(chaveAchado(a)));
  const noite = { em: new Date().toISOString(), versao: qa.versao || null, telas: qa.total_telas || 0, duracao_s: qa.duracao_s || 0, interrompido: !!qa.interrompido, erro_varredura: qa.erro || null,
    erros_qa: qaErros.length, erros_seguranca: segErros.length, novos: novosQa.length + novosSeg.length, ja_em_correcao: (qaErros.length + segErros.length) - (novosQa.length + novosSeg.length) };
  if (!novosQa.length && !novosSeg.length) { await kvSet('agente:qa:ultima_noite', { ...noite, resultado: 'sem erros novos' }); return { noite, criada: null }; }
  const dia = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const titulo = `🌙 Correções da madrugada ${dia} — ${novosQa.length + novosSeg.length} erro(s)`;
  const id = novoId();
  const dados = { origem: 'qa-noturno', noite, achados_qa: novosQa, achados_seguranca: novosSeg.map(a => ({ severidade: a.severidade, categoria: a.categoria, titulo: a.titulo, arquivo: a.arquivo, linha: a.linha, evidencia: a.evidencia, correcao: a.correcao })),
    chaves: [...novosQa, ...novosSeg].map(chaveAchado), area: 'plataforma', impacto: segErros.some(a => a.severidade === 'crítica') || novosQa.some(a => a.sev === 'crítica') ? 5 : 4, esforco: 'P', risco: 'baixo',
    problema: `A varredura noturna encontrou ${novosQa.length} erro(s) nas telas e ${novosSeg.length} de segurança.`, proposta: 'Correção autônoma pelo Claude (pull request validado e mesclado automaticamente).' };
  await sql`INSERT INTO agente_demandas (id, squad, tipo, titulo, status, prioridade, dados) VALUES (${id}, 'qa', 'correcao', ${titulo}, 'em_execucao', ${dados.impacto}, ${JSON.stringify(dados)})`;
  const lin = a => `- **[${a.sev || a.severidade}] ${a.titulo}** — ${a.rotulo || a.tela || a.arquivo || ''}${a.linha ? ':' + a.linha : ''}\n  - Evidência: ${String(a.evidencia || '').substring(0, 400)}\n  - Correção esperada: ${a.sugestao || a.correcao || '-'}${(a.ganchos || []).length ? '\n  - Onde olhar: ' + a.ganchos.slice(0, 4).join(', ') : ''}`;
  const corpo = `@claude corrija os ERROS abaixo, encontrados pela varredura noturna do agente de QA/Segurança do Atlantyx OS (${noite.versao || ''}), e abra um pull request.
Regras desta correção autônoma (correcao-noturna):
- Corrija SÓ os erros listados. Não crie funcionalidades, não mude layout nem comportamento que funciona.
- Confirme a causa no código antes de mudar. Se um item for falso positivo (ex.: depende de configuração no Vercel, de serviço externo fora do ar ou do computador em repouso), NÃO altere nada para ele e explique no PR.
- Valide: node --check em api/*.js e lib/*.js e nos blocos <script> de public/index.html. NÃO altere a versão ATX-vX.YY (o merge automático sobe a versão).
- No corpo do PR escreva "Corrige #NUMERO_DESTA_TAREFA" e liste cada item: corrigido / falso positivo (motivo).
- Este PR será validado automaticamente (sintaxe + carga da página sem erro de JavaScript) e mesclado sem revisão humana — por isso, na dúvida, não altere.

## Erros nas telas (${novosQa.length})
${novosQa.map(lin).join('\n') || '-'}

## Segurança (${novosSeg.length})
${novosSeg.map(lin).join('\n') || '-'}

---
Demanda ${id} · Esteira de Demandas do Atlantyx OS`;
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os';
  let iss = { erro: 'GITHUB_TOKEN não configurado no Vercel' };
  if (token) {
    const resp = await fetch(`https://api.github.com/repos/${repo}/issues`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'atlantyx-os-agente' },
      body: JSON.stringify({ title: titulo.replace('🌙 ', '[Correção noturna] '), body: corpo, labels: ['correcao-noturna'] }) });
    const d = await resp.json().catch(() => ({})); iss = resp.ok ? { numero: d.number, url: d.html_url } : { erro: 'GitHub recusou (' + resp.status + '): ' + (d.message || '') };
  }
  if (iss.numero) await sql`UPDATE agente_demandas SET issue_numero = ${iss.numero}, issue_url = ${iss.url}, atualizado_em = NOW() WHERE id = ${id}`;
  else await sql`UPDATE agente_demandas SET dados = ${JSON.stringify({ ...dados, aviso: iss.erro })} WHERE id = ${id}`;
  await kvSet('agente:qa:ultima_noite', { ...noite, resultado: iss.numero ? 'correção enviada' : 'erros registrados, tarefa não aberta: ' + iss.erro, demanda: id, issue: iss.numero || null });
  return { noite, criada: id, issue: iss.numero || null, aviso: iss.erro || null };
}

async function ciclo() {
  const cfg = await config(); if (!cfg.ativo) return { pulado: 'agente desligado' };
  const ult = await kvGet('agente:ideias:ultimo_ciclo');
  const sync = await sincronizar().catch(e => ({ erro: e.message }));
  if (ult?.em && Date.now() - Date.parse(ult.em) < (Math.max(6, +cfg.frequencia_horas || 24) - 1) * 3600000) return { pulado: 'fora da frequência', sync };
  // não acumula: se já há muitas sugestões esperando o fundador, não gera mais
  const sql = await getSql(); const [{ n }] = await sql`SELECT COUNT(*)::int n FROM agente_demandas WHERE status = 'sugerida'`;
  if (n >= 12) { await kvSet('agente:ideias:ultimo_ciclo', { em: new Date().toISOString(), pulado: n + ' sugestões aguardando decisão' }); return { pulado: n + ' sugestões aguardando decisão', sync }; }
  const out = {};
  if (cfg.squads?.produto !== false) out.produto = await gerar({ squad: 'produto', origem: 'agendado' });
  return { ...out, sync };
}

// ── v3.98: ações da tarefa no GitHub a partir do card ──
function _gh() {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os';
  if (!token) throw new Error('GITHUB_TOKEN não configurado no Vercel');
  const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'atlantyx-os-agente', 'Content-Type': 'application/json' };
  return async (caminho, metodo = 'GET', corpo) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${caminho}`, { method: metodo, headers: H, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok && !(metodo === 'DELETE' && r.status === 404)) throw new Error('GitHub recusou (' + r.status + '): ' + (j.message || '') + (r.status === 403 || r.status === 404 && /pulls/.test(caminho) ? ' — no token do GitHub (Vercel → GITHUB_TOKEN) acrescente "Pull requests: Read and write" e "Contents: Read".' : ''));
    return j;
  };
}
async function abrirPR(id, d, titulo) {
  const gh = _gh();
  const n = (String(d.branch).match(/issue-(\d+)-/) || [])[1];
  let p;
  try { p = await gh('/pulls', 'POST', { title: 'Tarefa #' + n + ' — ' + String(titulo || 'implementação da demanda').substring(0, 150), head: d.branch, base: 'main',
    body: 'Closes #' + n + ' · Demanda ' + id + '\n\nAberto pela Esteira de Demandas do Atlantyx OS a partir da branch do Claude.' }); }
  catch (e) { // já existe PR dessa branch → usa o existente
    const l = await gh('/pulls?state=open&head=' + encodeURIComponent((process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os').split('/')[0] + ':' + d.branch));
    if (!Array.isArray(l) || !l[0]) throw e; p = l[0]; }
  try { await gh('/issues/' + p.number + '/labels', 'POST', { labels: ['demanda-aprovada'] }); } catch (_) {}
  return { numero: p.number, url: p.html_url, estado: 'open', merged: false, criado_em: p.created_at, rotulos: ['demanda-aprovada'], branch: d.branch };
}
async function acaoTarefa(sql, b, req) {
  const [row] = await sql`SELECT * FROM agente_demandas WHERE id = ${b.id} LIMIT 1`; if (!row) throw new Error('Demanda não encontrada');
  if (row.status !== 'em_execucao') throw new Error('Esta demanda não está em implementação');
  const d = parse(row.dados) || {}; const gh = _gh(); const N = row.issue_numero; const pr = d.pr; const quem = req.sessao?.login || req.usuario || 'fundador';
  const salvar = async (extra, status) => { const nd = { ...d, ...extra, ultima_acao: { op: b.op, em: new Date().toISOString(), por: quem } };
    await sql`UPDATE agente_demandas SET dados = ${JSON.stringify(nd)}, status = ${status || 'em_execucao'}, atualizado_em = NOW() WHERE id = ${row.id}`; return nd; };
  switch (b.op) {
    case 'reenviar': { // o Claude não começou, parou com erro ou ficou sem sinal → novo pedido na tarefa
      if (!N) throw new Error('Demanda sem tarefa no GitHub — use "Enviar para implementação"');
      const extra = String(b.obs || '').trim();
      await gh('/issues/' + N + '/comments', 'POST', { body: '@claude retome esta tarefa do começo: implemente o que está descrito no corpo desta issue' + (d.branch ? ' (se a branch ' + d.branch + ' já tiver parte do trabalho, continue nela)' : '') + ', valide (node --check nas APIs e nos <script> de public/index.html), NÃO altere a versão ATX-vX.YY e faça push.' + (extra ? '\n\nObservação do fundador: ' + extra.substring(0, 1500) : '') });
      await salvar({ reenviado_em: new Date().toISOString(), claude: null });
      return { ok: true, msg: 'Pedido reenviado ao Claude (tarefa #' + N + ')' };
    }
    case 'abrir_pr': {
      if (pr?.estado === 'open') return { ok: true, msg: 'O PR #' + pr.numero + ' já está aberto' };
      if (!d.branch) throw new Error('O Claude ainda não deixou uma branch com o trabalho');
      const p = await abrirPR(row.id, d, row.titulo); await salvar({ pr: p });
      return { ok: true, msg: 'PR #' + p.numero + ' aberto — agora é só aprovar o merge', pr: p.numero };
    }
    case 'refazer_merge': { // validação falhou ou o robô não rodou → tira e põe o rótulo de novo (dispara o robô)
      if (!pr?.numero || pr.estado !== 'open') throw new Error('Sem PR aberto');
      await gh('/issues/' + pr.numero + '/labels/precisa-revisao', 'DELETE').catch(() => {});
      await gh('/issues/' + pr.numero + '/labels/conflito', 'DELETE').catch(() => {});
      await gh('/issues/' + pr.numero + '/labels/aprovado-merge', 'DELETE').catch(() => {});
      await gh('/issues/' + pr.numero + '/labels', 'POST', { labels: ['aprovado-merge'] });
      await salvar({ pr: { ...pr, rotulos: (pr.rotulos || []).filter(r => !['precisa-revisao', 'conflito'].includes(r)).concat('aprovado-merge') }, merge_pedido_em: new Date().toISOString(), merge_pedido_por: quem });
      return { ok: true, msg: 'Merge pedido de novo — o robô atualiza, valida e publica' };
    }
    case 'corrigir': { // validação falhou / conflito → o Claude corrige na mesma branch
      if (!pr?.numero || pr.estado !== 'open') throw new Error('Sem PR aberto');
      const motivo = (pr.rotulos || []).includes('conflito') ? 'esta branch está em conflito com a main. Faça `git merge origin/main` NESTA branch e resolva os conflitos mantendo as duas mudanças'
        : 'a validação automática deste PR falhou (veja o comentário do robô acima). Corrija a causa NESTA branch';
      await gh('/issues/' + pr.numero + '/comments', 'POST', { body: '@claude ' + motivo + '. NÃO altere a versão ATX-vX.YY, valide (node --check nas APIs e nos <script> de public/index.html) e faça push nesta mesma branch. Não abra outro PR.' + (b.obs ? '\n\nObservação do fundador: ' + String(b.obs).substring(0, 1500) : '') });
      await salvar({ correcao_pedida_em: new Date().toISOString(), conflito_pedido_em: (pr.rotulos || []).includes('conflito') ? new Date().toISOString() : d.conflito_pedido_em });
      return { ok: true, msg: 'Pedido de correção enviado ao Claude no PR #' + pr.numero + ' — quando ele terminar, clique em "Mesclar de novo"' };
    }
    case 'cancelar': {
      if (pr?.numero && pr.estado === 'open') await gh('/pulls/' + pr.numero, 'PATCH', { state: 'closed' });
      if (N) { try { await gh('/issues/' + N + '/comments', 'POST', { body: 'Cancelada pelo fundador na Esteira de Demandas' + (b.obs ? ': ' + String(b.obs).substring(0, 500) : '.') }); } catch (_) {}
        await gh('/issues/' + N, 'PATCH', { state: 'closed', state_reason: 'not_planned' }); }
      await salvar({ arquivada_em: new Date().toISOString(), cancelada_por: quem }, 'arquivada');
      return { ok: true, msg: 'Tarefa cancelada e arquivada' };
    }
    default: throw new Error('Ação inválida');
  }
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      if (req.query?.cron) return res.status(200).json({ success: true, ...(await ciclo()) });
      return res.status(405).json({ success: false, error: 'Use POST' });
    }
    const b = req.body || {}; const sql = await getSql();
    const acoes = {
      listar: async () => {
        // sincroniza com o GitHub no máximo a cada 3 min, ou na hora com { sync: true } (PR mesclado → card vai para Implementadas)
        const us = await kvGet('agente:ideias:ultima_sync'); if (b.sync || !us || Date.now() - Date.parse(us.em) > 180000) { await kvSet('agente:ideias:ultima_sync', { em: new Date().toISOString() }); try { await sincronizar(); } catch (_) {} }
        const rows = (await sql`SELECT * FROM agente_demandas ORDER BY CASE status WHEN 'sugerida' THEN 0 WHEN 'aprovada' THEN 1 WHEN 'em_execucao' THEN 2 ELSE 3 END, prioridade DESC, criado_em DESC LIMIT 400`).map(linha);
        return { demandas: rows, config: await config(), ultimo_ciclo: await kvGet('agente:ideias:ultimo_ciclo'), ultima_noite: await kvGet('agente:qa:ultima_noite'), github: !!process.env.GITHUB_TOKEN };
      },
      gerar: () => gerar({ squad: b.squad || 'produto', foco: b.foco || '', origem: 'manual' }),
      decidir: () => decidir(b, req.usuario),
      editar: async () => {
        const [r0] = await sql`SELECT * FROM agente_demandas WHERE id = ${b.id}`; if (!r0) throw new Error('Demanda não encontrada');
        if (!['sugerida', 'aprovada'].includes(r0.status)) throw new Error('Só dá para editar antes de ir para implementação');
        const c = b.campos || {}; const dados = { ...(parse(r0.dados) || {}) };
        ['problema', 'proposta', 'como_implementar', 'metrica_sucesso', 'esforco', 'risco', 'area'].forEach(k => { if (c[k] != null) dados[k] = String(c[k]).substring(0, 6000); });
        if (Array.isArray(c.criterios_aceite)) dados.criterios_aceite = c.criterios_aceite.map(x => String(x).substring(0, 400)).slice(0, 20);
        const titulo = c.titulo ? String(c.titulo).substring(0, 200) : r0.titulo;
        const pri = c.prioridade ? Math.max(1, Math.min(5, parseInt(c.prioridade))) : r0.prioridade;
        await sql`UPDATE agente_demandas SET titulo = ${titulo}, prioridade = ${pri}, dados = ${JSON.stringify(dados)}, atualizado_em = NOW() WHERE id = ${b.id}`;
        return { ok: true };
      },
      mover: async () => {
        if (!['implementada', 'arquivada', 'sugerida'].includes(b.status)) throw new Error('Movimento não permitido — aprovação e envio só pelos botões');
        await sql`UPDATE agente_demandas SET status = ${b.status}, atualizado_em = NOW() WHERE id = ${b.id}`; return { ok: true };
      },
      excluir: async () => { await sql`DELETE FROM agente_demandas WHERE id = ${b.id}`; return { ok: true }; },
      nova: async () => {
        const d = b.dados || {}; if (!d.titulo || !d.proposta) throw new Error('Informe título e proposta');
        const id = novoId();
        await sql`INSERT INTO agente_demandas (id, squad, tipo, titulo, status, prioridade, dados) VALUES (${id}, ${d.squad || 'produto'}, 'implementacao', ${String(d.titulo).substring(0, 200)}, 'sugerida', ${Math.max(1, Math.min(5, parseInt(d.impacto) || 3))}, ${JSON.stringify({ ...d, origem: 'fundador' })})`;
        return { id };
      },
      sincronizar: () => sincronizar(),
      // v3.88: "✅ Aprovar e mesclar" — marca o PR; o claude-pr.yml atualiza com a main, valida, mescla e sobe a versão
      mesclar: async () => {
        const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'Fabiosq13/atlantyx-os';
        if (!token) throw new Error('GITHUB_TOKEN não configurado no Vercel');
        const [row] = await sql`SELECT id, titulo, dados FROM agente_demandas WHERE id = ${b.id} LIMIT 1`; if (!row) throw new Error('Demanda não encontrada');
        const d = parse(row.dados) || {}; let pr = d.pr;
        // v3.98: o Claude terminou e deixou a branch, mas o robô ainda não abriu o PR → abre agora
        if ((!pr?.numero || pr.estado !== 'open') && d.branch) { pr = await abrirPR(row.id, d, row.titulo); }
        if (!pr?.numero || pr.estado !== 'open') throw new Error('Esta demanda não tem um PR aberto para mesclar');
        if (d.claude?.estado === 'erro' && !b.mesmo_assim) throw new Error('O Claude parou com erro nesta tarefa — o PR pode estar incompleto. Revise no GitHub antes.');
        const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'atlantyx-os-agente', 'Content-Type': 'application/json' };
        const r = await fetch(`https://api.github.com/repos/${repo}/issues/${pr.numero}/labels`, { method: 'POST', headers: H, body: JSON.stringify({ labels: ['aprovado-merge'] }) });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error('GitHub recusou (' + r.status + '): ' + (e.message || '') + (r.status === 403 ? ' — no token do GitHub (Vercel → GITHUB_TOKEN) acrescente a permissão "Pull requests: Read and write".' : '')); }
        d.pr = { ...pr, rotulos: [...new Set([...(pr.rotulos || []), 'aprovado-merge'])] };
        d.merge_pedido_em = new Date().toISOString(); d.merge_pedido_por = req.sessao?.login || req.usuario || null;
        await sql`UPDATE agente_demandas SET dados = ${JSON.stringify(d)}, atualizado_em = NOW() WHERE id = ${row.id}`;
        return { ok: true, pr: pr.numero };
      },
      // v3.98: ações direto no card da Esteira — reenviar ao Claude, abrir PR, refazer o merge, pedir correção, cancelar
      tarefa: () => acaoTarefa(sql, b, req),
      qa_noturno: () => qaNoturno(req, b), // v3.45 — chamado pelo GitHub Actions (Authorization: Bearer CRON_SECRET)
      config: async () => ({ config: await config() }),
      config_salvar: async () => {
        const atual = await config(); const c = b.config || {};
        const nova = { ...atual, ativo: c.ativo != null ? !!c.ativo : atual.ativo, frequencia_horas: Math.max(6, Math.min(168, parseInt(c.frequencia_horas) || atual.frequencia_horas)),
          max_por_ciclo: Math.max(1, Math.min(6, parseInt(c.max_por_ciclo) || atual.max_por_ciclo)), foco: c.foco != null ? String(c.foco).substring(0, 500) : atual.foco };
        await kvSet('agente:ideias:config', nova); return { config: nova };
      },
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida', disponiveis: Object.keys(acoes) });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) {
    console.error('[agente-ideias]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}

export { telasDoSistema, corpoIssue };
export default comGuarda(handler, 'agente-ideias');
