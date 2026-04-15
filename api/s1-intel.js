// api/s1-intel.js
// S1 · Inteligência Estratégica Contínua da Atlantyx
// Os agentes analisam a própria empresa — riscos, finanças, mercado, posicionamento
// e replanejam ações continuamente para maximizar lucro e crescimento

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { action, contexto } = req.body;

    const acoes = {
      diagnostico_completo:    () => diagnosticoCompleto(contexto),
      analise_swot:            () => analiseSwot(contexto),
      analise_riscos:          () => analiseRiscos(contexto),
      analise_financeira:      () => analiseFinanceira(contexto),
      analise_mercado:         () => analiseMercado(contexto),
      planejamento_estrategico: () => planejamentoEstrategico(contexto),
      plano_acao:              () => planoAcao(contexto),
      replanejamento:          () => replanejamento(contexto),
      okr_gerador:             () => okrGerador(contexto),
      cenarios_futuro:         () => cenariosFuturo(contexto),
    };

    if (!acoes[action]) return res.status(400).json({ error: `Ação inválida: ${Object.keys(acoes).join(', ')}` });

    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });

  } catch (error) {
    console.error('[ERRO s1-intel]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── CONTEXTO BASE DA ATLANTYX ─────────────────────────────────────────────────
function ctxAtlantyx(extra = {}) {
  return {
    empresa: 'Atlantyx',
    segmento: 'BI, Engenharia de Dados e IA para grandes empresas',
    missao: 'Transformar dados complexos em inteligência acionável, entregando Quick Wins em semanas com ROI mensurável',
    stage: 'Early-stage / go-to-market — semana 1 de operação comercial ativa',
    time: { fundador: 1, marketing: 1, closer_freelancer: 1, dev_part_time: '1h/dia' },
    financeiro: {
      receita_atual: 0,
      meta_3_meses: 5000000,
      meta_semana: 500000,
      meta_mes: 1500000,
      caixa_estimado: 'não informado',
      burn_rate: 'baixo — time enxuto',
      investimento_marketing: 'R$5k/mês (LinkedIn Ads + Google)',
    },
    pipeline: {
      leads: 12,
      score_a: 9,
      reunioes: 3,
      pipeline_valor: 7600000,
      win_rate_historico: '28%',
    },
    icp: {
      setores: ['Energia', 'Automotivo', 'Varejo', 'Indústria'],
      porte: 'R$100M–R$5B',
      decisores: 'CIO, CTO, CFO, Dir. Transformação Digital',
    },
    produtos: ['Atlantyx Financial OS', 'BI Analytics', 'Engenharia de Dados', 'IA aplicada'],
    diferenciais: ['Quick Wins em semanas', 'Integra com sistemas existentes', 'ROI mensurável', 'Foco em grandes empresas'],
    riscos_conhecidos: ['Dev com 1h/dia limita velocidade', 'Dependência do fundador', 'Ciclo de venda longo (47 dias)'],
    ...extra,
  };
}

// ── DIAGNÓSTICO COMPLETO ──────────────────────────────────────────────────────
async function diagnosticoCompleto(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o sistema de Inteligência Estratégica da Atlantyx — uma consultoria de estratégia interna de nível McKinsey.
Seu papel: analisar a empresa de forma completa, identificar o que está funcionando, o que está bloqueando crescimento e o que pode ser otimizado para maximizar lucro.
Use frameworks reais: SWOT, PESTEL, Porter, Canvas, BCG, Ansoff.
Seja direto, honesto e acionável. Não suavize problemas reais.
Retorne APENAS JSON válido.`;

  const user = `Faça um DIAGNÓSTICO COMPLETO da empresa:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "saude_geral": "Verde | Amarelo | Vermelho",
  "nota_geral": 0-10,
  "headline": "frase de 1 linha resumindo o momento da empresa",
  "momento": "descrição do estágio atual em 3-4 linhas — onde está, o que está indo bem, o que está travando",
  "swot": {
    "forcas": [{"item":"...","impacto":"Alto|Médio|Baixo","como_aproveitar":"..."}],
    "fraquezas": [{"item":"...","impacto":"Alto|Médio|Baixo","como_mitigar":"..."}],
    "oportunidades": [{"item":"...","janela":"Agora|6m|1ano","acao":"..."}],
    "ameacas": [{"item":"...","probabilidade":"Alta|Média|Baixa","mitigacao":"..."}]
  },
  "gargalos_criticos": [
    {"gargalo":"...","impacto_receita":"R$X/mês perdidos","solucao":"...","prazo":"X semanas","responsavel":"..."}
  ],
  "alavancas_de_crescimento": [
    {"alavanca":"...","potencial_receita":"R$X","esforco":"Alto|Médio|Baixo","prazo":"...","acao_imediata":"..."}
  ],
  "posicionamento_mercado": "análise do posicionamento atual vs. ideal",
  "vantagem_competitiva_real": "qual é a real vantagem defensável da Atlantyx hoje",
  "maior_risco_agora": "o risco número 1 que pode travar o crescimento nos próximos 90 dias",
  "maior_oportunidade_agora": "a oportunidade número 1 que pode acelerar o crescimento nos próximos 90 dias",
  "proximos_90_dias_criticos": "o que precisa acontecer nos próximos 90 dias para a empresa atingir R$5M"
}`;

  const r = await claude(system, user, 3000);
  const diag = parseJSON(r);
  console.log(`[S1-Intel] Diagnóstico: ${diag.nota_geral}/10 — ${diag.saude_geral}`);
  return { diagnostico: diag };
}

// ── ANÁLISE DE RISCOS ─────────────────────────────────────────────────────────
async function analiseRiscos(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o Agente de Gestão de Riscos da Atlantyx.
Mapeie TODOS os riscos reais — internos, externos, financeiros, operacionais, de mercado, jurídicos e de pessoas.
Para cada risco: quantifique o impacto, defina a probabilidade e proponha uma ação de mitigação concreta.
Retorne APENAS JSON válido.`;

  const user = `Analise os riscos completos da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "nivel_risco_geral": "Alto | Médio | Baixo",
  "riscos": [
    {
      "categoria": "Financeiro | Operacional | Mercado | Pessoas | Jurídico | Tecnológico | Reputacional",
      "risco": "descrição clara do risco",
      "probabilidade": "Alta | Média | Baixa",
      "impacto": "Alto | Médio | Baixo",
      "impacto_financeiro_estimado": "R$X ou X% da receita",
      "gatilho": "o que faria este risco se materializar",
      "mitigacao": "ação concreta para reduzir probabilidade ou impacto",
      "responsavel": "Fundador | Dev | Marketing | Closer | Agente IA",
      "prazo_mitigacao": "imediato | 2 semanas | 1 mês | 3 meses",
      "status": "Não mitigado | Em mitigação | Mitigado"
    }
  ],
  "matriz_risco": {
    "criticos": ["riscos de alta probabilidade E alto impacto"],
    "monitorar": ["riscos de média probabilidade ou médio impacto"],
    "aceitar": ["riscos de baixa probabilidade E baixo impacto"]
  },
  "risco_numero_1": "qual risco merece ação imediata esta semana e por quê",
  "plano_contingencia_receita": "o que fazer se não atingir 50% da meta em 45 dias"
}`;

  const r = await claude(system, user, 3000);
  const riscos = parseJSON(r);
  console.log(`[S1-Intel] Riscos mapeados: ${riscos.riscos?.length || 0} | Nível: ${riscos.nivel_risco_geral}`);
  return { riscos };
}

// ── ANÁLISE FINANCEIRA ────────────────────────────────────────────────────────
async function analiseFinanceira(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o CFO-Agente da Atlantyx — modelo financeiro real para maximizar lucro e sustentabilidade.
Pense como um CFO experiente de startup B2B SaaS/serviços.
Modele os números com realismo: sem otimismo injustificado.
Retorne APENAS JSON válido.`;

  const user = `Análise financeira completa da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "diagnostico_financeiro": {
    "situacao_atual": "descrição da saúde financeira atual",
    "runway_estimado": "quantos meses o caixa aguenta sem receita",
    "ponto_de_equilibrio": "quantos contratos/mês para cobrir custos",
    "unit_economics": {
      "cac_estimado": "R$X",
      "ltv_estimado": "R$X",
      "ltv_cac_ratio": "Xx",
      "payback_period": "X meses",
      "margem_contribuicao_servico": "X%"
    }
  },
  "projecao_receita": {
    "premissas": {"contratos_mes1": 0, "contratos_mes2": 0, "contratos_mes3": 0, "ticket_medio": "R$X", "churn_mensal": "X%"},
    "mes1": {"receita": "R$X", "clientes_acumulados": 0, "atingimento_meta": "X%"},
    "mes2": {"receita": "R$X", "clientes_acumulados": 0, "atingimento_meta": "X%"},
    "mes3": {"receita": "R$X", "clientes_acumulados": 0, "atingimento_meta": "X%"},
    "arr_projetado": "R$X"
  },
  "cenarios": {
    "pessimista": {"descricao":"...","receita_90d":"R$X","probabilidade":"X%","gatilho":"..."},
    "realista":   {"descricao":"...","receita_90d":"R$X","probabilidade":"X%","gatilho":"..."},
    "otimista":   {"descricao":"...","receita_90d":"R$X","probabilidade":"X%","gatilho":"..."}
  },
  "alavancas_financeiras": [
    {"alavanca":"...","impacto_receita":"R$X/mês","custo_implementacao":"R$X","roi":"X meses","prioridade":"Alta|Média|Baixa"}
  ],
  "decisoes_financeiras_urgentes": [
    {"decisao":"...","prazo":"...","impacto":"...","responsavel":"Fundador"}
  ],
  "maximizacao_lucro": {
    "estrategia_pricing": "como precificar para maximizar margem",
    "mix_produto_ideal": "qual combinação de produtos maximiza margem e velocidade de fechamento",
    "canal_mais_rentavel": "qual canal de aquisição tem melhor ROI agora",
    "cortes_custos_possiveis": ["custo 1 para cortar", "custo 2"],
    "investimentos_prioritarios": ["onde investir para máximo retorno"]
  }
}`;

  const r = await claude(system, user, 3000);
  const financeiro = parseJSON(r);
  console.log(`[S1-Intel] Análise financeira concluída — ARR projetado: ${financeiro.projecao_receita?.arr_projetado}`);
  return { financeiro };
}

// ── ANÁLISE DE MERCADO ────────────────────────────────────────────────────────
async function analiseMercado(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o Agente de Inteligência de Mercado da Atlantyx.
Analise o mercado externo com profundidade: concorrência, tendências, PESTEL, forças de Porter.
Identifique onde estão as maiores oportunidades e ameaças de mercado.
Retorne APENAS JSON válido.`;

  const user = `Análise completa do mercado para a Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "panorama_mercado": {
    "tam_brasil": "R$X bilhões",
    "sam_atlantyx": "R$X bilhões (mercado endereçável real)",
    "som_90d": "R$X (fatia realista em 90 dias)",
    "crescimento_anual": "X%",
    "maturidade": "Emergente | Crescendo | Maduro | Saturado"
  },
  "pestel": {
    "politico": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "economico": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "social": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "tecnologico": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "ambiental": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["..."]},
    "legal": {"impacto": "Positivo|Neutro|Negativo", "fatores": ["LGPD", "..."]}
  },
  "forças_porter": {
    "rivalidade_concorrentes": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "poder_compradores": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "poder_fornecedores": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "ameaca_novos_entrantes": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "ameaca_substitutos": {"nivel": "Alto|Médio|Baixo", "analise": "..."},
    "atratividade_geral": "Alta|Média|Baixa"
  },
  "concorrentes": [
    {
      "nome": "...",
      "posicionamento": "...",
      "forcas": ["..."],
      "fraquezas": ["..."],
      "como_vencer": "estratégia específica para ganhar contra este player"
    }
  ],
  "tendencias_favoraveis": [
    {"tendencia": "...", "impacto_atlantyx": "...", "como_aproveitar": "...","janela": "Agora|6m|1ano"}
  ],
  "oportunidades_nao_exploradas": [
    {"oportunidade": "...", "potencial": "R$X", "barreira_entrada": "Alta|Média|Baixa", "acao": "..."}
  ],
  "segmento_mais_quente_agora": "qual setor do ICP tem maior urgência de compra neste momento e por quê"
}`;

  const r = await claude(system, user, 3000);
  const mercado = parseJSON(r);
  console.log(`[S1-Intel] Análise de mercado: ${mercado.panorama_mercado?.maturidade} — TAM ${mercado.panorama_mercado?.tam_brasil}`);
  return { mercado };
}

