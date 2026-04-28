// api/apollo.js
// Proxy para Apollo.io API — resolve CORS do browser
// Apollo v1 agora exige API Key no header X-Api-Key

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, api_key, ...params } = req.body || {};

  // API Key: campo do usuário OU variável de ambiente do Vercel
  const apolloKey = api_key || process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return res.status(400).json({
      success: false,
      error: 'Apollo API Key não configurada. Configure APOLLO_API_KEY no Vercel ou passe api_key no body.'
    });
  }

  // Headers com autenticação correta (Apollo exige X-Api-Key no header)
  const apolloHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': apolloKey,          // ← autenticação obrigatória no header
  };

  try {
    let endpoint = '';
    let body = {};

    if (action === 'people_search') {
      endpoint = 'https://api.apollo.io/v1/mixed_people/search';
      body = {
        page: params.page || 1,
        per_page: Math.min(params.per_page || 25, 100),
        person_titles: params.person_titles || [],
        contact_email_status: ['verified', 'likely_to_engage'],
      };
      if (params.organization_locations?.length)
        body.organization_locations = params.organization_locations;
      if (params.q_organization_industries?.length)
        body.q_organization_industries = params.q_organization_industries;
      if (params.organization_num_employees_ranges)
        body.organization_num_employees_ranges = params.organization_num_employees_ranges;

    } else if (action === 'person_match') {
      endpoint = 'https://api.apollo.io/v1/people/match';
      body = {};
      if (params.linkedin_url) body.linkedin_url = params.linkedin_url;
      if (params.name)         body.name         = params.name;
      if (params.q_keywords)   body.q_keywords   = params.q_keywords;
      body.reveal_personal_emails = false;

    } else if (action === 'enrich') {
      endpoint = 'https://api.apollo.io/v1/people/enrich';
      body = { ...params };

    } else {
      return res.status(400).json({ success: false, error: 'Ação inválida: ' + action });
    }

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: apolloHeaders,
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({
        success: false,
        error: 'Apollo HTTP ' + r.status + ': ' + errText.substring(0, 400)
      });
    }

    const data = await r.json();
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Apollo proxy]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
