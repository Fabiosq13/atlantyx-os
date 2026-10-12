# Contrato de Banco — Atlantyx OS (Neon Postgres)

O schema vive dentro das próprias APIs: cada módulo cria suas tabelas com `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` na primeira chamada (função getSql/garantirTabelas). Não há ORM nem pasta de migrações.
**Dono único do schema: T5 Dados, sob o Afinador.** Nenhuma outra trilha cria tabela, coluna ou índice — o hook do Claude Code e o CI (gate "banco") bloqueiam.

## Fluxo de mudança no banco
1. A trilha que precisa do dado descreve a necessidade no seu plano.md, seção **Interseções**.
2. O subagent **afinador** propõe o DDL aqui (seção "Propostas") marcando tabela dona e leitoras.
3. O Afinador humano aprova na Afinação semanal (ou Batida extraordinária).
4. A **T5** aplica o DDL no getSql() do módulo dono, em PR próprio, antes do PR da trilha consumidora.
5. A trilha consumidora só usa a coluna depois do merge.

## Regras de migração
- Sempre aditiva e idempotente: `IF NOT EXISTS`, coluna nova com DEFAULT ou NULL.
- Nunca apagar/renomear coluna no mesmo PR em que ela deixa de ser usada; DROP só em PR próprio, depois de uma versão sem uso.
- Dados de clientes reais nunca em seeds, fixtures ou testes — usar dados sintéticos.
- Tokens OAuth (Google, QuickBooks, HubSpot) e senhas ficam criptografados e nunca voltam para o front.
- `kv_store` (chave/valor) é compartilhada: cada trilha usa prefixo próprio na chave (ex.: `agente:ideias:`, `qa:`, `higienizacao_`).

## Propostas em análise (afinador)
_(nenhuma)_

<!-- inventario:inicio -->
## Inventário automático

_Gerado por `node scripts/bpm-inventario.mjs` a partir do código. Não edite abaixo desta linha — edite o código ou a parte manual acima._

