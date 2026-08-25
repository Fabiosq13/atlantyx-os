# Atlantyx OS · v1.24 — Relatório diário de pagamentos por e-mail

## O que faz
Todo dia às 8h (horário de Brasília) o sistema envia automaticamente um
e-mail para **financeiro@atlanteam.com.br** e **contato@atlanteam.com.br**,
saindo de **atlanteambr@gmail.com**, com:

1. **Pagamentos do dia** — detalhados: vencimento, descrição, fornecedor,
   categoria, valor e status, com total do dia
2. **Pendentes do mês** logo abaixo — tudo que vence no mês corrente e
   ainda não foi pago, em ordem de vencimento, com total
3. **Destaque de atrasos** — o que já venceu e não foi pago aparece em
   vermelho, com um aviso no topo da seção e um KPI próprio

Três indicadores no topo: A Pagar Hoje · Pendente no Mês · Em Atraso.

## Fontes dos dados (as duas juntas)
- Despesas programadas cadastradas no Atlantyx
- Contas a pagar (Bills em aberto) do **QuickBooks — todos os
  fornecedores**, marcadas com "(QB)" na listagem
Se o QuickBooks estiver indisponível na hora do envio, o e-mail sai
mesmo assim com um aviso de que a lista pode estar incompleta (melhor um
relatório parcial e sinalizado do que nenhum).

## Envio via Gmail (atlanteambr@gmail.com) — requer 1 passo
Para sair DE atlanteambr@gmail.com, o envio usa o SMTP do Gmail com a
mesma senha de app que já configuramos para ler as notas fiscais:
- **`npm i nodemailer`** no repositório (commit do package.json) + Redeploy
- Reutiliza `EMAIL_IMAP_PASS` (ou `EMAIL_SMTP_PASS`, se preferir separar)
Sem o nodemailer instalado, o sistema **não falha**: envia pelo Resend
como reserva (mas aí o remetente não é o Gmail) e avisa isso na resposta.

## Botão de prévia e envio manual (recomendo testar antes)
Dashboard Financeiro → **📧 Relatório de Pagamentos**: mostra exatamente
o e-mail que vai sair, com dois botões — "Enviar agora" (destinatários
oficiais) e "Enviar só para mim (teste)", para você conferir na sua caixa
antes de confiar no automático.

## Configurável
`RELATORIO_PAGAMENTOS_PARA` (env) permite mudar os destinatários sem
mexer no código. O horário fica no `vercel.json` (`0 11 * * *` UTC = 8h
de Brasília).

## Bug encontrado e corrigido durante o desenvolvimento
Ao renderizar o e-mail para conferência visual, vi que os acentos saíam
corrompidos ("MÊS" virava "MÃŠS", "DESCRIÇÃO" virava "DESCRIÃ‡ÃƒO") —
faltava a declaração de charset no HTML, e isso apareceria igual na caixa
de entrada. Corrigido com `<meta charset="UTF-8">` e estrutura HTML
completa. Reconferido visualmente: acentuação correta.

## Arquivos
- api/financeiro.js (relatório, envio Gmail SMTP, rota de cron)
- vercel.json (cron diário)
- public/index.html (botão de prévia e envio manual)
