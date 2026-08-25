# Atlantyx OS · v1.23 — Linha de Produção de Sistemas (S6 · Dev + QA)

## Kanban de 10 colunas — da ideia à documentação
💡 Ideia → 📋 Req. Funcionais → ⚙ Req. Técnicos → 🏗 Arquitetura + Infra →
💻 Desenvolvimento → 🧪 Testes + QA → ✅ Homologação → 🚀 Implantação →
📚 Treinamento + Doc → 🏁 Concluído

## O que faz dela uma LINHA DE PRODUÇÃO (e não só um quadro)
Cada fase tem um **agente de IA especialista que PRODUZ o artefato
daquela etapa** — e o ponto central: **cada agente recebe tudo que as
fases anteriores produziram**. Os requisitos funcionais são escritos com
base na ideia refinada; a arquitetura com base nos requisitos; o plano de
testes com base nos requisitos funcionais (ligando CT01 ao RF01); e assim
por diante. É uma esteira de verdade, com contexto acumulado.

Agentes por fase:
- **IDEA** (Discovery) — problema, público, MVP, fora de escopo, riscos,
  critérios de sucesso
- **SPEC** (Análise de Negócio) — histórias de usuário numeradas (RF01...),
  regras de negócio, critérios de aceite Dado/Quando/Então
- **TECH** (Eng. de Requisitos) — não-funcionais, integrações, modelo de
  dados, volumetria, LGPD
- **ARCH** (Arquitetura) — camadas, stack justificada, diagrama de
  componentes, infra, segurança, custo mensal estimado
- **DEV** (Eng. com IA generativa) — quebra em tarefas com estimativa,
  ordem/dependências e **prompts sugeridos para a IA em cada tarefa**
- **QA** (Qualidade) — estratégia, casos de teste ligados aos RFs, massa
  de dados, critérios de aprovação
- **HOMO** (Validação) — checklist, roteiro para o usuário validar, termo
  de aceite, tratamento de apontamentos
- **DEPLOY** (Operação) — passo a passo do deploy, **plano de rollback**,
  migração, monitoramento das primeiras 48h
- **DOC** (Documentação) — doc técnica, manual do usuário, roteiro de
  treinamento, FAQ, glossário

## Regra anti-invenção
Todos os agentes são instruídos a se basear APENAS no que foi definido
antes — se faltar informação essencial, listam numa seção "⚠ Pendências
para decidir" em vez de inventar requisito.

## Uso
+ Nova Ideia (nome, solicitante, prioridade, descrição) → abre o card →
"🤖 Gerar com IDEA" → lê o artefato → avança de fase → "🤖 Gerar com
SPEC" (que já usa a ideia refinada) → e assim por diante. Cada artefato
pode ser refeito (↻) com uma direção adicional, e fica versionado
(histórico preservado). Botão 📋 Copiar para levar para fora.

## Validação (JSDOM)
Kanban com as 10 colunas e agentes visíveis; card com progresso "n/9
artefatos"; detalhe listando as 9 fases com agente; geração da fase 2
confirmando que recebeu o artefato da fase 1 (contexto acumulado
funcionando); artefatos gerados aparecem com versão e botão refazer.
Árvore DOM: 79 páginas, 0 aninhadas. 0 erros JS.

## Arquivos
- NOVO api/dev-pipeline.js
- vercel.json (maxDuration)
- public/index.html (menu S6, kanban, painel de artefatos)
