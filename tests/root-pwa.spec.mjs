/**
 * Accueil LE-RADAR.ca — manifeste installable, au même rang que les mini-apps.
 *
 * Tourne dans le projet `pwa` : on lit le manifeste servi, pas seulement le
 * fichier git. Chromium n'offre « Installer » dans la barre d'adresse que si
 * 192 + 512 PNG existent en entrées `any` et `maskable` séparées.
 */
import { expect, test } from '@playwright/test';

test('manifeste racine : id, icônes dédiées, fichiers joignables', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href, 'l’accueil doit porter le manifeste racine').toMatch(/manifest\.json$/);

  const manifest = await page.evaluate(async () => (await fetch('manifest.json')).json());
  expect(manifest.id).toBe('/');
  expect(manifest.scope).toBe('./');
  expect(manifest.start_url).toBe('./');
  expect(manifest.display).toBe('standalone');

  for (const icon of manifest.icons) {
    if (!icon.purpose) continue;
    expect(
      icon.purpose.trim().split(/\s+/).length,
      `${icon.src} : purpose combiné interdit`,
    ).toBe(1);
  }

  const png = (purpose, size) =>
    manifest.icons.some((i) => i.type === 'image/png' && i.sizes === size && i.purpose === purpose);
  expect(png('any', '192x192'), 'PNG 192 any').toBe(true);
  expect(png('maskable', '192x192'), 'PNG 192 maskable').toBe(true);
  expect(png('any', '512x512'), 'PNG 512 any').toBe(true);
  expect(png('maskable', '512x512'), 'PNG 512 maskable').toBe(true);

  for (const icon of manifest.icons) {
    const status = await page.evaluate(async (src) => (await fetch(src)).status, icon.src);
    expect(status, `icône ${icon.src} introuvable`).toBe(200);
  }
});
