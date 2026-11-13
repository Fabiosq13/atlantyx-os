// lib/arte-organica.js — v3.486 · ARTES DOS POSTS ORGÂNICOS (sharp + SVG, 1080×1080)
// Mesmo nível visual da arte do anúncio pago (fundo com profundidade, Montserrat, destaques, logo), mas com COMPOSIÇÕES
// DIFERENTES a cada post — a IA escolhe o layout que melhor conta o post e preenche os campos; a paleta varia dentro da marca.
// Layouts: pergunta · lista · antes_depois · citacao · grafico · celular · passos. Nada de número inventado na arte.
import { larguraTexto, esc, quebrar } from './arte-padrao.js';

export const PALETAS = {
  petroleo: { bg: ['#0b8a9c', '#05414d', '#03080c'], acc: '#00FCA8', acc2: '#00C4CC', txt2: '#C9E6EA' },
  oceano: { bg: ['#2a5bd7', '#10265e', '#050a1c'], acc: '#4FD1FF', acc2: '#7FA8FF', txt2: '#C9D3EE' },
  grafite: { bg: ['#3a4452', '#161b22', '#07090c'], acc: '#00E0B8', acc2: '#E0A422', txt2: '#D2D8E0' },
  aurora: { bg: ['#5b3fd1', '#1d1450', '#06061a'], acc: '#2EE6D6', acc2: '#B69CFF', txt2: '#D6CCFF' },
};
export const LAYOUTS = ['pergunta', 'lista', 'antes_depois', 'citacao', 'grafico', 'celular', 'passos'];
const W = 1080, H = 1080, X0 = 80;
const F = 'Montserrat';
const T = (t, x, y, sz, wg, fill, extra = '') => `<text x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" font-family="${F}" font-size="${Math.round(sz)}" font-weight="${wg}" fill="${fill}" ${extra}>${esc(t)}</text>`;

// título com **destaques** (destaque = 800 na cor de acento; resto 300 branco). Ajusta o tamanho para caber em maxLinhas.
function titulo(txt, x, y, larg, tamMax, tamMin, maxLinhas, P, pesoBase = 300) {
  let tam = tamMax, r;
  for (; tam >= tamMin; tam -= 2) { r = _linhas(txt, larg, tam, pesoBase); if (r.length <= maxLinhas) break; }
  tam = Math.max(tam, tamMin); r = _linhas(txt, larg, tam, pesoBase);
  const esp = tam * 0.28, lh = tam * 1.13; let svg = '';
  r.forEach((l, i) => { let cx = x; l.forEach(p => { svg += T(p.w, cx, y + i * lh, tam, p.b ? 800 : pesoBase, p.b ? P.acc : '#ffffff', p.b ? '' : 'fill-opacity=".95"');
    if (p.cola) svg += T(p.cola, cx + p.wp, y + i * lh, tam, pesoBase, '#ffffff'); cx += p.wd + esp; }); });
  return { svg, fim: y + (r.length - 1) * lh, tam, linhas: r.length };
}
function _linhas(txt, larg, tam, pesoBase) {
  const pal = []; String(txt || '').split(/(\*\*[^*]+\*\*)/).forEach(seg => { const b = /^\*\*/.test(seg); seg.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).forEach(w => pal.push({ w, b })); });
  const esp = tam * 0.28, L = [[]]; let lw = 0;
  // pontuação solta depois de um destaque (**palavra** , ou **x**.) gruda na palavra anterior, sem espaço
  const jun = []; pal.forEach(p => { if (/^[,.;:!?)…]+$/.test(p.w) && jun.length) jun[jun.length - 1].cola = (jun[jun.length - 1].cola || '') + p.w; else jun.push({ ...p }); });
  jun.forEach(p => { const wd = larguraTexto(p.w, tam, p.b ? 800 : pesoBase), wc = p.cola ? larguraTexto(p.cola, tam, pesoBase) : 0; if (lw + wd + wc > larg && L[L.length - 1].length) { L.push([]); lw = 0; } L[L.length - 1].push({ ...p, wd: wd + wc, wp: wd }); lw += wd + wc + esp; });
  return L;
}
function paragrafo(t, x, y, larg, tam, peso, fill, maxL = 4, lh = 1.35) { const ls = quebrar(t, larg, tam, peso).slice(0, maxL); return { svg: ls.map((l, i) => T(l, x, y + i * tam * lh, tam, peso, fill)).join(''), fim: y + (ls.length - 1) * tam * lh, n: ls.length }; }
const check = (cx, cy, c) => `<circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="${c}" stroke-width="3"/><path d="M${cx - 8} ${cy} L${cx - 2} ${cy + 7} L${cx + 9} ${cy - 8}" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`;
const xis = (cx, cy, c) => `<circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="${c}" stroke-width="3" stroke-opacity=".8"/><path d="M${cx - 6} ${cy - 6} L${cx + 6} ${cy + 6} M${cx + 6} ${cy - 6} L${cx - 6} ${cy + 6}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;

function fundo(P, v) {
  const fx = [0.72, 0.3, 0.8, 0.5][v % 4], fy = [0.42, 0.3, 0.7, 0.2][v % 4];
  const grade = v % 2 ? Array.from({ length: 11 }, (_, i) => `<line x1="${(i + 1) * W / 12}" y1="0" x2="${(i + 1) * W / 12}" y2="${H}" stroke="#fff" stroke-opacity=".035"/>`).join('')
    : Array.from({ length: 14 }, (_, i) => Array.from({ length: 14 }, (_, j) => `<circle cx="${40 + i * 77}" cy="${40 + j * 77}" r="1.6" fill="#fff" fill-opacity=".07"/>`).join('')).join('');
  return `<defs><radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="${W * 0.55}" cy="${H * 0.5}" r="${W * 0.98}" fx="${W * fx}" fy="${H * fy}"><stop offset="0" stop-color="${P.bg[0]}"/><stop offset=".45" stop-color="${P.bg[1]}"/><stop offset="1" stop-color="${P.bg[2]}"/></radialGradient>
