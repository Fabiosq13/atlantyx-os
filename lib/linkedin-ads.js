// lib/linkedin-ads.js — v3.239 · CAMPANHA PAGA NO LINKEDIN (Marketing API / Campaign Manager)
// Mesmo princípio da campanha do Meta: o sistema cria grupo → campanha → anúncio de imagem única com botão
// "Saiba mais", TUDO PAUSADO. Nada é cobrado até o fundador clicar "Ativar" na tela.
// Público: (a) ICP C-level pelos filtros do próprio LinkedIn — senioridade Dono/Sócio/CXO/VP/Diretor, empresas com
// 201+ funcionários, Brasil — ou (b) uma LISTA de pessoas selecionadas no Apollo (Matched Audience: e-mail com hash
// SHA-256 + nome, cargo e empresa).
// Conexão por OAuth do LinkedIn (o token não fica em variável: fica no banco, em chave que a API genérica não lê).
// Variáveis na Vercel: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET · opcionais: LINKEDIN_AD_ACCOUNT_ID (senão usa a 1ª conta
// ativa do usuário conectado), LINKEDIN_ORG_ID (página da empresa; senão a página dona da conta), LINKEDIN_API_VERSION,
// LINKEDIN_SCOPES. O app do LinkedIn precisa do produto "Advertising API" (e "Matched Audiences" para listas).
import crypto from 'node:crypto';
import { linhasLinkedin } from './publico-lista.js';

let _kv = null;
export const liUsarKv = f => { _kv = f; };
const kv = (k, v) => { if (!_kv) throw new Error('kv não configurado'); return _kv(k, v); };
const _env = k => String(process.env[k] || '').trim().replace(/^["']|["']$/g, '').trim();
const err = (m, status = 400) => Object.assign(new Error(m), { status });

export const LI_ESCOPOS_PADRAO = 'r_ads rw_ads r_ads_reporting r_organization_social w_organization_social rw_dmp_segments';
const K_TOKEN = 'li:oauth:tokens', K_STATE = 'li:oauth:state', K_CONTA = 'li:ads:conta', K_VER = 'li:ads:versao';

// ICP C-level no LinkedIn: senioridade e porte (filtros de quem OCUPA o cargo, informados no perfil)
export const LI_SENIORIDADES = ['urn:li:seniority:10', 'urn:li:seniority:9', 'urn:li:seniority:8', 'urn:li:seniority:7', 'urn:li:seniority:6']; // Dono, Sócio, CXO, VP, Diretor
export const LI_PORTES = ['urn:li:staffCountRange:(201,500)', 'urn:li:staffCountRange:(501,1000)', 'urn:li:staffCountRange:(1001,5000)', 'urn:li:staffCountRange:(5001,10000)', 'urn:li:staffCountRange:(10001,2147483647)'];
export const LI_BRASIL = 'urn:li:geo:106057199';

export const liCfg = () => ({ id: _env('LINKEDIN_CLIENT_ID'), segredo: _env('LINKEDIN_CLIENT_SECRET'), conta: _env('LINKEDIN_AD_ACCOUNT_ID').replace(/\D/g, ''), org: _env('LINKEDIN_ORG_ID').replace(/\D/g, ''), escopos: _env('LINKEDIN_SCOPES') || LI_ESCOPOS_PADRAO });
export const liRedirect = base => base.replace(/\/$/, '') + '/api/metricool?li=callback';

// ── versão da API (YYYYMM). O LinkedIn desliga versões com ~1 ano; sem LINKEDIN_API_VERSION usa 2 meses atrás e,
// se a versão não existir, volta um mês por vez (guarda a que funcionou)
let _ver = null;
const _ym = d => d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0');
const _anterior = v => { const d = new Date(Date.UTC(+v.substring(0, 4), +v.substring(4, 6) - 2, 1)); return _ym(d); };
async function _versao() {
  if (_env('LINKEDIN_API_VERSION')) return _env('LINKEDIN_API_VERSION');
  if (_ver) return _ver;
  try { const v = await kv(K_VER); if (v?.versao && Date.now() - (v.em || 0) < 20 * 864e5) return (_ver = v.versao); } catch (_) {}
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 2); return (_ver = _ym(d));
}

// ── tokens
async function _token() {
  const t = await kv(K_TOKEN);
  if (!t?.access_token) throw err('LinkedIn não conectado — clique em "Conectar LinkedIn" na tela da campanha patrocinada');
  if (t.expira_em && Date.now() < t.expira_em - 120e3) return t.access_token;
  if (!t.refresh_token || (t.refresh_expira_em && Date.now() > t.refresh_expira_em)) throw err('A conexão com o LinkedIn expirou — clique em "Conectar LinkedIn" de novo');
  const c = liCfg();
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: c.id, client_secret: c.segredo }).toString() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw err('Não renovou a conexão com o LinkedIn (' + (d.error_description || d.error || 'HTTP ' + r.status) + ') — conecte de novo');
  const novo = { ...t, access_token: d.access_token, expira_em: Date.now() + (d.expires_in || 5184000) * 1000, ...(d.refresh_token ? { refresh_token: d.refresh_token, refresh_expira_em: Date.now() + (d.refresh_token_expires_in || 31536000) * 1000 } : {}) };
  await kv(K_TOKEN, novo); return novo.access_token;
}

