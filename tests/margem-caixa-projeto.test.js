import test from 'node:test'; import assert from 'node:assert/strict';
import { porProjeto } from '../lib/margem-caixa.js';
// dados sintéticos
test('por projeto: margem em competência e lucro/prejuízo em caixa (recebido − impostos − pessoal − fixo)', () => {
  const projetos = [{ projeto: 'Oficial_Alfa', motor: 'projetos', clientes: ['Cliente A'], horas_mes: 100, receita_mes: 50000, impostos_mes: 8000, custo_direto_mes: 20000, fixo_rateado_mes: 5000, margem_mes: 17000 },
    { projeto: 'Oficial_Beta', motor: 'pessoas', clientes: ['Cliente B'], horas_mes: 50, receita_mes: 20000, impostos_mes: 3200, custo_direto_mes: 12000, fixo_rateado_mes: 2500, margem_mes: 2300 }];
  const pg = (d, id, v) => ({ TxnDate: d, Line: [{ Amount: v, LinkedTxn: [{ TxnType: 'Invoice', TxnId: id }] }] });
  const r = porProjeto({ projetos, faturas_proj: [{ id: '1', projeto: 'Oficial_Alfa' }, { id: '2', projeto: 'Oficial_Beta' }, { id: '3', projeto: null }], n: 2, aliquota: 0.16, ini: '2026-09-01', fim: '2026-10-31',
    pagamentos: [pg('2026-09-10', '1', 100000), pg('2026-10-05', '2', 10000), pg('2026-10-06', '3', 700), pg('2026-10-07', '99', 300), pg('2026-08-30', '1', 99999), pg('2026-11-02', '2', 99999)] });
  const a = r.linhas.find(x => x.projeto === 'Oficial_Alfa'), b = r.linhas.find(x => x.projeto === 'Oficial_Beta');
  assert.equal(a.receita_faturada, 100000); assert.equal(a.margem, 34000); assert.equal(a.margem_pct, 34);
  assert.equal(a.recebido, 100000); assert.equal(a.resultado_caixa, 100000 - 16000 - 40000 - 10000); assert.equal(a.situacao, 'lucro');
  assert.equal(b.recebido, 10000, 'pagamento fora do período não conta'); assert.equal(b.resultado_caixa, 10000 - 1600 - 24000 - 5000); assert.equal(b.situacao, 'prejuizo', 'margem positiva, caixa em prejuízo');
  assert.equal(b.margem, 4600); assert.equal(r.recebido_sem_projeto, 1000); assert.equal(r.em_prejuizo_caixa, 1);
  assert.equal(r.total.receita_faturada, 140000); assert.equal(r.total.resultado_caixa, a.resultado_caixa + b.resultado_caixa);
});

test('margem bruta: sem conta de custo dos serviços no QuickBooks usa a folha total da equipe; sem dado fica ausente (nunca 100%)', async () => {
  const { ajustarMargemBruta } = await import('../lib/margem-caixa.js');
  const serie = [{ mes: '2026-08', receita_faturada: 200000, custo_direto: 0, margem_bruta: 200000, margem_bruta_pct: 100 }, { mes: '2026-09', receita_faturada: 100000, custo_direto: 0, margem_bruta: 100000, margem_bruta_pct: 100 }, { mes: '2026-10', receita_faturada: 100000, custo_direto: 30000, margem_bruta: 70000, margem_bruta_pct: 70 }];
  const r = ajustarMargemBruta(serie, { '2026-08': 120000, '2026-09': null }, { folha_por_mes: { '2026-08': 120000, '2026-09': null } });
  assert.equal(r[0].margem_bruta, 80000); assert.equal(r[0].margem_bruta_pct, 40); assert.match(r[0].custo_direto_fonte, /Folha total/);
  assert.equal(r[1].margem_bruta, null); assert.equal(r[1].margem_bruta_pct, null); assert.equal(r[2].margem_bruta_pct, 70, 'mês com custo no QuickBooks não muda');
});
