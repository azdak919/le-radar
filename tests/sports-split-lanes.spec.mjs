import { expect, test } from '@playwright/test';

/**
 * go D : n=1 = ordre E ; n≥2 = gauche scores / droite à-venir,
 * live et aujourd’hui volent les bords.
 */

function slide(key, mode, date, time, extra = {}) {
  const sport = extra.sport || 'football';
  return {
    key,
    mode,
    game: {
      date,
      time,
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
  expect(two.keys[0], 'n=2 premier tab = ce soir').toBe('tonight');
  expect(two.keys, 'jamais [score froid, ce soir]').not.toEqual(['yesterday', 'tonight']);
  expect(two.keys[1]).toBe('yesterday');
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
  expect(four.keys.slice(0, 2), 'gauche = dimanche puis samedi').toEqual(['sun', 'sat']);
  expect(four.keys.slice(2), 'droite = mardi puis jeudi').toEqual(['tue', 'thu-next']);
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
  const unique = [...new Set(four.sports.filter(Boolean))];
  expect(unique.length, `puces=${four.sports.join(',')} keys=${four.keys.join(',')}`).toBeGreaterThan(1);
  expect(four.sports, 'football noyé sous le soccer').toContain('football');
});

test('accueil 1280 : plus d’un sport si le snapshot en a plusieurs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(1);
  const info = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#masthead-sports-strip .sports-chip')];
    const sports = chips
      .map((c) => (c.dataset.sportsSport || '').toLowerCase())
      .filter((s) => s && s !== 'board');
    const pool = typeof sportsOpenOrderSlides === 'function' ? sportsOpenOrderSlides() : [];
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

test('390 : une puce, pas de split visuel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const strip = page.locator('#masthead-sports-strip');
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(0);
  const n = await strip.locator('.sports-chip').count();
  expect(n, '390 : une seule puce visible').toBe(1);
});
