# Plano — Projetado + Contratos — corrigir spinner infinito com timeout e skeleton
ID: 2026-10-11-projetado-contratos-corrigir-spinner-infinito-co · Trilha: T6 · Aprovado por: fundador (demanda dem_mv2cg88yists)

## Fase 1 — Skeleton imediato
- [x] 1.1 Trocar "Carregando a projeção…" estático por skeleton de tabela com as 9 colunas e "--" (arquivos: `public/index.html`, `#page-s3projetado`)
- [x] 1.2 `_projSkeleton()`: repinta KPIs + 12 meses com "--" a cada carga, antes de qualquer chamada à API

## Fase 2 — Timeout, erro e retry
- [x] 2.1 `finApi('fluxo_futuro', …, { timeoutMs: 12000 })` (AbortController já existente em `finApi`) + guarda `Promise.race` de 12,5s
- [x] 2.2 `catch` → `_projErro()` com mensagem + botão "Tentar de novo" (chama `gerarProjetado()`)
- [x] 2.3 `finally` → libera o botão Atualizar e, se o skeleton ainda estiver na tela, troca por erro
- [x] 2.4 Contador de carga (`_projSeq`) para que uma resposta antiga não sobrescreva a nova (troca de conta / Atualizar)
- [x] Validação da fase (`node scripts/validar.mjs --sem-navegador` + `node scripts/bpm-gates.mjs --local`)

## Interseções
- Depende de: nenhuma (usa `finApi` como está)
- Bloqueia: nenhuma
- Pedido ao Afinador (banco/contrato): nenhum
- Sugestão para T4 (opcional): classe global de skeleton com animação pulse para reuso entre telas

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-11 | Fases 1 e 2 concluídas | — | Mixagem do fundador; acompanhar 3 ciclos de QA em s3projetado |
