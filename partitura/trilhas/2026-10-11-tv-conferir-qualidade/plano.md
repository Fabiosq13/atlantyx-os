# Plano — TV: conferir, logo e qualidade
ID: 2026-10-11-tv-conferir-qualidade · Trilha: T4

## Fase 1
- [x] api/tv.js: ação conferir, slide Qualidade, logo, rótulos
- [x] Tela da TV no index.html: botão Conferir, checkbox Qualidade
- [x] Teste (slides e painel de conferência)

## Fase 2 (v3.156)
- [x] Projetos lidos do módulo de projetos (Maestro, base atlx_store via CRONOGRAMA_DATABASE_URL) com a mesma regra de farol de lá
- [x] Slide Projetos: indicadores + lista com data de conclusão e farol (opção de esconder nomes)
- [x] Qualidade › Projetos passa a usar o Maestro (com fonte na tela)

## Interseções
- T3: api/pmo.js ganhou maestro_painel (leitura do módulo de projetos)
- T3: api/vendas.js — metas do painel de vendas passam a vir de metas_empresa_status / resultado_kpis (feito junto, aprovação do Fabio)
- T6: leitura de extrato_consolidado, higienizacao_dados, painel_resumo (somente leitura)

## Registro da Batida
| Data | Status | Bloqueio | Próximo passo |
|---|---|---|---|
| 2026-10-12 | no ar (v3.156) | — | Fabio confere a lista de projetos na TV |
| 2026-10-11 | no ar (v3.152) | — | Fabio confere o caixa e o farol com os dados reais |
- [x] v3.474 · Gestão à vista (TV) remodelada e dados corrigidos: (1) Financeiro — os 5 cartões do mês liam D.fin.res, mas o resultado vem em D.res: por isso ficavam sempre em "—"; corrigido; faturamento do ano compacto e gráfico do ano em barras com valor (o SVG esticado deformava o texto); (2) cada bloco guarda o último dado bom (kv tv:ultimo_bom) e a TV mostra esse número com a hora quando QuickBooks/HubSpot não respondem, e erros do QuickBooks aparecem por extenso; (3) Vendas — metas de quantidade inteiras (54,3 → 55), coluna da direita do funil compacta (sem sobreposição), faixa Ganho no mesmo critério do cartão (valor), proposta sem valor de meta mostra só a quantidade; taxa de ganho do "pipeline necessário" exige 3+ ganhos e 3+ perdidos e limita a 60% (com poucas perdas registradas dava ~100% e meta = só o que falta → 1.105%); (4) Marketing — linhas com altura fixa, aviso sem campanha ativa e funil do mês no HubSpot ao lado; (5) Qualidade — 3 cartões (termos, QuickBooks, projetos) + faturado no mês / a faturar / aguardando pagamento.
- 12/11/2026 · v3.474 · ok · — · conferir na TV com dados reais
- [x] v3.475 · Qualidade (TV): cada cartão responde uma pergunta com um número grande e um "O que fazer"; termos mostram o R$ parado nos termos com pendência; QuickBooks deixa de somar "registros com erro" (somava meses + lançamentos + contas) e mostra quantos problemas há; o cartão de Projetos (repetia o slide de Projetos) deu lugar ao "Cadastro no HubSpot" (negócios abertos sem valor, por etapa — eles não entram no pipeline da tela de Vendas); selo de status no lugar do semáforo grande.
- 12/11/2026 · v3.475 · ok · — · —
