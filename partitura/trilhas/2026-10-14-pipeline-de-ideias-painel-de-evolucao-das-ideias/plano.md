# Plano — Pipeline de Ideias: painel de evolução (Viabilidade)
ID: 2026-10-14-pipeline-de-ideias-painel-de-evolucao-das-ideias · Trilha: T3 · Aprovado por: fundador (Esteira de Demandas)

## Fase 1 — Checklist e progresso (s1pipeline)
- [x] 1.1 Painel "Próximos Passos — ideias em Viabilidade" abaixo do kanban, com seção colapsável por ideia e 5 checkboxes fixos (public/index.html, seção s1pipeline)
- [x] 1.2 Persistência em localStorage com chave `ideia_checklist_{id}` (fallback: título normalizado quando a ideia não tem id)
- [x] 1.3 Barra de progresso (`marcados / 5 * 100`) no card da ideia no kanban e no painel; clique na barra abre a seção da ideia

## Fase 2 — Próximos passos com IA
- [x] 2.1 Botão "Analisar com IA" → `nav('s1analise')` e preenche `#anTitulo`/`#anDesc` (o campo real do S1-03 é `anTitulo`; `#input-ideia` citado na orientação não existe)
- [x] 2.2 Botão "Criar Business Plan" → `nav('s1bp')` + aba "Por ideia"; abre o BP se a ideia já tiver um, senão pré-seleciona a ideia em `#bpIdeiaSel` (via `window._bpIdeiaPendente` lido em `bpInit`)
- [ ] Validação da fase (`node scripts/validar.mjs --sem-navegador` + `node scripts/bpm-gates.mjs --local`) — sem permissão para rodar no ambiente do robô; fica com o CI "Gates B.P.M." do PR

## Interseções
- Depende de: nenhuma
- Bloqueia: nenhuma
- Pedido ao Afinador (banco/contrato): nenhum — sem mudança de banco

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-14 | Fases 1 e 2 implementadas | Scripts de validação não puderam rodar no robô (permissão) | CI "Gates B.P.M." no PR + teste do fundador no preview |
