import { expect, test } from '@playwright/test';

/**
 * Magazine « mid » (rail En bref à droite) sur tablette et demi-écran.
 *
 * Le seuil était à 900 px, ce qui excluait presque tous les iPad en portrait :
 * 768 (mini / 9,7"), 820 (Air 11"), 834 (Pro 11") tombaient dans la mise en
 * page téléphone, et seul le Pro 12,9" (1024) voyait le rail. Aucun test ne
 * couvrait ces largeurs — la suite ne mesurait que 390 et 1440 px.
 */
const MID_WIDTHS = [
  { width: 768, height: 1024, label: 'iPad mini / 9,7" portrait' },
  { width: 820, height: 1180, label: 'iPad Air 11" portrait' },
  { width: 834, height: 1194, label: 'iPad Pro 11" portrait' },
  { width: 1024, height: 1366, label: 'iPad Pro 12,9" portrait' },
  { width: 960, height: 900, label: 'demi-écran laptop' },
];

for (const { width, height, label } of MID_WIDTHS) {
  test(`magazine mid : rail En bref à ${width} px (${label})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const list = page.locator('.news-list');
    await expect(list).toBeVisible();

    const layout = await list.evaluate((el) => {
      const cs = getComputedStyle(el);
      const cols = cs.gridTemplateColumns.split(' ').filter(Boolean);
      return { display: cs.display, colonnes: cols.length, pistes: cols };
    });
    expect(layout.display, 'la liste doit être une grille, pas un empilement').toBe('grid');
    expect(layout.colonnes, `deux pistes attendues (${layout.pistes.join(' ')})`).toBe(2);

    // Le rail garde une largeur lisible et la une n'est pas écrasée.
    const [heroBox, railBox] = await Promise.all([
      page.locator('.news-hero').boundingBox(),
      page.locator('.brief-rail').first().boundingBox(),
    ]);
    expect(railBox.width).toBeGreaterThanOrEqual(200);
    expect(heroBox.width).toBeGreaterThan(railBox.width * 1.2);

    // Rien ne sort du viewport : c'est le risque quand on descend un seuil.
    const overflow = await page.evaluate(
      () => document.scrollingElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'débordement horizontal').toBeLessThanOrEqual(1);
  });
}

test('magazine mid : le téléphone garde l’empilement une colonne', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const list = page.locator('.news-list');
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS('display', 'block');
});
