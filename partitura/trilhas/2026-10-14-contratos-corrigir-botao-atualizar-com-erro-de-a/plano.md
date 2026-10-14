# Plano — Contratos: botão Atualizar resiliente
ID: 2026-10-14-contratos-corrigir-botao-atualizar-com-erro-de-a · Trilha: T6 · Aprovado por: fundador (Esteira de Demandas)

## Fase 1 — Diagnóstico
- [x] Handler do botão: `carregarContratos()` → `finApi('contrato_list')` → `POST /api/financeiro` (só Neon, sem QB, mesma origem → sem CORS). Backend sem alteração.

## Fase 2 — Front (public/index.html, seção s3contratos)
- [x] `_ctrComRetry`: 3 tentativas, 1s de espera, só em rede/timeout/5xx; prazo total 10s com AbortController por tentativa
- [x] Skeleton (linhas `.skel`) na tabela durante o carregamento; botão desabilitado ("Atualizando…") e sem chamadas sobrepostas
- [x] Alerta inline `#ctrAlerta` com HTTP/mensagem/nº de tentativas e botão "Tentar novamente"; mantém a última tabela carregada quando houver
- [x] Log estruturado no console (`console.warn('[contratos]', {action, tentativa, http, erro})` — warn, não error, para o QA não contar falha já tratada)
- [ ] Validação (`node scripts/validar.mjs --sem-navegador` + `node scripts/bpm-gates.mjs --local`) — não rodou no robô (sem permissão para `node`); fica para o CI "Gates B.P.M." do PR

## Interseções
- **T1 (QA — `public/qa-agent.js`)**: o QA registra como "chamou a API e recebeu erro" toda requisição que falhou durante o clique,
  mesmo quando a tentativa seguinte do retry deu certo. Sugestão para a T1: desconsiderar a falha de rede (HTTP 0/5xx) de uma
  `action` quando uma requisição posterior da mesma `rota · action`, na mesma fase do botão, terminou com sucesso.
  Sem isso, uma falha transitória recuperada ainda pode aparecer no relatório (o critério "zero erro no próximo QA" depende disso
  e da estabilidade da rede).
- Banco/contratos: nenhuma.

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-14 | código concluído | validação local não rodou (sem permissão para `node` no robô) | CI do PR roda os gates; após o merge, conferir o relatório do QA de s3contratos por 5 dias |
