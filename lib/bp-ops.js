// lib/bp-ops.js — v3.115
// Ajuste DETERMINÍSTICO de premissas do Business Plan / Contraproposta.
// A IA não reescreve mais seções inteiras (era assim que linhas sumiam ou mudavam de mês sem ninguém pedir):
// ela devolve OPERAÇÕES pontuais ("alterar o preço da linha X para 7700", "remover a linha Y"), e este módulo
// aplica cada uma sobre as premissas atuais. Tudo o que não foi citado fica exatamente como estava.
// Também calcula, pelo motor, o impacto de cada operação e a sensibilidade das alavancas (para o chat não "estimar").
import { calcularBP } from './bp-calc.js';

const SECOES = ['receitas', 'pessoal', 'despesas_fixas', 'custos_variaveis', 'investimentos'];
const ESCALARES = ['taxa_desconto_anual', 'deducoes_pct', 'ir_csll_pct', 'prazo_recebimento_dias', 'crescimento_perpetuidade_pct', 'social_pct'];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const nomeLinha = x => x?.nome || x?.cargo || x?.descricao || '';
const clone = o => JSON.parse(JSON.stringify(o || {}));
const numOu = v => (typeof v === 'string' && v.trim() !== '' && !isNaN(+v.replace(',', '.'))) ? +v.replace(',', '.') : v;

function acharLinha(lista, alvo) {
  const a = norm(alvo); if (!a) return { idx: -1, motivo: 'operação sem o nome da linha' };
  const exatos = lista.map((x, i) => [i, norm(nomeLinha(x))]).filter(([, n]) => n === a);
  if (exatos.length === 1) return { idx: exatos[0][0] };
  const parc = lista.map((x, i) => [i, norm(nomeLinha(x))]).filter(([, n]) => n && (n.includes(a) || a.includes(n)));
  if (parc.length === 1) return { idx: parc[0][0] };
  // por palavras: a linha que tem mais palavras em comum (e pelo menos 2, ou todas as do alvo)
  const pal = a.split(' ').filter(w => w.length > 2);
  const sc = lista.map((x, i) => { const n = norm(nomeLinha(x)); return [i, pal.filter(w => n.includes(w)).length]; }).sort((x, y) => y[1] - x[1]);
  if (sc[0] && sc[0][1] >= Math.min(2, pal.length) && (!sc[1] || sc[1][1] < sc[0][1])) return { idx: sc[0][0] };
  return { idx: -1, motivo: parc.length > 1 || (sc[1] && sc[0][1] === sc[1][1] && sc[0][1] > 0) ? 'mais de uma linha parecida com "' + alvo + '"' : 'linha "' + alvo + '" não existe nesta seção' };
}

export function aplicarOperacoes(premissas, operacoes) {
  const p = clone(premissas); const aplicadas = [], nao_aplicadas = [];
  for (const op0 of Array.isArray(operacoes) ? operacoes : []) {
    const op = op0 || {}; const tipo = String(op.op || op.acao || '').toLowerCase();
    const sec = String(op.secao || '').toLowerCase();
    try {
      if (tipo === 'marketing' || sec === 'marketing') {
        const c = op.campos || {}; p.marketing = { ...(p.marketing || {}) };
        for (const [k, v] of Object.entries(c)) p.marketing[k] = numOu(v);
        aplicadas.push({ op, descricao: 'Marketing: ' + Object.entries(c).map(([k, v]) => k + ' = ' + v).join(', ') }); continue;
      }
      if (tipo === 'escalar' || (!SECOES.includes(sec) && ESCALARES.includes(op.campo))) {
        if (!ESCALARES.includes(op.campo)) { nao_aplicadas.push({ op, motivo: 'campo "' + op.campo + '" não pode ser alterado' }); continue; }
        p[op.campo] = numOu(op.valor); aplicadas.push({ op, descricao: op.campo + ' = ' + op.valor }); continue;
      }
      if (!SECOES.includes(sec)) { nao_aplicadas.push({ op, motivo: 'seção "' + sec + '" desconhecida' }); continue; }
      const lista = Array.isArray(p[sec]) ? p[sec] : (p[sec] = []);
      if (tipo === 'incluir') {
        const l = op.linha && typeof op.linha === 'object' ? op.linha : null; if (!l) { nao_aplicadas.push({ op, motivo: 'linha nova sem dados' }); continue; }
        const ja = acharLinha(lista, nomeLinha(l)); if (ja.idx >= 0) { lista[ja.idx] = { ...lista[ja.idx], ...Object.fromEntries(Object.entries(l).map(([k, v]) => [k, numOu(v)])) }; aplicadas.push({ op, descricao: sec + ' · ' + nomeLinha(l) + ': já existia — atualizada' }); continue; }
        lista.push(Object.fromEntries(Object.entries(l).map(([k, v]) => [k, numOu(v)]))); aplicadas.push({ op, descricao: sec + ' · ' + nomeLinha(l) + ': incluída' }); continue;
      }
      const { idx, motivo } = acharLinha(lista, op.item);
      if (idx < 0) { nao_aplicadas.push({ op, motivo }); continue; }
      const nome = nomeLinha(lista[idx]);
      if (tipo === 'remover') { lista.splice(idx, 1); aplicadas.push({ op, descricao: sec + ' · ' + nome + ': removida' }); continue; }
      if (tipo === 'alterar') {
        const c = op.campos || {}; if (!Object.keys(c).length) { nao_aplicadas.push({ op, motivo: 'nenhum campo para alterar' }); continue; }
        const antes = {}; for (const [k, v] of Object.entries(c)) { antes[k] = lista[idx][k]; lista[idx][k] = Array.isArray(v) ? v.map(numOu) : numOu(v); }
        aplicadas.push({ op, descricao: sec + ' · ' + nome + ': ' + Object.entries(c).map(([k, v]) => k + ' ' + JSON.stringify(antes[k] ?? null) + ' → ' + JSON.stringify(v)).join(', ') }); continue;
      }
      nao_aplicadas.push({ op, motivo: 'operação "' + tipo + '" desconhecida (use alterar, remover, incluir, marketing ou escalar)' });
    } catch (e) { nao_aplicadas.push({ op, motivo: e.message }); }
  }
  return { premissas: p, aplicadas, nao_aplicadas };
}

