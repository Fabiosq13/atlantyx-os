# Spec — Floresta de Vendas: enriquecer com e-mail e celular do Apollo
ID: 2026-11-16-floresta-enriquecer-apollo · Trilha: T3 · Aprovado por: Fabio (16/11/2026: "ok faça os ajustes" e "sempre que buscar do Apollo já enriquecer com telefone e e-mail")

## Problema
"📇 Buscar e-mail e celular" não funcionava para leads importados do Apollo: o sobrenome vem mascarado (ex.: "Bo***i"), a busca era por nome, e o identificador do Apollo não era guardado. Reimportar pulava contatos que já existiam.

## Escopo
- Guardar o identificador do Apollo por contato do HubSpot (kv `vendas:floresta:apollo_ids`, sem DDL).
- "Buscar e-mail e celular" usa o identificador; com nome mascarado e sem identificador, explica o motivo em vez de falhar em silêncio.
- Contato que já existia é completado (e-mail, LinkedIn, pedido de celular) quando reimportado.
- Importar do Apollo SEMPRE enriquece (e-mail e celular); a caixa deixou de ser opcional.
- A mensagem da tela mostra o motivo quando nada volta.

## Critérios de aceite
- [x] Importação guarda apollo_id; enriquecer por apollo_id funciona com nome mascarado.
- [x] Existente reimportado recebe e-mail e pedido de celular.
- [x] Motivo por contato aparece na tela.
- [x] Dados reais de clientes não aparecem em código, testes ou prompts (testes sintéticos).

## Fora do escopo
Corrigir o sobrenome mascarado já gravado (exige o endpoint do Apollo devolver o nome; Interseção T2 em api/apollo.js).
