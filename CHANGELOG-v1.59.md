# Atlantyx OS · v1.59 — O saldo inicial vinha ZERO (a tela mostrou isso)

## O diagnóstico estava na própria tela
Sua imagem mostrava, em cinza:
*"Composição do saldo inicial: R$ 0,00 (saldo do QuickBooks hoje) −
R$ 0,00 (movimento do período) = R$ 0,00"*

E a primeira linha do extrato tinha saldo -R$ 299,00 — exatamente o valor
da tarifa, sem nenhuma abertura somada.

## A causa
A busca do saldo pelo **Balanço Patrimonial** precisava localizar a conta
dentro de um relatório aninhado, casando por id ou nome. Quando não
encontrava (o que aconteceu), devolvia null → o saldo inicial virava
ZERO → toda a coluna de saldo saía errada.

Eu tinha trocado para essa fonte na v1.57 justamente para fugir do
CurrentBalance contaminado por lançamentos futuros. A ideia estava certa,
a implementação dependia de um casamento frágil.

## A correção — método direto
O saldo de abertura passa a ser a **soma de todas as transações da conta
até a data**, usando exatamente a mesma fonte que o extrato usa para
somar o resto da coluna.

Por que isso é melhor:
- Não depende de localizar a conta dentro de um relatório
- Usa os mesmos dados que a coluna de saldo soma logo em seguida — então
  a conta fecha por construção
- Se der zero, é porque realmente não há transações anteriores, não
  porque a busca falhou

## Proteções
- Se a consulta atingir o limite de 1000 transações, avisa que o
  histórico pode estar truncado e sugere cadastrar um Saldo Inicial
- Se a consulta falhar por throttle, **não devolve número parcial** —
  prefere admitir que não sabe a dar um valor errado com cara de certo

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.59)
