// api/s2-creative.js
// S2 · Agentes de Marketing Digital Criativo
// Designer · Copywriter · Storyteller · Social Media · Motion · DM · Inbound · Outbound · FinOps

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { action, payload = {} } = req.body;

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
      // PIPELINE COMPLETO
      campanha_completa: () => campanhaCompleta(payload),
    };

    if (!acoes[action]) return res.status(400).json({ error: `Ação inválida. Disponíveis: ${Object.keys(acoes).join(', ')}` });
    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, timestamp: new Date().toISOString(), ...resultado });

  } catch (error) {
    console.error('[ERRO s2-creative]', error.message);
    return res.status(500).json({ error: error.message });
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
  estilo_visual: 'Clean, data-driven, premium. Similar ao padrão EY: fundo escuro ou branco, dados em destaque, sem poluição visual. Formas geométricas simples.',
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

Retorne:
{
  "tema_central": "o fio condutor emocional e racional da campanha",
  "problema_escolhido": "qual dor específica esta campanha toca",
  "angulo_narrativo": "o ponto de vista único — como contamos a história",
  "jornada_do_heroi": "o decisor é o herói, a Atlantyx é o guia. Descreva o arco: Situação → Problema → Transformação → Resultado",
  "gancho_principal": "a frase de abertura que para o scroll",
  "promessa_central": "o que o decisor vai ganhar — concreto e mensurável",
  "prova_social": "como validamos a promessa (dado, case, resultado)",
  "call_to_action": "o próximo passo que pedimos",
  "tom_para_esta_campanha": "variação do tom da Atlantyx para este objetivo específico",
  "palavras_proibidas": ["clichês e termos que não usar nesta campanha"],
  "referencias_visuais": "descrição do mood visual que complementa esta narrativa",
  "adaptacoes_por_canal": {
    "linkedin": "como adaptar para LinkedIn (mais racional, dados, case)",
    "instagram": "como adaptar para Instagram (mais visual, impacto rápido)",
    "youtube": "como adaptar para YouTube (narrativa longa, educacional)",
    "email": "como adaptar para e-mail (personalizado, direto)"
  }
}`;

  const r = await claude(system, user, 2000);
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
Versões: ${versoes}

Retorne:
{
  "versoes": [
    {
      "versao": 1,
      "estilo": "Provocativo / Consultivo / Data-driven / Case / Pergunta",
      "headline": "título principal (max 10 palavras)",
      "subheadline": "complemento (max 15 palavras)",
      "corpo": "texto completo da peça — parágrafos curtos, no máximo 150 palavras",
      "cta": "call to action específico",
      "hashtags": ["#hashtag1", "#hashtag2"],
      "caracteres_total": 0,
      "nota_qualidade": 0-10,
      "por_que_funciona": "argumento técnico de copy"
    }
  ],
  "versao_recomendada": 1,
  "notas_para_designer": "briefing para o agente designer",
  "notas_para_motion": "briefing se virar video"
}`;

  const r = await claude(system, user, 2500);
  const copy = parseJSON(r);
  console.log(`[S2-Copywriter] ${copy.versoes?.length || 0} versões criadas para ${canal}`);
  return { copy, agente: 'S2-Copywriter' };
}

