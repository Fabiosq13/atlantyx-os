// api/s2-creative.js
// S2 · Agentes de Marketing Digital Criativo
// Designer · Copywriter · Storyteller · Social Media · Motion · DM · Inbound · Outbound · FinOps

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Preflight: checar envvars críticas ANTES de tentar chamar IA
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[s2-creative] ANTHROPIC_API_KEY ausente no Vercel');
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY não configurada no Vercel',
      hint: 'Vá em Vercel Settings → Environment Variables → adicione ANTHROPIC_API_KEY',
      module: 's2-creative',
    });
  }

  try {
    const { action, payload = {} } = req.body || {};
    if (!action) return res.status(400).json({ error: 'Campo "action" obrigatório no body' });

    const acoes = {
      // CRIAÇÃO
      storyteller:      () => agStoryteller(payload),
      copywriter:       () => agCopywriter(payload),
      designer:         () => agDesigner(payload),
      motion:           () => agMotion(payload),
      // SOCIAL MEDIA
      social_post:      () => agSocialPost(payload),
      social_monitor:   () => agSocialMonitor(payload),
      dm_response:      () => agDMResponse(payload),
      // INBOUND
      email_marketing:  () => agEmailMarketing(payload),
      email_cadencia:   () => agEmailCadencia(payload),
      // OUTBOUND
      google_ads:       () => agGoogleAds(payload),
      linkedin_ads:     () => agLinkedinAds(payload),
      seo_analise:      () => agSEO(payload),
      // GESTÃO
      finops:           () => agFinOps(payload),
      hubspot_agendar:  () => agendarHubSpot(payload),
      // v1.7: plano automático de 3 publicações otimizadas por métricas
      campanha_auto: async () => {
        const { contexto = '', metricas_resumo = '', redes = ['linkedin','instagram','facebook'] } = payload;
        const sys = `Você é o estrategista de social media B2B da Atlantyx (${BRAND.proposta_valor}). Tom: ${BRAND.tom_de_voz}. ICP: ${BRAND.icp}.
Sua tarefa: planejar 3 publicações de MÁXIMA CONVERSÃO (gerar cliques e reuniões agendadas), combinando:
(a) benchmarks de mercado B2B (LinkedIn: ter-qui 9h-11h30 e 17h; Instagram: ter/qui 11h-13h e 18h-19h; Facebook: qua-qui 9h-12h; evitar seg cedo e sex tarde),
(b) as MÉTRICAS REAIS da conta fornecidas abaixo (dias/horários e temas que mais performaram têm prioridade sobre o benchmark).
Cada copy: max 110 palavras, específica da Atlantyx, com dado concreto, SEM clichês (proibido: revolucionar, disruptivo, game-changer), terminando com CTA de reunião.
Responda APENAS JSON válido.`;
        const usr = `MÉTRICAS DA CONTA (Metricool, últimos 30 dias):
${metricas_resumo || '(sem dados suficientes — use apenas benchmarks de mercado B2B)'}

CONTEXTO ADICIONAL: ${contexto || 'captação de leads e reuniões para a Atlantyx'}
REDES-ALVO: ${redes.join(', ')}

Gere exatamente este JSON:
{"posts":[{"titulo":"nome curto da publicação","texto":"copy completa pronta para publicar (max 110 palavras, com CTA de reunião no fim)","dia_semana":"segunda|terca|quarta|quinta|sexta","hora":"HH:MM","justificativa":"1 frase: por que este slot/tema converte (cite a métrica ou benchmark)","prompt_imagem":"cena visual em inglês 40-60 palavras, SEM texto na imagem, dark navy #1A3A8F + electric blue #4F7CFF, ambiente corporativo com dados/dashboards"}]}
Regras: 3 posts, dias/horários DIFERENTES entre si, temas complementares (dor → prova/case → oferta de reunião).`;
        const rr = await claude(sys, usr, 2400);
        const plano = parseJSON(rr);
        if (!plano.posts?.length) throw new Error('IA não retornou posts válidos' + (plano.raw ? ' (resposta truncada)' : ''));
        return { posts: plano.posts.slice(0, 3) };
      },

      // v1.9: REEL (slideshow) — 5 slides p/ TOPO de funil (descoberta) + legenda com hashtags
      reel_pack: async () => {
        const { narrativa = {}, copy = {}, canal = 'Instagram', n_slides = 5 } = payload;
        const v0 = copy.versoes?.[0] || {};
        const base = (v0.headline ? v0.headline + '\n' : '') + (v0.corpo || copy.raw || '').substring(0, 900);
        const n = Math.max(3, Math.min(6, parseInt(n_slides) || 5));
        const sys = `Você é o Social Media da Atlantyx (${BRAND.proposta_valor}). Tom: ${BRAND.tom_de_voz}. ICP: ${BRAND.icp}. Reels são TOPO DE FUNIL: alcançam quem NÃO segue — o 1º slide precisa parar o dedo em 1 segundo. Responda APENAS JSON válido.`;
        const usr = `NARRATIVA: ${narrativa.tema_central || ''} | Gancho: ${narrativa.gancho_principal || ''}
COPY BASE:\n${base}

Crie um Reel em SLIDESHOW de ${n} slides (9:16, ~3s cada). Regras: cada slide tem no MÁXIMO 12 palavras na tela, ideia única, linguagem direta; slide 1 = gancho forte (pergunta/dado/contraste), slides do meio = insight/prova, último = CTA ("Siga" ou "Link na bio"). Sem clichês (proibido: revolucionar, disruptivo, game-changer). Legenda: até 120 palavras, começa com o gancho, termina com CTA "🔗 Link na bio", + 5-8 hashtags B2B relevantes no fim.
JSON: {"slides":[{"ordem":1,"texto_tela":"...","destaque":"palavra ou número a destacar (opcional)","prompt_imagem":"cena vertical 9:16 em inglês, 35-55 palavras, SEM texto na imagem, dark navy #1A3A8F + electric blue #4F7CFF, área central limpa"}],"legenda":"...","hashtags":["#..."],"trilha_sugerida":"tipo de música/ritmo em 5 palavras"}`;
        const rr = await claude(sys, usr, 1900);
        const pk = parseJSON(rr);
        if (!pk.slides?.length) throw new Error('Reel pack inválido' + (pk.raw ? ' (truncado)' : ''));
        return { slides: pk.slides.slice(0, 6), legenda: pk.legenda || '', hashtags: pk.hashtags || [], trilha_sugerida: pk.trilha_sugerida || '' };
      },

      // v1.8: STORY — adapta a campanha para 3 stories sequenciais (9:16) com texto curto e link
      story_pack: async () => {
        const { narrativa = {}, copy = {}, link = '', canal = 'Instagram' } = payload;
        const v0 = copy.versoes?.[0] || {};
        const base = (v0.headline ? v0.headline + '\n' : '') + (v0.corpo || copy.raw || '').substring(0, 900);
        const sys = `Você é o Social Media da Atlantyx (${BRAND.proposta_valor}). Tom: ${BRAND.tom_de_voz}. Stories são vistos por quem JÁ SEGUE — foco em conversão (clique no link) e proximidade. Responda APENAS JSON válido.`;
        const usr = `NARRATIVA: ${narrativa.tema_central || ''} | Gancho: ${narrativa.gancho_principal || ''}
COPY BASE:\n${base}
LINK (sticker do último story): ${link || '(sem link)'}

Crie 3 stories em sequência (9:16). Regras: cada story tem no MÁXIMO 18 palavras na tela; frases curtas, uma ideia por story; o 1º prende (pergunta ou dado), o 2º entrega valor/prova, o 3º chama pra ação com o link. Sem clichês. Sem hashtags.
JSON: {"stories":[{"ordem":1,"papel":"gancho","texto_tela":"...","cta_sticker":"","prompt_imagem":"cena vertical 9:16 em inglês, 35-55 palavras, SEM texto na imagem, dark navy #1A3A8F + electric blue #4F7CFF, área central limpa para sobrepor texto"},{"ordem":2,"papel":"valor",...},{"ordem":3,"papel":"cta","cta_sticker":"texto curto do sticker de link (ex: Agende sua conversa)",...}]}`;
        const rr = await claude(sys, usr, 1600);
        const pk = parseJSON(rr);
        if (!pk.stories?.length) throw new Error('Story pack inválido' + (pk.raw ? ' (truncado)' : ''));
        return { stories: pk.stories.slice(0, 3) };
      },

      // v1.7.2: plano de impulsionamento (Meta Ads) para um post orgânico vencedor
      plano_impulso: async () => {
        const { texto = '', cliques = 0, rede = 'facebook', link = '' } = payload;
        const sys = `Você é o gestor de tráfego pago B2B da Atlantyx (${BRAND.proposta_valor}). ICP: ${BRAND.icp}. Responda APENAS JSON válido, conciso (campos de 1-2 frases).`;
        const usr = `Este post orgânico performou bem (${cliques} cliques em ${rede}) e será IMPULSIONADO no Meta Ads:
"${texto.substring(0, 600)}"
Link de destino: ${link}

Gere o plano de impulsionamento em JSON:
{"objetivo_campanha":"Tráfego|Leads|Conversões — qual e por quê (1 frase)",
"cta_botao":"o CTA ideal do Meta (ex: Agendar horário)",
"segmentacao":{"cargos":["..."],"setores":["..."],"interesses":["..."],"faixa_etaria":"XX-XX","localizacao":"sugestão"},
"orcamento_diario_brl":número,
"duracao_dias":número,
"headline_anuncio":"título curto p/ o anúncio (max 8 palavras)",
"justificativa":"por que essa configuração maximiza reuniões (1-2 frases)"}`;
        const rr = await claude(sys, usr, 900);
        const plano = parseJSON(rr);
        if (plano.raw) throw new Error('Plano truncado — tente novamente');
        return { plano };
      },

      // v1.6.1: mede a velocidade real da API Anthropic nesta conta/modelo
      diagnostico_ia: async () => {
        const t0 = Date.now();
        const resp = await claude('Responda APENAS a palavra OK, nada mais.', 'ping', 20);
        return { modelo: MODEL, envvar_CLAUDE_MODEL: process.env.CLAUDE_MODEL || '(vazia — usando fallback)', resposta: resp.substring(0, 20), tempo_ms: Date.now() - t0 };
      },

      // PIPELINE COMPLETO
      campanha_completa: () => campanhaCompleta(payload),
      // v1.6: pipeline em 2 fases — cada request curto, imune a 504
      campanha_fase1:    () => campanhaFase1(payload),
      campanha_fase2:    () => campanhaFase2(payload),
    };

    if (!acoes[action]) return res.status(400).json({ error: `Ação inválida. Disponíveis: ${Object.keys(acoes).join(', ')}` });

    const t0 = Date.now();
    const resultado = await acoes[action]();
    console.log(`[s2-creative] ${action} OK em ${Date.now()-t0}ms`);
    return res.status(200).json({ success: true, action, timestamp: new Date().toISOString(), ...resultado });

  } catch (error) {
    // Log completo (Vercel Runtime Logs)
    console.error('[ERRO s2-creative]', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join(' | '),
      cause: error.cause,
    });
    // Resposta detalhada para o frontend/debug
    return res.status(500).json({
      error: error.message,
      module: 's2-creative',
      hint: error.message?.includes('Claude API')
        ? 'Erro da API Anthropic. Verifique se ANTHROPIC_API_KEY é válida e se o modelo CLAUDE_MODEL existe (atual: ' + MODEL + ')'
        : error.message?.includes('parseJSON') || error.message?.includes('JSON')
        ? 'A resposta da IA não veio em JSON válido. Verifique nos logs do Vercel a resposta bruta.'
        : 'Verifique os logs do Vercel para stack completo',
      stack_preview: error.stack?.split('\n').slice(0, 3),
    });
  }
}

