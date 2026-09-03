# Atlantyx OS · v1.60.2 — O saldo correto era calculado e depois APAGADO

## Sua observação apontou exatamente onde olhar
"Razão correto, extrato e saldo do topo errados." As duas telas usam a
mesma função — então o problema não podia estar no cálculo. E não estava.

## O bug: uma cadeia if/else mal encadeada
```js
if (saldoAberturaBS != null) { saldoInicial = 91913.38; }   // acerta ✓

if (saldoAberturaBS == null && saldoHoje != null) { ... }   // pula
else if (baseData) { ... }                                   // pula
else { saldoInicial = 0; }                                   // ⚠ EXECUTA e zera
```

O segundo bloco era um `if` **independente** do primeiro. Quando o razão
acertava os R$ 91.913,38 mas o `saldoHoje` vinha nulo (o que acontece com
a conta filtrada) e não havia saldo cadastrado, a cadeia caía no `else`
final e **sobrescrevia o valor correto com zero**.

Por isso o Razão — que consulta diretamente — mostrava o número certo, e
o Fluxo, que passa por essa cadeia, mostrava zero. Todas as correções das
versões anteriores estavam funcionando; o resultado é que era descartado
na linha seguinte.

## A correção
As condições agora formam uma cadeia única:
```js
if (saldoAberturaBS != null) { /* já resolvido, não mexer */ }
else if (saldoHoje != null) { ... }
else if (baseData) { ... }
else { saldoInicial = 0; }
```

## Validação
Simulei os três cenários. Nos dois em que o razão acerta, o valor
**antes** era zerado e **agora** é preservado (91.913,38). No cenário em
que o razão falha, o comportamento de reserva continua igual.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.60.2)
