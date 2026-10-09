// lib/fabrica-db.js — v3.134 · ESTEIRA DE ENTREGA (Fábrica) — tabelas e constantes compartilhadas
// Usado por api/fabrica.js (documentos, Kanban da fábrica, plano de testes, painel do cliente) e por
// api/qa-externo.js (os robôs executam os casos do plano de testes e devolvem o resultado de cada um).
// Baseado na Metodologia Atlantyx de Gestão e Entrega de Projetos Tecnológicos (v4): 12 etapas, gates G1–G12.
import crypto from 'node:crypto';

let _sql = null, _pronto = false;
export async function fabSql() {
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  if (_pronto) return _sql;
  const sql = _sql;
  await sql`CREATE TABLE IF NOT EXISTS fab_projetos (
    id TEXT PRIMARY KEY, nome TEXT NOT NULL, cliente TEXT, descricao TEXT, gp TEXT, fabrica TEXT, qa_produto_id TEXT,
    etapa INT DEFAULT 1, gates JSONB DEFAULT '{}'::jsonb, token_publico TEXT, painel_so_confirmados BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS fab_documentos (
    id TEXT PRIMARY KEY, projeto_id TEXT REFERENCES fab_projetos(id) ON DELETE CASCADE, tipo TEXT NOT NULL, titulo TEXT,
    conteudo_md TEXT, origem TEXT, arquivo_nome TEXT, versao INT DEFAULT 1, status TEXT DEFAULT 'rascunho',
    aprovado_em TIMESTAMPTZ, aprovado_por TEXT, historico JSONB DEFAULT '[]'::jsonb,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_fab_doc_tipo ON fab_documentos(projeto_id, tipo)`;
  await sql`CREATE TABLE IF NOT EXISTS fab_itens (
    id TEXT PRIMARY KEY, projeto_id TEXT REFERENCES fab_projetos(id) ON DELETE CASCADE, codigo TEXT, titulo TEXT, descricao TEXT,
    criterios TEXT, tipo TEXT, prioridade TEXT DEFAULT 'media', estimativa_h NUMERIC, requisito_ref TEXT, responsavel TEXT,
    coluna TEXT DEFAULT 'backlog', ordem INT DEFAULT 0, nota TEXT, em_qa_em TIMESTAMPTZ, origem TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS fab_casos (
    id TEXT PRIMARY KEY, projeto_id TEXT REFERENCES fab_projetos(id) ON DELETE CASCADE, codigo TEXT, titulo TEXT, tipo TEXT,
    requisito_ref TEXT, item_codigo TEXT, prioridade TEXT DEFAULT 'media', risco TEXT, pre_condicao TEXT, passos JSONB DEFAULT '[]'::jsonb,
    dados TEXT, esperado TEXT, automatizavel BOOLEAN DEFAULT true, status TEXT DEFAULT 'nao_executado', evidencia TEXT, origem TEXT,
    execucoes INT DEFAULT 0, primeira_falha_em TIMESTAMPTZ, ultima_execucao_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_fab_casos_proj ON fab_casos(projeto_id)`;
  await sql`CREATE TABLE IF NOT EXISTS fab_casos_hist (
    id TEXT PRIMARY KEY, caso_id TEXT, projeto_id TEXT, execucao_id TEXT, status TEXT, evidencia TEXT, em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS fab_unitarios (
    id TEXT PRIMARY KEY, projeto_id TEXT REFERENCES fab_projetos(id) ON DELETE CASCADE, arquivo TEXT, total INT, passou INT, falhou INT,
    ignorados INT, cobertura_pct NUMERIC, detalhes JSONB, em TIMESTAMPTZ DEFAULT NOW())`;
  _pronto = true;
  return sql;
}
export const novoIdFab = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');

