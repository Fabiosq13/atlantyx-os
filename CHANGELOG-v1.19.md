# Atlantyx OS · v1.19 — Importar Projetos/Marcos + Tela de Contratos (nova)

## 1. Importação de planilha em Projetos & Marcos
Botão "📁 Importar Planilha (Projetos, Marcos e Contratos)" na tela
Projetos & Marcos (e também na nova tela de Contratos). Lê o .xlsx no
navegador (SheetJS) e localiza automaticamente:
- Uma aba com colunas Projeto/Marco/Valor/Status → importa como MARCOS
- Uma aba com nº contrato/início/vencimento/prazo → importa como CONTRATOS
Não depende de nome fixo de aba nem de linha fixa — procura o cabeçalho
nas primeiras linhas de cada aba do arquivo.

### Marcos
- Projeto citado que ainda não existe no Atlantyx → CRIADO automaticamente
  (nome + GP responsável da planilha)
- Datas em português por extenso ("06 de junho de 2024.") e valores em
  R$ ("R$ 25.459,21") são convertidos automaticamente
- Status "Pago" → marco entra como Concluído; qualquer outro valor de
  status (ex. "Pendente Pagamento") → entra como Aguardando Pagamento;
  em branco → Aguardando Entrega
- Sem data de solicitação na planilha → usa a data de hoje e marca nas
  observações do marco para revisão manual (o campo é obrigatório)

Testado com o arquivo enviado: 18 marcos extraídos corretamente em 4
projetos (Ballpark, UC, Cadastro, Motriz), inclusive nomes de marco
longos e valores conferidos.

### Contratos
- Datas por extenso convertidas ("06 de junho de 2024." → 2024-06-06)
- "24 meses" → prazo em meses + texto original preservado
- Vincula ao projeto pelo nome, se existir

Testado com o arquivo enviado: 5 contratos extraídos corretamente
(Megalake, Transmissão, Sustentação Bigdata, Anaplan, XPLANN), datas de
início e vencimento certas.

## 2. Nova tela: Contratos (S1 · Financeiro → Contratos)
Não existia — criada do zero, alimentada pela importação (ou cadastro
manual com + Novo Contrato):
- KPIs: total, vigentes, vencendo (≤60 dias), vencidos
- Lista com número, projeto, início, vencimento, prazo e status
  calculado automaticamente pela data (🟢 Vigente / 🟡 Vencendo / 🔴
  Vencido / ⚪ Sem data), com dias restantes ou dias em atraso
- Badge no menu lateral mostrando quantos contratos precisam de atenção
  (vencendo + vencidos)
- Exclusão de contrato

## Backend
- Nova tabela contratos_financeiros
- Actions: marcos_importar, contrato_save, contrato_list, contrato_delete,
  contratos_importar

## Validação
Parser rodado com SheetJS de verdade (não mock) contra o arquivo
enviado: 18/18 marcos e 5/5 contratos extraídos com datas e valores
corretos. Fluxo completo em JSDOM: importar → tela de Contratos renderiza
KPIs e status coloridos corretamente. Árvore DOM: 73 páginas, 0
aninhadas, balanço de divs = 0. 0 erros JS.

## Arquivos
- api/financeiro.js (tabela + 5 actions)
- public/index.html (menu, tela Contratos, modal de importação, parsers)
