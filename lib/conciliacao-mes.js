// lib/conciliacao-mes.js — v3.242 · CONCILIAÇÃO DO MÊS EM DUAS ETAPAS (funções puras, sem banco e sem rede)
// Etapa 1 · BANCO × QUICKBOOKS
//   Receitas: crédito pendente de conciliação no banco × fatura do mês no QuickBooks. O valor que cai no banco é o líquido:
//   o cliente retém IR/CSRF/ISS/INSS. O casamento aceita "recebido = total − retenção conhecida" e mostra o retido.
//   Despesas: débito pendente no banco × despesa lançada no QuickBooks (conta a pagar, despesa, pagamento de conta).
// Etapa 2 · QUICKBOOKS × SISTEMA
//   Receitas recebidas no QuickBooks × notas dos termos do sistema; despesas pagas no QuickBooks × agenda de despesas.
//   Resultado de cada item: match · diferença (com o motivo) · só no QuickBooks · só no sistema.

export const RETENCOES = [[0.015, 'IR 1,5%'], [0.0465, 'PIS/COFINS/CSLL 4,65%'], [0.0615, 'IR 1,5% + PIS/COFINS/CSLL 4,65%'], [0.0815, 'IR + CSRF + ISS 2%'],
  [0.1115, 'IR + CSRF + ISS 5%'], [0.065, 'CSRF + ISS 2%'], [0.0965, 'CSRF + ISS 5%'], [0.035, 'IR + ISS 2%'], [0.02, 'ISS 2%'], [0.05, 'ISS 5%'], [0.11, 'INSS 11%'],
  [0.0765, 'IR + CSRF + ISS 1,5%'], [0.03, 'ISS 3%'], [0.0915, 'IR + CSRF + ISS 3%']];
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

// recebido = bruto × (1 − p) para uma retenção conhecida? (tolerância de R$ 0,05 ou 0,08 p.p.)
export function identificarRetencao(recebido, bruto) {
  recebido = Number(recebido); bruto = Number(bruto);
  if (!(recebido > 0) || !(bruto > recebido)) return null;
  const retido = bruto - recebido, p = retido / bruto;
  let melhor = null;
  for (const [pct, nome] of RETENCOES) { const esperado = bruto * pct, dif = Math.abs(retido - esperado);
    if ((dif <= 0.05 || Math.abs(p - pct) <= 0.0008) && (!melhor || dif < melhor.dif)) melhor = { pct, nome, dif }; }
  return melhor ? { retido: r2(retido), pct: melhor.pct, nome: melhor.nome } : null;
}

const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const VAZIAS = new Set(['ltda', 'sa', 's', 'a', 'me', 'eireli', 'epp', 'cia', 'de', 'da', 'do', 'das', 'dos', 'e', 'the', 'inc', 'brasil', 'servicos', 'comercio', 'pagamento', 'pgto', 'pix', 'ted', 'doc', 'transf', 'transferencia', 'recebido', 'recebimento', 'credito', 'debito', 'boleto']);
const _tokens = s => new Set(_norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !VAZIAS.has(w)));
// semelhança de nomes 0..1 (palavras em comum sobre a menor)
export function nomeParecido(a, b) {
  const A = _tokens(a), B = _tokens(b); if (!A.size || !B.size) return 0;
  let i = 0; A.forEach(w => { if (B.has(w) || [...B].some(x => x.length >= 4 && w.length >= 4 && (x.startsWith(w) || w.startsWith(x)))) i++; });
  return Math.min(1, i / Math.min(A.size, B.size));
}
const _dias = (a, b) => { const x = Date.parse(String(a || '').slice(0, 10) + 'T12:00:00Z'), y = Date.parse(String(b || '').slice(0, 10) + 'T12:00:00Z'); return Number.isFinite(x) && Number.isFinite(y) ? Math.abs(x - y) / 864e5 : null; };
const _notaData = d => d == null ? 0.3 : d <= 5 ? 1 : d <= 15 ? 0.8 : d <= 30 ? 0.55 : d <= 60 ? 0.3 : 0.1;
const _valorIgual = (a, b) => Math.abs(Number(a) - Number(b)) <= Math.max(0.5, Math.abs(Number(b)) * 0.003);
const _conf = s => s >= 0.85 ? 'alta' : s >= 0.7 ? 'média' : 'baixa';
const _numNF = v => String(v || '').replace(/[^0-9]/g, '').replace(/^0+/, '');

// emparelha um a um, maior nota primeiro
function _guloso(pares) {
  pares.sort((x, y) => y.score - x.score);
  const usadosA = new Set(), usadosB = new Set(), out = [];
  for (const p of pares) { if (usadosA.has(p.a) || usadosB.has(p.b)) continue; usadosA.add(p.a); usadosB.add(p.b); out.push(p); }
  return out;
}

