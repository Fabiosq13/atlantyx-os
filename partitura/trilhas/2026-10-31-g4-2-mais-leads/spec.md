# G4 2 — mais leads (Esteira, avaliação da IA de 31/10/2026 16:53)
Trilha: T2 · BPM-ID: 2026-10-31-g4-2-mais-leads

## Contexto
Campanha local (São Paulo Expo, 2 km), objetivo Tráfego, R$ 30/dia: 5.137 impressões, 42 cliques (CTR 1,23%), 65 visitas, 0 começaram o formulário, 0 leads, 1 clique no WhatsApp.

## Diagnóstico (conferido no código e na página, celular 390 px)
- A página `public/captura.html` já tem 3 campos, formulário na primeira tela e botão de WhatsApp; a copy do anúncio já promete o Mapa de Oportunidades grátis (v3.337/v3.338). Nada a simplificar sem inventar requisito.
- Em campanha local, `api/metricool.js` otimizava sempre para LINK_CLICKS: o Meta entrega para quem clica sem querer no feed.

## Escopo (critérios de aceite)
1. Campanhas locais de tráfego novas otimizam para LANDING_PAGE_VIEWS (visita à página carregada); se o Meta recusar a meta, volta para LINK_CLICKS sem derrubar a criação.
2. Alcance, lista Apollo e Pixel/LEAD não mudam. Campanhas continuam criadas PAUSADAS.
3. Sem número inventado, sem dado de lead exposto.

## Fora do escopo — aplicar pela tela (Dashboard › Marketing digital › campanha)
Verba (manter R$ 30/dia, não aumentar), período (estender 3–5 dias), público (filtro de cargo), troca da meta de otimização da campanha JÁ criada.
