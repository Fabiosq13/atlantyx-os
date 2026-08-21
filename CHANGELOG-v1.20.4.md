# Atlantyx OS · v1.20.4 — Carga manual de Notas Fiscais na etapa Emissão de NF

## O que foi pedido
Na etapa "Emissão de NF" do Kanban de Faturamento, carregar as notas
fiscais manualmente e controlar o valor que falta completar do termo a
partir do valor das notas carregadas.

## Novo: card "📎 Carregar Notas Fiscais desta emissão"
Aparece automaticamente ao abrir um termo que está na etapa Emissão de NF:
- Escolhe o arquivo (PDF ou XML) da nota fiscal
- **XML de NFe: número, valor e empresa são lidos e preenchidos
  sozinhos** (o sistema tenta casar o destinatário/emitente do XML com
  uma das empresas do rateio automaticamente — confira antes de
  confirmar)
- PDF: preencha número (opcional) e valor manualmente
- Vincula a uma empresa do rateio (dropdown só com as que ainda não têm
  nota) — sem vínculo, o arquivo fica só registrado, sem contar no total
- Botão "+ Adicionar" grava a nota e atualiza tudo na hora

## Barra de progresso do valor
Em toda etapa a partir da Elaboração, o detalhe do termo mostra:
"R$ X carregado de R$ Y do termo" com barra visual e "falta R$ Z" (ou
"✓ completo" quando bate). Atualiza a cada nota adicionada ou removida.

## Lista de notas com origem e arquivo
Cada nota mostra se veio de 📧 e-mail ou 📎 carga manual, o número/valor
(se houver) e um link "ver arquivo" para abrir o PDF/XML enviado. Notas
manuais podem ser removidas (🗑) — a empresa volta a "pendente" se não
houver outra nota vinculada a ela, e o total recalcula sozinho.

## Onde os arquivos ficam guardados
Reaproveita o mesmo endpoint já usado para hospedar mídia de campanhas
(api/media-upload.js, hospedagem no Neon) — nenhuma configuração nova
necessária.

## Backend
- Migração: termos_notas_encontradas ganha arquivo_url e origem
- Actions novas: termo_nf_upload, termo_nf_excluir (reaproveitam
  recalcularNf existente)

## Validação (JSDOM, fluxo completo)
XML de NFe simulado (nNF=7788, vNF=51458.90, dest="CPFL Paulista") →
número/valor preenchidos sozinhos, empresa casada automaticamente →
upload confirmado → barra de progresso atualizada (51.458,90 carregado,
falta 57.749,10 de um termo de 109.208,00) → nota aparece na lista com
link. Árvore DOM: 73 páginas, 0 aninhadas. 0 erros JS.

## Arquivos
- api/faturamento.js (migração + 2 actions)
- public/index.html (card de upload, parser XML, barra de progresso)
