# Atlantyx OS — Partitura-mestre (Método B.P.M.)

Todo agente (Claude Code local, robô do GitHub, subagent ou teammate) lê este arquivo ao iniciar.
B.P.M. = **Batida** (cadência de sincronização) · **Partitura** (specs e contratos) · **Mixagem** (revisão antes do merge).
Manual completo: `partitura/README.md`.

## Antes de qualquer tarefa
1. Identifique sua trilha: variável `BPM_TRILHA` (T1…T6), arquivo `.bpm-trilha` na raiz, ou a linha `BPM-Trilha:` da tarefa. Sem trilha você é o **Maestro**: só planeja, abre trilhas e revisa — não implementa feature.
2. Leia `partitura/trilhas/<ID>/spec.md` e `plano.md` (ID = linha `BPM-ID:` da tarefa).
   - Tarefa da Esteira de Demandas: a spec aprovada pelo fundador está no corpo da tarefa — **crie** `spec.md` e `plano.md` a partir dela antes de tocar no código.
   - Sem spec aprovada (critérios de aceite + escopo): **PARE e avise**. Não invente requisito.
3. Leia `partitura/stack.md` e os contratos que a spec cita (`partitura/contratos/`).

## Regras
- Altere **apenas** os arquivos da sua trilha (`partitura/escopos.json`). O hook `.claude/hooks/escopo-trilha.mjs` bloqueia o resto.
- `public/index.html` é compartilhado (SPA de arquivo único): mexa só na seção da sua tela. Menu, CSS global e dashboard são da T4.
- Precisa de algo de outra trilha? Registre em **Interseções** do seu `plano.md` e siga sem editar — quem executa é a trilha dona.
- **Banco:** nunca crie tabela, coluna ou índice (`CREATE/ALTER TABLE`). Peça ao subagent `afinador` uma proposta em `partitura/contratos/banco.md`. Só a T5 aplica.
- **Versão:** nunca altere `ATX-vX.YY` / `ATLANTYX vX.YY` — quem sobe a versão é o robô de merge (mudar gera conflito entre PRs).
- Spec e código divergem? **Pare e pergunte.** A spec muda primeiro, depois o código.
- Segurança: nunca leia `.env*`, nunca faça deploy de produção, nunca escreva segredo em código, teste ou log (segredos só nas variáveis da Vercel/GitHub). Agentes de e-mail criam **rascunho**; envio externo só com regra já aprovada.
- Dados de clientes reais (CPFL, Enel, Caixa, Jelta…) nunca em código, testes, fixtures ou prompts — use dados sintéticos.
- Anúncios pagos sempre criados **PAUSADOS**. Robôs de QA nunca executam ação social real (curtir, seguir, enviar, comprar).

## Ao terminar uma tarefa
- Marque o checkbox no `plano.md` e adicione uma linha no **Registro da Batida** (data · status · bloqueio · próximo passo).
- Preencha `partitura/trilhas/<ID>/mixagem.md` (modelo em `partitura/trilhas/_modelo/`).
- Rode: `node scripts/validar.mjs --sem-navegador` (sintaxe de api/, lib/, public/*.js e dos `<script>` do index.html) e `node scripts/bpm-gates.mjs --local` (escopo, banco, versão, segredos).
- No corpo do PR, mantenha as linhas `BPM-Trilha: Tn` e `BPM-ID: <ID>` e o checklist de Mixagem do template.

## Trilhas permanentes (detalhe em `partitura/escopos.json`)
| Trilha | Naipe | Escopo |
|---|---|---|
| T1 Plataforma | Percussão | auth, acesso, guarda das APIs, CI, QA, Esteira/Fábrica, vercel.json, package.json |
| T2 Integrações | Metais | HubSpot, Gmail, Calendar, QuickBooks OAuth, Metricool, Apollo, PNCP, Ideogram, Z-API, mídia |
| T3 Agentes e Squads | Cordas | S1, S2, S5, S7, S8, S9 e a orquestração dos agentes |
| T4 Dashboard e Telas | Madeiras | estrutura do `public/index.html`, menu, CSS, dashboard ao vivo |
| T5 Dados | Afinação | schema (DDL nas APIs), `api/db.js`, `partitura/contratos/` |
| T6 Financeiro | Teclado | `api/financeiro.js`, faturamento, termos, CNAB, e-mail das 8h |

## Referências
- Stack, padrões e variáveis de ambiente: `partitura/stack.md`
- Produto, ICP e glossário: `partitura/produto.md`
- Contratos: `partitura/contratos/` (api, banco, eventos — inventário: `node scripts/bpm-inventario.mjs`)
- Trilhas ativas e Batida: `partitura/trilhas.md`
- Subagents: `.claude/agents/` (afinador, revisor, testador, documentador) · Comandos: `/bpm-nova-trilha`, `/bpm-batida`, `/bpm-mixagem`
