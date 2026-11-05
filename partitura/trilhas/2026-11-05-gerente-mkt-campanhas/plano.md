# Plano · Gerente de Marketing IA no dashboard de campanhas (T3)

- [x] Painel do Gerente de Marketing IA na lista e no detalhe das Campanhas de Marketing
- [x] Perguntas prontas de diagnóstico de conversão; contexto = funil, metas e ações da tela + dados do gerente (publicações, Metricool, visitas, leads)

## Registro da Batida
- 2026-11-05 · feito (v3.391) · sem bloqueio · próximo: fundador rodar o diagnóstico na campanha G4 2
- 2026-11-05 · feito (v3.392) · HTTP 504 no gerente: função db 60→120s, limite de 80s na IA, auditoria do Metricool 15s no dashboard, sem a 2ª chamada de 'ordem' no diagnóstico, mensagem clara no 504 · Gerente de Marketing IA também no Dashboard de Desempenho (KPIs orgânicos, anúncios pagos e leads da tela) · campanhas digitais soltas (Autocampanha/Campanha Digital/anúncios) listadas em Campanhas de Marketing com botão Ligar (a uma campanha existente ou nova)

## Interseções
- T1: vercel.json (maxDuration de api/db.js 60→120) alterado nesta trilha por pedido do fundador
- 2026-11-05 · feito (v3.393) · diagnóstico do gerente, ajustes técnicos: (1) anúncios pagos (mkt:patrocinados) aparecem em Campanhas de Marketing como digitais soltas e, ligados, trazem gasto/impressões/cliques do Meta e leads pela utm_campaign; (2) lead do formulário público (sem cargo) nunca recebia a 1ª mensagem — agora recebe a entrega do Mapa + pergunta de cargo/área, e o follow-up é agendado; (3) guardião horário dos agendados: posts sem link ganham link da captura e imagens Ideogram viram permanentes
- 2026-11-05 · feito (v3.394) · formulário de captura ganha campo Cargo (combo com 10 cargos do ICP + Outro com texto livre); 1ª mensagem do WhatsApp no formulário público sai para decisor, head e gerência (só cargo técnico/operacional e empresa pequena ficam para avaliação humana)
