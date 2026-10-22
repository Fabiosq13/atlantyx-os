// lib/retencao-fatura.js — v3.246 · FATURA NO QUICKBOOKS JÁ DESCONTADA DO IMPOSTO RETIDO NA FONTE (funções puras)
// O cliente paga o líquido (retém IR/CSRF/ISS/INSS). A fatura no QuickBooks sai com a linha do serviço pelo valor BRUTO
// e uma linha negativa "Retenção de impostos na fonte" (item próprio, ligado à conta escolhida — ex.: impostos a recuperar):
// total da fatura = líquido = o que entra no banco. Assim a receita continua bruta e a fatura fecha com o recebimento.
// De onde vem a retenção, nesta ordem: valor informado à mão → nota fiscal (vServ − vLiq do XML) → regra % do cliente.
import { identificarRetencao } from './conciliacao-mes.js';

export const NOME_ITEM = 'Retenção de impostos na fonte';
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
export const chaveCliente = (nome, cnpj) => String(cnpj || '').replace(/\D/g, '').length >= 11 ? 'cnpj:' + String(cnpj).replace(/\D/g, '') : 'nome:' + norm(nome).substring(0, 40);

// regra % por cliente: { 'cnpj:…' | 'nome:…': { pct, nome } } — procura por CNPJ e depois pelo nome (contém)
export function regraDoCliente(regras, nome, cnpj) {
  regras = regras || {};
  const k = chaveCliente(nome, cnpj); if (regras[k]) return regras[k];
  const n = norm(nome); if (!n) return null;
  for (const [ch, r] of Object.entries(regras)) { if (!ch.startsWith('nome:')) continue; const x = ch.slice(5); if (x.length >= 4 && (n.includes(x) || x.includes(n))) return r; }
  return null;
}

// retenção de uma empresa do termo (bruto = valor da nota/fatura)
export function retencaoDe({ bruto, manual, nf, regra }) {
  bruto = r2(bruto);
  if (manual && manual.valor != null && manual.valor !== '') { const v = r2(manual.valor); return v > 0 && v < bruto ? { valor: v, pct: r2(v / bruto * 100), origem: 'informada' } : { valor: 0, origem: 'informada (sem retenção)' }; }
  if (nf && nf.retido > 0 && nf.retido < bruto) return { valor: r2(nf.retido), pct: r2(nf.retido / bruto * 100), origem: 'nota fiscal' };
  if (regra && Number(regra.pct) > 0 && Number(regra.pct) < 30) return { valor: r2(bruto * Number(regra.pct) / 100), pct: Number(regra.pct), origem: 'regra do cliente (' + String(regra.pct).replace('.', ',') + '%)' };
  return { valor: 0, origem: null };
}

// retido segundo o XML da NFS-e: vServ − vLiq (quando o líquido vem preenchido) ou a soma das retenções federais
export function retidoDaNota(n) {
  if (!n) return 0; const s = Number(n.valor_servico) || 0, l = Number(n.valor_liquido) || 0;
  if (l > 0 && l < s) return r2(s - l);
  return r2(n.retencoes || 0);
}

export const linhaRetencao = (itemId, valor, desc) => ({ DetailType: 'SalesItemLineDetail', Amount: -r2(valor), Description: (desc || NOME_ITEM).substring(0, 400),
  SalesItemLineDetail: { ItemRef: { value: String(itemId) }, Qty: 1, UnitPrice: -r2(valor) } });

export function temLinhaRetencao(inv, itemId) {
  return (inv?.Line || []).some(l => (itemId && String(l.SalesItemLineDetail?.ItemRef?.value || '') === String(itemId)) || (Number(l.Amount) < 0 && /reten[cç][aã]o/i.test(String(l.Description || ''))));
}

// o que fazer com uma fatura já gerada: retenção conhecida (empresa do termo) ou deduzida do saldo (cliente pagou o líquido)
export function planoAjuste(inv, { itemId, retEmpresa } = {}) {
  const total = r2(inv.TotalAmt), saldo = r2(inv.Balance), pago = r2(total - saldo);
  const base = { invoice_id: String(inv.Id), doc: inv.DocNumber || String(inv.Id), cliente: inv.CustomerRef?.name || '', data: inv.TxnDate || null, total, saldo, pago };
  if (temLinhaRetencao(inv, itemId)) return { ...base, situacao: 'ja_ajustada', texto: 'já tem a linha de retenção' };
  let ret = retEmpresa && retEmpresa.valor > 0 ? { valor: r2(retEmpresa.valor), origem: retEmpresa.origem, pct: retEmpresa.pct } : null;
  if (!ret && saldo > 0.009 && pago > 0.009) { const id = identificarRetencao(pago, total); if (id && Math.abs(id.retido - saldo) <= 0.05) ret = { valor: saldo, origem: 'saldo em aberto = ' + id.nome + ' (cliente pagou o líquido)', pct: r2(id.pct * 100) }; }
  if (!ret) return { ...base, situacao: 'sem_retencao', texto: 'sem retenção conhecida — informe o valor ou cadastre a regra do cliente' };
  const novo = r2(total - ret.valor);
  if (!(novo > 0)) return { ...base, situacao: 'bloqueada', retencao: ret.valor, origem: ret.origem, texto: 'retenção maior que o total da fatura' };
  if (pago > novo + 0.01) return { ...base, situacao: 'bloqueada', retencao: ret.valor, origem: ret.origem, texto: 'o já recebido (' + pago.toFixed(2) + ') passa do novo total — confira o recebimento antes' };
  return { ...base, situacao: 'ajustar', retencao: ret.valor, pct: ret.pct ?? null, origem: ret.origem, novo_total: novo, novo_saldo: r2(Math.max(0, novo - pago)) };
}

// linhas para a atualização (sparse) da fatura: as linhas atuais (menos o subtotal, que o QuickBooks recalcula) + a retenção
export function linhasComRetencao(inv, itemId, valor) {
  return [...(inv.Line || []).filter(l => l.DetailType !== 'SubTotalLineDetail'), linhaRetencao(itemId, valor)];
}

// conta sugerida para o item da retenção (nome parecido com impostos a recuperar / retidos)
export function contaSugerida(contas) {
  const L = contas || [];
  return L.find(c => /(impostos?|tributos?).*(recuperar|retid|compensar)|reten[cç]/i.test(c.nome) && /asset|ativo/i.test(c.tipo || c.classificacao || ''))
    || L.find(c => /(impostos?|tributos?).*(recuperar|retid|compensar)|reten[cç]/i.test(c.nome)) || null;
}
