# Atlantyx OS · v1.20.5 — PDF com detecção automática + múltiplas notas de uma vez

## O que mudou no card "📎 Carregar Notas Fiscais"
- **Múltiplos arquivos de uma vez**: seleciona vários PDFs/XMLs juntos (ou
  vai adicionando aos poucos — a fila acumula)
- **PDF agora também é lido automaticamente** (não só XML): usa PDF.js
  (carregado sob demanda, sem instalar nada) para extrair o texto do
  documento e tenta detectar:
  - Valor: procura rótulos comuns de DANFE ("Valor Total da Nota", "Valor
    Total"...) seguidos de um número em formato R$ — só preenche se achar
    um rótulo claro (não "chuta" o maior número do PDF, pra não errar
    valor de nota fiscal silenciosamente)
  - Número da NF: padrões comuns tipo "Nº ..." / "Número ..."
  - Empresa do rateio: procura o nome de cada empresa pendente no texto
    do PDF (ignora prefixos tipo "D001 - " no nome cadastrado)
- Cada arquivo processado vira uma **linha editável** na fila (número,
  valor, empresa — todos ajustáveis antes de confirmar), com selo
  "🤖 detectado" quando o sistema achou algo sozinho, ou "confira" quando
  não achou e precisa de preenchimento manual
- Mostra o **total da remessa** (soma de tudo que está na fila) antes de
  confirmar
- Um único botão **"+ Adicionar N nota(s)"** grava tudo de uma vez

## Validação (JSDOM)
2 arquivos (1 XML + 1 PDF simulado) selecionados juntos → ambos
processados, número/valor/empresa detectados corretamente em cada um
(inclusive casando o nome da empresa mesmo com código no cadastro, ex.
"D001 - CPFL Paulista") → fila mostra o total da remessa (R$ 71.609,08)
→ confirmação em lote grava as 2 notas de uma vez → fila esvazia. Árvore
DOM: 73 páginas, 0 aninhadas. 0 erros JS.

## Arquivo
- public/index.html
