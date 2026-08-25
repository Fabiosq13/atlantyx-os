# Atlantyx OS · v1.22 — Organograma IA-First + Conselho Paralelo + Auditoria Financeira

## PARTE 1 — Auditoria do módulo financeiro (varredura completa)
Rodei uma varredura automática procurando 5 famílias de erro (datas não
normalizadas, status mortos, parse de valor, divisão por zero, N+1) e
investiguei cada sinalização. Resultado: **4 bugs reais**, todos da mesma
família — a introdução do status 'lancada' (v1.20.6, quando implementei o
lançamento de despesa no QuickBooks) quebrou silenciosamente 4 lugares
que só consideravam 'prevista':

1. **Cobertura de Despesas Fixas (KPIs)** — corrigido na v1.20.7
2. **Conciliação Bancária** — despesas lançadas no QB sumiam do pool de
   candidatos (corrigido na v1.20.9)
3. **Fluxo de Caixa Futuro 12 meses** ⚠ NOVO — ignorava despesas já
   lançadas no QB, deixando a projeção **otimista demais** (mostrava
   saldo futuro maior do que a realidade). Corrigido.
4. **Regeneração de ocorrências recorrentes** ⚠ NOVO — ao editar uma
   despesa recorrente, as ocorrências com status 'lancada' não eram
   limpas, deixando **duplicatas** no calendário. Corrigido (as 'paga'
   continuam preservadas — histórico real não se mexe).

Também confirmei que o status 'atrasada' referenciado no código nunca é
gravado em lugar nenhum (código morto) — removido da query.
Os outros 23 pontos sinalizados pela varredura eram falsos positivos
(valores vindos do banco já em formato decimal, regex `/total/i` e
divisões já protegidas) — verificados um a um.

## PARTE 2 — Organograma IA-First (S8 · RH → Organograma)
Cada cargo da empresa tem um **par**: a pessoa real e o agente de IA de
apoio na mesma função. O card mostra os dois lado a lado (👤 pessoa /
🤖 agente IA), e cargos vagos aparecem com "cargo vago" mas **com o
agente IA já ativo** — que é a essência do IA-first: a função existe e
está coberta por IA mesmo antes de ter alguém contratado.

Estrutura semeada automaticamente na primeira abertura:
CIO (ARIA) → CFO (FINN) · CMO (MIRA) · CTO (NOVA) · CHRO (HELO) ·
CRO (VERA) · COO (ORION)

A pessoa é associada ao cargo escolhendo do **cadastro de funcionários**
(v1.21), e a hierarquia é visual (árvore com indentação por nível).
KPIs: cargos totais, ocupados, vagos, cobertura por agente IA.

## PARTE 3 — Conselho Paralelo + Sala do Conselho
**3 cadeiras, cada uma com conselheiro real + conselheiro IA**, ligadas à
presidência (CIO):
1. Estratégia & Mercado · 2. Finanças & Risco · 3. Tecnologia & Inovação

**Sala do Conselho** (debate real, não chat simples):
- Você abre uma **pauta** (assunto + contexto)
- Escreve sua posição como CIO e clica em **Debater**
- **Cada conselheiro IA responde na sua especialidade**, com prompt
  próprio que os instrui a: falar só da própria área, **tomar posição
  clara (concordar ou DISCORDAR com fundamento, inclusive dos outros
  conselheiros)**, apontar riscos que os outros não veem, e nunca
  inventar número
- Os agentes recebem **dados reais da empresa** (equipe, alocação por
  projeto, estrutura) para embasar
- O debate acumula em rodadas — você pode responder e eles rebatem
- **📋 Gerar Ata de Decisão**: consolida tudo em consenso / divergências /
  riscos / recomendação ao CIO / o que falta decidir

## Validação
Organograma: par pessoa+IA no mesmo card, cargo vago com agente ativo,
hierarquia correta, KPIs. Conselho: 3 cadeiras com par real+IA, fala do
CIO registrada, e — o mais importante — **os conselheiros IA opinaram com
posições DIFERENTES entre si** (um favorável ao timing, outro discordando
por falta de caixa), confirmando que o debate é real e não um eco.
Árvore DOM: 78 páginas, 0 aninhadas. 0 erros JS.

## Arquivos
- api/rh.js (organograma, conselho, debate multi-agente, síntese)
- api/financeiro.js (2 bugs novos corrigidos)
- public/index.html (telas de organograma e sala do conselho)

## Pendente (do pedido anterior)
Kanban de linha de produção do squad de desenvolvimento (ideia →
requisitos → arquitetura → dev com IA → testes/QA → homologação →
implantação → treinamento → documentação): fica para a próxima rodada,
já que este pacote ficou grande. É a próxima coisa que faço se você
confirmar a prioridade.
