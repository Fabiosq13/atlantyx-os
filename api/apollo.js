// api/apollo.js — Enriquecimento via nome + domain/org_name + reveal_results

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
      console.log('[Apollo] Busca:', total, 'leads | LI:', comLI);
      return res.status(200).json({ success: true, ...data });
    }

    // ── ENRIQUECIMENTO EM LOTE ────────────────────────────────────────────────
    if (action === 'enrich_batch') {
      const leads = params.leads;
      if (!leads?.length) return res.status(400).json({ success: false, error: 'leads[] obrigatório' });

      console.log('[Apollo Enrich] Processando', leads.length, 'leads...');
      const results = [];

      for (const lead of leads) {
        try {
          const firstName = lead.first_name || (lead.nome||'').split(' ')[0] || '';
          const lastName  = lead.last_name  || (lead.nome||'').split(' ').slice(1).join(' ') || '';
          const domain    = lead.domain || '';
          const orgName   = lead.organization_name || '';

          // Montar body com o que temos
          const body = {
            first_name:     firstName,
            reveal_results: true,
          };
          // Usa prefixo do sobrenome antes dos *** (ex: "Br***m" → "Br")
          // Apollo aceita prefixo parcial para matching
          if (lastName) {
            if (!lastName.includes('*')) {
              body.last_name = lastName; // sobrenome completo
            } else {
              const prefix = lastName.split('*')[0]; // "Br" de "Br***m"
              if (prefix && prefix.length >= 2) body.last_name = prefix;
            }
          }

          // Prioridade: domain > organization_name
          if (domain)  body.domain            = domain;
          if (orgName) body.organization_name  = orgName;

          console.log('[Apollo Enrich]', firstName, lastName, '| domain:', domain||'—', '| org:', orgName||'—');

          const r = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST', headers, body: JSON.stringify(body),
          });
          const data = await r.json();
          const person = data.person;

          const result = {
            apollo_id:    lead.apollo_id,
            nome:         lead.nome,
            linkedin_url: person?.linkedin_url || null,
            email:        person?.email || null,
            found:        !!(person?.linkedin_url || person?.email),
          };
          results.push(result);

          console.log('[Apollo Enrich]', lead.nome, '→ LI:', person?.linkedin_url||'NULL', '| Email:', person?.email||'NULL');

        } catch(e) {
          console.error('[Apollo Enrich] Erro', lead.nome, ':', e.message);
          results.push({ apollo_id: lead.apollo_id, nome: lead.nome, linkedin_url: null, email: null, error: e.message });
        }

        await new Promise(r => setTimeout(r, 300));
      }

      const comLI = results.filter(r => !!r.linkedin_url).length;
      const comEM = results.filter(r => !!r.email).length;
      console.log('[Apollo Enrich] Concluído:', results.length, '| LI:', comLI, '| Email:', comEM);

      return res.status(200).json({ success: true, results, com_linkedin: comLI, com_email: comEM });
    }

    return res.status(400).json({ success: false, error: 'Ação inválida: ' + action });

  } catch (e) {
    console.error('[Apollo]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
