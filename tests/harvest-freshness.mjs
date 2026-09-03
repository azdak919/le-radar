#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Harvest = require(join(ROOT, 'scripts/harvest-freshness-lib.js'));

const EVENING = Date.parse('2026-09-02T22:10:00-04:00'); // 22 h 10 QC
const MORNING = Date.parse('2026-09-02T08:00:00-04:00');
const NOON = Date.parse('2026-09-02T12:30:00-04:00');

assert.equal(Harvest.torontoHour(EVENING), 22);
assert.equal(Harvest.torontoHour(MORNING), 8);
assert.equal(Harvest.slaMinutes(Harvest.FEEDS.sports, 22), 90);
assert.equal(Harvest.slaMinutes(Harvest.FEEDS.sports, 8), 360);
assert.equal(Harvest.slaMinutes(Harvest.FEEDS.news, 10), 75);
assert.equal(Harvest.slaMinutes(Harvest.FEEDS.news, 22), 720);
assert.equal(Harvest.slaMinutes(Harvest.FEEDS.radio, 3), 45);

const html = '<p class="sports-board-meta">Mise à jour <time class="sports-board-meta__time" datetime="2026-09-02T22:51:17.594Z">2 sept. 2026 · 18 h 51 HAE</time></p>';
assert.equal(Harvest.sportsHtmlStamp(html), '2026-09-02T22:51:17.594Z');
assert.equal(Harvest.sportsHtmlStamp(''), '');

const staleSports = Harvest.evaluateHarvest({
  now: EVENING,
  newsUpdated: '2026-09-03T00:27:25.409Z',
  sportsUpdated: '2026-09-02T22:51:17.594Z',
  radioUpdated: '2026-09-03T00:29:22.592Z',
  leaguesGenerated: '2026-07-30T03:06:25.171Z',
  sportsHtmlDatetime: '2026-09-02T22:51:17.594Z',
});
assert.ok(staleSports.actions.includes('sports-full'), `sports soirée rassis : ${staleSports.actions}`);
assert.ok(staleSports.actions.includes('radio'), 'radio > 45 min');
assert.ok(staleSports.actions.includes('leagues'), 'catalogue > 21 j');
assert.ok(!staleSports.actions.includes('news'), 'news nuit : 12 h de SLA');
assert.ok(!staleSports.actions.includes('sports-html'), 'HTML aligné + sports-full déjà prévu');

const htmlLag = Harvest.evaluateHarvest({
  now: NOON,
  newsUpdated: '2026-09-02T16:00:00.000Z',
  sportsUpdated: '2026-09-02T16:00:00.000Z',
  radioUpdated: '2026-09-02T16:20:00.000Z',
  leaguesGenerated: '2026-09-01T00:00:00.000Z',
  sportsHtmlDatetime: '2026-09-02T12:00:00.000Z',
});
assert.deepEqual(htmlLag.actions, ['sports-html']);

const preserved = Harvest.preserveHarvestCatalogStats(
  {
    leaguesOk: 1,
    leaguesWithTeams: 1,
    sportsCatalog: ['soccer'],
    sportsFetched: ['soccer'],
    teams: { a: 1 },
  },
  {
    leaguesOk: 109,
    leaguesWithTeams: 100,
    sportsCatalog: ['soccer', 'football'],
    sportsFetched: ['hockey', 'sailing', 'soccer'],
    sportsCovered: ['soccer', 'football', 'hockey'],
    note: 'complet',
    source: 'rseq-s1-all+spordle-hockey+sailing-qc',
    teamsPreservedOnError: 17,
  },
);
assert.equal(preserved.leaguesOk, 109);
assert.equal(preserved.leaguesWithTeams, 100);
assert.deepEqual(preserved.sportsCatalog, ['soccer', 'football']);
assert.ok(preserved.sportsFetched.includes('hockey'));
assert.equal(preserved.teamsPreservedOnError, 17);

const untouched = Harvest.preserveHarvestCatalogStats(
  { leaguesOk: 109, sportsCatalog: ['soccer'] },
  { leaguesOk: 80, sportsCatalog: ['old'] },
);
assert.equal(untouched.leaguesOk, 109, 'un crawl complet plus large n’est pas écrasé');

const yml = readFileSync(join(ROOT, '.github/workflows/guard-harvest-freshness.yml'), 'utf8');
assert.match(yml, /name: Guard Harvest Freshness/);
assert.match(yml, /10 \* \* \*/);
assert.match(yml, /guard-harvest-freshness\.js --github-output/);
assert.match(yml, /fetch-sports\.js --update/);
assert.match(yml, /generate-seo\.js --update --sports-only/);
assert.match(yml, /discover-sports\.js --update/);
assert.match(yml, /fetch-radio-nowplaying\.js --update/);
assert.match(yml, /fetch-news\.js --update/);

const fetchSports = readFileSync(join(ROOT, 'scripts/fetch-sports.js'), 'utf8');
assert.match(fetchSports, /preserveHarvestCatalogStats/);
assert.match(fetchSports, /if \(liveOnly\) \{\s*\n\s*payload = preserveHarvestCatalogStats/m);

const maintain = readFileSync(join(ROOT, 'scripts/maintain.js'), 'utf8');
assert.match(maintain, /discover-sports\.js/);
assert.match(maintain, /fetch-sports\.js/);

const windowSrc = readFileSync(join(ROOT, 'scripts/maintenance-window.mjs'), 'utf8');
assert.match(windowSrc, /guard-harvest-freshness\.yml/);

console.log('OK harvest-freshness');
