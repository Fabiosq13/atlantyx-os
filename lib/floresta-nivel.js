// lib/floresta-nivel.js — NÍVEL do lead (porte) para a prospecção. Função pura, sem banco.
// N1 Grandes (>1.000 func. ou >R$300 mi) · N2 Médio superior (101–1.000 / R$50–300 mi) · N3 Médio de entrada (11–100 / R$1–50 mi)
// Fora do perfil (nivel 0): ≤10 funcionários sem faturamento confirmado, ou < R$1 mi. R$50 mi exatos = N2.
// Conflito entre porte e faturamento: sem confirmação vale o nível de MENOR custo humano (número maior); confirmado na conversa vale o maior porte.
export const NIVEIS = { 1: { nome: 'Grande', cor: '#7c3aed' }, 2: { nome: 'Médio superior', cor: '#0ea5e9' }, 3: { nome: 'Médio de entrada', cor: '#16a34a' }, 0: { nome: 'Fora do perfil', cor: '#94a3b8' } };
const num = v => { if (v == null || v === '') return null; const t = String(v).trim(); const n = Number(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.')); return Number.isFinite(n) ? n : null; };
const porFunc = f => f == null ? null : f > 1000 ? 1 : f > 100 ? 2 : f > 10 ? 3 : 0;
const porFat = m => m == null ? null : m > 300 ? 1 : m >= 50 ? 2 : m >= 1 ? 3 : 0;
export function calcularNivel({ funcionarios, faturamento_mi, confirmado = false } = {}) {
  const f = num(funcionarios), m = num(faturamento_mi), a = porFunc(f), b = porFat(m);
  if (a == null && b == null) return { nivel: null, motivo: 'sem dado de porte nem de faturamento', conflito: false, confirmado: !!confirmado };
  const ord = x => (x === 0 ? 4 : x); // fora do perfil é o "maior número"
  const c = [a, b].filter(x => x != null).map(ord); let n = c[0], conflito = false;
  if (c.length === 2 && c[0] !== c[1]) { conflito = true; n = confirmado ? Math.min(...c) : Math.max(...c); }
  const nivel = n === 4 ? 0 : n;
  const partes = [f != null && f + ' funcionários', m != null && 'R$ ' + m + ' mi'].filter(Boolean).join(' · ');
  return { nivel, motivo: partes + (conflito ? ' (porte e faturamento divergem: ' + (confirmado ? 'vale o maior' : 'vale o de menor custo humano') + ')' : ''), conflito, confirmado: !!confirmado };
}
// "cerca de 15 pessoas", "somos 250 funcionários", "faturamos R$ 80 milhões" → { funcionarios, faturamento_mi }
export function lerPorteInformado(texto) {
  const t = String(texto || '').toLowerCase(); const out = {};
  const f = t.match(/(\d[\d.]*)\s*(pessoas|funcion[aá]rios|colaboradores|empregados)/); if (f) out.funcionarios = num(f[1]);
  const m = t.match(/r\$\s*(\d[\d.,]*)\s*(mi\b|milh[õo]es|milh[aã]o|bi\b|bilh[õo]es|bilh[aã]o)/); if (m) { const v = num(m[1]); out.faturamento_mi = /^b/.test(m[2]) ? v * 1000 : v; }
  return out;
}
