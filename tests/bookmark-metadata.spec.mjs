import { expect, test } from '@playwright/test';

// Titres orientés référencement : ils portent l'entité (médias étudiants) et
// le lieu (Québec), pas seulement le nom de l'app. Voir scripts/generate-seo.js.
for (const { path, title, icon } of [
  { path: '/', title: 'LE-RADAR.ca — Les journaux et les radios étudiantes du Québec', icon: 'assets/icon.svg?v=2' },
  // Pomo réimpose son titre en JS (libellé de favori stable) : le référencement
  // de cette page passe par og:title, pas par <title>.
  { path: '/pomo/', title: 'Pomo', icon: 'favicon.svg?v=2' },
  { path: '/solitaire/', title: 'Solitaire — pause entre deux cours · LE-RADAR.ca', icon: 'favicon.svg?v=2' },
]) {
  test(`favori ${path} : titre et favicon dédiés`, async ({ page }) => {
    // `load` et non `networkidle` : le syntoniseur et la météo gardent des
    // requêtes ouvertes, le réseau n'est jamais « idle » sur ces pages.
    await page.goto(path, { waitUntil: 'load' });
    await expect(page).toHaveTitle(title);
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', icon);
  });
}
