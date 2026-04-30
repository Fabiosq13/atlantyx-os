// api/apollo.js — DEBUG COMPLETO

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, api_key, ...params } = req.body || {};
  const apolloKey = api_key || process.env.APOLLO_API_KEY;

  console.log('[Apollo] === NOVA BUSCA ===');
  console.log('[Apollo] action:', action);
  console.log('[Apollo] api_key from body:', api_key ? api_key.substring(0,8)+'...' : 'VAZIO');
  console.log('[Apollo] api_key from env:', process.env.APOLLO_API_KEY ? process.env.APOLLO_API_KEY.substring(0,8)+'...' : 'NÃO CONFIGURADA');
  console.log('[Apollo] params:', JSON.stringify(params));

  if (!apolloKey) {
    console.log('[Apollo] ERRO: Sem API Key');
    return res.status(400).json({ success: false, error: 'APOLLO_API_KEY não configurada' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': apolloKey,
  };

  // Montar body da query
  const body = {
    page:     params.page     || 1,
    per_page: Math.min(params.per_page || 10, 25), // reduzir para debug
    contact_email_status: ['verified', 'likely_to_engage', 'unavailable'],
    reveal_personal_emails: true,
    reveal_phone_number:    true,
  };

  if (params.person_titles?.length)             body.person_titles             = params.person_titles;
  if (params.q_organization_industries?.length) body.q_organization_industries = params.q_organization_industries;
  if (params.person_cities?.length) {
    const pais = params.organization_locations?.[0] || '';
    body.person_locations = params.person_cities.map(c => pais ? c + ', ' + pais : c);
  } else if (params.organization_locations?.length) {
    body.person_locations = params.organization_locations;
  }

  console.log('[Apollo] Query body enviado:', JSON.stringify(body, null, 2));

  const endpoint = 'https://api.apollo.io/v1/mixed_people/api_search';
  console.log('[Apollo] Endpoint:', endpoint);

  try {
    const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });

    console.log('[Apollo] HTTP Status:', r.status);
    console.log('[Apollo] Response headers:', JSON.stringify(Object.fromEntries(r.headers.entries())));

    const text = await r.text();
    console.log('[Apollo] Response (primeiros 500 chars):', text.substring(0, 500));

    if (!r.ok) {
      return res.status(r.status).json({
        success: false,
        error: 'Apollo HTTP ' + r.status,
        detail: text.substring(0, 400),
        query_sent: body,
      });
    }

    let data;
    try { data = JSON.parse(text); }
    catch(e) {
      console.log('[Apollo] ERRO parse JSON:', e.message);
      return res.status(500).json({ success: false, error: 'Parse JSON falhou', raw: text.substring(0, 200) });
    }

    const total = data.people?.length || 0;
    const pagination = data.pagination || {};
    console.log('[Apollo] people retornados:', total);
    console.log('[Apollo] pagination:', JSON.stringify(pagination));
    console.log('[Apollo] total_entries:', data.total_entries || data.pagination?.total_entries || '?');

    if (total > 0) {
      const p0 = data.people[0];
      console.log('[Apollo] Primeiro lead - campos:', Object.keys(p0).join(', '));
      console.log('[Apollo] Primeiro lead - linkedin_url:', p0.linkedin_url);
      console.log('[Apollo] Primeiro lead - nome:', p0.first_name, p0.last_name);
    }

    // Pós-filtro linkedin_url
    const comLI = data.people ? data.people.filter(p => !!p.linkedin_url) : [];
    if (data.people) data.people = comLI;

    data._stats = {
      total_buscados: total,
      com_linkedin:   comLI.length,
      sem_linkedin:   total - comLI.length,
      total_disponivel: data.total_entries || pagination.total_entries || '?',
      query_enviada: body,
    };

    console.log('[Apollo] === RESULTADO: ' + total + ' leads, ' + comLI.length + ' com LinkedIn ===');
    return res.status(200).json({ success: true, ...data });

  } catch (e) {
    console.error('[Apollo] EXCEÇÃO:', e.message, e.stack);
    return res.status(500).json({ success: false, error: e.message });
  }
}