// 12 etapas da metodologia (2.3) — documento de saída, gate e quem aprova
export const ETAPAS = [
  { n: 1, nome: 'Entendimento do negócio', gate: 'G1', doc: 'Documento de Visão', aprova: 'Patrocinador do cliente', criterios: ['Problema e objetivos de negócio validados pelo patrocinador', 'Indicadores de sucesso definidos e mensuráveis', 'Escopo macro acordado (dentro e fora)', 'Restrições regulatórias, de segurança e de prazo registradas', 'Lista de necessidades priorizada'] },
  { n: 2, nome: 'Planejamento', gate: 'G2', doc: 'Plano Detalhado de Projeto e Cronograma', aprova: 'Cliente (patrocinador e ponto focal)', criterios: ['Escopo, fases e entregas aprovados', 'Cronograma com marcos e datas dos gates aprovado', 'Orçamento e plano da fábrica integrados ao cronograma', 'Volumetria e custos de infraestrutura aprovados', 'Riscos com responsáveis e planos de resposta', 'Ritos, indicadores e processo de mudanças acordados'] },
  { n: 3, nome: 'Especificação detalhada', gate: 'G3', doc: 'ERF e ERT', aprova: 'Áreas de negócio, parceiro de processos e TI do cliente', criterios: ['Necessidades priorizadas cobertas por requisitos', 'Requisitos funcionais com critérios de aceite objetivos', 'Regras de negócio numeradas, sem conflitos', 'Integrações e dados especificados e validados com a TI', 'Matriz de rastreabilidade completa', 'ERF e ERT versionadas e aprovadas'] },
  { n: 4, nome: 'Arquitetura, infraestrutura e segurança', gate: 'G4', doc: 'Documento de Arquitetura e Plano de Segurança e LGPD', aprova: 'TI e Segurança da Informação do cliente', criterios: ['Arquitetura aderente às políticas do cliente', 'Ambientes, capacidade e continuidade definidos', 'Ameaças identificadas com controles', 'Inventário de dados pessoais e tratamento LGPD aprovados', 'Escopo e janelas dos testes de segurança acordados'] },
  { n: 5, nome: 'Protótipo', gate: 'G5', doc: 'Protótipo aprovado e Relatório de Validação', aprova: 'Usuários-chave e patrocinador', criterios: ['Jornadas principais validadas pelos usuários-chave', 'Ajustes incorporados ao protótipo e à ERF', 'Escopo da versão congelado para a construção'] },
  { n: 6, nome: 'Construção', gate: 'G6', doc: 'Versão candidata e documentação técnica', aprova: 'Atlantyx (controle técnico)', criterios: ['Funcionalidades e integrações da versão concluídas', 'Testes unitários executados e aprovados, com cobertura mínima', 'Revisão técnica concluída e registrada', 'Sem vulnerabilidades críticas ou altas abertas'] },
  { n: 7, nome: 'Qualidade e testes', gate: 'G7', doc: 'Plano de Testes e Relatório de Qualidade', aprova: 'Ponto focal e TI do cliente', criterios: ['Todos os critérios de aceite da versão aprovados', 'Nenhum defeito crítico ou alto em aberto', 'Defeitos médios e baixos aceitos formalmente, com plano de correção', 'Plano de testes executado, com evidências registradas'] },
  { n: 8, nome: 'Segurança e desempenho', gate: 'G8', doc: 'Relatório de Segurança e de Desempenho', aprova: 'Segurança da Informação do cliente', criterios: ['Nenhuma vulnerabilidade crítica ou alta em aberto', 'Vulnerabilidades médias corrigidas ou com risco aceito', 'Metas de desempenho e volumetria atingidas', 'Recuperação de falhas e backup comprovados', 'Guardrails de IA aprovados, quando aplicável'] },
  { n: 9, nome: 'Homologação', gate: 'G9', doc: 'Termo de Homologação', aprova: 'Áreas de negócio do cliente', criterios: ['Roteiros de homologação executados pelos usuários', 'Critérios de aceite da ERF aceitos', 'Nenhum defeito crítico ou alto em aberto', 'Médios e baixos aceitos formalmente', 'Termo de homologação assinado'] },
  { n: 10, nome: 'Treinamento', gate: 'G10', doc: 'Plano e materiais de treinamento', aprova: 'Áreas de negócio e TI do cliente', criterios: ['Usuários, multiplicadores e operação treinados', 'Avaliação aplicada dentro da meta', 'Materiais e gravações publicados'] },
  { n: 11, nome: 'Implantação e operação assistida', gate: 'G11', doc: 'Solução em produção e relatório de operação assistida', aprova: 'TI do cliente', criterios: ['Solução estável em produção na operação assistida', 'Dados migrados e reconciliados', 'Documentação final entregue'] },
  { n: 12, nome: 'Passagem de conhecimento', gate: 'G12', doc: 'Termo de passagem de conhecimento e aceite final', aprova: 'Cliente (aceite final)', criterios: ['Sessões do plano realizadas e gravadas', 'Base de conhecimento entregue', 'Equipes aptas a operar e manter', 'Sustentação iniciada', 'Termos de passagem e de aceite final assinados'] },
];

