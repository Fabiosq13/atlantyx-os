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
- [x] v3.441: etapa "🤖 Abordagem IARA (SDR)"; marcar cards (ou coluna) → IARA escreve a 1ª mensagem → fundador revisa e aprova → envio pelo WhatsApp (Z-API) com descadastro e sem repetir em 7 dias, status ATTEMPTED_TO_CONTACT e nota no HubSpot; IA de decisão pode propor "abordar_iara"
- [x] v3.441: "🧲 Gerar leads frios (Apollo)" na floresta — mesma busca da Prospecção (people_search, sem crédito), deduplica e cria no HubSpot como contato frio (lifecycle lead, NEW), já marcados para a IARA
## Interseções (v3.441)
- T2: envio de WhatsApp pela Z-API (aprovação explícita do fundador por lote) e escrita no HubSpot (contatos, notas).
- 2026-11-10 · v3.441 · ✅ entregue
- [x] v3.442: ações em lote nos marcados — 📣 Remarketing (nova etapa, kv vendas:floresta:remarketing, CSV do público), ↩ tirar do remarketing, 🗑 excluir (arquiva contato/negócio no HubSpot, restaurável por 90 dias); arrastar para/da coluna Remarketing também funciona
- 2026-11-11 · v3.442 · ✅ entregue
- [x] v3.445: campos da IARA no HubSpot (achados pelo rótulo): "Fluxo IA" = IA → etapa Atendimento IARA; "Atendido pela IA" → chip 💬; "Resumo SDR Atlantyx" → conversa no card; "Abordagem" → tag no card, filtro e edição gravando no HubSpot. Botão da seleção agora grava Fluxo IA = IA (a IARA é externa; o envio pela Z-API saiu da tela)
- 2026-11-11 · v3.445 · ✅ entregue
- [x] v3.446 · marcar leads para a IARA: checkbox maior e fora do arrasto, marcar sem perder a rolagem, "Marcar os N frios", seleção na Lista e na Floresta (Ctrl/Shift+clique), botão individual no card; gravação em lote (batch) do Fluxo IA = IA; Apollo com coluna 🤖 IARA (todos ou parte) que já planta com Fluxo IA = IA
- 11/11/2026 · v3.446 · ok · — · aguardar teste do fundador com leads reais
- [x] v3.458 · campos do HubSpot pelos nomes internos informados pelo fundador: marcar lead para a IARA grava `atendido_pela_ia` (sim/não → true; lista → opção IA/Sim; texto → "IA"), fluxo = `fluxo_de_atendimento`, tag = `abordagem`; card vai para Atendimento IARA com atendido_pela_ia marcado ou fluxo_de_atendimento = IA; vale também para o "IARA" da geração Apollo
- 11/11/2026 · v3.458 · ok · — · conferir no HubSpot o valor gravado em atendido_pela_ia
- [x] v3.459 · atendido_pela_ia = true ao mandar para a IARA e false ao tirar
- 11/11/2026 · v3.459 · ok · — · —
