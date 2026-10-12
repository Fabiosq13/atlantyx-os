# Spec — Atlantyx TV (canal estilo Bloomberg) e Webinars ao vivo
ID: 2026-10-11-atlantyx-tv-webinars · Trilha: T2 · Aprovada por: Fabio (pedido direto, 2026-10-11)

## Escopo
- Atlantyx TV: playlist circular (reações, entrevistas, vídeos de produto: envio próprio, link, YouTube, reações do S2) intercalada com vinheta de 25 s ("a seguir"), cotações (dólar, euro, bitcoin, Ibovespa, ações), últimas notícias escritas pela IA com fonte citada e cartões de produto; barras laterais e de base (mercados, a seguir, produtos, serviços, faixa). Link com código revogável para a TV do escritório.
- Transmissão da Atlantyx TV no YouTube (Web Egress do LiveKit), manual ou em janela de horário.
- Webinars: sala privada (link), convidados (entrevista pelo navegador), estúdio (câmera, microfone, tela, faixa), transmissão simultânea YouTube · LinkedIn · Instagram com o layout Atlantyx TV.

## Fora de escopo
- Gravação/arquivamento do webinar no sistema (o YouTube guarda a live). Retransmitir vídeos de terceiros.

## Critérios de aceite
1. Playlist circular toca vídeos enviados em partes, links e YouTube, com vinheta e intercalação configurável.
2. Cotações e notícias atualizam sozinhas (5 min / 1 h) e aparecem nas barras.
3. Chaves de transmissão cifradas, nunca devolvidas à tela.
4. Webinar: tokens com permissões corretas (host publica, audiência só assiste, convidado publica); transmitir só com destino configurado; encerrar invalida os links.
5. Nada vai ao ar sem clique do usuário (ou janela automática que ele ligou).
