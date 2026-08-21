// api/apollo.js — Enriquecimento via /people/bulk_match com details[{id}]
// Hardened: try/catch em JSON.parse, action person_match adicionada

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

  // Helper: parse JSON com fallback
  const safeJsonParse = (text, label = '') => {
    try { return JSON.parse(text); }
    catch (e) {
      console.error(`[Apollo] JSON.parse falhou em ${label}:`, e.message, '| text:', text.substring(0, 200));
      throw new Error(`Resposta do Apollo não é JSON válido (${label}): ${text.substring(0, 150)}`);
    }
  };

  try {

    // ── BUSCA PRINCIPAL ───────────────────────────────────────────────────────
    if (action === 'people_search') {
      const body = {
        page:     params.page     || 1,
        per_page: Math.min(params.per_page || 25, 100),
        contact_email_status: ['verified', 'likely_to_engage', 'unavailable'],
        reveal_personal_emails: true,
      };
      if (params.person_titles?.length)             body.person_titles             = params.person_titles;
      if (params.q_organization_industries?.length) body.q_organization_industries = params.q_organization_industries;
      if (params.q_keywords)                        body.q_keywords                = params.q_keywords;

      const r = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
        method: 'POST', headers, body: JSON.stringify(body)
      });
      const text = await r.text();
      if (!r.ok) return res.status(r.status).json({ success: false, error: 'Apollo ' + r.status + ': ' + text.substring(0,300) });

      const data = safeJsonParse(text, 'people_search');
      const total = data.people?.length || 0;
      const comLI = data.people?.filter(p => !!p.linkedin_url).length || 0;
      data._stats = { total_buscados: total, com_li_pessoa: comLI };
      console.log('[Apollo] Busca:', total, '| LI:', comLI);
      return res.status(200).json({ success: true, ...data });
    }

    // ── MATCH POR URL LINKEDIN (lookup individual) ───────────────────────────
    // /people/match aceita linkedin_url, email, ou first_name+last_name+organization_name
    if (action === 'person_match') {
      const body = { reveal_personal_emails: true };
      if (params.linkedin_url) body.linkedin_url = params.linkedin_url;
      if (params.email)        body.email        = params.email;
      if (params.first_name)   body.first_name   = params.first_name;
      if (params.last_name)    body.last_name    = params.last_name;
      if (params.organization_name) body.organization_name = params.organization_name;
      if (params.name && !body.first_name && !body.linkedin_url) {
        const parts = params.name.split(/\s+/);
        body.first_name = parts[0];
        if (parts.length > 1) body.last_name = parts.slice(1).join(' ');
      }

      if (!body.linkedin_url && !body.email && !body.first_name) {
        return res.status(400).json({ success: false, error: 'person_match requer linkedin_url, email ou name' });
      }

      console.log('[Apollo person_match] params:', JSON.stringify(body).substring(0, 200));
      const r = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST', headers, body: JSON.stringify(body)
      });
      const text = await r.text();
      if (!r.ok) return res.status(r.status).json({ success: false, error: 'Apollo match ' + r.status + ': ' + text.substring(0,300) });

      const data = safeJsonParse(text, 'person_match');
      console.log('[Apollo person_match] resultado:', data.person ? 'encontrado' : 'nada');
      return res.status(200).json({ success: true, ...data });
    }

    // ── ENRIQUECIMENTO via /people/bulk_match com details[{id}] ──────────────
    if (action === 'enrich_batch') {
      const leads = params.leads;
      if (!leads?.length) return res.status(400).json({ success: false, error: 'leads[] obrigatório' });

      const batch = leads.slice(0, 10);
      const details = batch.map(l => ({ id: l.apollo_id })).filter(d => !!d.id);

      if (!details.length) {
        return res.status(400).json({ success: false, error: 'Nenhum lead com apollo_id válido' });
      }

      console.log('[Apollo Bulk Match] IDs:', details.map(d => d.id));

      const body = { details };
      const r = await fetch('https://api.apollo.io/v1/people/bulk_match', {
        method: 'POST', headers, body: JSON.stringify(body)
      });

      const text = await r.text();
      console.log('[Apollo Bulk Match] Status:', r.status, '| Preview:', text.substring(0, 500));

      if (!r.ok) {
        return res.status(r.status).json({
          success: false,
          error: 'Apollo bulk_match ' + r.status + ': ' + text.substring(0, 300)
        });
      }

      const data = safeJsonParse(text, 'bulk_match');
      const matches = data.matches || data.people || [];
      console.log('[Apollo Bulk Match] Matches retornados:', matches.length);

      const results = batch.map(function(lead) {
        const match = matches.find(m =>
          m?.id === lead.apollo_id ||
          m?.person?.id === lead.apollo_id
        );
        const person = match?.person || match || null;

        console.log('[Apollo Bulk Match]', lead.nome, '| LI:', person?.linkedin_url || 'NULL', '| Email:', person?.email || 'NULL');

        return {
          apollo_id:    lead.apollo_id,
          nome:         lead.nome,
          linkedin_url: person?.linkedin_url || null,
          email:        person?.email || null,
          revealed:     person?.revealed_for_current_team || false,
          body_sent:    { id: lead.apollo_id },
        };
      });

      const comLI = results.filter(r => !!r.linkedin_url).length;
      const comEM = results.filter(r => !!r.email).length;
      console.log('[Apollo Bulk Match] LI:', comLI, '| Email:', comEM);

      return res.status(200).json({ success: true, results, com_linkedin: comLI, com_email: comEM });
    }

    return res.status(400).json({
      success: false,
      error: 'Ação inválida: ' + action,
      disponiveis: ['people_search', 'person_match', 'enrich_batch'],
    });

  } catch (e) {
    console.error('[Apollo]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
