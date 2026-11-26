// Montée Instagram de La une (data/social/policy.json, formats.une.prepared.instagram.ramp).
// Lit la vraie politique : un changement de calendrier doit passer par ce test.
import assert from 'node:assert/strict';
import { POLICY } from '../scripts/social/policy.mjs';
import { instagramSlotAllowed, rampDay } from '../scripts/social/instagram.mjs';

const cfg = POLICY.formats.une.prepared.instagram;
// Heures de Montréal (HNE, UTC-5 en novembre).
const at = (day, hhmm) => Date.parse(`${day}T${hhmm}:00-05:00`);
const ok = (day, hhmm, slotId, posted = 0) => instagramSlotAllowed({ now: at(day, hhmm), slotId, format: 'une', cfg, posted });

assert.equal(rampDay(at('2026-11-22', '19:30'), cfg.ramp.start), 1, 'jour 1 = 22 novembre');
assert.equal(rampDay(at('2026-11-25', '07:45'), cfg.ramp.start), 4, 'jour 4 = 25 novembre');

// Jours 1-3 : le soir seulement, une publication.
assert.equal(ok('2026-11-23', '07:45', 'matin').ok, false, 'jour 2 : pas de une du matin');
assert.equal(ok('2026-11-23', '19:30', 'soir').ok, true, 'jour 2 : une du soir');
assert.equal(ok('2026-11-23', '19:30', 'soir', 1).ok, false, 'jour 2 : plafond 1');

// Dès le jour 4 : matin et soir, deux par jour.
assert.equal(ok('2026-11-26', '07:45', 'matin').ok, true, 'jour 5 : une du matin');
assert.equal(ok('2026-11-26', '19:30', 'soir', 1).ok, true, 'jour 5 : une du soir après celle du matin');
assert.equal(ok('2026-11-26', '19:30', 'soir', 2).ok, false, 'jour 5 : plafond 2');
assert.equal(ok('2026-11-30', '07:45', 'matin').ok, true, 'jour 9 : une du matin');

// Pas de doublon pour une même période.
const state = { sent: { 'une:2026-11-26:matin': { id: 'x', day: '2026-11-26' } } };
assert.equal(instagramSlotAllowed({ now: at('2026-11-26', '08:00'), slotId: 'matin', format: 'une', cfg, posted: 1, dedupKey: 'une:2026-11-26:matin', state }).ok, false, 'pas deux fois le même matin');

console.log('social-instagram-ramp : OK');
