# Atlantyx OS · v1.5.5 — Landing Pages do HubSpot integradas

## Contexto
O usuário tem landing page da Atlantyx criada NO HubSpot. Como o Claude não
acessa a conta HubSpot, a verificação foi embutida no próprio Atlantyx.

## Novidades

### Botão "🔗 Landing Pages HubSpot" (painel Desempenho)
- Lista as landing pages do HubSpot CMS (nome, URL pública, status
  publicada/rascunho, ordenadas por atualização)
- "abrir ↗" — abre a LP em nova aba para conferir
- "usar como link" — grava a URL como link_destino da campanha selecionada
  no filtro (salva no Neon); as próximas publicações da campanha já vêm com
  essa LP + UTMs automáticos. Sem campanha selecionada: copia a URL.

### Backend: action listar_landing_pages (api/hubspot.js)
- GET /cms/v3/pages/landing-pages (20 mais recentes)
- Se retornar 403: mensagem na tela explica passo a passo — o Private App
  precisa do escopo "content" (Settings → Private Apps → Scopes → content →
  novo token → atualizar HUBSPOT_TOKEN no Vercel → Redeploy)

## Fluxo completo agora
LP do HubSpot → "usar como link" na campanha → publicar peça (link + UTM
automáticos) → visitante converte no formulário da LP → lead nasce no
HubSpot com a URL de origem → painel Desempenho atribui o lead à campanha
e à rede automaticamente (v1.5.4).

## Atenção
Se a listagem der 403, é só o escopo "content" faltando no Private App —
os 4 escopos configurados na instalação original eram só de CRM.
