# Atlantyx OS · v1.60.1 — Por que o Razão acerta e o Fluxo erra

## A observação certa
No Razão: **R$ 91.913,38** ✓ (correto, vindo da linha "Saldo inicial")
No Fluxo de Caixa: saldo inicial errado ✗

As duas telas chamam a MESMA função. Então a diferença não estava no
cálculo — estava no **cache**.

## O bug: cache guardando "não sei"
A função guarda o resultado em cache para não repetir consultas. Mas
guardava também o resultado **nulo**:

1. O Fluxo consulta primeiro. Se o razão falha naquele instante (throttle,
   timing), a função devolve null — **e o null vai para o cache**
2. O Razão consulta depois, por outro caminho, e acerta os 91.913,38
3. O Fluxo consulta de novo: encontra a chave no cache e devolve o null
   guardado — para sempre, sem nunca mais tentar

Agora o cache só reaproveita valores válidos. Se estiver nulo, apaga a
entrada e tenta de novo.

## Diagnóstico visível
O subtítulo do saldo passa a dizer **de onde o número veio de fato**:
- *"linha 'Saldo inicial' do razão do QuickBooks em 31/07/2026"* (ideal), ou
- *"soma das transações até 31/07/2026 — razão falhou: [motivo]"*

Assim, se voltar a divergir, a própria tela diz qual caminho respondeu e
por que o principal não funcionou — sem precisar de mais uma rodada de
prints.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.60.1)
