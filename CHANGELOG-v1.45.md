# Atlantyx OS · v1.45 — Varredura de duplicidade por período

## Novo: ⚠ Procurar duplicados
Botão no Fluxo de Caixa Futuro. Você informa o período e ele varre TODO o
QuickBooks (Payment, Deposit, Purchase, Bill, Invoice, SalesReceipt),
agrupa por valor + contraparte + datas próximas, e classifica cada
suspeito em três níveis:

- 🔴 **Duplicidade real** — dois registros do MESMO tipo, valor e
  contraparte (ex.: dois Payments de R$ 43.280,98 da CPFL). É lançamento
  repetido na contabilidade: corrija no QuickBooks. Mostra os IDs e a
  **hora de criação de cada um** — horários diferentes no mesmo dia é a
  assinatura clássica de digitação em duplicidade.
- 🟡 **Suspeito sem vínculo** — tipos diferentes, mesmo valor e
  contraparte, sem vínculo declarado. Pode ser o mesmo dinheiro lançado
  duas vezes (depósito criado à mão em vez de casado com o recebimento).
  Confira antes de excluir.
- 🟢 **Vinculado** — pagamento e depósito ligados entre si. Normal, e o
  sistema já não conta em dobro desde a v1.41.

## Impacto no caixa
Cada duplicidade real mostra **quanto está inflando o saldo**, e há um
total consolidado no topo. Assim você sabe de imediato se o problema é
cosmético ou se está distorcendo a sua posição financeira.

## Cuidado com falso alarme
O agrupamento exige **mesma contraparte** — dois clientes diferentes com
o mesmo valor não são apontados como duplicidade. E a janela de datas é
configurável (padrão 3 dias), para pegar o caso do lançamento repetido
no dia seguinte sem juntar mensalidades de meses distintos.

## Validação
Cenário com os 4 casos: duplicidade real detectada com impacto correto,
vínculo pagamento+depósito classificado como normal, depósito sem
vínculo marcado como suspeito, e clientes diferentes com mesmo valor
corretamente ignorados.

## Arquivos
- api/financeiro.js · public/index.html
