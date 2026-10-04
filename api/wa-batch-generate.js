import { comGuarda } from '../lib/qa-guard.js';
// api/wa-batch-generate.js
// S2-02 + S7-05 — Busca leads do HubSpot (gerados pela prospecção) e gera mensagens em lote
// Retorna lista completa com mensagem principal + follow-up 48h prontos para revisar/enviar

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { filtro = 'novos', enviar = false, tom = 'Direto e objetivo', ultimo } = req.query;
    const chaveLote = 'wa:ultimo_lote:' + String(filtro).substring(0, 20) + ':' + String(tom).substring(0, 40);
    // v3.91 (QA-003): ao abrir a tela, devolve o último lote gerado (na hora) em vez de buscar no HubSpot e
    // chamar a IA para cada lead (10s+ e custo a cada abertura). "↻ Atualizar" gera um lote novo.
    if (ultimo) {
      const l = await kvGet(chaveLote);
      return res.status(200).json(l ? { success: true, ...l.value, salvo_em: l.em } : { success: true, vazio: true, mensagens: [] });
    }

    // ── 1. BUSCAR LEADS DO HUBSPOT gerados pela prospecção ──
    console.log(`[S2-02+S7-05] Buscando leads HubSpot, filtro: ${filtro}`);

    const leads = await buscarLeadsHubSpot(filtro);
    if (!leads.length) {
      return res.status(200).json({ success: true, total: 0, mensagens: [], aviso: 'Nenhum lead encontrado. Execute a prospecção primeiro.' });
    }

    console.log(`[S2-02+S7-05] ${leads.length} leads encontrados. Gerando mensagens em lote...`);

    // ── 2. CLAUDE — Gerar TODAS as mensagens em UMA só chamada (mais eficiente) ──
    const mensagens = await gerarMensagensEmLote(leads, tom);

    // ── 3. Se enviar=true, disparar via Z-API imediatamente ──
    let enviados = 0;
    if (enviar === 'true') {
      for (let i = 0; i < mensagens.length; i++) {
        const m = mensagens[i];
        if (m.phone) {
          try {
            await enviarWhatsApp(m.phone, m.mensagem);
            await sleep(30000); // 30s entre envios
            await atualizarHubSpot(m.deal_id, m.contact_id);
            mensagens[i].enviado = true;
            enviados++;
          } catch (e) {
            mensagens[i].enviado = false;
            mensagens[i].erro = e.message;
          }
        }
      }
    }

    const lote = {
      total: leads.length,
      enviados: enviar === 'true' ? enviados : 0,
      pendentes_aprovacao: enviar !== 'true' ? leads.length : 0,
      mensagens,
    };
    if (enviar !== 'true') await kvSet(chaveLote, lote);
    return res.status(200).json({ success: true, ...lote });

  } catch (error) {
    console.error('[ERRO wa-batch-generate]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── FUNÇÕES ──────────────────────────────────────────────────────────────────

// v3.91: último lote gerado fica no kv_store (Neon) — sem banco, só não guarda
let _sql = null;
async function getSql() {
  if (_sql) return _sql;
  if (!process.env.DATABASE_URL) return null;
  const { neon } = await import('@neondatabase/serverless');
  _sql = neon(process.env.DATABASE_URL);
  await _sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  return _sql;
}
async function kvGet(key) {
  try { const sql = await getSql(); if (!sql) return null;
    const r = await sql`SELECT value, updated_at FROM kv_store WHERE key = ${key} LIMIT 1`;
    if (!r[0] || !r[0].value) return null;
    return { value: typeof r[0].value === 'string' ? JSON.parse(r[0].value) : r[0].value, em: r[0].updated_at };
  } catch (_) { return null; }
}
async function kvSet(key, value) {
  try { const sql = await getSql(); if (!sql) return;
    await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;
  } catch (e) { console.error('[wa-batch-generate] não salvou o lote:', e.message); }
}

async function buscarLeadsHubSpot(filtro) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return [];

  // Filtros disponíveis: 'novos' (não abordados), 'todos', 'score_a', 'sem_mensagem'
  const filtros = {
    novos: [
      { propertyName: 'hs_lead_status', operator: 'IN', values: ['NEW', 'OPEN'] },
    ],
    score_a: [
      { propertyName: 'icp_score', operator: 'EQ', value: 'A' },
      { propertyName: 'hs_lead_status', operator: 'IN', values: ['NEW', 'OPEN'] },
    ],
    todos: [],
  };

  const body = {
    filterGroups: filtros[filtro] ? [{ filters: filtros[filtro] }] : [],
    properties: [
      'firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company',
      'jobtitle', 'icp_score', 'sinal_compra', 'dores_provaveis',
      'lead_source_campaign', 'melhor_angulo', 'canal_recomendado'
    ],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
    limit: 50,
  };

  let r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  // v2.91: se o portal não tem a propriedade icp_score, refaz sem ela em vez de falhar
  if (r.status === 400 && filtro === 'score_a') {
    body.filterGroups = [{ filters: filtros.novos }];
    r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) });
  }

  if (!r.ok) { const t = await r.text(); throw new Error('HubSpot ' + r.status + ': ' + t.substring(0, 200)); }   // v2.91: antes o erro virava "nenhum lead"
  const data = await r.json();

  return (data.results || []).map(c => {
    const p = c.properties;
    return {
      contact_id: c.id,
      name: `${p.firstname || ''} ${p.lastname || ''}`.trim() || 'Decisor',
      email: p.email || '',
      phone: p.mobilephone || p.phone || '',   // v2.91: celular (gravado pelo Apollo) tem prioridade — é o que tem WhatsApp
      company: p.company || '',
      job_title: p.jobtitle || '',
      score: p.icp_score || 'B',
      sinal_compra: p.sinal_compra || '',
      dores: p.dores_provaveis || '',
      source: p.lead_source_campaign || '',
      melhor_angulo: p.melhor_angulo || '',
      canal: p.canal_recomendado || 'WHATSAPP',
    };
  }).filter(l => l.name !== '' && (l.phone || l.email));
}

