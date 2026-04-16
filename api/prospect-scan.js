// api/prospect-scan.js
// S2-02 Agente de Mapeamento de Contas + S7-01 Agente de Prospecção Ativa
// Varre o ICP, identifica empresas-alvo, cria no HubSpot e inicia outreach

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const {
      modo = 'padrao',
      empresa_alvo,
      cargos,
      modo: _m,
      setor = 'Energia',
      regiao = 'Sudeste',
      faturamento_min = '100M',
      cargo_decisor = 'CIO, CTO, Diretor de TI',
      quantidade = 10,
      iniciar_outreach = false,
    } = req.body;

    // ── MODO CADEIA C-LEVEL ──────────────────────────────────────────
    if (modo === 'cadeia_clevel') {
      const empresa = empresa_alvo || 'Empresa não informada';
      const cargosAlvo = cargos || ['CIO / Diretor de TI', 'CTO', 'Dir. Transformacao Digital'];
      console.log(`[S2-02+S7-04] Mapeando cadeia C-Level: ${empresa} | ${cargosAlvo.length} cargos`);
      const decisores = await mapearCadeiaCLevel(empresa, setor, cargosAlvo, '');
      return res.status(200).json({ success: true, modo: 'cadeia_clevel', empresa, decisores, total: decisores.length });
    }

    console.log(`[S2-02] Iniciando mapeamento: ${setor} | ${regiao} | Meta: ${quantidade} empresas`);

    // ── 1. CLAUDE S2-02 — Mapear empresas do ICP ──
    const empresas = await mapearEmpresas({ setor, regiao, faturamento_min, cargo_decisor, quantidade });
    console.log(`[S2-02] ${empresas.length} empresas mapeadas`);

    // ── 2. Para cada empresa — criar no HubSpot como Company ──
    const resultados = [];
    for (const empresa of empresas) {
      try {
        const hubspotId = await criarEmpresaHubSpot(empresa);
        console.log(`[HubSpot] Empresa criada: ${empresa.nome} (${hubspotId})`);

        // ── 3. Se iniciar_outreach, chamar S7-04 para mapear decisores ──
        if (iniciar_outreach && empresa.decisor_nome) {
          const contatoId = await criarContatoHubSpot(empresa, hubspotId);
          await associarContatoEmpresa(contatoId, hubspotId);
          console.log(`[S7-01] Contato ${empresa.decisor_nome} associado à ${empresa.nome}`);
        }

        resultados.push({ empresa: empresa.nome, score: empresa.score, hubspot_id: hubspotId, decisor: empresa.decisor_nome });
      } catch (e) {
        console.error(`[ERRO] ${empresa.nome}:`, e.message);
        resultados.push({ empresa: empresa.nome, erro: e.message });
      }
    }

    // ── 4. Notificar via WhatsApp com resumo ──
    const scoreA = resultados.filter(r => !r.erro && empresas.find(e => e.nome === r.empresa)?.score === 'A').length;
    await notificarWhatsApp(
      `[S2-02 · Mapeamento Concluído]\n\n` +
      `Setor: ${setor}\nEmpresas mapeadas: ${resultados.length}\nScore A (quentes): ${scoreA}\n\n` +
      `Acesse o painel para ver a lista completa e aprovar o outreach.`
    );

    return res.status(200).json({
      success: true,
      total_mapeado: resultados.length,
      score_a: scoreA,
      outreach_iniciado: iniciar_outreach,
      empresas: resultados,
    });

  } catch (error) {
    console.error('[ERRO prospect-scan]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function mapearEmpresas({ setor, regiao, faturamento_min, cargo_decisor, quantidade }) {
  const system = `Você é o Agente S2-02 de Mapeamento de Contas da Atlantyx.
Missão: identificar empresas reais que se encaixam no ICP da Atlantyx.

ICP ATLANTYX:
- Problema que resolve: decisões tomadas com dados atrasados/inconsistentes → perda financeira
- Solução: BI, Engenharia de Dados, Analytics, IA, integração de sistemas
- Entrega: Quick Wins em semanas, ROI mensurável, integra com sistemas existentes

SCORE DA EMPRESA:
- A (quente): tem sinal de compra ativo (RFP aberta, novo ERP, BI falhou, novo C-level)
- B (morno): perfil correto mas sem sinal imediato
- C (frio): perfil secundário

Retorne APENAS um JSON array válido, sem markdown.`;

  const user = `Mapeie ${quantidade} empresas reais para prospecção da Atlantyx:
Setor: ${setor}
Região: ${regiao}  
Faturamento mínimo: R$${faturamento_min}
Cargo do decisor alvo: ${cargo_decisor}

Para cada empresa retorne:
{
  "nome": "Nome da empresa",
  "cnpj": "se conhecido",
  "setor": "subsetor específico",
  "faturamento_estimado": "ex: R$2B",
  "regiao": "estado/cidade sede",
  "decisor_nome": "nome do decisor se conhecido",
  "decisor_cargo": "cargo exato",
  "decisor_linkedin": "URL LinkedIn se disponível",
  "sinal_compra": "sinal específico identificado ou null",
  "score": "A | B | C",
  "justificativa_score": "por que esse score",
  "dores_provaveis": "principais dores de dados desta empresa/setor"
}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  try {
    const text = d.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch { return []; }
}

async function criarEmpresaHubSpot(empresa) {
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      properties: {
        name: empresa.nome,
        industry: empresa.setor,
        annualrevenue: empresa.faturamento_estimado,
        city: empresa.regiao,
        icp_score: empresa.score,
        sinal_compra: empresa.sinal_compra || '',
        dores_provaveis: empresa.dores_provaveis || '',
      }
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`HubSpot company: ${d.message}`);
  return d.id;
}

async function criarContatoHubSpot(empresa, companyId) {
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      properties: {
        firstname: empresa.decisor_nome?.split(' ')[0] || '',
        lastname: empresa.decisor_nome?.split(' ').slice(1).join(' ') || '',
        jobtitle: empresa.decisor_cargo || '',
        company: empresa.nome,
        hs_lead_status: 'NEW',
        icp_score: empresa.score,
        linkedin_url: empresa.decisor_linkedin || '',
      }
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`HubSpot contact: ${d.message}`);
  return d.id;
}

async function associarContatoEmpresa(contactId, companyId) {
  await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/1`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` }
  });
}

async function notificarWhatsApp(message) {
  const phone = process.env.FUNDADOR_WHATSAPP;
  if (!phone) return;
  await fetch(`https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone, message }),
  });
}

