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
