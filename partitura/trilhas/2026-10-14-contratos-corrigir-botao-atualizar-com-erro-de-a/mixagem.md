# Mixagem — Contratos: botão Atualizar resiliente
ID: 2026-10-14-contratos-corrigir-botao-atualizar-com-erro-de-a · PR: (a abrir a partir da issue #85)

## Gate 1 — automático (CI "Gates B.P.M.")
- [ ] Sintaxe (validar.mjs) · resultado: **não executado no robô** — a execução de `node` não foi permitida neste job. Revisão manual do bloco alterado (chaves/template strings fechados, sem nomes duplicados, `_recEsc` é global). O CI do PR roda o gate.
- [ ] Escopo da trilha · banco · versão · segredos (bpm-gates.mjs) · resultado: **não executado no robô** (mesmo motivo). Conferência manual: só `public/index.html` (seção s3contratos) e `partitura/trilhas/<ID>/**`; sem DDL, sem mudança de versão, sem segredo.

## Gate 2 — agente revisor (subagent `revisor`)
Apontamentos (o revisor não aprova, só aponta):
- Mudança restrita ao bloco "Tela de Contratos" e ao cabeçalho de `#page-s3contratos`; `finApi` compartilhado e CSS global intactos (reaproveita `.skel`).
- Retry só para leitura (`contrato_list`) e só em falha transitória (HTTP 0, timeout, 5xx) — 4xx aparece na hora.
- Interseção com T1 (qa-agent.js) registrada no plano: falha recuperada pelo retry ainda é contada pelo QA.

## Gate 3 — humano (Engenheiro de Mixagem — na Esteira, botão "Aprovar e mesclar")
- [ ] Todos os critérios de aceite da spec.md atendidos e demonstrados
- [ ] O diff só toca arquivos do escopo da trilha (ou há interseção aprovada)
- [ ] Contratos alterados aprovados na Afinação e versionados
- [ ] Mudança de banco revisada pelo Afinador, aditiva e reversível
- [ ] Nenhum segredo, token ou dado de cliente no código ou nos logs
- [ ] Integrações externas: nenhuma chamada nova envia dados sem aprovação (Gmail de agentes = rascunho)
- [ ] Testes/validação cobrem o caminho feliz e pelo menos um erro
- [ ] Consigo explicar cada trecho do código
- [ ] plano.md e trilhas.md atualizados
- [ ] Testado no deploy de preview / em produção logo após o merge

## Como testar (preview)
1. Abrir S1 · Contratos → clicar em ↻ Atualizar: aparece skeleton na tabela, botão vira "Atualizando…" e fica desabilitado; em seguida a tabela e os KPIs recarregam.
2. DevTools → Network → Offline → ↻ Atualizar: após 3 tentativas (≈1s entre elas) aparece o alerta vermelho "HTTP 0 (sem conexão com o servidor) após 3 tentativa(s)", a última tabela continua visível e o botão volta ao normal.
3. Network → throttling "Slow 3G"/bloquear `/api/financeiro` com atraso: o carregamento termina em no máximo ~10s com "tempo esgotado".
4. Console: cada falha gera `[contratos] {"action":"contrato_list","tentativa":n,"http":…,"erro":…}`.
