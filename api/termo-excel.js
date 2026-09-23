// api/termo-excel.js — v2.52
// Gera o Termo de Aceite de Faturamento no LAYOUT OFICIAL (modelo CPFL), preenchendo o
// template real (api/modelos/termo_aceite.xlsx) em vez de montar uma planilha do zero.
// Preserva mesclagens, formatação, fórmulas de total e o bloco de assinaturas.
//
// POST { termo_id }                         → busca o termo no banco e preenche
// POST { cabecalho, empresas }              → preenche a partir do que a tela mandou (marcos)
// Resposta: o .xlsx binário (Content-Disposition: attachment)

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(__dirname, 'modelos', 'termo_aceite.xlsx');

const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
const fmtBR = v => (num(v)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Escreve mantendo o RÓTULO que já está na célula ("Fase: " + valor). Se a célula tem texto
// com ":" o valor entra depois dele; senão substitui.
function setRotulado(ws, ref, valor, rotuloPadrao) {
  const cell = ws.getCell(ref);
  const atual = typeof cell.value === 'string' ? cell.value : (cell.value?.richText ? cell.value.richText.map(r => r.text).join('') : '');
  const m = atual.match(/^([^:]{2,60}:)/);
  const rotulo = m ? m[1] : (rotuloPadrao || '');
  cell.value = (rotulo ? rotulo + ' ' : '') + String(valor ?? '').trim();
}

async function carregarTermoDoBanco(termo_id) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  const t = (await sql`SELECT * FROM termos_faturamento WHERE id = ${termo_id}`)[0];
  if (!t) throw new Error('Termo não encontrado');
  const emps = await sql`SELECT * FROM termos_empresas WHERE termo_id = ${termo_id} ORDER BY ordem, empresa`;
  return { cabecalho: t, empresas: emps };
}

