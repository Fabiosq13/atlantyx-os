import { comGuarda } from '../lib/qa-guard.js';
// api/claude.js
// Endpoint seguro — chave da API fica no servidor, nunca exposta no frontend

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// v3.91 (SEC-002): o login já é exigido pelo comGuarda; aqui, limite de pedidos por usuário (ou IP)
// para conter abuso de custo. Contagem em memória da instância; chamadas internas e crons não contam.
const LIMITE_MIN = 20, LIMITE_HORA = 200;
const _uso = new Map();
function excedeuLimite(req) {
  if (req.credencial === 'interna' || req.credencial === 'cron') return null;
  const h = req.headers || {};
  const quem = req.sessao?.login || String(h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim() || 'anonimo';
  const agora = Date.now(), lista = (_uso.get(quem) || []).filter(t => agora - t < 3600000);
  if (lista.filter(t => agora - t < 60000).length >= LIMITE_MIN) return `Limite de ${LIMITE_MIN} pedidos por minuto à IA atingido — aguarde um instante.`;
  if (lista.length >= LIMITE_HORA) return `Limite de ${LIMITE_HORA} pedidos por hora à IA atingido.`;
  lista.push(agora); _uso.set(quem, lista);
  if (_uso.size > 5000) for (const [k, v] of _uso) if (!v.length || agora - v[v.length - 1] > 3600000) _uso.delete(k);
  return null;
}

async function handler(req, res) {
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

  const limite = excedeuLimite(req);
  if (limite) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: limite }); }

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
