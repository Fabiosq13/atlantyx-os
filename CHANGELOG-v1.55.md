# Atlantyx OS · v1.55 — Os três saldos, e por que eles diferem

## O que o seu print revelou
A tela de contas do QuickBooks mostra **duas colunas**:
- **-R$ 137.644,04** → saldo CONTÁBIL (o que a API expõe, o que o
  Atlantyx usa)
- **R$ 177.708,34** → saldo do BANCO (o que o Itaú informa)

Diferença: **R$ 315.352,38**

Essa diferença é o valor das transações que o **banco já processou mas
que ainda não viraram lançamento contábil** no QuickBooks. É conciliação
pendente — não é erro do Atlantyx nem do QuickBooks.

**Importante:** o saldo do banco NÃO vem pela API do QuickBooks. Só o
contábil vem. Por isso o Atlantyx mostra negativo enquanto o banco tem
dinheiro: ele reflete a contabilidade, não o extrato.

## Novo: 📜 Razão da conta
Botão no Fluxo Detalhado. Traz o razão contábil (General Ledger) da
conta selecionada no período, com:
- **Saldo inicial do período** (era exatamente o que você queria saber
  sobre 01/08)
- Movimento e quantidade de lançamentos
- **Saldo final do razão**
- Saldo contábil de hoje (CurrentBalance)
- A lista de lançamentos do razão, linha a linha com saldo acumulado

E compara com o saldo que o Atlantyx está mostrando, sinalizando se
houver diferença.

Também explica na tela os três saldos que existem (contábil, razão,
banco) e por que eles não precisam ser iguais.

## Sobre comparar com o extrato bruto
Como expliquei, a API do QuickBooks **não expõe** o extrato importado nem
a fila "Para revisão" — não há endpoint para isso. O razão é o mais
próximo que dá para fazer automaticamente.

Se quiser a conciliação completa contra o banco, o caminho é você
exportar o extrato (CSV/OFX) e o Atlantyx casar linha a linha. Posso
implementar isso a seguir se fizer sentido.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.55)