<radialGradient id="gl" gradientUnits="userSpaceOnUse" cx="${W * (1 - fx * 0.6)}" cy="${H * 0.18}" r="440"><stop offset="0" stop-color="${P.acc}" stop-opacity=".16"/><stop offset="1" stop-color="${P.acc}" stop-opacity="0"/></radialGradient>
<linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.acc}" stop-opacity=".45"/><stop offset="1" stop-color="${P.acc}" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#gl)"/>${grade}`;
}
function topo(P, tag) {
  if (!tag) return ''; const t = String(tag).toUpperCase().substring(0, 28), lw = larguraTexto(t, 17, 700) + t.length * 2 + 48;
  return `<rect x="${(W - X0 - lw).toFixed(1)}" y="72" width="${lw.toFixed(1)}" height="40" rx="20" fill="none" stroke="${P.acc}" stroke-opacity=".7"/>`
    + T(t, W - X0 - lw / 2, 98, 17, 700, P.acc, 'text-anchor="middle" letter-spacing="2"');
}
function rodapeQr(P, d) {
  const y0 = 905, q = d._qr, n = q.length, tam = 150, m = tam / (n + 2), qx = W - X0 - tam, qy = y0 + 8;
  let mods = ''; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (q[i][j]) mods += `M${(qx + (j + 1) * m).toFixed(2)} ${(qy + (i + 1) * m).toFixed(2)}h${m.toFixed(2)}v${m.toFixed(2)}h-${m.toFixed(2)}z`;
  const of = titulo(d.oferta_titulo || d.rodape || 'Diagnóstico grátis', X0, y0 + 58, W - 2 * X0 - tam - 60, 34, 24, 2, P, 700);
  return `<rect x="0" y="${y0 - 25}" width="${W}" height="${H - y0 + 25}" fill="#000" fill-opacity=".42"/><rect x="0" y="${y0 - 25}" width="${W}" height="3" fill="${P.acc}" fill-opacity=".85"/>`
    + T('APONTE A CÂMERA DO CELULAR', X0, y0 + 14, 17, 700, P.acc, 'letter-spacing="3"') + of.svg
    + T(String(d.oferta_sub || 'ou use o link do post').substring(0, 60), X0, Math.min(of.fim + 40, 1050), 21, 400, P.txt2)
    + `<rect x="${qx - 6}" y="${qy - 6}" width="${tam + 12}" height="${tam + 12}" rx="14" fill="#ffffff"/><path d="${mods}" fill="#0b1220"/>`;
}
function rodape(P, txt) {
  if (!txt) return '';
  return `<rect x="0" y="985" width="${W}" height="95" fill="#000" fill-opacity=".38"/><rect x="0" y="985" width="${W}" height="3" fill="${P.acc}" fill-opacity=".85"/>`
    + T(String(txt).toUpperCase().substring(0, 38), W / 2, 1043, 26, 600, '#ffffff', 'text-anchor="middle" letter-spacing="8"');
}

const L = {
  pergunta(d, P, v) {
    const t = titulo(d.titulo, X0, 330, 920, 86, 56, 5, P);
    const a = d.apoio ? paragrafo(d.apoio, X0, t.fim + 110, 880, 32, 400, P.txt2, 3) : { svg: '', fim: t.fim };
    return `<text x="${W - 40}" y="${H - 120}" font-family="${F}" font-size="640" font-weight="800" fill="${P.acc}" fill-opacity=".07" text-anchor="end">?</text>`
      + `<rect x="${X0}" y="240" width="110" height="8" rx="4" fill="${P.acc}"/>` + t.svg + (d.apoio ? `<rect x="${X0}" y="${t.fim + 52}" width="4" height="${a.fim - t.fim - 10}" fill="${P.acc2}"/>` + a.svg.replace(new RegExp(`x="${X0}.0"`, 'g'), `x="${X0 + 26}"`) : '');
  },
  lista(d, P) {
    const t = titulo(d.titulo, X0, 250, 920, 60, 40, 3, P);
    const itens = (d.itens || []).slice(0, 4); let y = t.fim + 120, s = '';
    const passo = Math.min(175, (d._base - 20 - y) / Math.max(1, itens.length));
    itens.forEach((it, i) => { s += T(String(i + 1).padStart(2, '0'), X0, y + 20, 70, 800, P.acc) + paragrafo(it, X0 + 140, y, 790, 36, 600, '#ffffff', 2, 1.3).svg;
      if (i < itens.length - 1) s += `<line x1="${X0}" y1="${(y + passo - 52).toFixed(1)}" x2="${W - X0}" y2="${(y + passo - 52).toFixed(1)}" stroke="#fff" stroke-opacity=".12"/>`; y += passo; });
    return t.svg + s;
  },
  antes_depois(d, P) {
    const t = titulo(d.titulo, X0, 250, 920, 58, 40, 3, P), y0 = t.fim + 80, cw = 445, ch = d._base - y0;
    const card = (x, rot, itens, ok) => { let s = `<rect x="${x}" y="${y0}" width="${cw}" height="${ch}" rx="22" fill="#ffffff" fill-opacity="${ok ? '.08' : '.035'}" stroke="${ok ? P.acc : '#ffffff'}" stroke-opacity="${ok ? '.55' : '.15'}"/>`
      + T(rot, x + 34, y0 + 62, 24, 800, ok ? P.acc : '#FF8FA3', 'letter-spacing="4"'); let y = y0 + 125;
      (itens || []).slice(0, 3).forEach(it => { s += (ok ? check(x + 52, y - 10, P.acc) : xis(x + 52, y - 10, '#FF8FA3')); const p = paragrafo(it, x + 86, y, cw - 116, 26, ok ? 600 : 400, ok ? '#ffffff' : '#C9CED8', 3, 1.3); s += p.svg; y = p.fim + 62; }); return s; };
    return t.svg + card(X0, 'ANTES', d.antes, false) + card(X0 + cw + 30, 'DEPOIS', d.depois, true)
      + `<circle cx="${X0 + cw + 15}" cy="${y0 + ch / 2}" r="26" fill="${P.bg[2]}" stroke="${P.acc}" stroke-width="2"/><path d="M${X0 + cw + 6} ${y0 + ch / 2 - 9} L${X0 + cw + 18} ${y0 + ch / 2} L${X0 + cw + 6} ${y0 + ch / 2 + 9}" fill="none" stroke="${P.acc}" stroke-width="4" stroke-linecap="round"/>`;
  },
  citacao(d, P) {
    const q = titulo(d.citacao || d.titulo, X0, 440, 900, 54, 38, 6, P, 600);
    const ya = Math.min(d._base - 50, q.fim + 120), nome = d.autor || 'Fabio Quintanilha', cargo = d.cargo || 'CEO · Atlantyx';
    const ini = nome.split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase();
    return T('“', X0 - 10, 380, 300, 800, P.acc, 'fill-opacity=".9"') + q.svg
      + `<line x1="${X0}" y1="${ya - 60}" x2="${X0 + 120}" y2="${ya - 60}" stroke="${P.acc}" stroke-width="3"/>`
      + `<circle cx="${X0 + 38}" cy="${ya}" r="38" fill="${P.acc}" fill-opacity=".18" stroke="${P.acc}" stroke-width="2"/>` + T(ini, X0 + 38, ya + 11, 28, 800, P.acc, 'text-anchor="middle"')
      + T(nome, X0 + 98, ya - 4, 28, 700, '#ffffff') + T(cargo, X0 + 98, ya + 30, 22, 400, P.txt2);
  },
  grafico(d, P, v) {
    const t = titulo(d.titulo, X0, 250, 920, 60, 40, 3, P);
    const a = d.apoio ? paragrafo(d.apoio, X0, t.fim + 70, 900, 28, 400, P.txt2, 2) : { svg: '', fim: t.fim };
    const gx = X0, gw = W - 2 * X0, gy = Math.max(a.fim + 80, 520), gh = d._base - 40 - gy;
    const ys = [[0.82, 0.78, 0.8, 0.7, 0.62, 0.5, 0.36, 0.22, 0.1], [0.7, 0.74, 0.66, 0.68, 0.55, 0.45, 0.4, 0.25, 0.12], [0.85, 0.8, 0.7, 0.72, 0.6, 0.48, 0.3, 0.2, 0.08]][v % 3];
    const pts = ys.map((y, i) => [gx + i * gw / (ys.length - 1), gy + y * gh]);
    const linha = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const k = 5, base = gy + 0.78 * gh, [cx, cy] = pts[ys.length - 1];
    const rot = String(d.rotulo || 'decisão com número certo').substring(0, 30), rw = larguraTexto(rot, 24, 700) + 44;
    return t.svg + a.svg
      + [0.25, 0.5, 0.75, 1].map(f => `<line x1="${gx}" y1="${(gy + f * gh).toFixed(1)}" x2="${gx + gw}" y2="${(gy + f * gh).toFixed(1)}" stroke="#fff" stroke-opacity=".08"/>`).join('')
      + `<line x1="${gx}" y1="${base.toFixed(1)}" x2="${gx + gw}" y2="${base.toFixed(1)}" stroke="#fff" stroke-opacity=".35" stroke-dasharray="10 10"/>` + T(String(d.rotulo_base || 'como está hoje').substring(0, 26), gx + gw, base + 32, 20, 600, P.txt2, 'text-anchor="end"')
      + `<path d="${linha} L${(gx + gw).toFixed(1)} ${(gy + gh).toFixed(1)} L${gx} ${(gy + gh).toFixed(1)} Z" fill="url(#ar)"/><path d="${linha}" fill="none" stroke="${P.acc}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`
      + pts.slice(k).map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="7" fill="${P.bg[2]}" stroke="${P.acc}" stroke-width="4"/>`).join('')
      + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="16" fill="${P.acc}" fill-opacity=".25"/><rect x="${(cx - rw).toFixed(1)}" y="${(cy - 78).toFixed(1)}" width="${rw.toFixed(1)}" height="48" rx="24" fill="${P.acc}"/>`
      + T(rot, cx - rw / 2, cy - 46, 24, 700, P.bg[2], 'text-anchor="middle"');
  },
  celular(d, P) {
    const t = titulo(d.titulo, X0, 250, 520, 54, 36, 6, P);
    let y = t.fim + 100, s = ''; (d.itens || []).slice(0, 3).forEach(it => { s += check(X0 + 18, y - 10, P.acc); const p = paragrafo(it, X0 + 54, y, 440, 27, 600, '#ffffff', 2, 1.3); s += p.svg; y = p.fim + 62; });
    const px = 630, py = 200, pw = 370, ph = d._base + 20 - py;
    const conv = (d.conversa || ['Oi! Vi o post sobre isso.', 'Claro! Te mando agora o diagnóstico.', 'Perfeito, obrigado!']).slice(0, 4);
    let cy = py + 200, bol = '';
    conv.forEach((m, i) => { const minha = i % 2 === 1, ls = quebrar(m, 230, 21, 500).slice(0, 4), bh = ls.length * 27 + 26, bw = Math.min(270, Math.max(...ls.map(l => larguraTexto(l, 21, 500))) + 34), bx = minha ? px + pw - 26 - bw : px + 26;
      bol += `<rect x="${bx}" y="${cy}" width="${bw}" height="${bh}" rx="16" fill="${minha ? '#D9FDD3' : '#ffffff'}"/>` + ls.map((l, j) => T(l, bx + 17, cy + 34 + j * 27, 21, 500, '#111b21')).join(''); cy += bh + 18; });
    return t.svg + s
      + `<rect x="${px + 16}" y="${py + 22}" width="${pw}" height="${ph}" rx="54" fill="#000" fill-opacity=".4"/><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="54" fill="#0d1115" stroke="#3a4452" stroke-width="3"/>`
      + `<rect x="${px + 14}" y="${py + 14}" width="${pw - 28}" height="${ph - 28}" rx="42" fill="#EFE7DE"/><rect x="${px + 14}" y="${py + 14}" width="${pw - 28}" height="120" rx="42" fill="#075E54"/><rect x="${px + 14}" y="${py + 80}" width="${pw - 28}" height="54" fill="#075E54"/>`
      + `<rect x="${px + pw / 2 - 55}" y="${py + 26}" width="110" height="26" rx="13" fill="#0d1115"/><circle cx="${px + 62}" cy="${py + 100}" r="22" fill="${P.acc}"/>` + T('A', px + 62, py + 109, 22, 800, '#075E54', 'text-anchor="middle"')
      + T(String(d.contato || 'Atlantyx').substring(0, 18), px + 96, py + 98, 22, 700, '#ffffff') + T('online', px + 96, py + 122, 16, 400, '#cfe9e5') + bol;
  },
  passos(d, P) {
    const t = titulo(d.titulo, X0, 260, 920, 62, 42, 3, P);
    const a = d.apoio ? paragrafo(d.apoio, X0, t.fim + 70, 900, 28, 400, P.txt2, 2) : { svg: '', fim: t.fim };
    const itens = (d.itens || []).slice(0, 3), n = Math.max(1, itens.length), yc = Math.max(a.fim + 170, 600), x1 = X0 + 135, x2 = W - X0 - 135;
    let s = `<line x1="${x1}" y1="${yc}" x2="${x2}" y2="${yc}" stroke="${P.acc}" stroke-opacity=".5" stroke-width="3" stroke-dasharray="4 10"/>`;
    itens.forEach((it, i) => { const cx = n === 1 ? (x1 + x2) / 2 : x1 + i * (x2 - x1) / (n - 1);
      s += `<circle cx="${cx}" cy="${yc}" r="50" fill="${P.bg[2]}" stroke="${P.acc}" stroke-width="4"/>` + T(String(i + 1), cx, yc + 16, 44, 800, P.acc, 'text-anchor="middle"');
      const ls = quebrar(it, 270, 27, 600).slice(0, 4); s += ls.map((l, j) => T(l, cx, yc + 110 + j * 35, 27, 600, '#ffffff', 'text-anchor="middle"')).join(''); });
    return t.svg + a.svg + s;
  },
};

