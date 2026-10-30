import { comGuarda } from '../lib/qa-guard.js';
import { liUsarKv, liStatus, liUrlConectar, liCallback, liCriar, liEstado, liPeriodo, liLer, liPublicoEnviar, liPublicoLer } from '../lib/linkedin-ads.js'; // v3.239
import { linhasMeta, SCHEMA_META, listaObter, listaGravar } from '../lib/publico-lista.js'; // v3.239
import { K_VIGENTE as K_PLANO_VIGENTE, escolherTrilha, briefingTrilha, trilhasCampanha } from '../lib/plano-estrategico.js'; // v3.240
import { RE_CONTEUDO_FORA_ICP } from '../lib/icp.js';
import { META_CARGOS, classificarCargo as _clsCargo } from '../lib/icp.js';
import { ICP_TEXTO, ICP_VERSAO, META_IDADE_MIN, META_IDADE_MAX, META_INTERESSES, META_COMPORT, META_SETOR, META_EXCLUIR } from '../lib/icp.js';
// api/metricool.js
// Integração Metricool — publicação automática + métricas de redes sociais
// Env vars necessárias (Vercel):
//   METRICOOL_USER_TOKEN  — Settings → API no Metricool (plano Advanced+)
//   METRICOOL_USER_ID     — id numérico do usuário (aparece na URL do painel)
//   METRICOOL_BLOG_ID     — id da "marca" (brand) conectada no Metricool
//
// Graceful degradation: sem credenciais, retorna { configurado: false } e o
// frontend cai no modo manual. Nada quebra.

const MC_BASE = 'https://app.metricool.com/api';

// v3.234: AUDITORIA DO ICP NOS POSTS PLANEJADOS — lê o que está agendado no Metricool (próximos dias), a fila da
// autocampanha e as peças da campanha de tendências, e aponta o texto que fala com público técnico, estudante ou quem
// procura emprego (fora do ICP C-level). Só lista — a correção é decisão do fundador (editar/excluir na tela).
const _RE_PUBLICO_TECNICO = /\b(analistas?|desenvolvedor(es|as)?|devs?\b|programador(es|as)?|engenheir[oa]s? de dados|cientistas? de dados|estudantes?|j[uú]nior(es)?|iniciantes?|aprenda|aprender a|passo a passo|tutorial|curso|certifica[cç][aã]o|vaga|vagas|carreira|curr[ií]culo|primeiro emprego|seu chefe|para devs|stack t[eé]cnic[oa]|c[oó]digo[- ]fonte|sql\b|python\b)/i;
function _icpTexto(t) { const x = String(t || ''); const m = x.match(_RE_PUBLICO_TECNICO) || x.match(RE_CONTEUDO_FORA_ICP); return m ? m[0] : null; }
async function icpAuditarPlanejados({ blog_id, dias = 60 } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  const fora = [], avisos = []; let conferidos = 0;
  if (TOKEN && USERID && BLOGID) {
    try { const hoje = new Date(); const _sp = d => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); const ini = _sp(hoje) + 'T00:00:00', fim = _sp(new Date(hoje.getTime() + Math.min(120, dias) * 864e5)) + 'T23:59:59'; // v3.237: dia de Brasília
      const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${ini}&end=${fim}&timezone=America/Sao_Paulo`, TOKEN);
      const lista = Array.isArray(r) ? r : (r?.data || r?.posts || []);
      for (const p of lista) { conferidos++; const tr = _icpTexto(p.text); if (tr) fora.push({ origem: 'Metricool (agendado)', id: p.id, data: String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 16).replace('T', ' '), redes: (p.providers || []).map(x => x.network || x).join(', '), trecho: tr, texto: String(p.text || '').substring(0, 220) }); }
    } catch (e) { avisos.push('Metricool: ' + e.message); }
  } else avisos.push('Metricool não configurado — posts agendados não conferidos');
  try { const sql = await getSql(); const ontem = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const q = await sql`SELECT id, data, hora, texto, tema FROM autocampanha_fila WHERE data >= ${ontem} ORDER BY data, hora LIMIT 300`.catch(() => []);
    for (const it of q) { conferidos++; const tr = _icpTexto(it.texto) || _icpTexto(it.tema); if (tr) fora.push({ origem: 'Fila da autocampanha', id: it.id, data: String(it.data).substring(0, 10) + ' ' + (it.hora || ''), trecho: tr, texto: String(it.texto || it.tema || '').substring(0, 220) }); }
    const t = await sql`SELECT id, data, hora, tipo, tema, roteiro, legenda FROM tend_pecas WHERE COALESCE(status, '') NOT IN ('publicada', 'excluida') AND data >= ${ontem} ORDER BY data LIMIT 300`.catch(() => []);
    for (const it of t) { conferidos++; const txt = [it.tema, it.legenda, typeof it.roteiro === 'string' ? it.roteiro : JSON.stringify(it.roteiro || '')].filter(Boolean).join(' · '); const tr = _icpTexto(txt); if (tr) fora.push({ origem: 'Tendências (' + (it.tipo || 'peça') + ')', id: it.id, data: String(it.data).substring(0, 10) + ' ' + (it.hora || ''), trecho: tr, texto: txt.substring(0, 220) }); }
    // v3.237: também os rascunhos que ainda não foram para o Metricool — peças do Kanban, textos por rede das campanhas
    // e lotes de disparo (WhatsApp/e-mail) com envios pendentes
    const kb = await _kvMc('atx:kanban:pecas').catch(() => null);
    for (const pc of (Array.isArray(kb) ? kb : [])) { if (['Publicado', 'Agendado'].includes(pc.status)) continue; conferidos++;
      const tr = _icpTexto(pc.copy) || _icpTexto(pc.titulo); if (tr) fora.push({ origem: 'Kanban (peça)', id: pc.id, data: String(pc.data_planejada || pc.agendado_para || '').substring(0, 16), trecho: tr, texto: String(pc.copy || pc.titulo || '').substring(0, 220) }); }
    const camps = await sql`SELECT id, nome, data FROM campanhas WHERE COALESCE(atualizado_em, criado_em) > NOW() - INTERVAL '120 days' ORDER BY atualizado_em DESC LIMIT 150`.catch(() => []);
    for (const c of camps) { let d = c.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = {}; } }
      const cpr = d?.data?.copy_por_rede || {};
      for (const [rede, v] of Object.entries(cpr)) { const txt = typeof v === 'string' ? v : v?.texto; if (!txt) continue; conferidos++;
        const tr = _icpTexto(txt); if (tr) fora.push({ origem: 'Campanha (' + rede + ')', id: c.id + '|' + rede, data: c.nome || '', trecho: tr, texto: String(txt).substring(0, 220) }); } }
    const lotes = await sql`SELECT l.id, l.canal, l.texto, l.campanha_nome FROM disparo_lotes l WHERE l.status = 'ativo' AND EXISTS (SELECT 1 FROM disparo_envios e WHERE e.lote_id = l.id AND e.status = 'pendente') LIMIT 50`.catch(() => []);
    for (const l of lotes) { conferidos++; const tr = _icpTexto(l.texto); if (tr) fora.push({ origem: 'Disparo (' + (l.canal || '') + ')', id: l.id, data: l.campanha_nome || '', trecho: tr, texto: String(l.texto || '').substring(0, 220) }); }
  } catch (e) { avisos.push('Banco: ' + e.message); }
  return { conferidos, fora_do_icp: fora, total_fora: fora.length, avisos };
}

// v1.80: corrige os posts JÁ AGENDADOS que apontam para imagem efêmera.
// Sem isso, tudo que foi agendado antes desta versão continua falhando na data.
async function corrigirImagensAgendadas({ blog_id, dias = 60, aplicar = false } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID;
  const BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  if (!TOKEN || !USERID || !BLOGID) throw new Error('Credenciais do Metricool ausentes');

  const hoje = new Date();
  const ini = hoje.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) + 'T00:00:00'; // v3.54: formato ISO · v3.237: dia de Brasília (depois das 21h o dia UTC já é amanhã)
  const fim = new Date(hoje.getTime() + dias*86400000).toISOString().substring(0,10) + 'T23:59:59';
  const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${ini}&end=${fim}&timezone=America/Sao_Paulo`, TOKEN);
  const lista = Array.isArray(r) ? r : (r?.data || r?.posts || []);

  const { garantirPermanente, ehEfemera, ehHostProtegido, hostProducao } = await import('./media.js');
  const afetados = [], corrigidos = [], erros = [];

  for (const p of lista) {
    const midias = p.media || p.medias || [];
    const comProblema = (Array.isArray(midias) ? midias : []).filter(u => ehEfemera(u) || ehHostProtegido(u)); // v3.180: + endereço protegido do deployment
    if (!comProblema.length) continue;
    const quando = p.publicationDate?.dateTime || p.publicationDate || '';
    afetados.push({ id: p.id, data: String(quando).substring(0,16).replace('T',' '),
      texto: String(p.text || '').substring(0, 60), midias: comProblema.length });
    if (!aplicar) continue;
    try {
      const novas = [];
      for (const u of midias) novas.push(ehHostProtegido(u) ? hostProducao(u) : (await garantirPermanente({ url: u })).url);
      const corpo = _corpoPostMc(p, { media: novas, medias: novas }); // v3.80: corpo limpo e recriação sem duplicar
      await _recriarSemDuplicar(p.id, corpo, { USERID, BLOGID, TOKEN });
      corrigidos.push(p.id);
    } catch (e) { erros.push(`${p.id}: ${e.message}`); }
  }
  return { total_posts: lista.length, afetados, corrigidos: corrigidos.length, erros,
    aplicado: !!aplicar,
    resumo: aplicar
      ? `${corrigidos.length} post(s) corrigido(s) de ${afetados.length} com imagem que expira.`
      : `${afetados.length} post(s) agendado(s) usam imagem que vai expirar antes da publicação.` };
}

// ═══ v2.15: AUDITORIA DO FUNIL — por que não há leads? ═══
// Cruza três coisas: o que foi agendado no Metricool, o que de fato publicou, e quantos leads
// chegaram. Sem isso a pergunta "cadê os leads" não tem resposta — só suposição.

// ═══ v3.13: métricas por post — tenta a API nova de analytics e a antiga, e diz o que aconteceu ═══
// Antes: um único endpoint legado (/stats/{rede}/posts). Se ele falhasse (404, permissão), a tela
// ignorava o erro e mostrava tudo zerado com uma lista genérica de causas.
const _pegaNum = (obj, nomes) => {
  for (const n of nomes) {
    const v = obj?.[n] ?? obj?.metrics?.[n] ?? obj?.insights?.[n] ?? obj?.statistics?.[n] ?? obj?.stats?.[n] ?? obj?.analytics?.[n];
    if (v != null && v !== '' && typeof v !== 'object') { const num = parseFloat(v); if (!isNaN(num)) return num; }
  }
  return null;
};
function _normPostMetrica(p) {
  return {
    id: p.id || p.postId || p.mediaId || p.urn || null,
    texto: String(p.text || p.content || p.caption || p.commentary || p.message || '').substring(0, 300),
    data: p.date || p.publishedAt || p.publicationDate?.dateTime || p.publicationDate || p.created || p.timestamp || null,
    url: p.url || p.link || p.permalink || p.postUrl || null,
    impressoes: _pegaNum(p, ['impressions', 'impressionCount', 'impression_count', 'impressionsTotal', 'post_impressions', 'views', 'viewCount', 'videoViews', 'plays', 'reach', 'reachCount', 'organicImpressions']),
    alcance: _pegaNum(p, ['reach', 'reachCount', 'post_impressions_unique', 'uniqueImpressions', 'uniqueImpressionsCount']),
    cliques: _pegaNum(p, ['clicks', 'clickCount', 'click_count', 'post_clicks', 'linkClicks', 'totalClicks', 'websiteClicks']),
    curtidas: _pegaNum(p, ['likes', 'likeCount', 'reactions', 'reactionCount', 'post_reactions']),
    comentarios: _pegaNum(p, ['comments', 'commentCount', 'comment_count']),
    compartilhamentos: _pegaNum(p, ['shares', 'shareCount', 'share_count', 'reposts', 'saved']),
    engajamento: _pegaNum(p, ['engagement', 'engagementRate', 'engagement_rate', 'interactions']),
  };
}
async function _postsMetricasRede(rede, ini, fim, { TOKEN, USERID, BLOGID }) {
  const r = String(rede).toLowerCase(), f = d => d.replaceAll('-', '');
  const base = `userId=${USERID}&blogId=${BLOGID}`;
  const tentativas = [
    { nome: 'analytics v2 (posts)', path: `/v2/analytics/posts/${r}?from=${ini}T00:00:00&to=${fim}T23:59:59&timezone=America%2FSao_Paulo&${base}` },
    { nome: 'stats legado (posts)', path: `/stats/${r}/posts?start=${f(ini)}&end=${f(fim)}&${base}` },
  ];
  if (r === 'instagram') tentativas.splice(1, 0, { nome: 'analytics v2 (reels)', path: `/v2/analytics/reels/instagram?from=${ini}T00:00:00&to=${fim}T23:59:59&timezone=America%2FSao_Paulo&${base}`, soma: true });
  const log = []; let posts = [], usado = null;
  for (const t of tentativas) {
    if (usado && !t.soma) continue;
    try {
      const d = await mc(t.path, TOKEN);
      const lista = Array.isArray(d) ? d : (d?.data || d?.posts || d?.items || d?.reels || []);
      log.push({ fonte: t.nome, ok: true, itens: lista.length, campos: lista[0] ? Object.keys(lista[0]).slice(0, 30) : [] });
      if (lista.length || !usado) { posts = posts.concat(lista.map(_normPostMetrica)); if (!t.soma || !usado) usado = usado || t.nome; }
    } catch (e) { log.push({ fonte: t.nome, ok: false, erro: String(e.message || e).substring(0, 200) }); }
  }
  const comMetrica = posts.filter(p => p.impressoes != null || p.cliques != null || p.curtidas != null).length;
  const soma = k => posts.reduce((s2, p) => s2 + (p[k] || 0), 0);
  return { posts, fonte: usado, tentativas: log, api_ok: log.some(x => x.ok), com_metrica: comMetrica,
    totais: { posts: posts.length, impressoes: soma('impressoes'), cliques: soma('cliques'), curtidas: soma('curtidas'), comentarios: soma('comentarios'), compartilhamentos: soma('compartilhamentos') } };
}

// v3.70: o motivo do erro vinha "sem detalhe" porque o Metricool guarda o texto em campos variados —
// procura em qualquer campo do provider/post com nome de erro/mensagem/motivo
function _motivoErroMc(p, provs) {
  const achados = new Set();
  const varrer = (o, prof) => { if (!o || typeof o !== 'object' || prof > 3) return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && v.trim() && /error|erro|message|reason|detail|fail|motivo/i.test(k) && !/^(ERROR|FAILED|FAIL|PENDING|PUBLISHED)$/i.test(v.trim())) achados.add(v.trim().substring(0, 160));
      else if (v && typeof v === 'object') varrer(v, prof + 1); } };
  (provs || []).forEach(x => varrer(x, 0)); if (!achados.size) varrer(p, 0);
  const st = (provs || []).map(x => x.detailedStatus || x.status).filter(Boolean).join(', ');
  return achados.size ? [...achados].slice(0, 3).join(' · ') : ('o Metricool não informou o motivo' + (st ? ' (status: ' + st + ')' : ''));
}
function _categoriaErroMc(m) {
  const t = String(m || '').toLowerCase();
  if (/image|imagem|media|mídia|download|url|jpeg|png|aspect|resolution|size|video|vídeo/.test(t)) return 'imagem';
  if (/token|auth|permission|permiss|expired|expirad|reconnect|reconect|unauthor|login|access/.test(t)) return 'conexão da rede';
  if (/text|caracter|character|length|hashtag|duplicate|duplicad/.test(t)) return 'texto';
  if (/não informou/.test(t)) return 'sem motivo informado';
  return 'outro';
}

