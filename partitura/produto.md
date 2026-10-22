# Produto — Atlantyx OS

**O que é:** o sistema operacional de gestão da Atlantyx (empresa brasileira B2B de dados, BI, engenharia de dados e IA, 17 anos, fundada e dirigida por Fabio Quintanilha). Um único app web com squads de agentes de IA que operam finanças, marketing, vendas, PMO, RH, jurídico e o próprio desenvolvimento do sistema.

**Usuário principal:** o fundador/CEO, todos os dias. Depois: gerentes de projeto, CTO, financeiro e comercial da Atlantyx. Alguns painéis são públicos por token (cliente vê qualidade do projeto, produtor do Podtecno baixa vídeo).

**Motores de negócio que o sistema serve:** alocação de talentos · projetos sob medida · suíte própria de produtos de IA.

## Módulos (squads)
| Squad | O que faz | Trilha |
|---|---|---|
| S0 Estratégia / Acesso / Esteira de Demandas | propósito, metas, usuários e perfis, Agente de Produto que sugere demandas | T1 / T3 |
| S1/S3 Financeiro | QuickBooks, fluxo de caixa realizado e futuro, agenda de pagamentos, conciliação, faturamento e termos, CNAB, e-mail financeiro das 8h | T6 |
| S2 Marketing | Studio criativo, autocampanha, Metricool, reação a tendências, WhatsApp, RFPs | T3 (+T2 conectores) |
| S5 Jurídico | análise de contratos | T3 |
| S6 Dev + QA | linha de produção, Fábrica (esteira de entrega com gates G1–G12), QA de produtos, QA noturno | T1 |
| S7 Vendas | CRM, prospecção, propostas, outbound, cartão digital | T3 (+T2 HubSpot/Apollo) |
| S8 RH / S9 PMO | funcionários, organograma, conselho; status report, painel mestre, agenda do GP | T3 |
| Dashboard ao vivo | resultado do dia, financeiro do dia, metas, alertas | T4 |

## ICP — público-alvo (regra do fundador)
**Donos e sócios de empresas médias e grandes** (200+ funcionários) e **os C-levels dessas empresas** (CEO, CFO, COO, CIO, CTO, CDO; no Brasil também diretores estatutários) (energia e utilities, bancos e seguradoras, indústria, infraestrutura, varejo e serviços de grande porte). Nunca pessoa física, estudante, quem procura emprego nem público técnico/operacional (analista, desenvolvedor, engenheiro, técnico, coordenador, estagiário).
- Fonte única no código: `lib/icp.js` (texto dos prompts, cargos, Apollo, Meta Ads, negativas de busca, `classificarCargo`). Toda campanha, prompt, prospecção, score de lead e abordagem automática lê dali.
- Meta Ads: filtro pelo **cargo atual** do perfil (work_positions: dono, sócio, C-level) — nunca por interesse (interesse alcança quem só se interessa pelo tema); sem cargo disponível, área de atuação em gestão; 35+ anos, exclusões de emprego/estudo/programação, Advantage+ de público desligado; guardião de hora em hora corrige conjuntos fora do ICP, sem botão.
- Conteúdo planejado: guardião automático reescreve posts agendados fora do ICP (mesma data/imagem/links), regera a fila e refaz roteiros de tendências sem vídeo; registro em `mkt:icp_conteudo_log`.
- WhatsApp automático só para lead A (ou B com cargo de decisor e e-mail corporativo).

## Glossário
- **Demanda:** pedido de mudança no sistema, sugerido pelo Agente de Produto ou criado pelo fundador, aprovado na Esteira de Demandas.
- **Trilha:** unidade de trabalho com dono e escopo de arquivos (T1…T6 permanentes; trilhas de feature herdam o escopo de uma permanente e têm ID `aaaa-mm-dd-slug`).
- **Partitura:** CLAUDE.md + `partitura/` (contratos + spec/plano de cada trilha).
- **Batida:** status diário das trilhas e Afinação semanal dos contratos.
- **Mixagem:** gates antes do merge — automático (CI), revisor (subagent), humano (checklist na Esteira/PR).
- **Termo:** termo de aceite/faturamento de cliente (S1). **Marco:** marco financeiro de projeto.
- **Correção noturna:** a única mudança autônoma — erros do QA da madrugada, corrigidos e mesclados sozinhos se passarem na validação.
