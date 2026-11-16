# Mixagem — Jornada do planejamento 2027
- Escopo: lib/estrategia-jornada.js, lib/estrategia-roteiro.js (checklists), api/estrategia.js (2 ações), public/estrategia-trilha-ui.js (aba), testes.
- Banco: sem DDL; só kv_store `est:jornada`.
- Segurança: ações restritas a `soFundador`; sem dado de cliente real; nenhuma ação externa.
- Testes: `node --test tests/estrategia-jornada.test.js` (4 passam).
- Risco: baixo; aba carregada sob demanda e checklists só ganharam um item.
