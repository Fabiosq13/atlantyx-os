# Atlantyx OS · v1.54 — Excluir lançamento no QuickBooks + análise do saldo

## 1. Excluir direto no QuickBooks (novo)
No detalhe de qualquer lançamento (🔎) há agora **🗑 Excluir este
lançamento no QuickBooks**.

Como é uma ação que mexe na sua contabilidade e **não pode ser desfeita
pelo Atlantyx**, são duas etapas:
1. **Prévia** — mostra exatamente o que será apagado (tipo, id, data,
   valor, conta, contraparte, data de criação, memo) e **avisa se o
   lançamento está vinculado a outro** (excluir um pagamento vinculado
   reabre a fatura correspondente)
2. **Confirmação digitada** — é preciso escrever "EXCLUIR" para o botão
   funcionar

Funciona com todos os tipos: Purchase, Payment, BillPayment, Deposit,
Transfer, JournalEntry, Invoice e os demais. Toda exclusão fica
registrada no Log do sistema.

## 2. Sobre o saldo ainda divergente — dois achados nos seus prints

### Achado A: contas que não são bancos estão como "Bank"
No seu combo aparecem, classificadas como Bank/Checking:
- **Cash and cash equivalents**
- **Management compensation**
- **ESTORNO**

Esses nomes são de contas de resultado/patrimônio, não de conta
bancária. Hoje estão zeradas (não afetam o total), mas se receberem
lançamento vão distorcer o saldo de caixa. Vale reclassificar no
QuickBooks.

### Achado B: o CurrentBalance diverge do razão
O Plano de Contas mostrava saldo **positivo** (R$ 91.615,26 em 05/08),
enquanto o CurrentBalance da conta "Banco Itau business" está em
**-R$ 137.644,04**.

Duas explicações possíveis, e vale checar qual é:
1. O print do Plano de Contas era do razão de **outra conta** — a coluna
   "itau" naquela tela é o campo de fornecedor/cliente do lançamento, não
   necessariamente a conta bancária
2. A conta tem **saldo de abertura não lançado**: os pagamentos entraram,
   o saldo inicial não — o que joga o CurrentBalance para o negativo

**Como confirmar:** no QuickBooks, abra o Plano de Contas (a lista de
contas, não o razão) e veja o saldo que aparece ao lado de "Banco Itau
business". Se lá também estiver -R$ 137.644,04, a conta está mesmo
negativa na contabilidade e falta o saldo de abertura. Se estiver
positivo, me avise — aí é divergência entre razão e CurrentBalance, e
mudo a fonte que o sistema usa.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.54)
