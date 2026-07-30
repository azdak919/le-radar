import { expect, test } from '@playwright/test';

// Titres orientés référencement : ils portent l'entité (médias étudiants) et
// le lieu (Québec), pas seulement le nom de l'app. Voir scripts/generate-seo.js.
//
// Favicons : l'accueil garde un SVG, les deux mini-apps sont passées à des PNG
// dédiés (?v=3). Le sélecteur est donc décrit par page plutôt que supposé
// identique partout.
for (const { path, title, iconSelector, icon } of [
  {
    path: '/',
    title: 'LE-RADAR.ca — Journaux, radios et sports étudiants du Québec',
    iconSelector: 'link[rel="icon"][type="image/svg+xml"]',
    icon: 'assets/icon.svg?v=2',
  },
  // Pomo réimpose son titre en JS (libellé de favori stable) : le référencement
  // de cette page passe par og:title, pas par <title>.
  {
    path: '/pomo/',
    title: 'Pomo',
    iconSelector: 'link[rel="icon"][sizes="32x32"]',
    icon: 'favicon-32x32.png?v=3',
  },
  {
    path: '/solitaire/',
    title: 'Solitaire — pause entre deux cours · LE-RADAR.ca',
    iconSelector: 'link[rel="icon"][sizes="32x32"]',
    icon: 'favicon-32x32.png?v=3',
  },
]) {
  test(`favori ${path} : titre et favicon dédiés`, async ({ page }) => {
    // Ni `networkidle` — le syntoniseur et la météo gardent des requêtes
    // ouvertes, le réseau n'est jamais « idle » — ni `load`, qui attend la
    // photo Wikimedia du mât et le script umami, deux ressources externes qui
    // font dépasser les 30 s sous un runner chargé. Le titre et le favicon
    // sont dans le <head> : `domcontentloaded` les a déjà.
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(title);
    await expect(page.locator(iconSelector)).toHaveAttribute('href', icon);
  });
}
