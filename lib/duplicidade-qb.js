// lib/duplicidade-qb.js — v3.252 · É DUPLICADO MESMO? (funções puras)
// Mesmo valor + mesma contraparte em poucos dias nem sempre é cópia. O sistema olha o que o QuickBooks diz de cada
// lançamento e dá um veredito:
//   duplicado   → é cópia (ex.: dois recebimentos quitando a MESMA fatura; mesmo nº de documento; mesmo histórico e
//                 conta, criados juntos)
//   provavel    → tudo igual, sem nada que diferencie (mesma conta, mesmo histórico) — quase certo que é cópia
//   conferir    → algo difere (histórico, criação em dias diferentes) — olhar os dois no QuickBooks
//   nao_e       → cada um quita um documento diferente, nº de documento diferente ou conta bancária diferente
const n = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const PT = { Purchase: 'despesa', Deposit: 'depósito', Invoice: 'fatura', Bill: 'conta a pagar', Payment: 'recebimento', SalesReceipt: 'venda', BillPayment: 'pagamento de conta', JournalEntry: 'lançamento contábil' };
export const chaveGrupo = regs => (regs || []).map(r => r.entidade + '#' + r.id).sort().join(',');

export function veredito(regs) {
  regs = regs || [];
  if (regs.length < 2) return { tipo: 'nao_e', texto: 'só um lançamento' };
  const ents = new Set(regs.map(r => r.entidade));
  if (ents.size > 1) {
    const ids = regs.map(r => r.entidade + '#' + r.id);
    if (regs.some(r => (r.vinculos || []).some(v => ids.includes(v)))) return { tipo: 'nao_e', texto: 'tipos diferentes e ligados entre si (ex.: recebimento e o depósito dele)' };
    return { tipo: 'conferir', texto: 'tipos diferentes (' + [...ents].map(e => PT[e] || e).join(' e ') + ') sem ligação entre si — pode ser o mesmo dinheiro lançado duas vezes' };
  }
  // documentos quitados (recebimento → fatura; pagamento de conta → conta a pagar)
  const docs = regs.map(r => (r.vinculos || []).filter(v => /^(Invoice|Bill|CreditMemo|VendorCredit)#/.test(v)).sort().join('+'));
  if (docs.every(Boolean)) {
    if (new Set(docs).size === regs.length) return { tipo: 'nao_e', texto: 'cada um quita um documento diferente (' + docs.map(d => d.replace(/Invoice#/g, 'fatura ').replace(/Bill#/g, 'conta ')).join(' · ') + ')' };
    return { tipo: 'duplicado', texto: 'quitam o MESMO documento (' + docs[0].replace(/Invoice#/g, 'fatura ').replace(/Bill#/g, 'conta ') + ') — um deles é cópia' };
  }
  const nums = regs.map(r => n(r.doc));
  if (nums.every(Boolean)) {
    if (new Set(nums).size === regs.length) return { tipo: 'nao_e', texto: 'nº de documento diferente (' + regs.map(r => r.doc).join(', ') + ')' };
    return { tipo: 'duplicado', texto: 'mesmo nº de documento (' + regs[0].doc + ') lançado ' + regs.length + ' vezes' };
  }
  const contas = regs.map(r => n(r.conta));
  if (contas.every(Boolean) && new Set(contas).size === regs.length) return { tipo: 'nao_e', texto: 'saíram/entraram por contas diferentes (' + regs.map(r => r.conta).join(' × ') + ')' };
  const memos = regs.map(r => n(r.memo));
  const criados = regs.map(r => Date.parse(r.criado_em || '')).filter(Number.isFinite);
  const juntos = criados.length === regs.length && Math.max(...criados) - Math.min(...criados) <= 10 * 60000;
  if (memos.every(Boolean) && new Set(memos).size > 1) return { tipo: 'conferir', texto: 'históricos diferentes (' + regs.map(r => '“' + String(r.memo).substring(0, 40) + '”').join(' × ') + ') — podem ser cobranças distintas' };
  if (juntos) return { tipo: 'duplicado', texto: 'mesmo valor, conta e histórico, criados no QuickBooks com minutos de diferença — cópia' };
  return { tipo: 'provavel', texto: 'mesmo valor, conta e histórico, sem nada que diferencie — muito provavelmente cópia' };
}
export const ROTULO = { duplicado: 'É duplicado', provavel: 'Provável duplicado', conferir: 'Conferir', nao_e: 'Não é duplicado' };
