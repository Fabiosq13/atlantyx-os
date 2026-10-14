---
description: Prepara a Mixagem do PR atual — revisor + gates + checklist
---
Prepare a Mixagem da trilha atual (Método B.P.M.):
1. Descubra o ID (BPM_ID/.bpm-trilha ou a branch/tarefa) e leia a spec e o plano.
2. Acione o subagent `revisor` sobre o diff atual (`git diff origin/main...HEAD`).
3. Rode `node scripts/validar.mjs --sem-navegador` e `node scripts/bpm-gates.mjs --local`.
4. Preencha `partitura/trilhas/<ID>/mixagem.md` a partir do modelo com os resultados dos gates 1 e 2 e deixe o gate 3 (humano) com os itens desmarcados, indicando quais precisam de atenção do Engenheiro de Mixagem.
5. Não faça merge. O gate humano é o botão "Aprovar e mesclar" da Esteira de Demandas.
