import { expect, test } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Contrat d’intégration LE-KIOSQUE × LE-RADAR.
 *
 * 1) La démo embarque bien le tuner (markup + station + surface).
 * 2) L’URL tuner-embed (surface kiosque-v1) hydrate le sélecteur et le mute
 *    — c’est le même document que charge l’iframe de la démo en production.
 *
 * Le host kiosque.js n’accepte que origin https://le-radar.ca pour le
 * postMessage ; un test 100 % local de l’iframe croisée est fragile (timeout
 * host 6.5s, origine). On valide donc le markup démo + le document embed.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEMO_HTML_CANDIDATES = [
  join(ROOT, '../le-kiosque/examples/demo-journal/dist/index.html'),
  join(ROOT, '../le-kiosque/dist/demo/index.html'),
];

function readDemoHtml() {
  for (const p of DEMO_HTML_CANDIDATES) {
    if (existsSync(p)) return { path: p, html: readFileSync(p, 'utf8') };
  }
  return null;
}

test.describe('LE-KIOSQUE démo × tuner-embed LE-RADAR', () => {
  test('la démo embarque le tuner-embed CHYZ (surface kiosque-v1)', () => {
    const demo = readDemoHtml();
    test.skip(!demo, 'Démo absente : cd le-kiosque && npm run demo:build');
    expect(demo.html, demo.path).toMatch(/<radar-tuner\b/);
    expect(demo.html).toMatch(/tuner-embed\.html\?[^"']*station=chyz/);
    expect(demo.html).toMatch(/surface=kiosque-v1/);
    expect(demo.html).toMatch(/assets\/kiosque\.js|\/kiosque\.js/);
  });

  test('tuner-embed surface kiosque hydrate CHYZ et le mute mémorisé', async ({ page }) => {
    // Servi par le webServer Playwright (127.0.0.1:4173 = dépôt le-radar).
    await page.addInitScript(() => {
      try {
        localStorage.setItem('radar-player-vol', '0.6');
        localStorage.setItem('radar-player-vol-version', '3');
        localStorage.setItem('radar-player-muted', '1');
        localStorage.removeItem('radar-player-session-v1');
      } catch { /* */ }
    });

    await page.goto('/tuner-embed.html?station=chyz&surface=kiosque-v1', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.locator('html')).toHaveAttribute('data-embed', 'tuner');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.surface))
      .toBe('kiosque-v1');

    await expect(page.locator('#tuner-select option[value="chyz"]')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('#tuner-select')).toHaveValue('chyz');
    await expect(page.locator('#tuner-play')).toBeVisible();

    await expect.poll(() => page.evaluate(() => ({
      muted: localStorage.getItem('radar-player-muted'),
      ui: document.getElementById('tuner-vol')?.classList.contains('is-muted'),
      audioMuted: document.getElementById('radar-player')?.muted,
      options: document.querySelectorAll('#tuner-select option:not([disabled])').length,
    }))).toMatchObject({
      muted: '1',
      ui: true,
      audioMuted: true,
    });

    await expect.poll(() => page.evaluate(() =>
      document.querySelectorAll('#tuner-select option:not([disabled])').length)).toBeGreaterThan(0);

    const embedJs = await page.locator('script[src*="embed.js"]').getAttribute('src');
    // Cache-bust aligné sur tuner-embed.html (ne pas figer une vieille révision).
    expect(embedJs || '').toMatch(/embed\.js\?v=\d+/);
    const htmlVer = await page.locator('script[src*="embed.js"]').evaluate((el) => {
      const m = String(el.getAttribute('src') || '').match(/[?&]v=(\d+)/);
      return m ? m[1] : '';
    });
    expect(Number(htmlVer)).toBeGreaterThanOrEqual(568);
  });

  test('crédit le-radar.ca bas-gauche sous le dial sans collision volume (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tuner-embed.html?station=chyz&surface=kiosque-v1', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('#tuner-play')).toBeVisible({ timeout: 15_000 });

    const credit = page.locator('a.tuner-embed-credit');
    await expect(credit).toBeVisible();
    await expect(credit).toContainText('le-radar.ca');

    const geometry = await page.evaluate(() => {
      const bar = document.getElementById('tuner');
      const creditEl = document.querySelector('a.tuner-embed-credit');
      const dial = document.querySelector('.tuner-dial');
      const now = document.querySelector('.tuner-now');
      const volBtn = document.getElementById('tuner-vol-toggle');
      const vol = document.getElementById('tuner-vol');
      if (!bar || !creditEl || !dial || !now || !volBtn || !vol) return null;
      const b = bar.getBoundingClientRect();
      const c = creditEl.getBoundingClientRect();
      const d = dial.getBoundingClientRect();
      const n = now.getBoundingClientRect();
      const creditStyle = getComputedStyle(creditEl);
      return {
        credit: { left: c.left, right: c.right, top: c.top, bottom: c.bottom },
        bar: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width },
        dial: { left: d.left, right: d.right, top: d.top, bottom: d.bottom },
        now: { left: n.left, right: n.right },
        inDial: dial.contains(creditEl),
        creditPosition: creditStyle.position,
        /* Aligné à gauche du panneau poste (tolérance 14 px = padding). */
        leftDelta: Math.abs(c.left - n.left),
        zIndex: Number(creditStyle.zIndex) || 0,
        volZ: Number(getComputedStyle(vol).zIndex) || 0,
      };
    });
    expect(geometry).toBeTruthy();
    expect(geometry.inDial, 'crédit dans .tuner-dial (synthétiseur)').toBe(true);
    expect(geometry.creditPosition).toBe('absolute');
    // Bas de l’iframe : le bas du crédit est dans les 22 px inférieurs de la barre.
    expect(geometry.credit.bottom).toBeLessThanOrEqual(geometry.bar.bottom + 2);
    expect(geometry.credit.bottom).toBeGreaterThan(geometry.bar.bottom - 22);
    // Mobile : gauche du panneau poste/émissions, pas centré ni bas-droite barre.
    expect(geometry.leftDelta).toBeLessThanOrEqual(14);
    expect(geometry.credit.left).toBeGreaterThanOrEqual(geometry.dial.left - 2);
    expect(geometry.credit.right).toBeLessThanOrEqual(geometry.dial.right + 2);
    expect(geometry.credit.left).toBeLessThan(geometry.bar.left + geometry.bar.width * 0.55);
    // Le volume reste au-dessus du crédit pour le hit-test.
    expect(geometry.volZ).toBeGreaterThan(geometry.zIndex);

    // Boutons alignés verticalement avec le panneau poste (pas de décalage crédit).
    const align = await page.evaluate(() => {
      const now = document.querySelector('.tuner-now');
      const prev = document.getElementById('tuner-prev');
      const play = document.getElementById('tuner-play');
      if (!now || !prev || !play) return null;
      const n = now.getBoundingClientRect();
      const p = prev.getBoundingClientRect();
      const pl = play.getBoundingClientRect();
      const nowMid = (n.top + n.bottom) / 2;
      return {
        prevDelta: Math.abs(((p.top + p.bottom) / 2) - nowMid),
        playDelta: Math.abs(((pl.top + pl.bottom) / 2) - nowMid),
      };
    });
    expect(align).toBeTruthy();
    expect(align.prevDelta, 'prev aligné au panneau poste').toBeLessThanOrEqual(4);
    expect(align.playDelta, 'play aligné au panneau poste').toBeLessThanOrEqual(4);

    // EQ en buffering : masqué dans l’iframe (évite le squeeze mobile).
    await page.evaluate(() => {
      document.getElementById('tuner')?.classList.add('is-buffering');
    });
    await expect.poll(() => page.evaluate(() => {
      const eq = document.getElementById('tuner-eq');
      return eq ? getComputedStyle(eq).display : 'none';
    })).toBe('none');
    await page.evaluate(() => {
      document.getElementById('tuner')?.classList.remove('is-buffering');
    });

    // Toasts absents / invisibles dans l’iframe.
    await expect.poll(() => page.evaluate(() => {
      const t = document.getElementById('toast');
      if (!t) return true;
      const s = getComputedStyle(t);
      return s.display === 'none' || s.visibility === 'hidden';
    })).toBe(true);

    // Ouvrir le popover volume (téléphone).
    await page.locator('#tuner-vol-toggle').click();
    await expect(page.locator('#tuner-vol')).toHaveClass(/is-open/);
    // :has(.is-open) masque le crédit — attendre le style appliqué.
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector('a.tuner-embed-credit');
      if (!el) return false;
      const s = getComputedStyle(el);
      return Number(s.opacity) === 0 && s.pointerEvents === 'none';
    })).toBe(true);

    const openState = await page.evaluate(() => {
      const bar = document.getElementById('tuner');
      const creditEl = document.querySelector('a.tuner-embed-credit');
      const slot = document.getElementById('tuner-vol-slot');
      const mute = document.getElementById('tuner-vol-mute');
      if (!bar || !creditEl || !slot || !mute) return null;
      const b = bar.getBoundingClientRect();
      const s = slot.getBoundingClientRect();
      const creditStyle = getComputedStyle(creditEl);
      return {
        popoverVisible: s.width > 40 && s.height > 20 && getComputedStyle(slot).opacity !== '0',
        popoverExtendsBelowBar: s.bottom > b.bottom + 20,
        slotZ: Number(getComputedStyle(slot).zIndex) || 0,
        creditZ: Number(creditStyle.zIndex) || 0,
        muteClickable: mute.getClientRects().length > 0
          && getComputedStyle(mute).pointerEvents !== 'none',
      };
    });
    expect(openState).toBeTruthy();
    expect(openState.popoverVisible, 'popover visible').toBe(true);
    expect(openState.popoverExtendsBelowBar, 'popover s’étend sous la barre').toBe(true);
    expect(openState.slotZ).toBeGreaterThan(openState.creditZ);
    expect(openState.muteClickable).toBe(true);

    // Le mute reste actionnable (crédit ne capture pas le tap).
    await page.locator('#tuner-vol-mute').click({ force: false });

    // Fermer le popover : le crédit réapparaît.
    await page.locator('#tuner-vol-toggle').click();
    await expect(page.locator('#tuner-vol')).not.toHaveClass(/is-open/);
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector('a.tuner-embed-credit');
      return el ? Number(getComputedStyle(el).opacity) : 0;
    })).toBeGreaterThan(0.5);
  });

  test('crédit bas-centré sous le dial en largeur bureau kiosque', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/tuner-embed.html?station=chyz&surface=kiosque-v1', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('#tuner-play')).toBeVisible({ timeout: 15_000 });

    const geo = await page.evaluate(() => {
      const bar = document.getElementById('tuner');
      const creditEl = document.querySelector('a.tuner-embed-credit');
      const dial = document.querySelector('.tuner-dial');
      const now = document.querySelector('.tuner-now');
      if (!bar || !creditEl || !dial || !now) return null;
      const b = bar.getBoundingClientRect();
      const c = creditEl.getBoundingClientRect();
      const d = dial.getBoundingClientRect();
      const n = now.getBoundingClientRect();
      const creditCx = (c.left + c.right) / 2;
      const dialCx = (d.left + d.right) / 2;
      return {
        creditPosition: getComputedStyle(creditEl).position,
        inDial: dial.contains(creditEl),
        visible: c.width > 0 && c.height > 0 && getComputedStyle(creditEl).opacity !== '0',
        /* Sous le panneau poste/émissions. */
        underNow: c.top >= n.bottom - 4,
        centerDelta: Math.abs(creditCx - dialCx),
        withinBar: c.bottom <= b.bottom + 2 && c.top >= b.top - 2,
        withinDialX: c.left >= d.left - 2 && c.right <= d.right + 2,
      };
    });
    expect(geo).toBeTruthy();
    expect(geo.inDial).toBe(true);
    expect(geo.visible).toBe(true);
    expect(geo.withinBar).toBe(true);
    expect(geo.underNow).toBe(true);
    expect(geo.centerDelta).toBeLessThanOrEqual(12);
    expect(geo.withinDialX).toBe(true);
    expect(geo.creditPosition).toBe('absolute');
  });
});
