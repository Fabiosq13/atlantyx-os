// v3.634 — Acordo de POC: o modelo tem todos os capítulos definidos e o servidor sabe redigir cada um
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const win = {}; vm.runInNewContext(fs.readFileSync(new URL('../public/proposta-modelo.js', import.meta.url), 'utf8'), { window: win, document: {}, fetch() {}, console });
const { MODELOS, CAP, mdBlocos } = win.ATXModelo;
const vendas = fs.readFileSync(new URL('../api/vendas.js', import.meta.url), 'utf8');

test('acordo_poc: todo capítulo tem título definido e é marcado como acordo', () => {
  const M = MODELOS.acordo_poc; assert.ok(M && M.acordo);
  for (const k of M.caps) assert.ok(CAP[k] && CAP[k].t, 'capítulo sem definição: ' + k);
  assert.ok(!M.caps.includes('rate_card') && !M.caps.includes('apresentacao'), 'POC não leva rate card nem apresentação');
  assert.ok(M.caps.includes('aceite') && M.caps.includes('acordo_legal') && M.caps.includes('acordo_criterios'));
});
test('acordo_poc: cada capítulo novo é redigido pelo servidor e tem título no Word', () => {
  for (const k of MODELOS.acordo_poc.caps.filter(c => /^acordo_/.test(c))) {
    assert.ok(new RegExp('\\b' + k + ': ').test(vendas), 'sem instrução de redação no servidor: ' + k);
    assert.ok(vendas.includes(k + ": '"), 'sem título no servidor: ' + k);
  }
});
test('as propostas existentes continuam com os mesmos capítulos', () => {
  assert.equal(MODELOS.tecnica_comercial.caps.length, 17); assert.equal(MODELOS.comercial.caps.length, 10); assert.equal(MODELOS.tecnica.caps.length, 14);
});
test('mdBlocos entende subtítulos e marcadores do acordo', () => {
  const b = mdBlocos('### Critérios\n- um\n- dois\n\n**C1 — Taxa:** meta 90%'); assert.ok(b.some(x => x.t === 'sub') && b.length >= 3);
});
