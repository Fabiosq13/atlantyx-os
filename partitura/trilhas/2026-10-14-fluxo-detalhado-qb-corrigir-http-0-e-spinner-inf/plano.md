# Plano — Fluxo Detalhado QB: HTTP 0 e spinner infinito
ID: 2026-10-14-fluxo-detalhado-qb-corrigir-http-0-e-spinner-inf · Trilha: T6 · Aprovado por: fundador (demanda dem_mv2cg7stuynn)

## Fase 1 — Servidor (api/financeiro.js)
- [x] 1.1 Timeout de 25s por requisição ao QuickBooks (`_qbFetchReal`, AbortController): QB pendurado vira erro JSON `{ success:false, error }` antes do limite de 60s do Vercel (que derrubava a conexão → HTTP 0 / 504 HTML no navegador)

## Fase 2 — Tela s3fluxodet (public/index.html, só a seção da tela)
- [x] 2.1 Skeleton imediato: HTML inicial da tela já vem com skeleton (0ms na primeira abertura) e `carregarFluxoDetalhado` redesenha o skeleton (KPIs + tabelas) de forma síncrona no início
- [x] 2.2 `_fdFinApiComRetry(action, params, { retries:3, backoff:2000, prazoMs:15000 })` — retry com backoff exponencial (2s, 4s, 8s) só para falha transitória (HTTP 0, 5xx/gateway, resposta não-JSON), dentro do prazo total de 15s (AbortController via `finApi(..., { timeoutMs })`)
- [x] 2.3 Erro após o prazo/tentativas: mensagem clara + "↻ Tentar novamente" (aviso no topo e na tabela); KPIs voltam a "—"; com cache local, mostra a última carga boa com aviso (comportamento v3.85 mantido)
- [x] 2.4 Trava de concorrência (`_fdSeq`): cliques repetidos em Atualizar/filtros não deixam resposta antiga sobrescrever a nova; botão "Atualizar" fica "⏳ Atualizando…" e é liberado no `finally`
- [x] 2.5 Prazo nas demais chamadas da tela: combo de contas (15s), "Comparar por conta" e "Razão da conta" (45s) — nenhum "⏳" sem fim
- [ ] Validação (`node scripts/validar.mjs --sem-navegador` + `node scripts/bpm-gates.mjs --local`) — não executada pelo robô (sem permissão para `node` no Action); fica para o CI "Gates B.P.M." do PR

## Interseções
- Pedido à T1/T5 (não editado): a orientação sugeria `lib/fetchRetry.js` reaproveitável. `lib/**` não é da T6, então o helper ficou na seção da tela (`_fdFinApiComRetry`). Se outra tela precisar, a trilha dona de `lib/` pode extrair para `lib/fetchRetry.js` / helper global do index.html (T4).
- Depende de: nenhum contrato novo. Sem mudança de banco.
- Bloqueia: —

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-14 | Fases 1 e 2 implementadas | validar.mjs/bpm-gates.mjs não rodaram no robô (sem permissão para `node`) — conferir no CI do PR | Fundador testar no preview (s3fluxodet: abrir, Atualizar, simular offline) e acompanhar os próximos 3 relatórios de QA |
