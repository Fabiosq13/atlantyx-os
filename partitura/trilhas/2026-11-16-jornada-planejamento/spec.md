# Spec — Jornada do planejamento 2027 na Trilha guiada
ID: 2026-11-16-jornada-planejamento · Trilha: T3 · Aprovado por: Fabio ("Faça tudo", 16/11/2026)

## Objetivo
Levar a agenda das 6 reuniões de planejamento estratégico para dentro do Atlantyx OS, na ordem: diagnóstico → alavancas → produtos → simulação e Business Plan → metas → conselho.

## Escopo
- lib/estrategia-jornada.js: 6 reuniões (telas, perguntas do roteiro, entradas, decisões, ações, checklist), registro em kv `est:jornada`.
- Item "Business Plan revisado e ajustado (3.4)" nos checklists do check-in trimestral e da revisão anual.
- Ações `jornada_obter` e `jornada_salvar` em api/estrategia.js (só fundador).
- Aba "Jornada 2027" na Trilha guiada.

## Critérios de aceite
- [x] Reunião marcada como feita fora de ordem ou com checklist aberto gera alerta (não bloqueia).
- [x] Decisões registradas por reunião, com autor e data.
- [x] Business Plan aparece no checklist da reunião 4, do check-in trimestral e da revisão anual.
- [x] Nenhuma tabela nova; nenhuma ação automática.

## Fora do escopo
Reordenar as 11 perguntas do roteiro (metas já são as últimas: 7 a 11).
