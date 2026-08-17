# Atlantyx OS · v1.7.2 — Fluxo de Impulsionamento (2ª opção de publicação)

## Duas opções por publicação agora
1. ORGÂNICO (existente): Metricool/manual, card FB, link na bio IG
2. IMPULSIONADO (novo): fluxo completo de preparação Meta Ads

## Como funciona
### ⭐ Detecção automática de candidatos
No Desempenho, publicação com cliques >= 10 (limiar em
localStorage atx:limiar_impulso) ganha ⭐ + botão 📣 Impulsionar.

### 📣 Modal de impulsionamento
- Copy do post vencedor (editável)
- Link com utm_medium=PAID (troca automática — rastreio separado)
- Imagem da publicação
- 🤖 "Gerar segmentação e orçamento com IA" (action plano_impulso):
  objetivo, CTA ("Agendar horário"), cargos/setores/interesses/idade/
  localização, R$/dia, duração, headline do anúncio, justificativa
- 📋 Copiar pacote completo (formatado p/ colar no Ads Manager)
- ↗ Abrir Meta Ads Manager (marca a publicação como "preparada")

### Rastreio pago separado
- api/hubspot.js agora extrai utm_medium: leads com paid/cpc/ads são
  contados à parte
- KPI Leads mostra: "12 🔗 (4 📣 pagos)"
- Status do impulso aparece na lista (📣 sugerida/preparada)

## Por que não criação automática do anúncio
Meta Marketing API exige app aprovado + Business Manager + tokens de ads
(semanas de burocracia). O Atlantyx entrega tudo pronto até a porta do
Ads Manager; a criação lá dentro leva ~2 minutos com o pacote copiado.

## Validação (JSDOM)
⭐ e 📣 com 15 cliques · link paid · plano IA renderizado (R$60/dia) ·
pacote copiado · status "preparada" na lista. 0 erros.

## Arquivos
- api/s2-creative.js (plano_impulso) · api/hubspot.js (utm_medium)
- public/index.html
