# Atlantyx OS · v1.4 — Resiliência de IA & Observabilidade

**Data:** 12 de agosto de 2026
**Anterior:** v1.3 (junho/2026)

---

## 🔥 Correção crítica

### Modelo Claude Deprecated (17 arquivos)

O modelo `claude-sonnet-4-20250514` foi retirado pela Anthropic em **15/06/2026**.
Todas as chamadas de IA estavam retornando erro 500 há ~58 dias.

**Sintomas:** Studio Criativo, WhatsApp com IA, RFP Monitor, agentes S1,
LinkedIn com IA, prospecção Apollo — todos com erro 500.

**Correção:** substituído para `claude-sonnet-4-6` em 17 arquivos, 29 chamadas.

---

## ✨ Melhorias novas (previnem que aconteça de novo)

### 1. Modelo centralizado em variável de ambiente

Antes: `model: 'claude-sonnet-4-6'` hard-coded em 17 arquivos.
Agora: `const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'`

**Como usar:** quando a Anthropic depreciar de novo, basta ir no Vercel →
Environment Variables → adicionar `CLAUDE_MODEL` = `claude-sonnet-5` (ou
qualquer modelo novo). Nenhum PR, nenhum deploy manual.

Se `CLAUDE_MODEL` não estiver definido, usa o fallback `claude-sonnet-4-6`.

### 2. Endpoint `/api/health` + Cron semanal

Novo endpoint que faz healthcheck do sistema:

- `GET /api/health` — status básico (público, sem custo de IA)
- `GET /api/health?full=1` — completo (testa Claude API + banco Neon)

**Retorna 503 se algo crítico falhou** — Vercel detecta e envia email.

Configurado como cron `0 9 * * 1` (todas as segundas às 9h) via `vercel.json`.
Assim, no pior caso, você descobre problema em **7 dias**, não em **58**.

Resposta exemplo:
```json
{
  "status": "healthy",
  "build_id": "ATX-20260812-1830-A1B2C3D4",
  "build": { "version": "1.4", "branch": "main", ... },
  "checks": {
    "server":    { "status": "ok" },
    "env":       { "status": "ok", "message": "2 envvars críticas OK" },
    "claude_api":{ "status": "ok", "message": "Claude respondeu em 342ms" },
    "database":  { "status": "ok", "message": "Neon respondeu em 88ms" },
    "model":     { "status": "ok", "message": "claude-sonnet-4-6" }
  }
}
```

### 3. Build ID dinâmico no rodapé

Antes: `ATX-20260502-1232-03EC6079` hard-coded no HTML (ficava desatualizado).
Agora: carregado do `/api/health` a cada abertura da página.

**Localização:** rodapé da sidebar + header do Dashboard.
**Interativo:** clicar no build ID do header roda healthcheck completo e mostra popup.
**Feedback visual:** se algum check falhou, o texto fica vermelho.

Formato: `ATX-{YYYYMMDD}-{HHMM}-{git_commit_hash_8_chars}`
Exemplo: `ATX-20260812-1830-A1B2C3D4`

---

## 📦 Arquivos afetados

### Backend (18 arquivos)
- **17 arquivos corrigidos** (modelo + centralização):
  analytics.js, claude.js, decisor-map.js, email-intel.js, followup-cron.js,
  lead-capture.js, meeting-schedule.js, outreach-batch.js, portal-cadastro.js,
  prospect-scan.js, rfp-monitor.js, s1-data.js, s1-intel.js, s1-strategy.js,
  s2-creative.js, wa-batch-generate.js, wa-response.js
- **1 arquivo novo:** api/health.js

### Frontend (1 arquivo)
- public/index.html (build ID dinâmico + função `verificarSaude()`)

### Config (1 arquivo)
- vercel.json (novo cron do healthcheck)

---

## 🚀 Como aplicar

### Opção A — Substituição direta

1. Descompacte o ZIP
2. Copie a pasta `api/` sobrescrevendo `atlantyx-os/api/`
3. Copie `public/index.html` sobrescrevendo `atlantyx-os/public/index.html`
4. Copie `vercel.json` sobrescrevendo `atlantyx-os/vercel.json`
5. Commit + push:
   ```
   git add -A
   git commit -m "feat(v1.4): centralizar modelo Claude + healthcheck + build ID dinâmico"
   git push
   ```
6. Vercel faz deploy automaticamente em ~2 minutos

### Variáveis novas no Vercel (todas opcionais)

| Variável | Uso | Default |
|---|---|---|
| `CLAUDE_MODEL` | Modelo Claude a usar | `claude-sonnet-4-6` |

Nenhuma outra variável nova é necessária. `CRON_SECRET` já existente é reutilizado
para o healthcheck.

---

## ✅ Como validar depois do deploy

1. Abra a URL do Atlantyx no browser
2. Confira o rodapé da sidebar — deve mostrar novo build ID começando com
   `ATX-20260812-` (ou a data que você fez o deploy)
3. Clique no build ID do header do Dashboard — abre popup com status detalhado
4. Vá em **S2 → Studio Criativo → Criar Campanha com IA** — deve funcionar
5. Aguarde a próxima segunda 9h — o cron vai rodar automaticamente. Se falhar,
   você recebe email do Vercel

Teste manual do cron:
```bash
curl -X GET "https://SUA-URL.vercel.app/api/health?full=1" \
  -H "Authorization: Bearer SEU_CRON_SECRET"
```