async function gerarMensagensEmLote(leads, tom) {
  // Gera todas as mensagens em paralelo (mais rápido que serial)
  const promises = leads.map(lead => gerarParaLead(lead, tom));
  const resultados = await Promise.allSettled(promises);

  return resultados.map((r, i) => {
    const lead = leads[i];
    if (r.status === 'fulfilled') {
      return { ...r.value, name: r.value?.name || lead.name, company: r.value?.company || lead.company, job_title: lead.job_title, contact_id: lead.contact_id, phone: lead.phone, email: lead.email, score: lead.score, canal: lead.canal, enviado: false };
    }
    return { name: lead.name, company: lead.company, job_title: lead.job_title, email: lead.email, contact_id: lead.contact_id, phone: lead.phone, score: lead.score, mensagem: null, followup: null, erro: r.reason?.message, enviado: false };
  });
}

async function gerarParaLead(lead, tom) {
  const system = `Você é o Agente S2-02 + S7-05 da Atlantyx (BI, Dados, IA para grandes empresas).
Atlantyx resolve: decisões com dados atrasados/inconsistentes = perda financeira real.
Entrega Quick Wins em semanas, integra com sistemas existentes, ROI mensurável.
Tom: ${tom}. NUNCA emojis. NUNCA revelar que é IA.`;

  const user = `Gere DOIS textos em JSON para:
Nome: ${lead.name}
Empresa: ${lead.company}
Cargo: ${lead.job_title}
Score ICP: ${lead.score}
Sinal de compra: ${lead.sinal_compra || 'empresa com operação complexa'}
Dores prováveis: ${lead.dores || ''}
Melhor ângulo: ${lead.melhor_angulo || ''}

Retorne APENAS JSON (sem markdown):
{
  "mensagem": "mensagem de 1º contato — max 5 linhas, começa pelo primeiro nome, menciona a empresa, termina com pergunta simples",
  "followup": "follow-up diferente para 48h sem resposta — max 3 linhas, nova abordagem"
}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, system, messages: [{ role: 'user', content: user }] })
  });

  const d = await r.json();
  const text = d.content[0].text.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(text);
    return { name: lead.name, company: lead.company, job_title: lead.job_title, mensagem: parsed.mensagem, followup: parsed.followup };
  } catch {
    // Fallback se JSON não parsear
    return { name: lead.name, company: lead.company, job_title: lead.job_title, mensagem: text.substring(0, 500), followup: `Olá ${lead.name.split(' ')[0]}, queria retomar nossa conversa. Há disponibilidade para uma troca rápida sobre como a ${lead.company} toma decisões com dados hoje?` };
  }
}

async function enviarWhatsApp(phone, message) {
  let p = phone.replace(/[^0-9]/g, '');
  if (!p.startsWith('55')) p = '55' + p;
  await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone: p, message }),
  });
}

async function atualizarHubSpot(dealId, contactId) {
  if (contactId) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({ properties: { hs_lead_status: 'OPEN' } })
    });
  }
  if (dealId) {
    await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({ properties: { dealstage: process.env.HUBSPOT_STAGE_ABORDADO } })
    });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'wa-batch-generate');