// ── CONTEXTO BASE DA ATLANTYX ─────────────────────────────────────────────────
const BRAND = {
  empresa: 'Atlantyx',
  segmento: 'BI, Engenharia de Dados e IA para grandes empresas',
  tom_de_voz: 'Direto, confiante, técnico mas acessível, sem jargões desnecessários. Não usamos frases feitas ou clichês de startup.',
  icp: 'CIO, CTO, CFO, Diretor de TI e Transformação Digital em empresas com R$100M–R$5B, setores: Energia, Automotivo, Varejo, Indústria',
  proposta_valor: 'Transformamos dados complexos em inteligência acionável — Quick Wins em semanas, integra com sistemas existentes, ROI mensurável',
  problema_central: 'Empresas tomam decisões com dados atrasados ou inconsistentes, gerando perda financeira real',
  cores: 'Azul profundo (#1A3A8F), azul elétrico (#4F7CFF), branco, cinza escuro. Sem cores berrantes.',
  fontes: 'Syne (títulos, bold, moderna), DM Sans (corpo, clean)',
  estilo_visual: 'Clean, data-driven, premium. Fundo escuro, dados em destaque, sem poluição visual. Formas geométricas simples. Paleta: azul navy #1A3A8F + azul elétrico #4F7CFF.',
  redes: ['LinkedIn', 'Instagram', 'YouTube', 'Facebook'],
};

