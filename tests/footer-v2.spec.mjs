/**
 * Pied de page v2 : structure unique (marque + réseaux, colonnes, mentions) et
 * aucun débordement horizontal, de 320 à 1440 px, thèmes clair et sombre.
 */
import { expect, test } from '@playwright/test';

// Échantillon court (budget CI 10 min) : gabarit FR généré + gabarit EN.
const PAGES = [['/horaires/', 'light'], ['/en/', 'dark']];
const WIDTHS = [320, 360, 390, 768, 1024, 1440];

for (const [path, theme] of PAGES) {
  {
    test(`@ci-critical footer v2 sans débordement — ${path} ${theme}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.addInitScript((t) => localStorage.setItem('radar-theme', t), theme);
      await page.goto(path, { waitUntil: 'load' });
      const foot = page.locator('footer.site-foot--v2');
      await expect(foot).toHaveCount(1);
      await expect(foot.locator('.site-foot__social a[data-social]')).toHaveCount(9);
      await expect(foot.locator('.site-foot__social a[data-social="instagram"]')).toHaveAttribute('href', 'https://www.instagram.com/le.radar.ca/');
      await expect(foot.locator('.site-foot__social a[data-social="instagram"]')).toHaveAttribute('rel', 'me noopener');
      await expect(foot.locator('.site-foot__social a[data-social="buymeacoffee"]')).toHaveAttribute('href', 'https://www.buymeacoffee.com/azdak');
      await expect(foot.locator('.site-foot__social a[data-social="buymeacoffee"]')).toHaveAttribute('rel', 'noopener noreferrer');

      const footIds = await foot.locator('.site-foot__social a[data-social]').evaluateAll((as) => as.map((a) => a.dataset.social));
      expect(footIds).toEqual(['buymeacoffee', 'instagram', 'facebook', 'linkedin', 'x', 'bluesky', 'mastodon', 'tumblr', 'rss']);
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
        if (width <= 390) {
          const layout = await foot.locator('.site-foot__social').evaluate((nav) => {
            const links = [...nav.querySelectorAll('a[data-social]')];
            const boxes = links.map((a) => a.getBoundingClientRect());
            const rows = [];
            let y = null;
            let n = 0;
            for (const b of boxes) {
              const top = Math.round(b.top);
              if (y === null || Math.abs(top - y) <= 2) {
                n += 1;
                y = y ?? top;
              } else {
                rows.push(n);
                n = 1;
                y = top;
              }
            }
            if (n) rows.push(n);
            const brand = nav.closest('.site-foot__brandcol')?.querySelector('.site-foot__wordmark, .site-foot__brand') || nav.closest('.site-foot')?.querySelector('.site-foot__wordmark');
            const brandLeft = brand ? brand.getBoundingClientRect().left : boxes[0].left;
            return {
              rows,
              row1Left: boxes[0].left,
              row2Left: boxes[5].left,
              brandLeft,
            };
          });
          expect(layout.rows, `${width}px : deux lignes 5+4`).toEqual([5, 4]);
          expect(Math.abs(layout.row2Left - layout.row1Left), `${width}px : seconde ligne alignée à gauche`).toBeLessThanOrEqual(2);
          expect(Math.abs(layout.row1Left - layout.brandLeft), `${width}px : icônes sur le bord du texte`).toBeLessThanOrEqual(2);
        }
      }
    });
  }
}

test('mât : réseaux de chaque côté de la marque, sans RSS, masqués sous 720 px', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('radar-theme', 'light'));
  await page.goto('/', { waitUntil: 'load' });
  const expected = ['buymeacoffee', 'instagram', 'facebook', 'linkedin', 'x', 'bluesky', 'mastodon', 'tumblr'];
  await expect(page.locator('.masthead-rss')).toHaveCount(0);
  await expect(page.locator('.masthead-social a[data-social]')).toHaveCount(8);
  const ids = await page.locator('.masthead-social a[data-social]').evaluateAll((as) => as.map((a) => a.dataset.social));
  expect(ids).toEqual(expected);

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const visible = page.locator('.masthead-social a[data-social]').first();
    if (width < 720) {
      await expect(visible, `${width}px : réseaux du mât masqués`).toBeHidden();
    } else {
      await expect(visible, `${width}px : réseaux du mât visibles`).toBeVisible();
      const small = await page.locator('.masthead-social a[data-social]').evaluateAll((as) => as.filter((a) => {
        const b = a.getBoundingClientRect();
        return b.height < 44 || b.width < 44;
      }).length);
      expect(small, `${width}px : cibles 44 px`).toBe(0);
    }
  }
});

function footerTextHitsFabs() {
  const fabs = [...document.querySelectorAll('.page-tools__fab, .news-search__fab')].filter((el) => {
    if (el.hidden) return false;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return b.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
  }).map((el) => el.getBoundingClientRect());
  const foot = document.querySelector('footer.site-foot');
  const hits = [];
  for (const el of foot.querySelectorAll('p, a, li, span')) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    for (const r of el.getClientRects()) {
      if (!r.width || !r.height) continue;
      for (const f of fabs) {
        const overlap = !(r.right <= f.left + 1 || r.left >= f.right - 1 || r.bottom <= f.top + 1 || r.top >= f.bottom - 1);
        if (overlap) hits.push(text.slice(0, 80));
      }
    }
  }
  return hits;
}

for (const width of [320, 360, 390]) {
  test(`pied téléphone : texte non couvert par les outils — ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => localStorage.setItem('radar-theme', 'light'));
    await page.goto('/', { waitUntil: 'load' });
    await expect(page.locator('.site-foot__social a[data-social]')).toHaveCount(9);

    // Pied calé en bas du viewport (la licence se trouvait sous les pastilles).
    await page.evaluate(() => {
      const foot = document.querySelector('footer.site-foot');
      const y = window.scrollY + foot.getBoundingClientRect().bottom - window.innerHeight;
      window.scrollTo(0, Math.max(0, y));
    });
    await page.waitForTimeout(150);
    const atFooter = await page.evaluate(footerTextHitsFabs);
    expect(atFooter, `${width}px : recouvrement pied calé en bas`).toEqual([]);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    const atEnd = await page.evaluate(footerTextHitsFabs);
    expect(atEnd, `${width}px : recouvrement en bas de page`).toEqual([]);
  });
}
