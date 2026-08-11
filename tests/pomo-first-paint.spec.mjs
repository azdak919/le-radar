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
  // Tolérance élargie : CI runner peut encore peindre polices/sous-pixels après le fondu
  // (échecs flaky ~2–13px en height sur GitHub Actions).
  await page.waitForTimeout(2500);
  const later = await widget.boundingBox();
  expect(later).toBeTruthy();
  for (const side of ['x', 'y', 'width', 'height']) {
    expect(
      Math.abs(later[side] - settled[side]),
      `le widget a bougé après révélation (${side})`,
    ).toBeLessThanOrEqual(16);
  }

  expect(pageErrors).toEqual([]);
});

/**
 * Plein écran paysage : l'anneau doit être sur l'axe de la fenêtre.
 * Centrer la rangée [anneau | boutons] plaçait l'anneau à gauche de l'axe, de
 * la moitié de la colonne de boutons (32 px mesurés à 1280×620).
 */
test('pomodoro plein écran : l’anneau reste centré malgré la colonne de boutons', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 620 });
  await page.goto('/pomo/', { waitUntil: 'domcontentloaded' });

  await page.waitForSelector('.pomo-widget .pomo-ring-wrapper', { state: 'attached' });
  // Les écouteurs sont posés après le boot : on reclique jusqu'à l'ouverture
  // plutôt que de parier sur un délai fixe (runner chargé).
  const overlay = page.locator('.pomo-fullpage-overlay');
  await expect
    .poll(
      async () => {
        await page.evaluate(() => {
          document.querySelector('.pomo-widget .pomo-ring-wrapper')?.click();
        });
        return overlay.evaluate((el) => el.classList.contains('open'));
      },
      { timeout: 15000 },
    )
    .toBe(true);
  await page.waitForTimeout(600);

  const geometry = await page.evaluate(() => {
    const main = document.querySelector('.pomo-fullpage-main');
    const ring = document.querySelector('.pomo-fullpage-overlay .pomo-ring-wrapper');
    const btn = document.querySelector('.pomo-fullpage-actions .pomo-btn');
    const box = (el) => el.getBoundingClientRect();
    const M = box(main);
    const R = box(ring);
    const B = box(btn);
    return {
      dx: R.x + R.width / 2 - (M.x + M.width / 2),
      gapRingBtn: B.left - R.right,
      btnVisible: B.right <= window.innerWidth,
    };
  });

  expect(Math.abs(geometry.dx), 'anneau décentré horizontalement').toBeLessThanOrEqual(2);
  // Les boutons restent collés à l'anneau, pas perdus au fond de la gouttière.
  expect(geometry.gapRingBtn).toBeGreaterThanOrEqual(0);
  expect(geometry.gapRingBtn).toBeLessThanOrEqual(60);
  expect(geometry.btnVisible, 'colonne de boutons hors écran').toBe(true);
});
