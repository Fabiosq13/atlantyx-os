// api/s1-strategy.js
// S1 — Planejamento Estratégico + Linha de Produtos
// 10 agentes: Captação → Viabilidade → Pesquisa → Financeiro → Comitê → Fundador → Handoff → GP → OKR → Relatórios

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { action } = req.body;

    const acoes = {
      captar_ideia:       () => captarIdeia(req.body),
      analisar_ideia:     () => analisarIdeia(req.body),
      pesquisa_mercado:   () => pesquisaMercado(req.body),
      modelagem_financeira: () => modelagemFinanceira(req.body),
      parecer_comite:     () => parecerComite(req.body),
      notificar_fundador: () => notificarFundador(req.body),
      handoff_dev:        () => handoffDev(req.body),
      status_okr:         () => statusOKR(req.body),
      relatorio_executivo: () => relatorioExecutivo(req.body),
      fundador_decide:    () => fundadorDecide(req.body),
    };

    if (!acoes[action]) return res.status(400).json({ error: `Ação inválida. Disponíveis: ${Object.keys(acoes).join(', ')}` });

    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });

  } catch (error) {
    console.error('[ERRO s1-strategy]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── S1-01: CAPTAÇÃO DE IDEIAS ────────────────────────────────────────────────
async function captarIdeia({ titulo, descricao, origem, categoria }) {
  if (!titulo) throw new Error('titulo é obrigatório');

  const system = `Você é o Agente S1-01 de Captação de Ideias da Atlantyx.
Sua missão: receber qualquer ideia de produto e estruturá-la de forma padronizada para análise.
A Atlantyx é empresa de BI, Dados e IA para grandes empresas.
Retorne APENAS JSON válido.`;

  const user = `Estruture esta ideia para entrada no pipeline:
Título: ${titulo}
Descrição: ${descricao || 'não fornecida'}
Origem: ${origem || 'time interno'}
Categoria: ${categoria || 'nova funcionalidade'}

Retorne:
{
  "titulo_estruturado": "título claro e objetivo",
  "problema_que_resolve": "problema específico que esta ideia resolve",
  "cliente_alvo": "segmento de cliente que mais se beneficia",
  "categoria": "Nova Funcionalidade | Melhoria | Novo Produto | Integração | Infraestrutura",
  "urgencia": "Alta | Média | Baixa",
  "proxima_etapa": "Análise de Viabilidade",
  "tags": ["tag1", "tag2"],
  "resumo_executivo": "2 frases para o fundador entender rapidamente"
}`;

  const r = await claude(system, user, 800);
  const ideia = parseJSON(r);

  // Notificar squad
  await whatsapp(process.env.FUNDADOR_WHATSAPP,
    `[S1-01 · Nova Ideia Captada]\n\n${ideia.titulo_estruturado}\n\nProblema: ${ideia.problema_que_resolve}\nCliente: ${ideia.cliente_alvo}\nUrgência: ${ideia.urgencia}\n\nEntrou no pipeline para análise.`
  );

  return { ideia, pipeline_stage: 'Recebida' };
}

// ── S1-02: ANÁLISE DE VIABILIDADE ───────────────────────────────────────────
async function analisarIdeia({ titulo, desc, descricao, origem, cat, perguntas, modo, tem_arquivos, docs_nomes, imagensBase64, ideia_id, problema }) {
  const tituloFinal = titulo || 'Ideia sem título';
  const descFinal   = desc || descricao || problema || '';
  const modoFinal   = modo || 'completa';

  const system = `Você é o Agente S1-03 de Análise Profunda de Produto da Atlantyx.
Analise a ideia com profundidade real — não seja genérico.
Contexto da Atlantyx: empresa de BI/Dados/IA, 1 dev senior, 1 fundador, ICP = empresas R$100M+ com dados complexos.
Seja honesto e direto — inclua pontos negativos reais se existirem.
Retorne APENAS JSON válido.`;

  const modoPrompt = modoFinal === 'rapida'
    ? 'Análise rápida e objetiva em 5 pontos principais.'
    : modoFinal === 'financeira'
    ? 'Foque apenas na viabilidade financeira: custos, receita potencial, prazo de retorno, riscos financeiros.'
    : 'Análise completa e profunda em todas as dimensões.';

  const user = `${modoPrompt}

Ideia para análise:
Título: ${tituloFinal}
Descrição: ${descFinal}
Origem: ${origem || 'Não informada'}
Categoria: ${cat || 'Não informada'}
${tem_arquivos ? 'ARQUIVOS ANEXADOS para análise: ' + (docs_nomes || '') + (imagensBase64?.length ? ' + ' + imagensBase64.length + ' imagem(ns)' : '') : ''}
${perguntas ? 'PERGUNTAS ESPECÍFICAS DO SOLICITANTE: ' + perguntas : ''}

Retorne JSON completo:
{
  "score": 0-10,
  "recomendacao": "APROVAR | PILOTAR | REANALISAR | ARQUIVAR",
  "resumo_executivo": "2 linhas — o que é e por que importa (ou não)",
  "pontos_fortes": ["ponto forte 1 específico", "ponto forte 2"],
  "riscos": ["risco real 1", "risco real 2"],
  "mercado": "TAM estimado, concorrentes principais, janela de oportunidade",
  "viabilidade_financeira": "custo de dev, receita potencial ano 1, tempo de payback",
  "prazo_desenvolvimento": "prazo realista para MVP com 1 dev senior",
  "fit_icp": "Alto | Médio | Baixo — justificativa de 1 linha",
  "proximos_passos": ["ação 1 com responsável e prazo", "ação 2"],
  "analise_arquivos": "${tem_arquivos ? 'Análise do conteúdo dos arquivos anexados — o que revelam sobre a ideia' : 'Nenhum arquivo anexado'}",
  "perguntas_respondidas": "${perguntas ? 'Respostas específicas para: ' + perguntas : 'Nenhuma pergunta específica'}",
  "parecer_final": "Parecer detalhado do agente S1-03 — 3-4 linhas com posição clara e fundamentada"
}`;

  // Montar mensagem — incluir imagens se houver
  let messages;
  if (imagensBase64 && imagensBase64.length > 0) {
    const content = [
      ...imagensBase64.slice(0, 4).map(img => ({
        type: 'image',
        source: img.source || { type: 'base64', media_type: img.type || 'image/jpeg', data: img.data || (img.base64 || '').split(',')[1] || '' }
      })),
      { type: 'text', text: user }
    ];
    messages = [{ role: 'user', content }];
  } else {
    messages = [{ role: 'user', content: user }];
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2500, system, messages })
  });
  const d = await resp.json();
  if (!resp.ok) throw new Error(d.error?.message || 'Erro Claude');

  const analise = parseJSON(d.content[0].text);
  console.log(`[S1-03] Análise: ${tituloFinal} — score ${analise.score}/10 — ${analise.recomendacao}`);
  return { success: true, analise, pipeline_stage: 'Em Análise' };
}

