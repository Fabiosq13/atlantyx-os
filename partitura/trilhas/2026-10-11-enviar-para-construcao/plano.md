# Plano — Enviar para construção
ID: 2026-10-11-enviar-para-construcao · Trilha: T1

## Fase 1 — Regras do método para trilhas de produto
- [x] lib/bpm.js: trilha P-<pasta> só altera produtos/<pasta>/** (+ partitura/trilhas/<ID>)
- [x] workflow claude-correcao.yml: aceitar P-<pasta> e baixar a partitura do produto (BPM-Produto)

## Fase 2 — Backend
- [x] api/agente-ideias.js: demandaProduto (cria e envia), corpo da tarefa com seção do produto, sync move item do Kanban
- [x] api/fabrica.js: construcao_obter, construcao_enviar (fundação), construcao_item, construcao_pacote (para o robô)

## Fase 3 — Telas
- [x] Aba 🏗 Construção na Esteira de Entrega
- [x] Esteira de Demandas: origem 🏭 Fábrica e filtro

## Fase 4 — Validação
- [x] Teste ponta a ponta com GitHub simulado; validar.mjs; bpm-gates

## Interseções
- Nenhuma de banco (kv_store com prefixo próprio)

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-11 | spec aprovada, plano criado | — | Fase 1 |
| 2026-10-11 | fases 1–4 concluídas; teste ponta a ponta com GitHub simulado ok | — | escolher o primeiro projeto real e publicar o produto na Vercel |
