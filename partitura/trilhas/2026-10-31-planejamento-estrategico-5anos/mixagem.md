# Mixagem — Planejamento Estratégico: horizonte de 5 anos e trilha guiada
ID: 2026-10-31-planejamento-estrategico-5anos · PR: direto na main (v3.341 e v3.342), commit T1 separado para o aviso na Esteira

## Gate 1 — automático (CI "Gates B.P.M.")
- [x] Sintaxe (validar.mjs) · resultado: VALIDAÇÃO OK
- [x] Escopo da trilha · banco · versão · segredos (bpm-gates.mjs) · resultado: aprovado (avisos: arquivos novos sem dono em escopos.json — registrar na Batida)

## Gate 2 — agente revisor (subagent `revisor`)
Apontamentos:
- Esteira (public/demandas-ui.js) é da T1: alteração feita em commit separado com BPM-Trilha: T1, só leitura do aviso (não bloqueia nem muda a demanda).
- Rótulo do menu "Projeção 5 anos" e o campo "Visão 5 anos" no index.html (seções da Estratégia/Planejamento).
- Arquivos novos sem dono: lib/estrategia-roteiro.js e public/estrategia-trilha-ui.js (pedir à Batida para registrar na T3).

- v3.342: o exercício pessoal fica em est:norte_pessoal:<login> (chave por usuário) e só é lido para o próprio login; os prompts gerais recebem só o status do alinhamento e os acordos.

## Gate 3 — humano
- [x] Critérios de aceite das entregas 1 e 2 demonstrados (teste de lógica com 21 verificações + teste de tela com dados sintéticos)
- [x] O diff só toca arquivos do escopo (ou interseção registrada)
- [x] Sem contrato novo; sem DDL (só kv_store: est:roteiro, est:nao_fazer, est:revisao_calendario, est:orcamento_semestral)
- [x] Nenhum segredo, token ou dado de cliente no código ou nos testes
- [x] Nenhuma chamada externa nova envia dados; a IA só sugere, nada é salvo sem clique
- [x] Testes cobrem o caminho feliz e erros (validar fora de ordem, motores sem escolha, campos vazios)
- [ ] Testado em produção logo após o deploy (fundador)
