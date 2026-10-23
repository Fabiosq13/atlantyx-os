// lib/impostos-recorrentes.js — v3.266 · IMPOSTOS (e viagens MaxMilhas) RECORRENTES a partir do que foi pago no QuickBooks (funções puras)
// Lê os pagamentos de impostos dos últimos 13 meses e propõe as despesas recorrentes da Agenda:
//   • parcelamentos (PGFN, Receita, Simples, município…) — mensais, pelo valor da última parcela
//   • municipais da Prefeitura (ISS e afins) — mensais, pela média dos 3 últimos meses
//   • trimestrais (IRPJ/CSLL do lucro presumido/real, ou o que só aparece em jan/abr/jul/out) — pela média dos 4 últimos trimestres
//   • federais mensais (PIS, COFINS, IRRF, INSS, DARF do mês) — pela média dos 3 últimos meses
// DARF sem detalhe que pesa muito mais em jan/abr/jul/out é dividido: a parte de todo mês (mensal) e o excedente do trimestre.

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
export const MESES_TRIMESTRE = ['01', '04', '07', '10'];

export function classificar(texto) {
  const t = ' ' + norm(texto) + ' ';
  const tem = re => re.test(t);
  // v3.266: despesa de viagem recorrente — passagens compradas na MaxMilhas entram pela média mensal do último ano
  if (tem(/max ?milhas/)) return { grupo: 'viagem', tributo: 'Viagem (MaxMilhas)' };
  if (tem(/parcel|\bpert\b|refis|pgfn|transacao tribut|regulariz|\bppi\b|\bpep\b/)) {
    const orgao = tem(/pgfn|divida ativa/) ? 'PGFN' : tem(/prefeit|municip|\biss\b/) ? 'Prefeitura' : tem(/simples|\bdas\b/) ? 'Simples Nacional' : tem(/sefaz|icms|estado/) ? 'Estado' : tem(/inss|previd/) ? 'INSS' : 'Receita Federal';
    return { grupo: 'parcelamento', tributo: 'Parcelamento ' + orgao };
  }
  if (tem(/prefeit|municip|\biss\b|issqn|\btfe\b|\btfa\b|\biptu\b|cosip|\btlp\b/)) {
    const tr = tem(/\biptu\b/) ? 'IPTU' : tem(/\btfe\b|\btfa\b|\btlp\b/) ? 'Taxa municipal' : 'ISS / Prefeitura';
    return { grupo: 'municipal', tributo: tr };
  }
  if (tem(/sefaz|\bicms\b|secretaria de estado de fazenda|\bipva\b|\bdifal\b/)) return { grupo: 'estadual', tributo: tem(/\bipva\b/) ? 'IPVA' : 'ICMS / SEFAZ' };
  if (tem(/darf|receita federal|\birpj\b|\bcsll\b|\bpis\b|cofins|\birrf\b|\binss\b|\bgps\b|\bfgts\b|\bdas\b|simples nacional|esocial|\bdctf|\bcsrf\b|imposto de renda|contribuicao social/)) {
    const tr = tem(/\birpj\b|imposto de renda pessoa juridica/) ? 'IRPJ' : tem(/\bcsll\b|contribuicao social sobre o lucro/) ? 'CSLL' : tem(/cofins/) ? 'COFINS' : tem(/\bpis\b/) ? 'PIS'
      : tem(/\birrf\b|retido/) ? 'IRRF' : tem(/\bcsrf\b/) ? 'CSRF' : tem(/\bfgts\b/) ? 'FGTS' : tem(/\binss\b|\bgps\b|esocial|previd/) ? 'INSS' : tem(/\bdas\b|simples nacional/) ? 'Simples Nacional (DAS)' : 'DARF';
    return { grupo: 'federal', tributo: tr };
  }
  return null;
}

