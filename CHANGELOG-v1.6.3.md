# Atlantyx OS · v1.6.3 — Pipeline 2-3x mais rápido (respostas compactas)

## Diagnóstico fechado (mensagem real da v1.6.2)
"Anthropic não respondeu em 25s (modelo: claude-sonnet-4-6)"
→ modelo correto; a API está GERANDO devagar nesta conta/horário.
Com respostas de 2000-3000 tokens, cada chamada levava 25-35s → 2 calls
estouravam 60s (o "Task timed out after 60 seconds" dos logs).

## Fix: gerar MENOS tokens (a maior alavanca de latência)
Latência de LLM ∝ tokens de SAÍDA. Os agentes pediam JSONs enormes cheios
de campos que o frontend nem usa (checklists, adaptações, notas, jornada
do herói...). Cortados para o essencial que a UI consome:

| Agente | Antes | Agora | Campos preservados |
|---|---|---|---|
| Storyteller | 2000 tk, 12 campos | 900 tk, 9 campos curtos | tema_central, gancho, promessa, CTA... |
| Copywriter | 3000 tk, 3 versões+notas | 1400 tk, 2 versões enxutas | versoes[].headline/corpo/cta/hashtags |
| Designer | 3000 tk, 15 campos | 1100 tk, 5 campos | conceito_visual, prompt_ia_imagem, paleta, layout mínimo |
| Por-rede | 3000 tk | 1800 tk | igual (linkedin/instagram/facebook/whatsapp/email) |

Tempo esperado por chamada: 25-35s → 6-14s.
Fase 1 (2 calls): ~12-25s · Fase 2 (paralelo): ~8-15s. Folga ampla sob 60s
mesmo com API lenta — e sob o timeout de 25s por chamada.

## Qualidade
Copy corpo continua até 110 palavras (tamanho ideal de post). O que saiu
eram metadados decorativos, não conteúdo. Se quiser 3ª versão de copy ou
brief estendido, dá pra reativar por parâmetro depois.

## Arquivos
- api/s2-creative.js
- public/index.html (build id)
