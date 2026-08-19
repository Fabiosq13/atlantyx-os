# Atlantyx OS · v1.17 — Kanban de Faturamento (Termos → NF → Pagamento)

## Novo módulo: S1 · Financeiro → Kanban de Faturamento

### As 5 fases pedidas
📝 Elaboração do Termo → ✅ Aprovação → 🧾 Emissão de NF → 📧 Envio de NF →
💰 Pagamento (→ 🏁 Concluído automático quando tudo pago)

### 📝 Elaboração — Importar Termo de Faturamento
Botão "Importar Termo" lê o .xlsx no PRÓPRIO NAVEGADOR (SheetJS via CDN,
nada sobe pro servidor sem revisão) e extrai automaticamente:
- Cabeçalho: projeto, contratante, CNPJ, período de medição, nº do termo,
  parcela, fase, marco do projeto
- Tabela "Valores e Rateios entre as Empresas": localizada dinamicamente
  pela célula "EMPRESA" (não por linha fixa — funciona mesmo se o modelo
  tiver linhas extras antes), lendo até a linha "Total R$"
- Uma linha por empresa do rateio = uma nota fiscal esperada, no valor de
  "Valor desta Parcela (R$)"
Testado com os 4 modelos enviados (XPLANN, Anaplan, Projeto Cadastro,
Sustentação — este último com 9 empresas no rateio, R$ 32.731,68 no
total, valores conferidos linha a linha contra o "Total R$" da planilha).

### ✅ Aprovação
Botão Aprovar (registra quem aprovou e quando) → segue para Emissão de NF.
Botão Recusar volta para Elaboração.

### 🧾 Emissão de NF
Etapa de controle manual — confirma que as notas foram emitidas e segue
para Envio.

### 📧 Envio de NF — verificação automática do e-mail
Botão "Verificar e-mail (atlanteambr@gmail.com)": conecta via IMAP,
varre os últimos 45 dias, encontra anexos .xml (lê de verdade: número,
valor e chave da NFe via regex nos campos padrão) e .pdf (registra o
nome do arquivo), tenta casar cada nota com a empresa do rateio pelo
nome (emitente/destinatário do XML ou pelo nome do arquivo/assunto).
Some as notas encontradas e compara com o valor total do termo:
- ✅ Completo: soma bate (tolerância R$ 1) e todas as empresas têm nota
- ⚠ Divergente: falta nota ou o valor não bate → ALERTA por e-mail
  (Resend, para FINANCEIRO_EMAIL) + aviso na tela, automaticamente
- ℹ Pendente: nenhuma nota encontrada ainda
Toda empresa também pode ser marcada manualmente (✎) se o e-mail falhar
ou a nota tiver chegado por outro canal.

### 💰 Pagamento — verificação no QuickBooks
Botão "Verificar pagamento no QuickBooks": consulta Invoice quitadas
(Balance = 0) e casa por nome da empresa + valor aproximado (tolerância
2%) com a parcela esperada. Empresa confirmada = pago. Quando todas as
empresas do termo estão pagas, o termo move sozinho para Concluído.
Marcação manual (✎) também disponível.

## Setup necessário (para e-mail e pagamento funcionarem — o Kanban e a
## importação já funcionam sem nada disso)
1. E-mail: npm i imapflow (commitar) + Vercel env EMAIL_IMAP_USER=
   atlanteambr@gmail.com + EMAIL_IMAP_PASS=(senha de app do Gmail,
   myaccount.google.com/apppasswords, requer 2FA ativado) → Redeploy
2. Pagamento: reaproveita a conexão QuickBooks já configurada em
   S1 → Realizado QuickBooks (nada extra a fazer se já estiver conectado)
3. Alerta por e-mail: reaproveita RESEND_API_KEY/RESEND_FROM/
   FINANCEIRO_EMAIL já configurados

## Backend (novo arquivo)
api/faturamento.js — 3 tabelas (termos_faturamento, termos_empresas,
termos_notas_encontradas, criadas automaticamente), 12 actions.
vercel.json: maxDuration 60 para api/faturamento.js.

## Validação
Parser testado com SheetJS real (não mock) contra o arquivo de
Sustentação enviado: 9/9 empresas certas, soma exata. Fluxo completo em
JSDOM: importar → kanban → detalhe → aprovar → mudança de fase. Auditoria
de árvore DOM: 72 páginas, 0 aninhadas, balanço de divs = 0. 0 erros JS.

## Arquivos
- NOVO api/faturamento.js
- vercel.json (maxDuration)
- public/index.html (menu, página, modal, JS)
