// lib/margem-caixa.js — v3.517 · MARGEM × CAIXA (funções puras). Só usa dado do QuickBooks; o que não existe vira `faltando`.
const r2 = v => Math.round((Number(v) || 0) * 100) / 100, r1 = v => Math.round((Number(v) || 0) * 10) / 10;
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
export const RX_COMERCIAL = /marketing|publicidade|propaganda|an[uú]ncio|advertis|comercial|vendas|sales|evento|feira|trade ?show|comiss/i;

// séries mensais a partir das DREs por mês (competência e caixa) já "achatadas": folhas = [{ nome, grupo, cols:[...] }] e meses:[AAAA-MM]
export function serieMensal({ meses, acc, cx, classe }) {
  const lin = (F, i) => { const o = { receita: 0, direto: 0, fixo: 0, imposto: 0, retirada: 0, corporativo: 0, comercial: 0 };
    for (const f of F) { const v = f.cols[i] || 0; if (!v) continue; if (f.grupo === 'Income') { o.receita += v; continue; } if (f.grupo === 'OtherIncome') continue;
      const c = classe(f.nome, f.grupo).classe; o[c] = (o[c] || 0) + v; if (RX_COMERCIAL.test(f.nome) && c !== 'imposto' && c !== 'retirada') o.comercial += v; } return o; };
  return meses.map((mes, i) => { const a = lin(acc.folhas, i), c = lin(cx.folhas, i);
    const mb = a.receita - a.direto, ebitda = a.receita - a.direto - a.fixo, caixaOp = c.receita - c.direto - c.fixo - c.imposto - c.corporativo; // retiradas ficam de fora (financiamento)
    return { mes, custo_direto: r2(a.direto), custo_direto_fonte: a.direto > 0 ? 'QuickBooks (custo dos serviços)' : null, receita_faturada: r2(a.receita), receita_recebida: r2(c.receita), margem_bruta: r2(mb), margem_bruta_pct: a.receita > 0 ? r1(mb / a.receita * 100) : null,
      ebitda: r2(ebitda), ebitda_pct: a.receita > 0 ? r1(ebitda / a.receita * 100) : null, impostos: r2(a.imposto), caixa_operacional: r2(caixaOp), retiradas_pagas: r2(c.retirada),
      conversao_caixa: ebitda > 0 ? r1(caixaOp / ebitda * 100) : null, margem_positiva_caixa_negativo: ebitda > 0 && caixaOp < 0, comercial: r2(a.comercial) }; });
}

