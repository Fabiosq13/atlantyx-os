import { comGuarda } from '../lib/qa-guard.js';
import { APOLLO_SENIORIDADES, APOLLO_PORTES, classificarCargo } from '../lib/icp.js';
import { K_INDICE, kLista, listaResumo, listaGravar, listaObter } from '../lib/publico-lista.js'; // v3.239
// api/apollo.js — Enriquecimento via /people/bulk_match com details[{id}]
// Hardened: try/catch em JSON.parse, action person_match adicionada

// ── v2.91: TELEFONE VIA APOLLO (para o WhatsApp IA) ──
// O Apollo NÃO devolve o celular na hora: com reveal_phone_number ele processa e ENTREGA depois num webhook.
// Por isso: (1) pedimos o match com reveal + webhook; (2) se já vier telefone, usamos na hora;
// (3) senão fica "aguardando" e o webhook grava quando chegar; a tela consulta o status.
// Cada revelação de celular CONSOME CRÉDITO no Apollo — o número é guardado aqui e no HubSpot
// para nunca ser pago duas vezes.
let _sqlA = null;
async function sqlA() {
  if (_sqlA) return _sqlA;
  const { neon } = await import('@neondatabase/serverless');
  _sqlA = neon(process.env.DATABASE_URL);
  await _sqlA`CREATE TABLE IF NOT EXISTS apollo_telefones (ref TEXT PRIMARY KEY, apollo_id TEXT, nome TEXT, email TEXT, hubspot_id TEXT,
    telefone TEXT, tipo TEXT, status TEXT DEFAULT 'aguardando', erro TEXT, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  return _sqlA;
}
function _baseUrl() { return (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, ''); }
async function _chaveWebhook() {
  const { createHash } = await import('crypto');
  return createHash('sha256').update('atlantyx-wa:' + (process.env.APOLLO_API_KEY || 'x')).digest('hex').substring(0, 20);
}
function _melhorTelefone(p) {
  const lista = [...(p.phone_numbers || []), ...(p.mobile_phone ? [{ sanitized_number: p.mobile_phone, type_cd: 'mobile' }] : [])]
    .map(x => ({ num: String(x.sanitized_number || x.raw_number || x.number || '').replace(/[^0-9+]/g, ''), tipo: x.type_cd || x.type || '', status: x.status_cd || x.status || '' }))
    .filter(x => x.num.replace(/\D/g, '').length >= 10 && !/invalid|no_status_invalid/i.test(x.status));
  // celular primeiro (é o que tem WhatsApp); no Brasil, número com 9 dígitos após o DDD é celular
  const celBR = x => /^\+?55\d{2}9\d{8}$/.test(x.num);
  lista.sort((a, b) => ((/mobile/i.test(b.tipo) || celBR(b)) ? 1 : 0) - ((/mobile/i.test(a.tipo) || celBR(a)) ? 1 : 0));
  return lista[0] || null;
}
async function _gravarNoHubSpot(hubspotId, telefone) {
  if (!hubspotId || !process.env.HUBSPOT_TOKEN || !telefone) return;
  try {
    await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${hubspotId}`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({ properties: { mobilephone: telefone } }) });
  } catch (e) { console.warn('[Apollo tel] HubSpot:', e.message); }
}

