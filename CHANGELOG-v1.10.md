# Atlantyx OS · v1.10 — Reels e Stories aceitos pelo Metricool

## O que os prints do Metricool revelaram (obrigado — foram decisivos)
1. Story: "Máximo de caracteres permitido 0" → Stories NÃO aceitam texto.
   Nós enviávamos o texto_tela como texto do post.
2. Story: "Sem imagem" + miniatura quebrada → o Metricool não conseguiu
   usar a URL da imagem.
3. Reel: "Imagens não são suportadas" / "não foi possível validar a
   duração" → o Metricool tratou nosso vídeo como IMAGEM.
Causa comum de 2 e 3: a URL da mídia hospedada era
/api/media-upload?m=ID — SEM EXTENSÃO. Metricool/Instagram decidem o tipo
pela extensão do caminho (.mp4/.png) e alguns validadores fazem HEAD e
pedidos por faixa (Range) — nada disso funcionava.

## Fixes
- Nova rota pública com extensão: https://SEU-APP.vercel.app/media/ID.mp4
  (ou .png/.jpg) via rewrite em vercel.json → api/media-upload?f=ID.ext
- media-upload.js: serve com Content-Type/Content-Length corretos,
  suporta HEAD e Range (206 Partial Content), Cache imutável
- URLs antigas (?m=ID) continuam funcionando e são convertidas
  automaticamente para /media/ID.ext na hora de publicar (compat)
- metricool.js: Story vai com text = '' (o texto já está gravado na arte
  pelo "Compor artes com texto")
- Barra de status mostra a URL de mídia efetivamente enviada

## Sobre "conteúdo errado"
Nos stories o texto que aparecia no Metricool era o texto_tela (que o IG
recusa) — agora não vai texto nenhum; o conteúdo do story é a arte com o
texto/CTA/link gravados. No reel, a legenda continua a gerada (com link).

## Após o deploy (IMPORTANTE)
- Commitar vercel.json (rota /media) + api/media-upload.js + api/metricool.js
  + public/index.html
- Excluir no Metricool os stories/reel com erro e reagendar pelo Atlantyx
  (🚀 Agendar) — os que já estavam hospedados não precisam refazer o vídeo
- Se um Reel ainda vier como "imagem": me mande a URL exibida na barra
  verde; abro no navegador e vejo o cabeçalho que o Metricool recebe

## Validação
API: upload → URL /media/ID.mp4 · HEAD 200 video/mp4 · Range 0-9 → 206
bytes 0-9/1000 · GET completo. Front: reel/story publicam com URL
convertida e story sem texto. 0 erros.
