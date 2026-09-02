import { expect, test } from '@playwright/test';

/**
 * go D : n=1 = ordre E ; n≥2 = gauche scores / droite à-venir,
 * live et aujourd’hui volent les bords.
 */

function slide(key, mode, date, time, extra = {}) {
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
      ...extra,
    },
    team: {
      name: 'Vert et Or',
      fullName: 'Vert et Or',
      code: 'LAV',
      sport: 'football',
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
