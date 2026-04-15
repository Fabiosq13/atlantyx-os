// api/portal-cadastro.js
// S2-03 Agente de Cadastro em Portais de Fornecedores
// Gera instruções e prepara documentação para cadastro da Atlantyx como fornecedora

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { empresa, portal, acao = 'analisar' } = req.body;

    if (!empresa) return res.status(400).json({ error: 'Campo empresa é obrigatório' });

    console.log(`[S2-03] Analisando cadastro: ${empresa} | Portal: ${portal || 'detectar automaticamente'}`);

    // ── CLAUDE S2-03 — Analisar portal e gerar instruções ──
    const analise = await analisarPortalCadastro(empresa, portal);

    // Notificar responsável
    await notificarWhatsApp(
      `[S2-03 · Cadastro em Portal]\n\nEmpresa: ${empresa}\nPortal: ${analise.portal_nome}\nComplexidade: ${analise.complexidade}\n\nPróximo passo: ${analise.proximo_passo}`
    );

    return res.status(200).json({
      success: true,
      empresa,
      analise,
    });

  } catch (error) {
    console.error('[ERRO portal-cadastro]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

async function analisarPortalCadastro(empresa, portal) {
  const system = `Você é o Agente S2-03 de Cadastro em Portais da Atlantyx.
Missão: analisar como cadastrar a Atlantyx como fornecedora homologada em portais de grandes empresas.
Retorne APENAS JSON válido.`;

  const user = `Analise o processo de cadastro de fornecedor para:
Empresa cliente: ${empresa}
Portal específico: ${portal || 'identifique o portal desta empresa'}

Retorne:
{
  "portal_nome": "nome do portal de fornecedores",
  "portal_url": "URL do portal se conhecida",
  "complexidade": "BAIXA | MEDIA | ALTA",
  "tempo_estimado": "ex: 3-5 dias úteis",
  "documentos_necessarios": ["lista de documentos típicos: CNPJ, contrato social, certidões, etc."],
  "passos": ["passo 1", "passo 2", "..."],
  "dicas": "dicas específicas para este portal",
  "proximo_passo": "ação imediata recomendada",
  "contato_portal": "e-mail ou telefone do portal se disponível"
}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, system, messages: [{ role: 'user', content: user }] })
  });
  const d = await r.json();
  try {
    const text = d.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch { return { portal_nome: portal || empresa, complexidade: 'MEDIA', proximo_passo: 'Acesse o portal e inicie o cadastro' }; }
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
