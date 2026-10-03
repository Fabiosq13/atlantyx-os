// public/acesso-ui.js — v3.81 · Usuários × Perfil, Perfis, Telas e Perfil × Telas (só administrador)
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  async function api(action, dados) {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action }, dados || {})) });
    const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status }));
    if (!d.success) throw new Error(d.error || 'falha');
    return d;
  }
  const S = { usuarios: [], perfis: [], telas: [] };
  const cab = (titulo, sub, botoes) => `<div style="background:linear-gradient(135deg,rgba(79,124,255,.14),rgba(79,124,255,.03));border:1px solid rgba(79,124,255,.25);border-radius:10px;padding:14px 18px;margin-bottom:13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
    <div style="flex:1;min-width:220px;"><div style="font-family:var(--H);font-size:15px;font-weight:700">${titulo}</div><div style="font-size:10.5px;color:var(--t2);margin-top:2px">${sub}</div></div>${botoes || ''}</div>`;
  const sem = () => '<div class="panel"><div class="pb" style="color:var(--gold);font-size:12px;">Só o perfil Administrador acessa esta tela.</div></div>';

  async function carregarTudo() {
    const [u, t] = await Promise.all([api('usuarios_listar'), api('telas_listar')]);
    S.usuarios = u.usuarios || []; S.perfis = u.perfis || []; S.telas = t.telas || [];
    // catálogo vazio ou desatualizado → sincroniza com o menu atual
    const menu = typeof _telasDoMenu === 'function' ? _telasDoMenu() : [];
    if (menu.length && (S.telas.length < menu.length || menu.some(m => !S.telas.some(x => x.id === m.id)))) {
      try { const r = await api('telas_sincronizar', { telas: menu }); S.telas = r.telas || S.telas; } catch (_) {}
    }
  }
  async function abrir(p) {
    const box = $('acsApp_' + p); if (!box) return;
    const a = window.__atxAuth || {};
    if (a.ativa && a.usuario && !a.usuario.admin) { box.innerHTML = sem(); return; }
    if (a.primeiro_acesso || (!a.ativa && !a.usuario)) { box.innerHTML = '<div class="panel"><div class="pb" style="font-size:12px;">Crie o administrador master na tela de primeiro acesso (recarregue a página).</div></div>'; return; }
    box.innerHTML = '<div style="color:var(--t3);font-size:11px;padding:30px;text-align:center;">Carregando...</div>';
    try { await carregarTudo(); render(p); } catch (e) { box.innerHTML = `<div class="panel"><div class="pb" style="color:var(--red);">${esc(e.message)}</div></div>`; }
  }
  function render(p) { ({ s0usuarios: rUsuarios, s0perfis: rPerfis, s0telas: rTelas, s0perfiltelas: rMatriz })[p](); }
  const nomePerfil = id => (S.perfis.find(p => p.id === id) || {}).nome || '<span style="color:var(--red);">sem perfil</span>';

  // ── Usuários × Perfil ──
  function rUsuarios() {
    $('acsApp_s0usuarios').innerHTML = cab('👥 Usuários × Perfil', 'Quem entra no sistema e com qual perfil. O perfil define as telas que a pessoa vê.', '<button class="btn btn-gn" onclick="ACESSO.usuarioForm()">+ Novo usuário</button>')
      + `<div class="panel"><div class="pb" style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11.5px;min-width:720px;">
      <tr style="text-align:left;color:var(--t2);font-family:var(--M);font-size:9px;text-transform:uppercase;"><th style="padding:6px;">Login</th><th style="padding:6px;">Nome</th><th style="padding:6px;">E-mail</th><th style="padding:6px;">Perfil</th><th style="padding:6px;">Situação</th><th style="padding:6px;">Último acesso</th><th></th></tr>
      ${S.usuarios.map(u => `<tr style="border-top:1px solid var(--bd);"><td style="padding:7px 6px;font-weight:700;">${esc(u.login)}</td><td style="padding:7px 6px;">${esc(u.nome || '')}</td><td style="padding:7px 6px;">${esc(u.email || '')}</td>
        <td style="padding:7px 6px;"><select class="fsel" style="width:auto;font-size:11px;" title="Perfil do usuário" onchange="ACESSO.trocarPerfil('${u.id}', this.value)">${S.perfis.map(p => `<option value="${p.id}" ${p.id === u.perfil_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}${u.perfil_id ? '' : '<option value="" selected>— sem perfil —</option>'}</select></td>
        <td style="padding:7px 6px;">${u.ativo ? '<span style="color:var(--green,#22d3a3);">ativo</span>' : '<span style="color:var(--t3);">inativo</span>'}${u.trocar_senha ? ' <span style="color:var(--gold);font-size:10px;">· troca a senha no próximo acesso</span>' : ''}</td>
        <td style="padding:7px 6px;color:var(--t2);">${u.ultimo_login ? new Date(u.ultimo_login).toLocaleString('pt-BR').substring(0, 17) : '—'}</td>
        <td style="padding:7px 6px;text-align:right;white-space:nowrap;"><button class="btn" style="font-size:10px;" onclick="ACESSO.usuarioForm('${u.id}')">✎ Editar</button> <button class="btn" style="font-size:10px;color:var(--red);" onclick="ACESSO.usuarioExcluir('${u.id}')">🗑</button></td></tr>`).join('')}
      </table></div></div><div id="acsUsrForm"></div>`;
  }
  function usuarioForm(id) {
    const u = S.usuarios.find(x => x.id === id) || { ativo: true, trocar_senha: true, perfil_id: (S.perfis.find(p => !p.admin) || S.perfis[0] || {}).id };
    $('acsUsrForm').innerHTML = `<div class="panel" style="margin-top:12px;border:1px solid var(--blue);"><div class="ph"><div class="pt">${id ? 'Editar usuário' : 'Novo usuário'}</div></div><div class="pb">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
        <div class="fg" style="margin:0;"><label class="fl">Login</label><input class="fi" id="acsU_login" value="${esc(u.login || '')}" placeholder="ex.: maria"/></div>
        <div class="fg" style="margin:0;"><label class="fl">Nome</label><input class="fi" id="acsU_nome" value="${esc(u.nome || '')}"/></div>
        <div class="fg" style="margin:0;"><label class="fl">E-mail</label><input class="fi" id="acsU_email" value="${esc(u.email || '')}" placeholder="nome@empresa.com.br"/></div>
        <div class="fg" style="margin:0;"><label class="fl">Perfil</label><select class="fsel" id="acsU_perfil">${S.perfis.map(p => `<option value="${p.id}" ${p.id === u.perfil_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
        <div class="fg" style="margin:0;"><label class="fl">${id ? 'Nova senha (deixe vazio para manter)' : 'Senha inicial'}</label><input class="fi" id="acsU_senha" type="password" autocomplete="new-password" placeholder="mín. 8, letras e números"/></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:10px;font-size:11px;flex-wrap:wrap;">
        <label><input type="checkbox" id="acsU_ativo" ${u.ativo !== false ? 'checked' : ''}/> Ativo</label>
        <label title="Na primeira entrada com a senha nova, o sistema pede para a pessoa trocar"><input type="checkbox" id="acsU_trocar" ${u.trocar_senha !== false ? 'checked' : ''}/> Pedir troca de senha no próximo acesso</label></div>
      <div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-gn" onclick="ACESSO.usuarioSalvar('${id || ''}')">Salvar</button><button class="btn" onclick="document.getElementById('acsUsrForm').innerHTML=''">Cancelar</button></div></div></div>`;
    $('acsU_login').focus();
  }
  async function usuarioSalvar(id) {
    const v = k => $('acsU_' + k)?.value?.trim() || '';
    try { await api('usuario_salvar', { usuario: { id: id || undefined, login: v('login'), nome: v('nome'), email: v('email'), perfil_id: v('perfil'), senha: $('acsU_senha').value || undefined, ativo: $('acsU_ativo').checked, trocar_senha: $('acsU_trocar').checked } });
      nota('Usuário salvo'); await carregarTudo(); rUsuarios(); } catch (e) { nota(e.message, 'error'); }
  }
  async function trocarPerfil(id, perfil) { const u = S.usuarios.find(x => x.id === id); if (!u) return;
    try { await api('usuario_salvar', { usuario: { ...u, perfil_id: perfil } }); nota('Perfil de ' + u.login + ': ' + (S.perfis.find(p => p.id === perfil) || {}).nome); await carregarTudo(); rUsuarios(); } catch (e) { nota(e.message, 'error'); rUsuarios(); } }
  async function usuarioExcluir(id) { const u = S.usuarios.find(x => x.id === id); if (!u || !confirm('Excluir o usuário "' + u.login + '"? Ele perde o acesso na hora.')) return;
    try { await api('usuario_excluir', { id }); nota('Usuário excluído', 'info'); await carregarTudo(); rUsuarios(); } catch (e) { nota(e.message, 'error'); } }

  // ── Perfis ──
  function rPerfis() {
    const n = {}; S.usuarios.forEach(u => { n[u.perfil_id] = (n[u.perfil_id] || 0) + 1; });
    $('acsApp_s0perfis').innerHTML = cab('🏷 Perfis', 'Cada perfil é um conjunto de telas. "Administrador" vê tudo e gerencia o acesso.', '<button class="btn btn-gn" onclick="ACESSO.perfilForm()">+ Novo perfil</button>')
      + `<div class="panel"><div class="pb"><table style="width:100%;border-collapse:collapse;font-size:11.5px;">
      <tr style="text-align:left;color:var(--t2);font-family:var(--M);font-size:9px;text-transform:uppercase;"><th style="padding:6px;">Perfil</th><th style="padding:6px;">Descrição</th><th style="padding:6px;">Telas</th><th style="padding:6px;">Usuários</th><th></th></tr>
      ${S.perfis.map(p => `<tr style="border-top:1px solid var(--bd);"><td style="padding:7px 6px;font-weight:700;">${esc(p.nome)}${p.admin ? ' <span class="tag on">admin</span>' : ''}</td><td style="padding:7px 6px;color:var(--t2);">${esc(p.descricao || '')}</td>
        <td style="padding:7px 6px;">${p.admin ? 'todas' : (p.telas || []).length + ' de ' + S.telas.filter(t => t.ativa !== false).length}</td><td style="padding:7px 6px;">${n[p.id] || 0}</td>
        <td style="padding:7px 6px;text-align:right;white-space:nowrap;"><button class="btn" style="font-size:10px;" onclick="ACESSO.perfilForm('${p.id}')">✎ Editar</button> <button class="btn" style="font-size:10px;" onclick="nav('s0perfiltelas', document.querySelector('.sbi[onclick*=\\'s0perfiltelas\\']'))">▦ Telas</button> ${p.id === 'perfil_admin' ? '' : `<button class="btn" style="font-size:10px;color:var(--red);" onclick="ACESSO.perfilExcluir('${p.id}')">🗑</button>`}</td></tr>`).join('')}
      </table></div></div><div id="acsPerfForm"></div>`;
  }
  function perfilForm(id) {
    const p = S.perfis.find(x => x.id === id) || { telas: [] };
    $('acsPerfForm').innerHTML = `<div class="panel" style="margin-top:12px;border:1px solid var(--blue);"><div class="ph"><div class="pt">${id ? 'Editar perfil' : 'Novo perfil'}</div></div><div class="pb">
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;"><div class="fg" style="margin:0;"><label class="fl">Nome</label><input class="fi" id="acsP_nome" value="${esc(p.nome || '')}" placeholder="ex.: Financeiro"/></div>
      <div class="fg" style="margin:0;"><label class="fl">Descrição</label><input class="fi" id="acsP_desc" value="${esc(p.descricao || '')}"/></div></div>
      <label style="font-size:11px;display:block;margin-top:8px;"><input type="checkbox" id="acsP_admin" ${p.admin ? 'checked' : ''} ${id === 'perfil_admin' ? 'disabled' : ''}/> Administrador (todas as telas + gerenciar usuários, perfis e telas)</label>
      <div style="font-size:10.5px;color:var(--t3);margin-top:6px;">As telas do perfil são marcadas em <b>Perfil × Telas</b>.</div>
      <div style="display:flex;gap:8px;margin-top:12px;"><button class="btn btn-gn" onclick="ACESSO.perfilSalvar('${id || ''}')">Salvar</button><button class="btn" onclick="document.getElementById('acsPerfForm').innerHTML=''">Cancelar</button></div></div></div>`;
  }
  async function perfilSalvar(id) { const p = S.perfis.find(x => x.id === id) || { telas: [] };
    try { await api('perfil_salvar', { perfil: { id: id || undefined, nome: $('acsP_nome').value.trim(), descricao: $('acsP_desc').value.trim(), admin: id === 'perfil_admin' ? true : $('acsP_admin').checked, telas: p.telas || [] } });
      nota('Perfil salvo'); await carregarTudo(); rPerfis(); } catch (e) { nota(e.message, 'error'); } }
  async function perfilExcluir(id) { const p = S.perfis.find(x => x.id === id); if (!p || !confirm('Excluir o perfil "' + p.nome + '"?')) return;
    try { await api('perfil_excluir', { id }); nota('Perfil excluído', 'info'); await carregarTudo(); rPerfis(); } catch (e) { nota(e.message, 'error'); } }

  // ── Telas ──
  function rTelas() {
    const grupos = {}; S.telas.forEach(t => { (grupos[t.grupo || 'Geral'] = grupos[t.grupo || 'Geral'] || []).push(t); });
    $('acsApp_s0telas').innerHTML = cab('🖼 Telas', 'Catálogo das telas do sistema (vem do menu). Renomeie ou desative uma tela para ela sair de todos os perfis, menos do Administrador.', '<button class="btn" onclick="ACESSO.sincronizar()">↻ Sincronizar com o menu</button> <button class="btn btn-gn" onclick="ACESSO.telasSalvar()">Salvar</button>')
      + Object.entries(grupos).map(([g, ts]) => `<div class="panel" style="margin-bottom:10px;"><div class="ph"><div class="pt" style="font-size:12px;">${esc(g)}</div><span style="font-size:10px;color:var(--t3);">${ts.length} tela(s)</span></div><div class="pb">
        ${ts.map(t => `<div style="display:grid;grid-template-columns:160px 1fr 90px;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--bd);font-size:11px;">
          <span style="font-family:var(--M);color:var(--t3);">${esc(t.id)}</span><input class="fi acsTela" data-id="${esc(t.id)}" value="${esc(t.nome || '')}" title="Nome da tela" style="margin:0;font-size:11px;"/>
          <label><input type="checkbox" class="acsTelaAtiva" data-id="${esc(t.id)}" ${t.ativa !== false ? 'checked' : ''}/> ativa</label></div>`).join('')}</div></div>`).join('');
  }
  async function sincronizar() { try { const r = await api('telas_sincronizar', { telas: _telasDoMenu() }); S.telas = r.telas || []; nota(r.sincronizadas + ' tela(s) sincronizadas com o menu'); rTelas(); } catch (e) { nota(e.message, 'error'); } }
  async function telasSalvar() {
    const telas = Array.from(document.querySelectorAll('.acsTela')).map(i => ({ id: i.dataset.id, nome: i.value.trim(), ativa: document.querySelector('.acsTelaAtiva[data-id="' + i.dataset.id + '"]')?.checked !== false }));
    try { await api('telas_salvar', { telas }); nota('Telas salvas'); await carregarTudo(); rTelas(); } catch (e) { nota(e.message, 'error'); } }

  // ── Perfil × Telas (matriz) ──
  function rMatriz() {
    const perfis = S.perfis.filter(p => !p.admin), telas = S.telas.filter(t => t.ativa !== false);
    const grupos = {}; telas.forEach(t => { (grupos[t.grupo || 'Geral'] = grupos[t.grupo || 'Geral'] || []).push(t); });
    $('acsApp_s0perfiltelas').innerHTML = cab('▦ Perfil × Telas', 'Marque as telas de cada perfil. O Administrador vê todas e não aparece aqui.', '<button class="btn btn-gn" onclick="ACESSO.matrizSalvar()">Salvar</button>')
      + (perfis.length ? `<div class="panel"><div class="pb" style="overflow:auto;max-height:72vh;"><table style="border-collapse:collapse;font-size:11px;">
      <thead style="position:sticky;top:0;background:var(--bg2);z-index:1;"><tr><th style="text-align:left;padding:6px;min-width:240px;">Tela</th>${perfis.map(p => `<th style="padding:6px;min-width:90px;text-align:center;">${esc(p.nome)}<div style="font-weight:400;font-size:9px;"><a href="javascript:void(0)" onclick="ACESSO.coluna('${p.id}',true)">todas</a> · <a href="javascript:void(0)" onclick="ACESSO.coluna('${p.id}',false)">nenhuma</a></div></th>`).join('')}</tr></thead>
      <tbody>${Object.entries(grupos).map(([g, ts]) => `<tr><td colspan="${perfis.length + 1}" style="padding:8px 6px 3px;font-weight:700;color:var(--gold);font-size:10px;text-transform:uppercase;">${esc(g)}</td></tr>`
        + ts.map(t => `<tr style="border-top:1px solid var(--bd);"><td style="padding:4px 6px;">${esc(t.nome || t.id)}</td>${perfis.map(p => `<td style="text-align:center;"><input type="checkbox" class="acsMx" data-p="${p.id}" data-t="${esc(t.id)}" title="${esc(p.nome)} · ${esc(t.nome || t.id)}" ${(p.telas || []).includes(t.id) ? 'checked' : ''}/></td>`).join('')}</tr>`).join('')).join('')}</tbody></table></div></div>`
        : '<div class="panel"><div class="pb" style="font-size:12px;">Crie um perfil (além do Administrador) em <b>Perfis</b> para marcar as telas dele aqui.</div></div>');
  }
  function coluna(pid, marcar) { document.querySelectorAll('.acsMx[data-p="' + pid + '"]').forEach(c => { c.checked = marcar; }); }
  async function matrizSalvar() {
    try {
      for (const p of S.perfis.filter(x => !x.admin)) {
        const telas = Array.from(document.querySelectorAll('.acsMx[data-p="' + p.id + '"]')).filter(c => c.checked).map(c => c.dataset.t);
        await api('perfil_salvar', { perfil: { id: p.id, nome: p.nome, descricao: p.descricao, admin: false, telas } });
      }
      nota('Telas dos perfis salvas — valem no próximo login ou ao recarregar a página'); await carregarTudo(); rMatriz();
    } catch (e) { nota(e.message, 'error'); }
  }

  window.ACESSO = { abrir, usuarioForm, usuarioSalvar, usuarioExcluir, trocarPerfil, perfilForm, perfilSalvar, perfilExcluir, sincronizar, telasSalvar, coluna, matrizSalvar };
})();
