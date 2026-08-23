import { expect, test } from '@playwright/test';

test.describe('Embed sports IAB', () => {
  test('300×250 montre une carte LE-RADAR (match ou marque)', async ({ page }) => {
    const messages = [];
    page.on('pageerror', (error) => messages.push(error.message));
    await page.setViewportSize({ width: 400, height: 400 });
    await page.goto('/sports-ad-embed.html?fmt=300x250', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-embed', 'sports-ad');
    await expect(page.locator('html')).toHaveAttribute('data-fmt', '300x250');
    await expect.poll(() => page.locator('#ad-front').innerText(), { timeout: 15_000 })
      .toMatch(/LE-RADAR|–|reçoit|contre|Prochain|Aujourd|Journaux/i);
    const lockup = page.locator('.ad-lockup');
    await expect(lockup.locator('.ad-logo')).toBeVisible();
    await expect(lockup.locator('.ad-word')).toHaveText('LE-RADAR.ca');
    await expect(page.locator('#ad-tag img')).toHaveCount(0);
    expect(messages).toEqual([]);
  });

  test('page iFrames : formats IAB + copie + thème, sans Flipper', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/iframes/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText(/iFrames/);
    await expect(page.locator('body')).not.toContainText(/Flipper|phosphore|Sports SAT/i);
    await expect(page.locator('#snippet-radio')).toContainText('tuner-embed.html');
    await expect(page.locator('#snippet-300x250')).toContainText('sports-ad-embed.html?fmt=300x250');
    await expect(page.locator('iframe[data-embed-kind="sports-ad"]')).toHaveCount(6);

    const mpu = page.locator('#fmt-300x250 iframe');
    const frame = mpu.contentFrame();
    await expect(frame.locator('#ad-front')).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(300);
    const lightPre = await page.locator('.iframe-snippet pre').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(300);
    const darkPre = await page.locator('.iframe-snippet pre').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightPre).not.toBe(darkPre);

    await page.getByRole('button', { name: 'Copier le code radio' }).click();
    await expect(page.getByRole('button', { name: /Copié/ })).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(/tuner-embed\.html/);
  });
});
