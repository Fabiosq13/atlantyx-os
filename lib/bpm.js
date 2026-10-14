// lib/bpm.js — Método B.P.M. (Batida · Partitura · Mixagem): regras de propriedade de arquivos por trilha.
// Usado pelo hook do Claude Code (.claude/hooks/escopo-trilha.mjs), pelos gates do CI (scripts/bpm-gates.mjs)
// e pela Esteira de Demandas (api/agente-ideias.js). Fonte única: partitura/escopos.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let _cache = null;
export function escopos(raiz = RAIZ) {
  if (_cache && _cache.raiz === raiz) return _cache.dados;
  const dados = JSON.parse(fs.readFileSync(path.join(raiz, 'partitura', 'escopos.json'), 'utf8'));
  _cache = { raiz, dados }; return dados;
}
export const TRILHAS = () => Object.keys(escopos().trilhas);

// 'pasta/**' = tudo dentro · '*' = qualquer trecho do nome (sem '/') · resto = caminho exato
export function casa(padrao, arquivo) {
  const rx = '^' + padrao.split('**').map(p => p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('.*') + '$';
  return new RegExp(rx).test(arquivo);
}
export const normalizar = (arquivo, raiz = RAIZ) => path.relative(raiz, path.resolve(raiz, String(arquivo || ''))).split(path.sep).join('/');

// v3.146: trilha de PRODUTO (sistema construído pela Esteira de Entrega) = "P-<pasta>" → só produtos/<pasta>/**
export const RX_PRODUTO = /^P-[a-z0-9][a-z0-9-]{1,40}$/;
export const normTrilha = t => { const v = String(t || '').trim(); return /^t\d+$/i.test(v) ? v.toUpperCase() : /^p-/i.test(v) ? 'P-' + v.slice(2).toLowerCase() : v; };
export function trilhaInfo(trilha, raiz = RAIZ) {
  if (RX_PRODUTO.test(trilha || '')) { const pasta = trilha.slice(2);
    return { nome: 'Produto ' + pasta, naipe: 'Fábrica', escopo: `Sistema separado construído pela Esteira de Entrega — vive só em produtos/${pasta}/`, pode_alterar: [`produtos/${pasta}/**`], produto: pasta }; }
  return escopos(raiz).trilhas[trilha] || null;
}
export const trilhaExiste = (t, raiz = RAIZ) => { try { return !!trilhaInfo(t, raiz); } catch (_) { return false; } };

// { ok, motivo, compartilhado } — se a trilha pode alterar o arquivo
export function podeAlterar(trilha, arquivo, { id = null, raiz = RAIZ } = {}) {
  const E = escopos(raiz), t = trilhaInfo(trilha, raiz);
  if (!t) return { ok: false, motivo: `trilha desconhecida "${trilha}" (válidas: ${Object.keys(E.trilhas).join(', ')})` };
  const f = normalizar(arquivo, raiz);
  if (f.startsWith('..')) return { ok: false, motivo: 'arquivo fora do repositório' };
  if ((E.legado_somente_leitura || []).includes(f)) return { ok: false, motivo: `${f} é cópia legada (somente leitura) — o código vivo está em api/` };
  for (const p of E.sempre_permitido || []) {
    const pp = p.replace('{ID}', id || '*');
    if (casa(pp, f) || (!id && f.startsWith('partitura/trilhas/') && !f.startsWith('partitura/trilhas/_modelo/'))) return { ok: true };
  }
  if (f.startsWith('partitura/contratos/')) return trilha === 'T5' ? { ok: true } : { ok: false, motivo: 'contratos só mudam pelo Afinador (T5) — registre a necessidade em "Interseções" do plano.md' };
  if (f.startsWith('partitura/') || f === 'CLAUDE.md') return { ok: false, motivo: `${f} é da Partitura-mestre (Maestro) — proponha a mudança na Batida` };
  if ((t.pode_alterar || []).some(p => casa(p, f))) return { ok: true };
  if (t.produto) return { ok: false, motivo: `${f} é do Atlantyx OS — a trilha do produto só altera produtos/${t.produto}/**` };
  if (f.startsWith('produtos/')) return { ok: false, motivo: `${f} é de um produto da Esteira de Entrega — só a trilha P-${f.split('/')[1]} altera` };
  if (E.compartilhados?.[f]) return { ok: true, compartilhado: E.compartilhados[f] };
  const dona = Object.entries(E.trilhas).find(([k, v]) => k !== 'T5' && (v.pode_alterar || []).some(p => casa(p, f)));
  // v3.149: arquivo NOVO (que nenhuma trilha possui ainda, ex.: api/alertas-receita.js) pode ser criado pela trilha da demanda;
  // o Maestro registra o dono no escopos.json na Batida (o CI avisa)
  if (!dona && /^(api|lib|public|scripts|testes)\//.test(f)) return { ok: true, compartilhado: `${f} é arquivo novo, sem dono ainda — registre-o na trilha ${trilha} em partitura/escopos.json na próxima Batida` };
  return { ok: false, motivo: `${f} pertence à ${dona ? dona[0] + ' ' + dona[1].nome : 'nenhuma trilha (Maestro)'} — registre uma interseção no plano.md da trilha dona em vez de editar` };
}

export function donaDe(arquivo, raiz = RAIZ) {
  const E = escopos(raiz), f = normalizar(arquivo, raiz);
  const d = Object.entries(E.trilhas).find(([k, v]) => k !== 'T5' && (v.pode_alterar || []).some(p => casa(p, f)));
  if (d) return d[0];
  if ((E.trilhas.T5?.pode_alterar || []).some(p => !p.includes('*') && p === f)) return 'T5';
  return E.compartilhados?.[f] ? 'T4' : null;
}

// mudanças de schema e de versão — o que só a T5 (schema) e o robô de merge (versão) podem fazer
const RX_DDL = /\b(CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX|DROP\s+COLUMN|TRUNCATE)\b/gi;
// DDL só conta no código que fala com o banco (api/ e lib/) — as ferramentas do método citam as palavras nas próprias regras
export const checaDDL = arquivo => /^(api|lib)\//.test(String(arquivo || '')) && !/^lib\/bpm\.js$/.test(arquivo);
export const contaDDL = txt => (String(txt || '').match(RX_DDL) || []).length;
export const versoes = txt => [...new Set(String(txt || '').match(/ATX-v\d+\.\d+|ATLANTYX v\d+\.\d+/g) || [])].sort().join(',');
export const RX_SEGREDO = /(sk-ant-[a-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|postgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"`@]+@)/;

// sugestão de trilha para uma demanda (arquivos citados → área → T3)
const AREA_TRILHA = { financeiro: 'T6', vendas: 'T3', marketing: 'T3', pmo: 'T3', ideias: 'T3', juridico: 'T3', rh: 'T3', plataforma: 'T1', seguranca: 'T1', dados: 'T5', dashboard: 'T4', integracoes: 'T2' };
export function sugerirTrilha(d = {}, raiz = RAIZ) {
  const txt = [d.como_implementar, d.proposta, (d.telas_afetadas || []).join(' ')].join(' ');
  const cont = {};
  for (const m of txt.matchAll(/\b((?:api|lib|public|scripts)\/[\w./-]+\.(?:js|mjs|html))/g)) { const t = donaDe(m[1], raiz); if (t && m[1] !== 'public/index.html') cont[t] = (cont[t] || 0) + 1; }
  const melhor = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
  if (melhor) return melhor[0];
  if (/\bs3|financeir|quickbooks|faturament|termo|cnab|fluxo de caixa|concilia/i.test(txt + ' ' + (d.area || ''))) return 'T6';
  return AREA_TRILHA[String(d.area || '').toLowerCase()] || 'T3';
}
export function slug(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 48) || 'trilha'; }
export function idTrilha(titulo, data = new Date()) { const d = new Date(data.getTime() - 3 * 3600000).toISOString().substring(0, 10); return d + '-' + slug(titulo); }
