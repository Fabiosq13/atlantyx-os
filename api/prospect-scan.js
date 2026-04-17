// api/prospect-scan.js
// S2-02 Mapeamento de Contas — Prospecção de leads NOVOS com dados completos
// Fonte: Claude com base em dados públicos (LinkedIn, sites, notícias, relatórios setoriais)
// NÃO lê o HubSpot para buscar — apenas cria empresas/contatos novos no CRM

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
      setor = 'Energia',
      regiao = 'Sudeste',
      faturamento_min = '100M',
      cargo_decisor = 'CIO, CTO, Diretor de TI',
      quantidade = 15,
      iniciar_outreach = false,
    } = req.body;

    // ── MODO CADEIA C-LEVEL ──────────────────────────────────────────────────
    if (modo === 'cadeia_clevel') {
      const empresa = empresa_alvo || 'Empresa nao informada';
      const cargosAlvo = cargos || ['CIO / Diretor de TI', 'CTO', 'Dir. Transformacao Digital'];
      console.log(`[S2-02+S7-04] Cadeia C-Level: ${empresa}`);
      const decisores = await mapearCadeiaCLevel(empresa, setor, cargosAlvo);
      return res.status(200).json({ success: true, modo: 'cadeia_clevel', empresa, decisores, total: decisores.length });
    }

    // ── EXPANDIR CARGO SE "TODOS" ─────────────────────────────────────────────
    let cargoFinal = cargo_decisor;
    if (cargo_decisor === 'todos_clevel') {
      cargoFinal = 'CIO, CTO, CFO, CEO, COO, Diretor de TI, Diretor de Tecnologia, Diretor de Transformacao Digital, Diretor de Analytics, Diretor de Dados, VP de Tecnologia';
    } else if (cargo_decisor === 'todos') {
      cargoFinal = 'CIO, CTO, CFO, CEO, COO, Diretor de TI, Gerente de TI, Coordenador de TI, Diretor de Transformacao Digital, Diretor de Analytics, VP de Tecnologia, Head de Dados, Gerente de BI';
    }

    console.log(`[S2-02] Prospectando: ${setor} | ${regiao} | ${cargoFinal} | ${quantidade} leads novos`);

    // ── CLAUDE PROSPECTA COM DADOS COMPLETOS DE FONTES PÚBLICAS ──────────────
    const empresas = await mapearEmpresas({ setor, regiao, faturamento_min, cargo_decisor: cargoFinal, quantidade });
    console.log(`[S2-02] ${empresas.length} leads novos encontrados`);

    // ── CRIAR NO HUBSPOT ──────────────────────────────────────────────────────
    const resultados = [];
    for (const empresa of empresas) {
      try {
        let hubspotId = null;
        if (process.env.HUBSPOT_TOKEN) {
          hubspotId = await criarEmpresaHubSpot(empresa);
          if (iniciar_outreach && empresa.decisor_nome && empresa.decisor_nome !== 'A identificar') {
            const contatoId = await criarContatoHubSpot(empresa, hubspotId);
            await associarContatoEmpresa(contatoId, hubspotId);
          }
        }
        resultados.push({ ...empresa, hubspot_id: hubspotId });
      } catch (e) {
        console.error(`[ERRO HubSpot] ${empresa.nome}:`, e.message);
        resultados.push({ ...empresa, hubspot_id: null, erro_hubspot: e.message });
      }
    }

    // Ordenar: Score A → B → C
    resultados.sort((a, b) => ({ A: 0, B: 1, C: 2 }[a.score] ?? 1) - ({ A: 0, B: 1, C: 2 }[b.score] ?? 1));

    const scoreA = resultados.filter(r => r.score === 'A').length;

    if (process.env.FUNDADOR_WHATSAPP && process.env.ZAPI_INSTANCE) {
      await notificarWhatsApp(
        `[S2-02 · Prospecção Concluída]\n\nSetor: ${setor}\nLeads novos: ${resultados.length}\nScore A (quentes): ${scoreA}\n\nAcesse o painel S2 → Prospecção para ver os dados completos e iniciar o outreach.`
      );
    }

    return res.status(200).json({
      success: true,
      total_mapeado: resultados.length,
      score_a: scoreA,
      novos_mapeados: resultados.length,
      setor,
      regiao,
      cargo_buscado: cargoFinal,
      empresas: resultados,
    });

  } catch (error) {
    console.error('[ERRO prospect-scan]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// ── MAPEAR EMPRESAS — CLAUDE COMO AGENTE DE INTELIGÊNCIA COMERCIAL ────────────
async function mapearEmpresas({ setor, regiao, faturamento_min, cargo_decisor, quantidade }) {

  const system = `Você é o Agente S2-02 de Inteligência Comercial da Atlantyx.
Missão: prospectar leads 100% novos com dados completos baseados em informações públicas.

FONTES que você usa mentalmente para gerar dados precisos:
- LinkedIn (perfis públicos de executivos brasileiros)
- Sites institucionais e relatórios anuais das empresas
- Notícias do setor (Valor Econômico, Exame, InfoMoney, Folha)
- Rankings setoriais (Melhores e Maiores Exame, Forbes Brasil, IBGE setorial)
- Associações setoriais (ABRADEE, ANFAVEA, ABRAS, CNI, etc.)

REGRAS ABSOLUTAS:
1. Retorne APENAS empresas REAIS — nomes reais que existem no Brasil
2. Dados do decisor: use nomes reais quando conhecidos de fontes públicas. Se não souber o nome exato, indique o cargo e deixe nome como "A identificar via LinkedIn"
3. NUNCA invente CNPJ ou e-mail — indique o formato padrão quando não souber
4. Seja específico: subsetor exato, faturamento baseado em dados públicos reais
5. Sinal de compra: use eventos reais (fusão, novo ERP anunciado, novo C-level, expansão)
6. Retorne APENAS JSON array válido, sem markdown`;

  const user = `Prospecte ${quantidade} empresas com leads NOVOS e dados completos para a Atlantyx.

CRITÉRIOS DE BUSCA:
- Setor: ${setor}
- Região: ${regiao}
- Faturamento mínimo: R$${faturamento_min}/ano
- Cargo do decisor alvo: ${cargo_decisor}

A ATLANTYX RESOLVE: dados desconectados → decisões erradas → perda financeira
SOLUÇÃO: BI, Engenharia de Dados, Analytics, IA, Dashboards, Integração de Sistemas
DIFERENCIAL: Quick Wins em semanas, ROI mensurável

SCORE:
- A (quente): sinal de compra ativo — novo ERP, BI falhou, novo C-level, expansão, M&A recente
- B (morno): perfil correto, sem sinal imediato mas alta probabilidade
- C (frio): perfil secundário

Para cada empresa retorne objeto COMPLETO:
{
  "nome": "Nome real da empresa (ex: Grupo Energisa SA, Usiminas SA, Raia Drogasil)",
  "cnpj": "XX.XXX.XXX/0001-XX se conhecido, senão null",
  "setor": "subsetor específico ex: Distribuição de Energia Elétrica",
  "faturamento_estimado": "R$X.XB/ano baseado em dados públicos",
  "funcionarios": "ex: ~8.000 funcionários",
  "regiao": "cidade/estado sede ex: Campina Grande, PB",
  "site": "www.site.com.br",
  "linkedin_empresa": "linkedin.com/company/nome-empresa",
  "decisor_nome": "Nome Sobrenome se conhecido publicamente, senão 'A identificar via LinkedIn'",
  "decisor_cargo": "cargo exato ex: CIO, Diretor de TI e Transformação Digital",
  "decisor_linkedin": "linkedin.com/in/nome-sobrenome se perfil público conhecido",
  "decisor_email": "formato padrão ex: nome.sobrenome@empresa.com.br se padrão conhecido",
  "decisor_phone": "telefone corporativo público se disponível, senão null",
  "sinal_compra": "sinal específico e real ex: 'Anunciou implantação SAP S/4HANA em jan/2026' ou 'Novo CIO nomeado em fev/2026 — vindo do Itaú' ou null",
  "score": "A | B | C",
  "justificativa_score": "motivo específico do score baseado em dados reais",
  "dores_provaveis": "dores de dados típicas deste setor/empresa ex: 'Integração de dados de 47 distribuidoras em tempo real, relatórios D+2 gerando decisões atrasadas'",
  "tecnologias_atuais": "stack tecnológico provável ex: SAP ECC 6.0 legado, Power BI básico, planilhas Excel no operacional",
  "melhor_angulo": "ângulo de entrada específico ex: 'Mencionar case de distribuidora de energia no RS que reduziu D+2 para D+0 com a Atlantyx'",
  "proxima_acao": "ação recomendada ex: 'WA para o CIO mencionando a expansão anunciada em março'",
  "contexto_recente": "evento recente público relevante ex: 'Anunciou aquisição da Enel Distribuição em dez/2025 — integração de sistemas é prioridade'",
  "budget_ti_estimado": "ex: ~R$45M/ano em TI baseado no porte"
}

Retorne array JSON com ${quantidade} empresas reais, ordenadas por score A → B → C.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || 'Erro Claude API');

  const text = d.content[0].text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return [];
  }
}

// ── CRIAR EMPRESA NO HUBSPOT ──────────────────────────────────────────────────
async function criarEmpresaHubSpot(empresa) {
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`
    },
    body: JSON.stringify({
      properties: {
        name: empresa.nome,
        industry: empresa.setor,
        annualrevenue: empresa.faturamento_estimado,
        city: empresa.regiao,
        domain: empresa.site || '',
        linkedin_company_page: empresa.linkedin_empresa || '',
        icp_score: empresa.score,
        description: [
          empresa.sinal_compra ? `Sinal: ${empresa.sinal_compra}` : '',
          empresa.dores_provaveis ? `Dores: ${empresa.dores_provaveis}` : '',
          empresa.tecnologias_atuais ? `Tech: ${empresa.tecnologias_atuais}` : '',
        ].filter(Boolean).join(' | '),
      }
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`HubSpot company: ${d.message}`);
  return d.id;
}

// ── CRIAR CONTATO NO HUBSPOT ──────────────────────────────────────────────────
async function criarContatoHubSpot(empresa, companyId) {
  const nomes = (empresa.decisor_nome || '').split(' ');
  const r = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`
    },
    body: JSON.stringify({
      properties: {
        firstname: nomes[0] || '',
        lastname: nomes.slice(1).join(' ') || '',
        jobtitle: empresa.decisor_cargo || '',
        company: empresa.nome,
        email: empresa.decisor_email || '',
        phone: empresa.decisor_phone || '',
        hs_lead_status: 'NEW',
        icp_score: empresa.score,
        linkedin_url: empresa.decisor_linkedin || '',
        lead_source_campaign: 'S2-02 Prospecção Automatica',
      }
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`HubSpot contact: ${d.message}`);
  return d.id;
}

async function associarContatoEmpresa(contactId, companyId) {
  await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/1`,
    { method: 'PUT', headers: { 'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}` } }
  );
}

async function notificarWhatsApp(message) {
  if (!process.env.FUNDADOR_WHATSAPP || !process.env.ZAPI_INSTANCE) return;
  try {
    await fetch(
      `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE}/token/${process.env.ZAPI_TOKEN}/send-text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN },
        body: JSON.stringify({ phone: process.env.FUNDADOR_WHATSAPP, message }),
      }
    );
  } catch (e) { console.log('[WA]', e.message); }
}

// ── CADEIA C-LEVEL ────────────────────────────────────────────────────────────
export async function mapearCadeiaCLevel(empresa, setor, cargos) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 6000,
      system: `Você é o Agente S2-02 + S7-04 da Atlantyx.
Mapeie decisores C-level com dados reais de fontes públicas (LinkedIn, sites corporativos, notícias).
Use nomes reais quando a empresa for conhecida. Retorne APENAS JSON array.`,
      messages: [{
        role: 'user',
        content: `Mapeie a cadeia completa de decisores de:
Empresa: ${empresa}
Setor: ${setor}
Cargos alvo: ${cargos.join(', ')}

Para cada cargo retorne:
{
  "cargo": "cargo exato",
  "nome": "nome real se empresa conhecida e perfil público",
  "prioridade": "Alta | Media | Baixa",
  "perfil": "perfil do decisor nesta empresa em 2 linhas",
  "dores": ["dor principal de dados", "dor secundária específica"],
  "angulo_abordagem": "como abordar este cargo especificamente",
  "mensagem_wa": "mensagem WA de 4-5 linhas personalizada para ${empresa}",
  "canal_preferido": "LinkedIn | WhatsApp | E-mail | Ligacao",
  "linkedin": "URL perfil público se conhecido",
  "email_provavel": "email padrão da empresa se formato conhecido",
  "objecao_provavel": "objeção típica deste cargo",
  "resposta_objecao": "como contornar esta objeção",
  "contexto_recente": "evento recente que justifica a abordagem agora"
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
    const m = text.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return [];
  }
}
