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

export function criarVoz({ floresta, getSql, normTelefone, fetchFn = fetch, agora = () => new Date() }) {
  async function kv(v) { const sql = await getSql();
    if (v === undefined) { const r = await sql`SELECT value FROM kv_store WHERE key = ${K_VOZ} LIMIT 1`; const x = r[0]?.value; return (typeof x === 'string' ? JSON.parse(x) : x) || { calls: {}, dia: { data: '', n: 0 }, revisar: [] }; }
    await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${K_VOZ}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v; }
  const env = () => ({ key: process.env.RETELL_API_KEY, agente: process.env.RETELL_AGENT_ID, de: process.env.RETELL_FROM_NUMBER, max: Number(process.env.RETELL_MAX_DIA) || 15 });

  function config(baseUrl) { const e = env();
    return { ok: !!(e.key && e.agente && e.de), faltando: [!e.key && 'RETELL_API_KEY', !e.agente && 'RETELL_AGENT_ID', !e.de && 'RETELL_FROM_NUMBER'].filter(Boolean), max_dia: e.max,
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
    const d = await _criarChamada({ para: '+' + tel, variaveis: { nome: primeiro_nome + ' Teste', primeiro_nome, cargo: 'Diretor', empresa: 'Empresa Teste', resumo_sdr: '' }, metadata: { teste: '1' } });
    return { ok: true, call_id: d.call_id, para: '+' + tel }; }

  // Liga para os cards do caminho B. Respeita: janela legal, descadastro, limite por dia, 3 tentativas, 1 por dia por lead.
  async function ligar({ card_ids = [] } = {}, usuario) {
    const c = config(''); if (!c.ok) throw new Error('Faltam variáveis na Vercel: ' + c.faltando.join(', '));
    if (!dentroDoHorario(agora())) throw new Error('Fora do horário permitido (seg–sex 9h–21h, sáb 10h–14h, Brasília).');
    const F = await floresta.carregar({}); const porId = Object.fromEntries(F.cards.map(x => [x.id, x])); const S = await kv(); const sql = await getSql();
    if (S.dia.data !== hojeSP()) S.dia = { data: hojeSP(), n: 0 };
    const optout = new Set((await sql`SELECT destino FROM disparo_optout`.catch(() => [])).map(r => r.destino)); const out = [];
    for (const id of card_ids.slice(0, 10)) { const x = porId[id], L = x?.ligacao;
      const falha = m => out.push({ card_id: id, nome: x?.nome, ok: false, motivo: m });
      if (!x) { falha('card não encontrado'); continue; }
      if (x.etapa !== 'ligacao' || !L) { falha('não está na abordagem telefônica'); continue; }
      if (L.caminho !== 'B') { falha('é do caminho A (Ademir liga)'); continue; }
      if (L.tentativas >= L.max) { falha('já usou as ' + L.max + ' tentativas'); continue; }
      const tel = normTelefone(x.telefone); if (!tel) { falha('sem telefone válido'); continue; }
      if (optout.has(tel)) { falha('pediu para não ligar (descadastro)'); continue; }
      if (S.dia.n >= c.max_dia) { falha('limite de ' + c.max_dia + ' ligações por dia atingido'); continue; }
      const rec = Object.entries(S.calls).find(([, v]) => v.card_id === id && Date.now() - Date.parse(v.em) < 20 * 3600e3);
      if (rec) { falha(rec[1].processado ? 'já ligou hoje; tente em outro dia' : 'ligação em andamento'); continue; }
      try { const nome = x.contato || x.nome || '';
        const d = await _criarChamada({ para: '+' + tel, variaveis: { nome, primeiro_nome: nome.split(' ')[0], cargo: x.cargo || '', empresa: x.empresa || '', resumo_sdr: x.resumo_sdr || '', ...(x.nivel ? { nivel: x.nivel, gancho_publico: x.briefing?.gancho || '', fonte_gancho: x.briefing?.fonte || '', toque_numero: (x.toques || []).length + 1 } : {}) }, metadata: { card_id: id } });
        if (x.nivel && floresta.registrarToque) { try { await floresta.registrarToque({ card_id: id, canal: 'voz', resultado: 'ligacao', nivel: x.nivel }); } catch (_) {} }   // v3.531: conta o toque no nível
        S.calls[d.call_id] = { card_id: id, em: new Date().toISOString(), por: usuario || null }; S.dia.n++; out.push({ card_id: id, nome: x.nome, ok: true, call_id: d.call_id });
      } catch (e) { falha(e.message); } }
    const ids = Object.keys(S.calls); if (ids.length > 300) ids.sort((a, b) => Date.parse(S.calls[a].em) - Date.parse(S.calls[b].em)).slice(0, ids.length - 300).forEach(k => delete S.calls[k]);
    await kv(S); return { ok: out.filter(o => o.ok).length, resultados: out, hoje: S.dia.n, max_dia: c.max_dia }; }

  // Webhook do Retell: call_ended (não atendeu) e call_analyzed (resultado). Devolve { ok, tratado } sem nunca lançar.
  async function webhook(body = {}) {
    const ev = body.event, call = body.call || {}; if (!call.call_id || !['call_ended', 'call_analyzed'].includes(ev)) return { ok: true, tratado: false };
    const S = await kv(); const reg = S.calls[call.call_id]; const card_id = reg?.card_id || call.metadata?.card_id;
    if (!card_id) return { ok: true, tratado: false, motivo: call.metadata?.teste ? 'teste' : 'sem card' };
    if (reg?.processado) return { ok: true, tratado: false, motivo: 'já processada' };
    const A = call.call_analysis || {}, dados = A.custom_analysis_data || {};
    let resultado = String(dados.resultado || '').trim().toLowerCase();
    if (!RESULTADOS_VALIDOS.includes(resultado)) resultado = '';
    if (!resultado && ev === 'call_ended' && SEM_ATENDER.test(String(call.disconnection_reason || ''))) resultado = 'nao_atendeu';
    if (!resultado) { if (ev === 'call_analyzed') { S.revisar = [{ call_id: call.call_id, card_id, em: new Date().toISOString(), resumo: String(A.call_summary || '').slice(0, 400) }, ...(S.revisar || [])].slice(0, 30); if (reg) reg.processado = true; await kv(S); }
      return { ok: true, tratado: false, motivo: 'sem resultado (aguardando análise ou revisão manual)' }; }
    const resumo = String(A.call_summary || '').trim(), transc = String(call.transcript || '').trim().slice(0, 1500);
    const nota = ['IARA de voz.', resumo, dados.email_confirmado ? 'E-mail: ' + dados.email_confirmado : '', transc ? 'Transcrição: ' + transc : ''].filter(Boolean).join('\n').slice(0, 1000);
    const dr = resultado === 'reuniao' && /^\d{4}-\d{2}-\d{2}/.test(String(dados.data_reuniao || '')) ? String(dados.data_reuniao) : undefined;
    S.calls[call.call_id] = { ...(reg || { card_id, em: new Date().toISOString() }), processado: true, resultado };
    await kv(S);
    const r = await floresta.ligacaoResultado({ card_id, resultado, nota, data_reuniao: dr }, 'IARA voz');
    return { ok: true, tratado: true, resultado, feito: r.feito }; }

  async function status() { const S = await kv(); return { hoje: S.dia.data === hojeSP() ? S.dia.n : 0, revisar: S.revisar || [] }; }
  return { config, teste, ligar, webhook, status };
}
