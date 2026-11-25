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
      expect(footIds).toEqual(['buymeacoffee', 'instagram', 'threads', 'facebook', 'linkedin', 'x', 'bluesky', 'mastodon', 'rss']);
      await expect(foot.locator('.site-foot__col')).toHaveCount(3);
      await expect(foot.locator('.site-foot__links .site-foot__sep:visible')).toHaveCount(0);
      await expect(foot.locator('.site-foot__ressources')).toHaveCount(1);
      await expect(foot.locator('.site-foot__ressources-title')).toHaveCount(1);
      await expect(foot.locator('.site-foot__ressources-title')).toHaveText(path.startsWith('/en') ? 'Resources' : 'Ressources');
      await expect(foot.locator('.site-foot__ressource-link')).toHaveCount(2);
      await expect(foot.locator('.site-foot__ressource-link').nth(0)).toHaveAttribute('href', 'https://kiosque.le-radar.ca/');
      await expect(foot.locator('.site-foot__ressource-link').nth(1)).toHaveAttribute('href', 'https://socle.le-radar.ca/');
      await expect(foot.locator('.site-foot__ressource-name')).toHaveText(['Le Kiosque', 'Le Socle']);
      await expect(foot.locator('.site-foot__ressource-desc')).toHaveText(
        path.startsWith('/en')
          ? ['Free platform for student newspapers.', 'Editorial workspace for student newspapers.']
          : ['Plateforme libre pour les journaux étudiants.', 'Espace de rédaction des journaux étudiants.'],
      );
      await expect(foot).not.toContainText(/projet\s+frère|projets\s+frères|sister project/i);
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
        const res = await foot.locator('.site-foot__ressources').evaluate((sec, themeName) => {
          const overlaps = (a, b, pad = 1) => !(
            a.right <= b.left + pad || a.left >= b.right - pad
            || a.bottom <= b.top + pad || a.top >= b.bottom - pad
          );
          const title = sec.querySelector('.site-foot__ressources-title');
          const items = [...sec.querySelectorAll('.site-foot__ressource')];
          const boxes = items.map((el) => el.getBoundingClientRect());
          const itemHits = [];
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              if (overlaps(boxes[i], boxes[j])) itemHits.push(`${i}-${j}`);
            }
          }
          const logos = items.map((el) => {
            const light = el.querySelector('.site-foot__ressource-logo-img--light');
            const dark = el.querySelector('.site-foot__ressource-logo-img--dark');
            const name = el.querySelector('.site-foot__ressource-name');
            const ls = getComputedStyle(light);
            const ds = getComputedStyle(dark);
            const lb = light.getBoundingClientRect();
            const nb = name.getBoundingClientRect();
            return {
              lightShown: ls.display !== 'none' && lb.width > 0,
              darkShown: ds.display !== 'none' && dark.getBoundingClientRect().width > 0,
              logoLeftOfName: lb.right <= nb.left + 1,
            };
          });
          const titleBox = title.getBoundingClientRect();
          const titleHitsItem = boxes.some((b) => overlaps(titleBox, b));
          return { itemHits, logos, titleHitsItem, titleText: title.textContent.trim() };
        }, theme);
        expect(res.itemHits, `${width}px: ressources qui se chevauchent`).toEqual([]);
        expect(res.titleHitsItem, `${width}px: titre sur une fiche`).toBe(false);
        for (const logo of res.logos) {
          expect(logo.logoLeftOfName, `${width}px: logo à gauche du nom`).toBe(true);
          if (theme === 'dark') {
            expect(logo.darkShown, `${width}px: logo sombre visible`).toBe(true);
            expect(logo.lightShown, `${width}px: logo clair masqué`).toBe(false);
          } else {
            expect(logo.lightShown, `${width}px: logo clair visible`).toBe(true);
            expect(logo.darkShown, `${width}px: logo sombre masqué`).toBe(false);
          }
        }
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
              rowRight: boxes[4].right,
              navRight: nav.getBoundingClientRect().right,
              colRight: nav.parentElement.getBoundingClientRect().right,
              brandLeft,
            };
          });
          expect(layout.rows, `${width}px : deux lignes 5+4`).toEqual([5, 4]);
          expect(Math.abs(layout.rowRight - layout.colRight), `${width}px : rangée étalée sur toute la largeur`).toBeLessThanOrEqual(2);
          expect(Math.abs(layout.row2Left - layout.row1Left), `${width}px : seconde ligne alignée à gauche`).toBeLessThanOrEqual(2);
          expect(Math.abs(layout.row1Left - layout.brandLeft), `${width}px : icônes sur le bord du texte`).toBeLessThanOrEqual(2);
        }
      }
    });
  }
}

