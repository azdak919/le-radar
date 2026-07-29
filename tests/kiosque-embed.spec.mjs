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
});
