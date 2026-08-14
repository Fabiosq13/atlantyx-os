# Atlantyx OS · v1.5 — Publicação em Redes + Painel de Desempenho

**Data:** 12 de agosto de 2026

## Novidades

### 1. Publicação de peças aprovadas (2 modos, escolha na hora)

No Kanban de Aprovação, toda peça na coluna **Aprovado** ganha o botão
**🚀 Publicar**, que abre modal com:
- Checkboxes das redes (pré-marcadas conforme `redes_ativas` da campanha)
- Texto editável (vem da copy da peça)
- Agendamento opcional (datetime)
- **Dois botões de execução:**
  - **🚀 Publicar via Metricool (auto)** — publica/agenda automaticamente
    (só habilitado se Metricool configurado)
  - **✋ Manual (abrir rede)** — copia o texto e abre o compositor de cada
    rede em abas (LinkedIn share, FB sharer, IG)

Após publicar (qualquer modo): peça move para coluna **Publicado**,
publicação registrada no Neon (`atx:publicacoes`) com campanha vinculada.

### 2. Integração Metricool (backend novo: api/metricool.js)

Actions: `status`, `publicar`, `listar_posts`, `metricas`, `metricas_posts`.
Graceful degradation: sem credenciais, o painel indica "modo manual" e nada quebra.

**Para ativar, configure no Vercel:**
| Env var | Onde achar |
|---|---|
| METRICOOL_USER_TOKEN | Metricool → Settings → API (plano Advanced+) |
| METRICOOL_USER_ID | número `userId=` na URL do painel |
| METRICOOL_BLOG_ID | número `blogId=` na URL do painel (marca conectada) |

Depois: Redeploy. O painel Desempenho mostra "Metricool: conectado".

### 3. Painel S2 → Desempenho (menu novo)

- **KPIs:** Publicações, Impressões, Cliques, Engajamento, Leads, Custo/Lead
- **Funil:** Publicações → Impressões → Cliques → Engajamento → Leads
- **Comparativo por rede** (LinkedIn / Instagram / Facebook)
- **Lista de publicações** com data, rede, modo (auto/manual) e métricas
- **Filtros:** por campanha e por período (7/30/90 dias)
- **Métricas automáticas** via Metricool (mescladas por matching de texto)
- **Registro manual de métricas** (modal ✎) para o modo manual — inclui
  campo "Leads gerados" que alimenta o funil e o Custo/Lead

## Arquivos alterados
- `api/metricool.js` (NOVO)
- `public/index.html` (menu, página, JS de publicação/desempenho, botão no kanban)

## Validação
- node --check: OK
- JSDOM: 14/14 funções novas definidas, page-s2desempenho renderiza, 0 erros
