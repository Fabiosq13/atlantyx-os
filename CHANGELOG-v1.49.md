# Atlantyx OS · v1.49 — O saldo errado tinha uma causa visível no seu print

## O erro no topo da tela explicava tudo
"ThrottleExceeded ... errorCode:003001 ... statusCode:429"

O QuickBooks **limita o número de requisições**. Quando esse limite é
atingido, a consulta falha — e o sistema simplesmente ignorava a falha,
montando o extrato com os dados que conseguiu. Resultado: lançamentos
faltando e saldo errado, sem nada indicando que os números eram parciais.

Na v1.48 eu piorei isso: dobrei o número de consultas (de 5 para 10
entidades) sem tratar o limite.

## Correções

### 1. Retry automático (a principal)
Consulta que falhar por throttle agora **espera e tenta de novo** — até 3
vezes, com pausas crescentes (1,2s → 3s → 6s). Também há uma pausa curta
entre as consultas, para não estourar o limite de saída.

Testado: uma consulta que falharia duas vezes agora tem sucesso na
terceira, em vez de ser perdida silenciosamente.

### 2. Falha nunca mais passa despercebida
Se mesmo com o retry algo falhar, aparece um aviso vermelho no topo da
tela: **"⛔ Dados incompletos nesta carga"**, explicando que os saldos
não são confiáveis e oferecendo um botão para tentar de novo.

Isso é mais importante que a correção em si: um saldo errado com cara de
certo é pior que um erro declarado.

### 3. "Saldo de hoje" agora respeita o período (seu ponto)
Quando o filtro termina numa data passada, o rótulo muda para **"Saldo no
fim do período"** — porque "hoje" não fazia sentido ali.

## O que fazer agora
Aplique e clique em Atualizar. Se o aviso vermelho aparecer, aguarde um
minuto e tente de novo (o limite do QuickBooks é por janela de tempo).
Com os dados completos, os saldos devem finalmente fechar.

## Arquivos
- api/financeiro.js · public/index.html
