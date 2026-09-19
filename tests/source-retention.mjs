#!/usr/bin/env node
/**
 * Registre news : re-sonde des dead, challenge ≠ mort, resurrection.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lib = require(join(ROOT, 'scripts/source-retention-lib.js'));

const NOW = new Date('2026-09-19T14:00:00Z');

assert.equal(lib.isFetchableNewsSource({ name: 'The Tribune', url: 'https://www.thetribune.ca/feed/', _status: 'dead' }), true);
assert.equal(lib.isFetchableNewsSource({ name: 'Média — UQAR', url: 'https://uqar.ca/feed/' }), false);
assert.equal(lib.isFetchableNewsSource({ name: 'Orphan' }), false);

assert.equal(lib.looksLikeRssOrAtom('<?xml version="1.0"?><rss version="2.0"><channel>'), true);
assert.equal(lib.looksLikeRssOrAtom('<html><title>Just a moment...</title>'), false);

const challenge = '<!DOCTYPE html><html><head><title>Just a moment...</title><script src="https://challenges.cloudflare.com/x"></script>';
assert.equal(lib.isChallengeOrInterstitialPage(challenge), true);
assert.equal(lib.isChallengeOrInterstitialPage('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'), false);

const tribune = {
  name: 'The Tribune',
  _status: 'dead',
  _failCount: 0,
  _lastItemDate: '2026-09-08T15:35:43.000Z',
};
lib.applyUnreachableRegistryUpdate(tribune, {
  cachedFresh: false,
  lastItemDate: tribune._lastItemDate,
  referenceDate: NOW,
  maxFails: 4,
});
assert.equal(tribune._status, 'stale', 'challenge/non-feed with in-window lastItem → stale, not dead');
assert.equal(tribune._failCount, 1);

lib.applyFetchRegistryUpdate(tribune, {
  fetchOk: true,
  usedStaleCache: false,
  items: [{ date: '2026-09-08T15:35:43.000Z', title: 'Blackface at McGill' }],
  referenceDate: NOW,
});
assert.equal(tribune._status, 'ok', 'successful fetch resurrects dead');
assert.equal(tribune._failCount, 0);

const ancient = { name: 'L\'Oisif', _status: 'ok', _failCount: 3, _lastItemDate: '2019-08-23T18:43:43.000Z' };
lib.applyUnreachableRegistryUpdate(ancient, { referenceDate: NOW, maxFails: 4 });
assert.equal(ancient._status, 'dead', 'out-of-window + max fails → dead');

const fetchNews = readFileSync(join(ROOT, 'scripts/fetch-news.js'), 'utf8');
assert.match(fetchNews, /isFetchableNewsSource/);
assert.doesNotMatch(fetchNews, /s\._status === 'dead'\) return false/);
assert.match(fetchNews, /re-probe previously dead/);

const discover = readFileSync(join(ROOT, 'scripts/discover-news-sources.js'), 'utf8');
assert.match(discover, /applyUnreachableRegistryUpdate/);
assert.match(discover, /isChallengeOrInterstitialPage/);
assert.match(discover, /challenge-page|non-feed-body/);

console.log('OK source-retention');
