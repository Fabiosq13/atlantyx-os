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
      titulo = '', apoio = '', chamada = '',   // v3.26: usados na arte de marca (último recurso)
      arte_marca = true,      // v3.26: false = não usa a arte de marca se os geradores falharem
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'prompt obrigatorio' });

    const apiKey = process.env.IDEOGRAM_API_KEY || '';
    const apiKeyClean = apiKey.trim().replace(/\s+/g, '');

    const promptFinal = estilo_padrao === false ? prompt : `${prompt}

Visual style: premium B2B tech corporate, dark navy blue (#1A3A8F) background, electric blue accent (#4F7CFF), bold clean typography, data visualization elements, professional consulting aesthetic, no clutter, high contrast`;

    const n = Math.min(Math.max(1, parseInt(quantidade) || 1), 4);
    const errTxt = t => { try { const j = JSON.parse(t); const m = j?.message || j?.error || j?.detail || j; return typeof m === 'string' ? m : JSON.stringify(m); } catch { return String(t || ''); } };
    const tentativas = [];

    // v3.25: 1) API Ideogram 3.0 (multipart) — a rota antiga /generate (V_2) pode recusar ou sair do ar
    let imagens = null, provedor = null;
    if (!apiKeyClean) tentativas.push({ via: 'ideogram', status: 0, erro: 'IDEOGRAM_API_KEY não configurada' });
    else try {
      const fd = new FormData();
      fd.append('prompt', promptFinal);
      fd.append('aspect_ratio', String(formato || 'ASPECT_1_1').replace(/^ASPECT_/, '').replace('_', 'x'));
      fd.append('rendering_speed', 'DEFAULT');
      fd.append('magic_prompt', magic_prompt ? 'AUTO' : 'OFF');
      fd.append('style_type', ['DESIGN', 'REALISTIC', 'GENERAL', 'AUTO', 'FICTION'].includes(estilo) ? estilo : 'GENERAL');
      if (negativo) fd.append('negative_prompt', negativo);
      fd.append('num_images', String(n));
      const r3 = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', { method: 'POST', headers: { 'Api-Key': apiKeyClean }, body: fd });
      const t3 = await r3.text();
      if (r3.ok) { const d3 = JSON.parse(t3); imagens = (d3.data || []).filter(x => x.url).map(x => ({ url: x.url, prompt_usado: x.prompt, seed: x.seed })); provedor = 'ideogram-v3'; }
      tentativas.push({ via: 'ideogram v3', status: r3.status, erro: r3.ok ? null : errTxt(t3).substring(0, 200) });
    } catch (e) { tentativas.push({ via: 'ideogram v3', status: 0, erro: e.message }); }

    // 2) rota antiga (V_2), se a v3 não respondeu
    if (!imagens?.length && apiKeyClean) {
      try {
        const body = { image_request: { prompt: promptFinal, negative_prompt: negativo, model: modelo, num_images: n, aspect_ratio: formato, style_type: estilo, magic_prompt_option: magic_prompt ? 'AUTO' : 'OFF' } };
        const r = await fetch('https://api.ideogram.ai/generate', { method: 'POST', headers: { 'Api-Key': apiKeyClean, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const t = await r.text();
        if (r.ok) { const d = JSON.parse(t); imagens = (d.data || []).filter(x => x.url).map(x => ({ url: x.url, prompt_usado: x.prompt, seed: x.seed })); provedor = 'ideogram-v2'; }
        tentativas.push({ via: 'ideogram v2', status: r.status, erro: r.ok ? null : errTxt(t).substring(0, 200) });
      } catch (e) { tentativas.push({ via: 'ideogram v2', status: 0, erro: e.message }); }
    }

    // 3) reserva OpenAI (DALL·E 3; se o modelo não existir mais, gpt-image-1 em base64 salvo no /api/media)
    if (!imagens?.length && process.env.OPENAI_API_KEY) {
      const tam = /9_16|10_16|2_3|3_4/.test(formato) ? '1024x1792' : /16_9|16_10|3_2|4_3/.test(formato) ? '1792x1024' : '1024x1024';
      for (const modeloOa of ['dall-e-3', 'gpt-image-1']) {
        try {
          const corpo = modeloOa === 'dall-e-3' ? { model: modeloOa, prompt: `${prompt}${negativo ? '\nDo NOT include: ' + negativo : ''}`.substring(0, 3900), size: tam, n: 1, quality: 'standard', style: 'natural' }
            : { model: modeloOa, prompt: `${prompt}${negativo ? '\nDo NOT include: ' + negativo : ''}`.substring(0, 3900), size: tam === '1024x1792' ? '1024x1536' : tam === '1792x1024' ? '1536x1024' : '1024x1024', n: 1 };
          const ro = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY.trim(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
          const od = await ro.json().catch(() => ({}));
          tentativas.push({ via: 'openai ' + modeloOa, status: ro.status, erro: ro.ok ? null : String(od?.error?.message || '').substring(0, 200) });
          if (ro.ok && od.data?.length) {
            const lista = [];
            for (const x of od.data) {
              if (x.url) lista.push({ url: x.url, prompt_usado: x.revised_prompt });
              else if (x.b64_json) { const u = await _salvarB64(x.b64_json, req); if (u) lista.push({ url: u, prompt_usado: x.revised_prompt, permanente: true }); }
            }
            if (lista.length) { imagens = lista; provedor = modeloOa; break; }
          }
        } catch (e) { tentativas.push({ via: 'openai ' + modeloOa, status: 0, erro: e.message }); }
      }
    }

    // v3.26: 4) ARTE DE MARCA (sem IA) — a campanha não trava quando a chave é recusada ou acabou o crédito
    let falhaIA = null;
    if (!imagens?.length && arte_marca !== false) {
      const base = _base(req);
      if (base) {
        const lista = [];
        for (let i = 0; i < n; i++) {
          try {
            const r = await fetch(base + '/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'arte_marca', payload: { titulo, apoio, chamada: chamada || 'Fale com a Atlantyx', formato, variacao: i } }) });
            const m = await r.json().catch(() => ({}));
            if (m.success && m.url) lista.push({ url: m.url, permanente: true, arte_marca: true, prompt_usado: 'Arte de marca Atlantyx (sem IA)' });
            else tentativas.push({ via: 'arte de marca', status: r.status, erro: m.error || 'sem url' });
          } catch (e) { tentativas.push({ via: 'arte de marca', status: 0, erro: e.message }); }
        }
        if (lista.length) {
          falhaIA = tentativas.filter(t => t.erro && t.via !== 'arte de marca');
          imagens = lista; provedor = 'arte-marca';
        }
      }
    }

    if (!imagens?.length) {
      const auth = tentativas.some(t => t.status === 401 || t.status === 403);
      const credito = tentativas.some(t => /credit|balance|payment|quota|insufficient/i.test(t.erro || ''));
      return res.status(502).json({ success: false,
        error: 'Nenhum gerador de imagem respondeu: ' + tentativas.map(t => `${t.via} ${t.status || ''}${t.erro ? ' (' + t.erro + ')' : ''}`).join(' · '),
        dica: auth ? 'Chave recusada: gere uma nova em ideogram.ai → API Keys, atualize IDEOGRAM_API_KEY no Vercel e faça Redeploy.' : credito ? 'Sem crédito na conta do Ideogram — recarregue o saldo da API em ideogram.ai.' : (!process.env.OPENAI_API_KEY ? 'Configure OPENAI_API_KEY no Vercel para ter um gerador reserva.' : 'Tente de novo em instantes.'),
        tentativas, chave_prefixo: apiKeyClean ? apiKeyClean.substring(0, 6) + '...' : 'VAZIA' });
    }
    console.log(`[image-gen] OK via ${provedor} — ${imagens.length} imagem(ns)`);
    const finais = await _persistir(imagens.filter(x => !x.permanente), req);
    if (provedor === 'arte-marca') {
      const auth = falhaIA.some(t => t.status === 401 || t.status === 403);
      return res.status(200).json({ success: true, imagens, total: imagens.length, provedor, fallback: true,
        aviso: 'O gerador de IA não respondeu (' + falhaIA.map(t => `${t.via} ${t.status || ''}`.trim()).join(' · ') + ') — entreguei uma ARTE DE MARCA Atlantyx para a campanha não parar. ' +
          (auth ? 'A IDEOGRAM_API_KEY foi recusada: gere uma nova em ideogram.ai → API Keys, troque no Vercel e faça Redeploy.' : !apiKeyClean ? 'Configure IDEOGRAM_API_KEY no Vercel.' : 'Verifique crédito/limite do Ideogram.'),
        tentativas });
    }
    return res.status(200).json({ success: true, imagens: [...imagens.filter(x => x.permanente), ...finais], total: imagens.length, provedor,
      ...(tentativas.some(t => t.erro) ? { aviso: tentativas.filter(t => t.erro).map(t => `${t.via}: ${t.erro}`).join(' · ') } : {}) });

  } catch (error) {
    console.error('[ERRO image-gen]', error.message);
    return res.status(500).json({ error: error.message });
  }
}

// v3.22: as URLs do Ideogram/DALL·E são temporárias (expiram em horas) — eram gravadas assim nas campanhas
// e no kanban, e depois apareciam como imagem quebrada. Agora cada imagem é copiada na hora para o
// armazenamento permanente (/api/media → /m/<id>.jpg). Se a cópia falhar, devolve a original marcada.
async function _persistir(imagens, req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const base = process.env.MEDIA_PUBLIC_BASE ? process.env.MEDIA_PUBLIC_BASE.replace(/\/$/, '') : (host ? `https://${host}` : null);
  if (!base) return imagens;
  return Promise.all(imagens.map(async img => {
    try {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(base + '/api/media', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'salvar_de_url', payload: { url: img.url, origem: 'image-gen', jpeg: true } }) });
      clearTimeout(tm);
      const m = await r.json().catch(() => ({}));
      if (m.success && m.url) return { ...img, url: m.url, url_original: img.url, permanente: true };
    } catch (_) {}
    return { ...img, permanente: false };
  }));
}

function _base(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return process.env.MEDIA_PUBLIC_BASE ? process.env.MEDIA_PUBLIC_BASE.replace(/\/$/, '') : (host ? `${/^localhost|^127\./.test(host) ? 'http' : 'https'}://${host}` : null);
}

async function _salvarB64(b64, req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const base = process.env.MEDIA_PUBLIC_BASE ? process.env.MEDIA_PUBLIC_BASE.replace(/\/$/, '') : (host ? `https://${host}` : null);
  if (!base) return null;
  try { const r = await fetch(base + '/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'salvar_base64', payload: { base64: b64, content_type: 'image/png', origem: 'image-gen' } }) });
    const m = await r.json().catch(() => ({})); return m.url || null; } catch (_) { return null; }
}
