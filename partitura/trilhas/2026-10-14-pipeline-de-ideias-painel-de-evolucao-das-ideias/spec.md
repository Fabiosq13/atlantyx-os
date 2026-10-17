# Trilha: Pipeline de Ideias — painel de evolução das ideias TOVIX e IA POP com próximos passos IA
ID: 2026-10-14-pipeline-de-ideias-painel-de-evolucao-das-ideias · Trilha permanente: T3 · Dono: Analista de Trilha T3 · Status: aprovada
Demanda: dem_mv8f32aaken9 · Tarefa: #86 · Aprovada por: fundador em 2026-10-14

## Partitura
**Área:** ideias · **Impacto:** 3/5 · **Esforço:** M · **Risco:** baixo
**Telas afetadas:** s1pipeline, s1analise, s1bp

## Problema
O fundador tem ideias em estágio 'Viabilidade' no pipeline (TOVIX NORBEN ×2, IA POP, Gabinete de Simulação) e uma implementada (Gabinete). A tela s1pipeline não mostra progresso visual dentro do estágio nem sugere próximos passos concretos para avançar cada ideia. O fundador precisa lembrar manualmente onde parou em cada análise.

## Resultado esperado
Na tela s1pipeline, um painel 'Próximos Passos' por ideia em Viabilidade: checklist de 5 etapas fixas (Análise de Mercado, Benchmark Competitivo, Business Plan, Validação com Cliente, Decisão Go/No-Go) persistido em localStorage (`ideia_checklist_{id}`), barra de progresso (`marcados / 5 * 100`) no card da ideia, botão 'Analisar com IA' (abre s1analise com o nome da ideia) e botão 'Criar Business Plan' (abre s1bp com o contexto da ideia). Sem mudança de banco.

## Critérios de aceite
- [ ] Cada ideia em status 'Viabilidade' exibe checklist de 5 etapas com checkboxes
- [ ] Marcar um checkbox persiste após recarregar a página (localStorage)
- [ ] A barra de progresso reflete corretamente o percentual de itens marcados
- [ ] O botão 'Analisar com IA' abre s1analise com o nome da ideia pré-preenchido
- [ ] O botão 'Criar Business Plan' abre s1bp com o contexto da ideia
- [ ] As ideias TOVIX NORBEN e IA POP aparecem com seus checklists independentes

## Métrica de sucesso
Fundador avança pelo menos uma ideia do estágio Viabilidade para a próxima fase nos próximos 30 dias usando o checklist como guia.

## Escopo de arquivos (propriedade)
Pode alterar: `public/index.html` (apenas seções s1pipeline e s1bp)
Seção do public/index.html: Pipeline de Ideias (S1-01) e Business Plan (`bpInit`)
Só lê: partitura/contratos/**
Interseções previstas: nenhuma (sem banco, sem API nova)

## Fora do escopo
- Persistência do checklist no banco (fica só em localStorage, por navegador)
- Mudar etapas do kanban ou o fluxo de análise/BP existente
