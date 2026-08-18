# Atlantyx OS · v1.9.5 + v1.9.6 — Status visível, link nos Stories/Reels,
# hospedagem SEM Blob e o erro 500 ao salvar

## v1.9.5 — sinalização clara + link da reunião visível
### Barra de status grande (Stories e Reels)
Cada painel ganhou uma barra no topo: AZUL com spinner e % durante o
processamento ("Gerando arte 2 de 3...", "Gravando vídeo 64%"), VERDE ao
concluir (com o próximo passo), VERMELHA com texto grande em erro (rola
até ela). Substitui as mensagens miúdas.

### Link da reunião visível
- Stories: campo "🔗 LINK DA REUNIÃO (sticker do 3º story)" no painel,
  pré-preenchido com o padrão; o 3º card mostra "Sticker → <link>".
- NOVO passo "🖼 Compor artes com texto": grava texto, marca ATLANTYX,
  CTA em pílula branca e o link legível (ex. meetings.hubspot.com/atlantyx)
  NA IMAGEM (canvas 720×1280) e hospeda. Motivo: o Instagram NÃO exibe
  legenda em stories — antes, o story publicado saía só com a arte crua,
  sem o texto que você via na prévia. "Agendar" faz isso sozinho se
  você não tiver clicado.
- Reels: último slide do vídeo mostra "🔗 Link na bio" + o link legível;
  a legenda gerada já vem com "👉 Agende sua conversa: <link com UTM>";
  o card do último slide mostra o link.

## v1.9.6 — hospedagem sem configuração + erro 500 ao salvar
### Vídeo/imagens hospedados no seu Neon (nada a configurar)
api/media-upload.js: se não houver Vercel Blob, salva a mídia na tabela
media_store do Neon (já configurado) e serve por URL pública própria
(https://SEU-APP.vercel.app/api/media-upload?m=ID). O Metricool busca
o Reel/Stories dessa URL. Vercel Blob continua opcional (usado se existir).
Obs.: a API do Metricool não aceita upload direto de arquivo — trabalha
com URL pública de mídia; por isso a hospedagem própria é o caminho.

### Erro HTTP 500 ao salvar campanha com reels/stories
1) O frontend engolia a mensagem real (só "HTTP 500"). Agora todo save
   passa por salvarCampanhaNoBanco(): mostra o motivo exato do banco em
   toast + Log + barra vermelha do painel.
2) A campanha é SANEADA antes de salvar: remove campos transitórios
   (URLs blob:, campos _erro/_x, video_blob_pronto, composta_local),
   caracteres \u0000 (JSONB rejeita) e aborta se passar de 4 MB dizendo
   o tamanho.
Se ainda der 500, a mensagem na tela agora diz exatamente por quê.

## Validação
- API (mock Neon): upload sem Blob → hospedagem "neon" + URL; GET da
  mídia devolve bytes idênticos com content-type; status → "neon".
- Front (JSDOM): erro real do save exposto; campos transitórios e \u0000
  removidos; save ok; barra grande renderiza.

## Arquivos
- api/media-upload.js · public/index.html
