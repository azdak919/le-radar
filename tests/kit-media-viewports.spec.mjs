import { expect, test } from '@playwright/test';

test.describe('kit média — affiches', () => {
  test('iPad : l’affiche générique occupe la rangée', async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 });
    await page.goto('/kit-media/', { waitUntil: 'domcontentloaded' });
    const card = page.locator('#kit-poster-grid .kit-card--feature');
    const img = card.locator('img');
    await expect(card).toBeVisible();
    const c = await card.boundingBox();
    const g = await page.locator('#kit-poster-grid').boundingBox();
    const i = await img.boundingBox();
    expect(c.width / g.width).toBeGreaterThan(0.85);
    expect(i.width / c.width).toBeGreaterThan(0.9);
    expect(i.height).toBeGreaterThan(i.width);
  });

  test('PDF 11 × 17 se télécharge', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/kit-media/', { waitUntil: 'domcontentloaded' });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#kit-poster-grid .kit-card--feature .kit-dl a').first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/le-radar-affiche-11x17\.pdf$/);
  });
});
