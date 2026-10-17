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
    if (['.git', 'node_modules', 'test-results', 'playwright-report', 'android', 'ios'].includes(entry.name)) continue;
    if (entry.name === 'www' && directory.endsWith('/mobile')) continue;
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

/* Score à venir + sondage RSEQ direct (17 oct. 2026 : baseball 16 h resté
 * « En direct 0–0 » à 18 h 22 alors que RSEQ affichait 15–3 depuis 17 h 46). */
{
  const ctx = {
    Date,
    Number,
    String,
    Object,
    Array,
    Map,
    SPORTS_LIVE_VISUAL_LEAD_MS: 15 * 60 * 1000,
    SPORTS_LIVE_VISUAL_TAIL_MS: 3 * 3600 * 1000,
    SPORTS_LIVE_AFTER_MS: 3 * 3600 * 1000,
    sportsIsPlaceResult: () => false,
    sportsGameMs: (g) => Date.parse(`${g.date}T${g.time}:00-04:00`),
  };
  vm.runInNewContext(
    `${sourceBetween('/** Sentinelle RSEQ', '/** Âge d’un résultat en ms')}
     ${sourceBetween('const SPORTS_RSEQ_GAME_API', 'function sportsRseqScoreValue')}
     this.api = { sportsGameIsLive, sportsGameAwaitingScore, sportsApplyRseqOverrides,
       sportsRseqOverrides, sportsRseqGameId };`,
    ctx,
  );
  const { api } = ctx;
  const base = {
    date: '2026-10-17',
    time: '16:00',
    sport: 'baseball',
    live: true,
    home: false,
    gameId: 'b351da41-d8fc-4c4f-81ba-3c9e5ef0407f',
    url: 'https://diffusion.rseq.ca/Default.aspx?Type=Game&GameId=b351da41-d8fc-4c4f-81ba-3c9e5ef0407f',
  };
  const at = (hhmm) => Date.parse(`2026-10-17T${hhmm}:00-04:00`);
  assert.equal(api.sportsGameIsLive({ ...base }, at('17:30')), true, 'baseball 16 h : en direct à 17 h 30');
  assert.equal(api.sportsGameAwaitingScore({ ...base }, at('17:30')), false);
  assert.equal(api.sportsGameIsLive({ ...base }, at('18:50')), false, 'baseball 16 h : plus « En direct » après 2 h 45 sans score');
  assert.equal(api.sportsGameAwaitingScore({ ...base }, at('18:50')), true, 'baseball 16 h : « Score à venir »');
  const soccer = { ...base, sport: 'soccer' };
  assert.equal(api.sportsGameAwaitingScore(soccer, at('18:22')), true, 'soccer 16 h : score à venir à 18 h 22');
  assert.equal(api.sportsGameAwaitingScore({ ...soccer, scoreFor: 1, scoreAgainst: 0 }, at('18:22')), false);
  assert.equal(api.sportsGameAwaitingScore(soccer, at('19:30')), false, 'hors fenêtre 3 h : rien');

  // Override RSEQ : Limoilou (visiteur) 15, Édouard-Montpetit 3.
  api.sportsRseqOverrides.set(base.gameId, { home: 3, visiting: 15, final: true, at: 0 });
  const titans = { ...base, home: true, opponent: 'Limoilou' };
  const limoilou = { ...base, home: false, opponent: 'Édouard-Montpetit' };
  const hockey = { ...base, gameId: 'abc', url: 'https://collegial.rseqhockey.com/fr/x' };
  api.sportsApplyRseqOverrides({ teams: { a: { nextGame: titans }, b: { nextGame: limoilou }, c: { nextGame: hockey } } });
  assert.deepEqual([titans.scoreFor, titans.scoreAgainst, titans.result, titans.final, titans.live], [3, 15, 'L', true, false]);
  assert.deepEqual([limoilou.scoreFor, limoilou.scoreAgainst, limoilou.result], [15, 3, 'W']);
  assert.equal(api.sportsGameIsLive(titans, at('18:22')), false, 'final RSEQ : plus en direct');
  assert.equal(hockey.scoreFor, undefined, 'hors RSEQ S1 : pas touché');
  assert.equal(api.sportsRseqGameId({ gameId: base.gameId, url: 'https://evil.example/' }), '');
}
assert.match(sportsSrc, /https:\/\/s1\.rseq\.ca\/api\/GameApi\/GetGameDiffusion/, 'sondage direct RSEQ S1');
assert.match(sportsSrc, /SPORTS_RSEQ_POLL_MS = 60000/, 'sondage RSEQ aux 60 s');
