/**
 * Chrome partagé + menu d'installation — preuve visuelle multi-appareil.
 *
 * D18 exige une preuve visuelle, pas seulement structurelle : `static-integrity`
 * vérifie que le markup est là, cette spec vérifie qu'il ne déborde pas, qu'il
 * ne se fait pas rogner, et qu'il ressemble aux boutons voisins.
 *
 * Pas de capture de référence au pixel (source de flake sur photo de mât
 * aléatoire) : on mesure des rectangles et des styles calculés, qui sont
 * déterministes.
 */
import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { w: 320, h: 568, name: 'iPhone SE portrait' },
  { w: 360, h: 640, name: 'Android compact' },
  { w: 375, h: 667, name: 'iPhone 8' },
  { w: 390, h: 844, name: 'iPhone 14' },
  { w: 414, h: 896, name: 'iPhone 11 Pro Max' },
  { w: 768, h: 1024, name: 'iPad portrait' },
  { w: 1024, h: 768, name: 'iPad paysage' },
  { w: 1440, h: 900, name: 'bureau' },
];

/** `kind` dit quel système de design porte le menu sur cette route. */
const ROUTES = [
  { path: '/', name: 'accueil', kind: 'masthead' },
  { path: '/feeds.html', name: 'rss', kind: 'masthead' },
  { path: '/sports/', name: 'sports', kind: 'masthead' },
  { path: '/en/sports/', name: 'sports-en', kind: 'masthead' },
  { path: '/radios/chyz/', name: 'fiche-radio', kind: 'masthead' },
  { path: '/journaux/la-pige/', name: 'fiche-journal', kind: 'masthead' },
  { path: '/en/index.html', name: 'accueil-en', kind: 'masthead' },
  { path: '/medias/', name: 'annuaire', kind: 'masthead' },
  { path: '/pomo/', name: 'pomodoro', kind: 'toolbar' },
  { path: '/solitaire/', name: 'solitaire', kind: 'toolbar' },
];

/** Le voisin dont la pastille d'installation doit être indiscernable. */
const SIBLING = '#theme-toggle';
const TOGGLE = '[data-install-toggle]';
const PANEL = '[data-install-panel]';

/**
 * Charge une route et attend que le menu soit réellement câblé.
 *
 * On attend `window.RadarEngage` plutôt qu'un délai : engage-prompt.js est en
 * `defer`, donc son exécution passe après l'analyse du document — et derrière
 * les images de mât, qui viennent d'hôtes externes. Sur un poste sans accès à
 * ces hôtes, ça se compte en dizaines de secondes. Attendre l'API supprime la
 * course sans masquer une vraie panne : si le script échoue, le test échoue.
 */
