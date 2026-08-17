# Atlantyx OS · v1.7 — Calendário de Publicações + Auto-campanha IA

## 1. 📅 Calendário no Kanban (rodapé)
Grade dos próximos 14 dias (hoje destacado) com TODAS as publicações nos
seus horários: hora, título, rede (cor própria), modo (🚀 auto / ✋ manual).

### Exclusão sincronizada
Botão 🗑 em cada item: além de remover do Atlantyx, EXCLUI O POST AGENDADO
NO METRICOOL (nova action `excluir` → DELETE /v2/scheduler/posts/{id}).
Publicações agora registram `agendado_para` (data real do agendamento).

## 2. 🤖 Auto-campanha IA (botão no topo do Kanban)
Pipeline 100% automático de 3 publicações otimizadas para conversão:

1. COLETA métricas reais do Metricool (30 dias, 3 redes): score por
   slot rede|dia|hora = cliques×3 + engajamento; top posts por cliques
2. PLANEJA com IA (action `campanha_auto`): 3 posts com copy pronta
   (max 110 palavras, CTA de reunião), dia/hora ideais — métricas da
   conta têm prioridade; sem dados, usa benchmarks B2B (ter-qui manhã,
   evita seg cedo/sex tarde) — cada post com justificativa do slot
3. GERA a imagem de cada post no Ideogram (via /api/image-gen do repo)
4. AGENDA no Metricool nas 3 redes no horário calculado (próxima
   ocorrência do dia sugerido), com imagem + encurtador; IG só com imagem
5. CRIA as peças no kanban (status Agendado, agente 🤖 Auto-IA) e
   registra tudo no calendário e no Desempenho

Sem Metricool configurado: cria as 3 peças como Aprovado p/ publicação
manual. Falha de imagem não bloqueia (publica sem, pulando IG).

## 3. Fix de robustez
Status do Metricool era cacheado — uma falha transitória no load grudava
"false" e publicações passavam a ignorar o Metricool. Pontos críticos
agora re-verificam com force.

## ⚠ Arquivo fora do pacote (IMPORTANTE)
`api/image-gen.js` (Ideogram) existe APENAS no seu repositório — não vem
nos meus pacotes. NUNCA substitua a pasta api/ inteira; sempre mescle.

## Validação (JSDOM, fluxo completo)
3 posts agendados c/ imagem nas 3 redes · datas futuras corretas ·
calendário com 9 itens · exclusão chamando DELETE no Metricool. 0 erros.

## Arquivos
- api/metricool.js (action excluir)
- api/s2-creative.js (action campanha_auto)
- public/index.html (calendário, auto-campanha, agendado_para, force check)
