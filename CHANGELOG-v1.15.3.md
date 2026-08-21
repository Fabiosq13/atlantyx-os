# Atlantyx OS · v1.15.3 — reCAPTCHA removido (resolvido de outra forma no lado da Intuit)

Reverte integralmente a v1.15.2: removidas as actions `recaptcha_verificar`
e `recaptcha_config` do backend, e o carregamento/gate do reCAPTCHA v3 no
fluxo "Conectar QuickBooks" do frontend. "Conectar QuickBooks" volta a ir
direto para o OAuth, sem passo intermediário.

Tudo o que veio antes (v1.12–v1.15.1: tokens QB no banco, OAuth próprio,
diagnóstico, faxina financeiro, dashboard, gerente IA, agenda com Bills)
permanece intacto.

Validação: conectarQuickBooks chama qb_auth_url direto, sem chamada de
reCAPTCHA. 0 ocorrências de "recaptcha" no arquivo.
Arquivos: api/financeiro.js · public/index.html
