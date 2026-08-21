# Atlantyx OS · v1.11 — Carrossel do feed + texto por rede

## 1. 🖼 Carrossel do feed (1:1) — novo painel na aba Imagem (+ aba "Carrossel")
Um post com várias imagens deslizáveis (Instagram, LinkedIn, Facebook).
Fluxo (4 botões):
- 🤖 Gerar roteiro — action `carrossel_pack`: 5 slides (capa com título +
  subtítulo → ideias com título + frase de apoio → CTA) e DUAS legendas:
  LinkedIn/FB (com link de reunião + UTM) e Instagram (com a frase do link
  na bio explicada) + hashtags. Tudo editável.
- ◆ Gerar artes 1:1 — Ideogram quadrado com terço inferior limpo.
- 🖼 Compor artes com texto — grava título, apoio, marca, "n / N" e
  "deslize →" na imagem (1080×1080 JPEG), hospeda e VERIFICA a URL
  pública (como o Metricool vê).
- 🚀 Publicar carrossel — Metricool com media[] (várias imagens):
  LinkedIn+Facebook num request (legenda com link, encurtador on) e
  Instagram em outro (legenda com link na bio). Entra no calendário (🖼).

## 2. Texto por rede (multi-rede pelo modal e na Auto-campanha)
Antes: publicar em LinkedIn+IG+FB de uma vez mandava UM texto com a URL
crua — no Instagram aparecia "seca". Agora o Instagram sempre vai em
request separado com a frase do link na bio; LinkedIn/FB com o link
clicável. Registro/calendário por rede como antes.

## Backend
- metricool.js: `imagens_urls[]` → media/medias com várias URLs
- s2-creative.js: action `carrossel_pack`

## Validação (JSDOM c/ stubs)
Roteiro 5 slides + legendas por rede → 5 artes → 5 compostas/hospedadas
(verificação OK) → 2 requests ao Metricool: [linkedin,facebook] com 5
imagens e legenda com link; [instagram] com legenda do link na bio.
Arquivos: api/metricool.js · api/s2-creative.js · public/index.html
