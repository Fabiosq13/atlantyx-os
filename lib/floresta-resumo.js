// lib/floresta-resumo.js — leitura do "Resumo SDR Atlantyx" no formato padrão (linhas "Rótulo: valor").
// Válido = tem "Temperatura:" com um valor reconhecido. Fora disso o OS segue interpretando o texto livre com IA (caminho antigo).
export const TEMPERATURAS = ['quente', 'morno', 'frio', 'pausado', 'descartado'];
const ROTULOS = { temperatura: 'temperatura', dor: 'dor', decisor: 'decisor', prazo: 'prazo', interesse: 'interesse', objecao: 'objecao', retorno_em: 'retorno em', porte_informado: 'porte informado', proximo_passo: 'proximo passo', reuniao: 'reuniao', data_reuniao: 'data da reuniao', motivo: 'motivo da ultima mudanca de temperatura' };
const nrm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const iso = v => { const s = String(v || '').trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
export function lerResumoSdr(texto) {
  const campos = {}; const mapa = Object.fromEntries(Object.entries(ROTULOS).map(([k, v]) => [v, k]));
  for (const linha of String(texto || '').split(/\r?\n/)) { const i = linha.indexOf(':'); if (i < 1 || i > 60) continue; const k = mapa[nrm(linha.slice(0, i))]; if (!k) continue; campos[k] = linha.slice(i + 1).trim(); }
  const temperatura = nrm(campos.temperatura).split(' ')[0] || ''; const valido = TEMPERATURAS.includes(temperatura);
  const retorno = iso(campos.retorno_em);
  const reuniao = /^(sim|marcad|agendad|confirmad)/.test(nrm(campos.reuniao)) || (/reuni/.test(nrm(campos.proximo_passo)) && /marcad|agendad|confirmad/.test(nrm(campos.proximo_passo)));
  return { valido, temperatura: valido ? temperatura : null, campos: { ...campos, retorno_em: retorno }, reuniao, erro: valido ? null : (campos.temperatura ? 'temperatura "' + campos.temperatura + '" não reconhecida' : 'sem o campo Temperatura') };
}
