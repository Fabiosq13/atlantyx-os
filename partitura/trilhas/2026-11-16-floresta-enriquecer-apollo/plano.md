# Plano — Floresta: enriquecer com Apollo
ID: 2026-11-16-floresta-enriquecer-apollo · Trilha: T3

- [x] lib/floresta.js: kv aid, enriquecer por apollo_id, _completarExistente, importar sempre enriquece
- [x] public/floresta-ui.js: caixa fixa, mensagem com motivo
- [x] tests/floresta-enriquecer.test.js (3 testes)

## Interseções
- T2: `api/apollo.js` enrich_batch não devolve o nome revelado; pedir que devolva first/last name para corrigir o sobrenome mascarado no HubSpot.
- Custo: sempre enriquecer gasta créditos de e-mail e de celular do Apollo por pessoa importada.

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 16/11/2026 | v3.527 entregue | nenhum | Fabio reimporta os mornos e confere e-mails e celulares |
