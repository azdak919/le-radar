import { expect, test } from '@playwright/test';

/**
 * Panneau latéral / split-view à **toutes** les tailles :
 * téléphone, tablette (météo dockée), bureau 1280, wide, 1920, QHD, UW, 4K.
 * On retire des cartes plutôt que de chevaucher les icônes ou de sortir du cadre.
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
    const dock = document.getElementById('masthead-weather-dock');
    const actions = document.querySelector('.masthead-actions');
    const date = document.querySelector('.masthead-date');
    const strip = document.getElementById('masthead-sports-strip');
    const docked = !!weatherEl?.classList.contains('masthead-weather--docked');
    const cities = [...(weatherEl?.querySelectorAll('.masthead-weather__city.is-active') || [])];
    const limit = actions?.getBoundingClientRect().left ?? 0;
    const dateOverlap = date ? date.getBoundingClientRect().right - limit : 0;
    let cityOverlap = 0;
    let dockEscape = 0;
    if (docked) {
      const host = (dock && dock.getBoundingClientRect().width > 8) ? dock : weatherEl;
      const box = host?.getBoundingClientRect();
      if (box) {
        dockEscape = cities.reduce((max, el) => {
          const card = el.getBoundingClientRect();
          return Math.max(max, box.left - card.left, card.right - box.right);
        }, 0);
      }
    } else {
      cityOverlap = cities.reduce((max, el) => (
        Math.max(max, el.getBoundingClientRect().right - limit)
      ), 0);
    }
    const stripBox = strip?.getBoundingClientRect();
    const chips = [...(strip?.querySelectorAll('.sports-chip') || [])];
    const chipEscape = chips.reduce((max, el) => {
      const box = el.getBoundingClientRect();
      if (!stripBox) return max;
      return Math.max(max, stripBox.left - box.left, box.right - stripBox.right);
    }, 0);
    return {
      wide: document.documentElement.dataset.widePreview || '',
      docked,
      cities: cities.length,
      chips: chips.length,
      cityOverlap: Math.round(cityOverlap),
      dateOverlap: Math.round(dateOverlap),
      dockEscape: Math.round(dockEscape),
      chipEscape: Math.round(chipEscape),
    };
  });
}

function fitOk(snap) {
  return snap.cityOverlap <= 1
    && snap.dateOverlap <= 1
    && snap.dockEscape <= 2
    && snap.chipEscape <= 2;
}

/** Natives + sidebar typique (240–400 px). Pas de 3840 ici : trop lent à redimensionner. */
const VIEWPORTS = [
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 900, h: 1200 },
  { w: 1024, h: 768 },
  { w: 1100, h: 800 },
  { w: 1280, h: 800 },
  { w: 1000, h: 800 },
  { w: 1366, h: 768 },
  { w: 1086, h: 768 },
  { w: 1440, h: 900 },
  { w: 1120, h: 900 },
  { w: 1600, h: 900 },
  { w: 1920, h: 1080 },
  { w: 1680, h: 1080 },
  { w: 1520, h: 1080 },
  { w: 2240, h: 1440 },
];

test('mât : toutes tailles + sidebar — météo et sports restent dans leur cadre', async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mockWeather(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);

  const seen = new Set();
  for (const { w, h } of VIEWPORTS) {
    const key = `${w}x${h}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await page.setViewportSize({ width: w, height: h });
    const deadline = Date.now() + 4000;
    let snap;
    do {
      snap = await measureChrome(page);
      if (fitOk(snap)) break;
      await page.waitForTimeout(80);
    } while (Date.now() < deadline);
    expect(fitOk(snap), `${w}x${h}: ${JSON.stringify(snap)}`).toBe(true);
    expect(snap.cities, `${w}: au moins une ville`).toBeGreaterThanOrEqual(1);
    expect(snap.chips, `${w}: bandeau sports`).toBeGreaterThanOrEqual(1);
    if (w <= 1023) expect(snap.docked, `${w}: météo dockée`).toBe(true);
    if (w >= 1281) expect(snap.wide, `${w}: shell E`).toBe('e');
    if (w <= 1280) expect(snap.wide, `${w}: pas E`).toBe('');
  }

  expect(pageErrors).toEqual([]);
});

test('mât : 1920 → 1520 (sidebar ~400 px) retire des cartes sans chevauchement', async ({ page }) => {
  await mockWeather(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);
  await expect.poll(async () => (await measureChrome(page)).cityOverlap, { timeout: 4000 })
    .toBeLessThanOrEqual(1);
  const wide = await measureChrome(page);
  expect(wide.cities).toBeGreaterThanOrEqual(4);

  await page.setViewportSize({ width: 1520, height: 1080 });
  await expect.poll(async () => (await measureChrome(page)).cityOverlap, { timeout: 4000 })
    .toBeLessThanOrEqual(1);
  const squeezed = await measureChrome(page);
  expect(squeezed.cities).toBeGreaterThanOrEqual(2);
  expect(squeezed.cities).toBeLessThanOrEqual(wide.cities);
  expect(fitOk(squeezed), JSON.stringify(squeezed)).toBe(true);
});

test('mât : 1280 → 960 (sidebar sur portable) docke la météo sans débordement', async ({ page }) => {
  await mockWeather(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);
  expect((await measureChrome(page)).docked).toBe(false);

  await page.setViewportSize({ width: 960, height: 800 });
  await expect.poll(async () => (await measureChrome(page)).docked, { timeout: 4000 }).toBe(true);
  const snap = await measureChrome(page);
  expect(fitOk(snap), JSON.stringify(snap)).toBe(true);
  expect(snap.cities).toBeGreaterThanOrEqual(1);
});

test('mât : 2560 / 3840 moins un panneau — pas de chevauchement', async ({ page }) => {
  await mockWeather(page);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);

  for (const width of [2560, 2240, 3440]) {
    await page.setViewportSize({ width, height: 1440 });
    const deadline = Date.now() + 5000;
    let last;
    do {
      last = await measureChrome(page);
      if (fitOk(last)) break;
      await page.waitForTimeout(100);
    } while (Date.now() < deadline);
    expect(fitOk(last), `${width}: ${JSON.stringify(last)}`).toBe(true);
  }
});

test('mât EN : date longue + sidebar 1520 / 900 sans passer sous les icônes', async ({ page }) => {
  await mockWeather(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/en/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);
  for (const { w, h } of [{ w: 1520, h: 1080 }, { w: 900, h: 1200 }, { w: 430, h: 932 }]) {
    await page.setViewportSize({ width: w, height: h });
    await expect.poll(async () => {
      const snap = await measureChrome(page);
      return fitOk(snap) ? 'fit' : `${w}:${JSON.stringify(snap)}`;
    }, { timeout: 5000 }).toBe('fit');
  }
});
