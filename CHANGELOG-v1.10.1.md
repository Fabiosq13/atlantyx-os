# Atlantyx OS · v1.10.1 — Brief que muda de verdade + saves incrementais + prévia do vídeo

## 1. "Mudei a direção e a imagem/brief não mudou"
Mesmo com as regras da v1.9.9, a IA pode insistir na cena "executivo +
telas". Agora o frontend MEDE: se o brief novo tem >55% das palavras do
anterior, pede outra vez com uma metáfora obrigatória (sorteada: farol na
névoa, engrenagens, ampulheta de moedas, chão de fábrica com robôs...);
se ainda vier igual, monta o brief LOCALMENTE com a sua direção + a
metáfora — o brief NUNCA mais fica igual. O status diz o que aconteceu.
(Sua direção "imagens ligadas a inteligência artificial" entra literal.)

## 2. Artes dos stories/reel "não gravadas"
Antes o save acontecia só no fim do lote — se qualquer coisa falhava no
meio (ou o 500 antigo), perdia tudo. Agora salva no banco a cada arte
gerada e a cada story composto (texto gravado). Ao reabrir, o que foi
feito está lá.

## 3. "Montei o vídeo, salvei, voltei e está sem vídeo"
Dois motivos possíveis e ambos tratados:
- URL antiga (?m=ID, sem extensão) que o player não carrega bem → a prévia
  agora usa a URL nova /media/ID.mp4 automaticamente
- Se o vídeo não carregar, aparece barra vermelha com a URL e a instrução
  (checar deploy do vercel.json/api/media-upload.js, ou montar+hospedar de
  novo) em vez de um player mudo em 0:00
Importante: o vídeo hospedado só existe se o "☁ Hospedar" respondeu OK
(barra verde "Hospedado (neon)"). Se na sessão anterior o save falhou
(erro 500 corrigido na v1.9.8), a URL não ficou gravada — monte e hospede
uma vez com a versão atual.

## Checklist de deploy desta rodada (v1.9.8 → v1.10.1)
api/db.js · api/s2-creative.js · api/metricool.js · api/media-upload.js ·
vercel.json (rota /media) · public/index.html — e Redeploy.
Console deve mostrar [ATLANTYX v1.10.1].

## Validação (JSDOM)
IA devolve sempre a mesma cena → 2ª chamada com metáfora → brief final
diferente e contendo a direção do usuário; status mostra o conceito.
