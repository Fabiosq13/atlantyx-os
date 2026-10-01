import { comGuarda } from '../lib/qa-guard.js';
// api/vendas.js — v3.24
// ÁREA DE VENDAS (S7): Elaboração de Propostas com inteligência financeira + Painel de Vendas IA.
//
// PROPOSTAS
//   prop_config / prop_config_salvar     parâmetros financeiros (impostos, overhead, margens, contingência...) + instruções de elaboração
//   rate_card / rate_card_salvar / rate_card_sugerir / rate_card_importar (xlsx/csv)
//   aprender (arquivo base64 pdf/docx/xlsx/txt) / base_listar / base_resultado / base_excluir / padrao / padrao_regerar
//   estimar (IA estima perfis e horas a partir do escopo) / analisar (formatos x metas) / redigir (documento no padrão)
//   prop_salvar / prop_listar / prop_obter / prop_excluir / prop_status (ganha/perdida) / prop_converter (vira projeto + marcos)
// PAINEL DE VENDAS
//   painel (metas, quantas vendas faltam, funil, margens x benchmarks, cobranças) / coach (IA) /
//   estrategia_salvar / estrategia_listar / estrategia_sugerir / premissas / premissas_salvar
import { calcularFormatos, PARAMS_PADRAO, FORMATOS } from '../lib/proposta-calc.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
let _sql = null;
async function getSql() { if (_sql) return _sql; const { neon } = await import('@neondatabase/serverless'); _sql = neon(process.env.DATABASE_URL); return _sql; }
const num = (v, d = 0) => { if (v == null || v === '') return d; const x = parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isFinite(x) ? x : d; };
const r2 = v => Math.round((+v || 0) * 100) / 100;
const novoId = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function cfgGet(chave) { const sql = await getSql(); await sql`CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor JSONB, atualizado_em TIMESTAMPTZ DEFAULT NOW())`; const r = await sql`SELECT valor FROM app_config WHERE chave = ${chave} LIMIT 1`; const v = r[0]?.valor; return typeof v === 'string' ? JSON.parse(v) : (v ?? null); }
async function cfgSet(chave, valor) { const sql = await getSql(); await sql`CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor JSONB, atualizado_em TIMESTAMPTZ DEFAULT NOW())`; await sql`INSERT INTO app_config (chave, valor, atualizado_em) VALUES (${chave}, ${JSON.stringify(valor)}, NOW()) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`; }
async function kvGet(key) { try { const sql = await getSql(); const r = await sql`SELECT value FROM kv_store WHERE key = ${key} LIMIT 1`; const v = r[0]?.value; return typeof v === 'string' ? JSON.parse(v) : (v ?? null); } catch (_) { return null; } }