// faturas e pagamentos do QuickBooks → por cliente (faturado, recebido, prazo, atraso, aberto)
export function porCliente({ faturas, pagamentos, hoje, motorDe = () => '' }) {
  const pg = {}; // invoiceId → [{data, valor}]
  for (const p of pagamentos) for (const l of p.Line || []) for (const t of l.LinkedTxn || []) if (t.TxnType === 'Invoice') (pg[t.TxnId] = pg[t.TxnId] || []).push({ data: String(p.TxnDate), valor: Number(l.Amount) || 0 });
  const C = {};
  for (const f of faturas) { const nome = f.CustomerRef?.name || '(sem cliente)', X = (C[nome] = C[nome] || { cliente: nome, motor: motorDe(nome), faturada: 0, recebida: 0, aberto: 0, vencido: 0, n: 0, pz_valor: 0, pz_base: 0, at_valor: 0, at_base: 0, ab_atraso_valor: 0, ab_atraso_base: 0, maior_atraso_aberto: 0, abertas: 0 });
    const total = Number(f.TotalAmt) || 0, saldo = Number(f.Balance) || 0, emi = String(f.TxnDate), ven = String(f.DueDate || f.TxnDate); X.n++; X.faturada += total;
    for (const p of pg[f.Id] || []) { X.recebida += p.valor; X.pz_valor += p.valor * dias(emi, p.data); X.pz_base += p.valor; X.at_valor += p.valor * Math.max(0, dias(ven, p.data)); X.at_base += p.valor; }
    if (saldo > 0.5) { X.aberto += saldo; X.abertas++; const at = dias(ven, hoje); if (at > 0) { X.vencido += saldo; X.ab_atraso_valor += saldo * at; X.ab_atraso_base += saldo; X.maior_atraso_aberto = Math.max(X.maior_atraso_aberto, at); } } }
  return Object.values(C).map(x => ({ cliente: x.cliente, motor: x.motor, faturas: x.n, faturada: r2(x.faturada), recebida: r2(x.recebida), aberto: r2(x.aberto), vencido: r2(x.vencido),
    prazo_medio_receb_dias: x.pz_base > 0 ? r1(x.pz_valor / x.pz_base) : null, atraso_medio_pago_dias: x.pz_base > 0 ? r1(x.at_valor / x.pz_base) : null,
    atraso_medio_aberto_dias: x.ab_atraso_base > 0 ? r1(x.ab_atraso_valor / x.ab_atraso_base) : null, maior_atraso_aberto_dias: x.maior_atraso_aberto,
    valor_medio_aberto: x.abertas ? r2(x.aberto / x.abertas) : null })).sort((a, b) => b.aberto - a.aberto || b.faturada - a.faturada);
}
// prazos agregados (ponderados por valor) a partir da lista por cliente e por motor
export function prazos(lista) {
  const agg = L => { let v = 0, b = 0, av = 0, ab = 0; for (const c of L) { if (c.prazo_medio_receb_dias != null) { v += c.prazo_medio_receb_dias * c.recebida; b += c.recebida; av += (c.atraso_medio_pago_dias || 0) * c.recebida; } ab += 0; }
    return { prazo_medio_receb_dias: b > 0 ? r1(v / b) : null, atraso_medio_dias: b > 0 ? r1(av / b) : null, base_recebida: r2(b) }; };
  const motores = {}; for (const c of lista) (motores[c.motor || '(sem motor)'] = motores[c.motor || '(sem motor)'] || []).push(c);
  return { geral: agg(lista), por_motor: Object.entries(motores).map(([m, L]) => ({ motor: m, ...agg(L) })) };
}
// contas a pagar: prazo médio de pagamento a fornecedores = data do pagamento − data da conta
export function prazoFornecedores({ contas, pagamentos }) {
  const pg = {}; for (const p of pagamentos) for (const l of p.Line || []) for (const t of l.LinkedTxn || []) if (t.TxnType === 'Bill') (pg[t.TxnId] = pg[t.TxnId] || []).push({ data: String(p.TxnDate), valor: Number(l.Amount) || 0 });
  let v = 0, b = 0; for (const c of contas) for (const p of pg[c.Id] || []) { v += p.valor * dias(String(c.TxnDate), p.data); b += p.valor; }
  return { prazo_medio_pagto_dias: b > 0 ? r1(v / b) : null, base_paga: r2(b), contas: contas.length };
}
// saldo de caixa por mês (BalanceSheet por mês → linha total de bancos)
export function saldosBanco(rep) {
  const cols = (rep?.Columns?.Column || []).slice(1).map(c => (c.MetaData || []).find(m => m.Name === 'EndDate')?.Value?.substring(0, 7) || '');
  let achado = null; const andar = rows => (rows || []).forEach(r => { if (achado) return; const g = r.group || '', lab = r.Summary?.ColData?.[0]?.value || r.Header?.ColData?.[0]?.value || '';
    if ((/bank/i.test(g) || /^total (bank|banco|cash|caixa)/i.test(lab) || /^bank accounts$/i.test(lab)) && r.Summary?.ColData) achado = r.Summary.ColData.slice(1).map(x => parseFloat(x.value) || 0); if (!achado && r.Rows?.Row) andar(r.Rows.Row); });
  andar(rep?.Rows?.Row); if (!achado) return null; return cols.map((m, i) => ({ mes: m, saldo: r2(achado[i]) })).filter(x => x.mes);
}
// simulador de cenários (puro): fluxo mensal INCREMENTAL da oferta e caixa acumulado em 12 meses → caixa mínimo e mês de recuperação
export function simular(c, saldoInicial = 0, meses = 12) {
  const f = Array(meses).fill(0), add = (m, v) => { if (m >= 0 && m < meses && v) f[m] += v; }, n = x => Number(x) || 0, mesesDe = d => Math.ceil(n(d) / 30);
  const t = c.tipo;
  if (t === 'sprint') { const qtd = n(c.qtd_mes) || 1, custo = n(c.pessoas) * 10 * n(c.custo_dia), recMes = c.pagamento === 'antes' ? 0 : mesesDe(10 + n(c.prazo_dias));
    for (let m = 0; m < meses; m++) { add(m, -custo * qtd); add(m + recMes, n(c.preco) * qtd); } }
  else if (t === 'mensalidade') { const novos = n(c.clientes_novos_mes), desl = c.cobranca === 'fim' ? 1 : 0;
    for (let k = 0; k < meses; k++) for (let m = k; m < meses; m++) { add(m + desl, novos * n(c.valor)); add(m, -novos * n(c.custo_cliente_mes)); } }
  else if (t === 'continua') { const q = n(c.contratos) || 1, custo = n(c.pessoas) * (n(c.dias_mes) || 21) * n(c.custo_dia), desl = Math.max(1, mesesDe(c.prazo_dias));
    for (let m = 0; m < meses; m++) { add(m, -custo * q); add(m + desl, n(c.valor) * q); } }
  else if (t === 'poc') { const parc = Math.max(1, n(c.parcelas)), esp = Math.max(1, n(c.meses_entre)), custo = n(c.pessoas) * n(c.dias) * n(c.custo_dia);
    add(0, -custo); for (let i = 0; i < parc; i++) add(i * esp, n(c.valor) / parc); }
  let ac = saldoInicial, min = ac, mMin = null, rec = null;
  const serie = f.map((v, m) => { ac += v; if (ac < min) { min = ac; mMin = m + 1; } return { mes: m + 1, fluxo: r2(v), acumulado: r2(ac) }; });
  if (mMin != null) for (let m = mMin; m < meses; m++) if (serie[m].acumulado >= saldoInicial) { rec = m + 1; break; }
  return { serie, caixa_minimo: r2(min), mes_do_minimo: mMin, mes_recuperacao: mMin == null ? 0 : rec };
}

