import { expect, test } from '@playwright/test';

/**
 * Rail wide E — « Plus de sources » doit occuper l’espace jusqu’au bas
 * de la fenêtre. Régression : height:auto + max-height JS trop court
 * laissait un trou sous « Réduire ».
 */

async function expandSources(page) {
  const toggle = page.locator('#filters-toggle');
  await expect(toggle).toBeVisible({ timeout: 12_000 });
  await toggle.click();
  await expect(page.locator('#news-filters-panel')).toHaveClass(/is-expanded/);
  await expect(toggle).toContainText(/Réduire|Show less|Reducir|Reduzir/i);
}

function gapBelowToggle() {
  const toggle = document.getElementById('filters-toggle');
  if (!toggle || toggle.hidden) return Number.POSITIVE_INFINITY;
  return window.innerHeight - toggle.getBoundingClientRect().bottom;
}

test('wide E : Réduire s’aligne sur le bas de la fenêtre', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#wide-rail-stack')).toBeVisible({ timeout: 12_000 });
  await expandSources(page);

  await expect.poll(async () => page.evaluate(gapBelowToggle), { timeout: 8_000 })
    .toBeLessThanOrEqual(36);

  const atTop = await page.evaluate(gapBelowToggle);
  expect(atTop, `trou sous Réduire en haut de page (${Math.round(atTop)} px)`).toBeLessThanOrEqual(36);

  await page.evaluate(() => window.scrollTo(0, 480));
  await expect.poll(async () => page.evaluate(gapBelowToggle), { timeout: 8_000 })
    .toBeLessThanOrEqual(96);

  const scrolled = await page.evaluate(gapBelowToggle);
  expect(scrolled, `trou sous Réduire après scroll (${Math.round(scrolled)} px)`).toBeLessThanOrEqual(96);
  await expect(page.locator('#filters-toggle')).toBeVisible();
});

test('wide E 1440 : le rail ouvert remplit aussi un laptop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#wide-rail-stack')).toBeVisible({ timeout: 12_000 });
  await expandSources(page);

  await expect.poll(async () => page.evaluate(gapBelowToggle), { timeout: 8_000 })
    .toBeLessThanOrEqual(96);

  const gap = await page.evaluate(gapBelowToggle);
  expect(gap, `trou sous Réduire à 1440 (${Math.round(gap)} px)`).toBeLessThanOrEqual(96);
});
