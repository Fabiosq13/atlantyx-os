# Atlantyx OS · v1.15 — Financeiro com QuickBooks: por que "não veio nada" e o que mudou

## Diagnóstico (a partir dos 5 prints)
Boa notícia: as telas AGORA renderizam (v1.14.1 resolveu a tela preta). O
que aparece zerado tem duas causas prováveis, e a versão nova torna isso
VISÍVEL em vez de zero silencioso:
1. Sandbox da Intuit: a "Sandbox Company_US_1" tem lançamentos em datas
   antigas (na criação da empresa) e em USD. Extrato/Saldo Diário/Mensal
   com período de agosto/2026 → zero, corretamente. Orçamento: o sandbox
   não tem Budget cadastrado. Fluxo Futuro: o "R$ 2.001,00" repetido é o
   saldo das contas bancárias do sandbox (Checking $1.201 + Savings $800)
   sem nenhuma entrada/saída futura cadastrada — não é bug, é falta de
   dados (Despesas 0 · Simulados 0).
2. Erros de consulta ao QB eram engolidos (console.log) → a tela mostrava
   zero sem explicar.

## Novidades
- 🔎 Diagnóstico QuickBooks (tela Realizado QuickBooks): empresa, país,
  moeda, realm, origem/validade dos tokens, contagem por entidade
  (Purchase, Deposit, Invoice, Bill, Payment, JournalEntry, SalesReceipt)
  com PRIMEIRA e ÚLTIMA data de lançamento, contas bancárias e saldos, e o
  INTERVALO DE DATAS COM DADOS — "há lançamentos entre X e Y; ajuste
  Início/Fim". Em segundos você sabe o que a empresa conectada tem.
- Extrato: aviso embaixo da tabela quando o QB retorna erro (com link
  reconectar) ou quando não há lançamentos no período (com a orientação
  do diagnóstico). Loader avisa após 8 s que o QB pode levar até 60 s.
- Realizado QuickBooks: o aviso amarelo "adicione QB_CLIENT_ID..." era
  HTML fixo — agora some quando conectado e, se aparecer, oferece o botão
  Conectar (OAuth) em vez de mandar criar variáveis.
- Agenda de Despesas: passa a incluir as CONTAS A PAGAR DO QUICKBOOKS
  (Bills com vencimento no período, inclusive vencidas nos últimos 90
  dias) junto com as despesas programadas: fonte "quickbooks", categoria
  "QuickBooks · Conta a pagar", valor = saldo em aberto, status
  prevista/paga. Badge "QB: n" no cabeçalho; detalhe do dia marca a
  origem. Log informa quantas vieram do QB e eventual erro.
- Backend: `qb_diagnostico`; `extrato_consolidado` devolve `qb_erro` e
  `qb_lancamentos`; `qbLancamentos` acumula `erros` por query;
  `desp_ocorrencias` aceita `incluir_qb` (default true).

## O que fazer para ver dados no sandbox
Realizado QuickBooks → 🔎 Diagnóstico → veja o intervalo (ex.: 2025-01 a
2025-07) → no Extrato/Saldo Diário/Mensal ajuste Início/Fim para esse
intervalo → Atualizar. Para orçamento e fluxo com dados, use as
ferramentas do próprio Atlantyx (Agenda de Despesas, simulados, marcos)
ou aguarde a conexão com a empresa real (Production).

Arquivos: api/financeiro.js · public/index.html
