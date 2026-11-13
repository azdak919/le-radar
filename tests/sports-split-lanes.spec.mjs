import fs from 'node:fs';
import { expect, test } from '@playwright/test';

// Hors preuves BFCache (contexte manuel séparé), pas de dépendance réseau
// ni de boucle d’images absentes pour tester la sélection et la géométrie.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
  await page.route('**/assets/news-images/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
  await page.route('https://**/*', r => r.abort());
});

/**
 * n=1 = ordre E. n≥2 = gauche scores passés / droite matchs à venir.
 * Directs prioritaires, au centre. Un côté sans carte se remplit
 * avec l’autre famille, dans l’ordre de chaleur.
 */

function slide(key, mode, date, time, extra = {}) {
  const sport = extra.sport || 'football';
  return {
    key,
    mode,
    game: {
      date,
      time,
      gameId: key,
      opponent: 'Diablos',
      opponentFullName: 'Diablos',
      opponentCode: 'DIA',
      final: mode === 'result',
      live: false,
      scoreFor: mode === 'result' ? 28 : undefined,
      scoreAgainst: mode === 'result' ? 14 : undefined,
      result: mode === 'result' ? 'W' : undefined,
      sport,
      ...extra,
    },
    team: {
      name: 'Vert et Or',
      fullName: 'Vert et Or',
      code: 'LAV',
      sport,
    },
  };
}

async function splitKeys(page, n, nowIso, pool) {
  return page.evaluate(({ n, nowIso, pool }) => {
    const now = new Date(nowIso).getTime();
    if (typeof sportsSplitVisible !== 'function') return { ok: false, reason: 'no-fn' };
    const out = sportsSplitVisible(n, now, pool);
    return {
      ok: true,
      keys: out.map((s) => s.key),
      sports: out.map((s) => String(s.team?.sport || s.game?.sport || '')),
      buckets: out.map((s) => sportsOpenOrderBucket(s, now)),
    };
  }, { n, nowIso, pool });
}

test('n=1 : préfixe E ; n=2 vendredi 17 h : ce soir puis score, jamais score froid en premier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const friday = '2026-09-04T17:00:00-04:00';
  const pool = [
    slide('yesterday', 'result', '2026-09-03', '15:00'),
    slide('tonight', 'next', '2026-09-04', '19:00'),
    slide('saturday-old', 'result', '2026-09-02', '14:00'),
  ];
  const one = await splitKeys(page, 1, friday, pool);
  expect(one.ok, one.reason || 'ok').toBe(true);
  expect(one.keys, 'n=1 = ce soir (E)').toEqual(['tonight']);

  const two = await splitKeys(page, 2, friday, pool);
  expect(two.keys, 'hier à gauche, aujourd’hui à droite').toEqual(['yesterday', 'tonight']);
});

test('lundi 10 h n=4 : gauche weekend, droite demain', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const monday = '2026-09-07T10:00:00-04:00';
  const pool = [
    slide('thu-next', 'next', '2026-09-10', '19:00'),
    slide('sat', 'result', '2026-09-05', '15:00'),
    slide('sun', 'result', '2026-09-06', '14:00'),
    slide('tue', 'next', '2026-09-08', '19:00'),
  ];
  const one = await splitKeys(page, 1, monday, pool);
  expect(one.keys, 'n=1 lundi = hier').toEqual(['sun']);

  const four = await splitKeys(page, 4, monday, pool);
  expect(four.keys, 'gauche = weekend, droite = à venir').toEqual(['sun', 'sat', 'tue', 'thu-next']);
});

test('mercredi : gauche scores du dimanche, droite vendredi, pas d’alternance', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const wednesday = '2026-11-11T15:00:00-05:00';
  const pool = [
    slide('sun-a', 'result', '2026-11-08', '14:00', { sport: 'volleyball' }),
    slide('sun-b', 'result', '2026-11-08', '16:00', { sport: 'volleyball' }),
    slide('fri-a', 'next', '2026-11-13', '19:00', { sport: 'volleyball' }),
    slide('fri-b', 'next', '2026-11-13', '21:00', { sport: 'volleyball' }),
  ];
  const four = await splitKeys(page, 4, wednesday, pool);
  expect(four.keys, '2 scores puis 2 à venir').toEqual(['sun-b', 'sun-a', 'fri-a', 'fri-b']);

  const futuresOnly = pool.filter((s) => s.mode === 'next');
  const filled = await splitKeys(page, 4, wednesday, futuresOnly);
  expect(filled.keys, 'aucun score : les slots prennent les à venir, plus chaud d’abord').toEqual(['fri-a', 'fri-b']);

  const shortPast = [
    slide('sun-a', 'result', '2026-11-08', '14:00', { sport: 'volleyball' }),
    slide('fri-a', 'next', '2026-11-13', '19:00', { sport: 'volleyball' }),
    slide('fri-b', 'next', '2026-11-13', '21:00', { sport: 'volleyball' }),
    slide('sat-next', 'next', '2026-11-14', '15:00', { sport: 'volleyball' }),
  ];
  const gap = await splitKeys(page, 4, wednesday, shortPast);
  expect(gap.keys, 'un seul score : le vide à gauche se remplit à droite').toEqual(['sun-a', 'fri-a', 'fri-b', 'sat-next']);
});

