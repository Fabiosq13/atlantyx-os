# Plano — 2026-10-12-despesas-pendentes-regra-unica
- [x] `desp_replicar_mes` (simular + gravar) e botão na Agenda
- [x] `_agendaSemDuplicarQb` (lançada no QB ou Bill do mesmo fornecedor/mês; 1 Bill cobre 1 ocorrência)
- [x] Aplicado em despOcorrencias, fluxoDetalhado, pagamentosDoDiaEPendentes (e-mail + dashboard), kpisSaude, _fv2Caixa
- [x] Canceladas fora das pendências (e-mail, dashboard, caixa)
- [x] Teste local (PGlite)
- [x] v3.164: dashboard de abertura — "a pagar" (cartões, liquidez, caixa em 30 dias, drill-down) inclui as despesas só da Agenda; correção de data no casamento Agenda × QB

## Interseções
- CNAB (api/cnab.js) continua lendo a Agenda — é a remessa de pagamento, não relatório.

## Registro da Batida
- 2026-10-12 · concluído · sem bloqueio · próximo: conferir no e-mail das 8h com dados reais
- 2026-10-12 · v3.164 dashboard de abertura incluído · sem bloqueio
