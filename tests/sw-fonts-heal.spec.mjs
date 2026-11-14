import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Auto-réparation : une police périmée dans le cache du service worker
 * doit être remplacée par le fichier réseau, sans recharger la page.
 * (Le worker racine sert les polices en réseau d’abord, puis met à jour le cache.)
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const realFont = readFileSync(join(root, 'mobile/app/fonts/inter-400.woff2'));
const FONT_PATH = '/mobile/app/fonts/inter-400.woff2';
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');
const CACHE_NAME = (swSource.match(/const CACHE_NAME = "([^"]+)"/) || [])[1];

test.use({ serviceWorkers: 'allow' });

test.describe('polices — auto-réparation du service worker', () => {
  test('une police périmée en cache est remplacée sans recharger la page', async ({ page, baseURL }) => {
    expect(CACHE_NAME, 'nom de cache du sw racine').toBeTruthy();

    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      window.__radarStayAlive = 1;
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 20000 });

    await page.evaluate(async ({ cacheName, path }) => {
      const cache = await caches.open(cacheName);
      await cache.put(new Request(path, { cache: 'reload' }), new Response('STALE-FONT-BYTES', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }));
    }, { cacheName: CACHE_NAME, path: FONT_PATH });

    const poisoned = await page.evaluate(async ({ cacheName, path }) => {
      const cache = await caches.open(cacheName);
      const hit = await cache.match(path);
      return hit ? await hit.text() : null;
    }, { cacheName: CACHE_NAME, path: FONT_PATH });
    expect(poisoned).toBe('STALE-FONT-BYTES');

    const got = await page.evaluate(async (path) => {
      const res = await fetch(path, { cache: 'no-store' });
      const buf = new Uint8Array(await res.arrayBuffer());
      return {
        size: buf.length,
        head: Array.from(buf.slice(0, 4)),
        text: new TextDecoder().decode(buf.slice(0, 20)),
        stay: window.__radarStayAlive,
      };
    }, FONT_PATH);

    expect(got.stay, 'la page ne doit pas se recharger').toBe(1);
    expect(got.text).not.toBe('STALE-FONT-BYTES');
    expect(got.size).toBe(realFont.length);
    expect(got.head).toEqual(Array.from(realFont.subarray(0, 4)));
  });
});
