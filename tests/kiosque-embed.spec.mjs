import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vérifie que la démo LE-KIOSQUE charge bien le tuner-embed de LE-RADAR
 * (station, prêt, mute persistant) en pointant l’iframe vers le dépôt local.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KIOSQUE_DEMO = join(ROOT, '../le-kiosque/dist/demo');
const KIOSQUE_DEMO_ALT = join(ROOT, '../le-kiosque/examples/demo-journal/dist');

function demoRoot() {
  if (existsSync(join(KIOSQUE_DEMO, 'index.html'))) return KIOSQUE_DEMO;
  if (existsSync(join(KIOSQUE_DEMO_ALT, 'index.html'))) return KIOSQUE_DEMO_ALT;
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};

function staticServer(root) {
  return createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let rel = urlPath === '/' ? '/index.html' : urlPath;
      let file = normalize(join(root, rel));
      if (!file.startsWith(root)) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      if (existsSync(file) && statSync(file).isDirectory()) {
        file = join(file, 'index.html');
      }
      if (!existsSync(file)) {
        res.writeHead(404); res.end('not found'); return;
      }
      const body = readFileSync(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (err) {
      res.writeHead(500); res.end(String(err));
    }
  });
}

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve) => {
    server.listen(0, host, () => {
      const { port } = server.address();
      resolve({ port, origin: `http://${host}:${port}` });
    });
  });
}

test.describe('LE-KIOSQUE démo × tuner-embed LE-RADAR', () => {
  /** @type {import('node:http').Server|null} */
  let radarServer = null;
  /** @type {import('node:http').Server|null} */
  let kiosqueServer = null;
  let radarOrigin = '';
  let kiosqueOrigin = '';

  test.beforeAll(async () => {
    const demo = demoRoot();
    test.skip(!demo, 'Démo le-kiosque absente (dist/demo ou examples/demo-journal/dist)');

    radarServer = staticServer(ROOT);
    kiosqueServer = staticServer(demo);
    const radar = await listen(radarServer);
    const kiosque = await listen(kiosqueServer);
    radarOrigin = radar.origin;
    kiosqueOrigin = kiosque.origin;
  });

  test.afterAll(async () => {
    await Promise.all([
      new Promise((r) => (radarServer ? radarServer.close(() => r()) : r())),
      new Promise((r) => (kiosqueServer ? kiosqueServer.close(() => r()) : r())),
    ]);
  });

  test('la démo charge le tuner, pré-sélectionne CHYZ et respecte le mute mémorisé', async ({ page }) => {
    // Toute requête vers le-radar.ca (prod) → dépôt local (code de la session).
    await page.route('https://le-radar.ca/**', async (route) => {
      const target = route.request().url().replace('https://le-radar.ca', radarOrigin);
      const res = await page.request.fetch(target);
      await route.fulfill({
        status: res.status(),
        headers: res.headers(),
        body: await res.body(),
      });
    });

    await page.addInitScript(() => {
      // Appliqué aussi dans l’iframe same-site… non : origins différents
      // (kiosque local vs le-radar local). Le mute est posé dans le frame.
    });

    await page.goto(`${kiosqueOrigin}/`, { waitUntil: 'domcontentloaded' });

    const tuner = page.locator('radar-tuner');
    await expect(tuner).toBeAttached();
    // data-src doit viser l’embed avec station=chyz
    await expect(tuner).toHaveAttribute('data-src', /tuner-embed\.html.*station=chyz/);

    // Attendre le message ready → host visible
    await expect(tuner).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
    await expect(tuner).not.toBeHidden();

    const frame = page.frameLocator('radar-tuner iframe');
    await expect(frame.locator('#tuner-play')).toBeVisible({ timeout: 10_000 });
    await expect(frame.locator('#tuner-select')).toHaveValue('chyz', { timeout: 10_000 });

    // Mute dans l’iframe (origine le-radar locale)
    await frame.locator('#tuner-vol-mute').click({ force: true }).catch(async () => {
      // Popover fermé : ouvrir via le toggle puis muter
      await frame.locator('#tuner-vol-toggle').click();
      await frame.locator('#tuner-vol-mute').click();
    });

    await expect.poll(() => frame.locator('html').evaluate(() => localStorage.getItem('radar-player-muted')))
      .toBe('1');

    // Recharger l’iframe seule (navigation embed)
    const iframeEl = page.locator('radar-tuner iframe');
    const embedUrl = await iframeEl.getAttribute('src');
    expect(embedUrl).toMatch(/tuner-embed\.html/);
    await page.frameLocator('radar-tuner iframe').locator('html').evaluate(() => {
      location.reload();
    });
    // Après reload, le custom element peut recréer le frame — re-attendre
    await expect(page.locator('radar-tuner')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
    const frame2 = page.frameLocator('radar-tuner iframe');
    await expect.poll(() => frame2.locator('html').evaluate(() => ({
      muted: localStorage.getItem('radar-player-muted'),
      ui: document.getElementById('tuner-vol')?.classList.contains('is-muted'),
      audioMuted: document.getElementById('radar-player')?.muted,
    })), { timeout: 10_000 }).toMatchObject({
      muted: '1',
      ui: true,
      audioMuted: true,
    });
  });
});
