# Mixagem — Projetado + Contratos — corrigir spinner infinito com timeout e skeleton
ID: 2026-10-11-projetado-contratos-corrigir-spinner-infinito-co · PR: (a abrir — tarefa #76)

## Gate 1 — automático (CI "Gates B.P.M.")
- [ ] Sintaxe (validar.mjs) · resultado: **não executado localmente** — o ambiente do robô negou permissão para rodar `node`. Revisão manual do bloco alterado (parênteses, chaves, aspas, nomes sem colisão). O CI "Gates B.P.M." roda no PR.
- [ ] Escopo da trilha · banco · versão · segredos (bpm-gates.mjs) · resultado: **não executado localmente** (mesmo motivo). Diff: só `public/index.html` (seção s3projetado) e `partitura/trilhas/<ID>/`; sem DDL, sem mudança de versão, sem segredos.

## Gate 2 — agente revisor (subagent `revisor`)
Apontamentos (o revisor não aprova, só aponta):
- Skeleton sem animação (pulse) porque keyframes/CSS global são da T4 — usa opacidade e "--".
- Ao digitar nos campos de simulação durante uma carga, `_projRender()` pode repintar com a base anterior (comportamento pré-existente, aceitável).

## Gate 3 — humano (Engenheiro de Mixagem — na Esteira, botão "Aprovar e mesclar")
- [ ] Todos os critérios de aceite da spec.md atendidos e demonstrados
- [ ] O diff só toca arquivos do escopo da trilha (ou há interseção aprovada)
- [ ] Contratos alterados aprovados na Afinação e versionados (n/a — nenhum contrato alterado)
- [ ] Mudança de banco revisada pelo Afinador, aditiva e reversível (n/a — sem banco)
- [ ] Nenhum segredo, token ou dado de cliente no código ou nos logs
- [ ] Integrações externas: nenhuma chamada nova envia dados sem aprovação (Gmail de agentes = rascunho)
- [ ] Testes/validação cobrem o caminho feliz e pelo menos um erro
- [ ] Consigo explicar cada trecho do código
- [ ] plano.md e trilhas.md atualizados
- [ ] Testado no deploy de preview / em produção logo após o merge

## Como testar no preview
1. Abrir **Projetado + Contratos**: a tabela com 9 colunas e 12 meses em "--" aparece na hora.
2. Caminho feliz: em poucos segundos os KPIs e a tabela são preenchidos.
3. Erro: DevTools → Network → "Offline" (ou throttling extremo) → clicar **Atualizar**: em ≤ 12s aparece a mensagem de erro com **Tentar de novo**; voltar online e clicar → dados carregam.
4. Trocar a conta no filtro durante uma carga: só a resposta mais recente é exibida.
