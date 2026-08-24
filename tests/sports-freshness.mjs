import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SpF = require(join(ROOT, 'scripts/sports-freshness-lib.js'));

const REF = new Date('2026-07-30T15:00:00');

test('sports-freshness : hors fenêtre → 1 priorSeason', () => {
  const { games, priorSeason } = SpF.prunePastGames(
    [{ date: '2024-10-01', result: 'W' }, { date: '2023-01-01', result: 'L' }],
    REF,
  );
  assert.equal(priorSeason, true);
  assert.equal(games.length, 1);
  assert.equal(games[0].priorSeason, true);
});

test('sports-freshness : nextGame horizon session+1', () => {
  assert.equal(SpF.isNextGameInHorizon({ date: '2026-11-15' }, REF), true);
  assert.equal(SpF.isNextGameInHorizon({ date: '2027-02-01' }, REF), false);
});

test('sports-freshness : nextGame jour civil Toronto (pas UTC 20 h EDT)', () => {
  const utcNextDay = new Date('2026-08-24T00:30:00.000Z'); // 20:30 EDT le 23
  assert.equal(SpF.torontoDayKey(utcNextDay), '2026-08-23');
  assert.equal(SpF.isNextGameInHorizon({ date: '2026-08-23' }, utcNextDay), true);
});

test('sports-freshness : payload sports.json prune sans casser', () => {
  const data = require(join(ROOT, 'sports.json'));
  const pruned = SpF.pruneSportsPayload(data, REF);
  assert.ok(pruned.teams);
  const n = Object.keys(pruned.teams).length;
  assert.ok(n > 100);
});
