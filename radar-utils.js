// LE-RADAR — utilitaires URL / flux / HTML
// Script classique (pas type=module). Les liaisons partagées vivent dans
// radar-state.js (var) ; les function declarations sont globales.



// Proxy CORS optionnel pour les flux HTTP→HTTPS (déployer proxy/cloudflare-worker.js).
// Désactivé volontairement : un proxy audio ferait exploser le free tier CF.
var PROXY_BASE = '';
// Cache + repli météo partagés (workers/weather-cache). le-radar.ca n'est pas
// sur Cloudflare (DNS chez WHC) : pas de domaine personnalisé possible, donc
// sous-domaine workers.dev de compte.
var WEATHER_API_BASE = 'https://le-radar-weather.azdak.workers.dev';
// Métadonnées « à l'antenne » (JSON/XML only — pas l'audio). Cache edge ~60 s.
// workers/nowplaying-cache — évite CORS / 429 sur Triton & co. côté navigateur.
var NOWPLAYING_API_BASE = 'https://le-radar-nowplaying.azdak.workers.dev';

function safeHttpUrl(url, { allowHttp = false } = {}) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol === 'https:') return u.href;
    if (allowHttp && u.protocol === 'http:') return u.href;
    return null;
  } catch {
    return null;
  }
}

/** Écoute 'change' d'une MediaQueryList avec repli addListener (Safari ≤ 13). */
function onMediaQueryChange(mq, handler) {
  if (!mq) return;
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
  else if (typeof mq.addListener === 'function') mq.addListener(handler);
}

function safeCssColor(color) {
  if (!color || typeof color !== 'string') return null;
  const c = color.trim();
  if (c === 'var(--accent)') return c;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(c)) return c;
  return null;
}

function getPlayableStream(radio) {
  if (!radio?.stream) return null;
  const url = radio.stream;
  if (url.startsWith('http:') && location.protocol === 'https:' && !PROXY_BASE) return null;
  if (!PROXY_BASE) return url;
  return `${PROXY_BASE}/?url=${encodeURIComponent(url)}`;
}

function getListenUrl(radio) {
  return radio?.listenUrl || radio?.website || null;
}

function isExternalListen(radio) {
  return !!radio && !getPlayableStream(radio) && !!getListenUrl(radio);
}

function isSecurePageUrl(url = '') {
  return !!safeHttpUrl(url);
}


function appAsset(path) {
  return new URL(path, APP_BASE_URL).href;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
