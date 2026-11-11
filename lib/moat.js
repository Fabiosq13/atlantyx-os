// lib/moat.js — v3.439 · MOAT (fosso competitivo) no planejamento estratégico · trilha T3
//
// "Moat" (Warren Buffett): a vantagem competitiva SUSTENTÁVEL que protege o lucro da concorrência por anos. A análise
// avalia o negócio Atlantyx e cada ideia do Pipeline de Ideias com lentes complementares:
//   · 7 Powers (Hamilton Helmer): Escala, Efeito de rede, Contraposicionamento, Custo de troca, Marca, Recurso exclusivo,
//     Processo — cada poder com BENEFÍCIO (o que rende) e BARREIRA (por que o rival não copia);
//   · Teste da cópia: um concorrente com dinheiro levaria quanto tempo/custo para tirar seus clientes?
//   · Flywheel (Jim Collins): o ciclo que se auto-reforça e aprofunda o fosso a cada volta;
//   · Erosão: o que pode secar o fosso (IA generativa barateando serviço, big techs, commoditização, pessoa-chave);
//   · Métricas do fosso: o que provar com número (retenção, NRR, % receita recorrente, preço sem desconto, tempo de troca).
// "Tunar": cada rodada parte da anterior + a orientação do fundador e propõe mudanças até a nota chegar ao moat (≥ 8).
// Guardado em kv est:moat = { atlantyx: { rodadas: [...] }, ideias: { <id>: { titulo, rodadas: [...] } } }.

export const K_MOAT = 'est:moat';
export const PODERES = ['Escala', 'Efeito de rede', 'Contraposicionamento', 'Custo de troca', 'Marca', 'Recurso exclusivo', 'Processo'];
const META_MOAT = 8;

const ESQUEMA = `Responda SOMENTE JSON válido:
{"nota":0-10 (força do fosso HOJE),"veredito":"1-2 frases diretas","tese_moat":"o fosso que vale construir e por quê (2 frases)",
"teste_copia":{"tempo":"ex.: 6 meses","custo":"ex.: R$ 2 mi","quem":"quem poderia copiar","explicacao":"1-2 frases"},
"poderes":[{"poder":"um dos 7 Powers","forca":0-5,"beneficio":"o que esse poder rende (preço, margem, retenção)","barreira":"por que o rival não copia","evidencia":"fato/número do contexto ou 'falta dado: …'","como_aumentar":"ação concreta"}],
"ameacas":[{"ameaca":"o que pode secar o fosso","probabilidade":"alta|media|baixa","mitigacao":"ação"}],
"flywheel":["passo 1 do ciclo virtuoso","passo 2","…","volta ao passo 1"],
"tunagem":[{"mudanca":"o que mudar no negócio/ideia","poder_reforcado":"qual dos 7 Powers","ganho_nota":0.5-3,"esforco":"P|M|G","prazo":"AAAA-MM ou trimestre","primeiro_passo":"ação desta semana"}],
"metricas":[{"metrica":"…","como_medir":"…","meta":"…"}],
"nao_fazer":["o que NÃO fazer porque enfraquece o fosso"],
"versao_tunada":"como fica o negócio/ideia depois da tunagem (3-5 frases)","nota_apos_tunagem":0-10,
"pergunta_ao_fundador":"a decisão que só o fundador pode tomar para o fosso existir"}
Use os 7 poderes (forca 0 quando não existe). 3 a 6 itens de tunagem, ordenados por ganho/esforço. 3 a 5 métricas. Seja duro: serviço sem diferencial tem moat fraco.`;

function _limpar(j) {
  const n = x => Math.max(0, Math.min(10, Number(x) || 0));
  const out = { ...j, nota: n(j.nota), nota_apos_tunagem: n(j.nota_apos_tunagem) };
  out.poderes = (Array.isArray(j.poderes) ? j.poderes : []).map(p => ({ ...p, forca: Math.max(0, Math.min(5, Number(p.forca) || 0)) })).slice(0, 7);
  for (const k of ['ameacas', 'flywheel', 'tunagem', 'metricas', 'nao_fazer']) out[k] = (Array.isArray(j[k]) ? j[k] : []).slice(0, 10);
  return out;
}

async function _ideias(sql) {
  try { return (await sql`SELECT id, titulo, status, data FROM ideias ORDER BY atualizado_em DESC NULLS LAST LIMIT 80`).map(r => {
    const d = typeof r.data === 'string' ? (() => { try { return JSON.parse(r.data); } catch (_) { return {}; } })() : (r.data || {});
    return { id: String(r.id), titulo: r.titulo || d.titulo || '(sem título)', stage: r.status || d.stage || '', resumo: String(d.resumo || d.descricao || d.problema || '').substring(0, 400) }; }); }
  catch (_) { return []; }
}

export async function moatObter({ kv, sql }) {
  const M = (await kv(K_MOAT)) || {}; const ideias = await _ideias(sql);
  return { moat: M, ideias, poderes: PODERES, meta: META_MOAT };
}

