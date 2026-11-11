// lib/custo-hora.js — v3.455 · CUSTO POR PROJETO (centro de custo), RATEIO DO CUSTO FIXO e PISO DO VALOR-HORA (funções puras)
//
// 1) Apropriação da folha: o custo de cada profissional no mês (folha de Pagamento a Colaboradores = horas × valor-hora custo)
//    vai para os projetos na proporção das HORAS APONTADAS no Maestro em cada projeto. Hora apontada em projeto interno
//    (comercial, pré-venda, administrativo, treinamento, férias) e profissional sem apontamento viram custo de estrutura.
// 2) Rateio do custo fixo (estrutura + folha não apropriada): por horas apontadas (padrão para homem-hora), por receita ou
//    por custo direto. Cada projeto fica com: receita − impostos − custo direto − fixo rateado = margem.
// 3) Piso do valor-hora: o menor preço por hora que paga a folha, a estrutura e os impostos sobre a receita.
//      custo total do mês = folha produtiva + custo fixo
//      piso (empata)     = custo total ÷ horas vendáveis ÷ (1 − alíquota)
//      preço-alvo        = custo total ÷ horas vendáveis ÷ (1 − alíquota − margem-alvo)
//    "horas vendáveis" = horas apontadas em projetos (realizado) ou capacidade × utilização-alvo (meta).
//    Por profissional: piso = valor-hora custo × (1 + fixo ÷ folha) ÷ utilização ÷ (1 − alíquota).

export const RX_INTERNO = /interno|internal|administra|comercial|pr[eé].?venda|prevenda|treinamento|capacita|f[eé]rias|aus[eê]ncia|folga|atlantyx ?(os|interno)|atlanteam ?interno|gest[aã]o interna|backoffice|marketing/i;
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const r1 = v => Math.round((Number(v) || 0) * 10) / 10;

