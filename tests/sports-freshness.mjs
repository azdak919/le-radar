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

test('sports-freshness : mât CTA = aujourd’hui+hier, puces = 5 j civils', () => {
  // Vendredi 28 août 2026 — un dimanche 17 h doit encore tenir (5 j, pas 5×24 h).
  const fri = new Date('2026-08-28T19:00:00-04:00');
  assert.equal(SpF.torontoDayKey(fri), '2026-08-28');
  assert.equal(SpF.civilDaysAgo({ date: '2026-08-28' }, fri), 0);
  assert.equal(SpF.civilDaysAgo({ date: '2026-08-27' }, fri), 1);
  assert.equal(SpF.civilDaysAgo({ date: '2026-08-23' }, fri), 5);
  assert.equal(SpF.civilDaysAgo({ date: '2026-08-22' }, fri), 6);

  assert.equal(SpF.isMastheadCtaResult({ date: '2026-08-28' }, fri), true);
  assert.equal(SpF.isMastheadCtaResult({ date: '2026-08-27' }, fri), true);
  assert.equal(SpF.isMastheadCtaResult({ date: '2026-08-26' }, fri), false);

  assert.equal(SpF.isMastheadChipResult({ date: '2026-08-23' }, fri), true);
  assert.equal(SpF.isMastheadChipResult({ date: '2026-08-22' }, fri), false);
  assert.equal(SpF.MASTHEAD_CTA_RESULT_MAX_DAYS_AGO, 1);
  assert.equal(SpF.MASTHEAD_CHIP_RESULT_MAX_DAYS_AGO, 5);
});

test('sports-freshness : jour civil = champ date, pas l’heure locale du runner', () => {
  const utcMorning = new Date('2026-08-29T03:30:00.000Z'); // 23:30 EDT le 28
  assert.equal(SpF.torontoDayKey(utcMorning), '2026-08-28');
  assert.equal(SpF.gameCivilDayKey({ date: '2026-08-28', time: '23:00' }), '2026-08-28');
  assert.equal(SpF.isMastheadCtaResult({ date: '2026-08-28', time: '23:00' }, utcMorning), true);
});

test('sports-freshness : payload sports.json prune sans casser', () => {
  const data = require(join(ROOT, 'sports.json'));
  const pruned = SpF.pruneSportsPayload(data, REF);
  assert.ok(pruned.teams);
  const n = Object.keys(pruned.teams).length;
  assert.ok(n > 100);
});
