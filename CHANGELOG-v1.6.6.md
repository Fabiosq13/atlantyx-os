# Atlantyx OS · v1.6.6 — Imagem da peça sincroniza com a campanha

## O problema ("ao editar não abriu a imagem da campanha")
A URL da imagem foi colada no campo do LOOP DE REVISÃO da peça (kanban),
que só fazia preview — nunca salvava na peça nem na campanha. Ao clicar em
"✎ Editar Campanha", o editor abria sem imagem porque campanha.imagens
estava vazio no banco.

## Fixes
1. Colou a URL na peça → sincroniza AUTOMATICAMENTE:
   - peca.design = url (salvo no kanban/banco)
   - campanha.imagens ganha a URL (salva via save_campanha)
   - toast "Imagem vinculada à campanha ✓"
2. Fallback no abrir/editar: se campanha.imagens está vazio mas a peça
   vinculada tem URL de imagem, o editor ADOTA a imagem da peça (e salva)
3. O modal de publicação já pré-preenche com essa imagem (v1.6.5)

## ⚠ Aviso importante sobre URLs do Ideogram
A URL do print é "ephemeral" com exp= — EXPIRA em ~24h. O sistema agora
detecta e avisa (toast + log). Para publicações futuras: baixe a imagem e
use um link permanente (asset do Ideogram ou re-hospedagem própria).
Re-hospedagem automática fica como evolução futura.

## Validação (JSDOM)
URL colada na peça → campanha salva no banco com a imagem → abrir campanha
→ editor renderiza a imagem. 0 erros.
