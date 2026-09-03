# Atlantyx OS · v1.32 — Filtro de mês e ano no Kanban de Faturamento

## O que foi adicionado
Barra de filtros logo abaixo do cabeçalho do Kanban:
- **Mês** (Janeiro a Dezembro, ou "Todos os meses")
- **Ano** — populado automaticamente com os anos que existem na base
- **Busca livre** por projeto, nº do termo ou período de medição
- Botões **Aplicar** e **Limpar**
- Contador à direita mostrando quantos termos o filtro trouxe e quais
  filtros estão ativos (fica dourado quando há filtro, cinza quando não)

Os totais por etapa e o total geral respeitam o filtro — então dá para
ver "quanto faturei em agosto" olhando a faixa de totais.

## Uma decisão que vale explicar
O filtro de mês/ano usa a **data de criação do termo**, não o campo
"período de medição". Motivo: esse campo é texto livre e vem em formatos
diferentes ("julho/2026", "07/2026", "Julho 2026") — comparar isso como
data daria resultado errado em parte dos casos.

Para filtrar pelo período de medição, use a **busca livre**: digitar
"julho" traz todos os termos cujo período contenha essa palavra. É mais
honesto do que fingir uma precisão que o dado não tem.

## Validação
Limites de mês calculados corretamente, inclusive fevereiro em ano comum
(28) e bissexto (29); anos populados da base; filtros enviados ao
backend; contador refletindo o filtro; limpar voltando ao total geral
(um bug de atualização do contador foi encontrado e corrigido no teste).

## Arquivos
- api/faturamento.js · public/index.html