// ── S2 STORYTELLER — Narrativa Estratégica ────────────────────────────────────
async function agStoryteller({ campanha, objetivo, canal, publico, contexto }) {
  const system = `Você é o Agente Storyteller da Atlantyx — especialista em narrativas estratégicas B2B.
Sua missão: criar a narrativa que o Copywriter e o Designer vão transformar em peças concretas.
Tom da Atlantyx: ${BRAND.tom_de_voz}
Problema que a Atlantyx resolve: ${BRAND.problema_central}
Retorne APENAS JSON válido.`;

  const user = `Crie a narrativa estratégica para:
Campanha: ${campanha || 'Prospecção de grandes contas'}
Objetivo: ${objetivo || 'Gerar interesse e reuniões com C-levels'}
Canal: ${canal || 'LinkedIn + Instagram'}
Público: ${publico || BRAND.icp}
${contexto ? 'INSTRUCAO PRIORITARIA - siga exatamente: ' + contexto + '. Esta instrucao deve guiar TODA a narrativa.' : 'Contexto: prospeccao ativa B2B no ICP da Atlantyx.'}

SEJA CONCISO: cada campo em NO MÁXIMO 1-2 frases. Retorne:
{
  "tema_central": "fio condutor (1-2 frases)",
  "problema_escolhido": "dor específica (1 frase)",
  "angulo_narrativo": "ponto de vista único (1 frase)",
  "gancho_principal": "frase de abertura que para o scroll",
  "promessa_central": "ganho concreto e mensurável (1 frase)",
  "prova_social": "validação: dado/case (1 frase)",
  "call_to_action": "próximo passo (1 frase)",
  "tom_para_esta_campanha": "variação do tom (1 frase)",
  "referencias_visuais": "mood visual em 1 frase"
}`;

  const r = await claude(system, user, 900);
  const narrativa = parseJSON(r);
  console.log(`[S2-Storyteller] Narrativa criada: "${narrativa.tema_central}"`);
  return { narrativa, agente: 'S2-Storyteller' };
}

// ── S2 COPYWRITER — Textos das Campanhas ─────────────────────────────────────
async function agCopywriter({ narrativa, formato, canal, versoes = 3, copy_anterior, ajuste_comentario } = {}, payload = {}) {
  const system = `Você é o Agente Copywriter da Atlantyx — especialista em copy B2B para grandes empresas.
Tom: ${BRAND.tom_de_voz}
ICP: ${BRAND.icp}
Proposta de valor: ${BRAND.proposta_valor}

REGRAS ABSOLUTAS DO COPY:
1. SEMPRE mencione "Atlantyx" no corpo do texto ou no CTA — o leitor precisa saber quem fala
2. NUNCA escreva copy genérico que poderia ser de qualquer empresa — seja específico da Atlantyx
3. O copy deve RESOLVER uma dor real do ICP, não apenas apresentar a empresa
4. Inclua sempre um dado concreto ou resultado mensurável
5. CTA deve ser específico: "Fale com a Atlantyx", "Agende com a Atlantyx", etc.
NUNCA use: "revolucionar", "disruptivo", "game-changer", "solução inovadora", emojis em excesso.
Retorne APENAS JSON válido.`;

  const user = `Escreva o copy para:
Formato: ${formato || 'post LinkedIn'}
Canal: ${canal || 'LinkedIn'}
Narrativa base: ${JSON.stringify(narrativa || { tema_central: 'Dados inconsistentes custam caro', gancho_principal: 'Quantas decisões ruins sua empresa tomou este mês por causa de dados atrasados?' })}
${copy_anterior ? 'Copy anterior (melhore este): ' + copy_anterior : ''}
${ajuste_comentario ? 'INSTRUCAO DE AJUSTE — siga exatamente: ' + ajuste_comentario : ''}
Versões: 2 (uma provocativa, uma consultiva). SEJA CONCISO — corpo com no máximo 110 palavras.

Retorne:
{
  "versoes": [
    {
      "versao": 1,
      "estilo": "Provocativo | Consultivo",
      "headline": "título (max 10 palavras)",
      "subheadline": "complemento (max 12 palavras)",
      "corpo": "texto da peça — parágrafos curtos, MAX 110 palavras",
      "cta": "call to action específico",
      "hashtags": ["#h1", "#h2", "#h3"]
    }
  ],
  "versao_recomendada": 1
}`;

  const r = await claude(system, user, 1400);
  const copy = parseJSON(r);
  // FIX v1.5.7: se o JSON veio truncado/inválido, garantir versoes utilizáveis (nunca mais "--")
  if (copy.raw && !copy.versoes) {
    copy.versoes = [{ headline: '', corpo: copy.raw.substring(0, 1500), cta: '' }];
    console.warn('[S2-Copywriter] JSON truncado — usando raw como corpo');
  }
  console.log(`[S2-Copywriter] ${copy.versoes?.length || 0} versões criadas para ${canal}`);
  return { copy, agente: 'S2-Copywriter' };
}

