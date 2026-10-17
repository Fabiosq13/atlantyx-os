# Trilha: Projetado + Contratos — corrigir spinner infinito com timeout e skeleton
ID: 2026-10-11-projetado-contratos-corrigir-spinner-infinito-co · Trilha permanente: T6 · Dono: T6 Financeiro (Teclado) · Status: aprovada
Demanda: dem_mv2cg88yists · Tarefa: #76 · Aprovada por: fundador (Esteira de Demandas) em 2026-10-11

## Problema
QA de 09/10 registrou "Indicador de carregamento continua na tela após a espera" e "Tela ainda carregando após 10s" em s3projetado. O spinner infinito bloqueia o fundador de ver qualquer coisa enquanto os dados chegam — problema de UX independente do conteúdo.

## Resultado esperado
Ao abrir Projetado + Contratos, a estrutura da tabela aparece na hora (colunas com "--"); em até 12s ela é preenchida com os dados ou substituída por uma mensagem de erro com botão "Tentar de novo".

## Critérios de aceite
- [x] Spinner nunca permanece após 12s — sempre substituído por dados ou erro
- [x] Estrutura da tela com colunas visíveis em menos de 300ms
- [x] Botão retry funcional ao falhar
- [ ] QA não registra mais spinner infinito em s3projetado (verificar nos próximos 3 ciclos de QA)

## Métrica de sucesso
Zero registros de spinner infinito em s3projetado nos próximos 3 ciclos de QA.

## Escopo de arquivos (propriedade)
Pode alterar: `public/index.html` (só a seção da tela)
Seção do public/index.html: s3projetado (`#page-s3projetado` e funções `gerarProjetado`/`_projSkeleton`/`_projErro`)
Só lê: partitura/contratos/**, `finApi` (já suporta `opts.timeoutMs`)
Interseções previstas: nenhuma

## Fora do escopo
- Popular/alterar as colunas de dados (demanda separada em execução).
- Alterar `api/financeiro.js` (`fluxo_futuro`) ou CSS global (animação de skeleton fica sem keyframes globais — T4).
