# Atlantyx OS · v1.50 — "Saldo de hoje" era um número calculado, não o saldo do banco

## O que aquela data significava
"Saldo de hoje: R$ -326.754,24 — realizado até 27/08/2026"

- **27/08** é simplesmente a data de hoje (não o fim do filtro, 31/08).
  O trecho "realizado" do extrato sempre vai do início do período até
  hoje; o que vem depois é projeção.
- O número **não era o saldo do banco**. Era: saldo estimado no início do
  período + tudo que entrou/saiu dentro do filtro.

## Por que isso é um problema
Esse saldo calculado **herda qualquer erro do caminho** — lançamento
faltando, duplicidade, saldo inicial impreciso — mas se apresentava com o
rótulo "Saldo de hoje", dando a impressão de ser o saldo real da conta.
Foi exatamente o que te fez desconfiar, com razão.

## O que mudou
Agora a tela mostra **os dois números lado a lado**:
- O calculado, com o subtítulo explicando a composição: *"calculado:
  saldo de 01/08 + movimento até 27/08"*
- **O saldo real das contas no QuickBooks** ("banco hoje: R$ X")

Se os dois divergirem em mais de R$ 1, aparece um painel amarelo com a
diferença exata, a lista das contas, e dois botões de ação: **Procurar
duplicados** e **Conferir com o banco**.

## Como usar isso
A diferença entre os dois números é o seu termômetro de qualidade dos
dados. Se for grande, há lançamento faltando ou duplicado — e os botões
levam direto às ferramentas de diagnóstico. Quando os dois baterem, os
números da tela são confiáveis.

## Arquivos
- api/financeiro.js · public/index.html