const ind = r => { const i = r.indicadores || {}; return { vpl: i.vpl, tir_anual: i.tir_anual, receita_total: i.receita_total, payback_meses: i.payback_simples_meses }; };

// impacto de cada operação aplicada em sequência (a soma fecha com o resultado final)
export function impactoPorOperacao(premissas, aplicadas) {
  let p = clone(premissas), vAnt = ind(calcularBP(p)).vpl; const out = [];
  for (const a of aplicadas) {
    p = aplicarOperacoes(p, [a.op]).premissas;
    let v = null; try { v = ind(calcularBP(p)).vpl; } catch (_) {}
    out.push({ descricao: a.descricao, vpl_depois: v == null ? null : Math.round(v), delta_vpl: v == null || vAnt == null ? null : Math.round(v - vAnt) });
    if (v != null) vAnt = v;
  }
  return out;
}

// conferências de coerência que o motor sozinho não pega
export function checarCoerencia(premissas) {
  const p = premissas || {}, N = Number(p.meses) || 36, al = [];
  const rec = Array.isArray(p.receitas) ? p.receitas : [];
  const recorr = rec.filter(r => String(r.tipo || 'recorrente').toLowerCase() === 'recorrente');
  const setups = rec.filter(r => String(r.tipo || '').toLowerCase() === 'unico' && /setup|implanta|onboard|instala/i.test(r.nome || ''));
  const princ = recorr.slice().sort((a, b) => (Number(b.preco) || 0) - (Number(a.preco) || 0))[0];
  for (const s of setups) if (princ) {
    if (JSON.stringify(s.novos_mes) !== JSON.stringify(princ.novos_mes)) al.push(`"${s.nome}" cobra de um número de clientes novos diferente da assinatura "${princ.nome}" (${JSON.stringify(s.novos_mes)} × ${JSON.stringify(princ.novos_mes)}) — o setup deveria acompanhar cada cliente novo.`);
    if ((Number(s.mes_inicio) || 1) !== (Number(princ.mes_inicio) || 1)) al.push(`"${s.nome}" começa no mês ${s.mes_inicio || 1} e a assinatura "${princ.nome}" no mês ${princ.mes_inicio || 1} — confira se o setup deveria começar junto com as vendas.`);
  }
  for (const r of rec) if ((Number(r.mes_inicio) || 1) > N) al.push(`"${r.nome}" começa no mês ${r.mes_inicio}, depois do horizonte de ${N} meses — não gera receita.`);
  if (!recorr.length && !rec.length) al.push('O plano ficou sem nenhuma linha de receita.');
  return al;
}

