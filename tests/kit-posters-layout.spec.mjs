import { test, expect } from '@playwright/test';

// Galerie d’affiches (/kit-media/#affiches) : campus et La une, aperçus
// entiers selon le format, liens de fichier valides, pas de débordement.
const widths = [320, 390, 768, 1024, 1440, 1920];

for (const width of widths) {
  for (const theme of ['light', 'dark']) {
    test(`galerie d’affiches : ${width}px (${theme}) @ci-critical`, async ({ page }) => {
      await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
      await page.addInitScript((t) => { try { localStorage.setItem('radar-theme', t); } catch {} }, theme);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/kit-media/', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#kit-poster-filter button').first()).toBeVisible();
      const cards = page.locator('#kit-poster-grid .kit-card--poster:not([hidden])');
      await expect(cards.nth(1)).toBeVisible();
      const info = await page.evaluate(() => {
        const expected = { tabloid: 11 / 17, letter: 8.5 / 11, legal: 8.5 / 14, 'ecran-paysage': 16 / 9, 'ecran-portrait': 9 / 16 };
        const list = [...document.querySelectorAll('#kit-poster-grid .kit-card--poster:not([hidden])')];
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          cards: list.map((c) => {
            const r = c.getBoundingClientRect();
            const box = c.querySelector('.kit-card__preview').getBoundingClientRect();
            const img = c.querySelector('img');
            const fmt = c.dataset.format || 'tabloid';
            return {
              top: Math.round(r.top + window.scrollY),
              h: r.height,
              ratio: box.width / box.height,
              expected: expected[fmt] || 11 / 17,
              format: fmt,
              fit: getComputedStyle(img).objectFit,
              imgH: img.getBoundingClientRect().height,
              boxH: box.height,
              dl: c.querySelectorAll('.kit-dl a').length,
            };
          }),
        };
      });
      expect(info.overflow, 'débordement horizontal').toBeLessThanOrEqual(0);
      // Marge gauche : le contenu ne colle jamais au bord de l’écran.
      const minLeft = width < 600 ? 12 : 24;
      for (const sel of ['.kit-cta__btn', '#kit-compose-title', '#kit-filter-lead', '#kit-poster-filter button', '#kit-poster-grid .kit-card--poster']) {
        const left = await page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().left);
        expect(left, `marge gauche de ${sel}`).toBeGreaterThanOrEqual(minLeft);
        const right = await page.locator(sel).first().evaluate((el) => window.innerWidth - el.getBoundingClientRect().right);
        expect(right, `pas de débordement à droite : ${sel}`).toBeGreaterThanOrEqual(0);
      }
      expect(info.cards.length).toBeGreaterThan(1);
      expect(info.cards.some((c) => c.format !== 'tabloid'), 'galerie mixte : au moins un format autre que tabloïd').toBeTruthy();
      const rows = new Map();
      for (const c of info.cards) {
        expect(Math.abs(c.ratio - c.expected), `aperçu au format ${c.format}`).toBeLessThan(0.04);
        expect(c.fit, 'aperçu entier, sans rognage').toBe('contain');
        expect(Math.abs(c.imgH - c.boxH), 'image qui remplit son cadre').toBeLessThan(2);
        expect(c.dl, 'téléchargement et lien studio').toBeGreaterThanOrEqual(2);
        if (!rows.has(c.top)) rows.set(c.top, []);
        rows.get(c.top).push(c.h);
      }
      for (const hs of rows.values()) {
        expect(Math.max(...hs) - Math.min(...hs), 'hauteurs égales sur une rangée de même format').toBeLessThan(2);
      }
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
  const uneBtn = page.locator('#kit-poster-filter button[data-filter="une"]');
  await uneBtn.click();
  await expect(uneBtn).toHaveAttribute('aria-pressed', 'true');
  const shownUne = await page.$$eval('#kit-poster-grid .kit-card--poster:not([hidden])', (els) => els.map((e) => e.dataset.kind));
  expect(shownUne.length).toBeGreaterThan(0);
  expect(shownUne.every((k) => k === 'une')).toBe(true);
  const schoolBtn = page.locator('#kit-poster-filter button[data-filter="udem"]');
  await schoolBtn.click();
  await expect(schoolBtn).toHaveAttribute('aria-pressed', 'true');
  const shownSchool = await page.$$eval('#kit-poster-grid .kit-card--poster:not([hidden])', (els) => els.map((e) => e.dataset.campus));
  expect(shownSchool.length).toBeGreaterThan(0);
  expect(shownSchool.every((c) => c === 'udem')).toBe(true);
});

