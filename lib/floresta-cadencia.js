// lib/floresta-cadencia.js — pode tocar neste lead agora? (WhatsApp ou voz). Função pura: quem chama passa o estado.
import { dentroDoHorario } from './floresta-voz.js';
export const MAX_TOQUES = { 1: 5, 2: 4, 3: 4 };
const diaSP = d => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
// → { pode, motivo } — motivo ∈ excluido | pausa_geral | sem_nivel | sem_telefone | max_toques | ja_tocou_hoje | fora_da_janela | toque1_pede_reuniao
export function decidirContato({ nivel, telefone, toques = [], excluido = false, pausa_ate = null, agora = new Date(), ignorarJanela = false, pede_reuniao = false } = {}) {
  const nao = motivo => ({ pode: false, motivo });
  if (excluido) return nao('excluido');
  if (pausa_ate && String(pausa_ate) >= diaSP(agora)) return nao('pausa_geral');
  if (![1, 2, 3].includes(nivel)) return nao('sem_nivel');
  if (!telefone) return nao('sem_telefone');
  if (toques.length >= MAX_TOQUES[nivel]) return nao('max_toques');
  if (toques.some(t => diaSP(t.em) === diaSP(agora))) return nao('ja_tocou_hoje');
  if (toques.length === 0 && pede_reuniao) return nao('toque1_pede_reuniao');
  if (!ignorarJanela && !dentroDoHorario(agora)) return nao('fora_da_janela');
  return { pode: true, motivo: null, toque_numero: toques.length + 1 };
}
