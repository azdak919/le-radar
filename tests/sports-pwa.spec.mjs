/**
 * « Au tableau » (/sports/) — app installable, au même rang que Pomodoro et
 * Solitaire.
 *
 * Tourne dans le projet `pwa` de playwright.config.mjs : c'est le seul où les
 * service workers sont autorisés. Ailleurs ils sont bloqués volontairement,
 * un worker survivant d'un test à l'autre faussant les mesures de chargement.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('manifeste : portée, icônes et mode autonome', async ({ page }) => {
  await page.goto('/sports/', { waitUntil: 'commit' });

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href, '/sports/ doit porter son propre manifeste, pas celui du site').toBe('site.webmanifest');

  const manifest = await page.evaluate(async () => (await fetch('site.webmanifest')).json());
  expect(manifest.id).toBe('/sports/');
  expect(manifest.scope).toBe('./');
  expect(manifest.start_url).toBe('./');
  expect(manifest.display).toBe('standalone');

  // Sans icône maskable, Android rogne l'icône dans un cercle blanc.
  const purposes = manifest.icons.flatMap((i) => (i.purpose || 'any').split(/\s+/));
  expect(purposes).toContain('any');
  expect(purposes).toContain('maskable');

  for (const icon of manifest.icons) {
    const status = await page.evaluate(async (src) => (await fetch(src)).status, icon.src);
    expect(status, `icône ${icon.src} introuvable`).toBe(200);
  }
});

test('service worker : enregistrement, portée isolée et hors-ligne', async ({ page, context }) => {
  await page.goto('/sports/', { waitUntil: 'commit' });

  // L'enregistrement passe par app-sw-register.js, chargé au load : la CSP de
  // la page interdit le script en ligne.
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope, 'la portée doit rester /sports/').toMatch(/\/sports\/$/);

  await page.reload({ waitUntil: 'commit' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });

  // Laisser le shell finir de se mettre en cache avant de couper le réseau.
  await page.waitForTimeout(2500);

  await context.setOffline(true);
  // `domcontentloaded` et non `commit` : la page pèse 1,4 Mo, et `commit` rend
  // la main dès l'en-tête reçu — on lirait un document encore en cours
  // d'analyse, sans son corps.
  const offline = await page.goto('/sports/', { waitUntil: 'domcontentloaded' });
  expect(offline.status(), 'la page doit répondre hors ligne').toBeLessThan(400);

  // Le tableau est prérendu : hors ligne, les scores de la dernière visite
  // doivent rester lisibles, pas seulement le gabarit.
  await expect(page.locator('[data-sports-board]')).toBeAttached({ timeout: 30000 });
  await expect(page.locator('.masthead-inner')).toBeAttached();
  await expect(page.locator('.sports-panel').first()).toBeAttached();

  await context.setOffline(false);

  // Ne pas laisser le worker derrière soi : les autres projets comptent sur
  // un contexte sans service worker.
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  });
});
