// api/apollo.js — Proxy Apollo.io

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
    if (action === 'people_search') {
      const body = {
        page:     params.page     || 1,
        per_page: Math.min(params.per_page || 25, 100),
        contact_email_status: ['verified', 'likely_to_engage', 'unavailable'],
        reveal_personal_emails: true,
        reveal_phone_number:    true,
      };

      // Cargo — só adiciona se não for vazio
      if (params.person_titles?.length) body.person_titles = params.person_titles;

      // Setor
      if (params.q_organization_industries?.length) body.q_organization_industries = params.q_organization_industries;

      // Localização — usa person_locations (funciona melhor no api_search)
      if (params.person_cities?.length) {
        // Combina cidade + país se país informado
        const pais = params.organization_locations?.[0] || '';
        body.person_locations = params.person_cities.map(c =>
          pais ? c + ', ' + pais : c
        );
      } else if (params.organization_locations?.length) {
        body.person_locations = params.organization_locations;
      }

      console.log('[Apollo] Query:', JSON.stringify(body));

      const r = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
        method: 'POST', headers, body: JSON.stringify(body)
      });

      const text = await r.text();
      console.log('[Apollo] Status:', r.status, '| Response preview:', text.substring(0, 300));

      if (!r.ok) {
        return res.status(r.status).json({ success: false, error: 'Apollo ' + r.status + ': ' + text.substring(0, 400) });
      }

      const data = JSON.parse(text);
      const total = data.people?.length || 0;

      // Pós-filtro: somente com linkedin_url
      if (data.people) {
        data.people = data.people.filter(p => !!p.linkedin_url);
      }

      data._stats = {
        total_buscados: total,
        com_linkedin:   data.people?.length || 0,
        sem_linkedin:   total - (data.people?.length || 0),
      };

      console.log('[Apollo] Total:', total, '| Com linkedin_url:', data._stats.com_linkedin);
      return res.status(200).json({ success: true, ...data });

    } else if (action === 'person_match') {
      const body = { reveal_personal_emails: true, reveal_phone_number: true };
      if (params.linkedin_url)      body.linkedin_url      = params.linkedin_url;
      if (params.name)              body.name              = params.name;
      if (params.q_keywords)        body.q_keywords        = params.q_keywords;
      if (params.organization_name) body.organization_name = params.organization_name;

      const r = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST', headers, body: JSON.stringify(body)
      });
      const data = await r.json();
      return res.status(200).json({ success: true, ...data });

    } else {
      return res.status(400).json({ success: false, error: 'Ação inválida: ' + action });
    }

  } catch (e) {
    console.error('[Apollo proxy]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
