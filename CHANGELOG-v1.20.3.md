# Atlantyx OS · v1.20.3 — Totais em valor por etapa no Kanban de Faturamento

## O que mudou
No topo do Kanban de Faturamento, uma faixa com 6 cartões:
Elaboração · Aprovação · Emissão de NF · Envio de NF · Pagamento ·
**Total geral** (destacado em dourado) — cada um com o valor somado (R$)
e a quantidade de termos naquela etapa. Atualiza junto com o quadro
(botão Atualizar ou toda vez que um termo muda de fase).

## Backend
termo_list agora devolve totais_por_coluna (qtd + valor por etapa) e
total_geral, calculados a partir do valor_total_termo de cada termo.

## Validação
Cenário simulado (3 termos em 3 etapas diferentes): cada cartão mostra o
valor certo por etapa e o total geral bate com a soma de tudo. Árvore
DOM: 73 páginas, 0 aninhadas. 0 erros JS.

## Arquivos
- api/faturamento.js
- public/index.html
