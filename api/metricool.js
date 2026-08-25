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

export default async function handler(req, res) {
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
    const { action, payload = {} } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Campo "action" obrigatório' });

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

    // Daqui pra baixo exige credenciais
    if (!TOKEN || !USERID || !BLOGID) {
      return res.status(200).json({
        success: false, configurado: false,
        error: 'Metricool não configurado. Use action=status para instruções.',
      });
    }

    const acoes = {
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

        const body = {
          // v1.8: Story do Instagram/Facebook — provider com data { postType: STORY }
          providers: providers.map(p => {
            if (tipo === 'STORY' && (p === 'INSTAGRAM' || p === 'FACEBOOK')) return { network: p, data: { postType: 'STORY', ...(link_sticker ? { linkSticker: link_sticker } : {}) } };
            if (tipo === 'REEL'  && (p === 'INSTAGRAM' || p === 'FACEBOOK')) return { network: p, data: { postType: 'REEL' } }; // v1.9
            return { network: p };
          }),
          publicationDate: {
            dateTime: quando.toISOString().substring(0, 19),
            timezone: 'America/Sao_Paulo',
          },
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

        const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'POST', body);
        return {
          publicado: true,
          agendado_para: quando.toISOString(),
          redes: providers,
          metricool_id: r?.data?.id || r?.id || null,
          resposta: r,
        };
      },

      // v1.11.2: reagendar post — tenta atualizar a data; se não der (ou sem suporte), recria com o payload original
      reagendar: async () => {
        const { metricool_id, data_hora, payload: orig } = payload;
        if (!metricool_id || !data_hora) throw new Error('metricool_id e data_hora obrigatórios');
        const quando = new Date(data_hora); if (isNaN(quando)) throw new Error('data_hora inválida');
        const dt = { dateTime: quando.toISOString().substring(0, 19), timezone: 'America/Sao_Paulo' };
        // 1) tentativa de update in-place
        let atualizado = false, erroPut = '';
        try {
          const r = await mc(`/v2/scheduler/posts/${metricool_id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'PUT', { publicationDate: dt });
          if (r && (r.id || r.success || r.status === 'ok' || (typeof r === 'object' && !r.error))) atualizado = true;
        } catch (e) { erroPut = e.message; }
        if (atualizado) return { reagendado: true, metodo: 'atualizado', metricool_id, agendado_para: quando.toISOString() };
        // 2) recriar: precisa do payload original
        if (!orig || !orig.redes?.length) throw new Error('Metricool não aceitou alterar a data (' + (erroPut || 'sem retorno') + ') e não há payload original para recriar. Exclua e publique de novo.');
        try { await mc(`/v2/scheduler/posts/${metricool_id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE'); } catch (e) { console.warn('[metricool reagendar] delete antigo falhou:', e.message); }
        // recria com o payload original (mesma montagem de body/providers da action publicar)
        Object.assign(payload, orig, { data_hora: quando.toISOString() });
        const novo = await acoes.publicar();
        return { reagendado: true, metodo: 'recriado', antigo: metricool_id, metricool_id: novo.metricool_id, agendado_para: quando.toISOString(), detalhe: novo };
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
        const fim = payload.fim || new Date().toISOString().substring(0, 10);
        const ini = payload.inicio || new Date(Date.now() - 30 * 864e5).toISOString().substring(0, 10);
        const fmt = d => d.replaceAll('-', '');
        const redeEp = {
          linkedin:  `/stats/linkedin/posts?start=${fmt(ini)}&end=${fmt(fim)}&userId=${USERID}&blogId=${BLOGID}`,
          instagram: `/stats/instagram/posts?start=${fmt(ini)}&end=${fmt(fim)}&userId=${USERID}&blogId=${BLOGID}`,
          facebook:  `/stats/facebook/posts?start=${fmt(ini)}&end=${fmt(fim)}&userId=${USERID}&blogId=${BLOGID}`,
        };
        const ep = redeEp[rede.toLowerCase()];
        if (!ep) throw new Error('Rede não suportada: ' + rede);
        const r = await mc(ep, TOKEN);
        const posts = (Array.isArray(r) ? r : (r?.data || [])).map(p => ({
          id: p.id || p.postId,
          texto: (p.text || p.content || '').substring(0, 120),
          data: p.date || p.publicationDate || p.created,
          impressoes: p.impressions ?? p.reach ?? 0,
          cliques: p.clicks ?? 0,
          curtidas: p.likes ?? p.reactions ?? 0,
          comentarios: p.comments ?? 0,
          compartilhamentos: p.shares ?? 0,
          engajamento: p.engagement ?? null,
        }));
        return { rede, inicio: ini, fim, posts, total: posts.length };
      },
    };

    if (!acoes[action]) return res.status(400).json({ error: `Ação inválida. Disponíveis: status, ${Object.keys(acoes).join(', ')}` });
    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });

  } catch (error) {
    console.error('[ERRO metricool]', error.message);
    return res.status(500).json({
      error: error.message,
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
  if (!r.ok) throw new Error(`Metricool HTTP ${r.status}: ${d?.error?.message || d?.message || raw.substring(0, 200)}`);
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
