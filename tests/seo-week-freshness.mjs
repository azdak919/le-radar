import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { currentWeekLabel, isWeekLabelStale } = require('../scripts/seo-week-freshness.js');

// Dimanche soir 11 oct. 23 h 30 HE → encore la semaine du 5 octobre.
const sunday = new Date('2026-10-12T03:30:00Z');
// Lundi 12 oct. 1 h HE (heure du run RSEQ échoué) → semaine du 12.
const monday = new Date('2026-10-12T05:03:00Z');
assert.equal(currentWeekLabel(sunday), '5 octobre 2026');
assert.equal(currentWeekLabel(monday), '12 octobre 2026');
const html = '<span>Semaine du 5 octobre 2026</span>';
assert.equal(isWeekLabelStale(html, sunday), false);
assert.equal(isWeekLabelStale(html, monday), true, 'bascule du lundi détectée');
assert.equal(isWeekLabelStale('<p>sans grille</p>', monday), false);
console.log('seo-week-freshness: ok');
