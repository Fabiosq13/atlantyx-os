# Atlantyx OS · v1.61 — A Receber e A Pagar: contagem trocada

## O que estava errado
A tela mostrava:
```
A RECEBER  R$ 0,00
           4 doc(s) QB · 0 Atlantyx
```
Contraditório: se há 4 documentos, o valor não pode ser zero.

**Causa:** o campo `qtd_qb` somava recebíveis **+** pagáveis num único
número, e a tela exibia esse total ao lado do "A Receber". Os 4
documentos eram na verdade as **contas a pagar** (R$ 21.017,33).

O valor R$ 0,00 estava correto — não há faturas a receber em aberto no
período. Só a contagem é que estava trocada.

## Correções
- Contagens **separadas**: "0 fatura(s) a receber" e "4 conta(s) a pagar"
- Destaque de **vencidos**: quando parte do total já venceu, aparece
  "⚠ R$ X já vencido(s)" em dourado. Um recebível vencido não é previsão
  de entrada — é cobrança atrasada, e misturar os dois distorce a leitura
- Aviso sobre o **filtro de conta**: faturas e contas em aberto não
  pertencem a uma conta bancária (o QuickBooks só sabe a conta quando o
  pagamento acontece). Então esses valores são sempre da empresa inteira,
  mesmo com uma conta filtrada — a tela agora explica isso, para o número
  não parecer inconsistente com o extrato filtrado

## Arquivos
- api/financeiro.js · public/index.html (ATX-v1.61)
