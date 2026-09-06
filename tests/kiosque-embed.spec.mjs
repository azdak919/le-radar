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
    // Tooltip = périmètre site (journaux + radios + sports), pas « radios » seul.
    await expect(credit).toHaveAttribute(
      'title',
      /journaux.*radios.*sports|LE-RADAR\.ca/i,
    );

    const geometry = await page.evaluate(() => {
      const bar = document.getElementById('tuner');
      const creditEl = document.querySelector('a.tuner-embed-credit');
      const label = document.querySelector('.tuner-label');
      const dial = document.querySelector('.tuner-dial');
      const now = document.querySelector('.tuner-now');
      const onair = document.querySelector('.tuner-onair');
      const vol = document.getElementById('tuner-vol');
      if (!bar || !creditEl || !label || !dial || !now || !vol) return null;
      const b = bar.getBoundingClientRect();
      const c = creditEl.getBoundingClientRect();
      const d = dial.getBoundingClientRect();
      const n = now.getBoundingClientRect();
      return {
        credit: { left: c.left, right: c.right, top: c.top, bottom: c.bottom },
        bar: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width },
        dial: { left: d.left, right: d.right },
        now: { left: n.left, top: n.top, bottom: n.bottom },
        inLabel: label.contains(creditEl),
        onairHidden: onair ? getComputedStyle(onair).display === 'none' : true,
        labelPosition: getComputedStyle(label).position,
        leftDelta: Math.abs(c.left - n.left),
        volZ: Number(getComputedStyle(vol).zIndex) || 0,
      };
    });
    expect(geometry).toBeTruthy();
    expect(geometry.inLabel, 'crédit reste dans .tuner-label (DOM)').toBe(true);
    expect(geometry.onairHidden, 'EN ONDES masqué mobile').toBe(true);
    expect(geometry.labelPosition).toBe('absolute');
    // Bas de l’iframe
    expect(geometry.credit.bottom).toBeLessThanOrEqual(geometry.bar.bottom + 2);
    expect(geometry.credit.bottom).toBeGreaterThan(geometry.bar.bottom - 22);
    // Sous le panneau poste — pas dessiné par-dessus « À l’antenne ».
    expect(geometry.credit.top, 'crédit sous le panneau poste').toBeGreaterThanOrEqual(geometry.now.bottom - 1);
    // Aligné à gauche du panneau poste
    expect(geometry.leftDelta).toBeLessThanOrEqual(16);
    expect(geometry.credit.left).toBeGreaterThanOrEqual(geometry.dial.left - 4);
    expect(geometry.credit.left).toBeLessThan(geometry.bar.left + geometry.bar.width * 0.55);

    // Boutons alignés verticalement avec le panneau poste
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
    // Crédit bas-gauche : reste visible (plus de masquage à l’ouverture).
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector('a.tuner-embed-credit');
      if (!el) return false;
      const s = getComputedStyle(el);
      return Number(s.opacity) > 0.5 && s.pointerEvents !== 'none';
    })).toBe(true);

    const openState = await page.evaluate(() => {
      const bar = document.getElementById('tuner');
      const creditEl = document.querySelector('a.tuner-embed-credit');
      const slot = document.getElementById('tuner-vol-slot');
      const mute = document.getElementById('tuner-vol-mute');
      if (!bar || !creditEl || !slot || !mute) return null;
      const b = bar.getBoundingClientRect();
      const s = slot.getBoundingClientRect();
      const c = creditEl.getBoundingClientRect();
      const creditStyle = getComputedStyle(creditEl);
      const barBg = getComputedStyle(bar).backgroundColor;
      return {
        popoverVisible: s.width > 40 && s.height > 20 && getComputedStyle(slot).opacity !== '0',
        popoverExtendsBelowBar: s.bottom > b.bottom + 20,
        slotZ: Number(getComputedStyle(slot).zIndex) || 0,
        creditZ: Number(creditStyle.zIndex) || 0,
        creditVisible: Number(creditStyle.opacity) > 0.5,
        /* Crédit à gauche, popover à droite — pas de chevauchement utile. */
        creditLeftOfPopover: c.right <= s.left + 8 || c.left < b.left + b.width * 0.55,
        muteClickable: mute.getClientRects().length > 0
          && getComputedStyle(mute).pointerEvents !== 'none',
        /* Barre session opaque (pas de bandeau transparent / flou sous le popover). */
        barOpaque: barBg !== 'rgba(0, 0, 0, 0)' && barBg !== 'transparent',
        barBoxShadowNone: getComputedStyle(bar).boxShadow === 'none',
      };
    });
    expect(openState).toBeTruthy();
    expect(openState.popoverVisible, 'popover visible').toBe(true);
    expect(openState.popoverExtendsBelowBar, 'popover s’étend sous la barre').toBe(true);
    expect(openState.creditVisible, 'crédit reste visible').toBe(true);
    expect(openState.creditLeftOfPopover, 'crédit à gauche du popover').toBe(true);
    expect(openState.slotZ).toBeGreaterThan(openState.creditZ);
    expect(openState.muteClickable).toBe(true);
    expect(openState.barOpaque, 'fond barre opaque').toBe(true);
    expect(openState.barBoxShadowNone, 'pas d’ombre .tuner sous le popover').toBe(true);

    // Le mute reste actionnable (crédit ne capture pas le tap).
    await page.locator('#tuner-vol-mute').click({ force: false });

    // Fermer le popover : le crédit reste visible.
    await page.locator('#tuner-vol-toggle').click();
    await expect(page.locator('#tuner-vol')).not.toHaveClass(/is-open/);
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector('a.tuner-embed-credit');
      return el ? Number(getComputedStyle(el).opacity) : 0;
    })).toBeGreaterThan(0.5);
  });

  test('crédit SOUS EN ONDES en bureau + tablette kiosque', async ({ page }) => {
    for (const width of [1100, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/tuner-embed.html?station=chyz&surface=kiosque-v1', {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.locator('#tuner-play')).toBeVisible({ timeout: 15_000 });

      const geo = await page.evaluate(() => {
        const creditEl = document.querySelector('a.tuner-embed-credit');
        const onair = document.querySelector('.tuner-onair');
        const label = document.querySelector('.tuner-label');
        const dial = document.querySelector('.tuner-dial');
        if (!creditEl || !onair || !label || !dial) return null;
        const c = creditEl.getBoundingClientRect();
        const o = onair.getBoundingClientRect();
        const d = dial.getBoundingClientRect();
        return {
          inLabel: label.contains(creditEl),
          creditPosition: getComputedStyle(creditEl).position,
          onairVisible: getComputedStyle(onair).display !== 'none',
          underOnair: c.top >= o.top - 2 && c.left < o.right + 40,
          /* Pas sous le dial (centré) — à gauche sous EN ONDES. */
          leftOfDial: c.right <= d.left + 8 || c.left < d.left,
          visible: c.width > 0 && c.height > 0 && getComputedStyle(creditEl).opacity !== '0',
        };
      });
      expect(geo, `viewport ${width}`).toBeTruthy();
      expect(geo.inLabel, `viewport ${width}: dans .tuner-label`).toBe(true);
      expect(geo.onairVisible, `viewport ${width}: EN ONDES visible`).toBe(true);
      expect(geo.visible, `viewport ${width}: crédit visible`).toBe(true);
      expect(geo.underOnair, `viewport ${width}: sous EN ONDES`).toBe(true);
      expect(['static', 'relative'].includes(geo.creditPosition), `viewport ${width}: flux`).toBe(true);
    }
  });
});
