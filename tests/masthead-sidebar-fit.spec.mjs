import { expect, test } from '@playwright/test';

/**
 * Panneau latéral navigateur (Firefox, Chrome, Edge, Arc, Vivaldi…) :
 * le viewport rétrécit sans quitter le shell wide. Météo et sports
 * doivent perdre des cartes plutôt que passer sous les icônes / hors cadre.
 */

const weather = Array.from({ length: 50 }, () => ({
  current: { temperature_2m: 18, weather_code: 1, is_day: 1 },
}));

async function mockWeather(page) {
  await page.route('https://le-radar-weather.azdak.workers.dev/v1/forecast**', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(weather),
  }));
}

async function waitMast(page) {
  const ribbon = page.locator('#masthead-weather');
  await expect(ribbon.locator('.masthead-weather__city.is-active').first()).toBeVisible({ timeout: 10_000 });
  const strip = page.locator('#masthead-sports-strip');
  await expect.poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(0);
}

async function measureChrome(page) {
  return page.evaluate(() => {
    const weatherEl = document.getElementById('masthead-weather');
    const actions = document.querySelector('.masthead-actions');
    const date = document.querySelector('.masthead-date');
    const strip = document.getElementById('masthead-sports-strip');
    const limit = actions?.getBoundingClientRect().left ?? 0;
    const cities = [...(weatherEl?.querySelectorAll('.masthead-weather__city.is-active') || [])];
    const cityOverlap = cities.reduce((max, el) => (
      Math.max(max, el.getBoundingClientRect().right - limit)
    ), -Infinity);
    const dateOverlap = date ? date.getBoundingClientRect().right - limit : 0;
    const stripBox = strip?.getBoundingClientRect();
    const chips = [...(strip?.querySelectorAll('.sports-chip') || [])];
    const chipEscape = chips.reduce((max, el) => {
      const box = el.getBoundingClientRect();
      if (!stripBox) return max;
      return Math.max(max, stripBox.left - box.left, box.right - stripBox.right);
    }, 0);
    return {
      wide: document.documentElement.dataset.widePreview || '',
      cities: cities.length,
      chips: chips.length,
      cityOverlap: Number.isFinite(cityOverlap) ? Math.round(cityOverlap) : 0,
      dateOverlap: Math.round(dateOverlap),
      chipEscape: Math.round(chipEscape),
    };
  });
}

const SIDEBAR_WIDTHS = [1920, 1780, 1680, 1600, 1520, 1440, 1366];

test('mât : panneau latéral — météo et sports restent dans leur cadre', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mockWeather(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);

  for (const width of SIDEBAR_WIDTHS) {
    await page.setViewportSize({ width, height: 1080 });
    await expect.poll(async () => {
      const snap = await measureChrome(page);
      return snap.cityOverlap <= 1 && snap.dateOverlap <= 1 && snap.chipEscape <= 2
        ? 'fit'
        : `${width}:${JSON.stringify(snap)}`;
    }, { timeout: 4000 }).toBe('fit');
    const snap = await measureChrome(page);
    expect(snap.cities, `${width}: au moins MTL+QC ou une ancre`).toBeGreaterThanOrEqual(1);
    if (width >= 1281) expect(snap.wide, `${width}: shell E`).toBe('e');
    expect(snap.chips, `${width}: bandeau sports`).toBeGreaterThanOrEqual(1);
  }

  expect(pageErrors).toEqual([]);
});

test('mât : 1920 → 1520 (sidebar ~400 px) retire des cartes sans chevauchement', async ({ page }) => {
  await mockWeather(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);
  const wide = await measureChrome(page);
  expect(wide.cities).toBeGreaterThanOrEqual(4);
  expect(wide.cityOverlap).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1520, height: 1080 });
  await expect.poll(async () => (await measureChrome(page)).cityOverlap, { timeout: 4000 })
    .toBeLessThanOrEqual(1);
  const squeezed = await measureChrome(page);
  expect(squeezed.cities).toBeGreaterThanOrEqual(2);
  expect(squeezed.cities).toBeLessThanOrEqual(wide.cities);
  expect(squeezed.dateOverlap).toBeLessThanOrEqual(1);
  expect(squeezed.chipEscape).toBeLessThanOrEqual(2);
  expect(squeezed.chips).toBeGreaterThanOrEqual(1);
});
