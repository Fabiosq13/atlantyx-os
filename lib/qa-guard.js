// lib/qa-guard.js — v3.29 · Proteção de TODAS as APIs + guarda do QA em execução real
//
// AUTENTICAÇÃO (v3.29, SEC-001/003/008/009/011): ligada quando existem ATX_USUARIOS e ATX_SESSAO_SEGREDO
// no Vercel. Toda API exige uma destas credenciais:
//   • cookie de sessão assinado (login em /api/auth — tela de login do sistema)
//   • Authorization: Bearer ${CRON_SECRET} (crons da Vercel mandam sozinhos)
//   • x-atx-interno (chamadas de uma API para outra, colocado automaticamente aqui)
// Rotas públicas por natureza ficam abertas (captura de lead, imagens e vídeos publicados, cartão
// digital, links de clique/descadastro dos disparos, webhooks). Sem as variáveis, nada muda (aviso).
// CORS (SEC-005/007): Access-Control-Allow-Origin: * só nas rotas públicas; nas demais, só o próprio site.
//
// Guarda do QA em execução real (v3.28):
// Quando o Agente de QA executa as ações de verdade, cada requisição dele chega com o cabeçalho
// x-qa-real: 1. Durante ESSA requisição (e só nela — AsyncLocalStorage, não afeta requisições
// reais que rodem ao mesmo tempo), tudo o que sairia do sistema é controlado AQUI, no servidor:
//   • WhatsApp (Z-API send-*) → vai só para o telefone de teste (x-qa-fone); sem telefone → simulado
//   • E-mail (nodemailer)     → vai só para o e-mail de teste (x-qa-email); sem e-mail → simulado
//   • QuickBooks, HubSpot, Metricool, Apollo, PhantomBuster e qualquer outro serviço externo que
//     GRAVE (POST/PUT/PATCH/DELETE) → simulado (resposta fictícia marcada QA_SIMULADO)
//   • leituras (GET), banco Neon, IA (Anthropic, Ideogram, OpenAI) e o próprio sistema → normais
//     (chamadas ao próprio sistema levam o mesmo cabeçalho adiante)
// O que foi simulado/redirecionado volta no cabeçalho x-qa-simulado para o relatório do QA.
import { authAtiva as _authAtivaDb, lerSessao as _lerSessaoDb, segredoAtual, carregar as _carregarAcesso } from './acesso.js'; // v3.81
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

const als = new AsyncLocalStorage();
const LIVRES = /(^|\.)neon\.tech$|(^|\.)anthropic\.com$|(^|\.)ideogram\.ai$|(^|\.)openai\.com$|(^|\.)vercel-storage\.com$|(^|\.)blob\.vercel-storage\.com$/i;
// leituras feitas com POST em serviços externos (busca) — podem seguir
const POST_LEITURA = /hubapi\.com\/crm\/v3\/objects\/[a-z]+\/search|hubapi\.com\/crm\/v3\/objects\/[a-z]+\/batch\/read|quickbooks\.api\.intuit\.com\/v3\/company\/\d+\/query|oauth\.platform\.intuit\.com|appcenter\.intuit\.com/i;

