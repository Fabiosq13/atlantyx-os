# Atlantyx OS · v1.29 — Conselheiros com dados comerciais (funil e pipeline)

## A lacuna
Os conselheiros da Sala de Reunião e da Sala do Conselho conheciam a
empresa "por dentro" (equipe, alocação, caixa), mas **não enxergavam o
funil de vendas** — justamente o dado necessário para discutir modelo de
negócio, preço e estratégia comercial. Falavam bem de custo, mas no
escuro sobre conversão.

## O que passaram a enxergar
- **Funil dos últimos 30 dias**: contatos, respostas, reuniões marcadas e
  realizadas, propostas, fechamentos
- **Taxas de conversão entre etapas** calculadas: contato→resposta,
  resposta→reunião, reunião→proposta, proposta→fechamento
- **Leads recentes** agrupados por score
- **Campanhas ativas** por canal

Agora uma frase como "com 33% de conversão de proposta, para fechar mais
3 contratos precisamos de 9 propostas — hoje fazemos 30 por mês" é
possível, porque o número está no contexto.

## Instrução adicionada aos conselheiros
Em conversa sobre modelo de negócio, preço ou vendas, devem **usar as
taxas do funil** para embasar. E há uma regra explícita: dado de fora
(mercado, concorrência, preço praticado) **não está no contexto** — eles
devem pedir ao CIO em uma frase, em vez de supor. Isso evita conselho
inventado com cara de análise.

## Validação
Funil simulado de 900 contatos → 270 respostas → 90 reuniões → 30
propostas → 10 fechamentos: todas as taxas calculadas corretamente (30%,
33,3%, 33,3%, 33,3%), divisão por zero protegida (devolve null em vez de
quebrar), e o contexto confirmado dentro do prompt enviado aos agentes.

## Arquivo
- api/rh.js
