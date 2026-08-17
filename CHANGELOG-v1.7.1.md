# Atlantyx OS · v1.7.1 — Facebook como card de link clicável

## Contexto (alinhamento importante)
O botão "Agende uma reunião" visto em posts de concorrentes NÃO é post
orgânico — é POST IMPULSIONADO (Meta Ads) com CTA button. Posts orgânicos
de FB/IG não têm botão. O que existe no orgânico:
- Facebook: publicando SEM imagem anexada e com o link no texto, o FB gera
  um CARD do link (preview com imagem OG da página) — o card inteiro é
  clicável. É o mais próximo de "botão" no orgânico.
- Instagram: somente link na bio / sticker em Stories / botão do perfil.

## Novidade: checkbox "Facebook como CARD DE LINK clicável"
No modal de publicação (modo Metricool). Quando ligado e FB entre as redes:
- LinkedIn/Instagram: publicam normalmente COM a imagem
- Facebook: publica num post SEPARADO, SEM imagem anexada e SEM encurtador
  (o card precisa da URL real para puxar o preview OG) → o Facebook
  renderiza o cartão clicável do seu link
Registro no calendário/Desempenho sem duplicação.

## Dicas para o card ficar bom
- Use como link uma LANDING PAGE do HubSpot (tem imagem OG) — o link
  meetings.hubspot.com não expõe imagem de preview (card sai sem foto)
- Para ter o BOTÃO de verdade: impulsione o post no Meta Business
  (CTA "Agendar horário" + sua URL) — o material do Atlantyx já sai pronto

## Validação (JSDOM)
FB card ligado → 2 chamadas: [linkedin,instagram]+imagem e [facebook] sem
imagem, sem encurtador, link no texto. 0 erros.
