import { comGuarda } from '../lib/qa-guard.js';
import crypto from 'node:crypto';
import { K_VIGENTE, K_RASCUNHO, K_VERSOES, K_AJUSTES, planoInicial, planoNormalizar, planoSimular, planoResumoTexto, STATUS as ALV_STATUS } from '../lib/plano-estrategico.js'; // v3.240
// api/estrategia.js — v3.151 · ESTRATÉGIA IA · trilha T3
// • ATLAS, o estrategista-chefe: conversa por chat ou voz, com os números vivos da empresa (financeiro, comercial,
//   projetos, ideias, Esteira de Demandas), as premissas estratégicas e o plano vigente.
// • Sala de Estratégia: ATLAS conduz um debate com um comitê de IAs (CFO, CRO, CTO, COO, Advogado do Diabo e Voz do
//   Cliente). Rodadas com intervenção do fundador → síntese num plano (objetivos, iniciativas, KPIs, riscos, 90 dias)
//   → o fundador aprova como PLANO VIGENTE e manda as iniciativas para a Esteira de Demandas, o Pipeline de Ideias ou
//   a pauta de uma reunião semanal.
// • NORTE, o mentor de propósito e metas: alinha as metas pessoais do fundador ao propósito dele e ao da empresa
//   (lê "S1 · Propósito e Metas Pessoais" e as metas da empresa), conversa por chat ou voz e monta o plano de alinhamento.
// Nada é executado sozinho: a IA propõe, o fundador decide.

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
let _sql = null, _pronto = false;
async function getSql() {
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); }
  if (_pronto) return _sql;
  await _sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS est_conversas (id TEXT PRIMARY KEY, titulo TEXT, mensagens JSONB DEFAULT '[]'::jsonb, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await _sql`CREATE TABLE IF NOT EXISTS est_sessoes (id TEXT PRIMARY KEY, tema TEXT NOT NULL, objetivo TEXT, agentes JSONB DEFAULT '[]'::jsonb, falas JSONB DEFAULT '[]'::jsonb,
    sintese JSONB, status TEXT DEFAULT 'aberta', acoes JSONB DEFAULT '[]'::jsonb, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  _pronto = true; return _sql;
}
const novoId = p => p + '_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
async function kv(k, v) {
  const sql = await getSql();
  if (v === undefined) { const r = (await sql`SELECT value FROM kv_store WHERE key=${k}`)[0]; if (!r) return null; try { return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch (_) { return null; } }
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v;
}

// ── premissas (editáveis na tela) ──
const PREMISSAS_PADRAO = `Atlantyx: empresa brasileira B2B de dados, BI, engenharia de dados e IA, com 17 anos de história. Clientes de grande porte em energia, financeiro e varejo de veículos.
Três motores de negócio: (1) alocação de talentos, (2) projetos sob medida, (3) suíte própria de produtos de IA (Atlantyx OS e verticais).
Direção: pensar em "negócios completos" que vendem resultado/ROI, não sistemas. Só o motor de produtos sobrevive no horizonte de 10–20 anos.
Metas: crescimento de 25% ao ano no faturamento; margem de lucro líquido de 35%; faturamento de R$ 6,5 milhões em 2027; receita recorrente (ARR) = 30% do faturamento até o fim de 2027 e 60% até 2031.
Foco: escolher 1–2 produtos-âncora nos próximos 18 meses e despriorizar o resto. Maior risco: diluição de foco.
Interesse em expansão internacional (corredor Houston/EUA, câmaras de comércio europeias).`;

// ── comitê de IAs ──
const AGENTES = {
  atlas: { nome: 'ATLAS', papel: 'Estrategista-chefe', cor: '#00C4CC', voz: { pitch: 1, rate: 1.04 },
    foco: 'conduz, conecta as visões e transforma em escolhas: onde jogar, como vencer, o que NÃO fazer. Usa frameworks (Porter, Oceano Azul, Playing to Win, OKR, horizonte H1/H2/H3) só quando ajudam a decidir.' },
  cfo: { nome: 'CFO IA', papel: 'Finanças e Risco', cor: '#2EE6A6', voz: { pitch: 0.85, rate: 1 }, foco: 'caixa, margem, capital necessário, retorno, payback, risco financeiro e o impacto de cada escolha no DRE e nas metas.' },
  cro: { nome: 'CRO IA', papel: 'Mercado, Vendas e Marketing', cor: '#FFB547', voz: { pitch: 1.15, rate: 1.05 }, foco: 'mercado, ICP, posicionamento, canais, funil, pipeline, preço e como a escolha vira receita.' },
  cto: { nome: 'CTO IA', papel: 'Produto, Tecnologia e IA', cor: '#7C9CFF', voz: { pitch: 0.95, rate: 1.02 }, foco: 'produto, arquitetura, viabilidade técnica, IA generativa, reuso entre clientes, escala e o que dá para construir com o time atual.' },
  coo: { nome: 'COO IA', papel: 'Operação, Pessoas e Entrega', cor: '#C58CFF', voz: { pitch: 1.05, rate: 1 }, foco: 'capacidade do time, alocação, entrega dos projetos, processos (Método B.P.M., Esteira de Entrega), contratação e execução.' },
  critico: { nome: 'Advogado do Diabo', papel: 'Riscos e Premissas', cor: '#FF5C7A', voz: { pitch: 0.75, rate: 0.98 }, foco: 'ataca as premissas mais frágeis, aponta o que pode dar errado, vieses e o custo de oportunidade. Discorda com fundamento.' },
  norte: { nome: 'NORTE', papel: 'Mentor de Propósito e Metas', cor: '#F5D76E', voz: { pitch: 1.08, rate: 0.97 },
    foco: 'liga a estratégia ao propósito do fundador e da empresa: o que essa escolha faz pela vida que ele quer, pelo legado e pelas metas pessoais; aponta conflitos entre metas pessoais e da empresa.' },
  cliente: { nome: 'Voz do Cliente', papel: 'CIO de grande empresa', cor: '#9BA8C9', voz: { pitch: 1.1, rate: 0.98 }, foco: 'fala como um CIO/diretor de grande empresa brasileira que compraria da Atlantyx: o que valoriza, o que trava a compra, o que pagaria.' },
};
const COMITE_PADRAO = ['cfo', 'cro', 'cto', 'coo', 'critico'];

// ── contexto vivo (cache de 10 min) ──
async function contexto(forcar) {
  const c = await kv('est:contexto');
  if (!forcar && c && Date.now() - Date.parse(c.em) < 10 * 60000) return c;
  const [tv, reu] = await Promise.all([import('./tv.js'), import('./reunioes.js')]);
  const F = reu.fontesPauta || {};
  const pegar = async (k) => { try { const r = await F[k].coletar(); return { resumo: r.resumo, tabela: r.tabela ? { cab: r.tabela.cab, linhas: r.tabela.linhas.slice(0, 10) } : null, alertas: (r.assuntos || []).slice(0, 6).map(a => a.titulo) }; } catch (e) { return { erro: e.message }; } };
  const [gestao, projetos, ideias, demandas, entrega] = await Promise.all([tv.dadosGestao(false).catch(e => ({ erro: e.message })), pegar('projetos_pmo'), pegar('ideias'), pegar('esteira_demandas'), pegar('esteira_entrega')]);
  const out = { em: new Date().toISOString(), financeiro: gestao.fin || gestao, comercial: gestao.com || null, projetos, ideias, esteira_demandas: demandas, esteira_entrega: entrega };
  await kv('est:contexto', out); return out;
}
async function propositoPessoal() {
  const [p, m] = await Promise.all([kv('proposito'), kv('metas')]);
  return { proposito: p || null, metas_dashboard: m || null, plano_alinhamento: (await kv('norte:plano')) || null };
}
async function premissas() { return (await kv('est:premissas'))?.texto || PREMISSAS_PADRAO; }
// v3.240: premissas + PLANO ESTRATÉGICO CADASTRADO (alavancas, metas, pesos) para os prompts — sem plano, só as premissas
async function premissasCtx() {
  const prem = await premissas();
  try { const v = await kv(K_VIGENTE); if (v?.plano) return prem + '\n\n' + planoResumoTexto(v.plano, v); } catch (_) {}
  return prem;
}
async function planoVigente() { return await kv('est:plano'); }
function resumoCtx(ctx) { // compacto para o prompt
  const f = ctx.financeiro || {}, c = ctx.comercial || {};
  return JSON.stringify({ atualizado_em: ctx.em, financeiro: { mes: f.mes, ano: f.ano, caixa: f.caixa, a_receber: f.receber, recebiveis_vencidos: f.receber_vencido, a_pagar: f.pagar, serie_mensal: (f.mensal || []).slice(-12), erro: f.erro },
    comercial: c && { meta_mes_pct: c.meta_mes_pct, meta_ano_pct: c.meta_ano_pct, falta_mes: c.gap_mes, falta_ano: c.gap_ano, propostas: c.propostas, win_rate_pct: c.win_rate_pct, ciclo_dias: c.ciclo_dias, funil_30d: c.funil, ritmo_time: c.semaforo, erro: c.erro },
    projetos: ctx.projetos, ideias: ctx.ideias, esteira_demandas: ctx.esteira_demandas, esteira_entrega: ctx.esteira_entrega }).substring(0, 14000);
}
async function claude(system, messages, maxTokens = 1500) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error('IA: ' + (d?.error?.message || r.status));
  return (d.content || []).map(c => c.text || '').join('').trim();
}
const json = t => { const s = String(t || '').replace(/```json|```/g, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); try { return JSON.parse(s.substring(a, b + 1)); } catch (_) { return null; } };
const REGRAS = `Regras: português do Brasil; use os números do CONTEXTO quando existirem e diga quando um dado falta — nunca invente número, cliente ou fato; seja específico para a Atlantyx (nada de conselho genérico); prefira poucas escolhas claras com o porquê e o próximo passo.`;

// ── chat com o ATLAS ──
async function chat({ conversa_id, mensagem, voz, persona }) {
  const sql = await getSql(); const m = String(mensagem || '').trim(); if (!m) throw new Error('Escreva ou fale a sua pergunta');
  let conv = conversa_id ? (await sql`SELECT * FROM est_conversas WHERE id=${conversa_id}`)[0] : null;
  const quem = persona === 'norte' ? 'norte' : 'atlas';
  if (!conv) { const id = novoId('conv'); await sql`INSERT INTO est_conversas (id, titulo) VALUES (${id}, ${(quem === 'norte' ? '🧭 ' : '') + m.substring(0, 80)})`; conv = { id, mensagens: [] }; }
  const [ctx, prem, plano] = await Promise.all([contexto(), premissasCtx(), planoVigente()]);
  const hist = (conv.mensagens || []).slice(-16).map(x => ({ role: x.role, content: x.content }));
  const system = `Você é ATLAS, o estrategista-chefe de IA da Atlantyx, conversando com o fundador e CEO (Fabio). Papel: ${AGENTES.atlas.foco}
${REGRAS}
${voz ? 'A resposta será LIDA EM VOZ ALTA: frases curtas, sem markdown, sem tabelas, sem listas longas — no máximo 120 palavras, termine com uma pergunta ou próximo passo.' : 'Formato: markdown leve (negrito, listas curtas). Até 250 palavras, salvo se pedirem detalhe.'}
Se o fundador quiser aprofundar com várias visões, sugira levar o tema à Sala de Estratégia.

PREMISSAS ESTRATÉGICAS (definidas pelo fundador):
${prem}

PLANO VIGENTE: ${plano ? JSON.stringify({ aprovado_em: plano.aprovado_em, tema: plano.tema, sintese: plano.sintese }).substring(0, 3500) : '(nenhum aprovado ainda)'}

CONTEXTO VIVO DO ATLANTYX OS (JSON): ${resumoCtx(ctx)}`;
  const sysNorte = quem === 'norte' ? `Você é NORTE, o mentor de propósito e metas do fundador e CEO da Atlantyx (Fabio). Seu trabalho: ajudar a viver o propósito dele e a alinhar as METAS PESSOAIS (vida, família, saúde, finanças pessoais, legado, causa social) com as METAS DA EMPRESA e o propósito da Atlantyx.
Como você age: escuta antes de aconselhar; faz uma pergunta poderosa por vez quando faltar clareza; transforma propósito em metas concretas (SMART), hábitos e rituais (revisão semanal, trimestral); aponta com respeito quando uma meta pessoal e uma da empresa competem (tempo, energia, dinheiro) e propõe a troca consciente; celebra avanço real.
Limites: você não é terapeuta nem médico — em temas de saúde ou emocionais, acolha e sugira um profissional. Não invente dados; use os do contexto. Português do Brasil, tom humano e direto.
${voz ? 'A resposta será LIDA EM VOZ ALTA: frases curtas, sem markdown, no máximo 110 palavras, termine com uma pergunta.' : 'Formato: markdown leve. Até 220 palavras, salvo se pedirem detalhe.'}

PROPÓSITO E METAS PESSOAIS (cadastrados em S1 · Propósito e Metas Pessoais) + metas do painel + último plano de alinhamento: ${JSON.stringify(await propositoPessoal()).substring(0, 6000)}

PREMISSAS E METAS DA EMPRESA: ${prem}
PLANO ESTRATÉGICO VIGENTE: ${plano ? JSON.stringify(plano.sintese).substring(0, 2000) : '(nenhum)'}
RESULTADO DA EMPRESA (financeiro e comercial): ${JSON.stringify({ financeiro: { mes: ctx.financeiro?.mes, ano: ctx.financeiro?.ano }, comercial: { meta_mes_pct: ctx.comercial?.meta_mes_pct, meta_ano_pct: ctx.comercial?.meta_ano_pct } })}` : null;
  const resposta = await claude(sysNorte || system, [...hist, { role: 'user', content: m }], voz ? 600 : 1400);
  const msgs = [...(conv.mensagens || []), { role: 'user', content: m, em: new Date().toISOString(), voz: !!voz }, { role: 'assistant', content: resposta, em: new Date().toISOString() }].slice(-60);
  await sql`UPDATE est_conversas SET mensagens=${JSON.stringify(msgs)}, atualizado_em=NOW() WHERE id=${conv.id}`;
  return { conversa_id: conv.id, resposta, contexto_em: ctx.em, persona: quem };
}
// plano de alinhamento propósito × metas (NORTE)
async function nortePlano() {
  const [pp, prem, plano, ctx] = await Promise.all([propositoPessoal(), premissasCtx(), planoVigente(), contexto()]);
  if (!pp.proposito) throw new Error('Preencha primeiro "S1 · Propósito e Metas Pessoais" (propósito de vida, legado, metas) — o NORTE parte dele');
  const t = await claude(`Você é NORTE, mentor de propósito e metas do fundador da Atlantyx. Monte o PLANO DE ALINHAMENTO entre o propósito pessoal, as metas pessoais e as metas da empresa. Use só o que foi cadastrado; onde faltar, deixe a pergunta. Português do Brasil.
Responda SOMENTE JSON: {"proposito_em_uma_frase":"...","como_a_atlantyx_serve_ao_proposito":"2-3 frases","metas_pessoais":[{"meta":"SMART com número e prazo","area":"vida|família|saúde|finanças|legado|social|desenvolvimento","liga_ao_proposito":"por quê"}],"metas_empresa_que_importam":[{"meta":"...","por_que_importa_pra_voce":"..."}],"tensoes":[{"entre":"meta pessoal × meta da empresa","troca_sugerida":"..."}],"rituais":[{"ritual":"...","frequencia":"semanal|mensal|trimestral"}],"proximos_30_dias":["..."],"perguntas_em_aberto":["..."]}`,
    [{ role: 'user', content: JSON.stringify({ proposito_e_metas_pessoais: pp, premissas_empresa: prem, plano_estrategico: plano?.sintese || null, resultado_empresa: { mes: ctx.financeiro?.mes, ano: ctx.financeiro?.ano } }).substring(0, 16000) }], 3000);
  const j = json(t); if (!j?.proposito_em_uma_frase) throw new Error('A IA não devolveu o plano no formato esperado — tente de novo');
  const out = { ...j, gerado_em: new Date().toISOString() }; await kv('norte:plano', out); return { plano: out };
}


// ═══ v3.240: PLANO ESTRATÉGICO CADASTRADO — rascunho → aprovação → vigente (com histórico) e ajuste fino ═══
const _hoje = () => new Date().toISOString();
async function planoEstrObter() {
  const [vig, ras, vers, aj] = await Promise.all([kv(K_VIGENTE), kv(K_RASCUNHO), kv(K_VERSOES), kv(K_AJUSTES)]);
  const rascunho = ras?.plano ? ras : { plano: vig?.plano || planoInicial(), nao_salvo: true, base_versao: vig?.versao || null };
  let realizado = null; try { realizado = await planoEstrRealizado(vig?.plano || rascunho.plano); } catch (e) { realizado = { erro: e.message }; }
  return { vigente: vig || null, rascunho, versoes: (vers || []).map(v => ({ versao: v.versao, aprovado_em: v.aprovado_em, aprovado_por: v.aprovado_por, comentario: v.comentario, nome: v.plano?.nome })),
    ajustes: (aj || []).slice(0, 30), sim_rascunho: planoSimular(rascunho.plano), sim_vigente: vig?.plano ? planoSimular(vig.plano) : null, realizado, status_opcoes: ALV_STATUS };
}
async function planoEstrSalvar({ plano, comentario }, usuario) {
  if (!plano || !Array.isArray(plano.alavancas)) throw Object.assign(new Error('Plano inválido'), { status: 400 });
  const vig = await kv(K_VIGENTE);
  const v = { plano: planoNormalizar(plano), salvo_em: _hoje(), salvo_por: usuario || 'fundador', comentario: String(comentario || '').substring(0, 500), base_versao: vig?.versao || null };
  await kv(K_RASCUNHO, v); return { rascunho: v, sim: planoSimular(v.plano) };
}
async function _vigenteNovo(plano, usuario, comentario, origem) {
  const vig = await kv(K_VIGENTE);
  if (vig?.plano) { const h = (await kv(K_VERSOES)) || []; await kv(K_VERSOES, [vig, ...h].slice(0, 24)); }
  const novo = { plano: planoNormalizar(plano), versao: (vig?.versao || 0) + 1, aprovado_em: _hoje(), aprovado_por: usuario || 'fundador', comentario: String(comentario || '').substring(0, 500), origem: origem || 'tela' };
  await kv(K_VIGENTE, novo); return novo;
}
async function planoEstrAprovar({ comentario, plano }, usuario) {
  let ras = await kv(K_RASCUNHO);
  if (plano) ras = { plano: planoNormalizar(plano) }; // aprova o que está na tela (salva e aprova de uma vez)
  if (!ras?.plano) { const vig = await kv(K_VIGENTE); if (vig) throw Object.assign(new Error('Não há rascunho com mudanças para aprovar'), { status: 400 }); ras = { plano: planoInicial() }; }
  const novo = await _vigenteNovo(ras.plano, usuario, comentario, 'aprovação do rascunho');
  await kv(K_RASCUNHO, { plano: novo.plano, salvo_em: _hoje(), base_versao: novo.versao, nao_salvo: true });
  return { vigente: novo, sim: planoSimular(novo.plano) };
}
async function planoEstrRestaurar({ versao }) {
  const vers = (await kv(K_VERSOES)) || []; const v = vers.find(x => Number(x.versao) === Number(versao));
  if (!v) throw Object.assign(new Error('Versão não encontrada'), { status: 404 });
  const r = { plano: v.plano, salvo_em: _hoje(), comentario: 'Restaurado da versão ' + v.versao, base_versao: v.versao };
  await kv(K_RASCUNHO, r); return { rascunho: r, sim: planoSimular(r.plano) };
}
// REALIZADO por alavanca: leads e reuniões que vieram das trilhas (utm_campaign começa com "alv-<id>") e a receita
// informada na tela. (Receita automática por alavanca depende de classificar cliente/projeto no QuickBooks — próximo passo.)
async function planoEstrRealizado(plano) {
  const sql = await getSql(); const P = planoNormalizar(plano || {});
  let rows = [];
  try { rows = await sql`SELECT substring(utm->>'campaign' from '^alv-([a-z0-9-]+?)_') AS alv, COUNT(*)::int AS leads, COUNT(reuniao_marcada_em)::int AS reunioes,
      COUNT(*) FILTER (WHERE criado_em > NOW() - INTERVAL '30 days')::int AS leads_30d
    FROM leads WHERE criado_em > NOW() - INTERVAL '90 days' AND COALESCE(status,'') <> 'qa_teste' AND utm->>'campaign' LIKE 'alv-%' GROUP BY 1`; }
  catch (_) { rows = []; } // tabela de leads ainda não existe — sem realizado, sem erro
  const por = Object.fromEntries(rows.filter(r => r.alv).map(r => [r.alv, r]));
  return { janela: '90 dias', alavancas: P.alavancas.map(a => ({ id: a.id, leads_90d: por[a.id]?.leads || 0, leads_30d: por[a.id]?.leads_30d || 0, reunioes_90d: por[a.id]?.reunioes || 0, receita_realizada: a.receita_realizada })),
    sem_trilha_aviso: rows.length ? null : 'Nenhum lead com trilha ainda — os posts e anúncios passam a marcar a trilha (utm_campaign "alv-…") a partir desta versão.' };
}
// ATLAS sugere o AJUSTE FINO (pesos, metas, status) a partir do realizado — fica PENDENTE até o fundador aprovar
async function planoEstrSugerir({ automatico = false } = {}) {
  const vig = await kv(K_VIGENTE); if (!vig?.plano) throw Object.assign(new Error('Aprove um plano primeiro — a sugestão de ajuste parte do plano vigente'), { status: 400 });
  const [ctx, real] = await Promise.all([contexto(), planoEstrRealizado(vig.plano)]);
  const P = vig.plano;
  const t = await claude(`Você é ATLAS, estrategista-chefe da Atlantyx. Faça o AJUSTE FINO do plano estratégico vigente comparando o planejado com o realizado. ${REGRAS}
Proponha no máximo 5 mudanças, só onde o dado justifica (ex.: trilha com muitos leads e nenhuma reunião → revisar oferta; trilha sem lead em 60 dias → baixar peso; meta fora do alcance → ajustar). Campos que pode mudar por alavanca: peso_campanha (0–100), status (${Object.keys(ALV_STATUS).join('|')}), receita_meta, margem_pct, taxa_fechamento, oferta. Se faltar dado para decidir, diga isso em vez de mudar.
Responda SOMENTE JSON: {"resumo":"2 frases","mudancas":[{"alavanca":"id","campo":"...","de":"valor atual","para":"novo valor","por_que":"1 frase com o dado"}],"faltam_dados":["..."]}`,
    [{ role: 'user', content: JSON.stringify({ plano_vigente: { versao: vig.versao, ...P }, simulacao: planoSimular(P), realizado: real, contexto: JSON.parse(resumoCtx(ctx)) }).substring(0, 22000) }], 1800);
  const j = json(t); if (!j || !Array.isArray(j.mudancas)) throw new Error('A IA não devolveu a sugestão no formato esperado — tente de novo');
  const ids = new Set(P.alavancas.map(a => a.id)), CAMPOS = ['peso_campanha', 'status', 'receita_meta', 'margem_pct', 'taxa_fechamento', 'oferta'];
  const mud = j.mudancas.filter(m => ids.has(m.alavanca) && CAMPOS.includes(m.campo)).slice(0, 5)
    .map(m => ({ alavanca: m.alavanca, nome: P.alavancas.find(a => a.id === m.alavanca)?.nome, campo: m.campo, de: P.alavancas.find(a => a.id === m.alavanca)?.[m.campo], para: m.para, por_que: String(m.por_que || '').substring(0, 300) }));
  const aj = { id: novoId('aj'), em: _hoje(), base_versao: vig.versao, resumo: String(j.resumo || '').substring(0, 600), mudancas: mud, faltam_dados: (j.faltam_dados || []).slice(0, 5), status: 'pendente', automatico: !!automatico };
  const L = (await kv(K_AJUSTES)) || []; await kv(K_AJUSTES, [aj, ...L].slice(0, 40)); return { ajuste: aj };
}
async function planoEstrAjusteDecidir({ id, decisao }, usuario) {
  const L = (await kv(K_AJUSTES)) || []; const aj = L.find(x => x.id === id);
  if (!aj || aj.status !== 'pendente') throw Object.assign(new Error('Sugestão não encontrada ou já decidida'), { status: 400 });
  aj.status = decisao === 'aprovar' ? 'aprovado' : 'recusado'; aj.decidido_em = _hoje(); aj.decidido_por = usuario || 'fundador';
  let novo = null;
  if (aj.status === 'aprovado') {
    const aplicar = pl => { const p = JSON.parse(JSON.stringify(pl)); for (const m of aj.mudancas) { const a = (p.alavancas || []).find(x => x.id === m.alavanca); if (a) a[m.campo] = ['status', 'oferta'].includes(m.campo) ? m.para : Number(String(m.para).replace(',', '.')); } return p; };
    const vig = await kv(K_VIGENTE); novo = await _vigenteNovo(aplicar(vig.plano), usuario, 'Ajuste fino da ATLAS: ' + aj.resumo.substring(0, 200), 'ajuste ' + aj.id);
    const ras = await kv(K_RASCUNHO); await kv(K_RASCUNHO, { ...(ras || {}), plano: aplicar(ras?.plano || vig.plano), base_versao: novo.versao, salvo_em: _hoje() });
    aj.virou_versao = novo.versao;
  }
  await kv(K_AJUSTES, L); return { ajuste: aj, vigente: novo };
}

// ── Sala de Estratégia ──
async function salaAbrir({ tema, objetivo, agentes }) {
  const sql = await getSql(); if (!String(tema || '').trim()) throw new Error('Diga qual é o tema estratégico');
  const ag = (Array.isArray(agentes) ? agentes : COMITE_PADRAO).filter(a => AGENTES[a] && a !== 'atlas');
  const id = novoId('sala');
  await sql`INSERT INTO est_sessoes (id, tema, objetivo, agentes) VALUES (${id}, ${String(tema).substring(0, 300)}, ${objetivo || null}, ${JSON.stringify(ag.length ? ag : COMITE_PADRAO)})`;
  return { sessao_id: id };
}
const fmtFalas = F => F.map(f => `[rodada ${f.rodada}] ${f.autor === 'fundador' ? 'FUNDADOR (Fabio)' : (AGENTES[f.autor]?.nome || f.autor)}: ${f.texto}`).join('\n\n').substring(0, 16000);
async function salaRodada({ sessao_id, intervencao }) {
  const sql = await getSql(); const s = (await sql`SELECT * FROM est_sessoes WHERE id=${sessao_id}`)[0]; if (!s) throw new Error('Sessão não encontrada');
  const F = s.falas || []; const rodada = F.reduce((m, f) => Math.max(m, f.rodada || 0), 0) + 1;
  if (String(intervencao || '').trim()) F.push({ autor: 'fundador', texto: String(intervencao).trim().substring(0, 2000), rodada, em: new Date().toISOString() });
  const [ctx, prem, plano] = await Promise.all([contexto(), premissasCtx(), planoVigente()]);
  const base = `SALA DE ESTRATÉGIA DA ATLANTYX — tema: "${s.tema}"${s.objetivo ? '\nObjetivo da sessão: ' + s.objetivo : ''}

PREMISSAS ESTRATÉGICAS: ${prem}
PLANO VIGENTE: ${plano ? JSON.stringify(plano.sintese).substring(0, 2500) : '(nenhum)'}
CONTEXTO VIVO (JSON): ${resumoCtx(ctx)}`;
  // abertura do ATLAS na 1ª rodada (enquadra o problema)
  const novas = [];
  if (rodada === 1) {
    const t = await claude(`Você é ATLAS, estrategista-chefe da Atlantyx, e CONDUZ esta sala. ${REGRAS}\nAbra a sessão em até 120 palavras: enquadre a decisão em jogo, os 2–3 números do contexto que mais pesam e as perguntas que cada membro do comitê deve responder.`, [{ role: 'user', content: base }], 700);
    novas.push({ autor: 'atlas', texto: t, rodada, em: new Date().toISOString() });
  }
  const hist = fmtFalas([...F, ...novas]);
  const resp = await Promise.allSettled((s.agentes || COMITE_PADRAO).map(a => claude(`Você é ${AGENTES[a].nome} (${AGENTES[a].papel}) no comitê de estratégia de IA da Atlantyx. Sua lente: ${AGENTES[a].foco}
${REGRAS}
Fale SÓ da sua lente, tome posição clara (concorde ou discorde dos outros, citando quem), traga números do contexto e termine com UMA recomendação concreta. Máximo 130 palavras, sem markdown pesado.`,
    [{ role: 'user', content: base + '\n\nDEBATE ATÉ AGORA:\n' + (hist || '(início)') + `\n\nRodada ${rodada}: dê a sua posição${intervencao ? ', respondendo também à intervenção do fundador' : ''}.` }], 600)));
  resp.forEach((r, i) => novas.push({ autor: (s.agentes || COMITE_PADRAO)[i], texto: r.status === 'fulfilled' ? r.value : '(não conseguiu responder agora: ' + String(r.reason?.message || r.reason).substring(0, 120) + ')', rodada, em: new Date().toISOString(), erro: r.status !== 'fulfilled' }));
  const todas = [...F, ...novas];
  await sql`UPDATE est_sessoes SET falas=${JSON.stringify(todas)}, atualizado_em=NOW() WHERE id=${s.id}`;
  return { rodada, falas: novas, intervencao: !!intervencao };
}
async function salaSintese({ sessao_id }) {
  const sql = await getSql(); const s = (await sql`SELECT * FROM est_sessoes WHERE id=${sessao_id}`)[0]; if (!s) throw new Error('Sessão não encontrada');
  if (!(s.falas || []).length) throw new Error('Rode pelo menos uma rodada de debate antes da síntese');
  const [ctx, prem] = await Promise.all([contexto(), premissasCtx()]);
  const t = await claude(`Você é ATLAS, estrategista-chefe da Atlantyx. Feche a Sala de Estratégia num PLANO acionável, baseado SÓ no debate e no contexto. ${REGRAS}
Responda SOMENTE JSON: {"decisao":"a escolha central em 1-2 frases","racional":"por que (3-4 frases, com os números)","objetivos":[{"objetivo":"...","kr":["resultado-chave mensurável com número e prazo"]}],"iniciativas":[{"titulo":"ação concreta","dono":"área ou papel","prazo":"AAAA-MM ou trimestre","impacto":"alto|medio|baixo","esforco":"P|M|G","destino_sugerido":"demanda|ideia|pauta"}],"riscos":[{"risco":"...","mitigacao":"..."}],"nao_fazer":["o que deixa de fazer para manter o foco"],"proximos_90_dias":["semana/mês: entrega"],"divergencias":["onde o comitê não concordou"],"pergunta_ao_fundador":"a decisão que só o fundador pode tomar"}
destino_sugerido: "demanda" = mudança no sistema Atlantyx OS; "ideia" = novo negócio/produto a estudar; "pauta" = assunto para decidir na reunião semanal.`,
    [{ role: 'user', content: `TEMA: ${s.tema}\nOBJETIVO: ${s.objetivo || '-'}\nPREMISSAS: ${prem}\nCONTEXTO: ${resumoCtx(ctx)}\n\nDEBATE COMPLETO:\n${fmtFalas(s.falas)}` }], 3500);
  const sintese = json(t); if (!sintese?.decisao) throw new Error('A IA não devolveu a síntese no formato esperado — tente de novo');
  await sql`UPDATE est_sessoes SET sintese=${JSON.stringify(sintese)}, status='sintetizada', atualizado_em=NOW() WHERE id=${s.id}`;
  return { sintese };
}
async function salaAprovar({ sessao_id }, usuario) {
  const sql = await getSql(); const s = (await sql`SELECT * FROM est_sessoes WHERE id=${sessao_id}`)[0]; if (!s?.sintese) throw new Error('Gere a síntese antes de aprovar');
  const ant = await planoVigente();
  await kv('est:plano', { sessao_id: s.id, tema: s.tema, sintese: s.sintese, aprovado_em: new Date().toISOString(), aprovado_por: usuario || 'fundador' });
  if (ant) { const h = (await kv('est:planos_anteriores')) || []; await kv('est:planos_anteriores', [ant, ...h].slice(0, 12)); }
  await sql`UPDATE est_sessoes SET status='aprovada', atualizado_em=NOW() WHERE id=${s.id}`;
  return { ok: true };
}
// ── iniciativas → Esteira de Demandas / Pipeline de Ideias / pauta de reunião semanal ──
async function chamar(mod, body) {
  const m = await import('./' + mod + '.js'); let out = null;
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { out = o; return this; }, send(b) { try { out = JSON.parse(b); } catch (_) { out = { raw: b }; } return this; }, setHeader() {}, end() { return this; } };
  await m.default({ method: 'POST', body, query: {}, headers: {}, url: '/api/' + mod }, res);
  if (!out || out.success === false) throw new Error(out?.error || 'sem resposta'); return out;
}
async function salaAcoes({ sessao_id, itens = [], rito_id }) {
  const sql = await getSql(); const s = (await sql`SELECT * FROM est_sessoes WHERE id=${sessao_id}`)[0]; if (!s?.sintese) throw new Error('Sessão sem síntese');
  const I = s.sintese.iniciativas || [], feitos = [], pauta = [];
  for (const it of itens) {
    const x = I[it.indice]; if (!x) continue; const origem = `Sala de Estratégia · ${s.tema}`.substring(0, 140);
    try {
      if (it.destino === 'demanda') { const r = await chamar('agente-ideias', { action: 'nova', dados: { titulo: x.titulo, proposta: `${x.titulo}\n\nVem da Sala de Estratégia ("${s.tema}"). Decisão: ${s.sintese.decisao}`, problema: s.sintese.racional || '', impacto: x.impacto === 'alto' ? 5 : x.impacto === 'baixo' ? 2 : 3, esforco: x.esforco || 'M', risco: 'medio', area: 'plataforma' } });
        feitos.push({ indice: it.indice, destino: 'demanda', ref: r.id }); }
      else if (it.destino === 'ideia') { const id = 'est_' + crypto.randomBytes(4).toString('hex');
        await chamar('db', { action: 'save_ideia', value: { id, titulo: x.titulo, stage: 'Recebida', resumo: `${origem}. ${s.sintese.decisao}`, origem: 'Sala de Estratégia', criado_em: new Date().toISOString() } });
        feitos.push({ indice: it.indice, destino: 'ideia', ref: id }); }
      else if (it.destino === 'pauta') pauta.push({ indice: it.indice, titulo: 'Estratégia: ' + x.titulo, contexto: `${origem}. Dono sugerido: ${x.dono || '-'} · prazo ${x.prazo || '-'}` });
    } catch (e) { feitos.push({ indice: it.indice, destino: it.destino, erro: e.message }); }
  }
  if (pauta.length) {
    try { if (!rito_id) throw new Error('escolha a reunião semanal');
      const o = await chamar('reunioes', { action: 'reuniao_obter', rito_id });
      await chamar('reunioes', { action: 'reuniao_salvar', id: o.reuniao.id, assuntos: [...(o.reuniao.assuntos || []), ...pauta.map(p => ({ novo: true, titulo: p.titulo, contexto: p.contexto }))] });
      pauta.forEach(p => feitos.push({ indice: p.indice, destino: 'pauta', ref: o.reuniao.id, data: o.reuniao.data }));
    } catch (e) { pauta.forEach(p => feitos.push({ indice: p.indice, destino: 'pauta', erro: e.message })); }
  }
  const acoes = [...(s.acoes || []), ...feitos.map(f => ({ ...f, em: new Date().toISOString() }))];
  await sql`UPDATE est_sessoes SET acoes=${JSON.stringify(acoes)}, atualizado_em=NOW() WHERE id=${s.id}`;
  return { feitos };
}

async function handler(req, res) {
  // v3.240: cron mensal — a ATLAS sugere o ajuste fino do plano vigente (fica pendente, nada muda sem o fundador)
  if (req.method === 'GET' && req.query?.cron === 'ajuste_plano') {
    try { const L = (await kv(K_AJUSTES)) || []; const ult = L.find(x => x.automatico);
      if (ult && Date.now() - Date.parse(ult.em) < 25 * 864e5) return res.status(200).json({ success: true, pulado: 'sugestão automática recente' });
      if (!(await kv(K_VIGENTE))?.plano) return res.status(200).json({ success: true, pulado: 'sem plano vigente' });
      return res.status(200).json({ success: true, ...(await planoEstrSugerir({ automatico: true })) }); }
    catch (e) { return res.status(500).json({ success: false, error: e.message }); }
  }
  try {
    const b = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {}; const sql = await getSql();
    const usuario = req.sessao?.login || req.usuario || null;
    const acoes = {
      inicio: async () => { const [prem, plano, conv, sess] = await Promise.all([premissas(), planoVigente(), sql`SELECT id, titulo, atualizado_em FROM est_conversas ORDER BY atualizado_em DESC LIMIT 15`, sql`SELECT id, tema, status, agentes, atualizado_em FROM est_sessoes ORDER BY atualizado_em DESC LIMIT 15`]);
        return { agentes: AGENTES, comite_padrao: COMITE_PADRAO, premissas: prem, premissas_padrao: prem === PREMISSAS_PADRAO, plano, conversas: conv, sessoes: sess }; },
      contexto: async () => ({ contexto: await contexto(!!b.forcar) }),
      premissas_salvar: async () => { const t = String(b.texto || '').trim(); if (t.length < 30) throw new Error('Escreva as premissas (pelo menos algumas frases)'); await kv('est:premissas', { texto: t.substring(0, 6000), em: new Date().toISOString(), por: usuario }); return { ok: true }; },
      chat: () => chat(b),
      conversa: async () => ({ conversa: (await sql`SELECT * FROM est_conversas WHERE id=${b.id}`)[0] || null }),
      conversa_excluir: async () => { await sql`DELETE FROM est_conversas WHERE id=${b.id}`; return { ok: true }; },
      norte_plano: () => nortePlano(), norte_obter: async () => ({ plano: await kv('norte:plano'), tem_proposito: !!(await kv('proposito')) }),
      sala_abrir: () => salaAbrir(b), sala_rodada: () => salaRodada(b), sala_sintese: () => salaSintese(b), sala_aprovar: () => salaAprovar(b, usuario), sala_acoes: () => salaAcoes(b),
      sala_obter: async () => ({ sessao: (await sql`SELECT * FROM est_sessoes WHERE id=${b.id}`)[0] || null }),
      sala_excluir: async () => { await sql`DELETE FROM est_sessoes WHERE id=${b.id}`; return { ok: true }; },
      // v3.240: plano estratégico cadastrado
      plano_estr_obter: () => planoEstrObter(), plano_estr_simular: async () => ({ sim: planoSimular(b.plano || {}) }),
      plano_estr_salvar: () => planoEstrSalvar(b, usuario), plano_estr_aprovar: () => planoEstrAprovar(b, usuario),
      plano_estr_restaurar: () => planoEstrRestaurar(b), plano_estr_inicial: async () => ({ plano: planoInicial() }),
      plano_estr_sugerir: () => planoEstrSugerir(), plano_estr_ajuste_decidir: () => planoEstrAjusteDecidir(b, usuario),
      ritos: async () => { try { const r = await chamar('reunioes', { action: 'ritos' }); return { ritos: (r.ritos || []).filter(x => x.ativo).map(x => ({ id: x.id, nome: x.nome, proxima_br: x.proxima_br })) }; } catch (_) { return { ritos: [] }; } },
    };
    if (!acoes[b.action]) return res.status(400).json({ success: false, error: 'Ação desconhecida' });
    return res.status(200).json({ success: true, ...(await acoes[b.action]()) });
  } catch (e) { console.error('[estrategia]', e.message); return res.status(e.status || 500).json({ success: false, error: e.message }); }
}
export default comGuarda(handler, 'estrategia');
