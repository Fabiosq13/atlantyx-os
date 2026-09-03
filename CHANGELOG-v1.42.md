# Atlantyx OS · v1.42 — Métricas de redes sociais: 2 bugs + explicação dos zeros

## Bug 1 — LinkedIn e Facebook SEMPRE davam zero impressões
O código lia apenas o campo `impressions`. Só que cada rede nomeia
diferente: LinkedIn usa `impressionCount`, Facebook usa
`post_impressions`, Instagram usa `impressions`/`reach`. Quando o nome
não batia, o `?? 0` transformava em zero **silenciosamente**.

Por isso 22 publicações no LinkedIn apareciam com 0 impressões — o que é
impossível na prática.

Corrigido: agora procura em todos os nomes conhecidos de cada rede, e
também dentro de sub-objetos (`metrics`, `insights`, `statistics`).

## Bug 2 — Casamento de publicação exigia texto IDÊNTICO
Para associar a métrica à publicação, o código comparava os **60
primeiros caracteres exatos**. Qualquer emoji, quebra de linha, acento ou
link encurtado diferente fazia falhar — e a publicação ficava zerada.

Corrigido: casa primeiro pelo id do Metricool (quando a publicação saiu
pelo sistema) e, se não houver, por **similaridade de palavras + data**,
ignorando emoji, pontuação e links. Testado com texto contendo emoji,
link encurtado e acentos: casou corretamente.

Também troquei `||` por checagem de nulo — antes uma métrica legítima
igual a 0 era descartada como "valor falso".

## Explicação dos zeros na própria tela
**Impressões zeradas** agora ficam em dourado com ⚠ e um painel explica
as 4 causas prováveis: perfil não é Business/Creator, permissão de
estatísticas não concedida ao Metricool, publicação feita fora do
Metricool, ou métricas ainda não processadas pela rede.

**Cliques sem lead** (sua pergunta: "onde ele clicou?") — o painel
explica que clique leva ao site, mas só vira lead se a pessoa preencher
o formulário. E lista o que costuma quebrar no meio: link sem UTM (o
lead entra como "origem desconhecida"), formulário não integrado, página
de destino ruim. Com a ressalva honesta de que **1 a 3 leads em 100
cliques é a taxa normal** — com 5 cliques, zero lead é estatisticamente
esperado.

## Diagnóstico no backend
Se a API devolver publicações sem nenhuma métrica, a resposta agora traz
quais campos vieram de fato — útil para identificar rapidamente se é
permissão ou nome de campo novo.

## Arquivos
- api/metricool.js · public/index.html
