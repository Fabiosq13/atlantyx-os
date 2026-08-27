# Atlantyx OS · v1.26.2 — Erro de envio de e-mail visível na tela

## Por quê
O F12 mostrava só "500 (Internal Server Error)" — que não diz nada. O
servidor JÁ estava mandando o motivo real no corpo da resposta, mas o
frontend descartava essa informação e exibia um toast genérico que some
em 3 segundos.

## O que mudou
- `finApi` agora preserva o **motivo**, a **dica de correção** e a
  **trilha do envio** que o backend devolve (antes se perdiam)
- Falha no envio abre um **painel na tela** com: motivo exato, o que
  fazer para corrigir, a trilha (nodemailer instalado? senha
  configurada? SMTP autenticou? caiu para o Resend?) e um botão para
  rodar o diagnóstico completo
- Tudo também vai para o Log do sistema

Você não precisa mais do F12 para descobrir o que aconteceu.

## Cenários testados (mensagens conferidas uma a uma)
1. Sem nodemailer e sem senha → diz exatamente isso + como resolver
2. Senha com espaços → a trilha mostra "configurada (19 caracteres)",
   revelando o problema (senha de app real tem 16)
3. Resend recusando → mostra o código HTTP e o motivo real

## Arquivo
- public/index.html
