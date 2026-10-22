// lib/fabrica-perfil.js — v3.238 · PERFIL DO SISTEMA (tipo de cada componente) e STACKS de referência da Esteira
// A esteira deixava de ser "um web app na Vercel": cada projeto declara os COMPONENTES que vai ter (front web, retaguarda
// com API e banco, aplicativo, rotinas de carga/ETL, integrações, API pública) e cada componente tem uma stack de
// referência — estrutura de pastas, comandos de teste e build, destino de publicação e checklist da fundação. Esse perfil
// entra em todos os geradores (ERF, ERT, arquitetura, modelo de dados/DDL, backlog por papel, planos de teste, guia de
// implantação) e no que o Claude recebe para construir. Guardado em kv_store 'fab:perfil:<projeto>' (sem DDL).

export const COMPONENTES = {
  web: { nome: 'Front-end web', papel: 'front', icone: '🖥' },
  backoffice: { nome: 'Retaguarda / painel administrativo', papel: 'back', icone: '🗂' },
  api: { nome: 'API / back-end', papel: 'back', icone: '🔌' },
  mobile: { nome: 'Aplicativo (celular)', papel: 'mobile', icone: '📱' },
  etl: { nome: 'Rotinas de carga / ETL / jobs agendados', papel: 'dados_etl', icone: '🔄' },
  integracao: { nome: 'Integrações (webhooks, filas, sistemas do cliente)', papel: 'integracao', icone: '🔗' },
  ia: { nome: 'Agente / módulo de IA', papel: 'back', icone: '🤖' },
};

