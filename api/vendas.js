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
async function getSql() { if (_sql) return _sql; const { neon, types } = await import('@neondatabase/serverless'); try { types?.setTypeParser?.(1082, v => v); } catch (_) {} /* v3.237: DATE como 'AAAA-MM-DD' */ _sql = neon(process.env.DATABASE_URL); return _sql; }
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
  try { return JSON.parse(t.substring(i, j + 1)); } catch (e) { const r = _jsonReparar(t.substring(i)); if (r !== undefined) return r; throw e; }
}
// v3.373: resposta cortada pelo limite de tokens (ou vírgula sobrando) → fecha a estrutura no último elemento completo
function _jsonReparar(t) {
  const semVirg = x => x.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(semVirg(t)); } catch (_) {}
  const pilha = [], cortes = []; let str = false, esc = false;
  for (let k = 0; k < t.length; k++) { const c = t[k];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === '{' || c === '[') pilha.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { pilha.pop(); cortes.push({ pos: k + 1, pilha: [...pilha] }); if (!pilha.length) break; }
    else if (c === ',') cortes.push({ pos: k, pilha: [...pilha] }); }
  for (let n = cortes.length - 1; n >= 0 && n >= cortes.length - 400; n--) { const c = cortes[n];
    try { return JSON.parse(semVirg(t.substring(0, c.pos) + c.pilha.slice().reverse().join(''))); } catch (_) {} }
  return undefined;
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
  // v3.312: alíquota por ano do Financeiro (2027 = 25%). Proposta feita a partir de outubro já fatura no ano seguinte → usa a do ano seguinte.
  let aliqAno = null, anoRef = null;
  try { const F = await import('./financeiro.js'); const mapa = await F.aliquotaPorAno(); const hj = new Date(Date.now() - 3 * 3600e3);
    anoRef = String(hj.getUTCFullYear() + (hj.getUTCMonth() >= 9 ? 1 : 0)); if (mapa?.[anoRef] != null) aliqAno = Number(mapa[anoRef]); } catch (_) {}
  if (aliqAno != null) impostoTrib = aliqAno;
  const params = { ...PARAMS_PADRAO, ...(impostoTrib != null ? { impostos_pct: impostoTrib } : {}), ...(salvo.params || {}) };
  // v3.365: alíquota por ANO de emissão da nota. 2026 = Lucro Presumido (PIS 0,65 + Cofins 3 + ISS 5 + IRPJ 4,8 + CSLL 2,88).
  // 2027 = CBS substitui PIS/Cofins: TCU propôs 11,3% (CBS 11,2 + IBS 0,1) em 28/10/2026; Senado fixa até 15/12/2026 → 11,3 + 5 + 4,8 + 2,88 ≈ 24%.
  params.impostos_por_ano = { ...IMPOSTOS_ANO_PROPOSTA, ...((salvo.params || {}).impostos_por_ano || {}) };
  return { params, impostos_fonte: IMPOSTOS_FONTE, escopos: await escoposProduto(), instrucoes: salvo.instrucoes || '', imposto_origem: salvo.params?.impostos_pct != null ? 'manual' + (aliqAno != null && Number(salvo.params.impostos_pct) !== aliqAno ? ' — atenção: a alíquota de ' + anoRef + ' no Financeiro é ' + String(aliqAno).replace('.', ',') + '%' : '') : (aliqAno != null ? 'alíquota de ' + anoRef + ' configurada no Financeiro (' + String(aliqAno).replace('.', ',') + '%)' : impostoTrib != null ? 'tributos do financeiro (' + trib.regime + ')' : 'padrão') };
}
const IMPOSTOS_ANO_PROPOSTA = { '2026': 16.33, '2027': 24 };
const IMPOSTOS_FONTE = '2026: 16,33% (Lucro Presumido: PIS 0,65 + Cofins 3 + ISS 5 + IRPJ 4,8 + CSLL 2,88). 2027: 24% estimado — CBS+IBS 11,3% proposta pelo TCU em 28/10/2026 (substitui PIS/Cofins) + ISS 5 + IRPJ 4,8 + CSLL 2,88; o Senado fixa a alíquota até 15/12/2026. Antes de créditos.';
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
  // v3.369: sem custo no RH e sem propostas aprendidas → a IA sugere um rate card de mercado (Brasil) para revisar
  let mercado = 0, aviso = '';
  if (!rh.length && !Object.keys(obs).length) {
    try {
      const r = json(await claude('Você é especialista em remuneração de TI no Brasil (consultorias de dados, BI, engenharia de dados e IA). Responda APENAS JSON.',
        `Monte um rate card de referência de mercado (Brasil, ${new Date().getFullYear()}) para uma consultoria de dados e IA com estes perfis (pode ajustar nomes): Engenheiro de Dados Júnior, Pleno e Sênior; Arquiteto de Dados; Analista de BI Pleno e Sênior; Cientista de Dados Pleno e Sênior; Engenheiro de IA/ML Sênior; Gerente de Projetos; Analista de Negócios; QA; DevOps/Cloud.
custo_hora = custo total da empresa por hora (salário CLT com encargos e benefícios, ou PJ equivalente) dividido por 168 h. Use faixas medianas de mercado, sem exagero.
Devolva {"rate_card":[{"perfil":"","senioridade":"junior|pleno|senior|especialista","custo_hora":0}],"referencia":"de onde vem a estimativa em 1 frase"}`, 2000, 60000));
      (r.rate_card || []).forEach(x => { const k = String(x.perfil || '').trim(), c = num(x.custo_hora); if (!k || !(c > 0)) return; const m = mapa[k.toLowerCase()] || { perfil: k };
        if (!m.custo_hora) { m.custo_hora = r2(c); m.custo_fonte = 'estimativa de mercado (IA) — revise'; } if (x.senioridade && !m.senioridade) m.senioridade = x.senioridade;
        if (!m.preco_alvo) m.preco_alvo = r2(m.custo_hora * fator); if (!m.preco_piso) m.preco_piso = r2(m.custo_hora * (1 + params.overhead_pct / 100) / (1 - params.impostos_pct / 100 - params.margem_min_pct / 100));
        if (!m.preco_teto) m.preco_teto = r2(m.preco_alvo * 1.25); mapa[k.toLowerCase()] = m; mercado++; });
      aviso = r.referencia || '';
    } catch (e) { aviso = 'IA indisponível: ' + e.message; }
  }
  return { sugestao: Object.values(mapa), fontes: { cargos_rh: rh.length, perfis_observados: Object.keys(obs).length, mercado_ia: mercado, aviso } };
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
  const ex = json(await claude(SYS_EXTRAI + ' Seja conciso: listas com no máximo 12 itens curtos.', content, 6000, 100000));
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
  // v3.43: abrir a aba Aprendizado não dispara mais a consolidação por IA (levava >60s) — só o botão
  // "Reconsolidar" e o fim do "Aprender com os arquivos" (padrao_regerar) chamam a IA.
  if (regerar && base.length) {
    const resumo = base.map(b => ({ arquivo: b.arquivo, resultado: b.resultado, ...['tipo_documento', 'formato_comercial', 'secoes', 'tom', 'estrutura_preco', 'condicoes', 'premissas', 'exclusoes', 'sla', 'diferenciais', 'licoes'].reduce((o, k) => (o[k] = b.extraido?.[k], o), {}) }));
    const { instrucoes } = await propConfig();
    salvo = json(await claude('Você consolida o padrão de propostas comerciais da Atlantyx a partir de exemplos reais. Dê mais peso às propostas GANHAS. Responda APENAS JSON.',
      `${instrucoes ? 'INSTRUÇÕES DO DONO (prioridade máxima):\n' + instrucoes.substring(0, 6000) + '\n\n' : ''}EXEMPLOS:\n${JSON.stringify(resumo).substring(0, 40000)}\n\nDevolva {"secoes":[{"titulo":"","objetivo":"o que a seção precisa conter"}],"tom":"","estrutura_preco":"","condicoes_padrao":["..."],"premissas_padrao":["..."],"exclusoes_padrao":["..."],"diferenciais":["..."],"o_que_ganha":"padrões das propostas ganhas","o_que_perde":"padrões das perdidas (se houver)","checklist":["itens que toda proposta deve ter"]}`, 3000, 80000));
    salvo.atualizado_em = new Date().toISOString(); salvo.n_exemplos = base.length;
    await cfgSet('propostas_padrao', salvo);
  }
  return { padrao: salvo, win_rate: win, estatistica: est, exemplos: base.length, precisa_consolidar: !salvo && base.length > 0 };
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
  // v3.43: QuickBooks e HubSpot em paralelo, com limite de 20s cada (antes em sequência, até 50s cada)
  // v3.152: metas e realizado da MESMA fonte do Dashboard Financeiro e da TV — Metas da Empresa do ano (ou o padrão de
  // 25% sobre o ano anterior) e a meta do mês (mês a mês do cadastro), contra o faturamento da DRE do QuickBooks.
  // Antes: kv 'atx:metas'.anual com padrão fixo de R$ 18 mi e meta do mês = ano ÷ 12 — o % divergia do financeiro.
  const [st, rm, pipe, P] = await Promise.all([_api(base, '/api/financeiro', { action: 'metas_empresa_status', params: { com_crm: false } }, 30000),
    _api(base, '/api/financeiro', { action: 'resultado_kpis', params: { _max_idade: 300 } }, 30000), _api(base, '/api/analytics?tipo=pipeline', null, 20000), premissas()]);
  const S = st?.metas?.meta ? st.metas : (st?.meta ? st : null), RM = rm?.resultado || null; // v3.231: a resposta vem em { metas: { meta, realizado } }
  let k = {}, fonteRec = 'QuickBooks (DRE)';
  if (!(S?.realizado) || !(RM?.periodo_res)) { const fin = await _api(base, '/api/financeiro', { action: 'kpis_saude', params: {} }, 20000); k = fin.kpis || {}; if (!fin.kpis) fonteRec = 'indisponível: ' + (fin.error || fin.erro || ''); }
  const metaAno = num(S?.meta?.faturamento) || anual, metaMes = num(RM?.metas_periodo?.faturamento) || (S?.meta?.faturamento ? metaAno / 12 : mensal);
  const realAno = S?.realizado ? num(S.realizado.faturamento) : num(k.receita_ano), realMes = RM?.periodo_res ? num(RM.periodo_res.faturamento) : num(k.receita_mes);
  const pipelineTotal = num(pipe?.pipeline?.total_valor);
  return { meta_anual: metaAno, meta_mensal: metaMes, realizado_ano: realAno, realizado_mes: realMes,
    meta_fonte: { ano: S?.meta?.faturamento ? (S.meta.padrao ? 'meta padrão da empresa — ' + (S.meta.fonte || '') : 'Metas da Empresa') : (metas.anual ? 'meta antiga do Dashboard LIVE' : 'padrão fixo (cadastre em Planejamento → Metas da Empresa)'),
      mes: RM?.metas_periodo?.fonte?.faturamento || 'meta do ano ÷ 12' },
    pipeline_total: pipelineTotal, pipeline_ponderado: r2(pipelineTotal * P.peso_pipeline / 100), deals_abertos: num(pipe?.pipeline?.total_deals),
    etapas: pipe?.pipeline?.etapas || null, fonte: { receita: fonteRec, pipeline: pipe?.pipeline ? 'HubSpot' : 'indisponível' } };
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
// v3.43: o "O que fazer hoje" e a estratégia recalculavam o painel inteiro logo depois de abri-lo — reaproveita por 2 min
let _painelMemo = null;
// v3.85 (QA 02/10 — HTTP 0 / tela carregando sem fim): o cálculo nunca segura a resposta além deste limite;
// passou disso (ou falhou), devolve o último cálculo salvo marcado como desatualizado em vez de pendurar a tela.
const PAINEL_LIMITE_MS = 25000;
async function _painelCache() {
  try { const sql = await getSql(); const r = await sql`SELECT valor, atualizado_em FROM app_config WHERE chave = 'cache:vendas:painel' LIMIT 1`;
    if (!r[0]) return null; const v = typeof r[0].valor === 'string' ? JSON.parse(r[0].valor) : r[0].valor;
    return v ? { v, idade: (Date.now() - new Date(r[0].atualizado_em).getTime()) / 1000 } : null; } catch (_) { return null; }
}
async function painel(base, { forcar = false } = {}) {
  const memo = !forcar && _painelMemo && Date.now() - _painelMemo.em < 120000 ? _painelMemo.p : null;
  // v3.69 (QA-001/002): o memo em memória se perde a cada instância nova — guarda também no banco. Até 5 min
  // devolve na hora; até 12h devolve o último marcado como desatualizado e a tela pede o novo em seguida.
  const cache = memo ? null : await _painelCache();
  if (!memo && !forcar && cache && cache.idade < 12 * 3600) return Object.assign({}, cache.v, { _cache: { idade_s: Math.round(cache.idade), stale: cache.idade > 300 } });
  let p = memo;
  if (!p) { p = _painelCalc(base).then(v => { cfgSet('cache:vendas:painel', v).catch(() => {}); return v; }); _painelMemo = { em: Date.now(), p }; p.catch(() => { _painelMemo = null; }); }
  let tm, erro = null;
  const v = await Promise.race([p.catch(e => { erro = e; return null; }), new Promise(r => { tm = setTimeout(() => r(null), PAINEL_LIMITE_MS); })]).finally(() => clearTimeout(tm));
  if (v) return v;
  const motivo = erro ? erro.message : `o cálculo passou de ${PAINEL_LIMITE_MS / 1000}s (QuickBooks/HubSpot lentos)`;
  const c = cache || await _painelCache();
  if (c) return Object.assign({}, c.v, { _cache: { idade_s: Math.round(c.idade), stale: true, aviso: 'Não consegui recalcular agora — ' + motivo + '. Mostrando o último cálculo salvo.' } });
  throw new Error('Não consegui montar o painel: ' + motivo + '. Tente novamente em instantes.');
}
async function _painelCalc(base) {
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
  const hoje = new Date(Date.now() - 3 * 3600000); /* v3.232: Brasília */ const fimAno = new Date(hoje.getFullYear(), 11, 31), fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
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

// v3.85: as chamadas de IA do painel respondem dentro de ~27s no total (a tela desiste em 30s)
const _iaPrazo = t0 => Math.max(8000, 27000 - (Date.now() - t0));
async function coach(base, { pergunta } = {}) {
  const t0 = Date.now(); const p = await painel(base);
  const sys = `Você é o DIRETOR COMERCIAL IA da Atlantyx — cobrador, direto e insistente (um "CRM pulguento"), em português do Brasil. Use SÓ os números do contexto. Formato: 1) Situação em 2 linhas com números; 2) "Hoje" — 3 ações concretas com quem/quanto; 3) "Esta semana" — metas de reuniões/propostas; 4) Um alerta de margem ou formato se houver. Sem rodeios, sem elogios.`;
  return { resposta: await claude(sys, `CONTEXTO:\n${JSON.stringify({ metas: p.metas, calculo: p.calculo, propostas: p.propostas, margens: { geral: p.margens.geral, por_tipo: p.margens.por_tipo }, recorrencia: p.recorrencia, cobrancas: p.cobrancas }).substring(0, 12000)}\n\n${pergunta ? 'PERGUNTA: ' + pergunta : 'Dê o direcionamento de hoje.'}`, 1200, _iaPrazo(t0)) };
}
async function estrategiaSugerir(base, { periodo_tipo, periodo_ref } = {}) {
  const t0 = Date.now(); const p = await painel(base);
  const sys = 'Você escreve o PLANO COMERCIAL do período para a Atlantyx (B2B, venda consultiva de dados/IA, ciclo longo). Português do Brasil, prático, em markdown curto: Meta do período e gap · Matemática do funil (vendas, propostas, reuniões, leads) · Contas-alvo e ofertas prioritárias (use formatos com recorrência quando ajudar a meta) · Cadência semanal · Riscos e plano B · Indicadores de acompanhamento.';
  return { texto: await claude(sys, `Período: ${periodo_tipo || p.periodo_sugerido} ${periodo_ref || ''}\nDADOS:\n${JSON.stringify({ metas: p.metas, calculo: p.calculo, propostas: p.propostas, margens: { geral: p.margens.geral, por_tipo: p.margens.por_tipo }, recorrencia: p.recorrencia }).substring(0, 12000)}`, 1600, _iaPrazo(t0)) };
}

// ═══════════════════════ PROPOSTA: ESTIMAR, ANALISAR, REDIGIR ═══════════════════════
async function estimar({ escopo, tipo_demanda, meses, tipo_documento, semanas } = {}) {
  if (!escopo || String(escopo).length < 30) throw new Error('Descreva o escopo (mín. 30 caracteres)');
  const rc = await rateCard();
  const perfis = rc.map(x => x.perfil);
  const sys = 'Você é arquiteto de soluções e estimador sênior da Atlantyx (dados, BI, engenharia de dados, IA). Estime esforço realista por perfil. Responda APENAS JSON.';
  const r = json(await claude(sys, `ESCOPO:\n${String(escopo).substring(0, 6000)}\nTipo de demanda: ${tipo_demanda || 'indefinido'}${tipo_documento === 'poc' ? '\nÉ uma POC (prova de conceito) de ' + (semanas || 6) + ' semanas: estime só o necessário para provar os critérios de sucesso, com equipe enxuta; inclua SEMPRE um perfil de Analista de IA dedicado ao suporte dos usuários (esclarecer dúvidas) durante toda a POC (cerca de 8 a 10 horas por semana) e o treinamento dos usuários-chave' : ''}${meses ? '\nPrazo desejado: ' + meses + ' meses' : ''}\nPERFIS DISPONÍVEIS NO RATE CARD (use estes nomes exatamente quando couber): ${JSON.stringify(perfis)}\nDevolva {"meses":0,"risco":"baixo|medio|alto","perfis":[{"perfil":"","horas":0,"justificativa":""}],"premissas":["..."],"riscos":["..."],"entregaveis":["..."],"fases":[{"nome":"","mes_inicio":1,"mes_fim":1,"entregas":""}]}`, 2200));
  r.perfis = (r.perfis || []).map(x => { const c = rc.find(y => y.perfil.toLowerCase() === String(x.perfil).toLowerCase()); return { ...x, custo_hora: c?.custo_hora ?? null, preco_hora: c?.preco_alvo ?? null, preco_teto: c?.preco_teto ?? null, preco_piso: c?.preco_piso ?? null, no_rate_card: !!c }; });
  return r;
}
async function analisar(base, entrada = {}) {
  if (entrada.ja_cliente == null && entrada.cliente) entrada.ja_cliente = (await clienteChecar({ cliente: entrada.cliente })).ja_cliente;
  const { params } = await propConfig(); const M = await contextoMetas(base); const mg = await margens(); const pd = await padrao({});
  const rc = await rateCard();
  const perfis = (entrada.perfis || []).map(x => { const c = rc.find(y => y.perfil.toLowerCase() === String(x.perfil || '').toLowerCase()) || {};
    return { ...x, custo_hora: num(x.custo_hora) || num(c.custo_hora), preco_hora: num(x.preco_hora) || num(c.preco_alvo) || null, preco_teto: num(x.preco_teto) || num(c.preco_teto) || null, preco_piso: num(x.preco_piso) || num(c.preco_piso) || null }; });
  const r = calcularFormatos({ ...entrada, perfis, params: { ...params, ...(entrada.params || {}) },
    metas: { anual: M.meta_anual, realizado_ano: M.realizado_ano, pipeline_ponderado: M.pipeline_ponderado, recorrente_atual_mensal: mg.recorrente_mensal, receita_mensal_ref: M.meta_mensal },
    historico: { win_rate: pd.win_rate } });
  r.fontes = { metas: M.fonte, win_rate: Object.keys(pd.win_rate).length ? 'histórico de propostas' : 'sem histórico (aderência por tipo de demanda)' };
  if (entrada.explicar !== false && process.env.ANTHROPIC_API_KEY) {
    try { r.explicacao = await claude('Você é o CFO comercial da Atlantyx. Explique em português, em no máximo 7 linhas, qual formato recomendar e por quê, usando os números (metas, margem, caixa, aderência ao cliente, impostos do ano de faturamento, inflação e a comparação com o concorrente quando houver), e dê 2 dicas de negociação. Se estiver caro frente ao concorrente, prefira trocas (escopo menor, faseamento, prazo de pagamento, POC paga com crédito) antes de desconto e NUNCA abaixo do piso. Para POC, diga se o período e o preço são razoáveis. Sem repetir a tabela.',
      JSON.stringify({ cliente: entrada.cliente, tipo_demanda: r.entrada.tipo_demanda, metas: r.metas, custos: r.custos, tipo_documento: r.entrada.tipo_documento, custos_extra: { inflacao_pct: r.custos.inflacao_aplicada_pct, impostos_efetivo_pct: r.custos.impostos_efetivo_pct }, formatos: r.formatos.map(f => ({ formato: f.nome, valor: f.valor_total, mensal: f.valor_mensal_medio, margem: f.margem_pct, no_ano: f.receita_no_ano, arr: f.arr, scores: f.scores, alertas: f.alertas, piso: f.preco_piso, competitividade: f.competitividade, desconto_aplicado_pct: f.desconto_aplicado_pct })) }), 700, 30000); } catch (_) {}
  }
  return r;
}
async function redigir({ proposta, formato } = {}) {
  const pr = proposta || {}; const f = (pr.analise?.formatos || []).find(x => x.formato === (formato || pr.formato)) || pr.analise?.formatos?.[0];
  if (!f) throw new Error('Analise os formatos antes de redigir');
  const pd = await padrao({}); const { instrucoes, params } = await propConfig();
  const tipoDoc = pr.dados?.tipo_documento || 'proposta', poc = pr.dados?.poc || {};
  // v3.365: POC profissional — período fechado, critérios de sucesso mensuráveis, go/no-go e crédito no contrato
  const SECOES_POC = [{ titulo: 'Contexto e objetivo da POC' }, { titulo: 'Hipóteses e critérios de sucesso' }, { titulo: 'Escopo da POC (dentro e fora)' }, { titulo: 'Período, fases e checkpoints' },
    { titulo: 'Ambiente, dados e LGPD' }, { titulo: 'Responsabilidades (Atlantyx e cliente)' }, { titulo: 'Entregáveis e decisão go/no-go' }, { titulo: 'Investimento e crédito no contrato' }, { titulo: 'Próximos passos: da POC ao projeto' }, { titulo: 'Por que a Atlantyx' }];
  const secoesPadrao = tipoDoc === 'poc' ? SECOES_POC : pd.padrao?.secoes?.length ? pd.padrao.secoes : [{ titulo: 'Contexto e objetivo' }, { titulo: 'Escopo e entregáveis' }, { titulo: 'Abordagem e metodologia' }, { titulo: 'Equipe e responsabilidades' }, { titulo: 'Cronograma' }, { titulo: 'Investimento e condições comerciais' }, { titulo: 'Premissas e exclusões' }, { titulo: 'Por que a Atlantyx' }];
  const sys = `Você redige propostas comerciais da Atlantyx (consultoria de dados, BI, engenharia de dados e IA — 17 anos, clientes como CPFL Energia, Enel, Caixa Capitalização). Português do Brasil, tom executivo e objetivo. Siga o MODELO OFICIAL de capítulos da Atlantyx (o padrão aprendido serve só de referência de tom e conteúdo). Nunca invente números: use só os fornecidos. Faturamento conforme o cronograma, com vencimento em 35 dias corridos da emissão da nota fiscal (salvo instrução diferente). Responda APENAS JSON.`;
  const usr = `${instrucoes ? 'INSTRUÇÕES DO DONO (prioridade máxima):\n' + instrucoes.substring(0, 5000) + '\n\n' : ''}PADRÃO APRENDIDO: ${JSON.stringify(pd.padrao || {}).substring(0, 6000)}
CLIENTE: ${pr.cliente || ''} | CONTATO: ${pr.contato || ''} | TÍTULO: ${pr.titulo || ''}
BRIEFING DO PROJETO: ${String(pr.dados?.briefing || '').substring(0, 4000)}
ESCOPO COMPLETO: ${String(pr.dados?.escopo || '').substring(0, 14000)}
ESTIMATIVA: ${JSON.stringify({ perfis: pr.dados?.perfis, premissas: pr.dados?.estimativa?.premissas, entregaveis: pr.dados?.estimativa?.entregaveis, fases: pr.dados?.estimativa?.fases, riscos: pr.dados?.estimativa?.riscos }).substring(0, 6000)}
DADOS DA CAPA: ${JSON.stringify(pr.dados?.capa || {})}
TIPO DE DOCUMENTO: ${tipoDoc === 'poc' ? 'POC (prova de conceito) — período de ' + (poc.semanas || 6) + ' semanas; critérios de sucesso: ' + (poc.criterios || 'definir 3 a 5 critérios mensuráveis com o cliente') + '; ' + (f.poc_cortesia && !(f.valor_total > 0) ? 'POC SEM CUSTO por ser cliente da Atlantyx (apresente como condição de parceria, não como gratuidade genérica)' : 'o valor da POC vira crédito no contrato (abatido do projeto) se assinado em até ' + (poc.credito_dias || 60) + ' dias após o relatório final') + '; durante toda a POC um Analista de IA da Atlantyx fica dedicado ao suporte dos usuários para esclarecer dúvidas, e há treinamento dos usuários-chave; sem compromisso de compra além da POC' + (pr.dados?.ja_cliente ? '; e, por ser cliente, o projeto que vier da POC terá desconto especial adicional de ' + (params?.desconto_cliente_pct ?? 5) + '% se assinado em até ' + (params?.desconto_cliente_dias ?? 60) + ' dias' : '') : tipoDoc === 'piloto' ? 'Piloto (uso real, escopo reduzido, antes da escala)' : 'Proposta completa'}
FORMATO COMERCIAL ESCOLHIDO: ${f.nome} — valor total R$ ${f.valor_total}${f.desconto_aplicado_pct ? ' (já com desconto de ' + f.desconto_aplicado_pct + '% sobre R$ ' + f.valor_sem_desconto + ' — cite como condição comercial especial, com validade)' : ''}, média mensal R$ ${f.valor_mensal_medio}, prazo ${pr.analise?.entrada?.meses} meses.
ESCOPO COMPLEMENTAR INCLUÍDO (faz parte do escopo e do preço): ${JSON.stringify((pr.dados?.complementar || []).filter(x => x.decisao === 'incluir').map(x => x.titulo + ' — ' + x.descricao))}
OPCIONAIS (apresente numa seção "Itens opcionais", sem preço, a orçar à parte): ${JSON.stringify((pr.dados?.complementar || []).filter(x => x.decisao === 'opcional').map(x => x.titulo + ' — ' + x.descricao))}
${f.condicao_cliente ? `CONDIÇÃO DE CLIENTE: desconto especial adicional de ${f.condicao_cliente.desconto_pct}% (valor R$ ${f.condicao_cliente.valor_com_desconto}) se o contrato for assinado em até ${f.condicao_cliente.dias} dias da data da proposta — cite na seção de investimento e nas condições comerciais.\n` : ''}CRONOGRAMA: inclua na seção de cronograma as fases com mês de início e fim (das fases da estimativa) e os marcos de faturamento.
REAJUSTE: ${(pr.analise?.entrada?.meses || 0) > 12 ? 'contrato acima de 12 meses — inclua cláusula de reajuste anual pelo IPCA' : 'valores fixos no período; reajuste anual pelo IPCA em caso de renovação'}. Tributos: valores com impostos inclusos conforme a legislação vigente na data de emissão de cada nota (reforma tributária: CBS a partir de 2027).
${(() => { const K = pr.dados?.crono; const fis = K?.fases?.length ? 'CRONOGRAMA FÍSICO (use exatamente estas etapas e períodos, roadmap Atlantyx, na seção de cronograma; unidade: ' + K.unidade + '): ' + JSON.stringify(K.fases.filter(x => x.incluir !== false).map(x => ({ etapa: x.nome, gate: x.gate || undefined, inicio: x.ini, fim: x.fim, entrega: x.entrega }))) + '\n' : '';
  if (f.poc_cortesia && !(f.valor_total > 0)) return fis + 'CRONOGRAMA FINANCEIRO: não há (POC sem custo para cliente) — não inclua tabela de faturamento.';
  if (K?.pagamento === 'marcos' && K.marcos?.length) return fis + 'CRONOGRAMA FINANCEIRO POR MARCOS (pagamento atrelado à entrega; os percentuais somam 100%; use exatamente): ' + JSON.stringify(K.marcos.map(m => ({ marco: m.nome, vinculado_a: m.ref || undefined, quando: (K.unidade === 'semanas' ? 'semana ' : 'mês ') + m.quando, percentual: m.pct + '%', valor: Math.round(f.valor_total * m.pct / 100) })));
  return fis + 'CRONOGRAMA DE FATURAMENTO: ' + JSON.stringify(f.cronograma.map(c => ({ mes: c.mes, valor: c.valor, desc: c.desc }))); })()}
MATRIZ DE RESPONSABILIDADES: monte de 8 a 14 linhas cobrindo as etapas do cronograma e as obrigações típicas do cliente (acesso a dados e sistemas, ponto focal, decisor, usuários-chave, homologação, infraestrutura/ambientes, aprovação dos gates${tipoDoc === 'poc' ? ', critérios de sucesso e decisão go/no-go' : ''}); use RACI: R = executa, A = aprova/responde, C = consultado, I = informado; cada linha com uma letra para Atlantyx e uma para o cliente. Inclua também uma seção curta "Responsabilidades" no texto explicando a matriz.
`;
  // v3.379: capítulos fixos do MODELO OFICIAL Atlantyx (arquivos-padrão de Proposta Técnica e Técnica-Comercial);
  // dois pedidos em paralelo (parte técnica e parte comercial) para caber no tempo; tabelas (dados, investimento, rate card,
  // cronograma físico-financeiro, matriz e assinaturas) são montadas pelo sistema, não pela IA.
  const G = {
    carta: 'Carta de apresentação SEM valores: comece com "Rio de Janeiro, [data por extenso]." numa linha, depois "À [cliente]" e a área solicitante em linhas separadas, "Prezados Senhores," e 3 a 5 parágrafos (o que é proposto, base/origem da demanda, abordagem, experiência relevante da Atlantyx); chame o documento de {{TIPO_DOC}}; termine em "Atenciosamente," (a assinatura é inserida pelo sistema).',
    apresentacao: 'Apresentação da Atlanteam Soluções em TI (marca Atlantyx): 2 a 3 parágrafos (17 anos, dados, BI, engenharia de dados, IA e automação) e a subseção "2.1 Cases de Referência" em marcadores — só cases citados nas instruções/padrão aprendido; se não houver, descreva tipos de projeto sem números.',
    contexto: 'Contexto do cliente e do problema (2 a 3 parágrafos) e a subseção "3.1 Justificativas" em marcadores.',
    objetivos: 'Objetivos do projeto em 5 a 8 marcadores, começando com verbo no infinitivo.',
    escopo: 'Escopo dos serviços: 1 parágrafo de abertura e uma subseção numerada "5.N Título" para cada frente/entrega do escopo, cada uma com os rótulos **Situação Atual:** (se houver), **Evolução Solicitada:** e **Resultado Esperado:**; feche com a subseção de itens fora do escopo e, se houver, de itens opcionais (sem preço).',
    diferenciais: 'Diferenciais técnicos e estratégicos da Atlantyx para este projeto, 6 a 9 marcadores com **destaque em negrito** no início.',
    entregaveis: 'Para cada fase/etapa do cronograma, uma subseção "Fase N — Nome" seguida de alíneas a), b), c)... com os entregáveis concretos.',
    resumo_escopo: 'Resumo do escopo contratado para a proposta comercial: 1 parágrafo citando que o detalhamento técnico está na Proposta Técnica, e 5 a 8 marcadores com as entregas principais.',
    equipe: 'Organograma e equipe: 1 parágrafo e, para cada perfil da estimativa, uma linha **Perfil — Senioridade / Regime** seguida de alíneas a), b), c)... com as atribuições.',
    investimento: 'Resumo executivo do investimento: 2 parágrafos explicando o valor, o formato comercial, o que está incluso e as condições (descontos, condição de cliente, crédito da POC) — a tabela de valores é inserida pelo sistema logo depois.',
    rate_card: '1 a 2 parágrafos sobre o rate card oficial Atlantyx (valores por perfil com tributos inclusos, regime de contratação) — a tabela é inserida pelo sistema.',
    bonus: 'Bônus e condições especiais SÓ com o que existe nos dados (desconto aplicado, condição de cliente, crédito da POC no contrato, itens de escopo complementar incluídos sem custo adicional); subseções "8.1 Bônus Financeiros" e "8.2 Bônus Técnicos e Estratégicos" com marcadores. Não invente benefícios.',
    premissas_exec: 'Premissas e condições de execução: subseções "Premissas de Execução" e "Restrições e Observações", em marcadores.',
    premissas_com: 'Premissas e condições comerciais: subseções "Premissas Comerciais" (prazo, faturamento, impostos, reajuste, vigência) e "Restrições e Observações", em marcadores.',
    garantias: 'Subseções com marcadores: "Confidencialidade e Sigilo", "Garantia de Qualidade", "Responsabilidades da Atlanteam", "Responsabilidades do Cliente", "Segurança da Informação e LGPD", "Propriedade Intelectual" — a matriz de responsabilidades (RACI) é inserida pelo sistema no fim deste capítulo.',
    suporte: 'Suporte pós-implantação e SLA: período de garantia/operação assistida e níveis por severidade (Crítica, Alta, Média, Baixa) como rótulos **Severidade N (Nível):** com reconhecimento e solução; use as instruções do dono se houver, senão proponha e escreva "níveis propostos".',
    pagamento: 'Prazo e forma de pagamento: subseção "Fluxo de Pagamento" em marcadores seguindo exatamente o cronograma financeiro/marcos e o recebimento em 35 dias após a nota; se a POC for sem custo, diga que não há pagamento na POC.',
    validade: '1 a 2 parágrafos: validade da proposta (dias) a partir da data de emissão e o que acontece depois.',
    aceite: '1 a 2 parágrafos de aceite da {{TIPO_DOC}} (o aceite formaliza a contratação nas condições descritas), terminando com "Rio de Janeiro, [data por extenso]." — as assinaturas são inseridas pelo sistema.',
  };
  const PARTES = [['carta', 'apresentacao', 'contexto', 'objetivos', 'diferenciais'], ['escopo'], ['entregaveis', 'equipe', 'resumo_escopo', 'investimento', 'rate_card', 'bonus'],
    ['premissas_exec', 'premissas_com', 'garantias', 'suporte', 'pagamento', 'validade', 'aceite']];
  // v3.380: profundidade — cada capítulo completo e específico deste cliente/escopo (nada genérico)
  G.contexto += ' Seja específico: 3 a 5 parágrafos sobre a situação atual, os sistemas e dados envolvidos, as dores e o impacto no negócio, citando o que está no briefing e no escopo; Justificativas com 5 a 8 marcadores.';
  G.escopo += ' Este é o capítulo mais importante: cubra TODOS os itens do escopo, sem resumir; cada subseção com 2 a 4 parágrafos/rótulos detalhando o que será feito, como, com quais dados/sistemas, regras e validações, e um rótulo **Critério de Aceite:** objetivo. Inclua também subseções de requisitos não funcionais (desempenho, segurança/LGPD, documentação) quando aplicável.';
  G.entregaveis += ' Use exatamente as etapas do cronograma físico; cada fase com 4 a 8 entregáveis concretos (documentos, artefatos, funcionalidades, evidências de teste).';
  G.equipe += ' Cada perfil com 5 a 8 atribuições específicas deste projeto.';
  G.objetivos += ' Objetivos mensuráveis e ligados ao escopo.';
  G.diferenciais += ' Ligados a este projeto (não genéricos).';
  G.garantias += ' Cada subseção com 3 a 6 marcadores específicos.';
  G.premissas_exec += ' 8 a 15 premissas concretas (acessos, ambientes, dados, disponibilidade de usuários-chave, homologação, mudanças de escopo).';
  G.premissas_com += ' 8 a 12 premissas concretas.';
  const PROF = '\nNÍVEL DE DETALHE: texto completo e detalhado, pronto para enviar ao cliente, específico deste projeto (use os nomes, sistemas, áreas e números do briefing/escopo); nada de frases genéricas ou de placeholder; não resuma o escopo.';
  const FORMA = '\nFORMATAÇÃO DO "conteudo" (markdown simples, é convertido para o modelo oficial): parágrafos separados por linha em branco; subtítulo numa linha própria começando por "### "; marcadores com "- "; alíneas com "a) "; rótulo em negrito no início da linha com "**Rótulo:** texto". Sem tabelas em markdown.';
  const pedir = async (chaves, extra) => json(await claude(sys + ' Responda APENAS JSON.', usr + FORMA + PROF + '\nESCREVA ESTES CAPÍTULOS (chave → o que escrever):\n' + chaves.map(k => `- ${k}: ${G[k]}`).join('\n') + extra
    + `\nDevolva {"secoes":[{"chave":"uma das chaves acima","conteudo":"..."}]${extra ? ',"matriz_responsabilidades":[{"atividade":"","atlantyx":"R|A|C|I","cliente":"R|A|C|I"}]' : ''}}`, 7000, 108000));
  const RES = await Promise.all(PARTES.map((p, i) => pedir(p, i === 3 ? '\nMATRIZ DE RESPONSABILIDADES: devolva também "matriz_responsabilidades" (10 a 16 linhas cobrindo cada etapa do cronograma, RACI: R executa, A aprova, C consultado, I informado).' : '').catch(e => ({ secoes: [], erro: e.message }))));
  if (RES.every(r => !(r.secoes || []).length)) throw new Error(RES[0].erro || 'A IA não devolveu o texto');
  const B1 = RES[3], ordem = PARTES.flat(), todas = RES.flatMap(r => r.secoes || []);
  const doc = { titulo: pr.titulo || '', secoes: ordem.map(k => { const x = todas.find(y => y.chave === k); return x ? { chave: k, titulo: TITULOS_CAP[k] || k, conteudo: String(x.conteudo || '') } : null; }).filter(Boolean),
    matriz_responsabilidades: B1.matriz_responsabilidades || [], validade_dias: 90, modelo_oficial: true, faltando: ordem.filter(k => !todas.some(y => y.chave === k)) };
  doc.formato = f.formato; doc.gerado_em = new Date().toISOString();
  return { documento: doc };
}
const TITULOS_CAP = { carta: 'Carta de Apresentação', apresentacao: 'Apresentação da Atlanteam', contexto: 'Contexto e Justificativas', objetivos: 'Objetivos do Projeto', escopo: 'Escopo dos Serviços — Solução Técnica Proposta',
  diferenciais: 'Diferenciais Técnicos e Estratégicos', entregaveis: 'Entregáveis Detalhados por Fase', resumo_escopo: 'Resumo do Escopo Contratado', equipe: 'Organograma e Equipe do Projeto', investimento: 'Resumo Executivo do Investimento',
  rate_card: 'Rate Card Atlantyx — Padrão Oficial', bonus: 'Bônus e Condições Especiais', premissas_exec: 'Premissas e Condições de Execução', premissas_com: 'Premissas e Condições Comerciais', garantias: 'Garantias, Papéis e Responsabilidades',
  suporte: 'Suporte Pós-Implantação e SLA', pagamento: 'Prazo e Forma de Pagamento', validade: 'Validade da Proposta', aceite: 'Aceite da Proposta' };


// ═══════════════════════ v3.365 · ESCOPOS (catálogo de produtos, upload e geração) ═══════════════════════
async function escoposProduto() { return (await cfgGet('propostas_escopos_produto')) || []; }
async function escoposSalvar({ lista } = {}) {
  const l = (Array.isArray(lista) ? lista : []).filter(x => String(x.nome || '').trim()).slice(0, 60)
    .map(x => ({ id: x.id || novoId('esc'), nome: String(x.nome).trim().substring(0, 80), resumo: String(x.resumo || '').substring(0, 400), escopo: String(x.escopo || '').substring(0, 20000), atualizado_em: new Date().toISOString() }));
  await cfgSet('propostas_escopos_produto', l); return { escopos: l };
}
async function escopoExtrair({ nome, base64 } = {}) {
  const arq = await textoDoArquivo(nome, base64);
  const pedido = 'Este documento descreve o ESCOPO de um trabalho. Reescreva o escopo em português, em markdown simples (títulos curtos e listas com -): objetivo, entregáveis, dentro do escopo, fora do escopo, premissas, volumes e prazos citados. Não invente nada que não esteja no documento.';
  if (arq.pdf) return { escopo: await claude('Você organiza escopos de projetos de dados, BI e IA. Responda só com o texto do escopo.', [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arq.pdf } }, { type: 'text', text: pedido }], 3000, 80000), origem: 'PDF (organizado pela IA)' };
  return { escopo: String(arq.texto || '').trim().substring(0, 20000), origem: 'texto do arquivo' };
}
async function escopoGerar({ produto_id, cliente, necessidade, tipo_documento } = {}) {
  const p = (await escoposProduto()).find(x => x.id === produto_id); if (!p) throw new Error('Produto não encontrado no catálogo de escopos');
  const sys = 'Você é arquiteto de soluções da Atlantyx. Adapte o escopo padrão de um produto à necessidade de um cliente. Português, markdown simples (títulos curtos e listas com -). Não invente números de volume ou prazo que não foram dados — deixe [a confirmar].';
  const usr = `PRODUTO: ${p.nome}\nESCOPO PADRÃO DO PRODUTO:\n${p.escopo}\n\nCLIENTE: ${cliente || '[cliente]'}\nNECESSIDADE INFORMADA: ${necessidade || '(nenhuma — use o padrão)'}\nTIPO: ${tipo_documento === 'poc' ? 'POC (prova de conceito): reduza para 1 caso de uso, 1 fonte de dados e critérios de sucesso mensuráveis' : tipo_documento === 'piloto' ? 'Piloto com usuários reais e escopo reduzido' : 'Projeto completo'}\n\nDevolva só o escopo: objetivo, entregáveis, dentro do escopo, fora do escopo, premissas, responsabilidades do cliente${tipo_documento === 'poc' ? ', critérios de sucesso e período' : ''}.`;
  return { escopo: await claude(sys, usr, 3000, 70000), produto: p.nome };
}