// ── chamada à API REST versionada (Rest.li 2.0)
export async function li(caminho, { metodo = 'GET', corpo = null, restli = null, bruto = false } = {}) {
  const tk = await _token();
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const ver = await _versao();
    const h = { Authorization: 'Bearer ' + tk, 'LinkedIn-Version': ver, 'X-Restli-Protocol-Version': '2.0.0' };
    if (corpo) h['Content-Type'] = 'application/json';
    if (restli) h['X-RestLi-Method'] = restli;
    const r = await fetch('https://api.linkedin.com/rest/' + caminho.replace(/^\//, ''), { method: metodo, headers: h, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const txt = await r.text(); let d = {}; try { d = txt ? JSON.parse(txt) : {}; } catch (_) { d = { mensagem: txt.substring(0, 300) }; }
    if (!r.ok && (r.status === 426 || /NONEXISTENT_VERSION|VERSION_MISSING|version .*(not|no longer) (active|supported)/i.test(txt)) && !_env('LINKEDIN_API_VERSION')) {
      _ver = _anterior(ver); continue; // versão desligada → um mês antes
    }
    if (!r.ok) {
      const m = d.message || d.mensagem || ('HTTP ' + r.status);
      const dica = r.status === 403 ? ' — o app do LinkedIn precisa do produto "Advertising API" (e "Matched Audiences" para listas) e o usuário conectado precisa ser gerente da conta de anúncios' : r.status === 401 ? ' — conecte o LinkedIn de novo' : '';
      throw err('LinkedIn: ' + m + dica, r.status >= 500 ? 502 : 400);
    }
    try { await kv(K_VER, { versao: ver, em: Date.now() }); } catch (_) {}
    const id = r.headers.get('x-restli-id') || r.headers.get('x-linkedin-id') || null;
    return bruto ? { dados: d, id, status: r.status } : Object.assign(d, id ? { _id: id } : {});
  }
  throw err('LinkedIn: nenhuma versão da API aceita — informe LINKEDIN_API_VERSION na Vercel');
}
const _idDe = urnOuId => String(urnOuId || '').split(':').pop();

// ── OAuth
export async function liUrlConectar(base) {
  const c = liCfg(); if (!c.id || !c.segredo) throw err('Cadastre LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET na Vercel (app do LinkedIn com o produto Advertising API)');
  const state = crypto.randomBytes(16).toString('hex');
  await kv(K_STATE, { state, em: Date.now() });
  const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
  u.searchParams.set('response_type', 'code'); u.searchParams.set('client_id', c.id); u.searchParams.set('redirect_uri', liRedirect(base));
  u.searchParams.set('state', state); u.searchParams.set('scope', c.escopos);
  return { url: u.toString(), redirect_uri: liRedirect(base) };
}
export async function liCallback({ code, state, error, error_description }, base) {
  if (error) throw err('O LinkedIn recusou a conexão: ' + (error_description || error) + (/scope/i.test(error + error_description) ? ' (o app ainda não tem um dos produtos/permissões pedidos — confira "Advertising API" e "Matched Audiences" no app)' : ''));
  const st = await kv(K_STATE);
  if (!st?.state || st.state !== state || Date.now() - st.em > 15 * 60e3) throw err('Conexão expirada ou de outra origem — clique em "Conectar LinkedIn" de novo');
  const c = liCfg();
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: liRedirect(base), client_id: c.id, client_secret: c.segredo }).toString() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw err('Não conectou: ' + (d.error_description || d.error || 'HTTP ' + r.status));
  const agora = Date.now();
  await kv(K_TOKEN, { access_token: d.access_token, expira_em: agora + (d.expires_in || 5184000) * 1000, refresh_token: d.refresh_token || null,
    refresh_expira_em: d.refresh_token ? agora + (d.refresh_token_expires_in || 31536000) * 1000 : null, escopos: d.scope || c.escopos, conectado_em: new Date().toISOString() });
  await kv(K_STATE, { state: null, em: 0 });
  try { await liConta(true); } catch (_) {}
  return { ok: true };
}