// v3.70: REPUBLICAR posts que falharam — mesma copy, imagens copiadas para endereço permanente, nos próximos
// horários vagos da autocampanha (sem empilhar). aplicar:false só lista o que faria.
async function republicarFalhas({ dias = 30, aplicar = false, ids = null, blog_id } = {}, req) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  if (!TOKEN || !USERID || !BLOGID) throw new Error('Credenciais do Metricool ausentes');
  const hoje = new Date(), ini = new Date(hoje.getTime() - dias * 864e5), f = d => d.toISOString().substring(0, 10);
  const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${f(ini)}T00:00:00&end=${f(hoje)}T23:59:59&timezone=America/Sao_Paulo`, TOKEN);
  const jaRep = new Set(((await _kvMc('mc:republicados').catch(() => null)) || []).map(String)); // v3.300: post já reenviado não volta para a lista
  const lista = (Array.isArray(r) ? r : (r?.data || r?.posts || [])).filter(p => !jaRep.has(String(p.id)) && (p.providers || []).some(x => /error|fail|reject/i.test(String(x.status || x.publishStatus || ''))));
  const alvo = Array.isArray(ids) && ids.length ? lista.filter(p => ids.map(String).includes(String(p.id))) : lista;
  const itens = alvo.map(p => { const prov = (p.providers || []).filter(x => /error|fail|reject/i.test(String(x.status || x.publishStatus || '')));
    const motivo = _motivoErroMc(p, prov);
    return { id: p.id, data: String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 16), redes: prov.map(x => String(x.network).toLowerCase()), texto: String(p.text || '').substring(0, 90), motivo, categoria: _categoriaErroMc(motivo),
      tipo: prov.some(x => x?.data?.postType === 'STORY') ? 'STORY' : prov.some(x => x?.data?.postType === 'REEL') ? 'REEL' : 'POST', midias: (p.media || p.medias || []).length, _p: p, _prov: prov, _todas_falharam: prov.length === (p.providers || []).length }; });
  const conexao = itens.filter(i => i.categoria === 'conexão da rede');
  if (!aplicar) return { total: itens.length, itens: itens.map(({ _p, _prov, ...x }) => x), por_categoria: itens.reduce((a, i) => { a[i.categoria] = (a[i.categoria] || 0) + 1; return a; }, {}),
    aviso: conexao.length ? conexao.length + ' falharam por conexão da rede (token/permissão) — reconecte a rede no Metricool antes de republicar, senão vão falhar de novo.' : null };
  // v3.72: só apagar (os que já foram corrigidos/publicados de outro jeito) — não republica
  if (aplicar === 'apagar') {
    const apagados = [], falhasA = [];
    for (const it of itens) { try { await mc(`/v2/scheduler/posts/${it.id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE'); apagados.push(it.id); } catch (e) { falhasA.push({ id: it.id, erro: e.message.substring(0, 160) }); } }
    return { apagados: apagados.length, ids: apagados, falhas: falhasA };
  }
  // horários vagos (mesma regra da autocampanha) para não empilhar posts
  const { plano } = await autoCampanhaPlanejar({ dias: 14, blog_id: BLOGID });
  const vagos = (plano.vagos || []).slice();
  const { garantirPermanente } = await import('./media.js');
  const feitos = [], falhas = [];
  for (const it of itens) {
    if (!vagos.length) { falhas.push({ id: it.id, erro: 'sem horário vago nos próximos 14 dias' }); continue; }
    const slot = vagos.shift();
    try {
      let midias = it._p.media || it._p.medias || [];
      midias = await Promise.all(midias.map(async u => { try { return (await garantirPermanente({ url: typeof u === 'string' ? u : (u.url || u), req })).url; } catch (_) { return typeof u === 'string' ? u : (u.url || u); } }));
      const body = { providers: it._prov.map(x => ({ network: x.network, ...(x.data ? { data: x.data } : {}) })), publicationDate: { dateTime: slot.data + 'T' + slot.hora + ':00', timezone: 'America/Sao_Paulo' },
        text: it.tipo === 'STORY' ? '' : (it._p.text || ''), autoPublish: true, draft: false, shortener: false,
        ...(it._p.firstCommentText ? { firstCommentText: it._p.firstCommentText } : {}), ...(it._p.instagramData ? { instagramData: it._p.instagramData } : {}), ...(it._p.facebookData ? { facebookData: it._p.facebookData } : {}),
        ...(midias.length ? { media: midias, medias: midias } : {}) };
      const novo = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'POST', body);
      const novoId = novo?.data?.id || novo?.id || null;
      // v3.300: só apaga o original quando TODAS as redes dele falharam (antes apagava também as que tinham publicado);
      // se o apagar falhar, avisa — senão a próxima rodada republicava de novo
      let apagou = null; if (it._todas_falharam) { try { await mc(`/v2/scheduler/posts/${it.id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE'); apagou = true; } catch (e) { apagou = false; } }
      feitos.push({ id_antigo: it.id, id_novo: novoId, redes: it.redes, quando: slot.data + ' ' + slot.hora, texto: it.texto, original_apagado: apagou, aviso: apagou === false ? 'o post original com erro não foi apagado no Metricool — apague-o lá para não republicar de novo' : !it._todas_falharam ? 'o original ficou (outras redes dele publicaram); só as redes com erro foram reenviadas' : null });
    } catch (e) { vagos.unshift(slot); falhas.push({ id: it.id, erro: e.message.substring(0, 200) }); }
  }
  if (feitos.length) { try { await _kvMc('mc:republicados', [...jaRep, ...feitos.map(f => String(f.id_antigo))].slice(-500)); } catch (_) {} }
  return { republicados: feitos.length, feitos, falhas };
}

// v3.71: TROCA O LINK dos posts JÁ AGENDADOS — de "agenda direto" (HubSpot / /reuniao) para a página de captura
// (/captura.html ou /agenda no Instagram), mantendo a campanha e o conteúdo da UTM. aplicar:false só lista.
async function _recriarSemDuplicar(idAntigo, corpo, { USERID, BLOGID, TOKEN }) {
  const novo = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'POST', corpo);
  const novoId = novo?.data?.id || novo?.id || null; if (!novoId) throw new Error('o Metricool não devolveu o post novo');
  let apagou = false;
  try { await mc(`/v2/scheduler/posts/${idAntigo}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE'); apagou = true; } catch (_) {}
  if (apagou) { try { const g = await mc(`/v2/scheduler/posts/${idAntigo}?userId=${USERID}&blogId=${BLOGID}`, TOKEN); const p = g?.data || g?.post || g; if (p && (p.id || p.providers)) apagou = false; } catch (_) { /* 404 = apagado */ } }
  if (!apagou) { try { await mc(`/v2/scheduler/posts/${novoId}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE'); } catch (_) {} throw new Error('não consegui apagar o post antigo — nada foi alterado para não duplicar'); }
  return novoId;
}

// v3.80: REMOVE DUPLICADOS dos posts agendados — mesmo horário, mesmas redes e mesmo texto (sem os links) e
// mesma imagem. Fica um por grupo: o que já tem o link novo (curto/captura); empate → o mais recente.
async function removerDuplicados({ aplicar = false, dias = 60, blog_id, ids = null } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  if (!TOKEN || !USERID || !BLOGID) throw new Error('Credenciais do Metricool ausentes');
  const ag = new Date(), fim = new Date(Date.now() + dias * 864e5), f = d => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // v3.237: dia de Brasília
  const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${f(ag)}T00:00:00&end=${f(fim)}T23:59:59&timezone=America/Sao_Paulo`, TOKEN);
  const lista = (Array.isArray(r) ? r : (r?.data || [])).filter(p => !p.published && new Date(String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 19) + '-03:00') > ag);
  const norm = t => String(t || '').replace(/(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?/gi, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase().substring(0, 300);
  const grupos = new Map();
  for (const p of lista) {
    const quando = String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 16);
    const redes = (p.providers || []).map(x => String(x.network || '').toLowerCase() + ':' + (x?.data?.postType || '')).sort().join(',');
    const m0 = (p.media || p.medias || [])[0]; const midia = typeof m0 === 'string' ? m0.split('?')[0].split('/').pop() : '';
    const k = quando + '|' + redes + '|' + norm(p.text) + '|' + (norm(p.text) ? '' : midia);
    if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p);
  }
  const nota = p => { const t = String(p.text || ''); return (/[?&]f=|\/agenda\/[a-z0-9]{3,8}/i.test(t) ? 4 : 0) + (/captura\.html/i.test(t) ? 2 : 0) + (/meetings\.hubspot|\/reuniao/i.test(t) ? -4 : 0); };
  const apagar = [], resumo = [];
  for (const g of grupos.values()) { if (g.length < 2) continue;
    g.sort((a, b) => (nota(b) - nota(a)) || (Number(b.id) - Number(a.id)));
    const fica = g[0]; g.slice(1).forEach(p => apagar.push(p.id));
    resumo.push({ quando: String(fica.publicationDate?.dateTime || fica.publicationDate).substring(0, 16), redes: (fica.providers || []).map(x => String(x.network).toLowerCase()), copias: g.length, fica: fica.id, texto: String(fica.text || '').substring(0, 70) }); }
  const alvo = Array.isArray(ids) && ids.length ? apagar.filter(id => ids.map(String).includes(String(id))) : apagar;
  if (!aplicar) return { agendados: lista.length, grupos_duplicados: resumo.length, a_apagar: apagar.length, ids: apagar, resumo: resumo.sort((a, b) => a.quando.localeCompare(b.quando)) };
  let ok = 0; const falhas = [];
  for (const id of alvo) { try { await mc(`/v2/scheduler/posts/${id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE'); ok++; } catch (e) { falhas.push({ id, erro: e.message.substring(0, 160) }); } }
  return { apagados: ok, ids_apagados: alvo.filter(id => !falhas.some(f => String(f.id) === String(id))), falhas };
}

// v3.74: corpo LIMPO para reenviar um post ao Metricool. O GET devolve campos só de leitura (status por rede,
// datas, ids, links públicos) que o PUT/POST recusam com "Type definition error ... PublicationStatusCode".
function _corpoPostMc(fonte, extra) {
  const ok = ['text', 'firstCommentText', 'publicationDate', 'autoPublish', 'draft', 'shortener', 'mediaAltText', 'videoThumbnailMilliseconds', 'instagramData', 'facebookData', 'linkedinData', 'twitterData', 'pinterestData', 'youtubeData', 'tiktokData', 'gmbData', 'smartLinkData', 'saveExternalMediaFiles'];
  const c = {}; ok.forEach(k => { if (fonte[k] !== undefined && fonte[k] !== null) c[k] = fonte[k]; });
  c.providers = (fonte.providers || []).map(x => { const pr = { network: x.network }; if (x.data && typeof x.data === 'object') pr.data = x.data; return pr; });
  const m = (fonte.media || fonte.medias || []).map(u => typeof u === 'string' ? u : (u && (u.url || u.mediaUrl || u.link))).filter(Boolean);
  if (m.length) { c.media = m; c.medias = m; }
  if (c.publicationDate && typeof c.publicationDate === 'object') c.publicationDate = { dateTime: String(c.publicationDate.dateTime || '').substring(0, 19), timezone: c.publicationDate.timezone || 'America/Sao_Paulo' };
  c.text = c.text ?? ''; c.draft = false; if (c.autoPublish === undefined) c.autoPublish = true;
  return Object.assign(c, extra || {});
}
// ═══ v3.108: CAMPANHA PATROCINADA NO INSTAGRAM — botão "Saiba mais" levando para a landing page ═══
// A API do Metricool só AGENDA posts orgânicos e LÊ relatórios de anúncios — criar anúncio só pela tela do Metricool
// (Ads → Criar campanha). Por isso há dois caminhos:
//  1) Meta configurado (META_ADS_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID, META_IG_USER_ID no Vercel): o sistema cria
//     campanha (Tráfego) → conjunto (só Instagram: feed, stories, reels) → criativo com botão SAIBA MAIS → anúncio,
//     TUDO PAUSADO. Nada é gasto até o fundador clicar "Ativar" (com o valor total na confirmação). Os resultados
//     aparecem no Metricool (Ads) porque a conta de anúncios é a mesma.
//  2) Sem Meta: monta o KIT (texto, título, imagem, link com UTM, orçamento, público) para criar no Metricool → Ads.
const META_V = process.env.META_API_VERSION || 'v21.0';
// v3.173: tira espaços/aspas/quebras coladas por engano nas variáveis da Vercel (ex.: "META_AD_ACCOUNT_ID= 1066…" virava act_%20…)
const _envLimpo = k => String(process.env[k] || '').trim().replace(/^["']|["']$/g, '').trim();
const _metaCfg = () => ({ token: _envLimpo('META_ADS_TOKEN'), conta: _envLimpo('META_AD_ACCOUNT_ID').replace(/^act_/i, '').replace(/\D/g, ''), pagina: _envLimpo('META_PAGE_ID').replace(/\D/g, ''), ig: _envLimpo('META_IG_USER_ID').replace(/\D/g, '') });
async function _meta(caminho, metodo = 'GET', corpo = null) {
  const c = _metaCfg(); const url = `https://graph.facebook.com/${META_V}/${caminho}`;
  const op = { method: metodo, headers: {} };
  if (metodo === 'GET') { const u = new URL(url); u.searchParams.set('access_token', c.token); const r = await fetch(u); const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error('Meta: ' + (d.error?.error_user_msg || d.error?.message || 'HTTP ' + r.status)); return d; }
  const form = new URLSearchParams(); Object.entries(corpo || {}).forEach(([k, v]) => form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))); form.set('access_token', c.token);
  op.headers['Content-Type'] = 'application/x-www-form-urlencoded'; op.body = form.toString();
  const r = await fetch(url, op); const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error('Meta: ' + (d.error?.error_user_title ? d.error.error_user_title + ' — ' : '') + (d.error?.error_user_msg || d.error?.message || 'HTTP ' + r.status));
  return d;
}
async function _kvMc(k, v) {
  const sql = await getSql(); await sql`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())`;
  if (v === undefined) { const r = await sql`SELECT value FROM kv_store WHERE key = ${k} LIMIT 1`; const x = r[0]?.value; return typeof x === 'string' ? JSON.parse(x) : (x ?? null); }
  await sql`INSERT INTO kv_store (key, value, updated_at) VALUES (${k}, ${JSON.stringify(v)}, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`; return v;
}
liUsarKv((k, v) => _kvMc(k, v)); // v3.239: tokens e conta do LinkedIn Ads ficam no kv_store
// v3.240: PLANO ESTRATÉGICO VIGENTE → trilhas da campanha. Só acrescenta foco ao post/anúncio; sem plano aprovado, com a
// opção desligada na tela ou com erro de leitura, a autocampanha e a campanha patrocinada funcionam exatamente como antes.
async function _planoMc({ ignorarOpcao = false } = {}) {
  try { if (!ignorarOpcao && (await _kvMc('mkt:autocampanha_plano'))?.usar === false) return null; const v = await _kvMc(K_PLANO_VIGENTE); return v?.plano ? v : null; } catch (_) { return null; }
}
async function _trilhaPorId(id) { if (!id) return null; const v = await _planoMc({ ignorarOpcao: true }); return v ? trilhasCampanha(v.plano).find(t => t.id === id) || (v.plano.alavancas || []).find(t => t.id === id) || null : null; }
// v3.174/v3.239: endereço público do sistema (nunca um deploy temporário …-projects-….vercel.app)
function _baseDe(req) {
  const _host = req?.headers?.host || '';
  return (process.env.MEDIA_PUBLIC_BASE || process.env.APP_URL || (/^[\w.-]+$/.test(_host) && !/-projects-|^project-/.test(_host) ? 'https://' + _host : 'https://atlantyx-os.vercel.app')).replace(/\/$/, '');
}
async function patrocinadoStatus(req) {
  const c = _metaCfg(); const falta = [['META_ADS_TOKEN', c.token], ['META_AD_ACCOUNT_ID', c.conta], ['META_PAGE_ID', c.pagina], ['META_IG_USER_ID', c.ig]].filter(([, v]) => !v).map(([k]) => k);
  const out = { meta_configurado: !falta.length, falta, conta: c.conta ? 'act_' + c.conta : null };
  if (!falta.length) { try { const a = await _meta('act_' + c.conta + '?fields=name,currency,account_status,amount_spent'); out.conta_nome = a.name; out.moeda = a.currency; out.conta_ativa = a.account_status === 1; } catch (e) { out.erro = e.message; } }
  try { out.linkedin = await liStatus(_baseDe(req)); } catch (e) { out.linkedin = { configurado: false, erro: e.message }; } // v3.239
  return out;
}
async function patrocinadoCopy({ tema = '', oferta = '', publico = '', trilha = '' } = {}) {
  const _tr = await _trilhaPorId(trilha).catch(() => null); // v3.240: trilha do plano estratégico dá foco (público, dor, oferta, prova)
  if (_tr) { tema = [tema, briefingTrilha(_tr)].filter(Boolean).join('\n'); if (!publico) publico = _tr.publico; }
  const sys = 'Você escreve anúncios pagos de Instagram para a Atlantyx (empresa brasileira B2B de tecnologia: engenharia de dados, indicadores/BI, software sob medida, produtos próprios e especialistas; 17 anos; clientes como CPFL, Enel, Caixa Capitalização). ' + ICP_TEXTO + ' O texto deve QUALIFICAR quem clica (ex.: "Para CEOs, CFOs e diretores de empresas de médio e grande porte") — afaste pessoa física, quem procura emprego ou curso e o público técnico. O anúncio tem botão "Saiba mais" que leva para a página onde a pessoa pede uma conversa gratuita com um especialista. Português do Brasil, direto, sem clichês, sem prometer o que não está no tema.';
  // v3.208: texto no padrão "pergunta-gancho → Simples: resposta → ✅ 3 benefícios → parágrafo de ganho → CTA" e
  // os campos da ARTE no padrão (manchete com palavras em destaque + lista de benefícios com ✓ + tela do sistema)
  const usr = `Tema/oferta: ${String(tema || oferta || 'conversa gratuita com especialista').substring(0, 600)}\n${publico ? 'Público: ' + String(publico).substring(0, 200) + '\n' : ''}
Siga EXATAMENTE este padrão de anúncio (estrutura e ritmo, com conteúdo da Atlantyx — não copie marcas de terceiros):
TEXTO PRINCIPAL, em blocos separados por UMA linha em branco:
1) Pergunta-gancho que nomeia o público e a mudança (ex.: "Por que diretores financeiros de grandes empresas estão trocando planilhas por indicadores ao vivo?")
2) "Simples: " + a resposta em 1 frase (o que a Atlantyx resolve)
3) Três linhas, cada uma começando com "✅ " e no máximo 55 caracteres (dor eliminada: "Chega de…", "Fim de…", "Adeus a…")
4) Um parágrafo de 1–2 frases com o ganho concreto para quem decide (tempo, custo, risco, controle) — termine com a palavra mais importante EM MAIÚSCULAS se fizer sentido
5) Chamada final: "Clique em Saiba mais e agende uma conversa gratuita com um especialista."
ARTE (imagem): manchete curta em MAIÚSCULAS no mesmo formato da pergunta-gancho (até 70 caracteres), marcando com **asteriscos duplos** os 2 ou 3 trechos em destaque (quem é o público, o verbo da mudança e a solução/Atlantyx); e 4 ou 5 benefícios curtíssimos (até 28 caracteres cada, sem verbo no início quando possível, ex.: "Indicadores ao vivo", "Fim das planilhas").
Devolva JSON: {"texto":"texto principal completo no padrão acima, com quebras de linha \\n","titulo":"título curto, até 40 caracteres","descricao":"linha de apoio, até 30 caracteres","manchete":"POR QUE **…** ESTÃO **…** PARA A **ATLANTYX?**","beneficios":["…","…","…","…"],"prompt_imagem":"cena quadrada 1:1 em inglês, 35-55 palavras, sem texto, profissional, tons escuros com ciano e verde"}`;
  const j = JSON.parse(await _claudeAuto(sys, usr, 1100));
  return { texto: String(j.texto || '').substring(0, 1200), titulo: String(j.titulo || '').substring(0, 60), descricao: String(j.descricao || '').substring(0, 60), prompt_imagem: j.prompt_imagem || '',
    arte: { manchete: String(j.manchete || j.titulo || '').substring(0, 120), beneficios: (Array.isArray(j.beneficios) ? j.beneficios : []).map(x => String(x).substring(0, 40)).filter(Boolean).slice(0, 5) } };
}
// v3.190: PÚBLICO B2B. O anúncio ia para "Brasil, 25–60 anos" sem interesse nenhum e otimizado para clique — o Meta
// entrega para quem clica mais barato (pessoa física, clique acidental, robô). Agora: capitais de negócio + interesses
// de decisores/tecnologia (resolvidos pela busca do próprio Meta, com cache) e, com o Pixel, otimização para LEAD.
const _B2B_CIDADES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Porto Alegre', 'Campinas', 'Brasília', 'Recife', 'Salvador', 'Florianópolis', 'Goiânia', 'Fortaleza'];
// v3.234: ICP C-LEVEL (lib/icp.js) — saíram "Data analysis", "Big data", "Power BI", "SAP", "Business intelligence": no
// Meta esses interesses entregam para analista, desenvolvedor de BI e estudante. Só interesses de cargo executivo e
// gestão. A busca do Meta só aceita resultado com o MESMO nome (antes pegava o 1º resultado, às vezes outro assunto).
const _B2B_INTERESSES = META_INTERESSES;
const _KV_PB = 'mkt:meta:publico_b2b:' + ICP_VERSAO, _KV_DEC = 'mkt:meta:publico_decisores:' + ICP_VERSAO; // chave nova = cache antigo (com público técnico) não vale mais
async function _publicoB2B() {
  const ck = await _kvMc(_KV_PB).catch(() => null);
  if (ck && ck.em && Date.now() - ck.em < 30 * 864e5 && (ck.cidades || []).length && Array.isArray(ck.cargos)) return ck;
  const cidades = [], interesses = [], cargos = [];
  for (const nome of _B2B_CIDADES) { try { const r = await _meta(`search?type=adgeolocation&location_types=${encodeURIComponent('["city"]')}&country_code=BR&limit=3&q=${encodeURIComponent(nome)}`);
    const x = (r.data || []).find(d => d.country_code === 'BR' && d.type === 'city'); if (x) cidades.push({ key: String(x.key), radius: 40, distance_unit: 'kilometer', nome: x.name }); } catch (_) {} }
  const _n = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*\(.*\)\s*$/, '').trim();
  // v3.236: CARGO ATUAL (work_positions) no lugar de interesse — só títulos que são de dono/C-level/diretor
  for (const q of META_CARGOS) { try { const r = await _meta(`search?type=adworkposition&limit=10&q=${encodeURIComponent(q)}`);
    (r.data || []).filter(d => _n(d.name) === _n(q) || (_n(d.name).startsWith(_n(q)) && _clsCargo(d.name) === 'decisor')).filter(d => _clsCargo(d.name) === 'decisor').slice(0, 3)
      .forEach(x => { if (!cargos.some(i => i.id === String(x.id))) cargos.push({ id: String(x.id), name: x.name }); }); } catch (_) {} }
  const v = { cidades, interesses, cargos, em: Date.now() }; if (cidades.length && cargos.length) await _kvMc(_KV_PB, v).catch(() => {}); return v; // v3.237: sem cargo resolvido não guarda (tenta de novo na próxima)
}
// v3.214: CAMADA DE DECISOR + EXCLUSÕES. Interesse sozinho ("Business intelligence", "Gestão") pega estudante,
// curioso e quem procura emprego. Agora o público é INTERESSE DO TEMA **E** (comportamento de dono/administrador de
// empresa OU setor de atuação em gestão/negócios/TI), excluindo quem procura emprego, concurso e estágio.
// Os IDs vêm da busca do próprio Meta (com cache de 30 dias); o que o Meta não achar fica de fora sem quebrar.
// v3.234: sem "TI e serviços técnicos", "Computação e matemática", "Arquitetura e engenharia" (setores de quem EXECUTA),
// sem "dono de pequena empresa" e "administrador de página" (pequeno negócio / social media). Só gestão e decisores.
const _DEC_COMPORT = META_COMPORT;
const _DEC_SETOR = META_SETOR;
const _EXCLUIR = META_EXCLUIR;
async function _publicoDecisores() {
  const ck = await _kvMc(_KV_DEC).catch(() => null);
  if (ck && ck.em && Date.now() - ck.em < 30 * 864e5) return ck;
  const comportamentos = [], setores = [], excluir = [];
  try { const r = await _meta('search?type=adTargetingCategory&class=behaviors&limit=500'); (r.data || []).filter(b => _DEC_COMPORT.test(b.name || '') || _DEC_COMPORT.test((b.path || []).join(' '))).slice(0, 6).forEach(b => comportamentos.push({ id: String(b.id), name: b.name })); } catch (_) {}
  try { const r = await _meta('search?type=adTargetingCategory&class=industries&limit=200'); (r.data || []).filter(b => _DEC_SETOR.test(b.name || '')).slice(0, 8).forEach(b => setores.push({ id: String(b.id), name: b.name })); } catch (_) {}
  for (const q of _EXCLUIR) { try { const r = await _meta(`search?type=adinterest&limit=1&q=${encodeURIComponent(q)}`); const x = (r.data || [])[0]; if (x && !excluir.some(i => i.id === String(x.id))) excluir.push({ id: String(x.id), name: x.name }); } catch (_) {} }
  const v = { comportamentos, setores, excluir, em: Date.now() }; await _kvMc(_KV_DEC, v).catch(() => {}); return v;
}
function _linkPago(base, nome, rede = 'instagram', trilhaId = null) {
  const slug = (trilhaId ? 'alv-' + trilhaId + '_' : '') + String(nome || 'patrocinado').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 70) || 'patrocinado';
  return base + '/captura.html?utm_source=' + rede + '&utm_medium=pago&utm_campaign=' + slug + '&utm_content=saiba_mais';
}
// v3.316: CAMPANHA GEOLOCALIZADA (ex.: uma feira) — raio em volta de um ponto. Aceita "lat,lng", link do Google Maps
// ou endereço/nome do local (geocodificado pelo OpenStreetMap). Só no Meta: o LinkedIn não tem segmentação por raio.
// v3.317: o Meta tornou OBSOLETO o posicionamento Explorar do Instagram (a API recusa o conjunto) — só o Feed
const IG_POSICOES = ['stream'];
async function _geoResolver(entrada) {
  let s = String(entrada || '').trim(); if (!s) return null;
  // link curto do Google Maps (maps.app.goo.gl / goo.gl/maps) → segue o redirecionamento para achar as coordenadas
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(s)) { try { let u = s; for (let i = 0; i < 4; i++) { const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(8000) }); const l = r.headers.get('location'); if (!l) break; u = new URL(l, u).toString(); } s = u; } catch (_) {} }
  const ok = (lat, lng, endereco) => { lat = Number(lat); lng = Number(lng); if (!(isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null; return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, endereco: endereco || null }; };
  let m = s.match(/^\s*(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)\s*$/) || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|ll|query|center)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
  if (m) { const r = ok(m[1], m[2]); if (r) return { ...r, endereco: r.endereco || `${r.lat}, ${r.lng}`, fonte: 'coordenadas' }; }
  let q = s; if (/^https?:\/\//i.test(s)) { try { const u = new URL(s); const pl = u.pathname.match(/\/place\/([^/]+)/); q = pl ? decodeURIComponent(pl[1].replace(/\+/g, ' ')) : (u.searchParams.get('q') || u.searchParams.get('query') || ''); } catch (_) { q = ''; }
    if (!q) throw Object.assign(new Error('Não consegui ler o local desse link. Abra o local no Google Maps, toque e segure no ponto e cole as coordenadas (ex.: -22.9765, -43.3924) ou digite o endereço.'), { status: 400 }); }
  let j = [];
  try { const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&accept-language=pt-BR&q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'AtlantyxOS/1.0 (anuncios geolocalizados)' }, signal: AbortSignal.timeout(10000) });
    j = r.ok ? await r.json().catch(() => []) : []; }
  catch (_) { throw Object.assign(new Error('O serviço de mapas não respondeu agora. Cole as coordenadas do Google Maps (toque e segure no local → copie os números, ex.: -22.9765, -43.3924).'), { status: 503 }); }
  if (!j[0]) throw Object.assign(new Error('Não encontrei "' + q.substring(0, 80) + '". Tente o endereço completo (rua, número, cidade) ou cole as coordenadas do Google Maps.'), { status: 400 });
  return { ...ok(j[0].lat, j[0].lon, j[0].display_name), fonte: 'endereço' };
}
async function geoLocalResolver({ local, raio_km } = {}) {
  const g = await _geoResolver(local); if (!g) throw Object.assign(new Error('Informe o local'), { status: 400 });
  const raio = Math.max(1, Math.min(80, Number(String(raio_km || 2).replace(',', '.')) || 2));
  return { ...g, raio_km: raio, mapa: `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}` };
}
async function patrocinadoCriar(p = {}, req) {
  // v3.174: o link do anúncio nunca aponta para um endereço de deploy temporário da Vercel (…-projects-….vercel.app)
  const base = _baseDe(req);
  if (String(p.rede || '') === 'linkedin' && String(p.geo_local || '').trim()) throw Object.assign(new Error('O LinkedIn não permite anúncio por raio em volta de um local (feira/evento). Use Instagram (Meta) para a campanha geolocalizada.'), { status: 400 }); // v3.316
  if (String(p.rede || '') === 'linkedin') return patrocinadoCriarLinkedin(p, base); // v3.239
  const geo = String(p.geo_local || '').trim() ? await geoLocalResolver({ local: p.geo_local, raio_km: p.geo_raio_km }) : null; // v3.316: feira/evento
  const geoTodos = !!(geo && p.geo_todos); // no local do evento, opcionalmente sem o filtro de cargo (quem está lá já é o público)
  // v3.239: público = LISTA de pessoas selecionadas no Apollo (público personalizado do Meta) em vez do filtro de cargo
  const lista = p.publico_lista ? await listaObter(_kvMc, p.publico_lista) : null;
  if (lista && !lista.meta?.audience_id && !p.so_kit) throw Object.assign(new Error('Envie a lista "' + lista.nome + '" ao Meta antes (aba Públicos do Apollo → Enviar ao Meta)'), { status: 400 });
  const nome = String(p.nome || '').trim().substring(0, 80) || 'Instagram · Saiba mais · ' + new Date().toISOString().substring(0, 10);
  const texto = String(p.texto || '').trim(), titulo = String(p.titulo || '').trim().substring(0, 40), descricao = String(p.descricao || '').trim().substring(0, 30);
  const imagem = String(p.imagem || '').trim();
  const diario = Math.round(Number(String(p.orcamento_diario || '').replace(',', '.')) * 100) / 100;
  const ini = String(p.inicio || ''), fim = String(p.fim || '');
  // v3.234: ICP C-level — idade mínima 35 e sem a opção "amplo" (Brasil inteiro, sem interesse = pessoa física)
  const idMin = Math.max(META_IDADE_MIN, Math.min(META_IDADE_MAX, parseInt(p.idade_min) || META_IDADE_MIN)), idMax = Math.max(idMin, Math.min(META_IDADE_MAX, parseInt(p.idade_max) || 60));
  const amplo = false;
  const err = m => Object.assign(new Error(m), { status: 400 });
  if (!texto) throw err('Escreva o texto do anúncio'); if (!titulo) throw err('Escreva o título');
  if (!/^https:\/\//.test(imagem)) throw err('Escolha ou gere a imagem do anúncio (precisa ser um endereço https público)');
  if (!(diario >= 6)) throw err('Orçamento diário mínimo: R$ 6,00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || fim < ini) throw err('Informe início e fim da campanha (fim depois do início)');
  const dias = Math.round((new Date(fim) - new Date(ini)) / 864e5) + 1;
  // v3.174: link escolhido na tela (com UTM acrescentado se não tiver) ou a página de captura de leads
  let link = _linkPago(base, nome, 'instagram', p.trilha ? String(p.trilha).replace(/[^a-z0-9-]/g, '') : null);
  if (p.link && /^https:\/\//.test(String(p.link).trim())) { try { const u = new URL(String(p.link).trim()); if (!u.searchParams.get('utm_source')) { const ref = new URL(link); ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(k => u.searchParams.set(k, ref.searchParams.get(k))); } link = u.toString(); } catch (_) {} }
  const kit = { nome, objetivo: 'Tráfego (cliques no link)', posicionamentos: 'Instagram — Feed', botao: 'Saiba mais', link, texto, titulo, descricao, imagem,
    orcamento_diario: diario, dias, total_maximo: Math.round(diario * dias * 100) / 100, inicio: ini, fim, icp_versao: ICP_VERSAO,
    publico: lista ? `Lista do Apollo "${lista.nome}" (${(lista.pessoas || []).length} decisores selecionados) — público personalizado no Meta · Brasil · 25 a 65 anos · Instagram e Facebook (feed)`
      : `Quem OCUPA o cargo: donos, sócios e C-levels (cargo atual no perfil) · capitais de negócio · ${idMin} a ${idMax} anos · sem direcionamento por interesse`,
    ...(lista ? { publico_lista: lista.id, publico_lista_nome: lista.nome, posicionamentos: 'Instagram (Feed) e Facebook (Feed)' } : {}), ...(p.trilha ? { trilha: String(p.trilha).substring(0, 40) } : {}),
    ...(geo ? { local: { endereco: geo.endereco, lat: geo.lat, lng: geo.lng, raio_km: geo.raio_km, mapa: geo.mapa, todo_publico: geoTodos } } : {}) };
  if (geo) kit.publico = '📍 Raio de ' + String(geo.raio_km).replace('.', ',') + ' km em volta de ' + geo.endereco + ' (pessoas que estão, estiveram há pouco ou moram ali) · ' + (geoTodos ? 'todo o público no local, ' + idMin + ' a ' + idMax + ' anos (sem filtro de cargo)' : (lista ? 'só quem está na lista do Apollo' : 'só quem ocupa cargo de dono, sócio ou C-level') + ' · ' + idMin + ' a ' + idMax + ' anos');
  const c = _metaCfg();
  if (!(c.token && c.conta && c.pagina && c.ig) || p.so_kit) return { modo: 'kit', kit };
  // 1. campanha · 2. conjunto · 3. imagem · 4. criativo (Saiba mais) · 5. anúncio — tudo PAUSADO
  const pixel = String(process.env.META_PIXEL_ID || '').replace(/\D/g, '');
  const camp = await _meta(`act_${c.conta}/campaigns`, 'POST', { name: nome, objective: pixel ? 'OUTCOME_LEADS' : 'OUTCOME_TRAFFIC', status: 'PAUSED', special_ad_categories: [], is_adset_budget_sharing_enabled: false });
  const desfazer = async () => { try { await _meta(camp.id, 'DELETE'); } catch (_) {} };
  try {
    // v3.192: o Meta aposenta interesses ("Algumas opções de direcionamento detalhado foram combinadas") e devolve
    // o substituto no erro — troca pelo alternativo, grava no cache e tenta de novo (até 2 vezes)
    const pb = amplo || lista ? null : await _publicoB2B().catch(() => ({ cidades: [], interesses: [] }));
    // v3.316: geolocalizada → o raio em volta do local substitui as cidades; 'recent' = quem está ou esteve ali há pouco
    const _geoMeta = geo ? { custom_locations: [{ latitude: geo.lat, longitude: geo.lng, radius: geo.raio_km, distance_unit: 'kilometer' }], location_types: ['home', 'recent'] } : null;
    let dec = amplo || lista ? null : await _publicoDecisores().catch(() => null); // v3.214
    // v3.236: o filtro é o CARGO que a pessoa ocupa (work_positions). Sem cargo resolvido, o setor de atuação em gestão
    // (industries = área em que a pessoa trabalha). Interesse nunca — interesse alcança quem só se interessa pelo tema.
    const _camadaDec = () => pb?.cargos?.length ? [{ work_positions: pb.cargos.map(({ id, name }) => ({ id, name })) }]
      : (dec?.setores?.length ? [{ industries: dec.setores.map(({ id, name }) => ({ id, name })) }] : []);
    // v3.239: com lista do Apollo o público É a lista (já são decisores escolhidos) — Brasil, 25–65, Instagram + Facebook feed
    const _alvo = () => geoTodos ? { geo_locations: _geoMeta, age_min: idMin, age_max: idMax, publisher_platforms: ['instagram', 'facebook'], instagram_positions: IG_POSICOES, facebook_positions: ['feed'], targeting_automation: { advantage_audience: 0 } }
      : lista ? { geo_locations: _geoMeta || { countries: ['BR'] }, custom_audiences: [{ id: lista.meta.audience_id }], age_min: 25, age_max: 65,
        publisher_platforms: ['instagram', 'facebook'], instagram_positions: IG_POSICOES, facebook_positions: ['feed'], targeting_automation: { advantage_audience: 0 } } : ({ ...(amplo ? { geo_locations: { countries: ['BR'] } } : {
        geo_locations: _geoMeta || (pb.cidades.length ? { cities: pb.cidades.map(({ key, radius, distance_unit }) => ({ key, radius, distance_unit })), location_types: ['home', 'recent'] } : { countries: ['BR'] }),
        ...(_camadaDec().length ? { flexible_spec: _camadaDec() } : {}),
        ...(dec?.excluir?.length ? { exclusions: { interests: dec.excluir.map(({ id, name }) => ({ id, name })) } } : {}) }),
      // v3.214: só FEED e EXPLORAR — Stories e Reels geram curtida/seguidor de quem não é decisor
      age_min: idMin, age_max: idMax, publisher_platforms: ['instagram'], instagram_positions: IG_POSICOES,
      targeting_automation: { advantage_audience: 0 } }); // v3.174: o Meta exige o sinalizador (0 = respeita idade/local escolhidos)
    // v3.236: nunca cria conjunto sem filtro de cargo/área — sem ele o Meta entrega para qualquer pessoa
    if (!amplo && !lista && !geoTodos && !_camadaDec().length) throw err('Não consegui montar o filtro de cargo (donos/C-levels) no Meta agora — nada foi criado. Tente de novo em alguns minutos.');
    let adset = null, semPos = false; // v3.317: posicionamento recusado como obsoleto → deixa o Meta escolher dentro do Instagram
    const _pos = t => { if (semPos) { delete t.instagram_positions; delete t.facebook_positions; } return t; };
    for (let tentativa = 0; tentativa < 3 && !adset; tentativa++) {
      if (!amplo && !lista && !geoTodos && !_camadaDec().length) throw err('O Meta recusou o filtro de cargo e o de área de atuação — nada foi criado (sem filtro o anúncio iria para qualquer pessoa).'); // v3.237: confere a cada tentativa
      try {
        adset = await _meta(`act_${c.conta}/adsets`, 'POST', { name: nome + (lista ? ' · Lista Apollo' : ' · Instagram') + (geo ? ' · Local ' + geo.raio_km + 'km' : ''), campaign_id: camp.id, daily_budget: Math.round(diario * 100), billing_event: 'IMPRESSIONS',
          // v3.190: com o Pixel (META_PIXEL_ID) → otimiza para LEAD (cadastro feito), o que filtra robô e clique acidental; sem Pixel → clique no link
          optimization_goal: pixel ? 'OFFSITE_CONVERSIONS' : 'LINK_CLICKS', ...(pixel ? { promoted_object: { pixel_id: pixel, custom_event_type: 'LEAD' } } : {}),
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'WEBSITE', status: 'PAUSED',
          start_time: ini + 'T08:00:00-0300', end_time: fim + 'T23:59:00-0300', targeting: _pos(_alvo()) });
      } catch (e) {
        const m = String(e.message || '').match(/\[\s*\{\s*"deprecated_interest_id"[\s\S]*?\}\s*\]/);
        let alt = []; try { alt = m ? JSON.parse(m[0]) : []; } catch (_) {}
        if (!semPos && tentativa < 2 && /obsolet|deprecat/i.test(String(e.message || '')) && /posicionamento|placement/i.test(String(e.message || ''))) { semPos = true; continue; } // v3.317
        // v3.236: o Meta recusou o filtro de cargo → tenta pelo setor de atuação (gestão)
        if (pb?.cargos?.length && /work_position|job title|cargo|position/i.test(String(e.message || '')) && tentativa < 2) { pb.cargos = []; continue; }
        // v3.214: o Meta recusou comportamento/setor/exclusão → tenta de novo sem a camada de decisor (e limpa o cache)
        if (!alt.length && dec && tentativa < 2) { dec = null; try { await _kvMc(_KV_DEC, { comportamentos: [], setores: [], excluir: [], em: 0 }); } catch (_) {} continue; }
        if (!pb || !alt.length || tentativa >= 2) throw e;
        // (com lista não há interesse a trocar — o erro sobe)
        const troca = new Map(alt.map(a => [String(a.deprecated_interest_id), a]));
        const vistos = new Set(); pb.interesses = pb.interesses.map(x => { const a = troca.get(String(x.id)); return a && a.alternative_interest_id ? { id: String(a.alternative_interest_id), name: a.alternative_interest_name || x.name } : (a ? null : x); })
          .filter(x => x && !vistos.has(x.id) && vistos.add(x.id));
        try { await _kvMc(_KV_PB, { ...pb, em: Date.now() }); } catch (_) {}
      }
    }
    let imgHash = null;
    try { const ri = await fetch(imagem); if (ri.ok) { const b64 = Buffer.from(await ri.arrayBuffer()).toString('base64'); const up = await _meta(`act_${c.conta}/adimages`, 'POST', { bytes: b64 }); imgHash = Object.values(up.images || {})[0]?.hash || null; } } catch (_) {}
    const link_data = { link, message: texto, name: titulo, ...(descricao ? { description: descricao } : {}), ...(imgHash ? { image_hash: imgHash } : { picture: imagem }), call_to_action: { type: 'LEARN_MORE', value: { link } } };
    const cr = await _meta(`act_${c.conta}/adcreatives`, 'POST', { name: nome + ' · criativo', object_story_spec: { page_id: c.pagina, instagram_user_id: c.ig, link_data } });
    const ad = await _meta(`act_${c.conta}/ads`, 'POST', { name: nome + ' · anúncio', adset_id: adset.id, creative: { creative_id: cr.id }, status: 'PAUSED' });
    const reg = { id: camp.id, adset_id: adset.id, ad_id: ad.id, creative_id: cr.id, criado_em: new Date().toISOString(), estado: 'PAUSED', ...kit,
      gerenciador: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${c.conta}&selected_campaign_ids=${camp.id}` };
    const regs = (await _kvMc('mkt:patrocinados')) || []; regs.unshift(reg); await _kvMc('mkt:patrocinados', regs.slice(0, 100)); // v3.239: 'lista' agora é a lista do Apollo
    return { modo: 'meta', campanha: reg };
  } catch (e) { await desfazer(); throw new Error(e.message + ' (nada ficou criado no Meta)'); }
}
// ═══ v3.239: CAMPANHA PAGA NO LINKEDIN — grupo → campanha → anúncio de imagem com "Saiba mais", tudo PAUSADO.
// Público: ICP C-level pelos filtros do LinkedIn (senioridade Dono/Sócio/CXO/VP/Diretor + empresas 201+ + Brasil) ou a
// lista do Apollo (Matched Audience). Sem o LinkedIn conectado devolve o KIT (texto, imagem, link, orçamento, público).
async function patrocinadoCriarLinkedin(p, base) {
  const err = m => Object.assign(new Error(m), { status: 400 });
  const nome = String(p.nome || '').trim().substring(0, 80) || 'LinkedIn · Saiba mais · ' + new Date().toISOString().substring(0, 10);
  const texto = String(p.texto || '').trim().substring(0, 3000), titulo = String(p.titulo || '').trim().substring(0, 70), imagem = String(p.imagem || '').trim();
  const diario = Math.round(Number(String(p.orcamento_diario || '').replace(',', '.')) * 100) / 100, ini = String(p.inicio || ''), fim = String(p.fim || '');
  if (!texto) throw err('Escreva o texto do anúncio'); if (!titulo) throw err('Escreva o título');
  if (!/^https:\/\//.test(imagem)) throw err('Escolha ou gere a imagem do anúncio (endereço https público)');
  if (!(diario >= 10)) throw err('Orçamento diário mínimo no LinkedIn: 10,00 na moeda da conta (o LinkedIn pode exigir mais)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || fim < ini) throw err('Informe início e fim da campanha (fim depois do início)');
  const dias = Math.round((new Date(fim) - new Date(ini)) / 864e5) + 1;
  let link = _linkPago(base, nome, 'linkedin', p.trilha ? String(p.trilha).replace(/[^a-z0-9-]/g, '') : null);
  if (p.link && /^https:\/\//.test(String(p.link).trim())) { try { const u = new URL(String(p.link).trim()); if (!u.searchParams.get('utm_source')) { const ref = new URL(link); ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(k => u.searchParams.set(k, ref.searchParams.get(k))); } link = u.toString(); } catch (_) {} }
  const lista = p.publico_lista ? await listaObter(_kvMc, p.publico_lista) : null;
  const kit = { rede: 'linkedin', nome, objetivo: 'Visitas ao site (cliques no link)', posicionamentos: 'LinkedIn — feed (anúncio de imagem única)', botao: 'Saiba mais', link, texto, titulo, descricao: '', imagem,
    orcamento_diario: diario, dias, total_maximo: Math.round(diario * dias * 100) / 100, inicio: ini, fim, icp_versao: ICP_VERSAO,
    publico: lista ? `Lista do Apollo "${lista.nome}" (${(lista.pessoas || []).length} decisores) — Matched Audience · Brasil` : 'Senioridade Dono, Sócio, CXO, VP e Diretor · empresas com 201+ funcionários · Brasil · sem expansão de público',
    ...(lista ? { publico_lista: lista.id, publico_lista_nome: lista.nome } : {}), ...(p.trilha ? { trilha: String(p.trilha).substring(0, 40) } : {}) };
  const st = await liStatus(base).catch(() => ({}));
  if (!st.conectado || p.so_kit) return { modo: 'kit', kit };
  let segmento = null, aviso = null;
  if (lista) {
    if (!lista.linkedin?.segmento_id) throw err('Envie a lista "' + lista.nome + '" ao LinkedIn antes (aba Públicos do Apollo → Enviar ao LinkedIn)');
    const s = await liPublicoLer(lista.linkedin.segmento_id);
    if (!s.ad_segment) throw err('O LinkedIn ainda está processando a lista "' + lista.nome + '" (leva até 48 h) — tente mais tarde');
    segmento = s.ad_segment; if (s.casados != null && s.casados < 300) aviso = 'O LinkedIn casou ' + s.casados + ' membro(s) — ele só veicula com 300 ou mais. Aumente a lista antes de ativar.';
  }
  const r = await liCriar({ nome, texto, titulo, imagem, link, orcamento_diario: diario, inicio: ini, fim, segmento });
  const reg = { ...r, criado_em: new Date().toISOString(), estado: 'PAUSED', ...kit };
  const L = (await _kvMc('mkt:patrocinados')) || []; L.unshift(reg); await _kvMc('mkt:patrocinados', L.slice(0, 100));
  return { modo: 'linkedin', campanha: reg, aviso };
}
// ═══ v3.239: LISTA DO APOLLO → PÚBLICO PERSONALIZADO NO META (lista de clientes). O sistema normaliza e manda só o
// HASH SHA-256 de e-mail, telefone, nome, cidade, estado e país (o que o Meta usa para achar a pessoa). Reenviar a mesma
// lista acrescenta quem entrou depois (o Meta não duplica).
async function publicoMetaEnviar({ lista_id } = {}) {
  const c = _metaCfg(); if (!c.token || !c.conta) throw Object.assign(new Error('Meta não configurado (META_ADS_TOKEN / META_AD_ACCOUNT_ID)'), { status: 400 });
  const lista = await listaObter(_kvMc, lista_id);
  const linhas = linhasMeta(lista.pessoas);
  if (!linhas.length) throw Object.assign(new Error('Ninguém da lista tem e-mail ou telefone — clique em "Buscar e-mails no Apollo" antes'), { status: 400 });
  let aud = lista.meta?.audience_id || null;
  if (aud) { try { await _meta(aud + '?fields=id'); } catch (_) { aud = null; } } // apagado no Gerenciador → cria outro
  if (!aud) {
    try { aud = (await _meta(`act_${c.conta}/customaudiences`, 'POST', { name: ('Apollo · ' + lista.nome).substring(0, 100), subtype: 'CUSTOM', description: 'Decisores selecionados no Apollo pelo Atlantyx OS', customer_file_source: 'USER_PROVIDED_ONLY' })).id; }
    catch (e) { if (/terms|termos|tos\b/i.test(e.message)) throw Object.assign(new Error('Aceite uma vez os Termos de Públicos Personalizados do Meta: https://business.facebook.com/ads/manage/customaudiences/tos/?act=' + c.conta + ' — depois clique de novo em Enviar ao Meta'), { status: 400 }); throw e; }
  }
  for (let i = 0; i < linhas.length; i += 5000) await _meta(aud + '/users', 'POST', { payload: { schema: SCHEMA_META, data: linhas.slice(i, i + 5000) } });
  lista.meta = { audience_id: aud, linhas: linhas.length, pessoas: (lista.pessoas || []).length, enviado_em: new Date().toISOString(), conta: c.conta };
  try { Object.assign(lista.meta, await publicoMetaLer(aud)); } catch (_) {}
  const resumo = await listaGravar(_kvMc, lista);
  return { lista: resumo };
}
async function publicoMetaLer(aud) {
  const a = await _meta(aud + '?fields=approximate_count_lower_bound,approximate_count_upper_bound,operation_status,delivery_status');
  return { tamanho_min: a.approximate_count_lower_bound ?? null, tamanho_max: a.approximate_count_upper_bound ?? null, situacao: a.operation_status?.description || null, entrega: a.delivery_status?.description || null, lido_em: new Date().toISOString() };
}
async function publicoLiEnviar({ lista_id } = {}) {
  const lista = await listaObter(_kvMc, lista_id);
  lista.linkedin = { ...(lista.linkedin || {}), ...(await liPublicoEnviar(lista)) };
  return { lista: await listaGravar(_kvMc, lista) };
}
// atualiza o tamanho/estado dos públicos já enviados (Meta e LinkedIn) de uma lista
async function publicoPlataformasLer({ lista_id } = {}) {
  const lista = await listaObter(_kvMc, lista_id); const erros = [];
  if (lista.meta?.audience_id) { try { Object.assign(lista.meta, await publicoMetaLer(lista.meta.audience_id)); } catch (e) { erros.push('Meta: ' + e.message); } }
  if (lista.linkedin?.segmento_id) { try { Object.assign(lista.linkedin, await liPublicoLer(lista.linkedin.segmento_id), { lido_em: new Date().toISOString() }); } catch (e) { erros.push('LinkedIn: ' + e.message); } }
  return { lista: await listaGravar(_kvMc, lista), erros };
}
// v3.193: ALTERAR PERÍODO (e, opcional, R$/dia) de uma campanha patrocinada já criada — muda o conjunto no Meta.
// O Meta não deixa mudar o início depois que a veiculação começou: nesse caso só o fim e o orçamento mudam.
async function patrocinadoPeriodo({ id, inicio, fim, orcamento_diario } = {}) {
  const err = m => Object.assign(new Error(m), { status: 400 });
  const lista = (await _kvMc('mkt:patrocinados')) || []; const reg = lista.find(x => String(x.id) === String(id)); if (!reg) throw err('Campanha não encontrada');
  if (!reg.adset_id && reg.rede !== 'linkedin') throw err('Esta campanha não tem conjunto de anúncios registrado');
  const ini = String(inicio || reg.inicio || ''), fi = String(fim || reg.fim || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fi) || fi < ini) throw err('Informe início e fim (fim depois do início)');
  const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  if (fi < hojeSP) throw err('A data de fim já passou');
  const diario = orcamento_diario != null && orcamento_diario !== '' ? Math.round(Number(String(orcamento_diario).replace(',', '.')) * 100) / 100 : Number(reg.orcamento_diario);
  if (!(diario >= (reg.rede === 'linkedin' ? 10 : 6))) throw err('Orçamento diário mínimo: ' + (reg.rede === 'linkedin' ? '10,00 no LinkedIn' : 'R$ 6,00'));
  const jaComecou = reg.inicio && reg.inicio <= hojeSP && (reg.estado === 'ACTIVE' || reg.estado_meta === 'ACTIVE' || reg.ativado_em);
  const corpo = { end_time: fi + 'T23:59:00-0300', daily_budget: Math.round(diario * 100) };
  let inicioFinal = reg.inicio, avisoInicio = null;
  if (ini !== reg.inicio) { if (jaComecou) avisoInicio = 'A veiculação já começou — o Meta não deixa mudar o início; mudei só o fim/orçamento.'; else { corpo.start_time = (ini < hojeSP ? hojeSP : ini) + 'T08:00:00-0300'; inicioFinal = ini < hojeSP ? hojeSP : ini; } }
  if (reg.rede === 'linkedin') await liPeriodo(reg, { inicio: inicioFinal, fim: fi, diario, mudarInicio: !!corpo.start_time }); // v3.239
  else await _meta(reg.adset_id, 'POST', corpo);
  const dias = Math.round((new Date(fi) - new Date(inicioFinal)) / 864e5) + 1;
  Object.assign(reg, { inicio: inicioFinal, fim: fi, orcamento_diario: diario, dias, total_maximo: Math.round(diario * dias * 100) / 100, periodo_alterado_em: new Date().toISOString() });
  await _kvMc('mkt:patrocinados', lista);
  return { ok: true, campanha: reg, aviso: avisoInicio };
}
async function patrocinadoEstado({ id, estado } = {}) {
  if (!['ACTIVE', 'PAUSED'].includes(estado)) throw Object.assign(new Error('Estado inválido'), { status: 400 });
  const lista = (await _kvMc('mkt:patrocinados')) || []; const reg = lista.find(x => String(x.id) === String(id)); if (!reg) throw new Error('Campanha não encontrada');
  // ativar liga os três níveis; pausar desliga a campanha (o resto fica como está)
  if (reg.rede === 'linkedin') await liEstado(reg, estado); // v3.239
  else if (estado === 'ACTIVE') { for (const k of [reg.ad_id, reg.adset_id, reg.id]) await _meta(k, 'POST', { status: 'ACTIVE' }); }
  else await _meta(reg.id, 'POST', { status: 'PAUSED' });
  reg.estado = estado; reg[estado === 'ACTIVE' ? 'ativado_em' : 'pausado_em'] = new Date().toISOString(); await _kvMc('mkt:patrocinados', lista);
  return { ok: true, estado };
}
// v3.176: DIAGNÓSTICO — confere no Meta, sem criar nada, se o token enxerga conta, página e Instagram e tem as permissões
async function patrocinadoDiagnostico() {
  const c = _metaCfg(); const itens = [];
  const add = (ok, item, detalhe, correcao) => itens.push({ ok, item, detalhe: detalhe || '', correcao: ok ? '' : (correcao || '') });
  if (!c.token) return { itens: [{ ok: false, item: 'Token', detalhe: 'META_ADS_TOKEN não configurado na Vercel', correcao: 'Gere o token do usuário do sistema e cadastre na Vercel' }] };
  // 1. o que o token tem (debug_token devolve as permissões e em quais páginas/contas cada uma vale)
  let escopos = [], granular = [];
  try { const d = await _meta('debug_token?input_token=' + encodeURIComponent(c.token)); const x = d.data || {};
    escopos = x.scopes || []; granular = x.granular_scopes || [];
    add(!!x.is_valid, 'Token válido', x.is_valid ? (x.type || '') + (x.expires_at ? (x.expires_at === 0 ? ' · não expira' : ' · expira em ' + new Date(x.expires_at * 1000).toISOString().slice(0, 10)) : ' · não expira') : (x.error?.message || 'inválido'), 'Gere um token novo no usuário do sistema');
  } catch (e) { add(false, 'Token', e.message, 'Gere um token novo no usuário do sistema e cadastre na Vercel'); }
  for (const [perm, para] of [['ads_management', 'criar campanhas'], ['ads_read', 'ler resultados'], ['business_management', 'acessar o portfólio'], ['pages_read_engagement', 'ler a página'], ['pages_manage_ads', 'criar o anúncio em nome da página'], ['pages_show_list', 'listar páginas']])
    add(escopos.includes(perm), 'Permissão ' + perm, para, 'Gere um token novo marcando ' + perm);
  // v3.178: instagram_basic é opcional — o anúncio no Instagram sai só com ads_management + pages_manage_ads (só informativo)
  if (escopos.includes('instagram_basic')) add(true, 'Permissão instagram_basic', 'opcional');
  const gPag = granular.find(g => g.scope === 'pages_manage_ads');
  if (gPag && Array.isArray(gPag.target_ids) && gPag.target_ids.length) add(gPag.target_ids.includes(c.pagina), 'pages_manage_ads vale para a página ' + c.pagina, 'páginas liberadas: ' + gPag.target_ids.join(', '), 'Atribua a página Atlantyx ao usuário do sistema (controle total) e gere o token de novo');
  // 2. os ativos
  try { const a = await _meta('act_' + c.conta + '?fields=name,account_status,currency'); add(a.account_status === 1, 'Conta de anúncios', a.name + ' · ' + a.currency + (a.account_status === 1 ? ' · ativa' : ' · status ' + a.account_status), 'Verifique pagamento/restrições da conta no Gerenciador de Anúncios'); }
  catch (e) { add(false, 'Conta de anúncios act_' + c.conta, e.message, 'Atribua a conta de anúncios ao usuário do sistema (controle total)'); }
  try { const pg = await _meta(c.pagina + '?fields=name'); add(true, 'Página', pg.name); } catch (e) { add(false, 'Página ' + c.pagina, e.message, 'Atribua a página ao usuário do sistema (controle total)'); }
  try { const pg = await _meta(c.pagina + '?fields=tasks'); const t = pg.tasks || []; if (t.length) add(t.includes('ADVERTISE') || t.includes('MANAGE'), 'Função na página', t.join(', '), 'Em Configurações → Páginas → Atlantyx → Atribuir pessoas → usuário do sistema → controle total (ou "Criar anúncios")'); } catch (_) {}
  try { const ig = await _meta(c.ig + '?fields=username'); add(true, 'Instagram', '@' + ig.username); } catch (e) { add(false, 'Instagram ' + c.ig, e.message, 'Atribua a conta do Instagram ao usuário do sistema e confira se está ligada à página'); }
  return { itens, ok: itens.every(i => i.ok) };
}
// v3.214: CORRIGIR O PÚBLICO DAS CAMPANHAS JÁ CRIADAS — lê os conjuntos de anúncios direto da conta no Meta (não
// depende do banco), mantém idade (mínimo 35) e aplica: capitais de negócio, interesse do tema E camada de decisor,
// exclusões (emprego, concurso, estágio) e só Feed. aplicar:false só lista. Status (ativa/pausada) não muda.
// v3.234: ICP C-LEVEL NAS CAMPANHAS NO AR — lê TODOS os conjuntos de anúncios da conta (com paginação; antes só 100) e
// aplica o público de decisores MESCLANDO com o direcionamento atual: mantém públicos personalizados/semelhantes,
// exclusões de público e as plataformas (antes trocava tudo e tirava o Facebook de conjunto que rodava nos dois).
// Idade mínima 35, Advantage+ de público desligado, interesse de cargo executivo E camada de decisor, exclusões de
// emprego/estudo/programação. Status (ativa/pausada) e orçamento não mudam. somente_fora: só os que não estão no ICP.
function _icpConforme(t = {}, pb, dec) {
  // v3.239: público por LISTA (Apollo/clientes) — a lista já são os decisores; filtro de cargo/idade só encolheria o público
  if ((t.custom_audiences || []).length) return { ok: true, motivos: [], lista: true };
  // v3.316: campanha geolocalizada (feira/evento) com 'todo o público no local' — escolha do fundador, o corretor não mexe
  if ((t.geo_locations?.custom_locations || []).length && !(t.flexible_spec || []).some(f => (f.work_positions || []).length || (f.industries || []).length)) return { ok: true, motivos: [], geolocalizada: true };
  const motivos = [];
  if (!(parseInt(t.age_min) >= META_IDADE_MIN)) motivos.push('idade mínima ' + (t.age_min || 18) + ' (ICP: ' + META_IDADE_MIN + '+)');
  if (t.targeting_automation?.advantage_audience !== 0) motivos.push('Advantage+ de público ligado (o Meta amplia para qualquer pessoa)');
  const ints = new Set((t.flexible_spec || []).flatMap(f => (f.interests || []).map(i => String(i.id))));
  // v3.236: interesse não é cargo — quem se interessa por "CEO" não é CEO
  const qtdInt = (t.flexible_spec || []).reduce((n, f) => n + (f.interests || []).length, 0) + (t.interests || []).length;
  if (qtdInt) motivos.push('direciona por INTERESSE (' + qtdInt + ') — alcança quem se interessa pelo tema, não quem ocupa o cargo');
  const temCargo = (t.flexible_spec || []).some(f => (f.work_positions || []).length) || (t.work_positions || []).length;
  if (pb?.cargos?.length && !temCargo) motivos.push('sem filtro de cargo atual (dono, sócio, C-level)');
  const tecnicos = (t.flexible_spec || []).flatMap(f => [...(f.interests || []), ...(f.industries || []), ...(f.behaviors || [])]).filter(i => /data analysis|big data|power bi|\bsap\b|business intelligence|programa|software|developer|engineer|engenh|computa|technical|t[eé]cnic|small business|page admin|administrador de p/i.test(i.name || ''));
  if (tecnicos.length) motivos.push('mira público técnico/pequeno negócio: ' + tecnicos.map(i => i.name).slice(0, 4).join(', '));
  if (!pb?.cargos?.length && dec?.setores?.length && !(t.flexible_spec || []).some(f => (f.industries || []).length)) motivos.push('sem filtro de área de atuação em gestão');
  if (dec?.excluir?.length && !(t.exclusions?.interests || []).length) motivos.push('sem exclusões (emprego, estudo, programação)');
  if (!t.geo_locations) motivos.push('sem localização');
  return { ok: !motivos.length, motivos };
}
async function patrocinadoPublicoAtualizar({ aplicar = false, ids = null, somente_fora = false } = {}) {
  const c = _metaCfg(); if (!c.token || !c.conta) throw new Error('Meta não configurado (META_ADS_TOKEN / META_AD_ACCOUNT_ID)');
  let conjTodos = [], prox = `act_${c.conta}/adsets?fields=id,name,campaign_id,effective_status,targeting&limit=200`;
  for (let i = 0; i < 10 && prox; i++) { const r = await _meta(prox); conjTodos.push(...(r.data || [])); const n = r.paging?.next; prox = n ? n.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, '') : null; }
  const conj = conjTodos.filter(x => !['DELETED', 'ARCHIVED'].includes(x.effective_status) && !/COMPLETED/.test(x.effective_status || ''))
    .filter(x => !ids || ids.map(String).includes(String(x.id)));
  const pb = await _publicoB2B().catch(() => ({ cidades: [], interesses: [] }));
  let dec = await _publicoDecisores().catch(() => null);
  const novo = (t, comDec) => { const L = [];
    // v3.236: cargo atual (work_positions); sem ele, área de atuação em gestão. Interesse nunca.
    if (comDec && pb.cargos?.length) L.push({ work_positions: pb.cargos.map(({ id, name }) => ({ id, name })) });
    else if (dec?.setores?.length) L.push({ industries: dec.setores.map(({ id, name }) => ({ id, name })) });
    if (!L.length) throw new Error('sem filtro de cargo/área disponível no Meta — conjunto não alterado');
    const geo = (t.geo_locations?.custom_locations || []).length ? t.geo_locations /* v3.316: mantém o raio da feira/evento */ : pb.cidades.length ? { cities: pb.cidades.map(({ key, radius, distance_unit }) => ({ key, radius, distance_unit })), location_types: ['home', 'recent'] } : (t.geo_locations || { countries: ['BR'] });
    const aMin = Math.max(META_IDADE_MIN, parseInt(t.age_min) || META_IDADE_MIN);
    const plat = Array.isArray(t.publisher_platforms) && t.publisher_platforms.length ? t.publisher_platforms : ['instagram'];
    const out = { ...t, geo_locations: geo, age_min: aMin, age_max: Math.min(META_IDADE_MAX, Math.max(aMin, parseInt(t.age_max) || META_IDADE_MAX)),
      targeting_automation: { advantage_audience: 0 }, publisher_platforms: plat };
    delete out.age_range; delete out.flexible_spec; delete out.exclusions; delete out.interests; delete out.behaviors; delete out.industries; delete out.work_positions;
    if (L.length) out.flexible_spec = L;
    if (comDec && dec?.excluir?.length) out.exclusions = { interests: dec.excluir.map(({ id, name }) => ({ id, name })) };
    if (plat.includes('instagram')) out.instagram_positions = IG_POSICOES; // Stories/Reels = curtida de quem não decide
    return out; };
  const itens = []; const reg = (await _kvMc('mkt:meta:icp_aplicado').catch(() => null)) || {};
  for (const x of conj) {
    const t = x.targeting || {}; const conf = _icpConforme(t, pb, dec);
    const antes = { idade: `${t.age_min || '?'}–${t.age_max || '?'}`, posicoes: (t.instagram_positions || []).join(', ') || 'automático', local: t.geo_locations?.cities ? t.geo_locations.cities.length + ' cidade(s)' : (t.geo_locations?.countries || []).join(',') || '—', interesses: (t.flexible_spec || []).reduce((s, f) => s + (f.interests || []).length, 0), exclusoes: !!t.exclusions };
    const it = { id: x.id, nome: x.name, estado: x.effective_status, antes, no_icp: conf.ok, motivos: conf.motivos };
    if (conf.lista) { it.pulado = 'público por lista (a lista já é o filtro)'; itens.push(it); continue; } // v3.239
    if (somente_fora && conf.ok) { it.pulado = 'já no ICP'; itens.push(it); continue; }
    // v3.237: já recebeu o ajuste possível nesta versão da regra (ex.: Meta não aceita cargo → área de atuação) — não
    // reaplica de hora em hora (cada alteração reinicia o aprendizado do Meta)
    if (somente_fora && reg[x.id]?.versao === ICP_VERSAO && reg[x.id]?.fallback && conf.motivos.every(m => /cargo atual/.test(m))) { it.pulado = 'ajuste possível já aplicado'; itens.push(it); continue; }
    if (aplicar) {
      try { await _meta(x.id, 'POST', { targeting: novo(t, true) }); it.ok = true; it.filtro = pb.cargos?.length ? 'cargo atual' : 'área de atuação'; }
      catch (e) { try { await _meta(x.id, 'POST', { targeting: novo(t, false) }); it.ok = true; it.camada_decisor = false; it.aviso = 'o Meta recusou o filtro de cargo — aplicado pela área de atuação em gestão: ' + e.message; } catch (e2) { it.ok = false; it.erro = e2.message; } }
      if (it.ok) reg[x.id] = { versao: ICP_VERSAO, em: new Date().toISOString(), fallback: it.camada_decisor === false };
    }
    itens.push(it);
  }
  if (aplicar) await _kvMc('mkt:meta:icp_aplicado', reg).catch(() => {});
  return { conjuntos: itens, total: itens.length, fora_do_icp: itens.filter(i => !i.no_icp).length, aplicado: !!aplicar, icp_versao: ICP_VERSAO,
    publico: { cidades: pb.cidades.length, idade_min: META_IDADE_MIN, cargos: (pb.cargos || []).map(i => i.name), interesses: [], comportamentos: (dec?.comportamentos || []).map(i => i.name), setores: (dec?.setores || []).map(i => i.name), excluidos: (dec?.excluir || []).map(i => i.name) } };
}
// v3.234: GUARDIÃO DO ICP — a cada 1 h (v3.235; era 6 h) (no cron da fila) confere os conjuntos da conta e reaplica o público C-level
// nos que estiverem fora (campanha nova criada direto no Gerenciador, idade alterada, Advantage+ religado…).
// Não ativa, não pausa e não mexe em orçamento. Registro do que fez em 'mkt:meta:icp_guarda'.
// v3.235: GUARDIÃO DO ICP NO CONTEÚDO PLANEJADO — aplica direto, sem botão. De hora em hora varre o que está agendado
// no Metricool, a fila da autocampanha e as peças de tendências; a cada minuto livre do cron corrige UM item:
//  · post agendado no Metricool → a IA confere e, se fala com público técnico/estudante/emprego, REESCREVE para donos e
//    C-levels mantendo data, redes, imagem, links e CTA (recria o post sem duplicar); se já está no ICP, mantém
//  · item da fila ainda não agendado → volta para "texto" e é regerado já com o prompt do ICP
//  · peça de tendências com roteiro, sem vídeo e sem agendamento → roteiro limpo para ser refeito com o ICP
// Tudo fica registrado (antes → depois) em 'mkt:icp_conteudo_log'.
async function _icpRevisarTexto(texto) {
  const urls = String(texto || '').match(/https?:\/\/\S+|\b[\w-]+\.(?:com|com\.br|app|io)\/\S*/gi) || [];
  const sys = ICP_TEXTO + '\nVocê revisa posts de redes sociais da Atlantyx (dados, BI e IA para empresas). Se o texto JÁ fala com donos e C-levels de médias e grandes empresas, devolva {"ok":true}. Se fala com público técnico, estudante, iniciante, quem procura emprego/curso ou pessoa física, REESCREVA para donos e C-levels: mesmo assunto e idioma, tamanho parecido (±20%), foco em resultado de negócio (dinheiro, risco, prazo, controle), sem jargão de ferramenta; mantenha EXATAMENTE os links/URLs, as variáveis entre chaves duplas (ex.: {{nome}}), a chamada final e no máximo as mesmas hashtags. Devolva {"ok":false,"texto":"texto reescrito","motivo":"1 frase"}.';
  const j = JSON.parse(await _claudeAuto(sys, 'TEXTO:\n' + String(texto || '').substring(0, 3000), 1200));
  if (j.ok || !j.texto) return { ok: true };
  const novo = String(j.texto).trim();
  const faltam = [...urls.filter(u => !novo.includes(u.replace(/[).,;]+$/, ''))), ...(String(texto || '').match(/\{\{\s*\w+\s*\}\}/g) || []).filter(v => !novo.includes(v))]; // v3.237: + variáveis {{nome}} dos disparos
  if (faltam.length) return { ok: false, erro: 'reescrita perdeu link(s) — post mantido: ' + faltam.slice(0, 2).join(', ') };
  return { ok: false, texto: novo, motivo: String(j.motivo || '').substring(0, 200) };
}
async function _icpConteudoGuardiao() {
  const agora = Date.now(); const est = (await _kvMc('mkt:icp_conteudo').catch(() => null)) || {};
  if (!est.varrido_em || agora - Date.parse(est.varrido_em) > 3600e3) {
    const a = await icpAuditarPlanejados({ dias: 60 });
    const ja = new Set((est.feitos || []).map(x => x.origem + '|' + x.id));
    const v = { varrido_em: new Date().toISOString(), pendentes: (a.fora_do_icp || []).filter(x => !ja.has(x.origem + '|' + x.id)).map(x => ({ origem: x.origem, id: x.id, data: x.data, trecho: x.trecho })), feitos: (est.feitos || []).slice(-300), avisos: a.avisos };
    await _kvMc('mkt:icp_conteudo', v); return { varreu: v.pendentes.length };
  }
  const it = (est.pendentes || []).shift(); if (!it) return { ocioso: true };
  // tira da lista E marca como feito ANTES de mexer — se a função for cortada no meio, o item não é reescrito de novo
  est.feitos = [...(est.feitos || []), { origem: it.origem, id: it.id }].slice(-300);
  await _kvMc('mkt:icp_conteudo', est);
  const log = (await _kvMc('mkt:icp_conteudo_log').catch(() => null)) || []; const reg = { em: new Date().toISOString(), origem: it.origem, id: it.id, data: it.data, trecho: it.trecho };
  try {
    if (/^Metricool/.test(it.origem)) {
      const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = process.env.METRICOOL_BLOG_ID;
      const g = await mc(`/v2/scheduler/posts/${it.id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN); const p = g?.data || g?.post || g;
      const quando = Date.parse(String(p?.publicationDate?.dateTime || p?.publicationDate || '').substring(0, 19) + '-03:00');
      if (!p || !p.text) { reg.acao = 'post não encontrado (já publicado ou excluído)'; }
      else if (quando && quando - Date.now() < 30 * 60e3) { reg.acao = 'publica em menos de 30 min — mantido'; }
      else { const rv = await _icpRevisarTexto(p.text);
        if (rv.ok) reg.acao = 'IA conferiu: já está no ICP — mantido';
        else if (rv.erro) reg.acao = rv.erro;
        else { const novoId = await _recriarSemDuplicar(p.id, _corpoPostMc(p, { text: rv.texto, draft: !!p.draft, ...(p.autoPublish !== undefined ? { autoPublish: p.autoPublish } : {}) }), { USERID, BLOGID, TOKEN });
          reg.acao = 'reescrito para donos/C-levels (mesma data, redes, imagem e links)'; reg.novo_id = novoId; reg.antes = String(p.text).substring(0, 400); reg.depois = rv.texto.substring(0, 400); reg.motivo = rv.motivo; } }
    } else if (/^Fila/.test(it.origem)) {
      const sql = await getSql();
      const r = await sql`UPDATE autocampanha_fila SET etapa = 'texto', status = 'pendente', texto = NULL, erro = NULL, atualizado_em = NOW() WHERE id = ${it.id} AND metricool_id IS NULL AND status <> 'processando' RETURNING id`;
      reg.acao = r.length ? 'texto descartado — será regerado com o ICP' : 'já agendado — tratado pelo post no Metricool';
    } else if (/^Kanban/.test(it.origem)) {
      const kb = await _kvMc('atx:kanban:pecas'); const pc = (Array.isArray(kb) ? kb : []).find(x => x.id === it.id);
      if (!pc || ['Publicado', 'Agendado'].includes(pc.status)) reg.acao = 'peça já agendada/publicada ou removida — mantida';
      else { const rv = await _icpRevisarTexto(pc.copy || ''); if (rv.ok) reg.acao = 'IA conferiu: já está no ICP — mantida'; else if (rv.erro) reg.acao = rv.erro;
        else { const kb2 = await _kvMc('atx:kanban:pecas'); const p2 = (kb2 || []).find(x => x.id === it.id); // relê para não perder alteração feita no meio
          if (p2) { reg.antes = String(p2.copy || '').substring(0, 400); p2.copy = rv.texto; p2.atualizado_em = new Date().toISOString(); p2.icp_revisado_em = p2.atualizado_em; await _kvMc('atx:kanban:pecas', kb2);
            reg.acao = 'texto da peça reescrito para donos/C-levels'; reg.depois = rv.texto.substring(0, 400); reg.motivo = rv.motivo; } } }
    } else if (/^Campanha/.test(it.origem)) {
      const [cid, rede] = String(it.id).split('|'); const sql = await getSql();
      const c = (await sql`SELECT data FROM campanhas WHERE id = ${cid}`)[0]; let d = c?.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = null; } }
      const v = d?.data?.copy_por_rede?.[rede]; const txt = typeof v === 'string' ? v : v?.texto;
      if (!txt) reg.acao = 'texto não encontrado — mantido';
      else { const rv = await _icpRevisarTexto(txt); if (rv.ok) reg.acao = 'IA conferiu: já está no ICP — mantido'; else if (rv.erro) reg.acao = rv.erro;
        else { if (typeof v === 'string') d.data.copy_por_rede[rede] = rv.texto; else v.texto = rv.texto; d.atualizado_em = new Date().toISOString();
          await sql`UPDATE campanhas SET data = ${JSON.stringify(d)}::jsonb, atualizado_em = NOW() WHERE id = ${cid}`;
          reg.acao = 'texto de ' + rede + ' da campanha reescrito para donos/C-levels'; reg.antes = String(txt).substring(0, 400); reg.depois = rv.texto.substring(0, 400); reg.motivo = rv.motivo; } }
    } else if (/^Disparo/.test(it.origem)) {
      const sql = await getSql(); const l = (await sql`SELECT texto FROM disparo_lotes WHERE id = ${it.id} AND status = 'ativo'`)[0];
      if (!l?.texto) reg.acao = 'lote encerrado — mantido';
      else { const rv = await _icpRevisarTexto(l.texto); if (rv.ok) reg.acao = 'IA conferiu: já está no ICP — mantido'; else if (rv.erro) reg.acao = rv.erro;
        else { await sql`UPDATE disparo_lotes SET texto = ${rv.texto} WHERE id = ${it.id} AND status = 'ativo'`;
          reg.acao = 'texto do disparo (envios pendentes) reescrito para donos/C-levels'; reg.antes = String(l.texto).substring(0, 400); reg.depois = rv.texto.substring(0, 400); reg.motivo = rv.motivo; } }
    } else if (/^Tend/.test(it.origem)) {
      const sql = await getSql();
      // v3.237: nunca apaga vídeo gravado — o reel do Fabio fica em roteiro.video_proprio / video_completo (midia_urls vazio)
      const r = await sql`UPDATE tend_pecas SET roteiro = NULL, legenda = NULL, status = 'planejada', atualizado_em = NOW() WHERE id = ${it.id} AND metricool_id IS NULL
        AND COALESCE(jsonb_array_length(midia_urls), 0) = 0 AND COALESCE(status, '') NOT IN ('publicada', 'agendada')
        AND (roteiro IS NULL OR (roteiro->'video_proprio' IS NULL AND roteiro->'video_completo' IS NULL AND roteiro->'video' IS NULL)) RETURNING id`;
      reg.acao = r.length ? 'roteiro descartado — será refeito com o ICP' : 'já tem vídeo ou agendamento — mantido (revise na tela de Tendências)';
    }
  } catch (e) { reg.acao = 'erro: ' + String(e.message).substring(0, 200); }
  if (reg.novo_id) { est.feitos = [...(est.feitos || []), { origem: it.origem, id: String(reg.novo_id) }].slice(-300); await _kvMc('mkt:icp_conteudo', est); }
  log.unshift(reg); await _kvMc('mkt:icp_conteudo_log', log.slice(0, 100));
  return { corrigiu: reg };
}
async function _icpGuardiao({ forcar = false } = {}) {
  const c = _metaCfg(); if (!c.token || !c.conta) return { pulado: 'Meta não configurado' };
  const ult = await _kvMc('mkt:meta:icp_guarda').catch(() => null);
  if (!forcar && ult?.em && ult.versao === ICP_VERSAO && Date.now() - Date.parse(ult.em) < 3600e3) return { pulado: 'executado há menos de 1 h' }; // v3.235: de hora em hora (era 6 h)
  await _kvMc('mkt:meta:icp_guarda', { ...(ult || {}), em: new Date().toISOString(), rodando: true });
  try { const r = await patrocinadoPublicoAtualizar({ aplicar: true, somente_fora: true });
    const v = { em: new Date().toISOString(), versao: ICP_VERSAO, conjuntos: r.total, corrigidos: r.conjuntos.filter(i => i.ok).map(i => ({ id: i.id, nome: i.nome, motivos: i.motivos })), erros: r.conjuntos.filter(i => i.ok === false).map(i => ({ nome: i.nome, erro: i.erro })) };
    await _kvMc('mkt:meta:icp_guarda', v); return v;
  } catch (e) { const v = { em: new Date().toISOString(), erro: e.message }; await _kvMc('mkt:meta:icp_guarda', v).catch(() => {}); return v; }
}
// v3.216: KPIs DE MÍDIA PAGA (tela S2 KPIs) — Meta Ads (gasto, cliques, CTR, leads do Pixel/formulário) × HubSpot
// (negócios ganhos e a origem PAID_SOCIAL/PAID_SEARCH). ROAS/ROI usam a receita dos negócios ganhos em 90 dias cuja
// origem é mídia paga; CAC de mídia = gasto 90 dias ÷ clientes ganhos de mídia paga (ou de todas as origens, com aviso).
async function metaKpis() {
  const c = _metaCfg(); const out = { meta_ok: !!(c.token && c.conta), erros: [] };
  const ins = async preset => { const r = await _meta(`act_${c.conta}/insights?fields=spend,impressions,clicks,inline_link_clicks,ctr,cpc,actions&date_preset=${preset}`); return (r.data || [])[0] || {}; };
  const leadsDe = x => (x.actions || []).filter(a => /^(lead|offsite_conversion\.fb_pixel_lead|onsite_conversion\.lead_grouped|leadgen_grouped)$/.test(a.action_type)).reduce((m, a) => Math.max(m, Number(a.value) || 0), 0);
  if (out.meta_ok) {
    try { const [a30, a90] = await Promise.all([ins('last_30d'), ins('last_90d')]);
      out.d30 = { gasto: Number(a30.spend || 0), impressoes: Number(a30.impressions || 0), cliques_link: Number(a30.inline_link_clicks || 0), ctr: null, cpc: null, leads: leadsDe(a30) };
      // v3.233: CTR/CPC de LINK (o 'ctr'/'cpc' do Meta contam qualquer clique — curtir, ver perfil — e inflavam o CTR)
      if (out.d30.impressoes > 0) out.d30.ctr = Math.round(out.d30.cliques_link / out.d30.impressoes * 10000) / 100;
      if (out.d30.cliques_link > 0) out.d30.cpc = Math.round(out.d30.gasto / out.d30.cliques_link * 100) / 100;
      out.d90 = { gasto: Number(a90.spend || 0), leads: leadsDe(a90) };
      out.cpl = out.d30.leads ? Math.round(out.d30.gasto / out.d30.leads * 100) / 100 : null;
    } catch (e) { out.erros.push('Meta: ' + e.message); }
  } else out.erros.push('Meta Ads não configurado (META_ADS_TOKEN / META_AD_ACCOUNT_ID)');
  const tk = process.env.HUBSPOT_TOKEN;
  if (tk) {
    try { const ganhos = []; let after;
      for (let i = 0; i < 10; i++) { const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals/search', { method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'closedate', operator: 'GTE', value: String(Date.now() - 90 * 864e5) }, { propertyName: 'hs_is_closed_won', operator: 'EQ', value: 'true' }] }], properties: ['amount', 'hs_analytics_source', 'dealname'], limit: 100, ...(after ? { after } : {}) }) });
        const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || 'HTTP ' + r.status); ganhos.push(...(d.results || [])); after = d.paging?.next?.after; if (!after) break; }
      const pago = ganhos.filter(g => /^PAID_(SOCIAL|SEARCH)$/i.test(g.properties?.hs_analytics_source || ''));
      const soma = l => l.reduce((t, g) => t + (parseFloat(g.properties?.amount) || 0), 0);
      out.hubspot = { ganhos_90d: ganhos.length, receita_90d: Math.round(soma(ganhos)), ganhos_pagos_90d: pago.length, receita_paga_90d: Math.round(soma(pago)) };
    } catch (e) { out.erros.push('HubSpot: ' + e.message); }
  }
  const g90 = out.d90?.gasto || 0, H = out.hubspot || {};
  if (g90 > 0 && H.receita_paga_90d != null) { out.roas = Math.round(H.receita_paga_90d / g90 * 100) / 100; out.roi_pct = Math.round((H.receita_paga_90d - g90) / g90 * 1000) / 10; }
  // v3.234: CAC de mídia só com cliente atribuído à mídia paga — antes dividia pelo total de clientes (de qualquer origem)
  // e mostrava um CAC baixo que a mídia não gerou
  if (g90 > 0 && H.ganhos_pagos_90d) { out.cac = Math.round(g90 / H.ganhos_pagos_90d * 100) / 100; out.cac_base = 'clientes ganhos de mídia paga'; }
  else if (g90 > 0 && H.ganhos_90d != null) { out.cac = null; out.cac_base = 'sem cliente ganho com origem de mídia paga em 90 dias (gasto de R$ ' + g90.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' sem retorno atribuído)'; }
  return out;
}
async function patrocinadoListar() {
  const lista = (await _kvMc('mkt:patrocinados')) || []; const c = _metaCfg();
  // v3.233: status e resultado em consultas independentes (antes, falha nos insights deixava o status antigo — "ACTIVE"
  // de quando foi ativada — e a tela mostrava ativa uma campanha pausada no Meta). Status = o mais restritivo entre
  // campanha e conjuntos (campanha ACTIVE com conjunto pausado não veicula). CPC por clique no link.
  if (lista.length) { await Promise.all(lista.slice(0, 15).map(async r => {
    if (r.rede === 'linkedin') { // v3.239
      try { const x = await liLer(r); if (x.resultado) r.resultado = x.resultado;
        if (x.estado) { r.estado_meta = x.estado === 'COMPLETED' ? 'ACTIVE' : x.estado; r.encerrada = x.estado === 'COMPLETED'; r.estado_lido_em = new Date().toISOString(); r.estado_erro = null; }
        else if (x.erro) { r.estado_meta = null; r.estado_erro = String(x.erro).substring(0, 160); } } catch (e) { r.estado_meta = null; r.estado_erro = String(e.message || e).substring(0, 160); }
      return; }
    if (!c.token) return;
    try { const i = await _meta(`${r.id}/insights?fields=spend,impressions,inline_link_clicks&date_preset=maximum`); const x = (i.data || [])[0] || {};
      const g = Number(x.spend || 0), cl = Number(x.inline_link_clicks || 0);
      r.resultado = { gasto: g, impressoes: Number(x.impressions || 0), cliques_link: cl, cpc: cl > 0 ? Math.round(g / cl * 100) / 100 : null }; } catch (_) {}
    try { const st = await _meta(`${r.id}?fields=effective_status,stop_time,adsets.limit(10){effective_status}`); let e = st.effective_status || null;
      const cj = (st.adsets?.data || []).map(a => a.effective_status);
      if (e === 'ACTIVE' && cj.length && !cj.includes('ACTIVE')) e = cj.find(x => /REVIEW|PROCESS|ISSUES|DISAPPROVED/.test(x)) || 'ADSET_PAUSED';
      r.estado_meta = e; r.estado_lido_em = new Date().toISOString();
      if (st.stop_time && new Date(st.stop_time) < new Date() && e === 'ACTIVE') r.encerrada = true;
    } catch (e) { r.estado_meta = null; r.estado_erro = String(e.message || e).substring(0, 160); }
  })); }
  return { campanhas: lista };
}

