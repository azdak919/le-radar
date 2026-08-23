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
      .toMatch(/LE-RADAR|–|reçoit|à|contre|Prochain|Aujourd|Sports étudiants|Journaux/i);
    const lockup = page.locator('.ad-lockup');
    await expect(lockup.locator('.ad-logo')).toBeVisible();
    await expect(lockup.locator('.ad-word')).toHaveText('LE-RADAR.ca');
    await expect(page.locator('#ad-tag img')).toHaveCount(0);
    expect(messages).toEqual([]);
    const href = await page.locator('#ad').getAttribute('href');
    expect(href).toMatch(/\/sports\//);
    expect(href).toMatch(/[?&]sport=/);
    expect(href).toMatch(/[?&]team=/);
  });

  test('tous les formats IAB portent « Sports étudiants »', async ({ page }) => {
    for (const fmt of ['300x250', '728x90', '320x50', '336x280', '300x600', '160x600']) {
      const [w, h] = fmt.split('x').map(Number);
      await page.setViewportSize({ width: w + 24, height: h + 24 });
      await page.goto(`/sports-ad-embed.html?fmt=${fmt}&still=1`, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => page.locator('#ad-front').innerText(), { timeout: 15_000 })
        .toMatch(/Sports étudiants/i);
      const box = await page.locator('#ad').boundingBox();
      expect(box?.width, fmt).toBeGreaterThan(w * 0.9);
      expect(box?.height, fmt).toBeGreaterThan(h * 0.85);
    }
  });

  test('carte marque : lockup + nom complet', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 400 });
    await page.goto('/sports-ad-embed.html?fmt=300x250&face=brand', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#ad-front .ad-brand-lockup .ad-logo')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#ad-front .ad-brand-lockup .ad-word')).toHaveText('LE-RADAR.ca');
    await expect(page.locator('#ad-front')).toContainText('Le Réseau Académique de Découverte et d’Agrégation de Ressources');
    await expect(page.locator('#ad')).toHaveAttribute('href', /\/$|\.html$/);
  });

  test('clic match : /sports/ ouvre l’équipe et la ligne du match', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 400 });
    await page.goto('/sports-ad-embed.html?fmt=300x250', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('#ad').getAttribute('href') || '', { timeout: 15_000 })
      .toMatch(/\/sports\//);
    const href = await page.locator('#ad').getAttribute('href');
    const target = new URL(href, 'http://127.0.0.1');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(target.pathname + target.search + target.hash, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.sports-panel.is-spotlight')).toBeVisible({ timeout: 15_000 });
    if (target.searchParams.get('game')) {
      await expect(page.locator('.sports-result.is-spotlight')).toBeVisible({ timeout: 10_000 });
    }
  });

  test('page iFrames : formats IAB + copie + thème, sans Flipper', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/iframes/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText(/iFrames/);
    await expect(page.locator('body')).not.toContainText(/Flipper|phosphore|Sports SAT/i);
    await expect(page.locator('#snippet-radio')).toContainText('tuner-embed.html?surface=bar');

    const radio = page.locator('iframe[data-embed-kind="radio"]');
    const radioFrame = radio.contentFrame();
    await expect(radioFrame.locator('#tuner-play')).toBeVisible({ timeout: 15_000 });
    await expect(radioFrame.locator('#tuner-select')).toBeVisible();
    await expect(radioFrame.locator('html')).toHaveAttribute('data-surface', 'bar');
    await expect(page.locator('#snippet-300x250')).toContainText('sports-ad-embed.html?fmt=300x250');
    await expect(page.locator('iframe[data-embed-kind="sports-ad"]')).toHaveCount(6);

    const mpu = page.locator('#fmt-300x250 iframe');
    const frame = mpu.contentFrame();
    await expect(frame.locator('#ad-front')).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(400);
    await expect(radioFrame.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(radioFrame.locator('#tuner-play')).toBeVisible();
    const lightPre = await page.locator('.iframe-snippet pre').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(400);
    await expect(radioFrame.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkPre = await page.locator('.iframe-snippet pre').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightPre).not.toBe(darkPre);

    const copyBtn = page.getByRole('button', { name: /Copier le code radio|Copié/ });
    await copyBtn.click();
    await expect(copyBtn).toHaveText(/Copié/, { timeout: 5_000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toMatch(/tuner-embed\.html/);
  });
});
