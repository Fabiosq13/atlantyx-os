# Atlantyx OS · v1.31 — Edição completa do termo no Kanban de Faturamento

## O que dá para editar agora
Botão **✎ Editar termo** no detalhe do termo, em qualquer fase:

**Cabeçalho:** projeto/serviço, contratante, período de medição, nº do
termo, parcela, fase, contratada/CNPJ, marco do projeto.

**Rateio entre empresas:** editar nome, contrato, centro de custo e
valor de cada empresa · **adicionar** empresa nova · **remover** empresa.
O total do termo é recalculado automaticamente pela soma do rateio.

Útil para corrigir uma importação que veio errada, ajustar um valor
renegociado ou incluir uma empresa que faltou — sem precisar excluir e
reimportar o termo (o que faria perder as notas já vinculadas).

## Proteções contra estrago
- **Empresa com nota fiscal vinculada não pode ser removida** — aparece
  com cadeado 🔒 na tabela, e o backend recusa a exclusão dizendo o nome
  da empresa. Para remover, tire a nota antes.
- **Aviso de divergência em tempo real**: se você mudar o valor e isso
  fizer o total desencontrar das notas já lançadas, aparece um alerta
  amarelo mostrando a diferença exata — antes de salvar.
- **Empresa sem nome bloqueia o salvamento** (evita linha fantasma no
  rateio).
- Campos do cabeçalho deixados em branco **não apagam** o valor atual.
- Após salvar, o sistema reconfere o total com as notas fiscais e
  atualiza o status (completo / divergente / pendente).

## Validação
Abertura com dados carregados; empresa com nota travada e sem nota
removível; recálculo do total ao editar valor e ao adicionar empresa
(R$ 109.208,00 → 111.458,90 → 121.458,90); aviso de divergência
aparecendo; empresa nova enviada sem id (para ser criada); bloqueio de
empresa sem nome.

## Arquivos
- api/faturamento.js · public/index.html
