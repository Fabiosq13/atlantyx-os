/* Atlantyx OS — v3.256 · COMPARAR O EXTRATO OFX COM O FLUXO DETALHADO
 * O OFX é só LIDO no navegador: não é enviado ao servidor, não é gravado e nada é lançado no QuickBooks.
 * Compara os lançamentos do banco com os lançamentos realizados do sistema (QuickBooks) na mesma conta e período,
 * e o saldo de fim de cada dia do banco com o saldo do sistema. Aponta o que falta, o que sobra e onde o saldo diverge.
 * Funções puras em OFXCMP (parse, comparar) — testáveis fora do navegador; a tela em OFXCMP.abrir(). */
(function (G) {
  'use strict';
  const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
  const cent = x => Math.round((Number(x) || 0) * 100);
  const dia = s => Date.parse(String(s).slice(0, 10) + 'T12:00:00Z');
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

  // ── leitura do arquivo: OFX 1.x (SGML, tags sem fechamento) ou 2.x (XML); bancos brasileiros costumam mandar em Windows-1252 ──
  function decodificar(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const cab = new TextDecoder('latin1').decode(u8.slice(0, 600));
    const latin = /CHARSET:\s*(1252|ISO-?8859)|encoding="(windows-1252|iso-8859-1)"/i.test(cab);
    if (!latin) { const t = new TextDecoder('utf-8').decode(u8); if (!t.includes('�')) return t; }
    return new TextDecoder('windows-1252').decode(u8);
  }
  const tag = (bloco, nome) => { const m = new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i').exec(bloco); return m ? m[1].trim() : null; };
  const dataOfx = s => { const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(s || '').trim()); return m ? m[1] + '-' + m[2] + '-' + m[3] : null; };
  const valorOfx = s => { let v = String(s || '').trim().replace(/\s/g, ''); if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.'); else v = v.replace(/,/g, ''); const n = parseFloat(v); return isNaN(n) ? null : r2(n); };
  function parse(texto) {
    const t = String(texto || ''); if (!/<OFX>/i.test(t)) throw new Error('Este arquivo não parece um extrato OFX (falta a marca <OFX>).');
    const conta = { banco: tag(t, 'BANKID') || tag(t, 'ORG'), agencia: tag(t, 'BRANCHID'), conta: tag(t, 'ACCTID'), tipo: tag(t, 'ACCTTYPE'), moeda: tag(t, 'CURDEF') };
    const lista = t.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0]);
    const vistos = new Set(), lancs = [], saldosDia = {}; let saldoAnterior = null;
    lista.forEach((b, i) => {
      const data = dataOfx(tag(b, 'DTPOSTED')), valor = valorOfx(tag(b, 'TRNAMT')); if (!data || valor == null) return;
      // alguns bancos (Itaú, entre outros) mandam as linhas de saldo como lançamentos ("SALDO TOTAL DISPONÍVEL DIA", "SALDO ANTERIOR"):
      // não são movimento — viram o saldo informado pelo banco naquele dia
      const txt = norm([tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' '));
      if (/^(s a l d o|saldo)\b/.test(txt) || /\bsaldo (total|disponivel|do dia|final|anterior|inicial)\b/.test(txt)) { if (/anterior|inicial/.test(txt)) { if (!saldoAnterior || data < saldoAnterior.data) saldoAnterior = { data, valor }; } else saldosDia[data] = valor; return; }
      const fitid = tag(b, 'FITID') || null; const chave = fitid ? fitid + '|' + data + '|' + valor : null;
      if (chave && vistos.has(chave)) return; if (chave) vistos.add(chave); // o mesmo lançamento repetido no arquivo (alguns bancos repetem) conta uma vez
      lancs.push({ id: 'ofx_' + i, fitid, data, valor, tipo: tag(b, 'TRNTYPE') || '', descricao: [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(' · ') || tag(b, 'TRNTYPE') || 'Lançamento', doc: tag(b, 'CHECKNUM') || tag(b, 'REFNUM') || null });
    });
    lancs.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
    const lb = t.split(/<LEDGERBAL>/i)[1] || '', ab = t.split(/<AVAILBAL>/i)[1] || '';
    const saldo = valorOfx(tag(lb, 'BALAMT')), saldoData = dataOfx(tag(lb, 'DTASOF'));
    const inicio = dataOfx(tag(t, 'DTSTART')) || lancs[0]?.data || null, fim = dataOfx(tag(t, 'DTEND')) || lancs[lancs.length - 1]?.data || null;
    return { conta, inicio, fim, lancamentos: lancs, saldo_final: saldo, saldo_final_data: saldoData, saldo_disponivel: valorOfx(tag(ab, 'BALAMT')), saldos_dia: saldosDia, saldo_anterior: saldoAnterior };
  }

  // saldo de fim de dia do banco, a partir de uma ÂNCORA (um saldo conhecido numa data), descontando/somando os lançamentos.
  // Ordem: âncora informada na tela → saldos do dia que o próprio banco mandou no arquivo → saldo anterior → LEDGERBAL.
  // O LEDGERBAL de vários bancos é o saldo do DIA DA EXPORTAÇÃO, não o do fim do extrato: se a data dele passa do fim
  // do extrato, ele não serve (faltam no arquivo os lançamentos entre uma data e outra) e a tela pede o saldo.
  function ancoraOfx(ofx) {
    const D = Object.keys(ofx.saldos_dia || {}).sort();
    if (D.length) { const d = D[D.length - 1]; return { data: d, valor: ofx.saldos_dia[d], fim_do_dia: true, origem: 'saldo do dia informado no próprio extrato (' + D.length + ' dia' + (D.length > 1 ? 's' : '') + ')' }; }
    if (ofx.saldo_anterior) return { data: ofx.saldo_anterior.data, valor: ofx.saldo_anterior.valor, fim_do_dia: false, origem: 'saldo anterior informado no extrato' };
    if (ofx.saldo_final == null) return null;
    const ult = ofx.lancamentos[ofx.lancamentos.length - 1]?.data || ofx.fim, d = ofx.saldo_final_data || ult;
    if (ofx.fim && d > iso(dia(ofx.fim) + 3 * 864e5)) return { data: d, valor: ofx.saldo_final, fim_do_dia: true, origem: 'saldo do arquivo (LEDGERBAL)', duvidoso: 'O saldo do arquivo é de ' + d.split('-').reverse().join('/') + ', depois do fim do extrato (' + ofx.fim.split('-').reverse().join('/') + ') — costuma ser o saldo do dia em que o arquivo foi baixado. Informe o saldo do banco no fim do extrato.' };
    return { data: d < ult ? ult : d, valor: ofx.saldo_final, fim_do_dia: true, origem: 'saldo final do arquivo (LEDGERBAL)' };
  }
  function saldosOfx(ofx, ancora) {
    const A = ancora || ancoraOfx(ofx); if (!A || A.valor == null || A.duvidoso) return null;
    const L = ofx.lancamentos, ate = A.fim_do_dia ? A.data : iso(dia(A.data) - 864e5);
    const soma = L.filter(l => l.data <= ate).reduce((s, l) => s + cent(l.valor), 0);
    const inicial = (cent(A.valor) - soma) / 100;
    const porDia = {}; let s = cent(inicial); L.forEach(l => { s += cent(l.valor); porDia[l.data] = s / 100; });
    return { inicial: r2(inicial), porDia, ancora: A };
  }
  // vários lançamentos de um lado que somam exatamente um lançamento do outro (ex.: um PIX do cliente quitando várias faturas)
  function soma(alvo, cands, maxNos = 60000) {
    const L = cands.slice().sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 22); let nos = 0, achou = null;
    const rest = []; for (let i = L.length - 1, acc = 0; i >= 0; i--) { acc += Math.abs(L[i].c); rest[i] = acc; }
    const dfs = (i, falta, esc) => { if (achou || ++nos > maxNos) return; if (falta === 0 && esc.length >= 2) { achou = esc.slice(); return; } if (i >= L.length || falta < 0 || rest[i] < falta) return;
      const v = Math.abs(L[i].c); if (v <= falta) { esc.push(L[i]); dfs(i + 1, falta - v, esc); esc.pop(); } dfs(i + 1, falta, esc); };
    dfs(0, Math.abs(alvo), []); return achou;
  }

  // ── comparação ──
  // sistema: lançamentos realizados do Fluxo Detalhado (tipo entrada/saida, valor positivo, saldo_acumulado), saldoInicial = saldo do sistema antes do 1º dia
  function comparar(ofx, sistema, saldoInicial, opc = {}) {
    const tol = opc.tolerancia_dias ?? 5, ini = opc.inicio || ofx.inicio, fim = opc.fim || ofx.fim;
    const B = ofx.lancamentos.filter(l => l.data >= ini && l.data <= fim).map(l => ({ ...l, c: cent(l.valor) }));
    const S = (sistema || []).filter(l => (l.tipo === 'entrada' || l.tipo === 'saida') && l.data && String(l.data).slice(0, 10) >= ini && String(l.data).slice(0, 10) <= fim)
      .map(l => ({ ...l, data: String(l.data).slice(0, 10), c: (l.tipo === 'entrada' ? 1 : -1) * cent(l.valor) }));
    const usadoS = new Set(), usadoB = new Set(), pares = [];
    const casar = (maxDias, regra) => { for (const b of B) { if (usadoB.has(b.id)) continue; let melhor = null, dm = Infinity;
      for (const s of S) { if (usadoS.has(s.id) || s.c !== b.c) continue; const d = Math.abs(dia(s.data) - dia(b.data)) / 864e5; if (d <= maxDias && d < dm) { dm = d; melhor = s; } }
      if (melhor) { usadoS.add(melhor.id); usadoB.add(b.id); pares.push({ banco: b, sistema: melhor, dias: Math.round(dm), regra }); } } };
    casar(0, 'mesmo dia e valor'); casar(tol, 'mesmo valor, data próxima');
    const grupos = [], perto = (a, b) => Math.abs(dia(a.data) - dia(b.data)) / 864e5 <= tol;
    for (const b of B.slice().sort((x, y) => Math.abs(y.c) - Math.abs(x.c))) { if (usadoB.has(b.id)) continue;
      const c = soma(b.c, S.filter(s => !usadoS.has(s.id) && Math.sign(s.c) === Math.sign(b.c) && Math.abs(s.c) < Math.abs(b.c) && perto(s, b)));
      if (c) { usadoB.add(b.id); c.forEach(x => usadoS.add(x.id)); grupos.push({ banco: [b], sistema: c, regra: '1 no banco = ' + c.length + ' no sistema' }); } }
    for (const s0 of S.slice().sort((x, y) => Math.abs(y.c) - Math.abs(x.c))) { if (usadoS.has(s0.id)) continue;
      const c = soma(s0.c, B.filter(b => !usadoB.has(b.id) && Math.sign(b.c) === Math.sign(s0.c) && Math.abs(b.c) < Math.abs(s0.c) && perto(b, s0)));
      if (c) { usadoS.add(s0.id); c.forEach(x => usadoB.add(x.id)); grupos.push({ banco: c, sistema: [s0], regra: c.length + ' no banco = 1 no sistema' }); } }
    const soBanco = B.filter(b => !usadoB.has(b.id)), soSistema = S.filter(s => !usadoS.has(s.id));
    // pistas para o que sobrou: mesmo valor mais longe na data · valor parecido no mesmo dia · repetido no sistema
    const pista = (x, outros, ehBanco) => { const lado = ehBanco ? 'no sistema' : 'no banco';
      const longe = outros.find(o => o.c === x.c && Math.abs(dia(o.data) - dia(x.data)) / 864e5 <= 31); if (longe) return 'Mesmo valor ' + lado + ' em ' + longe.data.split('-').reverse().join('/') + ' — data lançada diferente?';
      const perto = outros.find(o => o.data === x.data && Math.sign(o.c) === Math.sign(x.c) && Math.abs(o.c - x.c) <= Math.max(100, Math.abs(x.c) * 0.02)); if (perto) return 'Valor parecido ' + lado + ' no mesmo dia (' + r2(Math.abs(perto.c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ') — tarifa, juros ou valor digitado errado?';
      if (!ehBanco && pares.some(p => p.sistema.c === x.c && p.sistema.data === x.data)) return 'Outro lançamento igual já bateu com o banco — possível duplicidade no sistema';
      return null; };
    soBanco.forEach(b => { b.pista = pista(b, soSistema, true); }); soSistema.forEach(s => { s.pista = pista(s, soBanco, false); });
    // saldo de fim de dia: banco × sistema
    const anc = opc.ancora || ancoraOfx(ofx), so = saldosOfx(ofx, opc.ancora), dias = []; let sb = so ? cent(so.inicial) : null, ss = cent(saldoInicial);
    const inf = ofx.saldos_dia || {};
    const movS = {}; S.forEach(s => { movS[s.data] = (movS[s.data] || 0) + s.c; });
    const movB = {}; B.forEach(b => { movB[b.data] = (movB[b.data] || 0) + b.c; });
    // o saldo do banco no início do período (pode haver lançamentos do OFX antes do período escolhido)
    if (so) { const antes = ofx.lancamentos.filter(l => l.data < ini).reduce((s, l) => s + cent(l.valor), 0); sb = cent(so.inicial) + antes; }
    const inicialBanco = sb != null ? sb / 100 : null; let difAnt = sb != null ? sb - ss : null;
    for (let t = dia(ini); t <= dia(fim); t += 864e5) { const d = iso(t); if (!movS[d] && !movB[d] && inf[d] == null && d !== fim) continue;
      ss += movS[d] || 0; if (sb != null) sb += movB[d] || 0;
      // o saldo que o banco informa no dia manda; se a soma dos lançamentos do arquivo não chega nele, o arquivo está incompleto
      const incomp = inf[d] != null && sb != null && Math.abs(inf[d] * 100 - sb) >= 1; if (inf[d] != null) sb = Math.round(inf[d] * 100);
      const dif = sb != null ? sb - ss : null;
      dias.push({ data: d, banco: sb != null ? sb / 100 : null, sistema: ss / 100, diferenca: dif != null ? dif / 100 : null, mudou: dif != null && dif !== difAnt, variacao: dif != null && difAnt != null ? (dif - difAnt) / 100 : null,
        so_banco: soBanco.filter(b => b.data === d).length, so_sistema: soSistema.filter(s => s.data === d).length,
        banco_informado: inf[d] ?? null, arquivo_incompleto: incomp }); difAnt = dif; }
    const somaC = L => r2(L.reduce((s, x) => s + x.c, 0) / 100);
    const ult = dias[dias.length - 1] || null;
    return { periodo: { inicio: ini, fim }, conta: ofx.conta,
      resumo: { banco_qtd: B.length, sistema_qtd: S.length, conciliados: pares.length + grupos.reduce((n, g) => n + g.banco.length, 0), com_data_diferente: pares.filter(p => p.dias > 0).length, so_banco_qtd: soBanco.length, so_banco_valor: somaC(soBanco), so_sistema_qtd: soSistema.length, so_sistema_valor: somaC(soSistema),
        saldo_inicial_banco: inicialBanco, saldo_inicial_sistema: r2(saldoInicial), diferenca_inicial: inicialBanco != null ? r2(inicialBanco - saldoInicial) : null,
        saldo_final_banco: ult?.banco ?? null, saldo_final_sistema: ult?.sistema ?? r2(saldoInicial), diferenca_final: ult?.diferenca ?? null, dias_com_diferenca: dias.filter(x => x.diferenca && Math.abs(x.diferenca) >= 0.01).length,
        movimento_banco: somaC(B), movimento_sistema: somaC(S), sem_saldo_no_ofx: !so, grupos_qtd: grupos.length,
        arquivo_incompleto: dias.some(x => x.arquivo_incompleto) },
      ancora: so ? so.ancora : anc, pares, grupos, so_banco: soBanco, so_sistema: soSistema, dias };
  }

  // ── tela ──
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = v => v == null ? '—' : (typeof fmtBRLcompleto === 'function' ? fmtBRLcompleto(v) : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  const dt = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
  const sinal = c => '<span style="color:' + (c >= 0 ? 'var(--green)' : 'var(--red)') + ';font-family:var(--M);">' + (c >= 0 ? '+' : '−') + brl(Math.abs(c) / 100).replace('R$', 'R$ ').replace('  ', ' ') + '</span>';
  let OFX = null, RES = null, todosDias = false, ALVO = null, CATS = null, ULT = null, ANC = null;
  function box() { let b = $('fd_ofxBox'); if (!b) { b = document.createElement('div'); b.id = 'fd_ofxBox'; const st = $('fdStatus'); st.parentNode.insertBefore(b, st); } return b; }
  function escolher() { if ($('fd_ofxArq')) return $('fd_ofxArq').click(); let inp = $('fd_ofxFile'); if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.id = 'fd_ofxFile'; inp.accept = '.ofx,.OFX,application/x-ofx'; inp.style.display = 'none'; inp.onchange = () => { const f = inp.files[0]; inp.value = ''; if (f) ler(f); }; document.body.appendChild(inp); } inp.click(); }
  async function ler(f) {
    try { if (f.size > 15 * 1048576) throw new Error('Arquivo grande demais para um extrato (mais de 15 MB)'); OFX = parse(decodificar(await f.arrayBuffer())); OFX.arquivo = f.name; ANC = null; }
    catch (e) { return toast(e.message, 'error'); }
    if (!OFX.lancamentos.length) return toast('O extrato não tem lançamentos', 'error');
    escolherConta();
  }
  // a comparação é por conta bancária: sugere a conta do QuickBooks cujo nome tem os dígitos da conta do OFX
  async function escolherConta() {
    try { if (typeof _fdPopularContas === 'function') await _fdPopularContas(); } catch (_) {}
    const sel = $('fd_conta'), ops = sel ? [...sel.options].filter(o => o.value) : [];
    const dig = String(OFX.conta.conta || '').replace(/\D/g, ''), fins = [dig.slice(-6), dig.slice(-5), dig.slice(-4)].filter(x => x.length >= 4);
    const sug = ops.find(o => fins.some(f => String(o.text).replace(/\D/g, '').includes(f))) || (sel && sel.value ? ops.find(o => o.value === sel.value) : null);
    const b = box();
    b.innerHTML = `<div class="panel" style="margin-bottom:12px;border:1px solid rgba(245,185,75,.45);"><div class="ph"><div class="pt">🏦 Comparar com o extrato do banco</div><button class="btn" style="font-size:10px;" onclick="OFXCMP.fechar()">✕</button></div><div class="pb" style="font-size:11.5px;line-height:1.7;">
      Arquivo <b>${esc(OFX.arquivo)}</b> · ${OFX.conta.banco ? 'banco ' + esc(OFX.conta.banco) + ' · ' : ''}${OFX.conta.agencia ? 'agência ' + esc(OFX.conta.agencia) + ' · ' : ''}conta <b>${esc(OFX.conta.conta || '?')}</b> · ${dt(OFX.inicio)} a ${dt(OFX.fim)} · <b>${OFX.lancamentos.length}</b> lançamentos · ${(() => { const A = ancoraOfx(OFX); return !A ? '<b style="color:var(--gold);">sem saldo no arquivo</b>' : A.duvidoso ? '<b style="color:var(--gold);">saldo do arquivo é de ' + dt(A.data) + ' (depois do fim do extrato)</b>' : 'saldo ' + brl(A.valor) + ' em ' + dt(A.data) + ' (' + esc(A.origem) + ')'; })()}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;"><span>Comparar com a conta do QuickBooks:</span><select class="fsel" id="ofxConta" style="font-size:11px;max-width:300px;">${ops.length ? '' : '<option value="">(contas não carregadas)</option>'}${ops.map(o => `<option value="${esc(o.value)}" ${sug && sug.value === o.value ? 'selected' : ''}>${esc(o.text)}</option>`).join('')}</select>
        <span>de</span><input type="date" class="fsel" id="ofxIni" style="font-size:11px;width:auto;" value="${OFX.inicio}"><span>até</span><input type="date" class="fsel" id="ofxFim" style="font-size:11px;width:auto;" value="${OFX.fim}">
        <button class="btn btn-p" style="font-size:10.5px;" onclick="OFXCMP.rodar(this)">⚖ Comparar com o extrato</button></div>
      <div style="font-size:10px;color:var(--t3);margin-top:6px;">O arquivo é lido só neste navegador: não é enviado, não fica gravado e nada é lançado no QuickBooks. ${sug ? '' : '<b style="color:var(--gold);">Não achei a conta pelo número — escolha a conta certa.</b>'}</div></div></div>`;
  }
  async function rodar(btn) {
    const conta = $('ofxConta')?.value, ini = $('ofxIni')?.value, fim = $('ofxFim')?.value;
    if (!conta) return toast('Escolha a conta do QuickBooks', 'error'); if (!ini || !fim || fim < ini) return toast('Período inválido', 'error');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Lendo o QuickBooks…'; }
    // o Fluxo Detalhado passa a mostrar exatamente a conta e o período do extrato, só com o realizado do QuickBooks
    $('fd_conta').value = conta; $('fd_dataInicio').value = ini; $('fd_dataFim').value = fim; const sim = $('fd_incluirSim'); if (sim) sim.checked = false;
    ALVO = { conta, ini, fim };
    if (!(await recomparar())) { if (btn) { btn.disabled = false; btn.textContent = '⚖ Comparar com o extrato'; } return; }
    todosDias = false; desenhar();
  }
  // lê o realizado direto do QuickBooks (sem cache: depois de incluir/excluir o resultado tem de refletir na hora)
  async function recomparar() {
    let d = null;
    try { d = await finApi('fluxo_detalhado', { data_inicio: ALVO.ini, data_fim: ALVO.fim, incluir_simulados: false, conta_id: ALVO.conta, _forcar: true }, { timeoutMs: 45000 }); } catch (e) { toast('Não consegui ler o QuickBooks: ' + e.message, 'error'); return false; }
    if (!d || !d.passado) { toast('Não consegui ler o Fluxo Detalhado desta conta', 'error'); return false; }
    try { carregarFluxoDetalhado(); } catch (_) {} // a tela de baixo acompanha (usa o resultado recém-lido)
    const S = (d.passado.lancamentos || []).filter(l => !l.origem || /^quickbooks/.test(l.origem));
    ULT = { S, saldoInicial: Number(d.passado.saldo_inicial ?? d.saldo_inicial ?? 0) };
    RES = comparar(OFX, S, ULT.saldoInicial, { inicio: ALVO.ini, fim: ALVO.fim, ancora: ANC });
    RES.conta_nome = $('fd_conta').options[$('fd_conta').selectedIndex]?.text || ''; RES.incompleto = !!(d.passado.dados_incompletos);
    return true;
  }
  // ── incluir no QuickBooks o que só está no banco ──
  async function categorias() { if (!CATS) CATS = await finApi('ofx_categorias'); return CATS; }
  function sugerir(lista, desc, saida) {
    const t = norm(desc), acha = re => lista.find(c => re.test(norm(c.nome)));
    if (saida && /tarifa|taxa|cesta|pacote|manut/.test(t)) return acha(/tarifa|despesas? bancaria|banc/);
    if (/juros|iof|mora/.test(t)) return acha(saida ? /juros|financeir/ : /juros|receitas? financeir|rendimento/);
    if (!saida && /rend|aplic|cdb|resgate/.test(t)) return acha(/rendimento|receitas? financeir|aplica/);
    if (/imposto|darf|das |gps|fgts|inss|irrf|iss/.test(t + ' ')) return acha(/imposto|tribut/);
    return acha(/a classificar|nao categoriz|uncategor|outras? despesas|outras? receitas/) || null;
  }
  async function incluirAbrir(id) {
    const x = RES.so_banco.find(b => b.id === id); if (!x) return;
    let C; try { C = await categorias(); } catch (e) { return toast(e.message, 'error'); }
    const saida = x.c < 0, L = saida ? C.saida : C.entrada, sug = sugerir(L, x.descricao, saida);
    const tr = document.querySelector('[data-ofx="' + id + '"]'); if (!tr) return; const ja = document.getElementById('ofxInc_' + id); if (ja) { ja.remove(); return; }
    const f = document.createElement('tr'); f.id = 'ofxInc_' + id;
    f.innerHTML = `<td colspan="4" style="padding:6px 5px 10px;background:var(--bg4);"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px;">
      <span>${saida ? 'Despesa' : 'Depósito'} de <b>${brl(Math.abs(x.c) / 100)}</b> em ${dt(x.data)} na conta do banco · categoria:</span>
      <select class="fsel" id="ofxCat_${id}" style="font-size:11px;max-width:260px;"><option value="">— escolha —</option>${L.map(c => `<option value="${esc(c.id)}" ${sug && sug.id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
      <input class="fi" id="ofxDesc_${id}" style="font-size:11px;margin:0;max-width:260px;" maxlength="300" value="${esc(x.descricao)}">
      <button class="btn btn-p" style="font-size:10.5px;" onclick="OFXCMP.incluir('${id}',this)">✓ Incluir no QuickBooks</button></div></td>`;
    tr.after(f); if (!sug) document.getElementById('ofxCat_' + id).focus();
  }
  async function incluir(id, btn) {
    const x = RES.so_banco.find(b => b.id === id); if (!x) return; const cat = $('ofxCat_' + id)?.value; if (!cat) return toast('Escolha a categoria', 'error');
    btn.disabled = true; btn.textContent = '⏳ Incluindo…';
    try { const r = await finApi('ofx_incluir', { conta_id: ALVO.conta, data: x.data, valor: x.c / 100, descricao: $('ofxDesc_' + id)?.value || x.descricao, categoria_id: cat, fitid: x.fitid });
      if (r.ja_existe) toast(r.aviso, 'info'); else { toast('Incluído no QuickBooks (' + (r.entidade === 'Purchase' ? 'despesa' : 'depósito') + ' #' + r.id + ')', 'success'); try { addLog('info', '[Extrato OFX] incluído no QuickBooks: ' + r.qb_txn_id + ' · ' + brl(x.c / 100)); } catch (_) {} }
      if (await recomparar()) desenhar();
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '✓ Incluir no QuickBooks'; } }
  // ── excluir no QuickBooks o que não está no banco ──
  async function excluirAbrir(id) {
    const x = RES.so_sistema.find(s => s.id === id); if (!x || !x.qb_txn_id) return; const ja = document.getElementById('ofxExc_' + id); if (ja) { ja.remove(); return; }
    const tr = document.querySelector('[data-ofx="' + id + '"]'); if (!tr) return;
    const f = document.createElement('tr'); f.id = 'ofxExc_' + id; f.innerHTML = '<td colspan="4" style="padding:8px;background:rgba(255,80,80,.08);font-size:11px;">⏳ Conferindo no QuickBooks…</td>'; tr.after(f);
    const esperado = { valor: Math.abs(x.c) / 100, data: x.data, conta_id: ALVO.conta };
    try { const p = await finApi('qb_excluir_lancamento', { qb_txn_id: x.qb_txn_id, confirmar: false, esperado }); const r = p.sera_excluido || {};
      f.innerHTML = `<td colspan="4" style="padding:8px;background:rgba(255,80,80,.08);border:1px solid var(--red);"><div style="font-size:11px;line-height:1.6;">Excluir no QuickBooks: <b>${esc(r.entidade)} #${esc(r.id)}</b> · ${esc(r.contraparte || r.memo || '')} · ${brl(r.valor)} · ${dt(r.data)}${r.conta ? ' · ' + esc(r.conta) : ''}
        ${(r.vinculos || []).length ? `<div style="color:var(--red);">⚠ ${esc(p.aviso)}</div>` : ''}<div style="color:var(--t3);">A exclusão é feita na contabilidade e não pode ser desfeita pelo Atlantyx.</div></div>
        <div style="display:flex;gap:6px;margin-top:6px;"><button class="btn btn-rd" style="font-size:10.5px;" onclick="OFXCMP.excluir('${id}',this)">🗑 Excluir no QuickBooks</button><button class="btn" style="font-size:10.5px;" onclick="document.getElementById('ofxExc_${id}').remove()">Cancelar</button></div></td>`;
    } catch (e) { f.innerHTML = `<td colspan="4" style="padding:8px;color:var(--red);font-size:11px;">${esc(e.message)}</td>`; } }
  async function excluir(id, btn) {
    const x = RES.so_sistema.find(s => s.id === id); if (!x) return; btn.disabled = true; btn.textContent = '⏳ Excluindo…';
    try { const d = await finApi('qb_excluir_lancamento', { qb_txn_id: x.qb_txn_id, confirmar: true, esperado: { valor: Math.abs(x.c) / 100, data: x.data, conta_id: ALVO.conta } });
      toast('Excluído no QuickBooks: ' + brl(d.registro?.valor || 0), 'success'); try { addLog('warn', '[Extrato OFX] EXCLUÍDO no QuickBooks: ' + d.registro?.entidade + '#' + d.registro?.id + ' · ' + brl(d.registro?.valor || 0)); } catch (_) {}
      if (await recomparar()) desenhar();
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '🗑 Excluir no QuickBooks'; } }
  function desenhar() {
    const R = RES.resumo, b = box(), okSaldo = R.diferenca_final != null && Math.abs(R.diferenca_final) < 0.01;
    const chip = (t, v, cor, s) => `<div style="background:var(--bg3);border:1px solid ${cor || 'var(--bd)'};border-radius:8px;padding:8px 11px;min-width:150px;"><div style="font-size:9.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;">${t}</div><div style="font-size:15px;font-weight:700;margin-top:2px;">${v}</div>${s ? `<div style="font-size:9.5px;color:var(--t3);">${s}</div>` : ''}</div>`;
    const th = (t, r) => `<th style="text-align:${r ? 'right' : 'left'};padding:5px;color:var(--t2);font-family:var(--M);font-size:9px;">${t}</th>`;
    const tb = (cab, linhas, vazio) => linhas.length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:560px;"><thead><tr style="border-bottom:1px solid var(--bd);">${cab}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : `<div style="font-size:11px;color:var(--t3);padding:6px 0;">${vazio}</div>`;
    const tdet = l => `<button class="btn" style="font-size:9px;padding:1px 6px;" onclick='_fdDetalhe(${JSON.stringify(JSON.stringify(l)).replace(/'/g, '&#39;')})' title="Ver o lançamento no sistema">🔎</button>`;
    const soB = RES.so_banco.map(x => `<tr data-ofx="${esc(x.id)}" style="border-bottom:1px solid var(--bd);"><td style="padding:5px;white-space:nowrap;">${dt(x.data)}</td><td style="padding:5px;">${esc(x.descricao)}${x.doc ? ' <span style="color:var(--t3);">doc ' + esc(x.doc) + '</span>' : ''}${x.pista ? `<div style="font-size:10px;color:var(--gold);">${esc(x.pista)}</div>` : ''}</td><td style="padding:5px;text-align:right;">${sinal(x.c)}</td><td style="padding:5px;white-space:nowrap;"><button class="btn btn-gn" style="font-size:9.5px;padding:2px 7px;" onclick="OFXCMP.incluirAbrir('${esc(x.id)}')" title="Incluir este lançamento do banco no QuickBooks">＋ Incluir</button></td></tr>`);
    const soS = RES.so_sistema.map(x => `<tr data-ofx="${esc(x.id)}" style="border-bottom:1px solid var(--bd);"><td style="padding:5px;white-space:nowrap;">${dt(x.data)}</td><td style="padding:5px;">${esc(x.descricao)} <span style="color:var(--t3);font-size:10px;">${esc(x.categoria || '')}</span>${x.pista ? `<div style="font-size:10px;color:var(--gold);">${esc(x.pista)}</div>` : ''}</td><td style="padding:5px;text-align:right;">${sinal(x.c)}</td><td style="padding:5px;white-space:nowrap;">${tdet(x)}${x.qb_txn_id ? ` <button class="btn" style="font-size:9.5px;padding:2px 7px;color:var(--red);border-color:var(--red);" onclick="OFXCMP.excluirAbrir('${esc(x.id)}')" title="Excluir este lançamento no QuickBooks">🗑 Excluir</button>` : ''}</td></tr>`);
    const dif = RES.pares.filter(p => p.dias > 0).map(p => `<tr style="border-bottom:1px solid var(--bd);"><td style="padding:5px;white-space:nowrap;">${dt(p.banco.data)}</td><td style="padding:5px;white-space:nowrap;">${dt(p.sistema.data)}</td><td style="padding:5px;">${esc(p.banco.descricao)}<div style="font-size:10px;color:var(--t3);">sistema: ${esc(p.sistema.descricao)}</div></td><td style="padding:5px;text-align:right;">${sinal(p.banco.c)}</td><td style="padding:5px;">${tdet(p.sistema)}</td></tr>`);
    const D = todosDias ? RES.dias : RES.dias.filter(x => x.mudou || (x.diferenca != null && Math.abs(x.diferenca) >= 0.01) || x.arquivo_incompleto);
    const dias = D.map(x => { const tem = x.diferenca != null && Math.abs(x.diferenca) >= 0.01; return `<tr style="border-bottom:1px solid var(--bd);${tem ? '' : 'color:var(--t2);'}"><td style="padding:5px;white-space:nowrap;">${dt(x.data)}</td><td style="padding:5px;text-align:right;font-family:var(--M);">${brl(x.banco)}${x.arquivo_incompleto ? `<div style="font-size:9.5px;color:var(--red);">saldo informado pelo banco — os lançamentos do arquivo não chegam nele</div>` : x.banco_informado != null ? '<div style="font-size:9.5px;color:var(--t3);">informado pelo banco</div>' : ''}</td><td style="padding:5px;text-align:right;font-family:var(--M);">${brl(x.sistema)}</td>
      <td style="padding:5px;text-align:right;font-family:var(--M);font-weight:700;color:${tem ? 'var(--gold)' : 'var(--green)'};">${tem ? brl(x.diferenca) : '✓ bate'}</td><td style="padding:5px;font-size:10px;color:var(--t2);">${x.mudou && x.variacao != null ? 'a diferença ' + (x.variacao > 0 ? 'aumentou' : 'diminuiu') + ' ' + brl(Math.abs(x.variacao)) + ' neste dia' : ''}${x.so_banco ? ' · ' + x.so_banco + ' só no banco' : ''}${x.so_sistema ? ' · ' + x.so_sistema + ' só no sistema' : ''}</td></tr>`; });
    const corDif = v => v == null ? 'var(--red)' : Math.abs(v) < 0.01 ? 'var(--green)' : 'var(--gold)';
    b.innerHTML = `<div class="panel" style="margin-bottom:12px;border:1px solid ${okSaldo && !RES.so_banco.length && !RES.so_sistema.length ? 'var(--green)' : 'rgba(245,185,75,.45)'};"><div class="ph"><div class="pt">🏦 Extrato do banco × sistema — ${esc(RES.conta_nome.split('·')[0])} · ${dt(RES.periodo.inicio)} a ${dt(RES.periodo.fim)}</div>
      <div style="display:flex;gap:6px;"><button class="btn" style="font-size:10px;" onclick="OFXCMP.escolher()">📂 Outro OFX</button><button class="btn" style="font-size:10px;" onclick="OFXCMP.fechar()">✕ Fechar</button></div></div><div class="pb">
      ${RES.incompleto ? '<div style="color:var(--red);font-size:11px;margin-bottom:8px;">⛔ O QuickBooks devolveu dados incompletos nesta carga — atualize antes de confiar na comparação.</div>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${chip('Lançamentos que batem', RES.pares.length + ' de ' + R.banco_qtd, 'var(--bd)', R.com_data_diferente ? R.com_data_diferente + ' com data diferente' : 'banco × sistema')}
        ${chip('Só no banco (faltam no sistema)', R.so_banco_qtd, R.so_banco_qtd ? 'var(--gold)' : 'var(--green)', R.so_banco_qtd ? 'líquido ' + brl(R.so_banco_valor) : 'nenhum')}
        ${chip('Só no sistema (não estão no banco)', R.so_sistema_qtd, R.so_sistema_qtd ? 'var(--gold)' : 'var(--green)', R.so_sistema_qtd ? 'líquido ' + brl(R.so_sistema_valor) : 'nenhum')}
        ${chip('Saldo inicial', R.diferenca_inicial == null ? 'não comparado' : Math.abs(R.diferenca_inicial) < 0.01 ? '✓ bate' : brl(R.diferenca_inicial), corDif(R.diferenca_inicial), 'banco ' + brl(R.saldo_inicial_banco) + ' · sistema ' + brl(R.saldo_inicial_sistema))}
        ${chip('Saldo final', R.diferenca_final == null ? 'não comparado' : okSaldo ? '✓ bate' : brl(R.diferenca_final), corDif(R.diferenca_final), 'banco ' + brl(R.saldo_final_banco) + ' · sistema ' + brl(R.saldo_final_sistema))}
        ${chip('Dias com saldo diferente', R.dias_com_diferenca, R.dias_com_diferenca ? 'var(--gold)' : 'var(--green)', 'dos ' + RES.dias.length + ' dias com movimento')}</div>
      ${ancoraHtml()}
      <div style="font-size:10.5px;color:var(--t2);margin-bottom:12px;line-height:1.6;">Como ler: a diferença de saldo de um dia é <b>banco − sistema</b>. Quando ela muda de um dia para o outro, o motivo está nos lançamentos daquele dia (faltando, sobrando ou com valor diferente). Diferença já no saldo inicial vem de antes do período — compare um extrato mais antigo.</div>
      <div style="display:grid;grid-template-columns:1fr;gap:14px;">
        <div><div style="font-weight:700;font-size:12px;margin-bottom:4px;">🏦 Só no banco — faltam no sistema (${RES.so_banco.length})</div>${tb(th('Data') + th('Descrição no banco') + th('Valor', 1) + th(''), soB, '✓ Tudo o que está no banco está no sistema.')}</div>
        <div><div style="font-weight:700;font-size:12px;margin-bottom:4px;">📒 Só no sistema — não aparecem no banco (${RES.so_sistema.length})</div>${tb(th('Data') + th('Descrição no sistema') + th('Valor', 1) + th(''), soS, '✓ Tudo o que está no sistema aparece no banco.')}</div></div>
      ${RES.grupos.length ? `<div style="font-weight:700;font-size:12px;margin:14px 0 4px;">🧩 Batem somando vários lançamentos (${RES.grupos.length})</div>${tb(th('Regra') + th('No banco') + th('No sistema') + th('Valor', 1), RES.grupos.map(g => `<tr style="border-bottom:1px solid var(--bd);vertical-align:top;"><td style="padding:5px;font-size:10px;color:var(--t2);white-space:nowrap;">${esc(g.regra)}</td><td style="padding:5px;">${g.banco.map(x => dt(x.data) + ' · ' + esc(x.descricao) + ' · ' + sinal(x.c)).join('<br>')}</td><td style="padding:5px;">${g.sistema.map(x => dt(x.data) + ' · ' + esc(x.descricao) + ' · ' + sinal(x.c)).join('<br>')}</td><td style="padding:5px;text-align:right;">${sinal(g.banco.reduce((a, x) => a + x.c, 0))}</td></tr>`), '')}` : ''}
      ${dif.length ? `<div style="font-weight:700;font-size:12px;margin:14px 0 4px;">📅 Batem no valor, mas com data diferente (${dif.length})</div>${tb(th('No banco') + th('No sistema') + th('Descrição') + th('Valor', 1) + th(''), dif, '')}` : ''}
      <div style="display:flex;align-items:center;gap:10px;margin:14px 0 4px;"><div style="font-weight:700;font-size:12px;">💰 Saldo de fim de dia — banco × sistema</div><label style="font-size:10.5px;color:var(--t2);display:flex;gap:5px;align-items:center;"><input type="checkbox" ${todosDias ? 'checked' : ''} onchange="OFXCMP._todos(this.checked)"> mostrar todos os dias com movimento</label></div>
      ${tb(th('Dia') + th('Saldo no banco', 1) + th('Saldo no sistema', 1) + th('Diferença', 1) + th('O que mudou'), dias, R.diferenca_inicial != null && Math.abs(R.diferenca_inicial) < 0.01 ? '✓ O saldo bate em todos os dias.' : 'A diferença é a mesma desde o início do período — vem do saldo inicial.')}
      </div></div>`;
  }
  function ancoraHtml() {
    const A = RES.ancora, R = RES.resumo;
    const aviso = !A ? '<b style="color:var(--red);">O extrato não traz saldo — informe o saldo do banco numa data para comparar os saldos.</b>'
      : A.duvidoso ? '<b style="color:var(--red);">' + esc(A.duvidoso) + '</b>'
      : 'Saldo do banco usado: <b>' + brl(A.valor) + '</b> ' + (A.fim_do_dia ? 'no fim de ' : 'no início de ') + dt(A.data) + ' <span style="color:var(--t3);">(' + esc(A.origem) + ')</span>';
    return `<div style="background:var(--bg4);border:1px solid ${!A || A.duvidoso ? 'var(--red)' : 'var(--bd)'};border-radius:8px;padding:8px 11px;margin-bottom:10px;font-size:11px;line-height:1.7;">${aviso}
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px;"><span>Saldo do banco no fim do dia</span><input type="date" class="fsel" id="ofxAncD" style="font-size:11px;width:auto;" value="${esc((A && A.data) || RES.periodo.fim)}">
        <input class="fi" id="ofxAncV" style="font-size:11px;margin:0;width:140px;" placeholder="ex.: 233.115,95" value="${A && !A.duvidoso && A.manual ? esc(String(A.valor).replace('.', ',')) : ''}"><button class="btn" style="font-size:10px;" onclick="OFXCMP._ancora()">↻ Recalcular com este saldo</button>
        <span style="color:var(--t3);font-size:10px;">use o "saldo total disponível dia" do extrato do banco</span></div>${R.arquivo_incompleto ? '<div style="color:var(--red);margin-top:4px;">⚠ Em algum dia o saldo informado pelo banco não bate com a soma dos lançamentos do arquivo — o OFX está incompleto (baixe de novo o período inteiro).</div>' : ''}</div>`;
  }
  function ancorar() {
    const d = $('ofxAncD')?.value, v = String($('ofxAncV')?.value || '').trim();
    if (!d || !v) return toast('Informe a data e o saldo do banco', 'error');
    const n = parseFloat(/,\d{1,2}$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '')); if (isNaN(n)) return toast('Saldo inválido', 'error');
    ANC = { data: d, valor: r2(n), fim_do_dia: true, origem: 'saldo informado por você', manual: true };
    RES = Object.assign(comparar(OFX, ULT.S, ULT.saldoInicial, { inicio: ALVO.ini, fim: ALVO.fim, ancora: ANC }), { conta_nome: RES.conta_nome, incompleto: RES.incompleto }); desenhar();
  }
  function fechar() { const b = $('fd_ofxBox'); if (b) b.remove(); OFX = null; RES = null; }

  G.OFXCMP = { parse, decodificar, saldosOfx, ancoraOfx, comparar, _ancora: ancorar, escolher, ler, rodar, fechar, incluirAbrir, incluir, excluirAbrir, excluir, _todos: v => { todosDias = !!v; desenhar(); }, _estado: () => ({ OFX, RES }) };
})(typeof window !== 'undefined' ? window : globalThis);