const mediana = L => { const s = L.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const somaMes = itens => { const m = {}; itens.forEach(i => { const k = i.data.slice(0, 7); m[k] = r2((m[k] || 0) + i.valor); }); return m; };

// pagamentos: [{ data:'YYYY-MM-DD', valor>0, texto, ref }] → sugestões
// v3.268: SÉRIES DE PARCELAS — um parcelamento é uma sequência de pagamentos mensais de valor quase igual (sobe um pouco com a
// Selic). Cada série vira uma linha própria na Agenda, mesmo quando o banco só diz "DARF" e vários parcelamentos caem juntos.
const dDia = d => Date.parse(String(d).slice(0, 10) + 'T12:00:00Z') / 864e5;
export function series(itens, { tolPct = 4, minParc = 3 } = {}) {
  const L = itens.slice().sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0), usado = new Set(), out = [];
  for (let i = 0; i < L.length; i++) { if (usado.has(i)) continue; const cadeia = [i];
    for (let j = i + 1; j < L.length; j++) { if (usado.has(j)) continue; const u = L[cadeia[cadeia.length - 1]], gap = dDia(L[j].data) - dDia(u.data);
      if (gap < 20) continue; if (gap > 75) break; // até um mês pulado (parcela paga atrasada) continua a mesma série
      if (Math.abs(L[j].valor - u.valor) <= u.valor * tolPct / 100) cadeia.push(j); }
    if (cadeia.length >= minParc) { cadeia.forEach(k => usado.add(k)); out.push(cadeia.map(k => L[k])); } }
  // parcela paga em dobro no mesmo mês (atrasada + a do mês): o valor bate com a série e a data está dentro dela — entra na série
  L.forEach((x, k) => { if (usado.has(k)) return; const ser = out.find(S => x.data >= S[0].data && dDia(x.data) <= dDia(S[S.length - 1].data) + 35 && S.some(y => Math.abs(y.valor - x.valor) <= y.valor * tolPct / 100 && Math.abs(dDia(y.data) - dDia(x.data)) <= 45));
    if (ser) { ser.push(x); ser.sort((a, b) => a.data < b.data ? -1 : 1); usado.add(k); } });
  return { series: out, resto: L.filter((_, k) => !usado.has(k)) };
}
export function analisar(pagamentos, hoje) {
  const grupos = {}, out = [], h = String(hoje || new Date().toISOString()).slice(0, 10);
  for (const p of pagamentos || []) { const c = classificar(p.texto); if (!c || !(p.valor > 0)) continue; const k = c.grupo + '|' + c.tributo; (grupos[k] = grupos[k] || { ...c, itens: [] }).itens.push(p); }
  // parcelamentos: cada série de parcelas é uma linha; nos federais/municipais genéricos, série de valor fixo também é parcelamento
  for (const [k, g] of Object.entries(grupos)) {
    const explicito = g.grupo === 'parcelamento', generico = (g.grupo === 'federal' && /^DARF$|INSS|Simples/.test(g.tributo)) || g.grupo === 'municipal' || g.grupo === 'estadual';
    if (!explicito && !generico) continue;
    const { series: S, resto } = series(g.itens, { tolPct: explicito ? 6 : 3, minParc: explicito ? 2 : 4 });
    S.forEach(ser => { const ultimo = ser[ser.length - 1], ativo = dDia(h) - dDia(ultimo.data) <= 50, dia = Math.round(mediana(ser.map(i => +i.data.slice(8, 10)))) || 20;
      const orgao = explicito ? g.tributo.replace(/^Parcelamento\s*/, '') : g.grupo === 'municipal' ? 'Prefeitura' : g.grupo === 'estadual' ? 'Estado' : /INSS/.test(g.tributo) ? 'INSS' : /Simples/.test(g.tributo) ? 'Simples Nacional' : 'Receita Federal (DARF)';
      const v = ultimo.valor, rot = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      out.push({ grupo: 'parcelamento', tributo: 'Parcelamento ' + orgao + ' · parcela ~R$ ' + rot, pagamentos: ser.length, meses_com_pagamento: ser.length, ultimo, por_mes: somaMes(ser), dia,
        refs: ser.map(i => i.ref).filter(Boolean), recorrencia: ativo ? 'mensal' : 'encerrado', valor: v, parcela: true,
        criterio: ser.length + ' parcela(s) mensais pagas de ' + ser[0].data.split('-').reverse().join('/') + ' a ' + ultimo.data.split('-').reverse().join('/') + (ativo ? ' · valor da última parcela' : ' · sem parcela há mais de 50 dias — parece encerrado') + (explicito ? '' : ' · reconhecido pelo valor fixo todo mês'),
        confianca: ser.length >= 6 ? 'alta' : ser.length >= 3 ? 'media' : 'baixa' }); });
    if (S.length) { if (resto.length) g.itens = resto; else delete grupos[k]; }
  }
  for (const g of Object.values(grupos)) {
    const porMes = somaMes(g.itens), meses = Object.keys(porMes).sort(), dias = g.itens.map(i => +i.data.slice(8, 10));
    const dia = Math.round(mediana(dias)) || 20, ult = meses.slice(-3).map(m => porMes[m]);
    const base = { grupo: g.grupo, tributo: g.tributo, pagamentos: g.itens.length, meses_com_pagamento: meses.length, ultimo: g.itens.slice().sort((a, b) => a.data < b.data ? -1 : 1).pop(), por_mes: porMes, dia, refs: g.itens.map(i => i.ref).filter(Boolean).slice(-24) };
    const trimMeses = meses.filter(m => MESES_TRIMESTRE.includes(m.slice(5, 7)));
    const ehTrimTexto = /IRPJ|CSLL/.test(g.tributo);
    if (g.grupo === 'viagem') { // gasto irregular: média mensal dos últimos 12 meses (meses sem compra contam como zero)
      const h = String(hoje || new Date().toISOString()).slice(0, 7), [ya, ma] = h.split('-').map(Number), ult12 = [];
      for (let i = 1; i <= 12; i++) { const mm = ((ma - 1 - i) % 12 + 12) % 12 + 1, yy = ya + Math.floor((ma - 1 - i) / 12); ult12.push(yy + '-' + String(mm).padStart(2, '0')); }
      const tot = ult12.reduce((a, m) => a + (porMes[m] || 0), 0), n = ult12.filter(m => porMes[m]).length;
      out.push({ ...base, recorrencia: 'mensal', valor: r2(tot / 12), criterio: 'média mensal dos últimos 12 meses fechados (total ' + r2(tot).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' em ' + n + ' mês(es) com compra)', confianca: n >= 6 ? 'alta' : n >= 3 ? 'media' : 'baixa' });
      continue;
    }
    if (g.grupo === 'parcelamento') {
      if (meses.length >= 2) out.push({ ...base, recorrencia: 'mensal', valor: porMes[meses[meses.length - 1]], criterio: 'valor da última parcela (' + meses[meses.length - 1].split('-').reverse().join('/') + ')', confianca: meses.length >= 4 ? 'alta' : 'media' });
      else out.push({ ...base, recorrencia: 'mensal', valor: porMes[meses[0]], criterio: 'só uma parcela no último ano — confira se continua', confianca: 'baixa' });
      continue;
    }
    // trimestral: IRPJ/CSLL ou pagamentos concentrados em jan/abr/jul/out
    const concentrado = meses.length >= 2 && trimMeses.length / meses.length >= 0.75 && meses.length <= 6;
    if ((ehTrimTexto && meses.length <= 8) || concentrado) {
      const tri = trimMeses.length ? trimMeses : meses, ultT = tri.slice(-4).map(m => porMes[m]);
      out.push({ ...base, recorrencia: 'trimestral', valor: r2(ultT.reduce((a, b) => a + b, 0) / ultT.length), criterio: 'média dos ' + ultT.length + ' últimos trimestres pagos (' + tri.slice(-4).map(m => m.split('-').reverse().join('/')).join(', ') + ')', confianca: tri.length >= 3 ? 'alta' : 'media' });
      continue;
    }
    if (meses.length >= 4) {
      // DARF sem detalhe com pico nos meses de trimestre: separa mensal + excedente trimestral
      const naoTri = meses.filter(m => !MESES_TRIMESTRE.includes(m.slice(5, 7))).map(m => porMes[m]), medN = mediana(naoTri);
      const picos = trimMeses.map(m => porMes[m] - medN).filter(x => x > Math.max(500, medN * 0.5));
      if (g.grupo === 'federal' && naoTri.length >= 3 && picos.length >= 2) {
        out.push({ ...base, recorrencia: 'mensal', valor: r2(medN), criterio: 'mediana dos meses fora de jan/abr/jul/out', confianca: 'media' });
        const ex = picos.slice(-4); out.push({ ...base, tributo: g.tributo + ' — trimestral (IRPJ/CSLL provável)', recorrencia: 'trimestral', valor: r2(ex.reduce((a, b) => a + b, 0) / ex.length), criterio: 'excedente médio dos meses de trimestre sobre o mês comum', confianca: 'media' });
        continue;
      }
      out.push({ ...base, recorrencia: 'mensal', valor: r2(ult.reduce((a, b) => a + b, 0) / ult.length), criterio: 'média dos ' + ult.length + ' últimos meses (' + meses.slice(-3).map(m => m.split('-').reverse().join('/')).join(', ') + ')', confianca: meses.length >= 8 ? 'alta' : 'media' });
      continue;
    }
    out.push({ ...base, recorrencia: meses.length >= 2 ? 'irregular' : 'unica', valor: r2(ult.reduce((a, b) => a + b, 0) / Math.max(1, ult.length)), criterio: 'pago em ' + meses.length + ' mês(es) no último ano — sem padrão para recorrência', confianca: 'baixa' });
  }
  const ordem = { parcelamento: 0, municipal: 1, federal: 2, estadual: 3, viagem: 4 };
  return out.sort((a, b) => (ordem[a.grupo] - ordem[b.grupo]) || (b.valor - a.valor));
}

