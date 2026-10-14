import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
// api/reunioes.js — v3.147 · RITOS SEMANAIS (reuniões recorrentes com pauta automática)
// Cada rito é uma reunião semanal (dia e hora editáveis) cuja PAUTA o sistema monta sozinho a partir dos dados vivos:
//   • Projetos (PMO · status reports e farol)      • Esteira de Entrega (projetos de clientes, portões, defeitos)
//   • Pipeline de Ideias                            • Esteira de Demandas e Batida do Método B.P.M.
//   • Vendas (pipeline, propostas, win rate)        • Funil por campanha e semáforo comercial
// Convite: e-mail com convite de calendário (.ics recorrente — Aceitar/Recusar no Gmail/Outlook) e link da sala.
// Véspera (cron 08:00): gera a pauta da próxima reunião e manda por e-mail aos participantes (se o rito permitir).
// Sala no sistema: pauta + "assuntos para batimento" (tratado/adiado, decisão, dono, prazo) + videochamada + ata por IA.
// O que ficou pendente (adiado, sem decisão) e as ações com prazo voltam sozinhos na pauta da semana seguinte.

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const TZ = 'America/Sao_Paulo';
let _sql = null, _pronto = false;
async function getSql() {
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  if (_pronto) return _sql;
  await _sql`CREATE TABLE IF NOT EXISTS reu_ritos (id TEXT PRIMARY KEY, nome TEXT NOT NULL, objetivo TEXT, dia_semana INT DEFAULT 1, hora TEXT DEFAULT '09:00', duracao_min INT DEFAULT 60,
    participantes JSONB DEFAULT '[]'::jsonb, fontes JSONB DEFAULT '[]'::jsonb, ativo BOOLEAN DEFAULT true, auto_pauta BOOLEAN DEFAULT true, sala_video TEXT, ordem INT DEFAULT 0,
    convite_seq INT DEFAULT 0, convite_enviado_em TIMESTAMPTZ, convite_para JSONB DEFAULT '[]'::jsonb, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS reu_reunioes (id TEXT PRIMARY KEY, rito_id TEXT REFERENCES reu_ritos(id) ON DELETE CASCADE, data TEXT NOT NULL, hora TEXT,
    pauta JSONB, assuntos JSONB DEFAULT '[]'::jsonb, notas TEXT, ata TEXT, status TEXT DEFAULT 'planejada', pauta_gerada_em TIMESTAMPTZ, pauta_enviada_em TIMESTAMPTZ,
    ata_enviada_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW(), UNIQUE (rito_id, data))`;
  _pronto = true; return _sql;
}
const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const DIAS = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
const BYDAY = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const RX_EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i;
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const baseUrl = () => { const b = process.env.MEDIA_PUBLIC_BASE || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'atlantyx-os.vercel.app'; return (b.startsWith('http') ? b : 'https://' + b).replace(/\/$/, ''); };
const remetente = () => process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || 'atlanteambr@gmail.com';

// ── datas no fuso de São Paulo (sem horário de verão desde 2019: UTC−3 fixo) ──
const agoraSP = () => new Date(Date.now() - 3 * 3600000);
const isoDia = d => d.toISOString().substring(0, 10);
const diaSemanaIso = iso => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
const somaDias = (iso, n) => isoDia(new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5));
// próxima ocorrência (data ISO) do rito a partir de agora — se hoje é o dia e a reunião ainda não acabou, é hoje
function proximaData(r, depoisDe = null) {
  const a = agoraSP(), hoje = isoDia(a), hhmm = a.toISOString().substring(11, 16);
  let d = depoisDe ? somaDias(depoisDe, 1) : hoje;
  for (let i = 0; i < 8; i++, d = somaDias(d, 1)) {
    if (diaSemanaIso(d) !== +r.dia_semana) continue;
    if (!depoisDe && d === hoje) { const [h, m] = String(r.hora || '09:00').split(':').map(Number); const fim = h * 60 + m + (+r.duracao_min || 60);
      const [hn, mn] = hhmm.split(':').map(Number); if (hn * 60 + mn > fim) continue; }
    return d;
  }
  return d;
}
const dataBR = iso => iso ? iso.split('-').reverse().join('/') : '';

// ── ritos padrão (frequência recomendada) ──
const RITOS_PADRAO = () => [
  { nome: 'Projetos da semana', objetivo: 'Destravar os projetos: farol vermelho e amarelo, riscos, bloqueios, status reports atrasados e portões da Esteira de Entrega.',
    dia_semana: 1, hora: '09:00', duracao_min: 60, fontes: ['projetos_pmo', 'esteira_entrega'],
    participantes: ['julio.castro@atlanteam.com.br', 'ademir.souza@atlanteam.com.br', 'estevan.risek@atlanteam.com.br', 'vinicius.cosmo@atlanteam.com.br'], ativo: true, ordem: 1 },
  { nome: 'Funil e vendas', objetivo: 'Revisar o pipeline, as propostas paradas, o ritmo contra a meta, o funil por campanha e a atividade comercial de cada papel.',
    dia_semana: 2, hora: '09:00', duracao_min: 45, fontes: ['vendas', 'funil'], participantes: ['contato@atlanteam.com.br'], ativo: true, ordem: 2 },
  { nome: 'Ideias e produto', objetivo: 'Decidir as ideias que aguardam o fundador, priorizar demandas do Atlantyx OS e acompanhar a Batida do Método B.P.M.',
    dia_semana: 3, hora: '16:00', duracao_min: 45, fontes: ['ideias', 'esteira_demandas'], participantes: ['julio.castro@atlanteam.com.br'], ativo: true, ordem: 3 },
  { nome: 'Ensaio geral (entregas da semana)', objetivo: 'Demonstrar o que entrou no ar na semana, trilhas encerradas e abertas (Método B.P.M.).',
    dia_semana: 5, hora: '16:00', duracao_min: 30, fontes: ['esteira_demandas', 'esteira_entrega'], participantes: ['julio.castro@atlanteam.com.br'], ativo: false, ordem: 4 },
];

