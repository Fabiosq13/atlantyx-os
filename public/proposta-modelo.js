// public/proposta-modelo.js — v3.379 · Modelo oficial de proposta Atlantyx (Técnica · Comercial · Técnica-Comercial)
// Fiel aos arquivos-padrão enviados pelo fundador: A4, margens 1100/1500/1000 twips, Montserrat 10,5 pt cor 404040,
// capa (logo, faixas 0F243E/1F3864), cabeçalho com logo + título em itálico cinza, rodapé "Atlanteam … | Página X de Y",
// títulos em faixa azul-marinho, subtítulos 1F3864, tabelas com cabeçalho 0F243E, zebra EAF1F8 e total D6E4F0.
// O Word é montado sobre o pacote /modelos/proposta-atlantyx.docx (estilos, cabeçalho, rodapé, numeração e logo
// do arquivo original, sem dados de cliente); o PDF reproduz as mesmas medidas no pdfmake.
(function () {
  const X = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const C = { navy: '0F243E', azul: '1F3864', texto: '404040', zebra: 'EAF1F8', claro: 'D6E4F0', borda: 'BFBFBF', cinza: '808080' };

  // ───────────── capítulos de cada modelo (ordem, título e quebra de página como nos arquivos-padrão) ─────────────
  // fonte: 'ia' (texto redigido) · 'sis' (tabela montada pelo sistema) · 'ambos'
  const CAP = {
    dados: { t: 'Dados do Projeto e da Empresa', q: 1 }, apresentacao: { t: 'Apresentação da Atlanteam', q: 1 }, contexto: { t: 'Contexto e Justificativas', q: 1 },
    objetivos: { t: 'Objetivos do Projeto', q: 0 }, escopo: { t: 'Escopo dos Serviços — Solução Técnica Proposta', q: 0 }, resumo_escopo: { t: 'Resumo do Escopo Contratado', q: 1 },
    diferenciais: { t: 'Diferenciais Técnicos e Estratégicos', q: 1 }, investimento: { t: 'Resumo Executivo do Investimento', q: 1 }, rate_card: { t: 'Rate Card Atlantyx — Padrão Oficial', q: 1 },
    bonus: { t: 'Bônus e Condições Especiais', q: 1 }, equipe: { t: 'Organograma e Equipe do Projeto', q: 1 }, cronograma_exec: { t: 'Cronograma de Execução', q: 1 },
    cronograma_ff: { t: 'Cronograma Físico-Financeiro', q: 1 }, entregaveis: { t: 'Entregáveis Detalhados por Fase', q: 1 }, premissas_exec: { t: 'Premissas e Condições de Execução', q: 1 },
    premissas_com: { t: 'Premissas e Condições Comerciais', q: 1 }, garantias: { t: 'Garantias, Papéis e Responsabilidades', q: 0 }, suporte: { t: 'Suporte Pós-Implantação e SLA', q: 1 },
    pagamento: { t: 'Prazo e Forma de Pagamento', q: 0 }, validade: { t: 'Validade da Proposta', q: 1 }, aceite: { t: 'Aceite da Proposta', q: 0 },
  };
  const MODELOS = {
    tecnica: { nome: 'Proposta Técnica', capa: 'PROPOSTA TÉCNICA', cab: 'Proposta Técnica', sub: 'Versão técnica — sem valores comerciais',
      caps: ['dados', 'apresentacao', 'contexto', 'objetivos', 'escopo', 'diferenciais', 'equipe', 'cronograma_exec', 'entregaveis', 'premissas_exec', 'garantias', 'suporte', 'validade', 'aceite'] },
    comercial: { nome: 'Proposta Comercial', capa: 'PROPOSTA COMERCIAL', cab: 'Proposta Comercial',
      caps: ['dados', 'resumo_escopo', 'investimento', 'rate_card', 'bonus', 'cronograma_ff', 'premissas_com', 'pagamento', 'validade', 'aceite'] },
    tecnica_comercial: { nome: 'Proposta Técnica-Comercial', capa: 'PROPOSTA TÉCNICA-COMERCIAL', cab: 'Proposta Técnica-Comercial',
      caps: ['dados', 'apresentacao', 'contexto', 'objetivos', 'escopo', 'investimento', 'rate_card', 'bonus', 'equipe', 'cronograma_ff', 'entregaveis', 'premissas_com', 'garantias', 'suporte', 'pagamento', 'validade', 'aceite'] },
  };

  // ───────────── texto redigido (markdown simples) → blocos ─────────────
  // "### título" ou "N.N Título" → subtítulo · "- item" → marcador · "a) texto" → alínea · "**Rótulo:** texto" → rótulo
  function mdBlocos(t) {
    const out = []; let par = [];
    const fecha = () => { if (par.length) { out.push({ t: 'p', texto: par.join(' ') }); par = []; } };
    String(t || '').replace(/\r/g, '').split('\n').forEach(l0 => { const l = l0.trim();
      if (!l) return fecha();
      let m;
      if ((m = l.match(/^#{1,6}\s*(.+)$/))) { fecha(); out.push({ t: 'sub', texto: m[1].replace(/\*\*/g, '') }); }
      else if (/^\d+\.\d+(\.\d+)?\s+\S/.test(l) && l.length < 110) { fecha(); out.push({ t: 'sub', texto: l.replace(/\*\*/g, '') }); }
      else if ((m = l.match(/^[-•*]\s+(.+)$/))) { fecha(); out.push({ t: 'bullet', texto: m[1] }); }
      else if ((m = l.match(/^([a-z])\)\s+(.+)$/i))) { fecha(); out.push({ t: 'alinea', letra: m[1].toLowerCase(), texto: m[2] }); }
      else if ((m = l.match(/^\*\*([^*]{2,80}?):?\*\*:?\s*(.*)$/))) { fecha(); out.push({ t: 'rotulo', rotulo: m[1].replace(/:$/, '') + ':', texto: m[2] }); }
      else { fecha(); par.push(l); fecha(); } // cada linha é um parágrafo (cartas e endereçamentos ficam em linhas próprias)
    }); fecha(); return out;
  }
  // **negrito** dentro do texto → segmentos
  const segs = t => String(t || '').split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s => /^\*\*.+\*\*$/.test(s) ? { b: true, s: s.slice(2, -2) } : { s });

  // ───────────────────────────── WORD (DOCX) ─────────────────────────────
  const rPr = o => `<w:rPr>${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/><w:iCs/>' : ''}<w:color w:val="${o.cor || C.texto}"/>${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}</w:rPr>`;
  const run = (txt, o = {}) => `<w:r>${rPr(o)}<w:t xml:space="preserve">${X(txt)}</w:t></w:r>`;
  const runs = (txt, o = {}) => segs(txt).map(g => run(g.s, { ...o, b: o.b || g.b })).join('');
  const pX = (inner, pp = '') => `<w:p><w:pPr>${pp}</w:pPr>${inner}</w:p>`;
  const sp = (a, b, extra = '') => `<w:spacing${a != null ? ` w:before="${a}"` : ''}${b != null ? ` w:after="${b}"` : ''}${extra}/>`;
  const quebraX = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const borda = `<w:tcBorders>${['top', 'left', 'bottom', 'right'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="${C.borda}"/>`).join('')}</w:tcBorders>`;
  const tblPr = (w) => `<w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`;
  const celX = (w, txt, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${borda}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}<w:tcMar><w:top w:w="${o.mt || 60}" w:type="dxa"/><w:left w:w="${o.ml || 80}" w:type="dxa"/><w:bottom w:w="${o.mt || 60}" w:type="dxa"/><w:right w:w="${o.ml || 80}" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>`
    + String(txt == null ? '' : txt).split('\n').map(l => pX(runs(l, { b: o.b, i: o.i, cor: o.cor || C.texto, sz: o.sz || 16 }), (o.jc ? `<w:jc w:val="${o.jc}"/>` : '') + '<w:spacing w:line="252" w:lineRule="auto"/>')).join('') + '</w:tc>';
  function blocoX(b, ctx) {
    switch (b.t) {
      case 'quebra': return quebraX;
      case 'h1': return (b.quebra ? quebraX : '') + pX(run(b.texto, { b: 1, cor: 'FFFFFF', sz: 28 }), `<w:pStyle w:val="Ttulo1"/><w:shd w:val="clear" w:color="auto" w:fill="${C.navy}"/>${sp(480, 240)}`);
      case 'p': return pX(runs(b.texto, { cor: C.texto }), `${sp(null, 160, ' w:line="276" w:lineRule="auto"')}<w:jc w:val="${b.jc || 'both'}"/>`);
      case 'sub': return pX(run(b.texto, { b: 1, cor: C.azul, sz: 22 }), sp(200, 100));
      case 'bullet': return pX(runs(b.texto, { cor: C.texto }), `<w:pStyle w:val="PargrafodaLista"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>${sp(null, 100, ' w:line="276" w:lineRule="auto"')}<w:jc w:val="both"/>`);
      case 'alinea': return pX(run(b.letra + ') ', { b: 1, cor: C.azul }) + runs(b.texto, { cor: C.texto }), `${sp(null, 80, ' w:line="276" w:lineRule="auto"')}<w:ind w:left="200"/><w:jc w:val="both"/>`);
      case 'rotulo': return pX(run(b.rotulo + ' ', { b: 1, cor: C.azul }) + runs(b.texto, { cor: C.texto }), `${sp(null, 120, ' w:line="276" w:lineRule="auto"')}<w:jc w:val="both"/>`);
      case 'nota': return pX(runs(b.texto, { i: 1, cor: C.texto, sz: 17 }), `${sp(60, 120)}<w:jc w:val="both"/>`);
      case 'indice': return b.itens.map(t => pX(run(t, { b: 1, cor: C.navy, sz: 22 }), `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9026"/></w:tabs>${sp(null, 120)}`)).join('');
      case 'kv': return `<w:tbl>${tblPr(9350)}<w:tblGrid><w:gridCol w:w="2800"/><w:gridCol w:w="6550"/></w:tblGrid>${b.linhas.map(([k, v]) => `<w:tr>${celX(2800, k, { fill: C.claro, b: 1, cor: '000000', sz: 19, mt: 80, ml: 100 })}${celX(6550, v, { cor: '000000', sz: 19, mt: 80, ml: 100 })}</w:tr>`).join('')}</w:tbl>` + pX('', sp(null, 120));
      case 'tabela': { const W = b.larguras || b.cab.map(() => Math.floor(9350 / b.cab.length)), tot = W.reduce((a, x) => a + x, 0);
        return `<w:tbl>${tblPr(tot)}<w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
          + `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${b.cab.map((h, k) => celX(W[k], h, { fill: b.corCab || C.navy, b: 1, cor: 'FFFFFF', sz: 17, jc: (b.alinhar || [])[k] })).join('')}</w:tr>`
          + b.linhas.map((l, r) => { const total = b.total && r === b.linhas.length - 1; return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${l.map((v, k) => celX(W[k], v, { fill: total ? C.claro : r % 2 ? C.zebra : null, b: total || (b.negritoCol0 && k === 0), cor: total ? '000000' : C.texto, sz: 16, jc: (b.alinhar || [])[k] })).join('')}</w:tr>`; }).join('')
          + '</w:tbl>' + (b.nota ? pX(runs(b.nota, { i: 1, cor: C.texto, sz: 16 }), `${sp(60, 160)}<w:jc w:val="both"/>`) : pX('', sp(null, 120))); }
      case 'assinatura': return pX('', sp(400, 200)) + `<w:tbl>${tblPr(9350)}<w:tblGrid><w:gridCol w:w="4675"/><w:gridCol w:w="4675"/></w:tblGrid><w:tr>${[b.esq, b.dir].map(s => `<w:tc><w:tcPr><w:tcW w:w="4675" w:type="dxa"/>${borda}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>${pX(run(s[0] + ' ', { b: 1, cor: '000000', sz: 20 }) + run(s[1] + ' ', { cor: C.texto, sz: 19 }) + run(s[2], { i: 1, cor: C.texto, sz: 19 }), '<w:jc w:val="center"/>')}</w:tc>`).join('')}</w:tr></w:tbl>`;
      case 'capa': return capaX(b, ctx);
    }
    return '';
  }
  const LOGO_CAPA = `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="2667000" cy="666750"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Logo Atlantyx"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId7"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="2667000" cy="666750"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const SECT = (h, f) => `<w:sectPr><w:headerReference w:type="default" r:id="${h}"/><w:footerReference w:type="default" r:id="${f}"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1500" w:right="1100" w:bottom="1000" w:left="1100" w:header="600" w:footer="708" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
  function capaX(b) {
    const c = (txt, o, pp) => pX(run(txt, o), pp + '<w:jc w:val="center"/>');
    return pX(LOGO_CAPA, sp(500, 200) + '<w:jc w:val="center"/>')
      + c(b.empresa, { cor: C.azul, sz: 22 }, sp(null, 600)) + pX('', sp(null, 600)) + pX('', sp(null, 600))
      + c(b.titulo, { b: 1, cor: 'FFFFFF', sz: 36 }, `<w:shd w:val="clear" w:color="auto" w:fill="${C.navy}"/>${sp(1200, 200)}`)
      + c(b.projeto, { b: 1, cor: 'FFFFFF', sz: 26 }, `<w:shd w:val="clear" w:color="auto" w:fill="${C.azul}"/>${sp(null, 200)}`)
      + (b.sub ? c(b.sub, { i: 1, b: 1, cor: 'FFFFFF', sz: 18 }, `<w:shd w:val="clear" w:color="auto" w:fill="${b.subCor || '7F7F7F'}"/>${sp(null, 200)}`) : '')
      + (b.area ? c(b.area, { b: 1, cor: C.navy, sz: 24 }, sp(400, 100)) : pX('', sp(400, 100)))
      + c(b.cliente, { b: 1, cor: C.navy, sz: 24 }, sp(null, 60))
      + (b.cnpj ? c('CNPJ: ' + b.cnpj, { cor: C.texto, sz: 20 }, sp(null, 600)) : pX('', sp(null, 600)))
      + pX('', sp(800, 100)) + c(b.proponente, { cor: C.texto, sz: 20 }, sp(800, 100))
      + c(b.data, { i: 1, cor: C.texto, sz: 20 }, '') + (b.revisao ? c(b.revisao, { i: 1, cor: C.texto, sz: 20 }, '') : '')
      + `<w:p><w:pPr>${SECT('rId8', 'rId9')}</w:pPr></w:p>`;
  }
  let _zipProm = null;
  const _JSZip = () => window.JSZip ? Promise.resolve(window.JSZip) : (_zipProm = _zipProm || new Promise((ok, err) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = () => ok(window.JSZip); s.onerror = () => { _zipProm = null; err(new Error('não carregou o gerador de Word')); }; document.head.appendChild(s); }));
  async function gerarDocx(doc) {
    const JSZip = await _JSZip(); const r = await fetch('/modelos/proposta-atlantyx.docx'); if (!r.ok) throw new Error('modelo de proposta não encontrado');
    const z = await JSZip.loadAsync(await r.arrayBuffer());
    const corpo = doc.blocos.map(b => blocoX(b, doc)).join('') + SECT('rId10', 'rId11');
    z.file('word/document.xml', (await z.file('word/document.xml').async('string')).replace('{{CORPO}}', () => corpo));
    for (const h of ['word/header1.xml', 'word/header2.xml']) z.file(h, (await z.file(h).async('string')).replace('{{CABECALHO}}', () => X(doc.cabecalho)));
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // ───────────────────────────── PDF (pdfmake, mesmas medidas) ─────────────────────────────
  const TW = t => t / 20; // twips → pt
  const hex = c => '#' + c;
  const segsPdf = (t, o = {}) => segs(t).map(g => ({ text: g.s, bold: o.b || g.b, italics: o.i, color: hex(o.cor || C.texto), fontSize: o.fs }));
  function blocoPdf(b) {
    switch (b.t) {
      case 'quebra': return [{ text: '', pageBreak: 'after' }];
      case 'h1': return [{ table: { widths: ['*'], body: [[{ text: b.texto, bold: true, color: '#FFFFFF', fontSize: 14, fillColor: hex(C.navy), margin: [3, 2, 3, 2] }]] }, layout: 'noBorders', margin: [0, TW(480) * (b.topo ? 0 : 1), 0, TW(240)], pageBreak: b.quebra ? 'before' : undefined, headlineLevel: 1 }];
      case 'p': return [{ text: segsPdf(b.texto), alignment: b.jc === 'left' ? 'left' : 'justify', lineHeight: 1.15, margin: [0, 0, 0, TW(160)] }];
      case 'sub': return [{ text: b.texto, bold: true, color: hex(C.azul), fontSize: 11, margin: [0, TW(200), 0, TW(100)] }];
      case 'bullet': return [{ ul: [{ text: segsPdf(b.texto), alignment: 'justify', lineHeight: 1.15 }], margin: [8, 0, 0, TW(100)] }];
      case 'alinea': return [{ text: [{ text: b.letra + ') ', bold: true, color: hex(C.azul) }, ...segsPdf(b.texto)], alignment: 'justify', lineHeight: 1.15, margin: [TW(200), 0, 0, TW(80)] }];
      case 'rotulo': return [{ text: [{ text: b.rotulo + ' ', bold: true, color: hex(C.azul) }, ...segsPdf(b.texto)], alignment: 'justify', lineHeight: 1.15, margin: [0, 0, 0, TW(120)] }];
      case 'nota': return [{ text: segsPdf(b.texto, { i: 1, fs: 8.5 }), alignment: 'justify', margin: [0, 3, 0, 6] }];
      case 'indice': return b.itens.map(t => ({ text: t, bold: true, color: hex(C.navy), fontSize: 11, margin: [0, 0, 0, TW(120)] }));
      case 'kv': return [{ table: { widths: [TW(2800) - 10, '*'], body: b.linhas.map(([k, v]) => [{ text: k, bold: true, fontSize: 9.5, color: '#000000', fillColor: hex(C.claro), margin: [4, 3, 4, 3] }, { text: segsPdf(v, { fs: 9.5, cor: '000000' }), margin: [4, 3, 4, 3] }]) }, layout: grade, margin: [0, 0, 0, 8] }];
      case 'tabela': { const W = b.larguras || b.cab.map(() => 1), soma = W.reduce((a, x) => a + x, 0), larg = W.map(w => (w / soma) * 485);
        return [{ table: { headerRows: 1, dontBreakRows: true, widths: larg, body: [b.cab.map((h, k) => ({ text: h, bold: true, color: '#FFFFFF', fontSize: 8.5, fillColor: hex(b.corCab || C.navy), alignment: (b.alinhar || [])[k] || 'left', margin: [3, 2, 3, 2] })),
          ...b.linhas.map((l, r) => { const total = b.total && r === b.linhas.length - 1; return l.map((v, k) => ({ text: segsPdf(String(v == null ? '' : v), { fs: 8, b: total || (b.negritoCol0 && k === 0), cor: total ? '000000' : C.texto }), fillColor: total ? hex(C.claro) : r % 2 ? hex(C.zebra) : null, alignment: (b.alinhar || [])[k] || 'left', margin: [3, 2, 3, 2] })); })] }, layout: grade, margin: [0, 0, 0, b.nota ? 3 : 8] },
          ...(b.nota ? [{ text: segsPdf(b.nota, { i: 1, fs: 8 }), alignment: 'justify', margin: [0, 0, 0, 8] }] : [])]; }
      case 'assinatura': return [{ table: { widths: ['*', '*'], body: [[b.esq, b.dir].map(s => ({ text: [{ text: s[0] + ' ', bold: true, color: '#000000', fontSize: 10 }, { text: s[1] + ' ', fontSize: 9.5 }, { text: s[2], italics: true, fontSize: 9.5 }], alignment: 'center', margin: [5, 4, 5, 4] }))] }, layout: grade, margin: [0, 20, 0, 0] }];
    }
    return [];
  }
  const grade = { hLineColor: () => '#' + C.borda, vLineColor: () => '#' + C.borda, hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 };
  function capaPdf(b, logo) {
    const faixa = (t, fill, fs, o = {}) => ({ table: { widths: ['*'], body: [[{ text: t, bold: true, italics: o.i, color: '#FFFFFF', fontSize: fs, alignment: 'center', fillColor: fill, margin: [4, 3, 4, 3] }]] }, layout: 'noBorders', margin: [0, o.antes || 0, 0, TW(200)] });
    return [logo ? { image: logo, width: 210, alignment: 'center', margin: [0, TW(500), 0, TW(200)] } : { text: '', margin: [0, 40, 0, 0] },
      { text: b.empresa, alignment: 'center', color: hex(C.azul), fontSize: 11, margin: [0, 0, 0, TW(1800)] },
      faixa(b.titulo, hex(C.navy), 18, { antes: TW(1200) }), faixa(b.projeto, hex(C.azul), 13), ...(b.sub ? [faixa(b.sub, '#' + (b.subCor || '7F7F7F'), 9, { i: 1 })] : []),
      { text: b.area || ' ', alignment: 'center', bold: true, color: hex(C.navy), fontSize: 12, margin: [0, TW(400), 0, TW(100)] },
      { text: b.cliente, alignment: 'center', bold: true, color: hex(C.navy), fontSize: 12, margin: [0, 0, 0, 3] },
      { text: b.cnpj ? 'CNPJ: ' + b.cnpj : ' ', alignment: 'center', fontSize: 10, margin: [0, 0, 0, TW(600)] },
      { text: b.proponente, alignment: 'center', fontSize: 10, margin: [0, TW(1600), 0, TW(100)] },
      { text: b.data, alignment: 'center', italics: true, fontSize: 10 }, ...(b.revisao ? [{ text: b.revisao, alignment: 'center', italics: true, fontSize: 10 }] : []),
      { text: '', pageBreak: 'after' }];
  }
  function pdfDef(doc, logo, fonte) {
    const capa = doc.blocos.find(b => b.t === 'capa'), resto = doc.blocos.filter(b => b.t !== 'capa');
    return { pageSize: 'A4', pageMargins: [TW(1100), TW(1500), TW(1100), TW(1000)], info: { title: doc.cabecalho, author: 'Atlantyx' },
      defaultStyle: { font: fonte, fontSize: 10.5, color: hex(C.texto) },
      header: () => ({ margin: [TW(1100), TW(600), TW(1100), 0], columns: [logo ? { image: logo, width: 66 } : { text: '' }, { text: doc.cabecalho, italics: true, color: hex(C.cinza), fontSize: 7.5, alignment: 'right', margin: [0, 4, 0, 0] }] }),
      footer: (p, n) => ({ text: `${doc.rodape} | Página ${p} de ${n}`, alignment: 'center', color: hex(C.cinza), fontSize: 7.5, margin: [0, 18, 0, 0] }),
      content: [...(capa ? capaPdf(capa, logo) : []), ...resto.flatMap(blocoPdf)] };
  }
  window.ATXModelo = { MODELOS, CAP, mdBlocos, gerarDocx, pdfDef };
})();