// v3.536: POR PROJETO — margem em competência (faturado) e lucro/prejuízo em regime de CAIXA (recebido), no período de n meses.
// Custo do projeto = pessoal (horas apontadas × custo/hora da folha) + custo fixo rateado pelo sistema + impostos.
// projetos: lista de custo-hora.apurar (médias mensais) · faturas_proj: [{ id, projeto }] · pagamentos: Payment do QuickBooks.
export function porProjeto({ projetos = [], faturas_proj = [], pagamentos = [], ini, fim, n = 1, aliquota = 0, conferencia = null, faturas_detalhe = null }) {
  const projDe = {}; for (const f of faturas_proj) if (f && f.id != null) projDe[String(f.id)] = f.projeto || null;
  const rec = {}; let semProjeto = 0;
  for (const p of pagamentos) { const d = String(p.TxnDate || ''); if (d < ini || d > fim) continue;
    for (const l of p.Line || []) for (const t of l.LinkedTxn || []) { if (t.TxnType !== 'Invoice') continue; const v = Number(l.Amount) || 0, pr = projDe[String(t.TxnId)]; if (pr) rec[pr] = (rec[pr] || 0) + v; else semProjeto += v; } }
  // v3.543: conferência — o que o sistema tem de marcos/termos do projeto no período × a receita que foi ligada a ele
  const conferir = (nome, receita) => { const C = conferencia && conferencia[nome], F = (faturas_detalhe && faturas_detalhe[nome]) || []; if (!conferencia) return { conferencia: null, faturas: F.slice(0, 40) };
    const esperado = C ? Math.max(C.marcos_faturados_valor, C.termos_com_fatura_valor) : 0, cadastrado = C ? Math.max(C.marcos_valor, C.termos_valor) : 0;
    const alerta = !C ? null : esperado > 0 && receita < esperado * 0.8 ? 'Há marco/termo FATURADO de R$ ' + Math.round(esperado).toLocaleString('pt-BR') + ' no período e só R$ ' + Math.round(receita).toLocaleString('pt-BR') + ' de receita ligada — fatura provavelmente ligada a outro projeto ou sem projeto'
      : cadastrado > 0 && esperado === 0 && receita === 0 ? 'Há marco/termo só CADASTRADO (R$ ' + Math.round(cadastrado).toLocaleString('pt-BR') + ') e nenhuma fatura — receita ainda não faturada' : null;
    return { conferencia: C || { marcos: 0, termos: 0, itens: [] }, faturas: F.slice(0, 40), alerta_receita: alerta }; };
  const linhas = projetos.map(p => { const receita = (p.receita_mes || 0) * n, imp = (p.impostos_mes || 0) * n, pessoal = (p.custo_direto_mes || 0) * n, fixo = (p.fixo_rateado_mes || 0) * n, horas = (p.horas_mes || 0) * n;
    const margem = receita - imp - pessoal - fixo, recebido = rec[p.projeto] || 0, impCx = recebido * aliquota, resCx = recebido - impCx - pessoal - fixo;
    return { projeto: p.projeto, motor: p.motor || '', clientes: p.clientes || [], horas: r1(horas), custo_hora: p.custo_hora ?? null,
      receita_faturada: r2(receita), impostos: r2(imp), custo_pessoal: r2(pessoal), custo_fixo_rateado: r2(fixo), custo_total: r2(imp + pessoal + fixo), margem: r2(margem), margem_pct: receita > 0 ? r1(margem / receita * 100) : null,
      recebido: r2(recebido), impostos_caixa: r2(impCx), resultado_caixa: r2(resCx), resultado_caixa_pct: recebido > 0 ? r1(resCx / recebido * 100) : null,
      situacao: resCx >= 0 ? 'lucro' : 'prejuizo', a_receber: r2(Math.max(0, receita - recebido)), ...conferir(p.projeto, receita) }; })
    .sort((a, b) => b.receita_faturada - a.receita_faturada || b.custo_total - a.custo_total);
  const s = k => r2(linhas.reduce((a, x) => a + (x[k] || 0), 0));
  const tot = { receita_faturada: s('receita_faturada'), impostos: s('impostos'), custo_pessoal: s('custo_pessoal'), custo_fixo_rateado: s('custo_fixo_rateado'), margem: s('margem'), recebido: s('recebido'), impostos_caixa: s('impostos_caixa'), resultado_caixa: s('resultado_caixa') };
  tot.margem_pct = tot.receita_faturada > 0 ? r1(tot.margem / tot.receita_faturada * 100) : null; tot.resultado_caixa_pct = tot.recebido > 0 ? r1(tot.resultado_caixa / tot.recebido * 100) : null;
  return { meses: n, de: ini, ate: fim, aliquota_pct: r1(aliquota * 100), linhas, total: tot, recebido_sem_projeto: r2(semProjeto), alertas_receita: linhas.filter(x => x.alerta_receita).length,
    sem_projeto: conferencia && conferencia['(sem projeto Oficial_)'] ? conferencia['(sem projeto Oficial_)'] : null, faturas_sem_projeto: (faturas_detalhe && faturas_detalhe['(sem projeto Oficial_)']) || [],
    em_prejuizo_caixa: linhas.filter(x => x.situacao === 'prejuizo' && (x.custo_total > 0 || x.recebido > 0)).length };
}

