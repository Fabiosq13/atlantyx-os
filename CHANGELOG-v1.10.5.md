# Atlantyx OS · v1.10.5 — A causa provável do "Sem imagem": Deployment Protection

## A pista decisiva (prints)
- No Atlantyx a prévia do Reel AGORA carrega (0:00/0:14) e o teste ficou
  verde → nosso servidor serve a mídia corretamente.
- No Metricool continua "Sem imagem"/spinner.
- A URL usada é https://project-q6pie-7aap1kexb-fabios-projects-....vercel.app/media/...
  → isso é uma URL de DEPLOYMENT do Vercel (nome + hash), não o domínio de
  produção. Essas URLs ficam atrás do "Deployment Protection" (padrão do
  Vercel): abrem para VOCÊ (logado no Vercel, com cookie) — por isso o
  teste no seu navegador passava — mas o Metricool/Instagram recebem uma
  página de login em vez da imagem/vídeo.

## Fixes
1. Base pública de produção: o servidor passa a montar as URLs de mídia
   com VERCEL_PROJECT_PRODUCTION_URL (variável automática do Vercel) ou
   com MEDIA_PUBLIC_BASE (se você definir). O frontend testa a base de
   produção ANTES da URL atual.
2. Verificação SERVER-SIDE: o teste/pré-agendamento agora pede ao próprio
   servidor para buscar a URL (sem cookies) — exatamente como o Metricool
   faz. Se cair na tela de login, aparece em vermelho "URL protegida pelo
   Deployment Protection..." com a instrução. Chega de verde falso.
3. "🔍 Testar hospedagem" mostra a base pública usada e alerta quando você
   está navegando por uma URL de deployment.

## O que VOCÊ precisa fazer (uma vez)
Opção A (recomendada): usar o domínio de produção do projeto.
  Vercel → Projeto → Settings → Domains: anote o domínio de produção (algo
  como atlantyx-os.vercel.app). Nas Environment Variables crie
  MEDIA_PUBLIC_BASE = https://atlantyx-os.vercel.app (Production e Preview)
  → Redeploy. E passe a acessar o Atlantyx por esse domínio.
Opção B: Vercel → Settings → Deployment Protection → desativar (ou
  "Only Preview" desmarcando URLs de produção) → as URLs de deployment
  ficam públicas.
Depois: 🔍 Testar hospedagem (verde, "verificada pelo servidor") →
recompor Stories / rehospedar Reel → agendar → excluir os antigos no
Metricool.

## Validação (JSDOM)
Base de produção configurada + deployment URL protegida → resolver escolhe
a URL de produção; verificação server-side reporta "Deployment
Protection". Arquivos: api/media-upload.js · public/index.html
