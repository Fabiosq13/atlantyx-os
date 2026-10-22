// lib/pag-colab.js — v3.245 · PAGAMENTO MENSAL DE COLABORADORES (mesma regra da tela do Maestro)
// Valor a pagar = horas apontadas no mês × valor hora custo do cadastro do analista, salvo edições feitas na folha.
// Os dados moram no Maestro (atlx_store): 'atlx_analistas_cad' (cadastro + dados bancários), 'atlx_apontamentos' (horas)
// e 'atlx_pag_mensal' ({ folhas: { 'AAAA-MM': { linhas, status, snap, versoes, ... } }, envios: [...] }) — a folha é a
// MESMA nas duas telas. Funções puras: quem lê/grava o banco é api/pmo.js.

export const normStr = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const num = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; let t = String(v ?? '').replace(/[R$\s]/g, ''); if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.'); return parseFloat(t) || 0; };
const r2 = v => Math.round(v * 100) / 100;

export function mesAnterior(hojeISO) { const d = new Date((hojeISO || new Date().toISOString().slice(0, 10)) + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); }
export function mesLabel(m) { const n = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']; return n[parseInt(String(m).slice(5, 7), 10) - 1] + '/' + String(m).slice(0, 4); }

export function vhCusto(a) {
  if (!a) return 0; const v = parseFloat(String(a.vh_custo || '').replace(',', '.')); if (v > 0) return v;
  const s = normStr(a.senior || ''), m = { jr: /jun|jr/, pl: /plen|pl\b/, sr: /sen|sr/, li: /lid|lead|coord/ };
  for (const k in m) if (m[k].test(s) && parseFloat(a['vh_' + k])) return parseFloat(a['vh_' + k]);
  return parseFloat(a.vh_pl || a.vh_sr || a.vh_jr || a.vh_li || 0) || 0;
}
export function bancoTxt(a) {
  return [a.banco, a.agencia ? 'Ag. ' + a.agencia : '', a.conta ? 'C/C ' + a.conta + (a.tipo_conta && a.tipo_conta !== 'Corrente' ? ' (' + a.tipo_conta + ')' : '') : '', a.pix ? 'PIX ' + a.pix : '', a.titular_doc ? 'Titular ' + a.titular_doc : ''].filter(Boolean).join(' · ');
}
// horas por analista no mês (nome canônico = nome do cadastro, comparado sem acento/caixa)
export function horasPorAnalista(apts, mes) {
  const H = {};
  for (const x of apts || []) { if (!x || !x.data || String(x.data).slice(0, 7) !== mes) continue; const n = normStr(x.analista); if (!n) continue; H[n] = (H[n] || 0) + (parseFloat(String(x.horas ?? '').replace(',', '.')) || 0); }
  return H;
}
export function store(v) { return v && typeof v === 'object' && !Array.isArray(v) ? { folhas: {}, ...v, folhas: v.folhas || {} } : { folhas: {} }; }
export const gravada = (st, mes) => { const fo = st.folhas[mes] || {}; return fo.status === 'gravada' && !!fo.snap && Array.isArray(fo.snap.linhas); };

export function linhasVivas(ana, apts, st, mes) {
  const L = (st.folhas[mes] || {}).linhas || {}, H = horasPorAnalista(apts, mes);
  return (ana || []).filter(a => a && a.nome && (a.status !== 'Inativo' || H[normStr(a.nome)] > 0 || L[a.id])).map(a => {
    const hApt = r2(H[normStr(a.nome)] || 0), vhCad = vhCusto(a), e = L[a.id] || {};
    const tem = k => e[k] != null && e[k] !== '';
    const horas = tem('horas') ? parseFloat(e.horas) : hApt, vh = tem('vh') ? parseFloat(e.vh) : vhCad;
    const calc = r2(horas * vh), valor = tem('valor') ? parseFloat(e.valor) : calc;
    return { id: a.id, nome: a.nome, cargo: a.cargo || '', horas, vh, valor, calc, horasApt: hApt, vhCad, editado: tem('horas') || tem('vh') || tem('valor'), manualValor: tem('valor'), banco: bancoTxt(a), obs: e.obs || '' };
  }).sort((x, y) => x.nome.localeCompare(y.nome));
}
export function linhas(ana, apts, st, mes) { return gravada(st, mes) ? st.folhas[mes].snap.linhas.map(l => ({ ...l })) : linhasVivas(ana, apts, st, mes); }
export function totais(L) { return { total: r2(L.reduce((s, l) => s + (l.valor || 0), 0)), horas: r2(L.reduce((s, l) => s + (l.horas || 0), 0)), qtd: L.filter(l => l.valor > 0).length,
  sem_vh: L.filter(l => l.horas > 0 && !l.vh).length, sem_banco: L.filter(l => l.valor > 0 && !l.banco).length }; }

export function historico(ana, apts, st, hojeISO) {
  const F = st.folhas || {}, envios = st.envios || [], meses = {};
  Object.keys(F).forEach(m => { meses[m] = 1; }); envios.forEach(e => { meses[e.mes] = 1; }); meses[mesAnterior(hojeISO)] = 1;
  return Object.keys(meses).filter(m => /^\d{4}-\d{2}$/.test(m)).sort().reverse().map(m => {
    const fo = F[m] || {}, g = gravada(st, m), L = g ? fo.snap.linhas : linhasVivas(ana, apts, st, m), env = envios.filter(e => e.mes === m), t = totais(L);
    return { mes: m, status: g ? 'gravada' : (fo.versoes && fo.versoes.length ? 'reaberta' : (fo.linhas && Object.keys(fo.linhas).length ? 'em edição' : 'não gravada')),
      total: g ? fo.snap.total : t.total, horas: g ? fo.snap.horas : t.horas, qtd: g ? fo.snap.qtd : t.qtd, versao: (fo.versoes || []).length,
      em: g ? fo.snap.em : (fo.versoes && fo.versoes.length ? fo.versoes[fo.versoes.length - 1].em : ''), por: g ? fo.snap.por : '', env: env[env.length - 1] || null, n_env: env.length };
  });
}

// ── mudanças na folha (devolvem o store alterado; o chamador grava com verificação de versão)
const CAMPOS = new Set(['horas', 'vh', 'valor', 'obs']);
export function editarCampo(st, mes, id, campo, v, quem) {
  if (!CAMPOS.has(campo)) throw Object.assign(new Error('campo inválido'), { status: 400 });
  if (gravada(st, mes)) throw Object.assign(new Error('Folha de ' + mesLabel(mes) + ' está gravada. Clique em 🔓 Reabrir para editar.'), { status: 409 });
  const fo = st.folhas[mes] = st.folhas[mes] || { linhas: {} }; fo.linhas = fo.linhas || {};
  const e = fo.linhas[id] = fo.linhas[id] || {};
  v = String(v ?? '').trim(); if (campo === 'obs') v = v.slice(0, 300); else v = v === '' ? '' : String(num(v));
  e[campo] = v; if (campo !== 'valor' && campo !== 'obs') e.valor = ''; // mudou horas/valor hora → o valor volta a ser calculado
  fo.atualizadoEm = new Date().toISOString(); fo.por = quem || ''; return st;
}
export function recalcular(st, mes, quem) {
  if (gravada(st, mes)) throw Object.assign(new Error('Folha gravada — reabra para recalcular.'), { status: 409 });
  const ant = st.folhas[mes]; if (ant) st.folhas[mes] = { linhas: {}, versoes: ant.versoes || [], envios: ant.envios || [], snap: ant.snap || null, status: 'aberta', atualizadoEm: new Date().toISOString(), por: quem || '', recalculado: true };
  return st;
}
export function gravar(st, mes, L, quem) {
  const fo = st.folhas[mes] = st.folhas[mes] || { linhas: {} }, agora = new Date().toISOString(), t = totais(L);
  fo.versoes = (fo.versoes || []).concat([{ v: (fo.versoes || []).length + 1, em: agora, por: quem || '', total: t.total, horas: t.horas, qtd: t.qtd }]);
  fo.snap = { em: agora, por: quem || '', versao: fo.versoes.length, linhas: L, total: t.total, horas: t.horas, qtd: t.qtd };
  fo.status = 'gravada'; fo.atualizadoEm = agora; fo.por = quem || ''; return st;
}
export function reabrir(st, mes, quem) {
  const fo = st.folhas[mes]; if (!fo) throw Object.assign(new Error('Folha não encontrada.'), { status: 404 });
  fo.linhas = fo.linhas || {};
  (fo.snap && fo.snap.linhas || []).forEach(l => { const e = fo.linhas[l.id] = fo.linhas[l.id] || {};
    if (Math.abs(l.horas - l.horasApt) > 0.001) e.horas = String(l.horas); if (Math.abs(l.vh - l.vhCad) > 0.001) e.vh = String(l.vh); if (l.manualValor) e.valor = String(l.valor); if (l.obs) e.obs = l.obs; });
  fo.status = 'aberta'; fo.atualizadoEm = new Date().toISOString(); fo.por = quem || ''; return st;
}
export function registrarEnvio(st, mes, para, quem, total) { st.envios = (st.envios || []).concat([{ mes, para, em: new Date().toISOString(), por: quem || '', total, origem: 'Atlantyx OS' }]).slice(-50); return st; }
