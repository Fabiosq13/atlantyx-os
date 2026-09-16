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
