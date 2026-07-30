import { expect, test } from '@playwright/test';

/**
 * Bandeau scores : cascade de fit comme la météo.
 * On retire des cartes score en rétrécissant jusqu’à ne garder que
 * la CTA « Au tableau ».
 */
test('sports strip : collapse progressif jusqu’à Au tableau seule', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const strip = page.locator('#masthead-sports-strip');
  // Attendre le fetch sports.json + premier paint (+ fit rAF).
  await expect(strip).toBeVisible({ timeout: 8000 });
  await expect
    .poll(async () => strip.locator('.sports-chip').count(), { timeout: 8000 })
    .toBeGreaterThan(0);

  const countAt = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    // Debounce resize 40 ms + 2 rAF fit
    await page.waitForTimeout(120);
    await expect
      .poll(async () => strip.locator('.sports-chip').count(), { timeout: 4000 })
      .toBeGreaterThan(0);
    return strip.locator('.sports-chip').count();
  };

  const wide = await countAt(1440);
  expect(wide).toBeGreaterThanOrEqual(2);
  expect(wide).toBeLessThanOrEqual(4);
  // CTA toujours présente et en dernier quand ≥ 2 chips.
  await expect(strip.locator('.sports-chip').last()).toHaveClass(/sports-chip--cta/);
  await expect(strip).toHaveAttribute('data-cta-pinned', '1');

  const mid = await countAt(900);
  expect(mid).toBeLessThanOrEqual(wide);
  expect(mid).toBeGreaterThanOrEqual(1);
  if (mid >= 2) {
    await expect(strip.locator('.sports-chip').last()).toHaveClass(/sports-chip--cta/);
  }

  const narrow = await countAt(520);
  expect(narrow).toBeLessThanOrEqual(mid);
  expect(narrow).toBeGreaterThanOrEqual(1);

  // Téléphone / très étroit : il ne reste que l’ancre « Au tableau ».
  const phone = await countAt(360);
  expect(phone).toBe(1);
  await expect(strip.locator('.sports-chip')).toHaveCount(1);
  await expect(strip.locator('.sports-chip--cta')).toHaveCount(1);
  await expect(strip).toHaveAttribute('data-count', '1');
  await expect(strip).toHaveAttribute('data-cta-pinned', '0');
  // Pastille visible (pas coupée hors flux).
  const tagBox = await strip.locator('.sports-chip__cta-tag').boundingBox();
  expect(tagBox).toBeTruthy();
  expect(tagBox.width).toBeGreaterThan(40);

  // En élargissant, on retrouve des scores + CTA (fit remesuré depuis zéro).
  const back = await countAt(1280);
  expect(back).toBeGreaterThanOrEqual(2);
  await expect(strip.locator('.sports-chip').last()).toHaveClass(/sports-chip--cta/);
  await expect(strip.locator('.sports-chip:not(.sports-chip--cta)').first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});