// ── chamada interna a outra API do sistema (mesma credencial da requisição/cron) ──
async function chamar(mod, body, ms = 25000) {
  const m = await import('./' + mod + '.js'); let out = null;
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(b) { try { out = JSON.parse(b); } catch (_) { out = { raw: b }; } return this; }, setHeader() {}, end() { return this; } };
  let tm; await Promise.race([m.default({ method: 'POST', body, query: {}, headers: {}, url: '/api/' + mod }, res), new Promise((_, rej) => { tm = setTimeout(() => rej(new Error('demorou mais de ' + ms / 1000 + 's')), ms); })]).finally(() => clearTimeout(tm));
  if (!out || out.success === false) throw new Error(out?.error || 'sem resposta');
  return out;
}
const n0 = v => v == null ? 0 : (Array.isArray(v) ? v.length : +v || 0);
const brl = v => v == null || isNaN(+v) ? '—' : 'R$ ' + Math.round(+v).toLocaleString('pt-BR');

// ── fontes da pauta: cada uma devolve { titulo, resumo[], tabela?, assuntos[] } ──
const FONTES = {
  projetos_pmo: { nome: 'Projetos (PMO · status reports e farol)', async coletar() {
    const r = await chamar('pmo', { action: 'painel_mestre', payload: {} }); const L = r.painel || [], R = r.resumo || {};
    const disc = L.filter(l => l.farol === 'vermelho' || l.farol === 'amarelo' || !l.atualizado_na_semana);
    return { titulo: 'Projetos', resumo: [`${R.total ?? L.length} projeto(s): ${R.vermelho || 0} vermelho · ${R.amarelo || 0} amarelo · ${R.verde || 0} verde · ${R.sem_report || 0} sem report`, `${R.atualizados_na_semana ?? 0} atualizado(s) na semana`],
      tabela: { cab: ['Projeto', 'Gerente', 'Farol', '% real × plan.', 'Riscos', 'Bloqueios', 'Dias sem report'], linhas: disc.slice(0, 15).map(l => [l.projeto, l.gerente || '—', l.farol || 'sem report', `${l.pct_concluido ?? '—'}% × ${l.pct_planejado ?? '—'}%`, n0(l.riscos), n0(l.bloqueios), l.dias_sem_report ?? '—']) },
      assuntos: disc.slice(0, 10).map(l => ({ titulo: `${l.projeto} — ${l.farol ? 'farol ' + l.farol : 'sem status report'}`, contexto: [l.resumo, n0(l.bloqueios) ? n0(l.bloqueios) + ' bloqueio(s)' : '', n0(l.riscos) ? n0(l.riscos) + ' risco(s)' : '', l.dias_sem_report > 7 ? l.dias_sem_report + ' dias sem report' : ''].filter(Boolean).join(' · ').substring(0, 300),
        responsavel: l.gerente || '', tipo: l.farol === 'vermelho' ? 'decisao' : 'acompanhamento', origem: 'Projetos' })) };
  } },
  esteira_entrega: { nome: 'Esteira de Entrega (projetos de clientes)', async coletar() {
    const r = await chamar('fabrica', { action: 'projetos' }); const P = (r.projetos || []).slice(0, 10); const E = r.etapas || [];
    const linhas = [], assuntos = [];
    for (const p of P) { const etapa = E[(p.etapa || 1) - 1]; const falhou = +p.n_falhou || 0;
      linhas.push([p.nome, p.cliente || '—', `${p.etapa || 1}/12 ${etapa?.nome || ''}`, etapa?.gate || '—', `${p.n_passou || 0}/${p.n_casos || 0}`, falhou]);
      assuntos.push({ titulo: `${p.nome}${p.cliente ? ' (' + p.cliente + ')' : ''} — portão ${etapa?.gate || '?'} ${etapa?.nome || ''}`, contexto: `Etapa ${p.etapa || 1}/12 · ${p.n_itens || 0} itens no Kanban · casos ${p.n_passou || 0}/${p.n_casos || 0} aprovados${falhou ? ' · ' + falhou + ' falhando' : ''} · aprova: ${etapa?.aprova || '—'}`,
        responsavel: p.gp || '', tipo: falhou ? 'risco' : 'acompanhamento', origem: 'Esteira de Entrega' }); }
    return { titulo: 'Esteira de Entrega', resumo: [`${P.length} projeto(s) de cliente na esteira`], tabela: { cab: ['Projeto', 'Cliente', 'Etapa', 'Portão', 'Casos ok', 'Falhando'], linhas }, assuntos };
  } },
  ideias: { nome: 'Pipeline de Ideias', async coletar() {
    const r = await chamar('db', { action: 'list_ideias' }); const I = (r.ideias || []).filter(x => x && x.titulo);
    const st = x => x.stage || x.status || 'Recebida', limpo = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const cont = I.reduce((m, x) => (m[st(x)] = (m[st(x)] || 0) + 1, m), {});
    const decidir = I.filter(x => /aguardando fundador|comit/i.test(st(x)));
    return { titulo: 'Ideias', resumo: [`${I.length} ideia(s) no pipeline: ` + Object.entries(cont).map(([k, v]) => `${v} ${k}`).join(' · ')],
      tabela: { cab: ['Ideia', 'Etapa'], linhas: I.filter(x => !/em desenvolvimento|descart/i.test(st(x))).slice(0, 15).map(x => [limpo(x.titulo).substring(0, 90), st(x)]) },
      assuntos: decidir.slice(0, 8).map(x => ({ titulo: `Decidir: ${limpo(x.titulo).substring(0, 100)}`, contexto: `Etapa ${st(x)}. ${limpo(x.resumo || x.descricao || '').substring(0, 220)}`, responsavel: 'Fabio', tipo: 'decisao', origem: 'Ideias' })) };
  } },
  esteira_demandas: { nome: 'Esteira de Demandas e Batida B.P.M.', async coletar() {
    const r = await chamar('agente-ideias', { action: 'listar' }); const D = (r.demandas || []).filter(d => d.squad !== 'qa');
    const sug = D.filter(d => d.status === 'sugerida').sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0));
    const mix = D.filter(d => d.status === 'em_execucao' && d.dados?.pr?.estado === 'open' && !d.dados?.merge_pedido_em);
    const dev = D.filter(d => d.status === 'em_execucao' && (d.dados?.pr?.rotulos || []).includes('precisa-revisao'));
    const semana = Date.now() - 7 * 864e5, feitas = D.filter(d => d.status === 'implementada' && Date.parse(d.dados?.implementada_em || d.atualizado_em) > semana);
    return { titulo: 'Esteira de Demandas (Método B.P.M.)', resumo: [`${sug.length} sugerida(s) · ${D.filter(d => d.status === 'em_execucao').length} em implementação · ${mix.length} aguardando Mixagem · ${feitas.length} no ar na semana`, `Fase ${r.bpm?.fase || '?'} · limite de ${r.bpm?.limite || '?'} trilha(s) em paralelo`],
      tabela: { cab: ['Demanda', 'Trilha', 'Situação'], linhas: [...mix.map(d => [d.titulo, d.dados?.bpm?.trilha || '—', 'aguarda a Mixagem']), ...dev.map(d => [d.titulo, d.dados?.bpm?.trilha || '—', 'devolvida pela Mixagem']), ...feitas.map(d => [d.titulo, d.dados?.bpm?.trilha || '—', 'no ar'])].slice(0, 15) },
      assuntos: [...mix.slice(0, 4).map(d => ({ titulo: `Mixagem: ${d.titulo}`, contexto: `PR #${d.dados?.pr?.numero} pronto — aprovar e mesclar na Esteira de Demandas`, responsavel: 'Fabio', tipo: 'decisao', origem: 'Esteira de Demandas' })),
        ...dev.slice(0, 3).map(d => ({ titulo: `Devolvida: ${d.titulo}`, contexto: 'A Mixagem devolveu o PR — decidir: pedir correção ao Claude ou cancelar', responsavel: 'Fabio', tipo: 'risco', origem: 'Esteira de Demandas' })),
        ...sug.slice(0, 4).map(d => ({ titulo: `Aprovar ou recusar: ${d.titulo}`, contexto: String(d.dados?.problema || '').substring(0, 220), responsavel: 'Fabio', tipo: 'decisao', origem: 'Esteira de Demandas' }))] };
  } },
  vendas: { nome: 'Vendas (pipeline, propostas, win rate)', async coletar() {
    const r = await chamar('vendas', { action: 'painel', payload: {} }, 40000); const M = r.metas || {}, C = r.calculo || {}, P = r.propostas || {};
    const assuntos = [];
    if (P.paradas) assuntos.push({ titulo: `${P.paradas} proposta(s) parada(s)`, contexto: `${P.abertas || 0} abertas somando ${brl(P.valor_aberto)} — definir o próximo passo de cada parada`, responsavel: 'Comercial', tipo: 'decisao', origem: 'Vendas' });
    if (M.pct_mes != null && M.pct_mes < 100) assuntos.push({ titulo: `Meta do mês em ${M.pct_mes}%`, contexto: `Falta ${brl(M.gap_mes)} com ${M.dias_uteis_mes ?? '?'} dias úteis — ritmo semanal necessário e plano de ação`, responsavel: 'Comercial', tipo: 'acompanhamento', origem: 'Vendas' });
    if (C.cobertura_pipeline != null) assuntos.push({ titulo: `Cobertura do pipeline: ${C.cobertura_pipeline}`, contexto: `Win rate ${C.win_rate_pct ?? '—'}% · ciclo médio ${C.ciclo_dias ?? '—'} dias`, responsavel: 'Comercial', tipo: 'acompanhamento', origem: 'Vendas' });
    return { titulo: 'Vendas', resumo: [`Meta do mês: ${M.pct_mes ?? '—'}% · do ano: ${M.pct_ano ?? '—'}% (falta ${brl(M.gap_ano)})`, `Propostas: ${P.abertas || 0} abertas (${brl(P.valor_aberto)}) · ${P.ganhas || 0} ganhas · ${P.perdidas || 0} perdidas · ${P.paradas || 0} paradas`, `Win rate ${C.win_rate_pct ?? '—'}% · ciclo ${C.ciclo_dias ?? '—'} dias · cobertura ${C.cobertura_pipeline ?? '—'}`].concat(r._cache?.aviso ? [r._cache.aviso] : []), assuntos };
  } },
  funil: { nome: 'Funil por campanha e semáforo comercial', async coletar() {
    const [f, s] = await Promise.all([chamar('crm', { action: 'funil_campanha', payload: { dias: 30 } }).catch(e => ({ erro: e.message })), chamar('crm', { action: 'comercial_semaforo', payload: {} }).catch(e => ({ erro: e.message }))]);
    const camp = f.campanhas || [], cards = s.cards || [];
    const vermelhos = cards.filter(c => c.farol === 'vermelho' || c.farol === 'amarelo');
    return { titulo: 'Funil e atividade comercial', resumo: [`Últimos 30 dias: ${f.total_leads ?? '—'} lead(s) → ${f.total_reunioes ?? '—'} reunião(ões) marcada(s)`].concat(f.erro ? ['funil indisponível: ' + f.erro] : [], s.erro ? ['semáforo indisponível: ' + s.erro] : []),
      tabela: camp.length ? { cab: ['Campanha', 'Origem', 'Leads', 'Reuniões', 'Taxa'], linhas: camp.slice(0, 10).map(c => [c.campanha, c.origem, c.leads, c.reunioes, (c.taxa ?? 0) + '%']) } : null,
      assuntos: [...vermelhos.slice(0, 5).map(c => ({ titulo: `${c.nome || c.papel || c.id} — semáforo ${c.farol}`, contexto: c.motivo || `${c.pct_contatos ?? '—'}% dos contatos e ${c.pct_reunioes ?? '—'}% das reuniões da meta`, responsavel: c.nome || '', tipo: 'acompanhamento', origem: 'Comercial' })),
        ...camp.filter(c => c.leads >= 5 && !c.reunioes).slice(0, 3).map(c => ({ titulo: `Campanha ${c.campanha}: ${c.leads} leads e nenhuma reunião`, contexto: 'Rever abordagem ou cortar a campanha', responsavel: 'Marketing', tipo: 'decisao', origem: 'Funil' }))] };
  } },
};

