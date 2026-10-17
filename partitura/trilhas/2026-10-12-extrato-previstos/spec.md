# Spec — Extrato com Saldo: mostrar previstos (T6)
BPM-Trilha: T6 · BPM-ID: 2026-10-12-extrato-previstos · aprovada pelo fundador em 2026-10-12 ("Ok")

## Escopo
Opção "Mostrar previstos" no Extrato com Saldo: depois dos lançamentos realizados, lista os futuros (a pagar e a receber do QuickBooks, marcos, agenda de despesas) com etiqueta e saldo projetado até a data final escolhida (ou 90 dias quando a data final é hoje ou anterior). A base é o `fluxo_detalhado`, então os números batem com o Fluxo Detalhado.

## Critérios de aceite
- Desligada: extrato idêntico ao anterior.
- Ligada: caixa-resumo (a receber, a pagar, saldo projetado) + linhas em itálico depois de uma faixa "Previstos", com etiqueta de origem; vencidos marcados.
- O saldo projetado parte do saldo final do extrato.
- Erro no fluxo não derruba o extrato (mostra aviso).
