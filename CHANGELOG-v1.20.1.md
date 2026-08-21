# Atlantyx OS · v1.20.1 — Marco com data legada e mensagem de erro precisa

## O que o print mostrou
O marco "PROJETO TRANSMISSAO 2026..." tinha Descrição e Valor preenchidos,
mas o campo "Data de Entrega" estava vazio (mudo, "dd/mm/aaaa") — um dado
legado (provavelmente cadastrado antes da validação atual, ou vindo de
uma importação sem data de solicitação). Ao tentar salvar, a mensagem
genérica "descrição, data e valor obrigatórios" dava a entender que os
TRÊS campos estavam faltando — mas só a data estava.

## Fixes
1. Ao ABRIR a edição de um marco sem data de entrega, o campo agora é
   preenchido automaticamente com a data de pagamento (se houver) ou a
   data de hoje — em vez de ficar mudo — com um aviso amarelo "⚠ este
   marco não tinha data cadastrada — confira/ajuste antes de salvar".
   Você ainda pode/deve corrigir para a data real antes de salvar.
2. A mensagem de erro ao salvar agora diz EXATAMENTE qual campo falta
   ("Preencha: Data de Entrega", por exemplo) em vez da lista genérica
   dos três — e o campo em falta ganha borda vermelha e recebe foco
   automaticamente.

## Validação (JSDOM, cenário exato do print)
Marco com data_entrega=null e data_pagamento='2026-07-17' → campo Data
de Entrega abre preenchido com 17/07/2026 (não mais vazio) + aviso visível;
descrição e valor preservados. Erro de campo único → mensagem cita só o
campo que falta. 0 erros JS.

## Arquivo
- public/index.html
