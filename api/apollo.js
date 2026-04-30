// api/apollo.js — Fix reveal_phone_number webhook error

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, api_key, ...params } = req.body || {};
  const apolloKey = api_key || process.env.APOLLO_API_KEY;
  if (!apolloKey) return res.status(400).json({ success: false, error: 'APOLLO_API_KEY não configurada' });

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'X-Api-Key': apolloKey,
  };

  try {

    // ── BUSCA PRINCIPAL ───────────────────────────────────────────────────────
    if (action === 'people_search') {
      const body = {
        page:     params.page     || 1,
        per_page: Math.min(params.per_page || 25, 100),
        contact_email_status: ['verified', 'likely_to_engage', 'unavailable'],
        reveal_personal_emails: true,
        // reveal_phone_number REMOVIDO — requer webhook_url
      };
      if (params.person_titles?.length)             body.person_titles             = params.person_titles;
      if (params.q_organization_industries?.length) body.q_organization_industries = params.q_organization_industries;

      const r = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
        method: 'POST', headers, body: JSON.stringify(body)
      });
      const text = await r.text();
      if (!r.ok) return res.status(r.status).json({ success: false, error: 'Apollo ' + r.status + ': ' + text.substring(0,300) });

      const data = JSON.parse(text);
      const total = data.people?.length || 0;
      const comLI = data.people?.filter(p => !!p.linkedin_url).length || 0;
      data._stats = { total_buscados: total, com_li_pessoa: comLI };
      console.log('[Apollo] Busca:', total, 'leads | LI:', comLI);
      return res.status(200).json({ success: true, ...data });
    }

    // ── ENRIQUECIMENTO EM LOTE via person_ids[] ───────────────────────────────
    if (action === 'enrich_batch') {
      const ids = params.person_ids;
      if (!ids?.length) return res.status(400).json({ success: false, error: 'person_ids[] obrigatório' });

      console.log('[Apollo Enrich] IDs enviados:', ids.length, '| Primeiros:', ids.slice(0,3));

      const r = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          person_ids: ids,
          reveal_personal_emails: true,
          // reveal_phone_number REMOVIDO — requer webhook_url
        }),
      });

      const text = await r.text();
      console.log('[Apollo Enrich] Status:', r.status, '| Preview:', text.substring(0, 500));

      if (!r.ok) return res.status(r.status).json({ success: false, error: 'Apollo enrich ' + r.status + ': ' + text.substring(0,300) });

      const data = JSON.parse(text);

      // Resposta pode ser person (singular) ou people (plural)
      const people = data.people || (data.person ? [data.person] : []);
      const comLI  = people.filter(p => !!p.linkedin_url).length;
      const comEM  = people.filter(p => !!p.email).length;

      console.log('[Apollo Enrich] Retornados:', people.length, '| LinkedIn:', comLI, '| Email:', comEM);

      // Log primeiro resultado para debug
      if (people[0]) {
        console.log('[Apollo Enrich] 1º perfil:', JSON.stringify({
          id: people[0].id,
          linkedin_url: people[0].linkedin_url,
          email: people[0].email,
          revealed: people[0].revealed_for_current_team,
        }));
      }

      return res.status(200).json({ success: true, people, com_linkedin: comLI, com_email: comEM });
    }

    // ── MATCH INDIVIDUAL ──────────────────────────────────────────────────────
    if (action === 'person_match') {
      const body = { reveal_personal_emails: true };
      if (params.apollo_id)         body.person_ids        = [params.apollo_id];
      if (params.linkedin_url)      body.linkedin_url      = params.linkedin_url;
      if (params.name)              body.name              = params.name;
      if (params.organization_name) body.organization_name = params.organization_name;

      const r = await fetch('https://api.apollo.io/v1/people/match', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await r.json();
      return res.status(200).json({ success: true, ...data });
    }

    return res.status(400).json({ success: false, error: 'Ação inválida: ' + action });

  } catch (e) {
    console.error('[Apollo]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