async function claude(system, content, maxTokens = 2000, ms = 55000) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
    return (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'A IA demorou demais — tente de novo' : e.message); }
  finally { clearTimeout(tm); }
}
function json(txt) {
  const t = String(txt || '').replace(/```json|```/g, '').trim();
  const i = t.search(/[{[]/); if (i < 0) throw new Error('A IA não devolveu JSON');
  const fecha = t[i] === '{' ? '}' : ']'; const j = t.lastIndexOf(fecha);
  return JSON.parse(t.substring(i, j + 1));
}

async function tabelas() {
  const sql = await getSql();
  await sql`CREATE TABLE IF NOT EXISTS propostas (id TEXT PRIMARY KEY, numero TEXT, cliente TEXT, contato TEXT, titulo TEXT, status TEXT DEFAULT 'rascunho',
    formato TEXT, valor_total NUMERIC(14,2), valor_mensal NUMERIC(14,2), meses NUMERIC, margem_pct NUMERIC, dados JSONB, analise JSONB, documento JSONB,
    motivo_resultado TEXT, projeto_id TEXT, enviada_em TIMESTAMPTZ, fechada_em TIMESTAMPTZ, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS propostas_base (id TEXT PRIMARY KEY, arquivo TEXT, cliente TEXT, data_ref TEXT, resultado TEXT DEFAULT 'desconhecido', formato TEXT,
    valor_total NUMERIC(14,2), extraido JSONB, criado_em TIMESTAMPTZ DEFAULT NOW())`;
  await sql`CREATE TABLE IF NOT EXISTS vendas_estrategias (id TEXT PRIMARY KEY, periodo_tipo TEXT, periodo_ref TEXT, titulo TEXT, texto TEXT, metas JSONB, autor TEXT,
    criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
}

// ═══════════════════════ PARÂMETROS E RATE CARD ═══════════════════════
async function propConfig() {
  const salvo = (await cfgGet('propostas_params')) || {};
  const trib = (await cfgGet('tributos')) || null;
  // impostos sobre o faturamento a partir da configuração de tributos do financeiro (se não houver valor próprio)
  let impostoTrib = null;
  if (trib) {
    if (trib.regime === 'simples' && trib.aliq_das != null) impostoTrib = num(trib.aliq_das);
    else if (trib.regime === 'presumido') impostoTrib = r2(3.65 + num(trib.aliq_iss, 5) + 0.32 * num(trib.aliq_irpj, 34)); // PIS/COFINS cumulativo + ISS + IRPJ/CSLL presumidos sobre 32%
    else if (trib.regime === 'real') impostoTrib = r2(9.25 + num(trib.aliq_iss, 5));
  }
  const params = { ...PARAMS_PADRAO, ...(impostoTrib != null ? { impostos_pct: impostoTrib } : {}), ...(salvo.params || {}) };
  return { params, instrucoes: salvo.instrucoes || '', imposto_origem: salvo.params?.impostos_pct != null ? 'manual' : (impostoTrib != null ? 'tributos do financeiro (' + trib.regime + ')' : 'padrão') };
}
async function rateCard() { return (await cfgGet('propostas_rate_card')) || []; }
async function rateCardSugerir() {
  // custo/hora real do RH por cargo + preços observados nas propostas aprendidas
  const sql = await getSql(); const atual = await rateCard(); const { params } = await propConfig();
  let rh = []; try { rh = await sql`SELECT cargo, AVG(custo_hora)::float custo, COUNT(*)::int n FROM funcionarios WHERE ativo = true AND custo_hora > 0 GROUP BY cargo`; } catch (_) {}
  let base = []; try { base = await sql`SELECT extraido FROM propostas_base`; } catch (_) {}
  const obs = {}; base.forEach(b => (b.extraido?.rate_card || []).forEach(x => { const k = String(x.perfil || '').trim(); const v = num(x.valor_hora); if (k && v > 0) (obs[k] = obs[k] || []).push(v); }));
  const mediana = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const mapa = {}; atual.forEach(x => mapa[x.perfil.toLowerCase()] = { ...x });
  const fator = (1 + params.overhead_pct / 100) / (1 - params.impostos_pct / 100 - params.margem_alvo_pct / 100);
  rh.forEach(r => { const k = String(r.cargo || 'Sem cargo'); const m = mapa[k.toLowerCase()] || { perfil: k };
    m.custo_hora = r2(r.custo); m.custo_fonte = `RH (${r.n} pessoa${r.n > 1 ? 's' : ''})`;
    if (!m.preco_alvo) m.preco_alvo = r2(r.custo * fator); if (!m.preco_piso) m.preco_piso = r2(r.custo * (1 + params.overhead_pct / 100) / (1 - params.impostos_pct / 100 - params.margem_min_pct / 100));
    if (!m.preco_teto) m.preco_teto = r2(m.preco_alvo * 1.25); mapa[k.toLowerCase()] = m; });
  Object.entries(obs).forEach(([k, vs]) => { const m = mapa[k.toLowerCase()] || { perfil: k }; m.preco_observado = r2(mediana(vs)); m.n_observacoes = vs.length;
    if (!m.preco_alvo) m.preco_alvo = m.preco_observado; if (!m.preco_teto) m.preco_teto = r2(Math.max(...vs)); if (!m.custo_hora) m.custo_hora = r2(m.preco_observado / fator); m.custo_fonte = m.custo_fonte || 'estimado do preço praticado'; mapa[k.toLowerCase()] = m; });
  return { sugestao: Object.values(mapa), fontes: { cargos_rh: rh.length, perfis_observados: Object.keys(obs).length } };
}

// ═══════════════════════ APRENDIZADO (propostas antigas) ═══════════════════════
function _unzipEntrada(buf, nome) {
  // leitor mínimo de ZIP (DOCX/XLSX) pelo diretório central
  const zlib = globalThis.__zlib;
  let eocd = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('arquivo não é um ZIP/DOCX válido');
  let p = buf.readUInt32LE(eocd + 16); const total = buf.readUInt16LE(eocd + 10);
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const n = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    if (n === nome) { const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28); const dados = buf.slice(off + 30 + lnl + lel, off + 30 + lnl + lel + comp); return metodo === 8 ? zlib.inflateRawSync(dados) : dados; }
    p += 46 + nl + el + cl;
  }
  return null;
}
async function textoDoArquivo(nome, base64) {
  const buf = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buf.length > 12 * 1024 * 1024) throw new Error('Arquivo acima de 12 MB');
  const ext = String(nome || '').toLowerCase().split('.').pop();
  globalThis.__zlib = globalThis.__zlib || (await import('zlib')).default;
  if (ext === 'pdf') return { pdf: buf.toString('base64') };
  if (ext === 'docx') { const x = _unzipEntrada(buf, 'word/document.xml'); if (!x) throw new Error('DOCX sem document.xml');
    return { texto: x.toString('utf8').replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n') }; }
  if (ext === 'xlsx') { const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); const linhas = [];
    wb.eachSheet(ws => { linhas.push('## Aba: ' + ws.name); ws.eachRow({ includeEmpty: false }, row => { const v = row.values.slice(1).map(c => c == null ? '' : (typeof c === 'object' ? (c.result ?? c.text ?? c.richText?.map(t => t.text).join('') ?? '') : c)); if (v.some(x => String(x).trim())) linhas.push(v.join(' | ')); }); });
    return { texto: linhas.join('\n').substring(0, 60000) }; }
  return { texto: buf.toString('utf8').substring(0, 60000) };
}
const SYS_EXTRAI = `Você analisa propostas comerciais da Atlantyx (consultoria B2B de dados, BI, engenharia de dados e IA; clientes como CPFL, Enel). Extraia o que serve para ensinar o sistema a elaborar propostas no mesmo padrão. Responda APENAS JSON válido.`;
async function aprender({ nome, base64, resultado = 'desconhecido', observacao = '' } = {}) {
  if (!nome || !base64) throw new Error('arquivo obrigatório');
  await tabelas();
  const arq = await textoDoArquivo(nome, base64);
  const pedido = `Arquivo: ${nome}${observacao ? '\nObservação do usuário: ' + observacao : ''}
Extraia em JSON: {"tipo_documento":"proposta|rate_card|modelo|instrucoes|outro","cliente":"","data":"AAAA-MM ou vazio","titulo":"","formato_comercial":"tm|fechado|mensal|hibrido|outro","valor_total":0,"valor_mensal":0,"prazo_meses":0,
"secoes":["títulos das seções na ordem em que aparecem"],"tom":"como escreve (1 frase)","estrutura_preco":"como o preço é apresentado (tabela por perfil, marcos, mensalidade...)",
"rate_card":[{"perfil":"","senioridade":"","valor_hora":0,"valor_mensal":0}],"condicoes":["pagamento, reajuste, validade, faturamento..."],"premissas":["..."],"exclusoes":["..."],
"sla":"se houver, resumo","diferenciais":["argumentos de venda usados"],"riscos_mitigados":["..."],"licoes":"o que este documento ensina sobre como a Atlantyx propõe (2-3 frases)"}`;
  const content = arq.pdf ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arq.pdf } }, { type: 'text', text: pedido }] : [{ type: 'text', text: pedido + '\n\nCONTEÚDO:\n' + arq.texto }];
  const ex = json(await claude(SYS_EXTRAI, content, 2500, 80000));
  const sql = await getSql(); const id = novoId('pb');
  await sql`INSERT INTO propostas_base (id, arquivo, cliente, data_ref, resultado, formato, valor_total, extraido) VALUES (${id}, ${nome}, ${ex.cliente || null}, ${ex.data || null}, ${resultado}, ${ex.formato_comercial || null}, ${num(ex.valor_total) || null}, ${JSON.stringify(ex)})`;
  // rate card encontrado no documento → já entra como sugestão no rate card (sem sobrescrever o que existe)
  if ((ex.rate_card || []).length) { const rc = await rateCard(); const ja = new Set(rc.map(x => x.perfil.toLowerCase()));
    ex.rate_card.filter(x => x.perfil && num(x.valor_hora) > 0 && !ja.has(String(x.perfil).toLowerCase())).forEach(x => rc.push({ perfil: x.perfil + (x.senioridade ? ' ' + x.senioridade : ''), preco_alvo: num(x.valor_hora), preco_teto: num(x.valor_hora), custo_hora: null, fonte: 'aprendido: ' + nome }));
    await cfgSet('propostas_rate_card', rc); }
  return { id, extraido: ex };
}
async function padrao({ regerar = false } = {}) {
  await tabelas(); const sql = await getSql();
  const base = await sql`SELECT arquivo, resultado, formato, valor_total, extraido FROM propostas_base ORDER BY criado_em DESC LIMIT 40`;
  const props = await sql`SELECT formato, status FROM propostas WHERE status IN ('ganha','perdida')`;
  // estatística de conversão por formato (propostas do sistema + base aprendida com resultado conhecido)
  const est = {}; [...props.map(p => ({ f: p.formato, r: p.status })), ...base.filter(b => ['ganha', 'perdida'].includes(b.resultado)).map(b => ({ f: b.formato, r: b.resultado }))]
    .forEach(x => { if (!x.f) return; est[x.f] = est[x.f] || { ganhas: 0, perdidas: 0 }; est[x.f][x.r === 'ganha' ? 'ganhas' : 'perdidas']++; });
  const win = {}; Object.entries(est).forEach(([f, v]) => { if (v.ganhas + v.perdidas >= 2) win[f] = r2(v.ganhas / (v.ganhas + v.perdidas)); });
  let salvo = await cfgGet('propostas_padrao');
  if ((regerar || !salvo) && base.length) {
    const resumo = base.map(b => ({ arquivo: b.arquivo, resultado: b.resultado, ...['tipo_documento', 'formato_comercial', 'secoes', 'tom', 'estrutura_preco', 'condicoes', 'premissas', 'exclusoes', 'sla', 'diferenciais', 'licoes'].reduce((o, k) => (o[k] = b.extraido?.[k], o), {}) }));
    const { instrucoes } = await propConfig();
    salvo = json(await claude('Você consolida o padrão de propostas comerciais da Atlantyx a partir de exemplos reais. Dê mais peso às propostas GANHAS. Responda APENAS JSON.',
      `${instrucoes ? 'INSTRUÇÕES DO DONO (prioridade máxima):\n' + instrucoes.substring(0, 6000) + '\n\n' : ''}EXEMPLOS:\n${JSON.stringify(resumo).substring(0, 40000)}\n\nDevolva {"secoes":[{"titulo":"","objetivo":"o que a seção precisa conter"}],"tom":"","estrutura_preco":"","condicoes_padrao":["..."],"premissas_padrao":["..."],"exclusoes_padrao":["..."],"diferenciais":["..."],"o_que_ganha":"padrões das propostas ganhas","o_que_perde":"padrões das perdidas (se houver)","checklist":["itens que toda proposta deve ter"]}`, 3000, 80000));
    salvo.atualizado_em = new Date().toISOString(); salvo.n_exemplos = base.length;
    await cfgSet('propostas_padrao', salvo);
  }
  return { padrao: salvo, win_rate: win, estatistica: est, exemplos: base.length };
}

// ═══════════════════════ METAS (fonte para propostas e painel) ═══════════════════════
async function _api(base, rota, body, ms = 50000) {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), ms);
  try { const r = await fetch(base + rota, body ? { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { signal: ctrl.signal }); return await r.json().catch(() => ({})); }
  catch (e) { return { erro: e.message }; } finally { clearTimeout(tm); }
}
async function premissas() {
  return { taxa_lead_reuniao: 20, taxa_reuniao_proposta: 50, win_rate_padrao: 25, ciclo_dias_padrao: 60, cobertura_pipeline_alvo: 3, peso_pipeline: 30,
    benchmarks: {
      entrega: { min: 45, max: 60, ref: 'Projetos de serviços profissionais (margem bruta): 45–60%' },
      sustentacao: { min: 50, max: 60, ref: 'Serviços gerenciados/recorrentes maduros (margem bruta): 50–60%' },
      alocacao: { min: 25, max: 35, ref: 'Alocação de profissionais (T&M): faixa típica 25–35% (estimativa de mercado)' },
      geral: { min: 42, max: 62, mediana: 52, ref: 'Serviços profissionais — margem bruta mediana 52% (P25 42%, P75 62%)' },
      ebitda: { min: 4, max: 18, mediana: 9.8, ref: 'EBITDA de serviços profissionais: mediana 9,8% (P25 4%, P75 18%)' },
    },
    ...((await cfgGet('vendas_premissas')) || {}) };
}
async function contextoMetas(base) {
  const metas = (await kvGet('atx:metas')) || {};
  const anual = num(metas.anual, 18000000), mensal = num(metas.mensal, anual / 12);
  const fin = await _api(base, '/api/financeiro', { action: 'kpis_saude', params: {} });
  const k = fin.kpis || {};
  const pipe = await _api(base, '/api/analytics?tipo=pipeline');
  const P = await premissas();
  const pipelineTotal = num(pipe?.pipeline?.total_valor);
  return { meta_anual: anual, meta_mensal: mensal, realizado_ano: num(k.receita_ano), realizado_mes: num(k.receita_mes),
    pipeline_total: pipelineTotal, pipeline_ponderado: r2(pipelineTotal * P.peso_pipeline / 100), deals_abertos: num(pipe?.pipeline?.total_deals),
    etapas: pipe?.pipeline?.etapas || null, fonte: { receita: fin.kpis ? 'QuickBooks (DRE)' : 'indisponível: ' + (fin.error || fin.erro || ''), pipeline: pipe?.pipeline ? 'HubSpot' : 'indisponível' } };
}

// ═══════════════════════ MARGENS (projetos, sustentação, geral) ═══════════════════════
async function margens() {
  const sql = await getSql(); const { params } = await propConfig(); const P = await premissas();
  const q = async (f) => { try { return await f(); } catch (_) { return []; } };
  const projetos = await q(() => sql`SELECT id, nome, cliente, valor_total, status FROM projetos_financeiros WHERE COALESCE(status,'ativo') NOT IN ('cancelado')`);
  const marcos = await q(() => sql`SELECT projeto_id, valor, data_entrega FROM projetos_marcos`);
  const aloc = await q(() => sql`SELECT fp.projeto_id, fp.alocacao_pct, f.custo_hora, f.horas_mensais_padrao, f.nome FROM funcionarios_projetos fp JOIN funcionarios f ON f.id = fp.funcionario_id WHERE f.ativo = true`);
  const cfg = await q(() => sql`SELECT projeto_nome, tipo_projeto FROM pmo_projetos_config`);
  const tipoDe = p => { const c = cfg.find(x => String(x.projeto_nome).toLowerCase() === String(p.nome).toLowerCase()); if (c?.tipo_projeto === 'sustentacao') return 'sustentacao';
    if (/sustent|suporte|ams|sla/i.test(p.nome)) return 'sustentacao'; if (/aloca|body ?shop|outsourc/i.test(p.nome)) return 'alocacao'; return c?.tipo_projeto === 'alocacao' ? 'alocacao' : 'entrega'; };
  const imp = params.impostos_pct / 100, ovh = params.overhead_pct / 100;
  const linhas = projetos.map(p => {
    const ms = marcos.filter(m => m.projeto_id === p.id).map(m => ({ v: num(m.valor), d: String(m.data_entrega).substring(0, 10) })).sort((a, b) => a.d < b.d ? -1 : 1);
    const receitaTotal = num(p.valor_total) || ms.reduce((a, m) => a + m.v, 0);
    let dur = 1; if (ms.length >= 2) { const a = new Date(ms[0].d), b = new Date(ms[ms.length - 1].d); dur = Math.max(1, Math.round((b - a) / (30.4 * 864e5)) + 1); }
    const receitaMes = receitaTotal / dur;
    const pessoas = aloc.filter(a => a.projeto_id === p.id);
    const custoMes = pessoas.reduce((a, x) => a + num(x.custo_hora) * num(x.horas_mensais_padrao, 160) * num(x.alocacao_pct, 100) / 100, 0);
    const liq = receitaMes * (1 - imp);
    const bruta = liq > 0 && custoMes > 0 ? (liq - custoMes) / liq * 100 : null;
    const contrib = liq > 0 && custoMes > 0 ? (liq - custoMes * (1 + ovh)) / receitaMes * 100 : null;
    const tipo = tipoDe(p); const bm = P.benchmarks[tipo] || P.benchmarks.geral;
    return { projeto: p.nome, cliente: p.cliente, tipo, receita_total: r2(receitaTotal), duracao_meses: dur, receita_mensal: r2(receitaMes), custo_mensal: r2(custoMes), pessoas: pessoas.length,
      margem_bruta_pct: bruta != null ? r2(bruta) : null, margem_contribuicao_pct: contrib != null ? r2(contrib) : null,
      benchmark: bm, situacao: bruta == null ? (custoMes ? 'sem receita' : 'sem equipe alocada no RH') : bruta < bm.min ? 'abaixo do mercado' : bruta > bm.max ? 'acima do mercado' : 'dentro do mercado' };
  });
  const agrega = lista => { const rec = lista.reduce((a, l) => a + l.receita_mensal, 0), cus = lista.reduce((a, l) => a + l.custo_mensal, 0); const liq = rec * (1 - imp);
    return { projetos: lista.length, receita_mensal: r2(rec), custo_mensal: r2(cus), margem_bruta_pct: liq > 0 && cus > 0 ? r2((liq - cus) / liq * 100) : null, margem_contribuicao_pct: liq > 0 && cus > 0 ? r2((liq - cus * (1 + ovh)) / rec * 100) : null }; };
  const comDados = linhas.filter(l => l.margem_bruta_pct != null);
  const porTipo = {}; ['entrega', 'sustentacao', 'alocacao'].forEach(t => { const l = comDados.filter(x => x.tipo === t); if (l.length) porTipo[t] = { ...agrega(l), benchmark: P.benchmarks[t] }; });
  return { linhas: linhas.sort((a, b) => (a.margem_bruta_pct ?? 999) - (b.margem_bruta_pct ?? 999)), por_tipo: porTipo, geral: { ...agrega(comDados), benchmark: P.benchmarks.geral },
    sem_dados: linhas.filter(l => l.margem_bruta_pct == null).map(l => l.projeto), recorrente_mensal: r2(linhas.filter(l => l.tipo === 'sustentacao').reduce((a, l) => a + l.receita_mensal, 0)),
    nota: 'Margem bruta = (receita líquida de impostos − custo da equipe alocada) ÷ receita líquida, comparável aos benchmarks de mercado. Margem de contribuição desconta também o overhead.' };
}

// ═══════════════════════ PAINEL DE VENDAS ═══════════════════════
function _diasUteisRestantes(ate) { let d = new Date(); d.setHours(12); let n = 0; while (d <= ate) { const w = d.getDay(); if (w && w < 6) n++; d.setDate(d.getDate() + 1); } return n; }
async function painel(base) {
  await tabelas(); const sql = await getSql();
  const [M, mg, P] = await Promise.all([contextoMetas(base), margens(), premissas()]);
  const props = await sql`SELECT id, cliente, titulo, status, formato, valor_total, valor_mensal, meses, criado_em, enviada_em, fechada_em, atualizado_em FROM propostas ORDER BY atualizado_em DESC LIMIT 300`;
  const ganhas = props.filter(p => p.status === 'ganha'), perdidas = props.filter(p => p.status === 'perdida'), abertas = props.filter(p => ['enviada', 'negociacao'].includes(p.status));
  // ticket médio: propostas ganhas → contratos reais (projetos) → padrão
  let ticket = ganhas.length >= 2 ? ganhas.reduce((a, p) => a + num(p.valor_total), 0) / ganhas.length : null, ticketFonte = ticket ? `${ganhas.length} propostas ganhas` : null;
  if (!ticket) { const pr = mg.linhas.filter(l => l.receita_total > 0); if (pr.length) { ticket = pr.reduce((a, l) => a + l.receita_total, 0) / pr.length; ticketFonte = `média de ${pr.length} projetos/contratos cadastrados`; } }
  if (!ticket) { ticket = 250000; ticketFonte = 'padrão (cadastre propostas/projetos para calibrar)'; }
  const duracao = mg.linhas.length ? mg.linhas.reduce((a, l) => a + l.duracao_meses, 0) / mg.linhas.length : 6;
  const win = (ganhas.length + perdidas.length) >= 4 ? ganhas.length / (ganhas.length + perdidas.length) * 100 : P.win_rate_padrao;
  const ciclos = ganhas.filter(p => p.fechada_em && p.criado_em).map(p => (new Date(p.fechada_em) - new Date(p.criado_em)) / 864e5);
  const ciclo = ciclos.length >= 2 ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : P.ciclo_dias_padrao;
  const hoje = new Date(); const fimAno = new Date(hoje.getFullYear(), 11, 31), fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const mesesRestAno = 12 - hoje.getMonth() - (hoje.getDate() / fimMes.getDate());
  const gapAno = Math.max(0, M.meta_anual - M.realizado_ano), gapMes = Math.max(0, M.meta_mensal - M.realizado_mes);
  // receita que UMA venda fechada hoje gera até o fim do ano: começa após o ciclo, é reconhecida ao longo da duração
  const mesesUteisAno = Math.max(0, mesesRestAno - ciclo / 30.4);
  const fracAno = Math.min(1, mesesUteisAno / Math.max(1, duracao));
  const receitaPorVendaAno = ticket * fracAno, receitaMensalPorVenda = ticket / Math.max(1, duracao);
  const vendasAno = receitaPorVendaAno > 0 ? Math.ceil(gapAno / receitaPorVendaAno) : null;
  const vendasAnoValor = Math.ceil(gapAno / ticket);
  const vendasMes = gapMes > 0 ? Math.ceil(gapMes / receitaMensalPorVenda) : 0; // vendas que já precisariam estar faturando para fechar o mês
  const funil = v => { const propostas = Math.ceil(v / (win / 100)); const reunioes = Math.ceil(propostas / (P.taxa_reuniao_proposta / 100)); const leads = Math.ceil(reunioes / (P.taxa_lead_reuniao / 100)); return { vendas: v, propostas, reunioes, leads }; };
  const semanasRest = Math.max(1, (fimAno - hoje) / (7 * 864e5));
  // Vendas a ASSINAR = gap ÷ ticket (valor contratado). A receita reconhecida no ano é menor (ciclo + duração) —
  // mostrada à parte como alerta, porque com poucos meses restantes nenhuma venda nova fecha o faturamento do ano sozinha.
  const porSemana = vendasAnoValor > 0 ? funil(vendasAnoValor) : null;
  const ritmo = porSemana ? { propostas_semana: r2(porSemana.propostas / semanasRest), reunioes_semana: r2(porSemana.reunioes / semanasRest), leads_semana: r2(porSemana.leads / semanasRest) } : null;
  const coberturaPipe = gapAno > 0 ? r2(M.pipeline_total / gapAno) : null;
  // natureza da venda → período da estratégia
  const periodoSugerido = ciclo > 120 ? 'semestral' : ciclo > 45 ? 'trimestral' : 'mensal';
  // cobranças (o CRM "pulguento")
  const cobr = [];
  const paradas = abertas.filter(p => (Date.now() - new Date(p.atualizado_em)) / 864e5 > 7);
  if (gapMes > 0) cobr.push({ nivel: 'alta', texto: `Faltam ${fmt(gapMes)} para a meta de ${hoje.toLocaleDateString('pt-BR', { month: 'long' })} — ${_diasUteisRestantes(fimMes)} dias úteis.` });
  if (porSemana) cobr.push({ nivel: vendasAnoValor > 4 ? 'alta' : 'media', texto: `Para cobrir o que falta da meta anual em valor contratado: ${vendasAnoValor} venda(s) de ${fmt(ticket)} → ~${porSemana.propostas} propostas e ~${porSemana.reunioes} reuniões até 31/12.` });
  if (gapAno > 0 && fracAno < .5) cobr.push({ nivel: 'alta', texto: `Atenção: com ciclo de ${Math.round(ciclo)} dias, só ${Math.round(fracAno * 100)}% de uma venda nova vira receita até 31/12 (${fmt(receitaPorVendaAno)} por venda). Para o faturamento do ano, priorize aditivos e expansões em clientes atuais e antecipação de marcos.` });
  if (ritmo) cobr.push({ nivel: 'media', texto: `Ritmo semanal necessário: ${ritmo.reunioes_semana} reuniões e ${ritmo.propostas_semana} propostas por semana.` });
  if (coberturaPipe != null && coberturaPipe < P.cobertura_pipeline_alvo) cobr.push({ nivel: 'alta', texto: `Pipeline cobre ${coberturaPipe}x o que falta (alvo ${P.cobertura_pipeline_alvo}x) — precisa de ${fmt(gapAno * P.cobertura_pipeline_alvo - M.pipeline_total)} a mais em oportunidades.` });
  paradas.slice(0, 5).forEach(p => cobr.push({ nivel: 'alta', texto: `Proposta parada há ${Math.round((Date.now() - new Date(p.atualizado_em)) / 864e5)} dias: ${p.cliente || ''} — ${p.titulo || ''} (${fmt(num(p.valor_total))}). Ligue hoje.` }));
  mg.linhas.filter(l => l.situacao === 'abaixo do mercado').slice(0, 3).forEach(l => cobr.push({ nivel: 'media', texto: `Margem de ${l.projeto} em ${l.margem_bruta_pct}% — abaixo do mercado (${l.benchmark.min}–${l.benchmark.max}%). Revisar preço/equipe na renovação.` }));
  const recPct = M.meta_mensal ? r2(mg.recorrente_mensal / M.meta_mensal * 100) : null;
  const est = await sql`SELECT * FROM vendas_estrategias ORDER BY atualizado_em DESC LIMIT 1`;
  return { metas: { ...M, gap_ano: r2(gapAno), gap_mes: r2(gapMes), pct_ano: M.meta_anual ? r2(M.realizado_ano / M.meta_anual * 100) : null, pct_mes: M.meta_mensal ? r2(M.realizado_mes / M.meta_mensal * 100) : null,
      dias_uteis_mes: _diasUteisRestantes(fimMes), meses_restantes_ano: r2(mesesRestAno) },
    calculo: { ticket_medio: r2(ticket), ticket_fonte: ticketFonte, duracao_media_meses: r2(duracao), win_rate_pct: r2(win), win_fonte: (ganhas.length + perdidas.length) >= 4 ? `${ganhas.length} ganhas / ${perdidas.length} perdidas` : 'padrão — registre ganhas/perdidas para calibrar',
      ciclo_dias: Math.round(ciclo), receita_no_ano_por_venda: r2(receitaPorVendaAno), vendas_ano: vendasAnoValor, vendas_ano_por_receita_no_ano: vendasAno, fracao_reconhecida_no_ano_pct: r2(fracAno * 100), vendas_mes: vendasMes, funil_ano: porSemana, ritmo_semanal: ritmo,
      cobertura_pipeline: coberturaPipe, premissas: { taxa_lead_reuniao: P.taxa_lead_reuniao, taxa_reuniao_proposta: P.taxa_reuniao_proposta, peso_pipeline: P.peso_pipeline } },
    propostas: { abertas: abertas.length, valor_aberto: r2(abertas.reduce((a, p) => a + num(p.valor_total), 0)), ganhas: ganhas.length, perdidas: perdidas.length, paradas: paradas.length, rascunhos: props.filter(p => p.status === 'rascunho').length },
    margens: mg, recorrencia: { mensal: mg.recorrente_mensal, pct_meta_mensal: recPct, meta_pct: (await propConfig()).params.meta_recorrente_pct },
    cobrancas: cobr, periodo_sugerido: periodoSugerido, ultima_estrategia: est[0] || null };
}
const fmt = v => 'R$ ' + Math.round(+v || 0).toLocaleString('pt-BR');

async function coach(base, { pergunta } = {}) {
  const p = await painel(base);
  const sys = `Você é o DIRETOR COMERCIAL IA da Atlantyx — cobrador, direto e insistente (um "CRM pulguento"), em português do Brasil. Use SÓ os números do contexto. Formato: 1) Situação em 2 linhas com números; 2) "Hoje" — 3 ações concretas com quem/quanto; 3) "Esta semana" — metas de reuniões/propostas; 4) Um alerta de margem ou formato se houver. Sem rodeios, sem elogios.`;
  return { resposta: await claude(sys, `CONTEXTO:\n${JSON.stringify({ metas: p.metas, calculo: p.calculo, propostas: p.propostas, margens: { geral: p.margens.geral, por_tipo: p.margens.por_tipo }, recorrencia: p.recorrencia, cobrancas: p.cobrancas }).substring(0, 12000)}\n\n${pergunta ? 'PERGUNTA: ' + pergunta : 'Dê o direcionamento de hoje.'}`, 1200) };
}
async function estrategiaSugerir(base, { periodo_tipo, periodo_ref } = {}) {
  const p = await painel(base);
  const sys = 'Você escreve o PLANO COMERCIAL do período para a Atlantyx (B2B, venda consultiva de dados/IA, ciclo longo). Português do Brasil, prático, em markdown curto: Meta do período e gap · Matemática do funil (vendas, propostas, reuniões, leads) · Contas-alvo e ofertas prioritárias (use formatos com recorrência quando ajudar a meta) · Cadência semanal · Riscos e plano B · Indicadores de acompanhamento.';
  return { texto: await claude(sys, `Período: ${periodo_tipo || p.periodo_sugerido} ${periodo_ref || ''}\nDADOS:\n${JSON.stringify({ metas: p.metas, calculo: p.calculo, propostas: p.propostas, margens: { geral: p.margens.geral, por_tipo: p.margens.por_tipo }, recorrencia: p.recorrencia }).substring(0, 12000)}`, 2200) };
}

// ═══════════════════════ PROPOSTA: ESTIMAR, ANALISAR, REDIGIR ═══════════════════════
async function estimar({ escopo, tipo_demanda, meses } = {}) {
  if (!escopo || String(escopo).length < 30) throw new Error('Descreva o escopo (mín. 30 caracteres)');
  const rc = await rateCard();
  const perfis = rc.map(x => x.perfil);
  const sys = 'Você é arquiteto de soluções e estimador sênior da Atlantyx (dados, BI, engenharia de dados, IA). Estime esforço realista por perfil. Responda APENAS JSON.';
  const r = json(await claude(sys, `ESCOPO:\n${String(escopo).substring(0, 6000)}\nTipo de demanda: ${tipo_demanda || 'indefinido'}${meses ? '\nPrazo desejado: ' + meses + ' meses' : ''}\nPERFIS DISPONÍVEIS NO RATE CARD (use estes nomes exatamente quando couber): ${JSON.stringify(perfis)}\nDevolva {"meses":0,"risco":"baixo|medio|alto","perfis":[{"perfil":"","horas":0,"justificativa":""}],"premissas":["..."],"riscos":["..."],"entregaveis":["..."],"fases":[{"nome":"","mes_inicio":1,"mes_fim":1,"entregas":""}]}`, 2200));
  r.perfis = (r.perfis || []).map(x => { const c = rc.find(y => y.perfil.toLowerCase() === String(x.perfil).toLowerCase()); return { ...x, custo_hora: c?.custo_hora ?? null, preco_hora: c?.preco_alvo ?? null, preco_teto: c?.preco_teto ?? null, preco_piso: c?.preco_piso ?? null, no_rate_card: !!c }; });
  return r;
}
async function analisar(base, entrada = {}) {
  const { params } = await propConfig(); const M = await contextoMetas(base); const mg = await margens(); const pd = await padrao({});
  const rc = await rateCard();
  const perfis = (entrada.perfis || []).map(x => { const c = rc.find(y => y.perfil.toLowerCase() === String(x.perfil || '').toLowerCase()) || {};
    return { ...x, custo_hora: num(x.custo_hora) || num(c.custo_hora), preco_hora: num(x.preco_hora) || num(c.preco_alvo) || null, preco_teto: num(x.preco_teto) || num(c.preco_teto) || null, preco_piso: num(x.preco_piso) || num(c.preco_piso) || null }; });
  const r = calcularFormatos({ ...entrada, perfis, params: { ...params, ...(entrada.params || {}) },
    metas: { anual: M.meta_anual, realizado_ano: M.realizado_ano, pipeline_ponderado: M.pipeline_ponderado, recorrente_atual_mensal: mg.recorrente_mensal, receita_mensal_ref: M.meta_mensal },
    historico: { win_rate: pd.win_rate } });
  r.fontes = { metas: M.fonte, win_rate: Object.keys(pd.win_rate).length ? 'histórico de propostas' : 'sem histórico (aderência por tipo de demanda)' };
  if (entrada.explicar !== false && process.env.ANTHROPIC_API_KEY) {
    try { r.explicacao = await claude('Você é o CFO comercial da Atlantyx. Explique em português, em no máximo 7 linhas, qual formato recomendar e por quê, usando os números (metas, margem, caixa, aderência ao cliente), e dê 2 dicas de negociação. Sem repetir a tabela.',
      JSON.stringify({ cliente: entrada.cliente, tipo_demanda: r.entrada.tipo_demanda, metas: r.metas, custos: r.custos, formatos: r.formatos.map(f => ({ formato: f.nome, valor: f.valor_total, mensal: f.valor_mensal_medio, margem: f.margem_pct, no_ano: f.receita_no_ano, arr: f.arr, scores: f.scores, alertas: f.alertas })) }), 700, 30000); } catch (_) {}
  }
  return r;
}
async function redigir({ proposta, formato } = {}) {
  const pr = proposta || {}; const f = (pr.analise?.formatos || []).find(x => x.formato === (formato || pr.formato)) || pr.analise?.formatos?.[0];
  if (!f) throw new Error('Analise os formatos antes de redigir');
  const pd = await padrao({}); const { instrucoes } = await propConfig();
  const secoesPadrao = pd.padrao?.secoes?.length ? pd.padrao.secoes : [{ titulo: 'Contexto e objetivo' }, { titulo: 'Escopo e entregáveis' }, { titulo: 'Abordagem e metodologia' }, { titulo: 'Equipe e responsabilidades' }, { titulo: 'Cronograma' }, { titulo: 'Investimento e condições comerciais' }, { titulo: 'Premissas e exclusões' }, { titulo: 'Por que a Atlantyx' }];
  const sys = `Você redige propostas comerciais da Atlantyx (consultoria de dados, BI, engenharia de dados e IA — 17 anos, clientes como CPFL Energia, Enel, Caixa Capitalização). Português do Brasil, tom executivo e objetivo. Siga EXATAMENTE as seções do padrão. Nunca invente números: use só os fornecidos. Faturamento conforme o cronograma, com vencimento em 35 dias corridos da emissão da nota fiscal (salvo instrução diferente). Responda APENAS JSON.`;
  const usr = `${instrucoes ? 'INSTRUÇÕES DO DONO (prioridade máxima):\n' + instrucoes.substring(0, 5000) + '\n\n' : ''}PADRÃO APRENDIDO: ${JSON.stringify(pd.padrao || {}).substring(0, 6000)}