// d.qr = matriz do QR code (true/false) — com ele o rodapé vira a faixa da oferta + QR para a página de captura
// d = { layout, oferta_titulo, oferta_sub, titulo, apoio, itens[], antes[], depois[], citacao, autor, cargo, rotulo, rotulo_base, conversa[], contato, tag, rodape }
export function arteOrganicaSvg(d = {}, { paleta, variacao = 0 } = {}) {
  const lay = LAYOUTS.includes(d.layout) ? d.layout : 'pergunta', v = Math.abs(parseInt(variacao) || 0);
  const P = PALETAS[paleta] || PALETAS[Object.keys(PALETAS)[v % 4]];
  const qr = Array.isArray(d.qr) && d.qr.length ? d.qr : null; d = { ...d, _qr: qr, _base: qr ? 860 : 950 };
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${fundo(P, v)}${topo(P, d.tag)}${L[lay](d, P, v)}${qr ? rodapeQr(P, d) : rodape(P, d.rodape)}</svg>`;
  return { svg, W, H, layout: lay, logo: { x: X0, y: 73, h: 37 } };
}

// ── v3.494: PEÇAS DE SÉRIE (Stories 9:16, Carrossel 1:1, Reel 9:16) no mesmo estilo — texto já gravado na arte ──
// d = { tipo: 'story'|'carrossel'|'reel', n, total, texto, apoio, cta, papel: 'gancho'|'meio'|'cta', url_qr→qr (matriz), oferta_titulo, oferta_sub }
function fundoH(P, v, h) {
  const fx = [0.72, 0.3, 0.8, 0.5][v % 4], fy = [0.42, 0.3, 0.7, 0.2][v % 4];
  const grade = v % 2 ? Array.from({ length: 11 }, (_, i) => `<line x1="${(i + 1) * W / 12}" y1="0" x2="${(i + 1) * W / 12}" y2="${h}" stroke="#fff" stroke-opacity=".035"/>`).join('')
    : Array.from({ length: 14 }, (_, i) => Array.from({ length: Math.ceil(h / 77) }, (_, j) => `<circle cx="${40 + i * 77}" cy="${40 + j * 77}" r="1.6" fill="#fff" fill-opacity=".07"/>`).join('')).join('');
  return `<defs><radialGradient id="bg" gradientUnits="userSpaceOnUse" cx="${W * 0.55}" cy="${h * 0.5}" r="${Math.max(W, h) * 0.9}" fx="${W * fx}" fy="${h * fy}"><stop offset="0" stop-color="${P.bg[0]}"/><stop offset=".45" stop-color="${P.bg[1]}"/><stop offset="1" stop-color="${P.bg[2]}"/></radialGradient>
<radialGradient id="gl" gradientUnits="userSpaceOnUse" cx="${W * (1 - fx * 0.6)}" cy="${h * 0.15}" r="${h > W ? 620 : 440}"><stop offset="0" stop-color="${P.acc}" stop-opacity=".16"/><stop offset="1" stop-color="${P.acc}" stop-opacity="0"/></radialGradient>
<linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.acc}" stop-opacity=".4"/><stop offset="1" stop-color="${P.acc}" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${h}" fill="url(#bg)"/><rect width="${W}" height="${h}" fill="url(#gl)"/>${grade}`;
}
// sem **destaque** no texto: destaca números/percentuais; sem número, as 3 últimas palavras
function destacar(t) {
  t = String(t || '').trim(); if (/\*\*/.test(t)) return t;
  if (/\d/.test(t)) return t.replace(/(\S*\d[\d.,%x]*\S*(?:\s+(?:mil|mi|bi|%|horas|dias|meses|anos|vezes))?)/gi, '**$1**');
  const w = t.split(/\s+/); return w.length > 4 ? w.slice(0, -3).join(' ') + ' **' + w.slice(-3).join(' ') + '**' : '**' + t + '**';
}
function motivo(P, v, x, y, w, h) {
  const k = v % 3;
  if (k === 0) { const ys = [0.8, 0.74, 0.77, 0.6, 0.55, 0.4, 0.3, 0.15], pts = ys.map((q, i) => [x + i * w / (ys.length - 1), y + q * h]); const l = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return `<path d="${l} L${x + w} ${y + h} L${x} ${y + h} Z" fill="url(#ar)"/><path d="${l}" fill="none" stroke="${P.acc}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` + pts.slice(-3).map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="8" fill="${P.bg[2]}" stroke="${P.acc}" stroke-width="4"/>`).join(''); }
  if (k === 1) { const b = [0.35, 0.5, 0.42, 0.62, 0.7, 0.66, 0.85, 1]; const bw = w / b.length * 0.62;
    return b.map((q, i) => `<rect x="${(x + i * w / b.length).toFixed(1)}" y="${(y + h - q * h).toFixed(1)}" width="${bw.toFixed(1)}" height="${(q * h).toFixed(1)}" rx="6" fill="${i === b.length - 1 ? P.acc : P.acc2}" fill-opacity="${i === b.length - 1 ? 1 : 0.35}"/>`).join(''); }
  const N = [[0.1, 0.6], [0.3, 0.25], [0.5, 0.7], [0.68, 0.3], [0.9, 0.55], [0.45, 0.05]].map(([a, b]) => [x + a * w, y + b * h]);
  const E = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [5, 3], [0, 2]];
  return E.map(([a, b]) => `<line x1="${N[a][0].toFixed(1)}" y1="${N[a][1].toFixed(1)}" x2="${N[b][0].toFixed(1)}" y2="${N[b][1].toFixed(1)}" stroke="${P.acc2}" stroke-opacity=".5" stroke-width="3"/>`).join('')
    + N.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === 3 ? 22 : 13}" fill="${i === 3 ? P.acc : P.bg[2]}" stroke="${P.acc}" stroke-width="4"/>`).join('');
}
function qrBloco(q, x, y, tam) { const n = q.length, m = tam / (n + 2); let mods = ''; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (q[i][j]) mods += `M${(x + (j + 1) * m).toFixed(2)} ${(y + (i + 1) * m).toFixed(2)}h${m.toFixed(2)}v${m.toFixed(2)}h-${m.toFixed(2)}z`;
  return `<rect x="${x - 10}" y="${y - 10}" width="${tam + 20}" height="${tam + 20}" rx="18" fill="#ffffff"/><path d="${mods}" fill="#0b1220"/>`; }

