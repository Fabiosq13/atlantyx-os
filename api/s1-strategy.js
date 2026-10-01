import { comGuarda } from '../lib/qa-guard.js';
// api/s1-strategy.js
// S1 — Planejamento Estratégico + Linha de Produtos
// 10 agentes: Captação → Viabilidade → Pesquisa → Financeiro → Comitê → Fundador → Handoff → GP → OKR → Relatórios


// ── AGENTE GENÉRICO — todos os novos squads ────────────────────────────────
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function genericAgentCall({ action, payload = {} }, squad) {
  const prompts = {
    financeiro:    `Voce e o Agente Financeiro da Atlantyx, empresa B2B de BI, Dados e IA. Acao: ${action}. Dados: ${JSON.stringify(payload)}. Responda em portugues com analise detalhada, KPIs, insights e recomendacoes praticas.`,
    juridico:      `Voce e o Agente Juridico da Atlantyx. Analise documentos e gere documentos juridicos profissionais. Acao: ${action}. Dados: ${JSON.stringify(payload)}. Identifique riscos e gere o documento solicitado em portugues.`,
    rh:            `Voce e o Agente de RH da Atlantyx. Crie descricoes de vaga, avaliacoes 360 e PDIs estruturados. Acao: ${action}. Dados: ${JSON.stringify(payload)}.`,
    dp:            `Voce e o Agente de DP da Atlantyx. Analise obrigacoes trabalhistas e gere calendario de DP. Acao: ${action}. Dados: ${JSON.stringify(payload)}.`,
    projetos:      `Voce e o Agente de Gestao de Projetos S9 da Atlantyx. Crie planos com marcos e gere Status Reports executivos. Acao: ${action}. Dados: ${JSON.stringify(payload)}.`,
    atendimento:   `Voce e o Agente de Atendimento S10 da Atlantyx. Classifique tickets e elabore orcamentos de manutencao. Acao: ${action}. Dados: ${JSON.stringify(payload)}.`,
    inside_sales:  `Voce e o Agente de Inside Sales S11 da Atlantyx, especialista em B2B enterprise. Qualifique leads com BANT e crie scripts de abordagem personalizados para decisores C-level de grandes empresas brasileiras. Acao: ${action}. Dados: ${JSON.stringify(payload)}. Seja direto, especifico e focado em resultado. Para scripts de LinkedIn: maximo 300 caracteres, pessoal, nao pareca spam.`,
    dev:           `Voce e o Agente de Dev+QA S6 da Atlantyx. Gere Release Notes profissionais e checklists de QA completos. Acao: ${action}. Dados: ${JSON.stringify(payload)}.`,
  };

  const systemPrompt = prompts[squad] || `Agente Atlantyx OS — ${squad}. Acao: ${action}. Dados: ${JSON.stringify(payload)}.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Execute a acao "${action}" com os dados fornecidos. Seja direto, estruturado e profissional. Responda em portugues.` }],
    }),
  });

  const data = await response.json();
  const content = data.content?.[0]?.text || 'Sem resposta do agente.';
  return { success: true, content, squad, action };
}

