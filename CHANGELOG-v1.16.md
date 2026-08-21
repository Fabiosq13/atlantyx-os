# Atlantyx OS · v1.16 — Fluxo de Caixa Detalhado (Extrato + Futuro lançamento a lançamento)

## Nova tela: S1 · Financeiro → Fluxo Detalhado (Extrato + Futuro)
Uma única tela em formato extrato contínuo:

### 📗 Realizado — até hoje
Reaproveita o extrato consolidado (últimos 60 dias, ajustável): lançamentos
reais do QuickBooks + simulados, com saldo acumulado linha a linha.

### 📘 Projetado — a partir de hoje
Lançamento a lançamento, SEM limite fixo de meses — vai até onde o
QuickBooks tiver dado:
- Recebíveis reais: Invoice em aberto (Balance > 0), pela data de
  vencimento
- Pagáveis reais: Bill em aberto (Balance > 0), pela data de vencimento
  (novas actions/queries QB: `qbFuturosDetalhado`)
- Complementado por despesas programadas do Atlantyx com ocorrência
  futura e lançamentos simulados futuros (fontes marcadas: 🔗 QuickBooks
  · 📋 Atlantyx · ✎ Simulado)
Saldo projetado calculado em cascata a partir do saldo real de hoje.

### KPIs e alertas
Saldo de hoje · A receber futuro (QB) · A pagar futuro (QB+Atlantyx) ·
Saldo projetado final. Alerta vermelho se o saldo projetado ficar
negativo em algum ponto (com a data e o lançamento que causa) ou verde
confirmando que permanece positivo em todo o horizonte.

## Fix de bug (achado ao reaproveitar o extrato)
`extrato_consolidado` (v1.15) tinha `qb_erro`/`qb_lancamentos` colocados
dentro de CADA lançamento em vez do topo da resposta — o aviso "sem
lançamentos no período" nunca aparecia de verdade. Corrigido; o Extrato
tradicional também se beneficia.

## Backend
- `qbFuturosDetalhado()`: Invoice e Bill em aberto via QB query
- `fluxoDetalhado()`: junta realizado (extrato) + futuro (QB + Atlantyx),
  ordena, calcula saldo em cascata, aponta o menor saldo do horizonte
- action `fluxo_detalhado`

## Validação (JSDOM)
KPIs corretos, tabelas passado/futuro renderizadas, alerta de saldo
negativo disparando com a data/descrição certas. 0 erros.
Arquivos: api/financeiro.js · public/index.html