// v3.106: INSTAGRAM → "LINK NA BIO". No feed do Instagram o link escrito na legenda não é clicável; o fundador
// decidiu tirar o link fixo dos posts e mandar para a bio. Remove dos posts agendados do Instagram as linhas com
// link (página de captura, /agenda, /reuniao, agenda do HubSpot, qualquer URL) e a chamada da oferta, e fecha com
// UMA chamada para a bio. Posts que também vão para LinkedIn/Facebook (mesmo texto) não são mexidos — lá o link
// é clicável; eles são listados à parte. aplicar:false só lista.
const TEXTO_BIO_IG = '🔗 Link na bio → agende uma conversa com a nossa equipe.';
function _igParaBio(txt) {
  const reUrl = /(https?:\/\/\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:app|com|cool|ly|io|br|net|org)\/\S*)/i;
  let n = 0;
  const linhas = String(txt || '').split('\n').filter(l => { const x = l.trim();
    const tira = reUrl.test(x) || /^🎁\s*Peça seu diagn[oó]stico/i.test(x) || /^👉\s*$/.test(x) || /link na bio/i.test(x) || /diagn[oó]stico gratuito de dados e IA:?\s*$/i.test(x);
    if (tira && !/link na bio/i.test(x)) n++; return !tira; });
  const base = linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // hashtags ficam no fim: a chamada entra antes delas
  const m = base.match(/\n\s*((?:#[\p{L}\p{N}_]+\s*)+)$/u);
  const corpo = m ? base.substring(0, m.index).trim() : base, tags = m ? m[1].trim() : '';
  return { texto: corpo + '\n\n' + TEXTO_BIO_IG + (tags ? '\n\n' + tags : ''), n };
}
async function instagramParaBio({ aplicar = false, ids = null, blog_id, dias = 90 } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  if (!TOKEN || !USERID || !BLOGID) throw new Error('Credenciais do Metricool ausentes');
  const agora = new Date(Date.now() + 10 * 60000), fim = new Date(Date.now() + dias * 864e5), f = d => d.toISOString().substring(0, 10);
  const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${f(agora)}T00:00:00&end=${f(fim)}T23:59:59&timezone=America/Sao_Paulo`, TOKEN);
  const lista = (Array.isArray(r) ? r : (r?.data || [])).filter(p => { const dt = new Date(String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 19) + '-03:00'); return !isNaN(dt) && dt > agora && !p.published; });
  const itens = [], mistos = [];
  for (const p of lista) {
    const provs = p.providers || []; const redes = provs.map(x => String(x.network || '').toLowerCase());
    if (!redes.includes('instagram')) continue;
    if (provs.some(x => x?.data?.postType === 'STORY')) continue;
    const a = _igParaBio(p.text), c = p.firstCommentText ? _igParaBio(p.firstCommentText) : { n: 0 };
    if (!a.n && !c.n) continue;
    const it = { id: p.id, data: String(p.publicationDate?.dateTime || p.publicationDate).substring(0, 16), redes, texto: String(p.text || '').substring(0, 80), links: a.n + c.n };
    if (redes.some(x => x !== 'instagram')) { mistos.push(it); continue; }
    itens.push({ ...it, _p: p });
  }
  const alvo = Array.isArray(ids) && ids.length ? itens.filter(i => ids.map(String).includes(String(i.id))) : itens;
  if (!aplicar) return { total_agendados: lista.length, instagram_com_link: itens.length, itens: itens.map(({ _p, ...x }) => x), mistos, texto_bio: TEXTO_BIO_IG };
  const feitos = [], falhas = [];
  for (const it of alvo) {
    try {
      let atual = null; try { const g = await mc(`/v2/scheduler/posts/${it.id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN); atual = g?.data || g?.post || g; if (!atual?.providers) atual = null; } catch (_) {}
      const fonte = atual || it._p;
      const extra = { text: _igParaBio(fonte.text).texto, shortener: false };
      if (fonte.firstCommentText) { const fc = _igParaBio(fonte.firstCommentText); extra.firstCommentText = fc.n ? fc.texto.replace('\n\n' + TEXTO_BIO_IG, '').trim() : fonte.firstCommentText; }
      const novoId = await _recriarSemDuplicar(it.id, _corpoPostMc(fonte, extra), { USERID, BLOGID, TOKEN });
      feitos.push({ id_antigo: it.id, id_novo: novoId, data: it.data });
    } catch (e) { falhas.push({ id: it.id, data: it.data, erro: e.message.substring(0, 200) }); }
  }
  return { trocados: feitos.length, feitos, falhas };
}
async function trocarLinkAgendados({ aplicar = false, ids = null, blog_id, dias = 60, adicionar = false } = {}, req) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  if (!TOKEN || !USERID || !BLOGID) throw new Error('Credenciais do Metricool ausentes');
  const base = (process.env.MEDIA_PUBLIC_BASE || ('https://' + (process.env.VERCEL_PROJECT_PRODUCTION_URL || 'atlantyx-os.vercel.app').replace(/^https?:\/\//, ''))).replace(/\/$/, ''); // v3.180: nunca o endereço protegido
  const reuniao = (process.env.LINK_REUNIAO || 'https://meetings.hubspot.com/atlantyx?uuid=eca883eb-276d-45cb-bda8-d7d5d2ae9219').trim();
  const agora = new Date(Date.now() + 10 * 60000), fim = new Date(Date.now() + dias * 864e5), f = d => d.toISOString().substring(0, 10);
  const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${f(agora)}T00:00:00&end=${f(fim)}T23:59:59&timezone=America/Sao_Paulo`, TOKEN);
  const lista = (Array.isArray(r) ? r : (r?.data || [])).filter(p => { const dt = new Date(String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 19) + '-03:00'); return !isNaN(dt) && dt > agora && !p.published; });
  const reHub = /https?:\/\/meetings\.hubspot\.com\/[^\s)"'<>]+/gi;
  // v3.78: endereço longo da captura (captura.html?r=<agenda>&utm...) → link curto /agenda/<código>?f=<rede>&p=<post>
  const _cod = id => { const t = String(id || ''); if (!t) return ''; let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36).slice(-4).padStart(4, '0'); };
  const curto = (q, rede) => base + '/agenda' + (q.utm_campaign ? '/' + _cod(q.utm_campaign) : '') + '?f=' + encodeURIComponent(q.utm_source || rede || 'linkedin') + (q.utm_content ? '&p=' + encodeURIComponent(q.utm_content) : '');
  const reLongo = new RegExp('https?:\\/\\/' + base.replace(/^https?:\/\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\/captura\\.html\\?[^\\s)"\'<>]+', 'gi');
  const hostEsc = base.replace(/^https?:\/\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reCurto = new RegExp('((?:https?:\\/\\/)?' + hostEsc + ')\\/reuniao(\\/[a-z0-9]{2,8})?', 'gi');
  const trocar = (txt, rede) => {
    let n = 0;
    let t = String(txt || '').replace(reHub, u => { n++; let q = {}; try { q = Object.fromEntries(new URL(u).searchParams); } catch (_) {} return curto(q, rede); });
    t = t.replace(reLongo, u => { if (u.length < 120) return u; n++; let q = {}; try { q = Object.fromEntries(new URL(u).searchParams); } catch (_) {} return curto(q, rede); });
    if (rede === 'instagram') {
      t = t.replace(reCurto, (m, h, cod) => { n++; return h + '/agenda' + (cod || ''); });
      // v3.79: Instagram com DUAS chamadas ("👉 …/agenda" sem código + "🎁 Peça… /agenda/código") — fica só uma,
      // a que tem o código da campanha (é ele que liga o lead à campanha)
      const reLinha = new RegExp(hostEsc + '\\/agenda(\\/[a-z0-9]{2,8})?', 'i');
      const linhas = t.split('\n'); const comLink = linhas.map((l, i) => ({ i, cod: (l.match(reLinha) || [])[1] || '', tem: reLinha.test(l) })).filter(x => x.tem);
      if (comLink.length > 1) { const fica = (comLink.filter(x => x.cod).pop() || comLink[comLink.length - 1]).i;
        const fora = new Set(comLink.filter(x => x.i !== fica).map(x => x.i)); n += fora.size;
        t = linhas.filter((l, i) => !fora.has(i)).join('\n').replace(/\n{3,}/g, '\n\n'); }
    }
    else {
      // v3.73: no LinkedIn/Facebook o link curto (chamada do Instagram que a IA copiou para o texto) não deve existir —
      // remove essa linha e a chamada repetida, deixando UMA chamada com o link completo da página de captura
      const linhas = t.split('\n'); const out = []; let viuCta = false;
      for (let i = 0; i < linhas.length; i++) { const x = linhas[i].trim();
        if (new RegExp(hostEsc + '\\/(agenda|reuniao)\\b', 'i').test(x) && !/captura\.html|[?&]f=/i.test(x)) { n++; continue; }
        if (/^🎁\s*Peça seu diagnóstico/i.test(x)) { if (viuCta) { n++; continue; } viuCta = true; }
        out.push(linhas[i]); }
      t = out.join('\n').replace(/\n{3,}/g, '\n\n');
    }
    return { texto: t, n };
  };
  const itens = [];
  // v3.77: adicionar:true → posts agendados SEM link nenhum (não Story) recebem a chamada com o link da captura
  const temAlgumLink = t => /(https?:\/\/|\b[a-z0-9-]+\.(?:app|com|cool|ly|io)\/)/i.test(t);
  if (adicionar) {
    for (const p of lista) { const provs = p.providers || []; if (provs.some(x => x?.data?.postType === 'STORY')) continue;
      if (temAlgumLink(String(p.text || '') + ' ' + String(p.firstCommentText || ''))) continue;
      const redes = provs.map(x => String(x.network || '').toLowerCase()); const soIg = redes.length && redes.every(r => r === 'instagram');
      const redeUtm = redes.find(r => r !== 'instagram') || 'instagram';
      const link = soIg ? base.replace(/^https?:\/\//, '') + '/agenda' : base + '/captura.html?r=' + encodeURIComponent(reuniao) + '&utm_source=' + redeUtm + '&utm_medium=social&utm_campaign=agendado_sem_link';
      const novoTxt = soIg ? _igParaBio(p.text).texto : String(p.text || '').replace(/\s+$/, '') + '\n\n🎁 Agende uma conversa gratuita com a Atlantyx:\n' + link; // v3.106: Instagram → link na bio
      itens.push({ id: p.id, data: String(p.publicationDate?.dateTime || p.publicationDate).substring(0, 16), redes, trocas: 1, texto: String(p.text || '').substring(0, 80), _p: p, _novo: novoTxt }); }
  }
  for (const p of (adicionar ? [] : lista)) {
    const rede = String((p.providers || [])[0]?.network || '').toLowerCase();
    const a = trocar(p.text, rede), c = trocar(p.firstCommentText || '', rede);
    if (a.n || c.n) itens.push({ id: p.id, data: String(p.publicationDate?.dateTime || p.publicationDate).substring(0, 16), redes: (p.providers || []).map(x => String(x.network).toLowerCase()), trocas: a.n + c.n, texto: String(p.text || '').substring(0, 80), _p: p, _t: a.texto, _c: c.n ? c.texto : null });
  }
  const alvo = Array.isArray(ids) && ids.length ? itens.filter(i => ids.map(String).includes(String(i.id))) : itens;
  if (!aplicar) return { total_agendados: lista.length, com_link_antigo: itens.length, itens: itens.map(({ _p, _t, _c, _novo, ...x }) => x) };
  const feitos = [], falhas = [];
  for (const it of alvo) {
    try {
      let atual = null; try { const g = await mc(`/v2/scheduler/posts/${it.id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN); atual = g?.data || g?.post || g; if (!atual?.providers) atual = null; } catch (_) {}
      const fonte = atual || it._p;
      const corpo = it._novo ? _corpoPostMc(fonte, { text: it._novo, shortener: false })
        : _corpoPostMc(fonte, { text: trocar(fonte.text, it.redes[0]).texto, ...(fonte.firstCommentText ? { firstCommentText: trocar(fonte.firstCommentText, it.redes[0]).texto } : {}), shortener: false });
      // v3.80: SEM PUT — a edição do Metricool gerava cópias (a cada rodada o post duplicava). Agora recria com o
      // texto novo e só considera feito se o antigo foi realmente apagado; se não apagou, desfaz (apaga o novo).
      const novoId = await _recriarSemDuplicar(it.id, corpo, { USERID, BLOGID, TOKEN });
      feitos.push({ id_antigo: it.id, id_novo: novoId, metodo: 'recriado', data: it.data, redes: it.redes, trocas: it.trocas });
    } catch (e) { falhas.push({ id: it.id, data: it.data, erro: e.message.substring(0, 200) }); }
  }
  return { trocados: feitos.length, feitos, falhas };
}