// ── S2 DESIGNER — Especificação Visual das Peças ─────────────────────────────
async function agDesigner({ copy, canal, formato, dimensoes }) {
  const system = `Você é o Agente Designer da Atlantyx — especialista em design B2B premium.
Estilo visual: ${BRAND.estilo_visual}
Cores OBRIGATÓRIAS: ${BRAND.cores} — use sempre azul navy #1A3A8F e azul elétrico #4F7CFF.
Fontes: ${BRAND.fontes}
Referência visual: clean, data-driven, premium, fundo escuro, dados em destaque — SEM mencionar marcas ou nomes de empresas.

REGRAS DO PROMPT IDEOGRAM:
1. O prompt_ia_imagem deve ser em inglês, descrevendo APENAS a cena visual: (a) ambiente e pessoas, (b) paleta de cores: dark navy #1A3A8F + electric blue #4F7CFF, (c) elementos de dados/gráficos animados nas telas, (d) composição e iluminação. PROIBIDO: mencionar EY, McKinsey, Accenture ou qualquer marca. PROIBIDO: incluir texto, tipografia, palavras ou letras na imagem.
2. NUNCA gere prompt genérico — seja específico ao contexto do copy aprovado.
3. Inclua sempre: dark navy blue #1A3A8F, electric blue #4F7CFF, bold white typography.
Retorne APENAS JSON válido.`;

  const user = `Crie a especificação completa de design para:
Canal: ${canal || 'LinkedIn'}
Formato: ${formato || 'post carrossel'}
Dimensões: ${dimensoes || '1080x1080px'}
Copy aprovado: ${JSON.stringify(copy?.versoes?.[0] || { headline: 'Dados inconsistentes custam caro', corpo: 'Sua empresa toma decisões críticas com dados que chegam 3 dias atrasados.' })}

IDENTIDADE VISUAL OBRIGATÓRIA:
- Fundo: azul navy profundo (#1A3A8F) ou branco puro
- Destaque: azul elétrico (#4F7CFF) para dados e gráficos
- Logo: "Atlantyx" em destaque — fonte Syne bold branca
- Estética: premium B2B, limpo, data-driven, sem logos ou marcas de terceiros
- SEMPRE incluir elemento visual de dados: gráfico, linha, número em destaque, dashboard

SEJA CONCISO — cada campo texto em no máximo 2 frases. Retorne:
{
  "conceito_visual": "a ideia visual central (max 2 frases)",
  "brief_visual": "descrição da peça em linguagem de design (max 3 frases)",
  "layout": { "estrutura": "grid e hierarquia (1 frase)", "zona_titulo": "1 frase", "zona_dados": "1 frase" },
  "paleta_esta_peca": ["#cor1", "#cor2", "#cor3"],
  "prompt_ia_imagem": "cena visual em inglês, 40-70 palavras, SEM texto/tipografia na imagem: (1) ambiente corporativo concreto baseado no copy; (2) composição e iluminação; (3) telas/gráficos/dados. Cores: dark navy #1A3A8F + electric blue #4F7CFF"
}`;

  const r = await claude(system, user, 1100);
  const design = parseJSON(r);
  // FIX v1.5.1: se o JSON veio truncado/inválido, parseJSON devolve {raw}.
  // Garante que os campos usados pelo frontend nunca fiquem vazios.
  if (design.raw && !design.conceito_visual && !design.prompt_ia_imagem) {
    design.conceito_visual = design.raw.substring(0, 800);
    design.prompt_ia_imagem = 'Premium B2B corporate scene: executive in dark modern office with glowing data dashboards. Dark navy #1A3A8F background, electric blue #4F7CFF accents, cinematic lighting, photorealistic, no text.';
    console.warn('[S2-Designer] JSON truncado — usando fallback de conceito/prompt');
  }
  console.log(`[S2-Designer] Especificação de design criada: ${formato} para ${canal} (prompt=${(design.prompt_ia_imagem||'').length} chars)`);
  return { design, agente: 'S2-Designer' };
}

// ── S2 MOTION DESIGNER — Vídeos ───────────────────────────────────────────────
async function agMotion({ copy, narrativa, duracao, tipo }) {
  const system = `Você é o Agente Motion Designer da Atlantyx.
Referência de estilo: Premium B2B corporate — vídeos clean, dados animados, tipografia forte, fundo escuro, cortes rápidos.
Padrão: https://www.youtube.com/watch?v=0r5YDowCCQ0
Estilo Atlantyx: ${BRAND.estilo_visual}
Retorne APENAS JSON válido.`;

  const user = `Crie o roteiro e especificação de motion para:
Tipo: ${tipo || 'Reels LinkedIn/Instagram'}
Duração: ${duracao || '30 segundos'}
Copy base: ${JSON.stringify(copy?.versoes?.[0] || { headline: 'Dados inconsistentes custam caro', corpo: 'Decisões erradas por dados atrasados.' })}
Narrativa: ${JSON.stringify(narrativa?.jornada_do_heroi || 'CIO descobre que seus dados chegam 3 dias atrasados. Isso custa caro.')}

Retorne:
{
  "conceito_video": "ideia central do vídeo em uma frase",
  "estilo_edicao": "tipo de edição — rápido/corporativo/narrativo/testimonial",
  "scenes": [
    {
      "cena": 1,
      "duracao": "X segundos",
      "visual": "o que aparece na tela — elementos, cores, tipografia",
      "texto_tela": "texto que aparece na tela",
      "naracao": "narração em off se houver",
      "musica_mood": "humor musical desta cena",
      "transicao": "tipo de transição para próxima cena"
    }
  ],
  "elementos_motion": ["elemento animado 1", "elemento animado 2"],
  "tipografia_animada": "como o texto entra/sai",
  "paleta_video": ["#cor1", "#cor2"],
  "musica_referencia": "estilo musical sugerido (sem citar artistas específicos)",
  "benchmark_estilo": "premium B2B corporate — dark navy, electric blue, clean data visualization",
  "ferramentas_producao": ["After Effects", "Premiere Pro", "CapCut Pro"],
  "prompt_ia_video": "prompt para geração via RunwayML/Pika se necessário",
  "formatos_exportar": ["9:16 (Reels/Stories)", "1:1 (Feed)", "16:9 (YouTube/LinkedIn)"],
  "checklist_pre_publicacao": ["item 1", "item 2"]
}`;

  const r = await claude(system, user, 2000);
  const motion = parseJSON(r);
  console.log(`[S2-Motion] Roteiro criado: ${duracao} para ${tipo}`);
  return { motion, agente: 'S2-Motion' };
}

// ── S2 SOCIAL POST — Criação e Programação ───────────────────────────────────
async function agSocialPost({ copy, design, rede, data_hora, canal_hubspot }) {
  // Preparar o post para publicação
  const versao = copy?.versoes?.[0] || {};
  const post = {
    rede: rede || 'LinkedIn',
    data_hora_publicacao: data_hora || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    texto: versao.corpo || '',
    headline: versao.headline || '',
    hashtags: versao.hashtags || [],
    cta: versao.cta || '',
    design_ref: design?.brief_visual || '',
    status: 'AGUARDANDO_APROVACAO',
  };

  // Criar no HubSpot como social post agendado
  if (process.env.HUBSPOT_TOKEN) {
    await criarSocialPostHubSpot(post);
  }

  console.log(`[S2-Social] Post preparado para ${rede} — ${post.data_hora_publicacao}`);
  return {
    post,
    agente: 'S2-SocialMedia',
    proximo_passo: 'Aguardando aprovação no Kanban. Após aprovação será agendado automaticamente.',
    instrucoes_publicacao: {
      linkedin: 'Acessar LinkedIn → New Post → Colar texto → Anexar imagem do Designer → Agendar',
      instagram: 'Buffer/Later → Novo post → Colar texto → Anexar arte → Agendar',
      automatico: 'Configure BUFFER_TOKEN ou HOOTSUITE_TOKEN no Vercel para publicação automática',
    },
  };
}

