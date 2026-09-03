# Atlantyx OS · v1.41 — Segunda dupla contagem: Payment + Deposit

## O que o print mostrou
Em 27/08, CPFL R$ 43.280,98 aparecendo **duas vezes** como pagamento,
somando duas vezes no saldo acumulado.

## Causa
No QuickBooks, receber de um cliente gera um **Payment**. Quando esse
pagamento é depositado no banco, gera um **Deposit** que contém o
Payment. São dois registros da MESMA entrada de dinheiro — e o extrato
contava os dois.

É a mesma família do bug da v1.38 (invoice + pagamento), agora entre
pagamento e depósito.

## Correção
Um Deposit passa a entrar apenas pelo valor das linhas **sem vínculo**
(LinkedTxn) com um Payment — porque as vinculadas já foram contadas no
próprio Payment. Se o depósito era só o agrupamento de pagamentos já
contados, ele é ignorado por completo.

**Depósito misto tratado corretamente:** se um depósito junta R$ 21.136
de um pagamento já contado + R$ 8.863 de dinheiro novo, só os R$ 8.863
entram. Testado.

No detalhe do lançamento (🔎) aparece a nota explicando quando um valor
foi ajustado, e o valor original do documento.

## Bug meu, corrigido: versão travada em v1.35
As substituições do número de versão pararam de funcionar a partir da
v1.36 — o rodapé continuou mostrando "ATX-v1.35" enquanto o código
avançava até a v1.40. Por isso seu print parecia estar numa versão
antiga. Corrigido: agora mostra **ATX-v1.41**.

Isso também significa que as correções v1.36–v1.40 provavelmente JÁ
estavam no ar no seu ambiente — o número é que enganava.

## Validação
Cenário do print: R$ 137.698,65 (com duplicação) → R$ 73.280,98
(correto). Diferença de R$ 64.417,67 = exatamente os dois pagamentos
duplicados.

## Arquivos
- api/financeiro.js · public/index.html
