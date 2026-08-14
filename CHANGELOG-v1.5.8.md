# Atlantyx OS · v1.5.8 — Anti-perda do Kanban + Processamento preservado

## Bug 1 (GRAVE): campanhas de ontem sumiram do Kanban
**Causa raiz — race condition que sobrescrevia o banco:**
`salvarKanbanNoBanco()` gravava o array INTEIRO da memória por cima da chave.
Sequência fatal: F5 (memória vazia) → usuário vai direto em Nova Campanha sem
abrir o Kanban → cria → adicionarAoKanban salva [só a peça nova] →
SOBRESCREVE as peças anteriores no banco. Agravante: o fallback localStorage
no load só rodava em exceção de rede — resposta 200 com value null pulava o
cache local.

**Fixes:**
- `salvarKanbanNoBanco`: se ainda não houve load, faz GET + MERGE por id antes
  de gravar — nunca mais sobrescreve cegamente (flag `_kanbanCarregado`)
- `carregarKanbanDoBanco`: união banco + localStorage + memória por id;
  se o banco estava mais pobre que a união, re-grava consolidado
- Kanban carregado no BOOT da página (~1,2s), não só ao abrir a aba —
  elimina a janela do race
- **Botão "↻ Reconstruir peças das campanhas"** no topo do Kanban:
  as campanhas em si estão na tabela `campanhas` (nunca se perderam);
  o botão recria a peça de cada campanha sem peça correspondente
  (status Aprovado se campanha aprovada, senão Revisão)

## Bug 2: sair da tela durante a criação resetava para "nova campanha"
Durante o processamento, `campAtiva` ainda não existe (só é setada após a
resposta da API). Ao voltar, `resetCampanhaState()` achava a tela vazia e
restaurava a ÚLTIMA campanha salva por cima do form/pipeline em andamento.

**Fix:** flag `window._campanhaProcessando` (setada no início de
`criarCampanhaCompleta`, limpa no fim — sucesso OU erro). O reset agora dá
early-return com toast "Campanha X ainda em criação..." — como o DOM da SPA
persiste entre navegações, o pipeline e o botão "Criando..." continuam
exatamente onde estavam.

## Recuperação das peças que sumiram
Após o deploy: S2 → Kanban → "↻ Reconstruir peças das campanhas".
As peças voltam a partir das campanhas salvas no banco.

## Validação (JSDOM, cenário exato da perda)
- Banco com 2 peças de ontem + memória vazia + peça nova criada antes de
  qualquer load → banco final: 3 peças (antes do fix: 1)
- Reset durante processamento → form intacto
- 0 erros

## Arquivos alterados
- public/index.html
