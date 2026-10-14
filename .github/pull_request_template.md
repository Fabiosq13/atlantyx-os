<!-- Método B.P.M. — mantenha estas duas linhas (o CI e a Esteira leem): -->
BPM-Trilha: T?
BPM-ID: aaaa-mm-dd-slug

## O que muda e por quê
<!-- 2–5 linhas. Link da spec: partitura/trilhas/<ID>/spec.md -->

## Como testar
<!-- passos curtos, com a tela (ex.: S1 · Kanban de Faturamento) -->

## Checklist de Mixagem (gate humano — Engenheiro de Mixagem)
- [ ] Todos os critérios de aceite da spec.md estão atendidos e demonstrados
- [ ] O diff só toca arquivos do escopo da trilha (ou há interseção aprovada)
- [ ] Contratos alterados foram aprovados na Afinação e versionados
- [ ] Mudança de banco revisada pelo Afinador, aditiva e reversível
- [ ] Nenhum segredo, token ou dado de cliente no código ou nos logs
- [ ] Integrações externas: nenhuma chamada nova envia dados sem aprovação (Gmail de agentes = rascunho)
- [ ] Testes/validação cobrem o caminho feliz e pelo menos um erro
- [ ] Consigo explicar cada trecho do código
- [ ] plano.md e trilhas.md atualizados
- [ ] Testado no preview / em produção logo após o merge

<!-- Gates automáticos: "Gates B.P.M." (este PR) e, no merge pela Esteira, validar.mjs + bpm-gates de novo. Não altere a versão ATX-vX.YY. -->
