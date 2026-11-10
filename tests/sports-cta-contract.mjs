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

/* Résultat à venir + sondage RSEQ direct (17 oct. 2026 : baseball 16 h resté
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
  assert.equal(api.sportsGameAwaitingScore({ ...base }, at('18:50')), true, 'baseball 16 h : « Résultat à venir »');
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

// Retour terrain 2026-10-23 : volley D2 sans pointage resté « En direct » et bandeau figé.
{
  const hold = sourceBetween('function sportsCtaHoldOnLive', '\n}\n');
  assert.match(hold, /return false;/, 'aucun direct ne fige la CTA');
  assert.doesNotMatch(hold, /sportsCtaLiveSources\(\)\.length < 2/, 'plus de blocage « direct unique »');
  assert.match(sportsSrc, /volleyball: 135,/, 'volley : 2 h 15 max sans pointage');
}

// Retour terrain 2026-10-23 (2) : même avec un direct pointé, la rotation montre les autres matchs du jour.
{
  const pool = sourceBetween('function sportsCtaCandidateSlides', '\n}\n');
  assert.match(pool, /const out = lives\.slice\(\)/, 'directs en tête du pool CTA');
  assert.match(pool, /out\.push\(s\)/, 'résultats et à-venir du jour inclus dans la rotation');
  assert.match(pool, /lives\[i % lives\.length\]/, 'direct intercalé un tour sur deux');
  assert.match(sportsSrc, /return \[SPORTS_OPEN_LIVE, SPORTS_OPEN_TODAY_RESULT, SPORTS_OPEN_TODAY_NEXT\]/,
    'une carte direct peut céder la place à un résultat du jour');
}

// Événement sur plusieurs jours (régate 24-25 oct.) : jamais « Aujourd’hui » le lundi.
{
  const ctx = { String, Number };
  vm.runInNewContext(
    `${sourceBetween('function sportsMultiDayPhase', '/** Kicker : En direct')}
     this.api = { sportsMultiDayPhase, sportsDayRangeShort };`,
    ctx,
  );
  const g = { date: '2026-10-24', eventStart: '2026-10-24', eventEnd: '2026-10-25' };
  assert.equal(ctx.api.sportsMultiDayPhase(g, '2026-10-23'), 'before');
  assert.equal(ctx.api.sportsMultiDayPhase(g, '2026-10-24'), 'during');
  assert.equal(ctx.api.sportsMultiDayPhase(g, '2026-10-25'), 'during');
  assert.equal(ctx.api.sportsMultiDayPhase(g, '2026-10-26'), 'after');
  assert.equal(ctx.api.sportsMultiDayPhase({ date: '2026-10-24' }, '2026-10-26'), '');
  assert.equal(ctx.api.sportsDayRangeShort('2026-10-24', '2026-10-25'), '24-25 oct.');
  assert.equal(ctx.api.sportsDayRangeShort('2026-10-31', '2026-11-01'), '31 oct.-1 nov.');
}

// Voile 2026-10-26 : régate terminée sans résultats → hors bandeau ;
// résultats détectés → priorité 24 h depuis resultsSeenAt, puis normal.
{
  const ctx = { Date, Number, String, torontoDayKey: (v = Date.now()) => new Date(v).toISOString().slice(0, 10) };
  vm.runInNewContext(
    `${sourceBetween('function sportsSailEventShort', 'function sportsIsSailingGame')}
     this.api = { sportsSailEventShort, sportsResultSpotlight, sportsSailAwaitingHidden };`,
    ctx,
  );
  const seen = '2026-10-27T14:00:00Z';
  const at = (h) => Date.parse(seen) + h * 3600 * 1000;
  const g = { resultsSeenAt: seen, scoreFor: 3, scoreAgainst: 14 };
  assert.equal(ctx.api.sportsResultSpotlight(g, at(0)), true, '0 h : prioritaire');
  assert.equal(ctx.api.sportsResultSpotlight(g, at(23)), true, '23 h : encore prioritaire');
  assert.equal(ctx.api.sportsResultSpotlight(g, at(25)), false, '25 h : redevenu normal');
  assert.equal(ctx.api.sportsResultSpotlight({ scoreFor: 3 }, at(0)), false, 'sans horodatage : jamais');
  const awaiting = { awaitingResults: true, eventStart: '2026-10-24', eventEnd: '2026-10-25' };
  assert.equal(ctx.api.sportsSailAwaitingHidden(awaiting, Date.parse('2026-10-26T15:00:00Z')), true);
  assert.equal(ctx.api.sportsSailAwaitingHidden({ ...awaiting, awaitingResults: false }, Date.parse('2026-10-25T15:00:00Z')), false);
  assert.equal(ctx.api.sportsSailEventShort({ opponent: 'Championnat canadien par équipes' }), 'Canadiens équipes');
  assert.equal(ctx.api.sportsSailEventShort({ opponent: 'X', opponentShort: 'Court' }), 'Court');
  assert.ok(sportsSrc.includes('if (sportsSailAwaitingHidden(g, now)) continue;'), 'bandeau : régate en attente non choisie');
  assert.ok(sportsSrc.includes('if (sportsResultSpotlight(game, now)) return { tier: 0'), 'bandeau : spotlight 24 h prioritaire');
}


// Diversité bandeau : tournoi sport+ligue+niveau, mélange à-venir / résultats,
// ordre interne conservé, aucune carte retirée, déterministe.
{
  const SPORTS_OPEN_TOMORROW_NEXT = 4;
  const SPORTS_OPEN_WEEK_NEXT = 5;
  const SPORTS_OPEN_OLDER_RESULT = 6;
  const SPORTS_OPEN_FAR_NEXT = 7;
  const ctx = {
    Date,
    Map,
    SPORTS_OPEN_TOMORROW_NEXT,
    SPORTS_OPEN_WEEK_NEXT,
    SPORTS_OPEN_OLDER_RESULT,
    SPORTS_OPEN_FAR_NEXT,
    sportsSlideSport: (slide) => String(slide?.team?.sport || slide?.game?.sport || '').toLowerCase(),
    sportsOpenOrderBucket: (slide) => slide.bucket,
  };
  vm.runInNewContext(
    `${sourceBetween('function sportsSlideLevel', 'function sportsSplitVisible')}
     this.api = {
       sportsSlideDiversityKey, sportsRoundRobinByDiversity,
       sportsMixWeekAndResults, sportsInterleaveByDiversity,
     };`,
    ctx,
  );
  const { api } = ctx;
  const now = Date.parse('2026-11-10T10:00:00-05:00');
  const card = (id, { sport, sector, league, mode = 'next', bucket = SPORTS_OPEN_WEEK_NEXT, time = '21:00' }) => ({
    id,
    key: id,
    mode,
    bucket,
    game: { sport, competition: league, date: bucket === SPORTS_OPEN_OLDER_RESULT ? '2026-11-08' : '2026-11-13', time },
    team: { sport, sector, leagueLabel: league },
  });
  const ids = (slides) => [...slides].map((s) => s.id);

  const d2 = [
    card('d2-a', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial masculin D2', time: '21:00' }),
    card('d2-b', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial masculin D2', time: '21:00' }),
    card('d2-c', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial masculin D2', time: '21:00' }),
    card('d2-d', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial masculin D2', time: '21:00' }),
  ];
  const others = [
    card('d1-a', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial féminin D1', time: '18:30' }),
    card('uni-a', { sport: 'basketball', sector: 'universitaire', league: 'Basketball universitaire masculin', time: '18:00' }),
    card('hock-a', { sport: 'hockey', sector: 'universitaire', league: 'Hockey universitaire féminin D1', time: '19:30' }),
  ];
  const mixedLeagues = [...d2, ...others];
  const once = api.sportsInterleaveByDiversity(mixedLeagues, now);
  const twice = api.sportsInterleaveByDiversity(mixedLeagues, now);
  assert.deepEqual(ids(once), ids(twice), 'intercalage déterministe');
  assert.deepEqual(
    [...ids(once)].sort(),
    [...ids(mixedLeagues)].sort(),
    'aucune carte retirée',
  );
  const firstKeys = [...once].slice(0, 4).map((s) => api.sportsSlideDiversityKey(s));
  assert.equal(new Set(firstKeys).size, 4, `4 premières clés distinctes, got ${firstKeys.join(' | ')}`);
  const d2Ids = new Set(d2.map((s) => s.id));
  assert.deepEqual(
    ids([...once].filter((s) => d2Ids.has(s.id))),
    ids(d2),
    'ordre chronologique conservé dans un même groupe',
  );

  const upcoming = [
    card('week-d2-a', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial masculin D2' }),
    card('week-d2-b', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial masculin D2' }),
    card('week-d2-c', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial masculin D2' }),
    card('week-d2-d', { sport: 'basketball', sector: 'collegial', league: 'Basketball collégial masculin D2' }),
  ];
  const recent = [
    card('res-vb-a', { sport: 'volleyball', sector: 'collegial', league: 'Volleyball collégial masculin D3', mode: 'result', bucket: SPORTS_OPEN_OLDER_RESULT, time: '15:00' }),
    card('res-fb-a', { sport: 'football', sector: 'collegial', league: 'Football collégial masculin D1', mode: 'result', bucket: SPORTS_OPEN_OLDER_RESULT, time: '14:00' }),
    card('res-vb-b', { sport: 'volleyball', sector: 'collegial', league: 'Volleyball collégial masculin D3', mode: 'result', bucket: SPORTS_OPEN_OLDER_RESULT, time: '13:00' }),
  ];
  const weekMix = api.sportsInterleaveByDiversity([...upcoming, ...recent], now);
  const firstSix = [...weekMix].slice(0, 6);
  assert.ok(firstSix.some((s) => s.mode === 'next'), 'les 6 premières gardent des à-venir');
  assert.ok(firstSix.some((s) => s.mode === 'result'), 'les 6 premières mélangent des résultats récents');
  assert.deepEqual(
    ids([...weekMix].filter((s) => s.id.startsWith('res-vb'))),
    ['res-vb-a', 'res-vb-b'],
    'ordre des résultats conservé au sein du groupe',
  );

  // Demain reste devant un score froid : le football de demain n’est pas
  // évincé par une file de soccer ni par des résultats plus vieux.
  const hot = [
    card('live-soc', { sport: 'soccer', sector: 'collegial', league: 'Soccer collégial', time: '20:15', bucket: 0 }),
    ...Array.from({ length: 8 }, (_, i) => card(`soc-${i}`, {
      sport: 'soccer', sector: 'collegial', league: 'Soccer collégial',
      time: `18:${String(i).padStart(2, '0')}`, bucket: SPORTS_OPEN_TOMORROW_NEXT,
    })),
    card('fb-1', { sport: 'football', sector: 'universitaire', league: 'Football universitaire', time: '19:30', bucket: SPORTS_OPEN_TOMORROW_NEXT }),
    card('rug-1', { sport: 'rugby', sector: 'collegial', league: 'Rugby collégial', time: '20:00', bucket: SPORTS_OPEN_TOMORROW_NEXT }),
  ];
  const cold = [
    card('old-soc', { sport: 'soccer', sector: 'collegial', league: 'Soccer collégial', mode: 'result', bucket: SPORTS_OPEN_OLDER_RESULT, time: '15:00' }),
    card('old-fb', { sport: 'football', sector: 'universitaire', league: 'Football universitaire', mode: 'result', bucket: SPORTS_OPEN_OLDER_RESULT, time: '13:00' }),
  ];
  const hotOrder = api.sportsInterleaveByDiversity([...hot, ...cold], now);
  assert.deepEqual(ids([...hotOrder].slice(0, 3)), ['live-soc', 'fb-1', 'rug-1'], 'direct puis autres sports de demain, scores froids ensuite');
  assert.ok(ids([...hotOrder].slice(0, 4)).includes('fb-1'), 'football de demain visible dans le préfixe');
  assert.ok(ids(hotOrder).indexOf('old-fb') > ids(hotOrder).indexOf('fb-1'), 'score froid derrière demain');
}
