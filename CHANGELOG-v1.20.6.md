# Atlantyx OS · v1.20.6 — 3 correções/pedidos: recorrência opcional + lançar despesa no QB, marcos, contratos

## 1. Recorrência opcional no cadastro de despesas
Agenda de Despesas → Nova Despesa Programada: o campo Recorrência virou
um checkbox "Recorrente?" (desmarcado por padrão). Desmarcado, a despesa
é cadastrada como única (não pede pra escolher mensal/trimestral/anual).
Marcado, aparece o seletor de recorrência + o campo "Fim (opcional)".

## 2. Lançar despesa no QuickBooks (Contas a Pagar) — com atenção às recorrentes
Clicar num dia com despesas no calendário agora abre um MODAL de verdade
(antes era um alert() sem ação nenhuma), com por despesa:
- ✓ Marcar como paga
- 📤 Lançar no QuickBooks — cria a conta a pagar (Bill) lá, casando o
  Fornecedor cadastrado na despesa com um Vendor do QuickBooks e usando
  uma conta de despesa (Expense) — a primeira encontrada, ou pela
  categoria, ou definida em QB_DEFAULT_EXPENSE_ACCOUNT_NAME
**Atenção com despesas recorrentes:** cada OCORRÊNCIA (cada mês) tem seu
próprio registro e seu próprio vínculo com o QuickBooks — lançar a de
agosto não lança nem duplica a de setembro; relançar a mesma ocorrência
não cria Bill duplicada (idempotente, como já fizemos no Contas a
Receber do Kanban de Faturamento).
Se o fornecedor não estiver preenchido na despesa ou não existir no
QuickBooks, a mensagem de erro diz exatamente o que fazer.

## 3. FIX: campos de data errados na tela de Contratos
Achei a causa: `contratoList` (backend) devolvia as datas sem normalizar
— se o driver retornasse com timestamp completo (ex.:
"2026-08-20T00:00:00.000Z"), a tela (que faz `data.split('-')
.reverse().join('/')`) quebrava e mostrava algo como
"20T00:00:00.000Z/08/2026". Corrigido: agora as datas saem sempre em
'YYYY-MM-DD' puro do backend, como em todo o resto do sistema. Reproduzi
o bug isoladamente e confirmei a correção exata.

## 4. Kanban Marcos de Projeto: datas não gravando
Revisei toda a cadeia (formulário → payload → INSERT/UPDATE → listagem →
tabela) e não encontrei um defeito estrutural — a query e o mapeamento de
colunas estavam corretos. Para não deixar isso no "talvez": adicionei uma
VERIFICAÇÃO DE GRAVAÇÃO — depois de salvar, o backend relê a linha do
banco e confere se a data bateu com o que foi enviado; se não bater,
agora dá um ERRO CLARO na hora (em vez de simplesmente não aparecer). A
tela também passou a confirmar a data que realmente ficou gravada
("Marco salvo — entrega em 25/08/2026"), então qualquer divergência fica
visível imediatamente. Se o problema persistir depois deste deploy, essa
mensagem de erro específica vai aparecer e aí sim tenho o que preciso
para localizar a causa exata — me manda o texto do erro.

## Validação (JSDOM)
- Contratos: com data normalizada pelo backend, tela mostra 20/08/2026 e
  01/09/2026 corretamente (sem "T00:00").
- Despesas: checkbox de recorrência funcionando (select some/aparece);
  despesa sem marcar recorrente salva como 'unica'.
- Modal do dia: mostra a despesa, os dois botões de ação, e
  desp_lancar_qb é chamado corretamente.
- Marco: toast confirma a data devolvida pelo backend após o round-trip
  de verificação.
Árvore DOM: 73 páginas, 0 aninhadas. 0 erros JS.

## Arquivos
- api/financeiro.js (contratoList fix, despLancarQb + helpers, marcoSave
  com verificação de gravação, action desp_lancar_qb)
- public/index.html (checkbox recorrência, modal do dia, toast de
  confirmação do marco)
