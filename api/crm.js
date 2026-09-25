
// v2.81: servidor SMTP configurável — Gmail, HostGator (cPanel) ou outro.
//   EMAIL_SMTP_HOST  (padrão: smtp.gmail.com se o usuário for @gmail; senão mail.<domínio do e-mail>)
//   EMAIL_SMTP_PORT  (padrão 465 = SSL; 587 = STARTTLS)
//   EMAIL_SMTP_TLS_RELAXADO=1  → aceita certificado que não bate com o host (comum em hospedagem compartilhada)
function _smtpConfig(user, pass) {
  const dom = String(user || '').split('@')[1] || '';
  const host = process.env.EMAIL_SMTP_HOST || (/gmail\.com$/i.test(dom) ? 'smtp.gmail.com' : (dom ? 'mail.' + dom : 'smtp.gmail.com'));
  const port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
  return { host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 30000,
    ...(process.env.EMAIL_SMTP_TLS_RELAXADO === '1' ? { tls: { rejectUnauthorized: false } } : {}) };
}
// api/crm.js — v1.96
// Visão unificada dos clientes: HubSpot (CRM oficial) + leads capturados + prospecção C-Level.
// As três bases se sobrepõem, então a tela mostra de onde cada registro veio e junta os duplicados.

let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  return _sql;
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(ltda|s\.?a\.?|me|eireli|epp|do brasil|brasil)\b/g, '').replace(/[^a-z0-9]/g, '').trim();

// ── HubSpot ──
async function hubspotClientes({ limite = 200 } = {}) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return { clientes: [], erro: 'HUBSPOT_TOKEN não configurada', configurado: false };
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const out = { clientes: [], negocios: [], configurado: true };

  // Empresas
  try {
    const props = 'name,domain,industry,city,state,phone,numberofemployees,annualrevenue,lifecyclestage,hs_lastmodifieddate,createdate';
    const r = await fetch(`https://api.hubapi.com/crm/v3/objects/companies?limit=${Math.min(limite, 100)}&properties=${props}`, { headers });
    if (!r.ok) {
      const t = await r.text();
      return { clientes: [], erro: `HubSpot HTTP ${r.status}: ${t.substring(0, 160)}`, configurado: true };
    }
    const d = await r.json();
    out.clientes = (d.results || []).map(c => {
      const p = c.properties || {};
      return {
        id: c.id, fonte: 'hubspot', tipo: 'empresa',
        empresa: p.name, dominio: p.domain, setor: p.industry,
        cidade: p.city, uf: p.state, telefone: p.phone,
        funcionarios: p.numberofemployees ? parseInt(p.numberofemployees) : null,
        receita_anual: p.annualrevenue ? parseFloat(p.annualrevenue) : null,
        estagio: p.lifecyclestage,
        criado_em: p.createdate ? String(p.createdate).substring(0, 10) : null,
        atualizado_em: p.hs_lastmodifieddate ? String(p.hs_lastmodifieddate).substring(0, 10) : null,
      };
    });
  } catch (e) { return { clientes: [], erro: 'HubSpot: ' + e.message, configurado: true }; }

  // Negócios abertos, para saber o que está em jogo com cada cliente
  try {
    const r2 = await fetch('https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,closedate,pipeline&associations=companies', { headers });
    if (r2.ok) {
      const d2 = await r2.json();
      out.negocios = (d2.results || []).map(n => {
        const p = n.properties || {};
        const empId = n.associations?.companies?.results?.[0]?.id || null;
        return { id: n.id, empresa_id: empId, nome: p.dealname,
          valor: p.amount ? parseFloat(p.amount) : 0, estagio: p.dealstage,
          fechamento: p.closedate ? String(p.closedate).substring(0, 10) : null };
      });
    }
  } catch (_) {}
  return out;
}

// ── Bases locais ──
async function leadsLocais() {
  const sql = await getSql();
  const out = [];
  try {
    const rows = await sql`SELECT id, nome, empresa, cargo, setor, score, data, criado_em
      FROM leads ORDER BY criado_em DESC LIMIT 300`;
    rows.forEach(l => {
      const extra = (typeof l.data === 'object' && l.data) || {};
      out.push({ id: 'lead_' + l.id, fonte: 'captura', tipo: 'lead',
        empresa: l.empresa, contato: l.nome, cargo: l.cargo, setor: l.setor,
        email: extra.email || null, telefone: extra.phone || extra.telefone || null,
        score: l.score, origem: extra.source || extra.origem || null,
        criado_em: l.criado_em ? String(l.criado_em).substring(0, 10) : null });
    });
  } catch (_) {}
  try {
    const rows = await sql`SELECT id, empresa, contato_nome, cargo, email, telefone, cidade, uf,
        setor, status, intencao, criado_em FROM out_leads ORDER BY atualizado_em DESC LIMIT 300`;
    rows.forEach(l => out.push({ id: 'out_' + l.id, fonte: 'prospecção', tipo: 'c-level',
      empresa: l.empresa, contato: l.contato_nome, cargo: l.cargo, email: l.email,
      telefone: l.telefone, cidade: l.cidade, uf: l.uf, setor: l.setor,
      status: l.status, intencao: l.intencao,
      criado_em: l.criado_em ? String(l.criado_em).substring(0, 10) : null }));
  } catch (_) {}
  return out;
}

