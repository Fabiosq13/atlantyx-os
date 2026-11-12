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
- [x] v3.476 · gráfico "Evolução no ano" sobrepunha o título do painel na TV real (altura fixa em px): barras agora em % da altura real do painel, com espaço reservado para o valor em cima.
- 12/11/2026 · v3.476 · ok · — · —
- [x] v3.477 · TV com a fonte real (Montserrat, mais larga que a do teste): cartões do mês cortavam valores ("R$ 170 ...") e quebravam o status; valores 31px, status em selo e só o % à direita; lucro/EBITDA abaixo de zero contra meta positiva mostram "negativo" (antes −324,9% atingido); barra na cor do farol (gastos acima da meta ficava verde); mês abreviado; grades com colunas iguais (minmax) e textos da Qualidade quebram linha em vez de cortar. Testes agora renderizam com Montserrat local.
- 12/11/2026 · v3.477 · ok · — · —
- [x] v3.478 · funil da TV com 6+ etapas: faixas baixas e texto em 2 linhas vazando para a faixa de baixo; agora número e valor numa linha ("297 abertos · R$ 0"), faixa ocupa a linha inteira, nomes à esquerda centralizados; etapa sem meta mostra "sem meta para esta etapa"; o cartão "Leads do mês" escolhe a etapa de lead que tem meta (havia duas).
- 12/11/2026 · v3.478 · ok · — · —
- [x] v3.479 · TV Marketing: resultado ORGÂNICO do mês (Metricool LinkedIn/Instagram/Facebook — publicações, impressões, engajamento e taxa, cliques e CTR, tabela por rede e as 4 melhores publicações) com o pago resumido ao lado. TV Vendas: MOVIMENTO NO FUNIL — negócios que avançaram (inclui ganhos) e recuaram (inclui perdidos) nos últimos 7 dias e no mês, pelas datas de entrada em cada etapa do HubSpot (funil_vendas → resumo.movimentos), e ▲/▼ por etapa; título deixa claro que as faixas são todos os negócios abertos hoje (qualquer mês) e que ganhos/metas são do mês.
- 12/11/2026 · v3.479 · ok · — · conferir com dados reais (Metricool/HubSpot)
- [x] v3.480 · nova tela da TV "Projetos · tarefas e rentabilidade" (ligada automaticamente na configuração e com caixinha própria): tarefas do cronograma do Maestro em atraso (vermelho: fim já passou e não concluída) e com tendência de atraso (amarelo: vence em até 14 dias e está 15pp+ atrás do previsto, ou não começou) por projeto, com as principais tarefas e responsáveis (maestro_painel → tarefas_atraso/risco); rentabilidade por projeto em R$/mês (Custo por Projeto, últimos 3 meses fechados) com ▲/▼ contra o trimestre anterior — cálculo guardado por 6 h (kv tv:rentab). Com "mostrar nomes" desligado, nomes de projeto e tarefas não aparecem.
- 12/11/2026 · v3.480 · ok · — · conferir com dados reais do Maestro
- 2026-11-12 · v3.481 · TV Projetos·tarefas: tarefa concluída = status/percentual do Maestro (antes horas apontadas ≥ estimadas viravam 100% e sumiam do atraso); sem tarefas vencidas, lista os projetos vermelhos/prazo vencido e o motivo · sem bloqueio · próximo: abas Objetivos, Riscos e Metas anuais
- 2026-11-12 · v3.482 · TV: abas Metas anuais (financeiras, clientes e vendas, indicadores-chave, alavancas do plano), Objetivos estratégicos (OKRs + status, visão, prioridades, não fazer) e Riscos (última análise de riscos + 8 sinais ao vivo); código da versão no rodapé · sem bloqueio · próximo: conferir com dados reais
- 2026-11-12 · v3.484 · TV: cache de versão anterior (sem metas/estratégia) é refeito na hora; data da última análise de riscos e dos OKRs no topo; melhores publicações com a melhor de cada rede; texto do post do LinkedIn lido de qualquer campo do Metricool · sem bloqueio · próximo: conferir com dados reais
