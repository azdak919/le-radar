import { test, expect } from '@playwright/test';

// Galerie d’affiches (/kit-media/#affiches) : cartes de hauteur cohérente,
// aperçus entiers (11 × 17, sans rognage), trois formats PDF par carte,
// aucun débordement horizontal, et aucun lien de fichier en 404.
const widths = [320, 390, 768, 1024, 1440, 1920];

for (const width of widths) {
  for (const theme of ['light', 'dark']) {
    test(`galerie d’affiches : ${width}px (${theme}) @ci-critical`, async ({ page }) => {
      await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
      await page.addInitScript((t) => { try { localStorage.setItem('radar-theme', t); } catch {} }, theme);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/kit-media/', { waitUntil: 'domcontentloaded' });
      const cards = page.locator('#kit-poster-grid .kit-card--poster:not([hidden])');
      await expect(cards.nth(1)).toBeVisible();
      const info = await page.evaluate(() => {
        const list = [...document.querySelectorAll('#kit-poster-grid .kit-card--poster:not([hidden])')];
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cards: list.map((c) => {
            const r = c.getBoundingClientRect();
            const box = c.querySelector('.kit-card__preview').getBoundingClientRect();
            const img = c.querySelector('img');
            return {
              top: Math.round(r.top + window.scrollY),
              h: r.height,
              ratio: box.width / box.height,
              fit: getComputedStyle(img).objectFit,
              imgH: img.getBoundingClientRect().height,
              boxH: box.height,
              dl: c.querySelectorAll('.kit-dl a').length,
            };
          }),
        };
      });
      expect(info.overflow, 'débordement horizontal').toBeLessThanOrEqual(0);
      expect(info.cards.length).toBeGreaterThan(1);
      const rows = new Map();
      for (const c of info.cards) {
        expect(Math.abs(c.ratio - 11 / 17), 'aperçu au format 11 × 17').toBeLessThan(0.02);
        expect(c.fit, 'aperçu entier, sans rognage').toBe('contain');
        expect(Math.abs(c.imgH - c.boxH), 'image qui remplit son cadre').toBeLessThan(2);
        expect(c.dl, 'trois boutons de format').toBe(3);
        if (!rows.has(c.top)) rows.set(c.top, []);
        rows.get(c.top).push(c.h);
      }
      for (const hs of rows.values()) {
        expect(Math.max(...hs) - Math.min(...hs), 'hauteurs égales sur une rangée').toBeLessThan(1);
      }
      // Pas de carte étirée à la hauteur d’une autre plus grande qu’elle (bug « affiche générique ») :
      const all = info.cards.map((c) => c.h);
      expect(Math.max(...all) / Math.min(...all), 'hauteur cohérente d’une carte à l’autre').toBeLessThan(1.15);
    });
  }
}

test('galerie d’affiches : filtres et liens de fichiers sans 404 @ci-critical', async ({ page, request }) => {
  await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  await page.goto('/kit-media/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#kit-poster-grid .kit-card--example').first()).toBeVisible();
  const hrefs = await page.$$eval('#affiches a[href], #affiches img[src]', (els) => els.map((e) => e.href || e.src)
    .filter((u) => /\/assets\/kit\/affiches\//.test(u)));
  expect(hrefs.length).toBeGreaterThan(10);
  for (const u of new Set(hrefs)) {
    const res = await request.get(u);
    expect(res.status(), u).toBe(200);
  }
  const filters = page.locator('#kit-poster-filter button');
  expect(await filters.count()).toBeGreaterThan(2);
  await filters.nth(1).click();
  await expect(filters.nth(1)).toHaveAttribute('aria-pressed', 'true');
  const campus = await filters.nth(1).getAttribute('data-campus');
  const shown = await page.$$eval('#kit-poster-grid .kit-card--poster:not([hidden])', (els) => els.map((e) => e.dataset.campus));
  expect(shown.every((c) => c === campus || c === 'generique')).toBe(true);
});
