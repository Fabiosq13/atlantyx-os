// api/hubspot-sync.js — v2.87
// Envio robusto de contatos ao HubSpot, usado pelo Feed de Prospecção e pelo formulário de captura.
//  • upsert: procura o contato pelo e-mail (ou telefone) antes de criar — não duplica nem falha com "já existe"
//  • só propriedades PADRÃO do HubSpot; propriedades extras são tentadas e, se não existirem, descartadas
//  • empresa: acha pelo domínio/nome ou cria, e associa ao contato
//  • nota no contato com o contexto (onde se conheceram) e a análise da empresa
//  • negócio (deal) opcional no pipeline HUBSPOT_PIPELINE_ID, no primeiro estágio se nenhum for configurado
const API = 'https://api.hubapi.com';
const H = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` });
async function hs(path, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: H(), ...(body ? { body: JSON.stringify(body) } : {}) });
  const txt = await r.text(); let d; try { d = txt ? JSON.parse(txt) : {}; } catch { d = { raw: txt }; }
  if (!r.ok) { const e = new Error(`HubSpot ${r.status}: ${d.message || txt.substring(0, 200)}`); e.status = r.status; e.body = d; throw e; }
  return d;
}
const PESSOAIS = /gmail|hotmail|outlook|yahoo|icloud|uol|bol|terra|live\./i;

async function buscarContato({ email, telefone }) {
  const filtros = email ? [{ propertyName: 'email', operator: 'EQ', value: email }] : telefone ? [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: String(telefone).slice(-8) }] : null;
  if (!filtros) return null;
  const d = await hs('/crm/v3/objects/contacts/search', 'POST', { filterGroups: [{ filters: filtros }], properties: ['email', 'firstname', 'lastname'], limit: 1 });
  return d.results?.[0] || null;
}
// cria/atualiza removendo propriedades que o portal não tem (erro PROPERTY_DOESNT_EXIST)
async function gravarComPropriedades(path, method, props) {
  let p = { ...props };
  for (let i = 0; i < 4; i++) {
    try { return await hs(path, method, { properties: p }); }
    catch (e) {
      const inval = (e.body?.errors || []).flatMap(x => x.context?.propertyName || []).concat(
        [...String(e.message).matchAll(/Property \"?([a-z0-9_]+)\"? does not exist/gi)].map(m => m[1]));
      if (e.status === 400 && inval.length) { inval.forEach(k => delete p[k]); continue; }
      throw e;
    }
  }
  return await hs(path, method, { properties: p });
}
async function acharOuCriarEmpresa({ empresa, email }) {
  const dominio = email && !PESSOAIS.test(email) ? email.split('@')[1] : null;
  if (!empresa && !dominio) return null;
  const filtros = dominio ? [{ propertyName: 'domain', operator: 'EQ', value: dominio }] : [{ propertyName: 'name', operator: 'EQ', value: empresa }];
  const d = await hs('/crm/v3/objects/companies/search', 'POST', { filterGroups: [{ filters: filtros }], limit: 1 });
  if (d.results?.[0]) return d.results[0].id;
  const c = await gravarComPropriedades('/crm/v3/objects/companies', 'POST', { name: empresa || dominio.split('.')[0], ...(dominio ? { domain: dominio } : {}) });
  return c.id;
}
async function associar(de, deId, para, paraId) { try { await hs(`/crm/v4/objects/${de}/${deId}/associations/default/${para}/${paraId}`, 'PUT'); } catch (e) { console.warn('[hubspot] associação', de, para, e.message); } }
async function primeiroEstagio(pipelineId) {
  try { const d = await hs(`/crm/v3/pipelines/deals/${pipelineId}`); const st = (d.stages || []).sort((a, b) => a.displayOrder - b.displayOrder); return st[0]?.id || null; } catch { return null; }
}

// Contato completo: upsert + empresa + nota + (opcional) negócio
export async function enviarContatoHubSpot(c, { nota, origem = 'Atlantyx OS', criarNegocio = true } = {}) {
  if (!process.env.HUBSPOT_TOKEN) { const e = new Error('HUBSPOT_TOKEN não configurado no Vercel'); e.dica = 'HubSpot → Configurações → Integrações → Apps privados → crie um app com os escopos crm.objects.contacts/companies/deals (leitura e escrita) e crm.objects.notes, copie o token e crie HUBSPOT_TOKEN no Vercel (Production) + Redeploy.'; throw e; }
  const nome = String(c.nome || '').trim();
  const props = {
    firstname: nome.split(' ')[0] || nome, lastname: nome.split(' ').slice(1).join(' '),
    ...(c.email ? { email: c.email } : {}), ...(c.telefone ? { phone: '+' + String(c.telefone).replace(/[^0-9]/g, '') } : {}),
    ...(c.empresa ? { company: c.empresa } : {}), ...(c.cargo ? { jobtitle: c.cargo } : {}),
    lifecyclestage: 'lead', hs_lead_status: 'NEW',
    // extras: gravados se existirem no portal; se não, descartados sem derrubar o envio
    ...(c.origem || origem ? { lead_source_campaign: c.origem || origem } : {}), ...(c.score ? { icp_score: c.score } : {}),
  };
  const out = { acao: null };
  const existente = await buscarContato({ email: c.email, telefone: !c.email ? c.telefone : null });
  if (existente) {
    const upd = { ...props }; delete upd.lifecyclestage;   // não rebaixa quem já é cliente/oportunidade
    await gravarComPropriedades(`/crm/v3/objects/contacts/${existente.id}`, 'PATCH', upd);
    out.contato_id = existente.id; out.acao = 'atualizado';
  } else {
    const novo = await gravarComPropriedades('/crm/v3/objects/contacts', 'POST', props);
    out.contato_id = novo.id; out.acao = 'criado';
  }
  try { out.empresa_id = await acharOuCriarEmpresa(c); if (out.empresa_id) await associar('contacts', out.contato_id, 'companies', out.empresa_id); } catch (e) { out.aviso_empresa = e.message; }
  if (nota) {
    try {
      const n = await hs('/crm/v3/objects/notes', 'POST', { properties: { hs_note_body: String(nota).substring(0, 60000), hs_timestamp: new Date().toISOString() },
        associations: [{ to: { id: out.contato_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] });
      out.nota_id = n.id;
    } catch (e) { out.aviso_nota = e.message; }
  }
  if (criarNegocio && process.env.HUBSPOT_PIPELINE_ID && out.acao === 'criado') {
    try {
      const estagio = process.env.HUBSPOT_STAGE_PROSPECCAO || process.env.HUBSPOT_STAGE_MAPEADO || await primeiroEstagio(process.env.HUBSPOT_PIPELINE_ID);
      const deal = await gravarComPropriedades('/crm/v3/objects/deals', 'POST', { dealname: `${c.empresa || nome} — ${origem}`, pipeline: process.env.HUBSPOT_PIPELINE_ID, ...(estagio ? { dealstage: estagio } : {}) });
      out.negocio_id = deal.id;
      await associar('deals', deal.id, 'contacts', out.contato_id);
      if (out.empresa_id) await associar('deals', deal.id, 'companies', out.empresa_id);
    } catch (e) { out.aviso_negocio = e.message; }
  }
  out.link = `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID || ''}/record/0-1/${out.contato_id}`.replace('/contacts//', '/contacts/');
  return out;
}
export async function registrarAtividade(contatoId, texto) {
  if (!process.env.HUBSPOT_TOKEN || !contatoId) return null;
  try {
    await hs(`/crm/v3/objects/contacts/${contatoId}`, 'PATCH', { properties: { hs_lead_status: 'ATTEMPTED_TO_CONTACT' } }).catch(() => {});
    return await hs('/crm/v3/objects/notes', 'POST', { properties: { hs_note_body: texto, hs_timestamp: new Date().toISOString() },
      associations: [{ to: { id: contatoId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] });
  } catch (e) { console.warn('[hubspot] atividade', e.message); return null; }
}
export async function testarHubSpot() {
  const out = { token: !!process.env.HUBSPOT_TOKEN, pipeline: process.env.HUBSPOT_PIPELINE_ID || null };
  if (!out.token) return { ...out, ok: false, erro: 'HUBSPOT_TOKEN não configurado', como: 'HubSpot → Configurações → Integrações → Apps privados → criar app com escopos de contatos, empresas, negócios e notas (leitura/escrita) → copiar o token → HUBSPOT_TOKEN no Vercel (Production) → Redeploy.' };
  const teste = async (nome, fn) => { try { await fn(); out[nome] = 'ok'; } catch (e) { out[nome] = e.status === 403 ? 'sem permissão (escopo faltando no app privado)' : e.message.substring(0, 120); } };
  await teste('contatos', () => hs('/crm/v3/objects/contacts?limit=1'));
  await teste('empresas', () => hs('/crm/v3/objects/companies?limit=1'));
  await teste('negocios', () => hs('/crm/v3/objects/deals?limit=1'));
  await teste('notas', () => hs('/crm/v3/objects/notes?limit=1'));
  if (out.pipeline) await teste('pipeline', () => hs(`/crm/v3/pipelines/deals/${out.pipeline}`));
  out.ok = out.contatos === 'ok';
  return out;
}
