// api/s1-data.js
// Leitor de Dados para os Agentes S1 — QuickBooks + Google Drive
// Alimenta o planejamento estratégico com dados reais da empresa

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { action, params = {} } = req.body;

    const acoes = {
      // QuickBooks
      qb_relatorio_completo:   () => qbRelatorioCompleto(),
      qb_dre:                  () => qbDRE(params),
      qb_fluxo_caixa:          () => qbFluxoCaixa(params),
      qb_balanco:              () => qbBalanco(params),
      qb_clientes:             () => qbClientes(),
      qb_contas_receber:       () => qbContasReceber(),
      // Google Drive
      drive_listar:            () => driveLista(params),
      drive_ler_documento:     () => driveDocument(params),
      drive_resumir_pasta:     () => driveResumirPasta(params),
      // Análise combinada — QuickBooks + Drive + Claude S1
      analisar_financeiro:     () => analisarFinanceiro(),
      contexto_estrategico:    () => contextoEstrategico(),
    };

    if (!acoes[action]) return res.status(400).json({
      error: 'Acao invalida',
      disponiveis: Object.keys(acoes)
    });

    const resultado = await acoes[action]();
    return res.status(200).json({ success: true, action, ...resultado });

  } catch (error) {
    console.error('[ERRO s1-data]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUICKBOOKS — Dados Financeiros Reais
// ═══════════════════════════════════════════════════════════════════════════════

async function qbToken() {
  // QuickBooks usa OAuth2 — o Access Token expira em 1h
  // Refresh automaticamente usando o Refresh Token
  const refreshToken = process.env.QB_REFRESH_TOKEN;
  const clientId     = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('QuickBooks nao configurado. Configure QB_CLIENT_ID, QB_CLIENT_SECRET e QB_REFRESH_TOKEN no Vercel.');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
  });

  const d = await r.json();
  if (!r.ok || !d.access_token) {
    throw new Error(`QuickBooks OAuth erro: ${d.error_description || d.error || 'Token invalido'}`);
  }

  return d.access_token;
}

async function qbFetch(endpoint, token) {
  const realmId = process.env.QB_REALM_ID;
  if (!realmId) throw new Error('QB_REALM_ID nao configurado');

  const base = process.env.QB_SANDBOX === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';

  const r = await fetch(`${base}/v3/company/${realmId}${endpoint}&minorversion=65`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    }
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`QuickBooks API ${endpoint}: ${r.status} — ${JSON.stringify(err).substring(0, 200)}`);
  }
  return r.json();
}

// DRE — Demonstrativo de Resultados
async function qbDRE({ periodo = 'This Fiscal Year' } = {}) {
  const token = await qbToken();
  const data = await qbFetch(`/reports/ProfitAndLoss?date_macro=${encodeURIComponent(periodo)}&summarize_column_by=Month`, token);

  const linhas = extrairLinhasRelatorio(data);
  console.log(`[QB] DRE carregado: ${linhas.length} linhas`);
  return { dre: linhas, periodo, fonte: 'QuickBooks' };
}

// Fluxo de Caixa
async function qbFluxoCaixa({ periodo = 'This Fiscal Year' } = {}) {
  const token = await qbToken();
  const data = await qbFetch(`/reports/CashFlow?date_macro=${encodeURIComponent(periodo)}`, token);

  const linhas = extrairLinhasRelatorio(data);
  console.log(`[QB] Fluxo de caixa: ${linhas.length} linhas`);
  return { fluxo_caixa: linhas, periodo, fonte: 'QuickBooks' };
}

// Balanço Patrimonial
async function qbBalanco({ data_ref = '' } = {}) {
  const token = await qbToken();
  const param = data_ref ? `&end_date=${data_ref}` : '&date_macro=Today';
  const data = await qbFetch(`/reports/BalanceSheet?${param}`, token);

  const linhas = extrairLinhasRelatorio(data);
  return { balanco: linhas, fonte: 'QuickBooks' };
}

// Clientes e Receita por Cliente
async function qbClientes() {
  const token = await qbToken();
  const data = await qbFetch(`/reports/CustomerSales?date_macro=This+Fiscal+Year&summarize_column_by=Customer`, token);

  const linhas = extrairLinhasRelatorio(data);
  return { clientes: linhas, fonte: 'QuickBooks' };
}

