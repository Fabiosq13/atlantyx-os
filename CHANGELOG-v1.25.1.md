# Atlantyx OS · v1.25.1 — Diagnóstico de envio de e-mail

## Por que essa versão
O envio do relatório não chegou e o sistema não dizia o motivo — só
"Erro" genérico, ou pior: dizia "enviado" mesmo quando o SMTP tinha
falhado silenciosamente. Sem saber ONDE travou, qualquer tentativa de
correção seria chute.

## Novo: botão 🔍 Diagnosticar envio
Em Dashboard Financeiro → 📧 Relatório de Pagamentos → 🔍 Diagnosticar
envio. Ele checa e mostra, item por item:
- ✓/✗ Pacote nodemailer instalado (se o package.json foi aplicado mesmo)
- ✓/✗ Senha de app configurada — **e avisa se ela contém espaços** (o
  Google mostra a senha como "abcd efgh ijkl mnop" e muita gente cola com
  os espaços, o que faz a autenticação falhar)
- ✓/✗ Autenticação real no SMTP do Gmail (testa de verdade, não presume)
- Configuração atual: remetente, destinatários, Resend de reserva
- Opcionalmente envia um e-mail de teste para o endereço que você digitar
  e mostra os destinatários **aceitos pelo servidor**

## Correções que tornam o erro visível
- O envio agora registra uma **trilha de tentativas** (nodemailer ok?
  senha ok? SMTP autenticou? caiu para o Resend?) e devolve isso no erro
- Erro do Resend agora mostra o **motivo real** (antes era só "HTTP 4xx",
  inútil) — inclusive o caso comum de domínio não verificado
- SMTP faz `verify()` antes de enviar: credencial errada falha rápido e
  com mensagem clara, em vez de erro genérico no meio do envio
- Dica automática conforme o erro (ex.: senha de app inválida → link e
  instrução para gerar outra)

## Suspeitas mais prováveis no seu caso (o diagnóstico vai confirmar)
1. **Senha de app com espaços** ou não configurada em EMAIL_IMAP_PASS
2. **package.json commitado mas sem novo deploy** — o nodemailer só existe
   depois de um build novo
3. **E-mail foi para a pasta spam** — se o diagnóstico disser "aceito pelo
   servidor" e mesmo assim não aparecer, é isso: procure no spam e marque
   como "não é spam"

## Arquivos
- api/financeiro.js · public/index.html
