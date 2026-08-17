# Atlantyx OS · v1.6 — Arquitetura em 2 fases: imune a 504

## Contexto
O 504 persistiu MESMO com o vercel.json commitado (confirmado pelo usuário).
Causas possíveis: limite real da função abaixo de 60s no plano/projeto, ou
API de IA lenta o bastante para estourar o teto com 4 calls num request só.
Em vez de apostar em configuração, a v1.6 elimina o problema por arquitetura.

## Como funciona agora

A criação faz DOIS requests curtos em vez de um longo:

  FASE 1 (~8-15s): Storyteller + Copywriter
    → retorna narrativa + copy · pipeline marca ✓✓
  FASE 2 (~8-15s): Designer ‖ Copy-por-rede (paralelos) + post
    → retorna design + copy_por_rede

Cada request fica MUITO abaixo de qualquer limite de tempo (até dos 10s
default, na maioria dos casos; com folga total sob 60s).

## Resiliência nova
- Se a FASE 2 falhar (timeout, erro): a campanha É SALVA mesmo assim com
  narrativa+copy, aviso claro no log/toast, e o "↻ Re-rodar com IA" completa
  o design depois. Antes: perdia-se tudo.
- Fase 1 com 504 (improvável, 2 calls): mensagem explica que o limite de
  10s está ativo e como verificar o vercel.json no Source do deploy.
- Action campanha_completa (1 request) mantida por compatibilidade.

## Backend
- Novas actions: campanha_fase1 (Story+Copy) e campanha_fase2
  (Designer ‖ PorRede + post), reusando os agentes existentes.

## Frontend
- criarCampanhaCompleta orquestra as 2 fases com o pipeline visual
  atualizando entre elas; monta o `data` no mesmo shape do fluxo antigo
  (editor, kanban, publicação: zero mudanças).

## Validação (JSDOM)
- Sequência fase1 → fase2 → salvar: tag "Criada", 0 erros
- Fase 2 com 504 simulado: campanha ainda salva ("Criada"), aviso no log

## Arquivos alterados
- api/s2-creative.js
- public/index.html
