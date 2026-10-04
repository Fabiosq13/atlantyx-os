import { comGuarda, origemApp } from '../lib/qa-guard.js';
// api/claude.js
// Endpoint seguro — chave da API fica no servidor, nunca exposta no frontend

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
async function handler(req, res) {
  // CORS — só o domínio da aplicação (v3.85); a autenticação é feita antes, em comGuarda → lib/auth.js
  res.setHeader('Access-Control-Allow-Origin', origemApp(req));
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

    // v3.29 (SEC-008): limites contra abuso de custo — tamanho do pedido e da resposta
    if (JSON.stringify(messages).length + String(system || '').length > 400000) return res.status(413).json({ error: 'Pedido grande demais para a IA (máx. ~400 mil caracteres).' });
    const body = {
      model: MODEL,
      max_tokens: Math.min(Math.max(1, parseInt(max_tokens) || 1000), 16000),
      messages: messages.slice(-60),
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

// v3.28: guarda do QA em execução real (só age em requisições com x-qa-real: 1)
export default comGuarda(handler, 'claude');
