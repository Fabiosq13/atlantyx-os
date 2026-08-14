# Atlantyx OS · v1.5.1 — Pós-criação visível + fix Design vazio

## Problemas resolvidos (relatados no teste da v1.5)

### 1. "Criou mas não avisou nada e não apresentou a segunda tela"
O editor abria, mas fora da área visível — o usuário ficava olhando o
formulário sem saber que deu certo.

**Fixes:**
- Toast de sucesso mais explícito com o nome da campanha
- **Auto-scroll suave até o editor** 400ms após concluir, com destaque
  visual (borda verde por 2s)
- Card de resumo agora tem **3 botões de próximo passo:**
  - 🎨 Gerar Imagens da Campanha (abre a aba Imagem direto)
  - 📝 Revisar no Editor (rola até o editor)
  - ■ Ver no Kanban

### 2. "Não gerou a imagem automaticamente nem deu opção"
A geração de imagem sempre existiu na aba Imagem do editor, mas escondida.

**Fix:** botão primário "🎨 Gerar Imagens da Campanha" no card de sucesso
leva direto à aba Imagem com toast explicando o próximo clique
(Gerar no Ideogram). Não gera automático de propósito: custa créditos
Ideogram e o usuário deve revisar o brief antes.

### 3. Log mostrou "Design: brief=0 chars" — bug real no backend
O agente Designer pede um JSON enorme (layout completo, adaptações,
checklist) em apenas 2000 tokens. A resposta truncava no meio, o JSON
ficava inválido e o parseJSON caía no fallback {raw} — deixando
prompt_ia_imagem e conceito_visual vazios. Por isso o brief=0.

**Fixes (api/s2-creative.js):**
- max_tokens do Designer: 2000 → 3000
- Se ainda vier truncado: usa o raw como conceito_visual e um prompt
  Ideogram padrão de fallback — brief nunca mais fica 0

## Arquivos alterados
- api/s2-creative.js (Designer: tokens + fallback)
- public/index.html (pós-criação com scroll + botões de ação)
