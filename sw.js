const CACHE_NAME = "radar-shell-v788";
const CACHE_PREFIX = "radar-";
/** Cache permanent : page maintenance / hors-ligne (ne se purge pas au bump shell). */
const OFFLINE_CACHE = "radar-offline-v22";
// Isolated apps under /pomo/, /solitaire/ and /sports/ own their own SWs +
// caches. Sans /sports/ ici, ce worker et sports/sw.js se disputeraient les
// mêmes requêtes : l'app installée servirait tantôt le shell racine, tantôt
// le sien, avec deux copies divergentes de la page en cache.
const ISOLATED_PATH_RE = /\/(pomo|solitaire|sports)(\/|$)/;

const OFFLINE_ASSETS = [
  "./offline.html",
  "./easter-egg.html",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/offline/coin.png",
  "./assets/offline/elevator-loop.opus",
  "./assets/offline/elevator-loop.mp3",
  "./assets/offline/sounds/jump.wav",
  "./assets/offline/sounds/coin.wav",
  "./assets/offline/sounds/hit.wav",
  "./indigenous-mt.json",
];

const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./easter-egg.html",
  "./feeds.html",
  "./feeds-page.js",
  "./style.css",
  "./style-masthead.css",
  "./style-sports-strip.css",
  "./style-masthead-chrome.css",
  "./style-tuner.css",
  "./style-feed.css",
  "./style-chrome.css",
  "./seo-page-theme.js",
  "./dev/wide-desktop-preview.css",
  "./dev/wide-desktop-preview.js",
  "./dev/midwidth-preview.css",
  "./dev/midwidth-preview.js",
  "./embed.css",
  "./embed.js",
  "./tuner-embed.html",
  "./mobile-playback.js",
  "./player-sync.js",
  "./nav-shell.js",
  "./weather-cities-data.js",
  "./radar-utils.js",
  "./radar-state.js",
  "./radar-weather.js",
  "./radar-sports-cta.js",
  "./radar-tuner.js",
  "./radar-news.js",
  "./radar-lifecycle.js",
  "./app.js",
  "./bg-rotation-lib.js",
  "./photo-bank-data.js",
  "./quebec-backgrounds-data.js",
  "./quebec-university-backgrounds-data.js",
  "./quebec-nations-backgrounds-data.js",
  "./quebec-favorites-backgrounds-data.js",
  "./quebec-backgrounds.js",
  "./cast.js",
  "./translate.js",
  "./translate-menu.js",
  "./translate-menu.css",
  "./indigenous-mt.json",
  "./engage-prompt.js",
  "./scripts/session-freshness-lib.js",
  "./scripts/sports-freshness-lib.js",
  "./scripts/season-lib.js",
  "./brand-colors.json",
  "./radios.json",
  "./manifest.json",
  "./assets/icon.svg",
  "./assets/icon-32.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/offline/coin.png",
  "./assets/offline/elevator-loop.opus",
  "./assets/offline/elevator-loop.mp3",
  "./assets/offline/sounds/jump.wav",
  "./assets/offline/sounds/coin.wav",
  "./assets/offline/sounds/hit.wav",
  "./assets/emoji/tomato.png",
  "./assets/emoji/satellite.png",
  "./assets/emoji/playing-cards.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      // Offline d’abord : page + logo PWA + pièces (jouable sans le shell complet)
      caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)),
      caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Purge anciens shells et anciennes versions offline ; l'actuelle
          // reste durablement disponible jusqu'au prochain bump offline.
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              key !== CACHE_NAME &&
              key !== OFFLINE_CACHE
          )
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.origin !== self.location.origin) return;
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

const CACHEABLE_TYPES = /^(text\/html|text\/css|application\/javascript|text\/javascript|application\/json|image\/|font\/|application\/manifest\+json)/i;
const CACHEABLE_EXT = /\.(html?|css|js|json|png|svg|ico|webmanifest|xml|woff2?)$/i;

function isCacheableResponse(response, request) {
  if (!response || !response.ok) return false;
  const type = response.headers.get("content-type") || "";
  if (CACHEABLE_TYPES.test(type)) return true;
  try {
    return CACHEABLE_EXT.test(new URL(request.url).pathname);
  } catch {
    return false;
  }
}

function cacheIfOk(cache, request, response) {
  if (isCacheableResponse(response, request)) {
    cache.put(request, response.clone());
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // Leave isolated mini-apps (Pomodoro / Solitaire) to their own service workers.
  if (ISOLATED_PATH_RE.test(url.pathname)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cacheIfOk(cache, request, clone));
          return networkResponse;
        })
        .catch(() =>
          caches
            .open(OFFLINE_CACHE)
            .then((c) => c.match("./offline.html"))
            .then(
              (r) =>
                r ||
                caches.match("./offline.html") ||
                caches.match("./index.html")
            )
        )
    );
    return;
  }

  // Network-first for HTML shell so masthead/UI updates reach users promptly.
  if (url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cacheIfOk(cache, request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for app code so bugfixes reach users without stale cache.
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cacheIfOk(cache, request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for live data (news.json, radios.json) so content stays fresh.
  if (url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cacheIfOk(cache, request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cacheIfOk(cache, request, responseClone));
        return networkResponse;
      });
    })
  );
});
