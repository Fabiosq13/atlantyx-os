// api/dev-pipeline.js — v1.23
// Kanban de Linha de Produção de Sistemas — da ideia à documentação.
// Cada fase tem um agente de IA especialista que GERA o artefato daquela etapa
// a partir de tudo que foi produzido nas fases anteriores (contexto acumulado).

const FASES = [
  'ideia', 'requisitos_funcionais', 'requisitos_tecnicos', 'arquitetura_infra',
  'desenvolvimento', 'testes_qa', 'homologacao', 'implantacao', 'treinamento_doc', 'concluido',
];
const FASE_INFO = {
  ideia:                 { label: '💡 Ideia',                agente: 'IDEA',   papel: 'Product Discovery' },
  requisitos_funcionais: { label: '📋 Req. Funcionais',      agente: 'SPEC',   papel: 'Análise de Negócio' },
  requisitos_tecnicos:   { label: '⚙ Req. Técnicos',        agente: 'TECH',   papel: 'Engenharia de Requisitos' },
  arquitetura_infra:     { label: '🏗 Arquitetura + Infra',  agente: 'ARCH',   papel: 'Arquitetura de Software' },
  desenvolvimento:       { label: '💻 Desenvolvimento',      agente: 'DEV',    papel: 'Engenharia com IA generativa' },
  testes_qa:             { label: '🧪 Testes + QA',          agente: 'QA',     papel: 'Qualidade e Testes' },
  homologacao:           { label: '✅ Homologação',          agente: 'HOMO',   papel: 'Validação com o cliente' },
  implantacao:           { label: '🚀 Implantação',          agente: 'DEPLOY', papel: 'Deploy e Operação' },
  treinamento_doc:       { label: '📚 Treinamento + Doc',    agente: 'DOC',    papel: 'Documentação e Capacitação' },
  concluido:             { label: '🏁 Concluído',            agente: null,     papel: null },
};

