// api/claude.js
// Endpoint seguro — chave da API fica no servidor, nunca exposta no frontend

export default async function handler(req, res) {
  // CORS — permite apenas seu domínio em produção
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Chave da API vem da variável de ambiente do Vercel — nunca do frontend
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key não configurada no servidor' });
  }

  try {
    const { messages, max_tokens = 1000, system } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Campo messages é obrigatório' });
    }

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      messages,
    };

    // System prompt opcional
    if (system) body.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ error: error.error?.message || 'Erro na API Anthropic' });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Erro no proxy Claude:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
