#!/usr/bin/env node
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sportsSrc = readFileSync(join(ROOT, 'radar-sports-cta.js'), 'utf8');

function sourceBetween(start, end) {
  const from = sportsSrc.indexOf(start);
  const to = sportsSrc.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `bloc source introuvable : ${start}`);
  return sportsSrc.slice(from, to);
}

assert.doesNotMatch(
  sportsSrc,
  /RadarSportsFreshness\?\./,
  'un global RadarSportsFreshness absent doit rester sûr sans optional chaining',
);

const fallbackCtx = {
  Date,
  Number,
  String,
  SPORTS_RECENT_RESULT_DAYS: 5,
  sportsGameMs: () => Number.NaN,
  torontoDayKey: (value = Date.now()) => new Date(value).toISOString().slice(0, 10),
};
vm.runInNewContext(
  `${sourceBetween('function sportsGameDayKey', '/** Coup d’envoi encore à venir')}
   this.api = { sportsGameDayKey, sportsCivilDaysAgo, sportsResultIsRecent,
     sportsCtaResultIsTodayOrYesterday };`,
  fallbackCtx,
);

const fallbackNow = Date.parse('2026-09-04T16:00:00Z');
assert.equal(fallbackCtx.api.sportsGameDayKey({ date: '2026-09-04' }, fallbackNow), '2026-09-04');
assert.equal(fallbackCtx.api.sportsCivilDaysAgo({ date: '2026-09-03' }, fallbackNow), 1);
assert.equal(fallbackCtx.api.sportsResultIsRecent({ date: '2026-08-30' }, fallbackNow), true);
assert.equal(
  fallbackCtx.api.sportsCtaResultIsTodayOrYesterday({ date: '2026-09-02' }, fallbackNow),
  false,
);

const diversityCtx = {
  Date,
  sportsSlideSport: (slide) => slide.sport,
  sportsOpenOrderBucket: (slide) => slide.bucket,
  sportsGameDayKey: (game) => game?.date || '',
  sportsSlideDayKey: (slide) => slide.day || '',
};
vm.runInNewContext(
  `${sourceBetween('function sportsSoftSportDiversity', '/**\n * Partage des rôles bandeau')}
   this.sportsSoftSportDiversity = sportsSoftSportDiversity;`,
  diversityCtx,
);

const diversify = diversityCtx.sportsSoftSportDiversity;
const ids = (slides) => diversify(slides, fallbackNow).map((slide) => slide.id);
const slide = (id, sport, bucket, date) => ({ id, sport, bucket, game: { date } });

assert.deepEqual(
  ids([
    slide('today-a', 'soccer', 1, '2026-09-04'),
    slide('today-b', 'soccer', 1, '2026-09-04'),
    slide('today-football', 'football', 1, '2026-09-04'),
  ]),
  ['today-a', 'today-football', 'today-b'],
  'la diversité locale permute un autre sport du même bucket et du même jour',
);
assert.deepEqual(
  ids([
    slide('today-a', 'soccer', 1, '2026-09-04'),
    slide('today-b', 'soccer', 1, '2026-09-04'),
    slide('tomorrow-football', 'football', 1, '2026-09-05'),
  ]),
  ['today-a', 'today-b', 'tomorrow-football'],
  'la diversité ne hisse pas demain entre deux événements d’aujourd’hui',
);
assert.deepEqual(
  ids([
    slide('today-a', 'soccer', 1, '2026-09-04'),
    slide('today-b', 'soccer', 1, '2026-09-04'),
    slide('other-bucket', 'football', 2, '2026-09-04'),
  ]),
  ['today-a', 'today-b', 'other-bucket'],
  'la diversité ne traverse pas un bucket de chaleur',
);

function assertFreshnessScriptOrder(source, label) {
  const session = source.indexOf('scripts/session-freshness-lib.js');
  const freshness = source.indexOf('scripts/sports-freshness-lib.js');
  const sports = source.indexOf('radar-sports-cta.js');
  assert.ok(session >= 0, `${label} : session-freshness-lib.js requis`);
  assert.ok(freshness > session, `${label} : sports-freshness après session-freshness`);
  assert.ok(sports > freshness, `${label} : radar-sports-cta après les deux dépendances`);
}

assertFreshnessScriptOrder(
  readFileSync(join(ROOT, 'scripts/seo-pages-lib.js'), 'utf8'),
  'gabarit SEO',
);
for (const rel of ['en/index.html', 'sports/index.html', 'journaux/exil/index.html']) {
  assertFreshnessScriptOrder(readFileSync(join(ROOT, rel), 'utf8'), rel);
}

const htmlFiles = [];
function collectHtml(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) collectHtml(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
}
collectHtml(ROOT);
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  if (!html.includes('radar-sports-cta.js')) continue;
  assertFreshnessScriptOrder(html, relative(ROOT, file));
}

console.log('OK sports-cta-contract');
