# Atlantyx OS · v1.28 — Sala de Reunião Permanente com conselheiros IA

## O que foi entregue
**S8 · RH → Sala de Reunião**: sala permanente de áudio e vídeo com sua
equipe, embutida no Atlantyx, com os conselheiros IA participando da
conversa por voz.

### Vídeo entre pessoas
Sala segura do Jitsi embutida na tela (câmera, microfone, compartilhar
tela, chat). **O link é sempre o mesmo** — botão "Copiar link da sala"
para enviar ao seu financeiro. Sem conta, sem instalação.

### Conselheiros IA participando
- Botão **🎙 Ativar escuta**: transcreve a conversa no próprio navegador
- Os conselheiros respondem quando você **chama pelo nome** ("conselheiro
  de finanças, o que acha?") ou pergunta ao conselho
- A resposta é **falada em voz alta** e também escrita na transcrição
- O sistema escolhe automaticamente o conselheiro mais pertinente ao
  assunto (finanças / mercado / tecnologia) quando você não especifica
- Modo **"comentar sozinho"** (opcional): eles se manifestam quando têm
  algo relevante a dizer, sem serem chamados
- Falas curtas (máx. 60 palavras, sem markdown) — é conversa, não
  relatório. Se o assunto não for da área deles, ficam calados em vez de
  falar por falar
- Usam **dados reais** da empresa (equipe, alocação, caixa) e são
  instruídos a não inventar número

### Ata automática
Botão **📋 Gerar ata**: transforma a transcrição em ata com assuntos,
decisões, pendências e pontos levantados pelos conselheiros — salva no
histórico do Conselho.

## ⚠ Limitação honesta (importante)
Os conselheiros IA **não entram como participantes de vídeo** na
chamada. Isso exigiria um servidor de mídia rodando continuamente
(LiveKit/Pipecat), que o Vercel não suporta por ser serverless.

Na prática: eles ouvem pelo **seu** microfone e falam pelo **seu**
alto-falante. Para as outras pessoas ouvirem, use fone com microfone
aberto ou compartilhe a aba com áudio. A resposta sempre aparece escrita
também, então ninguém perde o conteúdo.

Se um dia isso for essencial, dá para colocar um bot de mídia real —
mas exige hospedagem separada (fora do Vercel) e custo mensal. Vale
testar assim primeiro.

## Requisitos
- Navegador **Chrome ou Edge** (a transcrição por voz usa a Web Speech
  API, que o Firefox/Safari não suportam bem)
- Permissão de microfone

## Validação
3 conselheiros na sala com botão individual; resposta do conselheiro
entrando na transcrição, marcada como agente e falada em voz alta;
histórico mantido entre falas; detecção de chamada funcionando
(reconhece "conselheiro de finanças..." e ignora "preciso de café");
ata gerada e anexada. Árvore DOM: 81 páginas, 0 aninhadas.

## Arquivos
- api/rh.js (sala_falar, sala_ata)
- public/index.html (tela, Jitsi, transcrição, síntese de voz)
