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

  // v2.90: comparação EXATA de nome e empresa
  const normN = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9*\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normEmp = s => normN(s).replace(/\b(ltda|s ?a|sa|me|eireli|epp|cia|companhia|grupo|holding|brasil|do brasil|inc|llc|corp|corporation|limited|ltd)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const LIGA = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  const _nomeBate = (digitado, p) => {
    const toks = normN(digitado).split(' ').filter(t => t && !LIGA.has(t));
    if (!toks.length) return false;
    const primeiro = normN(p.first_name || (p.name || '').split(' ')[0]);
    const sobre = normN([p.last_name, p.last_name_obfuscated].filter(Boolean).join(' ') || (p.name || '').split(' ').slice(1).join(' '));
    const palavrasSobre = sobre.split(' ').filter(Boolean);
    if (primeiro !== toks[0]) return false;
    return toks.slice(1).every(t => palavrasSobre.includes(t) || palavrasSobre.some(w => w.includes('*') && w[0] === t[0]));
  };
  const _emailBate = (email, p) => { const e = String(email || '').toLowerCase().trim(); return [p.email, p.personal_emails, p.work_email].flat().filter(Boolean).some(x => String(x).toLowerCase().trim() === e); };

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
      // v2.89: parâmetros CORRETOS da API de busca de pessoas do Apollo + conferência do resultado.
      // Antes: setor ia em "q_organization_industries" (não existe → ignorado), país/cidade/faturamento
      // nunca eram enviados, e o cargo trazia "títulos semelhantes" — por isso o filtro não era respeitado.
      const perPage = Math.min(parseInt(params.per_page) || 25, 100);
      const body = { page: params.page || 1, per_page: perPage };
      const titulos = (params.person_titles || []).filter(Boolean);
      if (titulos.length) { body.person_titles = titulos; body.include_similar_titles = params.cargo_estrito === false; }
      const setores = (params.setores || params.q_organization_industries || []).filter(Boolean);
      if (setores.length) body.q_organization_keyword_tags = setores;
      const locais = (params.person_locations || []).filter(Boolean);
      if (locais.length) body.person_locations = locais;
      // faixa de faturamento vai na URL (é assim que a API de busca do Apollo lê esse filtro), em USD
      const qs = new URLSearchParams();
      if (params.revenue_min) qs.set('revenue_range[min]', String(parseInt(params.revenue_min)));
      if (params.revenue_max) qs.set('revenue_range[max]', String(parseInt(params.revenue_max)));
      if (params.person_seniorities?.length) body.person_seniorities = params.person_seniorities;
      if (params.q_keywords) body.q_keywords = params.q_keywords;
      if (params.q_organization_domains_list?.length) body.q_organization_domains_list = params.q_organization_domains_list;

      const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search' + (qs.toString() ? '?' + qs.toString() : ''), { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await r.text();
      if (!r.ok) return res.status(r.status).json({ success: false, error: 'Apollo ' + r.status + ': ' + text.substring(0, 300), enviado: body });
      const data = safeJsonParse(text, 'people_search');
      let people = data.people || [];

      // Conferência: descarta o que não bate com o filtro pedido (o Apollo às vezes amplia a busca)
      const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const SIGLAS = { ceo: ['ceo', 'chief executive', 'presidente', 'diretor presidente', 'president'], cio: ['cio', 'chief information'], cto: ['cto', 'chief technology'],
        cfo: ['cfo', 'chief financial', 'diretor financeiro', 'diretora financeira'], coo: ['coo', 'chief operat', 'diretor de operac'], cdo: ['cdo', 'chief data', 'chief digital'],
        cmo: ['cmo', 'chief marketing'], cso: ['cso', 'chief strateg', 'chief sales'] };
      const removidos = { cargo: 0, local: 0, nome: 0 };
      if (titulos.length && params.cargo_estrito !== false) {
        const alvos = titulos.flatMap(t => SIGLAS[norm(t)] || [norm(t)]);
        people = people.filter(p => { const ok = alvos.some(a => new RegExp('(^|[^a-z])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(norm(p.title))); if (!ok) removidos.cargo++; return ok; });
      }
      if (locais.length) {
        const ls = locais.map(norm);
        people = people.filter(p => { const onde = norm([p.city, p.state, p.country, p.location_city, p.location_country].filter(Boolean).join(' '));
          const ok = !onde || ls.some(l => l.split(',').map(x => x.trim()).filter(Boolean).every(parte => onde.includes(parte))); if (!ok) removidos.local++; return ok; });
      }
      if (params.nome_exato) {
        // v2.90: nome EXATO — primeiro nome igual ao digitado e cada sobrenome como PALAVRA inteira
        // (antes "Ana Lima" passava por "Mariana Limaverde"). Sobrenome ocultado pelo plano ("Me***s")
        // é aceito só se a inicial bater.
        people = people.filter(p => { const ok = _nomeBate(params.nome_exato, p); if (!ok) removidos.nome++; return ok; });
      }
      if (params.empresa_exata) {
        const alvo = normEmp(params.empresa_exata);
        people = people.filter(p => { const e = normEmp(p.organization?.name || p.organization_name || ''); const ok = !!e && (e === alvo || e.includes(alvo) || alvo.includes(e)); if (!ok) removidos.empresa = (removidos.empresa || 0) + 1; return ok; });
      }
      data.people = people;
      data._stats = { total_apollo: data.pagination?.total_entries ?? data.total_entries ?? null, retornados_apollo: (data.people || []).length + removidos.cargo + removidos.local + removidos.nome + (removidos.empresa || 0),
        apos_conferencia: people.length, descartados: removidos, com_li_pessoa: people.filter(p => !!p.linkedin_url).length };
      data._filtros_enviados = { ...body, ...(qs.toString() ? { url: qs.toString() } : {}) };
      console.log('[Apollo] busca', JSON.stringify(body).substring(0, 300), '→', JSON.stringify(data._stats));
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
      // v2.90: o "match" do Apollo pode devolver uma pessoa PARECIDA. Só aceita se for a descrita:
      //  • por e-mail: o e-mail devolvido tem de ser o mesmo (se o plano ocultar o e-mail, aceita — a busca foi pelo e-mail)
      //  • por nome: primeiro nome e sobrenomes batem; com empresa, a empresa também
      if (data.person) {
        const p = data.person; let motivo = null;
        if (params.email && p.email && !_emailBate(params.email, p)) motivo = `e-mail devolvido (${p.email}) é diferente do pedido`;
        if (!motivo && (params.name || params.first_name) && !params.linkedin_url && !params.email && !_nomeBate(params.name || [params.first_name, params.last_name].filter(Boolean).join(' '), p)) motivo = `nome devolvido (${[p.first_name, p.last_name].filter(Boolean).join(' ')}) é outra pessoa`;
        if (!motivo && params.organization_name && !params.email && !params.linkedin_url) {
          const e = normEmp(p.organization?.name || ''), a = normEmp(params.organization_name);
          if (e && !(e === a || e.includes(a) || a.includes(e))) motivo = `empresa devolvida (${p.organization?.name}) é outra`;
        }
        if (motivo) { data._descartado = motivo; data.person = null; }
      }
      console.log('[Apollo person_match] resultado:', data.person ? 'encontrado' : ('nada' + (data._descartado ? ' — ' + data._descartado : '')));
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
