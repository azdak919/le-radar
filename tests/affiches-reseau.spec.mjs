import { expect, test } from '@playwright/test';

/**
 * Une police ou une image qui échoue ne doit pas afficher
 * « A network error occurred. » ni bloquer le studio.
 */

test.describe('affiches — erreur réseau', () => {
  test('une police manquante n’empêche pas l’aperçu, message en français', async ({ page }) => {
    await page.route('**/assets/kit/fonts/langs/noto-sans-tc.woff2', (route) => route.abort('failed'));
    await page.route('**/assets/kit/fonts/noto-sans-symbols-copyleft.woff2', (route) => route.abort('failed'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/affiches/?modele=une&format=tabloid', { waitUntil: 'domcontentloaded' });
    /* Sur mobile les réglages s’ouvrent en premier : le canevas peut rester hors écran. */
    await expect.poll(async () => page.locator('#preview').getAttribute('data-state'), {
      timeout: 20000,
    }).toBe('pret');
    const status = page.locator('#status');
    await expect(status).not.toContainText(/network error|Failed to fetch|Load failed/i);
    await expect(status).not.toHaveText('Chargement…');
    await expect(status).not.toContainText('Chargement impossible');
    await expect(status).toContainText('11 × 17');
    const canvas = page.locator('#preview canvas');
    await expect.poll(async () => canvas.evaluate((el) => el.width * el.height), {
      timeout: 5000,
    }).toBeGreaterThan(0);
  });
});
