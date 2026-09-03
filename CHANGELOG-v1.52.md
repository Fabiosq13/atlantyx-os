# Atlantyx OS · v1.52 — De onde vem a diferença do saldo de 01/08

## A análise dos seus dois prints
| Data  | QuickBooks (Plano de Contas) | Atlantyx      | Diferença     |
|-------|------------------------------|---------------|---------------|
| 02/08 | R$ 91.614,38                 | -R$ 318.612,87| -R$ 410.227,25|
| 05/08 | R$ 91.615,26                 | -R$ 318.611,99| -R$ 410.227,25|

A diferença é **exatamente constante**: R$ 410.227,25 nos dois dias.

Isso é um diagnóstico em si: **o movimento diário está idêntico** nas
duas telas (as variações batem centavo a centavo). O que difere é
apenas o **ponto de partida**.

## A explicação mais provável
Seu print do QuickBooks é o Plano de Contas de **uma conta específica**
(a coluna mostra "itau"). O fluxo do Atlantyx usa a **soma de TODAS as
contas do tipo "Bank"**.

Se existe outra conta Bank com saldo aproximado de -R$ 410 mil (um
cartão classificado como Bank, uma conta de investimento, ou uma conta
importada sem saldo de abertura), ela explica a diferença inteira.

## Novo: ⚖ Comparar por conta
Botão no Fluxo Detalhado. Mostra **cada conta Bank separadamente**, com o
saldo na data escolhida e o saldo de hoje, mais o total que o Atlantyx
usa. Assim dá para ver imediatamente qual conta está causando a
diferença — e comparar cada uma com o extrato real dela.

Também aponta automaticamente contas com saldo negativo e avisa quando há
mais de uma conta na soma.

## Como usar
1. Abra **⚖ Comparar por conta**
2. Ache a conta que não é o "itau" do seu print
3. Confira o saldo dela contra o extrato real
4. Se for cartão de crédito classificado como Bank, corrija o tipo no
   QuickBooks (Plano de Contas → editar → Cartão de crédito)

## Arquivos
- api/financeiro.js · public/index.html (agora com ATX-v1.52 no rodapé)