// Contas a Receber
async function qbContasReceber() {
  const token = await qbToken();
  const data = await qbFetch(`/reports/AgedReceivables?date_macro=Today`, token);

  const linhas = extrairLinhasRelatorio(data);
  return { contas_receber: linhas, fonte: 'QuickBooks' };
}

// Relatório Financeiro Completo
async function qbRelatorioCompleto() {
  const token = await qbToken();

  // Buscar DRE, Clientes e Contas a Receber em paralelo
  const [dreData, clientesData, crData] = await Promise.allSettled([
    qbFetch('/reports/ProfitAndLoss?date_macro=This+Fiscal+Year&summarize_column_by=Month', token),
    qbFetch('/reports/CustomerSales?date_macro=This+Fiscal+Year', token),
    qbFetch('/reports/AgedReceivables?date_macro=Today', token),
  ]);

  return {
    dre:             dreData.status === 'fulfilled' ? extrairLinhasRelatorio(dreData.value) : [],
    clientes:        clientesData.status === 'fulfilled' ? extrairLinhasRelatorio(clientesData.value) : [],
    contas_receber:  crData.status === 'fulfilled' ? extrairLinhasRelatorio(crData.value) : [],
    fonte: 'QuickBooks',
    timestamp: new Date().toISOString(),
  };
}

function extrairLinhasRelatorio(data) {
  const linhas = [];
  const rows = data?.Rows?.Row || [];

  function processRow(row, nivel = 0) {
    if (row.type === 'Section') {
      const header = row.Header?.ColData?.[0]?.value;
      if (header) linhas.push({ tipo: 'secao', label: header, nivel, valor: null });
      (row.Rows?.Row || []).forEach(r => processRow(r, nivel + 1));
      const summary = row.Summary?.ColData;
      if (summary) {
        const label = summary[0]?.value;
        const valor = parseFloat(summary[summary.length - 1]?.value || 0);
        if (label) linhas.push({ tipo: 'total', label, nivel, valor });
      }
    } else if (row.type === 'Data') {
      const cols = row.ColData || [];
      const label = cols[0]?.value;
      const valor = parseFloat(cols[cols.length - 1]?.value || 0);
      if (label && label !== '') linhas.push({ tipo: 'linha', label, nivel, valor });
    }
  }

  rows.forEach(r => processRow(r));
  return linhas;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE — Documentos Estratégicos
// ═══════════════════════════════════════════════════════════════════════════════

async function driveToken() {
  // Usar o mesmo token do Gmail se configurado (mesma conta Google)
  // Ou token específico do Drive
  const accessToken = process.env.DRIVE_ACCESS_TOKEN || process.env.GMAIL_ACCESS_TOKEN;
  if (!accessToken) throw new Error('Drive nao configurado. Configure DRIVE_ACCESS_TOKEN no Vercel.');
  return accessToken;
}

// Listar documentos de uma pasta
async function driveLista({ folder_id, folder_name } = {}) {
  const token = await driveToken();

  // Se não tiver folder_id, buscar pela pasta configurada
  const folderId = folder_id || process.env.DRIVE_FOLDER_ID;

  let query = folderId
    ? `'${folderId}' in parents and trashed=false`
    : `name contains '${folder_name || 'Atlantyx'}' and trashed=false`;

  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!r.ok) throw new Error(`Drive API: ${r.status}`);
  const data = await r.json();

  console.log(`[Drive] ${data.files?.length || 0} arquivos encontrados`);
  return {
    arquivos: data.files || [],
    pasta_id: folderId,
    total: data.files?.length || 0,
    fonte: 'Google Drive'
  };
}

