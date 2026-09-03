# Atlantyx OS · v1.36.1 — FIX: lançamentos duplicados no Extrato

## O problema relatado
Duas linhas idênticas no extrato (2026-08-14, CPFL, R$ 39.618,00),
somando duas vezes no saldo acumulado, sem correspondência no
QuickBooks.

## Causa raiz encontrada
A função que busca os lançamentos faz 5 consultas ao QuickBooks (uma por
tipo: Purchase, Payment, Deposit, SalesReceipt, Invoice). Para extrair os
itens da resposta, usava uma cadeia de "||":

    data?.QueryResponse?.Purchase || data?.QueryResponse?.Payment || ...

Isso pega o **primeiro campo presente na resposta**, não o campo daquela
consulta. Quando a resposta traz mais de um campo, a MESMA lista é
processada em rodadas diferentes — o mesmo lançamento entra duas vezes
(com tipos diferentes) e o lançamento correto daquela consulta é perdido.

Reproduzi o cenário: um item aparecia como "despesa" E como "pagamento",
enquanto o Payment verdadeiro sumia do extrato.

## Correção
- Cada consulta agora lê **exclusivamente a sua entidade**
  (`QueryResponse[entidade]`)
- Trava adicional por chave `entidade:Id` — o mesmo registro não entra
  duas vezes mesmo que algo inesperado volte da API

## Rastreabilidade (novo)
Cada linha do extrato agora mostra o identificador do QuickBooks ao lado
da descrição (ex.: `#invoice:1234`). Assim, se algum lançamento parecer
estranho, dá para localizar exatamente aquele registro no QuickBooks e
conferir — em vez de ficar no "não achei lá".

## Arquivos
- api/financeiro.js · public/index.html
