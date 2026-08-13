# ATLANTYX OS — Memória Geral do Projeto
**Backup consolidado · Atualizado em 13/08/2026**
**Dono:** Fabio · Repo: `Fabiosq13/atlantyx-os` · Versão atual: **v1.5.6**

---

## 1. ARQUITETURA

| Camada | Tecnologia |
|---|---|
| Hosting/Deploy | Vercel (deploy automático via push na `main`) |
| Banco de dados | Neon PostgreSQL (15 tabelas em 6 grupos, DBML em `atlantyx-os-schema.dbml`) |
| IA | Anthropic Claude API — modelo centralizado em `process.env.CLAUDE_MODEL` (fallback `claude-sonnet-4-6`) em 17 arquivos backend |
| Frontend | `public/index.html` único (~880KB, 2 blocos `<script>`) |
| Integrações | QuickBooks, HubSpot, Apollo, PhantomBuster, Z-API (WhatsApp), Resend (email), Metricool (redes sociais), Ideogram (imagens) |

### Backend — 24 arquivos em `api/`
analytics, apollo, claude, db, decisor-map, email-intel, **financeiro** (2.4k linhas), followup-cron, **health**, **hubspot**, lead-capture, meeting-schedule, **metricool**, outreach-batch, phantom, portal-cadastro, prospect-scan, rfp-monitor, s1-data, s1-intel, s1-strategy, **s2-creative**, wa-batch-generate, wa-response

⚠ **REGRA CRÍTICA:** nunca substituir a pasta `api/` inteira por um pacote parcial — em agosto/2026 isso removeu `financeiro.js`/`db.js` do deploy e derrubou o painel financeiro (v1.5.2 corrigiu repondo os 24 arquivos no pacote).

### Módulos do sistema
- **S0 Estratégia:** Propósito+Metas, Inteligência (agentes S1), Planejamento
- **S2 Marketing Digital:** Studio Criativo, Nova Campanha, Kanban Aprovação, **Desempenho** (novo v1.5), Prospecção Apollo/LinkedIn, WhatsApp IA, RFP Monitor, E-mail Marketing
- **S3 Financeiro:** Painel (14 páginas), Extrato, Conciliação (score 60/30/10), Orçamento QB, Fluxo Futuro 12m, Agenda Despesas, Projetos & Marcos (Kanban 9 colunas + cron de alertas 9h)
- **S4 CRM:** KPIs HubSpot

---

## 2. VARIÁVEIS DE AMBIENTE (Vercel)

| Grupo | Variáveis | Status (13/08) |
|---|---|---|
| Core | `DATABASE_URL`, `ANTHROPIC_API_KEY` (Sensitive, rotacionada), `CRON_SECRET`, `CLAUDE_MODEL` (opcional) | ✅ OK |
| QuickBooks | `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REFRESH_TOKEN`, `QB_REALM_ID`, `QB_SANDBOX` | ⚠ **Refresh token inválido** — regenerar (ver §6) |
| HubSpot | `HUBSPOT_TOKEN` (Private App, 4 escopos CRM) | ✅ Conectado · escopo `content` pendente p/ landing pages |
| Metricool | `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID` | ✅ **Conectado** (plano c/ API ativado) |
| Email | `RESEND_API_KEY`, `RESEND_FROM`, `FINANCEIRO_EMAIL` | Configurado |
| LinkedIn | `APOLLO_API_KEY`, `PHANTOM_API_KEY`, `PHANTOM_AGENT_ID`, `PHANTOM_SESSION` (cookie li_at) | Configurado |
| WhatsApp | `ZAPI_INSTANCE`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` | A configurar |

**Regra:** toda variável nova/alterada exige **Redeploy** manual. Tokens sempre marcados **Sensitive**.

---

## 3. HISTÓRICO DE VERSÕES (a jornada v1.3 → v1.5.6)

### v1.3 (junho/2026)
Financeiro completo (42 actions) + Projetos & Marcos com Kanban 9 colunas + cron diário de alertas (GP 10 dias antes; cliente e financeiro 3-em-3 dias) + templates email + campanhas com período/redes/calendário.

### v1.4.x (12/08/2026) — a saga do erro 500
| Versão | O que foi |
|---|---|
| v1.4 | **Causa raiz do 500: créditos Anthropic ZERADOS** (não era modelo deprecated — falso diagnóstico inicial). Centralização `CLAUDE_MODEL` em 17 arquivos, `/api/health` + cron semanal (seg 9h), build ID dinâmico. Chave API exposta em print → rotacionada + Sensitive |
| v1.4.2 | **Menus não abriam:** `SyntaxError` na linha 7546 — escape excessivo `\\'` no calendário de campanhas quebrava TODO o script (nav() nunca declarada). Fix: template literal. Bug existia desde v1.2 |
| v1.4.3 | **Colisão de nomes:** dois `renderKanban()` (S2 campanhas linha 3993 + S3 marcos linha 13002). Segunda sobrescrevia primeira → TypeError 'colunas'. Fix: renomeada p/ `renderKanbanMarcos()` |
| v1.4.4 | **Fluxo de campanhas (7 bugs):** kanban persiste no Neon (`atx:kanban:pecas`), recarrega ao abrir, `resetCampanhaState` RESTAURA em vez de apagar, form preenche com última campanha, card do kanban → botão "✎ Editar Campanha & Re-rodar", `rerodarCampanhaAtiva()` preserva id+imagens, peças carregam `campanhaId`, botão "✕ Limpar (nova do zero)" |
| v1.4.5 | Handler global de erros JS (`window.error` + `unhandledrejection` → log da UI), try/catch isolado por etapa, erro com stack visível na tela, `adicionarAoKanban` duplicado removido |

