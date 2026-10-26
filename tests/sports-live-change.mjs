// Sports live : on ne pousse plus le simple tampon horaire ; un pointage ou
// un état (En cours / Final) part tout de suite, le reste au plus 1×/15 min.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { classify } = require('../scripts/sports-live-change.js');

const base = { updated: 'a', fetchedAt: 'a', liveSourceStatus: { at: 'a' }, teams: { t: { games: [{ id: 1, date: '2026-10-26', scoreFor: 1, scoreAgainst: 0 }, { id: 2, date: '2026-10-27' }] } } };
const clone = (x) => JSON.parse(JSON.stringify(x));

let b = clone(base); b.updated = 'b'; b.fetchedAt = 'b'; b.liveSourceStatus.at = 'b';
assert.equal(classify([[base, b]]).kind, 'none', 'horodatages seuls');

b = clone(base); b.teams.t.games.reverse();
assert.equal(classify([[base, b]]).kind, 'none', 'simple ré-ordre');

b = clone(base); b.teams.t.games[0].scoreFor = 2;
assert.equal(classify([[base, b]]).kind, 'urgent', 'pointage');

b = clone(base); b.teams.t.games[1].result = 'W';
assert.equal(classify([[base, b]]).kind, 'urgent', 'résultat final');

b = clone(base); b.teams.t.games[1].awaitingResults = true;
assert.equal(classify([[base, b]]).kind, 'urgent', 'état En cours / en attente');

b = clone(base); b.teams.t.games[1].time = '19:00';
assert.equal(classify([[base, b]]).kind, 'data', 'calendrier');

b = clone(base); b.teams.t.games.push({ id: 3, date: '2026-11-01' });
assert.equal(classify([[base, b]]).kind, 'data', 'nouveau match à venir');

const yml = readFileSync(new URL('../.github/workflows/update-sports-live.yml', import.meta.url), 'utf8');
assert.match(yml, /sports-live-change\.js/);
assert.match(yml, /LIVE_MIN_PUSH_SECONDS:\s*'900'/);
console.log('OK sports-live-change');
