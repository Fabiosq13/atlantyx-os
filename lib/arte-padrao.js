// lib/arte-padrao.js — v3.483 · ARTE NO PADRÃO DO ANÚNCIO PAGO, gerada no servidor (sharp + SVG)
// Mesmo desenho da arte "🖼 Arte no padrão" da tela de anúncios (public/index.html · _patArteDesenhar): fundo petróleo → preto
// com brilho, logo Atlantyx, manchete em MAIÚSCULAS com **trechos em destaque** (Montserrat 800 × 300), lista de benefícios
// com ✓ verde, monitor com a tela do sistema (ilustrativa, sem dado real) e faixa de rodapé com a chamada.
// Usada pela autocampanha orgânica e pela Campanha Automática no lugar da foto do Ideogram (que saía genérica e sem mensagem).
// Larguras de caractere da Montserrat (em 1/1000 de em) medidas no navegador — quebra de linha igual à do canvas.
const _CH = "0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç.,;:!?%$-–—/()\"'+&@#*";
const _W = {"300":"658,353,563,558,654,558,602,581,632,602,257,705,752,716,826,669,631,773,814,295,491,703,585,956,814,838,715,838,720,609,563,793,687,1098,642,625,646,583,675,555,675,597,328,682,673,261,266,588,261,1064,673,620,675,675,394,478,398,669,528,862,519,528,503,705,705,705,705,669,669,295,838,838,838,793,716,583,583,583,583,597,597,261,620,620,620,669,555,200,200,200,200,252,562,817,609,381,500,1000,320,321,322,357,194,569,655,1033,690,375","400":"662,361,568,564,661,566,609,589,638,609,262,717,754,719,826,669,633,773,813,302,501,711,589,955,813,839,718,839,723,615,574,792,698,1111,656,635,651,590,678,563,678,604,339,685,676,269,274,601,269,1061,676,627,678,678,401,488,406,672,542,879,534,542,511,717,717,717,717,669,669,302,839,839,839,792,719,590,590,590,590,604,604,269,627,627,627,672,563,212,212,212,212,260,567,829,615,382,500,1000,335,329,329,373,202,575,669,1033,696,386","600":"673,381,582,582,679,584,627,608,652,627,276,749,761,727,826,670,637,772,810,319,527,729,599,955,810,842,726,842,731,629,602,789,729,1144,693,661,663,607,686,581,687,622,369,694,685,289,295,636,289,1053,685,645,686,686,420,515,424,681,578,919,573,578,532,749,749,749,749,670,670,319,842,842,842,789,727,607,607,607,607,622,622,289,645,645,645,681,581,244,244,244,244,278,581,860,629,385,500,1000,371,347,348,413,220,590,706,1034,711,416","800":"685,405,599,603,700,607,649,632,669,649,291,786,769,738,826,672,642,770,806,339,557,752,610,954,806,846,737,846,740,647,635,786,766,1184,737,693,679,628,695,603,698,642,406,705,696,313,320,686,313,1045,696,666,695,695,443,547,447,692,620,956,619,620,556,786,786,786,786,672,672,339,846,846,846,786,738,628,628,628,628,642,642,313,666,666,666,692,603,283,283,283,283,301,597,897,647,388,500,1000,415,369,369,462,242,609,752,1036,730,453"};
const _mapa = {}; for (const w of Object.keys(_W)) { const v = _W[w].split(',').map(Number); _mapa[w] = {}; [..._CH].forEach((c, i) => { _mapa[w][c] = v[i]; }); }
export function larguraTexto(t, tam, peso = 400) { const pk = [300, 400, 600, 800].reduce((a, b) => Math.abs(b - peso) <= Math.abs(a - peso) ? b : a), m = _mapa[pk]; let s = 0; for (const c of String(t)) s += m[c] ?? m['n'] ?? 600; return s * tam / 1000; }
export const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function quebrar(t, larg, tam, peso) { const out = []; let l = ''; for (const w of String(t || '').split(/\s+/).filter(Boolean)) { const tt = l ? l + ' ' + w : w; if (larguraTexto(tt, tam, peso) > larg && l) { out.push(l); l = w; } else l = tt; } if (l) out.push(l); return out; }
// manchete com **destaques**: devolve as linhas (palavras com peso) e o y final
function manchete(txt, x, y, larg, tam) {
  const pal = []; String(txt || '').split(/(\*\*[^*]+\*\*)/).forEach(seg => { const b = /^\*\*/.test(seg); seg.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).forEach(w => pal.push({ w, b })); });
  const esp = tam * 0.28, linhas = [[]]; let lw = 0;
  pal.forEach(p => { const wd = larguraTexto(p.w, tam, p.b ? 800 : 300); if (lw + wd > larg && linhas[linhas.length - 1].length) { linhas.push([]); lw = 0; } linhas[linhas.length - 1].push({ ...p, wd }); lw += wd + esp; });
  const lh = tam * 1.12; let svg = '';
  linhas.forEach((l, i) => { let cx = x; l.forEach(p => { svg += `<text x="${cx.toFixed(1)}" y="${(y + i * lh).toFixed(1)}" font-family="Montserrat" font-size="${tam}" font-weight="${p.b ? 800 : 300}" fill="#ffffff" fill-opacity="${p.b ? 1 : 0.92}">${esc(p.w)}</text>`; cx += p.wd + esp; }); });
  return { svg, fim: y + (linhas.length - 1) * lh };
}
// tela ilustrativa do sistema (sem dado real) — 3 variações para os posts não ficarem iguais
function tela(x, y, w, h, v) {
  const R = (a, b, c, d, f, extra = '') => `<rect x="${a.toFixed(1)}" y="${b.toFixed(1)}" width="${c.toFixed(1)}" height="${d.toFixed(1)}" fill="${f}" ${extra}/>`;
  const T = (t, a, b, sz, wg, f) => `<text x="${a.toFixed(1)}" y="${b.toFixed(1)}" font-family="Montserrat" font-size="${Math.round(sz)}" font-weight="${wg}" fill="${f}">${esc(t)}</text>`;
  const menus = [['Dashboard', 'Funil de vendas', 'Financeiro', 'Projetos', 'Indicadores', 'Relatórios'], ['Financeiro', 'Fluxo de caixa', 'Contas a receber', 'Metas', 'Conciliação', 'Relatórios'], ['Projetos', 'Portfólio', 'Cronograma', 'Riscos', 'Horas', 'Status report']][v % 3];
  const kpis = [[['Receita', '+18%', '#047857'], ['Margem', '35%', '#00708A'], ['Pipeline', '3,2x', '#00708A'], ['Prazo médio', '-22%', '#047857']],
    [['Caixa', '+12%', '#047857'], ['Margem', '32%', '#00708A'], ['A receber', '-15d', '#047857'], ['Custo fixo', '-9%', '#047857']],
    [['No prazo', '92%', '#047857'], ['Avanço', '68%', '#00708A'], ['Riscos', '3', '#B45309'], ['Horas', '-11%', '#047857']]][v % 3];
  const tits = [['Resultado mensal', 'Funil de vendas'], ['Fluxo de caixa', 'Receita por linha'], ['Avanço × previsto', 'Farol do portfólio']][v % 3];
  let s = R(x, y, w, h, '#f6f8fa') + R(x, y, w * 0.2, h, '#ffffff') + R(x + w * 0.2, y, 1, h, '#e8edf2') + T('ATLANTYX OS', x + w * 0.025, y + h * 0.07, h * 0.035, 700, '#00708A');
  menus.forEach((m, i) => { if (!i) s += R(x + w * 0.015, y + h * (0.12 + i * 0.075) - h * 0.035, w * 0.17, h * 0.055, 'rgba(0,196,204,.18)'); s += T(m, x + w * 0.03, y + h * (0.12 + i * 0.075) + h * 0.008, h * 0.03, i ? 500 : 700, i ? '#5b6670' : '#00708A'); });
  const cx0 = x + w * 0.23, cw = (w * 0.75) / 4 - w * 0.012;
  kpis.forEach((k, i) => { const kx = cx0 + i * (cw + w * 0.012), ky = y + h * 0.05; s += R(kx, ky, cw, h * 0.2, '#ffffff', 'stroke="#e3e8ee"') + T(k[0], kx + cw * 0.08, ky + h * 0.06, h * 0.026, 600, '#7b8792') + T(k[1], kx + cw * 0.08, ky + h * 0.15, h * 0.055, 800, k[2]); });
  const gx = cx0, gy = y + h * 0.3, gw = w * 0.46, gh = h * 0.62;
  s += R(gx, gy, gw, gh, '#ffffff', 'stroke="#e3e8ee"') + T(tits[0], gx + gw * 0.05, gy + h * 0.06, h * 0.03, 700, '#5b6670');
  const bars = [[0.42, 0.5, 0.47, 0.58, 0.63, 0.6, 0.71, 0.78, 0.84], [0.55, 0.48, 0.6, 0.52, 0.66, 0.7, 0.64, 0.76, 0.82], [0.3, 0.38, 0.45, 0.5, 0.58, 0.64, 0.7, 0.74, 0.8]][v % 3];
  bars.forEach((b, i) => { const bw = gw * 0.07, bx = gx + gw * 0.07 + i * gw * 0.098, bh = gh * 0.7 * b; s += R(bx, gy + gh * 0.92 - bh, bw, bh, i === bars.length - 1 ? '#00C4CC' : '#9fdfe3'); });
  const fx = gx + gw + w * 0.015, fw = w * 0.75 - gw - w * 0.015; s += R(fx, gy, fw, gh, '#ffffff', 'stroke="#e3e8ee"') + T(tits[1], fx + fw * 0.08, gy + h * 0.06, h * 0.03, 700, '#5b6670');
  if (v % 3 === 2) ['#1baf7a', '#1baf7a', '#f2b33d', '#1baf7a', '#e5484d', '#1baf7a'].forEach((c, i) => { s += `<circle cx="${(fx + fw * (0.2 + (i % 3) * 0.3)).toFixed(1)}" cy="${(gy + gh * (0.35 + Math.floor(i / 3) * 0.35)).toFixed(1)}" r="${(fw * 0.09).toFixed(1)}" fill="${c}"/>`; });
  else [1, 0.78, 0.56, 0.36].forEach((f, i) => { const bw = fw * 0.8 * f; s += R(fx + (fw - bw) / 2, gy + gh * (0.18 + i * 0.19), bw, gh * 0.14, ['#2a78d6', '#3591e6', '#22b3a3', '#1baf7a'][i]); });
  return s;
}
// SVG 1080×1080 completo + onde colar o logo (PNG) por cima
export function arteSvg({ manchete: man = '', beneficios = [], rodape = 'SAIBA MAIS NO LINK DO POST', variacao = 0 } = {}) {
  const W = 1080, H = 1080, v = Math.abs(parseInt(variacao) || 0);
  let tam = 62, M; for (; tam >= 44; tam -= 4) { M = manchete(man, 80, 205, 820, tam); if (M.fim < 470) break; }
  const yLista = Math.max(M.fim + 80, 470); let yy = yLista, lista = '';
  (beneficios || []).slice(0, 4).forEach(t => { const ls = quebrar(t, 300, 30, 400);
    lista += `<circle cx="100" cy="${yy - 10}" r="18" fill="none" stroke="#ffffff" stroke-width="3.5"/><path d="M91 ${yy - 11} L99 ${yy - 2} L116 ${yy - 24}" fill="none" stroke="#00FCA8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
    ls.forEach((l, i) => { lista += `<text x="132" y="${yy + i * 34}" font-family="Montserrat" font-size="30" font-weight="400" fill="#ffffff">${esc(l)}</text>`; }); yy += ls.length * 34 + 30; });
  const mx = 470, my = Math.max(yLista - 20, 500), mw = 680, mh = Math.min(400, 960 - my - 70), sx = mx + 14, sy = my + 14, sw = mw - 28, sh = mh - 28;
  const pe = Math.min(60, 960 - my - mh);
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="${W * 0.6}" cy="${H * 0.5}" r="${W * 0.95}" fx="${W * 0.72}" fy="${H * 0.42}"><stop offset="0" stop-color="#0b8a9c"/><stop offset=".45" stop-color="#05414d"/><stop offset="1" stop-color="#03080c"/></radialGradient>
<radialGradient id="gl" gradientUnits="userSpaceOnUse" cx="${W * 0.85}" cy="${H * 0.2}" r="420"><stop offset="0" stop-color="#00FCA8" stop-opacity=".18"/><stop offset="1" stop-color="#00FCA8" stop-opacity="0"/></radialGradient>
<linearGradient id="pe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d1d8"/><stop offset="1" stop-color="#8c959d"/></linearGradient><clipPath id="cl"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}"/></clipPath></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#gl)"/>
${M.svg}${lista}
<rect x="${mx + 12}" y="${my + 16}" width="${mw}" height="${mh}" fill="#000" fill-opacity=".35"/><rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="14" fill="#0d1115"/>
<g clip-path="url(#cl)">${tela(sx, sy, sw, sh, v)}</g>
${pe > 0 ? `<rect x="${mx + mw * 0.42}" y="${my + mh}" width="${mw * 0.16}" height="${pe}" fill="url(#pe)"/>` : ''}
<rect x="0" y="975" width="${W}" height="105" fill="#000" fill-opacity=".45"/><rect x="0" y="975" width="${W}" height="3" fill="#00C4CC" fill-opacity=".9"/>
<text x="${W / 2 + 5}" y="1040" text-anchor="middle" font-family="Montserrat" font-size="30" font-weight="600" fill="#ffffff" letter-spacing="10">${esc(String(rodape || '').toUpperCase().substring(0, 40))}</text>
</svg>`;
  return { svg, W, H, logo: { x: 80, y: 74 + 16 - 19, h: 37 } };
}
