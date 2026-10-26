import { expect, test } from '@playwright/test';

// Pomo et Solitaire sur téléphone (360/390/412) et bureau : pas de
// débordement horizontal, l'essentiel tient sur un écran sans défiler,
// en-tête sur une seule rangée sans chevauchement, cibles tactiles ≥ 44 px,
// aucune erreur console (CSP comprise) et syntoniseur #252830 lisible.

const ESSENTIAL = {
  pomo: ['nav.top-right-actions', '#pomo-widget .pomo-controls', '#quote-card'],
  solitaire: ['nav.game-toolbar', '#game-board'],
};
const BAR = { pomo: '.app-toolbar-chrome', solitaire: '.game-toolbar-chrome' };

function lum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const app of ['pomo', 'solitaire']) {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 412]) {
      test(`${app} ${theme} ${width}px : tient sur un écran, sans débordement ni erreur @ci-critical`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme, serviceWorkers: 'block' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('radar-theme', t); } catch {} }, theme);
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(`/${app}/`, { waitUntil: 'load' });
        await page.waitForTimeout(1500);

        const r = await page.evaluate(({ ess, bar }) => {
          const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden'; };
          const btns = [...document.querySelectorAll(`${bar} .toolbar-btn`)].filter(vis).map((e) => e.getBoundingClientRect());
          const overlaps = [];
          btns.forEach((a, i) => btns.slice(i + 1).forEach((b) => {
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push([a.left, b.left]);
          }));
          return {
            sw: document.documentElement.scrollWidth,
            bottoms: ess.map((s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().bottom) : -1; }),
            rows: new Set(btns.map((b) => Math.round(b.top + b.height / 2))).size,
            minH: Math.min(...btns.map((b) => b.height)),
            minW: Math.min(...btns.map((b) => b.width)),
            overlaps,
            vh: innerHeight,
          };
        }, { ess: ESSENTIAL[app], bar: BAR[app] });

        expect(r.sw, 'débordement horizontal').toBeLessThanOrEqual(width);
        for (const b of r.bottoms) { expect(b).toBeGreaterThan(0); expect(b, 'élément essentiel hors écran').toBeLessThanOrEqual(r.vh); }
        expect(r.rows, 'en-tête sur une rangée').toBe(1);
        expect(r.minH).toBeGreaterThanOrEqual(44);
        expect(r.minW).toBeGreaterThanOrEqual(36);
        expect(r.overlaps).toEqual([]);

        const frame = page.frames().find((f) => f.url().includes('tuner-embed'));
        if (frame) {
          const t = await frame.evaluate(() => {
            const tuner = document.querySelector('.tuner');
            const name = document.querySelector('.tuner-now-name');
            const now = document.querySelector('.tuner-now');
            return {
              bg: getComputedStyle(tuner).backgroundColor,
              ink: getComputedStyle(name).color,
              filter: getComputedStyle(tuner).backdropFilter + getComputedStyle(name).filter,
              chevron: getComputedStyle(now, '::after').content,
            };
          });
          expect(t.bg).toBe('rgb(37, 40, 48)');
          expect(contrast(t.ink, t.bg), 'contraste du poste').toBeGreaterThanOrEqual(4.5);
          expect(t.filter).not.toMatch(/blur/);
          expect(['none', 'normal']).toContain(t.chevron);
        }
        expect(errors, 'erreurs console').toEqual([]);
        await ctx.close();
      });
    }
  }
}

test('pomo bureau : minuterie et citation côte à côte @ci-critical', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/pomo/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const a = document.querySelector('#pomo-widget').getBoundingClientRect();
    const q = document.querySelector('#quote-card').getBoundingClientRect();
    return { aR: a.right, qL: q.left, qW: q.width, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, vh: innerHeight };
  });
  expect(r.qL).toBeGreaterThanOrEqual(r.aR);
  expect(r.qW).toBeLessThanOrEqual(520);
  expect(r.sw).toBeLessThanOrEqual(1280);
  expect(r.sh).toBeLessThanOrEqual(r.vh);
  await ctx.close();
});

// Contrôles de partie du Solitaire : une seule rangée (actions + coups/temps),
// cibles ≥ 44 px, nom accessible, en français et en anglais.
for (const locale of ['fr-CA', 'en-US']) {
  for (const width of [360, 390, 412]) {
    test(`solitaire ${locale} ${width}px : contrôles sur une seule rangée @ci-critical`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, locale, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await page.goto('/solitaire/', { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => {
        const els = [...document.querySelectorAll('.game-toolbar-game-actions .toolbar-btn'), document.querySelector('#toolbar-stats')];
        const boxes = els.map((e) => e.getBoundingClientRect());
        const mids = boxes.map((b) => b.top + b.height / 2);
        return {
          n: els.length,
          spread: Math.max(...mids) - Math.min(...mids),
          minBtn: Math.min(...boxes.slice(0, -1).map((b) => Math.min(b.width, b.height))),
          maxRight: Math.max(...boxes.map((b) => b.right)),
          names: els.slice(0, -1).map((e) => e.getAttribute('aria-label') || ''),
          lang: document.documentElement.lang,
        };
      });
      expect(r.n).toBe(6);
      expect(r.spread, 'contrôles sur plusieurs rangées').toBeLessThanOrEqual(4);
      expect(r.minBtn).toBeGreaterThanOrEqual(44);
      expect(r.maxRight).toBeLessThanOrEqual(width);
      for (const name of r.names) expect(name.length).toBeGreaterThan(0);
      if (locale === 'fr-CA') expect(r.names).toContain('Indice');
      else expect(r.names).toContain('Hint');
      await ctx.close();
    });
  }
}

