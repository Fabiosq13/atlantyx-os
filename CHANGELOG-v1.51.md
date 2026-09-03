# Atlantyx OS · v1.51 — De onde vinha o -R$ 326.754,24

## A resposta
Não vinha do QuickBooks. Era resultado de uma conta que **deveria se
cancelar e não cancelava**.

Desde a v1.46.1, o saldo inicial do período é calculado assim:
```
saldo inicial = saldo do QuickBooks hoje − movimento do período até hoje
```
E depois o extrato faz o caminho de volta:
```
saldo final = saldo inicial + movimento do período
```

Matematicamente isso deveria devolver **exatamente o saldo do
QuickBooks**. Só que os dois "movimento" eram calculados de formas
diferentes — e a diferença entre eles aparecia inteira no resultado.

Reproduzi com os seus números: saldo real -R$ 15.000, movimento de
R$ 311.754,24 contado só de um lado → **-R$ 326.754,24**. Bate exatamente.

## As 3 diferenças encontradas
1. **Período**: o cálculo do saldo inicial ia até HOJE (27/08), enquanto
   o extrato somava até o FIM DO FILTRO (31/08) — lançamentos entre essas
   datas entravam de um lado só
2. **Simulados**: entravam no extrato, mas não eram descontados ao
   retroagir o saldo
3. **Throttle**: uma consulta podia falhar em um dos dois cálculos e não
   no outro (corrigido na v1.49, mas somava-se ao problema)

## Correção
Os dois cálculos passam a usar exatamente a mesma base: mesmo período,
mesmos filtros de lançamentos ocultos e mesmos simulados. Com isso, o
saldo calculado deve bater com o saldo do QuickBooks — e a divergência,
quando existir, passa a indicar problema real nos dados, não erro de
conta.

## Transparência
O painel de divergência agora mostra a composição do saldo inicial:
*"R$ -15.000,00 (saldo do QuickBooks hoje) − R$ 311.754,24 (movimento do
período) = R$ -326.754,24"* — assim dá para ver a conta sendo feita.

## Arquivos
- api/financeiro.js · public/index.html