// folhas: { 'AAAA-MM': [{ nome, valor, horas, vh }] } · apts: [{ analista, projeto, data, horas }]
// receitas: [{ projeto|null, cliente, valor, mes }] · fixoMes: { 'AAAA-MM': valor } · motorDe(projeto, cliente) → motor
export function apurar({ meses, folhas, apts, receitas = [], fixoMes = {}, aliquota = 0.1615, metodo = 'horas', utilizacao = 0.75,
  margem_alvo = 0.30, capacidade_h = 160, motorDe = () => 'projetos', fixoManual = null }) {
  const n = meses.length || 1, P = {}, pessoas = {}, avisos = [];
  const proj = nome => (P[nome] = P[nome] || { projeto: nome, interno: RX_INTERNO.test(nome), horas: 0, custo_direto: 0, receita: 0, clientes: new Set(), pessoas: {} });
  let folhaTot = 0, folhaNaoApropriada = 0, horasProj = 0, horasInternas = 0, horasTot = 0;
  for (const mes of meses) {
    const L = folhas[mes] || [];
    const H = {}; // horas por pessoa por projeto no mês
    for (const a of apts || []) { if (!a || String(a.data || '').slice(0, 7) !== mes) continue; const pe = norm(a.analista), pr = String(a.projeto || a.Projeto || '').trim() || '(sem projeto)';
      const h = parseFloat(String(a.horas ?? a.Horas ?? '').replace(',', '.')) || 0; if (!pe || !(h > 0)) continue; (H[pe] = H[pe] || {})[pr] = (H[pe][pr] || 0) + h; }
    for (const l of L) { const v = Number(l.valor) || 0; if (!(v > 0)) continue; folhaTot += v; const k = norm(l.nome);
      const ps = (pessoas[k] = pessoas[k] || { nome: l.nome, cargo: l.cargo || '', custo: 0, horas: 0, horas_proj: 0, vh: 0, meses: 0, projetos: {} });
      ps.custo += v; ps.meses++; ps.vh = Number(l.vh) || ps.vh;
      const hp = H[k] || {}, ht = Object.values(hp).reduce((s, x) => s + x, 0);
      if (!(ht > 0)) { folhaNaoApropriada += v; ps.sem_apontamento = (ps.sem_apontamento || 0) + 1; continue; }
      ps.horas += ht; horasTot += ht;
      for (const [pr, h] of Object.entries(hp)) { const c = v * h / ht, X = proj(pr); X.horas += h; X.pessoas[l.nome] = r2((X.pessoas[l.nome] || 0) + c); ps.projetos[pr] = r2((ps.projetos[pr] || 0) + c);
        if (X.interno) { folhaNaoApropriada += c; horasInternas += h; } else { X.custo_direto += c; horasProj += h; ps.horas_proj += h; } }
    }
  }
  // receita do período por projeto (faturas ligadas a termo/projeto; as sem projeto ficam no cliente)
  for (const r of receitas) { const nome = r.projeto || '(Receita sem projeto — ligue no quadro abaixo)'; const X = proj(nome); X.receita += Number(r.valor) || 0; if (r.cliente) X.clientes.add(r.cliente); }
  const fixoQb = meses.reduce((s, m) => s + (Number(fixoMes[m]) || 0), 0);
  const fixoEstrutura = fixoManual != null ? Number(fixoManual) * n : fixoQb;
  const fixoTotal = fixoEstrutura + folhaNaoApropriada; // estrutura + folha que não foi para projeto
  const externos = Object.values(P).filter(x => !x.interno);
  const base = { horas: externos.reduce((s, x) => s + x.horas, 0), receita: externos.reduce((s, x) => s + Math.max(0, x.receita), 0), custo: externos.reduce((s, x) => s + x.custo_direto, 0) };
  const chave = { horas: 'horas', receita: 'receita', custo: 'custo_direto' }[metodo] || 'horas', tot = base[{ horas: 'horas', receita: 'receita', custo: 'custo' }[metodo] || 'horas'];
  if (!(tot > 0)) avisos.push('Sem base para o rateio por ' + metodo + ' (nenhum projeto com ' + metodo + ' no período) — o custo fixo ficou sem ratear.');
  const lista = externos.map(x => { const peso = tot > 0 ? Math.max(0, x[chave]) / tot : 0, fixo = fixoTotal * peso, imp = Math.max(0, x.receita) * aliquota;
    const margem = x.receita - imp - x.custo_direto - fixo;
    return { projeto: x.projeto, motor: motorDe(x.projeto, [...x.clientes][0] || ''), clientes: [...x.clientes], horas_mes: r1(x.horas / n), receita_mes: r2(x.receita / n), impostos_mes: r2(imp / n),
      custo_direto_mes: r2(x.custo_direto / n), fixo_rateado_mes: r2(fixo / n), peso_rateio_pct: r1(peso * 100), margem_mes: r2(margem / n), margem_pct: x.receita > 0 ? r1(margem / x.receita * 100) : null,
      margem_contribuicao_pct: x.receita > 0 ? r1((x.receita - imp - x.custo_direto) / x.receita * 100) : null,
      custo_hora: x.horas > 0 ? r2((x.custo_direto + fixo) / x.horas) : null, preco_hora_realizado: x.horas > 0 && x.receita > 0 ? r2(x.receita / x.horas) : null,
      pessoas: Object.entries(x.pessoas).map(([nome, c]) => ({ nome, custo_mes: r2(c / n) })).sort((a, b) => b.custo_mes - a.custo_mes) }; })
    .sort((a, b) => b.receita_mes - a.receita_mes || b.custo_direto_mes - a.custo_direto_mes);
  const internos = Object.values(P).filter(x => x.interno).map(x => ({ projeto: x.projeto, horas_mes: r1(x.horas / n), custo_mes: r2(Object.values(x.pessoas).reduce((s, c) => s + c, 0) / n) }));
  // motores
  const motores = {}; for (const p of lista) { const m = motores[p.motor] = motores[p.motor] || { motor: p.motor, receita_mes: 0, custo_direto_mes: 0, fixo_rateado_mes: 0, impostos_mes: 0, margem_mes: 0, horas_mes: 0 };
    for (const k of ['receita_mes', 'custo_direto_mes', 'fixo_rateado_mes', 'impostos_mes', 'margem_mes', 'horas_mes']) m[k] = r2(m[k] + p[k]); }
  Object.values(motores).forEach(m => { m.margem_pct = m.receita_mes > 0 ? r1(m.margem_mes / m.receita_mes * 100) : null; });
  // piso do valor-hora
  const folhaMes = folhaTot / n, fixoMesV = fixoEstrutura / n, custoTotalMes = folhaMes + fixoMesV;
  const nPessoas = Object.keys(pessoas).length, capacidade = nPessoas * capacidade_h, hVendReal = horasProj / n, hVendMeta = capacidade * utilizacao;
  const piso = h => h > 0 ? r2(custoTotalMes / h / (1 - aliquota)) : null, alvo = h => h > 0 && 1 - aliquota - margem_alvo > 0 ? r2(custoTotalMes / h / (1 - aliquota - margem_alvo)) : null;
  const fatorFixo = folhaMes > 0 ? fixoMesV / folhaMes : 0;
  const porPessoa = Object.values(pessoas).map(p => { const vh = p.horas > 0 ? p.custo / p.horas : p.vh; return { nome: p.nome, cargo: p.cargo, custo_mes: r2(p.custo / n), horas_mes: r1(p.horas / n),
    horas_projeto_mes: r1(p.horas_proj / n), utilizacao_pct: p.horas > 0 ? r1(p.horas_proj / p.horas * 100) : null, vh_custo: r2(vh), sem_apontamento_meses: p.sem_apontamento || 0,
    piso_hora: vh > 0 ? r2(vh * (1 + fatorFixo) / utilizacao / (1 - aliquota)) : null, preco_alvo_hora: vh > 0 && 1 - aliquota - margem_alvo > 0 ? r2(vh * (1 + fatorFixo) / utilizacao / (1 - aliquota - margem_alvo)) : null,
    projetos: Object.entries(p.projetos).map(([pr, c]) => ({ projeto: pr, custo_mes: r2(c / n) })) }; }).sort((a, b) => b.custo_mes - a.custo_mes);
  if (!folhaTot) avisos.push('Sem folha de colaboradores nos meses escolhidos (Pagamento a Colaboradores) — o custo direto ficou zerado.');
  if (folhaTot && !horasTot) avisos.push('Há folha, mas nenhuma hora apontada no Maestro nos meses — sem apontamento não dá para apropriar o custo aos projetos (tudo virou custo fixo).');
  const semAp = porPessoa.filter(p => p.sem_apontamento_meses); if (semAp.length) avisos.push(semAp.length + ' profissional(is) com folha e sem horas apontadas em algum mês (' + semAp.slice(0, 5).map(p => p.nome).join(', ') + ') — o custo deles foi para o fixo.');
  return { meses, metodo, aliquota_pct: r1(aliquota * 100), utilizacao_pct: r1(utilizacao * 100), margem_alvo_pct: r1(margem_alvo * 100),
    resumo: { folha_mes: r2(folhaMes), fixo_estrutura_mes: r2(fixoMesV), folha_nao_apropriada_mes: r2(folhaNaoApropriada / n), fixo_total_rateado_mes: r2(fixoTotal / n), custo_total_mes: r2(custoTotalMes),
      receita_mes: r2(lista.reduce((s, p) => s + p.receita_mes, 0)), profissionais: nPessoas, horas_apontadas_mes: r1(horasTot / n), horas_projetos_mes: r1(hVendReal), horas_internas_mes: r1(horasInternas / n),
      capacidade_mes: r1(capacidade), utilizacao_real_pct: capacidade > 0 ? r1(hVendReal / capacidade * 100) : null, fator_fixo_pct: r1(fatorFixo * 100), fixo_fonte: fixoManual != null ? 'informado' : 'QuickBooks' },
    piso: { realizado: { horas_mes: r1(hVendReal), piso_hora: piso(hVendReal), preco_alvo_hora: alvo(hVendReal), custo_hora_sem_imposto: hVendReal > 0 ? r2(custoTotalMes / hVendReal) : null },
      meta: { horas_mes: r1(hVendMeta), piso_hora: piso(hVendMeta), preco_alvo_hora: alvo(hVendMeta), custo_hora_sem_imposto: hVendMeta > 0 ? r2(custoTotalMes / hVendMeta) : null } },
    projetos: lista, internos, motores: Object.values(motores), pessoas: porPessoa, avisos };
}
