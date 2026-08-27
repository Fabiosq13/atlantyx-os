# Atlantyx OS · v1.28.1 — Compartilhamento de tela na Sala de Reunião

## Já existia, mas estava escondido
O compartilhamento de tela já vinha habilitado na barra do vídeo (botão
`desktop` do Jitsi), mas não era óbvio. Agora está explícito.

## O que mudou
- **🖥 Compartilhar tela** no cabeçalho da sala, junto com os outros
  botões — um clique e o navegador pergunta o que compartilhar (tela
  inteira, uma janela específica ou apenas uma aba)
- Quando o compartilhamento começa, o botão vira **⏹ Parar
  compartilhamento** em verde, então você sempre sabe se está
  compartilhando (evita o clássico "esqueci que estava mostrando a tela")
- **↗ Ampliar**: expande a área de vídeo de 56% para 78% da altura e
  esconde o painel lateral — importante porque tela compartilhada em
  janela pequena fica ilegível. Acionado automaticamente ao começar a
  compartilhar, e reversível com ↘ Reduzir
- Barra do vídeo com mais opções: qualidade de vídeo, levantar a mão,
  filmstrip, visão em mosaico

## Dica de uso
Para mostrar uma planilha ou o próprio Atlantyx, prefira compartilhar
**a janela específica** em vez da tela inteira — evita expor e-mails,
notificações ou outras abas sem querer.

## Validação
Botões presentes; comando correto (`toggleShareScreen`) enviado ao
Jitsi; ampliar/reduzir alternando 56vh ↔ 78vh com o rótulo do botão
mudando junto.

## Arquivo
- public/index.html
