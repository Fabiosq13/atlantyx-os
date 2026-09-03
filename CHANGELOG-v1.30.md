# Atlantyx OS · v1.30 — Conselheiros com visão financeira completa

## Duas falhas corrigidas

### 1. Falha silenciosa (a mais grave)
Os dados financeiros chegavam aos conselheiros por uma chamada HTTP de um
módulo para o outro, que dependia da variável MEDIA_PUBLIC_BASE. Se ela
não estivesse configurada, o bloco falhava **em silêncio** e eles
opinavam sobre investimento **sem nenhum dado financeiro** — com a mesma
confiança de quem tem os números na mão.

Agora o financeiro é lido **direto do banco** (mesma base, sem HTTP entre
módulos). E se a leitura falhar, o contexto carrega um aviso explícito:
*"ATENÇÃO: você está SEM dados financeiros nesta conversa. Diga isso
claramente antes de opinar sobre dinheiro."* — o conselheiro avisa em vez
de inventar.

### 2. Faltava a projeção (só tinham a foto de hoje)
Passaram a enxergar:
- **Despesas do mês corrente** (pagas e a pagar, com quantidade)
- **Compromissos dos próximos 90 dias** — o que ainda vai sair do caixa
- **A receber de marcos** de projeto, por etapa do Kanban
- **Faturamento em andamento** — termos por fase e valor
- **Contratos vencendo em 90 dias** (risco de receita)
- **Carteira de projetos** por status
- **Saldo previsto 90 dias**: a receber − a pagar, com a diferença

Para uma pergunta como "podemos investir R$ 500 mil?", agora a resposta
tem base: *"com 210 mil a pagar nos próximos 90 dias e 275 mil a receber,
a folga é de 65 mil — investir 500 mil aperta o caixa"*.

Nova instrução aos conselheiros: antes de opinar sobre investimento ou
gasto, olhar compromissos e saldo previsto.

## Observação honesta mantida no contexto
O saldo bancário exato vem do QuickBooks e não entra aqui (evita
depender de API externa no meio de uma conversa por voz). O contexto diz
isso ao agente, que orienta a consultar o Gerente Financeiro IA quando o
caixa exato for necessário.

## Validação
- Com dados: cálculo conferido (275.000 − 210.000 = 65.000 ✓), todos os
  blocos presentes no prompt
- Com o banco fora do ar: erro registrado e agente avisado — sem falha
  silenciosa

## Arquivo
- api/rh.js
