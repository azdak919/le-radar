import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Live = require(join(ROOT, 'scripts/sports-live-lib.js'));

const KICK = '2026-08-23T21:00:00.000Z'; // 17:00 EDT
const NOW_BEFORE = Date.parse('2026-08-23T20:50:00.000Z'); // 16:50 EDT — 10 min avant
const NOW_LEAD = Date.parse('2026-08-23T20:50:00.000Z');
const NOW_LIVE = Date.parse('2026-08-23T21:20:00.000Z'); // 17:20 EDT
const NOW_DONE = Date.parse('2026-08-24T01:00:00.000Z'); // 21:00 EDT — hors fenêtre 3 h

test('zonedTimeToMs : 17:00 Québec = 21:00 UTC en août', () => {
  const ms = Live.zonedTimeToMs('2026-08-23', '17:00');
  assert.equal(new Date(ms).toISOString(), KICK);
});

test('torontoDayKey : 20:01 EDT reste le 23 (pas le 24 UTC)', () => {
  const ms = Date.parse('2026-08-24T00:01:00.000Z'); // 20:01 EDT le 23
  assert.equal(Live.torontoDayKey(ms), '2026-08-23');
});

test('fenêtre live : 15 min avant et 3 h après', () => {
  const game = { date: '2026-08-23', time: '17:00' };
  assert.equal(Live.isLiveRaw(game, NOW_BEFORE), true);
  assert.equal(Live.isLiveRaw(game, Date.parse('2026-08-23T20:40:00.000Z')), false); // 16:40
  assert.equal(Live.isLiveRaw(game, NOW_LIVE), true);
  assert.equal(Live.isLiveRaw(game, NOW_DONE), false);
});

test('0-0 encore dans la fenêtre n’est pas un résultat final', () => {
  const game = {
    date: '2026-08-23',
    time: '17:00',
    HomeTeamScore: 0,
    VisitingTeamScore: 0,
    IsSubmittedForStandings: false,
  };
  assert.equal(Live.rseqHasScore(game), true);
  assert.equal(Live.isLiveRaw(game, NOW_LIVE), true);
  assert.equal(Live.isFinalRaw(game, NOW_LIVE), false);
  assert.equal(Live.isFinalRaw(game, NOW_DONE), true);
});

test('classements versés → final, plus live', () => {
  const game = {
    date: '2026-08-23',
    time: '17:00',
    HomeTeamScore: 2,
    VisitingTeamScore: 1,
    IsSubmittedForStandings: true,
  };
  assert.equal(Live.isFinalRaw(game, NOW_LIVE), true);
  assert.equal(Live.isLiveRaw(game, NOW_LIVE), false);
});

test('annotateNextGame : scores live côté domicile', () => {
  const out = {
    date: '2026-08-23',
    time: '17:00',
    home: true,
    opponent: 'Vanier',
    sport: 'soccer',
  };
  const raw = {
    date: '2026-08-23',
    time: '17:00',
    HomeTeamScore: 1,
    VisitingTeamScore: 0,
    TimeLeftPeriod: '1',
    IsSubmittedForStandings: false,
  };
  Live.annotateNextGame(out, raw, { home: true, sport: 'soccer', now: NOW_LIVE });
  assert.equal(out.live, true);
  assert.equal(out.scoreFor, 1);
  assert.equal(out.scoreAgainst, 0);
  assert.equal(out.period, '1re mi-temps');
  assert.equal(out.final, undefined);
});

test('findLiveLeagueIds : nextGame dans la fenêtre', () => {
  const teams = {
    a: {
      leagueId: 'league-soccer-d1',
      nextGame: { date: '2026-08-23', time: '17:00', gameId: 'g1' },
    },
    b: {
      leagueId: 'league-hockey',
      nextGame: { date: '2026-09-01', time: '19:00', gameId: 'g2' },
    },
  };
  const ids = Live.findLiveLeagueIds(teams, NOW_LIVE);
  assert.deepEqual(ids, ['league-soccer-d1']);
});