// ── PLANEJAMENTO ESTRATÉGICO ──────────────────────────────────────────────────
async function planejamentoEstrategico(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o Diretor de Estratégia da Atlantyx — nível McKinsey/Bain.
Crie um planejamento estratégico real, acionável e com foco em maximização de lucro.
Pense em 3 horizontes: 90 dias (execução), 1 ano (crescimento), 3 anos (escala).
Cada ação deve ter: o QUÊ fazer, POR QUÊ, COMO, QUANDO e QUEM.
Retorne APENAS JSON válido.`;

  const user = `Crie o Planejamento Estratégico completo da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "visao_90_dias": "onde a Atlantyx deve estar em 90 dias",
  "visao_1_ano": "onde deve estar em 1 ano",
  "visao_3_anos": "onde deve estar em 3 anos",
  "estrategia_competitiva": "qual é a estratégia competitiva central: diferenciação | custo | nicho | plataforma",
  "modelo_crescimento": "como a empresa vai crescer: produto | canal | mercado | modelo",
  "prioridades_estrategicas": [
    {
      "prioridade": "nome da prioridade estratégica",
      "descricao": "por que é prioridade agora",
      "horizonte": "90 dias | 1 ano | 3 anos",
      "impacto_receita": "R$X",
      "esforco": "Alto | Médio | Baixo",
      "dependencias": ["..."]
    }
  ],
  "iniciativas_estrategicas": [
    {
      "iniciativa": "nome da iniciativa",
      "objetivo": "resultado esperado",
      "acoes": [
        {"acao": "...", "responsavel": "...", "prazo": "DD/MM/AAAA", "kpi_sucesso": "...", "recursos": "..."}
      ],
      "meta_resultado": "R$X ou % de crescimento",
      "prazo_conclusao": "DD/MM/AAAA",
      "status": "Não iniciada | Em andamento | Concluída"
    }
  ],
  "modelo_de_receita_ideal": "como estruturar a receita para máxima previsibilidade e margem",
  "go_to_market_90d": {
    "foco_setor": "qual setor priorizar nos 90 dias e por quê",
    "mensagem_central": "qual mensagem ressoa mais agora",
    "canal_primario": "qual canal de aquisição focar",
    "meta_semana_1": "...",
    "meta_semana_4": "...",
    "meta_dia_90": "..."
  }
}`;

  const r = await claude(system, user, 4000);
  const plano = parseJSON(r);
  console.log(`[S1-Intel] Planejamento estratégico gerado — ${plano.prioridades_estrategicas?.length || 0} prioridades`);
  return { plano };
}

// ── PLANO DE AÇÃO COMPLETO ────────────────────────────────────────────────────
async function planoAcao(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o COO-Agente da Atlantyx — responsável por transformar estratégia em ação.
Crie um plano de ação COMPLETO, semana a semana, para os próximos 90 dias.
Cada ação deve ser específica o suficiente para ser executada sem dúvida.
Priorize pelo impacto na receita. Respeite a capacidade do time (pequeno).
Retorne APENAS JSON válido.`;

  const user = `Crie o Plano de Ação completo dos próximos 90 dias da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "objetivo_geral": "o que este plano busca atingir",
  "premissas": ["premissa 1 do plano", "premissa 2"],
  "semanas": [
    {
      "semana": 1,
      "periodo": "14/04 – 18/04/2026",
      "foco": "tema central desta semana",
      "meta_receita": "R$X",
      "acoes": [
        {
          "id": "S1.1",
          "acao": "descrição específica e executável",
          "responsavel": "Fundador | Dev | Marketing | Closer | Agente S2 | Agente S7",
          "dia": "Segunda | Terça | Quarta | Quinta | Sexta",
          "duracao": "X min | X h",
          "kpi": "como medir se foi feito",
          "impacto": "o que esta ação move",
          "dependencias": ["id da ação que precisa ser feita antes"],
          "prioridade": "Crítica | Alta | Média"
        }
      ],
      "entregaveis": ["o que deve estar pronto ao fim da semana"],
      "alertas": ["o que pode travar esta semana"]
    }
  ],
  "marcos_90_dias": [
    {"dia": 7, "marco": "...", "kpi": "..."},
    {"dia": 30, "marco": "...", "kpi": "..."},
    {"dia": 60, "marco": "...", "kpi": "..."},
    {"dia": 90, "marco": "...", "kpi": "..."}
  ],
  "kpis_monitoramento": [
    {"kpi": "...", "meta": "...", "frequencia": "Diário | Semanal | Mensal", "responsavel": "..."}
  ]
}`;

  const r = await claude(system, user, 4000);
  const planoAcoes = parseJSON(r);
  console.log(`[S1-Intel] Plano de ação: ${planoAcoes.semanas?.length || 0} semanas planejadas`);
  return { plano_acao: planoAcoes };
}

