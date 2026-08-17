# Atlantyx OS · v1.6.5 — Imagem nas publicações (fix Instagram)

## O gap (visto no Metricool)
A publicação chegou ao Metricool ✓ mas SEM imagem → Instagram recusa
("Adicione pelo menos imagem ou vídeo"). O modal nunca enviava imagem,
embora o backend metricool.js já suportasse (campo medias).

## Fixes
1. Modal de publicação: novo campo "IMAGEM DA PUBLICAÇÃO (URL)" com
   preview em miniatura — PRÉ-PREENCHIDO com a imagem da campanha
   (Ideogram, campanha.imagens[0]) ou da peça
2. Aviso amarelo quando não há imagem: "o Instagram vai recusar"
3. Metricool: payload agora envia imagem_url → vira media do post
4. Guard: Instagram marcado + sem imagem → confirm antes de publicar
5. Modo manual: a imagem abre em outra aba para salvar e anexar
6. Painel Desempenho: publicação registra a imagem usada

## Fluxo recomendado
Criar campanha → aba Imagem → Gerar no Ideogram → colar a URL gerada
(fica salva na campanha) → aprovar → Publicar: a imagem já vem no modal.

## Validação (JSDOM)
Campo pré-preenchido com a imagem da campanha; payload do Metricool
enviando imagem_url. 0 erros.