let _instalado = false;
function instalar() {
  if (_instalado) return; _instalado = true;
  const orig = globalThis.fetch;
  globalThis.fetch = async function (input, init = {}) {
    const st = als.getStore();
    if (!st) return orig(input, init);
    const url = String(typeof input === 'string' ? input : input?.url || input);
    let u; try { u = new URL(url); } catch (_) { return orig(input, init); }
    const metodo = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    // chamadas ao próprio sistema: levam a credencial interna (e o modo QA, se for o caso).
    // x-atx-sem-credencial: 1 = sonda de segurança querendo ver o que um estranho vê
    if (hostsProprios(st.host).has(u.host)) {
      const h = new Headers(init.headers || (typeof input === 'object' && input?.headers) || {});
      if (h.get('x-atx-sem-credencial') === '1') { h.delete('x-atx-sem-credencial'); return orig(typeof input === 'string' ? input : url, { ...init, headers: h }); }
      if (segredoAtual()) h.set('x-atx-interno', tokenInterno());
      if (st.qa) { h.set('x-qa-real', '1'); if (st.fone) h.set('x-qa-fone', st.fone); if (st.email) h.set('x-qa-email', st.email); }
      return orig(typeof input === 'string' ? input : url, { ...init, headers: h });
    }
    if (!st.qa) return orig(input, init);
    if (metodo === 'GET' || metodo === 'HEAD' || LIVRES.test(u.hostname) || POST_LEITURA.test(url)) return orig(input, init);
    // WhatsApp (Z-API): redireciona para o telefone de teste
    if (/z-api\.io$/i.test(u.hostname) && /\/send-/.test(u.pathname)) {
      if (st.fone) {
        let corpo = {}; try { corpo = JSON.parse(init.body || '{}'); } catch (_) {}
        const de = corpo.phone; corpo.phone = st.fone;
        if (typeof corpo.message === 'string') corpo.message = '[QA → era para ' + String(de || '?').replace(/\d(?=\d{4})/g, '•') + '] ' + corpo.message;
        st.log.push({ tipo: 'whatsapp redirecionado', para: 'telefone de teste' });
        return orig(input, { ...init, body: JSON.stringify(corpo) });
      }
      st.log.push({ tipo: 'whatsapp simulado', motivo: 'sem telefone de teste' });
      return new Response(JSON.stringify({ zaapId: 'qa-simulado', messageId: 'qa-simulado', QA_SIMULADO: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // demais serviços externos que gravam: simulados
    st.log.push({ tipo: 'externo simulado', destino: u.hostname + u.pathname.substring(0, 60), metodo });
    return new Response(JSON.stringify({ QA_SIMULADO: true, success: true, id: 'qa-simulado', data: {}, results: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

let _nmPatch = false;
async function patchNodemailer() {
  if (_nmPatch) return; _nmPatch = true;
  try {
    const nm = (await import('nodemailer')).default;
    const criar = nm.createTransport.bind(nm);
    nm.createTransport = function (...a) {
      const t = criar(...a); const enviar = t.sendMail.bind(t);
      t.sendMail = async function (msg, cb) {
        const st = als.getStore();
        if (!st || !st.qa) return enviar(msg, cb);
        if (st.email) {
          const era = [msg.to, msg.cc, msg.bcc].flat().filter(Boolean).join(', ');
          st.log.push({ tipo: 'e-mail redirecionado', para: 'e-mail de teste' });
          return enviar({ ...msg, to: st.email, cc: undefined, bcc: undefined, subject: '[QA] ' + (msg.subject || ''),
            ...(msg.text ? { text: '[QA — destinatários originais: ' + String(era).replace(/(^|,\s*)[^@,\s]{2}[^@,\s]*@/g, '$1••@') + ']\n\n' + msg.text } : {}) }, cb);
        }
        st.log.push({ tipo: 'e-mail simulado', motivo: 'sem e-mail de teste' });
        const r = { messageId: 'qa-simulado', accepted: [], QA_SIMULADO: true }; if (cb) cb(null, r); return r;
      };
      return t;
    };
  } catch (_) {}
}

const limpa = (v, re) => { const s = String(v || '').trim(); return re.test(s) ? s : null; };

// ── autenticação ───────────────────────────────────────────────────────────
// v3.81: usuários, perfis e sessão vêm de lib/acesso.js (banco, com ATX_USUARIOS como legado)
const segredo = () => segredoAtual();
export async function authAtiva() { return _authAtivaDb(); }
const hmac = t => crypto.createHmac('sha256', segredo()).update(t).digest('base64url');
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
export function tokenInterno() { return hmac('interno:v1'); }
export async function lerSessao(req) { return _lerSessaoDb(req); }
function hostsProprios(hostReq) {
  const set = new Set([hostReq].filter(Boolean));
  for (const v of [process.env.MEDIA_PUBLIC_BASE, process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.ATX_DOMINIO])
    if (v) { try { set.add(new URL(/^https?:/.test(v) ? v : 'https://' + v).host); } catch (_) {} }
  return set;
}
// rotas abertas por natureza (nome do arquivo da API → regra)
const q = (req, k) => { try { return new URL(req.url || '/', 'http://x').searchParams.get(k); } catch (_) { return req.query?.[k]; } };
const PUBLICAS = {
  'lead-capture': () => true,                                         // página de captura (visitantes)
  'auth': () => true,                                                 // login
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
async function credencial(req, nome) {
  if (req.method === 'OPTIONS') return 'preflight';
  // v3.91: chamada DENTRO DO PROCESSO (uma API chamando o handler de outra, ex.: business-plan → financeiro)
  // durante uma requisição já autenticada: não vem da rede, herda a credencial. Antes, com o login ligado,
  // ela caía em "Acesso restrito" e o Business Plan ficava sem DRE/fluxo.
  if (als.getStore() && !Object.keys(req.headers || {}).length) return 'processo';
  if (PUBLICAS[nome] && PUBLICAS[nome](req)) return 'publica';
  const h = req.headers || {};
  if (process.env.CRON_SECRET && igual(String(h.authorization || ''), 'Bearer ' + process.env.CRON_SECRET)) return 'cron';
  // sem CRON_SECRET a Vercel não manda credencial nos crons: só as rotas de cron, em GET, seguem funcionando
  if (!process.env.CRON_SECRET && req.method === 'GET' && /vercel-cron/i.test(String(h['user-agent'] || '')) && ehRotaCron(req, nome)) return 'cron';
  await _carregarAcesso();
  if (!(await authAtiva())) return 'aberta';
  if (h['x-atx-interno'] && segredo() && igual(h['x-atx-interno'], tokenInterno())) return 'interna';
  const s = await lerSessao(req); if (s) { req.usuario = s.login; req.sessao = s; return 'sessao'; }
  return null;
}

export function comGuarda(handler, nome = '') {
  return async function (req, res) {
    const h = req?.headers || {};
    // CORS: * só nas rotas públicas; nas demais, só o próprio site (requisições de outro site não leem a resposta)
    const cred = await credencial(req, nome);
    if (res && typeof res.setHeader === 'function' && cred !== 'publica') {
      const set = res.setHeader.bind(res); const origem = h.origin;
      let permitida = null; try { if (origem && hostsProprios(h['x-forwarded-host'] || h.host).has(new URL(origem).host)) permitida = origem; } catch (_) {}
      res.setHeader = (k, v) => { if (String(k).toLowerCase() === 'access-control-allow-origin') { if (!permitida) return res; v = permitida; set('Vary', 'Origin'); } return set(k, v); };
    }
    if (!cred) {
      res.statusCode = 401;
      if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const corpo = JSON.stringify({ success: false, exige_login: true, error: 'Acesso restrito — faça login no Atlantyx OS.' });
      return typeof res.status === 'function' ? res.status(401).send(corpo) : res.end(corpo);
    }
    if (cred === 'processo') return handler(req, res); // mesmo contexto (QA/usuário) da requisição que chamou
    const qa = String(h['x-qa-real'] || '') === '1' && cred !== 'publica';
    instalar(); if (qa) await patchNodemailer();
    let fone = String(h['x-qa-fone'] || '').replace(/\D/g, '');
    if (fone.length === 10 || fone.length === 11) fone = '55' + fone;
    const st = { qa, host: h['x-forwarded-host'] || h.host || '', fone: qa && /^\d{12,15}$/.test(fone) ? fone : null,
      email: qa ? limpa(h['x-qa-email'], /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i) : null, log: [], usuario: req.usuario || null };
    if (qa) {
      // devolve o que foi simulado/redirecionado num cabeçalho, antes da resposta sair
      const marcar = () => { try { if (!res.headersSent && st.log.length) res.setHeader('x-qa-simulado', encodeURIComponent(JSON.stringify(st.log.slice(0, 20)))); } catch (_) {} };
      for (const m of ['json', 'send', 'end', 'redirect']) {
        if (typeof res?.[m] === 'function') { const o = res[m].bind(res); res[m] = (...a) => { marcar(); return o(...a); }; }
      }
    }
    return als.run(st, () => handler(req, res));
  };
}
export const _qaStore = () => als.getStore();
