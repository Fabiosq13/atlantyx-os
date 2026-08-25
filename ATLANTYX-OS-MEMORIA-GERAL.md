# ATLANTYX OS — Memória Geral do Projeto
**Backup consolidado · Atualizado em 18/08/2026** (versão anterior: `ATLANTYX-OS-MEMORIA-GERAL-2026-08-13.md`)
**Dono:** Fabio · Repo: `Fabiosq13/atlantyx-os` · Domínio de produção: `https://atlantyx-os.vercel.app` · Versão atual: **v1.14.1**

> Ponto de retomada de qualquer conversa: arquitetura, decisões, estado, pendências e aprendizados. Detalhes de cada versão nos `CHANGELOG-vX.Y.md` em `/outputs`.

---

## 1. ARQUITETURA

| Camada | Tecnologia |
|---|---|
| Hosting/Deploy | Vercel (push na `main` = deploy). **Acessar sempre pelo domínio de produção**, não pela URL de deployment (`project-xxxx-…vercel.app`, protegida por Deployment Protection) |
| Banco | Neon PostgreSQL — `kv_store` (kanban, tokens QB, configs), `campanhas`, `kpis_diarios`, `leads`, `ideias`, `squad_registros`, `s13_projetos`, tabelas do financeiro (simulados, despesas, ocorrências, projetos, marcos, logs, conciliação), **`media_store`** (mídia hospedada de reels/stories/carrossel) |
| IA | Anthropic Claude API — `CLAUDE_MODEL` (fallback `claude-sonnet-4-6`); agentes S2 com **saídas compactas** (Storyteller 900 tk · Copywriter 1400 · Designer 1100 · por-rede 1800) e **timeout 25 s por chamada** |
| Frontend | `public/index.html` único (~950 KB, SPA). Console marker `[ATLANTYX vX.Y.Z]` confirma deploy |
| Mídia | Canvas + **WebCodecs (H.264) + mp4-muxer** para Reels; canvas → JPEG para Stories/Carrossel; hospedagem no Neon servida em `/media/ID.ext` (rewrite do `vercel.json`); fallback Vercel Blob se houver token |
| Integrações | QuickBooks (OAuth próprio, tokens no banco), HubSpot, Metricool (posts/stories/reels/carrossel + métricas + excluir/reagendar), Ideogram (`api/image-gen.js` — **existe só no repo, nunca nos pacotes**), Apollo, PhantomBuster, Z-API, Resend |

### Backend — `api/` (25 arquivos)
analytics, apollo, claude, **db** (jsonSeguro), decisor-map, email-intel, **financeiro** (~2.6k linhas: QB OAuth+tokens, gerente IA, dashboard, 45+ actions), followup-cron, health, hubspot (utm_medium), image-gen*, lead-capture, **media-upload** (+ `media/[file].js`), **metricool** (STORY/REEL/carrossel/excluir/reagendar), rfp-monitor, s1-data, s1-intel, **s2-creative** (fases 1/2, story_pack, reel_pack, carrossel_pack, campanha_auto, plano_impulso, diagnostico_ia), briefing-cron…
`vercel.json`: rewrites `/media/:file` → `/api/media-upload?f=:file` · `/api/:path*` · catch-all → index.html; `maxDuration` 60 (s2-creative, financeiro, email-intel), 30 (media-upload); crons (rfp 6h, followup/briefing 1h, marcos 9h, health seg 9h).

⚠ **REGRA CRÍTICA:** nunca substituir a pasta `api/` inteira por um pacote — `image-gen.js` só existe no repositório. Sempre **mesclar**.

