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
  // Bureau : 3 cartes — slot 0 = ancre MTL **ou** QC exclusive ; 1–2 = secondaires.
  await expect(ribbon.locator('.masthead-weather__city.is-active')).toHaveCount(3);
  const fill = await ribbon.evaluate((el) => {
    const board = el.querySelector('.masthead-weather__board');
    return {
      weatherW: el.clientWidth,
      boardW: board?.clientWidth || 0,
    };
  });
  expect(fill.weatherW, 'colonne météo mesurable').toBeGreaterThan(400);
  expect(fill.boardW, 'le ruban occupe la colonne (pas shrink-wrap)').toBeGreaterThan(fill.weatherW - 8);
  const activePrimary = ribbon.locator('.masthead-weather__city.is-active[data-weather-city="montreal"], .masthead-weather__city.is-active[data-weather-city="quebec"]');
  await expect(activePrimary).toHaveCount(1);
  // Ancre = campus + 1 secondaire campus + 1 nation (ou 2 campus si nation absente).
  await expect(ribbon.locator('.masthead-weather__city.is-active[data-weather-group="campus"]')).toHaveCount(2);
  await expect(ribbon.locator('.masthead-weather__city.is-active[data-weather-group="nation"]')).toHaveCount(1);
  await expect(activePrimary).not.toHaveClass(/is-compact/);
  const primaryLabel = await activePrimary.locator('.masthead-weather__name-full').evaluate(
    (el) => (el.textContent || '').trim(),
  );
  expect(['Montréal', 'Québec']).toContain(primaryLabel);
  const activeBoxes = (await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities
    .map((city) => city.getBoundingClientRect())
    .sort((a, b) => a.x - b.x)
    .map(({ width }) => width)));
  expect(Math.min(...activeBoxes)).toBeGreaterThanOrEqual(90);
  expect(activeBoxes[0]).toBeGreaterThanOrEqual(120);
  const initialPrimary = await activePrimary.evaluate((el) => ({ id: el.dataset.weatherCity, href: el.href }));
  expect(initialPrimary.href).toBe(`https://www.meteomedia.com/fr/ville/ca/quebec/${initialPrimary.id}/actuelle`);
  await expect(ribbon.locator('[data-weather-city="vaudreuil-dorion"]')).toHaveAttribute(
    'href',
    'https://www.meteomedia.com/fr/ville/ca/quebec/vaudreuil-dorion/actuelle',
  );
  await expect(ribbon.locator("[data-weather-city=\"odanak\"]")).toHaveAttribute(
    "href",
    "https://www.meteomedia.com/fr/ville/ca/quebec/odanak-12/actuelle",
  );
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
  const translatedPrimary = await activePrimary.evaluate((el) => ({ id: el.dataset.weatherCity, href: el.href }));
  expect(translatedPrimary.href).toBe(`https://www.meteomedia.com/fr/ville/ca/quebec/${translatedPrimary.id}/actuelle`);
  const [weatherBox, actionsBox] = await Promise.all([
    ribbon.boundingBox(), page.locator('.masthead-actions').boundingBox(),
  ]);
  expect(actionsBox.x).toBeGreaterThan(weatherBox.x + weatherBox.width);

  // Rotation forcée : leave (~280ms) + arrive — slot 0 alterne MTL↔QC.
  const beforeRotation = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities.map((city) => city.dataset.weatherCity));
  const leaveAnimOk = await page.evaluate(() => {
    if (typeof rotateOneMastheadWeatherCard !== 'function') return false;
    rotateOneMastheadWeatherCard();
    const leaving = document.querySelector('.masthead-weather__city.is-leaving');
    if (!leaving) return false;
    return /weather-tile-leave/i.test(getComputedStyle(leaving).animationName || '');
  });
  expect(leaveAnimOk, 'is-leaving + weather-tile-leave au départ du swap').toBe(true);
  await expect
    .poll(async () => ribbon.locator('.masthead-weather__city.is-active').evaluateAll(
      (cities) => cities.map((city) => city.dataset.weatherCity),
    ), { timeout: 1200 })
    .not.toEqual(beforeRotation);
  const afterRotation = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities.map((city) => city.dataset.weatherCity));
  expect(afterRotation).toHaveLength(beforeRotation.length);
  expect(['montreal', 'quebec']).toContain(afterRotation[0]);
  // 2ᵉ tick : vérifier is-arriving après la leave (swap DOM déjà fait).
  const arriveAnimOk = await page.evaluate(async () => {
    if (typeof rotateOneMastheadWeatherCard !== 'function') return false;
    rotateOneMastheadWeatherCard();
    await new Promise((r) => setTimeout(r, 320));
    const arriving = document.querySelector('.masthead-weather__city.is-arriving');
    if (!arriving) return false;
    return /weather-tile-arrive/i.test(getComputedStyle(arriving).animationName || '');
  });
  expect(arriveAnimOk, 'is-arriving + weather-tile-arrive après leave').toBe(true);

  // Bureau large : multi-cartes dans le mât.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  await expect(ribbon).not.toHaveClass(/masthead-weather--docked/);
  const deskCount = await ribbon.locator('.masthead-weather__city.is-active').count();
  expect(deskCount).toBe(3);
  await expect(ribbon.locator('.masthead-weather__city.is-active[data-weather-city="montreal"], .masthead-weather__city.is-active[data-weather-city="quebec"]')).toHaveCount(1);

  // Tablette dockée : ancre + secondaires (board pleine largeur).
  await page.setViewportSize({ width: 920, height: 900 });
  await page.waitForTimeout(150);
  await expect(ribbon).toHaveClass(/masthead-weather--docked/);
  const tabCount = await ribbon.locator('.masthead-weather__city.is-active').count();
  expect(tabCount).toBeGreaterThanOrEqual(2);
  expect(tabCount).toBeLessThanOrEqual(4);
  await expect(ribbon.locator('.masthead-weather__city.is-active[data-weather-city="montreal"], .masthead-weather__city.is-active[data-weather-city="quebec"]')).toHaveCount(1);

  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(150);
  await expect(ribbon).toHaveClass(/masthead-weather--docked/);
  await expect(page.locator('#masthead-weather-dock #masthead-weather')).toHaveCount(1);

  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForTimeout(150);
  await expect(ribbon).toHaveClass(/masthead-weather--docked/);
  // Docké : plafond 3 (pas 4) pour limiter le marquee des secondaires.
  const tab768 = await ribbon.locator('.masthead-weather__city.is-active').count();
  expect(tab768).toBeGreaterThanOrEqual(2);
  expect(tab768).toBeLessThanOrEqual(3);

  // 430 docké : board pleine largeur → multi-cartes (pas 1 carte flottante).
  await page.setViewportSize({ width: 430, height: 900 });
  await page.waitForTimeout(200);
  await expect(ribbon).toHaveClass(/masthead-weather--docked/);
  expect(await ribbon.locator('.masthead-weather__city.is-active').count()).toBeGreaterThanOrEqual(2);
  const boardW430 = await ribbon.locator('.masthead-weather__board').evaluate((el) => el.clientWidth);
  expect(boardW430).toBeGreaterThanOrEqual(300);

  await page.setViewportSize({ width: 320, height: 900 });
  await page.waitForTimeout(100);
  await expect(ribbon).toHaveClass(/masthead-weather--docked/);
  const dock = page.locator('#masthead-weather-dock');
  await expect(dock.locator('#masthead-weather')).toHaveCount(1);
  await expect(ribbon.locator('.masthead-weather__city.is-active')).not.toHaveCount(0);

  // Dock hors .masthead : le lavis suit encore --weather-tone.
  const tonePaint = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => cities.map((city) => {
    const cs = getComputedStyle(city);
    const tone = (cs.getPropertyValue('--weather-tone') || '').trim();
    const bg = cs.backgroundImage || '';
    return {
      toneAttr: city.getAttribute('data-weather-tone') || '',
      toneVar: tone,
      hasGradient: /linear-gradient/i.test(bg),
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
  const sunTone = await ribbon.locator('.masthead-weather__city.is-active').first().evaluate((el) => {
    el.dataset.weatherTone = 'sun';
    return getComputedStyle(el).getPropertyValue('--weather-tone').trim();
  });
  expect(sunTone.toLowerCase()).toBe('#d88a0a');

  // Bureau large : météo de retour dans le mât.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  await expect(ribbon).not.toHaveClass(/masthead-weather--docked/);
  await expect(page.locator('.masthead-top #masthead-weather')).toHaveCount(1);
});

test('wide E : météo secondaire tourne de gauche à droite, MTL/QC fixes', async ({ page }) => {
  await page.route('https://le-radar-weather.azdak.workers.dev/v1/forecast**', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(weather),
  }));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  const ribbon = page.locator('#masthead-weather');
  await expect(ribbon.locator('.masthead-weather__city.is-active').first()).toBeVisible({ timeout: 10_000 });

  const visualIds = () => ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => (
    cities
      .map((el) => ({ id: el.dataset.weatherCity, x: el.getBoundingClientRect().x }))
      .sort((a, b) => a.x - b.x)
      .map((row) => row.id)
  ));

  await expect.poll(async () => (await visualIds()).length, { timeout: 8_000 }).toBeGreaterThan(3);
  const start = await visualIds();
  expect(start[0], 'Montréal à gauche').toBe('montreal');
  expect(start[1], 'Québec en 2e').toBe('quebec');

  const secondary = start.length - 2;
  let prev = start;
  for (let i = 0; i < secondary; i += 1) {
    const before = prev.join(',');
    await page.evaluate(() => {
      if (typeof rotateOneMastheadWeatherCard === 'function') rotateOneMastheadWeatherCard();
    });
    await expect.poll(async () => (await visualIds()).join(','), { timeout: 2000 })
      .not.toBe(before);
    const now = await visualIds();
    expect(now[0]).toBe('montreal');
    expect(now[1]).toBe('quebec');
    expect(now).toHaveLength(prev.length);
    const changed = [];
    for (let s = 2; s < now.length; s += 1) {
      if (now[s] !== prev[s]) changed.push(s);
    }
    expect(changed, `vague L→R au tick ${i} (prev=${prev.slice(2)} now=${now.slice(2)})`).toEqual([2 + i]);
    prev = now;
  }
});