// stack de referência por componente — a primeira de cada lista é o padrão
export const STACKS = {
  web: [
    { id: 'react-vite', nome: 'React + Vite (TypeScript), estático', deploy: 'Vercel (Root Directory = pasta do componente)', testes: 'npm test (Vitest + Testing Library)', build: 'npm run build',
      estrutura: 'src/{pages,components,services,hooks,styles}, src/services/api.ts com a URL da API por variável de ambiente',
      fundacao: ['Login/controle de acesso conforme a ERT', 'Layout base responsivo e navegação', 'Cliente HTTP da API com tratamento de erro e sessão', 'Página de erro e estado de carregamento', 'README com variáveis e publicação'] },
    { id: 'nextjs', nome: 'Next.js (App Router, TypeScript)', deploy: 'Vercel', testes: 'npm test (Vitest/Jest) + npm run lint', build: 'npm run build',
      estrutura: 'app/(rotas), components/, lib/, app/api/ só para BFF leve', fundacao: ['Autenticação e middleware de rotas protegidas', 'Layout base e navegação', 'BFF/chamadas à API', 'README'] },
  ],
  backoffice: [
    { id: 'react-admin-node', nome: 'Painel React (Vite) + API Node serverless + Postgres (Neon)', deploy: 'Vercel (front + api/ na mesma pasta)', testes: 'npm test (Vitest) para regras e API', build: 'npm run build',
      estrutura: 'web/ (telas de cadastro, listas com filtro/paginação, perfis e permissões), api/*.js (rotas REST), db/migrations/*.sql, db/seed.sql com dados SINTÉTICOS',
      fundacao: ['Login, perfis e permissões por tela/ação', 'CRUD base com listagem, filtro, paginação e auditoria (quem/quando)', 'Migrações SQL versionadas e seed sintético', 'Tratamento de erro padrão da API', 'README'] },
  ],
  api: [
    { id: 'node-serverless', nome: 'Node.js serverless (Vercel Functions) + Postgres (Neon)', deploy: 'Vercel', testes: 'npm test (Vitest/supertest) — contrato de cada rota', build: 'npm run build --if-present',
      estrutura: 'api/<recurso>.js, lib/{db,auth,validacao}.js, db/migrations/*.sql, openapi.yaml', fundacao: ['Autenticação (token/sessão) e autorização', 'Validação de entrada e erros padronizados', 'Migrações e conexão com o banco', 'openapi.yaml dos contratos', 'README'] },
    { id: 'node-express', nome: 'Node.js + Express (container)', deploy: 'Container (Railway/Render/Azure App Service) — Dockerfile', testes: 'npm test (supertest)', build: 'docker build',
      estrutura: 'src/{routes,services,repositories}, Dockerfile, db/migrations', fundacao: ['Dockerfile e healthcheck', 'Auth', 'Migrações', 'README'] },
  ],
  mobile: [
    { id: 'expo', nome: 'React Native + Expo (TypeScript)', deploy: 'Expo EAS Build (Android/iOS) + distribuição interna; lojas na entrega', testes: 'npm test (Jest + React Native Testing Library) e npx tsc --noEmit', build: 'npx expo export (verificação) / eas build',
      estrutura: 'app/ (expo-router), components/, services/api.ts, app.json, eas.json com perfis development/preview/production',
      fundacao: ['Navegação e telas base', 'Login e armazenamento seguro do token (expo-secure-store)', 'Cliente da API com URL por ambiente', 'eas.json com perfis', 'README com como rodar no Expo Go e gerar build'] },
  ],
  etl: [
    { id: 'node-jobs', nome: 'Jobs Node.js idempotentes (cron da Vercel ou GitHub Actions agendado)', deploy: 'vercel.json crons (até 60 s por execução) ou workflow schedule do GitHub Actions para cargas longas', testes: 'npm test (transformações com dados sintéticos) + npm run test:dados (reconciliação)', build: 'npm run build --if-present',
      estrutura: 'jobs/<carga>.js (extrair → transformar → carregar), lib/{fontes,destino,watermark}.js, db/migrations/*.sql (staging + destino), docs/mapeamento.md (origem → destino)',
      fundacao: ['Watermark/controle incremental e reprocessamento por período', 'Carga idempotente (rodar 2x não duplica)', 'Log de execução com contagens lidas/gravadas/rejeitadas', 'Reconciliação origem × destino', 'Alerta em falha', 'README com agenda e backfill'] },
    { id: 'python', nome: 'Python (pandas/SQLAlchemy) em GitHub Actions agendado', deploy: 'GitHub Actions schedule (ou Azure/Databricks job do cliente)', testes: 'pytest', build: 'pip install -r requirements.txt',
      estrutura: 'etl/<carga>.py, tests/, requirements.txt, .github/workflows/<carga>.yml', fundacao: ['Incremental + idempotente', 'Log e reconciliação', 'Alerta em falha', 'README'] },
  ],
  integracao: [
    { id: 'webhook-outbox', nome: 'Webhooks + outbox com retentativa (Node serverless)', deploy: 'Vercel', testes: 'npm test (contrato + falhas simuladas)', build: 'npm run build --if-present',
      estrutura: 'api/webhooks/<origem>.js, lib/outbox.js (fila em tabela + retentativa exponencial), docs/contratos.md', fundacao: ['Verificação de assinatura dos webhooks', 'Outbox com retentativa e fila de erro', 'Idempotência por chave do evento', 'README'] },
  ],
  ia: [
    { id: 'anthropic-node', nome: 'Agente com Claude (Anthropic API) em Node serverless', deploy: 'Vercel', testes: 'npm test + conjunto de avaliação (perguntas e respostas esperadas)', build: 'npm run build --if-present',
      estrutura: 'api/agente.js, lib/{prompts,ferramentas,guardrails}.js, avaliacao/*.json', fundacao: ['Prompt de sistema versionado', 'Guardrails e limites de custo/tempo', 'Registro de conversas sem dados sensíveis', 'Avaliação automatizada', 'README'] },
  ],
};

export const BANCOS = ['Postgres (Neon)', 'Postgres do cliente', 'SQL Server do cliente', 'Supabase', 'Sem banco próprio'];
export const AUTH = ['Login próprio (e-mail e senha) com perfis', 'SSO do cliente (Azure AD / Entra ID)', 'Google', 'Sem login (público)'];

