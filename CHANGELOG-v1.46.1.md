# Atlantyx OS · v1.46.1 — Corrigindo a correção do saldo de abertura

## O que eu errei na v1.46
Para resolver o saldo que não acumulava, fiz o sistema **reconstruir o
saldo somando todo o histórico** de entradas menos saídas desde o começo.
Isso produziu os R$ 11,4 milhões — um número sem relação com a realidade.

Três motivos pelos quais aquela abordagem estava errada:
1. **Acumula toda duplicidade da base** — as 3 linhas de "CAP PIC 33/60"
   e as 2 de "CPFL" do seu print entram todas na conta
2. **Transferências entre contas** aparecem como entrada numa conta e
   saída em outra; se uma ponta não é capturada, vira dinheiro do nada
3. **Saldos de abertura das próprias contas** do QuickBooks entram como
   entrada, sendo contados duas vezes

## Como ficou agora (fonte correta)
O QuickBooks **já mantém o saldo real** de cada conta bancária. Então:

**saldo no início do período = saldo real de hoje (QuickBooks) − o que
movimentou entre o início do período e hoje**

É uma conta pequena, verificável, e parte de um número que você pode
conferir contra o extrato do banco. Sem QuickBooks conectado, usa o saldo
cadastrado manualmente (sem tentar reconstruir nada) e avisa a limitação.

## Bônus: linhas repetidas ficam marcadas
Toda linha que aparece mais de uma vez com **mesma data + descrição +
valor** agora recebe a marca vermelha "⚠ 3x repetido" na tabela. As três
linhas de CAP PIC 33/60 do seu print seriam sinalizadas na hora.

Combinado com o botão 🔎 (rastrear no QuickBooks) e o ⚠ Procurar
duplicados (v1.45), fica fácil identificar o que precisa ser limpo na
contabilidade.

## Recomendação
Rode o **⚠ Procurar duplicados** nos últimos 90 dias antes de conferir os
saldos. Enquanto houver lançamento repetido na base, qualquer número
calculado a partir dela vai carregar o erro.

## Arquivos
- api/financeiro.js · public/index.html
