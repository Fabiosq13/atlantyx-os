# Método B.P.M. no Atlantyx OS — como funciona aqui

Base: *Manual de Implementação — Método B.P.M. no Atlantyx OS* (02/10/2026, Fabio Quintanilha). Este arquivo registra **como o manual foi aplicado ao repositório real** e o que ainda depende de decisão humana.

## O ciclo, do jeito que roda hoje
```
Agente de Produto / Fundador ──► Esteira de Demandas (S0)
   1. PARTITURA  demanda com problema + critérios de aceite + trilha (T1…T6) → Compositor/PO aprova
   2. TRILHA     tarefa @claude no GitHub com BPM-Trilha/BPM-ID → o robô Claude cria spec.md + plano.md,
                 implementa só no escopo da trilha (hook bloqueia o resto) e abre o PR
   3. MIXAGEM    gate automático (CI "Gates B.P.M." + validar) → revisor (subagent) → checklist humano na
                 Esteira ("Aprovar e mesclar") → robô de merge valida de novo, mescla e sobe a versão
   BATIDA        painel 🥁 na Esteira (trilhas ativas, bloqueios, paralelismo, métricas) + /bpm-batida
```

## Elemento do método → peça concreta neste repositório
| Elemento | Onde está |
|---|---|
| Partitura-mestre | `CLAUDE.md` (46 linhas) |
| Contratos | `partitura/contratos/{api,banco,eventos}.md` — parte manual + inventário gerado do código (`scripts/bpm-inventario.mjs`) |
| Propriedade das trilhas | `partitura/escopos.json` (fonte única: hook, CI e Esteira leem o mesmo arquivo) via `lib/bpm.js` |
| Spec / plano / mixagem por trilha | `partitura/trilhas/<ID>/` (modelos em `_modelo/`) |
| Músicos especialistas | `.claude/agents/` afinador, revisor, testador, documentador |
| Comandos | `.claude/commands/` `/bpm-nova-trilha`, `/bpm-batida`, `/bpm-mixagem` |
| Hooks | `.claude/hooks/escopo-trilha.mjs` (bloqueia edição fora da trilha, DDL fora da T5, mudança de versão) · `sintaxe.mjs` (node --check depois de editar) |
| Gate automático | `.github/workflows/ci.yml` + `scripts/bpm-gates.mjs` em todo PR; os mesmos gates rodam no robô de merge (`claude-pr.yml`) antes de mesclar |
| Gate humano | checklist de Mixagem obrigatório no botão "Aprovar e mesclar" da Esteira (fica registrado no card e comentado no PR) + `.github/pull_request_template.md` |
| Donos humanos | `.github/CODEOWNERS` (hoje todos @Fabiosq13) |
| Batida | painel 🥁 Batida na Esteira de Demandas + `partitura/trilhas.md` (via `/bpm-batida`) |

## Adaptações ao código real (decididas na Fase 1)
1. **Não existe `src/`, Next.js nem Prisma.** O backend é `api/*.js` (funções Vercel), o front é um arquivo único `public/index.html`, o banco é Neon com DDL dentro de cada API. As trilhas foram mapeadas arquivo a arquivo em `escopos.json`.
2. **Seis trilhas, não cinco:** o financeiro (`api/financeiro.js`, ~8 mil linhas, + faturamento, termos, CNAB) virou a **T6 Financeiro** — é o maior módulo e tem dono de negócio próprio. As outras cinco seguem o manual.
3. **`public/index.html` é compartilhado:** a T4 é dona da estrutura; as demais trilhas editam só a seção da própria tela. O hook não consegue separar por trecho — quem confere é o revisor e a Mixagem. Caminho recomendado: cada módulo migrar para `public/<modulo>-ui.js` (padrão já usado por demandas, vendas, jurídico e disparo); ao migrar, a trilha ganha propriedade total do arquivo.
4. **Schema dentro das APIs:** a "migração" é o bloco `CREATE/ALTER TABLE IF NOT EXISTS` no `getSql()` do módulo. Só a T5 pode adicionar DDL (hook + gate "banco" do CI).
5. **Sem `npm run lint/test/build`:** o gate usa `scripts/validar.mjs` (sintaxe + carga da página) e `scripts/bpm-gates.mjs`. Testes de unidade, quando surgirem, ficam em `testes/` com `node --test`.
6. **Versão:** só o robô de merge sobe `ATX-vX.YY` — o hook e o CI bloqueiam PR que mexe na versão.

## Pendências que dependem de decisão humana
- **Branch protection na `main`** (manual: obrigatória). Ligar hoje quebraria dois fluxos atuais: o robô de merge faz push direto na main para subir a versão, e os commits diretos do Maestro. Opções: (a) ligar com exceção para o bot (GitHub App/token com bypass) e mover o bump de versão para dentro do PR; (b) manter desligada e confiar nos gates do robô de merge (situação atual). Decisão do Fabio.
- **Nomes por papel** (Compositor/PO, Maestro, Afinador, Analistas, Engenheiro de Mixagem): hoje tudo é Fabio. O que não pode acumular: Analista e Engenheiro de Mixagem **da mesma trilha** — enquanto só houver uma pessoa, o subagent revisor faz a pré-revisão obrigatória.
- **Agent teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` no settings.json, conforme o manual): recurso experimental — se a versão do Claude Code não suportar, nada quebra; os subagents e as tarefas paralelas da Esteira seguem como plano B.
- **Trilha piloto da F2:** escolher uma demanda pequena e real na Esteira (sugestão do manual: nova ação de um conector da T2).

## Fases (gates não se pulam)
| Fase | Semanas | Gate | Situação |
|---|---|---|---|
| F1 Afinação | 1–2 | o kit roda numa sessão de teste e o hook bloqueia uma edição fora do escopo | kit instalado; hook testado (bloqueia fora do escopo, DDL fora da T5 e versão) |
| F2 Trilha piloto | 3 | PR piloto passa pelos 3 gates sem exceção | aguardando escolha da demanda |
| F3 Ensaio | 4–5 | 2 semanas sem edição fora do escopo e sem conflito entre trilhas; até 3 trilhas | — |
| F4 Regência | 6 | até 5 trilhas; Batida e varredura de dívida técnica como rotinas; manual v2 | — |
A Esteira mostra a fase atual e o limite de trilhas em paralelo (configurável no painel 🥁 Batida).
