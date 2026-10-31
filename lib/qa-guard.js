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

// v3.345: CHAVE GERAL DA IA — o fundador pediu para parar TODO consumo de tokens do Atlantyx OS. Toda chamada a provedor
// de IA (Claude, OpenAI, Gemini, Ideogram…) passa por aqui e é recusada enquanto a IA estiver DESLIGADA (padrão: desligada,
// até o fundador religar em "IA · desligada" na barra lateral). Estado no kv_store 'sistema:ia' ({ ligada, em, por }).
export const IA_HOSTS = /(^|\.)anthropic\.com$|(^|\.)openai\.com$|generativelanguage\.googleapis\.com$|aiplatform\.googleapis\.com$|(^|\.)ideogram\.ai$|(^|\.)groq\.com$|(^|\.)elevenlabs\.io$|(^|\.)replicate\.com$|(^|\.)mistral\.ai$|(^|\.)perplexity\.ai$|(^|\.)cohere\.(ai|com)$|(^|\.)together\.xyz$|(^|\.)deepseek\.com$/i;
let _ia = { em: 0, ligada: false, por: null, desde: null };
async function _iaSql() { const { neon } = await import('@neondatabase/serverless'); return neon(process.env.DATABASE_URL); }
export async function iaEstado(forcar) {
  if (!forcar && Date.now() - _ia.em < 20000) return _ia;
  try { const sql = await _iaSql(); const r = (await sql`SELECT value FROM kv_store WHERE key='sistema:ia'`)[0]; const v = r ? (typeof r.value === 'string' ? JSON.parse(r.value) : r.value) : null;
    _ia = { em: Date.now(), ligada: v?.ligada === true, por: v?.por || null, desde: v?.em || null }; }
  catch (_) { _ia = { em: Date.now(), ligada: false, por: null, desde: null, erro: true }; } // sem conseguir ler o estado: fica desligada (não gasta)
  return _ia;
}
export async function iaDefinir(ligada, por) {
  const sql = await _iaSql(), v = { ligada: !!ligada, em: new Date().toISOString(), por: por || null };
  await sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('sistema:ia', ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
  _ia = { em: Date.now(), ligada: v.ligada, por: v.por, desde: v.em }; return _ia;
}
const _iaRecusa = host => new Response(JSON.stringify({ type: 'error', error: { type: 'ia_desligada', message: 'IA desligada no Atlantyx OS (consumo de tokens parado pelo fundador). Religue em "IA · desligada" na barra lateral.' }, ia_desligada: true, host }),
  { status: 503, headers: { 'Content-Type': 'application/json' } });

// v3.347: LOG DE USO DA IA — cada chamada que devolve "usage" é somada por dia, provedor, modelo e origem (tela/rotina).
// Linha atômica no kv_store: chave 'ia:uso:AAAA-MM-DD|provedor|modelo|origem' → {n,in,out,cw,cr}. Custo é ESTIMATIVA (tabela abaixo).
const _IA_TOK = /(^|\.)anthropic\.com$|(^|\.)openai\.com$|generativelanguage\.googleapis\.com$/i;
// US$ por 1 milhão de tokens [entrada, saída]. Opus 5.x assumido igual ao Opus 4.5; sem preço cadastrado = custo "n/d" (conta só os tokens).
const _PRECOS = [[/opus-4-5|opus-5/i, 5, 25], [/opus/i, 15, 75], [/sonnet/i, 3, 15], [/haiku-4/i, 1, 5], [/haiku/i, 0.8, 4]];
const _preco = (prov, modelo) => { if (prov !== 'anthropic') return null; const p = _PRECOS.find(x => x[0].test(String(modelo))); return p ? [p[1], p[2]] : null; };
const _diaSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
function _iaUsoLer(host, d) {
  if (!d || typeof d !== 'object') return null;
  if (/anthropic/i.test(host) && d.usage) { const u = d.usage; return { prov: 'anthropic', modelo: d.model || '?', in: u.input_tokens | 0, out: u.output_tokens | 0, cw: u.cache_creation_input_tokens | 0, cr: u.cache_read_input_tokens | 0 }; }
  if (/openai/i.test(host) && d.usage) return { prov: 'openai', modelo: d.model || '?', in: d.usage.prompt_tokens | 0, out: d.usage.completion_tokens | 0, cw: 0, cr: 0 };
  if (/generativelanguage/i.test(host) && d.usageMetadata) return { prov: 'gemini', modelo: d.modelVersion || 'gemini', in: d.usageMetadata.promptTokenCount | 0, out: d.usageMetadata.candidatesTokenCount | 0, cw: 0, cr: 0 };
  return null;
}
async function _iaUsoGravar(origem, r) {
  const sql = await _iaSql(), k = 'ia:uso:' + _diaSP() + '|' + r.prov + '|' + String(r.modelo).slice(0, 60) + '|' + String(origem).slice(0, 80);
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify({ n: 1, in: r.in, out: r.out, cw: r.cw, cr: r.cr })}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = jsonb_build_object(
      'n', COALESCE((kv_store.value::jsonb->>'n')::bigint, 0) + 1,
      'in', COALESCE((kv_store.value::jsonb->>'in')::bigint, 0) + ${r.in}::bigint,
      'out', COALESCE((kv_store.value::jsonb->>'out')::bigint, 0) + ${r.out}::bigint,
      'cw', COALESCE((kv_store.value::jsonb->>'cw')::bigint, 0) + ${r.cw}::bigint,
      'cr', COALESCE((kv_store.value::jsonb->>'cr')::bigint, 0) + ${r.cr}::bigint)::text, updated_at = NOW()`;
}
async function _iaMedir(origFetch, input, init, u, st) {
  const r = await origFetch(input, init);
  try {
    if (!r.ok || !/json/i.test(String(r.headers.get('content-type') || ''))) return r; // streaming/erro: não mede
    const us = _iaUsoLer(u.hostname, await r.clone().json());
    if (us) await _iaUsoGravar(st?.origem || 'fora de requisição', us);
  } catch (_) {}
  return r;
}
export async function iaUsoResumo(mes) {
  const sql = await _iaSql(), m = /^\d{4}-\d{2}$/.test(String(mes || '')) ? mes : _diaSP().slice(0, 7);
  const rows = await sql`SELECT key, value FROM kv_store WHERE key LIKE ${'ia:uso:' + m + '-%'}`;
  const meses = (await sql`SELECT DISTINCT substr(key, 8, 7) AS m FROM kv_store WHERE key LIKE 'ia:uso:%' ORDER BY 1 DESC`).map(x => x.m);
  const T = { chamadas: 0, in: 0, out: 0, cw: 0, cr: 0, custo: 0, parcial: false }, mod = {}, ori = {}, dia = {};
  const soma = (o, k, x, c) => { const a = o[k] || (o[k] = { n: 0, in: 0, out: 0, cw: 0, cr: 0, custo: 0, parcial: false }); a.n += x.n; a.in += x.in; a.out += x.out; a.cw += x.cw; a.cr += x.cr; if (c == null) a.parcial = true; else a.custo += c; };
  for (const r of rows) {
    const [d, prov, modelo, ...o] = r.key.slice(7).split('|'); let v; try { v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { continue; }
    const x = { n: +v.n || 0, in: +v.in || 0, out: +v.out || 0, cw: +v.cw || 0, cr: +v.cr || 0 }, p = _preco(prov, modelo);
    const c = p ? (x.in * p[0] + x.out * p[1] + x.cw * p[0] * 1.25 + x.cr * p[0] * 0.1) / 1e6 : null;
    T.chamadas += x.n; T.in += x.in; T.out += x.out; T.cw += x.cw; T.cr += x.cr; if (c == null) T.parcial = true; else T.custo += c;
    soma(mod, prov + ' · ' + modelo, x, c); soma(ori, o.join('|') || '?', x, c); soma(dia, d, x, c);
  }
  const lista = (o, ch) => Object.entries(o).map(([k, a]) => ({ [ch]: k, ...a })).sort((a, b) => b.custo - a.custo || (b.in + b.out) - (a.in + a.out));
  const hoje = _diaSP(), ehAtual = m === hoje.slice(0, 7), diaN = +hoje.slice(8, 10), diasMes = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  return { mes: m, meses, ...T, previsao: ehAtual && diaN > 0 ? T.custo / diaN * diasMes : null,
    por_modelo: lista(mod, 'modelo'), por_origem: lista(ori, 'origem').slice(0, 25), por_dia: Object.entries(dia).map(([d, a]) => ({ dia: d, ...a })).sort((a, b) => a.dia < b.dia ? 1 : -1) };
}

let _instalado = false;
function instalar() {
  if (_instalado) return; _instalado = true;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async function (input, init = {}) {
    const st = als.getStore();
    const url = String(typeof input === 'string' ? input : input?.url || input);
    let u; try { u = new URL(url); } catch (_) { return origFetch(input, init); }
    const orig = _IA_TOK.test(u.hostname) ? (i, o) => _iaMedir(origFetch, i, o, u, st) : origFetch; // v3.347: mede o uso de tokens
    if (IA_HOSTS.test(u.hostname) && !(await iaEstado()).ligada) { console.warn('[IA desligada] chamada recusada:', u.hostname + u.pathname.substring(0, 40)); return _iaRecusa(u.hostname); } // v3.345
    if (!st) return orig(input, init);
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
  'campanha-disparo': req => (req.method === 'GET' && !!(q(req, 'c') || q(req, 'o') || q(req, 'sair'))) || (req.method === 'POST' && !!q(req, 'sair') && !req.body?.action), // clique, abertura, descadastro (v3.237: + POST de 1 clique)
  'prospeccao': req => req.method === 'GET' && !!(q(req, 'cartao') || q(req, 'vcard')), // cartão digital
  'apollo': req => q(req, 'webhook') === 'telefone',                  // webhook do Apollo (tem chave própria)
  'fabrica': req => req.method === 'GET' && (q(req, 'action') === 'painel_cliente' || req.query?.action === 'painel_cliente' || /^\/qa\/[a-f0-9]+/.test(String(req.url || ''))), // v3.134: painel de qualidade do cliente (por token)
  'tendencias': req => req.method === 'GET' && !!q(req, 'baixar'),  // v3.144: download do vídeo completo pelo produtor do Podtecno (por token)
  'atv': req => req.method === 'GET' && !q(req, 'cron') && (/^[A-Za-z0-9]{10,40}$/.test(String(q(req, 't') || '')) || /^[A-Za-z0-9]{20,40}$/.test(String(q(req, 'sala') || q(req, 'convidado') || '')) || (!!q(req, 'yt_cb') && /^[A-Za-z0-9]{20,64}$/.test(String(q(req, 'state') || '')))), // + v3.154 retorno do OAuth do YouTube (state conferido na API) // v3.153: Atlantyx TV (código), sala privada e convidado do webinar (tokens)
  'tv': req => req.method === 'GET' && /^[A-Za-z0-9]{10,40}$/.test(String(q(req, 't') || '')), // v3.150: gestão à vista na TV (link com código revogável)
  'wa-response': req => req.method === 'POST' && (process.env.ZAPI_WEBHOOK_TOKEN ? q(req, 'token') === process.env.ZAPI_WEBHOOK_TOKEN : (!process.env.ZAPI_INSTANCE || String(req.body?.instanceId || '') === process.env.ZAPI_INSTANCE)), // webhook Z-API (v3.233: sem token, exige o instanceId da nossa instância)
};
function ehRotaCron(req, nome) {
  if (['rfp-monitor', 'followup-cron', 'briefing-cron'].includes(nome)) return true;
  if (nome === 'health') return q(req, 'full') === '1';
  if (nome === 'financeiro') return !!q(req, 'cron') || ['marcos_processar_alertas', 'relatorio_pagamentos'].includes(q(req, 'action'));
  return (nome === 'metricool' || nome === 'campanha-disparo' || nome === 'agente-ideias' || nome === 'reunioes' || nome === 'atv') && !!q(req, 'cron');
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
    try { req.atxCred = cred; } catch (_) {} // v3.237: o handler sabe se a chamada é pública, de cron, interna ou de sessão
    if (cred === 'processo') return handler(req, res); // mesmo contexto (QA/usuário) da requisição que chamou
    const qa = String(h['x-qa-real'] || '') === '1' && cred !== 'publica';
    instalar(); if (qa) await patchNodemailer();
    let fone = String(h['x-qa-fone'] || '').replace(/\D/g, '');
    if (fone.length === 10 || fone.length === 11) fone = '55' + fone;
    const st = { qa, host: h['x-forwarded-host'] || h.host || '', fone: qa && /^\d{12,15}$/.test(fone) ? fone : null,
      email: qa ? limpa(h['x-qa-email'], /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i) : null, log: [], usuario: req.usuario || null,
      origem: ((nome || String(req.url || '').split('?')[0].replace(/^\/api\//, '')) + ((req.query && req.query.action) || (req.body && typeof req.body === 'object' && req.body.action) ? ':' + String((req.query && req.query.action) || req.body.action).slice(0, 30) : '')) };
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
