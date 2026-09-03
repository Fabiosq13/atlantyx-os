# Atlantyx OS · v1.33 — Datas de emissão e pagamento explícitas no Kanban

## No card (visão do quadro)
Rodapé do card com as duas datas, em dia/mês:
- **🧾 05/08** — data de emissão da nota fiscal. Se houve mais de uma
  emissão, aparece **05/08+** (passe o mouse para ver a data da última)
- **💵 20/08** — data do pagamento. Verde quando todas as empresas
  pagaram; **dourado com asterisco (20/08*)** quando é pagamento parcial

Assim dá para bater o olho no quadro e ver há quanto tempo a nota foi
emitida e se o dinheiro entrou.

## No detalhe do termo
Três linhas novas no cabeçalho:
- **🧾 Emissão da NF**: data completa, com a data da última emissão entre
  parênteses quando há mais de uma. "não emitida" quando ainda não houve
- **💵 Pagamento**: data com indicação de **(completo)** ou **(parcial)**,
  colorido conforme o caso. "não pago" quando pendente
- **Aprovado em**: data e quem aprovou

## Na tabela de empresas
Cada empresa mostra sua própria data de emissão e de pagamento embaixo
do status, com um **✎ para ajustar manualmente** — útil quando a nota foi
emitida em data diferente da que o sistema capturou, ou quando o
pagamento caiu em outro dia.

## Como as datas do termo são calculadas
- **Emissão**: a primeira NF emitida entre as empresas do rateio
- **Pagamento**: o último pagamento recebido
- **Completo**: só quando todas as empresas estão pagas
Faz sentido porque um termo rateado tem várias notas e vários pagamentos
— o card mostra o começo da emissão e o estado mais recente do dinheiro.

## Validação
Card com as duas datas, indicador de múltiplas emissões e de pagamento
parcial; detalhe com datas completas e status; datas por empresa na
tabela; edição manual gravando no formato certo e rejeitando formato
inválido.

## Arquivos
- api/faturamento.js · public/index.html
