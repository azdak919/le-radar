import { test, expect } from '@playwright/test';

// Max/min d’une ville régionale : décidé à son arrivée. Si la puce
// s’élargit ensuite (ville retirée du bandeau, colonnes), il doit apparaître.
test('2560 : puce élargie après coup → max/min affiché @ci-critical', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 900 });
  await page.route('**/assets/news-images/**', (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
  await page.route('https://**/*', (r) => r.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const chips = page.locator('.masthead-weather__city.is-active');
  await expect.poll(() => chips.count()).toBeGreaterThan(2);
  const id = await chips.evaluateAll((cs) => {
    const c = cs.find((e) => !['montreal', 'quebec'].includes(e.dataset.weatherCity) && e.dataset.wxMax);
    if (!c) return null;
    c.dataset.testWiden = '1';
    // Une puce étroite (max/min retiré), puis élargie.
    for (const [k, v] of [['width', '150px'], ['min-width', '150px'], ['max-width', '150px']]) c.style.setProperty(k, v, 'important');
    return c.dataset.weatherCity;
  });
  test.skip(!id, 'aucune ville régionale dans le bandeau');
  const chip = page.locator('[data-test-widen="1"]');
  await page.evaluate(() => measureWeatherNameOverflows());
  await expect(chip).toHaveAttribute('data-weather-extra', 'off');
  await chip.evaluate((c) => {
    for (const k of ['width', 'min-width', 'max-width']) c.style.setProperty(k, '420px', 'important');
  });
  await expect(chip).toHaveAttribute('data-weather-extra', /today|both/);
});
