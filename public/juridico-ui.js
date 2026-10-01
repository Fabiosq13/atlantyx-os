// public/juridico-ui.js — v3.35 · Jurídico: Análise de Contratos (como advogado interno da Atlantyx)
// Anexa o contrato (PDF, DOCX ou TXT) — lê o texto, os COMENTÁRIOS e as alterações marcadas do documento —,
// junta os comentários da equipe, analisa cláusula a cláusula e gera o roteiro + resumo para a conversa com a
// contraparte. Exporta em PDF e guarda o histórico.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (t, c) => (window.toast ? toast(t, c || 'success') : alert(t));
  const S = { arquivos: [], analise: null, meta: null, historico: [] };
  const KV = 'atx:juridico:contratos';

  // ── leitura dos arquivos ────────────────────────────────────────────────
  function carregarScript(src) { return new Promise((ok, err) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => err(new Error('não carregou ' + src)); document.head.appendChild(s); }); }
  async function jszip() { if (window.JSZip) return window.JSZip; await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'); return window.JSZip; }
  const xmlTexto = x => String(x || '').replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  async function lerDocx(buf) {
    const Z = await jszip(); const zip = await Z.loadAsync(buf);
    const doc = await zip.file('word/document.xml')?.async('string') || '';
    const texto = xmlTexto(doc.replace(/<w:del\b[\s\S]*?<\/w:del>/g, '')); // texto atual, sem o que foi excluído nas revisões
    const comentarios = [];
    const cx = await zip.file('word/comments.xml')?.async('string');
    if (cx) {
      const trechos = {}; const re = /<w:commentRangeStart w:id="(\d+)"\/>([\s\S]*?)<w:commentRangeEnd w:id="\1"\/>/g; let m;
      while ((m = re.exec(doc))) trechos[m[1]] = xmlTexto(m[2]).replace(/\s+/g, ' ').substring(0, 300);
      const rc = /<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g;
      while ((m = rc.exec(cx))) { const id = (m[1].match(/w:id="(\d+)"/) || [])[1]; const autor = (m[1].match(/w:author="([^"]*)"/) || [])[1] || '';
        comentarios.push({ autor, texto: xmlTexto(m[2]).replace(/\s+/g, ' '), trecho: trechos[id] || '' }); }
    }
    // alterações marcadas (controle de alterações) também contam como comentário da contraparte/equipe
    const ri = /<w:ins\b([^>]*)>([\s\S]*?)<\/w:ins>/g; let m2; const ins = [];
    while ((m2 = ri.exec(doc)) && ins.length < 60) { const t = xmlTexto(m2[2]).replace(/\s+/g, ' '); if (t.length > 3) ins.push({ autor: (m2[1].match(/w:author="([^"]*)"/) || [])[1] || '', texto: 'Inclusão proposta: "' + t.substring(0, 400) + '"' }); }
    const rd = /<w:del\b([^>]*)>([\s\S]*?)<\/w:del>/g;
    while ((m2 = rd.exec(doc)) && ins.length < 120) { const t = String(m2[2]).replace(/<w:delText[^>]*>([\s\S]*?)<\/w:delText>/g, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); if (t.length > 3) ins.push({ autor: (m2[1].match(/w:author="([^"]*)"/) || [])[1] || '', texto: 'Exclusão proposta: "' + t.substring(0, 400) + '"' }); }
    return { texto, comentarios: comentarios.concat(ins) };
  }
  async function lerPdf(buf) {
    if (typeof _carregarPdfJs === 'function') await _carregarPdfJs();
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    let texto = ''; const comentarios = [];
    for (let p = 1; p <= Math.min(doc.numPages, 120); p++) {
      const pg = await doc.getPage(p); const tc = await pg.getTextContent();
      texto += `\n[pág. ${p}] ` + tc.items.map(i => i.str).join(' ');
      try { (await pg.getAnnotations()).forEach(a => { const c = a.contentsObj?.str || a.contents || ''; if (c && /Text|Highlight|FreeText|Underline|StrikeOut|Squiggly|Popup/.test(a.subtype || '')) comentarios.push({ autor: a.titleObj?.str || a.title || '', texto: `[pág. ${p}] ` + c }); }); } catch (_) {}
    }
    if (texto.replace(/\[pág\. \d+\]/g, '').trim().length < 100) texto += '\n(PDF sem texto selecionável — parece digitalizado. Envie a versão em Word ou um PDF com texto.)';
    return { texto: texto.trim(), comentarios };
  }
  async function lerArquivo(f) {
    const buf = await f.arrayBuffer();
    if (/\.docx$/i.test(f.name) || /wordprocessingml/.test(f.type)) return lerDocx(buf);
    if (/\.pdf$/i.test(f.name) || /pdf/.test(f.type)) return lerPdf(buf);
    if (/\.(txt|md|rtf)$/i.test(f.name) || /^text\//.test(f.type)) return { texto: new TextDecoder().decode(buf), comentarios: [] };
    if (/\.doc$/i.test(f.name)) throw new Error('arquivo .doc (Word antigo) — salve como .docx ou PDF');
    throw new Error('formato não suportado (use PDF, DOCX ou TXT)');
  }
  async function adicionarArquivos(input) {
    const fs = [...(input.files || [])]; input.value = '';
    for (const f of fs) {
      const item = { nome: f.name, tamanho: f.size, status: 'lendo…', texto: '', comentarios: [] }; S.arquivos.push(item); renderArquivos();
      try { const r = await lerArquivo(f); Object.assign(item, r, { status: 'ok' }); }
      catch (e) { item.status = 'erro: ' + e.message; }
      renderArquivos();
    }
  }
  function removerArquivo(i) { S.arquivos.splice(i, 1); renderArquivos(); }
  function renderArquivos() {
    const box = $('jcArquivos'); if (!box) return;
    box.innerHTML = S.arquivos.map((a, i) => `<div style="display:flex;gap:8px;align-items:center;background:var(--bg3);border:1px solid var(--bd);border-radius:6px;padding:6px 9px;margin-top:6px;font-size:11px;">
      <span style="background:var(--blue);color:#fff;border-radius:3px;padding:1px 6px;font-size:9px;">${esc((a.nome.split('.').pop() || '').toUpperCase())}</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(a.nome)}">${esc(a.nome)}</span>
      <span style="color:${a.status === 'ok' ? 'var(--green)' : /erro/.test(a.status) ? 'var(--red)' : 'var(--t2)'};">${a.status === 'ok' ? Math.round(a.texto.length / 1000) + ' mil caracteres · ' + a.comentarios.length + ' comentário(s)' : esc(a.status)}</span>
      <button onclick="JUR.removerArquivo(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;" title="Remover">×</button></div>`).join('');
  }

  // ── tela ─────────────────────────────────────────────────────────────────
  function abrir() {
    const box = $('jcApp'); if (!box) return;
    if (!box.dataset.ok) { box.dataset.ok = '1'; box.innerHTML = esqueleto(); }
    historico();
  }
  function esqueleto() {
    return `<div style="background:linear-gradient(135deg,rgba(156,109,255,.16),rgba(79,124,255,.06));border:1px solid rgba(156,109,255,.25);border-radius:10px;padding:14px 18px;margin-bottom:13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="font-size:22px;">⚖</div>
      <div style="flex:1;min-width:240px;"><div style="font-family:var(--H);font-size:15px;font-weight:700;">Análise de Contratos — advogado interno da Atlantyx</div>
        <div style="font-size:10.5px;color:var(--t2);margin-top:2px;">Anexe o contrato (com os comentários e as alterações marcadas), diga o que precisa garantir e receba a análise de risco cláusula a cláusula, a redação sugerida e o roteiro da conversa com a contraparte.</div></div>
      <span class="tag on">Claude IA</span></div>
    <div class="kg k2">
      <div class="panel"><div class="ph"><div class="pt">Contrato</div></div><div class="pb">
        <div class="fg"><label class="fl">Contrato / assunto</label><input class="fi" id="jcTitulo" placeholder="Ex.: Contrato de sustentação de dados — CPFL 2027"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="fg" style="margin:0 0 10px;"><label class="fl">Contraparte</label><input class="fi" id="jcContraparte" placeholder="Ex.: CPFL Energia S.A."/></div>
          <div class="fg" style="margin:0 0 10px;"><label class="fl">Papel da Atlantyx</label><select class="fsel" id="jcPapel"><option>Contratada (fornecedora)</option><option>Contratante</option><option>Parceira / co-fornecedora</option><option>Subcontratada</option></select></div>
          <div class="fg" style="margin:0 0 10px;"><label class="fl">Tipo de contrato</label><select class="fsel" id="jcTipo"><option>Prestação de serviços (projeto)</option><option>Sustentação / SLA</option><option>Alocação de profissionais</option><option>Licença de software / SaaS</option><option>NDA — confidencialidade</option><option>Parceria / revenda</option><option>Contrato público (licitação)</option><option>Aditivo</option><option>Outro</option></select></div>
          <div class="fg" style="margin:0 0 10px;"><label class="fl">Valor e prazo <span style="color:var(--t3);">(opcional)</span></label><input class="fi" id="jcValor" placeholder="Ex.: R$ 1,2 mi · 24 meses"/></div>
        </div>
        <div style="background:var(--bg4);border:1px dashed var(--bd2);border-radius:8px;padding:12px;margin-bottom:10px;">
          <div style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);margin-bottom:8px;letter-spacing:1px;">ANEXAR CONTRATO — PDF, DOCX (lê comentários e alterações marcadas) ou TXT</div>
          <input type="file" id="jcArquivo" multiple accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" style="display:none;" onchange="JUR.adicionarArquivos(this)"/>
          <button class="btn btn-g" style="width:100%;" onclick="document.getElementById('jcArquivo').click()">📎 Anexar contrato e anexos</button>
          <div id="jcArquivos"></div>
          <details style="margin-top:8px;"><summary style="font-size:10.5px;color:var(--t2);cursor:pointer;">ou colar o texto do contrato</summary><textarea class="fta" id="jcTexto" style="min-height:90px;margin-top:6px;" placeholder="Cole aqui o texto do contrato ou das cláusulas"></textarea></details>
        </div>
        <div class="fg"><label class="fl">Comentários da equipe / pontos de atenção</label><textarea class="fta" id="jcComentarios" style="min-height:70px;" placeholder="Ex.: a multa da cláusula 12 está alta; precisamos de reajuste anual por IPCA; o cliente quer código-fonte — nossos aceleradores não podem ir junto..."></textarea></div>
        <div class="fg"><label class="fl">O que a Atlantyx precisa garantir nesta negociação</label><textarea class="fta" id="jcObjetivos" style="min-height:55px;" placeholder="Ex.: teto de responsabilidade = 12 meses de contrato; pagamento em 30 dias; manter a PI dos nossos componentes"></textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button class="btn btn-p" id="jcBtn" onclick="JUR.analisar()" style="grid-column:1/-1;">⚖ Analisar como advogado da Atlantyx</button>
          <button class="btn btn-g" id="jcBtnRap" onclick="JUR.analisar('rapida')" style="font-size:11px;">Análise rápida</button>
          <button class="btn btn-g" onclick="JUR.limpar()" style="font-size:11px;">Novo contrato</button>
        </div>
      </div></div>
      <div class="panel"><div class="ph"><div class="pt">Resultado da análise</div><span class="tag off" id="jcTag">Aguardando</span></div>
        <div class="pb" id="jcResultado"><div style="color:var(--t3);font-size:11px;text-align:center;padding:30px;">Anexe o contrato e clique em Analisar.<br/><span style="font-size:10px;">A análise defende os interesses da Atlantyx e não substitui a revisão de um advogado habilitado antes da assinatura.</span></div></div>
        <div id="jcAcoes" style="display:none;padding:10px 14px;border-top:1px solid var(--bd);">
          <div style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);margin-bottom:8px;">EXPORTAR E COMPARTILHAR</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-p" onclick="JUR.pdf()" style="font-size:10.5px;">📄 Gerar PDF — análise, conversa e contraproposta</button>
            <button class="btn btn-g" onclick="JUR.copiarResumo()" style="font-size:10.5px;">📋 Copiar resumo para a contraparte</button>
            <button class="btn btn-gn" onclick="JUR.copiarContraproposta()" style="font-size:10.5px;">📋 Copiar contraproposta</button>
            <button class="btn btn-g" onclick="JUR.analisar()" style="font-size:10.5px;">↻ Reanalisar</button>
          </div></div>
      </div>
    </div>
    <div class="panel"><div class="ph"><div class="pt">Análises anteriores</div><button class="btn btn-g" style="font-size:9px;padding:3px 8px;" onclick="JUR.historico()">↻</button></div><div class="pb" id="jcHist" style="font-size:11px;color:var(--t3);">—</div></div>`;
  }
  function limpar() {
    ['jcTitulo', 'jcContraparte', 'jcValor', 'jcTexto', 'jcComentarios', 'jcObjetivos'].forEach(id => { const e = $(id); if (e) e.value = ''; });
    S.arquivos = []; S.analise = null; S.meta = null; renderArquivos();
    $('jcResultado').innerHTML = '<div style="color:var(--t3);font-size:11px;text-align:center;padding:30px;">Anexe o contrato e clique em Analisar.</div>';
    $('jcAcoes').style.display = 'none'; const t = $('jcTag'); t.textContent = 'Aguardando'; t.className = 'tag off';
  }

  async function analisar(modo) {
    const lidos = S.arquivos.filter(a => a.status === 'ok');
    const texto = lidos.map(a => (lidos.length > 1 ? `\n===== ARQUIVO: ${a.nome} =====\n` : '') + a.texto).join('\n') + (($('jcTexto')?.value || '').trim() ? '\n' + $('jcTexto').value.trim() : '');
    if (S.arquivos.some(a => a.status === 'lendo…')) return nota('Aguarde terminar a leitura do arquivo', 'error');
    if (texto.trim().length < 200) return nota('Anexe o contrato (PDF, DOCX ou TXT) ou cole o texto', 'error');
    const meta = { titulo: $('jcTitulo').value.trim() || lidos[0]?.nome || 'Contrato', contraparte: $('jcContraparte').value.trim(), papel: $('jcPapel').value, tipo: $('jcTipo').value,
      valor: $('jcValor').value.trim(), objetivos: $('jcObjetivos').value.trim(), comentarios_equipe: $('jcComentarios').value.trim(),
      comentarios_documento: lidos.flatMap(a => a.comentarios), arquivos: lidos.map(a => a.nome) };
    const btn = $(modo === 'rapida' ? 'jcBtnRap' : 'jcBtn'); const t0 = btn.innerHTML; btn.disabled = true; btn.textContent = 'Analisando…';
    const tag = $('jcTag'); tag.textContent = 'Analisando…'; tag.className = 'tag on';
    $('jcResultado').innerHTML = `<div style="color:var(--blue);font-family:var(--M);font-size:11px;padding:24px;text-align:center;">O advogado da Atlantyx está lendo ${Math.round(texto.length / 1000)} mil caracteres${meta.comentarios_documento.length ? ' e ' + meta.comentarios_documento.length + ' comentário(s) do documento' : ''}…<br><span style="color:var(--t3);">pode levar até 2 minutos</span></div>`;
    try {
      const r = await fetch('/api/s1-strategy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'contrato_analisar', ...meta, texto, modo }) });
      const d = await r.json().catch(() => ({ success: false, error: r.status === 504 ? 'A análise passou do tempo do servidor — use "Análise rápida"' : 'Servidor respondeu ' + r.status }));
      if (!d.success) throw new Error(d.error || 'falha');
      S.analise = d.analise; S.meta = Object.assign(meta, { em: new Date().toISOString(), truncado: d.truncado });
      render(); await salvarHistorico();
      nota('Análise do contrato concluída');
    } catch (e) {
      tag.textContent = 'Erro'; tag.className = 'tag hot';
      $('jcResultado').innerHTML = '<div style="color:var(--red);font-size:11.5px;padding:14px;">' + esc(e.message) + '</div>';
    }
    btn.disabled = false; btn.innerHTML = t0;
  }

  const corRisco = r => /crit|alto/i.test(r || '') ? 'var(--red)' : /m[eé]dio/i.test(r || '') ? 'var(--gold)' : 'var(--green)';
  const bloco = (titulo, cor, html) => html ? `<div style="margin-bottom:12px;"><div style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:${cor};margin-bottom:6px;letter-spacing:.5px;">${titulo}</div>${html}</div>` : '';
  function render() {
    const a = S.analise || {}, m = S.meta || {}; const tag = $('jcTag');
    tag.textContent = a.recomendacao || 'Concluída'; tag.className = 'tag ' + (/N[ÃA]O/.test(a.recomendacao || '') ? 'hot' : /AJUSTES|NEGOCIAR/.test(a.recomendacao || '') ? 'on' : 'live');
    const dc = a.dados_contrato || {}, fin = a.financeiro || {}, cv = a.conversa_contraparte || {};
    const cc = (a.clausulas_criticas || []).slice().sort((x, y) => (x.prioridade || 99) - (y.prioridade || 99));
    $('jcResultado').innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;padding:12px;background:var(--bg4);border-radius:8px;margin-bottom:12px;">
        <div style="text-align:center;min-width:70px;"><div style="font-size:24px;font-weight:800;color:${corRisco(a.nivel_risco)};">${esc(a.nota_risco ?? '—')}</div><div style="font-family:var(--M);font-size:8.5px;color:var(--t2);">RISCO /10</div></div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:700;">${esc(m.titulo)}${m.contraparte ? ' <span style="color:var(--t2);font-weight:500;">· ' + esc(m.contraparte) + '</span>' : ''}</div>
          <div style="font-size:12px;font-weight:700;color:${corRisco(a.nivel_risco)};margin-top:2px;">${esc(a.recomendacao || '')} · risco ${esc(a.nivel_risco || '')}</div>
          <div style="font-size:11.5px;color:var(--t1);margin-top:4px;line-height:1.55;">${esc(a.resumo_executivo || '')}</div></div></div>
      ${m.truncado ? '<div style="font-size:10.5px;color:var(--gold);margin-bottom:8px;">⚠ Contrato muito longo — a análise considerou os primeiros 150 mil caracteres.</div>' : ''}
      ${bloco('Dados do contrato', 'var(--blue)', Object.values(dc).some(Boolean) ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px;">' + Object.entries(dc).filter(([, v]) => v).map(([k, v]) => `<div style="background:var(--bg3);border-radius:6px;padding:6px 8px;font-size:11px;"><div style="font-size:9px;color:var(--t2);text-transform:uppercase;">${esc(k.replace(/_/g, ' '))}</div>${esc(v)}</div>`).join('') + '</div>' : '')}
      ${bloco('Cláusulas que precisam de ajuste (' + cc.length + ')', 'var(--red)', cc.map((c, i) => `<details ${i < 3 ? 'open' : ''} style="border-left:3px solid ${corRisco(c.risco)};background:var(--bg4);border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:11.5px;">
          <summary style="cursor:pointer;"><b>${esc(c.clausula || '')}</b> · ${esc(c.tema || '')} <span style="color:${corRisco(c.risco)};font-weight:700;">${esc(c.risco || '')}</span></summary>
          ${c.trecho ? `<div style="color:var(--t2);font-style:italic;margin:5px 0;">“${esc(c.trecho)}”</div>` : ''}
          <div style="margin:3px 0;"><b>Problema:</b> ${esc(c.problema || '')}</div>
          ${c.impacto_para_atlantyx ? `<div style="margin:3px 0;"><b>Impacto para a Atlantyx:</b> ${esc(c.impacto_para_atlantyx)}</div>` : ''}
          ${c.redacao_sugerida ? `<div style="margin-top:5px;background:var(--b2);border-radius:5px;padding:7px 9px;"><b style="color:var(--blue);">Redação sugerida:</b> ${esc(c.redacao_sugerida)}</div>` : ''}</details>`).join(''))}
      ${bloco('Cláusulas ausentes', 'var(--gold)', (a.clausulas_ausentes || []).map(c => `<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--bd);"><b>${esc(c.tema)}</b> — ${esc(c.por_que_importa || '')}${c.redacao_sugerida ? `<div style="color:var(--blue);margin-top:3px;">Sugestão: ${esc(c.redacao_sugerida)}</div>` : ''}</div>`).join(''))}
      ${bloco('Exposição financeira', 'var(--or)', Object.values(fin).some(Boolean) ? Object.entries(fin).filter(([, v]) => v).map(([k, v]) => `<div style="font-size:11.5px;padding:3px 0;"><b>${esc(k.replace(/_/g, ' '))}:</b> ${esc(v)}</div>`).join('') : '')}
      ${bloco('Obrigações da Atlantyx', 'var(--blue)', (a.obrigacoes_atlantyx || []).map(o => `<div style="font-size:11.5px;padding:3px 0;">• ${esc(o.obrigacao)}${o.prazo ? ' <span style="color:var(--t2);">· prazo: ' + esc(o.prazo) + '</span>' : ''}${o.penalidade ? ' <span style="color:var(--red);">· ' + esc(o.penalidade) + '</span>' : ''}</div>`).join(''))}
      ${bloco('Comentários analisados (' + (a.comentarios_analisados || []).length + ')', 'var(--pu)', (a.comentarios_analisados || []).map(c => `<div style="background:var(--bg4);border-radius:6px;padding:7px 9px;margin-bottom:5px;font-size:11.5px;"><div style="color:var(--t2);">${c.autor ? '<b>' + esc(c.autor) + ':</b> ' : ''}“${esc(c.comentario)}”</div><div style="margin-top:3px;">${esc(c.analise || '')}</div>${c.posicao_recomendada ? `<div style="color:var(--green);margin-top:3px;"><b>Posição:</b> ${esc(c.posicao_recomendada)}</div>` : ''}</div>`).join(''))}
      ${bloco('Roteiro da conversa com a contraparte', 'var(--green)', (cv.objetivo || (cv.pontos || []).length) ? `
        <div style="background:var(--g2);border-radius:8px;padding:10px 12px;font-size:11.5px;line-height:1.6;">
          ${cv.objetivo ? `<div><b>Objetivo:</b> ${esc(cv.objetivo)}</div>` : ''}${cv.tom ? `<div><b>Tom:</b> ${esc(cv.tom)}</div>` : ''}${cv.abertura ? `<div style="margin-top:4px;"><b>Abertura:</b> “${esc(cv.abertura)}”</div>` : ''}
          ${(cv.pontos || []).map((p, i) => `<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(34,211,163,.25);"><b>${i + 1}. ${esc(p.tema)}</b><div>Nossa posição: ${esc(p.nossa_posicao || '')}</div>${p.argumento ? `<div>Argumento: ${esc(p.argumento)}</div>` : ''}${p.proposta_redacao ? `<div>Proposta: ${esc(p.proposta_redacao)}</div>` : ''}${p.alternativa_aceitavel ? `<div style="color:var(--gold);">Se não aceitarem: ${esc(p.alternativa_aceitavel)}</div>` : ''}${p.limite ? `<div style="color:var(--red);">Limite: ${esc(p.limite)}</div>` : ''}</div>`).join('')}
          ${(cv.concessoes_possiveis || []).length ? `<div style="margin-top:8px;"><b>Podemos ceder:</b> ${cv.concessoes_possiveis.map(esc).join(' · ')}</div>` : ''}
          ${(cv.perguntas_para_contraparte || []).length ? `<div style="margin-top:6px;"><b>Perguntar à contraparte:</b><br>${cv.perguntas_para_contraparte.map(q => '• ' + esc(q)).join('<br>')}</div>` : ''}</div>` : '')}
      ${cv.resumo_para_enviar ? bloco('Resumo para enviar à contraparte', 'var(--blue)', `<textarea class="fta" id="jcResumo" style="min-height:160px;font-size:11.5px;">${esc(cv.resumo_para_enviar)}</textarea>`) : ''}
      ${a.parecer_final ? `<div style="padding:12px;background:var(--bg3);border-radius:8px;border-left:3px solid ${corRisco(a.nivel_risco)};"><div style="font-family:var(--M);font-size:9px;text-transform:uppercase;color:var(--t2);margin-bottom:5px;">PARECER DO ADVOGADO</div><div style="font-size:12px;line-height:1.7;white-space:pre-wrap;">${esc(a.parecer_final)}</div></div>` : ''}
      ${textoContraproposta(a.contraproposta, m) ? `<div style="margin-top:14px;padding:12px;border:1px solid rgba(34,211,163,.4);background:var(--g2);border-radius:8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><div style="font-family:var(--M);font-size:9.5px;text-transform:uppercase;color:var(--green);font-weight:700;flex:1;">Contraproposta da Atlantyx (${(a.contraproposta.itens || []).length} cláusula(s))</div>
          <button class="btn btn-g" style="font-size:10px;padding:3px 9px;" onclick="JUR.copiarContraproposta()">📋 Copiar</button></div>
        <textarea class="fta" id="jcContra" style="min-height:240px;font-size:11.5px;line-height:1.55;">${esc(textoContraproposta(a.contraproposta, m))}</textarea>
        <div style="font-size:10px;color:var(--t2);margin-top:4px;">Edite à vontade antes de enviar — o PDF usa o texto deste campo.</div></div>` : ''}
      <div style="font-size:9.5px;color:var(--t3);margin-top:10px;">Análise gerada por IA para apoiar a negociação; não substitui a revisão de um advogado habilitado antes da assinatura.</div>`;
    $('jcAcoes').style.display = 'block';
  }
  // contraproposta formal em texto corrido (para copiar, editar e enviar)
  function textoContraproposta(cp, m) {
    if (!cp || !(cp.itens || []).length && !cp.introducao) return '';
    const L = [];
    L.push(cp.titulo || ('Contraproposta da Atlantyx — ' + (m?.titulo || 'contrato')), '');
    if (m?.contraparte) L.push('À ' + m.contraparte, '');
    if (cp.introducao) L.push(cp.introducao, '');
    (cp.itens || []).forEach((x, i) => { L.push((i + 1) + '. ' + (x.clausula || 'Cláusula')); if (x.situacao_atual) L.push('   Como está: ' + x.situacao_atual); L.push('   Proposta da Atlantyx: ' + (x.texto_proposto || '')); if (x.justificativa) L.push('   Justificativa: ' + x.justificativa); L.push(''); });
    if ((cp.condicoes_comerciais || []).length) { L.push('Condições comerciais propostas:'); cp.condicoes_comerciais.forEach(c => L.push('• ' + c)); L.push(''); }
    if ((cp.pontos_aceitos || []).length) { L.push('Pontos que a Atlantyx aceita como estão:'); cp.pontos_aceitos.forEach(c => L.push('• ' + c)); L.push(''); }
    if (cp.validade) L.push('Validade desta contraproposta: ' + cp.validade, '');
    if (cp.fechamento) L.push(cp.fechamento, '');
    L.push('Atlantyx');
    return L.join('\n');
  }
  function copiarContraproposta() {
    const t = $('jcContra')?.value || textoContraproposta(S.analise?.contraproposta, S.meta);
    if (!t) return nota('Sem contraproposta para copiar', 'error');
    navigator.clipboard.writeText(t).then(() => nota('Contraproposta copiada'));
  }
  function copiarResumo() {
    const t = $('jcResumo')?.value || S.analise?.conversa_contraparte?.resumo_para_enviar || '';
    if (!t) return nota('Sem resumo para copiar', 'error');
    navigator.clipboard.writeText(t).then(() => nota('Resumo copiado — cole no e-mail para a contraparte'));
  }

  // ── PDF ──────────────────────────────────────────────────────────────────
  async function pdf() {
    if (!S.analise) return nota('Analise um contrato primeiro', 'error');
    try {
      const pdfMake = await _carregarPdfMake();
      const a = S.analise, m = S.meta || {}, cv = a.conversa_contraparte || {};
      const T = v => String(v ?? '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
      const AZUL = '#0B1D4D', CIANO = '#00708A';
      const c = []; let n = 0;
      const sec = t => { n++; c.push({ text: n + '. ' + t, style: 'h1' }); };
      const kv = pares => { const body = pares.filter(([, v]) => v).map(([k, v]) => [{ text: k, style: 'k' }, { text: T(v), style: 'v' }]); if (body.length) c.push({ table: { widths: [150, '*'], body }, layout: 'lightHorizontalLines', margin: [0, 2, 0, 8] }); };
      c.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 66, color: AZUL }] });
      c.push({ text: 'PARECER JURÍDICO — ANÁLISE DE CONTRATO', color: '#9FE7EA', fontSize: 8, bold: true, margin: [12, -58, 0, 0] });
      c.push({ text: T(m.titulo), color: 'white', fontSize: 15, bold: true, margin: [12, 3, 12, 0] });
      c.push({ text: (m.contraparte ? 'Contraparte: ' + T(m.contraparte) + ' · ' : '') + 'Atlantyx OS · ' + new Date(m.em || Date.now()).toLocaleString('pt-BR'), color: '#C7D2F0', fontSize: 8, margin: [12, 3, 0, 18] });
      c.push({ columns: [['Recomendação', a.recomendacao], ['Nível de risco', a.nivel_risco], ['Nota de risco', a.nota_risco != null ? a.nota_risco + '/10' : '']].filter(x => x[1]).map(([k, v], i) => ({ width: i === 0 ? '*' : 110, stack: [{ text: k.toUpperCase(), fontSize: 7, color: '#6B7280', bold: true }, { text: T(v), fontSize: 11, bold: true, color: /alto|crit|N[ÃA]O|NEGOCIAR/i.test(v) ? '#C62828' : CIANO }] })), columnGap: 14, margin: [0, 0, 0, 10] });
      sec('Resumo executivo'); c.push({ text: T(a.resumo_executivo), style: 'p' });
      sec('Identificação'); kv([['Papel da Atlantyx', m.papel], ['Tipo', m.tipo], ['Valor / prazo informados', m.valor], ['Arquivos analisados', (m.arquivos || []).join(', ')], ...Object.entries(a.dados_contrato || {}).map(([k, v]) => [k.replace(/_/g, ' ').replace(/^./, x => x.toUpperCase()), v])]);
      const cc = (a.clausulas_criticas || []).slice().sort((x, y) => (x.prioridade || 99) - (y.prioridade || 99));
      if (cc.length) { sec('Cláusulas que precisam de ajuste');
        cc.forEach(x => { c.push({ text: [{ text: T(x.clausula) + ' · ' + T(x.tema) + '  ', bold: true }, { text: '(' + T(x.risco) + ')', color: /alto|crit/i.test(x.risco) ? '#C62828' : '#B7791F', bold: true }], style: 'h2' });
          if (x.trecho) c.push({ text: '“' + T(x.trecho) + '”', italics: true, color: '#555', fontSize: 9, margin: [0, 0, 0, 3] });
          kv([['Problema', x.problema], ['Impacto para a Atlantyx', x.impacto_para_atlantyx], ['Redação sugerida', x.redacao_sugerida]]); }); }
      if ((a.clausulas_ausentes || []).length) { sec('Cláusulas ausentes'); a.clausulas_ausentes.forEach(x => kv([['Tema', x.tema], ['Por que importa', x.por_que_importa], ['Redação sugerida', x.redacao_sugerida]])); }
      if (Object.values(a.financeiro || {}).some(Boolean)) { sec('Exposição financeira'); kv(Object.entries(a.financeiro).map(([k, v]) => [k.replace(/_/g, ' ').replace(/^./, x => x.toUpperCase()), v])); }
      if ((a.obrigacoes_atlantyx || []).length) { sec('Obrigações da Atlantyx'); c.push({ ul: a.obrigacoes_atlantyx.map(o => T(o.obrigacao) + (o.prazo ? ' — prazo: ' + T(o.prazo) : '') + (o.penalidade ? ' — penalidade: ' + T(o.penalidade) : '')), style: 'p' }); }
      if ((a.comentarios_analisados || []).length) { sec('Comentários analisados'); a.comentarios_analisados.forEach(x => kv([['Comentário', (x.autor ? x.autor + ': ' : '') + x.comentario], ['Análise', x.analise], ['Posição recomendada', x.posicao_recomendada]])); }
      sec('Resumo da conversa com a contraparte');
      kv([['Objetivo', cv.objetivo], ['Tom', cv.tom], ['Abertura', cv.abertura]]);
      (cv.pontos || []).forEach((p, i) => { c.push({ text: (i + 1) + '. ' + T(p.tema), style: 'h2' }); kv([['Nossa posição', p.nossa_posicao], ['Argumento', p.argumento], ['Proposta de redação', p.proposta_redacao], ['Se não aceitarem', p.alternativa_aceitavel], ['Limite', p.limite]]); });
      if ((cv.concessoes_possiveis || []).length) { c.push({ text: 'Concessões possíveis', style: 'h2' }); c.push({ ul: cv.concessoes_possiveis.map(T), style: 'p' }); }
      if ((cv.perguntas_para_contraparte || []).length) { c.push({ text: 'Perguntas para a contraparte', style: 'h2' }); c.push({ ul: cv.perguntas_para_contraparte.map(T), style: 'p' }); }
      const resumo = $('jcResumo')?.value || cv.resumo_para_enviar;
      if (resumo) { c.push({ text: 'Mensagem para enviar à contraparte', style: 'h2' }); c.push({ table: { widths: ['*'], body: [[{ text: T(resumo), style: 'p', margin: [6, 6, 6, 6] }]] }, layout: { hLineColor: () => '#CBD5E1', vLineColor: () => '#CBD5E1' } }); }
      if (a.parecer_final) { sec('Parecer final'); c.push({ text: T(a.parecer_final), style: 'p' }); }
      const contra = $('jcContra')?.value || textoContraproposta(a.contraproposta, m);
      if (contra) { c.push({ text: '', pageBreak: 'before' }); sec('Contraproposta da Atlantyx'); T(contra).split(/\n/).forEach(l => c.push({ text: l || ' ', style: 'p', margin: [0, 0, 0, l ? 3 : 6] })); }
      c.push({ text: 'Documento gerado por IA para apoiar a negociação. Não substitui a revisão de um advogado habilitado antes da assinatura.', fontSize: 7.5, color: '#888', margin: [0, 16, 0, 0] });
      const dd = { pageSize: 'A4', pageMargins: [40, 40, 40, 50], content: c,
        footer: (p, t) => ({ text: 'Atlantyx · Parecer de contrato · ' + p + '/' + t, alignment: 'center', fontSize: 7, color: '#999', margin: [0, 20, 0, 0] }),
        styles: { h1: { fontSize: 12.5, bold: true, color: AZUL, margin: [0, 12, 0, 6] }, h2: { fontSize: 10.5, bold: true, color: CIANO, margin: [0, 8, 0, 3] }, p: { fontSize: 9.5, lineHeight: 1.3, margin: [0, 0, 0, 5] }, k: { fontSize: 8.5, bold: true, color: '#374151' }, v: { fontSize: 9 } },
        defaultStyle: { fontSize: 9.5 } };
      const nome = 'Parecer_Contrato_' + String(m.titulo || 'contrato').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').substring(0, 50) + '_' + new Date().toISOString().slice(0, 10) + '.pdf';
      pdfMake.createPdf(dd).download(nome);
      nota('PDF gerado: ' + nome);
    } catch (e) { nota('Erro ao gerar o PDF: ' + e.message, 'error'); }
  }

  // ── histórico ────────────────────────────────────────────────────────────
  async function kv(action, value) {
    const r = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, key: KV, value }) });
    return r.json();
  }
  async function salvarHistorico() {
    try {
      const d = await kv('get'); const lista = Array.isArray(d.value) ? d.value : [];
      lista.unshift({ id: 'ct_' + Date.now().toString(36), meta: Object.assign({}, S.meta, { comentarios_documento: (S.meta.comentarios_documento || []).slice(0, 40) }), analise: S.analise });
      await kv('set', lista.slice(0, 25)); S.historico = lista.slice(0, 25); renderHist();
    } catch (e) { console.warn('[jurídico] histórico:', e.message); }
  }
  async function historico() { try { const d = await kv('get'); S.historico = Array.isArray(d.value) ? d.value : []; } catch (_) { S.historico = []; } renderHist(); }
  function renderHist() {
    const box = $('jcHist'); if (!box) return;
    box.innerHTML = S.historico.length ? S.historico.map((h, i) => `<div style="display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--bd);">
      <span style="flex:1;min-width:0;"><b style="color:var(--t1);">${esc(h.meta?.titulo)}</b> <span style="color:var(--t2);">${h.meta?.contraparte ? '· ' + esc(h.meta.contraparte) : ''} · ${h.meta?.em ? new Date(h.meta.em).toLocaleString('pt-BR') : ''}</span></span>
      <span style="color:${corRisco(h.analise?.nivel_risco)};font-weight:700;">${esc(h.analise?.recomendacao || '')}</span>
      <a href="#" style="color:var(--blue);" onclick="JUR.abrirHist(${i});return false;">abrir</a>
      <a href="#" style="color:var(--red);" onclick="JUR.excluirHist(${i});return false;" title="Excluir do histórico">×</a></div>`).join('') : 'Nenhuma análise ainda.';
  }
  function abrirHist(i) { const h = S.historico[i]; if (!h) return; S.analise = h.analise; S.meta = h.meta;
    const set = (id, v) => { const e = $(id); if (e && v != null) e.value = v; };
    set('jcTitulo', h.meta.titulo); set('jcContraparte', h.meta.contraparte); set('jcPapel', h.meta.papel); set('jcTipo', h.meta.tipo); set('jcValor', h.meta.valor); set('jcComentarios', h.meta.comentarios_equipe); set('jcObjetivos', h.meta.objetivos);
    render(); $('jcResultado').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  async function excluirHist(i) { if (!confirm('Excluir esta análise do histórico?')) return; S.historico.splice(i, 1); try { await kv('set', S.historico); } catch (_) {} renderHist(); }

  window.JUR = { abrir, adicionarArquivos, removerArquivo, analisar, limpar, pdf, copiarResumo, copiarContraproposta, historico, abrirHist, excluirHist, _S: S, _lerDocx: lerDocx };
})();