// Ler conteúdo de um documento
async function driveDocument({ file_id, file_name } = {}) {
  if (!file_id && !file_name) throw new Error('Informe file_id ou file_name');
  const token = await driveToken();

  let id = file_id;

  // Se tiver só nome, buscar o ID primeiro
  if (!id && file_name) {
    const searchR = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name contains '${file_name}' and trashed=false`)}&fields=files(id,name,mimeType)&pageSize=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchR.json();
    const arquivo = searchData.files?.[0];
    if (!arquivo) throw new Error(`Arquivo "${file_name}" nao encontrado no Drive`);
    id = arquivo.id;
  }

  // Buscar metadados para saber o tipo
  const metaR = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaR.json();

  let conteudo = '';

  if (meta.mimeType === 'application/vnd.google-apps.document') {
    // Google Docs — exportar como texto
    const exportR = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    conteudo = await exportR.text();
  } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
    // Google Sheets — exportar como CSV
    const exportR = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/csv`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    conteudo = await exportR.text();
  } else if (meta.mimeType === 'application/pdf') {
    // PDF — baixar e extrair texto básico
    conteudo = '[PDF — conteúdo binário — use Google Docs para melhor extração]';
  } else {
    // Outros formatos — baixar como texto
    const downloadR = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    conteudo = await downloadR.text();
  }

  // Limitar tamanho para análise
  const conteudoLimitado = conteudo.substring(0, 15000);

  console.log(`[Drive] Documento lido: ${meta.name} (${conteudoLimitado.length} chars)`);
  return {
    arquivo: { id, nome: meta.name, tipo: meta.mimeType },
    conteudo: conteudoLimitado,
    truncado: conteudo.length > 15000,
    fonte: 'Google Drive'
  };
}

// Resumir toda uma pasta com Claude
async function driveResumirPasta({ folder_id, folder_name, pergunta } = {}) {
  const token = await driveToken();

  // 1. Listar arquivos da pasta
  const { arquivos } = await driveLista({ folder_id, folder_name });
  if (!arquivos.length) return { resumo: 'Pasta vazia ou não encontrada', documentos: [] };

  // 2. Ler conteúdo dos principais documentos (até 5)
  const documentos_lidos = [];
  const docsParaLer = arquivos
    .filter(f => ['application/vnd.google-apps.document',
                  'application/vnd.google-apps.spreadsheet',
                  'text/plain'].includes(f.mimeType))
    .slice(0, 5);

  for (const doc of docsParaLer) {
    try {
      const { conteudo } = await driveDocument({ file_id: doc.id });
      documentos_lidos.push({ nome: doc.nome || doc.name, conteudo: conteudo.substring(0, 3000) });
    } catch (e) {
      console.log(`[Drive] Erro ao ler ${doc.name}:`, e.message);
    }
  }

  // 3. Claude analisa e resume
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'Você é o assistente estratégico da Atlantyx. Analise documentos internos e extraia insights relevantes para o planejamento estratégico. Seja objetivo e direto.',
      messages: [{
        role: 'user',
        content: `${pergunta || 'Analise estes documentos e extraia os insights mais relevantes para o planejamento estratégico da Atlantyx.'}

Documentos da pasta:
${documentos_lidos.map(d => `=== ${d.nome} ===\n${d.conteudo}`).join('\n\n')}

Retorne JSON:
{
  "resumo_executivo": "resumo em 3-4 linhas dos documentos",
  "insights_chave": ["insight 1", "insight 2", "insight 3"],
  "dados_financeiros": {"receita": null, "custo": null, "margem": null},
  "riscos_identificados": ["risco 1"],
  "oportunidades": ["oportunidade 1"],
  "acoes_sugeridas": ["acao 1 — responsavel — prazo"]
}`
      }]
    })
  });

  const d = await r.json();
  const text = d.content[0].text.replace(/```json|```/g, '').trim();
  let analise = {};
  try { analise = JSON.parse(text); } catch { analise = { resumo_executivo: text.substring(0, 500) }; }

  return {
    pasta: folder_name || folder_id || 'Pasta Drive',
    total_arquivos: arquivos.length,
    documentos_analisados: documentos_lidos.length,
    analise,
    fonte: 'Google Drive + Claude S1'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANÁLISE COMBINADA — QuickBooks + Drive → Contexto Estratégico para S1
// ═══════════════════════════════════════════════════════════════════════════════

async function analisarFinanceiro() {
  // 1. Buscar dados reais do QuickBooks
  let dadosQB = null;
  try {
    dadosQB = await qbRelatorioCompleto();
    console.log('[S1-Data] QuickBooks: dados carregados');
  } catch (e) {
    console.log('[S1-Data] QuickBooks indisponível:', e.message);
  }

  // 2. Claude S1-04 analisa os dados financeiros reais
  const promptDados = dadosQB
    ? `Dados financeiros REAIS do QuickBooks:\n${JSON.stringify(dadosQB, null, 1)}`
    : 'QuickBooks não configurado. Use os dados do contexto da Atlantyx.';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: `Você é o Agente S1-04 (CFO-Agente) da Atlantyx.
Analise os dados financeiros reais e gere insights estratégicos.
A Atlantyx é empresa de BI/Dados/IA, meta R$5M em 90 dias.
Retorne APENAS JSON válido.`,
      messages: [{
        role: 'user',
        content: `${promptDados}

Retorne análise financeira estratégica:
{
  "saude_financeira": "Verde | Amarelo | Vermelho",
  "receita_atual": "valor real ou estimado",
  "despesas_principais": ["despesa 1 com valor", "despesa 2"],
  "margem_liquida": "X%",
  "runway": "X meses de caixa",
  "maior_cliente": "nome e valor se disponível",
  "contas_receber": "total em aberto",
  "alertas": ["alerta 1", "alerta 2"],
  "alavancas_lucro": ["o que fazer para aumentar margem"],
  "recomendacoes_cfo": ["recomendação 1", "recomendação 2"],
  "kpis_financeiros": {
    "receita_mes": 0,
    "custo_mes": 0,
    "ebitda": 0,
    "cac": 0,
    "ltv": 0
  }
}`
      }]
    })
  });

  const d = await r.json();
  const text = d.content[0].text.replace(/```json|```/g, '').trim();
  let analise = {};
  try { analise = JSON.parse(text); } catch {
    const m = text.match(/\{[\s\S]*\}/); if (m) { try { analise = JSON.parse(m[0]); } catch {} }
  }

  return {
    analise_financeira: analise,
    dados_quickbooks: dadosQB,
    fonte: dadosQB ? 'QuickBooks (dados reais) + Claude S1-04' : 'Claude S1-04 (QuickBooks pendente)',
    timestamp: new Date().toISOString()
  };
}

