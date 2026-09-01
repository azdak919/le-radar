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

test('sports masthead : résultats hors 5 j civils exclus, filet 1 si vide', () => {
  const ref = new Date('2026-08-28T19:00:00-04:00');
  const hot = { gameId: 'hot', date: '2026-08-27', time: '18:00', opponentCode: 'BBB' };
  const stale = { gameId: 'stale', date: '2026-08-01', time: '18:00', opponentCode: 'CCC' };
  const withHot = buildSportsMastheadPayload({
    updated: '2026-08-28T12:00:00.000Z',
    teams: {
      a: team('a', 'AAA', [], [hot]),
      c: team('c', 'CCC', [], [stale]),
    },
  }, { nextGameLimit: 0, resultLimit: 8, referenceDate: ref });
  assert.deepEqual(Object.keys(withHot.teams).sort(), ['a']);
  assert.equal(withHot.teams.a.results[0].gameId, 'hot');
  assert.equal(withHot.masthead.chipResultMaxDaysAgo, 5);
  assert.equal(withHot.masthead.ctaResultMaxDaysAgo, 1);

  const onlyStale = buildSportsMastheadPayload({
    updated: '2026-08-28T12:00:00.000Z',
    teams: {
      c: team('c', 'CCC', [], [stale]),
    },
  }, { nextGameLimit: 0, resultLimit: 8, referenceDate: ref });
  assert.deepEqual(Object.keys(onlyStale.teams), ['c']);
  assert.equal(onlyStale.teams.c.results[0].gameId, 'stale');
});

test('sports masthead : tous les matchs uniques de la fenêtre 5 j', () => {
  const SpF = require(join(ROOT, 'scripts/sports-freshness-lib.js'));
  const full = require(join(ROOT, 'sports.json'));
  const ref = new Date();
  function keyOf(game, team) {
    if (game?.gameId != null && String(game.gameId).trim()) return `id:${game.gameId}`;
    const pair = [team?.code, game?.opponentCode || game?.opponent]
      .filter(Boolean).map((v) => String(v).toUpperCase()).sort().join('|');
    return `pair:${game?.date || ''}|${game?.time || ''}|${game?.sport || team?.sport || ''}|${pair}`;
  }
  const wanted = new Set();
  for (const team of Object.values(full.teams || {})) {
    for (const g of [team.lastGame, ...(team.results || [])].filter(Boolean)) {
      if (SpF.isMastheadChipResult(g, ref)) wanted.add(keyOf(g, team));
    }
  }
  const compact = buildSportsMastheadPayload(full, { referenceDate: ref });
  const got = new Set();
  for (const team of Object.values(compact.teams || {})) {
    for (const g of [team.lastGame, ...(team.results || [])].filter(Boolean)) {
      got.add(keyOf(g, team));
    }
  }
  const missing = [...wanted].filter((k) => !got.has(k));
  assert.equal(missing.length, 0, `mât : ${missing.length} matchs 5 j absents (limite trop basse)`);
  assert.ok(compact.masthead.resultLimit >= wanted.size);
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
    statSync(join(ROOT, 'sports-masthead.json')).size < statSync(join(ROOT, 'sports.json')).size * 0.15,
    'le snapshot du mât doit rester sous 15 % du payload complet',
  );
});
