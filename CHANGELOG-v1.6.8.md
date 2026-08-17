# Atlantyx OS · v1.6.8 — Imagem no Metricool: 2 causas corrigidas

## Sintoma: "continua indo sem imagem, mas ao editar a imagem aparece"
A imagem EXISTE na campanha (o editor mostra) — mas a publicação saía sem.

## Causa 1 (frontend): lista desatualizada
publicarPeca buscava a campanha PRIMEIRO em _todasCampanhas — carregada
antes de a imagem ser gerada → versão sem imagens[] → modal vazio.
Fix: prioriza campAtiva (versão fresca); se ainda sem imagem, recarrega a
lista do banco. Logs novos: "[Pub] Imagem da campanha localizada: ..." ou
aviso claro quando não há.

## Causa 2 (backend): nome do campo da API
Enviávamos "medias" — a API do Metricool pode esperar "media" (sem s) e
ignorar silenciosamente o campo desconhecido → post sem mídia MESMO com o
frontend enviando. Fix: envia AMBOS media e medias (o campo errado é
ignorado, o certo é aplicado) + log do payload nos logs do Vercel:
"[metricool publicar] payload: {... temImagem: true, imagem: https://...}"

## Passos após o deploy
1. EXCLUIR o post pendente antigo no Metricool (foi criado sem imagem)
2. Republicar pelo Atlantyx: o modal deve abrir com a imagem no preview
3. Conferir no Planner do Metricool se a mídia apareceu no post
4. Se ainda faltar: Vercel → Logs → linha "[metricool publicar] payload"
   diz se a imagem saiu daqui (aí é formato da API — me mande o log)

## Lembrete
URL "ephemeral" do Ideogram expira ~24h — publique/agende enquanto válida,
ou use link permanente.
