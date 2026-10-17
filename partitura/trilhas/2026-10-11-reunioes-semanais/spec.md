# Trilha: Reuniões Semanais (ritos com pauta automática)
ID: 2026-10-11-reunioes-semanais · Trilha permanente: T3 Agentes e Squads (interseções: T1 guarda/cron, T4 menu, T6 helper de e-mail) · Dono: Fabio · Status: aprovada
Aprovada por: Fabio (Compositor/PO) em 11/10/2026, na conversa.

## Problema
Projetos, ideias, funil e vendas não têm cadência fixa de reunião: a pauta é montada à mão (ou não é), os convites não existem e as decisões se perdem.

## Resultado esperado
Ritos semanais com dia e hora editáveis, convite de calendário por e-mail, pauta montada pelo sistema na véspera com os dados vivos, sala da reunião com batimento de cada assunto (tratado/adiado, decisão, dono, prazo), ata por IA e pendências que voltam na semana seguinte.

## Critérios de aceite
- [x] Quatro ritos padrão (seg 9h projetos, ter 9h funil e vendas, qua 16h ideias e produto, sex 16h ensaio geral desligado), todos editáveis
- [x] Convite por e-mail com .ics recorrente (RRULE semanal, fuso America/Sao_Paulo); mudar dia/hora/participantes avisa e reenvia com SEQUENCE maior; desligar envia cancelamento
- [x] Pauta montada das fontes: projetos (PMO), Esteira de Entrega, ideias, Esteira de Demandas/B.P.M., vendas, funil/semáforo comercial — fonte fora do ar não derruba a pauta
- [x] Cron 08:00 (Brasília) gera e envia a pauta na véspera (só ritos ativos, com convite enviado e pauta automática ligada)
- [x] Sala da reunião: videochamada, batimento por assunto, notas, ata por IA, envio da ata
- [x] Assuntos não tratados e ações com dono/prazo voltam na pauta seguinte

## Escopo de arquivos
Pode alterar: api/reunioes.js, public/reunioes-ui.js (T3) · interseções: lib/qa-guard.js (cron), vercel.json (cron/função), public/index.html (menu e página), api/financeiro.js (enviarEmailGmail aceita convite .ics)
Banco: tabelas novas reu_ritos e reu_reunioes (criadas pelo módulo, aditivas) — registrar no banco.md na próxima Afinação.

## Fora do escopo
Integração direta com a API do Google Calendar (o convite .ics por e-mail cobre o calendário de qualquer participante); gravação/transcrição automática da videochamada.
