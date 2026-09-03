# Atlantyx OS · v1.47 — Por que faltam lançamentos do extrato bancário

## O diagnóstico (comparando seus dois prints)
No banco, dia 10/08: **14 lançamentos, R$ 105.165,54**
No Atlantyx, dia 10/08: **8 lançamentos, R$ 11.926,05**

Cruzando um a um, o padrão é inequívoco: **só aparecem no Atlantyx os
lançamentos já CATEGORIZADOS no QuickBooks** (MARIANA → "Despesa",
LUCAS ALEXANDRE → "Payroll Expenses"). Os 11 marcados como
**"Correspondido"** — somando cerca de R$ 93 mil — não aparecem.

## A causa
A tela do seu primeiro print é a **"Para revisão"** (Transações
bancárias) do QuickBooks. Enquanto uma transação está nessa fila — mesmo
exibindo "Correspondido" ou "Pagamento de conta" — ela **ainda não é um
lançamento contábil**. A API do QuickBooks não a devolve, e ela também
não entra no saldo que o próprio QuickBooks reporta.

"Correspondido" significa apenas que o QuickBooks *sugeriu* uma
correspondência — falta você confirmar.

**Não é bug do Atlantyx nem da integração:** o sistema mostra
corretamente o que existe na contabilidade. O que falta é a confirmação
no QuickBooks.

## Como resolver
1. QuickBooks → **Transações → Transações bancárias**
2. Aba **"Para revisão"**
3. Revise a categoria de cada transação e clique em **Confirmar**
4. No Atlantyx, clique em **Atualizar** — elas aparecem

## O que foi adicionado
- **Aviso fixo** no topo do Fluxo Detalhado explicando isso, para não
  ficar parecendo que o sistema está perdendo dados
- Botão **🔍 Conferir**: mostra o saldo que o QuickBooks reporta, quantos
  lançamentos existem no período, a explicação e o passo a passo — com a
  orientação de comparar esse saldo com o saldo real do banco. A
  diferença costuma ser exatamente a soma do que está em "Para revisão"

## Observação importante
Isso também explica parte da estranheza do saldo: como o QuickBooks
ignora as transações não confirmadas, o saldo dele (e portanto o do
Atlantyx) fica divergente do banco real enquanto a fila não for
processada.

## Arquivos
- api/financeiro.js · public/index.html
