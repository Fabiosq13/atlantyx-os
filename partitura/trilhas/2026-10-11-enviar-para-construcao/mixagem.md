# Mixagem — Enviar para construção
ID: 2026-10-11-enviar-para-construcao · Commit direto do Maestro (v3.146)

## Gate 1 — automático
- [x] Sintaxe (validar.mjs) · VALIDAÇÃO OK
- [x] Regras: trilha de produto P-<pasta> só altera produtos/<pasta>/** (testado: Atlantyx bloqueado para a trilha do produto e vice-versa)

## Gate 2 — revisão
- Teste ponta a ponta (GitHub simulado): pré-requisitos, fundação → tarefa com BPM-Trilha/BPM-ID/BPM-Produto, bloqueio de item antes da fundação (409), item sem critério recusado, item → "Em desenvolvimento" e, ao mesclar, "Em QA (robôs)", pacote baixado pelo robô (path traversal bloqueado).

## Gate 3 — humano
- [ ] Fabio testa com o primeiro projeto real
