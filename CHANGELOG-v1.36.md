# Atlantyx OS · v1.36 — Filtro de mês/ano no Dashboard Financeiro

## O que foi adicionado
No cabeçalho do Dashboard Financeiro:
- **Mês** (ou "Ano inteiro")
- **Ano** (últimos 5 anos)
- Botão **↺ Mês atual** para voltar ao corrente
- O período efetivamente usado aparece ao lado do título, em dourado
  (ex.: "período: 01/07/2026 a 31/07/2026")

O filtro vale para a receita do período, os lançamentos recentes e o DRE
consultado no QuickBooks — que antes eram fixos no mês corrente.

## Detalhe do cálculo que vale saber
- **Mês em curso**: vai do dia 1 até **hoje** (não até o fim do mês) —
  senão a receita apareceria comparada com um período que ainda não
  aconteceu
- **Mês fechado**: vai até o último dia real do mês (fevereiro respeita
  ano bissexto)
- **Ano inteiro**: janeiro a dezembro, ou até hoje se for o ano corrente
- O rótulo mostra "(em curso)" quando o período ainda não fechou

## O que NÃO muda com o filtro (de propósito)
Saldo em caixa, a receber e a pagar são **posições de hoje** — não fazem
sentido "no mês passado", porque representam o estado atual das contas.
Continuam mostrando a posição atual mesmo com o filtro em outro período.

## Validação
Seletores populados; início no mês corrente; payload correto para mês
específico e para ano inteiro; label refletindo o período que o backend
usou (não o que a tela supõe); botão Mês atual. Cálculo de períodos
conferido: mês em curso até hoje, mês fechado até o último dia,
fevereiro com 28/29 dias conforme o ano.

## Arquivos
- api/financeiro.js · public/index.html
