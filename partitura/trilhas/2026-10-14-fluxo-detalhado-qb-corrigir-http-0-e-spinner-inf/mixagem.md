# Mixagem — Fluxo Detalhado QB: HTTP 0 e spinner infinito
ID: 2026-10-14-fluxo-detalhado-qb-corrigir-http-0-e-spinner-inf · PR: (aberto a partir da issue #81)

## Gate 1 — automático (CI "Gates B.P.M.")
- [ ] Sintaxe (validar.mjs) · resultado: **não executado localmente** — o ambiente do robô (GitHub Action) negou permissão para rodar `node` (inclusive `node --check`). Conferência manual: as funções novas ficam no mesmo bloco `<script>` (linhas ~18699–32995) das que as usam; chaves/try/finally revisados. O CI "Gates B.P.M." roda `validar.mjs` no PR.
- [ ] Escopo da trilha · banco · versão · segredos (bpm-gates.mjs) · resultado: **não executado localmente** (mesmo motivo). Conferência manual: diff só em `api/financeiro.js` (T6), seção s3fluxodet do `public/index.html` e `partitura/trilhas/<ID>/**`; sem `CREATE/ALTER TABLE`; versão `ATX-vX.YY` intocada; nenhum segredo.

## Gate 2 — agente revisor (subagent `revisor`)
Apontamentos (o revisor não aprova, só aponta):
- Helper `lib/fetchRetry.js` sugerido na demanda não foi criado (fora do escopo T6) — helper `_fdFinApiComRetry` ficou na seção da tela; registrado em Interseções do plano.md.
- Formato de erro da API mantido como `{ success:false, error }` (contrato lido por todas as telas financeiras), em vez do `{ error:true, message }` citado na orientação.
- Timeout de 25s por requisição ao QB também vale para gravações (POST): se o QB demorar mais que isso, a tela recebe erro, mas a gravação pode ter ocorrido no QB — conferir antes de repetir.

## Gate 3 — humano (Engenheiro de Mixagem — na Esteira, botão "Aprovar e mesclar")
- [ ] Todos os critérios de aceite da spec.md atendidos e demonstrados
- [x] O diff só toca arquivos do escopo da trilha (ou há interseção aprovada)
- [x] Contratos alterados aprovados na Afinação e versionados (nenhum contrato alterado)
- [x] Mudança de banco revisada pelo Afinador, aditiva e reversível (sem mudança de banco)
- [x] Nenhum segredo, token ou dado de cliente no código ou nos logs
- [x] Integrações externas: nenhuma chamada nova envia dados sem aprovação
- [ ] Testes/validação cobrem o caminho feliz e pelo menos um erro (roteiro manual abaixo)
- [ ] Consigo explicar cada trecho do código
- [x] plano.md atualizado (trilhas.md é do Maestro)
- [ ] Testado no deploy de preview / em produção logo após o merge

### Roteiro de teste (preview)
1. Abrir S1 › Fluxo Detalhado: skeleton (blocos cinzas) nas tabelas e KPIs na hora; depois os dados.
2. Clicar "↻ Atualizar" várias vezes seguidas: botão fica "⏳ Atualizando…", volta ao normal, sem erro e sem resposta antiga sobrescrevendo a nova.
3. DevTools › Network › Offline e clicar Atualizar: Log mostra "HTTP 0 (rede) — nova tentativa em 2s/4s/8s"; em ≤15s aparece "⛔ Não foi possível carregar os dados — Sem conexão com o servidor (HTTP 0…)" com "↻ Tentar novamente" (ou "⚠ Dados de [data/hora]" se houver carga anterior salva). Nenhum skeleton/spinner fica girando.
4. DevTools › Network › throttling "Slow 3G" (ou servidor lento): após 15s, erro "Tempo esgotado…" com botão de retry.
5. Voltar Online e clicar "↻ Tentar novamente": carrega normalmente.
