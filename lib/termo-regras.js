// v3.129: regra única de "termo com pendência crítica" — usada pelo Kanban de Faturamento (card vermelho),
// pelo e-mail diário do financeiro (bloco urgente) e pelo alerta diário aos GPs e ao CTO.
// Vale para termos ainda não pagos. Motivos:
//  · incompleto: sem número, período de medição, cliente, valor ou empresas do rateio
//  · sem nota: a partir da emissão de NF, alguma empresa do rateio sem número de nota
//  · com nota e data de pagamento vazia ou vencida (previsão de pagamento da CPFL)
//  · em atraso: 35+ dias desde a data do termo (ou da inclusão no sistema) sem pagamento
export const PRAZO_TERMO_DIAS = 35;
// v3.281: data em qualquer formato salvo no banco → 'AAAA-MM-DD' (as datas das empresas do rateio são TEXTO e podem
// estar como DD/MM/AAAA; comparar esse texto com 'AAAA-MM-DD' dava "vencida" para datas no futuro)
export const dia = x => {
  if (!x) return null;
  if (x instanceof Date) return isNaN(x) ? null : x.toISOString().substring(0, 10);
  const s = String(x).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s); return isNaN(d) ? null : d.toISOString().substring(0, 10);
};
// v3.281: previsão de pagamento do termo = a informação MAIS RECENTE entre a confirmação do cliente (cpfl_previsao_pagamento)
// e as datas das empresas ainda não pagas do rateio (a mais próxima delas). Antes a data da confirmação tinha prioridade
// sempre — se o pagamento foi reprogramado nas empresas para o futuro, o card seguia dizendo "data vencida".
export function previsaoPagamento(t, empresas = []) {
  const abertas = empresas.filter(e => String(e.pagamento_status || '') !== 'pago');
  const datasEmp = abertas.map(e => dia(e.pagamento_data));
  const prevEmp = abertas.length && datasEmp.every(Boolean) ? datasEmp.sort()[0] : null;
  const prevCli = dia(t.cpfl_previsao_pagamento);
  const prev = [prevCli, prevEmp].filter(Boolean).sort().pop() || null;
  return { data: prev, origem: !prev ? null : prev === prevEmp ? 'datas das empresas do rateio' : 'confirmação do cliente' };
}
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
    // v3.194: a data de pagamento pode estar na confirmação da CPFL (cpfl_previsao_pagamento) OU nas empresas do rateio
    // (pagamento_data, a "💵" do card). Antes só a da CPFL contava — termo com data preenchida aparecia "sem data de pagamento".
    const prev = previsaoPagamento(t, empresas).data;
    if (!prev) m.push({ tipo: 'sem_data_pagamento', texto: 'nota emitida sem data de pagamento' });
    else if (prev < hoje) m.push({ tipo: 'pagamento_vencido', texto: 'data de pagamento vencida (' + prev.split('-').reverse().join('/') + ') e não pago' });
  }
  const base = dia(t.data_termo) || dia(t.criado_em);
  const dias = base ? Math.floor((Date.parse(hoje) - Date.parse(base)) / 864e5) : null;
  if (dias != null && dias >= PRAZO_TERMO_DIAS) m.push({ tipo: 'em_atraso', texto: 'em atraso: ' + dias + ' dias sem pagamento' });
  return m;
}

// v3.196: PRAZO POR ETAPA do funil de faturamento — dias corridos ACUMULADOS desde a data-base do termo
// (data do termo informada ou inclusão no sistema). A etapa "Pagamento" fecha nos mesmos 35 dias do prazo total.
export const PRAZO_ETAPA = { elaboracao: 3, aprovacao: 10, emissao_nf: 15, envio_nf: 20, pagamento: PRAZO_TERMO_DIAS };
export const NOME_ETAPA = { elaboracao: 'Elaboração', aprovacao: 'Aprovação', emissao_nf: 'Emissão de NF', envio_nf: 'Envio de NF', pagamento: 'Pagamento' };
// margem > 0 = dias que faltam para estourar a etapa · margem < 0 = estourada há |margem| dias
export function etapaPrazo(status, diasDecorridos) {
  const lim = PRAZO_ETAPA[String(status || '')];
  if (lim == null || diasDecorridos == null) return null;
  const margem = lim - diasDecorridos;
  return { etapa: NOME_ETAPA[status] || status, limite_dias: lim, decorridos: diasDecorridos, margem, estourado: margem < 0,
    texto: margem < 0 ? 'estourou há ' + (-margem) + ' dia' + (margem === -1 ? '' : 's') : margem === 0 ? 'vence hoje' : 'margem de ' + margem + ' dia' + (margem === 1 ? '' : 's') };
}
