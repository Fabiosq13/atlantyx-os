// api/image-gen.js
// Gerador de Imagens via Ideogram API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: diagnóstico — verifica se a chave existe
  if (req.method === 'GET') {
    const apiKey = process.env.IDEOGRAM_API_KEY;
    return res.status(200).json({
      tem_chave: !!apiKey,
      prefixo: apiKey ? apiKey.substring(0, 8) + '...' : 'VAZIO',
      tamanho: apiKey ? apiKey.length : 0,
      env_keys: Object.keys(process.env).filter(k => k.includes('IDEOGRAM') || k.includes('ideogram')),
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const {
      prompt,
      estilo = 'DESIGN',
      formato = 'ASPECT_1_1',
      quantidade = 2,
      modelo = 'V_2',
      negativo = 'blurry, low quality, text errors, watermark, amateur, cartoon, childish',
      magic_prompt = true,
      estilo_padrao = true,   // v2.72: false = não acrescenta o estilo fixo (autocampanha usa foto realista)
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'prompt obrigatorio' });

    const apiKey = process.env.IDEOGRAM_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'IDEOGRAM_API_KEY nao encontrada',
        dica: 'Configure no Vercel → Settings → Environment Variables e faça Redeploy',
        env_disponiveis: Object.keys(process.env).filter(k => !k.includes('npm') && !k.includes('PATH')).slice(0, 20)
      });
    }

    const apiKeyClean = apiKey.trim().replace(/\s+/g, '');
    console.log(`[Ideogram] Key: ${apiKeyClean.substring(0,8)}... len:${apiKeyClean.length}`);

    const promptFinal = estilo_padrao === false ? prompt : `${prompt}

Visual style: premium B2B tech corporate, dark navy blue (#1A3A8F) background, electric blue accent (#4F7CFF), bold clean typography, data visualization elements, professional consulting aesthetic, no clutter, high contrast`;

    const body = {
      image_request: {
        prompt: promptFinal,
        negative_prompt: negativo,
        model: modelo,
        num_images: Math.min(quantidade, 4),
        aspect_ratio: formato,
        style_type: estilo,
        magic_prompt_option: magic_prompt ? 'AUTO' : 'OFF',
      }
    };

    console.log('[Ideogram] Sending request...', JSON.stringify(body).substring(0, 200));

    const r = await fetch('https://api.ideogram.ai/generate', {
      method: 'POST',
      headers: {
        'Api-Key': apiKeyClean,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    const responseText = await r.text();
    console.log(`[Ideogram] Status: ${r.status} | Response: ${responseText.substring(0, 500)}`);

    if (!r.ok) {
      let errMsg = responseText;
      try { errMsg = JSON.parse(responseText)?.message || JSON.parse(responseText)?.error || responseText; } catch {}
      // v2.76: reserva — se o Ideogram recusar (chave, crédito, instabilidade) e houver OPENAI_API_KEY, usa DALL·E 3
      if (process.env.OPENAI_API_KEY) {
        try {
          const tam = /9_16|10_16|2_3|3_4/.test(formato) ? '1024x1792' : /16_9|16_10|3_2|4_3/.test(formato) ? '1792x1024' : '1024x1024';
          const ro = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST',
            headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY.trim(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'dall-e-3', prompt: `${prompt}${negativo ? '\nDo NOT include: ' + negativo : ''}`.substring(0, 3900), size: tam, n: 1, quality: 'standard', style: 'natural' }) });
          const od = await ro.json().catch(() => ({}));
          if (ro.ok && od.data?.length) {
            console.log('[image-gen] Ideogram falhou (' + r.status + ') — usada a reserva DALL·E 3');
            return res.status(200).json({ success: true, imagens: od.data.map(x => ({ url: x.url, prompt_usado: x.revised_prompt })), total: od.data.length, provedor: 'dall-e-3', aviso_ideogram: `Ideogram ${r.status}: ${String(errMsg).substring(0, 120)}` });
          }
          console.warn('[image-gen] reserva OpenAI também falhou:', JSON.stringify(od).substring(0, 200));
        } catch (e) { console.warn('[image-gen] reserva OpenAI erro:', e.message); }
      }
      return res.status(500).json({
        success: false,
        error: `Ideogram retornou ${r.status}: ${errMsg.substring(0, 300)}`,
        status: r.status,
        dica: r.status === 401 ? 'Chave do Ideogram recusada: gere uma nova em ideogram.ai → API, confira o crédito, atualize IDEOGRAM_API_KEY no Vercel e faça Redeploy. Ou configure OPENAI_API_KEY para usar DALL·E como reserva.' : undefined,
        chave_prefixo: apiKeyClean.substring(0, 8) + '...',
      });
    }

    const data = JSON.parse(responseText);
    const imagens = (data.data || []).map(img => ({
      url: img.url,
      prompt_usado: img.prompt,
      seed: img.seed,
    }));

    console.log(`[Ideogram] OK — ${imagens.length} imagem(ns)`);

    return res.status(200).json({
      success: true,
      imagens,
      total: imagens.length,
    });

  } catch (error) {
    console.error('[ERRO image-gen]', error.message);
    return res.status(500).json({ error: error.message });
  }
}
