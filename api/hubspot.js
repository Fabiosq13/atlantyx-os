// api/hubspot.js — apenas propriedades nativas HubSpot

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    const t = process.env.HUBSPOT_TOKEN;
    return res.status(200).json({ ok: true, token_configured: !!t, token_preview: t ? t.substring(0,12)+'...' : 'NOT SET' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return res.status(500).json({ success: false, error: 'HUBSPOT_TOKEN nao configurado' });

  const { action, properties = {} } = req.body || {};
  if (!action) return res.status(400).json({ success: false, error: 'action obrigatoria' });

  const BASE = 'https://api.hubapi.com';
  const H = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

  try {
    if (action === 'create_contact') {
      // APENAS campos 100% nativos do HubSpot — sem customizados
      const p = {};
      if (properties.firstname) p.firstname = properties.firstname;
      if (properties.lastname)  p.lastname  = properties.lastname;
      if (properties.email)     p.email     = properties.email;
      if (properties.phone)     p.phone     = properties.phone;
      if (properties.jobtitle)  p.jobtitle  = properties.jobtitle;
      if (properties.company)   p.company   = properties.company;
      if (properties.website)   p.website   = properties.linkedin_url || properties.website || '';
      // Colocar LinkedIn no campo website (nativo) se não houver website
      // Nota: não usamos 'description', 'leadsource', 'score_atlantyx' — não existem no portal

      // Verificar duplicata por email
      if (p.email) {
        try {
          const sr = await fetch(BASE + '/crm/v3/objects/contacts/search', {
            method: 'POST', headers: H,
            body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: p.email }] }], limit: 1 }),
          });
          const sd = await sr.json();
          if (sd.results?.length > 0) return res.status(200).json({ success: true, id: sd.results[0].id, status: 'already_exists' });
        } catch(e) {}
      }

      // Criar contato
      const r = await fetch(BASE + '/crm/v3/objects/contacts', {
        method: 'POST', headers: H, body: JSON.stringify({ properties: p }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(200).json({ success: false, error: d.message || JSON.stringify(d).substring(0,300) });

      const contactId = d.id;
      let dealId = null;

      // Criar deal no pipeline
      try {
        const dealName = (p.company || p.firstname || 'Lead') + ' — ' + (p.jobtitle || 'C-Level') + ' (Apollo)';
        const dr = await fetch(BASE + '/crm/v3/objects/deals', {
          method: 'POST', headers: H,
          body: JSON.stringify({ properties: {
            dealname:  dealName,
            dealstage: 'appointmentscheduled',
            pipeline:  process.env.HUBSPOT_PIPELINE_ID || '890074401',
          }}),
        });
        const dd = await dr.json();
        dealId = dd.id;
        if (dealId && contactId) {
          await fetch(BASE + '/crm/v4/associations/contacts/' + contactId + '/deals/' + dealId + '/labels', {
            method: 'PUT', headers: H,
            body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 4 }]),
          });
        }
      } catch(e) { console.log('[HubSpot] Deal err:', e.message); }

      return res.status(200).json({ success: true, id: contactId, deal_id: dealId, status: 'created' });
    }

    if (action === 'list_pipeline') {
      const r = await fetch(BASE + '/crm/v3/objects/deals?limit=50&properties=dealname,dealstage,amount', { headers: H });
      const d = await r.json();
      return res.status(200).json({ success: true, deals: d.results || [] });
    }

    return res.status(400).json({ success: false, error: 'Acao invalida: ' + action });
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