// ── S2 SOCIAL MONITOR — Métricas ─────────────────────────────────────────────
async function agSocialMonitor({ periodo = '7 dias' }) {
  const system = `Você é o Agente de Social Media Monitor da Atlantyx.
Analise métricas de social media e gere insights acionáveis.
Retorne APENAS JSON válido.`;

  const user = `Gere um relatório de monitoramento de social media da Atlantyx (${periodo}):
Contexto: empresa B2B de BI/Dados/IA, ICP: C-levels de grandes empresas.

Retorne:
{
  "periodo": "${periodo}",
  "resumo": "headline de uma frase do período",
  "metricas_linkedin": {
    "impressoes": 0,
    "alcance": 0,
    "engajamento": "X%",
    "cliques": 0,
    "novos_seguidores": 0,
    "posts_publicados": 0,
    "melhor_post": "descrição do post com mais engajamento"
  },
  "metricas_instagram": {
    "impressoes": 0,
    "alcance": 0,
    "engajamento": "X%",
    "novos_seguidores": 0,
    "stories_views": 0
  },
  "insights": ["insight 1", "insight 2", "insight 3"],
  "conteudo_que_funcionou": ["tipo 1", "tipo 2"],
  "conteudo_que_nao_funcionou": ["tipo 1"],
  "recomendacoes": ["ação 1", "ação 2"],
  "proximos_posts_sugeridos": [
    {"tema": "...", "formato": "...", "melhor_horario": "..."}
  ]
}`;

  const r = await claude(system, user, 1200);
  const metricas = parseJSON(r);
  return { metricas, agente: 'S2-SocialMonitor' };
}

// ── S2 DM RESPONSE — Respostas de Direct Message ─────────────────────────────
async function agDMResponse({ mensagem, rede, perfil_remetente, historico }) {
  const system = `Você é o Agente de DM da Atlantyx — responde direct messages em qualquer rede social.
Tom: ${BRAND.tom_de_voz}
ICP: ${BRAND.icp}
Missão: converter interesse em reunião ou avançar o relacionamento.
NUNCA revelar que é IA. NUNCA forçar a venda. Seja consultivo.
Retorne APENAS JSON válido.`;

  const user = `Analise e responda este DM:
Rede: ${rede || 'LinkedIn'}
Mensagem recebida: "${mensagem || ''}"
Perfil do remetente: ${perfil_remetente || 'desconhecido'}
Histórico da conversa: ${historico || 'primeiro contato'}

Retorne:
{
  "analise_intencao": "o que o remetente quer/sente",
  "oportunidade_comercial": "Alta | Média | Baixa | Nenhuma",
  "sentimento": "Positivo | Neutro | Negativo | Dúvida",
  "resposta_sugerida": "texto completo da resposta — natural, humana, max 5 linhas",
  "proximo_passo": "o que a resposta tenta obter",
  "tags_crm": ["tag1", "tag2"],
  "encaminhar_para": "Vendas S7 | Continuar DM | Enviar material | Propor reunião | Aguardar",
  "urgencia": "Alta | Média | Baixa"
}`;

  const r = await claude(system, user, 800);
  const dm = parseJSON(r);

  // Se oportunidade alta, notificar S7
  if (dm.oportunidade_comercial === 'Alta') {
    await whatsapp(process.env.FUNDADOR_WHATSAPP,
      `[S2-DM · Oportunidade em ${rede}]\n\nRemetente: ${perfil_remetente}\nOportunidade: ${dm.oportunidade_comercial}\n\nMensagem: "${mensagem?.substring(0, 100)}"\n\nResposta preparada no painel.`
    );
  }

  return { dm, agente: 'S2-DM' };
}

// ── S2 EMAIL MARKETING ────────────────────────────────────────────────────────
async function agEmailMarketing({ tipo, assunto, segmento, objetivo }) {
  const system = `Você é o Agente de Email Marketing da Atlantyx.
Tom: ${BRAND.tom_de_voz}
ICP: ${BRAND.icp}
Padrão: e-mails B2B clean, sem imagens pesadas, foco no texto e no CTA.
Retorne APENAS JSON válido.`;

  const user = `Crie o e-mail de marketing:
Tipo: ${tipo || 'Newsletter semanal'}
Assunto: ${assunto || 'Dados que chegam atrasados custam quanto?'}
Segmento: ${segmento || 'CIOs e CTOs de grandes empresas'}
Objetivo: ${objetivo || 'Gerar clique e agendar reunião'}

Retorne:
{
  "assunto_principal": "assunto do e-mail — max 9 palavras",
  "assunto_alternativo": "variação A/B test",
  "preheader": "texto de preview (max 90 chars)",
  "estrutura": {
    "abertura": "parágrafo de abertura — personalizado, relevante, max 3 linhas",
    "problema": "parágrafo do problema — dor específica do segmento",
    "solucao": "como a Atlantyx resolve — sem pitch excessivo",
    "prova": "dado, case ou resultado que valida",
    "cta_principal": "texto do botão principal",
    "cta_secundario": "link de texto opcional",
    "assinatura": "assinatura personalizada do remetente"
  },
  "html_estrutura": "descrição do layout HTML do e-mail",
  "metricas_alvo": {"abertura": "X%", "clique": "X%", "resposta": "X%"},
  "melhor_horario_envio": "dia e hora ideais",
  "segmentacao_lista": "critérios de segmentação recomendados",
  "tags_hubspot": ["tag1", "tag2"]
}`;

  const r = await claude(system, user, 1500);
  const email = parseJSON(r);
  console.log(`[S2-Email] E-mail criado: "${email.assunto_principal}"`);
  return { email, agente: 'S2-EmailMarketing' };
}

// ── S2 EMAIL CADÊNCIA ─────────────────────────────────────────────────────────
async function agEmailCadencia({ objetivo, segmento, num_emails = 5, intervalo_dias = 3 }) {
  const system = `Você é o Agente de Cadência de E-mails da Atlantyx.
Crie sequências de e-mail que nutrem o lead até a reunião.
Tom: consultivo, nunca agressivo. Cada e-mail tem um único objetivo.
Retorne APENAS JSON válido.`;

  const user = `Crie uma cadência de ${num_emails} e-mails:
Objetivo: ${objetivo || 'Converter lead frio em reunião comercial'}
Segmento: ${segmento || 'CIO/CTO de empresa de energia'}
Intervalo: ${intervalo_dias} dias entre e-mails

Para cada e-mail retorne:
{
  "cadencia": [
    {
      "email": 1,
      "dia": 0,
      "objetivo": "o que este e-mail busca",
      "assunto": "assunto otimizado para abertura",
      "tipo": "Provocação | Valor | Case | Prova Social | Urgência | Breakup",
      "texto_completo": "corpo completo do e-mail — max 150 palavras, tom humano",
      "cta": "ação pedida",
      "se_abriu_mas_nao_clicou": "variação para reengajamento"
    }
  ],
  "logica_automacao": "como configurar no HubSpot/RD Station",
  "taxa_abertura_esperada": "X%",
  "taxa_resposta_esperada": "X%",
  "criterios_saida": ["quando parar a cadência — ex: respondeu, agendou, opt-out"]
}`;

  const r = await claude(system, user, 3000);
  const cadencia = parseJSON(r);
  console.log(`[S2-Cadência] Cadência de ${cadencia.cadencia?.length || 0} e-mails criada`);
  return { cadencia, agente: 'S2-EmailCadencia' };
}