test('mât : réseaux en rangée sous la devise, sans RSS ni café, visibles sur téléphone', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('radar-theme', 'light'));
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => document.querySelector('#bg-photo-layer')?.classList.add('loaded'));
  const expected = ['buymeacoffee', 'instagram', 'threads', 'facebook', 'linkedin', 'x', 'bluesky', 'mastodon'];
  await expect(page.locator('.masthead-rss')).toHaveCount(0);
  await expect(page.locator('.masthead-coffee')).toHaveCount(0);
  await expect(page.locator('.masthead-social a[data-social]')).toHaveCount(8);
  await expect(page.locator('.masthead-social--under-tagline')).toHaveCount(1);
  await expect(page.locator('.masthead-social__group--left, .masthead-social__group--right')).toHaveCount(0);
  const ids = await page.locator('.masthead-social a[data-social]').evaluateAll((as) => as.map((a) => a.dataset.social));
  expect(ids).toEqual(expected);

  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.masthead-social a[data-social]').first().waitFor({ state: 'visible' });
    const layout = await page.evaluate(() => {
      const overlaps = (a, b, pad = 1) => !(
        a.right <= b.left + pad || a.left >= b.right - pad
        || a.bottom <= b.top + pad || a.top >= b.bottom - pad
      );
      const nav = document.querySelector('.masthead-social--under-tagline');
      const group = nav?.querySelector('.masthead-social__group');
      const links = [...document.querySelectorAll('.masthead-social a[data-social]')];
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
      const wordmark = document.querySelector('.masthead-brand > .wordmark');
      const mark = document.querySelector('.wordmark-mark');
      const tag = document.querySelector('.wordmark-full');
      const tagCs = tag ? getComputedStyle(tag) : null;
      const tagVisible = !!(tag && tagCs && tagCs.position !== 'absolute' && tagCs.clip === '' && !tagCs.clipPath.includes('inset'));
      const actions = document.querySelector('.masthead-actions');
      const tools = [...document.querySelectorAll('.masthead-actions .masthead-icon, .masthead-bg-shuffle')]
        .map((el) => el.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0);
      const credit = document.querySelector('.bg-photo-credit');
      const creditBox = credit && credit.getBoundingClientRect().width > 1 ? credit.getBoundingClientRect() : null;
      const navBox = nav.getBoundingClientRect();
      const groupBox = group.getBoundingClientRect();
      const wordBox = wordmark.getBoundingClientRect();
      const markBox = mark.getBoundingClientRect();
      const hitsTools = tools.filter((t) => overlaps(navBox, t));
      const hitsCredit = creditBox ? overlaps(navBox, creditBox) : false;
      const midNav = (navBox.left + navBox.right) / 2;
      const midWord = (wordBox.left + wordBox.right) / 2;
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const minSide = window.innerWidth < 360 ? 34 : window.innerWidth < 600 ? 40 : 44;
      const small = boxes.filter((b) => b.height < minSide || b.width < minSide).length;
      return {
        rows,
        visible: boxes.every((b) => b.width > 0 && b.height > 0),
        small,
        minSide,
        overflow,
        midDelta: Math.abs(midNav - midWord),
        belowMark: navBox.top + 1 >= markBox.bottom,
        belowTag: !tagVisible || navBox.top + 1 >= tag.getBoundingClientRect().bottom,
        aboveActions: !actions || navBox.bottom <= actions.getBoundingClientRect().top + 1
          || window.innerWidth >= 600,
        hitsTools: hitsTools.length,
        hitsCredit,
        tagVisible,
        coffee: !!document.querySelector('.masthead-coffee'),
      };
    });
    expect(layout.visible, `${width}px : réseaux du mât visibles`).toBe(true);
    expect(layout.small, `${width}px : cibles ${layout.minSide} px`).toBe(0);
    expect(layout.overflow, `${width}px : débordement de page`).toBeLessThanOrEqual(1);
    expect(layout.midDelta, `${width}px : rangée centrée sous la marque`).toBeLessThanOrEqual(8);
    expect(layout.belowMark, `${width}px : sous le logo`).toBe(true);
    expect(layout.belowTag, `${width}px : sous la devise`).toBe(true);
    expect(layout.aboveActions, `${width}px : au-dessus des outils`).toBe(true);
    expect(layout.hitsTools, `${width}px : pas de chevauchement avec les outils`).toBe(0);
    expect(layout.hitsCredit, `${width}px : pas de chevauchement avec le crédit photo`).toBe(false);
    expect(layout.coffee, `${width}px : bouton café retiré`).toBe(false);
    expect(layout.rows, `${width}px : une seule rangée`).toEqual([8]);
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
