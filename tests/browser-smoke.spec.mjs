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

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);
      expect(pageErrors).toEqual([]);
    });
  }
}