// Clientes que já faturam — vêm dos termos, e são os mais importantes da lista
async function clientesFaturados() {
  const sql = await getSql();
  try {
    const rows = await sql`SELECT contratante AS empresa,
        COUNT(*)::int AS termos,
        SUM(COALESCE(valor_total_termo,0))::numeric AS valor_total,
        MAX(criado_em) AS ultimo
      FROM termos_faturamento WHERE contratante IS NOT NULL AND contratante <> ''
      GROUP BY contratante ORDER BY valor_total DESC`;
    return rows.map(r => ({ empresa: r.empresa, termos: r.termos,
      valor_total: Math.round(parseFloat(r.valor_total || 0) * 100) / 100,
      ultimo: r.ultimo ? String(r.ultimo).substring(0, 10) : null }));
  } catch (_) { return []; }
}

// ── Visão unificada ──
async function clientesListar({ fonte, busca, apenas_clientes = false } = {}) {
  const [hs, locais, faturados] = await Promise.all([
    hubspotClientes({}), leadsLocais(), clientesFaturados(),
  ]);

  const mapa = new Map();     // chave = nome normalizado da empresa
  const add = (reg) => {
    const chave = norm(reg.empresa) || ('sem_' + reg.id);
    if (!mapa.has(chave)) {
      mapa.set(chave, { ...reg, fontes: [reg.fonte], contatos: [], negocios: [],
        faturamento: null, registros: 1 });
    } else {
      const e = mapa.get(chave);
      if (!e.fontes.includes(reg.fonte)) e.fontes.push(reg.fonte);
      e.registros++;
      // completa o que estiver faltando, sem sobrescrever
      ['setor','cidade','uf','telefone','dominio','email','cargo','estagio','status','intencao'].forEach(k => {
        if (!e[k] && reg[k]) e[k] = reg[k];
      });
      if (reg.contato && !e.contatos.some(c => c.nome === reg.contato)) {
        e.contatos.push({ nome: reg.contato, cargo: reg.cargo, email: reg.email, fonte: reg.fonte });
      }
    }
    const e = mapa.get(chave);
    if (reg.contato && !e.contatos.some(c => c.nome === reg.contato)) {
      e.contatos.push({ nome: reg.contato, cargo: reg.cargo, email: reg.email, fonte: reg.fonte });
    }
  };

  (hs.clientes || []).forEach(add);
  locais.forEach(add);

  // Negócios do HubSpot
  (hs.negocios || []).forEach(n => {
    const emp = (hs.clientes || []).find(c => c.id === n.empresa_id);
    if (!emp) return;
    const e = mapa.get(norm(emp.empresa));
    if (e) e.negocios.push({ nome: n.nome, valor: n.valor, estagio: n.estagio, fechamento: n.fechamento });
  });

  // Faturamento real — quem já é cliente de fato
  faturados.forEach(f => {
    const chave = norm(f.empresa);
    if (!mapa.has(chave)) {
      mapa.set(chave, { id: 'fat_' + chave, empresa: f.empresa, fonte: 'faturamento',
        fontes: ['faturamento'], contatos: [], negocios: [], registros: 1 });
    }
    const e = mapa.get(chave);
    if (!e.fontes.includes('faturamento')) e.fontes.push('faturamento');
    e.faturamento = { termos: f.termos, valor_total: f.valor_total, ultimo: f.ultimo };
  });

  let lista = [...mapa.values()].map(c => ({
    ...c,
    valor_negocios: Math.round((c.negocios || []).reduce((s, n) => s + (n.valor || 0), 0) * 100) / 100,
    e_cliente: !!c.faturamento,
    qtd_contatos: (c.contatos || []).length,
  }));

  if (apenas_clientes) lista = lista.filter(c => c.e_cliente);
  if (fonte) lista = lista.filter(c => (c.fontes || []).includes(fonte));
  if (busca) {
    const b = norm(busca);
    lista = lista.filter(c => norm(c.empresa).includes(b)
      || (c.contatos || []).some(x => norm(x.nome).includes(b))
      || norm(c.setor || '').includes(b));
  }

  // Clientes que faturam primeiro, depois por valor de negócio
  lista.sort((a, b) => (b.e_cliente - a.e_cliente)
    || ((b.faturamento?.valor_total || 0) - (a.faturamento?.valor_total || 0))
    || (b.valor_negocios - a.valor_negocios)
    || String(a.empresa || '').localeCompare(String(b.empresa || '')));

  const clientes = lista.filter(c => c.e_cliente);
  return {
    clientes: lista,
    resumo: {
      total: lista.length,
      clientes_ativos: clientes.length,
      prospects: lista.length - clientes.length,
      faturamento_total: Math.round(clientes.reduce((s, c) => s + (c.faturamento?.valor_total || 0), 0) * 100) / 100,
      pipeline_hubspot: Math.round(lista.reduce((s, c) => s + (c.valor_negocios || 0), 0) * 100) / 100,
      por_fonte: {
        hubspot: lista.filter(c => c.fontes.includes('hubspot')).length,
        captura: lista.filter(c => c.fontes.includes('captura')).length,
        prospeccao: lista.filter(c => c.fontes.includes('prospecção')).length,
        faturamento: lista.filter(c => c.fontes.includes('faturamento')).length,
      },
      em_mais_de_uma_fonte: lista.filter(c => c.fontes.length > 1).length,
    },
    hubspot: { configurado: hs.configurado, erro: hs.erro || null, total: (hs.clientes || []).length },
  };
}

