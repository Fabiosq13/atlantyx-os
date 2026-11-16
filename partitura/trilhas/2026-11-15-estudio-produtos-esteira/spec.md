# Spec — Estúdio de Produtos e Esteira (Parte 4 da demanda)
ID: 2026-11-15-estudio-produtos-esteira · Trilha: T4 (tela) + T3 (agente) · Aprovado por: Fabio (anexou a demanda e pediu para construir por fases, 15/11/2026)
Fonte: Demanda_Atlantyx_OS_Partes_3_e_4.md, Parte 4. Fórmulas na seção 4, critérios de aceite na seção 7, ordem de entrega na seção 12.

## Escopo desta trilha
Tela "Estúdio de Produtos e Esteira" (menu Estratégia), chaves kv `sim:*`, cálculo em `lib/estudio-produtos.js`, ações em `api/estrategia.js`.
Todo valor é parâmetro editável; sementes entram marcadas "hipótese a validar". Nenhum cliente real em código/teste.

## Respostas do fundador às perguntas em aberto (15/11)
- R$ 276,56 por pessoa-dia = salário/PJ + encargos + ferramentas/nuvem.
- Recebimento: 30 dias após a conclusão.
- Capacidade: 3 Sprints por mês (Julio).
- Contrato mínimo de projeto sob medida (grandes): R$ 50.000.

## Fases (seção 12)
1. Premissas + cadastro de produtos com cálculo ao vivo — v3.519
2. Esteira A→B→C · 3. Simulador · 4. Comparação e sensibilidade · 5. Teste de escala e catálogo · 6. IA e margem × caixa mensal · 7. Dados reais e exportação