// ── S1-03: PESQUISA DE MERCADO ───────────────────────────────────────────────
async function pesquisaMercado({ titulo, descricao, cliente_alvo }) {
  const system = `Você é o Agente S1-03 de Pesquisa de Mercado da Atlantyx.
Realize uma pesquisa aprofundada sobre o mercado desta ideia de produto.
Foque em dados realistas para o contexto de BI/Dados/IA no Brasil e grandes empresas.
Retorne APENAS JSON válido.`;

  const user = `Pesquise o mercado para:
Produto: ${titulo}
Descrição: ${descricao}
Cliente Alvo: ${cliente_alvo || 'grandes empresas brasileiras'}

Retorne:
{
  "tam": "Tamanho total do mercado (R$)",
  "sam": "Mercado endereçável pela Atlantyx (R$)",
  "som": "Fatia realista em 3 anos (R$)",
  "concorrentes": [
    { "nome": "...", "posicionamento": "...", "fraqueza": "..." }
  ],
  "preco_referencia": { "min": "R$X/mês", "medio": "R$X/mês", "max": "R$X/mês" },
  "tendencias": ["tendência 1", "tendência 2"],
  "validacao_icp": "Como este produto se encaixa no ICP da Atlantyx",
  "janela_de_oportunidade": "Agora | 6 meses | 1 ano | Sem urgência",
  "evidencias_demanda": ["evidência 1 — RFPs, feedbacks, tendências"]
}`;

  const r = await claude(system, user, 1200);
  const pesquisa = parseJSON(r);
  console.log(`[S1-03] Pesquisa de mercado concluída: ${titulo}`);
  return { pesquisa, pipeline_stage: 'Em Análise' };
}

