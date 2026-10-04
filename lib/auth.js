// lib/auth.js — v3.85 · Autenticação centralizada de TODAS as rotas /api/*
//
// Toda API é exportada como comGuarda(handler, 'nome') (lib/qa-guard.js), que chama requireAuth()
// ANTES do handler — ou seja, é a primeira coisa que roda em cada rota. Credenciais aceitas:
//   • cookie de sessão assinado atx_sessao (login em /api/auth — validado contra usuários/segredo no banco)
//   • Authorization: Bearer ${CRON_SECRET} (crons da Vercel e GitHub Actions)
//   • x-atx-interno (chamadas de uma API para outra, colocado automaticamente pela guarda)
// Rotas públicas por natureza (PUBLICAS) ficam abertas: login, health básico, captura de lead, mídia
// publicada, cartão digital, links de clique/descadastro, webhooks.
// v3.85: a guarda FALHA FECHADA — sem login configurado (ou com o banco fora do ar) as APIs internas
// respondem 401 em vez de ficarem abertas. O primeiro administrador é criado em /api/auth (público).
// CORS: as APIs internas nunca devolvem *; devolvem o domínio da aplicação (APP_DOMAIN / ATX_DOMINIO).
import { authAtiva, lerSessao, segredoAtual, carregar } from './acesso.js';
import crypto from 'node:crypto';

const hmac = t => crypto.createHmac('sha256', segredoAtual()).update(t).digest('base64url');
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
export function tokenInterno() { return hmac('interno:v1'); }

const _host = v => { try { return new URL(/^https?:/.test(v) ? v : 'https://' + v).host; } catch (_) { return null; } };
export function hostsProprios(hostReq) {
  const set = new Set([hostReq].filter(Boolean));
  for (const v of [process.env.APP_DOMAIN, process.env.MEDIA_PUBLIC_BASE, process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.ATX_DOMINIO])
    if (v) { const h = _host(v); if (h) set.add(h); }
  return set;
}
// origem para Access-Control-Allow-Origin: a do próprio site (se o pedido veio dele) ou o domínio da aplicação — nunca *
export function origemApp(req) {
  const h = req?.headers || {};
  const hostReq = h['x-forwarded-host'] || h.host;
  try { if (h.origin && hostsProprios(hostReq).has(new URL(h.origin).host)) return new URL(h.origin).origin; } catch (_) {}
  const d = process.env.APP_DOMAIN || process.env.ATX_DOMINIO || process.env.VERCEL_PROJECT_PRODUCTION_URL || hostReq || '';
  try { return new URL(/^https?:/.test(d) ? d : 'https://' + d).origin; } catch (_) { return 'null'; }
}

// rotas abertas por natureza (nome do arquivo da API → regra)
const q = (req, k) => { try { return new URL(req.url || '/', 'http://x').searchParams.get(k); } catch (_) { return req.query?.[k]; } };
export const PUBLICAS = {
  'lead-capture': () => true,                                         // página de captura (visitantes)
  'auth': () => true,                                                 // login / primeiro acesso
  'health': req => /^(GET|HEAD)$/.test(req.method) && q(req, 'full') !== '1', // status básico (o completo chama a IA → exige login ou cron)
  'media': req => /^(GET|HEAD)$/.test(req.method),                    // imagens publicadas (Metricool/Instagram baixam)
  'media-upload': req => /^(GET|HEAD)$/.test(req.method) && !q(req, 'status') && !q(req, 'check'), // arquivos publicados + proxy de imagem (restrito a imagem/vídeo)
  'media-upload-v1.10.3': req => /^(GET|HEAD)$/.test(req.method) && !q(req, 'proxy') && !q(req, 'status'),
  'campanha-disparo': req => req.method === 'GET' && !!(q(req, 'c') || q(req, 'o') || q(req, 'sair')), // clique, abertura, descadastro
  'prospeccao': req => req.method === 'GET' && !!(q(req, 'cartao') || q(req, 'vcard')), // cartão digital
  'apollo': req => q(req, 'webhook') === 'telefone',                  // webhook do Apollo (tem chave própria)
  'wa-response': req => req.method === 'POST' && (!process.env.ZAPI_WEBHOOK_TOKEN || q(req, 'token') === process.env.ZAPI_WEBHOOK_TOKEN), // webhook Z-API
};
function ehRotaCron(req, nome) {
  if (['rfp-monitor', 'followup-cron', 'briefing-cron'].includes(nome)) return true;
  if (nome === 'health') return q(req, 'full') === '1';
  if (nome === 'financeiro') return !!q(req, 'cron') || ['marcos_processar_alertas', 'relatorio_pagamentos'].includes(q(req, 'action'));
  return (nome === 'metricool' || nome === 'campanha-disparo' || nome === 'agente-ideias') && !!q(req, 'cron');
}

// checkSession: devolve o tipo de credencial ('preflight' | 'publica' | 'cron' | 'interna' | 'sessao') ou null
export async function checkSession(req, nome = '') {
  if (req.method === 'OPTIONS') return 'preflight';
  if (PUBLICAS[nome] && PUBLICAS[nome](req)) return 'publica';
  const h = req.headers || {};
  if (process.env.CRON_SECRET && igual(String(h.authorization || ''), 'Bearer ' + process.env.CRON_SECRET)) return 'cron';
  // sem CRON_SECRET a Vercel não manda credencial nos crons: só as rotas de cron, em GET, seguem funcionando
  if (!process.env.CRON_SECRET && req.method === 'GET' && /vercel-cron/i.test(String(h['user-agent'] || '')) && ehRotaCron(req, nome)) return 'cron';
  await carregar();
  if (h['x-atx-interno'] && segredoAtual() && igual(h['x-atx-interno'], tokenInterno())) return 'interna';
  if (!(await authAtiva())) return null; // v3.85: falha fechada (antes: 'aberta')
  const s = await lerSessao(req); if (s) { req.usuario = s.login; req.sessao = s; return 'sessao'; }
  return null;
}

// requireAuth: sem credencial responde 401 e devolve false; com credencial devolve o tipo dela
export async function requireAuth(req, res, nome = '') {
  const cred = await checkSession(req, nome);
  if (cred) return cred;
  res.statusCode = 401;
  if (typeof res.setHeader === 'function') { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); }
  const corpo = JSON.stringify({ success: false, exige_login: true, error: 'Acesso restrito — faça login no Atlantyx OS.' });
  if (typeof res.status === 'function') res.status(401).send(corpo); else res.end(corpo);
  return false;
}
