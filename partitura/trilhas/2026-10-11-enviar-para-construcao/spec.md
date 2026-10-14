# Trilha: Enviar para construção (Esteira de Entrega → Claude)
ID: 2026-10-11-enviar-para-construcao · Trilha permanente: T1 Plataforma (com interseção na T4 — seção da tela S6 · Esteira de Entrega) · Dono: Fabio · Status: aprovada
Aprovada por: Fabio (Compositor/PO) em 11/10/2026, na conversa ("Sim, faça").

## Problema
A Esteira de Entrega especifica, acompanha e testa sistemas de clientes, mas a construção (G6) acontece fora — no Lovable ou pela equipe. Não há como mandar os requisitos aprovados (ERF/ERT/arquitetura) para o Claude construir com o Método B.P.M.

## Resultado esperado
Depois do G4, o fundador clica em "Enviar para construção": o Claude recebe a fundação do sistema e depois cada item do Kanban da fábrica como tarefa B.P.M., numa pasta própria do produto; os PRs passam pela Mixagem na Esteira de Demandas e o item volta para "Em QA (robôs)" no Kanban quando mesclado.

## Critérios de aceite
- [x] Aba "🏗 Construção" na Esteira de Entrega mostra os pré-requisitos (ERF, ERT e Arquitetura aprovados; backlog com itens) e só libera o envio quando atendidos
- [x] "Enviar fundação" cria uma demanda na Esteira de Demandas (trilha do produto P-<pasta>) e a tarefa @claude com BPM-Trilha, BPM-ID e BPM-Produto
- [x] Cada item do Kanban pode ser enviado ao Claude depois que a fundação estiver no ar; o item vai para "Em desenvolvimento" e, ao mesclar, para "Em QA (robôs)"
- [x] O robô do GitHub baixa os documentos aprovados para produtos/<pasta>/partitura/ antes do Claude começar
- [x] A trilha do produto só pode alterar produtos/<pasta>/** (hook + CI)
- [x] Os PRs do produto passam pelo mesmo checklist de Mixagem e gates da Esteira de Demandas
- [x] Limite de paralelismo da fase vale também para as trilhas de produto

## Escopo de arquivos (propriedade)
Pode alterar: api/fabrica.js, api/agente-ideias.js, lib/bpm.js, public/demandas-ui.js, .github/workflows/claude-correcao.yml (T1) · seção S6 · Esteira de Entrega em public/index.html
Só lê: partitura/contratos/**
Interseções previstas: nenhuma mudança de banco (estado da construção em kv_store, prefixo fab:construcao:)

## Fora do escopo
Criar repositório separado por cliente (exige token com permissão de administração — fica para uma próxima trilha); deploy automático do produto na Vercel; cadastro automático no QA de Produtos.
