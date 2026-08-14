# Atlantyx OS · v1.4.3 — Fix: Conflito de nomes renderKanban

**Data:** 12 de agosto de 2026
**Anterior:** v1.4.2

---

## Bug corrigido

### Sintoma
Após v1.4.2 arrumar os menus, o Studio Criativo começou a rodar os
agentes (Storyteller, Copywriter, Designer, Banco) mas travava com:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'colunas')
    at renderKanban (index):13007
```

### Causa raiz
**Colisão de nomes** entre duas funções `renderKanban()` diferentes:

1. **Linha 3993** — `function renderKanban()` do S2 Kanban de Aprovação
   de Campanhas (versão original, sem argumento)

2. **Linha 13002** — `function renderKanban(d)` do S3 Kanban Financeiro
   de Marcos (versão criada em v1.3, espera `d.colunas`)

Em JavaScript, quando duas funções têm o mesmo nome no mesmo escopo,
a **segunda sobrescreve a primeira** silenciosamente. Toda vez que o
código do S2 chamava `renderKanban()` sem argumento (renderiza kanban
de campanhas ao aprovar/mover peça), ele acabava executando a versão
do S3 que espera `d.colunas` — e crashava.

Meu erro na v1.3 quando adicionei o módulo Projetos & Marcos: usei o
mesmo nome de função sem verificar se já existia.

### Fix
Renomeei minhas funções da v1.3 pra não colidir:
- `renderKanban(d)` → `renderKanbanMarcos(d)` (linha 13002)
- Chamada em `carregarKanbanMarcos()` também atualizada

Agora coexistem:
- `renderKanban()` — S2 Kanban de Campanhas (chamado 7 vezes)
- `renderKanbanMarcos()` — S3 Kanban Financeiro (chamado 1 vez)

### Como validei
Rodei em JSDOM (simulador de browser Node) com o HTML completo:
```
nav: function                    ✓
renderKanban (S2): function      ✓
renderKanbanMarcos (S3): function ✓
carregarKanbanMarcos: function   ✓
erros: 0
```
