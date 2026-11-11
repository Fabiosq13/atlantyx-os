# Plano — Floresta de Vendas
BPM-Trilha: T3 · BPM-ID: 2026-11-10-floresta-vendas
Pedido do fundador (10/11/2026): visão de floresta com todos os contatos e negócios do HubSpot num kanban moderno, jornada do contato frio ao cliente com etapas lógicas, tempo limite por etapa, IA decidindo (avançar / congelar / desistir) e disparando ações com aprovação do fundador; insights e ideias.
- [x] lib/floresta.js: jornada (frio→abordado→engajado→qualificado→reunião→proposta→negociação→cliente + congelado/perdido), SLA, temperatura, estatísticas, IA de decisão, fila de aprovação, executor (HubSpot, To-do, congelar)
- [x] api/vendas: floresta, floresta_ia, floresta_decidir, floresta_mover, floresta_cfg; cron ?cron=floresta (dias úteis 8h13 BRT) só enche a fila
- [x] public/floresta-ui.js + página s7floresta: Kanban (arrastar = mover no HubSpot), Floresta (clareiras), Lista; painel Decisões / Insights / Histórico
## Interseções
- T1: cron novo em vercel.json (/api/vendas?cron=floresta).
- T2: escreve no HubSpot (dealstage, lifecyclestage, hs_lead_status, criação de negócio) só após aprovação ou arraste do fundador.
## Registro da Batida
- 2026-11-10 · v3.440 · ✅ entregue · próximo: Fabio rodar a 1ª leitura da IA e ajustar os tempos limite.
