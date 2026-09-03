# Atlantyx OS · v1.35 — FIX: sala de reunião cortando em 5 minutos

## O aviso que apareceu
"A incorporação de meet.jit.si destina-se apenas a fins de demonstração,
pelo que esta chamada será desligada em 5 minutos."

## Causa
O limite é do **iframe**: o meet.jit.si corta chamadas **incorporadas**
em outra página após 5 minutos. A mesma sala aberta em janela própria
**não tem esse limite**.

## Correção
O botão **Entrar na sala** passa a abrir a sala em **janela própria** —
sem limite de tempo, sem conta, sem custo. A tela do Atlantyx continua
com os conselheiros e a transcrição, para você deixar as duas janelas
lado a lado.

Quem preferir o vídeo embutido tem o botão "Abrir aqui mesmo (5 min)",
que deixa claro o limite.

## Novo: ⚙ Servidor de vídeo
Se você quiser o vídeo **embutido na tela sem limite**, dá para apontar
para um servidor Jitsi próprio (JaaS/8x8 ou self-hosted): botão ⚙
Servidor de vídeo → informe o domínio. A partir daí o Atlantyx usa esse
servidor para o vídeo embutido, o link da sala e o botão de copiar.

O padrão continua sendo meet.jit.si (gratuito, janela própria).

## Validação
Padrão abre em janela sem iframe; instrução na tela; opção de embutir com
aviso do limite; com servidor próprio configurado o vídeo volta a ser
embutido; link copiado usa o domínio certo; voltar ao padrão funciona.

## Arquivo
- public/index.html
