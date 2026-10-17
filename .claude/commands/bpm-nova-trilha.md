---
description: Abre uma trilha de feature do Método B.P.M. (spec + plano) sem escrever código
argument-hint: <nome da trilha ou demanda>
---
Crie a trilha "$ARGUMENTS" seguindo o Método B.P.M. do Atlantyx OS:
1. Leia `CLAUDE.md`, `partitura/escopos.json` e `partitura/trilhas.md`.
2. Defina o ID `aaaa-mm-dd-slug` (data de hoje, horário de Brasília) e a trilha permanente (T1…T6) dona dos arquivos que a feature vai tocar (`lib/bpm.js` tem `sugerirTrilha`).
3. Gere `partitura/trilhas/<ID>/spec.md` a partir de `partitura/trilhas/_modelo/spec.md`, com status "rascunho". Faça perguntas ao usuário até ter: problema, resultado esperado, critérios de aceite verificáveis, escopo de arquivos (só arquivos da trilha + seção do index.html) e o que fica fora.
4. Liste as interseções (arquivos de outras trilhas, banco, contratos) — não as resolva.
5. Gere `plano.md` em fases a partir do modelo e adicione a trilha em `partitura/trilhas.md` (tabela "Trilhas de feature abertas").
6. Avise o limite de paralelismo da fase atual (escopos.json → fases). Não escreva código.
