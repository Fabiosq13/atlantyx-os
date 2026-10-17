# Plano — Gestão de Riscos: erro HTTP 0 e botão Atualizar com retry
ID: 2026-10-11-gestao-de-riscos-corrigir-erro-http-0-e-botao-at · Trilha: T6 · Aprovado por: Fabio (fundador) na Esteira

## Fase 1 — Carga resiliente do semáforo (public/index.html, seção s1riscos)
- [x] 1.1 Retry por leitura (`_rskComRetry`): até 3 tentativas, backoff 2s, só para HTTP 0 / timeout, dentro de um prazo total de 15s (cada tentativa usa `timeoutMs` = mínimo entre 8s e o tempo que sobra)
- [x] 1.2 HTTP 0 / timeout viram "Sem conexão — tente novamente" (`_rskErroLegivel`)
- [x] 1.3 Skeleton (`.skel.skeleton-row`) na primeira carga, no lugar do "Carregando…"
- [x] 1.4 Botão "↻ Atualizar" com estado "⏳ Atualizando…" desabilitado, restaurado no `finally`
- [x] 1.5 Cache `cache_riscos` (localStorage) da última leitura boa; falha total → mostra o cache com tag "[dados offline]" e banner amarelo com "↻ Tentar novamente"; sem cache → banner vermelho "Sem conexão — tente novamente"
- [x] Validação da fase (`node scripts/validar.mjs --sem-navegador` + `node scripts/bpm-gates.mjs --local`)

## Fase 2 — Verificação pós-merge
- [ ] 2.1 Acompanhar 2 execuções do QA em s1riscos sem achado [alta]

## Interseções
- Depende de: `finApi()` (helper do Financeiro, só leitura — não alterado)
- Bloqueia: nenhuma
- Pedido ao Afinador (banco/contrato): nenhum

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-11 | Fase 1 concluída (retry, skeleton, cache offline, mensagem legível) | — | Merge pelo fundador e acompanhar QA (Fase 2) |