// ═══ v1.97: MAPA DE RELACIONAMENTO — organograma de atuação comercial por cliente ═══
// Três camadas:
//   'venda'      — conhecemos e já vendemos para essa pessoa
//   'conhecido'  — conhecemos mas ainda não vendemos
//   'potencial'  — não conhecemos; é quem falta mapear (pode ser sugerido pela IA)
async function mapaGarantirTabela(sql) {
  await sql`CREATE TABLE IF NOT EXISTS crm_mapa_contatos (
    id TEXT PRIMARY KEY,
    cliente TEXT NOT NULL,
    nome TEXT,
    cargo TEXT,
    area TEXT,
    camada TEXT DEFAULT 'potencial',
    reporta_para TEXT,
    email TEXT, telefone TEXT, linkedin TEXT,
    influencia TEXT,          -- decisor | influenciador | usuario | gatekeeper
    observacao TEXT,
    origem TEXT DEFAULT 'manual',
    pos_x NUMERIC, pos_y NUMERIC,
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mapa_cliente ON crm_mapa_contatos(cliente)`;
}
function novoIdMapa() { return 'mc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function mapaListar({ cliente } = {}) {
  const sql = await getSql();
  await mapaGarantirTabela(sql);
  const rows = cliente
    ? await sql`SELECT * FROM crm_mapa_contatos WHERE cliente = ${cliente} ORDER BY camada, cargo`
    : await sql`SELECT * FROM crm_mapa_contatos ORDER BY cliente, camada`;
  const contatos = rows.map(r => ({ ...r,
    pos_x: r.pos_x != null ? parseFloat(r.pos_x) : null,
    pos_y: r.pos_y != null ? parseFloat(r.pos_y) : null }));
  const porCamada = { venda: 0, conhecido: 0, potencial: 0 };
  contatos.forEach(c => { if (porCamada[c.camada] != null) porCamada[c.camada]++; });
  return { contatos, total: contatos.length, por_camada: porCamada,
    clientes: [...new Set(contatos.map(c => c.cliente))] };
}

async function mapaSalvar(p = {}) {
  if (!p.cliente) throw new Error('cliente obrigatório');
  if (!p.nome && !p.cargo) throw new Error('informe ao menos o nome ou o cargo');
  const sql = await getSql();
  await mapaGarantirTabela(sql);
  const id = p.id || novoIdMapa();
  const camada = ['venda', 'conhecido', 'potencial'].includes(p.camada) ? p.camada : 'potencial';
  await sql`INSERT INTO crm_mapa_contatos (id, cliente, nome, cargo, area, camada, reporta_para,
      email, telefone, linkedin, influencia, observacao, origem, pos_x, pos_y, atualizado_em)
    VALUES (${id}, ${p.cliente}, ${p.nome || null}, ${p.cargo || null}, ${p.area || null}, ${camada},
      ${p.reporta_para || null}, ${p.email || null}, ${p.telefone || null}, ${p.linkedin || null},
      ${p.influencia || null}, ${p.observacao || null}, ${p.origem || 'manual'},
      ${p.pos_x ?? null}, ${p.pos_y ?? null}, NOW())
    ON CONFLICT (id) DO UPDATE SET cliente=EXCLUDED.cliente, nome=EXCLUDED.nome, cargo=EXCLUDED.cargo,
      area=EXCLUDED.area, camada=EXCLUDED.camada, reporta_para=EXCLUDED.reporta_para,
      email=EXCLUDED.email, telefone=EXCLUDED.telefone, linkedin=EXCLUDED.linkedin,
      influencia=EXCLUDED.influencia, observacao=EXCLUDED.observacao,
      pos_x=COALESCE(EXCLUDED.pos_x, crm_mapa_contatos.pos_x),
      pos_y=COALESCE(EXCLUDED.pos_y, crm_mapa_contatos.pos_y), atualizado_em=NOW()`;
  return { id };
}
async function mapaExcluir({ id }) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM crm_mapa_contatos WHERE id = ${id}`;
  return { excluido: true };
}
async function mapaPosicao({ id, x, y }) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`UPDATE crm_mapa_contatos SET pos_x = ${x}, pos_y = ${y}, atualizado_em = NOW() WHERE id = ${id}`;
  return { ok: true };
}

// IA sugere a estrutura que provavelmente existe e ainda não mapeamos
async function mapaSugerir({ cliente, setor, porte, observacao } = {}) {
  if (!cliente) throw new Error('cliente obrigatório');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const sql = await getSql();
  await mapaGarantirTabela(sql);
  const jaTemos = await sql`SELECT nome, cargo, area, camada FROM crm_mapa_contatos WHERE cliente = ${cliente}`;

  const system = `Você mapeia a estrutura de decisão de grandes empresas para uma consultoria de dados e IA (Atlantyx).
A partir do que já se conhece do cliente, sugira os CARGOS que provavelmente existem e ainda não foram mapeados —
as pessoas que precisam ser prospectadas para ampliar a conta.

REGRAS:
- Sugira CARGOS e ÁREAS, nunca nomes de pessoas. Você não tem como saber quem ocupa o cargo — inventar nome é pior que não sugerir.
- Considere o setor e o porte: uma empresa de energia tem estrutura diferente de um banco.
- Foque em quem decide, influencia ou usa soluções de dados/IA/tecnologia.
- Entre 4 e 8 sugestões. Não repita cargos que já constam como mapeados.
- Indique a quem cada um provavelmente reporta (pelo cargo) e o tipo de influência.

