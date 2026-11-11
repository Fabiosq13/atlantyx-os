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
