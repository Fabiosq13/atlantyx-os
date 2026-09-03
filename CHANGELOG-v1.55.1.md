# Atlantyx OS · v1.55.1 — FIX: razão com valores absurdos (quatrilhões)

## O bug
O razão mostrou "R$ 4.606.672.046.066.723" de movimento e uma despesa de
"R$ 424.987.330.001,00". Valores impossíveis.

## Causa (erro meu no parsing)
O QuickBooks devolve os valores no **formato americano**: `4198.24`, com
**ponto como separador decimal**. Meu código removia todos os pontos,
assumindo que eram separador de milhar (formato brasileiro).

Resultado: `4198.24` virava `419824` — cem vezes maior. Somando 65
linhas assim, o total explodia para quatrilhões.

Também corrigi a leitura das colunas: os valores e saldos apareciam
vazios ("—") porque eu assumia posições fixas. Agora o sistema lê o
cabeçalho que o QuickBooks devolve e localiza cada coluna pelo nome
(tx_date, txn_type, name, amount, balance), com as posições fixas apenas
como reserva.

## Validado
Parser testado com os formatos que o QuickBooks usa: "4198.24",
"-267.68", "1,234.56", "R$ 91,614.38", vazio — todos corretos.

## Sobre a sua pergunta original
Com o razão funcionando, o campo **"Saldo inicial (razão)" em 01/08**
passa a mostrar o número real do QuickBooks. É esse valor que deve ser
comparado com o -R$ 129.502,67 que o Atlantyx calcula.

Se eles ainda divergirem, a diferença indica lançamentos que o Atlantyx
não está lendo (ou lendo duplicados) — e aí a correção certa é trocar a
fonte do saldo inicial: em vez de calcular retroagindo do saldo de hoje,
usar diretamente o saldo do razão na data. Me diga os dois números que
eu faço essa troca.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.55.1)