Devolva SOMENTE JSON:
{"sugestoes":[{"cargo":"...","area":"...","reporta_para_cargo":"... ou null","influencia":"decisor|influenciador|usuario|gatekeeper","porque":"em até 15 palavras, por que vale prospectar"}]}`;

  const user = `CLIENTE: ${cliente}
${setor ? 'Setor: ' + setor : ''}
${porte ? 'Porte: ' + porte : ''}
${observacao ? 'Contexto: ' + observacao : ''}

JÁ MAPEADOS (não repita):
${jaTemos.length ? jaTemos.map(c => `- ${c.cargo || '?'}${c.area ? ' (' + c.area + ')' : ''}${c.nome ? ' — ' + c.nome : ''} [${c.camada}]`).join('\n') : '(nenhum ainda)'}`;

  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 55000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6', max_tokens: 1200, system, messages: [{ role: 'user', content: user }] }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  let j;
  try { j = JSON.parse(String(d.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()); }
  catch { return { erro: 'A IA não devolveu JSON válido', bruto: String(d.content?.[0]?.text || '').substring(0, 400) }; }
  return { sugestoes: j.sugestoes || [], cliente,
    aviso: 'São cargos prováveis, não pessoas confirmadas. Valide antes de prospectar.' };
}

async function mapaAplicarSugestoes({ cliente, sugestoes = [] } = {}) {
  if (!cliente || !sugestoes.length) throw new Error('cliente e sugestões obrigatórios');
  const sql = await getSql();
  await mapaGarantirTabela(sql);
  // Casa "reporta_para_cargo" com quem já existe no mapa
  const existentes = await sql`SELECT id, cargo FROM crm_mapa_contatos WHERE cliente = ${cliente}`;
  const porCargo = {};
  existentes.forEach(e => { if (e.cargo) porCargo[String(e.cargo).toLowerCase().trim()] = e.id; });
  const criados = [];
  for (const s of sugestoes) {
    if (!s.cargo) continue;
    const pai = s.reporta_para_cargo ? porCargo[String(s.reporta_para_cargo).toLowerCase().trim()] || null : null;
    const id = novoIdMapa();
    await sql`INSERT INTO crm_mapa_contatos (id, cliente, cargo, area, camada, reporta_para,
        influencia, observacao, origem, atualizado_em)
      VALUES (${id}, ${cliente}, ${s.cargo}, ${s.area || null}, 'potencial', ${pai},
        ${s.influencia || null}, ${s.porque || null}, 'ia', NOW())`;
    porCargo[String(s.cargo).toLowerCase().trim()] = id;
    criados.push({ id, cargo: s.cargo });
  }
  return { criados: criados.length, contatos: criados };
}

// ═══ v2.01: BRIEFINGS DE REUNIÃO — armazenar e consultar ═══
async function briefingGarantirTabela(sql) {
  await sql`CREATE TABLE IF NOT EXISTS briefings_reuniao (
    id TEXT PRIMARY KEY,
    lead_nome TEXT, empresa TEXT, cargo TEXT, setor TEXT,
    telefone TEXT, deal_id TEXT,
    data_reuniao TEXT,
    briefing TEXT NOT NULL,
    resultado TEXT,               -- preenchido depois da reunião
    proximos_passos TEXT,
    status TEXT DEFAULT 'agendada',   -- agendada | realizada | cancelada | remarcada
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_brief_empresa ON briefings_reuniao(empresa)`;
}
function novoIdBrief() { return 'br_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

async function briefingSalvar(p = {}) {
  if (!p.briefing) throw new Error('briefing obrigatório');
  const sql = await getSql();
  await briefingGarantirTabela(sql);
  const id = p.id || novoIdBrief();
  await sql`INSERT INTO briefings_reuniao (id, lead_nome, empresa, cargo, setor, telefone, deal_id,
      data_reuniao, briefing, resultado, proximos_passos, status, atualizado_em)
    VALUES (${id}, ${p.lead_nome || null}, ${p.empresa || null}, ${p.cargo || null}, ${p.setor || null},
      ${p.telefone || null}, ${p.deal_id || null}, ${p.data_reuniao || null}, ${p.briefing},
      ${p.resultado || null}, ${p.proximos_passos || null}, ${p.status || 'agendada'}, NOW())
    ON CONFLICT (id) DO UPDATE SET lead_nome=EXCLUDED.lead_nome, empresa=EXCLUDED.empresa,
      cargo=EXCLUDED.cargo, setor=EXCLUDED.setor, telefone=EXCLUDED.telefone, deal_id=EXCLUDED.deal_id,
      data_reuniao=EXCLUDED.data_reuniao, briefing=EXCLUDED.briefing,
      resultado=COALESCE(EXCLUDED.resultado, briefings_reuniao.resultado),
      proximos_passos=COALESCE(EXCLUDED.proximos_passos, briefings_reuniao.proximos_passos),
      status=EXCLUDED.status, atualizado_em=NOW()`;
  return { id, salvo: true };
}

async function briefingListar({ empresa, busca, status, limite = 100 } = {}) {
  const sql = await getSql();
  await briefingGarantirTabela(sql);
  let rows;
  if (busca) {
    const b = '%' + busca + '%';
    rows = await sql`SELECT * FROM briefings_reuniao
      WHERE empresa ILIKE ${b} OR lead_nome ILIKE ${b} OR briefing ILIKE ${b} OR setor ILIKE ${b}
      ORDER BY criado_em DESC LIMIT ${limite}`;
  } else if (empresa) {
    rows = await sql`SELECT * FROM briefings_reuniao WHERE empresa ILIKE ${'%' + empresa + '%'}
      ORDER BY criado_em DESC LIMIT ${limite}`;
  } else if (status) {
    rows = await sql`SELECT * FROM briefings_reuniao WHERE status = ${status} ORDER BY criado_em DESC LIMIT ${limite}`;
  } else {
    rows = await sql`SELECT * FROM briefings_reuniao ORDER BY criado_em DESC LIMIT ${limite}`;
  }
  const briefings = rows.map(r => ({ ...r,
    criado_em: r.criado_em ? String(r.criado_em).substring(0, 10) : null,
    previa: String(r.briefing || '').substring(0, 160) }));
  return { briefings, total: briefings.length,
    empresas: [...new Set(briefings.map(b => b.empresa).filter(Boolean))],
    por_status: briefings.reduce((a, b) => { a[b.status || 'agendada'] = (a[b.status || 'agendada'] || 0) + 1; return a; }, {}) };
}

async function briefingGet({ id }) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await briefingGarantirTabela(sql);
  const r = await sql`SELECT * FROM briefings_reuniao WHERE id = ${id} LIMIT 1`;
  if (!r.length) throw new Error('Briefing não encontrado');
  // Histórico com a mesma empresa — contexto que ajuda na próxima conversa
  const hist = await sql`SELECT id, lead_nome, data_reuniao, status, criado_em
    FROM briefings_reuniao WHERE empresa = ${r[0].empresa} AND id <> ${id}
    ORDER BY criado_em DESC LIMIT 10`;
  return { briefing: r[0], historico_empresa: hist.map(h => ({ ...h,
    criado_em: h.criado_em ? String(h.criado_em).substring(0, 10) : null })) };
}

async function briefingExcluir({ id }) {
  if (!id) throw new Error('id obrigatório');
  const sql = await getSql();
  await sql`DELETE FROM briefings_reuniao WHERE id = ${id}`;
  return { excluido: true };
}

// ═══ v2.27: ESTRUTURA COMERCIAL — política, papéis, cadência (S1) e metas calibradas + CAC (S7) ═══
async function _cfgGet(sql, chave) {
  await sql`CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor JSONB, atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  const r = await sql`SELECT valor FROM app_config WHERE chave = ${chave} LIMIT 1`;
  return r[0]?.valor ?? null;
}
async function _cfgSet(sql, chave, valor) {
  await sql`INSERT INTO app_config (chave, valor, atualizado_em) VALUES (${chave}, ${JSON.stringify(valor)}, NOW())
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`;
}
const POLITICA_PADRAO = {
  faturamento_mensal_referencia: 0, faturamento_origem: 'manual',
  pct_investimento_comercial_marketing: 0.10, pct_split_comercial: 0.625, pct_split_marketing: 0.375,
  marketing_breakdown: { conteudo_linkedin: 0.35, trafego_pago: 0.30, materiais_venda: 0.20, seo_automacao: 0.15 },
  activity_targets_fulltime: { contatos_semana_fulltime: 250, reunioes_semana_fulltime: 15, fechamento_a_cada_dias_fulltime: 4 },
  ltv_medio: null, revisao_periodicidade: 'trimestral', data_ultima_revisao: null,
};
const PAPEIS_PADRAO = [
  { id: 'sales_ops_jr', nome: 'Estagiário(a)/Júnior Sales Ops', tipo: 'interno', horas_semana: null, foco: 'crm_cobranca_campanhas', custo_mensal: 0 },
  { id: 'hunter_1', nome: 'Agente comercial 1', tipo: 'part_time', horas_semana: null, foco: 'prospeccao_qualificacao', custo_mensal: 0 },
  { id: 'hunter_2', nome: 'Agente comercial 2', tipo: 'part_time', horas_semana: null, foco: 'prospeccao_qualificacao', custo_mensal: 0 },
  { id: 'closer_freelance', nome: 'Freelancer de contas', tipo: 'part_time_freelance', horas_semana: null, foco: 'fechamento_gestao_contas', custo_mensal: 0 },
];
const RITUAIS_PADRAO = [
  { frequencia: 'diario', nome: 'Atualização CRM', responsavel: 'hunters+closer' },
  { frequencia: 'diario', nome: 'Cobrança de pendências', responsavel: 'sales_ops_jr' },
  { frequencia: 'semanal', nome: 'Check-in comercial 15-20min', responsavel: 'ceo+equipe' },
  { frequencia: 'semanal', nome: 'Resumo funil', responsavel: 'sales_ops_jr' },
  { frequencia: 'quinzenal', nome: '1:1 freelancer', responsavel: 'ceo' },
  { frequencia: 'trimestral', nome: 'Revisão CAC e orçamento', responsavel: 'ceo' },
];

