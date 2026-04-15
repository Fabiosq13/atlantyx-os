# Atlantyx OS — Deploy no Vercel

## Estrutura do projeto

```
atlantyx-vercel/
├── api/
│   └── claude.js        ← Endpoint seguro (chave API fica aqui, no servidor)
├── public/
│   └── index.html       ← Painel de agentes S2 + S7
├── package.json
├── vercel.json
└── README.md
```

---

## Deploy em 5 passos — sem linha de comando

### Passo 1 — Criar conta no Vercel
Acesse https://vercel.com e clique em "Sign Up".
Use a opção "Continue with GitHub" (mais rápido).
Se não tiver GitHub, crie em https://github.com — é gratuito.

### Passo 2 — Fazer upload do projeto
Na dashboard do Vercel, clique em "Add New → Project".
Escolha "Upload" (não precisa de GitHub para começar).
Arraste a pasta `atlantyx-vercel` inteira para o campo de upload.
Clique em "Deploy".

O Vercel detecta automaticamente que é um projeto Node.js + static.
O deploy leva cerca de 30 segundos.

### Passo 3 — Configurar a chave da API Claude (OBRIGATÓRIO)
Após o deploy, vá em:
  Settings → Environment Variables

Adicione a variável:
  Nome:  ANTHROPIC_API_KEY
  Valor: sk-ant-... (sua chave da Anthropic)

Clique em "Save".

### Passo 4 — Fazer um novo deploy para aplicar a variável
Após salvar a variável de ambiente:
Vá em "Deployments" → clique nos 3 pontos do último deploy → "Redeploy".

### Passo 5 — Acessar o painel
O Vercel gera uma URL automática como:
  https://atlantyx-os-xyz.vercel.app

O painel está no ar. Todos os agentes funcionando.

---

## Conectar domínio próprio (opcional)

Para usar uma URL como painel.atlantyx.com.br:
1. Compre o domínio em https://registro.br (R$40/ano)
2. No Vercel: Settings → Domains → Add Domain
3. Digite: painel.atlantyx.com.br
4. Siga as instruções de DNS (o Vercel mostra o que configurar)
5. Em 5 minutos o domínio aponta para o painel

---

## Como funciona a segurança

O painel HTML (frontend) NÃO contém a chave da API Claude.
Quando o usuário clica em "Gerar Mensagem", o painel faz uma
requisição para /api/claude — que é um endpoint no servidor Vercel.
O servidor adiciona a chave e chama a API da Anthropic.
A chave nunca aparece no código do navegador.

---

## Variáveis de ambiente necessárias

| Variável            | Onde obter                              | Obrigatória |
|--------------------|-----------------------------------------|-------------|
| ANTHROPIC_API_KEY  | https://console.anthropic.com/api-keys  | Sim         |

---

## Custo mensal estimado

| Item               | Custo          |
|--------------------|----------------|
| Vercel (Hobby)     | R$0 (gratuito) |
| Domínio .com.br    | R$40/ano       |
| Claude API         | R$100–R$300/mês|

O plano Hobby do Vercel inclui 100GB de bandwidth e funções serverless
com até 100h de execução por mês — mais do que suficiente para começar.

---

## Próximos passos após o deploy

1. Testar o Gerador de WhatsApp (S2 → menu lateral)
2. Verificar que as mensagens estão sendo geradas pela IA
3. Configurar HubSpot (gratuito): https://app.hubspot.com
4. Solicitar WhatsApp Business API na Meta: https://business.facebook.com
5. Configurar o n8n para automação dos fluxos (próxima fase)

---

## Suporte
Em caso de erro no deploy, verificar:
- O arquivo vercel.json está na raiz da pasta
- A variável ANTHROPIC_API_KEY foi adicionada e o projeto foi re-deployado
- A pasta public/ contém o index.html
- A pasta api/ contém o claude.js
