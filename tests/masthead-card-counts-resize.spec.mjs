import { expect, test } from '@playwright/test';

/**
 * Quantité des cartes mât (météo, scores, CTA sports) selon la largeur,
 * y compris après un aller-retour de fenêtre.
 *
 * A capturé : 1 score étiré à 1920 (météo capée à 3), round-trip
 * 2560→1920 qui jetait le score, 1920→1280 qui coincait la météo à 1 carte.
 */

const weather = Array.from({ length: 50 }, () => ({
  current: { temperature_2m: 20, weather_code: 1, is_day: 1 },
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

function snapshot(page) {
  return page.evaluate(() => {
    const weatherEl = document.getElementById('masthead-weather');
    const strip = document.getElementById('masthead-sports-strip');
    const cities = [...(weatherEl?.querySelectorAll('.masthead-weather__city.is-active') || [])];
    const chips = [...(strip?.querySelectorAll('.sports-chip') || [])];
    const ctas = chips.filter((el) => el.classList.contains('sports-chip--cta') || el.classList.contains('sports-chip--idle'));
    const overlap = (() => {
      const actions = document.querySelector('.masthead-actions');
      const limit = actions?.getBoundingClientRect().left ?? 0;
      if (weatherEl?.classList.contains('masthead-weather--docked')) return 0;
      return cities.reduce((max, el) => Math.max(max, el.getBoundingClientRect().right - limit), 0);
    })();
    const matches = chips.filter((el) => el.classList.contains('sports-chip--match') && !el.classList.contains('sports-chip--idle'));
    const clip = typeof sportsMatchChipTextOverflows === 'function'
      ? matches.filter((chip) => sportsMatchChipTextOverflows(chip)).length
      : 0;
    const ellipsis = matches.filter((chip) => [
      chip.querySelector('.sports-chip__line-inner'),
      chip.querySelector('.sports-chip__sub-text'),
    ].some((el) => el && /ellipsis/i.test(getComputedStyle(el).textOverflow))).length;
    const chipW = chips.map((el) => Math.round(el.getBoundingClientRect().width));
    const stripBox = strip?.getBoundingClientRect();
    const padR = strip ? parseFloat(getComputedStyle(strip).paddingRight) || 0 : 0;
    const last = chips[chips.length - 1];
    const clipRight = last && stripBox
      ? Math.max(0, last.getBoundingClientRect().right - (stripBox.right - padR))
      : 0;
    const order = chips.map((el) => (el.classList.contains('sports-chip--idle') ? 'C' : 'M')).join('');
    return {
      weather: cities.length,
      chips: chips.length,
      cta: ctas.length,
      match: matches.length,
      clip: clip + ellipsis,
      clipRight: Math.round(clipRight),
      order,
      docked: !!weatherEl?.classList.contains('masthead-weather--docked'),
      wide: document.documentElement.dataset.widePreview || '',
      overlap: Math.round(overlap),
      inner: window.innerWidth,
      chipSpread: chipW.length ? Math.max(...chipW) - Math.min(...chipW) : 0,
    };
  });
}

async function resizeAndSettle(page, width, height = 1080) {
  await page.setViewportSize({ width, height });
  let last = '';
  let stable = 0;
  const deadline = Date.now() + 5000;
  let snap;
  do {
    snap = await snapshot(page);
    const key = `${snap.weather}:${snap.chips}:${snap.cta}:${snap.match}:${snap.docked}`;
    if (key === last) stable += 1;
    else {
      last = key;
      stable = 0;
    }
    if (stable >= 2 && snap.chips > 0 && snap.weather > 0) break;
    await page.waitForTimeout(80);
  } while (Date.now() < deadline);
  return snap;
}

test('mât : les quantités météo / scores / CTA suivent la largeur @ci-critical', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mockWeather(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);

  const fresh1920 = await resizeAndSettle(page, 1920, 1080);
  expect(fresh1920.match, '1920 frais : des scores en plus des CTA').toBeGreaterThanOrEqual(2);

  const at390 = await resizeAndSettle(page, 390, 844);
  expect(at390.inner).toBe(390);
  expect(at390.docked, '390 : météo dockée').toBe(true);
  expect(at390.weather, '390 : au moins une ville').toBeGreaterThanOrEqual(1);
  expect(at390.chips, '390 : une carte sport').toBe(1);
  expect(at390.match).toBe(1);
  expect(at390.cta).toBe(0);

  const at768 = await resizeAndSettle(page, 768, 1024);
  expect(at768.docked).toBe(true);
  expect(at768.weather).toBeGreaterThanOrEqual(2);
  expect(at768.weather).toBeLessThanOrEqual(3);
  expect(at768.chips).toBeGreaterThanOrEqual(1);
  expect(at768.match).toBe(at768.chips);
  expect(at768.cta).toBe(0);

  const at1280 = await resizeAndSettle(page, 1280, 800);
  expect(at1280.wide, '1280 : pas shell E').toBe('');
  expect(at1280.docked).toBe(false);
  expect(at1280.weather, '1280 : 3 cartes (pas coincé à 1 après 390)').toBe(3);
  expect(at1280.chips).toBeGreaterThanOrEqual(1);
  expect(at1280.match, '1280 : plus qu’une carte').toBeGreaterThanOrEqual(1);
  expect(at1280.cta).toBe(0);
  expect(at1280.chips).toBe(at1280.match);
  expect(at1280.overlap).toBeLessThanOrEqual(1);

  const at1600 = await resizeAndSettle(page, 1600, 900);
  expect(at1600.cta, '1600 : plus de chrome CTA').toBe(0);
  expect(at1600.match, '1600 : cartes sport seulement').toBe(at1600.chips);
  expect(at1600.chips, '1600 : au moins deux cartes').toBeGreaterThanOrEqual(2);
  expect(at1600.order.startsWith('M'), '1600 : puces sport').toBe(true);
  expect(at1600.clipRight, '1600 : pas de carte coupée à droite').toBeLessThanOrEqual(2);
  expect(at1600.chipSpread, `1600 : cartes égales, spread ${at1600.chipSpread}`).toBeLessThanOrEqual(8);

  const at1920 = await resizeAndSettle(page, 1920, 1080);
  expect(at1920.wide).toBe('e');
  expect(at1920.weather, '1920 : remplir le ruban, pas 3 villes orphelines').toBeGreaterThanOrEqual(4);
  expect(at1920.cta, '1920 : plus de chrome CTA').toBe(0);
  expect(at1920.match, '1920 : cartes sport seulement').toBe(at1920.chips);
  expect(at1920.chips, '1920 : au moins deux cartes').toBeGreaterThanOrEqual(2);
  expect(at1920.order.startsWith('M'), '1920 : puces sport').toBe(true);
  expect(at1920.clipRight, '1920 : pas de carte coupée à droite').toBeLessThanOrEqual(2);
  expect(at1920.overlap).toBeLessThanOrEqual(1);
  expect(at1920.chipSpread, `1920 : cartes égales, spread ${at1920.chipSpread}`).toBeLessThanOrEqual(8);

  const at2560 = await resizeAndSettle(page, 2560, 1440);
  expect(at2560.weather, '2560 : plus de météo qu’à 1920').toBeGreaterThan(at1920.weather);
  expect(at2560.match, '2560 : plus de cartes qu’à 1920').toBeGreaterThanOrEqual(at1920.match);
  expect(at2560.chips).toBeGreaterThanOrEqual(at1920.chips);
  expect(at2560.overlap).toBeLessThanOrEqual(1);

  const at3440 = await resizeAndSettle(page, 3440, 1440);
  expect(at3440.match, '3440 : au moins autant de cartes qu’à 1920').toBeGreaterThanOrEqual(at1920.match);
  expect(at3440.weather).toBeGreaterThanOrEqual(at2560.weather);
  expect(at3440.match).toBeGreaterThanOrEqual(at1920.match);

  expect(pageErrors).toEqual([]);
});

test('mât : revenir à la taille d’origine restaure les quantités', async ({ page }) => {
  test.setTimeout(120_000);
  await mockWeather(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitMast(page);

  const sizes = [
    [1920, 1080],
    [1280, 800],
    [2560, 1440],
    [768, 1024],
  ];

  for (const [w, h] of sizes) {
    const fresh = await resizeAndSettle(page, w, h);
    await resizeAndSettle(page, 390, 844);
    const back = await resizeAndSettle(page, w, h);
    expect(back.cta, `${w}: CTA ${JSON.stringify(back)} vs ${JSON.stringify(fresh)}`).toBe(fresh.cta);
    expect(back.match, `${w}: scores`).toBe(fresh.match);
    expect(back.weather, `${w}: météo`).toBeGreaterThanOrEqual(1);
  }

  const at2560 = await resizeAndSettle(page, 2560, 1440);
  const back1920 = await resizeAndSettle(page, 1920, 1080);
  expect(back1920.cta, '2560→1920 : plus de chrome CTA').toBe(0);
  expect(back1920.match, '2560→1920 : les scores ne disparaissent pas').toBeGreaterThanOrEqual(2);
  expect(back1920.weather).toBeGreaterThanOrEqual(4);

  const from1920 = await resizeAndSettle(page, 1920, 1080);
  const at1280 = await resizeAndSettle(page, 1280, 800);
  expect(at1280.weather, '1920→1280 : 3 cartes, pas 1').toBe(3);
  expect(at1280.wide).toBe('');
  expect(from1920.weather).toBeGreaterThanOrEqual(4);
});