// ── AGENTE DE ENGENHARIA DE DADOS — codigo completo ───────────────────────
async function deAgentCall({ payload = {} }, tipoAgente) {
  const { prompt_override, config = {} } = payload;
  const systemPrompt = prompt_override || `Voce e arquiteto senior de Data Engineering especializado em ${tipoAgente}. Gere codigo tecnico completo e executavel. Nunca use pseudocodigo.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: 'Voce e arquiteto senior de Data Engineering e DBA. Gere codigo tecnico completo, detalhado e pronto para executar. Inclua comentarios, tratamento de erros e boas praticas. NUNCA use pseudocodigo — gere codigo real.',
      messages: [{ role: 'user', content: systemPrompt }],
    }),
  });

  const data = await response.json();
  const content = data.content?.[0]?.text || 'Sem resposta do agente.';
  return { success: true, content, agente: tipoAgente };
}

async function handler(req, res) {
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

      // ── NOVOS SQUADS — genericAgentCall ─────────────────────────────────────
      analise_financeira:      () => genericAgentCall(req.body, 'financeiro'),
      s1_financial:            () => genericAgentCall(req.body, 'financeiro'),
      projecao_receita:        () => genericAgentCall(req.body, 'financeiro'),
      fluxo_caixa:             () => genericAgentCall(req.body, 'financeiro'),
      plano_integrado_proposito: () => genericAgentCall(req.body, 'financeiro'),

      contrato_analisar:       () => analisarContrato(req.body), // v3.35
      ideia_proposta:          () => propostaNegociacaoIdeia(req.body), // v3.35
      ideia_chat:              () => chatIdeia(req.body), // v3.37
      juridico_analise:        () => genericAgentCall(req.body, 'juridico'),
      juridico_gerar:          () => genericAgentCall(req.body, 'juridico'),
      juridico_compliance:     () => genericAgentCall(req.body, 'juridico'),

      rh_vaga:                 () => genericAgentCall(req.body, 'rh'),
      rh_avaliacao:            () => genericAgentCall(req.body, 'rh'),
      dp_obrigacoes:           () => genericAgentCall(req.body, 'dp'),

      projeto_criar:           () => genericAgentCall(req.body, 'projetos'),
      projeto_status_report:   () => genericAgentCall(req.body, 'projetos'),

      atendimento_ticket:      () => genericAgentCall(req.body, 'atendimento'),
      atendimento_orcamento:   () => genericAgentCall(req.body, 'atendimento'),

      inside_sales_bant:       () => genericAgentCall(req.body, 'inside_sales'),
      inside_sales_script:     () => genericAgentCall(req.body, 'inside_sales'),

      dev_release_notes:       () => genericAgentCall(req.body, 'dev'),
      dev_qa_checklist:        () => genericAgentCall(req.body, 'dev'),

      // ── S12 DATA ENGINEERING ────────────────────────────────────────────────
      de_modelagem_dw:         () => deAgentCall(req.body, 'modelagem_dw'),
      de_ddl:                  () => deAgentCall(req.body, 'ddl'),
      de_pipeline_bronze:      () => deAgentCall(req.body, 'pipeline_bronze'),
      de_pipeline_silver:      () => deAgentCall(req.body, 'pipeline_silver'),
      de_pipeline_gold:        () => deAgentCall(req.body, 'pipeline_gold'),
      de_documentacao:         () => deAgentCall(req.body, 'documentacao'),

      // ── S13 DASHBOARD STUDIO ────────────────────────────────────────────────
      dashboard_mockup:        () => deAgentCall(req.body, 'dashboard'),
      dashboard_query:         () => deAgentCall(req.body, 'dashboard'),
      dashboard_calc:          () => deAgentCall(req.body, 'dashboard'),
      dashboard_app:           () => deAgentCall(req.body, 'dashboard'),
      dashboard_deploy:        () => deAgentCall(req.body, 'dashboard'),
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
async function analisarIdeia({ titulo, desc, descricao, origem, cat, perguntas, modo, tem_arquivos, docs_nomes, docs_texto, imagensBase64, ideia_id, problema }) {
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
${Array.isArray(docs_texto) && docs_texto.length ? '\nCONTEÚDO DOS DOCUMENTOS ANEXADOS (leia com atenção — valores, condições comerciais, prazos, responsabilidades):\n' + docs_texto.map(d => `\n===== ${d.nome} =====\n${String(d.texto || '').substring(0, 60000)}`).join('\n') : ''}
${perguntas ? '\nPERGUNTAS ESPECÍFICAS DO SOLICITANTE (responda de forma direta, com números quando houver, e dê sua opinião clara): ' + perguntas : ''}

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
  "perguntas_respondidas": "${perguntas ? 'Resposta direta e fundamentada às perguntas do solicitante, usando os números dos documentos, com opinião final clara (sim/não/depende de quê)' : 'Nenhuma pergunta específica'}",
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
    // v3.03: 2.500 tokens cortavam a resposta no meio (JSON quebrado → tela com "—")
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages })
  });
  const d = await resp.json();
  if (!resp.ok) throw new Error(d.error?.message || 'Erro Claude');
  const texto = (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  const analise = parseJSON(texto);
  if (analise.erro) throw new Error(d.stop_reason === 'max_tokens' ? 'A análise ficou longa demais e foi cortada. Tente "Análise Rápida" ou reduza a descrição.' : 'A IA não devolveu a análise no formato esperado. Tente de novo.');
  console.log(`[S1-03] Análise: ${tituloFinal} — score ${analise.score}/10 — ${analise.recomendacao}`);
  return { success: true, analise, pipeline_stage: 'Em Análise' };
}

// ── v3.35 JURÍDICO: ANÁLISE DE CONTRATO como advogado interno da Atlantyx ─────────────────
// Recebe o texto do contrato (PDF/DOCX lido no navegador), os comentários do documento e os da equipe,
// e devolve a análise de risco cláusula a cláusula + o roteiro e o resumo para a conversa com a contraparte.
async function analisarContrato({ titulo, contraparte, tipo, papel, objetivos, comentarios_equipe, comentarios_documento = [], texto = '', valor, prazo, modo }) {
  const corpo = String(texto || '').trim();
  if (corpo.length < 200) throw new Error('Anexe o contrato (PDF, DOCX ou TXT) ou cole o texto — não recebi conteúdo suficiente para analisar.');
  const LIM = 150000;
  const textoEnviado = corpo.length > LIM ? corpo.substring(0, LIM) + '\n[... contrato truncado para análise ...]' : corpo;
  const comDoc = (Array.isArray(comentarios_documento) ? comentarios_documento : []).slice(0, 80)
    .map((c, i) => `${i + 1}. ${c.autor ? '[' + c.autor + '] ' : ''}${c.trecho ? '(sobre: "' + String(c.trecho).substring(0, 160) + '") ' : ''}${String(c.texto || '').substring(0, 600)}`).join('\n');
  const system = `Você é o ADVOGADO CORPORATIVO INTERNO da Atlantyx (Atlanteam Soluções em TI), empresa brasileira B2B de dados, BI, engenharia de dados e IA, com três frentes: projetos sob medida, sustentação com SLA e alocação de profissionais, além de produtos de IA próprios. Clientes típicos: grandes empresas (energia, utilities, financeiro, automotivo) e, às vezes, órgãos públicos.
Você analisa contratos DEFENDENDO OS INTERESSES DA ATLANTYX, com base na legislação brasileira (Código Civil, LGPD, Lei 13.429/2017 e riscos de vínculo trabalhista na alocação, Lei 14.133/2021 quando houver ente público, Lei de Software/PI, Código de Processo Civil quanto a foro e arbitragem).
Seja concreto: cite a cláusula (número ou título) e um trecho curto; explique o risco prático para a Atlantyx (dinheiro, prazo, responsabilidade, PI, pessoas); proponha redação alternativa pronta para usar.
Pontos que você SEMPRE verifica: objeto e escopo (aberto demais?), critérios de aceite, preço/reajuste/forma e prazo de pagamento, retenções e glosas, multas e penalidades (proporcionalidade, teto), limitação de responsabilidade (teto, exclusão de lucros cessantes/danos indiretos), indenizações, SLA e penalidade de SLA, propriedade intelectual (código, modelos de IA, know-how prévio da Atlantyx), confidencialidade, LGPD (papéis controlador/operador, incidentes), não aliciamento, subcontratação, vínculo trabalhista/ responsabilidade solidária na alocação, rescisão (aviso, multa, pagamento do executado), vigência e renovação, foro/arbitragem, garantias e seguros, exclusividade, cessão.
Responda APENAS com JSON válido, em português do Brasil, sem markdown.`;
  const user = `CONTRATO: ${titulo || '(sem título)'}
Tipo: ${tipo || 'não informado'} · Papel da Atlantyx: ${papel || 'Contratada (fornecedora)'} · Contraparte: ${contraparte || 'não informada'}${valor ? ' · Valor: ' + valor : ''}${prazo ? ' · Prazo: ' + prazo : ''}
Objetivos da Atlantyx nesta negociação: ${objetivos || 'proteger margem, limitar responsabilidade e garantir pagamento do que for executado'}
${comentarios_equipe ? 'COMENTÁRIOS DA EQUIPE ATLANTYX:\n' + String(comentarios_equipe).substring(0, 6000) + '\n' : ''}${comDoc ? 'COMENTÁRIOS ENCONTRADOS NO DOCUMENTO (revisões/anotações):\n' + comDoc + '\n' : ''}
TEXTO DO CONTRATO:
"""
${textoEnviado}
"""

Devolva este JSON (preencha tudo que o contrato permitir; use [] quando não houver):
{
 "resumo_executivo": "4-6 linhas para o CEO: o que é, principais riscos, recomendação",
 "recomendacao": "ASSINAR | ASSINAR COM AJUSTES | NEGOCIAR ANTES DE ASSINAR | NÃO ASSINAR",
 "nivel_risco": "baixo | medio | alto | critico",
 "nota_risco": 0,
 "dados_contrato": {"partes":"","objeto":"","valor":"","pagamento":"","prazo_vigencia":"","reajuste":"","renovacao":"","foro":""},
 "clausulas_criticas": [{"clausula":"nº/título","tema":"","trecho":"citação curta","risco":"alto|medio|baixo","problema":"","impacto_para_atlantyx":"","redacao_sugerida":"","prioridade":1}],
 "clausulas_ausentes": [{"tema":"","por_que_importa":"","redacao_sugerida":""}],
 "obrigacoes_atlantyx": [{"obrigacao":"","prazo":"","penalidade":""}],
 "financeiro": {"multas":"","limitacao_responsabilidade":"","retencoes_glosas":"","garantias":"","exposicao_maxima_estimada":""},
 "comentarios_analisados": [{"comentario":"","autor":"","analise":"","posicao_recomendada":""}],
 "conversa_contraparte": {
   "objetivo": "o que precisamos sair da reunião tendo conseguido",
   "tom": "como conduzir",
   "abertura": "fala de abertura sugerida",
   "pontos": [{"tema":"","nossa_posicao":"","argumento":"","proposta_redacao":"","alternativa_aceitavel":"","limite":"o que não aceitamos"}],
   "concessoes_possiveis": [""],
   "perguntas_para_contraparte": [""],
   "resumo_para_enviar": "e-mail/mensagem cordial e profissional para a contraparte, em nome da Atlantyx, listando os ajustes pedidos e a justificativa, pronto para enviar"
 },
 "contraproposta": {
   "titulo": "Contraproposta da Atlantyx — <contrato>",
   "introducao": "parágrafo formal de abertura à contraparte",
   "itens": [{"clausula":"nº/título","situacao_atual":"resumo do que está no contrato","texto_proposto":"redação completa proposta pela Atlantyx","justificativa":"por que é justo para as duas partes"}],
   "condicoes_comerciais": ["condições de preço, pagamento, reajuste, prazo, SLA que a Atlantyx propõe"],
   "pontos_aceitos": ["o que a Atlantyx aceita como está, para mostrar boa-fé"],
   "validade": "prazo de validade da contraproposta",
   "fechamento": "parágrafo final cordial propondo reunião para alinhamento"
 },
 "parecer_final": "parecer do advogado, objetivo, em 1-2 parágrafos"
}
${modo === 'rapida' ? 'MODO RÁPIDO: limite clausulas_criticas às 6 mais importantes e pontos da conversa aos 5 principais.' : 'Liste TODAS as cláusulas que merecem ajuste, ordenadas por prioridade.'}${comDoc || comentarios_equipe ? ' Responda CADA comentário em comentarios_analisados.' : ''}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: modo === 'rapida' ? 6000 : 14000, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await resp.json();
  if (!resp.ok) throw new Error(d.error?.message || 'Erro na IA');
  const raw = (d.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  const analise = parseJSON(raw);
  if (analise.erro) throw new Error(d.stop_reason === 'max_tokens' ? 'A análise ficou longa demais e foi cortada — use "Análise rápida" ou anexe só o contrato principal.' : 'A IA não devolveu a análise no formato esperado. Tente de novo.');
  return { success: true, analise, caracteres_analisados: textoEnviado.length, truncado: corpo.length > LIM };
}

// v3.35 — PROPOSTA DE NEGOCIAÇÃO a partir da análise da ideia: o que a Atlantyx propõe à outra parte
// (cliente, parceiro, investidor ou fornecedor) — ou a CONTRAPROPOSTA, quando a ideia veio de uma oferta deles
async function propostaNegociacaoIdeia({ titulo, desc, origem, cat, analise = {}, destinatario = 'Cliente', tipo = 'proposta', contexto_extra = '' }) {
  if (!titulo) throw new Error('Analise a ideia antes de gerar a proposta');
  const system = `Você é o diretor comercial e de parcerias da Atlantyx (empresa brasileira B2B de dados, BI, engenharia de dados e IA para grandes empresas; 17 anos; clientes como CPFL Energia, Enel, Caixa Capitalização, Grupo Jelta). Monte propostas de negociação claras, profissionais e defensáveis, que protejam a margem e o caixa da Atlantyx e sejam atraentes para a outra parte. Não invente números exatos sem base: quando estimar, use faixas e diga que são estimativas. Responda APENAS JSON válido em português do Brasil.`;
  const user = `IDEIA: ${titulo}
Descrição: ${String(desc || '').substring(0, 4000)}
Origem: ${origem || '—'} · Categoria: ${cat || '—'}
ANÁLISE JÁ FEITA (resumo): ${JSON.stringify({ score: analise.score, recomendacao: analise.recomendacao, resumo: analise.resumo_executivo, mercado: analise.mercado, viabilidade: analise.viabilidade_financeira, prazo: analise.prazo_desenvolvimento, riscos: analise.riscos, proximos_passos: analise.proximos_passos }).substring(0, 6000)}
Destinatário da negociação: ${destinatario}
Tipo: ${tipo === 'contraproposta' ? 'CONTRAPROPOSTA (a outra parte fez uma oferta; a Atlantyx responde com novas condições)' : 'PROPOSTA (a Atlantyx toma a iniciativa)'}
${contexto_extra ? 'Contexto adicional / oferta recebida: ' + String(contexto_extra).substring(0, 3000) : ''}

Devolva:
{
 "tipo": "proposta | contraproposta",
 "destinatario": "",
 "titulo": "",
 "contexto": "por que estamos propondo isto agora (2-3 linhas)",
 "proposta_de_valor": "o que a outra parte ganha",
 "escopo": ["entregas/etapas"],
 "modelo_comercial": {"formato":"ex.: projeto fechado, mensalidade, revenue share, piloto pago","valor_ou_faixa":"","condicoes_pagamento":"","prazo":"","reajuste":""},
 "piloto": "proposta de piloto/prova de conceito se fizer sentido",
 "contrapartidas_solicitadas": ["o que pedimos em troca: dados, sponsor, exclusividade, caso de sucesso..."],
 "concessoes_possiveis": ["o que podemos ceder se necessário"],
 "limites": ["o que não aceitamos"],
 "riscos_e_mitigacoes": ["risco → como tratamos na proposta"],
 "proximos_passos": ["passo com prazo"],
 "mensagem_para_enviar": "e-mail profissional pronto para enviar ao destinatário em nome da Atlantyx"
}`;
  const raw = await claude(system, user, 5000);
  const proposta = parseJSON(raw);
  if (proposta.erro) throw new Error('A IA não devolveu a proposta no formato esperado. Tente de novo.');
  return { success: true, proposta };
}

// ── v3.37: CONVERSA COM A IA sobre uma ideia (dados + análise + BP + documentos) ──
async function chatIdeia({ ideia = {}, analise = null, proposta = null, bp = null, docs_texto = [], mensagens = [] }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  const corta = (v, n) => String(v ?? '').substring(0, n);
  const js = (v, n) => v ? corta(JSON.stringify(v), n) : '';
  // documentos: até ~140 mil caracteres no total, divididos entre os arquivos
  const docs = (Array.isArray(docs_texto) ? docs_texto : []).filter(d => d && d.texto).slice(0, 8);
  const porDoc = docs.length ? Math.floor(140000 / docs.length) : 0;
  const docsTxt = docs.map(d => `=== DOCUMENTO: ${corta(d.nome, 160)} ===\n${corta(d.texto, porDoc)}`).join('\n\n');
  const contexto = `IDEIA: ${corta(ideia.titulo, 300)}
Origem: ${ideia.origem || '—'} · Categoria: ${ideia.cat || ideia.categoria || '—'} · Etapa: ${ideia.stage || '—'}
Descrição:
${corta(ideia.desc || ideia.descricao, 8000)}
${ideia.notas ? '\nNotas do fundador / decisões:\n' + corta(ideia.notas, 3000) : ''}
${analise ? '\nANÁLISE DA IA (S1-03):\n' + js(analise, 12000) : '\n(ainda sem análise da IA)'}
${ideia.resultados_s1 ? '\nPESQUISA / MODELO / PARECER DO COMITÊ:\n' + js(ideia.resultados_s1, 8000) : ''}
${proposta ? '\nPROPOSTA/CONTRAPROPOSTA JÁ GERADA:\n' + js(proposta, 6000) : ''}
${bp ? '\nBUSINESS PLAN (valores em R$; premissas que alimentam o cálculo e resultado):\n' + js(bp, 14000) : ''}
${docsTxt ? '\nDOCUMENTOS ANEXADOS (texto extraído):\n' + docsTxt : '\n(nenhum documento anexado)'}`;

  const system = [
    { type: 'text', text: `Você é o conselheiro de negócios do CEO da Atlantyx (empresa brasileira B2B de dados, BI, engenharia de dados e IA; 17 anos; clientes como CPFL Energia, Enel, Caixa Capitalização, Grupo Jelta). Você conversa com o fundador sobre UMA ideia/oportunidade específica, cujo material completo está abaixo.
Seu papel:
- Tirar dúvidas sobre a ideia, os documentos, a análise e o business plan — sempre ancorado no material. Ao usar um documento, cite-o ("Proposta Comercial, seção 9"). Se algo NÃO está no material, diga claramente que não está, em vez de supor.
- Exercitar negociação: simular a outra parte quando pedido (responda no papel dela, de forma realista e dura), montar contrapropostas cláusula a cláusula, propor concessões e contrapartidas, apontar riscos e o que travar no contrato.
- Fazer contas quando útil (câmbio, revenue share, payback) mostrando a conta. Valores em R$ quando falar do BP; se o documento estiver em outra moeda, mostre as duas.
- Apontar inconsistências entre documentos, análise e BP.
Estilo: português do Brasil, direto, de executivo para executivo. Use parágrafos curtos, listas e **negrito** quando ajudar; tabelas simples em markdown são permitidas. Não invente fatos, números ou cláusulas que não estejam no material — quando estimar, diga que é estimativa.` },
    { type: 'text', text: 'MATERIAL DA IDEIA:\n' + contexto, cache_control: { type: 'ephemeral' } },
  ];

  // histórico: últimas 30 mensagens, alternando, começando pelo usuário
  let msgs = (Array.isArray(mensagens) ? mensagens : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .map(m => ({ role: m.role, content: corta(m.content, 12000) }))
    .slice(-30);
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const limpo = [];
  for (const m of msgs) { if (limpo.length && limpo[limpo.length - 1].role === m.role) limpo[limpo.length - 1].content += '\n\n' + m.content; else limpo.push(m); }
  if (!limpo.length || limpo[limpo.length - 1].role !== 'user') throw new Error('Escreva uma pergunta');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, messages: limpo }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'Erro Claude API ' + r.status);
  const resposta = (d.content || []).map(c => c.text || '').join('').trim();
  if (!resposta) throw new Error('A IA não respondeu. Tente de novo.');
  return { success: true, resposta, docs_usados: docs.map(x => x.nome) };
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
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Erro Claude API');
  return d.content[0].text;
}

function parseJSON(text) {
  const t = String(text || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  // v3.03: tolera texto antes/depois do JSON
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(t.substring(i, j + 1)); } catch (_) {} }
  return { erro: 'JSON inválido', raw: t.substring(0, 200) };
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

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 's1-strategy');