### Módulos (menu lateral)
- **S0 · Estratégia:** Propósito+Metas, Inbox Aprovações, Diagnóstico IA, Riscos, Inteligência de Mercado, Planejamento, Ideias+Produtos
- **S1 · FINANCEIRO (v1.13/1.14):** 📈 Dashboard Financeiro · 🤖 Gerente Financeiro IA (chat) · Extratos & Saldos (Extrato, Saldo Diário, Saldo Mensal, Realizado QB) · Planejamento (Orçamento Anual, Fluxo Futuro 12m, Projetado+Contratos, Agenda de Despesas) · Controle (Conciliação, A Receber, KPIs de Saúde) · Projetos (Projetos & Marcos, Kanban Financeiro 9 colunas) · Inteligência (Análise Financeira IA, Dados Reais). "Painel Financeiro" removido (link antigo cai em Realizado).
- **S2 · Marketing Digital:** Studio Criativo, Nova Campanha (abas Narrativa/Copy/Imagem/**Stories/Carrossel/Reels**/Preview), Kanban Aprovação (calendário 14 dias, filtro de data, 🤖 Auto-campanha, 🔗 link de reunião, 📲 texto do link na bio, ↻ reconstruir peças), Desempenho (atribuição UTM, orgânico vs pago, ⭐ candidatos a impulso), Prospecção, RFPs, WhatsApp IA, Ads+SEO, E-mail, Social, FinOps, KPIs
- **S4 CRM · S5 Jurídico · S6 Dev · S7 Vendas ativo** (menus existentes)

---

## 2. VARIÁVEIS DE AMBIENTE (Vercel) — 18/08

| Grupo | Variáveis | Status |
|---|---|---|
| Core | `DATABASE_URL`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `CLAUDE_MODEL` (opc.) | ✅ |
| **Público** | **`MEDIA_PUBLIC_BASE=https://atlantyx-os.vercel.app`** — base das URLs de mídia (Metricool) e do callback QuickBooks | ✅ confirmar |
| QuickBooks | `QB_CLIENT_ID`, `QB_CLIENT_SECRET` (**Development**), `QB_SANDBOX=true`, `QB_REDIRECT_URI` (opc.), `QB_REFRESH_TOKEN`/`QB_REALM_ID` (opcionais — tokens vivem no banco `kv_store 'qb:tokens'`) | ✅ **conectado (sandbox)** |
| HubSpot | `HUBSPOT_TOKEN` | ✅ · escopo `content` pendente |
| Metricool | `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID` | ✅ |
| Email | `RESEND_API_KEY`, `RESEND_FROM`, `FINANCEIRO_EMAIL` | ✅ |
| Blob (opc.) | `BLOB_READ_WRITE_TOKEN` — desnecessário (Neon hospeda mídia) | — |
| LinkedIn / WhatsApp | Apollo/Phantom ✅ · Z-API ⚪ | |

Toda env nova exige **Redeploy**.

---

## 3. HISTÓRICO DE VERSÕES (v1.5.7 → v1.14.1) — detalhes nos CHANGELOGs

