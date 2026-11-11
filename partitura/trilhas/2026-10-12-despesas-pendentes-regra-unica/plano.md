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
- [x] v3.447 · despesa vencida que só existe na Agenda, mas já foi paga no QuickBooks direto do banco (despesa/transferência/imposto), sai das Pendências, da Agenda e do fluxo: casa com a saída do extrato (nome ou sinônimo — Receita Federal↔DARF, Prefeitura↔ISS/DAM — + valor, −20 a +45 dias). Nome+valor grava a baixa automática; só valor exato com centavos marca paga sem gravar. Sinônimos também valem para contas a pagar do QB pagas por fora
- 11/11/2026 · v3.447 · ok · — · conferir com o fundador as Pendências de outubro
- [x] v3.448 · casamento "já pago no QuickBooks" passa a ler as despesas pagas (Purchase) direto do QB, consulta leve (o extrato consolidado estourava o tempo e nada casava); vale para despesas só da Agenda e para contas a pagar do QB vencidas, na Agenda e nas Pendências. Botão 🔍 "já paguei?" em cada conta em atraso: mostra despesas do QB com valor ±5% perto da data, link ↗ e "É esta → pago"
- 11/11/2026 · v3.448 · ok · — · fundador conferir a lista de atraso com o 🔍
- [x] v3.449 · Pendências: item da Agenda que o detector de duplicados já reconhece como "pago, mas segue a pagar na Agenda" sai de "A pagar vencido"
- 11/11/2026 · v3.449 · ok · — · conferir Pendências após o deploy
- [x] v3.451 · Impostos recorrentes: "já na Agenda" passa a ser um-para-um (nome exato primeiro) — incluir "DARF trimestral (IRPJ/CSLL)" não trava mais a inclusão do "IRPJ" trimestral (e vice-versa)
- 11/11/2026 · v3.451 · ok · — · —