// ── ETAPA 1 · RECEITAS ── pendentes: [{ id, data, valor (>0), nome, descricao, faturas_vinculadas: [invoiceId] }]
//                         faturas:   [{ id, doc, cliente, total, saldo, vencimento, emissao }]
export function casarReceitas(pendentes, faturas, { minimo = 0.6 } = {}) {
  const pares = [];
  pendentes.forEach((p, ia) => faturas.forEach((f, ib) => {
    const motivos = []; let vs = 0, retencao = null;
    if ((p.faturas_vinculadas || []).map(String).includes(String(f.id))) { pares.push({ a: ia, b: ib, score: 1, motivos: ['recebimento já vinculado a esta fatura no QuickBooks'], retencao: identificarRetencao(p.valor, f.total) }); return; }
    if (_valorIgual(p.valor, f.saldo)) { vs = 1; motivos.push('valor = saldo da fatura'); }
    else if (_valorIgual(p.valor, f.total)) { vs = 1; motivos.push('valor = total da fatura'); }
    else if ((retencao = identificarRetencao(p.valor, f.total))) { vs = 0.92; motivos.push('líquido da retenção ' + retencao.nome + ' (retido R$ ' + retencao.retido.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ')'); }
    else if (f.saldo < f.total && (retencao = identificarRetencao(p.valor, f.saldo))) { vs = 0.85; motivos.push('líquido da retenção ' + retencao.nome + ' sobre o saldo'); }
    else return;
    const nm = Math.max(nomeParecido(p.nome, f.cliente), nomeParecido(p.descricao, f.cliente)); if (nm >= 0.5) motivos.push('cliente bate');
    const nfDesc = _numNF(f.doc) && _numNF(f.doc).length >= 3 && new RegExp('(^|[^0-9])0*' + _numNF(f.doc) + '([^0-9]|$)').test(String(p.descricao || '') + ' ' + String(p.nome || '')); if (nfDesc) motivos.push('nº da fatura na descrição');
    const dd = _dias(p.data, f.vencimento); if (dd != null && dd <= 15) motivos.push(dd < 1 ? 'no vencimento' : Math.round(dd) + ' dia(s) do vencimento');
    const score = Math.min(1, 0.55 * vs + 0.25 * nm + 0.2 * _notaData(dd) + (nfDesc ? 0.15 : 0));
    if (score >= minimo) pares.push({ a: ia, b: ib, score, motivos, retencao });
  }));
  const ok = _guloso(pares);
  const casados = ok.map(x => { const p = pendentes[x.a], f = faturas[x.b];
    return { pendente: p, fatura: f, score: r2(x.score), confianca: _conf(x.score), motivos: x.motivos, retencao: x.retencao || null,
      diferenca: r2(p.valor - (x.retencao ? f.total - x.retencao.retido : f.saldo || f.total)) }; });
  const usP = new Set(ok.map(x => x.a)), usF = new Set(ok.map(x => x.b));
  return { casados, pendentes_sem_par: pendentes.filter((_, i) => !usP.has(i)), faturas_sem_par: faturas.filter((_, i) => !usF.has(i)) };
}

// ── ETAPA 1 · DESPESAS ── pendentes: [{ id, data, valor (>0), nome, descricao }] · despesas QB: [{ id, tipo, fornecedor, valor, data }]
export function casarDespesas(pendentes, despesas, { minimo = 0.6 } = {}) {
  const pares = [];
  pendentes.forEach((p, ia) => despesas.forEach((d, ib) => {
    if (p.id && d.id && String(p.id) === String(d.id)) return; // o mesmo lançamento não casa com ele mesmo
    if (!_valorIgual(p.valor, d.valor)) return;
    const nm = Math.max(nomeParecido(p.nome, d.fornecedor), nomeParecido(p.descricao, d.fornecedor)), dd = _dias(p.data, d.data);
    const motivos = ['mesmo valor']; if (nm >= 0.5) motivos.push('fornecedor bate'); if (dd != null && dd <= 7) motivos.push(dd < 1 ? 'mesma data' : Math.round(dd) + ' dia(s) de diferença');
    const score = 0.55 + 0.25 * nm + 0.2 * _notaData(dd);
    if (score >= minimo) pares.push({ a: ia, b: ib, score, motivos });
  }));
  const ok = _guloso(pares);
  const usP = new Set(ok.map(x => x.a)), usD = new Set(ok.map(x => x.b));
  return { casados: ok.map(x => ({ pendente: pendentes[x.a], despesa: despesas[x.b], score: r2(x.score), confianca: _conf(x.score), motivos: x.motivos })),
    pendentes_sem_par: pendentes.filter((_, i) => !usP.has(i)), despesas_sem_par: despesas.filter((_, i) => !usD.has(i)) };
}