async function gotoStable(page, path) {
  await page.goto(path, { waitUntil: 'commit' });
  await page.waitForSelector(TOGGLE, { state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => !!window.RadarEngage, null, { timeout: 60000 });
  await page.waitForFunction(
    () => document.querySelector('[data-install-menu]')?.dataset.wired === '1',
    null,
    { timeout: 15000 },
  );
}

async function setTheme(page, theme) {
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
}

for (const route of ROUTES) {
  for (const theme of ['light', 'dark']) {
    test(`chrome install — ${route.name} (${theme})`, async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));

      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoStable(page, route.path);
      await setTheme(page, theme);

      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.waitForTimeout(120);
        const label = `${route.name} @ ${vp.w}px (${vp.name})`;

        // 1) Aucun débordement horizontal du document.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow, `${label} : débordement horizontal`).toBeLessThanOrEqual(0);

        // 2) La rangée d'actions ne se fait pas rogner par son conteneur.
        //    On exclut .masthead-shuffle-slot, volontairement posé hors de
        //    .masthead-inner (bouton de fond photo, colonne de droite).
        if (route.kind === 'masthead') {
          const clipped = await page.evaluate(() => {
            const inner = document.querySelector('.masthead-inner');
            if (!inner) return [];
            const box = inner.getBoundingClientRect();
            return [...document.querySelectorAll('.masthead-actions .masthead-icon, .seo-masthead-actions .masthead-icon')]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                if (!r.width) return false;
                return r.left < box.left - 0.5 || r.right > box.right + 0.5;
              })
              .map((el) => el.className);
          });
          expect(clipped, `${label} : pastilles hors du mât`).toEqual([]);
        }

        // 2 bis) La rangée n'empiète pas sur la marque.
        //
        // C'est le contrôle qui manquait : vérifier que les pastilles restent
        // dans .masthead-inner ne dit RIEN sur ce qu'elles recouvrent à
        // l'intérieur. Les pages d'entités posaient leur rangée en
        // `position: absolute` par-dessus le mot-symbole — dans le conteneur,
        // donc invisible pour l'assertion précédente, mais illisible à l'œil.
        if (route.kind === 'masthead') {
          const collisions = await page.evaluate(() => {
            const actions = document.querySelector('.masthead-actions');
            if (!actions) return [];
            const a = actions.getBoundingClientRect();
            const overlaps = (b) => !(a.bottom <= b.top || a.top >= b.bottom
              || a.right <= b.left || a.left >= b.right);
            return ['.masthead-brand', '.wordmark-mark', '.wordmark-full']
              .filter((sel) => {
                const el = document.querySelector(sel);
                if (!el) return false;
                const b = el.getBoundingClientRect();
                return b.width > 0 && b.height > 0 && overlaps(b);
              });
          });
          expect(collisions, `${label} : la rangée recouvre la marque`).toEqual([]);
        }

        // 3) Cible tactile suffisante.
        const size = await page.locator(TOGGLE).first().boundingBox();
        expect(size.width, `${label} : largeur du déclencheur`).toBeGreaterThanOrEqual(22);
        expect(size.height, `${label} : hauteur du déclencheur`).toBeGreaterThanOrEqual(22);

        // 4) Panneau ouvert : entièrement visible et au-dessus du reste.
        await page.locator(TOGGLE).first().click();
        const panel = page.locator(PANEL).first();
        await expect(panel, `${label} : panneau visible`).toBeVisible();

        const geom = await panel.evaluate((el) => {
          const r = el.getBoundingClientRect();
          // On teste CHAQUE item, pas seulement le haut du panneau : le
          // premier défaut trouvé était que le 4ᵉ — et lui seul — passait
          // sous la barre du syntoniseur. Échantillonner le sommet ne l'aurait
          // jamais vu.
          const covered = [...el.querySelectorAll('[data-install-app]')]
            .filter((item) => {
              const b = item.getBoundingClientRect();
              const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
              return !(hit && (item === hit || item.contains(hit) || el.contains(hit)));
            })
            .map((item) => item.getAttribute('data-install-app'));
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            covered,
            bg: getComputedStyle(el).backgroundColor,
            items: el.querySelectorAll('[data-install-app]').length,
          };
        });

        expect(geom.left, `${label} : panneau coupé à gauche`).toBeGreaterThanOrEqual(-0.5);
        expect(geom.right, `${label} : panneau coupé à droite`).toBeLessThanOrEqual(vp.w + 0.5);
        expect(geom.top, `${label} : panneau coupé en haut`).toBeGreaterThanOrEqual(-0.5);
        expect(geom.covered, `${label} : items recouverts par une autre couche`).toEqual([]);
        expect(geom.items, `${label} : les quatre apps`).toBe(4);

        // 5) Thème sombre : le panneau ne doit jamais rester blanc. C'est le
        //    piège des jetons manquants sur Pomodoro / Solitaire.
        if (theme === 'dark') {
          expect(geom.bg, `${label} : panneau blanc en thème sombre`).not.toBe('rgb(255, 255, 255)');
        }

        await page.keyboard.press('Escape');
      }

      expect(pageErrors, `${route.name} : erreurs console`).toEqual([]);
    });
  }

  test(`fondu visuel du déclencheur — ${route.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoStable(page, route.path);

    // La pastille d'installation doit être indiscernable de sa voisine :
    // c'est la définition opérationnelle de « ça se fond avec les autres ».
    const [install, sibling] = await Promise.all([
      page.locator(TOGGLE).first().evaluate(readBox),
      page.locator(SIBLING).first().evaluate(readBox),
    ]);

    expect(install.height, `${route.name} : hauteur`).toBeCloseTo(sibling.height, 0);
    expect(install.borderRadius, `${route.name} : arrondi`).toBe(sibling.borderRadius);
    expect(install.borderColor, `${route.name} : bordure`).toBe(sibling.borderColor);
    expect(install.color, `${route.name} : couleur`).toBe(sibling.color);
    expect(install.fontFamily, `${route.name} : police`).toBe(sibling.fontFamily);

    if (route.kind === 'masthead') {
      // Les pastilles du mât sont carrées et sans libellé : même largeur.
      expect(install.width, `${route.name} : largeur`).toBeCloseTo(sibling.width, 0);
    } else {
      // Dans les barres Pomodoro / Solitaire, le bouton porte un libellé
      // (« Installer ») là où la bascule de thème est une icône seule : leurs
      // largeurs diffèrent par construction. Ce qui doit concorder, c'est le
      // rythme vertical et le remplissage — donc la hauteur, déjà vérifiée,
      // et les marges internes.
      expect(install.paddingBlock, `${route.name} : marge verticale`).toBe(sibling.paddingBlock);
      expect(install.width, `${route.name} : bouton libellé plus large`)
        .toBeGreaterThan(sibling.width);
    }
  });
}

function readBox(el) {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    width: r.width,
    height: r.height,
    borderRadius: cs.borderRadius,
    borderColor: cs.borderTopColor,
    color: cs.color,
    fontFamily: cs.fontFamily,
    paddingBlock: `${cs.paddingTop} ${cs.paddingBottom}`,
  };
}

test('nom accessible du bouton d’installation — FR et EN', async ({ page }) => {
  for (const [path, expected] of [['/', 'Installer'], ['/en/index.html', 'Install']]) {
    await gotoStable(page, path);
    for (const sel of [TOGGLE, '.site-foot__link-btn']) {
      const name = await page.locator(sel).first().evaluate(
        (el) => el.getAttribute('aria-label') || el.textContent.trim(),
      );
      expect(name, `${path} ${sel} : nom accessible vide`).not.toBe('');
      expect(name, `${path} ${sel} : mauvaise langue`).toContain(expected);
    }
  }
});

test('navigation clavier du menu d’installation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoStable(page, '/');

  await page.locator(TOGGLE).first().focus();
  await page.keyboard.press('ArrowDown');

  const first = await page.evaluate(() => document.activeElement?.getAttribute('data-install-app'));
  expect(first, 'ArrowDown doit entrer dans le panneau').toBe('radar');

  await page.keyboard.press('ArrowDown');
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('data-install-app')),
  ).toBe('pomo');

  await page.keyboard.press('End');
  expect(
    await page.evaluate(() => document.activeElement?.getAttribute('data-install-app')),
  ).toBe('sports');

  // Échap referme ET rend le focus au déclencheur : sans ça, la tabulation
  // repartirait du début du document.
  await page.keyboard.press('Escape');
  await expect(page.locator(PANEL).first()).toBeHidden();
  expect(
    await page.evaluate(() => document.activeElement?.hasAttribute('data-install-toggle')),
  ).toBe(true);
});

test('sports : app installable et service worker propre', async ({ page }) => {
  await gotoStable(page, '/sports/');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref, 'sports doit porter son propre manifeste').toBe('site.webmanifest');

  const manifest = await page.evaluate(async () => {
    const res = await fetch('site.webmanifest');
    return res.json();
  });
  expect(manifest.id).toBe('/sports/');
  expect(manifest.scope).toBe('./');
  expect(manifest.display).toBe('standalone');

  // Le worker racine doit laisser la portée à celui de /sports/.
  const rootSw = await page.evaluate(async () => (await fetch('../sw.js')).text());
  expect(rootSw).toMatch(/ISOLATED_PATH_RE[^;]*sports/);
});