test('galerie d’affiches : aperçus campus sans bandeau mauve ni Scanne-moi @ci-critical', async ({ page }) => {
  test.setTimeout(60000);
  await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  await page.goto('/kit-media/', { waitUntil: 'domcontentloaded' });
  const cards = page.locator('#kit-poster-grid .kit-card--poster');
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  expect(n).toBeGreaterThan(8);
  const campusN = await page.locator('#kit-poster-grid .kit-card--example[data-kind="campus"]').count();
  const uneN = await page.locator('#kit-poster-grid .kit-card--example[data-kind="une"]').count();
  expect(campusN, 'affiches campus dans la galerie').toBeGreaterThan(2);
  expect(uneN, 'exemples de une dans la galerie').toBeGreaterThan(4);
  for (let i = 0; i < n; i += 1) {
    await cards.nth(i).scrollIntoViewIfNeeded();
    const img = cards.nth(i).locator('img');
    await expect(img).toHaveJSProperty('complete', true);
    await expect.poll(async () => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(100);
  }
  const bad = await page.evaluate(() => {
    const fail = [];
    const isPurple = (r, g, b) => r > 80 && b > 70 && r > g + 20 && b > g + 10;
    for (const card of document.querySelectorAll('#kit-poster-grid .kit-card--example[data-kind="campus"]')) {
      const img = card.querySelector('img');
      if (!img || !img.complete || img.naturalWidth < 100) {
        fail.push(`${card.dataset.campus || '?'} : image non chargée`);
        continue;
      }
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const w = c.width;
      const h = c.height;
      let purple = 0;
      let midN = 0;
      const mid = g.getImageData(Math.round(w * 0.12), Math.round(h * 0.34), Math.round(w * 0.76), Math.round(h * 0.14));
      for (let i = 0; i < mid.data.length; i += 4) {
        midN += 1;
        if (isPurple(mid.data[i], mid.data[i + 1], mid.data[i + 2])) purple += 1;
      }
      if (purple / midN > 0.02) {
        fail.push(`${img.getAttribute('alt') || card.dataset.campus} : bandeau mauve (${(purple / midN * 100).toFixed(1)} %)`);
      }
      /* « Scanne-moi » sous le QR : large plage de blanc juste sous le carré blanc (absent si qr=non). */
      const qrSearch = g.getImageData(Math.round(w * 0.2), Math.round(h * 0.5), Math.round(w * 0.6), Math.round(h * 0.4));
      let qrX0 = Infinity;
      let qrX1 = 0;
      let qrY0 = Infinity;
      let qrY1 = 0;
      const sw = Math.round(w * 0.6);
      for (let i = 0, y = 0; y < qrSearch.height; y += 1) {
        for (let x = 0; x < sw; x += 1, i += 4) {
          const Y = (qrSearch.data[i] + qrSearch.data[i + 1] + qrSearch.data[i + 2]) / 3;
          if (Y > 245) {
            if (x < qrX0) qrX0 = x;
            if (x > qrX1) qrX1 = x;
            if (y < qrY0) qrY0 = y;
            if (y > qrY1) qrY1 = y;
          }
        }
      }
      const qrH = qrY1 - qrY0;
      const qrW = qrX1 - qrX0;
      if (qrW > 80 && qrH > 80) {
        const absY0 = Math.round(h * 0.5) + qrY1 + 4;
        const absY1 = Math.min(Math.round(h * 0.90), absY0 + Math.round(h * 0.08));
        const absX0 = Math.round(w * 0.2) + qrX0 + Math.round(qrW * 0.1);
        const absX1 = Math.round(w * 0.2) + qrX0 + Math.round(qrW * 0.9);
        if (absY1 > absY0 && absX1 > absX0) {
          const strip = g.getImageData(absX0, absY0, absX1 - absX0, absY1 - absY0);
          let white = 0;
          const stripN = strip.data.length / 4;
          for (let i = 0; i < strip.data.length; i += 4) {
            if ((strip.data[i] + strip.data[i + 1] + strip.data[i + 2]) / 3 > 220) white += 1;
          }
          if (white / stripN > 0.08) {
            fail.push(`${img.getAttribute('alt') || card.dataset.campus} : texte type Scanne-moi sous le QR (${(white / stripN * 100).toFixed(1)} %)`);
          }
        }
      }
    }
    return fail;
  });
  expect(bad, bad.join(' ; ')).toEqual([]);
});
