#!/usr/bin/env node
/** Surveillance des sources : échecs, silence hors congés, sommeil/réveil, images. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lib = require('../scripts/source-health-lib.js');
const ret = require('../scripts/source-retention-lib.js');

const NOW = new Date('2026-10-25T17:00:00Z');
assert.equal(lib.isBreakDay(new Date('2026-07-15T12:00:00Z')), true);
assert.equal(lib.isBreakDay(new Date('2026-10-01T12:00:00Z')), false);
// Été entier = 0 jour de classe.
assert.equal(lib.schoolDaysBetween(Date.parse('2026-05-02T00:00:00Z'), Date.parse('2026-09-01T00:00:00Z')), 0);

const reg = { active: [
  { name: 'Muet été', url: 'https://a/feed', _lastItemDate: '2026-04-30T12:00:00Z', _failCount: 0 },
  { name: 'Pause lecture', url: 'https://b/feed', _lastItemDate: '2026-10-08T12:00:00Z', _failCount: 0 },
  { name: 'Hebdo muet', url: 'https://c/feed', _lastItemDate: '2026-09-10T12:00:00Z', _failCount: 0 },
  { name: 'En panne', url: 'https://d/feed', _lastItemDate: '2026-10-24T12:00:00Z', _failCount: 3 },
] };
const weekly = Array.from({ length: 10 }, (_, i) => new Date(Date.parse('2026-01-20T12:00:00Z') + i * 7 * 86400000).toISOString());
const r = lib.evaluateHealth({ registry: reg, datesBySource: { 'Hebdo muet': weekly },
  imageStats: { targets: 149, failed: 43, failReasons: { 'too large': 43 } }, now: NOW });
const kinds = Object.fromEntries(r.problems.map((p) => [p.source, p.kind]));
assert.equal(kinds['Hebdo muet'], 'silent');
assert.equal(kinds['En panne'], 'feed');
assert.equal(kinds['Pause lecture'], undefined, 'semaine de lecture = pas de bruit');
assert.equal(kinds['miroir d’images'], 'images');
assert.ok(reg.active[0]._dormantSince, 'muet > 120 j → sommeil');
assert.ok(!kinds['Muet été']);
assert.match(lib.renderIssueBody(r, NOW), /En sommeil/);

// Sans problème → aucune alerte (l'issue se ferme).
const ok = lib.evaluateHealth({ registry: { active: [] }, imageStats: { targets: 149, failed: 0 }, now: NOW });
assert.equal(ok.problems.length, 0);

// Sommeil : collecte OK sans nouvel article → stale ; article récent → réveil.
const z = { name: 'Zone', url: 'https://z/feed', _lastItemDate: '2026-05-08T14:20:26Z', _dormantSince: '2026-10-25T00:00:00Z' };
ret.applyFetchRegistryUpdate(z, { fetchOk: true, items: [], referenceDate: NOW });
assert.equal(z._status, 'stale');
assert.ok(z._dormantSince);
ret.applyFetchRegistryUpdate(z, { fetchOk: true, items: [{ date: '2026-10-25T12:00:00Z' }], referenceDate: NOW });
assert.equal(z._dormantSince, undefined);
assert.equal(z._status, 'ok');

// Miroir : candidats réduits pour les photos trop lourdes.
const mirror = require('../scripts/mirror-news-images.js');
const c = mirror.resizedCandidates('https://www.delitfrancais.com/wp-content/uploads/2026/10/x.png');
assert.match(c[0].url, /^https:\/\/wsrv\.nl\/\?url=/);
assert.match(c[1].url, /^https:\/\/i0\.wp\.com\/www\.delitfrancais\.com\/wp-content\/uploads\/2026\/10\/x\.png\?w=1200/);
// Jamais la même image sur deux cartes : le plus récent garde la photo.
const { keepNewestSharedImage } = require('../scripts/article-image-lib.js');
const pair = [
  { source: 'Le Délit', date: '2026-09-20T12:00:00Z', image: 'https://x/wp-content/uploads/2026/09/Huitres.png' },
  { source: 'Le Délit', date: '2026-09-27T12:00:00Z', image: 'https://x/wp-content/uploads/2026/09/Huitres.png' },
];
assert.equal(keepNewestSharedImage(pair), 1);
assert.equal(pair[0].image, '');
assert.ok(pair[1].image);
console.log('source-health: OK');
