# Atlantyx OS · v1.56 — Parando de adivinhar o formato do relatório

## Reconhecendo o problema
Você tem razão: o razão continuou furado. Passei duas versões tentando
adivinhar o layout do relatório do QuickBooks às cegas — valores vazios,
movimento sem sentido, saldos em branco. Isso não vai se resolver por
tentativa e erro.

## Duas mudanças

### 1. Fonte confiável para o saldo na data (o que você precisa)
O card principal agora mostra **"Saldo em 01/08"** vindo do **Balanço
Patrimonial** do QuickBooks — um relatório que devolve **um número por
conta**, sem depender de interpretar linhas de tabela.

É a resposta direta para a sua pergunta ("qual era o saldo do Itaú em
01/08?"), e não passa pelo parsing frágil que vinha falhando.

### 2. Diagnóstico da estrutura real
Se o razão vier sem valores, aparece um aviso explícito e um botão
**"🔧 Ver estrutura bruta do relatório"**, que mostra exatamente o JSON
que o seu QuickBooks devolveu: nomes das colunas, tipos, e as primeiras
linhas cruas.

**Com esse conteúdo eu mapeio o formato correto de uma vez** — em vez de
continuar chutando. É rápido: abrir, copiar e me enviar.

## O que fazer
1. Aplique e abra o **📜 Razão da conta** com a conta Itaú, período 01/08
2. Anote o **"Saldo em 01/08"** (card verde) — esse é o número oficial
3. Se o aviso vermelho aparecer, abra "🔧 Ver estrutura bruta" e me envie
   o conteúdo

Com o saldo oficial em mãos, comparo com o -R$ 129.502,67 que o Atlantyx
calcula e ajusto a fonte do saldo inicial de vez.

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.56)
