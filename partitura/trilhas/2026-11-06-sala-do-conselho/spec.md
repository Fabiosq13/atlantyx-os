# Spec — Sala do Conselho (v3.404)
BPM-Trilha: T3 · interseção T4 (item de menu 2.3b em public/index.html)

Pedido (06/11/2026): sala do conselho com todos os agentes, por chat ou sala de reunião, com o Conselheiro do Contra, dentro de Estratégia; e também no chat direto do Claude.

## Critérios de aceite
- [x] Cadeiras: CFO, CRO, CTO, COO, Gerente de Marketing IA, Gerente Financeiro IA, Gerente Comercial IA, Gerente de Pessoas IA, PMO IA (Maestro), NORTE, Voz do Cliente, Conselheiro do Contra (sempre fala, por último) — ATLAS conduz e fecha.
- [x] Modo chat (`conselho_chat`): uma pauta → falas por lente com números do contexto vivo + operação (leads, campanhas, anúncios, projetos, pessoas, propostas) → síntese do ATLAS (decisão, o que o Contra deixou em pé, próximos passos com dono/prazo, pergunta ao fundador). Conversa gravada (est_conversas, prefixo 🏛️) + ata em s1_historico tipo `conselho`.
- [x] Modo reunião: botão abre a Sala de Estratégia por rodadas com todas as cadeiras pré-marcadas.
- [x] No Claude: doc do Projeto "Sala do Conselho — protocolo" + skill proposta `sala-do-conselho`.
