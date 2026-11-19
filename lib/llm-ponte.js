// lib/llm-ponte.js — v3.567 · traduz uma chamada no formato da Anthropic (/v1/messages) para outro provedor (formato OpenAI-compatível) e devolve a resposta no formato da Anthropic.
// Assim nenhum robô precisa mudar: o guard troca o provedor na hora. Só texto; com ferramentas (busca na web), imagem ou pré-preenchimento volta ao Claude.
import { PROVEDORES } from './robos-catalogo.js';
const texto = c => typeof c === 'string' ? c : (Array.isArray(c) && c.every(b => b && b.type === 'text') ? c.map(b => b.text).join('\n') : null);
export function podeTraduzir(b) {
  if (!b || b.tools?.length || b.stream) return 'usa ferramentas ou streaming';
  const ms = b.messages || []; if (!ms.length || ms.at(-1).role !== 'user') return 'usa pré-preenchimento';
  if (texto(b.system ?? '') === null || ms.some(m => texto(m.content) === null)) return 'tem imagem ou anexo';
  return null;
}
export function montar(b, prov, modelo) {
  const P = PROVEDORES[prov]; const msgs = []; const sys = texto(b.system ?? ''); if (sys) msgs.push({ role: 'system', content: sys });
  for (const m of b.messages) msgs.push({ role: m.role, content: texto(m.content) });
  return { url: P.url, corpo: { model: modelo, messages: msgs, [P.maxParam]: b.max_tokens || 1000, ...(b.temperature != null && prov !== 'openai' ? { temperature: b.temperature } : {}) } };
}
export function paraAnthropic(d, modelo) {
  const c = d?.choices?.[0]; const t = c?.message?.content; if (typeof t !== 'string') throw new Error(d?.error?.message || 'resposta sem texto');
  return { id: d.id || 'ponte', type: 'message', role: 'assistant', model: modelo, content: [{ type: 'text', text: t }], stop_reason: c.finish_reason === 'length' ? 'max_tokens' : 'end_turn', usage: { input_tokens: d.usage?.prompt_tokens | 0, output_tokens: d.usage?.completion_tokens | 0 } };
}
// Devolve { resposta (formato Anthropic), uso } ou lança erro (o guard cai para o Claude e registra o motivo).
export async function chamar(corpoAnthropic, chave, f = globalThis.fetch) {
  const [prov, ...r] = String(chave).split('::'), modelo = r.join('::'); const P = PROVEDORES[prov]; if (!P || !P.url) throw new Error('provedor desconhecido');
  const motivo = podeTraduzir(corpoAnthropic); if (motivo) throw Object.assign(new Error(motivo), { claude: true });
  const k = process.env[P.env]; if (!k) throw new Error('sem a chave ' + P.env + ' na Vercel');
  const { url, corpo } = montar(corpoAnthropic, prov, modelo);
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 120000);
  try { const res = await f(url, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k }, body: JSON.stringify(corpo) });
    const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error((d?.error?.message || ('HTTP ' + res.status)).toString().slice(0, 160));
    const resp = paraAnthropic(d, modelo); return { resposta: resp, prov, modelo, uso: { in: resp.usage.input_tokens, out: resp.usage.output_tokens } }; }
  finally { clearTimeout(t); }
}
