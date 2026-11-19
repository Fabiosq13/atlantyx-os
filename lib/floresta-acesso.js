// lib/floresta-acesso.js — v3.569 · quem vê qual funil da Floresta (Ademir só o funil padrão; Patricia só o funil WX; os demais veem tudo)
// O mapa pode ser trocado em cfg 'floresta_acesso_funil' = { "login": "wx" | "padrao" }; sem mapa, vale o nome do login.
import { ehWX } from './floresta-email.js';
const RX_WX = /patr[ií]cia|(^|[^a-z0-9])pt@|wxc/i, RX_PAD = /ademir/i;
export function funilDoLogin(login, mapa = {}) {
  const l = String(login || '').toLowerCase(); if (!l) return null;
  const m = mapa[l] || mapa[login]; if (m === 'wx' || m === 'padrao') return m;
  if (RX_WX.test(l)) return 'wx'; if (RX_PAD.test(l)) return 'padrao'; return null;
}
export const cardNoFunil = (c, funil) => !funil || (funil === 'wx' ? ehWX(c) : !ehWX(c));
// Ações em lote ou de configuração: não valem para quem está restrito a um funil (mostrariam ou mexeriam em cards do outro)
export const ACOES_GLOBAIS = new Set(['floresta_cfg', 'floresta_exclusao', 'floresta_liberacao_rodar', 'floresta_parados_rodar', 'floresta_importar', 'floresta_abordagem_todo', 'floresta_remarketing_lista', 'floresta_ligacao_placar', 'floresta_apollo', 'floresta_apollo_listas', 'floresta_enriquecer', 'floresta_props_ia', 'floresta_voz_config', 'floresta_voz_teste']);
export const idsDoPayload = p => [p?.card_id, p?.id, ...(Array.isArray(p?.card_ids) ? p.card_ids : []), ...(Array.isArray(p?.ids) ? p.ids : [])].filter(Boolean).map(String);