// ── S2 GOOGLE ADS ─────────────────────────────────────────────────────────────
async function agGoogleAds({ campanha, keywords, orcamento, objetivo }) {
  const system = `Você é o Agente de Google Ads da Atlantyx — especialista em campanhas B2B search/display.
ICP: ${BRAND.icp}
Retorne APENAS JSON válido.`;

  const user = `Crie a estrutura completa de campanha Google Ads:
Campanha: ${campanha || 'Prospecção BI e Analytics para grandes empresas'}
Keywords base: ${keywords || 'BI empresarial, analytics corporativo, engenharia de dados'}
Orçamento: ${orcamento || 'R$5.000/mês'}
Objetivo: ${objetivo || 'Leads qualificados — CIOs e CTOs'}

Retorne:
{
  "nome_campanha": "...",
  "tipo_campanha": "Search | Display | Performance Max",
  "objetivo_google": "Leads | Tráfego | Conversões",
  "orcamento_diario": "R$X",
  "bid_strategy": "Target CPA | Maximize Conversions | Target ROAS",
  "grupos_de_anuncios": [
    {
      "nome": "nome do grupo",
      "keywords": ["keyword 1", "keyword 2"],
      "match_types": "Exata | Frase | Ampla modificada",
      "negative_keywords": ["keyword negativa 1"],
      "anuncios": [
        {
          "headline_1": "max 30 chars",
          "headline_2": "max 30 chars",
          "headline_3": "max 30 chars",
          "descricao_1": "max 90 chars",
          "descricao_2": "max 90 chars",
          "url_final": "https://atlantyx.com.br/...",
          "extensoes": {"sitelinks": ["link1", "link2"], "callouts": ["callout1"]}
        }
      ]
    }
  ],
  "publico_alvo": {
    "segmentacao_in_market": ["B2B Software", "Enterprise Software"],
    "remarketing": "usuários que visitaram o site",
    "exclusoes": ["pequenas empresas", "estudantes"]
  },
  "landing_page_brief": "o que a LP precisa ter para converter",
  "kpis_meta": {"cpc_max": "R$X", "cpa_alvo": "R$X", "taxa_conversao_alvo": "X%"},
  "estimativas": {"impressoes_mes": 0, "cliques_mes": 0, "leads_mes": 0}
}`;

  const r = await claude(system, user, 2500);
  const ads = parseJSON(r);
  console.log(`[S2-GoogleAds] Campanha criada: "${ads.nome_campanha}"`);
  return { ads, agente: 'S2-GoogleAds' };
}

// ── S2 LINKEDIN ADS ───────────────────────────────────────────────────────────
async function agLinkedinAds({ campanha, segmentacao, orcamento, formato }) {
  const system = `Você é o Agente de LinkedIn Ads da Atlantyx — especialista em campanhas B2B.
ICP: ${BRAND.icp}
LinkedIn é o canal mais importante para o ICP da Atlantyx.
Retorne APENAS JSON válido.`;

  const user = `Crie a estrutura completa de campanha LinkedIn Ads:
Campanha: ${campanha || 'Prospecção C-Level Energia e Indústria'}
Segmentação: ${segmentacao || 'CIO, CTO, Diretor de TI — empresas 500+ funcionários — Energia, Automotivo, Varejo'}
Orçamento: ${orcamento || 'R$5.000/mês'}
Formato: ${formato || 'Single Image + Lead Gen Form'}

Retorne:
{
  "nome_campanha": "...",
  "objetivo": "Lead Generation | Brand Awareness | Website Visits",
  "orcamento_diario": "R$X",
  "bid": "Automated | Manual CPC | CPM",
  "segmentacao": {
    "cargos": ["CIO", "CTO", "Diretor de TI"],
    "setores": ["Energia", "Automotivo", "Varejo", "Indústria"],
    "tamanho_empresa": "501-1000, 1001-5000, 5001-10000+",
    "localizacao": "Brasil — SP, RJ, MG prioritários",
    "exclusoes": ["estudantes", "autônomos"]
  },
  "anuncios": [
    {
      "nome": "nome do anúncio",
      "formato": "Single Image | Carousel | Video | Document",
      "headline": "max 70 chars",
      "descricao": "max 150 chars",
      "cta_botao": "Download | Learn More | Sign Up | Request Demo",
      "visual_descricao": "o que a imagem/video deve mostrar",
      "lead_gen_form": {
        "titulo": "...",
        "descricao": "...",
        "campos": ["Nome", "E-mail corporativo", "Empresa", "Cargo", "Telefone"],
        "mensagem_confirmacao": "..."
      }
    }
  ],
  "kpis_meta": {"cpm": "R$X", "ctr_alvo": "X%", "cpl_alvo": "R$X", "leads_mes": 0},
  "a_b_test": "o que testar entre anúncios",
  "retargeting": "estratégia de remarketing para quem interagiu"
}`;

  const r = await claude(system, user, 2000);
  const liads = parseJSON(r);
  console.log(`[S2-LinkedInAds] Campanha criada: "${liads.nome_campanha}"`);
  return { liads, agente: 'S2-LinkedInAds' };
}