test('n=4 jeudi soir : football visible malgré une file de soccer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const thursdayEve = '2026-09-03T21:00:00-04:00';
  const pool = [
    slide('live-soc', 'next', '2026-09-03', '20:15', { sport: 'soccer', live: true }),
    ...Array.from({ length: 8 }, (_, i) => slide(
      `soc-${i}`,
      'next',
      '2026-09-04',
      `18:${String(i).padStart(2, '0')}`,
      { sport: 'soccer' },
    )),
    slide('fb-1', 'next', '2026-09-04', '19:30', { sport: 'football' }),
    slide('rug-1', 'next', '2026-09-04', '20:00', { sport: 'rugby' }),
    slide('old-soc', 'result', '2026-08-30', '15:00', { sport: 'soccer' }),
    slide('old-fb', 'result', '2026-08-30', '13:00', { sport: 'football' }),
  ];
  const four = await splitKeys(page, 4, thursdayEve, pool);
  expect(four.ok, four.reason || 'ok').toBe(true);
  expect(four.keys).toHaveLength(4);
  expect(four.keys).toContain('live-soc');
  expect(four.keys).toContain('fb-1');
  expect(new Set(four.keys).size).toBe(4);
});

test('accueil 1280 : snapshot multi-sport sans direct, diversité conservée', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  // Ne pas dépendre du nombre de directs de la collecte courante : un seul
  // direct ne doit pas rendre ce test dépendant de la collecte. Ici : hors live.
  const pool = [
    slide('div-foot', 'result', '2026-11-08', '16:00', { sport: 'football' }),
    slide('div-basket', 'result', '2026-11-08', '15:00', { sport: 'basketball' }),
    slide('div-soccer', 'next', '2026-11-09', '19:00', { sport: 'soccer' }),
    slide('div-volley', 'next', '2026-11-09', '20:00', { sport: 'volleyball' }),
  ];
  pool.forEach(s => { s.team.code = s.key; s.team.name = s.key; });
  await page.evaluate(pool => { sportsSlides = pool; sportsFitCount = null; sportsFitDepth = 0; renderSportsStrip(); }, pool);
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(1);
  const info = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#masthead-sports-strip .sports-chip')];
    const sports = chips
      .map((c) => (c.dataset.sportsSport || '').toLowerCase())
      .filter((s) => s && s !== 'board');
    const pool = typeof sportsStripPolicy === 'function' ? sportsStripPolicy().pool : [];
    const poolSports = [...new Set(pool.map((s) => String(
      s.team?.sport || s.game?.sport || '',
    ).toLowerCase()).filter(Boolean))];
    return { sports, unique: [...new Set(sports)], poolSports };
  });
  if (info.poolSports.length >= 2) {
    expect(
      info.unique.length,
      `puces=${info.sports.join(',')} pool=${info.poolSports.join(',')}`,
    ).toBeGreaterThan(1);
  }
});

