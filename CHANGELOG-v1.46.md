# Atlantyx OS · v1.46 — FIX: saldo do extrato não acumulava o histórico anterior

## O bug que você encontrou
Ao filtrar 01/08 a 31/08, o extrato começava com saldo **zero** (ou com um
valor antigo que não mudava), ignorando tudo que aconteceu antes do
período. Por isso os saldos "abriam do dia 26" e não faziam sentido.

## Causa
O saldo inicial vinha EXCLUSIVAMENTE de um cadastro manual na tabela
`saldos_iniciais`. Se não houvesse um registro para aquela data
específica, ficava zero — e a coluna de saldo acumulado partia do nada,
como se a empresa tivesse começado a existir no dia 1º de agosto.

## Correção
O saldo inicial de qualquer período agora é calculado assim:

**saldo cadastrado mais próximo antes do período + todo o movimento
entre essa data e o início do período**

Se não houver nenhum saldo cadastrado, o sistema **reconstrói a partir de
todo o histórico** de lançamentos anteriores. Notas fiscais emitidas
(referência) continuam sem afetar o caixa, como definido na v1.38.

Exemplo real: saldo de R$ 100.000 cadastrado em 01/01 + R$ 80.000 de
movimento até 31/07 = extrato de agosto abre com **R$ 180.000**, em vez
de zero.

## Transparência na tela
Abaixo do saldo inicial aparece como ele foi formado:
- "R$ 100.000,00 em 01/01/2026 + R$ 80.000,00 de movimento até o início
  do período", ou
- "reconstruído de todo o histórico (142 lançamentos antes do período) —
  nenhum saldo inicial cadastrado"

Assim o número nunca mais aparece sem explicação.

## Observação
Se você tiver um saldo bancário real conhecido numa data (ex.: extrato do
banco em 01/01), cadastre em **Saldos Iniciais**. Quanto mais próxima a
data-base, mais preciso o cálculo — a reconstrução completa depende de
todos os lançamentos estarem no QuickBooks.

## Arquivos
- api/financeiro.js · public/index.html
