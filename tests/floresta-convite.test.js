import test from 'node:test'; import assert from 'node:assert/strict';
import { icsReuniao } from '../lib/floresta-email.js';
test('v3.608: convite .ics da reunião (horário de Brasília → UTC, participantes, 30 min)', () => {
  const ics = icsReuniao({ data: '2026-11-26T11:00', titulo: 'Reunião Atlantyx × Empresa Teste', organizador: 'sistema@teste.com', participantes: ['a@teste.com', 'b@teste.com'] });
  assert.match(ics, /METHOD:REQUEST/); assert.match(ics, /DTSTART:20261126T140000Z/); assert.match(ics, /DTEND:20261126T143000Z/);
  assert.equal((ics.match(/ATTENDEE/g) || []).length, 2); assert.equal(icsReuniao({ data: 'amanhã 11h', titulo: 'x' }), null);
});
