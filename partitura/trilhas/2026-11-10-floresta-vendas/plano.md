# Plano — Floresta de Vendas
BPM-Trilha: T3 · BPM-ID: 2026-11-10-floresta-vendas
Pedido do fundador (10/11/2026): visão de floresta com todos os contatos e negócios do HubSpot num kanban moderno, jornada do contato frio ao cliente com etapas lógicas, tempo limite por etapa, IA decidindo (avançar / congelar / desistir) e disparando ações com aprovação do fundador; insights e ideias.
- [x] lib/floresta.js: jornada (frio→abordado→engajado→qualificado→reunião→proposta→negociação→cliente + congelado/perdido), SLA, temperatura, estatísticas, IA de decisão, fila de aprovação, executor (HubSpot, To-do, congelar)
- [x] api/vendas: floresta, floresta_ia, floresta_decidir, floresta_mover, floresta_cfg; cron ?cron=floresta (dias úteis 8h13 BRT) só enche a fila
- [x] public/floresta-ui.js + página s7floresta: Kanban (arrastar = mover no HubSpot), Floresta (clareiras), Lista; painel Decisões / Insights / Histórico
## Interseções
- T1: cron novo em vercel.json (/api/vendas?cron=floresta).
- T2: escreve no HubSpot (dealstage, lifecyclestage, hs_lead_status, criação de negócio) só após aprovação ou arraste do fundador.
## Registro da Batida
- 2026-11-10 · v3.440 · ✅ entregue · próximo: Fabio rodar a 1ª leitura da IA e ajustar os tempos limite.
- [x] v3.441: etapa "🤖 Abordagem IARA (SDR)"; marcar cards (ou coluna) → IARA escreve a 1ª mensagem → fundador revisa e aprova → envio pelo WhatsApp (Z-API) com descadastro e sem repetir em 7 dias, status ATTEMPTED_TO_CONTACT e nota no HubSpot; IA de decisão pode propor "abordar_iara"
- [x] v3.441: "🧲 Gerar leads frios (Apollo)" na floresta — mesma busca da Prospecção (people_search, sem crédito), deduplica e cria no HubSpot como contato frio (lifecycle lead, NEW), já marcados para a IARA
## Interseções (v3.441)
- T2: envio de WhatsApp pela Z-API (aprovação explícita do fundador por lote) e escrita no HubSpot (contatos, notas).
- 2026-11-10 · v3.441 · ✅ entregue
- [x] v3.442: ações em lote nos marcados — 📣 Remarketing (nova etapa, kv vendas:floresta:remarketing, CSV do público), ↩ tirar do remarketing, 🗑 excluir (arquiva contato/negócio no HubSpot, restaurável por 90 dias); arrastar para/da coluna Remarketing também funciona
- 2026-11-11 · v3.442 · ✅ entregue
- [x] v3.445: campos da IARA no HubSpot (achados pelo rótulo): "Fluxo IA" = IA → etapa Atendimento IARA; "Atendido pela IA" → chip 💬; "Resumo SDR Atlantyx" → conversa no card; "Abordagem" → tag no card, filtro e edição gravando no HubSpot. Botão da seleção agora grava Fluxo IA = IA (a IARA é externa; o envio pela Z-API saiu da tela)
- 2026-11-11 · v3.445 · ✅ entregue
- [x] v3.446 · marcar leads para a IARA: checkbox maior e fora do arrasto, marcar sem perder a rolagem, "Marcar os N frios", seleção na Lista e na Floresta (Ctrl/Shift+clique), botão individual no card; gravação em lote (batch) do Fluxo IA = IA; Apollo com coluna 🤖 IARA (todos ou parte) que já planta com Fluxo IA = IA
- 11/11/2026 · v3.446 · ok · — · aguardar teste do fundador com leads reais
- [x] v3.458 · campos do HubSpot pelos nomes internos informados pelo fundador: marcar lead para a IARA grava `atendido_pela_ia` (sim/não → true; lista → opção IA/Sim; texto → "IA"), fluxo = `fluxo_de_atendimento`, tag = `abordagem`; card vai para Atendimento IARA com atendido_pela_ia marcado ou fluxo_de_atendimento = IA; vale também para o "IARA" da geração Apollo
- 11/11/2026 · v3.458 · ok · — · conferir no HubSpot o valor gravado em atendido_pela_ia
- [x] v3.459 · atendido_pela_ia = true ao mandar para a IARA e false ao tirar
- 11/11/2026 · v3.459 · ok · — · —
- [x] v3.461 · conferidos os campos do HubSpot (prints do fundador): fluxo_de_atendimento (botões Manual/IA — "IA" põe na etapa IARA), atendido_pela_ia (Sim=true/Não=false), abordagem (botão de opção Geral/FQ — escolha ÚNICA: a tela passou de checkbox para opção única e grava um valor só)
- 11/11/2026 · v3.461 · ok · — · —
- [x] v3.463 · etapa 📞 Abordagem telefônica (spec "Abordagem telefônica — especificação", aprovada pelo fundador em 12/11): coluna entre Atendimento IARA e Abordado; entrada manual (seleção, ficha, arrastar) ou automática (3 dias úteis na IARA sem avançar e com telefone); caminho A (Ademir, decisores — 7 dias úteis, 4 tentativas) ou B (IARA voz — 5 dias, 3 tentativas) por sorteio; ficha com telefone, "Ligar pelo HubSpot", roteiro, histórico e registro do resultado → destino automático (reunião cria negócio + tarefa do Ademir; interessado → engajado + tarefa em 2 dias; agora não → congelado; sem interesse/número errado → perdido; não ligar → perdido + descadastro LGPD; não atendeu → nova tentativa, esgotou → volta para a IARA); nota no HubSpot; placar A × B (kv vendas:floresta:ligacao)
- 12/11/2026 · v3.463 · ok · IARA voz (Retell + Twilio) ainda não contratada — caminho B fica para ligação manual até lá · criar no HubSpot os campos de resultado/tentativas (hoje vai como nota)
- [x] v3.464 · arrastar ou aprovar um contato SEM negócio para "Atendimento IARA" dava "crie um negócio para ele": agora vai direto ao fluxo da IARA (atendido_pela_ia = true), sem negócio; o mesmo para 📞 Abordagem telefônica e para voltar a Contato frio (tira da IARA e hs_lead_status = NEW)
- 12/11/2026 · v3.464 · ok · — · conferir no ar arrastando um contato frio para a coluna da IARA
- [x] v3.465 · Kanban da Floresta: colunas fixas em 196px (antes 232px e a 1ª crescia com cargos longos do LinkedIn); cargo/empresa cortados com "…" para caber mais etapas na tela
- 12/11/2026 · v3.465 · ok · — · —
- [x] v3.466 · "Colocar no fluxo da IARA" grava os DOIS campos no contato: atendido_pela_ia = true E fluxo_de_atendimento = IA (tirar: false + Manual). O job da IARA não achava o lead porque fluxo_de_atendimento ficava vazio. A mensagem de confirmação mostra os campos gravados.
- 12/11/2026 · v3.466 · ok · — · time confirmar no job da IARA com um contato de teste
- [x] v3.467 · ao colocar no fluxo da IARA (Floresta e importação do Apollo) também grava abordagem = Geral — só para quem está com a abordagem vazia (não troca um FQ já escolhido)
- 12/11/2026 · v3.467 · ok · — · —
- [x] v3.468 · regra dos campos confirmada pelo fundador: fluxo_de_atendimento (IA/Manual) = QUEM a IARA aborda; atendido_pela_ia (true/false, padrão false) = se a IARA JÁ atendeu; abordagem (Geral/FQ) = tipo de abordagem. "Colocar na IARA" grava fluxo = IA, atendido_pela_ia = false e abordagem = Geral se vazia; "Tirar" grava fluxo = Manual. A coluna da IARA lê o fluxo; o selo "IARA atendeu" lê atendido_pela_ia.
- 12/11/2026 · v3.468 · ok · — · reenviar à IARA os leads marcados entre v3.459 e v3.467 (ficaram com atendido_pela_ia = true sem terem sido atendidos)
- [x] v3.469 · Apollo 401 na Floresta: a chave salva no navegador (Credenciais) tinha prioridade e estava inválida. Agora, se ela for recusada, tenta com a APOLLO_API_KEY da Vercel e avisa; se as duas falharem, a mensagem diz qual chave trocar e onde.
- 12/11/2026 · v3.469 · ok · — · fundador gerar nova chave no Apollo se a da Vercel também estiver recusada
- [x] v3.470 · LEADS MORNOS do Apollo na Floresta: a janela "Gerar leads" ganhou a fonte "🌡 Mornos — lista do Apollo". A API pública do Apollo não expõe Buying Intent nem Website Visitors, então o fundador monta a lista na tela do Apollo (Companies + Buying Intent/Website Visitors → Add to list) e aqui escolhe a lista: lista de empresas → decisores pelos cargos (organization_ids, 0 crédito); lista de pessoas → as próprias pessoas. Plantados ficam marcados como morno (kv vendas:floresta:mornos): selo 🌡 no card, +15 de temperatura e nota "Lead MORNO" no HubSpot. Interseção T2: api/apollo.js ganhou as ações listas e lista_pessoas (GET /labels exige Master API key).
- 12/11/2026 · v3.470 · ok · — · fundador configurar os temas de Buying Intent e montar a 1ª lista no Apollo
- 2026-11-13 · v3.493 · card da Floresta mostra se o lead tem telefone no HubSpot: 📱 celular (WhatsApp) ou ☎ fixo, com o número ao passar o mouse · sem bloqueio · próximo: —
- 2026-11-13 · v3.495 · Retorno das conversas da IARA (lib/iara-retorno.js; cron de hora em hora /api/vendas?cron=iara_retorno + botão "🤖 Retornos da IARA"): e-mail ao Ademir (cópia fundador), IA classifica o resumo e move o card (reunião/engajado/congelado 90d/perdido, só no começo do funil), dados novos no HubSpot sem apagar (telefone em campo vazio, demais em nota) e To-do de achar novo decisor · Interseção T1: cron novo no vercel.json · próximo: conferir o 1º e-mail real
- 2026-11-13 · v3.496 · card da Floresta ganha "💬 Conversa e histórico (HubSpot)": resumo da IARA de TODOS os contatos do card (antes só o 1º contato do negócio), notas (inclui "Retorno da IARA") e comunicações registradas (WhatsApp/SMS/LinkedIn) · sem bloqueio · próximo: confirmar onde o sistema da IARA grava a conversa no HubSpot
- 2026-11-13 · v3.497 · conversa do card lê também a caixa de Conversas do HubSpot (WhatsApp integrado; exige escopo conversations.read), e-mails, chamadas, tarefas, reuniões e campos do contato com conversa/resumo/sdr/iara/whatsapp no nome · sem bloqueio · próximo: conferir no card do Fabio
- 2026-11-13 · v3.498 · Retorno da IARA: se o lead corrigir na conversa, o congelamento automático é desfeito (card volta para a etapa anterior, nota no HubSpot e aviso no e-mail); IA mais cuidadosa com "saiu da empresa" (ausência física não é saída) · sem bloqueio · próximo: —
- 2026-11-13 · v3.499 · card mostra Telefone (celular/fixo) e E-mail do contato; lista de contatos do quadro de conversa com e-mail · sem bloqueio · próximo: —
- 2026-11-13 · v3.500 · Retorno da IARA: resumo gravado como modelo vazio → a IA lê a conversa do histórico do HubSpot (Conversas/mensagens); "aposentou" conta como saiu da empresa; quem saiu/não é a pessoa/recusou não entra sozinho na 📞 ligação; card avisa quando o resumo veio em branco · sem bloqueio · próximo: rodar 🤖 Retornos da IARA e conferir o Ricardo
- 2026-11-13 · v3.501 · Decisões da Floresta: em toda decisão, "✉️ Escrever e-mail" / "💬 Escrever WhatsApp" — a IA redige conforme a decisão (desistir = última tentativa educada), o fundador revisa e abre no e-mail/WhatsApp (nada enviado sozinho) + Copiar · sem bloqueio · próximo: —
- 2026-11-13 · v3.502 · botão do Apollo renomeado: "🧲 Gerar leads (Apollo) · frios e 🌡 mornos" (o fundador não achava a opção Mornos) · sem bloqueio · próximo: —
- 13/11/2026 · v3.503 · Enriquecimento Apollo: revelar e-mail e celular na importação (opcional) e botão 📇 Buscar e-mail e celular nos cards marcados · sem bloqueio · testar com créditos reais
- 13/11/2026 · v3.504 · Convite LinkedIn na Floresta: IA escreve (≤280), usuário revisa e envia 1 a 1 pelo PhantomBuster · sem bloqueio · exige PHANTOM_* na Vercel
