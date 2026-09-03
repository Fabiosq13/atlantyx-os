# Atlantyx OS · v1.39 — De onde vem o saldo inicial (e por que está negativo)

## Primeiro, um esclarecimento
**O Orçamento Anual não tem saldo inicial.** Ele compara orçado x
realizado por categoria, mês a mês — não trabalha com saldo. Verifiquei o
código: não existe nenhum saldo ali.

O saldo inicial negativo que você viu está no **Fluxo de Caixa Futuro**
(e no Fluxo Detalhado, que parte dele).

## De onde ele vem
Do QuickBooks: é a **soma de todas as contas do tipo "Bank"** ativas
(campo CurrentBalance de cada uma). Se o QuickBooks não retornar nada,
o sistema usa o saldo cadastrado manualmente em Saldos Iniciais.

## Por que pode dar negativo — as três causas prováveis
1. **Cartão de crédito classificado como conta "Bank"** no QuickBooks.
   O correto é o tipo "Credit Card". Classificado errado, o saldo devedor
   do cartão é somado como se fosse dinheiro em caixa negativo — e
   costuma ser a causa de negativos grandes.
2. **Conta com lançamentos importados sem o saldo inicial correspondente**
   — todas as saídas entraram, o saldo de abertura não.
3. **Conta corrente realmente no cheque especial.**

## O que mudou na tela
Abaixo da tabela do Fluxo Futuro, o painel agora mostra:
- O saldo de partida, marcado como negativo quando for o caso
- **A lista conta a conta** que compõe esse número, com as negativas em
  vermelho — assim você vê exatamente qual conta está puxando para baixo
- Um aviso automático quando há conta negativa, explicando as causas
- Um roteiro do que verificar no QuickBooks
- Quando o saldo vem do cadastro manual (e não do QB), diz isso e mostra
  a data de referência

Também virou **alerta no topo**: "O saldo de PARTIDA já é negativo — toda
a projeção parte daí", listando as contas responsáveis. Antes o número
aparecia sem explicação nenhuma.

## Arquivos
- api/financeiro.js · public/index.html