// ── S1-04: MODELAGEM FINANCEIRA ──────────────────────────────────────────────
async function modelagemFinanceira({ titulo, custo_dev, preco_medio, tam }) {
  const system = `Você é o Agente S1-04 de Modelagem Financeira da Atlantyx.
Projete os números financeiros desta ideia de produto de forma realista e conservadora.
Use premissas conservadoras para o cenário base. Retorne APENAS JSON válido.`;

  const user = `Modele financeiramente:
Produto: ${titulo}
Custo de desenvolvimento estimado: ${custo_dev || 'R$30.000'}
Preço médio de mercado: ${preco_medio || 'R$3.000/mês'}
TAM estimado: ${tam || 'R$500M'}

Retorne:
{
  "custo_desenvolvimento": "R$X",
  "custo_mensal_operacao": "R$X/mês",
  "premissas": { "clientes_ano1": 0, "clientes_ano2": 0, "clientes_ano3": 0, "churn_mensal": "X%", "preco_contrato": "R$X/mês" },
  "receita_projetada": { "ano1": "R$X", "ano2": "R$X", "ano3": "R$X" },
  "roi": "X%",
  "break_even": "X meses",
  "payback_period": "X meses",
  "margem_contribuicao": "X%",
  "cenarios": {
    "pessimista": { "receita_ano1": "R$X", "break_even": "X meses" },
    "realista": { "receita_ano1": "R$X", "break_even": "X meses" },
    "otimista": { "receita_ano1": "R$X", "break_even": "X meses" }
  },
  "recomendacao_financeira": "Go | No-Go | Condicional"
}`;

  const r = await claude(system, user, 1000);
  const modelo = parseJSON(r);
  console.log(`[S1-04] Modelagem financeira: ${titulo} — ROI ${modelo.roi} — Break-even ${modelo.break_even}`);
  return { modelo, pipeline_stage: 'Em Análise' };
}

// ── S1-05: PARECER DO COMITÊ INTERNO ────────────────────────────────────────
async function parecerComite({ titulo, analise_viabilidade, pesquisa_mercado, modelo_financeiro }) {
  const system = `Você é o Agente S1-05 — Comitê Interno da Atlantyx.
Consolide todas as análises e emita o parecer final do squad.
Seja objetivo. A decisão é do fundador — sua missão é preparar o melhor dossiê.
Retorne APENAS JSON válido.`;

  const user = `Emita parecer consolidado para:
Produto: ${titulo}

Análise de Viabilidade: ${JSON.stringify(analise_viabilidade || { nota_geral: 7, recomendacao: 'Avançar' })}
Pesquisa de Mercado: ${JSON.stringify(pesquisa_mercado || { janela: 'Agora' })}
Modelo Financeiro: ${JSON.stringify(modelo_financeiro || { break_even: '18 meses', roi: '180%' })}

Retorne:
{
  "nota_final_squad": 0-10,
  "parecer": "Aprovado | Aprovado com ressalvas | Rejeitado",
  "justificativa_parecer": "2-3 frases diretas",
  "pontos_fortes": ["ponto 1", "ponto 2"],
  "pontos_de_atencao": ["atenção 1", "atenção 2"],
  "riscos_criticos": ["risco 1"],
  "condicoes_se_aprovado_com_ressalvas": ["condição 1"],
  "resumo_executivo_fundador": "Parágrafo de 5-7 linhas para o fundador decidir — problema, solução, mercado, números-chave e recomendação do squad",
  "urgencia_decisao": "Imediata | Esta semana | Este mês | Sem pressa"
}`;

  const r = await claude(system, user, 1200);
  const parecer = parseJSON(r);
  console.log(`[S1-05] Parecer do comitê: ${titulo} — ${parecer.nota_final_squad}/10 — ${parecer.parecer}`);
  return { parecer, pipeline_stage: 'Aguardando Fundador' };
}

