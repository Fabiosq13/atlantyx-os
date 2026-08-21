# Atlantyx OS · v1.20.2 — Importação de Termo: parser por texto (não mais por posição)

## O erro relatado
Termo "UC - Atlanteam v2" importado com valor total R$ 63.504,66 na tela,
mas a planilha diz R$ 109.208,00 na linha "Total" — e o cabeçalho (Projeto,
Contratante, Período) apareceu com o texto literal do rótulo em vez do
valor. Causa raiz: o parser lia CADA campo por POSIÇÃO FIXA de linha/coluna,
calibrada nos 4 modelos originais (todos de projetos CPFL/Sustentação com
o mesmo layout). Este modelo "v2" tem uma estrutura diferente — muito
provavelmente uma coluna a mais deslocando "Valor desta Parcela" para
outra coluna, e os rótulos de cabeçalho não estavam na mesma célula que
o valor.

## Fix: leitura por TEXTO de rótulo/cabeçalho, não mais por posição
- Cabeçalho (Projeto, Contratante, CNPJ, Período, Nº Termo, Marco):
  o sistema agora PROCURA a célula cujo texto começa com o rótulo (ex.:
  "Nome do Serviço/Projeto") em toda a área inicial da planilha, e pega
  o valor dela mesma, da célula à direita, ou da célula abaixo — o que
  tiver. Funciona em qualquer variação de layout.
- Tabela de rateio: cada coluna (Contrato, NCM, % Por Empresa, Valor Já
  Faturado, **Valor desta Parcela**, Saldo do Contrato...) é identificada
  pelo TEXTO do próprio cabeçalho da tabela, não pela posição. Uma coluna
  a mais ou a menos não quebra mais a leitura.
- "Parcela" (que normalmente não tem rótulo próprio) é buscada na mesma
  linha onde o número do termo foi encontrado.

## Nova proteção: conferência automática contra o "Total R$" da planilha
Se a própria planilha tiver uma linha "Total" na tabela de rateio, o
sistema agora SOMA o que leu e COMPARA com esse total declarado. Se a
diferença for maior que R$ 1,00, a importação é BLOQUEADA com uma
mensagem clara em vez de importar dados errados silenciosamente — exatamente
o tipo de erro que aconteceu aqui não vai mais passar batido.

## Validação
- Reprocessados os 4 arquivos originais (XPLANN, Anaplan, Projeto
  Cadastro, Sustentação) com o parser novo: mesmos valores de antes,
  sem regressão (Sustentação: 9 empresas, R$ 32.731,68, igual). Bônus:
  "Nº Termo/Parcela" que às vezes vinha incompleto agora sai certo
  (ex.: "33/33/36").
- Simulei o cenário exato do bug (planilha com uma coluna "Código" extra
  deslocando "Valor desta Parcela"): o parser novo leu CERTO — R$
  109.208,00 — batendo com os 4 valores do seu print (51.458,90 +
  20.150,18 + 5.246,90 + 32.352,02).
- Simulei uma divergência real entre a soma e o "Total" declarado: a
  importação foi bloqueada com mensagem clara, como esperado.
- Árvore DOM: 73 páginas, 0 aninhadas. 0 erros JS.

## Recomendação
Reimporte o termo "UC - Atlanteam v2" — agora deve trazer as 4 empresas
com R$ 51.458,90 / R$ 20.150,18 / R$ 5.246,90 / R$ 32.352,02, somando
R$ 109.208,00. Se o termo errado (R$ 63.504,66) já foi importado, exclua
esse termo no Kanban de Faturamento e reimporte.

## Arquivo
- public/index.html (função de parsing reescrita)