### v1.5.x — Publicação, Desempenho e integrações
| Versão | O que foi |
|---|---|
| v1.5 | **Publicação nas redes** (modal com escolha Manual vs Metricool por peça aprovada no Kanban) + `api/metricool.js` (status/publicar/listar/métricas, graceful degradation) + **página S2 → Desempenho** (KPIs, funil, comparativo por rede, lista de publicações, registro manual de métricas) |
| v1.5.1 | Pós-criação visível (auto-scroll + 3 botões: 🎨 Gerar Imagens / 📝 Editor / ■ Kanban) + **fix Designer truncado** (max_tokens 2000→3000 + fallback raw — "brief=0 chars" resolvido) |
| v1.5.2 | **Pacote completo 24 arquivos** (financeiro.js etc. repostos!) + Metricool na sidebar + `finApi` diagnostica 404 + erro QB visível no painel com 4 causas + `mostrarAbaCampanha` blindada com scroll |
| v1.5.3 | **Link de destino + UTMs:** campo no modal de publicação, `utm_source=<rede>&utm_medium=social&utm_campaign=<slug-campanha>`, salvo em `camp.link_destino`, placeholder atlantyx.com.br do FB sharer removido |
| v1.5.4 | **Leads automáticos HubSpot:** action `leads_por_campanha` lê `hs_analytics_first_url` dos contatos (até 300, paginado), extrai UTMs, atribui por campanha/rede. Painel: KPI Leads 🔗, CPL, funil e comparativo automáticos (manual = fallback, vale o maior) |
| v1.5.5 | **Landing Pages HubSpot:** botão no Desempenho lista LPs do CMS (action `listar_landing_pages`), "abrir ↗" e "usar como link" (grava `link_destino` da campanha). Se 403 → instruções p/ escopo `content` |
| v1.5.6 | **Status QuickBooks na sidebar:** action `qb_status` valida refresh token real na Intuit (~300ms). Estados: Conectado / Conectado (sandbox) / Erro token (tooltip com erro) / Configurar (tooltip lista faltantes) / Offline |

---

## 4. FLUXO COMPLETO DE CAMPANHAS (como está hoje)

```
1. S2 → Nova Campanha (form restaura última automaticamente)
2. Criar Campanha com IA → 4 agentes (Storyteller→Copywriter→Designer→Banco)
3. Salva no Neon + peça no Kanban (vinculada por campanhaId)
4. Auto-scroll ao editor → 🎨 Gerar Imagens (Ideogram) / editar / re-rodar
5. Kanban: aprovar peça → 🚀 Publicar
6. Modal: redes pré-marcadas + texto editável + link destino (LP HubSpot) + UTMs + agendamento
   → 🚀 Metricool (auto) OU ✋ Manual (abre compositores)
7. Peça → coluna Publicado · registro em atx:publicacoes (Neon)
8. Visitante clica (link com UTM) → converte na LP HubSpot → lead criado
9. S2 → Desempenho: leads atribuídos automaticamente por campanha/rede,
   CPL, funil, métricas Metricool mescladas por matching de texto
```

**Ciclo fechado:** publicação → clique → lead → atribuição, sem input manual (leads manuais seguem como fallback).

---

## 5. STATUS DAS INTEGRAÇÕES (sidebar, 13/08/2026)

| Serviço | Status | Observação |
|---|---|---|
| Claude API | 🟢 Ativo | Créditos comprados; configurar alerta de saldo baixo no console Anthropic |
| HubSpot | 🟢 Conectado | Landing page da Atlantyx existe no HubSpot; falta escopo `content` p/ listá-la no Atlantyx |
| QuickBooks | 🔴 **Erro token** | `QB OAuth: Incorrect or invalid refresh token` — ver §6 |
| Metricool | 🟢 Conectado | Plano com API ativo; 3 envvars OK após redeploy |
| Z-API | ⚪ Configurar | WhatsApp pendente |
| KV/DB | 🟢 Conectado | Neon operacional |

---

## 6. PENDÊNCIA ATIVA — QuickBooks refresh token

**Erro:** `[QB] QB OAuth: Incorrect or invalid refresh token`

**Causas prováveis:** token rotacionado (Intuit emite novo a cada uso no Playground e mata o antigo), colado incompleto, ou mismatch de ambiente (token sandbox com credenciais Production ou vice-versa).

