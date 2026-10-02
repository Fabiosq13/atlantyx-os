// lib/bp-excel.js — v3.07
// Excel do Business Plan como MODELO FINANCEIRO VIVO: toda a planilha é calculada por fórmulas
// a partir da aba Premissas (células amarelas). Mudou preço, volume, salário, investimento ou
// TMA no Excel → Receitas, Despesas, DRE, Fluxo, TIR, VPL e payback recalculam.
// Cada fórmula leva o valor calculado pelo sistema como resultado em cache (abre certo em qualquer
// visualizador). lerPremissasExcel() faz o caminho de volta: lê a aba Premissas de um arquivo
// editado para reimportar no sistema.

import ExcelJS from 'exceljs';
import { calcularBP } from './bp-calc.js';

export const MARCADOR = 'ATLANTYX-BP-v1';
const C = { azul: 'FF1A3A8F', azulClaro: 'FFDCE3F5', total: 'FFEEF2FA', input: 'FFFFF6D5', inputFont: 'FF1F3FBF', borda: 'FFC9D0DC', cinza: 'FF6B7280', verde: 'FF0A8F4A', vermelho: 'FFC62828', branco: 'FFFFFFFF', memo: 'FFF7F7F9' };
const FMT = '#,##0;[Red](#,##0);"–"';
const PCT = '0.0%;[Red]-0.0%;"–"';
const INT = '0;[Red]-0;"–"';
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const bordaFina = { style: 'thin', color: { argb: C.borda } };
const caixa = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina };
function colL(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
const n0 = v => Number(v) || 0;

function faixaTitulo(ws, titulo, sub, ultimaCol) {
  ws.mergeCells(1, 1, 1, ultimaCol);
  const t = ws.getCell(1, 1); t.value = titulo; t.font = { bold: true, size: 15, color: { argb: C.branco } }; t.fill = fill(C.azul);
  t.alignment = { vertical: 'middle', indent: 1 }; ws.getRow(1).height = 30;
  ws.mergeCells(2, 1, 2, ultimaCol);
  const s = ws.getCell(2, 1); s.value = sub || ''; s.font = { italic: true, size: 9, color: { argb: C.cinza } }; s.alignment = { indent: 1 };
}
function impressao(ws, linhasTitulo) {
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  if (linhasTitulo) ws.pageSetup.printTitlesRow = linhasTitulo;
  ws.headerFooter = { oddFooter: '&L&8Atlantyx OS · Business Plan&R&8Página &P de &N' };
}
function secao(ws, row, texto, ultimaCol) {
  const c = ws.getCell(row, 1); c.value = texto; c.font = { bold: true, size: 10, color: { argb: C.azul } };
  for (let k = 1; k <= ultimaCol; k++) ws.getCell(row, k).border = { bottom: { style: 'medium', color: { argb: C.azul } } };
}
const ehInput = cell => { cell.fill = fill(C.input); cell.font = { color: { argb: C.inputFont }, bold: true }; cell.border = caixa; };

export async function gerarExcel(bp) {
  const res = bp.resultado && bp.resultado.mensal ? bp.resultado : calcularBP(bp.premissas);
  const p = res.premissas, N = res.meses.length, nA = res.anos.length, M = res.mensal, I = res.indicadores;
  const nar = bp.narrativa || {};
  const wb = new ExcelJS.Workbook(); wb.creator = 'Atlantyx OS'; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const wsR = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.azul } } });
  const wsP = wb.addWorksheet('Premissas', { views: [{ showGridLines: false }], properties: { tabColor: { argb: 'FFF2B705' } } });
  const wsRec = wb.addWorksheet('Receitas');
  const wsD = wb.addWorksheet('Despesas');
  const wsDRE = wb.addWorksheet('DRE');
  const wsF = wb.addWorksheet('Fluxo de Caixa');
  const wsI = wb.addWorksheet('Indicadores', { views: [{ showGridLines: false }] });

  // ═════════════════════ PREMISSAS ═════════════════════
  const PL = 9; // colunas usadas
  faixaTitulo(wsP, 'Premissas do Business Plan', 'Células AMARELAS são entradas: altere e todas as abas recalculam. Linhas vazias nas tabelas podem ser preenchidas para incluir itens.', PL);
  wsP.getCell('A3').value = MARCADOR; wsP.getCell('A3').font = { size: 7, color: { argb: 'FFBBBBBB' } };
  wsP.getColumn(1).width = 44; for (let c = 2; c <= PL; c++) wsP.getColumn(c).width = 15;
  const G = {}; // endereços dos parâmetros globais
  let pr = 5;
  secao(wsP, pr++, 'PARÂMETROS GERAIS', 3);
  const glob = [
    ['inicio', 'Início do plano (AAAA-MM)', p.inicio || res.meses[0], '@', false],
    ['meses', 'Horizonte (meses) — fixo neste arquivo', N, '0', false],
    ['tma', 'Taxa de desconto — TMA (% ao ano)', n0(p.taxa_desconto_anual) / 100, '0.0%', true],
    ['ded', 'Deduções sobre a receita (impostos)', n0(p.deducoes_pct) / 100, '0.00%', true],
    ['ir', 'IR/CSLL sobre o lucro (Lucro Real; 0 no Presumido)', n0(p.ir_csll_pct) / 100, '0.0%', true],
    ['prazo', 'Prazo médio de recebimento (dias)', n0(p.prazo_recebimento_dias), '0', true],
    ['perp', 'Crescimento na perpetuidade (% a.a.)', n0(p.crescimento_perpetuidade_pct) / 100, '0.0%', true],
    ['saldo', 'Saldo de caixa inicial (R$)', n0(p.saldo_inicial), FMT, true],
    ['mktPct', 'Marketing e vendas — % da receita bruta', n0(p.marketing?.pct_receita) / 100, '0.0%', true],
    ['mktFixo', 'Marketing e vendas — valor fixo mensal (R$)', n0(p.marketing?.fixo_mensal), FMT, true],
    ['mktReaj', 'Marketing fixo — reajuste anual', n0(p.marketing?.reajuste_anual_pct) / 100, '0.0%', true],
  ];
  for (const [k, rot, v, f, inp] of glob) {
    wsP.getCell(pr, 1).value = rot; const c = wsP.getCell(pr, 2); c.value = v; c.numFmt = f;
    if (inp) ehInput(c); else { c.font = { color: { argb: C.cinza } }; c.border = caixa; }
    G[k] = `Premissas!$B$${pr}`; pr++;
  }
  pr++;
  // Tabelas (layout fixo — usado também na importação)
  const EXTRA = 3;
  const T = {};
  const tabela = (chave, titulo, cols, linhas) => {
    secao(wsP, pr++, titulo, cols.length);
    const h = wsP.getRow(pr++);
    cols.forEach((c, i) => { const cell = h.getCell(i + 1); cell.value = c.t; cell.font = { bold: true, size: 9, color: { argb: C.branco } }; cell.fill = fill(C.azul); cell.alignment = { horizontal: i ? 'center' : 'left', wrapText: true, vertical: 'middle' }; });
    h.height = 28;
    const ini = pr;
    const todas = [...linhas, ...Array(EXTRA).fill(null)];
    todas.forEach(l => {
      const serie = l && String(l.tipo || '').toLowerCase() === 'serie';
      cols.forEach((c, i) => {
        const cell = wsP.getCell(pr, i + 1);
        const v = l ? c.v(l) : (c.vazio ?? null);
        cell.value = v == null ? null : v;
        if (c.f) cell.numFmt = c.f;
        if (serie && i > 0 && !c.serieOk) { cell.fill = fill(C.memo); cell.font = { color: { argb: C.cinza }, italic: true }; cell.border = caixa; }
        else ehInput(cell);
        if (c.lista) cell.dataValidation = { type: 'list', allowBlank: true, formulae: [c.lista] };
      });
      pr++;
    });
    T[chave] = { ini, fim: pr - 1, linhas: todas };
    pr++;
  };
  const somaSerie = l => (l.valores || []).reduce((s, v) => s + n0(v), 0);
  tabela('rec', 'RECEITAS', [
    { t: 'Linha de receita', v: l => l.nome || '' },
    { t: 'Tipo', v: l => String(l.tipo || 'recorrente').toLowerCase(), lista: '"recorrente,unico,marco,serie"', serieOk: true },
    { t: 'Preço (R$) — mensal se recorrente', v: l => l.tipo === 'serie' ? null : n0(l.preco), f: FMT },
    { t: 'Clientes iniciais', v: l => l.tipo === 'serie' ? null : n0(l.clientes_iniciais), f: '0.0' },
    { t: 'Novos clientes/mês ano 1', v: l => Array.isArray(l.novos_mes) ? n0(l.novos_mes[0]) : (l.tipo === 'serie' ? null : n0(l.novos_mes)), f: '0.0' },
    { t: 'Novos/mês ano 2', v: l => Array.isArray(l.novos_mes) ? n0(l.novos_mes[1] ?? l.novos_mes[0]) : (l.tipo === 'serie' ? null : n0(l.novos_mes)), f: '0.0' },
    { t: 'Novos/mês ano 3', v: l => Array.isArray(l.novos_mes) ? n0(l.novos_mes[2] ?? l.novos_mes[1] ?? l.novos_mes[0]) : (l.tipo === 'serie' ? null : n0(l.novos_mes)), f: '0.0' },
    { t: 'Churn mensal', v: l => l.tipo === 'serie' ? null : n0(l.churn_mensal_pct) / 100, f: '0.0%' },
    { t: 'Reajuste anual', v: l => l.tipo === 'serie' ? null : n0(l.reajuste_anual_pct) / 100, f: '0.0%' },
    { t: 'Mês de início', v: l => l.tipo === 'serie' ? null : Math.max(1, n0(l.mes_inicio) || 1), f: '0' },
  ], p.receitas);
  tabela('cv', 'CUSTOS VARIÁVEIS (% da receita bruta)', [
    { t: 'Custo', v: l => l.nome || '' }, { t: '% da receita', v: l => n0(l.pct_receita) / 100, f: '0.0%' },
  ], p.custos_variaveis);
  tabela('pes', 'PESSOAL', [
    { t: 'Cargo', v: l => l.cargo || '' }, { t: 'Quantidade', v: l => n0(l.qtd ?? 1), f: '0.0', vazio: null },
    { t: 'Salário / valor mensal (R$)', v: l => n0(l.salario), f: FMT }, { t: 'Encargos', v: l => n0(l.encargos_pct) / 100, f: '0.0%' },
    { t: 'Mês de início', v: l => Math.max(1, n0(l.mes_inicio) || 1), f: '0' }, { t: 'Reajuste anual', v: l => n0(l.reajuste_anual_pct) / 100, f: '0.0%' },
    { t: 'Mês de saída (opcional)', v: l => l.mes_fim ? n0(l.mes_fim) : null, f: '0' },
  ], p.pessoal);
  tabela('fix', 'DESPESAS FIXAS (grupo: geral · pessoal · marketing)', [
    { t: 'Despesa', v: l => l.nome || '' }, { t: 'Grupo', v: l => ['pessoal', 'marketing'].includes(l.grupo) ? l.grupo : 'geral', lista: '"geral,pessoal,marketing"', serieOk: true, vazio: 'geral' },
    { t: 'Valor mensal (R$)', v: l => String(l.tipo || '').toLowerCase() === 'serie' ? null : Math.abs(n0(l.valor_mensal)), f: FMT },
    { t: 'Mês de início', v: l => String(l.tipo || '').toLowerCase() === 'serie' ? null : Math.max(1, n0(l.mes_inicio) || 1), f: '0' },
    { t: 'Reajuste anual', v: l => String(l.tipo || '').toLowerCase() === 'serie' ? null : n0(l.reajuste_anual_pct) / 100, f: '0.0%' },
    { t: 'Tipo', v: l => String(l.tipo || '').toLowerCase() === 'serie' ? 'serie' : 'fixo', serieOk: true, vazio: 'fixo' },
  ], p.despesas_fixas);
  tabela('inv', 'INVESTIMENTOS (CAPEX)', [
    { t: 'Descrição', v: l => l.descricao || '' }, { t: 'Valor (R$)', v: l => Math.abs(n0(l.valor)), f: FMT },
    { t: 'Mês', v: l => Math.min(N, Math.max(1, n0(l.mes) || 1)), f: '0' }, { t: 'Depreciação (meses; 0 = não deprecia)', v: l => n0(l.depreciacao_meses), f: '0' },
  ], p.investimentos);
  if (nar.justificativas && Object.keys(nar.justificativas).length) {
    secao(wsP, pr++, 'JUSTIFICATIVAS DAS PREMISSAS (IA)', PL);
    for (const [k, v] of Object.entries(nar.justificativas)) {
      wsP.getCell(pr, 1).value = k.charAt(0).toUpperCase() + k.slice(1); wsP.getCell(pr, 1).font = { bold: true };
      wsP.mergeCells(pr, 2, pr, PL); const c = wsP.getCell(pr, 2); c.value = String(v || ''); c.alignment = { wrapText: true, vertical: 'top' };
      wsP.getRow(pr).height = Math.max(18, 14 * Math.ceil(String(v || '').length / 120)); pr++;
    }
  }
  impressao(wsP);
  const PR = (col, row) => `Premissas!$${col}$${row}`;

  // ═════════════════════ ABAS MENSAIS (layout comum) ═════════════════════
  const C0 = 3; const colM = m => C0 + m; const colA = a => C0 + N + 1 + a; const colT = C0 + N + 1 + nA;
  const LM = colL(colM(0)), LF = colL(colM(N - 1));
  const HR = 4; // linha dos meses; 5 = nº do mês; 6 = ano
  const prepararMensal = (ws, titulo, sub) => {
    faixaTitulo(ws, titulo, sub, Math.min(colT, 16));
    const r = ws.getRow(HR), rm = ws.getRow(HR + 1), ra = ws.getRow(HR + 2);
    r.getCell(1).value = 'R$'; rm.getCell(1).value = 'Mês nº'; ra.getCell(1).value = 'Ano';
    res.meses.forEach((m, k) => { r.getCell(colM(k)).value = m; rm.getCell(colM(k)).value = k + 1; ra.getCell(colM(k)).value = Math.floor(k / 12) + 1; });
    res.anos.forEach((a, k) => { r.getCell(colA(k)).value = 'Ano ' + a.ano; });
    r.getCell(colT).value = 'Total';
    r.eachCell(c => { c.font = { bold: true, color: { argb: C.branco } }; c.fill = fill(C.azul); c.alignment = { horizontal: 'center' }; });
    [rm, ra].forEach(x => x.eachCell(c => { c.font = { size: 8, color: { argb: C.cinza } }; c.alignment = { horizontal: 'center' }; }));
    ws.getColumn(1).width = 46; ws.getColumn(2).width = 11;
    for (let c = C0; c <= colT; c++) ws.getColumn(c).width = 13;
    ws.getColumn(colA(0) - 1).width = 3;
    for (let a = 0; a <= nA; a++) { const c = a < nA ? colA(a) : colT; r.getCell(c).fill = fill('FF0F2463'); }
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: HR + 2 }];
    impressao(ws, `${HR}:${HR}`);
    // 36 meses não cabem legíveis numa página: ~12 meses por página, repetindo a coluna de títulos
    ws.pageSetup.fitToWidth = Math.ceil((N + nA + 2) / 12); ws.pageSetup.fitToHeight = 0; ws.pageSetup.printTitlesColumn = 'A:B';
  };
  const CACHE = {}; // resultados anuais por aba!linha (para fórmulas que referenciam outras abas)
  const cM = m => colL(colM(m));
  const RM = m => `${cM(m)}$${HR + 1}`, RA = m => `${cM(m)}$${HR + 2}`;
  const rngAno = (row, a) => `${cM(a * 12)}${row}:${cM(Math.min(N, a * 12 + 12) - 1)}${row}`;
  // escreve uma linha: fórmula(m) ou valor estático; anuais = SUM (ou último mês se estoque)
  const linha = (ws, row, rot, vals, { f, b, negrito, total, estoque, memo, fmt = FMT, semAnual } = {}) => {
    const r = ws.getRow(row); r.getCell(1).value = rot;
    if (b != null) r.getCell(2).value = b;
    for (let m = 0; m < N; m++) {
      const cell = r.getCell(colM(m)); const fx = f ? f(m) : null;
      cell.value = fx != null ? { formula: fx, result: vals ? vals[m] : undefined } : (vals ? vals[m] : null);
      cell.numFmt = fmt;
    }
    if (!semAnual) {
      const vv = (vals || []).map(v => Number(v) || 0), anuais = [];
      for (let a = 0; a <= nA; a++) {
        const col = a < nA ? colA(a) : colT; const cell = r.getCell(col);
        const ultimo = a < nA ? Math.min(N, a * 12 + 12) - 1 : N - 1;
        // v3.08: SEMPRE grava o resultado — o Excel em "Modo Protegido" não recalcula e mostrava vazio
        const res0 = estoque ? (vv[ultimo] || 0) : (a < nA ? vv.slice(a * 12, Math.min(N, a * 12 + 12)) : vv).reduce((s2, x) => s2 + x, 0);
        anuais.push(res0);
        cell.value = { formula: estoque ? `${cM(ultimo)}${row}` : (a < nA ? `SUM(${rngAno(row, a)})` : `SUM(${LM}${row}:${LF}${row})`), result: res0 };
        cell.numFmt = fmt; cell.font = { bold: true };
      }
      CACHE[ws.name + '!' + row] = anuais;
    }
    if (negrito || total) r.font = { bold: true };
    if (total) r.eachCell({ includeEmpty: false }, c => { c.fill = fill(C.total); c.border = { top: { style: 'thin', color: { argb: C.azul } } }; });
    if (memo) r.eachCell({ includeEmpty: false }, c => { c.font = { size: 9, color: { argb: C.cinza }, italic: true }; });
    return row;
  };
  const subtitulo = (ws, row, t) => { const c = ws.getCell(row, 1); c.value = t; c.font = { bold: true, color: { argb: C.azul } }; return row; };

  // ═════════════════════ RECEITAS ═════════════════════
  prepararMensal(wsRec, 'Receitas', 'Calculadas a partir da aba Premissas · receita bruta por linha, clientes e novos clientes');
  const recL = res.linhas.receitas; const cliMap = Object.fromEntries((res.linhas.clientes || []).map(c => [c.nome, c]));
  const nRec = T.rec.linhas.length;
  let r = HR + 4;
  subtitulo(wsRec, r++, 'RECEITA BRUTA POR LINHA');
  const rowRec = [], rowCli = [], rowNov = [];
  const baseRec = r; r += nRec;
  const rowTot = r++; r++;
  subtitulo(wsRec, r++, 'CLIENTES ATIVOS (fim do mês)'); const baseCli = r; r += nRec; r++;
  subtitulo(wsRec, r++, 'NOVOS CLIENTES NO MÊS'); const baseNov = r; r += nRec; r++;
  const rowMRR = r++;
  for (let k = 0; k < nRec; k++) {
    const l = T.rec.linhas[k]; const pRow = T.rec.ini + k;
    const serie = l && String(l.tipo || '').toLowerCase() === 'serie';
    const calc = l ? recL[k] : null; const cli = l ? cliMap[l.nome] : null;
    const rN = baseNov + k, rC = baseCli + k, rR = baseRec + k;
    rowRec.push(rR); rowCli.push(rC); rowNov.push(rN);
    const nome = `IF(${PR('A', pRow)}="","(linha livre)",${PR('A', pRow)})`;
    const nomeCell = (row) => { wsRec.getCell(row, 1).value = { formula: nome, result: l ? (l.nome || '') : '(linha livre)' }; };
    const tipo = PR('B', pRow);
    linha(wsRec, rN, '', cli ? cli.novos : Array(N).fill(0), { fmt: '0.0', memo: true, f: serie ? null : m => `IF(OR(${PR('A', pRow)}="",${tipo}="serie",${tipo}="marco"),0,IF(${RM(m)}>=MAX(1,${PR('J', pRow)}),CHOOSE(MIN(${RA(m)},3),${PR('E', pRow)},${PR('F', pRow)},${PR('G', pRow)}),0))` });
    linha(wsRec, rC, '', cli ? cli.clientes : Array(N).fill(0), { fmt: '0.0', memo: true, estoque: true, f: serie ? null : m => `IF(${tipo}="recorrente",${m === 0 ? PR('D', pRow) : cM(m - 1) + rC}*(1-${PR('H', pRow)})+${cM(m)}${rN},0)` });
    linha(wsRec, rR, '', calc ? calc.valores : Array(N).fill(0), { f: serie ? null : m => `IF(${tipo}="marco",IF(${RM(m)}=MAX(1,${PR('J', pRow)}),${PR('C', pRow)},0),IF(${tipo}="recorrente",${cM(m)}${rC},${cM(m)}${rN})*${PR('C', pRow)}*(1+${PR('I', pRow)})^(${RA(m)}-1))` });
    [rR, rC, rN].forEach(row => nomeCell(row));
    if (serie) wsRec.getCell(rR, 2).value = 'série';
  }
  linha(wsRec, rowTot, 'RECEITA BRUTA TOTAL', M.receita_bruta, { total: true, f: m => `SUM(${cM(m)}${baseRec}:${cM(m)}${baseRec + nRec - 1})` });
  linha(wsRec, rowMRR, 'MRR — receita recorrente mensal', M.mrr, { estoque: true, negrito: true,
    f: m => T.rec.linhas.map((_, k) => `IF(${PR('B', T.rec.ini + k)}="recorrente",${cM(m)}${baseRec + k},0)`).join('+') || '0' });

  // ═════════════════════ DESPESAS ═════════════════════
  prepararMensal(wsD, 'Custos e Despesas', 'Calculados a partir da aba Premissas · valores negativos = saída de caixa');
  const RB = m => `Receitas!${cM(m)}$${rowTot}`;
  r = HR + 4; const SUB = {};
  // custos variáveis
  subtitulo(wsD, r++, 'CUSTOS VARIÁVEIS');
  const cvIni = r;
  T.cv.linhas.forEach((l, k) => {
    const pRow = T.cv.ini + k; const calc = l ? res.linhas.custos_variaveis[k] : null;
    linha(wsD, r, '', calc ? calc.valores : Array(N).fill(0), { f: m => `-${RB(m)}*${PR('B', pRow)}` });
    wsD.getCell(r, 1).value = { formula: `IF(${PR('A', pRow)}="","(linha livre)",${PR('A', pRow)})`, result: l ? l.nome : '(linha livre)' }; r++;
  });
  SUB.cv = linha(wsD, r++, 'Subtotal custos variáveis', M.custos_variaveis, { total: true, f: m => `SUM(${cM(m)}${cvIni}:${cM(m)}${r - 2})` }); r++;
  // pessoal (tabela Pessoal)
  subtitulo(wsD, r++, 'PESSOAL');
  const pesIni = r;
  const pesCalc = res.linhas.pessoal.filter(l => !l.grupo);
  T.pes.linhas.forEach((l, k) => {
    const pRow = T.pes.ini + k; const calc = l ? pesCalc[k] : null;
    linha(wsD, r, '', calc ? calc.valores : Array(N).fill(0), { f: m => `IF(AND(${PR('A', pRow)}<>"",${RM(m)}>=MAX(1,${PR('E', pRow)}),OR(${PR('G', pRow)}="",${RM(m)}<=${PR('G', pRow)})),-${PR('B', pRow)}*${PR('C', pRow)}*(1+${PR('D', pRow)})*(1+${PR('F', pRow)})^(${RA(m)}-1),0)` });
    wsD.getCell(r, 1).value = { formula: `IF(${PR('A', pRow)}="","(linha livre)",${PR('A', pRow)})`, result: l ? l.cargo : '(linha livre)' }; r++;
  });
  const pesVals = Array(N).fill(0); pesCalc.forEach(l => l.valores.forEach((v, m) => { pesVals[m] += v; }));
  SUB.pes = linha(wsD, r++, 'Subtotal pessoal (tabela Pessoal)', pesVals, { total: true, f: m => `SUM(${cM(m)}${pesIni}:${cM(m)}${r - 2})` }); r++;
  // marketing
  subtitulo(wsD, r++, 'MARKETING E VENDAS');
  const mkVals = Array(N).fill(0); (res.linhas.marketing || []).filter(l => l.nome === 'Marketing e vendas').forEach(l => l.valores.forEach((v, m) => { mkVals[m] += v; }));
  SUB.mkt = linha(wsD, r++, 'Marketing e vendas (% receita + fixo)', mkVals, { f: m => `-(${RB(m)}*${G.mktPct}+${G.mktFixo}*(1+${G.mktReaj})^(${RA(m)}-1))` }); r++;
  // despesas fixas
  subtitulo(wsD, r++, 'DESPESAS FIXAS (coluna B = grupo)');
  const fixIni = r;
  const fixCalc = [...res.linhas.despesas_fixas, ...res.linhas.pessoal.filter(l => l.grupo === 'pessoal'), ...(res.linhas.marketing || []).filter(l => l.grupo === 'marketing')];
  T.fix.linhas.forEach((l, k) => {
    const pRow = T.fix.ini + k;
    const serie = l && String(l.tipo || '').toLowerCase() === 'serie';
    const calc = l ? fixCalc.find(x => x.nome === (l.nome || 'Despesa')) : null;
    linha(wsD, r, '', calc ? calc.valores : Array(N).fill(0), { f: serie ? null : m => `IF(AND(${PR('A', pRow)}<>"",${PR('F', pRow)}<>"serie",${RM(m)}>=MAX(1,${PR('D', pRow)})),-ABS(${PR('C', pRow)})*(1+${PR('E', pRow)})^(${RA(m)}-1),0)` });
    wsD.getCell(r, 1).value = { formula: `IF(${PR('A', pRow)}="","(linha livre)",${PR('A', pRow)})`, result: l ? l.nome : '(linha livre)' };
    wsD.getCell(r, 2).value = { formula: `IF(${PR('B', pRow)}="","geral",${PR('B', pRow)})`, result: l ? (['pessoal', 'marketing'].includes(l.grupo) ? l.grupo : 'geral') : 'geral' };
    r++;
  });
  const fixFim = r - 1;
  const fixTot = Array(N).fill(0); fixCalc.forEach(l => l.valores.forEach((v, m) => { fixTot[m] += v; }));
  SUB.fix = linha(wsD, r++, 'Subtotal despesas fixas (todos os grupos)', fixTot, { total: true, f: m => `SUM(${cM(m)}${fixIni}:${cM(m)}${fixFim})` }); r++;
  subtitulo(wsD, r++, 'INVESTIMENTOS E DEPRECIAÇÃO');
  const iA = T.inv.ini, iB = T.inv.fim;
  const invMes = `Premissas!$C$${iA}:$C$${iB}`, invVal = `Premissas!$B$${iA}:$B$${iB}`, invDep = `Premissas!$D$${iA}:$D$${iB}`;
  SUB.capex = linha(wsD, r++, 'Investimentos (CAPEX)', M.investimentos, { f: m => `-SUMPRODUCT((${invMes}=${RM(m)})*${invVal})` });
  SUB.dep = linha(wsD, r++, 'Depreciação / amortização', M.depreciacao, { f: m => `-SUMPRODUCT((${invMes}<=${RM(m)})*((${invMes}+${invDep})>${RM(m)})*(${invDep}>0)*${invVal}/(${invDep}+(${invDep}=0)))` });

  // ═════════════════════ DRE ═════════════════════
  prepararMensal(wsDRE, 'DRE — Demonstração do Resultado', `${res.meses[0]} a ${res.meses[N - 1]} · mensal e anual`);
  const D = {}; r = HR + 4;
  const Dsp = (m, row) => `Despesas!${cM(m)}${row}`;
  D.rb = linha(wsDRE, r++, 'RECEITA BRUTA', M.receita_bruta, { negrito: true, f: m => RB(m) });
  D.ded = linha(wsDRE, r++, '(−) Deduções / impostos sobre a receita', M.deducoes, { f: m => `-${cM(m)}${D.rb}*${G.ded}` });
  D.rl = linha(wsDRE, r++, '= RECEITA LÍQUIDA', M.receita_liquida, { total: true, f: m => `${cM(m)}${D.rb}+${cM(m)}${D.ded}` });
  D.cv = linha(wsDRE, r++, '(−) Custos variáveis', M.custos_variaveis, { f: m => Dsp(m, SUB.cv) });
  D.lb = linha(wsDRE, r++, '= LUCRO BRUTO', M.lucro_bruto, { total: true, f: m => `${cM(m)}${D.rl}+${cM(m)}${D.cv}` });
  D.pes = linha(wsDRE, r++, '(−) Pessoal', M.pessoal, { f: m => `${Dsp(m, SUB.pes)}+SUMIF(Despesas!$B$${fixIni}:$B$${fixFim},"pessoal",Despesas!${cM(m)}${fixIni}:${cM(m)}${fixFim})` });
  D.mkt = linha(wsDRE, r++, '(−) Marketing e vendas', M.marketing, { f: m => `${Dsp(m, SUB.mkt)}+SUMIF(Despesas!$B$${fixIni}:$B$${fixFim},"marketing",Despesas!${cM(m)}${fixIni}:${cM(m)}${fixFim})` });
  D.ger = linha(wsDRE, r++, '(−) Despesas gerais e administrativas', M.despesas_fixas, { f: m => `${Dsp(m, SUB.fix)}-SUMIF(Despesas!$B$${fixIni}:$B$${fixFim},"pessoal",Despesas!${cM(m)}${fixIni}:${cM(m)}${fixFim})-SUMIF(Despesas!$B$${fixIni}:$B$${fixFim},"marketing",Despesas!${cM(m)}${fixIni}:${cM(m)}${fixFim})` });
  D.ebitda = linha(wsDRE, r++, '= EBITDA', M.ebitda, { total: true, f: m => `${cM(m)}${D.lb}+${cM(m)}${D.pes}+${cM(m)}${D.mkt}+${cM(m)}${D.ger}` });
  D.dep = linha(wsDRE, r++, '(−) Depreciação / amortização', M.depreciacao, { f: m => Dsp(m, SUB.dep) });
  D.ebit = linha(wsDRE, r++, '= EBIT (resultado operacional)', M.ebit, { negrito: true, f: m => `${cM(m)}${D.ebitda}+${cM(m)}${D.dep}` });
  const rIR = r++, rLL = r++;
  r++;
  const rMB = r++, rME = r++, rML = r++;
  r++;
  subtitulo(wsDRE, r++, 'MEMÓRIA DE CÁLCULO — IR/CSLL com compensação de prejuízo (limite 30%)');
  const rComp = r++, rPrej = r++;
  // valores de memória (espelham o motor)
  const comp = [], prej = []; { let pj = 0; for (let m = 0; m < N; m++) { const e = M.ebit[m]; let c = 0; if (e > 0) { c = Math.min(pj, e * 0.3); pj -= c; } else pj += -e; comp.push(c); prej.push(pj); } }
  linha(wsDRE, rComp, 'Prejuízo compensado no mês', comp, { memo: true, f: m => `IF(${cM(m)}${D.ebit}>0,MIN(${m ? cM(m - 1) + rPrej : 0},0.3*${cM(m)}${D.ebit}),0)` });
  linha(wsDRE, rPrej, 'Prejuízo fiscal acumulado', prej, { memo: true, estoque: true, f: m => `${m ? cM(m - 1) + rPrej : 0}+IF(${cM(m)}${D.ebit}<=0,-${cM(m)}${D.ebit},-${cM(m)}${rComp})` });
  D.ir = linha(wsDRE, rIR, '(−) IR/CSLL', M.ir_csll, { f: m => `IF(${cM(m)}${D.ebit}>0,-(${cM(m)}${D.ebit}-${cM(m)}${rComp})*${G.ir},0)` });
  D.ll = linha(wsDRE, rLL, '= LUCRO LÍQUIDO', M.lucro_liquido, { total: true, f: m => `${cM(m)}${D.ebit}+${cM(m)}${D.ir}` });
  const margem = (row, rot, num, numVals) => {
    const rw = wsDRE.getRow(row); rw.getCell(1).value = rot;
    const nAn = CACHE['DRE!' + num], dAn = CACHE['DRE!' + D.rb], anuais = [];
    for (let m = 0; m <= N + nA; m++) {
      const col = m < N ? colM(m) : (m - N < nA ? colA(m - N) : colT); const L = colL(col);
      const nv = m < N ? numVals[m] : nAn[m - N], dv = m < N ? M.receita_bruta[m] : dAn[m - N];
      const rsl = dv ? nv / dv : 0; if (m >= N) anuais.push(rsl);
      const cell = rw.getCell(col); cell.value = { formula: `IFERROR(${L}${num}/${L}${D.rb},0)`, result: rsl }; cell.numFmt = PCT;
    }
    CACHE['DRE!' + row] = anuais;
    rw.font = { italic: true, color: { argb: C.cinza } };
  };
  margem(rMB, 'Margem bruta', D.lb, M.lucro_bruto); margem(rME, 'Margem EBITDA', D.ebitda, M.ebitda); margem(rML, 'Margem líquida', D.ll, M.lucro_liquido);
  // Linha de total de colT para margem já coberta (m = N + nA)
  D.mb = rMB; D.me = rME; D.ml = rML;

  // ═════════════════════ FLUXO DE CAIXA ═════════════════════
  prepararMensal(wsF, 'Fluxo de Caixa Projetado', 'Método indireto · calculado a partir da DRE');
  const F = {}; r = HR + 4;
  F.ll = linha(wsF, r++, 'Lucro líquido', M.lucro_liquido, { f: m => `DRE!${cM(m)}${D.ll}` });
  F.dep = linha(wsF, r++, '(+) Depreciação (não sai do caixa)', M.depreciacao.map(v => -v), { f: m => `-DRE!${cM(m)}${D.dep}` });
  F.giro = linha(wsF, r++, '(−) Variação do capital de giro (recebíveis)', M.var_capital_giro, { f: m => `-(DRE!${cM(m)}${D.rb}-${m ? 'DRE!' + cM(m - 1) + D.rb : 0})*${G.prazo}/30` });
  F.fco = linha(wsF, r++, '= FLUXO DE CAIXA OPERACIONAL', M.fco, { total: true, f: m => `${cM(m)}${F.ll}+${cM(m)}${F.dep}+${cM(m)}${F.giro}` });
  F.inv = linha(wsF, r++, '(−) Investimentos (CAPEX)', M.investimentos, { f: m => Dsp(m, SUB.capex) });
  F.fcl = linha(wsF, r++, '= FLUXO DE CAIXA LIVRE', M.fcl, { total: true, f: m => `${cM(m)}${F.fco}+${cM(m)}${F.inv}` });
  F.ac = r; linha(wsF, r++, 'Fluxo livre acumulado', M.fcl_acumulado, { estoque: true, f: m => m ? `${cM(m - 1)}${F.ac}+${cM(m)}${F.fcl}` : `${cM(m)}${F.fcl}` });
  F.cx = linha(wsF, r++, 'SALDO DE CAIXA (com saldo inicial)', M.caixa, { estoque: true, negrito: true, f: m => `${G.saldo}+${cM(m)}${F.ac}` });
  F.desc = r; linha(wsF, r++, 'Fluxo livre descontado pela TMA', M.fcl_descontado, { memo: true, f: m => `${cM(m)}${F.fcl}/(1+Indicadores!$C$6)^${m}` });
  F.dac = r; linha(wsF, r++, 'Fluxo descontado acumulado', M.fcl_descontado.reduce((a, v) => { a.push((a.length ? a[a.length - 1] : 0) + v); return a; }, []), { memo: true, estoque: true, f: m => m ? `${cM(m - 1)}${F.dac}+${cM(m)}${F.desc}` : `${cM(m)}${F.desc}` });

  // ═════════════════════ INDICADORES ═════════════════════
  faixaTitulo(wsI, 'Indicadores de Viabilidade', 'Fórmulas vivas sobre o Fluxo de Caixa — mudam quando as Premissas mudam', 4);
  wsI.getColumn(1).width = 3; wsI.getColumn(2).width = 48; wsI.getColumn(3).width = 22; wsI.getColumn(4).width = 72;
  const fclR = `'Fluxo de Caixa'!${LM}${F.fcl}:${LF}${F.fcl}`, fcl2 = `'Fluxo de Caixa'!${cM(1)}${F.fcl}:${LF}${F.fcl}`, fcl0 = `'Fluxo de Caixa'!${LM}${F.fcl}`;
  const acR = `'Fluxo de Caixa'!${LM}${F.ac}:${LF}${F.ac}`, dacR = `'Fluxo de Caixa'!${LM}${F.dac}:${LF}${F.dac}`, cxR = `'Fluxo de Caixa'!${LM}${F.cx}:${LF}${F.cx}`;
  const mesR = `'Fluxo de Caixa'!${LM}$${HR + 1}:${LF}$${HR + 1}`;
  const ultAnoCol = colL(colA(nA - 1)), totCol = colL(colT);
  const payback = rg => `IF(COUNTIF(${rg},"<0")=0,0,IF(LOOKUP(2,1/(${rg}<0),${mesR})>=${N},"não se paga",LOOKUP(2,1/(${rg}<0),${mesR})+1))`;
  const ind = [
    ['TMA — taxa de desconto anual', `${G.tma}`, I.taxa_desconto_anual, '0.0%', 'Premissas'],
    ['Taxa de desconto mensal', `(1+C5)^(1/12)-1`, I.taxa_desconto_mensal, '0.000%', ''],
    ['TIR mensal', `IFERROR(IRR(${fclR}),"n/a")`, I.tir_mensal ?? 'n/a', '0.00%', 'Sem valor quando o fluxo não troca de sinal'],
    ['TIR anual', `IFERROR((1+C7)^12-1,"n/a")`, I.tir_anual ?? 'n/a', '0.0%', 'Viável quando TIR > TMA'],
    ['VPL — valor presente líquido (horizonte)', `${fcl0}+NPV(C6,${fcl2})`, I.vpl, FMT, 'Viável quando VPL > 0'],
    ['Valor terminal (perpetuidade, Gordon)', `IF(AND('Fluxo de Caixa'!${ultAnoCol}${F.fcl}>0,C5>${G.perp}),'Fluxo de Caixa'!${ultAnoCol}${F.fcl}*(1+${G.perp})/(C5-${G.perp}),"n/a")`, I.valor_terminal ?? 'n/a', FMT, 'FCL do último ano × (1+g) / (TMA − g)'],
    ['VPL com perpetuidade (valuation DCF)', `IF(ISNUMBER(C10),C9+C10/(1+C6)^${N - 1},"n/a")`, I.vpl_com_perpetuidade ?? 'n/a', FMT, ''],
    ['Payback simples (meses)', payback(acR), I.payback_simples_meses ?? 'não se paga', INT, 'Mês em que o caixa acumulado fica positivo de vez'],
    ['Payback descontado (meses)', payback(dacR), I.payback_descontado_meses ?? 'não se paga', INT, ''],
    ['Capital necessário (exposição máxima de caixa)', `MAX(0,-MIN(${acR}))`, I.exposicao_maxima_caixa, FMT, 'Maior necessidade acumulada de caixa'],
    ['Menor saldo de caixa', `MIN(${cxR})`, I.menor_saldo_caixa, FMT, ''],
    ['Investimento total (CAPEX)', `-'Fluxo de Caixa'!${totCol}${F.inv}`, I.investimento_total, FMT, ''],
    ['ROI do período (FCL total ÷ capital necessário)', `IF(C14>0,'Fluxo de Caixa'!${totCol}${F.fcl}/C14,"n/a")`, I.roi_periodo ?? 'n/a', '0.0%', ''],
    ['Índice de lucratividade', `IF(C14>0,(C9+C14)/C14,"n/a")`, I.indice_lucratividade ?? 'n/a', '0.00', '(VPL + capital) ÷ capital'],
    ['Ponto de equilíbrio — receita mensal (último ano)', `IFERROR(-(DRE!${ultAnoCol}${D.pes}+DRE!${ultAnoCol}${D.mkt}+DRE!${ultAnoCol}${D.ger})/12/(DRE!${ultAnoCol}${D.lb}/DRE!${ultAnoCol}${D.rb}),"n/a")`, I.ponto_equilibrio_receita_mensal ?? 'n/a', FMT, 'Custos fixos mensais ÷ margem de contribuição'],
    ['Receita bruta total', `DRE!${totCol}${D.rb}`, I.receita_total, FMT, ''],
    ['EBITDA total', `DRE!${totCol}${D.ebitda}`, I.ebitda_total, FMT, ''],
    ['Lucro líquido total', `DRE!${totCol}${D.ll}`, I.lucro_liquido_total, FMT, ''],
    ['MRR no fim do período', `Receitas!${LF}${rowMRR}`, I.mrr_final, FMT, ''],
    ['Conclusão', `IF(AND(C9>0,OR(NOT(ISNUMBER(C8)),C8>C5)),"VIÁVEL — VPL > 0 e TIR > TMA","NÃO VIÁVEL nas premissas atuais")`, I.viavel ? 'VIÁVEL — VPL > 0 e TIR > TMA' : 'NÃO VIÁVEL nas premissas atuais', null, ''],
  ];
  const hI = wsI.getRow(4); ['', 'Indicador', 'Valor', 'Observação'].forEach((t, i) => { const c = hI.getCell(i + 1); c.value = t; if (i) { c.font = { bold: true, color: { argb: C.branco } }; c.fill = fill(C.azul); } });
  const IROW = {};
  ind.forEach(([k, f, v, fmt, obs], i) => {
    const row = 5 + i; IROW[k] = row;
    wsI.getCell(row, 2).value = k; const c = wsI.getCell(row, 3); c.value = { formula: f, result: v }; if (fmt) c.numFmt = fmt; c.alignment = { horizontal: 'right' };
    wsI.getCell(row, 4).value = obs; wsI.getCell(row, 4).font = { size: 9, color: { argb: C.cinza } };
    [2, 3, 4].forEach(cc => { wsI.getCell(row, cc).border = { bottom: bordaFina }; });
    if (i % 2) [2, 3, 4].forEach(cc => { wsI.getCell(row, cc).fill = fill('FFF8FAFD'); });
  });
  const rowConc = 5 + ind.length - 1;
  // v3.08: os indicadores também na aba Fluxo de Caixa, logo abaixo do fluxo
  {
    let fr = F.dac + 3;
    const t = wsF.getCell(fr, 1); t.value = 'INDICADORES DE VIABILIDADE'; t.font = { bold: true, size: 11, color: { argb: C.azul } };
    for (let k = 1; k <= 12; k++) wsF.getCell(fr, k).border = { bottom: { style: 'medium', color: { argb: C.azul } } };
    fr++;
    const h = wsF.getRow(fr++); [[1, 'Indicador'], [3, 'Valor'], [5, 'Observação']].forEach(([c, v]) => { const x = h.getCell(c); x.value = v; });
    wsF.mergeCells(fr - 1, 3, fr - 1, 4); wsF.mergeCells(fr - 1, 5, fr - 1, 12);
    for (let k = 1; k <= 12; k++) { const x = h.getCell(k); x.font = { bold: true, color: { argb: C.branco } }; x.fill = fill(C.azul); }
    ind.forEach(([k, f, v, fmt, obs], i) => {
      const row = fr++; const ri = 5 + i;
      wsF.getCell(row, 1).value = k;
      const conc = k === 'Conclusão';
      if (conc) wsF.mergeCells(row, 3, row, 12); else { wsF.mergeCells(row, 3, row, 4); wsF.mergeCells(row, 5, row, 12); }
      const c = wsF.getCell(row, 3); c.value = { formula: `Indicadores!C${ri}`, result: v }; if (fmt) c.numFmt = fmt; c.alignment = { horizontal: conc ? 'left' : 'right' }; c.font = { bold: true };
      if (!conc) { const o = wsF.getCell(row, 5); o.value = obs || ''; o.font = { size: 9, color: { argb: C.cinza } }; }
      for (let kk = 1; kk <= 12; kk++) { const x = wsF.getCell(row, kk); x.border = { bottom: bordaFina }; if (i % 2) x.fill = fill('FFF8FAFD'); }
      if (k === 'Conclusão') c.font = { bold: true, color: { argb: I.viavel ? C.verde : C.vermelho } };
    });
  }
  wsI.getCell(rowConc, 3).font = { bold: true, color: { argb: I.viavel ? C.verde : C.vermelho } };
  let ir = rowConc + 2;
  const estat = [
    ['Break-even EBITDA (mês)', I.break_even_ebitda_mes ? `${I.break_even_ebitda_mes} (${I.break_even_ebitda_label})` : 'não atinge'],
    ['CAC — custo de aquisição por cliente', I.cac ?? 'n/a'], ['LTV — valor do cliente no tempo', I.ltv ?? 'n/a'],
    ['LTV ÷ CAC', I.ltv_cac == null ? 'n/a' : Math.round(I.ltv_cac * 10) / 10 + 'x'], ['Clientes ativos no fim', I.clientes_final],
  ];
  wsI.getCell(ir, 2).value = 'Indicadores calculados pelo sistema (não recalculam no Excel)'; wsI.getCell(ir, 2).font = { bold: true, color: { argb: C.azul } }; ir++;
  estat.forEach(([k, v]) => { wsI.getCell(ir, 2).value = k; const c = wsI.getCell(ir, 3); c.value = v; if (typeof v === 'number') c.numFmt = FMT; c.alignment = { horizontal: 'right' }; ir++; });
  if (res.cenarios) {
    ir++; wsI.getCell(ir, 2).value = 'Cenários (calculados pelo sistema)'; wsI.getCell(ir, 2).font = { bold: true, color: { argb: C.azul } }; ir++;
    const cab = wsI.getRow(ir++); ['', 'Cenário', 'TIR anual · VPL', 'Payback · capital necessário · receita total'].forEach((t, i) => { if (i) { const c = cab.getCell(i + 1); c.value = t; c.font = { bold: true }; c.fill = fill(C.azulClaro); } });
    for (const [nome, c] of Object.entries(res.cenarios)) {
      wsI.getCell(ir, 2).value = `${nome} (volume ×${c.fatores.fatorVolume}, preço ×${c.fatores.fatorPreco}, custos ×${c.fatores.fatorCusto})`;
      wsI.getCell(ir, 3).value = `${c.tir_anual == null ? 'n/a' : (c.tir_anual * 100).toFixed(1) + '%'} · ${fmtR(c.vpl)}`;
      wsI.getCell(ir, 4).value = `${c.payback_simples_meses ?? '—'} meses · ${fmtR(c.exposicao_maxima_caixa)} · ${fmtR(c.receita_total)}`; ir++;
    }
  }
  impressao(wsI);

  // ═════════════════════ REALIZADO (dinâmico) ═════════════════════
  if (bp.historico?.meses?.length) {
    const H = bp.historico; const wsH = wb.addWorksheet('Realizado 12m');
    faixaTitulo(wsH, 'Realizado — QuickBooks', H.periodo ? `DRE dos meses fechados · ${H.periodo.inicio} a ${H.periodo.fim}` : '', H.meses.length + 2);
    const hr = wsH.getRow(4); hr.getCell(1).value = 'R$'; H.meses.forEach((m, k) => { hr.getCell(2 + k).value = m; }); hr.getCell(2 + H.meses.length).value = 'Total';
    hr.eachCell(c => { c.font = { bold: true, color: { argb: C.branco } }; c.fill = fill(C.azul); c.alignment = { horizontal: 'center' }; });
    wsH.getColumn(1).width = 30; for (let c = 2; c <= 2 + H.meses.length; c++) wsH.getColumn(c).width = 13;
    [['Receita', H.receita], ['Custos (COGS)', H.custos], ['Despesas', H.despesas], ['Lucro líquido', H.lucro]].forEach(([k, arr], i) => {
      const rw = wsH.getRow(5 + i); rw.getCell(1).value = k;
      arr.forEach((v, j) => { rw.getCell(2 + j).value = v; rw.getCell(2 + j).numFmt = FMT; });
      rw.getCell(2 + arr.length).value = { formula: `SUM(B${5 + i}:${colL(1 + arr.length)}${5 + i})`, result: arr.reduce((s2, x) => s2 + (Number(x) || 0), 0) }; rw.getCell(2 + arr.length).numFmt = FMT; rw.getCell(2 + arr.length).font = { bold: true };
    });
    impressao(wsH);
  }

  // ═════════════════════ RESUMO (painel) ═════════════════════
  const RL = 9; // colunas A..I (A = margem)
  wsR.getColumn(1).width = 2; for (let c = 2; c <= RL; c++) wsR.getColumn(c).width = 16; wsR.getColumn(2).width = 30;
  faixaTitulo(wsR, bp.titulo || 'Business Plan', `Atlantyx OS · gerado em ${new Date().toLocaleDateString('pt-BR')} · horizonte de ${N} meses a partir de ${res.meses[0]} · valores em R$`, RL);
  let rs = 4;
  // cartões de KPI: 4 por linha, 2 colunas cada (B-C, D-E, F-G, H-I)
  const Iref = k => `Indicadores!$C$${IROW[k]}`;
  const cards = [
    ['TIR anual', Iref('TIR anual'), I.tir_anual ?? 'n/a', '0.0%'],
    ['VPL (TMA ' + n0(p.taxa_desconto_anual) + '% a.a.)', Iref('VPL — valor presente líquido (horizonte)'), I.vpl, FMT],
    ['Payback (meses)', Iref('Payback simples (meses)'), I.payback_simples_meses ?? 'não se paga', INT],
    ['Capital necessário', Iref('Capital necessário (exposição máxima de caixa)'), I.exposicao_maxima_caixa, FMT],
    ['Receita no período', Iref('Receita bruta total'), I.receita_total, FMT],
    ['Lucro líquido no período', Iref('Lucro líquido total'), I.lucro_liquido_total, FMT],
    ['Margem EBITDA — último ano', `DRE!${ultAnoCol}${D.me}`, res.anos[nA - 1]?.margem_ebitda ?? 0, PCT],
    ['Conclusão', Iref('Conclusão'), I.viavel ? 'VIÁVEL' : 'NÃO VIÁVEL', null],
  ];
  for (let k = 0; k < cards.length; k++) {
    const [rot, f, v, fmt] = cards[k];
    const row = rs + Math.floor(k / 4) * 3, col = 2 + (k % 4) * 2;
    wsR.mergeCells(row, col, row, col + 1); wsR.mergeCells(row + 1, col, row + 1, col + 1);
    const a = wsR.getCell(row, col); a.value = rot.toUpperCase(); a.font = { size: 8, bold: true, color: { argb: C.cinza } }; a.alignment = { indent: 1, vertical: 'bottom' };
    const b = wsR.getCell(row + 1, col); b.value = { formula: f, result: v }; if (fmt) b.numFmt = fmt;
    b.font = { size: k === 7 ? 12 : 16, bold: true, color: { argb: k === 7 ? (I.viavel ? C.verde : C.vermelho) : C.azul } }; b.alignment = { indent: 1, vertical: 'middle', horizontal: 'left' };
    for (let cc = col; cc <= col + 1; cc++) { wsR.getCell(row, cc).fill = fill('FFF3F6FC'); wsR.getCell(row + 1, cc).fill = fill('FFF3F6FC');
      wsR.getCell(row, cc).border = { top: { style: 'medium', color: { argb: C.azul } } }; wsR.getCell(row + 1, cc).border = { bottom: bordaFina }; }
    wsR.getRow(row + 1).height = 28;
  }
  rs += 6 + 1;
  // tabela anual
  secao(wsR, rs, '', RL); wsR.getCell(rs, 2).value = 'DRE E CAIXA POR ANO'; wsR.getCell(rs, 2).font = { bold: true, color: { argb: C.azul } }; rs++;
  const hR = wsR.getRow(rs++); hR.getCell(2).value = 'R$';
  res.anos.forEach((a, k) => { hR.getCell(3 + k).value = 'Ano ' + a.ano; }); hR.getCell(3 + nA).value = 'Total';
  for (let c = 2; c <= 3 + nA; c++) { const x = hR.getCell(c); x.font = { bold: true, color: { argb: C.branco } }; x.fill = fill(C.azul); x.alignment = { horizontal: c > 2 ? 'right' : 'left' }; }
  const linhasR = [['Receita bruta', 'DRE', D.rb], ['Receita líquida', 'DRE', D.rl], ['Lucro bruto', 'DRE', D.lb], ['EBITDA', 'DRE', D.ebitda, 1], ['Lucro líquido', 'DRE', D.ll, 1],
    ['Fluxo de caixa livre', 'Fluxo de Caixa', F.fcl, 1], ['Saldo de caixa (fim do ano)', 'Fluxo de Caixa', F.cx], ['Margem bruta', 'DRE', D.mb, 0, 1], ['Margem EBITDA', 'DRE', D.me, 0, 1], ['Margem líquida', 'DRE', D.ml, 0, 1]];
  linhasR.forEach(([k, sh, row, bold, pct], i) => {
    const rw = wsR.getRow(rs++); rw.getCell(2).value = k;
    for (let a = 0; a <= nA; a++) { const col = a < nA ? colA(a) : colT; const c = rw.getCell(3 + a); c.value = { formula: `'${sh}'!${colL(col)}${row}`, result: (CACHE[sh + '!' + row] || [])[a] ?? 0 }; c.numFmt = pct ? PCT : FMT; }
    for (let c = 2; c <= 3 + nA; c++) { const x = rw.getCell(c); x.border = { bottom: bordaFina }; if (bold) x.font = { bold: true }; if (pct) x.font = { italic: true, color: { argb: C.cinza } }; if (i % 2) x.fill = fill('FFF8FAFD'); }
  });
  rs++;
  // textos
  const bloco = (titulo, texto) => {
    if (!texto || (Array.isArray(texto) && !texto.length)) return;
    secao(wsR, rs, '', RL); wsR.getCell(rs, 2).value = titulo; wsR.getCell(rs, 2).font = { bold: true, color: { argb: C.azul } }; rs++;
    // v3.08: cada parágrafo numa linha própria, com altura calculada (texto com quebras era cortado)
    const itens = Array.isArray(texto) ? texto.map(x => '•  ' + x) : String(texto).replace(/\r/g, '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    for (const t of itens) {
      wsR.mergeCells(rs, 2, rs, RL); const c = wsR.getCell(rs, 2); c.value = t; c.alignment = { wrapText: true, vertical: 'top' };
      wsR.getRow(rs).height = Math.min(409, Math.max(16, 15 * Math.ceil(t.length / 110))); rs++;
    }
    rs++;
  };
  bloco('A IDEIA', bp.ideia?.desc);
  bloco('RESUMO EXECUTIVO', nar.resumo_executivo);
  bloco('MODELO DE NEGÓCIO', nar.modelo_negocio);
  bloco('RISCOS', nar.riscos);
  bloco('MARCOS', nar.marcos);
  bloco('KPIs DE ACOMPANHAMENTO', nar.kpis_acompanhamento);
  bloco('OBSERVAÇÕES SOBRE OS DADOS', bp.avisos);
  wsR.getCell(rs, 2).value = 'Como usar: altere as células amarelas da aba Premissas — Receitas, Despesas, DRE, Fluxo de Caixa, Indicadores e este Resumo recalculam. Para levar as mudanças ao sistema, use "Importar Excel editado" na tela do Business Plan.';
  wsR.mergeCells(rs, 2, rs, RL); wsR.getCell(rs, 2).font = { size: 9, italic: true, color: { argb: C.cinza } }; wsR.getCell(rs, 2).alignment = { wrapText: true }; wsR.getRow(rs).height = 28;
  wsR.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  wsR.headerFooter = { oddFooter: '&L&8Atlantyx OS · Business Plan&R&8Página &P de &N' };

  const buf = await wb.xlsx.writeBuffer();
  const nome = 'BusinessPlan_' + String(bp.titulo || 'plano').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').substring(0, 50) + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  return { base64: Buffer.from(buf).toString('base64'), nome };
}

