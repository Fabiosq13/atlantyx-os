# Spec — Despesas pendentes: regra única QB × Agenda + replicar mês (T6)
BPM-Trilha: T6 · BPM-ID: 2026-10-12-despesas-pendentes-regra-unica · pedido do fundador em 2026-10-12

## Escopo
1. Botão na Agenda de Despesas: "Replicar este mês → 12 meses". Copia as despesas do mês exibido (Agenda + contas a pagar do QuickBooks) para os 12 meses seguintes; se a despesa já existe no mês (mesmo nome/fornecedor, na Agenda ou no QB), não cria.
2. Regra única das pendências: despesas presentes e futuras da Agenda aparecem como pendentes no e-mail das 8h, no dashboard e nas telas/relatórios; se a mesma despesa já existe no QuickBooks (lançada ou Bill do mesmo fornecedor no mesmo mês), vale o QuickBooks; se só existe na Agenda, vale a Agenda.

## Critérios de aceite
- Replicar mostra prévia (criar × já existe) e só grava após confirmação; rodar de novo não duplica; "Regerar ocorrências" não recria o que foi pulado.
- Nenhuma despesa conta duas vezes (Agenda + QB) no e-mail, dashboard (pagamentos do dia/atraso), Agenda, Fluxo Detalhado, Extrato previstos, Saldo Diário/Mensal, Fluxo 12 meses, Caixa e liquidez, KPIs (cobertura).
- Ocorrência cancelada não aparece como pendente.
- Se o QuickBooks não responder, a Agenda é exibida inteira (nada é escondido).
