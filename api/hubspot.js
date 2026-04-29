// api/hubspot.js
// Proxy HubSpot API — cria contatos e deals no pipeline Atlantyx
// Usa apenas propriedades nativas do HubSpot

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Health check
  if (req.method === 'GET') {
    const token = process.env.HUBSPOT_TOKEN;
    return res.status(200).json({
      ok: true,
      token_configured: !!token,
      token_preview: token ? token.substring(0, 12) + '...' : 'NOT SET'
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    return res.status(500).json({ success: false, error: 'HUBSPOT_TOKEN nao configurado no Vercel' });
  }

  const body = req.body || {};
  const { action, properties = {} } = body;

  if (!action) {
    return res.status(400).json({ success: false, error: 'action obrigatoria' });
  }

  const HS_BASE = 'https://api.hubapi.com';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
  };

  try {
    if (action === 'create_contact') {
      // Apenas propriedades nativas do HubSpot — sem campos customizados
      const safeProps = {};
      if (properties.firstname)   safeProps.firstname   = properties.firstname;
      if (properties.lastname)    safeProps.lastname    = properties.lastname;
      if (properties.email)       safeProps.email       = properties.email;
      if (properties.phone)       safeProps.phone       = properties.phone;
      if (properties.jobtitle)    safeProps.jobtitle    = properties.jobtitle;
      if (properties.company)     safeProps.company     = properties.company;
      if (properties.industry)    safeProps.industry    = properties.industry;
      if (properties.website)     safeProps.website     = properties.website;
      // Adicionar info Apollo no campo de notas (campo nativo)
      const notaExtra = [
        properties.linkedin_url  ? 'LinkedIn: ' + properties.linkedin_url : '',
        properties.score_atlantyx ? 'Score Atlantyx: ' + properties.score_atlantyx : '',
        'Origem: Apollo.io + LinkedIn Atlantyx OS',
      ].filter(Boolean).join(' | ');
      if (notaExtra) safeProps.description = notaExtra;

      // Verificar duplicata por email
      if (safeProps.email) {
        try {
          const sr = await fetch(HS_BASE + '/crm/v3/objects/contacts/search', {
            method: 'POST', headers,
            body: JSON.stringify({
              filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: safeProps.email }] }],
              limit: 1,
            }),
          });
          const sd = await sr.json();
          if (sd.results && sd.results.length > 0) {
            return res.status(200).json({ success: true, id: sd.results[0].id, status: 'already_exists' });
          }
        } catch(e) {}
      }

      // Criar contato
      const r = await fetch(HS_BASE + '/crm/v3/objects/contacts', {
        method: 'POST', headers,
        body: JSON.stringify({ properties: safeProps }),
      });
      const data = await r.json();
      if (!r.ok) {
        return res.status(200).json({ success: false, error: data.message || JSON.stringify(data).substring(0, 300) });
      }
      const contactId = data.id;
      let dealId = null;

      // Criar deal no pipeline Atlantyx
      try {
        const company  = safeProps.company || safeProps.firstname || 'Lead Apollo';
        const jobtitle = safeProps.jobtitle || 'C-Level';
        const dr = await fetch(HS_BASE + '/crm/v3/objects/deals', {
          method: 'POST', headers,
          body: JSON.stringify({
            properties: {
              dealname:  company + ' — ' + jobtitle + ' (Apollo)',
              dealstage: 'appointmentscheduled',
              pipeline:  process.env.HUBSPOT_PIPELINE_ID || '890074401',
            },
          }),
        });
        const dd = await dr.json();
        dealId = dd.id;

        // Associar contato ao deal (API v4)
        if (dealId && contactId) {
          await fetch(HS_BASE + '/crm/v4/associations/contacts/' + contactId + '/deals/' + dealId + '/labels', {
            method: 'PUT', headers,
            body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 4 }]),
          });
        }
      } catch(e) {
        console.log('[HubSpot] Deal error (contact OK):', e.message);
      }

      return res.status(200).json({ success: true, id: contactId, deal_id: dealId, status: 'created' });
    }

    if (action === 'list_pipeline') {
      const r = await fetch(HS_BASE + '/crm/v3/objects/deals?limit=50&properties=dealname,dealstage,amount&associations=contacts', { headers });
      const data = await r.json();
      return res.status(200).json({ success: true, deals: data.results || [] });
    }

    return res.status(400).json({ success: false, error: 'Acao invalida: ' + action });

  } catch (e) {
    console.error('[HubSpot]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
