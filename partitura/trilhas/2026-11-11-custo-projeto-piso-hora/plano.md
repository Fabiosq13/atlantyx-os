# Custo por Projeto & Piso da Hora — plano (T6)
Spec (pedido do fundador, 11/11/2026): (1) Serviplas é produto (IA Sales) — motor de produtos errado na estratégia; (2) rateio do custo fixo no cenário homem-hora/projetos; (3) apropriação da folha ao projeto (centro de custo); (4) piso do valor-hora geral da Atlantyx a partir de despesas e custos dos profissionais.
- [x] v3.455 · lib/custo-hora.js: folha (Pagamento a Colaboradores) apropriada aos projetos pelas horas apontadas no Maestro; horas internas e sem apontamento → fixo; fixo de estrutura = despesas QB − impostos − retiradas − folha; rateio por horas/receita/custo; margem por projeto e motor; piso e preço-alvo da hora (realizado e na utilização-alvo) e por profissional
- [x] v3.455 · motor por cliente/projeto (kv fin:motor_cliente): receita faturada do cliente marcado sai do motor Projetos e vai para Produtos/Alocação em todas as telas (DRE, metas, estratégia) — linhas "↪ cliente (→ motor)"
- [x] Tela S3 · Custo por Projeto & Piso da Hora
## Registro da Batida
- 11/11/2026 · v3.455 · ok · fundador precisa marcar o cliente da IA Sales como Produtos na tela · conferir horas apontadas no Maestro