// ── REPLANEJAMENTO CONTÍNUO ───────────────────────────────────────────────────
async function replanejamento(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o sistema de Replanejamento Contínuo da Atlantyx.
Com base nos dados atuais vs. o que foi planejado, identifique desvios e replaneie.
Seja direto sobre o que não está funcionando. Ajuste o plano com base na realidade.
Retorne APENAS JSON válido.`;

  const user = `Faça o REPLANEJAMENTO com base na situação atual:
${JSON.stringify(ctx, null, 2)}

Dados reais vs. planejado que você precisa avaliar:
- Meta receita semana 1: R$500k | Realizado: R$0 (semana 1 ainda)
- Pipeline: R$7.6M | Win rate histórico: 28%
- Leads mapeados: 12 | Meta: 50/mês
- Taxa resposta WA: 17% | Meta: >20%
- Reuniões: 3 | Meta: 5/semana

Retorne:
{
  "semaforo_geral": "Verde | Amarelo | Vermelho",
  "desvios_criticos": [
    {"metrica": "...", "planejado": "...", "realizado": "...", "desvio": "X%", "causa": "...", "acao_corretiva": "...", "prazo": "..."}
  ],
  "o_que_nao_esta_funcionando": [
    {"item": "...", "evidencia": "...", "hipotese_causa": "...", "experimento_sugerido": "..."}
  ],
  "o_que_esta_funcionando": ["..."],
  "ajustes_estrategicos": [
    {
      "ajuste": "descrição do ajuste no plano",
      "motivo": "por que ajustar",
      "impacto_esperado": "...",
      "implementar_em": "esta semana | próxima semana | este mês"
    }
  ],
  "novo_foco_semana": "qual deve ser o foco da próxima semana dado o contexto atual",
  "acoes_de_emergencia": [
    {"acao": "...", "responsavel": "...", "prazo": "48h | esta semana", "resultado_esperado": "..."}
  ],
  "previsao_revisada": {
    "receita_30d": "R$X",
    "receita_60d": "R$X",
    "receita_90d": "R$X",
    "probabilidade_meta": "X%"
  }
}`;

  const r = await claude(system, user, 3000);
  const replano = parseJSON(r);
  console.log(`[S1-Intel] Replanejamento: ${replano.semaforo_geral} — ${replano.ajustes_estrategicos?.length || 0} ajustes`);

  // Notificar se status crítico
  if (replano.semaforo_geral === 'Vermelho') {
    await whatsapp(process.env.FUNDADOR_WHATSAPP,
      `[S1 · ALERTA ESTRATÉGICO 🔴]\n\nReplanejamento identificou situação crítica.\n\nPrincipal desvio: ${replano.desvios_criticos?.[0]?.acao_corretiva || ''}\n\nAção de emergência: ${replano.acoes_de_emergencia?.[0]?.acao || ''}\n\nAcesse o painel S1 para o plano completo.`
    );
  }

  return { replanejamento: replano };
}

// ── GERADOR DE OKRs INTELIGENTE ───────────────────────────────────────────────
async function okrGerador(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o Agente de OKR da Atlantyx — especialista em definir objetivos ambiciosos e mensuráveis.
Gere OKRs reais para a Atlantyx com base na situação atual.
Cada KR deve ser específico, mensurável, com prazo e responsável definido.
Os OKRs devem ser ambiciosos mas atingíveis — stretch goals de 70% de confiança.
Retorne APENAS JSON válido.`;

  const user = `Gere os OKRs completos para a Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "trimestre": "Q2 2026 (Abr-Jun)",
  "tema_do_trimestre": "frase que resume o foco estratégico",
  "objetivos": [
    {
      "id": "O1",
      "objetivo": "declaração do objetivo — qualitativo, inspirador, claro",
      "por_que_importa": "conexão com a estratégia da empresa",
      "peso": "X% do foco do time",
      "krs": [
        {
          "id": "O1.KR1",
          "kr": "declaração mensurável do resultado-chave",
          "baseline": "valor atual",
          "meta": "valor a atingir",
          "unidade": "R$ | contratos | leads | % | NPS",
          "prazo": "DD/MM/AAAA",
          "responsavel": "Fundador | Dev | Marketing | Closer | Agente IA",
          "frequencia_checkin": "Diário | Semanal | Quinzenal",
          "como_medir": "fonte de dados para medir",
          "acoes_chave": [
            {"acao": "...", "responsavel": "...", "prazo": "DD/MM/AAAA", "impacto_kr": "direto | indireto"}
          ],
          "semaforo": "🔴 Não iniciado",
          "progresso_atual": 0
        }
      ]
    }
  ],
  "anti_objetivos": ["o que deliberadamente NÃO vamos fazer neste trimestre"],
  "dependencias_criticas": ["o que precisa acontecer fora do time para os OKRs serem possíveis"],
  "cadencia_revisao": "como e quando revisar os OKRs — semanal, quinzenal, mensal"
}`;

  const r = await claude(system, user, 4000);
  const okrs = parseJSON(r);
  console.log(`[S1-Intel] OKRs gerados: ${okrs.objetivos?.length || 0} objetivos`);
  return { okrs };
}

