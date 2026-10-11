# Eventos entre módulos — Atlantyx OS

Como os módulos e os squads de agentes (S1, S2, S7…) conversam: crons da Vercel, workflows do GitHub, chamadas diretas entre APIs e chaves compartilhadas no kv_store.

## Regras
- Cron novo ou horário alterado = mudança de contrato da trilha dona + linha no vercel.json (T1).
- Chamada direta de uma API a outra (import) cria dependência entre trilhas: registre aqui e no plano.md das duas.
- Robôs (GitHub Actions) chamam as APIs com `Authorization: Bearer CRON_SECRET`; nada de segredo em código.
- Envio externo (e-mail, WhatsApp, posts) só com aprovação humana ou regra explícita já aprovada (ex.: e-mail financeiro das 8h). Gmail de agentes = rascunho.

<!-- inventario:inicio -->
## Inventário automático

_Gerado por `node scripts/bpm-inventario.mjs` a partir do código. Não edite abaixo desta linha — edite o código ou a parte manual acima._

### Agendamentos (Vercel cron · horário UTC)

| Quando (cron) | Chama | Trilha |
|---|---|---|
| `0 */6 * * *` | `/api/rfp-monitor` | T2 Integrações |
| `30 */6 * * *` | `/api/rfp-monitor?acao=petronect` | T2 Integrações |
| `0 * * * *` | `/api/followup-cron` | T3 Agentes e Squads |
| `0 * * * *` | `/api/briefing-cron` | T3 Agentes e Squads |
| `0 9 * * *` | `/api/financeiro?action=marcos_processar_alertas` | T6 Financeiro |
| `0 9 * * 1` | `/api/health?full=1` | T1 Plataforma |
| `0 11 * * *` | `/api/financeiro?action=relatorio_pagamentos` | T6 Financeiro |
| `0 12 * * *` | `/api/financeiro?cron=termos_obrigatorios` | T6 Financeiro |
| `0 12 * * *` | `/api/financeiro?cron=pendencias_faturamento` | T6 Financeiro |
| `0 11,15,20 * * *` | `/api/financeiro?cron=conciliar_notas` | T6 Financeiro |
| `* * * * *` | `/api/metricool?cron=fila` | T2 Integrações |
| `*/15 * * * *` | `/api/campanha-disparo?cron=1` | T3 Agentes e Squads |
| `0 */6 * * *` | `/api/agente-ideias?cron=1` | T1 Plataforma |

### Workflows do GitHub Actions

| Arquivo | Dispara em | Nome |
|---|---|---|
| `ci.yml` | pull_request | Gates B.P.M. |
| `claude-correcao.yml` | issues, issue_comment | Claude — correção automática |
| `claude-pr.yml` | pull_request_target, workflow_run, schedule, workflow_dispatch | Claude — PR e merge das correções noturnas |
| `esteira-comandos.yml` | issue_comment | Esteira — comandos |
| `qa-externo.yml` | schedule, workflow_dispatch | QA de Produtos — robô de testes |
| `qa-noturno.yml` | schedule, workflow_dispatch | QA noturno — correção autônoma de erros |

### Chamadas entre módulos (import direto)

| De | Importa | Trilha de origem → destino |
|---|---|---|
| `api/business-plan.js` | `api/financeiro.js` | T3 → T6 (interseção) |
| `api/fabrica.js` | `api/agente-ideias.js` | T1 → T1 |
| `api/fabrica.js` | `api/agente-ideias.js` | T1 → T1 |
| `api/fabrica.js` | `api/agente-ideias.js` | T1 → T1 |
| `api/fabrica.js` | `api/qa-externo.js` | T1 → T1 |
| `api/financeiro.js` | `api/faturamento.js` | T6 → T6 |
| `api/metricool.js` | `api/media.js` | T2 → T2 |
| `api/metricool.js` | `api/media.js` | T2 → T2 |
| `api/metricool.js` | `api/media.js` | T2 → T2 |
| `api/metricool.js` | `api/media.js` | T2 → T2 |
| `api/s1-data.js` | `api/financeiro.js` | T3 → T6 (interseção) |
| `api/s1-data.js` | `api/financeiro.js` | T3 → T6 (interseção) |
| `api/s1-data.js` | `api/financeiro.js` | T3 → T6 (interseção) |
| `api/s1-intel.js` | `api/financeiro.js` | T3 → T6 (interseção) |
| `api/tendencias.js` | `api/financeiro.js` | T3 → T6 (interseção) |
| `api/wa-response.js` | `api/campanha-disparo.js` | T2 → T3 (interseção) |
