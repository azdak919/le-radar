import { expect, test } from '@playwright/test';

const routes = [
  { path: '/', marker: '#news-list' },
  { path: '/feeds.html', marker: 'main' },
  { path: '/pomo/', marker: '#pomo-container', embed: true },
  { path: '/solitaire/', marker: '.page-layout', embed: true },
];

for (const viewport of [
  { name: 'bureau', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  for (const route of routes) {
    test(`${viewport.name} ${route.path}`, async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(route.marker).first()).toBeVisible();
      await expect(page).toHaveTitle(/Radar|Solitaire|Pomo|Flux/i);

      if (route.path === '/') {
        await expect(page.locator('.article').first()).toBeVisible();
      }
      if (route.embed) {
        const iframe = page.locator('#radar-embed');
        await expect(iframe).toBeVisible();
        await expect(iframe).toHaveAttribute('src', '../tuner-embed.html');
        await expect(iframe.contentFrame().locator('#tuner-play')).toBeVisible();
      }
      if (route.path === '/pomo/' || route.path === '/solitaire/') {
        await expect(page.locator('link[rel="icon"][sizes="32x32"]'))
          .toHaveAttribute('href', /favicon-32x32\.png\?v=3$/);
        await expect(page.locator('link[rel="icon"][sizes="96x96"]'))
          .toHaveAttribute('href', /favicon-96x96\.png\?v=3$/);
        const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
        const manifestText = await page.evaluate((url) => fetch(url).then((r) => r.text()), manifest);
        expect(manifestText).not.toContain('favicon.svg');
        expect(manifestText).toContain('icon-192.png');
      }

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);
      expect(pageErrors).toEqual([]);
    });
  }
}

test('maintenance : aperçu local, retour en ligne et easter egg persistant', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Localement, la page reste ouverte afin de pouvoir la tester sans redirection.
  await page.goto('/offline.html?preview=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#reconnect')).toContainText('Aperçu local');
  await page.waitForTimeout(1300);
  await expect(page).toHaveURL(/offline\.html\?preview=1/);

  // En production, un shell principal disponible ramène bien vers l'accueil.
  await page.route(/\/index\.html\?_probe=/, (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><main id="bg-photo-layer">Le fil étudiant</main>',
  }));
  await page.goto('/offline.html?live=1', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === '/', { timeout: 4000 });
  await page.unroute(/\/index\.html\?_probe=/);

  // L'easter egg est volontairement persistant, même si l'accueil est disponible.
  await page.goto('/easter-egg.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#game')).toBeVisible();
  await expect(page).toHaveURL(/offline\.html\?easter-egg=1/);
  await page.waitForTimeout(1300);
  await expect(page).toHaveURL(/offline\.html\?easter-egg=1/);
  await expect(page.locator('#reconnect')).toContainText('Aperçu local');
  expect(pageErrors).toEqual([]);
});

test.describe('maintenance hors ligne', () => {
  test.use({ serviceWorkers: 'allow' });

  test('reste jouable après une coupure réseau', async ({ page, context }) => {
    await page.goto('/offline.html?preview=1', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('#reconnect')).toContainText('Aperçu local');
  });
});
