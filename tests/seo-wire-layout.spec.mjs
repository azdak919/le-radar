import { expect, test } from '@playwright/test';

/** Colonne centrée des pages `.seo-wire` / `.feeds-wire`, sur le modèle des revues. */

const PAGES = [
  { type: 'journal', path: '/journaux/le-delit/', kind: 'lecture' },
  { type: 'radio', path: '/radios/chyz/', kind: 'lecture' },
  { type: 'etablissement', path: '/etablissements/universite-laval/', kind: 'lecture' },
  { type: 'archives', path: '/archives/', kind: 'lecture' },
  { type: 'archives-fiche', path: '/archives/le-delit/', kind: 'lecture' },
  { type: 'journal-en', path: '/en/newspapers/le-delit/', kind: 'lecture' },
  { type: 'medias', path: '/medias/', kind: 'grille' },
  { type: 'horaires', path: '/horaires/', kind: 'grille' },
  { type: 'sports', path: '/sports/', kind: 'grille' },
  { type: 'affiches', path: '/affiches/', kind: 'grille' },
  { type: 'kit-media', path: '/kit-media/', kind: 'grille' },
  { type: 'feeds', path: '/feeds.html', kind: 'grille' },
  { type: 'accueil-en', path: '/en/', kind: 'grille' },
];

/** Blocs de colonne uniquement (pas les cellules d'une grille, ni le chrome interne). */
const COLUMN_SELECTORS = [
  '.seo-crumbs',
  '.seo-eyebrow',
  '.seo-title',
  '.kit-title',
  '.feeds-title',
  '.seo-lead',
  '.kit-lead',
  '.feeds-lead',
  '.seo-facts',
  '.seo-headlines__status',
  '.seo-headlines',
  '.seo-section > h2',
  '.kit-section > h2',
  '.seo-cards',
  '.seo-toc',
  '.seo-dir-stats',
  '.seo-radio-cards',
  '.seo-source-actions',
  '.seo-archive',
  '.seo-note',
  '.media-follow-row',
  '.sports-filters',
  '.sports-board',
];

async function hideLab(page) {
  await page.evaluate(() => {
    document.querySelectorAll(
      '#local-lab-format-bar, #midwidth-preview-bar, #wide-desktop-bar, #local-lab-shell, #toast, .local-lab-bar, .engage-prompt',
    ).forEach((el) => el.remove());
  });
}

async function columnMetrics(page) {
  return page.evaluate((sels) => {
    const vw = window.innerWidth;
    const wire = document.querySelector('.seo-wire, .feeds-wire');
    if (!wire) return { missing: true };
    const title = document.querySelector('.seo-title, .kit-title, .feeds-title, h1');
    const foot = document.querySelector('.site-foot');
    const ticker = document.querySelector('.masthead-sports-strip, .masthead');
    const wr = wire.getBoundingClientRect();
    const wcs = getComputedStyle(wire);
    const edges = [];
    for (const sel of sels) {
      for (const node of wire.querySelectorAll(sel)) {
        // Chrome interne déjà rembourré (charte pliable, cartes, studio).
        if (node.closest('.kit-charte, .kit-card, .dash, .dash-flow, .feeds-card')) continue;
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const b = node.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) continue;
        edges.push({ sel, left: b.left });
      }
    }
    const lefts = edges.map((e) => e.left);
    return {
      missing: false,
      vw,
      left: wr.left,
      right: vw - wr.right,
      width: wr.width,
      maxWidth: wcs.maxWidth,
      padLeft: parseFloat(wcs.paddingLeft) || 0,
      textAlign: getComputedStyle(title || wire).textAlign,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      footWidth: foot ? foot.getBoundingClientRect().width : null,
      tickerWidth: ticker ? ticker.getBoundingClientRect().width : null,
      edgeCount: edges.length,
      edgeSpread: lefts.length ? Math.max(...lefts) - Math.min(...lefts) : 0,
      edges,
    };
  }, COLUMN_SELECTORS);
}

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1024', width: 1024, height: 900 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

test.describe('SEO wire : colonne centrée', { tag: '@ci-critical' }, () => {
  for (const loc of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`${loc.type} ${vp.name} px : marges égales, même bord gauche`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.addInitScript(() => {
          try { localStorage.setItem('radar-theme', 'dark'); } catch {}
        });
        await page.goto(loc.path, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.seo-wire, .feeds-wire, .seo-title, .kit-title, .feeds-title, h1');
        await hideLab(page);
        const m = await columnMetrics(page);
        expect(m.missing, `${loc.type} : colonne .seo-wire / .feeds-wire`).toBe(false);
        expect(m.overflowX, `${loc.type} ${vp.name} : pas de défilement horizontal`).toBe(false);
        expect(
          Math.abs(m.left - m.right),
          `${loc.type} ${vp.name} : colonne centrée (L=${m.left.toFixed(1)} R=${m.right.toFixed(1)} w=${m.width.toFixed(1)})`,
        ).toBeLessThanOrEqual(8);
        expect(['left', 'start']).toContain(m.textAlign);
        expect(m.edgeCount, `${loc.type} : éléments de colonne à mesurer`).toBeGreaterThan(0);
        const detail = m.edges.map((e) => `${e.sel}@${e.left.toFixed(1)}`).join(', ');
        expect(
          m.edgeSpread,
          `${loc.type} ${vp.name} : même bord gauche (spread ${m.edgeSpread.toFixed(2)} px : ${detail})`,
        ).toBeLessThanOrEqual(1);
        if (loc.kind === 'lecture' && vp.width >= 1024) {
          expect(m.width, `${loc.type} ${vp.name} : colonne de lecture bornée`).toBeLessThan(900);
        }
        if (loc.kind === 'grille' && vp.width >= 1280) {
          expect(m.width, `${loc.type} ${vp.name} : grille conserve --maxw`).toBeGreaterThan(1000);
        }
        if (vp.width >= 1024 && m.tickerWidth != null) {
          expect(m.tickerWidth, 'bandeau / en-tête toujours pleine largeur').toBeGreaterThan(vp.width * 0.9);
        }
        if (loc.kind === 'lecture' && vp.width >= 1280 && m.footWidth != null) {
          expect(m.footWidth, 'pied reste à --maxw').toBeGreaterThan(m.width + 40);
        }
        if (vp.width === 390) {
          expect(m.padLeft, 'gouttière mobile conservée').toBeGreaterThanOrEqual(16);
        }
      });
    }
  }
});
