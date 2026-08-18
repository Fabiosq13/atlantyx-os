# Atlantyx OS · v1.9.7 — Auto-campanha COMPLETA + salvar edições + reabrir sem refazer

## 1. Editar a campanha (contexto, nome, redes, datas...) agora GRAVA
Antes só a IA gravava — mudar o contexto e sair perdia tudo. Agora:
- Botão "💾 Salvar" ao lado de "Criar Campanha com IA": grava nome,
  objetivo, canal, público, orçamento, contexto, datas e redes na
  campanha aberta (sem re-rodar a IA)
- Auto-save: qualquer alteração nesses campos é gravada 1,5 s depois
  (Log: "[Campanha] Edições salvas"); o card do Kanban acompanha o nome

## 2. Reabrir campanha com Reel/Stories prontos NÃO pede para refazer
- Reel com vídeo hospedado: prévia + ⬇ Baixar aparecem, barra verde
  "Vídeo já montado e hospedado — clique em 🚀 Agendar" (ou "já agendado
  para ..."). Montar de novo é opcional.
- Stories com texto gravado: barra verde "Stories prontos — 🚀 Agendar".
  (v1.9.6 corrigiu o 500 que impedia gravar isso no banco.)

## 3. 🤖 Auto-campanha COMPLETA (posts + stories + reel)
Fluxo novo (com barras de status visíveis, ~4-6 min, aba aberta):
1. Métricas do Metricool → plano de 3 posts (como antes)
2. Cria uma CAMPANHA de verdade ("Auto-campanha dd/mm hh:mm") com
   narrativa e copy — aparece em Minhas Campanhas; as 3 peças do Kanban
   ficam vinculadas a ela (✎ Editar abre a campanha)
3. 3 posts com imagem, agendados nos slots ideais, com CTA + link de
   reunião (UTM)
4. Abre a campanha no editor e roda: STORIES (roteiro → 3 artes → texto
   gravado nas artes → agendados no dia do 1º post às 18h)
5. REEL (roteiro → artes → vídeo montado no navegador → hospedado no
   Neon → agendado no dia seguinte ao 1º post, 12h)
6. Volta ao Kanban e mostra o resumo (posts / stories / reel)
Ao clicar no botão, você escolhe: completa (OK) ou só os 3 posts (Cancelar).
Sem Metricool: cria tudo (artes, vídeo) para publicação manual.

## Validação (JSDOM c/ stubs de canvas/gravação)
Auto-campanha completa: campanha criada, 3 peças vinculadas, 3 stories
compostos e agendados, reel hospedado e agendado, 3 posts agendados,
saves da campanha; edição do contexto salva no banco. 0 erros.
Só public/index.html mudou.
