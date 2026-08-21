# Atlantyx OS · v1.16.1 — Filtro de data no Fluxo Detalhado

## Novo no cabeçalho da tela
Campos DE / ATÉ (data) + atalhos:
- 60d passados (só realizado, sem futuro)
- ±30/90d (30 dias de histórico, 90 dias de projeção)
- 3m passado · 1a futuro (90 dias histórico, 365 dias projeção)
- ✕ Limpar (volta ao padrão: 60 dias atrás, futuro SEM limite — como era)
Mudar qualquer campo recarrega automaticamente. Checkbox "incluir
simulados" também recarrega ao alterar.

## Comportamento do período
- DE define o início do realizado (extrato)
- ATÉ define o fim da projeção futura; vazio = sem limite (mostra tudo
  que o QuickBooks tiver de recebível/pagável em aberto)
- Se ATÉ for uma data no passado, a tela mostra só o realizado daquele
  intervalo (sem seção futura) — útil para conferir um período fechado
- O saldo passado→futuro continua em cascata a partir do saldo real de
  hoje, sempre

## Backend
qbFuturosDetalhado aceita data_inicio; fluxoDetalhado recebe
data_inicio/data_fim explícitos e propaga para extrato, QB futuro,
despesas programadas futuras e simulados futuros.

## Validação (JSDOM)
Data início default preenchida na 1ª carga; preset 3m/1a envia o período
correto; limpar volta fim vazio (sem limite). 0 erros.
Arquivos: api/financeiro.js · public/index.html