async function handler(req, res) {
  // Webhook do Apollo com o celular revelado
  if (req.query?.webhook === 'telefone') {
    try {
      if (req.query.k !== await _chaveWebhook()) return res.status(403).json({ ok: false });
      const sql = await sqlA();
      const pessoas = req.body?.people || (req.body?.person ? [req.body.person] : []);
      let gravados = 0;
      for (const p of pessoas) {
        const t = _melhorTelefone(p);
        const linha = (await sql`SELECT * FROM apollo_telefones WHERE apollo_id = ${p.id} OR ref = ${req.query.ref || ''} LIMIT 1`)[0];
        if (!linha) continue;
        if (t) { await sql`UPDATE apollo_telefones SET telefone = ${t.num}, tipo = ${t.tipo || null}, status = 'encontrado', atualizado_em = NOW() WHERE ref = ${linha.ref}`; await _gravarNoHubSpot(linha.hubspot_id, t.num); gravados++; }
        else await sql`UPDATE apollo_telefones SET status = 'sem_telefone', atualizado_em = NOW() WHERE ref = ${linha.ref}`;
      }
      console.log('[Apollo webhook telefone]', pessoas.length, 'pessoa(s),', gravados, 'telefone(s)');
      return res.status(200).json({ ok: true, gravados });
    } catch (e) { console.error('[Apollo webhook]', e.message); return res.status(200).json({ ok: false, erro: e.message }); }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, api_key, ...params } = req.body || {};
  const apolloKey = api_key || process.env.APOLLO_API_KEY;
  if (!apolloKey && !/^publico_(listar|obter|excluir|salvar)$/.test(String(action || ''))) return res.status(400).json({ success: false, error: 'APOLLO_API_KEY não configurada' }); // v3.239: listas salvas não precisam da chave

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
    // v3.239: a busca virou função (usada pela busca de pessoas e pela montagem de PÚBLICO para campanha paga)
    const _peopleSearch = async (params) => {
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
      // v3.234: ICP C-level SEMPRE — senioridade dono/sócio/C-level/VP/diretor e porte médio/grande (201+ funcionários).
      // Antes "Todos os cargos" não mandava filtro nenhum (vinha analista, desenvolvedor, estagiário) e o porte nunca ia.
      const buscaPessoa = !!params.nome_exato || !!params.q_organization_domains_list?.length && !!params.q_keywords;
      body.person_seniorities = params.person_seniorities?.length ? params.person_seniorities : (buscaPessoa ? undefined : APOLLO_SENIORIDADES);
      if (!body.person_seniorities) delete body.person_seniorities;
      if (!buscaPessoa) body.organization_num_employees_ranges = params.organization_num_employees_ranges?.length ? params.organization_num_employees_ranges : APOLLO_PORTES;
      if (params.q_keywords) body.q_keywords = params.q_keywords;
      if (params.q_organization_domains_list?.length) body.q_organization_domains_list = params.q_organization_domains_list;

      const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search' + (qs.toString() ? '?' + qs.toString() : ''), { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await r.text();
      if (!r.ok) throw Object.assign(new Error('Apollo ' + r.status + ': ' + text.substring(0, 300)), { status: r.status, enviado: body });
      const data = safeJsonParse(text, 'people_search');
      let people = data.people || [];

      // Conferência: descarta o que não bate com o filtro pedido (o Apollo às vezes amplia a busca)
      const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const SIGLAS = { ceo: ['ceo', 'chief executive', 'presidente', 'diretor presidente', 'president'], cio: ['cio', 'chief information'], cto: ['cto', 'chief technology'],
        cfo: ['cfo', 'chief financial', 'diretor financeiro', 'diretora financeira'], coo: ['coo', 'chief operat', 'diretor de operac'], cdo: ['cdo', 'chief data', 'chief digital'],
        cmo: ['cmo', 'chief marketing'], cso: ['cso', 'chief strateg', 'chief sales'] };
      const removidos = { cargo: 0, local: 0, nome: 0, fora_icp: 0 };
      if (titulos.length && params.cargo_estrito !== false) {
        // v3.234: cargo de várias palavras ("Diretor TI", "VP Technology") casa por PALAVRA — antes exigia a frase
        // literal e "Diretor de TI" / "VP of Technology" eram descartados (0 resultados)
        const VAZIAS = new Set(['de', 'da', 'do', 'of', 'the', 'e', 'and', '&']);
        const esc = a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sin = { ti: ['ti', 'it', 'tecnologia', 'technology', 'information'], technology: ['technology', 'tecnologia', 'ti', 'it'], data: ['data', 'dados', 'analytics'], diretor: ['diretor', 'diretora', 'director'], vp: ['vp', 'vice'] };
        const testes = titulos.map(t => { const n = norm(t); if (SIGLAS[n]) return tt => SIGLAS[n].some(a => new RegExp('(^|[^a-z])' + esc(a)).test(tt));
          const palavras = n.split(/[^a-z0-9]+/).filter(w => w && !VAZIAS.has(w));
          return tt => palavras.every(w => (sin[w] || [w]).some(a => new RegExp('(^|[^a-z])' + esc(a) + '($|[^a-z])').test(tt))); });
        people = people.filter(p => { const ok = testes.some(f => f(norm(p.title))); if (!ok) removidos.cargo++; return ok; });
      }
      // v3.234: nunca devolve cargo técnico/operacional (analista, engenheiro, desenvolvedor, coordenador, estagiário…)
      if (!params.nome_exato) people = people.filter(p => { const ok = !['fora', 'gerencia'].includes(classificarCargo(p.title)); if (!ok) removidos.fora_icp++; return ok; });
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
      return data;
    };
    if (action === 'people_search') {
      try { const data = await _peopleSearch(params); return res.status(200).json({ success: true, ...data }); }
      catch (e) { if (e.enviado) return res.status(e.status || 500).json({ success: false, error: e.message, enviado: e.enviado }); throw e; }
    }


    // ═══ v3.239: PÚBLICO DO APOLLO PARA CAMPANHA PAGA (Meta e LinkedIn) ═══
    // 1) publico_buscar — filtros de área de atuação, cargo, senioridade, porte, local, palavras-chave, faturamento e
    //    empresas-alvo (domínios); traz até 5 páginas de 100. A busca NÃO consome crédito do Apollo.
    // 2) publico_salvar — guarda as pessoas escolhidas como uma lista com nome (kv_store, sem DDL).
    // 3) publico_enriquecer — busca e-mail (e, se pedido, e-mail pessoal) de até 10 por chamada no Apollo. CONSOME
    //    CRÉDITO; quem já foi buscado (nesta ou em outra lista) não é buscado de novo.
    // O envio ao Meta/LinkedIn (hash SHA-256) fica em api/metricool.js (publico_meta_enviar / publico_li_enviar).
    const _kvA = async (k, v) => { const sql = await sqlA();
      await sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`;
      if (v === undefined) { const r = await sql`SELECT value FROM kv_store WHERE key = ${k} LIMIT 1`; const x = r[0]?.value; return typeof x === 'string' ? JSON.parse(x) : (x ?? null); }
      await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v; };
    const _emailOk = e => { const x = String(e || '').trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x) && !/not_unlocked|domain\.com$|example\./.test(x) ? x : null; };
    const _pessoa = p => { const o = p.organization || {};
      return { apollo_id: p.id, primeiro_nome: p.first_name || '', sobrenome: p.last_name || '', sobrenome_oculto: !p.last_name && !!p.last_name_obfuscated,
        nome: [p.first_name, p.last_name || p.last_name_obfuscated].filter(Boolean).join(' ') || p.name || '', cargo: p.title || '', senioridade: p.seniority || null,
        empresa: o.name || p.organization_name || '', dominio: o.primary_domain || o.website_url || '', setor: o.industry || '', funcionarios: o.estimated_num_employees || null,
        cidade: p.city || '', estado: p.state || '', pais: p.country || '', linkedin_url: p.linkedin_url || null,
        email: _emailOk(p.email), tem_email: p.has_email ?? (p.email_status ? p.email_status !== 'unavailable' : null) }; };

    if (action === 'publico_buscar') {
      const lista = v => (Array.isArray(v) ? v : String(v || '').split(/[\n,;]+/)).map(x => String(x).trim()).filter(Boolean);
      const setores = lista(params.setores), cargos = lista(params.cargos), locais = lista(params.locais).length ? lista(params.locais) : ['Brazil'];
      const dominios = lista(params.dominios).map(d => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase());
      const sen = lista(params.senioridades).filter(x => ['owner', 'founder', 'c_suite', 'partner', 'vp', 'director', 'head'].includes(x));
      const portes = lista(params.portes).filter(x => /^\d+,\d*$/.test(x));
      const paginas = Math.max(1, Math.min(5, parseInt(params.paginas) || 1));
      const base = { per_page: 100, person_titles: cargos, cargo_estrito: params.cargo_estrito !== false, setores, person_locations: locais,
        person_seniorities: sen.length ? sen : APOLLO_SENIORIDADES, organization_num_employees_ranges: portes.length ? portes : APOLLO_PORTES,
        ...(params.palavras ? { q_keywords: String(params.palavras).substring(0, 200) } : {}), ...(dominios.length ? { q_organization_domains_list: dominios.slice(0, 200) } : {}),
        ...(params.faturamento_min ? { revenue_min: params.faturamento_min } : {}), ...(params.faturamento_max ? { revenue_max: params.faturamento_max } : {}) };
      const pessoas = [], vistos = new Set(); let total = null; const descartes = { cargo: 0, local: 0, fora_icp: 0 };
      for (let pg = 1; pg <= paginas; pg++) {
        const d = await _peopleSearch({ ...base, page: pg });
        if (total == null) total = d._stats?.total_apollo ?? null;
        Object.keys(descartes).forEach(k => { descartes[k] += d._stats?.descartados?.[k] || 0; });
        for (const p of d.people || []) if (p.id && !vistos.has(p.id)) { vistos.add(p.id); pessoas.push(_pessoa(p)); }
        if ((d._stats?.retornados_apollo || 0) + (d._stats?.descartados?.fora_icp || 0) < 100) break; // página incompleta = acabou
      }
      // quem já teve o e-mail buscado antes (cache) volta com o e-mail — não paga de novo
      const cache = (await _kvA('mkt:apollo_enriq').catch(() => null)) || {};
      pessoas.forEach(p => { const c = cache[p.apollo_id]; if (c) Object.assign(p, { email: p.email || c.email || null, emails_pessoais: c.emails_pessoais || [], primeiro_nome: c.primeiro_nome || p.primeiro_nome, sobrenome: c.sobrenome || p.sobrenome, telefone: c.telefone || null, enriquecido_em: c.em }); });
      return res.status(200).json({ success: true, pessoas, total_apollo: total, descartados: descartes, filtros: base });
    }

    if (action === 'publico_listar') return res.status(200).json({ success: true, listas: (await _kvA(K_INDICE)) || [] });
    if (action === 'publico_obter') { const l = await listaObter(_kvA, params.id); return res.status(200).json({ success: true, lista: l, resumo: listaResumo(l) }); }
    if (action === 'publico_excluir') {
      const ind = ((await _kvA(K_INDICE)) || []).filter(x => x.id !== params.id); await _kvA(K_INDICE, ind); await _kvA(kLista(String(params.id || '')), null);
      return res.status(200).json({ success: true, listas: ind });
    }
    if (action === 'publico_salvar') {
      // nova lista ou acrescenta pessoas a uma existente (sem duplicar); remove = apollo_ids para tirar
      const nome = String(params.nome || '').trim().substring(0, 80);
      const entrada = (Array.isArray(params.pessoas) ? params.pessoas : []).filter(p => p && p.apollo_id).slice(0, 2000).map(p => ({
        apollo_id: String(p.apollo_id), primeiro_nome: String(p.primeiro_nome || '').substring(0, 60), sobrenome: String(p.sobrenome || '').substring(0, 80), nome: String(p.nome || '').substring(0, 120),
        cargo: String(p.cargo || '').substring(0, 150), empresa: String(p.empresa || '').substring(0, 150), dominio: String(p.dominio || '').substring(0, 120), setor: String(p.setor || '').substring(0, 80),
        funcionarios: p.funcionarios || null, cidade: String(p.cidade || '').substring(0, 80), estado: String(p.estado || '').substring(0, 80), pais: String(p.pais || '').substring(0, 60),
        linkedin_url: p.linkedin_url || null, email: _emailOk(p.email), emails_pessoais: (p.emails_pessoais || []).map(_emailOk).filter(Boolean).slice(0, 3), telefone: p.telefone || null, enriquecido_em: p.enriquecido_em || null }));
      let l;
      if (params.id) { l = await listaObter(_kvA, params.id); if (nome) l.nome = nome; }
      else { if (!nome) return res.status(400).json({ success: false, error: 'Dê um nome para a lista' }); l = { id: 'pub_' + Date.now().toString(36), nome, criado_em: new Date().toISOString(), filtros: params.filtros || {}, pessoas: [] }; }
      const tirar = new Set((params.remover || []).map(String));
      const ja = new Map(l.pessoas.filter(p => !tirar.has(p.apollo_id)).map(p => [p.apollo_id, p]));
      for (const p of entrada) ja.set(p.apollo_id, { ...(ja.get(p.apollo_id) || {}), ...p, email: p.email || ja.get(p.apollo_id)?.email || null });
      l.pessoas = [...ja.values()].slice(0, 5000);
      return res.status(200).json({ success: true, lista: await listaGravar(_kvA, l) });
    }
    if (action === 'publico_enriquecer') {
      const l = await listaObter(_kvA, params.id);
      const cache = (await _kvA('mkt:apollo_enriq').catch(() => null)) || {};
      const pessoais = !!params.emails_pessoais;
      // já buscados (aqui ou em outra lista) entram do cache, sem crédito
      l.pessoas.forEach(p => { const c = cache[p.apollo_id]; if (!p.enriquecido_em && c) Object.assign(p, { email: p.email || c.email, emails_pessoais: c.emails_pessoais || [], primeiro_nome: c.primeiro_nome || p.primeiro_nome, sobrenome: c.sobrenome || p.sobrenome, telefone: p.telefone || c.telefone || null, enriquecido_em: c.em }); });
      const fila = l.pessoas.filter(p => !p.enriquecido_em).slice(0, 10);
      if (fila.length) {
        const r = await fetch('https://api.apollo.io/api/v1/people/bulk_match', { method: 'POST', headers, body: JSON.stringify({ details: fila.map(p => ({ id: p.apollo_id })), reveal_personal_emails: pessoais }) });
        const text = await r.text();
        if (!r.ok) return res.status(200).json({ success: false, error: r.status === 402 || /credit/i.test(text) ? 'Sem créditos de e-mail no Apollo' : 'Apollo ' + r.status + ': ' + text.substring(0, 200) });
        const d = safeJsonParse(text, 'publico_enriquecer'); const ms = d.matches || d.people || [];
        const agora = new Date().toISOString();
        for (const p of fila) {
          const m = ms.find(x => (x?.id || x?.person?.id) === p.apollo_id); const q = m?.person || m || null;
          if (q) { p.email = _emailOk(q.email) || p.email; p.emails_pessoais = (q.personal_emails || []).map(_emailOk).filter(Boolean).slice(0, 3);
            p.primeiro_nome = q.first_name || p.primeiro_nome; p.sobrenome = q.last_name || p.sobrenome; p.sobrenome_oculto = false; p.nome = [p.primeiro_nome, p.sobrenome].filter(Boolean).join(' ');
            p.linkedin_url = q.linkedin_url || p.linkedin_url; p.cidade = q.city || p.cidade; p.estado = q.state || p.estado; p.pais = q.country || p.pais; p.cargo = q.title || p.cargo; }
          p.enriquecido_em = agora;
          cache[p.apollo_id] = { email: p.email || null, emails_pessoais: p.emails_pessoais || [], primeiro_nome: p.primeiro_nome, sobrenome: p.sobrenome, telefone: p.telefone || null, em: agora };
        }
        const ks = Object.keys(cache); if (ks.length > 8000) ks.slice(0, ks.length - 8000).forEach(k => delete cache[k]);
        await _kvA('mkt:apollo_enriq', cache);
      }
      const resumo = await listaGravar(_kvA, l);
      return res.status(200).json({ success: true, lista: resumo, buscados_agora: fila.length, faltam: l.pessoas.filter(p => !p.enriquecido_em).length });
    }

    // ── v2.91: TELEFONE para o WhatsApp ──
    if (action === 'telefone_buscar') {
      const sql = await sqlA();
      const ref = String(params.ref || params.email || params.hubspot_id || params.name || '').toLowerCase().trim();
      if (!ref) return res.status(400).json({ success: false, error: 'Informe e-mail, nome+empresa ou LinkedIn' });
      const ja = (await sql`SELECT * FROM apollo_telefones WHERE ref = ${ref}`)[0];
      if (ja && (ja.status === 'encontrado' || (ja.status === 'aguardando' && Date.now() - new Date(ja.atualizado_em).getTime() < 10 * 60000) || ja.status === 'sem_telefone') && !params.forcar)
        return res.status(200).json({ success: true, ref, status: ja.status, telefone: ja.telefone, de_cache: true });
      const body = { reveal_phone_number: true, webhook_url: `${_baseUrl()}/api/apollo?webhook=telefone&k=${await _chaveWebhook()}&ref=${encodeURIComponent(ref)}` };
      if (params.email) body.email = params.email;
      if (params.linkedin_url) body.linkedin_url = params.linkedin_url;
      if (params.name) { const pp = String(params.name).trim().split(/\s+/); body.first_name = pp[0]; if (pp.length > 1) body.last_name = pp.slice(1).join(' '); }
      if (params.organization_name) body.organization_name = params.organization_name;
      if (!body.email && !body.linkedin_url && !(body.first_name && body.organization_name))
        return res.status(400).json({ success: false, error: 'Para achar o telefone com segurança: e-mail, LinkedIn, ou nome + empresa' });
      const r = await fetch('https://api.apollo.io/api/v1/people/match', { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await r.text();
      if (!r.ok) {
        const msg = r.status === 422 && /webhook/i.test(text) ? 'o Apollo exige webhook para revelar celular' : r.status === 402 || /credit/i.test(text) ? 'sem créditos de celular no Apollo' : 'Apollo ' + r.status + ': ' + text.substring(0, 200);
        await sql`INSERT INTO apollo_telefones (ref, email, nome, hubspot_id, status, erro) VALUES (${ref}, ${params.email || null}, ${params.name || null}, ${params.hubspot_id || null}, 'erro', ${msg})
          ON CONFLICT (ref) DO UPDATE SET status = 'erro', erro = EXCLUDED.erro, atualizado_em = NOW()`;
        return res.status(200).json({ success: true, ref, status: 'erro', erro: msg });
      }
      const data = safeJsonParse(text, 'telefone_buscar');
      const p = data.person;
      // mesma conferência da busca direta: só a pessoa descrita
      let descartado = null;
      if (p && params.email && p.email && !_emailBate(params.email, p)) descartado = `o Apollo devolveu outra pessoa (${p.email})`;
      if (p && !descartado && !params.email && !params.linkedin_url && params.name && !_nomeBate(params.name, p)) descartado = `o Apollo devolveu outra pessoa (${[p.first_name, p.last_name].join(' ')})`;
      if (!p || descartado) {
        await sql`INSERT INTO apollo_telefones (ref, email, nome, hubspot_id, status, erro) VALUES (${ref}, ${params.email || null}, ${params.name || null}, ${params.hubspot_id || null}, 'nao_encontrado', ${descartado})
          ON CONFLICT (ref) DO UPDATE SET status = 'nao_encontrado', erro = EXCLUDED.erro, atualizado_em = NOW()`;
        return res.status(200).json({ success: true, ref, status: 'nao_encontrado', erro: descartado || 'pessoa não encontrada no Apollo' });
      }
      const t = _melhorTelefone(p);
      const status = t ? 'encontrado' : 'aguardando';
      await sql`INSERT INTO apollo_telefones (ref, apollo_id, nome, email, hubspot_id, telefone, tipo, status)
        VALUES (${ref}, ${p.id}, ${[p.first_name, p.last_name].filter(Boolean).join(' ')}, ${params.email || p.email || null}, ${params.hubspot_id || null}, ${t?.num || null}, ${t?.tipo || null}, ${status})
        ON CONFLICT (ref) DO UPDATE SET apollo_id = EXCLUDED.apollo_id, telefone = COALESCE(EXCLUDED.telefone, apollo_telefones.telefone), tipo = EXCLUDED.tipo, status = EXCLUDED.status, erro = NULL, atualizado_em = NOW()`;
      if (t) await _gravarNoHubSpot(params.hubspot_id, t.num);
      return res.status(200).json({ success: true, ref, status, telefone: t?.num || null, tipo: t?.tipo || null, pessoa: [p.first_name, p.last_name].filter(Boolean).join(' '), empresa: p.organization?.name || null });
    }
    if (action === 'telefone_status') {
      const sql = await sqlA();
      const refs = (params.refs || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
      if (!refs.length) return res.status(200).json({ success: true, itens: [] });
      const rows = await sql`SELECT ref, telefone, status, erro, atualizado_em FROM apollo_telefones WHERE ref = ANY(${refs})`;
      return res.status(200).json({ success: true, itens: rows });
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
      disponiveis: ['people_search', 'person_match', 'enrich_batch', 'publico_buscar', 'publico_salvar', 'publico_listar', 'publico_obter', 'publico_excluir', 'publico_enriquecer'],
    });

  } catch (e) {
    console.error('[Apollo]', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'apollo');
