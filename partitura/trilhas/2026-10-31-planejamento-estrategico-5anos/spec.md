# Trilha: Planejamento Estratégico — horizonte de 5 anos e trilha guiada
ID: 2026-10-31-planejamento-estrategico-5anos · Trilha permanente: T3 · Dono: Estratégia IA (S1) · Status: aprovada (entregas 1 e 2 em v3.341; entrega 3 aprovada em 31/10/2026 e entregue em v3.342)
Demanda: "Ajustes exclusivos no módulo de planejamento estratégico" (PDF do fundador, 31/10/2026) · Aprovada por: fundador em 31/10/2026
Respostas do fundador: entregas 1 e 2 agora (as demais depois da validação) · acesso só do fundador · horizonte 2027–2031 com revisão anual no 4º trimestre e orçamento semestral (aprovação em dezembro, revisão em junho) · comissão de 10%/15% vale para clientes novos e pessoas novas (entra na entrega 6).

## Problema
O módulo guarda um plano, mas não conduz o fundador pelo método que vem antes dele (diagnóstico, metas, os "nãos") nem pelo ciclo de revisão. A visão termina em 3 anos e a projeção também, enquanto a estratégia combinada é de 5 anos (2027–2031).

## Resultado esperado
O fundador percorre as 11 perguntas em ordem, com rascunho e validação por etapa e sugestões do ATLAS com os números vivos; mantém a lista do que NÃO fazer (a Esteira avisa quando uma demanda parece contrariar um "não"); vê o plano em 5 anos, a projeção por motor até 2031 e o calendário de revisão anual, orçamento semestral e check-ins trimestrais.

## Critérios de aceite
- [x] (8.1) As 11 perguntas aparecem em ordem, cada uma com resposta, estado (vazia, rascunho, validada), responsável e data; o ATLAS sugere respostas com os números vivos, mas só o fundador valida.
- [x] (8.2) A tela alerta quando uma etapa é iniciada sem as anteriores e bloqueia a validação enquanto as anteriores não estiverem validadas.
- [x] (8.3) Existe a lista do que NÃO fazer (texto, motivo, motor, data) e a Esteira de Demandas mostra um aviso quando uma demanda parece contrariar um "não" (interseção T1).
- [x] (8.4) Plano com visão de 5 anos (2031), projeção por motor até 2031 e calendário de revisão (anual, semestral e trimestral) visível, com checklist da revisão e gatilhos de revisão antecipada.
- [x] Orçamento semestral: previsto (sugerido pela projeção) × realizado (financeiro) por motor, caixa, verba de marketing e contratações; aprovação em dezembro e revisão em junho.
- [x] (8.7) Acesso às novas telas e ações só para o fundador (perfil administrador).
- [x] (8.8) Nenhum número de mercado é pré-preenchido como fato; o ATLAS marca o que vem de fora como "não verificado" com a fonte.
- [x] (8.9) Premissas, Sala de Estratégia, NORTE, plano vigente, ajustes, projeção e ritos continuam funcionando.
- [x] (8.10) `node scripts/validar.mjs --sem-navegador` e `node scripts/bpm-gates.mjs --local` passam.

### Entrega 3 — alinhamento de sócios e papel do fundador (aprovada pelo fundador: "Pode fazer a entrega 3")
- [x] Registro por sócio: o que quer em 3 a 5 anos, papel da empresa na vida dele, fase de vida (risco, dinheiro, equipe, resultado, dedicação, horizonte).
- [x] Detector de divergência lado a lado; divergência forte sem acordo = "estratégia travada até alinhar"; acordo registrado destrava.
- [x] (8.2) Metas (etapas 7 a 11) alertam ao começar e não validam sem os sócios alinhados.
- [x] Mapa das quatro cadeiras (hoje × 12 meses, divisão do tempo) e a lista "tudo o que eu faço e não deveria fazer" com para quem delegar, prazo e status.
- [x] (8.7) Exercício pessoal do NORTE (funeral, horizonte de vida): só salvo por clique, por login, nunca exibido a outro usuário; o NORTE só usa se o fundador marcar.
- [x] Dados dos sócios não vão para os prompts gerais (só status e acordos); o detalhe só entra na sugestão da etapa 7 aberta pelo fundador.

## Escopo de arquivos (propriedade)
Pode alterar: api/estrategia.js, lib/plano-estrategico.js, lib/projecao-3anos.js, public/estrategia-ui.js, public/projecao-ui.js; novos: lib/estrategia-roteiro.js, public/estrategia-trilha-ui.js
Seção do public/index.html: tela de Estratégia / Plano Estratégico (rótulo "Visão 5 anos") e o rótulo "Projeção 5 anos"
Só lê: partitura/contratos/**
Armazenamento: kv_store (sem DDL) — est:roteiro, est:nao_fazer, est:revisao_calendario, est:orcamento_semestral, est:socios, est:cadeiras, est:norte_pessoal:<login>
Interseções previstas: T1 (aviso na Esteira de Demandas — public/demandas-ui.js), T4 (rótulo do menu "Projeção 3 anos" → "5 anos"), T5 (registrar as chaves novas e os arquivos novos em escopos.json)

## Fora do escopo
Entregas 4 a 7 do PDF (concorrentes, obstáculos e ações ligados, aba Execução, painel de receita e ontologia). Coleta externa de dados (T2). Nenhuma ação é executada sem o fundador.
