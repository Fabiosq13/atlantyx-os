# Atlantyx OS · v1.6.1 — Timeout por chamada + diagnóstico de velocidade da IA

## O dado novo (logs do Vercel)
"Task timed out after 60 seconds" — ou seja: o maxDuration 60 ESTÁ aplicado,
e mesmo a Fase 1 (2 chamadas de IA, esperado ~8-15s) estourou 60s inteiros.
Conclusão: uma chamada à Anthropic está PENDURANDO (conexão sem resposta)
ou o modelo configurado em CLAUDE_MODEL é pesado/lento demais.

## Fixes

### 1. Timeout de 25s por chamada (AbortController)
O helper claude() não tinha timeout próprio — uma conexão pendurada segurava
a função até o Vercel matá-la (504 mudo). Agora: aborta em 25s com mensagem
clara identificando o modelo. Pior caso da Fase 1: 2×25s=50s < 60s → o erro
chega COM EXPLICAÇÃO em vez de 504.

### 2. Log de duração por chamada
"[claude ok] 8231ms · model=..." em cada call — os logs do Vercel passam a
mostrar exatamente quanto cada agente demora e qual modelo está em uso.

### 3. Action diagnostico_ia
Mede a velocidade real da API na sua conta com uma chamada mínima.
Uso (console F12 do Atlantyx):

fetch('/api/s2-creative',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({action:'diagnostico_ia'})}).then(r=>r.json()).then(console.log)

Retorna: { modelo, envvar_CLAUDE_MODEL, tempo_ms }
- tempo_ms < 3000 → API saudável; o problema era conexão pendurada (o
  timeout de 25s resolve dando erro claro + retry manual)
- tempo_ms > 10000 → modelo lento/conta degradada → verificar CLAUDE_MODEL
  (recomendado: claude-sonnet-4-6 ou deixar vazia)

## Arquivos
- api/s2-creative.js
- public/index.html (build id)
