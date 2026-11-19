// lib/robos-catalogo.js — v3.566 · catálogo dos robôs que chamam a IA sozinhos (sem imports: usado pelo guard e pela tela)
// ligado/modelo/extras ficam no kv 'robos:cfg'. "origens" casa com a origem gravada no log de uso da IA (qa-guard): 'api:ação' ou 'api:cron=x'.
export const MODELOS = { 'claude-haiku-4-5-20251001': 'Haiku 4.5 (mais barato)', 'claude-sonnet-4-6': 'Sonnet 4.6 (mais capaz)' };
export const PRECO = { 'claude-haiku-4-5-20251001': [1, 5], 'claude-sonnet-4-6': [3, 15] }; // US$ por 1 milhão de tokens [entrada, saída]
// padrao: estado quando ninguém configurou. exec(cfg) = execuções (ou rascunhos) por dia útil médio; tok = [entrada, saída] por execução; fixo = US$ por execução fora dos tokens (busca na web)
export const ROBOS = [
  { id: 'floresta', nome: 'Floresta: análise diária dos leads atrasados', quando: 'Dias úteis, 08:00', origens: ['vendas:cron=floresta'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true }, exec: () => 5 / 7, tok: [12000, 5000] },
  { id: 'rfp', nome: 'Radar de RFPs (normal e Petronect)', quando: 'Uma vez a cada N dias (padrão 7)', origens: ['rfp-monitor*'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true, dias: 7 }, exec: c => 2 / Math.max(1, c.dias || 7), tok: [10000, 3000],
    extras: [{ k: 'dias', tipo: 'num', rot: 'Rodar a cada (dias)', op: [1, 3, 7, 14] }] },
  { id: 'noticias', nome: 'Notícias da Atlantyx TV', quando: 'Só com a TV no ar (ou 3x por dia útil)', origens: ['atv:cron=1'], modelo: 'claude-sonnet-4-6', troca: true, padrao: { ligado: true, so_no_ar: true }, exec: c => (c.so_no_ar !== false ? 1 : 3) * 5 / 7, tok: [15000, 2000], fixo: 0.03,
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
export const custoRun = (modelo, tok, fixo = 0) => { const p = PRECO[modelo] || PRECO['claude-sonnet-4-6']; return (tok[0] * p[0] + tok[1] * p[1]) / 1e6 + fixo; };
