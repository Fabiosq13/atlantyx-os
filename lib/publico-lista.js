// lib/publico-lista.js — v3.239 · PÚBLICO POR LISTA (pessoas selecionadas no Apollo → Meta e LinkedIn)
// Meta (público personalizado de lista de clientes) e LinkedIn (Matched Audiences) só aceitam os dados de contato
// NORMALIZADOS e com hash SHA-256 — o e-mail/nome nunca sai do sistema em texto. Aqui ficam a normalização exigida
// por cada plataforma e o formato das linhas. Listas guardadas em kv_store (sem DDL):
//   'mkt:apollo_publicos'        → índice [{ id, nome, filtros, total, com_email, meta, linkedin, criado_em }]
//   'mkt:apollo_publico:<id>'    → { id, nome, pessoas: [...] }
import crypto from 'node:crypto';

export const sha256 = v => crypto.createHash('sha256').update(String(v), 'utf8').digest('hex');
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const PAISES = { brazil: 'br', brasil: 'br', 'united states': 'us', usa: 'us', 'estados unidos': 'us', portugal: 'pt', argentina: 'ar', chile: 'cl', mexico: 'mx', 'méxico': 'mx', colombia: 'co', peru: 'pe', uruguay: 'uy', paraguay: 'py', spain: 'es', 'espanha': 'es', 'united kingdom': 'gb', germany: 'de', france: 'fr', canada: 'ca' };
export const paisIso = p => { const t = String(p || '').trim().toLowerCase(); if (/^[a-z]{2}$/.test(t)) return t; return PAISES[t] || PAISES[semAcento(t)] || ''; };

// Regras do Meta (customer list): e-mail minúsculo sem espaço; telefone só dígitos com DDI; nome minúsculo sem pontuação;
// cidade/estado minúsculos sem acento, pontuação nem espaço; país ISO de 2 letras minúsculo
export const normMeta = {
  EMAIL: e => { const x = String(e || '').trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x) ? x : ''; },
  PHONE: t => { let d = String(t || '').replace(/\D/g, '').replace(/^0+/, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 ? d : ''; },
  FN: n => String(n || '').trim().toLowerCase().replace(/[\s.,'"`´^~\-()]+/g, ''),
  LN: n => String(n || '').trim().toLowerCase().replace(/[\s.,'"`´^~\-()]+/g, ''),
  CT: c => semAcento(c).toLowerCase().replace(/[^a-z]/g, ''),
  ST: s => semAcento(s).toLowerCase().replace(/[^a-z]/g, ''),
  COUNTRY: p => paisIso(p),
};
export const SCHEMA_META = ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'ST', 'COUNTRY'];

// e-mails que valem para casar a pessoa: o profissional e (se buscado) o pessoal — o Meta casa melhor pelo pessoal
export function emailsDe(p) { return [...new Set([p.email, ...(Array.isArray(p.emails_pessoais) ? p.emails_pessoais : [])].map(normMeta.EMAIL).filter(Boolean))]; }

// Uma linha por e-mail (o Meta aceita a mesma pessoa em várias linhas) — sem e-mail, uma linha com nome/local/telefone
export function linhasMeta(pessoas) {
  const out = [];
  for (const p of pessoas || []) {
    const base = { PHONE: normMeta.PHONE(p.telefone), FN: normMeta.FN(p.primeiro_nome), LN: normMeta.LN(p.sobrenome), CT: normMeta.CT(p.cidade), ST: normMeta.ST(p.estado), COUNTRY: normMeta.COUNTRY(p.pais || 'br') };
    const ems = emailsDe(p);
    // sem e-mail nem telefone, nome + cidade casa muito pouco e o Meta rejeita linha sem identificador forte
    if (!ems.length && !base.PHONE) continue;
    for (const e of (ems.length ? ems : [''])) out.push(SCHEMA_META.map(k => { const v = k === 'EMAIL' ? e : base[k]; return v ? sha256(v) : ''; }));
  }
  return out;
}

// LinkedIn (dmpSegments/users): e-mail com hash SHA-256 + nome, cargo, empresa e país (o LinkedIn também casa por nome+empresa)
export function linhasLinkedin(pessoas) {
  const out = [];
  for (const p of pessoas || []) {
    const ems = emailsDe(p);
    const extra = { ...(p.primeiro_nome ? { firstName: String(p.primeiro_nome).substring(0, 35) } : {}), ...(p.sobrenome ? { lastName: String(p.sobrenome).substring(0, 35) } : {}),
      ...(p.cargo ? { title: String(p.cargo).substring(0, 100) } : {}), ...(p.empresa ? { company: String(p.empresa).substring(0, 100) } : {}), ...(paisIso(p.pais || 'br') ? { country: paisIso(p.pais || 'br').toUpperCase() } : {}) };
    if (!ems.length && !(extra.firstName && extra.lastName && extra.company)) continue;
    out.push({ action: 'ADD', userIds: ems.map(e => ({ idType: 'SHA256_EMAIL', idValue: sha256(e) })), ...extra });
  }
  return out;
}

// CSV para subir à mão (quando a API não está liberada): formatos aceitos pelas telas de público do Meta e do LinkedIn
const csvCel = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function csvMeta(pessoas) {
  const L = [['email', 'email', 'phone', 'fn', 'ln', 'ct', 'st', 'country'].join(',')];
  for (const p of pessoas || []) { const e = emailsDe(p); L.push([e[0] || '', e[1] || '', normMeta.PHONE(p.telefone), p.primeiro_nome || '', p.sobrenome || '', p.cidade || '', p.estado || '', paisIso(p.pais || 'br').toUpperCase()].map(csvCel).join(',')); }
  return L.join('\n');
}
export function csvLinkedin(pessoas) {
  const L = [['email', 'firstname', 'lastname', 'jobtitle', 'employeecompany', 'country'].join(',')];
  for (const p of pessoas || []) L.push([emailsDe(p)[0] || '', p.primeiro_nome || '', p.sobrenome || '', p.cargo || '', p.empresa || '', paisIso(p.pais || 'br').toUpperCase()].map(csvCel).join(','));
  return L.join('\n');
}

// ── gravação da lista + resumo no índice (usado por apollo.js e metricool.js)
export const K_INDICE = 'mkt:apollo_publicos', kLista = id => 'mkt:apollo_publico:' + id;
export function listaResumo(l) {
  const P = l.pessoas || [];
  return { id: l.id, nome: l.nome, filtros: l.filtros || {}, total: P.length, com_email: P.filter(p => emailsDe(p).length).length, enriquecidos: P.filter(p => p.enriquecido_em).length,
    criado_em: l.criado_em, atualizado_em: l.atualizado_em, meta: l.meta || null, linkedin: l.linkedin || null };
}
export async function listaGravar(kvf, l) {
  l.atualizado_em = new Date().toISOString();
  await kvf(kLista(l.id), l);
  const ind = (await kvf(K_INDICE)) || []; const r = listaResumo(l); const i = ind.findIndex(x => x.id === l.id);
  if (i >= 0) ind[i] = r; else ind.unshift(r);
  await kvf(K_INDICE, ind.slice(0, 200)); return r;
}
export async function listaObter(kvf, id) {
  const l = await kvf(kLista(String(id || '')));
  if (!l) throw Object.assign(new Error('Lista não encontrada'), { status: 404 });
  return l;
}
