# Atlantyx OS · v1.21 — Auditorias + Módulo de RH + Gerentes IA (Marketing, RH)

## PARTE 1 — Auditorias solicitadas

### ✅ Despesas de TODOS os fornecedores do QuickBooks
Confirmado no código: tanto a Agenda de Despesas quanto o Dashboard/KPIs
buscam Contas a Pagar SEM filtro de fornecedor — a query de Bills não
tem cláusula de Vendor, e o relatório AgedPayables usado nos KPIs é
sempre da empresa inteira. Cobre todos os fornecedores.
Nuance: isso pega Bills já lançados no QB com data de vencimento — não
os "modelos de recorrência" nativos do QuickBooks (Recurring
Transactions), que é uma API diferente e mais rara de usar. Se for
especificamente isso que você precisa, me avise que eu implemento à parte.

### ✅ Integração de lançamento com o QuickBooks — confirmado, já existe
- Despesa → Contas a Pagar: botão manual "Lançar no QuickBooks" no modal
  do dia (Agenda de Despesas), desde a v1.20.6
- Receita → Contas a Receber: botão manual "Lançar" no Kanban de
  Faturamento quando a nota fiscal é confirmada, desde a v1.18
Nenhum dos dois é automático a cada cadastro — é sob demanda, por
desenho (lançamento contábil fica sob seu controle).

### ✅ Conciliação — efetivamente concilia (com uma correção)
Confirmado: o motor de matching é real (score 60% valor + 30% data +
10% descrição), e aprovar uma sugestão marca a despesa como paga
automaticamente. FIX de uma regressão que eu mesmo causei na v1.20.6:
despesas já lançadas no QuickBooks (status 'lancada') tinham
DESAPARECIDO do pool de candidatos à conciliação — corrigido.

## PARTE 2 — Módulo de RH (S8 · RH + DP)

### 👤 Cadastro de Funcionários (novo)
Nome, cargo, e-mail, custo/hora, horas mensais padrão, e **projetos em
que atua — pode marcar mais de um** (reaproveita a mesma lista de
projetos do Kanban Marcos de Projeto, sem duplicar cadastro). KPIs no
topo: ativos, custo/hora médio, folha mensal estimada, quantos estão
sem projeto atribuído.

### 🤖 Gerente de RH IA (novo)
Chat com contexto real da equipe: quem está em qual projeto, custo por
projeto, quem está sem alocação. Perguntas rápidas prontas.

### ⚠ Sobre "buscar do outro sistema da Atlantyx no Vercel"
Ainda não tenho os dados de conexão desse sistema (URL da API, formato
de resposta, autenticação). Deixei a action `funcionarios_sync_externo`
pronta para receber isso — defina `ATLANTYX_HORAS_API_URL` (e
`ATLANTYX_HORAS_API_TOKEN` se precisar de token) no Vercel e me passe a
URL/documentação da API (ou um exemplo de resposta) que eu mapeio o
sync completo. Até lá, o cadastro é manual aqui.

## PARTE 3 — Gerente de Marketing IA (S2)
Chat com contexto real: campanhas (total, ativas, por canal), funil dos
últimos 14 dias (contatos→respostas→reuniões→propostas→fechamentos),
leads recentes por score. Perguntas rápidas: resumo executivo, gargalo
do funil, priorizar campanhas, qualidade dos leads.

## Sobre os demais módulos (S0, S4/S7 Vendas, S5 Jurídico, S6 Dev)
Esses ainda são interfaces de exemplo sem dados reais no banco por trás
(não têm tabela própria ainda) — um "Gerente IA" ali teria só a copy
prevista, não estratégia sobre dados de verdade. Antes de criar o chat,
faz sentido decidirmos juntos o que vira dado real em cada um (pipeline
de vendas? processos jurídicos? sprints de dev?) para o agente ter
contexto de verdade — posso seguir com isso na sequência, começando
pelo que for mais prioritário pra você.

## Arquivos
- NOVO api/rh.js (funcionários + projetos + Gerente de RH IA)
- api/db.js (action gerente_marketing)
- api/financeiro.js (FIX conciliação)
- vercel.json (maxDuration api/rh.js)
- public/index.html (páginas RH, Gerente Marketing, menus)

## Validação
RH: KPIs, checkboxes de múltiplos projetos, salvar, listar com custo/mês,
chat respondendo com dado real — tudo testado. Gerente de Marketing:
resposta com dado real do funil, histórico mantido. Árvore DOM: 76
páginas, 0 aninhadas. 0 erros JS.
