/**
 * Régression : le CSS du mât DOIT être chargé (style-masthead.css).
 * A capturé la panne @import ignoré → styles mât absents / météo inutilisable.
 */
import { expect, test } from '@playwright/test';

// Même forme de mock que masthead-weather.spec.mjs
const weather = [
  [24.8, 0, 1], [22.1, 1, 1], [20.4, 3, 1],
  [21.6, 61, 1], [19.2, 71, 1], [18.7, 0, 0],
  [23.3, 2, 1], [17.4, 63, 1], [21.7, 0, 1],
  [22.6, 0, 1], [21.4, 3, 1], [20.1, 2, 1], [19.7, 63, 1],
  [18.9, 61, 1], [21.8, 1, 1], [9.4, 3, 1], [20.6, 0, 1],
  [18.8, 61, 1], [22.9, 0, 1], [21.1, 2, 1],
  [20.3, 3, 1], [19.5, 61, 1], [18.9, 2, 1], [21.2, 0, 1],
  [20.8, 61, 1], [19.7, 3, 1], [21.4, 0, 1], [18.3, 63, 1], [24.6, 1, 1],
  [22.4, 1, 1],
  [19.6, 3, 1], [18.8, 61, 1], [16.1, 2, 1], [15.3, 63, 1], [10.4, 3, 1],
  [18.7, 0, 1], [17.9, 61, 1], [16.4, 3, 1], [15.8, 2, 1], [20.2, 0, 1],
  [18.6, 61, 1], [21.3, 1, 1], [20.1, 2, 1], [19.8, 3, 1], [17.5, 61, 1],
  [18.4, 3, 1], [13.7, 2, 1],
].map(([temperature_2m, weather_code, is_day]) => ({
  current: { temperature_2m, weather_code, is_day },
}));

test('style-masthead.css est chargé et le mât météo a une largeur utile', async ({ page }) => {
  await page.route('https://le-radar-weather.azdak.workers.dev/v1/forecast**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(weather),
    }),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const hrefs = await page.locator('link[rel="stylesheet"]').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('href') || ''),
  );
  expect(
    hrefs.some((h) => h.includes('style-masthead.css')),
    `style-masthead.css manquant dans les <link>: ${hrefs.join(', ')}`,
  ).toBe(true);

  const mastheadCssOk = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try {
      const sheet = [...document.styleSheets].find((s) => (s.href || '').includes('style-masthead.css'));
      if (!sheet) return { ok: false, reason: 'no-sheet' };
      const n = sheet.cssRules?.length ?? 0;
      return { ok: n > 10, reason: `rules=${n}` };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  });
  expect(mastheadCssOk.ok, JSON.stringify(mastheadCssOk)).toBe(true);

  const ribbon = page.locator('#masthead-weather');
  // Devient visible une fois la météo peuplée
  await expect(ribbon).not.toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(ribbon.locator('.masthead-weather__city.is-active').first()).toBeVisible({ timeout: 10_000 });

  const metrics = await page.evaluate(() => {
    const board = document.querySelector('.masthead-weather__board');
    const active = document.querySelectorAll('.masthead-weather__city.is-active').length;
    return {
      boardW: board?.clientWidth ?? 0,
      active,
      countAttr: board?.getAttribute('data-weather-count'),
    };
  });
  expect(metrics.boardW, `board width must be > 0 (got ${JSON.stringify(metrics)})`).toBeGreaterThan(100);
  expect(metrics.active, `multiple active cities at 1440px: ${JSON.stringify(metrics)}`).toBeGreaterThanOrEqual(2);
});