// ── S2 SEO ANÁLISE ────────────────────────────────────────────────────────────
async function agSEO({ url, foco, concorrentes }) {
  const system = `Você é o Agente de SEO da Atlantyx.
Analise e otimize o posicionamento orgânico para o ICP B2B de grandes empresas.
Retorne APENAS JSON válido.`;

  const user = `Análise SEO completa para:
Site: ${url || 'atlantyx.com.br'}
Foco: ${foco || 'BI corporativo, analytics para grandes empresas, engenharia de dados'}
Concorrentes: ${concorrentes || 'Totvs, MicroStrategy, Tableau, Power BI, empresas de consultoria de dados'}

Retorne:
{
  "diagnostico": "situação atual do SEO em 3 linhas",
  "keywords_prioritarias": [
    {"keyword": "...", "volume_estimado": "X/mês", "dificuldade": "Alta|Média|Baixa", "intencao": "Informacional|Comercial|Transacional", "pagina_alvo": "..."}
  ],
  "keywords_long_tail": ["keyword longa 1", "keyword longa 2"],
  "otimizacoes_on_page": [
    {"pagina": "...", "problema": "...", "solucao": "..."}
  ],
  "conteudo_sugerido": [
    {"titulo": "...", "keyword_foco": "...", "formato": "Blog|Guia|Case|Comparativo", "estimativa_palavras": 0}
  ],
  "backlinks_estrategia": ["ação 1", "ação 2"],
  "technical_seo": ["ajuste técnico 1", "ajuste técnico 2"],
  "kpis_seo": {"posicao_media_alvo": "X-Y", "trafego_organico_meta": "X/mês", "conversao_alvo": "X%"},
  "timeline": "X meses para ver resultados significativos"
}`;

  const r = await claude(system, user, 2000);
  const seo = parseJSON(r);
  console.log(`[S2-SEO] Análise concluída para ${url}`);
  return { seo, agente: 'S2-SEO' };
}

// ── S2 MARKETING FINOPS ───────────────────────────────────────────────────────
async function agFinOps({ investimentos, periodo }) {
  const system = `Você é o Agente de Marketing FinOps da Atlantyx.
Monitore o ROI de cada canal e otimize o budget para máximo retorno.
Retorne APENAS JSON válido.`;

  const user = `Análise FinOps do marketing da Atlantyx (${periodo || 'mês atual'}):
Investimentos: ${JSON.stringify(investimentos || {
  linkedin_ads: 5000,
  google_ads: 5000,
  producao_conteudo: 2000,
  ferramentas: 1000,
  total: 13000
})}

Retorne:
{
  "total_investido": "R$X",
  "total_receita_influenciada": "R$X",
  "roi_marketing": "X%",
  "por_canal": [
    {
      "canal": "LinkedIn Ads",
      "investimento": "R$X",
      "leads": 0,
      "oportunidades": 0,
      "receita_influenciada": "R$X",
      "cpl": "R$X",
      "roi": "X%",
      "avaliacao": "Manter | Escalar | Reduzir | Pausar",
      "justificativa": "..."
    }
  ],
  "budget_recomendado_proximo_mes": {
    "linkedin_ads": "R$X",
    "google_ads": "R$X",
    "producao_conteudo": "R$X",
    "ferramentas": "R$X",
    "total": "R$X"
  },
  "realocacoes_sugeridas": ["mover R$X do canal A para canal B porque..."],
  "alertas": ["canal com CPL acima do aceitável", "budget esgotando"],
  "economia_potencial": "R$X/mês com otimizações"
}`;

  const r = await claude(system, user, 1500);
  const finops = parseJSON(r);
  console.log(`[S2-FinOps] Análise FinOps: ROI ${finops.roi_marketing}`);
  return { finops, agente: 'S2-FinOps' };
}

// ── CAMPANHA COMPLETA — todos os agentes em sequência ─────────────────────────
// v1.6: FASE 1 — Storyteller + Copywriter (2 calls sequenciais, ~8-15s)
async function campanhaFase1({ campanha, objetivo, canal, publico, contexto }) {
  const { narrativa } = await agStoryteller({ campanha, objetivo, canal, publico, contexto });
  const { copy } = await agCopywriter({ narrativa, canal });
  console.log(`[S2-Campanha] Fase 1 OK: ${campanha}`);
  return { narrativa, copy, fase: 1 };
}

// v1.6: FASE 2 — Designer ‖ Copy-por-rede em paralelo + post (1 nível de call, ~8-15s)
async function campanhaFase2({ campanha, canal, narrativa, copy, redes = [] }) {
  if (!copy) throw new Error('Fase 2 requer narrativa e copy da Fase 1');
  const redesValidas = (redes || []).filter(r => ['linkedin','instagram','facebook','whatsapp','email'].includes(r));

  const pDesigner = agDesigner({ copy, canal });
  const pPorRede = (async () => {
    if (!redesValidas.length) return {};
    try {
      const base = copy.versoes?.[0] || {};
      const baseTexto = (base.headline ? base.headline + '\n\n' : '') + (base.corpo || copy.raw || '');
      const sys = 'Você é o Copywriter da Atlantyx. Adapte a copy abaixo para cada rede, respeitando formato e tom nativos de cada uma. Responda APENAS JSON válido, sem markdown.';
      const usr = `COPY BASE:\n${baseTexto.substring(0, 1800)}\n\nNARRATIVA: ${narrativa?.tema_central || ''}\n\nGere JSON exatamente neste formato para as redes [${redesValidas.join(', ')}]:\n{${redesValidas.map(rd => rd === 'email' ? '"email": {"assunto": "...", "texto": "..."}' : `"${rd}": {"texto": "..."}`).join(', ')}}\n\nRegras por rede: linkedin = profissional, 1200-2200 chars, 3-5 hashtags no fim; instagram = leve, emojis moderados, até 1500 chars, hashtags; facebook = conversacional, até 900 chars; whatsapp = direto e pessoal, até 500 chars, sem hashtag; email = assunto curto (max 60 chars) + texto 400-800 chars.`;
      const rr = await claude(sys, usr, 1800);
      const parsed = parseJSON(rr);
      return parsed.raw ? {} : parsed;
    } catch (e) {
      console.warn('[S2-Campanha] copy_por_rede falhou:', e.message);
      return {};
    }
  })();

  const [{ design }, copy_por_rede] = await Promise.all([pDesigner, pPorRede]);
  const { post } = await agSocialPost({ copy, design, rede: canal });
  console.log(`[S2-Campanha] Fase 2 OK: ${campanha} (redes: ${redesValidas.join(',') || 'nenhuma'})`);
  return { design, copy_por_rede, post, fase: 2 };
}

