// api/hubspot.js
// Proxy HubSpot API — cria contatos e deals no pipeline Atlantyx
// Pipeline ID: 890074401

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return res.status(500).json({ success: false, error: 'HUBSPOT_TOKEN não configurado no Vercel' });
  }

  const { action, properties = {}, deal = {} } = req.body || {};

  const HS_BASE = 'https://api.hubapi.com';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    // ── CRIAR CONTATO ───────────────────────────────────────────────────────
    if (action === 'create_contact') {
      // Verificar se contato já existe pelo email
      if (properties.email) {
        const search = await fetch(`${HS_BASE}/crm/v3/objects/contacts/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: properties.email }] }],
            limit: 1,
          }),
        });
        const searchData = await search.json();
        if (searchData.results?.length > 0) {
          const existing = searchData.results[0];
          return res.status(200).json({ success: true, id: existing.id, status: 'already_exists', contact: existing });
        }
      }

      // Criar novo contato
      const r = await fetch(`${HS_BASE}/crm/v3/objects/contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ properties }),
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ success: false, error: data.message || JSON.stringify(data) });

      const contactId = data.id;

      // Criar deal associado no pipeline Atlantyx
      const dealName = `${properties.company || 'Empresa'} — ${properties.jobtitle || 'C-Level'} (Apollo)`;
      const dealResp = await fetch(`${HS_BASE}/crm/v3/objects/deals`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          properties: {
            dealname:      dealName,
            dealstage:     'appointmentscheduled',   // primeira etapa do pipeline
            pipeline:      '890074401',              // pipeline Atlantyx
            amount:        '',
            closedate:     '',
            leadsource:    properties.leadsource || 'Apollo.io',
          },
        }),
      });
      const dealData = await dealResp.json();
      const dealId = dealData.id;

      // Associar contato ao deal
      if (dealId && contactId) {
        await fetch(`${HS_BASE}/crm/v3/associations/contacts/${contactId}/deals/${dealId}/contact_to_deal`, {
          method: 'PUT',
          headers,
        });
      }

      return res.status(200).json({ success: true, id: contactId, deal_id: dealId, status: 'created' });
    }

    // ── BUSCAR CONTATO ──────────────────────────────────────────────────────
    if (action === 'search_contact') {
      const { email, name } = req.body;
      const filter = email
        ? { propertyName: 'email', operator: 'EQ', value: email }
        : { propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: name };

      const r = await fetch(`${HS_BASE}/crm/v3/objects/contacts/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filterGroups: [{ filters: [filter] }], limit: 10 }),
      });
      const data = await r.json();
      return res.status(200).json({ success: true, contacts: data.results || [] });
    }

    // ── LISTAR PIPELINE ─────────────────────────────────────────────────────
    if (action === 'list_pipeline') {
      const r = await fetch(`${HS_BASE}/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,leadsource&associations=contacts`, {
        headers,
      });
      const data = await r.json();
      return res.status(200).json({ success: true, deals: data.results || [] });
    }

    return res.status(400).json({ success: false, error: 'Ação inválida: ' + action });

  } catch (e) {
    console.error('[HubSpot proxy]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