async function claude(system, content, maxTokens = 3000) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('sem ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('IA: ' + (d?.error?.message || r.status));
  return (d.content || []).map(c => c.text || '').join('');
}
const json = t => { const s = String(t || '').replace(/```json|```/g, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); try { return JSON.parse(s.substring(a, b + 1)); } catch (_) { return null; } };

// ── ritos ──
function linhaRito(r, ultimas = []) {
  const prox = proximaData(r);
  return { ...r, participantes: r.participantes || [], fontes: r.fontes || [], dia_nome: DIAS[r.dia_semana], proxima: prox, proxima_br: dataBR(prox),
    reunioes: ultimas.filter(u => u.rito_id === r.id).slice(0, 6).map(u => ({ id: u.id, data: u.data, status: u.status, pauta_enviada_em: u.pauta_enviada_em, n_assuntos: (u.assuntos || []).length, tratados: (u.assuntos || []).filter(a => a.status === 'tratado').length, tem_ata: !!u.ata })) };
}
async function ritos() {
  const sql = await getSql();
  let R = await sql`SELECT * FROM reu_ritos ORDER BY ordem, criado_em`;
  if (!R.length) { for (const p of RITOS_PADRAO()) await ritoSalvar(p, true); R = await sql`SELECT * FROM reu_ritos ORDER BY ordem, criado_em`; }
  const U = await sql`SELECT id, rito_id, data, status, pauta_enviada_em, assuntos, ata FROM reu_reunioes ORDER BY data DESC LIMIT 80`;
  return { ritos: R.map(r => linhaRito(r, U)), fontes: Object.fromEntries(Object.entries(FONTES).map(([k, f]) => [k, f.nome])), dias: DIAS, remetente: remetente(), email_ok: !!(process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.RESEND_API_KEY) };
}
async function ritoSalvar(b, semacao) {
  const sql = await getSql();
  const part = [...new Set((Array.isArray(b.participantes) ? b.participantes : String(b.participantes || '').split(/[,;\s]+/)).map(x => String(x).trim().toLowerCase()).filter(x => RX_EMAIL.test(x)))].slice(0, 40);
  const fontes = (b.fontes || []).filter(f => FONTES[f]);
  const dia = Math.max(1, Math.min(7, parseInt(b.dia_semana) || 1)), hora = /^\d{2}:\d{2}$/.test(b.hora || '') ? b.hora : '09:00', dur = Math.max(15, Math.min(240, parseInt(b.duracao_min) || 60));
  if (!String(b.nome || '').trim()) throw new Error('Dê um nome ao rito');
  if (b.id) {
    const a = (await sql`SELECT * FROM reu_ritos WHERE id=${b.id}`)[0]; if (!a) throw new Error('Rito não encontrado');
    const mudouHorario = a.dia_semana !== dia || a.hora !== hora || a.duracao_min !== dur;
    await sql`UPDATE reu_ritos SET nome=${String(b.nome).substring(0, 120)}, objetivo=${b.objetivo || null}, dia_semana=${dia}, hora=${hora}, duracao_min=${dur}, participantes=${JSON.stringify(part)}, fontes=${JSON.stringify(fontes)},
      ativo=${b.ativo !== false}, auto_pauta=${b.auto_pauta !== false}, atualizado_em=NOW() WHERE id=${b.id}`;
    return { id: b.id, convite_desatualizado: !!a.convite_enviado_em && (mudouHorario || JSON.stringify([...part].sort()) !== JSON.stringify([...(a.convite_para || [])].sort()) || (a.ativo && b.ativo === false)) };
  }
  const id = novoId('rit'), sala = 'https://meet.jit.si/Atlantyx-' + String(b.nome).normalize('NFD').replace(/[^\w]+/g, '') .substring(0, 24) + '-' + crypto.randomBytes(4).toString('hex');
  await sql`INSERT INTO reu_ritos (id, nome, objetivo, dia_semana, hora, duracao_min, participantes, fontes, ativo, auto_pauta, sala_video, ordem) VALUES (${id}, ${String(b.nome).substring(0, 120)}, ${b.objetivo || null}, ${dia}, ${hora}, ${dur},
    ${JSON.stringify(part)}, ${JSON.stringify(fontes)}, ${b.ativo !== false}, ${b.auto_pauta !== false}, ${sala}, ${parseInt(b.ordem) || 9})`;
  return { id };
}