// ── conta de anúncios (env > escolhida > 1ª ativa do usuário)
export async function liConta(recarregar = false) {
  const c = liCfg();
  const salvo = await kv(K_CONTA).catch(() => null);
  if (!recarregar && salvo?.id && (!c.conta || salvo.id === c.conta) && Date.now() - (salvo.em || 0) < 864e5) return salvo;
  let id = c.conta;
  if (!id) {
    const u = await li('adAccountUsers?q=authenticatedUser');
    const contas = (u.elements || []).map(e => _idDe(e.account)).filter(Boolean);
    for (const x of contas) { try { const a = await li('adAccounts/' + x); if (a.status === 'ACTIVE') { id = x; break; } } catch (_) {} }
    if (!id) id = contas[0];
  }
  if (!id) throw err('O usuário conectado não gerencia nenhuma conta de anúncios do LinkedIn');
  const a = await li('adAccounts/' + id);
  const v = { id: String(id), nome: a.name || '', moeda: a.currency || 'BRL', status: a.status || '', org: c.org || _idDe(a.reference) || '', em: Date.now() };
  await kv(K_CONTA, v); return v;
}

export async function liStatus(base) {
  const c = liCfg(); const out = { configurado: !!(c.id && c.segredo), conectado: false, redirect_uri: liRedirect(base), escopos_pedidos: c.escopos };
  if (!out.configurado) { out.falta = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'].filter(k => !_env(k)); return out; }
  const t = await kv(K_TOKEN).catch(() => null);
  if (!t?.access_token) return out;
  out.conectado = true; out.conectado_em = t.conectado_em; out.expira_em = t.expira_em ? new Date(t.expira_em).toISOString() : null; out.renova_sozinho = !!t.refresh_token;
  try { out.conta = await liConta(); if (!out.conta.org) out.aviso = 'Informe LINKEDIN_ORG_ID (página da empresa no LinkedIn) — o anúncio sai em nome dela'; }
  catch (e) { out.erro = e.message; }
  return out;
}

// ── público
function _alvo({ segmento = null } = {}) {
  const e = [{ or: { 'urn:li:adTargetingFacet:locations': [LI_BRASIL] } }];
  if (segmento) e.push({ or: { 'urn:li:adTargetingFacet:audienceMatchingSegments': [segmento] } });
  else e.push({ or: { 'urn:li:adTargetingFacet:seniorities': LI_SENIORIDADES } }, { or: { 'urn:li:adTargetingFacet:staffCountRanges': LI_PORTES } });
  return { include: { and: e } };
}

async function _imagem(urlImg, org) {
  const ri = await fetch(urlImg); if (!ri.ok) throw err('Não consegui baixar a imagem do anúncio (HTTP ' + ri.status + ')');
  const bytes = Buffer.from(await ri.arrayBuffer());
  const ini = await li('images?action=initializeUpload', { metodo: 'POST', corpo: { initializeUploadRequest: { owner: 'urn:li:organization:' + org } } });
  const up = ini.value || {}; if (!up.uploadUrl || !up.image) throw err('LinkedIn não devolveu o endereço de envio da imagem');
  const tk = await _token();
  const r = await fetch(up.uploadUrl, { method: 'PUT', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/octet-stream' }, body: bytes });
  if (!r.ok) throw err('LinkedIn recusou a imagem (HTTP ' + r.status + ')');
  for (let i = 0; i < 6; i++) { try { const s = await li('images/' + encodeURIComponent(up.image)); if (s.status === 'AVAILABLE') break; } catch (_) {} await new Promise(ok => setTimeout(ok, 1500)); }
  return up.image;
}

// cria grupo + campanha + anúncio, TUDO PAUSADO
export async function liCriar(p) {
  const conta = await liConta();
  if (!conta.org) throw err('Informe LINKEDIN_ORG_ID (id numérico da página da empresa no LinkedIn) na Vercel — o anúncio sai em nome da página');
  const A = conta.id, acc = 'urn:li:sponsoredAccount:' + A;
  const ms = (d, fim) => new Date(d + (fim ? 'T23:59:00-03:00' : 'T08:00:00-03:00')).getTime();
  const inicio = Math.max(ms(p.inicio), Date.now() + 5 * 60e3);
  const criados = {};
  const desfazer = async () => {
    for (const [tipo, id] of [['adCampaigns', criados.campanha], ['adCampaignGroups', criados.grupo]]) {
      if (!id) continue;
      try { await li(`adAccounts/${A}/${tipo}/${id}`, { metodo: 'DELETE' }); }
      catch (_) { try { await li(`adAccounts/${A}/${tipo}/${id}`, { metodo: 'POST', restli: 'PARTIAL_UPDATE', corpo: { patch: { $set: { status: 'ARCHIVED' } } } }); } catch (__) {} }
    }
  };
  try {
    const g = await li(`adAccounts/${A}/adCampaignGroups`, { metodo: 'POST', corpo: { account: acc, name: p.nome, status: 'PAUSED', runSchedule: { start: inicio, end: ms(p.fim, true) } } });
    criados.grupo = _idDe(g._id); if (!criados.grupo) throw err('LinkedIn não devolveu o id do grupo de campanhas');
    const camp = { account: acc, campaignGroup: 'urn:li:sponsoredCampaignGroup:' + criados.grupo, name: p.nome, type: 'SPONSORED_UPDATES', objectiveType: 'WEBSITE_VISIT',
      costType: 'CPM', optimizationTargetType: 'MAX_CLICK', dailyBudget: { amount: Number(p.orcamento_diario).toFixed(2), currencyCode: conta.moeda || 'BRL' },
      runSchedule: { start: inicio, end: ms(p.fim, true) }, locale: { country: 'BR', language: 'pt' }, offsiteDeliveryEnabled: false, audienceExpansionEnabled: false,
      politicalIntent: 'NOT_POLITICAL', status: 'PAUSED', targetingCriteria: _alvo({ segmento: p.segmento || null }) };
    const c = await li(`adAccounts/${A}/adCampaigns`, { metodo: 'POST', corpo: camp });
    criados.campanha = _idDe(c._id); if (!criados.campanha) throw err('LinkedIn não devolveu o id da campanha');
    const img = await _imagem(p.imagem, conta.org);
    const post = { adContext: { dscAdAccount: acc, dscStatus: 'ACTIVE' }, author: 'urn:li:organization:' + conta.org, commentary: p.texto, visibility: 'PUBLIC', lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false, content: { media: { title: p.titulo, id: img } }, contentLandingPage: p.link, contentCallToActionLabel: 'LEARN_MORE' };
    const cr = await li(`adAccounts/${A}/creatives?action=createInline`, { metodo: 'POST', corpo: { creative: { inlineContent: { post }, campaign: 'urn:li:sponsoredCampaign:' + criados.campanha, intendedStatus: 'PAUSED' } } });
    criados.criativo = cr.value?.creative || cr.value?.id || cr._id || null;
    return { id: 'li_' + criados.campanha, rede: 'linkedin', conta: A, grupo_id: criados.grupo, campanha_id: criados.campanha, criativo_id: criados.criativo, moeda: conta.moeda,
      gerenciador: `https://www.linkedin.com/campaignmanager/accounts/${A}/campaigns/${criados.campanha}/details` };
  } catch (e) { await desfazer(); throw err(e.message + ' (nada ficou criado no LinkedIn)', e.status || 400); }
}

const _set = (A, tipo, id, campos) => li(`adAccounts/${A}/${tipo}/${tipo === 'creatives' ? encodeURIComponent(id) : id}`, { metodo: 'POST', restli: 'PARTIAL_UPDATE', corpo: { patch: { $set: campos } } });
export async function liEstado(reg, estado) {
  if (estado === 'ACTIVE') { // grupo → campanha → anúncio
    await _set(reg.conta, 'adCampaignGroups', reg.grupo_id, { status: 'ACTIVE' });
    await _set(reg.conta, 'adCampaigns', reg.campanha_id, { status: 'ACTIVE' });
    if (reg.criativo_id) await _set(reg.conta, 'creatives', reg.criativo_id, { intendedStatus: 'ACTIVE' });
  } else await _set(reg.conta, 'adCampaigns', reg.campanha_id, { status: 'PAUSED' });
}
export async function liPeriodo(reg, { inicio, fim, diario, mudarInicio }) {
  const rs = { end: new Date(fim + 'T23:59:00-03:00').getTime(), ...(mudarInicio ? { start: Math.max(new Date(inicio + 'T08:00:00-03:00').getTime(), Date.now() + 5 * 60e3) } : {}) };
  if (!mudarInicio) { const c = await li(`adAccounts/${reg.conta}/adCampaigns/${reg.campanha_id}`); rs.start = c.runSchedule?.start; }
  await _set(reg.conta, 'adCampaigns', reg.campanha_id, { runSchedule: rs, dailyBudget: { amount: Number(diario).toFixed(2), currencyCode: reg.moeda || 'BRL' } });
}
export async function liLer(reg) {
  const out = {};
  try { const c = await li(`adAccounts/${reg.conta}/adCampaigns/${reg.campanha_id}`); out.estado = c.status || null; out.servindo = c.servingStatuses || null; } catch (e) { out.erro = e.message; }
  try { const d = new Date(Date.now() - 400 * 864e5);
    const q = `adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=ALL&dateRange=(start:(year:${d.getUTCFullYear()},month:${d.getUTCMonth() + 1},day:${d.getUTCDate()}))&campaigns=List(${encodeURIComponent('urn:li:sponsoredCampaign:' + reg.campanha_id)})&fields=impressions,clicks,landingPageClicks,costInLocalCurrency`;
    const a = (await li(q)).elements?.[0] || {}; const g = Number(a.costInLocalCurrency || 0), cl = Number(a.landingPageClicks || a.clicks || 0);
    out.resultado = { gasto: g, impressoes: Number(a.impressions || 0), cliques_link: cl, cpc: cl > 0 ? Math.round(g / cl * 100) / 100 : null };
  } catch (_) {}
  return out;
}

// ── Matched Audience (lista de contatos). O LinkedIn processa a lista em até 48 h e só veicula com 300+ membros casados.
export async function liPublicoEnviar(lista) {
  const conta = await liConta(); const acc = 'urn:li:sponsoredAccount:' + conta.id;
  const linhas = linhasLinkedin(lista.pessoas);
  if (!linhas.length) throw err('Nenhuma pessoa da lista tem e-mail ou nome + sobrenome + empresa — busque os e-mails no Apollo antes');
  let seg = lista.linkedin?.segmento_id || null;
  if (seg) { try { await li('dmpSegments/' + seg); } catch (_) { seg = null; } } // apagado no Campaign Manager → cria outro
  if (!seg) { const s = await li('dmpSegments', { metodo: 'POST', corpo: { name: ('Apollo · ' + lista.nome).substring(0, 100), sourcePlatform: 'LIST_UPLOAD', account: acc, type: 'USER', destinations: [{ destination: 'LINKEDIN' }] } });
    seg = _idDe(s._id); if (!seg) throw err('LinkedIn não devolveu o id do público'); }
  let enviados = 0;
  for (let i = 0; i < linhas.length; i += 1000) { await li(`dmpSegments/${seg}/users`, { metodo: 'POST', restli: 'BATCH_CREATE', corpo: { elements: linhas.slice(i, i + 1000) } }); enviados += Math.min(1000, linhas.length - i); }
  return { segmento_id: seg, enviados, conta: conta.id, em: new Date().toISOString(), ...(await liPublicoLer(seg).catch(() => ({}))) };
}
export async function liPublicoLer(seg) {
  const s = await li('dmpSegments/' + seg);
  const d = (s.destinations || []).find(x => /LINKEDIN/.test(x.destination || '')) || (s.destinations || [])[0] || {};
  return { status: d.status || s.status || null, ad_segment: d.destinationSegmentId || null, casados: d.audienceSize ?? s.matchedCount ?? null };
}
