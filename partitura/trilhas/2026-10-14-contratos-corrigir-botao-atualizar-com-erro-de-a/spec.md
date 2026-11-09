# Trilha: Contratos — corrigir botão Atualizar com erro de API (HTTP 0 / falha de rede)
ID: 2026-10-14-contratos-corrigir-botao-atualizar-com-erro-de-a · Trilha permanente: T6 · Dono: T6 Financeiro · Status: aprovada
Demanda: dem_mv8f320bgm7t · Tarefa: #85 · Aprovada por: fundador em 2026-10-14

## Problema
O QA de 14/10 registrou erro de alta severidade: "Botão ↻ Atualizar chamou a API e recebeu erro" na tela s3contratos.
O fundador usa essa tela para acompanhar os contratos ativos; um botão de atualização quebrado impede a visibilidade de receita recorrente.

Diagnóstico: o botão chama `carregarContratos()` → `finApi('contrato_list')` → `POST /api/financeiro`. A ação só lê
`contratos_financeiros` no Neon (não consulta o QuickBooks) e a chamada é de mesma origem (sem CORS). O erro é HTTP 0
(falha de rede / cold start da função), e o front fazia uma única tentativa, sem timeout, sem estado de carregamento
e sem proteção contra cliques repetidos.

## Resultado esperado
Clicar em ↻ Atualizar mostra skeleton na tabela, tenta de novo sozinho em falhas transitórias e, se não conseguir,
mostra um alerta inline com o status HTTP e a mensagem — sem ficar carregando para sempre.

## Critérios de aceite
- [x] Clicar em '↻ Atualizar' em s3contratos dispara a chamada e exibe skeleton enquanto aguarda
- [x] Se a API falhar, o sistema tenta 3 vezes e exibe mensagem de erro com detalhe (status HTTP)
- [x] Quando a API responde com sucesso, a tabela de contratos é atualizada corretamente
- [ ] Não há mais erro de alta severidade para s3contratos no próximo relatório do QA (verificar após o merge — ver Interseção T1 no plano)
- [x] O botão Atualizar não fica em estado de loading indefinido (timeout máximo 10s)

Decisões de implementação:
- Retry: 3 tentativas com 1s entre elas, só para erros transitórios (HTTP 0/rede, timeout, 5xx). Erros 4xx (ação
  inexistente, sessão) não se repetiriam e são mostrados na hora.
- Timeout: cada tentativa usa AbortController (via `finApi(..., { timeoutMs })`) limitado ao que sobra de um prazo
  total de 10s — a operação inteira nunca passa de ~10s, mesmo com retries.

## Escopo de arquivos (propriedade)
Pode alterar: nenhum arquivo de API (o backend `contrato_list` já está correto)
Seção do public/index.html: tela s3contratos (`#page-s3contratos` e o bloco JS "Tela de Contratos")
Só lê: api/financeiro.js, partitura/contratos/**
Interseções previstas: nenhuma

## Fora do escopo
Mudança de banco, de contrato de API, do `finApi` compartilhado e do CSS global (reaproveita a classe `.skel` existente).
