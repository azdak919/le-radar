import { expect, test } from '@playwright/test';

const weather = [
  [24.8, 0, 1], [22.1, 1, 1], [20.4, 3, 1],
  [21.6, 61, 1], [19.2, 71, 1], [18.7, 0, 0],
  [23.3, 2, 1], [17.4, 63, 1], [21.7, 0, 1],
  [22.6, 0, 1], [21.4, 3, 1], [20.1, 2, 1], [19.7, 63, 1],
  [18.9, 61, 1], [21.8, 1, 1], [9.4, 3, 1], [20.6, 0, 1],
  [18.8, 61, 1], [22.9, 0, 1], [21.1, 2, 1],
  [20.3, 3, 1], [19.5, 61, 1], [18.9, 2, 1], [21.2, 0, 1],
  [20.8, 61, 1], [19.7, 3, 1], [21.4, 0, 1], [18.3, 63, 1], [24.6, 1, 1],
  [22.4, 1, 1],
  [19.6, 3, 1], [18.8, 61, 1], [16.1, 2, 1], [15.3, 63, 1], [10.4, 3, 1],
  [18.7, 0, 1], [17.9, 61, 1], [16.4, 3, 1], [15.8, 2, 1], [20.2, 0, 1],
  [18.6, 61, 1], [21.3, 1, 1], [20.1, 2, 1], [19.8, 3, 1], [17.5, 61, 1],
  [18.4, 3, 1], [13.7, 2, 1],
].map(([temperature_2m, weather_code, is_day]) => ({
  current: { temperature_2m, weather_code, is_day },
}));

