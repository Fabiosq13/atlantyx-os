# Atlantyx OS · v1.53 — Filtro por conta bancária

## O que foi adicionado
Um **seletor de conta** no Fluxo Detalhado, ao lado dos filtros de data:
- **"Todas as contas"** (padrão) — com o saldo somado
- Cada conta bancária individualmente, já mostrando o saldo dela

Escolhendo uma conta, tudo passa a considerar só ela: os lançamentos, o
saldo inicial, o saldo acumulado e a comparação com o banco. O subtítulo
indica entre colchetes qual conta está filtrada.

Assim dá para abrir o extrato do Itaú e conferir linha a linha com a
tela, sem a interferência das outras contas.

## Por que isso importa no seu caso
No teste com dados simulando o seu cenário, filtrar "Banco Itau
business" devolveu **R$ 91.614,38** — exatamente o saldo do seu print do
Plano de Contas. Isso confirma que a diferença de R$ 410.227,25 vinha de
**outra conta** entrando na soma.

Depois de aplicar, o seletor vai mostrar todas as suas contas com os
respectivos saldos — e a que estiver com um valor estranho fica evidente
na própria lista.

## Detalhe técnico
Cada lançamento agora carrega o id da conta de origem (AccountRef,
BankAccountRef, DepositToAccountRef, conforme o tipo), o que permite o
filtro funcionar também para BillPayment e transferências.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.53)
