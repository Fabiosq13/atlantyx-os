# Atlantyx OS · v1.27 — FIX: múltiplas notas fiscais na mesma empresa não somavam

## O bug
Ao associar mais de uma nota fiscal à MESMA empresa do rateio, o sistema
aceitava (a nota aparecia na lista de anexos), mas o total do termo não
mudava — a segunda nota **sobrescrevia** a primeira em vez de somar.

## Causa
A soma era calculada a partir da tabela `termos_empresas`, que guarda
**um único valor por empresa** (campo nf_valor). Cada nota nova gravava
por cima da anterior. As notas ficavam registradas na tabela de notas,
mas essa tabela não era usada no cálculo.

Isso é um caso real e comum: uma empresa pode receber duas notas no mesmo
termo (serviço + material, ou uma nota complementar).

## Correção
- A soma passa a vir da tabela de **notas fiscais** (onde cada nota é um
  registro próprio) — todas entram na conta
- O valor mostrado por empresa vira a **soma das notas daquela empresa**,
  mantendo a tabela coerente com o total
- A **marcação manual** (botão ✎ na tabela) também passa a criar um
  registro de nota — antes ficava só no campo da empresa e podia ser
  sobrescrita, ficando fora da soma
- "Completo" agora exige que o valor bata (tolerância R$ 1) E que toda
  empresa tenha ao menos uma nota

## Validação (cenário exato do problema)
Termo de R$ 109.208,00 com 2 empresas:
- 1ª nota (CPFL Paulista): R$ 30.000,00 → soma R$ 30.000,00
- 2ª nota **na mesma empresa**: R$ 21.458,90 → soma **R$ 51.458,90** ✓
  (antes ficaria R$ 21.458,90)
- 3ª nota (2ª empresa): R$ 57.749,10 → total R$ 109.208,00, diferença
  R$ 0,00, status **completo** ✓
- Nota extra de R$ 500 → status volta para **divergente** ✓

## Arquivo
- api/faturamento.js
