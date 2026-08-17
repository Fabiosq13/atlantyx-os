# Atlantyx OS · v1.6.7 — Recuperação de campanhas órfãs

## O erro ("Campanha camp_XXX não encontrada no banco")
A campanha das 14:31 foi criada durante a janela dos erros 504/500: o
save_campanha falhou silenciosamente → ficou só no localStorage. Agravante
descoberto: carregarCampanhasDB SOBRESCREVIA o localStorage com a lista do
banco, destruindo as locais órfãs (mesma race do kanban, outro lugar).

## Fixes (3 camadas)
1. carregarCampanhasDB: MERGE banco+localStorage por id — órfãs nunca são
   descartadas e são re-enviadas ao banco automaticamente (até 5/vez)
2. abrirCampanhaDB: se o banco não tem, busca no cache local e re-salva
3. ÚLTIMO RECURSO — reconstrução pela peça: se a campanha sumiu de tudo,
   o botão ✎ oferece reconstruir a partir do conteúdo da própria peça
   (narrativa, copy, imagem, status) com o MESMO id, salva no banco e abre
   para edição normalmente

## Teste do cenário exato do usuário (JSDOM)
Peça órfã (camp inexistente) → ✎ Editar → confirm → campanha reconstruída
com copy/imagem preservadas, salva no banco, tela de edição aberta. 0 erros.

## Arquivos
- public/index.html
