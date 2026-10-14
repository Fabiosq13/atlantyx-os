// lib/docx-md.js — v3.134 · Markdown → Word (.docx) no padrão Atlantyx
// Converte os documentos da Esteira de Entrega (ERT, Plano de Projeto, Plano de Testes, Relatório de Qualidade,
// Pacote para a Fábrica) em Word com capa, controle do documento, sumário, cabeçalho/rodapé e tabelas formatadas.
// Markdown aceito: # a ####, parágrafos, listas (- * 1.), tabelas com |, **negrito**, *itálico*, `código`, ---,
// e a linha "<!-- quebra -->" para quebra de página.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, Header, Footer,
  PageNumber, ShadingType, BorderStyle, LevelFormat, TableOfContents, PageBreak } from 'docx';

const AZUL = '0B2A4A', CIANO = '00A3AA', CINZA = '5B6573', CLARO = 'EAF6F7';
const FONTE = 'Calibri';

function runs(txt, base = {}) {
  const out = []; const partes = String(txt ?? '').split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  for (const p of partes) {
    if (!p) continue;
    if (/^\*\*[^*]+\*\*$/.test(p)) out.push(new TextRun({ ...base, text: p.slice(2, -2), bold: true }));
    else if (/^`[^`]+`$/.test(p)) out.push(new TextRun({ ...base, text: p.slice(1, -1), font: 'Consolas', color: '3A3A3A' }));
    else if (/^\*[^*]+\*$/.test(p)) out.push(new TextRun({ ...base, text: p.slice(1, -1), italics: true }));
    else out.push(new TextRun({ ...base, text: p }));
  }
  return out.length ? out : [new TextRun({ ...base, text: '' })];
}
const celulas = l => { let s = l.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|')) s = s.slice(0, -1); return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|')); };
const borda = { style: BorderStyle.SINGLE, size: 4, color: 'C9D3DD' };

function tabela(linhas) {
  const rows = linhas.filter(l => !/^[\s|:-]+$/.test(l) || !/-/.test(l)).filter(l => l.replace(/[\s|]/g, '')).map(celulas);
  if (!rows.length) return null;
  const nCol = Math.max(...rows.map(r => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: borda, bottom: borda, left: borda, right: borda, insideHorizontal: borda, insideVertical: borda },
    rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0,
      children: Array.from({ length: nCol }, (_, k) => new TableCell({
        shading: i === 0 ? { fill: AZUL, type: ShadingType.CLEAR, color: 'auto' } : (i % 2 === 0 ? { fill: 'F5F8FA', type: ShadingType.CLEAR, color: 'auto' } : undefined),
        margins: { top: 50, bottom: 50, left: 90, right: 90 },
        children: String(r[k] ?? '').split(/<br\s*\/?>/i).map(t => new Paragraph({ spacing: { after: 0 }, children: runs(t, i === 0 ? { bold: true, color: 'FFFFFF', size: 18 } : { size: 18 }) })),
      })) })),
  });
}

export function mdParaBlocos(md) {
  const out = []; const ls = String(md || '').replace(/\r/g, '').split('\n');
  let i = 0, inst = 0, emNum = false;
  while (i < ls.length) {
    const l = ls[i];
    if (/^\s*<!--\s*quebra\s*-->\s*$/i.test(l)) { out.push(new Paragraph({ children: [new PageBreak()] })); i++; continue; }
    if (/^\s*\|/.test(l)) { const bloco = []; while (i < ls.length && /^\s*\|/.test(ls[i])) bloco.push(ls[i++]); const t = tabela(bloco); if (t) { out.push(t); out.push(new Paragraph({ spacing: { after: 80 }, children: [] })); } emNum = false; continue; }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const nv = h[1].length; out.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][nv - 1], children: runs(h[2].replace(/\*\*/g, '')) })); i++; emNum = false; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CIANO, space: 1 } }, children: [] })); i++; continue; }
    const b = l.match(/^(\s*)[-*•]\s+(.*)$/);
    if (b) { out.push(new Paragraph({ bullet: { level: Math.min(2, Math.floor(b[1].length / 2)) }, spacing: { after: 40 }, children: runs(b[2]) })); i++; continue; }
    const n = l.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (n) { if (!emNum) { inst++; emNum = true; } out.push(new Paragraph({ numbering: { reference: 'atx-num', level: Math.min(2, Math.floor(n[1].length / 3)), instance: inst }, spacing: { after: 40 }, children: runs(n[2]) })); i++; continue; }
    if (!l.trim()) { i++; if (emNum && !/^\s*\d+[.)]\s/.test(ls[i] || '')) emNum = false; continue; }
    const par = [l.trim()]; i++;
    while (i < ls.length && ls[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s|\s*\||\s*<!--)/.test(ls[i])) par.push(ls[i++].trim());
    const txt = par.join(' ');
    const destaque = /^>\s?/.test(txt);
    out.push(new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.JUSTIFIED, ...(destaque ? { shading: { fill: CLARO, type: ShadingType.CLEAR, color: 'auto' }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: CIANO, space: 6 } } } : {}),
      children: runs(txt.replace(/^>\s?/, '')) }));
    emNum = false;
  }
  return out;
}

// meta: { titulo, subtitulo, projeto, cliente, versao, data, status, autor, aprovado_por, aprovado_em }
export async function gerarDocx(md, meta = {}) {
  const hoje = meta.data || new Date().toLocaleDateString('pt-BR');
  const capa = [
    new Paragraph({ spacing: { before: 1800, after: 120 }, children: [new TextRun({ text: 'ATLANTYX', bold: true, color: CIANO, size: 28, characterSpacing: 120 })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: CIANO, space: 4 } }, spacing: { after: 600 }, children: [new TextRun({ text: 'Metodologia Atlantyx de Gestão e Entrega de Projetos Tecnológicos', color: CINZA, size: 18 })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: meta.titulo || 'Documento', bold: true, color: AZUL, size: 52 })] }),
    ...(meta.subtitulo ? [new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: meta.subtitulo, color: CINZA, size: 28 })] })] : []),
    tabela(['| Campo | Informação |', '|---|---|',
      `| Projeto | ${meta.projeto || '—'} |`, `| Cliente | ${meta.cliente || '—'} |`, `| Versão | ${meta.versao || '1'} |`, `| Data | ${hoje} |`,
      `| Situação | ${meta.status === 'aprovado' ? 'Aprovado' + (meta.aprovado_por ? ' por ' + meta.aprovado_por : '') + (meta.aprovado_em ? ' em ' + meta.aprovado_em : '') : 'Rascunho para revisão'} |`,
      `| Elaborado por | ${meta.autor || 'Atlantyx — com apoio de IA e revisão humana'} |`]),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  const sumario = meta.sumario === false ? [] : [
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: 'Sumário', bold: true, color: AZUL, size: 32 })] }),
    new TableOfContents('Sumário', { hyperlink: true, headingStyleRange: '1-3' }),
    new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: 'Se o sumário aparecer vazio, clique com o botão direito sobre ele e escolha "Atualizar campo".', italics: true, color: CINZA, size: 16 })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  const doc = new Document({
    creator: 'Atlantyx OS', title: meta.titulo || 'Documento', description: meta.subtitulo || '',
    features: { updateFields: true },
    styles: {
      default: {
        document: { run: { font: FONTE, size: 21, color: '1F2933' }, paragraph: { spacing: { line: 276 } } },
        heading1: { run: { font: FONTE, size: 32, bold: true, color: AZUL }, paragraph: { spacing: { before: 360, after: 160 } } },
        heading2: { run: { font: FONTE, size: 26, bold: true, color: AZUL }, paragraph: { spacing: { before: 280, after: 120 } } },
        heading3: { run: { font: FONTE, size: 23, bold: true, color: CIANO }, paragraph: { spacing: { before: 220, after: 100 } } },
        heading4: { run: { font: FONTE, size: 21, bold: true, color: CINZA }, paragraph: { spacing: { before: 160, after: 80 } } },
      },
    },
    numbering: { config: [{ reference: 'atx-num', levels: [0, 1, 2].map(level => ({ level, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level], text: ['%1.', '%2)', '%3.'][level], alignment: AlignmentType.START, style: { paragraph: { indent: { left: 540 + level * 360, hanging: 300 } } } })) }] },
    sections: [{
      properties: { page: { margin: { top: 1300, bottom: 1200, left: 1300, right: 1200 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9D3DD', space: 2 } },
        children: [new TextRun({ text: 'ATLANTYX', bold: true, color: CIANO, size: 16 }), new TextRun({ text: '   ' + (meta.titulo || '') + (meta.projeto ? ' · ' + meta.projeto : ''), color: CINZA, size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
        new TextRun({ text: 'Confidencial · v' + (meta.versao || '1') + ' · ' + hoje + ' · Página ', color: CINZA, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: CINZA, size: 16 }),
        new TextRun({ text: ' de ', color: CINZA, size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], color: CINZA, size: 16 })] })] }) },
      children: [...capa, ...sumario, ...mdParaBlocos(md)],
    }],
  });
  return Packer.toBuffer(doc);
}
