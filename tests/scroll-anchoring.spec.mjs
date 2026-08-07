import { expect, test } from '@playwright/test';

/**
 * Ancrage au défilement — barre tuner (sticky) et FABs bas de page (fixed).
 *
 * Signalé sur iPad, LE-RADAR.ca installé comme web app Safari : en défilant,
 * la barre radio disparaissait au lieu de rester collée en haut, et la loupe
 * + la flèche « haut de page » partaient flotter au milieu de l'écran au lieu
 * de rester en bas.
 *
 * Cause : quatre garde-fous anti-pan horizontal empilés sur le conteneur de
 * défilement du document — `overflow-x` sur <html> ET sur <body>, plus
 * `touch-action: pan-y` et `overscroll-behavior-x: none` sur <body>. Sur
 * WebKit, l'`overflow-x` de <body> en fait un scroller imbriqué (sticky
 * s'accroche à un scrollport qui ne défile jamais) et l'ensemble sort le
 * défilement du chemin rapide composité (les calques fixed ne suivent plus
 * le geste).
 *
 * L'overflow de l'élément racine se propageant déjà au viewport, une seule
 * déclaration sur <html> suffit. Ce test verrouille les deux moitiés : le
 * scroller reste nu, et l'anti-pan tient quand même.
 */

const VIEWPORTS = [
  { width: 820, height: 1180, label: 'iPad Air 11" portrait' },
  { width: 390, height: 844, label: 'téléphone' },
  { width: 1440, height: 900, label: 'bureau' },
];

/*
 * Test purement géométrique : ni les webfonts ni les visuels distants ne
 * changent l'ancrage d'un sticky ou d'un fixed. On coupe tout ce qui sort du
 * serveur local — sinon la mesure dépend de la latence d'un CDN (D9).
 */
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', (route) =>
    route.request().url().startsWith(baseURL) ? route.continue() : route.abort(),
  );
});

for (const { width, height, label } of VIEWPORTS) {
  test(`le scroller du document reste nu — ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tuner')).toBeVisible();

    const styles = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        htmlOverflowX: html.overflowX,
        bodyOverflowX: body.overflowX,
        bodyOverflowY: body.overflowY,
        bodyTouchAction: body.touchAction,
        bodyOverscrollX: body.overscrollBehaviorX,
      };
    });

    // L'anti-pan vit sur la racine, qui le propage au viewport.
    expect(styles.htmlOverflowX, 'la racine porte le garde-fou anti-pan').toBe('hidden');

    // …et nulle part ailleurs sur le scroller : chaque ligne ci-dessous a
    // déjà cassé sticky/fixed en web app iOS.
    expect(
      styles.bodyOverflowX,
      '<body> ne doit pas rogner : Safari en fait un scroller imbriqué et sticky meurt',
    ).toBe('visible');
    expect(styles.bodyOverflowY, '<body> ne doit pas devenir un scroller').toBe('visible');
    expect(
      styles.bodyTouchAction,
      '`touch-action` sur <body> sort le défilement du chemin rapide WebKit',
    ).toBe('auto');
    expect(
      styles.bodyOverscrollX,
      '`overscroll-behavior` sur <body> : même effet, et inutile sans défilement horizontal',
    ).toBe('auto');
  });

  test(`aucun pan horizontal, tuner collé et FABs en bas — ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tuner')).toBeVisible();

    // Le garde-fou anti-pan tient toujours, y compris avec les scripts RTL /
    // syllabaires qui allongent le titre du masthead.
    for (const script of ['fr', 'iu', 'ar']) {
      await page.evaluate((code) => {
        const html = document.documentElement;
        html.lang = code;
        if (code === 'fr') {
          html.removeAttribute('data-translate');
          html.removeAttribute('data-script-dir');
          return;
        }
        html.setAttribute('data-translate', code);
        if (code === 'ar') html.setAttribute('data-script-dir', 'rtl');
      }, script);
      const pan = await page.evaluate(
        () => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
      );
      expect(pan, `pas de glissement latéral du document (${script})`).toBeLessThanOrEqual(0);
    }

    const runway = await page.evaluate(
      () => document.scrollingElement.scrollHeight - window.innerHeight,
    );
    expect(runway, 'la page doit être assez longue pour défiler').toBeGreaterThan(600);

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForFunction(() => window.scrollY > 600);

    const anchored = await page.evaluate(() => {
      const tuner = document.getElementById('tuner').getBoundingClientRect();
      const tools = document.getElementById('page-tools').getBoundingClientRect();
      return {
        tunerTop: tuner.top,
        tunerHeight: tuner.height,
        toolsBottom: tools.bottom,
        innerHeight: window.innerHeight,
      };
    });

    // Barre radio : toujours collée en haut du viewport, pas remontée avec la page.
    expect(anchored.tunerHeight, 'la barre radio reste rendue').toBeGreaterThan(20);
    expect(anchored.tunerTop, 'la barre radio reste collée en haut du viewport').toBeCloseTo(0, 0);

    // Loupe + flèche : toujours dans la bande basse, jamais au milieu de l'écran.
    expect(anchored.toolsBottom).toBeLessThanOrEqual(anchored.innerHeight + 1);
    expect(
      anchored.innerHeight - anchored.toolsBottom,
      'les FABs restent à moins de 60 px du bas',
    ).toBeLessThan(60);
  });
}