| Faixa | Entregas |
|---|---|
| v1.5.7–v1.5.9 | Copy por rede; kanban anti-perda (merge, boot load, ↻ reconstruir); flag de campanha em processamento; pipeline paralelo |
| **v1.6–v1.6.3** | **Saga do 504:** 2 fases (`campanha_fase1/2`), timeout 25 s por call, frontend lê corpo do erro, **saídas compactas** (causa real: API lenta × respostas grandes) |
| v1.6.4–v1.6.9 | Kanban c/ data/hora, ✎ editar, 🗑 excluir; imagem nas publicações; sync imagem peça↔campanha; recuperação de órfãs; media/medias; CTA + encurtador + regra IG |
| v1.7–v1.7.2 | Calendário 14 dias + exclusão sync Metricool; **Auto-campanha IA** por métricas; FB card de link; **Impulsionamento** (⭐, plano IA, pacote Meta Ads, utm_medium=paid) |
| v1.8 | **Stories 9:16** (roteiro IA, artes, sticker de link) |
| v1.9–v1.9.9 | **Reels slideshow**; hospedagem de mídia; abas Stories/Reels; filtro de data e datas de publicação no kanban; link de reunião padrão; datas travadas/listas vazias (form restoration); Refazer Tudo/Ajustar Copy na campanha; barras de status; compor artes com texto; save robusto; auto-campanha completa; salvar edições do form; brief acompanha o tema (Designer anti-genérico + direção + retry/fallback) |
| v1.10–v1.10.6 | Mídia com extensão (`/media/ID.ext`, Range/HEAD); MP4 real via **WebCodecs**; rota `api/media/[file].js`; resolver entre 4 rotas; **Deployment Protection** detectado (verificação server-side); texto do link na bio |
| v1.11–v1.11.2 | **Carrossel do feed**; texto por rede (IG separado); carrossel na auto-campanha; **reagendar** no Metricool |
| **v1.12–v1.12.1** | **QuickBooks: tokens no banco + OAuth próprio (fim do "Erro token")**; faxina financeiro (orçamento defensivo, auto-load Receber/Realizado, flex-wrap em 15 cabeçalhos); impulso dentro do ICP |
| v1.13 | Menu **S1 · FINANCEIRO** próprio, aberto por padrão |
| v1.14 | **Dashboard Financeiro** (8 KPIs + fluxo 6m + indicadores + lançamentos) e **Gerente Financeiro IA** (chat com contexto real) |
| **v1.14.1** | **Tela preta do financeiro — causa raiz:** faltava um `</div>` (edPreview) na Nova Campanha; todas as páginas seguintes ficavam aninhadas dentro dela e ocultas. Auditoria agora verifica a árvore DOM (0 páginas aninhadas) |

---

## 4. FLUXOS PRINCIPAIS

**Campanha manual:** Nova Campanha → Criar (Fase 1 Story+Copy → Fase 2 Designer‖por-rede) → Neon + peça no Kanban → aba Imagem (🎨 Regerar brief se mudou o tema → Ideogram) → aprovar → 🚀 Publicar (modal: redes, CTA, link de reunião c/ UTM, encurtador, FB card, imagem; **IG em request separado com a frase do link na bio**) → Metricool ou manual → calendário/Desempenho. Edições do formulário salvam sozinhas (💾 Salvar).
**Formatos por campanha:** 📱 Stories (roteiro → artes → 🖼 compor c/ texto → agendar; sticker de link p/ agenda no 3º) · 🖼 Carrossel (roteiro → artes 1:1 → compor → publicar; LI/FB com link, IG com bio) · 🎬 Reel (roteiro → artes → montar MP4 no navegador → ☁ hospedar → agendar). Antes de agendar: **verificação server-side** da URL de mídia; se falhar, barra vermelha e não agenda.
**Auto-campanha completa (Kanban 🤖):** métricas Metricool → campanha (narrativa/copy) → 3 posts nos slots ideais → 3 stories (dia do 1º post 18h) → reel (dia seguinte 12h) → carrossel (+2 dias 12h). ~19 imagens, 6–8 min, aba aberta.
**Funil:** Reel = topo · Post/Carrossel = meio · Story = fundo. Instagram: "🔗 Link na bio → acesse o site e deixe seu contato; falamos em até 24h" (📲 configurável).
**Impulsionar:** Desempenho ⭐ (≥10 cliques) → 📣 (plano IA: públicos próprios HubSpot/lookalike/retargeting, exclusões, linha qualificadora, utm_medium=paid) → Ads Manager (**não o Turbinar do celular** — sai do ICP).
**Financeiro:** Dashboard → Gerente IA (perguntas livres com contexto QB) → telas específicas. Token QB renova sozinho; reconectar = clicar "QuickBooks" na sidebar.

---

## 5. STATUS DAS INTEGRAÇÕES (18/08)

