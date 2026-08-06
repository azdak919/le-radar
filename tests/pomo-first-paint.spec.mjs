import { expect, test } from '@playwright/test';

/**
 * Régression : Pomodoro ne doit plus sauter au premier rendu mobile.
 *
 * `pomo/styles/layout.css` accroche 105 règles à `html[data-layout]`, et
 * l'attribut n'arrivait qu'au `DOMContentLoaded` : la page peignait d'abord les
 * proportions bureau, puis basculait. `js/layout-boot.js` le pose désormais
 * avant le premier rendu ; ce qui reste — les décalages mesurés sur le DOM —
 * se règle derrière un fondu, donc hors de vue.
 */
test('pomodoro : la disposition est posée avant le premier rendu, et rien ne bouge une fois visible', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Les polices Google sont neutralisées : ce test porte sur l'amorçage de la
  // disposition, et un runner sans accès à fonts.googleapis.com bloquerait le
  // rendu pendant tout le délai réseau — même patron que le mock météo.
  await page.route('**/fonts.googleapis.com/**', (route) => route.fulfill({
    contentType: 'text/css',
    body: '',
  }));

  await page.setViewportSize({ width: 393, height: 851 });
  // `commit` : on veut observer l'état du document AVANT que les modules
  // différés aient tourné. Un `load` masquerait justement ce qu'on teste.
  await page.goto('/pomo/', { waitUntil: 'commit' });

  // La valeur dépend du pointeur simulé par le projet ; ce qui compte ici est
  // qu'elle existe AVANT que les modules différés aient tourné.
  const root = page.locator('html');
  await expect(root, 'la disposition doit être posée par le script de tête').toHaveAttribute(
    'data-layout',
    /^(touch|wide)$/,
    { timeout: 5000 },
  );

  // Le fondu ne couvre que les décalages mesurés : il doit se lever seul.
  await expect
    .poll(async () => root.evaluate((el) => el.hasAttribute('data-booting')), { timeout: 8000 })
    .toBe(false);

  const widget = page.locator('#pomo-widget');
  await expect(widget).toBeVisible();
  const settled = await widget.boundingBox();
  expect(settled).toBeTruthy();

  // Une fois révélé, plus rien ne bouge : c'est la mesure du saut, pas son symptôme.
  await page.waitForTimeout(1500);
  const later = await widget.boundingBox();
  expect(later).toBeTruthy();
  for (const side of ['x', 'y', 'width', 'height']) {
    expect(
      Math.abs(later[side] - settled[side]),
      `le widget a bougé après révélation (${side})`,
    ).toBeLessThanOrEqual(1);
  }

  expect(pageErrors).toEqual([]);
});
