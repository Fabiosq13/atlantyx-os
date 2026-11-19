// v3.566 — ROBÔS E CUSTO DE IA · liga/desliga, modelo e custo (real × estimado) de cada robô que chama a IA sozinho
(function () {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nota = (m, t) => { try { toast(m, t || 'success'); } catch (_) {} };
  const US = n => 'US$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  async function api(action, payload = {}) {
    const r = await fetch('/api/s1-intel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    const d = await r.json().catch(() => ({ success: false, error: 'HTTP ' + r.status }));
    if (d.success === false || !r.ok) throw new Error(d.error || 'falha'); return d;
  }
  let D = null;
  async function abrir() { const b = $('rbApp'); try { D = await api('robos_listar'); render(); } catch (e) { if (b) b.innerHTML = '<div style="padding:24px;color:var(--red);">Erro: ' + esc(e.message) + '</div>'; } }
  const nomeModelo = k => (D.modelos.find(m => m.k === k) || {}).nome || k;
  const provOk = id => (D.provedores.find(p => p.id === id) || {}).chave_ok;
  function seletor(r) {
    return D.provedores.map(p => { if (r.so_claude && p.id !== 'anthropic') return ''; const L = D.modelos.filter(m => m.prov === p.id); if (!L.length) return '';
      return '<optgroup label="' + esc(p.nome) + (p.chave_ok ? '' : ' — sem chave') + '">' + L.map(m => '<option value="' + esc(m.k) + '"' + (m.k === r.modelo ? ' selected' : '') + '>' + esc(m.nome) + (m.k === r.modelo_padrao ? ' · padrão' : '') + '</option>').join('') + '</optgroup>'; }).join('');
  }
  function painelModelos() {
    const sel = 'background:var(--bg3);color:var(--t1);border:1px solid var(--bd);border-radius:6px;padding:4px 6px;font-size:11px;';
    return '<div class="panel" style="margin-top:14px;"><div class="ph"><div class="pt">🧠 Modelos disponíveis (base: Claude)</div></div><div class="pb">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">' + D.provedores.map(p => '<span style="font-size:11px;border:1px solid var(--bd);border-radius:20px;padding:3px 10px;color:' + (p.chave_ok ? 'var(--green)' : 'var(--t3)') + ';">' + (p.chave_ok ? '● ' : '○ ') + esc(p.nome) + (p.chave_ok ? '' : ' — falta ' + esc(p.env) + ' na Vercel') + '</span>').join('') + '</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:11.5px;"><thead><tr style="text-align:left;color:var(--t3);font-size:10.5px;"><th style="padding:4px;">Modelo</th><th>Provedor</th><th>Id</th><th style="text-align:right;">Entrada / saída (US$ por 1M tokens)</th><th></th></tr></thead><tbody>'
      + D.modelos.map(m => '<tr style="border-top:1px solid var(--bd);"><td style="padding:5px 4px;">' + esc(m.nome) + '</td><td>' + esc((D.provedores.find(p => p.id === m.prov) || {}).nome) + '</td><td style="color:var(--t3);">' + esc(m.modelo) + '</td><td style="text-align:right;">' + m.preco[0] + ' / ' + m.preco[1] + '</td><td style="text-align:right;">' + (m.extra && m.prov !== 'anthropic' ? '<button class="btn btn-g" style="font-size:10px;padding:2px 8px;" onclick="ROBOS.remover(\'' + esc(m.prov) + '\',\'' + esc(m.modelo) + '\')">' + (m.base ? 'Voltar ao preço padrão' : 'Remover') + '</button>' : '') + '</td></tr>').join('') + '</tbody></table>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;align-items:center;"><b style="font-size:11.5px;">Adicionar modelo</b><select id="rbProv" style="' + sel + '">' + D.provedores.filter(p => p.id !== 'anthropic').map(p => '<option value="' + p.id + '">' + esc(p.nome) + '</option>').join('') + '</select>'
      + '<input id="rbMod" placeholder="id exato do modelo" style="' + sel + 'width:190px;"/><input id="rbNome" placeholder="nome na lista (opcional)" style="' + sel + 'width:160px;"/><input id="rbPi" placeholder="entrada US$" style="' + sel + 'width:90px;"/><input id="rbPo" placeholder="saída US$" style="' + sel + 'width:90px;"/><button class="btn btn-p" style="font-size:11px;" onclick="ROBOS.adicionar()">Adicionar</button></div>'
      + '<div style="font-size:10.5px;color:var(--t3);margin-top:8px;line-height:1.55;">Os preços e ids acima são de partida e podem estar desatualizados: confira no site do provedor e ajuste aqui (adicionar com o mesmo id atualiza o preço). As chaves de cada provedor ficam só nas variáveis da Vercel, nunca aqui. Se um provedor falhar, o robô usa o Claude e avisa na linha. Robôs que usam busca na web, imagem ou pré-preenchimento de resposta continuam no Claude nessas chamadas.</div></div></div>';
  }
  function extra(r, e) {
    if (e.tipo === 'bool') return '<label style="display:flex;gap:6px;align-items:center;font-size:11px;margin-top:5px;cursor:pointer;"><input type="checkbox" ' + (e.valor !== false ? 'checked' : '') + ' onchange="ROBOS.extra(\'' + r.id + '\',\'' + e.k + '\',this.checked)"/> ' + esc(e.rot) + '</label>';
    return '<label style="display:flex;gap:6px;align-items:center;font-size:11px;margin-top:5px;">' + esc(e.rot) + ' <select onchange="ROBOS.extra(\'' + r.id + '\',\'' + e.k + '\',this.value)" style="background:var(--bg3);color:var(--t1);border:1px solid var(--bd);border-radius:6px;padding:2px 4px;">' + e.op.map(o => '<option' + (+e.valor === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></label>';
  }
  function render() {
    const b = $('rbApp'); if (!b || !D) return; const T = D.total;
    const kp = (t, v, s) => '<div style="background:var(--bg3);border:1px solid var(--bd);border-radius:10px;padding:10px 14px;min-width:150px;"><div style="font-size:10px;color:var(--t3);">' + t + '</div><div style="font-size:20px;font-weight:800;">' + v + '</div><div style="font-size:10px;color:var(--t3);">' + s + '</div></div>';
    b.innerHTML = (D.ia_ligada ? '' : '<div style="background:rgba(251,191,36,.12);border:1px solid var(--gold);border-radius:8px;padding:8px 12px;font-size:11.5px;margin-bottom:10px;">A chave mestra da IA (rodapé) está <b>desligada</b>: nenhum robô gasta nada, qualquer que seja a configuração abaixo.</div>')
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' + kp('Gasto real hoje', US(T.hoje), 'robôs desta lista') + kp('Média real / dia (7 dias)', US(T.media_7d), '≈ ' + US(T.media_7d * 30) + ' por mês') + kp('Estimado / dia (configuração atual)', US(T.estimado_dia), '≈ ' + US(T.estimado_dia * 30) + ' por mês') + kp('Se tudo estivesse ligado', US(T.estimado_tudo_ligado), 'por dia útil médio') + '</div>'
      + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="text-align:left;color:var(--t3);font-size:10.5px;"><th style="padding:6px;">Robô</th><th>Quando roda</th><th>Modelo</th><th style="text-align:right;">Real hoje</th><th style="text-align:right;">Real / dia (7d)</th><th style="text-align:right;">Estimado / dia</th><th style="text-align:center;">Liga</th></tr></thead><tbody>'
      + D.robos.map(r => '<tr style="border-top:1px solid var(--bd);' + (r.ligado ? '' : 'opacity:.62;') + '"><td style="padding:9px 6px;max-width:280px;"><b>' + esc(r.nome) + '</b>' + r.extras.map(e => extra(r, e)).join('') + (r.alterado_por ? '<div style="font-size:9.5px;color:var(--t3);margin-top:4px;">alterado por ' + esc(r.alterado_por) + '</div>' : '') + '</td>'
        + '<td style="color:var(--t2);max-width:190px;">' + esc(r.quando) + '</td>'
        + '<td>' + (r.troca ? '<select onchange="ROBOS.modelo(\'' + r.id + '\',this.value)" style="background:var(--bg3);color:var(--t1);border:1px solid var(--bd);border-radius:6px;padding:3px 5px;max-width:200px;">' + seletor(r) + '</select>' + (r.so_claude ? '<br><small style="color:var(--t3);">só Claude: ' + esc(r.so_claude) + '</small>' : '') + (r.aviso ? '<br><small style="color:var(--gold);">⚠ ' + esc(r.aviso.msg) + '</small>' : '') : '<span style="color:var(--t2);">' + esc(nomeModelo(r.modelo)) + '<br><small>fixo</small></span>') + '</td>'
        + '<td style="text-align:right;">' + US(r.custo_hoje) + '</td><td style="text-align:right;">' + US(r.custo_7d_dia) + '<br><small style="color:var(--t3);">' + r.chamadas_7d + ' chamadas</small></td>'
        + '<td style="text-align:right;">' + (r.ligado ? US(r.estimado_dia) : '<span style="color:var(--t3);">0 <small>(' + US(r.estimado_se_ligado) + ' se ligar)</small></span>') + '</td>'
        + '<td style="text-align:center;"><button onclick="ROBOS.liga(\'' + r.id + '\',' + !r.ligado + ')" style="width:44px;height:24px;border-radius:12px;border:0;cursor:pointer;background:' + (r.ligado ? 'var(--green)' : 'var(--bd2)') + ';position:relative;" aria-label="' + (r.ligado ? 'Desligar' : 'Ligar') + '"><span style="position:absolute;top:3px;' + (r.ligado ? 'right:3px' : 'left:3px') + ';width:18px;height:18px;border-radius:50%;background:#fff;"></span></button></td></tr>').join('')
      + '</tbody></table></div><div style="font-size:10.5px;color:var(--t3);margin-top:10px;line-height:1.55;">“Real” vem do log de uso da IA (só as chamadas feitas pelas rotinas, a partir da v3.566). “Estimado” é uma conta por padrão de uso (execuções por dia × tokens típicos × preço de tabela). Preços: os da tabela de modelos abaixo (assumidos). Mudanças valem em até 30 segundos. O Agente de ideias também precisa estar ligado na própria tela da Esteira.</div>' + painelModelos();
  }
  async function salvarModelo(p) { try { D = { ...D, ...(await api('robos_modelo_salvar', p)) }; render(); nota('Modelo salvo'); } catch (e) { nota(e.message, 'error'); } }
  async function salvar(id, p, msg) { try { D = { ...D, ...(await api('robos_salvar', { id, ...p })) }; render(); nota(msg); } catch (e) { nota(e.message, 'error'); abrir(); } }
  const campo = id => ($(id) || {}).value || '';
  window.ROBOS = { abrir, adicionar: () => salvarModelo({ prov: campo('rbProv'), modelo: campo('rbMod').trim(), nome: campo('rbNome').trim(), preco: [campo('rbPi').replace(',', '.'), campo('rbPo').replace(',', '.')] }),
    remover: async (prov, modelo) => { try { D = { ...D, ...(await api('robos_modelo_remover', { prov, modelo })) }; render(); nota('Modelo removido'); } catch (e) { nota(e.message, 'error'); } }, liga: (id, v) => salvar(id, { ligado: v }, v ? 'Robô ligado' : 'Robô desligado'), modelo: (id, m) => salvar(id, { modelo: m }, 'Modelo atualizado'), extra: (id, k, v) => salvar(id, { extras: { [k]: v } }, 'Configuração salva') };
})();
