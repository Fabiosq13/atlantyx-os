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

// v1.80: corrige os posts JÁ AGENDADOS que apontam para imagem efêmera.
// Sem isso, tudo que foi agendado antes desta versão continua falhando na data.
async function corrigirImagensAgendadas({ blog_id, dias = 60, aplicar = false } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID;
  const BLOGID = blog_id || process.env.METRICOOL_BLOG_ID;
  if (!TOKEN || !USERID || !BLOGID) throw new Error('Credenciais do Metricool ausentes');

  const hoje = new Date();
  const ini = hoje.toISOString().substring(0,10).replace(/-/g,'') + '0000';
  const fim = new Date(hoje.getTime() + dias*86400000).toISOString().substring(0,10).replace(/-/g,'') + '2359';
  const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${ini}&end=${fim}`, TOKEN);
  const lista = Array.isArray(r) ? r : (r?.data || r?.posts || []);

  const { garantirPermanente, ehEfemera } = await import('./media.js');
  const afetados = [], corrigidos = [], erros = [];

  for (const p of lista) {
    const midias = p.media || p.medias || [];
    const comProblema = (Array.isArray(midias) ? midias : []).filter(u => ehEfemera(u));
    if (!comProblema.length) continue;
    const quando = p.publicationDate?.dateTime || p.publicationDate || '';
    afetados.push({ id: p.id, data: String(quando).substring(0,16).replace('T',' '),
      texto: String(p.text || '').substring(0, 60), midias: comProblema.length });
    if (!aplicar) continue;
    try {
      const novas = [];
      for (const u of midias) novas.push((await garantirPermanente({ url: u })).url);
      const corpo = { ...p, media: novas, medias: novas };
      await mc(`/v2/scheduler/posts/${p.id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'PUT', corpo);
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
async function auditoriaFunil({ dias = 30 } = {}) {
  const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID, BLOGID = process.env.METRICOOL_BLOG_ID;
  const out = { periodo_dias: dias, posts: {}, leads: {}, problemas: [], recomendacoes: [] };

  // 1. Posts no Metricool: agendados, publicados, com erro
  try {
    const hoje = new Date(), ini = new Date(hoje.getTime() - dias * 86400000);
    const f = d => d.toISOString().substring(0, 10).replace(/-/g, '');
    const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${f(ini)}0000&end=${f(hoje)}2359`, TOKEN);
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
          motivo: errProv.map(x => x.error || x.message || x.errorMessage || 'sem detalhe').join('; ').substring(0, 200) });
      } else if (/publish|sent|done/.test(st)) status.publicado++;
      else if (/draft/.test(st)) status.rascunho++;
      else if (/schedul|pending|queue/.test(st) || !st) status.agendado++;
      else status.outro++;
      const txt = String(p.text || '');
      if (/https?:\/\//i.test(txt) || (p.media && p.media.some(m => /http/.test(String(m))))) comLink.push(p.id); else semLink.push(p.id);
    });
    out.posts = { total: lista.length, ...status, com_link: comLink.length, sem_link: semLink.length, erros: comErro.slice(0, 15) };
    if (comErro.length) out.problemas.push({ g: 'alta', txt: `${comErro.length} publicação(ões) FALHARAM no Metricool nos últimos ${dias} dias.` });
    if (lista.length && semLink.length === lista.length) out.problemas.push({ g: 'alta', txt: `NENHUM dos ${lista.length} posts tem link. O leitor não tem para onde ir — não existe caminho até o formulário.` });
    else if (semLink.length > comLink.length) out.problemas.push({ g: 'media', txt: `${semLink.length} de ${lista.length} posts sem link de captura.` });
    if (!lista.length) out.problemas.push({ g: 'alta', txt: `Nenhum post encontrado no Metricool nos últimos ${dias} dias.` });
  } catch (e) { out.posts = { erro: e.message }; out.problemas.push({ g: 'alta', txt: 'Não consegui ler o Metricool: ' + e.message }); }

  // 2. Leads capturados no período
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const ini = new Date(Date.now() - dias * 86400000).toISOString();
    const leads = await sql`SELECT COUNT(*)::int AS n, MAX(criado_em) AS ultimo FROM leads WHERE criado_em >= ${ini}`;
    const total = await sql`SELECT COUNT(*)::int AS n, MAX(criado_em) AS ultimo FROM leads`;
    const porOrigem = await sql`SELECT COALESCE(data->>'source', data->>'origem', 'sem origem') AS origem, COUNT(*)::int AS n
      FROM leads WHERE criado_em >= ${ini} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;
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
  out.recomendacoes.unshift('Instagram: link no post NÃO é clicável. Coloque o link da bio (abaixo) no perfil — sem isso, nenhum post do Instagram gera lead, por mais que diga "link na bio".');
  try {
    const r = await fetch(base + '/api/lead-capture', { method: 'OPTIONS' });
    out.captura.endpoint_responde = r.status < 500;
  } catch (e) { out.captura.endpoint_responde = false; }
  try {
    const r2 = await fetch(base + '/captura.html', { method: 'HEAD' });
    out.captura.pagina_existe = r2.status === 200;
    if (r2.status !== 200) out.problemas.push({ g: 'alta', txt: 'Não existe uma página pública de captura de lead. Mesmo com link no post, o clique não teria onde cair.' });
  } catch (e) { out.captura.pagina_existe = false; }

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
REGRAS: título de até 6 palavras que para o dedo; uma frase de apoio de até 14 palavras; uma chamada de até 5 palavras
apontando para o link (ex.: "Toque no link", "Arraste para cima"). Sem hashtag, sem emoji além de 1. Português do Brasil.
Devolva SOMENTE JSON: {"titulo":"...","apoio":"...","chamada":"...","oferta":"o que ganha ao clicar, até 8 palavras"}`;
  const user = `Tema: ${tema || 'dados e IA aplicada'}${oferta ? '\nOferta: ' + oferta : ''}`;
  const txt = await _claudeAuto(system, user, 400);
  return JSON.parse(String(txt).replace(/```json|```/g, '').trim());
}
async function storyAgendar({ imagem_url, quando, texto, link, blog_id } = {}) {
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

// ═══ v2.65: agendar UM post já escrito (texto + imagem opcional) no Metricool ═══
// Separado da geração para caber no limite de tempo: escrever, gerar imagem e agendar são três
// chamadas curtas em vez de uma longa.
async function autoCampanhaAgendarUm({ post, blog_id, redes } = {}) {
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
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 50000);
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    // v2.66: Haiku para os textos da autocampanha — o Sonnet levava 8–14s e estourava o limite de
    // 10s do plano Hobby do Vercel ("Failed to fetch" em todo post). Haiku responde em 2–4s.
    body: JSON.stringify({ model: process.env.CLAUDE_MODEL_RAPIDO || 'claude-haiku-4-5-20251001', max_tokens: Math.min(maxTokens, 500), system, messages: [{ role: 'user', content: user }] }) });
  clearTimeout(tm);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude API [' + r.status + ']: ' + (d.error?.message || 'erro'));
  return d.content?.[0]?.text || '';
}

// A configuração vem do frontend (localStorage) ou dos valores padrão — este módulo não
// tem banco próprio, e assim a tela controla tudo sem precisar de migração.
async function autoCampanhaConfig({ salvar } = {}) {
  return {
    horarios: (salvar?.horarios && Array.isArray(salvar.horarios) && salvar.horarios.length) ? salvar.horarios : HORARIOS_PADRAO,
    dias_a_frente: parseInt(salvar?.dias_a_frente) || 7,
    pular_fim_de_semana: salvar?.pular_fim_de_semana !== false,
    redes: salvar?.redes?.length ? salvar.redes : ['linkedin'],
    tema_base: salvar?.tema_base || 'dados, IA aplicada e eficiência operacional para grandes empresas',
    padrao: HORARIOS_PADRAO,
  };
}

// Consulta o Metricool para saber quais horários já têm post agendado
async function _slotsOcupados({ de, ate, blogId }) {
  try {
    const TOKEN = process.env.METRICOOL_USER_TOKEN, USERID = process.env.METRICOOL_USER_ID;
    const BLOGID = blogId || process.env.METRICOOL_BLOG_ID;
    const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}&start=${de.replace(/-/g,'')}0000&end=${ate.replace(/-/g,'')}2359`, TOKEN);
    const lista = Array.isArray(r) ? r : (r?.data || r?.posts || []);
    const ocupados = new Set();
    lista.forEach(p => {
      const dt = p.publicationDate?.dateTime || p.data || p.publicationDate;
      if (!dt) return;
      const s = String(dt);
      const dia = s.substring(0, 10);
      const hora = s.substring(11, 16);
      // v1.74: guarda dia + minuto absoluto. Comparar por PROXIMIDADE evita o furo de gerar
      // marcas de 15 em 15 min (um post às 12:10 não casava com o slot das 12:15).
      const [H, M] = hora.split(':').map(Number);
      ocupados.add(`${dia}|${H * 60 + M}`);
    });
    return { ocupados, total: lista.length, erro: null };
  } catch (e) { return { ocupados: new Set(), total: 0, erro: e.message }; }
}

