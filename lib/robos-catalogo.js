// lib/robos-catalogo.js — v3.566 · catálogo dos robôs que chamam a IA sozinhos (sem imports: usado pelo guard e pela tela)
// ligado/modelo/extras ficam no kv 'robos:cfg'. "origens" casa com a origem gravada no log de uso da IA (qa-guard): 'api:ação' ou 'api:cron=x'.
// v3.567: a base é o Claude; qualquer outro provedor entra por "provedor::modelo". Chaves ficam SÓ nas variáveis da Vercel (nunca no banco nem na tela).
export const PROVEDORES = {
  anthropic: { nome: 'Anthropic (Claude)', env: 'ANTHROPIC_API_KEY' },
  openai: { nome: 'OpenAI', env: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/chat/completions', maxParam: 'max_completion_tokens' },
  google: { nome: 'Google (Gemini)', env: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', maxParam: 'max_tokens' },
  mistral: { nome: 'Mistral', env: 'MISTRAL_API_KEY', url: 'https://api.mistral.ai/v1/chat/completions', maxParam: 'max_tokens' },
  xai: { nome: 'xAI (Grok)', env: 'XAI_API_KEY', url: 'https://api.x.ai/v1/chat/completions', maxParam: 'max_tokens' },
  deepseek: { nome: 'DeepSeek', env: 'DEEPSEEK_API_KEY', url: 'https://api.deepseek.com/chat/completions', maxParam: 'max_tokens' },
  groq: { nome: 'Groq (modelos abertos)', env: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/chat/completions', maxParam: 'max_tokens' },
  openrouter: { nome: 'OpenRouter (centenas de modelos)', env: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions', maxParam: 'max_tokens' }
};
// Modelos de partida. Preços: US$ por 1 milhão de tokens [entrada, saída] — de tabela, ASSUMIDOS, edite na tela quando mudar. Confira o id do modelo no site do provedor.
export const MODELOS_BASE = [
  { k: 'claude-haiku-4-5-20251001', prov: 'anthropic', modelo: 'claude-haiku-4-5-20251001', nome: 'Haiku 4.5 (mais barato)', preco: [1, 5] },
  { k: 'claude-sonnet-4-6', prov: 'anthropic', modelo: 'claude-sonnet-4-6', nome: 'Sonnet 4.6 (mais capaz)', preco: [3, 15] },
  { k: 'openai::gpt-5', prov: 'openai', modelo: 'gpt-5', nome: 'GPT-5', preco: [1.25, 10] },
  { k: 'openai::gpt-5-mini', prov: 'openai', modelo: 'gpt-5-mini', nome: 'GPT-5 mini', preco: [0.25, 2] },
  { k: 'google::gemini-2.5-pro', prov: 'google', modelo: 'gemini-2.5-pro', nome: 'Gemini 2.5 Pro', preco: [1.25, 10] },
  { k: 'google::gemini-2.5-flash', prov: 'google', modelo: 'gemini-2.5-flash', nome: 'Gemini 2.5 Flash', preco: [0.3, 2.5] },
  { k: 'deepseek::deepseek-chat', prov: 'deepseek', modelo: 'deepseek-chat', nome: 'DeepSeek Chat', preco: [0.28, 0.42] },
  { k: 'mistral::mistral-large-latest', prov: 'mistral', modelo: 'mistral-large-latest', nome: 'Mistral Large', preco: [2, 6] }
];
const ID_OK = /^[A-Za-z0-9._:\/-]{1,80}$/;
// extras = modelos cadastrados pelo usuário [{prov, modelo, nome, preco:[in,out]}]; um extra com a mesma chave sobrescreve o de partida (ex.: preço novo)
export function todosModelos(extras) {
  const m = new Map(MODELOS_BASE.map(x => [x.k, { ...x, base: true }]));
  for (const e of Array.isArray(extras) ? extras : []) { if (!e || !PROVEDORES[e.prov] || e.prov === 'anthropic' || !ID_OK.test(String(e.modelo || ''))) continue; const k = e.prov + '::' + e.modelo; m.set(k, { k, prov: e.prov, modelo: e.modelo, nome: String(e.nome || e.modelo).slice(0, 60), preco: [+e.preco?.[0] || 0, +e.preco?.[1] || 0], base: !!m.get(k)?.base, extra: true }); }
  return m;
}
export const MODELOS = Object.fromEntries(MODELOS_BASE.filter(x => x.prov === 'anthropic').map(x => [x.k, x.nome])); // só Claude (compatibilidade)
export const PRECO = Object.fromEntries(MODELOS_BASE.filter(x => x.prov === 'anthropic').map(x => [x.k, x.preco]));
// padrao: estado quando ninguém configurou. exec(cfg) = execuções (ou rascunhos) por dia útil médio; tok = [entrada, saída] por execução; fixo = US$ por execução fora dos tokens (busca na web)
export const ROBOS = [
  { id: 'time_vendas', nome: 'Time de vendas virtual: abordagens para a fila de aprovação', quando: 'Dias úteis, 07:30 (só se o CEO ligar a rotina no painel do time)', origens: ['vendas:cron=time_vendas'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true }, exec: () => 22 / 30, tok: [30000, 9000] },
  { id: 'floresta', nome: 'Floresta: análise diária dos leads atrasados', quando: 'Dias úteis, 08:00', origens: ['vendas:cron=floresta'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true }, exec: () => 5 / 7, tok: [12000, 5000] },
  { id: 'rfp', nome: 'Radar de RFPs (normal e Petronect)', quando: 'Uma vez a cada N dias (padrão 7)', origens: ['rfp-monitor*'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true, dias: 7 }, exec: c => 2 / Math.max(1, c.dias || 7), tok: [10000, 3000],
    extras: [{ k: 'dias', tipo: 'num', rot: 'Rodar a cada (dias)', op: [1, 3, 7, 14] }] },
  { id: 'noticias', nome: 'Notícias da Atlantyx TV', quando: 'Só com a TV no ar (ou 3x por dia útil)', origens: ['atv:cron=1'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true, so_no_ar: true }, soClaude: 'usa busca na web, que só o Claude faz aqui', exec: c => (c.so_no_ar !== false ? 1 : 3) * 5 / 7, tok: [15000, 2000], fixo: 0.03,
    extras: [{ k: 'so_no_ar', tipo: 'bool', rot: 'Buscar só com a Atlantyx TV no ar' }] },
  { id: 'abordagem_todo', nome: 'Abordagem do To-do (rascunhos)', quando: 'De hora em hora, se houver tarefa', origens: ['vendas:cron=abordagem_todo'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: false, max: 2 }, exec: c => Math.min(12, (c.max || 2) * 4), tok: [2500, 700],
    extras: [{ k: 'max', tipo: 'num', rot: 'Máx. de abordagens por rodada', op: [1, 2, 3, 6] }] },
  { id: 'iara', nome: 'IARA: resumo das respostas de WhatsApp', quando: 'De hora em hora, só conversas novas', origens: ['vendas:cron=iara_retorno'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true }, exec: () => 10, tok: [3000, 300] },
  { id: 'agente_ideias', nome: 'Agente de ideias (Esteira de Demandas)', quando: '1 por dia (checa a cada 6h)', origens: ['agente-ideias:cron=1'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: false }, exec: () => 1, tok: [8000, 4000] },
  { id: 'pauta', nome: 'Pauta das reuniões', quando: 'Véspera de cada reunião', origens: ['reunioes:cron=1'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true }, exec: () => 0.5, tok: [5000, 2000] },
  { id: 'followup', nome: 'Follow-up por WhatsApp', quando: 'De hora em hora, até 8 por rodada', origens: ['followup-cron*'], modelo: 'claude-haiku-4-5-20251001', troca: false, padrao: { ligado: true }, exec: () => 8, tok: [700, 250] },
  { id: 'simulacoes', nome: 'Simulações e investimentos (Estratégia)', quando: '1x por semana e 2x por mês', origens: ['estrategia:cron=*'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true }, exec: () => 0.15, tok: [12000, 3000] }
];
export const porId = id => ROBOS.find(r => r.id === id) || null;
export function casa(origem) { const o = String(origem || ''); return ROBOS.find(r => r.origens.some(p => p.endsWith('*') ? o.startsWith(p.slice(0, -1)) : o === p)) || null; }
export const cfgDe = (r, cfg) => ({ ...r.padrao, ...((cfg || {})[r.id] || {}) });
export const custoRun = (modelo, tok, fixo = 0, extras) => { const m = todosModelos(extras).get(modelo); const p = m ? m.preco : PRECO['claude-sonnet-4-6']; return (tok[0] * p[0] + tok[1] * p[1]) / 1e6 + fixo; };