// v3.378 · já é cliente? procura o nome nos projetos (financeiro), nas propostas ganhas e na base aprendida
async function clienteChecar({ cliente } = {}) {
  const sem = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const STOP = new Set(['energia', 'grupo', 'brasil', 'servicos', 'solucoes', 'sistemas', 'tecnologia', 'holding', 'participacoes', 'ltda', 'cia', 'companhia', 'industria', 'comercio']);
  const tokens = sem(cliente).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP.has(t) && !['s/a', 'sa', 'the'].includes(t));
  if (!tokens.length) return { ja_cliente: false, onde: [] };
  const sql = await getSql(); const q = async f => { try { return await f(); } catch (_) { return []; } };
  const [proj, props] = await Promise.all([q(() => sql`SELECT DISTINCT cliente FROM projetos_financeiros WHERE cliente IS NOT NULL AND COALESCE(status,'ativo') <> 'cancelado'`), q(() => sql`SELECT DISTINCT cliente FROM propostas WHERE status = 'ganha' AND cliente IS NOT NULL`)]);
  const bate = n => { const t = sem(n).split(/[^a-z0-9]+/); return tokens.some(k => t.includes(k)); };
  const onde = [...proj.filter(r => bate(r.cliente)).map(r => 'projeto: ' + r.cliente), ...props.filter(r => bate(r.cliente)).map(r => 'proposta ganha: ' + r.cliente)];
  return { ja_cliente: onde.length > 0, onde: [...new Set(onde)].slice(0, 5) };
}
// ═══════════════════════ v3.366 · ESCOPO COMPLEMENTAR E APRESENTAÇÃO DA SOLUÇÃO ═══════════════════════
// v3.375 · copiloto da proposta: conversa sobre valores, escopo e texto, devolvendo ajustes que o usuário aplica com um clique
async function propChat({ proposta, mensagens } = {}) {
  const pr = proposta || {}, d = pr.dados || {}, A = pr.analise || {};
  const hist = (mensagens || []).filter(m => m && m.texto).slice(-14);
  if (!hist.length || hist[hist.length - 1].papel !== 'usuario') throw new Error('Escreva uma mensagem');
  const { params, instrucoes } = await propConfig(); const rc = await rateCard();
  const fmts = (A.formatos || []).map(f => ({ formato: f.formato, nome: f.nome, valor_total: f.valor_total, sem_desconto: f.valor_sem_desconto, desconto_pct: f.desconto_aplicado_pct, piso: f.preco_piso, margem_pct: f.margem_pct, mensal: f.valor_mensal_medio, preco_hora_efetivo: f.preco_hora_efetivo, pior_caixa: f.pior_caixa, nota: f.scores?.total, alertas: f.alertas, concorrente: f.competitividade ? { valor: f.competitividade.concorrente, diferenca_pct: f.competitividade.diferenca_pct, desconto_sugerido_pct: f.competitividade.desconto_sugerido_pct } : null }));
  const ctx = {
    cliente: pr.cliente, titulo: pr.titulo, tipo_documento: d.tipo_documento || 'proposta', tipo_demanda: d.tipo_demanda, meses: d.meses, inicio: d.inicio, risco: d.risco,
    orcamento_cliente: d.orcamento_cliente ? d.orcamento_cliente + ' (' + (d.orcamento_tipo || 'total') + ')' : null, preco_concorrente: d.preco_concorrente || null, poc: d.tipo_documento === 'poc' ? d.poc : undefined,
    briefing: String(d.briefing || '').substring(0, 1500), escopo: String(d.escopo || '').substring(0, 4000),
    equipe: (d.perfis || []).map(x => ({ perfil: x.perfil, horas: x.horas, custo_hora: x.custo_hora, preco_hora: x.preco_hora })),
    rate_card: rc.map(x => ({ perfil: x.perfil, custo_hora: x.custo_hora, piso: x.preco_piso, alvo: x.preco_alvo, teto: x.preco_teto })).slice(0, 30),
    parametros: { margem_min_pct: params.margem_min_pct, margem_alvo_pct: params.margem_alvo_pct, overhead_pct: params.overhead_pct, impostos_por_ano: params.impostos_por_ano, contingencia: params.contingencia, desconto_recorrente_pct: params.desconto_recorrente_pct },
    analise: A.formatos ? { formato_escolhido: pr.formato, recomendado: A.recomendado, metas: A.metas, custos: { custo_total: A.custos?.custo_total, preco_minimo: A.custos?.preco_minimo, preco_alvo: A.custos?.preco_alvo, impostos_efetivo_pct: A.custos?.impostos_efetivo_pct }, formatos: fmts } : 'ainda não analisada',
    documento: pr.documento ? (pr.documento.secoes || []).map(x => ({ titulo: x.titulo, conteudo: String(x.conteudo || '').substring(0, 600) })) : 'ainda não redigido',
  };
  const sys = `Você é o copiloto comercial e financeiro da Atlantyx (consultoria de dados, BI, engenharia de dados e IA, 17 anos) ajudando o fundador a ajustar UMA proposta. Português do Brasil, direto, com números.
Regras: use só os números do CONTEXTO (não invente custos, metas ou preços de mercado específicos); quando estimar, diga que é estimativa. Nunca sugira preço abaixo do piso (margem mínima) sem dizer claramente o impacto na margem. Lembre que desconto em proposta acima de 12 meses precisa de reajuste IPCA. Para mudar preço prefira: tirar escopo, faseamento, mudar formato, ajustar horas ou mix de perfis, antes de desconto puro.
${instrucoes ? 'Instruções do dono: ' + String(instrucoes).substring(0, 1500) + '\n' : ''}Responda APENAS JSON: {"resposta":"texto em markdown simples (até 12 linhas)","acoes":[...]} — "acoes" só quando houver um ajuste concreto a aplicar, cada uma de um destes tipos:
{"tipo":"desconto","formato":"tm|fechado|mensal|hibrido|poc","pct":0,"rotulo":"..."}
{"tipo":"horas","perfil":"nome exato da equipe","horas":0,"rotulo":"..."}
{"tipo":"preco_hora","perfil":"nome exato","valor":0,"rotulo":"..."}
{"tipo":"remover_perfil","perfil":"nome exato","rotulo":"..."}
{"tipo":"adicionar_perfil","perfil":"nome do rate card","horas":0,"rotulo":"..."}
{"tipo":"meses","valor":0,"rotulo":"..."}
{"tipo":"risco","valor":"baixo|medio|alto","rotulo":"..."}
{"tipo":"formato","formato":"tm|fechado|mensal|hibrido|poc","rotulo":"..."}
{"tipo":"escopo_adicionar","texto":"linhas em markdown","rotulo":"..."}
{"tipo":"secao","titulo":"título exato de uma seção do documento ou novo","conteudo":"texto completo novo da seção","rotulo":"..."}
"rotulo" = frase curta do botão (ex.: "Aplicar 8% de desconto no escopo fechado").`;
  const conversa = hist.map(m => (m.papel === 'usuario' ? 'FUNDADOR: ' : 'COPILOTO: ') + String(m.texto).substring(0, 3000)).join('\n\n');
  const r = json(await claude(sys, `CONTEXTO DA PROPOSTA:\n${JSON.stringify(ctx).substring(0, 22000)}\n\nCONVERSA:\n${conversa}\n\nResponda à última mensagem do FUNDADOR.`, 3000, 90000));
  return { resposta: String(r.resposta || ''), acoes: Array.isArray(r.acoes) ? r.acoes.slice(0, 6) : [] };
}
// briefing (o que é o projeto / solução, em texto livre) → escopo completo e editável
async function escopoBriefing({ briefing, cliente, tipo_demanda, tipo_documento, meses, poc } = {}) {
  if (String(briefing || '').trim().length < 20) throw new Error('Escreva o briefing do projeto (pelo menos uma frase completa)');
  const cat = (await escoposProduto().catch(() => [])).map(p => `- ${p.nome}: ${p.resumo || String(p.escopo || '').substring(0, 300)}`).join('\n');
  const sys = 'Você é arquiteto de soluções sênior da Atlantyx (dados, BI, IA, automação e agentes). A partir do briefing comercial, escreva o ESCOPO do projeto pronto para proposta. Português do Brasil, markdown simples (## títulos e listas com -). Seja específico ao caso do cliente. Nunca invente volumes, prazos ou números que não estejam no briefing — escreva [a confirmar]. Responda só com o escopo.';
  const usr = `CLIENTE: ${cliente || '[cliente]'}
TIPO DE DEMANDA: ${tipo_demanda || 'não informado'}
TIPO DE DOCUMENTO: ${tipo_documento === 'poc' ? `POC de ${poc?.semanas || 6} semanas — 1 caso de uso, 1 fonte de dados, critérios de sucesso mensuráveis${poc?.criterios ? ' (' + poc.criterios + ')' : ''}; inclua treinamento dos usuários-chave e um Analista de IA da Atlantyx dedicado ao suporte para esclarecer dúvidas durante toda a POC` : tipo_documento === 'piloto' ? 'Piloto com usuários reais e escopo reduzido' : 'Projeto completo'}
PRAZO DESEJADO: ${meses ? meses + ' meses' : 'não informado'}
${cat ? 'PRODUTOS ATLANTYX QUE PODEM COMPOR A SOLUÇÃO (use se fizer sentido):\n' + cat + '\n' : ''}
BRIEFING:
${String(briefing).substring(0, 8000)}

Estrutura: ## Objetivo · ## Contexto e problema · ## Solução proposta · ## Entregáveis · ## Dentro do escopo · ## Fora do escopo · ## Fases sugeridas (siga o roadmap Atlantyx: entendimento, planejamento, especificação, arquitetura, protótipo, construção, testes, homologação, TREINAMENTO, implantação e operação assistida, passagem de conhecimento — só as que fizerem sentido) · ## Premissas · ## Responsabilidades do cliente${tipo_documento === 'poc' ? ' · ## Critérios de sucesso' : ''} · ## Pontos a confirmar com o cliente`;
  return { escopo: await claude(sys, usr, 3500, 80000) };
}
async function escopoComplementar({ escopo, cliente, tipo_demanda, tipo_documento, estimativa } = {}) {
  if (!escopo || String(escopo).length < 30) throw new Error('Escreva o escopo antes (mín. 30 caracteres)');
  const sys = 'Você é arquiteto de soluções sênior da Atlantyx (dados, BI, engenharia de dados, IA, software sob medida e produtos próprios como o Maestro). Sugira o escopo COMPLEMENTAR que um cliente maduro esperaria e que costuma faltar: governança e qualidade de dados, segurança e LGPD, testes e homologação, documentação, treinamento e passagem de conhecimento, operação assistida, sustentação/SLA, monitoramento, adoção pelos usuários, evolução. Só o que fizer sentido para ESTE escopo. Responda APENAS JSON.';
  const usr = `CLIENTE: ${cliente || ''}\nTIPO: ${tipo_documento || 'proposta'} · ${tipo_demanda || ''}\nESCOPO ATUAL:\n${String(escopo).substring(0, 7000)}\nESTIMATIVA ATUAL: ${JSON.stringify({ fases: estimativa?.fases, entregaveis: estimativa?.entregaveis }).substring(0, 2500)}\n\nDevolva {"itens":[{"titulo":"","descricao":"o que entra, em 1-2 frases","por_que":"valor para o cliente","tipo":"essencial|recomendado|opcional","horas_estimadas":0}]} com 4 a 8 itens, essenciais primeiro.`;
  const r = json(await claude(sys, usr, 2000, 70000));
  return { itens: (r.itens || []).slice(0, 10).map(x => ({ titulo: String(x.titulo || '').substring(0, 120), descricao: String(x.descricao || '').substring(0, 500), por_que: String(x.por_que || '').substring(0, 300), tipo: ['essencial', 'recomendado', 'opcional'].includes(x.tipo) ? x.tipo : 'recomendado', horas_estimadas: num(x.horas_estimadas) || null })) };
}
async function apresentacaoGerar({ proposta } = {}) {
  const pr = proposta || {}, d = pr.dados || {}, f = (pr.analise?.formatos || []).find(x => x.formato === pr.formato) || pr.analise?.formatos?.[0] || null;
  const sys = `Você monta a APRESENTAÇÃO DA SOLUÇÃO da Atlantyx para o cliente (PowerPoint executivo). Português do Brasil, frases curtas (máx. 14 palavras por tópico, máx. 5 tópicos por slide), foco no problema e no resultado de negócio. Nunca invente números: use só os fornecidos. Responda APENAS JSON.`;
  const usr = `CLIENTE: ${pr.cliente || ''} | CONTATO: ${pr.contato || ''} | TÍTULO: ${pr.titulo || ''}
TIPO: ${d.tipo_documento === 'poc' ? 'POC de ' + (d.poc?.semanas || 6) + ' semanas — critérios de sucesso: ' + (d.poc?.criterios || 'a definir com o cliente') : d.tipo_documento === 'piloto' ? 'Piloto' : 'Projeto completo'}
BRIEFING DO PROJETO: ${String(d.briefing || '').substring(0, 2500)}
ESCOPO: ${String(d.escopo || '').substring(0, 6000)}
ESCOPO COMPLEMENTAR INCLUÍDO: ${JSON.stringify((d.complementar || []).filter(x => x.decisao === 'incluir').map(x => x.titulo + ': ' + x.descricao))}
OPCIONAIS: ${JSON.stringify((d.complementar || []).filter(x => x.decisao === 'opcional').map(x => x.titulo + ': ' + x.descricao))}
ESTIMATIVA: ${JSON.stringify({ meses: pr.analise?.entrada?.meses || d.meses, fases: d.estimativa?.fases, entregaveis: d.estimativa?.entregaveis, premissas: d.estimativa?.premissas, riscos: d.estimativa?.riscos, perfis: (d.perfis || []).map(x => x.perfil + ' (' + x.horas + 'h)') }).substring(0, 4000)}
INVESTIMENTO: ${f ? JSON.stringify({ formato: f.nome, valor_total: f.valor_total, mensal: f.valor_mensal_medio, desconto_pct: f.desconto_aplicado_pct || 0, poc_sem_custo_por_ser_cliente: !!f.poc_cortesia && !(f.valor_total > 0), credito_no_contrato_dias: f.formato === 'poc' && !f.poc_cortesia ? (d.poc?.credito_dias || 60) : null, desconto_cliente_se_fechar: f.condicao_cliente || null, faturamento: (f.cronograma || []).map(c => c.mes + ' ' + c.desc + ' R$ ' + c.valor) }) : 'ainda não calculado'}
Devolva {"titulo":"","subtitulo":"","slides":[{"tipo":"contexto|desafio|solucao|como_funciona|escopo|complementar|resultados|equipe|riscos|investimento|proximos_passos","titulo":"","pontos":["..."]}],
"cronograma":[{"fase":"","mes_inicio":1,"mes_fim":1,"entregas":"curto"}],"marcos":[{"mes":1,"nome":""}],"responsabilidades":[{"atividade":"","atlantyx":"R|A|C|I","cliente":"R|A|C|I"}]}
Responsabilidades: 8 a 12 linhas em RACI (R executa, A aprova, C consultado, I informado), Atlantyx × cliente, cobrindo dados/acessos, ponto focal, usuários-chave, homologação e aprovações.
Inclua nesta ordem: contexto, desafio, solução, como funciona, escopo, ${(d.complementar || []).some(x => x.decisao) ? 'escopo complementar e opcionais, ' : ''}resultados esperados, equipe, riscos e mitigação, investimento (só os números dados), próximos passos. O cronograma deve cobrir o prazo total em meses${d.tipo_documento === 'poc' ? ' (use semanas convertidas em meses, mínimo 1)' : ''}, usando as fases da estimativa quando existirem. Regras do cronograma: de 3 a 8 fases; mes_inicio e mes_fim são números inteiros de 1 até o prazo total; fases podem se sobrepor; "entregas" com no máximo 6 palavras; nomes de fase com no máximo 4 palavras; marcos (até 5) com nome de no máximo 3 palavras. Pontos dos slides: frases completas, curtas e concretas (máx. 14 palavras), sem ponto final.`;
  const r = json(await claude(sys, usr, 4000, 85000));
  return { apresentacao: { ...r, meses: pr.analise?.entrada?.meses || d.meses || null, inicio: pr.analise?.entrada?.inicio || d.inicio || null, investimento: f ? { formato: f.nome, valor_total: f.valor_total, mensal: f.valor_mensal_medio, desconto_pct: f.desconto_aplicado_pct || 0, cronograma: f.cronograma, poc_cortesia: !!f.poc_cortesia, credito_dias: f.formato === 'poc' && !f.poc_cortesia ? (d.poc?.credito_dias || 60) : null, condicao_cliente: f.condicao_cliente || null } : null } };
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


// ═══════════════════════ v3.282 — NOVA OPORTUNIDADE POR VOZ → HUBSPOT ═══════════════════════
// O vendedor grava/dita a oportunidade; a IA separa empresa, contato e negócio; o usuário confere e só então
// o sistema cria (ou reaproveita) empresa e contato no HubSpot, cria o negócio ligado aos dois e guarda o relato como nota.
async function _hs(caminho, metodo = 'GET', corpo) {
  if (!process.env.HUBSPOT_TOKEN) throw new Error('HUBSPOT_TOKEN não configurado no Vercel');
  const r = await fetch('https://api.hubapi.com' + caminho, { method: metodo, headers: { Authorization: 'Bearer ' + process.env.HUBSPOT_TOKEN, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('HubSpot ' + r.status + ': ' + (d.message || 'erro'));
  return d;
}
const _nrm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(ltda|s\.?a\.?|me|eireli|epp|grupo|cia)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
async function _hsPipelines() {
  const d = await _hs('/crm/v3/pipelines/deals');
  return (d.results || []).map(p => ({ id: p.id, nome: p.label, etapas: (p.stages || []).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
    .filter(e => e.metadata?.isClosed !== 'true').map(e => ({ id: e.id, nome: e.label, probabilidade: e.metadata?.probability != null ? Number(e.metadata.probability) : null })) }));
}
async function _hsBuscarEmpresa(nome, dominio) {
  const filtros = []; if (dominio) filtros.push({ filters: [{ propertyName: 'domain', operator: 'EQ', value: String(dominio).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') }] });
  if (nome) filtros.push({ filters: [{ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: String(nome).split(/\s+/).sort((a, b) => b.length - a.length)[0] }] });
  if (!filtros.length) return [];
  const d = await _hs('/crm/v3/objects/companies/search', 'POST', { filterGroups: filtros, properties: ['name', 'domain', 'city'], limit: 10 });
  const alvo = _nrm(nome);
  return (d.results || []).map(c => ({ id: c.id, nome: c.properties?.name || '', dominio: c.properties?.domain || '', cidade: c.properties?.city || '',
    exato: !!alvo && (_nrm(c.properties?.name) === alvo || _nrm(c.properties?.name).includes(alvo) || alvo.includes(_nrm(c.properties?.name))) }))
    .sort((a, b) => b.exato - a.exato).slice(0, 5);
}
async function _hsBuscarContato(c = {}) {
  const grupos = [];
  if (c.email) grupos.push({ filters: [{ propertyName: 'email', operator: 'EQ', value: String(c.email).toLowerCase() }] });
  const [pn, ...resto] = String(c.nome || '').trim().split(/\s+/);
  if (pn && resto.length) grupos.push({ filters: [{ propertyName: 'firstname', operator: 'EQ', value: pn }, { propertyName: 'lastname', operator: 'EQ', value: resto.join(' ') }] });
  if (!grupos.length) return [];
  const d = await _hs('/crm/v3/objects/contacts/search', 'POST', { filterGroups: grupos.slice(0, 3), properties: ['firstname', 'lastname', 'email', 'phone', 'jobtitle', 'company'], limit: 5 });
  return (d.results || []).map(x => ({ id: x.id, nome: [x.properties?.firstname, x.properties?.lastname].filter(Boolean).join(' '), email: x.properties?.email || '', telefone: x.properties?.phone || '', cargo: x.properties?.jobtitle || '', empresa: x.properties?.company || '' }));
}
async function oportVozInicio() {
  if (!process.env.HUBSPOT_TOKEN) return { hubspot: false, pipelines: [] };
  return { hubspot: true, pipelines: await _hsPipelines() };
}
async function oportVozExtrair({ texto } = {}) {
  const t = String(texto || '').trim(); if (t.length < 15) throw new Error('Fale ou escreva um pouco mais sobre a oportunidade');
  const pls = process.env.HUBSPOT_TOKEN ? await _hsPipelines().catch(() => []) : [];
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const sys = `Você é assistente comercial da Atlantyx (dados, BI, engenharia de dados e IA, B2B). Recebe o relato falado de um vendedor sobre uma oportunidade (transcrição de voz, pode ter erros de reconhecimento) e organiza para cadastrar no CRM. Hoje é ${hoje}. Responda SÓ JSON válido:
{"empresa":{"nome":"","dominio":"","cidade":""},"contato":{"nome":"","cargo":"","email":"","telefone":""},"negocio":{"titulo":"curto: Empresa — o que querem","descricao":"2 a 4 linhas com a necessidade","valor":0,"data_fechamento":"AAAA-MM-DD ou vazio","etapa":"nome EXATO de uma etapa da lista ou vazio","solucao":"tipo de solução"},"proximos_passos":["..."],"faltando":["o que o vendedor não disse e é importante"]}
Regras: não invente dados (e-mail, telefone, valor) — deixe vazio/0 se não foi dito; valores falados como "150 mil" = 150000, "1,2 milhão" = 1200000; datas relativas ("fim do ano", "dezembro", "em 3 meses") viram data concreta a partir de hoje; telefone só dígitos com DDD; corrija nomes de empresas conhecidas quando a transcrição errar óbvio.`;
  const usr = 'ETAPAS DO FUNIL NO HUBSPOT: ' + JSON.stringify(pls.map(p => ({ pipeline: p.nome, etapas: p.etapas.map(e => e.nome) }))) + '\n\nRELATO DO VENDEDOR:\n' + t.substring(0, 6000);
  const j = json(await claude(sys, usr, 1500, 45000));
  // casa a etapa sugerida com o id do HubSpot
  let pipeline = null, etapa = null; const alvo = _nrm(j.negocio?.etapa);
  for (const p of pls) { const e = p.etapas.find(x => alvo && _nrm(x.nome) === alvo) || null; if (e) { pipeline = p.id; etapa = e.id; break; } }
  if (!pipeline && pls[0]) { pipeline = pls[0].id; etapa = pls[0].etapas[0]?.id || null; }
  const [empresas, contatos] = process.env.HUBSPOT_TOKEN ? await Promise.all([_hsBuscarEmpresa(j.empresa?.nome, j.empresa?.dominio).catch(() => []), _hsBuscarContato(j.contato || {}).catch(() => [])]) : [[], []];
  return { extraido: j, pipeline, etapa, existentes: { empresas, contatos } };
}
async function oportVozCriar(p = {}, usuario) {
  const E = p.empresa || {}, C = p.contato || {}, N = p.negocio || {};
  if (!String(E.nome || '').trim() && !p.empresa_id) throw new Error('Informe a empresa');
  if (!String(N.titulo || '').trim()) throw new Error('Informe o título do negócio');
  if (!p.pipeline || !p.etapa) throw new Error('Escolha o funil e a etapa do HubSpot');
  const feito = { empresa: null, contato: null, negocio: null, nota: null, avisos: [] };
  // 1) empresa: reaproveita a escolhida; senão cria
  let empresaId = p.empresa_id || null;
  if (!empresaId) { const c = await _hs('/crm/v3/objects/companies', 'POST', { properties: { name: E.nome.trim(), ...(E.dominio ? { domain: String(E.dominio).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') } : {}), ...(E.cidade ? { city: E.cidade } : {}) } });
    empresaId = c.id; feito.empresa = { id: c.id, criada: true }; } else feito.empresa = { id: empresaId, criada: false };
  // 2) contato (opcional): reaproveita o escolhido; senão cria se tiver nome ou e-mail
  let contatoId = p.contato_id || null;
  if (!contatoId && (String(C.nome || '').trim() || String(C.email || '').trim())) {
    const [pn, ...resto] = String(C.nome || '').trim().split(/\s+/);
    try { const c = await _hs('/crm/v3/objects/contacts', 'POST', { properties: { firstname: pn || '', lastname: resto.join(' '), ...(C.email ? { email: String(C.email).toLowerCase() } : {}), ...(C.telefone ? { phone: C.telefone } : {}), ...(C.cargo ? { jobtitle: C.cargo } : {}), company: E.nome || '' } });
      contatoId = c.id; feito.contato = { id: c.id, criado: true }; }
    catch (e) { if (/409|already exists|existe/i.test(e.message)) { const ex = await _hsBuscarContato(C).catch(() => []); if (ex[0]) { contatoId = ex[0].id; feito.contato = { id: contatoId, criado: false }; } } if (!contatoId) feito.avisos.push('Contato não criado: ' + e.message); }
  } else if (contatoId) feito.contato = { id: contatoId, criado: false };
  if (contatoId && empresaId) await _hs(`/crm/v4/objects/contacts/${contatoId}/associations/default/companies/${empresaId}`, 'PUT').catch(e => feito.avisos.push('Ligação contato × empresa: ' + e.message));
  // 3) negócio ligado à empresa e ao contato
  const props = { dealname: N.titulo.trim().substring(0, 200), pipeline: p.pipeline, dealstage: p.etapa, ...(Number(N.valor) > 0 ? { amount: String(Math.round(Number(N.valor) * 100) / 100) } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(N.data_fechamento || '') ? { closedate: N.data_fechamento + 'T12:00:00.000Z' } : {}), ...(N.descricao ? { description: String(N.descricao).substring(0, 5000) } : {}) };
  const d = await _hs('/crm/v3/objects/deals', 'POST', { properties: props });
  feito.negocio = { id: d.id };
  await _hs(`/crm/v4/objects/deals/${d.id}/associations/default/companies/${empresaId}`, 'PUT').catch(e => feito.avisos.push('Ligação negócio × empresa: ' + e.message));
  if (contatoId) await _hs(`/crm/v4/objects/deals/${d.id}/associations/default/contacts/${contatoId}`, 'PUT').catch(e => feito.avisos.push('Ligação negócio × contato: ' + e.message));
  // 4) o relato e os próximos passos viram nota do negócio
  const corpo = `<p><b>Oportunidade registrada por voz no Atlantyx OS</b>${usuario ? ' por ' + String(usuario).replace(/</g, '') : ''}</p>` + (N.descricao ? `<p>${String(N.descricao).replace(/</g, '&lt;')}</p>` : '')
    + ((p.proximos_passos || []).length ? '<p><b>Próximos passos</b><br>' + p.proximos_passos.map(x => '• ' + String(x).replace(/</g, '&lt;')).join('<br>') + '</p>' : '')
    + (p.texto ? `<p><b>Relato do vendedor</b><br>${String(p.texto).substring(0, 6000).replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` : '');
  try { const n = await _hs('/crm/v3/objects/notes', 'POST', { properties: { hs_note_body: corpo, hs_timestamp: new Date().toISOString() } }); feito.nota = { id: n.id };
    await _hs(`/crm/v4/objects/notes/${n.id}/associations/default/deals/${d.id}`, 'PUT').catch(() => {}); } catch (e) { feito.avisos.push('Nota não criada: ' + e.message); }
  let portal = null; try { portal = (await _hs('/account-info/v3/details')).portalId; } catch (_) {}
  if (portal) feito.link = `https://app.hubspot.com/contacts/${portal}/record/0-3/${d.id}`;
  return feito;
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
    base_listar: () => sqlRun(async sql => ({ base: (await sql`SELECT id, arquivo, cliente, data_ref, resultado, formato, valor_total, extraido, criado_em FROM propostas_base ORDER BY criado_em DESC LIMIT 200`)
      .map(b => { let x = b.extraido; if (typeof x === 'string') { try { x = JSON.parse(x); } catch (_) { x = {}; } } x = x || {}; // v3.43: lista leve (só o que a tabela mostra)
        return { ...b, extraido: { tipo_documento: x.tipo_documento || '', secoes: (x.secoes || []).slice(0, 30), rate_card: (x.rate_card || []).map(r => ({ perfil: r.perfil })), licoes: String(x.licoes || '').substring(0, 300) } }; }) })),
    base_resultado: () => sqlRun(async sql => { await sql`UPDATE propostas_base SET resultado = ${payload.resultado} WHERE id = ${payload.id}`; return { ok: true }; }),
    base_excluir: () => sqlRun(async sql => { await sql`DELETE FROM propostas_base WHERE id = ${payload.id}`; return { ok: true }; }),
    escopos_listar: async () => ({ escopos: await escoposProduto() }), // v3.365
    escopos_salvar: () => escoposSalvar(payload),
    escopo_extrair: () => escopoExtrair(payload),
    escopo_gerar: () => escopoGerar(payload),
    escopo_briefing: () => escopoBriefing(payload),
    escopo_complementar: () => escopoComplementar(payload), // v3.366
    apresentacao_gerar: () => apresentacaoGerar(payload),
    padrao: () => padrao({}),
    padrao_regerar: () => padrao({ regerar: true }),
    estimar: () => estimar(payload),
    analisar: () => analisar(base, payload),
    redigir: () => redigir(payload),
    cliente_checar: () => clienteChecar(payload),
    prop_chat: () => propChat(payload),
    prop_salvar: () => propSalvar(payload),
    prop_listar: () => sqlRun(async sql => ({ propostas: await sql`SELECT id, numero, cliente, contato, titulo, status, formato, valor_total, valor_mensal, meses, margem_pct, motivo_resultado, projeto_id, criado_em, enviada_em, fechada_em, atualizado_em, documento->>'validade_dias' AS validade_dias FROM propostas ORDER BY atualizado_em DESC LIMIT 300` })),
    prop_obter: () => sqlRun(async sql => ({ proposta: (await sql`SELECT * FROM propostas WHERE id = ${payload.id}`)[0] || null })),
    prop_excluir: () => sqlRun(async sql => { await sql`DELETE FROM propostas WHERE id = ${payload.id}`; return { ok: true }; }),
    prop_status: () => propStatus(payload),
    prop_converter: () => propConverter(base, payload),
    painel: () => painel(base, { forcar: !!payload.forcar }),
    margens: () => margens(),
    coach: () => coach(base, payload),
    premissas: () => premissas(),
    premissas_salvar: async () => { await cfgSet('vendas_premissas', { ...((await cfgGet('vendas_premissas')) || {}), ...(payload.premissas || {}) }); return premissas(); },
    estrategia_sugerir: () => estrategiaSugerir(base, payload),
    estrategia_salvar: () => sqlRun(async sql => { if (!String(payload.texto || '').trim()) throw new Error('Escreva a estratégia'); const id = payload.id || novoId('est');
      await sql`INSERT INTO vendas_estrategias (id, periodo_tipo, periodo_ref, titulo, texto, metas, atualizado_em) VALUES (${id}, ${payload.periodo_tipo || 'mensal'}, ${payload.periodo_ref || null}, ${payload.titulo || null}, ${payload.texto}, ${JSON.stringify(payload.metas || {})}, NOW())
        ON CONFLICT (id) DO UPDATE SET periodo_tipo = EXCLUDED.periodo_tipo, periodo_ref = EXCLUDED.periodo_ref, titulo = EXCLUDED.titulo, texto = EXCLUDED.texto, metas = EXCLUDED.metas, atualizado_em = NOW()`; return { id }; }),
    estrategia_listar: () => sqlRun(async sql => ({ estrategias: await sql`SELECT * FROM vendas_estrategias ORDER BY atualizado_em DESC LIMIT 50` })),
    oport_voz_inicio: () => oportVozInicio(), // v3.282
    oport_voz_extrair: () => oportVozExtrair(payload),
    oport_voz_criar: () => oportVozCriar(payload, req.usuario || null),
    oport_voz_buscar: async () => ({ empresas: await _hsBuscarEmpresa(payload.nome, payload.dominio), contatos: await _hsBuscarContato(payload.contato || {}) }),
    estrategia_excluir: () => sqlRun(async sql => { await sql`DELETE FROM vendas_estrategias WHERE id = ${payload.id}`; return { ok: true }; }),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try { return res.status(200).json({ success: true, action, ...(await acoes[action]()) }); }
  catch (e) { console.error('[vendas]', action, e.message); return res.status(500).json({ success: false, error: e.message }); }
}
export { calcularFormatos, margens };

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'vendas');
