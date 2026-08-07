import { expect, test } from '@playwright/test';

/**
 * Zone sûre iOS (encoche / Dynamic Island) et synthétiseur collant.
 *
 * Régression couverte :
 *  - 2026-08-07, « grosse barre noire » (Safari iOS, app installée) : `.tuner`
 *    portait `padding-top: env(safe-area-inset-top)` en permanence. En plein
 *    écran (viewport-fit=cover + status-bar-style black-translucent) l'inset
 *    vaut ~47 px, et le mât venait DÉJÀ de le consommer juste au-dessus : au
 *    repos, la barre radio affichait donc une bande noire morte de la hauteur
 *    de l'encoche entre la photo du mât et les commandes.
 *
 * `env()` n'est pas pilotable depuis Playwright : la feuille passe par
 * `--safe-top`, qu'on surcharge ici pour simuler un iPhone en mode app.
 */

const INSET = 47; // env(safe-area-inset-top) d'un iPhone à encoche, en plein écran

test.use({ viewport: { width: 390, height: 844 } });

async function openHome(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tuner .tuner-controls');
  // Coiffe injectée par app.js (voir .tuner-safe-cap dans style.css). Hauteur
  // nulle sans encoche : on l'attend « attachée », pas « visible ».
  await page.waitForSelector('.tuner-safe-cap', { state: 'attached' });
  await page.waitForSelector('.site-sections');
}

test('zone sûre : aucune bande noire sous le mât au repos', async ({ page }) => {
  await openHome(page);

  // Mesures sans inset puis avec, dans le même état de page (aucun await entre
  // les deux : un chargement asynchrone fausserait la comparaison).
  const { plain, safe } = await page.evaluate((inset) => {
    const rect = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    };
    const snap = () => ({
      masthead: rect('.masthead'),
      tuner: rect('#tuner'),
      cap: rect('.tuner-safe-cap'),
      controls: rect('.tuner-controls'),
      below: rect('.site-sections'),
    });

    const plain = snap();
    const style = document.createElement('style');
    style.textContent = `:root { --safe-top: ${inset}px; }`;
    document.head.appendChild(style);
    document.documentElement.offsetHeight; // reflow forcé
    const safe = snap();
    style.remove();
    return { plain, safe };
  }, INSET);

  // La barre ne grossit pas d'un pixel : la coiffe vit à côté, pas dedans.
  expect(safe.tuner.height).toBeCloseTo(plain.tuner.height, 0);

  // Elle reste collée au mât — c'est exactement ce que la bande noire cassait.
  expect(safe.tuner.top).toBeCloseTo(safe.masthead.bottom, 0);

  // Seul décalage : le crédit d'encoche que le mât consomme en haut de page,
  // une seule fois (l'ancien `padding-top` le comptait deux fois).
  expect(safe.controls.top - plain.controls.top).toBeCloseTo(INSET, 0);
  expect(safe.below.top - plain.below.top).toBeCloseTo(INSET, 0);

  // Coiffe : haute comme l'encoche, rangée derrière la barre, hors flux.
  expect(safe.cap.height).toBeCloseTo(INSET, 0);
  expect(safe.cap.top).toBeCloseTo(safe.tuner.top, 0);
});

test('zone sûre : une fois épinglée, la barre reste sous la zone d’état', async ({ page }) => {
  await openHome(page);
  await page.addStyleTag({ content: `:root { --safe-top: ${INSET}px; }` });

  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForFunction(
    (inset) => document.querySelector('#tuner').getBoundingClientRect().top <= inset,
    INSET,
  );

  const pinned = await page.evaluate(() => {
    const rect = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    return { tuner: rect('#tuner'), cap: rect('.tuner-safe-cap'), controls: rect('.tuner-controls') };
  });

  // Les commandes descendent sous la barre d'état…
  expect(pinned.tuner.top).toBeCloseTo(INSET, 0);
  expect(pinned.controls.top).toBeGreaterThanOrEqual(INSET);
  // …et la coiffe couvre la bande libérée au-dessus, sans trou.
  expect(pinned.cap.top).toBeCloseTo(0, 0);
  expect(pinned.cap.bottom).toBeGreaterThanOrEqual(pinned.tuner.top - 0.5);
});
