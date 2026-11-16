import test from 'node:test'; import assert from 'node:assert/strict';
import { criarFloresta } from '../lib/floresta.js';
// Fakes em memória: HubSpot, kv (via getSql) e Apollo. Dados sintéticos.
function montar({ apolloEmail = 'ana@exemplo.test', contatos = {}, existente = null } = {}) {
  const chamadas = []; const kvm = {}; const corpos = [];
  const sql = async (strs, ...v) => { const q = strs.join('?'); chamadas.push(q);
    if (/SELECT/i.test(q)) { const k = v[0]; return kvm[k] !== undefined ? [{ value: kvm[k] }] : []; }
    if (/INSERT/i.test(q)) { kvm[v[0]] = JSON.parse(v[1]); return []; } return []; };
  const hs = async (path, metodo = 'GET', body) => { chamadas.push(metodo + ' ' + path); if (body) corpos.push(body);
    if (path.includes('/contacts/search')) return { results: existente && body?.filterGroups?.[0]?.filters?.[0]?.propertyName === 'firstname' ? [{ id: existente }] : [] };
    if (metodo === 'GET' && /\/contacts\/\w+\?/.test(path)) return { properties: {} };
    if (path.includes('batch/read')) return { results: body.inputs.map(i => ({ id: i.id, properties: contatos[i.id] || {} })) };
    if (path.endsWith('/contacts') && metodo === 'POST') return { id: 'H1' };
    return {}; };
  const apolloBuscar = async (params, acao) => { chamadas.push('apollo:' + acao + ':' + JSON.stringify(params).slice(0, 80));
    if (acao === 'enrich_batch') return { results: params.leads.map(l => ({ apollo_id: l.apollo_id, email: apolloEmail, linkedin_url: 'https://linkedin.test/in/ana', first_name: 'Ana', last_name: 'Costa' })) };
    if (acao === 'telefone_buscar') return { status: 'aguardando' };
    return { person: null, _descartado: 'sem match' }; };
  return { corpos, F: criarFloresta({ hs, getSql: async () => sql, claude: async () => '', todoCriar: async () => ({}), todoListar: async () => [], todoConcluir: async () => ({}), normTelefone: x => x, apolloBuscar }), chamadas, kvm };
}
test('importar do Apollo enriquece por padrão e guarda o identificador', async () => {
  const { F, chamadas } = montar();
  const r = await F.importar({ pessoas: [{ apollo_id: 'AP1', nome: 'Ana Co***a', primeiro_nome: 'Ana', sobrenome: 'Co***a', empresa: 'Empresa Teste' }] });
  assert.equal(r.criados, 1); assert.equal(r.emails, 1);
  assert.ok(chamadas.some(c => c.startsWith('apollo:enrich_batch')), 'revelou o e-mail'); assert.ok(chamadas.some(c => c.startsWith('apollo:telefone_buscar')), 'pediu o celular');
});
test('contato que já existia no HubSpot é completado (e-mail gravado e celular pedido), não pulado', async () => {
  const { F, chamadas } = montar({ existente: 'H9' });
  const r = await F.importar({ pessoas: [{ apollo_id: 'AP2', nome: 'Ana Co***a', primeiro_nome: 'Ana', sobrenome: 'Co***a', empresa: 'Empresa Teste' }] });
  assert.equal(r.ja_existiam, 1); assert.equal(r.emails, 1, 'conta o e-mail completado');
  assert.ok(chamadas.some(c => c.startsWith('PATCH /crm/v3/objects/contacts/H9')), 'gravou no contato existente');
  assert.ok(chamadas.some(c => c.startsWith('apollo:telefone_buscar')));
});
test('sem apollo_id não quebra a importação', async () => {
  const { F } = montar(); const r = await F.importar({ pessoas: [{ nome: 'Rui Teste', primeiro_nome: 'Rui', sobrenome: 'Teste', empresa: 'Empresa Teste' }] });
  assert.equal(r.criados, 1);
});

test('importar grava o sobrenome REVELADO, não o mascarado', async () => {
  const { F, corpos } = montar();
  await F.importar({ pessoas: [{ apollo_id: 'AP3', nome: 'Ana Co***a', primeiro_nome: 'Ana', sobrenome: 'Co***a', empresa: 'Empresa Teste' }] });
  const c = corpos.find(b => b.properties?.firstname === 'Ana' && b.properties?.company);
  assert.equal(c.properties.lastname, 'Costa');
});