// ── CENÁRIOS DE FUTURO ────────────────────────────────────────────────────────
async function cenariosFuturo(extra) {
  const ctx = ctxAtlantyx(extra);

  const system = `Você é o Agente de Cenários Estratégicos da Atlantyx.
Projete 3 futuros possíveis para a empresa — pessimista, realista e otimista.
Para cada cenário: o que precisaria acontecer, onde a empresa estaria e o que fazer hoje para se preparar.
Retorne APENAS JSON válido.`;

  const user = `Projete os cenários de futuro da Atlantyx:
${JSON.stringify(ctx, null, 2)}

Retorne:
{
  "horizonte": "12 meses (Abr 2026 – Mar 2027)",
  "cenarios": {
    "pessimista": {
      "nome": "nome do cenário",
      "probabilidade": "X%",
      "descricao": "como este futuro se materializa",
      "gatilhos": ["o que faria isso acontecer"],
      "empresa_em_12_meses": {
        "receita_anual": "R$X",
        "clientes": 0,
        "time": "X pessoas",
        "posicao_mercado": "...",
        "principais_problemas": ["..."]
      },
      "como_evitar": ["ação preventiva 1", "ação preventiva 2"],
      "plano_b": "o que fazer se este cenário se materializar"
    },
    "realista": {
      "nome": "...",
      "probabilidade": "X%",
      "descricao": "...",
      "gatilhos": ["..."],
      "empresa_em_12_meses": {
        "receita_anual": "R$X",
        "clientes": 0,
        "time": "X pessoas",
        "posicao_mercado": "...",
        "marcos_chave": ["..."]
      },
      "acelerador": "o que poderia levar do realista ao otimista"
    },
    "otimista": {
      "nome": "...",
      "probabilidade": "X%",
      "descricao": "...",
      "gatilhos": ["o que faria isso acontecer — eventos específicos"],
      "empresa_em_12_meses": {
        "receita_anual": "R$X",
        "clientes": 0,
        "time": "X pessoas",
        "posicao_mercado": "...",
        "proximos_passos": ["expansão 1", "produto 2", "mercado 3"]
      },
      "como_chegar_aqui": ["ação 1 para tornar este cenário mais provável"]
    }
  },
  "sinais_de_alerta": ["sinal que indica que estamos indo para o pessimista"],
  "sinais_positivos": ["sinal que indica que estamos indo para o otimista"],
  "decisao_critica_hoje": "a decisão mais importante que o fundador deve tomar AGORA para maximizar probabilidade do cenário otimista"
}`;

  const r = await claude(system, user, 3500);
  const cenarios = parseJSON(r);
  console.log(`[S1-Intel] Cenários: ${Object.keys(cenarios.cenarios || {}).length} projetados`);
  return { cenarios };
}

// ── ANÁLISE SWOT ──────────────────────────────────────────────────────────────
async function analiseSwot(extra) {
  const { diagnostico } = await diagnosticoCompleto(extra);
  return { swot: diagnostico?.swot, diagnostico };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
async function claude(system, user, maxTokens = 2000) {
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
  catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return { erro: 'JSON inválido', raw: text.substring(0, 300) };
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
