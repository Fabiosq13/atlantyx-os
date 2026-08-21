# Atlantyx OS · v1.15.2 — reCAPTCHA (exigência da Intuit)

## O bloqueio
Compliance da Intuit: "Seu aplicativo deve incluir um sistema reCAPTCHA
para ajudar a detectar e prevenir transações fraudulentas." O Atlantyx
não tinha tela de login — não havia onde a Intuit visse essa barreira.

## Fix: reCAPTCHA v3 (invisível) no botão "Conectar QuickBooks"
Colocado exatamente no ponto que toca dados financeiros — não exige criar
um sistema de login inteiro. Fluxo:
1. Clique em "QuickBooks" na sidebar → antes de abrir o OAuth, o
   Atlantyx roda o reCAPTCHA v3 (sem checkbox, invisível ao usuário)
2. O token vai ao backend (`recaptcha_verificar`), que confirma com o
   Google (siteverify) — só o backend tem a SECRET_KEY
3. Score < 0,4 (provável bot) → bloqueia com aviso; score ok → prossegue
   normalmente para o popup de autorização da Intuit
Se o reCAPTCHA não estiver configurado, o fluxo antigo continua (não
quebra nada enquanto você configura as chaves).

## Setup necessário (uma vez)
1. https://www.google.com/recaptcha/admin/create → tipo **reCAPTCHA v3**
   → domínio: atlantyx-os.vercel.app (e o domínio de deployment, se usar)
2. Copiar a **Site key** (pública) e a **Secret key** (privada)
3. Vercel → Environment Variables:
   RECAPTCHA_SITE_KEY = (site key)
   RECAPTCHA_SECRET_KEY = (secret key)
4. Redeploy
5. No formulário de compliance da Intuit, marcar que o app usa reCAPTCHA
   (v3, Google) no fluxo de autenticação/conexão com dados financeiros

## Validação (JSDOM)
Site key obtida via API no boot → grecaptcha.execute chamado antes do
OAuth → token enviado e verificado. 0 erros.
Arquivos: api/financeiro.js · public/index.html
