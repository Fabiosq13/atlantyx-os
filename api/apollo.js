// api/apollo.js — Proxy Apollo.io com debug de campos retornados

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, api_key, ...params } = req.body || {};
  const apolloKey = api_key || process.env.APOLLO_API_KEY;
  if (!apolloKey) return res.status(400).json({ success: false, error: 'Configure APOLLO_API_KEY no Vercel' });

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': apolloKey,
  };

  try {
    let endpoint = '';
    let body = {};

    if (action === 'people_search') {
      endpoint = 'https://api.apollo.io/v1/mixed_people/api_search';
      body = {
        page: params.page || 1,
        per_page: Math.min(params.per_page || 25, 100),
        person_titles: params.person_titles || [],
        contact_email_status: ['verified', 'likely_to_engage', 'unavailable'],
        reveal_personal_emails: true,
        reveal_phone_number: true,
      };
      if (params.organization_locations?.length)
        body.organization_locations = params.organization_locations;
      if (params.q_organization_industries?.length)
        body.q_organization_industries = params.q_organization_industries;

    } else if (action === 'person_match') {
      endpoint = 'https://api.apollo.io/v1/people/match';
      body = { reveal_personal_emails: true, reveal_phone_number: true };
      if (params.linkedin_url)      body.linkedin_url      = params.linkedin_url;
      if (params.name)              body.name              = params.name;
      if (params.q_keywords)        body.q_keywords        = params.q_keywords;
      if (params.organization_name) body.organization_name = params.organization_name;

    } else {
      return res.status(400).json({ success: false, error: 'Ação inválida: ' + action });
    }

    const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ success: false, error: 'Apollo HTTP ' + r.status + ': ' + errText.substring(0, 400) });
    }

    const data = await r.json();

    // DEBUG: logar todos os campos do primeiro resultado para ver o que o Apollo retorna
    if (data.people && data.people[0]) {
      const p = data.people[0];
      console.log('[Apollo DEBUG] Campos do primeiro lead:');
      console.log('  linkedin_url:', p.linkedin_url);
      console.log('  linkedin_profile_url:', p.linkedin_profile_url);
      console.log('  person_linkedin_url:', p.person_linkedin_url);
      console.log('  linkedin_uid:', p.linkedin_uid);
      console.log('  email:', p.email);
      console.log('  email_status:', p.email_status);
      console.log('  phone_numbers:', JSON.stringify(p.phone_numbers));
      console.log('  ALL KEYS:', Object.keys(p).join(', '));
    }

    // Normalizar linkedin_url de todos os campos possíveis
    if (data.people) {
      data.people = data.people.map(p => {
        // Tentar construir URL a partir do linkedin_uid se não tiver URL
        const liUrl = p.linkedin_url || p.linkedin_profile_url || p.person_linkedin_url ||
          (p.linkedin_uid ? 'https://www.linkedin.com/in/' + p.linkedin_uid : '');
        return { ...p, linkedin_url: liUrl };
      });
    }

    // Incluir debug info na resposta
    const debugInfo = data.people ? {
      total: data.people.length,
      com_linkedin: data.people.filter(p => p.linkedin_url).length,
      com_email: data.people.filter(p => p.email).length,
      com_telefone: data.people.filter(p => p.phone_numbers?.length).length,
      campos_disponiveis: data.people[0] ? Object.keys(data.people[0]).join(', ') : '',
    } : {};

    return res.status(200).json({ success: true, ...data, _debug: debugInfo });

  } catch (e) {
    console.error('[Apollo proxy]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