// ── S1-06: NOTIFICAÇÃO AO FUNDADOR ──────────────────────────────────────────
async function notificarFundador({ titulo, parecer, resumo }) {
  const msg = `[S1-06 · DECISÃO NECESSÁRIA — PRODUTO]

${titulo}

Nota do Squad: ${parecer?.nota_final_squad || '—'}/10
Parecer: ${parecer?.parecer || '—'}

${parecer?.resumo_executivo_fundador || resumo || ''}

PONTOS FORTES:
${(parecer?.pontos_fortes || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}

RISCOS:
${(parecer?.riscos_criticos || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Acesse o painel S1 para APROVAR ou REJEITAR com um clique.`;

  await whatsapp(process.env.FUNDADOR_WHATSAPP, msg);
  console.log(`[S1-06] Fundador notificado: ${titulo}`);
  return { notificado: true, pipeline_stage: 'Aguardando Fundador' };
}

// ── FUNDADOR DECIDE ──────────────────────────────────────────────────────────
async function fundadorDecide({ titulo, decisao, justificativa }) {
  console.log(`[FUNDADOR] Decisão: ${titulo} — ${decisao}`);

  if (decisao === 'APROVADO') {
    await whatsapp(process.env.FUNDADOR_WHATSAPP,
      `[S1 · Produto Aprovado ✓]\n\n${titulo}\n\nAgente S1-07 iniciando o Briefing Técnico para o Squad de Dev.`
    );
    return { decisao: 'APROVADO', pipeline_stage: 'Aprovado', proxima_acao: 'handoff_dev' };
  } else {
    await whatsapp(process.env.FUNDADOR_WHATSAPP,
      `[S1 · Produto Rejeitado]\n\n${titulo}\nMotivo: ${justificativa || 'não informado'}\n\nIdea arquivada com justificativa para aprendizado futuro.`
    );
    return { decisao: 'REJEITADO', pipeline_stage: 'Arquivada', motivo: justificativa };
  }
}

// ── S1-07: HANDOFF PARA DESENVOLVIMENTO ─────────────────────────────────────
async function handoffDev({ titulo, descricao, analises }) {
  const system = `Você é o Agente S1-07 de Handoff para Desenvolvimento da Atlantyx.
Transforme a ideia aprovada em um briefing técnico completo para o Squad de Dev (S6).
Seja específico, detalhado e acionável. Retorne APENAS JSON válido.`;

  const user = `Crie o briefing técnico para desenvolvimento:
Produto aprovado: ${titulo}
Descrição: ${descricao}
Análises realizadas: ${JSON.stringify(analises || {})}

Retorne:
{
  "epico_nome": "nome do épico no Jira/Linear",
  "objetivo": "objetivo em uma frase",
  "escopo": ["funcionalidade 1", "funcionalidade 2", "funcionalidade 3"],
  "fora_do_escopo": ["item 1", "item 2"],
  "requisitos_funcionais": ["RF1: ...", "RF2: ..."],
  "requisitos_nao_funcionais": ["RNF1: performance", "RNF2: segurança"],
  "criterios_de_aceite": ["CA1: ...", "CA2: ..."],
  "stack_sugerida": ["tecnologia 1", "tecnologia 2"],
  "prazo_sugerido": "X semanas",
  "prioridade": "Alta | Média | Baixa",
  "dependencias": ["dependência 1"],
  "metricas_de_sucesso": ["métrica 1", "métrica 2"]
}`;

  const r = await claude(system, user, 1500);
  const briefing = parseJSON(r);

  await whatsapp(process.env.FUNDADOR_WHATSAPP,
    `[S1-07 · Handoff Dev Concluído]\n\n${titulo}\nÉpico: ${briefing.epico_nome}\nPrazo sugerido: ${briefing.prazo_sugerido}\n\nBriefing técnico enviado ao Squad de Dev S6.`
  );

  console.log(`[S1-07] Handoff concluído: ${titulo} → ${briefing.epico_nome}`);
  return { briefing, pipeline_stage: 'Em Desenvolvimento' };
}

