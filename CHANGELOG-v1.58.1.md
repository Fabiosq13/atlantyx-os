# Atlantyx OS · v1.58.1 — A conferência ignorava o filtro de conta (e de data)

## O que você viu
Com "Banco Itau business" selecionado no filtro, o modal de conferência
mostrava o saldo de **todas** as contas (-R$ 326.754,24) e listava as 6.

## Três bugs corrigidos

### 1. O filtro de conta não chegava à conferência
A função nem recebia o parâmetro. Agora respeita a conta selecionada:
saldo, lançamentos e a lista de contas passam a ser só da conta filtrada,
e o título do modal mostra qual conta está sendo conferida.

### 2. O filtro de data também era ignorado
O modal procurava os campos pelos ids `fd_de` e `fd_ate`, mas os ids
reais são `fd_dataInicio` e `fd_dataFim`. Como não encontrava, mandava
`null` e o backend usava o mês corrente — não o período que você escolheu.

### 3. Casamento errado no Balanço Patrimonial
O saldo inicial apareceu como -R$ 8.440,37 em vez dos R$ 91.913,38
esperados. A busca pelo nome da conta usava "includes", então podia casar
com uma linha de **subtotal** que contém o nome da conta.

Agora a ordem de preferência é: **id da conta** (mais confiável) → nome
exato → aproximação. Como o Balanço devolve o id em cada linha, o
casamento passa a ser preciso.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.58.1)
