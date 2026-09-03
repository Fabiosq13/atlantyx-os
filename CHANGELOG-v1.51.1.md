# Atlantyx OS · v1.51.1 — Erro meu no número da versão + diagnóstico do saldo

## 1. Erro meu: versão travada em v1.46.1
Desde a v1.47 minhas substituições do número de versão falhavam em
silêncio. Eu trocava "ATX-v1.47" por "ATX-v1.48", mas o texto real no
arquivo era "ATX-v1.46.1" — nada era substituído, e eu não conferia.

Você recebeu os arquivos corretos (o backend estava atualizado, como o
próprio print prova ao exibir "Pagamento de conta" e "Transferência entre
contas", que só existem da v1.48 em diante). Era só o rótulo mentindo.

Corrigido com substituição por padrão (funciona qualquer que seja a
versão anterior) + uma verificação que falha o empacotamento se o número
não bater. Agora mostra **ATX-v1.51**.

## 2. O saldo: o Atlantyx está certo, o QuickBooks é que está errado
O subtítulo do seu print diz: *"banco hoje: R$ -326.754,24"* — o mesmo
valor do calculado. E o painel amarelo de divergência **não apareceu**.

Isso significa que a conta fechou: o Atlantyx está refletindo fielmente
o saldo que o QuickBooks reporta para as contas bancárias. **O número
errado está na base contábil.**

Faz sentido com tudo que encontramos:
- duplicidades reais (você já apagou uma; podem existir outras)
- possível conta de cartão classificada como "Bank" (derruba o saldo)
- possível saldo de abertura não lançado numa conta importada

## Como resolver, na ordem
1. **🔍 Saldo de abertura** (Fluxo Futuro) — mostra conta a conta e
   aponta classificação errada
2. **⚠ Procurar duplicados** (últimos 90 dias) — lista lançamentos
   repetidos com os IDs para corrigir no QuickBooks
3. Compare o saldo do QuickBooks com o extrato real do Itaú. A diferença
   é exatamente o que precisa ser corrigido lá

Enquanto o QuickBooks estiver com o saldo errado, nenhuma tela do
Atlantyx vai mostrar o número certo — ele é a fonte.

## Arquivos
- public/index.html (versão) · api/financeiro.js (v1.51 já aplicada)
