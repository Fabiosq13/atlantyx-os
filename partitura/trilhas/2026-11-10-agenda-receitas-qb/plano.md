# Plano — Agenda de Receitas: M-1, M0 e futuro + QuickBooks vence a sustentação
BPM-Trilha: T6 · BPM-ID: 2026-11-10-agenda-receitas-qb
Pedido do fundador (10/11/2026): ver todas as receitas a partir de M-1 com filtro de mês e termo; sustentação faturada no QuickBooks (uma ou várias notas, ou recorrência) vale o QuickBooks e a agenda é ignorada em qualquer tela.
- [x] receitasPrevistas: notas do mesmo cliente/assunto emitidas no mês cobrem a mensalidade (qualquer valor, várias notas; exceto nota de termo/marco)
- [x] receitasPrevistas: modelo recorrente de fatura no QuickBooks substitui a sustentação da agenda a partir da próxima data (origem qb_recorrente)
- [x] receitasPrevistas devolve faturas_qb (M-1 em diante + em aberto antigas) com termo; fluxo soma qb_recorrente no MRR
- [x] Agenda de Receitas: aba "Todas · M-1, M0 e futuro" com filtros de mês e termo
## Registro da Batida
- 2026-11-10 · v3.423 · ✅ entregue · próximo: Fabio conferir novembro (Sustentação Anaplan/Xplann) na aba Todas.
- [x] v3.425: termo de sustentação (Kanban de Faturamento) substitui a mensalidade da agenda do mês mais próximo (até 45 dias); nota de termo de sustentação no QuickBooks também cobre a mensalidade; casamento por assunto compacto ("Big Data" = "BigData")
- 2026-11-10 · v3.425 · ✅ entregue · caso do Termo 35 (sustentação Big Data)
- [x] v3.426: recorrentes de receita do QuickBooks fora por padrão em todas as telas (valem os do sistema); aba "Recorrentes QuickBooks" na agenda liga/elimina modelo a modelo (kv fin:qb_rec_receitas)
- 2026-11-10 · v3.426 · ✅ entregue
- [x] v3.427: regras de substituição (termo/fatura contém X → elimina recorrência Y do mês mais próximo, ±25 dias), para sustentação e avulsa recorrente; padrão: "sustentação e evolutivas"→bigdata, "xplann"→xplann; aba de regras editável na agenda
- 2026-11-10 · v3.427 · ✅ entregue
- [x] v3.428: previsão de recebimento por fatura do QuickBooks (kv fin:inv_prev_receb) — vale no extrato futuro, fluxo, projetado e agenda; botão 📅 na aba Todas
- 2026-11-10 · v3.428 · ✅ entregue · caso fatura 217 (MP3+MP4) recebida em novembro
- [x] v3.429: rateio do termo por NF/empresa aberto embaixo da fatura na agenda; botão 🗓 corrige o vencimento da fatura no QuickBooks (sparse, só DueDate) e a emissão das NFs do termo (termos_empresas.nf_data)
- 2026-11-10 · v3.429 · ✅ entregue · caso termo 3 / fatura 217 (emissão 23/10, vencimento 23/11)
- [x] v3.430: marco que já virou termo (mesmo projeto e valor ±1%) sai da agenda; vale a data do termo (caso MP5 / termo 38)
- 2026-11-10 · v3.430 · ✅ entregue
- [x] v3.431: fatura com saldo = retenção de impostos conta como recebida na agenda (2ª consulta trazia de volta como vencida); rateio mostra só a nota da própria fatura, com link para o termo inteiro
- 2026-11-10 · v3.431 · ✅ entregue
- [x] v3.432: marco virou termo → vale o termo: casamento pelo código do marco no termo (MP3 e MP4…) mesmo com nome de projeto diferente; botão "→ Termo" no marco da agenda liga à mão (kv fin:marco_termo)
- 2026-11-10 · v3.432 · ✅ entregue · caso MP4 Oficial_Cadastro no termo 3
