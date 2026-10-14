# Mixagem — Gestão de Riscos: erro HTTP 0 e botão Atualizar com retry
ID: 2026-10-11-gestao-de-riscos-corrigir-erro-http-0-e-botao-at · PR: (a abrir a partir da tarefa #73)

## Gate 1 — automático (CI "Gates B.P.M.")
- [ ] Sintaxe (validar.mjs) · resultado: **não executado no robô** — o ambiente do agente bloqueou `node scripts/validar.mjs --sem-navegador` (e `node --check`/`node -e`) por permissão. Revisão manual do bloco alterado sem erro aparente; o CI "Gates B.P.M." roda no PR.
- [ ] Escopo da trilha · banco · versão · segredos (bpm-gates.mjs) · resultado: **não executado no robô** (mesmo bloqueio de permissão). Conferência manual: diff só em `public/index.html` (seção s1riscos) e `partitura/trilhas/<ID>/**`; sem DDL, sem mudança de `ATX-vX.YY`, sem segredo.

## Gate 2 — agente revisor (subagent `revisor`)
Apontamentos (o revisor não aprova, só aponta):
- Fallback de cache só entra quando as 4 leituras falham; falha parcial mantém o comportamento anterior (cartão cinza "Dado indisponível — Sem conexão — tente novamente").
- Retry só para HTTP 0 / timeout; erros do servidor (ex.: QuickBooks desconectado) não são repetidos.
- Botão "◆ Analisar Riscos" (IA, T3) fora do escopo.

## Gate 3 — humano (Engenheiro de Mixagem — na Esteira, botão "Aprovar e mesclar")
- [ ] Todos os critérios de aceite da spec.md atendidos e demonstrados
- [ ] O diff só toca arquivos do escopo da trilha (ou há interseção aprovada)
- [ ] Contratos alterados aprovados na Afinação e versionados (nenhum contrato alterado)
- [ ] Mudança de banco revisada pelo Afinador, aditiva e reversível (nenhuma mudança de banco)
- [ ] Nenhum segredo, token ou dado de cliente no código ou nos logs
- [ ] Integrações externas: nenhuma chamada nova envia dados sem aprovação (Gmail de agentes = rascunho)
- [ ] Testes/validação cobrem o caminho feliz e pelo menos um erro
- [ ] Consigo explicar cada trecho do código
- [ ] plano.md e trilhas.md atualizados
- [ ] Testado no deploy de preview / em produção logo após o merge

### Como testar no preview
1. Abrir **Gestão de Riscos**: na primeira carga aparecem 3 blocos skeleton e depois os cartões; clicar **↻ Atualizar** → botão vira "⏳ Atualizando…" e volta em até 15s.
2. DevTools → Network → **Offline**, clicar **↻ Atualizar**: em até 15s aparece o banner amarelo "⚠ [dados offline] Dados de … — Sem conexão — tente novamente" com os cartões da última leitura e o botão "↻ Tentar novamente".
3. Offline + `localStorage.removeItem('cache_riscos')` + recarregar a página: banner vermelho "⛔ Sem conexão — tente novamente" e cartões cinza (sem spinner eterno).
4. Voltar online e clicar "↻ Tentar novamente": banner some e o semáforo volta ao vivo.