// ── S1-09: STATUS OKR ────────────────────────────────────────────────────────
async function statusOKR({ trimestre, objetivos }) {
  const system = `Você é o Agente S1-09 de OKR da Atlantyx.
Avalie o progresso dos OKRs e gere recomendações de ajuste.
Retorne APENAS JSON válido.`;

  const okrsAtivos = objetivos || [
    { objetivo: 'Atingir R$1.5M de ARR', krs: [
      { kr: 'Fechar 3 contratos enterprise', meta: 3, atual: 0, unidade: 'contratos' },
      { kr: 'Pipeline de R$7.6M ativo', meta: 7600000, atual: 7600000, unidade: 'R$' },
      { kr: 'NPS > 70 nos clientes ativos', meta: 70, atual: 0, unidade: 'pontos' },
    ]},
    { objetivo: 'Lançar 2 produtos S1 aprovados', krs: [
      { kr: 'Pipeline de ideias com 5+ ideias em análise', meta: 5, atual: 0, unidade: 'ideias' },
      { kr: '1 produto aprovado e em dev', meta: 1, atual: 0, unidade: 'produtos' },
    ]},
    { objetivo: 'Escalar prospecção a 50 leads/mês', krs: [
      { kr: 'S2-02 mapeando 50 leads/mês', meta: 50, atual: 0, unidade: 'leads' },
      { kr: 'Taxa de resposta WA > 20%', meta: 20, atual: 17, unidade: '%' },
      { kr: '5 reuniões por semana', meta: 5, atual: 0, unidade: 'reuniões' },
    ]},
  ];

  const user = `Analise os OKRs do trimestre ${trimestre || 'Q2 2026'}:
${JSON.stringify(okrsAtivos)}

Para cada KR calcule o % de progresso e dê um semáforo.
Retorne:
{
  "trimestre": "${trimestre || 'Q2 2026'}",
  "objetivos": [
    {
      "objetivo": "...",
      "progresso_geral": 0-100,
      "semaforo": "🟢 Verde | 🟡 Amarelo | 🔴 Vermelho",
      "krs": [
        { "kr": "...", "meta": 0, "atual": 0, "progresso": 0-100, "semaforo": "verde | amarelo | vermelho", "acao_recomendada": "..." }
      ]
    }
  ],
  "saude_geral": "Verde | Amarelo | Vermelho",
  "principais_riscos": ["..."],
  "recomendacoes": ["ação 1", "ação 2"]
}`;

  const r = await claude(system, user, 1500);
  const okr = parseJSON(r);
  console.log(`[S1-09] OKR status: ${okr.saude_geral}`);
  return { okr };
}

// ── S1-10: RELATÓRIO EXECUTIVO ───────────────────────────────────────────────
async function relatorioExecutivo({ periodo }) {
  const system = `Você é o Agente S1-10 de Relatórios Executivos da Atlantyx.
Gere um relatório executivo completo do período para o fundador.
Seja conciso, direto e acionável. Retorne APENAS JSON válido.`;

  const user = `Gere o relatório executivo do período: ${periodo || 'Semana atual'}

Contexto Atlantyx: empresa iniciando, meta R$5M em 3 meses, 12 leads no pipeline, 3 reuniões agendadas.

Retorne:
{
  "periodo": "${periodo || 'Semana atual'}",
  "headline": "frase de uma linha resumindo o período",
  "destaques": ["destaque 1", "destaque 2", "destaque 3"],
  "desafios": ["desafio 1", "desafio 2"],
  "metricas_chave": { "leads": 0, "reunioes": 0, "pipeline_rs": 0, "propostas": 0 },
  "acoes_proxima_semana": ["ação 1 — responsável", "ação 2 — responsável"],
  "decisoes_necessarias": ["decisão 1 do fundador", "decisão 2"],
  "saude_do_negocio": "Verde | Amarelo | Vermelho",
  "nota_semana": 0-10
}`;

  const r = await claude(system, user, 1000);
  const relatorio = parseJSON(r);
  console.log(`[S1-10] Relatório executivo gerado: ${relatorio.headline}`);
  return { relatorio };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
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
  catch { return { erro: 'JSON inválido', raw: text.substring(0, 200) }; }
}

async function whatsapp(phone, message) {
  if (!phone || !process.env.ZAPI_INSTANCE) return;
  try {
    await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({ phone, message }),
    });
  } catch (e) { console.log('[WA] Erro notificação:', e.message); }
}
