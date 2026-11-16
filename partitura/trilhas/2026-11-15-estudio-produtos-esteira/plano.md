# Plano — Estúdio de Produtos e Esteira
ID: 2026-11-15-estudio-produtos-esteira · Trilha: T4/T3 · Aprovado por: Fabio

## Fase 1 — Premissas e produtos
- [x] lib/estudio-produtos.js (custo, margem, preço mínimo, limite de esforço, semáforo) + tests/estudio-produtos.test.js
- [x] Ações sim_* em api/estrategia.js (kv sim:premissas, sim:produtos)
- [x] public/estudio-ui.js + menu e página em Estratégia
## Fase 2 — Esteira A→B→C
- [x] calcularEsteira (CAC por entrante, CAC por venda, margem esperada, LTV÷CAC, payback) + aba Esteira com quadro, conversão, tempo, CAC e gatilho por passagem
## Fase 3 — Simulador de cenário
- [x] lib/estudio-simulador.js (coortes mensais: margem por oferta, caixa acumulado, break-even, ROI, ocupação, ARR, semáforos, margem × caixa) + aba Simulador com cenários salvos (sim:cenarios)
## Fase 4 — Comparação e sensibilidade
- [x] comparar até 3 cenários, duplicar cenário, sensibilidade (custo +10%, prazo ×2, conversão ×0,5)
## Fase 5 — Teste de escala e catálogo versionado
- [x] lib/estudio-escala.js: 7 perguntas com preenchimento pelo sistema, pontuação, sugestão (decisão só do fundador), histórico; catálogo versionado com congelar/descongelar e trava por proposta aprovada (sim:propostas, sim:catalogo_versoes)
## Fase 6 — IA de estratégia e finanças
- [x] lib/estudio-ia.js + ação sim_ia (somente leitura) + painel no Simulador + cron mensal margem × caixa (compara simulado × realizado, grava só sim:log)
## Fase 7 — Dados reais e exportação
- [x] financeiro (QuickBooks): prazo de recebimento, CAC, EBITDA e recorrência reais lado a lado; valor anterior em sim:log; exportação markdown com legenda "hipótese a validar"
- [ ] Funil/conversões do CRM (HubSpot) — pendente, depende da T2 (Interseção)

## Interseções
- T5: contratos das chaves sim:* em partitura/contratos/ (a registrar)
- T2: funil e CAC por degrau vindos do HubSpot (ainda não ligado)
- T6: DSO, custo e margem realizados (fase 7)
- T1: entrada de cron `/api/estrategia?cron=margem_caixa_mensal` (dia 5, 11h UTC) adicionada em vercel.json — T1 deve conferir

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 15/11/2026 | Fase 1 entregue (v3.519) | Parte 3 (campanhas/ofertas) ainda não iniciada | Fase 2: esteira |
| 15/11/2026 | Fase 2 entregue (v3.520) | — | Fase 3: simulador de cenário |
| 15/11/2026 | Fase 3 entregue (v3.521) | — | Fase 4: comparação de 3 cenários e sensibilidade |
| 15/11/2026 | Fase 4 entregue (v3.522) | — | Fase 5: teste de escala e catálogo |
| 15/11/2026 | Fase 5 entregue (v3.523) | Máximo de produtos de 2027 ainda não definido (pergunta 4) | Fase 6: IA de estratégia e finanças |
| 15/11/2026 | Fase 6 entregue (v3.524) | — | Fase 7: dados reais (CRM e financeiro) e exportação |
| 15/11/2026 | Fase 7 entregue (v3.525), exceto CRM | HubSpot (T2) | Conferir com dados reais em produção |