// Prompt de cada agente: o que ele produz naquela etapa
const AGENTE_PROMPT = {
  ideia: `Você é o agente IDEA (Product Discovery). Produza o REFINAMENTO DA IDEIA em markdown:
## Problema (qual dor real resolve)
## Público-alvo e usuários
## Proposta de valor (1 parágrafo)
## Escopo mínimo (MVP) — bullets do que ENTRA
## Fora de escopo — o que NÃO entra nesta versão
## Riscos e premissas
## Critérios de sucesso (métricas)`,
  requisitos_funcionais: `Você é o agente SPEC (Análise de Negócio). Produza os REQUISITOS FUNCIONAIS em markdown:
## Atores do sistema
## Histórias de usuário (formato: Como <ator>, quero <ação>, para <benefício>) — numeradas RF01, RF02...
## Regras de negócio (numeradas RN01...)
## Critérios de aceite por história (Dado/Quando/Então)
## Fluxos de exceção`,
  requisitos_tecnicos: `Você é o agente TECH (Engenharia de Requisitos). Produza os REQUISITOS TÉCNICOS em markdown:
## Requisitos não-funcionais (performance, segurança, disponibilidade, LGPD)
## Integrações necessárias (sistemas, APIs, autenticação)
## Modelo de dados preliminar (entidades e relacionamentos principais)
## Volumetria estimada
## Restrições técnicas`,
  arquitetura_infra: `Você é o agente ARCH (Arquitetura de Software). Produza ARQUITETURA E INFRAESTRUTURA em markdown:
## Visão de arquitetura (camadas e componentes)
## Stack recomendada e justificativa
## Diagrama textual de componentes (ASCII ou lista hierárquica)
## Infraestrutura (hospedagem, banco, filas, storage)
## Segurança (autenticação, autorização, segredos)
## Estimativa de custo mensal de infra`,
  desenvolvimento: `Você é o agente DEV (Engenharia com IA generativa). Produza o PLANO DE DESENVOLVIMENTO em markdown:
## Quebra em tarefas técnicas (numeradas, com estimativa em horas)
## Ordem de execução e dependências
## Prompts sugeridos para IA generativa em cada tarefa (o que pedir à IA para acelerar)
## Padrões de código a seguir
## Definition of Done por tarefa`,
  testes_qa: `Você é o agente QA (Qualidade). Produza o PLANO DE TESTES em markdown:
## Estratégia de testes (unitário, integração, e2e)
## Casos de teste por requisito funcional (CT01... ligando ao RF correspondente)
## Massa de dados necessária
## Critérios de aprovação/reprovação
## Riscos de qualidade`,
  homologacao: `Você é o agente HOMO (Validação). Produza o ROTEIRO DE HOMOLOGAÇÃO em markdown:
## Checklist de homologação por funcionalidade
## Roteiro passo a passo para o usuário validar
## Ambiente e acessos necessários
## Modelo de termo de aceite
## Como registrar e tratar apontamentos`,
  implantacao: `Você é o agente DEPLOY (Deploy e Operação). Produza o PLANO DE IMPLANTAÇÃO em markdown:
## Pré-requisitos de implantação
## Passo a passo do deploy (ordem exata)
## Plano de rollback
## Migração de dados (se houver)
## Monitoramento pós-implantação (o que observar nas primeiras 48h)
## Comunicação aos usuários`,
  treinamento_doc: `Você é o agente DOC (Documentação e Capacitação). Produza em markdown:
## Documentação técnica (visão geral para quem for manter)
## Manual do usuário (passo a passo das principais tarefas)
## Roteiro de treinamento (agenda, duração, público)
## FAQ antecipado
## Glossário`,
};

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await ensureTabelas(_sql);
  return _sql;
}
async function ensureTabelas(sql) {
  await sql`CREATE TABLE IF NOT EXISTS dev_projetos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    solicitante TEXT,
    prioridade TEXT DEFAULT 'media',
    fase TEXT DEFAULT 'ideia',
    responsavel TEXT,
    prazo_alvo DATE,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS dev_artefatos (
    id TEXT PRIMARY KEY,
    projeto_id TEXT REFERENCES dev_projetos(id) ON DELETE CASCADE,
    fase TEXT NOT NULL,
    conteudo TEXT,
    gerado_por TEXT,
    versao INT DEFAULT 1,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(projeto_id, fase, versao)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_artef_proj ON dev_artefatos(projeto_id, fase)`;
}
function novoId(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ═══════════════════════════════════════════════════════════════════════════
async function projetoSave(p = {}) {
  if (!p.nome) throw new Error('nome obrigatório');
  const sql = await getSql();
  const id = p.id || novoId('devp');
  await sql`INSERT INTO dev_projetos (id, nome, descricao, solicitante, prioridade, fase, responsavel, prazo_alvo, atualizado_em)
    VALUES (${id}, ${p.nome}, ${p.descricao || null}, ${p.solicitante || null}, ${p.prioridade || 'media'},
            ${p.fase || 'ideia'}, ${p.responsavel || null}, ${p.prazo_alvo || null}, NOW())
    ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome, descricao=EXCLUDED.descricao,
      solicitante=EXCLUDED.solicitante, prioridade=EXCLUDED.prioridade, responsavel=EXCLUDED.responsavel,
      prazo_alvo=EXCLUDED.prazo_alvo, atualizado_em=NOW()`;
  return { id };
}
async function projetoList() {
  const sql = await getSql();
  const rows = await sql`SELECT p.*, (SELECT COUNT(DISTINCT fase)::int FROM dev_artefatos a WHERE a.projeto_id = p.id) AS artefatos_prontos
    FROM dev_projetos p ORDER BY p.atualizado_em DESC`;
  const colunas = {};
  FASES.forEach(f => colunas[f] = []);
  rows.forEach(r => { (colunas[r.fase] = colunas[r.fase] || []).push({ ...r, prazo_alvo: r.prazo_alvo ? String(r.prazo_alvo).split('T')[0] : null }); });
  return { colunas, fases: FASES, fase_info: FASE_INFO, total: rows.length,
    resumo: { total: rows.length, concluidos: (colunas.concluido || []).length, em_andamento: rows.length - (colunas.concluido || []).length } };
}
async function projetoGet({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  const p = await sql`SELECT * FROM dev_projetos WHERE id = ${id} LIMIT 1`;
  if (!p.length) throw new Error('Projeto não encontrado');
  const artefatos = await sql`SELECT * FROM dev_artefatos WHERE projeto_id = ${id} ORDER BY criado_em DESC`;
  // Só a versão mais recente de cada fase
  const maisRecente = {};
  artefatos.forEach(a => { if (!maisRecente[a.fase]) maisRecente[a.fase] = a; });
  return { projeto: { ...p[0], prazo_alvo: p[0].prazo_alvo ? String(p[0].prazo_alvo).split('T')[0] : null }, artefatos: maisRecente, historico: artefatos };
}
async function projetoMover({ id, fase } = {}) {
  if (!id || !FASES.includes(fase)) throw new Error('id e fase válida obrigatórios (' + FASES.join(', ') + ')');
  const sql = await getSql();
  await sql`UPDATE dev_projetos SET fase = ${fase}, atualizado_em = NOW() WHERE id = ${id}`;
  return { id, fase };
}
async function projetoDelete({ id } = {}) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM dev_projetos WHERE id = ${id}`;
  return { id, excluido: true };
}
async function artefatoSalvarManual({ projeto_id, fase, conteudo } = {}) {
  if (!projeto_id || !fase) throw new Error('projeto_id e fase obrigatórios');
  const sql = await getSql();
  const v = await sql`SELECT COALESCE(MAX(versao),0)+1 AS prox FROM dev_artefatos WHERE projeto_id = ${projeto_id} AND fase = ${fase}`;
  await sql`INSERT INTO dev_artefatos (id, projeto_id, fase, conteudo, gerado_por, versao)
    VALUES (${novoId('artf')}, ${projeto_id}, ${fase}, ${conteudo || ''}, 'manual', ${v[0].prox})`;
  return { salvo: true, versao: v[0].prox };
}

// ═══════════════════════════════════════════════════════════════════════════
// Agente da fase: gera o artefato usando TUDO que já foi produzido antes
// ═══════════════════════════════════════════════════════════════════════════
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function claudeDev(system, user, maxTokens = 2200) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 55000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return d.content?.[0]?.text || '';
}

async function gerarArtefato({ projeto_id, fase, direcao } = {}) {
  if (!projeto_id || !fase) throw new Error('projeto_id e fase obrigatórios');
  if (!AGENTE_PROMPT[fase]) throw new Error('Fase "' + fase + '" não tem agente (é uma fase de controle)');
  const { projeto, artefatos } = await projetoGet({ id: projeto_id });

  // Contexto acumulado: todos os artefatos das fases ANTERIORES (a linha de produção de verdade)
  const idxFase = FASES.indexOf(fase);
  const anteriores = FASES.slice(0, idxFase).filter(f => artefatos[f]).map(f =>
    `### ${FASE_INFO[f].label}\n${(artefatos[f].conteudo || '').substring(0, 2500)}`).join('\n\n');

  const info = FASE_INFO[fase];
  const system = `${AGENTE_PROMPT[fase]}

Você faz parte da linha de produção de software da Atlantyx. Escreva em português do Brasil, em markdown, de forma objetiva e acionável (nada de encher linguiça).
Baseie-se APENAS no que foi definido nas fases anteriores — se faltar uma informação essencial, liste-a explicitamente numa seção "## ⚠ Pendências para decidir" em vez de inventar.`;

  const user = `PROJETO: ${projeto.nome}
${projeto.descricao ? 'DESCRIÇÃO: ' + projeto.descricao : ''}
${projeto.solicitante ? 'SOLICITANTE: ' + projeto.solicitante : ''}
${direcao ? '\nDIREÇÃO ADICIONAL DO TIME: ' + direcao : ''}

${anteriores ? 'TRABALHO JÁ PRODUZIDO NAS FASES ANTERIORES:\n\n' + anteriores : '(Esta é a primeira fase — parta da descrição do projeto.)'}

Agora produza o artefato da sua fase (${info.label} — ${info.papel}).`;

  const conteudo = await claudeDev(system, user, 2400);
  const sql = await getSql();
  const v = await sql`SELECT COALESCE(MAX(versao),0)+1 AS prox FROM dev_artefatos WHERE projeto_id = ${projeto_id} AND fase = ${fase}`;
  await sql`INSERT INTO dev_artefatos (id, projeto_id, fase, conteudo, gerado_por, versao)
    VALUES (${novoId('artf')}, ${projeto_id}, ${fase}, ${conteudo}, ${info.agente}, ${v[0].prox})`;
  console.log(`[DevPipeline] Artefato gerado: ${projeto.nome} · ${fase} · agente ${info.agente} · v${v[0].prox}`);
  return { conteudo, agente: info.agente, versao: v[0].prox, baseado_em: FASES.slice(0, idxFase).filter(f => artefatos[f]) };
}

// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (e) { return res.status(400).json({ success: false, error: 'JSON inválido' }); }
  const { action, payload = {} } = body;

  const acoes = {
    projeto_save:     () => projetoSave(payload),
    projeto_list:     () => projetoList(),
    projeto_get:      () => projetoGet(payload),
    projeto_mover:    () => projetoMover(payload),
    projeto_delete:   () => projetoDelete(payload),
    gerar_artefato:   () => gerarArtefato(payload),
    artefato_salvar:  () => artefatoSalvarManual(payload),
    status:           () => ({ ok: true, modulo: 'dev-pipeline', fases: FASES }),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try {
    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });
  } catch (error) {
    console.error('[ERRO dev-pipeline]', action, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
