# Atlantyx OS · v1.9.4 — "Refazer Tudo" e "Ajustar Copy" funcionando na campanha

## O bug
Os dois botões do painel "Ajuste com IA" (aba Copy do editor de campanha)
eram código herdado do antigo Studio Criativo: chamavam a IA e escreviam
o resultado num elemento (`copyAtualTexto`) que NÃO existe nessa tela.
Resultado: log dizia "concluído", toast de sucesso, e a tela ficava
exatamente igual — headline/subheadline/corpo/CTA antigos.

## Fix (reescritos para operar sobre a campanha ativa)
- Refazer Tudo: Storyteller novo (com o comentário como direcionamento,
  ou "narrativa diferente da anterior") → Copywriter novo → aplica em:
  campos Narrativa (tema/gancho/promessa/CTA) + campos Copy do editor +
  campAtiva.data (narrativa e copy) + banco (save_campanha) + peça do
  Kanban vinculada. Abre a aba Copy ao terminar.
- Ajustar Copy: usa a copy atual dos campos + seu comentário como
  instrução, gera versão ajustada e aplica nos mesmos lugares.
- Em ambos, a versão anterior vai para VERSÕES (não se perde nada) e as
  versões por rede são zeradas (o Preview por Canal recalcula da copy nova).

## Validação (JSDOM)
Headline/corpo/narrativa trocados no editor · campAtiva atualizada ·
save_campanha com a copy nova · peça do kanban atualizada · versão
anterior guardada · Ajustar Copy aplica e limpa o comentário. 0 erros.
Só public/index.html mudou.
