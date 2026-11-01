/**
 * Pied de page v2 : structure unique (marque + réseaux, colonnes, mentions) et
 * aucun débordement horizontal, de 320 à 1440 px, thèmes clair et sombre.
 */
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/horaires/', '/en/', '/affiches/', '/archives/'];
const WIDTHS = [320, 360, 390, 768, 1024, 1440];

for (const path of PAGES) {
  for (const theme of ['light', 'dark']) {
    test(`@ci-critical footer v2 sans débordement — ${path} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.addInitScript((t) => localStorage.setItem('radar-theme', t), theme);
      await page.goto(path, { waitUntil: 'load' });
      const foot = page.locator('footer.site-foot--v2');
      await expect(foot).toHaveCount(1);
      await expect(foot.locator('.site-foot__social a[data-social]')).toHaveCount(6);
      await expect(foot.locator('.site-foot__col')).toHaveCount(3);
      await expect(foot.locator('.site-foot__links .site-foot__sep:visible')).toHaveCount(0);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const r = await foot.evaluate((f) => {
          const box = f.getBoundingClientRect();
          const out = [...f.querySelectorAll('a, button, p')].filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width && (b.right > box.right + 1 || b.left < box.left - 1);
          }).map((el) => el.textContent.trim().slice(0, 30));
          return { out, sw: f.scrollWidth, cw: f.clientWidth, doc: document.documentElement.scrollWidth, vw: innerWidth };
        });
        expect(r.out, `${width}px: éléments hors du pied`).toEqual([]);
        expect(r.sw, `${width}px: débordement du pied`).toBeLessThanOrEqual(r.cw + 1);
        expect(r.doc, `${width}px: débordement de page`).toBeLessThanOrEqual(r.vw + 1);
        if (width <= 520) {
          const small = await foot.locator('.site-foot__social a').evaluateAll((as) => as.filter((a) => a.getBoundingClientRect().height < 44).length);
          expect(small).toBe(0);
        }
      }
    });
  }
}
