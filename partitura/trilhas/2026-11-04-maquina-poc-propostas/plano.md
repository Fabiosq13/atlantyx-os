# Plano
- [x] lib/proposta-calc.js: imposto por ano da nota, créditos de CBS, inflação + dissídio, formato POC, piso/spread, competitividade e desconto limitado ao piso
- [x] api/vendas.js: impostos por ano (2026 16,33 / 2027 24), catálogo de escopos, extrair escopo de documento, gerar escopo de produto, capítulos de POC no redigir
- [x] vendas-ui.js: tipo de documento, POC (semanas, crédito, critérios), concorrente, escopo (upload/produto/edição), desconto, parâmetros e catálogo, PDF com logo e Montserrat
- [x] validar.mjs

## Interseções
- T6: alíquota 2027 do Financeiro (25%) continua no planejamento; propostas usam a própria tabela por ano.

## Registro da Batida
- 2026-11-04 · feito (v3.365) · sem bloqueio · próximo: fundador subir propostas ganhas no Aprendizado e cadastrar o catálogo de escopos; tarefa agendada em 16/12 confere a CBS definitiva
- 2026-11-04 · feito (v3.366) · sem bloqueio · briefing → escopo pela IA, escopo complementar (incluir/opcional/não usar), apresentação da solução em PPTX com cronograma (Gantt) e investimento; proposta escrita inclui complementar, opcionais e cronograma · próximo: reativar a IA e testar com um briefing real
- 2026-11-04 · feito (v3.367) · bloqueio: IA desligada/sem chave válida derruba estimar, briefing, complementar, redigir e PPTX · quadro "Pronto para gerar?" na proposta (IA, rate card, referências aprendidas), equipe pelo rate card sem IA, mensagens claras na análise e na sugestão do rate card · próximo: fundador religar a IA com chave nova
- 2026-11-04 · feito (v3.368) · IA ligada mas falhando: teste real da chave (ia_teste: chave válida? tem crédito?) no quadro Pronto para gerar · próximo: fundador ver a mensagem e trocar chave/crédito
- 2026-11-04 · feito (v3.369) · rate card: sem custo no RH e sem propostas aprendidas, a IA sugere custo de mercado para revisar; botão Anexar propostas de referência direto na tela da proposta · próximo: fundador anexar propostas e revisar/salvar o rate card
- 2026-11-04 · feito (v3.370) · apresentação PPTX redesenhada: fundos com gradiente e rede (canvas), agenda, layouts por tipo (cards, fluxo em etapas, checklist, riscos), Gantt reescrito (meses inteiros, entregas na coluna, faixa de marcos), investimento em destaque · próximo: fundador gerar com uma proposta real
- 2026-11-04 · feito (v3.371) · bloqueio: upload de propostas falhava sem mostrar o motivo (arquivo grande passa do limite de ~4,5 MB da Vercel ou erro da IA) · resultado por arquivo na tela (✅/❌ com o erro), arquivos acima de 3 MB têm o texto extraído no navegador (PDF via pdf.js, Word/Excel via JSZip), não consolida quando nada foi aprendido · próximo: fundador reenviar as 2 propostas
- 2026-11-04 · feito (v3.372) · rate card sugerido/editado não era salvo ao trocar de aba e a proposta não via: agora salva sozinho ao sair da aba e a proposta relê o rate card; botão Perfis do rate card no painel ②; envio de propostas continua e mostra o resultado ao voltar para a aba
