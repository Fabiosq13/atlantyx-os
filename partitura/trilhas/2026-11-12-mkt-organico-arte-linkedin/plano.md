# Plano · Marketing orgânico: LinkedIn pessoal + arte padrão (T2)

- [x] Espelho no LinkedIn pessoal (api/metricool.js `_espelharPessoal`, ações linkedin_pessoal_obter/salvar, botão na tela)
- [x] Arte no padrão do anúncio pago no servidor (lib/arte-padrao.js, api/media.js `arte_padrao`, Montserrat em api/fonts)
- [x] Autocampanha (fila), Campanha Automática e imagem do post usam a arte padrão (`arte_post`), foto como reserva

## Interseções
- Nenhuma (vercel.json já inclui api/fonts/** para api/media.js)

## Registro da Batida
- 2026-11-12 · feito (v3.483) · bloqueio: fundador criar a 2ª marca no Metricool com o perfil pessoal · próximo: conferir as primeiras artes no ar
- [x] v3.486: artes orgânicas com 7 composições e 4 paletas (lib/arte-organica.js), faixa da oferta + QR code para a página de captura da oferta da campanha (campo "Oferta da campanha"); mix 4 conteúdo × 1 oferta com "Comente QUERO"; texto em 1ª pessoa no LinkedIn pessoal; Post em vídeo em 1ª pessoa (public/video-post.js: gravar com teleprompter ou enviar, faixa da oferta + QR na parte final, publica LinkedIn/Facebook/Reel)
- 2026-11-12 · feito (v3.486) · Interseção T1: dependência "qrcode" no package.json · próximo: fundador testar o vídeo no Chrome