// primeira data de vencimento a partir de hoje (trimestral: próximo jan/abr/jul/out)
export function proximoVencimento(recorrencia, dia, hoje) {
  const h = String(hoje).slice(0, 10), [a, m] = h.split('-').map(Number), d = Math.min(28, Math.max(1, dia || 20));
  const fmt = (y, mm) => y + '-' + String(mm).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  if (recorrencia === 'trimestral') { for (let i = 0; i < 15; i++) { const mm = ((m - 1 + i) % 12) + 1, yy = a + Math.floor((m - 1 + i) / 12); if (MESES_TRIMESTRE.includes(String(mm).padStart(2, '0')) && fmt(yy, mm) > h) return fmt(yy, mm); } }
  const prox = fmt(a, m) > h ? fmt(a, m) : (m === 12 ? fmt(a + 1, 1) : fmt(a, m + 1));
  return prox;
}

// já existe na Agenda? (despesa ativa com o mesmo tributo no nome/categoria e a mesma recorrência)
export function jaCadastrada(sug, despesas) {
  const chaves = norm(sug.tributo).split(' ').filter(w => w.length >= 3 && !['trimestral', 'provavel', 'prefeitura'].includes(w));
  if (sug.parcela) { // cada parcelamento é uma despesa: bate pelo nome "parcelamento" + valor da parcela perto (10%)
    return (despesas || []).find(d => /parcel/.test(norm([d.descricao, d.categoria].join(' '))) && Math.abs(Number(d.valor) - sug.valor) <= sug.valor * 0.10) || null; }
  return (despesas || []).find(d => { const t = norm([d.descricao, d.categoria, d.fornecedor].join(' '));
    return (d.recorrencia || 'mensal') === sug.recorrencia && chaves.length && chaves.every(c => t.includes(c)); }) || null;
}
