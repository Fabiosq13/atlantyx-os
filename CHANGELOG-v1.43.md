# Atlantyx OS · v1.43 — Resposta ao report técnico de Marketing

Auditei cada item no código. **Dois eram bugs reais e foram corrigidos.
Dois tinham diagnóstico errado** — explico abaixo, porque seguir a
sugestão do report levaria a caçar um problema que não existe.

## ✅ CORRIGIDOS

### Itens 1 e 2 — canal vazio e canal "?" (confirmados)
O código gravava `camp.canal || ''` sem validação nenhuma. Campanha podia
ser aprovada e ativada com canal vazio ou com lixo.

- Agora existe **enum de canais válidos** (LinkedIn, Instagram, Facebook,
  Google Ads, E-mail, WhatsApp, Todos os canais)
- **Aprovar/ativar sem canal válido é bloqueado** com mensagem clara.
  Rascunho ainda pode ficar sem canal — é onde faz sentido
- Valor inválido não é mais gravado

### Item 6 — "Todos os canais" (verificado)
É um valor legítimo e tratado; entrou no enum. Não é string solta.

### Novo: 🔧 Auditar campanhas
Botão no Gerente de Marketing IA. Lista as campanhas com canal vazio ou
inválido, separadas por gravidade, e permite **corrigir o canal ali
mesmo** — resolve o item 1 do checklist ("identificar campanha com canal
? e corrigir dado") sem precisar mexer no banco.

## ⚠ DIAGNÓSTICOS INCORRETOS DO REPORT

### Item 3 — "funil zerado = quebra na pipeline de dados"
O report sugere investigar webhook, consumer, fila e erro silencioso.
**Nada disso existe no sistema.** O funil (kpis_diarios) é alimentado
por **digitação manual** na tela KPIs Marketing — não há captura
automática de eventos de campanha.

Funil zerado significa que **ninguém preencheu os números**, não que há
falha técnica. Se a intenção é capturar eventos automaticamente, isso
precisa ser construído (não existe hoje).

### Item 4 — "algoritmo de scoring travado / cron parado"
Não existe cron de scoring, e o algoritmo está correto — ele roda no
momento da captura do lead.

**A causa real:** o scoring dá 40 dos 100 pontos para o CARGO e 20 para
o TELEFONE. Se o formulário não captura esses campos (é o caso), o
máximo possível é 40 pontos = **sempre C**, matematicamente.

**Corrigido de duas formas:**
1. O score agora é **proporcional ao que foi possível avaliar** — leads
   passam a se diferenciar (A/B/C) mesmo com dados incompletos
2. Cada lead carrega `score_confiavel: false` e um aviso quando o cargo
   não foi capturado, além da lista de critérios aplicados

**Mas a solução de verdade é adicionar cargo e telefone ao formulário** —
sem isso, o critério de maior peso continua sendo um chute.

## 🔍 ITENS 5 e 7 (investigar)
- **Auto-campanhas**: são geradas pela função de auto-campanha do próprio
  sistema (S2), acionada manualmente por um humano na tela. Não é bug nem
  trigger automático — mas o nome genérico atrapalha, vale renomear ao criar
- **9 rascunhos nunca ativados**: não há timeout nem expiração no código;
  são campanhas que ficaram pelo caminho mesmo

## Arquivos
- api/db.js · api/lead-capture.js · public/index.html