// alvo: 'atlantyx' ou 'ideia' (com ideia_id). orientacao: o que o fundador quer mudar/testar nesta rodada.
export async function moatAnalisar({ claude, kv, sql, contextoTxt, premissasTxt }, { alvo = 'atlantyx', ideia_id, orientacao } = {}, usuario) {
  const M = (await kv(K_MOAT)) || {}; M.ideias = M.ideias || {};
  let foco = '', reg;
  if (alvo === 'ideia') {
    const id = String(ideia_id || ''); const ide = (await _ideias(sql)).find(x => x.id === id); if (!ide) throw new Error('Ideia não encontrada no Pipeline de Ideias');
    reg = M.ideias[id] = M.ideias[id] || { titulo: ide.titulo, rodadas: [] }; reg.titulo = ide.titulo;
    foco = `ALVO: a IDEIA "${ide.titulo}" (etapa ${ide.stage || '?'}) do Pipeline de Ideias da Atlantyx.\nResumo da ideia: ${ide.resumo || '(sem resumo)'}\nAvalie o fosso que essa ideia pode ter e como ela reforça (ou não) o fosso da Atlantyx.`;
  } else { reg = M.atlantyx = M.atlantyx || { rodadas: [] }; foco = 'ALVO: o NEGÓCIO ATLANTYX como um todo (os 3 motores: alocação de profissionais, projetos sob medida + sustentação, e a suíte de produtos de IA por assinatura — Atlantyx OS e Maestro). Avalie cada motor e onde está (ou pode estar) o fosso.'; }
  const ant = reg.rodadas[reg.rodadas.length - 1];
  const sys = `Você é o estrategista-chefe (ATLAS) da Atlantyx e especialista em vantagem competitiva (moat de Buffett, 7 Powers de Hamilton Helmer, Flywheel de Jim Collins). Português do Brasil.
Nunca invente número, cliente ou fato: use o CONTEXTO e diga "falta dado: …" quando faltar. Específico para a Atlantyx, nada genérico.
${ant ? 'Esta é uma RODADA DE TUNAGEM: parta da análise anterior, aplique a orientação do fundador, mantenha o que é sólido, troque o que é fraco e mostre como a nota sobe até o moat (meta ≥ ' + META_MOAT + ').' : 'Primeira análise de moat deste alvo.'}
${ESQUEMA}`;
  const user = `${foco}\n\nPREMISSAS E PLANO ESTRATÉGICO:\n${String(premissasTxt || '').substring(0, 9000)}\n\nCONTEXTO DA EMPRESA (números vivos):\n${String(contextoTxt || '').substring(0, 22000)}`
    + (ant ? `\n\nANÁLISE ANTERIOR (rodada ${reg.rodadas.length}):\n${JSON.stringify({ nota: ant.nota, tese_moat: ant.tese_moat, poderes: ant.poderes, tunagem: ant.tunagem, versao_tunada: ant.versao_tunada, nota_apos_tunagem: ant.nota_apos_tunagem }).substring(0, 7000)}` : '')
    + (orientacao ? `\n\nORIENTAÇÃO DO FUNDADOR PARA ESTA RODADA: ${String(orientacao).substring(0, 1500)}` : '');
  const t = await claude(sys, [{ role: 'user', content: user }], 5000);
  const s = String(t || '').replace(/```json|```/g, ''); const a = s.indexOf('{'), b = s.lastIndexOf('}'); let j; try { j = JSON.parse(s.substring(a, b + 1)); } catch (_) { throw new Error('A IA não devolveu a análise em formato válido — tente de novo'); }
  const r = { ..._limpar(j), em: new Date().toISOString(), por: usuario || null, orientacao: orientacao || null, rodada: reg.rodadas.length + 1 };
  reg.rodadas.push(r); reg.rodadas = reg.rodadas.slice(-12); reg.atualizado_em = r.em;
  M.atualizado_em = r.em; await kv(K_MOAT, M); return { alvo, ideia_id: ideia_id || null, analise: r, rodadas: reg.rodadas.length, chegou: r.nota_apos_tunagem >= META_MOAT };
}

export async function moatTeseSalvar({ kv }, { tese }, usuario) {
  const M = (await kv(K_MOAT)) || {}; M.tese_aprovada = tese ? { texto: String(tese).substring(0, 1500), em: new Date().toISOString(), por: usuario || null } : null;
  await kv(K_MOAT, M); return { tese_aprovada: M.tese_aprovada };
}

// resumo para os prompts de estratégia (ATLAS, Sala, plano): o fosso passa a guiar as recomendações
export function moatResumoTexto(M) {
  if (!M) return '';
  const a = M.atlantyx?.rodadas?.slice(-1)[0]; const linhas = [];
  if (M.tese_aprovada?.texto) linhas.push('Tese de moat APROVADA pelo fundador: ' + M.tese_aprovada.texto);
  if (a) { linhas.push(`Moat da Atlantyx (rodada ${a.rodada}): nota ${a.nota}/10 → ${a.nota_apos_tunagem}/10 após tunagem. Tese: ${a.tese_moat || ''}`);
    const fortes = (a.poderes || []).filter(p => p.forca >= 3).map(p => p.poder + ' ' + p.forca + '/5'), fracos = (a.poderes || []).filter(p => p.forca <= 1).map(p => p.poder);
    if (fortes.length) linhas.push('Poderes fortes: ' + fortes.join(', ')); if (fracos.length) linhas.push('Poderes ausentes/fracos: ' + fracos.join(', '));
    if (a.tunagem?.length) linhas.push('Tunagens para aprofundar o fosso: ' + a.tunagem.slice(0, 5).map(x => x.mudanca).join('; '));
    if (a.nao_fazer?.length) linhas.push('Não fazer (enfraquece o fosso): ' + a.nao_fazer.slice(0, 4).join('; ')); }
  const ids = Object.values(M.ideias || {}).map(x => ({ t: x.titulo, r: x.rodadas?.slice(-1)[0] })).filter(x => x.r);
  if (ids.length) linhas.push('Moat das ideias: ' + ids.slice(0, 8).map(x => `${x.t} ${x.r.nota}→${x.r.nota_apos_tunagem}/10`).join('; '));
  return linhas.length ? 'MOAT (vantagem competitiva sustentável) — toda recomendação deve aprofundar o fosso, não só crescer receita:\n' + linhas.join('\n') : '';
}
