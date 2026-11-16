# Plano — Floresta: IARA de voz
ID: 2026-11-16-floresta-ligacao-voz · Trilha: T3

- [x] lib/floresta-voz.js (ligar, teste, webhook, config)
- [x] api/vendas.js: ações floresta_voz_* e webhook retell
- [x] public/floresta-ui.js: botões na ficha
- [x] tests/floresta-voz.test.js (5 testes)
- [ ] Fabio: cadastrar RETELL_API_KEY, RETELL_AGENT_ID e RETELL_FROM_NUMBER na Vercel; colar o webhook na Retell; criar o campo `resultado` na extração pós-chamada; ligar o número Twilio ao agente

## Interseções
- T1: `lib/qa-guard.js` recebeu uma regra pública para `POST /api/vendas?webhook=retell` (exige chave própria na URL; recusa sem RETELL_API_KEY).
- T2: a chamada à API da Retell fica em lib/floresta-voz.js (sem tocar nos arquivos da T2); se a T2 quiser um conector genérico, pode extrair depois.
- Jurídico: validar com advogado ligação para leads frios e consentimento (LGPD) antes de escalar.

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 16/11/2026 | v3.530 entregue | falta número Twilio e variáveis na Vercel | Fabio configura; teste "no meu celular"; depois 1–2 leads reais |