test('samedi 20 h 44 : matchs déjà joués → scores, pas 4× Aujourd’hui', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible({ timeout: 8000 });

  const evening = '2026-09-19T20:44:00-04:00';
  const staleToday = ['rugby-am', 'soc-16', 'hock-16', 'soc-17'];
  const pool = [
    slide('rugby-am', 'next', '2026-09-19', '09:00', { sport: 'rugby' }),
    slide('soc-16', 'next', '2026-09-19', '16:00', { sport: 'soccer' }),
    slide('hock-16', 'next', '2026-09-19', '16:00', { sport: 'hockey' }),
    slide('soc-17', 'next', '2026-09-19', '17:00', { sport: 'soccer' }),
    slide('y-fb', 'result', '2026-09-18', '19:00', { sport: 'football' }),
    slide('y-flag', 'result', '2026-09-18', '14:00', { sport: 'flag-football' }),
  ];
  const four = await splitKeys(page, 4, evening, pool);
  expect(four.ok, four.reason || 'ok').toBe(true);
  const modes = await page.evaluate(({ n, nowIso, pool }) => {
    const now = new Date(nowIso).getTime();
    return sportsSplitVisible(n, now, pool).map((s) => s.mode);
  }, { n: 4, nowIso: evening, pool });
  expect(modes.every((m) => m === 'result'), `modes=${modes.join(',')}`).toBe(true);
  expect([...four.keys].sort(), `keys=${four.keys.join(',')}`).toEqual(['y-fb', 'y-flag'].sort());
  expect(four.keys.filter((k) => staleToday.includes(k)), 'Aujourd’hui déjà joué resté à l’écran')
    .toEqual([]);

  const nextGate = await page.evaluate(() => {
    const now = new Date('2026-09-19T20:44:00-04:00').getTime();
    const team = { id: 'lav', name: 'Rouge et Or', code: 'LAV', sport: 'soccer' };
    const past = { date: '2026-09-19', time: '16:00', opponent: 'Carabins' };
    const scored = {
      ...past,
      scoreFor: 2,
      scoreAgainst: 1,
      final: true,
      live: false,
    };
    return {
      still: typeof sportsNextStillUpcoming === 'function'
        ? sportsNextStillUpcoming(past, now)
        : null,
      upcoming: sportsNextSlideFromGame(team, past, now),
      scoredNext: sportsNextSlideFromGame(team, scored, now),
      scoredResult: sportsResultSlideFromGame(team, scored, now)?.mode || null,
    };
  });
  expect(nextGate.still, '16 h n’est plus « à venir » à 20 h 44').toBe(false);
  expect(nextGate.upcoming, 'next périmé sans score').toBeNull();
  expect(nextGate.scoredNext, 'next périmé avec score').toBeNull();
  expect(nextGate.scoredResult, 'score → résultat').toBe('result');
});

test('390 : une puce, pas de split visuel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  // Ne pas dépendre du nombre de directs de la collecte courante : un seul
  // direct ne doit pas rendre ce test dépendant de la collecte. Ici : hors live.
  const pool = [
    slide('div-foot', 'result', '2026-11-08', '16:00', { sport: 'football' }),
    slide('div-basket', 'result', '2026-11-08', '15:00', { sport: 'basketball' }),
    slide('div-soccer', 'next', '2026-11-09', '19:00', { sport: 'soccer' }),
    slide('div-volley', 'next', '2026-11-09', '20:00', { sport: 'volleyball' }),
  ];
  pool.forEach(s => { s.team.code = s.key; s.team.name = s.key; });
  await page.evaluate(pool => { sportsSlides = pool; sportsFitCount = null; sportsFitDepth = 0; renderSportsStrip(); }, pool);
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(0);
  const n = await strip.locator('.sports-chip').count();
  expect(n, '390 : une seule puce visible').toBe(1);
});