// ── convite de calendário (.ics recorrente, RFC 5545) ──
const icsEsc = t => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsDobrar(linha) { const out = []; let s = linha; while (Buffer.byteLength(s) > 74) { let n = 74; while (Buffer.byteLength(s.substring(0, n)) > 74) n--; out.push(s.substring(0, n)); s = ' ' + s.substring(n); } out.push(s); return out.join('\r\n'); }
function ics(r, { cancelar = false } = {}) {
  const d = proximaData(r), [h, m] = String(r.hora).split(':').map(Number), ini = h * 60 + m, fim = ini + (+r.duracao_min || 60);
  const t = (iso, min) => iso.replace(/-/g, '') + 'T' + String(Math.floor(min / 60)).padStart(2, '0') + String(min % 60).padStart(2, '0') + '00';
  const salaSis = baseUrl() + '/?tela=s0ritos&rito=' + encodeURIComponent(r.id);
  const desc = `${r.objetivo || ''}\n\nPauta: o Atlantyx OS envia a pauta na véspera, montada com os dados do sistema.\nSala da reunião (pauta e batimento): ${salaSis}\nVideochamada: ${r.sala_video}`;
  const L = ['BEGIN:VCALENDAR', 'PRODID:-//Atlantyx OS//Ritos semanais//PT', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:' + (cancelar ? 'CANCEL' : 'REQUEST'),
    'BEGIN:VTIMEZONE', 'TZID:' + TZ, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', `UID:rito-${r.id}@atlantyx-os`, `SEQUENCE:${r.convite_seq || 0}`, 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').substring(0, 15) + 'Z',
    `DTSTART;TZID=${TZ}:${t(d, ini)}`, `DTEND;TZID=${TZ}:${t(d, fim)}`, `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[r.dia_semana]}`,
    'SUMMARY:' + icsEsc('Atlantyx · ' + r.nome), 'DESCRIPTION:' + icsEsc(desc), 'LOCATION:' + icsEsc(r.sala_video), 'URL:' + salaSis,
    `ORGANIZER;CN=Atlantyx OS:mailto:${remetente()}`, ...(r.participantes || []).map(p => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${p}`),
    'STATUS:' + (cancelar ? 'CANCELLED' : 'CONFIRMED'), 'TRANSP:OPAQUE', ...(cancelar ? [] : ['BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(r.nome), 'END:VALARM']), 'END:VEVENT', 'END:VCALENDAR'];
  return L.map(icsDobrar).join('\r\n') + '\r\n';
}
const moldura = (titulo, corpo) => `<div style="font-family:Montserrat,Calibri,Arial,sans-serif;color:#0B1226;max-width:680px;"><div style="background:#0B1226;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0;"><b style="letter-spacing:1px;">ATLANTYX</b> · <span style="color:#00C4CC;">${esc(titulo)}</span></div><div style="border:1px solid #e4e8f2;border-top:0;padding:18px 20px;border-radius:0 0 8px 8px;font-size:13.5px;line-height:1.55;">${corpo}</div></div>`;
const botao = (url, t, cor = '#1A3A8F') => `<a href="${esc(url)}" style="display:inline-block;background:${cor};color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:700;margin:4px 6px 4px 0;">${t}</a>`;
async function email(args) { const { enviarEmailGmail } = await import('./financeiro.js'); return enviarEmailGmail({ remetente: 'Atlantyx OS · Reuniões', ...args }); }

async function conviteEnviar({ rito_id }) {
  const sql = await getSql(); const r = (await sql`SELECT * FROM reu_ritos WHERE id=${rito_id}`)[0]; if (!r) throw new Error('Rito não encontrado');
  const cancelar = !r.ativo; const para = cancelar ? (r.convite_para || []) : (r.participantes || []);
  // quem saiu da lista recebe o cancelamento
  const sairam = (r.convite_para || []).filter(p => !para.includes(p));
  if (!para.length) throw new Error(cancelar ? 'Este rito nunca teve convite enviado' : 'Cadastre pelo menos um participante (e-mail)');
  const seq = (r.convite_seq || 0) + (r.convite_enviado_em ? 1 : 0); const rr = { ...r, convite_seq: seq };
  const prox = proximaData(r), salaSis = baseUrl() + '/?tela=s0ritos&rito=' + encodeURIComponent(r.id);
  const corpo = cancelar ? `<p>A reunião semanal <b>${esc(r.nome)}</b> foi <b>cancelada</b>.</p>`
    : `<p>Você está convidado para a reunião semanal <b>${esc(r.nome)}</b>: toda <b>${DIAS[r.dia_semana]}</b>, das <b>${r.hora}</b> por ${r.duracao_min} minutos (horário de Brasília), a partir de <b>${dataBR(prox)}</b>.</p>
      <p>${esc(r.objetivo || '')}</p><p><b>Pauta:</b> chega por e-mail na véspera, montada pelo Atlantyx OS com os dados atualizados do sistema. Na sala da reunião ficam a pauta, os assuntos para batimento e a ata.</p>
      <p>${botao(salaSis, '📋 Sala da reunião no Atlantyx OS')}${botao(r.sala_video, '🎥 Entrar na videochamada', '#0f6b5a')}</p><p style="font-size:12px;color:#5b6478;">O convite de calendário está anexo — aceite para bloquear o horário na sua agenda.</p>`;
  const res = await email({ para, assunto: (cancelar ? 'Cancelada: ' : seq ? 'Atualizada: ' : 'Convite: ') + 'Atlantyx · ' + r.nome + (cancelar ? '' : ` (toda ${DIAS[r.dia_semana]}, ${r.hora})`), html: moldura('Reunião semanal', corpo), ical: ics(rr, { cancelar }) });
  if (sairam.length && !cancelar) { try { await email({ para: sairam, assunto: 'Cancelada para você: Atlantyx · ' + r.nome, html: moldura('Reunião semanal', `<p>Você foi retirado da reunião semanal <b>${esc(r.nome)}</b>.</p>`), ical: ics({ ...rr, participantes: sairam }, { cancelar: true }) }); } catch (_) {} }
  await sql`UPDATE reu_ritos SET convite_seq=${seq}, convite_enviado_em=${cancelar ? null : new Date().toISOString()}, convite_para=${JSON.stringify(cancelar ? [] : para)}, atualizado_em=NOW() WHERE id=${r.id}`;
  return { enviado_para: para, cancelado: cancelar, via: res?.via || null, sequencia: seq };
}

// ── pauta ──
async function reuniaoDe(sql, r, data) {
  let u = (await sql`SELECT * FROM reu_reunioes WHERE rito_id=${r.id} AND data=${data}`)[0];
  if (!u) { const id = novoId('reu'); await sql`INSERT INTO reu_reunioes (id, rito_id, data, hora) VALUES (${id}, ${r.id}, ${data}, ${r.hora}) ON CONFLICT (rito_id, data) DO NOTHING`; u = (await sql`SELECT * FROM reu_reunioes WHERE rito_id=${r.id} AND data=${data}`)[0]; }
  return u;
}
async function pautaGerar({ rito_id, data, sem_ia }) {
  const sql = await getSql(); const r = (await sql`SELECT * FROM reu_ritos WHERE id=${rito_id}`)[0]; if (!r) throw new Error('Rito não encontrado');
  const dia = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : proximaData(r); const u = await reuniaoDe(sql, r, dia);
  // pendências da reunião anterior do mesmo rito: assuntos não tratados e ações com dono/prazo
  const ant = (await sql`SELECT data, assuntos FROM reu_reunioes WHERE rito_id=${r.id} AND data < ${dia} ORDER BY data DESC LIMIT 1`)[0];
  const herdados = (ant?.assuntos || []).filter(a => a.status !== 'tratado' || (a.decisao && a.dono && a.prazo)).map(a => a.status === 'tratado'
    ? { titulo: 'Ação: ' + (a.decisao || a.titulo).substring(0, 120), contexto: `Decidido em ${dataBR(ant.data)} — dono ${a.dono}, prazo ${a.prazo}. Foi feito?`, responsavel: a.dono, tipo: 'acompanhamento', origem: 'Reunião anterior' }
    : { titulo: a.titulo, contexto: `Ficou ${a.status === 'adiado' ? 'adiado' : 'sem tratar'} em ${dataBR(ant.data)}. ${a.contexto || ''}`.substring(0, 300), responsavel: a.responsavel, tipo: a.tipo, origem: 'Reunião anterior' });
  const secoes = await Promise.all((r.fontes || []).map(async k => { const t0 = Date.now(); try { return { fonte: k, ...(await FONTES[k].coletar()), ms: Date.now() - t0 }; } catch (e) { return { fonte: k, titulo: FONTES[k]?.nome || k, erro: e.message, resumo: [], assuntos: [] }; } }));
  let candidatos = [...herdados, ...secoes.flatMap(s => s.assuntos || [])];
  let assuntos = null, abertura = null, via = 'regras';
  if (!sem_ia && candidatos.length && process.env.ANTHROPIC_API_KEY) {
    try { const j = json(await claude(`Você organiza a pauta da reunião semanal "${r.nome}" da Atlantyx (empresa brasileira de dados e IA). Objetivo do rito: ${r.objetivo || '-'}. Duração: ${r.duracao_min} min.
Monte os ASSUNTOS PARA BATIMENTO, do mais importante ao menos: o que exige decisão primeiro, depois riscos, depois acompanhamento. Junte itens repetidos, corte o irrelevante, no máximo 10 assuntos, e distribua os minutos (soma até ${Math.max(10, r.duracao_min - 5)}). Use só fatos dos dados; não invente números. Português do Brasil, frases curtas.
Responda SOMENTE JSON: {"abertura":"1 frase sobre a semana","assuntos":[{"titulo":"...","contexto":"o fato + o que precisa sair da reunião","responsavel":"nome ou área","tipo":"decisao|risco|acompanhamento","minutos":5,"origem":"..."}]}`,
      JSON.stringify({ resumos: secoes.map(s => ({ fonte: s.titulo, resumo: s.resumo, erro: s.erro })), candidatos }).substring(0, 30000), 3500));
      if (Array.isArray(j?.assuntos) && j.assuntos.length) { assuntos = j.assuntos; abertura = j.abertura || null; via = 'ia'; } } catch (_) {}
  }
  if (!assuntos) { const ordem = { decisao: 0, risco: 1, acompanhamento: 2 }; candidatos.sort((a, b) => (ordem[a.tipo] ?? 3) - (ordem[b.tipo] ?? 3)); assuntos = candidatos.slice(0, 12);
    const m = Math.max(3, Math.floor((r.duracao_min - 5) / Math.max(1, assuntos.length))); assuntos = assuntos.map(a => ({ ...a, minutos: m })); }
  // preserva o batimento já feito nesta reunião (se a pauta for regerada depois de começar)
  const antes = Object.fromEntries((u.assuntos || []).map(a => [a.titulo, a]));
  assuntos = assuntos.slice(0, 12).map((a, i) => { const x = antes[a.titulo] || {}; return { id: x.id || 'as' + i + crypto.randomBytes(2).toString('hex'), titulo: String(a.titulo || '').substring(0, 160), contexto: String(a.contexto || '').substring(0, 400),
    responsavel: String(a.responsavel || '').substring(0, 80), tipo: ['decisao', 'risco', 'acompanhamento'].includes(a.tipo) ? a.tipo : 'acompanhamento', minutos: Math.max(1, Math.min(60, parseInt(a.minutos) || 5)), origem: String(a.origem || '').substring(0, 60),
    status: x.status || 'pendente', decisao: x.decisao || '', dono: x.dono || '', prazo: x.prazo || '' }; });
  const pauta = { abertura, secoes: secoes.map(({ assuntos: _a, ...s }) => s), via, gerado_em: new Date().toISOString(), herdados: herdados.length };
  await sql`UPDATE reu_reunioes SET pauta=${JSON.stringify(pauta)}, assuntos=${JSON.stringify(assuntos)}, pauta_gerada_em=NOW(), atualizado_em=NOW() WHERE id=${u.id}`;
  return { reuniao_id: u.id, data: dia, n_assuntos: assuntos.length, via, erros: secoes.filter(s => s.erro).map(s => s.titulo + ': ' + s.erro) };
}
function pautaHtml(r, u) {
  const P = u.pauta || {}, A = u.assuntos || [], salaSis = baseUrl() + '/?tela=s0ritos&reuniao=' + encodeURIComponent(u.id);
  const COR = { decisao: '#b4232f', risco: '#c26a00', acompanhamento: '#1A3A8F' }, ROT = { decisao: 'decisão', risco: 'risco', acompanhamento: 'acompanhamento' };
  const tab = t => t && t.linhas?.length ? `<table style="border-collapse:collapse;width:100%;font-size:12px;margin:6px 0 12px;"><tr>${t.cab.map(c => `<th style="text-align:left;background:#f1f4fa;padding:5px 7px;border-bottom:1px solid #dfe4ef;">${esc(c)}</th>`).join('')}</tr>${t.linhas.map(l => `<tr>${l.map(c => `<td style="padding:5px 7px;border-bottom:1px solid #eef1f7;">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : '';
  return moldura('Pauta · ' + r.nome, `<p><b>${esc(r.nome)}</b> · ${DIAS[r.dia_semana]}, ${dataBR(u.data)}, ${r.hora} (${r.duracao_min} min)</p>${P.abertura ? `<p>${esc(P.abertura)}</p>` : ''}
    <p>${botao(salaSis, '📋 Abrir a sala da reunião')}${botao(r.sala_video, '🎥 Videochamada', '#0f6b5a')}</p>
    <h3 style="font-size:15px;margin:16px 0 6px;">Assuntos para batimento</h3><ol style="padding-left:20px;margin:0;">${A.map(a => `<li style="margin-bottom:8px;"><b>${esc(a.titulo)}</b> <span style="font-size:11px;color:${COR[a.tipo]};border:1px solid ${COR[a.tipo]};border-radius:10px;padding:0 6px;">${ROT[a.tipo]}</span> <span style="font-size:11px;color:#5b6478;">${a.minutos} min${a.responsavel ? ' · ' + esc(a.responsavel) : ''}</span><br><span style="color:#3d4659;">${esc(a.contexto)}</span></li>`).join('')}</ol>
    ${(P.secoes || []).map(s => `<h3 style="font-size:14px;margin:18px 0 4px;">${esc(s.titulo)}</h3>${s.erro ? `<p style="color:#b4232f;font-size:12px;">Dados indisponíveis agora: ${esc(s.erro)}</p>` : (s.resumo || []).map(l => `<div style="font-size:12.5px;">• ${esc(l)}</div>`).join('') + tab(s.tabela)}`).join('')}
    <p style="font-size:11.5px;color:#5b6478;margin-top:16px;">Pauta gerada pelo Atlantyx OS em ${new Date(u.pauta_gerada_em || Date.now()).toLocaleString('pt-BR', { timeZone: TZ })} com os dados do sistema. O que ficar sem decisão volta na próxima semana.</p>`);
}
async function pautaEnviar({ reuniao_id }) {
  const sql = await getSql(); const u = (await sql`SELECT * FROM reu_reunioes WHERE id=${reuniao_id}`)[0]; if (!u) throw new Error('Reunião não encontrada');
  if (!u.pauta) throw new Error('Gere a pauta antes de enviar');
  const r = (await sql`SELECT * FROM reu_ritos WHERE id=${u.rito_id}`)[0]; if (!(r.participantes || []).length) throw new Error('O rito não tem participantes');
  const res = await email({ para: r.participantes, assunto: `Pauta: Atlantyx · ${r.nome} — ${DIAS[r.dia_semana]}, ${dataBR(u.data)}, ${r.hora}`, html: pautaHtml(r, u) });
  await sql`UPDATE reu_reunioes SET pauta_enviada_em=NOW(), status=CASE WHEN status='planejada' THEN 'pauta_enviada' ELSE status END, atualizado_em=NOW() WHERE id=${u.id}`;
  return { enviado_para: r.participantes, via: res?.via || null };
}
async function reuniaoObter({ id, rito_id }) {
  const sql = await getSql();
  let u = id ? (await sql`SELECT * FROM reu_reunioes WHERE id=${id}`)[0] : null;
  if (!u && rito_id) { const r = (await sql`SELECT * FROM reu_ritos WHERE id=${rito_id}`)[0]; if (!r) throw new Error('Rito não encontrado'); u = await reuniaoDe(sql, r, proximaData(r)); }
  if (!u) throw new Error('Reunião não encontrada');
  const r = (await sql`SELECT * FROM reu_ritos WHERE id=${u.rito_id}`)[0];
  return { reuniao: u, rito: linhaRito(r) };
}
async function reuniaoSalvar({ id, assuntos, notas, status }) {
  const sql = await getSql(); const u = (await sql`SELECT * FROM reu_reunioes WHERE id=${id}`)[0]; if (!u) throw new Error('Reunião não encontrada');
  const porId = Object.fromEntries((Array.isArray(assuntos) ? assuntos : []).map(a => [a.id, a]));
  const A = (u.assuntos || []).map(a => { const x = porId[a.id]; return x ? { ...a, status: ['pendente', 'tratado', 'adiado'].includes(x.status) ? x.status : a.status, decisao: String(x.decisao ?? a.decisao).substring(0, 1000), dono: String(x.dono ?? a.dono).substring(0, 80), prazo: String(x.prazo ?? a.prazo).substring(0, 20) } : a; });
  for (const x of (Array.isArray(assuntos) ? assuntos : []).filter(x => x.novo && String(x.titulo || '').trim())) A.push({ id: 'as' + crypto.randomBytes(3).toString('hex'), titulo: String(x.titulo).substring(0, 160), contexto: String(x.contexto || '').substring(0, 400), responsavel: '', tipo: 'acompanhamento', minutos: 5, origem: 'Incluído na reunião', status: 'pendente', decisao: '', dono: '', prazo: '' });
  await sql`UPDATE reu_reunioes SET assuntos=${JSON.stringify(A)}, notas=COALESCE(${notas ?? null}, notas), status=COALESCE(${['planejada', 'pauta_enviada', 'em_andamento', 'realizada'].includes(status) ? status : null}, status), atualizado_em=NOW() WHERE id=${id}`;
  return { ok: true, assuntos: A };
}
async function ataGerar({ id }) {
  const sql = await getSql(); const u = (await sql`SELECT * FROM reu_reunioes WHERE id=${id}`)[0]; if (!u) throw new Error('Reunião não encontrada');
  const r = (await sql`SELECT * FROM reu_ritos WHERE id=${u.rito_id}`)[0]; const A = u.assuntos || [];
  let ata = null;
  try { ata = await claude('Você redige atas de reunião da Atlantyx em português do Brasil: objetivas, só com os fatos recebidos (nada inventado). Formato markdown: título, data, participantes convidados, "Decisões" (cada uma com dono e prazo), "Assuntos adiados", "Resumo da discussão" (das notas) e "Próxima reunião". Curta.',
    JSON.stringify({ rito: r.nome, data: dataBR(u.data), hora: r.hora, participantes: r.participantes, proxima: dataBR(proximaData(r, u.data)), assuntos: A.map(a => ({ titulo: a.titulo, status: a.status, decisao: a.decisao, dono: a.dono, prazo: a.prazo })), notas: u.notas || '' }), 2500); } catch (_) {}
  if (!ata) ata = `# Ata — ${r.nome}\n${DIAS[r.dia_semana]}, ${dataBR(u.data)}, ${r.hora}\n\n## Decisões\n${A.filter(a => a.status === 'tratado').map(a => `- ${a.titulo}: ${a.decisao || 'tratado'}${a.dono ? ' — ' + a.dono : ''}${a.prazo ? ' até ' + a.prazo : ''}`).join('\n') || '- (nenhuma registrada)'}\n\n## Adiados\n${A.filter(a => a.status !== 'tratado').map(a => '- ' + a.titulo).join('\n') || '- (nenhum)'}\n\n## Notas\n${u.notas || '-'}\n\nPróxima reunião: ${dataBR(proximaData(r, u.data))}`;
  await sql`UPDATE reu_reunioes SET ata=${ata}, status='realizada', atualizado_em=NOW() WHERE id=${id}`;
  return { ata };
}
async function ataEnviar({ id }) {
  const sql = await getSql(); const u = (await sql`SELECT * FROM reu_reunioes WHERE id=${id}`)[0]; if (!u?.ata) throw new Error('Gere a ata antes de enviar');
  const r = (await sql`SELECT * FROM reu_ritos WHERE id=${u.rito_id}`)[0];
  const html = String(u.ata).split('\n').map(l => l.startsWith('# ') ? `<h2 style="font-size:17px;">${esc(l.slice(2))}</h2>` : l.startsWith('## ') ? `<h3 style="font-size:14px;margin:14px 0 4px;">${esc(l.slice(3))}</h3>` : l.startsWith('- ') ? `<div>• ${esc(l.slice(2))}</div>` : l.trim() ? `<p style="margin:4px 0;">${esc(l)}</p>` : '').join('');
  await email({ para: r.participantes, assunto: `Ata: Atlantyx · ${r.nome} — ${dataBR(u.data)}`, html: moldura('Ata · ' + r.nome, html + `<p>${botao(baseUrl() + '/?tela=s0ritos&reuniao=' + encodeURIComponent(u.id), '📋 Abrir no Atlantyx OS')}</p>`) });
  await sql`UPDATE reu_reunioes SET ata_enviada_em=NOW(), atualizado_em=NOW() WHERE id=${id}`;
  return { enviado_para: r.participantes };
}
// cron 08:00 (Brasília): véspera da reunião → gera e envia a pauta; no dia, se ainda não foi, envia cedo
async function ciclo() {
  const sql = await getSql(); const R = await sql`SELECT * FROM reu_ritos WHERE ativo AND auto_pauta AND convite_enviado_em IS NOT NULL`;
  const hoje = isoDia(agoraSP()), amanha = somaDias(hoje, 1), feitos = [];
  for (const r of R) {
    const d = proximaData(r); if (d !== hoje && d !== amanha) continue;
    const u = (await sql`SELECT pauta_enviada_em FROM reu_reunioes WHERE rito_id=${r.id} AND data=${d}`)[0]; if (u?.pauta_enviada_em) continue;
    try { const g = await pautaGerar({ rito_id: r.id, data: d }); await pautaEnviar({ reuniao_id: g.reuniao_id }); feitos.push(r.nome + ' ' + d); } catch (e) { feitos.push(r.nome + ': ERRO ' + e.message); }
  }
  return { pautas: feitos };
}

async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url || '/', 'http://x').searchParams);
  try {
    if (req.method === 'GET') { if (q.cron) return res.status(200).json({ success: true, ...(await ciclo()) }); return res.status(405).json({ success: false, error: 'Use POST' }); }
    const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    const acoes = {
      ritos: () => ritos(), rito_salvar: () => ritoSalvar(b), rito_excluir: async () => { const sql = await getSql(); await sql`DELETE FROM reu_ritos WHERE id=${b.id}`; return { ok: true }; },
      convite_enviar: () => conviteEnviar(b), convite_ics: async () => { const sql = await getSql(); const r = (await sql`SELECT * FROM reu_ritos WHERE id=${b.rito_id}`)[0]; if (!r) throw new Error('Rito não encontrado'); return { ics: ics(r), nome: 'atlantyx-' + r.nome.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase() + '.ics' }; },
      pauta_gerar: () => pautaGerar(b), pauta_enviar: () => pautaEnviar(b), pauta_previa: async () => { const o = await reuniaoObter(b); return { html: pautaHtml(o.rito, o.reuniao) }; },
      reuniao_obter: () => reuniaoObter(b), reuniao_salvar: () => reuniaoSalvar(b), ata_gerar: () => ataGerar(b), ata_enviar: () => ataEnviar(b), ciclo: () => ciclo(),
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) { console.error('[reunioes]', e.message); return res.status(500).json({ success: false, error: e.message, hint: e.hint || null }); }
}
export default comGuarda(handler, 'reunioes');
export { ics as _ics, proximaData as _proximaData, FONTES as fontesPauta };
