/**
 * Format « packed » de sports.json : reconstruction exacte et compatibilité.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = require(join(ROOT, 'scripts/sports-payload-lib.js'));
const URL_BASE = P.RSEQ_GAME_URL;

function game(id, extra = {}) {
  return {
    date: '2026-10-10', time: '19:00', opponent: 'B', opponentCode: 'BBB', home: true,
    sport: 'soccer', competition: 'Soccer D1', gameId: id, url: URL_BASE + id,
    opponentFullName: 'Cégep B', opponentRegistryId: 'b', ...extra,
  };
}

function fixture() {
  const g1a = game('g1');
  const g1b = { ...game('g1'), opponent: 'A', opponentCode: 'AAA', home: false, opponentFullName: 'Cégep A', opponentRegistryId: 'a' };
  const r1a = { ...game('r1', { scoreFor: 2, scoreAgainst: 1, result: 'W', priorSeason: false }), date: '2026-10-01' };
  const r1b = { ...r1a, opponent: 'A', opponentCode: 'AAA', home: false, scoreFor: 1, scoreAgainst: 2, result: 'L', opponentFullName: 'Cégep A', opponentRegistryId: 'a' };
  return {
    updated: '2026-10-08T12:00:00Z',
    fetchedAt: '2026-10-08T12:00:00Z',
    source: 'rseq-s1-all',
    teams: {
      a: { id: 'a', name: 'A', code: 'AAA', nextGames: [g1a], nextGame: g1a, results: [r1a], lastGame: { ...r1a, opponentSector: 'collegial' }, record: { w: 1 } },
      b: { id: 'b', name: 'B', code: 'BBB', results: [r1b], lastGame: r1b, nextGames: [g1b], nextGame: g1b },
      // Hockey Spordle : pas de gameId, URL propre ; URL RSEQ non canonique.
      c: {
        id: 'c', name: 'C',
        nextGames: [{ date: '2026-10-12', opponent: 'D', url: 'https://example.org/x' }],
        nextGame: null,
        results: [game('odd', { url: 'https://example.org/odd' })],
        lastGame: game('nourl', { url: undefined }),
      },
      d: { id: 'd', name: 'Sans matchs', sport: 'golf', teamsPreservedOnError: undefined },
      e: { id: 'e', name: 'E', nextGames: [{ ...game('g9'), opponentNickname: undefined }], nextGame: undefined, results: [] },
    },
    teamCount: 4,
    // Comme fetch-sports : des clés à undefined, absentes du JSON écrit.
    errors: undefined,
  };
}

test('sports payload : pack → unpack identique (fixture, cas limites)', () => {
  const original = fixture();
  const src = JSON.parse(JSON.stringify(original));
  const packed = P.packSportsPayload(original);
  assert.equal(packed.format, P.FORMAT);
  assert.ok(P.isPacked(packed));
  // Le match g1 est stocké une fois ; l’URL RSEQ canonique n’est pas répétée.
  assert.equal(packed.games.filter((g) => g.id === 'g1').length, 1);
  assert.ok(!('url' in packed.games.find((g) => g.id === 'g1')));
  assert.equal(packed.games.find((g) => g.id === 'odd').url, 'https://example.org/odd');
  assert.equal(packed.games.find((g) => g.id === 'nourl').url, null);
  // Anciens lecteurs : plus de tableaux de matchs tronqués au premier niveau.
  assert.equal(packed.teams.a.nextGames, undefined);
  assert.equal(packed.teams.a.lastGame, undefined);
  const round = P.unpackSportsPayload(JSON.parse(JSON.stringify(packed)));
  assert.equal(JSON.stringify(round), JSON.stringify(src));
  // Re-pack du déplié = fichier packed (garde-fou de la gate bot).
  assert.equal(JSON.stringify(P.packSportsPayload(round)), JSON.stringify(packed));
});

test('sports payload : idempotent et transparent pour un payload déplié', () => {
  const src = fixture();
  assert.equal(P.unpackSportsPayload(src), src);
  const packed = P.packSportsPayload(src);
  assert.equal(P.packSportsPayload(packed), packed);
  const arr = { teams: Object.values(JSON.parse(JSON.stringify(src.teams))) };
  assert.equal(JSON.stringify(P.unpackSportsPayload(P.packSportsPayload(arr))), JSON.stringify(arr));
});

test('sports payload : sports.json commité se déplie et se re-packe à l’identique', () => {
  const raw = JSON.parse(readFileSync(join(ROOT, 'sports.json'), 'utf8'));
  assert.ok(P.isPacked(raw), 'sports.json doit être packed');
  const full = P.unpackSportsPayload(raw);
  assert.ok(Object.keys(full.teams).length > 100);
  for (const team of Object.values(full.teams)) {
    assert.equal(team.$games, undefined);
    for (const g of [...(team.nextGames || []), ...(team.results || [])]) {
      assert.ok(g.date, `${team.id} : match sans date après dépliage`);
      if (g.gameId) assert.ok(g.url, `${team.id} : URL RSEQ manquante`);
    }
  }
  assert.equal(JSON.stringify(P.packSportsPayload(full)), JSON.stringify(raw));
  const verbose = Buffer.byteLength(JSON.stringify(full));
  const packed = Buffer.byteLength(JSON.stringify(raw));
  assert.ok(packed < verbose * 0.6, `packed ${packed} vs déplié ${verbose} : gain < 40 %`);
});
