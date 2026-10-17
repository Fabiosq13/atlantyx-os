# Spec — Estratégia IA (ATLAS · NORTE · Sala de Estratégia)
ID: 2026-10-11-estrategia-ia · Trilha: T3 · Aprovada por: Fabio (pedido direto, 2026-10-11)

## Problema
O fundador quer uma IA de estratégia da empresa acessível por chat ou voz, uma sala onde ela debate com outras IAs para montar a estratégia, e — na parte de Propósito e Metas — uma IA que alinhe metas pessoais ao propósito dele e da empresa.

## Escopo
- ATLAS (estrategista-chefe): chat e voz com contexto vivo (financeiro, comercial, projetos, ideias, funil) e premissas editáveis.
- NORTE (mentor de propósito e metas pessoais): lê o S1 Propósito e as metas da empresa; gera plano pessoal (metas, tensões, rituais, próximos 30 dias).
- Sala de Estratégia: ATLAS conduz um comitê (CFO, CRO, CTO, COO, Crítico; opcionais NORTE e Voz do Cliente) em rodadas, com intervenção do fundador; síntese em JSON; aprovação vira o plano vigente.
- Encaminhar iniciativas aprovadas para Esteira de Demandas, Pipeline de Ideias ou pauta de rito semanal — só no clique do fundador.

## Fora de escopo
- Qualquer envio externo automático; criação de tabelas fora do padrão das APIs; dados de clientes reais em prompt fixo.

## Critérios de aceite
1. Chat com ATLAS e NORTE funciona por texto e voz (Chrome/Edge), com histórico salvo.
2. Sala executa rodadas, permite intervenção e gera síntese estruturada.
3. Aprovar a síntese grava o plano vigente (com histórico anterior).
4. Iniciativas vão para o destino escolhido somente após clique.
5. Botão "Conversar com o NORTE" na tela S1 Propósito.
