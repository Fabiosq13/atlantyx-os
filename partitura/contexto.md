# Atlantyx OS — Contexto de trabalho (backup)

> Backup do contexto das sessões com o Claude (até **v3.445 · 11/11/2026**). Leia junto com o `CLAUDE.md` (regras B.P.M.)
> antes de continuar qualquer trabalho. Quando algo aqui divergir do código, vale o código, e este arquivo deve ser corrigido.

## 1. Quem e o quê
- **Fundador:** Fabio Quintanilha, CEO da Atlantyx (antiga Atlanteam), que existe há 17 anos e atua com IA, dados e planejamento B2B. Escritórios no Rio (AQUA) e em SP (Faria Lima).
- **3 motores:** (1) alocação de profissionais, (2) projetos sob medida (marcos, termos de aceite, sustentação mensal com SLA), (3) produtos de IA por assinatura (Atlantyx OS e Maestro).
- **Atlantyx OS:** "sistema operacional" da empresa, cobrindo financeiro, vendas, marketing, PMO, RH e estratégia. Tudo é IA-first, e o fundador aprova as decisões.
- **Maestro:** sistema separado, de gestão do portfólio de projetos (repo `Fabiosq13/atlantyx-dashboard`). O OS lê a base dele em `maestro_painel` e precisa seguir as **mesmas regras** dele.
- **Idioma e tom:** português do Brasil, respostas objetivas, sem jargão técnico para o fundador.

## 2. Stack, deploy e rotina
- **Código:** Vercel com funções ESM em `api/*.js` (sempre envolvidas em `comGuarda`) + Neon Postgres (`kv_store` para configurações) + SPA de arquivo único em `public/index.html` + módulos em `public/*.js`, carregados sob demanda.
- **Rotina de cada entrega:**
  1. subir a versão `ATX-vX.YYY` / `ATLANTYX vX.YYY` no `index.html`;
  2. rodar `node scripts/validar.mjs --sem-navegador` e `node scripts/bpm-gates.mjs --local`;
  3. registrar em `partitura/trilhas/<ID>/plano.md` (checkbox + Registro da Batida);
  4. commit com `BPM-Trilha: Tn` e `BPM-ID: <ID>`;
  5. `git push origin HEAD:main` e conferir o status do commit (`gh api repos/:owner/:repo/commits/<sha>/status`).
- **Teste de tela:** Playwright via `createRequire('/usr/lib/node_modules/')`, servidor `python3 -m http.server 8765` dentro de `public/` e `**/api/**` mockado.
- **Deploy travado em 10/11:** a integração Neon (`atlantyx-kv`) criava branch do banco a cada deploy de produção e dava timeout. Corrigido em Vercel → Storage → atlantyx-kv → Projects → *Update Project Connection* → "Create Database Branch For Deployment" sem **Production**. Se voltar a falhar em ~1 s, olhe primeiro "Provisioning Integrations".
- **Segurança (CLAUDE.md):**
  - nunca ler `.env*` nem escrever segredo em código ou log;
  - nada de dados reais de clientes em testes ou prompts;
  - nada de `CREATE/ALTER TABLE` fora da T5 (configuração nova vai em `kv_store`);
  - anúncios pagos sempre PAUSADOS; e-mail só como rascunho; envio externo só com aprovação.
  - `api/image-gen.js` nunca vai em pacotes entregues.

## 3. Agenda de Receitas (T6 · `api/financeiro.js` → `receitasPrevistas`) — regras de negócio
Fonte única de receita prevista: alimenta extrato futuro, fluxo de 12 meses, projetado, dashboard e e-mail.
- **Origens:** marcos (Kanban de Marcos) · termos (Kanban de Faturamento) · sustentações (projetos de sustentação) · avulsas e recorrentes manuais (`fin:rp_man`) · recorrentes do QuickBooks (**fora por padrão**; liga modelo a modelo em `fin:qb_rec_receitas`) · faturas reais do QuickBooks.
- **O QuickBooks vale:**
  - fatura cobre a previsão;
  - sustentação faturada em uma ou várias notas emitidas no mês sai da agenda;
  - nota de termo ou marco não cobre sustentação, exceto termo **de sustentação**.
- **Fatura ligada a termo** só cobre previsão do **mesmo termo ou projeto** (caso fatura 204 Transmissão × MC4).
- **Marco que virou termo sai** e vale o termo. Casamento:
  - vínculo do Kanban;
  - código `MPn` no termo;
  - mesmo projeto e valor (±1%);
  - texto: só o(s) marco(s) que fecham o valor do termo (caso Servipla);
  - ligação manual pelo botão "→ Termo", desfeita por "Desligar" ou "Não é deste termo" (`fin:marco_termo`, `fin:marco_termo_nao`).
- **Termo de sustentação** substitui a mensalidade do mês mais próximo (até 45 dias).
- **Regras de substituição** (`fin:rp_regras`): "documento contém X elimina a recorrência Y" (±25 dias). Padrão: "sustentação e evolutivas" → bigdata; "xplann" → xplann. Há também casamento automático por assunto compacto ("Big Data" = "BigData").
- **Retenção de impostos:** saldo aberto igual à retenção (~6,15%) conta como **recebido**.
- **Nº de termo repetido:** valor da fatura ≠ termo (±5%) → a ligação é ignorada e aparece aviso (caso dois "Termo 11").
- **Termo sem rateio**, ou com empresa sem valor, entra pelo `valor_total_termo`.
- **Previsão de recebimento por fatura** (`fin:inv_prev_receb`, botão 📅) não altera o QuickBooks. O botão 🗓 corrige o vencimento **no QuickBooks** (só DueDate) e a emissão das NFs do termo.
- **Telas:**
  - aba **Todas** (M-1, M0 e futuro, filtros de mês, termo e busca; rateio por NF da própria fatura; ↗ ir ao lançamento · ✎ editar · 🗑 excluir só este ou a recorrência inteira);
  - abas **Raio-X** (`receitas_diagnostico`: de onde vem e por que sumiu), **Regras**, **Recorrentes QuickBooks**, **Já faturadas/encerradas** (↺ desfaz).
