# Stack, padrões e convenções — Atlantyx OS

## Stack real (confirmado na Fase 1)
| Camada | Tecnologia |
|---|---|
| Hospedagem | Vercel — push na `main` publica. Domínio de produção: `atlantyx-os.vercel.app` (URLs de deployment ficam atrás de Deployment Protection) |
| Backend | Funções serverless Node 24 em `api/*.js` (ESM, `"type": "module"`), sem framework. Cada arquivo exporta `default comGuarda(handler, '<nome>')` |
| Frontend | SPA de arquivo único `public/index.html` (~2,8 MB) + módulos carregados sob demanda `public/*-ui.js` |
| Banco | Neon Postgres via `@neondatabase/serverless` (driver HTTP, tagged template `sql\`...\``). **Sem ORM e sem pasta de migrações**: cada API cria suas tabelas com `CREATE TABLE IF NOT EXISTS` |
| IA | Anthropic API (`fetch` direto, `anthropic-version: 2023-06-01`); modelo por variável (`CLAUDE_MODEL`, padrão `claude-sonnet-4-6`) |
| Arquivos | `docx` (Word via `lib/docx-md.js`), `exceljs`, `pdf-parse`, `sharp` |
| E-mail | Gmail SMTP (nodemailer) com fallback Resend |
| CI/robôs | GitHub Actions: Claude Code Action (tarefas `@claude`), robô de merge (`claude-pr.yml`), comandos da Esteira, QA noturno, QA externo, **gates B.P.M. (`ci.yml`)** |

## Comandos de qualidade (não há npm lint/test/build)
| O quê | Comando |
|---|---|
| Sintaxe (rápido) | `node scripts/validar.mjs --sem-navegador` |
| Sintaxe + carga da página sem erro de JS | `node scripts/validar.mjs` (precisa de Playwright/Chromium) |
| Gates B.P.M. (escopo, banco, versão, segredos, partitura) | `node scripts/bpm-gates.mjs --local` (contra a main) |
| Inventário dos contratos | `node scripts/bpm-inventario.mjs` (`--checar` no CI) |
| Testes de unidade (quando houver) | `node --test testes/` (node:test, sem dependências) |

## Padrões de código
- API: `POST { action, ...}` → `{ success, ... }`; erro → `{ success: false, error }` com HTTP 4xx/5xx. GET só para crons, páginas públicas por token e downloads.
- Toda rota passa por `comGuarda`. Rota pública nova = entrada em `PUBLICAS` (lib/qa-guard.js), sempre restrita (método + parâmetro/token).
- Front: funções com prefixo do módulo (`tr*` Tendências, `fb*` Fábrica, `qp*` QA de Produtos, `fin*` Financeiro…); escapar todo texto vindo do banco (`_xxEsc`); comentário `// ═══ vX.YY: <squad> · <tela>` abre a seção do módulo no index.html.
- Versão: `ATLANTYX vX.YYY]` (console) e `ATX-vX.YYY'` (build) — só o robô de merge (ou o Maestro em commit direto) altera.
- Mudança em comportamento existente: preserve o que funciona; comente com `// vX.YY:` o porquê, não o quê.
- Sem novas dependências npm sem aprovação da T1 (package.json é da T1).

## Variáveis de ambiente (nomes — valores só na Vercel/GitHub)
Core: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CRON_SECRET`, `MEDIA_PUBLIC_BASE` · QuickBooks: `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_SANDBOX`, `QB_REDIRECT_URI` · GitHub: `GITHUB_TOKEN`, `GITHUB_REPO` · E-mail: `EMAIL_IMAP_USER`, `EMAIL_IMAP_PASS`, `EMAIL_SMTP_*`, `RESEND_API_KEY`, `RESEND_FROM` · Marketing: `METRICOOL_*`, `IDEOGRAM_API_KEY`, `YOUTUBE_API_KEY`, `META_ADS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_IG_USER_ID`, `META_PIXEL_ID` · LinkedIn Ads (v3.239): `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (opcionais `LINKEDIN_AD_ACCOUNT_ID`, `LINKEDIN_ORG_ID`, `LINKEDIN_API_VERSION`, `LINKEDIN_SCOPES`; o token do OAuth fica no kv_store, nunca em variável) · Vendas: `HUBSPOT_*`, `APOLLO_API_KEY`, `PHANTOM_*` · WhatsApp: `ZAPI_*` · QA: `QA_CRIPTO_KEY`, `QA_IA_MODEL` · GitHub Actions secrets: `ANTHROPIC_API_KEY`, `CRON_SECRET`, `ATX_QA_EMAIL`, `ATX_QA_SENHA`.
Nova variável = linha aqui + cadastro na Vercel pela T1, no mesmo PR.

## Lições que valem para todas as trilhas
- QuickBooks: tokens vivem no banco (`kv_store 'qb:tokens'`); a chave de URL de transação é por tipo (`conta`, `pagto_conta`, `despesa`, `cheque`, `invoice`).
- Vercel: corpo de requisição/resposta até ~4,5 MB por função — arquivos maiores em partes.
- Mudou variável de ambiente na Vercel → precisa de Redeploy.
- Mídia para Metricool/Instagram precisa de URL pública com extensão (`/media/ID.mp4`) no domínio de produção.