| Tabela | Trilha dona (escreve) | Criada em | Escrevem | Leem | Colunas adicionadas depois |
|---|---|---|---|---|---|
| `agente_demandas` | T1 Plataforma | agente-ideias | agente-ideias | agente-ideias | — |
| `apollo_telefones` | T2 Integrações | apollo | apollo | apollo | — |
| `app_config` | T3 Agentes e Squads + T6 Financeiro ⚠ | business-plan, crm, financeiro, prospeccao, vendas | business-plan, crm, financeiro, prospeccao, vendas | business-plan, crm, financeiro, prospeccao, s1-intel, vendas | — |
| `atv_midias` | T2 Integrações | atv | atv | atv | — |
| `atv_partes` | T2 Integrações | atv | atv | atv | — |
| `atv_webinars` | T2 Integrações | atv | atv | atv | — |
| `atx_perfis` | T1 Plataforma | acesso | auth | acesso, auth | — |
| `atx_telas` | T1 Plataforma | acesso | auth | auth | — |
| `atx_usuarios` | T1 Plataforma | acesso | auth | acesso, auth | — |
| `autocampanha_fila` | T2 Integrações | metricool | metricool | metricool | imagem_prompt (metricool.js), tipo (metricool.js), story_json (metricool.js) |
| `briefings_reuniao` | T3 Agentes e Squads | crm | crm | crm | — |
| `business_plans` | T3 Agentes e Squads | business-plan | business-plan | business-plan, s1-strategy | — |
| `campanhas` | T5 Dados | db | db | db, rh | data_inicio (db.js), data_fim (db.js), ativa (db.js), redes_ativas (db.js), historico_status (db.js) |
| `captura_visitas` | T3 Agentes e Squads ⚠ | lead-capture | lead-capture, qa | db, hubspot, metricool, qa | — |
| `cargos` | T3 Agentes e Squads | rh | rh | rh | — |
| `cnab_remessas` | T6 Financeiro | cnab | cnab | cnab | — |
| `comercial_atividade` | T3 Agentes e Squads | crm | crm | crm | — |
| `conciliacoes` | T6 Financeiro | financeiro | financeiro | financeiro | — |
| `conselho_falas` | T3 Agentes e Squads | rh | rh | rh | — |
| `conselho_membros` | T3 Agentes e Squads | rh | rh | rh | — |
| `conselho_sessoes` | T3 Agentes e Squads | rh | rh | rh | — |
| `contratos_financeiros` | T6 Financeiro | financeiro | financeiro | financeiro, qa, rh | — |
| `crm_mapa_contatos` | T3 Agentes e Squads | crm | crm | crm | — |
| `despesas_ocorrencias` | T6 Financeiro | financeiro | financeiro | cnab, financeiro, rh | — |
| `despesas_programadas` | T6 Financeiro ⚠ | financeiro | cnab, financeiro | cnab, financeiro, pmo, qa | — |
| `dev_artefatos` | T1 Plataforma | dev-pipeline | dev-pipeline | dev-pipeline | — |
| `dev_projetos` | T1 Plataforma | dev-pipeline | dev-pipeline | dev-pipeline | — |
| `disparo_envios` | T3 Agentes e Squads ⚠ | campanha-disparo | campanha-disparo, wa-response | campanha-disparo | pegou_em (campanha-disparo.js) |
| `disparo_lotes` | T3 Agentes e Squads | campanha-disparo | campanha-disparo | campanha-disparo | — |
| `disparo_optout` | T3 Agentes e Squads ⚠ | campanha-disparo | campanha-disparo, wa-response | campanha-disparo | — |
| `est_conversas` | T3 Agentes e Squads | estrategia | estrategia | estrategia | — |
| `est_sessoes` | T3 Agentes e Squads | estrategia | estrategia | estrategia | — |
| `fab_casos` | T1 Plataforma ⚠ | fabrica-db | fabrica, fabrica-db | fabrica, fabrica-db, qa-externo | — |
| `fab_casos_hist` | T1 Plataforma ⚠ | fabrica-db | fabrica, fabrica-db | fabrica | — |
| `fab_documentos` | T1 Plataforma | fabrica-db | fabrica | fabrica, qa-externo | fase (lib/fabrica-db.js), rodadas (lib/fabrica-db.js), conteudo_anterior (lib/fabrica-db.js) |
| `fab_itens` | T1 Plataforma ⚠ | fabrica-db | agente-ideias, fabrica, fabrica-db | fabrica, fabrica-db | — |
| `fab_projetos` | T1 Plataforma | fabrica-db | fabrica | fabrica, qa-externo | arquitetura (lib/fabrica-db.js) |
| `fab_unitarios` | T1 Plataforma | fabrica-db | fabrica | fabrica | — |
| `followups` | T3 Agentes e Squads ⚠ | lead-capture | followup-cron, lead-capture | db, followup-cron, qa | — |
| `funcionarios` | T3 Agentes e Squads | rh | rh | financeiro, rh, vendas | — |
| `funcionarios_projetos` | T3 Agentes e Squads | rh | rh | financeiro, rh, vendas | valor_hora (financeiro.js) |
| `ideias` | T5 Dados ⚠ | db | business-plan, db, qa | agente-ideias, business-plan, db, qa, s1-strategy | — |
| `kpis_diarios` | T5 Dados | db | db | db, rh | — |
| `kv_store` | T2 Integrações + T5 Dados + T3 Agentes e Squads + T6 Financeiro + T4 Dashboard e Telas + T1 Plataforma ⚠ | acesso, atv, db, estrategia, financeiro, metricool, rfp-monitor, tv | acesso, agente-ideias, analytics, atv, business-plan, db, estrategia, fabrica, faturamento, financeiro, metricool, qa, rfp-monitor, tv | acesso, agente-ideias, analytics, atv, business-plan, db, estrategia, fabrica, faturamento, financeiro, metricool, qa, rfp-monitor, s1-strategy, tv, vendas | — |
| `lancamentos_ocultos` | T6 Financeiro | financeiro | financeiro | financeiro | — |
| `lancamentos_simulados` | T6 Financeiro | financeiro | financeiro | financeiro | — |
| `leads` | T5 Dados + T3 Agentes e Squads ⚠ | db, lead-capture | crm, db, lead-capture, qa | campanha-disparo, crm, db, hubspot, metricool, qa, rh, s1-intel | — |
| `media_arquivos` | T2 Integrações | media | media | media, prospeccao | — |
| `media_store` | T2 Integrações | media-upload | media-upload | media-upload | — |
| `out_config` | T3 Agentes e Squads | vendas-outbound | vendas-outbound | vendas-outbound | — |
| `out_leads` | T3 Agentes e Squads | vendas-outbound | vendas-outbound | campanha-disparo, crm, vendas-outbound | — |
| `out_mensagens` | T3 Agentes e Squads | vendas-outbound | vendas-outbound | — | — |
| `out_roteiros` | T3 Agentes e Squads | vendas-outbound | — | — | — |
| `out_visitas` | T3 Agentes e Squads | vendas-outbound | vendas-outbound | vendas-outbound | — |
| `pmo_compromissos` | T3 Agentes e Squads | pmo | pmo | pmo | — |
| `pmo_config` | T3 Agentes e Squads | pmo | pmo | pmo | — |
| `pmo_exportacoes` | T3 Agentes e Squads | pmo | pmo | pmo | — |
| `pmo_projetos_config` | T3 Agentes e Squads | pmo | pmo | pmo, vendas | — |
| `pmo_reunioes` | T3 Agentes e Squads | pmo | pmo | pmo | — |
| `projetos_financeiros` | T6 Financeiro | financeiro | financeiro | financeiro, pmo, rh, vendas | — |
| `projetos_marcos` | T6 Financeiro | financeiro | financeiro | financeiro, pmo, rh, vendas | — |
| `projetos_marcos_log` | T6 Financeiro | financeiro | financeiro | financeiro | — |
| `propostas` | T3 Agentes e Squads | vendas | vendas | vendas | — |
| `propostas_base` | T3 Agentes e Squads | vendas | vendas | vendas | — |
| `prospeccao_feed` | T3 Agentes e Squads | prospeccao | prospeccao | prospeccao | — |
| `qa_achados` | T1 Plataforma | qa-externo | qa-externo | fabrica, qa-externo | confirmado (qa-externo.js) |
| `qa_execucoes` | T1 Plataforma | qa-externo | qa-externo | fabrica, qa-externo | progresso (qa-externo.js) |
| `qa_produtos` | T1 Plataforma | qa-externo | qa-externo | fabrica, qa-externo | permitir_carga (qa-externo.js), usuarios_simultaneos (qa-externo.js) |
| `qa_runs` | T1 Plataforma | qa | qa | qa | — |
| `reu_reunioes` | T3 Agentes e Squads | reunioes | reunioes | reunioes | — |
| `reu_ritos` | T3 Agentes e Squads | reunioes | reunioes | pmo, reunioes | — |
| `s13_projetos` | T5 Dados | db | db | db | — |
| `s1_historico` | T3 Agentes e Squads | historico-s1 | historico-s1 | historico-s1 | — |
| `saldos_iniciais` | T6 Financeiro | financeiro | financeiro | financeiro | — |
| `squad_registros` | T5 Dados | db | db | db | — |
| `status_reports` | T3 Agentes e Squads | pmo | pmo | pmo | — |
| `tend_campanhas` | T3 Agentes e Squads | tendencias | tendencias | tendencias | — |
| `tend_envio_partes` | T3 Agentes e Squads | tendencias | tendencias | atv, tendencias | — |
| `tend_envios` | T3 Agentes e Squads | tendencias | tendencias | atv, tendencias | — |
| `tend_pecas` | T3 Agentes e Squads | tendencias | tendencias | atv, tendencias | — |
| `tend_videos` | T3 Agentes e Squads | tendencias | tendencias | tendencias | — |
| `termos_empresas` | T6 Financeiro ⚠ | faturamento | faturamento, financeiro | faturamento, financeiro, termo-excel | qb_invoice_id (faturamento.js), qb_invoice_doc (faturamento.js), qb_lancado_em (faturamento.js), pagamento_obs (faturamento.js), pagamento_status (faturamento.js), cnpj (faturamento.js), qb_erro (faturamento.js), pagamento_origem (faturamento.js) |
| `termos_faturamento` | T6 Financeiro ⚠ | faturamento | faturamento, financeiro | crm, faturamento, financeiro, pmo, rh, termo-excel | pago_em (faturamento.js), concluido_motivo (faturamento.js) |
| `termos_nf_envios` | T6 Financeiro | faturamento | faturamento | faturamento | — |
| `termos_notas_encontradas` | T6 Financeiro | faturamento | faturamento | faturamento, financeiro | arquivo_url (faturamento.js), origem (faturamento.js), arquivo_xml_url (faturamento.js), nf_emissao (faturamento.js), nf_vencimento (faturamento.js) |
| `vendas_estrategias` | T3 Agentes e Squads | vendas | vendas | vendas | — |

⚠ = tabela criada ou escrita por mais de um arquivo: ponto de interseção — qualquer mudança passa pela Afinação.
