import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    // `python3 -m http.server` est MONO-THREAD : il sert une requête à la fois.
    // Avec deux workers qui chargent chacun une page tirant ~20 sous-ressources
    // (app.js 290 ko, style.css 138 ko, news.json 282 ko…), les requêtes font la
    // queue, et sous un runner chargé l'évènement `load` dépasse les 30 s — la
    // signature exacte de la dette D9. On rend donc le serveur concurrent
    // plutôt que d'allonger le moindre délai, ce que cette dette interdit.
    // ThreadingHTTPServer est dans la bibliothèque standard depuis Python 3.7.
    command: "python3 -c \"from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler; ThreadingHTTPServer(('127.0.0.1', 4173), SimpleHTTPRequestHandler).serve_forever()\"",
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
