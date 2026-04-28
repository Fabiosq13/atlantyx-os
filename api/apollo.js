// api/apollo.js
// Proxy para Apollo.io API — resolve CORS do browser

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, api_key, ...params } = req.body || {};

  // Usar api_key do body ou da variável de ambiente
  const apolloKey = api_key || process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return res.status(400).json({ success: false, error: 'Apollo API Key não configurada. Passe api_key no body ou configure APOLLO_API_KEY no Vercel.' });
  }

  try {
    let endpoint = '';
    let body = {};

    if (action === 'people_search') {
      endpoint = 'https://api.apollo.io/v1/mixed_people/search';
      body = {
        api_key: apolloKey,
        page: params.page || 1,
        per_page: params.per_page || 25,
        person_titles: params.person_titles || [],
        contact_email_status: ['verified', 'unverified'],
      };
      if (params.organization_locations?.length)  body.organization_locations  = params.organization_locations;
      if (params.q_organization_industries?.length) body.q_organization_industries = params.q_organization_industries;
      if (params.organization_num_employees_ranges) body.organization_num_employees_ranges = params.organization_num_employees_ranges;

    } else if (action === 'person_match') {
      endpoint = 'https://api.apollo.io/v1/people/match';
      body = { api_key: apolloKey };
      if (params.linkedin_url) body.linkedin_url = params.linkedin_url;
      if (params.name)         body.name         = params.name;
      if (params.q_keywords)   body.q_keywords   = params.q_keywords;

    } else if (action === 'enrich') {
      endpoint = 'https://api.apollo.io/v1/people/enrich';
      body = { api_key: apolloKey, ...params };

    } else {
      return res.status(400).json({ success: false, error: 'Ação inválida: ' + action });
    }

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ success: false, error: 'Apollo HTTP ' + r.status + ': ' + errText.substring(0, 300) });
    }

    const data = await r.json();
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Apollo proxy]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
