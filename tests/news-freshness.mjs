/* Règle d'affichage des articles : session en cours OU ≤ 45 jours.
 * Run: node tests/news-freshness.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SF = require('../scripts/session-freshness-lib.js');
const RL = require('../scripts/source-retention-lib.js');

const d = (y, m, day) => new Date(y, m, day, 12);
const item = (date) => ({ date: date.toISOString() });

assert.equal(SF.NEWS_MAX_AGE_DAYS, 45);
// 23 oct. 2026 : un article d'hiver (18 avr.) n'est plus affiché.
const oct23 = d(2026, 9, 23);
assert.equal(SF.isWithinFreshnessWindow(item(d(2026, 3, 18)), oct23), false, 'avril hors fenêtre en octobre');
assert.equal(SF.isWithinFreshnessWindow(item(d(2026, 6, 10)), oct23), false, 'juillet hors fenêtre en octobre');
assert.equal(SF.isWithinFreshnessWindow(item(d(2026, 8, 2)), oct23), true, 'septembre = session en cours');
assert.equal(SF.isWithinFreshnessWindow(item(d(2026, 9, 30)), oct23), false, 'futur exclu');
// Rentrée : le 5 sept., la fin de l'été (≤ 45 j) reste visible.
const sep5 = d(2026, 8, 5);
assert.equal(SF.isWithinFreshnessWindow(item(d(2026, 7, 1)), sep5), true, 'août visible début sept.');
assert.equal(SF.isWithinFreshnessWindow(item(d(2026, 6, 1)), sep5), false, 'juillet caché début sept.');
// Session longue : décembre garde tout l'automne (> 45 j).
assert.equal(SF.isWithinFreshnessWindow(item(d(2026, 8, 3)), d(2026, 11, 15)), true);
// Source muette : aucun article de repli.
assert.deepEqual(SF.filterFreshItems([item(d(2026, 3, 18))], oct23), []);
// Cycle de vie des sources : toujours 3 sessions (pas de retrait prématuré).
assert.equal(SF.isWithinSessionCycleWindow(item(d(2026, 3, 18)), oct23), true);
assert.equal(RL.shouldDropSource({ priorItems: [], registryEntry: { _lastItemDate: d(2026, 3, 18).toISOString() }, referenceDate: oct23 }), false);
console.log('OK news-freshness');
