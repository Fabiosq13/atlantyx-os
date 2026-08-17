# Atlantyx OS · v1.9 — Reels em slideshow (topo de funil)

## Onde
Nova Campanha → aba Imagem → painel "🎬 Reel em slideshow (9:16)".
Stories (v1.8) e tudo anterior seguem iguais.

## Fluxo (5 botões, na ordem)
1. 🤖 Gerar roteiro — action `reel_pack`: 5 slides (gancho → insights →
   CTA), máx. 12 palavras por tela, + legenda com hashtags B2B + trilha
   sugerida. Tudo editável nos cards.
2. ◆ Gerar artes 9:16 — Ideogram vertical com área central limpa (ou colar
   URL própria).
3. 🎬 Montar vídeo — NO NAVEGADOR (Canvas + MediaRecorder): 720×1280,
   30 fps, 3 s/slide (ajustável 2,5–3,5), efeito Ken Burns, crossfade
   entre slides, texto grande com sombra, marca "ATLANTYX", barra de
   progresso e "🔗 Link na bio" no último. Prévia + ⬇ Baixar.
   Chrome/Edge gravam MP4 (H.264) — o formato exigido pelo Instagram.
   Firefox gera WebM (aviso na tela; baixe e converta ou use Chrome).
4. ☁ Hospedar — envia o MP4 para o Vercel Blob (URL pública permanente).
5. 🚀 Agendar Reel — Metricool tipo REEL (Instagram + Facebook se ativo)
   com a legenda. Entra no calendário (🎬) e no Desempenho.

## Novo endpoint api/media-upload.js
- POST binário → Vercel Blob (limite ~4,3 MB por chamada; um reel de 15 s
  a 2 Mbps fica em ~3–4 MB)
- POST {action:'rehost', url} → baixa e hospeda permanente (resolve o
  problema das URLs efêmeras do Ideogram para qualquer mídia)
- GET ?proxy=<url> → repassa imagem com CORS (necessário para o canvas
  gravar sem "taint") — funciona mesmo SEM o Blob configurado
- GET ?status=1 → diagnóstico

## ⚠ Setup único (para Hospedar/Agendar; roteiro, artes, montar e baixar
## funcionam sem isso)
1. No repo:  npm i @vercel/blob   → commitar package.json (+ lock)
2. Vercel → Storage → Create Database → Blob → conectar ao projeto
   (cria a env BLOB_READ_WRITE_TOKEN sozinho) → Redeploy
Sem isso o botão Hospedar mostra a instrução; você ainda pode ⬇ Baixar o
MP4 e subir manualmente no Metricool ou no app do Instagram (onde dá para
adicionar trilha em alta).

## Limitações honestas
- Sem áudio (MediaRecorder de canvas não tem faixa de áudio). Via app do
  Instagram você adiciona música na hora de publicar.
- Vídeo é montado no navegador: mantenha a aba aberta durante os ~15 s.
- Tamanho: 4,3 MB por upload (limite Vercel). Se passar, reduza s/slide.

## Estratégia (recap)
Reel = topo (descoberta) · Post = meio (educar) · Story = fundo (converter
quem já segue). Agora os três saem da mesma campanha.

## Validação
JSDOM: roteiro 5 slides + legenda → artes → (montador com stubs de
Canvas/MediaRecorder: grava, quebra texto, crossfade, 3 slides = 9 s) →
upload MP4 → agendamento tipo REEL em IG+FB. Sem MediaRecorder → aviso
claro. 0 erros. node --check em todos os arquivos.

## Arquivos
- NOVO api/media-upload.js · api/metricool.js · api/s2-creative.js
- public/index.html · vercel.json (maxDuration media-upload)
(image-gen.js do seu repo é usado — nunca substitua a pasta api/ inteira)
