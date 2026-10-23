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
export function analisar(pagamentos, hoje) {
  const grupos = {};
  for (const p of pagamentos || []) { const c = classificar(p.texto); if (!c || !(p.valor > 0)) continue; const k = c.grupo + '|' + c.tributo; (grupos[k] = grupos[k] || { ...c, itens: [] }).itens.push(p); }
  const out = [];
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
  return (despesas || []).find(d => { const t = norm([d.descricao, d.categoria, d.fornecedor].join(' '));
    return (d.recorrencia || 'mensal') === sug.recorrencia && chaves.length && chaves.every(c => t.includes(c)); }) || null;
}