async function campanhaCompleta({ campanha, objetivo, canal, orcamento, publico, contexto, redes = [] }) {
  const etapas = [];

  // 1. Storyteller
  const { narrativa } = await agStoryteller({ campanha, objetivo, canal, publico, contexto });
  etapas.push({ agente: 'Storyteller', status: 'CONCLUÍDO', output: narrativa.tema_central });

  // 2. Copywriter
  const { copy } = await agCopywriter({ narrativa, canal });
  etapas.push({ agente: 'Copywriter', status: 'CONCLUÍDO', output: copy.versoes?.[0]?.headline });

  // 3+5. v1.5.9: Designer e Copy-por-rede dependem APENAS do copy →
  // rodam EM PARALELO (corta ~25-35% do tempo total e evita 504)
  const redesValidas = (redes || []).filter(r => ['linkedin','instagram','facebook','whatsapp','email'].includes(r));

  const pDesigner = agDesigner({ copy, canal });

  const pPorRede = (async () => {
    if (!redesValidas.length) return {};
    try {
      const base = copy.versoes?.[0] || {};
      const baseTexto = (base.headline ? base.headline + '\n\n' : '') + (base.corpo || copy.raw || '');
      const sys = 'Você é o Copywriter da Atlantyx. Adapte a copy abaixo para cada rede, respeitando formato e tom nativos de cada uma. Responda APENAS JSON válido, sem markdown.';
      const usr = `COPY BASE:\n${baseTexto.substring(0, 1800)}\n\nNARRATIVA: ${narrativa.tema_central || ''}\n\nGere JSON exatamente neste formato para as redes [${redesValidas.join(', ')}]:\n{${redesValidas.map(rd => rd === 'email' ? '"email": {"assunto": "...", "texto": "..."}' : `"${rd}": {"texto": "..."}`).join(', ')}}\n\nRegras por rede: linkedin = profissional, 1200-2200 chars, 3-5 hashtags no fim; instagram = leve, emojis moderados, até 1500 chars, hashtags; facebook = conversacional, até 900 chars; whatsapp = direto e pessoal, até 500 chars, sem hashtag; email = assunto curto (max 60 chars) + texto 400-800 chars.`;
      const rr = await claude(sys, usr, 1800);
      const parsed = parseJSON(rr);
      return parsed.raw ? {} : parsed; // truncou → segue sem, frontend usa copy base
    } catch (e) {
      console.warn('[S2-Campanha] copy_por_rede falhou (segue com copy base):', e.message);
      return {};
    }
  })();

  const [{ design }, copy_por_rede] = await Promise.all([pDesigner, pPorRede]);
  etapas.push({ agente: 'Designer', status: 'CONCLUÍDO', output: design.conceito_visual });
  etapas.push({ agente: 'Copywriter (por rede)', status: Object.keys(copy_por_rede).length ? 'CONCLUÍDO' : 'FALLBACK (copy base)', output: Object.keys(copy_por_rede).join(', ') || 'copy base' });

  // 4. Social Post agendado (montagem local, sem IA)
  const { post } = await agSocialPost({ copy, design, rede: canal });
  etapas.push({ agente: 'Social Media', status: 'AGUARDANDO_APROVAÇÃO', output: 'Post pronto para aprovação no Kanban' });

  console.log(`[S2-Campanha] Pipeline completo criado: ${campanha} (redes: ${redesValidas.join(',') || 'nenhuma'})`);
  return {
    campanha: { nome: campanha, objetivo, canal, orcamento },
    etapas,
    narrativa,
    copy,
    copy_por_rede,
    design,
    post,
    status: 'AGUARDANDO_APROVACAO_KANBAN',
    agentes_acionados: ['Storyteller', 'Copywriter', 'Designer', 'Social Media'],
  };
}

// ── SALVAR NO HUBSPOT ─────────────────────────────────────────────────────────
async function criarSocialPostHubSpot(post) {
  if (!process.env.HUBSPOT_TOKEN) return;
  try {
    await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
      body: JSON.stringify({
        properties: {
          hs_note_body: `[S2-Marketing · Post Agendado]\n\nRede: ${post.rede}\nData: ${post.data_hora_publicacao}\nStatus: ${post.status}\n\n${post.texto}`,
          hs_timestamp: new Date().toISOString(),
        }
      })
    });
  } catch (e) { console.log('[HubSpot] Erro:', e.message); }
}

async function agendarHubSpot({ tipo, titulo, data, responsavel, descricao }) {
  if (!process.env.HUBSPOT_TOKEN) return { aviso: 'HUBSPOT_TOKEN não configurado' };
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      properties: {
        hs_task_subject: `[Marketing] ${titulo}`,
        hs_task_body: descricao || '',
        hs_task_status: 'NOT_STARTED',
        hs_task_type: 'TODO',
        hs_timestamp: new Date(data || Date.now()).toISOString(),
      }
    })
  });
  const d = await r.json();
  return { task_id: d.id, status: 'Agendado no HubSpot', titulo };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
async function claude(system, user, maxTokens = 1000) {
  const t0 = Date.now();
  let r, d;
  // v1.6.1: timeout de 25s por chamada — se a Anthropic pendurar, falha COM MENSAGEM
  // em vez de segurar a função até o Vercel matar em 60s (504 mudo)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      signal: ctrl.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timer);
    const ms = Date.now() - t0;
    if (fetchErr.name === 'AbortError') {
      console.error('[claude TIMEOUT 25s]', { model: MODEL, ms });
      throw new Error(`Anthropic não respondeu em 25s (modelo: ${MODEL}). API lenta ou modelo pesado — verifique a envvar CLAUDE_MODEL no Vercel (recomendado: claude-sonnet-4-6 ou vazio).`);
    }
    console.error('[claude fetch fail]', fetchErr.message);
    throw new Error('Falha ao conectar à API Anthropic: ' + fetchErr.message);
  }
  clearTimeout(timer);

  const ms = Date.now() - t0;
  const rawText = await r.text();
  try {
    d = JSON.parse(rawText);
  } catch {
    console.error('[claude non-JSON response]', { status: r.status, body: rawText.substring(0, 500) });
    throw new Error(`Claude API HTTP ${r.status} — resposta não é JSON: ${rawText.substring(0, 200)}`);
  }

  if (!r.ok) {
    const msg = d?.error?.message || d?.error?.type || `HTTP ${r.status}`;
    console.error('[claude API error]', {
      http_status: r.status,
      error_type: d?.error?.type,
      error_msg: d?.error?.message,
      model_used: MODEL,
      response_ms: ms,
    });
    throw new Error(`Claude API [${r.status}]: ${msg} (modelo: ${MODEL})`);
  }

  const text = d?.content?.[0]?.text;
  if (!text) {
    console.error('[claude empty response]', { status: r.status, data: JSON.stringify(d).substring(0, 300) });
    throw new Error('Claude retornou resposta vazia (content[0].text não existe)');
  }
  console.log(`[claude ok] ${ms}ms · model=${MODEL} · out_tokens≈${Math.round(text.length/4)}`);

  console.log(`[claude OK] ${MODEL} em ${ms}ms, ${text.length} chars`);
  return text;
}

function parseJSON(text) {
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return { raw: text.substring(0, 500) };
  }
}

async function whatsapp(phone, message) {
  if (!phone || !process.env.ZAPI_INSTANCE) return;
  try {
    await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone, message }),
    });
  } catch (e) { console.log('[WA]', e.message); }
}