test('wide E : météo secondaire cascade puis pause', async ({ page }) => {
  await page.route('https://le-radar-weather.azdak.workers.dev/v1/forecast**', (route) => {
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(weather),
    });
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  const ribbon = page.locator('#masthead-weather');
  await expect.poll(async () => ribbon.locator('.masthead-weather__city.is-active').count(), { timeout: 10_000 })
    .toBeGreaterThan(3);

  const start = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => (
    cities
      .map((el) => ({ id: el.dataset.weatherCity, x: el.getBoundingClientRect().x }))
      .sort((a, b) => a.x - b.x)
      .map((row) => row.id)
  ));
  expect(start[0]).toBe('montreal');
  expect(start[1]).toBe('quebec');

  const armed = await page.evaluate(() => {
    if (typeof scheduleWeatherCascade !== 'function') return false;
    scheduleWeatherCascade({ firstHold: false });
    return true;
  });
  expect(armed, 'scheduleWeatherCascade disponible').toBe(true);

  const secondary = start.length - 2;
  await page.waitForTimeout(Math.min(2800, 480 * Math.max(2, secondary)));
  const now = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) => (
    cities
      .map((el) => ({ id: el.dataset.weatherCity, x: el.getBoundingClientRect().x }))
      .sort((a, b) => a.x - b.x)
      .map((row) => row.id)
  ));
  expect(now[0]).toBe('montreal');
  expect(now[1]).toBe('quebec');
  expect(now).toHaveLength(start.length);
  const flipped = now.slice(2).filter((id, i) => id !== start[2 + i]).length;
  expect(flipped, 'plusieurs secondaires changent pendant la vague, pas une seule').toBeGreaterThan(1);
});

test('wide E : ≥2560 ajoute une carte météo et resserre les slots', async ({ page }) => {
  await page.route('https://le-radar-weather.azdak.workers.dev/v1/forecast**', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(weather),
  }));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  const ribbon = page.locator('#masthead-weather');
  await expect(ribbon.locator('.masthead-weather__city.is-active').first()).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.locator('#masthead-sports-strip .sports-chip--match').count(), { timeout: 8000 })
    .toBeGreaterThan(0);

  const countAt = async (width) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForTimeout(180);
    return ribbon.locator('.masthead-weather__city.is-active').count();
  };

  const at1920 = await countAt(1920);
  const at2560 = await countAt(2560);
  expect(at2560, `2560 doit faire +1 vs 1920 (${at1920})`).toBe(at1920 + 1);

  const widths = await ribbon.locator('.masthead-weather__city.is-active').evaluateAll((cities) =>
    cities.map((el) => Math.round(el.getBoundingClientRect().width)),
  );
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(148);
  const spread = Math.max(...widths) - Math.min(...widths);
  expect(spread, `slots uniformes attendus, got ${widths}`).toBeLessThanOrEqual(4);
});
