# Atlantyx OS · v1.26.3 — Detecção de deploy desatualizado

## O diagnóstico do erro "action inválida"
O 400 aconteceu porque a action `email_diagnostico` (criada na v1.25.1)
não existe no `api/financeiro.js` que está no ar — ou seja, esse arquivo
não foi atualizado no Vercel. Conferi o pacote entregue: a action está lá
(linha 70) e a função também (linha 586). É deploy, não código.

## Para não perder tempo com isso de novo
- O backend agora tem uma **constante de versão** e, quando recebe uma
  action que não conhece, responde dizendo **qual versão está no ar** e
  que o arquivo precisa ser atualizado — em vez do genérico "action
  inválida"
- O frontend detecta esse caso específico e mostra:
  "⚠ O arquivo api/financeiro.js no servidor está DESATUALIZADO — a
  função X não existe nele (versão no ar: vY)"
- Nova action `versao` para checar rapidamente o que está publicado

## Arquivos
- api/financeiro.js · public/index.html
