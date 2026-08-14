# Atlantyx OS · v1.5.4 — Leads automáticos HubSpot → Desempenho (via UTM)

## Como funciona

1. Publicação sai com link UTM (v1.5.3): `utm_campaign=<slug-da-campanha>&utm_source=<rede>`
2. Visitante clica, cai na sua landing page e converte num formulário HubSpot
3. O HubSpot grava a primeira URL visitada do contato (hs_analytics_first_url), com os UTMs
4. Nova action `leads_por_campanha` (api/hubspot.js) busca contatos criados no
   período (até 300, paginado), extrai utm_campaign/utm_source da URL e agrega
5. O painel Desempenho puxa isso automaticamente ao carregar

## O que muda no painel

- KPI "Leads (HubSpot)": valor automático com indicador 🔗
  (prioridade sobre o registro manual — o maior dos dois vale)
- Custo/Lead recalculado com leads automáticos
- Funil: etapa Leads alimentada automaticamente
- Comparativo por rede: mostra "N leads 🔗" por rede (via utm_source)
- Log mostra: "[Desemp] HubSpot: N campanha(s) com leads via UTM"

## Requisitos p/ funcionar de ponta a ponta

- HUBSPOT_TOKEN no Vercel (já configurado)
- Landing page com formulário HubSpot (ou tracking code do HubSpot instalado)
- Publicações feitas com o campo "Link de destino" preenchido + UTMs ligados

## Arquivos alterados
- api/hubspot.js (action leads_por_campanha)
- public/index.html (painel Desempenho integra leads automáticos)

## Validação
JSDOM ponta-a-ponta: 7 leads simulados atribuídos, CPL R$100 calculado, 0 erros.