async function auditoriaFunil({ dias = 30 } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = process.env.METRICOOL_BLOG_ID;
  const out = { periodo_dias: dias, posts: {}, leads: {}, problemas: [], recomendacoes: [], por_rede: {} };

  // 1. Posts no Metricool: agendados, publicados, com erro
  try {
    const hoje = new Date(), ini = new Date(hoje.getTime() - dias * 86400000);
    const f = d => d.toISOString().substring(0, 10);
    const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${f(ini)}T00:00:00&end=${f(hoje)}T23:59:59&timezone=America/Sao_Paulo`, TOKEN);
    const lista = Array.isArray(r) ? r : (r?.data || r?.posts || []);
    const status = { publicado: 0, agendado: 0, erro: 0, rascunho: 0, outro: 0 };
    const comErro = [], semLink = [], comLink = [];
    lista.forEach(p => {
      const st = String(p.status || p.publishStatus || (p.draft ? 'draft' : '') || '').toLowerCase();
      const providers = p.providers || [];
      const errProv = providers.filter(x => /error|fail|reject/i.test(String(x.status || x.publishStatus || '')));
      if (errProv.length || /error|fail/.test(st)) {
        status.erro++;
        comErro.push({ id: p.id, data: String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0,16),
          texto: String(p.text || '').substring(0, 60), redes: errProv.map(x => x.network),
          motivo: _motivoErroMc(p, errProv), categoria: _categoriaErroMc(_motivoErroMc(p, errProv)), midias: (p.media || p.medias || []).length });
      } else if (p.published === true || /publish|sent|done/.test(st) || providers.some(x => /PUBLISHED|SUCCESS/i.test(String(x.status || x.publishStatus || '')))
        || (!/draft|schedul|pending|queue/.test(st) && !p.draft && new Date(String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 19) + '-03:00') < new Date())) status.publicado++; // v3.74: status vem por rede; antes tudo virava "agendado"
      else if (/draft/.test(st) || p.draft) status.rascunho++;
      else status.agendado++;
      const txt = String(p.text || '') + ' ' + String(p.firstCommentText || p.firstComment || '');
      // v3.74: link sem "https://" (o link curto do Instagram, encurtadores) também conta; Story leva o link no adesivo
      const ehStory = providers.some(x => x?.data?.postType === 'STORY');
      const temLink = ehStory ? !!(providers.find(x => x?.data?.linkSticker) || p.instagramData?.link) : /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:app|com|com\.br|cool|ly|io|me|link)\/[^\s]*)/i.test(txt);
      const tipoLink = /captura\.html|\/agenda\b/i.test(txt) ? 'captura' : /meetings\.hubspot\.com|\/reuniao\b/i.test(txt) ? 'agenda_direto' : temLink ? 'outro' : 'sem_link';
      out.tipos_link = out.tipos_link || { captura: 0, agenda_direto: 0, outro: 0, sem_link: 0, stories: 0 }; if (ehStory) out.tipos_link.stories++; else out.tipos_link[tipoLink]++;
      if (temLink || ehStory) comLink.push(p.id); else semLink.push(p.id);
      // v3.13: funil por rede — publicações e se levam link (no texto ou no 1º comentário)
      const publicado = !errProv.length && !/error|fail|draft/.test(st);
      providers.forEach(pv => { const rd = String(pv.network || '').toLowerCase(); if (!rd) return;
        out.por_rede[rd] = out.por_rede[rd] || { posts: 0, com_link: 0, link_so_no_comentario: 0 };
        if (publicado) { out.por_rede[rd].posts++; if (temLink) out.por_rede[rd].com_link++; if (tipoLink === 'captura') out.por_rede[rd].com_captura = (out.por_rede[rd].com_captura || 0) + 1; if (tipoLink === 'agenda_direto') out.por_rede[rd].agenda_direto = (out.por_rede[rd].agenda_direto || 0) + 1;
          if (!/https?:\/\//i.test(String(p.text || '')) && /https?:\/\//i.test(String(p.firstCommentText || p.firstComment || ''))) out.por_rede[rd].link_so_no_comentario++; } });
    });
    out.posts = { total: lista.length, ...status, com_link: comLink.length, sem_link: semLink.length, erros: comErro.slice(0, 40), erros_por_categoria: comErro.reduce((a, e) => { a[e.categoria] = (a[e.categoria] || 0) + 1; return a; }, {}) };
    if (comErro.length) out.problemas.push({ g: 'alta', txt: `${comErro.length} publicação(ões) FALHARAM no Metricool nos últimos ${dias} dias.` });
    // v3.77: o que JÁ SAIU vira histórico (informativo) — não dá para mudar post publicado; problema é só o que ainda vai sair
    out.historico = { publicados: status.publicado, sem_link: semLink.length, com_link: comLink.length, agenda_direto: out.tipos_link?.agenda_direto || 0, captura: out.tipos_link?.captura || 0 };
    if (!lista.length) out.problemas.push({ g: 'alta', txt: `Nenhum post encontrado no Metricool nos últimos ${dias} dias.` });
  } catch (e) { out.posts = { erro: e.message }; out.problemas.push({ g: 'alta', txt: 'Não consegui ler o Metricool: ' + e.message }); }

  // v3.75: PRÓXIMOS agendados — confere se o que ainda vai sair já leva para a página de captura
  try {
    const ag = new Date(), fimP = new Date(Date.now() + 30 * 864e5), fP = d => d.toISOString().substring(0, 10);
    const rP = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${fP(ag)}T00:00:00&end=${fP(fimP)}T23:59:59&timezone=America/Sao_Paulo`, TOKEN);
    const fut = (Array.isArray(rP) ? rP : (rP?.data || [])).filter(p => new Date(String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 19) + '-03:00') > ag && !p.published);
    const prox = { total: fut.length, captura: 0, agenda_direto: 0, sem_link: 0, stories: 0, outro: 0, por_rede: {} };
    fut.forEach(p => { const provs = p.providers || []; const story = provs.some(x => x?.data?.postType === 'STORY'); const txt = String(p.text || '') + ' ' + String(p.firstCommentText || '');
      const tipo = story ? 'stories' : /captura\.html|\/agenda\b/i.test(txt) ? 'captura' : /meetings\.hubspot\.com|\/reuniao\b/i.test(txt) ? 'agenda_direto' : /(https?:\/\/|\b[a-z0-9-]+\.(?:app|com|cool|ly|io)\/)/i.test(txt) ? 'outro' : 'sem_link';
      if (tipo === 'sem_link') (prox.sem_link_lista = prox.sem_link_lista || []).push({ id: p.id, data: String(p.publicationDate?.dateTime || p.publicationDate || '').substring(0, 16), redes: provs.map(x => String(x.network || '').toLowerCase()),
        tipo: provs.some(x => x?.data?.postType === 'REEL') ? 'reel' : (p.media || p.medias || []).length > 1 ? 'carrossel' : 'post', texto: String(p.text || '').substring(0, 80) });
      prox[tipo]++; provs.forEach(x => { const rd = String(x.network || '').toLowerCase(); const o = prox.por_rede[rd] = prox.por_rede[rd] || { total: 0, captura: 0, agenda_direto: 0, sem_link: 0 }; o.total++; if (o[tipo] != null) o[tipo]++; }); });
    out.proximos = prox;
    if (prox.agenda_direto) out.problemas.push({ g: 'alta', txt: `${prox.agenda_direto} post(s) AGENDADOS ainda levam direto para a agenda — rode "Trocar link dos já agendados".` });
    if (prox.sem_link) out.problemas.push({ g: 'media', txt: `${prox.sem_link} post(s) AGENDADOS não têm link nenhum — quem se interessar não tem para onde clicar. Veja a lista na caixa "Próximos posts" e use "Adicionar link".` });
  } catch (e) { out.proximos = { erro: e.message }; }

  // 2. Leads capturados no período
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const ini = new Date(Date.now() - dias * 86400000).toISOString();
    const leads = await sql`SELECT COUNT(*)::int AS n, MAX(criado_em) AS ultimo FROM leads WHERE criado_em >= ${ini}`;
    const total = await sql`SELECT COUNT(*)::int AS n, MAX(criado_em) AS ultimo FROM leads`;
    // v3.13: a origem fica na coluna "origem" (utm_source); data->>'source' ficava quase sempre vazio
    const porOrigem = await sql`SELECT LOWER(COALESCE(NULLIF(origem, ''), data->'utm'->>'source', data->>'source', 'sem origem')) AS origem, COUNT(*)::int AS n
      FROM leads WHERE criado_em >= ${ini} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`.catch(async () => sql`SELECT COALESCE(data->>'source', 'sem origem') AS origem, COUNT(*)::int AS n FROM leads WHERE criado_em >= ${ini} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`);
    let visitas = [];
    try { visitas = await sql`SELECT LOWER(COALESCE(origem, 'direto')) AS origem, COUNT(*)::int AS n FROM captura_visitas WHERE criado_em >= ${ini} GROUP BY 1`; out.visitas_medidas = true; }
    catch (_) { out.visitas_medidas = false; }
    out.visitas = Object.fromEntries(visitas.map(v => [v.origem, v.n]));
    out.leads = { no_periodo: leads[0]?.n || 0, ultimo_no_periodo: leads[0]?.ultimo ? String(leads[0].ultimo).substring(0,10) : null,
      total_historico: total[0]?.n || 0, ultimo_historico: total[0]?.ultimo ? String(total[0].ultimo).substring(0,10) : null,
      por_origem: porOrigem.map(o => ({ origem: o.origem, n: o.n })) };
    if (!out.leads.no_periodo) out.problemas.push({ g: 'alta', txt: `ZERO leads capturados nos últimos ${dias} dias${out.leads.total_historico ? ` (${out.leads.total_historico} no histórico, último em ${out.leads.ultimo_historico})` : ' — e nenhum no histórico'}.` });
  } catch (e) { out.leads = { erro: e.message }; }

  // 3. A página de captura existe e responde?
  const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
  out.captura = { endpoint: base + '/api/lead-capture', pagina_sugerida: base + '/captura.html',
    link_bio_instagram: base + '/captura.html?utm_source=instagram&utm_medium=bio' };
  out.recomendacoes = out.recomendacoes || [];
  out.recomendacoes.unshift('Instagram: link no post NÃO é clicável. Use o link curto (/agenda) escrito na legenda e na arte, ou "Comente AGENDA" com Direct automático — configure em Autocampanha → "No Instagram". Para clique de 1 toque, impulsione o post com botão "Agendar".');
  try {
    const r = await fetch(base + '/api/lead-capture', { method: 'OPTIONS' });
    out.captura.endpoint_responde = r.status < 500;
  } catch (e) { out.captura.endpoint_responde = false; }
  try {
    const r2 = await fetch(base + '/captura.html', { method: 'HEAD' });
    out.captura.pagina_existe = r2.status === 200;
    if (r2.status !== 200) out.problemas.push({ g: 'alta', txt: 'Não existe uma página pública de captura de lead. Mesmo com link no post, o clique não teria onde cair.' });
  } catch (e) { out.captura.pagina_existe = false; }

  // 3b. v3.13: métricas do Metricool por rede + gargalo de cada rede
  const hoje2 = new Date().toISOString().substring(0, 10), ini2 = new Date(Date.now() - dias * 86400000).toISOString().substring(0, 10);
  const leadsOrig = Object.fromEntries((out.leads.por_origem || []).map(o => [o.origem, o.n]));
  out.funil_por_rede = {};
  for (const rede of ['linkedin', 'instagram', 'facebook']) {
    const pr = out.por_rede[rede] || { posts: 0, com_link: 0, link_so_no_comentario: 0 };
    let m = null; try { m = await _postsMetricasRede(rede, ini2, hoje2, { TOKEN, USERID, BLOGID }); } catch (e) { m = { api_ok: false, tentativas: [{ erro: e.message }], totais: {} }; }
    const imp = m.totais?.impressoes || 0, cli = m.totais?.cliques || 0;
    const vis = out.visitas?.[rede] || 0, lds = leadsOrig[rede] || 0;
    let gargalo, acao;
    if (!pr.posts && !(m.totais?.posts)) { gargalo = 'Nenhuma publicação no período'; acao = 'Agendar a autocampanha desta rede.'; }
    else if (pr.posts && !pr.com_link) { gargalo = 'Posts sem link de captura'; acao = rede === 'instagram' ? 'Colocar o link de captura na BIO do perfil e usar stories com link — link na legenda não é clicável.' : 'Incluir o link de captura com UTM (no texto ou no 1º comentário).'; }
    else if (!m.api_ok) { gargalo = 'Métricas indisponíveis — o Metricool recusou a consulta de analytics'; acao = 'Conferir no Metricool se o plano inclui API/analytics e se a rede está conectada ao mesmo perfil (blogId) usado pelo sistema.'; }
    else if (!imp) { gargalo = 'Sem impressões registradas'; acao = rede === 'linkedin' ? 'Confirmar que a página da empresa (não o perfil pessoal) está conectada no Metricool com permissão de estatísticas.' : 'Converter o perfil para conta Business/Creator e reconectar no Metricool aceitando as permissões de estatísticas.'; }
    else if (!cli && !vis) { gargalo = 'Há alcance, mas ninguém clica'; acao = 'Oferta mais concreta e chamada direta (diagnóstico gratuito, checklist) com o link visível; testar horários com mais alcance.'; }
    else if (cli && !vis && out.visitas_medidas) { gargalo = 'Cliques não chegam à página de captura'; acao = 'O link publicado não aponta para a página de captura com UTM desta rede — revisar o link do post/comentário/bio.'; }
    else if (vis && !lds) { gargalo = 'Visitam a página, mas não preenchem'; acao = 'Encurtar o formulário, reforçar a oferta no topo da página e oferecer o WhatsApp como alternativa.'; }
    else { gargalo = lds ? 'Funil gerando leads' : 'Poucos dados para concluir'; acao = lds ? 'Escalar o que funciona: repetir os ângulos e horários dos posts que trouxeram lead.' : 'Aguardar mais publicações/medições.'; }
    out.funil_por_rede[rede] = { publicacoes: pr.posts || m.totais?.posts || 0, com_link: pr.com_link, link_so_no_comentario: pr.link_so_no_comentario,
      impressoes: imp, cliques: cli, visitas: out.visitas_medidas ? vis : null, leads: lds, metricas_api: m.api_ok, fonte_metricas: m.fonte || null,
      erros_api: (m.tentativas || []).filter(t => !t.ok).map(t => (t.fonte ? t.fonte + ': ' : '') + t.erro), gargalo, acao };
  }
  if (!out.visitas_medidas) out.problemas.push({ g: 'media', txt: 'As visitas à página de captura começam a ser medidas a partir de agora (v3.13) — em alguns dias o funil mostra onde o clique se perde.' });

  // 4. Recomendações
  out.recomendacoes = [
    'Todo post precisa de UM caminho claro: link para a página de captura, com UTM para saber de onde veio o clique.',
    'No LinkedIn, link no corpo reduz alcance. Alternativa: "link nos comentários" — e o sistema publica o link como primeiro comentário.',
    'A página de captura precisa ser curta: nome, empresa, cargo, e-mail. Cada campo a mais derruba a conversão.',
    'Posts de opinião geram engajamento, não lead. Para lead, o post precisa oferecer algo (diagnóstico, checklist, conversa) em troca do contato.',
  ];
  out.veredito = out.problemas.some(p => p.g === 'alta') ? 'funil quebrado' : out.problemas.length ? 'funil com vazamento' : 'funil íntegro';
  return out;
}

