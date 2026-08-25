# Atlantyx OS · v1.25 — Remessa de Pagamentos CNAB 240 (Itaú)

## ⚠ LEIA ANTES DE USAR EM PRODUÇÃO
Todo arquivo CNAB precisa passar por **homologação com o banco**. Gere um
arquivo de teste, suba no internet banking do Itaú e valide ANTES de
confiar no fluxo com dinheiro real. O Itaú tem particularidades por
convênio/modalidade que só aparecem na validação real.

## O que faz
Gera o arquivo de pagamentos em lote (padrão FEBRABAN 240 / Itaú SISPAG)
para você subir no internet banking. **Você continua aprovando cada
pagamento no banco** — o sistema só monta o arquivo, não movimenta
dinheiro. Essa separação é proposital.

Formas suportadas (lotes separados automaticamente, como o banco exige):
- **41** TED (outro banco) · **01** Crédito em conta (Itaú) · **30** Boleto
  (código de barras, Segmento J)

## Tela: S1 · Financeiro → Remessa de Pagamentos
- Lista os pagamentos pendentes com checkbox e total da seleção
- Quem tem dados bancários completos aparece "✓ pronto"; quem não tem fica
  **desabilitado** com botão "⚠ completar" mostrando exatamente o que falta
- Modal para cadastrar banco/agência/conta/CNPJ (ou código de barras, se
  boleto) — os dados ficam salvos no fornecedor da despesa
- Botão gera e **baixa o arquivo .REM**; histórico de remessas permite
  baixar de novo

## Proteções contra erro caro
- **Validação de 240 caracteres por linha**: se qualquer registro sair com
  largura errada, a geração é abortada com erro claro (arquivo torto seria
  rejeitado pelo banco ou, pior, mal interpretado)
- **Bloqueio de dados incompletos**: não gera arquivo se algum pagamento
  selecionado estiver sem CNPJ, banco, agência ou conta — dizendo qual
  falta em qual pagamento
- **Acentos removidos automaticamente** (CNAB não aceita) e valores
  convertidos para centavos sem separador
- Numeração sequencial de remessa (NSA) controlada pelo banco de dados

## Configuração necessária (uma vez, no Vercel)
CNAB_EMPRESA_CNPJ · CNAB_EMPRESA_NOME · CNAB_AGENCIA · CNAB_CONTA ·
CNAB_CONTA_DAC — dados da conta Itaú que vai pagar. A tela avisa em
vermelho se faltar algum.

## Validação feita
- As 6 estruturas (header arquivo, header lote, segmento A, segmento J,
  trailer lote, trailer arquivo) com **exatamente 240 caracteres** —
  encontrei e corrigi 3 registros com largura errada durante o
  desenvolvimento (segmento A estava com 267)
- Arquivo completo gerado com 2 pagamentos em formas diferentes:
  estrutura de registros `0 1 3 5 1 3 5 9` correta, lotes separados por
  forma de pagamento, campos nas posições certas (banco, nome, data,
  moeda BRL, valor em centavos conferidos)
- Bloqueio funcionando quando há pagamento sem dados bancários
- Tela: seleção, total, download, modal de dados bancários

## Arquivos
- NOVO api/cnab.js
- vercel.json
- public/index.html
