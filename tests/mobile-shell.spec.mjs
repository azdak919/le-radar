import { expect, test } from '@playwright/test';

test.describe('application mobile', () => {
  test('fil, favori et pas de défilement horizontal @ci-critical', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 700 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(size);
      await page.goto('/mobile/app/#/accueil', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
      await expect(page.locator('.card-title').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const title = (await page.locator('.card-title').first().innerText()).trim();
    await page.locator('.card').first().getByRole('button', { name: 'Enregistrer' }).click();
    await page.goto('/mobile/app/#/enregistres', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    await page.getByRole('link', { name: 'Explorer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Explorer' })).toBeVisible();
    await page.getByRole('link', { name: 'Recherche' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Recherche' })).toBeVisible();
  });

  test('fiche web noindex et lien vers la publication @ci-critical', async ({ page }) => {
    await page.goto('/mobile/app/#/accueil', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.card-title').first()).toBeVisible();
    const target = await page.evaluate(async () => {
      const news = await (await fetch('/news.json')).json();
      const item = news.items.find((entry) => entry && entry.title && entry.link && entry.source);
      return {
        id: window.RadarMobile.articleId(item.link),
        title: item.title.replace(/\s+/g, ' ').trim(),
        source: item.source,
      };
    });
    await page.goto(`/article/?id=${target.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('heading', { level: 1, name: target.title })).toBeVisible();
    const read = page.getByRole('link', { name: `Lire chez ${target.source}` });
    await expect(read).toBeVisible();
    await expect(read).toHaveAttribute('href', /^https:\/\//);
    await expect(read).toHaveAttribute('target', '_blank');
  });
});
