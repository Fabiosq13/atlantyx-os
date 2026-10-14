# Mixagem — Pipeline de Ideias: painel de evolução (Viabilidade)
ID: 2026-10-14-pipeline-de-ideias-painel-de-evolucao-das-ideias · PR: (a abrir a partir da issue #86)

## Gate 1 — automático (CI "Gates B.P.M.")
- [ ] Sintaxe (validar.mjs) · resultado: **não executado localmente** — o ambiente do robô negou permissão para rodar `node scripts/validar.mjs --sem-navegador` (e qualquer `node` sobre arquivos do repo). Revisão manual do diff feita; o CI "Gates B.P.M." do PR roda a validação.
- [ ] Escopo da trilha · banco · versão · segredos (bpm-gates.mjs) · resultado: **não executado localmente** (mesmo motivo). Conferido à mão: só `public/index.html` (seções s1pipeline e `bpInit` do s1bp) + arquivos desta trilha em `partitura/trilhas/`; sem DDL, sem mudança de versão, sem segredo.

## Gate 2 — agente revisor (subagent `revisor`)
Apontamentos (o revisor não aprova, só aponta):
- A orientação da demanda cita `#input-ideia`, que não existe; o campo real do S1-03 é `#anTitulo` (a descrição vai em `#anDesc`).
- O checklist é uma seção colapsável (`<details>`) por ideia num painel "Próximos Passos" logo abaixo do kanban — as colunas do kanban têm 1/7 da largura, pequenas demais para 5 checkboxes + 2 botões. No card fica a barra de progresso; clicar nela abre a seção da ideia.
- O checklist fica só no localStorage (por navegador), como pede a spec — não sincroniza entre dispositivos.
- Ideias que já têm BP: o botão vira "Abrir Business Plan" e abre o plano existente; sem BP, abre o s1bp com a ideia pré-selecionada em "Ideia cadastrada" (não gera sozinho, para não gastar IA sem o clique).

## Gate 3 — humano (Engenheiro de Mixagem — na Esteira, botão "Aprovar e mesclar")
- [ ] Todos os critérios de aceite da spec.md atendidos e demonstrados
- [x] O diff só toca arquivos do escopo da trilha (ou há interseção aprovada)
- [x] Contratos alterados aprovados na Afinação e versionados (nenhum contrato alterado)
- [x] Mudança de banco revisada pelo Afinador, aditiva e reversível (sem mudança de banco)
- [x] Nenhum segredo, token ou dado de cliente no código ou nos logs
- [x] Integrações externas: nenhuma chamada nova envia dados sem aprovação
- [ ] Testes/validação cobrem o caminho feliz e pelo menos um erro
- [ ] Consigo explicar cada trecho do código
- [x] plano.md e trilhas.md atualizados (plano.md; trilhas.md é do Maestro)
- [ ] Testado no deploy de preview / em produção logo após o merge

### Como testar no preview
1. Abra **S1 · Pipeline de Ideias**. Abaixo do kanban aparece "Próximos Passos — ideias em Viabilidade" com uma linha por ideia (ex.: TOVIX NORBEN, IA POP).
2. Cada card da coluna Viabilidade mostra a barra "checklist 0%". Clique nela → a seção da ideia abre.
3. Marque 2 itens → barra e % vão para 40% no card e no painel. Recarregue (F5) → continua 40%. Outra ideia continua no próprio percentual (chave `ideia_checklist_{id}`).
4. "Analisar com IA" → abre o S1-03 com título e descrição da ideia preenchidos.
5. "Criar Business Plan" → abre o Business Plan na aba "Por ideia" com a ideia selecionada (ou abre o plano existente, se já houver).