async function autoCampanhaPlanejar({ dias, horarios, pular_fim_de_semana, blog_id } = {}) {
  const cfg = await autoCampanhaConfig();
  const hs = (Array.isArray(horarios) && horarios.length ? horarios : cfg.horarios)
    .map(h => String(h).trim()).filter(h => /^\d{2}:\d{2}$/.test(h));
  if (!hs.length) throw new Error('Nenhum horário válido (use o formato HH:MM)');
  const nDias = parseInt(dias) || cfg.dias_a_frente;
  const pularFds = pular_fim_de_semana !== undefined ? !!pular_fim_de_semana : cfg.pular_fim_de_semana;

  const hoje = new Date();
  const de = new Date(hoje.getTime() + 86400000).toISOString().split('T')[0];
  const ate = new Date(hoje.getTime() + nDias * 86400000).toISOString().split('T')[0];
  const { ocupados, total, erro } = await _slotsOcupados({ de, ate, blogId: blog_id });

  const vagos = [], jaAgendados = [];
  for (let i = 1; i <= nDias; i++) {
    const d = new Date(hoje.getTime() + i * 86400000);
    const diaSemana = d.getDay();
    if (pularFds && (diaSemana === 0 || diaSemana === 6)) continue;
    const dia = d.toISOString().split('T')[0];
    hs.forEach(h => {
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
    resumo: `${vagos.length} horário(s) vago(s) e ${jaAgendados.length} já preenchido(s) nos próximos ${nDias} dias.` } };
}

// Gera o conteúdo e agenda, um slot por vez
async function autoCampanhaExecutar({ dias, horarios, pular_fim_de_semana, tema, redes, blog_id, apenas_rascunho = false, limite = 21, slots = null } = {}) {
  const _t0 = Date.now();
  const cfg = await autoCampanhaConfig();
  // v2.16: quando o navegador manda `slots`, gera só esses (lote). Evita o "Failed to fetch":
  // 15 posts de uma vez levavam ~90s e a função era cortada pelo limite do Vercel.
  let plano, alvos;
  if (Array.isArray(slots) && slots.length) {
    plano = { vagos: slots, ja_agendados: [], resumo: `lote de ${slots.length}` };
    alvos = slots.slice(0, 5);
  } else {
    ({ plano } = await autoCampanhaPlanejar({ dias, horarios, pular_fim_de_semana, blog_id }));
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
      await mc(`/v2/scheduler/posts?userId=${U}&blogId=${B}&start=${new Date().toISOString().substring(0,10).replace(/-/g,'')}0000&end=${new Date().toISOString().substring(0,10).replace(/-/g,'')}2359`, T);
    } catch (e) {
      if (/401|Authentication/i.test(e.message)) {
        const err = new Error('O Metricool recusou a autenticação (401). Nada foi gerado.');
        err.dica = 'Confira METRICOOL_USER_TOKEN, METRICOOL_USER_ID e METRICOOL_BLOG_ID no Vercel. O token é o "User Token" da conta, não a chave da API.';
        throw err;
      }
    }
  }

  const temaBase = tema || cfg.tema_base;
  const redesAlvo = (Array.isArray(redes) && redes.length ? redes : cfg.redes);
  const criados = [], erros = [];

  for (const slot of alvos) {
    try {
      const system = `Você escreve posts de LinkedIn para a Atlantyx — consultoria brasileira de dados e IA, 17 anos de mercado, clientes como CPFL Energia, Enel e Caixa Capitalização. Público: executivos e gestores de grandes empresas.

REGRAS:
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

Devolva SOMENTE JSON: {"texto":"...","angulo":"em 5 palavras, o ângulo escolhido","oferta":"o que está sendo oferecido, em até 8 palavras"}`;
      const user = `Tema geral: ${temaBase}
Data da publicação: ${slot.data} (${slot.dia_semana}) às ${slot.hora}
${slot.hora < '11:00' ? 'Horário da manhã: pode ser um post mais analítico, para quem abre o feed começando o dia.'
  : slot.hora < '15:00' ? 'Horário do meio-dia: leitura rápida, algo que se lê entre uma reunião e outra.'
  : 'Fim de tarde: bom para reflexão ou balanço, quando o executivo está fechando o dia.'}
Evite repetir o mesmo ângulo de outros posts da semana.`;
      const txt = await _claudeAuto(system, user, 700);
      const j = JSON.parse(String(txt).replace(/```json|```/g, '').trim());
      // v2.15: link de captura com UTM — é o que transforma o post em fonte rastreável de lead
      const base = (process.env.MEDIA_PUBLIC_BASE || 'https://atlantyx-os.vercel.app').replace(/\/$/, '');
      const utm = new URLSearchParams({ utm_source: 'linkedin', utm_medium: 'autocampanha',
        utm_campaign: `${slot.data}_${slot.hora.replace(':', '')}`, utm_content: (j.angulo || '').substring(0, 40).replace(/\s+/g, '-').toLowerCase() });
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
          + `\n\n👉 Link na bio para ${j.oferta || 'conversar'}.\n${j.link_instagram}`;
        j.link_bio = `${base}/captura.html?utm_source=instagram&utm_medium=bio`;
      } else if (temFb && !temLi) {
        j.texto = String(j.texto).replace(/o link est[áa] no primeiro coment[áa]rio\.?/i, '').trim() + `\n\n👉 ${j.link}`;
      }

      if (apenas_rascunho) {
        criados.push({ ...slot, texto: j.texto, angulo: j.angulo, oferta: j.oferta, link: j.link, link_instagram: j.link_instagram, link_bio: j.link_bio, comentario: j.comentario, status: 'rascunho' });
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
        };
        // v1.80: se a autocampanha passar a usar imagem, ela também precisa ser permanente
        if (Array.isArray(body.media) && body.media.length) {
          const { garantirPermanente } = await import('./media.js');
          const conv = [];
          for (const u of body.media) conv.push((await garantirPermanente({ url: u })).url);
          body.media = conv; body.medias = conv;
        }
        const r = await mc(`/v2/scheduler/posts?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'POST', body);
        criados.push({ ...slot, texto: j.texto, angulo: j.angulo, oferta: j.oferta, link: j.link, link_instagram: j.link_instagram, link_bio: j.link_bio, comentario: j.comentario, status: 'agendado', metricool_id: r?.id || r?.data?.id || null });
      }
    } catch (e) { erros.push(`${slot.data} ${slot.hora}: ${e.message}`); }
  }
  return { criados: criados.length, posts: criados, erros, plano,
    resumo: `${criados.length} publicação(ões) ${apenas_rascunho ? 'em rascunho' : 'agendadas'} nos horários vagos.` };
}

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
    autocampanha_config:    () => autoCampanhaConfig(payload),
    corrigir_imagens:       () => corrigirImagensAgendadas(payload),
    auditoria_funil:        () => auditoriaFunil(payload),
    story_texto:            () => storyTexto(payload),
    autocampanha_agendar_um:() => autoCampanhaAgendarUm(payload),
    story_agendar:          () => storyAgendar(payload),
    autocampanha_planejar:  () => autoCampanhaPlanejar(payload),
    autocampanha_executar:  () => autoCampanhaExecutar(payload),
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
              else if (tipo === 'REEL' && !ct.includes('video')) problemas.push(`${url.substring(0,60)} — Reel exige vídeo MP4, veio "${ct}"`);
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
          const corpo = {
            ...postAtual,
            publicationDate: dt,
            text: postAtual.text ?? '',
            providers: postAtual.providers || [],
            ...(postAtual.media ? { media: postAtual.media } : {}),
            ...(postAtual.medias ? { medias: postAtual.medias } : {}),
            draft: false,
          };
          delete corpo.id; delete corpo.uuid; delete corpo.creationDate; delete corpo.publishedDate; delete corpo.status;
          try {
            const r = await mc(`/v2/scheduler/posts/${metricool_id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'PUT', corpo);
            if (r && (r.id || r.data || r.success || r.status === 'ok' || (typeof r === 'object' && !r.error))) {
              return { reagendado: true, metodo: 'atualizado', metricool_id, agendado_para: quando.toISOString(),
                detalhe: 'post completo reenviado com a nova data' };
            }
          } catch (e) { erroPut = e.message; }
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
        try { await mc(`/v2/scheduler/posts/${metricool_id}?userId=${USERID}&blogId=${BLOGID}`, TOKEN, 'DELETE'); }
        catch (e) { console.warn('[metricool reagendar] delete antigo falhou:', e.message); }
        Object.assign(payload, dadosRecriar, { data_hora: quando.toISOString() });
        const novo = await acoes.publicar();
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
        const brutos = Array.isArray(r) ? r : (r?.data || []);
        // v1.42 FIX: cada rede nomeia as métricas de um jeito. O código lia só "impressions",
        // então LinkedIn (impressionCount) e Facebook (post_impressions) sempre davam ZERO.
        // Agora procura em todos os nomes conhecidos e também dentro de sub-objetos comuns.
        const pega = (obj, nomes) => {
          for (const n of nomes) {
            const v = obj?.[n] ?? obj?.metrics?.[n] ?? obj?.insights?.[n] ?? obj?.statistics?.[n] ?? obj?.stats?.[n];
            if (v != null && v !== '') { const num = parseFloat(v); if (!isNaN(num)) return num; }
          }
          return null;
        };
        const posts = brutos.map(p => ({
          id: p.id || p.postId,
          texto: (p.text || p.content || '').substring(0, 120),
          data: p.date || p.publicationDate || p.created,
          impressoes: pega(p, ['impressions','impressionCount','impression_count','post_impressions','views','viewCount','reach','reachCount','organicImpressions']),
          alcance:    pega(p, ['reach','reachCount','post_impressions_unique','uniqueImpressions']),
          cliques:    pega(p, ['clicks','clickCount','click_count','post_clicks','linkClicks','totalClicks']),
          curtidas:   pega(p, ['likes','likeCount','reactions','reactionCount','post_reactions']),
          comentarios: pega(p, ['comments','commentCount','comment_count']),
          compartilhamentos: pega(p, ['shares','shareCount','share_count','reposts']),
          engajamento: pega(p, ['engagement','engagementRate','engagement_rate']),
        }));
        // Diagnóstico: se TODAS as métricas vierem nulas, o problema é de nome de campo ou permissão
        const semMetrica = posts.length > 0 && posts.every(p => p.impressoes == null && p.cliques == null && p.curtidas == null);
        const amostraCampos = brutos.length ? Object.keys(brutos[0]).slice(0, 25) : [];
        return { rede, inicio: ini, fim, posts, total: posts.length,
          diagnostico: { sem_metricas: semMetrica, campos_recebidos: amostraCampos,
            aviso: semMetrica ? `A API do Metricool devolveu ${posts.length} publicação(ões) sem nenhuma métrica. Campos recebidos: ${amostraCampos.join(', ') || '(nenhum)'}. Normalmente é permissão/insights não liberado para o perfil no Metricool, ou o perfil não é uma conta business/creator.` : null } };
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