// Pomo : la minuterie remplit la hauteur libre, sans chevauchement, y compris
// sur un écran court (360 × 640).
for (const [width, height, minRing] of [[360, 640, 132], [360, 780, 200], [390, 844, 240], [412, 915, 260]]) {
  test(`pomo ${width}×${height} : minuterie agrandie, rien ne se chevauche @ci-critical`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto('/pomo/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const R = (s) => document.querySelector(s).getBoundingClientRect();
      return { sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, vh: innerHeight,
        nav: R('nav').bottom, w: R('#pomo-widget'), ring: R('#pomo-widget .pomo-ring-wrapper'), ctl: R('#pomo-widget .pomo-controls'),
        q: R('#quote-card'), ft: R('.bottom-badges').top };
    });
    expect(r.sh).toBeLessThanOrEqual(r.vh);
    expect(r.sw).toBeLessThanOrEqual(width);
    expect(r.ring.width).toBeGreaterThanOrEqual(minRing);
    expect(r.w.top).toBeGreaterThanOrEqual(r.nav);
    expect(r.ring.top).toBeGreaterThanOrEqual(r.w.top);
    expect(r.ctl.top).toBeGreaterThanOrEqual(r.ring.bottom - 1);
    expect(r.ctl.bottom).toBeLessThanOrEqual(r.w.bottom + 1);
    expect(r.q.top).toBeGreaterThanOrEqual(r.w.bottom);
    expect(r.q.bottom).toBeLessThanOrEqual(r.ft + 1);
    await ctx.close();
  });
}

// Pomo : réduction / rouverture des cartes, aria-expanded, sens des chevrons,
// persistance au rechargement, plein écran, espace récupéré.
for (const [width, height] of [[360, 640], [390, 844], [412, 915], [1280, 800]]) {
  test(`pomo ${width}px : réduire et rouvrir les cartes @ci-critical`, async ({ browser }) => {
    const touch = width < 1000;
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto('/pomo/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const act = async (sel) => { await (touch ? page.tap(sel) : page.click(sel)); await page.waitForTimeout(600); };
    const st = () => page.evaluate(() => {
      const vis = (s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; };
      const R = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height }; };
      const up = (s) => /15\.41/.test(document.querySelector(`${s} path`).getAttribute('d'));
      const ae = (s) => document.querySelector(s).getAttribute('aria-expanded');
      return {
        sh: document.documentElement.scrollHeight, vh: innerHeight, sw: document.documentElement.scrollWidth, vw: innerWidth,
        pomoOpen: vis('#pomo-widget'), quoteOpen: vis('.quote-inner'),
        pChip: vis('#pomo-restore-btn'), qChip: vis('#quote-restore-btn'),
        ae: [ae('#pomo-minimize-btn'), ae('#pomo-restore-btn'), ae('#quote-minimize-btn'), ae('#quote-restore-btn')],
        up: [up('#pomo-minimize-btn'), up('#pomo-restore-btn'), up('#quote-minimize-btn'), up('#quote-restore-btn')],
        ring: vis('#pomo-widget') ? R('#pomo-widget .pomo-ring-wrapper').h : 0,
        quoteH: R('#quote-card').h,
        nav: R('nav').bottom, ft: R('.bottom-badges').top,
      };
    });
    const sane = (s) => {
      expect(s.sh).toBeLessThanOrEqual(s.vh);
      expect(s.sw).toBeLessThanOrEqual(s.vw);
      // Réduire la minuterie : ⌃ ; la rouvrir : ⌄. Citation (en bas) : ⌄ / ⌃.
      expect(s.up).toEqual([true, false, false, true]);
    };
    const s0 = await st();
    sane(s0);
    expect(s0.ae).toEqual(['true', 'true', 'true', 'true']);

    await act('#pomo-minimize-btn');
    const s1 = await st(); sane(s1);
    expect([s1.pomoOpen, s1.pChip, s1.quoteOpen]).toEqual([false, true, true]);
    expect(s1.ae.slice(0, 2)).toEqual(['false', 'false']);
    expect(s1.quoteH).toBeGreaterThan(s0.quoteH);

    await act('#quote-minimize-btn');
    const s2 = await st(); sane(s2);
    expect([s2.pChip, s2.qChip]).toEqual([true, true]);
    expect(s2.ae).toEqual(['false', 'false', 'false', 'false']);

    await act('#pomo-restore-btn');
    const s3 = await st(); sane(s3);
    expect([s3.pomoOpen, s3.qChip]).toEqual([true, true]);
    expect(s3.ring).toBeGreaterThan(s0.ring);

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const s4 = await st(); sane(s4);
    expect([s4.pomoOpen, s4.qChip]).toEqual([true, true]);
    expect(s4.ae.slice(2)).toEqual(['false', 'false']);

    await act('#pomo-fullscreen-btn');
    expect(await page.locator('#pomo-fullpage.open').count()).toBe(1);
    await act('#pomo-fullpage-close');
    expect(await page.locator('#pomo-fullpage.open').count()).toBe(0);
    sane(await st());

    await act('#quote-restore-btn');
    const s5 = await st(); sane(s5);
    expect([s5.pomoOpen, s5.quoteOpen, s5.pChip, s5.qChip]).toEqual([true, true, false, false]);
    expect(s5.ae).toEqual(['true', 'true', 'true', 'true']);
    await ctx.close();
  });
}
