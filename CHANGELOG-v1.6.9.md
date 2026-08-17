# Atlantyx OS · v1.6.9 — CTA no link + encurtador + regra Instagram

## Contexto (expectativa vs realidade das redes)
Posts orgânicos NÃO suportam "clique aqui" com hyperlink/âncora — não
existe HTML em post. LinkedIn/Facebook auto-linkificam URLs cruas;
Instagram não linkifica NADA na caption. O que dá pra fazer é o que
todo social media faz: CTA textual + link curto (+ "link na bio" no IG).

## Novidades no modal de publicação
1. Campo "TEXTO DO CTA" (default: "👉 Agende uma conversa:") — entra
   antes do link em vez do link solto no texto
2. Checkbox "Encurtar link via Metricool" (default LIGADO) — o shortener
   do Metricool troca a URL gigante (uuid+UTMs, 5 linhas) por link curto
   rastreável. Backend: shortener era false fixo; agora configurável
3. Instagram: o post vai com "🔗 Link na bio" no lugar da URL (caption não
   clica) + toast lembrando de manter o link da campanha na bio do perfil

## Aplicação por modo
- Metricool: texto único com CTA + link (encurtado); IG puro → Link na bio
- Manual: cada rede monta seu texto — LinkedIn/FB com CTA + link UTM da
  própria rede; IG com Link na bio

## Resultado visual do post
Antes:  ...texto...
        https://meetings.hubspot.com/atlantyx?uuid=eca883eb...(5 linhas)
Depois: ...texto...
        👉 Agende uma conversa:
        https://mtr.cool/abc123   ← clicável no LinkedIn/FB
