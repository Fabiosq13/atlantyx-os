# Atlantyx OS · v1.4.5-DEBUG — Erro na Execução da Campanha

**Data:** 12 de agosto de 2026
**Anterior:** v1.4.4

---

## O problema

Após v1.4.4 os fluxos foram implementados, mas ao clicar em "Criar Campanha
com IA" o sistema ficou travado em "Criando..." — o erro genérico não
mostrava o que aconteceu.

## O que fiz nesta versão

Como não consegui reproduzir o erro em ambiente de testes (JSDOM roda tudo
sem exceção com dados simulados), preciso ver o erro REAL do seu browser.
Então esta versão é focada em **tornar erros invisíveis visíveis**.

### 6 melhorias defensivas

1. **Removida chamada duplicada de `adicionarAoKanban`**
   Estava sendo chamado 2x na `criarCampanhaCompleta` (linhas 7173 + 7197).
   A segunda vez sem `campanhaId`, criando peça órfã no kanban.

2. **Cada etapa pós-API em `try/catch` isolado**
   Se `adicionarAoKanban` falhar, não trava o `preencherEditor`. Se este
   falhar, não trava o resumo. Cada falha aparece no log com contexto.

3. **Erro completo visível na tela**
   Antes: `res.innerHTML = e.message` (uma linha vermelha).
   Agora: box vermelho com mensagem clara + stack trace em `<details>`
   expandível. Você abre no browser e vê a linha exata.

4. **`coletarEdicoesAtuais` protegido em `salvarCampanhaDB`**
   Se algum elemento HTML esperado não existir, salvava mesmo assim com
   estado atual — não trava.

5. **`aprovarCampanhaFinal` agora passa `campanhaId` para o kanban**
   Consistência com `criarCampanhaCompleta` (v1.4.4).

6. **HANDLER GLOBAL DE ERROS JAVASCRIPT**
   Adicionado `window.addEventListener('error')` e `'unhandledrejection'`
   que capturam TODO erro JS não tratado e mandam pro log da UI + console.
   Erros silenciosos que antes ficavam invisíveis agora aparecem.

## O que você precisa fazer

1. Aplicar esta versão (só `public/index.html`)
2. Tentar criar a campanha de novo
3. Se der erro, agora vai aparecer:
   - Uma **box vermelha na tela** com a mensagem exata + stack expandível
   - Log detalhado no painel de log ao lado
   - Erros JS globais capturados que antes ficavam mudos
4. Mandar print da box vermelha (expandido) OU do console F12

Com isso vou saber a linha e o motivo exatos do erro em vez de chutar.

---

## Validação técnica
17 funções críticas verificadas em JSDOM: todas ✓
Zero erros de sintaxe ou execução em ambiente simulado
