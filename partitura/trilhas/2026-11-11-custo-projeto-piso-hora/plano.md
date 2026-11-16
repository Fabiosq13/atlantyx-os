# Custo por Projeto & Piso da Hora — plano (T6)
Spec (pedido do fundador, 11/11/2026): (1) Serviplas é produto (IA Sales) — motor de produtos errado na estratégia; (2) rateio do custo fixo no cenário homem-hora/projetos; (3) apropriação da folha ao projeto (centro de custo); (4) piso do valor-hora geral da Atlantyx a partir de despesas e custos dos profissionais.
- [x] v3.455 · lib/custo-hora.js: folha (Pagamento a Colaboradores) apropriada aos projetos pelas horas apontadas no Maestro; horas internas e sem apontamento → fixo; fixo de estrutura = despesas QB − impostos − retiradas − folha; rateio por horas/receita/custo; margem por projeto e motor; piso e preço-alvo da hora (realizado e na utilização-alvo) e por profissional
- [x] v3.455 · motor por cliente/projeto (kv fin:motor_cliente): receita faturada do cliente marcado sai do motor Projetos e vai para Produtos/Alocação em todas as telas (DRE, metas, estratégia) — linhas "↪ cliente (→ motor)"
- [x] Tela S3 · Custo por Projeto & Piso da Hora
## Registro da Batida
- 11/11/2026 · v3.455 · ok · fundador precisa marcar o cliente da IA Sales como Produtos na tela · conferir horas apontadas no Maestro
- [x] v3.456 · projetos = Maestro "Oficial_*"; receita ligada ao Oficial_ por de-para salvo, marco do Maestro, financeiro do Maestro, palavra distintiva do nome ou cliente com um só projeto; o que não liga vai para o quadro "🔗 Receita → projeto Oficial_" (de-para em kv fin:receita_projeto); lista só ativos + concluídos com hora ou receita no período
- 11/11/2026 · v3.456 · ok · — · fundador ligar as receitas que sobrarem
- [x] v3.457 · lista de ligação mostra TODOS os Oficial_ (ativos primeiro, depois "(concluído)"), inclusive os que só existem nos apontamentos/marcos/financeiro do Maestro; siglas do nome (HC, TI…) contam no casamento automático
- 11/11/2026 · v3.457 · ok · — · —
- [x] v3.460 · horas apontadas com nome antigo do projeto vão para o Oficial_ (palavra característica/sigla, só com vencedor único; ex.: "CPFL Projeto Xplann" → Oficial_Xplann, "Projeto Transmissão" → Oficial_Transmissão); quadro "🗂 Horas apontadas → projeto Oficial_" para trocar/manter separado (kv fin:apontamento_projeto)
- 11/11/2026 · v3.460 · ok · — · fundador conferir as ligações automáticas (XPLANN_2026, Projeto Jelta - V2, Projeto cadastro também foram ligados)
- [x] v3.462 · "Motor de cada cliente / projeto" inclui os projetos que não começam com Oficial_ e são alavancas de produto (casam com o Pipeline de Ideias ou têm nome de produto: IA, Sales, Connect, Maestro…) — 🚀 na lista, motor Produtos por padrão, editável
- 12/11/2026 · v3.462 · ok · — · —
- 15/11/2026 · v3.516 · Custo por pessoa-dia na tela Custo por Projeto: (pagamento/PJ + encargos % + ferramentas e nuvem rateadas) ÷ dias úteis e ÷ dias vendidos; ferramentas lidas do QuickBooks por nome de despesa ou informadas · conferir com dados reais
- 15/11/2026 · v3.517 · Tela Margem × Caixa (QuickBooks): mensal faturado/recebido/margem/EBITDA/caixa, por cliente, prazos e ciclo de caixa, capital de giro, tributos (a confirmar), simulador de ofertas, esteira A/B/C e CAC, metas e 3 decisões; o que falta aparece como dado ausente · conferir com dados reais
- 15/11/2026 · v3.518 · Simulador Margem × Caixa com premissas do Fabio: R$ 276,56/pessoa-dia (salário+encargos+ferramentas), 3 Sprints/mês, recebimento 30 dias após conclusão, projeto sob medida mínimo R$ 50.000
- 15/11/2026 · v3.519 · Estúdio de Produtos e Esteira, fase 1: premissas e cadastro de produtos com cálculo ao vivo (custo, margem, preço mínimo, limite de esforço, semáforo); kv sim:premissas e sim:produtos · BPM-ID 2026-11-15-estudio-produtos-esteira
- 15/11/2026 · v3.520 · Estúdio fase 2: esteira A→B→C com conversão, tempo e CAC por passagem; CAC por entrante/venda, LTV÷CAC e payback · BPM-ID 2026-11-15-estudio-produtos-esteira
- 15/11/2026 · v3.521 · Estúdio fase 3: simulador de cenário (horizonte 6/12/24/36, margem por oferta, caixa acumulado, break-even, ROI, ocupação, ARR, margem × caixa, semáforos) · BPM-ID 2026-11-15-estudio-produtos-esteira