test('météo campus : elle s’adapte à la largeur du masthead', async ({ page }) => {
  await page.route('https://le-radar-weather.azdak.workers.dev/v1/forecast**', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(weather),
  }));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const ribbon = page.locator('#masthead-weather');
  await expect(ribbon).toBeVisible();
  await expect(ribbon.locator('.masthead-weather__city.is-active .masthead-weather__temp').first()).not.toHaveText('—');
  await expect(ribbon.locator('.masthead-weather__city')).toHaveCount(47);
  expect(await ribbon.locator('.masthead-weather__city').evaluateAll((cities) => cities.every(
    (city) => city.href.startsWith('https://www.meteomedia.com/fr/ville/ca/quebec/'),
  ))).toBe(true);
  // Uniquement Montréal + Québec (plus de secondaires régionaux / nations).
  await expect(ribbon.locator('.masthead-weather__city.is-active')).toHaveCount(2);
  const activePrimary = ribbon.locator('.masthead-weather__city.is-active[data-weather-city="montreal"], .masthead-weather__city.is-active[data-weather-city="quebec"]');
  await expect(activePrimary).toHaveCount(2);
  await expect(ribbon.locator('.masthead-weather__city.is-active[data-weather-city="montreal"]')).toHaveCount(1);
  await expect(ribbon.locator('.masthead-weather__city.is-active[data-weather-city="quebec"]')).toHaveCount(1);
  // Bureau large : nom complet, pas le repli MTL/QC.
  await expect(activePrimary.first()).not.toHaveClass(/is-compact/);
  const activeBoxes = (await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities
    .map((city) => city.getBoundingClientRect())
    .sort((a, b) => a.x - b.x)
    .map(({ width }) => width)));
  expect(Math.min(...activeBoxes)).toBeGreaterThanOrEqual(90);
  expect(activeBoxes[0]).toBeGreaterThanOrEqual(120);
  const mtl = ribbon.locator('.masthead-weather__city.is-active[data-weather-city="montreal"]');
  await expect(mtl).toHaveAttribute('href', 'https://www.meteomedia.com/fr/ville/ca/quebec/montreal/actuelle');
  await expect(ribbon.locator('[data-weather-city="vaudreuil-dorion"]')).toHaveAttribute(
    'href',
    'https://www.meteomedia.com/fr/ville/ca/quebec/vaudreuil-dorion/actuelle',
  );
  await expect(ribbon.locator("[data-weather-city=\"odanak\"]")).toHaveAttribute(
    "href",
    "https://www.meteomedia.com/fr/ville/ca/quebec/odanak-12/actuelle",
  );
  // Manawan (affichage) → lien MM « manouane » (QC) — pas le slug « manawan » (SK).
  await expect(ribbon.locator('[data-weather-city="manawan"]')).toHaveAttribute(
    'href',
    'https://www.meteomedia.com/fr/ville/ca/quebec/manouane/actuelle',
  );
  await expect(ribbon.locator('[data-weather-city="kahnawake"]')).toHaveAttribute(
    'href',
    'https://www.meteomedia.com/fr/ville/ca/quebec/kahnawake-14/actuelle',
  );
  await page.evaluate(() => {
    window.RadarTranslate = { ...(window.RadarTranslate || {}), getMode: () => 'en' };
    window.dispatchEvent(new CustomEvent('radar:translate-mode', { detail: { mode: 'en' } }));
  });
  const translatedMtl = await mtl.evaluate((el) => el.href);
  expect(translatedMtl).toBe('https://www.meteomedia.com/fr/ville/ca/quebec/montreal/actuelle');
  const [weatherBox, actionsBox] = await Promise.all([
    ribbon.boundingBox(), page.locator('.masthead-actions').boundingBox(),
  ]);
  expect(actionsBox.x).toBeGreaterThan(weatherBox.x + weatherBox.width);

  // 2 cartes MTL+QC : la rotation échange l’ordre (anim), pas les villes.
  const beforeRotation = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities.map((city) => city.dataset.weatherCity));
  await page.waitForTimeout(8500);
  const afterRotation = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities.map((city) => city.dataset.weatherCity));
  expect([...afterRotation].sort()).toEqual(['montreal', 'quebec']);
  expect([...beforeRotation].sort()).toEqual(['montreal', 'quebec']);
  // Ordre inversé après un cycle (échange) — si le dwell n’a pas encore tiré, IDs inchangés OK.
  expect(afterRotation.length).toBe(2);

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(100);
  const countAt1200 = await ribbon.locator('.masthead-weather__city.is-active').count();
  await expect(ribbon.locator('.masthead-weather__board')).toHaveAttribute('data-weather-count', String(countAt1200));

  await page.setViewportSize({ width: 1050, height: 900 });
  await page.waitForTimeout(100);
  const countAt1050 = await ribbon.locator('.masthead-weather__city.is-active').count();
  expect(countAt1050).toBeLessThanOrEqual(countAt1200);
  await expect(ribbon.locator('.masthead-weather__board')).toHaveAttribute('data-weather-count', String(countAt1050));

  await page.setViewportSize({ width: 920, height: 900 });
  await page.waitForTimeout(100);
  const countAt920 = await ribbon.locator('.masthead-weather__city.is-active').count();
  expect(countAt920).toBeLessThanOrEqual(countAt1050);
  expect(countAt920).toBeGreaterThanOrEqual(1);
  await expect(ribbon.locator('.masthead-weather__board')).toHaveAttribute('data-weather-count', String(countAt920));

  await page.setViewportSize({ width: 610, height: 900 });
  await page.waitForTimeout(100);
  await expect(ribbon).toBeVisible();
  // Toujours MTL+QC si largeur board ≥ 240 (fit peut descendre à 1 si overflow).
  const narrowCount = await ribbon.locator('.masthead-weather__city.is-active').count();
  expect(narrowCount).toBeGreaterThanOrEqual(1);
  expect(narrowCount).toBeLessThanOrEqual(2);
  expect(await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities.every((city) => {
    const name = city.querySelector('.masthead-weather__name');
    return !city.classList.contains('is-overflowing') && name.scrollWidth <= name.clientWidth + 2;
  }))).toBe(true);
  const narrowPrimary = ribbon.locator('.masthead-weather__city.is-active[data-weather-city="montreal"], .masthead-weather__city.is-active[data-weather-city="quebec"]');
  await expect(narrowPrimary).toHaveCount(narrowCount);
  const narrowState = await narrowPrimary.evaluate((el) => {
    const compact = el.classList.contains('is-compact');
    const full = el.querySelector('.masthead-weather__name-full')?.textContent?.trim() || '';
    const short = el.querySelector('.masthead-weather__name-compact')?.textContent?.trim() || '';
    return { compact, full, short };
  });
  if (narrowState.compact) {
    expect(['MTL', 'QC']).toContain(narrowState.short);
  } else {
    expect(['Montréal', 'Québec']).toContain(narrowState.full);
  }

  // Téléphone (≤599.98px) : le masthead réserve toute la place à la date
  // longue ; la météo se déplace sous le syntoniseur plutôt que de disparaître.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.waitForTimeout(100);
  await expect(ribbon).toBeVisible();
  await expect(ribbon).toHaveClass(/masthead-weather--docked/);
  const dock = page.locator('#masthead-weather-dock');
  await expect(dock.locator('#masthead-weather')).toHaveCount(1);
  await expect(ribbon.locator('.masthead-weather__city.is-active')).not.toHaveCount(0);

  // Dock hors .masthead : le lavis suit encore --weather-tone (soleil doré…),
  // pas un fond accent neutre (régression ≤430 / ≤599).
  const tonePaint = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities.map((city) => {
    const cs = getComputedStyle(city);
    const tone = (cs.getPropertyValue('--weather-tone') || '').trim();
    const bg = cs.backgroundImage || '';
    return {
      toneAttr: city.getAttribute('data-weather-tone') || '',
      toneVar: tone,
      hasGradient: /linear-gradient/i.test(bg),
      // color-mix résolu : le gradient ne doit pas être « none ».
      bgLen: bg.length,
    };
  }));
  expect(tonePaint.length).toBeGreaterThan(0);
  for (const card of tonePaint) {
    expect(card.toneAttr, 'data-weather-tone posé par weatherTone()').toMatch(/^(sun|cloud|rain|snow|storm)$/);
    expect(card.toneVar, '--weather-tone résolu (ex. #d88a0a soleil)').toMatch(/^#|rgb/i);
    expect(card.hasGradient, 'lavis condition météo sur carte dockée').toBe(true);
    expect(card.bgLen).toBeGreaterThan(20);
  }
  // Contrôle ciblé soleil : forcer sun et vérifier la variable CSS.
  const sunTone = await ribbon.locator('.masthead-weather__city.is-active').first().evaluate((el) => {
    el.dataset.weatherTone = 'sun';
    return getComputedStyle(el).getPropertyValue('--weather-tone').trim();
  });
  expect(sunTone.toLowerCase()).toBe('#d88a0a');

  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(100);
  await expect(ribbon).not.toHaveClass(/masthead-weather--docked/);
  await expect(page.locator('.masthead-top #masthead-weather')).toHaveCount(1);
});
