# Atlantyx OS · v1.9.8 — Brief visual acompanha o tema + erro 500 na raiz

## 1. Mudar o tema da campanha não mudava o briefing das imagens
Causa: o Designer (brief/prompt do Ideogram) só rodava na criação. Refazer
Tudo trocava narrativa e copy, mas o brief ficava o antigo — e o Ideogram
gerava imagem do tema velho.
Fixes:
- Refazer Tudo agora roda também o Designer com a copy nova → o campo
  BRIEF VISUAL (aba Imagem) muda junto e é salvo na campanha
- Novo botão na aba Imagem: "🎨 Regerar brief com o tema atual" — usa o
  tema/copy que estão NA TELA (edições manuais contam) e refaz o prompt
- Ao editar Tema/Gancho/Headline/Corpo, o botão fica dourado avisando
  "tema/copy mudaram" (regere antes de Gerar no Ideogram)
- Backend: o Designer recebe explicitamente o TEMA CENTRAL e é obrigado a
  refletir o tema na cena
- Ao trocar de campanha o brief antigo é limpo (não "vaza" para a outra)

## 2. Erro 500 ao salvar campanha editada — causa raiz encontrada
Postgres JSONB rejeita duas coisas que apareciam no JSON da campanha:
- \u0000 e, principalmente, "surrogates soltos": um emoji cortado ao meio
  por .substring() (ex.: fallback do Copywriter quando o JSON da IA
  vinha truncado: copy.raw.substring(0,1500)) → JSON.stringify gera
  "\ud83d" solto → o banco responde 500 "Unicode ... surrogate".
Fixes em 3 camadas:
- Backend db.js: TODO JSON (campanhas e kv/kanban) passa por jsonSeguro()
  (toWellFormed + remoção de \u0000) antes do INSERT; datas inválidas
  viram null em vez de quebrar; payload >6 MB responde 413 com o tamanho
- Backend s2-creative.js: cortes de texto usam safeCut() (não parte emoji)
- Frontend: o saneador de save também remove surrogates soltos
Se ainda aparecer 500, a mensagem exata do banco vem no toast/Log.

## Validação (JSDOM)
Refazer Tudo → brief muda e Designer recebe o tema novo · editar tema à
mão + Regerar brief → brief novo salvo · surrogate solto removido no save.
Backend: jsonSeguro produz JSON bem formado a partir de emoji partido.
Arquivos: api/db.js · api/s2-creative.js · public/index.html
