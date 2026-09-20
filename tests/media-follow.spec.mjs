import { expect, test } from '@playwright/test';

test.describe('suivi des médias et canaux', () => {
  test('une fiche permet de suivre puis de ne plus suivre, avec persistance', async ({ page }) => {
    await page.goto('/journaux/lexemplaire/', { waitUntil: 'domcontentloaded' });
    const button = page.locator('[data-media-follow]').first();
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).toContainText('Suivre');

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toContainText('Suivi');

    const stored = await page.evaluate(() => localStorage.getItem('radar-media-follows-v1'));
    expect(stored).toContain('lexemplaire');

    await page.reload({ waitUntil: 'domcontentloaded' });
    const again = page.locator('[data-media-follow]').first();
    await expect(again).toHaveAttribute('aria-pressed', 'true');

    await again.click();
    await expect(again).toHaveAttribute('aria-pressed', 'false');
    await expect(again).toContainText('Suivre');
  });

  test('sans URL Google Actualités, le canal n’apparaît pas', async ({ page }) => {
    await page.goto('/journaux/lexemplaire/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('link', { name: /Google Actualités/ })).toHaveCount(0);
    await expect(page.locator('a[href*="news.google.com/search"]')).toHaveCount(0);
  });

  test('un canal registre (Instagram) s’affiche et quitte le site', async ({ page }) => {
    await page.goto('/journaux/le-polyscope/', { waitUntil: 'domcontentloaded' });
    const instagram = page.getByRole('link', { name: 'Instagram' });
    await expect(instagram).toBeVisible();
    await expect(instagram).toHaveAttribute('href', /instagram\.com\/polyscope_aep/);
    await expect(instagram).toHaveAttribute('target', '_blank');
    await expect(instagram).toHaveAttribute('rel', /noopener/);
  });

  test('un article du fil mène toujours à la source originale', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const article = page.locator('#news-list a.article').first();
    await expect(article).toBeVisible();
    const href = await article.getAttribute('href');
    expect(href).toMatch(/^https?:\/\//);
    expect(href).not.toMatch(/le-radar\.ca\/journaux\//);
    expect(href).not.toMatch(/le-radar\.ca\/articles\//);
  });

  test('le filtre Suivis n’apparaît qu’après un suivi', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-source="followed"]')).toHaveCount(0);

    await page.evaluate(() => {
      localStorage.setItem('radar-media-follows-v1', JSON.stringify({ v: 1, ids: ['quartier-libre'] }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('#news-list[data-ready="1"]').count(), { timeout: 15_000 }).toBe(1);
    await expect(page.locator('[data-source="followed"]')).toBeVisible();
    await page.locator('[data-source="followed"]').click();
    await expect(page.locator('#news-list')).toHaveAttribute('data-mode', 'followed');
  });
});