function fmtR(v) { return v == null ? '—' : 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }

// ═════════════════════ IMPORTAÇÃO ═════════════════════
// Lê a aba Premissas de um Excel gerado (e editado) e devolve as premissas no formato do motor.
// Séries (tipo "serie", do plano dinâmico) não são editáveis no Excel: vêm do plano salvo.
export async function lerPremissasExcel(base64, premissasAtuais = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(base64, 'base64'));
  const ws = wb.getWorksheet('Premissas');
  if (!ws) throw new Error('A planilha não tem a aba "Premissas" — use um Excel baixado pelo sistema.');
  const val = c => { let v = c?.value; if (v && typeof v === 'object') { if ('result' in v) v = v.result; else if (v.richText) v = v.richText.map(x => x.text).join(''); else if ('text' in v) v = v.text; } return v; };
  const num = c => { const v = val(c); if (v == null || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : null; };
  const txt = c => { const v = val(c); return v == null ? '' : String(v).trim(); };
  let marcador = false; ws.eachRow((row) => { if (txt(row.getCell(1)) === MARCADOR) marcador = true; });
  if (!marcador) throw new Error('Esta planilha não foi gerada pelo Business Plan do Atlantyx OS.');
  const achar = re => { let r = null; ws.eachRow((row, i) => { if (r == null && re.test(txt(row.getCell(1)))) r = i; }); return r; };
  const g = (re) => { const r = achar(re); return r ? num(ws.getCell(r, 2)) : null; };
  const pct = v => v == null ? null : Math.round(v * 100 * 10000) / 10000;
  const out = { ...premissasAtuais };
  const set = (k, v) => { if (v != null) out[k] = v; };
  set('taxa_desconto_anual', pct(g(/^Taxa de desconto/i)));
  set('deducoes_pct', pct(g(/^Dedu[cç][oõ]es/i)));
  set('ir_csll_pct', pct(g(/^IR\/CSLL/i)));
  set('prazo_recebimento_dias', g(/^Prazo m[eé]dio/i));
  set('crescimento_perpetuidade_pct', pct(g(/^Crescimento na perpetuidade/i)));
  set('saldo_inicial', g(/^Saldo de caixa inicial/i));
  set('meses', g(/^Horizonte/i));
  { const r = achar(/^In[ií]cio do plano/i); const v = r ? txt(ws.getCell(r, 2)) : ''; if (/^\d{4}-\d{2}$/.test(v)) out.inicio = v; }
  out.marketing = { ...(premissasAtuais.marketing || {}) };
  { const v = pct(g(/^Marketing e vendas — %/i)); if (v != null) out.marketing.pct_receita = v; }
  { const v = g(/^Marketing e vendas — valor fixo/i); if (v != null) out.marketing.fixo_mensal = v; }
  { const v = pct(g(/^Marketing fixo — reajuste/i)); if (v != null) out.marketing.reajuste_anual_pct = v; }
  const SECAO = /^(RECEITAS|CUSTOS VARI|PESSOAL|DESPESAS FIXAS|INVESTIMENTOS|JUSTIFICATIVAS)/;
  const linhasTabela = (re) => {
    const t = achar(re); if (!t) return null;
    const lin = [];
    for (let r = t + 2; r <= ws.rowCount; r++) {
      const a = txt(ws.getCell(r, 1));
      if (SECAO.test(a)) break;
      const tudoVazio = Array.from({ length: 10 }, (_, k) => val(ws.getCell(r, k + 1))).every(v => v == null || v === '');
      if (tudoVazio) break;
      if (a) lin.push(ws.getRow(r));
    }
    return lin;
  };
  const seriesAnt = (arr) => Object.fromEntries((arr || []).filter(x => String(x.tipo || '').toLowerCase() === 'serie').map(x => [x.nome, x]));
  const rec = linhasTabela(/^RECEITAS$/);
  if (rec) {
    const ant = seriesAnt(premissasAtuais.receitas);
    out.receitas = rec.map(row => {
      const nome = txt(row.getCell(1)), tipo = (txt(row.getCell(2)) || 'recorrente').toLowerCase();
      if (tipo === 'serie') return ant[nome] || null;
      return { nome, tipo: tipo === 'unico' ? 'unico' : tipo === 'marco' ? 'marco' : 'recorrente', preco: num(row.getCell(3)) ?? 0, clientes_iniciais: num(row.getCell(4)) ?? 0,
        novos_mes: [num(row.getCell(5)) ?? 0, num(row.getCell(6)) ?? 0, num(row.getCell(7)) ?? 0], churn_mensal_pct: pct(num(row.getCell(8))) ?? 0,
        reajuste_anual_pct: pct(num(row.getCell(9))) ?? 0, mes_inicio: num(row.getCell(10)) ?? 1 };
    }).filter(Boolean);
  }
  const cv = linhasTabela(/^CUSTOS VARI/);
  if (cv) out.custos_variaveis = cv.map(row => ({ nome: txt(row.getCell(1)), pct_receita: pct(num(row.getCell(2))) ?? 0 }));
  const pes = linhasTabela(/^PESSOAL$/);
  if (pes) out.pessoal = pes.map(row => { const o = { cargo: txt(row.getCell(1)), qtd: num(row.getCell(2)) ?? 1, salario: num(row.getCell(3)) ?? 0, encargos_pct: pct(num(row.getCell(4))) ?? 0,
    mes_inicio: num(row.getCell(5)) ?? 1, reajuste_anual_pct: pct(num(row.getCell(6))) ?? 0 }; const f = num(row.getCell(7)); if (f) o.mes_fim = f; return o; });
  const fix = linhasTabela(/^DESPESAS FIXAS/);
  if (fix) {
    const ant = seriesAnt(premissasAtuais.despesas_fixas);
    out.despesas_fixas = fix.map(row => {
      const nome = txt(row.getCell(1)), grupo = (txt(row.getCell(2)) || 'geral').toLowerCase(), tipo = (txt(row.getCell(6)) || 'fixo').toLowerCase();
      if (tipo === 'serie') return ant[nome] ? { ...ant[nome], grupo } : null;
      return { nome, grupo: ['pessoal', 'marketing'].includes(grupo) ? grupo : 'geral', valor_mensal: num(row.getCell(3)) ?? 0, mes_inicio: num(row.getCell(4)) ?? 1, reajuste_anual_pct: pct(num(row.getCell(5))) ?? 0 };
    }).filter(Boolean);
  }
  const inv = linhasTabela(/^INVESTIMENTOS/);
  if (inv) out.investimentos = inv.map(row => ({ descricao: txt(row.getCell(1)), valor: num(row.getCell(2)) ?? 0, mes: num(row.getCell(3)) ?? 1, depreciacao_meses: num(row.getCell(4)) ?? 0 }));
  return out;
}
