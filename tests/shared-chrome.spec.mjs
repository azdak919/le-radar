/**
 * D18 — chrome partagé (footer, thème, marque) sur routes publiques.
 * Preuve structurelle + alignement, pas de snapshot pixel (flake).
 */
import { expect, test } from '@playwright/test';

const ROUTES = [
  { path: '/', name: 'accueil' },
  { path: '/feeds.html', name: 'rss' },
  { path: '/radios/chyz/', name: 'fiche-radio' },
  { path: '/journaux/la-pige/', name: 'fiche-journal' },
  { path: '/offline.html', name: 'maintenance', maintenance: true },
];

for (const path of ['/en/', '/sports/', '/journaux/exil/']) {
  test(`barre sportive sans ReferenceError — ${path}`, async ({ page }) => {
    const freshnessErrors = [];
    page.on('pageerror', (error) => {
      if (/RadarSportsFreshness/.test(String(error))) freshnessErrors.push(String(error));
    });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const strip = page.locator('#masthead-sports-strip');
    await expect(strip).toBeVisible({ timeout: 12_000 });
    await expect(strip).not.toHaveAttribute('hidden', '');
    await expect(strip.locator('.sports-chip').first()).toBeVisible({ timeout: 12_000 });
    expect(freshnessErrors).toEqual([]);
  });
}

for (const route of ROUTES) {
  const critical = route.path === '/' ? ' @ci-critical' : '';
  test(`chrome partagé — ${route.name} (clair)${critical}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    const foot = page.locator('.site-foot').first();
    await expect(foot).toBeVisible();
    await expect(foot).toContainText('LE-RADAR');
    await expect(foot.locator('.site-foot__logo, .site-foot__brand, .site-foot__contact').first()).toBeVisible();

    if (!route.maintenance) {
      await expect(page.locator('#theme-toggle, .theme-toggle').first()).toBeVisible();
      // Pas d’iframe lecteur hors exceptions
      await expect(page.locator('#radar-embed')).toHaveCount(0);
      await expect.poll(() => page.locator('#masthead-weather').count()).toBe(1);
      await expect.poll(() => page.locator('#masthead-sports-strip').count()).toBe(1);
      await expect(page.locator('#masthead-weather .masthead-weather__city.is-active').first())
        .toBeVisible({ timeout: 12_000 });
      await expect(page.locator('#masthead-sports-strip')).not.toHaveAttribute('hidden', '');
      await expect(page.locator('#masthead-sports-strip .sports-chip').first())
        .toBeVisible({ timeout: 12_000 });
    } else {
      await expect(page.locator('.site-foot--maintenance')).toBeVisible();
    }
  });

  test(`chrome partagé — ${route.name} (sombre)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const foot = page.locator('.site-foot').first();
    await expect(foot).toBeVisible();
    await expect(foot).toContainText('LE-RADAR');
    // Contraste : le footer ne doit pas être transparent à 0 (texte invisible)
    const opacity = await foot.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.9);
  });
}

const FOOTER_AIR_ROUTES = [
  '/',
  '/horaires/',
  '/radios/chyz/',
  '/medias/',
  '/sports/',
  '/feeds.html',
  '/kit-media/',
  '/affiches/',
  '/journaux/la-pige/',
];

for (const path of FOOTER_AIR_ROUTES) {
  test(`footer : filet pas collé au texte — ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const foot = page.locator('.site-foot').first();
    await expect(foot).toBeVisible();
    const air = await foot.evaluate((el) => {
      const author = el.querySelector('.site-foot__author, .site-foot__wordmark');
      if (!author) return { pad: 0, gap: 0 };
      const pad = parseFloat(getComputedStyle(el).paddingTop);
      const gap = author.getBoundingClientRect().top - el.getBoundingClientRect().top;
      return { pad, gap };
    });
    expect(air.pad, `${path} : padding-top`).toBeGreaterThanOrEqual(24);
    expect(air.gap, `${path} : air sous le filet`).toBeGreaterThanOrEqual(24);
  });
}

test('tuner bureau : fond d’été toute l’année @ci-critical', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const tuner = page.locator('#tuner');
  await expect(tuner).toBeVisible();
  const summer = 'rgb(16, 24, 22)'; // #101816
  const bg = await tuner.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg, `fond courant ${bg}`).toBe(summer);
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-uni-session', 'automne');
  });
  const forced = await tuner.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(forced, 'automne ne doit plus teinter la barre').toBe(summer);
});

const WORDMARK_FONT_ROUTES = ['/', '/affiches/', '/kit-media/', '/en/media-kit/', '/sports/'];

for (const path of WORDMARK_FONT_ROUTES) {
  test(`footer : mot-symbole Source Serif — ${path}`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const mark = page.locator('.site-foot__wordmark').first();
    await expect(mark).toBeVisible();
    const family = await mark.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family, `${path} : ${family}`).toMatch(/Source Serif/i);
    expect(family, `${path} : pas Inter`).not.toMatch(/Inter/i);
    const nested = await page.locator('main.seo-wire .site-foot').count();
    expect(nested, `${path} : pied hors de .seo-wire`).toBe(0);
  });
}
