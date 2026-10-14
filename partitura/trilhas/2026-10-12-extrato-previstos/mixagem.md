# Mixagem — <nome da trilha>
ID: <aaaa-mm-dd-slug> · PR: #<n>

## Gate 1 — automático (CI "Gates B.P.M.")
- [ ] Sintaxe (validar.mjs) · resultado: …
- [ ] Escopo da trilha · banco · versão · segredos (bpm-gates.mjs) · resultado: …

## Gate 2 — agente revisor (subagent `revisor`)
Apontamentos (o revisor não aprova, só aponta):
- …

## Gate 3 — humano (Engenheiro de Mixagem — na Esteira, botão "Aprovar e mesclar")
- [ ] Todos os critérios de aceite da spec.md atendidos e demonstrados
- [ ] O diff só toca arquivos do escopo da trilha (ou há interseção aprovada)
- [ ] Contratos alterados aprovados na Afinação e versionados
- [ ] Mudança de banco revisada pelo Afinador, aditiva e reversível
- [ ] Nenhum segredo, token ou dado de cliente no código ou nos logs
- [ ] Integrações externas: nenhuma chamada nova envia dados sem aprovação (Gmail de agentes = rascunho)
- [ ] Testes/validação cobrem o caminho feliz e pelo menos um erro
- [ ] Consigo explicar cada trecho do código
- [ ] plano.md e trilhas.md atualizados
- [ ] Testado no deploy de preview / em produção logo após o merge

## Mixagem v3.161
- Arquivo: public/index.html (seção Extrato). Sem banco, sem API nova.
- validar.mjs OK; teste de render OK.