**Solução (pendente de execução pelo Fabio):**
1. OAuth Playground → selecionar o app → conferir ambiente → escopo Accounting → Get authorization code → autorizar
2. Copiar o **novo** Refresh Token imediatamente (não usar mais o Playground depois)
3. Conferir que as **5 variáveis são do mesmo ambiente** (Development: tudo da aba Development + `QB_SANDBOX=true` · Production: tudo da aba Production + sem `QB_SANDBOX`)
4. Atualizar `QB_REFRESH_TOKEN` no Vercel → **Redeploy**
5. Validar: sidebar deve virar 🟢 "QuickBooks · Conectado"; depois testar sync no Painel Financeiro

**Regra de ouro:** após ativar, NUNCA mais usar o Playground com esse app (rotaciona e mata o token de produção). O Atlantyx renova sozinho a cada sync. Token expira em 100 dias SEM uso — usar sync ≥1x/mês.

---

## 7. METRICOOL — decisão de plano (resolvida)

- Plano **Starter NÃO tem API** (confirmado ago/2026: API só no Advanced, ~US$53-54/mês)
- Fabio inicialmente contratou Starter → tela Settings→API não existia
- **Resolvido:** upgrade feito (status "Conectado" na sidebar em 13/08)
- Alternativas mapeadas caso reavalie custo: Publer Business, PostFast Growth (~€40), Postiz (API em todos os planos, tem self-hosted). Conector isolado em `api/metricool.js` → troca de provedor ≈ 1h de trabalho
- Envvars: token em Settings→API; `userId=` e `blogId=` aparecem na URL do painel (blogId é POR MARCA)

---

## 8. APRENDIZADOS TÉCNICOS (não repetir erros)

1. **Diagnosticar antes de corrigir** — o 500 era saldo zerado; perdi tempo em "modelo deprecated". Checar env/billing/config PRIMEIRO
2. **`node --check` + JSDOM antes de toda entrega** — pegou os bugs das v1.4.2/1.4.3. JSDOM instalado em `/tmp/node_modules/jsdom`
3. **Nomes de função com prefixo de módulo** — colisão `renderKanban` custou uma versão inteira
4. **Pacotes de update SEMPRE completos** (24 arquivos) — pacote parcial apagou o financeiro
5. **Console marker + build ID** (`[ATLANTYX vX.Y.Z]` verde no F12) — confirma deploy/cache na hora
6. **Handler global de erros** — transformou "não funciona" em mensagens com linha exata
7. **Erros visíveis e persistentes na UI** (box no painel > toast que some)
8. **Graceful degradation** em toda integração opcional (Metricool → modo manual; Resend → log-only)
9. **UX: auto-scroll ao resultado** — duas vezes o sistema "não funcionou" porque o resultado estava fora da viewport
10. **Intuit rotaciona refresh tokens** — Playground só para o primeiro token
11. **DBML dbdiagram.io:** sem `unique: true` em `indexes{}`; refs inline apenas (não duplicar com blocos `Ref:`)
12. **HubSpot first-touch:** atribuição usa `hs_analytics_first_url` — contato pré-existente não conta como lead novo da campanha (correto p/ aquisição)

---

## 9. PRÓXIMOS PASSOS

**Imediato:**
- [ ] Regenerar QB_REFRESH_TOKEN (§6) → sidebar verde → validar sync no painel
- [ ] Adicionar escopo `content` no Private App HubSpot → listar LP da Atlantyx → "usar como link" na campanha
- [ ] Teste ponta-a-ponta: publicar peça real via Metricool → conferir Planner → aguardar métricas no Desempenho

**Curto prazo:**
- [ ] Configurar Z-API (WhatsApp)
- [ ] Alerta de saldo baixo na Anthropic (console → billing)
- [ ] Primeira campanha real com LP + UTM + leads automáticos

**Backlog:**
- [ ] Métricas Metricool: matching por ID em vez de texto (mais robusto)
- [ ] Distribuição de leads por publicação individual (hoje é por campanha)
- [ ] Documentação do schema atualizada (DBML) com tabelas de publicações

---

## 10. ARQUIVOS DE REFERÊNCIA EM /outputs/

| Arquivo | Conteúdo |
|---|---|
| `atlantyx-v1.5.6.zip` | **Pacote completo atual** (24 api + index + vercel.json + changelogs) |
| `index-v1.5.6.html` | Frontend atual standalone |
| `financeiro-v1.5.6.js`, `hubspot-v1.5.5.js`, `metricool.js`, `s2-creative-v1.5.1.js` | Backends-chave standalone |
| `Atlantyx-OS-Guia-Instalacao-v1.3.docx/pdf` | Guia de instalação 28 págs c/ 17 mockups |
| `atlantyx-os-schema.dbml` | Schema das 15 tabelas |
| `CHANGELOG-v1.4.md` … `CHANGELOG-v1.5.6.md` | Histórico detalhado por versão |

**Identificação de deploy:** console F12 mostra `[ATLANTYX v1.5.6]` em verde; sidebar/header mostram o build ID. Se divergir do esperado → faltou deploy ou hard refresh (Ctrl+Shift+R).
