---
description: Gera a Batida — status das trilhas ativas, bloqueios e interseções pendentes
---
Rode a Batida do Método B.P.M.:
1. Leia `partitura/trilhas.md` e todos os `partitura/trilhas/*/plano.md` (ignore `_modelo`).
2. Veja o git log desde a última linha do Registro da Batida: `git log --since="<data>" --oneline`.
3. Liste os PRs e tarefas abertos: `gh pr list --state open` e `gh issue list --label demanda-aprovada --state open` (se o gh não estiver disponível, use só o git e diga isso).
4. Atualize `partitura/trilhas.md`: tabela de trilhas de feature (status, bloqueio, próximo passo), interseções pendentes e uma nova linha no Registro da Batida (concluído · em andamento · bloqueios · decisão humana necessária).
5. Na resposta, destaque SÓ o que precisa de decisão humana. A reunião discute os bloqueios.
