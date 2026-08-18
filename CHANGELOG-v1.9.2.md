# Atlantyx OS · v1.9.2 — Kanban: filtro de data + data de publicação em todo lugar

## 1. Filtro de data no Kanban
Barra no topo: "Filtrar por" [data de criação | data de publicação agendada]
+ de/até + atalhos Hoje · 7 dias · 30 dias · 📅 Próximos 14 dias · Todos.
Aplica a todas as colunas.

## 2. Data de publicação visível
- Card: linha dourada "📅 dd/mm/aaaa HH:MM · in/ig/fb" (redes agendadas)
- Painel de detalhes: bloco AGENDAMENTO agora separa "Criada em" e lista
  "📅 Publicação agendada:" com data, rede, método e id do Metricool
- Título do detalhe: "· 📅 publica dd/mm HH:MM"
- Peça na coluna Agendado SEM publicação registrada → aviso vermelho
  "⚠ sem publicação registrada" (card e detalhe)

## 3. Por que "Decisão com dado errado" não aparecia no calendário
Causa raiz: na Auto-campanha a peça era marcada "Agendado" ANTES da
resposta do Metricool. Se o Metricool recusava (ex.: mídia inválida no
Instagram) ou a IA devolvia "sexta-feira" (não reconhecido → caía em
terça), a peça ficava "Agendado" mas sem publicação nenhuma — por isso não
entrava no calendário. Correções:
- Status honesto: a peça começa em Aprovado e só vira Agendado quando o
  Metricool CONFIRMA; recusa → fica Aprovado com o motivo gravado na peça,
  log em vermelho e toast — e você publica pelo card (🚀) quando quiser
- agendado_para gravado na própria peça (card/detalhe/filtro não dependem
  de reconstruir pelas publicações)
- dia_semana normalizado: "sexta-feira", "Sexta", "sábado" etc.
- Publicação pelo modal também grava agendado_para; se a data for futura a
  peça vai para Agendado (não mais direto para Publicado)

## Para a peça de hoje que ficou "Agendado" sem data
Abra o card → o detalhe vai mostrar o aviso vermelho → clique em 🚀
Publicar e reagende (o log do momento da auto-campanha tem o motivo da
recusa, provavelmente "Metricool recusou ...").

## Validação (JSDOM, cenário do usuário)
3 posts, 1 recusado pelo Metricool → 2 Agendado c/ 📅 e 1 Aprovado c/
aviso · "sexta-feira 15:00" → agendado na sexta 15h · detalhe lista as
publicações · filtro por agendamento (2) e por criação (3). 0 erros.
