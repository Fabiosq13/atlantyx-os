# Atlantyx OS · v1.8 — Stories 9:16 (retenção e conversão de quem já segue)

## Onde
Nova Campanha → aba Imagem → painel "📱 Stories (9:16)". Tudo o que existia
continua igual; é um bloco a mais.

## Fluxo (3 botões)
1. 🤖 Gerar roteiro de 3 stories — action `story_pack`: a IA adapta a
   narrativa+copy da campanha em sequência gancho → valor → CTA. Cada
   story tem no máx. 18 palavras na tela (editáveis no card). Preview 9:16
   com o texto sobreposto e o sticker de link no 3º.
2. ◆ Gerar artes 9:16 — Ideogram em ASPECT_9_16 com área central limpa
   (o texto vai por cima). Também aceita colar URL própria.
3. 🚀 Agendar stories (Metricool) — 3 stories em sequência (a cada 2 min)
   no Instagram (+Facebook se ativo). O 3º leva STICKER DE LINK com
   utm_medium=story → clique direto, sem "link na bio". Registra tudo no
   calendário (ícone 📱) e no Desempenho; leads de story separados por UTM.

## Backend
- metricool.js `publicar` aceita tipo:'STORY' + link_sticker; monta
  providers com postType STORY e instagramData/facebookData. Se a API do
  Metricool rejeitar o campo do sticker, o story publica sem ele (o
  Metricool avisa no log do Vercel: "[metricool publicar] payload: tipo…").
- s2-creative.js action `story_pack` (1600 tk).

## Estratégia (recap)
Reel = topo (descoberta) · Post = meio (educar) · Story = fundo (converter
quem já segue, com clique direto). Reels (vídeo) ficam para a v1.9.

## Validação (JSDOM)
Roteiro 3 stories → artes 9:16 → 3 agendamentos STORY em IG+FB, sticker
apenas no 3º com utm_medium=story, intervalo 2 min. 0 erros.

## Arquivos
- api/metricool.js · api/s2-creative.js · public/index.html
(image-gen.js do seu repo é usado — não substitua a pasta api/)
