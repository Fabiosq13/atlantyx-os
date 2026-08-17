# Atlantyx OS · v1.6.4 — Kanban: data/hora, edição completa e exclusão

## 1. Data e hora em cada card
Todo card do kanban (todas as colunas) mostra "🕓 dd/mm/aaaa, hh:mm:ss" da
geração da peça. O título do painel de detalhes também exibe a data.

## 2. Abrir a campanha completa para edição — agora de 2 jeitos
- Botão "✎ Editar" DIRETO no card (não precisa mais abrir o detalhe antes):
  carrega a campanha completa e leva ao formulário com tudo preenchido +
  botão Re-rodar
- Peças ANTIGAS sem vínculo com campanha (pré-v1.4.4): o sistema resolve
  pelo TÍTULO na lista de campanhas, religa o vínculo (salvo no banco) e
  abre normalmente. Se não achar, orienta usar "↻ Reconstruir peças"
- Painel de detalhes (clique no card): agora ROLA até ele com destaque azul
  — antes abria fora da viewport e parecia que "não abria"

## 3. Excluir campanha gerada
Botão 🗑 em todo card, com exclusão em 2 níveis:
- 1º confirm: exclui a PEÇA do kanban (salva no banco)
- 2º confirm (se a peça tem campanha vinculada): exclui TAMBÉM a campanha
  do banco de dados — ou mantém em Minhas Campanhas se cancelar

## Validação (JSDOM)
Card com 🕓/✎/🗑 renderizando; peça antiga sem vínculo resolvida por título
e navegando para edição; exclusão executando sem erros. 0 erros.

## Arquivos
- public/index.html
