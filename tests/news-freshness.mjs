/* Règle d'affichage des articles : session en cours OU ≤ 45 jours.
 * Run: node tests/news-freshness.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
// Source muette : aucun article de repli (filtre strict).
assert.deepEqual(SF.filterFreshItems([item(d(2026, 3, 18))], oct23), []);
// Filet d'affichage : ne pas vider tout le fil si la fenêtre écarte tout.
const staleOnly = [item(d(2026, 3, 18)), item(d(2026, 6, 10))];
assert.deepEqual(SF.filterFreshItems(staleOnly, oct23), []);
assert.equal(SF.filterFreshItemsLenient(staleOnly, oct23).length, 2, 'filet : garder le pool publié');
const inWindow = [item(d(2026, 8, 2)), item(d(2026, 9, 1))];
assert.equal(SF.filterFreshItemsLenient(inWindow, oct23).length, 2, 'filet inerte si le pool est déjà frais');
// Cycle de vie des sources : toujours 3 sessions (pas de retrait prématuré).
assert.equal(SF.isWithinSessionCycleWindow(item(d(2026, 3, 18)), oct23), true);
assert.equal(RL.shouldDropSource({ priorItems: [], registryEntry: { _lastItemDate: d(2026, 3, 18).toISOString() }, referenceDate: oct23 }), false);

// Les docs ne doivent plus confondre l'affichage (session ou 45 j)
// avec le cycle de vie des sources (3 sessions).
const docs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../docs/adding-news-source.md'), 'utf8');
assert.doesNotMatch(docs, /fenêtre de fraîcheur UI\s*\(3 sessions/, 'docs : fenêtre UI ≠ 3 sessions');
assert.match(docs, /Le cycle de vie des sources suit 3 sessions/);
assert.match(docs, /fenêtre d'affichage/);

// Début de session : minuit heure de Montréal, pas minuit UTC (CI GitHub).
const nov20 = new Date('2026-11-20T08:07:24.876Z');
assert.equal(SF.FRESHNESS_TZ, 'America/Montreal');
assert.equal(SF.getCurrentUniversitySessionStart(nov20).toISOString(), '2026-09-01T04:00:00.000Z');
assert.equal(SF.getCurrentUniversitySessionId(nov20), 'automne');
assert.equal(SF.getCurrentUniversitySessionStart(new Date('2026-02-15T15:00:00Z')).toISOString(), '2026-01-01T05:00:00.000Z');
assert.equal(SF.getCurrentUniversitySessionStart(new Date('2026-06-15T15:00:00Z')).toISOString(), '2026-05-01T04:00:00.000Z');
// 1er janv. 03 h UTC = 31 déc. 22 h à Montréal : encore l'automne.
const nye = new Date('2027-01-01T03:00:00.000Z');
assert.equal(SF.getCurrentUniversitySessionId(nye), 'automne');
assert.equal(SF.getCurrentUniversitySessionStart(nye).toISOString(), '2026-09-01T04:00:00.000Z');
// 1er sept. 03 h UTC = 31 août 23 h à Montréal : encore l'été.
const aug31eve = new Date('2026-09-01T03:00:00.000Z');
assert.equal(SF.getCurrentUniversitySessionId(aug31eve), 'ete');
assert.equal(SF.getCurrentUniversitySessionStart(aug31eve).toISOString(), '2026-05-01T04:00:00.000Z');
// Le 20 nov., un article du 31 août au soir (UTC du 1er sept.) sort de la fenêtre.
assert.equal(SF.isWithinFreshnessWindow({ date: '2026-09-01T03:15:39.000Z' }, nov20), false, '31 août 23 h 15 Montréal hors session en novembre');
assert.equal(SF.isWithinFreshnessWindow({ date: '2026-09-01T04:00:00.000Z' }, nov20), true, '1er sept. 0 h Montréal dans la session');
// Début de session : la fenêtre de 45 jours garde encore la fin d'août.
const sep5utc = new Date('2026-09-05T16:00:00.000Z');
assert.equal(SF.isWithinFreshnessWindow({ date: '2026-09-01T03:15:39.000Z' }, sep5utc), true, '31 août encore visible le 5 sept. (45 j)');

console.log('OK news-freshness');
