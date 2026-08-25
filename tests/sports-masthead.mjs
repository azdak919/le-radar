import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { buildSportsMastheadPayload } = require(join(ROOT, 'scripts/sports-masthead-lib.js'));

function team(id, code, nextGames = [], results = []) {
  return {
    id, name: id, fullName: id, code, sector: 'collegial', sport: 'soccer',
    nextGames, nextGame: nextGames[0] || null,
    results, lastGame: results[0] || null,
    record: { noisy: true },
  };
}

test('sports masthead : garde les deux faces des prochains matchs choisis', () => {
  const first = { gameId: 'first', date: '2026-08-26', time: '18:00', opponentCode: 'BBB' };
  const firstOther = { ...first, opponentCode: 'AAA' };
  const later = { gameId: 'later', date: '2026-09-02', time: '18:00', opponentCode: 'CCC' };
  const data = {
    updated: '2026-08-25T12:00:00.000Z',
    teams: {
      a: team('a', 'AAA', [first]),
      b: team('b', 'BBB', [firstOther]),
      c: team('c', 'CCC', [later]),
    },
  };
  const compact = buildSportsMastheadPayload(data, { nextGameLimit: 1, resultLimit: 0 });
  assert.deepEqual(Object.keys(compact.teams).sort(), ['a', 'b']);
  assert.equal(compact.teams.a.nextGames[0].gameId, 'first');
  assert.equal(compact.teams.b.nextGames[0].gameId, 'first');
  assert.equal(compact.teams.a.record, undefined);
});

test('sports masthead : snapshot commité léger et exploitable', () => {
  const full = require(join(ROOT, 'sports.json'));
  const compact = require(join(ROOT, 'sports-masthead.json'));
  assert.ok(compact.updated);
  assert.ok(compact.teamCount > 0);
  assert.equal(compact.teamCount, Object.keys(compact.teams).length);
  assert.ok(compact.teamCount < Object.keys(full.teams).length);
  assert.ok(compact.masthead?.nextGameLimit >= 16);
  assert.ok(
    statSync(join(ROOT, 'sports-masthead.json')).size < statSync(join(ROOT, 'sports.json')).size * 0.1,
    'le snapshot du mât doit rester sous 10 % du payload complet',
  );
});
