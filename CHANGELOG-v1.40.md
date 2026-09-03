# Atlantyx OS · v1.40 — Diagnóstico do saldo de abertura

## Botão novo: 🔍 Saldo de abertura
No cabeçalho do Fluxo de Caixa Futuro. Consulta o QuickBooks e mostra:

- **O saldo de partida** e a lista **conta a conta** que o compõe, com as
  negativas em vermelho
- **Classificações suspeitas detectadas automaticamente**, com o efeito no
  fluxo e o passo a passo para corrigir
- **Quanto o saldo passaria a ser** se as contas mal classificadas fossem
  corrigidas
- Os cartões de crédito e outras contas, para você ver que estão
  corretamente fora do saldo de caixa

## O que ele detecta
1. **Conta com nome de cartão classificada como "Bank"** — o caso mais
   comum de saldo de partida muito negativo. A dívida do cartão vira
   caixa negativo. A correção é no QuickBooks: Plano de Contas → editar a
   conta → mudar o tipo para "Cartão de crédito".
2. **Conta bancária com saldo negativo** sem cara de cartão — pode ser
   cheque especial real, ou conta importada **sem o saldo de abertura
   lançado** (só as saídas entraram).

## Observação sobre a versão
O print enviado mostrava `[ATLANTYX v1.35]`, então as correções das
v1.36 a v1.39 (receita dobrada no extrato, orçamento com realizado
zerado, mês corrente do fluxo, composição do saldo) ainda não estavam
no ar. Vale aplicar este pacote completo.

## Arquivo
- api/financeiro.js · public/index.html