export function arteSerieSvg(d = {}, { paleta, variacao = 0 } = {}) {
  const tipo = d.tipo || 'story', vert = tipo !== 'carrossel', h = vert ? 1920 : 1080, v = Math.abs(parseInt(variacao) || 0);
  const P = PALETAS[paleta] || PALETAS[Object.keys(PALETAS)[v % 4]], n = parseInt(d.n) || 1, tot = parseInt(d.total) || 1;
  const cta = d.papel === 'cta' || (n === tot && tot > 1), qr = Array.isArray(d.qr) && d.qr.length ? d.qr : null;
  let s = fundoH(P, v, h);
  // contador da série
  if (tot > 1) { const c = n + ' / ' + tot, cw = larguraTexto(c, 22, 700) + 44; s += `<rect x="${W - X0 - cw}" y="70" width="${cw}" height="44" rx="22" fill="none" stroke="${P.acc}" stroke-opacity=".7"/>` + T(c, W - X0 - cw / 2, 100, 22, 700, P.acc, 'text-anchor="middle"'); }
  if (tipo === 'carrossel' && !cta) s += T(String(n).padStart(2, '0'), W - 40, 560, 420, 800, P.acc, 'text-anchor="end" fill-opacity=".06"');
  if (!vert) {
    // CARROSSEL 1:1
    const capa = n === 1, t = titulo(destacar(d.texto), X0, capa ? 330 : 290, 900, capa ? 76 : 62, 40, capa ? 5 : 4, P);
    s += `<rect x="${X0}" y="${capa ? 230 : 195}" width="110" height="8" rx="4" fill="${P.acc}"/>` + t.svg;
    let y = t.fim; if (d.apoio) { const a = paragrafo(d.apoio, X0, y + 80, 900, 32, 400, P.txt2, 4); s += a.svg; y = a.fim; }
    if (cta && qr) { if (y < 680) s += motivo(P, v + n, X0, y + 110, W - 2 * X0, 820 - y - 110); s += rodapeQr(P, { _qr: qr, oferta_titulo: d.oferta_titulo, oferta_sub: d.oferta_sub }); }
    else { if (y < 700) s += motivo(P, v + n, X0, Math.max(y + 90, 740), W - 2 * X0, 900 - Math.max(y + 90, 740));
      s += `<rect x="0" y="${H - 95}" width="${W}" height="95" fill="#000" fill-opacity=".35"/>` + Array.from({ length: tot }, (_, i) => `<circle cx="${X0 + i * 30}" cy="${H - 47}" r="${i === n - 1 ? 8 : 5}" fill="${i === n - 1 ? P.acc : '#ffffff'}" fill-opacity="${i === n - 1 ? 1 : .35}"/>`).join('')
        + (n < tot ? T('deslize →', W - X0, H - 38, 26, 700, P.acc, 'text-anchor="end"') : ''); }
    return { svg: `<svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`, W, H: h, logo: { x: X0, y: 73, h: 37 } };
  }
  // STORY / REEL 9:16 — zona segura: 250 px no topo e embaixo (interface do Instagram)
  const t = titulo(destacar(d.texto), X0, cta ? 470 : 640, 920, cta ? 70 : 86, 48, cta ? 5 : 7, P);
  s += `<rect x="${X0}" y="${cta ? 370 : 530}" width="120" height="9" rx="4" fill="${P.acc}"/>` + t.svg;
  let y = t.fim; if (d.apoio) { const a = paragrafo(d.apoio, X0, y + 90, 900, 36, 400, P.txt2, 4); s += a.svg; y = a.fim; }
  if (cta && qr) { const tam = 400, qx = (W - tam) / 2, qy = Math.max(y + 110, 1040);
    s += qrBloco(qr, qx, qy, tam) + T('APONTE A CÂMERA DO CELULAR', W / 2, qy + tam + 70, 24, 700, P.acc, 'text-anchor="middle" letter-spacing="4"');
    const of = paragrafo(String(d.oferta_titulo || 'Mapa de Oportunidades com IA, grátis').replace(/\*/g, ''), W / 2, qy + tam + 125, 860, 36, 700, '#ffffff', 2); s += of.svg.replace(/<text /g, '<text text-anchor="middle" ');
    if (d.oferta_sub) s += T(String(d.oferta_sub).substring(0, 60), W / 2, of.fim + 50, 26, 400, P.txt2, 'text-anchor="middle"'); }
  else { const my = Math.max(y + 140, 1180); if (my < 1500) s += motivo(P, v + n, X0, my, W - 2 * X0, 1560 - my);
    if (d.cta) { const ct = String(d.cta).substring(0, 48); let fs = 30; while (fs > 20 && larguraTexto(ct, fs, 800) > 820) fs -= 1; const cw = Math.min(920, larguraTexto(ct, fs, 800) + 90);
      s += `<rect x="${(W - cw) / 2}" y="1600" width="${cw}" height="78" rx="39" fill="${P.acc}"/>` + T(ct, W / 2, 1650, fs, 700, P.bg[2], 'text-anchor="middle"'); } }
  if (tot > 1) s += `<rect x="${X0}" y="${h - 230}" width="${W - 2 * X0}" height="6" rx="3" fill="#fff" fill-opacity=".18"/><rect x="${X0}" y="${h - 230}" width="${((W - 2 * X0) * n / tot).toFixed(1)}" height="6" rx="3" fill="${P.acc}"/>`;
  return { svg: `<svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`, W, H: h, logo: { x: X0, y: 73, h: 37 } };
}
