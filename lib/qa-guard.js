// lib/qa-guard.js — v3.28 · Guarda do QA em execução real
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
import { AsyncLocalStorage } from 'node:async_hooks';

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
    // chamadas ao próprio sistema: propagam o modo QA
    if (st.host && u.host === st.host) {
      const h = new Headers(init.headers || {}); h.set('x-qa-real', '1'); if (st.fone) h.set('x-qa-fone', st.fone); if (st.email) h.set('x-qa-email', st.email);
      return orig(input, { ...init, headers: h });
    }
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
        if (!st) return enviar(msg, cb);
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

export function comGuarda(handler) {
  return async function (req, res) {
    const h = req?.headers || {};
    if (String(h['x-qa-real'] || '') !== '1') return handler(req, res);
    instalar(); await patchNodemailer();
    let fone = String(h['x-qa-fone'] || '').replace(/\D/g, '');
    if (fone.length === 10 || fone.length === 11) fone = '55' + fone;
    const st = { host: h['x-forwarded-host'] || h.host || '', fone: /^\d{12,15}$/.test(fone) ? fone : null,
      email: limpa(h['x-qa-email'], /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i), log: [] };
    // devolve o que foi simulado/redirecionado num cabeçalho, antes da resposta sair
    const marcar = () => { try { if (!res.headersSent && st.log.length) res.setHeader('x-qa-simulado', encodeURIComponent(JSON.stringify(st.log.slice(0, 20)))); } catch (_) {} };
    for (const m of ['json', 'send', 'end', 'redirect']) {
      if (typeof res?.[m] === 'function') { const o = res[m].bind(res); res[m] = (...a) => { marcar(); return o(...a); }; }
    }
    return als.run(st, () => handler(req, res));
  };
}
export const _qaStore = () => als.getStore();
