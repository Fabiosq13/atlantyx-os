#!/usr/bin/env node
// deploy.js — Publicação automática do Atlantyx OS no Vercel
// Uso: node deploy.js
// Faz: lê os arquivos locais → sobe no GitHub via API → Vercel deploya automaticamente

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CONFIGURAÇÃO — preencha uma vez ──────────────────────────────────────────
const CONFIG = {
  github_token:  process.env.GITHUB_TOKEN  || '',   // github.com → Settings → Developer settings → Tokens
  github_owner:  process.env.GITHUB_OWNER  || '',   // seu usuário GitHub (ex: Fabiosq13)
  github_repo:   process.env.GITHUB_REPO   || 'atlantyx-os',
  github_branch: process.env.GITHUB_BRANCH || 'main',
};

// ── ARQUIVOS A PUBLICAR ───────────────────────────────────────────────────────
const ARQUIVOS = [
  { local: 'public/index.html',         remoto: 'public/index.html' },
  { local: 'api/claude.js',             remoto: 'api/claude.js' },
  { local: 'api/lead-capture.js',       remoto: 'api/lead-capture.js' },
  { local: 'api/wa-response.js',        remoto: 'api/wa-response.js' },
  { local: 'api/wa-batch-generate.js',  remoto: 'api/wa-batch-generate.js' },
  { local: 'api/outreach-batch.js',     remoto: 'api/outreach-batch.js' },
  { local: 'api/prospect-scan.js',      remoto: 'api/prospect-scan.js' },
  { local: 'api/decisor-map.js',        remoto: 'api/decisor-map.js' },
  { local: 'api/meeting-schedule.js',   remoto: 'api/meeting-schedule.js' },
  { local: 'api/rfp-monitor.js',        remoto: 'api/rfp-monitor.js' },
  { local: 'api/followup-cron.js',      remoto: 'api/followup-cron.js' },
  { local: 'api/briefing-cron.js',      remoto: 'api/briefing-cron.js' },
  { local: 'api/portal-cadastro.js',    remoto: 'api/portal-cadastro.js' },
  { local: 'api/analytics.js',          remoto: 'api/analytics.js' },
  { local: 'api/s1-strategy.js',        remoto: 'api/s1-strategy.js' },
  { local: 'api/s1-intel.js',           remoto: 'api/s1-intel.js' },
  { local: 'api/email-intel.js',        remoto: 'api/email-intel.js' },
  { local: 'vercel.json',               remoto: 'vercel.json' },
  { local: 'package.json',              remoto: 'package.json' },
];

// ── FUNÇÕES GITHUB API ────────────────────────────────────────────────────────
async function githubRequest(path, method = 'GET', body = null) {
  const url = `https://api.github.com/repos/${CONFIG.github_owner}/${CONFIG.github_repo}${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${CONFIG.github_token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok && r.status !== 404) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`GitHub API ${method} ${path}: ${r.status} — ${err.message || r.statusText}`);
  }
  return r.status === 404 ? null : r.json();
}

async function getSha(remotePath) {
  try {
    const data = await githubRequest(`/contents/${remotePath}?ref=${CONFIG.github_branch}`);
    return data?.sha || null;
  } catch { return null; }
}

async function upsertFile(localPath, remotePath, mensagem) {
  const conteudo = fs.readFileSync(localPath, 'utf-8');
  const conteudoBase64 = Buffer.from(conteudo).toString('base64');
  const sha = await getSha(remotePath);

  const body = {
    message: mensagem,
    content: conteudoBase64,
    branch: CONFIG.github_branch,
  };
  if (sha) body.sha = sha; // necessário para atualizar arquivo existente

  await githubRequest(`/contents/${remotePath}`, 'PUT', body);
}

// ── DEPLOY PRINCIPAL ──────────────────────────────────────────────────────────
async function deploy() {
  console.log('\n🚀 Atlantyx OS — Deploy Automático');
  console.log('═'.repeat(50));

  // Validar config
  if (!CONFIG.github_token || !CONFIG.github_owner) {
    console.error('\n❌ Configure as variáveis de ambiente:');
    console.error('   export GITHUB_TOKEN=ghp_...');
    console.error('   export GITHUB_OWNER=SeuUsuario');
    console.error('\nOu crie um arquivo .env com esses valores.\n');
    process.exit(1);
  }

  // Verificar arquivos locais
  const base = path.join(__dirname);
  const faltando = ARQUIVOS.filter(f => !fs.existsSync(path.join(base, f.local)));
  if (faltando.length) {
    console.warn(`⚠  Arquivos não encontrados (serão ignorados):`);
    faltando.forEach(f => console.warn(`   ${f.local}`));
  }
  const existentes = ARQUIVOS.filter(f => fs.existsSync(path.join(base, f.local)));

  console.log(`\n📁 ${existentes.length} arquivos para publicar`);
  console.log(`📦 Repositório: ${CONFIG.github_owner}/${CONFIG.github_repo}`);
  console.log(`🌿 Branch: ${CONFIG.github_branch}\n`);

  const timestamp = new Date().toLocaleString('pt-BR');
  let ok = 0, erro = 0;

  for (const arquivo of existentes) {
    const local = path.join(base, arquivo.local);
    try {
      process.stdout.write(`   ↑ ${arquivo.remoto.padEnd(35)} `);
      await upsertFile(local, arquivo.remoto, `[Atlantyx OS] Deploy automático — ${arquivo.remoto} — ${timestamp}`);
      console.log('✓');
      ok++;
    } catch (e) {
      console.log(`✗  ${e.message}`);
      erro++;
    }
    // Delay pequeno para não throttle a API do GitHub
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ ${ok} arquivos publicados | ❌ ${erro} erros`);

  if (ok > 0) {
    console.log('\n⚡ Vercel detectou o push — deploy em andamento...');
    console.log(`🌐 Acompanhe em: https://vercel.com/${CONFIG.github_owner}/atlantyx-os`);
    console.log(`🔗 URL do painel: https://seu-projeto.vercel.app\n`);
  }
}

deploy().catch(e => {
  console.error('\n❌ Erro fatal:', e.message);
  process.exit(1);
});