// ── ETAPA 2 · RECEITAS ── recebidas no QB: [{ id, doc, cliente, total, recebido, data }] · notas do sistema: [{ id, nf, empresa, valor, pago, pagamento_data, termo }]
export function compararReceitasSistema(recebidas, notas) {
  const pares = [];
  recebidas.forEach((q, ia) => notas.forEach((n, ib) => {
    const nfIgual = _numNF(q.doc) && _numNF(q.doc) === _numNF(n.nf);
    const nm = nomeParecido(q.cliente, n.empresa), vIgual = _valorIgual(q.total, n.valor);
    let score = 0; if (nfIgual) score = 0.9 + (vIgual ? 0.1 : 0); else if (vIgual && nm >= 0.5) score = 0.75 + 0.15 * nm; else if (vIgual && _dias(q.data, n.pagamento_data) != null && _dias(q.data, n.pagamento_data) <= 5) score = 0.65;
    if (score >= 0.6) pares.push({ a: ia, b: ib, score, nfIgual });
  }));
  const ok = _guloso(pares), itens = [];
  for (const x of ok) { const q = recebidas[x.a], n = notas[x.b]; const dif = [];
    if (!_valorIgual(q.total, n.valor)) dif.push('valor da nota R$ ' + r2(n.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' × fatura R$ ' + r2(q.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    if (!n.pago) dif.push('recebida no QuickBooks, mas a nota está pendente no sistema');
    const ret = identificarRetencao(q.recebido, q.total);
    itens.push({ situacao: dif.length ? 'diferenca' : 'match', qb: q, sistema: n, diferencas: dif, retencao: ret, chave: x.nfIgual ? 'nº da nota' : 'valor e cliente', confianca: _conf(x.score) }); }
  const usQ = new Set(ok.map(x => x.a)), usN = new Set(ok.map(x => x.b));
  recebidas.forEach((q, i) => { if (!usQ.has(i)) itens.push({ situacao: 'so_qb', qb: q, sistema: null, diferencas: ['recebido no QuickBooks sem nota correspondente nos termos do sistema'] }); });
  notas.forEach((n, i) => { if (!usN.has(i) && n.pago && n.no_mes !== false) itens.push({ situacao: 'so_sistema', qb: null, sistema: n, diferencas: ['marcada como paga no sistema, sem recebimento no QuickBooks no mês'] }); });
  return itens;
}

// ── ETAPA 2 · DESPESAS ── pagas no QB: [{ id, tipo, fornecedor, valor, data }] · agenda: [{ id, descricao, fornecedor, valor, data_prevista, data_pagamento, status, qb_txn_id }]
export function compararDespesasSistema(pagas, agenda) {
  const pares = [];
  pagas.forEach((q, ia) => agenda.forEach((o, ib) => {
    const qbIds = [String(q.id).replace(/^\D+_/, ''), ...(q.bill_ids || []).map(String)];
    if (o.qb_txn_id && qbIds.includes(String(o.qb_txn_id).replace(/^\D+_/, ''))) { pares.push({ a: ia, b: ib, score: 1, por: 'vínculo QuickBooks' }); return; }
    const nm = Math.max(nomeParecido(q.fornecedor, o.fornecedor), nomeParecido(q.fornecedor, o.descricao)), dd = _dias(q.data, o.data_pagamento || o.data_prevista);
    const vIgual = _valorIgual(q.valor, o.valor), vPerto = Math.abs(q.valor - o.valor) <= Math.max(5, o.valor * 0.05);
    let score = 0; if (vIgual) score = 0.6 + 0.25 * nm + 0.15 * _notaData(dd); else if (vPerto && nm >= 0.6) score = 0.6 + 0.1 * _notaData(dd);
    if (score >= 0.68 || (vIgual && dd != null && dd <= 3)) pares.push({ a: ia, b: ib, score, por: vIgual ? 'valor' + (nm >= 0.5 ? ' e fornecedor' : '') : 'fornecedor (valor próximo)' });
  }));
  const ok = _guloso(pares), itens = [];
  for (const x of ok) { const q = pagas[x.a], o = agenda[x.b]; const dif = [];
    if (!_valorIgual(q.valor, o.valor)) dif.push('agenda R$ ' + r2(o.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' × pago R$ ' + r2(q.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    if (o.status !== 'paga') dif.push('paga no QuickBooks, mas está "' + (o.status || 'prevista') + '" na agenda');
    itens.push({ situacao: dif.length ? 'diferenca' : 'match', qb: q, sistema: o, diferencas: dif, chave: x.por, confianca: _conf(x.score) }); }
  const usQ = new Set(ok.map(x => x.a)), usO = new Set(ok.map(x => x.b));
  pagas.forEach((q, i) => { if (!usQ.has(i)) itens.push({ situacao: 'so_qb', qb: q, sistema: null, diferencas: ['paga no QuickBooks e não está na agenda de despesas'] }); });
  agenda.forEach((o, i) => { if (!usO.has(i) && o.status !== 'cancelada' && o.no_mes !== false) itens.push({ situacao: 'so_sistema', qb: null, sistema: o, diferencas: [o.status === 'paga' ? 'paga na agenda, sem pagamento no QuickBooks no mês' : 'prevista na agenda e ainda sem pagamento no QuickBooks'] }); });
  return itens;
}

export const resumoComparacao = itens => ({ total: itens.length, match: itens.filter(i => i.situacao === 'match').length, diferenca: itens.filter(i => i.situacao === 'diferenca').length,
  so_qb: itens.filter(i => i.situacao === 'so_qb').length, so_sistema: itens.filter(i => i.situacao === 'so_sistema').length });
