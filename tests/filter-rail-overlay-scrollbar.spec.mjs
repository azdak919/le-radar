import { test, expect } from '@playwright/test';

// Barres superposées (Chrome Fluent/overlay, macOS) : la gouttière « stable »
// ne réserve rien. Le pouce ne doit pas couvrir le bord droit des pastilles.
test.use({ launchOptions: { args: ['--enable-features=OverlayScrollbar'] } });

test('rail 1440 : barre superposée, marge pour le pouce, largeur stable @ci-critical', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('https://**/*', (r) => r.abort());
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#news-filters-panel')).toHaveAttribute('data-ready', '1');
  const overlay = await page.evaluate(() => document.documentElement.dataset.overlayScrollbars === '1');
  test.skip(!overlay, 'Chromium sans barres superposées dans cet environnement');
  const list = page.locator('#news-filters');
  const metrics = () => list.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const b = el.querySelector('.filter-btn').getBoundingClientRect();
    return { client: el.clientWidth, offset: el.offsetWidth, gap: r.right - b.right, button: b.width };
  });
  const closed = await metrics();
  const toggle = page.locator('.filters-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const expanded = await metrics();
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(expanded.offset - expanded.client).toBe(0); // vraiment superposée
  expect(expanded.gap).toBeGreaterThanOrEqual(8);
  expect(expanded.button).toBe(closed.button);
});
