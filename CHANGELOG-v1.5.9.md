# Atlantyx OS · v1.5.9 — Fix 504 (timeout) na criação de campanha

## O erro
`s2-creative: 504 Gateway Timeout` — a função foi CORTADA pelo Vercel por
tempo. Não é bug de código: o pipeline v1.5.7 tem 4 chamadas de IA e o
limite default da função é ~10s. O vercel.json da v1.5.7 já trazia
"maxDuration": 60, mas se ele não foi commitado/deployado, o corte em 10s
continua → 504 garantido.

## Correções

### 1. Pipeline ~30% mais rápido (paralelização real)
Descoberta: agSocialPost não chama IA (montagem local). E Designer +
Copy-por-rede dependem APENAS do copy. Novo fluxo:

  ANTES (sequencial):  Story → Copy → Designer → Post → PorRede   (4 calls em fila)
  AGORA:               Story → Copy → [Designer ‖ PorRede] → Post (3 níveis)

Tempo estimado: de ~20-35s para ~14-24s. Com maxDuration 60, folga ampla.

### 2. Mensagem específica para 504
Antes: "Servidor: 504" (críptico). Agora o erro na tela explica: é timeout,
confirme o vercel.json com maxDuration no deploy, e como verificar.

## CHECKLIST DE DEPLOY (essencial!)
O 504 só some se o vercel.json SUBIR. Commit dos 3 arquivos:

    git add api/s2-creative.js public/index.html vercel.json
    git commit -m "fix(v1.5.9): pipeline paralelo + maxDuration + hint 504"
    git push

Verificação pós-deploy:
1. Vercel → Deployments → último deploy → aba "Source" → vercel.json presente
2. Console F12: [ATLANTYX v1.5.9]
3. Criar campanha → deve concluir em ~15-25s sem 504

## Arquivos alterados
- api/s2-creative.js (paralelização Designer ‖ PorRede)
- public/index.html (hint 504)
- vercel.json (inalterado desde v1.5.7 — mas PRECISA estar no deploy)
