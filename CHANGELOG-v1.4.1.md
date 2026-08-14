# Atlantyx OS · v1.4.1 — Diagnóstico Detalhado do Erro 500

**Data:** 12 de agosto de 2026
**Anterior:** v1.4 (que não resolveu o 500 completamente)

---

## O que mudou na v1.4.1

### s2-creative.js — Erro 500 agora fala o que aconteceu

Antes:
```
{ "error": "..." }   ← mensagem genérica sem contexto
```

Agora:
```json
{
  "error": "Claude API [401]: authentication_error (modelo: claude-sonnet-4-6)",
  "module": "s2-creative",
  "hint": "Erro da API Anthropic. Verifique se ANTHROPIC_API_KEY é válida e se o modelo CLAUDE_MODEL existe (atual: claude-sonnet-4-6)",
  "stack_preview": [
    "Error: Claude API [401]: authentication_error",
    "    at claude (/var/task/api/s2-creative.js:XX)",
    "    at agStoryteller (/var/task/api/s2-creative.js:YY)"
  ]
}
```

### 3 melhorias defensivas

1. **Preflight de envvar** — se `ANTHROPIC_API_KEY` não estiver no Vercel, retorna
   erro claro com instrução de correção, ao invés de 500 críptico

2. **Fetch defensivo** — separa erro de rede (Anthropic offline) do erro de
   resposta (rate limit, auth, modelo errado)

3. **Parse defensivo** — se a resposta da Anthropic não for JSON válido
   (raro mas acontece com timeout), captura os primeiros 200 chars da resposta
   crua no log

### Logs completos no Vercel Runtime Logs

Cada chamada agora loga:
```
[claude OK] claude-sonnet-4-6 em 342ms, 1247 chars
[s2-creative] campanha_completa OK em 8420ms
```

Ou em caso de erro:
```
[claude API error] { http_status: 401, error_type: 'authentication_error',
  error_msg: 'invalid x-api-key', model_used: 'claude-sonnet-4-6', response_ms: 187 }
```

---

## Como debugar após aplicar

1. Deploy v1.4.1
2. Tenta criar campanha
3. Se der 500, agora vai aparecer no log da UI E na resposta HTTP a
   mensagem exata (ex: "authentication_error", "not_found_error: modelo",
   "rate_limit_error", etc)
4. Me manda essa mensagem que aí eu resolvo com precisão cirúrgica
