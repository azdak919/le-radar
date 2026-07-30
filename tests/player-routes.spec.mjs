/**
 * D17 — matrice navigateur : le lecteur s’initialise sur les routes clés.
 * Pas de lecture audio réelle (autoplay CI) : présence DOM + absence d’iframe
 * hors exceptions + zéro erreur console liée au lecteur.
 */
import { expect, test } from '@playwright/test';

const NATIVE_ROUTES = [
  '/',
  '/feeds.html',
  '/radios/chyz/',
  '/journaux/la-pige/',
  '/etablissements/universite-laval/',
  '/horaires/',
  '/medias/',
  '/en/',
];

const IFRAME_ROUTES = [
  { path: '/pomo/', label: 'pomo' },
  { path: '/solitaire/', label: 'solitaire' },
];

for (const path of NATIVE_ROUTES) {
  test(`lecteur natif sur ${path}`, async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(path, { waitUntil: 'domcontentloaded' });

    // feeds injecte le tuner via native-tuner.js (async)
    await expect.poll(async () => page.locator('#tuner').count(), { timeout: 12_000 })
      .toBe(1);
    await expect(page.locator('#radar-player')).toHaveCount(1);
    await expect(page.locator('#radar-embed')).toHaveCount(0);
    await expect(page.locator('#tuner-play')).toBeVisible({ timeout: 10_000 });

    const fatal = pageErrors.filter((e) => /radar|tuner|lecteur|audio/i.test(e));
    expect(fatal, fatal.join('\n')).toEqual([]);
  });
}

for (const { path, label } of IFRAME_ROUTES) {
  test(`iframe autorisée sur ${label}`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const embed = page.locator('#radar-embed');
    await expect(embed).toHaveCount(1);
    await expect(embed).toHaveAttribute('src', /tuner-embed\.html/);
    // Document de l’iframe initialisé
    await expect(embed).toHaveAttribute('src', /tuner-embed\.html/, { timeout: 10_000 });
    const frame = embed.contentFrame();
    await expect(frame.locator('#tuner-play')).toBeVisible({ timeout: 12_000 });
  });
}
