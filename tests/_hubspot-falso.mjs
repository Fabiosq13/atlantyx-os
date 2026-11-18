// HubSpot falso COM ESTADO para testar os movimentos da Floresta (dados sintéticos). modo 'vivo': a busca reflete as gravações na hora;
// modo 'atrasado': a busca devolve a foto de antes da gravação (o pior caso do índice de busca do HubSpot).
import { criarFloresta } from '../lib/floresta.js';
export function ambiente({ atraso = false } = {}) {
  const kvm = {}; const emails = [];
  const st = (id, label, prob, closed) => ({ id, label, displayOrder: Number(id.slice(1)), metadata: { probability: String(prob), isClosed: closed ? 'true' : 'false' } });
  const pipes = [{ id: 'p1', label: 'Atlantyx', stages: [st('s1', 'Qualificação', 0.1), st('s2', 'Reunião agendada', 0.3), st('s3', 'Proposta enviada', 0.5), st('s4', 'Negociação', 0.8), st('s5', 'Ganho', 1, true), st('s6', 'Perdido', 0, true)] }];
  const C = {}, Dl = {}; let foto = null, seq = 100;
  const sql = async (strs, ...v) => { const q = strs.join('?'); if (/FROM disparo_optout/i.test(q)) return []; if (/SELECT value/i.test(q)) return kvm[v[0]] !== undefined ? [{ value: kvm[v[0]] }] : []; if (/INSERT INTO kv_store/i.test(q)) { kvm[v[0]] = JSON.parse(v[1]); } return []; };
  const props = [{ name: 'fluxo_de_atendimento', label: 'Fluxo de atendimento', type: 'enumeration', fieldType: 'select', options: [{ value: 'IA', label: 'IA' }, { value: 'Manual', label: 'Manual' }] }, { name: 'atendido_pela_ia', label: 'Atendido pela IA', type: 'bool', fieldType: 'booleancheckbox', options: [] }, { name: 'resumo_sdr_atlantyx', label: 'Resumo SDR Atlantyx', type: 'string', fieldType: 'textarea' }];
  const ler = () => (atraso && foto ? foto : { C, Dl }); const clonar = () => JSON.parse(JSON.stringify({ C, Dl }));
  const hs = async (path, method = 'GET', body) => {
    if (/pipelines\/deals/.test(path)) return { results: pipes }; if (/owners/.test(path)) return { results: [] }; if (/account-info/.test(path)) return { portalId: 1 }; if (/properties\/contacts/.test(path)) return { results: props };
    if (/deals\/search/.test(path)) return { results: Object.values(ler().Dl).filter(d => !d.arquivado).map(d => ({ id: d.id, properties: { ...d.p } })) };
    if (/associations\/deals\/contacts\/batch\/read/.test(path)) return { results: body.inputs.map(i => ({ from: { id: i.id }, to: (ler().Dl[i.id]?.contatos || []).map(c => ({ toObjectId: c })) })) };
    if (/objects\/contacts$/.test(path) && method === 'POST') { const C = ler().C, id = String(900 + Object.keys(C).length); C[id] = { id, p: { createdate: new Date().toISOString(), lastmodifieddate: new Date().toISOString(), ...body.properties } }; return { id, properties: C[id].p }; }
    if (/contacts\/search/.test(path)) { const em = body?.filterGroups?.[0]?.filters?.find(f => f.propertyName === 'email'); if (em) return { results: Object.values(ler().C).filter(c => String(c.p.email || '').toLowerCase() === String(em.value).toLowerCase()).map(c => ({ id: c.id, properties: { ...c.p } })) }; }
    if (/contacts\/search/.test(path)) return { results: Object.values(ler().C).map(c => ({ id: c.id, properties: { ...c.p, num_associated_deals: String(Object.values(ler().Dl).filter(d => d.contatos.includes(c.id)).length) } })) };
    if (/contacts\/batch\/read/.test(path)) return { results: body.inputs.map(i => ({ id: i.id, properties: { ...(C[i.id]?.p || {}) } })) };
    if (/contacts\/batch\/update/.test(path)) { body.inputs.forEach(i => Object.assign(C[i.id].p, i.properties)); return {}; }
    let m;
    if ((m = path.match(/contacts\/(\w+)\/associations\/deals/))) return { results: Object.values(Dl).filter(d => d.contatos.includes(m[1])).map(d => ({ id: d.id })) };
    if ((m = path.match(/objects\/contacts\/(\w+)$/)) && method === 'PATCH') { const p = C[m[1]].p, n = body.properties; const ORD = ['', 'subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer'];
      if (n.lifecyclestage !== undefined && n.lifecyclestage !== '' && p.lifecyclestage && ORD.indexOf(n.lifecyclestage) < ORD.indexOf(p.lifecyclestage)) throw new Error('HubSpot 400: cannot move lifecycle stage backward'); Object.assign(p, n); return {}; }
    if ((m = path.match(/objects\/deals\/(\w+)(\?.*)?$/)) && method === 'GET') return { id: m[1], properties: { ...Dl[m[1]].p } };
    if ((m = path.match(/objects\/deals\/(\w+)$/)) && method === 'PATCH') { Object.assign(Dl[m[1]].p, body.properties); return {}; }
    if (/objects\/deals$/.test(path) && method === 'POST') { const id = String(++seq); Dl[id] = { id, p: { ...body.properties, hs_lastmodifieddate: new Date().toISOString(), createdate: new Date().toISOString() }, contatos: (body.associations || []).map(a => String(a.to.id)) }; return { id }; }
    return { results: [] };
  };
  const F = criarFloresta({ hs, getSql: async () => sql, claude: async () => '{}', todoCriar: async () => {}, todoListar: async () => [], todoConcluir: async () => {}, avisarVendedor: async m => { emails.push(m); return { ok: true }; }, normTelefone: x => { const d = String(x || '').replace(/\D/g, ''); return d ? (d.length <= 11 ? '55' + d : d) : null; } });
  const contato = (id, p = {}) => { C[id] = { id, p: { firstname: 'Lead', lastname: id, company: 'Empresa ' + id, jobtitle: 'Analista', mobilephone: '21988887777', email: id + '@empresa-teste.com.br', createdate: '2026-10-01T00:00:00Z', lastmodifieddate: '2026-11-10T00:00:00Z', lifecyclestage: 'lead', ...p } }; return 'c:' + id; };
  const negocio = (id, stage, contatoId) => { Dl[id] = { id, p: { dealname: 'Negócio ' + id, dealstage: stage, pipeline: 'p1', hs_lastmodifieddate: new Date().toISOString(), createdate: '2026-10-01T00:00:00Z' }, contatos: contatoId ? [contatoId] : [] }; return 'n:' + id; };
  return { F, kvm, emails, contato, negocio, congelarFoto: () => { foto = clonar(); }, soltarFoto: () => { foto = null; }, expirarMarcas: () => { for (const k of ['vendas:floresta:mov_recente']) delete kvm[k]; const m = kvm['vendas:floresta:iara_marc']; if (m) for (const x of Object.values(m)) x.em = new Date(Date.now() - 3600000).toISOString(); } };
}
