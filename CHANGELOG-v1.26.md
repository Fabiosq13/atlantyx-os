# Atlantyx OS · v1.26 — Escolher a página/marca de publicação (LinkedIn e demais redes)

## O problema
O sistema publicava sempre na marca fixa da variável METRICOOL_BLOG_ID.
Para postar em OUTRA página do LinkedIn era preciso trocar a variável de
ambiente e fazer redeploy — nada prático.

## Como funciona agora
Kanban de Aprovação → botão **🏢 Página de publicação**: lista todas as
marcas da sua conta Metricool (com as redes conectadas em cada uma) e
você escolhe em qual publicar. A escolha fica salva neste navegador e
passa a valer para **tudo**: posts, stories, reels, carrossel,
auto-campanha, reagendamento, exclusão e métricas.

O botão mostra a marca ativa, então você sempre vê onde está publicando.
Deixar a escolha vazia volta para o padrão do sistema.

## Detalhe técnico
Em vez de alterar as ~10 chamadas ao Metricool uma a uma (fácil esquecer
alguma e publicar na página errada), coloquei um **interceptor central**
que injeta a marca escolhida em toda requisição a /api/metricool —
inclusive nas que forem criadas no futuro. O backend aceita blog_id por
chamada, com a variável de ambiente como padrão.

## ⚠ Antes de usar: a página precisa existir no Metricool
O Metricool organiza perfis em "marcas". Para a outra página do LinkedIn
aparecer no seletor, ela precisa estar conectada lá:
- **No Metricool** → Adicionar marca (ou entrar na marca existente) →
  conectar o LinkedIn → escolher a **página da empresa** desejada
- Depois disso, ela aparece no seletor do Atlantyx automaticamente
Se a página não aparecer na lista, é porque ainda não foi conectada no
Metricool — o Atlantyx só enxerga o que existe lá.

## Nota sobre plano do Metricool
Marcas adicionais costumam consumir slot do seu plano. Se a nova página
não puder ser adicionada, é limite de plano, não do sistema.

## Validação
Sem marca escolhida → nenhum blog_id enviado (servidor usa o padrão).
Após escolher → blog_id correto injetado em publicar E excluir, marca
salva e exibida no botão.

## Arquivos
- api/metricool.js · public/index.html