// ── MODO CADEIA C-LEVEL ────────────────────────────────────────────────────────
export async function mapearCadeiaCLevel(empresa, setor, cargos, contexto) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `Você é o Agente S2-02 + S7-04 da Atlantyx — especialista em mapeamento de decisores C-level.
A Atlantyx vende: BI, Dados e IA para grandes empresas (R$100M+).
Problema que resolve: dados desconectados = decisões erradas = perda financeira.
Retorne APENAS JSON array válido.`,
      messages: [{
        role: 'user',
        content: `Mapeie a cadeia completa de decisores C-level de:
Empresa: ${empresa}
Setor: ${setor}
Cargos a mapear: ${cargos.join(', ')}
Contexto: ${contexto || 'grande empresa brasileira do setor'}

Para cada cargo retorne:
{
  "cargo": "cargo exato",
  "nome": "nome provável (se empresa conhecida) ou 'A identificar via LinkedIn'",
  "prioridade": "Alta | Media | Baixa",
  "perfil": "descrição do perfil típico deste cargo nesta empresa",
  "dores": ["dor principal relacionada a dados/BI", "dor secundária"],
  "angulo_abordagem": "como abordar este decisor especificamente",
  "mensagem_wa": "mensagem WhatsApp personalizada de 4-5 linhas para este cargo especificamente na ${empresa}",
  "canal_preferido": "LinkedIn | WhatsApp | E-mail | Ligação",
  "linkedin": "URL do perfil LinkedIn se empresa conhecida, senão null",
  "objecao_provavel": "principal objeção deste cargo",
  "resposta_objecao": "como responder a objeção"
}`
      }]
    })
  });

  const d = await r.json();
  const text = d.content[0].text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return [];
  }
}
