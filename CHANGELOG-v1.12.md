# Atlantyx OS · v1.12 — QuickBooks sem "Erro token" + faxina financeiro + reagendar + impulso ICP

## 1. QuickBooks: fim do "Erro token" recorrente (causa raiz)
O Intuit ROTACIONA o refresh_token a cada renovação (devolve um novo; o
antigo morre). O sistema só lia a env QB_REFRESH_TOKEN e nunca guardava o
novo → depois de algumas renovações, invalid_grant → você refazia no
Playground → repetia. Agora:
- Tokens vivem no BANCO (kv_store 'qb:tokens'), atualizados a cada
  renovação; a env é só a semente inicial. access_token em cache até
  expirar (menos chamadas à Intuit).
- "Conectar QuickBooks" por OAuth de verdade: clique em "QuickBooks" na
  barra lateral → popup da Intuit → autoriza → tokens gravados no banco.
  Sem Playground. Callback: /api/financeiro?qb_callback=1
- Status na sidebar mostra origem dos tokens, validade do refresh e vira
  "Erro token — clique p/ reconectar" quando precisar.
- Erros de QB nas telas ganham a dica "clique em QuickBooks para reconectar".
### Setup único (Intuit Developer)
developer.intuit.com → seu app → Keys & credentials (Production) →
Redirect URIs → adicionar EXATAMENTE:
  https://SEU-DOMINIO-DE-PRODUCAO/api/financeiro?qb_callback=1
(o Atlantyx mostra a URL exata no confirm ao clicar em Conectar; se usar
domínio diferente, defina a env QB_REDIRECT_URI). QB_CLIENT_ID e
QB_CLIENT_SECRET continuam nas envs; QB_REFRESH_TOKEN passa a ser opcional.

## 2. Faxina no módulo financeiro (auditoria automatizada das 14 telas)
Rodei todas as telas em navegador simulado, com QB desconectado e sem
dados. Achados e correções:
- Orçamento Anual: quebrava com "Cannot read properties of undefined
  (reading 'orcado')" e deixava "Carregando..." preso quando não há
  dados/QB off → agora mostra KPIs zerados e mensagem clara.
- A Receber e Realizado QuickBooks: não carregavam nada ao abrir (só ao
  clicar) → agora carregam automaticamente ao entrar.
- 15 cabeçalhos das telas S3 (faixa colorida com filtros/botões) tinham
  display:flex sem quebra de linha → em janelas menores os campos saíam
  da tela/sobrepunham → flex-wrap adicionado (provável causa das "telas
  desposicionadas").
- Sem erros de JS, funções ausentes ou ids quebrados nas 14 telas.
Se ainda houver tela desalinhada, me mande um print — sem renderizar
visualmente não consigo enxergar posição, só estrutura.

## 3. Reagendar publicações no Metricool (pedido anterior)
Botão ✎ ao lado do 🗑 no calendário do Kanban e "✎ data" nas
publicações do detalhe da peça → nova data/hora → o Metricool é
atualizado (tenta editar; se não aceitar, recria o post com o payload
original guardado e troca o id). Card/calendário/campanha refletem.

## 4. Impulsionamento dentro do ICP
O plano de impulso agora exige: objetivo Leads/Conversões, públicos
próprios (Personalizado HubSpot + Lookalike 1% + retargeting), exclusões
(clientes, funcionários, convertidos) e uma linha qualificadora abrindo a
copy. O pacote copiado avisa: usar Ads Manager, não o Turbinar do celular.

## Arquivos
api/financeiro.js · api/metricool.js · api/s2-creative.js · public/index.html
