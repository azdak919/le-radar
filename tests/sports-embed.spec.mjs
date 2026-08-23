import { expect, test } from '@playwright/test';

test.describe('Embed sports CTA', () => {
  test('sports-embed hydrate des cartes CTA et une promo LE-RADAR', async ({ page }) => {
    const messages = [];
    page.on('pageerror', (error) => messages.push(error.message));

    const posted = [];
    await page.addInitScript(() => {
      window.__radarSportsPosts = [];
      const orig = window.parent.postMessage.bind(window.parent);
      window.parent.postMessage = (data, origin) => {
        try { window.__radarSportsPosts.push(data); } catch { /* */ }
        return orig(data, origin);
      };
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sports-embed.html?every=2&n=6', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-embed', 'sports');

    await expect.poll(() => page.locator('#masthead-sports-strip .sports-chip--cta').count(), {
      timeout: 15_000,
    }).toBeGreaterThan(0);

    const brand = page.locator('.sports-chip--cta').filter({
      has: page.locator('.sports-chip__cta-tag--brand'),
    });
    await expect(brand.first()).toBeVisible();
    await expect(brand.first()).toHaveAttribute('href', /\/$/);
    await expect(brand.first()).toHaveAttribute('target', '_blank');
    await expect(brand.first().locator('.sports-chip__cta-text')).toHaveText(/LE-RADAR\.ca/);

    await expect.poll(() => page.evaluate(() => (window.__radarSportsPosts || [])
      .some((d) => d && d.type === 'radar-sports-embed' && Number(d.height) >= 56))).toBe(true);

    expect(messages).toEqual([]);
  });

  test('page iFrames : aperçus + snippets copiables', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto('/iframes/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1')).toHaveText(/iFrames/);
    await expect(page.locator('#snippet-radio')).toContainText('tuner-embed.html');
    await expect(page.locator('#snippet-sports')).toContainText('sports-embed.html');
    await expect(page.locator('iframe[data-embed-kind="radio"]')).toHaveCount(1);
    await expect(page.locator('iframe[data-embed-kind="sports"]')).toHaveCount(1);

    const sportsFrame = page.locator('iframe[data-embed-kind="sports"]');
    await expect(sportsFrame).toHaveAttribute('src', /sports-embed\.html/);
    const frame = sportsFrame.contentFrame();
    await expect(frame.locator('.sports-chip--cta').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Copier le code radio' }).click();
    await expect(page.getByRole('button', { name: /Copié/ })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(/tuner-embed\.html/);
    expect(clip).toMatch(/le-radar\.ca/);
  });
});