async function comercialConfigGet() {
  const sql = await getSql();
  const politica = { ...POLITICA_PADRAO, ...((await _cfgGet(sql, 'commercial_policy')) || {}) };
  const papeis = (await _cfgGet(sql, 'commercial_roles')) || PAPEIS_PADRAO;
  const rituais = (await _cfgGet(sql, 'commercial_rituals')) || RITUAIS_PADRAO;
  // Faturamento real do QuickBooks, se disponível — a política manda usar o real quando possível
  let faturamentoReal = null;
  try {
    const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
    const r = await fetch(base + '/api/financeiro', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kpis_saude', params: {} }) });
    const d = await r.json().catch(() => ({}));
    const rec = d?.kpis?.receita_mes ?? d?.receita_mes ?? d?.kpis?.receita_mensal ?? null;
    if (typeof rec === 'number' && rec > 0) faturamentoReal = Math.round(rec * 100) / 100;
  } catch (_) {}
  if (faturamentoReal && politica.faturamento_origem !== 'manual') politica.faturamento_mensal_referencia = faturamentoReal;
  return { politica, papeis, rituais, faturamento_real_qb: faturamentoReal,
    calibrado: papeis.every(p => p.horas_semana != null && p.horas_semana > 0),
    papeis_sem_horas: papeis.filter(p => !(p.horas_semana > 0)).map(p => p.nome) };
}
async function comercialConfigSalvar({ politica, papeis, rituais } = {}) {
  const sql = await getSql();
  if (politica) await _cfgSet(sql, 'commercial_policy', { ...POLITICA_PADRAO, ...politica, data_ultima_revisao: new Date().toISOString().substring(0, 10) });
  if (papeis) await _cfgSet(sql, 'commercial_roles', papeis);
  if (rituais) await _cfgSet(sql, 'commercial_rituals', rituais);
  return await comercialConfigGet();
}

// Metas calibradas por papel: meta = (horas/40) × meta_fulltime. Sem horas, não gera meta.
function _metasPorPapel(politica, papeis) {
  const t = politica.activity_targets_fulltime || POLITICA_PADRAO.activity_targets_fulltime;
  return papeis.map(p => {
    if (!(p.horas_semana > 0)) return { ...p, calibrado: false, aviso: 'pendente de calibração — informe as horas/semana' };
    const fator = p.horas_semana / 40;
    const prospecta = /prospec|hunter/.test(p.foco || '') || /hunter/.test(p.id);
    const fecha = /fecha|closer|contas/.test(p.foco || '') || /closer/.test(p.id);
    return { ...p, calibrado: true, fator: Math.round(fator * 100) / 100,
      meta_contatos_semana: prospecta ? Math.round(t.contatos_semana_fulltime * fator) : 0,
      meta_reunioes_semana: (prospecta || fecha) ? Math.round(t.reunioes_semana_fulltime * fator) : 0,
      meta_fechamento_a_cada_dias: fecha ? Math.round(t.fechamento_a_cada_dias_fulltime / fator) : null };
  });
}

// Atividade real por papel, dos últimos 7 dias
async function _atividadePorPapel(sql, papeis) {
  const out = {};
  try {
    await sql`CREATE TABLE IF NOT EXISTS comercial_atividade (
      id TEXT PRIMARY KEY, papel_id TEXT, data DATE, contatos INT DEFAULT 0, reunioes INT DEFAULT 0, fechamentos INT DEFAULT 0,
      obs TEXT, criado_em TIMESTAMPTZ DEFAULT NOW())`;
    const rows = await sql`SELECT papel_id, SUM(contatos)::int AS c, SUM(reunioes)::int AS r, SUM(fechamentos)::int AS f,
        MAX(data) AS ultimo FROM comercial_atividade WHERE data >= CURRENT_DATE - INTERVAL '7 days' GROUP BY papel_id`;
    rows.forEach(r => out[r.papel_id] = { contatos: r.c, reunioes: r.r, fechamentos: r.f, ultimo: r.ultimo ? String(r.ultimo).substring(0, 10) : null });
  } catch (_) {}
  papeis.forEach(p => { if (!out[p.id]) out[p.id] = { contatos: 0, reunioes: 0, fechamentos: 0, ultimo: null }; });
  return out;
}

async function semaforoComercial() {
  const sql = await getSql();
  const cfg = await comercialConfigGet();
  const metas = _metasPorPapel(cfg.politica, cfg.papeis);
  const ativ = await _atividadePorPapel(sql, cfg.papeis);
  const cards = metas.map(m => {
    const a = ativ[m.id] || {};
    if (!m.calibrado) return { ...m, atividade: a, farol: 'cinza', motivo: m.aviso };
    const pc = m.meta_contatos_semana ? a.contatos / m.meta_contatos_semana : null;
    const pr = m.meta_reunioes_semana ? a.reunioes / m.meta_reunioes_semana : null;
    const pior = [pc, pr].filter(x => x != null).reduce((s, x) => Math.min(s, x), 1);
    const semAtiv = !a.ultimo || (Date.now() - new Date(a.ultimo)) > 3 * 86400000;
    const farol = semAtiv ? 'vermelho' : pior >= 0.8 ? 'verde' : pior >= 0.5 ? 'amarelo' : 'vermelho';
    return { ...m, atividade: a, pct_contatos: pc != null ? Math.round(pc * 100) : null, pct_reunioes: pr != null ? Math.round(pr * 100) : null,
      farol, motivo: semAtiv ? 'sem registro de atividade há mais de 3 dias' : `${Math.round(pior * 100)}% da meta da semana` };
  });
  return { cards, calibrado: cfg.calibrado, papeis_sem_horas: cfg.papeis_sem_horas, targets_fulltime: cfg.politica.activity_targets_fulltime };
}

async function registrarAtividade({ papel_id, data, contatos = 0, reunioes = 0, fechamentos = 0, obs } = {}) {
  if (!papel_id) throw new Error('papel_id obrigatório');
  const sql = await getSql();
  await _atividadePorPapel(sql, []);   // garante a tabela
  const d = data || new Date().toISOString().substring(0, 10);
  const id = `${papel_id}_${d}`;
  await sql`INSERT INTO comercial_atividade (id, papel_id, data, contatos, reunioes, fechamentos, obs)
    VALUES (${id}, ${papel_id}, ${d}, ${parseInt(contatos)||0}, ${parseInt(reunioes)||0}, ${parseInt(fechamentos)||0}, ${obs || null})
    ON CONFLICT (id) DO UPDATE SET contatos = comercial_atividade.contatos + EXCLUDED.contatos,
      reunioes = comercial_atividade.reunioes + EXCLUDED.reunioes, fechamentos = comercial_atividade.fechamentos + EXCLUDED.fechamentos,
      obs = COALESCE(EXCLUDED.obs, comercial_atividade.obs)`;
  return { id };
}

// CAC trimestral: investimento (3 meses da política) ÷ deals fechados no HubSpot nos últimos 90 dias
async function cacTrimestral() {
  const cfg = await comercialConfigGet();
  const p = cfg.politica;
  const investimento = Math.round((p.faturamento_mensal_referencia || 0) * (p.pct_investimento_comercial_marketing || 0) * 3 * 100) / 100;
  let fechados = null, valorFechado = 0, erro = null, fonte = 'hubspot';
  const token = process.env.HUBSPOT_TOKEN;
  if (token) {
    try {
      const desde = Date.now() - 90 * 86400000;
      const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterGroups: [{ filters: [
            { propertyName: 'closedate', operator: 'GTE', value: String(desde) },
            { propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'true' } ] }],
          properties: ['dealname', 'amount', 'closedate', 'pipeline'], limit: 100 }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'HTTP ' + r.status);
      const lista = (d.results || []).filter(x => !process.env.HUBSPOT_PIPELINE_ID || x.properties?.pipeline === process.env.HUBSPOT_PIPELINE_ID);
      fechados = lista.length; valorFechado = lista.reduce((s, x) => s + (parseFloat(x.properties?.amount) || 0), 0);
    } catch (e) { erro = e.message; }
  } else erro = 'HUBSPOT_TOKEN não configurada';
  if (fechados == null) {
    // reserva: termos aprovados como proxy de novos clientes? não — cliente novo ≠ termo novo. Fica sem CAC.
    fonte = 'indisponível';
  }
  const cac = fechados ? Math.round(investimento / fechados * 100) / 100 : null;
  const ltv = p.ltv_medio || null;
  return { investimento_trimestre: investimento, novos_clientes_trimestre: fechados, valor_fechado_trimestre: Math.round(valorFechado * 100) / 100,
    cac, ltv_medio: ltv, alerta_cac: (cac != null && ltv) ? cac > ltv / 3 : null,
    ltv_pendente: !ltv, fonte, erro,
    explicacao: `CAC = (${(p.faturamento_mensal_referencia||0).toLocaleString('pt-BR')} × ${Math.round((p.pct_investimento_comercial_marketing||0)*100)}% × 3) ÷ ${fechados ?? '?'} cliente(s) fechado(s) em 90 dias` };
}