test('0/1/2/3/7 directs : priorité non exclusive, slots rares, miroir et aucune mutation @ci-critical', async ({ page }, info) => {
  await page.clock.setFixedTime(new Date('2026-11-08T17:00:00-05:00'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  const lives = Array.from({ length: 7 }, (_, i) => slide(`live-${i}`, 'next', '2026-11-08', '16:30', { live: true, sport: i % 2 ? 'hockey' : 'soccer', scoreFor: 0, scoreAgainst: 0 }));
  const others = [slide('yesterday', 'result', '2026-11-07', '19:00'), slide('today-result', 'result', '2026-11-08', '15:00'), slide('tonight', 'next', '2026-11-08', '19:00')];
  const report = [];
  for (const nLive of [0, 1, 2, 3, 7]) for (const slots of [1, 2, 3, 4, 8]) {
    const pool = lives.slice(0, nLive).concat(others);
    const state = await page.evaluate(({ pool, slots }) => {
      const before = JSON.stringify(pool), now = Date.now();
      const first = sportsSplitVisible(slots, now, pool);
      const mirror = { ...pool[0], key: 'mirror', team: { ...pool[0].team, code: 'MIRROR' }, game: { ...pool[0].game } };
      const dedup = sportsSplitVisible(slots, now, pool.concat(mirror));
      const liveOnly = sportsSplitVisible(slots, now, pool.filter(s => sportsGameIsLive(s.game, now)));
      return { keys: first.map(s => s.key), ids: first.map(s => s.game.gameId), live: first.filter(s => sportsGameIsLive(s.game, now)).length,
        days: first.map(s => sportsSlideDayKey(s)), dedup: dedup.map(s => s.game.gameId),
        liveOnly: liveOnly.map(s => s.key), sourceUnchanged: before === JSON.stringify(pool) };
    }, { pool, slots });
    const expected = Math.min(slots, nLive + others.length);
    expect(state.keys).toHaveLength(expected);
    expect(state.live).toBe(Math.min(nLive, slots === 1 ? 1 : slots - 1));
    expect(new Set(state.ids).size).toBe(expected);
    expect(state.dedup).toHaveLength(expected); expect(new Set(state.dedup).size).toBe(expected);
    expect(state.liveOnly).toHaveLength(Math.min(slots, nLive));
    expect(state.liveOnly.every(k => k.startsWith('live-'))).toBe(true);
    expect(state.sourceUnchanged).toBe(true);
    expect(state.keys.every(k => pool.some(s => s.key === k))).toBe(true);
    if (slots > 1) expect(state.keys.some(k => !k.startsWith('live-'))).toBe(true);
    const iResult = state.keys.findIndex(k => k === 'yesterday' || k === 'today-result');
    const iTonight = state.keys.indexOf('tonight');
    if (iResult >= 0 && iTonight >= 0) expect(iResult, 'score passé avant un match à venir').toBeLessThan(iTonight);
    const iTodayResult = state.keys.indexOf('today-result');
    const iYesterday = state.keys.indexOf('yesterday');
    if (iTodayResult >= 0 && iYesterday >= 0) expect(iTodayResult).toBeLessThan(iYesterday);
    report.push({ nLive, slots, ...state });
  }
  fs.writeFileSync(info.outputPath('selection-matrix.json'), JSON.stringify(report, null, 2));
});

test('politique civile à minuit, final/update, horaire inconnu jamais live et moitié vide @ci-critical', async ({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const pool=[slide('nov7','result','2026-11-07','19:00'),slide('nov8','next','2026-11-08','23:30'),slide('nov9','next','2026-11-09','19:00')];
  const before=await splitKeys(page,4,'2026-11-08T23:20:00-05:00',pool);
  expect(before.keys).toEqual(['nov7','nov8','nov9']);
  const after=await splitKeys(page,4,'2026-11-09T00:05:00-05:00',pool);
  expect(after.keys).toEqual(['nov7','nov9']);
  const state=await page.evaluate(pool=>{
    const now=Date.parse('2026-11-08T23:45:00-05:00');
    const unknown={...pool[1].game,live:undefined};
    const confirmed={...unknown,live:true};
    const final={...confirmed,live:false,final:true,scoreFor:2,scoreAgainst:1,result:'W'};
    return {unknown:sportsGameIsLive(unknown,now),live:sportsGameIsLive(confirmed,now),final:sportsGameIsLive(final,now),done:sportsSplitVisible(4,now,[pool[0],{...pool[1],mode:'result',game:final}]).map(s=>s.key)};
  },pool);
  expect(state.unknown).toBe(false);expect(state.live).toBe(true);expect(state.final).toBe(false);expect(state.done).toEqual(['nov8','nov7']);
});

test('peinture réelle 0/1/2/3/7 directs + autres, resize, final et rotation @ci-critical', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.clock.setFixedTime(new Date('2026-11-08T17:00:00-05:00'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  const cards = page.locator('#masthead-sports-strip > a');
  for (const n of [0, 1, 2, 3, 7]) {
    const pool = Array.from({ length: n }, (_, i) => slide(`direct-${i}`, 'next', '2026-11-08', '16:30', { live: true, scoreFor: i, scoreAgainst: 0, opponent: 'X', opponentCode: 'X' })).concat(slide('other', 'next', '2026-11-08', '19:00'));
    pool.forEach(s => { s.team.code = s.key; s.team.name = s.key; });
    const expected = await page.evaluate(pool => { sportsSlides = pool; sportsFitCount = 4; sportsFitDepth = 0; renderSportsStrip(); scheduleSportsRotate(); return Math.min(sportsBoardCount(), pool.length); }, pool);
    await expect(cards).toHaveCount(expected);
    await expect(page.locator('#masthead-sports-strip > a[data-sports-live="1"]')).toHaveCount(Math.min(n, Math.max(0, expected - 1)));
    await expect(page.locator('#masthead-sports-strip > a[data-sports-key="other"]')).toHaveCount(1);
    await page.evaluate(() => rotateSportsSlot(0));
    await expect(page.locator('#masthead-sports-strip > a[data-sports-key="other"]')).toHaveCount(1);
    if (n === 3) await page.locator('#masthead-sports-strip').screenshot({ path: info.outputPath('sports-priority-and-others.png') });
    if (n) {
      await page.evaluate(() => { const sig = sportsBoardLiveSig(), keys = sportsVisibleLiveKeys(); const s = sportsSlides.find(s => s.key === 'direct-0'); s.mode = 'result'; s.game = { ...s.game, live: false, final: true, result: 'W', scoreFor: 3, scoreAgainst: 1 }; sportsRerenderAfterLiveChange(sig, keys); });
      await expect(page.locator('#masthead-sports-strip > a[data-sports-key="direct-0"][data-sports-live="1"]')).toHaveCount(0);
      await page.setViewportSize({ width: 1024, height: 900 });
      await expect.poll(() => cards.evaluateAll(cs => cs.length > 0 && new Set(cs.map(c => c.dataset.sportsKey)).size === cs.length && cs.some(c => c.dataset.sportsLive !== '1'))).toBe(true);
      if (n > 1) await expect.poll(() => cards.evaluateAll(cs => cs.some(c => c.dataset.sportsLive === '1'))).toBe(true);
      await page.setViewportSize({ width: 1920, height: 1000 });
    }
  }
});

test('page maintenue après minuit : réallocation DOM même si compte et anciennes clés restent valides @ci-critical', async({page})=>{
  await page.setViewportSize({width:1920,height:1000});
  await page.clock.setFixedTime(new Date('2026-11-08T23:50:00-05:00'));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  const pool=[...Array.from({length:6},(_,i)=>slide(`r${i}`,'result','2026-11-08','19:00',{opponent:'X',opponentCode:'X'})),...Array.from({length:6},(_,i)=>slide(`n${i}`,'next','2026-11-09','19:00',{opponent:'X',opponentCode:'X'}))];
  pool.forEach(s=>{s.team.code=s.key;s.team.name=s.key;});
  await page.evaluate(pool=>{sportsSlides=pool;sportsFitCount=4;sportsFitDepth=0;renderSportsStrip();},pool);
  const cards=page.locator('#masthead-sports-strip > a');await expect(cards).toHaveCount(4);
  expect(await cards.evaluateAll(cards=>cards.map(c=>c.dataset.sportsKey))).toEqual(['r0','r1','n0','n1']);
  await page.clock.setFixedTime(new Date('2026-11-09T00:05:00-05:00'));
  await page.evaluate(()=>rotateSportsSlot(0));
  expect(await cards.evaluateAll(cards=>cards.map(c=>c.dataset.sportsKey))).toEqual(['r0','r1','n0','n1']);
  await page.evaluate(()=>{for(let i=0;i<12;i++)rotateSportsSlot(i%4);});
  expect(await page.evaluate(()=>sportsVisible.map(s=>s.key[0]))).toEqual(['r','r','n','n']);
});

// Géométrie, et non seulement cardinalité : le pool direct réduit ne doit
// jamais dilater une carte au-delà de son slot physique. Cas réel signalé.
const rosemontGeometry = JSON.parse(fs.readFileSync(new URL('./fixtures/sports-strip-rosemont.json', import.meta.url), 'utf8'));
for (const width of [320, 390, 1024, 1440]) for (const lang of ['fr', 'en']) for (const theme of ['light', 'dark']) {
  test(`cartes restent des cartes ${width} ${lang} ${theme} @ci-critical`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
    await page.route('**/assets/news-images/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
    await page.route('https://**/*', r => r.abort());
    await page.addInitScript(({ theme, lang }) => {
      localStorage.setItem('radar-theme', theme);
      localStorage.setItem('radar-translate-mode', lang === 'en' ? 'en' : 'original');
    }, { theme, lang });
    // La route SEO /en/ n’embarque pas le traducteur. Tester ici le vrai
    // choix EN du bandeau public, via sa préférence native sur l’accueil.
    await page.goto('/?labFrame=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${lang}(?:-|$)`));
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect.poll(() => page.evaluate(() => window.RadarTranslate?.getMode())).toBe(lang === 'en' ? 'en' : 'original');
    await expect(page.locator('#masthead-sports-strip')).toBeVisible();
    const measurements = [];
    for (const n of [7, 0, 1, 2, 3]) {
      const pool = Array.from({ length: n }, (_, i) => ({
        ...rosemontGeometry, key: `geometry-${i}`,
        team: { ...rosemontGeometry.team, id: `geometry-team-${i}`, code: `geometry-${i}` },
        game: { ...rosemontGeometry.game, gameId: `geometry-${i}` },
      })).concat(['2026-11-07', '2026-11-08'].map((date, i) => ({
        ...rosemontGeometry, mode: 'result', key: `geometry-other-${i}`,
        game: { ...rosemontGeometry.game, date, gameId: `geometry-other-${i}`, live: false, final: true, scoreFor: 11, scoreAgainst: 10, result: 'W' },
      })));
      await page.evaluate(pool => {
        sportsSlides = pool; sportsFitCount = null; sportsFitDepth = 0;
        renderSportsStrip(); scheduleSportsRotate();
      }, pool);
      await expect.poll(() => page.evaluate(() => {
        const strip = document.querySelector('#masthead-sports-strip');
        const cards = [...strip.querySelectorAll('.sports-chip--match')];
        return cards.length > 0 && cards.every(c => {
          const cap = parseFloat(getComputedStyle(c).maxWidth);
          return Number.isFinite(cap) && c.getBoundingClientRect().width <= cap + 1;
        });
      })).toBe(true);
      // Deux paints observés, sans délai arbitraire ni appel direct du fitter.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const geometry = await page.evaluate(() => {
        const strip = document.querySelector('#masthead-sports-strip');
        const cs = getComputedStyle(strip);
        const inner = strip.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return {
          inner, boardCapacity: sportsBoardCount(), slots: Math.min(sportsBoardCount(), sportsStripFitFloor()), gap: parseFloat(cs.columnGap),
          cards: [...strip.querySelectorAll('.sports-chip--match')].map(c => {
            const r = c.getBoundingClientRect();
            const line = c.querySelector('.sports-chip__line-inner');
            return { titleClipped: line.scrollWidth > line.parentElement.clientWidth + 2,
              marquee: c.classList.contains('is-overflowing'), animation: getComputedStyle(line).animationName,
              fullText: line.textContent, width: r.width, height: r.height, left: r.left, right: r.right,
              live: c.dataset.sportsLive, key: c.dataset.sportsKey,
              title: c.title, aria: c.getAttribute('aria-label'),
              text: c.textContent, ellipsis: getComputedStyle(c).textOverflow };
          }),
        };
      });
      measurements.push({ n, ...geometry });
      expect(geometry.cards.length).toBe(Math.min(n + 2, geometry.slots));
      expect(geometry.cards.filter(c => c.live === '1')).toHaveLength(Math.min(n, geometry.slots === 1 ? 1 : geometry.slots - 1));
      if (geometry.slots > 1) expect(geometry.cards.some(c => c.live !== '1')).toBe(true);
      expect(new Set(geometry.cards.map(c => c.key)).size).toBe(geometry.cards.length);
      const slotWidth = (geometry.inner - geometry.gap * (geometry.slots - 1)) / geometry.slots;
      for (const card of geometry.cards) {
        if (card.live === '1') expect(card.text).toContain(lang === 'en' ? 'Live' : 'En cours');
        else expect(card.text).toContain('11–10');
        expect(card.text).not.toMatch(/undefined|NaN/);
        expect(card.height).toBeGreaterThanOrEqual(44);
        expect(card.width).toBeCloseTo(slotWidth, 0);
        expect(card.width).toBeLessThanOrEqual(geometry.inner + 1);
        // Nom long conservé intégralement pour l’accès clavier/lecteur d’écran.
        expect(card.title).toContain('Rosemont'); expect(card.aria).toContain('Bois-de-Boulogne');
        expect(card.ellipsis).not.toBe('ellipsis');
        expect(card.fullText).toContain('Rosemont'); expect(card.fullText).toContain('Bois-de-Boulogne');
        if (card.titleClipped) { expect(card.marquee).toBe(true); expect(card.animation).toContain('sports-chip-scroll'); }
      }
      if (width >= 1024) {
        expect(geometry.slots).toBeGreaterThanOrEqual(2);
        expect(geometry.cards[0].width).toBeLessThanOrEqual(geometry.inner / 2 + 1);
      }
      if (n === 1) {
        expect(geometry.cards[0].width).toBeCloseTo(measurements[0].cards[0].width, 0);
        await page.addStyleTag({ content: '#local-lab-format-bar{display:none!important}' });
        await page.locator('#masthead-sports-strip').screenshot({ path: info.outputPath('one-live-and-other-cards.png') });
        // Rotation ne dilate pas la carte et ne fabrique aucun autre match.
        await page.evaluate(() => rotateSportsSlot(0));
        await expect(page.locator('#masthead-sports-strip .sports-chip--match')).toHaveCount(Math.min(3, geometry.slots));
      }
    }
    fs.writeFileSync(info.outputPath('card-geometry.json'), JSON.stringify(measurements, null, 2));
    await info.attach('card-geometry.json', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  });
}

test('carte unique : refresh, vrai retour navigateur, resize et focus sans dilatation @ci-critical', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
  await page.route('https://**/*', r => r.abort());
  await page.route('**/assets/news-images/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"/>' }));
  const team = { ...rosemontGeometry.team, results: [], lastGame: null, nextGame: rosemontGeometry.game, nextGames: [rosemontGeometry.game] };
  await page.route('**/sports-masthead.json*', r => r.fulfill({ json: { fetchedAt: '2026-11-08T23:59:00Z', teams: { [team.id]: team } } }));
  await page.goto('/?labFrame=1', { waitUntil: 'domcontentloaded' });
  const card = page.locator('#masthead-sports-strip .sports-chip--match');
  const metrics = [];
  async function bounded(stage, singleSlot = false) {
    await expect(card).toHaveCount(1);
    await expect.poll(() => card.evaluate(c => {
      const strip = c.parentElement, cs = getComputedStyle(strip);
      const inner = strip.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const slots = Math.min(sportsBoardCount(), sportsStripFitFloor());
      const expected = (inner - parseFloat(cs.columnGap) * (slots - 1)) / slots;
      return Math.abs(c.getBoundingClientRect().width - expected) <= 1 && (inner < 520 || slots >= 2);
    })).toBe(true);
    const m = await card.evaluate(c => ({ width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height, slots: Math.min(sportsBoardCount(), sportsStripFitFloor()), title: c.title }));
    if (singleSlot) expect(m.slots).toBe(1); else expect(m.slots).toBeGreaterThanOrEqual(2);
    metrics.push({ stage, ...m });
  }
  await bounded('initial');
  await card.focus(); await expect(card).toBeFocused();
  await page.evaluate(() => rotateSportsSlot(0)); await expect(card).toBeFocused();
  await bounded('rotation-focus');
  await page.reload({ waitUntil: 'domcontentloaded' }); await bounded('refresh');
  await page.goto('/feeds.html?labFrame=1', { waitUntil: 'domcontentloaded' });
  await page.goBack({ waitUntil: 'domcontentloaded' }); await bounded('back-navigation');
  // Ce retour utilise le navigateur, mais l’horloge/interception du test n’est
  // pas une preuve BFCache (le test BFCache dédié reste séparé).
  await page.setViewportSize({ width: 390, height: 844 }); await bounded('mobile', true);
  await page.setViewportSize({ width: 1440, height: 1000 }); await bounded('desktop-restored');
  fs.writeFileSync(info.outputPath('lifecycle-geometry.json'), JSON.stringify(metrics, null, 2));
  await info.attach('lifecycle-geometry.json', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
});


test('mobile : direct / autres A B C sans starvation, focus et resize @ci-critical', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?labFrame=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  const pool = [slide('live-A', 'next', '2026-11-08', '17:00', { live: true }),
    slide('y-A', 'result', '2026-11-07', '19:00'), slide('y-B', 'result', '2026-11-07', '18:00'),
    slide('today-C', 'next', '2026-11-08', '20:00')];
  pool.forEach(s => { s.team.code = s.key; s.team.name = s.key; });
  await page.evaluate(pool => { sportsSlides = pool; sportsFitCount = null; sportsFitDepth = 0; renderSportsStrip(); }, pool);
  const card = page.locator('#masthead-sports-strip .sports-chip--match');
  await expect(card).toHaveCount(1); await expect(card).toHaveAttribute('data-sports-key', 'live-A');
  await card.focus(); await page.evaluate(() => rotateSportsSlot(0));
  await expect(card).toBeFocused(); await expect(card).toHaveAttribute('data-sports-key', 'live-A');
  await card.evaluate(c => c.blur());
  const sequence = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => rotateSportsSlot(0));
    await expect.poll(() => card.getAttribute('data-sports-key')).toBe(await page.evaluate(() => sportsVisible[0].key));
    sequence.push(await card.getAttribute('data-sports-key'));
  }
  expect(sequence.filter((_, i) => i % 2 === 1)).toEqual(['live-A', 'live-A', 'live-A']);
  expect(new Set(sequence.filter((_, i) => i % 2 === 0))).toEqual(new Set(['y-A', 'y-B', 'today-C']));
  await card.focus();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => page.evaluate(() => document.querySelector('#masthead-sports-strip').contains(document.activeElement))).toBe(true);
  await expect.poll(() => page.locator('#masthead-sports-strip .sports-chip--match').count()).toBeGreaterThan(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toHaveCount(1); await expect(card).toBeFocused();
  fs.writeFileSync(info.outputPath('mobile-fair-rotation.json'), JSON.stringify(sequence, null, 2));
});