// v3.552: MARGEM BRUTA revista. Antes o custo direto era só a folha das horas apontadas em PROJETO — a folha de quem estava sem projeto, em hora interna ou sem apontar
// ficava fora e a margem saía alta. Agora o custo direto da margem bruta = FOLHA TOTAL da equipe de entrega no mês (quem está na folha é capacidade de entrega,
// com ou sem projeto) e a receita é LÍQUIDA dos impostos (impostos sobre a receita saem antes da margem bruta). Cada mês traz o `detalhe` para o drilldown.
// Sem folha no mês: "dado ausente" (null), nunca 100%. Se o QuickBooks tiver conta de custo dos serviços (>0), ela é usada e a folha em projeto não entra de novo.
export function ajustarMargemBruta(serie, diretoPorMes = {}, extra = {}) {
  const { folha_por_mes = {}, detalhe_por_mes = {}, aliquota = 0 } = extra;
  return serie.map(x => { const imp = r2(x.receita_faturada * aliquota), liq = r2(x.receita_faturada - imp), det = detalhe_por_mes[x.mes] || null;
    const pessoas = det ? det.pessoas : [], soma = k => r2(pessoas.reduce((t, p) => t + (p[k] || 0), 0));
    if (x.custo_direto > 0) { const mb = liq - x.custo_direto; return { ...x, margem_bruta: r2(mb), margem_bruta_pct: x.receita_faturada > 0 ? r1(mb / x.receita_faturada * 100) : null,
      detalhe: { fonte: 'QuickBooks (custo dos serviços)', receita: x.receita_faturada, impostos: imp, receita_liquida: liq, custo_direto: x.custo_direto, aliquota_pct: r1(aliquota * 100), pessoas: [] } }; }
    const folha = folha_por_mes[x.mes];
    if (folha == null) return { ...x, custo_direto: null, custo_direto_fonte: null, margem_bruta: null, margem_bruta_pct: null, detalhe: { fonte: null, receita: x.receita_faturada, impostos: imp, receita_liquida: liq, custo_direto: null, aliquota_pct: r1(aliquota * 100), pessoas: [] } };
    const mb = liq - folha;
    return { ...x, custo_direto: r2(folha), custo_direto_fonte: 'Folha total da equipe (Pagamento a Colaboradores) — inclui quem estava sem projeto',
      margem_bruta: r2(mb), margem_bruta_pct: x.receita_faturada > 0 ? r1(mb / x.receita_faturada * 100) : null,
      detalhe: { fonte: 'Maestro', receita: x.receita_faturada, impostos: imp, receita_liquida: liq, custo_direto: r2(folha), aliquota_pct: r1(aliquota * 100), em_projeto: soma('em_projeto'), interno: soma('interno'), sem_apontamento: soma('sem_apontamento'),
        horas_projeto: r1(pessoas.reduce((t, p) => t + (p.horas_projeto || 0), 0)), horas_internas: r1(pessoas.reduce((t, p) => t + (p.horas_internas || 0), 0)), pessoas,
        margem_antiga_pct: x.receita_faturada > 0 ? r1((x.receita_faturada - (diretoPorMes[x.mes] || 0)) / x.receita_faturada * 100) : null } }; });
}