// documentos da esteira
export const DOCS = {
  erf: { nome: 'Especificação Funcional (ERF) — conceitual', etapa: 3, sigla: 'ERF' },
  modelo_ert: { nome: 'Modelo de ERT do cliente (padrão a seguir)', etapa: 3, sigla: 'MOD' },
  ert: { nome: 'Especificação Técnica (ERT)', etapa: 3, sigla: 'ERT' },
  plano_projeto: { nome: 'Plano Detalhado de Projeto e Cronograma', etapa: 2, sigla: 'PDP' },
  plano_testes: { nome: 'Plano de Testes Detalhado', etapa: 7, sigla: 'PT' },
  relatorio_qualidade: { nome: 'Relatório de Qualidade', etapa: 7, sigla: 'RQ' },
};

// Kanban da fábrica (construção pela fábrica do cliente, com QA automatizado da Atlantyx)
export const COLUNAS_FAB = [['backlog', 'Backlog'], ['especificado', 'Especificado'], ['desenvolvimento', 'Em desenvolvimento'], ['revisao', 'Revisão técnica'],
  ['qa', 'Em QA (robôs)'], ['aprovado_qa', 'Aprovado no QA'], ['homologacao', 'Homologação'], ['entregue', 'Entregue']];

// tipos de caso de teste → robô que executa
export const TIPOS_CASO = {
  mundo_ideal: { nome: 'Mundo ideal (caminho feliz)', robo: 'plano', ordem: 1 },
  funcional: { nome: 'Funcional ponta a ponta', robo: 'plano', ordem: 2 },
  limite: { nome: 'Exceção e limite', robo: 'plano', ordem: 3 },
  regressao: { nome: 'Regressão', robo: 'plano', ordem: 4 },
  integracao: { nome: 'Integração e APIs', robo: 'integracao', ordem: 5 },
  dados: { nome: 'Dados (reconciliação e qualidade)', robo: 'plano', ordem: 6 },
  unitario: { nome: 'Unitário (fábrica)', robo: 'unitario', ordem: 7 },
  seguranca: { nome: 'Segurança', robo: 'seguranca', ordem: 8 },
  governanca: { nome: 'Governança e LGPD', robo: 'governanca', ordem: 9 },
  layout: { nome: 'Layout de saída', robo: 'layout', ordem: 10 },
  macaco: { nome: 'Teste do macaco (uso caótico)', robo: 'macaco', ordem: 11 },
  desempenho: { nome: 'Desempenho', robo: 'plano', ordem: 12 },
  ia: { nome: 'Avaliação de IA', robo: 'plano', ordem: 13 },
};
export const ROBOS = {
  plano: 'Robô do Plano de Testes (executa os casos passo a passo com IA)',
  mundo_ideal: 'Robô Mundo Ideal (caminhos felizes primeiro)',
  exploratorio: 'Robô Exploratório (descobre telas, critica a lógica com IA, ciclo incluir/alterar/excluir)',
  integracao: 'Robô de Integração (APIs: contrato, status, dados sem login)',
  unitario: 'Testes Unitários (resultado JUnit da fábrica)',
  seguranca: 'Robô de Segurança (configuração: HTTPS, cabeçalhos, cookies, telas sem login)',
  governanca: 'Robô de Governança (LGPD: dados pessoais expostos, política de privacidade, cookies de rastreio)',
  layout: 'Robô de Layout de Saída (IA com visão analisa cada tela no computador e no celular)',
  macaco: 'Robô Macaco (cliques e digitação aleatórios procurando quebras)',
  desempenho: 'Robô de Desempenho (tempo de tela e de API)',
};

