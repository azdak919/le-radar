import { test, expect } from '@playwright/test';

// Impression (style-chrome.css, bloc @media print) : page de journal figée.
// Rien de fixe, rien d'interactif, rien qui dépasse la largeur imprimable,
// et le thème sombre s'imprime sur fond blanc.
// Largeur utile d'une page Letter avec les marges @page (13 mm de chaque côté).
const PRINT_WIDTH = 718;
const pages = ['/', '/feeds.html', '/sports/', '/radios/choq/', '/journaux/le-delit/', '/article/'];

for (const url of pages) {
  for (const theme of ['light', 'dark']) {
    test(`impression propre : ${url} (${theme}) @ci-critical`, async ({ page }) => {
      await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
      await page.addInitScript((t) => { try { localStorage.setItem('radar-theme', t); } catch {} }, theme);
      await page.emulateMedia({ media: 'print', colorScheme: theme });
      await page.setViewportSize({ width: PRINT_WIDTH, height: 1000 });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (url === '/article/') {
        // Fiche du premier article publié : même identifiant que l'app.
        const id = await page.evaluate(async () => {
          const d = await (await fetch('../news.json')).json();
          return window.RadarMobile.articleId(d.items[0].link);
        });
        await page.goto(`${url}?id=${id}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('article.fiche h1')).toBeVisible();
        const printUrl = await page.locator('article.fiche').getAttribute('data-print-url');
        expect(printUrl, 'URL de l’article imprimée').toMatch(/^https?:\/\//);
      }
      // Le prérendu SEO reste volontairement masqué jusqu’au rendu du fil.
      // Attendre ce signal évite de mesurer ses boîtes rognées sur un runner lent.
      if (url === '/') await page.locator('#news-list[data-ready]').waitFor({ state: 'attached' });
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
        const interactive = [...document.querySelectorAll('#tuner, #radar-player, .masthead-actions, button, select, input, textarea, .sports-page-tools, #page-tools, a.wide.primary')]
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

// Non-régression des correctifs d'impression (accueil) : typographie, pastille,
// justification, URL, QR et mot-symbole.
test('impression accueil : typo, pastille, QR, sans URL utm @ci-critical', async ({ page }) => {
  await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  await page.addInitScript(() => { try { localStorage.setItem('radar-theme', 'dark'); } catch {} });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#news-list[data-ready]').waitFor({ state: 'attached' });
  await page.waitForTimeout(1500);
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  /* Le fil du dépôt n’a pas toujours un article « frais » au moment de la CI :
   * on pose la classe sur une horloge existante pour vérifier la feuille d’impression. */
  await page.evaluate(() => {
    const el = document.querySelector('.article-time.is-fresh') || document.querySelector('.article-time');
    if (el) el.classList.add('is-fresh');
  });

  const styles = await page.evaluate(() => {
    const title = document.querySelector('.article-title');
    const brief = document.querySelector('.article-brief.is-truncated') || document.querySelector('.article-brief');
    const fresh = document.querySelector('.article-time.is-fresh');
    const source = document.querySelector('.article-source');
    const label = document.querySelector('.article-byline__label');
    const promo = document.querySelector('.print-promo');
    const qr = document.querySelector('.print-promo__qr');
    const mark = document.querySelector('.print-promo__brand, .print-promo__mark');
    const scan = document.querySelector('.print-promo__scan');
    const after = (el) => {
      if (!el) return { content: 'none' };
      const cs = getComputedStyle(el, '::after');
      return { content: cs.content, display: cs.display };
    };
    const before = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el, '::before');
      return {
        content: cs.content,
        width: cs.width,
        height: cs.height,
        background: cs.backgroundColor,
        display: cs.display,
      };
    };
    const article = document.querySelector('a.article[href^="http"]');
    const authorLink = document.querySelector('.site-foot__author-link');
    return {
      bg: getComputedStyle(document.body).backgroundColor,
      titleFont: title ? getComputedStyle(title).fontFamily : '',
      briefAlign: brief ? getComputedStyle(brief).textAlign : '',
      freshBefore: before(fresh),
      sourceBefore: before(source),
      labelColor: label ? getComputedStyle(label).color : '',
      promoDisplay: promo ? getComputedStyle(promo).display : 'missing',
      promoScan: scan ? scan.textContent : '',
      qrSrc: qr ? qr.getAttribute('src') || qr.src : '',
      markText: mark ? (mark.textContent || '').replace(/\s+/g, '') : '',
      articleAfter: after(article),
      authorAfter: after(authorLink),
      instShortHidden: (() => {
        const el = document.querySelector('.article-inst__short');
        return !el || getComputedStyle(el).display === 'none';
      })(),
      heroDisplay: (() => {
        const hero = document.querySelector('.news-hero');
        return hero ? getComputedStyle(hero).display : '';
      })(),
    };
  });

  expect(styles.bg, 'thème sombre imprimé en clair').toBe('rgb(255, 255, 255)');
  expect(styles.titleFont.toLowerCase(), 'titres en serif de marque').toMatch(/source serif|georgia|times/);
  expect(['start', 'left'], 'extrait non justifié').toContain(styles.briefAlign);
  expect(styles.freshBefore, 'pastille fraîche toujours présente').toBeTruthy();
  expect(styles.freshBefore.background, 'pastille rouge absente').toMatch(/rgba\(0, 0, 0, 0\)|transparent|rgb\(0, 0, 0\)/);
  // rgb(0,0,0) would be bad if it's a filled box; width should not be a 6px circle.
  const freshW = styles.freshBefore.width;
  expect(freshW === 'auto' || freshW === '0px' || !freshW, `point frais sans disque (${freshW})`).toBeTruthy();
  expect(styles.labelColor, 'Par/By dans la couleur du site').toBe('rgb(108, 33, 99)');
  expect(styles.promoDisplay, 'QR visible à l’impression').toMatch(/flex|block|grid/);
  expect(styles.promoScan, 'libellé Scanne-moi').toMatch(/Scanne-moi|Scan me/);
  expect(styles.qrSrc, 'QR local').toMatch(/qr-le-radar\.svg/);
  expect(styles.markText, 'mot-symbole officiel').toMatch(/LE.RADAR\.ca/);
  expect(styles.articleAfter.content, 'pas d’URL d’article en ::after').toMatch(/^(none|"")$/);
  expect(styles.authorAfter.content, 'pas d’URL buymeacoffee').toMatch(/^(none|"")$/);
  expect(styles.instShortHidden, 'acronyme institution masqué (nom complet seulement)').toBe(true);
  expect(styles.heroDisplay, 'bloc une en grille, pas en colonnes orphelines').toBe('grid');

  const pdf = await page.pdf({ format: 'Letter', printBackground: true, displayHeaderFooter: false });
  expect(pdf.byteLength).toBeGreaterThan(1000);

  const { writeFileSync, unlinkSync, existsSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tmp = join(tmpdir(), `radar-print-${Date.now()}.pdf`);
  writeFileSync(tmp, pdf);
  let text = '';
  try {
    text = execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8' });
  } catch {
    text = '';
  }
  if (existsSync(tmp)) unlinkSync(tmp);
  if (text) {
    expect(text, 'aucun paramètre utm imprimé').not.toMatch(/utm_/i);
    expect(text, 'pas de lien buymeacoffee').not.toMatch(/buymeacoffee/i);
    expect(text, 'pas d’URL GPL').not.toMatch(/gnu\.org\/licenses/i);
    const compact = text.replace(/[\s\u00a0]+/g, ' ');
    const squeezed = text.replace(/\s+/g, '');
    expect(squeezed, 'QR accompagné du mot-symbole').toMatch(/SCANNE-MOI|SCANNEMOI|SCANME/i);
    expect(compact, 'phrase sous le QR').toMatch(/fil étudiant|student wire/i);
    expect(compact, 'suite avec mot-symbole').toMatch(/Suite sur|Continued on/i);
    expect(compact, 'mot-symbole LE-RADAR.ca').toMatch(/LE.?RADAR\.ca/i);
  }
});

test('impression accueil : promo masquée à l’écran @ci-critical', async ({ page }) => {
  await page.route((u) => !u.href.startsWith('http://127.0.0.1'), (r) => r.abort());
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#news-list[data-ready]').waitFor({ state: 'attached' });
  await page.waitForTimeout(800);
  const display = await page.locator('.print-promo').evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe('none');
});
