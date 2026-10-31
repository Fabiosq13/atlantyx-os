# Plano — Planejamento Estratégico: horizonte de 5 anos e trilha guiada
ID: 2026-10-31-planejamento-estrategico-5anos · Trilha: T3 · Aprovado por: fundador (31/10/2026)

## Fase 1 — Horizonte de 5 anos, calendário de revisão e orçamento semestral
- [x] 1.1 Visão 5 anos (visao.a5, 2031) no plano, migrando o texto antigo de 3 anos (lib/plano-estrategico.js, index.html seção do plano)
- [x] 1.2 Projeção por motor de 3 para 5 anos (lib/projecao-3anos.js, public/projecao-ui.js, api/estrategia.js)
- [x] 1.3 Calendário: revisão anual no 4º tri, orçamento (dezembro/junho), check-ins trimestrais, checklist e gatilhos (lib/estrategia-roteiro.js, api/estrategia.js)
- [x] 1.4 Orçamento semestral previsto × realizado por motor (api/estrategia.js)
- [x] Validação da fase

## Fase 2 — Roteiro das 11 perguntas e lista do que NÃO fazer
- [x] 2.1 Roteiro com estados, responsável, data, ordem e validação só pelo fundador (lib/estrategia-roteiro.js, api/estrategia.js)
- [x] 2.2 Sugestão do ATLAS por etapa com os números vivos (sem fatos de mercado inventados)
- [x] 2.3 Lista do que NÃO fazer + checagem de conflito (ação nao_fazer_checar)
- [x] 2.4 Tela "🗺 Trilha guiada" com regras de ouro, roteiro, "não fazer", calendário e orçamento (public/estrategia-trilha-ui.js, public/estrategia-ui.js)
- [x] 2.5 Respostas validadas e "nãos" entram no contexto do ATLAS e do comitê
- [x] Validação da fase

## Interseções
- T1 (Esteira de Demandas): mostrar o aviso "parece contrariar um NÃO da estratégia" no detalhe da demanda, chamando `estrategia` ação `nao_fazer_checar` — commit separado com BPM-Trilha: T1.
- T4: rótulo do menu "Projeção 3 anos" → "Projeção 5 anos".
- T5: registrar lib/estrategia-roteiro.js, public/estrategia-trilha-ui.js, lib/projecao-3anos.js e public/projecao-ui.js na T3 em escopos.json; chaves kv novas em contratos/banco.md (sem tabela nova).
- Pedido ao Afinador: nenhum (só kv_store).

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-31 | spec aprovada (entregas 1 e 2) | — | implementar fases 1 e 2 |
| 2026-10-31 | fases 1 e 2 entregues (v3.341) | — | fundador valida; depois seguem as entregas 3 (sócios e quatro cadeiras) e 4 (concorrentes) |
