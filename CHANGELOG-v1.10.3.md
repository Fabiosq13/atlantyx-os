# Atlantyx OS · v1.10.3 — Mídia acessível de verdade + verificação antes de agendar

## Diagnóstico pelo print
Story agora sem texto e "Agendamento" habilitado ✓ (v1.10 funcionou),
mas a miniatura continua quebrada e "Sem imagem": o Metricool NÃO
conseguiu baixar a imagem da nossa URL. As causas prováveis:
1) a rota /media/ID.ext depende de rewrite no vercel.json — se ele não
   subiu, a URL devolve o index.html; 2) o Instagram Graph API aceita
   JPEG (PNG pode ser recusado).

## Fixes
- Nova rota de FUNÇÃO (não rewrite): api/media/[file].js →
  https://SEU-APP.vercel.app/api/media/ID.mp4 | .jpg — funciona só com o
  deploy da pasta api/, sem depender do vercel.json. URLs antigas
  (?m=ID e /media/ID.ext) são convertidas automaticamente.
- Stories compostos agora em JPEG (qualidade 0,92) em vez de PNG.
- VERIFICAÇÃO PÚBLICA antes de agendar (stories e reel): o Atlantyx faz um
  GET na própria URL que vai mandar ao Metricool e confere o Content-Type.
  Se vier HTML (rota não deployada), erro HTTP ou tipo errado → barra
  vermelha explicando e NÃO agenda (evita post quebrado no Metricool).
  Ao hospedar o reel, a barra verde mostra "verificado (video/mp4)".
- Botão "🔍 Testar hospedagem" no painel Reels: sobe uma imagem de teste
  e confere a URL pública em 2 s — diz se está tudo certo ou o que falta.

## Passos agora
1. Deploy com: api/media-upload.js, api/media/[file].js (pasta nova!),
   public/index.html (vercel.json/metricool.js da v1.10 se ainda não subiram)
2. Painel Reels → 🔍 Testar hospedagem → deve ficar verde
3. Stories: 🖼 Compor artes (JPEG) → 🚀 Agendar · Reel: ☁ Hospedar →
   🚀 Agendar. Excluir no Metricool os posts antigos com mídia quebrada.
Se o teste ficar vermelho, a mensagem diz exatamente o que faltou.

## Validação
API: upload → /api/media/ID.jpg; rota dinâmica serve 200 image/jpeg.
Front: sintaxe OK; verificador bloqueia agendamento quando a URL não
serve mídia.
