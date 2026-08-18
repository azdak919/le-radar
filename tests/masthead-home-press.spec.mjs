import { expect, test } from '@playwright/test';

/**
 * Pastille Accueil : même verre que RSS / pomo au repos.
 * Le mauve n’apparaît que pendant le pressé — plus de « page courante ».
 */

function readHomeAndRss() {
  const home = document.querySelector('.masthead-home');
  const rss = document.querySelector('.masthead-rss');
  const read = (el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor };
  };
  return { home: read(home), rss: read(rss) };
}

test('accueil : pastille comme les voisines au repos, mauve au pressé', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const home = page.locator('.masthead-home').first();
  await expect(home).toBeVisible();

  const rest = await page.evaluate(readHomeAndRss);
  expect(rest.home.bg, 'fond Accueil au repos = fond RSS').toBe(rest.rss.bg);

  const box = await home.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const pressed = await page.evaluate(readHomeAndRss);
  await page.mouse.up();

  expect(pressed.home.bg, 'fond Accueil au pressé ≠ repos').not.toBe(rest.home.bg);
});
