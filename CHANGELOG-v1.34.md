# Atlantyx OS · v1.34 — Conciliação com o extrato como fallback

## Como funciona agora (duas etapas)
Ao clicar em **🏦 Verificar pagamento (fatura + extrato)**:

**Etapa 1 — fatura baixada** (como antes): procura no QuickBooks a
fatura com saldo zero, casando por cliente + valor.

**Etapa 2 — extrato** (novo): para quem NÃO foi encontrado na etapa 1,
busca o recebimento de verdade nos últimos 120 dias:
- **Payment** — recebimento registrado no QuickBooks, mesmo sem a fatura
  ter sido baixada
- **Deposit** — depósito em conta (o dinheiro que entrou de fato), casando
  pela linha do cliente ou pelo valor

Ou seja: se o dinheiro caiu mas o financeiro ainda não baixou a fatura, o
Atlantyx enxerga assim mesmo.

## Você sabe de onde veio cada confirmação
- Na tabela de empresas: **✓ verde** = fatura baixada · **🏦 dourado** =
  achado no extrato (fatura pendente de baixa no QuickBooks)
- No Log: linha por empresa com data, valor e via
- Aviso específico quando algo é achado só no extrato, lembrando de
  regularizar a baixa no QuickBooks para a contabilidade fechar

## Tolerância de valor configurável
Antes fixa em 2%. Agora ajustável pela env `FAT_TOLERANCIA_PAGTO_PCT`
(padrão 2). Útil quando há retenção de imposto maior que isso — nesse
caso o valor recebido é menor que a nota e o casamento falharia.
Quando nada é encontrado, o Log avisa qual tolerância foi usada e sugere
a confirmação manual pelo ✎.

## O que NÃO mudou (de propósito)
Continua sendo acionado por você, não é automático. Se quiser um cron
diário rodando em todos os termos na fase de pagamento, é rápido de
acrescentar — mas preferi não ligar sem você pedir.

## Validação (4 cenários)
- Empresa com fatura baixada → confirmada na etapa 1 ✓
- Empresa com Payment mas fatura não baixada → achada no extrato ✓
- Empresa com depósito em conta → achada no extrato ✓
- Empresa sem nenhum registro → **segue pendente** (não inventou
  pagamento) ✓
Resumo gerado: "3 pagamento(s) confirmado(s) · 2 encontrado(s) no extrato
(fatura ainda não baixada no QuickBooks)".

## Arquivos
- api/faturamento.js · public/index.html
