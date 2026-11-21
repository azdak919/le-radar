import { expect, test } from '@playwright/test';

/**
 * Pastille Accueil : même verre que pomo au repos.
 * Le mauve n’apparaît que pendant le pressé — plus de « page courante ».
 */

function readHomeAndPomo() {
  const home = document.querySelector('.masthead-home');
  const pomo = document.querySelector('.masthead-pomo');
  const read = (el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor };
  };
  return { home: read(home), pomo: read(pomo) };
}

test('accueil : pastille comme les voisines au repos, mauve au pressé', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const home = page.locator('.masthead-home').first();
  await expect(home).toBeVisible();

  const rest = await page.evaluate(readHomeAndPomo);
  expect(rest.home.bg, 'fond Accueil au repos = fond Pomodoro').toBe(rest.pomo.bg);

  const box = await home.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const pressed = await page.evaluate(readHomeAndPomo);
  await page.mouse.up();

  expect(pressed.home.bg, 'fond Accueil au pressé ≠ repos').not.toBe(rest.home.bg);
});