// ═══ v2.31: STORIES DO INSTAGRAM COM LINK ═══
// A imagem (1080×1920) é montada no navegador com a oferta, a URL e um QR code, salva em /api/media
// (URL permanente) e agendada aqui como STORY. O sticker de link é adicionado no app ao publicar —
// a API do Instagram não aceita sticker via automação. O QR garante o caminho mesmo sem o sticker.
async function storyTexto({ tema, oferta } = {}) {
  const system = `Você escreve o texto de um STORY de Instagram para a Atlantyx (dados e IA para grandes empresas).
${ICP_TEXTO}
REGRAS: título de até 6 palavras que para o dedo; uma frase de apoio de até 14 palavras; uma chamada de até 5 palavras
apontando para o link (ex.: "Toque no link", "Arraste para cima"). Sem hashtag, sem emoji além de 1. Português do Brasil.
Escreva também, EM INGLÊS, uma cena fotográfica VERTICAL e concreta do mundo corporativo real (sala de controle de energia, data center, subestação, turbinas, dashboards), sem animais, sem pessoas em close, sem texto.
Devolva SOMENTE JSON: {"titulo":"...","apoio":"...","chamada":"...","oferta":"o que ganha ao clicar, até 8 palavras","imagem":"vertical scene in English, 20-35 words"}`;
  const user = `Tema: ${tema || 'dados e IA aplicada'}${oferta ? '\nOferta: ' + oferta : ''}`;
  const txt = await _claudeAuto(system, user, 400);
  return JSON.parse(String(txt).replace(/```json|```/g, '').trim());
}
async function storyAgendar({ imagem_url, quando, texto, link, blog_id } = {}) {
  // v2.76: Story pela ação "publicar" do S2 — sem texto (Metricool recusa), tipo dentro do provider
  if (!imagem_url) throw new Error('imagem_url obrigatória');
  const d = await _publicarViaS2({ tipo: 'STORY', redes: ['instagram'], imagem_url, data_hora: String(quando).substring(0, 19), link_sticker: link || '', ...(blog_id ? { blog_id } : {}) }); // v3.46: marca escolhida
  return { agendado: true, metricool_id: d.metricool_id || null, quando,
    aviso: 'Story agendado. O sticker de link pode não ser aplicado pela API — confira no app ao publicar. O link também está escrito na imagem.', link };
}
async function _storyAgendarANTIGO({ imagem_url, quando, texto, link, blog_id } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID;
  const BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  if (!TOKEN || !USERID || !BLOGID) throw new Error('Credenciais do Metricool ausentes');
  if (!imagem_url) throw new Error('imagem_url obrigatória');
  const body = {
    text: texto || '',
    providers: [{ network: 'INSTAGRAM' }],
    media: [imagem_url], medias: [imagem_url],
    publicationDate: { dateTime: quando, timezone: 'America/Sao_Paulo' },
    autoPublish: true, shortener: false, draft: false,
    instagramData: { type: 'STORY', link },
    postType: 'STORY',
  };
  const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'POST', body);
  return { agendado: true, metricool_id: r?.id || r?.data?.id || null, quando,
    aviso: 'Ao publicar, adicione o sticker de LINK no app do Instagram com a URL abaixo — a API não faz isso sozinha. O QR na imagem já funciona.', link };
}

// v2.69: conexão com o banco — a fila usava getSql() sem ele existir neste módulo
let _sqlMc = null;
async function getSql() {
  if (_sqlMc) return _sqlMc;
  const { neon } = await import('@neondatabase/serverless');
  _sqlMc = neon(process.env.DATABASE_URL);
  return _sqlMc;
}

