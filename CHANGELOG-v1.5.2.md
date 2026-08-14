# Atlantyx OS · v1.5.2 — Pacote completo + Metricool na sidebar + diagnósticos QB

## 1. CRÍTICO: arquivos do financeiro voltaram ao pacote

Os pacotes v1.4.x/v1.5.x vinham do hotfix de modelos Claude e NÃO incluíam
`financeiro.js`, `db.js`, `apollo.js`, `phantom.js`, `hubspot.js`. Se a
pasta `api/` do repo foi substituída (em vez de mesclada) por algum desses
pacotes, o `/api/financeiro` passou a retornar 404 — e o painel financeiro
ficou sem dados do QuickBooks.

**Fix:** o pacote agora tem os 24 arquivos backend completos. Confirme que
o seu repositório tem TODOS antes do deploy:
analytics, apollo, claude, db, decisor-map, email-intel, financeiro,
followup-cron, health, hubspot, lead-capture, meeting-schedule, metricool,
outreach-batch, phantom, portal-cadastro, prospect-scan, rfp-monitor,
s1-data, s1-intel, s1-strategy, s2-creative, wa-batch-generate, wa-response.

## 2. Painel financeiro — diagnósticos claros

- `finApi()`: 404 agora explica "arquivo api/financeiro.js não está no
  deploy"; resposta não-JSON mostra o corpo; erros de rede diferenciados.
- `syncQuickBooks()`: erro aparece NO PAINEL (box vermelho persistente)
  com as 4 causas mais comuns (404, refresh token expirado, realm errado,
  sandbox vs produção) + botão "Tentar novamente". Antes era só um toast
  que sumia.

## 3. Metricool no status principal (sidebar)

Nova linha entre HubSpot e Z-API:
- 🟢 "Metricool · Conectado" — credenciais OK
- ⚪ "Metricool · Configurar" — sem credenciais (modo manual)
- ⚪ "Metricool · Offline" — endpoint inacessível
Verificação automática ~2,5s após carregar a página.

## 4. Botão "Minhas Campanhas" blindado

Não reproduzi a falha em testes (funciona em JSDOM), então blindei:
- try/catch total com log `[Campanha] Aba: lista` a cada clique
- optional chaining em todos os elementos
- placeholder "Carregando campanhas..." imediato no grid
- scroll automático até a lista
- erros de filtro/banco isolados (um não derruba o outro)

Se ainda não abrir: o log lateral agora mostra exatamente qual erro ocorreu
ao clicar — mande o print do log.

## Arquivos alterados
- public/index.html (sidebar, finApi, syncQuickBooks, mostrarAbaCampanha)
- api/ (financeiro.js, db.js, apollo.js, phantom.js, hubspot.js adicionados)
