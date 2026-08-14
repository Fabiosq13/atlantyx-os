# Atlantyx OS · v1.5.6 — Status do QuickBooks na sidebar

## Novidade
Linha "QuickBooks · ..." na lista de status de APIs (entre HubSpot e
Metricool), com verificação REAL ~3s após carregar a página:

| Status | Significado |
|---|---|
| 🟢 QuickBooks · Conectado | Envvars OK e refresh token validado na Intuit |
| 🟢 QuickBooks · Conectado (sandbox) | Idem, apontando pro ambiente Development |
| 🔴 QuickBooks · Erro token | Envvars existem mas o refresh token foi rejeitado (expirou → gerar novo no OAuth Playground). Tooltip mostra o erro exato |
| ⚪ QuickBooks · Configurar | Falta envvar (tooltip lista quais) |
| ⚪ QuickBooks · Offline | /api/financeiro inacessível |

## Backend
Nova action `qb_status` no api/financeiro.js: checa as 4 envvars
(QB_CLIENT_ID/SECRET/REFRESH_TOKEN/REALM_ID) e faz um refresh de token
real na Intuit (~300ms) para diferenciar "configurado" de "funcionando".
O indicador diferencia sandbox de produção — útil para não esquecer
QB_SANDBOX=true apontando pro lugar errado.

## Arquivos
- api/financeiro.js (action qb_status)
- public/index.html (linha na sidebar + verificarQuickBooks)

## Validação
JSDOM: 4 estados simulados renderizando corretamente, 0 erros.
