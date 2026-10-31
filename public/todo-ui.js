// v3.344 — TO-DO DA EMPRESA (Dashboard principal › aba "To-do")
// Tarefas pendentes dos GPs (status reports), das reuniões semanais (decisões com dono e prazo), do comercial (leads novos e
// propostas sem retorno), da Esteira (decisões do fundador) e as criadas aqui. Responsável e data em colunas; um clique edita,
// o quadradinho conclui. Dados em /api/todo.
(function () {
  const $ = id => document.getElementById(id);
  const E = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const dBR = d => d ? d.split('-').reverse().join('/') : '';
  async function api(action, body = {}) {
    const r = await fetch('/api/todo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status })); if (!d.success) throw new Error(d.error || 'falha'); return d;
  }
  let D = null, filtro = (() => { try { return localStorage.getItem('atx_todo_filtro') || 'todas'; } catch (_) { return 'todas'; } })(), origem = '', busca = '', verConc = false, carregando = false, editando = null;
  const COR_P = { fundador: '#c58bff', cto: '#4f9cff', gp: '#00c4cc', comercial: '#fab219', outro: '#8a93a6' };
  const COR_O = { manual: 'var(--t2)', projetos: '#00c4cc', reunioes: '#7c9cff', comercial: '#fab219', esteira: '#c58bff' };
  const ICO_O = { manual: '✍', projetos: '📁', reunioes: '📅', comercial: '🎯', esteira: '🧠' };

  async function carregar(forcar) {
    const box = $('todoApp'); if (!box || carregando) return; carregando = true;
    if (!D || forcar) box.innerHTML = (D ? box.innerHTML : '') || '<div style="padding:24px;color:var(--t3);font-size:11px;">Juntando as tarefas de projetos, reuniões, comercial e Esteira…</div>';
    try { D = await api('listar'); render(); } catch (e) { box.innerHTML = `<div style="padding:16px;color:var(--red);font-size:12px;">To-do não carregou: ${E(e.message)}</div>`; }
    carregando = false; badge();
  }
  function badge() { const b = $('dashBadgeTodo'); if (b && D) { const n = D.resumo.atrasadas; b.textContent = n ? n : ''; b.style.display = n ? '' : 'none'; } }
  function visiveis() {
    const q = busca.trim().toLowerCase();
    return D.itens.filter(x => (verConc || !x.concluido)
      && (filtro === 'todas' || (filtro === 'minhas' ? x.papel === 'fundador' : filtro === 'atrasadas' ? x.atrasada : filtro === 'sem' ? !x.responsavel || x.papel === 'outro' : x.papel === filtro))
      && (!origem || x.origem === origem) && (!q || [x.texto, x.responsavel, x.contexto, x.notas].join(' ').toLowerCase().includes(q)));
  }
  function render() {
    const box = $('todoApp'); if (!box || !D) return; const R = D.resumo, L = visiveis();
    const chip = (k, t, n) => `<button class="fv2-aba ${filtro === k ? 'on' : ''}" style="font-size:10.5px;padding:4px 10px;" onclick="TODO.filtro('${k}')">${t}${n != null ? ` <b style="opacity:.75;">${n}</b>` : ''}</button>`;
    const erros = Object.entries(D.erros || {});
    box.innerHTML = `<div class="panel" style="margin-bottom:13px;"><div class="ph" style="flex-wrap:wrap;row-gap:6px;"><div class="pt">✅ To-do da empresa</div>
        <span style="font-family:var(--M);font-size:9.5px;color:var(--t3);margin-left:8px;">${R.abertas} abertas · <span style="color:${R.atrasadas ? 'var(--red)' : 'inherit'};">${R.atrasadas} atrasadas</span> · ${R.hoje} para hoje</span><span style="flex:1;"></span>
        <button class="btn" style="font-size:10px;" onclick="TODO.equipe()" title="Quem é GP, CTO, comercial e fundador — usado para separar as tarefas">⚙ Equipe</button>
        <button class="btn" style="font-size:10px;" onclick="TODO.carregar(true)">↻ Atualizar</button></div>
      <div class="pb">
        ${!D.equipe_salva ? `<div style="font-size:11px;color:var(--gold);margin-bottom:8px;">⚠ A equipe foi sugerida pelos usuários do sistema e pelos GPs dos projetos. Confira quem é GP, CTO e comercial em <a href="#" onclick="event.preventDefault();TODO.equipe()">⚙ Equipe</a>.</div>` : ''}
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${chip('todas', 'Todas', R.abertas)}${chip('minhas', '👤 Minhas', R.por_papel.fundador)}${chip('gp', '📁 GPs', R.por_papel.gp)}${chip('cto', '🛠 CTO', R.por_papel.cto)}${chip('comercial', '🎯 Comercial', R.por_papel.comercial)}${chip('atrasadas', '⏰ Atrasadas', R.atrasadas)}${chip('sem', 'Outros / sem dono', R.por_papel.outro + R.sem_responsavel)}
          <span style="flex:1;"></span><select class="fsel" style="width:auto;font-size:11px;" onchange="TODO.origem(this.value)"><option value="">Todas as origens</option>${Object.entries(D.origens).map(([k, t]) => `<option value="${k}" ${origem === k ? 'selected' : ''}>${E(t)}</option>`).join('')}</select>
          <input class="fi" style="width:170px;font-size:11px;" placeholder="🔎 buscar" value="${E(busca)}" oninput="TODO.buscar(this.value)" id="todoBusca">
          <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" ${verConc ? 'checked' : ''} onchange="TODO.verConc(this.checked)"> concluídas</label></div>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 190px 150px auto;gap:6px;margin-bottom:10px;" class="todo-novo">
          <input class="fi" id="todoNovoT" placeholder="＋ Nova tarefa (Enter para incluir)" onkeydown="if(event.key==='Enter')TODO.criar()">
          <input class="fi" id="todoNovoR" placeholder="responsável" list="todoEquipeL"><input class="fi" type="date" id="todoNovoD"><button class="btn btn-gn" style="font-size:11px;" onclick="TODO.criar()">Incluir</button></div>
        <datalist id="todoEquipeL">${D.equipe.map(m => `<option value="${E(m.nome)}">${E(D.papeis[m.papel] || '')}</option>`).join('')}</datalist>
        <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="text-align:left;color:var(--t2);font-size:10px;font-family:var(--M);text-transform:uppercase;">
          <th style="padding:5px 4px;width:28px;"></th><th style="padding:5px 4px;">Tarefa</th><th style="padding:5px 4px;width:190px;">Responsável</th><th style="padding:5px 4px;width:120px;">Data</th><th style="padding:5px 4px;width:120px;">Origem</th><th style="width:60px;"></th></tr></thead>
          <tbody>${L.length ? L.map(linha).join('') : `<tr><td colspan="6" style="padding:18px;text-align:center;color:var(--t3);">Nenhuma tarefa ${filtro === 'todas' && !busca && !origem ? 'pendente 🎉' : 'neste filtro'}.</td></tr>`}</tbody></table></div>
        <div style="font-size:10px;color:var(--t3);margin-top:8px;line-height:1.5;">Clique no texto, no responsável ou na data para editar (Enter salva, Esc cancela). O quadradinho conclui. Nas tarefas que vêm de projetos, reuniões, comercial e Esteira a edição e a conclusão ficam registradas aqui e não alteram a origem — atualize também o status report ou a ata quando for o caso.${erros.length ? '<br><span style="color:var(--gold);">⚠ Fontes com problema agora: ' + erros.map(([k, v]) => E(D.origens[k] || k) + ' (' + E(v) + ')').join(' · ') + '</span>' : ''}</div>
      </div></div>`;
    if (editando) { const el = $('todoEd'); if (el) { el.focus(); if (el.select) try { el.select(); } catch (_) {} } }
  }
  function linha(x) {
    const ed = (campo) => editando && editando.id === x.id && editando.campo === campo;
    const cel = (campo, html, attrs = '') => `<td style="padding:6px 4px;vertical-align:top;cursor:text;" onclick="TODO.editar('${E(x.id)}','${campo}')" title="clique para editar" ${attrs}>${html}</td>`;
    const inp = (campo, val, tipo = 'text') => `<td style="padding:4px;vertical-align:top;"><input class="fi" id="todoEd" type="${tipo}" ${campo === 'responsavel' ? 'list="todoEquipeL"' : ''} value="${E(val || '')}" style="font-size:12px;" onkeydown="if(event.key==='Enter')TODO.gravar('${E(x.id)}','${campo}',this.value);if(event.key==='Escape')TODO.cancelar()" onblur="TODO.gravar('${E(x.id)}','${campo}',this.value)"></td>`;
    const pc = x.papel ? `<span style="font-size:9px;font-family:var(--M);padding:1px 5px;border-radius:7px;border:1px solid ${COR_P[x.papel]};color:${COR_P[x.papel]};margin-left:4px;white-space:nowrap;">${E(x.papel === 'fundador' ? 'você' : (D.papeis[x.papel] || x.papel).replace('Gerente de projeto', 'GP'))}</span>` : '';
    const st = x.concluido ? 'opacity:.5;' : '';
    return `<tr style="border-top:1px solid var(--bd);${st}${x.atrasada ? 'background:rgba(255,80,80,.05);' : ''}">
      <td style="padding:6px 4px;vertical-align:top;"><input type="checkbox" ${x.concluido ? 'checked' : ''} onchange="TODO.concluir('${E(x.id)}',this.checked)" aria-label="concluir" style="width:16px;height:16px;cursor:pointer;"></td>
      ${ed('texto') ? inp('texto', x.texto) : cel('texto', `<div style="${x.concluido ? 'text-decoration:line-through;' : ''}font-weight:600;line-height:1.35;">${E(x.texto)}${x.editado ? ' <span title="editado aqui" style="color:var(--t3);font-size:10px;">✎</span>' : ''}</div>${x.contexto ? `<div style="font-size:10.5px;color:var(--t3);margin-top:2px;">${E(x.contexto)}</div>` : ''}${x.notas ? `<div style="font-size:10.5px;color:var(--t2);margin-top:2px;">📝 ${E(x.notas)}</div>` : ''}${x.concluido && x.concluido_em ? `<div style="font-size:10px;color:var(--green,#22d3a3);">✔ concluída ${new Date(x.concluido_em).toLocaleDateString('pt-BR')}${x.concluido_por ? ' por ' + E(x.concluido_por) : ''}</div>` : ''}`)}
      ${ed('responsavel') ? inp('responsavel', x.responsavel) : cel('responsavel', x.responsavel ? `${E(x.responsavel)}${pc}` : '<span style="color:var(--t3);">— definir</span>')}
      ${ed('data') ? inp('data', x.data, 'date') : cel('data', x.data ? `<span style="font-family:var(--M);color:${x.atrasada ? 'var(--red)' : x.hoje ? 'var(--gold)' : 'inherit'};">${dBR(x.data)}</span>${x.atrasada ? '<div style="font-size:9.5px;color:var(--red);">atrasada</div>' : x.hoje ? '<div style="font-size:9.5px;color:var(--gold);">hoje</div>' : ''}` : '<span style="color:var(--t3);">— definir</span>')}
      <td style="padding:6px 4px;vertical-align:top;font-size:10.5px;"><span style="color:${COR_O[x.origem]};">${ICO_O[x.origem] || ''} ${E((D.origens[x.origem] || x.origem).split(' (')[0])}</span>${x.tela ? `<div><a href="#" style="font-size:10px;" onclick="event.preventDefault();TODO.abrir('${E(x.tela)}')">abrir →</a></div>` : ''}</td>
      <td style="padding:6px 2px;vertical-align:top;white-space:nowrap;"><button class="btn" style="font-size:10px;padding:2px 6px;" title="notas" onclick="TODO.notas('${E(x.id)}')">📝</button> <button class="btn" style="font-size:10px;padding:2px 6px;" title="${x.origem === 'manual' ? 'excluir' : 'ocultar do To-do'}" onclick="TODO.excluir('${E(x.id)}')">${x.origem === 'manual' ? '🗑' : '🙈'}</button></td></tr>`;
  }
  const achar = id => D.itens.find(x => x.id === id);
  async function patch(id, campos, msg) {
    const x = achar(id); if (!x) return; const antes = { ...x }; Object.assign(x, campos);
    if ('data' in campos || 'concluido' in campos) { const H = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); x.atrasada = !x.concluido && !!x.data && x.data < H; x.hoje = !x.concluido && x.data === H; }
    if (x.origem !== 'manual' && ['texto', 'responsavel', 'data'].some(k => k in campos)) x.editado = true;
    render();
    try { await api('salvar', { id, ...campos }); if (msg) nota(msg); if ('responsavel' in campos || 'concluido' in campos) { const R = await api('listar'); D = R; render(); badge(); } }
    catch (e) { Object.assign(x, antes); render(); nota('Não salvou: ' + e.message, 'error'); }
  }
  function editar(id, campo) { if (editando && editando.id === id && editando.campo === campo) return; editando = { id, campo }; render(); }
  function gravar(id, campo, valor) {
    if (!editando || editando.id !== id || editando.campo !== campo) return; editando = null; const x = achar(id); if (!x) return render();
    const v = String(valor || '').trim(); if ((x[campo] || '') === v) return render();
    if (campo === 'texto' && !v) { nota('A tarefa não pode ficar sem texto', 'error'); return render(); }
    patch(id, { [campo]: campo === 'data' ? (v || null) : v }, 'Salvo');
  }
  function concluir(id, v) { patch(id, { concluido: v, concluido_em: v ? new Date().toISOString() : null }, v ? '✔ Concluída' : 'Reaberta'); }
  function notas(id) { const x = achar(id); if (!x) return; const n = prompt('Notas da tarefa:', x.notas || ''); if (n == null) return; patch(id, { notas: n }, 'Notas salvas'); }
  async function excluir(id) {
    const x = achar(id); if (!x) return;
    if (!confirm(x.origem === 'manual' ? 'Excluir esta tarefa?' : 'Ocultar esta tarefa do To-do? (ela continua na origem — status report, ata, lead ou Esteira)')) return;
    try { await api('excluir', { id }); D.itens = D.itens.filter(i => i.id !== id); render(); nota(x.origem === 'manual' ? 'Excluída' : 'Ocultada'); } catch (e) { nota(e.message, 'error'); }
  }
  async function criar() {
    const t = $('todoNovoT').value.trim(); if (!t) return nota('Escreva a tarefa', 'error');
    try { await api('criar', { texto: t, responsavel: $('todoNovoR').value, data: $('todoNovoD').value || null }); nota('Tarefa incluída'); D = await api('listar'); render(); badge(); $('todoNovoT')?.focus(); } catch (e) { nota(e.message, 'error'); }
  }
  function abrir(tela) {
    if (tela.startsWith('dash:')) { try { dashAba(tela.split(':')[1]); } catch (_) {} return; }
    try { nav(tela, document.querySelector(`.sbi[onclick*="'${tela}'"]`)); } catch (_) {}
  }
  // ── equipe ──
  let EQ = null;
  function equipe() {
    EQ = JSON.parse(JSON.stringify(D.equipe)); let m = $('todoEqModal'); if (!m) { m = document.createElement('div'); m.id = 'todoEqModal'; m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1001;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 10px;'; document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m) m.remove(); }); }
    eqRender();
  }
  function eqRender() {
    const m = $('todoEqModal'); if (!m) return;
    m.innerHTML = `<div class="panel" style="width:820px;max-width:97vw;margin:0;"><div class="ph"><div class="pt">⚙ Equipe do To-do</div><button class="btn" style="font-size:10px;" onclick="document.getElementById('todoEqModal').remove()">✕</button></div><div class="pb">
      <div style="font-size:11px;color:var(--t2);margin-bottom:8px;">Define quem é <b>você</b> (fundador), o <b>CTO</b>, os <b>GPs</b> e o <b>comercial</b>. O To-do reconhece o responsável pelo nome, primeiro nome, e-mail ou apelido. Leads e propostas sem retorno vão para quem estiver como comercial.</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="color:var(--t2);font-size:10px;text-align:left;"><th style="padding:4px;">Nome</th><th style="padding:4px;">Papel</th><th style="padding:4px;">E-mail</th><th style="padding:4px;">Apelidos (vírgula)</th><th></th></tr>
      ${EQ.map((x, i) => `<tr style="border-top:1px solid var(--bd);"><td style="padding:4px;"><input class="fi" value="${E(x.nome)}" oninput="TODO._eq(${i},'nome',this.value)"></td>
        <td style="padding:4px;"><select class="fsel" onchange="TODO._eq(${i},'papel',this.value)">${Object.entries(D.papeis).map(([k, t]) => `<option value="${k}" ${x.papel === k ? 'selected' : ''}>${E(t)}</option>`).join('')}</select></td>
        <td style="padding:4px;"><input class="fi" value="${E(x.email || '')}" oninput="TODO._eq(${i},'email',this.value)"></td><td style="padding:4px;"><input class="fi" value="${E((x.apelidos || []).join(', '))}" oninput="TODO._eq(${i},'apelidos',this.value)"></td>
        <td style="padding:4px;"><button class="btn" style="font-size:10px;" onclick="TODO._eqDel(${i})">🗑</button></td></tr>`).join('')}</table>
      <div style="display:flex;gap:6px;margin-top:8px;"><button class="btn" style="font-size:11px;" onclick="TODO._eqAdd()">＋ Pessoa</button><span style="flex:1;"></span><button class="btn btn-gn" style="font-size:11px;" onclick="TODO._eqSalvar()">💾 Salvar equipe</button></div></div></div>`;
  }
  async function eqSalvar() { try { await api('equipe_salvar', { membros: EQ }); $('todoEqModal')?.remove(); nota('Equipe salva'); carregar(true); } catch (e) { nota(e.message, 'error'); } }

  if (!document.getElementById('todoCss')) { const st = document.createElement('style'); st.id = 'todoCss'; st.textContent = '@media(max-width:760px){.todo-novo{grid-template-columns:1fr!important;}}'; document.head.appendChild(st); }
  window.TODO = { carregar, filtro: k => { filtro = k; try { localStorage.setItem('atx_todo_filtro', k); } catch (_) {} render(); }, origem: v => { origem = v; render(); },
    buscar: v => { busca = v; render(); const b = $('todoBusca'); if (b) { b.focus(); b.setSelectionRange(v.length, v.length); } }, verConc: v => { verConc = v; render(); },
    editar, gravar, cancelar: () => { editando = null; render(); }, concluir, notas, excluir, criar, abrir, equipe,
    _eq: (i, k, v) => { EQ[i][k] = k === 'apelidos' ? v.split(',').map(x => x.trim()).filter(Boolean) : v; }, _eqDel: i => { EQ.splice(i, 1); eqRender(); }, _eqAdd: () => { EQ.push({ nome: '', papel: 'gp', email: '', apelidos: [] }); eqRender(); }, _eqSalvar: eqSalvar,
    _estado: () => D };
})();
