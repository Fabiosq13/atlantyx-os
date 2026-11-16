# Mixagem — Floresta: enriquecer com Apollo
- Escopo: lib/floresta.js, public/floresta-ui.js, tests/floresta-enriquecer.test.js.
- Banco: sem DDL; só kv `vendas:floresta:apollo_ids` (limite de 5.000 entradas).
- Segurança: nenhum segredo; dados sintéticos nos testes; nada é enviado a clientes.
- Risco: gasto de créditos do Apollo agora é automático na importação.