// resultado dos casos vindo do robô → atualiza casos, histórico e move itens da fábrica
export async function aplicarResultadosCasos(sql, execucaoId, resultados = []) {
  let n = 0; const projetos = new Set();
  for (const r of resultados.slice(0, 300)) {
    if (!r?.id || !['passou', 'falhou', 'bloqueado'].includes(r.status)) continue;
    const c = (await sql`SELECT id, projeto_id, status, primeira_falha_em FROM fab_casos WHERE id=${r.id}`)[0]; if (!c) continue;
    const ev = String(r.evidencia || '').substring(0, 4000);
    await sql`UPDATE fab_casos SET status=${r.status}, evidencia=${ev}, execucoes=execucoes+1, ultima_execucao_em=NOW(),
      primeira_falha_em=CASE WHEN ${r.status}='falhou' AND primeira_falha_em IS NULL THEN NOW() ELSE primeira_falha_em END, atualizado_em=NOW() WHERE id=${c.id}`;
    await sql`INSERT INTO fab_casos_hist (id, caso_id, projeto_id, execucao_id, status, evidencia) VALUES (${novoIdFab('fch')}, ${c.id}, ${c.projeto_id}, ${execucaoId || null}, ${r.status}, ${ev.substring(0, 1500)})`;
    projetos.add(c.projeto_id); n++;
  }
  const movidos = [];
  for (const pid of projetos) movidos.push(...await moverItensPorCasos(sql, pid));
  return { casos_atualizados: n, itens_movidos: movidos };
}
// item em QA com todos os casos ligados aprovados → "Aprovado no QA"; algum caso falhou → volta para desenvolvimento
export async function moverItensPorCasos(sql, pid) {
  const itens = await sql`SELECT id, codigo, coluna FROM fab_itens WHERE projeto_id=${pid} AND coluna IN ('qa','aprovado_qa')`;
  const casos = await sql`SELECT item_codigo, status FROM fab_casos WHERE projeto_id=${pid} AND item_codigo IS NOT NULL`;
  const mov = [];
  for (const it of itens) {
    const L = casos.filter(c => c.item_codigo === it.codigo); if (!L.length) continue;
    if (L.some(c => c.status === 'falhou')) { if (it.coluna !== 'desenvolvimento') { await sql`UPDATE fab_itens SET coluna='desenvolvimento', nota=${'Voltou do QA: caso(s) reprovado(s) em ' + new Date().toLocaleDateString('pt-BR')}, atualizado_em=NOW() WHERE id=${it.id}`; mov.push({ codigo: it.codigo, para: 'desenvolvimento' }); } }
    else if (it.coluna === 'qa' && L.every(c => c.status === 'passou')) { await sql`UPDATE fab_itens SET coluna='aprovado_qa', nota=${'Aprovado pelos robôs em ' + new Date().toLocaleDateString('pt-BR')}, atualizado_em=NOW() WHERE id=${it.id}`; mov.push({ codigo: it.codigo, para: 'aprovado_qa' }); }
  }
  return mov;
}
