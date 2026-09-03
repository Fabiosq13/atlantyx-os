# Atlantyx OS · v1.44 — Rastrear duplicidade: no QuickBooks ou no Atlantyx?

## Por quê
As duas linhas de CPFL R$ 43.280,98 em 27/08 continuam aparecendo mesmo
após a v1.41 (que corrigiu Payment+Deposit). Sua hipótese de que o
problema pode estar na base é a mais provável agora — mas em vez de
adivinhar, criei uma forma de PROVAR de que lado está.

## Novo: botão "🔍 Este lançamento está duplicado?"
No detalhe de qualquer linha do Fluxo Detalhado (botão 🔎 → depois o
botão azul). Ele consulta o QuickBooks procurando todos os registros
daquele valor naquela data, em Payment, Deposit, Invoice e SalesReceipt,
e dá um veredito:

- 🔴 **"A duplicidade está NO QUICKBOOKS"** — existem dois registros de
  verdade na base contábil, com os IDs e a data/hora de criação de cada
  um. Aí a correção é lá: excluir ou estornar o repetido.
- 🟡 **"Só existe 1 registro na origem"** — o QuickBooks tem um só, então
  o defeito é do Atlantyx contando duas vezes. Me envie o resultado que
  eu corrijo.
- 🟢 **"Registros vinculados"** — é o caso pagamento + depósito, que a
  v1.41 já trata.
- 🟢 **"Registros distintos"** — duas transações reais que coincidem em
  valor (acontece com contratos de parcela igual).

Para cada registro encontrado mostra: entidade, ID, documento, cliente,
conta, vínculos com outros registros, **data/hora de criação no QB** e o
memo. A hora de criação costuma entregar o lançamento em duplicidade —
dois registros criados com horas diferentes no mesmo dia é o padrão de
digitação repetida.

## Como usar agora
Fluxo Detalhado → linha do CPFL de 27/08 → 🔎 → botão azul de rastrear.
Me manda o resultado que eu digo o próximo passo.

## Arquivos
- api/financeiro.js · public/index.html
