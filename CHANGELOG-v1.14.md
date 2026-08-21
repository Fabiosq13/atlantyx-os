# Atlantyx OS · v1.14 — Dashboard Financeiro + Gerente Financeiro IA

## Menu S1 · FINANCEIRO (ordem nova)
📈 Dashboard Financeiro (KPIs)   ← novo, no topo
GERENTE FINANCEIRO IA
  🤖 Gerente Financeiro IA (chat)   ← novo
EXTRATOS & SALDOS · PLANEJAMENTO · CONTROLE · PROJETOS · INTELIGÊNCIA
  (Análise Financeira IA e Dados Reais continuam)

## Dashboard Financeiro
8 KPIs no topo: saldo em caixa · a receber · a pagar · receita do mês (e
ano) · saúde financeira (semáforo com motivos) · orçamento utilizado (% e
realizado/orçado) · conciliação (taxa, batidos/pendentes) · marcos
aguardando pagamento (valor + qtd em fluxo). Abaixo: gráfico de barras
do fluxo de caixa dos próximos 6 meses (entradas/saídas/saldo), lista de
indicadores de saúde e últimos lançamentos do QuickBooks. Aviso vermelho
com "reconectar" se o QB não responder. Botão "Perguntar ao Gerente IA".

## Gerente Financeiro IA (chat livre)
Um CFO virtual que responde com os SEUS dados reais: a cada pergunta o
backend monta o contexto (QuickBooks: caixa/receber/pagar/receita; KPIs de
saúde; fluxo 6 meses; conciliação; marcos; orçamento; últimos
lançamentos) e envia ao Claude com histórico da conversa (últimas 10
mensagens). Perguntas rápidas prontas (resumo executivo, fluxo 6 meses, o
que cobrar primeiro, onde cortar, entender indicadores, decisões da
semana). Painel "Contexto usado" mostra os números que embasaram a
resposta. Regras do agente: nunca inventar valores; dizer quando um dado
não existe; sugerir ações concretas; explicar conceitos com o caso real.
Backend: actions `dashboard_financeiro` e `gerente_financeiro`.

## Validação (JSDOM)
Dashboard renderiza KPIs/semáforo/orçamento/fluxo; chat envia, recebe e
guarda histórico; 0 erros JS. Arquivos: api/financeiro.js · public/index.html