// ═══ v2.32: REUNIÃO MARCADA por campanha + TESTE PONTA A PONTA da captura ═══
async function leadMarcarReuniao({ lead_id, data_reuniao, obs } = {}) {
  if (!lead_id) throw new Error('lead_id obrigatório');
  const sql = await getSql();
  await sql`UPDATE leads SET status = 'reuniao_marcada', reuniao_marcada_em = NOW(),
    data = COALESCE(data, '{}'::jsonb) || ${JSON.stringify({ reuniao_data: data_reuniao || null, reuniao_obs: obs || null })}::jsonb WHERE id = ${lead_id}`;
  const l = (await sql`SELECT * FROM leads WHERE id = ${lead_id}`)[0];
  // alerta por e-mail com a campanha de origem
  try {
    const nodemailer = (await import('nodemailer')).default;
    const user = process.env.EMAIL_SMTP_USER || process.env.EMAIL_IMAP_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER, pass = (process.env.EMAIL_SMTP_PASS || process.env.EMAIL_IMAP_PASS || process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
    if (user && pass) {
      const t = nodemailer.createTransport(_smtpConfig(user, pass));
      await t.sendMail({ from: `Atlantyx OS <${user}>`, to: process.env.LEADS_ALERTA_PARA || process.env.RELATORIO_PAGAMENTOS_PARA || user,
        subject: `📅 Reunião marcada: ${l.nome} (${l.empresa || '—'}) — campanha ${l.campanha || l.origem || '?'}`,
        html: `<div style="font-family:Arial;max-width:560px;"><h2 style="color:#1A3A8F;">Reunião marcada</h2>
          <p style="font-size:13px;"><b>${l.nome}</b> · ${l.empresa || ''} · ${l.cargo || ''}<br>${data_reuniao ? 'Data: <b>' + data_reuniao + '</b><br>' : ''}${obs || ''}</p>
          <div style="padding:10px;background:#EAF7F1;border-left:3px solid #1FB287;font-size:13px;"><b>Veio de:</b> ${l.origem || '?'} · <b>Campanha:</b> ${l.campanha || 'não identificada'}</div>
          <p style="font-size:12px;color:#8a93a8;">Esta campanha gerou uma reunião — vale repetir o formato.</p></div>` });
    }
  } catch (e) { console.warn('[lead] alerta reunião:', e.message); }
  return { ok: true, lead: l };
}

// Funil por campanha: leads → reuniões, por origem/campanha
async function funilPorCampanha({ dias = 90 } = {}) {
  const sql = await getSql();
  const ini = new Date(Date.now() - dias * 86400000).toISOString();
  let rows = [];
  try {
    rows = await sql`SELECT COALESCE(campanha, origem, 'sem origem') AS campanha, COALESCE(origem,'?') AS origem,
        COUNT(*)::int AS leads, COUNT(*) FILTER (WHERE status = 'reuniao_marcada')::int AS reunioes,
        MAX(criado_em) AS ultimo FROM leads WHERE criado_em >= ${ini} GROUP BY 1, 2 ORDER BY leads DESC`;
  } catch (e) { return { erro: e.message, campanhas: [] }; }
  return { dias, campanhas: rows.map(r => ({ ...r, ultimo: r.ultimo ? String(r.ultimo).substring(0, 10) : null,
    taxa: r.leads ? Math.round(r.reunioes / r.leads * 100) : 0 })),
    total_leads: rows.reduce((s, r) => s + r.leads, 0), total_reunioes: rows.reduce((s, r) => s + r.reunioes, 0) };
}

// Teste ponta a ponta: envia um lead de teste pela própria API e verifica cada etapa
async function testarCaptura() {
  const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
  const out = { passos: [] };
  const marca = 'TESTE-' + Date.now().toString(36);
  try {
    const r = await fetch(base + '/api/lead-capture', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lead de Teste ' + marca, company: 'Atlantyx (teste)', title: 'CEO', email: 'teste+' + marca + '@atlantyx.local',
        source: 'teste', campaign_name: marca, utm: { source: 'teste', medium: 'auditoria', campaign: marca }, form_name: 'teste-ponta-a-ponta' }) });
    const d = await r.json().catch(() => ({}));
    out.passos.push({ etapa: 'POST /api/lead-capture', ok: r.ok && d.success, detalhe: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status}: ${JSON.stringify(d).substring(0, 160)}` });
    if (d.etapas) Object.entries(d.etapas).forEach(([k, v]) => out.passos.push({ etapa: k, ok: v === 'ok', detalhe: String(v) }));
    out.lead_id = d.lead_id || null;
  } catch (e) { out.passos.push({ etapa: 'POST /api/lead-capture', ok: false, detalhe: e.message }); }
  // confere se ficou no banco
  try {
    const sql = await getSql();
    const r = await sql`SELECT id, nome, campanha, criado_em FROM leads WHERE campanha = ${marca} LIMIT 1`;
    out.passos.push({ etapa: 'lead gravado no banco', ok: !!r.length, detalhe: r.length ? r[0].id : 'não encontrado na tabela leads' });
    if (r.length) { await sql`DELETE FROM leads WHERE campanha = ${marca}`; out.passos.push({ etapa: 'limpeza do teste', ok: true, detalhe: 'lead de teste removido' }); }
  } catch (e) { out.passos.push({ etapa: 'lead gravado no banco', ok: false, detalhe: e.message }); }
  out.veredito = out.passos.filter(p => ['POST /api/lead-capture', 'banco', 'lead gravado no banco'].includes(p.etapa)).every(p => p.ok) ? 'captura funciona' : 'captura quebrada';
  out.falhas = out.passos.filter(p => !p.ok).map(p => p.etapa + ': ' + p.detalhe);
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'método' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return res.status(400).json({ success: false, error: 'JSON inválido' }); }
  const { action, payload = {} } = body;

  const acoes = {
    clientes_listar: () => clientesListar(payload),
    comercial_config:   () => comercialConfigGet(),
    comercial_salvar:   () => comercialConfigSalvar(payload),
    comercial_semaforo: () => semaforoComercial(),
    comercial_atividade:() => registrarAtividade(payload),
    comercial_cac:      () => cacTrimestral(),
    lead_reuniao:       () => leadMarcarReuniao(payload),
    funil_campanha:     () => funilPorCampanha(payload),
    testar_captura:     () => testarCaptura(),
    brief_salvar:    () => briefingSalvar(payload),
    brief_listar:    () => briefingListar(payload),
    brief_get:       () => briefingGet(payload),
    brief_excluir:   () => briefingExcluir(payload),
    mapa_listar:     () => mapaListar(payload),
    mapa_salvar:     () => mapaSalvar(payload),
    mapa_excluir:    () => mapaExcluir(payload),
    mapa_posicao:    () => mapaPosicao(payload),
    mapa_sugerir:    () => mapaSugerir(payload),
    mapa_aplicar:    () => mapaAplicarSugestoes(payload),
    hubspot_testar:  () => hubspotClientes({ limite: 5 }),
    status:          () => ({ ok: true, modulo: 'crm', hubspot: !!process.env.HUBSPOT_TOKEN }),
  };
  if (!acoes[action]) return res.status(400).json({ success: false, error: 'Ação inválida. Disponíveis: ' + Object.keys(acoes).join(', ') });
  try {
    const r = await acoes[action]();
    return res.status(200).json({ success: true, action, ...r });
  } catch (e) {
    console.error('[ERRO crm]', action, e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
