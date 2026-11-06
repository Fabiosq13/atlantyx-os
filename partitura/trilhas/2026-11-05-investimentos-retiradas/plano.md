# Plano — Investimentos & Retiradas

BPM-Trilha: T3 · BPM-ID: 2026-11-05-investimentos-retiradas

- [x] lib/investimentos.js (cenário macro com web_search, análise, projeção/lucro previsto, params)
- [x] api/estrategia.js: claudeTools + ações investimentos_obter / investimentos_params / investimentos_analisar
- [x] public/index.html: menu Financeiro, página s3investimentos, invRender/invPlanoHtml, histórico, ATLAS da tela

## Interseções
- T1: cron novo em `vercel.json` (`/api/estrategia?cron=investimentos`, quintas 12:17 UTC).
- T4: item de menu + página nova em `public/index.html` (seção marcada v3.400).
- T6: leitura das ações `fluxo_futuro` e `kpis_saude` (sem alteração em api/financeiro.js).

## Registro da Batida
- 2026-11-05 · v3.400 · ✅ entregue · sem bloqueio · próximo: fundador roda a análise e ajusta parâmetros; avaliar agendar reanálise mensal (cron) quando o Copom decidir.
- 2026-11-05 · v3.401 · ✅ reanálise automática: cron semanal lê a Selic meta (BCB SGS 432); mudou → reanalisa; senão a cada 45 dias · próximo: acompanhar primeira execução automática.
