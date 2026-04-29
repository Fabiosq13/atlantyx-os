// api/apollo.js — Proxy Apollo.io
// Query otimizada: Houston + Oil&Gas + C-levels + pós-filtro linkedin_url

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
      // Usar /v1/mixed_people/search (endpoint correto para filtros avançados)
      endpoint = 'https://api.apollo.io/v1/mixed_people/search';
      body = {
        page:     params.page     || 1,
        per_page: Math.min(params.per_page || 50, 100),

        // Títulos estratégicos
        person_titles: params.person_titles?.length
          ? params.person_titles
          : ['CEO', 'Chief', 'Director', 'VP', 'Head of', 'President', 'COO', 'CTO', 'CFO', 'CIO'],

        // Localização — Houston por padrão
        person_locations: params.person_cities?.length
          ? params.person_cities.map(c => c + ', United States')
          : ['Houston, Texas, United States'],

        // Setor — Oil & Gas por padrão
        organization_industry_tag_ids: undefined,
        organization_industries: params.q_organization_industries?.length
          ? params.q_organization_industries
          : ['oil & gas'],

        // Empresas com 201-5000 funcionários (hack: maior taxa de LinkedIn)
        organization_num_employees_ranges: params.organization_num_employees_ranges || ['201,5000'],

        // E-mail verificado
        contact_email_status: ['verified'],

        // Reveal data
        reveal_personal_emails: true,
        reveal_phone_number:    true,
      };

      // País opcional
      if (params.organization_locations?.length)
        body.organization_locations = params.organization_locations;

    } else if (action === 'people_search_api') {
      // Endpoint alternativo api_search (para planos Basic)
      endpoint = 'https://api.apollo.io/v1/mixed_people/api_search';
      body = {
        page:     params.page     || 1,
        per_page: Math.min(params.per_page || 50, 100),
        person_titles: params.person_titles || ['CEO', 'Director', 'VP', 'Head'],
        contact_email_status: ['verified', 'likely_to_engage'],
        reveal_personal_emails: true,
        reveal_phone_number: true,
      };
      if (params.q_organization_industries?.length)
        body.q_organization_industries = params.q_organization_industries;
      if (params.person_cities?.length)
        body.person_cities = params.person_cities;
      if (params.organization_locations?.length)
        body.organization_locations = params.organization_locations;

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
      // Se endpoint /search falhar (plano Basic não tem acesso), tentar /api_search
      if (action === 'people_search' && r.status === 422) {
        console.log('[Apollo] /search retornou 422, tentando /api_search...');
        const body2 = {
          page: body.page, per_page: body.per_page,
          person_titles: body.person_titles,
          contact_email_status: ['verified', 'likely_to_engage'],
          reveal_personal_emails: true, reveal_phone_number: true,
          q_organization_industries: body.organization_industries,
          person_cities: body.person_locations?.map(l => l.split(',')[0]),
          organization_num_employees_ranges: body.organization_num_employees_ranges,
        };
        const r2 = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
          method: 'POST', headers, body: JSON.stringify(body2),
        });
        if (r2.ok) {
          const d2 = await r2.json();
          return processAndReturn(d2, res);
        }
      }
      return res.status(r.status).json({ success: false, error: 'Apollo HTTP ' + r.status + ': ' + errText.substring(0, 400) });
    }

    const data = await r.json();
    return processAndReturn(data, res);

  } catch (e) {
    console.error('[Apollo proxy]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}

function processAndReturn(data, res) {
  if (data.people) {
    const total = data.people.length;

    // PÓS-FILTRO OBRIGATÓRIO: manter apenas quem tem linkedin_url
    const comLI = data.people.filter(p => p.linkedin_url);
    const semLI = total - comLI.length;

    console.log('[Apollo] Total:', total, '| Com linkedin_url:', comLI.length, '| Descartados:', semLI);

    // Retornar apenas leads com LinkedIn
    data.people = comLI;
    data._stats = {
      total_buscados: total,
      com_linkedin:   comLI.length,
      sem_linkedin:   semLI,
      taxa_linkedin:  Math.round(comLI.length / total * 100) + '%',
    };
  }

  return res.status(200).json({ success: true, ...data });
}
