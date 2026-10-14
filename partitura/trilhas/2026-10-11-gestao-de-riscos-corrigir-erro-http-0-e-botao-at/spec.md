# Trilha: Gestão de Riscos — corrigir erro HTTP 0 e botão Atualizar com retry automático
ID: 2026-10-11-gestao-de-riscos-corrigir-erro-http-0-e-botao-at · Trilha permanente: T6 Financeiro · Dono: Fabio · Status: aprovada
Demanda: dem_muzhkv58n9ak · Tarefa: #73 · Aprovada por: Fabio (fundador) em 11/10/2026, na Esteira de Demandas.

## Problema
O QA de 2026-10-07 registrou [alta] dois achados críticos em s1riscos: botão '↻ Atualizar' retorna erro e a API falha com HTTP 0 — mesmos sintomas que derrubavam s3dashboard antes da correção v3.101. A tela é usada diariamente pelo fundador e alimenta o Gabinete de Simulação recém-implementado.

## Resultado esperado
Aplicar o mesmo padrão já consolidado em s3dashboard: (1) capturar HTTP 0 / timeout e exibir mensagem legível 'Sem conexão — tente novamente'; (2) botão Atualizar com retry automático (até 3x, backoff 2s); (3) skeleton enquanto carrega; (4) timeout de 15s com fallback gracioso mostrando os dados do último cache bem-sucedido (localStorage, chave `cache_riscos`). Nenhuma mudança de layout.

## Critérios de aceite
- [x] Botão Atualizar nunca fica em loading infinito — mostra erro ou dados em até 15s
- [x] HTTP 0 exibe mensagem 'Sem conexão — tente novamente' (não spinner eterno)
- [x] Se cache existir, tela exibe dados anteriores com aviso visual ao invés de tela em branco
- [ ] QA não registra mais achados [alta] em s1riscos nas próximas 2 execuções (verificação pós-merge)

Métrica de sucesso: zero achados [alta] em s1riscos no relatório do QA nas próximas 2 semanas.

## Escopo de arquivos (propriedade)
Pode alterar: nada de api/ (o backend já responde via `/api/financeiro`; não há `/api/riscos`)
Seção do public/index.html: s1riscos — markup `#page-s1riscos` (botão Atualizar) e o bloco JS "PAINEL DE RISCOS COM SEMÁFORO AO VIVO"
Só lê: partitura/contratos/**, `finApi()` (helper do Financeiro)
Interseções previstas: nenhuma

## Fora do escopo
- Botão "◆ Analisar Riscos" (IA via `runIntel`/`/api/claude` — trilha T3).
- Gabinete de Simulação (aba "Simular Cenário").
- Cache em KV no servidor (localStorage basta para o critério; KV exigiria mudança de contrato).