test('jours vides, source absente et direct sans date : pas de match ou heure inventés @ci-critical', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  const fixtures = {
    yesterday: slide('y', 'result', '2026-11-07', '19:00'),
    today: slide('t', 'next', '2026-11-08', '20:00'),
    tomorrow: slide('n', 'next', '2026-11-09', '20:00'),
    unknown: slide('unknown-time', 'next', '2026-11-08', undefined),
    invalid: { key: 'missing-date', mode: 'next', team: {}, game: { live: true } },
  };
  const state = await page.evaluate(f => {
    const now = Date.parse('2026-11-08T18:00:00-05:00');
    const pick = xs => sportsSplitVisible(4, now, xs).map(s => s.key);
    const before = JSON.stringify(f);
    const out = { empty: pick([]), missing: pick([null, {}, f.invalid]),
      onlyYesterday: pick([f.yesterday]), onlyToday: pick([f.today]),
      fallback: pick([f.tomorrow]), unknown: pick([f.unknown]),
      unknownLive: sportsGameIsLive(f.unknown.game, now), clock: f.unknown.game.time };
    out.sourceUnchanged = before === JSON.stringify(f); return out;
  }, fixtures);
  expect(state.empty).toEqual([]); expect(state.missing).toEqual([]);
  expect(state.onlyYesterday).toEqual(['y']); expect(state.onlyToday).toEqual(['t']);
  expect(state.fallback).toEqual(['n']); expect(state.unknown).toEqual(['unknown-time']);
  expect(state.unknownLive).toBe(false); expect(state.clock).toBeUndefined(); expect(state.sourceUnchanged).toBe(true);
  await page.evaluate(() => { sportsSlides = []; renderSportsStrip(); });
  await expect(page.locator('#masthead-sports-strip')).toBeHidden();
  await expect(page.locator('#masthead-sports-strip .sports-chip')).toHaveCount(0);
});