| Serviço | Status | Observação |
|---|---|---|
| Claude API | 🟢 | alerta de saldo baixo por configurar |
| QuickBooks | 🟢 **Conectado (sandbox)** | Redirect URI Development: `https://atlantyx-os.vercel.app/api/financeiro?qb_callback=1`. Produção: revisão do app Intuit → chaves Production, `QB_SANDBOX=false`, mesmo URI na aba Production, reconectar |
| Metricool | 🟢 | posts OK; **stories/reels/carrossel dependem de `MEDIA_PUBLIC_BASE`** — validar com "🔍 Testar hospedagem" verde "verificada pelo servidor" |
| HubSpot | 🟢 | escopo `content` pendente |
| Z-API | ⚪ | pendente |
| Neon | 🟢 | inclui `media_store` |

---

## 6. PENDÊNCIAS ATIVAS
- [ ] Confirmar `MEDIA_PUBLIC_BASE` + Redeploy → 🔍 Testar hospedagem verde → recompor Stories / rehospedar Reel → agendar → excluir posts quebrados no Metricool
- [ ] Conferir no Instagram se o **sticker de link** do 3º story aparece (2 formatos implementados, não confirmado)
- [ ] Bio do Instagram com link do site (+ `utm_source=instagram&utm_medium=bio`)
- [ ] QuickBooks Production (revisão Intuit) ao sair do teste
- [ ] Escopo `content` HubSpot; Z-API; alerta de saldo Anthropic
- [ ] Prints de telas do financeiro ainda desalinhadas (pós v1.14.1) para ajuste fino
- [ ] Contador de "leads pagos qualificados" no Desempenho (cargo/porte via HubSpot)
- [ ] Deck comercial: alinhar mapa de módulos ao menu S1 · Financeiro
- [ ] Schema DBML: adicionar `media_store` e a chave `qb:tokens`

---

## 7. APRENDIZADOS TÉCNICOS
1. **Latência LLM ∝ tokens de saída** — compactar JSON dos agentes resolveu o 504; timeout por chamada torna erros legíveis
2. **Nunca sobrescrever storage sem merge** (kanban, campanhas) — união por id + recuperação
3. **Um `</div>` faltando aninha páginas inteiras** — auditar a árvore DOM (parent de cada `.page`), não só classes
4. **JSONB rejeita `\u0000` e surrogates soltos** (emoji cortado por `substring`) → `jsonSeguro()` no db.js, `safeCut()` nos agentes
5. **Intuit rotaciona refresh tokens** → persistir no banco a cada refresh; OAuth próprio, sem Playground
6. **Vercel Deployment Protection** bloqueia terceiros nas URLs de deployment → domínio de produção + verificação server-side (teste no navegador do dono passa por causa do cookie)
7. **Metricool:** story sem texto; mídia com extensão no path; MP4 com moov no início (MediaRecorder não serve → WebCodecs)
8. **Form restoration do navegador** trava datas/filtros → autocomplete=off + reset ao abrir
9. **Reels/Stories/Carrossel derivam da copy** — mudou tema: Refazer Tudo + regerar brief + refazer roteiros
10. Sempre `node --check` + JSDOM (url real; checagem de DOM tree) antes de entregar; pacotes completos; nunca substituir `api/`

---

## 8. ARQUIVOS DE REFERÊNCIA EM /outputs/
| Arquivo | Conteúdo |
|---|---|
| `atlantyx-v1.14.1.zip` | Pacote completo atual (api + public + vercel.json + changelogs) |
| `index-v1.14.1.html` | Frontend atual |
| `financeiro-v1.14.js`, `metricool-v1.12.js`, `s2-creative-v1.12.js`, `db-v1.9.8.js`, `media-upload-v1.10.5.js`, `media-[file]-v1.10.3.js`, `vercel-v1.10.json` | Backends-chave standalone (última alteração de cada um) |
| `Atlantyx-OS-Apresentacao-Comercial.pptx` | Deck comercial 20 slides |
| `CHANGELOG-v1.6.3.md … CHANGELOG-v1.14.md` | Histórico detalhado |
| `atlantyx-os-schema.dbml` | Schema das tabelas |