SEÇÕES (nesta ordem): ${JSON.stringify(secoesPadrao.map(s => s.titulo))}
CLIENTE: ${pr.cliente || ''} | CONTATO: ${pr.contato || ''} | TÍTULO: ${pr.titulo || ''}
ESCOPO: ${String(pr.dados?.escopo || '').substring(0, 5000)}
ESTIMATIVA: ${JSON.stringify({ perfis: pr.dados?.perfis, premissas: pr.dados?.estimativa?.premissas, entregaveis: pr.dados?.estimativa?.entregaveis, fases: pr.dados?.estimativa?.fases }).substring(0, 4000)}
FORMATO COMERCIAL ESCOLHIDO: ${f.nome} — valor total R$ ${f.valor_total}, média mensal R$ ${f.valor_mensal_medio}, prazo ${pr.analise?.entrada?.meses} meses.
CRONOGRAMA DE FATURAMENTO: ${JSON.stringify(f.cronograma.map(c => ({ mes: c.mes, valor: c.valor, desc: c.desc })))}
Devolva {"titulo":"","secoes":[{"titulo":"","conteudo":"texto em markdown simples (listas com -)"}],"tabela_investimento":[{"item":"","valor":""}],"validade_dias":30}`;
  const doc = json(await claude(sys, usr, 4000, 85000));
  doc.formato = f.formato; doc.gerado_em = new Date().toISOString();
  return { documento: doc };
}

// ═══════════════════════ CRUD PROPOSTAS ═══════════════════════
async function propSalvar(p = {}) {
  await tabelas(); const sql = await getSql();
  if (!p.cliente) throw new Error('cliente obrigatório');
  const id = p.id || novoId('prop');
  const f = (p.analise?.formatos || []).find(x => x.formato === p.formato) || null;
  let numero = p.numero; if (!numero) { const n = await sql`SELECT COUNT(*)::int n FROM propostas WHERE criado_em >= date_trunc('year', NOW())`; numero = `ATX-${new Date().getFullYear()}-${String((n[0]?.n || 0) + 1).padStart(3, '0')}`; }
  await sql`INSERT INTO propostas (id, numero, cliente, contato, titulo, status, formato, valor_total, valor_mensal, meses, margem_pct, dados, analise, documento, atualizado_em)
    VALUES (${id}, ${numero}, ${p.cliente}, ${p.contato || null}, ${p.titulo || null}, ${p.status || 'rascunho'}, ${p.formato || null}, ${f ? f.valor_total : num(p.valor_total) || null}, ${f ? f.valor_mensal_medio : null},
      ${p.analise?.entrada?.meses || num(p.dados?.meses) || null}, ${f ? f.margem_pct : null}, ${JSON.stringify(p.dados || {})}, ${p.analise ? JSON.stringify(p.analise) : null}, ${p.documento ? JSON.stringify(p.documento) : null}, NOW())
    ON CONFLICT (id) DO UPDATE SET cliente = EXCLUDED.cliente, contato = EXCLUDED.contato, titulo = EXCLUDED.titulo, formato = EXCLUDED.formato, valor_total = EXCLUDED.valor_total,
      valor_mensal = EXCLUDED.valor_mensal, meses = EXCLUDED.meses, margem_pct = EXCLUDED.margem_pct, dados = EXCLUDED.dados, analise = COALESCE(EXCLUDED.analise, propostas.analise),
      documento = COALESCE(EXCLUDED.documento, propostas.documento), atualizado_em = NOW()`;
  return { id, numero };
}
async function propStatus({ id, status, motivo } = {}) {
  if (!id || !['rascunho', 'enviada', 'negociacao', 'ganha', 'perdida'].includes(status)) throw new Error('id e status válidos obrigatórios');
  if (['ganha', 'perdida'].includes(status) && !String(motivo || '').trim()) throw new Error('Informe o motivo — é o que ensina o sistema a propor melhor');
  const sql = await getSql();
  await sql`UPDATE propostas SET status = ${status}, motivo_resultado = COALESCE(${motivo || null}, motivo_resultado),
    enviada_em = CASE WHEN ${status} = 'enviada' AND enviada_em IS NULL THEN NOW() ELSE enviada_em END,
    fechada_em = CASE WHEN ${status} IN ('ganha','perdida') THEN NOW() ELSE fechada_em END, atualizado_em = NOW() WHERE id = ${id}`;
  return { id, status };
}
async function propConverter(base, { id } = {}) {
  const sql = await getSql(); const r = await sql`SELECT * FROM propostas WHERE id = ${id}`; const p = r[0];
  if (!p) throw new Error('proposta não encontrada'); if (p.status !== 'ganha') throw new Error('Só propostas ganhas viram projeto'); if (p.projeto_id) throw new Error('Já convertida no projeto ' + p.projeto_id);
  const an = typeof p.analise === 'string' ? JSON.parse(p.analise) : p.analise; const f = (an?.formatos || []).find(x => x.formato === p.formato);
  const pj = await _api(base, '/api/financeiro', { action: 'projeto_save', params: { nome: p.titulo || ('Proposta ' + p.numero), cliente: p.cliente, cliente_responsavel_nome: p.contato || null, descricao: `Criado da proposta ${p.numero} (${FORMATOS[p.formato]?.nome || p.formato})`, valor_total: num(p.valor_total) } });
  const pid = pj.id || pj.projeto?.id; if (!pid) throw new Error('Não criou o projeto: ' + (pj.error || JSON.stringify(pj).substring(0, 160)));
  let n = 0; for (const c of (f?.cronograma || [])) { const d = await _api(base, '/api/financeiro', { action: 'marco_save', params: { projeto_id: pid, descricao: c.desc, data_entrega: c.mes + '-28', valor: c.valor, percentual: num(p.valor_total) ? r2(c.valor / num(p.valor_total) * 100) : null } }); if (d.id || d.success !== false) n++; }
  await sql`UPDATE propostas SET projeto_id = ${pid}, atualizado_em = NOW() WHERE id = ${id}`;
  return { projeto_id: pid, marcos_criados: n };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  let body = {}; try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch { return res.status(400).json({ success: false, error: 'JSON inválido' }); }
  const { action, payload = {} } = body;
  const base = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'atlantyx-os.vercel.app'}`;
  const sqlRun = async f => { await tabelas(); return f(await getSql()); };
  const acoes = {
    prop_config: () => propConfig(),
    prop_config_salvar: async () => { const atual = (await cfgGet('propostas_params')) || {}; await cfgSet('propostas_params', { ...atual, ...(payload.params ? { params: payload.params } : {}), ...(payload.instrucoes != null ? { instrucoes: String(payload.instrucoes).substring(0, 20000) } : {}) }); return propConfig(); },
    rate_card: async () => ({ rate_card: await rateCard() }),
    rate_card_salvar: async () => { const lista = (payload.rate_card || []).filter(x => String(x.perfil || '').trim()).map(x => ({ perfil: String(x.perfil).trim(), senioridade: x.senioridade || '', custo_hora: num(x.custo_hora) || null, preco_piso: num(x.preco_piso) || null, preco_alvo: num(x.preco_alvo) || null, preco_teto: num(x.preco_teto) || null, fonte: x.fonte || 'manual' }));
      await cfgSet('propostas_rate_card', lista); return { rate_card: lista }; },
    rate_card_sugerir: () => rateCardSugerir(),
    rate_card_importar: async () => { // planilha/CSV do rate card → IA mapeia colunas
      const arq = await textoDoArquivo(payload.nome, payload.base64);
      const pedido = 'Este arquivo é um RATE CARD (tabela de preços por perfil). Devolva JSON {"rate_card":[{"perfil":"","senioridade":"","custo_hora":0,"preco_piso":0,"preco_alvo":0,"preco_teto":0}]} — use o valor/hora de venda como preco_alvo; se houver faixa, piso/teto; custo só se aparecer explicitamente; valores mensais divida por 160h.';
      const content = arq.pdf ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arq.pdf } }, { type: 'text', text: pedido }] : [{ type: 'text', text: pedido + '\n\n' + arq.texto }];
      const r = json(await claude('Você extrai tabelas de preço. Responda APENAS JSON.', content, 2500, 80000));
      const atual = await rateCard(); const mapa = {}; atual.forEach(x => mapa[x.perfil.toLowerCase()] = x);
      (r.rate_card || []).forEach(x => { if (!x.perfil) return; const k = (x.perfil + (x.senioridade ? ' ' + x.senioridade : '')).trim(); mapa[k.toLowerCase()] = { ...(mapa[k.toLowerCase()] || {}), perfil: k, custo_hora: num(x.custo_hora) || mapa[k.toLowerCase()]?.custo_hora || null, preco_piso: num(x.preco_piso) || null, preco_alvo: num(x.preco_alvo) || null, preco_teto: num(x.preco_teto) || num(x.preco_alvo) || null, fonte: 'importado: ' + payload.nome }; });
      const lista = Object.values(mapa); await cfgSet('propostas_rate_card', lista); return { rate_card: lista, importados: (r.rate_card || []).length };
    },
    aprender: () => aprender(payload),
    base_listar: () => sqlRun(async sql => ({ base: await sql`SELECT id, arquivo, cliente, data_ref, resultado, formato, valor_total, extraido, criado_em FROM propostas_base ORDER BY criado_em DESC` })),
    base_resultado: () => sqlRun(async sql => { await sql`UPDATE propostas_base SET resultado = ${payload.resultado} WHERE id = ${payload.id}`; return { ok: true }; }),
    base_excluir: () => sqlRun(async sql => { await sql`DELETE FROM propostas_base WHERE id = ${payload.id}`; return { ok: true }; }),
    padrao: () => padrao({}),
    padrao_regerar: () => padrao({ regerar: true }),
    estimar: () => estimar(payload),
    analisar: () => analisar(base, payload),
    redigir: () => redigir(payload),
    prop_salvar: () => propSalvar(payload),
    prop_listar: () => sqlRun(async sql => ({ propostas: await sql`SELECT id, numero, cliente, contato, titulo, status, formato, valor_total, valor_mensal, meses, margem_pct, motivo_resultado, projeto_id, criado_em, atualizado_em FROM propostas ORDER BY atualizado_em DESC LIMIT 300` })),
    prop_obter: () => sqlRun(async sql => ({ proposta: (await sql`SELECT * FROM propostas WHERE id = ${payload.id}`)[0] || null })),
    prop_excluir: () => sqlRun(async sql => { await sql`DELETE FROM propostas WHERE id = ${payload.id}`; return { ok: true }; }),
    prop_status: () => propStatus(payload),
    prop_converter: () => propConverter(base, payload),
    painel: () => painel(base),
    margens: () => margens(),
    coach: () => coach(base, payload),
    premissas: () => premissas(),
    premissas_salvar: async () => { await cfgSet('vendas_premissas', { ...((await cfgGet('vendas_premissas')) || {}), ...(payload.premissas || {}) }); return premissas(); },
    estrategia_sugerir: () => estrategiaSugerir(base, payload),
    estrategia_salvar: () => sqlRun(async sql => { if (!String(payload.texto || '').trim()) throw new Error('Escreva a estratégia'); const id = payload.id || novoId('est');
      await sql`INSERT INTO vendas_estrategias (id, periodo_tipo, periodo_ref, titulo, texto, metas, atualizado_em) VALUES (${id}, ${payload.periodo_tipo || 'mensal'}, ${payload.periodo_ref || null}, ${payload.titulo || null}, ${payload.texto}, ${JSON.stringify(payload.metas || {})}, NOW())
        ON CONFLICT (id) DO UPDATE SET periodo_tipo = EXCLUDED.periodo_tipo, periodo_ref = EXCLUDED.periodo_ref, titulo = EXCLUDED.titulo, texto = EXCLUDED.texto, metas = EXCLUDED.metas, atualizado_em = NOW()`; return { id }; }),
    estrategia_listar: () => sqlRun(async sql => ({ estrategias: await sql`SELECT * FROM vendas_estrategias ORDER BY atualizado_em DESC LIMIT 50` })),
    estrategia_excluir: () => sqlRun(async sql => { await sql`DELETE FROM vendas_estrategias WHERE id = ${payload.id}`; return { ok: true }; }),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try { return res.status(200).json({ success: true, action, ...(await acoes[action]()) }); }
  catch (e) { console.error('[vendas]', action, e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export { calcularFormatos, margens };

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'vendas');
