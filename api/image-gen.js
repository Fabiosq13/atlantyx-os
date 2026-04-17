// api/image-gen.js
// Gerador de Imagens via Ideogram API
// Integrado ao Studio Criativo S2 — Designer + Motion

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
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
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'prompt obrigatorio' });

    const apiKey = process.env.IDEOGRAM_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'IDEOGRAM_API_KEY nao configurada no Vercel' });

    // Debug: logar primeiros chars da chave (sem expor ela toda)
    console.log(`[Ideogram] Key prefix: ${apiKey.substring(0,8)}... length: ${apiKey.length}`);

    // Enriquecer o prompt com o estilo visual da Atlantyx
    const promptAtlantyx = `${prompt}

Visual style: premium B2B tech corporate, dark navy blue (#1A3A8F) or pure white background, electric blue accent (#4F7CFF), bold clean typography, data visualization elements, geometric shapes, professional consulting aesthetic similar to EY/McKinsey style, no clutter, high contrast, modern sans-serif font, sophisticated and authoritative`;

    console.log(`[Ideogram] Gerando ${quantidade} imagem(ns)...`);

    // Limpar a chave de espaços/quebras de linha
    const apiKeyClean = apiKey.trim().replace(/\s+/g, '');

    // Tentar o endpoint v2 do Ideogram (mais recente)
    const r = await fetch('https://api.ideogram.ai/generate', {
      method: 'POST',
      headers: {
        'Api-Key': apiKeyClean,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_request: {
          prompt: promptAtlantyx,
          negative_prompt: negativo,
          model: modelo,
          num_images: Math.min(quantidade, 4),
          aspect_ratio: formato,
          style_type: estilo,
          magic_prompt_option: magic_prompt ? 'AUTO' : 'OFF',
        }
      })
    });

    // Logar resposta completa para debug
    const responseText = await r.text();
    console.log(`[Ideogram] Status: ${r.status}, Response: ${responseText.substring(0, 500)}`);

    if (!r.ok) {
      let errMsg = responseText;
      try { errMsg = JSON.parse(responseText)?.message || responseText; } catch {}
      throw new Error(`Ideogram API ${r.status}: ${errMsg.substring(0, 300)}`);
    }

    const data = JSON.parse(responseText);


    const imagens = (data.data || []).map(img => ({
      url: img.url,
      prompt_usado: img.prompt,
      resolucao: img.resolution,
      seed: img.seed,
    }));

    console.log(`[Ideogram] ${imagens.length} imagem(ns) gerada(s)`);
    return res.status(200).json({
      success: true,
      imagens,
      total: imagens.length,
      modelo,
      formato,
      prompt_original: prompt,
    });

  } catch (error) {
    console.error('[ERRO image-gen]', error.message);
    return res.status(500).json({ error: error.message });
  }
}
