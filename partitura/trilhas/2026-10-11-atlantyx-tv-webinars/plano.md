# Plano — Atlantyx TV e Webinars
ID: 2026-10-11-atlantyx-tv-webinars · Trilha: T2

## Fase 1
- [x] api/atv.js (config, mídias em partes, cotações, notícias IA, chamadas IA, destinos cifrados, LiveKit token/egress, cron)
- [x] public/atv-player.js (player TV, layout do egress, sala privada, convidado)
- [x] public/atv-ui.js (abas Atlantyx TV, YouTube 24h, Webinars + estúdio, Destinos)
- [x] Teste ponta a ponta (LiveKit, IA e cotações simulados)

## Interseções
- T1: lib/qa-guard.js (rota pública 'atv' e cron), vercel.json (rewrites /atv, /atvl, /ao-vivo, /convidado; função; cron de hora em hora)
- T4: menu s0atv e página no index.html
- T5: atv_midias, atv_partes, atv_webinars (inventário automático)

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-11 | no ar (v3.153) | LiveKit Cloud + chaves dos destinos a configurar pelo Fabio | criar projeto LiveKit, variáveis na Vercel, chave do YouTube |
