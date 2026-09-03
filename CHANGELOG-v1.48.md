# Atlantyx OS · v1.48 — FIX: faltavam 76% dos lançamentos no extrato

## Eu errei o diagnóstico na v1.47
Disse que os lançamentos faltavam por estarem em "Para revisão" no
QuickBooks. Seu print da aba **"Publicada"** (com apenas 1 pendente)
provou que não era isso — eles já eram lançamentos contábeis e deveriam
aparecer. O aviso incorreto foi removido.

## A causa real
O extrato consultava apenas 5 tipos de transação: Purchase, Payment,
Deposit, SalesReceipt e Invoice.

Mas na conciliação bancária do QuickBooks, a maioria dos PIX e pagamentos
vira **"Pagamento de conta" = `BillPayment`** — uma entidade que **não
estava sendo consultada**. No seu print de 10/08:

- 13 lançamentos "Pagamento de conta" (BillPayment) → **não apareciam**
- 3 "Despesa" (Purchase) → apareciam
- 1 "Depósito" (Deposit) → aparecia

**Só 24% dos lançamentos chegavam ao Atlantyx.** É o que explica a
diferença de ~R$ 93 mil num único dia, e provavelmente boa parte da
estranheza dos saldos.

## Correção
Cinco entidades adicionadas à consulta:
- **BillPayment** — "Pagamento de conta" (a principal, e a que faltava)
- **Transfer** — transferências entre contas (entram como referência, já
  que não alteram o caixa total da empresa)
- **JournalEntry** — lançamentos manuais do contador (valor somado pelas
  linhas de débito, já que não tem TotalAmt)
- **CreditCardPayment** — pagamento de fatura de cartão
- **RefundReceipt** — reembolsos

Também ajustei descrição, categoria e conta para cada tipo novo
(BillPayment usa VendorRef, Transfer mostra origem → destino).

## O que esperar depois de aplicar
Muito mais lançamentos no extrato e no fluxo detalhado — e os saldos
devem se aproximar bastante do extrato real do banco. Como o volume vai
crescer, vale rodar o **⚠ Procurar duplicados** depois, para conferir se
nenhuma transação passou a ser contada duas vezes (BillPayment vinculado
a Bill, por exemplo).

## Arquivos
- api/financeiro.js · public/index.html