// Contexto Estratégico Completo — alimenta TODOS os agentes S1
async function contextoEstrategico() {
  const resultados = {};

  // 1. QuickBooks — dados financeiros
  try {
    const { analise_financeira } = await analisarFinanceiro();
    resultados.financeiro = analise_financeira;
  } catch (e) {
    resultados.financeiro = { erro: e.message };
  }

  // 2. Google Drive — documentos estratégicos
  const folderId = process.env.DRIVE_FOLDER_ID;
  if (folderId) {
    try {
      const driveData = await driveResumirPasta({
        folder_id: folderId,
        pergunta: 'Quais são os dados mais relevantes para o planejamento estratégico da Atlantyx?'
      });
      resultados.documentos_drive = driveData;
    } catch (e) {
      resultados.documentos_drive = { erro: e.message };
    }
  }

  // 3. Claude S1 consolida tudo em contexto estratégico
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: 'Você é o sistema de Inteligência Estratégica da Atlantyx. Consolide os dados em um contexto executivo claro.',
      messages: [{
        role: 'user',
        content: `Consolide estes dados em um contexto estratégico para o fundador:

DADOS FINANCEIROS: ${JSON.stringify(resultados.financeiro || {})}
DOCUMENTOS DRIVE: ${JSON.stringify(resultados.documentos_drive?.analise || {})}

Retorne JSON:
{
  "contexto_executivo": "resumo de 5 linhas do estado atual da empresa",
  "semaforo": "Verde | Amarelo | Vermelho",
  "prioridades_semana": ["prioridade 1", "prioridade 2", "prioridade 3"],
  "decisoes_urgentes": ["decisão que o fundador precisa tomar esta semana"],
  "oportunidades_imediatas": ["oportunidade para agir agora"]
}`
      }]
    })
  });

  const d = await r.json();
  const text = d.content[0].text.replace(/```json|```/g, '').trim();
  let contexto = {};
  try { contexto = JSON.parse(text); } catch {}

  return {
    contexto_estrategico: contexto,
    dados: resultados,
    timestamp: new Date().toISOString()
  };
}