export function perfilPadrao(tipos = ['web', 'api']) {
  const T = (Array.isArray(tipos) ? tipos : []).filter(t => COMPONENTES[t]);
  return { componentes: (T.length ? T : ['web', 'api']).map(t => ({ id: t, stack: STACKS[t][0].id })), banco: BANCOS[0], auth: AUTH[0], obs: '' };
}
export function perfilNormalizar(p) {
  const P = p && typeof p === 'object' ? p : {};
  const vistos = new Set();
  const comps = (Array.isArray(P.componentes) ? P.componentes : []).filter(c => c && COMPONENTES[c.id] && !vistos.has(c.id) && vistos.add(c.id))
    .map(c => ({ id: c.id, stack: STACKS[c.id].some(s => s.id === c.stack) ? c.stack : STACKS[c.id][0].id, obs: String(c.obs || '').substring(0, 400) }));
  return { componentes: comps, banco: String(P.banco || BANCOS[0]).substring(0, 80), auth: String(P.auth || AUTH[0]).substring(0, 80), obs: String(P.obs || '').substring(0, 1500), definido: comps.length > 0 };
}
export const stackDe = c => (STACKS[c.id] || []).find(s => s.id === c.stack) || (STACKS[c.id] || [])[0];
// pasta de cada componente dentro de produtos/<pasta>/ (um componente só = raiz)
export const subpasta = (perfil, c) => (perfil.componentes.length > 1 ? c.id : '');

// bloco de texto que entra nos prompts dos geradores e no pacote do Claude
export function perfilTexto(perfil, pasta) {
  const P = perfilNormalizar(perfil); if (!P.definido) return '';
  return ['PERFIL DO SISTEMA (componentes e stacks definidos na Esteira — siga):',
    ...P.componentes.map(c => { const s = stackDe(c), sp = subpasta(P, c);
      return `- ${COMPONENTES[c.id].icone} ${COMPONENTES[c.id].nome} [${c.id}] → ${s.nome}; pasta: produtos/${pasta || '<pasta>'}/${sp}${sp ? '/' : ''}; publicação: ${s.deploy}; testes: ${s.testes}; estrutura: ${s.estrutura}${c.obs ? '; observação: ' + c.obs : ''}`; }),
    `- Banco: ${P.banco} · Acesso: ${P.auth}${P.obs ? '\n- Observações do arquiteto: ' + P.obs : ''}`].join('\n');
}
export function perfilMd(perfil, pasta, nome) {
  const P = perfilNormalizar(perfil);
  return [`# Perfil do sistema — ${nome || ''}`, '', 'Componentes que este sistema tem e a stack de referência de cada um. Cada componente vive na sua subpasta e tem seus próprios testes e publicação.', '',
    '| Componente | Stack | Pasta | Publicação | Testes | Build |', '|---|---|---|---|---|---|',
    ...P.componentes.map(c => { const s = stackDe(c), sp = subpasta(P, c); return `| ${COMPONENTES[c.id].nome} | ${s.nome} | produtos/${pasta}/${sp} | ${s.deploy} | ${s.testes} | ${s.build} |`; }),
    '', `**Banco:** ${P.banco} · **Acesso:** ${P.auth}`, P.obs ? '\n**Observações:** ' + P.obs : '', '',
    ...P.componentes.flatMap(c => { const s = stackDe(c); return [`## ${COMPONENTES[c.id].icone} ${COMPONENTES[c.id].nome}`, '', `Estrutura: ${s.estrutura}`, '', 'Checklist da fundação:', ...s.fundacao.map(f => '- [ ] ' + f), '']; }),
    '## Regras para todos os componentes', '', '- Nenhum dado real de cliente no código, nos testes ou no seed — só dados sintéticos.', '- Segredos só em variáveis de ambiente (README lista apenas os NOMES).',
    '- Cada componente com `npm test` (ou `pytest`) passando e build sem erro — a CI do produto (`produto-ci.yml`) roda isso em todo PR.', '- Migrações SQL versionadas em `db/migrations/` (nunca alterar uma migração já aplicada).'].join('\n');
}
