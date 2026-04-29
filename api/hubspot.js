// api/hubspot.js
// Proxy HubSpot API — cria contatos e deals no pipeline Atlantyx
// Pipeline ID: 890074401

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Health check via GET
  if (req.method === 'GET') {
    const token = process.env.HUBSPOT_TOKEN;
    return res.status(200).json({
      ok: true,
      token_configured: !!token,
      token_preview: token ? token.substring(0, 8) + '...' : 'NOT SET'
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return res.status(500).json({ success: false, error: 'HUBSPOT_TOKEN nao configurado no Vercel' });
  }

  // Parse body — Vercel auto-parses JSON
  const body = req.body || {};
  const { action, properties = {} } = body;

  console.log('[HubSpot] action:', action, '| body keys:', Object.keys(body));

  if (!action) {
    return res.status(400).json({ success: false, error: 'action obrigatoria. Recebido: ' + JSON.stringify(Object.keys(body)) });
  }

  const HS_BASE = 'https://api.hubapi.com';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
  };

  try {
    // ── CRIAR CONTATO ─────────────────────────────────────────────────────
    if (action === 'create_contact') {
      // Verificar se já existe pelo email
      if (properties.email) {
        try {
          const search = await fetch(HS_BASE + '/crm/v3/objects/contacts/search', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: properties.email }] }],
              limit: 1,
            }),
          });
          const sd = await search.json();
          if (sd.results && sd.results.length > 0) {
            return res.status(200).json({ success: true, id: sd.results[0].id, status: 'already_exists' });
          }
        } catch(e) {
          console.log('[HubSpot] Search error (continuing):', e.message);
        }
      }

      // Criar contato
      const r = await fetch(HS_BASE + '/crm/v3/objects/contacts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ properties }),
      });
      const data = await r.json();

      if (!r.ok) {
        console.error('[HubSpot] Create contact error:', data);
        return res.status(200).json({ success: false, error: data.message || JSON.stringify(data).substring(0, 200) });
      }

      const contactId = data.id;
      let dealId = null;

      // Criar deal no pipeline Atlantyx
      try {
        const company = properties.company || properties.firstname || 'Lead Apollo';
        const job     = properties.jobtitle || 'C-Level';
        const dealResp = await fetch(HS_BASE + '/crm/v3/objects/deals', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            properties: {
              dealname:   company + ' — ' + job + ' (Apollo)',
              dealstage:  'appointmentscheduled',
              pipeline:   '890074401',
              leadsource: properties.leadsource || 'Apollo.io',
            },
          }),
        });
        const dd = await dealResp.json();
        dealId = dd.id;

        // Associar contato ao deal
        if (dealId && contactId) {
          await fetch(HS_BASE + '/crm/v4/associations/contacts/' + contactId + '/deals/' + dealId + '/labels', {
            method: 'PUT',
            headers,
            body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 4 }]),
          });
        }
      } catch(e) {
        console.log('[HubSpot] Deal creation error (contact OK):', e.message);
      }

      return res.status(200).json({ success: true, id: contactId, deal_id: dealId, status: 'created' });
    }

    // ── LISTAR PIPELINE ──────────────────────────────────────────────────
    if (action === 'list_pipeline') {
      const r = await fetch(HS_BASE + '/crm/v3/objects/deals?limit=50&properties=dealname,dealstage,amount,closedate&associations=contacts', {
        headers,
      });
      const data = await r.json();
      return res.status(200).json({ success: true, deals: data.results || [] });
    }

    return res.status(400).json({ success: false, error: 'Acao invalida: ' + action });

  } catch (e) {
    console.error('[HubSpot proxy]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