test('focus reçu pendant la sortie animée : reste dans la carte sans saut de scroll @ci-critical', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-08T18:59:00-05:00'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?labFrame=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  const pool = [slide('live', 'next', '2026-11-08', '17:00', { live: true }), slide('yesterday', 'result', '2026-11-07', '19:00')];
  const before = await page.evaluate(pool => {
    sportsSlides = pool; sportsFitCount = null; sportsFitDepth = 0; renderSportsStrip();
    window.scrollTo(0, 300); const y = window.scrollY; rotateSportsSlot(0);
    document.querySelector('#masthead-sports-strip .sports-chip').focus({ preventScroll: true }); return y;
  }, pool);
  const card = page.locator('#masthead-sports-strip .sports-chip');
  await expect(card).toHaveAttribute('data-sports-key', 'yesterday');
  await expect(card).toBeFocused(); expect(before).toBeGreaterThan(0); expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('direct à cheval sur minuit Toronto puis final : autres matchs conservés et identité inchangée @ci-critical', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  const pool = [slide('carry', 'next', '2026-11-08', '23:30', { live: true }),
    slide('old-y', 'result', '2026-11-07', '19:00'), slide('today-r', 'result', '2026-11-08', '20:00'),
    slide('new-day', 'next', '2026-11-09', '19:00')];
  const state = await page.evaluate(pool => {
    const pick = time => sportsSplitVisible(3, Date.parse(time), pool).map(s => ({ key: s.key, live: sportsGameIsLive(s.game, Date.parse(time)), day: sportsSlideDayKey(s) }));
    const before = pick('2026-11-08T23:50:00-05:00'), after = pick('2026-11-09T00:05:00-05:00');
    pool[0] = { ...pool[0], mode: 'result', game: { ...pool[0].game, live: false, final: true, scoreFor: 2, scoreAgainst: 1, result: 'W' } };
    return { before, after, final: pick('2026-11-09T00:06:00-05:00'), carryDate: pool[0].game.date, carryId: pool[0].game.gameId };
  }, pool);
  expect(state.before.some(s => s.key === 'carry' && s.live)).toBe(true);
  expect(state.before.some(s => s.key === 'today-r'), 'le score du jour passe devant celui d’hier').toBe(true);
  expect(state.after.map(s => s.key)).toEqual(['today-r', 'carry', 'new-day']);
  expect(state.final.filter(s => s.live)).toHaveLength(0);
  expect(state.final.map(s => s.key)).toContain('carry'); expect(state.final.map(s => s.key)).toContain('new-day');
  expect(state.carryDate).toBe('2026-11-08'); expect(state.carryId).toBe('carry');
});


