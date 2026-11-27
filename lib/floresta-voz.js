// v3.530 — IARA de voz (Retell): liga para os leads do caminho B da abordagem telefônica do Floresta e devolve o resultado.
// Só liga quando alguém manda (botão na ficha ou teste): nunca sozinha. Segredos só em variáveis de ambiente:
//   RETELL_API_KEY · RETELL_AGENT_ID · RETELL_FROM_NUMBER (número de origem, com +55…) · RETELL_MAX_DIA (opcional, padrão 15)
// O resultado volta por webhook (call_analyzed) com o campo "resultado" da extração pós-chamada do agente.
import { createHash } from 'crypto';

const API = 'https://api.retellai.com';
export const RESULTADOS_VALIDOS = ['reuniao', 'interessado', 'agora_nao', 'sem_interesse', 'nao_atendeu', 'numero_errado', 'nao_ligar'];
const SEM_ATENDER = /dial_no_answer|dial_busy|voicemail_reached|dial_failed|machine/i;
const K_VOZ = 'vendas:floresta:voz';

// Janela legal das ligações de marketing: seg–sex 9h–21h, sáb 10h–14h, nunca domingo (horário de Brasília).
export function dentroDoHorario(agora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(agora).map(x => [x.type, x.value]));
  const h = Number(p.hour) % 24, d = p.weekday;
  if (d === 'Sun') return false;
  if (d === 'Sat') return h >= 10 && h < 14;
  return h >= 9 && h < 21;
}
export const tokenWebhook = () => createHash('sha256').update('atlantyx-retell:' + (process.env.RETELL_API_KEY || 'x')).digest('hex').substring(0, 24);
const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const str = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? '')]));

// v3.607: ligação em MASSA da IARA de voz DESABILITADA por decisão do CEO — só 1 lead por clique. Para religar no futuro, mude para true.
export const LIGACAO_EM_MASSA = false;

