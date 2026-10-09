// v3.129: regra única de "termo com pendência crítica" — usada pelo Kanban de Faturamento (card vermelho),
// pelo e-mail diário do financeiro (bloco urgente) e pelo alerta diário aos GPs e ao CTO.
// Vale para termos ainda não pagos. Motivos:
//  · incompleto: sem número, período de medição, cliente, valor ou empresas do rateio
//  · sem nota: a partir da emissão de NF, alguma empresa do rateio sem número de nota
//  · com nota e data de pagamento vazia ou vencida (previsão de pagamento da CPFL)
//  · em atraso: 35+ dias desde a data do termo (ou da inclusão no sistema) sem pagamento
export const PRAZO_TERMO_DIAS = 35;
const dia = x => x ? String(x instanceof Date ? x.toISOString() : x).substring(0, 10) : null;
export function termoPendencias(t, empresas = [], hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })) {
  const st = String(t.status || '');
  if (['pago', 'concluido'].includes(st)) return [];
  const m = [];
  const inc = [];
  if (!String(t.numero_termo || '').trim()) inc.push('número do termo');
  if (!String(t.periodo_medicao || '').trim()) inc.push('período de medição');
  if (!String(t.contratante || '').trim()) inc.push('cliente');
  if (!(parseFloat(t.valor_total_termo) > 0)) inc.push('valor');
  if (!empresas.length) inc.push('empresas do rateio');
  if (inc.length) m.push({ tipo: 'incompleto', texto: 'termo incompleto — falta ' + inc.join(', ') });
  const semNf = empresas.filter(e => !String(e.nf_numero || '').trim());
  if (['emissao_nf', 'envio_nf', 'pagamento'].includes(st) && semNf.length) m.push({ tipo: 'sem_nota', texto: semNf.length === empresas.length ? 'sem nota fiscal' : semNf.length + ' de ' + empresas.length + ' empresa(s) do rateio sem nota fiscal', empresas: semNf.map(e => e.empresa).filter(Boolean) });
  if (['envio_nf', 'pagamento'].includes(st) && empresas.length && !semNf.length) {
    const prev = dia(t.cpfl_previsao_pagamento);
    if (!prev) m.push({ tipo: 'sem_data_pagamento', texto: 'nota emitida sem data de pagamento' });
    else if (prev < hoje) m.push({ tipo: 'pagamento_vencido', texto: 'data de pagamento vencida (' + prev.split('-').reverse().join('/') + ') e não pago' });
  }
  const base = dia(t.data_termo) || dia(t.criado_em);
  const dias = base ? Math.floor((Date.parse(hoje) - Date.parse(base)) / 864e5) : null;
  if (dias != null && dias >= PRAZO_TERMO_DIAS) m.push({ tipo: 'em_atraso', texto: 'em atraso: ' + dias + ' dias sem pagamento' });
  return m;
}
