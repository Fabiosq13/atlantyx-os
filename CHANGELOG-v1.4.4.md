# Atlantyx OS · v1.4.4 — Fluxo de Campanhas: Persistência + Edição + Re-rodar

**Data:** 12 de agosto de 2026
**Anterior:** v1.4.3

---

## Bugs corrigidos no fluxo de campanhas

### Bug 1 — Kanban não persistia no banco
`kanbanPecas` era só array em memória. Ao dar F5, perdia tudo.

**Fix:** `adicionarAoKanban()` agora chama `salvarKanbanNoBanco()` que persiste em
`atx:kanban:pecas` no Neon + fallback localStorage.

### Bug 2 — Kanban não recarregava do banco ao abrir a página
Nada carregava as peças salvas ao entrar na tela de Kanban.

**Fix:** `nav('s2kanban')` agora dispara `carregarKanbanDoBanco()`.

### Bug 3 — Voltar na tela apagava a campanha ativa
`resetCampanhaState()` era chamada a cada `nav('s2campanha')` e limpava tudo.
Se você saía da tela e voltava, perdia a campanha que estava editando.

**Fix:** `resetCampanhaState()` agora verifica se já tem campanha ativa em memória
e RESTAURA. Se não tem em memória, tenta buscar a última do banco.

### Bug 4 — Formulário não preenchia com a última campanha
Ao abrir a tela pela primeira vez, formulário vazio mesmo com dezenas de campanhas
no banco.

**Fix:** nova função `restaurarUltimaCampanha()` busca a mais recente
(ordena por `atualizado_em desc`) e chama `restaurarFormularioCampanha()`
que preenche todos os inputs + editor + imagens.

### Bug 5 — Card do Kanban não abria a campanha para editar
Ao clicar num card, abria só um painel de detalhes read-only. Não tinha
como ir direto pra editar a campanha e re-rodar os agentes.

**Fix:** cada peça agora armazena `campanhaId`. O painel de detalhes tem
botão `✎ Editar Campanha & Re-rodar` que carrega a campanha do banco e
leva o usuário à aba Nova Campanha com tudo preenchido.

### Bug 6 — Não existia função de "re-rodar após edição"
Se você editava os campos (nome, contexto, público) da campanha, não tinha
botão para regenerar os textos/design com base nas novas informações.

**Fix:** botão `↻ Re-rodar com IA` aparece automaticamente sempre que uma
campanha existente é aberta. Ele:
- Preserva o `id` original (não duplica)
- Preserva as imagens já geradas
- Regenera narrativa + copy + design com os campos atualizados
- Salva no banco após concluir

### Bug 7 — Peça sem link para a campanha origem
Não tinha como saber qual campanha gerou qual peça.

**Fix:** `adicionarAoKanban()` agora recebe `campanhaId` como 7º parâmetro.
A chamada em `criarCampanhaComIA()` foi atualizada para passar `campAtiva.id`.

### Novo botão — Limpar formulário para nova campanha
Antes o formulário sempre restaurava a última campanha. Agora tem botão
explícito `✕ Limpar (nova do zero)` que zera tudo sem apagar do banco.

---

## Como fica o fluxo agora

### Criar campanha nova
1. S2 → Nova Campanha
2. Preencher form → **Criar Campanha com IA**
3. Agentes rodam → salva no banco → aparece no Kanban com link para editar

### Voltar depois
1. Sai da tela, vai em outra aba
2. Volta em S2 → Nova Campanha
3. **Formulário aparece preenchido com a última campanha**
4. Editor mostra os textos e design da última
5. Botão `↻ Re-rodar com IA` disponível

### Editar via Kanban
1. S2 → Kanban de Aprovação
2. Clica num card
3. Painel abre com detalhes
4. Botão `✎ Editar Campanha & Re-rodar` leva para o form com tudo carregado
5. Edita → `↻ Re-rodar` gera nova versão (mesmo id, imagens preservadas)

### Começar do zero
1. Botão `✕ Limpar (nova do zero)` no topo da lista de campanhas
2. Confirma → form limpa → cria nova

---

## Validação
Rodei em JSDOM (simulador de browser) com o HTML completo:
- 15 funções críticas verificadas: todas ✓
- 0 erros de JavaScript
