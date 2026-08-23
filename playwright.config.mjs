import { defineConfig } from '@playwright/test';

const port = Number(process.env.PW_PORT || 4173);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // CI : 2 retries anti-flaky (contention runner / réseau) sans masquer un bug
  // local (0 retry hors CI pour feedback immédiat).
  retries: process.env.CI ? 2 : 0,
  // CI : 2 workers pour le lot principal. player-continuity tourne en projet
  // séparé (voir projects) pour ne pas se marcher dessus avec l’audio partagé.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    // Moins de flaky « navigation timeout » sous runner chargé.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'main',
      // Audio multi-onglets + mesures layout masthead/SEO : sensibles à la
      // contention du webServer et au localStorage partagé (D9).
      testIgnore: [
        '**/player-continuity.spec.mjs',
        '**/masthead-weather.spec.mjs',
        '**/masthead-sports-fit.spec.mjs',
        '**/masthead-sidebar-fit.spec.mjs',
        '**/seo-pages.spec.mjs',
        '**/player-routes.spec.mjs',
        '**/shared-chrome.spec.mjs',
        '**/masthead-css-load.spec.mjs',
        '**/mobile-text-wrap.spec.mjs',
        '**/tuner-resize.spec.mjs',
        // Tourne dans le projet « pwa » : il lui faut un service worker actif.
        '**/sports-pwa.spec.mjs',
      ],
    },
    {
      name: 'serial-sensitive',
      testMatch: [
        '**/player-continuity.spec.mjs',
        '**/masthead-weather.spec.mjs',
        '**/masthead-sports-fit.spec.mjs',
        '**/masthead-sidebar-fit.spec.mjs',
        '**/seo-pages.spec.mjs',
        '**/player-routes.spec.mjs',
        '**/shared-chrome.spec.mjs',
        '**/masthead-css-load.spec.mjs',
        '**/mobile-text-wrap.spec.mjs',
        '**/tuner-resize.spec.mjs',
      ],
      fullyParallel: false,
    },
    {
      // /sports/ est installable : prouver son hors-ligne demande un vrai
      // service worker, que les autres projets bloquent volontairement (un SW
      // qui survit entre tests fausse tout le reste de la suite).
      name: 'pwa',
      testMatch: ['**/sports-pwa.spec.mjs'],
      fullyParallel: false,
      use: { serviceWorkers: 'allow' },
    },
  ],
  webServer: {
    // `python3 -m http.server` est MONO-THREAD : il sert une requête à la fois.
    // Avec deux workers qui chargent chacun une page tirant ~20 sous-ressources
    // (app.js 290 ko, style.css 138 ko, news.json 282 ko…), les requêtes font la
    // queue, et sous un runner chargé l'évènement `load` dépasse les 30 s — la
    // signature exacte de la dette D9. On rend donc le serveur concurrent
    // plutôt que d'allonger le moindre délai, ce que cette dette interdit.
    // ThreadingHTTPServer est dans la bibliothèque standard depuis Python 3.7.
    command: `python3 -c "from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler; ThreadingHTTPServer(('127.0.0.1', ${port}), SimpleHTTPRequestHandler).serve_forever()"`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
