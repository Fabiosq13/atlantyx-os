# Mixagem — Floresta: IARA de voz
- Escopo: lib/floresta-voz.js, api/vendas.js, public/floresta-ui.js, tests; lib/qa-guard.js (Interseção T1, só uma regra pública).
- Banco: sem DDL; kv `vendas:floresta:voz` (últimas 300 chamadas) e leitura de `disparo_optout`.
- Segurança: sem segredo no código; webhook com chave derivada da RETELL_API_KEY; sem chave, recusa. Dados sintéticos nos testes.
- Risco: cada ligação gasta minutos Retell + Twilio; ação só por clique; limite diário; janela de horário.
