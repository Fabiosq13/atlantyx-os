# Atlantyx OS · v1.38 — Receita dobrada, orçamento zerado e fluxo do mês corrente

## 1. A duplicidade dos prints: era RECEITA DOBRADA (o mais grave)
As linhas repetidas de CPFL não eram duplicação de registro — eram a
**nota fiscal (invoice)** e o **recebimento (pagamento)** da mesma venda,
ambos contados como entrada de caixa.

Emitir uma nota de R$ 39.618 e receber esse valor somava R$ 79.236 no
saldo. Conferido no teste: a diferença era exatamente o valor da nota.

**Correção:** este extrato é de CAIXA. A emissão da nota passa a aparecer
como **referência** (linha atenuada, com a marca "📄 emissão — não move o
caixa") e só o recebimento movimenta o saldo. A nota continua visível,
porque você precisa saber que foi emitida — mas não conta duas vezes.

## 2. Orçamento Anual: realizado estava zerado/furado (você suspeitou certo)
O código só reconhecia colunas do relatório no formato "2026-08". O
QuickBooks devolve **"Aug 2026"**, **"Ago 2026"** ou **"Aug 1-31, 2026"** —
nenhum casava, então **nenhum mês era reconhecido** e o realizado ficava
zerado ou furado.

Corrigido com um interpretador que entende ISO, inglês, português,
formato de período e, em último caso, a posição da coluna.

## 3. Fluxo Futuro: mês corrente agora soma realizado + previsto
Como você pediu:
- **Entradas do mês corrente** = o que já foi recebido no mês + o que
  ainda está a receber (antes só contava o "a receber", fazendo o mês
  parecer pior do que é)
- **Saídas do mês corrente** = o que já foi pago + as despesas
  programadas não pagas
- Despesas futuras não pagas ('prevista' e 'lancada') já entravam desde a
  v1.21.1; confirmado que continuam entrando

## 4. Fluxo Detalhado: botão de detalhe em cada linha
Botão 🔎 em toda linha abre o detalhe completo: data, tipo, categoria,
conta, origem, **identificação no QuickBooks**, valor total do documento
vs saldo em aberto, se está vencida, saldo acumulado e observação. Inclui
uma orientação de como localizar aquele lançamento no QuickBooks.

## Validação
Dupla contagem: R$ 202.429,42 → R$ 162.811,42 (diferença = exatamente a
nota). Parser de mês: 6 formatos testados. Linha de referência atenuada
e sem sinal de entrada; modal de detalhe com id do QB.

## Arquivos
- api/financeiro.js · public/index.html
