// api/apollo.js — Fix timeout: processa em lotes de 10 sem delay

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
      console.log('[Apollo] Busca:', total, '| LI:', comLI);
      return res.status(200).json({ success: true, ...data });
    }

    // ── ENRIQUECIMENTO — máx 10 leads por chamada (evita timeout Vercel 10s) ──
    if (action === 'enrich_batch') {
      const leads = params.leads;
      if (!leads?.length) return res.status(400).json({ success: false, error: 'leads[] obrigatório' });

      // Limitar a 10 por chamada — frontend chama em múltiplos batches
      const batch = leads.slice(0, 10);
      console.log('[Apollo Enrich] Batch:', batch.length, 'de', leads.length, 'leads');

      const results = [];

      for (const lead of batch) {
        const firstName = lead.first_name || (lead.nome||'').split(' ')[0] || '';
        const lastName  = lead.last_name  || '';
        const domain    = lead.domain || '';
        const orgName   = lead.organization_name || '';

        const body = {
          first_name:     firstName,
          reveal_results: true,
        };

        // Sobrenome — usa prefixo se obfuscado
        if (lastName && !lastName.includes('*')) {
          body.last_name = lastName;
        } else if (lastName && lastName.includes('*')) {
          const prefix = lastName.split('*')[0];
          if (prefix && prefix.length >= 2) body.last_name = prefix;
        }

        // Domínio > organization_name
        if (domain)   body.domain            = domain;
        else if (orgName) body.organization_name = orgName;

        console.log('[Apollo Enrich] POST →', JSON.stringify(body));

        try {
          const r = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST', headers, body: JSON.stringify(body),
          });
          const data = await r.json();
          const person = data.person;

          console.log('[Apollo Enrich] ←', lead.nome, '| HTTP:', r.status, '| LI:', person?.linkedin_url||'NULL', '| Email:', person?.email||'NULL', '| revealed:', person?.revealed_for_current_team);

          results.push({
            apollo_id:    lead.apollo_id,
            nome:         lead.nome,
            linkedin_url: person?.linkedin_url || null,
            email:        person?.email || null,
            revealed:     person?.revealed_for_current_team || false,
            body_sent:    body,  // para debug — ver exatamente o que foi enviado
          });

        } catch(e) {
          console.error('[Apollo Enrich] ERRO', lead.nome, ':', e.message);
          results.push({ apollo_id: lead.apollo_id, nome: lead.nome, error: e.message });
        }
        // SEM delay — Vercel timeout é 10s, não podemos gastar tempo
      }

      const comLI = results.filter(r => !!r.linkedin_url).length;
      const comEM = results.filter(r => !!r.email).length;
      console.log('[Apollo Enrich] Fim batch:', results.length, '| LI:', comLI, '| Email:', comEM);

      return res.status(200).json({
        success: true,
        results,
        com_linkedin: comLI,
        com_email: comEM,
        batch_size: batch.length,
        total_leads: leads.length,
      });
    }

    return res.status(400).json({ success: false, error: 'Ação inválida: ' + action });

  } catch (e) {
    console.error('[Apollo]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
