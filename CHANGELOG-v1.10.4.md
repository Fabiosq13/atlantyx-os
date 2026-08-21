# Atlantyx OS · v1.10.4 — Mídia funciona com QUALQUER rota que estiver no ar

## O que os prints mostraram
O upload funcionou (hospedou no Neon), mas a URL /api/media/ID.jpg deu 404.
Ou seja: a rota dinâmica api/media/[file].js não foi reconhecida nesse
deploy (isso acontece em alguns projetos Vercel — nome com colchetes,
ordem de rotas com rewrites, cache de build). Antes, tudo dependia dessa
única rota.

## Fix: resolver de URL com fallback
Antes de usar qualquer mídia, o Atlantyx testa 4 formas de URL, na ordem,
e usa a PRIMEIRA que responde com o tipo certo:
  1. /api/media/ID.ext        (rota dinâmica)
  2. /media/ID.ext            (rewrite do vercel.json)
  3. /api/media-upload?f=ID.ext
  4. /api/media-upload?m=ID
Cache por mídia. Reels/Stories/teste passam a usar a URL que funciona no
SEU deploy — e o Log avisa quais rotas não responderam. A verificação de
erro agora mostra também o código do Vercel (ex.: NOT_FOUND) e um trecho
da resposta, para diferenciar "rota não existe" de "mídia não encontrada".

## Observação
As formas 3/4 (query string) funcionam com media-upload.js já deployado —
que é o seu caso (o upload deu certo). O Metricool provavelmente aceita
essas URLs (a validação de tipo é pelo Content-Type). Se ele recusar por
falta de extensão no caminho, aí sim precisamos que a rota 1 ou 2 esteja
no ar — e o "🔍 Testar hospedagem" agora diz exatamente quais estão.

## Ordem de teste
1. Deploy de public/index.html (só ele mudou nesta versão)
2. Reels → 🔍 Testar hospedagem → verde, com a URL que funciona
3. Stories: 🖼 Compor → 🚀 Agendar · Reel: ☁ Hospedar → 🚀 Agendar
Se der vermelho ainda: a mensagem lista as 4 tentativas com o motivo.

## Validação (JSDOM)
Rota dinâmica e rewrite → 404 NOT_FOUND; query ?f= → 200 image/jpeg →
resolver escolhe a query, marca 2 rotas falhas. Sintaxe OK.
