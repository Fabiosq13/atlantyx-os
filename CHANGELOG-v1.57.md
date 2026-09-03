# Atlantyx OS · v1.57 — Causa raiz do saldo errado, encontrada nos seus prints

## O que os prints revelaram
Razão da conta Itaú no QuickBooks:
- **31/07/2026: R$ 91.913,38** ← saldo de abertura de 01/08
- 05/08: R$ 91.615,26
- 25/08: R$ 83.026,48
- 31/08: R$ 7.398,55

Mas o **CurrentBalance** que a API devolve para essa conta é
**-R$ 137.644,04** — R$ 145.042,59 abaixo do razão em 31/08.

## A causa raiz
**O CurrentBalance inclui lançamentos com DATA FUTURA.** O razão do
período, não.

E o Atlantyx calculava o saldo inicial **retroagindo a partir do
CurrentBalance** — arrastando esse excesso para trás. Por isso chegava a
-R$ 129.502,67 em vez dos R$ 91.913,38 corretos. Erro de R$ 221.416,05.

Isso explica de uma vez todas as estranhezas que você vinha apontando:
saldo inicial absurdo, valores que não batiam com o banco, projeções
distorcidas.

## A correção
A fonte do saldo inicial passa a ser o **Balanço Patrimonial na data**
(fechamento do dia anterior ao período) — exatamente o número que o
QuickBooks usa como saldo de abertura no razão. Sem retroagir, sem
cálculo intermediário, sem contaminação de lançamentos futuros.

O retroagir do CurrentBalance vira apenas reserva, caso o Balanço não
responda.

## Conferência
Simulei com os lançamentos do seu print, partindo dos R$ 91.913,38:
- 02/08 → 91.614,38 ✓ (print mostra 91.614,38)
- 05/08 → 91.615,26 ✓ (print mostra 91.615,26)
- 05/08 → 89.793,33 ✓ (print mostra 89.793,33)
- 05/08 → 85.595,09 ✓ (print mostra 85.595,09)
- 05/08 → 85.327,41 ✓ (print mostra 85.327,41)

Bate linha a linha com o QuickBooks.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.57)
