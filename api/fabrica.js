import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
import { fabSql, novoIdFab as novoId, ETAPAS, DOCS, COLUNAS_FAB, TIPOS_CASO, ROBOS, moverItensPorCasos } from '../lib/fabrica-db.js';
// api/fabrica.js — v3.134 · ESTEIRA DE ENTREGA (Fábrica) — Metodologia Atlantyx v4
// Do documento ao aceite, num só lugar, para cada projeto:
//   • Gates G1–G12 das 12 etapas, com critérios de aprovação e quem aprova.
//   • Documentos: ERF conceitual (importada do parceiro/cliente), modelo de ERT do cliente (importado),
//     ERT gerada por IA lendo a ERF NO PADRÃO do modelo do cliente (+ análise de consistência ERF×ERT,
//     ambiguidades, requisitos sem critério de aceite e matriz de rastreabilidade), Plano Detalhado de Projeto,
//     Plano de Testes (casos gerados por IA a partir dos critérios de aceite) e Relatório de Qualidade.
//     Todos editáveis, versionados, aprovados formalmente e exportados em Word (inclusive o Pacote para a Fábrica).
//   • Kanban da Fábrica: backlog gerado por IA a partir da ERT; item em QA com todos os casos aprovados pelos
//     robôs vai sozinho para "Aprovado no QA"; caso reprovado devolve o item para desenvolvimento.
//   • Plano de testes executável: os robôs do QA de Produtos (api/qa-externo.js) seguem os casos passo a passo.
//   • Painel do cliente: link público (token) com a análise dos testes e do QA — G7/G8, cobertura, defeitos,
//     rastreabilidade e os indicadores do item 9.5 da metodologia.

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const PRIOR = ['alta', 'media', 'baixa'];
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mdc = v => String(v ?? '').replace(/\|/g, '/').replace(/\n+/g, ' ').trim();
const hojeBR = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// ═══════════════ IA ═══════════════
async function claude(system, content, maxTokens = 4000, ms = 240000) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('IA [' + r.status + ']: ' + (d.error?.message || 'erro'));
    return (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'A IA demorou demais — tente de novo (ou gere em partes com instruções mais específicas)' : e.message); }
  finally { clearTimeout(tm); }
}
function json(txt) {
  const t = String(txt || '').replace(/```json|```/g, '').trim();
  const i = t.search(/[{[]/); if (i < 0) throw new Error('A IA não devolveu JSON');
  const fecha = t[i] === '{' ? '}' : ']'; let j = t.lastIndexOf(fecha);
  try { return JSON.parse(t.substring(i, j + 1)); }
  catch (e) { // resposta cortada: tenta fechar a lista de casos no último objeto completo
    const k = t.lastIndexOf('},'); if (k > i) { try { return JSON.parse(t.substring(i, k + 1) + ']}'); } catch (_) {} try { return JSON.parse(t.substring(i, k + 1) + ']'); } catch (_) {} }
    throw new Error('A IA devolveu um JSON incompleto — tente de novo');
  }
}
const limpaMd = t => String(t || '').replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();

// ═══════════════ leitura de arquivos (DOCX com títulos → markdown; PDF; XLSX; TXT) ═══════════════
function _unzip(buf, nome) {
  const zlib = globalThis.__zlib;
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('arquivo não é um DOCX válido');
  let p = buf.readUInt32LE(eocd + 16); const total = buf.readUInt16LE(eocd + 10);
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const n = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    if (n === nome) { const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28); const dados = buf.slice(off + 30 + lnl + lel, off + 30 + lnl + lel + comp); return metodo === 8 ? zlib.inflateRawSync(dados) : dados; }
    p += 46 + nl + el + cl;
  }
  return null;
}
const ent = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const _txtP = x => ent((x.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) || []).map(t => t === '<w:tab/>' ? '\t' : t === '<w:br/>' ? ' ' : t.replace(/<[^>]+>/g, '')).join('')).trim();
export function docxParaMd(xml) {
  const corpo = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, xml])[1];
  const out = [];
  for (const m of corpo.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const b = m[0];
    if (b.startsWith('<w:tbl>')) {
      const linhas = [...b.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(r => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c => [...c[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(p => _txtP(p[0])).filter(Boolean).join('<br>').replace(/\|/g, '/')));
      if (!linhas.length) continue;
      out.push('', '| ' + linhas[0].join(' | ') + ' |', '|' + linhas[0].map(() => '---').join('|') + '|', ...linhas.slice(1).map(l => '| ' + l.join(' | ') + ' |'), '');
      continue;
    }
    const t = _txtP(b); if (!t) continue;
    const st = (b.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
    const nv = (st.match(/(?:heading|t[ií]?tulo|ttulo)\s*(\d)/i) || [])[1];
    if (/^(title|t[ií]tulo)$/i.test(st)) out.push('# ' + t);
    else if (nv) out.push('', '#'.repeat(Math.min(4, +nv)) + ' ' + t, '');
    else if (/<w:numPr>/.test(b) || /list/i.test(st)) out.push('- ' + t);
    else out.push(t, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function lerArquivo(nome, base64) {
  const buf = Buffer.from(String(base64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buf.length) throw new Error('arquivo vazio');
  if (buf.length > 15 * 1024 * 1024) throw new Error('Arquivo acima de 15 MB');
  const ext = String(nome || '').toLowerCase().split('.').pop();
  globalThis.__zlib = globalThis.__zlib || (await import('zlib')).default;
  if (ext === 'docx') { const x = _unzip(buf, 'word/document.xml'); if (!x) throw new Error('DOCX sem document.xml'); return docxParaMd(x.toString('utf8')); }
  if (ext === 'pdf') {
    try { const mod = await import('pdf-parse/lib/pdf-parse.js'); const f = mod.default || mod; const r = await f(buf); if (String(r.text || '').trim().length > 200) return r.text.replace(/\n{3,}/g, '\n\n').trim(); } catch (_) {}
    // PDF digitalizado ou sem leitor: a IA transcreve
    return limpaMd(await claude('Transcreva fielmente o documento para Markdown, preservando títulos (#), numeração, listas e tabelas (|). Não resuma, não comente.',
      [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }, { type: 'text', text: 'Transcreva.' }], 16000));
  }
  if (ext === 'xlsx') { const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); const L = [];
    wb.eachSheet(ws => { L.push('## ' + ws.name); ws.eachRow({ includeEmpty: false }, row => { const v = row.values.slice(1).map(c => c == null ? '' : (typeof c === 'object' ? (c.result ?? c.text ?? c.richText?.map(t => t.text).join('') ?? '') : c)); if (v.some(x => String(x).trim())) L.push('| ' + v.join(' | ') + ' |'); }); });
    return L.join('\n'); }
  return buf.toString('utf8');
}
const titulosDe = md => String(md || '').split('\n').filter(l => /^#{1,4}\s/.test(l)).map(l => l.trim()).slice(0, 120);

// ═══════════════ projetos ═══════════════
async function projetos() {
  const sql = await fabSql();
  const P = await sql`SELECT p.*, (SELECT COUNT(*)::int FROM fab_itens i WHERE i.projeto_id=p.id) AS n_itens,
    (SELECT COUNT(*)::int FROM fab_casos c WHERE c.projeto_id=p.id) AS n_casos,
    (SELECT COUNT(*)::int FROM fab_casos c WHERE c.projeto_id=p.id AND c.status='passou') AS n_passou,
    (SELECT COUNT(*)::int FROM fab_casos c WHERE c.projeto_id=p.id AND c.status='falhou') AS n_falhou
    FROM fab_projetos p ORDER BY p.atualizado_em DESC`;
  const D = await sql`SELECT projeto_id, tipo, status, versao, origem, atualizado_em FROM fab_documentos`;
  let produtos = []; try { produtos = await sql`SELECT id, nome, url FROM qa_produtos ORDER BY nome`; } catch (_) {}
  return { projetos: P.map(p => ({ ...p, docs: D.filter(d => d.projeto_id === p.id) })), produtos, etapas: ETAPAS, docs: DOCS, colunas: COLUNAS_FAB, tipos_caso: TIPOS_CASO, robos: ROBOS };
}
async function projetoSalvar(b) {
  const sql = await fabSql(); if (!b.nome) throw new Error('Informe o nome do projeto');
  if (b.id) { await sql`UPDATE fab_projetos SET nome=${b.nome}, cliente=${b.cliente || null}, descricao=${b.descricao || null}, gp=${b.gp || null}, fabrica=${b.fabrica || null},
    qa_produto_id=${b.qa_produto_id || null}, painel_so_confirmados=${b.painel_so_confirmados !== false}, atualizado_em=NOW() WHERE id=${b.id}`; return { id: b.id }; }
  const id = novoId('fpj');
  await sql`INSERT INTO fab_projetos (id, nome, cliente, descricao, gp, fabrica, qa_produto_id, token_publico) VALUES (${id}, ${b.nome}, ${b.cliente || null}, ${b.descricao || null}, ${b.gp || null}, ${b.fabrica || null}, ${b.qa_produto_id || null}, ${crypto.randomBytes(16).toString('hex')})`;
  return { id };
}
async function projetoObter({ id }) {
  const sql = await fabSql(); const p = (await sql`SELECT * FROM fab_projetos WHERE id=${id}`)[0]; if (!p) throw new Error('Projeto não encontrado');
  const docs = await sql`SELECT id, tipo, titulo, origem, arquivo_nome, versao, status, aprovado_em, aprovado_por, historico, atualizado_em, LENGTH(conteudo_md) AS tamanho FROM fab_documentos WHERE projeto_id=${id}`;
  return { projeto: p, documentos: docs, etapas: ETAPAS, docs: DOCS };
}
async function gateAprovar({ projeto_id, gate, aprovado_por, observacao, reabrir }) {
  const sql = await fabSql(); const p = (await sql`SELECT gates FROM fab_projetos WHERE id=${projeto_id}`)[0]; if (!p) throw new Error('Projeto não encontrado');
  if (!ETAPAS.some(e => e.gate === gate)) throw new Error('gate inválido');
  const g = { ...(p.gates || {}) };
  if (reabrir) delete g[gate]; else g[gate] = { status: 'aprovado', em: new Date().toISOString(), por: aprovado_por || 'Atlantyx', obs: observacao || null };
  let etapa = 1; for (const e of ETAPAS) { if (g[e.gate]?.status === 'aprovado') etapa = Math.min(12, e.n + 1); else break; }
  await sql`UPDATE fab_projetos SET gates=${JSON.stringify(g)}, etapa=${etapa}, atualizado_em=NOW() WHERE id=${projeto_id}`;
  return { gates: g, etapa };
}

// ═══════════════ documentos ═══════════════
async function _docGravar(sql, pid, tipo, conteudo, { origem, titulo, arquivo_nome } = {}) {
  const ex = (await sql`SELECT id, versao, status, origem, historico, atualizado_em FROM fab_documentos WHERE projeto_id=${pid} AND tipo=${tipo}`)[0];
  if (ex) {
    const hist = [...(ex.historico || []), { versao: ex.versao, origem: ex.origem, status: ex.status, em: ex.atualizado_em }].slice(-15);
    await sql`UPDATE fab_documentos SET conteudo_md=${conteudo}, origem=${origem || 'manual'}, titulo=COALESCE(${titulo || null}, titulo), arquivo_nome=COALESCE(${arquivo_nome || null}, arquivo_nome),
      versao=versao+1, status='rascunho', aprovado_em=NULL, aprovado_por=NULL, historico=${JSON.stringify(hist)}, atualizado_em=NOW() WHERE id=${ex.id}`;
    return { id: ex.id, versao: ex.versao + 1 };
  }
  const id = novoId('fdc');
  await sql`INSERT INTO fab_documentos (id, projeto_id, tipo, titulo, conteudo_md, origem, arquivo_nome) VALUES (${id}, ${pid}, ${tipo}, ${titulo || DOCS[tipo]?.nome || tipo}, ${conteudo}, ${origem || 'manual'}, ${arquivo_nome || null})`;
  return { id, versao: 1 };
}
async function _doc(sql, pid, tipo) { return (await sql`SELECT * FROM fab_documentos WHERE projeto_id=${pid} AND tipo=${tipo}`)[0] || null; }
async function docImportar({ projeto_id, tipo, nome, base64 }) {
  if (!DOCS[tipo]) throw new Error('tipo de documento inválido');
  const sql = await fabSql(); const md = await lerArquivo(nome, base64);
  if (String(md).trim().length < 30) throw new Error('Não consegui ler texto deste arquivo');
  const r = await _docGravar(sql, projeto_id, tipo, md, { origem: 'importado', arquivo_nome: nome, titulo: DOCS[tipo].nome });
  return { ...r, caracteres: md.length, secoes: titulosDe(md).length };
}
async function docObter({ projeto_id, tipo }) { const sql = await fabSql(); return { documento: await _doc(sql, projeto_id, tipo) }; }
async function docSalvar({ projeto_id, tipo, conteudo_md, titulo }) { if (!DOCS[tipo]) throw new Error('tipo inválido'); const sql = await fabSql(); return _docGravar(sql, projeto_id, tipo, String(conteudo_md || ''), { origem: 'manual', titulo }); }
async function docAprovar({ projeto_id, tipo, aprovado_por, reabrir }) {
  const sql = await fabSql();
  if (reabrir) await sql`UPDATE fab_documentos SET status='rascunho', aprovado_em=NULL, aprovado_por=NULL, atualizado_em=NOW() WHERE projeto_id=${projeto_id} AND tipo=${tipo}`;
  else await sql`UPDATE fab_documentos SET status='aprovado', aprovado_em=NOW(), aprovado_por=${aprovado_por || 'Atlantyx'}, atualizado_em=NOW() WHERE projeto_id=${projeto_id} AND tipo=${tipo}`;
  return { ok: true };
}

const SYS_BASE = `Você é especialista sênior da Atlantyx (consultoria de dados, BI, engenharia de dados e IA para grandes empresas, ex.: CPFL, Enel) e segue a Metodologia Atlantyx de Gestão e Entrega de Projetos Tecnológicos: 12 etapas com gates G1–G12; a ERF (funcional, em linguagem de negócio) é do parceiro de processos/cliente; a ERT (técnica) é da Atlantyx; a construção é feita pela fábrica de desenvolvimento do cliente, com acompanhamento técnico e QA automatizado por IA da Atlantyx. Escreva em português do Brasil, claro e objetivo, sem inventar fatos que contradigam a fonte: quando faltar informação, registre como PREMISSA ou PENDÊNCIA (com responsável sugerido) em vez de supor silenciosamente. Use Markdown: títulos #/##/###, listas, tabelas com |. Não use HTML.`;
const ESTRUTURA_ERT = `1. Controle do documento (versão, data, autores, aprovadores, histórico)
2. Viabilidade técnica da ERF e pontos de atenção
3. Arquitetura da solução (componentes, responsabilidades, conexão com os sistemas do cliente)
4. Tecnologias e decisões (registro de decisões com alternativas avaliadas)
5. Modelo de dados (conceitual, lógico e físico) e dicionário de dados (tabela: entidade, campo, tipo, obrigatório, regra, origem)
6. Integrações — contratos (tabela: sistema, direção, formato, frequência, volume, tratamento de falhas)
7. Fluxos de dados (ingestão, transformação, carga, reconciliação, regras de qualidade, monitoramento)
8. Infraestrutura e ambientes (construção, testes, produção; dimensionamento)
9. Segurança (acesso, criptografia, guarda de segredos, registro de acessos, análise de ameaças)
10. Privacidade (LGPD): dados pessoais, base legal, mascaramento, retenção e descarte
11. Continuidade (disponibilidade, backup, recuperação, RTO/RPO)
12. Monitoramento e operação (alertas, painéis, logs, suporte)
13. Estratégia de testes (camadas, QA automatizado com IA, critérios de aprovação, ambientes)
14. Implantação e plano de retorno
15. Uso de IA na solução (finalidade, fontes, guardrails, métricas de avaliação) — quando houver
16. Requisitos técnicos não funcionais (desempenho, capacidade, escalabilidade, limites) — tabela RT-xx ligada aos RF da ERF`;

async function gerarErt(sql, P, b) {
  const erf = await _doc(sql, P.id, 'erf'); if (!erf?.conteudo_md) throw new Error('Importe primeiro a Especificação Funcional (ERF) — a ERT é gerada a partir dela.');
  const mod = await _doc(sql, P.id, 'modelo_ert');
  const modelo = mod?.conteudo_md ? `MODELO DE ERT DO CLIENTE — siga EXATAMENTE esta estrutura (mesmos títulos, mesma ordem e numeração, mesmo estilo de tabelas e de linguagem). Seções que não se aplicarem ficam com "Não se aplica — motivo". Itens da metodologia Atlantyx que o modelo não tiver entram como subseções na seção mais próxima.\n\n${String(mod.conteudo_md).substring(0, 30000)}`
    : `O cliente não enviou modelo de ERT: use a estrutura padrão da metodologia Atlantyx (15.3.1):\n${ESTRUTURA_ERT}`;
  const base = `PROJETO: ${P.nome} · CLIENTE: ${P.cliente || '—'}\n${P.descricao ? 'DESCRIÇÃO: ' + P.descricao + '\n' : ''}${b.instrucoes ? 'INSTRUÇÕES DO ARQUITETO: ' + b.instrucoes + '\n' : ''}\nESPECIFICAÇÃO FUNCIONAL (ERF — conceitual):\n${String(erf.conteudo_md).substring(0, 70000)}`;
  const [corpo, analise] = await Promise.all([
    claude(SYS_BASE + `\nTarefa: escrever a ESPECIFICAÇÃO DE REQUISITOS TÉCNICOS (ERT) completa a partir da ERF. Para cada requisito técnico use identificador RT-NN e cite os RF/regras da ERF que ele atende. Inclua modelo de dados com dicionário, contratos de integração e requisitos não funcionais mensuráveis. Comece direto pelo título do documento.`,
      `${modelo}\n\n${base}`, 14000),
    claude(SYS_BASE + `\nTarefa (apoio de IA da etapa 3 — item 5.5): revisar a ERF e produzir o APÊNDICE de análise. Seja específico, cite os identificadores/trechos da ERF.`,
      `${base}\n\nProduza em Markdown, começando por "# Apêndice A — Análise de consistência e rastreabilidade (IA)":\n## A.1 Ambiguidades encontradas (tabela: trecho/ID, problema, sugestão de redação)\n## A.2 Requisitos sem critério de aceite objetivo (tabela: RF, o que falta, critério sugerido no formato Dado/Quando/Então)\n## A.3 Regras conflitantes ou lacunas técnicas (tabela)\n## A.4 Pendências para o cliente (tabela: pendência, responsável sugerido, impacto)\n## A.5 Matriz de rastreabilidade inicial (tabela: Necessidade → RF → RT → Cenários de teste sugeridos)`, 6000),
  ]);
  return limpaMd(corpo) + '\n\n<!-- quebra -->\n\n' + limpaMd(analise);
}
async function gerarPlanoProjeto(sql, P, b) {
  const erf = await _doc(sql, P.id, 'erf'), ert = await _doc(sql, P.id, 'ert');
  const itens = await sql`SELECT codigo, titulo, tipo, prioridade, estimativa_h FROM fab_itens WHERE projeto_id=${P.id} ORDER BY codigo`;
  const horas = itens.reduce((s, i) => s + (+i.estimativa_h || 0), 0);
  const inicio = b.inicio || new Date(Date.now() + 7 * 864e5).toISOString().substring(0, 10);
  const etapas = ETAPAS.map(e => `${e.n}. ${e.nome} — saída: ${e.doc} — gate ${e.gate} — aprova: ${e.aprova}`).join('\n');
  const txt = await claude(SYS_BASE + `\nTarefa: escrever o PLANO DETALHADO DE PROJETO E CRONOGRAMA (estrutura 15.1.1 da metodologia).`,
    `PROJETO: ${P.nome} · CLIENTE: ${P.cliente || '—'} · GP: ${P.gp || '—'} · FÁBRICA DE DESENVOLVIMENTO: ${P.fabrica || 'fábrica do cliente'}\n${P.descricao ? 'DESCRIÇÃO: ' + P.descricao + '\n' : ''}INÍCIO PREVISTO: ${inicio}\n${b.instrucoes ? 'INSTRUÇÕES DO GP: ' + b.instrucoes + '\n' : ''}
ETAPAS E GATES DA METODOLOGIA:\n${etapas}\n
${itens.length ? `BACKLOG DA FÁBRICA (${itens.length} itens, ${horas} h estimadas):\n` + itens.map(i => `${i.codigo} ${i.titulo} (${i.tipo || ''}, ${i.prioridade}, ${i.estimativa_h || '?'} h)`).join('\n').substring(0, 8000) + '\n' : ''}
ERF:\n${String(erf?.conteudo_md || 'não importada').substring(0, 30000)}\n\nERT:\n${String(ert?.conteudo_md || 'não gerada').substring(0, 25000)}

Estrutura obrigatória (use estes títulos):
# Plano Detalhado de Projeto e Cronograma
## 1. Controle do documento
## 2. Contexto e objetivos (com indicadores de sucesso)
## 3. Escopo (incluído, fora do escopo, premissas, fases e entregas por fase)
## 4. Estrutura analítica do trabalho (EAP)
## 5. Cronograma detalhado — tabela com as 12 etapas: etapa, atividades principais, responsável, início, fim, duração (semanas), dependência, gate e data do gate (datas reais a partir do início previsto)
## 6. Equipe e papéis — matriz RACI por etapa (cliente, parceiro de processos, Atlantyx, fábrica)
## 7. Orçamento (estrutura por fase e recurso; valores como PENDÊNCIA se não houver base)
## 8. Infraestrutura e FinOps (volumetria e regras de controle de gastos)
## 9. Construção pela fábrica e integrações Atlantyx (plano da fábrica integrado; esteira: backlog → especificado → desenvolvimento → revisão técnica → QA automatizado → homologação)
## 10. Premissas, restrições e dependências
## 11. Gestão de riscos — tabela (risco, probabilidade, impacto, responsável, resposta)
## 12. Qualidade e segurança — critérios de cada gate e metas dos indicadores do 9.5 (defeitos antes × depois da homologação, tempo de detecção, tempo de correção, % de critérios de aceite automatizados, defeitos em produção, alertas da IA confirmados × descartados)
## 13. Governança e comunicação (ritos, frequência, participantes, escalonamento)
## 14. Gestão de mudanças
## 15. Plano de aceite`, 12000);
  return limpaMd(txt);
}

// casos de teste gerados por IA (JSON) → tabela fab_casos + documento do plano
const CASO_JSON = `{"casos":[{"titulo":"...","tipo":"<tipo>","requisito_ref":"RF-01","prioridade":"alta|media|baixa","risco":"por que este caso importa (chance x impacto)","pre_condicao":"...","passos":["Abrir a tela X","Clicar em ...","Preencher ... com ...","Clicar em Salvar"],"dados":"massa de teste FICTÍCIA ou mascarada","esperado":"resultado observável na tela","automatizavel":true}]}`;
const REGRAS_CASO = `Regras dos casos:
- Passos em linguagem de usuário, observáveis na tela (o robô de QA executa os passos num navegador, sem acesso ao código): nomes de telas, botões e campos como aparecem para o usuário.
- Resultado esperado verificável na tela (mensagem, valor, item na lista, total).
- Dados de teste SEMPRE fictícios ou mascarados (CPF/CNPJ de teste válidos, e-mails @exemplo.com.br), nunca dados reais.
- Cubra cada critério de aceite com pelo menos um caso "mundo_ideal" (caminho feliz) e, quando houver regra, casos "limite" (exceções, campos obrigatórios vazios, valores no limite, datas inválidas).
- Segurança e governança: só verificações defensivas de configuração e de controle de acesso (perfil sem permissão não vê/edita, sessão expira, dados pessoais mascarados, mensagens de erro sem detalhe técnico); nada de cargas de ataque.
- "automatizavel": false quando depender de algo fora da tela (e-mail recebido, arquivo externo, outro sistema sem tela).
- Não repita casos. Responda SOMENTE o JSON.`;
async function gerarCasos(P, fonte, tipos, qtd, instrucoes) {
  const listaTipos = tipos.map(t => `${t} (${TIPOS_CASO[t]?.nome || t})`).join(', ');
  const txt = await claude(SYS_BASE + `\nTarefa: gerar CASOS DE TESTE detalhados (item 9.3.1 da metodologia) a partir das especificações. Responda SOMENTE JSON no formato: ${CASO_JSON}`,
    `PROJETO: ${P.nome} · CLIENTE: ${P.cliente || '—'}\n${instrucoes ? 'INSTRUÇÕES DO ESPECIALISTA DE QUALIDADE: ' + instrucoes + '\n' : ''}TIPOS A GERAR: ${listaTipos}\nQUANTIDADE: até ${qtd} casos no total, priorizando por risco.\n${REGRAS_CASO}\n\n${fonte}`, 12000);
  const j = json(txt); return (Array.isArray(j) ? j : j.casos || []).filter(c => c && c.titulo);
}
async function _fonteSpec(sql, pid) {
  const erf = await _doc(sql, pid, 'erf'), ert = await _doc(sql, pid, 'ert');
  if (!erf?.conteudo_md && !ert?.conteudo_md) throw new Error('Importe a ERF (e, de preferência, gere a ERT) antes do plano de testes.');
  const itens = await sql`SELECT codigo, titulo, requisito_ref, criterios FROM fab_itens WHERE projeto_id=${pid} ORDER BY codigo`;
  return `ERF:\n${String(erf?.conteudo_md || '').substring(0, 45000)}\n\nERT:\n${String(ert?.conteudo_md || '').substring(0, 25000)}${itens.length ? '\n\nITENS DA FÁBRICA (use item_codigo quando o caso testar um item):\n' + itens.map(i => `${i.codigo} [${i.requisito_ref || ''}] ${i.titulo} — critérios: ${String(i.criterios || '').substring(0, 300)}`).join('\n').substring(0, 10000) : ''}`;
}
async function _inserirCasos(sql, pid, casos, origem = 'ia') {
  const ult = (await sql`SELECT codigo FROM fab_casos WHERE projeto_id=${pid} AND codigo LIKE 'CT-%' ORDER BY LENGTH(codigo) DESC, codigo DESC LIMIT 1`)[0];
  let n = ult ? parseInt(String(ult.codigo).replace(/\D/g, '')) || 0 : 0; const ids = [];
  const itens = await sql`SELECT codigo, requisito_ref FROM fab_itens WHERE projeto_id=${pid}`;
  for (const c of casos.slice(0, 200)) {
    const tipo = TIPOS_CASO[c.tipo] ? c.tipo : 'funcional', pr = PRIOR.includes(c.prioridade) ? c.prioridade : 'media';
    const item = c.item_codigo && itens.some(i => i.codigo === c.item_codigo) ? c.item_codigo : (itens.find(i => i.requisito_ref && c.requisito_ref && i.requisito_ref.split(/[,;\s]+/).includes(c.requisito_ref))?.codigo || null);
    const id = novoId('fct'); n++;
    await sql`INSERT INTO fab_casos (id, projeto_id, codigo, titulo, tipo, requisito_ref, item_codigo, prioridade, risco, pre_condicao, passos, dados, esperado, automatizavel, origem)
      VALUES (${id}, ${pid}, ${'CT-' + String(n).padStart(3, '0')}, ${String(c.titulo).substring(0, 300)}, ${tipo}, ${c.requisito_ref || null}, ${item}, ${pr}, ${c.risco || null}, ${c.pre_condicao || null},
        ${JSON.stringify((Array.isArray(c.passos) ? c.passos : String(c.passos || '').split('\n')).map(s => String(s).trim()).filter(Boolean).slice(0, 25))}, ${c.dados || null}, ${c.esperado || null}, ${c.automatizavel !== false}, ${origem})`;
    ids.push(id);
  }
  return ids;
}
const TIPOS_FUNC = ['mundo_ideal', 'funcional', 'limite', 'regressao', 'dados', 'ia'], TIPOS_NF = ['integracao', 'seguranca', 'governanca', 'layout', 'macaco', 'desempenho', 'unitario'];
async function gerarPlanoTestes(sql, P, b) {
  const fonte = await _fonteSpec(sql, P.id);
  const tipos = Array.isArray(b.tipos) && b.tipos.length ? b.tipos.filter(t => TIPOS_CASO[t]) : Object.keys(TIPOS_CASO);
  const f = tipos.filter(t => TIPOS_FUNC.includes(t)), nf = tipos.filter(t => TIPOS_NF.includes(t));
  const qtd = Math.min(80, parseInt(b.quantidade) || 45);
  const [cf, cnf, estrategia] = await Promise.all([
    f.length ? gerarCasos(P, fonte, f, Math.ceil(qtd * (nf.length ? 0.65 : 1)), b.instrucoes) : [],
    nf.length ? gerarCasos(P, fonte, nf, Math.ceil(qtd * (f.length ? 0.35 : 1)), b.instrucoes) : [],
    claude(SYS_BASE + `\nTarefa: escrever as seções de ESTRATÉGIA do Plano de Testes Detalhado (item 9.3.1). Os casos detalhados são gerados à parte — não os liste.`,
      `PROJETO: ${P.nome} · CLIENTE: ${P.cliente || '—'}\n${b.instrucoes ? 'INSTRUÇÕES: ' + b.instrucoes + '\n' : ''}ROBÔS DE QA DISPONÍVEIS NA ATLANTYX:\n${Object.values(ROBOS).map(r => '- ' + r).join('\n')}\n\n${fonte.substring(0, 50000)}\n\nEscreva em Markdown, com estes títulos:\n## 1. Objetivo, estratégia e escopo (por funcionalidade, integração e componente, com os tipos de teste aplicáveis — tabela)\n## 2. Camadas de teste e robôs (tabela: camada, o que valida, robô/ferramenta, quando roda, critério de aprovação)\n## 3. Priorização por risco (tabela: área, chance de defeito, impacto no negócio, prioridade)\n## 4. Massas de dados de teste (fictícias/mascaradas, por cenário)\n## 5. Plano de testes de segurança e de desempenho (verificações de configuração e acesso; perfis de carga e volumes a simular)\n## 6. Ambientes, papéis e controle humano (revisão dos casos pelo especialista de qualidade; confirmação de cada defeito antes de reportar ao cliente)\n## 7. Critérios de entrada e de saída (gate G7)`, 6000),
  ]);
  if (b.substituir !== false) await sql`DELETE FROM fab_casos WHERE projeto_id=${P.id} AND origem='ia' AND status='nao_executado'`;
  const ids = await _inserirCasos(sql, P.id, [...cf, ...cnf]);
  return { md: await planoTestesMd(sql, P, limpaMd(estrategia)), casos_gerados: ids.length };
}
async function planoTestesMd(sql, P, estrategia) {
  if (estrategia == null) { const d = await _doc(sql, P.id, 'plano_testes'); estrategia = String(d?.conteudo_md || '').split(/\n## 8\. /)[0].replace(/^# Plano de Testes Detalhado\s*/, ''); }
  const C = await sql`SELECT * FROM fab_casos WHERE projeto_id=${P.id} ORDER BY codigo`;
  const porTipo = Object.keys(TIPOS_CASO).map(t => [t, C.filter(c => c.tipo === t)]).filter(([, L]) => L.length);
  const reqs = [...new Set(C.map(c => c.requisito_ref).filter(Boolean))].sort();
  const L = ['# Plano de Testes Detalhado', '', estrategia.trim(), '', '## 8. Resumo dos casos de teste', '',
    `Total de **${C.length} casos**, ${C.filter(c => c.automatizavel).length} automatizáveis pelos robôs de QA (${C.length ? Math.round(C.filter(c => c.automatizavel).length / C.length * 100) : 0}%), cobrindo ${reqs.length} requisito(s).`, '',
    '| Tipo | Casos | Alta | Média | Baixa | Automatizáveis | Robô |', '|---|---|---|---|---|---|---|',
    ...porTipo.map(([t, L2]) => `| ${TIPOS_CASO[t].nome} | ${L2.length} | ${L2.filter(c => c.prioridade === 'alta').length} | ${L2.filter(c => c.prioridade === 'media').length} | ${L2.filter(c => c.prioridade === 'baixa').length} | ${L2.filter(c => c.automatizavel).length} | ${mdc(ROBOS[TIPOS_CASO[t].robo] || '').split('(')[0]} |`), '',
    '## 9. Lista de casos de teste', '', '| Código | Caso | Tipo | Requisito | Item | Prioridade | Situação |', '|---|---|---|---|---|---|---|',
    ...C.map(c => `| ${c.codigo} | ${mdc(c.titulo)} | ${TIPOS_CASO[c.tipo]?.nome || c.tipo} | ${c.requisito_ref || '—'} | ${c.item_codigo || '—'} | ${c.prioridade} | ${({ nao_executado: 'Não executado', passou: 'Aprovado', falhou: 'Reprovado', bloqueado: 'Bloqueado' })[c.status] || c.status} |`), '',
    '<!-- quebra -->', '', '## 10. Casos de teste detalhados', ''];
  for (const [t, L2] of porTipo) {
    L.push(`### 10.${Object.keys(TIPOS_CASO).indexOf(t) + 1} ${TIPOS_CASO[t].nome}`, '');
    for (const c of L2) {
      L.push(`#### ${c.codigo} — ${mdc(c.titulo)}`, '', `| Campo | Detalhe |`, `|---|---|`, `| Requisito | ${c.requisito_ref || '—'} |`, `| Item da fábrica | ${c.item_codigo || '—'} |`, `| Prioridade / risco | ${c.prioridade}${c.risco ? ' — ' + mdc(c.risco) : ''} |`,
        `| Pré-condição | ${mdc(c.pre_condicao) || '—'} |`, `| Dados de teste | ${mdc(c.dados) || '—'} |`, `| Resultado esperado | ${mdc(c.esperado) || '—'} |`, `| Execução | ${c.automatizavel ? 'Automatizada (robô de QA)' : 'Manual'} |`, '', '**Passos:**', '');
      (c.passos || []).forEach((p, i) => L.push(`${i + 1}. ${p}`)); L.push('');
    }
  }
  L.push('<!-- quebra -->', '', '## 11. Matriz de rastreabilidade (requisito → casos → item → situação)', '', '| Requisito | Casos | Itens da fábrica | Aprovados | Reprovados | Não executados |', '|---|---|---|---|---|---|',
    ...reqs.map(r => { const X = C.filter(c => c.requisito_ref === r); return `| ${r} | ${X.map(c => c.codigo).join(', ')} | ${[...new Set(X.map(c => c.item_codigo).filter(Boolean))].join(', ') || '—'} | ${X.filter(c => c.status === 'passou').length} | ${X.filter(c => c.status === 'falhou').length} | ${X.filter(c => c.status === 'nao_executado').length} |`; }),
    '', '## 12. Indicadores acompanhados (item 9.5)', '', '- Defeitos encontrados antes da homologação versus durante e depois.', '- Tempo médio entre o surgimento e a identificação de um problema.', '- Tempo médio de diagnóstico e de correção.', '- Percentual de critérios de aceite cobertos por testes automáticos.', '- Defeitos que chegaram à produção.', '- Alertas da IA confirmados versus descartados.');
  return L.join('\n');
}
async function gerarRelatorioQualidade(sql, P) {
  const D = await painel({ projeto_id: P.id });
  const G = D.g7, I = D.indicadores, c = D.casos.total;
  const L = ['# Relatório de Qualidade', '', `Projeto **${P.nome}**${P.cliente ? ' · cliente **' + P.cliente + '**' : ''} · emitido em ${hojeBR()}.`, '',
    '## 1. Parecer do gate G7', '', `> ${G.aprovavel ? 'A versão ATENDE aos critérios do gate G7 e pode seguir para aprovação do ponto focal e da TI do cliente.' : 'A versão AINDA NÃO atende a todos os critérios do gate G7 — ver pendências abaixo.'}`, '',
    '| Critério G7 | Situação | Detalhe |', '|---|---|---|', ...G.criterios.map(x => `| ${x.nome} | ${x.ok ? '✔ Atendido' : '✖ Pendente'} | ${mdc(x.detalhe)} |`), '',
    '## 2. Resultado por camada de teste', '', '| Tipo | Casos | Aprovados | Reprovados | Bloqueados | Não executados |', '|---|---|---|---|---|---|',
    ...D.casos.por_tipo.map(t => `| ${t.nome} | ${t.total} | ${t.passou} | ${t.falhou} | ${t.bloqueado} | ${t.nao_executado} |`),
    `| **Total** | **${c.total}** | **${c.passou}** | **${c.falhou}** | **${c.bloqueado}** | **${c.nao_executado}** |`, '',
    ...(D.unitarios ? ['### Testes unitários (fábrica)', '', `${D.unitarios.total} testes · ${D.unitarios.passou} aprovados · ${D.unitarios.falhou} reprovados${D.unitarios.cobertura_pct != null ? ' · cobertura ' + D.unitarios.cobertura_pct + '%' : ''} (arquivo ${D.unitarios.arquivo || '—'}, ${new Date(D.unitarios.em).toLocaleDateString('pt-BR')}).`, ''] : []),
    '## 3. Robôs de QA — última execução', '', ...(D.robos.length ? ['| Robô | Resultado |', '|---|---|', ...D.robos.map(r => `| ${mdc(r.nome)} | ${mdc(r.resumo)} |`)] : ['Nenhuma execução dos robôs registrada para o produto ligado a este projeto.']), '',
    '## 4. Registro de defeitos', '', '| Severidade | Abertos | Em correção | Corrigidos (reteste) | Aceitos | Validados |', '|---|---|---|---|---|---|',
    ...['critica', 'alta', 'media', 'baixa'].map(s => { const x = D.defeitos.por_sev[s] || {}; return `| ${s} | ${x.aberto || 0} | ${x.em_correcao || 0} | ${x.corrigido || 0} | ${x.aceito || 0} | ${x.validado || 0} |`; }), '',
    ...(D.defeitos.lista.length ? ['| Defeito | Tipo | Severidade | Situação | Tela |', '|---|---|---|---|---|', ...D.defeitos.lista.slice(0, 80).map(d => `| ${mdc(d.titulo)} | ${d.tipo} | ${d.severidade} | ${d.status} | ${mdc(d.tela) || '—'} |`), ''] : []),
    '## 5. Rastreabilidade', '', `${D.requisitos.cobertos} de ${D.requisitos.total} requisitos com casos de teste; ${D.requisitos.aprovados} com todos os casos aprovados.`, '',
    '| Requisito | Casos | Aprovados | Reprovados | Situação |', '|---|---|---|---|---|', ...D.requisitos.lista.map(r => `| ${r.ref} | ${r.casos} | ${r.passou} | ${r.falhou} | ${r.situacao} |`), '',
    '## 6. Indicadores de precisão (item 9.5)', '', '| Indicador | Valor |', '|---|---|',
    `| Defeitos antes da homologação × durante/depois | ${I.defeitos_antes_homolog} × ${I.defeitos_depois_homolog} |`, `| Tempo médio de detecção | ${I.mttd_h != null ? I.mttd_h + ' h' : '—'} |`, `| Tempo médio de diagnóstico e correção | ${I.mttr_h != null ? I.mttr_h + ' h' : '—'} |`,
    `| Critérios de aceite cobertos por testes automáticos | ${I.criterios_automatizados_pct}% |`, `| Defeitos que chegaram à produção | ${I.defeitos_producao} |`, `| Alertas da IA confirmados × descartados | ${I.ia_confirmados} × ${I.ia_descartados}${I.ia_acerto_pct != null ? ' (' + I.ia_acerto_pct + '% de acerto)' : ''} |`, ''];
  let parecer = '';
  try { parecer = await claude(SYS_BASE + '\nTarefa: escrever o PARECER EXECUTIVO do Relatório de Qualidade (máx. 12 linhas): situação da versão, principais riscos, recomendação para o gate G7 e próximos passos. Só use os números fornecidos.', L.join('\n').substring(0, 30000), 1500); } catch (_) {}
  if (parecer) L.splice(4, 0, '## Parecer executivo', '', limpaMd(parecer), '');
  return L.join('\n');
}
async function docGerar(b) {
  const sql = await fabSql(); const P = (await sql`SELECT * FROM fab_projetos WHERE id=${b.projeto_id}`)[0]; if (!P) throw new Error('Projeto não encontrado');
  let md, extra = {};
  if (b.tipo === 'ert') md = await gerarErt(sql, P, b);
  else if (b.tipo === 'plano_projeto') md = await gerarPlanoProjeto(sql, P, b);
  else if (b.tipo === 'plano_testes') { if (b.so_atualizar) md = await planoTestesMd(sql, P, null); else { const r = await gerarPlanoTestes(sql, P, b); md = r.md; extra.casos_gerados = r.casos_gerados; } }
  else if (b.tipo === 'relatorio_qualidade') md = await gerarRelatorioQualidade(sql, P);
  else throw new Error('Este documento é importado, não gerado pela IA');
  const r = await _docGravar(sql, P.id, b.tipo, md, { origem: b.so_atualizar ? 'sistema' : 'ia', titulo: DOCS[b.tipo].nome });
  await sql`UPDATE fab_projetos SET atualizado_em=NOW() WHERE id=${P.id}`;
  return { ...r, ...extra, caracteres: md.length };
}
async function docWord({ projeto_id, tipo }) {
  const sql = await fabSql(); const P = (await sql`SELECT * FROM fab_projetos WHERE id=${projeto_id}`)[0]; if (!P) throw new Error('Projeto não encontrado');
  let d = await _doc(sql, projeto_id, tipo);
  if (tipo === 'backlog') d = { conteudo_md: await backlogMd(sql, P), versao: 1, status: 'rascunho' };
  if (!d?.conteudo_md) throw new Error('Documento ainda não existe');
  const { gerarDocx } = await import('../lib/docx-md.js');
  const nomeDoc = tipo === 'backlog' ? 'Backlog da Fábrica' : DOCS[tipo]?.nome || tipo;
  const buf = await gerarDocx(d.conteudo_md.replace(/^#\s+.*\n/, ''), { titulo: nomeDoc, subtitulo: P.nome, projeto: P.nome, cliente: P.cliente, versao: d.versao, status: d.status, aprovado_por: d.aprovado_por, aprovado_em: d.aprovado_em ? new Date(d.aprovado_em).toLocaleDateString('pt-BR') : null });
  return { nome: `${(DOCS[tipo]?.sigla || 'BKL')}_${P.nome}_v${d.versao}.docx`.replace(/[^\wÀ-ú.\- ]+/g, '_'), base64: Buffer.from(buf).toString('base64') };
}
async function pacoteWord({ projeto_id }) {
  const sql = await fabSql(); const P = (await sql`SELECT * FROM fab_projetos WHERE id=${projeto_id}`)[0]; if (!P) throw new Error('Projeto não encontrado');
  const partes = [];
  for (const [tipo, nome] of [['plano_projeto', 'Parte 1 — Plano Detalhado de Projeto e Cronograma'], ['ert', 'Parte 2 — Especificação de Requisitos Técnicos (ERT)'], ['backlog', 'Parte 3 — Backlog da Fábrica'], ['plano_testes', 'Parte 4 — Plano de Testes Detalhado']]) {
    const md = tipo === 'backlog' ? await backlogMd(sql, P) : (await _doc(sql, projeto_id, tipo))?.conteudo_md;
    if (!md) continue;
    partes.push(`# ${nome}\n\n` + md.replace(/^#\s+.*\n/, '').replace(/^(#{1,3})\s/gm, (m, h) => '#' + h + ' ').replace(/^#####\s/gm, '#### '));
  }
  if (!partes.length) throw new Error('Nenhum documento pronto para o pacote');
  const intro = `# Orientações para a fábrica de desenvolvimento\n\nEste pacote reúne o que a fábrica precisa para montar o seu Kanban e construir a versão: o plano e o cronograma, a especificação técnica, o backlog com critérios de aceite e o plano de testes que os robôs de QA da Atlantyx vão executar.\n\n- Cada item do backlog (IT-xx) tem critérios de aceite e está ligado aos requisitos (RF/RT) e aos casos de teste (CT-xxx).\n- Ao terminar um item, mova-o para **Em QA**: os robôs executam os casos ligados; todos aprovados → **Aprovado no QA**; algum reprovado → volta para **Em desenvolvimento** com a evidência.\n- Envie o resultado dos testes unitários no formato JUnit XML para registro no gate G6.\n- Dúvidas e mudanças seguem o processo de gestão de mudanças do Plano de Projeto.`;
  const { gerarDocx } = await import('../lib/docx-md.js');
  const buf = await gerarDocx([intro, ...partes].join('\n\n<!-- quebra -->\n\n'), { titulo: 'Pacote para a Fábrica', subtitulo: P.nome, projeto: P.nome, cliente: P.cliente, versao: 1 });
  return { nome: `Pacote_Fabrica_${P.nome}.docx`.replace(/[^\wÀ-ú.\- ]+/g, '_'), base64: Buffer.from(buf).toString('base64') };
}

// ═══════════════ Kanban da fábrica ═══════════════
async function backlogMd(sql, P) {
  const I = await sql`SELECT * FROM fab_itens WHERE projeto_id=${P.id} ORDER BY ordem, codigo`;
  if (!I.length) return '';
  const C = await sql`SELECT codigo, item_codigo FROM fab_casos WHERE projeto_id=${P.id}`;
  const col = Object.fromEntries(COLUNAS_FAB);
  const L = ['# Backlog da Fábrica', '', `${I.length} itens · ${I.reduce((s, i) => s + (+i.estimativa_h || 0), 0)} h estimadas.`, '', '| Código | Item | Tipo | Prioridade | Estimativa (h) | Requisitos | Casos de teste | Situação |', '|---|---|---|---|---|---|---|---|',
    ...I.map(i => `| ${i.codigo} | ${mdc(i.titulo)} | ${i.tipo || '—'} | ${i.prioridade} | ${i.estimativa_h ?? '—'} | ${i.requisito_ref || '—'} | ${C.filter(c => c.item_codigo === i.codigo).map(c => c.codigo).join(', ') || '—'} | ${col[i.coluna] || i.coluna} |`), '', '## Detalhamento dos itens', ''];
  for (const i of I) L.push(`### ${i.codigo} — ${mdc(i.titulo)}`, '', i.descricao || '', '', '**Critérios de aceite:**', '', ...String(i.criterios || '—').split('\n').map(s => s.trim()).filter(Boolean).map(s => /^[-*\d]/.test(s) ? s : '- ' + s), '');
  return L.join('\n');
}
async function itens({ projeto_id }) {
  const sql = await fabSql();
  const I = await sql`SELECT * FROM fab_itens WHERE projeto_id=${projeto_id} ORDER BY ordem, codigo`;
  const C = await sql`SELECT item_codigo, status, COUNT(*)::int AS n FROM fab_casos WHERE projeto_id=${projeto_id} AND item_codigo IS NOT NULL GROUP BY item_codigo, status`;
  return { itens: I.map(i => { const x = {}; C.filter(c => c.item_codigo === i.codigo).forEach(c => { x[c.status] = c.n; }); return { ...i, casos: x }; }), colunas: COLUNAS_FAB };
}
async function itemSalvar(b) {
  const sql = await fabSql();
  if (b.id) { await sql`UPDATE fab_itens SET titulo=${b.titulo}, descricao=${b.descricao || null}, criterios=${b.criterios || null}, tipo=${b.tipo || null}, prioridade=${PRIOR.includes(b.prioridade) ? b.prioridade : 'media'},
    estimativa_h=${b.estimativa_h === '' || b.estimativa_h == null ? null : Number(b.estimativa_h)}, requisito_ref=${b.requisito_ref || null}, responsavel=${b.responsavel || null}, atualizado_em=NOW() WHERE id=${b.id}`; return { id: b.id }; }
  const ult = (await sql`SELECT codigo FROM fab_itens WHERE projeto_id=${b.projeto_id} AND codigo LIKE 'IT-%' ORDER BY LENGTH(codigo) DESC, codigo DESC LIMIT 1`)[0];
  const n = (ult ? parseInt(String(ult.codigo).replace(/\D/g, '')) || 0 : 0) + 1, id = novoId('fit');
  await sql`INSERT INTO fab_itens (id, projeto_id, codigo, titulo, descricao, criterios, tipo, prioridade, estimativa_h, requisito_ref, responsavel, coluna, ordem, origem)
    VALUES (${id}, ${b.projeto_id}, ${'IT-' + String(n).padStart(2, '0')}, ${b.titulo || 'Novo item'}, ${b.descricao || null}, ${b.criterios || null}, ${b.tipo || null}, ${PRIOR.includes(b.prioridade) ? b.prioridade : 'media'},
      ${b.estimativa_h === '' || b.estimativa_h == null ? null : Number(b.estimativa_h)}, ${b.requisito_ref || null}, ${b.responsavel || null}, ${b.coluna || 'backlog'}, ${n}, ${b.origem || 'manual'})`;
  return { id };
}
async function itemMover({ id, coluna }) {
  if (!COLUNAS_FAB.some(c => c[0] === coluna)) throw new Error('coluna inválida');
  const sql = await fabSql();
  await sql`UPDATE fab_itens SET coluna=${coluna}, em_qa_em=CASE WHEN ${coluna}='qa' THEN NOW() ELSE em_qa_em END, nota=NULL, atualizado_em=NOW() WHERE id=${id}`;
  // ao entrar em QA, os casos ligados voltam a "não executado" para o próximo reteste
  if (coluna === 'qa') { const it = (await sql`SELECT projeto_id, codigo FROM fab_itens WHERE id=${id}`)[0]; if (it) await sql`UPDATE fab_casos SET status='nao_executado', atualizado_em=NOW() WHERE projeto_id=${it.projeto_id} AND item_codigo=${it.codigo} AND status<>'passou'`; }
  return { ok: true };
}
async function itensGerar(b) {
  const sql = await fabSql(); const P = (await sql`SELECT * FROM fab_projetos WHERE id=${b.projeto_id}`)[0]; if (!P) throw new Error('Projeto não encontrado');
  const ert = await _doc(sql, P.id, 'ert'), erf = await _doc(sql, P.id, 'erf'); if (!ert?.conteudo_md && !erf?.conteudo_md) throw new Error('Importe a ERF e gere a ERT antes do backlog.');
  const txt = await claude(SYS_BASE + `\nTarefa: quebrar a especificação no BACKLOG DA FÁBRICA DE DESENVOLVIMENTO (itens de construção do tamanho de 4 a 40 horas, verticais e testáveis). Responda SOMENTE JSON: {"itens":[{"titulo":"...","descricao":"o que construir (telas, regras, integrações)","criterios":"critérios de aceite, um por linha, no formato Dado/Quando/Então","tipo":"funcionalidade|integracao|dados|ia|seguranca|infra|relatorio","prioridade":"alta|media|baixa","estimativa_h":16,"requisito_ref":"RF-01, RT-03"}]}`,
    `PROJETO: ${P.nome}\n${b.instrucoes ? 'INSTRUÇÕES: ' + b.instrucoes + '\n' : ''}\nERF:\n${String(erf?.conteudo_md || '').substring(0, 40000)}\n\nERT:\n${String(ert?.conteudo_md || '').substring(0, 30000)}`, 12000);
  const j = json(txt); const L = (Array.isArray(j) ? j : j.itens || []).filter(x => x?.titulo);
  if (b.substituir) await sql`DELETE FROM fab_itens WHERE projeto_id=${P.id} AND origem='ia' AND coluna='backlog'`;
  let n = 0; for (const x of L.slice(0, 120)) { await itemSalvar({ ...x, projeto_id: P.id, origem: 'ia', criterios: Array.isArray(x.criterios) ? x.criterios.join('\n') : x.criterios }); n++; }
  // liga casos já existentes aos itens pelo requisito
  const I = await sql`SELECT codigo, requisito_ref FROM fab_itens WHERE projeto_id=${P.id} AND requisito_ref IS NOT NULL`;
  const C = await sql`SELECT id, requisito_ref FROM fab_casos WHERE projeto_id=${P.id} AND item_codigo IS NULL AND requisito_ref IS NOT NULL`;
  let lig = 0; for (const c of C) { const it = I.find(i => i.requisito_ref.split(/[,;\s]+/).includes(c.requisito_ref)); if (it) { await sql`UPDATE fab_casos SET item_codigo=${it.codigo} WHERE id=${c.id}`; lig++; } }
  return { itens_gerados: n, casos_ligados: lig };
}

// ═══════════════ casos de teste ═══════════════
async function casos({ projeto_id }) {
  const sql = await fabSql();
  const C = await sql`SELECT * FROM fab_casos WHERE projeto_id=${projeto_id} ORDER BY codigo`;
  const plano = (await sql`SELECT status, versao FROM fab_documentos WHERE projeto_id=${projeto_id} AND tipo='plano_testes'`)[0] || null;
  return { casos: C, tipos: TIPOS_CASO, robos: ROBOS, plano };
}
async function casoSalvar(b) {
  const sql = await fabSql();
  const passos = JSON.stringify((Array.isArray(b.passos) ? b.passos : String(b.passos || '').split('\n')).map(s => String(s).trim()).filter(Boolean));
  if (b.id) { await sql`UPDATE fab_casos SET titulo=${b.titulo}, tipo=${TIPOS_CASO[b.tipo] ? b.tipo : 'funcional'}, requisito_ref=${b.requisito_ref || null}, item_codigo=${b.item_codigo || null}, prioridade=${PRIOR.includes(b.prioridade) ? b.prioridade : 'media'},
    risco=${b.risco || null}, pre_condicao=${b.pre_condicao || null}, passos=${passos}, dados=${b.dados || null}, esperado=${b.esperado || null}, automatizavel=${b.automatizavel !== false}, atualizado_em=NOW() WHERE id=${b.id}`; return { id: b.id }; }
  const [id] = await _inserirCasos(sql, b.projeto_id, [{ ...b, passos: JSON.parse(passos) }], 'manual'); return { id };
}
async function casoStatus({ id, status, evidencia }) {
  if (!['nao_executado', 'passou', 'falhou', 'bloqueado'].includes(status)) throw new Error('status inválido');
  const sql = await fabSql(); const c = (await sql`SELECT projeto_id FROM fab_casos WHERE id=${id}`)[0]; if (!c) throw new Error('caso não encontrado');
  await sql`UPDATE fab_casos SET status=${status}, evidencia=COALESCE(${evidencia || null}, evidencia), execucoes=execucoes+CASE WHEN ${status}='nao_executado' THEN 0 ELSE 1 END, ultima_execucao_em=NOW(),
    primeira_falha_em=CASE WHEN ${status}='falhou' AND primeira_falha_em IS NULL THEN NOW() ELSE primeira_falha_em END, atualizado_em=NOW() WHERE id=${id}`;
  if (status !== 'nao_executado') await sql`INSERT INTO fab_casos_hist (id, caso_id, projeto_id, status, evidencia) VALUES (${novoId('fch')}, ${id}, ${c.projeto_id}, ${status}, ${'manual: ' + (evidencia || '')})`;
  const mov = await moverItensPorCasos(sql, c.projeto_id);
  return { ok: true, itens_movidos: mov };
}
async function casosSugerir(b) {
  const sql = await fabSql(); const P = (await sql`SELECT * FROM fab_projetos WHERE id=${b.projeto_id}`)[0]; if (!P) throw new Error('Projeto não encontrado');
  const fonte = await _fonteSpec(sql, P.id);
  const existentes = await sql`SELECT codigo, titulo, tipo, requisito_ref FROM fab_casos WHERE projeto_id=${P.id} ORDER BY codigo`;
  const tipos = Array.isArray(b.tipos) && b.tipos.length ? b.tipos.filter(t => TIPOS_CASO[t]) : ['mundo_ideal', 'funcional', 'limite'];
  const foco = [b.requisito_ref && 'Requisito: ' + b.requisito_ref, b.item_codigo && 'Item da fábrica: ' + b.item_codigo, b.pedido && 'Pedido do especialista: ' + b.pedido].filter(Boolean).join('\n');
  const L = await gerarCasos(P, fonte + `\n\nCASOS QUE JÁ EXISTEM (não repita):\n${existentes.map(c => `${c.codigo} [${c.tipo}/${c.requisito_ref || ''}] ${c.titulo}`).join('\n').substring(0, 8000)}\n\nFOCO DESTA SUGESTÃO:\n${foco || 'lacunas de cobertura do plano atual'}`, tipos, Math.min(20, parseInt(b.quantidade) || 8), b.pedido);
  return { sugestoes: L };
}
async function unitariosImportar({ projeto_id, nome, base64, xml, cobertura_pct }) {
  const sql = await fabSql();
  const txt = xml || Buffer.from(String(base64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64').toString('utf8');
  if (!/<testsuite|<testcase/i.test(txt)) throw new Error('Arquivo não parece JUnit XML (precisa de <testsuite>/<testcase>)');
  const casos = [...txt.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)].map(m => { const at = k => (m[1].match(new RegExp(k + '="([^"]*)"')) || [])[1] || ''; const dentro = m[3] || '';
    return { nome: ent(at('name')), classe: ent(at('classname')), tempo: Number(at('time')) || 0, status: /<(failure|error)\b/.test(dentro) ? 'falhou' : /<skipped\b/.test(dentro) ? 'ignorado' : 'passou', msg: ent((dentro.match(/<(?:failure|error)[^>]*message="([^"]*)"/) || [])[1] || '').substring(0, 300) }; });
  const tot = casos.length, fal = casos.filter(c => c.status === 'falhou').length, ign = casos.filter(c => c.status === 'ignorado').length;
  const cob = cobertura_pct != null && cobertura_pct !== '' ? Number(cobertura_pct) : (Number((txt.match(/line-rate="([\d.]+)"/) || [])[1]) * 100 || null);
  await sql`INSERT INTO fab_unitarios (id, projeto_id, arquivo, total, passou, falhou, ignorados, cobertura_pct, detalhes) VALUES (${novoId('fun')}, ${projeto_id}, ${nome || 'junit.xml'}, ${tot}, ${tot - fal - ign}, ${fal}, ${ign}, ${cob}, ${JSON.stringify(casos.filter(c => c.status !== 'passou').slice(0, 200).concat(casos.filter(c => c.status === 'passou').slice(0, 100)))})`;
  // casos do plano do tipo "unitario" citados pelo código (CT-xxx) no nome do teste
  const C = await sql`SELECT id, codigo FROM fab_casos WHERE projeto_id=${projeto_id} AND tipo='unitario'`; const res = [];
  for (const c of C) { const L = casos.filter(x => (x.nome + ' ' + x.classe).includes(c.codigo)); if (L.length) res.push({ id: c.id, status: L.some(x => x.status === 'falhou') ? 'falhou' : 'passou', evidencia: 'JUnit: ' + L.map(x => x.nome + ' → ' + x.status + (x.msg ? ' (' + x.msg + ')' : '')).join('; ') }); }
  const { aplicarResultadosCasos } = await import('../lib/fabrica-db.js');
  const r = await aplicarResultadosCasos(sql, 'junit', res);
  return { total: tot, passou: tot - fal - ign, falhou: fal, ignorados: ign, cobertura_pct: cob, casos_atualizados: r.casos_atualizados };
}

// ═══════════════ painel (interno e do cliente) ═══════════════
async function painel({ projeto_id, publico = false }) {
  const sql = await fabSql(); const P = (await sql`SELECT * FROM fab_projetos WHERE id=${projeto_id}`)[0]; if (!P) throw new Error('Projeto não encontrado');
  const C = await sql`SELECT id, codigo, titulo, tipo, requisito_ref, item_codigo, prioridade, status, automatizavel, evidencia, ultima_execucao_em, primeira_falha_em FROM fab_casos WHERE projeto_id=${P.id} ORDER BY codigo`;
  const I = await sql`SELECT codigo, titulo, coluna, em_qa_em FROM fab_itens WHERE projeto_id=${P.id}`;
  const plano = await _doc(sql, P.id, 'plano_testes');
  const U = (await sql`SELECT * FROM fab_unitarios WHERE projeto_id=${P.id} ORDER BY em DESC LIMIT 1`)[0] || null;
  let A = [], E = [];
  if (P.qa_produto_id) {
    try { A = await sql`SELECT id, tipo, severidade, titulo, tela, status, confirmado, criado_em, atualizado_em FROM qa_achados WHERE produto_id=${P.qa_produto_id} ORDER BY criado_em DESC LIMIT 800`; }
    catch (_) { try { A = (await sql`SELECT id, tipo, severidade, titulo, tela, status, criado_em, atualizado_em FROM qa_achados WHERE produto_id=${P.qa_produto_id} ORDER BY criado_em DESC LIMIT 800`).map(a => ({ ...a, confirmado: false })); } catch (_) {} }
    try { E = await sql`SELECT id, status, pedido_em, iniciado_em, terminado_em, telas_descobertas, telas_testadas, cobertura_pct, resumo, erro FROM qa_execucoes WHERE produto_id=${P.qa_produto_id} ORDER BY pedido_em DESC LIMIT 12`; } catch (_) {}
  }
  const somenteConf = publico && P.painel_so_confirmados !== false;
  const Av = somenteConf ? A.filter(a => a.confirmado) : A;
  const conta = L => ({ total: L.length, passou: L.filter(c => c.status === 'passou').length, falhou: L.filter(c => c.status === 'falhou').length, bloqueado: L.filter(c => c.status === 'bloqueado').length, nao_executado: L.filter(c => c.status === 'nao_executado').length });
  const casosR = { total: conta(C), por_tipo: Object.entries(TIPOS_CASO).map(([k, t]) => ({ tipo: k, nome: t.nome, ...conta(C.filter(c => c.tipo === k)) })).filter(t => t.total) };
  // requisitos: os citados nos casos + os RF numerados da ERF (requisito sem caso aparece como lacuna)
  const erfDoc = await _doc(sql, P.id, 'erf');
  const doErf = [...new Set((String(erfDoc?.conteudo_md || '').match(/\bRF[-_ ]?\d{1,4}\b/g) || []).map(r => r.replace(/[_ ]/, '-').replace(/^RF(\d)/, 'RF-$1')))];
  const refs = [...new Set([...C.map(c => c.requisito_ref).filter(Boolean), ...doErf])].sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }));
  const reqLista = refs.map(r => { const X = C.filter(c => c.requisito_ref === r), k = conta(X); return { ref: r, casos: X.length, ...k, codigos: X.map(c => c.codigo), situacao: !X.length ? 'Sem caso' : k.falhou ? 'Reprovado' : k.passou === X.length ? 'Aprovado' : k.passou ? 'Parcial' : 'Não executado' }; });
  // defeitos
  const ABERTOS = ['aberto', 'em_correcao', 'corrigido'];
  const porSev = {}; for (const a of Av) { porSev[a.severidade] = porSev[a.severidade] || {}; porSev[a.severidade][a.status] = (porSev[a.severidade][a.status] || 0) + 1; }
  const abertosCA = Av.filter(a => ABERTOS.includes(a.status) && ['critica', 'alta'].includes(a.severidade));
  const abertosMB = Av.filter(a => ABERTOS.includes(a.status) && ['media', 'baixa'].includes(a.severidade));
  const criterio = C.filter(c => ['mundo_ideal', 'funcional', 'limite'].includes(c.tipo));
  const g7 = [
    { nome: 'Todos os critérios de aceite da versão aprovados', ok: criterio.length > 0 && criterio.every(c => c.status === 'passou'), detalhe: criterio.length ? `${criterio.filter(c => c.status === 'passou').length} de ${criterio.length} casos de critério de aceite aprovados` : 'sem casos de critério de aceite no plano' },
    { nome: 'Nenhum defeito crítico ou alto em aberto', ok: P.qa_produto_id ? abertosCA.length === 0 : false, detalhe: P.qa_produto_id ? `${abertosCA.length} defeito(s) crítico(s)/alto(s) pendente(s)` : 'projeto sem produto ligado ao QA de Produtos' },
    { nome: 'Defeitos médios e baixos aceitos formalmente', ok: abertosMB.length === 0, detalhe: `${abertosMB.length} médio(s)/baixo(s) sem correção nem aceite formal` },
    { nome: 'Plano de testes executado com evidências', ok: !!plano && plano.status === 'aprovado' && C.length > 0 && C.every(c => c.status !== 'nao_executado'), detalhe: `${plano ? 'plano ' + (plano.status === 'aprovado' ? 'aprovado' : 'em rascunho') : 'sem plano'} · ${C.filter(c => c.status !== 'nao_executado').length} de ${C.length} casos executados` },
  ];
  const seg = Av.filter(a => ['seguranca', 'governanca'].includes(a.tipo) && ABERTOS.includes(a.status));
  const des = Av.filter(a => a.tipo === 'desempenho' && ABERTOS.includes(a.status));
  const g8 = [
    { nome: 'Nenhuma vulnerabilidade crítica ou alta em aberto', ok: !seg.some(a => ['critica', 'alta'].includes(a.severidade)), detalhe: `${seg.filter(a => ['critica', 'alta'].includes(a.severidade)).length} crítica(s)/alta(s)` },
    { nome: 'Vulnerabilidades médias corrigidas ou com risco aceito', ok: !seg.some(a => a.severidade === 'media'), detalhe: `${seg.filter(a => a.severidade === 'media').length} média(s) pendente(s)` },
    { nome: 'Metas de desempenho atingidas', ok: des.length === 0, detalhe: `${des.length} achado(s) de desempenho em aberto` },
  ];
  const g6 = [{ nome: 'Testes unitários executados e aprovados', ok: !!U && U.falhou === 0 && U.total > 0, detalhe: U ? `${U.passou}/${U.total} aprovados${U.cobertura_pct != null ? ' · cobertura ' + Number(U.cobertura_pct).toFixed(0) + '%' : ''}` : 'resultado JUnit ainda não enviado pela fábrica' }];
  // indicadores 9.5
  const homolog = P.gates?.G7?.em || P.gates?.G8?.em; const prod = P.gates?.G11?.em || P.gates?.G10?.em;
  const ia = A.filter(a => ['logica', 'dados', 'layout'].includes(a.tipo));
  const iaConf = ia.filter(a => a.confirmado || ['em_correcao', 'corrigido', 'validado', 'aceito'].includes(a.status)).length, iaDesc = ia.filter(a => a.status === 'falso_positivo').length;
  const res = A.filter(a => a.status === 'validado');
  const mttr = res.length ? Math.round(res.reduce((s, a) => s + (new Date(a.atualizado_em) - new Date(a.criado_em)), 0) / res.length / 36e5 * 10) / 10 : null;
  const det = I.map(i => { if (!i.em_qa_em) return null; const f = C.filter(c => c.item_codigo === i.codigo && c.primeira_falha_em).map(c => new Date(c.primeira_falha_em)); return f.length ? (Math.min(...f) - new Date(i.em_qa_em)) / 36e5 : null; }).filter(x => x != null && x >= 0);
  const autCrit = criterio.length ? Math.round(criterio.filter(c => c.automatizavel).length / criterio.length * 100) : 0;
  const ind = { defeitos_antes_homolog: Av.filter(a => !homolog || new Date(a.criado_em) <= new Date(homolog)).length, defeitos_depois_homolog: homolog ? Av.filter(a => new Date(a.criado_em) > new Date(homolog)).length : 0,
    defeitos_producao: prod ? Av.filter(a => new Date(a.criado_em) > new Date(prod)).length : 0, mttd_h: det.length ? Math.round(det.reduce((s, x) => s + x, 0) / det.length * 10) / 10 : null, mttr_h: mttr,
    criterios_automatizados_pct: autCrit, ia_confirmados: iaConf, ia_descartados: iaDesc, ia_acerto_pct: iaConf + iaDesc ? Math.round(iaConf / (iaConf + iaDesc) * 100) : null };
  // tendência por execução dos robôs
  let hist = []; try { hist = await sql`SELECT execucao_id, status, COUNT(*)::int AS n FROM fab_casos_hist WHERE projeto_id=${P.id} AND execucao_id IS NOT NULL GROUP BY execucao_id, status`; } catch (_) {}
  const tendencia = E.slice().reverse().map(e => { const h = hist.filter(x => x.execucao_id === e.id); const tot = h.reduce((s, x) => s + x.n, 0);
    return { data: e.terminado_em || e.pedido_em, cobertura_pct: Number(e.cobertura_pct) || 0, achados: e.resumo?.achados ?? null, casos: tot, casos_ok_pct: tot ? Math.round((h.find(x => x.status === 'passou')?.n || 0) / tot * 100) : null, status: e.status }; });
  const ult = E.find(e => e.status === 'concluida' || e.status === 'erro');
  const ordemR = Object.keys(ROBOS);
  const robos = ult?.resumo?.robos ? Object.entries(ult.resumo.robos).sort((a, b) => ordemR.indexOf(a[0]) - ordemR.indexOf(b[0])).map(([k, v]) => ({ robo: k, nome: (ROBOS[k] || k).split(' (')[0], resumo: v?.texto || JSON.stringify(v) })) : [];
  return {
    projeto: { id: P.id, nome: P.nome, cliente: P.cliente, etapa: P.etapa, gates: P.gates || {}, gp: P.gp, fabrica: P.fabrica, token_publico: publico ? undefined : P.token_publico, painel_so_confirmados: P.painel_so_confirmados },
    etapas: ETAPAS.map(e => ({ n: e.n, nome: e.nome, gate: e.gate, aprovado: P.gates?.[e.gate]?.status === 'aprovado', em: P.gates?.[e.gate]?.em || null })),
    plano: plano ? { status: plano.status, versao: plano.versao } : null, casos: casosR,
    requisitos: { total: refs.length, cobertos: reqLista.filter(r => r.casos).length, aprovados: reqLista.filter(r => r.situacao === 'Aprovado').length, lista: reqLista },
    itens: { total: I.length, por_coluna: COLUNAS_FAB.map(([k, n]) => ({ coluna: k, nome: n, n: I.filter(i => i.coluna === k).length })) },
    defeitos: { total: Av.length, abertos: Av.filter(a => ABERTOS.includes(a.status)).length, por_sev: porSev, so_confirmados: somenteConf,
      por_tipo: Object.entries(Av.reduce((m, a) => { m[a.tipo] = (m[a.tipo] || 0) + 1; return m; }, {})).map(([tipo, n]) => ({ tipo, n })),
      lista: Av.filter(a => ABERTOS.includes(a.status) || a.status === 'aceito').slice(0, 120).map(a => ({ titulo: a.titulo, tipo: a.tipo, severidade: a.severidade, status: a.status, tela: a.tela })) },
    g6: { criterios: g6, aprovavel: g6.every(x => x.ok) }, g7: { criterios: g7, aprovavel: g7.every(x => x.ok) }, g8: { criterios: g8, aprovavel: g8.every(x => x.ok) },
    unitarios: U ? { total: U.total, passou: U.passou, falhou: U.falhou, ignorados: U.ignorados, cobertura_pct: U.cobertura_pct != null ? Number(U.cobertura_pct) : null, arquivo: U.arquivo, em: U.em } : null,
    indicadores: ind, tendencia, robos, ultima_execucao: ult ? { em: ult.terminado_em, cobertura_pct: Number(ult.cobertura_pct) || 0, telas: ult.telas_testadas, erro: ult.erro } : null,
    gerado_em: new Date().toISOString(),
  };
}

function painelHtml(D) {
  const P = D.projeto, c = D.casos.total, pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const cor = { passou: '#0ca30c', falhou: '#d03b3b', bloqueado: '#fab219', nao_executado: '#b8c2cc' };
  const barra = (t) => { const tot = t.total || 1; return `<div class="bar">${['passou', 'falhou', 'bloqueado', 'nao_executado'].map(k => t[k] ? `<i style="width:${t[k] / tot * 100}%;background:${cor[k]}" title="${k}: ${t[k]}"></i>` : '').join('')}</div>`; };
  const anel = (v, rot, c2) => { const r = 34, L = 2 * Math.PI * r; return `<div class="anel"><svg viewBox="0 0 80 80" width="88" height="88"><circle cx="40" cy="40" r="${r}" fill="none" stroke="#e7ecf1" stroke-width="9"/><circle cx="40" cy="40" r="${r}" fill="none" stroke="${c2}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${L * Math.min(100, v) / 100} ${L}" transform="rotate(-90 40 40)"/><text x="40" y="45" text-anchor="middle" font-size="17" font-weight="700" fill="#0b2a4a">${v}%</text></svg><div>${rot}</div></div>`; };
  const gate = (nome, g) => `<div class="gate ${g.aprovavel ? 'ok' : 'pend'}"><div class="gh">${nome} <span>${g.aprovavel ? 'Critérios atendidos' : 'Pendências'}</span></div>${g.criterios.map(x => `<div class="gc"><b>${x.ok ? '✔' : '✖'}</b> ${esc(x.nome)}<small>${esc(x.detalhe)}</small></div>`).join('')}</div>`;
  const sevCor = { critica: '#d03b3b', alta: '#e0662f', media: '#fab219', baixa: '#8a96a3' };
  const stNome = { aberto: 'Aberto', em_correcao: 'Em correção', corrigido: 'Corrigido · em reteste', aceito: 'Aceito formalmente', validado: 'Validado', falso_positivo: 'Descartado' };
  const T = D.tendencia.filter(t => t.status !== 'fila');
  const linha = T.length > 1 ? (() => { const w = 560, h = 120, xs = i => 20 + i * (w - 40) / (T.length - 1), ys = v => h - 15 - (v || 0) / 100 * (h - 30);
    const pts = k => T.map((t, i) => `${xs(i)},${ys(t[k] ?? 0)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" class="tend"><polyline points="${pts('cobertura_pct')}" fill="none" stroke="#2a78d6" stroke-width="2.5"/><polyline points="${pts('casos_ok_pct')}" fill="none" stroke="#1baf7a" stroke-width="2.5" stroke-dasharray="5 4"/>${T.map((t, i) => `<text x="${xs(i)}" y="${h - 2}" font-size="9" text-anchor="middle" fill="#6b7785">${new Date(t.data).toLocaleDateString('pt-BR').substring(0, 5)}</text>`).join('')}</svg><div class="leg"><span style="--c:#2a78d6">cobertura de telas</span><span style="--c:#1baf7a">casos aprovados</span></div>`; })() : '<p class="muted">A tendência aparece a partir da segunda execução dos robôs.</p>';
  const I = D.indicadores;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel de Qualidade · ${esc(P.nome)}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style>:root{--az:#0b2a4a;--ci:#00c4cc;--t2:#5b6573;--bd:#e3e8ee;--bg:#f4f7fa}*{box-sizing:border-box}body{margin:0;font-family:Montserrat,Segoe UI,Arial,sans-serif;background:var(--bg);color:#1f2933;font-size:13px}
.top{background:var(--az);color:#fff;padding:22px 28px}.top .m{color:var(--ci);font-weight:700;letter-spacing:4px;font-size:12px}.top h1{margin:6px 0 2px;font-size:22px}.top .s{color:#b9c7d6;font-size:12px}
.wrap{max-width:1180px;margin:0 auto;padding:18px 16px 40px}.g{display:grid;gap:12px}.g>*{min-width:0}.et{overflow:hidden;text-overflow:ellipsis;word-break:break-word}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.card{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:14px 16px}.card h2{font-size:13px;margin:0 0 10px;color:var(--az);text-transform:uppercase;letter-spacing:.6px}
.kpi .v{font-size:26px;font-weight:700;color:var(--az)}.kpi .l{font-size:11px;color:var(--t2)}.anel{text-align:center;font-size:11px;color:var(--t2)}.aneis{display:flex;justify-content:space-around;flex-wrap:wrap;gap:8px}
.etapas{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px}.et{border-radius:8px;padding:6px 4px;text-align:center;font-size:10px;background:#eef2f6;color:var(--t2)}.et b{display:block;font-size:12px;color:var(--az)}.et.ok{background:#e1f5e6}.et.at{background:#dff7f8;outline:2px solid var(--ci)}
.gate{border-radius:10px;border:1px solid var(--bd);padding:10px 12px}.gate.ok{border-color:#9ad6a4;background:#f3fbf4}.gate.pend{border-color:#f2c3c3;background:#fff7f7}.gh{font-weight:700;color:var(--az);margin-bottom:6px;display:flex;justify-content:space-between;gap:6px}.gh span{font-size:11px;color:var(--t2);font-weight:600}
.gc{padding:4px 0;border-top:1px dashed var(--bd)}.gc small{display:block;color:var(--t2);font-size:11px;margin-left:16px}.gate.ok .gc b{color:#0ca30c}.gate.pend .gc b{color:#d03b3b}
.bar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:#eef2f6}.bar i{display:block}table{width:100%;border-collapse:collapse;font-size:12px}th{background:var(--az);color:#fff;text-align:left;padding:7px 8px;font-weight:600}td{padding:6px 8px;border-bottom:1px solid var(--bd);vertical-align:top}
.sev{display:inline-block;padding:2px 8px;border-radius:10px;color:#fff;font-size:10.5px;font-weight:600}.leg{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--t2);margin-top:6px}.leg span::before{content:'';display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--c);margin-right:5px;vertical-align:-1px}
.muted{color:var(--t2)}.tend{width:100%;height:auto}.sit{font-weight:600}.sit.Aprovado{color:#0ca30c}.sit.Reprovado{color:#d03b3b}.sit.Parcial{color:#c88a00}.tw{overflow-x:auto}.bt{float:right;background:var(--ci);color:var(--az);border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;font-family:inherit}
@media(max-width:900px){.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.g3,.g2{grid-template-columns:1fr}.etapas{grid-template-columns:repeat(6,minmax(0,1fr))}}@media(max-width:520px){.etapas{grid-template-columns:repeat(4,minmax(0,1fr))}.top{padding:18px 16px}.top h1{font-size:18px}.wrap{padding:14px 10px 30px}.card{padding:12px}}@media print{.bt{display:none}body{background:#fff}.card{break-inside:avoid}}</style></head><body>
<div class="top"><button class="bt" onclick="print()">Salvar em PDF</button><div class="m">ATLANTYX</div><h1>Painel de Qualidade e Testes — ${esc(P.nome)}</h1><div class="s">${P.cliente ? 'Cliente: ' + esc(P.cliente) + ' · ' : ''}Atualizado em ${new Date(D.gerado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).substring(0, 17)}${D.defeitos.so_confirmados ? ' · defeitos confirmados por especialista da Atlantyx' : ''}</div></div>
<div class="wrap g">
<div class="card"><h2>Etapas e gates da metodologia</h2><div class="etapas">${D.etapas.map(e => `<div class="et ${e.aprovado ? 'ok' : e.n === P.etapa ? 'at' : ''}"><b>${e.gate}</b>${esc(e.nome.split(' ')[0])}${e.aprovado ? '<br>✔' : ''}</div>`).join('')}</div></div>
<div class="g g4">
<div class="card kpi"><div class="v">${c.total}</div><div class="l">casos de teste no plano${D.plano ? ' (v' + D.plano.versao + (D.plano.status === 'aprovado' ? ', aprovado' : ', em revisão') + ')' : ''}</div></div>
<div class="card kpi"><div class="v" style="color:#0ca30c">${pct(c.passou, c.total)}%</div><div class="l">${c.passou} aprovados · ${c.falhou} reprovados · ${c.nao_executado} a executar</div></div>
<div class="card kpi"><div class="v" style="color:${D.defeitos.abertos ? '#d03b3b' : '#0ca30c'}">${D.defeitos.abertos}</div><div class="l">defeitos em aberto (de ${D.defeitos.total} registrados)</div></div>
<div class="card kpi"><div class="v">${D.requisitos.aprovados}/${D.requisitos.total}</div><div class="l">requisitos com todos os casos aprovados</div></div></div>
<div class="g g3">${gate('Gate G6 · Construção', D.g6)}${gate('Gate G7 · Qualidade e testes', D.g7)}${gate('Gate G8 · Segurança e desempenho', D.g8)}</div>
<div class="g g2"><div class="card"><h2>Resultado por camada de teste</h2>${D.casos.por_tipo.map(t => `<div style="margin:7px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${esc(t.nome)}</span><span class="muted">${t.passou}/${t.total}</span></div>${barra(t)}</div>`).join('') || '<p class="muted">Plano de testes ainda não gerado.</p>'}
<div class="leg"><span style="--c:#0ca30c">aprovado</span><span style="--c:#d03b3b">reprovado</span><span style="--c:#fab219">bloqueado</span><span style="--c:#b8c2cc">não executado</span></div>
${D.unitarios ? `<p class="muted" style="margin-top:10px">Testes unitários da fábrica: <b>${D.unitarios.passou}/${D.unitarios.total}</b> aprovados${D.unitarios.cobertura_pct != null ? ' · cobertura ' + Math.round(D.unitarios.cobertura_pct) + '%' : ''}.</p>` : ''}</div>
<div class="card"><h2>Indicadores de precisão (metodologia 9.5)</h2><div class="aneis">${anel(I.criterios_automatizados_pct, 'critérios de aceite<br>automatizados', '#2a78d6')}${anel(I.ia_acerto_pct ?? 0, 'alertas da IA<br>confirmados', '#1baf7a')}${anel(D.ultima_execucao ? Math.round(D.ultima_execucao.cobertura_pct) : 0, 'telas cobertas<br>na última execução', '#eb6834')}</div>
<table style="margin-top:10px"><tr><td>Defeitos antes da homologação × durante/depois</td><td><b>${I.defeitos_antes_homolog} × ${I.defeitos_depois_homolog}</b></td></tr><tr><td>Tempo médio de detecção</td><td><b>${I.mttd_h != null ? I.mttd_h + ' h' : '—'}</b></td></tr><tr><td>Tempo médio de diagnóstico e correção</td><td><b>${I.mttr_h != null ? I.mttr_h + ' h' : '—'}</b></td></tr><tr><td>Defeitos que chegaram à produção</td><td><b>${I.defeitos_producao}</b></td></tr><tr><td>Alertas da IA confirmados × descartados</td><td><b>${I.ia_confirmados} × ${I.ia_descartados}</b></td></tr></table></div></div>
<div class="g g2"><div class="card"><h2>Evolução por execução dos robôs</h2>${linha}</div>
<div class="card"><h2>Robôs de QA — última execução</h2>${D.robos.length ? '<table>' + D.robos.map(r => `<tr><td><b>${esc(r.nome)}</b></td><td>${esc(r.resumo)}</td></tr>`).join('') + '</table>' : '<p class="muted">Sem execução registrada.</p>'}</div></div>
<div class="card"><h2>Defeitos em aberto e aceitos</h2><div class="leg" style="margin:0 0 8px">${['critica', 'alta', 'media', 'baixa'].map(s => `<span style="--c:${sevCor[s]}">${s}: ${Object.entries(D.defeitos.por_sev[s] || {}).filter(([k]) => ['aberto', 'em_correcao', 'corrigido'].includes(k)).reduce((x, [, n]) => x + n, 0)} em aberto</span>`).join('')}</div>
<div class="tw">${D.defeitos.lista.length ? `<table><tr><th>Defeito</th><th>Tipo</th><th>Severidade</th><th>Situação</th><th>Tela</th></tr>${D.defeitos.lista.map(d => `<tr><td>${esc(d.titulo)}</td><td>${esc(d.tipo)}</td><td><span class="sev" style="background:${sevCor[d.severidade] || '#888'}">${esc(d.severidade)}</span></td><td>${esc(stNome[d.status] || d.status)}</td><td>${esc(d.tela || '—')}</td></tr>`).join('')}</table>` : '<p class="muted">Nenhum defeito em aberto.</p>'}</div></div>
<div class="card"><h2>Matriz de rastreabilidade</h2><div class="tw">${D.requisitos.lista.length ? `<table><tr><th>Requisito</th><th>Casos de teste</th><th>Aprovados</th><th>Reprovados</th><th>Situação</th></tr>${D.requisitos.lista.map(r => `<tr><td><b>${esc(r.ref)}</b></td><td>${esc(r.codigos.join(', '))}</td><td>${r.passou}</td><td>${r.falhou}</td><td class="sit ${r.situacao.replace(/\s/g, '')}">${r.situacao}</td></tr>`).join('')}</table>` : '<p class="muted">Sem requisitos ligados a casos ainda.</p>'}</div></div>
<p class="muted" style="text-align:center">Painel gerado pelo Atlantyx OS · QA automatizado com IA e supervisão humana · Metodologia Atlantyx de Gestão e Entrega de Projetos Tecnológicos</p>
</div></body></html>`;
}

async function handler(req, res) {
  // GET público: painel do cliente pelo token (/qa/<token>)
  const url = new URL(req.url || '/', 'http://x');
  const viaRota = (url.pathname.match(/^\/qa\/([a-f0-9]+)/) || [])[1];
  if (req.method === 'GET' && ((url.searchParams.get('action') || req.query?.action) === 'painel_cliente' || viaRota)) {
    const t = String(url.searchParams.get('t') || req.query?.t || viaRota || '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
    if (!/^[a-f0-9]{24,64}$/.test(t)) return res.status(404).send('<h3 style="font-family:sans-serif">Link inválido.</h3>');
    try { const sql = await fabSql(); const p = (await sql`SELECT id FROM fab_projetos WHERE token_publico=${t}`)[0];
      if (!p) return res.status(404).send('<h3 style="font-family:sans-serif">Link expirado ou inválido — peça um novo link à Atlantyx.</h3>');
      return res.status(200).send(painelHtml(await painel({ projeto_id: p.id, publico: true }))); }
    catch (e) { console.error('[fabrica painel]', e.message); return res.status(500).send('<h3 style="font-family:sans-serif">Painel indisponível no momento.</h3>'); }
  }
  const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  try {
    const sql = () => fabSql();
    const acoes = {
      projetos: () => projetos(),
      projeto_salvar: () => projetoSalvar(b),
      projeto_obter: () => projetoObter(b),
      projeto_excluir: async () => { await (await sql())`DELETE FROM fab_projetos WHERE id=${b.id}`; return { ok: true }; },
      gate_aprovar: () => gateAprovar(b),
      doc_importar: () => docImportar(b),
      doc_obter: () => docObter(b),
      doc_salvar: () => docSalvar(b),
      doc_aprovar: () => docAprovar(b),
      doc_gerar: () => docGerar(b),
      doc_word: () => docWord(b),
      pacote_word: () => pacoteWord(b),
      itens: () => itens(b),
      item_salvar: () => itemSalvar(b),
      item_mover: () => itemMover(b),
      item_excluir: async () => { await (await sql())`DELETE FROM fab_itens WHERE id=${b.id}`; return { ok: true }; },
      itens_gerar: () => itensGerar(b),
      casos: () => casos(b),
      caso_salvar: () => casoSalvar(b),
      caso_excluir: async () => { await (await sql())`DELETE FROM fab_casos WHERE id=${b.id}`; return { ok: true }; },
      caso_status: () => casoStatus(b),
      casos_sugerir: () => casosSugerir(b),
      casos_adicionar: async () => { const s = await sql(); return { ids: await _inserirCasos(s, b.projeto_id, Array.isArray(b.casos) ? b.casos : [], 'ia') }; },
      unitarios_importar: () => unitariosImportar(b),
      painel: () => painel({ projeto_id: b.projeto_id }),
      painel_token: async () => { const s = await sql(); const t = crypto.randomBytes(16).toString('hex'); await s`UPDATE fab_projetos SET token_publico=${t}, atualizado_em=NOW() WHERE id=${b.projeto_id}`; return { token: t }; },
      robos_executar: async () => { const s = await sql(); const p = (await s`SELECT qa_produto_id FROM fab_projetos WHERE id=${b.projeto_id}`)[0];
        if (!p?.qa_produto_id) throw new Error('Ligue o projeto a um produto do QA de Produtos (URL e usuário de teste) para os robôs rodarem.');
        const { executarQa } = await import('./qa-externo.js'); return executarQa({ produto_id: p.qa_produto_id, origem: 'esteira' }); },
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) {
    console.error('[fabrica]', b.action, e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
export default comGuarda(handler, 'fabrica');