// sensibilidade: quanto o VPL muda com cada alavanca, calculado pelo motor (para o chat citar números reais)
export function sensibilidades(premissas, limite = 24) {
  const base = calcularBP(premissas); const v0 = ind(base).vpl; const out = [];
  const testa = (alavanca, ops) => { try { const { premissas: p2, aplicadas } = aplicarOperacoes(premissas, ops); if (!aplicadas.length) return; const v = ind(calcularBP(p2)).vpl; if (v == null || v0 == null) return; const d = Math.round(v - v0); if (Math.abs(d) >= 500) out.push({ alavanca, delta_vpl: d, vpl_resultante: Math.round(v) }); } catch (_) {} };
  const mult = (v, f) => Array.isArray(v) ? v.map(x => Math.round((Number(x) || 0) * f * 100) / 100) : Math.round((Number(v) || 0) * f * 100) / 100;
  for (const r of premissas.receitas || []) {
    const t = String(r.tipo || 'recorrente').toLowerCase(), n = r.nome;
    if (Number(r.preco)) testa(`${n}: preço +10% (R$ ${Math.round(r.preco)} → R$ ${Math.round(r.preco * 1.1)})`, [{ op: 'alterar', secao: 'receitas', item: n, campos: { preco: Math.round(r.preco * 1.1 * 100) / 100 } }]);
    // clientes novos: a linha de setup que acompanha a assinatura (mesmo ritmo) muda junto — um cliente a mais paga as duas
    const ligadas = t === 'recorrente' ? (premissas.receitas || []).filter(x => x !== r && String(x.tipo || '').toLowerCase() === 'unico' && JSON.stringify(x.novos_mes) === JSON.stringify(r.novos_mes)) : [];
    const ehLigada = t === 'unico' && (premissas.receitas || []).some(x => x !== r && String(x.tipo || 'recorrente').toLowerCase() === 'recorrente' && JSON.stringify(x.novos_mes) === JSON.stringify(r.novos_mes));
    if (t !== 'marco' && r.novos_mes != null && !ehLigada) testa(`${n}${ligadas.length ? ' + ' + ligadas.map(x => x.nome).join(' + ') : ''}: +25% de clientes novos por mês (${JSON.stringify(r.novos_mes)} → ${JSON.stringify(mult(r.novos_mes, 1.25))})`,
      [{ op: 'alterar', secao: 'receitas', item: n, campos: { novos_mes: mult(r.novos_mes, 1.25) } }, ...ligadas.map(x => ({ op: 'alterar', secao: 'receitas', item: x.nome, campos: { novos_mes: mult(x.novos_mes, 1.25) } }))]);
    if (t === 'recorrente' && Number(r.churn_mensal_pct) > 0.5) testa(`${n}: churn −0,5 p.p. (${r.churn_mensal_pct}% → ${Math.round((r.churn_mensal_pct - 0.5) * 10) / 10}%/mês)`, [{ op: 'alterar', secao: 'receitas', item: n, campos: { churn_mensal_pct: Math.round((r.churn_mensal_pct - 0.5) * 10) / 10 } }]);
    if (Number(r.mes_inicio) > 2) testa(`${n}: começar 2 meses antes (mês ${r.mes_inicio} → ${r.mes_inicio - 2})`, [{ op: 'alterar', secao: 'receitas', item: n, campos: { mes_inicio: r.mes_inicio - 2 } }]);
  }
  for (const d of premissas.despesas_fixas || []) if (Number(d.valor_mensal)) { testa(`${d.nome}: −20% (R$ ${Math.round(d.valor_mensal)} → R$ ${Math.round(d.valor_mensal * 0.8)}/mês)`, [{ op: 'alterar', secao: 'despesas_fixas', item: d.nome, campos: { valor_mensal: Math.round(d.valor_mensal * 0.8) } }]); testa(`${d.nome}: eliminar`, [{ op: 'remover', secao: 'despesas_fixas', item: d.nome }]); }
  for (const x of premissas.pessoal || []) if (Number(x.salario)) testa(`${x.cargo}: −20% no custo (R$ ${Math.round(x.salario)} → R$ ${Math.round(x.salario * 0.8)})`, [{ op: 'alterar', secao: 'pessoal', item: x.cargo, campos: { salario: Math.round(x.salario * 0.8) } }]);
  for (const c of premissas.custos_variaveis || []) if (Number(c.pct_receita) >= 1) testa(`${c.nome}: −2 p.p. (${c.pct_receita}% → ${c.pct_receita - 2}% da receita)`, [{ op: 'alterar', secao: 'custos_variaveis', item: c.nome, campos: { pct_receita: c.pct_receita - 2 } }]);
  for (const i of premissas.investimentos || []) if (Number(i.valor)) testa(`${i.nome || i.descricao}: −20% (R$ ${Math.round(i.valor)} → R$ ${Math.round(i.valor * 0.8)})`, [{ op: 'alterar', secao: 'investimentos', item: i.nome || i.descricao, campos: { valor: Math.round(i.valor * 0.8) } }]);
  const mk = premissas.marketing || {};
  if (Number(mk.fixo_mensal) || Number(mk.pct_receita)) testa('Marketing: zerar (fixo e % da receita)', [{ op: 'marketing', campos: { fixo_mensal: 0, pct_receita: 0 } }]);
  if (Number(premissas.taxa_desconto_anual) > 3) testa(`Taxa de desconto −3 p.p. (${premissas.taxa_desconto_anual}% → ${premissas.taxa_desconto_anual - 3}% a.a.) — premissa financeira, não muda o negócio`, [{ op: 'escalar', campo: 'taxa_desconto_anual', valor: premissas.taxa_desconto_anual - 3 }]);
  return { vpl_atual: v0 == null ? null : Math.round(v0), alavancas: out.sort((a, b) => b.delta_vpl - a.delta_vpl).slice(0, limite) };
}