- **Pendente (11/11):** Xplann sem recorrência em dezembro, termos do HC ausentes, conferir marcos Servipla. Aguardando prints do Raio-X ("xplann", "HC", "servipla").

## 4. Vendas
- **🌳 Floresta de Vendas** (T3 · `lib/floresta.js`, `public/floresta-ui.js`, ações `floresta*` em `api/vendas.js`):
  - **Jornada:** frio → **Atendimento IARA** → abordado → engajado → qualificado → reunião → proposta → negociação → cliente, mais remarketing, congelado e perdido.
  - **Dados:** contatos sem negócio + negócios do HubSpot (~600 contatos e ~400 negócios mais recentes).
  - **Tempo limite por etapa** (`vendas:floresta:cfg`). Estourou → a IA decide **avançar / congelar / desistir** → fila de aprovação do fundador (`vendas:floresta:fila`). O cron em dias úteis às 8h13 só enche a fila.
  - **Aprovado:** move no HubSpot, cria negócio, congela ou cria tarefa no To-do. Mensagens só abrem prontas; **nada é enviado sozinho**.
  - **Vistas:** Kanban (arrastar = mover no HubSpot), Floresta e Lista.
  - **Seleção:** colocar no fluxo da IARA · 📣 Remarketing (CSV do público) · 🗑 excluir (arquiva no HubSpot por 90 dias).
  - **🧲 Gerar leads frios (Apollo):** mesma `people_search` da Prospecção, sem crédito; cria contato frio no HubSpot.
- **IARA** = SDR de IA **externa** (WhatsApp, Gemini). Integração pelos campos de **contato** no HubSpot, achados pelo rótulo:
  - **Fluxo IA** = "IA" → etapa Atendimento IARA (o botão grava esse campo);
  - **Atendido pela IA** → a IARA já mandou WhatsApp;
  - **Resumo SDR Atlantyx** → resumo da conversa, mostrado no card;
  - **Abordagem** → tag da forma de abordagem; filtro e edição na Floresta.
  - O envio pela Z-API do próprio OS (`iaraEnviar`) existe no servidor, mas saiu da tela.
- **Leads esquecidos** (`leads_esquecidos`): HubSpot + base local, do mais antigo ao mais recente, com mensagem sugerida e tarefas.
- **Metas comerciais:** 200 leads de entrada e 4 vendas por mês.

## 5. Estratégia, gestão e outros módulos entregues
- **🏰 Moat** (`lib/moat.js`, aba na Estratégia, menu 2.3c):
  - analisa a Atlantyx e as ideias com 7 Powers, teste da cópia, flywheel, erosão e métricas;
  - "tunagem" em rodadas até nota ≥ 8;
  - a tese aprovada entra nas premissas de todas as IAs de estratégia (`est:moat`).
- **Sala do Conselho:** todos os agentes + Conselheiro do Contra, por chat ou reunião. Também roda aqui no Claude pela skill `sala-do-conselho`; doc no Projeto `claude/sala-do-conselho.md`.
- **Investimentos & Retiradas** (`lib/investimentos.js`): reanálise a cada decisão do Copom (cron semanal com Selic do BCB).
- **Fluxo Futuro 12 meses:** farol por mês, visão caixa/competência, análise de IA; também aparece no Dashboard Financeiro.
- **Metas da Empresa:** carga do QuickBooks do ano ou do anterior, por motor.
- **Impostos** no QuickBooks: contas "Taxes" e "Income Tax Expense".
- **Painel de projetos** = regras do Maestro:
  - farol de prazo pelo desvio (< −10 vermelho, < −5 amarelo);
  - tendência pela previsão de fim;
  - farol de status report da semana;
  - sem cronograma = ⚪.
- **Termos:** número automático ao gerar pelo Kanban de Marcos.
- **Pagamento a colaboradores:** mês novo copia o anterior; confirmação de pagamento por pessoa e em lote.
- **DP/RH → Papéis & Responsabilidades:** por cargo, gerados por IA, + matriz RACI (`rh:papeis`, `rh:raci`).
- **Esteira de Demandas:** 📋 Spec para o Claude (um card ou vários marcados); o card vai para Concluídas.
- **Estúdio Higgsfield:** precisa de `HF_API_KEY_ID`/`HF_API_KEY_SECRET` na Vercel e do caminho do modelo de vídeo.
- **IAs com To-do:** estratégia, planejamento e riscos criam tarefas; o Raio-X do funil pago fica em Desempenho; o ATLAS aparece em cada tela do Diagnóstico.

## 6. Preferências e decisões do fundador
- Ele aprova toda decisão da IA que tenha efeito externo. A IA propõe, mostra o porquê e deixa pronto.
- O QuickBooks é a verdade do faturado. A agenda é previsão e se ajusta a ele.
- Para dados financeiros e de projetos, as regras do Maestro e do QuickBooks prevalecem sobre heurísticas.
- Prática de trabalho: quando um número "sumir", mostrar o porquê (Raio-X, "Fora da conta") antes de mudar regra.
