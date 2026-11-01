import { test, expect } from '@playwright/test';

// Impression (style-chrome.css, bloc @media print) : page de journal figée.
// Rien de fixe, rien d'interactif, rien qui dépasse la largeur imprimable,
// et le thème sombre s'imprime sur fond blanc.
// Largeur utile d'une page Letter avec les marges @page (13 mm de chaque côté).
const PRINT_WIDTH = 718;
const pages = ['/', '/feeds.html', '/sports/', '/radios/choq/', '/journaux/le-delit/'];

for (const url of pages) {
  for (const theme of ['light', 'dark']) {
    test(`impression propre : ${url} (${theme}) @ci-critical`, async ({ page }) => {
      await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
      await page.addInitScript((t) => { try { localStorage.setItem('radar-theme', t); } catch {} }, theme);
      await page.emulateMedia({ media: 'print', colorScheme: theme });
      await page.setViewportSize({ width: PRINT_WIDTH, height: 1000 });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const report = await page.evaluate((maxW) => {
        const visible = (el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].join('.') : '');
        const fixed = [];
        const overflow = [];
        const clipped = [];
        for (const el of document.body.querySelectorAll('*')) {
          if (!visible(el)) continue;
          if (el.closest('.sr-only, .visually-hidden')) continue;
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.position === 'sticky') fixed.push(label(el));
          const r = el.getBoundingClientRect();
          if (r.right > maxW + 2 || r.left < -2) overflow.push(label(el) + ' ' + Math.round(r.left) + '→' + Math.round(r.right));
          if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.overflowY === 'hidden' || cs.overflowY === 'clip')
              && el.scrollHeight > el.clientHeight + 2 && el.textContent.trim()) clipped.push(label(el));
        }
        const interactive = [...document.querySelectorAll('#tuner, #radar-player, .masthead-actions, button, select, input, textarea, .sports-page-tools, #page-tools')]
          .filter(visible).map(label);
        const bg = getComputedStyle(document.body).backgroundColor;
        const ink = getComputedStyle(document.body).color;
        return { fixed, overflow: overflow.slice(0, 10), clipped: clipped.slice(0, 10), interactive, bg, ink };
      }, PRINT_WIDTH);

      expect(report.fixed, 'éléments fixed/sticky visibles').toEqual([]);
      expect(report.interactive, 'contrôles interactifs visibles').toEqual([]);
      expect(report.overflow, 'éléments hors de la zone imprimable').toEqual([]);
      expect(report.clipped, 'contenu rogné par overflow').toEqual([]);
      expect(report.bg, 'fond blanc à l’impression').toBe('rgb(255, 255, 255)');
      expect(report.ink, 'texte noir à l’impression').toBe('rgb(0, 0, 0)');

      const pdf = await page.pdf({ format: 'Letter', printBackground: true });
      expect(pdf.byteLength).toBeGreaterThan(1000);
    });
  }
}
