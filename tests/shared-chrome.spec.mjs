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

for (const route of ROUTES) {
  test(`chrome partagé — ${route.name} (clair)`, async ({ page }) => {
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
