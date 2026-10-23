import { expect, test } from '@playwright/test';

test.describe('Embed sports IAB @ci-critical', () => {
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

});
