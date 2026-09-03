# Atlantyx OS · v1.58 — O razão vinha sem valores porque eu pedia colunas erradas

## O que a estrutura bruta revelou
O seu QuickBooks devolveu **6 colunas**: Data, Tipo, Nº, Nome,
Comentário, Subdivisão.

Eu pedia 8 — as 6 acima **mais** `subt_nat_amount` (valor) e
`rbal_nat_amount` (saldo). O QuickBooks **ignorou esses dois nomes** e
devolveu só as textuais.

Ou seja: os valores nunca chegaram. Não era erro de leitura como eu
supus nas duas versões anteriores — era o pedido que estava malfeito.

## Correções

### 1. Parar de forçar as colunas
O relatório passa a ser pedido com o **layout padrão** (que já traz
Amount e Balance). Se ainda faltar, o sistema tenta outros nomes aceitos
pela API, em sequência, até encontrar um que devolva valores.

### 2. Fallback que sempre funciona
Se o relatório insistir em não trazer valores, o razão é **montado a
partir das transações da API** (que funcionam bem), com o saldo
acumulado partindo do **Balanço Patrimonial** — a fonte confiável
descoberta na v1.57.

A tela avisa quando isso acontece, para você saber de onde vieram os
números.

### 3. Ordem de execução corrigida
O saldo de abertura estava sendo calculado DEPOIS do trecho que precisa
dele — o fallback usaria 0 como base. Agora vem antes.

## Conferência com os seus prints
Partindo do saldo de abertura R$ 91.913,38:
- 02/08 TARIFA → 91.614,38 ✓
- 05/08 RENDIMENTOS → 91.615,26 ✓
- 05/08 BAP → 89.793,33 ✓
- 05/08 PREFEITURA → 85.595,09 ✓
- 05/08 LIGHT → **85.327,41** ✓ (idêntico ao QuickBooks)

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.58)
