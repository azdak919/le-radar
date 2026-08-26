/* ═══════════════════════════════════════════════════════
   SPORTS Étudiants (Le Radar) — Service Worker
   Scope: /sports/ only — isolated from the root radar SW,
   which excludes this path (see ISOLATED_PATH_RE in ../sw.js).
   Strategy:
     • App shell (HTML, icons, manifest)  → stale-while-revalidate
     • Shared root assets (CSS, JS)       → stale-while-revalidate
     • Google Fonts CSS + WOFF2 files     → cache-first
     • Anything else                      → network (untouched)

   POURQUOI CE WORKER EXISTE
   La page est entièrement prérendue : sports-board.js ne fait que filtrer du
   HTML déjà présent, sans aucun fetch. Mettre le shell en cache suffit donc
   à rendre « SPORTS Étudiants » utilisable hors ligne, scores compris — ce
   ceux de la dernière visite, ce que la page indique déjà par sa date de
   mise à jour.
   ═══════════════════════════════════════════════════════ */

const SHELL_CACHE  = 'sports-shell-v189';
const FONT_CACHE   = 'sports-fonts-v1';
const CACHE_PREFIX = 'sports-';
const KNOWN_CACHES = [SHELL_CACHE, FONT_CACHE];

/** Fichiers propres à /sports/. */
const SCOPE_ASSETS = [
  './',
  './index.html',
  './site.webmanifest',
  './favicon.ico',
  './favicon-16x16.png',
  './favicon-32x32.png',
  './favicon-96x96.png',
  './favicon-128x128.png',
  './apple-touch-icon.png',
  './apple-touch-icon-120x120.png',
  './apple-touch-icon-152x152.png',
  './apple-touch-icon-180x180.png',
  './icon-192.png',
  './icon-192-maskable.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './sw.js',
];

/**
 * Ressources partagées vivant à la racine du site.
 *
 * Contrairement à Pomodoro et Solitaire, « Au tableau » ne possède pas son
 * propre système de design : il emprunte celui du site. Sans ces fichiers,
 * l'app installée s'ouvrirait hors ligne sur du HTML non stylé.
 *
 * La portée du worker limite les pages qu'il contrôle, pas ce qu'il peut
 * mettre en cache — précacher hors de /sports/ est donc légitime.
 */
const SHARED_ASSETS = [
  '../style.css',
  '../style-masthead.css',
  '../style-sports-strip.css',
  '../style-masthead-chrome.css',
  '../style-tuner.css',
  '../style-feed.css',
  '../style-chrome.css',
  '../seo-pages.css',
  '../seo-page-theme.js',
  '../dev/wide-desktop-preview.css',
  '../dev/wide-desktop-preview.js',
  '../dev/midwidth-preview.css',
  '../dev/midwidth-preview.js',
  '../nav-shell.js',
  '../cast.js',
  '../mobile-playback.js',
  '../player-sync.js',
  '../institution-acronyms-data.js',
  '../weather-cities-data.js',
  '../radar-utils.js',
  '../radar-state.js',
  '../radar-weather.js',
  '../radar-sports-cta.js',
  '../radar-tuner.js',
  '../radar-news.js',
  '../radar-lifecycle.js',
  '../app.js',
  '../engage-prompt.js',
  '../app-sw-register.js',
  '../sports-board.js',
  '../assets/icon.svg',
  '../assets/icon-32.png',
  '../assets/emoji/satellite.png',
  '../assets/emoji/tomato.png',
  '../assets/emoji/playing-cards.png',
  '../assets/emoji/trophy.png',
];

const SHELL_ASSETS = [...SCOPE_ASSETS, ...SHARED_ASSETS];

/** Chemins absolus des ressources partagées, pour reconnaître leurs requêtes. */
const SHARED_PATHS = new Set(
  SHARED_ASSETS.map((rel) => new URL(rel, self.location.href).pathname),
);

/** Racine de la portée, ex. « /sports/ » (ou « /le-radar/sports/ » sur Pages). */
const SCOPE_PATH = new URL('./', self.location.href).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll est atomique : un seul 404 ferait échouer toute l'installation
      // et laisserait l'app sans worker. On tolère donc les absences.
      .then((cache) => Promise.allSettled(
        SHELL_ASSETS.map((asset) => cache.add(asset)),
      ))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          // On ne purge que nos caches — jamais radar-*, pomo-* ou solitaire-*.
          .filter((k) => k.startsWith(CACHE_PREFIX) && !KNOWN_CACHES.includes(k))
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(FONT_CACHE, request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(SCOPE_PATH) || SHARED_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(SHELL_CACHE, request));
  }
});

const CACHEABLE_TYPES = /^(text\/html|text\/css|application\/javascript|text\/javascript|application\/json|image\/|font\/|application\/manifest\+json)/i;
const CACHEABLE_EXT = /\.(html?|css|js|json|png|jpe?g|svg|ico|webmanifest|xml|woff2?)$/i;

function isCacheableResponse(response, request) {
  if (!response || !response.ok) return false;
  const type = response.headers.get('content-type') || '';
  if (CACHEABLE_TYPES.test(type)) return true;
  try {
    return CACHEABLE_EXT.test(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response, request)) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then((response) => {
    if (isCacheableResponse(response, request)) {
      cache.put(request, response.clone());
      return response;
    }
    return cached || response;
  }).catch(() => cached || new Response('Service unavailable', { status: 503 }));

  return cached || networkFetch;
}
