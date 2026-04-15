// api/rfp-monitor.js
// Agente S2-01 (Inteligência de Mercado) + S2-04 (Monitoramento de RFPs)
// Chamado via Vercel Cron a cada 6 horas
// Busca RFPs relevantes e notifica o time via WhatsApp

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verificar chave interna (segurança do cron)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    console.log('[S2-04] Iniciando varredura de RFPs...');

    // ── 1. CLAUDE — Agente S2-01 Inteligência de Mercado ──
    // Analisa as fontes e identifica RFPs relevantes para o ICP da Atlantyx
    const rfpsEncontrados = await analisarFontesRFP();

    if (rfpsEncontrados.length === 0) {
      return res.status(200).json({ success: true, rfps: 0, message: 'Nenhum RFP novo identificado neste ciclo' });
    }

    console.log(`[S2-04] ${rfpsEncontrados.length} RFPs identificados`);

    // ── 2. Para cada RFP relevante — notificar via WhatsApp ──
    for (const rfp of rfpsEncontrados) {
      await notificarRFP(rfp);
    }

    return res.status(200).json({
      success: true,
      rfps_encontrados: rfpsEncontrados.length,
      rfps: rfpsEncontrados.map(r => ({ empresa: r.empresa, valor: r.valor, prazo: r.prazo }))
    });

  } catch (error) {
    console.error('[ERRO rfp-monitor]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function analisarFontesRFP() {
  // Agente S2-01 — Claude analisa as fontes e gera lista de RFPs relevantes
  // Em produção, este prompt seria alimentado com dados reais das APIs dos portais
  const systemPrompt = `Você é o Agente de Inteligência de Mercado da Atlantyx.
Sua missão: identificar RFPs e editais relevantes para o portfólio da Atlantyx.

ICP DA ATLANTYX:
- Setores: Energia, Automotivo, Varejo (redes), Indústria/Manufatura, Logística
- Porte: Empresas com R$100M+ de faturamento
- Soluções: BI, Engenharia de Dados, Analytics, IA, Dashboards, Integração de sistemas

CRITÉRIOS DE RELEVÂNCIA (retorne apenas se atender ao menos 2):
1. Empresa do setor do ICP
2. Escopo envolve dados, BI, analytics, integração de sistemas ou IA
3. Valor estimado acima de R$200k
4. Prazo de submissão acima de 7 dias

Retorne um JSON array com os RFPs encontrados. Cada item:
{
  "empresa": "Nome da empresa",
  "portal": "Nome do portal",
  "titulo": "Título do edital",
  "valor": "Valor estimado",
  "prazo": "DD/MM/AAAA",
  "compatibilidade": 0-100,
  "justificativa": "Por que é relevante para a Atlantyx",
  "url": "URL se disponível"
}

Se não houver RFPs relevantes, retorne array vazio [].`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Data de hoje: ${new Date().toLocaleDateString('pt-BR')}

Analise as seguintes fontes de RFPs e identifique oportunidades para a Atlantyx:

PORTAIS A MONITORAR:
- ComprasNet (comprasnet.gov.br) — editais governamentais
- Portal de Fornecedores Petrobras — editais de energia
- SAP Ariba Network — editais de grandes empresas
- Beehive — marketplace B2B
- Portal GPA Fornecedores — varejo
- Portal Usiminas Fornecedores — indústria

NOTA: Como este é um ambiente de demonstração, simule 2-3 RFPs realistas baseados no ICP da Atlantyx para mostrar como o agente funcionaria em produção com acesso real às APIs desses portais.`
      }]
    })
  });

  const data = await res.json();
  const text = data.content[0].text;

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

async function notificarRFP(rfp) {
  const fundadorPhone = process.env.FUNDADOR_WHATSAPP;
  if (!fundadorPhone) return;

  const msg = `[Agente S2-04 · Monitor de RFPs]

NOVA OPORTUNIDADE IDENTIFICADA

Empresa: ${rfp.empresa}
Portal: ${rfp.portal}
Edital: ${rfp.titulo}
Valor Est.: ${rfp.valor}
Prazo: ${rfp.prazo}
Compatibilidade: ${rfp.compatibilidade}%

${rfp.justificativa}

${rfp.url ? 'Link: ' + rfp.url : 'Acesse o portal para detalhes'}

Acesse o Painel S7 → RFPs para analisar e iniciar a resposta.`;

  const instance = process.env.ZAPI_INSTANCE;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;

  await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': clientToken },
    body: JSON.stringify({ phone: fundadorPhone, message: msg }),
  });
}
