// Correctif 3 (3 nov. 2026) : issue par station (refonte / 7 jours) + « grille non vérifiée ».
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { planRadioIssues, titleFor } = require('../scripts/radio-schedule-issues.js');

const now = Date.parse('2026-11-03T12:00:00Z');
const schedules = { stations: {
  cism: { name: 'CISM', checkedAt: '2026-11-03T11:00:00Z', grid: [{}] },
  cjlo: { name: 'CJLO', checkedAt: '2026-10-20T11:00:00Z', unverified: true, grid: [{}] },
  cfak: { name: 'CFAK', checkedAt: '2026-11-02T11:00:00Z', grid: [{}] },
} };
const drift = { stations: [{ id: 'cism', status: 'overhaul', added: [1, 2], removed: [3], ratio: 1.2 }, { id: 'cfak', status: 'stable' }] };
const plan = planRadioIssues({ drift, schedules, now });
const by = Object.fromEntries(plan.map((p) => [p.id, p]));
assert.equal(by.cism.open, true);
assert.match(by.cism.body, /refaite/);
assert.equal(by.cjlo.open, true);
assert.match(by.cjlo.body, /14 jour\(s\) \(site officiel injoignable\)/);
assert.equal(by.cfak.open, false, 'station stable et récente : pas d’issue');
assert.equal(new Set(plan.map((p) => p.title)).size, plan.length, 'un titre unique par station');
assert.equal(titleFor('chyz'), 'Radio : grille à vérifier — CHYZ');

// Collecteur : site injoignable → grille gardée et marquée unverified.
const { selectScheduleGrid } = require('../scripts/radio-schedule-lib.js');
const previous = { grid: [{ day: 1, start: '09:00', end: '10:00', title: 'Real show' }], checkedAt: '2026-11-02T11:00:00Z' };
const retained = selectScheduleGrid({ grid: [], previous, now: new Date(now).toISOString() });
assert.equal(retained.unverified, true);
assert.equal(retained.checkedAt, previous.checkedAt);
assert.deepEqual(retained.grid, previous.grid);
// Radar : la mention s'affiche.
const tuner = fs.readFileSync(new URL('../radar-tuner.js', import.meta.url), 'utf8');
assert.match(tuner, /grille non vérifiée/);
console.log('radio-schedule-issues: ok');