// ═══ v2.68: FILA DA AUTOCAMPANHA — processada em segundo plano, um passo por vez ═══
// O navegador enfileira os slots e acompanha. Um cron (a cada minuto) e um "cutucão" da tela
// executam UM passo por chamada: texto → imagem → agendar. Cada passo cabe no limite de tempo,
// e se um falhar, tenta de novo até 3 vezes. Sem requisições longas no navegador → sem "Failed to fetch".
async function _filaTabela() {
  const sql = await getSql();
  await sql`CREATE TABLE IF NOT EXISTS autocampanha_fila (
    id TEXT PRIMARY KEY, lote TEXT, data TEXT, hora TEXT, dia_semana TEXT, tema TEXT, redes JSONB, blog_id TEXT,
    apenas_rascunho BOOLEAN DEFAULT true, com_imagem BOOLEAN DEFAULT true,
    etapa TEXT DEFAULT 'texto', status TEXT DEFAULT 'pendente', tentativas INT DEFAULT 0,
    texto TEXT, angulo TEXT, oferta TEXT, link TEXT, comentario TEXT, link_instagram TEXT, link_bio TEXT,
    imagem_url TEXT, metricool_id TEXT, erro TEXT, criado_em TIMESTAMPTZ DEFAULT NOW(), atualizado_em TIMESTAMPTZ DEFAULT NOW())`;
  try { await sql`ALTER TABLE autocampanha_fila ADD COLUMN IF NOT EXISTS imagem_prompt TEXT`; } catch (_) {}
  try { await sql`ALTER TABLE autocampanha_fila ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'post'`; } catch (_) {}
  try { await sql`ALTER TABLE autocampanha_fila ADD COLUMN IF NOT EXISTS story_json TEXT`; } catch (_) {}
  return sql;
}
async function filaEnfileirar({ slots = [], tema, redes, blog_id, apenas_rascunho = true, com_imagem = true, stories = false, story_hora = '10:00' } = {}) {
  if (!slots.length) throw new Error('nenhum slot');
  const sql = await _filaTabela();
  const lote = 'lt_' + Date.now().toString(36);
  // v3.300: horário que já passou (São Paulo) não entra na fila — o Metricool recusava e a fila tentava 3 vezes
  const agoraSP = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(Date.now() + 15 * 60000)).replace(' ', 'T');
  const futuro = (d, h) => `${d}T${String(h || '00:00').padStart(5, '0')}` > agoraSP;
  slots = slots.filter(x => futuro(x.data, x.hora)); if (!slots.length) throw new Error('Todos os horários escolhidos já passaram — escolha datas/horários futuros');
  // v2.73: um STORY do Instagram por dia do plano
  if (stories) {
    const dias = [...new Set(slots.map(s => s.data))];
    for (const d of dias) { if (!futuro(d, story_hora)) continue;
      const id = `${lote}_story_${d}`;
      await sql`INSERT INTO autocampanha_fila (id, lote, data, hora, tema, redes, blog_id, apenas_rascunho, com_imagem)
        VALUES (${id}, ${lote}, ${d}, ${story_hora}, ${tema || null}, ${JSON.stringify(['instagram'])}, ${blog_id || null}, ${!!apenas_rascunho}, true) ON CONFLICT (id) DO NOTHING`;
      try { await sql`UPDATE autocampanha_fila SET tipo = 'story' WHERE id = ${id}`; } catch (_) {}
    }
  }
  for (const s of slots) {
    const id = `${lote}_${s.data}_${String(s.hora).replace(':', '')}`;
    await sql`INSERT INTO autocampanha_fila (id, lote, data, hora, dia_semana, tema, redes, blog_id, apenas_rascunho, com_imagem)
      VALUES (${id}, ${lote}, ${s.data}, ${s.hora}, ${s.dia_semana || null}, ${tema || null}, ${JSON.stringify(redes || ['linkedin'])}, ${blog_id || null}, ${!!apenas_rascunho}, ${!!com_imagem})
      ON CONFLICT (id) DO NOTHING`;
  }
  return { lote, enfileirados: slots.length, stories: stories ? [...new Set(slots.map(s => s.data))].length : 0 };
}
async function filaStatus({ lote, todos = false } = {}) {
  const sql = await _filaTabela();
  // v2.77: sem lote informado, mostra só a ÚLTIMA geração (antes somava tudo dos últimos 2 dias)
  let loteEf = lote;
  if (!loteEf && !todos) { const u = await sql`SELECT lote FROM autocampanha_fila ORDER BY criado_em DESC LIMIT 1`; loteEf = u[0]?.lote || null; }
  const rows = loteEf ? await sql`SELECT * FROM autocampanha_fila WHERE lote = ${loteEf} ORDER BY data, hora`
    : await sql`SELECT * FROM autocampanha_fila WHERE criado_em >= NOW() - INTERVAL '7 days' ORDER BY criado_em DESC, data, hora LIMIT 120`;
  const outros = await sql`SELECT COUNT(*)::int AS n FROM autocampanha_fila WHERE lote IS DISTINCT FROM ${loteEf || ''}`;
  const resumo = { total: rows.length, pendentes: rows.filter(r => r.status === 'pendente').length, prontos: rows.filter(r => r.status === 'pronto').length,
    falhas: rows.filter(r => r.status === 'falhou').length, processando: rows.filter(r => r.status === 'processando').length };
  return { lote: loteEf, itens: rows, resumo, concluido: resumo.pendentes === 0 && resumo.processando === 0, itens_de_outras_geracoes: outros[0]?.n || 0 };
}
// Executa UM passo de UM item. Chamado pelo cron e pelo "cutucão" da tela.
async function filaProcessar({ lote } = {}) {
  const sql = await _filaTabela();
  // libera itens travados há mais de 3 min (função cortada no meio)
  // v3.46: se travou NO AGENDAMENTO, o post pode já ter ido ao Metricool — não reenvia sozinho (evita post duplicado)
  await sql`UPDATE autocampanha_fila SET status = 'falhou', erro = 'interrompido durante o agendamento — confira no Metricool se o post foi criado antes de reenviar', atualizado_em = NOW()
    WHERE status = 'processando' AND etapa = 'agendar' AND atualizado_em < NOW() - INTERVAL '3 minutes'`;
  await sql`UPDATE autocampanha_fila SET status = 'pendente' WHERE status = 'processando' AND etapa <> 'agendar' AND atualizado_em < NOW() - INTERVAL '3 minutes'`;
  // v3.46: pega o item de forma ATÔMICA — o cron (1/min) e a tela (a cada 2s) disputavam o mesmo item e
  // o mesmo post podia ser agendado duas vezes no Metricool
  const cand = lote
    ? await sql`UPDATE autocampanha_fila SET status = 'processando', atualizado_em = NOW() WHERE id = (SELECT id FROM autocampanha_fila WHERE lote = ${lote} AND status = 'pendente' ORDER BY data, hora LIMIT 1 FOR UPDATE SKIP LOCKED) AND status = 'pendente' RETURNING *`
    : await sql`UPDATE autocampanha_fila SET status = 'processando', atualizado_em = NOW() WHERE id = (SELECT id FROM autocampanha_fila WHERE status = 'pendente' ORDER BY criado_em DESC, data, hora LIMIT 1 FOR UPDATE SKIP LOCKED) AND status = 'pendente' RETURNING *`;   // v2.77: mais recente primeiro
  const it = cand[0];
  if (!it) return { ocioso: true };
  if (it.etapa === 'agendar' && it.metricool_id) { await sql`UPDATE autocampanha_fila SET etapa = 'fim', status = 'pronto', atualizado_em = NOW() WHERE id = ${it.id}`; return { id: it.id, ok: true, ja_agendado: true }; }
  const falhar = async (msg) => {
    const t = (it.tentativas || 0) + 1;
    // v2.76: imagem falhou de vez → segue sem imagem (texto não se perde; Instagram é pulado no agendar)
    if (it.etapa === 'imagem' && t >= 3 && it.tipo !== 'story') {
      const prox = it.apenas_rascunho ? 'fim' : 'agendar';
      await sql`UPDATE autocampanha_fila SET etapa = ${prox}, status = ${prox === 'fim' ? 'pronto' : 'pendente'}, tentativas = 0, erro = ${'sem imagem: ' + String(msg).substring(0, 200)}, atualizado_em = NOW() WHERE id = ${it.id}`;
      return { id: it.id, etapa: 'imagem', erro: msg, seguiu_sem_imagem: true };
    }
    // v3.300: falha NA ETAPA DE AGENDAR não é repetida sozinha — o Metricool pode ter criado o post antes do erro (até 3 cópias)
    const agendarFinal = it.etapa === 'agendar';
    await sql`UPDATE autocampanha_fila SET status = ${t >= 3 || agendarFinal ? 'falhou' : 'pendente'}, tentativas = ${t}, erro = ${(agendarFinal ? 'agendamento falhou — confira no Metricool antes de reenviar: ' : '') + String(msg).substring(0, 260)}, atualizado_em = NOW() WHERE id = ${it.id}`;
    return { id: it.id, etapa: it.etapa, erro: msg, tentativa: t, desistiu: t >= 3 || it.etapa === 'agendar' };
  };
  const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
  const NEG = 'animal, monkey, ape, dog, cat, bird, cartoon, anime, illustration, character, mascot, toy, childish, fantasy, text, letters, words, watermark, logo, close-up face, distorted, blurry, low quality';
  // v2.73: STORY — texto curto + fundo vertical 9:16 + composição com título/oferta/link (JPEG)
  if (it.tipo === 'story') {
    try {
      if (it.etapa === 'texto') {
        const t = await storyTexto({ tema: it.tema });
        const link = `${base}/captura.html?utm_source=instagram&utm_medium=stories&utm_campaign=${it.data}`;
        await sql`UPDATE autocampanha_fila SET story_json = ${JSON.stringify({ ...t, link })}, texto = ${(t.titulo || '') + ' — ' + (t.apoio || '')},
          angulo = ${t.oferta || null}, link = ${link}, etapa = 'imagem', status = 'pendente', erro = NULL, atualizado_em = NOW() WHERE id = ${it.id}`;
        try { await sql`UPDATE autocampanha_fila SET imagem_prompt = ${t.imagem || null} WHERE id = ${it.id}`; } catch (_) {}
        return { id: it.id, etapa: 'texto', ok: true, proxima: 'imagem', tipo: 'story' };
      }
      if (it.etapa === 'imagem') {
        const st = JSON.parse(it.story_json || '{}');
        const cena = it.imagem_prompt || 'Vertical photograph of a modern energy utility control room with large grid monitoring dashboards, operators seen from behind, dusk light';
        const r = await fetch(base + '/api/image-gen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: cena + ' Photorealistic corporate photography, dark tones at the bottom.', formato: 'ASPECT_9_16', estilo: 'REALISTIC', quantidade: 1, magic_prompt: false, estilo_padrao: false, negativo: NEG }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success || !d.imagens?.length) throw new Error(d.error || 'image-gen HTTP ' + r.status);
        const comp = await fetch(base + '/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'story_compor', payload: { url: d.imagens[0].url || d.imagens[0], titulo: st.titulo, apoio: st.apoio, oferta: st.oferta, chamada: st.chamada || 'Agende sua conversa', link: st.link } }) }).then(x => x.json());
        if (!comp.success || !comp.url) throw new Error(comp.error || 'falha ao compor o story');
        const prox = it.apenas_rascunho ? 'fim' : 'agendar';
        await sql`UPDATE autocampanha_fila SET imagem_url = ${comp.url}, etapa = ${prox}, status = ${prox === 'fim' ? 'pronto' : 'pendente'}, erro = NULL, atualizado_em = NOW() WHERE id = ${it.id}`;
        return { id: it.id, etapa: 'imagem', ok: true, tipo: 'story' };
      }
      if (it.etapa === 'agendar') {
        const a = await storyAgendar({ imagem_url: it.imagem_url, quando: `${it.data}T${it.hora}:00`, texto: it.texto, link: it.link, blog_id: it.blog_id });
        await sql`UPDATE autocampanha_fila SET metricool_id = ${a.metricool_id || null}, etapa = 'fim', status = 'pronto', erro = NULL, atualizado_em = NOW() WHERE id = ${it.id}`;
        return { id: it.id, etapa: 'agendar', ok: true, tipo: 'story' };
      }
      await sql`UPDATE autocampanha_fila SET status = 'pronto' WHERE id = ${it.id}`; return { id: it.id, ok: true };
    } catch (e) { return await falhar(e.message); }
  }
  try {
    if (it.etapa === 'texto') {
      const r = await autoCampanhaExecutar({ tema: it.tema, redes: it.redes, blog_id: it.blog_id, apenas_rascunho: true,
        slots: [{ data: it.data, hora: it.hora, dia_semana: it.dia_semana }] });
      const p = (r.posts || [])[0];
      if (!p || !p.texto) throw new Error((r.erros || [])[0] || r.aviso || 'sem texto');
      const prox = it.com_imagem ? 'imagem' : (it.apenas_rascunho ? 'fim' : 'agendar');
      try { await sql`UPDATE autocampanha_fila SET imagem_prompt = ${p.imagem_prompt || null} WHERE id = ${it.id}`; } catch (_) {}
      await sql`UPDATE autocampanha_fila SET texto = ${p.texto}, angulo = ${p.angulo || null}, oferta = ${p.oferta || null}, link = ${p.link || null},
        comentario = ${p.comentario || null}, link_instagram = ${p.link_instagram || null}, link_bio = ${p.link_bio || null},
        etapa = ${prox}, status = ${prox === 'fim' ? 'pronto' : 'pendente'}, erro = NULL, atualizado_em = NOW() WHERE id = ${it.id}`;
      return { id: it.id, etapa: 'texto', ok: true, proxima: prox };
    }
    if (it.etapa === 'imagem') {
      const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
      // v2.72: a cena vem do próprio post (escrita pela IA junto com o texto). Sem ela, deriva do
      // texto do post — nunca mais só do "ângulo" em 3 palavras, que deixava o Ideogram inventar.
      const cena = it.imagem_prompt || `Professional corporate photograph illustrating: ${String(it.texto || '').replace(/\s+/g, ' ').substring(0, 220)}. Setting: energy utility control room or modern data center with dashboards.`;
      const prompt = `${cena} Photorealistic corporate photography, B2B technology consulting, natural light, shallow depth of field, navy blue and gold color accents.`;
      const r = await fetch(base + '/api/image-gen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, formato: 'ASPECT_1_1', estilo: 'REALISTIC', quantidade: 1,
          magic_prompt: false, estilo_padrao: false,   // o "magic prompt" reescrevia o pedido e gerava coisas fora de contexto (animais etc.)
          negativo: 'animal, monkey, ape, dog, cat, bird, cartoon, anime, illustration, character, mascot, toy, childish, fantasy, text, letters, words, watermark, logo, close-up face, distorted, blurry, low quality' }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success || !d.imagens?.length) {
        const msg = String(d.error || 'image-gen HTTP ' + r.status);
        // chave inválida não adianta tentar de novo: marca para não repetir 3 vezes
        if (/401|Access denied|API Token/i.test(msg)) {
          // chave recusada: tentar de novo não resolve — o post segue SEM imagem na hora
          const prox = it.apenas_rascunho ? 'fim' : 'agendar';
          await sql`UPDATE autocampanha_fila SET etapa = ${prox}, status = ${prox === 'fim' ? 'pronto' : 'pendente'}, tentativas = 0,
            erro = ${'sem imagem — gerador sem acesso (chave do Ideogram recusada): ' + msg.substring(0, 140)}, atualizado_em = NOW() WHERE id = ${it.id}`;
          return { id: it.id, etapa: 'imagem', seguiu_sem_imagem: true, erro: msg };
        }
        throw new Error(msg);
      }
      let url = d.imagens[0].url || d.imagens[0];
      try { const m = await fetch(base + '/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'salvar_de_url', payload: { url, origem: 'autocampanha', jpeg: true } }) }).then(x => x.json()); if (m.success && m.url) url = m.url; } catch (_) {}
      const prox = it.apenas_rascunho ? 'fim' : 'agendar';
      await sql`UPDATE autocampanha_fila SET imagem_url = ${url}, etapa = ${prox}, status = ${prox === 'fim' ? 'pronto' : 'pendente'}, erro = NULL, atualizado_em = NOW() WHERE id = ${it.id}`;
      return { id: it.id, etapa: 'imagem', ok: true, proxima: prox };
    }
    if (it.etapa === 'agendar') {
      const a = await autoCampanhaAgendarUm({ post: { texto: it.texto, data: it.data, hora: it.hora, comentario: it.comentario, imagem_url: it.imagem_url }, blog_id: it.blog_id, redes: it.redes });
      await sql`UPDATE autocampanha_fila SET metricool_id = ${a.metricool_id || null}, etapa = 'fim', status = 'pronto', erro = NULL, atualizado_em = NOW() WHERE id = ${it.id}`;
      return { id: it.id, etapa: 'agendar', ok: true };
    }
    await sql`UPDATE autocampanha_fila SET status = 'pronto', atualizado_em = NOW() WHERE id = ${it.id}`;
    return { id: it.id, ok: true };
  } catch (e) { if (e.metricool_id) { try { await sql`UPDATE autocampanha_fila SET metricool_id = ${e.metricool_id} WHERE id = ${it.id}`; } catch (_) {} } return await falhar(e.message); }
}
// v2.70: agenda os RASCUNHOS já prontos — sem reescrever texto nem regerar imagem.
// Muda os itens prontos e não agendados para a etapa "agendar"; a fila faz o resto.
async function filaAgendarRascunhos({ lote, ids } = {}) {
  const sql = await _filaTabela();
  const alvo = Array.isArray(ids) && ids.length
    ? await sql`SELECT id FROM autocampanha_fila WHERE id = ANY(${ids}) AND status = 'pronto' AND metricool_id IS NULL AND texto IS NOT NULL`
    : lote
      ? await sql`SELECT id FROM autocampanha_fila WHERE lote = ${lote} AND status = 'pronto' AND metricool_id IS NULL AND texto IS NOT NULL`
      : await sql`SELECT id FROM autocampanha_fila WHERE status = 'pronto' AND metricool_id IS NULL AND texto IS NOT NULL AND criado_em >= NOW() - INTERVAL '7 days'`;
  const lista = alvo.map(a => a.id);
  if (!lista.length) return { agendando: 0, aviso: 'Nenhum rascunho pronto para agendar.' };
  // horário no passado não pode ser agendado — avisa e pula
  const passados = await sql`SELECT id, data, hora FROM autocampanha_fila WHERE id = ANY(${lista}) AND (data || ' ' || hora) < TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')`;
  const idsPassados = new Set(passados.map(p => p.id));
  const validos = lista.filter(id => !idsPassados.has(id));
  if (validos.length) await sql`UPDATE autocampanha_fila SET apenas_rascunho = false, etapa = 'agendar', status = 'pendente', tentativas = 0, erro = NULL, atualizado_em = NOW() WHERE id = ANY(${validos})`;
  const lotes = await sql`SELECT DISTINCT lote FROM autocampanha_fila WHERE id = ANY(${lista})`;
  return { agendando: validos.length, pulados_horario_passado: passados.map(p => `${p.data} ${p.hora}`), lotes: lotes.map(l => l.lote) };
}

async function filaLimpar({ lote, modo } = {}) {
  const sql = await _filaTabela();
  // v2.77: "nao_agendados" = tudo que NÃO foi para o Metricool (rascunhos, falhas e pendentes — que
  // senão continuariam sendo processados pelo cron, gastando IA e imagens). Os já agendados ficam.
  if (modo === 'nao_agendados') {
    const r = await sql`DELETE FROM autocampanha_fila WHERE metricool_id IS NULL RETURNING id`;
    return { ok: true, removidos: r.length };
  }
  if (modo === 'tudo') { const r = await sql`DELETE FROM autocampanha_fila RETURNING id`; return { ok: true, removidos: r.length }; }
  if (lote) await sql`DELETE FROM autocampanha_fila WHERE lote = ${lote}`; else await sql`DELETE FROM autocampanha_fila WHERE status IN ('pronto','falhou') AND criado_em < NOW() - INTERVAL '7 days'`;
  return { ok: true };
}

// ═══ v2.76: DIAGNÓSTICO DA AUTOCAMPANHA — testa cada peça e diz o que está quebrado ═══
async function autoCampanhaDiagnostico() {
  const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
  const itens = [];
  const add = (peca, ok, detalhe, acao) => itens.push({ peca, ok, detalhe, acao: ok ? null : acao });
  // Metricool
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = process.env.METRICOOL_BLOG_ID;
  add('Metricool — credenciais', !!(TOKEN && USERID && BLOGID), `token ${TOKEN ? 'ok' : 'FALTA'} · userId ${USERID ? 'ok' : 'FALTA'} · blogId ${BLOGID ? 'ok' : 'FALTA'}`, 'Configure METRICOOL_USER_TOKEN, METRICOOL_USER_ID e METRICOOL_BLOG_ID no Vercel');
  if (TOKEN && USERID && BLOGID) {
    try { const r = await mc(`/admin/simpleProfiles?userId=${USERID}&blogId=${BLOGID}`, TOKEN);
      const perfis = Array.isArray(r) ? r : (r?.data || []);
      const p = perfis.find(x => String(x.id) === String(BLOGID)) || perfis[0] || {};
      const redes = ['linkedin', 'linkedinCompany', 'instagram', 'facebook', 'twitter'].filter(k => p[k] || p[k + 'Page'] || p[k + 'Account']);
      add('Metricool — acesso e redes conectadas', true, `perfil "${p.label || p.title || BLOGID}" · redes: ${redes.join(', ') || 'não identificadas'}`);
      if (!redes.some(r => /instagram/i.test(r))) add('Metricool — Instagram conectado', false, 'Instagram não aparece como conectado neste perfil', 'Conecte o Instagram (conta business) no Metricool — sem isso, Stories e posts de Instagram falham');
    } catch (e) { add('Metricool — acesso', false, e.message.substring(0, 160), 'Token do Metricool inválido ou plano sem API. Regenere em Settings → API no Metricool'); }
  }
  // Anthropic
  add('IA de texto (Anthropic)', !!process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEY ? 'chave presente · modelo ' + (process.env.CLAUDE_MODEL_RAPIDO || 'claude-haiku-4-5-20251001') : 'ANTHROPIC_API_KEY ausente', 'Configure ANTHROPIC_API_KEY no Vercel');
  // Gerador de imagem
  const temIdeo = !!process.env.IDEOGRAM_API_KEY, temOai = !!process.env.OPENAI_API_KEY;
  add('Imagem — chaves', temIdeo || temOai, `Ideogram ${temIdeo ? 'presente' : 'ausente'} · OpenAI ${temOai ? 'presente (reserva)' : 'ausente'}`, 'Configure IDEOGRAM_API_KEY (ou OPENAI_API_KEY como reserva)');
  if (temIdeo) {
    // v3.57: antes testava /manage/api/api_keys — rota de GERENCIAMENTO, que recusa (401) chaves normais de
    // geração mesmo quando elas funcionam. Agora testa a MESMA rota que gera as imagens, mas sem prompt: a chave
    // é validada (401/403 se for recusada) e o pedido para na validação (400/422), sem gastar crédito.
    try { const fd = new FormData(); fd.append('rendering_speed', 'TURBO');
      const r = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', { method: 'POST', headers: { 'Api-Key': process.env.IDEOGRAM_API_KEY.trim().replace(/\s+/g, '') }, body: fd });
      const corpo = (await r.text().catch(() => '')).substring(0, 160);
      const recusada = r.status === 401 || r.status === 403, semCredito = r.status === 402 || /credit|balance|payment/i.test(corpo);
      add('Imagem — chave do Ideogram aceita', !recusada && !semCredito, `HTTP ${r.status}` + (corpo && (recusada || semCredito) ? ' · ' + corpo : ''),
        recusada ? 'A chave do Ideogram foi recusada. Gere uma nova em ideogram.ai → API, atualize IDEOGRAM_API_KEY no Vercel e faça Redeploy'
          : 'A conta do Ideogram está sem crédito de API — recarregue em ideogram.ai → API');
    } catch (e) { add('Imagem — chave do Ideogram', false, e.message, 'Verifique a rede/chave do Ideogram'); }
  }
  // Conversão JPEG e fontes (Stories)
  try { const r = await fetch(base + '/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'diagnostico_imagem', payload: {} }) }); const d = await r.json();
    add('Imagem — conversão JPEG (Instagram)', !!d.jpeg, d.jpeg ? 'sharp disponível' : (d.erro || 'sharp indisponível'), 'O pacote sharp não carregou no Vercel — confira o deploy (package.json)');
    add('Stories — fonte para o texto', !!d.fonte, d.fonte ? 'Roboto embutida ok' : (d.erro_fonte || 'fonte não encontrada'), 'As fontes em api/fonts não foram incluídas no deploy');
  } catch (e) { add('Imagem — processamento', false, e.message, 'Confira o deploy do /api/media'); }
  // Captura
  try { const r = await fetch(base + '/captura.html', { method: 'HEAD' }); add('Página de captura (link dos posts)', r.ok, 'HTTP ' + r.status, 'A página captura.html não está publicada'); } catch (e) { add('Página de captura', false, e.message, 'Confira o deploy'); }
  // Fila
  try { const sql = await _filaTabela(); const r = await sql`SELECT status, COUNT(*)::int AS n FROM autocampanha_fila WHERE criado_em >= NOW() - INTERVAL '3 days' GROUP BY status`;
    add('Fila em segundo plano', true, r.map(x => `${x.status}: ${x.n}`).join(' · ') || 'vazia');
    const erros = await sql`SELECT erro, COUNT(*)::int AS n FROM autocampanha_fila WHERE erro IS NOT NULL AND criado_em >= NOW() - INTERVAL '3 days' GROUP BY erro ORDER BY n DESC LIMIT 5`;
    erros.forEach(e => add('Fila — erro recorrente', false, `${e.n}× ${String(e.erro).substring(0, 160)}`, 'Veja a ação sugerida nos itens acima'));
  } catch (e) { add('Fila', false, e.message, 'Tabela da fila indisponível'); }
  const falhas = itens.filter(i => !i.ok);
  return { itens, ok: !falhas.length, resumo: falhas.length ? `${falhas.length} problema(s) encontrado(s)` : 'Tudo certo' };
}

// ═══ v2.65: agendar UM post já escrito (texto + imagem opcional) no Metricool ═══
// Separado da geração para caber no limite de tempo: escrever, gerar imagem e agendar são três
// chamadas curtas em vez de uma longa.
// v2.76: toda publicação da autocampanha passa pela ação "publicar" do S2 — o mesmo formato de corpo
// que funciona desde a v1.x (Story sem texto, tipo dentro do provider, URL efêmera convertida etc.).
// Os corpos montados à mão na v2.65/v2.31 eram incompatíveis com o Metricool.
async function _publicarViaS2(params) {
  const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
  const r = await fetch(base + '/api/metricool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publicar', payload: params }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(d.error || ('Metricool HTTP ' + r.status));
  return d;
}
async function autoCampanhaAgendarUm({ post, blog_id, redes } = {}) {
  if (!post?.texto || !post?.data || !post?.hora) throw new Error('post com texto, data e hora obrigatórios');
  const redesAlvo = (Array.isArray(redes) && redes.length ? redes : ['linkedin']).map(r => String(r).toLowerCase());
  // Instagram EXIGE imagem — sem imagem, publica só nas outras redes em vez de falhar tudo
  const redesOk = post.imagem_url ? redesAlvo : redesAlvo.filter(r => r !== 'instagram');
  if (!redesOk.length) throw new Error('Instagram exige imagem e este post ficou sem imagem');
  // v3.46: o texto promete "link no primeiro comentário" — o comentário não era enviado; e a marca escolhida se perdia
  const d = await _publicarViaS2({ texto: post.texto, redes: redesOk, data_hora: `${post.data}T${post.hora}:00`, imagem_url: post.imagem_url || undefined, tipo: 'POST', encurtar_link: false,
    ...(post.comentario ? { comentario: post.comentario } : {}), ...(blog_id ? { blog_id } : {}) });
  return { agendado: true, metricool_id: d.metricool_id || null, redes: d.redes, com_imagem: !!post.imagem_url, instagram_pulado: redesAlvo.length !== redesOk.length };
}
async function _autoCampanhaAgendarUmANTIGO({ post, blog_id, redes } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID;
  const BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  if (!TOKEN || !USERID || !BLOGID) throw new Error('Credenciais do Metricool ausentes');
  if (!post?.texto || !post?.data || !post?.hora) throw new Error('post com texto, data e hora obrigatórios');
  const redesAlvo = (Array.isArray(redes) && redes.length ? redes : ['linkedin']);
  const quando = `${post.data}T${post.hora}:00`;
  const body = {
    text: post.texto,
    providers: redesAlvo.map(n => ({ network: String(n).toUpperCase() })),
    publicationDate: { dateTime: quando, timezone: 'America/Sao_Paulo' },
    autoPublish: true, shortener: false, draft: false,
    firstComment: redesAlvo.some(r => /linkedin|facebook/i.test(r)) ? post.comentario : undefined,
    firstCommentText: redesAlvo.some(r => /linkedin|facebook/i.test(r)) ? post.comentario : undefined, // v3.13
  };
  if (post.imagem_url) { body.media = [post.imagem_url]; body.medias = [post.imagem_url]; }
  const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'POST', body);
  return { agendado: true, metricool_id: r?.id || r?.data?.id || null, quando, com_imagem: !!post.imagem_url };
}

// ═══ v1.74: AUTOCAMPANHA — preenche a agenda dos próximos 7 dias ═══
// Olha os 7 dias à frente e, para cada horário configurado que estiver VAZIO, cria uma
// publicação. Nunca sobrescreve o que já existe agendado.

const HORARIOS_PADRAO = ['08:30', '12:15', '17:30'];

async function _claudeAuto(system, user, maxTokens = 700) {
  const _modeloRapido = process.env.CLAUDE_MODEL_RAPIDO || 'claude-haiku-4-5-20251001';
  const _aceitaPrefill = !/(opus-4-[6-9]|sonnet-4-[6-9]|sonnet-5|opus-5|fable|mythos)/i.test(_modeloRapido);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 50000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    // v2.66: Haiku para os textos da autocampanha — o Sonnet levava 8–14s e estourava o limite de
    // 10s do plano Hobby do Vercel ("Failed to fetch" em todo post). Haiku responde em 2–4s.
    body: JSON.stringify({ model: _modeloRapido, max_tokens: Math.min(maxTokens, 1500), // v3.234: o anúncio pago pede 1100 — com teto de 500 o JSON vinha cortado ("Não escreveu")
      system: system + '\n\nIMPORTANTE: responda SOMENTE com o JSON pedido, começando por "{". Nunca peça mais informações — se faltar algo, escolha você mesmo um ângulo plausível e escreva.',
      // v2.93: pré-preenchimento só em modelos que aceitam — Opus/Sonnet 4.6+ e os modelos 5 respondem 400
      messages: _aceitaPrefill ? [{ role: 'user', content: user }, { role: 'assistant', content: '{' }] : [{ role: 'user', content: user }] }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  const _raw = (_aceitaPrefill ? '{' : '') + String(d.content?.[0]?.text || '' || '');
  // v2.67: extrai o primeiro objeto JSON válido, mesmo com texto em volta
  const _m = _raw.match(/\{[\s\S]*\}/);
  return _m ? _m[0] : _raw;
}

// A configuração vem do frontend (localStorage) ou dos valores padrão — este módulo não
// tem banco próprio, e assim a tela controla tudo sem precisar de migração.
async function autoCampanhaConfig({ salvar } = {}) {
  return {
    horarios: (salvar?.horarios && Array.isArray(salvar.horarios) && salvar.horarios.length) ? salvar.horarios : HORARIOS_PADRAO,
    dias_a_frente: parseInt(salvar?.dias_a_frente) || 7,
    pular_fim_de_semana: salvar?.pular_fim_de_semana !== false,
    redes: salvar?.redes?.length ? salvar.redes : ['linkedin', 'instagram', 'facebook'], // v3.55: padrão = três redes
    tema_base: salvar?.tema_base || 'dados, IA aplicada e eficiência operacional para grandes empresas',
    padrao: HORARIOS_PADRAO,
  };
}

// Consulta o Metricool para saber quais horários já têm post agendado
async function _slotsOcupados({ de, ate, blogId }) {
  try {
    const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID;
    const BLOGID = blogId || process.env.METRICOOL_BLOG_ID;
    // v3.54: mesmo formato de data do listar_posts (ISO + fuso de SP). O formato compacto AAAAMMDDHHMM podia
    // não ser aceito — aí a lista vinha vazia e TODOS os horários pareciam vagos (posts duplicados no mesmo horário)
    const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${de}T00:00:00&end=${ate}T23:59:59&timezone=America/Sao_Paulo`, TOKEN);
    const lista = Array.isArray(r) ? r : (r?.data || r?.posts || []);
    const ocupados = new Set();
    let ignorados = 0;
    lista.forEach(p => {
      const dt = p.publicationDate?.dateTime || p.data || p.publicationDate;
      if (!dt) return;
      // v3.182: rascunho ou post que falhou em todas as redes não vai sair — o horário fica livre para a autocampanha
      const provs = Array.isArray(p.providers) ? p.providers : [];
      const falhouTudo = provs.length && provs.every(x => /ERROR|FAIL|REJECT/i.test(String(x.status || x.state || '')));
      if (p.draft === true || falhouTudo) { ignorados++; return; }
      const s = String(dt);
      const dia = s.substring(0, 10);
      const hora = s.substring(11, 16);
      // v1.74: guarda dia + minuto absoluto. Comparar por PROXIMIDADE evita o furo de gerar
      // marcas de 15 em 15 min (um post às 12:10 não casava com o slot das 12:15).
      const [H, M] = hora.split(':').map(Number);
      ocupados.add(`${dia}|${H * 60 + M}`);
    });
    return { ocupados, total: lista.length, ignorados, erro: null };
  } catch (e) { return { ocupados: new Set(), total: 0, erro: e.message }; }
}

async function autoCampanhaPlanejar({ dias, horarios, pular_fim_de_semana, blog_id, data_inicio } = {}) {
  const cfg = await autoCampanhaConfig();
  const hs = (Array.isArray(horarios) && horarios.length ? horarios : cfg.horarios)
    .map(h => String(h).trim()).filter(h => /^\d{2}:\d{2}$/.test(h));
  if (!hs.length) throw new Error('Nenhum horário válido (use o formato HH:MM)');
  const nDias = parseInt(dias) || cfg.dias_a_frente;
  const pularFds = pular_fim_de_semana !== undefined ? !!pular_fim_de_semana : cfg.pular_fim_de_semana;

  // v3.41: data de início escolhida na tela (antes começava sempre amanhã). Datas no calendário de São Paulo.
  const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const ini = /^\d{4}-\d{2}-\d{2}$/.test(String(data_inicio || '')) ? String(data_inicio) : null;
  const base = new Date(((ini && ini >= hojeSP) ? ini : (ini ? hojeSP : new Date(Date.parse(hojeSP + 'T12:00:00Z') + 86400000).toISOString().split('T')[0])) + 'T12:00:00Z');
  const diaDe = i => new Date(base.getTime() + i * 86400000);
  const de = diaDe(0).toISOString().split('T')[0];
  const ate = diaDe(nDias - 1).toISOString().split('T')[0];
  const { ocupados, total, erro } = await _slotsOcupados({ de, ate, blogId: blog_id });
  // v3.54: sem conseguir ler a agenda do Metricool, não planeja às cegas (antes tudo virava "vago")
  if (erro) { const e = new Error('Não consegui ler a agenda do Metricool para ver os horários ocupados: ' + String(erro).substring(0, 160)); e.dica = 'Tente de novo em alguns minutos. Nada foi gerado.'; throw e; }
  const agoraMs = Date.now() + 30 * 60000; // não planeja horário que já passou (ou daqui a menos de 30 min)

  const vagos = [], jaAgendados = [];
  for (let i = 0; i < nDias; i++) {
    const d = diaDe(i);
    const diaSemana = d.getUTCDay();
    if (pularFds && (diaSemana === 0 || diaSemana === 6)) continue;
    const dia = d.toISOString().split('T')[0];
    hs.forEach(h => {
      if (Date.parse(dia + 'T' + h + ':00-03:00') < agoraMs) return;
      // v1.74: ocupado se houver post no mesmo dia a menos de 45 min do slot
      const [hh, mm] = h.split(':').map(Number);
      const alvoMin = hh * 60 + mm;
      const ocupado = [...ocupados].some(k => {
        const [d2, m2] = String(k).split('|');
        return d2 === dia && Math.abs(parseInt(m2) - alvoMin) <= 45;
      });
      if (ocupado) jaAgendados.push({ data: dia, hora: h });
      else vagos.push({ data: dia, hora: h, dia_semana: ['dom','seg','ter','qua','qui','sex','sáb'][diaSemana] });
    });
  }
  return { plano: { vagos, ja_agendados: jaAgendados, periodo: { de, ate },
    horarios: hs, dias: nDias, pular_fim_de_semana: pularFds,
    posts_existentes: total, erro_consulta: erro,
    resumo: `${vagos.length} horário(s) vago(s) e ${jaAgendados.length} já preenchido(s) em ${nDias} dia(s) a partir de ${de.split('-').reverse().join('/')}.` } };
}

// Gera o conteúdo e agenda, um slot por vez
async function autoCampanhaExecutar({ dias, horarios, pular_fim_de_semana, tema, redes, blog_id, apenas_rascunho = false, limite = 21, slots = null, cta_instagram = '', data_inicio = null } = {}) {
  const _t0 = Date.now();
  const cfg = await autoCampanhaConfig();
  // v3.234: o CTA do Instagram escolhido na tela fica guardado — a fila (cron) gerava os posts sem ele e usava a URL longa
  try { if (cta_instagram) await _kvMc('mkt:cta_instagram', { texto: String(cta_instagram).substring(0, 400), em: new Date().toISOString() }); else cta_instagram = (await _kvMc('mkt:cta_instagram'))?.texto || ''; } catch (_) {}
  // v2.16: quando o navegador manda `slots`, gera só esses (lote). Evita o "Failed to fetch":
  // 15 posts de uma vez levavam ~90s e a função era cortada pelo limite do Vercel.
  let plano, alvos;
  if (Array.isArray(slots) && slots.length) {
    plano = { vagos: slots, ja_agendados: [], resumo: `lote de ${slots.length}` };
    alvos = slots.slice(0, 5);
  } else {
    ({ plano } = await autoCampanhaPlanejar({ dias, horarios, pular_fim_de_semana, blog_id, data_inicio }));
    alvos = plano.vagos.slice(0, Math.min(parseInt(limite) || 21, 5));
  }
  if (!alvos.length) return { criados: 0, plano, aviso: 'Nenhum horário vago — a agenda já está completa no período.' };

  // v1.77: confere as credenciais ANTES de gerar os textos. Sem isso, o sistema gastava
  // minutos escrevendo 21 posts com IA para depois falhar com 401 em todos.
  if (!apenas_rascunho) {
    const T = process.env.METRICOOL_USER_TOKEN, U = process.env.METRICOOL_USER_ID;
    const B = blog_id || process.env.METRICOOL_BLOG_ID;
    if (!T || !U || !B) {
      const faltando = [!T && 'METRICOOL_USER_TOKEN', !U && 'METRICOOL_USER_ID', !B && 'METRICOOL_BLOG_ID'].filter(Boolean);
      const err = new Error('Credenciais do Metricool ausentes: ' + faltando.join(', '));
      err.dica = 'Configure no Vercel (Settings → Environment Variables) e faça o redeploy.';
      throw err;
    }
    try {
      { const _h = new Date().toISOString().substring(0, 10); await mc(`/v2/scheduler/posts?userId=${U}&blogId=${B}&start=${_h}T00:00:00&end=${_h}T23:59:59&timezone=America/Sao_Paulo`, T); }
    } catch (e) {
      if (/401|Authentication/i.test(e.message)) {
        const err = new Error('O Metricool recusou a autenticação (401). Nada foi gerado.');
        err.dica = 'Confira METRICOOL_USER_TOKEN, METRICOOL_USER_ID e METRICOOL_BLOG_ID no Vercel. O token é o "User Token" da conta, não a chave da API.';
        throw err;
      }
    }
  }

  // v2.67: sem tema, o modelo respondia "preciso de mais informação" em vez de escrever. Agora há
  // um tema padrão concreto e um cardápio de ângulos que o modelo pode escolher.
  const temaBase = (tema && tema.trim()) || (cfg.tema_base && cfg.tema_base.trim()) ||
    'Resultado de negócio com dados e IA em médias e grandes empresas (energia, bancos, indústria, infraestrutura), do ponto de vista de quem DECIDE: margem, caixa, risco, prazo e controle. Ângulos possíveis: a decisão de diretoria que custa caro por falta de número confiável; o que o CFO/CEO deveria cobrar do time de dados; quanto custa uma semana de atraso no fechamento; IA que tira um gargalo da operação e o ganho em R$; por que projetos de dados atrasam e como a diretoria evita.'; // v3.234: ICP C-level (antes o tema padrão puxava assunto técnico)
  const redesAlvo = (Array.isArray(redes) && redes.length ? redes : cfg.redes);
  const criados = [], erros = [];
  const _plv = await _planoMc(); // v3.240: trilhas do plano estratégico vigente (null = como antes)

  for (const slot of alvos) {
    try {
      const trilha = _plv ? escolherTrilha(_plv.plano, slot.data + '_' + slot.hora) : null;
      const system = `Você escreve posts de LinkedIn para a Atlantyx — consultoria brasileira de dados e IA, 17 anos de mercado, clientes como CPFL Energia, Enel e Caixa Capitalização. ${ICP_TEXTO}

REGRAS:
- Escreva para o dono/C-level: comece pela consequência de negócio (dinheiro, risco, prazo), não pela ferramenta; sem tutorial, sem "como fazer" técnico, sem vaga/carreira.
- Entre 60 e 130 palavras. Primeira linha precisa parar o scroll — sem "Você sabia que".
- Uma ideia só por post, concreta. Traga um exemplo, um número ou uma situação real de projeto.
- Sem emoji em excesso (no máximo 1), sem hashtag genérica, sem "revolucionar", "transformar digitalmente", "game changer".
- Nunca invente cliente, número ou caso que não foi informado.
- Português do Brasil, tom de quem entende do assunto falando com um par.

O MAIS IMPORTANTE — o post precisa gerar LEAD, não só curtida:
- Termine OFERECENDO algo concreto em troca de uma conversa: um diagnóstico de 30 min, um checklist, uma segunda opinião sobre um problema específico. Algo que o leitor ganha.
- A última frase aponta para o link: "O link está no primeiro comentário" (LinkedIn reduz alcance de link no corpo).
- Não escreva a URL no texto — o sistema coloca o link no comentário.
- Proibido terminar só com pergunta retórica ou "o que você acha?" — isso gera engajamento e zero lead.

IMAGEM — escreva também, EM INGLÊS, a descrição de UMA cena fotográfica que ilustre ESTE post especificamente.
Deve ser concreta e do mundo corporativo real: salas de controle de energia, subestações, turbinas eólicas, data centers,
dashboards em telas, reuniões de diretoria vistas de longe, mesas de trabalho com gráficos, redes de dados, linhas de transmissão.
Proibido: animais, personagens, desenhos, rostos em close, texto ou letras na imagem, logotipos, qualquer coisa lúdica.

Devolva SOMENTE JSON: {"texto":"...","angulo":"em 5 palavras, o ângulo escolhido","oferta":"o que está sendo oferecido, em até 8 palavras","imagem":"scene description in English, 20-40 words"}`;
      const user = `Tema geral: ${temaBase}
Data da publicação: ${slot.data} (${slot.dia_semana}) às ${slot.hora}
${slot.hora < '11:00' ? 'Horário da manhã: pode ser um post mais analítico, para quem abre o feed começando o dia.'
  : slot.hora < '15:00' ? 'Horário do meio-dia: leitura rápida, algo que se lê entre uma reunião e outra.'
  : 'Fim de tarde: bom para reflexão ou balanço, quando o executivo está fechando o dia.'}
Evite repetir o mesmo ângulo de outros posts da semana.${trilha ? '\n' + briefingTrilha(trilha) + ' Este post serve a ESTA trilha (a oferta do final é a dela), dentro do tema geral.' : ''}`;
      const txt = await _claudeAuto(system, user, 700);
      let j;
      try { j = JSON.parse(String(txt).replace(/```json|```/g, '').trim()); }
      catch (_) {
        // v2.67: resposta fora do formato — aproveita o texto como post em vez de perder o slot
        const limpo = String(txt).replace(/^\{?\s*"?texto"?\s*:?\s*"?/i, '').replace(/[{}"]+$/g, '').trim();
        if (limpo.length < 40 || /preciso de|não tenho|informa[çc]/i.test(limpo.substring(0, 60))) throw new Error('modelo não escreveu o post (resposta: ' + limpo.substring(0, 60) + '…)');
        j = { texto: limpo, angulo: 'sem ângulo declarado', oferta: 'conversa de 30 min' };
      }
      // v2.15: link de captura com UTM — é o que transforma o post em fonte rastreável de lead
      const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
      const utm = new URLSearchParams({ utm_source: 'linkedin', utm_medium: 'autocampanha',
        utm_campaign: `${trilha ? 'alv-' + trilha.id + '_' : ''}${slot.data}_${slot.hora.replace(':', '')}`, utm_content: (j.angulo || '').substring(0, 40).replace(/\s+/g, '-').toLowerCase() });
      j.link = `${base}/captura.html?${utm.toString()}`;
      j.comentario = `${j.oferta ? j.oferta.charAt(0).toUpperCase() + j.oferta.slice(1) + ' → ' : ''}${j.link}`;
      // v2.30: cada rede tem o seu caminho para o link.
      //  LinkedIn  → link no 1º comentário (preserva alcance)
      //  Instagram → link no texto NÃO é clicável; o caminho é "link na bio" + o link visível
      //              no fim da legenda (quem quiser copia). A bio precisa apontar para a captura.
      //  Facebook  → link no texto é clicável, então vai direto no corpo
      const temIg = redesAlvo.some(r => /instagram/i.test(r));
      const temFb = redesAlvo.some(r => /facebook/i.test(r));
      const temLi = redesAlvo.some(r => /linkedin/i.test(r));
      if (temIg) {
        const utmIg = new URLSearchParams({ ...Object.fromEntries(utm), utm_source: 'instagram' });
        j.link_instagram = `${base}/captura.html?${utmIg.toString()}`;
        j.texto = String(j.texto).replace(/o link est[áa] no primeiro coment[áa]rio\.?/i, '').trim()
          + `\n\n${cta_instagram || ('👉 ' + (j.oferta ? j.oferta.charAt(0).toUpperCase() + j.oferta.slice(1) : 'Agende uma conversa') + ': ' + String(j.link_instagram).replace(/^https?:\/\//, ''))}`; // v3.32: CTA configurado (sem "link na bio")
        j.link_bio = `${base}/captura.html?utm_source=instagram&utm_medium=bio`;
      } else if (temFb && !temLi) {
        j.texto = String(j.texto).replace(/o link est[áa] no primeiro coment[áa]rio\.?/i, '').trim() + `\n\n👉 ${j.link}`;
      }

      if (apenas_rascunho) {
        criados.push({ ...slot, trilha: trilha?.id || null, trilha_nome: trilha?.nome || null, texto: j.texto, angulo: j.angulo, oferta: j.oferta, imagem_prompt: j.imagem || null, link: j.link, link_instagram: j.link_instagram, link_bio: j.link_bio, comentario: j.comentario, status: 'rascunho' });
      } else {
        const quando = `${slot.data}T${slot.hora}:00`;
        const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID;
        const BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
        // v1.77: alinhado ao publicador que já funciona — redes em MAIÚSCULO e data sem timezone no texto
        const body = {
          text: j.texto,
          providers: redesAlvo.map(n => ({ network: String(n).toUpperCase() })),
          publicationDate: { dateTime: quando, timezone: 'America/Sao_Paulo' },
          autoPublish: true, shortener: false, draft: false,
          // v2.15/v2.30: 1º comentário só onde faz sentido (LinkedIn/Facebook); no Instagram o link
          // fica na legenda + bio, porque comentário com link não é clicável lá
          firstComment: redesAlvo.some(r => /linkedin|facebook/i.test(r)) ? j.comentario : undefined,
          firstCommentText: redesAlvo.some(r => /linkedin|facebook/i.test(r)) ? j.comentario : undefined, // v3.13: nome do campo na API
        };
        // v1.80: se a autocampanha passar a usar imagem, ela também precisa ser permanente
        if (Array.isArray(body.media) && body.media.length) {
          const { garantirPermanente } = await import('./media.js');
          const conv = [];
          for (const u of body.media) conv.push((await garantirPermanente({ url: u })).url);
          body.media = conv; body.medias = conv;
        }
        const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'POST', body);
        criados.push({ ...slot, trilha: trilha?.id || null, trilha_nome: trilha?.nome || null, texto: j.texto, angulo: j.angulo, oferta: j.oferta, imagem_prompt: j.imagem || null, link: j.link, link_instagram: j.link_instagram, link_bio: j.link_bio, comentario: j.comentario, status: 'agendado', metricool_id: r?.id || r?.data?.id || null });
      }
    } catch (e) { erros.push(`${slot.data} ${slot.hora}: ${e.message}`); }
  }
  return { criados: criados.length, posts: criados, erros, plano,
    resumo: `${criados.length} publicação(ões) ${apenas_rascunho ? 'em rascunho' : 'agendadas'} nos horários vagos.` };
}

async function handler(req, res) {
  // v3.239: volta do login do LinkedIn (OAuth) — página simples que fecha/volta para o sistema
  if (req.method === 'GET' && req.query?.li === 'callback') {
    const pg = (ok, msg) => res.status(ok ? 200 : 400).setHeader('Content-Type', 'text/html; charset=utf-8').end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LinkedIn</title><body style="font-family:system-ui,sans-serif;background:#05080c;color:#e8eef3;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;padding:16px;"><div style="max-width:460px;text-align:center;"><div style="font-size:40px;">' + (ok ? '✅' : '⚠️') + '</div><h2 style="font-size:18px;">' + (ok ? 'LinkedIn conectado' : 'LinkedIn não conectado') + '</h2><p style="font-size:14px;line-height:1.5;color:#9fb0bf;">' + String(msg).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</p><p><a href="/" style="color:#00C4CC;">Voltar ao Atlantyx OS</a></p></div><script>try{window.opener&&window.opener.postMessage({atxLinkedin:' + (ok ? 'true' : 'false') + '},location.origin)}catch(e){}</script>');
    try { await liCallback(req.query || {}, _baseDe(req)); return pg(true, 'A conta de anúncios foi ligada ao sistema. Pode fechar esta aba e voltar para a campanha patrocinada.'); }
    catch (e) { return pg(false, e.message); }
  }
  // v2.68: cron da fila — um passo por minuto, em segundo plano
  if (req.method === 'GET' && req.query?.cron === 'fila') {
    // v3.237: UM passo por chamada (dois passos + guardiões passavam dos 60 s e a função era cortada no meio)
    try { const t0 = Date.now(); const out = [await filaProcessar({})];
      let icp = null, icpConteudo = null, leads = null;
      if (out[0].ocioso) {
        // leads que ficaram sem processar (aba fechada antes do 2º passo) — 1 por minuto
        try { const { processarLeadsPendentes } = await import('./lead-capture.js'); leads = await processarLeadsPendentes({ limite: 1 }); } catch (e) { leads = { erro: e.message }; }
        if (!leads?.processados) { // v3.234/v3.235: guardiões do ICP (anúncios de hora em hora; conteúdo: 1 item por minuto livre)
          try { icp = await _icpGuardiao(); } catch (e) { icp = { erro: e.message }; }
          if (icp?.pulado && Date.now() - t0 < 15000) { try { icpConteudo = await _icpConteudoGuardiao(); } catch (e) { icpConteudo = { erro: e.message }; } } } }
      return res.status(200).json({ success: true, passos: out, leads, icp, icp_conteudo: icpConteudo }); }
    catch (e) { return res.status(500).json({ success: false, error: e.message }); }
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const TOKEN  = process.env.METRICOOL_USER_TOKEN;
  const USERID = process.env.METRICOOL_USER_ID;
  const BLOGID_PADRAO = process.env.METRICOOL_BLOG_ID;
  // v1.26: permite escolher OUTRA marca/página do Metricool por chamada (payload.blog_id),
  // sem precisar mudar a variável de ambiente. Cada "marca" no Metricool tem seus próprios
  // perfis conectados — é assim que se posta em outra página do LinkedIn na mesma conta.
  const BLOGID = (req.body?.payload?.blog_id || req.body?.blog_id || BLOGID_PADRAO);

  try {
    // v2.69: a tela (mcApi) envia os parâmetros SOLTOS no corpo, não em "payload". Antes nenhum
    // parâmetro chegava — slots, tema, redes, horários eram ignorados, e cada chamada "de um post"
    // gerava o plano inteiro (5 posts com IA). Era a causa real dos "Failed to fetch".
    const { action, payload: _pl, ...resto } = req.body || {};
    const payload = (_pl && typeof _pl === 'object') ? { ...resto, ..._pl } : resto;
    if (!action) return res.status(400).json({ error: 'Campo "action" obrigatório' });
    if (action === 'erros_publicacao') return res.status(200).json({ success: true, erros: ((await _kvMc('mc:erros_publicacao').catch(() => null)) || []).slice(0, Math.min(200, Number(payload.limite) || 60)) }); // v3.300

    // Status da conexão — sempre disponível, mesmo sem credenciais
    if (action === 'status') {
      const configurado = !!(TOKEN && USERID && BLOGID);
      if (!configurado) {
        return res.status(200).json({
          success: true, configurado: false,
          faltando: [
            !TOKEN  && 'METRICOOL_USER_TOKEN',
            !USERID && 'METRICOOL_USER_ID',
            !BLOGID && 'METRICOOL_BLOG_ID',
          ].filter(Boolean),
          instrucoes: 'Crie conta no Metricool (plano Advanced tem API), vá em Settings → API, copie o token. O userId e blogId aparecem na URL do painel: app.metricool.com/…?userId=XXX&blogId=YYY. Configure as 3 envvars no Vercel e faça Redeploy.',
        });
      }
      // Testa a conexão listando as marcas
      const r = await mc(`/admin/simpleProfiles?userId=${USERID}`, TOKEN);
      const marcas = Array.isArray(r) ? r : (r?.profiles || []);
      const marca = marcas.find(m => String(m.id) === String(BLOGID)) || marcas[0] || null;
      return res.status(200).json({
        success: true, configurado: true,
        marca: marca ? { id: marca.id, nome: marca.label || marca.title || marca.name } : null,
        redes_conectadas: marca ? extrairRedes(marca) : [],
        blog_id_ativo: BLOGID, blog_id_padrao: BLOGID_PADRAO,
        // v1.26: todas as marcas da conta, para o seletor de página na tela
        marcas: marcas.map(m => ({ id: m.id, nome: m.label || m.title || m.name || ('Marca ' + m.id), redes: extrairRedes(m) })),
      });
    }

    // v2.76: diagnóstico roda mesmo sem credenciais (é justamente o que ele verifica)
    if (action === 'autocampanha_diagnostico') return res.status(200).json({ success: true, ...(await autoCampanhaDiagnostico()) });

    // Daqui pra baixo exige credenciais
    if (!TOKEN || !USERID || !BLOGID) {
      return res.status(200).json({
        success: false, configurado: false,
        error: 'Metricool não configurado. Use action=status para instruções.',
      });
    }

    const acoes = {
    autocampanha_config:    () => autoCampanhaConfig(payload),
    corrigir_imagens:       () => corrigirImagensAgendadas(payload),
    auditoria_funil:        () => auditoriaFunil(payload),
    republicar_falhas:      () => republicarFalhas(payload, req), // v3.70
    trocar_link_agendados:  () => trocarLinkAgendados(payload, req), // v3.71
    remover_duplicados:     () => removerDuplicados(payload), // v3.80
    instagram_para_bio:     () => instagramParaBio(payload, req), // v3.106
    // v3.108: campanha PATROCINADA no Instagram com botão "Saiba mais" → landing page
    patrocinado_status:     () => patrocinadoStatus(req),
    patrocinado_diagnostico: () => patrocinadoDiagnostico(), // v3.176
    patrocinado_copy:       () => patrocinadoCopy(payload),
    patrocinado_criar:      () => patrocinadoCriar(payload, req),
    geo_local_resolver:     () => geoLocalResolver(payload), // v3.316: confere o local da campanha geolocalizada (não cria nada)
    patrocinado_estado:     () => patrocinadoEstado(payload),
    patrocinado_periodo:    () => patrocinadoPeriodo(payload), // v3.193
    patrocinado_listar:     () => patrocinadoListar(),
    // v3.239: LinkedIn Ads + públicos por lista (Apollo → Meta / LinkedIn)
    li_conectar:            () => liUrlConectar(_baseDe(req)),
    // v3.240: trilhas do plano estratégico vigente na campanha
    plano_trilhas:          async () => { const v = await _planoMc({ ignorarOpcao: true }); const op = await _kvMc('mkt:autocampanha_plano').catch(() => null);
      return { vigente: v ? { versao: v.versao, nome: v.plano.nome, aprovado_em: v.aprovado_em } : null, usar: op?.usar !== false, trilhas: v ? trilhasCampanha(v.plano).map(t => ({ id: t.id, nome: t.nome, peso: t.peso_campanha, oferta: t.oferta, publico: t.publico, dor: t.dor, prova: t.prova })) : [] }; },
    plano_trilhas_usar:     async () => { await _kvMc('mkt:autocampanha_plano', { usar: payload.usar !== false, em: new Date().toISOString() }); return { usar: payload.usar !== false }; },
    li_status:              () => liStatus(_baseDe(req)),
    li_desconectar:         async () => { await _kvMc('li:oauth:tokens', { access_token: null }); await _kvMc('li:ads:conta', null); return { ok: true }; },
    publico_meta_enviar:    () => publicoMetaEnviar(payload),
    publico_li_enviar:      () => publicoLiEnviar(payload),
    publico_plataformas_ler: () => publicoPlataformasLer(payload),
    meta_kpis:              () => metaKpis(), // v3.216
    patrocinado_publico_atualizar: () => patrocinadoPublicoAtualizar(payload), // v3.214
    icp_auditar_planejados: () => icpAuditarPlanejados(payload), // v3.234
    icp_conteudo_log: async () => ({ log: (await _kvMc('mkt:icp_conteudo_log').catch(() => null)) || [], estado: await _kvMc('mkt:icp_conteudo').catch(() => null) }), // v3.235
    icp_guardiao: async () => ({ guarda: payload.executar ? await _icpGuardiao({ forcar: true }) : await _kvMc('mkt:meta:icp_guarda').catch(() => null) }), // v3.234
    story_texto:            () => storyTexto(payload),
    autocampanha_agendar_um:() => autoCampanhaAgendarUm(payload),
    fila_enfileirar:        () => filaEnfileirar(payload),
    fila_status:            () => filaStatus(payload),
    // v3.52: posts que a FILA do servidor já agendou no Metricool — para entrarem no calendário e no desempenho
    fila_agendados:         async () => { const sql = await _filaTabela(); const desde = new Date(Date.now() - 90 * 864e5).toISOString().substring(0, 10);
      const rows = await sql`SELECT id, lote, data, hora, tipo, redes, texto, link, imagem_url, metricool_id FROM autocampanha_fila WHERE metricool_id IS NOT NULL AND data >= ${desde} ORDER BY data, hora LIMIT 500`;
      return { itens: rows.map(r => ({ ...r, redes: Array.isArray(r.redes) ? r.redes : (() => { try { return JSON.parse(r.redes || '[]'); } catch (_) { return []; } })() })) }; },
    fila_processar:         () => filaProcessar(payload),
    fila_limpar:            () => filaLimpar(payload),
    fila_agendar_rascunhos: () => filaAgendarRascunhos(payload),
    autocampanha_diagnostico: () => autoCampanhaDiagnostico(),
    story_agendar:          () => storyAgendar(payload),
    autocampanha_planejar:  () => autoCampanhaPlanejar(payload),
    autocampanha_executar:  () => { throw new Error('Desativado (v3.300): use a fila da autocampanha — o caminho direto agendava sem checar mídia e fuso'); },
      // Publicar/agendar post
      // payload: { texto, redes: ['linkedin','instagram','facebook'], data_hora (ISO opcional), imagem_url (opcional), campanha_id, peca_id }
      publicar: async () => {
        const { texto, redes = [], data_hora, imagem_url, encurtar_link = true, tipo = 'POST', link_sticker = '', imagens_urls = [] } = payload; // v1.11: imagens_urls = carrossel
        if (!redes.length) throw new Error('redes são obrigatórias');
        if (tipo !== 'STORY' && !texto) throw new Error('texto é obrigatório');
        if (tipo === 'STORY' && !imagem_url) throw new Error('Story exige imagem 9:16');
        if (tipo === 'REEL' && !imagem_url) throw new Error('Reel exige a URL pública do vídeo MP4 (imagem_url)');

        // Mapear nomes internos → providers Metricool
        const provMap = { linkedin: 'LINKEDIN', instagram: 'INSTAGRAM', facebook: 'FACEBOOK', twitter: 'TWITTER', tiktok: 'TIKTOK' };
        const providers = redes.map(r => provMap[r.toLowerCase()]).filter(Boolean);
        if (!providers.length) throw new Error('Nenhuma rede válida em: ' + redes.join(','));

        // Data: agora + 2min se não informada (Metricool exige futuro)
        const quando = data_hora ? new Date(data_hora) : new Date(Date.now() + 2 * 60 * 1000);
        // v3.23 FIX FUSO: o Metricool recebe a hora "de parede" + timezone America/Sao_Paulo. Antes mandávamos
        // a hora em UTC rotulada como São Paulo — um "publicar agora" saía 3h depois, e todo horário escolhido
        // no navegador (enviado em UTC com "Z") era deslocado +3h. Hora sem fuso (ex.: "2026-10-01T09:00")
        // continua sendo tratada como horário de São Paulo, como antes.
        const _semFuso = data_hora && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(String(data_hora).trim());
        const _spLocal = d => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
          return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`; };
        const dataHoraSP = _semFuso ? String(data_hora).trim().replace(' ', 'T').substring(0, 19).padEnd(19, ':00').substring(0, 19) : _spLocal(quando);
        // v3.300: horário no passado (ou em menos de 3 min) o Metricool recusa/publica errado — barra antes, com mensagem clara
        { const agoraSP = _spLocal(new Date(Date.now() + 3 * 60000)); if (data_hora && dataHoraSP < agoraSP) { const e = new Error('Horário de publicação já passou (' + dataHoraSP.replace('T', ' ').substring(0, 16) + ', horário de Brasília) — escolha um horário pelo menos 3 minutos à frente'); e.dica = 'Reagende a peça para um horário futuro.'; e.validacao = true; throw e; } }
        // v3.300: limites de texto por rede (Instagram 2.200, LinkedIn 3.000, X 280) e carrossel até 10 imagens
        { const lim = { INSTAGRAM: 2200, LINKEDIN: 3000, TWITTER: 280, FACEBOOK: 63000, TIKTOK: 2200 }, tam = String(texto || '').length, estoura = providers.filter(p => lim[p] && tam > lim[p]);
          if (estoura.length) { const e = new Error('Texto com ' + tam + ' caracteres passa do limite de ' + estoura.map(p => p.toLowerCase() + ' (' + lim[p] + ')').join(', ')); e.dica = 'Encurte o texto ou publique só nas redes que aceitam esse tamanho.'; e.validacao = true; throw e; }
          const nImg = Array.isArray(imagens_urls) ? imagens_urls.length : 0; if (nImg > 10) { const e = new Error('Carrossel com ' + nImg + ' imagens — o máximo é 10'); e.validacao = true; throw e; } }

        const body = {
          // v1.8: Story do Instagram/Facebook — provider com data { postType: STORY }
          providers: providers.map(p => {
            if (tipo === 'STORY' && (p === 'INSTAGRAM' || p === 'FACEBOOK')) return { network: p, data: { postType: 'STORY', ...(link_sticker ? { linkSticker: link_sticker } : {}) } };
            if (tipo === 'REEL'  && (p === 'INSTAGRAM' || p === 'FACEBOOK')) return { network: p, data: { postType: 'REEL' } }; // v1.9
            return { network: p };
          }),
          publicationDate: {
            dateTime: dataHoraSP,
            timezone: 'America/Sao_Paulo',
          },
          // v3.23: primeiro comentário (LinkedIn: o link vai no comentário para não derrubar o alcance)
          ...(payload.comentario ? { firstCommentText: String(payload.comentario).substring(0, 1200) } : {}),
          // v1.10: Stories NÃO aceitam texto ("Máximo de caracteres permitido 0") — o texto vai gravado na imagem
          text: tipo === 'STORY' ? '' : (texto || ''),
          ...(tipo === 'STORY' ? { instagramData: { type: 'STORY', ...(link_sticker ? { link: link_sticker } : {}) }, facebookData: { type: 'STORY' } } : {}),
          ...(tipo === 'REEL'  ? { instagramData: { type: 'REEL' }, facebookData: { type: 'REEL' } } : {}),
          autoPublish: true,
          shortener: !!encurtar_link, // v1.6.9: Metricool encurta URLs do texto (some o link gigante)
          draft: false,
          // v1.6.8: a doc da API varia entre "media" e "medias" — enviar ambos
          // (campos desconhecidos são ignorados; o correto é aplicado)
          ...(Array.isArray(imagens_urls) && imagens_urls.length > 1 ? { media: imagens_urls, medias: imagens_urls } : (imagem_url ? { media: [imagem_url], medias: [imagem_url] } : {})),
        };
        console.log('[metricool publicar] payload:', JSON.stringify({ tipo, providers: body.providers, nMidias: (body.media||[]).length, temImagem: !!imagem_url, imagem: (imagem_url||'').substring(0,80), quando: body.publicationDate.dateTime }));

        // v1.80: CONVERTE URLs EFÊMERAS ANTES DE AGENDAR.
        // O Ideogram devolve links que expiram em poucas horas (exp=...&sig=...). O Metricool
        // só baixa a imagem NA HORA de publicar — dias depois o link já morreu, e o post falha
        // com "Error downloading the image" (LinkedIn) ou "url should represent a valid URL" (Facebook).
        // Copiamos a imagem para o nosso domínio, com URL que não expira.
        if (Array.isArray(body.media) && body.media.length) {
          try {
            const { garantirPermanente } = await import('./media.js');
            const convertidas = [];
            for (const u of body.media) {
              const r = await garantirPermanente({ url: u, req });
              convertidas.push(r.url);
              if (r.convertida) console.log(`[metricool] imagem efêmera convertida: ${String(u).substring(0,60)} → ${r.url}`);
            }
            body.media = convertidas; body.medias = convertidas;
          } catch (e) {
            const err = new Error('Não consegui tornar a imagem permanente: ' + e.message);
            err.dica = e.dica || 'A URL da imagem expira antes da data de publicação. Gere a imagem de novo e publique logo em seguida.';
            throw err;
          }
        }

        // v1.68: VALIDA A MÍDIA ANTES DE PUBLICAR. O Metricool precisa baixar a imagem/vídeo
        // de uma URL pública — se ela estiver fora do ar, exigir login ou devolver HTML em vez
        // de imagem, ele recusa o post com erro genérico. Conferir antes dá um erro claro.
        const midias = body.media || [];
        if (midias.length) {
          const problemas = [];
          for (const url of midias.slice(0, 10)) {
            if (!/^https:\/\//i.test(url)) { problemas.push(`${url.substring(0,60)} — precisa ser HTTPS público`); continue; }
            try {
              const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 12000);
              let resp = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
              if (resp.status === 405 || resp.status === 501) resp = await fetch(url, { method: 'GET', signal: ctrl.signal, headers: { Range: 'bytes=0-1024' } });
              clearTimeout(tm);
              const ct = (resp.headers.get('content-type') || '').toLowerCase();
              const tam = parseInt(resp.headers.get('content-length') || '0');
              if (!resp.ok) problemas.push(`${url.substring(0,60)} — HTTP ${resp.status} (o Metricool não consegue baixar)`);
              else if (ct.includes('text/html')) problemas.push(`${url.substring(0,60)} — devolveu HTML em vez de mídia (link de página, não do arquivo?)`);
              else if (tipo === 'REEL' && !/video\/(mp4|quicktime)/.test(ct)) problemas.push(`${url.substring(0,60)} — Reel exige vídeo MP4 ou MOV, veio "${ct}"${ct.includes('webm') ? ' (gravação WebM do navegador: o Instagram não aceita — grave/converta em MP4)' : ''}`);
              else if (tipo !== 'REEL' && ct && !ct.includes('image')) problemas.push(`${url.substring(0,60)} — esperado imagem, veio "${ct}"`);
              else if (tam && tam < 1024) problemas.push(`${url.substring(0,60)} — arquivo muito pequeno (${tam} bytes), pode estar corrompido`);
            } catch (e) {
              problemas.push(`${url.substring(0,60)} — inacessível (${e.name === 'AbortError' ? 'tempo esgotado' : e.message})`);
            }
          }
          if (problemas.length) {
            const err = new Error('A(s) mídia(s) não estão acessíveis publicamente, e o Metricool precisa baixá-las para publicar:\n• ' + problemas.join('\n• '));
            err.midias_com_problema = problemas;
            err.dica = 'Confira se MEDIA_PUBLIC_BASE aponta para o domínio público correto e se o arquivo abre numa aba anônima do navegador.';
            throw err;
          }
        }

        const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'POST', body);
        // v3.65: confere quais redes o Metricool REALMENTE manteve no post (um Story pedido para Instagram + Facebook
        // ficou só no Facebook e o sistema achava que estava nos dois)
        const devolvidas = ((r?.data || r)?.providers || []).map(x => String(x.network || x).toUpperCase()).filter(Boolean);
        const faltando = devolvidas.length ? providers.filter(p => !devolvidas.includes(p)) : [];
        if (faltando.length && faltando.length === providers.length) { const e = new Error('O Metricool criou o post sem nenhuma das redes pedidas (' + providers.join(', ') + ')'); e.post_criado = true; e.metricool_id = r?.data?.id || r?.id || null; throw e; } // v3.300: post existe — não reenviar
        return {
          publicado: true,
          agendado_para: quando.toISOString(),
          redes: providers.filter(p => !faltando.includes(p)),
          redes_faltando: faltando.map(x => x.toLowerCase()),
          metricool_id: r?.data?.id || r?.id || null,
          resposta: r,
        };
      },

      // v1.11.2: reagendar post — tenta atualizar a data; se não der (ou sem suporte), recria com o payload original
      reagendar: async () => {
        const { metricool_id, data_hora, payload: orig } = payload;
        if (!metricool_id || !data_hora) throw new Error('metricool_id e data_hora obrigatórios');
        const quando = new Date(data_hora); if (isNaN(quando)) throw new Error('data_hora inválida');
        // v3.23: mesma correção de fuso do publicar
        const _sem = !/[zZ]|[+-]\d{2}:?\d{2}$/.test(String(data_hora).trim());
        const _p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(quando).map(x => [x.type, x.value]));
        const dt = { dateTime: _sem ? String(data_hora).trim().replace(' ', 'T').substring(0, 19).padEnd(19, ':00').substring(0, 19) : `${_p.year}-${_p.month}-${_p.day}T${_p.hour === '24' ? '00' : _p.hour}:${_p.minute}:${_p.second}`, timezone: 'America/Sao_Paulo' };

        // v1.26.1 FIX: o Metricool rejeita PUT parcial ("text must not be null, providers must not be null").
        // Agora BUSCAMOS o post no Metricool primeiro e reenviamos o registro COMPLETO só com a data trocada —
        // assim funciona também para posts que não foram criados por este sistema (sem payload salvo).
        let postAtual = null, erroGet = '';
        try {
          const g = await mc(`/v2/scheduler/posts/${metricool_id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN);
          postAtual = g?.data || g?.post || g;
          if (postAtual && !postAtual.providers && !postAtual.text) postAtual = null; // resposta não parece um post
        } catch (e) { erroGet = e.message; }

        let erroPut = '';
        if (postAtual) {
          // Reenvia o post inteiro, trocando apenas a data (mantém texto, redes, mídia, tipo de post)
          // v3.80: sem PUT (o Metricool gerava cópias) — recria na nova data e só conclui se o antigo foi apagado
          const corpo = _corpoPostMc(postAtual, { publicationDate: dt });
          try { const novoId = await _recriarSemDuplicar(metricool_id, corpo, { USERID, BLOGID, TOKEN });
            return { reagendado: true, metodo: 'recriado_do_metricool', antigo: metricool_id, metricool_id: novoId, agendado_para: quando.toISOString(), detalhe: 'recriado na nova data' };
          } catch (e) { throw new Error('Não consegui reagendar no Metricool: ' + e.message); } // não cai no plano B (evita cópia)
        }

        // Plano B: recriar. Usa o payload original salvo OU reconstrói a partir do post buscado no Metricool.
        let dadosRecriar = null;
        if (orig && orig.redes?.length) dadosRecriar = orig;
        else if (postAtual) {
          const invMap = { LINKEDIN: 'linkedin', INSTAGRAM: 'instagram', FACEBOOK: 'facebook', TWITTER: 'twitter', TIKTOK: 'tiktok' };
          const redes = (postAtual.providers || []).map(p => invMap[(p.network || p).toString().toUpperCase()]).filter(Boolean);
          const midias = postAtual.media || postAtual.medias || [];
          if (redes.length) dadosRecriar = { texto: postAtual.text || '', redes,
            imagem_url: midias[0] || null, imagens_urls: midias.length > 1 ? midias : undefined,
            tipo: (postAtual.providers || []).some(p => p?.data?.postType === 'REEL') ? 'REEL'
                : (postAtual.providers || []).some(p => p?.data?.postType === 'STORY') ? 'STORY' : 'POST',
            encurtar_link: false };
        }
        if (!dadosRecriar) {
          throw new Error('Não consegui reagendar: o Metricool recusou a alteração' + (erroPut ? ' (' + erroPut.substring(0, 120) + ')' : '')
            + (erroGet ? ' e não foi possível ler o post original (' + erroGet.substring(0, 80) + ')' : '')
            + '. Exclua o post no Metricool e publique de novo pelo Atlantyx.');
        }
        // v3.46: cria o NOVO primeiro e só depois apaga o antigo — antes apagava primeiro e, se a recriação
        // falhasse (ex.: imagem expirada no payload salvo), o post sumia
        Object.assign(payload, dadosRecriar, { data_hora: String(data_hora) });
        const novo = await acoes.publicar();
        try { await mc(`/v2/scheduler/posts/${metricool_id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE'); }
        catch (e) { console.warn('[metricool reagendar] delete antigo falhou:', e.message); novo.aviso_antigo = 'O post antigo (' + metricool_id + ') não foi apagado no Metricool — apague-o lá para não sair duplicado.'; }
        return { reagendado: true, metodo: orig ? 'recriado' : 'recriado_do_metricool', antigo: metricool_id,
          metricool_id: novo.metricool_id, agendado_para: quando.toISOString(), detalhe: novo };
      },

      // v1.7: excluir post agendado (sincroniza exclusão do calendário)
      excluir: async () => {
        const { metricool_id } = payload;
        if (!metricool_id) throw new Error('metricool_id obrigatório');
        const r = await mc(`/v2/scheduler/posts/${metricool_id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE');
        return { excluido: true, metricool_id, resposta: r };
      },

      // Listar posts agendados/publicados
      listar_posts: async () => {
        const ini = payload.inicio || new Date(Date.now() - 30 * 864e5).toISOString().substring(0, 10);
        const fim = payload.fim || new Date(Date.now() + 30 * 864e5).toISOString().substring(0, 10);
        const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${ini}T00:00:00&end=${fim}T23:59:59&timezone=America/Sao_Paulo`, TOKEN);
        const posts = (Array.isArray(r) ? r : (r?.data || [])).map(p => ({
          id: p.id,
          texto: (p.text || '').substring(0, 140),
          data: p.publicationDate?.dateTime || p.publicationDate,
          redes: (p.providers || []).map(x => x.network),
          status: p.published ? 'publicado' : (p.draft ? 'rascunho' : 'agendado'),
          // v3.23: detalhe por rede (status, erro e link público) — usado pelo QA de marketing
          ...(payload.detalhe ? { texto_completo: p.text || '', providers: (p.providers || []).map(x => ({ rede: x.network, status: x.status || x.detailedStatus || null,
            erro: x.error || x.errorMessage || x.detailedStatus || null, url: x.publicUrl || x.url || x.postUrl || x.link || null })), bruto: JSON.stringify(p).substring(0, 1500) } : {}),
        }));
        return { posts, total: posts.length };
      },

      // Métricas por rede — janela de datas
      // payload: { rede: 'linkedin'|'instagram'|'facebook', inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' }
      metricas: async () => {
        const { rede = 'linkedin' } = payload;
        const fim = payload.fim || new Date().toISOString().substring(0, 10);
        const ini = payload.inicio || new Date(Date.now() - 30 * 864e5).toISOString().substring(0, 10);
        const fmt = d => d.replaceAll('-', '');

        // Endpoints de timeline por rede (métricas agregadas diárias)
        const redeEp = {
          linkedin:  `/stats/linkedin/timeline?start=${fmt(ini)}&end=${fmt(fim)}&userId=${USERID}&blogId=${BLOGID}`,
          instagram: `/stats/instagram/timeline?start=${fmt(ini)}&end=${fmt(fim)}&userId=${USERID}&blogId=${BLOGID}`,
          facebook:  `/stats/facebook/timeline?start=${fmt(ini)}&end=${fmt(fim)}&userId=${USERID}&blogId=${BLOGID}`,
        };
        const ep = redeEp[rede.toLowerCase()];
        if (!ep) throw new Error('Rede não suportada: ' + rede);

        const r = await mc(ep, TOKEN);
        return { rede, inicio: ini, fim, dados: r };
      },

      // Métricas dos POSTS individuais (melhor para funil por peça)
      metricas_posts: async () => {
        const { rede = 'linkedin' } = payload;
        if (!['linkedin', 'instagram', 'facebook'].includes(String(rede).toLowerCase())) throw new Error('Rede não suportada: ' + rede);
        const fim = payload.fim || new Date().toISOString().substring(0, 10);
        const ini = payload.inicio || new Date(Date.now() - 30 * 864e5).toISOString().substring(0, 10);
        const m = await _postsMetricasRede(rede, ini, fim, { TOKEN, USERID, BLOGID });
        const semMetrica = m.posts.length > 0 && m.com_metrica === 0;
        let aviso = null;
        if (!m.api_ok) aviso = `O Metricool recusou a consulta de métricas do ${rede} (${m.tentativas.map(t => t.fonte + ': ' + (t.erro || 'ok')).join(' · ')}). Sem acesso à API de analytics as impressões ficam zeradas — verifique se o plano do Metricool inclui API/analytics e se o ${rede} está conectado a este perfil (blogId ${BLOGID}).`;
        else if (!m.posts.length) aviso = `O Metricool não tem publicações do ${rede} com métricas entre ${ini} e ${fim}. Se houve posts, a rede pode não estar conectada ao perfil do Metricool (blogId ${BLOGID}) ou as métricas ainda não foram processadas.`;
        else if (semMetrica) aviso = `O Metricool devolveu ${m.posts.length} publicação(ões) do ${rede}, mas sem nenhuma métrica. Campos recebidos: ${(m.tentativas.find(t => t.ok && t.itens)?.campos || []).join(', ')}. Normalmente é permissão de estatísticas não concedida ao reconectar a rede, ou perfil pessoal (não Business/Creator).`;
        return { rede, inicio: ini, fim, posts: m.posts, total: m.posts.length, totais: m.totais, fonte: m.fonte,
          diagnostico: { sem_metricas: semMetrica, api_ok: m.api_ok, tentativas: m.tentativas, aviso } };
      },
    };

    if (!acoes[action]) return res.status(400).json({ success: false, error: `Ação inválida. Disponíveis: status, ${Object.keys(acoes).join(', ')}` });
    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });

  } catch (error) {
    console.error('[ERRO metricool]', error.message);
    // v3.300: guarda o histórico dos erros de publicação (antes só ficavam no log do Vercel) — tela Marketing › "Erros de publicação"
    const _ac = String(req.body?.action || '');
    if (/publicar|agendar|republicar|story|reel|carrossel|fila/i.test(_ac)) { try { const pl = req.body?.payload || req.body || {}; const L = (await _kvMc('mc:erros_publicacao')) || [];
      L.unshift({ em: new Date().toISOString(), acao: _ac, erro: String(error.message || '').slice(0, 500), dica: error.dica || null, redes: pl.redes || null, tipo: pl.tipo || null, data_hora: pl.data_hora || null, texto: String(pl.texto || '').slice(0, 140), metricool_id: error.metricool_id || null });
      await _kvMc('mc:erros_publicacao', L.slice(0, 200)); } catch (_) {} }
    return res.status(500).json({
      success: false,
      error: error.message, dica: error.dica || null, midias_com_problema: error.midias_com_problema || null, metricool_id: error.metricool_id || null, // v3.300: a tela já lê a dica
      module: 'metricool',
      hint: error.message?.includes('401') || error.message?.includes('403')
        ? 'Token Metricool inválido ou expirado. Regenere em Settings → API no Metricool.'
        : 'Verifique os logs do Vercel para detalhes.',
    });
  }
}

// helper — chamada à API Metricool
async function mc(path, token, method = 'GET', body = null) {
  const r = await fetch(MC_BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Mc-Auth': token,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  let d;
  try { d = JSON.parse(raw); } catch { d = { raw: raw.substring(0, 300) }; }
  if (!r.ok) {
    // v1.68: mensagem do Metricool costuma vir em campos diferentes — mostrar o que houver
    const det = d?.error?.message || d?.message || d?.detail || d?.errors?.[0]?.message
      || (Array.isArray(d?.errors) ? JSON.stringify(d.errors).substring(0, 200) : null)
      || raw.substring(0, 300);
    const err = new Error(`Metricool HTTP ${r.status}: ${det}`);
    if (/media|image|video|file/i.test(det)) err.dica = 'O erro menciona mídia: confirme que a URL da imagem/vídeo é pública e abre fora do sistema.';
    throw err;
  }
  return d;
}

function extrairRedes(marca) {
  const redes = [];
  if (marca.linkedinCompany || marca.linkedin) redes.push('linkedin');
  if (marca.instagram || marca.instagramBusiness) redes.push('instagram');
  if (marca.facebook || marca.facebookPage) redes.push('facebook');
  if (marca.twitter) redes.push('twitter');
  if (marca.tiktok) redes.push('tiktok');
  return redes;
}

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'metricool');
