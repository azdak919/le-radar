import { test, expect } from '@playwright/test';

// Une source choisie affiche « Suivre · Fiche du média ». En grand écran (E),
// la barre doit vivre dans la colonne contenu, au-dessus du fil — jamais dans
// la cellule vide sous le rail sticky, où elle transparaissait entre les
// pastilles en bas de page.
for (const width of [1280, 1440, 1920]) {
  test(`rail ${width} : barre Suivre au-dessus du fil, rien sous le rail @ci-critical`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('https://**/*', (r) => r.abort());
    await page.goto('/?wide=e', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#news-filters-panel')).toHaveAttribute('data-ready', '1');
    await page.locator('.filters-toggle').click();
    const last = page.locator('#news-filters .filter-btn').last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    const bar = page.locator('#media-follow-bar');
    await expect(bar).toBeVisible();
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { bar: r('#media-follow-bar'), list: r('.news-list'), rail: r('#wide-rail-stack') };
    });
    expect(g.bar.left).toBeGreaterThanOrEqual(g.rail.right);
    expect(g.bar.bottom).toBeLessThanOrEqual(g.list.top + 1);
  });
}