// ── S2 DESIGNER — Especificação Visual das Peças ─────────────────────────────
async function agDesigner({ copy, canal, formato, dimensoes }) {
  const system = `Você é o Agente Designer da Atlantyx — especialista em design B2B premium.
Estilo visual: ${BRAND.estilo_visual}
Cores OBRIGATÓRIAS: ${BRAND.cores} — use sempre azul navy #1A3A8F e azul elétrico #4F7CFF.
Fontes: ${BRAND.fontes}
Referência: padrão EY/McKinsey — clean, data-driven, premium, fundo escuro ou branco.

REGRAS DO PROMPT IDEOGRAM:
1. O prompt_ia_imagem deve ser em inglês, detalhado e incluir: (a) cenário específico, (b) paleta de cores exata, (c) elementos de dados/gráficos, (d) estilo visual corporativo.
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
- Estética: EY/McKinsey — limpo, premium, data-driven
- SEMPRE incluir elemento visual de dados: gráfico, linha, número em destaque, dashboard

Retorne:
{
  "brief_visual": "descrição completa da peça em linguagem de design",
  "conceito_visual": "a ideia visual central que diferencia esta peça",
  "layout": {
    "estrutura": "descrição do layout — grid, hierarquia visual",
    "zona_titulo": "posição, tamanho, cor, fonte do título",
    "zona_corpo": "posição, tamanho, cor, fonte do corpo",
    "zona_logo": "posicionamento do logo Atlantyx",
    "zona_cta": "design do botão/chamada de ação",
    "zona_dados": "se houver gráfico ou número em destaque — como apresentar"
  },
  "paleta_esta_peca": ["#cor1", "#cor2", "#cor3"],
  "elementos_graficos": ["elemento 1", "elemento 2"],
  "imagem_ou_ilustracao": "descrição detalhada de imagem/ilustração para esta peça ou 'não usar'",
  "prompt_ia_imagem": "Descreva APENAS a cena visual em inglês — SEM nenhum texto na imagem. NÃO inclua palavras como 'text overlay', 'typography', 'reading', 'bold text'. Descreva: (1) CENA: ambiente corporativo concreto baseado no copy, ex: 'C-level executive in dark modern office analyzing live data dashboards'; (2) COMPOSICAO: posicoes, iluminacao, enquadramento; (3) ELEMENTOS VISUAIS: telas, graficos, interface digital, dados em movimento. Apenas descricao visual pura — o texto sera adicionado pelo usuario no Canva",
  "animacao_sugerida": "se tiver versão animada — descrição da animação",
  "adaptacoes_formato": {
    "stories": "adaptação para Stories 1080x1920",
    "banner": "adaptação para banner LinkedIn 1584x396",
    "capa_youtube": "adaptação para thumbnail YouTube 1280x720"
  },
  "ferramentas_sugeridas": ["Figma", "Canva Pro", "Adobe Express"],
  "tempo_producao_estimado": "X horas",
  "checklist_qualidade": ["item 1", "item 2", "item 3"]
}`;

  const r = await claude(system, user, 2000);
  const design = parseJSON(r);
  console.log(`[S2-Designer] Especificação de design criada: ${formato} para ${canal}`);
  return { design, agente: 'S2-Designer' };
}

// ── S2 MOTION DESIGNER — Vídeos ───────────────────────────────────────────────
async function agMotion({ copy, narrativa, duracao, tipo }) {
  const system = `Você é o Agente Motion Designer da Atlantyx.
Referência de estilo: EY Consulting — vídeos clean, dados animados, tipografia forte, fundo escuro, cortes rápidos.
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
  "benchmark_estilo": "referência de estilo visual similar ao padrão EY",
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
async function campanhaCompleta({ campanha, objetivo, canal, orcamento, publico, contexto }) {
  const etapas = [];

  // 1. Storyteller
  const { narrativa } = await agStoryteller({ campanha, objetivo, canal, publico, contexto });
  etapas.push({ agente: 'Storyteller', status: 'CONCLUÍDO', output: narrativa.tema_central });

  // 2. Copywriter
  const { copy } = await agCopywriter({ narrativa, canal });
  etapas.push({ agente: 'Copywriter', status: 'CONCLUÍDO', output: copy.versoes?.[0]?.headline });

  // 3. Designer
  const { design } = await agDesigner({ copy, canal });
  etapas.push({ agente: 'Designer', status: 'CONCLUÍDO', output: design.conceito_visual });

  // 4. Social Post agendado
  const { post } = await agSocialPost({ copy, design, rede: canal });
  etapas.push({ agente: 'Social Media', status: 'AGUARDANDO_APROVAÇÃO', output: 'Post pronto para aprovação no Kanban' });

  console.log(`[S2-Campanha] Pipeline completo criado: ${campanha}`);
  return {
    campanha: { nome: campanha, objetivo, canal, orcamento },
    etapas,
    narrativa,
    copy,
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
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Erro Claude API');
  return d.content[0].text;
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
