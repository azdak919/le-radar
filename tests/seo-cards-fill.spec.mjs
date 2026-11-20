import { expect, test } from '@playwright/test';

/** Les grilles de cartes des annuaires remplissent la colonne (rangées complètes). */

const PAGES = [
  { type: 'medias', path: '/medias/', selectors: ['.seo-cards'] },
  { type: 'medias-en', path: '/en/media/', selectors: ['.seo-cards'] },
  { type: 'horaires', path: '/horaires/', selectors: ['.seo-radio-cards'] },
];

const VIEWPORTS = [
  { name: '1024', width: 1024, height: 900 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

async function hideLab(page) {
  await page.evaluate(() => {
    document.querySelectorAll(
      '#local-lab-format-bar, #midwidth-preview-bar, #wide-desktop-bar, #local-lab-shell, #toast, .local-lab-bar, .engage-prompt',
    ).forEach((el) => el.remove());
  });
}

async function gridMetrics(page, selectors) {
  return page.evaluate((sels) => {
    const wire = document.querySelector('.seo-wire, .feeds-wire');
    if (!wire) return { missing: true, grids: [] };
    const wr = wire.getBoundingClientRect();
    const padR = parseFloat(getComputedStyle(wire).paddingRight) || 0;
    const padL = parseFloat(getComputedStyle(wire).paddingLeft) || 0;
    const colLeft = wr.left + padL;
    const colRight = wr.right - padR;
    const grids = [];
    for (const sel of sels) {
      let i = 0;
      for (const g of wire.querySelectorAll(sel)) {
        const r = g.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const tmpl = getComputedStyle(g).gridTemplateColumns;
        const colCount = tmpl && tmpl !== 'none' ? tmpl.split(' ').filter(Boolean).length : 0;
        const kids = [...g.children].filter((c) => {
          const b = c.getBoundingClientRect();
          const cs = getComputedStyle(c);
          return b.width > 2 && b.height > 2 && cs.display !== 'none';
        });
        const rowsMap = new Map();
        for (const c of kids) {
          const b = c.getBoundingClientRect();
          const key = Math.round(b.top);
          // group nearby tops (subpixel / wrap)
          let found = key;
          for (const k of rowsMap.keys()) {
            if (Math.abs(k - key) <= 2) { found = k; break; }
          }
          if (!rowsMap.has(found)) rowsMap.set(found, []);
          rowsMap.get(found).push(b);
        }
        const rows = [...rowsMap.values()].map((row) => ({
          n: row.length,
          right: Math.max(...row.map((b) => b.right)),
          widths: row.map((b) => b.width),
        }));
        const full = rows.filter((row) => colCount > 0 && row.n === colCount);
        grids.push({
          sel,
          i: i++,
          colCount,
          itemCount: kids.length,
          gridRight: r.right,
          fullRows: full.map((row) => ({ n: row.n, right: row.right })),
        });
      }
    }
    return { missing: false, colLeft, colRight, grids };
  }, selectors);
}

test.describe('SEO cards : grilles à la largeur de la colonne', { tag: '@ci-critical' }, () => {
  for (const loc of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`${loc.type} ${vp.name} px : rangées complètes au bord droit`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.addInitScript(() => { try { localStorage.setItem('radar-theme', 'dark'); } catch {} });
        await page.goto(loc.path, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(loc.selectors[0]);
        await hideLab(page);
        const m = await gridMetrics(page, loc.selectors);
        expect(m.missing, `${loc.type} : colonne`).toBe(false);
        expect(m.grids.length, `${loc.type} : au moins une grille`).toBeGreaterThan(0);
        const withFull = m.grids.filter((g) => g.fullRows.length);
        expect(
          withFull.length,
          `${loc.type} ${vp.name} : au moins une grille avec une rangée complète (grilles: ${m.grids.map((g) => `${g.sel}#${g.i} n=${g.itemCount}/${g.colCount}`).join(', ')})`,
        ).toBeGreaterThan(0);
        for (const g of withFull) {
          for (const row of g.fullRows) {
            expect(
              Math.abs(row.right - m.colRight),
              `${loc.type} ${vp.name} ${g.sel}#${g.i} : bord droit de rangée complète (${row.right.toFixed(1)}) = colonne (${m.colRight.toFixed(1)})`,
            ).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  }
});
