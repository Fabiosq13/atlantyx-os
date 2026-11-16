# Spec — Floresta: IARA de voz (Retell) no caminho B da abordagem telefônica
ID: 2026-11-16-floresta-ligacao-voz · Trilha: T3 · Aprovado por: Fabio (16/11/2026: "ativar a IA e configurar o sistema para ela ligar de voz"; escolheu Retell + Twilio e testou o agente; enviou o Agent ID)

## Escopo
- Botão "Ligar agora com a IARA de voz" na ficha de cards do caminho B; só liga quando alguém clica.
- Regras: seg–sex 9h–21h e sáb 10h–14h (Brasília); nunca domingo; descadastro (disparo_optout); 3 tentativas; 1 ligação por lead a cada 20 h; limite diário (RETELL_MAX_DIA, padrão 15).
- Webhook da Retell (call_analyzed / call_ended) devolve o resultado, que vai para `ligacaoResultado` (destinos já aprovados na v3.463). Resumo e transcrição entram como nota no HubSpot.
- "Testar no meu celular": liga para um número informado, sem card.
- "Configuração": mostra o que falta nas variáveis, a URL do webhook e o campo/valores de resultado.

## Variáveis (só na Vercel): RETELL_API_KEY · RETELL_AGENT_ID · RETELL_FROM_NUMBER · RETELL_MAX_DIA (opcional)
## Na Retell: webhook do agente = URL mostrada em "Configuração"; extração pós-chamada com o campo `resultado` (reuniao, interessado, agora_nao, sem_interesse, nao_atendeu, numero_errado, nao_ligar) e opcionais `data_reuniao` e `email_confirmado`.

## Critérios de aceite
- [x] Só caminho B, só dentro do horário, nunca descadastrado nem acima do limite.
- [x] Resultado do webhook aplicado uma vez; sem resultado claro vai para revisão.
- [x] Webhook exige a chave da URL; sem RETELL_API_KEY recusa.
- [x] Testes sem chamada real e com dados sintéticos.