test('chaque moitié et chaque direct tournent sans starvation de parité @ci-critical', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T17:00:00-05:00'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#masthead-sports-strip')).toBeVisible();
  for (const nLive of [1, 7]) {
    const pool = [...Array.from({ length: nLive }, (_, i) => slide(`live-${i}`, 'next', '2026-11-08', '16:30', { live: true })),
      ...Array.from({ length: 6 }, (_, i) => slide(`left-${i}`, 'result', '2026-11-07', '19:00')),
      ...Array.from({ length: 6 }, (_, i) => slide(`right-${i}`, 'next', '2026-11-08', '20:00'))];
    const seen = await page.evaluate(pool => {
      sportsSlides = pool; sportsVisible = sportsSplitVisible(3); sportsLeftCursor = 0; sportsPriorityCursors = { live: 0, other: 0, left: 0, right: 0 };
      const keys = new Set(sportsVisible.map(s => s.key));
      for (let turn = 0; turn < 24; turn++) for (let slot = 0; slot < sportsVisible.length; slot++) {
        const next = nextSportsSlide(sportsVisibleOccupyKeys(), { outgoing: sportsVisible[slot], boardN: sportsVisible.length });
        if (next) sportsVisible[slot] = next;
        sportsVisible.forEach(s => keys.add(s.key));
      }
      return [...keys];
    }, pool);
    expect(seen.filter(k => k.startsWith('left-'))).toHaveLength(6);
    expect(seen.filter(k => k.startsWith('right-'))).toHaveLength(6);
    expect(seen.filter(k => k.startsWith('live-'))).toHaveLength(nLive);
  }
});
