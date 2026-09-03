# Atlantyx OS · v1.60 — A estrutura bruta resolveu tudo

## O que a nova estrutura mostrou
Desta vez o relatório veio com **8 colunas**, incluindo Valor e Saldo. E
a primeira linha de dados era exatamente o que faltava:

```
ColData[0] = "Saldo inicial"
ColData[7] = "91913.38"      ← o saldo de abertura, direto do QuickBooks
```

## Três erros meus, corrigidos

### 1. Nome das colunas (o que fazia o QuickBooks ignorar meu pedido)
Os nomes reais são **`subt_nat_home_amount`** e **`rbal_nat_home_amount`**
— com "**_home_**" no meio. Eu pedia `subt_nat_amount` e
`rbal_nat_amount`, que não existem. Por isso o relatório vinha sem
valores nas versões anteriores.

### 2. Identificação das colunas
Eu lia o nome da coluna de `ColType`, que devolve só o tipo genérico
(Date, String, Money). O nome real está em **`MetaData[].Value`**
(ColKey). Assim, a busca pela coluna de valor nunca encontrava nada.

### 3. A linha "Saldo inicial" era procurada no lugar errado
Eu buscava no `Header` do relatório, mas ela vem como **linha de dados
normal**, com o valor na última coluna.

## O resultado
O saldo de abertura passa a vir da própria linha "Saldo inicial" do razão
— **o número oficial do QuickBooks**, sem nenhum cálculo nosso no meio.
Para o Itaú em 01/08: **R$ 91.913,38**.

## Validação com os seus dados reais
Rodei o parser corrigido contra a estrutura que você enviou:
- Colunas mapeadas: Valor no índice 6 ✓, Saldo no índice 7 ✓
- Saldo inicial: **91.913,38** ✓
- 02/08 TARIFA: valor -299,00 · saldo 91.614,38 ✓
- 05/08 LIGHT: valor -267,68 · saldo 91.346,70 ✓
- 05/08 RENDIMENTOS: valor 0,88 · saldo 91.347,58 ✓
- 05/08 PREFEITURA: valor -4.198,24 · saldo 87.149,34 ✓

Todos idênticos ao QuickBooks.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.60)