export async function gerarTermoExcel({ cabecalho: c = {}, empresas = [] }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.getWorksheet('Termo_Aceite') || wb.worksheets[0];

  // ── Cabeçalho (mantém os rótulos do modelo) ──
  setRotulado(ws, 'A3', c.projeto || c.nome_servico || '', 'Nome do Serviço/Projeto:');
  setRotulado(ws, 'G3', c.fase || '', 'Fase:');
  setRotulado(ws, 'J3', c.contratada || 'Atlanteam', 'Contratada:');
  if (c.linha_orcamento) setRotulado(ws, 'A5', c.linha_orcamento, 'Linha de orçamento (Conta contábil):');
  if (c.capex_opex) setRotulado(ws, 'J5', c.capex_opex, 'CAPEX ou OPEX :');
  setRotulado(ws, 'A7', c.contratante || 'CPFL', 'Contratante:');
  setRotulado(ws, 'G7', c.cnpj_fornecedor || '', 'CNPJ fornecedor subcontrado:');
  setRotulado(ws, 'J7', c.periodo_medicao || '', 'Período de Medição:');
  ws.getCell('A10').value = 'Marco do Projeto:\n' + String(c.marco_projeto || '').trim();
  ws.getCell('G11').value = c.numero_termo ? (isNaN(Number(c.numero_termo)) ? c.numero_termo : Number(c.numero_termo)) : '';
  ws.getCell('J11').value = c.parcela ? (isNaN(Number(c.parcela)) ? c.parcela : Number(c.parcela)) : ws.getCell('J11').value;
  if (c.descricao_servicos) ws.getCell('A14').value = String(c.descricao_servicos);
  if (c.valor_mensal_sustentacao) ws.getCell('I14').value = 'Valor mensal Sustentacao : ' + fmtBR(c.valor_mensal_sustentacao) + '\n';

  // ── Rateio: linhas 20 a 26 (7 vagas no modelo) ──
  const PRIMEIRA = 20, ULTIMA = 26;
  const vagas = ULTIMA - PRIMEIRA + 1;
  if (empresas.length > vagas) {
    // insere linhas extras antes do total, copiando o estilo da linha 20
    const extra = empresas.length - vagas;
    ws.spliceRows(ULTIMA + 1, 0, ...Array.from({ length: extra }, () => []));
    for (let i = 0; i < extra; i++) {
      const src = ws.getRow(PRIMEIRA), dst = ws.getRow(ULTIMA + 1 + i);
      src.eachCell({ includeEmpty: true }, (cell, col) => { const d = dst.getCell(col); d.style = { ...cell.style }; });
      dst.height = src.height;
    }
  }
  const linhaTotal = PRIMEIRA + Math.max(empresas.length, vagas);
  empresas.forEach((e, i) => {
    const r = PRIMEIRA + i;
    ws.getCell(`A${r}`).value = e.empresa || '';
    ws.getCell(`C${r}`).value = e.contrato || '';
    ws.getCell(`D${r}`).value = e.ncm || '';
    ws.getCell(`E${r}`).value = e.centro_custo || e.ordem_cc || '';
    ws.getCell(`F${r}`).value = e.diferimento || '';
    ws.getCell(`G${r}`).value = num(e.valor_total_contrato) || null;
    ws.getCell(`I${r}`).value = e.percentual != null && e.percentual !== '' ? (num(e.percentual) > 1 ? num(e.percentual) / 100 : num(e.percentual)) : null;
    ws.getCell(`J${r}`).value = num(e.valor_ja_faturado) || 0;
    ws.getCell(`K${r}`).value = num(e.valor_parcela_anterior) || 0;
    ws.getCell(`L${r}`).value = num(e.valor_parcela) || 0;
    ws.getCell(`M${r}`).value = e.saldo_contrato != null && e.saldo_contrato !== '' ? num(e.saldo_contrato) : { formula: `G${r}-J${r}-L${r}` };
  });
  // limpa vagas não usadas
  for (let r = PRIMEIRA + empresas.length; r < linhaTotal; r++) ['A','C','D','E','F','G','I','J','K','L','M'].forEach(col => { ws.getCell(`${col}${r}`).value = null; });
  // fórmulas de total apontam para o intervalo certo
  const fim = linhaTotal - 1;
  ['G','I','J','K','L','M'].forEach(col => { ws.getCell(`${col}${linhaTotal}`).value = { formula: `SUM(${col}${PRIMEIRA}:${col}${fim})` }; });

  // ── Desempenho do contrato ──
  const previstoMes = c.previsto_mes != null ? num(c.previsto_mes) : (c.valor_mensal_sustentacao ? num(c.valor_mensal_sustentacao) : null);
  const off = linhaTotal - 27;   // deslocamento se inseriu linhas
  const L = n => n + off;
  if (previstoMes != null) ws.getCell(`A${L(31)}`).value = previstoMes;
  ws.getCell(`B${L(31)}`).value = { formula: `L${linhaTotal}` };
  ws.getCell(`C${L(31)}`).value = { formula: `A${L(31)}-B${L(31)}` };
  ws.getCell(`A${L(33)}`).value = { formula: `A${L(31)}*G11` };
  ws.getCell(`B${L(33)}`).value = { formula: `J${PRIMEIRA}+B${L(31)}` };
  ws.getCell(`C${L(33)}`).value = { formula: `A${L(33)}-B${L(33)}` };
  ws.getCell(`A${L(35)}`).value = { formula: `IF(G${PRIMEIRA}=0,0,A${L(31)}/G${PRIMEIRA})` };
  ws.getCell(`B${L(35)}`).value = { formula: `IF(G${PRIMEIRA}=0,0,B${L(31)}/G${PRIMEIRA})` };
  ws.getCell(`C${L(35)}`).value = { formula: `A${L(35)}-B${L(35)}` };
  if (c.justificativa_variacao) ws.getCell(`D${L(30)}`).value = 'Justificativa da variação: ' + c.justificativa_variacao;

  // remove a aba auxiliar se existir (o modelo trazia "Plan1" com rascunho)
  const aux = wb.getWorksheet('Plan1'); if (aux) wb.removeWorksheet(aux.id);
  return await wb.xlsx.writeBuffer();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });
  try {
    let dados;
    if (req.body?.termo_id) dados = await carregarTermoDoBanco(req.body.termo_id);
    else if (req.body?.cabecalho) dados = { cabecalho: req.body.cabecalho, empresas: req.body.empresas || [] };
    else return res.status(400).json({ success: false, error: 'Envie termo_id ou cabecalho+empresas' });
    const buf = await gerarTermoExcel(dados);
    const c = dados.cabecalho || {};
    const nome = `Termo_Aceite_${String(c.projeto || 'projeto').replace(/[^\w]+/g, '_')}_${String(c.periodo_medicao || '').replace(/[^\w]+/g, '-')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    return res.status(200).send(Buffer.from(buf));
  } catch (e) {
    console.error('[termo-excel]', e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
