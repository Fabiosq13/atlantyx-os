# Atlantyx OS · v1.37 — Fluxo de Caixa Futuro: 3 bugs corrigidos

## Você tinha razão: os valores estavam errados

### Bug 1 — Faturas vencidas sumiam sem aviso
A consulta pegava TODA fatura em aberto e jogava cada uma no mês do
vencimento. Uma fatura vencida em 2024 ia para o "bucket 2024-05" — que
não existe no horizonte de 12 meses. Resultado: **o valor desaparecia da
tela silenciosamente**, e você não tinha como saber que estava faltando.

Agora: faturas vencidas viram um **alerta explícito** ("R$ X em faturas
já vencidas não entram na projeção") em vez de sumir. Elas não entram na
projeção porque o vencimento já passou — mas você fica sabendo que
existem.

### Bug 2 — Faturas além do horizonte criavam meses fantasma
Uma fatura com vencimento em 2028 criava um bucket "2028-01" que nunca
era exibido. Mesmo problema: dinheiro sumindo da conta sem rastro.
Agora vira alerta próprio.

### Bug 3 — Incoerência de período no primeiro mês (o mais distorcivo)
As **entradas** do mês corrente vinham do mês inteiro, mas as **saídas**
só contavam a partir de HOJE. Ou seja: o mês atual mostrava a receita
cheia contra apenas parte das despesas — fazendo o primeiro mês parecer
bem melhor do que era, e contaminando todo o saldo acumulado dos 12 meses
seguintes.

Agora ambos partem do dia 1 do mês corrente (o que já foi pago é
excluído pelo status).

## Transparência (novo)
Painel "De onde vêm os números" abaixo da tabela, mostrando:
- Quanto das entradas vem de faturas dentro do horizonte
- Quantas despesas programadas compõem as saídas
- **O que ficou de fora** (vencido / além do horizonte)
- A origem do saldo inicial

## Validação
Cenário com 5 faturas: R$ 105.000 vencidos corretamente separados,
R$ 90.000 fora do horizonte sinalizados, R$ 80.000 corretamente
projetados nos meses certos. Alertas e painel aparecendo na tela.

## Arquivos
- api/financeiro.js · public/index.html
