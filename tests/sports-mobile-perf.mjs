// Page Sports sur mobile : garde-fous de performance (9 nov. 2026).
// Mesuré à 4× CPU (390 px) : le bandeau recalculait des heures de match avec un
// nouvel Intl.DateTimeFormat à chaque appel, l’actualisation 30 s réécrivait
// ~8 450 <time>, et ~870 fiches hors écran étaient mises en page et peintes.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const Fresh = require('../scripts/sports-freshness-lib.js');
const js = readFileSync(new URL('../sports-board.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../seo-pages.css', import.meta.url), 'utf8');
const cta = readFileSync(new URL('../radar-sports-cta.js', import.meta.url), 'utf8');

// 1) Mémo : mêmes valeurs à chaque appel, clé par fuseau, cas DST intacts.
for (let i = 0; i < 3; i++) {
  assert.equal(Fresh.zonedTimeToMs('2026-11-13', '19:00'), Date.parse('2026-11-14T00:00:00Z'));
  assert.equal(Fresh.zonedTimeToMs('2026-11-13', '19h00'), Date.parse('2026-11-14T00:00:00Z'));
  assert.equal(Fresh.zonedTimeToMs('2026-11-13', '19:00', 'Europe/Paris'), Date.parse('2026-11-13T18:00:00Z'));
  assert.equal(Fresh.zonedTimeToMs('2026-11-01', '01:30'), Date.parse('2026-11-01T05:30:00Z'), 'heure répétée : première occurrence');
  assert.ok(Number.isNaN(Fresh.zonedTimeToMs('2026-03-08', '02:30')), 'heure inexistante');
  assert.ok(Number.isNaN(Fresh.zonedTimeToMs('2026-11-07', '15:00', 'Invalid/Timezone')));
  assert.ok(Number.isNaN(Fresh.zonedTimeToMs('2026-11-07', '')));
}
assert.equal(Fresh.torontoDayKey(Date.parse('2026-11-09T04:59:00Z')), '2026-11-08');
assert.equal(Fresh.torontoDayKey(Date.parse('2026-11-09T05:00:00Z')), '2026-11-09');
const lib = readFileSync(new URL('../scripts/sports-freshness-lib.js', import.meta.url), 'utf8');
const zoned = lib.match(/function zonedTimeToMs[\s\S]*?\n  }\n/)[0];
assert.ok(!/new Intl\.DateTimeFormat/.test(zoned), 'zonedTimeToMs réutilise un formateur mémorisé');
const cDay = cta.match(/function torontoDayKey[\s\S]*?\n}\n/)[0];
assert.match(cDay, /torontoDayKeyFormatter/, 'bandeau : formateur du jour civil réutilisé');

// 2) Actualisation 30 s : pas de réécriture inutile.
assert.match(js, /function setHidden\(el, hidden\) \{\n    if \(el && el\.hidden !== hidden\) el\.hidden = hidden;/);
const apply = js.match(/  function apply\(sport[\s\S]*?\n  function currentFilters/)[0];
const upcoming = js.match(/  function applyUpcomingVisibility[\s\S]*?\n  root\.addEventListener/)[0];
for (const [name, src] of [['apply', apply], ['applyUpcomingVisibility', upcoming]]) {
  assert.ok(!/\b(row|panel|heading|block|button)\.hidden = /.test(src), `${name} : écrire hidden via setHidden`);
}
assert.match(js, /function relabelCivilDays\(\) \{\n    if \(!SportsDate\) return;\n    const today = SportsDate\.civilNow\(Date\.now\(\)\);\n    if \(today === relabeledDay\) return;/, 'relabel seulement au changement de jour civil');
assert.match(js, /if \(!printWeekDirty && day === printWeekDay\) return;/, 'semaine imprimée recalculée au changement de jour');

// 3) Fiches hors écran : rendues à la demande en une colonne seulement.
assert.match(css, /\.sports-board:not\(\.is-masonry\) > \.sports-panel \{\n  content-visibility: auto;\n  contain-intrinsic-size: auto \d+px;\n\}/);
assert.match(css, /@media print \{\n  \.sports-board > \.sports-panel \{ content-visibility: visible; \}\n\}/);
assert.ok(!/\.sports-board\.is-masonry[^{]*\{[^}]*content-visibility/.test(css), 'la mosaïque mesure de vraies hauteurs');
// Liens profonds : la cible doit finir à l’écran malgré les hauteurs de réserve.
assert.match(js, /function scrollIntoViewSettled\(el, block = 'center'\)/);
assert.match(js, /scrollIntoViewSettled\(panel, 'center'\)/);
assert.match(js, /scrollIntoViewSettled\(row, 'center'\)/);
console.log('sports-mobile-perf : OK');
