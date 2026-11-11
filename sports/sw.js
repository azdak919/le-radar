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
   HTML déjà présent, sans aucun fetch. Le cache rend « SPORTS Étudiants »
   utilisable hors ligne, scores compris — ceux de la dernière visite.

   Le document ne reste pas sur cette dernière visite quand le réseau répond.
   Un cache de plus de 20 min attend le serveur (repli cache si ça échoue).
   Un cache récent s'affiche tout de suite ; si le Last-Modified a changé,
   la page se recharge une fois. Sans ça, le 11 nov. 2026 à 14 h 19 l'écran
   montrait encore « 00 h 18 » alors que le serveur était à 13 h 47.
   ═══════════════════════════════════════════════════════ */

importScripts('../scripts/sports-document-refresh.js');

const SHELL_CACHE  = 'sports-shell-v400';
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
  '../style-translate-overlay.css',
  '../sports-load.js',
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
  '../scripts/media-channels-lib.js',
  '../scripts/media-follow-store.js',
  '../scripts/media-follow-ui.js',
  '../scripts/article-card-lib.js',
  '../radar-news.js',
  '../radar-lifecycle.js',
  '../app.js',
  '../engage-prompt.js',
  '../app-sw-register.js',
  '../scripts/sports-document-refresh.js',
  '../sports-board.js',
  '../scripts/sports-date-lib.js',
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

let pendingDocumentToken = '';

function isSportsDocument(request) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  try {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(SCOPE_PATH)) return false;
    const rest = path.slice(SCOPE_PATH.length);
    return rest === '' || rest === 'index.html';
  } catch {
    return false;
  }
}

function rememberDocumentUpdate(token) {
  if (!token) return;
  pendingDocumentToken = token;
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({ type: 'sports-document-updated', token });
    }
  });
}

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'sports-document-status') return;
  if (!pendingDocumentToken || !event.source) return;
  event.source.postMessage({ type: 'sports-document-updated', token: pendingDocumentToken });
});

async function pullSportsDocument(cache, request, cached) {
  const response = await fetch(request);
  if (!isCacheableResponse(response, request)) {
    return { response: cached || response, token: '' };
  }
  const previous = sportsRevisionToken(cached);
  const next = sportsRevisionToken(response);
  await cache.put(request, response.clone());
  return {
    response,
    token: sportsDocumentChanged(previous, next) ? next : '',
  };
}

async function refreshSportsDocument(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const plan = sportsShellPlan({
    hasCache: Boolean(cached),
    cacheAgeMs: sportsCacheAgeMs(cached, Date.now()),
  });
  const pull = pullSportsDocument(cache, request, cached);

  if (plan === 'cache-then-refresh') {
    pull.then((got) => {
      if (got.token) rememberDocumentUpdate(got.token);
    }).catch(() => {});
    return cached;
  }

  if (plan === 'network') {
    try {
      return (await pull).response;
    } catch {
      return new Response('Service unavailable', { status: 503 });
    }
  }

  // Cache trop vieux : attendre le serveur, sinon repeindre l'ancien
  // et recharger quand la copie neuve est enfin en cache.
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 8000);
  });
  try {
    const got = await Promise.race([pull, timeout]);
    if (got) return got.response;
    pull.then((late) => {
      if (late.token) rememberDocumentUpdate(late.token);
    }).catch(() => {});
    return cached;
  } catch {
    return cached || new Response('Service unavailable', { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

async function staleWhileRevalidate(cacheName, request) {
  if (isSportsDocument(request)) return refreshSportsDocument(cacheName, request);

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
