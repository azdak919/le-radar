import { expect, test } from '@playwright/test';

/**
 * Téléphone : CTA / météo / synthé — 2 lignes, pas de marquee.
 * L’info change au rythme de lecture au lieu d’attendre un aller-retour.
 */

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

test('téléphone 390 : pas de marquee CTA / météo / synthé', async ({ page }) => {
  await page.route('https://le-radar-weather.azdak.workers.dev/v1/forecast**', (route) => route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(weather),
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RadarAir?._pure?.isPhoneTextWrapMode?.() === true);

  const wrap = await page.evaluate(() => window.RadarAir._pure.isPhoneTextWrapMode());
  expect(wrap, 'mode wrap téléphone').toBe(true);

  const weatherRibbon = page.locator('#masthead-weather');
  await expect(weatherRibbon).toBeVisible();
  await expect(weatherRibbon.locator('.masthead-weather__city.is-active').first()).toBeVisible({ timeout: 8000 });
  await expect(weatherRibbon.locator('.masthead-weather__city.is-active.is-overflowing')).toHaveCount(0);
  const weatherAnim = await weatherRibbon
    .locator('.masthead-weather__city.is-active .masthead-weather__name-text')
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(weatherAnim === 'none' || !weatherAnim, `météo animation=${weatherAnim}`).toBe(true);

  const strip = page.locator('#masthead-sports-strip');
  await expect(strip.locator('.sports-chip--cta')).toBeVisible({ timeout: 8000 });
  await expect(strip.locator('.sports-chip--cta')).not.toHaveClass(/is-overflowing/);
  await expect(strip.locator('.sports-chip--cta')).not.toHaveClass(/is-sub-overflowing/);
  const ctaWhiteSpace = await strip.locator('.sports-chip--cta .sports-chip__cta-text').first().evaluate(
    (el) => getComputedStyle(el).whiteSpace,
  );
  expect(ctaWhiteSpace, 'CTA wrap').toBe('normal');

  await page.waitForFunction(() => document.getElementById('tuner')?.classList.contains('is-dial-ready'));
  const tunerMarquees = await page.locator('#tuner .is-marquee').count();
  expect(tunerMarquees, 'synthé sans is-marquee').toBe(0);
  const subWhiteSpace = await page.locator('#tuner-now-sub, .tuner-now-sub').first().evaluate(
    (el) => getComputedStyle(el).whiteSpace,
  );
  expect(subWhiteSpace, 'synthé wrap').toBe('normal');
});