export function criarVoz({ floresta, getSql, normTelefone, fetchFn = fetch, agora = () => new Date(), classificar = null }) {
  async function kv(v) { const sql = await getSql();
    if (v === undefined) { const r = await sql`SELECT value FROM kv_store WHERE key = ${K_VOZ} LIMIT 1`; const x = r[0]?.value; return (typeof x === 'string' ? JSON.parse(x) : x) || { calls: {}, dia: { data: '', n: 0 }, revisar: [] }; }
    await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${K_VOZ}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v; }
  const env = () => ({ key: process.env.RETELL_API_KEY, agente: process.env.RETELL_AGENT_ID, de: process.env.RETELL_FROM_NUMBER, max: Number(process.env.RETELL_MAX_DIA) || 15, maxMin: Number(process.env.RETELL_MAX_MIN_MES) || 120 });
  // v3.537: LIMITE MENSAL de minutos da IARA de voz (padrão 120 min/mês; RETELL_MAX_MIN_MES muda). A duração vem do webhook do Retell; cada ligação conta uma vez (testes também).
  const mesSP = () => hojeSP().slice(0, 7);
  const usoMes = S => (S.mes && S.mes.mes === mesSP() ? S.mes : { mes: mesSP(), seg: 0, contadas: [] });
  const minutos = S => Math.round(usoMes(S).seg / 6) / 10;
  const estourou = S => { const e = env(); return minutos(S) >= e.maxMin ? 'limite de ' + e.maxMin + ' minutos por mês da IARA de voz atingido (' + String(minutos(S)).replace('.', ',') + ' min usados) — volta a ligar no dia 1º' : null; };

  function config(baseUrl) { const e = env();
    return { max_min_mes: e.maxMin, ok: !!(e.key && e.agente && e.de), faltando: [!e.key && 'RETELL_API_KEY', !e.agente && 'RETELL_AGENT_ID', !e.de && 'RETELL_FROM_NUMBER'].filter(Boolean), max_dia: e.max,
      webhook_url: e.key ? `${baseUrl}/api/vendas?webhook=retell&k=${tokenWebhook()}` : null, dentro_do_horario: dentroDoHorario(agora()), campo_resultado: 'resultado', valores: RESULTADOS_VALIDOS }; }

  async function _criarChamada({ para, variaveis, metadata }) { const e = env();
    const r = await fetchFn(API + '/v2/create-phone-call', { method: 'POST', headers: { Authorization: 'Bearer ' + e.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_number: e.de, to_number: para, override_agent_id: e.agente, retell_llm_dynamic_variables: str(variaveis || {}), metadata: metadata || {} }) });
    const t = await r.text(); let d = {}; try { d = JSON.parse(t); } catch (_) {}
    if (!r.ok) throw new Error('Retell ' + r.status + ': ' + (d.message || d.error_message || t).toString().slice(0, 200));
    return d; }

  // Teste: liga para um número informado (o seu celular), sem card e sem mexer no funil.
  async function teste({ telefone, primeiro_nome = 'Fabio' } = {}) {
    const c = config(''); if (!c.ok) throw new Error('Faltam variáveis na Vercel: ' + c.faltando.join(', '));
    if (!dentroDoHorario(agora())) throw new Error('Fora do horário permitido (seg–sex 9h–21h, sáb 10h–14h, Brasília).');
    const tel = normTelefone(telefone); if (!tel) throw new Error('Telefone inválido');
    { const lim = estourou(await kv()); if (lim) throw new Error(lim); }
    const d = await _criarChamada({ para: '+' + tel, variaveis: { nome: primeiro_nome + ' Teste', primeiro_nome, cargo: 'Diretor', empresa: 'Empresa Teste', resumo_sdr: '' }, metadata: { teste: '1' } });
    return { ok: true, call_id: d.call_id, para: '+' + tel }; }

  // Liga para os cards do caminho B. Respeita: janela legal, descadastro, limite por dia, 3 tentativas, 1 por dia por lead.
  async function ligar({ card_ids = [], avulso = false } = {}, usuario) {
    const c = config(''); if (!c.ok) throw new Error('Faltam variáveis na Vercel: ' + c.faltando.join(', '));
    if (!dentroDoHorario(agora())) throw new Error('Fora do horário permitido (seg–sex 9h–21h, sáb 10h–14h, Brasília).');
    if (!LIGACAO_EM_MASSA && card_ids.length > 1) throw new Error('Ligação em massa da IARA de voz está desabilitada por enquanto: ligue um lead por vez.');
    const F = await floresta.carregar({}); const porId = Object.fromEntries(F.cards.map(x => [x.id, x])); const S = await kv(); const sql = await getSql();
    if (S.dia.data !== hojeSP()) S.dia = { data: hojeSP(), n: 0 };
    { const lim = estourou(S); if (lim) throw new Error(lim); }
    const optout = new Set((await sql`SELECT destino FROM disparo_optout`.catch(() => [])).map(r => r.destino)); const out = [];
    for (const id of card_ids.slice(0, LIGACAO_EM_MASSA ? 10 : 1)) { const x = porId[id], L = x?.ligacao;
      const falha = m => out.push({ card_id: id, nome: x?.nome, ok: false, motivo: m });
      if (!x) { falha('card não encontrado'); continue; }
      if (!avulso && (x.etapa !== 'ligacao' || !L)) { falha('não está na abordagem telefônica'); continue; }
      if (!avulso && L.caminho !== 'B') { falha('é do caminho A (Ademir liga)'); continue; }
      if (!avulso && L && L.tentativas >= L.max) { falha('já usou as ' + L.max + ' tentativas'); continue; }
      const tel = normTelefone(x.telefone); if (!tel) { falha('sem telefone válido'); continue; }
      if (optout.has(tel)) { falha('pediu para não ligar (descadastro)'); continue; }
      if (S.dia.n >= c.max_dia) { falha('limite de ' + c.max_dia + ' ligações por dia atingido'); continue; }
      const rec = Object.entries(S.calls).find(([, v]) => v.card_id === id && Date.now() - Date.parse(v.em) < 20 * 3600e3);
      if (rec) { falha(rec[1].processado ? 'já ligou hoje; tente em outro dia' : 'ligação em andamento'); continue; }
      try { const nome = x.contato || x.nome || '';
        const d = await _criarChamada({ para: '+' + tel, variaveis: { nome, primeiro_nome: nome.split(' ')[0], cargo: x.cargo || '', empresa: x.empresa || '', resumo_sdr: x.resumo_sdr || '', ...(x.nivel ? { nivel: x.nivel, gancho_publico: x.briefing?.gancho || '', fonte_gancho: x.briefing?.fonte || '', toque_numero: (x.toques || []).length + 1 } : {}) }, metadata: { card_id: id } });
        if (!avulso && x.nivel && floresta.registrarToque) { try { await floresta.registrarToque({ card_id: id, canal: 'voz', resultado: 'ligacao', nivel: x.nivel }); } catch (_) {} }   // v3.531: conta o toque no nível
        S.calls[d.call_id] = { card_id: id, ...(x.contato_id || x.tipo === 'contato' ? { contato_id: String(x.contato_id || x.hs_id) } : {}), em: new Date().toISOString(), por: usuario || null, ...(avulso ? { avulso: true } : {}) }; S.dia.n++; out.push({ card_id: id, nome: x.nome, ok: true, call_id: d.call_id });
      } catch (e) { falha(e.message); } }
    const ids = Object.keys(S.calls); if (ids.length > 300) ids.sort((a, b) => Date.parse(S.calls[a].em) - Date.parse(S.calls[b].em)).slice(0, ids.length - 300).forEach(k => delete S.calls[k]);
    await kv(S); return { ok: out.filter(o => o.ok).length, resultados: out, hoje: S.dia.n, max_dia: c.max_dia, minutos_mes: minutos(S), max_min_mes: c.max_min_mes }; }

  // Webhook do Retell: call_ended (não atendeu) e call_analyzed (resultado). Devolve { ok, tratado } sem nunca lançar.
  // v3.614: a ligação pertence ao CONTATO do HubSpot (o card muda de 'c:ID' para 'n:ID' quando vira negócio)
  const contatoDe = v => v.contato_id || (String(v.card_id || '').startsWith('c:') ? String(v.card_id).slice(2) : null);
  const doCard = (S, { card_id, contato_id }) => Object.entries(S.calls).filter(([, v]) => v.card_id === card_id || (contato_id && String(contatoDe(v)) === String(contato_id)));
  async function webhook(body = {}) {
    const ev = body.event, call = body.call || {}; if (!call.call_id || !['call_ended', 'call_analyzed'].includes(ev)) return { ok: true, tratado: false };
    const S = await kv(); S.ultimo_webhook = { em: new Date().toISOString(), evento: ev, call_id: call.call_id }; const reg = S.calls[call.call_id]; const card_id = reg?.card_id || call.metadata?.card_id;
    { const ms = Number(call.duration_ms) || (Number(call.end_timestamp) - Number(call.start_timestamp)) || 0; const U = usoMes(S);   // conta os minutos uma vez por ligação
      if (ms > 0 && !U.contadas.includes(call.call_id)) { U.seg += Math.ceil(ms / 1000); U.contadas = [...U.contadas, call.call_id].slice(-600); S.mes = U; await kv(S); } }
    if (!card_id) return { ok: true, tratado: false, motivo: call.metadata?.teste ? 'teste' : 'sem card' };
    if (reg?.processado) return { ok: true, tratado: false, motivo: 'já processada' };
    const A = call.call_analysis || {}, dados = A.custom_analysis_data || {};
    // v3.608: guarda sempre o que a ligação trouxe (resumo, transcrição, duração, motivo do fim) para aparecer no card, mesmo sem resultado claro
    const rr = S.calls[call.call_id] = Object.assign(reg || { card_id, em: new Date().toISOString() }, { ...(A.call_summary ? { resumo: String(A.call_summary).slice(0, 1500) } : {}), ...(call.transcript ? { transcricao: String(call.transcript).slice(0, 6000) } : {}), ...(call.disconnection_reason ? { fim: String(call.disconnection_reason) } : {}), ...(Number(call.duration_ms) ? { duracao_s: Math.round(Number(call.duration_ms) / 1000) } : {}), ...(dados.resultado ? { resultado_ia: String(dados.resultado) } : {}), ...(dados.data_reuniao ? { data_reuniao_ia: String(dados.data_reuniao) } : {}) });
    // v3.613: resumo + transcrição COMPLETOS viram uma nota no HubSpot (uma vez por ligação), com ou sem resultado claro
    const gravarHS = async () => { if (rr.nota_hs || !floresta.notaContato || !(rr.resumo || rr.transcricao)) return; rr.nota_hs = true; await kv(S);
      try { await floresta.notaContato({ card_id, contato_id: contatoDe(rr), texto: '🤖 IARA de voz — ligação de ' + new Date(rr.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).slice(0, 16) + (rr.duracao_s ? ' (' + rr.duracao_s + 's)' : '') + (rr.resumo ? '\n\nResumo: ' + rr.resumo : '') + (rr.transcricao ? '\n\nTranscrição:\n' + rr.transcricao : '') }); } catch (_) { rr.nota_hs = false; await kv(S); } };
    let resultado = String(dados.resultado || '').trim().toLowerCase();
    if (!RESULTADOS_VALIDOS.includes(resultado)) resultado = '';
    // v3.608: a análise da Retell não trouxe o campo "resultado" → a IA do Atlantyx OS lê a transcrição e decide (reunião, data, etc.)
    if (!resultado && classificar && (call.transcript || A.call_summary) && (ev === 'call_analyzed' || call.call_status === 'ended')) {
      try { const x = await classificar({ transcricao: String(call.transcript || '').slice(0, 8000), resumo: String(A.call_summary || ''), hoje: hojeSP() }); const r = String(x?.resultado || '').toLowerCase(); if (RESULTADOS_VALIDOS.includes(r)) { resultado = r; dados.data_reuniao = dados.data_reuniao || x.data_reuniao; rr.resultado_ia = r + ' (lida da transcrição)'; if (x.data_reuniao) rr.data_reuniao_ia = String(x.data_reuniao); } } catch (_) {} }
    if (!resultado && ev === 'call_ended' && SEM_ATENDER.test(String(call.disconnection_reason || ''))) resultado = 'nao_atendeu';
    if (rr.transcricao || rr.resumo) await gravarHS();
    if (!resultado) { if (ev === 'call_analyzed') { S.revisar = [{ call_id: call.call_id, card_id, em: new Date().toISOString(), resumo: String(A.call_summary || '').slice(0, 400) }, ...(S.revisar || [])].slice(0, 30); rr.processado = true; } await kv(S);
      return { ok: true, tratado: false, motivo: 'sem resultado (aguardando análise ou revisão manual)' }; }
    const resumo = String(A.call_summary || '').trim(), transc = String(call.transcript || '').trim().slice(0, 1500);
    const nota = ['IARA de voz.', resumo, dados.email_confirmado ? 'E-mail: ' + dados.email_confirmado : '', transc ? 'Transcrição: ' + transc : ''].filter(Boolean).join('\n').slice(0, 1000);
    const dr = resultado === 'reuniao' && /^\d{4}-\d{2}-\d{2}/.test(String(dados.data_reuniao || '')) ? String(dados.data_reuniao) : undefined;
    rr.processado = true; rr.resultado = resultado;
    await kv(S);
    const r = await floresta.ligacaoResultado({ card_id, resultado, nota, data_reuniao: dr }, 'IARA voz');
    return { ok: true, tratado: true, resultado, feito: r.feito }; }

  // v3.608: busca na Retell o que aconteceu com as ligações do card (não depende do webhook) e processa as pendentes.
  async function sincronizar({ card_id, contato_id } = {}) { const e = env(); if (!e.key) throw new Error('RETELL_API_KEY não configurada'); if (!card_id) throw new Error('card_id obrigatório');
    const S0 = await kv(); const ids = doCard(S0, { card_id, contato_id }).sort((a, b) => Date.parse(b[1].em) - Date.parse(a[1].em)).slice(0, 3).map(([id]) => id); const saida = [];
    for (const id of ids) { let tratado = null, erro = null;
      try { const r = await fetchFn(API + '/v2/get-call/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + e.key } }); const t = await r.text(); let call = {}; try { call = JSON.parse(t); } catch (_) {}
        if (!r.ok) throw new Error('Retell ' + r.status + ': ' + String(call.message || t).slice(0, 120));
        // v3.637: 'not_connected' é FINAL (a Retell não conectou a chamada); antes caía em "ainda em andamento" para sempre
        if (call.call_status === 'ended' || call.call_status === 'error' || call.call_status === 'not_connected') { call.call_id = call.call_id || id; call.metadata = { ...(call.metadata || {}), card_id: (S0.calls[id] || {}).card_id || card_id }; tratado = await webhook({ event: call.call_analysis ? 'call_analyzed' : 'call_ended', call });
          if (call.call_status === 'not_connected' && !tratado?.tratado) erro = 'A Retell encerrou a ligação como não conectada (motivo: ' + (call.disconnection_reason || 'não informado') + '). Se a pessoa atendeu e desligou, registre o resultado à mão no card.'; }
        else erro = 'ligação ainda em andamento (' + (call.call_status || '?') + ')';
      } catch (x) { erro = x.message; }
      const S = await kv(); const v = S.calls[id] || {};
      if (!v.nota_hs && (v.resumo || v.transcricao) && floresta.notaContato) { v.nota_hs = true; await kv(S);   // v3.614: ligação já processada antes e ainda sem nota no HubSpot
        try { await floresta.notaContato({ card_id: v.card_id, contato_id: contatoDe(v), texto: '🤖 IARA de voz — ligação de ' + new Date(v.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).slice(0, 16) + (v.duracao_s ? ' (' + v.duracao_s + 's)' : '') + (v.resumo ? '\n\nResumo: ' + v.resumo : '') + (v.transcricao ? '\n\nTranscrição:\n' + v.transcricao : '') }); } catch (_) { v.nota_hs = false; await kv(S); } }
      saida.push({ call_id: id, em: v.em, processado: !!v.processado, resultado: v.resultado || null, resultado_ia: v.resultado_ia || null, data_reuniao_ia: v.data_reuniao_ia || null, resumo: v.resumo || '', transcricao: v.transcricao || '', fim: v.fim || '', duracao_s: v.duracao_s || null, feito: tratado?.feito || null, erro }); }
    return { ok: true, ligacoes: saida }; }

  // v3.613: o que já foi guardado das ligações do card (sem chamar a Retell) — a caixa do card mostra isso ao abrir
  async function historico({ card_id, contato_id } = {}) { const S = await kv(); return { ok: true, ligacoes: doCard(S, { card_id, contato_id }).sort((a, b) => Date.parse(b[1].em) - Date.parse(a[1].em)).slice(0, 5).map(([id, v]) => ({ call_id: id, em: v.em, processado: !!v.processado, resultado: v.resultado || null, resultado_ia: v.resultado_ia || null, data_reuniao_ia: v.data_reuniao_ia || null, resumo: v.resumo || '', transcricao: v.transcricao || '', fim: v.fim || '', duracao_s: v.duracao_s || null })) }; }
  async function status() { const S = await kv(); return { ultimo_webhook: S.ultimo_webhook || null, hoje: S.dia.data === hojeSP() ? S.dia.n : 0, revisar: S.revisar || [], minutos_mes: minutos(S), max_min_mes: env().maxMin }; }
  // v3.643: marcas para o card da Floresta — quem já recebeu ligação da IARA de voz (por card e por contato)
  async function marcas() { const S = await kv(), out = {};
    for (const v of Object.values(S.calls || {})) { const ks = [String(v.card_id || ''), (() => { try { const c = contatoDe(v); return c ? 'ct:' + c : ''; } catch (_) { return ''; } })()].filter(Boolean);   // por card E por contato (negócio e contato são cards diferentes)
      for (const k of ks) { const o = out[k] = out[k] || { n: 0, ultima_em: null, atendeu: false, resultado: null };
        o.n++; if (!o.ultima_em || Date.parse(v.em) > Date.parse(o.ultima_em)) { o.ultima_em = v.em; o.resultado = v.resultado || v.resultado_ia || o.resultado; }
        if (v.duracao_s > 15 || v.resumo || v.transcricao) o.atendeu = true; } }
    return out; }
  return { config, teste, ligar, webhook, sincronizar, historico, status, marcas };
}
