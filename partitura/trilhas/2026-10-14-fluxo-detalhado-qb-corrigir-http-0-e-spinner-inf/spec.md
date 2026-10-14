# Trilha: Fluxo Detalhado QB — corrigir HTTP 0 e spinner infinito com retry + skeleton
ID: 2026-10-14-fluxo-detalhado-qb-corrigir-http-0-e-spinner-inf · Trilha permanente: T6 · Dono: T6 Financeiro (Teclado) · Status: aprovada
Demanda: dem_mv2cg7stuynn · Tarefa: #81 · Aprovada por: fundador (Esteira de Demandas) em 2026-10-14

## Problema
O QA de 09/10 registrou erro HTTP 0, botão "Atualizar" falhando e spinner que não sai na tela s3fluxodet.
É a tela de maior uso financeiro do dia a dia do fundador (combina extrato real + futuro) e está inutilizável sob carga.
Área: financeiro · Impacto 5/5 · Esforço M · Risco baixo.

## Resultado esperado
A tela abre com skeleton imediato. Chamadas à API do QB são repetidas automaticamente (até 3x, backoff exponencial)
quando a falha é transitória (rede/HTTP 0, 5xx, gateway). Se em 15s não carregar, aparece mensagem clara com botão
"Tentar novamente". Nenhum estado de carregamento fica sem prazo.

## Critérios de aceite
- [x] Skeleton aparece em menos de 200ms ao abrir a tela
- [x] Se a API demorar mais de 15s, aparece mensagem de erro com botão retry
- [x] HTTP 0 não deixa spinner girando — exibe erro tratado
- [x] Botão "Atualizar" funciona sem erro após a correção
- [ ] QA não registra mais [alta] nessa tela (verificar nos próximos 3 relatórios de QA)

Métrica de sucesso: zero ocorrências de [alta] ou spinner infinito na tela s3fluxodet nos próximos 3 relatórios de QA.

## Escopo de arquivos (propriedade)
Pode alterar: `api/financeiro.js`
Seção do public/index.html: tela s3fluxodet (`#page-s3fluxodet` e as funções `carregarFluxoDetalhado`/`_fd*`, `verRazaoConta`, `compararSaldoPorConta`)
Só lê: partitura/contratos/**
Interseções previstas: `lib/fetchRetry.js` (sugerido na orientação) não está no escopo da T6 — o helper foi criado dentro da seção da tela (ver plano.md › Interseções).

## Fora do escopo
- Mudar o formato de erro da API (`{ success:false, error }` continua — é o contrato que todas as telas financeiras leem).
- Alterar `nav()`, menu, CSS global (T4) ou outras telas financeiras.
- Arquivos `api/quickbooks*.js` não existem; as chamadas ao QB estão em `api/financeiro.js` (T6).
