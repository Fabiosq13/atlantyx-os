# Atlantyx OS · v1.20 — Kanban Marcos de Projeto (renomeado + simplificado)

## Renomeação
"Kanban Financeiro" → **"Kanban Marcos de Projeto"** (menu, título da tela
e breadcrumb).

## Etapas eliminadas
As colunas **Aguardando Cliente**, **NF Emitida** e **Aguardando
Pagamento** foram removidas. O rastreio de nota fiscal e pagamento já
tem casa própria desde a v1.17/1.18: o **Kanban de Faturamento**. Este
Kanban de Marcos passa a cobrir só a parte de ENTREGA do projeto:

Aguardando Entrega → Liberação do GP → Aprovado pelo GP →
Elaborando Termo → Termo Pronto/Enviado → **Concluído**

Na coluna "Termo Pronto/Enviado" agora há um botão direto **✓ Concluir**
(o termo já foi enviado; NF e pagamento são acompanhados no outro Kanban).

## Migração de dados existentes (automática, sem ação necessária)
Marcos que já estavam nas etapas eliminadas são realocados sozinhos na
primeira consulta após o deploy:
- Aguardando Cliente → Termo Pronto/Enviado (o termo já tinha sido
  enviado, continua visível ali)
- NF Emitida / Aguardando Pagamento → Concluído (a entrega já estava
  feita; o que restava é rastreado no Kanban de Faturamento)
Nada é perdido — é só uma realocação de coluna.

## Editar marco → trocar de etapa pelo status (o pedido principal)
O formulário de edição de marco ganhou o campo **"Etapa do Kanban
(status)"** — um menu com exatamente os mesmos nomes das colunas do
quadro. Ao editar um marco existente, escolher uma etapa diferente e
salvar move o marco para aquela coluna automaticamente (sem precisar
usar os botões do quadro). Continua preservando os carimbos de data/hora
e o histórico de cada mudança de etapa. Em marco novo, o campo fica
oculto (todo marco novo nasce em "Aguardando Entrega").

## KPIs do topo recalculados
Aguardando ação (Entrega+Liberação GP) · Em elaboração (Aprovado+
Elaborando Termo) · Termo Enviado · Concluídos.

## Validação (JSDOM)
KPIs corretos com dados simulados; colunas removidas não aparecem mais
no quadro; botão Concluir no Termo Pronto; dropdown de status aparece só
ao editar, pré-selecionado com a etapa certa; trocar a etapa dispara
marco_save → marco_mover_status na sequência certa. Árvore DOM: 73
páginas, 0 aninhadas, balanço de divs = 0. 0 erros JS.

## Arquivos
- api/financeiro.js (KANBAN_COLUNAS reduzido, migração automática,
  limpeza do marcoMoverStatus)
- public/index.html (renomeação, KPIs, cards, dropdown de status)
