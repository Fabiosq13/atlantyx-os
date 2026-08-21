# Atlantyx OS · v1.18 — Lançamento automático no QuickBooks (Contas a Receber)

## O que foi pedido
No momento em que uma nota fiscal é identificada/conciliada com o termo,
já lançar a fatura correspondente no QuickBooks (Contas a Receber).

## Como funciona
Nova coluna "CONTAS A RECEBER (QB)" na tabela de empresas do termo:
- Nota ainda pendente → "—"
- Nota confirmada (por e-mail ou manual) e AINDA não lançada → botão
  "📤 Lançar" aparece na linha daquela empresa
- Lançada → "✅ Fatura #<número>"

Dois jeitos de lançar:
1. Por empresa: botão 📤 Lançar na linha da tabela
2. Em lote: botão "📤 Lançar notas no QuickBooks (Contas a Receber)" no
   topo do termo (aparece quando há pelo menos 1 nota confirmada ainda
   não lançada) — lança todas de uma vez, reportando quantas deram certo
   e quantas deram erro

## O que o lançamento faz no QuickBooks
Cria uma Invoice (fatura de venda / contas a receber):
- Cliente: encontrado pelo nome da empresa do rateio (busca por
  correspondência no cadastro de Clientes do QB)
- Valor: o valor da nota fiscal confirmada (ou da parcela, se a nota não
  tiver valor próprio registrado)
- Nº do documento: o número da nota fiscal (se houver conflito de
  duplicidade no QB, tenta de novo sem o número)
- Descrição/observação: projeto, período e nº do termo, para rastreio
- Linha de serviço: usa um Item de serviço já cadastrado no QB (o
  primeiro encontrado, ou o definido em QB_DEFAULT_ITEM_NAME)

## Proteções
- Cliente não encontrado no QB → erro claro pedindo para cadastrar o
  cliente antes (não cria cliente novo automaticamente — decisão
  deliberada, para não gerar cadastros duplicados/incompletos)
- Já lançado → não duplica (idempotente por empresa)
- Erros ficam registrados por empresa e aparecem na própria linha da
  tabela (⚠ com a mensagem)

## Automático, se você quiser (opt-in, desligado por padrão)
Env FAT_AUTO_LANCAR_QB=true no Vercel: ao confirmar uma nota pela
verificação de e-mail, já lança automaticamente no QB, sem precisar
clicar. Recomendo ligar só depois de testar o lançamento manual algumas
vezes.

## Fix encontrado no caminho
Vários botões do Kanban de Faturamento atualizavam o painel de detalhe
sem "await" — a tela podia mostrar dado desatualizado por um instante
(ex.: marcar NF manualmente não fazia o botão "Lançar no QB" aparecer até
reabrir o termo). Corrigido em todos os pontos (verificar e-mail, marcar
NF, marcar pago, lançar QB, lançar todas, verificar pagamento, avançar,
aprovar).

## Setup (opcional)
QB_DEFAULT_ITEM_NAME = nome exato de um Item de serviço no QuickBooks,
caso queira controlar qual item é usado na linha da fatura (sem isso, o
sistema usa o primeiro item de serviço que encontrar).

## Validação
Fluxo completo em JSDOM: nota marcada manualmente → botão Lançar aparece
→ lançamento → coluna mostra "Fatura #INV-999". Árvore DOM: 72 páginas,
0 aninhadas. 0 erros JS.

## Arquivos
- api/faturamento.js (funções de Invoice QB + 2 novas actions)
- public/index.html (coluna QB, botões, fix de awaits)
