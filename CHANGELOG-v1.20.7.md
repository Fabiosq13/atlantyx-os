# Atlantyx OS · v1.20.7 — Correção da tela KPIs de Saúde Financeira

## O que estava errado (a partir do print)

### 1. "ROI Total" era igual a "Margem Líquida" (-176.91% nos dois)
Bug de exibição: o frontend usava a mesma variável (margem_liquida_pct)
nos dois cartões — não existia cálculo de ROI de verdade. Corrigido:
ROI agora é lucro do mês ÷ patrimônio líquido (do Balanço Patrimonial do
QuickBooks) — uma métrica genuinamente diferente. Sem dado de patrimônio
no QB, mostra "—" (não inventa número).

### 2. Runway mostrando "—" com caixa negativo
Com saldo de caixa negativo (como no seu print: -R$ 730.741,96), a conta
antiga não calculava nada e sumia. Agora mostra "0m ⚠" explicitamente —
sem fôlego de caixa nenhum é uma informação tão importante quanto "12
meses de runway", não devia desaparecer da tela.

### 3. Tributário + Compliance 100% em branco (DAS, FGTS, IRPJ/CSLL, ISS)
Esse painel nunca teve cálculo nenhum implementado — os 4 campos eram só
placeholders visuais. Como regime tributário, alíquotas e folha de
pagamento são informações que só você tem (o sistema não pode adivinhar
se você é Simples/Presumido/Real, sua faixa do Simples, ou o ISS do seu
município), implementei uma CONFIGURAÇÃO transparente:
- Botão "⚙ Configurar" no painel → informa regime, alíquota do
  DAS (se Simples), alíquota de IRPJ+CSLL (se Presumido/Real), alíquota
  de ISS do município, e folha de pagamento mensal
- Com isso configurado, os 4 campos passam a calcular:
  FGTS = folha × 8% · DAS = receita do mês × alíquota · IRPJ/CSLL =
  lucro do mês × alíquota (Simples: "incluso no DAS") · ISS = receita ×
  alíquota
- Sem configurar, aparece um aviso claro explicando o que fazer — em vez
  de traços mudos sem explicação
- Todo valor calculado é rotulado "(estimativa)" e o painel deixa claro
  que não substitui o cálculo do contador

## 4. Regressão que eu mesmo causei na v1.20.6 (achada e corrigida)
Ao implementar o lançamento de despesas no QuickBooks, despesas lançadas
passaram a ter status 'lancada' em vez de 'prevista' — mas o cálculo de
"Cobertura de Despesas Fixas" só somava status='prevista', então toda
despesa que você lançasse no QB (ação que acabei de entregar) sumia
desse cálculo, subestimando quanto o caixa cobre das despesas fixas.
Corrigido: agora conta tudo que não está pago ('prevista' + 'lancada').

## Validação
Testei com os números exatos do seu print (saldo -R$ 730.741,96, receita
R$ 79.280, despesa R$ 219.534,17): ROI passa a ser diferente da margem
(-12,4% vs -176,91%), Runway mostra "0m ⚠", painel tributário mostra
aviso sem config e calcula certo depois de configurar (DAS R$ 4,8k, FGTS
R$ 1,2k, ISS R$ 4,0k, IRPJ/CSLL "incluso no DAS" para regime Simples).
Árvore DOM: 73 páginas, 0 aninhadas. 0 erros JS.

## Arquivos
- api/financeiro.js (ROI via Balance Sheet, runway com caixa negativo,
  fix da regressão de cobertura de despesas fixas)
- public/index.html (config de tributos, render corrigido de
  ROI/Runway/Tributário)
